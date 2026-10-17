// DeepSeek 独立角色批次 06：1107 克拉拉 / 1221 云璃 / 1214 雪衣 / 1205 刃
//
// 数据依据（固定 4.6 数据，未编造）：
//  · `_data_cache/hsr_core.json`（按 charId 过滤）：技能 desc 的 `#n` 与 `params[等级].param_list`、
//    行迹（type=3）、星魂 1~6。
//  · `simulator/roster-data.mjs` 的 ROSTER_DATA：分等级 param_list、stance（削韧）、spBase（回能）、
//    bpNeed / bpAdd（战技点）、hits（原始脚本 HitSplitRatio 摘录）。
//  · 原始脚本 `_data_cache/strict_research/Avatar_{Klara,Yunli,Xueyi,Ren}_00_Ability.json`：
//    触发事件（OnBeforeBeingAttacked / OnAfterBeingAttacked / OnAfterAttack / OnHPChange /
//    OnBeingStanceDamage / OnListenAfterSkillUse / OnListenTurnPhase2Begin）、真段数与循环次数，
//    以及以 FixedValue 写死的常量。
//  · 固定提交 312b4597691e0a29cf9828a15b592757dba86949。
//
// 段数换算（hitShares 必须与原始脚本真段数一致，引擎同时要求各段之和≈1）：
//  HitSplitRatio 是同一目标组内「每段的占比」，需配合 LoopExecuteTaskListWithInterval 的循环次数展开：
//   · 克拉拉 PassiveSkill01_InsertAbility：OnStart[20] 的强化 / 普通主目标节点互斥（各 1 段），
//     相邻节点只在强化形态存在（主目标的 50%，PostfixExpr FixedValue 2）。主目标真段数 = 1。
//   · 云璃 Skill03_NormalCounter / Counter_Phase02：主目标 + 相邻各 1 段（主目标真段数 1）。
//   · 云璃 Skill03_SuperCounter：OnStart[7] 循环 7 次（主目标 0.12 + 相邻 0.12），OnStart[8]/[9]
//     再各 1 次 0.16 → 主目标 7×0.12 + 0.16 = 1.00；OnStart[13] 循环 Ultra[3]（E1 +3）次额外伤害，
//     每次 0.72、随机单体，走 bounce。
//   · 刃 Passive1Atk02_Ability：OnStart[6] 循环 2 次（0.33）+ OnStart[8] 一次（0.34）→ 3 段。
//   · 刃 Skill11_Phase02（无间剑树）：主目标 2 段各 0.5；相邻节点 1 段（独立目标组）。
import {atk,basic,skill,ultimate,talentAction,elementOf} from '../actions.mjs';
import {ROSTER_DATA} from '../../roster-data.mjs';

export const IDS=[1107,1221,1214,1205];
// 秘技（Maze）的削韧同样取自固定 4.6 的 ROSTER_DATA 技能记录。
const mazeOf=id=>Object.values(ROSTER_DATA[id].skills).find(s=>s.type==='Maze');

// ── 原始脚本写死的常量（结构常量 / FixedValue，不是倍率）─────────────────────
// Avatar_Ren_00_PassiveSkill01：MWRen_Qi_MaxLayer = 5（ByRankActivated 命中后写 4）。
const REN_QI_MAX=[5,4];
// Avatar_Xueyi_00_Passive_AddCount：0 < 本次削韧 ≤ 30 → 1 层；> 30 → 削韧 / 30。
const STANCE_LAYER_UNIT=30;
// Avatar_Yunli_00_Skill03_SuperCounter OnStart[13]：额外伤害削韧 = 主目标削韧 × 0.25。
const YUNLI_EXTRA_STANCE_RATIO=.25;
// Avatar_Xueyi_00_Skill03_Phase02 OnStart[7]：目标当前韧性 ≥ 上限 50% 时终结技增伤（行迹 2 阈值）。
const XUEYI_ULT_STANCE_THRESHOLD=.5;

const stanceOf=(d,skillId,index)=>d.skills?.[String(skillId)]?.stance?.[index]??0;
// 强化普攻「无间剑树」是独立技能记录（120508）。compileRegisteredKit 只注入基础五技能，
// 因此按普攻等级把 120508 的同级 param_list 取出来（等级由 Normal[0] 与 120501 的等级表对齐）。
function enhancedNormalParams(d,p){
  const table=d.skills?.['120501']?.params??{};
  const level=Object.keys(table).find(k=>Math.abs((table[k].param_list?.[0]??NaN)-p.Normal[0])<1e-9)??'6';
  return d.skills?.['120508']?.params?.[level]?.param_list??d.skills['120508'].params['6'].param_list;
}

