// DeepSeek batch-04：4 名巡猎角色（希儿 1102 / 彦卿 1209 / 托帕&账账 1112 / 貊泽 1223）。
//
// 数值契约：_data_cache/hsr_core.json（4.6，按 charId 筛选）、simulator/roster-data.mjs 的 ROSTER_DATA。
// 真段数 / 时序 / 触发条件：_data_cache/strict_research/Avatar_<Name>_00_Ability.json（固定提交
// 312b4597691e0a29cf9828a15b592757dba86949）。
//
// hitShares 逐条依据（原始脚本 -> 分段）：
//   1102 普攻 Avatar_Seele_00_Skill01_Phase02：HitSplitRatio [0.3,0.7]（2 段）。
//   1102 战技 Avatar_Seele_00_Skill02_Phase02：4 个 AttackData 无 HitSplitRatio，用其
//        DamagePercentage.FixedValues [0.2,0.1,0.1,0.6]（和=1，段数=4）。ROSTER_DATA.hits 因缺
//        HitSplitRatio 落成未归一化的 [1,1,1,1]，故此处以原始脚本系数为准。
//   1102 终结 Avatar_Seele_00_Skill03_Phase02：1 段（AttackType=Pursued 的 rank6 节点单列）。
//   1209 普攻 Skill01_Phase02：HitSplitRatio [0.5,0.25,0.25]（3 段）。
//   1209 战技 Skill02_Phase02：LoopExecuteTaskList MaxLoopCount=3 × HitSplitRatio 0.25 + 收尾
//        0.25 => 4 段各 0.25（ROSTER_DATA.hits 只统计直挂节点，漏了循环 3 段）。
//   1209 终结 Skill03_Phase02：1 段；1209 天赋追击 PassiveSkill01_InsertAbilityPhase02：[0.3,0.7]。
//   1112 普攻 Skill01_Phase02：1 段；普攻伤害按行迹「透支」以追击结算（basicShot）。
//   1112 战技 / 账账攻击：Skill02_Phase02 无涨幅时 LoopExecuteTaskListWithInterval 7 段各 1/7；
//        【涨幅惊人！】时 7 段 ×0.1 + 收尾 0.3 = 8 段（BE_UltraAttackDamage 同构）。
//        「伤害倍率提高 Ultra[0]」按加法口径：原始脚本增强节点攻击表达式 AQABAQIR 为「基础倍率 +
//        Skill03_P1_BEDamageRatio」两动态相加（同一 OpCode 在 Avatar_Acheron 中用于计数器相加，
//        而 AQAAAAQR/AQAAAAUR 才是乘 / 除常数），故涨幅倍率 = Talent[1] + Ultra[0]。
//   1112 终结 Skill03_Phase02：无伤害（伤害由账账结算）。
//   1223 普攻 Skill01_Phase02：1 段；战技 Skill02_Phase02：[0.15,0.15,0.7]（3 段）；
//        终结 Skill03_Phase02：1 段（行迹「不折镆干」使其按追击结算，单列 ultStrike）。
//   1223 天赋附加伤害（ShadowTarget 修正器 OnAfterBeingAttacked 的 Pursued 节点）：1 段；
//        说明文本为「附加伤害」，故按 additional 结算。
//   1223 天赋追击 Insert_Phase01：OnStart 单段 0.6 + TriggerParallelTaskListTemplate
//        ParallelCount 份 0.08 => 0.6+5×0.08=1，共 6 段（[0.08×5, 0.6]）。E6「倍率提高 25%」同按加法。
// 说明：ROSTER_DATA.hits 只统计直挂 AttackData 且 HitSplitRatio 缺省记 1，故 1102 战技、
//       1209 战技、1112 战技 / 账账、1223 天赋追击的段数与权重以原始脚本循环 / 系数展开为准。
import {atk,basic,skill,ultimate,talentAction} from '../actions.mjs';

export const IDS=[1102,1209,1112,1223];

