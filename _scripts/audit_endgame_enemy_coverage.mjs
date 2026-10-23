import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {isEnemyMechanicRegistered} from '../simulator/encounters.mjs';

const root=path.resolve(import.meta.dirname,'..');
const active=JSON.parse(fs.readFileSync(path.join(root,'data','active_database.json'),'utf8'));
const version=active.version;
const dbPath=path.resolve(root,active.database);
const db=new DatabaseSync(dbPath,{readOnly:true});
const aiPath=path.join(root,'data',`enemy_ai_${version}.json`);
const aiIndex=fs.existsSync(aiPath)?JSON.parse(fs.readFileSync(aiPath,'utf8')):{enemies:[]};
const detailMode=process.argv.includes('--detail');
const topArg=process.argv.find(arg=>arg.startsWith('--top='));
const detailTop=Math.max(1,Math.min(20,Number(topArg?.slice(6))||3));
const skillRows=db.prepare('SELECT child_id,skill_id,skill_name,skill_desc,damage_type,sp_hit_base,extra_json FROM monster_skills ORDER BY child_id,skill_id').all();
const childRows=db.prepare('SELECT * FROM monster_childs ORDER BY monster_id,child_id').all();
const baseMonsterByChild=new Map(childRows.map(row=>[row.child_id,row.monster_id]));
const variantsByBase=new Map();
for(const row of childRows){const list=variantsByBase.get(row.monster_id)??[];list.push(row);variantsByBase.set(row.monster_id,list);}
const skillsByChild=new Map();
for(const row of skillRows){if(!row.skill_name)continue;const list=skillsByChild.get(row.child_id)??[];list.push(row);skillsByChild.set(row.child_id,list);}
const aiByKey=new Map((aiIndex.enemies??[]).map(row=>[`${row.mode}:${row.seasonId}:${row.childId}`,row]));
const aiFileByPath=new Map((aiIndex.aiFiles??[]).map(row=>[row.path,row]));

function summarize(mode,seasonId,rows,stageKey){
  const registered=row=>isEnemyMechanicRegistered(row.child_id)||isEnemyMechanicRegistered(row.base_monster_id);
  const childIds=new Set(rows.map(row=>row.child_id));
  const covered=rows.filter(registered);
  const backlog=new Map();
  for(const row of rows){
    if(registered(row))continue;
    const item=backlog.get(row.child_id)??{childId:row.child_id,baseMonsterId:row.base_monster_id,name:row.name,records:0,stages:new Set()};
    item.records++;
    item.stages.add(stageKey(row));
    backlog.set(row.child_id,item);
  }
  return {
    mode,seasonId,records:rows.length,registeredRecords:covered.length,templates:childIds.size,
    registeredTemplates:new Set(covered.map(row=>row.child_id)).size,
    highestPriorityMissing:[...backlog.values()].map(item=>{
      const ai=aiByKey.get(`${mode}:${seasonId}:${item.childId}`)
        ??(aiIndex.enemies??[]).find(row=>row.childId===item.childId);
      const skills=skillsByChild.get(item.childId)??[];
      return {childId:item.childId,name:item.name,records:item.records,stages:[...item.stages],
        baseMonsterId:item.baseMonsterId,skillCount:skills.length,skills:skills.slice(0,3).map(skill=>skill.skill_name),
        aiPath:ai?.aiPath??null};
    }).sort((a,b)=>b.records-a.records||a.childId-b.childId).slice(0,8),
    details:detailMode?[...backlog.values()].sort((a,b)=>b.records-a.records||a.childId-b.childId).slice(0,detailTop).map(item=>{
      const ai=aiByKey.get(`${mode}:${seasonId}:${item.childId}`)
        ??(aiIndex.enemies??[]).find(row=>row.childId===item.childId);
      const aiFile=ai?.aiPath?aiFileByPath.get(ai.aiPath):null;
      return {
        childId:item.childId,baseMonsterId:item.baseMonsterId,name:item.name,records:item.records,stages:[...item.stages],
        appearances:rows.filter(row=>row.child_id===item.childId).map(row=>mode==='anomaly'
          ?{stage:`${row.slot}:${row.seq}`,waveId:row.wave_id,childId:row.child_id}
          :{floorId:row.floor_id,side:row.side,wave:row.wave_index,slot:row.slot,level:row.level,hp:row.hp,speed:row.speed,
            stance:row.stance,toughness:row.toughness,hpCount:row.hp_count,
            phaseRatios:row.phase_ratios_json?JSON.parse(row.phase_ratios_json):null}),
        skills:(skillsByChild.get(item.childId)??[]).map(skill=>({id:skill.skill_id,name:skill.skill_name,
          damageType:skill.damage_type,hitEnergy:skill.sp_hit_base})),
        ai:ai?{path:ai.aiPath,sequence:ai.skillSequence??[],specs:(ai.skillSpecs??[]).map(spec=>({id:spec.id,trigger:spec.trigger,
          attackType:spec.attackType,element:spec.element,hitEnergy:spec.hitEnergy,params:spec.params,phases:spec.phases,effects:spec.extraEffects})),
          decisions:(aiFile?.groups??[]).flatMap(group=>(group.decisions??[]).map(decision=>({phase:group.phase,name:decision.name,
            skills:decision.skills,selectors:decision.selectors,
            predicates:[...new Set((decision.axes??[]).flatMap(axis=>axis.predicates??[]))]})))}:null,
        variants:(variantsByBase.get(item.baseMonsterId)??[]).map(child=>({childId:child.child_id,
          hpRatio:child.hp_modify_ratio,attackRatio:child.attack_modify_ratio,defenceRatio:child.defence_modify_ratio,
          speedRatio:child.speed_modify_ratio,speedAdd:child.speed_modify_value,
          stanceRatio:child.stance_modify_ratio,stanceAdd:child.stance_modify_value,
          eliteGroup:child.elite_group,hardLevelGroup:child.hard_level_group})),
      };
    }):undefined,
  };
}

