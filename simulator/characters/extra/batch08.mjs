// DeepSeek 独立角色批次 08：1310 流萤 / 1315 波提欧 / 1317 乱破 / 8006 开拓者•同谐
//
// 数据依据（固定 4.6 数据，未编造）：
//  · `_data_cache/hsr_core.json`（按 charId 过滤）：技能 desc 的 `#n` 与 `params[等级].param_list`、
//    行迹（type=3）、星魂 1~6。
//  · `simulator/roster-data.mjs` 的 ROSTER_DATA：分等级 param_list、stance（削韧）、spBase（回能）、
//    bpNeed / bpAdd（战技点）、hits（原始脚本 HitSplitRatio 摘录）。
//  · 原始脚本 `_data_cache/strict_research/`：
//      Avatar_Sam_00_Ability.json        （Skill11_Phase02 5 段 / Skill21_Phase02 循环 4 + 收尾，
//                                          PointB1 ForceStanceDamage、PointB2 超击破、Skill03 RedMode）
//      Avatar_Boothill_00_Ability.json   （Skill11_Phase02 对决中的削韧与击破伤害、DuelState/DuelTarget、
//                                          SelfModification 优势口袋、抵近射击 ModifySPNew）
//      Avatar_Rappa_00_Ability.json      （Skill11/12/13 三段强化普攻、PointB2 海鸣超击破、
//                                          PointB3 枯叶易伤、UltraMode 结印）
//      Avatar_PlayerGirl_20_Ability.json （Skill03 伴舞、SkillP01_ListenBreakDamage 超击破与卫我起舞、
//                                          Passive_BuffArea 击破回能、PointB3 剧院之帽）
//  · 固定提交 312b4597691e0a29cf9828a15b592757dba86949。
//
// 超击破接入方式：引擎 `validateBattle` 明确禁止给已登记 kit 的静态动作直接写 `superBreak`
//（`u.kit&&a.superBreak!=null` → 报错），因此本批在 `prepare` 返回的动作上注入 `superBreak`
//（引擎在目标已击破时按本次削韧自动结算 kind='superbreak'），对队友【伴舞】则在 `afterHit`
// 中调用共享 `b.breaks.superBreak`；角色模块在 `modifiers` 里按 `kind==='superbreak'` 提供增伤。
//
// 段数换算（hitShares 与原始脚本真段数一致）：
//  · 流萤强化普攻 Skill11_Phase02：5 个 AttackData（0.15×4 + 0.4）。
//  · 流萤强化战技 Skill21_Phase02：LoopExecuteTaskListWithInterval MaxLoopCount=4（主 0.15 + 相邻 0.15）
//    + 收尾主 0.4 + 相邻 0.4 → 主/相邻各 5 段。
//  · 流萤普攻 1 段 / 战技 1 段；波提欧普攻 2 段（0.3/0.7）、终结 2 段（0.2/0.8）、强化普攻 1 段。
//  · 乱破普攻 2 段（0.5/0.5）、战技 2 段（0.5/0.5）、强化普攻 3 段（Skill11/12/13 各 1 段，散到主/相邻）。
//  · 开拓者•同谐普攻 1 段、战技 1 段主体 + 4（E6 6）次弹射。
import {atk,basic,skill,ultimate} from '../actions.mjs';
import {ROSTER_DATA} from '../../roster-data.mjs';
import {BREAK_BASE} from '../../game-data.mjs';

export const IDS=[1310,1315,1317,8006];

// ROSTER_DATA 帮助函数：取某技能记录的 stance 第 index 项。
const st=(id,skillId,index)=>ROSTER_DATA[id].skills?.[String(skillId)]?.stance?.[index]??0;
// 强化技能与基础技能共用等级轨道：用已编译的基础参数反查等级行，再取强化技能表，
// 避免依赖 compileRegisteredKit 未注入的 p.EnhancedNormal / p.EnhancedSkill。
const rowFor=(id,refId,targetId,refValue)=>{
  const table=ROSTER_DATA[id].skills?.[String(refId)]?.params??{};
  const key=Object.keys(table).find(k=>Math.abs((table[k].param_list?.[0]??NaN)-refValue)<1e-9);
  return ROSTER_DATA[id].skills?.[String(targetId)]?.params?.[key??'10']?.param_list??[];
};

// ── 原始脚本写死的结构常量（FixedValue / 参数索引，不是编造倍率）───────────────
// Avatar_Boothill_00_Skill11_Phase02 [26].SuccessTaskList[2]：击破伤害的韧性计入上限
// = 普攻基础削韧 × Talent #6（16）。
const BOOTHILL_TALENT_TOUGH_CAP_FACTOR=16;
// 物理属性击破的属性倍率（breaks.apply 中 Physical = 2），虚数 = 0.5。
const PHYSICAL_BREAK_RATIO=2,IMAGINARY_BREAK_RATIO=.5;
// 流萤 β 模组的击破特攻阈值 / 超击破倍率取自行迹 params（这里只写索引语义注释）：
//   trace[2] = [2, 3.6, 0.35, 0.5] → be>=2 用 0.35；be>=3.6 用 0.5。
// 乱破强化普攻的削韧按 3 段均分；E2 只提高前 2 段（Skill11/Skill12）。
const RAPPA_ENH_PHASES=3;
// 开拓者•同谐战技弹射基础次数（原始脚本 DefineDynamicValue Bounce_Count = 4，E6 +2）。
const HMC_BOUNCE_BASE=4;

