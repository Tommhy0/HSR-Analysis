export function tingyun(api){const {allies,live,rank,trace,buff,energy,resource,combatPanel,damageTo}=api;
  const blessed=(u,t)=>t.buffs.find(e=>e.source===u.id&&e.tag==='benediction');
  const extra=(b,from,to,m)=>{if(live(to))damageTo(b,from,to,{name:'赐福 · 雷附加伤害',type:'Additional',element:'Thunder',terms:[{scaling:'atk',multiplier:m}],toughness:0},1,'primary','additional');};
  const randomHit=(b,hits)=>{const targets=[...new Map(hits.filter(live).map(t=>[t.id,t])).values()];if(!targets.length)return null;return targets[Math.min(targets.length-1,Math.floor(Math.max(0,b.random())*targets.length))];};
  return {
    shouldUseSkill(b,u){const t=allies(b,u).find(t=>t.id===u.policy?.allyTargetId)??allies(b,u).find(t=>t!==u),e=t&&blessed(u,t);return !e||e.remaining<=1;},
    entry(b,u){energy(b,u,u.kit.params.Maze[0],true);},
    turnStart(b,u,actor){if(actor===u&&trace(u,3))energy(b,u,trace(u,3)[0]);},
    after(b,u,actor,key,kind,a,selected,hits){const p=u.kit.params;
      if(actor===u){if(key==='skill'){for(const t of b.units)t.buffs=t.buffs.filter(e=>!(e.source===u.id&&e.tag==='benediction'));buff(b,u,selected[0],'赐福','marker',0,p.BPSkill[2],{tag:'benediction',removeOnSourceDeath:true});if(trace(u,1))buff(b,u,u,'驻晴','speedPct',trace(u,1)[0],1);}
        if(key==='ultimate'){const to=selected[0];energy(b,to,p.Ultra[0]+rank(u,6),true);buff(b,u,to,'庆云光覆仪祷','dmgBoost',p.Ultra[2],p.Ultra[1]);}
        if(hits.length){const t=allies(b,u).find(t=>blessed(u,t));if(t)extra(b,t,randomHit(b,hits),p.Talent[0]);}
      }
      if(actor.side===u.side&&blessed(u,actor)){if(hits.length)extra(b,actor,randomHit(b,hits),p.BPSkill[0]+rank(u,4));if(key==='ultimate'&&rank(u,1))buff(b,u,actor,'停云 E1 · 速度','speedPct',rank(u,1),1);}
    },
    death(b,u,from,to){if(to.side===u.side||!from||from.side!==u.side||!rank(u,2)||!blessed(u,from)||from.resources['赐福击杀回能回合']===from.turns)return;resource(b,from,'赐福击杀回能回合',from.turns);energy(b,from,rank(u,2));},
    panel(b,u,target,out,{excludeConverted}){if(!excludeConverted&&target.side===u.side&&blessed(u,target))out.atk+=Math.min((target.panel.baseStats?.atk??0)*u.kit.params.BPSkill[1],combatPanel(u,{excludeConverted:true}).atk*u.kit.params.BPSkill[3]);},
    modifiers(b,u,actor,to,a){return actor===u&&a.type==='Normal'&&trace(u,2)?{dmgBoost:trace(u,2)[0]}:{};},
    display(b,u,target){if(!blessed(u,target))return [];return [{type:'buff',id:u.id+':benediction-atk',source:u.id,name:'赐福 · 攻击力（受停云上限约束）',key:'atk',value:Math.min((target.panel.baseStats?.atk??0)*u.kit.params.BPSkill[1],combatPanel(u,{excludeConverted:true}).atk*u.kit.params.BPSkill[3]),derived:true,remaining:blessed(u,target).remaining}];},
  };
}