// ─────────────────────────────── 动作表 ───────────────────────────────
const actions={
  // 希儿：普攻 2 段、战技 4 段、终结 1 段；增幅 / 额外回合 / 乱蝶均由 handlers 结算。
  1102:(p,d)=>({
    basic:basic(p,d,{terms:atk(p.Normal[0]),hitShares:[.3,.7],toughness:30}),
    skill:skill(p,d,{terms:atk(p.BPSkill[0]),hitShares:[.2,.1,.1,.6],toughness:60}),
    ultimate:ultimate(p,d,{terms:atk(p.Ultra[0]),hitShares:[1],toughness:90}),
  }),
  // 彦卿：普攻 3 段、战技 4 段、终结 1 段、天赋追击 2 段。
  1209:(p,d)=>({
    basic:basic(p,d,{terms:atk(p.Normal[0]),hitShares:[.5,.25,.25],toughness:30}),
    skill:skill(p,d,{terms:atk(p.BPSkill[0]),hitShares:[.25,.25,.25,.25],toughness:60}),
    ultimate:ultimate(p,d,{terms:atk(p.Ultra[2]),hitShares:[1],toughness:90}),
    followup:talentAction(p,d,{terms:atk(p.Talent[3]),hitShares:[.3,.7],toughness:30,energyGain:0}),
  }),
  // 托帕&账账：普攻 / 战技伤害按追击结算（行迹「透支」+ 战技说明）；
  // 账账为独立行动条召唤物，其攻击分普通 7 段与【涨幅惊人！】8 段两套。
  1112:(p,d)=>({
    basic:basic(p,d,{terms:[],toughness:0}),
    basicShot:basic(p,d,{name:'赤字… · 追击',terms:atk(p.Normal[0]),hitShares:[1],toughness:30,energyGain:0,spGain:0}),
    skill:skill(p,d,{terms:[],toughness:0}),
    numby:talentAction(p,d,{name:'账账 · 突击',terms:atk(p.Talent[1]),hitShares:Array(7).fill(1/7),toughness:60,energyGain:0,numby:true}),
    numbyUlt:talentAction(p,d,{name:'账账 · 涨幅惊人！',terms:atk(p.Talent[1]+p.Ultra[0]),hitShares:[...Array(7).fill(.1),.3],toughness:60,energyGain:0,numby:true}),
    ultimate:ultimate(p,d,{target:'self',terms:[],toughness:0}),
  }),
  // 貊泽：普攻 1 段、战技 3 段、终结伤害按追击结算（行迹「不折镆干」）、
  // 天赋附加伤害 1 段、天赋追击 6 段；E6 提高天赋追击倍率。
  1223:(p,d,{eidolon=0}={})=>({
    basic:basic(p,d,{terms:atk(p.Normal[0]),hitShares:[1],toughness:30}),
    skill:skill(p,d,{terms:atk(p.BPSkill[0]),hitShares:[.15,.15,.7],toughness:60}),
    ultimate:ultimate(p,d,{terms:[],toughness:0}),
    ultStrike:talentAction(p,d,{name:'锋入幽渺，影出凌厉 · 追击',terms:atk(p.Ultra[0]),hitShares:[1],toughness:90,energyGain:0}),
    talentAdditional:talentAction(p,d,{name:'伸天卑飞 · 附加伤害',terms:atk(p.Talent[0]),hitShares:[1],toughness:0,energyGain:0}),
    talentFollowup:talentAction(p,d,{name:'伸天卑飞 · 追加攻击',terms:atk(p.Talent[2]+(eidolon>=6?d.ranks['6'][0]:0)),hitShares:[...Array(5).fill(.08),.6],toughness:30,energyGain:0}),
  }),
};

const additional=(element,mult)=>({name:'附加伤害',type:'Additional',element,terms:[{scaling:'atk',multiplier:mult}],toughness:0,hitShares:[1]});

