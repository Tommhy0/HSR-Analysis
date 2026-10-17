export function serval(api){const {enemies,live,rank,trace,buff,energy,combatPanel,damageTo,record}=api;
  const shocked=t=>t.dots.some(e=>e.element==='Thunder');
  const shock=(b,u,to,m,d,base)=>{const chance=base*(1+(combatPanel(u).effectHit??0))*(1-(combatPanel(to).effectRes??0));if(chance<1&&b.random()>=chance){record(b,'resist',to,{name:'希露瓦 · 触电被抵抗'});return;}const e={type:'dot',id:u.id+':serval-shock',name:'希露瓦 · 触电',source:u.id,element:'Thunder',remaining:d,tickOwner:to.id,tickAt:'end',appliedTurn:to.turns,debuff:true,terms:[{scaling:'atk',multiplier:m}]};to.dots=to.dots.filter(x=>x.id!==e.id);to.dots.push(e);record(b,'dot',u,{target:to.id,name:e.name,duration:d});b.rules.relics.debuff(b,u,to,e);};
  return {
    start(b,u){if(trace(u,2))energy(b,u,trace(u,2)[0]);},
    entry(b,u){const p=u.kit.params.Maze,pool=enemies(b,u),to=pool[Math.floor(b.random()*pool.length)];if(to)damageTo(b,u,to,{name:'晚安，贝洛伯格',type:'Maze',element:'Thunder',terms:[{scaling:'atk',multiplier:p[3]}],toughness:60},1,'primary','technique');for(const t of pool.filter(live))shock(b,u,t,p[1],p[2],p[0]);},
    before(b,u,actor,key,kind,a,selected){if(actor===u&&key==='ultimate'&&rank(u,4))for(const to of selected.filter(t=>!shocked(t)))shock(b,u,to,u.kit.params.BPSkill[4],u.kit.params.BPSkill[3],rank(u,4));},
    after(b,u,actor,key,kind,a,selected,hits){if(actor!==u||!hits.length)return;
      if(key==='basic'&&rank(u,1)){const pool=b.units.filter(t=>t.side!==u.side&&(t.wave??1)===b.wave),at=pool.indexOf(selected[0]),adj=[pool[at-1],pool[at+1]].filter(live);if(adj.length)damageTo(b,u,adj[Math.floor(b.random()*adj.length)],{name:'希露瓦 E1 · 回声',type:'Normal',element:'Thunder',terms:[{scaling:'atk',multiplier:u.kit.params.Normal[0]*rank(u,1)}],toughness:30},1,'primary','direct');}
      if(key==='skill')for(const to of hits.filter(live))shock(b,u,to,u.kit.params.BPSkill[4],u.kit.params.BPSkill[3],u.kit.params.BPSkill[2]+(trace(u,1)?.[0]??0));
      if(key==='ultimate')for(const to of enemies(b,u))for(const e of to.dots.filter(e=>e.element==='Thunder')){e.remaining+=u.kit.params.Ultra[1];record(b,'effect_extend',u,{target:to.id,name:e.name,duration:e.remaining});}
      for(const to of enemies(b,u).filter(shocked)){damageTo(b,u,to,{name:'燃情和弦',type:'Additional',element:'Thunder',terms:[{scaling:'atk',multiplier:u.kit.params.Talent[0]}],toughness:0},1,'primary','additional');if(rank(u,2))energy(b,u,rank(u,2));}
    },
    death(b,u,from,to){if(from===u&&to.side!==u.side&&trace(u,3))buff(b,u,u,'狂热','atkPct',trace(u,3)[0],trace(u,3)[1]);},
    modifiers(b,u,actor,to){return actor===u&&rank(u,6)&&shocked(to)?{dmgBoost:rank(u,6)}:{};},
  };
}
