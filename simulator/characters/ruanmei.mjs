import {BREAK_BASE} from '../game-data.mjs';
// 阮•梅 1303：弦外音（战技增伤 / 弱点击破效率）、结界（抗性穿透 / 残梅绽）、
// 分型的螺旋（我方击破弱点时的额外冰属性击破伤害）、E0～E6 专属机制。
// 所有数值都从 4.6 数据库技能 / 行迹 / 星魂参数读取，不写死倍率。
// 时序依据（4.6 原始数据）：技能说明明确「阮•梅每回合开始时持续回合数减1」，
// 因此弦外音 / 结界都在阮•梅自己的回合开始递减；残梅绽在「敌方目标尝试从
// 弱点击破状态恢复时」触发，引擎把该时点暴露为 beforeRecover，解冻回合不尝试恢复，
// 因此也不会提前消耗残梅绽。
export function ruanmei(api){const {allies,live,rank,trace,buff,energy,resource,delay,combatPanel,record}=api;
  const string=u=>u.buffs.some(e=>e.tag==='ruanMeiString'),field=u=>u.buffs.some(e=>e.tag==='ruanMeiField'),imprint=to=>to.buffs.find(e=>e.tag==='ruanMeiImprint');
  // 冰属性击破伤害基准：等级基数 ×（1+击破特攻）×（0.5 + 最大韧性/120）。
  const iceBreakBase=(u,to)=>{const level=BREAK_BASE[u.level];if(!Number.isFinite(level))return null;
    return level*(1+(combatPanel(u).breakEffect??0))*(.5+(to.toughnessMax??0)/120);};
  const breakDamage=(b,u,to,mult)=>{const base=iceBreakBase(u,to);if(base==null)return;
    b.breaks.damage(b,u,to,base*mult,'Ice',false,'break_additional');};
  // 行迹「落烛照水燃」：击破特攻超过 120% 后每 10% 让战技增伤再提高 6%，上限 36%。
  const stringValue=u=>{const p=u.kit.params,base=p.BPSkill[0],t=trace(u,3);if(!t)return base;
    const be=combatPanel(u).breakEffect??0,steps=Math.floor(Math.max(0,be-t[0])/t[1]+1e-9);
    return base+Math.min(t[3],steps*t[2]);};
  const applyString=(b,u)=>{const p=u.kit.params,value=stringValue(u);
    for(const to of allies(b,u)){
      buff(b,u,to,'弦外音','dmgBoost',value,p.BPSkill[2],{tag:'ruanMeiString',tickOwner:u.id,tickAt:'start'});
      buff(b,u,to,'弦外音 · 破韧','breakEfficiency',p.BPSkill[1],p.BPSkill[2],{tag:'ruanMeiBreak',tickOwner:u.id,tickAt:'start'});
    }};
  return {
    shouldUseSkill(b,u){return !string(u);},
    start(b,u){if(trace(u,1))for(const to of allies(b,u))buff(b,u,to,'物体呼吸中','breakEffect',trace(u,1)[0],null,{removeOnSourceDeath:true});
      // 天赋「分型的螺旋」：除自身以外的队友速度提高（4.6 天赋 #1[f1]%）。
      for(const to of allies(b,u))if(to!==u)buff(b,u,to,'分型的螺旋 · 速度','speedPct',u.kit.params.Talent[0],null,{removeOnSourceDeath:true});},
    // 秘技「拭琴抚罗袂」：战斗开始时自动触发一次不消耗战技点的战技。
    entry(b,u){if(!string(u))applyString(b,u);},
    after(b,u,actor,key,kind,a,selected,hits){const p=u.kit.params;
      if(actor===u){
        if(key==='skill')applyString(b,u);
        if(key==='ultimate'){
          // 结界回合数在阮•梅自己回合开始时递减；E6 延长 1 回合。
          const duration=p.Ultra[1]+rank(u,6);
          buff(b,u,u,'摇花缎水，沾衣不摘','marker',0,duration,{tag:'ruanMeiField',tickAt:'start',tickOwner:u.id});
          for(const to of allies(b,u))buff(b,u,to,'结界 · 抗性穿透','resPen',p.Ultra[0],duration,{tag:'ruanMeiPen',tickAt:'start',tickOwner:u.id});
        }
      }
      // 结界中我方攻击后给被命中的敌方附加【残梅绽】；该目标从弱点击破恢复前不可重复附加。
      if(field(u)&&actor.side===u.side&&hits.length)for(const to of hits.filter(t=>live(t)&&t.side!==u.side))if(!to.resources['残梅绽锁定']&&!imprint(to)){
        buff(b,u,to,'残梅绽','marker',0,null,{tag:'ruanMeiImprint',debuff:true,tickOwner:to.id,tickAt:'end',removeOnSourceDeath:true});
        resource(b,to,'残梅绽锁定',1);
      }
    },
    // 天赋「分型的螺旋」：我方任意角色击破敌方弱点时，阮•梅造成一次冰属性击破伤害；E4 先叠自身击破特攻。
    afterDamage(b,u,from,to,kind){
      if(!from||kind!=='break'||from.side!==u.side||to.side===u.side||!live(to))return;
      if(rank(u,4))buff(b,u,u,'寻神铜镜前','breakEffect',u.kit.ranks[4][0],u.kit.ranks[4][1],{tag:'ruanMeiE4',tickAt:'start',tickOwner:u.id});
      breakDamage(b,u,to,u.kit.params.Talent[1]+rank(u,6,1));
    },
    // 行迹「日消遐思长」：阮•梅的回合开始时自身恢复 5 点能量。
    turnStart(b,u,actor){if(actor===u&&trace(u,2))energy(b,u,trace(u,2)[0]);},
    // 【残梅绽】在敌方目标「尝试从弱点击破状态恢复」时触发：延长击破（阻止本次恢复）、
    // 按其击破特攻延后行动，并造成冰属性击破伤害；触发后锁定仍然存在。
    beforeRecover(b,u,actor){if(actor.side===u.side)return false;
      const mark=imprint(actor);
      if(actor.broken&&mark){
        actor.buffs=actor.buffs.filter(e=>e!==mark);
        const p=u.kit.params,be=combatPanel(u).breakEffect??0,extra=be*p.Ultra[2]+p.Ultra[3];
        breakDamage(b,u,actor,p.Ultra[4]);
        delay(b,actor.id,extra);
        resource(b,u,'残梅绽触发次数',(u.resources['残梅绽触发次数']??0)+1);
        record(b,'mechanic',u,{name:'残梅绽 · 延长弱点击破',target:actor.id,delay:extra});
        return true;
      }
      // 真正恢复时解除「不可重复附加」限制。
      if(actor.resources['残梅绽锁定'])resource(b,actor,'残梅绽锁定',0);
      return false;
    },
    modifiers(b,u,actor,to,a,kind){const out={};if(actor.side!==u.side||to.side===u.side)return out;
      if(rank(u,2)&&to.broken)out.atkPct=rank(u,2);           // E2：对击破状态敌人攻击力提高 40%
      if(rank(u,1)&&field(u))out.defIgnore=rank(u,1);          // E1：结界中造成伤害无视 20% 防御
      return out;},
    // 弦外音期间我方全体弱点击破效率提高（引擎按 (1+breakEfficiency) 放大削韧），
    // 由战技一并施加的「弦外音 · 破韧」增益承载，随弦外音一起到期。
    display(b,u,to){if(to!==u)return [];const out=[];
      if(string(u))out.push({type:'buff',id:u.id+':string',source:u.id,name:'弦外音 · 增伤',key:'dmgBoost',value:stringValue(u),derived:true});
      if(field(u))out.push({type:'buff',id:u.id+':field',source:u.id,name:'结界 · 抗性穿透',key:'resPen',value:u.kit.params.Ultra[0],derived:true});
      return out;},
  };
}
