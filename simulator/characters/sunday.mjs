export function sunday(api){const {allies,live,rank,trace,buff,stacks,energy,advance,sp,resource,combatPanel,cleanseOne}=api;
  const talent=(b,u,to)=>{const p=u.kit.params.Talent;if(rank(u,6))stacks(b,u,to,'倾诉之肉身','critRate',p[0],rank(u,6),p[1]+u.kit.ranks[6][2],{tag:'sundayCrit'});else buff(b,u,to,'倾诉之肉身','critRate',p[0],p[1],{tag:'sundayCrit'});};
  return {
    start(b,u){if(trace(u,2))energy(b,u,trace(u,2)[0]);},
    entry(b,u){resource(b,u,'荣光之秘待触发',1);},
    turnStart(b,u,actor){if(actor===u&&rank(u,4))energy(b,u,rank(u,4));},
    after(b,u,actor,key,kind,a,selected){if(actor!==u||!['skill','ultimate'].includes(key))return;const to=selected[0],p=u.kit.params;
      if(key==='skill'){if(trace(u,3))for(let i=0;i<trace(u,3)[0];i++)cleanseOne(b,u,to);buff(b,u,to,'纸与仪典的恩赐','dmgBoost',p.BPSkill[1]+(b.summons.some(s=>s.active&&(s.bondmate??s.owner)===to.id)||b.units.some(t=>live(t)&&t.memospriteOwner===to.id)?p.BPSkill[3]:0),p.BPSkill[2]);talent(b,u,to);
        if(rank(u,1))buff(b,u,to,'星期日 E1 · 无视防御','defIgnore',u.kit.ranks[1][1],u.kit.ranks[1][0]);
        if(to.buffs.some(e=>e.source===u.id&&e.tag==='beatified'))sp(b,u,1,'蒙福者返还战技点');
        if(to.path!=='同谐'&&to!==u){advance(b,to.id,p.BPSkill[0]);for(const s of b.summons.filter(s=>s.active&&(s.bondmate??s.owner)===to.id)){s.distance=0;api.record(b,'advance',u,{name:'星期日 · 召唤物立即行动',target:s.id,ratio:1});}for(const s of b.units.filter(s=>live(s)&&s.memospriteOwner===to.id))advance(b,s.id,p.BPSkill[0]);}
      }
      if(key==='ultimate'){energy(b,to,Math.max(to.energyMax*p.Ultra[0],trace(u,1)?.[0]??0),true);if(to!==u){for(const t of b.units)t.buffs=t.buffs.filter(e=>!(e.source===u.id&&e.beatified));const duration=p.Ultra[2],extra={tag:'beatified',beatified:true,tickOwner:u.id,tickAt:'start',removeOnSourceDeath:true};buff(b,u,to,'蒙福者','marker',0,duration,extra);buff(b,u,to,'蒙福者 · 暴伤','critDmg',combatPanel(u,{excludeConverted:true}).critDmg*p.Ultra[1]+p.Ultra[3],duration,{...extra,tag:'beatifiedCrit',converted:true});if(rank(u,2))buff(b,u,to,'星期日 E2 · 增伤','dmgBoost',rank(u,2),duration,{...extra,tag:'beatifiedDmg'});}
        if(rank(u,2)&&!u.resources['首次终结技返点']){resource(b,u,'首次终结技返点',1);sp(b,u,u.kit.ranks[2][1],'星期日 E2');}if(rank(u,6))talent(b,u,to);
      }
      if(u.resources['荣光之秘待触发']){resource(b,u,'荣光之秘待触发',0);buff(b,u,to,'荣光之秘','dmgBoost',p.Maze[0],p.Maze[1]);}
    },
    panel(b,u,to,out,{excludeConverted}){if(!excludeConverted&&rank(u,6)&&to.buffs.some(e=>e.source===u.id&&e.tag==='sundayCrit'))out.critDmg+=Math.max(0,out.critRate-1)*u.kit.ranks[6][1]*100;},
    modifiers(b,u,actor){if(b.activeAction?.key==='dragon'&&rank(u,1)&&actor.buffs.some(e=>e.source===u.id&&e.name==='星期日 E1 · 无视防御'))return {defIgnore:u.kit.ranks[1][2]-u.kit.ranks[1][1]};return {};},
  };
}
