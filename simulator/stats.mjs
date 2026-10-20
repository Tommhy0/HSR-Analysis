// Every ally contributes to the same team total; no privileged carry or healer role.
export function battleStatistics(result){
  const rows=result.config.units.filter(u=>u.side==='ally').map(u=>({id:u.id,name:u.name,damage:0,hpDamage:0,healing:0,shield:0,actions:0})),byId=new Map(rows.map(r=>[r.id,r]));
  const definitions=new Map([...result.config.units,...(result.units??[]),...result.log.flatMap(e=>[...(e.frame?.units??[]),...(e.frame?.summons??[])])].map(u=>[u.id,u]));
  const owner=id=>{const seen=new Set();while(!byId.has(id)&&definitions.has(id)&&!seen.has(id)){seen.add(id);id=definitions.get(id).owner??definitions.get(id).memospriteOwner;}return id;};
  for(const e of result.log){const r=byId.get(owner(e.actor));if(!r)continue;
    if(e.type==='damage'){r.damage+=e.damage;r.hpDamage+=e.hpDamage??0;}
    if(e.type==='heal')r.healing+=e.amount;
    if(e.type==='shield')r.shield+=e.value;
    if(e.type==='action')r.actions++;
  }
  const total=rows.reduce((s,r)=>s+r.damage,0);
  return rows.map(r=>({...r,share:total?r.damage/total:0}));
}
