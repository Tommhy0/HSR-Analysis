// DeepSeek batch-07：4 名召唤 / 智识角色（1204 景元 / 1222 灵砂 / 1201 青雀 / 1003 姬子）。
//
// 数值契约（固定 4.6 数据，未编造）：
//  · `_data_cache/hsr_core.json`（按 charId 过滤）：技能 desc 的 `#n` 与 `params[等级].param_list`、
//    行迹（type=3）、星魂 1~6。
//  · `simulator/roster-data.mjs` 的 ROSTER_DATA：分等级 param_list、stance（削韧）、spBase（回能）、
//    bpNeed / bpAdd（战技点）、hits（原始脚本 HitSplitRatio 摘录）。
//  · 原始脚本（固定提交 312b4597691e0a29cf9828a15b592757dba86949）：
//    `_data_cache/strict_research/Avatar_JingYuan_00_Ability.json`、
//    `Avatar_Lingsha_00_Ability.json`、`Avatar_Qingque_00_Ability.json`、`Avatar_Himeko_00_Ability.json`。
//
// 段数换算（hitShares 必须与原始脚本真段数一致，且引擎要求各段之和≈1）：
//  · 1204 普攻 Skill01_Phase02：两个 AttackData 同一 DamagePercentage，HitSplitRatio [0.45,0.55] → 2 段。
//    战技 Skill02_Phase02 的执行结构：OnStart[9] AllEnemy HitSplitRatio 0.4 + OnStart[11]/[14] 两个
//    Retarget(ByRandom) 内的 RandomConfig（三选一）各 0.3 → 实际执行 3 个伤害节点、权重 [0.4,0.3,0.3]
//    （和=1，与说明「对敌方全体造成 100% 攻击力」的每目标总量一致）。原始 JSON 里 6 个 0.3 节点是
//    两个三选一分支的枚举，不会同时结算，故不取 7 段。终结 Skill03_Phase02 单段 → [1]。
//    神君 Passive_Insert_Ability：LoopExecuteTaskList MaxLoopCount=ATKCount，每次循环 1 段
//    Talent[1]=0.66（AttackType=Insert）+ 相邻（E1 时为 main×(Talent[4]+ranks[1][0])）→ 每段 1 次主目标命中。
//  · 1222 普攻 / 战技 / 终结各 1 段；浮元 BPSkill_BattleEvent_Phase02：OnStart[2] 全体 1 段
//    Talent[1]=0.75，OnStart[3] IncludeTaskListTemplate「Lingsha_Passive_Target」为天赋说明里的
//    随机单体 Talent[7]=0.75，OnStart[4]（E6）模板为 ranks[6][1]=4 次 ranks[6][2]=0.5 + 5 削韧。
//  · 1201 普攻 Skill01_Phase02 OnProjectileHit 1 段；强化普攻 Skill11_Phase02 2 段（主 120108[0] /
//    相邻 120108[1]）；终结 Skill03_Phase02 1 段；E4 追击 Rank04_ATK 1 段（= 普攻伤害）、
//    Rank04_ATK_Special 2 段（= 强化普攻的 2 段）。
//  · 1003 普攻 Skill01_Phase02 [0.4,0.6] → 2 段；战技 Skill02_Phase02 主目标
//    [2]0.2 + [5]0.2 + [8]×Loop4 的 0.05×4 + [11]0.4 = 1.0（7 段），相邻 [3]0.2+[6]0.2+[12]0.6 = 1.0；
//    终结 Skill03_Phase02 OnStart[2] 全体 1 段（E6 的 OnStart[3] ByRankActivated 循环 2 次 40% 走 bounce）；
//    天赋 Passive1Atk02_Ability：OnStart[5] Loop3×0.2 + OnStart[7] 0.4 = 4 段。
//
// 已知近似 / 依据缺口（不隐瞒，亦不以倍率壳代替机制）：
//  1) 1204 战技的 0.3 节点在原始脚本里由 Retarget(ByRandom) 指向随机单体，引擎的单动作 hitShares
//     只能描述「对同一目标组的分段」，无法表达随机子集；这里按执行结构 [0.4,0.3,0.3]（和=1）作用于
//     全体，与说明「对敌方全体造成 100% 攻击力」的每目标总量一致。
//  2) 1003 战技主目标真段数为 7（0.2+0.2+4×0.05+0.4），相邻真段数为 3（0.2+0.2+0.6）；引擎对
//     扩散目标复用同一 hitShares，故相邻按 7 段分摊、总量 0.8 精确（只影响分段展示，不影响总伤害）。
//  3) 1222 浮元的「额外随机单体」与 E6 额外伤害写在 IncludeTaskListTemplate
//     （Lingsha_Passive_Target / Lingsha_Passive_Target_Rank06）里，缓存 JSON 只保留模板名、不含
//     模板正文；数值改由 4.6 天赋说明的 #7/#8 与星魂 E6 的 #2/#3/#4 提供（Talent[7]、ranks[6][1..3]）。
//  4) 1222 行迹「遗爇」的冷却在原始脚本是 MAvatar_Lingsha_00_PointB3_CD 的 LifeTime，引擎无独立
//     冷却计时器，改用全局回合计数 b.turns 的 trace[3][1] 回合窗口近似。
//  5) 1204 景元受控制类负面状态时神君跳过本次行动（行动条照常重置），原始脚本为 AbortBehaviorFlags
//     含 STAT_CTRL / DisableAction 的中断。
import {atk,basic,skill,ultimate,talentAction} from '../actions.mjs';

