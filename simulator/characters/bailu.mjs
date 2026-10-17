// 白露 1211：战技主治疗 + 递减随机治疗、终结全体治疗并附加/延长【生息】、
// 天赋【生息】受击回复与致命伤害拦截、行迹过量治疗转生命上限、E2 治疗量提升、E4 治疗叠增伤。
const EPS=1e-8;
export function bailu(api){const {allies,live,rank,trace,buff,stacks,resource,energy,heal,combatPanel,regen,record}=api;
  const rawHeal=(u,to,value,extra=0)=>{const p=combatPanel(u);return Math.max(0,value)*(1+(p.healingBoost??0)+extra)*(1+(combatPanel(to).incomingHeal??0));};
  // 行迹「岐黄精义」：造成过量治疗时提高目标生命上限。
  const overheal=(b,u,to,value,extra=0)=>{if(!trace(u,1))return false;const over=rawHeal(u,to,value,extra)>Math.max(0,combatPanel(to).hp-to.hp);
    if(over)buff(b,u,to,'岐黄精义 · 生命上限','hpPct',trace(u,1)[0],trace(u,1)[1],{id:'bailu:trace1'});
    return over;};
  const maxTriggers=u=>u.kit.params.Talent[4]+(trace(u,2)?.[0]??0);
  const invigorate=(b,u,to,extend=false)=>{const old=to.buffs.find(e=>e.id==='bailu:invigorate');
    if(old&&extend){old.remaining=(old.remaining??0)+1;old.maxTriggers=maxTriggers(u);record(b,'buff',u,{target:to.id,name:'生息 · 延长',duration:old.remaining});}
    else regen(b,u,to,'生息',u.kit.params.Talent[0],u.kit.params.Talent[1],u.kit.params.Ultra[2],{id:'bailu:invigorate',tag:'bailuInvigorate',maxTriggers:maxTriggers(u),triggers:0});};
  const healAll=(b,u,value)=>{for(const to of allies(b,u)){overheal(b,u,to,value);heal(b,u,to,value);}};
  return {
    shouldUseSkill(b,u){return allies(b,u).some(t=>t.hp/combatPanel(t).hp<.9);},
    start(b,u){resource(b,u,'急救已触发',0);},
    // 秘技：下一次战斗开始时为我方全体附上【生息】。
    entry(b,u){for(const to of allies(b,u))invigorate(b,u,to,false);},
    // 行迹「鳞渊福泽」：拥有【生息】的角色受到的伤害降低。
    panel(b,u,to,out){if(to.side===u.side&&trace(u,3)&&to.buffs.some(e=>e.tag==='bailuInvigorate'))out.dmgReduction=1-(1-(out.dmgReduction??0))*(1-trace(u,3)[0]);},
    // 天赋：拥有【生息】的目标受到攻击后回复（触发次数有限）。
    attacked(b,u,to){if(to.side!==u.side||!live(to))return;const e=to.buffs.find(x=>x.tag==='bailuInvigorate');if(!e)return;
      const max=e.maxTriggers??maxTriggers(u);if((e.triggers??0)>=max)return;e.triggers=(e.triggers??0)+1;
      overheal(b,u,to,combatPanel(u).hp*u.kit.params.Talent[0]+u.kit.params.Talent[1]);
      heal(b,u,to,combatPanel(u).hp*u.kit.params.Talent[0]+u.kit.params.Talent[1]);
      // E1：【生息】结束时若目标满血则额外回能（此处以剩余 1 回合判定为即将结束）。
      if(rank(u,1)&&(e.remaining??0)<=1&&to.hp>=combatPanel(to).hp-EPS)energy(b,to,u.kit.ranks[1][0],true);},
    after(b,u,actor,key,kind,a,selected,hits){const p=u.kit.params;if(actor!==u)return;
      if(key==='skill'){const to=selected[0],base=combatPanel(u).hp*p.BPSkill[0]+p.BPSkill[1];
        overheal(b,u,to,base);heal(b,u,to,base);
        if(rank(u,4))stacks(b,u,to,'肘后备急除外障','dmgBoost',u.kit.ranks[4][0],u.kit.ranks[4][1],u.kit.ranks[4][2],{id:'bailuE4:'+to.id,tickOwner:u.id});
        for(let i=0;i<p.BPSkill[3];i++){const pool=allies(b,u);if(!pool.length)break;
          const target=pool[Math.floor(b.random()*pool.length)],value=base*Math.pow(1-p.BPSkill[2],i+1);
          overheal(b,u,target,value);heal(b,u,target,value);
          if(rank(u,4))stacks(b,u,target,'肘后备急除外障','dmgBoost',u.kit.ranks[4][0],u.kit.ranks[4][1],u.kit.ranks[4][2],{id:'bailuE4:'+target.id,tickOwner:u.id});}}
      if(key==='ultimate'){healAll(b,u,combatPanel(u).hp*p.Ultra[0]+p.Ultra[1]);
        for(const to of allies(b,u))invigorate(b,u,to,to.buffs.some(e=>e.id==='bailu:invigorate'));
        if(rank(u,2))buff(b,u,u,'壶中洞天云螭眠','healingBoost',u.kit.ranks[2][0],u.kit.ranks[2][1],{id:'bailuE2'});}},
    // 天赋：队友受到致命攻击时不会倒下，白露立即治疗（单场 1 次，E6 增加次数）。
    beforeLethal(b,u,from,to){if(to.side!==u.side)return false;
      const max=1+(rank(u,6)?u.kit.ranks[6][0]:0);if((u.resources['急救已触发']??0)>=max)return false;
      resource(b,u,'急救已触发',(u.resources['急救已触发']??0)+1);
      heal(b,u,to,combatPanel(u).hp*u.kit.params.Talent[2]+u.kit.params.Talent[3]);
      return true;},
    display(b,u,to){if(to!==u)return [];return [{type:'buff',id:u.id+':bailu-rescue',source:u.id,name:'天赋急救已触发次数',key:'marker',value:u.resources['急救已触发']??0,derived:true}];},
  };
}