// ─────────────────────────────── 1102 希儿 ───────────────────────────────
// 战技 / 终结进入【增幅】：伤害提高 Talent[0]，持续 Talent[1] 回合；
// 行迹「割裂」=trace2 增幅态量子抗性穿透；行迹「涟漪」=trace3 普攻后行动提前；
// 天赋【再现】=普攻/战技/终结击杀 -> 额外回合 + 增幅（由天赋获得的额外回合内击杀不触发）；
// E1 低血暴击率、E2 战技加速可叠 2 层、E4 击杀回能、E6【乱蝶】附加伤害。
function seele(api){const {allies,enemies,live,rank,trace,buff,stacks,resource,energy,advance,combatPanel,damageTo,record}=api;
  const amplified=u=>!!u.buffs.find(e=>e.tag==='seeleAmplify');
  const amplify=(b,u,duration)=>buff(b,u,u,'增幅','dmgBoost',u.kit.params.Talent[0],duration,{tag:'seeleAmplify'});
  return {
    start(b,u){resource(b,u,'增幅',0);},
    // 秘技「幻身」：入战后立即进入增幅（原始脚本 SkillMazeInLevel 无伤害节点）。
    entry(b,u){amplify(b,u,u.kit.params.Talent[1]);record(b,'mechanic',u,{name:'幻身 · 进入增幅'});},
    shouldUseSkill(b,u){return !amplified(u)||b.sp>1;},
    before(b,u,actor,key,kind,a,selected){if(actor!==u)return;
      if(key==='ultimate'){amplify(b,u,u.kit.params.Talent[1]);
        if(rank(u,6))for(const to of selected)buff(b,u,to,'乱蝶','marker',0,u.kit.ranks[6][1],{tag:'seeleButterfly',debuff:true,removeOnSourceDeath:true});}},
    after(b,u,actor,key,kind,a,selected,hits){if(actor!==u)return;const p=u.kit.params;
      if(key==='skill'){
        if(rank(u,2))stacks(b,u,u,'归刃 · 加速','speedPct',p.BPSkill[1],u.kit.ranks[2][0],p.BPSkill[2],{id:u.id+':seeleSpeed'});
        else buff(b,u,u,'归刃 · 加速','speedPct',p.BPSkill[1],p.BPSkill[2],{id:u.id+':seeleSpeed'});}
      if(key==='basic'&&trace(u,3))advance(b,u.id,trace(u,3)[0]);},
    // 天赋【再现】。额外回合用队列结算，不重置行动条；天赋回合内击杀不再触发。
    death(b,u,from,to){if(to.side===u.side)return;const act=b.activeAction;
      if(!act||act.actor!==u.id||!['basic','skill','ultimate'].includes(act.key)||act.kind==='extra')return;
      amplify(b,u,u.kit.params.Talent[1]);
      if(rank(u,4))energy(b,u,u.kit.ranks[4][0]);
      const key=b.sp>=(u.actions.skill.spCost??0)?'skill':'basic';
      b.queue.push({actor:u.id,key,kind:'extra',targetId:to.id});
      record(b,'mechanic',u,{name:'再现 · 额外回合',key});},
    // E6【乱蝶】：被攻击后额外受到一次等同于本次终结技伤害 15% 的量子附加伤害。
    attacked(b,u,to,from){const e=to.buffs.find(x=>x.source===u.id&&x.tag==='seeleButterfly');
      if(!e||!from||from.side===to.side)return;
      damageTo(b,u,to,additional('Quantum',u.kit.params.Ultra[0]*u.kit.ranks[6][0]),1,'primary','additional');},
    modifiers(b,u,actor,to,a,kind){if(actor!==u)return {};const out={};
      if(amplified(u)&&a.element==='Quantum'&&trace(u,2))out.resPen=trace(u,2)[0];
      if(rank(u,1)&&to.hp/combatPanel(to).hp<=u.kit.ranks[1][0])out.critRate=u.kit.ranks[1][1];
      return out;},
    // 行迹「夜行」：低血时被攻击概率降低。
    panel(b,u,to,out){const t=trace(u,1);if(!t||to!==u)return;if(u.hp/out.hp<=t[0])out.aggroRatio=(out.aggroRatio??1)*(1-t[1]);},
    display(b,u,to){if(to!==u)return [];const out=[];
      if(amplified(u))out.push({type:'buff',id:u.id+':seeleAmplify',source:u.id,name:'增幅 · 伤害提高',key:'dmgBoost',value:u.kit.params.Talent[0],derived:true});
      if(trace(u,2))out.push({type:'buff',id:u.id+':seelePen',source:u.id,name:'割裂 · 量子抗性穿透',key:'resPen',value:trace(u,2)[0],derived:true,note:'仅增幅状态下'});
      return out;},
  };
}