const actions={
  // ── 1107 克拉拉：普攻单体；战技全体；终结自身强化形态；天赋反击（强化形态 +Ultra[1]、相邻 50%）──
  1107:(p,d)=>({
    basic:basic(p,d,{terms:atk(p.Normal[0]),toughness:stanceOf(d,110701,0),hitShares:[1]}),
    skill:skill(p,d,{target:'all',terms:atk(p.BPSkill[0]),toughness:stanceOf(d,110702,1),hitShares:[1]}),
    ultimate:ultimate(p,d,{target:'self',terms:[],toughness:0,hitShares:[1]}),
    counter:talentAction(p,d,{target:'blast',terms:atk(p.Talent[1]),toughness:stanceOf(d,110704,0),
      adjacentToughness:stanceOf(d,110704,2),hitShares:[1],energyGain:d.skills['110704'].spBase??0,
      counter:true,counterKind:'talent'}),
  }),
  // ── 1221 云璃：普攻单体；战技扩散 + 治疗；终结【格挡】；天赋被攻击后反击；
  //    格挡中的反击替换为【勘破•灭】，格挡结束未反击则补【勘破•斩】──
  1221:(p,d,{eidolon=0}={})=>{
    const element=elementOf(d.element);
    const extraHits=p.Ultra[3]+(eidolon>=1?d.ranks[1][1]:0);
    const counterTerms=[{scaling:'atk',multiplier:p.Ultra[0]},{scaling:'atk',multiplier:p.Ultra[5],target:'adjacent'}];
    return {
      basic:basic(p,d,{terms:atk(p.Normal[0]),toughness:stanceOf(d,122101,0),hitShares:[1]}),
      skill:skill(p,d,{target:'blast',energyGain:d.skills['122102'].spBase??0,hitShares:[1],
        terms:[{scaling:'atk',multiplier:p.BPSkill[0]},{scaling:'atk',multiplier:p.BPSkill[1],target:'adjacent'}],
        toughness:stanceOf(d,122102,0),adjacentToughness:stanceOf(d,122102,2),
        effects:[{type:'heal',target:'self',scaling:'atk',multiplier:p.BPSkill[2],flat:p.BPSkill[3]}]}),
      // 终结技「消耗 #8 点能量」（4.6 说明原文），不是能量上限。
      ultimate:ultimate(p,d,{target:'self',terms:[],toughness:0,hitShares:[1],energyCost:p.Ultra[7]}),
      counter:talentAction(p,d,{target:'blast',energyGain:d.skills['122104'].spBase??0,hitShares:[1],
        terms:[{scaling:'atk',multiplier:p.Talent[0]},{scaling:'atk',multiplier:p.Talent[1],target:'adjacent'}],
        toughness:stanceOf(d,122104,0),adjacentToughness:stanceOf(d,122104,2),
        counter:true,counterKind:'talent'}),
      normalCounter:{name:'勘破•斩',type:'Ultra',element,target:'blast',terms:counterTerms,hitShares:[1],
        toughness:stanceOf(d,122103,0),adjacentToughness:stanceOf(d,122103,2),
        energyGain:d.skills['122103'].spBase??0,spCost:0,spGain:0,counter:true,counterKind:'normal'},
      superCounter:{name:'勘破•灭',type:'Ultra',element,target:'blast',hitShares:[.12,.12,.12,.12,.12,.12,.12,.16],
        terms:counterTerms,bounceCount:extraHits,bounceTerms:atk(p.Ultra[6]),
        bounceToughness:stanceOf(d,122103,0)*YUNLI_EXTRA_STANCE_RATIO,
        toughness:stanceOf(d,122103,0),adjacentToughness:stanceOf(d,122103,2),
        energyGain:d.skills['122103'].spBase??0,spCost:0,spGain:0,counter:true,counterKind:'super'},
    };
  },
  // ── 1214 雪衣：削韧转【恶报】叠层、满层追加攻击（3 次随机单体）、终结按本次削韧量增伤 ──
  1214:(p,d)=>({
    basic:basic(p,d,{terms:atk(p.Normal[0]),toughness:stanceOf(d,121401,0),hitShares:[.4,.6]}),
    skill:skill(p,d,{target:'blast',energyGain:d.skills['121402'].spBase??0,hitShares:[1],
      terms:[{scaling:'atk',multiplier:p.BPSkill[0]},{scaling:'atk',multiplier:p.BPSkill[1],target:'adjacent'}],
      toughness:stanceOf(d,121402,0),adjacentToughness:stanceOf(d,121402,2)}),
    ultimate:ultimate(p,d,{terms:atk(p.Ultra[0]),toughness:stanceOf(d,121403,0),hitShares:[1]}),
    // 天赋追加攻击：3 次伤害，每次对随机敌方单体造成 Talent[1] 倍攻击力（bounce 随机选靶）；
    // 主动作不带伤害项，避免多结算一段。
    followup:talentAction(p,d,{target:'single',terms:[],toughness:0,hitShares:[1],
      bounceCount:3,bounceTerms:atk(p.Talent[1]),bounceToughness:stanceOf(d,121404,0),
      energyGain:d.skills['121404'].spBase??0}),
  }),
  // ── 1205 刃：消耗生命、进入【地狱变】并把普攻强化为【无间剑树】、天赋【朔风】叠层追加攻击、
  //    终结把当前生命值转化为上限 50% 并按本场累计已损失生命结算 ──
  1205:(p,d)=>{
    const en=enhancedNormalParams(d,p),enh=d.skills['120508'];
    return {
      basic:basic(p,d,{terms:atk(p.Normal[0]),toughness:stanceOf(d,120501,0),hitShares:[.5,.5]}),
      skill:skill(p,d,{target:'self',terms:[],toughness:0,hitShares:[1],energyGain:0,
        effects:[{type:'hpConsume',target:'self',scaling:'hp',multiplier:p.BPSkill[0]}]}),
      ultimate:ultimate(p,d,{target:'blast',hitShares:[1],
        terms:[{scaling:'atk',multiplier:p.Ultra[0]},{scaling:'hp',multiplier:p.Ultra[1]},
          {scaling:'atk',multiplier:p.Ultra[2],target:'adjacent'},{scaling:'hp',multiplier:p.Ultra[3],target:'adjacent'}],
        toughness:stanceOf(d,120503,0),adjacentToughness:stanceOf(d,120503,2)}),
      enhancedBasic:{name:enh.name,type:'Normal',element:elementOf(d.element),target:'blast',
        terms:[{scaling:'atk',multiplier:en[1]},{scaling:'hp',multiplier:en[3]},
          {scaling:'atk',multiplier:en[2],target:'adjacent'},{scaling:'hp',multiplier:en[4],target:'adjacent'}],
        hitShares:[.5,.5],toughness:stanceOf(d,120508,0),adjacentToughness:stanceOf(d,120508,2),
        energyGain:enh.spBase??0,spCost:0,spGain:0,
        effects:[{type:'hpConsume',target:'self',scaling:'hp',multiplier:en[0]}]},
      followup:talentAction(p,d,{target:'all',energyGain:d.skills['120504'].spBase??0,
        terms:[{scaling:'atk',multiplier:p.Talent[1]},{scaling:'hp',multiplier:p.Talent[3]}],
        toughness:stanceOf(d,120504,1),hitShares:[.33,.33,.34]}),
    };
  },
};

