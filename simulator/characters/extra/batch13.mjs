// DeepSeek 独立角色批次 13：虚无命途 6 名角色（固定 4.6，提交 312b4597691e0a29cf9828a15b592757dba86949）
//   1004 瓦尔特（虚数）        Avatar_Welt_00_Ability.json
//   1225 忘归人（火）          Avatar_Fugue_00_Ability.json
//   1321 大丽花（火）          Avatar_Constance_00_Ability.json
//   1406 赛飞儿（量子）        Avatar_Cipher_00_Ability.json
//   1410 海瑟音（物理）        Avatar_Harscyline_00_Ability.json
//   1507 千冶•刃（火）         Avatar_MortenaxBlade_00_Ability.json
//
// 数值索引逐条核对 `_data_cache/hsr_core.json` 的 `skills / traces / ranks` desc `#n` 与
// `ROSTER_DATA[id].skills[*].params[等级].param_list`；段数 / 时序 / 触发条件取自原始脚本的
// `AttackData` 节点（HitSplitRatio / SPHitRatio，`AttackType:'Pursued'` 的追加伤害节点单列）。
//
// 段数与倍率口径（与 batch05/08/12 一致）：动作 `terms` = 本次动作的总倍率，`hitShares` = 逐段占比（和 = 1）。
//   · 脚本给出 HitSplitRatio 的技能直接采用该数组（如 1225 终结 0.6/0.1×4、1406 战技 0.1×5+0.5）。
//   · 只给 SPHitRatio 的弹射技能按「每段各 #1」→ 总倍率 = 段数 × #1（如 1004 战技 3 段、1507 战技 4 次追加）。
//   · 相邻目标节点用 `target:'adjacent'`（1406 终结的主目标额外段用 `target:'all'`）。
//
// 1004 的 4.6 角色记录只有 `enhanced` 子记录（顶层无 `skills`），但编译进 `ROSTER_DATA[1004]` 的
// 仍是 4.6 数据库的基础技能表（BPSkill #1=0.72、Ultra #1=1.5、Talent #1=0.6、行迹 惩戒/审判/裁决、
// E1 #1=0.5/#2=0.8/#3=2），与 `Avatar_Welt_00_Ability.json` 及 `validateKitActor` 合同一致；
// 同族的 1005/1006/1307/1205/1212/1310 也有 enhanced 子记录，同样以基础表为准（见 batch06/08/09/12）。
// 4.6 强化形态（【失重】、效果命中转攻击力等）由本模块自行建模：`u.kit.enhanced===true` 时在 `start`
// 内把战技的第 4 个伤害节点转为常驻，并在 handlers 里按强化表（ENH_1004：终结 1100403 / 天赋 1100404）
// 结算【失重】与强化行迹 / 星魂。**该形态目前只能由模块内部开关触发**：共享
// `compileRegisteredKit` 对 extra 角色只接受 `variant==='base'`（否则抛「此角色尚无可用的强化形态」），
// 因此要在配装界面按 4.6 强化形态选择，需要给共享层加一个可选开关（见文件末尾说明）。
import {atk,hp,basic,skill,ultimate,talentAction} from '../actions.mjs';
import {ROSTER_DATA} from '../../roster-data.mjs';
import {BREAK_BASE} from '../../game-data.mjs';

export const IDS=[1004,1225,1321,1406,1410,1507];

const EPS=1e-8;
// ROSTER_DATA 帮助函数：削韧 / 名称 / 基础回能 / 指定等级参数。
const S=(id,skillId,index)=>ROSTER_DATA[id].skills?.[String(skillId)]?.stance?.[index]??0;
const NM=(id,skillId)=>ROSTER_DATA[id].skills?.[String(skillId)]?.name??String(skillId);
const SPB=(id,skillId)=>ROSTER_DATA[id].skills?.[String(skillId)]?.spBase??0;
const PL=(id,skillId,level)=>ROSTER_DATA[id].skills?.[String(skillId)]?.params?.[String(level)]?.param_list??[];
// 强化技能与基础技能共用等级轨道：用已编译的基础参数整体反查等级行，再取目标技能表。
const lvOf=(id,refId,params)=>{
  const table=ROSTER_DATA[id].skills?.[String(refId)]?.params??{};
  const key=Object.keys(table).find(k=>JSON.stringify(table[k].param_list)===JSON.stringify(params));
  return key?Number(key):10;
};
const rowOf=(id,refId,params,targetId)=>PL(id,targetId,lvOf(id,refId,params));
// 相邻目标：与引擎扩散结算同一口径（按 b.units 顺序取前后活着的敌人）。
const adjacentOf=(b,u,to)=>{
  const pool=b.units.filter(t=>t.side!==u.side),at=pool.findIndex(t=>t.id===to.id);
  return [pool[at-1],pool[at+1]].filter(t=>t&&t.active!==false&&t.hp>1e-8);
};
// 超击破基础值公式与 `breaks.mjs` 的 superBreak 完全一致：等级基数 × 削韧/30 × (1+击破特攻) × 倍率。
const superBreakValue=(from,toughness,ratio,panel)=>(BREAK_BASE[from.level]??0)*toughness/30*(1+(panel.breakEffect??0))*ratio;

// ─────────────── 4.6 强化形态 1004（`characters[1004].enhanced['1']`，逐条取自该子记录）───────────────
// descs：#1 使目标陷入【失重】，失重目标受到攻击时行动延后；#2 失重目标防御力降低；#3 效果命中按比例提高攻击力。
// 逐级对比确认：强化 1100401 / 1100402 / 1100406 / 1100407 与基础表完全相同，只有 1100403（终结）与
// 1100404（天赋）多出 #5~#7 / #2~#3 列（基础表里这几列本就存在但未被基础说明引用），并且
// 1100403 #2 的「禁锢行动延后」为 0.12 而不是 4.6 数据库基础行的 0.4。
const ENH_1004={
  // 强化 1100403 逐级：#1 伤害 / #2 禁锢延后 / #3 禁锢概率 / #4 减速 / #5 失重受击延后 / #6 每回合上限 / #7 失重回合
  ultra:{10:[1.5,0.12,1,0.1,0.04,8,2],12:[1.62,0.132,1,0.1,0.04,8,2]},
  // 强化 1100404 逐级：#1 附加伤害 / #2 失重降防 / #3 失重减速
  talent:{10:[1,0.4,0.05],12:[1.1,0.4,0.05]},
  // 强化 skill_trees / ranks（point06 惩戒 / point07 审判 / point08 裁决）
  traces:{1:[0.1,10,2,30],2:[0.8,1.2],3:[0.4,0.1,0.2,0.8,5]},
  ranks:{1:[0.4],2:[3],3:[],4:[0.3],5:[],6:[0.3,0.6]},
};