export const IDS=[1204,1222,1201,1003];

const stanceOf=(d,skillId,index)=>d.skills?.[String(skillId)]?.stance?.[index]??0;
const rowOf=(d,id)=>d.skills?.[String(id)];
// 强化普攻 120108「杠上开花！」与普攻 120101 共用等级轨道（E3/E5 的「普攻等级+1」同样生效）：
// compileRegisteredKit 只注入基础五技能，因此按 p.Normal[0] 反查 120101 的等级行再取同级的 120108 参数。
function blossomParams(d,p){
  const table=rowOf(d,120101).params;
  const level=Object.keys(table).find(k=>Math.abs((table[k].param_list?.[0]??NaN)-p.Normal[0])<1e-9)??'6';
  const row=rowOf(d,120108);
  return row.params[level]?.param_list??row.params['6'].param_list;
}

// ─────────────────────────────── 动作表 ───────────────────────────────
const actions={
  // ── 1204 景元：普攻 2 段；战技 / 终结全体；神君为主目标 + 相邻两条独立攻击（每段各 1 次命中）──
  1204:(p,d,{eidolon=0}={})=>({
    basic:basic(p,d,{terms:atk(p.Normal[0]),hitShares:[.45,.55],toughness:stanceOf(d,120401,0)}),
    skill:skill(p,d,{target:'all',terms:atk(p.BPSkill[0]),toughness:stanceOf(d,120402,1),hitShares:[.4,.3,.3]}),
    ultimate:ultimate(p,d,{target:'all',terms:atk(p.Ultra[0]),toughness:stanceOf(d,120403,1),hitShares:[1]}),
    // 神君每段：主目标 Talent[1]；相邻 = Talent[1] ×（Talent[4] + E1 的 ranks[1][0]）。
    godSword:talentAction(p,d,{name:'斩勘神形 · 神君',terms:atk(p.Talent[1]),
      toughness:stanceOf(d,120404,0),hitShares:[1],energyGain:0,shenjun:true}),
    godSwordAdjacent:talentAction(p,d,{name:'斩勘神形 · 神君（相邻）',
      terms:atk(p.Talent[1]*(p.Talent[4]+(eidolon>=1?d.ranks['1'][0]:0))),
      toughness:0,hitShares:[1],energyGain:0,shenjun:true}),
  }),
  // ── 1222 灵砂：普攻 1 段；战技 / 终结全体 1 段；浮元（全体 1 段 + 随机单体 1 段 + E6 额外 4 段）──
  1222:(p,d,{eidolon=0}={})=>({
    basic:basic(p,d,{terms:atk(p.Normal[0]),toughness:stanceOf(d,122201,0),hitShares:[1]}),
    skill:skill(p,d,{target:'all',terms:atk(p.BPSkill[0]),toughness:stanceOf(d,122202,1),hitShares:[1]}),
    ultimate:ultimate(p,d,{target:'all',terms:atk(p.Ultra[0]),toughness:stanceOf(d,122203,1),hitShares:[1]}),
    fuyuan:talentAction(p,d,{name:'烟斜雾横，氛氲化生 · 浮元',target:'all',terms:atk(p.Talent[1]),
      toughness:stanceOf(d,122204,1),hitShares:[1],energyGain:0,fuyuan:true}),
    fuyuanExtra:talentAction(p,d,{name:'烟斜雾横，氛氲化生 · 浮元（额外）',terms:atk(p.Talent[7]),
      toughness:stanceOf(d,122204,1),hitShares:[1],energyGain:0,fuyuan:true}),
    // E6：额外 4 次 ranks[6][2] 倍 + ranks[6][3] 削韧；E0 时不触发（由 handler 的 rank 判定）。
    fuyuanE6:talentAction(p,d,{name:'浮元 · E6 额外伤害',terms:atk(d.ranks['6'][2]),
      toughness:d.ranks['6'][3],hitShares:[1],energyGain:0,fuyuan:true,e6Only:true}),
  }),
  // ── 1201 青雀：普攻 1 段；强化普攻 2 段（扩散）；终结全体 1 段；E4 追击 1 / 2 段 ──
  1201:(p,d,{eidolon=0}={})=>{
    const en=blossomParams(d,p);
    return {
      basic:basic(p,d,{terms:atk(p.Normal[0]),toughness:stanceOf(d,120101,0),hitShares:[1]}),
      enhancedBasic:basic(p,d,{name:rowOf(d,120108).name,target:'blast',spGain:0,
        terms:[...atk(en[0]),{...atk(en[1])[0],target:'adjacent'}],
        toughness:stanceOf(d,120108,0),adjacentToughness:stanceOf(d,120108,2),hitShares:[1]}),
      skill:skill(p,d,{target:'self',terms:[],toughness:0,hitShares:[1]}),
      ultimate:ultimate(p,d,{target:'all',terms:atk(p.Ultra[0]),toughness:stanceOf(d,120103,1),hitShares:[1]}),
      rank04Atk:talentAction(p,d,{name:'不求人 · 追加攻击',terms:atk(p.Normal[0]),
        toughness:stanceOf(d,120101,0),hitShares:[1],energyGain:0,rank04:true}),
      rank04AtkSpecial:talentAction(p,d,{name:'不求人 · 追加攻击（强化普攻）',target:'blast',
        terms:[...atk(en[0]),{...atk(en[1])[0],target:'adjacent'}],
        toughness:stanceOf(d,120108,0),adjacentToughness:stanceOf(d,120108,2),hitShares:[1],energyGain:0,rank04:true}),
    };
  },
  // ── 1003 姬子：普攻 2 段；战技扩散 7 段（主目标真段数）；终结全体 1 段 + E6 2 次弹射 40%；
  //    天赋追加攻击全体 4 段 ──
  1003:(p,d,{eidolon=0}={})=>({
    basic:basic(p,d,{terms:atk(p.Normal[0]),toughness:stanceOf(d,100301,0),hitShares:[.4,.6]}),
    skill:skill(p,d,{target:'blast',
      terms:[...atk(p.BPSkill[0]),{...atk(p.BPSkill[1])[0],target:'adjacent'}],
      toughness:stanceOf(d,100302,0),adjacentToughness:stanceOf(d,100302,2),
      hitShares:[.2,.2,.05,.05,.05,.05,.4]}),
    ultimate:ultimate(p,d,{target:'all',terms:atk(p.Ultra[0]),toughness:stanceOf(d,100303,1),hitShares:[1],
      bounceCount:eidolon>=6?2:0,bounceTerms:atk(p.Ultra[0]*d.ranks['6'][0]),bounceToughness:0,bounceEnergy:0}),
    followup:talentAction(p,d,{name:'乘胜追击 · 追加攻击',target:'all',terms:atk(p.Talent[0]),
      toughness:stanceOf(d,100304,1),hitShares:[.2,.2,.2,.4],energyGain:d.skills['100304'].spBase??0}),
  }),
};