// ─────────────────────────────── 1209 彦卿 ───────────────────────────────
// 战技附加【智剑连心】：暴击率 Talent[0] / 暴击伤害 Talent[1]、被攻击概率降低，受击后消失；
// 终结先加 Ultra[0] 暴击率、智剑连心时再加 Ultra[1] 暴击伤害；天赋在智剑连心时以 Talent[2] 固定概率
// 发动追击并 Talent[5] 基础概率冻结（冻结期间回合开始受 Talent[4] 附加伤害）；
// 行迹「颁冰」攻击冰弱点附加伤害、「凌霜」效果抵抗、「轻吕」暴击提速；
// E1 打冻结目标附加伤害、E2 智剑连心回能效率、E4 高血冰抗穿、E6 击杀延长增益。
function yanqing(api){const {live,rank,trace,buff,resource,energy,advance,combatPanel,dot,damageTo}=api;
  const soul=u=>u.buffs.find(e=>e.tag==='soulsteel');
  const frozen=to=>[...to.buffs,...to.dots].some(e=>e.control==='freeze');
  const iceWeak=to=>(to.weaknesses??[]).includes('Ice')||to.buffs.some(e=>e.weakness==='Ice');
  return {
    start(b,u){resource(b,u,'智剑连心',0);},
    // 秘技「御剑真诀」：对当前生命百分比 ≥ Maze[0] 的目标增伤 Maze[1]，持续 Maze[2] 回合。
    entry(b,u){buff(b,u,u,'御剑真诀','marker',0,u.kit.params.Maze[2],{tag:'yqMaze'});},
    before(b,u,actor,key,kind,a,selected){if(actor!==u)return;
      if(key==='skill')buff(b,u,u,'智剑连心','marker',0,1,{tag:'soulsteel'});
      if(key==='ultimate'){
        buff(b,u,u,'快雨燕逐 · 暴击率','critRate',u.kit.params.Ultra[0],1,{tag:'yqUlt'});
        if(soul(u))buff(b,u,u,'快雨燕逐 · 暴击伤害','critDmg',u.kit.params.Ultra[1],1,{tag:'yqUlt',id:u.id+':yqUltCrit'});}},
    after(b,u,actor,key,kind,a,selected,hits){if(actor!==u)return;const p=u.kit.params;
      // E1：攻击冻结目标时立即追加一次冰属性附加伤害。
      if(rank(u,1))for(const to of hits.filter(live))if(frozen(to))damageTo(b,u,to,additional('Ice',u.kit.ranks[1][0]),1,'primary','additional');
      // 行迹「颁冰」：施放攻击后对带冰弱点的目标附加伤害。
      if(trace(u,1))for(const to of hits.filter(live))if(iceWeak(to))damageTo(b,u,to,additional('Ice',trace(u,1)[0]),1,'primary','additional');
      if(key==='followup'){if(hits.length)for(const to of hits.filter(live))dot(b,u,to,{name:'呼剑如影 · 冻结',element:'Ice',terms:[{scaling:'atk',multiplier:p.Talent[4]}],chance:p.Talent[5],duration:1,extra:{control:'freeze',id:u.id+':yq-freeze'}});return;}
      // 天赋追击：智剑连心下攻击后按固定概率触发（追击本身不再触发）。
      if(hits.length&&soul(u)&&b.random()<p.Talent[2])b.queue.push({actor:u.id,key:'followup',kind:'followup',targetId:hits[0].id});},
    // 行迹「轻吕」：暴击后提速。
    afterHit(b,u,actor,to,a,kind,info){if(actor!==u||!trace(u,3)||info?.critMode!=='crit')return;
      buff(b,u,u,'轻吕 · 速度','speedPct',trace(u,3)[0],trace(u,3)[1],{id:u.id+':yqSpeed'});},
    // 受到伤害后【智剑连心】消失。
    attacked(b,u,to){if(to!==u)return;u.buffs=u.buffs.filter(e=>e.tag!=='soulsteel');},
    // E6：击杀时延长【智剑连心】与终结技增益 1 回合（彦卿 E6 无数值参数，按星魂等级判定）。
    death(b,u,from,to){if(to.side===u.side||from!==u||u.kit.eidolon<6)return;
      for(const e of u.buffs)if((e.tag==='soulsteel'||e.tag==='yqUlt')&&e.remaining!=null)e.remaining+=1;},
    modifiers(b,u,actor,to,a,kind){if(actor!==u)return {};const out={};
      if(soul(u)){out.critRate=u.kit.params.Talent[0];out.critDmg=u.kit.params.Talent[1];}
      if(rank(u,4)&&u.hp/combatPanel(u).hp>=u.kit.ranks[4][0])out.resPen=(out.resPen??0)+u.kit.ranks[4][1];
      if(u.buffs.some(e=>e.tag==='yqMaze')&&to.hp/combatPanel(to).hp>=u.kit.params.Maze[0])out.dmgBoost=(out.dmgBoost??0)+u.kit.params.Maze[1];
      return out;},
    panel(b,u,to,out){if(to!==u)return;const p=u.kit.params;
      if(soul(u)){out.aggroRatio=(out.aggroRatio??1)*0.5;if(trace(u,2))out.effectRes=(out.effectRes??0)+trace(u,2)[0];if(rank(u,2))out.energyRegen=(out.energyRegen??0)+u.kit.ranks[2][0];}},
    display(b,u,to){if(to!==u)return [];const out=[];
      if(soul(u))out.push({type:'buff',id:u.id+':soulsteel',source:u.id,name:'智剑连心 · 双暴',key:'critRate',value:u.kit.params.Talent[0],derived:true});
      return out;},
  };
}

