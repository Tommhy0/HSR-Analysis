// 罗刹 1203：白花之刻 → 生息结界（攻击后治疗 / 行迹附带治疗）、自动战技、终结驱散，
// E1 结界全队攻击、E2 低血增疗或高血护盾、E4 结界虚弱、E6 全属性抗性降低。
export function luocha(api){const {allies,enemies,live,rank,trace,buff,resource,heal,cleanseOne,combatPanel,record,barrier,allResDown}=api;
  const field=u=>u.buffs.find(e=>e.tag==='luochaField');
  const healSkill=(b,u,to)=>{const p=u.kit.params;if(!live(to))return;
    if(trace(u,1))cleanseOne(b,u,to);
    const atk=combatPanel(u).atk,ratio=to.hp/combatPanel(to).hp;
    if(rank(u,2)&&ratio>=.5)barrier(b,u,to,{name:'净庭赐礼 · 护盾',value:atk*u.kit.ranks[2][1]+u.kit.ranks[2][2],duration:u.kit.ranks[2][3],group:'luochaE2'});
    else heal(b,u,to,atk*p.BPSkill[0]+p.BPSkill[1],rank(u,2)&&ratio<.5?u.kit.ranks[2][0]:0);
    const stacks=Math.min(p.Talent[0],(u.resources['白花之刻']??0)+1);resource(b,u,'白花之刻',stacks);
    if(stacks>=p.Talent[0])openField(b,u);};
  const openField=(b,u)=>{const p=u.kit.params;resource(b,u,'白花之刻',0);
    buff(b,u,u,'生息的轮转 · 结界','marker',0,p.Talent[2],{tag:'luochaField',tickOwner:u.id,tickAt:'start'});
    if(rank(u,4))for(const to of enemies(b,u))buff(b,u,to,'荆冠审判 · 虚弱','dmgBoost',-rank(u,4),p.Talent[2],{tickOwner:u.id,tickAt:'start',debuff:true});
    record(b,'mechanic',u,{name:'展开生息结界',duration:p.Talent[2]});};
  return {
    shouldUseSkill(b,u){return allies(b,u).some(t=>t.hp/combatPanel(t).hp<.9);},
    start(b,u){resource(b,u,'白花之刻',0);resource(b,u,'自动战技冷却',0);},
    // 秘技「愚者的悲悯」：下一次战斗开始时立即触发天赋（展开结界）。
    entry(b,u){openField(b,u);},
    before(b,u,actor,key,kind,a){if(actor!==u||key!=='ultimate')return;
      for(const to of enemies(b,u)){const list=to.buffs.filter(e=>!e.debuff&&e.dispellable!==false);
        for(let i=0;i<(u.kit.params.Ultra[1]??0)&&list.length;i++){const e=list.pop();to.buffs=to.buffs.filter(x=>x!==e);record(b,'cleanse',u,{target:to.id,name:e.name,dispel:true});}}},
    after(b,u,actor,key,kind,a,selected,hits){const p=u.kit.params;
      if(actor===u&&key==='skill')healSkill(b,u,selected[0]);
      if(actor===u&&key==='ultimate'){
        const stacks=Math.min(p.Talent[0],(u.resources['白花之刻']??0)+1);resource(b,u,'白花之刻',stacks);
        if(stacks>=p.Talent[0])openField(b,u);
        if(rank(u,6))for(const to of enemies(b,u))allResDown(b,u,to,u.kit.ranks[6][1],u.kit.ranks[6][2]);}
      // 天赋：结界中任意敌方目标受到我方攻击后，攻击者立即回复；行迹「浇灌尘身」让其余队友也回复。
      if(actor.side===u.side&&hits.length&&field(u)){const atk=combatPanel(u).atk;
        heal(b,u,actor,atk*p.Talent[1]+p.Talent[3]);
        if(trace(u,2))for(const to of allies(b,u).filter(t=>t!==actor))heal(b,u,to,atk*trace(u,2)[0]+trace(u,2)[1]);}},
    // 自动战技：我方任意单体生命值百分比 ≤ 阈值时立即触发一次战技效果，不消耗战技点，冷却 2 回合。
    afterDamage(b,u,from,to,kind){if(!to||to.side!==u.side||!live(to))return;const p=u.kit.params;
      if(to.hp/combatPanel(to).hp>p.BPSkill[2])return;
      if((u.resources['自动战技冷却']??0)>u.turns)return;
      resource(b,u,'自动战技冷却',u.turns+p.BPSkill[3]);record(b,'resource',u,{name:'自动战技触发'});
      healSkill(b,u,to);},
    waveStart(b,u){if(rank(u,4)&&field(u))for(const to of enemies(b,u))buff(b,u,to,'荆冠审判 · 虚弱','dmgBoost',-rank(u,4),u.kit.params.Talent[2],{tickOwner:u.id,tickAt:'start',debuff:true});},
    // E1：结界生效时我方全体攻击力提高。
    panel(b,u,to,out){if(to.side===u.side&&rank(u,1)&&field(u))out.atk+=(out.baseStats?.atk??0)*rank(u,1);},
    display(b,u,to){const out=[];if(to===u){out.push({type:'buff',id:u.id+':bloom',source:u.id,name:'白花之刻',key:'marker',value:u.resources['白花之刻']??0,derived:true});
        if(field(u))out.push({type:'buff',id:u.id+':field',source:u.id,name:'生息的轮转 · 结界',key:'marker',value:1,remaining:field(u).remaining,tickOwner:u.id,derived:true});}
      if(to.side!==u.side&&rank(u,4)&&field(u))out.push({type:'buff',id:u.id+':weak',source:u.id,name:'荆冠审判 · 虚弱',key:'dmgBoost',value:-rank(u,4),derived:true,debuff:true});
      return out;},
  };
}