function reportSceneBlockers(mode,rows,stageKey){
  const scenes=new Map();
  for(const row of rows){
    const key=stageKey(row),scene=scenes.get(key)??[];
    scene.push(row);scenes.set(key,scene);
  }
  const inventory=[...scenes].map(([scene,items])=>{
    const unique=new Map(items.map(row=>[row.child_id,row]));
    const missing=[...unique.values()].filter(row=>!isEnemyMechanicRegistered(row.child_id)&&!isEnemyMechanicRegistered(row.base_monster_id));
    const eventTracks=new Set(items.map(row=>row.event_index).filter(Number.isFinite));
    return {scene,rows:items.length,templates:unique.size,missing,eventTracks:eventTracks.size};
  });
  const registeredOnly=inventory.filter(scene=>scene.missing.length===0);
  const singleTrack=registeredOnly.filter(scene=>scene.eventTracks===1);
  const ranked=inventory.filter(scene=>scene.missing.length)
    .sort((a,b)=>a.missing.length-b.missing.length||a.rows-b.rows||a.scene.localeCompare(b.scene));
  console.log(`  场景盘点：${inventory.length} 个；敌人模板均已登记 ${registeredOnly.length} 个；其中单事件轨道 ${singleTrack.length} 个（登记不等同于机制完整）。`);
  console.log(`  最近可解锁场景（按缺失模板数排序）:`);
  for(const scene of ranked.slice(0,5)){
    const blockers=scene.missing.map(row=>`${row.name}(${row.child_id})`).join('、');
    console.log(`    ${scene.scene}: 缺 ${scene.missing.length}/${scene.templates} 种；${scene.rows} 条敌人行；${scene.eventTracks} 条事件轨道；${blockers}`);
  }
}

const latest=db.prepare('SELECT mode, MAX(CAST(season_id AS INTEGER)) AS season_id FROM abyss_seasons GROUP BY mode').all();
const reports=[];
const sceneReports=[];
for(const season of latest){
  if(!['moc','pf','as'].includes(season.mode))continue;
  const rows=db.prepare(`SELECT a.mode,a.season_id,a.floor_id,a.side,a.event_index,a.wave_index,a.slot,
      a.monster_id AS child_id,COALESCE(c.monster_id,a.base_monster_id) AS base_monster_id,
      a.monster_name AS name,a.level,a.hp,a.speed,a.stance,a.toughness,a.hp_count,a.phase_ratios_json
    FROM abyss_wave_monsters a LEFT JOIN monster_childs c ON c.child_id=a.monster_id
    WHERE a.mode=? AND a.season_id=?
    ORDER BY a.floor_id,a.side,a.event_index,a.wave_index,a.slot`).all(season.mode,season.season_id);
  reports.push(summarize(season.mode,season.season_id,rows,row=>`${row.floor_id}/S${row.side}`));
  sceneReports.push({mode:season.mode,rows,stageKey:row=>`${row.floor_id}/S${row.side}`});
}