// ─────────────────────────────── 1112 托帕&账账 ───────────────────────────────
// 账账 = kind:'countdown' 召唤物（速度 Talent[0]），行动时对【负债证明】目标发动追击；
// 战技施加【负债证明】（受到的追击伤害 +BPSkill[1]）并由账账追击（按追击结算）；
// 终结使账账进入【涨幅惊人！】（倍率 ×(1+Ultra[0])、暴伤 +Ultra[1]、追击 7 段变 8 段、
// 我方普攻/战技/终结命中标记目标时账账行动提前 Ultra[2]），攻击 Ultra[3] 次后退出；
// 行迹「透支」普攻按追击结算、「金融动荡」火弱点增伤、「技术性调整」涨幅攻击回能；
// E1【被执行】追击暴伤叠 2 层、E2 账账行动回能、E4 账账回合提前托帕、E6 涨幅攻击次数 +1 与火抗穿。
function topaz(api){const {allies,enemies,live,rank,trace,buff,stacks,resource,energy,advance,combatPanel,damageTo,record}=api;
  const mark=(u,to)=>to.buffs.find(e=>e.source===u.id&&e.tag==='topazDebt');
  const marked=(b,u)=>enemies(b,u).find(t=>mark(u,t));
  const numby=(b,u)=>b.summons.find(s=>s.owner===u.id&&s.kind==='countdown');
  const applyMark=(b,u,to)=>{for(const t of b.units)t.buffs=t.buffs.filter(e=>!(e.source===u.id&&(e.tag==='topazDebt'||e.tag==='topazExecuted')));
    buff(b,u,to,'负债证明','marker',0,null,{tag:'topazDebt',debuff:true,removeOnSourceDeath:true});};
  const advanceNumby=(b,u,ratio)=>{const s=numby(b,u);if(!s)return;s.distance=Math.max(0,s.distance-10000*ratio);record(b,'advance',u,{name:'账账行动提前',target:s.id,ratio,distance:s.distance});};
  const numbyAttack=(b,u,to)=>{const s=numby(b,u),enhanced=!!(s&&s.enhanced>0),a=enhanced?u.actions.numbyUlt:u.actions.numby;
    for(const share of a.hitShares)damageTo(b,u,to,a,share,'primary','followup');
    if(s&&enhanced){s.enhanced--;resource(b,u,'涨幅惊人',s.enhanced);
      if(trace(u,3))energy(b,u,trace(u,3)[0]);record(b,'mechanic',u,{name:'账账涨幅攻击',remaining:s.enhanced});}
    if(u.resources['明补待触发']){resource(b,u,'明补待触发',0);energy(b,u,u.kit.params.Maze[0],true);}};
  return {
    start(b,u){resource(b,u,'涨幅惊人',0);
      b.summons.push({id:u.id+':numby',name:'账账',owner:u.id,kind:'countdown',speed:u.kit.params.Talent[0],distance:10000,enhanced:0,active:true,order:b.units.length+b.summons.length});
      record(b,'summon',u,{name:'召唤账账',speed:u.kit.params.Talent[0]});},
    // 秘技「明补」：账账首次攻击后托帕恢复 60 点能量（不吃回能效率）。
    entry(b,u){resource(b,u,'明补待触发',1);},
    // 我方目标回合开始时若无【负债证明】，随机敌方目标重新陷入。
    turnStart(b,u,actor){if(actor.side!==u.side||marked(b,u))return;const pool=enemies(b,u);if(!pool.length)return;
      applyMark(b,u,pool[Math.floor(b.random()*pool.length)]);},
    // 终结：账账进入【涨幅惊人！】。
    before(b,u,actor,key,kind,a,selected){if(actor!==u||key!=='ultimate')return;const s=numby(b,u);if(!s)return;
      s.enhanced=u.kit.params.Ultra[3]+(rank(u,6)?u.kit.ranks[6][0]:0);s.active=true;resource(b,u,'涨幅惊人',s.enhanced);
      record(b,'resource',u,{name:'涨幅惊人',value:s.enhanced});},
    after(b,u,actor,key,kind,a,selected,hits){const p=u.kit.params;
      const enhancedBeforeAttack=!!(numby(b,u)?.enhanced>0);
      let ownFollowupTarget=null;
      if(actor===u){
        if(key==='basic'){const to=selected[0];if(to&&live(to)){
          const isFollowup=!!trace(u,1);
          damageTo(b,u,to,u.actions.basicShot,1,'primary',isFollowup?'followup':'direct');
          if(isFollowup)ownFollowupTarget=to;
        }}
        if(key==='skill'){const to=selected[0];if(to)applyMark(b,u,to);if(to&&live(to)){
          numbyAttack(b,u,to);ownFollowupTarget=to;
        }}
      }
      // 涨幅期间：标记目标被我方普攻 / 战技 / 终结命中时，账账行动提前（不限于托帕自己的动作）。
      // 天赋 111204：我方目标对【负债证明】目标发动追加攻击时，账账行动提前 Talent[2]=50%；
      // 「在账账自身回合内，无法触发行动提前效果」，故排除账账自己的行动。
      const s=numby(b,u);
      // 自身伤害在此after内才结算，传入hits是此前的快照；不能靠外层normal kind识别内部追击。
      const hitDebt=hits.some(t=>mark(u,t))||(ownFollowupTarget&&mark(u,ownFollowupTarget));
      if(s&&b.turnActor!==s.id&&actor?.side===u.side&&hitDebt){
        if(kind==='followup'||ownFollowupTarget)advanceNumby(b,u,p.Talent[2]);
        // 普攻/战技本身可以视为追击，两条独立条件均满足时分别生效；使用攻击前状态覆盖最后一次涨幅攻击。
        if(enhancedBeforeAttack&&['Normal','BPSkill','Ultra'].includes(a.type))advanceNumby(b,u,p.Ultra[2]);
      }},
    // E1【被执行】：标记目标受到追击时叠暴伤（单次攻击最多 1 次，标记移除时一并移除）。
    afterHit(b,u,actor,to,a,kind,info){void info;if(!rank(u,1)||kind!=='followup'||!actor||actor.side!==u.side||!mark(u,to))return;
      const seq=b.activeAction?.sequence;
      if(seq!=null&&u.resources['被执行标记']===seq)return;
      if(seq!=null)resource(b,u,'被执行标记',seq);
      stacks(b,u,to,'被执行','marker',0,u.kit.ranks[1][1],null,{id:u.id+':topazExecuted',debuff:true,tag:'topazExecuted'});},
    // 账账自身回合：E4 提前托帕，攻击标记目标，E2 回能。
    summonTurn(b,u,s){if(s.kind!=='countdown'||s.owner!==u.id)return;
      if(!live(u)){s.active=false;return;}
      if(rank(u,4))advance(b,u.id,u.kit.ranks[4][0]);
      const to=marked(b,u)??enemies(b,u).slice().sort((a,c)=>a.hp-c.hp)[0];
      if(!to){record(b,'mechanic',u,{name:'账账无目标'});return;}
      numbyAttack(b,u,to);
      if(rank(u,2))energy(b,u,u.kit.ranks[2][0]);},
    modifiers(b,u,actor,to,a,kind){const out={};
      // 【负债证明】是「受到的追加攻击伤害提高 BPSkill[1]=50%」，属易伤乘区（vuln），不是增伤（dmgBoost）。
      if(kind==='followup'&&actor&&actor.side===u.side&&mark(u,to))out.vuln=(out.vuln??0)+u.kit.params.BPSkill[1];
      if(actor===u&&trace(u,2)&&a.element==='Fire'&&((to.weaknesses??[]).includes('Fire')||to.buffs.some(e=>e.weakness==='Fire')))out.dmgBoost=(out.dmgBoost??0)+trace(u,2)[0];
      if(a.numby){const s=numby(b,u);
        if(s&&s.enhanced>0){out.critDmg=(out.critDmg??0)+u.kit.params.Ultra[1];if(rank(u,6))out.resPen=(out.resPen??0)+u.kit.ranks[6][1];}}
      const e=to.buffs.find(x=>x.source===u.id&&x.tag==='topazExecuted');
      if(e&&kind==='followup'&&rank(u,1))out.critDmg=(out.critDmg??0)+(e.stacks??0)*u.kit.ranks[1][0];
      void actor;return out;},
    display(b,u,to){const s=numby(b,u);if(!s)return [];const out=[];
      out.push({type:'buff',id:s.id+':timer',source:u.id,name:'账账行动条',key:'speed',value:s.speed,remaining:s.speed>0?Math.round(s.distance/s.speed*100)/100:null,derived:true,note:'剩余行动值'});
      if(s.enhanced>0)out.push({type:'buff',id:s.id+':enhance',source:u.id,name:'涨幅惊人！剩余攻击次数',key:'marker',value:s.enhanced,derived:true});
      if(to&&to.side!==u.side&&mark(u,to))out.push({type:'debuff',id:u.id+':topazDebt',source:u.id,name:'负债证明 · 受追击额外伤害',key:'vuln',value:u.kit.params.BPSkill[1],derived:true});
      return out;},
  };
}

