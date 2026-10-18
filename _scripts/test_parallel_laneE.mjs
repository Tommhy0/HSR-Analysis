// 并行 lane E 回归：1408 白厄（Phainon，物理 · 毁灭）4.6 机制。
//
// 期望值来源（不含任何猜测值）：
//   · _analysis/character-texts/1408-白厄.txt —— 4.6 技能 / 行迹 / 星魂文本
//   · _data_cache/strict_research/Avatar_Phainon_00_Ability.json —— 原始 Ability 脚本
//   · simulator/roster-data.mjs 的 kit 参数（params / ranks / trace）
//
// 本文件锁定的修复点：
//   1. E1 的击杀计数口径（Rank01 OnListenCharacterDie：敌方阵亡 + 击杀者非敌方，不要求是白厄本人）
//   2. E2 是 TurnInsertAction（插入额外回合），不是行动条提前（Skill22_Phase02 OnStart）
//   3. 致命攻击被 Ultra 的 OnLimboWaitHeal 拦截 → SetHP 至 #2=25% 生命上限 + 立即最后一击
//   4. 最后一击按「剩余额外回合数 × #3=12.5%」线性降低倍率
//   5. Ultra 的 OnDestroy → ForceKill Phainon_UltraBE 并移除 Guard / Ultra_Weakness（变身结束清空剩余倒计时）
//   6. Ultra_Weakness 光环（敌方全体物理弱点）随变身生效 / 移除
//   7. RedirectActionDelayChange(From ModifierOwnerEntity → Phainon_UltraBE.SortByActionOrder.Select2)
//      仅在 Phainon_UltraBE 阵亡（OnListenBattleEventDie）后安装，倒计时归零时取消
//   8. Ultra OnStack：变身时若 CurrentTurnOwnerEntity 属于 AllTeamMemberWithUnselectable，
//      该目标所有剩余时间 > 0 的**增益**（StatusTypeMask="Buff"）+1 回合（含自身回合）
//   9. 8 个倒计时的行动间隔动态哈希无本地映射 → source-blocked（断言脚本里确实没有定义，防止后续凭猜测填值）
//
// 未解析项（保持 source-blocked，不在本文件断言具体间隔）：
//   SetActionDelay.NormalizedValue 的 DynamicHashes = [608586940, 696029444, 1979030979]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createContext} from '../core/ctx.mjs';
import {newBattleBuild,buildBattleActor} from '../simulator/builds.mjs';
import {createBattle as rawCreateBattle,stepBattle,combatPanel,advance,receiveDamage,validateBattle} from '../simulator/engine.mjs';
import {KNOWN_MECHANICS_GAPS} from '../simulator/mechanics-status.mjs';
import {partialMechanicsFixture} from './partial-mechanics-fixtures.mjs';
import {ROSTER_DATA} from '../simulator/roster-data.mjs';

const createBattle=c=>rawCreateBattle(partialMechanicsFixture(c));
const data=JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url))),ctx=createContext(data);
const near=(a,b,m=1e-6,msg)=>{if(typeof m!=='number'){msg=m;m=1e-6;}assert.ok(Math.abs(a-b)<m,`${a} != ${b}${msg?' ('+msg+')':''}`);};
const panel=()=>({hp:10000,atk:1000,def:1000,speed:100,critRate:.5,critDmg:1,energyRegen:1,effectHit:0,effectRes:0,breakEffect:0,baseStats:{hp:1000,atk:1000,def:1000},elemDmg:{}});
const actor=(id,extra={})=>{const a=buildBattleActor(ctx,{...newBattleBuild(),characterId:id,relicAuto:false,panel:panel(),...extra});a.energy=0;a.policy={...a.policy,autoUltimate:false};return a;};
const enemy=(extra={})=>({id:'enemy',name:'规则训练敌人',side:'enemy',level:90,element:'Physical',panel:{...panel(),hp:1e9,speed:1},energy:0,energyMax:0,res:{},
  actions:{basic:{name:'测试攻击',type:'Normal',terms:[{scaling:'atk',multiplier:1}],hitEnergy:10}},policy:{autoUltimate:false,basicOnly:true},...extra});
const mate=(extra={})=>({id:'mate',name:'测试队员',side:'ally',level:80,element:'Physical',panel:{...panel(),speed:1},energy:0,energyMax:100,
  actions:{basic:{name:'测试普攻',type:'Normal',terms:[{scaling:'atk',multiplier:1}],spGain:1,energyGain:20,toughness:30},
    skill:{name:'测试战技',type:'BPSkill',terms:[{scaling:'atk',multiplier:1}],spCost:1,energyGain:30,toughness:60}},policy:{autoUltimate:false,basicOnly:true},...extra});
