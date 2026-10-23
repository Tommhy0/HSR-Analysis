export function gallagher(api){const {allies,enemies,live,rank,trace,buff,energy,resource,heal,cleanseOne,advance,combatPanel,damageTo}=api;
  const drunk=(u,t)=>t.buffs.some(e=>e.source===u.id&&e.tag==='besotted');
  const besot=(b,u,targets,d)=>{for(const to of targets)buff(b,u,to,'酩酊','marker',0,d,{tag:'besotted',debuff:true,removeOnSourceDeath:true});};
  return {
    shouldUseSkill(b,u){return !u.resources['酒花奔涌']&&allies(b,u).some(t=>
      t.hp/combatPanel(t).hp<(u.policy?.healBelow??.75)||rank(u,2)&&[...t.buffs,...t.dots].some(e=>e.control));},
    start(b,u){if(rank(u,1)){energy(b,u,rank(u,1));buff(b,u,u,'加拉赫 E1 · 抵抗','effectRes',u.kit.ranks[1][1]);}if(rank(u,6))buff(b,u,u,'加拉赫 E6 · 击破特攻','breakEffect',rank(u,6));},
    entry(b,u){const pool=enemies(b,u);besot(b,u,pool,u.kit.params.Maze[0]);for(const to of pool)damageTo(b,u,to,{name:'亲启佳酿',type:'Maze',element:'Fire',terms:[{scaling:'atk',multiplier:u.kit.params.Maze[1]}],toughness:60},1,'primary','technique');},
    prepare(b,u,key,kind,a){const active=!!u.resources['酒花奔涌'];if(key==='enhancedBasic'&&!active)throw new Error('加拉赫尚无强化普攻');return key==='basic'&&active?{...u.actions.enhancedBasic,targetId:a.targetId}:a;},
    before(b,u,actor,key,kind,a,selected){if(actor===u&&key==='ultimate')besot(b,u,selected,u.kit.params.Ultra[1]+rank(u,4));},
    after(b,u,actor,key,kind,a,selected,hits){if(actor===u){if(key==='skill'){if(rank(u,2)){for(let i=0;i<rank(u,2);i++)cleanseOne(b,u,selected[0]);buff(b,u,selected[0],'加拉赫 E2 · 抵抗','effectRes',u.kit.ranks[2][1],u.kit.ranks[2][2]);}heal(b,u,selected[0],u.kit.params.BPSkill[0]);}
        if(key==='ultimate'){resource(b,u,'酒花奔涌',1);if(trace(u,2))advance(b,u.id,1);}}
      if(actor.side===u.side&&!actor.memospriteOwner&&hits.length){const enhanced=actor===u&&(key==='basic'||key==='enhancedBasic')&&!!u.resources['酒花奔涌'];for(const to of hits.filter(t=>drunk(u,t))){const healed=enhanced&&trace(u,3)?allies(b,u):[actor];for(const ally of healed.filter(live))heal(b,u,ally,u.kit.params.Talent[1]);}if(enhanced){for(const to of hits.filter(live))buff(b,u,to,'酒花奔涌 · 攻击降低','atkPct',-u.kit.params.EnhancedNormal[1],u.kit.params.EnhancedNormal[2],{debuff:true});resource(b,u,'酒花奔涌',0);}}
    },
    panel(b,u,to,out,{excludeConverted}){if(to!==u)return;if(rank(u,6))out.breakEfficiency=(out.breakEfficiency??0)+u.kit.ranks[6][1];if(trace(u,1)&&!excludeConverted)out.healingBoost=(out.healingBoost??0)+Math.min(trace(u,1)[1],Math.max(0,combatPanel(u,{excludeConverted:true}).breakEffect??0)*trace(u,1)[0]);},
    modifiers(b,u,actor,to,a,kind){return drunk(u,to)&&(a?.breakDamage||['break','break_dot','superbreak'].includes(kind))?{vuln:u.kit.params.Talent[0]}:{};},
    display(b,u,to){if(to!==u||!trace(u,1))return [];return [{type:'buff',id:u.id+':gallagher-heal',source:u.id,name:'崭新配方 · 击破转治疗',key:'healingBoost',value:Math.min(trace(u,1)[1],Math.max(0,combatPanel(u,{excludeConverted:true}).breakEffect??0)*trace(u,1)[0]),derived:true}];},
  };
}
