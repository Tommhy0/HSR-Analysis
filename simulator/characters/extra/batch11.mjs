// DeepSeek batch-11：6 名「记忆」命途（忆灵）角色（4.6 固定数据）。
//
// 数值索引逐条核对 `_data_cache/hsr_core.json`：
//   · 角色技能 desc 的 `#n` ↔ `params[等级].param_list`（普攻 6 级、其余 10 级、秘技 1 级）；
//   · 忆灵（`characters[].memosprite.skills`）的参数单独列在下方 SERVANT 常量里，来源同为
//     hsr_core.json 的 `characters[<id>].memosprite.skills[<skillId>].level['10'].param_list`
//     （`build_data.mjs` 第 127~219 行的 servantSkills / servantSupport 分流说明）。
// 段数 / 时序取自 `_data_cache/strict_research/Avatar_<Name>_00_Ability.json`，经
// `_scripts/build_roster_evidence.py` 编译进 `simulator/roster-data.mjs` 的 `hits`：
//   1402 阿格莱雅   Avatar_Aglaea_00_Ability.json      Skill01_Phase02=[.2,.2,.6] Skill11_Phase02=[.25×8]
//   1407 遐蝶       Avatar_Castorice_00_Ability.json   Skill01_Phase02=[.2,.8] Skill02/21_Phase02=[1,1]
//   1409 风堇       Avatar_Hyacine_00_Ability.json     Skill01_Phase02=[1]
//   1413 长夜月     Avatar_Evernight_00_Ability.json   Skill01_Phase02=[1] Skill03_Servant_Damage=[1]
//   1415 昔涟       Avatar_Cyrene_00_Ability.json      Skill01_Phase02=[1] Skill11_Phase02=[1,.3,.7]
//   1512 知更鸟•晴歌 Avatar_RobinS_00_Ability.json      Skill01_Phase02=[1]
// 固定提交 312b4597691e0a29cf9828a15b592757dba86949；逐角色 sha256 见 data/combat/roster-evidence.json。
//
// ── 忆灵（memosprite）如何建模（复用引擎既有契约，不另起一套）─────────────────
//   ① 忆灵 = `b.units` 中 `side==='ally'` 且带 `memospriteOwner=<召唤者 id>` 的单位
//      —— `engine.mjs` validateBattle 第 31/32 行、`relic-runtime.mjs` 的 `spirit()`、
//      `sunday.mjs` 的「忆灵立即行动」都按这个字段识别忆灵；
//   ② 忆灵的 `panel.hp` = 召唤者局内生命上限 × pct + flat（pct/flat 出自 `memosprite_json`
//      的 `hp_inherit`/`hp_base`，索引指进 `hp_skill` 参数表，与 `core/abilities.mjs` 的
//      `servantHpFactor()` 同一口径：衣匠 66%+720、小伊卡 50%、长夜 50%、德谬歌 100%、晴空乐手 70%）；
//   ③ 忆灵回合 = 普通单位回合，`policy.basicOnly` 让它固定施放 `actions.basic`（忆灵技）。
//      速度为 0 的忆灵（小伊卡 / 德谬歌）按说明「不会出现在行动序列上」，以 `cannotAct`
//      + 名义速度 1 保留在场状态，由召唤者钩子用 `useAction(b,<忆灵>,'basic','extra')` 触发额外回合；
//   ④ 需要出现在行动序列、但不是战斗单位的倒计时（【至高之姿】/【Fever】）走共享的
//      `b.summons` + `kind:'countdown'` + `summonTurn(b,u,s)` 钩子（batch04/07/08、robin.mjs 同路径）。
//   忆灵自己的攻击力库里没有（`build_data.mjs` 第 149 行明说），衣匠的攻击力按游戏内忆灵
//   继承规则取召唤者攻击力，最终报告里标为待补数据。
import {atk,hp,basic,skill,ultimate,talentAction} from '../actions.mjs';
import {ROSTER_DATA} from '../../roster-data.mjs';

export const IDS=[1402,1407,1409,1413,1415,1512];

const list=(d,type)=>Object.values(d.skills).find(s=>s.type===type);
const mazeStance=id=>list(ROSTER_DATA[id],'Maze')?.stance?.[0]??0;
const has=(u,tag)=>u.buffs.some(e=>e.tag===tag);
const tagOf=(u,tag)=>u.buffs.find(e=>e.tag===tag);
const memOf=(b,owner)=>b.units.find(t=>t.memospriteOwner===owner.id&&t.active!==false&&t.hp>1e-8);
const memAny=(b,owner)=>b.units.find(t=>t.memospriteOwner===owner.id);

// ── 忆灵技 / 忆灵天赋参数（hsr_core.json，忆灵技能等级 10）────────────────────────
const SERVANT={
  1140201:{name:'刺纹之陷',element:'Thunder',stance:[30,0,15],p:[1.54,.924,1]},                          // 1402 衣匠忆灵技
  1140203:{name:'泪水锻造的匠躯',p:[63.8,3,6]},                                                          // 1402 +63.8 速度/层，上限 6 层
  1140205:{name:'飞驰之夏',p:[1]},                                                                       // 1402 被召唤行动提前 100%
  1140206:{name:'枯草之盈',p:[20]},                                                                      // 1402 消失回 20 能
  1140701:{name:'擘裂冥茫的爪痕',element:'Quantum',stance:[0,30,0],p:[.56]},                             // 1407 死龙
  1140702:{name:'燎尽黯泽的焰息',element:'Quantum',stance:[0,30,0],p:[.25,.336,.392,.476,.25]},          // 1407
  1140703:{name:'月茧荫蔽的身躯',p:[5]},                                                                 // 1407 后援
  1140705:{name:'震彻寂壤的怒啸',p:[.1,3]},                                                              // 1407 召唤时全队增伤 10%/3 回合
  1140706:{name:'灼掠幽墟的晦翼',element:'Quantum',stance:[15,0,0],p:[.56,6,.084,1120]},                 // 1407 弹射 + 治疗
  1140901:{name:'乌云乌云快走开！',element:'Wind',stance:[0,30,0],p:[.28,.5]},                           // 1409 小伊卡
  1140903:{name:'牵起晴空的手',p:[.04,.028,28,.028,28]},                                                 // 1409 忆灵天赋
  1140905:{name:'展翼，奔向日辉',p:[15,30]},                                                             // 1409 被召唤回能
  1140906:{name:'坠落，然后飞翔',p:[.3]},                                                                // 1409 消失时行动提前 30%
  1141301:{name:'追忆，蹁跹，如雨',element:'Ice',stance:[30,0,0],p:[.7,.14,4,1]},                        // 1413 长夜
  1141303:{name:'孤独，浮游，漆黑',p:[.7,3]},                                                            // 1413 长夜在场：双方增伤 70%
  1141305:{name:'与夜，形影，不离',p:[]},                                                                // 1413 被召唤立即行动
  1141306:{name:'与你，再见，无期',p:[.1,.01,40]},                                                       // 1413 消失加速
  1141307:{name:'迷梦，流失，如露',element:'Ice',stance:[90,60,0],p:[.168,.084,16]},                     // 1413 消耗全部忆质
  1141501:{name:'花与箭的舞曲',element:'Ice',stance:[5,30,0],p:[.84,12]},                                // 1415 德谬歌
  1141502:{name:'此诗，献予一切生命',p:[12,.56,2]},                                                    // 1415 德谬歌：普通队友增伤56%/2回合
  1141513:{name:'献予「创世」之诗',p:[.224,1.008,1]},                                                // 记忆开拓者：德谬歌生命转攻击、暴击转暴击率；强化普攻后舞曲额外回合
  1141517:{name:'献予「生死」之诗',p:[0,.00336,2,0,.00672,2]},                                         // 遐蝶：新蕊可溢出至200%，提升召唤时晦翼倍率
  1141524:{name:'献予「岁月」之诗',p:[.252,1,.168]},                                                  // 长夜月：迷梦增伤、技能/终结额外忆质、技能暴伤加成+16.8%
  1141520:{name:'献予「诡计」之诗',p:[.504,.28,.168]},                  // 赛飞儿：自身伤害+50.4%，标记目标防御-28%，其他敌人-16.8%
  1141514:{name:'献予「浪漫」之诗',p:[70,1.008,.504]},                         // 阿格莱雅/衣匠：回能、增伤与无视防御
  1141515:{name:'献予「门径」之诗',p:[1,.168,3]},                            // 缇宝：无视防御 16.8%，追加攻击额外附加伤害
  1141518:{name:'献予「理性」之诗',p:[3,.56,.84,1]},                          // 那刻夏：战技次数/战技增伤/智识攻击/战技点
  1141519:{name:'献予「天空」之诗',p:[1.008,33.6]},                          // 风堇：治疗转化 +100.8%，回能 33.6
  1141522:{name:'献予「海洋」之诗',p:[1.68,.84,1.12,60]},                 // 海瑟音：伤害+168%；普攻/战技引爆 DoT 84%/112%，首次攻击回能60
  1141523:{name:'献予「律法」之诗',p:[.42,1]},                               // 刻律德菈：军功持有者暴伤 +42%，奇袭结束充能 +1
  1141503:{name:'等待，在所有的过去',p:[.336,0]},                                                        // 1415 生命上限 +33.6%
  1141505:{name:'「你好，世界♪」',p:[]},                                                                 // 1415 被召唤解除控制
  1141526:{name:'献予「真我」之诗',p:[.84,3]},                                                           // 1415 额外弹射 / 3 点故事
  1151201:{name:'叽叽啾啾四重奏',element:'Wind',stance:[0,30,0],p:[0,2.1]},                              // 1512 晴空乐手
  1151203:{name:'扑翅雀跃的和声',p:[.84,.028,.112,.168,.224,12,0,0,140,.5]},                              // 1512 Fever / 倒计时
  1151205:{name:'贴近海的心跳',p:[20]},                                                                  // 1512 被召唤回能
  1151206:{name:'乘上夏夜晚风',p:[.5]},                                                                  // 1512 消失行动提前 50%
};
const SV=id=>SERVANT[id].p;

// ── 忆灵单位生成 / 刷新 ─────────────────────────────────────────────────────
function spawnServant(b,u,spec,api){
  const id=u.id+':'+spec.key,cur=b.units.find(t=>t.id===id);
  const base=api.combatPanel(u),maxHp=Math.max(1,spec.hpOf(base,u)),speed=Math.max(spec.speedFloor??1,spec.speedOf(base,u));
  if(cur){
    // 复用同一单位 id（引擎按 id 查找；重复 id 会让「离场 / 在场」判定互相踩）。
    const down=cur.active===false||cur.hp<=1e-8,wasFull=down||cur.hp>=cur.panel.hp-1e-6;
    cur.panel.hp=maxHp;cur.panel.atk=base.atk;cur.panel.def=base.def;cur.panel.speed=speed;cur.baseSpeed=speed;
    cur.panel.baseStats={hp:maxHp,atk:base.baseStats?.atk??base.atk,def:base.baseStats?.def??base.def};
    if(spec.cannotAct!=null)cur.cannotAct=!!spec.cannotAct;
    cur.active=true;
    cur.hp=wasFull?maxHp:Math.min(cur.hp,maxHp);
    return cur;
  }
  const s={id,name:spec.name,side:u.side,level:u.level,element:spec.element,memospriteOwner:u.id,
    panel:{...base,hp:maxHp,atk:base.atk,def:base.def,speed,baseStats:{hp:maxHp,atk:base.baseStats?.atk??base.atk,def:base.baseStats?.def??base.def},elemDmg:{...base.elemDmg}},
    baseSpeed:speed,energyMax:0,energy:0,actions:spec.actions(),policy:{autoUltimate:false,basicOnly:true},
    aggro:spec.aggro??100,toughnessMax:0,toughness:0,broken:false,res:{},
    order:b.units.reduce((n,t)=>Math.max(n,t.order??0),0)+1,
    active:true,distance:spec.advance?0:10000,advanceOrder:0,shields:[],buffs:[],dots:[],resources:{},turns:0,skipTurns:0,
    cannotAct:!!spec.cannotAct,servantKey:spec.key,hp:maxHp};
  Object.defineProperty(s,'battle',{value:b});
  b.units.push(s);b.rules?.unitCreated?.(b,s);api.record(b,'summon',u,{name:'召唤忆灵：'+spec.name,target:s.id});
  return s;
}
function dismissServant(b,u,s,api){
  if(!s||s.active===false)return false;
  s.hp=0;s.active=false;
  api.record(b,'mechanic',u,{name:'忆灵离场',target:s.id,targetName:s.name});
  return true;
}
function loseHp(b,u,to,ratio,api){
  const requested=Math.max(0,to.hp*ratio),lost=Math.min(Math.max(0,to.hp-1),requested);
  if(!(lost>0))return 0;
  to.hp-=lost;
  b.rules?.hpChanged?.(b,to,'consume',lost,u);
  b.rules?.relics?.healthConsumed?.(b,to);
  api.record(b,'hp_consume',u,{target:to.id,amount:lost,hp:to.hp});
  // 1140703：队友生命消耗无法低于1点；超过这条下限的原始消耗由死龙承担500%。
  const overflow=requested-lost,owner=b.units.find(x=>x.characterId===1407&&x.kit&&x.side===to.side);
  const dragon=owner&&memOf(b,owner);
  if(overflow>0&&dragon&&to!==dragon&&to.memospriteOwner!==owner.id){
    const payment=overflow*SERVANT[1140703].p[0];dragon.hp=Math.max(0,dragon.hp-payment);
    if(payment>0)b.rules?.hpChanged?.(b,dragon,'consume',payment,u);
    api.record(b,'hp_consume',u,{target:dragon.id,amount:payment,hp:dragon.hp,reason:'月茧荫蔽的身躯 · 超出1点下限'});
    if(dragon.hp<=1e-8){dragon.active=false;b.rules?.sync?.(b);api.record(b,'death',dragon);b.rules?.death?.(b,u,dragon);}
  }
  return lost;
}
const atkT=m=>({scaling:'atk',multiplier:m});
const hpT=m=>({scaling:'hp',multiplier:m});