const config=(units,en=null,maxAV=201)=>({strict:true,maxAV,sp:3,maxSP:9,seed:42,critMode:'noncrit',units:[...units,en??enemy()]});
const baseOf=ev=>ev.formula.find(f=>f.zone==='base').value;
const kForm=ROSTER_DATA[1408].skills['140805'].params['10'].param_list;   // [4,0.25,0.125,0.8,2.7,0.15,0.2]
const transform=(b,u)=>b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[],[]);
let passed=0,failed=0;
const test=(name,fn)=>{try{fn();passed++;console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+'\n'+e.stack);}};

test('白厄 E1：单场战斗中任意我方击杀敌方都使倒计时提速 #1=1.5%，上限 #4=84%',()=>{
  const b=createBattle(config([actor(1408,{eidolon:1}),mate()]));
  const [u,m]=b.units,enemyUnit=b.units.at(-1);
  const base=u.baseSpeed??u.panel.speed;
  transform(b,u);
  const speeds=()=>b.actionEvents.filter(e=>e.active).map(e=>e.speed);
  assert.equal(speeds().length,u.kit.params.Ultra[3]);
  for(const s of speeds())near(s,base*u.kit.ranks[1][4],'变身初始继承比例应为 E1 的 #5=66%');
  // 击杀者不必是白厄：Rank01 的 OnListenCharacterDie 只要求阵亡者是 TeamDark、击杀者不是 TeamDark。
  b.rules.death(b,m,enemyUnit);
  for(const s of speeds())near(s,base*(u.kit.ranks[1][4]+u.kit.ranks[1][0]),'队友击杀也应累加速度');
  const step=u.kit.ranks[1][0],cap=u.kit.ranks[1][3],baseRatio=u.kit.ranks[1][4];
  const need=Math.round((cap-baseRatio)/step);
  for(let i=0;i<need+3;i++)b.rules.death(b,m,enemyUnit);
  for(const s of speeds())near(s,base*cap,'速度继承比例应封顶在 #4=84%');
});

test('白厄 E1：非 E1 时击杀不改变倒计时，继承比例取 #3=60%',()=>{
  const b=createBattle(config([actor(1408),mate()]));
  const [u,m]=b.units;
  transform(b,u);
  const base=u.baseSpeed??u.panel.speed;
  for(const e of b.actionEvents.filter(e=>e.active))near(e.speed,base*u.kit.params.Ultra[2]);
  b.rules.death(b,m,b.units.at(-1));
  for(const e of b.actionEvents.filter(e=>e.active))near(e.speed,base*u.kit.params.Ultra[2],'无 E1 不应加速');
});

test('白厄 E2：消耗 #1=4 点毁伤触发 TurnInsertAction，插入额外回合且不推进行动条',()=>{
  const b=createBattle(config([actor(1408,{eidolon:2}),mate()]));
  const [u,,en]=b.units;
  transform(b,u);
  const distances=()=>b.actionEvents.filter(e=>e.active).map(e=>e.distance);
  const before=distances();
  u.resources['毁伤']=u.kit.ranks[2][0];
  b.rules.before(b,u,'skill','normal',u.actions.enhancedSkill2,[en]);
  assert.deepEqual(distances(),before,'E2 不应提前任何倒计时行动值（原始脚本是 TurnInsertAction）');
  const queued=b.queue.filter(q=>q.actor===u.id&&q.kind==='extra');
  assert.equal(queued.length,1,'E2 应插入 1 个额外回合');
  assert.ok(['basic','skill'].includes(queued[0].key));
  // 走真实执行路径：flush 在 stepBattle 开始时先执行插入回合。
  assert.equal(stepBattle(b),true);
  const extra=b.log.find(e=>e.type==='action'&&e.actor===u.id&&e.kind==='extra');
  assert.ok(extra,'插入的额外回合必须实际执行');
  assert.equal(extra.key,queued[0].key);
});

