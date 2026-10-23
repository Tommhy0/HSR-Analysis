// Independently scheduled extra actions. Callers supply source-verified delays;
// this layer does not guess any character's event spacing or lifecycle.
export function actionEventRuntime({record,execute,live,isFrozen}){
  const owner=(b,id)=>b.units.find(u=>u.id===id);
  const positive=(n,label)=>{if(!Number.isFinite(n)||n<=0)throw Error(label+'必须为正数');return n;};
  const ownerLive=u=>!!u&&live(u);
  const active=b=>(b.actionEvents??[]).filter(e=>e.active&&ownerLive(owner(b,e.owner)));
  const suspended=(b,u)=>active(b).some(e=>e.owner===u.id&&e.suspendNormalGauge);
  function schedule(b,ownerId,specs,options={}){
    const u=owner(b,ownerId);if(!ownerLive(u))throw Error('行动事件拥有者不存在或已退场');
    if(!Array.isArray(specs)||!specs.length)throw Error('行动事件列表不能为空');
    const ids=new Set([...b.units,...b.summons,...(b.actionEvents??[])].map(x=>x.id));
    let sequence=b.actionEventSequence??0;
    const events=specs.map(s=>{
      const id=s.id??ownerId+':action-event:'+(++sequence);
      if(typeof id!=='string'||!id||ids.has(id))throw Error('行动事件ID重复或无效');ids.add(id);
      if(typeof s.key!=='string'||!u.actions[s.key])throw Error('行动事件动作未登记');
      const speed=positive(s.speed,'行动事件速度'),distance=s.distance??10000;
      if(!Number.isFinite(distance)||distance<0)throw Error('行动事件距离无效');
      return {id,name:s.name??u.actions[s.key].name??s.key,owner:ownerId,side:u.side,key:s.key,targetId:s.targetId??null,
        speed,distance,initialDistance:distance,group:options.group??null,suspendNormalGauge:options.suspendNormalGauge!==false,
        redirectAdvance:options.redirectAdvance===true,noWaveReset:options.noWaveReset===true,ignoreFrozen:s.ignoreFrozen===true,active:true,
        kind:'action_event',order:b.units.length+b.summons.length+(b.actionEvents?.length??0)+ids.size};
    });
    b.actionEventSequence=sequence;(b.actionEvents??=[]).push(...events);
    record(b,'action_event_schedule',u,{name:'独立行动事件入列',events:events.map(e=>e.id)});return events;
  }
  function cancel(b,ownerId,group=null){
    const matches=(b.actionEvents??[]).filter(e=>e.active&&e.owner===ownerId&&(group===null||e.group===group));
    for(const e of matches)e.active=false;
    if(matches.length)record(b,'action_event_cancel',owner(b,ownerId),{name:'取消独立行动事件',events:matches.map(e=>e.id)});
    return matches.length;
  }
  function updateSpeed(b,ownerId,speed,group=null){
    positive(speed,'行动事件速度');let changed=0;
    for(const e of active(b))if(e.owner===ownerId&&(group===null||e.group===group)){e.speed=speed;changed++;}
    return changed;
  }
  function redirect(b,id){
    return active(b).filter(e=>e.owner===id&&e.redirectAdvance).sort((a,c)=>a.distance/a.speed-c.distance/c.speed||a.order-c.order)[0];
  }
  function cleanup(b){for(const e of b.actionEvents??[])if(e.active&&!ownerLive(owner(b,e.owner)))cancel(b,e.owner);}
  function dispatch(b,e){
    if(!e.active)return;e.active=false;
    const u=owner(b,e.owner);if(!ownerLive(u))return;
    const previous=b.turnActor;b.turnActor=u.id;b.currentActionEvent=e;
    let executed=false,skipped=null;
    try{
      record(b,'action_event_start',u,{name:e.name,eventId:e.id,kind:'extra'});
      if(!e.ignoreFrozen&&isFrozen(u)){skipped='frozen';record(b,'skip',u,{name:'冻结 · 无法执行行动事件',kind:'extra'});}
      else if(b.rules.actionEventStart?.(b,u,e)===false)skipped='module';
      else {execute(b,u,e);executed=true;}
      b.rules.actionEventEnd?.(b,u,e,{executed,skipped});
      record(b,'action_event_end',u,{name:e.name,eventId:e.id,kind:'extra',executed,skipped});
    }finally{b.turnActor=previous??null;b.currentActionEvent=null;}
  }
  return {active,suspended,schedule,cancel,updateSpeed,redirect,cleanup,dispatch};
}
