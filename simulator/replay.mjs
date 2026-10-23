import {battleActorIndex,battleOwnerId} from './stats.mjs';
// Project stored engine snapshots; never reroll RNG or read the edited configuration.
export function replayStops(result,granularity='event'){
  if(granularity==='action'){
    let actionsThisTurn=0;
    return result.log.map((e,i)=>{
      if(e.type==='turn_start')actionsThisTurn=0;
      if(e.type==='action')actionsThisTurn++;
      return ['battle_start','action_end','battle_end'].includes(e.type)||e.type==='turn_end'&&!actionsThisTurn?i:-1;
    }).filter(i=>i>=0);
  }
  return result.log.map((_,i)=>i);
}
export function replayAt(result,index){
  const cursor=Math.max(0,Math.min(result.log.length-1,Math.trunc(index)||0)),event=result.log[cursor];
  if(!event?.frame)throw new Error('日志缺少逐事件快照，请重新运行战斗以生成可视回放');
  const config=result.config,units=battleActorIndex(result),totals={ally:0,enemy:0,healing:0,absorbed:0},series=[{av:0,ally:0,enemy:0}];
  const actors=new Map(config.units.filter(u=>u.side==='ally'&&!u.memospriteOwner).map(u=>[u.id,{id:u.id,damage:0,hpDamage:0}]));
  let actionStart=-1,lastDamage=null;
  for(let i=0;i<=cursor;i++){const e=result.log[i];if(e.type==='action')actionStart=i;
    if(e.type==='damage'){
      lastDamage=e;const side=units.get(e.actor)?.side,targetSide=units.get(e.target)?.side;
      if(side&&targetSide&&side!==targetSide)totals[side]+=e.damage;
      totals.absorbed+=e.absorbed??0;
      const actor=targetSide==='enemy'?actors.get(battleOwnerId(units,e.actor)):null;
      if(actor){actor.damage+=e.damage;actor.hpDamage+=e.hpDamage??0;}
      series.push({av:e.av,ally:totals.ally,enemy:totals.enemy});
    }
    if(e.type==='heal')totals.healing+=e.amount;
  }
  // A nested action can finish and return to its parent. The current snapshot (or
  // latest completed action snapshot) identifies which action the step belongs to.
  const currentSequence=event.frame.action?.sequence;
  if(Number.isInteger(currentSequence)&&result.log[currentSequence]?.type==='action')actionStart=currentSequence;
  else for(let i=cursor;i>=0;i--){const e=result.log[i];if(e.type!=='action_end')continue;const sequence=e.frame?.action?.sequence;if(Number.isInteger(sequence)&&result.log[sequence]?.type==='action')actionStart=sequence;break;}
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