test('白厄 E2：消耗不足 #1=4 点毁伤时不插入额外回合，物理抗穿 #2=20% 仅限卡厄斯兰那',()=>{
  const b=createBattle(config([actor(1408,{eidolon:2}),mate()]));
  const [u,,en]=b.units;
  assert.equal(b.rules.modifiers(b,u,en,u.actions.basic,'direct').resPen??0,0,'未变身时不应有 E2 抗穿');
  transform(b,u);
  near(b.rules.modifiers(b,u,en,u.actions.basic,'direct').resPen,u.kit.ranks[2][1]);
  u.resources['毁伤']=u.kit.ranks[2][0]-1;
  b.rules.before(b,u,'skill','normal',u.actions.enhancedSkill2,[en]);
  assert.equal(b.queue.filter(q=>q.actor===u.id&&q.kind==='extra').length,0,'3 点毁伤不应触发额外回合');
});

test('白厄：受到致命攻击时不陷入无法战斗，生命回复至 #2=25% 生命上限并立即发动最后一击',()=>{
  const c=config([actor(1408),mate()]);
  c.units=[c.units[0],c.units[1],enemy({id:'e1'}),enemy({id:'e2'})];
  const b=createBattle(c);
  const [u,,e1]=b.units;
  transform(b,u);
  // 只保留 2 个倒计时 → 剩余额外回合 = 2。
  const events=b.actionEvents.filter(e=>e.active);
  for(const e of events.slice(2))e.active=false;
  const maxHp=combatPanel(u).hp,atk=combatPanel(u).atk;
  u.hp=500;
  // 同时持有【弑魂之炽】：Skill31 会移除 Guard，因此变身结束时层数与减伤 buff 一并清除。
  u.resources['弑魂之炽']=3;
  u.buffs.push({id:u.id+':soulfire',source:u.id,name:'弑魂之炽 · 减伤',key:'dmgReduction',value:.75,remaining:null,tag:'phainonSoulfire'});
  assert.equal(b.rules.beforeLethal(b,e1,u,1e9),true,'卡厄斯兰那应拦截致命伤害');
  const from=b.log.length;
  receiveDamage(b,e1,u,1e9,'direct',{});
  // Skill31_SelectTarget_OnLimbo 使用 SetHP = 生命上限 × 25%（不是保留 1 点后再追加治疗）。
  near(u.hp,maxHp*kForm[1],1e-6,'生命应被设为 #2=25% 生命上限');
  assert.ok(!u.buffs.some(e=>e.tag==='phainonKhaos'),'致命反击后应变身结束');
  assert.ok(!u.buffs.some(e=>e.tag==='phainonSoulfire'),'Ultra 的 OnDestroy 应移除 Guard（弑魂之炽减伤）');
  assert.equal(u.resources['弑魂之炽'],0,'变身结束应清空弑魂之炽层数');
  assert.equal(b.actionEvents.filter(e=>e.active&&e.owner===u.id).length,0,'变身结束应清空剩余倒计时');
  const hits=b.log.slice(from).filter(e=>e.type==='damage'&&e.actor===u.id);
  assert.equal(hits.length,2,'最后一击应对每名存活敌人各 1 段');
  const remaining=2,perEnemy=atk*u.kit.params.Ultra[0]*(1-kForm[2]*remaining)/2;
  for(const hit of hits)near(baseOf(hit),perEnemy,1e-6,'每剩余 1 个额外回合应降低 #3=12.5% 原倍率');
});

test('白厄：正常第 8 个倒计时的最后一击为全额倍率，并由 Ultra 的 OnDestroy 清理全部行动事件',()=>{
  const c=config([actor(1408),mate()]);
  c.units=[c.units[0],c.units[1],enemy({id:'e1'}),enemy({id:'e2'})];
  const b=createBattle(c);
  const [u]=b.units;
  transform(b,u);
  const atk=combatPanel(u).atk;
  const countdown=b.actionEvents.filter(e=>e.active);
  for(const e of countdown.slice(0,-1))e.active=false;
  const last=countdown.at(-1);
  last.active=false;                       // dispatch 会先摘下本次事件再调用钩子
  const from=b.log.length;
  b.rules.actionEventStart(b,u,last);
  const hits=b.log.slice(from).filter(e=>e.type==='damage'&&e.actor===u.id);
  assert.equal(hits.length,2);
  for(const hit of hits)near(baseOf(hit),atk*u.kit.params.Ultra[0]/2,'剩余 0 个额外回合时应为全额 960% 均分');
  assert.equal(b.actionEvents.filter(e=>e.active&&e.owner===u.id).length,0,'ForceKill 应清空全部 Phainon_UltraBE');
  assert.ok(!u.buffs.some(e=>e.tag==='phainonKhaos'));
});

