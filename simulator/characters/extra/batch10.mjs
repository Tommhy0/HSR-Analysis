// DeepSeek batch-10：6 名角色（4.6 固定数据）。
//
// 数值索引逐条核对 `_data_cache/hsr_core.json` 的 desc `#n` 与 `params[等级].param_list`；
// 段数 / 时序 / 概率 / 触发窗口取自 `_data_cache/strict_research/`（roster-evidence 已登记 sha256）：
//   1208 符玄       Avatar_FuXuan_00_Ability.json       （Skill01_Phase02 / Skill02_Phase02 HitDamageSplit /
//                                                        Skill03_Phase02 分支 / PassiveSkill01 ExChangeHP）
//   1304 砂金       Avatar_Aventurine_00_Ability.json   （Skill02_Phase02 护盾 / Skill03_Phase02 盲注+惊惶 /
//                                                        PassiveSkill01_InsertAbilityPhase02 循环 7(+E4 3) 段）
//   1206 素裳       Avatar_Sushang_00_Ability.json      （Skill02_Phase02 0.3/0.7 两段 + Pursued 剑势节点）
//   1220 飞霄       Avatar_Feixiao_00_Ability.json      （Skill01 HitSplitRatio 0.2/0.2/0.6、Skill02 0.34+0.33×2、
//                                                        Skill03_ComboFinish/Finish、Insert_Phase02）
//   1224 三月七(巡猎) Avatar_Mar_7th_10_Ability.json    （Skill01 0.4/0.6、Skill11_Phase02 强化普攻多段、
//                                                        Rank02_Insert_Phase02、Skill03_Phase02 强化次数）
//   1305 真理医生   Avatar_Dr_Ratio_00_Ability.json     （Skill02 归纳/演绎/固定概率、Insert 3.375+E2 附加）
// 固定提交 312b4597691e0a29cf9828a15b592757dba86949。
//
// 【文案记法】desc 里的 `#n[i]%` / `#n[f1]%` 都是「参数即比值，显示时 ×100」：
//   1304 E1 #1=0.2 → 20%、1304 E4 #1=0.4 → 40%、1220 天赋 #1=1.375 → 137.5%、
//   1208 E6 #1=2 → 200%、1224 天赋 #2=1 → 100%。本批全部按此口径取参数原值。
//
// 【已知引擎缺口】符玄战技的「未受护盾抵挡之前的伤害按 BPSkill[0]=65% 分摊给符玄」
// （原始脚本 MAvatar_FuXuan_00_HitDamageSplit → HitDamageSplit(SelfSplitRatio 1-0.65 / TargetSplitRatio 0.65)）
// 需要在 receiveDamage 之前改道伤害，现有 hook（hit / modifiers / afterDamage）都拿不到金额也无法改道，
// 因此本批只实现可验证的部分（鉴知 / 避厄 / 生命回复 / E2 / E4 / E6 / 行迹），分摊留作共享 hook 需求上报。
import {atk,hp,def,basic,skill,ultimate,talentAction} from '../actions.mjs';
import {ROSTER_DATA} from '../../roster-data.mjs';

export const IDS=[1208,1304,1206,1220,1224,1305];

// ── ROSTER_DATA 帮助函数（与 batch08 同口径）────────────────────────────────
const st=(id,skillId,index)=>ROSTER_DATA[id].skills?.[String(skillId)]?.stance?.[index]??0;
const spBase=(id,skillId)=>ROSTER_DATA[id].skills?.[String(skillId)]?.spBase??0;
// 强化 / 副技能与基础技能共用等级轨道：用已编译的基础参数反查等级行，再取目标技能表。
const rowFor=(id,refId,targetId,refValue)=>{
  const table=ROSTER_DATA[id].skills?.[String(refId)]?.params??{};
  const key=Object.keys(table).find(k=>Math.abs((table[k].param_list?.[0]??NaN)-refValue)<1e-9);
  return ROSTER_DATA[id].skills?.[String(targetId)]?.params?.[key??'10']?.param_list??[];
};
// 巡猎三月七【师父】命途分支：智识 / 毁灭 / 巡猎 / 记忆 / 欢愉 → 附加伤害；其余 → 削韧提高。
const MARCH_DAMAGE_PATHS=['智识','毁灭','巡猎','记忆','欢愉','Erudition','Destruction','Hunt','Remembrance','Elation'];

const actions={
  // ── 1208 符玄（量子 · 存护）：普攻按生命上限；战技纯辅助（穷观阵）；终结全体按生命上限 ──
  1208:(p,d)=>({
    basic:basic(p,d,{terms:hp(p.Normal[0]),toughness:st(1208,120801,0),hitShares:[1]}),
    skill:skill(p,d,{target:'self',terms:[],toughness:0,hitShares:[1]}),
    ultimate:ultimate(p,d,{target:'all',terms:hp(p.Ultra[0]),toughness:st(1208,120803,1),hitShares:[1]}),
  }),
  // ── 1304 砂金（虚数 · 存护）：普攻 / 终结按防御力；天赋追加攻击为 7（E4 10）段随机单体弹射 ──
  1304:(p,d,{eidolon=0}={})=>({
    basic:basic(p,d,{terms:def(p.Normal[0]),toughness:st(1304,130401,0),hitShares:[1]}),
    skill:skill(p,d,{target:'allies',terms:[],toughness:0,hitShares:[1]}),
    ultimate:ultimate(p,d,{terms:def(p.Ultra[1]),toughness:st(1304,130403,0),hitShares:[1]}),
    // PassiveSkill01_InsertAbilityPhase02：LoopExecuteTaskList = Talent[1]=7 段（E4 +ranks[4][2]=3），
    // 每段对随机敌方单体造成 Talent[2] 防御力伤害，削韧 Talent 的 stance[0]=10。
    followup:talentAction(p,d,{name:d.skills['130404'].name,terms:[],hitShares:[1],toughness:0,
      energyGain:spBase(1304,130404),
      bounceCount:p.Talent[1]+(eidolon>=4?d.ranks[4][2]:0),
      bounceTerms:def(p.Talent[2]),bounceToughness:st(1304,130404,0)}),
  }),
  // ── 1206 素裳（物理 · 巡猎）：战技 Skill02_Phase02 SPHitRatio 0.3/0.7 两段；剑势为附加伤害 ──
  1206:(p,d)=>({
    basic:basic(p,d,{terms:atk(p.Normal[0]),toughness:st(1206,120601,0),hitShares:[1]}),
    skill:skill(p,d,{terms:atk(p.BPSkill[0]),toughness:st(1206,120602,0),hitShares:[.3,.7]}),
    ultimate:ultimate(p,d,{terms:atk(p.Ultra[0]),toughness:st(1206,120603,0),hitShares:[1]}),
  }),
  // ── 1220 飞霄（风 · 巡猎）：普攻 3 段（0.2/0.2/0.6）、战技 3 段（0.34/0.33/0.33）、
  //    终结=6 次连段（每段 0.72+0.375，见 122008/122009）+ 收尾 Ultra[0]，本表只登记收尾段，
  //    连段由 before 逐段结算（削韧 15×6=90）。能量条即【飞黄】（上限 Talent[3]=12，激活/消耗 Talent[2]=6）。
  1220:(p,d,{eidolon=0}={})=>({
    basic:basic(p,d,{terms:atk(p.Normal[0]),toughness:st(1220,122001,0),hitShares:[.2,.2,.6],energyGain:0}),
    skill:skill(p,d,{terms:atk(p.BPSkill[0]),toughness:st(1220,122002,0),hitShares:[.34,.33,.33],energyGain:0}),
    ultimate:ultimate(p,d,{terms:atk(p.Ultra[0]),toughness:0,energyGain:0,energyCost:p.Talent[2],hitShares:[1]}),
    // 天赋追击 Insert_Phase02：Talent[0] 攻击力，削韧 stance[0]=15；E4 削韧 +100%。
    followup:talentAction(p,d,{terms:atk(p.Talent[0]),toughness:st(1220,122004,0)*(eidolon>=4?1+d.ranks[4][0]:1),energyGain:0}),
  }),
  // ── 1224 三月七（虚数 · 巡猎）：普攻 Skill01_Phase02 0.4/0.6 两段；强化普攻 Skill11_Phase02 多段 ──
  1224:(p,d,{eidolon=0}={})=>({
    basic:basic(p,d,{terms:atk(p.Normal[0]),toughness:st(1224,122401,0),hitShares:[.4,.6]}),
    // 强化普攻「一扎眉攒，二扎心」：段数与固定概率逐次判定（Skill11_Phase02），
    // 因此伤害在 before 中逐段结算，本动作只负责削韧总量与能量（spBase=30，且不回战技点）。
    enhancedBasic:{name:d.skills['122408'].name,type:'Normal',element:'Imaginary',target:'single',terms:[],hitShares:[1],
      energyGain:spBase(1224,122408),spCost:0,spGain:0,toughness:st(1224,122408,0)},
    skill:skill(p,d,{target:'ally',terms:[],toughness:0,hitShares:[1]}),
    ultimate:ultimate(p,d,{terms:atk(p.Ultra[0]),toughness:st(1224,122403,0),hitShares:[1]}),
    // E2（Rank02_Insert_Phase02）：0.4/0.6 两段，共 ranks[2][0] 攻击力，削韧 ranks[2][3]=15。
    followup:talentAction(p,d,{name:d.ranks[2]?d.skills['122404'].name:'师父，我悟了！',terms:atk(d.ranks[2][0]),
      toughness:d.ranks[2][3],hitShares:[.4,.6],energyGain:0}),
  }),
  // ── 1305 真理医生（虚数 · 巡猎）：普攻 / 战技 / 终结 / 天赋追击均为单体 1 段 ──
  1305:(p,d)=>({
    basic:basic(p,d,{terms:atk(p.Normal[0]),toughness:st(1305,130501,0),hitShares:[1]}),
    skill:skill(p,d,{terms:atk(p.BPSkill[0]),toughness:st(1305,130502,0),hitShares:[1]}),
    ultimate:ultimate(p,d,{terms:atk(p.Ultra[0]),toughness:st(1305,130503,0),hitShares:[1]}),
    followup:talentAction(p,d,{terms:atk(p.Talent[0]),toughness:st(1305,130504,0),hitShares:[1],energyGain:spBase(1305,130504)}),
  }),
};