const factories={
  // ═════════════════════════ 1402 阿格莱雅（雷 · 记忆） ═════════════════════════
  // 普攻 刺纹之蜜 Normal[0]=1.4（Skill01_Phase02 三段 .2/.2/.6，削韧 30，回 1 战技点）。
  // 战技 高举吧，升华的名讳 BPSkill[0]=0.5（回复衣匠生命上限 50%），无伤害。
  // 终结 共舞吧，命定的衣匠 Ultra[0]=0.15（每层速度%）、Ultra[3]=100（倒计时速度）。
  // 天赋 金玫之指 Talent[0]=0.3 附加伤害、Talent[3]=0.35 衣匠速度系数、Talent[4]=0.66/Talent[5]=720。
  // 强化普攻 孤锋千吻（140208）Skill11_Phase02=8 段各 .25：主目标 2.8+2.8、相邻 1.26+1.26，削韧 60/30。
  // 秘技 披星百裂 Maze[0]=1.0 全体雷伤（削韧 60）、Maze[1]=30 回能。
  // 行迹 point06[7.2,3.6]（百分数）至高之姿攻击 = 速度×7.2%+衣匠速度×3.6%；point07[1]；point08[0.5,0.5]。
  // E1[.15,20]、E2[.14,3]、E4 速度层数上限+1、E6[.2,.1,.3,.6]。
  1402:function(api){
    const {rank,trace,buff,resource,energy,damageTo,combatPanel,record,advance,heal,allies,enemies}=api;
    const P=u=>u.kit.params, supreme=u=>has(u,'aglaeaSupreme');
    const mem=(b,u)=>memOf(b,u);
    const servantActions=()=>({basic:{name:SERVANT[1140201].name,type:'Talent',element:'Thunder',target:'blast',
      terms:[atkT(SV(1140201)[0]),{...atkT(SV(1140201)[1]),target:'adjacent'}],hitShares:[1],
      energyGain:0,spCost:0,spGain:0,toughness:SERVANT[1140201].stance[0],adjacentToughness:SERVANT[1140201].stance[2]}});
    function applyRomancePower(b,u,s){
      const sourceId=u.resources['Cyrene浪漫诗篇来源'];if(!sourceId)return;
      const source=b.units.find(x=>x.id===sourceId);if(!source)return;
      const p=SV(1141514);
      for(const t of [u,s].filter(Boolean)){
        buff(b,source,t,'献予「浪漫」之诗 · 伤害提高','dmgBoost',p[1],null,{id:source.id+':aglaea-poem-dmg:'+t.id,tag:'cyreneAglaeaPower:'+source.id});
        buff(b,source,t,'献予「浪漫」之诗 · 无视防御','defIgnore',p[2],null,{id:source.id+':aglaea-poem-def:'+t.id,tag:'cyreneAglaeaPower:'+source.id});
      }
    }
    function spawnGarment(b,u,advanceIt){
      const speedOf=base=>base.speed*P(u).Talent[3]+(mem(b,u)?.resources?.['速度层数']??u.resources['Cyrene浪漫诗篇速度层数']??0)*SV(1140203)[0];
      const s=spawnServant(b,u,{key:'garmentmaker',name:'衣匠',element:'Thunder',aggro:125,advance:advanceIt,
        hpOf:base=>base.hp*P(u).Talent[4]+P(u).Talent[5],speedOf,actions:servantActions},api);
      const poemStacks=u.resources['Cyrene浪漫诗篇速度层数'];
      if(poemStacks)resource(b,s,'速度层数',poemStacks);
      applyRomancePower(b,u,s);
      if(advanceIt){s.distance=0;s.advanceOrder=(b.advanceSequence=(b.advanceSequence??0)+1);}
      return s;
    }
    function endSupreme(b,u){
      const s=mem(b,u);
      if(s){dismissServant(b,u,s,api);energy(b,u,SV(1140206)[0]);}
      const sourceId=u.resources['Cyrene浪漫诗篇来源'];
      if(sourceId)for(const t of [u,s,...b.units.filter(x=>x.memospriteOwner===u.id)])if(t)t.buffs=t.buffs.filter(e=>e.tag!=='cyreneAglaeaPower:'+sourceId);
      u.buffs=u.buffs.filter(e=>e.tag!=='aglaeaSupreme');
      const cd=b.summons.find(x=>x.id===u.id+':supreme');if(cd)cd.active=false;
    }
    function markThread(b,u,to){
      if(!to||to.side===u.side)return;
      for(const t of b.units)t.buffs=t.buffs.filter(e=>e.tag!=='aglaeaThread');
      buff(b,u,to,'间隙织线','marker',0,null,{tag:'aglaeaThread',debuff:true,removeOnSourceDeath:true});
    }
    const e2=u=>u.resources['E2层数']??0;
    function setE2(b,u,n){
      if(!rank(u,2))return;
      const v=Math.max(0,Math.min(rank(u,2,1),n));resource(b,u,'E2层数',v);
      buff(b,u,u,'阿格莱雅 E2 · 无视防御','defIgnore',rank(u,2,0)*v,null,{id:u.id+':aglaea-e2',tag:'aglaeaE2',stacks:v});
    }
    return {
      // 行迹 point06：至高之姿下阿格莱雅与衣匠攻击力提高（固定值，不能用 atkPct —— 那会乘白值）。
      panel(b,u,target,out){
        if(target!==u)return;   // roster.panel 的第 3 个参数是被计算的单位
        if(!supreme(u)||!trace(u,1)||out.speed==null||out.atk==null)return;
        const s=mem(b,u),ms=s?combatPanel(s).speed:0;
        out.atk+=out.speed*trace(u,1)[0]/100+ms*trace(u,1)[1]/100;
      },
      start(b,u){
        resource(b,u,'速度层数',0);resource(b,u,'E2层数',0);
        // 行迹 point08：战斗开始时能量不足 50% 则恢复至 50%。
        if(trace(u,3)&&u.energyMax&&u.energy<u.energyMax*trace(u,3)[0])energy(b,u,u.energyMax*trace(u,3)[1]-u.energy,true);
      },
      // 秘技：召唤衣匠并一同攻击。
      entry(b,u){
        const p=P(u),maze=ROSTER_DATA[1402].skills['140207']?.params?.['1']?.param_list??[1,30];
        spawnGarment(b,u,false);
        energy(b,u,maze[1],true);
        for(const to of enemies(b,u))damageTo(b,u,to,{name:'披星百裂',type:'Maze',element:'Thunder',terms:atk(p.Maze[0]),toughness:mazeStance(1402)},1,'primary','technique');
        const pool=enemies(b,u);if(pool.length)markThread(b,u,pool[Math.floor(b.random()*pool.length)]);
      },
      prepare(b,u,key,kind,a){
        if(kind!=='copy'&&supreme(u)&&key==='basic')return {...u.actions.enhancedBasic,targetId:a.targetId};
        return a;
      },
      shouldUseSkill(b,u){return !supreme(u);},
      before(b,u,actor,key,kind,a,selected){
        if(actor!==u)return;
        const p=P(u);
        if(key==='skill'&&kind!=='copy'){
          const s=mem(b,u);
          if(s)heal(b,u,s,combatPanel(s).hp*p.BPSkill[0]);
          else spawnGarment(b,u,true);
        }
        if(key==='ultimate'&&kind!=='copy'){
          const s=spawnGarment(b,u,true);s.hp=s.panel.hp;
          advance(b,u.id,1);
          let cd=b.summons.find(x=>x.id===u.id+':supreme');
          if(!cd){cd={id:u.id+':supreme',name:'【至高之姿】倒计时',owner:u.id,bondmate:u.id,kind:'countdown',
            speed:p.Ultra[3],distance:10000,active:true,order:b.units.length+b.summons.length};b.summons.push(cd);record(b,'summon',u,{name:'【至高之姿】倒计时'});}
          else cd.distance=10000;
          buff(b,u,u,'至高之姿','marker',0,null,{tag:'aglaeaSupreme'});
          setE2(b,u,e2(u)+1);
        }
        void selected;
      },
      after(b,u,actor,key,kind,a,selected,hitTargets){
        const p=P(u),romanceTag=tag=>String(tag??'').startsWith('cyreneAglaeaRomance:');
        if(hitTargets.length&&(actor===u||actor?.memospriteOwner===u.id)&&u.buffs.some(e=>romanceTag(e.tag))){
          u.buffs=u.buffs.filter(e=>!romanceTag(e.tag));energy(b,u,SV(1141514)[0],true);
        }
        if(actor===u){
          if(kind!=='technique'&&kind!=='copy'&&['basic','skill','ultimate','enhancedBasic'].includes(key))setE2(b,u,e2(u)+1);
          if(kind!=='technique'&&key!=='ultimate'&&hitTargets.length){
            const to=hitTargets[0];
            if(mem(b,u)&&to.side!==u.side)markThread(b,u,to);
            const marked=hitTargets.find(t=>t.side!==u.side&&t.buffs.some(e=>e.tag==='aglaeaThread'));
            if(mem(b,u)&&marked){
              // 天赋：对处于【间隙织线】的目标额外造成 30% 攻击力雷属性附加伤害。
              damageTo(b,u,marked,{name:'金玫之指 · 附加伤害',type:'Additional',element:'Thunder',terms:atk(p.Talent[0]),toughness:0},1,'primary','additional');
              if(rank(u,1))energy(b,u,rank(u,1,1));
            }
          }
          return;
        }
        // 衣匠攻击后：忆灵天赋速度 +63.8/层（上限 6，E4 +1）。
        if(actor&&actor.memospriteOwner===u.id&&hitTargets.length){
          const s=mem(b,u);if(!s)return;
          resource(b,s,'速度层数',Math.min(SV(1140203)[2]+(rank(u,4)?rank(u,4,0):0),(s.resources['速度层数']??0)+1));
          spawnGarment(b,u,false);         // 速度层数进面板（忆灵不在 roster 的 panel 钩子里，需主动刷新）
          if(rank(u,1))energy(b,u,rank(u,1,1));
          return;
        }
        // E2 层数：除自身与衣匠外任意单位主动施放技能时清空。
        if(rank(u,2)&&e2(u)&&kind!=='technique'&&kind!=='copy'&&['basic','skill','ultimate'].includes(key))setE2(b,u,0);
        void a;void selected;
      },
      // 衣匠优先攻击处于【间隙织线】的敌人（忆灵天赋 1140203 原文）。
      turnStart(b,u,actor){
        if(actor&&actor.memospriteOwner===u.id){
          const marked=b.units.find(t=>t.side!==u.side&&t.hp>1e-8&&t.buffs.some(e=>e.tag==='aglaeaThread'));
          if(marked)actor.actions.basic.targetId=marked.id;else delete actor.actions.basic.targetId;
          actor.actions.basic.terms=[atkT(SV(1140201)[0]),{...atkT(SV(1140201)[1]),target:'adjacent'}];
        }
      },
      summonTurn(b,u,s){if(s.id===u.id+':supreme'&&api.live(u))endSupreme(b,u);},
      death(b,u,from,to){
        if(to===u||to.memospriteOwner===u.id){const s=memAny(b,u);if(s)dismissServant(b,u,s,api);}
        void from;
      },
      modifiers(b,u,actor,to,a,kind){
        const out={};if(to.side===u.side)return out;
        if(rank(u,1)&&to.buffs.some(e=>e.tag==='aglaeaThread'))out.vuln=(out.vuln??0)+rank(u,1,0);
        if(rank(u,6)&&supreme(u)){
          out.resPen=(out.resPen??0)+rank(u,6,0);
          const pairs=actor===u?a?.name===u.actions.enhancedBasic.name:actor?.memospriteOwner===u.id&&a?.name===SERVANT[1140201].name;
          if(pairs){
            const sp=Math.max(combatPanel(u).speed,actor===u?0:combatPanel(actor).speed);
            out.dmgBoost=(out.dmgBoost??0)+(sp>320?rank(u,6,3):sp>240?rank(u,6,2):sp>160?rank(u,6,1):0);
          }
        }
        void kind;return out;
      },
      display(b,u){
        const s=mem(b,u),out=[];
        if(supreme(u))out.push({type:'buff',id:u.id+':supreme',source:u.id,name:'至高之姿',key:'marker',value:0,remaining:null,derived:true,tickOwner:u.id});
        if(s)out.push({type:'buff',id:s.id+':speed',source:s.id,name:'泪水锻造的匠躯 · 速度层数',key:'speed',value:s.resources['速度层数']??0,remaining:null,derived:true,tickOwner:s.id});
        return out;
      },
    };
  },

  // ═════════════════════════ 1407 遐蝶（量子 · 记忆） ═════════════════════════
  // 普攻 哀悼，死海之涟漪 Normal[0]=0.7（生命上限）Skill01_Phase02=[.2,.8]，削韧 30。
  // 战技 缄默，幽蝶之轻抚：BPSkill[0]=0.3 全体当前生命、[1]=0.5 主目标、[2]=0.3 相邻（生命上限）。
  // 强化战技 骸爪，冥龙之环拥（140709）：[0]=0.4 生命消耗、[1]=0.3 遐蝶、[2]=0.5 死龙，全体，削韧 60。
  // 终结 亡喉怒哮，苏生之颂铃：Ultra[0]=165 死龙速度、[1]=3 回合、[2]=1（死龙生命=新蕊上限 100%）、
  //   [3]=0.2 全属性抗性降低。4.6 里 energyMax 为空，引擎要求 ultimate 动作有正数能量消耗，
  //   因此终结用独立动作键 summonDragon 表达。
  // 天赋 掌心淌过的荒芜：[1]=0.2 增伤/层、[2]=3 层、[3]=3 回合。
  // 秘技 悲鸣，赐死之先声：Maze[0]=0.4 生命消耗、Maze[1]=0.5、Maze[3]=0.3。
  // 行迹 point07[0.5,0.4,1] 生命≥50% 速度+40%；point08[0.3,6] 焰息增伤。
  // E1[.8,.5,1.2,1.4]；E2[2,2,0.3] 炽意；E4[0.2]；E6[0.2,3]。
  1407:function(api){
    const {rank,trace,buff,resource,energy,damageTo,combatPanel,record,advance,heal,allies,enemies,useAction,allResDown}=api;
    const P=u=>u.kit.params;
    const mem=(b,u)=>memOf(b,u);
    // 原始 140704：均衡等级≤4 时取我方最高角色等级平方×5.3125、最低2000；均衡等级≥5 固定34000。
    // 最高等级只统计在场非忆灵角色；动态公式与 4.6 游戏数据的 FixedValues / WorldLevel 分支一致。
    const maxOf=(b,u)=>{
      const world=b.config.worldLevel??6,level=Math.max(0,...b.units.filter(t=>t.side===u.side&&!t.memospriteOwner&&api.live(t)).map(t=>t.level));
      return world<5?Math.max(2000,5.3125*level*level):34000;
    };
    const newbudCap=(b,u)=>maxOf(b,u)*(u.resources['新蕊溢出倍率']??1);
    const servantActions=()=>({
      basic:{name:SERVANT[1140702].name,type:'Talent',element:'Quantum',target:'all',terms:[],hitShares:[1],
        energyGain:0,spCost:0,spGain:0,toughness:SERVANT[1140702].stance[1],repeatCount:1}});
    const dragonTerm=(u,mult)=>[{scaling:'hp',multiplier:0,flatAdd:combatPanel(u).hp*mult}];
    const breathMult=(n,sv)=>n<=0?sv[1]:n===1?sv[2]:sv[3];
    function spawnDragon(b,u,{full=false,advanceIt=true,resetBreath=true}={}){
      const cap=Math.max(1,maxOf(b,u));
      // spawnServant 按固定 id 复用同一个忆灵对象；先判断这是不是上一条死龙消失后的重新召唤。
      const prev=b.units.find(t=>t.id===u.id+':dragon');
      const newLife=!prev||prev.active===false||prev.hp<=1e-8;
      const s=spawnServant(b,u,{key:'dragon',name:'死龙•玻吕刻斯',element:'Quantum',aggro:100,advance:advanceIt,
        hpOf:()=>cap,speedOf:()=>P(u).Ultra[0],actions:servantActions},api);
      if(newLife){
        // 上一条死龙的每次生命状态不能带进新血条：
        // 「晦翼已结算」残留会让 dismissDragon 对新死龙的死亡/到期直接早退，晦翼永不结算；
        // 「西风的驻足」只持续至原回合结束，带过血条会让新死龙从旧层数起步。
        // 有持续时间的增益同样属于上一回合，一并清除；整场生效的增益保留。
        delete s.resources['晦翼已结算'];
        s.buffs=s.buffs.filter(e=>e.tag!=='castoriceWestWind'&&e.remaining==null);
        s.dots=[];
      }
      s.resources['剩余回合']=P(u).Ultra[1];
      // 1140702：焰息倍率的提高效果只在死龙消失前保留，重新召唤时回到 0.336。
      if(resetBreath)s.resources['焰息阶数']=0;
      s.hp=full?cap:Math.max(1,Math.floor(cap/2));
      if(advanceIt){s.distance=0;s.advanceOrder=(b.advanceSequence=(b.advanceSequence??0)+1);}
      // 震彻寂壤的怒啸：被召唤时我方全体增伤 10%/3 回合。
      for(const to of allies(b,u))buff(b,u,to,'震彻寂壤的怒啸','dmgBoost',SV(1140705)[0],SV(1140705)[1],{id:u.id+':dragon-roar'});
      return s;
    }
    function dragonSummonedE2(b,u){
      if(!rank(u,2))return;
      // Rank02 is applied by both Skill03 and the Technique's SkillMaze CreateServant path.
      // E2：「炽意」最多持有 2 层；重复召唤按上限叠加。
      resource(b,u,'炽意',Math.min(rank(u,2,1),(u.resources['炽意']??0)+rank(u,2,0)));
      advance(b,u.id,1);
      resource(b,u,'E2新蕊返还',rank(u,2,2));
    }
    function wingBlast(b,u,s){
      const q=SV(1140706),p=combatPanel(u);
      const n=q[1]+(u.resources['死龙E6晦翼弹射']??0);
      resource(b,u,'死龙E6晦翼弹射',0);
      const overflow=u.resources['死龙晦翼增伤']??0;
      // 每一段重新取存活敌人，弹射中途击杀不会继续选中已死目标。
      for(let i=0;i<n;i++){
        const pool=enemies(b,u);if(!pool.length)break;
        const to=pool[Math.floor(b.random()*pool.length)];
        damageTo(b,s,to,{name:SERVANT[1140706].name,type:'Additional',element:'Quantum',
          terms:[{scaling:'hp',multiplier:0,flatAdd:p.hp*q[0]*(1+overflow)}],toughness:SERVANT[1140706].stance[0]},1,'primary','additional');
      }
      for(const to of allies(b,u))heal(b,u,to,p.hp*q[2]+q[3]);
      record(b,'mechanic',u,{name:'灼掠幽墟的晦翼',target:s.id});
    }
    // 1140706「死龙消失时」：被敌方击倒、被 1140703 的 500% 反噬耗尽、或 3 回合到期都算消失。
    // 旧实现只查 `mem()`（要求 hp>0），死龙被伤害打死时不会触发晦翼。
    function dismissDragon(b,u,dying){
      const s=dying??mem(b,u);if(!s||s.resources['晦翼已结算'])return;
      s.resources['晦翼已结算']=1;
      wingBlast(b,u,s);
      for(const to of b.units)to.buffs=to.buffs.filter(e=>!String(e.id).startsWith(u.id+':resdown:'));
      if(s.active!==false)dismissServant(b,u,s,api);
    }
    function field(b,u){
      // 遗世冥域：敌方全体全属性抗性降低 20%（走共享 allResDown，逐元素登记 7 条）。
      for(const to of enemies(b,u))allResDown(b,u,to,P(u).Ultra[3],null,'遗世冥域');
    }
    function wound(b,u){
      const T=P(u).Talent,n=Math.min(T[2],(tagOf(u,'castoriceWound')?.stacks??0)+1);
      buff(b,u,u,'掌心淌过的荒芜','dmgBoost',T[1]*n,T[3],{id:u.id+':castorice-wound',tag:'castoriceWound',stacks:n});
    }
    // E1-1 / 天赋 140704「当【新蕊】达到上限时可激活终结技」：达到上限的瞬间就入队，而不是
    // 等遐蝶的下一个回合开始（旧实现只在 turnStart 检查）。同一动作会多次调用 gainNewbud
    // （多段伤害 / 多名队友同时掉血），因此入队前按 (actor,key) 去重，避免重复召唤。
    function queueDragon(b,u){
      if(!u.actions.summonDragon)return;
      if(b.queue.some(q=>q.actor===u.id&&q.key==='summonDragon'))return;
      b.queue.push({actor:u.id,key:'summonDragon',kind:'extra'});
    }
    function gainNewbud(b,u,amount){
      if(!(amount>0))return;
      const cap=maxOf(b,u),s=mem(b,u);
      if(s){s.hp=Math.min(s.panel.hp,s.hp+amount);record(b,'resource',u,{name:'死龙生命值',value:s.hp});return;}
      const next=Math.min(newbudCap(b,u),(u.resources['新蕊']??0)+amount);
      resource(b,u,'新蕊',next);
      const holdOverflow=!!u.policy?.holdNewbudOverflow&&!!u.resources['新蕊溢出倍率'];
      if(next>=cap&&(!holdOverflow||next>=newbudCap(b,u)))queueDragon(b,u);
    }
    // 行迹 1407101：治疗转新蕊/死龙生命，每名受疗目标单次行动最多转化新蕊上限的12%。
    // 日志在 after 钩子中扫描，保证同一动作内多次治疗先合并后结算；每个单位行动后清零限额。
    function scanCastoriceHealing(b,u){
      const from=u.resources['遐蝶治疗扫描']??0;
      const events=b.log.slice(from).filter(e=>e.type==='heal'&&e.target!==u.id+':dragon');
      resource(b,u,'遐蝶治疗扫描',b.log.length);
      if(!trace(u,1))return;
      const cap=maxOf(b,u)*trace(u,1)[1];
      for(const e of events){
        const target=b.units.find(t=>t.id===e.target);
        if(!target||target.side!==u.side||target.memospriteOwner===u.id)continue;
        const key='遐蝶治疗转化:'+target.id,used=u.resources[key]??0;
        const amount=Math.min(e.amount*trace(u,1)[0],Math.max(0,cap-used));
        if(amount<=0)continue;
        resource(b,u,key,used+amount);gainNewbud(b,u,amount);
      }
      for(const key of Object.keys(u.resources))if(key.startsWith('遐蝶治疗转化:'))delete u.resources[key];
    }
    // 原文 140709「除死龙以外的我方全体」：只排除遐蝶自己的死龙，其他队友的忆灵同样掉血。
    const consumeAllies=(b,u,ratio)=>b.units.filter(t=>t.side===u.side&&api.live(t)&&t.memospriteOwner!==u.id).reduce((n,t)=>n+loseHp(b,u,t,ratio,api),0);
    // 引擎 prepare 把 skill 替换成 enhancedSkill 后，传给 before/after 的 key 仍是原始 key（skill），
    // 因此必须按「准备后的动作」识别强化战技；也保证 40% 消耗只在 before 发生一次。
    const isEnhanced=(u,a)=>!!a&&!!u.actions.enhancedSkill&&a.name===u.actions.enhancedSkill.name;
    return {
      start(b,u){resource(b,u,'新蕊',0);resource(b,u,'炽意',0);},
      entry(b,u){
        // SkillMazeInLevel 先 CreateServant，再由 StageAbility_Maze 的 OnEnterBattle 扣 40%。
        spawnDragon(b,u,{full:false});dragonSummonedE2(b,u);
        consumeAllies(b,u,P(u).Maze[0]);
        field(b,u);
      },
      // 我方任意单位损失生命值 → 获得等量【新蕊】（死龙在场时转化为死龙生命）。
      afterDamage(b,u,from,to,kind){
        if(to.side!==u.side)return;
        const ev=[...b.log].reverse().find(e=>e.type==='damage'&&e.actor===from?.id&&e.target===to.id);
        const lost=ev&&ev.type==='damage'?Math.max(0,ev.hpDamage??0):0;
        // Newbud is dispatched by hpChanged so ally HP consumption follows the same
        // source path as enemy damage; this callback keeps the damage-only wound trigger.
        if(lost>0)wound(b,u);
        void kind;void from;
      },
      hpChanged(b,u,target,reason,amount){
        // Original OnListenHPChange: allied target, negative HP delta, and explicitly
        // exclude Castorice's own CasterServant. The servant's redirected HP payment
        // must not be returned to itself as Newbud healing.
        if(target.side!==u.side||!(amount>0)||!['damage','consume'].includes(reason))return;
        // 死龙自身的生命降低触发 140704，但不能再转成【新蕊】/回血（否则支付会返还给自己）。
        if(target===mem(b,u)){
          if(reason==='consume')wound(b,u);
          return;
        }
        // 天赋 140704「我方损失生命值」也覆盖生命消耗（战技 30%/40% 与行迹 5% 消耗）；
        // 伤害路径由 afterDamage 触发，这里只补消耗，避免同一事件叠两层。
        if(reason==='consume')wound(b,u);
        gainNewbud(b,u,amount);
      },
      // 1140703: allied HP cannot be reduced below 1; the overkill remainder is charged to the dragon at 500%.
      redirectDamage(b,u,from,to,amount){
        const s=mem(b,u);
        if(!s||to.side!==u.side||to===s||to.memospriteOwner===u.id)return null;
        const shield=Math.max(0,...to.shields.map(x=>x.value));
        const hpLoss=Math.max(0,amount-shield),overflow=Math.max(0,hpLoss-Math.max(0,to.hp-1));
        if(overflow<=0)return null;
        const total=overflow*SERVANT[1140703].p[0];
        return {to:s.id,amount:overflow,directHpLoss:total,reason:'月茧荫蔽的身躯 · 500%生命承担'};
      },
      before(b,u,actor,key,kind,a,selected){
        if(actor===mem(b,u)&&key==='basic')resource(b,u,'焰息日志起点',b.log.length);
        if(actor!==u)return;
        const p=P(u);
        // 普通战技消耗全体当前 30% 生命；死龙在场时 prepare 已将其换成强化战技（key 仍为 skill），
        // 此时按 40% 消耗且仅在此处扣一次。
        if(key==='skill'&&kind!=='copy'){
          const ratio=isEnhanced(u,a)?ROSTER_DATA[1407].skills['140709'].params['10'].param_list[0]:p.BPSkill[0];
          consumeAllies(b,u,ratio);
        }
        if(key==='summonDragon'&&kind!=='copy'){
          const baseCap=maxOf(b,u),over=Math.max(0,(u.resources['新蕊']??0)-baseCap);
          const poem=SV(1141517),enemyLimit=poem[5];
          // 原文 #2 是基础档，#5 是「额外提高」；≤2 敌人时应叠加为 0.00336+0.00672=0.01008。
          const perPercent=enemies(b,u).length<=enemyLimit?poem[1]+poem[4]:poem[1];
          const overflowBonus=(over/baseCap)*100*perPercent;
          const s=spawnDragon(b,u,{full:true});s.hp=s.panel.hp;
          if(u.resources['新蕊溢出倍率'])resource(b,u,'死龙晦翼增伤',overflowBonus);
          field(b,u);resource(b,u,'新蕊',0);
          dragonSummonedE2(b,u);
        }
        void selected;
      },
      // 死龙在场：战技替换为【骸爪，冥龙之环拥】；施放时消耗 40% 当前生命（见 before）。
      prepare(b,u,key,kind,a){return kind!=='copy'&&key==='skill'&&mem(b,u)?{...u.actions.enhancedSkill,targetId:a.targetId}:a;},
      after(b,u,actor,key,kind,a,selected,hitTargets){
        scanCastoriceHealing(b,u);
        const s=mem(b,u);
        if(actor===s&&key==='basic'){
          const from=u.resources['焰息日志起点']??b.log.length,packets=b.log.slice(from).filter(e=>e.type==='damage'&&e.actor===s.id);
          const pool=enemies(b,u),allDead=pool.length===0;
          if(allDead||(packets.length>0&&packets.every(e=>(e.hpDamage??0)<=0)))
            buff(b,u,s,'倒置的火炬 · 速度','speedPct',trace(u,2)?.[2]??1,1,{id:u.id+':dragon-trace-speed'});
        }
        // key 仍为 skill：按准备后的强化战技识别；40% 消耗已在 before 完成，这里不再重复扣血。
        if(actor===u&&kind!=='copy'&&isEnhanced(u,a)){
          // E2：召唤死龙后的「下一次」强化战技返还【新蕊】上限 30% 的【新蕊】；一次性消费。
          if(u.resources['E2新蕊返还']){
            gainNewbud(b,u,maxOf(b,u)*u.resources['E2新蕊返还']);
            resource(b,u,'E2新蕊返还',0);
          }
        }
        void key;void selected;void hitTargets;
      },
      panel(b,u,target,out){
        // E4: while Castorice is in battle, healing received by every ally (including servants) increases.
        if(rank(u,4)&&target.side===u.side)out.incomingHeal=(out.incomingHeal??0)+rank(u,4);
        if(target===u&&trace(u,2)&&u.hp/out.hp>=trace(u,2)[0])
          out.speed=(out.speed??0)+u.baseSpeed*trace(u,2)[1];
      },
      // 死龙每次焰息：消耗自身生命上限 25%，倍率 0.336/0.392/0.476；生命 ≤25% 时降到 1 点并触发晦翼。
      repeatStart(b,u,actor,key,kind,action,repeat){
        const s=actor&&actor.memospriteOwner===u.id?actor:null;
        if(!s||b.activeAction?.actor!==s.id||key!=='basic')return;
        // E6 permits the dragon to reduce toughness without matching an enemy weakness.
        action.ignoreWeaknessToughness=rank(u,6)>0;
        const q=SV(1140702),e2=rank(u,2)&&(u.resources['炽意']??0)>0;
        // 1140702：「重复发动时，伤害倍率依次提高至 0.392/0.476，达到后不再提高，
        // 伤害倍率提高效果在死龙消失前不会降低」——阶数跨动作保留，重新召唤时清零。
        const tier=Math.min(2,s.resources['焰息阶数']??0);
        // 1140702 checks the current HP before this activation. Crossing 25% with the
        // previous breath does not fire the talent until the next breath is activated.
        const hpBefore=s.hp;
        if(s.hp<=s.panel.hp*q[4]){
          s.hp=1;action.repeatCount=repeat+1;wingBlast(b,u,s);
        }else if(e2)resource(b,u,'炽意',(u.resources['炽意']??0)-1);
        else s.hp=Math.max(0,s.hp-s.panel.hp*q[0]);
        // 死龙的生命降低同样触发「我方生命降低」监听（140704/141304 等）。
        if(s.hp<hpBefore&&b.rules?.hpChanged)b.rules.hpChanged(b,s,'consume',hpBefore-s.hp,u);
        action.terms=dragonTerm(u,breathMult(tier,q));
        resource(b,s,'焰息阶数',Math.min(2,tier+1));
        // 行迹 1407103「西风的驻足」：每次焰息使伤害 +30%，最多 6 层，持续至本回合结束。
        if(trace(u,3)){
          const n=Math.min(trace(u,3)[1],(tagOf(s,'castoriceWestWind')?.stacks??0)+1);
          buff(b,u,s,'西风的驻足','dmgBoost',trace(u,3)[0]*n,null,{id:u.id+':west-wind',tag:'castoriceWestWind',stacks:n});
        }
        void kind;
      },
      weaknessBreak(b,u,actor,target,action,element){
        const s=mem(b,u);
        if(rank(u,6)&&actor===s&&action?.ignoreWeaknessToughness&&element==='Quantum'){
          const count=rank(u,6,1);
          resource(b,u,'死龙E6晦翼弹射',(u.resources['死龙E6晦翼弹射']??0)+count);
          record(b,'mechanic',u,{name:'E6 · 死龙量子击破与晦翼弹射',target:target.id,count});
        }
      },
      turnStart(b,u,actor){
        const s=mem(b,u);
        if(s&&actor===s){
          spawnServant(b,u,{key:'dragon',name:'死龙•玻吕刻斯',element:'Quantum',aggro:100,
            hpOf:()=>Math.max(1,maxOf(b,u)),speedOf:()=>P(u).Ultra[0],actions:servantActions},api);
          // 一次攻击中可重复发动【燎尽黯泽的焰息】：按当前生命最多发动 min(4, ⌊HP/25%上限⌋+1) 次。
          const q=SV(1140702);
          s.actions.basic.repeatCount=Math.min(4,Math.max(1,Math.floor(s.hp/(s.panel.hp*q[0]))+1));
        }
        if(actor===u&&!s&&(u.resources['新蕊']??0)>=maxOf(b,u)&&u.actions.summonDragon&&
          (!(u.policy?.holdNewbudOverflow&&u.resources['新蕊溢出倍率'])||(u.resources['新蕊']??0)>=newbudCap(b,u)))useAction(b,u,'summonDragon','extra');
      },
      // 死龙回合结束：Ultra[1]=3 回合后消失。
      turnEnd(b,u,actor){
        if(!actor||actor.memospriteOwner!==u.id)return;
        // 行迹 1407103「持续至本回合结束」：回合结束时清除西风的驻足叠层。
        actor.buffs=actor.buffs.filter(e=>e.tag!=='castoriceWestWind');
        const left=(actor.resources['剩余回合']??P(u).Ultra[1])-1;
        actor.resources['剩余回合']=left;
        if(left<=0)dismissDragon(b,u);
      },
      death(b,u,from,to){
        if(to===u)dismissDragon(b,u);
        else if(to?.memospriteOwner===u.id)dismissDragon(b,u,to);
        void from;
      },
      modifiers(b,u,actor,to,a,kind){
        const out={};if(to.side===u.side)return out;
        const fromDragon=actor&&actor.memospriteOwner===u.id;
        if(rank(u,6)&&(actor===u||fromDragon))out.resPen=(out.resPen??0)+rank(u,6,0);
        // 140703：若遐蝶持有天赋的造成伤害提高效果，使该效果扩散至死龙。
        if(fromDragon){
          const woundBuff=tagOf(u,'castoriceWound');
          if(woundBuff?.value)out.dmgBoost=(out.dmgBoost??0)+woundBuff.value;
        }
        // E1：目标生命 ≤50%/80% 时，骸爪 / 爪痕 / 焰息 / 晦翼伤害为原伤害的 1.4 / 1.2 倍。
        // E1 只列【骸爪】【爪痕】【焰息】【晦翼】（死龙动作）与强化战技，不含普通战技 140702。
        if(rank(u,1)&&(fromDragon||a?.name===u.actions.enhancedSkill?.name)){
          const r=to.hp/combatPanel(to).hp;
          if(r<=rank(u,1,1))out.dmgBoost=(out.dmgBoost??0)+rank(u,1,3)-1;
          else if(r<=rank(u,1,0))out.dmgBoost=(out.dmgBoost??0)+rank(u,1,2)-1;
        }
        void kind;return out;
      },
      display(b,u){
        const s=mem(b,u),out=[{type:'buff',id:u.id+':newbud',source:u.id,name:'新蕊',key:'marker',value:u.resources['新蕊']??0,remaining:null,derived:true,tickOwner:u.id}];
        if(s)out.push({type:'buff',id:s.id+':turns',source:s.id,name:'死龙剩余回合',key:'marker',value:s.resources['剩余回合']??0,remaining:null,derived:true,tickOwner:s.id});
        return out;
      },
    };
  },

  // ═════════════════════════ 1409 风堇（风 · 记忆） ═════════════════════════
  // 普攻 当微风轻吻云沫 Normal[0]=0.7（生命上限）1 段，削韧 30。
  // 战技 爱在虹光洒落时：BPSkill[0]=0.08/[1]=160 全体治疗、[2]=0.1/[3]=200 小伊卡治疗，无伤害。
  // 终结 飞入晨昏的我们：Ultra[0]=0.1/[1]=200 治疗、[2]=0.3/[3]=600 生命上限、[4]=3 回合、
  //   [5]=0.12/[6]=240 小伊卡治疗。
  // 天赋 疗愈世间的晨曦：Talent[0]=0.5 小伊卡生命、[2]=0.8 增伤/层、[3]=2 回合、[4]=3 层。
  // 秘技 天气正好，万物可爱！：Maze[0]=0.3/[1]=600 治疗、[2]=0.2 生命上限、[3]=2 回合。
  // 忆灵技 乌云乌云快走开！= 累计治疗×0.28 全体风伤，清空 50%（E6 改 12%）。
  // 忆灵天赋 牵起晴空的手[.04,.028,28,.028,28]、展翼奔向日辉[15,30]、坠落然后飞翔[.3]。
  // 行迹 point06[1,0.5,0.25]、point07[0.5,1]、point08[200,.2,1,.01,200]。
  // E1[.5,.08]、E2[.3,2]、E4[1,.02]、E6[.12,.2]。
  1409:function(api){
    const {rank,trace,buff,resource,energy,combatPanel,record,advance,heal,cleanseOne,allies,sp,useAction}=api;
    const P=u=>u.kit.params;
    const mem=(b,u)=>memOf(b,u), inSunny=u=>has(u,'hyacineSunny');
    const servantActions=()=>({basic:{name:SERVANT[1140901].name,type:'Talent',element:'Wind',target:'all',terms:[],hitShares:[1],
      energyGain:0,spCost:0,spGain:0,toughness:SERVANT[1140901].stance[1]}});
    function spawnIca(b,u){
      const prev=memAny(b,u),fresh=!prev||prev.active===false||prev.hp<=1e-8;
      const s=spawnServant(b,u,{key:'ica',name:'小伊卡',element:'Wind',aggro:100,cannotAct:true,speedFloor:1,
        hpOf:base=>base.hp*P(u).Talent[0],speedOf:()=>1,actions:servantActions},api);
      // 行迹 point06：风堇和小伊卡暴击率 +100%。
      if(trace(u,1))buff(b,u,s,'阴云莞尔','critRate',trace(u,1)[0],null,{id:u.id+':ica-crit'});
      // 忆灵天赋 1140905：被召唤时为风堇回复 15 点能量，首次被召唤额外回复 30 点。
      if(fresh){
        energy(b,u,SV(1140905)[0],true);
        if(!u.resources['首次召唤已回能']){resource(b,u,'首次召唤已回能',1);energy(b,u,SV(1140905)[1],true);}
      }
      return s;
    }
    // 累计治疗：扫描战斗日志里风堇造成的治疗（小伊卡的治疗也以风堇为施法者结算）。
    // 1141519 献予「天空」之诗：持有层数时，计入小伊卡忆灵技的治疗数值额外 +100.8%。
    function scanHeal(b,u){
      const from=u.resources['治疗扫描']??0;if(b.log.length<=from)return;
      let add=0;for(const e of b.log.slice(from))if(e.type==='heal'&&e.actor===u.id)add+=e.amount;
      resource(b,u,'治疗扫描',b.log.length);
      const skyBoost=u.buffs.some(e=>String(e.tag??'').startsWith('cyreneSkyPoem:'))?SV(1141519)[0]:0;
      if(add>0)resource(b,u,'累计治疗',(u.resources['累计治疗']??0)+add*(1+skyBoost));
    }
    const healMul=(u,base)=>base*(1+(trace(u,3)&&combatPanel(u).speed>trace(u,3)[0]?Math.min(trace(u,3)[4],combatPanel(u).speed-trace(u,3)[0])*trace(u,3)[3]:0));
    function riseTalent(b,u){
      const s=mem(b,u);if(!s)return;
      const T=P(u).Talent,n=Math.min(T[4],(tagOf(s,'hyacineIcaBuff')?.stacks??0)+1);
      buff(b,u,s,'疗愈世间的晨曦','dmgBoost',T[2]*n,T[3],{id:u.id+':ica-buff',tag:'hyacineIcaBuff',stacks:n});
    }
    function icaAction(b,u){
      const s=mem(b,u);if(!s||!api.live(s))return;
      scanHeal(b,u);
      const q=SV(1140901),cum=u.resources['累计治疗']??0;
      s.actions.basic.terms=[{scaling:'atk',multiplier:0,flatAdd:cum*q[0]}];
      useAction(b,s,'basic','extra');
      const clear=rank(u,6)?rank(u,6,0):q[1];
      resource(b,u,'累计治疗',Math.max(0,cum*(1-clear)));
      for(const e of s.buffs)if(e.remaining!=null)e.remaining=Math.max(1,e.remaining-1);
    }
    function icaHealDrop(b,u){
      const s=mem(b,u);if(!s)return;
      const p=combatPanel(u),q=SV(1140903);
      loseHp(b,u,s,s.panel.hp*q[0],api);
      for(const to of allies(b,u).filter(t=>t.hp<combatPanel(t).hp-1e-6)){
        heal(b,u,to,healMul(u,p.hp*q[1]+q[2]));
        if(inSunny(u))for(const t of allies(b,u))heal(b,u,t,healMul(u,p.hp*q[3]+q[4]));
      }
    }
    return {
      start(b,u){resource(b,u,'累计治疗',0);resource(b,u,'治疗扫描',0);},
      entry(b,u){
        const p=P(u);
        for(const to of allies(b,u)){
          if(to.memospriteOwner)continue;
          heal(b,u,to,combatPanel(u).hp*p.Maze[0]+p.Maze[1]);
          buff(b,u,to,'天气正好 · 生命上限','hpPct',p.Maze[2],p.Maze[3],{id:u.id+':maze-hp'});
        }
        spawnIca(b,u);
      },
      // 行迹 point08：速度 >200 时自身与小伊卡生命上限 +20%（面板实时计算）。
      panel(b,u,target,out){
        if(target.side===u.side&&rank(u,1)&&inSunny(u))out.hp+=(target.panel.baseStats?.hp??target.panel.hp)*rank(u,1,0);
        if(target!==u)return;
        if(!trace(u,3)||out.speed==null)return;
        if(out.speed>trace(u,3)[0]&&Number.isFinite(u.panel.baseStats?.hp))out.hp+=(u.panel.baseStats?.hp??0)*trace(u,3)[1];
        // 行迹 point06：风堇暴击率 +100%。
        if(trace(u,1))out.critRate=(out.critRate??0)+trace(u,1)[0];
      },
      after(b,u,actor,key,kind,a,selected,hitTargets){
        scanHeal(b,u);
        if(rank(u,1)&&inSunny(u)&&actor?.side===u.side&&hitTargets.length)heal(b,u,actor,healMul(u,combatPanel(u).hp*rank(u,1,1)));
        if(actor!==u)return;
        if(key==='skill'||key==='ultimate'){
          const p=P(u),s=spawnIca(b,u);
          const m=key==='skill'?[p.BPSkill[0],p.BPSkill[1],p.BPSkill[2],p.BPSkill[3]]:[p.Ultra[0],p.Ultra[1],p.Ultra[5],p.Ultra[6]];
          for(const to of allies(b,u).filter(t=>t!==s))heal(b,u,to,healMul(u,combatPanel(u).hp*m[0]+m[1]));
          if(s)heal(b,u,s,healMul(u,combatPanel(u).hp*m[2]+m[3]));
          // 行迹 point07：施放战技和终结技时解除我方全体 1 个负面效果。
          if(trace(u,2))for(const to of allies(b,u))for(let i=0;i<trace(u,2)[1];i++)cleanseOne(b,u,to);
          if(key==='ultimate'){
            buff(b,u,u,'雨过天晴','marker',0,p.Ultra[4],{tag:'hyacineSunny',tickAt:'start'});
            for(const to of allies(b,u))if(!to.memospriteOwner)buff(b,u,to,'雨过天晴 · 生命上限','hpPct',p.Ultra[2],p.Ultra[4],{id:u.id+':sunny-hp'});
          }
          riseTalent(b,u);
          // 雨过天晴：风堇施放技能后小伊卡立即获得 1 个额外回合并自动施放【乌云乌云快走开！】。
          if(inSunny(u))icaAction(b,u);
          // 1141519：先按本次治疗结算（含天空诗篇加成），施放战技/终结技后消耗 1 层。
          scanHeal(b,u);
          const sky=u.buffs.find(e=>String(e.tag??'').startsWith('cyreneSkyPoem:'));
          if(sky){const left=(sky.stacks??1)-1;if(left<=0)u.buffs=u.buffs.filter(e=>e!==sky);else sky.stacks=left;}
        }
        // E1 healing is dispatched above for every allied attacker in Sunny state.
        void a;void selected;void hitTargets;void kind;
      },
      // 除小伊卡外我方目标生命值降低 → 小伊卡消耗自身 4% 生命上限治疗该目标。
      afterDamage(b,u,from,to,kind){
        // 注意：scanHeal 会写日志，必须在读取「上一条伤害事件」之前先取好。
        const ev=b.log[b.log.length-1];
        scanHeal(b,u);
        if(to.side!==u.side||to.memospriteOwner===u.id)return;
        if(!ev||ev.type!=='damage'||!(ev.hpDamage>0))return;
        icaHealDrop(b,u);
        void from;void kind;
      },
      turnStart(b,u,actor){
        if(actor===u){const sun=tagOf(u,'hyacineSunny');if(sun)void sun;}
        // E2：我方目标生命值降低时速度 +30%/2 回合（在 afterDamage 内由事件驱动更精确，
        // 这里补一次「本方生命值下降」的兜底检查）。
        if(rank(u,2)&&u.hp<combatPanel(u).hp)buff(b,u,u,'风堇 E2 · 速度','speedPct',rank(u,2,0),rank(u,2,1),{id:u.id+':e2-speed'});
      },
      death(b,u,from,to){
        if(to===u||to.memospriteOwner===u.id){const s=memAny(b,u);if(s){advance(b,u.id,SV(1140906)[0]);dismissServant(b,u,s,api);}}
        void from;
      },
      modifiers(b,u,actor,to,a,kind){
        const out={};if(to.side===u.side)return out;
        if(rank(u,6)&&mem(b,u)&&actor?.side===u.side)out.resPen=(out.resPen??0)+rank(u,6,1);
        void a;void kind;return out;
      },
      display(b,u){return [{type:'buff',id:u.id+':cum',source:u.id,name:'累计治疗数值',key:'marker',value:u.resources['累计治疗']??0,remaining:null,derived:true,tickOwner:u.id}];},
    };
  },

  // ═════════════════════════ 1413 长夜月（冰 · 记忆） ═════════════════════════
  // 普攻 从此岁月朦胧 Normal[0]=0.7（生命上限）1 段，削韧 30。
  // 战技 白昼悄然离去：BPSkill[0]=0.24 忆灵暴伤（= 长夜月暴伤×24%）、[1]=2 回合、[2]=2 忆质、
  //   [3]=0.5 回复长夜生命、[4]=12 至暗之谜额外忆质、[5]=0.1 生命消耗。
  // 终结 晚安，全世界无眠：Ultra[0]=2（长夜全体伤害=长夜生命上限 200%）、[1]=2 充能、
  //   [2]=0.6 增伤、[3]=0.3 敌方易伤。
  // 天赋 今夜与我同行：Talent[0]=2 暴伤提高、[1]=0.6、[2]=2 回合、[3]=160 长夜速度、
  //   [4]=0.5 长夜生命、[5]=16 忆质阈值、[6]=0.05 生命消耗。
  // 秘技 愿有冷雨落下：[1]=1 点忆质。
  // 忆灵技 追忆，蹁跹，如雨 = 长夜生命上限 0.7 + 每 4 点忆质额外 0.14、施放后 +1 忆质；
  //   迷梦，流失，如露 = 忆质≥16 时主目标 每点忆质 0.168、其他 0.084，消耗全部忆质与生命并消失。
  // 行迹 point06[.35,.05,.15,2]、point07[1,70,1,5]、point08[.05,.15,.5,.65]。
  // E1[1.2,1.25,1.3,1.5]、E2[2,2,0.4]、E4[.25,.25]、E6[0.3,0.2]。
  1413:function(api){
    const {rank,trace,buff,resource,energy,damageTo,combatPanel,record,advance,heal,sp,allies,enemies}=api;
    const P=u=>u.kit.params;
    const mem=(b,u)=>memOf(b,u);
    const dark=u=>has(u,'evernightDark'), chaos=u=>u.resources['忆质']??0, THRESH=u=>P(u).Talent[5];
    const controlled=u=>u.buffs.some(e=>e.control)||u.dots.some(e=>e.control);
    const servantActions=()=>({basic:{name:SERVANT[1141301].name,type:'Talent',element:'Ice',target:'single',terms:[],hitShares:[1],
      energyGain:0,spCost:0,spGain:0,toughness:SERVANT[1141301].stance[0]}});
    function spawnNight(b,u,advanceIt){
      const s=spawnServant(b,u,{key:'night',name:'长夜',element:'Ice',aggro:125,advance:advanceIt,
        hpOf:base=>base.hp*P(u).Talent[4],speedOf:()=>P(u).Talent[3],actions:servantActions},api);
      // 1141303 的 +70% 由 modifiers 统一给本体与长夜；这里不再额外挂 buff，避免重复计算。
      for(const poemBuff of u.buffs.filter(e=>String(e.tag??'').startsWith('cyreneEvernightPoem:')))
        buff(b,u,s,'献予「岁月」之诗 · 迷梦伤害','dmgBoost',.252,null,{id:poemBuff.id+':night',tag:poemBuff.tag});
      if(advanceIt){s.distance=0;s.advanceOrder=(b.advanceSequence=(b.advanceSequence??0)+1);}
      return s;
    }
    function gainMemory(b,u,n){
      if(!(n>0))return;
      if(rank(u,2))n+=rank(u,2,0);
      resource(b,u,'忆质',chaos(u)+n);
      if(chaos(u)>=THRESH(u)){
        // 141304：忆质 ≥16 时解除并免疫控制类负面状态（眩晕/冻结/禁锢等全部控制）。
        u.buffs=u.buffs.filter(e=>!e.control);
        u.dots=u.dots.filter(e=>!e.control);
        const s=mem(b,u);
        if(s&&!u.resources['立即行动已用']){resource(b,u,'立即行动已用',1);s.distance=0;s.advanceOrder=(b.advanceSequence=(b.advanceSequence??0)+1);record(b,'advance',u,{name:'长夜立即行动',target:s.id,ratio:1});}
      }
    }
    function skillBuff(b,u){
      const c=combatPanel(u).critDmg,p=P(u),pct=p.BPSkill[0];
      // 1141524：「战技的暴击伤害提高效果额外提高，提高数值等同于长夜月暴击伤害的 16.8%」。
      // 因此额外量是 c×0.168，而不是固定 +0.168 个百分点。
      const poem=u.buffs.some(e=>String(e.tag??'').startsWith('cyreneEvernightPoem:'))?SV(1141524)[2]:0;
      for(const to of allies(b,u))if(to.memospriteOwner)buff(b,u,to,'白昼悄然离去 · 忆灵暴伤','critDmg',c*pct+c*poem,p.BPSkill[1],{id:u.id+':skill-cd',tickOwner:u.id,tickAt:'start'});
      // 行迹 point08：队伍中「记忆」命途数量 1/2/3/4+ 时忆灵暴伤额外 +5/15/50/65%。
      if(trace(u,3)){
        // 原始脚本统计全部「记忆」命途友方，包含长夜月自己。
        const n=allies(b,u).filter(t=>(t.path==='记忆'||t.path==='Remembrance')).length;
        const v=trace(u,3)[Math.max(0,Math.min(3,n-1))];
        if(n>0)for(const to of allies(b,u))if(to.memospriteOwner)buff(b,u,to,'天亮了，雨落了','critDmg',v,p.BPSkill[1],{id:u.id+':trace8-cd',tickOwner:u.id,tickAt:'start'});
      }
    }
    function dreamDamage(b,u){
      const s=mem(b,u);if(!s)return;
      const q=SV(1141307),n=chaos(u);
      const pool=enemies(b,u);
      const last=u.resources['上次攻击目标'];
      const main=pool.find(t=>t.id===last)??pool[0];
      if(main)damageTo(b,s,main,{name:q.name,type:'Talent',element:'Ice',terms:[{scaling:'hp',multiplier:q[0]*n}],toughness:SERVANT[1141307].stance[0]},1,'primary','direct');
      for(const to of pool)if(to!==main)damageTo(b,s,to,{name:q.name,type:'Talent',element:'Ice',terms:[{scaling:'hp',multiplier:q[1]}],toughness:SERVANT[1141307].stance[1]},1,'primary','direct');
      // Ultra's source text spends one Dark Mystery charge when Long Night uses Dream;
      // owner turn endings alone must never consume this charge.
      const darkCharges=u.resources['至暗充能']??0;
      if(darkCharges>0)resource(b,u,'至暗充能',darkCharges-1);
      resource(b,u,'忆质',rank(u,6)?Math.floor(n*rank(u,6,0)):0);
      if(trace(u,1))sp(b,u,1,'长夜月 · 迷梦返还战技点');
      buff(b,u,u,'与你，再见，无期','speedPct',SV(1141306)[0]+Math.min(SV(1141306)[2],n)*SV(1141306)[1],null,{id:u.id+':night-haste',tag:'night-haste',tickAt:'start'});
      dismissServant(b,u,s,api);
      resource(b,u,'立即行动已用',0);
    }
    return {
      start(b,u){
        resource(b,u,'忆质',0);resource(b,u,'至暗充能',0);resource(b,u,'立即行动已用',0);
        // 行迹 point07：战斗开始时恢复 70 点能量并获得 1 点忆质。
        if(trace(u,2)){energy(b,u,trace(u,2)[1],true);gainMemory(b,u,trace(u,2)[2]);}
      },
      entryAlways:true, // 本体忆灵开场常驻，与秘技无关；运行时不能将其误当作秘技入场钩子。
      entry(b,u){
        spawnNight(b,u,false);
        // 秘技 141307：只有携带秘技时，OnEnterBattle 才对全部我方忆灵施加 Skill02_Buff 并 +1 忆质。
        if(u.kit.technique){skillBuff(b,u);gainMemory(b,u,1);}
      },
      before(b,u,actor,key,kind,a,selected){
        if(actor!==u)return;
        const p=P(u);
        if(key==='skill'&&kind!=='copy'){
          // 141302：消耗长夜月当前 10% 生命值召唤忆灵「长夜」。
          // Ability Skill02_Phase02 的首个任务是 LoseHPByRatio，之后才加入战技的暴伤共享；
          // 因此该次消耗触发的 141304 暴伤加成已计入 24% 的换算基数。
          loseHp(b,u,u,p.BPSkill[5],api);
          const s=mem(b,u);
          if(s)heal(b,u,s,combatPanel(s).hp*p.BPSkill[3]);else spawnNight(b,u,true);
          skillBuff(b,u);
          gainMemory(b,u,p.BPSkill[2]+(dark(u)?p.BPSkill[4]:0));
          // 行迹 point06：施放战技时消耗自身当前生命 5%，双方暴伤 +15%/2 回合。
          if(trace(u,1)){
            loseHp(b,u,u,trace(u,1)[1],api);
            buff(b,u,u,'天黑黑，月寂寂','critDmg',trace(u,1)[2],trace(u,1)[3],{id:u.id+':trace6-cd'});
            const s2=mem(b,u);if(s2)buff(b,u,s2,'天黑黑，月寂寂','critDmg',trace(u,1)[2],trace(u,1)[3],{id:u.id+':trace6-cd'});
          }
          // 行迹 point07：长夜月施放技能 +5 能 +1 忆质。
          if(trace(u,2)){energy(b,u,trace(u,2)[3],true);gainMemory(b,u,trace(u,2)[0]);}
        }
        if(key==='ultimate'&&kind!=='copy'){
          const s=spawnNight(b,u,true);
          for(const to of enemies(b,u))damageTo(b,s,to,{name:'晚安，全世界无眠',type:'Ultra',element:'Ice',
            terms:[{scaling:'hp',multiplier:p.Ultra[0]}],toughness:ROSTER_DATA[1413].skills['141303'].stance[1]},1,'primary','direct');
          buff(b,u,u,'至暗之谜','marker',0,null,{tag:'evernightDark'});
          resource(b,u,'至暗充能',p.Ultra[1]+(rank(u,2)?rank(u,2,1):0));
          resource(b,u,'立即行动已用',0);
        }
        void selected;
      },
      // 长夜回合：【迷梦，流失，如露】（忆质≥16）或【追忆，蹁跹，如雨】。
      turnStart(b,u,actor){
        const s=mem(b,u);
        if(actor&&actor.memospriteOwner===u.id&&s){
          if(chaos(u)>=THRESH(u)&&!controlled(u)){s.actions.basic.target='all';s.actions.basic.terms=[];s.resources['施放迷梦']=1;}
          else{
            s.resources['施放迷梦']=0;
            const q=SV(1141301),extra=Math.floor(chaos(u)/q[2])*q[1];
            s.actions.basic={name:q.name,type:'Talent',element:'Ice',target:'single',
              terms:[{scaling:'hp',multiplier:q[0]+extra}],hitShares:[1],energyGain:0,spCost:0,spGain:0,toughness:SERVANT[1141301].stance[0]};
            const last=u.resources['上次攻击目标'],to=b.units.find(t=>t.id===last&&t.hp>1e-8);
            if(to)s.actions.basic.targetId=to.id;
          }
        }
        if(actor===u){
          if(dark(u)&&(u.resources['至暗充能']??0)<=0)u.buffs=u.buffs.filter(e=>e.tag!=='evernightDark');
          u.buffs=u.buffs.filter(e=>e.tag!=='night-haste');
        }
      },
      // 长夜施放【迷梦，流失，如露】：主目标每点忆质 0.168、其他 0.084，消耗全部忆质并使长夜消失。
      after(b,u,actor,key,kind,a,selected,hitTargets){
        if(actor&&actor.memospriteOwner===u.id){
          if(actor.resources['施放迷梦']&&key==='basic'){actor.resources['施放迷梦']=0;dreamDamage(b,u);}
          else gainMemory(b,u,SV(1141301)[3]);
          if(hitTargets.length)resource(b,u,'上次攻击目标',hitTargets[0].id);
          if(trace(u,2)){energy(b,u,trace(u,2)[3],true);gainMemory(b,u,trace(u,2)[0]);}
          return;
        }
        if(actor===u&&['skill','ultimate'].includes(key)&&u.buffs.some(e=>String(e.tag??'').startsWith('cyreneEvernightPoem:')))
          gainMemory(b,u,1); // 1141524：加护生效时，长夜月每次战技/终结额外获得1点忆质。
        if(actor===u&&hitTargets.length)resource(b,u,'上次攻击目标',hitTargets[0].id);
        void kind;void a;void selected;
      },
      turnEnd(b,u,actor){
        void b;void u;void actor;
      },
      // 生命降低：暴伤 +60%/2 回合并获得 2 点忆质。
      afterDamage(b,u,from,to,kind){
        if(to===u||to?.memospriteOwner===u.id){
          // Talent text limits this trigger to once per attacked target for each enemy action;
          // multi-hit actions still grant only one stack per recipient.
          const triggerKey=b.activeAction?.sequence??b.log.length;
          b._evernightTalentHitByTarget??=new Map();
          if(b._evernightTalentHitByTarget.get(to.id)===triggerKey)return;
          b._evernightTalentHitByTarget.set(to.id,triggerKey);
          const T=P(u).Talent;
          buff(b,u,u,'今夜与我同行','critDmg',T[1],T[2],{id:u.id+':talent-cd'});
          const s=mem(b,u);if(s)buff(b,u,s,'今夜与我同行','critDmg',T[1],T[2],{id:u.id+':talent-cd'});
          gainMemory(b,u,T[0]);
        }
        void from;void kind;
      },
      death(b,u,from,to){
        if(to===u||to.memospriteOwner===u.id){
          // 1141306：非迷梦路径的消失只给基础 10% 加速；迷梦路径已在 dreamDamage 中按忆质追加。
          if(to.memospriteOwner===u.id)
            buff(b,u,u,'与你，再见，无期','speedPct',SV(1141306)[0],null,{id:u.id+':night-haste',tag:'night-haste',tickAt:'start'});
          const s=memAny(b,u);if(s)dismissServant(b,u,s,api);
        }
        void from;
      },
      // 141304「长夜月或忆灵每次生命降低时」：技能/行迹的生命消耗同样触发（伤害由 afterDamage 处理）。
      // 原始 MAvatar_Evernight_00_HPChange 的 OnHPChange 仅排除治疗，未见按动作去重；
      // 「每个目标每次受到攻击最多触发1次」的限制属于受击分支，故消耗路径每次生命降低都触发。
      hpChanged(b,u,target,reason,amount){
        if(reason!=='consume'||!(amount>0)||target.side!==u.side)return;
        if(target!==u&&target.memospriteOwner!==u.id)return;
        const T=P(u).Talent;
        buff(b,u,u,'今夜与我同行','critDmg',T[1],T[2],{id:u.id+':talent-cd'});
        const s=mem(b,u);if(s)buff(b,u,s,'今夜与我同行','critDmg',T[1],T[2],{id:u.id+':talent-cd'});
        gainMemory(b,u,T[0]);
      },
      // Rank04_Buff: allied servants +25%; CasterServant receives an additional +25%.
      panel(b,u,target,out){
        // 行迹 point06：长夜月与长夜暴击率 +35%。
        // 长夜的战斗面板以本体面板为基，只在本体处加一次，避免忆灵继承后重复 +35%。
        const T6=trace(u,1);
        if(T6&&target===u)out.critRate=(out.critRate??0)+T6[0];
        // E2 permanently grants CRIT DMG to the owner and her own memosprite.
        if(rank(u,2)&& (target===u||target.memospriteOwner===u.id))out.critDmg=(out.critDmg??0)+rank(u,2,2);
        // Ultra 141303 grants control immunity to both Long Night and Evernight while Dark Mystery is active.
        // 141304：忆质≥16 时同样解除并免疫控制类负面状态。
        if(target===u&&(dark(u)||chaos(u)>=THRESH(u)))out.controlRes=1;
        // 1141303：长夜本体免疫控制类负面状态（控制抵抗 100%）。
        if(target.memospriteOwner===u.id)out.controlRes=1;
        if(!rank(u,4)||target.side!==u.side||!target.memospriteOwner)return;
        out.breakEfficiency=(out.breakEfficiency??0)+rank(u,4,0)+(target.memospriteOwner===u.id?rank(u,4,1):0);
      },
      modifiers(b,u,actor,to,a,kind){
        const out={};if(to.side===u.side)return out;
        const s=mem(b,u);
        if(s&&(actor===u||actor===s))out.dmgBoost=(out.dmgBoost??0)+SV(1141303)[0];
        if(dark(u)&&(actor===u||actor===s))out.dmgBoost=(out.dmgBoost??0)+P(u).Ultra[2];
        if(dark(u))out.vuln=(out.vuln??0)+P(u).Ultra[3];
        // 1413 E1 原文「长夜月在场时……我方忆灵造成的伤害」：覆盖所有我方忆灵，不只长夜。
        if(rank(u,1)&&actor?.memospriteOwner&&actor.side===u.side){
          const n=enemies(b,u).length;
          out.dmgBoost=(out.dmgBoost??0)+(n>=4?rank(u,1,0):n===3?rank(u,1,1):n===2?rank(u,1,2):rank(u,1,3))-1;
        }
        if(rank(u,6))out.resPen=(out.resPen??0)+rank(u,6,1);
        void a;void kind;return out;
      },
      display(b,u){return [{type:'buff',id:u.id+':memory',source:u.id,name:'忆质',key:'marker',value:chaos(u),remaining:null,derived:true,tickOwner:u.id}];},
    };
  },

  // ═════════════════════════ 1415 昔涟（冰 · 记忆） ═════════════════════════
  // 普攻 看，希望的起始！Normal[0]=0.7（生命上限）+ Normal[1]=1 点【追忆】，1 段，削韧 30。
  // 战技 盛放吧，来世的乐土：BPSkill[0]=0.24（结界真实伤害 = 原伤害 24%）、[1]=2 回合、[2]=3 追忆。
  // 终结 诗的「◦」誓约的「∞」（Ultra，能耗 24）：Ultra[0]=1（德谬歌生命=昔涟生命上限 100%）、
  //   [2]=0.5 暴击率、[3]=12（德谬歌速度？数据里为 12）。单场只能施放 1 次。
  // 天赋 众愿啊，汇流如歌：[1]=0.2 我方全体增伤、[2]=27 溢出上限、[3]=24 追忆阈值、[4]=12 涟漪阈值。
  // 秘技 西风尽头，宁谧永恒：展开战技的结界。
  // 忆灵技 花与箭的舞曲 = 德谬歌生命上限 0.84 全体冰伤；献予「真我」之诗每名队友额外 1 次弹射（0.84）。
  // 行迹 point06 队友忆灵被召唤获得【未来】；point07[2,3,6] 开场追忆；point08[180,.02,60,.2]。
  // E1[6,12] 追忆 + 弹射 +12；E2[12,0,.06,.24] 开场 +12 追忆、真实伤害倍率最多 +24%；
  //   E4[.06,24] 每次舞曲后弹射倍率 +6%（最多 24 层）；E6[1,.2,.24] 首次终结全体提前 100% 等。
  1415:function(api){
    const {rank,trace,buff,resource,energy,damageTo,combatPanel,record,advance,heal,allies,enemies,useAction,trueDamage,get,sp}=api;
    const P=u=>u.kit.params;
    const mem=(b,u)=>memOf(b,u), ripple=u=>has(u,'cyreneRipple'), field=u=>api.live(u)&&has(u,'cyreneField');
    function syncServantSpecialSP(b,u){
      const s=mem(b,u);if(!s)return;
      const current=u.resources['追忆']??0,need=ultNeed(u);
      if(s.resources['CurSpecialSP']!==current)resource(b,s,'CurSpecialSP',current);
      if(s.resources['SpecialSPNeed']!==need)resource(b,s,'SpecialSPNeed',need);
    }
    function syncDemigogueHp(b,u){
      const s=mem(b,u);if(!s)return;
      const ownerMax=combatPanel(u).hp,servantMax=combatPanel(s).hp;
      if(!(ownerMax>0&&servantMax>0))return;
      const ratio=Math.max(0,Math.min(1,u.hp/ownerMax));
      s.hp=servantMax*ratio;
    }
    const servantActions=()=>({basic:{name:SERVANT[1141501].name,type:'Talent',element:'Ice',target:'all',terms:[],hitShares:[1],
      energyGain:0,spCost:0,spGain:0,toughness:SERVANT[1141501].stance[1]},
      poem:{name:SERVANT[1141502].name,type:'Servant',element:'Ice',target:'ally',terms:[],hitShares:[1],energyGain:0,spCost:0,spGain:0,toughness:0}});
    function spawnDemo(b,u){
      // 忆灵天赋 1141503：德谬歌在场时昔涟与德谬歌生命上限 +33.6% —— 必须先挂再按面板折算忆灵生命。
      if(!has(u,'cyrene-hpup'))buff(b,u,u,'等待，在所有的过去','hpPct',SV(1141503)[0],null,{id:u.id+':cyrene-hpup',tag:'cyrene-hpup'});
      const s=spawnServant(b,u,{key:'demogogue',name:'德谬歌',element:'Ice',aggro:100,cannotAct:true,speedFloor:1,
        hpOf:base=>base.hp*P(u).Ultra[0],speedOf:()=>1,actions:servantActions},api);
      // 1141505：德谬歌被召唤时解除我方全体控制类负面状态。
      for(const to of allies(b,u))to.buffs=to.buffs.filter(e=>!e.control);
      s.resources['故事']=0;
      // Skill03 copies the owner's current special SP into the newly-created servant.
      // The source's Cyrene_00_ChargeEnergy / CurSpecialSP change hook keeps this mirror live.
      syncServantSpecialSP(b,u);
      story(b,u,1); // 1141526：德谬歌被召唤时获得1点【故事】。
      return s;
    }
    // 141504：追忆实际存储上限 27，首次终结门槛 24。
    // energyMax 保留公共合同 24；resources 是实际存储，energy 只镜像首次可用额度。
    // 涟漪形态的 12 点终结分支另行接入，不能把本次存储修复当作形态全验收。
    const memoCap=u=>P(u).Talent[2];
    const ultNeed=u=>ripple(u)?P(u).Talent[4]:P(u).Talent[3];
    function gainMemo(b,u,n){
      if(!(n>0))return;
      const next=Math.min(memoCap(u),(u.resources['追忆']??0)+n);
      resource(b,u,'追忆',next);
      syncServantSpecialSP(b,u);
      const usable=Math.min(next,u.energyMax??0);
      // 只传镜像差值，避免把已保存的 25～27 点重复累计为通用 energyOverflow。
      if(usable!==u.energy)energy(b,u,usable-u.energy,true);
    }
    function spendMemo(b,u,n){
      const next=Math.max(0,(u.resources['追忆']??0)-n);
      resource(b,u,'追忆',next);
      syncServantSpecialSP(b,u);
      const usable=Math.min(next,u.energyMax??0);
      if(usable!==u.energy)energy(b,u,usable-u.energy,true);
    }
    const futureTag=u=>'cyreneFuture:'+u.id;
    function grantFuture(b,u,to){
      if(!to||to.side!==u.side||to===u||to.memospriteOwner===u.id)return;
      buff(b,u,to,'未来','marker',0,null,{id:u.id+':future:'+to.id,tag:futureTag(u),removeOnSourceDeath:true});
    }
    function grantTeamFuture(b,u){for(const to of b.units)grantFuture(b,u,to);}
    function consumeFuture(b,u,actor,kind){
      if(!actor||actor.side!==u.side||['technique','copy','additional','dot'].includes(kind))return;
      const token=actor.buffs.find(e=>e.tag===futureTag(u));if(!token)return;
      // 原始 Teamate 的 OnBeforeSkillUse / OnInsertAbilityStart：按施放而非命中分段。
      gainMemo(b,u,P(u).Talent[0]);
      const source=actor.memospriteOwner??actor.id;
      if(source!==u.id){
        const seen=Array.isArray(u.resources['真我诗篇来源'])?u.resources['真我诗篇来源']:[];
        if(!seen.includes(source)){
          resource(b,u,'真我诗篇来源',[...seen,source]);
          resource(b,u,'额外弹射',(u.resources['额外弹射']??0)+1);
          resource(b,u,'真我之诗待结算',1);
        }
      }
      if(!(trace(u,1)&&actor.memospriteOwner))actor.buffs=actor.buffs.filter(e=>e!==token);
    }
    function fieldOn(b,u,duration){
      buff(b,u,u,'来世的乐土','marker',0,duration,{tag:'cyreneField',removeOnSourceDeath:true});
      record(b,'mechanic',u,{name:'展开结界'});
    }
    // 德谬歌施放【花与箭的舞曲】：全体 0.84，E1/献予真我追加弹射；E4 使弹射倍率每次 +6%（上限 24 层）。
    function danceCast(b,u){
      const s=mem(b,u);if(!s||!api.live(s))return;
      const q=SV(1141501);
      const trueSelf=!!u.resources['真我之诗待结算'];resource(b,u,'真我之诗待结算',0);
      resource(b,u,'本次真我诗篇舞曲',trueSelf?1:0);
      if(trueSelf&&rank(u,1))gainMemo(b,u,rank(u,1,0));
      // 4.6 文本没有“消耗/重置”字样：不同队友来源的累计弹射对之后每次舞曲都生效。
      const storedBounces=u.resources['额外弹射']??0;
      const extraBounces=(trueSelf&&rank(u,1)?rank(u,1,1):0)+storedBounces;
      // Rank 4 params are [per-stack ratio, stack cap]; the bonus from earlier dances
      // applies to this true-self poem bounce, then this dance adds the next stack.
      const e4=rank(u,4)?Math.min(rank(u,4,1),s.resources['舞曲次数']??0)*rank(u,4,0):0;
      for(const to of enemies(b,u))damageTo(b,s,to,{name:q.name,type:'Talent',element:'Ice',
        terms:[{scaling:'hp',multiplier:q[0]}],toughness:SERVANT[1141501].stance[1]},1,'primary','direct');
      const pool=enemies(b,u);
      for(let i=0;i<extraBounces&&pool.length;i++){
        const to=pool[Math.floor(b.random()*pool.length)];
        damageTo(b,s,to,{name:SERVANT[1141526].name,type:'Additional',element:'Ice',
          terms:[{scaling:'hp',multiplier:q[0]*(1+e4)}],toughness:SERVANT[1141501].stance[0]},1,'primary','additional');
      }
      s.resources['舞曲次数']=(s.resources['舞曲次数']??0)+1;
      // 1141519 献予「天空」之诗：德谬歌施放忆灵技时，持有诗篇的风堇获得 2 层。
      for(const to of allies(b,u)){
        const sky=to.buffs.find(e=>String(e.tag??'')==='cyreneSkyPoem:'+u.id);
        if(sky)sky.stacks=(sky.stacks??0)+2;
      }
    }
    const HEIRS=new Set([1402,1403,1404,1405,1406,1407,1408,1409,1410,1412,1413,1414,1415,8007,8008]);
    function castPoem(b,u,s,target){
      if(!target||target.side!==u.side||!api.live(target))return;
      const id=target.characterId??target.kit?.characterId,old=s.resources['诗篇目标'];
      const seen=Array.isArray(old)?old:[];
      if(!seen.includes(target.id)){
        seen.push(target.id);resource(b,s,'诗篇目标',seen);
        const targets=u.resources['献诗目标'];const unique=Array.isArray(targets)?targets:[];
        if(!unique.includes(target.id))resource(b,u,'献诗目标',[...unique,target.id]);
      }
      buff(b,u,target,`${SERVANT[1141502].name} · 诗篇`,'marker',0,null,{id:u.id+':cyrene-poem:'+target.id,tag:'cyrenePoem:'+u.id});
      // 非黄金裔走原技能 #2/#3；增益也同步给目标的忆灵。
      if(!HEIRS.has(id)){
        const q=SERVANT[1141502].p;
        buff(b,u,target,'此诗，献予一切生命 · 伤害提高','dmgBoost',q[1],q[2],{id:u.id+':poem-dmg:'+target.id,tag:'cyrenePoemDmg:'+u.id});
        for(const m of b.units.filter(x=>x.memospriteOwner===target.id&&api.live(x)))
          buff(b,u,m,'此诗，献予一切生命 · 忆灵伤害提高','dmgBoost',q[1],q[2],{id:u.id+':poem-memo:'+m.id,tag:'cyrenePoemDmg:'+u.id});
      } else if(id===1402){
        const p=SV(1141514),s=memOf(b,target),cap=6+(target.kit?.eidolon>=4?1:0);
        resource(b,target,'Cyrene浪漫诗篇来源',u.id);resource(b,target,'Cyrene浪漫诗篇速度层数',cap);
        buff(b,u,target,'献予「浪漫」之诗 · 浪漫','marker',0,null,{id:u.id+':aglaea-romance:'+target.id,tag:'cyreneAglaeaRomance:'+u.id});
        if(s){resource(b,s,'速度层数',cap);const speed=combatPanel(target).speed*target.kit.params.Talent[3]+cap*SV(1140203)[0];s.baseSpeed=speed;s.panel={...s.panel,speed};}
        const recipients=[target,s].filter(Boolean);
        for(const to of recipients){
          buff(b,u,to,'献予「浪漫」之诗 · 伤害提高','dmgBoost',p[1],null,{id:u.id+':aglaea-poem-dmg:'+to.id,tag:'cyreneAglaeaPower:'+u.id});
          buff(b,u,to,'献予「浪漫」之诗 · 无视防御','defIgnore',p[2],null,{id:u.id+':aglaea-poem-def:'+to.id,tag:'cyreneAglaeaPower:'+u.id});
        }
      } else if(id===1406){
        // 献予「窃语」之诗：赛飞儿整场获得伤害提高；防御降低由赛飞儿面板钩子
        // 按当前【老主顾】标记动态覆盖全体敌人，换波后也自然生效。
        buff(b,u,target,'献予「诡计」之诗 · 伤害提高','dmgBoost',SV(1141520)[0],null,
          {id:u.id+':poem-cipher-dmg:'+target.id,tag:'cyreneCipherPoem:'+u.id});
      } else if(id===1410){
        // 献予「浪潮」之诗：永久增伤；首次普攻/战技触发暖流回能，每次普攻/战技命中后引爆 DoT。
        buff(b,u,target,'献予「海洋」之诗 · 伤害提高','dmgBoost',SV(1141522)[0],null,
          {id:u.id+':poem-hys-dmg:'+target.id,tag:'cyreneHysPoem:'+u.id});
        buff(b,u,target,'献予「海洋」之诗 · 暖流','marker',0,null,
          {id:u.id+':poem-hys-warm:'+target.id,tag:'cyreneHysWarm:'+u.id});
        resource(b,target,'Cyrene诗篇参数:海洋',{basic:SV(1141522)[1],skill:SV(1141522)[2],energy:SV(1141522)[3]});
      } else if(id===1413){
        // 献予「岁月」之诗：长夜的忆灵技伤害 +25.2%；长夜月施放战技/终结后额外获得1点忆质。
        const night=memOf(b,target);
        if(night)buff(b,u,night,'献予「岁月」之诗 · 迷梦伤害','dmgBoost',.252,null,{id:u.id+':poem-evernight:'+target.id,tag:'cyreneEvernightPoem:'+u.id});
        buff(b,u,target,'献予「岁月」之诗 · 额外追忆','marker',0,null,{id:u.id+':poem-evernight-owner:'+target.id,tag:'cyreneEvernightPoem:'+u.id});
      } else if(id===1407){
        // 献予「生死」之诗：新蕊允许溢出至200%。溢出在召唤死龙时结算。
        resource(b,target,'新蕊溢出倍率',2);
      } else if(id===1408){
        // 献予「负世」之诗：获得6点火种，并标记永续燃烧分支。
        energy(b,target,6,true);resource(b,target,'永续的燃烧',1);
      } else if(id===1403){
        // 1141515 献予「门径」之诗：缇宝造成的伤害无视敌方 16.8% 防御（整场生效）。
        // 追加攻击触发结界附加伤害时额外 1 次：由缇宝模块检测 cyreneGatePoem 标记后 +1 段。
        buff(b,u,target,'献予「门径」之诗 · 无视防御','defIgnore',SV(1141515)[1],null,
          {id:u.id+':poem-gate-def:'+target.id,tag:'cyreneGatePoem:'+u.id});
      } else if(id===1409){
        // 1141519 献予「天空」之诗：为风堇恢复 33.6 点能量并获得 2 层。
        // 层数由风堇模块读取：治疗计入小伊卡的数值额外 +100.8%，施放战技/终结技消耗 1 层。
        const p=SV(1141519),tag='cyreneSkyPoem:'+u.id;
        energy(b,target,p[1],true);
        const cur=target.buffs.find(e=>e.tag===tag)?.stacks??0;
        buff(b,u,target,'献予「天空」之诗 · 层数','marker',0,null,
          {id:u.id+':poem-sky:'+target.id,tag,stacks:cur+2});
      } else if(id===1412){
        // 1141523 献予「律法」之诗：「持有【军功】的角色暴击伤害提高 42%」是持有者状态光环，
        // 而【军功】持有者会随 1412 的战技/终结技变化（kit-runtime.merit 重新指定目标）。
        // 因此把诗篇数值记在 1412 身上，merit 在目标变化时把光环迁移到当前持有者；
        // 诗篇施放时若尚无人持有【军功】，也会在首次指定持有者时补上。
        resource(b,target,'Cyrene律法诗篇:'+u.id,SV(1141523)[0]);
        const holder=get(b,target.resources['军功目标']);
        if(holder)buff(b,u,holder,'献予「律法」之诗 · 暴击伤害','critDmg',SV(1141523)[0],null,
          {id:u.id+':poem-law-cd:'+holder.id,tag:'cyreneLawPoem:'+u.id});
        // 「奇袭结束后充能 +1」由 kit-runtime.consumeCopy 检测 Cyrene律法诗篇 资源后结算。
      } else if(id===1405){
        // 1141518 献予「理性」之诗：恢复 1 个战技点并使那刻夏立即行动；
        // 那刻夏下一次普攻/战技时获得【真知】（智识命途攻击力 +84%、战技伤害 +56%），
        // 持续至下一个那刻夏回合开始；「战技伤害次数 +3」由 1405 的 prepare 消费该次数。
        const p=SV(1141518);
        sp(b,target,p[3],'献予「理性」之诗');
        advance(b,target.id,1);
        resource(b,target,'Cyrene理性诗篇来源',u.id);
        resource(b,target,'Cyrene理性诗篇待真知',1);
        resource(b,target,'Cyrene理性诗篇次数',p[0]);
      } else if(id===8007||id===8008){
        // 献予「创世」之诗：整场生效。攻击力按德谬歌生命上限换算为固定攻击，
        // 暴击率按施放时德谬歌面板暴击率换算；同一增益同时作用于记忆开拓者和迷迷。
        const p=SV(1141513),demoPanel=combatPanel(s),attack=demoPanel.hp*p[0],crit=demoPanel.critRate*p[1];
        resource(b,u,'创世诗篇加成:'+target.id,{atk:attack,crit});
        const recipients=[target,...b.units.filter(x=>x.memospriteOwner===target.id&&api.live(x))];
        for(const to of recipients){
          buff(b,u,to,'献予「创世」之诗 · 攻击','atk',attack,null,{id:u.id+':creation-atk:'+to.id,tag:'cyreneCreationPoem:'+u.id});
          buff(b,u,to,'献予「创世」之诗 · 暴击','critRate',crit,null,{id:u.id+':creation-crit:'+to.id,tag:'cyreneCreationPoem:'+u.id});
        }
      }
      record(b,'mechanic',u,{name:'德谬歌施放诗篇',target:target.id,poem:id===1413?'岁月':id===1406?'诡计':id===1410?'海洋':id===1407?'生死':id===1408?'负世':id===1403?'门径':id===1405?'理性':id===1409?'天空':id===1412?'律法':id===8007||id===8008?'创世':HEIRS.has(id)?'专属诗篇':'一切生命'});
    }
    // 1141518【真知】：只作用于「智识」命途角色；攻击力与战技伤害两条增益同源，
    // 在下一个那刻夏回合开始时一并移除。
    function grantTruth(b,u,owner){
      const p=SV(1141518),tag='cyreneTruth:'+u.id;
      for(const to of allies(b,u)){
        if(!['智识','Erudition'].includes(to.path))continue;
        buff(b,u,to,'真知 · 攻击','atkPct',p[2],null,{id:u.id+':truth-atk:'+to.id,tag});
        buff(b,u,to,'真知 · 战技伤害','dmgBoost',p[1],null,{id:u.id+':truth-skill:'+to.id,tag,abilityType:'BPSkill'});
      }
      record(b,'mechanic',u,{name:'献予「理性」之诗 · 真知',target:owner.id});
      resource(b,owner,'Cyrene理性诗篇真知已获',owner.turns??0);
    }
    function clearTruth(b,u){
      const tag='cyreneTruth:'+u.id;
      for(const to of b.units)to.buffs=to.buffs.filter(e=>e.tag!==tag);
    }
    return {
      start(b,u){
        resource(b,u,'追忆',0);resource(b,u,'故事',0);resource(b,u,'额外弹射',0);
        resource(b,u,'真我诗篇来源',[]);resource(b,u,'真我之诗待结算',0);
        energy(b,u,-u.energy,true);                            // 【追忆】从 0 开始
        // 行迹 point07：队伍中除昔涟外的黄金裔 / 记忆命途角色 1/2/3 名 → 开场 2/3/6 点追忆。
        if(trace(u,2)){
          const n=allies(b,u).filter(t=>t!==u&&(t.path==='记忆'||t.path==='Remembrance'||t.camp==='翁法罗斯')).length;
          const v=n>=3?trace(u,2)[2]:n===2?trace(u,2)[1]:n===1?trace(u,2)[0]:0;
          if(v)gainMemo(b,u,v);
        }
        if(rank(u,2))gainMemo(b,u,rank(u,2,0));
        grantTeamFuture(b,u);
        // 天赋：我方全体目标造成伤害提高 20%（光环，用 buff 表达）。
        for(const to of allies(b,u))buff(b,u,to,'众愿啊，汇流如歌','dmgBoost',P(u).Talent[1],null,{id:u.id+':talent-aura',removeOnSourceDeath:true});
      },
      unitCreated(b,u,to){
        if(trace(u,1)&&to.memospriteOwner)grantFuture(b,u,to);
        if(to.memospriteOwner){
          const creation=u.resources['创世诗篇加成:'+to.memospriteOwner];
          if(creation){
            buff(b,u,to,'献予「创世」之诗 · 攻击','atk',creation.atk,null,{id:u.id+':creation-atk:'+to.id,tag:'cyreneCreationPoem:'+u.id});
            buff(b,u,to,'献予「创世」之诗 · 暴击','critRate',creation.crit,null,{id:u.id+':creation-crit:'+to.id,tag:'cyreneCreationPoem:'+u.id});
          }
        }
      },
      entry(b,u){fieldOn(b,u,P(u).BPSkill[1]);},
      prepare(b,u,key,kind,a){
        if(kind!=='copy'&&ripple(u)&&key==='basic')return {...u.actions.enhancedBasic,targetId:a.targetId};
        return a;
      },
      before(b,u,actor,key,kind,a,selected){
        consumeFuture(b,u,actor,kind);
        // 1141518：那刻夏下一次普攻/战技时获得【真知】。buff 在本次动作结算前挂上，
        // 因此本次战技也享受 56% 战技伤害加成。
        if(actor?.characterId===1405&&kind!=='copy'&&kind!=='technique'&&['basic','skill'].includes(key)&&
           actor.resources?.['Cyrene理性诗篇来源']===u.id&&actor.resources?.['Cyrene理性诗篇待真知']){
          resource(b,actor,'Cyrene理性诗篇待真知',0);
          grantTruth(b,u,actor);
        }
        if(actor!==u)return;
        const p=P(u);
        if(key==='skill'&&kind!=='copy'){
          gainMemo(b,u,p.BPSkill[2]);
          fieldOn(b,u,p.BPSkill[1]);
        }
        if(key==='ultimate'&&kind!=='copy'){
          // 141503「初次变身」单场一次；涟漪中的12点终结技走141514「一如初见的重逢」，
          // 只让德谬歌按141514的可选队友数量分支再行动一次，不重召唤、不重复变身。
          if(u.resources['终结已用']){
            if(ripple(u)){
              spendMemo(b,u,12);
              const existing=mem(b,u),teammates=allies(b,u).filter(t=>!t.memospriteOwner);
              if(existing)useAction(b,existing,teammates.length>=2?'poem':'basic','extra',api.get(b,u.policy?.allyTargetId)?.id);
              story(b,u,1);
            }
            return;
          }
          resource(b,u,'终结已用',1);
          // The first form costs 12 actual special SP; perform it before servant creation so
          // Skill03's CurSpecialSP copy receives the remaining (including overflow) value.
          spendMemo(b,u,12);
          const s=spawnDemo(b,u);
          s.distance=0;s.advanceOrder=(b.advanceSequence=(b.advanceSequence??0)+1);
          // Skill03_Phase02：场上可选我方角色数≥2时施放辅助忆灵技；否则直接施放舞曲。
          const teammates=allies(b,u).filter(t=>!t.memospriteOwner);
          if(teammates.length>=2)useAction(b,s,'poem','extra',api.get(b,u.policy?.allyTargetId)?.id);
          else useAction(b,s,'basic','extra');
          // 激活全体队友的终结技。
          for(const to of allies(b,u)){
            if(to!==u&&to.actions?.ultimate&&(to.energyMax??0)>0){to.energy=to.energyMax;b.queue.push({actor:to.id,key:'ultimate',kind:'ultimate'});}
          }
          buff(b,u,u,'往昔的涟漪','marker',0,null,{tag:'cyreneRipple'});
          // Talent[4] lowers the ultimate gate to 12 while Ripple is active.
          u.actions.ultimate.energyCost=ultNeed(u);
          u.actions.ultimate.name=ROSTER_DATA[1415].skills['141514'].name;
          for(const to of allies(b,u))if(!to.memospriteOwner)buff(b,u,to,'往昔的涟漪 · 暴击','critRate',p.Ultra[2],null,{id:u.id+':ripple-crit'});
          // 展开战技的结界并使结界没有持续时间。
          u.buffs=u.buffs.filter(e=>e.tag!=='cyreneField');fieldOn(b,u,null);
          // 首次终结门槛为24，但实际只消耗12；保留超出部分以便涟漪形态立即再次施放。
          syncServantSpecialSP(b,u);
          if(rank(u,6)){advance(b,u.id,rank(u,6,0));for(const to of allies(b,u))advance(b,to.id,rank(u,6,0));}
          // 终结后使德谬歌获得 1 点【故事】。
          story(b,u,1);
        }
        void selected;
      },
      after(b,u,actor,key,kind,a,selected,hitTargets){
        if(actor?.side===u.side&&(actor.characterId===8007||actor.characterId===8008)&&
           key==='basic'&&kind!=='copy'&&a?.name===actor.actions.enhancedBasic?.name&&
           actor.buffs.some(e=>e.tag==='cyreneCreationPoem:'+u.id)){
          const s=mem(b,u);
          if(s){
            if(enemies(b,u).length)useAction(b,s,'basic','extra');
            else resource(b,u,'创世诗篇待弹射',1);
          }
        }
        if(actor===mem(b,u)&&key==='poem'){
          const s=actor,target=selected?.[0]??api.get(b,u.policy?.allyTargetId)??allies(b,u).find(t=>t!==u);
          castPoem(b,u,s,target);
        }
        if(actor===mem(b,u)&&key==='basic'){
          danceCast(b,u);
          if(u.resources['本次真我诗篇舞曲']){
            resource(b,u,'本次真我诗篇舞曲',0);
            const count=(u.resources['真我之诗触发次数']??0)+1;resource(b,u,'真我之诗触发次数',count);
            if(rank(u,6)&&count===1)for(const to of enemies(b,u))buff(b,u,to,'记忆，化作涟漪片片 · 防御降低','defShred',rank(u,6,1),null,{id:u.id+':cyrene-e6-def:'+to.id,debuff:true});
            if(rank(u,6)&&count>=2)for(const to of allies(b,u))advance(b,to.id,rank(u,6,2));
          }
        }
        if(actor===u&&(key==='basic'||key==='enhancedBasic')){
          // 普攻 +Normal[1]；【往昔的涟漪】下的强化普攻 +EnhancedNormal[1]。
          const enhanced=a?.name===u.actions.enhancedBasic.name;
          gainMemo(b,u,enhanced?ROSTER_DATA[1415].skills['141508'].params['10'].param_list[1]:P(u).Normal[1]);
        }
        if(actor===u&&!['copy','technique'].includes(kind))grantTeamFuture(b,u);
        if(u.resources['德谬歌生命待同步']){syncDemigogueHp(b,u);resource(b,u,'德谬歌生命待同步',0);}
        void a;void selected;void hitTargets;void actor;void key;void kind;
      },
      // 结界真实伤害：由 afterDamage 监听（伤害事件已写入日志，取上一条记录的原伤害）。
      afterDamage(b,u,from,to,kind){
        if(kind==='true'||!field(u))return;
        if(!from||from.side!==u.side||to.side===u.side)return;
        const ev=b.log[b.log.length-1];
        if(!ev||ev.type!=='damage')return;
        const poemCount=new Set(u.resources['献诗目标']??[]).size;
        const ratio=P(u).BPSkill[0]+(rank(u,2)?Math.min(rank(u,2,3),poemCount*rank(u,2,2)):0);
        trueDamage(b,from,to,ev.damage*ratio,'来世的乐土 · 真实伤害');
      },
      // 1141503：昔涟生命百分比变化时，德谬歌同步到相同生命百分比。
      hpChanged(b,u,target){if(target===u){resource(b,u,'德谬歌生命待同步',1);syncDemigogueHp(b,u);}},
      waveStart(b,u){
        if(!u.resources['创世诗篇待弹射'])return;
        const s=mem(b,u);if(!s||!enemies(b,u).length)return;
        resource(b,u,'创世诗篇待弹射',0);
        useAction(b,s,'basic','extra');
      },
      // 1141518「持续至下一个那刻夏回合开始时」：只在【真知】已经获得后的下一个
      // 那刻夏回合开始清除；仅持有待结算标记（尚未施放普攻/战技）时不清。
      turnStart(b,u,actor){
        if(actor?.characterId!==1405||actor.resources?.['Cyrene理性诗篇来源']!==u.id)return;
        const granted=actor.resources?.['Cyrene理性诗篇真知已获'];
        if(granted==null||(actor.turns??0)<=granted)return;
        clearTruth(b,u);
        resource(b,actor,'Cyrene理性诗篇真知已获',null);
        resource(b,actor,'Cyrene理性诗篇待真知',0);
        resource(b,actor,'Cyrene理性诗篇来源',null);
      },
      summonTurn(){},
      death(b,u,from,to){
        if(to===u||to.memospriteOwner===u.id){
          const s=memAny(b,u);if(s)dismissServant(b,u,s,api);
          // E6 首次真我诗篇的 -20% 防御只在德谬歌在场时生效；德谬歌/昔涟离场即清除。
          for(const e of b.units)if(e.side!==u.side)
            e.buffs=e.buffs.filter(x=>!String(x.id??'').startsWith(u.id+':cyrene-e6-def:'));
        }
        void from;
      },
      modifiers(b,u,actor,to,a,kind){
        const out={};if(to.side===u.side)return out;
        // 行迹 point08：速度 ≥180 时我方全体增伤 20%，昔涟与德谬歌冰属性抗穿 +2%/每点超出（最多 60 点）。
        if(trace(u,3)&&combatPanel(u).speed>=trace(u,3)[0]){
          out.dmgBoost=(out.dmgBoost??0)+trace(u,3)[3];
          if(actor===u||actor?.memospriteOwner===u.id)
            out.resPen=(out.resPen??0)+Math.min(trace(u,3)[2],combatPanel(u).speed-trace(u,3)[0])*trace(u,3)[1];
        }
        void a;void kind;return out;
      },
      display(b,u){return [{type:'buff',id:u.id+':memo',source:u.id,name:'追忆',key:'marker',value:u.resources['追忆']??0,remaining:null,derived:true,tickOwner:u.id}];},
    };
    // 【故事】：昔涟施放终结技后或德谬歌被召唤时 +1；达到 3 点 → 德谬歌立即获得额外回合并施放舞曲。
    function story(b,u,n){
      const s=mem(b,u);if(!s)return;
      resource(b,s,'故事',(s.resources['故事']??0)+n);
      const need=SV(1141526)[1];
      if(s.resources['故事']>=need){
        // 1141526 原文只写消耗全部【故事】获得额外回合并施放舞曲，没有追忆增益。
        resource(b,s,'故事',0);
        useAction(b,s,'basic','extra');
      }
      void get;
    }
  },

  // ═════════════════════════ 1512 知更鸟•晴歌（风 · 记忆） ═════════════════════════
  // 普攻 音浪，为海风定调 Normal[0]=0.7（生命上限）1 段，削韧 30。
  // 战技 盛夏是灵魂的乐手：BPSkill[0]=1（回复晴空乐手生命）、BPSkill[1]=6 点气氛值。
  // 终结 跃入这片蔚蓝狂想：Ultra[0]=1 行动提前 100%、Ultra[1]=2 回合、Ultra[2]=0.2 固定回能 20%。
  // 天赋 巡游在无界的天空：Talent[0]=0.7 生命、Talent[1]=1.8 速度、Talent[4]=50 气氛上限、
  //   [5]=6/[6]=12 额外乐手阈值、[7]=0.15/[8]=0.005 结界无视防御。
  // 秘技 我们自成旋律：Maze[0]=6 气氛、Maze[1]=0.3 增伤、Maze[2]=0.2 行动提前。
  // 忆灵技 叽叽啾啾四重奏 = 晴空乐手生命上限 2.1 全体风伤（E6 倍率 ×2）。
  // 忆灵天赋 扑翅雀跃的和声[.84,.028,.112,.168,.224,12,0,0,140,.5]、贴近海的心跳[20]、乘上夏夜晚风[.5]。
  // 行迹 point06[.16,.004,.4,.015,2]、point07[12,3,12]、point08[.5,2]。
  // E1[.11,.001,1,.5]、E2[20,2,.18]、E4[12,.2,.005]、E6[1,140,0]。
  1512:function(api){
    const {rank,trace,buff,resource,energy,damageTo,combatPanel,record,advance,heal,allies,enemies,useAction,trueDamage}=api;
    const P=u=>u.kit.params;
    const mem=(b,u)=>memOf(b,u), fever=u=>has(u,'fever');
    const scent=u=>u.resources['气氛值']??0, scentCap=u=>P(u).Talent[4]+(rank(u,2)?rank(u,2,0):0);
    const servants=u=>u.resources['乐手人数']??0;
    const servantActions=()=>({basic:{name:SERVANT[1151201].name,type:'Talent',element:'Wind',target:'all',terms:[],hitShares:[1],
      energyGain:0,spCost:0,spGain:0,toughness:SERVANT[1151201].stance[1]}});
    function spawnBand(b,u){
      const prev=memAny(b,u),fresh=!prev||prev.active===false||prev.hp<=1e-8;
      const s=spawnServant(b,u,{key:'band',name:'晴空乐手',element:'Wind',aggro:100,cannotAct:!fever(u),speedFloor:1,
        hpOf:base=>base.hp*P(u).Talent[0],speedOf:base=>base.speed*P(u).Talent[1],actions:servantActions},api);
      if(rank(u,4)&&fever(u))refreshBandSpeed(b,u);
      if(trace(u,3))buff(b,u,s,'重构谐乐','critRate',trace(u,3)[0],null,{id:u.id+':trace8-crit'});
      // 忆灵天赋 1151205：被召唤时，为知更鸟•晴歌恢复 20 点能量。
      if(fresh)energy(b,u,SV(1151205)[0],true);
      return s;
    }
    function refreshBandSpeed(b,u){
      if(!rank(u,4)||!fever(u))return;
      const s=mem(b,u);if(!s||!api.live(s))return;
      buff(b,u,s,'知更鸟•晴歌 E4 · 速度','speedPct',rank(u,4,1)+scent(u)*rank(u,4,2),null,{id:u.id+':e4-speed'});
    }
    function gainScent(b,u,n,source){
      const before=scent(u);
      resource(b,u,'气氛值',Math.min(scentCap(u),before+n));
      refreshBandSpeed(b,u);
      // 行迹 point06：使知更鸟获得气氛值的**该目标**按攻击力/暴伤分支获得增益；
      // 不能固定取队伍里第一个非知更鸟角色（3~4 人队伍会加错人）。
      if(trace(u,1)&&before<scentCap(u)){
        const to=source&&source.side===u.side?source:(allies(b,u).find(t=>t!==u)??u),val=scent(u);
        const p=combatPanel(u);
        if(combatPanel(to).atk>p.atk)buff(b,u,to,'偏离和弦 · 攻击','atk',p.hp*(trace(u,1)[0]+val*trace(u,1)[1]),trace(u,1)[4],{id:u.id+':trace6-atk'});
        else buff(b,u,to,'偏离和弦 · 暴伤','critDmg',trace(u,1)[2]+val*trace(u,1)[3],trace(u,1)[4],{id:u.id+':trace6-cd'});
      }
      // 行迹 point07：任意目标回合内第一次获得气氛值时若持有【律动】，消耗 1 层并固定回 3 能。
      const rhythm=tagOf(u,'robinRhythm');
      // 原始 PointB2_TurnFlag 只在**我方回合开始**时清除；不能用 b.turns（敌方回合也会推进）。
      if(rhythm&&rhythm.stacks>0&&u.resources['本回合已消耗律动']!==(u.resources['盟友回合计数']??0)){
        resource(b,u,'本回合已消耗律动',u.resources['盟友回合计数']??0);
        buff(b,u,u,'即兴蓝调 · 律动','marker',0,null,{id:u.id+':rhythm',tag:'robinRhythm',stacks:rhythm.stacks-1});
        energy(b,u,trace(u,2)[1],true);
      }
      check(b,u);
    }
    // 气氛值达到 6/12 时立即召唤第二 / 第三名乐手；全员登台 → 进入【Fever】。
    function check(b,u){
      if(!memAny(b,u)&&servants(u)===0)return;
      const n=servants(u),t=P(u).Talent;
      if(scent(u)>=t[5]&&n<2){resource(b,u,'乐手人数',2);record(b,'mechanic',u,{name:'召唤晴空乐手 · 啾米'});spawnBand(b,u);}
      if(scent(u)>=t[6]&&servants(u)<3){resource(b,u,'乐手人数',3);record(b,'mechanic',u,{name:'召唤晴空乐手 · 派丁'});spawnBand(b,u);}
      if(servants(u)>=3&&!fever(u))enterFever(b,u);
    }
    function enterFever(b,u){
      const s=spawnBand(b,u);
      buff(b,u,u,'Fever','marker',0,null,{tag:'fever'});
      s.cannotAct=false;
      // 1151203 Fever 进入时 ResetActionDelay：乐手从满行动条开始。
      s.distance=10000;s.advanceOrder=0;
      refreshBandSpeed(b,u);
      // 151204 desc：全员登台时解除知更鸟与「晴空乐手」陷入的**所有**控制类负面状态
      //（旧实现只清冻结，眩晕/禁锢/纠缠等仍会残留）。
      const cleanseControl=t=>{t.buffs=t.buffs.filter(e=>!e.control);t.dots=t.dots.filter(e=>!e.control);};
      cleanseControl(u);cleanseControl(s);
      let cd=b.summons.find(x=>x.id===u.id+':fever');
      if(!cd){cd={id:u.id+':fever',name:'【Fever】倒计时',owner:u.id,bondmate:u.id,kind:'countdown',
        speed:SV(1151203)[8],distance:10000,active:true,order:b.units.length+b.summons.length};b.summons.push(cd);}
      // 退出 Fever 后倒计时只是失活；再次进入 Fever 时必须重新启用并回到满行动条。
      else{cd.active=true;cd.speed=SV(1151203)[8];cd.distance=10000;}
      if(rank(u,6))u.energyMax=(u.resources['基础能量上限']??ROSTER_DATA[1512].energyMax)*2;
      if(rank(u,6)&&!u.resources['fever回能已用']){resource(b,u,'fever回能已用',1);energy(b,u,rank(u,6,1),true);}
      if(rank(u,4))gainScent(b,u,rank(u,4,0),u);
      record(b,'mechanic',u,{name:'进入【Fever】'});
    }
    function exitFever(b,u){
      u.buffs=u.buffs.filter(e=>e.tag!=='fever');
      const s=memAny(b,u);
      if(s){s.buffs=s.buffs.filter(e=>e.id!==u.id+':e4-speed');advance(b,u.id,SV(1151206)[0]);dismissServant(b,u,s,api);}
      resource(b,u,'乐手人数',0);
      if(rank(u,6)){
        u.energyMax=u.resources['基础能量上限']??ROSTER_DATA[1512].energyMax;
        energy(b,u,0,true);
      }
      const cd=b.summons.find(x=>x.id===u.id+':fever');if(cd)cd.active=false;
    }
    function bandAction(b,u){
      const s=mem(b,u);if(!s||!api.live(s))return;
      const q=SV(1151201);
      s.actions.basic.terms=[{scaling:'hp',multiplier:q[1]*(rank(u,6)?1+rank(u,6,0):1)}];
      useAction(b,s,'basic','extra');
    }
    return {
      start(b,u){resource(b,u,'气氛值',0);resource(b,u,'乐手人数',0);resource(b,u,'晴空乐手记录伤害',0);resource(b,u,'本回合已消耗律动',-1);resource(b,u,'事件扫描',b.log.length);resource(b,u,'基础能量上限',u.energyMax??ROSTER_DATA[1512].energyMax);},
      // 秘技：下一次战斗开始时行动提前 20%、立即获得 6 点气氛值、我方全体增伤 30%/2 回合。
      entry(b,u){
        const maze=ROSTER_DATA[1512].skills['151207']?.params?.['1']?.param_list??[6,.3,.2];
        advance(b,u.id,maze[2]);
        gainScent(b,u,maze[0],u);
        for(const to of allies(b,u))buff(b,u,to,'我们自成旋律','dmgBoost',maze[1],2,{id:u.id+':maze-dmg'});
      },
      after(b,u,actor,key,kind,a,selected,hitTargets){
        const scentBeforeAction=scent(u);
        // E1：忆灵技追加伤害按当前记录值和当前气氛值结算，然后仅清除记录值的50%。
        // 先由忆灵自身的基础全体攻击结算，再把真实伤害打到当前生命值最高的存活敌人。
        // 忆灵的真实回合由引擎以 kind='normal' 执行（engine.mjs 的召唤物行动路径），
        // 旧条件只接受 kind='extra'，导致 E1 在正常战斗中永远不触发。
        if(rank(u,1)&&actor?.memospriteOwner===u.id&&key==='basic'&&kind!=='copy'&&kind!=='technique'){
          const stored=u.resources['晴空乐手记录伤害']??0;
          const target=enemies(b,u).reduce((best,to)=>!best||to.hp>best.hp?to:best,null);
          if(stored>0&&target){
            const params=u.kit.ranks[1],ratio=params[0]+scent(u)*params[1];
            trueDamage(b,actor,target,stored*ratio,'知更鸟•晴歌 E1 · 忆灵记录真实伤害');
            resource(b,u,'晴空乐手记录伤害',stored*(1-params[3]));
            record(b,'mechanic',u,{name:'晴空乐手 · E1 记录结算',target:target.id,stored,ratio,remaining:stored*(1-params[3])});
          }
        }
        if(actor===u&&key==='skill'&&kind!=='copy'){
          // 151202：Success 分支（首次召唤）只 CreateServant；Failed 分支（已在场）才治疗并 +6 气氛。
          const had=!!memOf(b,u);
          const s=spawnBand(b,u);
          if(had){
            heal(b,u,s,combatPanel(s).hp*P(u).BPSkill[0]);
            gainScent(b,u,P(u).BPSkill[1],u);
          }else if(servants(u)===0)resource(b,u,'乐手人数',1);
        }
        if(actor===u&&key==='ultimate'&&kind!=='copy'){
          const to=api.get(b,u.policy?.allyTargetId)??allies(b,u).find(t=>t!==u);
          if(to){
            advance(b,to.id,P(u).Ultra[0]);
            energy(b,to,(to.energyMax??0)*P(u).Ultra[2],true);
            // 151203：持有者及其召唤物攻击额外 +2 气氛，且无法使其他友方获得行动提前。
            // `blockAllyAdvance` 是引擎通用白名单标记（engine.advance）。
            buff(b,u,to,'特邀嘉宾','marker',0,P(u).Ultra[1],{id:u.id+':guest',tag:'robinGuest',tickAt:'start',blockAllyAdvance:true});
          }
        }
        // 我方目标施放攻击 → +1 气氛值；【特邀嘉宾】攻击额外 +2。
        if(hitTargets.length&&actor&&actor.side===u.side&&!['dot','additional'].includes(kind)){
          gainScent(b,u,1,actor);
          // 【特邀嘉宾】：持有者**及其召唤物**攻击时额外 +2 气氛值（151203 desc）。
          const guestOwner=actor.buffs?.some(e=>e.tag==='robinGuest')
            ||(actor.memospriteOwner&&b.units.find(t=>t.id===actor.memospriteOwner)?.buffs.some(e=>e.tag==='robinGuest'));
          if(guestOwner)gainScent(b,u,P(u).Ultra[1],actor);
        }
        // 每个提供者自己的回合首次治疗/施加护盾 → +1 气氛值（扫描日志）。
        // 原始 Passive_HyperCharge 的 TurnFlag 挂在 ModifierOwnerEntity，且只在该单位
        // OnListenTurnBegin 时移除；不能用全队 b.turns 作锁，否则同一提供者在别人的回合
        // 触发治疗/护盾会被重复计数。
        const from=u.resources['事件扫描']??0;
        if(b.log.length>from){
          for(const e of b.log.slice(from))if(e.type==='heal'||e.type==='shield'){
            const provider=b.units.find(t=>t.id===e.actor);if(!provider||provider.side!==u.side)continue;
            const key='治疗护盾气氛回合:'+provider.id,turn=provider.turns??0;
            if((u.resources[key]??-1)!==turn){
              resource(b,u,key,turn);gainScent(b,u,1,provider);
            }
            // 行迹 point07：知更鸟或晴空乐手受到**队友**治疗/护盾时 +12 层【律动】，上限 12。
            const rhythmTrace=trace(u,2);
            if(rhythmTrace){
              const target=b.units.find(t=>t.id===e.target);
              const robinOrBand=target===u||target?.memospriteOwner===u.id;
              const fromMate=provider!==u&&provider.memospriteOwner!==u.id;
              if(robinOrBand&&fromMate){
                const cur=tagOf(u,'robinRhythm')?.stacks??0,next=Math.min(rhythmTrace[2],cur+rhythmTrace[0]);
                buff(b,u,u,'即兴蓝调 · 律动','marker',0,null,{id:u.id+':rhythm',tag:'robinRhythm',stacks:next});
                record(b,'mechanic',u,{name:'即兴蓝调 · 律动',stacks:next,source:provider.id,target:e.target});
              }
            }
          }
          resource(b,u,'事件扫描',b.log.length);
        }
        // E2 的 TurnFlag 属于当前施放技能的我方目标：同一角色本轮最多额外获得一次气氛值，
        // 在该角色下一次正常回合开始后才允许再次触发。只在本次技能确实令气氛值增加时发放。
        if(rank(u,2)&&key==='skill'&&actor?.side===u.side&&scent(u)>scentBeforeAction){
          const key='E2技能气氛回合:'+actor.id,turn=actor.turns??0;
          if((u.resources[key]??-1)!==turn){resource(b,u,key,turn);gainScent(b,u,rank(u,2,1),actor);}
        }
        void a;void selected;
      },
      // E1 只记录我方造成的非真实伤害；这也排除该星魂自己的真实伤害，避免递归记账。
      afterDamage(b,u,from,to,kind){
        if(!rank(u,1)||kind==='true'||from?.side!=='ally'||to?.side==='ally')return;
        const event=b.log[b.log.length-1];
        if(event?.type==='damage'&&event.damage>0)
          resource(b,u,'晴空乐手记录伤害',(u.resources['晴空乐手记录伤害']??0)+event.damage*rank(u,1,2));
      },
      // 行迹 point08：知更鸟本人也 +50% 暴击率（乐手的同名增益在 spawnBand 施加，避免叠加）。
      // 151204 desc：【Fever】期间知更鸟与晴空乐手免疫控制类负面状态。
      panel(b,u,to,out){
        const own=to===u,band=to?.memospriteOwner===u.id;
        if(!own&&!band)return;
        if(own&&trace(u,3))out.critRate=(out.critRate??0)+trace(u,3)[0];
        if(fever(u))out.controlRes=1;
      },
      // 151204 desc：【Fever】状态结束前知更鸟不会进入自己的回合。
      // 引擎在 onTurnStart 之后检查 skipTurns，因此这里置 1 即可跳过本次自身回合。
      // 晴空乐手回合开始时施放忆灵技（Fever 期间才会出现在行动序列上）。
      turnStart(b,u,actor){
        if(actor?.side===u.side)resource(b,u,'盟友回合计数',(u.resources['盟友回合计数']??0)+1);
        if(actor===u&&fever(u)){
          u.skipTurns=Math.max(1,u.skipTurns??0);
          record(b,'mechanic',u,{name:'Fever · 跳过自身回合'});
          return;
        }
        if(actor&&actor.memospriteOwner===u.id){
          const q=SV(1151201);
          actor.actions.basic.terms=[{scaling:'hp',multiplier:q[1]*(rank(u,6)?1+rank(u,6,0):1)}];
          actor.actions.basic.toughness=SERVANT[1151201].stance[1];
          refreshBandSpeed(b,u);
        }
      },
      // 倒计时回合开始：扣除 50% 当前气氛值（至少 12 点）；为 0 时乐手消失并退出【Fever】。
      summonTurn(b,u,s){
        if(s.id!==u.id+':fever')return;
        const q=SV(1151203),cur=scent(u);
        if(rank(u,6))energy(b,u,rank(u,6,1),true);
        const lose=Math.max(q[5],cur*q[9]);
        resource(b,u,'气氛值',Math.max(0,cur-lose));
        refreshBandSpeed(b,u);
        if(scent(u)<=0&&api.live(u))exitFever(b,u);
      },
      death(b,u,from,to){
        if(to===u||to.memospriteOwner===u.id){const s=memAny(b,u);if(s){advance(b,u.id,SV(1151206)[0]);dismissServant(b,u,s,api);}}
        void from;
      },
      modifiers(b,u,actor,to,a,kind){
        const out={};if(to.side===u.side)return out;
        // Fever 结界：我方目标造成伤害无视敌方 (15%+气氛值×0.5%) 防御；乐手数量使敌方受到伤害提高。
        if(fever(u))out.defIgnore=(out.defIgnore??0)+P(u).Talent[7]+scent(u)*P(u).Talent[8];
        // 1151203：Fever 期间知更鸟与晴空乐手造成的伤害提高（84% + 气氛值×2.8%）。
        if(fever(u)&&(actor===u||actor?.memospriteOwner===u.id))
          out.dmgBoost=(out.dmgBoost??0)+SV(1151203)[0]+scent(u)*SV(1151203)[1];
        const n=servants(u);if(n>0)out.vuln=(out.vuln??0)+(n>=3?SV(1151203)[4]:n===2?SV(1151203)[3]:SV(1151203)[2]);
        if(rank(u,2))out.resPen=(out.resPen??0)+rank(u,2,2);
        void a;void kind;return out;
      },
      display(b,u){return [{type:'buff',id:u.id+':scent',source:u.id,name:'气氛值',key:'marker',value:scent(u),remaining:null,derived:true,tickOwner:u.id}];},
    };
  },
};