const peakPath=path.join(root,'data','databases',`peak_${version}.db`);
if(fs.existsSync(peakPath)){
  const peak=new DatabaseSync(peakPath,{readOnly:true});
  const seasonId=peak.prepare('SELECT MAX(id) AS id FROM season').get()?.id;
  if(seasonId!=null){
    const rows=peak.prepare(`SELECT slot,seq,wave_id,monster_id AS child_id,name_zh AS name
      FROM stage_monster WHERE season_id=? ORDER BY slot,seq,wave_id,monster_id`).all(seasonId)
      .map(row=>({...row,base_monster_id:baseMonsterByChild.get(row.child_id)??row.child_id}));
    reports.push(summarize('anomaly',seasonId,rows,row=>`${row.slot}:${row.seq}/W${row.wave_id}`));
    sceneReports.push({mode:'anomaly',rows,stageKey:row=>`${row.slot}:${row.seq}`});
  }
  peak.close();
}
db.close();

console.log(`HSR ${version} database: ${dbPath}`);
console.log(`AI source index: ${aiPath}`);
for(const item of reports){
  console.log(`${item.mode} ${item.seasonId}: ${item.registeredRecords}/${item.records} rows; ${item.registeredTemplates}/${item.templates} templates registered`);
  for(const enemy of item.highestPriorityMissing){
    const skills=enemy.skills.length?`; skills: ${enemy.skills.join(' / ')}${enemy.skillCount>enemy.skills.length?' …':''}`:'';
    console.log(`  ${enemy.name} (${enemy.childId}) ×${enemy.records} @ ${enemy.stages.join(', ')}; AI ${enemy.aiPath??'未索引'}${skills}`);
  }
  for(const enemy of item.details??[])console.log(`  DETAIL ${JSON.stringify({...enemy,mode:item.mode,seasonId:item.seasonId})}`);
}
for(const item of sceneReports)reportSceneBlockers(item.mode,item.rows,item.stageKey);

// Rank shared implementation targets by the number of playable side scenes
// they block, then by raw appearances. This avoids choosing work from one
// enemy at a time without seeing how many scenes the same template affects.
if(process.argv.includes('--ranked')){
  const families=new Map();
  for(const {mode,rows,stageKey} of sceneReports){
    const byScene=new Map();
    for(const row of rows){const key=stageKey(row),items=byScene.get(key)??[];items.push(row);byScene.set(key,items);}
    for(const [scene,items] of byScene){
      for(const row of new Map(items.map(item=>[item.child_id,item])).values()){
        if(isEnemyMechanicRegistered(row.child_id)||isEnemyMechanicRegistered(row.base_monster_id))continue;
        const key=`${mode}:${row.base_monster_id}`,item=families.get(key)??{
          mode,baseMonsterId:row.base_monster_id,name:row.name,children:new Set(),records:0,scenes:new Set()};
        item.children.add(row.child_id);item.records+=items.filter(other=>other.child_id===row.child_id).length;
        item.scenes.add(scene);families.set(key,item);
      }
    }
  }
  console.log('数据库优先级（按可解除的侧场景数、出场次数排序；登记不代表行为完整）：');
  const ranked=[...families.values()].sort((a,b)=>b.scenes.size-a.scenes.size||b.records-a.records||a.baseMonsterId-b.baseMonsterId);
  for(const item of ranked.slice(0,20)){
    const children=[...item.children].sort((a,b)=>a-b),ai=children.map(id=>aiByKey.get(`${item.mode}:${reports.find(r=>r.mode===item.mode)?.seasonId}:${id}`)
      ??(aiIndex.enemies??[]).find(row=>row.childId===id)).find(Boolean);
    console.log(`  ${item.mode} · ${item.name} (${item.baseMonsterId}; 子模板 ${children.join('/')})：阻塞 ${item.scenes.size} 个侧场景、${item.records} 条出场记录；AI ${ai?.aiPath??'未索引'}；${[...item.scenes].join(', ')}`);
  }
}
