// DeepSeek 独立角色批次 12：1212 镜流 / 1213 丹恒•饮月 / 1312 米沙 / 1109 虎克 / 1008 阿兰 / 1014 Saber
//
// 数据依据（固定 4.6，提交 312b4597691e0a29cf9828a15b592757dba86949）：
//  · `_data_cache/hsr_core.json`（按 charId 过滤）：技能 desc 的 `#n` 与 `params[等级].param_list`、
//    行迹（type=3）、星魂 1~6。
//  · `simulator/roster-data.mjs` 的 ROSTER_DATA：分等级 param_list、stance（削韧）、spBase（回能）、
//    bpNeed / bpAdd（战技点）。
//  · 原始脚本 `_data_cache/strict_research/`（真段数与节点结构）：每个 AttackData 节点的
//    `HitSplitRatio`（缺省 1）或 `SPHitRatio` 给出逐段伤害分配，本模块按两者中实际给出分配的一方取用。
//      Avatar_Jingliu_00_Ability.json   （Skill01_Phase02 2 段 HitSplitRatio 0.3/0.7；Skill02_Phase02 1 段；
//                                        Skill03_Phase02 主 1 段 + 相邻；GlobalModifiers
//                                        MWAvatar_Jingliu_Attack_Transfer = 转魄状态）
//      Avatar_DanHengIL_00_Ability.json （Skill01 2 段 HitSplitRatio 0.3/0.7；Skill11 3 段 0.33/0.33/0.34；
//                                        Skill12 主 5 段 SPHitRatio 0.2×5 且第 4 段起相邻；Skill13 主 7 段
//                                        SPHitRatio 0.14/0.14/0.14/0.14/0.15/0.14/0.15 且第 4 段起相邻；
//                                        Skill03 主 3 段 HitSplitRatio 0.3/0.3/0.4 + 相邻；
//                                        Skill02 = 龙力自在（不结束回合））
//      Avatar_Misha_00_Ability.json     （Skill03_Phase02：LoopExecuteTaskListWithInterval 动态段数，
//                                        IncludeTaskListTemplate 为单段模板）
//      Avatar_Hook_00_Ability.json      （Skill03_Phase02 2 段 HitSplitRatio 0.3/0.7；Skill21 主 1 + 相邻；
//                                        PassiveSkill01_2 = 天赋追加伤害）
//      Avatar_Arlan_00_Ability.json     （Skill01 2 段 SPHitRatio 0.3/0.7；Skill03 主 3 段 SPHitRatio
//                                        0.3/0.1/0.6 + 每段相邻；Skill02 LoseHPByRatio 生命消耗）
//      Avatar_Saber_00_Ability.json     （Skill02 主 4 段 SPHitRatio 0.1/0.1/0.1/0.7 + 每段相邻；
//                                        Skill03 全体 1 段 + 10 次随机单体；Skill11 强化普攻全体 2 段
//                                        HitSplitRatio 各 0.5 + 条件额外段；
//                                        PassiveSkill01 OnStart[2] DV_SurgePointMax = 99）
//
// 强化 / 变身形态的建模方式（不通过 variant）：角色模块在自己的 `prepare` / `before` / `after` /
// `hit` 钩子里用资源 + 动作替换表达：
//  · 镜流【转魄】：朔望资源 → 进入后战技替换为【寒川映月】（`prepare`），消耗队友生命换攻击力（`panel`）。
//  · 丹恒•饮月【逆鳞】/ 龙力自在：`prepare('basic')` 依战技点 + 逆鳞选择【瞬华】/【天矢阴】/【盘拏耀跃】，
//    第 4 段起的相邻追伤与【亢心】/【叱咤】叠层在 `hit` 里按真段数结算。
//  · 虎克终结技后的强化战技：资源标记后在 `prepare('skill')` 替换为独立技能记录 110909。
//  · Saber【宝具】：终结技后 `prepare('basic')` 替换为【解放的金色王权】。
// 共享注册表（registry.mjs / kits.mjs）对 variant!=='base' 直接抛错，故不传 variant。

import {atk,basic,skill,ultimate} from '../actions.mjs';
import {ROSTER_DATA} from '../../roster-data.mjs';

export const IDS=[1212,1213,1312,1109,1008,1014];

// ROSTER_DATA 帮助函数：技能记录的削韧第 index 项 / 名称 / 基础回能。
const S=(id,skillId,index)=>ROSTER_DATA[id].skills?.[String(skillId)]?.stance?.[index]??0;
const NM=(id,skillId)=>ROSTER_DATA[id].skills?.[String(skillId)]?.name??String(skillId);
const SP=(id,skillId)=>ROSTER_DATA[id].skills?.[String(skillId)]?.spBase??0;
// 强化技能与基础技能共用等级轨道：用已编译的基础参数值反查等级行，再取强化技能表同等级的 param_list。
const rowFor=(id,refId,targetId,refValue)=>{
  const table=ROSTER_DATA[id].skills?.[String(refId)]?.params??{};
  const key=Object.keys(table).find(k=>Math.abs((table[k].param_list?.[0]??NaN)-refValue)<1e-9);
  return ROSTER_DATA[id].skills?.[String(targetId)]?.params?.[key??'10']?.param_list??[];
};
// 相邻目标：与引擎扩散结算同一口径（按 b.units 顺序取前后活着的敌人）。
const adjacentOf=(b,u,to)=>{
  const pool=b.units.filter(t=>t.side!==u.side),at=pool.findIndex(t=>t.id===to.id);
  return [pool[at-1],pool[at+1]].filter(t=>t&&t.active!==false&&t.hp>1e-8);
};

// 秘技（Maze）削韧：Maze 记录没有伤害时取 0；丹恒•饮月/米沙/镜流的秘技本体是领域 / 变身，
// 伤害为 0 或由独立 MazeNormal 记录承担（121306 show_stance_list [30,0,0]）。
const MESH_MOV_NORMAL_STANCE=30;