// ── 动作表（段数 / 削韧 / 能量均取自固定 4.6 数据）────────────────────────────
const actions={
  // 阿格莱雅：普攻 3 段（Skill01_Phase02）；强化普攻 8 段（Skill11_Phase02）主目标 2.8+2.8、相邻 1.26+1.26。
  1402:(p,d)=>{
    const p10=ROSTER_DATA[1402].skills['140208'].params['10'].param_list;
    return {
      basic:basic(p,d,{terms:atk(p.Normal[0]),hitShares:[.2,.2,.6],toughness:30,spGain:1,energyGain:20}),
      skill:skill(p,d,{target:'self',terms:[],spCost:1,energyGain:20}),
      ultimate:ultimate(p,d,{target:'self',terms:[],energyCost:ROSTER_DATA[1402].energyMax,energyGain:5}),
      enhancedBasic:{name:'孤锋千吻',type:'Normal',element:'Thunder',target:'blast',
        terms:[...atk(p10[0]),...atk(p10[2]),{...atk(p10[1])[0],target:'adjacent'},{...atk(p10[3])[0],target:'adjacent'}],
        hitShares:[.25,.25,.25,.25],energyGain:20,spCost:0,spGain:0,toughness:60,adjacentToughness:30},
    };
  },
  // 遐蝶：普攻 2 段（Skill01_Phase02=[.2,.8]）；战技 1 主 + 1 相邻；强化战技 2 段全体；终结为召唤动作。
  1407:(p,d)=>({
    basic:basic(p,d,{terms:hp(p.Normal[0]),hitShares:[.2,.8],toughness:30,energyGain:0}),
    // 140702 bpNeed=-1：普通战技不消耗战技点。
    skill:skill(p,d,{target:'blast',terms:[...hp(p.BPSkill[1]),{...hp(p.BPSkill[2])[0],target:'adjacent'}],
      hitShares:[1],toughness:60,adjacentToughness:30,energyGain:0,spCost:0}),
    enhancedSkill:{name:'骸爪，冥龙之环拥',type:'BPSkill',element:'Quantum',target:'all',
      terms:[...hp(p.BPSkill[1]),...hp(p.BPSkill[2])],hitShares:[.5,.5],energyGain:0,spCost:0,spGain:0,toughness:60},
    summonDragon:{name:'亡喉怒哮，苏生之颂铃',type:'Ultra',element:'Quantum',target:'self',terms:[],energyGain:0,spCost:0,spGain:0},
  }),
  // 风堇：普攻 1 段（生命上限）；战技 / 终结为治疗与召唤。
  1409:(p,d)=>({
    basic:basic(p,d,{terms:hp(p.Normal[0]),toughness:30,energyGain:20}),
    skill:skill(p,d,{target:'self',terms:[],spCost:1,energyGain:30}),
    ultimate:ultimate(p,d,{target:'self',terms:[],energyCost:ROSTER_DATA[1409].energyMax,energyGain:5}),
  }),
  // 长夜月：普攻 1 段（生命上限）；战技 / 终结为召唤与结界；终结的忆灵伤害由【长夜】结算。
  1413:(p,d)=>({
    basic:basic(p,d,{terms:hp(p.Normal[0]),toughness:30,energyGain:20}),
    skill:skill(p,d,{target:'self',terms:[],spCost:1,energyGain:30}),
    ultimate:ultimate(p,d,{target:'self',terms:[],energyCost:ROSTER_DATA[1413].energyMax,energyGain:5}),
  }),
  // 昔涟：普攻 1 段（Skill01_Phase02=[1]）；强化普攻 3 段（Skill11_Phase02=[1,.3,.7]）。
  1415:(p,d)=>{
    const p10=ROSTER_DATA[1415].skills['141508'].params['10'].param_list;
    return {
      basic:basic(p,d,{terms:hp(p.Normal[0]),toughness:30,energyGain:0}),
      skill:skill(p,d,{target:'self',terms:[],spCost:1,energyGain:0}),
      ultimate:ultimate(p,d,{target:'self',terms:[],energyCost:ROSTER_DATA[1415].energyMax,energyGain:0}),
      enhancedBasic:{name:'向着爱与明天♪',type:'Normal',element:'Ice',target:'all',
        terms:[...hp(p10[0])],hitShares:[.3,.7],energyGain:0,spCost:0,spGain:0,toughness:15},
    };
  },
  // 知更鸟•晴歌：普攻 1 段（生命上限）；战技为召唤；终结为指定队友辅助。
  1512:(p,d)=>({
    basic:basic(p,d,{terms:hp(p.Normal[0]),toughness:30,energyGain:20}),
    skill:skill(p,d,{target:'self',terms:[],spCost:1,energyGain:30}),
    ultimate:ultimate(p,d,{target:'self',terms:[],energyCost:ROSTER_DATA[1512].energyMax,energyGain:5}),
  }),
};

export {factories,actions};
