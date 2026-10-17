// DeepSeek batch-16：6 名「开拓者 / 不死途」角色（4.6 固定数据，提交 312b4597691e0a29cf9828a15b592757dba86949）。
//
// 数值索引逐条核对 `_data_cache/hsr_core.json` 的 desc `#n` 与 `params[等级].param_list`；
// 段数 / 时序 / 触发窗口取自 `_data_cache/strict_research/Avatar_<Name>_00_Ability.json`
// （`ROSTER_DATA[id].hits` 就是同一份脚本里 AttackData.HitSplitRatio 的编译结果）：
//   8003 开拓者（火 · 存护）  Avatar_PlayerBoy_10_Ability.json
//   8004 开拓者（火 · 存护）  Avatar_PlayerGirl_10_Ability.json
//   8005 开拓者（虚数 · 同谐）Avatar_PlayerBoy_20_Ability.json
//   8009 开拓者（雷 · 欢愉）  Avatar_PlayerBoy_40_Ability.json
//   8010 开拓者（雷 · 欢愉）  Avatar_PlayerGirl_40_Ability.json
//   1504 不死途（雷 · 巡猎）  Avatar_Ashveil_00_Ability.json
//
// 【男 / 女脚本是否逐字节相同】否。sha256 全部不同：
//   PlayerBoy_10  13a0b8b4d2df669c…（150 803 B） vs PlayerGirl_10 1e87d8052ad165a0…（150 452 B）
//   PlayerBoy_40  d5351ead59f14ed9…（123 743 B） vs PlayerGirl_40 ffc7f902ada5b720…（113 343 B）
//   PlayerBoy_20  5f3906aea7386d29…（100 621 B） vs PlayerGirl_20 65d01ffca5a61733…（ 98 908 B）
// 把 PlayerBoy/PlayerGirl、MAvatar_/MWAvatar_ 归一化后逐 Ability 比对「战斗签名」
// （AttackData 的元素 / HitSplitRatio / SPHitRatio / 动态倍率哈希、StanceValue、ExtraFormulaType、
//  护盾公式、ByRankActivated 哈希、BySkillPointActivated 键、循环次数）：
//   · PlayerBoy_20 vs PlayerGirl_20：完全一致 → 同一套实现（本文件 8005；8006 已由 batch08 登记）。
//   · PlayerBoy_40 vs PlayerGirl_40：完全一致 → 同一套实现（8009 / 8010 共用一份工厂）。
//   · PlayerBoy_10 vs PlayerGirl_10：战斗签名只在「表现层」不同——男版多出
//     `MAvatar_PlayerBoy_10_ChangeAttack` / `SetControlSkillMapping` / `ShowBattleSkillEnhanced`，
//     女版用 TargetAlias "ModifierOwnerEntity" 替代 "Caster"；伤害节点、倍率哈希、护盾公式、
//     行迹 / 星魂条件哈希全部一致 → 同一套实现（8003 / 8004 共用一份工厂）。
//
// 【文案记法】desc 里的 `#n[i]%` / `#n[f1]%` 都是「参数即比值，显示时 ×100」：
//   8003 天赋 #1=0.06 → 6%、8003 E1 #1=0.25 → 25%、1504 E6 #1=0.2 → 20%。
//
// ── 本批仍待验收的角色分支 ────────────────────────────────────────────────
// 1) 8009 / 8010 欢愉技（800920 / 801020）现已登记公开 4.6 参数倍率并接入共享 ElationDamage 公式；
//    两种形态共享执行器，但触发分支、段数和动态倍率仍需分别依 Ability 证据核验。
// 2) 共享欢愉伤害公式现由 engine.mjs 的 elationBase 结算：等级基础值、欢愉度与笑点系数，
//    不受攻击力、元素增伤或一般增伤影响；独立合同测试见 test_codex_elation_formula.mjs。
//    8009/8010 的角色攻击段与额外触发仍须按角色脚本分别核对。
// 3) 爻光、砂金与开拓者的固定笑点阿哈额外回合会触发全队欢愉技且不消费共享笑点；
//    自然阿哈行动条、速度/行动值与参演者真实ID排序尚未接入，严格模式仍阻断。
// 4) 1504 不死途：
//    · 【饲饵】的转移（MAvatar_Ashveil_00_Skill02_DebuffShift / DebuffRemove 模板 +
//      `OnListenCharacterLimbo`）已按脚本落地：持有者阵亡 / 场上无饲饵时，最低生命百分比敌人自动成为饲饵。
//    · 强化天赋追加攻击的「对目标造成致命攻击时继续对新的【饲饵】造成伤害」按脚本逐段重定向。
//    · 原始脚本用 `DynamicHashes` 表达倍率（未解析成 param 索引），本实现按 desc 的 `#n` 索引取值，
//      倍率本身与脚本的 DamagePercentage 哈希一一对应（Talent #4 与 Ultra #4 的**同一等级**数值完全相同；
//      但 E3 只抬终结技等级、E5 只抬天赋等级，所以高星魂下两者可以不同——强化追加攻击的
//      「本体 = Talent[3]、每 4 层婪酣的额外次数 = Ultra[3]」在测试里分别核对）。
//    · 追加攻击动作的 id 是 `Avatar_Ashveil_00_Insert`（不在 ROSTER_DATA），因此该动作的 name / energyGain
//      取 Talent 记录（150404，spBase=5）——已在测试里回读 hsr_core 校验 spBase。
import {atk,def,basic,skill,ultimate,talentAction} from '../actions.mjs';
import {ROSTER_DATA} from '../../roster-data.mjs';

export const IDS=[8003,8004,8005,8009,8010,1504];

// ───────────────────────────── 来源访问器 ─────────────────────────────
const st=(d,sid,index)=>d.skills?.[String(sid)]?.stance?.[index]??0;
const spBase=(d,sid)=>d.skills?.[String(sid)]?.spBase??0;
const sname=(d,sid)=>d.skills?.[String(sid)]?.name??String(sid);
// 强化 / 副技能与基础技能共用等级轨道：用已编译的基础参数反查等级行，再取目标技能表（与 batch10 同口径）。
const rowFor=(id,refId,targetId,refValue)=>{
  const table=ROSTER_DATA[id].skills?.[String(refId)]?.params??{};
  const key=Object.keys(table).find(k=>Math.abs((table[k].param_list?.[0]??NaN)-refValue)<1e-9);
  return ROSTER_DATA[id].skills?.[String(targetId)]?.params?.[key??'10']?.param_list??[];
};
const isElationPath=u=>u?.path==='欢愉'||u?.path==='Elation';
const elationParticipantId=u=>u?.participantId??({1503:104,1502:116,8009:120,8010:120,1501:144,1505:146,1513:156,1506:999}[u?.kit?.characterId]);
// 欢愉技等级：基础满级 10，E3 / E5 各 +1（desc「欢愉技等级+1，最多不超过15级」），上限 15。
const elationLevel=(eidolon=0)=>Math.min(15,10+(eidolon>=3?1:0)+(eidolon>=5?1:0));
const elationParams=(d,id,lv)=>d.skills?.[String(id)]?.params?.[String(lv)]?.param_list??null;
const TEN=Object.freeze([...Array(10)].map(()=>0.1));      // Avatar_Ashveil_00_Insert：LoopExecuteTaskList 10 段 × 0.1
const TWENTY=Object.freeze([...Array(20)].map(()=>0.05));  // Skill03_Phase02：15 段 + 5 段，各 HitSplitRatio 0.05