const actions={
  // ── 1212 镜流：普攻 2 段（Skill01_Phase02 节点 HitSplitRatio 0.3/0.7）；战技 1 段；终结 主 1 段 + 相邻；
  //    强化战技【寒川映月】主 1 段 + 相邻（121209 与 121202 共用等级轨道，不消耗战技点）──
  1212:(p,d)=>({
    basic:basic(p,d,{terms:atk(p.Normal[0]),toughness:S(1212,121201,0),hitShares:[.3,.7]}),
    skill:skill(p,d,{terms:atk(p.BPSkill[0]),toughness:S(1212,121202,0),hitShares:[1]}),
    ultimate:ultimate(p,d,{target:'blast',terms:[...atk(p.Ultra[0]),{...atk(p.Ultra[2])[0],target:'adjacent'}],
      toughness:S(1212,121203,0),adjacentToughness:S(1212,121203,2),hitShares:[1]}),
    // 寒川映月 #1=主目标倍率 / #2=消耗朔望 / #3=相邻倍率；spBase 30（121209）。
    enhancedSkill:{name:NM(1212,121209),type:'BPSkill',element:'Ice',target:'blast',
      terms:[...atk(rowFor(1212,121202,121209,p.BPSkill[0])[0]),
        {...atk(rowFor(1212,121202,121209,p.BPSkill[0])[2])[0],target:'adjacent'}],
      hitShares:[1],energyGain:SP(1212,121209),spCost:0,spGain:0,
      toughness:S(1212,121209,0),adjacentToughness:S(1212,121209,2)},
  }),

  // ── 1213 丹恒•饮月：普攻 2 段；龙力自在（强化，不消耗战技点 / 不视为战技）；
  //    瞬华 3 段；天矢阴 主 5 段（第 4 段起相邻）；盘拏耀跃 主 7 段（第 4 段起相邻）；
  //    终结 主 3 段 + 相邻 ──
  1213:(p,d)=>{
    const e1=rowFor(1213,121301,121308,p.Normal[0]);
    const e2=rowFor(1213,121301,121310,p.Normal[0]);
    const e3=rowFor(1213,121301,121312,p.Normal[0]);
    return {
      basic:basic(p,d,{terms:atk(p.Normal[0]),toughness:S(1213,121301,0),hitShares:[.3,.7]}),
      // 龙力自在：不消耗战技点、不造成伤害、不结束回合（由 prepare('basic') 表达强化选择）。
      skill:skill(p,d,{target:'self',terms:[],toughness:0,hitShares:[1],energyGain:0,spCost:0,spGain:0}),
      ultimate:ultimate(p,d,{target:'blast',terms:[...atk(p.Ultra[0]),{...atk(p.Ultra[1])[0],target:'adjacent'}],
        toughness:S(1213,121303,0),adjacentToughness:S(1213,121303,2),hitShares:[.3,.3,.4]}),
      // 121308 #1；spBase 30，bpNeed 1；节点 HitSplitRatio 0.33/0.33/0.34。
      enhancedNormal1:{name:NM(1213,121308),type:'Normal',element:'Imaginary',target:'single',
        terms:atk(e1[0]),hitShares:[.33,.33,.34],toughness:S(1213,121308,0),
        energyGain:SP(1213,121308),spCost:1,spGain:0},
      // 121310 #1 主目标总倍率（5 段，spHit 0.2×5）/ #2 相邻总倍率（第 4 段起 2 段）；spBase 35，bpNeed 2。
      enhancedNormal2:{name:NM(1213,121310),type:'Normal',element:'Imaginary',target:'single',
        terms:atk(e2[0]),hitShares:[.2,.2,.2,.2,.2],toughness:S(1213,121310,0),
        adjacentToughness:S(1213,121310,2),adjacentTotal:e2[1],adjacentFrom:4,hitSegments:5,
        energyGain:SP(1213,121310),spCost:2,spGain:0},
      // 121312 #1 主目标总倍率（7 段，spHit 0.14/0.14/0.14/0.14/0.15/0.14/0.15）/ #2 相邻总倍率（第 4 段起 4 段）。
      enhancedNormal3:{name:NM(1213,121312),type:'Normal',element:'Imaginary',target:'single',
        terms:atk(e3[0]),hitShares:[.14,.14,.14,.14,.15,.14,.15],toughness:S(1213,121312,0),
        adjacentToughness:S(1213,121312,2),adjacentTotal:e3[1],adjacentFrom:4,hitSegments:7,
        energyGain:SP(1213,121312),spCost:3,spGain:0},
    };
  },

  // ── 1312 米沙：普攻 1 段；战技 主 1 段 + 相邻（并增加终结技段数）；
  //    终结 首段指定 + 其余随机单体（分段数动态，默认 Ultra[0]=3 段）──
  1312:(p,d)=>({
    basic:basic(p,d,{terms:atk(p.Normal[0]),toughness:S(1312,131201,0),hitShares:[1]}),
    skill:skill(p,d,{target:'blast',terms:[...atk(p.BPSkill[0]),{...atk(p.BPSkill[1])[0],target:'adjacent'}],
      toughness:S(1312,131202,0),adjacentToughness:S(1312,131202,2),hitShares:[1]}),
    // #2=每段倍率（Ultra[2]），Ultra[0]=初始段数；削韧总量 stance[0]=30 按段均摊。
    ultimate:ultimate(p,d,{target:'single',terms:atk(p.Ultra[1]),hitShares:[1],toughness:S(1312,131203,0)/p.Ultra[0],
      bounceCount:p.Ultra[0]-1,bounceTerms:atk(p.Ultra[1]),bounceToughness:S(1312,131203,0)/p.Ultra[0],bounceEnergy:0}),
  }),

  // ── 1109 虎克：普攻 1 段；战技 1 段；终结 2 段（Skill03_Phase02 节点 HitSplitRatio 0.3/0.7）；
  //    强化战技（终结后下一次战技）主 1 段 + 相邻 ──
  1109:(p,d)=>({
    basic:basic(p,d,{terms:atk(p.Normal[0]),toughness:S(1109,110901,0),hitShares:[1]}),
    skill:skill(p,d,{terms:atk(p.BPSkill[0]),toughness:S(1109,110902,0),hitShares:[1]}),
    ultimate:ultimate(p,d,{terms:atk(p.Ultra[0]),toughness:S(1109,110903,0),hitShares:[.3,.7]}),
    // 110909 #1 主目标 / #2 灼烧基础概率 / #3 持续回合 / #4 灼烧倍率 / #5 相邻倍率。
    // 注意：110902 与 110909 同名（嘿！记得虎克吗），本模块用 enhanced 标记区分两者。
    enhancedSkill:{enhanced:true,name:NM(1109,110909),type:'BPSkill',element:'Fire',target:'blast',
      terms:[...atk(rowFor(1109,110902,110909,p.BPSkill[0])[0]),
        {...atk(rowFor(1109,110902,110909,p.BPSkill[0])[4])[0],target:'adjacent'}],
      hitShares:[1],energyGain:SP(1109,110909),spCost:1,spGain:0,
      toughness:S(1109,110909,0),adjacentToughness:S(1109,110909,2)},
  }),

  // ── 1008 阿兰：普攻 2 段（spHit[0.3,0.7]）；战技 1 段（消耗生命）；终结 主 3 段 + 相邻 ──
  1008:(p,d)=>({
    basic:basic(p,d,{terms:atk(p.Normal[0]),toughness:S(1008,100801,0),hitShares:[.3,.7]}),
    // 禁锢解除：#1 生命消耗比例 / #2 伤害；bpNeed=null → 不消耗战技点。
    skill:skill(p,d,{terms:atk(p.BPSkill[1]),toughness:S(1008,100802,0),hitShares:[1],spCost:0}),
    ultimate:ultimate(p,d,{target:'blast',terms:[...atk(p.Ultra[0]),{...atk(p.Ultra[1])[0],target:'adjacent'}],
      toughness:S(1008,100803,0),adjacentToughness:S(1008,100803,2),hitShares:[.3,.1,.6]}),
  }),

  // ── 1014 Saber：普攻 1 段；战技 主 4 段（spHit[0.1,0.1,0.1,0.7]）+ 每段相邻；
  //    终结 全体 1 段 + 10 次随机单体；强化普攻【解放的金色王权】全体 ──
  1014:(p,d)=>({
    basic:basic(p,d,{terms:atk(p.Normal[0]),toughness:S(1014,101401,0),hitShares:[1]}),
    skill:skill(p,d,{target:'blast',terms:[...atk(p.BPSkill[0]),{...atk(p.BPSkill[1])[0],target:'adjacent'}],
      toughness:S(1014,101402,0),adjacentToughness:S(1014,101402,2),hitShares:[.1,.1,.1,.7]}),
    // Ultra[0]=全体倍率；Ultra[1]=每次随机单体倍率；Ultra[2]=额外伤害次数（原始脚本 Loop MaxLoopCount=Ultra#3）。
    ultimate:ultimate(p,d,{target:'all',terms:atk(p.Ultra[0]),toughness:S(1014,101403,1),hitShares:[1],
      bounceCount:p.Ultra[2],bounceTerms:atk(p.Ultra[1]),bounceToughness:0,bounceEnergy:0}),
    // 解放的金色王权：#1 全体倍率（全体削韧 stance[1]=60，两个无条件节点 HitSplitRatio 各 0.5）；
    // #2 炉心共鸣；#3/#4 敌方数量 2/1 的额外全体倍率。
    enhancedBasic:{name:NM(1014,101408),type:'Normal',element:'Wind',target:'all',
      terms:atk(rowFor(1014,101401,101408,p.Normal[0])[0]),hitShares:[.5,.5],
      toughness:S(1014,101408,1),energyGain:SP(1014,101408),spCost:0,spGain:1},
  }),
};