// ─────────────────────────────── 1204 景元 ───────────────────────────────
// 天赋「斩勘神形」：战斗开始召唤【神君】（kind:'countdown' 独立行动条召唤物），初始
// Talent[0]=60 速度 / Talent[3]=3 段；战技 +BPSkill[1]=2 段、终结 +Ultra[1]=3 段、秘技首回合
// +Maze[0]=3 段，上限 Talent[5]=10 段；每多 1 段速度 +Talent[2]=10（原始脚本
// MAvatar_JingYuan_00_BattleEvent_SpeedUp：SpeedDelta = MDF_PropertyValue(10) × 层数，
// 层数上限表达式 AQABAQMR(Talent[5], Talent[3]) 即 10 − 3 = 7 层 → 速度 = 60 + 10×(段数−3)）。
// 行动时每段随机敌方单体 Talent[1]=0.66 雷伤 + 相邻（Talent[4]=0.25；E1 额外 +ranks[1][0]），
// 行动结束后速度与段数恢复初始。景元受控制类负面状态时神君无法行动。
function jingyuan(api){const {live,enemies,rank,trace,buff,stacks,resource,energy,damageTo,record}=api;
  const summonOf=(b,u)=>b.summons.find(s=>s.owner===u.id&&s.kind==='countdown');
  const cap=u=>u.kit.params.Talent[5];
  const speedOf=(u,hits)=>u.kit.params.Talent[0]+u.kit.params.Talent[2]*Math.max(0,hits-u.kit.params.Talent[3]);
  const sync=(b,u,s)=>{s.speed=speedOf(u,s.hits);record(b,'resource',u,{name:'神君速度',value:s.speed});};
  const add=(b,u,n)=>{const s=summonOf(b,u);if(!s)return;const cur=s.hits;
    s.hits=Math.min(cap(u),cur+n);if(s.hits!==cur){resource(b,u,'神君段数',s.hits);sync(b,u,s);
      record(b,'mechanic',u,{name:'神君段数增加',value:s.hits});}};
  return {
    start(b,u){const p=u.kit.params;
      b.summons.push({id:u.id+':shenjun',name:'神君',owner:u.id,kind:'countdown',
        speed:speedOf(u,p.Talent[3]),distance:10000,hits:p.Talent[3],active:true,
        order:b.units.length+b.summons.length});
      resource(b,u,'神君段数',p.Talent[3]);
      record(b,'summon',u,{name:'召唤神君',speed:speedOf(u,p.Talent[3])});},
    // 秘技「摄召威灵」：战斗开始时【神君】第 1 回合攻击段数 +Maze[0]。
    entry(b,u){add(b,u,u.kit.params.Maze[0]);},
    before(b,u,actor,key){if(actor!==u)return;
      if(key==='skill')add(b,u,u.kit.params.BPSkill[1]);
      if(key==='ultimate')add(b,u,u.kit.params.Ultra[1]);},
    // 行迹「遣将」：施放战技后暴击率 +trace[1][0]，持续 trace[1][1] 回合。
    after(b,u,actor,key){if(actor!==u||key!=='skill')return;const t=trace(u,3);
      if(t)buff(b,u,u,'遣将 · 暴击率','critRate',t[0],t[1],{id:u.id+':jyTrace3'});},
    summonTurn(b,u,s){
      if(s.kind!=='countdown'||s.owner!==u.id)return;
      if(!live(u)){s.active=false;return;}
      // 「景元受到控制类负面状态影响时【神君】也无法行动」：跳过本次行动（行动结束后仍恢复初始状态）。
      if(u.buffs.some(e=>e.control)){record(b,'mechanic',u,{name:'神君 · 景元受控无法行动'});return;}
      if(!enemies(b,u).length)return;
      const p=u.kit.params,segments=s.hits,e6=rank(u,6);
      for(let i=0;i<segments;i++){
        const pool=enemies(b,u);if(!pool.length)break;
        const to=pool[Math.floor(b.random()*pool.length)];
        damageTo(b,u,to,u.actions.godSword,1,'primary','followup');
        const list=enemies(b,u),at=list.indexOf(to);
        if(at>=0)for(const adj of [list[at-1],list[at+1]])if(adj&&live(adj))
          damageTo(b,u,adj,u.actions.godSwordAdjacent,1,'primary','followup');
        // E6：每段攻击后目标 +1 层易伤（ranks[6][0]，最多 ranks[6][1] 层），持续至本次攻击结束。
        if(e6)stacks(b,u,to,'神君 E6 · 易伤','vuln',u.kit.ranks[6][0],u.kit.ranks[6][1],null,
          {id:u.id+':jyE6:'+to.id,debuff:true});
        // E4：每段攻击后景元恢复 ranks[4][0] 点能量。
        if(rank(u,4))energy(b,u,u.kit.ranks[4][0]);
      }
      if(e6)for(const t of b.units)t.buffs=t.buffs.filter(e=>!e.id.startsWith(u.id+':jyE6:'));
      // E2：【神君】行动后景元的普攻 / 战技 / 终结技伤害 +ranks[2][0]，持续 ranks[2][1] 回合。
      if(rank(u,2))for(const type of ['Normal','BPSkill','Ultra'])
        buff(b,u,u,'景元 E2 · 增伤','dmgBoost',u.kit.ranks[2][0],u.kit.ranks[2][1],
          {id:u.id+':jyE2:'+type,abilityType:type});
      s.hits=p.Talent[3];resource(b,u,'神君段数',s.hits);sync(b,u,s);
      record(b,'mechanic',u,{name:'神君行动结束',segments});
    },
    // 行迹「破阵」：若神君本次攻击段数 ≥ trace[1][0]，本次攻击暴击伤害 +trace[1][1]。
    modifiers(b,u,actor,to,a){
      if(actor!==u)return {};
      const t=trace(u,1),s=summonOf(b,u),out={};
      if(a.shenjun&&t&&s&&s.hits>=t[0])out.critDmg=(out.critDmg??0)+t[1];
      return out;
    },
    display(b,u,to){void to;const s=summonOf(b,u);if(!s)return [];
      return [{type:'buff',id:s.id+':hits',source:u.id,name:'神君 · 攻击段数',key:'marker',
        value:s.hits,derived:true},
        {type:'buff',id:s.id+':speed',source:u.id,name:'神君 · 速度',key:'speed',
        value:s.speed,derived:true,note:'剩余行动值 '+Math.round(s.distance/s.speed*100)/100}];},
  };
}

