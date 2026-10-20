// Project stored engine snapshots; never reroll RNG or read the edited configuration.
export function replayStops(result,granularity='event'){
  if(granularity==='action')return result.log.map((e,i)=>['battle_start','action_end','turn_end','battle_end'].includes(e.type)?i:-1).filter(i=>i>=0);
  return result.log.map((_,i)=>i);
}
export function replayAt(result,index){
  const cursor=Math.max(0,Math.min(result.log.length-1,Math.trunc(index)||0)),event=result.log[cursor];
  if(!event?.frame)throw new Error('日志缺少逐事件快照，请重新运行战斗以生成可视回放');
  const config=result.config,definitions=[...config.units,...result.log.slice(0,cursor+1).flatMap(e=>[...(e.frame?.units??[]),...(e.frame?.summons??[])])].reduce((map,u)=>map.set(u.id,{...map.get(u.id),...u}),new Map()),side=new Map([...definitions.values()].map(u=>[u.id,u.side??'ally'])),totals={ally:0,enemy:0,healing:0,absorbed:0},series=[{av:0,ally:0,enemy:0}];
  const actors=new Map(config.units.filter(u=>u.side==='ally').map(u=>[u.id,{id:u.id,damage:0,hpDamage:0}]));
  let actionStart=-1,lastDamage=null;
  for(let i=0;i<=cursor;i++){const e=result.log[i];if(e.type==='action')actionStart=i;
    if(e.type==='damage'){lastDamage=e;totals[side.get(e.actor)==='ally'?'ally':'enemy']+=e.damage;totals.absorbed+=e.absorbed??0;let id=e.actor;const seen=new Set();while(!actors.has(id)&&definitions.has(id)&&!seen.has(id)){seen.add(id);id=definitions.get(id).owner??definitions.get(id).memospriteOwner;}const actor=actors.get(id);if(actor){actor.damage+=e.damage;actor.hpDamage+=e.hpDamage??0;}series.push({av:e.av,ally:totals.ally,enemy:totals.enemy});}
    if(e.type==='heal')totals.healing+=e.amount;
  }
  const action=actionStart<0?null:result.log[actionStart],actionEvents=actionStart<0?[]:result.log.slice(actionStart,cursor+1).filter(e=>e.frame?.action?.sequence===actionStart);
  // A segment can strike several targets. Keep it as one animation segment and
  // account for triggered damage separately, without reading future log entries.
  const segments=new Map(),triggered=[];
  for(const e of actionEvents.filter(e=>e.type==='damage')){
    if(e.segment==null){triggered.push(e);continue;}
    if(!segments.has(e.segment))segments.set(e.segment,{index:e.segment,damage:0,hits:[]});
    const row=segments.get(e.segment);row.damage+=e.damage;row.hits.push({actor:e.actor,target:e.target,damage:e.damage,critMode:e.critMode});
  }
  return {cursor,event,frame:event.frame,totals,contributions:[...actors.values()],action,actionEvents,lastDamage,series,
    segments:[...segments.values()],triggered,actionComplete:actionEvents.some(e=>e.type==='action_end'),
    skillDamage:[...segments.values()].reduce((n,s)=>n+s.damage,0),triggeredDamage:triggered.reduce((n,e)=>n+e.damage,0),
    actionDamage:actionEvents.filter(e=>e.type==='damage').reduce((sum,e)=>sum+e.damage,0)};
}