const actions={
  // ── 1004 瓦尔特：普攻 Skill01_Phase02 1 段；战技 Skill02_Phase02 主节点 + 2 个无条件弹射节点（每段 #1），
  //    E6 的 ByRankActivated 节点 = 追加 1 次随机单体伤害；终结 Skill03_Phase02 2 段 HitSplitRatio 0.1/0.9 ──
  1004:(p,d,{eidolon=0}={})=>({
    basic:basic(p,d,{terms:atk(p.Normal[0]),toughness:S(1004,100401,0),hitShares:[1]}),
    skill:skill(p,d,{target:'single',terms:atk(p.BPSkill[0]*3),hitShares:[1/3,1/3,1/3],
      toughness:S(1004,100402,0),
      ...(eidolon>=6?{bounceCount:1,bounceTerms:atk(p.BPSkill[0]),bounceToughness:S(1004,100402,0)/4,bounceEnergy:0}:{})}),
    ultimate:ultimate(p,d,{target:'all',terms:atk(p.Ultra[0]),toughness:S(1004,100403,1),hitShares:[.1,.9]}),
  }),

  // ── 1225 忘归人：普攻 1 段；【炽灼】强化普攻 122508（Skill11_Phase02 主 #1 + 相邻 #2）；战技纯辅助；
  //    终结 Skill03_Phase02 5 段 0.6/0.1×4 ──
  1225:(p,d,{eidolon=0}={})=>{
    const enh=rowOf(1225,122501,p.Normal,122508);
    return {
      basic:basic(p,d,{terms:atk(p.Normal[0]),toughness:S(1225,122501,0),hitShares:[1]}),
      enhancedBasic:basic(p,d,{name:NM(1225,122508),target:'blast',
        terms:[...atk(enh[0]),{...atk(enh[1])[0],target:'adjacent'}],
        toughness:S(1225,122508,0),adjacentToughness:S(1225,122508,2),hitShares:[1]}),
      skill:skill(p,d,{target:'ally',terms:[],toughness:0,hitShares:[1]}),
      ultimate:ultimate(p,d,{target:'all',terms:atk(p.Ultra[0]),toughness:S(1225,122503,1),hitShares:[.6,.1,.1,.1,.1]}),
    };
  },

  // ── 1321 大丽花：普攻 1 段；战技 Skill02_Phase02 主 + 相邻（两个节点同参数 #1）；终结 Skill03_Phase02 2 段；
  //    天赋 Insert_Phase02 = #2 次弹射各 #1（Bounce_SelectTarget，E4 再 +#3 次）──
  1321:(p,d,{eidolon=0}={})=>({
    basic:basic(p,d,{terms:atk(p.Normal[0]),toughness:S(1321,132101,0),hitShares:[1]}),
    skill:skill(p,d,{target:'blast',terms:[...atk(p.BPSkill[0]),{...atk(p.BPSkill[0])[0],target:'adjacent'}],
      toughness:S(1321,132102,0),adjacentToughness:S(1321,132102,2),hitShares:[1]}),
    ultimate:ultimate(p,d,{target:'all',terms:atk(p.Ultra[0]),toughness:S(1321,132103,1),hitShares:[.5,.5]}),
    followup:talentAction(p,d,{terms:[],hitShares:[1],
      bounceCount:p.Talent[1]+(eidolon>=4?(ROSTER_DATA[1321].ranks?.[4]?.[2]??0):0),
      bounceTerms:atk(p.Talent[0]),bounceToughness:S(1321,132104,0),energyGain:SPB(1321,132104)}),
  }),

  // ── 1406 赛飞儿：普攻 1 段；战技 Skill02_Phase02 主 6 段 0.1×5+0.5 + 相邻 6 段同权重；
  //    终结 Skill03_Phase02 主 #1 + #4 扩散（主目标同时吃 #4 → 用 target:'all' 项表达）；
  //    天赋追击 PassiveSkill01_Insert_Phase02 4 段 0.2/0.1/0.1/0.6 ──
  1406:(p,d,{eidolon=0}={})=>({
    basic:basic(p,d,{terms:atk(p.Normal[0]),toughness:S(1406,140601,0),hitShares:[1]}),
    skill:skill(p,d,{target:'blast',
      terms:[...atk(p.BPSkill[0]),{...atk(p.BPSkill[1])[0],target:'adjacent'}],
      hitShares:[.1,.1,.1,.1,.1,.5],toughness:S(1406,140602,0),adjacentToughness:S(1406,140602,2)}),
    ultimate:ultimate(p,d,{target:'blast',
      terms:[...atk(p.Ultra[0]),{...atk(p.Ultra[3])[0],target:'all'}],
      hitShares:[1],toughness:S(1406,140603,0),adjacentToughness:S(1406,140603,2)}),
    followup:talentAction(p,d,{terms:atk(p.Talent[0]),hitShares:[.2,.1,.1,.6],
      toughness:S(1406,140604,0),energyGain:SPB(1406,140604)}),
  }),

  // ── 1410 海瑟音：普攻 Skill01_Phase02 2 段 0.5/0.5；战技全体 1 段；终结全体 1 段 ──
  1410:(p,d,{eidolon=0}={})=>({
    basic:basic(p,d,{terms:atk(p.Normal[0]),hitShares:[.5,.5],toughness:S(1410,141001,0)}),
    skill:skill(p,d,{target:'all',terms:atk(p.BPSkill[0]),toughness:S(1410,141002,1),hitShares:[1]}),
    ultimate:ultimate(p,d,{target:'all',terms:atk(p.Ultra[0]),toughness:S(1410,141003,1),hitShares:[1]}),
  }),

  // ── 1507 千冶•刃：普攻按生命上限；【无量忿怒】强化普攻 150708（Skill11_Phase02 5 段 0.2）；
  //    战技 Skill02_Phase02 全体 #1 + #2 次随机 #3（LoopExecuteTaskListWithInterval，不耗战技点、消耗 #4 生命上限）；
  //    终结 150703 为变身（无伤害节点），强化终结 150714（Skill31_Phase02）全体 #1 ──
  1507:(p,d,{eidolon=0}={})=>{
    const enh=rowOf(1507,150701,p.Normal,150708);
    return {
      basic:basic(p,d,{terms:hp(p.Normal[0]),toughness:S(1507,150701,0),hitShares:[1]}),
      enhancedBasic:basic(p,d,{name:NM(1507,150708),terms:hp(enh[0]),
        hitShares:[.2,.2,.2,.2,.2],toughness:S(1507,150708,0)}),
      skill:skill(p,d,{target:'all',spCost:0,terms:hp(p.BPSkill[0]),hitShares:[1],
        toughness:S(1507,150702,1),bounceCount:p.BPSkill[1],bounceTerms:hp(p.BPSkill[2]),
        bounceToughness:S(1507,150702,0),hpCostRatio:p.BPSkill[3],energyGain:SPB(1507,150702)}),
      // 天赋额外战技 150709：Skill21_Phase02 与 Skill02_Phase02 的 DynamicHashes 完全一致，视为追加攻击；
      // 消耗 150709 #1=10% 生命上限。
      followup:talentAction(p,d,{name:NM(1507,150709),type:'BPSkill',target:'all',
        terms:hp(p.BPSkill[0]),hitShares:[1],toughness:S(1507,150702,1),
        bounceCount:p.BPSkill[1],bounceTerms:hp(p.BPSkill[2]),bounceToughness:S(1507,150702,0),
        hpCostRatio:PL(1507,150709,10)[0],energyGain:SPB(1507,150709)}),
      ultimate:ultimate(p,d,{target:'all',terms:[],toughness:0,hitShares:[1],
        energyCost:d.energyMax,hpCostRatio:p.Ultra[0]}),
      enhancedUltimate:ultimate(p,d,{name:NM(1507,150714),target:'all',
        terms:hp(rowOf(1507,150703,p.Ultra,150714)[0]),toughness:S(1507,150714,1),
        hitShares:[1],energyCost:d.energyMax}),
    };
  },
};