// ───────────────────────────── 动作表 ─────────────────────────────
// 段数（原始脚本 → hitShares）：
//   8003/8004 Skill01_Phase02 1 段（HitSplitRatio 1）；Skill11_Phase02 主目标 2 段（0.5/0.5）+ 相邻 1 段；
//             Skill03_Phase02 1 段。强化普攻倍率取自 800308 / 800408（与 800301 / 800401 同级行反查）。
//   8005     Skill01_Phase02 1 段；Skill02_Phase02 主目标 1 段 + Bounce_Count=4（E6 +2）次 0.5 削韧弹射。
//   8009/8010 Skill01_Phase02 2 段（0.5/0.5）；Skill02_Phase02 1 段；Skill03_Phase02 无伤害节点。
//   1504     Skill01_Phase02 1 段；Skill02_Phase02 2 段（0.6/0.4，另 1 个条件节点在 before/after 结算）；
//             Skill03_Phase02 15+5=20 段 × 0.05；Insert 10 段 × 0.1。
const preservationActions=(p,d,{eidolon=0}={})=>{
  const id=d.id,r1=d.ranks?.[1]??[];
  const enh=rowFor(id,String(id)+'01',String(id)+'08',p.Normal[0]);
  // E1：普攻额外造成 25% 防御力火伤、强化普攻额外造成 50% 防御力火伤（同一 AttackData 的 ExtraFormulaType）。
  const basicTerms=[...atk(p.Normal[0]),...(eidolon>=1&&r1[0]!=null?def(r1[0]):[])];
  const enhMain=[...atk(enh[0]??p.Normal[0]),...(eidolon>=1&&r1[1]!=null?def(r1[1]):[])];
  const a={
    basic:basic(p,d,{terms:basicTerms,toughness:st(d,String(id)+'01',0),hitShares:[1]}),
    // 强化普攻「穿彻坚冰的烈芒」：消耗 4 层【灼热意志】，主目标 2 段 + 相邻 1 段（削韧 60 / 30）。
    enhancedBasic:{name:sname(d,String(id)+'08'),type:'Normal',element:'Fire',target:'blast',hitShares:[.5,.5],
      terms:[...enhMain,{...atk(enh[1]??0)[0],target:'adjacent'}],
      energyGain:spBase(d,String(id)+'08'),spCost:0,spGain:1,toughness:st(d,String(id)+'08',0),adjacentToughness:st(d,String(id)+'08',2)},
    skill:skill(p,d,{target:'self',terms:[],toughness:0,hitShares:[1]}),
    ultimate:ultimate(p,d,{target:'all',terms:[...atk(p.Ultra[0]),...def(p.Ultra[1])],toughness:60,hitShares:[1]}),
  };
  return a;
};
const harmonyActions=(p,d,{eidolon=0}={})=>{
  const id=d.id;
  return {
    basic:basic(p,d,{terms:atk(p.Normal[0]),toughness:st(d,String(id)+'01',0),hitShares:[1]}),
    // 战技「中场馈赠的雨」：BPSkill[0] 单体 1 段 + 4 次弹射（E6 +ranks[6][0] 次）。
    // 弹射每次削韧 = 0.5 × 技能削韧（原始脚本 StanceValue = 0.5×1659254037，与艾丝妲 100902 的
    // 「SPMultipleRatio 0.5 → bounceToughness 15」结构完全相同）。
    skill:skill(p,d,{terms:atk(p.BPSkill[0]),toughness:st(d,String(id)+'02',0),hitShares:[1],
      energyGain:spBase(d,String(id)+'02'),
      bounceCount:4+(eidolon>=6?(d.ranks?.[6]?.[0]??0):0),
      bounceTerms:atk(p.BPSkill[0]),bounceToughness:st(d,String(id)+'02',0)*0.5}),
    ultimate:ultimate(p,d,{target:'allies',terms:[],toughness:0,hitShares:[1]}),
  };
};
const elationActions=(p,d,{eidolon=0}={})=>{
  const id=d.id;
  // 欢愉技 800920 / 801020：desc #1=8 次随机单体弹射 ×#2=20%，随后 #3=60% 由敌方全体均分
  //（均在 ROSTER_DATA 的 params 内，逐位对照 hsr_core / AvatarSkillConfig）。
  const E=elationParams(d,String(id)+'20',elationLevel(eidolon))??[8,.2,.6];
  return {
    basic:basic(p,d,{terms:atk(p.Normal[0]),toughness:st(d,String(id)+'01',0),hitShares:[.5,.5]}),
    skill:skill(p,d,{target:'all',terms:atk(p.BPSkill[0]),toughness:st(d,String(id)+'02',1),hitShares:[1]}),
    ultimate:ultimate(p,d,{target:'ally',terms:[],toughness:0,hitShares:[1]}),
    // 欢愉技：8 次 20% 弹射 + 60% 全体均分（均分在模块 prepare 中按当前敌人数折算）。
    elation:{name:sname(d,String(id)+'20'),type:'ElationDamage',element:'Thunder',target:'all',
      terms:atk(E[2]),hitShares:[1],energyGain:0,spCost:0,spGain:0,
      bounceCount:E[0],bounceTerms:atk(E[1]),bounceToughness:0,
      toughness:st(d,String(id)+'20',1)},
  };
};
const ashveilActions=(p,d,{eidolon=0}={})=>{
  void eidolon;
  return {
    basic:basic(p,d,{terms:atk(p.Normal[0]),toughness:st(d,150401,0),hitShares:[1]}),
    // 战技 150402：BPSkill[0] 两段（0.6/0.4）；目标已是【饲饵】时的 BPSkill[2] 额外伤害在 after 结算。
    skill:skill(p,d,{terms:atk(p.BPSkill[0]),toughness:st(d,150402,0),hitShares:[.6,.4]}),
    // 终结 150403：Ultra[0] 20 段（15+5，各 0.05），削韧 90；强化天赋追加攻击在 after 结算。
    ultimate:ultimate(p,d,{terms:atk(p.Ultra[0]),toughness:st(d,150403,0),hitShares:TWENTY}),
    // 天赋追加攻击 Avatar_Ashveil_00_Insert：Talent[3] 10 段 × 0.1，削韧 15。
    followup:talentAction(p,d,{terms:atk(p.Talent[3]),toughness:st(d,150404,0),hitShares:TEN,
      energyGain:spBase(d,150404)}),
  };
};