// ─────────────────────────────── 1223 貊泽 ───────────────────────────────
// 战技标记【猎物】并获 BPSkill[1] 点充能；场上存在【猎物】时进入离场（无法行动 / 不可选中）；
// 我方其他目标攻击【猎物】后：附加伤害 Talent[0]、消耗 1 充能、E1 回能，每 Talent[1] 点充能发动
// 一次天赋追击 Talent[2]；充能归零解除【猎物】并重置计数。终结伤害按行迹「不折镆干」以追击结算，
// 并附带一次天赋追击；行迹「墨毫绣衣」追击后回战技点（1 回合 CD）、「手奋匕尺」解除离场 / 每波次提前；
// E2 全体对【猎物】暴伤、E4 终结后增伤、E6 天赋追击倍率。
function moze(api){const {allies,enemies,live,rank,trace,buff,resource,energy,advance,sp,combatPanel,damageTo,record}=api;
  const prey=(u,to)=>to.buffs.find(e=>e.source===u.id&&e.tag==='mozePrey');
  const marked=(b,u)=>enemies(b,u).find(t=>prey(u,t));
  const clearPrey=(b,u)=>{for(const t of b.units)t.buffs=t.buffs.filter(e=>!(e.source===u.id&&e.tag==='mozePrey'));};
  const exitShadow=(b,u)=>{if(!u.resources['离场'])return;resource(b,u,'离场',0);u.cannotAct=false;
    if(trace(u,2))advance(b,u.id,trace(u,2)[0]);record(b,'mechanic',u,{name:'解除离场'});};
  const enterShadow=(b,u)=>{resource(b,u,'离场',1);u.cannotAct=true;record(b,'mechanic',u,{name:'进入离场'});};
  return {
    start(b,u){resource(b,u,'离场',0);if(rank(u,1))energy(b,u,u.kit.ranks[1][1]);},
    // 秘技「胁翼匿迹」：隐身处入战，伤害提高 Maze[1]，持续 Maze[2] 回合。
    entry(b,u){buff(b,u,u,'胁翼匿迹','dmgBoost',u.kit.params.Maze[1],u.kit.params.Maze[2],{id:u.id+':mozeMaze'});},
    // 行迹「手奋匕尺」：每波次开始行动提前。
    waveStart(b,u){if(trace(u,2))advance(b,u.id,trace(u,2)[1]);},
    shouldUseSkill(b,u){return allies(b,u).some(t=>t!==u);},
    before(b,u,actor,key,kind,a,selected){if(actor!==u||key!=='ultimate')return;
      if(rank(u,4))buff(b,u,u,'锋入幽渺 · 增伤','dmgBoost',u.kit.ranks[4][0],u.kit.ranks[4][1],{id:u.id+':mozeE4'});},
    after(b,u,actor,key,kind,a,selected,hits){if(actor!==u)return;const p=u.kit.params;
      if(key==='skill'){const to=selected[0];if(!to)return;
        clearPrey(b,u);buff(b,u,to,'猎物','marker',0,null,{tag:'mozePrey',debuff:true,removeOnSourceDeath:true});
        resource(b,u,'充能',p.BPSkill[1]);resource(b,u,'追击计数',0);enterShadow(b,u);}
      if(key==='ultimate'){const to=selected[0];
        if(to&&live(to))damageTo(b,u,to,u.actions.ultStrike,1,'primary','followup');
        const target=to&&live(to)?to:enemies(b,u)[0];if(to)b.queue.push({actor:u.id,key:'talentFollowup',kind:'followup',targetId:target?.id});}
      // 行迹「墨毫绣衣」：天赋追击后恢复战技点（1 回合 CD）。1223101「该效果在 #2=1 回合后可再次触发」，
      // 冷却计时者为貊泽自身回合（此前用全场回合 b.turns，会在队友回合间过早重置）。
      if(key==='talentFollowup'&&trace(u,1)&&u.turns>(u.resources['墨毫绣衣回合']??-99)){
        resource(b,u,'墨毫绣衣回合',u.turns);sp(b,u,trace(u,1)[0],'墨毫绣衣');}
      void kind;void hits;},
    // 天赋：我方其他目标攻击【猎物】后结算附加伤害 / 充能 / 追击。
    attacked(b,u,to,from){if(!from||from.side!==u.side||from===u||!prey(u,to))return;const p=u.kit.params;
      damageTo(b,u,to,u.actions.talentAdditional,1,'primary','additional');
      if(rank(u,1))energy(b,u,u.kit.ranks[1][0]);
      resource(b,u,'充能',Math.max(0,(u.resources['充能']??0)-1));
      const n=(u.resources['追击计数']??0)+1;
      if(n>=p.Talent[1]){resource(b,u,'追击计数',0);b.queue.push({actor:u.id,key:'talentFollowup',kind:'followup',targetId:to.id});}
      else resource(b,u,'追击计数',n);
      if((u.resources['充能']??0)<=0){clearPrey(b,u);exitShadow(b,u);}},
    death(b,u,from,to){void from;if(to.side===u.side)return;if(prey(u,to)){clearPrey(b,u);exitShadow(b,u);}},
    modifiers(b,u,actor,to,a,kind){const out={};void actor;
      if(rank(u,2)&&prey(u,to))out.critDmg=(out.critDmg??0)+u.kit.ranks[2][0];
      if(trace(u,3)&&kind==='followup'&&prey(u,to))out.vuln=(out.vuln??0)+trace(u,3)[0];
      return out;},
    panel(b,u,to,out){if(to!==u)return;if(u.resources['离场'])out.aggroRatio=0;},
    display(b,u,to){if(to!==u)return [];const out=[];
      if(u.resources['离场'])out.push({type:'buff',id:u.id+':mozeShadow',source:u.id,name:'离场 · 不可选中',key:'marker',value:1,derived:true});
      out.push({type:'buff',id:u.id+':mozeCharge',source:u.id,name:'充能',key:'marker',value:u.resources['充能']??0,derived:true});
      if(marked(b,u))out.push({type:'debuff',id:u.id+':mozePrey',source:u.id,name:'猎物 · 受追击增伤',key:'vuln',value:trace(u,3)?.[0]??0,derived:true});
      void combatPanel;return out;},
  };
}

const factories={1102:seele,1209:yanqing,1112:topaz,1223:moze};
export {factories,actions};