// ─────────────────────────────── 1222 灵砂 ───────────────────────────────
// 天赋「烟斜雾横，氛氲化生」：施放战技召唤【浮元】（kind:'countdown'，速度 #1=Talent[0]=90，
// 初始 #7=Talent[6]=3 次行动次数，上限 #5=Talent[4]=5）；浮元行动时为追加攻击：全体 #2=Talent[1]=0.75、
// 随机单体 #8=Talent[7]=0.75（优先韧性>0 且火弱点的目标）、解除我方全体各 #6=Talent[5]=1 个负面、
// 回复 Talent[2]=12% 攻击力 + Talent[3]=360；次数归零或灵砂阵亡时消失。
// 终结使浮元行动提前 Ultra[5]=100%、战技提前 BPSkill[3]=20%；醇醉（击破伤害 +Ultra[3]，
// Ultra[4] 回合）；行迹「遗爇」我方受击 / 消耗生命且存在 ≤60% 生命角色时触发一次不消耗次数的追击
// （trace[3][1]=2 回合冷却）；「兰烟」普攻额外回能 trace[2][0]；「朱燎」按击破特攻提高攻击 / 治疗。
function lingsha(api){const {live,allies,enemies,rank,trace,buff,resource,heal,cleanseOne,damageTo,combatPanel,energy,record}=api;
  const summonOf=(b,u)=>b.summons.find(s=>s.owner===u.id&&s.kind==='countdown');
  const capCount=u=>u.kit.params.Talent[4];
  const summonNow=(b,u,count)=>{let s=summonOf(b,u);
    if(!s){s={id:u.id+':fuyuan',name:'浮元',owner:u.id,kind:'countdown',speed:u.kit.params.Talent[0],
      distance:10000,counts:0,active:true,order:b.units.length+b.summons.length};
      b.summons.push(s);record(b,'summon',u,{name:'召唤浮元',speed:s.speed});}
    s.counts=Math.min(capCount(u),s.counts+count);s.active=true;
    resource(b,u,'浮元行动次数',s.counts);return s;};
  const advanceSummon=(b,u,s,ratio)=>{if(!s||!(ratio>0))return;
    s.distance=Math.max(0,s.distance-10000*ratio);
    record(b,'advance',u,{name:'浮元行动提前',target:s.id,ratio,distance:s.distance});};
  const fireWeak=t=>(t.weaknesses??[]).includes('Fire')||t.buffs.some(e=>e.weakness==='Fire');
  const pickTarget=(b,u,pool)=>{const pref=pool.filter(t=>(t.toughness??0)>0&&fireWeak(t));
    const list=pref.length?pref:pool;if(!list.length)return null;
    return list[Math.floor(b.random()*list.length)];};
  const attack=(b,u,{consume})=>{const p=u.kit.params,s=summonOf(b,u);if(!s)return;
    for(const to of enemies(b,u))damageTo(b,u,to,u.actions.fuyuan,1,'primary','followup');
    const extra=pickTarget(b,u,enemies(b,u));
    if(extra)damageTo(b,u,extra,u.actions.fuyuanExtra,1,'primary','followup');
    // E6：额外 ranks[6][1] 次 ranks[6][2] 倍 + ranks[6][3] 削韧的随机单体伤害。
    if(rank(u,6))for(let i=0;i<u.kit.ranks[6][1];i++){
      const t=pickTarget(b,u,enemies(b,u));if(!t)break;
      damageTo(b,u,t,u.actions.fuyuanE6,1,'primary','followup');}
    for(const to of allies(b,u))for(let i=0;i<p.Talent[5];i++)cleanseOne(b,u,to);
    const atk=combatPanel(u).atk;
    for(const to of allies(b,u))heal(b,u,to,atk*p.Talent[2]+p.Talent[3]);
    // E4：浮元行动时为当前生命值最低的我方目标回复 ranks[4][0] 倍攻击力生命。
    if(rank(u,4)){const lowest=allies(b,u).reduce((a,c)=>a.hp/a.panel.hp<=c.hp/c.panel.hp?a:c);
      if(lowest)heal(b,u,lowest,atk*u.kit.ranks[4][0]);}
    if(consume){s.counts=Math.max(0,s.counts-1);resource(b,u,'浮元行动次数',s.counts);
      if(s.counts<=0)s.active=false;}
    record(b,'mechanic',u,{name:'浮元行动',counts:s.counts,consume:!!consume});};
  // 行迹「遗爇」：浮元在场、我方有人 ≤trace[3][0] 生命时立即发动一次追击（不消耗行动次数）。
  // 1222103「该效果在 #2=2 回合后可再次触发」，冷却计时者为灵砂自身回合。
  const yire=(b,u)=>{const t=trace(u,3),s=summonOf(b,u);
    if(!t||!s||!s.active)return;
    const last=u.resources['遗爇触发回合'];
    if(last!=null&&u.turns<last+t[1])return;
    if(!allies(b,u).some(a=>a.hp/combatPanel(a).hp<=t[0]))return;
    resource(b,u,'遗爇触发回合',u.turns);
    attack(b,u,{consume:false});
    record(b,'mechanic',u,{name:'遗爇 · 额外追加攻击'});};
  return {
    start(b,u){resource(b,u,'浮元行动次数',0);},
    // 秘技「流翠散云」：战斗开始时立即召唤浮元（Talent[7] 次），敌方全体醇醉 Maze[0] 回合。
    entry(b,u){const p=u.kit.params;summonNow(b,u,p.Talent[6]);
      for(const to of enemies(b,u))buff(b,u,to,'流翠散云 · 醇醉','marker',0,p.Maze[0],
        {id:u.id+':lsDrunk:'+to.id,debuff:true,tag:'lsDrunk'});},
    before(b,u,actor,key){
      // E1：记录敌方击破状态，动作结束后对本次被击破的目标施加减防。
      if(rank(u,1))u._lsBroken=enemies(b,u).map(t=>[t.id,!!t.broken]);
      if(actor?.side===u.side)u._lsLogStart=b.log.length;   // 消耗生命值检测窗口
      if(actor!==u||key!=='ultimate')return;
      const p=u.kit.params;
      for(const to of enemies(b,u))buff(b,u,to,'幔亭缭霞 · 醇醉','marker',0,p.Ultra[4],
        {id:u.id+':lsDrunk:'+to.id,debuff:true,tag:'lsDrunk'});
      if(rank(u,2))for(const to of allies(b,u))buff(b,u,to,'灵砂 E2 · 击破特攻','breakEffect',
        u.kit.ranks[2][0],u.kit.ranks[2][1],{id:u.id+':lsE2'});
    },
    after(b,u,actor,key){
      const p=u.kit.params;
      if(actor===u&&key==='skill'){const s=summonNow(b,u,p.Talent[6]);advanceSummon(b,u,s,p.BPSkill[3]);}
      if(actor===u&&key==='ultimate'){
        const atk=combatPanel(u).atk;
        for(const to of allies(b,u))heal(b,u,to,atk*p.Ultra[1]+p.Ultra[2]);
        advanceSummon(b,u,summonOf(b,u),p.Ultra[5]);}
      // 行迹「兰烟」：施放普攻时额外恢复 trace[2][0] 点能量。
      if(actor===u&&key==='basic'&&trace(u,2))energy(b,u,trace(u,2)[0]);
      const snap=u._lsBroken;u._lsBroken=null;
      if(rank(u,1)&&snap)for(const [id,was] of snap){const t=b.units.find(x=>x.id===id);
        if(t&&!was&&t.broken&&live(t))buff(b,u,t,'灵砂 E1 · 减防','defShred',u.kit.ranks[1][0],null,
          {id:u.id+':lsE1:'+t.id,debuff:true,removeOnSourceDeath:true});}
      const from=u._lsLogStart??b.log.length;u._lsLogStart=null;
      for(let i=from;i<b.log.length;i++){const e=b.log[i];
        if(e.type==='hp_consume'){const t=b.units.find(x=>x.id===e.target);
          if(t&&t.side===u.side){yire(b,u);break;}}}
    },
    afterDamage(b,u,from,to){void from;if(!live(u)||to.side!==u.side)return;yire(b,u);},
    summonTurn(b,u,s){
      if(s.kind!=='countdown'||s.owner!==u.id)return;
      if(!live(u)){s.active=false;return;}
      attack(b,u,{consume:true});
    },
    modifiers(b,u,actor,to,a,kind){
      const out={},s=summonOf(b,u);
      // E6：浮元在场时敌方全体全属性抗性降低 ranks[6][0]。
      if(s&&s.active&&rank(u,6)&&actor?.side===u.side&&to.side!==u.side)
        out.resPen=(out.resPen??0)+u.kit.ranks[6][0];
      // 醇醉：受到的击破 / 击破持续 / 超击破伤害 +Ultra[3]。
      if(['break','break_dot','superbreak'].includes(kind)&&to.buffs.some(e=>e.tag==='lsDrunk'))
        out.vuln=(out.vuln??0)+u.kit.params.Ultra[3];
      void a;return out;
    },
    panel(b,u,to,out){
      if(to!==u)return;
      // E1：弱点击破效率 +ranks[1][1]。
      if(rank(u,1))out.breakEfficiency=(out.breakEfficiency??0)+u.kit.ranks[1][1];
      // 行迹「朱燎」：攻击力 / 治疗量提高 = 击破特攻 × trace[1][0]/trace[1][1]（上限 trace[1][2]/trace[1][3]）。
      const t=trace(u,1);if(!t)return;
      const be=out.breakEffect??0;
      out.atk+=(u.panel.baseStats?.atk??0)*Math.min(t[2],be*t[0]);
      out.healingBoost=(out.healingBoost??0)+Math.min(t[3],be*t[1]);
    },
    display(b,u,to){void to;const s=summonOf(b,u);if(!s)return [];
      const out=[{type:'buff',id:s.id+':counts',source:u.id,name:'浮元 · 行动次数',key:'marker',
        value:s.counts,derived:true},
        {type:'buff',id:s.id+':speed',source:u.id,name:'浮元 · 速度',key:'speed',value:s.speed,
        derived:true,note:'剩余行动值 '+Math.round(s.distance/s.speed*100)/100}];
      return out;},
  };
}

