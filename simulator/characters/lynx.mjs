// 玲可 1110：战技【求生反应】（按玲可生命上限提高目标生命上限 / 毁灭存护加仇恨 / 治疗）、
// 终结全队净化 + 治疗、天赋持续治疗（求生反应额外一段）、行迹受击回能、E4 攻击转换、E6 生命上限与效果抵抗。
export function lynx(api){const {allies,live,rank,trace,buff,stacks,resource,energy,heal,cleanseOne,combatPanel,regen,tickRegen}=api;
  const survival=to=>to.buffs.find(e=>e.tag==='lynxSurvival');
  const rawHeal=(u,to,value,extra=0)=>{const p=combatPanel(u);return Math.max(0,value)*(1+(p.healingBoost??0)+extra)*(1+(combatPanel(to).incomingHeal??0));};
  void rawHeal;
  const healOne=(b,u,to,value)=>{const bonus=rank(u,1)&&to.hp/combatPanel(to).hp<=u.kit.ranks[1][0]?u.kit.ranks[1][1]:0;
    heal(b,u,to,value,bonus);};
  const regenFor=(b,u,to)=>{const p=u.kit.params,d=p.Talent[0]+(trace(u,3)?.[0]??0);
    regen(b,u,to,'户外生存经验',p.Talent[1],p.Talent[2],d,{id:'lynx:regen:'+to.id,tag:'lynxRegen',survivalBonus:p.Talent[3],survivalFlat:p.Talent[4],snapshotHp:true});};
  return {
    shouldUseSkill(b,u){return !allies(b,u).some(t=>survival(t))||allies(b,u).some(t=>t.hp/combatPanel(t).hp<.9);},
    start(b,u){},
    // 秘技「巧克力能量棒」：下一次战斗开始时为我方全体附加天赋的持续治疗效果。
    entry(b,u){for(const to of allies(b,u))regenFor(b,u,to);},
    // 求生反应：按玲可生命上限提高目标生命上限；毁灭 / 存护命途大幅提高仇恨；E4 攻击转换；E6 额外生命上限与效果抵抗。
    panel(b,u,to,out){if(to.side!==u.side)return;const p=u.kit.params,s=survival(to);if(s){const hp=u.panel.hp;
        out.hp+=(hp*p.BPSkill[0]+p.BPSkill[1])+(rank(u,6)?hp*u.kit.ranks[6][0]:0);
        const path=to.kit?.path??to.path;
        if(['毁灭','存护'].includes(path))out.aggroRatio=(out.aggroRatio??1)*3;
        if(rank(u,4))out.atk+=hp*u.kit.ranks[4][0];
        if(rank(u,6))out.effectRes=(out.effectRes??0)+u.kit.ranks[6][1];}},
    after(b,u,actor,key,kind,a,selected,hits){const p=u.kit.params;if(actor!==u)return;
      if(key==='skill'){const to=selected[0];
        buff(b,u,to,'求生反应','marker',0,p.BPSkill[2],{tag:'lynxSurvival',tickOwner:u.id,removeOnSourceDeath:true});
        healOne(b,u,to,combatPanel(u).hp*p.BPSkill[3]+p.BPSkill[4]);
        regenFor(b,u,to);}
      if(key==='ultimate'){for(let i=0;i<p.Ultra[0];i++)for(const to of allies(b,u))cleanseOne(b,u,to);
        for(const to of allies(b,u)){healOne(b,u,to,combatPanel(u).hp*p.Ultra[1]+p.Ultra[2]);regenFor(b,u,to);}}},
    // 天赋持续治疗与行迹「提前勘测」。
    turnStart(b,u,actor){tickRegen(b,u,actor,(e)=>survival(actor)?((e.regen.snapshotHp??combatPanel(u).hp)*e.survivalBonus+e.survivalFlat):0);},
    attacked(b,u,to){if(to.side===u.side&&trace(u,1)&&survival(to))energy(b,u,trace(u,1)[0],true);},
    display(b,u,to){if(to.side!==u.side)return [];const out=[];const s=survival(to);
      if(s)out.push({type:'buff',id:u.id+':survival',source:u.id,name:'求生反应 · 生命上限',key:'hp',value:combatPanel(u).hp*u.kit.params.BPSkill[0]+u.kit.params.BPSkill[1],remaining:s.remaining,tickOwner:u.id,derived:true});
      if(to.buffs.some(e=>e.tag==='lynxRegen'))out.push({type:'buff',id:u.id+':regen',source:u.id,name:'户外生存经验 · 持续治疗',key:'heal',value:combatPanel(u).hp*u.kit.params.Talent[1]+u.kit.params.Talent[2],derived:true});
      return out;},
  };
}