const factories={
  // ═══════════════════════════════ 1004 瓦尔特（虚数 · 虚无）═══════════════════════════════
  1004:function(api){
    const {live,enemies,rank,trace,buff,resource,energy,delay,damageTo,combatPanel,record,stacks}=api;
    const rk=(u,n,i=0)=>u.kit.eidolon>=n?(u.kit.enhanced?(ENH_1004.ranks[n]?.[i]??0):rank(u,n,i)):0;
    const tr=(u,n)=>u.kit.enhanced?ENH_1004.traces[n]:trace(u,n);
    const P=u=>{
      if(!u.kit.enhanced)return {basic:u.kit.params.Normal,skill:u.kit.params.BPSkill,ult:u.kit.params.Ultra,talent:u.kit.params.Talent};
      // 强化形态只有终结 / 天赋两张表与基础不同（普攻 / 战技逐级完全一致），按生效技能等级取 10 / 12 级行。
      const band=v=>(v??10)>=12?12:10;
      return {basic:u.kit.params.Normal,skill:u.kit.params.BPSkill,
        ult:ENH_1004.ultra[band(u.kit.skillLevels?.Ultra)],talent:ENH_1004.talent[band(u.kit.skillLevels?.Talent)]};
    };
    const SLOW='瓦尔特 · 减速',WEIGHT='瓦尔特 · 失重',IMPRISON='瓦尔特 · 禁锢';
    const weight=to=>to.buffs.find(e=>e.tag==='weltWeight');
    const slowed=to=>to.buffs.some(e=>e.tag==='weltSlow')||!!weight(to);
    // 减速：基础概率 #2（E4 使战技的减速基础概率 +#1=0.35），速度 -#3，持续 #4 回合。
    function applySlow(b,u,to,base){
      if(!live(to))return false;
      const c=base*(1+(combatPanel(u).effectHit??0))*(1-(combatPanel(to).effectRes??0));
      if(c<1&&b.random()>=c){record(b,'resist',to,{name:'减速被抵抗'});return false;}
      buff(b,u,to,SLOW,'speedPct',-P(u).skill[2],P(u).skill[3],{id:u.id+':welt-slow',tag:'weltSlow',debuff:true});
      return true;
    }
    // 禁锢：基础概率 #3，行动延后 #2，速度 -#4，持续 1 回合（1100403 des：禁锢状态下行动延后 #2、速度降低 #4）。
    function imprison(b,u,to,chance,delayRatio,speedDown,duration=1){
      if(!live(to))return false;
      if((combatPanel(to).controlRes??to.controlRes??0)>=1){record(b,'resist',to,{name:'免疫禁锢'});return false;}
      const c=chance*(1+(combatPanel(u).effectHit??0))*(1-(combatPanel(to).effectRes??0));
      if(c<1&&b.random()>=c){record(b,'resist',to,{name:'禁锢被抵抗'});return false;}
      buff(b,u,to,IMPRISON,'speedPct',-speedDown,duration,{id:u.id+':welt-imprison',tag:'weltImprison',debuff:true,control:'imprisonment'});
      if(delayRatio)delay(b,to.id,delayRatio);
      return true;
    }
    // 天赋「时空扭曲」：击中减速（强化形态含失重）目标时额外造成 1 次 #1 虚数附加伤害（每目标每次攻击 1 次）；E2 触发回能。
    function talentHit(b,u,to){
      damageTo(b,u,to,{name:'时空扭曲 · 附加伤害',type:'Additional',element:'Imaginary',
        terms:atk(P(u).talent[0]),toughness:0},1,'primary','additional');
      if(rk(u,2))energy(b,u,rk(u,2));
    }
    // 强化形态【失重】：降防 #2 + 减速 #3，与失重同持续回合；受到攻击时行动延后 #5（每目标每回合最多 #6 次）。
    function applyWeight(b,u,to){
      const p=P(u),dur=p.ult[6];
      buff(b,u,to,WEIGHT,'marker',0,dur,{id:u.id+':welt-weight',tag:'weltWeight',debuff:true});
      buff(b,u,to,'失重 · 防御力降低','defShred',p.talent[1],dur,{id:u.id+':welt-weight-def',debuff:true});
      buff(b,u,to,'失重 · 速度降低','speedPct',-p.talent[2],dur,{id:u.id+':welt-weight-spd',debuff:true});
    }
    return {
      start(b,u){
        resource(b,u,'E1 剩余次数',0);
        if(!u.kit.enhanced)return;
        // 4.6 强化形态：脚本里被 ByRankActivated 门槛锁住的第 4 个伤害节点转为常驻，
        // 因此战技固定 4 段（普攻 / 终结 / 天赋的倍率与基础表逐级一致，无需替换）。
        u.actions={...u.actions,skill:{...u.actions.skill,
          terms:atk(u.kit.params.BPSkill[0]*4),hitShares:[.25,.25,.25,.25]}};
        delete u.actions.skill.bounceCount;delete u.actions.skill.bounceTerms;delete u.actions.skill.bounceToughness;
        // 行迹「惩戒」：战斗开始时恢复 #4=30 点能量。
        if(tr(u,1))energy(b,u,tr(u,1)[3]);
        record(b,'mechanic',u,{name:'4.6 强化形态 · 失重'});
      },
      // 秘技「画地为牢」：与领域内敌人进入战斗后 100% 基础概率使敌方目标陷入禁锢
      //（秘技 desc #2=20% 行动延后 / #3=10% 速度降低）。
      entry(b,u){
        const p=P(u);
        for(const to of enemies(b,u))imprison(b,u,to,p.ult[2],u.kit.params.Maze[1],u.kit.params.Maze[2],1);
      },
      // 行迹「惩戒」（强化形态）：我方目标攻击失重目标时伤害提高 #1（最多 #2 层，持续 #3 回合）。
      afterHit(b,u,actor,to,a,kind){
        if(actor.side!==u.side||to.side===u.side||!live(to)||kind==='dot')return;
        if(!u.kit.enhanced||!weight(to))return;
        // 原说明按「失重目标受到攻击」触发。逐命中监听能保留多段伤害，
        // 同时避免终结技在伤害结算后才施加失重，却反向触发本次攻击的延后。
        const turnKey='失重延后回合:'+to.id,countKey='失重延后次数:'+to.id;
        if(u.resources[turnKey]!==to.turns){resource(b,u,turnKey,to.turns);resource(b,u,countKey,0);}
        const used=u.resources[countKey]??0,limit=P(u).ult[5];
        if(used<limit){resource(b,u,countKey,used+1);delay(b,to.id,P(u).ult[4]);}
        // 强化行迹「惩戒」：失重目标受到我方攻击后叠加施伤者的增伤。
        if(tr(u,1))stacks(b,u,actor,'惩戒','dmgBoost',tr(u,1)[0],tr(u,1)[1],tr(u,1)[2],{id:u.id+':welt-punish'});
      },
      after(b,u,actor,key,kind,a,selected,hitTargets){
        if(actor!==u)return;
        const p=P(u),enh=u.kit.enhanced,alive=hitTargets.filter(live);
        if(key==='skill')
          for(const to of alive)applySlow(b,u,to,p.skill[1]+(rk(u,4)?rk(u,4):0));
        if(key==='ultimate'){
          for(const to of enemies(b,u)){
            imprison(b,u,to,p.ult[2],p.ult[1],p.ult[3],1);
            if(enh){applyWeight(b,u,to);continue;}
            // 行迹「惩戒」（基础形态）：终结技 100% 基础概率使目标受到的伤害提高 #2，持续 #3 回合。
            const t=tr(u,1);
            if(!t)continue;
            const c=t[0]*(1+(combatPanel(u).effectHit??0))*(1-(combatPanel(to).effectRes??0));
            if(c<1&&b.random()>=c){record(b,'resist',to,{name:'惩戒被抵抗'});continue;}
            buff(b,u,to,'惩戒 · 易伤','vuln',t[1],t[2],{id:u.id+':welt-punish',debuff:true});
          }
          if(tr(u,2))energy(b,u,tr(u,2)[0]);              // 行迹「审判」：额外回能（基础 10 / 强化 5）
          if(rk(u,1))resource(b,u,'E1 剩余次数',rk(u,1,2));
        }
        if(['basic','skill'].includes(key)){
          for(const to of alive)if(slowed(to))talentHit(b,u,to);
          // E1：终结技后随后 #3=2 次普攻 / 战技额外造成 1 次附加伤害（普攻 #1=50%、战技 #2=80% 倍率）。
          const n=u.resources['E1 剩余次数']??0;
          if(n>0&&alive.length){
            const mult=key==='basic'?p.basic[0]*rk(u,1,0):p.skill[0]*rk(u,1,1);
            for(const to of alive)damageTo(b,u,to,{name:'名的传承 · 附加伤害',type:'Additional',element:'Imaginary',
              terms:atk(mult),toughness:0},1,'primary','additional');
            resource(b,u,'E1 剩余次数',n-1);
          }
        }
        // 强化形态 E1：战技 / 终结击中【失重】目标后额外造成 1 次 = 终结技倍率 #1=40% 的附加伤害。
        if(enh&&rk(u,1)&&['skill','ultimate'].includes(key))
          for(const to of alive)if(weight(to))
            damageTo(b,u,to,{name:'名的传承 · 附加伤害',type:'Additional',element:'Imaginary',
              terms:atk(P(u).ult[0]*rk(u,1,0)),toughness:0},1,'primary','additional');
      },
      panel(b,u,to,out){
        // 强化形态行迹「裁决」：效果命中 > #1=40% 时每超过 #2=10% 攻击力 +#3=20%，最多 +#4=80%。
        if(!u.kit.enhanced||!tr(u,3))return;
        const t=tr(u,3),hit=out.effectHit??0;
        if(hit<=t[0])return;
        out.atk+=(out.baseStats?.atk??0)*Math.min(t[3],Math.floor((hit-t[0])/t[1])*t[2]);
      },
      modifiers(b,u,actor,to,a,kind){
        const out={};
        if(actor!==u||to.side===u.side)return out;
        // 行迹「裁决」（基础形态）：对被弱点击破的敌方目标造成的伤害提高 #1=20%。
        if(!u.kit.enhanced&&tr(u,3)&&to.broken)out.dmgBoost=(out.dmgBoost??0)+tr(u,3)[0];
        // 强化形态 E4：【失重】目标全属性抗性降低 #1=30%。
        if(u.kit.enhanced&&rk(u,4)&&weight(to))out.resPen=(out.resPen??0)+rk(u,4);
        // 强化形态 E6：战技 / 终结击中减速目标时暴击率 +#1、暴击伤害 +#2。
        if(u.kit.enhanced&&rk(u,6)&&['BPSkill','Ultra'].includes(a.type)&&slowed(to)){
          out.critRate=(out.critRate??0)+rk(u,6,0);out.critDmg=(out.critDmg??0)+rk(u,6,1);
        }
        return out;
      },
    };
  },

  // ═══════════════════════════════ 1225 忘归人（火 · 虚无）═══════════════════════════════
  1225:function(api){
    const {live,allies,enemies,rank,trace,buff,resource,energy,advance,delay,damageTo,combatPanel,record,sp,stacks}=api;
    const FOX='狐祈',BURN='炽灼',CLOUDFIRE='云火昭';
    const fox=to=>to.buffs.find(e=>e.tag==='fugueFox');
    const burning=u=>u.buffs.some(e=>e.tag==='fugueBurn');
    const cloud=to=>to.buffs.find(e=>e.tag==='fugueCloud');
    // 战技的防御力降低（#3=18% / #4=2 回合）：秘技入场与【狐祈】持有者攻击都复用它。
    function applyDefDown(b,u,to,chance){
      const p=u.kit.params;
      if(!live(to))return false;
      const c=chance*(1+(combatPanel(u).effectHit??0))*(1-(combatPanel(to).effectRes??0));
      if(c<1&&b.random()>=c){record(b,'resist',to,{name:'防御力降低被抵抗'});return false;}
      buff(b,u,to,'衔书摇风 · 防御力降低','defShred',p.BPSkill[3],p.BPSkill[4],{id:u.id+':fugue-def',debuff:true});
      return true;
    }
    // 【云火昭】：等于目标韧性上限 #2=40% 的追加韧性条；初始韧性归零后可继续削减，
    // 削减至 0 时再次受到弱点击破伤害（再次走 breakRuntime.apply）。
    function setCloud(b,u,to){
      if(!live(to)||to.side===u.side||cloud(to))return;
      const max=(to.toughnessMax??0)*u.kit.params.Talent[1];
      if(!(max>0))return;
      buff(b,u,to,CLOUDFIRE,'marker',0,null,{id:u.id+':fugue-cloud',tag:'fugueCloud',debuff:true,stacks:max,cloudMax:max});
      record(b,'mechanic',u,{name:'云火昭',target:to.id,value:max});
    }
    function reduceCloud(b,u,to,amount){
      const e=cloud(to);
      if(!e||!(amount>0))return;
      const left=(e.stacks??0)-amount;
      if(left>EPS){e.stacks=left;return;}
      to.buffs=to.buffs.filter(x=>x!==e);
      record(b,'mechanic',u,{name:'云火昭破碎 · 二次弱点击破',target:to.id});
      if(live(to)){to.broken=true;b.rules.relics.broken(b,u,to);b.breaks.apply(b,u,to,'Fire');}
    }
    // 超击破：把本次攻击的削韧值按天赋 #1=100% 转化（队友攻击同样生效）。
    const superOf=(b,u,from,to,toughness)=>{
      if(!live(to)||!(toughness>0))return;
      b.breaks.superBreak(b,from,to,toughness,u.kit.params.Talent[0],from.element??u.element);
    };
    const toughOf=(a,to,main)=>main?(a.toughness??0):(a.adjacentToughness??a.toughness??0);
    return {
      start(b,u){
        resource(b,u,'首次战技已回点',0);
        // 行迹「涂山玄设」(point07)：自身击破特攻 +#1=30%，施放首次战技后立即恢复 #2=1 点战技点。
        if(trace(u,2))buff(b,u,u,'涂山玄设 · 击破特攻','breakEffect',trace(u,2)[0],null,{id:u.id+':fugue-be'});
        for(const to of enemies(b,u))setCloud(b,u,to);
      },
      waveStart(b,u){for(const to of enemies(b,u))setCloud(b,u,to);},
      // 战技：指定我方单体获得【狐祈】、自身进入【炽灼】#1=3 回合（E6 时狐祈对我方全体生效）。
      before(b,u,actor,key,kind,a,selected){
        if(actor!==u||kind==='copy')return;
        const p=u.kit.params;
        // 终结技：本次攻击无视弱点属性削减敌方全体韧性（在伤害结算前挂 Fire 弱点标记，after 内清理），
        // 击破弱点时触发火属性弱点击破效果。
        if(key==='ultimate'){
          for(const to of enemies(b,u))
            buff(b,u,to,'阳极照世 · 无视弱点','marker',0,1,{id:u.id+':fugue-ult-weak:'+to.id,weakness:'Fire',debuff:true});
          return;
        }
        if(key!=='skill')return;
        const to=selected[0]??u,dur=p.BPSkill[0];
        for(const t of b.units)t.buffs=t.buffs.filter(e=>e.tag!=='fugueFox');
        const targets=(rank(u,6)&&burning(u))?allies(b,u):[to];
        for(const t of targets){
          buff(b,u,t,FOX,'marker',0,dur,{id:u.id+':fox:'+t.id,tag:'fugueFox',tickOwner:u.id,tickAt:'start',removeOnSourceDeath:true});
          buff(b,u,t,'狐祈 · 击破特攻','breakEffect',p.BPSkill[1],dur,{id:u.id+':fox-be:'+t.id,tickOwner:u.id,tickAt:'start'});
          // E1：持有【狐祈】的我方目标弱点击破效率 +#1=50%。
          if(rank(u,1))buff(b,u,t,'狐祈 · 击破效率','breakEfficiency',rank(u,1),dur,{id:u.id+':fox-eff:'+t.id,tickOwner:u.id,tickAt:'start'});
          // E4：持有【狐祈】的我方目标造成的击破伤害 +#1=20%（modifiers 按 kind 提供）。
          if(rank(u,4))buff(b,u,t,'狐祈 · 击破伤害','marker',0,dur,{id:u.id+':fox-brk:'+t.id,tag:'fugueFoxBreak',tickOwner:u.id,tickAt:'start'});
        }
        buff(b,u,u,BURN,'marker',0,dur,{id:u.id+':fugue-burn',tag:'fugueBurn',tickAt:'start'});
        // 行迹「涂山玄设」：施放首次战技后立即恢复 #2=1 点战技点。
        if(trace(u,2)&&!(u.resources['首次战技已回点']??0)){resource(b,u,'首次战技已回点',1);sp(b,u,trace(u,2)[1],'涂山玄设');}
      },
      prepare(b,u,key,kind,a){
        if(kind==='copy'||kind==='technique')return a;
        if(key==='basic'&&burning(u))return {...u.actions.enhancedBasic,targetId:a.targetId};
        return a;
      },
      // 秘技「炤炤彻旷」：进入战斗后自身行动提前 #4=40%，并以 100% 基础概率对每个敌人施加与战技相同的降防。
      entry(b,u){
        const p=u.kit.params;
        advance(b,u.id,p.Maze[3]);
        for(const to of enemies(b,u))applyDefDown(b,u,to,p.Maze[1]);
      },
      // 【狐祈】持有者攻击无对应弱点的敌人时，按原削韧值 #6=50% 削减韧性（临时弱点标记 + 削韧 -50%，动作结束清理）。
      hit(b,u,actor,to,a,kind){
        if(actor.side!==u.side||actor===u||to.side===u.side||!live(to)||kind==='dot')return;
        const el=a.element;if(!el)return;
        if(!fox(actor))return;
        if(to.broken||(to.weaknesses??[]).includes(el)||to.buffs.some(e=>e.weakness===el))return;
        const p=u.kit.params;
        buff(b,actor,to,'狐祈 · 无视弱点','marker',0,null,{id:u.id+':fox-weak:'+to.id,weakness:el,debuff:true});
        buff(b,actor,actor,'狐祈 · 削韧比例','breakEfficiency',-(1-p.BPSkill[5]),null,{id:u.id+':fox-half'});
      },
      // 终结技期间的无视弱点标记在 after 内挂载并清理；削韧转化 + 云火昭 + E2 提前也在 after。
      after(b,u,actor,key,kind,a,selected,hitTargets){
        const p=u.kit.params,targets=hitTargets.filter(live),main=selected[0];
        for(const to of targets){
          const t=toughOf(a,to,main&&to.id===main.id);
          if(to.broken)superOf(b,u,actor,to,t);
          if(to.broken)reduceCloud(b,u,to,t);
        }
        // 清理临时标记（狐祈削韧 / 终结技无视弱点）。
        for(const t of b.units)t.buffs=t.buffs.filter(e=>!e.id.startsWith(u.id+':fox-weak:')&&e.id!==u.id+':fox-half'&&!e.id.startsWith(u.id+':fugue-ult-weak:'));
        if(actor===u&&key==='ultimate'&&rank(u,2)){
          for(const a2 of allies(b,u))advance(b,a2.id,rank(u,2,1));   // E2：终结后我方全体行动提前 24%
        }
        if(actor===u||actor.side!==u.side)return;
        if(!fox(actor))return;
        // 【狐祈】持有者每次施放攻击 → 100% 基础概率使受到攻击的敌方目标防御力降低。
        for(const to of targets)applyDefDown(b,u,to,p.BPSkill[2]);
      },
      // 行迹「青丘重光」击破延后 + E2 击破回能 + 行迹「玑星太素」队友击破特攻。
      afterDamage(b,u,from,to,kind){
        if(kind!=='break'||to.side===u.side)return;
        if(trace(u,1))delay(b,to.id,trace(u,1)[0]);
        if(rank(u,2))energy(b,u,rank(u,2,0));
        if(trace(u,3)){
          const t=trace(u,3),be=combatPanel(u).breakEffect??0;
          const value=t[0]+(be>=t[3]?t[4]:0);
          for(const a of allies(b,u))if(a!==u)
            stacks(b,u,a,'玑星太素 · 击破特攻','breakEffect',value,t[2],t[1],{id:u.id+':fugue-star:'+a.id});
        }
      },
      // 敌方从弱点击破恢复（初始韧性复原）后重新附上【云火昭】。
      beforeRecover(b,u,actor){
        if(actor.side===u.side)return false;
        setCloud(b,u,actor);
        return false;
      },
      modifiers(b,u,actor,to,a,kind){
        const out={};
        if(rank(u,4)&&['break','break_dot','superbreak'].includes(kind)&&actor.side===u.side&&actor!==u
           &&actor.buffs.some(e=>e.tag==='fugueFoxBreak'))
          out.dmgBoost=(out.dmgBoost??0)+rank(u,4);
        void a;void to;
        return out;
      },
    };
  },

  // ═══════════════════════════════ 1321 大丽花（火 · 虚无）═══════════════════════════════
  1321:function(api){
    const {live,allies,enemies,rank,trace,buff,resource,energy,advance,delay,damageTo,combatPanel,record,sp,stacks}=api;
    const FIELD='共舞结界',DECAY='败谢';
    const field=u=>u.buffs.some(e=>e.tag==='dahliaField');
    const dancers=b=>b.units.filter(t=>t.active!==false&&t.hp>1e-8&&t.buffs.some(e=>e.tag==='dahliaDancer'));
    const isDancer=(u,t)=>t.buffs.some(e=>e.tag==='dahliaDancer'&&e.source===u.id);
    let weaknessSnapshot=new Map();
    // 超击破：已击破目标走 breaks.superBreak；结界期间未击破目标也能转化（用 breaks.damage 按同一公式结算）。
    function superHit(b,u,from,to,toughness,ratio,allowUnbroken){
      if(!live(to)||!(toughness>0)||!(ratio>0))return;
      if(to.broken){b.breaks.superBreak(b,from,to,toughness,ratio,from.element??u.element);return;}
      if(!allowUnbroken||!field(u))return;
      const value=superBreakValue(from,toughness,ratio,combatPanel(from));
      b.breaks.damage(b,from,to,value,from.element??u.element,false,'superbreak');
    }
    function openField(b,u){
      const p=u.kit.params;
      buff(b,u,u,FIELD,'marker',0,p.BPSkill[1],{id:u.id+':dahlia-field',tag:'dahliaField',tickAt:'start'});
      // 结界持续期间我方全体的弱点击破效率 +#3=50%。
      for(const a of allies(b,u))
        buff(b,u,a,'共舞结界 · 击破效率','breakEfficiency',p.BPSkill[2],p.BPSkill[1],
          {id:u.id+':dahlia-field-eff:'+a.id,tickAt:'start'});
      resource(b,u,'结界次数',(u.resources['结界次数']??0)+1);
      record(b,'mechanic',u,{name:'开启共舞结界'});
    }
    // 天赋：自身与另一位（击破特攻最高的）队友成为【共舞者】。
    function setDancers(b,u){
      for(const t of b.units)t.buffs=t.buffs.filter(e=>e.tag!=='dahliaDancer');
      const pool=allies(b,u).filter(t=>t!==u);
      const other=pool.length?pool.reduce((a,c)=>(combatPanel(c).breakEffect??0)>(combatPanel(a).breakEffect??0)?c:a):null;
      for(const t of [u,other].filter(Boolean)){
        buff(b,u,t,'共舞者','marker',0,null,{id:u.id+':dancer:'+t.id,tag:'dahliaDancer',removeOnSourceDeath:true});
        // E6：【共舞者】的击破特攻 +#1=150%。
        if(rank(u,6))buff(b,u,t,'共舞者 · 击破特攻','breakEffect',rank(u,6,0),null,{id:u.id+':dancer-be:'+t.id,removeOnSourceDeath:true});
      }
      return other;
    }
    // 【败谢】：防御力降低 #3，并被添加所有【共舞者】属性的弱点。
    function applyDecay(b,u,to,duration){
      const p=u.kit.params;
      buff(b,u,to,DECAY,'marker',0,duration,{id:u.id+':dahlia-decay',tag:'dahliaDecay',debuff:true});
      buff(b,u,to,'败谢 · 防御力降低','defShred',p.Ultra[2],duration,{id:u.id+':dahlia-decay-def',debuff:true});
      for(const d of dancers(b))
        buff(b,u,to,'败谢 · 弱点('+d.element+')','marker',0,duration,{id:u.id+':dahlia-weak:'+d.element,tag:'dahliaWeak',weakness:d.element,debuff:true});
    }
    // 【共舞者】攻击后 E1 的固定削韧（见 e1FixedStance）。
    const openIfNeeded=(b,u)=>{if(!field(u))openField(b,u);};
    // E1：共舞者攻击后额外造成等同于目标韧性上限 #1=25% 的固定削韧（至少 #2=10、至多 #3=300，每目标 1 次）。
    function e1FixedStance(b,u,actor,to){
      if(!rank(u,1))return;
      const done=u.resources['E1固定削韧']??[];
      if(done.includes(to.id))return;
      const amount=Math.min(rank(u,1,2),Math.max(rank(u,1,1),(to.toughnessMax??0)*rank(u,1,0)));
      resource(b,u,'E1固定削韧',[...done,to.id]);
      if((to.toughnessMax??0)<=0||to.broken)return;
      to.toughness=Math.max(0,to.toughness-amount);
      record(b,'toughness',actor,{target:to.id,value:to.toughness});
      if(to.toughness<=EPS&&!to.broken){
        to.broken=true;record(b,'break',actor,{target:to.id});b.rules.relics.broken(b,actor,to);
        b.breaks.apply(b,actor,to,actor.element??'Fire');
      }
    }
    return {
      start(b,u){
        resource(b,u,'追击计数',0);
        resource(b,u,'追击触发回合',-1);
        resource(b,u,'E1固定削韧',[]);
        energy(b,u,u.kit.params.Talent[3]);                 // 天赋 #4：进入战斗恢复 35 点能量
        setDancers(b,u);
        if(trace(u,1)){                                     // 行迹「又一场葬礼」
          const t=trace(u,1),be=combatPanel(u).breakEffect??0;
          for(const a of allies(b,u))if(a!==u)
            buff(b,u,a,'又一场葬礼 · 击破特攻','breakEffect',t[0]*be+t[2],t[1],{id:u.id+':dahlia-funeral:'+a.id});
        }
        if(rank(u,2))for(const to of enemies(b,u)){
          applyDecay(b,u,to,rank(u,2,1));
          buff(b,u,to,'大丽花 E2 · 全属性抗性降低','resPen',rank(u,2,0),null,{id:u.id+':dahlia-e2',tag:'dahlia-e2',debuff:true,resReduction:true});
        }
      },
      waveStart(b,u){
        if(rank(u,2))for(const to of enemies(b,u)){
          if(!to.buffs.some(e=>e.tag==='dahliaDecay'))applyDecay(b,u,to,rank(u,2,1));
          if(!to.buffs.some(e=>e.tag==='dahlia-e2'))buff(b,u,to,'大丽花 E2 · 全属性抗性降低','resPen',rank(u,2,0),null,{id:u.id+':dahlia-e2',tag:'dahlia-e2',debuff:true,resReduction:true});
        }
      },
      turnStart(b,u,actor){
        if(actor!==u)return;
        resource(b,u,'追击触发回合',-1);
        if(!isDancer(u,u))setDancers(b,u);
      },
      death(b,u,from,to){
        if(to.side===u.side)return;
        resource(b,u,'E1固定削韧',(u.resources['E1固定削韧']??[]).filter(id=>id!==to.id));
      },
      // 秘技「心，是最好的坟茔」：立即开启战技结界，并对已击破目标转化开战削韧。
      entry(b,u){
        openIfNeeded(b,u);
        for(const to of enemies(b,u))if(to.broken)superHit(b,u,u,to,30,u.kit.params.Maze[1],true);
      },
      before(b,u,actor,key,kind,a,selected){
        if(actor!==u||kind==='copy')return;
        if(key==='skill')openField(b,u);
        if(key==='ultimate'){
          // 先使敌方全体陷入【败谢】（持续 #2=4 回合）再结算伤害。
          for(const to of selected)if(live(to))applyDecay(b,u,to,u.kit.params.Ultra[1]);
          // 行迹「弃旧，恋新」：攻击期间为敌方添加弱点 → 攻击后补固定削韧与回能（在 after 结算）。
          weaknessSnapshot=new Map(enemies(b,u).map(t=>[t.id,new Set(t.buffs.filter(e=>e.weakness).map(e=>e.weakness))]));
        }
      },
      // 天赋：另一位【共舞者】攻击后大丽花发动追加攻击（每回合 #1=1 次）。
      afterHit(b,u,actor,to,a,kind){
        // 只有「攻击」才触发；持续伤害 tick（含击破持续伤害）与附加伤害不算攻击。
        if(['dot','break_dot','superbreak','additional','true'].includes(kind))return;
        if(actor.side!==u.side||actor===u||!live(to)||to.side===u.side)return;
        if(!isDancer(u,actor))return;
        if(u.resources['追击触发回合']===u.turns)return;
        resource(b,u,'追击触发回合',u.turns);
        b.queue.push({actor:u.id,key:'followup',kind:'followup',targetId:to.id});
      },
      after(b,u,actor,key,kind,a,selected,hitTargets){
        const p=u.kit.params,targets=hitTargets.filter(live),main=selected[0];
        if(actor.side===u.side&&isDancer(u,actor)){
          // 共舞者攻击已击破目标后转化削韧；E1 使该转化对我方全体生效、共舞者倍率额外 +40%。
          const isSelf=actor===u;
          let ratio=0;
          if(isSelf||rank(u,1))ratio=p.Talent[4]*(isSelf&&rank(u,1)?1+rank(u,1,3):1);
          for(const to of targets){
            const t=main&&to.id===main.id?(a.toughness??0):(a.adjacentToughness??a.toughness??0);
            superHit(b,u,actor,to,t,ratio,true);
            e1FixedStance(b,u,actor,to);
          }
        }
        if(actor!==u)return;
        if(key==='followup'){
          resource(b,u,'追击计数',(u.resources['追击计数']??0)+1);
          // 行迹「致哀，故人」：每 #1=2 次追加攻击恢复 1 个战技点。
          if(trace(u,2)&&(u.resources['追击计数']??0)%trace(u,2)[0]===0)sp(b,u,1,'致哀，故人');
          // E4：施放追击时使敌方全体受到的伤害提高 #1=12%，持续 #2=2 回合。
          if(rank(u,4))for(const to of enemies(b,u))
            buff(b,u,to,'大丽花 E4 · 易伤','vuln',rank(u,4,0),rank(u,4,1),{id:u.id+':dahlia-e4',debuff:true});
          // E6：施放追击时使所有【共舞者】下一次行动提前 #2=20%。
          if(rank(u,6))for(const d of dancers(b))advance(b,d.id,rank(u,6,1));
          // 天赋：追击对已击破目标造成伤害后按 #3=200% 转化超击破。
          for(const to of targets)superHit(b,u,u,to,S(1321,132104,0),p.Talent[2],false);
        }
        // 行迹「弃旧，恋新」：我方为敌方添加弱点 → 速度 +#3=30% 持续 #4=2 回合；
        // 火属性角色添加弱点时，攻击后对每个新加弱点的目标补 #5=20 固定火削韧并回能（上限 #1=50%）。
        if(trace(u,3)&&weaknessSnapshot.size){
          const t=trace(u,3),added=[];
          for(const to of enemies(b,u)){
            const before=weaknessSnapshot.get(to.id)??new Set();
            const now=new Set(to.buffs.filter(e=>e.weakness).map(e=>e.weakness));
            if([...now].some(el=>!before.has(el)))added.push(to);
          }
          if(added.length){
            for(const to of added)buff(b,u,actor,'弃旧，恋新 · 速度','speedPct',t[2],t[3],{id:u.id+':dahlia-speed:'+to.id});
            if(actor.element==='Fire'){
              for(const to of added){
                if((to.toughnessMax??0)>0&&!to.broken){
                  to.toughness=Math.max(0,to.toughness-t[4]);record(b,'toughness',actor,{target:to.id,value:to.toughness});
                  if(to.toughness<=EPS){to.broken=true;record(b,'break',actor,{target:to.id});b.rules.relics.broken(b,actor,to);b.breaks.apply(b,actor,to,'Fire');}
                }
              }
              const cap=u.energyMax*t[0];
              const gain=Math.min(u.energyMax*t[1],cap-u.energy);
              if(gain>0)energy(b,u,gain,true);
            }
          }
          weaknessSnapshot=new Map();
        }
      },
      // 终结技的伤害由敌方全体均分（准备阶段按存活敌人数缩放）。
      prepare(b,u,key,kind,a){
        if(key!=='ultimate'||kind==='copy'||kind==='technique')return a;
        const n=enemies(b,u).length;
        if(n<=1)return a;
        return {...a,terms:(a.terms??[]).map(t=>({...t,multiplier:t.multiplier/n}))};
      },
      modifiers(b,u,actor,to,a,kind){
        const out={};
        if(to.side===u.side)return out;
        // E1：E1 使天赋的超击破转化对我方全体生效（转化倍率在 after 里体现），这里补共舞者超击破增伤。
        if(rank(u,1)&&kind==='superbreak'&&actor.side===u.side&&actor.buffs.some(e=>e.tag==='dahliaDancer'))
          out.dmgBoost=(out.dmgBoost??0)+rank(u,1,3);
        void a;
        return out;
      },
    };
  },

  // ═══════════════════════════════ 1406 赛飞儿（量子 · 虚无）═══════════════════════════════
  1406:function(api){
    const {live,allies,enemies,rank,trace,buff,resource,energy,trueDamage,damageTo,combatPanel,record}=api;
    const SERVANT_CYPHER_POEM=[.504,.28,.168]; // hsr_core 1141520 level 10
    const MARK='老主顾';
    const mark=to=>to.buffs.find(e=>e.tag==='cipherMark');
    // 记录倍率：主目标 #2=12%（行迹「三百侠盗」另记其他敌人 #1=8%）；E1 ×#3=1.5；
    // 行迹「神行宝鞋」速度 ≥140 / ≥170 时 +#3=50% / +#4=100%。
    const ratioOf=(u,isMark)=>{
      const base=isMark?u.kit.params.Talent[1]:(trace(u,2)?trace(u,2)[0]:0);
      if(!base)return 0;
      let mult=rank(u,1)?rank(u,1,2):1;
      if(trace(u,1)){const t=trace(u,1),spd=combatPanel(u).speed;if(spd>=170)mult*=1+t[3];else if(spd>=140)mult*=1+t[2];}
      return base*mult;
    };
    function setMark(b,u,to){
      if(!live(to)||to.side===u.side)return;
      for(const t of b.units)t.buffs=t.buffs.filter(e=>e.tag!=='cipherMark');
      buff(b,u,to,MARK,'marker',0,null,{id:u.id+':cipher-mark',tag:'cipherMark',debuff:true});
      record(b,'mechanic',u,{name:'老主顾',target:to.id});
    }
    const addRecord=(b,u,v)=>{if(v>0)resource(b,u,'记录值',(u.resources['记录值']??0)+v);};
    return {
      start(b,u){
        resource(b,u,'记录值',0);
        resource(b,u,'追击已触发',0);
        const pool=enemies(b,u);
        if(pool.length)setMark(b,u,pool.reduce((a,c)=>combatPanel(c).hp>combatPanel(a).hp?c:a));
      },
      waveStart(b,u){
        if(!enemies(b,u).some(t=>mark(t))){const pool=enemies(b,u);if(pool.length)setMark(b,u,pool[0]);}
      },
      turnStart(b,u,actor){
        if(actor===u)resource(b,u,'追击已触发',0);      // 天赋 #3：每回合最多触发 1 次
      },
      // 秘技「穿靴子的猫」：对敌方全体造成 #3=100% 攻击力量子伤害，该次伤害获得的记录值提高 #2=200%。
      entry(b,u){
        const p=u.kit.params;
        resource(b,u,'秘技记录倍率',1+p.Maze[1]);
        for(const to of enemies(b,u))
          damageTo(b,u,to,{name:'穿靴子的猫',type:'Maze',element:'Quantum',terms:atk(p.Maze[2]),
            toughness:S(1406,140607,0)},1,'primary','technique');
        resource(b,u,'秘技记录倍率',0);
      },
      before(b,u,actor,key,kind,a,selected){
        if(actor!==u||kind==='copy')return;
        const p=u.kit.params;
        if(key==='skill'){
          const to=selected[0];if(live(to))setMark(b,u,to);
          // #6=120% 基础概率使主目标与相邻陷入虚弱（伤害 -#3=10%），自身攻击力 +#5=30%，持续 #4=2 回合。
          for(const t of [to,...adjacentOf(b,u,to)].filter(Boolean)){
            if(!live(t))continue;
            const c=p.BPSkill[5]*(1+(combatPanel(u).effectHit??0))*(1-(combatPanel(t).effectRes??0));
            if(c<1&&b.random()>=c){record(b,'resist',t,{name:'虚弱被抵抗'});continue;}
            buff(b,u,t,'空手套白银 · 虚弱','atkPct',-p.BPSkill[2],p.BPSkill[3],{id:u.id+':cipher-weak',debuff:true});
          }
          buff(b,u,u,'空手套白银 · 攻击力','atkPct',p.BPSkill[4],p.BPSkill[3],{id:u.id+':cipher-atk'});
        }
        if(key==='ultimate'){const to=selected[0];if(live(to))setMark(b,u,to);}
      },
      after(b,u,actor,key,kind,a,selected,hitTargets){
        if(actor!==u)return;
        const p=u.kit.params;
        // E2：击中敌方目标时 #2=120% 基础概率使其易伤 #3=30%，持续 #1=2 回合。
        if(rank(u,2))for(const to of hitTargets.filter(live)){
          const c=rank(u,2,1)*(1+(combatPanel(u).effectHit??0))*(1-(combatPanel(to).effectRes??0));
          if(c<1&&b.random()>=c){record(b,'resist',to,{name:'E2 易伤被抵抗'});continue;}
          buff(b,u,to,'赛飞儿 E2 · 易伤','vuln',rank(u,2,2),rank(u,2,0),{id:u.id+':cipher-e2',debuff:true});
        }
        // E1：施放天赋追加攻击时攻击力 +#1=80%，持续 #2=2 回合。
        if(key==='followup'&&rank(u,1))buff(b,u,u,'察言观色看笑脸 · 攻击力','atkPct',rank(u,1,0),rank(u,1,1),{id:u.id+':cipher-e1'});
        if(key!=='ultimate')return;
        // 终结：对主目标 5 次合计 #2=25% 记录值的真实伤害；对主目标 + 相邻合计 #3=75% 记录值均分。
        const rec=u.resources['记录值']??0,main=selected[0];
        if(rec>0&&live(main))
          for(let i=0;i<5;i++)trueDamage(b,u,main,rec*p.Ultra[1]/5,'猫咪怪盗，敬上！ · 真实伤害');
        const targets=hitTargets.filter(live);
        if(rec>0&&targets.length){
          const per=rec*p.Ultra[2]/targets.length;
          for(const t of targets)trueDamage(b,u,t,per,'猫咪怪盗，敬上！ · 真实伤害');
        }
        resource(b,u,'记录值',rec*(rank(u,6)?rank(u,6,0):0));   // E6：返还清除记录值的 #1=20%
      },
      // 天赋记录：我方目标对敌方造成的非真实伤害（不记溢出）按倍率累积。
      afterDamage(b,u,from,to,kind){
        if(kind==='true'||!from||from.side!==u.side||to.side===u.side)return;
        const ev=b.log[b.log.length-1];
        const dealt=ev&&ev.type==='damage'?(ev.hpDamage??0):0;
        if(!(dealt>0))return;
        let r=ratioOf(u,!!mark(to));
        if(!r)return;
        // E6：记录时额外记录该次追加攻击非溢出伤害的 #3=16%。
        if(rank(u,6)&&b.activeAction?.actor===u.id&&b.activeAction?.key==='followup')r+=rank(u,6,2);
        const maze=u.resources['秘技记录倍率']??0;
        addRecord(b,u,dealt*r*(maze||1));
      },
      // 老主顾受到其他我方目标攻击 → 立即追加攻击（每回合 #3=1 次）；E4 额外附加伤害 #1=50%。
      afterHit(b,u,actor,to,a,kind){
        // 「受到我方其他目标攻击后」不包含持续伤害 tick / 附加伤害。
        if(['dot','break_dot','superbreak','additional','true'].includes(kind))return;
        if(actor===u||actor.side!==u.side||to.side===u.side||!live(to))return;
        if(!mark(to))return;
        if(rank(u,4))damageTo(b,u,to,{name:'赛飞儿 E4 · 附加伤害',type:'Additional',element:'Quantum',
          terms:atk(rank(u,4)),toughness:0},1,'primary','additional');
        const cap=u.kit.params.Talent[2];
        if((u.resources['追击已触发']??0)>=cap)return;
        resource(b,u,'追击已触发',(u.resources['追击已触发']??0)+1);
        b.queue.push({actor:u.id,key:'followup',kind:'followup',targetId:to.id});
      },
      modifiers(b,u,actor,to,a,kind){
        const out={};
        if(to.side===u.side)return out;
        // 1141520「诡计」诗篇：被【老主顾】标记目标防御降低 28%，其他敌人降低 16.8%。
        if(u.buffs.some(e=>String(e.tag??'').startsWith('cyreneCipherPoem:')))
          out.defShred=(out.defShred??0)+(mark(to)?SERVANT_CYPHER_POEM[1]:SERVANT_CYPHER_POEM[2]);
        // 行迹「偷天换日」：赛飞儿在场时敌方全体受到的伤害 +#1=40%；追击暴击伤害 +#2=100%。
        if(trace(u,3)){
          out.vuln=(out.vuln??0)+trace(u,3)[0];
          if(actor===u&&kind==='followup')out.critDmg=(out.critDmg??0)+trace(u,3)[1];
        }
        // E6：天赋追加攻击造成的伤害 +#2=350%。
        if(actor===u&&kind==='followup'&&rank(u,6))out.dmgBoost=(out.dmgBoost??0)+rank(u,6,1);
        void a;
        return out;
      },
    };
  },

  // ═══════════════════════════════ 1410 海瑟音（物理 · 虚无）═══════════════════════════════
  1410:function(api){
    const {live,allies,enemies,rank,trace,buff,resource,energy,dot,damageTo,combatPanel,record,sp}=api;
    const FIELD='绝海回涛 · 结界';
    const KINDS=[{el:'Wind',name:'风化'},{el:'Physical',name:'裂伤'},{el:'Fire',name:'灼烧'},{el:'Thunder',name:'触电'}];
    const field=u=>u.buffs.some(e=>e.tag==='hysField');
    const talentDots=to=>to.dots.filter(d=>d.hysTalent);
    let busy=false;
    // 天赋 DoT：风化 / 灼烧 / 触电按 #2=25% 攻击力；裂伤按目标生命上限 #3=20%（上限 #4=25% 攻击力）。
    // E6：结界期间倍率 +#2=20%。
    function applyTalentDot(b,u,to,kind,chance,extraId){
      const p=u.kit.params,boost=rank(u,6)?1+rank(u,6,1):1;
      const opt={name:'海瑟音 · '+kind.name,element:kind.el,chance,duration:p.Talent[4],extra:{hysTalent:true,snapshotAtk:true}};
      if(extraId)opt.extra.id=extraId;
      if(kind.el==='Physical')
        opt.value=Math.min(combatPanel(to).hp*p.Talent[2],(combatPanel(u).atk??0)*p.Talent[3]*boost);
      else opt.terms=[{scaling:'atk',multiplier:p.Talent[1]*boost}];
      return dot(b,u,to,opt);
    }
    // 优先陷入不同的状态；E1：#2=100% 基础概率额外再施加一次同类状态（可同时存在）。
    function applyDot(b,u,to){
      const p=u.kit.params,have=new Set(talentDots(to).map(d=>d.element));
      const missing=KINDS.filter(k=>!have.has(k.el));
      const pool=missing.length?missing:KINDS;
      const pick=pool[Math.floor(b.random()*pool.length)];
      const made=applyTalentDot(b,u,to,pick,p.Talent[0]);
      if(made&&rank(u,1)){
        const c=rank(u,1,1)*(1+(combatPanel(u).effectHit??0))*(1-(combatPanel(to).effectRes??0));
        if(c>=1||b.random()<c)applyTalentDot(b,u,to,pick,p.Talent[0],u.id+':hys-e1:'+pick.el);
        else record(b,'resist',to,{name:'E1 额外持续伤害被抵抗'});
      }
      return made;
    }
    function openField(b,u){
      const p=u.kit.params;
      buff(b,u,u,FIELD,'marker',0,p.Ultra[1],{id:u.id+':hys-field',tag:'hysField',tickAt:'start'});
      resource(b,u,'结界触发次数',0);
      for(const to of enemies(b,u)){
        buff(b,u,to,'绝海回涛 · 攻击力降低','atkPct',-p.Ultra[5],p.Ultra[1],{id:u.id+':hys-atkdown',debuff:true});
        buff(b,u,to,'绝海回涛 · 防御力降低','defShred',p.Ultra[2],p.Ultra[1],{id:u.id+':hys-defdown',debuff:true});
      }
      if(trace(u,1))sp(b,u,trace(u,1)[1],'征服的剑旗');      // 行迹「征服的剑旗」：展开结界恢复 1 个战技点
      record(b,'mechanic',u,{name:'展开结界'});
    }
    // 结界：敌方每受到 1 次持续伤害 → 海瑟音对其造成 #4=80% 攻击力的物理持续伤害
    //（最多 #5=8 次，E6 提高至 #1=12 次且倍率 +#2=20%；该伤害不重复触发自身）。
    function fieldTrigger(b,u,to){
      if(!field(u)||!live(to)||to.side===u.side||busy)return;
      const cap=rank(u,6)?rank(u,6,0):u.kit.params.Ultra[4];
      const used=u.resources['结界触发次数']??0;
      if(used>=cap)return;
      resource(b,u,'结界触发次数',used+1);
      const mul=u.kit.params.Ultra[3]*(rank(u,6)?1+rank(u,6,1):1);
      busy=true;
      try{
        damageTo(b,u,to,{name:'绝海回涛 · 持续伤害',type:'DoT',element:'Physical',
          terms:atk(mul),toughness:0},1,'primary','dot');
      }finally{busy=false;}
    }
    return {
      start(b,u){
        resource(b,u,'结界触发次数',0);
        if(trace(u,1))openField(b,u);     // 行迹「征服的剑旗」：战斗开始时展开与终结技相同的结界 #1=3 回合
      },
      // 秘技「于海的栖息地」：与【醉心】敌人进入战斗后 100% 基础概率使每个敌人陷入天赋的 #3=2 种状态。
      entry(b,u){
        for(const to of enemies(b,u))for(let i=0;i<u.kit.params.Maze[2];i++)applyDot(b,u,to);
      },
      // 天赋：我方目标攻击时 100% 基础概率使被击中的敌方目标陷入 1 种（优先未持有）持续伤害。
      after(b,u,actor,key,kind,a,selected,hitTargets){
        if(actor.side!==u.side||kind==='technique')return;
        for(const to of hitTargets.filter(live))applyDot(b,u,to);
        // 战技 141002「泛音，暗流后齐鸣」：#2=100% 基础概率使敌方全体受到的伤害提高 #3=20%，持续 #4=3 回合。
        if(actor===u&&key==='skill'){
          const p=u.kit.params;
          for(const to of enemies(b,u).filter(live)){
            const c=p.BPSkill[1]*(1+(combatPanel(u).effectHit??0))*(1-(combatPanel(to).effectRes??0));
            if(c<1&&b.random()>=c){record(b,'resist',to,{name:'泛音，暗流后齐鸣 · 受伤提高被抵抗'});continue;}
            buff(b,u,to,'泛音，暗流后齐鸣 · 受到的伤害提高','vuln',p.BPSkill[2],p.BPSkill[3],{id:u.id+':hys-vuln',debuff:true});
          }
        }
        // 1141522「浪潮」诗篇：普攻/战技命中后，目标当前 DoT 按指定比例立即结算；
        // 暖流仅首次触发，回能不会随后续引爆重复获得。
        if(actor===u&&hitTargets.length>0&&u.buffs.some(e=>String(e.tag??'').startsWith('cyreneHysPoem:'))){
          const pms=u.resources['Cyrene诗篇参数:浪潮']??{basic:.84,skill:1.12,energy:60};
          if(u.buffs.some(e=>String(e.tag??'').startsWith('cyreneHysWarm:'))){resource(b,u,'海瑟音浪潮暖流已触发',1);energy(b,u,pms.energy,true);}
          u.buffs=u.buffs.filter(e=>!String(e.tag??'').startsWith('cyreneHysWarm:'));
          const ratio=key==='skill'?pms.skill:pms.basic;
          if(['basic','enhancedBasic','skill'].includes(key))for(const to of hitTargets.filter(live))for(const d of [...to.dots]){
            const src=b.units.find(x=>x.id===d.source)??u;
            let terms=null;
            if(d.terms?.length)terms=d.terms.map(t=>({...t,multiplier:(t.multiplier??0)*ratio,flatAdd:(t.flatAdd??0)*ratio}));
            else if((d.value??0)>0){const stacks=d.element==='Physical'?1:(d.stacks??1);terms=[{scaling:'atk',multiplier:0,flatAdd:d.value*stacks*ratio}];}
            if(terms)damageTo(b,src,to,{name:(d.name??'持续伤害')+' · 献予「海洋」之诗',type:'Additional',element:d.element,terms,toughness:0},1,'primary','dot');
          }
          record(b,'mechanic',u,{name:'献予「海洋」之诗 · 持续伤害引爆',ratio,targets:hitTargets.length});
        }
        void key;void a;void selected;void hitTargets;
      },
      before(b,u,actor,key,kind,a,selected){
        if(actor!==u||key!=='ultimate'||kind==='copy')return;
        // 行迹「盛会的泡沫」：施放终结技时，使敌方目标当前承受的所有持续伤害立即产生 #1=150% 的伤害。
        // 引爆归属：可能包含队友施加的持续伤害，必须按该 DoT 施加者的面板 / 光锥 / 遗器结算，
        // 不能一律用海瑟音自己的面板（与卡芙卡引爆同一口径）。
        if(trace(u,2))for(const to of enemies(b,u))for(const d of [...to.dots]){
          const src=b.units.find(x=>x.id===d.source)??u;
          let terms=null;
          if(d.terms?.length)terms=d.terms.map(t=>({...t,multiplier:(t.multiplier??0)*trace(u,2)[0],flatAdd:(t.flatAdd??0)*trace(u,2)[0]}));
          else if((d.value??0)>0){
            // 与 breaks.tick 同口径：非物理击破持续伤害按层数结算（风化/纠缠可叠层）。
            const st=d.element==='Physical'?1:(d.stacks??1);
            terms=[{scaling:'atk',multiplier:0,flatAdd:(d.value??0)*st*trace(u,2)[0]}];
          }
          if(!terms)continue;
          damageTo(b,src,to,{name:(d.name??'持续伤害')+' · 盛会泡沫',type:'Additional',element:d.element,
            terms,toughness:0},1,'primary','dot');
        }
        openField(b,u);
        void selected;
      },
      afterDamage(b,u,from,to,kind){
        // 结界：敌方受到持续伤害后触发海瑟音的物理持续伤害；击破持续伤害同为持续伤害。
        if(['dot','break_dot'].includes(kind)&&to.side!==u.side)fieldTrigger(b,u,to);
      },
      turnStart(b,u,actor){
        if(actor.side!==u.side&&field(u))fieldTrigger(b,u,actor);   // 每回合开始时同样触发
      },
      modifiers(b,u,actor,to,a,kind){
        const out={};
        // E1：海瑟音在场时我方目标造成的持续伤害为原伤害的 #1=116%（+16%）。
        if(rank(u,1)&&kind==='dot'&&actor.side===u.side)out.dmgBoost=(out.dmgBoost??0)+rank(u,1,0)-1;
        // 行迹「珍珠的琴弦」：效果命中 > #1=60% 时每超过 #2=10% 伤害 +#3=15%，最多 +#4=90%；
        // E2 使该效果在结界期间对我方全体生效。
        if(trace(u,3)&&actor.side===u.side){
          const t=trace(u,3);
          if(actor===u||(rank(u,2)&&field(u))){
            const hit=combatPanel(u).effectHit??0;
            if(hit>t[0])out.dmgBoost=(out.dmgBoost??0)+Math.min(t[3],Math.floor((hit-t[0])/t[1])*t[2]);
          }
        }
        if(to.side===u.side)return out;
        // E4：结界持续期间敌方全体全属性抗性降低 #1=20%。
        if(rank(u,4)&&field(u))out.resPen=(out.resPen??0)+rank(u,4);
        void a;
        return out;
      },
      display(b,u){
        return [{type:'buff',id:u.id+':hys-field-view',source:u.id,name:'绝海回涛 · 结界剩余回合',key:'marker',
          value:u.buffs.find(e=>e.tag==='hysField')?.remaining??0,derived:true},
          {type:'buff',id:u.id+':hys-trigger-view',source:u.id,name:'结界触发次数',key:'marker',
            value:u.resources['结界触发次数']??0,derived:true}];
      },
    };
  },

  // ═══════════════════════════════ 1507 千冶•刃（火 · 虚无）═══════════════════════════════
  1507:function(api){
    const {live,allies,enemies,rank,trace,buff,resource,energy,advance,delay,heal,damageTo,combatPanel,record,stacks}=api;
    const RAGE='无量忿怒',FIELD='烬灭结界',EMBER='煞火缠身';
    const rage=u=>u.buffs.some(e=>e.tag==='mortaRage');
    const fieldOpen=u=>u.buffs.some(e=>e.tag==='mortaField');
    const summonOf=(b,u)=>b.summons.find(s=>s.owner===u.id&&s.active);
    const chargeCap=u=>rank(u,2)?rank(u,2,1):u.kit.params.Talent[0];
    function applyEmber(b,u,to){
      const p=u.kit.params;
      if(!live(to)||to.side===u.side)return;
      buff(b,u,to,EMBER,'marker',0,p.Ultra[7],{id:u.id+':morta-ember',tag:'mortaEmber',debuff:true});
      buff(b,u,to,'煞火缠身 · 防御力降低','defShred',p.Ultra[6],p.Ultra[7],{id:u.id+':morta-ember-def',debuff:true});
      buff(b,u,to,'煞火缠身 · 易伤','vuln',p.Ultra[3],p.Ultra[7],{id:u.id+':morta-ember-vuln',debuff:true});
    }
    // 天赋：结界期间我方每次攻击 → 目标陷入【煞火缠身】且千冶•刃 +1 充能；
    // 充能达到 #1=9（E2 降为 #2=7）且生命 >1 时消耗并恢复 #2=25 点能量、额外施放 1 次战技（视为追加攻击）。
    function addCharge(b,u,n=1){
      if(!fieldOpen(u))return;
      const cap=chargeCap(u),cur=u.resources['充能']??0;
      resource(b,u,'充能',Math.min(cap,cur+n));
      if((u.resources['充能']??0)>=cap&&u.hp>1){
        resource(b,u,'充能',0);
        energy(b,u,u.kit.params.Talent[1]);
        record(b,'mechanic',u,{name:'因果尽偿 · 额外战技'});
        b.queue.push({actor:u.id,key:'followup',kind:'followup',targetId:null});
      }
    }
    // 结界解除：退出【无量忿怒】、移除倒计时，并按行迹「百炼骨」补足能量。
    function closeField(b,u){
      if(!fieldOpen(u)&&!rage(u))return;
      u.buffs=u.buffs.filter(e=>!['mortaRage','mortaField'].includes(e.tag)
        &&!String(e.id).startsWith(u.id+':morta-rage')
        &&!String(e.id).startsWith(u.id+':morta-crit')
        &&!String(e.id).startsWith(u.id+':morta-field'));
      const s=summonOf(b,u);if(s)s.active=false;
      resource(b,u,'充能',0);
      if(trace(u,1)){const need=u.energyMax*trace(u,1)[0];if(u.energy<need)energy(b,u,need-u.energy,true);}
      record(b,'mechanic',u,{name:'退出无量忿怒'});
    }
    return {
      start(b,u){
        resource(b,u,'充能',0);
        resource(b,u,'致命回复待结算',0);
        resource(b,u,'满能量净化回合',-1);
        // 行迹「百炼骨」：战斗开始时若能量不足 #1=75% 则立刻恢复至 75%。
        if(trace(u,1)){const need=u.energyMax*trace(u,1)[0];if(u.energy<need)energy(b,u,need-u.energy,true);}
      },
      // 秘技「十方无赦」：敌方全体陷入嘲讽 1 回合，自身受到的伤害降低 #1=90%，持续 #2=2 回合。
      entry(b,u){
        const p=u.kit.params;
        for(const to of enemies(b,u))
          buff(b,u,to,'十方无赦 · 嘲讽','marker',0,1,{id:u.id+':morta-taunt:'+to.id,tag:'mortaTaunted',debuff:true});
        buff(b,u,u,'十方无赦 · 减伤','dmgReduction',p.Maze[0],p.Maze[1],{id:u.id+':morta-maze-dr'});
      },
      // 【无量忿怒】：普攻强化为 150708、终结替换为 150714（E6 倍率 ×#1=1.5）。
      prepare(b,u,key,kind,a){
        if(kind==='copy'||kind==='technique')return a;
        if(!rage(u))return a;
        if(key==='basic')return {...u.actions.enhancedBasic,targetId:a.targetId};
        if(key==='ultimate'){
          const mult=rowOf(1507,150703,u.kit.params.Ultra,150714)[0]*(rank(u,6)?rank(u,6):1);
          return {...u.actions.enhancedUltimate,terms:hp(mult),targetId:a.targetId};
        }
        return a;
      },
      // 未处于【无量忿怒】或生命 ≤1 时无法施放战技。
      shouldUseSkill(b,u){return rage(u)&&u.hp>1;},
      // 嘲讽：被嘲讽的敌方目标优先攻击千冶•刃（引擎按 aggro × aggroRatio 选目标）；
      // 行迹「千锻魂」：结界期间自身受到伤害降低 #2=50%、受到治疗提高 #3=50%。
      panel(b,u,to,out){
        if(to!==u)return;
        if(b.units.some(t=>t.side!==u.side&&t.buffs.some(e=>e.tag==='mortaTaunted')))
          out.aggroRatio=(out.aggroRatio??1)*1000;
        if(fieldOpen(u)&&trace(u,2)){
          out.dmgReduction=1-(1-(out.dmgReduction??0))*(1-trace(u,2)[1]);
          out.incomingHeal=(out.incomingHeal??0)+trace(u,2)[2];
        }
      },
      before(b,u,actor,key,kind,a,selected){
        if(actor!==u||kind==='copy')return;
        const p=u.kit.params;
        if(key==='ultimate'&&!rage(u)){
          // 骸骨当炉，血肉即薪：敌方全体【煞火缠身】，消耗 #1=20% 生命上限（由动作 hpCostRatio 结算）展开结界。
          for(const to of enemies(b,u))applyEmber(b,u,to);
          buff(b,u,u,RAGE,'marker',0,null,{id:u.id+':morta-rage',tag:'mortaRage'});
          buff(b,u,u,'无量忿怒 · 暴击率','critRate',p.Ultra[1],null,{id:u.id+':morta-crit'});
          buff(b,u,u,'无量忿怒 · 暴击伤害','critDmg',p.Ultra[2],null,{id:u.id+':morta-critdmg'});
          buff(b,u,u,FIELD,'marker',0,null,{id:u.id+':morta-field',tag:'mortaField'});
          const old=summonOf(b,u);if(old)old.active=false;
          b.summons.push({id:u.id+':morta-countdown',name:'无量忿怒 · 倒计时',owner:u.id,kind:'countdown',
            speed:p.Ultra[4],distance:10000,active:true,order:b.units.length+b.summons.length});
          record(b,'mechanic',u,{name:'展开烬灭结界'});
        }
        void selected;
      },
      // 天赋：结界期间我方目标每次攻击敌方后 → 对应目标【煞火缠身】且 +1 充能；行迹「百炼骨」满能量净化。
      after(b,u,actor,key,kind,a,selected,hitTargets){
        if(actor.side!==u.side)return;
        // 普攻 / 强化普攻使目标陷入嘲讽 1 回合（150701 / 150708 desc）。
        if(key==='basic')
          for(const to of hitTargets.filter(live))
            buff(b,u,to,'嘲讽','marker',0,1,{id:u.id+':morta-taunt:'+to.id,tag:'mortaTaunted',debuff:true});
        if(!fieldOpen(u))return;
        for(const to of hitTargets.filter(live))applyEmber(b,u,to);
        addCharge(b,u,1);
        // E1：施放天赋的额外战技后使【无量忿怒】倒计时行动延后 #2=15%。
        if(rank(u,1)&&actor===u&&key==='followup'){
          const s=summonOf(b,u);
          if(s){s.distance+=10000*rank(u,1,1);record(b,'delay',u,{name:'千冶•刃 E1 · 倒计时行动延后',target:s.id,ratio:rank(u,1,1),distance:s.distance});}
        }
        // 行迹「百炼骨」：能量恢复至上限时解除自身所有负面效果（原文无每回合限次；
        // 用「本次是否刚达到上限」的状态跟踪，避免满能量期间对每个事件重复净化）。
        if(trace(u,1)){
          const full=u.energy>=u.energyMax-EPS;
          if(full&&!(u.resources['已满能量']??0)){
            resource(b,u,'已满能量',1);
            u.buffs=u.buffs.filter(e=>!e.debuff&&!e.control);u.dots=u.dots.filter(e=>!e.debuff);
            record(b,'cleanse',u,{target:u.id,name:'百炼骨 · 满能量净化'});
          } else if(!full)resource(b,u,'已满能量',0);
        }
        // 行迹「百炼骨」：施放终结技后清空积攒的溢出能量并恢复相应能量（上限 #2=80）。
        if(actor===u&&key==='ultimate'&&trace(u,1)){
          const stored=Math.min(trace(u,1)[1],u.energyOverflow??0);
          if(stored>0){energy(b,u,stored,true);record(b,'mechanic',u,{name:'百炼骨 · 取回溢出能量',amount:stored});}
          u.energyOverflow=0;
        }
        void key;void a;void selected;
      },
      // 行迹「千锻魂」：结界期间受到攻击后使攻击者陷入【煞火缠身】并获得 1 点充能。
      attacked(b,u,to,from){
        if(to!==u||!fieldOpen(u)||!trace(u,2))return;
        if(from)applyEmber(b,u,from);
        addCharge(b,u,1);
      },
      // 行迹「万淬心」：结界期间我方伤害 +#1=50%（E4 再 +#1=50%）；
      // 队伍中有其他虚无角色时终结技伤害 +#2=75%，否则自身 +#3=75%。
      modifiers(b,u,actor,to,a,kind){
        const out={};
        if(fieldOpen(u)&&actor.side===u.side&&trace(u,3)){
          const t=trace(u,3),extra=rank(u,4)?rank(u,4):0;
          out.dmgBoost=(out.dmgBoost??0)+t[0]+extra;
          const otherNihility=allies(b,u).some(x=>x!==u&&(x.path==='虚无'||x.path==='Nihility'));
          if(a.type==='Ultra')out.dmgBoost=(out.dmgBoost??0)+(otherNihility?t[1]:t[2]);
        }
        if(to.side===u.side)return out;
        // E1：结界持续期间敌方全体全属性抗性降低 #1=20%。
        if(rank(u,1)&&fieldOpen(u))out.resPen=(out.resPen??0)+rank(u,1,0);
        // E2：我方角色施放终结技造成伤害时视为追加攻击，我方追加攻击伤害 +#1=75%。
        if(rank(u,2)&&actor.side===u.side&&(kind==='followup'||a.type==='Ultra'))
          out.dmgBoost=(out.dmgBoost??0)+rank(u,2,0);
        void kind;
        return out;
      },
      // 致命伤害：【无量忿怒】期间不会陷入无法战斗，解除结界并回复 #6=50% 生命上限的生命值。
      beforeLethal(b,u,from,to,amount){
        if(to!==u||!rage(u))return false;
        resource(b,u,'致命回复待结算',u.kit.params.Ultra[5]);
        closeField(b,u);
        void from;void amount;
        return true;
      },
      afterDamage(b,u,from,to,kind){
        if(to!==u)return;
        const pending=u.resources['致命回复待结算']??0;
        if(pending>0){resource(b,u,'致命回复待结算',0);heal(b,u,u,combatPanel(u).hp*pending);}
        // E6：结界期间受到伤害或消耗生命值时获得 1 点充能（任意目标回合结束后可再次触发）。
        if(rank(u,6)&&fieldOpen(u)&&u.resources['E6充能回合']!==b.turns){
          resource(b,u,'E6充能回合',b.turns);
          addCharge(b,u,1);
        }
        void from;void kind;
      },
      // 倒计时回合开始 → 解除结界、退出【无量忿怒】。
      summonTurn(b,u,s){
        if(s.kind!=='countdown')return;
        closeField(b,u);
      },
      death(b,u,from,to){
        if(to===u)closeField(b,u);
        void from;
      },
    };
  },
};

