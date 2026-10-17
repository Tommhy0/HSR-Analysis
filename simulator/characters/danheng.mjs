export function danheng(api){const {enemies,live,rank,trace,buff,resource,advance,combatPanel,record}=api;
  const slow=t=>t.buffs.some(e=>e.debuff&&(e.key==='speed'||e.key==='speedPct')&&e.value<0);
  return {
    entry(b,u){buff(b,u,u,'破敌锋芒','atkPct',u.kit.params.Maze[0],u.kit.params.Maze[1]);},
    prepare(b,u,key,kind,a){if(key!=='ultimate')return a;const to=enemies(b,u).find(t=>t.id===a.targetId)??enemies(b,u)[0];return to&&slow(to)?{...a,terms:[{scaling:'atk',multiplier:u.kit.params.Ultra[0]+u.kit.params.Ultra[1]}]}:a;},
    before(b,u,actor,key,kind,a,selected){if(actor.side!==u.side||!selected.includes(u)||!['Normal','BPSkill','Ultra','Servant'].includes(a.type))return;if(u.turns<(u.resources['寸长寸强可用回合']??0))return;buff(b,u,u,'寸长寸强','marker',0,null,{tag:'danPenetration'});},
    afterHit(b,u,actor,to,a,kind,hit){if(actor!==u||b.activeAction?.key!=='skill'||!live(to)||kind!=='direct')return;const critical=hit.critMode==='crit'||hit.critMode==='expected'&&b.random()<Math.max(0,Math.min(1,hit.critRate));if(!critical)return;const p=u.kit.params.BPSkill,chance=p[3]*(1+(combatPanel(u).effectHit??0))*(1-(combatPanel(to).effectRes??0));if(chance<1&&b.random()>=chance){record(b,'resist',to,{name:'丹恒 · 减速被抵抗'});return;}buff(b,u,to,'云骑枪术 · 减速','speedPct',-p[1]-rank(u,6),p[2],{debuff:true});},
    // 天赋：抗穿在「下一次攻击」（普攻 / 战技 / 终结技 / 忆灵技能，是否命中都算）后移除，
    // 冷却也从消耗时开始计算（与原始脚本 OnAfterSkillUse 一致）。
    after(b,u,actor,key,kind,a,selected,hits){if(actor!==u)return;
      if(['Normal','BPSkill','Ultra','Servant'].includes(a.type)&&u.buffs.some(e=>e.tag==='danPenetration')){
        resource(b,u,'寸长寸强可用回合',u.turns+u.kit.params.Talent[1]-(u.kit.eidolon>=2?1:0));
        u.buffs=u.buffs.filter(e=>e.tag!=='danPenetration');}
      if(trace(u,2)&&hits.length&&b.random()<trace(u,2)[0])buff(b,u,u,'绝影','speedPct',trace(u,2)[1],trace(u,2)[2]);},
    death(b,u,from,to){if(from===u&&to.side!==u.side&&u.kit.eidolon>=4&&b.activeAction?.actor===u.id&&b.activeAction.key==='ultimate'&&u.resources['丹恒 E4 触发动作']!==b.activeAction.sequence){resource(b,u,'丹恒 E4 触发动作',b.activeAction.sequence);advance(b,u.id,1);}},
    panel(b,u,to,out){if(to===u&&trace(u,1)&&u.hp/out.hp<=trace(u,1)[0])out.aggroRatio=(out.aggroRatio??1)*(1-trace(u,1)[1]);},
    modifiers(b,u,actor,to,a){if(actor!==u)return {};const out={};if(u.buffs.some(e=>e.tag==='danPenetration')&&(a.element??u.element)==='Wind')out.resPen=u.kit.params.Talent[0];if(u.kit.eidolon>=1&&to.hp/combatPanel(to).hp>=u.kit.ranks[1][0])out.critRate=u.kit.ranks[1][1];if(a.type==='Normal'&&slow(to)&&trace(u,3))out.dmgBoost=trace(u,3)[0];return out;},
    display(b,u,to){return to===u&&u.buffs.some(e=>e.tag==='danPenetration')?[{type:'buff',id:u.id+':dan-penetration',source:u.id,name:'寸长寸强 · 下次攻击风抗穿',key:'resPen',value:u.kit.params.Talent[0],derived:true}]:[];},
  };
}