const factories={
  // ══════════════════════════ 1208 符玄（量子 · 存护） ══════════════════════════
  // 战技 120802：开启【穷观阵】BPSkill[2]=3 回合，队友未受护盾抵挡前伤害的 BPSkill[0]=65% 分摊给符玄
  //   （见文件头：引擎缺口，未实现）；阵中我方全体获得【鉴知】：生命上限 +BPSkill[3]=7.5%×符玄生命上限、
  //   暴击率 +BPSkill[4]=15%，E1 追加暴击伤害 +ranks[1][0]=30%。
  // 天赋 120804：【避厄】我方全体受到的伤害降低 Talent[0]=22%；生命百分比 ≤Talent[1]=50% 时
  //   回复已损失生命 Talent[2]=95%，初始 1 次、上限 2 次，终结技 +1 次，致命攻击不触发。
  // 终结 120803：获得 1 次天赋回复次数；行迹 point07 为我方其他目标回复 5%×符玄生命上限+133；
  //   E6 把【穷观阵】期间累计已损失生命值（上限 ranks[6][1]=120% 符玄生命上限）按 ranks[6][0]=200% 加进本次伤害。
  // 行迹 point06：穷观阵开启时施放战技额外回 20 能；point08：穷观阵开启时我方全体抵抗 1 次行动的控制类负面。
  // E2：穷观阵中受到致命伤害的我方目标本次行动免于无法战斗并回复 ranks[2][0]=70% 生命上限（单场 1 次）。
  // E4：穷观阵中我方其他目标受到攻击后符玄回 ranks[4][0]=5 能。
  1208:function(api){
    const {live,allies,enemies,rank,trace,buff,resource,energy,heal,damageTo,combatPanel,record}=api;
    const ARRAY='fuxuanArray';
    const inArray=u=>u.buffs.some(e=>e.tag===ARRAY);
    const charges=u=>u.resources['天赋触发次数']??0;
    function openArray(b,u,duration){
      const P=u.kit.params,ratio=P.BPSkill[3];
      buff(b,u,u,'穷观阵','marker',0,duration,{id:u.id+':fuxuan-array',tag:ARRAY});
      for(const to of allies(b,u)){
        const tag=u.id+':fuxuan-jz:'+to.id;
        buff(b,u,to,'鉴知','marker',0,null,{id:tag+':mark',tag:'fuxuanJianzhi',
          requiresTag:{unit:u.id,tag:ARRAY},removeOnSourceDeath:true});
        // HPConvert：鉴知的生命上限提高 = 符玄（施法者）生命上限 × ratio（原始脚本 StackProperty HPConvert）。
        buff(b,u,to,'鉴知 · 生命上限提高','hp',0,null,{id:tag+':hp',removeOnSourceDeath:true,
          requiresTag:{unit:u.id,tag:ARRAY},convert:{source:u.id,stat:'hp',ratio}});
        buff(b,u,to,'鉴知 · 暴击率提高','critRate',P.BPSkill[4],null,{id:tag+':cr',
          requiresTag:{unit:u.id,tag:ARRAY},removeOnSourceDeath:true});
        if(rank(u,1))buff(b,u,to,'符玄 E1 · 暴击伤害提高','critDmg',rank(u,1),null,{id:tag+':cd',
          requiresTag:{unit:u.id,tag:ARRAY},removeOnSourceDeath:true});
      }
      resource(b,u,'控制免疫已用',0);
      resource(b,u,'控制日志游标',b.log.length);
      if(u.resources['E6累计起算']==null)resource(b,u,'E6累计起算',b.log.length);
    }
    function tryRecover(b,u,to){
      const P=u.kit.params;
      if(to!==u||!live(u)||charges(u)<1)return;
      if(u.hp/combatPanel(u).hp>P.Talent[1])return;
      resource(b,u,'天赋触发次数',charges(u)-1);
      heal(b,u,u,(combatPanel(u).hp-u.hp)*P.Talent[2]);
      record(b,'mechanic',u,{name:'乾清坤夷 · 生命回复'});
    }
    // 行迹 point08：被免疫的控制类负面状态会记一条 resist，据此消耗本次穷观阵的免疫次数。
    function syncControl(b,u){
      const cur=b.log.length;let i=u.resources['控制日志游标']??0;
      for(;i<cur;i++){
        const e=b.log[i];
        if(e.type!=='resist'||e.name!=='免疫控制类负面状态')continue;
        const t=b.units.find(x=>x.id===e.actor);
        if(t&&t.side===u.side)resource(b,u,'控制免疫已用',1);
      }
      resource(b,u,'控制日志游标',cur);
    }
    return {
      start(b,u){
        const P=u.kit.params;
        resource(b,u,'天赋触发次数',1);
        resource(b,u,'控制免疫已用',0);
        resource(b,u,'E6累计起算',b.log.length);
        for(const to of allies(b,u))buff(b,u,to,'避厄','dmgReduction',P.Talent[0],null,
          {id:u.id+':fuxuan-bie:'+to.id,tag:'fuxuanBie',removeOnSourceDeath:true});
      },
      // 秘技 120807：屏障期间进入战斗时自动开启【穷观阵】Maze[1]=2 回合。
      entry(b,u){openArray(b,u,u.kit.params.Maze[1]);},
      shouldUseSkill(b,u){const e=u.buffs.find(e=>e.tag===ARRAY);return !e||(e.remaining??Infinity)<=1;},
      // 行迹 point06：穷观阵已开启时施放战技额外回 20 能（判定必须在本次开启之前）。
      before(b,u,actor,key,kind,a,selected){
        if(actor!==u)return;
        if(key==='skill'&&trace(u,1)&&inArray(u))energy(b,u,trace(u,1)[0]);
        if(key!=='ultimate'||kind==='copy')return;
        // E6：本次终结技伤害加上 ranks[6][0]×累计已损失生命值（上限 ranks[6][1]×生命上限）。
        if(rank(u,6)&&a.terms?.length){
          const from=u.resources['E6累计起算']??0;let acc=0;
          for(let i=from;i<b.log.length;i++){
            const e=b.log[i];
            if(e.type!=='damage')continue;
            const t=b.units.find(x=>x.id===e.target);
            if(t&&t.side===u.side)acc+=e.hpDamage??0;
          }
          const bonus=rank(u,6,0)*Math.min(acc,rank(u,6,1)*combatPanel(u).hp);
          a.terms=[{...a.terms[0],flatAdd:(a.terms[0].flatAdd??0)+bonus}];
          record(b,'resource',u,{name:'E6 累计已损失生命值',value:acc});
        }
      },
      after(b,u,actor,key,kind,a,selected,hitTargets){
        syncControl(b,u);
        if(actor!==u)return;
        if(key==='skill'&&kind!=='copy'){
          openArray(b,u,u.kit.params.BPSkill[2]);
          void selected;
        }
        if(key==='ultimate'){
          const P=u.kit.params;
          // 终结技：获得 1 次天赋生命回复触发次数（上限 2）。
          resource(b,u,'天赋触发次数',Math.min(2,charges(u)+1));
          // 行迹 point07：为我方其他目标回复 5%×符玄生命上限 + 133。
          if(trace(u,2))for(const to of allies(b,u))if(to!==u)
            heal(b,u,to,combatPanel(u).hp*trace(u,2)[0]+trace(u,2)[1]);
          resource(b,u,'E6累计起算',b.log.length);
        }
        void hitTargets;
      },
      afterDamage(b,u,from,to,kind){
        void from;void kind;
        tryRecover(b,u,to);
      },
      turnStart(b,u,actor){if(actor===u)tryRecover(b,u,u);},
      // E4：穷观阵中我方其他目标受到攻击后，符玄恢复 5 点能量。
      attacked(b,u,to,from){
        void from;
        if(to===u||to.side!==u.side||!inArray(u)||!rank(u,4))return;
        energy(b,u,rank(u,4));
      },
      // 【穷观阵】：队友受到「未受护盾抵挡之前」的伤害时，把 BPSkill[0]=65% 分摊给符玄本人。
      // 引擎在护盾 / 生命结算之前调用本钩子；改道后的份额按符玄自身的护盾 / 减伤重新结算。
      redirectDamage(b,u,from,to,amount){
        void from;
        if(to.side!==u.side||to===u||!inArray(u)||!live(u)||!live(to))return null;
        return [{to:u.id,amount:amount*u.kit.params.BPSkill[0]}];
      },
      // E2：穷观阵中我方目标受到致命伤害时，本次行动中的所有我方目标免于无法战斗并回复 70% 生命上限。
      beforeLethal(b,u,from,to,amount){
        void from;void amount;
        if(!rank(u,2)||!inArray(u)||to.side!==u.side)return false;
        const seq=b.activeAction?.sequence??null;
        if(u.resources['E2已触发']){
          if(u.resources['E2触发序列']!==seq)return false;
        } else {
          resource(b,u,'E2已触发',1);
          resource(b,u,'E2触发序列',seq);
        }
        heal(b,u,to,combatPanel(to).hp*rank(u,2));
        record(b,'mechanic',u,{name:'柔兆 · 致命伤害拦截',target:to.id});
        return true;
      },
      // 行迹 point08：穷观阵开启且本次免疫次数未用时，我方全体免疫控制类负面状态。
      panel(b,u,to,out){
        if(to.side!==u.side||!trace(u,3)||!inArray(u))return;
        if(u.resources['控制免疫已用'])return;
        out.controlRes=1;
      },
      display(b,u,to){
        if(to!==u)return [];
        return [{type:'buff',id:u.id+':fuxuan-array-display',source:u.id,name:'穷观阵',
          key:'marker',value:inArray(u)?1:0,remaining:null,tickOwner:u.id,tickAt:'end',derived:true},
          {type:'resource',id:u.id+':fuxuan-charge',source:u.id,name:'天赋回复次数',
            key:'marker',value:charges(u),derived:true}];
      },
    };
  },

  // ══════════════════════════ 1304 砂金（虚数 · 存护） ══════════════════════════
  // 战技 130402：【坚垣筹码】护盾 = BPSkill[0]=28% 防御力 + BPSkill[1]=410，持续 BPSkill[2]=3 回合，
  //   重复获得可叠加、上限为当前战技护盾量的 BPSkill[3]=200%。
  // 天赋 130404：持有护盾的我方单体效果抵抗 +Talent[3]=62.5%；受到攻击后砂金获得 1 点【盲注】，
  //   砂金自己持盾时额外 +Talent[0]=1 点并抵抗控制类负面（Talent[4]=2 回合冷却）；
  //   【盲注】上限 10，达到 7 点消耗 7 点发动 Talent[1]=7（E4 +ranks[4][2]=3）段追加攻击，
  //   每段 Talent[2]=31.25% 防御力、削韧 10。
  // 终结 130403：随机获得 1~Ultra[0]=7 点【盲注】，使目标陷入【惊惶】Ultra[3]=3 回合
  //   （我方击中时暴击伤害 +Ultra[2]=18%），并造成 Ultra[1]=324% 防御力虚数伤害。
  // 行迹 point06 杠杆：防御 >1600 后每 100 点 +2% 暴击率，上限 48%。
  // 行迹 point07 热手：战斗开始为我方全体提供 100% 战技护盾量、3 回合。
  // 行迹 point08 宾果：持盾队友发动追加攻击后 +1【盲注】（每回合最多 3 次，砂金回合开始重置）；
  //   砂金自身追击后为我方全体提供 7.2% 防御力+96 的护盾，并为护盾最低者再提供一份，3 回合。
  // E1：持盾我方暴击伤害 +ranks[1][0]=20%；施放终结技后为我方全体提供 100% 战技护盾量、3 回合。
  // E2：普攻使目标全属性抗性降低 ranks[2][1]=12%、ranks[2][2]=3 回合。
  // E4：追击前防御力 +ranks[4][0]=40%、ranks[4][1]=2 回合，追击段数 +ranks[4][2]=3。
  // E6：每有 1 个队友持有护盾伤害 +ranks[6][0]=50%，最多 ranks[6][1]=150%。
  1304:function(api){
    const {live,allies,enemies,rank,trace,buff,resource,energy,damageTo,combatPanel,record,allResDown}=api;
    const SID=u=>u.id+':aventurine-shield';
    const hasShield=(u,to)=>to.shields.some(s=>s.id===SID(u)&&s.value>1e-8);
    const shieldBoost=u=>1+(combatPanel(u).shieldBoost??0);
    const skillValue=u=>(combatPanel(u).def*u.kit.params.BPSkill[0]+u.kit.params.BPSkill[1])*shieldBoost(u);
    const blind=u=>u.resources['盲注']??0;
    function grant(b,u,to,value,duration=null){
      const cap=skillValue(u)*u.kit.params.BPSkill[3],id=SID(u),dur=duration??u.kit.params.BPSkill[2],w=value;
      let e=to.shields.find(s=>s.id===id);
      if(!e){
        e={type:'shield',id,name:'坚垣筹码',value:Math.min(cap,w),source:u.id,remaining:dur,
          tickOwner:to.id,tickAt:'end',appliedTurn:to.turns};
        to.shields.push(e);
      } else {
        e.value=Math.min(cap,e.value+w);
        e.remaining=Math.max(e.remaining??0,dur);
        e.source=u.id;
      }
      record(b,'shield',u,{target:to.id,name:'坚垣筹码',value:e.value,duration:e.remaining});
      return e.value;
    }
    function queueFollowup(b,u){
      const pool=enemies(b,u);
      if(!pool.length||b.queue.some(q=>q.actor===u.id&&q.key==='followup'))return;
      resource(b,u,'盲注',Math.max(0,blind(u)-7));
      b.queue.push({actor:u.id,key:'followup',kind:'followup',
        targetId:pool[Math.floor(b.random()*pool.length)].id});
      record(b,'mechanic',u,{name:'盲注 7 点 · 发动追加攻击'});
    }
    function addBlind(b,u,n){
      if(n<=0||blind(u)>=10)return;
      resource(b,u,'盲注',Math.min(10,blind(u)+n));
      if(blind(u)>=7)queueFollowup(b,u);
    }
    function syncCtrlCD(b,u){
      const cur=b.log.length;let i=u.resources['控制日志游标']??0;
      for(;i<cur;i++){
        const e=b.log[i];
        if(e.type==='resist'&&e.name==='免疫控制类负面状态'&&e.actor===u.id)
          buff(b,u,u,'枪口以右 · 控制抵抗冷却','marker',0,u.kit.params.Talent[4],
            {id:u.id+':aventurine-ctrlcd',tag:'aventurineCtrlCD'});
      }
      resource(b,u,'控制日志游标',cur);
    }
    return {
      shouldUseSkill(b,u){return allies(b,u).some(t=>!hasShield(u,t)||
        Math.max(0,...t.shields.filter(s=>s.id===SID(u)).map(s=>s.value))<skillValue(u)*.5);},
      start(b,u){
        const P=u.kit.params;
        resource(b,u,'盲注',0);
        resource(b,u,'宾果触发',0);
        resource(b,u,'控制日志游标',b.log.length);
        // 行迹 point07 热手：开场全队护盾 = 100% 战技护盾量，trace[0]=3 回合。
        if(trace(u,2))for(const to of allies(b,u))grant(b,u,to,skillValue(u)*trace(u,2)[1],trace(u,2)[0]);
      },
      // 秘技 130407：防御力提高（Maze[0..2] 三档，参数里没有概率，取最高档 Maze[2]=60%），Maze[3]=3 回合。
      entry(b,u){
        const P=u.kit.params;
        for(const to of allies(b,u))buff(b,u,to,'红黑之间 · 防御力提高','defPct',P.Maze[2],P.Maze[3],
          {id:u.id+':aventurine-maze:'+to.id});
      },
      before(b,u,actor,key,kind,a,selected){
        if(actor!==u)return;
        const P=u.kit.params;
        if(key==='ultimate'&&kind!=='copy'){
          // Skill03_Phase02：先加盲注（随机 1~Ultra[0]）与【惊惶】，再结算伤害。
          addBlind(b,u,1+Math.floor(b.random()*P.Ultra[0]));
          const to=selected[0];
          if(to&&live(to))buff(b,u,to,'惊惶','marker',0,P.Ultra[3],
            {id:u.id+':aventurine-panic:'+to.id,tag:'aventurinePanic',debuff:true});
          // E1：施放终结技后为我方全体提供 100% 战技护盾量、ranks[1][2]=3 回合。
          if(rank(u,1))for(const t of allies(b,u))grant(b,u,t,skillValue(u)*rank(u,1,1),rank(u,1,2));
        }
        if(key==='followup'){
          // E4：追击前防御力 +40%、2 回合（追击伤害吃防御力，必须先加）。
          if(rank(u,4))buff(b,u,u,'意外绞刑 · 防御力提高','defPct',rank(u,4,0),rank(u,4,1),
            {id:u.id+':aventurine-e4'});
        }
        void a;
      },
      after(b,u,actor,key,kind,a,selected,hitTargets){
        // 控制抵抗是「受到控制类负面时消耗、2 回合后可再次触发」，因此每次行动后都检查抵抗日志。
        syncCtrlCD(b,u);
        if(actor!==u){
          // 行迹 point08 宾果：持盾队友发动追加攻击后 +1【盲注】，每回合最多 trace[2]=3 次。
          if(actor.side===u.side&&kind==='followup'&&trace(u,3)&&hasShield(u,actor)){
            const n=u.resources['宾果触发']??0;
            if(n<trace(u,3)[2]){resource(b,u,'宾果触发',n+1);addBlind(b,u,1);}
          }
          return;
        }
        const P=u.kit.params;
        if(key==='skill')for(const to of allies(b,u))grant(b,u,to,skillValue(u));
        if(key==='basic'&&rank(u,2))for(const to of hitTargets.filter(live))
          allResDown(b,u,to,rank(u,2,1),rank(u,2,2));
        if(key==='followup'){
          // 行迹 point08：追击后为全队补护盾，并为护盾最低者额外补一份（trace[0]/[1]、[3]/[4]），3 回合。
          if(trace(u,3)){
            const base=(combatPanel(u).def*trace(u,3)[0]+trace(u,3)[1])*shieldBoost(u);
            const extra=(combatPanel(u).def*trace(u,3)[3]+trace(u,3)[4])*shieldBoost(u);
            for(const to of allies(b,u))grant(b,u,to,base,3);
            const team=allies(b,u);
            const low=team.reduce((x,c)=>(Math.max(0,...x.shields.map(s=>s.value))<=Math.max(0,...c.shields.map(s=>s.value))?x:c));
            if(low)grant(b,u,low,extra,3);
          }
        }
        void a;void selected;
      },
      // 天赋：持盾我方受到攻击后获得【盲注】（砂金自身持盾再 +1）。
      attacked(b,u,to,from){
        if(!from||from.side===u.side||to.side!==u.side)return;
        let n=0;
        if(hasShield(u,to))n+=1;
        if(to===u&&hasShield(u,u))n+=1;
        if(n)addBlind(b,u,n);
      },
      turnStart(b,u,actor){
        if(actor===u)resource(b,u,'宾果触发',0);
      },
      modifiers(b,u,actor,to,a,kind){
        const out={};
        // 惊惶（Skill03_Phase02 CritDmgIncrease）：我方任意角色击中该目标时暴击伤害 +Ultra[2]=18%。
        if(to.side!==u.side&&to.buffs.some(e=>e.tag==='aventurinePanic'))
          out.critDmg=(out.critDmg??0)+u.kit.params.Ultra[2];
        if(actor!==u||to.side===u.side)return out;
        // E6：每有 1 个队友持有护盾伤害 +50%，最多 150%。
        if(rank(u,6)){
          const n=allies(b,u).filter(x=>x.shields.some(s=>s.value>1e-8)).length;
          out.dmgBoost=(out.dmgBoost??0)+Math.min(rank(u,6,1),rank(u,6,0)*n);
        }
        void a;void kind;
        return out;
      },
      panel(b,u,to,out){
        if(to.side!==u.side)return;
        const shielded=hasShield(u,to);
        if(shielded){
          // 天赋：持有【坚垣筹码】效果抵抗 +Talent[3]=62.5%。
          out.effectRes=(out.effectRes??0)+u.kit.params.Talent[3];
          // E1：持有【坚垣筹码】暴击伤害 +ranks[1][0]=20%。
          if(rank(u,1))out.critDmg=(out.critDmg??0)+rank(u,1,0);
        }
        // 天赋：砂金持盾时抵抗控制类负面状态（冷却期间不再触发）。
        if(to===u&&shielded&&!u.buffs.some(e=>e.tag==='aventurineCtrlCD'))out.controlRes=1;
        // 行迹 point06 杠杆：防御每超出 trace[2]=1600 的 100 点 +trace[0]=2% 暴击率，上限 trace[1]=48%。
        if(trace(u,1)){
          const over=Math.floor(Math.max(0,(out.def??0)-trace(u,1)[2])/100);
          out.critRate=(out.critRate??0)+Math.min(trace(u,1)[1],over*trace(u,1)[0]);
        }
      },
      // 惊惶的暴击伤害加成在 modifiers 中提供（对任意我方攻击者生效）。
      display(b,u,to){
        if(to!==u)return [];
        return [{type:'resource',id:u.id+':aventurine-blind',source:u.id,name:'盲注',key:'marker',
          value:blind(u),derived:true}];
      },
    };
  },

  // ══════════════════════════ 1206 素裳（物理 · 巡猎） ══════════════════════════
  // 战技 120602：BPSkill[0]=262.5% 攻击力；最后一击后按 BPSkill[2]=33% 概率（目标处于弱点击破状态时必定）
  //   发动【剑势】附加伤害 BPSkill[1]=125% 攻击力（Skill02_Phase02 Pursued 节点 -723023620）。
  // 终结 120603：Ultra[0]=384% 攻击力、立即行动；攻击力 +Ultra[3]=36%、Ultra[1]=2 回合；
  //   期间施放战技额外增加 2 次【剑势】判定，通过额外判定发动的【剑势】伤害为原伤害的 Ultra[2]=50%
  //   （原始脚本两个 Pursued 节点 = BPSkill[1]×Ultra[2]）。
  // 天赋 120604：敌方弱点被击破时速度 +Talent[0]=22.5%、Talent[1]=2 回合（E6 可叠 2 层，开场 1 层）。
  // 行迹 point06 赤子：生命 ≤50% 时仇恨降低 50%；point07 逐寇：每发动 1 次【剑势】伤害 +2.5%，最多 10 层；
  //   point08 破敌：施放普攻或战技后若有敌方处于弱点击破状态，行动提前 15%。
  // E1：对弱点击破目标施放战技后回 1 战技点；E2：触发【剑势】后受伤降低 20%、1 回合；E4：击破特攻 +40%。
  1206:function(api){
    const {live,allies,enemies,rank,trace,buff,stacks,resource,sp,advance,damageTo,combatPanel,record}=api;
    // 星魂是否解锁只能看等级：E1 / E6 的 params 为空数组，rank() 会返回 0（假值）。
    const has=(u,n)=>u.kit.eidolon>=n;
    const sStacks=u=>u.resources['剑势层数']??0;
    const ultBuff=u=>u.buffs.some(e=>e.tag==='sushangUlt');
    function swordStance(b,u,to,mult){
      if(!to||!live(to))return false;
      const t=trace(u,2);
      const bonus=1+(t?Math.min(t[1],sStacks(u))*t[0]:0);
      damageTo(b,u,to,{name:'剑势',type:'Additional',element:u.element,
        terms:[{scaling:'atk',multiplier:mult*bonus}],toughness:0},1,'primary','additional');
      if(t)resource(b,u,'剑势层数',Math.min(t[1],sStacks(u)+1));
      if(has(u,2))buff(b,u,u,'素裳 E2 · 减伤','dmgReduction',rank(u,2),1,{id:u.id+':sushang-e2'});
      record(b,'mechanic',u,{name:'剑势',target:to.id,stacks:sStacks(u)});
      return true;
    }
    function judgment(b,u,to,mult){
      if(!to||!live(to))return false;
      if(!to.broken&&b.random()>=u.kit.params.BPSkill[2])return false;
      return swordStance(b,u,to,mult);
    }
    return {
      start(b,u){
        const P=u.kit.params;
        resource(b,u,'剑势层数',0);
        if(has(u,4))buff(b,u,u,'其心百辟 · 击破特攻','breakEffect',rank(u,4),null,{id:u.id+':sushang-e4'});
        // E6：进入战斗后立即获得 1 层天赋加速（上限 2 层，由 stacks 的 max 控制）。
        if(has(u,6))stacks(b,u,u,'游刃若水','speedPct',P.Talent[0],2,P.Talent[1],{id:u.id+':sushang-spd'});
      },
      // 秘技 120607：对敌方全体造成 Maze[0]=80% 攻击力物理伤害（削韧 60）。
      entry(b,u){
        const P=u.kit.params;
        for(const to of enemies(b,u))damageTo(b,u,to,{name:'云骑剑经 • 叩阵',type:'Maze',element:u.element,
          terms:atk(P.Maze[0]),toughness:st(1206,120607,0)},1,'primary','technique');
      },
      after(b,u,actor,key,kind,a,selected,hitTargets){
        if(actor!==u)return;
        const P=u.kit.params;
        if(key==='skill'&&kind!=='copy'){
          const to=selected[0]??hitTargets[0];
          judgment(b,u,to,P.BPSkill[1]);
          if(ultBuff(u)&&live(to)){judgment(b,u,to,P.BPSkill[1]*P.Ultra[2]);judgment(b,u,to,P.BPSkill[1]*P.Ultra[2]);}
          if(has(u,1)&&to&&live(to)&&to.broken)sp(b,u,1,'素裳 E1');
        }
        if(key==='ultimate'){
          advance(b,u.id,1);
          buff(b,u,u,'太虚形蕴 · 烛夜','atkPct',P.Ultra[3],P.Ultra[1],{id:u.id+':sushang-ult',tag:'sushangUlt'});
        }
        // 行迹 point08 破敌：普攻或战技后有敌方处于弱点击破状态 → 行动提前 15%。
        if(trace(u,3)&&['basic','skill'].includes(key)&&enemies(b,u).some(x=>x.broken))
          advance(b,u.id,trace(u,3)[0]);
        void a;void kind;
      },
      // 天赋 120604：任意敌方目标弱点被击破 → 速度 +22.5%，2 回合（E6 最多 2 层）。
      afterDamage(b,u,from,to,kind){
        void from;
        if(kind!=='break'||to.side===u.side)return;
        const P=u.kit.params;
        stacks(b,u,u,'游刃若水','speedPct',P.Talent[0],has(u,6)?2:1,P.Talent[1],{id:u.id+':sushang-spd'});
      },
      panel(b,u,to,out){
        if(to!==u||!trace(u,1))return;
        // 行迹 point06 赤子：生命百分比 ≤trace[0]=50% 时被攻击概率降低 trace[1]=50%。
        if(u.hp/out.hp<=trace(u,1)[0])
          out.aggroRatio=(out.aggroRatio??1)*(1-trace(u,1)[1]);
      },
      display(b,u,to){
        if(to!==u)return [];
        return [{type:'resource',id:u.id+':sushang-sword',source:u.id,name:'剑势层数',key:'marker',
          value:sStacks(u),derived:true}];
      },
    };
  },

  // ══════════════════════════ 1220 飞霄（风 · 巡猎） ══════════════════════════
  // 能量条即【飞黄】：上限 Talent[3]=12，达到 Talent[2]=6 可激活终结技并消耗 6 点。
  // 天赋 122004：我方目标每施放 Talent[1]=2 次攻击，飞霄获得 1 点【飞黄】（飞霄终结技不计入）；
  //   队友对敌方目标施放攻击后飞霄立即对主目标发动追加攻击（Talent[0]=137.5% 攻击力，削韧 15），
  //   每回合最多 1 次、飞霄回合开始重置；发动时自身伤害 +Talent[4]=75%、Talent[5]=2 回合（行迹 point08 电举：战技时）。
  // 战技 122002：BPSkill[0]=250%，随后立即对该目标额外发动 1 次天赋追加攻击。
  // 终结 122003：先发动 Ultra[2]=6 次【闪裂刃舞】/【钺贯天冲】——122008/122009 均为
  //   [基础 72%, 条件 +37.5%]，两种形态的加成条件互补（击破 / 未击破），因此每次均为 109.5%；
  //   最后造成 Ultra[0]=192% 攻击力；期间无视弱点削韧、未击破时击破效率 +Ultra[1]=100%；
  //   最大总倍率 Ultra[3]=849% = 192% + 6×109.5%。
  // 行迹 point06 天通：开场 +3【飞黄】；回合开始时若上回合未通过天赋发动追加攻击，计入 1 次获得所需的攻击次数。
  // 行迹 point07 解形：终结技伤害视为追加攻击，追加攻击暴击伤害 +36%。
  // 行迹 point08 电举：施放战技时攻击力 +48%、3 回合。
  // E1：每次发动【闪裂刃舞】/【钺贯天冲】后终结技伤害 +10%，最多 5 层，持续至本次终结技结束。
  // E2：我方目标每施放 1 次追加攻击即可获得 1 点【飞黄】，每回合最多 ranks[2]=6 次。
  // E4：天赋追击削韧 +100%、发动时速度 +ranks[4][1]=8%、ranks[4][2]=2 回合。
  // E6：终结技抗性穿透 +ranks[6][0]=20%；天赋追击伤害同时视为终结技伤害且倍率提高 ranks[6][1]=40%。
  1220:function(api){
    const {live,allies,enemies,rank,trace,buff,stacks,resource,energy,advance,damageTo,combatPanel,record}=api;
    function gainFei(b,u,n){if(n>0)energy(b,u,n,true);}
    const isAttack=a=>!!a&&((a.terms?.length??0)>0||(a.bounceTerms?.length??0)>0);
    function countAttack(b,u){
      const p=u.kit.params,c=(u.resources['攻击计数']??0)+1;
      if(c>=p.Talent[1]){resource(b,u,'攻击计数',c-p.Talent[1]);gainFei(b,u,1);}
      else resource(b,u,'攻击计数',c);
    }
    function queueTalent(b,u,targetId){
      const pool=enemies(b,u);
      let to=pool.find(x=>x.id===targetId);
      if(!live(to))to=pool[Math.floor(b.random()*pool.length)];
      if(!to)return;
      resource(b,u,'本回合已触发天赋',1);
      b.queue.push({actor:u.id,key:'followup',kind:'followup',targetId:to.id});
      record(b,'mechanic',u,{name:'雷狩 · 追加攻击',target:to.id});
    }
    return {
      start(b,u){
        const P=u.kit.params;
        energy(b,u,-u.energy,true);            // 【飞黄】从 0 开始
        resource(b,u,'攻击计数',0);
        resource(b,u,'本回合已触发天赋',0);
        resource(b,u,'上回合追加',0);
        resource(b,u,'E2本回合回能',0);
        if(trace(u,1))gainFei(b,u,trace(u,1)[0]);
        // 秘技 122007：进入战斗后获得 Maze[3]=1 点【飞黄】。
        if(u.kit.technique)gainFei(b,u,P.Maze[3]);
      },
      // 秘技：每个波次开始时对敌方全体造成 Maze[2]=200% 攻击力风伤（必定暴击），
      // 每超过 1 个敌人倍率 +Maze[4]=100%、最多 +Maze[5]=1000%。
      waveStart(b,u){
        if(!u.kit.technique)return;
        const P=u.kit.params,pool=enemies(b,u);
        const extra=Math.max(0,pool.length-1);
        const mult=P.Maze[2]*(1+Math.min(P.Maze[5],P.Maze[4]*extra));
        for(const to of pool)damageTo(b,u,to,{name:'岚身',type:'Maze',element:'Wind',
          terms:atk(mult),toughness:st(1220,122007,0),fixedCrit:{rate:1,critDmg:combatPanel(u).critDmg}},
          1,'primary','technique');
      },
      before(b,u,actor,key,kind,a,selected){
        if(actor!==u)return;
        const P=u.kit.params;
        if(key==='followup'){
          // 天赋：发动此攻击时使自身造成的伤害提高 Talent[4]=75%、Talent[5]=2 回合（原始脚本在伤害节点前加 modifier）。
          buff(b,u,u,'雷狩 · 增伤','dmgBoost',P.Talent[4],P.Talent[5],{id:u.id+':feixiao-talent-buff'});
          // E4：发动天赋追击时速度提高 ranks[4][1]=8%、ranks[4][2]=2 回合。
          if(u.kit.eidolon>=4)buff(b,u,u,'驱飓听冰 · 速度','speedPct',rank(u,4,1),rank(u,4,2),{id:u.id+':feixiao-e4'});
          return;
        }
        if(key!=='ultimate'||kind==='copy'||kind==='technique')return;
        const main=selected[0];
        resource(b,u,'E1层数',0);
        if(!main||!live(main))return;
        buff(b,u,main,'凿破大荒 · 无视弱点','marker',0,null,{id:u.id+':feixiao-ult-weak',weakness:'Wind'});
        if(!main.broken)buff(b,u,u,'凿破大荒 · 击破效率','breakEfficiency',P.Ultra[1],null,{id:u.id+':feixiao-ult-beff'});
        // Skill03_ComboFinish1/2：6 次连段，逐段结算；122008/122009 = [0.72, 0.375]。
        const combo=rowFor(1220,122003,122008,P.Ultra[0]);
        const mult=(combo[0]??0)+(combo[1]??0);
        for(let i=0;i<P.Ultra[2];i++){
          if(!live(main))break;
          damageTo(b,u,main,{name:'闪裂刃舞 / 钺贯天冲',type:'Ultra',element:'Wind',
            terms:atk(mult),toughness:15},1,'primary','direct');
          if(rank(u,1))stacks(b,u,u,'飞霄 E1 · 终结技增伤','dmgBoost',rank(u,1,0),rank(u,1,1),null,
            {id:u.id+':feixiao-e1',abilityType:'Ultra'});
        }
      },
      after(b,u,actor,key,kind,a,selected,hitTargets){
        const own=actor===u;
        const attack=isAttack(a);
        // 1) 天赋：队友对敌方目标施放攻击后，飞霄立即对主目标发动追击（每回合最多 1 次）。
        if(!own&&actor.side===u.side&&kind!=='technique'&&attack&&key!=='ultimate'
          &&!(u.resources['本回合已触发天赋']??0))
          queueTalent(b,u,selected[0]?.id??hitTargets[0]?.id);
        // 2) 【飞黄】计数：追击按 E2 每次 +1（每回合上限 ranks[2]=6），其余攻击每 Talent[1]=2 次 +1；
        //    飞霄自己的终结技不计入次数。
        if(actor.side===u.side&&kind!=='technique'&&attack&&!(own&&key==='ultimate')){
          if(kind==='followup'&&rank(u,2)){
            const n=u.resources['E2本回合回能']??0;
            if(n<rank(u,2)){resource(b,u,'E2本回合回能',n+1);gainFei(b,u,1);}
          } else countAttack(b,u);
        }
        if(!own)return;
        if(key==='followup'){resource(b,u,'上回合追加',1);return;}
        if(key==='ultimate'){
          u.buffs=u.buffs.filter(e=>e.id!==u.id+':feixiao-e1');
          for(const to of b.units)to.buffs=to.buffs.filter(e=>e.id!==u.id+':feixiao-ult-weak');
          u.buffs=u.buffs.filter(e=>e.id!==u.id+':feixiao-ult-beff');
          return;
        }
        if(key==='skill'&&kind!=='copy'){
          // 战技：随后立即对该目标额外发动 1 次天赋追加攻击（不占用「每回合 1 次」）。
          const to=selected[0]??hitTargets[0];
          if(to&&live(to)){
            resource(b,u,'本回合已触发天赋',1);
            b.queue.push({actor:u.id,key:'followup',kind:'followup',targetId:to.id});
          }
          // 行迹 point08 电举：施放战技时攻击力 +48%、3 回合。
          if(trace(u,3))buff(b,u,u,'电举 · 攻击力提高','atkPct',trace(u,3)[0],trace(u,3)[1],{id:u.id+':feixiao-dianju'});
        }
      },
      turnStart(b,u,actor){
        if(actor!==u)return;
        // 行迹 point06：上回合未通过天赋发动追加攻击 → 计入 1 次获得【飞黄】所需的攻击次数。
        if(trace(u,1)&&!(u.resources['上回合追加']??0))countAttack(b,u);
        resource(b,u,'上回合追加',0);
        resource(b,u,'本回合已触发天赋',0);
        resource(b,u,'E2本回合回能',0);
      },
      prepare(b,u,key,kind,a){
        // E6：天赋追击伤害同时视为终结技伤害，倍率提高 ranks[6][1]=40%。
        if(key==='followup'&&rank(u,6)&&a.terms?.length)
          return {...a,type:'Ultra',regardAsUltra:true,
            terms:a.terms.map(t=>({...t,multiplier:t.multiplier*(1+rank(u,6,1))}))};
        return {...a};
      },
      modifiers(b,u,actor,to,a,kind){
        if(actor!==u||to.side===u.side)return {};
        const out={};
        // 行迹 point07 解形：追加攻击暴击伤害 +36%；终结技伤害被视为追加攻击。
        if(trace(u,2)&&(kind==='followup'||a.type==='Ultra'))out.critDmg=(out.critDmg??0)+trace(u,2)[0];
        // E6：终结技全属性抗性穿透 +20%（E6 下天赋追击也视为终结技伤害）。
        if(rank(u,6)&&a.type==='Ultra')out.resPen=(out.resPen??0)+rank(u,6,0);
        return out;
      },
      display(b,u,to){
        if(to!==u)return [];
        return [{type:'resource',id:u.id+':feixiao-fei',source:u.id,name:'飞黄',key:'marker',
          value:u.energy,derived:true}];
      },
    };
  },

  // ══════════════════════════ 1224 三月七（虚数 · 巡猎） ══════════════════════════
  // 普攻 122401：Normal[0]=140% 攻击力，随后获得 Normal[1]=1 点充能。
  // 战技 122402：指定我方单体为【师父】，师父速度 +BPSkill[0]=12%；普攻 / 每段强化普攻命中时，
  //   若师父命途属于 智识/毁灭/巡猎/记忆/欢愉 → 附加伤害 BPSkill[1]=25% 攻击力（师父属性）；
  //   属于 同谐/虚无/存护/丰饶 → 本次伤害削韧提高 BPSkill[2]=100%。
  // 强化普攻 122408：初始 3 段（#4），每段 #1=112% 攻击力；最后一段后按 #2=60% 固定概率追加 1 段，
  //   最多 #3=3 段；恢复能量 30 且不回战技点。
  // 天赋 122404：【师父】施放攻击或终结技后三月七获得最多 1 点充能；充能 ≥ #1=7 时立即行动、
  //   伤害提高 #2=100%、普攻强化且无法施放战技；施放强化普攻后消耗 7 点；充能上限 #3=10。
  // 终结 122403：Ultra[0]=288% 攻击力；下一次强化普攻初始段数 +Ultra[1]=2，
  //   额外段数的固定概率 +Ultra[2]=20%。
  // 行迹 point06 惊鸿：战斗开始行动提前 25%；point07 玲珑：可削减师父属性弱点的韧性、击破触发虚数效果；
  //   point08 斡波：强化普攻后师父暴击伤害 +60%、击破特攻 +36%、2 回合。
  // E1：场上有师父时自身速度 +10%；E2：师父普攻或战技攻击后三月七立即追击（ranks[2][0]=60% 攻击力、
  //   削韧 ranks[2][3]=15）并 +ranks[2][2]=1 点充能，每回合最多 1 次；
  // E4：回合开始回 ranks[4]=5 点能量；E6：终结技后下一次强化普攻暴击伤害 +ranks[6]=50%。
  1224:function(api){
    const {live,allies,enemies,rank,trace,buff,resource,energy,advance,damageTo,combatPanel,record,get}=api;
    const masterOf=(b,u)=>{const id=u.resources['师父'];return id==null?null:get(b,id);};
    const charge=u=>u.resources['充能']??0;
    function grantCharge(b,u,n){
      const P=u.kit.params;
      resource(b,u,'充能',Math.min(P.Talent[2],charge(u)+n));
      if(charge(u)>=P.Talent[0]&&!(u.resources['强化']??0)){
        resource(b,u,'强化',1);
        buff(b,u,u,'师父，我悟了！ · 增伤','dmgBoost',P.Talent[1],null,{id:u.id+':march-enhance',tag:'marchEnhance'});
        advance(b,u.id,1);
        record(b,'mechanic',u,{name:'充能满 · 立即行动'});
      }
    }
    function applyMaster(b,u,to){
      const m=masterOf(b,u);
      if(!m||!live(m))return;
      if(MARCH_DAMAGE_PATHS.includes(m.path))
        damageTo(b,u,to,{name:'师父 · 附加伤害',type:'Additional',element:m.element,
          terms:atk(u.kit.params.BPSkill[1]),toughness:0},1,'primary','additional');
    }
    return {
      start(b,u){
        const P=u.kit.params;
        resource(b,u,'充能',0);
        resource(b,u,'强化',0);
        resource(b,u,'E6待触发',0);
        resource(b,u,'本回合已触发追击',0);
        if(trace(u,1))advance(b,u.id,trace(u,1)[0]);
        if(u.kit.technique){
          energy(b,u,P.Maze[1]);
          const mates=allies(b,u).filter(x=>x!==u&&x.kit?.technique).length;
          if(mates>0)grantCharge(b,u,Math.min(P.Maze[0],mates));
        }
      },
      shouldUseSkill(b,u){
        if(u.resources['强化'])return false;   // 强化普攻状态无法施放战技
        return !live(masterOf(b,u));
      },
      prepare(b,u,key,kind,a){
        if(key==='basic'&&u.resources['强化'])return {...u.actions.enhancedBasic};
        return {...a};
      },
      before(b,u,actor,key,kind,a,selected){
        if(actor!==u)return;
        const P=u.kit.params,to=selected[0];
        if(!to||!live(to))return;
        const m=masterOf(b,u);
        // 行迹 point07 玲珑：师父属性弱点 → 本次攻击可削该弱点（击破按三月七的虚数属性结算）。
        if(trace(u,2)&&m&&live(m)&&(to.weaknesses??[]).includes(m.element))
          buff(b,u,to,'玲珑 · 师父属性弱点','marker',0,null,{id:u.id+':march-weak:'+to.id,weakness:'Imaginary'});
        // 同谐 / 虚无 / 存护 / 丰饶师父：普攻与 E2 追击的削韧提高 BPSkill[2]=100%（临时击破效率，动作内生效）。
        const support=m&&live(m)&&!MARCH_DAMAGE_PATHS.includes(m.path);
        if(support&&['basic','followup'].includes(key)&&!(u.resources['强化']??0))
          buff(b,u,u,'师父 · 削韧提高','breakEfficiency',P.BPSkill[2],null,{id:u.id+':march-tough'});
        if(key!=='basic'||!(u.resources['强化']??0))return;
        // ── 强化普攻 Skill11_Phase02：初始 r[3]=3（+终结 Ultra[1]=2）段，逐段 112%，
        //    最后一段后固定概率 r[1]（+Ultra[2]）追加、最多 r[2]=3 段。伤害逐段即时结算。
        const r=rowFor(1224,122401,122408,P.Normal[0]);
        const enh=u.buffs.some(e=>e.tag==='marchUltEnhance');
        const segs=(r[3]??3)+(enh?P.Ultra[1]:0);
        const chance=(r[1]??0)+(enh?P.Ultra[2]:0);
        let extra=0;
        while(extra<(r[2]??0)&&b.random()<chance)extra++;
        const total=segs+extra,share=1/Math.max(1,total);
        const tempId=u.id+':march-tough';
        if(support)buff(b,u,u,'师父 · 削韧提高','breakEfficiency',P.BPSkill[2],null,{id:tempId});
        const e6=(u.resources['E6待触发']??0)>=1;
        if(e6)buff(b,u,u,'三月七 E6 · 暴击伤害','critDmg',rank(u,6),null,{id:u.id+':march-e6temp'});
        for(let i=0;i<total;i++){
          if(!live(to))break;
          damageTo(b,u,to,{name:'一扎眉攒，二扎心',type:'Normal',element:'Imaginary',
            terms:atk(r[0]??0),toughness:st(1224,122408,0)*share},1,'primary','direct');
          applyMaster(b,u,to);
        }
        if(support)u.buffs=u.buffs.filter(e=>e.id!==tempId);
        if(e6)u.buffs=u.buffs.filter(e=>e.id!==u.id+':march-e6temp');
        resource(b,u,'E6待触发',0);
        resource(b,u,'强化普攻段数',total);
        void kind;void a;
      },
      after(b,u,actor,key,kind,a,selected,hitTargets){
        const P=u.kit.params;
        const m=masterOf(b,u);
        if(actor!==u){
          if(actor.side!==u.side||kind==='technique')return;
          if(actor!==m)return;
          const attack=!!a&&((a.terms?.length??0)>0||(a.bounceTerms?.length??0)>0);
          if(!attack)return;
          // 天赋：师父攻击或终结技后三月七 +1 点充能（每次最多 1 点）。
          grantCharge(b,u,1);
          // E2：师父普攻 / 战技攻击后立即追击（每回合最多 1 次）并 +ranks[2][2]=1 点充能。
          if(rank(u,2)&&['basic','skill'].includes(key)&&hitTargets.length&&!(u.resources['本回合已触发追击']??0)){
            resource(b,u,'本回合已触发追击',1);
            b.queue.push({actor:u.id,key:'followup',kind:'followup',targetId:hitTargets[0].id});
            grantCharge(b,u,rank(u,2,2));
          }
          return;
        }
        const to=hitTargets[0]??selected[0];
        if(key==='skill'&&kind!=='copy'){
          const target=selected[0];
          if(target&&live(target)){
            for(const t of b.units)t.buffs=t.buffs.filter(e=>e.tag!=='marchMaster');
            resource(b,u,'师父',target.id);
            buff(b,u,target,'师父','speedPct',P.BPSkill[0],null,{id:u.id+':march-master',tag:'marchMaster'});
          }
        }
        if(key==='basic'){
          if(u.resources['强化']){
            // 强化普攻结算：消耗 Talent[0]=7 点充能，消耗终结技强化与 E6 待触发，并给师父行迹 point08。
            resource(b,u,'充能',Math.max(0,charge(u)-P.Talent[0]));
            u.buffs=u.buffs.filter(e=>e.tag!=='marchEnhance'&&e.tag!=='marchUltEnhance');
            resource(b,u,'强化',0);
            const mt=masterOf(b,u);
            if(trace(u,3)&&mt&&live(mt)){
              buff(b,u,mt,'斡波 · 暴击伤害','critDmg',trace(u,3)[0],trace(u,3)[2],{id:u.id+':march-wobo-cd'});
              buff(b,u,mt,'斡波 · 击破特攻','breakEffect',trace(u,3)[1],trace(u,3)[2],{id:u.id+':march-wobo-be'});
            }
          } else {
            // 普通普攻：获得 Normal[1]=1 点充能 + 师父命途效果。
            grantCharge(b,u,P.Normal[1]);
            if(to&&live(to))applyMaster(b,u,to);
          }
        }
        if(key==='ultimate'){
          // 终结技：下一次强化普攻初始段数 +Ultra[1]=2、固定概率 +Ultra[2]=20%。
          buff(b,u,u,'盖世女侠三月七 · 强化','marker',0,null,{id:u.id+':march-ultenh',tag:'marchUltEnhance'});
          if(rank(u,6))resource(b,u,'E6待触发',1);
        }
        if(key==='followup'&&to&&live(to))applyMaster(b,u,to);
        // 行迹 point07 玲珑的临时弱点标记与「师父削韧提高」只作用于本次动作。
        if(['basic','followup'].includes(key)){
          for(const t of b.units)t.buffs=t.buffs.filter(e=>e.id!==u.id+':march-weak:'+t.id);
          u.buffs=u.buffs.filter(e=>e.id!==u.id+':march-tough');
        }
        void a;
      },
      turnStart(b,u,actor){
        if(actor!==u)return;
        resource(b,u,'本回合已触发追击',0);
        if(rank(u,4))energy(b,u,rank(u,4));
      },
      panel(b,u,to,out){
        if(to!==u)return;
        const m=masterOf(b,u);
        // E1：场上存在【师父】时自身速度 +10%。
        if(rank(u,1)&&m&&live(m))out.speed+=(u.baseSpeed??u.panel.speed)*rank(u,1);
      },
      display(b,u,to){
        if(to!==u)return [];
        return [{type:'resource',id:u.id+':march-charge',source:u.id,name:'充能',key:'marker',
          value:charge(u),derived:true}];
      },
    };
  },

  // ══════════════════════════ 1305 真理医生（虚数 · 巡猎） ══════════════════════════
  // 天赋 130504：施放战技后按固定概率 Talent[1]=40% + Talent[2]=20%×目标负面效果数
  //   发动追加攻击，造成 Talent[0]=337.5% 攻击力虚数伤害。
  // 终结 130503：Ultra[0]=288% 攻击力并附上【智者的短见】：队友攻击该目标时真理医生发动 1 次天赋追击，
  //   最多触发 Ultra[1]=2 次（E6 +ranks[6][0]=1），仅对最新终结技目标生效。
  // 行迹 point06 归纳：施放战技时目标每有 1 个负面效果叠 1 层（最多 trace[2]=6 层，E1 上限 +4 并开场 +4 层），
  //   每层暴击率 +trace[0]=2.5%、暴击伤害 +trace[1]=5%。
  // 行迹 point07 演绎：战技命中后按 trace[0]=100% 基础概率使目标效果抵抗 -trace[1]=10%、trace[2]=2 回合。
  // 行迹 point08 推理：造成伤害时若目标负面 ≥trace[0]=3，每 1 个负面伤害 +trace[1]=10%，最多 trace[2]=50%。
  // E2：追击击中目标时每有 1 个负面额外造成 ranks[2][0]=20% 攻击力附加伤害，每次追击最多 ranks[2][1]=4 次。
  // E4：触发天赋时额外回 ranks[4]=15 点能量；E6：天赋追击伤害 +ranks[6][1]=50%（视为"追加攻击"增伤）。
  1305:function(api){
    const {live,allies,enemies,rank,trace,buff,resource,energy,damageTo,combatPanel,record}=api;
    const debuffCount=to=>to.buffs.filter(e=>e.debuff).length+to.dots.length;
    const insight=u=>u.resources['归纳层数']??0;
    function setInsight(b,u,n){
      const t=trace(u,1);
      if(!t)return;
      const cap=t[2]+(rank(u,1)?rank(u,1,0):0),v=Math.max(0,Math.min(cap,n));
      resource(b,u,'归纳层数',v);
      if(v>0){
        buff(b,u,u,'归纳 · 暴击率','critRate',t[0]*v,null,{id:u.id+':ratio-insight-cr',stacks:v});
        buff(b,u,u,'归纳 · 暴击伤害','critDmg',t[1]*v,null,{id:u.id+':ratio-insight-cd',stacks:v});
      } else {
        u.buffs=u.buffs.filter(e=>e.id!==u.id+':ratio-insight-cr'&&e.id!==u.id+':ratio-insight-cd');
      }
    }
    function triggerFollow(b,u,to){
      if(!to)return;
      b.queue.push({actor:u.id,key:'followup',kind:'followup',targetId:to.id});
      if(rank(u,4))energy(b,u,rank(u,4));
      record(b,'mechanic',u,{name:'我思故我在 · 追加攻击',target:to.id});
    }
    return {
      start(b,u){
        resource(b,u,'归纳层数',0);
        setInsight(b,u,0);
        // E1：战斗开始时立即获得 ranks[1][1]=4 层【归纳】。
        if(rank(u,1))setInsight(b,u,rank(u,1,1));
      },
      // 秘技 130507：与领域内敌人进入战斗后按 Maze[1]=100% 基础概率使敌方全体速度 -Maze[2]=15%、
      //   Maze[3]=2 回合。
      entry(b,u){
        const P=u.kit.params;
        for(const to of enemies(b,u)){
          const chance=P.Maze[1]*(1+(combatPanel(u).effectHit??0))*(1-(combatPanel(to).effectRes??0));
          if(chance<1&&b.random()>=chance){record(b,'resist',to,{name:'偶像塑造 被抵抗'});continue;}
          buff(b,u,to,'偶像塑造 · 速度降低','speedPct',-P.Maze[2],P.Maze[3],
            {id:u.id+':ratio-maze:'+to.id,debuff:true});
        }
      },
      after(b,u,actor,key,kind,a,selected,hitTargets){
        // 【智者的短见】：队友攻击持有标记的目标时发动 1 次天赋追击（消耗 1 次）。
        if(actor!==u&&actor.side===u.side&&hitTargets.length&&(u.resources['短见次数']??0)>0){
          const marked=hitTargets.find(t=>live(t)&&t.buffs.some(e=>e.tag==='ratioMark'));
          if(marked){
            resource(b,u,'短见次数',(u.resources['短见次数']??0)-1);
            triggerFollow(b,u,marked);
            if((u.resources['短见次数']??0)<=0)for(const t of b.units)t.buffs=t.buffs.filter(e=>e.tag!=='ratioMark');
          }
        }
        if(actor!==u)return;
        const P=u.kit.params;
        if(key==='skill'&&kind!=='copy'){
          const to=hitTargets[0]??selected[0];
          if(!to||!live(to))return;
          // 归纳：本次施放叠加 = 目标负面效果数（受上限约束）。
          setInsight(b,u,insight(u)+debuffCount(to));
          // 演绎：100% 基础概率降低效果抵抗。
          if(trace(u,2)){
            const chance=trace(u,2)[0]*(1+(combatPanel(u).effectHit??0))*(1-(combatPanel(to).effectRes??0));
            if(chance<1&&b.random()>=chance)record(b,'resist',to,{name:'演绎 被抵抗'});
            else buff(b,u,to,'演绎 · 效果抵抗降低','effectRes',-trace(u,2)[1],trace(u,2)[2],
              {id:u.id+':ratio-slow:'+to.id,debuff:true});
          }
          // 天赋：固定概率发动追加攻击。
          if(b.random()<P.Talent[1]+P.Talent[2]*debuffCount(to))triggerFollow(b,u,to);
        }
        if(key==='ultimate'){
          // 【智者的短见】：移除旧标记，只保留最新目标；触发次数 Ultra[1]=2（E6 +1）。
          for(const to of b.units)to.buffs=to.buffs.filter(e=>e.tag!=='ratioMark');
          const to=selected[0]??hitTargets[0];
          if(to&&live(to))buff(b,u,to,'智者的短见','marker',0,null,{id:u.id+':ratio-mark:'+to.id,tag:'ratioMark',debuff:true});
          resource(b,u,'短见次数',P.Ultra[1]+(rank(u,6)?rank(u,6,0):0));
        }
        // E2：追击击中目标时，每 1 个负面额外造成 20% 攻击力附加伤害，最多 4 次。
        if(key==='followup'&&rank(u,2)){
          const to=hitTargets[0]??selected[0];
          if(to&&live(to)){
            const n=Math.min(rank(u,2,1),debuffCount(to));
            for(let i=0;i<n;i++)damageTo(b,u,to,{name:'真理医生 E2 · 附加伤害',type:'Additional',
              element:'Imaginary',terms:atk(rank(u,2,0)),toughness:0},1,'primary','additional');
          }
        }
        void a;
      },
      modifiers(b,u,actor,to,a,kind){
        if(actor!==u||to.side===u.side)return {};
        const out={};
        // 行迹 point08 推理：目标负面 ≥3 时，每 1 个负面伤害 +10%，最多 +50%。
        if(trace(u,3)){
          const n=debuffCount(to);
          if(n>=trace(u,3)[0])out.dmgBoost=(out.dmgBoost??0)+Math.min(trace(u,3)[2],trace(u,3)[1]*n);
        }
        // E6：天赋追击伤害 +50%。
        if(rank(u,6)&&kind==='followup')out.dmgBoost=(out.dmgBoost??0)+rank(u,6,1);
        return out;
      },
      display(b,u,to){
        if(to!==u)return [];
        return [{type:'resource',id:u.id+':ratio-insight',source:u.id,name:'归纳层数',key:'marker',
          value:insight(u),derived:true},
          {type:'resource',id:u.id+':ratio-mark-count',source:u.id,name:'智者的短见剩余次数',
            key:'marker',value:u.resources['短见次数']??0,derived:true}];
      },
    };
  },
};

export {factories,actions};