const actions={
  // ── 1310 流萤：普攻 / 战技（消耗生命+回能+行动提前）/ 终结【完全燃烧】；
  //    强化普攻「火萤Ⅳ型-底火斩击」（回复生命）、强化战技「火萤Ⅳ型-死星过载」（按击破特攻增伤+加火弱点）──
  1310:(p,d,{eidolon=0}={})=>{
    const en=rowFor(1310,131001,131008,p.Normal[0]);
    const es=rowFor(1310,131002,131009,p.BPSkill[0]);
    return {
      basic:basic(p,d,{terms:atk(p.Normal[0]),toughness:st(1310,131001,0),hitShares:[1]}),
      // 战技「指令-天火轰击」：消耗 #2 生命上限、固定恢复 #3 能量上限的能量、伤害 #1、行动提前 #4。
      skill:skill(p,d,{terms:atk(p.BPSkill[0]),toughness:st(1310,131002,0),hitShares:[1],
        energyGain:d.energyMax*p.BPSkill[2],
        effects:[{type:'hpConsume',target:'self',scaling:'hp',multiplier:p.BPSkill[1]}]}),
      ultimate:ultimate(p,d,{target:'self',terms:[],toughness:0,hitShares:[1]}),
      // 强化普攻 131008：#1 攻击力伤害（5 段 0.15/0.15/0.15/0.15/0.4）+ 回复 #2 生命上限。
      enhancedBasic:{name:d.skills['131008'].name,type:'Normal',element:'Fire',target:'single',
        terms:atk(en[0]),toughness:st(1310,131008,0),hitShares:[.15,.15,.15,.15,.4],
        energyGain:0,spCost:0,spGain:1,
        effects:[{type:'heal',target:'self',scaling:'hp',multiplier:en[1]}]},
      // 强化战技 131009：主 ( #5×击破特攻 + #1 )、相邻 ( #6×击破特攻 + #2 )，回复 #3 生命上限；
      // 击破特攻动态项在 prepare 里按 combatPanel 计算上限 #7。
      enhancedSkill:{name:d.skills['131009'].name,type:'BPSkill',element:'Fire',target:'blast',
        terms:[{scaling:'atk',multiplier:es[0]},{scaling:'atk',multiplier:es[1],target:'adjacent'}],
        hitShares:[.15,.15,.15,.15,.4],toughness:st(1310,131009,0),adjacentToughness:st(1310,131009,2),
        energyGain:0,spCost:eidolon>=1?0:1,spGain:0,
        effects:[{type:'heal',target:'self',scaling:'hp',multiplier:es[2]}]},
    };
  },
  // ── 1315 波提欧：普攻 2 段 / 战技【绝命对峙】/ 终结 2 段（加物理弱点+延后）；
  //    强化普攻「击锤连弩」1 段 ──
  1315:(p,d,{eidolon=0}={})=>{
    const en=rowFor(1315,131501,131508,p.Normal[0]);
    return {
      basic:basic(p,d,{terms:atk(p.Normal[0]),toughness:st(1315,131501,0),hitShares:[.3,.7]}),
      skill:skill(p,d,{target:'single',terms:[],toughness:0,hitShares:[1],energyGain:0}),
      ultimate:ultimate(p,d,{terms:atk(p.Ultra[0]),toughness:st(1315,131503,0),hitShares:[.2,.8]}),
      // 强化普攻 131508：#1 攻击力伤害；不回战技点；仅能以对峙目标为目标。
      enhancedBasic:{name:d.skills['131508'].name,type:'Normal',element:'Physical',target:'single',
        terms:atk(en[0]),toughness:st(1315,131508,0),hitShares:[1],
        energyGain:ROSTER_DATA[1315].skills['131508'].spBase??0,spCost:0,spGain:0},
    };
  },
  // ── 1317 乱破：普攻 2 段 / 战技全体 2 段 / 终结【结印】；
  //    强化普攻「忍具•降魔花弁」3 段（前 2 段单体+相邻，第 3 段全体）──
  1317:(p,d,{eidolon=0}={})=>{
    const en=rowFor(1317,131701,131718,p.Normal[0]);
    // 131718 累积记录：#1 单体（前 2 段各 1 次）、#2 相邻、#3 第 3 段全体。
    const main=en[0]*2+en[2],adj=en[1]*2+en[2];
    return {
      basic:basic(p,d,{terms:atk(p.Normal[0]),toughness:st(1317,131701,0),hitShares:[.5,.5]}),
      skill:skill(p,d,{target:'all',terms:atk(p.BPSkill[0]),toughness:st(1317,131702,1),hitShares:[.5,.5]}),
      ultimate:ultimate(p,d,{target:'self',terms:[],toughness:0,hitShares:[1]}),
      enhancedNormal:{name:d.skills['131718'].name,type:'Normal',element:'Imaginary',target:'blast',
        terms:[{scaling:'atk',multiplier:main},{scaling:'atk',multiplier:adj,target:'adjacent'}],
        hitShares:[1/RAPPA_ENH_PHASES,1/RAPPA_ENH_PHASES,1/RAPPA_ENH_PHASES],
        toughness:st(1317,131718,0),adjacentToughness:st(1317,131718,2),
        energyGain:0,spCost:0,spGain:0},
    };
  },
  // ── 8006 开拓者•同谐：普攻 1 段 / 战技 1 段主体 + 4（E6 6）次弹射 / 终结为全体【伴舞】──
  8006:(p,d,{eidolon=0}={})=>({
    basic:basic(p,d,{terms:atk(p.Normal[0]),toughness:st(8006,800601,0),hitShares:[1]}),
    skill:skill(p,d,{terms:atk(p.BPSkill[0]),toughness:st(8006,800602,0),hitShares:[1],
      energyGain:ROSTER_DATA[8006].skills['800602'].spBase??0,
      bounceCount:HMC_BOUNCE_BASE+(eidolon>=6?d.ranks[6][0]:0),
      bounceTerms:atk(p.BPSkill[0]),bounceToughness:st(8006,800602,2)}),
    ultimate:ultimate(p,d,{target:'allies',terms:[],toughness:0,hitShares:[1]}),
  }),
};

