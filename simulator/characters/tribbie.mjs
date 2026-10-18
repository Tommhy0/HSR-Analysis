export function tribbie(api){const {allies,enemies,live,rank,trace,buff,stacks,energy,resource,combatPanel,damageTo,record}=api;
  const field=u=>u.buffs.find(e=>e.tag==='tribbieField'),revelation=u=>u.buffs.find(e=>e.tag==='revelation');
  const reveal=(b,u,d)=>buff(b,u,u,'神启','marker',0,d,{tag:'revelation',tickAt:'start'});
  return {
    shouldUseSkill(b,u){return !revelation(u);},
    start(b,u){if(trace(u,3))energy(b,u,trace(u,3)[0]);},
    entry(b,u){reveal(b,u,u.kit.params.Maze[0]);},
    before(b,u,actor,key,kind,a,selected){const p=u.kit.params;
      if(actor===u&&key==='ultimate'){const old=u.buffs.find(e=>e.tag==='tribbieHP');if(old){u.hp=Math.min(u.hp,combatPanel(u).hp-old.value);u.buffs=u.buffs.filter(e=>e!==old);}
        if(trace(u,2)){const value=allies(b,u).reduce((n,t)=>n+combatPanel(t).hp,0)*trace(u,2)[0];buff(b,u,u,'长翅膀的玻璃球！','hp',value,p.Ultra[3],{tag:'tribbieHP',tickAt:'start',removeOnSourceDeath:true});u.hp+=value;}
        buff(b,u,u,'缇宝 · 结界','marker',0,p.Ultra[3],{tag:'tribbieField',tickAt:'start'});resource(b,u,'已触发追击的队友',[]);
        if(rank(u,6))b.queue.push({actor:u.id,key:'followup',kind:'followup'});
      }
      if(actor!==u&&actor.side===u.side&&key==='ultimate'&&!actor.memospriteOwner){const used=u.resources['已触发追击的队友']??[];if(!used.includes(actor.id)){resource(b,u,'已触发追击的队友',[...used,actor.id]);b.queue.push({actor:u.id,key:'followup',kind:'followup'});}}
    },
    after(b,u,actor,key,kind,a,selected,hits){
      if(actor===u&&key==='skill')reveal(b,u,u.kit.params.BPSkill[1]);
      if(actor===u&&kind==='followup'&&trace(u,1))stacks(b,u,u,'城墙外的羊羔儿…','dmgBoost',trace(u,1)[0],trace(u,1)[1],trace(u,1)[2]);
      if(actor!==u&&actor.side===u.side&&trace(u,3)&&hits.length)energy(b,u,trace(u,3)[1]*hits.length);
      if(actor.side!==u.side||!hits.length||!field(u))return;
      const pool=hits.filter(live);if(!pool.length)return;
      const native=b.log.slice(b.activeAction?.sequence??b.log.length).filter(e=>e.type==='damage'&&e.actor===actor.id&&!['true','dot','break_dot'].includes(e.kind)).reduce((n,e)=>n+e.damage,0);
      // 1141515 献予「门径」之诗：追加攻击触发结界附加伤害时额外 1 次附加伤害。
      const gateBonus=kind==='followup'&&u.buffs.some(e=>String(e.tag??'').startsWith('cyreneGatePoem:'))?1:0;
      const mult=u.kit.params.Ultra[2]*(rank(u,2)?rank(u,2):1),count=hits.length*(1+(u.kit.eidolon>=2?u.kit.ranks[2][1]:0))+gateBonus;
      // The raw target alias selects the highest-current-HP living marked enemy
      // for each loop iteration. Re-resolve after every damage packet so a kill
      // does not discard the remaining field hits.
      const highestLive=()=>pool.filter(live).sort((a,c)=>c.hp-a.hp||a.order-c.order)[0];
      for(let i=0;i<count;i++){const to=highestLive();if(!to)break;damageTo(b,u,to,{name:'结界 · 附加伤害',type:'Additional',element:'Quantum',terms:[{scaling:'hp',multiplier:mult}],toughness:0},1,'primary','additional');}
      if(rank(u,1)){const to=highestLive();if(to)api.trueDamage(b,u,to,native*rank(u,1),'缇宝 E1 · 真实伤害');}
    },
    modifiers(b,u,actor,to,a,kind){const out={};if(actor.side===u.side){if(revelation(u)){out.resPen=u.kit.params.BPSkill[0];if(rank(u,4))out.defIgnore=rank(u,4);}if(field(u))out.vuln=u.kit.params.Ultra[1];if(actor===u&&kind==='followup'&&rank(u,6))out.dmgBoost=rank(u,6);}return out;},
    display(b,u,target){const out=[];if(target.side===u.side&&revelation(u)){out.push({type:'buff',id:u.id+':revelation-res',source:u.id,name:'神启 · 全属性抗穿',key:'resPen',value:u.kit.params.BPSkill[0],remaining:revelation(u).remaining,tickOwner:u.id,derived:true});if(rank(u,4))out.push({type:'buff',id:u.id+':revelation-def',source:u.id,name:'缇宝 E4 · 无视防御',key:'defIgnore',value:rank(u,4),remaining:revelation(u).remaining,derived:true});}if(target.side!==u.side&&field(u))out.push({type:'buff',id:u.id+':field-vuln',source:u.id,name:'缇宝 · 结界易伤',key:'vuln',value:u.kit.params.Ultra[1],remaining:field(u).remaining,tickOwner:u.id,derived:true,debuff:true});return out;},
  };
}