const actions={
  8003:(p,d,o)=>preservationActions(p,d,o),
  8004:(p,d,o)=>preservationActions(p,d,o),
  8005:(p,d,o)=>harmonyActions(p,d,o),
  8009:(p,d,o)=>elationActions(p,d,o),
  8010:(p,d,o)=>elationActions(p,d,o),
  1504:(p,d,o)=>ashveilActions(p,d,o),
};

// ═══════════════════════ 8003 / 8004 开拓者（火 · 存护）═══════════════════════
// 天赋 800304「筑城者遗宝」：每受到 1 次攻击 +1 层【灼热意志】（上限 #3=8）；层数 ≥4 时普攻强化为
//   强化普攻（Skill11_Phase02）；施放普攻 / 战技 / 终结技后为我方全体提供
//   def×#1=6%+#4=80 的护盾，持续 #2=2 回合（E2 再加 def×ranks[2][0]+ranks[2][1]）。
// 普攻 800301：#1=140% 攻击力 +1 层【灼热意志】；E1 追加 def×25% 火伤。
// 强化普攻 800308：消耗 4 层，主目标 #1、相邻 #2；E1 追加 def×50% 火伤；行迹 point07 回复 5% 生命上限。
// 战技 800302：自身受伤降低 #1=50%、#3=1 回合，+1 层；#2=100% 基础概率使敌方全体陷入嘲讽 #3=1 回合；
//   行迹 point06 使我方全体受伤降低 15%、1 回合。
// 终结 800303：#1=100% 攻击力 + #2=150% 防御力 火伤（全体）；下一次普攻自动强化且不消耗【灼热意志】。
// 行迹 point08：回合开始时若持有护盾 → 攻击力 +15%、回 5 能，持续到行动结束。
// E4：战斗开始时立即 4 层；E6：强化普攻 / 终结技后防御力 +10%，最多 3 层。
function preservation(api){
  const {live,allies,enemies,rank,trace,buff,stacks,resource,energy,heal,damageTo,combatPanel,record}=api;
  const CHARGE='灼热意志',FREE='强化普攻不消耗',TAUNT='preservationTaunt';
  const sid=u=>String(u.characterId);
  const chargeOf=u=>u.resources[CHARGE]??0;
  const maxCharge=u=>u.kit.params.Talent[2];
  const shieldId=u=>u.id+':preservation-shield';
  const taunted=(b,u)=>enemies(b,u).some(e=>e.buffs.some(x=>x.tag===TAUNT&&x.source===u.id));
  const chanceOf=(u,to,base)=>base*(1+(combatPanel(u).effectHit??0))*(1-(combatPanel(to).effectRes??0));
  function roll(b,u,to,base,name){
    const c=chanceOf(u,to,base);
    if(c<1&&b.random()>=c){record(b,'resist',to,{name});return false;}
    return true;
  }
  function gainCharge(b,u,n){
    if(n<=0)return;
    resource(b,u,CHARGE,Math.min(maxCharge(u),chargeOf(u)+n));
  }
  // 护盾 = def×Talent[0] + Talent[3]（+E2 def×ranks[2][0]+ranks[2][1]），同类来源「Replace」而非取最大值。
  function shieldValue(u){
    const P=u.kit.params,p=combatPanel(u);
    let v=p.def*P.Talent[0]+P.Talent[3];
    if(rank(u,2))v+=p.def*rank(u,2,0)+rank(u,2,1);
    return v*(1+(p.shieldBoost??0));
  }
  function grantShield(b,u){
    const P=u.kit.params,id=shieldId(u),v=shieldValue(u);
    for(const to of allies(b,u)){
      const old=to.shields.find(s=>s.id===id);
      const e={type:'shield',id,name:'筑城者遗宝',value:v,source:u.id,remaining:P.Talent[1],
        tickOwner:to.id,tickAt:'end',appliedTurn:to.turns};
      if(old)Object.assign(old,e);else to.shields.push(e);
      record(b,'shield',u,{target:to.id,name:e.name,value:v,total:v,duration:e.remaining});
    }
  }
  return {
    start(b,u){
      resource(b,u,CHARGE,0);
      resource(b,u,FREE,0);
      if(rank(u,4))gainCharge(b,u,rank(u,4,0));
    },
    // 天赋：每受到 1 次攻击 +1 层（上限 Talent[2]=8）。
    attacked(b,u,to,from){
      void from;
      if(to!==u)return;
      gainCharge(b,u,1);
    },
    prepare(b,u,key,kind,a){
      if(key!=='basic'||kind==='copy'||kind==='technique')return a;
      const free=u.resources[FREE]??0;
      if(!free&&chargeOf(u)<4)return a;
      return {...u.actions.enhancedBasic,preservationEnhanced:true,...(a.targetId?{targetId:a.targetId}:{})};
    },
    before(b,u,actor,key,kind,a){
      if(actor!==u||kind==='copy')return;
      if(key==='basic'&&a.preservationEnhanced){
        // 强化普攻消耗 4 层；终结技留下的【强化普攻不消耗】优先消耗（不再扣层）。
        if(u.resources[FREE])resource(b,u,FREE,0);
        else resource(b,u,CHARGE,Math.max(0,chargeOf(u)-4));
        return;
      }
      if(key==='skill'){
        const P=u.kit.params;
        buff(b,u,u,'炽燃不灭的琥珀 · 受伤降低','dmgReduction',P.BPSkill[0],P.BPSkill[2],{id:u.id+':preservation-skill-dr'});
        gainCharge(b,u,1);
        for(const to of enemies(b,u))if(roll(b,u,to,P.BPSkill[1],'嘲讽被抵抗'))
          buff(b,u,to,'嘲讽','marker',0,P.BPSkill[2],{id:u.id+':preservation-taunt:'+to.id,tag:TAUNT,debuff:true,control:'taunt'});
        // 行迹 point06「强援弱」：施放战技后我方全体受伤降低 trace[1]=15%、trace[2]=1 回合。
        if(trace(u,1))for(const to of allies(b,u))
          buff(b,u,to,'强援弱','dmgReduction',trace(u,1)[1],trace(u,1)[2],{id:u.id+':preservation-team-dr'});
      }
    },
    after(b,u,actor,key,kind,a,selected,hitTargets){
      void selected;void hitTargets;
      if(actor!==u||kind==='copy')return;
      if(!['basic','skill','ultimate'].includes(key))return;
      // 普攻（非强化）：叠加 1 层【灼热意志】（原始脚本 Skill01_Phase02 MDF_Energy_Count +1）。
      if(key==='basic'&&!a.preservationEnhanced)gainCharge(b,u,1);
      // E6：施放强化普攻或终结技后防御力 +ranks[6][0]，最多 ranks[6][1] 层（先于护盾结算）。
      if(rank(u,6)&&(key==='ultimate'||a.preservationEnhanced))
        stacks(b,u,u,'永屹城垣的壁垒','defPct',rank(u,6,0),rank(u,6,1),null,{id:u.id+':preservation-e6'});
      grantShield(b,u);
      // 行迹 point07「生先死」：强化普攻后回复自身生命上限 trace[0]=5% 的生命。
      if(trace(u,2)&&a.preservationEnhanced)heal(b,u,u,combatPanel(u).hp*trace(u,2)[0]);
      // 终结技：下一次普攻自动强化且不消耗【灼热意志】。
      if(key==='ultimate')resource(b,u,FREE,1);
    },
    // 行迹 point08「行胜思」：回合开始时若持有护盾 → 攻击力 +trace[2][1]=15%、回 trace[2][0]=5 能，
    // 持续到本次行动结束（countApplyTurn 让本回合结束即过期）。
    turnStart(b,u,actor){
      if(actor!==u||!trace(u,3))return;
      if(!u.shields.some(s=>s.value>1e-8))return;
      energy(b,u,trace(u,3)[0]);
      buff(b,u,u,'行胜思 · 攻击力提高','atkPct',trace(u,3)[1],1,{id:u.id+':preservation-point08',countApplyTurn:true});
    },
    // 嘲讽：被嘲讽的敌方目标优先攻击开拓者（引擎按 aggro × aggroRatio 选目标）。
    panel(b,u,to,out){
      if(to!==u)return;
      if(taunted(b,u))out.aggroRatio=(out.aggroRatio??1)*10;
    },
    display(b,u,to){
      if(to!==u)return [];
      return [{type:'resource',id:u.id+':preservation-charge',source:u.id,name:'灼热意志',key:'marker',
        value:chargeOf(u),derived:true}];
    },
  };
}