// ─────────────────────────────── 1201 青雀 ───────────────────────────────
// 天赋「帝垣琼玉」：我方目标回合开始时抽 1 张琼玉牌（3 种花色随机，最多 4 张）；青雀回合开始时
// 若 4 张同花色则消耗全部进入【暗杠】（攻击力 +Talent[0]=72%，普攻强化为【杠上开花！】，
// 无法再施放战技，施放强化普攻后结束）。
// 战技「海底捞月」：抽 BPSkill[0]=2 张、自身伤害 +BPSkill[1]=0.28（行迹「听牌」额外 +trace[1][0]）
// 可叠 BPSkill[2]=4 层、持续至本回合结束、施放后本回合不结束；行迹「争番」单场首次战技回 1 点。
// 终结「四幺暗刻？和！」：全体 Ultra[0] 伤害并获得 4 张同花色牌；E1 终结增伤 ranks[1][0]。
// 行迹「抢杠」强化普攻后速度 +trace[3][0]；E2 每次抽牌回能 ranks[2][0]；E4 战技后固定概率
// ranks[4][0] 获得【不求人】，普攻 / 强化普攻后立即追加一次等量伤害；E6 强化普攻后回 1 点战技点。
function qingque(api){const {rank,trace,buff,stacks,resource,energy,sp,record}=api;
  const SUITS=['万','筒','条'];
  const tile=u=>u.resources['琼玉牌']??0;
  const suit=(u,i)=>u.resources['琼玉牌 · '+SUITS[i]]??0;
  const setSuit=(b,u,i,n)=>resource(b,u,'琼玉牌 · '+SUITS[i],n);
  const hu=u=>u.buffs.some(e=>e.tag==='qqHu');
  const draw=(b,u,n)=>{for(let k=0;k<n;k++){
    if(tile(u)>=4)break;
    const i=Math.min(2,Math.floor(b.random()*3));
    setSuit(b,u,i,suit(u,i)+1);resource(b,u,'琼玉牌',tile(u)+1);
    // E2：每次触发抽牌立即恢复 ranks[2][0] 点能量。
    if(rank(u,2))energy(b,u,rank(u,2));
    record(b,'resource',u,{name:'抽牌',suit:SUITS[i],count:tile(u)});}};
  return {
    start(b,u){resource(b,u,'琼玉牌',0);for(let i=0;i<3;i++)setSuit(b,u,i,0);
      resource(b,u,'战技链',0);resource(b,u,'争番',0);},
    // 秘技「独弈之乐」：进入战斗时抽取 Maze[0] 张琼玉牌。
    entry(b,u){draw(b,u,u.kit.params.Maze[0]);},
    // 【暗杠】：普攻替换为【杠上开花！】。
    prepare(b,u,key,kind,a){
      if(key!=='basic'||kind==='copy')return a;
      if(hu(u))return {...u.actions.enhancedBasic,targetId:a.targetId};
      return a;},
    // 【暗杠】状态下无法再次施放战技。
    shouldUseSkill(b,u){return !hu(u);},
    turnStart(b,u,actor){
      if(actor.side!==u.side)return;
      draw(b,u,1);
      if(actor!==u)return;
      resource(b,u,'战技链',0);
      const four=()=>{for(let i=0;i<3;i++)if(suit(u,i)>=4)return true;return false;};
      if(tile(u)>=4&&four()){
        for(let i=0;i<3;i++)setSuit(b,u,i,0);resource(b,u,'琼玉牌',0);
        buff(b,u,u,'暗杠','atkPct',u.kit.params.Talent[0],null,{id:u.id+':qqHu',tag:'qqHu'});
        record(b,'mechanic',u,{name:'进入暗杠'});}
    },
    // 普攻【门前清】：使用 1 张当前花色最少的琼玉牌。
    before(b,u,actor,key,kind,a){
      void kind;
      if(actor!==u||key!=='basic')return;
      if(a.name===u.actions.enhancedBasic.name||tile(u)<=0)return;
      // 「当前花色最少」只在持有的花色之间比较（不持有某花色时不能使用该花色的牌）。
      let idx=-1;for(let i=0;i<3;i++){if(suit(u,i)<=0)continue;
        if(idx<0||suit(u,i)<suit(u,idx))idx=i;}
      if(idx<0)return;
      setSuit(b,u,idx,suit(u,idx)-1);resource(b,u,'琼玉牌',tile(u)-1);
      record(b,'resource',u,{name:'门前清 · 使用琼玉牌',suit:SUITS[idx],count:tile(u)});
    },
    after(b,u,actor,key,kind,a,selected){
      void kind;
      if(actor!==u)return;const p=u.kit.params;
      if(key==='skill'){
        draw(b,u,p.BPSkill[0]);
        // 「使自身造成的伤害提高 BPSkill[1]」+ 行迹「听牌」trace[1][0]，可叠 BPSkill[2] 层。
        stacks(b,u,u,'海底捞月 · 增伤','dmgBoost',
          p.BPSkill[1]+(trace(u,2)?trace(u,2)[0]:0),p.BPSkill[2],1,
          {id:u.id+':qqDmg',countApplyTurn:true});
        if(trace(u,1)&&!(u.resources['争番']??0)){resource(b,u,'争番',1);sp(b,u,1,'争番');}
        if(rank(u,4)&&b.random()<u.kit.ranks[4][0])
          buff(b,u,u,'不求人','marker',0,1,{id:u.id+':qqNoHelp',tag:'qqNoHelp',countApplyTurn:true});
        // 「施放该战技后，本回合不会结束」：以不重置行动条的额外回合继续行动（抽满 BPSkill[2] 层前继续战技）。
        const chain=u.resources['战技链']??0;resource(b,u,'战技链',chain+1);
        if(hu(u))b.queue.push({actor:u.id,key:'basic',kind:'extra'});
        else if(chain+1<p.BPSkill[2]&&b.sp>=(u.actions.skill.spCost??0))
          b.queue.push({actor:u.id,key:'skill',kind:'extra'});
        else b.queue.push({actor:u.id,key:'basic',kind:'extra'});
      }
      if(key==='basic'){
        const enhanced=a.name===u.actions.enhancedBasic.name;
        if(enhanced){
          u.buffs=u.buffs.filter(e=>e.id!==u.id+':qqHu');
          if(trace(u,3))buff(b,u,u,'抢杠 · 速度','speedPct',trace(u,3)[0],1,{id:u.id+':qqSpeed'});
          // E6「施放强化普攻后，恢复1个战技点」无数值参数（ranks[6] 为空数组），只能按星魂等级判定。
          if(u.kit.eidolon>=6)sp(b,u,1,'青雀 E6');
        }
        if(rank(u,4)&&u.buffs.some(e=>e.tag==='qqNoHelp')){
          u.buffs=u.buffs.filter(e=>e.tag!=='qqNoHelp');
          b.queue.push({actor:u.id,key:enhanced?'rank04AtkSpecial':'rank04Atk',kind:'followup',
            targetId:selected[0]?.id});}
      }
      if(key==='ultimate'){
        const i=Math.min(2,Math.floor(b.random()*3));
        for(let k=0;k<3;k++)setSuit(b,u,k,k===i?4:0);
        resource(b,u,'琼玉牌',4);
        record(b,'resource',u,{name:'四幺暗刻？和！',suit:SUITS[i]});}
    },
    // E1：终结技造成的伤害 +ranks[1][0]。
    modifiers(b,u,actor,to,a){void to;if(actor!==u)return {};
      return a.type==='Ultra'&&rank(u,1)?{dmgBoost:u.kit.ranks[1][0]}:{};},
    display(b,u,to){if(to!==u)return [];const out=[];
      out.push({type:'buff',id:u.id+':qq-tiles',source:u.id,name:'琼玉牌',key:'marker',
        value:tile(u),derived:true,note:SUITS.map((s,i)=>s+':'+suit(u,i)).join(' ')});
      if(hu(u))out.push({type:'buff',id:u.id+':qqHu',source:u.id,name:'暗杠 · 攻击提高',
        key:'atkPct',value:u.kit.params.Talent[0],derived:true});
      const e=u.buffs.find(x=>x.id===u.id+':qqDmg');
      if(e)out.push({type:'buff',id:e.id,source:u.id,name:'海底捞月 · 增伤',key:'dmgBoost',
        value:e.value,derived:true});
      if(u.buffs.some(x=>x.tag==='qqNoHelp'))out.push({type:'buff',id:u.id+':qqNoHelp',
        source:u.id,name:'不求人',key:'marker',value:1,derived:true});
      return out;},
  };
}

