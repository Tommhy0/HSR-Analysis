export function natasha(api){const {allies,enemies,live,rank,trace,buff,energy,resource,combatPanel,damageTo,heal,cleanseOne}=api;
  const healing=(b,u,to,m,flat,snapshotHp)=>{const p=combatPanel(u),talent=to.hp/combatPanel(to).hp<=u.kit.params.Talent[0]?u.kit.params.Talent[1]:0;heal(b,u,to,(snapshotHp??p.hp)*m+flat,talent+(trace(u,2)?.[0]??0));};
  // Both HoT modifiers declare UseSnapshotEntity=true in 4.6. Save the caster HP
  // multiplier when the effect is created; the low-HP healing bonus remains a
  // recipient-state check at each tick.
  const regen=(b,u,to,name,m,flat,duration)=>buff(b,u,to,name,'marker',0,duration,{regen:{multiplier:m,flat,snapshotHp:combatPanel(u).hp},tag:'natashaRegen',removeOnSourceDeath:false});
  return {
    entry(b,u){const p=u.kit.params.Maze,pool=enemies(b,u),to=pool[Math.floor(b.random()*pool.length)];if(to)damageTo(b,u,to,{name:'催眠研习',type:'Maze',element:u.element,terms:[{scaling:'atk',multiplier:p[3]}],toughness:60},1,'primary','technique');for(const t of pool){const chance=p[0]*(1+(combatPanel(u).effectHit??0))*(1-(combatPanel(t).effectRes??0));if(chance>=1||b.random()<chance)buff(b,u,t,'催眠研习 · 虚弱','dmgBoost',-p[1],p[2],{debuff:true});}},
    turnStart(b,u,actor){for(const e of actor.buffs.filter(e=>e.source===u.id&&e.regen))healing(b,u,actor,e.regen.multiplier,e.regen.flat,e.regen.snapshotHp);},
    after(b,u,actor,key,kind,a,selected,hits){if(actor!==u)return;const p=u.kit.params;
      if(key==='basic'&&rank(u,6))for(const t of hits.filter(live))damageTo(b,u,t,{name:'娜塔莎 E6 · 生命伤害',type:'Normal',element:'Physical',terms:[{scaling:'hp',multiplier:rank(u,6)}],toughness:0},1,'primary','additional');
      if(key==='skill'){const to=selected[0];if(trace(u,1))for(let i=0;i<trace(u,1)[0];i++)cleanseOne(b,u,to);healing(b,u,to,p.BPSkill[0],p.BPSkill[3]);regen(b,u,to,'爱，救护与抉择 · 持续治疗',p.BPSkill[1],p.BPSkill[4],p.BPSkill[2]+(trace(u,3)?.[0]??0));}
      if(key==='ultimate')for(const to of allies(b,u)){const low=to.hp/combatPanel(to).hp<=(u.kit.ranks[2]?.[0]??0);healing(b,u,to,p.Ultra[0],p.Ultra[1]);if(rank(u,2)&&low)regen(b,u,to,'娜塔莎 E2 · 持续治疗',u.kit.ranks[2][2],u.kit.ranks[2][3],u.kit.ranks[2][1]);}
    },
    attacked(b,u,to){if(to!==u)return;if(rank(u,4))energy(b,u,rank(u,4));if(rank(u,1)&&!u.resources['自身急救已触发']&&u.hp/combatPanel(u).hp<=u.kit.ranks[1][0]){resource(b,u,'自身急救已触发',1);healing(b,u,u,u.kit.ranks[1][1],u.kit.ranks[1][2]);}},
  };
}