// ═══════════════════════ 8005 开拓者（虚数 · 同谐）═══════════════════════════
// 终结 800503「喧嚣的舞灯巡游」：我方全体获得【伴舞】Ultra[0]=3 回合（开拓者每回合开始 -1），
//   击破特攻 +Ultra[2]=30%；持有者攻击处于弱点击破状态的目标后，把本次削韧值 ×Ultra[1]=100%
//   转化为 1 次超击破伤害（原始脚本 SkillP01_ListenBreakDamage OnAfterAttack）。
// 天赋 800504：敌方目标弱点被击破时开拓者恢复 Talent[0]=10 点能量。
// 战技 800502：BPSkill[0]=50% 单体 + 4 次弹射（E6 +2）；行迹 point07 使第一次伤害削韧 +100%。
// 行迹：point06 卫我起舞（按敌方 5/4/3/2/1 名使伴舞超击破 +20/30/40/50/60%）、
//   point08 剧院之帽（我方造成弱点击破后使敌方行动延后 30%）。
// 秘技 800507：下一次战斗开始时我方全体击破特攻 +Maze[0]=30%、Maze[1]=2 回合。
// E1 首次战技后回 1 战技点；E2 开场回能效率 +25% 持续 3 回合；E4 队友击破特攻 + 开拓者 15%。
//
// 【与 batch08 已登记的 8006 的一处削韧口径差异（已核对原始脚本）】8005/8006 的 Skill02_Phase02 弹射
// 节点与艾丝妲 100902 的弹射节点结构完全相同：`StanceValue = 0.5 × 1659254037`（技能削韧哈希），
// 而仓库对艾丝妲登记的 `bounceToughness` 就是 `0.5 × stance[0] = 15`。因此本文件对 8005 取 15；
// batch08 的 8006 取的是 `stance[2] = 30`——两者差一倍，属既有批次的独立判断，本批不改动它。
function harmony(api){
  const {live,allies,enemies,rank,trace,buff,resource,energy,sp,delay,combatPanel,record}=api;
  const DANCE_TAG='hmcDance';
  const hasDance=to=>to.buffs.some(e=>e.tag===DANCE_TAG);
  // 行迹 point06：敌方 5/4/3/2/1 名 → trace[0..4]。
  const danceBonus=(b,u)=>{const t=trace(u,1);if(!t)return 0;return t[5-Math.min(5,enemies(b,u).length)]??0;};
  return {
    entry(b,u){
      const P=u.kit.params;
      for(const to of allies(b,u))
        buff(b,u,to,'即刻！独奏团','breakEffect',P.Maze[0],P.Maze[1],{id:u.id+':hmc-maze',tickOwner:u.id,tickAt:'start'});
    },
    start(b,u){
      // E2：战斗开始时能量恢复效率 +ranks[2][0]，持续 ranks[2][1] 回合。
      if(rank(u,2))buff(b,u,u,'开拓者 E2 · 回能效率','energyRegen',rank(u,2,0),rank(u,2,1),
        {id:u.id+':hmc-e2',tickOwner:u.id,tickAt:'start',countApplyTurn:true});
      // E4：除自身外队友击破特攻提高，数值 = 开拓者 15% 的击破特攻（动态换算）。
      if(rank(u,4))for(const to of allies(b,u).filter(t=>t!==u))
        buff(b,u,to,'开拓者 E4 · 击破特攻','breakEffect',0,null,
          {id:u.id+':hmc-e4',removeOnSourceDeath:true,convert:{source:u.id,stat:'breakEffect',ratio:rank(u,4)}});
    },
    // 行迹 point07「随波逐流」：战技第一次伤害的削韧值额外提高 trace[0]=100%。
    prepare(b,u,key,kind,a){
      if(key==='skill'&&kind!=='copy'&&trace(u,2))
        return {...a,toughness:(a.toughness??0)*(1+trace(u,2)[0])};
      return a;
    },
    after(b,u,actor,key,kind,a,selected,hitTargets){
      void a;void selected;void hitTargets;void kind;
      if(actor!==u)return;
      const P=u.kit.params;
      // E1：施放首次战技后立即回复 ranks[1][0]=1 点战技点。
      if(key==='skill'&&rank(u,1)&&!u.resources['E1已触发']){
        resource(b,u,'E1已触发',1);
        sp(b,u,rank(u,1,0),'开拓者 E1');
      }
      // 终结技：我方全体获得【伴舞】（击破特攻 +Ultra[2]，Ultra[0] 回合，开拓者回合开始递减）。
      if(key==='ultimate'){
        for(const to of allies(b,u))
          buff(b,u,to,'伴舞','breakEffect',P.Ultra[2],P.Ultra[0],
            {id:u.id+':hmc-dance:'+to.id,tag:DANCE_TAG,tickOwner:u.id,tickAt:'start'});
        record(b,'mechanic',u,{name:'喧嚣的舞灯巡游 · 伴舞'});
      }
    },
    // 天赋 / 行迹 point08：以引擎的 type='break' 日志为唯一触发点（真正的弱点击破伤害）。
    afterDamage(b,u,from,to,kind){
      if(kind!=='break'||to.side===u.side)return;
      energy(b,u,u.kit.params.Talent[0]);
      if(trace(u,3)&&from&&from.side===u.side)delay(b,to.id,trace(u,3)[0]);
    },
    // 【伴舞】超击破：我方持有者攻击处于弱点击破状态的目标后，按本次削韧 ×Ultra[1] 触发 1 次超击破。
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
      b.breaks.superBreak(b,actor,to,base*share,u.kit.params.Ultra[1],actor.element);
    },
    modifiers(b,u,actor,to,a,kind){
      void to;void a;
      if(kind!=='superbreak'||!actor||actor.side!==u.side)return {};
      if(!hasDance(actor))return {};
      return {dmgBoost:danceBonus(b,u)};
    },
  };
}