// ─────────────────────────────── 1003 姬子 ───────────────────────────────
// 天赋「乘胜追击」：敌方目标弱点被击破时获得 1 点充能（上限 Talent[1]=3，战斗开始 +1）；
// 我方目标施放攻击后若充能达到上限，立即发动 1 次全体追加攻击（Talent[0]=1.4，4 段）并清空充能。
// 行迹「星火」：施放攻击后 trace[1][0]=50% 基础概率使目标灼烧（trace[1][1]=2 回合，
// trace[1][2]=0.3 倍攻击力火 DoT）；「灼热」战技对灼烧目标 +trace[2][0]；「道标」生命 ≥trace[3][0]
// 时暴击率 +trace[3][1]。秘技「不完全燃烧」：Maze[0]=100% 基础概率使敌方火伤 +Maze[1]，
// 持续 Maze[2] 回合。E1 追加攻击后速度 +ranks[1][0]/ranks[1][1] 回合；E2 对 ≤ranks[2][0] 生命
// 的目标 +ranks[2][1]；E4 战技造成弱点击破时额外 +1 充能；E6 终结额外 2 次 40% 弹射（动作表）。
function himeko(api){const {live,enemies,rank,trace,buff,resource,energy,dot,combatPanel,record}=api;
  const cap=u=>u.kit.params.Talent[1];
  const charge=u=>u.resources['充能']??0;
  const addCharge=(b,u,n)=>{if(!(n>0))return;const next=Math.min(cap(u),charge(u)+n);
    if(next!==charge(u)){resource(b,u,'充能',next);record(b,'resource',u,{name:'乘胜追击 · 充能',value:next});}};
  return {
    // 「战斗开始时获得 1 点充能」（说明中的结构常量 1）。
    start(b,u){resource(b,u,'充能',1);resource(b,u,'追加次数',0);},
    // 秘技「不完全燃烧」：入战后敌方受到的火属性伤害 +Maze[1]，持续 Maze[2] 回合。
    entry(b,u){const p=u.kit.params;
      for(const to of enemies(b,u))buff(b,u,to,'不完全燃烧 · 火易伤','marker',0,p.Maze[2],
        {id:u.id+':hmkMaze:'+to.id,debuff:true,tag:'hmkMaze'});},
    before(b,u){u._hmkBroken=enemies(b,u).map(t=>[t.id,!!t.broken]);},
    after(b,u,actor,key,kind,a,selected,hits){
      void kind;void selected;void a;
      // 天赋充能：任何来源使敌方目标弱点被击破 +1（E4：姬子战技造成的击破额外 +1）。
      const snap=u._hmkBroken??[];u._hmkBroken=null;
      let gained=0;
      for(const [id,was] of snap){const t=b.units.find(x=>x.id===id);
        if(t&&!was&&t.broken)gained++;}
      if(gained>0){addCharge(b,u,gained);
        if(rank(u,4)&&actor===u&&key==='skill')addCharge(b,u,1);}
      // 满层且我方目标施放攻击后：立即追加攻击并消耗全部充能。
      const attacked=(hits?.length??0)>0&&actor?.side===u.side;
      if(attacked&&charge(u)>=cap(u)){
        resource(b,u,'充能',0);
        if(!b.queue.some(q=>q.actor===u.id&&q.key==='followup')){
          b.queue.push({actor:u.id,key:'followup',kind:'followup'});
          resource(b,u,'追加次数',(u.resources['追加次数']??0)+1);
          // E1：追加攻击触发后速度 +ranks[1][0]，持续 ranks[1][1] 回合。
          if(rank(u,1))buff(b,u,u,'姬子 E1 · 速度','speedPct',u.kit.ranks[1][0],u.kit.ranks[1][1],
            {id:u.id+':hmkE1'});
          record(b,'mechanic',u,{name:'乘胜追击 · 追加攻击'});
        }
      }
      // 行迹「星火」：施放攻击后按基础概率使命中目标灼烧。
      if(actor===u&&trace(u,1)&&['basic','skill','ultimate','followup'].includes(key))
        for(const to of (hits??[]).filter(live))
          dot(b,u,to,{name:'姬子 · 灼烧',element:'Fire',terms:atk(trace(u,1)[2]),
            chance:trace(u,1)[0],duration:trace(u,1)[1],extra:{burn:true}});
    },
    modifiers(b,u,actor,to,a,kind){
      void kind;
      const out={};
      // 秘技「不完全燃烧」：使敌方目标受到的火属性伤害 +Maze[1] —— 这是挂在**目标**身上的
      // 火易伤，任何我方攻击者的火属性伤害都应吃到，因此不能按 `actor===u` 提前返回；
      // 只认姬子自己施加的 debuff 实例（`e.source===u.id`），避免外部同名 tag 被误消费。
      if(a.element==='Fire'&&to.buffs.some(e=>e.tag==='hmkMaze'&&e.source===u.id))
        out.vuln=(out.vuln??0)+u.kit.params.Maze[1];
      // 以下两项是姬子**自身**的伤害加成，必须仍然只对姬子生效。
      if(actor!==u)return out;
      // 行迹「灼热」：战技对灼烧状态目标 +trace[2][0]。
      if(a.type==='BPSkill'&&trace(u,2)&&to.dots.some(d=>d.element==='Fire'))
        out.dmgBoost=(out.dmgBoost??0)+trace(u,2)[0];
      // E2：对当前生命百分比 ≤ranks[2][0] 的目标 +ranks[2][1]。
      if(rank(u,2)&&to.hp/combatPanel(to).hp<=u.kit.ranks[2][0])
        out.dmgBoost=(out.dmgBoost??0)+u.kit.ranks[2][1];
      return out;
    },
    // 行迹「道标」：当前生命百分比 ≥trace[3][0] 时暴击率 +trace[3][1]。
    panel(b,u,to,out){if(to!==u)return;const t=trace(u,3);
      if(t&&u.hp/out.hp>=t[0])out.critRate=(out.critRate??0)+t[1];},
    display(b,u,to){if(to!==u)return [];
      return [{type:'buff',id:u.id+':hmk-charge',source:u.id,name:'乘胜追击 · 充能',key:'marker',
        value:charge(u),derived:true,note:'上限 '+cap(u)}];},
  };
}

const factories={1204:jingyuan,1222:lingsha,1201:qingque,1003:himeko};
export {factories,actions};