const factories={
  // ══ 1212 镜流 ════════════════════════════════════════════════════════════
  // 天赋「澹月转魄」121204：#5=2 层【朔望】进入【转魄】；行动提前 #6=100%、暴击率 +#7=50%；
  //   战技【无罅飞光】强化为【寒川映月】且仅能使用该战技；转魄中施放攻击消耗队友 #2=4% 生命上限，
  //   按消耗总量 #3=540% 提高镜流攻击力，上限为基础攻击力的 #4=180%；朔望上限 3，为 0 时退出。
  // 行迹：死境（转魄 效果抵抗 +35%）、剑首（无罅飞光后行动提前 10%）、霜魄（转魄 终结技伤害 +20%）。
  // E1 终结 / 强化战技暴伤 +24%（1 回合）+ 单体目标追加 100% 攻击力；E2 终结后下次强化战技伤害 +80%；
  // E4 生命消耗换攻击的转换率 +90%、上限 +30%；E6 进入转魄时朔望上限 +1 并额外 +1 层、转魄 暴伤 +50%。
  1212(api){
    const {live,allies,enemies,rank,trace,buff,resource,energy,advance,damageTo,combatPanel,record}=api;
    const MOON='朔望';
    const RAGE_TAG='jingliuMoonRage';
    const RAGE_ID=u=>u.id+':jl-rage',CRIT_ID=u=>u.id+':jl-rage-crit',E6_ID=u=>u.id+':jl-rage-e6',RES_ID=u=>u.id+':jl-rage-res';
    const E1_ID=u=>u.id+':jl-e1',E2_ID=u=>u.id+':jl-e2';
    const FREEZE_PREFIX=u=>u.id+':jl-freeze:';
    const SKILL=NM(1212,121202),ENH=NM(1212,121209);
    const inRage=u=>u.buffs.some(e=>e.tag===RAGE_TAG);
    const moon=u=>u.resources[MOON]??0;
    const rageCap=u=>(u.kit.enhanced?4:3)+(rank(u,6)?1:0);
    const moonCap=u=>rageCap(u);
    const setMoon=(b,u,n)=>resource(b,u,MOON,Math.max(0,Math.min(moonCap(u),n)));
    const enhRow=u=>rowFor(1212,121202,121209,u.kit.params.BPSkill[0]);
    function enterRage(b,u){
      const p=u.kit.params;
      buff(b,u,u,'转魄','marker',0,null,{id:RAGE_ID(u),tag:RAGE_TAG});
      buff(b,u,u,'转魄 · 暴击率','critRate',p.Talent[6],null,{id:CRIT_ID(u)});
      if(u.kit.enhanced)setMoon(b,u,moon(u)+1);
      if(rank(u,6)){
        setMoon(b,u,moon(u)+rank(u,6,0));
        if(!u.kit.enhanced)buff(b,u,u,'镜流 E6 · 暴击伤害','critDmg',rank(u,6,1),null,{id:E6_ID(u)});
      }
      if(trace(u,1))buff(b,u,u,'死境 · 效果抵抗','effectRes',trace(u,1)[0],null,{id:RES_ID(u)});
      advance(b,u.id,p.Talent[5]);
      record(b,'mechanic',u,{name:'进入转魄',moon:moon(u)});
    }
    function exitRage(b,u){
      u.buffs=u.buffs.filter(e=>![RAGE_ID(u),CRIT_ID(u),E6_ID(u),RES_ID(u)].includes(e.id));
      resource(b,u,'月色',0);resource(b,u,'月色累计受击',0);
      record(b,'mechanic',u,{name:'退出转魄'});
    }
    function gainMoon(b,u,n){
      setMoon(b,u,moon(u)+n);
      if(!inRage(u)&&moon(u)>=u.kit.params.Talent[4])enterRage(b,u);
    }
    return {
      start(b,u){
        resource(b,u,MOON,0);
        resource(b,u,'转魄攻击加成',0);
        resource(b,u,'转魄消耗',0);
        resource(b,u,'E2待触发',0);
        resource(b,u,'月色',0);resource(b,u,'月色累计受击',0);
      },
      // 秘技「古镜照神」121207：恢复 Maze[5]=15 能量、获得 Maze[0]=1 层朔望，
      // 并以 Maze[1]=100% 基础概率冻结敌方 Maze[3]=1 回合（冻结目标每回合开始受 Maze[4]=80% 攻击力附加伤害）。
      entry(b,u){
        const p=u.kit.params;
        energy(b,u,p.Maze[5],true);
        gainMoon(b,u,p.Maze[0]);
        for(const to of enemies(b,u)){
          const c=p.Maze[1]*(1+(combatPanel(u).effectHit??0))*(1-(combatPanel(to).effectRes??0));
          if(c>=1||b.random()<c)
            buff(b,u,to,'冻结','marker',0,p.Maze[3],
              {id:FREEZE_PREFIX(u)+to.id,tag:'jingliuFreeze',control:'freeze',debuff:true,freezeMult:p.Maze[4]});
          else record(b,'resist',to,{name:'古镜照神 · 冻结被抵抗'});
        }
      },
      shouldUseSkill(b,u){if(inRage(u))return true;return undefined;},
      // 转魄中战技替换为【寒川映月】（121209，与 121202 共用等级轨道，不消耗战技点）。
      prepare(b,u,key,kind,a){
        if(kind==='copy'||kind==='technique')return a;
        if(key!=='skill'||!inRage(u))return a;
        return {...u.actions.enhancedSkill,...(a?.targetId?{targetId:a.targetId}:{})};
      },
      before(b,u,actor,key,kind,a,selected){
        if(actor!==u||kind==='copy'||kind==='technique')return;
        const p=u.kit.params;
        resource(b,u,'转魄攻击加成',0);
        // E2：终结后下一次强化战技伤害 +80%。
        if(a?.name===ENH&&(u.resources['E2待触发']??0)>0){
          buff(b,u,u,'镜流 E2 · 强化战技增伤','dmgBoost',rank(u,2),null,{id:E2_ID(u)});
          resource(b,u,'E2待触发',0);
        }
        // E1：施放终结技或强化战技时暴伤 +24%，持续 #3 回合。
        if(rank(u,1)&&(key==='ultimate'||a?.name===ENH))
          buff(b,u,u,'镜流 E1 · 暴击伤害','critDmg',rank(u,1,0),rank(u,1,2),
            {id:E1_ID(u),tickOwner:u.id,tickAt:'end',countApplyTurn:true});
        // 转魄：施放攻击时消耗队友 #2 生命上限（最多到 1），按消耗总量换攻击力（E4 提升转换率与上限）。
        if(inRage(u)&&(a?.terms?.length??0)>0){
          let consumed=0;
          for(const to of allies(b,u)){
            if(to===u)continue;
            const max=combatPanel(to).hp,loss=Math.min(Math.max(0,to.hp-1),max*p.Talent[1]);
            if(loss>1e-9){
              to.hp-=loss;consumed+=loss;
              b.rules.hpChanged(b,to,'consume',loss,u);
              b.rules.relics.healthConsumed(b,to);
              record(b,'hp_consume',u,{target:to.id,amount:loss,hp:to.hp,name:'转魄 · 生命消耗'});
            }
          }
          const ratio=p.Talent[2]+(rank(u,4)?u.kit.ranks[4][0]:0);
          const cap=(combatPanel(u).baseStats?.atk??0)*p.Talent[3]*(1+(rank(u,4)?u.kit.ranks[4][1]:0));
          const bonus=u.kit.enhanced?0:Math.min(cap,consumed*ratio);
          resource(b,u,'转魄消耗',consumed);
          resource(b,u,'转魄攻击加成',bonus);
        }
      },
      after(b,u,actor,key,kind,a,selected,hitTargets){
        if(actor!==u)return;
        const p=u.kit.params;
        resource(b,u,'转魄攻击加成',0);
        // 战技【无罅飞光】：获得 #2=1 层朔望；行迹「剑首」下一次行动提前 10%。
        if(a?.name===SKILL){
          gainMoon(b,u,p.BPSkill[1]);
          if(trace(u,2))advance(b,u.id,trace(u,2)[0]);
        }
        // 强化战技【寒川映月】：消耗 #2=1 层朔望，为 0 时退出转魄。
        if(a?.name===ENH){
          const cost=enhRow(u)[1]??1;
          setMoon(b,u,moon(u)-cost);
          if(moon(u)<=0)exitRage(b,u);
        }
        // 终结技：攻击结束后获得 #2=1 层朔望（Ultra[1]）。
        if(key==='ultimate'){
          gainMoon(b,u,p.Ultra[1]);
          if(rank(u,2))resource(b,u,'E2待触发',1);
        }
        // E1：若只攻击了 1 个敌方目标，额外造成 1 次 #2=100% 攻击力冰伤。
        if(rank(u,1)&&(key==='ultimate'||a?.name===ENH)&&enemies(b,u).length===1){
          const to=enemies(b,u)[0];
          damageTo(b,u,to,{name:'镜流 E1 · 额外伤害',type:'Additional',element:'Ice',
            terms:u.kit.enhanced?[{scaling:'hp',multiplier:rank(u,1,1)}]:atk(rank(u,1,1)),toughness:0},1,'primary','additional');
        }
        if(key==='ultimate'||a?.name===ENH)u.buffs=u.buffs.filter(e=>e.id!==E2_ID(u));
        void hitTargets;
      },
      // 转魄攻击力加成 → 以绝对攻击力写入 panel（持续至本次攻击结束，在 after 清零）。
      panel(b,u,to,out){
        if(to!==u)return;
        const bonus=u.resources?.['转魄攻击加成']??0;
        if(bonus>0)out.atk=(out.atk??0)+bonus;
        if(u.kit.enhanced&&inRage(u))out.critDmg=(out.critDmg??0)+(u.resources?.['月色']??0)*(u.kit.params.Talent[2]+(rank(u,4)?rank(u,4,0):0));
      },
      // 秘技冻结的每回合附加伤害（冻结目标自身回合开始时结算）。
      turnStart(b,u,actor){
        if(actor.side===u.side)return;
        const f=actor.buffs.find(e=>e.tag==='jingliuFreeze'&&e.id===FREEZE_PREFIX(u)+actor.id);
        if(!f)return;
        damageTo(b,u,actor,{name:'古镜照神 · 冻结附加伤害',type:'Additional',element:'Ice',
          terms:u.kit.enhanced?[{scaling:'hp',multiplier:f.freezeMult??0}]:atk(f.freezeMult??0),toughness:0},1,'primary','additional');
      },
      hpChanged(b,u,to,reason,amount,source){
        if(u.side!=='ally'||u.kit?.characterId!==1212||!u.kit.enhanced||!inRage(u)||to.side!=='ally'||!(amount>0)||!['damage','consume'].includes(reason))return;
        const p=u.kit.params,current=u.resources['月色']??0;
        if(current<p.Talent[3]){
          const n=current+1;resource(b,u,'月色',n);
          record(b,'mechanic',u,{name:'获得月色',stacks:n,target:to.id,reason});
        }
        const active=b.activeAction,seq=active?.sequence??`external:${b.log.length}`;
        if(!u.jingliuMoonEventState||u.jingliuMoonEventState.sequence!==seq)u.jingliuMoonEventState={sequence:seq,targets:[]};
        if(!u.jingliuMoonEventState.targets.includes(to.id)){
          u.jingliuMoonEventState.targets.push(to.id);
          const count=(u.resources['月色累计受击']??0)+1,threshold=p.Talent[7]??20;
          if(count>=threshold){resource(b,u,'月色累计受击',0);gainMoon(b,u,1);record(b,'mechanic',u,{name:'累计受击获得朔望',target:to.id,threshold});}
          else resource(b,u,'月色累计受击',count);
        }
        void source;
      },
      modifiers(b,u,actor,to,a,kind){
        const out={};
        if(actor!==u||to.side===u.side)return out;
        // 行迹「霜魄」：转魄状态下终结技伤害 +20%。
        if(trace(u,3)&&inRage(u)&&a?.type==='Ultra')out.dmgBoost=(out.dmgBoost??0)+trace(u,3)[0];
        if(u.kit.enhanced&&inRage(u)&&rank(u,6))out.resPen=(out.resPen??0)+rank(u,6,1);
        void kind;
        return out;
      },
      display(b,u,to){
        if(to!==u)return [];
        return [{type:'buff',id:u.id+':jl-moon',source:u.id,name:'朔望 / 转魄',key:'marker',
          value:inRage(u)?-moon(u):moon(u),derived:true,note:inRage(u)?'转魄中（朔望 '+moon(u)+'）':'朔望 '+moon(u)}];
      },
    };
  },

  // ══ 1213 丹恒•饮月 ══════════════════════════════════════════════════════
  // 战技「龙力自在」121302：使普攻强化，最多连续 3 次；不消耗战技点且不视为使用战技。
  //   【瞬华】#1、bpNeed 1；【天矢阴】#1 主 5 段 + 第 4 段起 #2 相邻、bpNeed 2；
  //   【盘拏耀跃】#1 主 7 段 + 第 4 段起 #2 相邻、bpNeed 3。
  // 天赋「亢心」121304：每段攻击后 +1 层（#1=10% 增伤，上限 #2=6），持续至自身回合结束。
  // 战技 #1=12% 暴伤 / #2=4 层【叱咤】上限：天矢阴 / 盘拏耀跃 第 4 段起每段攻击前 +1 层，持续至自身回合结束。
  // 终结技 121303：主 #1 + 相邻 #2，获得 #3=2 个【逆鳞】（上限 #4=3，可抵扣战技点消耗）。
  // 行迹：伏辰（开场 +15 能）、修禹（控制类负面抗性 +35%）、起蛰（对虚数弱点目标暴伤 +24%）。
  // E1 亢心上限 +4 且每段额外 +1 层；E2 终结后行动提前 100% 并额外 +1 逆鳞；
  // E4 叱咤持续到下一个自身回合结束；E6 队友终结后下次盘拏耀跃抗穿 +20%，最多 3 层。
  // 逆鳞上限：Ultra[3]=3（hsr_core 121303 #4）。
  1213(api){
    const {live,allies,enemies,rank,trace,buff,stacks,resource,energy,advance,damageTo,combatPanel,record}=api;
    const SCALE='逆鳞';
    const N1=NM(1213,121308),N2=NM(1213,121310),N3=NM(1213,121312),ULT=NM(1213,121303);
    const HX_ID=u=>u.id+':dhil-hx',CZ_ID=u=>u.id+':dhil-cz';
    const scale=u=>u.resources[SCALE]??0;
    const setScale=(b,u,n)=>resource(b,u,SCALE,Math.max(0,Math.min(u.kit.params.Ultra[3],n)));
    const addHX=(b,u)=>{
      const p=u.kit.params,max=p.Talent[1]+(rank(u,1)?u.kit.ranks[1][0]:0),times=rank(u,1)?2:1;
      for(let i=0;i<times;i++)
        stacks(b,u,u,'亢心','dmgBoost',p.Talent[0],max,1,{id:HX_ID(u),tickOwner:u.id,tickAt:'end',countApplyTurn:true});
    };
    const addCZ=(b,u)=>{
      const p=u.kit.params;
      // E4（无数值参数，按星魂等级判断）：【叱咤】持续到下一个自身回合结束 → 用 2 层计时表达。
      stacks(b,u,u,'叱咤','critDmg',p.BPSkill[0],p.BPSkill[1],u.kit.eidolon>=4?2:1,
        {id:CZ_ID(u),tickOwner:u.id,tickAt:'end',countApplyTurn:true});
    };
    return {
      start(b,u){
        resource(b,u,SCALE,0);
        resource(b,u,'亢心键','');
        resource(b,u,'E6层数',0);
        if(trace(u,1))energy(b,u,trace(u,1)[0],true);   // 行迹「伏辰」：开场 +15 能
      },
      // 行迹「修禹」：抵抗控制类负面状态的概率 +35%（1213102）。引擎按 0<controlRes<1 掷一次部分抵抗。
      panel(b,u,to,out){
        if(to===u&&trace(u,2))out.controlRes=1-(1-(out.controlRes??0))*(1-trace(u,2)[0]);
      },
      // 秘技「掣空如虹」121307：进入战斗后对敌方全体造成 Maze[2]=120% 攻击力虚数伤害并获得 Maze[0]=1 个逆鳞。
      entry(b,u){
        const p=u.kit.params;
        for(const to of enemies(b,u))
          damageTo(b,u,to,{name:'掣空如虹',type:'Maze',element:'Imaginary',terms:atk(p.Maze[2]),
            toughness:MESH_MOV_NORMAL_STANCE},1,'primary','technique');
        setScale(b,u,scale(u)+p.Maze[0]);
      },
      // 龙力自在不结束回合：引擎每回合只能选一个动作，这里把「强化选择 + 强化普攻」在同一动作里表达。
      // 强化等级 = min(3, 当前战技点 + 逆鳞)；逆鳞抵扣战技点消耗（消耗逆鳞视为消耗战技点）。
      shouldUseSkill(){return false;},
      prepare(b,u,key,kind,a){
        if(key!=='basic'||kind==='copy'||kind==='technique')return a;
        const res=scale(u),spNow=b.sp,lvl=Math.min(3,spNow+res);
        if(lvl<=0)return a;
        const act=lvl>=3?u.actions.enhancedNormal3:lvl===2?u.actions.enhancedNormal2:u.actions.enhancedNormal1;
        // 【逆鳞】优先抵扣：每 1 个逆鳞替代 1 点战技点消耗，只有不足部分才真正消耗战技点。
        // （原始说明：「每消耗 1 个逆鳞，可抵扣 1 点战技点」，且消耗顺序为逆鳞优先。）
        const cost=act.spCost,used=Math.min(res,cost);
        return {...act,spCost:cost-used,scaleUsed:used,...(a?.targetId?{targetId:a.targetId}:{})};
      },
      before(b,u,actor,key,kind,a,selected){
        if(actor!==u||kind==='copy'||kind==='technique')return;
        if((a?.scaleUsed??0)>0)setScale(b,u,scale(u)-a.scaleUsed);
        void key;void selected;
      },
      // 按真段数结算：每段攻击 +1 层【亢心】（E1 每段 +2 层）；天矢阴 / 盘拏耀跃 第 4 段起
      // 每段攻击前 +1 层【叱咤】并对相邻目标补一次 #2 相邻总倍率 / 相邻段数 的伤害。
      hit(b,u,attacker,to,a,kind){
        if(attacker!==u||kind!=='direct'||b.dhilAdjacent)return;
        const name=a?.name;
        if(![N1,N2,N3,u.actions.basic.name,ULT].includes(name))return;
        const seg=a.segment??1;
        const from4=(name===N2||name===N3)&&seg>=(a.adjacentFrom??4);
        if(!from4)return;
        // 【叱咤】原文为「每段攻击【前】+1 层」（Skill12/Skill13_Phase02 的 AddModifier 在
        // DamageByAttackProperty 之前），故保留在 hit 内、伤害结算前加层。
        addCZ(b,u);
        const total=a.adjacentTotal??0,segs=(a.hitSegments??5)-(a.adjacentFrom??4)+1;
        const per=segs>0?total/segs:0;
        if(!(per>0))return;
        // 相邻段削韧：ROSTER_DATA stance[2] 是该技能对相邻目标的总削韧（天矢阴 30 / 盘拏耀跃 60），
        // 按第 4 段起实际命中的相邻段数均摊，而非写死 0（此前漏削韧）。
        const perTough=segs>0?(a.adjacentToughness??0)/segs:0;
        b.dhilAdjacent=true;
        for(const t of adjacentOf(b,u,to))
          // dhilSkill 保留技能身份：相邻包的显示名被改写，E6 抗穿不能靠 a.name===N3 匹配（独立复核 F2）。
          damageTo(b,u,t,{name:name+' · 相邻目标',type:'Normal',element:'Imaginary',dhilSkill:name,
            terms:atk(per),toughness:perTough},1,'primary','direct');
        b.dhilAdjacent=false;
      },
      // 【亢心】原文为「丹恒•饮月施放每段攻击【后】获得 1 层」（121304 desc；Avatar_DanHengIL_00_Ability.json
      // 的 SetDynamicValue Flag_AttackCount 位于每个 DamageByAttackProperty 之后）。加层必须在本段伤害结算后，
      // 否则第 k 段会多吃 1 层（独立复核 F1）。段内去重键 = activeAction.sequence + segment，
      // 使一次攻击命中多个目标（扩散）时每段仍只加 1 层。
      afterHit(b,u,attacker,to,a,kind){
        if(attacker!==u||kind!=='direct'||b.dhilAdjacent)return;
        const name=a?.name;
        if(![N1,N2,N3,u.actions.basic.name,ULT].includes(name))return;
        const seq=b.activeAction?.sequence??0,seg=a.segment??1,key=seq+':'+seg;
        if(u.resources['亢心键']===key)return;
        resource(b,u,'亢心键',key);
        addHX(b,u);
        void to;
      },
      after(b,u,actor,key,kind,a,selected,hitTargets){
        const p=u.kit.params;
        // 终结技：获得 Ultra[2]=2 个逆鳞；E2 额外 +1 并行动提前 100%（E2 无数值参数，按星魂等级判断）。
        if(actor===u&&key==='ultimate'){
          setScale(b,u,scale(u)+p.Ultra[2]+(u.kit.eidolon>=2?1:0));
          if(u.kit.eidolon>=2)advance(b,u.id,1);
        }
        // E6：我方其他角色施放终结技后叠 1 层（上限 #2=3），下次盘拏耀跃消耗全部层数。
        if(rank(u,6)&&actor!==u&&actor.side===u.side&&key==='ultimate')
          resource(b,u,'E6层数',Math.min(u.kit.ranks[6][1],(u.resources['E6层数']??0)+1));
        if(actor===u&&a?.name===N3)resource(b,u,'E6层数',0);
        void selected;void hitTargets;void kind;
      },
      modifiers(b,u,actor,to,a,kind){
        const out={};
        if(actor!==u||to.side===u.side)return out;
        // 行迹「起蛰」：对拥有虚数属性弱点的敌方目标造成伤害时暴伤 +24%。
        if(trace(u,3)&&((to.weaknesses??[]).includes('Imaginary')||to.buffs.some(e=>e.weakness==='Imaginary')))
          out.critDmg=(out.critDmg??0)+trace(u,3)[0];
        // E6：下一次盘拏耀跃虚数抗性穿透 +20% × 层数。作用于整个技能，相邻段同样生效，
        // 因此用技能身份（dhilSkill，相邻包专用）而非被改写的显示名 a.name 匹配。
        const skillName=a?.dhilSkill??a?.name;
        if(rank(u,6)&&skillName===N3&&(u.resources['E6层数']??0)>0)
          out.resPen=(out.resPen??0)+rank(u,6,0)*(u.resources['E6层数']??0);
        void kind;
        return out;
      },
      display(b,u,to){
        if(to!==u)return [];
        return [{type:'buff',id:u.id+':dhil-scale',source:u.id,name:'逆鳞',key:'marker',
          value:scale(u),derived:true},
          {type:'buff',id:u.id+':dhil-hx-d',source:u.id,name:'亢心层数',key:'marker',
          value:u.buffs.find(e=>e.id===HX_ID(u))?.stacks??0,derived:true}];
      },
    };
  },

  // ══ 1312 米沙 ════════════════════════════════════════════════════════════
  // 战技「客…客房服务！」131202：#1 主目标 / #2 相邻 / #3=1 段增加下次终结技段数。
  // 终结技「要…要迟到了！」131203：#1=初始 3 段；首段指定单体、其余随机单体，每段 #2 倍率；
  //   每段攻击前 #3=20% 基础概率冻结 1 回合（冻结目标每回合开始受 #4=30% 攻击力附加伤害）；
  //   最多累计 #5=10 段，施放后恢复初始段数。
  // 天赋「擒纵机构」131204：我方每消耗 1 战技点 +1 段并回复 #1=2 点能量。
  // 行迹：释放（首段冻结基础概率 +80%）、锁接（终结期间效果命中 +60%）、传冲（对冻结目标暴伤 +30%）。
  // E1 场上每 1 个敌人 +1 段（上限 +5）；E2 每段 24% 基础概率降防 16% 3 回合；
  // E4 每段倍率 +6%；E6 终结后增伤 30% 至回合结束，下次战技后回 1 战技点。
  1312(api){
    const {live,allies,enemies,rank,trace,buff,resource,sp,energy,advance,damageTo,combatPanel,record}=api;
    const SEG='终结技段数',E6_TAG='mishaE6';
    const ULT=NM(1312,131203),SKILL=NM(1312,131202),E6_ID=u=>u.id+':misha-e6',E7_ID=u=>u.id+':misha-ehit';
    const freezeId=(u,to)=>u.id+':misha-freeze:'+to.id;
    const segOf=u=>u.resources[SEG]??u.kit.params.Ultra[0];
    const addSeg=(b,u,n)=>{
      if(!(n>0))return;
      const cap=u.kit.params.Ultra[4];
      resource(b,u,SEG,Math.min(cap,segOf(u)+n));
    };
    return {
      start(b,u){
        resource(b,u,SEG,u.kit.params.Ultra[0]);
        resource(b,u,'E6待触发',0);
      },
      // 秘技「停一停吧，你真美丽！」131207：领域使敌人停止行动；进入战斗后 #2=2 段增加下次终结技段数。
      entry(b,u){addSeg(b,u,u.kit.params.Maze[1]);},
      // 终结技段数动态：Ultra[0]=3 基础 + 累计 + E1（每敌人 +1，上限 +5），上限 Ultra[4]=10。
      // E4 每段倍率 +6%。
      prepare(b,u,key,kind,a){
        if(key!=='ultimate'||kind==='copy'||kind==='technique')return a;
        const p=u.kit.params;
        const e1=rank(u,1)?Math.min(u.kit.ranks[1][1],u.kit.ranks[1][0]*enemies(b,u).length):0;
        const n=Math.min(p.Ultra[4],segOf(u)+e1);
        const per=p.Ultra[1]+(rank(u,4)?u.kit.ranks[4][0]:0);
        const tough=n>0?S(1312,131203,0)/n:0;
        return {...a,terms:atk(per),hitShares:[1],toughness:tough,
          bounceCount:Math.max(0,n-1),bounceTerms:atk(per),bounceToughness:tough,bounceEnergy:0};
      },
      before(b,u,actor,key,kind,a,selected){
        if(actor.side!==u.side||kind==='copy')return;
        const p=u.kit.params;
        // 天赋「擒纵机构」：我方每消耗 1 个战技点 +Talent[1]=1 段并回复 Talent[0]=2 点能量。
        const cost=a?.spCost??0;
        if(cost>0){
          addSeg(b,u,cost*p.Talent[1]);
          energy(b,u,p.Talent[0]*cost);
        }
        // 行迹「锁接」：施放终结技时效果命中 +60%，持续至本次终结技行动结束。
        if(actor===u&&key==='ultimate'&&rank(u,6))buff(b,u,u,'米沙 E6 · 增伤','dmgBoost',rank(u,6,1),null,{id:E6_ID(u),tag:E6_TAG});
        if(actor===u&&key==='ultimate'&&trace(u,2))
          buff(b,u,u,'锁接 · 效果命中','effectHit',trace(u,2)[0],null,{id:E7_ID(u)});
        void selected;
      },
      // 每段攻击前的冻结与 E2 降防（用真段索引 a.segment；主段 1 + 弹射段 2..n）。
      hit(b,u,attacker,to,a,kind){
        if(attacker!==u||kind!=='direct'||a?.name!==ULT)return;
        const p=u.kit.params,seg=a.segment??1;
        const base=p.Ultra[2]+(seg===1&&trace(u,1)?trace(u,1)[0]:0);
        const c=base*(1+(combatPanel(u).effectHit??0))*(1-(combatPanel(to).effectRes??0));
        if(c>=1||b.random()<c)
          buff(b,u,to,'冻结','marker',0,1,
            {id:freezeId(u,to),tag:'mishaFreeze',control:'freeze',debuff:true,freezeMult:p.Ultra[3]});
        else record(b,'resist',to,{name:'要…要迟到了！ · 冻结被抵抗'});
        if(rank(u,2)){
          const c2=u.kit.ranks[2][2]*(1+(combatPanel(u).effectHit??0))*(1-(combatPanel(to).effectRes??0));
          if(c2>=1||b.random()<c2)
            buff(b,u,to,'米沙 E2 · 防御力降低','defShred',u.kit.ranks[2][0],u.kit.ranks[2][1],
              {id:u.id+':misha-e2',debuff:true});
          else record(b,'resist',to,{name:'米沙 E2 降防被抵抗'});
        }
      },
      after(b,u,actor,key,kind,a,selected,hitTargets){
        if(actor!==u)return;
        const p=u.kit.params;
        if(key==='ultimate'){
          // 施放后攻击段数恢复至初始状态（Ultra[0]=3）。
          resource(b,u,SEG,p.Ultra[0]);
          u.buffs=u.buffs.filter(e=>e.id!==E7_ID(u));
          // E6：增伤 30% 至自身回合结束；下一次施放战技后为我方恢复 1 个战技点。
          if(rank(u,6)){
            buff(b,u,u,'米沙 E6 · 增伤','dmgBoost',rank(u,6,1),null,{id:E6_ID(u),tag:E6_TAG});
            resource(b,u,'E6待触发',1);
          }
        }
        // 战技：增加 BPSkill[2]=1 段；E6 待触发时为我方恢复 1 个战技点。
        if(a?.name===SKILL){
          addSeg(b,u,p.BPSkill[2]);
          if(rank(u,6)&&(u.resources['E6待触发']??0)>0){
            resource(b,u,'E6待触发',0);
            sp(b,u,1,'米沙 E6');
          }
        }
        void selected;void hitTargets;void kind;
      },
      // 冻结目标的每回合附加伤害（Ultra[3]=30% 攻击力冰属性附加伤害）。
      turnStart(b,u,actor){
        if(actor.side===u.side)return;
        const f=actor.buffs.find(e=>e.id===freezeId(u,actor));
        if(!f)return;
        damageTo(b,u,actor,{name:'冻结 · 附加伤害',type:'Additional',element:'Ice',
          terms:atk(f.freezeMult??0),toughness:0},1,'primary','additional');
      },
      turnEnd(b,u,actor){
        if(actor!==u)return;
        u.buffs=u.buffs.filter(e=>e.tag!==E6_TAG);
      },
      modifiers(b,u,actor,to,a,kind){
        const out={};
        if(actor!==u||to.side===u.side)return out;
        // 行迹「传冲」：对陷入冻结状态的敌方目标造成伤害时暴伤 +30%。
        if(trace(u,3)&&to.buffs.some(e=>e.tag==='mishaFreeze'))out.critDmg=(out.critDmg??0)+trace(u,3)[0];
        void a;void kind;
        return out;
      },
      display(b,u,to){
        if(to!==u)return [];
        return [{type:'buff',id:u.id+':misha-seg',source:u.id,name:'下一次终结技段数',key:'marker',
          value:segOf(u),derived:true}];
      },
    };
  },

  // ══ 1109 虎克 ════════════════════════════════════════════════════════════
  // 战技「嘿！记得虎克吗」110902：#1 伤害、#2 灼烧基础概率、#3 持续回合、#4 灼烧倍率。
  // 终结技「轰！飞来焰火」110903：#1 伤害；施放后下一次战技强化为 110909（主 #1 + 相邻 #5）。
  // 天赋「哈！火上浇油」110904：攻击处于灼烧状态的敌方目标时追加 1 次 #1 攻击力火属性附加伤害，
  //   并额外恢复 #2 点能量（原始脚本 Skill01/02/21/03 的 STAT_DOT_Burn 分支 → PassiveSkill01_2）。
  // 行迹：童真（触发天赋时回复生命上限 5%）、无邪（控制类负面抗性 +35%）、玩火（终结后行动提前 20% 并回 5 能）。
  // E1 强化战技伤害 +20%；E2 灼烧持续 +1 回合；E4 天赋触发时相邻目标 100% 基础概率同享灼烧；
  // E6 对灼烧目标伤害 +20%。
  1109(api){
    const {live,enemies,rank,trace,buff,resource,energy,advance,dot,damageTo,record,heal}=api;
    const BURN='虎克 · 灼烧',ULT=NM(1109,110903),ENH=NM(1109,110909);
    const burnDur=u=>u.kit.params.BPSkill[2]+(rank(u,2)?u.kit.ranks[2][0]:0);
    // 原始脚本用 STAT_DOT_Burn 行为标记判定「灼烧」；本模块把任意火属性持续伤害（非击破持续伤害）视为灼烧。
    const burning=to=>to.dots.some(d=>d.hookBurn||(d.element==='Fire'&&!d.breakData));
    const applyBurn=(b,u,to,chance,mult)=>{
      if(!live(to))return null;
      return dot(b,u,to,{name:BURN,element:'Fire',terms:atk(mult),chance,duration:burnDur(u),extra:{hookBurn:true}});
    };
    // 天赋追加：等同虎克 #1 攻击力的火属性附加伤害 + #2 点能量 + 行迹「童真」治疗 + E4 相邻灼烧。
    function talent(b,u,to){
      const p=u.kit.params;
      damageTo(b,u,to,{name:'哈！火上浇油',type:'Additional',element:'Fire',
        terms:atk(p.Talent[0]),toughness:0},1,'primary','additional');
      energy(b,u,p.Talent[1]);
      if(trace(u,1))heal(b,u,u,combatPanelHp(u)*trace(u,1)[0]);
      if(rank(u,4))for(const adj of adjacentOf(b,u,to))applyBurn(b,u,adj,rank(u,4),p.BPSkill[3]);
      record(b,'mechanic',u,{name:'火上浇油',target:to.id});
    }
    const combatPanelHp=u=>api.combatPanel(u).hp;
    return {
      start(b,u){resource(b,u,'强化战技',0);},
      // 行迹「无邪」：抵抗控制类负面状态的概率 +35%（1109102）。
      panel(b,u,to,out){
        if(to===u&&trace(u,2))out.controlRes=1-(1-(out.controlRes??0))*(1-trace(u,2)[0]);
      },
      // 秘技「哎！瞧这一团糟」110907：对敌方随机单体造成 Maze[4]=50% 攻击力火伤，
      // 并以 Maze[1]=100% 基础概率使每个敌方单体陷入 Maze[2]=50% 攻击力灼烧，持续 Maze[3]=3 回合。
      entry(b,u){
        const p=u.kit.params,pool=enemies(b,u);
        if(pool.length){
          const to=pool[Math.floor(b.random()*pool.length)];
          damageTo(b,u,to,{name:'哎！瞧这一团糟',type:'Maze',element:'Fire',terms:atk(p.Maze[3]),
            toughness:S(1109,110907,0)},1,'primary','technique');
        }
        for(const to of enemies(b,u))dot(b,u,to,{name:BURN,element:'Fire',terms:atk(p.Maze[1]),
          chance:p.Maze[0],duration:p.Maze[2],extra:{hookBurn:true}});
      },
      // 终结技后下一次战技替换为强化战技 110909。
      prepare(b,u,key,kind,a){
        if(key!=='skill'||kind==='copy'||kind==='technique')return a;
        if(!(u.resources['强化战技']??0))return a;
        return {...u.actions.enhancedSkill,...(a?.targetId?{targetId:a.targetId}:{})};
      },
      after(b,u,actor,key,kind,a,selected,hitTargets){
        if(actor!==u)return;
        const p=u.kit.params;
        // 天赋：攻击处于灼烧状态的（主）目标时追加 1 次伤害（原始脚本每次技能只触发 1 次 PassiveSkill01_2）。
        const main=hitTargets.find(live);
        if(main&&burning(main))talent(b,u,main);
        // 战技 / 强化战技：施加灼烧（#2 基础概率、#4 倍率）。
        if(a?.name===NM(1109,110902))
          for(const to of selected.filter(live))applyBurn(b,u,to,p.BPSkill[1],p.BPSkill[3]);
        if(a?.enhanced)resource(b,u,'强化战技',0);
        if(key==='ultimate'){
          resource(b,u,'强化战技',1);
          // 行迹「玩火」：行动提前 #2=20% 并额外恢复 #1=5 点能量。
          if(trace(u,3)){advance(b,u.id,trace(u,3)[1]);energy(b,u,trace(u,3)[0]);}
        }
        void kind;
      },
      modifiers(b,u,actor,to,a,kind){
        const out={};
        if(actor!==u||to.side===u.side)return out;
        // E1：强化战技造成的伤害 +20%（两个技能同名，用 enhanced 标记区分）。
        if(rank(u,1)&&a?.enhanced)out.dmgBoost=(out.dmgBoost??0)+rank(u,1);
        // E6：对灼烧状态下的敌方目标造成的伤害 +20%。
        if(rank(u,6)&&burning(to))out.dmgBoost=(out.dmgBoost??0)+rank(u,6);
        void kind;
        return out;
      },
      display(b,u,to){
        if(to!==u)return [];
        return [{type:'buff',id:u.id+':hook-enh',source:u.id,name:'强化战技待触发',key:'marker',
          value:u.resources['强化战技']??0,derived:true}];
      },
    };
  },

  // ══ 1008 阿兰 ════════════════════════════════════════════════════════════
  // 战技「禁锢解除」100802：消耗 #1=15% 生命上限（不足时降至 1 点），造成 #2 攻击力雷伤，不消耗战技点。
  // 终结技「狂者制裁」100803：主 #1 + 相邻 #2（E6 在低血时相邻提高到主目标倍率）。
  // 天赋「至痛至怒」100804：按已损失生命值百分比使造成伤害提高，最多 #1=72%。
  // 行迹：苏生（击杀时若生命 ≤30% 回复 20% 生命上限）、坚忍（持续伤害类负面抗性 +50%）、
  //   抗御（开场生命 ≤50% 时抵抗除持续伤害外所有伤害，受到攻击后解除）。
  // E1 生命 ≤50% 时战技伤害 +10%；E2 战技 / 终结技解除自身 1 个负面；E4 致命伤害免于无法战斗并回复 25%
  //   生命上限（1 次 / #2=2 回合）；E6 生命 ≤50% 时终结技伤害 +20% 且相邻倍率提高到与主目标相同。
  1008(api){
    const {live,enemies,rank,trace,buff,resource,energy,damageTo,combatPanel,record,cleanseOne,heal}=api;
    const GUARD_ID=u=>u.id+':arlan-guard';
    const ULT=NM(1008,100803),SKILL=NM(1008,100802);
    const hpFrac=u=>{const p=combatPanel(u);return p.hp>0?u.hp/p.hp:0;};
    const guard=u=>(u.resources['抗御']??0)>0;
    return {
      start(b,u){
        resource(b,u,'抗御',0);
        resource(b,u,'E4已用',0);
        resource(b,u,'E4到期回合',0);
        // 行迹「抗御」：进入战斗时若生命值百分比 ≤50% 则抵抗除持续伤害外的所有伤害，受到攻击后解除。
        if(trace(u,3)&&hpFrac(u)<=trace(u,3)[0]+1e-9){
          resource(b,u,'抗御',1);
          buff(b,u,u,'抗御','dmgReduction',1,null,{id:GUARD_ID(u)});
          record(b,'mechanic',u,{name:'抗御 · 获得'});
        }
        // E4：进入战斗后受到致命攻击时不会无法战斗，并立即回复 25% 生命上限；1 次 / 2 回合。
        if(rank(u,4))resource(b,u,'E4到期回合',u.turns+(u.kit.ranks[4][1]??0));
      },
      // 行迹「坚忍」：抵抗持续伤害类负面状态的概率 +50%（1008102）。dot() 以 dotRes 折减命中率。
      panel(b,u,to,out){
        if(to===u&&trace(u,2))out.dotRes=1-(1-(out.dotRes??0))*(1-trace(u,2)[0]);
      },
      // 秘技「极速收割」100807：立即攻击敌人，对敌方全体造成 Maze #1=80% 攻击力雷伤。
      entry(b,u){
        const p=u.kit.params;
        for(const to of enemies(b,u))
          damageTo(b,u,to,{name:'极速收割',type:'Maze',element:'Thunder',terms:atk(p.Maze[0]),
            toughness:S(1008,100807,0)},1,'primary','technique');
      },
      // E6：生命值 ≤50% 时终结技相邻目标倍率提高到与主目标相同。
      prepare(b,u,key,kind,a){
        if(key!=='ultimate'||kind==='copy'||kind==='technique')return a;
        if(!rank(u,6)||hpFrac(u)>0.5)return a;
        const p=u.kit.params;
        return {...a,terms:[...atk(p.Ultra[0]),{...atk(p.Ultra[0])[0],target:'adjacent'}]};
      },
      // 战技在造成伤害前消耗生命（天赋伤害加成按消耗后的生命值计算）。
      before(b,u,actor,key,kind,a,selected){
        if(actor!==u||kind==='copy'||kind==='technique')return;
        if(key!=='skill')return;
        const p=u.kit.params,max=combatPanel(u).hp,loss=Math.min(Math.max(0,u.hp-1),max*p.BPSkill[0]);
        if(loss>1e-9){
          u.hp-=loss;b.rules.relics.healthConsumed(b,u);
          record(b,'hp_consume',u,{target:u.id,amount:loss,hp:u.hp,name:'禁锢解除'});
        }
        void a;void selected;
      },
      after(b,u,actor,key,kind,a,selected,hitTargets){
        if(actor!==u)return;
        // E2：施放战技、终结技时解除自身的 1 个负面效果（E2 无数值参数，按星魂等级判断）。
        if(u.kit.eidolon>=2&&(key==='skill'||key==='ultimate'))cleanseOne(b,u,u);
        void a;void selected;void hitTargets;void kind;
      },
      // 行迹「抗御」：持续伤害穿透（kind='dot' 时临时卸下减伤，结算后恢复）。
      hit(b,u,attacker,to,a,kind){
        if(to!==u||!guard(u))return;
        const g=u.buffs.find(e=>e.id===GUARD_ID(u));
        if(!g)return;
        if(kind==='dot')g.value=0;else g.value=1;
        void attacker;void a;
      },
      afterHit(b,u,attacker,to,a,kind){
        if(to!==u||!guard(u))return;
        const g=u.buffs.find(e=>e.id===GUARD_ID(u));
        if(g&&kind==='dot')g.value=1;
        void attacker;void a;
      },
      // 行迹「抗御」：受到攻击后解除。
      attacked(b,u,to){
        if(to!==u||!guard(u))return;
        resource(b,u,'抗御',0);
        u.buffs=u.buffs.filter(e=>e.id!==GUARD_ID(u));
        record(b,'mechanic',u,{name:'抗御 · 受到攻击后解除'});
      },
      // E4：致命伤害拦截并回复 25% 生命上限。
      beforeLethal(b,u,from,to,amount){
        if(to!==u||!rank(u,4))return false;
        if((u.resources['E4已用']??0)>0)return false;
        if(u.turns>(u.resources['E4到期回合']??0))return false;
        resource(b,u,'E4已用',1);
        // E4 说明为「立即回复至自身生命上限的 25%」，是恢复到该值而非在此之上追加治疗。
        u.hp=Math.max(u.hp,combatPanel(u).hp*rank(u,4,0));
        record(b,'heal',u,{target:u.id,amount:u.hp,hp:u.hp,name:'阿兰 E4 · 回复至生命上限 25%'});
        record(b,'mechanic',u,{name:'阿兰 E4 · 免于无法战斗',amount});
        void from;
        return true;
      },
      // 行迹「苏生」：消灭敌方目标时，若当前生命值百分比 ≤30% 则回复 20% 生命上限。
      death(b,u,from,to){
        if(to.side===u.side||from!==u||!trace(u,1))return;
        if(hpFrac(u)<=trace(u,1)[0]+1e-9)heal(b,u,u,combatPanel(u).hp*trace(u,1)[1]);
      },
      turnEnd(b,u){
        // E4 持续回合到期后自动解除。
        if((u.resources['E4已用']??0)>0&&u.turns>(u.resources['E4到期回合']??0))resource(b,u,'E4已用',2);
      },
      modifiers(b,u,actor,to,a,kind){
        const out={};
        if(actor!==u||to.side===u.side)return out;
        // 天赋「至痛至怒」：按已损失生命值百分比提高伤害，最多 Talent[0]=72%。
        out.dmgBoost=(out.dmgBoost??0)+u.kit.params.Talent[0]*(1-hpFrac(u));
        // E1：生命值 ≤50% 时战技伤害 +10%。
        if(rank(u,1)&&a?.name===SKILL&&hpFrac(u)<=0.5)out.dmgBoost=(out.dmgBoost??0)+rank(u,1);
        // E6：生命值 ≤50% 时终结技伤害 +20%。
        if(rank(u,6)&&a?.name===ULT&&hpFrac(u)<=0.5)out.dmgBoost=(out.dmgBoost??0)+rank(u,6);
        void kind;
        return out;
      },
      display(b,u,to){
        if(to!==u)return [];
        return [{type:'buff',id:u.id+':arlan-guard-d',source:u.id,name:'抗御',key:'marker',
          value:guard(u)?1:0,derived:true},
          {type:'buff',id:u.id+':arlan-talent-d',source:u.id,name:'至痛至怒增伤',
          key:'dmgBoost',value:u.kit.params.Talent[0]*(1-hpFrac(u)),derived:true}];
      },
    };
  },

  // ══ 1014 Saber ══════════════════════════════════════════════════════════
  // 天赋「龙之炉心」101404：#8=1 开场炉心共鸣；我方任意目标施放终结技时 Saber 伤害 +60%（#3）持续 2 回合
  //   并获得 #1=3 点炉心共鸣；每消耗 1 点炉心共鸣固定恢复 #5=8 点能量。
  //   原始脚本 Avatar_Saber_00_PassiveSkill01 OnStart[2] 将 DV_SurgePointMax 设为 99 → 炉心共鸣上限 = #7=99。
  // 战技「风王铁槌」101402：#1 主 / #2 相邻；若持有炉心共鸣且消耗后可为 Saber 回满能量，
  //   则本次战技倍率每点 + #4=14%（E2 再 +7%），攻击后消耗全部并回能；否则立即获得 #3=3 点。
  // 终结技「誓约胜利之剑」101403：全体 #1 + #3=10 次随机单体 #2；施放后下次普攻替换为【解放的金色王权】。
  // 行迹：龙之骑士（暴击率 +20%，开场与强化普攻获得【魔力放出】；满足条件时消耗它回 1 战技点并立即行动）、
  //   湖之祝福（溢出能量上限 120；开场能量不足 60% 则回复至 60%）、
  //   星之冠冕（战技后暴伤 +50% 2 回合；每获得 1 点炉心共鸣暴伤 +4%，上限 8 层）。
  // E1 终结技伤害 +60%、普攻 / 战技后 +1 炉心共鸣；E2 每获得 1 点炉心共鸣无视 1% 防御（上限 15 层）、
  //   战技倍率额外 +7%/点；E4 风抗穿 +8%，终结后 +4% 最多 3 层；E6 终结技风抗穿 +20%、
  //   开场首次终结后固定回 300 能（每再 3 次终结可再触发）。
  1014(api){
    const {live,allies,enemies,rank,trace,buff,resource,energy,advance,sp,damageTo,combatPanel,record}=api;
    const CORE='炉心共鸣',TAG_BAN='saberNoble',TAG_MANA='saberMana';
    const ULT=NM(1014,101403),ENH=NM(1014,101408);
    const MANA_ID=u=>u.id+':saber-mana';
    const CORE_ID=u=>u.id+':saber-core',E4_ID=u=>u.id+':saber-e4';
    const core=u=>u.resources[CORE]??0;
    const coreCap=u=>u.kit.params.Talent[6];
    const hasMana=u=>u.buffs.some(e=>e.tag===TAG_MANA&&e.id===MANA_ID(u));
    function gainCore(b,u,n){
      if(!(n>0))return;
      const before=core(u),next=Math.min(coreCap(u),before+n);
      if(next===before)return;
      resource(b,u,CORE,next);
      resource(b,u,'累计炉心共鸣',(u.resources['累计炉心共鸣']??0)+(next-before));
    }
    function manaBurst(b,u){
      if(!hasMana(u))return;
      u.buffs=u.buffs.filter(e=>e.id!==MANA_ID(u));
      sp(b,u,1,'Saber · 魔力放出');
      advance(b,u.id,1);
      record(b,'mechanic',u,{name:'魔力放出 · 回复战技点并立即行动'});
    }
    // 战技强化条件：持有炉心共鸣且消耗后可回满能量（= 当前能量 + 点数 × Talent[4] ≥ 能量上限）。
    const canFill=u=>core(u)>0&&u.energy+core(u)*u.kit.params.Talent[4]>=u.energyMax-1e-9;
    return {
      start(b,u){
        const p=u.kit.params;
        resource(b,u,CORE,0);
        resource(b,u,'累计炉心共鸣',0);
        resource(b,u,'终结次数',0);
        // 行迹「湖之祝福」：战斗开始时若能量不足 #3=60% 则回复至 #2=60%。
        if(trace(u,2)){const floor=u.energyMax*trace(u,2)[1];if(u.energy<floor)energy(b,u,floor-u.energy,true);}
        // 天赋：进入战斗时获得 #8=1 点炉心共鸣。
        gainCore(b,u,p.Talent[7]);
        // 行迹「龙之骑士」：进入战斗时获得【魔力放出】。
        if(trace(u,1))buff(b,u,u,'魔力放出','marker',0,null,{id:MANA_ID(u),tag:TAG_MANA});
      },
      // 秘技「骑士王的登场」101407：攻击力 +Maze[0]=35% 持续 Maze[1]=2 回合并获得 Maze[2]=2 点炉心共鸣。
      entry(b,u){
        const p=u.kit.params;
        buff(b,u,u,'骑士王的登场 · 攻击力','atkPct',p.Maze[0],p.Maze[1],
          {id:u.id+':saber-maze',tickOwner:u.id,tickAt:'start',countApplyTurn:true});
        gainCore(b,u,p.Maze[2]);
      },
      // 宝具：终结技后下一次普攻替换为【解放的金色王权】且仅能施放该普攻。
      shouldUseSkill(b,u){if(u.resources[TAG_BAN])return false;return undefined;},
      prepare(b,u,key,kind,a){
        if(kind==='copy'||kind==='technique')return a;
        if(key==='basic'&&u.resources[TAG_BAN])
          return {...u.actions.enhancedBasic,...(a?.targetId?{targetId:a.targetId}:{})};
        if(key!=='skill'||!canFill(u))return a;
        const p=u.kit.params,per=p.BPSkill[3]+(rank(u,2)?u.kit.ranks[2][0]:0),n=core(u);
        const add=per*n;
        const terms=(a?.terms??[]).map(t=>({...t,multiplier:t.multiplier+add}));
        return {...a,terms,saberConsume:n};
      },
      before(b,u,actor,key,kind,a,selected){
        if(actor!==u||kind==='copy'||kind==='technique')return;
        const p=u.kit.params;
        // 行迹「星之冠冕」：施放战技时暴伤 +50%，持续 #2=2 回合。
        if(key==='skill'&&trace(u,3))
          buff(b,u,u,'星之冠冕 · 暴击伤害','critDmg',trace(u,3)[0],trace(u,3)[1],{id:u.id+':saber-star'});
        // 炉心共鸣提高战技倍率的分支：攻击后消耗全部并为 Saber 恢复能量（每点 Talent[4]=8 点，固定）。
        if((a?.saberConsume??0)>0){
          const n=core(u);
          resource(b,u,CORE,0);
          energy(b,u,n*p.Talent[4],true);
          // 行迹「龙之骑士」：满足条件时消耗【魔力放出】为我方恢复 1 个战技点并使 Saber 立即行动。
          if(trace(u,1))manaBurst(b,u);
          record(b,'mechanic',u,{name:'风王铁槌 · 消耗炉心共鸣',amount:n});
        }
        void selected;
      },
      after(b,u,actor,key,kind,a,selected,hitTargets){
        const p=u.kit.params;
        // 天赋「龙之炉心」：我方任意目标施放终结技时 Saber 伤害 +60% 持续 2 回合，并获得 Talent[0]=3 点炉心共鸣
        //（用 after 监听行动者，覆盖不造成伤害的终结技）。
        if(actor!==u){
          if(actor.side===u.side&&key==='ultimate'&&kind!=='technique'){
            buff(b,u,u,'龙之炉心 · 增伤','dmgBoost',p.Talent[2],p.Talent[3],
              {id:u.id+':saber-talent',tickOwner:u.id,tickAt:'start',countApplyTurn:true});
            gainCore(b,u,p.Talent[0]);
          }
          return;
        }
        // 战技未触发消耗分支 → 立即获得 #3=3 点炉心共鸣。
        if(key==='skill'&&!(a?.saberConsume>0))gainCore(b,u,p.BPSkill[2]);
        // 终结技：全体 #1 + 10 次随机单体 #2；施放后下次普攻替换为【解放的金色王权】。
        if(key==='ultimate'){
          resource(b,u,TAG_BAN,1);
          resource(b,u,'终结次数',(u.resources['终结次数']??0)+1);
          // E4：终结后风属性抗性穿透 +4%，最多 3 层。
          if(rank(u,4)){
            const cur=u.buffs.find(e=>e.id===E4_ID(u))?.stacks??0;
            buff(b,u,u,'Saber E4 · 风抗穿','resPen',rank(u,4,1),null,
              {id:E4_ID(u),stacks:Math.min(u.kit.ranks[4][2],cur+1)});
          }
          // E6：进入战斗首次终结后固定恢复 300 点能量，每再施放 #2=3 次终结可触发 1 次。
          const n=u.resources['终结次数']??0;
          if(rank(u,6)&&(n-1)%(u.kit.ranks[6][1]||1)===0)energy(b,u,u.kit.ranks[6][2],true);
          // 行迹「湖之祝福」：施放终结技后清空积攒的溢出能量并恢复相应的能量值（上限 #1=120，E6 提高到 #4=200）。
          if(trace(u,2)){
            const cap=rank(u,6)?u.kit.ranks[6][3]:trace(u,2)[0];
            const stored=Math.min(cap,u.energyOverflow??0);
            if(stored>0){energy(b,u,stored,true);record(b,'mechanic',u,{name:'湖之祝福 · 取回溢出能量',amount:stored});}
            u.energyOverflow=0;
          }
        }
        // 解放的金色王权：获得 #2=2 点炉心共鸣并重新获得【魔力放出】；
        //   敌方数量为 2/1 时额外对敌方全体造成 #3=2.1% / #4=3.08% 攻击力伤害。
        if(a?.name===ENH){
          const row=rowFor(1014,101401,101408,u.kit.params.Normal[0]);
          gainCore(b,u,row[1]);
          if(trace(u,1))buff(b,u,u,'魔力放出','marker',0,null,{id:MANA_ID(u),tag:TAG_MANA});
          const n=enemies(b,u).length;
          if(n===2||n===1){
            const mult=n===2?row[2]:row[3];
            for(const to of enemies(b,u))
              damageTo(b,u,to,{name:'解放的金色王权 · 额外伤害',type:'Normal',element:'Wind',
                terms:atk(mult),toughness:0},1,'primary','direct');
          }
          resource(b,u,TAG_BAN,0);
        }
        // E1：施放普攻或战技后获得 #2=1 点炉心共鸣。
        if(rank(u,1)&&(key==='basic'||key==='skill')&&!(a?.saberConsume>0))gainCore(b,u,rank(u,1,1));
        void selected;void hitTargets;
      },
      panel(b,u,to,out){
        if(to!==u)return;
        // 行迹「龙之骑士」：暴击率 +20%。
        if(trace(u,1))out.critRate=(out.critRate??0)+trace(u,1)[0];
        // 行迹「星之冠冕」：本场战斗每获得 1 点炉心共鸣暴伤 +4%，最多 #4=8 层。
        if(trace(u,3))out.critDmg=(out.critDmg??0)+Math.min(trace(u,3)[3],u.resources?.['累计炉心共鸣']??0)*trace(u,3)[2];
      },
      modifiers(b,u,actor,to,a,kind){
        const out={};
        if(actor!==u||to.side===u.side)return out;
        // E1：终结技伤害 +60%。
        if(rank(u,1)&&a?.type==='Ultra')out.dmgBoost=(out.dmgBoost??0)+rank(u,1,0);
        // E2：本场战斗每获得 1 点炉心共鸣无视 1% 防御，最多 #3=15 层。
        if(rank(u,2))out.defIgnore=(out.defIgnore??0)+Math.min(u.kit.ranks[2][2],u.resources['累计炉心共鸣']??0)*u.kit.ranks[2][1];
        // E4：风属性抗性穿透 +8%，终结后每层再 +4%（最多 3 层）。
        if(rank(u,4)){
          const st=u.buffs.find(e=>e.id===E4_ID(u))?.stacks??0;
          out.resPen=(out.resPen??0)+rank(u,4,0)+st*rank(u,4,1);
        }
        // E6：终结技风属性抗性穿透 +20%。
        if(rank(u,6)&&a?.type==='Ultra')out.resPen=(out.resPen??0)+rank(u,6,0);
        void kind;
        return out;
      },
      display(b,u,to){
        if(to!==u)return [];
        return [{type:'buff',id:CORE_ID(u),source:u.id,name:'炉心共鸣',key:'marker',
          value:core(u),derived:true,note:'上限 '+coreCap(u)},
          {type:'buff',id:u.id+':saber-noble-d',source:u.id,name:'宝具待触发',key:'marker',
          value:u.resources[TAG_BAN]?1:0,derived:true},
          {type:'buff',id:u.id+':saber-mana-d',source:u.id,name:'魔力放出',key:'marker',
          value:hasMana(u)?1:0,derived:true}];
      },
    };
  },
};

export {factories,actions};