// ═══════════════════════ 8009 / 8010 开拓者（雷 · 欢愉）═════════════════════
// 普攻 800901：Normal[0]=140% 攻击力，2 段。
// 战技 800902：BPSkill[0]=60% 攻击力（全体），获得 BPSkill[1]=20 点【好活当赏】；
//   施放后（原始脚本 OnStart[2] 之后）若已持有【好活当赏】，对敌方全体额外造成
//   天赋 #3=30% 攻击力的雷属性欢愉伤害（此伤害使用我方最高的【好活当赏】数值计算）。
// 终结 800903：获得 Ultra[5]=5 个笑点；指定我方单体暴击伤害 +Ultra[0]=50%、Ultra[1]=3 回合，
//   并解除其控制类负面；目标拥有欢愉技 → 额外获得 Ultra[3]=10 点【好活当赏】并立即施放 1 次
//   固定计入 Ultra[4]=20 笑点的欢愉技；否则行动提前 Ultra[2]=50%。
//   行迹 point07：施放终结技后为我方恢复 trace[2][1]=1 个战技点。
// 天赋 800904：施放攻击后固定恢复 Talent[0]=10 点能量并获得 Talent[1]=3 个笑点。
// 秘技 800907：小概率【开怀大笑】欢愉度 +Maze[0]=30%，大概率【忍俊不禁】欢愉度 +Maze[2]=20%，
//   我方全体持续 Maze[4]=3 回合。
// 行迹 point06 快哉快哉：攻击力高于 trace[0]=1000 后每 trace[1]=200 点 +trace[2]=10% 欢愉度，上限 trace[3]=60%。
// 行迹 point08 阿哈咬它：我方目标施放欢愉技后，开拓者下一次战技额外获得 trace[3][0]=2 点【好活当赏】。
// E1 [2,3]：每施放 1 次战技使下一次终结技的好活当赏 +2，最多 3 层；E2 [0.12,2]：终结技额外使目标欢愉度 +12%、2 回合。
// E4 [0.1,2]：施放欢愉技时敌方目标受伤 +10%、2 回合；E6 [1,3]：施放欢愉技时自身暴击伤害 +100%、3 回合。
const ELATION_RARE='开怀大笑',ELATION_COMMON='忍俊不禁',PUNCH='好活当赏';
function elation(api){
  const {live,allies,enemies,rank,trace,buff,resource,energy,sp,advance,cleanseOne,damageTo,combatPanel,record,get}=api;
  const punchOf=to=>to?.resources?.[PUNCH]??0;
  const hasPunch=u=>punchOf(u)>0;
  function gainLaughter(b,u,n,reason){
    if(!n)return;
    b.laughter[u.side]=(b.laughter[u.side]??0)+n;
    record(b,'resource',u,{name:'累计获得笑点',value:b.laughter[u.side],reason:reason??'笑点'});
  }
  // 好活当赏：每次获得的层数独立计时，基础持续 2 回合。
  function grantPunch(b,u,to,n,duration=2){
    if(!to||!live(to)||!(n>0))return 0;
    const addBatch=(recipient,amount,source=u)=>{
      if(!(amount>0))return;
      const seq=(recipient.resources['好活当赏批次序号']??0)+1;recipient.resources['好活当赏批次序号']=seq;
      recipient.resources[PUNCH]=punchOf(recipient)+amount;
      buff(b,source,recipient,PUNCH,'marker',0,Math.max(1,duration),
        {id:'punchline:'+recipient.id+':'+seq,tag:'punchline',stacks:amount});
      record(b,'resource',source,{target:recipient.id,name:PUNCH,value:recipient.resources[PUNCH]});
    };
    const evanescia=b.units.find(t=>t.side===to.side&&t.kit?.characterId===1505&&live(t));
    const point06=evanescia?.kit?.trace?.['1']?.[4]??0;
    const fromIndex=elationParticipantId(to),evanesciaIndex=elationParticipantId(evanescia);
    if(evanescia&&to!==evanescia&&point06>0&&Number.isFinite(fromIndex)&&Number.isFinite(evanesciaIndex)&&fromIndex<evanesciaIndex){
      const e2=evanescia.kit.eidolon>=2?(evanescia.kit.ranks?.[2]?.[1]??0):0;
      const converted=Math.min(n,n*point06*(1+e2));
      addBatch(to,n-converted);
      addBatch(evanescia,converted,evanescia);
      record(b,'mechanic',evanescia,{name:'瞰众乐 · 好活当赏发放时转化',from:to.id,amount:n,converted,participantId:fromIndex});
      return punchOf(to);
    }
    addBatch(to,n);
    return to.resources[PUNCH];
  }
  // 欢愉追加伤害：倍率写入 ElationDamage，由共享公式结算。
  function hitElation(b,u,to,o){
    if(!to||!live(to))return;
    // 800902 的 OnBeforeHitAll 读取全队最高 ElationEchoPoint，作为这段欢愉伤害的笑点基数。
    const maxEcho=b.units.filter(t=>t.side===u.side).reduce((n,t)=>Math.max(n,punchOf(t)),0);
    damageTo(b,u,to,{name:o.name,type:'ElationDamage',element:u.element,terms:atk(o.mult),punchlineFloor:maxEcho,toughness:0},1,'primary','elation');
  }
  // 固定笑点阿哈额外回合由共享助手排入全体欢愉角色；这里不再伪造笑点或好活当赏。
  function ahaMoment(b,u,counted,label){
    const actors=allies(b,u).filter(to=>live(to)&&isElationPath(to)&&to.actions?.elation)
      .sort((a,c)=>(a.participantId??a.order)-(c.participantId??c.order));
    const id=(b.ahaInstantSequence??0)+1;b.ahaInstantSequence=id;
    b.ahaInstant={id,fixedPunchline:counted,natural:false,ending:false,participants:actors.map(x=>x.id),completed:[],deferred:[]};
    b.ahaCount=(b.ahaCount??0)+1;b.ahaCounted=counted;
    for(const to of actors){
      to.buffs=to.buffs.filter(e=>!e.control);
      to.dots=to.dots.filter(e=>!e.control);
    }
    b.queue.unshift(...actors.map(to=>({actor:to.id,key:'elation',kind:'aha',ahaInstantId:id})));
    record(b,'mechanic',u,{name:'阿哈额外回合',counted,label:label??'',participants:actors.map(x=>x.id),consumesSharedPunchline:false});
  }
  return {
    entry(b,u){
      const P=u.kit.params;
      const rare=b.random()<P.Maze[1];
      const value=rare?P.Maze[0]:P.Maze[2];
      for(const to of allies(b,u))
        buff(b,u,to,rare?ELATION_RARE:ELATION_COMMON,'elation',value,P.Maze[4],
          {id:u.id+':elation-maze',tickOwner:u.id,tickAt:'start'});
      record(b,'mechanic',u,{name:'燃起来了！',variant:rare?ELATION_RARE:ELATION_COMMON,elation:value});
    },
    start(b,u){
      resource(b,u,'E1层数',0);
      resource(b,u,'欢愉技施放次数',0);
      resource(b,u,'下次战技额外好活当赏',0);
    },
    // 欢愉技收尾「由敌方全体均分」：把 #3 的总倍率按当前存活敌人数折算到每个目标。
    prepare(b,u,key,kind,a){
      if(key!=='elation'||kind==='copy')return a;
      const n=enemies(b,u).filter(live).length||1;
      return {...a,terms:(a.terms??[]).map(t=>({...t,multiplier:t.multiplier/n}))};
    },
    before(b,u,actor,key,kind){
      if(actor!==u||kind==='copy')return;
      if(key!=='elation')return;
      // E4：施放欢愉技时使敌方目标受到的伤害提高 ranks[4][0]=10%、ranks[4][1]=2 回合。
      if(rank(u,4))for(const to of enemies(b,u))
        buff(b,u,to,'拯救世界，无需理由','vuln',rank(u,4,0),rank(u,4,1),{id:u.id+':elation-e4:'+to.id,debuff:true});
      // E6：施放欢愉技时自身暴击伤害 +ranks[6][0]=100%、ranks[6][1]=3 回合。
      if(rank(u,6))buff(b,u,u,'银河传奇，登场！','critDmg',rank(u,6,0),rank(u,6,1),{id:u.id+':elation-e6'});
      resource(b,u,'欢愉技施放次数',(u.resources['欢愉技施放次数']??0)+1);
      record(b,'mechanic',u,{name:'欢愉技（倍率取自 ROSTER_DATA）'});
    },
    after(b,u,actor,key,kind,a,selected,hitTargets){
      void a;void hitTargets;
      const P=u.kit.params;
      // 行迹 point08「阿哈咬它」：我方目标施放欢愉技后，开拓者下一次战技额外获得 trace[3][0] 点好活当赏。
      if(actor?.side===u.side&&key==='elation'&&kind!=='copy')resource(b,u,'下次战技额外好活当赏',1);
      if(actor!==u||kind==='copy')return;
      if(key==='basic'||key==='skill'||key==='elation'){
        // 天赋：施放攻击后固定恢复 Talent[0]=10 点能量并获得 Talent[1]=3 个笑点。
        energy(b,u,P.Talent[0],true);
        gainLaughter(b,u,P.Talent[1],'英雄一笑，生死难料');
      }
      if(key==='skill'){
        // 战技的额外欢愉伤害判定在「本次获得好活当赏」之前（原始脚本 OnStart[4] 早于 OnStart[6]）。
        if(hasPunch(u))for(const to of enemies(b,u))hitElation(b,u,to,{name:'英雄一笑，生死难料 · 欢愉伤害',mult:P.Talent[2]});
        let add=P.BPSkill[1];
        if(trace(u,3)&&u.resources['下次战技额外好活当赏']){add+=trace(u,3)[0];resource(b,u,'下次战技额外好活当赏',0);}
        grantPunch(b,u,u,add);
        // E1：施放战技后，下一次终结技使我方目标获得的好活当赏 +ranks[1][0]，最多 ranks[1][1] 层。
        if(rank(u,1))resource(b,u,'E1层数',Math.min(rank(u,1,1),(u.resources['E1层数']??0)+1));
      }
      if(key==='ultimate'){
        const to=selected[0]??get(b,u.policy?.allyTargetId);
        if(to&&live(to)){
          cleanseOne(b,u,to);
          buff(b,u,to,'放心飞，开拓永相随！','critDmg',P.Ultra[0],P.Ultra[1],{id:u.id+':elation-ult:'+to.id});
          if(rank(u,2))buff(b,u,to,'名场面酝酿中……','elation',rank(u,2,0),rank(u,2,1),{id:u.id+':elation-e2:'+to.id});
          if(isElationPath(to)&&to.actions?.elation){
            const bonus=rank(u,1)?(u.resources['E1层数']??0)*rank(u,1,0):0;
            grantPunch(b,u,to,P.Ultra[3]+bonus);
            // 「立即施放 1 次固定计入 Ultra[4]=20 笑点的阿哈额外回合」：全队欢愉角色各施放一次欢愉技。
            ahaMoment(b,u,P.Ultra[4],'放心飞，开拓永相随！');
          } else {
            advance(b,to.id,P.Ultra[2]);
          }
        }
        // 终结技自身获得 Ultra[5]=5 个笑点。
        gainLaughter(b,u,P.Ultra[5],'放心飞，开拓永相随！');
        // 行迹 point07「跟你爆了」：施放终结技后为我方恢复 trace[2][1] 个战技点。
        if(trace(u,2))sp(b,u,trace(u,2)[1],'开拓者 · 跟你爆了');
        resource(b,u,'E1层数',0);
      }
    },
    // 行迹 point07「跟你爆了」：自身暴击率 +trace[2][0]=15%；point06 快哉快哉：攻击力转欢愉度。
    panel(b,u,to,out){
      if(to!==u)return;
      if(trace(u,2))out.critRate=(out.critRate??0)+trace(u,2)[0];
      const t=trace(u,1);
      if(t)out.elation=(out.elation??0)+Math.min(t[3],Math.max(0,(out.atk??0)-t[0])/t[1]*t[2]);
    },
    display(b,u,to){
      if(to!==u)return [];
      return [{type:'resource',id:u.id+':elation-punch',source:u.id,name:PUNCH,key:'marker',
        value:punchOf(u),derived:true},
        {type:'resource',id:u.id+':elation-laugh',source:u.id,name:'笑点',key:'marker',
        value:b.laughter?.[u.side]??0,derived:true}];
    },
  };
}

