// 藿藿 1217：战技净化 + 主治疗 + 相邻治疗并获得【禳命】、终结为队友回能并加攻、
// 天赋【禳命】回合开始 / 终结技触发治疗并净化、行迹回能、E1 速度、E2 免于致命、E4 低血增疗、E6 治疗增伤。
export function huohuo(api){const {allies,live,rank,trace,buff,resource,energy,heal,cleanseOne,combatPanel,allResDown}=api;
  const blessing=u=>u.buffs.find(e=>e.tag==='huohuoBless');
  const healOne=(b,u,to,multiplier,flat)=>{if(!live(to))return 0;
    // E4：目标当前生命值越低治疗量越高，最多 +80%。
    const bonus=rank(u,4)?rank(u,4)*(1-to.hp/combatPanel(to).hp):0;
    heal(b,u,to,combatPanel(u).hp*multiplier+flat,bonus);
    if(rank(u,6))buff(b,u,to,'同休共戚，相须而行','dmgBoost',u.kit.ranks[6][0],u.kit.ranks[6][1],{id:'huohuoE6:'+to.id,tickOwner:u.id});
    return 1;};
  // 天赋：为我方目标治疗时，解除 1 个负面效果（可触发次数有限，施放战技刷新）。
  const talentHeal=(b,u,to)=>{const p=u.kit.params;if(!live(to))return;
    healOne(b,u,to,p.Talent[2],p.Talent[4]);
    if((u.resources['禳命净化次数']??0)<p.Talent[6]){cleanseOne(b,u,to);resource(b,u,'禳命净化次数',(u.resources['禳命净化次数']??0)+1);}
    if(trace(u,3))energy(b,u,trace(u,3)[0],true);};
  const gainBlessing=(b,u)=>{const p=u.kit.params,d=p.Talent[0]+(rank(u,1)?u.kit.ranks[1][1]:0);
    buff(b,u,u,'禳命','marker',0,d,{tag:'huohuoBless',tickOwner:u.id,tickAt:'start'});resource(b,u,'禳命净化次数',0);};
  return {
    shouldUseSkill(b,u){return !blessing(u)||allies(b,u).some(t=>t.hp/combatPanel(t).hp<.9);},
    start(b,u){resource(b,u,'禳命净化次数',0);resource(b,u,'免于致命次数',0);},
    // 行迹「不敢自专」：战斗开始时获得【禳命】（1 回合）。
    entry(b,u){if(trace(u,1))buff(b,u,u,'禳命','marker',0,trace(u,1)[0],{tag:'huohuoBless',tickOwner:u.id,tickAt:'start'});},
    // 秘技「凶煞•劾压鬼物」：进入战斗后按基础概率降低敌方全体攻击力。
    waveStart(b,u){const m=u.kit.params.Maze;if(!u.kit?.technique)return;
      for(const to of b.units.filter(t=>live(t)&&t.side!==u.side)){const chance=m[0]*(1+(combatPanel(u).effectHit??0))*(1-(combatPanel(to).effectRes??0));if(chance>=1||b.random()<chance)buff(b,u,to,'魄散 · 攻击降低','atkPct',-m[1],m[2],{debuff:true,tickOwner:u.id,tickAt:'start'});else api.record(b,'resist',to,{name:'魄散 · 攻击降低被抵抗'});}},
    after(b,u,actor,key,kind,a,selected,hits){const p=u.kit.params;
      if(actor===u&&key==='skill'){const to=selected[0];
        for(let i=0;i<p.BPSkill[4];i++)cleanseOne(b,u,to);
        healOne(b,u,to,p.BPSkill[0],p.BPSkill[1]);
        const team=allies(b,u),at=team.findIndex(t=>t.id===to.id);
        for(const i of [at-1,at+1])if(team[i])healOne(b,u,team[i],p.BPSkill[2],p.BPSkill[3]);
        gainBlessing(b,u);}
      if(actor===u&&key==='ultimate')for(const to of allies(b,u).filter(t=>t!==u)){
        energy(b,to,to.energyMax*p.Ultra[0],true);
        buff(b,u,to,'尾巴•遣神役鬼','atkPct',p.Ultra[1],p.Ultra[2],{id:'huohuoUlt:'+to.id});}
      // 天赋：我方目标施放终结技时触发治疗。
      if(actor!==u&&actor.side===u.side&&key==='ultimate'&&kind!=='copy'&&blessing(u))talentHeal(b,u,actor);},
    // 天赋：拥有【禳命】时，我方目标回合开始时回复自身，并对生命值百分比过低的我方目标各产生 1 次回复。
    turnStart(b,u,actor){if(actor.side!==u.side||!blessing(u))return;const p=u.kit.params;
      talentHeal(b,u,actor);
      for(const to of allies(b,u).filter(t=>t!==actor&&t.hp/combatPanel(t).hp<=p.Talent[5]))talentHeal(b,u,to);},
    // E1：拥有【禳命】时我方全体速度提高；行迹「贞凶之命」控制类抵抗。
    panel(b,u,to,out){if(to.side!==u.side)return;
      if(rank(u,1)&&blessing(u))out.speed+=(to.baseSpeed??out.speed)*u.kit.ranks[1][0];
      if(to===u&&trace(u,2))out.controlRes=1-(1-(out.controlRes??0))*(1-trace(u,2)[0]);},
    // E2：拥有【禳命】时我方目标受到致命攻击不会倒下，回复其生命上限并消耗 1 回合【禳命】。
    beforeLethal(b,u,from,to){if(to.side!==u.side||!rank(u,2))return false;
      const e=blessing(u);if(!e)return false;
      if((u.resources['免于致命次数']??0)>=u.kit.ranks[2][1])return false;
      resource(b,u,'免于致命次数',(u.resources['免于致命次数']??0)+1);
      heal(b,u,to,combatPanel(to).hp*u.kit.ranks[2][0]);
      e.remaining=Math.max(0,(e.remaining??1)-1);
      if(!e.remaining)u.buffs=u.buffs.filter(x=>x!==e);
      return true;},
    display(b,u,to){const out=[];if(to===u&&blessing(u))out.push({type:'buff',id:u.id+':bless',source:u.id,name:'禳命',key:'marker',value:1,remaining:blessing(u).remaining,tickOwner:u.id,derived:true});
      if(to.side===u.side&&rank(u,1)&&blessing(u))out.push({type:'buff',id:u.id+':bless-speed',source:u.id,name:'岁阳寄体，妖邪依凭 · 速度',key:'speedPct',value:u.kit.ranks[1][0],derived:true});
      return out;},
  };
}