const factories={
  // ══ 1107 克拉拉 ══════════════════════════════════════════════════════════
  // 天赋：被敌方攻击时给攻击者【反击标记】，标记持有者攻击结束后史瓦罗立即反击
  // （GlobalModifiers.MAvatar_Klara_00_PassiveATK_Mark.OnAfterAttack → TurnInsertAbility）。
  // 终结技：AggroAddedRatio +Ultra[0]、减伤 Ultra[3]、持续 Ultra[2] 回合；
  // 强化反击倍率 +Ultra[1]、相邻 50%、可生效 Ultra[4] 次（E6 +ranks[6][1]）。
  1107(api){
    const {live,enemies,rank,trace,buff,resource,cleanseOne,damageTo}=api;
    const REVENGE='klara:revenge',COUNT='klara:counter-mark';
    const has=(to,id)=>to.buffs.some(e=>e.id===id);
    const mark=(b,u,to,id,name)=>{if(!live(to)||to.side===u.side)return;
      buff(b,u,to,name,'marker',0,null,{id,debuff:true,tickOwner:to.id});};
    const drop=(to,id)=>{to.buffs=to.buffs.filter(e=>e.id!==id);};
    return {
      // 秘技「胜利的小小代价」：原始脚本 Avatar_Klara_SkillMazeInLevel 只有
      // MAvatar_Klara_00_MazeSkill_AggroUP（AggroAddedRatio）修饰器，没有独立伤害节点；
      // 「立即攻击敌人」按标准秘技攻击结算（普攻倍率 + 秘技技能记录的削韧）。
      entry(b,u){
        const p=u.kit.params,maze=mazeOf(1107);
        for(const to of enemies(b,u))damageTo(b,u,to,{name:'胜利的小小代价',type:'Maze',element:u.element,
          terms:atk(p.Normal[0]),toughness:maze.stance[0]},1,'primary','technique');
        buff(b,u,u,'胜利的小小代价 · 仇恨','marker',0,p.Maze[0],{id:u.id+':klara-maze',tag:'klaraMaze'});
      },
      start(b,u){
        resource(b,u,'强化反击次数',0);
        resource(b,u,'反击次数',0);
        // 天赋：受到敌方目标攻击的伤害降低 Talent[2]（MAvatar_Klara_00_Passive_DamageReduce）。
        buff(b,u,u,'史瓦罗的保护 · 减伤','dmgReduction',u.kit.params.Talent[2],null,{id:u.id+':klara-guard'});
      },
      prepare(b,u,key,kind,a){
        if(key!=='counter'||(u.resources['强化反击次数']??0)<=0)return a;
        const p=u.kit.params,main=p.Talent[1]+p.Ultra[1];
        return {...a,name:'史瓦罗的反击 · 强化',enhancedCounter:true,
          terms:[{scaling:'atk',multiplier:main},{scaling:'atk',multiplier:main*.5,target:'adjacent'}]};
      },
      attacked(b,u,to,from){
        if(!from||from.side===u.side)return;
        if(to===u){
          mark(b,u,from,REVENGE,'史瓦罗的反击标记');
          mark(b,u,from,COUNT,'史瓦罗的反击标记 · 触发');
          // 行迹「家人」：受到攻击时 35% 固定概率解除自身 1 个负面效果。
          if(trace(u,1)&&b.random()<trace(u,1)[0])cleanseOne(b,u,u);
          // E4：受到攻击后减伤，持续到自己的下个回合开始（Rank04 OnAfterBeingAttacked）。
          if(rank(u,4))buff(b,u,u,'克拉拉 E4 · 减伤','dmgReduction',rank(u,4),1,
            {id:u.id+':klara-e4',tickAt:'start',countApplyTurn:true});
        } else if(to.side===u.side&&rank(u,6)){
          // E6：我方其他目标遭到攻击后给攻击者上【反击标记】，并以 ranks[6][0] 固定概率触发反击。
          mark(b,u,from,REVENGE,'史瓦罗的反击标记');
          if(b.random()<rank(u,6,0))mark(b,u,from,COUNT,'史瓦罗的反击标记 · 触发');
        }
        // 标记持有者本次攻击结束后史瓦罗反击（标记被消耗）。
        if(has(from,COUNT)&&!b.queue.some(q=>q.actor===u.id&&q.key==='counter'&&q.targetId===from.id)){
          drop(from,COUNT);
          resource(b,u,'反击次数',(u.resources['反击次数']??0)+1);
          b.queue.push({actor:u.id,key:'counter',kind:'followup',targetId:from.id});
        }
      },
      after(b,u,actor,key,kind,a,selected,hits){
        void kind;void hits;
        if(actor!==u)return;
        if(key==='skill'){
          const p=u.kit.params;
          // 战技对被标上【反击标记】的敌方目标额外造成 BPSkill[1] 伤害（Skill02_Phase02
          // OnStart[3] PerProjectileDamage，无削韧）；E1 让战技后不清除标记。
          for(const to of enemies(b,u))if(has(to,REVENGE))
            damageTo(b,u,to,{name:'史瓦罗在看着你 · 反击标记',type:'BPSkill',element:u.element,
              terms:atk(p.BPSkill[1]),toughness:0},1,'primary','direct');
          // E1 的行迹参数为空数组，只能按星魂等级判断。
          if(u.kit.eidolon<1)for(const to of b.units)drop(to,REVENGE);
        }
        if(key==='counter'&&a.enhancedCounter)
          resource(b,u,'强化反击次数',Math.max(0,(u.resources['强化反击次数']??0)-1));
        if(key==='ultimate'){
          const p=u.kit.params;
          buff(b,u,u,'是约定不是命令 · 减伤','dmgReduction',p.Ultra[3],p.Ultra[2],{id:u.id+':klara-ult',tag:'klaraUlt'});
          resource(b,u,'强化反击次数',p.Ultra[4]+(rank(u,6)?u.kit.ranks[6][1]:0));
          if(rank(u,2))buff(b,u,u,'克拉拉 E2 · 攻击','atkPct',rank(u,2),u.kit.ranks[2][1],{id:u.id+':klara-e2'});
        }
        void selected;
      },
      turnEnd(b,u){
        // 强化反击次数随终结技的强化形态一起结束（PassiveATKCount 随 WarriorMode 销毁）。
        if(!u.buffs.some(e=>e.tag==='klaraUlt')&&(u.resources['强化反击次数']??0)>0)
          resource(b,u,'强化反击次数',0);
      },
      panel(b,u,to,out){
        if(to!==u)return;
        // 行迹「守护」：抵抗控制类负面状态的概率 +35%。
        if(trace(u,2))out.controlRes=1-(1-(out.controlRes??0))*(1-trace(u,2)[0]);
        // 终结技 AggroAddedRatio +Ultra[0]（加算仇恨比）。
        if(u.buffs.some(e=>e.tag==='klaraUlt'))out.aggroRatio=(out.aggroRatio??1)+u.kit.params.Ultra[0];
        // 秘技「胜利的小小代价」：AggroAddedRatio +Maze[1]，持续 Maze[0] 回合。
        if(u.buffs.some(e=>e.tag==='klaraMaze'))out.aggroRatio=(out.aggroRatio??1)+u.kit.params.Maze[1];
      },
      modifiers(b,u,actor,to,a,kind){
        if(actor!==u)return {};
        // 行迹「复仇」：史瓦罗的反击伤害 +30%（原始脚本 SkillTree03 只作用于该 Insert 攻击）。
        return kind==='followup'&&a.counterKind==='talent'?{dmgBoost:trace(u,3)?.[0]??0}:{};
      },
      display(b,u,to){
        if(to!==u)return [];
        return [{type:'buff',id:u.id+':klara-counter',source:u.id,name:'强化反击次数',key:'marker',
          value:u.resources['强化反击次数']??0,derived:true},
          {type:'buff',id:u.id+':klara-count',source:u.id,name:'本场反击次数',key:'marker',
          value:u.resources['反击次数']??0,derived:true}];
      },
    };
  },

  // ══ 1221 云璃 ════════════════════════════════════════════════════════════
  // 天赋：受到敌方目标攻击后额外回 Talent[2] 能并立即反击（无格挡 → Counter_Phase02，
  // 格挡中 → Skill03_SuperCounter 并移除格挡）。
  // 终结技：获得【格挡】并嘲讽敌方全体，持续至下一个回合结束；格挡期间未触发反击则结束时立即
  // 对随机敌方目标发动【勘破•斩】（Blocking.OnListenTurnPhase2Begin）。
  // E6：格挡期间敌方主动施放技能（无论是否攻击云璃）触发【勘破•灭】（OnListenAfterSkillUse）。
  1221(api){
    const {live,enemies,rank,trace,buff,resource,energy}=api;
    const BLOCK='yunli:block';
    const blocked=u=>u.buffs.some(e=>e.id===BLOCK);
    const randomEnemy=(b,u)=>{const pool=enemies(b,u);return pool.length?pool[Math.floor(b.random()*pool.length)]:null;};
    const clearBlock=(b,u)=>{
      u.buffs=u.buffs.filter(e=>e.id!==BLOCK&&!e.id.startsWith(u.id+':yunli-block'));
      for(const to of b.units)to.buffs=to.buffs.filter(e=>e.id!==u.id+':yunli-taunt:'+to.id);
    };
    return {
      // 秘技「后发先至」：获得【招架】；进入战斗后立即对随机敌方单体施放【勘破•灭】，
      // 并使本次攻击伤害提高 Maze[0]（原始脚本 MAvatar_Yunli_00_SkillMazeInLevel 对
      // CustomName=Yunli_Migiri_Damage 的 AllDamageTypeAddedRatio）。
      entry(b,u){
        const p=u.kit.params,pool=enemies(b,u);
        buff(b,u,u,'后发先至 · 增伤','dmgBoost',p.Maze[0],null,{id:u.id+':yunli-maze',tag:'yunliMaze'});
        const to=pool[Math.floor(b.random()*pool.length)];
        if(to)b.queue.push({actor:u.id,key:'superCounter',kind:'followup',targetId:to.id});
      },
      start(b,u){resource(b,u,'格挡到期',0);resource(b,u,'格挡已触发',0);resource(b,u,'灼毂',0);resource(b,u,'反击次数',0);},
      before(b,u,actor,key,kind,a){
        void key;void kind;
        // E6：格挡期间敌方主动施放技能时触发【勘破•灭】并移除【格挡】。
        if(actor!==u&&actor.side!==u.side&&rank(u,6)&&blocked(u)&&(a.type??'')==='BPSkill'){
          resource(b,u,'格挡已触发',1);
          clearBlock(b,u);
          b.queue.push({actor:u.id,key:'superCounter',kind:'followup',targetId:actor.id});
          return;
        }
        // 行迹「真刚」：施放反击时云璃攻击力 +30%，持续 1 回合（作用在本次反击伤害之前）。
        if(actor===u&&a.counter&&trace(u,3))
          buff(b,u,u,'真刚','atkPct',trace(u,3)[0],1,{id:u.id+':yunli-zhengang',tickAt:'start',countApplyTurn:true});
      },
      attacked(b,u,to,from){
        if(to!==u||!from||from.side===u.side)return;
        // 天赋：受到敌方目标攻击后额外恢复 Talent[2] 点能量（ModifySPNew，无条件）。
        energy(b,u,u.kit.params.Talent[2]);
        resource(b,u,'反击次数',(u.resources['反击次数']??0)+1);
        const target=live(from)?from.id:randomEnemy(b,u)?.id;
        if(!blocked(u)){
          if(target)b.queue.push({actor:u.id,key:'counter',kind:'followup',targetId:target});
          return;
        }
        // 格挡期间：反击被替换为【勘破•灭】并移除【格挡】（Blocking.OnAfterBeingAttacked）。
        resource(b,u,'格挡已触发',1);
        clearBlock(b,u);
        if(target)b.queue.push({actor:u.id,key:'superCounter',kind:'followup',targetId:target});
      },
      after(b,u,actor,key,kind,a,selected,hits){
        void kind;void selected;void hits;
        if(actor!==u)return;
        if(key==='ultimate'){
          const p=u.kit.params;
          resource(b,u,'格挡到期',b.turns+1);
          resource(b,u,'格挡已触发',0);
          buff(b,u,u,'格挡','marker',0,null,{id:BLOCK,tag:'yunliBlock'});
          buff(b,u,u,'格挡 · 减伤','dmgReduction',trace(u,2)?.[0]??0,null,{id:u.id+':yunli-block-dr'});
          resource(b,u,'下次反击暴伤',p.Ultra[1]);
          for(const to of enemies(b,u))buff(b,u,to,'格挡 · 嘲讽','marker',0,null,
            {id:u.id+':yunli-taunt:'+to.id,debuff:true,control:'taunt',removeOnSourceDeath:true});
        }
        if(a.counter){
          resource(b,u,'下次反击暴伤',0);
          // 秘技「后发先至」的增伤只作用于本次秘技的【勘破•灭】。
          if(u.buffs.some(e=>e.tag==='yunliMaze'))u.buffs=u.buffs.filter(e=>e.tag!=='yunliMaze');
          // E4：发动【勘破•斩】或【勘破•灭】后效果抵抗 +ranks[4][0]，持续 ranks[4][1] 回合。
          if(rank(u,4)&&(a.counterKind==='normal'||a.counterKind==='super'))
            buff(b,u,u,'云璃 E4 · 效果抵抗','effectRes',rank(u,4),u.kit.ranks[4][1],{id:u.id+':yunli-e4'});
          // 行迹「灼毂」：每发动 1 次【勘破•斩】后，下一次【勘破•斩】替换为【勘破•灭】。
          if(trace(u,1)&&a.counterKind==='normal')resource(b,u,'灼毂',1);
        }
      },
      turnEnd(b,u){
        if(!blocked(u))return;
        if(b.turns<(u.resources['格挡到期']??0))return;
        const triggered=(u.resources['格挡已触发']??0)>0;
        clearBlock(b,u);
        if(triggered)return;
        // 格挡结束时没有触发反击：立即对随机敌方目标发动【勘破•斩】
        // （行迹「灼毂」已就绪时替换为【勘破•灭】）。
        const to=randomEnemy(b,u);if(!to)return;
        const ready=trace(u,1)&&(u.resources['灼毂']??0)>0;
        if(ready)resource(b,u,'灼毂',0);
        if(!b.queue.some(q=>q.actor===u.id&&['normalCounter','superCounter'].includes(q.key)))
          b.queue.push({actor:u.id,key:ready?'superCounter':'normalCounter',kind:'followup',targetId:to.id});
      },
      panel(b,u,to,out){
        if(to!==u||!blocked(u))return;
        // 【格挡】使敌方全体陷入嘲讽：引擎没有 taunt 字段，按仇恨比建模（敌身上另挂嘲讽标记）。
        out.aggroRatio=(out.aggroRatio??1)*10;
        // 行迹「却邪」：【格挡】状态下抵抗控制类负面效果（+20% 控制抵抗）。
        if(trace(u,2))out.controlRes=1-(1-(out.controlRes??0))*(1-trace(u,2)[0]);
      },
      modifiers(b,u,actor,to,a,kind){
        void to;void kind;
        if(actor!==u||!a.counter)return {};
        const out={};
        // 终结技：下一次反击暴击伤害 +Ultra[1]（Blocking_CritDamage，命中后消耗）。
        if(u.resources['下次反击暴伤'])out.critDmg=u.resources['下次反击暴伤'];
        // E2：发动反击造成伤害时无视敌方目标 ranks[2][0] 的防御力。
        if(rank(u,2))out.defIgnore=rank(u,2);
        // E1：【勘破•斩】与【勘破•灭】造成的伤害提高 ranks[1][0]。
        if(rank(u,1)&&(a.counterKind==='normal'||a.counterKind==='super'))out.dmgBoost=rank(u,1);
        // E6：【勘破•斩】/【勘破•灭】暴击率 +ranks[6][0]、物理抗性穿透 +ranks[6][1]。
        if(rank(u,6)&&(a.counterKind==='normal'||a.counterKind==='super')){
          out.critRate=(out.critRate??0)+rank(u,6,0);out.resPen=(out.resPen??0)+rank(u,6,1);
        }
        return out;
      },
      display(b,u,to){
        if(to!==u)return [];
        return [{type:'buff',id:u.id+':yunli-blocking',source:u.id,name:'格挡',key:'marker',
          value:blocked(u)?1:0,derived:true},
          {type:'buff',id:u.id+':yunli-counters',source:u.id,name:'本场反击次数',key:'marker',
          value:u.resources['反击次数']??0,derived:true}];
      },
    };
  },

  // ══ 1214 雪衣 ════════════════════════════════════════════════════════════
  // 天赋「十王圣断，业报恒常」：主动削减韧性按 30 点换 1 层【恶报】（0 < 削韧 ≤ 30 记 1 层；
  // > 30 记 削韧 / 30），队友削减韧性记 Talent[2] 层；满 Talent[0] 层（E6 ranks[6][0]）立即追加攻击
  // 3 次随机单体 Talent[1] 倍伤害并清空层数；行迹「伺观中枢」把溢出层数（上限 trace3）在追加攻击后返还。
  // 终结技「天罚贯身」：无视弱点削韧，按本次削韧（每 30 点 1 份）提高 Ultra[1] 倍伤害，上限 Ultra[2]。
  1214(api){
    const {live,enemies,rank,trace,buff,resource,heal,combatPanel,damageTo}=api;
    const weakId=u=>u.id+':xueyi-weak';
    const cap=u=>u.kit.eidolon>=6?u.kit.ranks[6][0]:u.kit.params.Talent[0];
    const overflowCap=u=>trace(u,3)?.[0]??0;
    const trigger=(b,u)=>{
      resource(b,u,'恶报',0);
      if(!b.queue.some(q=>q.actor===u.id&&q.key==='followup'))
        b.queue.push({actor:u.id,key:'followup',kind:'followup'});
    };
    const gain=(b,u,n)=>{
      if(!(n>0))return;
      const max=cap(u),cur=u.resources['恶报']??0,add=Math.min(Math.max(0,max-cur),n),spare=n-add;
      resource(b,u,'恶报',cur+add);
      if(spare>0)resource(b,u,'恶报溢出',Math.min(overflowCap(u),(u.resources['恶报溢出']??0)+spare));
      if((u.resources['恶报']??0)>=max)trigger(b,u);
    };
    return {
      // 秘技「斩立决」：对敌方全体造成 Maze[0] 倍量子伤害（原始脚本 StageAbility_Maze_Xueyi_Modifier
      // 的 AttackData 削韧 = 秘技技能记录的 stance），并按削减的韧性叠加【恶报】。
      entry(b,u){
        const p=u.kit.params,maze=mazeOf(1214),pool=enemies(b,u);
        const snap=pool.map(t=>[t.id,t.toughness??0]);
        for(const to of pool)damageTo(b,u,to,{name:'斩立决',type:'Maze',element:u.element,
          terms:atk(p.Maze[0]),toughness:maze.stance[0]},1,'primary','technique');
        let total=0;
        for(const [id,t0] of snap){const t=b.units.find(x=>x.id===id);if(t)total+=Math.max(0,t0-(t.toughness??0));}
        if(total>0)gain(b,u,Math.max(1,Math.floor(total/STANCE_LAYER_UNIT)));
      },
      start(b,u){resource(b,u,'恶报',0);resource(b,u,'恶报溢出',0);resource(b,u,'终结增伤',0);},
      before(b,u,actor,key,kind,a,selected){
        if(actor===u&&key==='ultimate'){
          // E4：施放终结技时击破特攻 +ranks[4][0]，持续 ranks[4][1] 回合
          // （原始脚本 Skill03_Phase02 OnStart[3] AddModifier，在伤害之前生效）。
          if(rank(u,4))buff(b,u,u,'雪衣 E4 · 击破特攻','breakEffect',rank(u,4),u.kit.ranks[4][1],{id:u.id+':xueyi-e4'});
          // 终结技无视弱点属性削减韧性：原始脚本 AddAttackRatio.OnBeforeHit 的 ForceStanceDamage；
          // 这里以「本次攻击临时视为命中量子弱点」建模，after 移除。
          const to=selected?.[0];
          if(to&&live(to)&&!to.broken&&(to.toughnessMax??0)>0){
            buff(b,u,to,'天罚贯身 · 量子弱点','marker',0,1,{id:weakId(u),weakness:'Quantum'});
            const eff=1+(combatPanel(u).breakEfficiency??0);
            const reduced=Math.min(to.toughness??0,(a.toughness??0)*eff);
            const units=reduced<=0?0:(reduced<=STANCE_LAYER_UNIT?1:reduced/STANCE_LAYER_UNIT);
            resource(b,u,'终结增伤',Math.min(u.kit.params.Ultra[2],u.kit.params.Ultra[1]*units));
          } else resource(b,u,'终结增伤',0);
        }
        // E2 的追加攻击无视弱点削韧：本次追加攻击期间给敌方全体挂量子弱点标记，after 移除。
        if(actor===u&&key==='followup'&&rank(u,2)){
          for(const to of enemies(b,u))buff(b,u,to,'雪衣 E2 · 量子弱点','marker',0,1,{id:weakId(u),weakness:'Quantum'});
          heal(b,u,u,combatPanel(u).hp*rank(u,2));
        }
        // 记录动作前的敌方韧性，动作结束后按实际削减量换算【恶报】。
        // 天赋自己的追加攻击不叠层（原始脚本 Is_Insert <= 0 判定）。
        if(actor.side===u.side&&(actor!==u||kind!=='followup')){
          u._xueyiStance=b.units.filter(t=>t.side!==u.side&&live(t)).map(t=>[t.id,t.toughness??0]);
          u._xueyiActor=actor.id;
        }
      },
      after(b,u,actor,key,kind,a,selected,hits){
        void kind;void a;void selected;void hits;
        if(actor===u)for(const to of b.units)to.buffs=to.buffs.filter(e=>e.id!==weakId(u));
        if(actor===u&&key==='followup'){
          // 行迹「伺观中枢」：追加攻击后获得相应溢出层数的【恶报】。
          const spare=u.resources['恶报溢出']??0;
          if(spare>0){resource(b,u,'恶报溢出',0);gain(b,u,spare);}
        }
        if(!u._xueyiStance)return;
        const snap=u._xueyiStance,by=u._xueyiActor;u._xueyiStance=null;
        let total=0;
        for(const [id,t0] of snap){const t=b.units.find(x=>x.id===id);if(!t)continue;total+=Math.max(0,t0-(t.toughness??0));}
        if(total<=0)return;
        // 雪衣自己：0 < 削韧 ≤ 30 → 1 层；> 30 → 削韧 / 30；队友：Talent[2] 层。
        gain(b,u,by===u.id?Math.max(1,Math.floor(total/STANCE_LAYER_UNIT)):u.kit.params.Talent[2]);
      },
      modifiers(b,u,actor,to,a,kind){
        if(actor!==u)return {};
        const out={};
        // 行迹「预兆机杼」：造成的伤害提高 = 击破特攻 × trace1[0]，上限 trace1[1]。
        if(trace(u,1))out.dmgBoost=(out.dmgBoost??0)+Math.min(trace(u,1)[1],(combatPanel(u).breakEffect??0)*trace(u,1)[0]);
        if(a.type==='Ultra'){
          // 终结技：按本次削韧换算的增伤 + 行迹「摧锋轴承」的韧性比例判定。
          out.dmgBoost=(out.dmgBoost??0)+(u.resources['终结增伤']??0);
          if(trace(u,2)&&(to.toughness??0)>=XUEYI_ULT_STANCE_THRESHOLD*(to.toughnessMax??0))
            out.dmgBoost=(out.dmgBoost??0)+trace(u,2)[1];
        }
        // E1：天赋的追加攻击伤害 +ranks[1][0]（原始脚本按 AttackType=Insert 生效）。
        if(kind==='followup')out.dmgBoost=(out.dmgBoost??0)+rank(u,1);
        return out;
      },
      display(b,u,to){
        if(to!==u)return [];
        return [{type:'buff',id:u.id+':xueyi-layer',source:u.id,name:'恶报',key:'marker',
          value:u.resources['恶报']??0,derived:true},
          {type:'buff',id:u.id+':xueyi-overflow',source:u.id,name:'恶报（溢出）',key:'marker',
          value:u.resources['恶报溢出']??0,derived:true}];
      },
    };
  },

  // ══ 1205 刃 ══════════════════════════════════════════════════════════════
  // 天赋「倏忽恩赐」：受到伤害或消耗生命值时 +1 层充能（每次受到攻击最多 +1），上限 5 层
  // （E6 4 层）；满层立即对敌方全体追加攻击（Talent[1] 攻击力 + Talent[3] 生命上限，3 段）
  // 并回复 Talent[2] 生命上限，施放后消耗全部充能。
  // 战技「地狱变」：消耗 BPSkill[0] 生命上限、伤害 +BPSkill[3]、持续 BPSkill[1] 回合，
  // 普攻强化为【无间剑树】，无法施放战技、不回能、施放后本回合不结束（TurnInsertAction）。
  // 终结技「大辟万死」：把当前生命值转化为上限 50%，按本场累计已损失生命（上限 Ultra[6] 倍上限）结算，
  // 施放后清空累计（E1 主目标额外 +ranks[1][0] 倍累计已损失生命）。
  1205(api){
    const {live,enemies,rank,trace,buff,stacks,resource,heal,combatPanel,record,damageTo}=api;
    const inHell=u=>u.buffs.some(e=>e.tag==='renHell');
    const maxCharge=u=>u.kit.eidolon>=6?REN_QI_MAX[1]:REN_QI_MAX[0];
    const addLost=(b,u,amount)=>{
      if(!(amount>0))return;
      const capValue=u.kit.params.Ultra[6]*combatPanel(u).hp;
      resource(b,u,'累计已损失生命值',Math.min(capValue,(u.resources['累计已损失生命值']??0)+amount));
    };
    const addCharge=(b,u,n)=>{
      if(!live(u))return;
      const cap=maxCharge(u),cur=u.resources['充能']??0;
      if(cur>=cap)return;
      const next=Math.min(cap,cur+n);
      resource(b,u,'充能',next);
      if(next>=cap&&!b.queue.some(q=>q.actor===u.id&&q.key==='followup'))
        b.queue.push({actor:u.id,key:'followup',kind:'followup'});
    };
    // E4：当前生命值百分比从 >50% 降低到 ≤50% 时生命上限 +ranks[4][0]，最多 ranks[4][1] 层。
    const e4=(b,u,prevHp)=>{
      if(!rank(u,4))return;
      if(prevHp<=combatPanel(u).hp*.5+1e-9)return;
      if(u.hp>combatPanel(u).hp*.5+1e-9)return;
      stacks(b,u,u,'刃 E4 · 生命上限','hpPct',rank(u,4,0),rank(u,4,1),null,{id:u.id+':ren-e4'});
    };
    const consumeLedger=(b,u)=>{
      const from=u._renLogStart??b.log.length;let amount=0;
      for(let i=from;i<b.log.length;i++){const e=b.log[i];if(e.type==='hp_consume'&&e.target===u.id)amount+=e.amount??0;}
      if(amount>0){addLost(b,u,amount);addCharge(b,u,1);}
    };
    return {
      // 秘技「业途风」：消耗等同于生命上限 Maze[1] 的生命值（不足则降到 1 点），
      // 对敌方全体造成等同于生命上限 Maze[0] 的风属性伤害（原始脚本 MazeSkill_AOE，ByMaxHP）。
      entry(b,u){
        const p=u.kit.params,maze=mazeOf(1205),max=combatPanel(u).hp;
        const lost=Math.min(Math.max(0,u.hp-1),max*p.Maze[1]);
        if(lost>0){u.hp-=lost;addLost(b,u,lost);addCharge(b,u,1);record(b,'hp_consume',u,{target:u.id,amount:lost,hp:u.hp,name:'业途风'});}
        for(const to of enemies(b,u))damageTo(b,u,to,{name:'业途风',type:'Maze',element:u.element,
          terms:[{scaling:'hp',multiplier:p.Maze[0]}],toughness:maze.stance[0]},1,'primary','technique');
      },
      start(b,u){
        resource(b,u,'充能',0);
        resource(b,u,'充能上限',maxCharge(u));
        resource(b,u,'累计已损失生命值',0);
      },
      shouldUseSkill(b,u){return !inHell(u);},
      prepare(b,u,key,kind,a){
        void kind;
        // 【地狱变】期间普攻强化为【无间剑树】（原始脚本用独立的 Normal 技能记录）。
        if(key==='basic'&&inHell(u))return {...u.actions.enhancedBasic,targetId:a.targetId};
        if(key==='followup'&&rank(u,6))
          return {...a,terms:[...a.terms,{scaling:'hp',multiplier:rank(u,6,0)}]};
        if(key==='ultimate'){
          const max=combatPanel(u).hp;
          // 终结技先「把当前生命值转化为生命上限 50%」（before 内结算），该次消耗同样计入累计已损失生命；
          // prepare 必须无副作用，所以在这里用同一公式预推转化后的累计值。
          const convLoss=Math.max(0,u.hp-max*.5);
          const lost=Math.min(u.kit.params.Ultra[6]*max,(u.resources['累计已损失生命值']??0)+convLoss);
          if(!(lost>0))return a;
          const ratio=lost/max,terms=[...a.terms,
            {scaling:'hp',multiplier:u.kit.params.Ultra[4]*ratio},
            {scaling:'hp',multiplier:u.kit.params.Ultra[5]*ratio,target:'adjacent'}];
          if(rank(u,1))terms.push({scaling:'hp',multiplier:rank(u,1,0)*ratio});
          return {...a,terms};
        }
        return a;
      },
      before(b,u,actor,key,kind,a){
        void kind;void a;
        if(actor!==u)return;
        u._renLogStart=b.log.length;
        if(key!=='ultimate')return;
        // 大辟万死：把当前生命值转化为生命上限的 50%（OnStart[5..7] SetHP）。
        const max=combatPanel(u).hp,target=max*.5,old=u.hp;
        u.hp=Math.min(max,Math.max(1,target));
        if(u.hp<old){addLost(b,u,old-u.hp);addCharge(b,u,1);e4(b,u,old);}
      },
      after(b,u,actor,key,kind,a,selected,hits){
        void kind;void a;void selected;
        if(actor!==u)return;
        if(key==='skill'){
          const p=u.kit.params;
          buff(b,u,u,'地狱变','marker',0,p.BPSkill[1],{id:u.id+':ren-hell',tag:'renHell'});
          // 「施放该战技后，本回合不会结束」（原始脚本 Skill02_Phase02 OnStart[6] TurnInsertAction）：
          // 以不重置行动条的额外回合结算，动作按强化普攻处理。
          if(!b.queue.some(q=>q.actor===u.id&&q.kind==='extra'))
            b.queue.push({actor:u.id,key:'basic',kind:'extra'});
        }
        if(key==='followup'){
          // 施放追加攻击后消耗所有充能，并回复 Talent[2] 生命上限。
          resource(b,u,'充能',0);
          heal(b,u,u,combatPanel(u).hp*u.kit.params.Talent[2]);
        }
        // 消耗生命值（applyEffects 的 hpConsume 事件）→ 充能 + 累计已损失生命。
        consumeLedger(b,u);
        // 行迹「吞忍百死」：施放【无间剑树】后击中处于弱点击破状态的敌方目标则回复生命。
        if(key==='basic'&&a?.name===u.actions.enhancedBasic.name&&hits.some(t=>t.broken)&&trace(u,2))
          heal(b,u,u,combatPanel(u).hp*trace(u,2)[0]+trace(u,2)[1]);
        if(key==='ultimate')resource(b,u,'累计已损失生命值',0);
      },
      afterDamage(b,u,from,to,kind){
        void from;void kind;
        if(to!==u)return;
        const e=b.log[b.log.length-1];
        if(e&&e.type==='damage'&&e.target===u.id&&(e.hpDamage??0)>0){
          const prev=e.hp+e.hpDamage;
          addLost(b,u,e.hpDamage);
          e4(b,u,prev);
        }
        // 每次受到攻击最多 +1 层：同一动作内的多段伤害只记 1 层。
        const key=(b.activeAction?.sequence??'turn'+b.turns)+':'+(b.activeAction?.actor??'');
        if(u.resources['充能去重']===key)return;
        resource(b,u,'充能去重',key);
        addCharge(b,u,1);
      },
      modifiers(b,u,actor,to,a,kind){
        void to;
        if(actor!==u)return {};
        const out={};
        if(inHell(u)){
          out.dmgBoost=u.kit.params.BPSkill[3];
          if(rank(u,2))out.critRate=rank(u,2);
        }
        // 行迹「坏劫隳亡」：天赋追加攻击伤害 +trace[0]。
        if(kind==='followup'&&trace(u,3))out.dmgBoost=(out.dmgBoost??0)+trace(u,3)[0];
        void a;
        return out;
      },
      panel(b,u,to,out){
        // 行迹「无尽形寿」：当前生命值 ≤50% 时受到治疗的回复量 +20%。
        if(to===u&&trace(u,1)&&u.hp/out.hp<=.5)out.incomingHeal=(out.incomingHeal??0)+trace(u,1)[0];
      },
      display(b,u,to){
        if(to!==u)return [];
        return [{type:'buff',id:u.id+':ren-charge',source:u.id,name:'充能',key:'marker',
          value:u.resources['充能']??0,derived:true},
          {type:'buff',id:u.id+':ren-lost',source:u.id,name:'累计已损失生命值',key:'marker',
          value:u.resources['累计已损失生命值']??0,derived:true}];
      },
    };
  },
};

export {factories,actions};
