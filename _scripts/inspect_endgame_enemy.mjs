import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {isEnemyMechanicRegistered} from '../simulator/encounters.mjs';

const root=path.resolve(import.meta.dirname,'..');
const decodeJsonColumns=row=>row&&Object.fromEntries(Object.entries(row).map(([key,value])=>{
  if(!key.endsWith('_json')||typeof value!=='string')return [key,value];
  try{return [key,JSON.parse(value)];}catch{return [key,value];}
}));
const summaryMode=process.argv.includes('--summary');
const inputId=Number(process.argv.slice(2).find(arg=>!arg.startsWith('--')));
if(!Number.isSafeInteger(inputId)||inputId<=0){
  console.error('用法：node _scripts/inspect_endgame_enemy.mjs <monsterId|childId> [--summary]');
  process.exitCode=2;
}else{
  const active=JSON.parse(fs.readFileSync(path.join(root,'data','active_database.json'),'utf8'));
  const version=active.version,db=new DatabaseSync(path.resolve(root,active.database),{readOnly:true});
  const directChild=db.prepare('SELECT * FROM monster_childs WHERE child_id=?').get(inputId);
  const parentId=directChild?.monster_id??inputId;
  const base=db.prepare('SELECT * FROM monsters WHERE id=?').get(parentId);
  const children=db.prepare('SELECT * FROM monster_childs WHERE monster_id=? ORDER BY child_id').all(parentId);
  const childIds=children.length?children.map(row=>row.child_id):[inputId];
  const skillRows=childIds.flatMap(childId=>db.prepare(
    'SELECT child_id,monster_id,skill_id,skill_name,skill_desc,damage_type,sp_hit_base,extra_json FROM monster_skills WHERE child_id=? ORDER BY skill_id'
  ).all(childId));
  const skillsByChild=new Map();
  for(const skill of skillRows){const list=skillsByChild.get(skill.child_id)??[];list.push(skill);skillsByChild.set(skill.child_id,list);}
  const aiIndexPath=path.join(root,'data',`enemy_ai_${version}.json`);
  const aiIndex=fs.existsSync(aiIndexPath)?JSON.parse(fs.readFileSync(aiIndexPath,'utf8')):{enemies:[]};
  const latest=db.prepare('SELECT mode,MAX(CAST(season_id AS INTEGER)) AS season_id FROM abyss_seasons GROUP BY mode').all();
  const appearances=[];
  const placeholders=childIds.map(()=>'?').join(',');
  const appearanceQuery=db.prepare(`SELECT mode,season_id,floor_id,side,event_index,wave_index,slot,monster_id,base_monster_id,
      monster_name,level,hp,speed,stance,status_res,toughness,weaknesses_json,spawn_count,is_infinite,infinite_wave_id,hp_formula_json
    FROM abyss_wave_monsters WHERE mode=? AND CAST(season_id AS INTEGER)=?
      AND (monster_id IN (${placeholders}) OR base_monster_id=?) ORDER BY floor_id,side,event_index,wave_index,slot`);
  for(const season of latest){
    for(const row of appearanceQuery.all(season.mode,season.season_id,...childIds,parentId)){
      appearances.push({...row,registered:isEnemyMechanicRegistered(row.monster_id)||isEnemyMechanicRegistered(row.base_monster_id)});
    }
  }
  const seasonRules=latest.map(season=>decodeJsonColumns(db.prepare(`SELECT mode,season_id,name,buff_name,buff_desc,buff_params_json,
      option_json,sub_option_json FROM abyss_seasons WHERE mode=? AND CAST(season_id AS INTEGER)=?`)
    .get(season.mode,season.season_id))).filter(Boolean);
  const seenRegularScenes=new Set(),regularSceneRules=[];
  for(const appearance of appearances){
    const key=`${appearance.mode}:${appearance.season_id}:${appearance.floor_id}:S${appearance.side}`;
    if(seenRegularScenes.has(key))continue;
    seenRegularScenes.add(key);
    const floor=decodeJsonColumns(db.prepare(`SELECT mode,season_id,floor_id,floor_name,is_boss,hard_name,challenge_json,
        damage_types_json,maze_group_id,boss_monster_id,npc_monster_ids_json,tags_json,buffs_json,phase_json,maze_group_id2,boss_skill_json
      FROM abyss_floors WHERE mode=? AND CAST(season_id AS INTEGER)=? AND floor_id=?`)
      .get(appearance.mode,appearance.season_id,appearance.floor_id));
    const buffs=db.prepare(`SELECT buff_index,name,desc,params_json FROM abyss_buffs
      WHERE mode=? AND CAST(season_id AS INTEGER)=? AND floor_id=? ORDER BY buff_index`)
      .all(appearance.mode,appearance.season_id,appearance.floor_id).map(decodeJsonColumns);
    const tags=db.prepare(`SELECT tag_index,name,desc,params_json,child_json FROM abyss_tags
      WHERE mode=? AND CAST(season_id AS INTEGER)=? AND floor_id=? ORDER BY tag_index`)
      .all(appearance.mode,appearance.season_id,appearance.floor_id).map(decodeJsonColumns);
    const events=db.prepare(`SELECT side,event_index,stage_id,level,hard_level_group,elite_group,waves_json FROM abyss_events
      WHERE mode=? AND CAST(season_id AS INTEGER)=? AND floor_id=? AND side=? ORDER BY event_index`)
      .all(appearance.mode,appearance.season_id,appearance.floor_id,appearance.side).map(decodeJsonColumns);
    regularSceneRules.push({mode:appearance.mode,seasonId:appearance.season_id,floorId:appearance.floor_id,side:appearance.side,
      floor,buffs,tags,events});
  }
  const peakPath=path.join(root,'data','databases',`peak_${version}.db`),peakAppearances=[];
  let anomalySeason=null,anomalyBossConfig=null;
  const anomalySceneRules=[];
  if(fs.existsSync(peakPath)){
    const peak=new DatabaseSync(peakPath,{readOnly:true});
    const latestPeak=peak.prepare('SELECT MAX(id) AS id FROM season').get()?.id;
    if(latestPeak!=null){
      anomalySeason=decodeJsonColumns(peak.prepare('SELECT * FROM season WHERE id=?').get(latestPeak));
      anomalyBossConfig=decodeJsonColumns(peak.prepare('SELECT * FROM boss_config WHERE season_id=?').get(latestPeak));
      const peakPlaceholders=childIds.map(()=>'?').join(',');
      peakAppearances.push(...peak.prepare(`SELECT slot,seq,wave_id,monster_id,name_zh FROM stage_monster
        WHERE season_id=? AND monster_id IN (${peakPlaceholders}) ORDER BY slot,seq,wave_id`).all(latestPeak,...childIds));
      const seenAnomalyStages=new Set();
      for(const appearance of peakAppearances){
        const key=`${appearance.slot}:${appearance.seq}`;
        if(seenAnomalyStages.has(key))continue;
        seenAnomalyStages.add(key);
        const stage=decodeJsonColumns(peak.prepare('SELECT * FROM stage WHERE season_id=? AND slot=? AND seq=?').get(latestPeak,appearance.slot,appearance.seq));
        const waves=peak.prepare('SELECT * FROM stage_wave WHERE season_id=? AND slot=? AND seq=? ORDER BY wave_id')
          .all(latestPeak,appearance.slot,appearance.seq).map(decodeJsonColumns);
        const tags=peak.prepare('SELECT * FROM stage_tag WHERE season_id=? AND slot=? AND seq=? ORDER BY tag_id')
          .all(latestPeak,appearance.slot,appearance.seq).map(decodeJsonColumns);
        const monsters=peak.prepare('SELECT * FROM stage_monster WHERE season_id=? AND slot=? AND seq=? ORDER BY wave_id,monster_id')
          .all(latestPeak,appearance.slot,appearance.seq);
        anomalySceneRules.push({slot:appearance.slot,seq:appearance.seq,stage,waves,tags,monsters});
      }
    }
    peak.close();
  }
  const aiRecords=(aiIndex.enemies??[]).filter(row=>childIds.includes(row.childId)||row.templateId===parentId);
  const aiSources=[...new Map(aiRecords.map(row=>[row.aiPath,row])).values()].map(row=>({
    mode:row.mode,seasonId:row.seasonId,templateId:row.templateId,aiPath:row.aiPath,
    variants:aiRecords.filter(other=>other.aiPath===row.aiPath).map(other=>other.childId),
    skillList:row.skillList,skillSequence:row.skillSequence,
    skillSpecs:(row.skillSpecs??[]).map(({id,trigger,attackType,element,hitEnergy,params,phases,modifiers,extraEffects})=>
      ({id,trigger,attackType,element,hitEnergy,params,phases,modifiers,extraEffects}))
  }));
  const childrenReport=children.map(child=>{
    const ai=aiRecords.find(row=>row.childId===child.child_id)??null;
    return {child,...(skillsByChild.has(child.child_id)?{skills:skillsByChild.get(child.child_id)}:{skills:[]}),aiPath:ai?.aiPath??null};
  });
  const result={database:path.resolve(root,active.database),version,aiSourceRef:aiIndex.source?.ref??null,
    query:{inputId,parentId,registered:isEnemyMechanicRegistered(inputId)||isEnemyMechanicRegistered(parentId)},
    monster:base??null,baseStats:db.prepare('SELECT * FROM monster_stats WHERE monster_id=?').get(parentId)??null,
    children:childrenReport,aiSources,seasonRules,latestEndgameAppearances:appearances,regularSceneRules,
    anomalySeason,anomalyBossConfig,latestAnomalyAppearances:peakAppearances,anomalySceneRules};
  db.close();
  if(summaryMode){
    const summary={database:result.database,version:result.version,aiSourceRef:result.aiSourceRef,query:result.query,
      monster:result.monster&&{id:result.monster.id,name:result.monster.name,nameEn:result.monster.name_en,rank:result.monster.rank},
      baseStats:result.baseStats,
      children:result.children.map(({child,skills,aiPath})=>({childId:child.child_id,hpRatio:child.hp_modify_ratio,
        attackRatio:child.attack_modify_ratio,defenceRatio:child.defence_modify_ratio,speedRatio:child.speed_modify_ratio,
        stanceRatio:child.stance_modify_ratio,weaknesses:decodeJsonColumns({weak_json:child.stance_weak_json})?.weak_json,
        resistances:decodeJsonColumns({res_json:child.damage_type_resistance_json})?.res_json,aiPath})),
      skills:[...new Map(result.children.flatMap(child=>child.skills).filter(skill=>skill.skill_name)
        .map(({skill_id,skill_name,skill_desc,damage_type,sp_hit_base})=>[
          `${skill_id}:${skill_desc}`,{id:skill_id,name:skill_name,description:skill_desc,element:damage_type,hitEnergy:sp_hit_base}])).values()],
      aiSources:result.aiSources.map(({mode,seasonId,templateId,aiPath,skillSpecs})=>({mode,seasonId,templateId,aiPath,skillSpecs})),
      appearances:result.latestEndgameAppearances.map(({mode,season_id,floor_id,side,event_index,wave_index,slot,monster_id,monster_name,level,hp,speed,stance,toughness,weaknesses_json,spawn_count,is_infinite,infinite_wave_id,hp_formula_json})=>
        ({mode,seasonId:season_id,floorId:floor_id,side,event:event_index,
          wave:is_infinite===1?null:wave_index,templateGroupIndex:is_infinite===1?wave_index:null,
          slot,monsterId:monster_id,name:monster_name,
          level,hp,speed,stance,toughness,weaknesses:JSON.parse(weaknesses_json??'[]'),spawnCount:spawn_count,
          isInfinite:is_infinite===1,infiniteWaveId:infinite_wave_id==null?null:String(infinite_wave_id),
          hpFormula:JSON.parse(hp_formula_json??'null')})),
      sceneEvents:result.regularSceneRules.map(scene=>({mode:scene.mode,seasonId:scene.seasonId,floorId:scene.floorId,side:scene.side,
        events:scene.events.map(event=>({event:event.event_index,stageId:event.stage_id,level:event.level,eliteGroup:event.elite_group,waves:event.waves_json})),
        phaseRules:(scene.floor?.phase_json?.[String(Number(scene.side)-1)]?.boss_monster_config??null)&&(()=>{
          const phase=scene.floor.phase_json[String(Number(scene.side)-1)].boss_monster_config;
          return {difficulty:phase.difficulty,difficultyList:phase.difficulty_list,
            tags:(phase.tag_list??[]).map(({name,desc,param,skill_id})=>({name,description:desc,params:param,skillId:skill_id})),
            phases:(phase.phase_list??[]).map(({name,desc,answer,difficulty,skill_list})=>({name,description:desc,answer,difficulty,skills:skill_list})),
            difficultyGuides:phase.difficulty_guide_list??[],textGuides:phase.text_guide_list??[]};
        })()}))};
    console.log(JSON.stringify(summary,null,2));
  }else console.log(JSON.stringify(result,null,2));
}