// ═══════════════════════ 1504 不死途（雷 · 巡猎）═══════════════════════════
// 天赋 150404：初始 Talent[0]=2 点充能（上限 Talent[1]=3）。【饲饵】受到我方其他目标攻击后，
//   不死途固定恢复 Talent[6]=8 点能量，随后消耗 Talent[2]=1 点充能对【饲饵】发动追加攻击
//   （Talent[3]=200% 攻击力雷伤，10 段），随后获得 Talent[4]=2 层【婪酣】，上限 Talent[5]=12 层。
// 战技 150402：指定敌方单体成为【饲饵】，造成 BPSkill[0]=200% 攻击力雷伤（0.6/0.4 两段）；
//   若该目标已是【饲饵】，额外造成 BPSkill[2]=100% 攻击力雷伤并恢复 BPSkill[4]=1 点战技点。
//   场上存在【饲饵】时，敌方全体防御力降低 BPSkill[3]=40%。
// 终结 150403：使目标成为【饲饵】，造成 Ultra[0]=400% 攻击力雷伤（20 段），随后立即发动 1 次
//   获得强化的天赋追加攻击（不消耗充能）；拥有【婪酣】时每消耗 Ultra[2]=4 层额外造成 1 次
//   Ultra[3]=200% 攻击力雷伤，追加过程中目标阵亡则继续对新的【饲饵】造成伤害，直至【婪酣】<4；
//   随后获得 Ultra[1]=3 点充能。
// 秘技 150407：进入战斗时对敌方全体造成 Maze[1]=100% 攻击力雷伤，并获得 Maze[2]=1 点充能。
// 行迹 point06 罪途：施放战技 / 终结技获得 trace[0]=1 / trace[1]=2 层【婪酣】；
//   追加重击过程中每有 trace[2]=1 个敌人受到致命攻击，获得 trace[3]=1 层【婪酣】。
// 行迹 point07 影肢：追加攻击伤害 +trace[0]=80%，且每有 trace[1]=1 层【婪酣】额外 +trace[2]=10%。
// 行迹 point08 头狼：我方目标暴击伤害 +trace[0]=40%，追加攻击暴击伤害额外 +trace[1]=80%。
// E1 [0.24,0.5,0.36]：敌方全体受伤提高 24%，生命百分比 ≤50% 时提高至 36%。
// E2 [18,0.35]：【婪酣】上限提高至 18；发动强化天赋追加攻击后返还所移除层数的 35%。
// E4 [0.4,3]：施放终结技时攻击力 +40%、3 回合。
// E6 [0.2,0.04,30]：场上存在【饲饵】时敌方全体全属性抗性降低 20%；
//   每获得过 1 层【婪酣】造成的伤害 +4%，最多叠加 30 层。
function ashveil(api){
  const {live,allies,enemies,rank,trace,buff,resource,energy,sp,damageTo,combatPanel,record,allResDown,get}=api;
  const BAIT='ashveilBait',BAIT_ID=u=>u.id+':ashveil-bait',DEF_ID=u=>u.id+':ashveil-defdown';
  const RES_NAME='饲饵 · 全属性抗性降低';
  const chargeOf=u=>u.resources['充能']??0;
  const lazeOf=u=>u.resources['婪酣']??0;
  const lazeCap=u=>rank(u,2)?rank(u,2,0):u.kit.params.Talent[5];
  const hasBait=(u,to)=>!!to&&to.buffs.some(e=>e.tag===BAIT&&e.source===u.id);
  const baitHolder=(b,u)=>enemies(b,u).find(t=>hasBait(u,t));
  function gainCharge(b,u,n){if(n>0)resource(b,u,'充能',Math.min(u.kit.params.Talent[1],chargeOf(u)+n));}
  function gainLaze(b,u,n){
    if(n<=0)return;
    resource(b,u,'婪酣',Math.min(lazeCap(u),lazeOf(u)+n));
    // 「每获得过 1 层【婪酣】」的累计计数（E6 的伤害加成按 ranks[6][2]=30 层封顶）。
    const acc=(u.resources['婪酣累计获得']??0)+n;
    resource(b,u,'婪酣累计获得',rank(u,6)?Math.min(rank(u,6,2),acc):acc);
  }
  // 【饲饵】的全局效果：场上存在饲饵时敌方全体防御力降低 BPSkill[3]（E6 再加全属性抗性降低）。
  function syncBait(b,u){
    const active=!!baitHolder(b,u);
    for(const to of enemies(b,u)){
      if(active){
        const cur=to.buffs.find(e=>e.id===DEF_ID(u));
        if(!cur||Math.abs(cur.value-u.kit.params.BPSkill[3])>1e-9)
          buff(b,u,to,'饲饵 · 防御力降低','defShred',u.kit.params.BPSkill[3],null,{id:DEF_ID(u),debuff:true});
        if(rank(u,6))allResDown(b,u,to,rank(u,6,0),null,RES_NAME);
      } else {
        to.buffs=to.buffs.filter(e=>e.id!==DEF_ID(u)&&!String(e.name??'').startsWith(RES_NAME));
      }
    }
  }
  // 【饲饵】只对最新目标生效（DebuffRemove 模板：先移除全部，再挂到目标）。
  function applyBait(b,u,to){
    for(const t of b.units)t.buffs=t.buffs.filter(e=>e.tag!==BAIT||e.source!==u.id);
    if(to&&live(to)){
      buff(b,u,to,'饲饵','marker',0,null,{id:BAIT_ID(u),tag:BAIT,debuff:true});
      record(b,'mechanic',u,{name:'饲饵',target:to.id});
    }
    syncBait(b,u);
  }
  // 场上不存在【饲饵】时，最低生命百分比敌人立即成为【饲饵】（DebuffShift / DebuffTransfer 模板）。
  function pickNewBait(b,u){
    const pool=enemies(b,u);
    if(!pool.length){syncBait(b,u);return null;}
    const to=pool.reduce((a,c)=>c.hp/combatPanel(c).hp<a.hp/combatPanel(a).hp?c:a);
    applyBait(b,u,to);
    return to;
  }
  // 追加攻击本体（Avatar_Ashveil_00_Insert）：10 段 × 0.1，削韧 15。
  function insertHit(b,u,to,mult){
    const prev=b.hsr1504Inserting;
    b.hsr1504Inserting=(prev??0)+1;
    try{
      for(let i=0;i<10&&live(to);i++)
        damageTo(b,u,to,{name:'宿怨，切齿奉还 · 追加攻击',type:'Talent',element:'Thunder',
          terms:atk(mult),toughness:st(ROSTER_DATA[1504],150404,0)},0.1,'primary','followup');
    } finally { if(prev==null)delete b.hsr1504Inserting; else b.hsr1504Inserting=prev; }
  }
  // 强化天赋追加攻击：1 次本体（Talent[3]）+ 每 Ultra[2]=4 层【婪酣】额外 1 次（Ultra[3]）；
  // 目标阵亡时按脚本切换到新的【饲饵】继续；E2 返还所移除层数的 35%。
  function enhancedFollowup(b,u,to){
    const P=u.kit.params;
    const layers=lazeOf(u),extra=Math.floor(layers/P.Ultra[2]),consumed=extra*P.Ultra[2];
    if(consumed>0)resource(b,u,'婪酣',layers-consumed);
    let target=to;
    if(!target||!live(target))target=baitHolder(b,u);
    for(let i=0;i<1+extra;i++){
      if(!target||!live(target)){
        target=baitHolder(b,u)??pickNewBait(b,u);
        if(!target)break;
      }
      insertHit(b,u,target,i===0?P.Talent[3]:P.Ultra[3]);
    }
    if(rank(u,2)&&consumed>0)gainLaze(b,u,Math.floor(consumed*rank(u,2,1)));
    record(b,'mechanic',u,{name:'强化天赋追加攻击',instances:1+extra,consumed});
  }
  return {
    start(b,u){
      resource(b,u,'充能',u.kit.params.Talent[0]);
      resource(b,u,'婪酣',0);
      resource(b,u,'婪酣累计获得',0);
      resource(b,u,'本次战技已为饲饵',0);
      pickNewBait(b,u);
    },
    // 秘技 150407：对敌方全体造成 Maze[1] 攻击力雷伤，并获得 Maze[2] 点充能。
    entry(b,u){
      const P=u.kit.params;
      for(const to of enemies(b,u))
        damageTo(b,u,to,{name:'吃吧，可憎的手',type:'Maze',element:'Thunder',
          terms:atk(P.Maze[1]),toughness:st(ROSTER_DATA[1504],150407,0)},1,'primary','technique');
      gainCharge(b,u,P.Maze[2]);
    },
    waveStart(b,u){
      // 换波：新敌人入场后若场上没有【饲饵】，最低生命百分比者立即成为【饲饵】。
      if(!baitHolder(b,u))pickNewBait(b,u);
      syncBait(b,u);
    },
    before(b,u,actor,key,kind,a,selected){
      void a;
      if(actor!==u||kind==='copy')return;
      const P=u.kit.params;
      if(key==='skill'){
        const to=selected[0];
        resource(b,u,'本次战技已为饲饵',hasBait(u,to)?1:0);
        applyBait(b,u,to);
        // 行迹 point06「罪途」：施放战技获得 trace[0]=1 层【婪酣】。
        if(trace(u,1))gainLaze(b,u,trace(u,1)[0]);
        return;
      }
      if(key==='ultimate'){
        applyBait(b,u,selected[0]);
        // 行迹 point06：施放终结技获得 trace[1]=2 层【婪酣】。
        if(trace(u,1))gainLaze(b,u,trace(u,1)[1]);
        // E4：施放终结技时攻击力 +ranks[4][0]=40%、ranks[4][1]=3 回合（先于本次伤害）。
        if(rank(u,4))buff(b,u,u,'切记，不必咀嚼真相','atkPct',rank(u,4,0),rank(u,4,1),{id:u.id+':ashveil-e4'});
        return;
      }
      if(key==='followup')b.hsr1504Inserting=(b.hsr1504Inserting??0)+1;
    },
    after(b,u,actor,key,kind,a,selected,hitTargets){
      void a;
      // 天赋：我方其他目标攻击了【饲饵】后（每次攻击结算一次，与脚本 OnListenAfterAttack 一致）。
      if(actor!==u&&actor.side===u.side&&kind!=='technique'&&kind!=='copy'
        &&hitTargets.some(t=>live(t)&&hasBait(u,t))){
        const P=u.kit.params;
        energy(b,u,P.Talent[6],true);                       // 固定恢复 Talent[6]=8 点能量
        if(chargeOf(u)>=P.Talent[2]){
          resource(b,u,'充能',chargeOf(u)-P.Talent[2]);
          if(!b.queue.some(q=>q.actor===u.id&&q.key==='followup'))
            b.queue.push({actor:u.id,key:'followup',kind:'followup',targetId:hitTargets.find(t=>live(t)&&hasBait(u,t)).id});
        }
      }
      if(actor!==u||kind==='copy')return;
      const P=u.kit.params;
      if(key==='skill'){
        const to=hitTargets[0]??selected[0];
        if(u.resources['本次战技已为饲饵']&&to&&live(to)){
          damageTo(b,u,to,{name:'鞭哨，逐尽恶兽 · 额外伤害',type:'BPSkill',element:'Thunder',
            terms:atk(P.BPSkill[2]),toughness:st(ROSTER_DATA[1504],150402,0)},1,'primary','direct');
          sp(b,u,P.BPSkill[4],'不死途 · 饲饵额外战技点');
        }
        resource(b,u,'本次战技已为饲饵',0);
        return;
      }
      if(key==='followup'){
        // 天赋：发动追加攻击后获得 Talent[4]=2 层【婪酣】。
        gainLaze(b,u,P.Talent[4]);
        if(b.hsr1504Inserting)b.hsr1504Inserting--;
        syncBait(b,u);
        return;
      }
      if(key==='ultimate'){
        // 终结技：随后立即对【饲饵】发动 1 次获得强化的天赋追加攻击，并获得 Ultra[1]=3 点充能。
        enhancedFollowup(b,u,hitTargets[0]??selected[0]);
        gainCharge(b,u,P.Ultra[1]);
        syncBait(b,u);
      }
    },
    // 行迹 point06：追加重击过程中每有 1 个敌人受到致命攻击 → 获得 trace[3]=1 层【婪酣】。
    // 同时处理【饲饵】持有者阵亡后的自动转移（DebuffShift OnListenCharacterLimbo）。
    death(b,u,from,to){
      void from;
      if(to.side===u.side)return;
      const wasBait=hasBait(u,to);
      if(wasBait){
        to.buffs=to.buffs.filter(e=>e.tag!==BAIT||e.source!==u.id);
        if(!pickNewBait(b,u))syncBait(b,u);
      }
      if(b.hsr1504Inserting&&trace(u,1))gainLaze(b,u,trace(u,1)[3]);
    },
    modifiers(b,u,actor,to,a,kind){
      const out={};
      // 行迹 point08「头狼」：我方目标暴击伤害 +trace[0]=40%，追加攻击暴击伤害额外 +trace[1]=80%。
      if(actor.side===u.side&&trace(u,3)){
        out.critDmg=(out.critDmg??0)+trace(u,3)[0];
        if(kind==='followup')out.critDmg+=trace(u,3)[1];
      }
      if(to.side===u.side)return out;
      // E1：敌方全体受到的伤害提高 ranks[1][0]=24%，生命百分比 ≤ranks[1][1]=50% 时提高至 ranks[1][2]=36%。
      if(rank(u,1)){
        const ratio=to.hp/combatPanel(to).hp;
        out.vuln=(out.vuln??0)+(ratio<=rank(u,1,1)?rank(u,1,2):rank(u,1,0));
      }
      if(actor===u){
        // 行迹 point07「影肢」：追加攻击伤害 +trace[0]=80%，每有 1 层【婪酣】额外 +trace[2]=10%。
        if(trace(u,2)&&kind==='followup')
          out.dmgBoost=(out.dmgBoost??0)+trace(u,2)[0]+trace(u,2)[2]*lazeOf(u);
        // E6：每获得过 1 层【婪酣】造成的伤害 +ranks[6][1]=4%，最多 ranks[6][2]=30 层。
        if(rank(u,6))
          out.dmgBoost=(out.dmgBoost??0)+rank(u,6,1)*Math.min(rank(u,6,2),u.resources['婪酣累计获得']??0);
      }
      void a;
      return out;
    },
    display(b,u,to){
      if(to!==u)return [];
      return [{type:'resource',id:u.id+':ashveil-charge',source:u.id,name:'充能',key:'marker',
        value:chargeOf(u),derived:true},
        {type:'resource',id:u.id+':ashveil-laze',source:u.id,name:'婪酣',key:'marker',
        value:lazeOf(u),derived:true}];
    },
  };
}

const factories={
  8003:preservation,
  8004:preservation,
  8005:harmony,
  8009:elation,
  8010:elation,
  1504:ashveil,
};

export {factories,actions};