const factories={
  // ══ 1310 流萤 ════════════════════════════════════════════════════════════
  // 【完全燃烧】（Skill03_Phase02 AddModifier RedMode + ModifyActionDelay + 倒计时）：
  //   · 速度 +Ultra[2]；倒计时召唤物固定速度 Ultra[3]=70，倒计时回合开始时解除。
  //   · 强化普攻 / 强化战技期间击破效率 +Ultra[1]（E6 +ranks[6][1]），
  //     敌方目标受到萨姆造成的击破伤害 +Ultra[0]（Ultra_BreakDamageAddRatio）。
  //   · 行迹 α（PointB1 ForceStanceDamage）：对没有火弱点的敌人按 55% 削韧。
  //   · 行迹 β（PointB2 SuperBreakBuff）：击破特攻 >=2 / 3.6 时按削韧触发 35% / 50% 超击破。
  //   · 行迹 γ（过载核心）：攻击力 >1800 后每 10 点 +0.8% 击破特攻。
  //   · 天赋：低血减伤（<=Talent[2] 达上限 Talent[0]，燃烧中维持上限）、燃烧中效果抵抗 +Talent[3]、
  //     开场能量不低于 Talent[1]、能量到上限解除所有负面。
  //   · E1 强化战技无视 15% 防御且不消耗战技点；E2 强化攻击击破 / 击杀后额外回合（冷却 ranks[2][1]）；
  //     E4 燃烧中效果抵抗 +ranks[4][0]；E6 燃烧中火抗穿 +ranks[6][0]。
  1310(api){
    const {live,enemies,rank,trace,buff,resource,heal,energy,advance,damageTo,combatPanel,record}=api;
    const BURN_TAG='samBurn',BURN_ID='sam:burn',SPEED_ID=u=>u.id+':sam:speed',BEFF_ID=u=>u.id+':sam:beff';
    const CD_ID=u=>u.id+':sam-countdown',WEAK_ID=u=>u.id+':sam-weak';
    const inBurn=u=>u.buffs.some(e=>e.tag===BURN_TAG);
    const hasFireWeak=to=>(to.weaknesses??[]).includes('Fire')||to.buffs.some(e=>e.weakness==='Fire');
    const burnRatio=u=>{const t=trace(u,2);if(!t)return 0;const be=combatPanel(u).breakEffect??0;
      return be>=t[1]?t[3]:(be>=t[0]?t[2]:0);};
    const enterBurn=(b,u)=>{
      const p=u.kit.params;
      buff(b,u,u,'完全燃烧','marker',0,null,{id:BURN_ID,tag:BURN_TAG});
      buff(b,u,u,'完全燃烧 · 速度','speed',p.Ultra[2],null,{id:SPEED_ID(u)});
      u.policy={...u.policy,autoUltimate:false};   // 完全燃烧状态下无法施放终结技
      let s=b.summons.find(s=>s.id===CD_ID(u));
      if(!s){s={id:CD_ID(u),name:'完全燃烧倒计时',owner:u.id,kind:'countdown',speed:p.Ultra[3],
        distance:10000,active:true,order:b.units.length+b.summons.length};b.summons.push(s);}
      else{s.active=true;s.distance=10000;s.speed=p.Ultra[3];}
      advance(b,u.id,1);
      record(b,'mechanic',u,{name:'进入完全燃烧'});
    };
    const exitBurn=(b,u)=>{
      u.buffs=u.buffs.filter(e=>e.tag!==BURN_TAG&&e.id!==SPEED_ID(u)&&e.id!==BEFF_ID(u));
      u.policy={...u.policy,autoUltimate:true};
      const s=b.summons.find(s=>s.id===CD_ID(u));if(s)s.active=false;
      record(b,'mechanic',u,{name:'解除完全燃烧'});
    };
    // 能量到上限时解除自身所有负面效果（每段充能只触发一次）。
    const checkCleanse=(b,u)=>{
      if(u.energy<u.energyMax-1e-9){resource(b,u,'满能量已净化',0);return;}
      if(u.resources['满能量已净化'])return;
      u.buffs=u.buffs.filter(e=>!e.debuff&&!e.control);
      u.dots=u.dots.filter(e=>!e.debuff);
      resource(b,u,'满能量已净化',1);
      record(b,'cleanse',u,{name:'茧式源火中枢 · 解除负面'});
    };
    return {
      // 秘技「Δ指令-焦土陨击」：每波次开始时为敌方全体加火弱点（Maze[2] 回合）并造成 Maze[1] 攻击力伤害。
      entry(b,u){resource(b,u,'秘技激活',1);},
      waveStart(b,u){
        if(!u.resources['秘技激活'])return;
        const p=u.kit.params,maze=ROSTER_DATA[1310].skills['131007'];
        for(const to of enemies(b,u)){
          buff(b,u,to,'Δ指令 · 火弱点','marker',0,p.Maze[2],
            {id:WEAK_ID(u)+':maze:'+to.id,debuff:true,weakness:'Fire'});
          damageTo(b,u,to,{name:'Δ指令-焦土陨击',type:'Maze',element:u.element,
            terms:atk(p.Maze[1]),toughness:maze.stance[0]},1,'primary','technique');
        }
      },
      start(b,u){
        const p=u.kit.params;
        resource(b,u,'完全燃烧',0);resource(b,u,'E2冷却',0);resource(b,u,'满能量已净化',0);
        // 天赋：战斗开始时若能量不足 #2 则恢复至 #2。
        const floor=p.Talent[1]*u.energyMax;
        if(u.energy<floor)energy(b,u,floor-u.energy,true);
      },
      prepare(b,u,key,kind,a){
        void kind;
        if(!inBurn(u))return a;
        const p=u.kit.params,sup=burnRatio(u);
        if(key==='basic'){
          const en=rowFor(1310,131001,131008,p.Normal[0]);
          void en;
          return {...u.actions.enhancedBasic,...(sup>0?{superBreak:sup}:{})};
        }
        if(key==='skill'){
          const es=rowFor(1310,131002,131009,p.BPSkill[0]),cap=es[6]??0;
          const be=Math.min(combatPanel(u).breakEffect??0,cap);
          const terms=[
            {scaling:'atk',multiplier:(es[4]??0)*be+(es[0]??0)},
            {scaling:'atk',multiplier:(es[5]??0)*be+(es[1]??0),target:'adjacent'}];
          return {...u.actions.enhancedSkill,terms,...(sup>0?{superBreak:sup}:{})};
        }
        return a;
      },
      before(b,u,actor,key,kind,a,selected){
        void kind;
        if(actor!==u)return;
        const p=u.kit.params;
        if(!inBurn(u)||(key!=='basic'&&key!=='skill'))return;
        // 强化普攻 / 强化战技期间弱点击破效率提高（Ultra[1]，E6 再 +ranks[6][1]）。
        const beff=(p.Ultra[1]??0)+(rank(u,6)?rank(u,6,1):0);
        buff(b,u,u,'完全燃烧 · 击破效率','breakEfficiency',beff,1,{id:BEFF_ID(u)});
        // 行迹 α：攻击没有火属性弱点的敌人也按 55% 削韧（临时视为火弱点并缩放本次削韧）。
        const to=selected?.[0];
        if(trace(u,1)&&to&&live(to)&&!to.broken&&!hasFireWeak(to)){
          buff(b,u,to,'α模组 · 强制削韧','marker',0,1,{id:WEAK_ID(u),weakness:'Fire'});
          a.toughness=(a.toughness??0)*trace(u,1)[0];
          if(a.adjacentToughness!=null)a.adjacentToughness*=trace(u,1)[0];
        }
      },
      after(b,u,actor,key,kind,a,selected,hits){
        void kind;
        for(const to of b.units)to.buffs=to.buffs.filter(e=>e.id!==WEAK_ID(u));
        u.buffs=u.buffs.filter(e=>e.id!==BEFF_ID(u));
        if(actor!==u){checkCleanse(b,u);return;}
        const p=u.kit.params;
        const enhBasic=a?.name===u.actions.enhancedBasic.name;
        const enhSkill=a?.name===u.actions.enhancedSkill.name;
        if(key==='ultimate')enterBurn(b,u);
        // 强化战技为指定目标添加 #4 回合火弱点。
        if(enhSkill&&selected?.[0]&&live(selected[0])){
          const es=rowFor(1310,131002,131009,p.BPSkill[0]);
          buff(b,u,selected[0],'死星过载 · 火弱点','marker',0,es[3],
            {id:WEAK_ID(u)+':skill:'+selected[0].id,debuff:true,weakness:'Fire'});
        }
        // 战技「指令-天火轰击」使自身下一次行动提前 #4（强化战技没有该条说明）。
        if(key==='skill'&&a?.name===u.actions.skill.name)advance(b,u.id,p.BPSkill[3]);
        // E2：完全燃烧中强化普攻 / 强化战技消灭目标或使其陷入弱点击破 → 立即获得 1 个额外回合。
        if(rank(u,2)&&inBurn(u)&&(enhBasic||enhSkill)){
          const list=hits??[];
          const done=list.some(t=>t.side!==u.side&&(t.broken||t.hp<=0));
          if(done&&u.turns>=(u.resources['E2冷却']??0)){
            resource(b,u,'E2冷却',u.turns+(u.kit.ranks[2][1]??0));
            if(!b.queue.some(q=>q.actor===u.id&&q.kind==='extra'))
              b.queue.push({actor:u.id,key:'basic',kind:'extra'});
          }
        }
        checkCleanse(b,u);
      },
      afterDamage(b,u,from,to,kind){void kind;void from;void to;checkCleanse(b,u);},
      summonTurn(b,u,s){if(s.id===CD_ID(u))exitBurn(b,u);},
      modifiers(b,u,actor,to,a,kind){
        void to;
        if(actor!==u)return {};
        const out={},p=u.kit.params,enh=a?.name===u.actions.enhancedBasic.name||a?.name===u.actions.enhancedSkill.name;
        if(rank(u,1)&&a?.name===u.actions.enhancedSkill.name)out.defIgnore=rank(u,1);
        // Ultra_BreakDamageAddRatio：强化攻击期间「受到萨姆造成的击破伤害」+Ultra[0]。
        if(enh&&u.buffs.some(e=>e.id===BEFF_ID(u))&&['break','break_dot','superbreak'].includes(kind))
          out.vuln=u.kit.params.Ultra[0];
        // E6：完全燃烧状态下火属性抗性穿透 +ranks[6][0]。
        if(inBurn(u)&&rank(u,6))out.resPen=rank(u,6,0);
        void p;
        return out;
      },
      panel(b,u,to,out){
        if(to!==u)return;
        const p=u.kit.params;
        // 天赋：生命值越低减伤越高，<=Talent[2] 时达上限 Talent[0]；完全燃烧中维持上限。
        let dr=inBurn(u)?p.Talent[0]:p.Talent[0]*Math.min(1,Math.max(0,(1-u.hp/out.hp)/(1-p.Talent[2])));
        if(dr>0)out.dmgReduction=1-(1-(out.dmgReduction??0))*(1-dr);
        if(inBurn(u))out.effectRes=Math.min(1,(out.effectRes??0)+p.Talent[3]+(rank(u,4)?rank(u,4):0));
        // 行迹 γ：攻击力 >1800 后每 10 点 +0.8% 击破特攻。
        const g=trace(u,3);
        if(g&&out.atk>g[0])out.breakEffect=(out.breakEffect??0)+Math.floor((out.atk-g[0])/g[1])*g[2];
      },
      display(b,u,to){
        if(to!==u)return [];
        return [{type:'buff',id:u.id+':sam-burn',source:u.id,name:'完全燃烧',key:'marker',
          value:inBurn(u)?1:0,derived:true}];
      },
    };
  },

  // ══ 1315 波提欧 ══════════════════════════════════════════════════════════
  // 战技「炽砾舞者的探戈」：与目标进入【绝命对峙】，目标被嘲讽，双方受到对方攻击时伤害提高
  //   BPSkill[0]/BPSkill[1]，持续 BPSkill[2] 回合（波提欧每回合开始时 -1）；战技不回能、
  //   施放后本回合不结束（TurnInsertAction）；目标被消灭或弱点被击破 → +1【优势口袋】并解除。
  // 天赋「轮中五豆」：每层口袋使强化普攻削韧 +Talent[3]（上限 Talent[4] 层）；强化普攻对
  //   击破目标按层数造成 Talent[0]/[1]/[2] 物理击破伤害，韧性计入上限 = 普攻基础削韧 ×16。
  // 行迹：幽灵装填（暴击/暴伤按击破特攻）、蛇之上行（对峙中受非对峙目标伤害 -30%）、
  //   抵近射击（对峙中获得口袋回 10 能，溢出也触发）。
  // E1 开局 1 层口袋 + 无视 16% 防御；E2 对峙中获得口袋回 1 战技点 + 30% 击破特攻 2 回合（每回合一次）；
  // E4 对峙目标受到波提欧伤害 +12%、波提欧受到该目标伤害的提高效果降低 12%；
  // E6 天赋击破伤害额外 40% 单体 / 70% 相邻。
  1315(api){
    const {live,enemies,rank,trace,buff,resource,energy,sp,delay,damageTo,combatPanel,record}=api;
    const DUEL_TAG='boothillDuel',DUEL_ID='boothill:duel',MARK='boothill:mark',POCKET='优势口袋';
    const inDuel=u=>u.buffs.some(e=>e.tag===DUEL_TAG);
    const marks=b=>b.units.filter(t=>t.buffs.some(e=>e.tag==='boothillMark'));
    const pocketMax=u=>u.kit.params.Talent[4];
    const clearMarks=b=>{for(const t of b.units)t.buffs=t.buffs.filter(e=>!e.id||!e.id.startsWith(MARK+':'));};
    const addPocket=(b,u,n)=>{
      const max=pocketMax(u),cur=u.resources[POCKET]??0,next=Math.min(max,cur+n);
      if(next>cur){
        resource(b,u,POCKET,next);
        // 行迹「抵近射击」：处于对峙并获得口袋时回 10 能（溢出层数同样触发）。
        if(inDuel(u)&&trace(u,3))energy(b,u,trace(u,3)[0]);
        // E2：对峙中获得口袋时回 1 战技点并 +30% 击破特攻 2 回合，单个回合内不重复触发。
        if(rank(u,2)&&inDuel(u)&&u.resources['E2触发回合']!==b.turns){
          resource(b,u,'E2触发回合',b.turns);
          sp(b,u,rank(u,2,0),'波提欧 E2');
          buff(b,u,u,'波提欧 E2 · 击破特攻','breakEffect',rank(u,2,1),u.kit.ranks[2][2],{id:u.id+':boothill-e2'});
        }
      }
      return next>cur;
    };
    const endDuel=(b,u,gain)=>{
      // 先结算口袋：行迹「抵近射击」/ E2 都要求「处于绝命对峙并获得口袋」。
      if(gain)addPocket(b,u,1);
      u.buffs=u.buffs.filter(e=>e.id!==DUEL_ID);
      clearMarks(b);
      record(b,'mechanic',u,{name:'解除绝命对峙'});
    };
    const physBreakBase=(u,to,mult)=>{
      const level=BREAK_BASE[u.level];if(!Number.isFinite(level))return null;
      const tough=Math.min(to.toughnessMax??0,st(1315,131501,0)*BOOTHILL_TALENT_TOUGH_CAP_FACTOR);
      return level*(1+(combatPanel(u).breakEffect??0))*(.5+tough/120)*PHYSICAL_BREAK_RATIO*mult;
    };
    return {
      entry(b,u){resource(b,u,'秘技激活',1);},
      start(b,u){
        const p=u.kit.params;
        resource(b,u,POCKET,0);resource(b,u,'E2触发回合',-1);
        // 天赋：战斗胜利后保留口袋；战斗开始时按 E1 获得 1 层。
        if(rank(u,1))addPocket(b,u,1);
        void p;
      },
      shouldUseSkill(b,u){return !inDuel(u);},
      prepare(b,u,key,kind,a){
        void kind;
        if(key!=='basic'||!inDuel(u))return a;
        const p=u.kit.params,layers=Math.min(pocketMax(u),u.resources[POCKET]??0);
        // 强化普攻的削韧每层口袋 +Talent[3]（原始脚本 SetDynamicValueByProperty MaxStance）。
        const tough=(ROSTER_DATA[1315].skills['131508'].stance?.[0]??0)*(1+p.Talent[3]*layers);
        const to=marks(b)[0];
        return {...u.actions.enhancedBasic,toughness:tough,...(to&&live(to)?{targetId:to.id}:{})};
      },
      before(b,u,actor,key,kind,a,selected){
        void kind;void a;void selected;
        if(actor!==u||key!=='skill')return;
        // 战技无法恢复能量。
        u.energy=Math.max(0,u.energy);
      },
      after(b,u,actor,key,kind,a,selected,hits){
        void kind;
        if(actor!==u){return;}
        const p=u.kit.params;
        if(key==='skill'){
          const to=selected?.[0];if(!to||!live(to))return;
          buff(b,u,to,'绝命对峙 · 标记','marker',0,null,
            {id:MARK+':'+to.id,tag:'boothillMark',debuff:true,control:'taunt'});
          buff(b,u,u,'炽砾舞者的探戈 · 对峙','marker',0,p.BPSkill[2],
            {id:DUEL_ID,tag:DUEL_TAG,tickAt:'start',tickOwner:u.id,countApplyTurn:true});
          // 秘技「三乘九的微笑」：下一次战斗首次施放战技时为目标添加与终结技相同的物理弱点。
          if(u.resources['秘技激活']){
            resource(b,u,'秘技激活',0);
            buff(b,u,to,'三乘九的微笑 · 物理弱点','marker',0,p.Maze[0],
              {id:u.id+':boothill-maze-weak',debuff:true,weakness:'Physical'});
          }
          // 施放该战技后本回合不会结束（TurnInsertAction）。
          if(!b.queue.some(q=>q.actor===u.id&&q.kind==='extra'))
            b.queue.push({actor:u.id,key:'basic',kind:'extra'});
          return;
        }
        if(key==='ultimate'){
          const to=selected?.[0]??hits?.[0];
          if(to&&live(to)){
            buff(b,u,to,'尘魔舞者的日落秀 · 物理弱点','marker',0,p.Ultra[2],
              {id:u.id+':boothill-ult-weak',debuff:true,weakness:'Physical'});
            delay(b,to.id,p.Ultra[1]);
          }
          return;
        }
        if(key==='basic'&&a?.name===u.actions.enhancedBasic.name){
          const to=selected?.[0]??hits?.[0];
          if(to&&live(to)&&to.broken){
            const layers=Math.min(pocketMax(u),u.resources[POCKET]??0);
            if(layers>0){
              const base=physBreakBase(u,to,p.Talent[layers-1]);
              if(base!=null)b.breaks.damage(b,u,to,base,'Physical',false,'break');
              // E6：触发天赋击破伤害时，对目标额外 40%、对相邻 70% 的击破伤害。
              if(rank(u,6)){
                const extra=physBreakBase(u,to,p.Talent[layers-1]*rank(u,6,0));
                if(extra!=null)b.breaks.damage(b,u,to,extra,'Physical',false,'break');
                const pool=b.units.filter(t=>t.side!==u.side),at=pool.findIndex(t=>t.id===to.id);
                for(const t of [pool[at-1],pool[at+1]].filter(t=>t&&live(t))){
                  const v=physBreakBase(u,t,p.Talent[layers-1]*rank(u,6,1));
                  if(v!=null)b.breaks.damage(b,u,t,v,'Physical',false,'break');
                }
              }
            }
          }
        }
      },
      death(b,u,from,to){
        if(to.side===u.side)return;
        if(to.buffs.some(e=>e.tag==='boothillMark'))endDuel(b,u,true);
      },
      turnEnd(b,u){
        if(!inDuel(u))return;
        const mark=marks(b)[0];
        if(!mark||!live(mark)||mark.broken)endDuel(b,u,true);
      },
      modifiers(b,u,actor,to,a,kind){
        void a;void kind;
        const out={};
        const p=u.kit.params;
        // E1：造成伤害时无视 16% 防御。
        if(actor===u&&rank(u,1))out.defIgnore=rank(u,1);
        // 行迹「幽灵装填」：暴击率 / 暴伤按击破特攻提高并封顶。
        if(actor===u&&trace(u,1)){
          const be=combatPanel(u).breakEffect??0,t=trace(u,1);
          out.critRate=(out.critRate??0)+Math.min(t[1],be*t[0]);
          out.critDmg=(out.critDmg??0)+Math.min(t[3],be*t[2]);
        }
        // 绝命对峙：目标受到波提欧攻击时伤害 +BPSkill[0]（E4 再 +ranks[4][0]）。
        if(actor===u&&to.buffs.some(e=>e.tag==='boothillMark'))
          out.vuln=(out.vuln??0)+p.BPSkill[0]+(rank(u,4)?rank(u,4,0):0);
        // 波提欧受到对峙目标攻击时伤害 +BPSkill[1]（E4 降低 ranks[4][1]）。
        if(to===u&&actor&&actor.buffs.some(e=>e.tag==='boothillMark')){
          const v=Math.max(0,p.BPSkill[1]-(rank(u,4)?rank(u,4,1):0));
          if(v>0)out.vuln=(out.vuln??0)+v;
        }
        // 行迹「蛇之上行」：对峙中受到未处于对峙目标的伤害降低 30%（真减伤 → dmgReduction 乘区，
        // 而不是把负值塞进 vuln；两者聚合方式不同，负 vuln 会随目标已有易伤而偏离）。
        if(to===u&&inDuel(u)&&actor&&!actor.buffs.some(e=>e.tag==='boothillMark')&&trace(u,2))
          out.dmgReduction=Math.max(out.dmgReduction??0,trace(u,2)[0]);
        return out;
      },
      panel(b,u,to,out){
        // 对峙目标被嘲讽：以仇恨比建模（目标选择限制）。
        if(to===u&&inDuel(u))out.aggroRatio=(out.aggroRatio??1)*10;
      },
      display(b,u,to){
        if(to!==u)return [];
        return [{type:'buff',id:u.id+':boothill-pocket',source:u.id,name:'优势口袋',key:'marker',
          value:u.resources[POCKET]??0,derived:true}];
      },
    };
  },

  // ══ 1317 乱破 ════════════════════════════════════════════════════════════
  // 终结技「忍道•极•爱死天流」：进入【结印】，立即获得 1 个额外回合与 Ultra[2] 点【彩墨】，
  //   击破效率 +Ultra[0]、击破特攻 +Ultra[1]；强化普攻消耗 1 彩墨，耗尽退出。
  // 天赋「忍•科学•堪忍袋」：敌方弱点被击破 +1 充能（上限 Talent[0]，E6 开局 5、上限 +5）；
  //   强化普攻第 3 段额外对敌方全体造成 Talent[2]+Talent[4]×充能 的虚数击破伤害，无视弱点削韧
  //   Talent[3]+Talent[5]×充能，消耗全部充能；E6 第 3 段后再获得 ranks[6][0] 充能。
  // 行迹：魔天（精英以上破韧额外 +1 充能与 10 能）、海鸣（结印中对击破目标按削韧触发 60% 超击破）、
  //   枯叶（破韧后受到击破伤害 +2%，攻击力超 2400 每 100 点 +1%，上限 +8%，2 回合）。
  // E1 结印中无视 15% 防御、退出回 20 能；E2 强化普攻前 2 段削韧 +50%；E4 结印中全队速度 +12%。
  1317(api){
    const {live,allies,enemies,rank,trace,buff,resource,energy,delay,damageTo,combatPanel,record}=api;
    const SEAL_TAG='rappaSeal',SEAL_ID='rappa:seal',BEFF_ID=u=>u.id+':rappa-beff',BE_ID=u=>u.id+':rappa-be';
    const CHARGE='充能',INK='彩墨';
    const inSeal=u=>u.buffs.some(e=>e.tag===SEAL_TAG);
    const chargeMax=u=>u.kit.params.Talent[0]+(rank(u,6)?u.kit.ranks[6][1]:0);
    const weakId=u=>u.id+':rappa-weak';
    const gainCharge=(b,u,n)=>{
      const max=chargeMax(u),cur=u.resources[CHARGE]??0,next=Math.min(max,cur+n);
      if(next>cur){resource(b,u,CHARGE,next);return true;}return false;
    };
    const imgBreakBase=(u,to,mult)=>{
      const level=BREAK_BASE[u.level];if(!Number.isFinite(level))return null;
      return level*(1+(combatPanel(u).breakEffect??0))*(.5+(to.toughnessMax??0)/120)*IMAGINARY_BREAK_RATIO*mult;
    };
    const enterSeal=(b,u)=>{
      const p=u.kit.params;
      resource(b,u,INK,p.Ultra[2]);
      buff(b,u,u,'结印','marker',0,null,{id:SEAL_ID,tag:SEAL_TAG});
      buff(b,u,u,'结印 · 击破效率','breakEfficiency',p.Ultra[0],null,{id:BEFF_ID(u)});
      buff(b,u,u,'结印 · 击破特攻','breakEffect',p.Ultra[1],null,{id:BE_ID(u)});
      u.policy={...u.policy,autoUltimate:false};   // 结印中无法施放战技和终结技
      if(rank(u,4))for(const to of allies(b,u))
        buff(b,u,to,'乱破 E4 · 速度','speedPct',rank(u,4),null,{id:'rappa-e4',removeOnSourceDeath:true});
      if(!b.queue.some(q=>q.actor===u.id&&q.kind==='extra'))
        b.queue.push({actor:u.id,key:'basic',kind:'extra'});
      record(b,'mechanic',u,{name:'进入结印'});
    };
    const exitSeal=(b,u)=>{
      u.buffs=u.buffs.filter(e=>e.tag!==SEAL_TAG&&e.id!==BEFF_ID(u)&&e.id!==BE_ID(u));
      for(const to of b.units)to.buffs=to.buffs.filter(e=>e.id!=='rappa-e4');
      u.policy={...u.policy,autoUltimate:true};
      resource(b,u,INK,0);
      if(rank(u,1))energy(b,u,rank(u,1,1));
      record(b,'mechanic',u,{name:'退出结印'});
    };
    // 天赋第 3 段的额外虚数击破伤害 + 无视弱点削韧。
    const talentHit=(b,u,charge)=>{
      const p=u.kit.params;
      for(const to of enemies(b,u)){
        buff(b,u,to,'忍具 · 无视弱点','marker',0,1,{id:weakId(u),weakness:'Imaginary'});
        damageTo(b,u,to,{name:'忍具•降魔花弁 · 破韧',type:'Normal',element:'Imaginary',
          terms:[{scaling:'atk',multiplier:0}],toughness:(p.Talent[3]??0)+(p.Talent[5]??0)*charge},
          1,'primary','break');
        for(const t of b.units)t.buffs=t.buffs.filter(e=>e.id!==weakId(u));
        const base=imgBreakBase(u,to,(p.Talent[2]??0)+(p.Talent[4]??0)*charge);
        if(base!=null)b.breaks.damage(b,u,to,base,'Imaginary',false,'break');
      }
    };
    return {
      entry(b,u){
        const p=u.kit.params,maze=ROSTER_DATA[1317].skills['131707'];
        // 秘技「忍步•血义理」：对每个敌方目标造成 Maze #5 点无视弱点削韧与 #2 虚数击破伤害，
        // 相邻目标 #3 击破伤害，自身获得 #4 点能量。
        for(const to of enemies(b,u)){
          buff(b,u,to,'忍步 · 无视弱点','marker',0,1,{id:weakId(u),weakness:'Imaginary'});
          damageTo(b,u,to,{name:'忍步•血义理',type:'Maze',element:u.element,
            terms:[{scaling:'atk',multiplier:0}],toughness:p.Maze[4]},1,'primary','technique');
          const base=imgBreakBase(u,to,p.Maze[1]);
          if(base!=null)b.breaks.damage(b,u,to,base,'Imaginary',false,'break');
        }
        for(const t of b.units)t.buffs=t.buffs.filter(e=>e.id!==weakId(u));
        energy(b,u,p.Maze[3]);
        void maze;
      },
      start(b,u){
        resource(b,u,CHARGE,rank(u,6)?u.kit.ranks[6][0]:0);
        resource(b,u,'充能上限',chargeMax(u));
        resource(b,u,INK,0);
      },
      shouldUseSkill(b,u){return !inSeal(u);},
      prepare(b,u,key,kind,a){
        void kind;
        if(key!=='basic'||!inSeal(u))return a;
        const p=u.kit.params;
        // E2：强化普攻前 2 段削韧 +50%。引擎按 hitShares 均摊，用相位权重
        // （Skill11/Skill12 各 1 段，Skill13 1 段）折算出整体削韧系数。
        const ph1=st(1317,131708,0),ph3=st(1317,131712,1),total=ph1*2+ph3;
        const factor=1+(rank(u,2)?rank(u,2,0):0)*2*(total?ph1/total:0);
        const tough=st(1317,131718,0)*factor;
        const sup=trace(u,2)?trace(u,2)[0]:0;   // 行迹「海鸣」：60% 超击破
        return {...u.actions.enhancedNormal,toughness:tough,...(sup>0?{superBreak:sup}:{})};
      },
      after(b,u,actor,key,kind,a,selected,hits){
        void kind;void selected;void hits;
        if(actor!==u)return;
        const p=u.kit.params;
        if(key==='ultimate'){enterSeal(b,u);return;}
        if(key==='basic'&&a?.name===u.actions.enhancedNormal.name&&inSeal(u)){
          const charge=u.resources[CHARGE]??0;
          if(charge>0){
            talentHit(b,u,charge);
            resource(b,u,CHARGE,0);
            if(rank(u,6))gainCharge(b,u,u.kit.ranks[6][0]);
          }
          const ink=Math.max(0,(u.resources[INK]??0)-1);
          resource(b,u,INK,ink);
          if(ink<=0)exitSeal(b,u);
        }
        void p;
      },
      afterDamage(b,u,from,to,kind){
        void from;
        if(to.side===u.side)return;
        // 只在真正的「弱点击破」事件上触发：引擎 breakTarget 会先写一条 type='break' 日志。
        const key=to.id;
        if(u.resources['破韧事件:'+key]===b.log.length)return;
        if(!b.log.slice(-4).some(e=>e.type==='break'&&e.target===to.id))return;
        u.resources['破韧事件:'+key]=b.log.length;
        gainCharge(b,u,1);
        // 行迹「魔天」：精英级别及以上目标被击破时额外 +1 充能与 10 能。
        if(trace(u,1)&&to.rank==='elite'){gainCharge(b,u,trace(u,1)[1]);energy(b,u,trace(u,1)[0]);}
        // 行迹「枯叶」：破韧后受到的击破伤害提高（攻击力超 2400 每 100 点 +1%，上限 +8%），2 回合。
        const t=trace(u,3);
        if(t){
          const extra=Math.min(t[3],Math.floor(Math.max(0,(combatPanel(u).atk??0)-t[1])/100)*t[2]);
          buff(b,u,to,'忍法帖•枯叶','vuln',t[0]+extra,t[4],{id:u.id+':rappa-leaf',debuff:true});
        }
        void kind;
      },
      modifiers(b,u,actor,to,a,kind){
        void to;void a;void kind;
        const out={};
        if(actor!==u)return out;
        // E1：结印状态下造成的伤害无视 15% 防御。
        if(inSeal(u)&&rank(u,1))out.defIgnore=rank(u,1);
        return out;
      },
      display(b,u,to){
        if(to!==u)return [];
        return [{type:'buff',id:u.id+':rappa-charge',source:u.id,name:'充能',key:'marker',
          value:u.resources[CHARGE]??0,derived:true},
          {type:'buff',id:u.id+':rappa-ink',source:u.id,name:'彩墨',key:'marker',
          value:u.resources[INK]??0,derived:true}];
      },
    };
  },

  // ══ 8006 开拓者•同谐 ═════════════════════════════════════════════════════
  // 终结技「喧嚣的舞灯巡游」：我方全体获得【伴舞】Ultra[0] 回合（开拓者每回合开始 -1），
  //   击破特攻 +Ultra[2]；持有者攻击处于弱点击破状态的目标后，按本次削韧触发超击破
  //   （SkillP01_ListenBreakDamage OnAfterAttack）。
  // 天赋「全屏段的高空踏歌」：敌方弱点被击破时开拓者回 Talent[0] 能量。
  // 行迹：卫我起舞（按敌方数量 5/4/3/2/1 使伴舞超击破 +20%/30%/40%/50%/60%）、
  //   随波逐流（战技第一次伤害削韧 +100%）、剧院之帽（我方破韧后使敌方行动延后 30%）。
  // E1 首次战技后回 1 战技点；E2 开场回能效率 +25% 持续 3 回合；E4 队友击破特攻 +开拓者 15%；
  // E6 战技额外伤害次数 +2。
  8006(api){
    const {live,allies,enemies,rank,trace,buff,resource,energy,sp,delay,combatPanel,record}=api;
    const DANCE='hmc:dance',DANCE_TAG='hmcDance';
    const hasDance=u=>u.buffs.some(e=>e.tag===DANCE_TAG);
    const danceBonus=(b,u)=>{const t=trace(u,1);if(!t)return 0;
      const i=5-Math.min(5,enemies(b,u).length);return t[i]??0;};
    return {
      entry(b,u){
        const p=u.kit.params;
        for(const to of allies(b,u))
          buff(b,u,to,'即刻！独奏团','breakEffect',p.Maze[0],p.Maze[1],
            {id:u.id+':hmc-maze',tickOwner:u.id,tickAt:'start'});
      },
      start(b,u){
        // E2：战斗开始时开拓者能量恢复效率 +ranks[2][0]，持续 ranks[2][2] 回合。
        if(rank(u,2))buff(b,u,u,'开拓者 E2 · 回能效率','energyRegen',rank(u,2,0),u.kit.ranks[2][1],
          {id:u.id+':hmc-e2',tickOwner:u.id,tickAt:'start',countApplyTurn:true});
        // E4：除自身外队友击破特攻提高，数值 = 开拓者 15% 的击破特攻（动态换算）。
        if(rank(u,4))for(const to of allies(b,u).filter(t=>t!==u))
          buff(b,u,to,'开拓者 E4 · 击破特攻','breakEffect',0,null,
            {id:'hmc-e4',removeOnSourceDeath:true,convert:{source:u.id,stat:'breakEffect',ratio:rank(u,4)}});
      },
      prepare(b,u,key,kind,a){
        void kind;
        // 行迹「随波逐流」：战技第一次伤害的削韧值额外提高 100%。
        if(key==='skill'&&trace(u,2))
          return {...a,toughness:(a.toughness??0)*(1+trace(u,2)[0])};
        return a;
      },
      after(b,u,actor,key,kind,a,selected,hits){
        void kind;void a;void selected;void hits;
        if(actor!==u)return;
        const p=u.kit.params;
        if(key==='skill'&&rank(u,1)&&!u.resources['E1已触发']){
          resource(b,u,'E1已触发',1);
          sp(b,u,rank(u,1,0),'开拓者 E1');
        }
        if(key==='ultimate'){
          for(const to of allies(b,u))
            buff(b,u,to,'伴舞','breakEffect',p.Ultra[2],p.Ultra[0],
              {id:u.id+':hmc-dance:'+to.id,tag:DANCE_TAG,tickOwner:u.id,tickAt:'start'});
          record(b,'mechanic',u,{name:'喧嚣的舞灯巡游 · 伴舞'});
        }
      },
      afterDamage(b,u,from,to,kind){
        void kind;
        if(from===u)return;
        if(to.side===u.side)return;
        // 天赋：敌方弱点被击破时开拓者回 Talent[0] 能量；以引擎的 type='break' 日志判定。
        const key=to.id;
        if(u.resources['破韧事件:'+key]===b.log.length)return;
        if(!b.log.slice(-4).some(e=>e.type==='break'&&e.target===to.id))return;
        u.resources['破韧事件:'+key]=b.log.length;
        energy(b,u,u.kit.params.Talent[0]);
        // 行迹「剧院之帽」：我方目标造成弱点击破后额外使敌方行动延后 30%。
        if(trace(u,3)&&from&&from.side===u.side)delay(b,to.id,trace(u,3)[0]);
      },
      // 【伴舞】超击破：我方持有者攻击处于弱点击破状态的目标后，按本次削韧触发 1 次超击破。
      afterHit(b,u,actor,to,a,kind){
        if(!actor||actor.side!==u.side||!to||to.side===u.side)return;
        if(['dot','additional','break','break_dot','superbreak','true'].includes(kind))return;
        if(!to.broken||to.hp<=0)return;
        if(!hasDance(actor))return;
        const shares=a.hitShares??[1],seg=(a.segment??1)-1;
        const primary=b.activeAction&&b.activeAction.actor===actor.id
          ?(b.activeAction.targets??[]).includes(to.id):true;
        const base=primary?(a.toughness??0):(a.adjacentToughness??a.toughness??0);
        if(!(base>0))return;
        const share=seg<shares.length?shares[seg]:1;
        b.breaks.superBreak(b,actor,to,base*share,1,actor.element);
      },
      modifiers(b,u,actor,to,a,kind){
        void to;void a;
        if(kind!=='superbreak'||!actor||actor.side!==u.side)return {};
        if(!hasDance(actor))return {};
        // 行迹「卫我起舞」：按场上敌方数量提高伴舞触发的超击破伤害。
        return {dmgBoost:danceBonus(b,u)};
      },
    };
  },
};

export {factories,actions};
