export function pela(api){const {enemies,live,rank,trace,buff,energy,resource,combatPanel,damageTo,record}=api;
  const negative=t=>t.buffs.some(e=>e.debuff)||t.dots.length>0;
  const apply=(b,u,to,name,key,value,duration,chance,extra={})=>{const probability=chance*(1+(combatPanel(u).effectHit??0))*(1-(combatPanel(to).effectRes??0));if(probability<1&&b.random()>=probability){record(b,'resist',to,{name:name+'被抵抗'});return;}buff(b,u,to,name,key,value,duration,{debuff:true,...extra});};
  return {
    entry(b,u){const p=u.kit.params.Maze,pool=enemies(b,u),to=pool[Math.floor(b.random()*pool.length)];if(to)damageTo(b,u,to,{name:'先发制人',type:'Maze',element:'Ice',terms:[{scaling:'atk',multiplier:p[3]}],toughness:60},1,'primary','technique');for(const t of pool)apply(b,u,t,'先发制人 · 减防','defShred',p[1],p[2],p[0]);},
    before(b,u,actor,key,kind,a,selected){if(actor!==u)return;
      if(key==='skill'){resource(b,u,'本次解除增益',0);const to=selected[0],positive=to.buffs.filter(e=>!e.debuff&&!e.control&&e.dispellable!==false).slice().reverse().slice(0,u.kit.params.BPSkill[1]);for(const e of positive){to.buffs=to.buffs.filter(x=>x!==e);record(b,'dispel',u,{target:to.id,name:e.name});}if(positive.length)resource(b,u,'本次解除增益',positive.length);if(u.kit.eidolon>=4){const p=u.kit.ranks[4];apply(b,u,to,'佩拉 E4 · 冰抗降低','resPen',p[1],p[2],p[0],{resReduction:true,element:'Ice'});}}
      if(key==='ultimate'){const p=u.kit.params.Ultra;for(const to of selected)apply(b,u,to,'通解','defShred',p[1],p[2],p[0]);}
    },
    after(b,u,actor,key,kind,a,selected,hits){if(actor!==u||!hits.length)return;
      const debuffed=hits.filter(negative);if(debuffed.length)energy(b,u,u.kit.params.Talent[0]);
      if(rank(u,6))for(const to of debuffed.filter(live))damageTo(b,u,to,{name:'佩拉 E6 · 疲惫追击',type:'Additional',element:'Ice',terms:[{scaling:'atk',multiplier:rank(u,6)}],toughness:0},1,'primary','additional');
      // Dispel's bonus starts after the dispelling hit, and is spent by one attack.
      u.buffs=u.buffs.filter(e=>e.tag!=='pelaNextAttack');
      if(key==='skill'&&u.resources['本次解除增益']){if(trace(u,3))buff(b,u,u,'追歼 · 下一次攻击','dmgBoost',trace(u,3)[0],null,{tag:'pelaNextAttack'});if(rank(u,2))buff(b,u,u,'佩拉 E2 · 加速','speedPct',rank(u,2),u.kit.ranks[2][1]);}
    },
    death(b,u,from,to){if(to.side!==u.side&&rank(u,1))energy(b,u,rank(u,1));},
    panel(b,u,to,out){if(to.side===u.side&&trace(u,2))out.effectHit=(out.effectHit??0)+trace(u,2)[0];},
    modifiers(b,u,actor,to){return actor===u&&negative(to)&&trace(u,1)?{dmgBoost:trace(u,1)[0]}:{};},
    display(b,u,to){return to.side===u.side&&trace(u,2)?[{type:'buff',id:u.id+':pela-ehr',source:u.id,name:'秘策 · 效果命中',key:'effectHit',value:trace(u,2)[0],derived:true}]:[];},
  };
}