export {factories,actions};

// ── 共享层 hook 说明（本批不需要，但 1004 强化形态要对外可选时必须加）────────────────────────────
// 现状：`simulator/characters/registry.mjs` 的 `compileRegisteredKit` 对 extra 角色执行
//   `if(variant!=='base')throw new Error('此角色尚无可用的强化形态')`
// 并且 `simulator/characters/runtime.mjs` 的 `rosterRuntime` / `kits.mjs` 也只按 `variant` 分发。
// 因此 1004 的 4.6 强化形态（【失重】/ 效果命中转攻击力）虽然已在本模块内完整实现并通过测试，
// 但只能在测试里用 `u.kit.enhanced=true` 打开，无法从配装参数选择。
// 需要的最小改动（未实施，因为不属于本批文件）：
//   1. `dispatch.mjs` 的 `Runtime.dispatchCharacterKit` 参数解析：为 extra 角色透传 `variant`；
//   2. `compileRegisteredKit`：允许 `variant==='enhanced'` 且 `ROSTER_DATA[id].enhanced` 存在时，
//      把 `kit.enhanced` 设为 true（强化技能/行迹/星魂表由角色模块自己读取，无需共享表）；
//   3. `validateRegisteredKit`：把 `enhanced` 纳入合同比较。
// 本模块的 handlers 已经按 `u.kit.enhanced` 分支工作，加上以上 3 处即可直接启用。
