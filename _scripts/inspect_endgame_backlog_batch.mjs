import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {isEnemyMechanicRegistered} from '../simulator/encounters.mjs';

const root=path.resolve(import.meta.dirname,'..');
const active=JSON.parse(fs.readFileSync(path.join(root,'data','active_database.json'),'utf8'));
const version=active.version,db=new DatabaseSync(path.resolve(root,active.database),{readOnly:true});
const anomalyDbPath=path.join(root,'data','databases',`peak_${version}.db`);
const aiPath=path.join(root,'data',`enemy_ai_${version}.json`);
const aiIndex=fs.existsSync(aiPath)?JSON.parse(fs.readFileSync(aiPath,'utf8')):{enemies:[]};
const modeArg=process.argv.find(arg=>arg.startsWith('--mode='))?.slice(7)??'pf';
const topArg=Number(process.argv.find(arg=>arg.startsWith('--top='))?.slice(6)??12);
const top=Math.max(1,Math.min(100,Number.isFinite(topArg)?Math.floor(topArg):12));

const childRows=db.prepare('SELECT child_id,monster_id FROM monster_childs').all();
const baseByChild=new Map(childRows.map(row=>[row.child_id,row.monster_id]));
const skillRows=db.prepare(`SELECT child_id,skill_id,skill_name,skill_desc,damage_type,sp_hit_base,extra_json
  FROM monster_skills ORDER BY child_id,skill_id`).all();
const skillsByChild=new Map();
for(const row of skillRows){
  const list=skillsByChild.get(row.child_id)??[];list.push(row);skillsByChild.set(row.child_id,list);
}
const aiByChild=new Map();
for(const row of aiIndex.enemies??[]){
  const list=aiByChild.get(row.childId)??[];list.push(row);aiByChild.set(row.childId,list);
}
const sequenceIds=sequence=>(sequence??[]).map(step=>{
  if(typeof step==='number')return step;
  if(!step||typeof step!=='object')return step;
  const values=Object.values(step).filter(value=>Number.isFinite(value));
  return values.length===1?values[0]:step;
});

const latest=db.prepare('SELECT mode,MAX(CAST(season_id AS INTEGER)) AS season_id FROM abyss_seasons GROUP BY mode').all()
  .filter(row=>row.mode===modeArg);
if(!['moc','pf','as','anomaly'].includes(modeArg))throw new Error(`未知终局模式 ${modeArg}`);
if(!latest.length&&modeArg!=='anomaly')throw new Error(`数据库中没有模式 ${modeArg}`);

const candidates=new Map();
for(const season of latest){
  const rows=db.prepare(`SELECT a.monster_id AS child_id,COALESCE(c.monster_id,a.base_monster_id) AS base_id,
      a.monster_name AS name,a.floor_id,a.side,a.wave_index,a.infinite_wave_id,a.spawn_count,a.is_infinite,
      a.level,a.hp,a.speed,a.toughness,a.weaknesses_json
    FROM abyss_wave_monsters a LEFT JOIN monster_childs c ON c.child_id=a.monster_id
    WHERE a.mode=? AND CAST(a.season_id AS INTEGER)=?
    ORDER BY a.floor_id,a.side,a.event_index,a.wave_index,a.slot`).all(season.mode,season.season_id);
  for(const row of rows){
    if(isEnemyMechanicRegistered(row.child_id)||isEnemyMechanicRegistered(row.base_id))continue;
    const key=`${season.mode}:${row.base_id}`;
    const item=candidates.get(key)??{mode:season.mode,seasonId:season.season_id,baseId:row.base_id,name:row.name,
      records:0,scenes:new Set(),children:new Map(),sourceRows:[]};
    item.records++;item.scenes.add(`${row.floor_id}/S${row.side}`);item.sourceRows.push(row);
    item.children.set(row.child_id,(item.children.get(row.child_id)??0)+1);candidates.set(key,item);
  }
}
if(modeArg==='anomaly'){
  if(!fs.existsSync(anomalyDbPath))throw new Error(`找不到异相仲裁数据库 ${anomalyDbPath}`);
  const peak=new DatabaseSync(anomalyDbPath,{readOnly:true});
  const seasonId=peak.prepare('SELECT MAX(id) AS id FROM season').get()?.id;
  if(seasonId!=null){
    for(const row of peak.prepare(`SELECT slot,seq,wave_id,monster_id AS child_id,name_zh AS name
      FROM stage_monster WHERE season_id=? ORDER BY slot,seq,wave_id,monster_id`).all(seasonId)){
      const baseId=baseByChild.get(row.child_id)??row.child_id;
      if(isEnemyMechanicRegistered(row.child_id)||isEnemyMechanicRegistered(baseId))continue;
      const key=`anomaly:${baseId}`;
      const item=candidates.get(key)??{mode:'anomaly',seasonId,baseId,name:row.name,records:0,
        scenes:new Set(),children:new Map(),sourceRows:[]};
      item.records++;item.scenes.add(`${row.slot}:${row.seq}`);item.sourceRows.push({...row,base_id:baseId});
      item.children.set(row.child_id,(item.children.get(row.child_id)??0)+1);candidates.set(key,item);
    }
  }
  peak.close();
}

