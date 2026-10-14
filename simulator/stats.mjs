// Every ally contributes to the same team total; no privileged carry or healer role.
export function battleStatistics(result){
  const rows=result.config.units.filter(u=>u.side==='ally').map(u=>({id:u.id,name:u.name,damage:0,hpDamage:0,healing:0,shield:0,actions:0})),byId=new Map(rows.map(r=>[r.id,r]));
  for(const e of result.log){const r=byId.get(e.actor);if(!r)continue;
    if(e.type==='damage'){r.damage+=e.damage;r.hpDamage+=e.hpDamage??0;}
    if(e.type==='heal')r.healing+=e.amount;
    if(e.type==='shield')r.shield+=e.value;
    if(e.type==='action')r.actions++;
  }
  const total=rows.reduce((s,r)=>s+r.damage,0);
  return rows.map(r=>({...r,share:total?r.damage/total:0}));
}
