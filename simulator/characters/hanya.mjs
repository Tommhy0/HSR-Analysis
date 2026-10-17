export function hanya(api){const {allies,enemies,rank,trace,buff,energy,resource,sp,advance,combatPanel}=api;
  const burden=(u,t)=>t.buffs.find(e=>e.source===u.id&&e.tag==='burden');
  const mark=(b,u,to)=>{for(const t of b.units)t.buffs=t.buffs.filter(e=>!(e.source===u.id&&e.tag==='burden'));buff(b,u,to,'承负','marker',0,null,{tag:'burden',attacks:0,refunds:0,removeOnSourceDeath:true});};
  const eligible=(actor,u,a,kind)=>actor.side===u.side&&!actor.memospriteOwner&&['Normal','BPSkill','Ultra'].includes(a.type)&&kind!=='followup'&&kind!=='summon';
  const reward=(b,u,actor,e)=>{sp(b,u,1,'承负');if(trace(u,1)&&actor)buff(b,u,actor,'录事','atkPct',trace(u,1)[0],trace(u,1)[1]);if(trace(u,3))energy(b,u,trace(u,3)[0]);e.refunds++;};
  return {
    shouldUseSkill(b,u){return !enemies(b,u).some(t=>burden(u,t));},
    entry(b,u){const pool=enemies(b,u);if(pool.length)mark(b,u,pool[Math.floor(b.random()*pool.length)]);},
    hit(b,u,actor,to,a,kind){if(eligible(actor,u,a,kind)&&burden(u,to)&&!actor.buffs.some(e=>e.tag==='hanyaTalent'&&e.appliedSequence===b.activeAction?.sequence))buff(b,u,actor,'罚恶','dmgBoost',u.kit.params.Talent[0]+rank(u,6),u.kit.params.Talent[1],{tag:'hanyaTalent',appliedSequence:b.activeAction?.sequence});},
    after(b,u,actor,key,kind,a,selected,hits){if(actor===u){if(key==='skill'){if(selected[0]?.hp>0)mark(b,u,selected[0]);if(rank(u,2))buff(b,u,u,'寒鸦 E2 · 加速','speedPct',rank(u,2),u.kit.ranks[2][1]);}
        if(key==='ultimate'){const to=selected[0],p=u.kit.params.Ultra,d=p[1]+rank(u,4);buff(b,u,to,'十王敕令 · 攻击','atkPct',p[0],d,{tag:'hanyaUlt'});buff(b,u,to,'十王敕令 · 速度','speed',combatPanel(u,{excludeConverted:true}).speed*p[2],d,{converted:true});}}
      if(!eligible(actor,u,a,kind))return;
      for(const to of hits){const e=burden(u,to);if(!e)continue;e.attacks++;if(e.attacks>=2){e.attacks=0;reward(b,u,actor,e);if(e.refunds>=u.kit.params.BPSkill[1])to.buffs=to.buffs.filter(x=>x!==e);}}
    },
    death(b,u,from,to){const e=burden(u,to);if(e&&trace(u,2)&&e.refunds<=trace(u,2)[0]){sp(b,u,trace(u,2)[1],'幽府');if(trace(u,3))energy(b,u,trace(u,3)[0]);}if(e)to.buffs=to.buffs.filter(x=>x!==e);
      if(to.side!==u.side&&from?.buffs.some(e=>e.source===u.id&&e.tag==='hanyaUlt')&&rank(u,1)&&u.resources['寒鸦 E1 触发回合']!==u.turns){resource(b,u,'寒鸦 E1 触发回合',u.turns);advance(b,u.id,rank(u,1));}},
  };
}