const result=[...candidates.values()].sort((a,b)=>b.scenes.size-a.scenes.size||b.records-a.records||a.baseId-b.baseId)
  .slice(0,top).map(item=>{
    const children=[...item.children.keys()].sort((a,b)=>a-b);
    const skills=children.flatMap(childId=>(skillsByChild.get(childId)??[]).map(row=>({childId,id:row.skill_id,name:row.skill_name,
      description:row.skill_desc,element:row.damage_type,hitEnergy:row.sp_hit_base,extra:row.extra_json??null})));
    const ai=children.flatMap(childId=>aiByChild.get(childId)??[]);
    const aiPaths=[...new Map(ai.map(row=>[row.aiPath,row])).values()].map(row=>({path:row.aiPath,
      sequence:sequenceIds(row.skillSequence),skillSpecs:(row.skillSpecs??[]).map(spec=>({id:spec.id,trigger:spec.trigger,
        type:spec.attackType,element:spec.element,hitEnergy:spec.hitEnergy,params:spec.params,effects:spec.extraEffects})),
      decisions:(aiIndex.aiFiles??[]).find(file=>file.path===row.aiPath)?.groups?.flatMap(group=>(group.decisions??[]).map(decision=>({
        phase:group.phase,name:decision.name,skills:decision.skills,selectors:decision.selectors,
        predicates:[...new Set((decision.axes??[]).flatMap(axis=>axis.predicates??[]))]})))??[]}));
    const rows=item.sourceRows.map(row=>modeArg==='anomaly'
      ?{childId:row.child_id,scene:`${row.slot}:${row.seq}`,waveId:row.wave_id}
      :{childId:row.child_id,scene:`${row.floor_id}/S${row.side}`,wave:row.wave_index,
        infiniteWaveId:row.infinite_wave_id,count:row.spawn_count,infinite:!!row.is_infinite,
        level:row.level,hp:row.hp,speed:row.speed,toughness:row.toughness});
    return {mode:item.mode,seasonId:item.seasonId,name:item.name,baseId:item.baseId,children,scenes:item.scenes.size,
      records:item.records,sceneList:[...item.scenes],rows,skills,aiPaths,
      dataSignals:{namedSkills:skills.filter(skill=>skill.name).length,skillCount:skills.length,
        indexedAI:ai.length>0,nonEmptyParams:ai.flatMap(row=>row.skillSpecs??[]).filter(spec=>Array.isArray(spec.params)&&spec.params.length).length,
        decisionCount:aiPaths.reduce((sum,row)=>sum+row.decisions.length,0)}};
  });

if(process.argv.includes('--summary')){
  const sourceDbPath=modeArg==='anomaly'?anomalyDbPath:path.resolve(root,active.database);
  console.log(`HSR ${version} · ${modeArg} · 未登记模板批量核对（DB ${sourceDbPath}）`);
  for(const item of result){
    const skills=item.skills.map(skill=>`${skill.id}:${skill.name||'无名'}`).join(' / ')||'无技能行';
    const ai=item.aiPaths.map(ai=>`${ai.path} seq=${JSON.stringify(ai.sequence)} params=${ai.skillSpecs.map(spec=>`${spec.id}:${JSON.stringify(spec.params)}`).join(',')}`).join(' | ')||'无 AI 索引';
    console.log(`${item.name} (${item.baseId}; 子体 ${item.children.join('/')}) · 阻塞 ${item.scenes} 侧/${item.records} 行 · ${item.sceneList.join(', ')} · ${skills} · ${ai}`);
  }
}else console.log(JSON.stringify({database:modeArg==='anomaly'?anomalyDbPath:path.resolve(root,active.database),version,mode:modeArg,aiSource:aiPath,candidates:result},null,2));
db.close();
