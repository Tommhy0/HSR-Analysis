export function battleActorIndex(result){
  const actors=new Map([...result.config.units,...(result.actors??[])].map(u=>[u.id,u]));
  // Old replays have no runtime actor table; summon events still preserve ownership.
  for(const e of result.log)if(e.type==='summon'&&e.target&&!actors.has(e.target)){
    const owner=actors.get(e.actor);if(owner)actors.set(e.target,{id:e.target,side:owner.side,memospriteOwner:e.actor});
  }
  return actors;
}
export function battleOwnerId(actors,id){const seen=new Set();while(actors.get(id)?.memospriteOwner&&!seen.has(id)){seen.add(id);id=actors.get(id).memospriteOwner;}return id;}
// Every ally contributes to the same team total; servants belong to their summoner.
export function battleStatistics(result){
  const actors=battleActorIndex(result);
  const rows=result.config.units.filter(u=>u.side==='ally'&&!u.memospriteOwner).map(u=>({id:u.id,name:u.name,damage:0,hpDamage:0,healing:0,shield:0,actions:0})),byId=new Map(rows.map(r=>[r.id,r]));
  for(const e of result.log){const r=byId.get(battleOwnerId(actors,e.actor));if(!r)continue;
    if(e.type==='damage'&&actors.get(e.target)?.side==='enemy'){r.damage+=e.damage;r.hpDamage+=e.hpDamage??0;}
    if(e.type==='heal')r.healing+=e.amount;
    if(e.type==='shield')r.shield+=e.value;
    if(e.type==='action')r.actions++;
  }
  const total=rows.reduce((s,r)=>s+r.damage,0);
  return rows.map(r=>({...r,share:total?r.damage/total:0}));
}