test('白厄：Ultra_Weakness 光环在变身期间给敌方全体物理弱点，变身结束移除',()=>{
  const c=config([actor(1408),mate()]);
  c.units=[c.units[0],c.units[1],enemy({id:'e1'}),enemy({id:'e2'})];
  const b=createBattle(c);
  const [u,,e1,e2]=b.units;
  transform(b,u);
  for(const to of [e1,e2])assert.ok(to.buffs.some(e=>e.tag==='phainonUltraWeakness'&&e.weakness==='Physical'),'变身期间敌方应始终拥有物理弱点');
  const last=b.actionEvents.filter(e=>e.active).at(-1);
  last.active=false;
  b.rules.actionEventStart(b,u,last);
  for(const to of [e1,e2])assert.ok(!to.buffs.some(e=>e.tag==='phainonUltraWeakness'),'变身结束应移除物理弱点光环');
});

test('白厄：变身时当前回合拥有者的增益延长 1 回合（Ultra OnStack Remodifier / StatusTypeMask Buff）',()=>{
  const b=createBattle(config([actor(1408),mate()]));
  const [u,m]=b.units;
  const allyBuff={id:'test:ally-buff',source:m.id,name:'测试增益',key:'atkPct',value:.1,remaining:2,tickOwner:m.id};
  const debuff={id:'test:ally-debuff',source:'enemy',name:'测试负面',key:'atkPct',value:-.1,remaining:2,debuff:true,tickOwner:m.id};
  m.buffs.push(allyBuff,debuff);
  b.turnActor=m.id;
  transform(b,u);
  assert.equal(allyBuff.remaining,3,'队友回合中变身应把该队友的增益延长 1 回合');
  assert.equal(debuff.remaining,2,'StatusTypeMask="Buff" 不延长负面效果');
  // 没有当前行动者时不延长（对应 Ultra OnStack 的 CurrentTurnOwnerEntity 判定）。
  const b2=createBattle(config([actor(1408),mate()]));
  const [u2,m2]=b2.units;
  const buff2={id:'test:ally-buff',source:m2.id,name:'测试增益',key:'atkPct',value:.1,remaining:2,tickOwner:m2.id};
  m2.buffs.push(buff2);
  transform(b2,u2);
  assert.equal(buff2.remaining,2,'无当前回合时不延长');
  // ByTargetListIntersects(AllTeamMemberWithUnselectable, CurrentTurnOwnerEntity) 不排除自身回合。
  const b3=createBattle(config([actor(1408),mate()]));
  const [u3]=b3.units;
  const ownBuff={id:'test:own-buff',source:u3.id,name:'测试增益',key:'atkPct',value:.1,remaining:2,tickOwner:u3.id};
  u3.buffs.push(ownBuff);
  b3.turnActor=u3.id;
  transform(b3,u3);
  assert.equal(ownBuff.remaining,3,'自身回合中变身同样应延长自身的增益');
});

test('白厄：行动提前重定向仅在 Phainon_UltraBE 阵亡后生效，并落到 SortByActionOrder.Select2',()=>{
  const b=createBattle(config([actor(1408),mate()]));
  const [u]=b.units;
  transform(b,u);
  const byOrder=()=>b.actionEvents.filter(e=>e.active).sort((a,c)=>a.distance/a.speed-c.distance/c.speed)[0];
  const first=byOrder(),d0=first.distance,own=u.distance;
  assert.equal(first.redirectAdvance,false,'首次阵亡前倒计时不应开启行动提前重定向');
  advance(b,u.id,.05);
  near(u.distance,own-10000*.05,1e-6,'重定向未安装时行动提前作用于卡厄斯兰那本体');
  near(first.distance,d0,1e-6,'首次阵亡前倒计时行动值不应变化');
  // OnListenBattleEventDie：第一个 Phainon_UltraBE 阵亡后才安装重定向。
  first.active=false;
  b.rules.actionEventEnd(b,u,first,{executed:true});
  const next=byOrder(),nd=next.distance;
  assert.equal(next.redirectAdvance,true,'阵亡后剩余倒计时应开启重定向');
  advance(b,u.id,.05);
  near(next.distance,nd-10000*.05,1e-6,'行动提前应落到 Phainon_UltraBE.SortByActionOrder.Select2');
  near(u.distance,own-10000*.05,1e-6,'重定向后卡厄斯兰那本体行动值不再变化');
});

test('白厄：8 个倒计时按社区实测公式 0 + 7 等分；动态哈希仍无本地定义',()=>{
  const ability=JSON.parse(fs.readFileSync(new URL('../_data_cache/strict_research/Avatar_Phainon_00_Ability.json',import.meta.url)));
  const battleEvent=ability.AbilityList.find(a=>a.Name==='Avatar_Phainon_00_Skill03_BattleEvent');
  const setDelay=battleEvent.OnAdd.find(t=>t.$type==='RPG.GameCore.SetActionDelay');
  assert.ok(setDelay,'原始脚本应包含 SetActionDelay');
  assert.deepEqual(setDelay.NormalizedValue.PostfixExpr.DynamicHashes,[608586940,696029444,1979030979]);
  // 哈希本身在该技能自己的 DynamicValues 中没有可读定义（ReadInfo.Type === 'None' 或缺失）。
  // 间隔改用社区实测口径：8 次额外回合共享一次行动条，总行动值 10000/(基础速度×0.6)，
  // 首动 0，其余 7 等分（NGA 配速帖 tid=44710678 / 44574669 / 44855203）。
  const flats=battleEvent.DynamicValues?.Floats??{};
  for(const h of setDelay.NormalizedValue.PostfixExpr.DynamicHashes){
    const def=flats[h];
    assert.ok(!def||def.ReadInfo?.Type==='None',`${h} 不应存在本地定义`);
  }
  const skill03=ability.AbilityList.find(a=>a.Name==='Avatar_Phainon_00_Skill03_Phase02');
  for(const [hash,def] of Object.entries(skill03.DynamicValues?.Floats??{}))
    assert.equal(def.ReadInfo?.Type,'None',`${hash} 不应有本地定义`);

  const b=createBattle(config([actor(1408)]));
  const [u]=b.units;
  u.energy=12;
  b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[],[]);
  const events=b.actionEvents.filter(e=>e.active&&e.group==='phainon-khaos-countdown')
    .sort((a,c)=>a.initialDistance-c.initialDistance);
  assert.equal(events.length,8,'应变身出 8 个倒计时');
  near(events[0].distance,0,1e-9,'首动不占行动值');
  for(let i=1;i<events.length;i++)near(events[i].distance,10000*i/7,1e-9,'其余 7 动等分');
  const ratio=u.kit.params.Ultra[2];
  near(events.at(-1).distance/events.at(-1).speed,10000/((u.baseSpeed??u.panel.speed)*ratio),1e-9,'总行动值=10000/(基础速度×60%)');
});

test('白厄：灾厄•弑魂焚诏的层数来自 Guard 回调（敌方行动 / 本人受击），队友战技不叠层',()=>{
  const c=config([actor(1408,{eidolon:4}),mate()]);
  c.units=[c.units[0],c.units[1],enemy({id:'e1'}),enemy({id:'e2'})];
  const b=createBattle(c);
  const [u,m,e1]=b.units;
  transform(b,u);
  b.rules.before(b,u,'skill','normal',u.actions.enhancedSkill,[e1]);
  const layers=1+u.kit.ranks[4][0];
  assert.equal(u.resources['弑魂之炽'],layers);
  // OnListenAfterAction 只响应 TeamDark（敌方）行动，OnAfterBeingAttacked 只响应 Guard 持有者本人。
  b.rules.after(b,m,'skill','normal',{...m.actions.basic,type:'BPSkill'},[],[]);
  assert.equal(u.resources['弑魂之炽'],layers,'队友战技不叠层');
  b.rules.attacked(b,m,e1);
  assert.equal(u.resources['弑魂之炽'],layers,'队友受击不叠层');
  b.rules.attacked(b,u,e1);
  assert.equal(u.resources['弑魂之炽'],layers+1,'卡厄斯兰那本人受击 +1 层');
  assert.equal(u.resources['敌行动未叠层'],0,'受击路径已叠层，行动结束不再重复 +1');
});

test('1408 已从严格阻断名单移除，四人严格校验通过',()=>{
  assert.equal(KNOWN_MECHANICS_GAPS[1408],undefined,'1408 不应再出现在严格阻断名单');
  const cfg=config([actor(1408),mate(),mate({id:'mate2'}),mate({id:'mate3'})]);
  assert.deepEqual(validateBattle(cfg),[],'1408 四人编队应通过严格校验');
});

console.log(`Parallel lane E (1408 白厄) checks: ${passed} passed, ${failed} failed.`);
if(failed)process.exit(1);
