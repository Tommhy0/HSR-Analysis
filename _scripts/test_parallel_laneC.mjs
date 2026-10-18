// 并行 laneC 专项回归：1510 姬子•启行
//   · 境界【拓星视界】/「拓星者」实体生命周期（离场关闭，E4 全队抗穿随之移除）
//   · E2【领航旗语】每回合额外恢复 1 次助战技次数（基础 1 + E2 额外 1）
//   · 原始脚本 Skill11/Skill21_TargetHPCanBeDamage 的提前收尾（全灭或锁血 → 取消剩余光束并接最后一击）
//   · 多波次边界：当前波全灭但有后续波次时不得提前收尾
//   · 最后一击按内部技能 151014 读取段数 / 倍率 / 削韧（3 段，削韧 12，倍率随等级读表）
//   · 行迹 point08：源能 ≥3 发动脉冲时随机单体额外伤害倍率 +30%
// 期望值全部取自 kit params / trace / ROSTER_DATA，不写死倍率。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createContext} from '../core/ctx.mjs';
import {newBattleBuild,buildBattleActor} from '../simulator/builds.mjs';
import {createBattle as rawCreateBattle,stepBattle,combatPanel} from '../simulator/engine.mjs';
import {partialMechanicsFixture} from './partial-mechanics-fixtures.mjs';
import {ROSTER_DATA} from '../simulator/roster-data.mjs';
const createBattle=c=>rawCreateBattle(partialMechanicsFixture(c));
const data=JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url))),ctx=createContext(data);
const near=(a,b,msg='',m=1e-9)=>assert.ok(Math.abs(a-b)<m,`${a} != ${b}${msg?' ('+msg+')':''}`);
const panel=(atk=1000)=>({hp:10000,atk,def:1000,speed:100,critRate:.5,critDmg:1,energyRegen:1,effectHit:0,effectRes:0,breakEffect:0,baseStats:{hp:1000,atk,def:1000},elemDmg:{}});
const actor=id=>{const a=buildBattleActor(ctx,{...newBattleBuild(),characterId:id,relicAuto:false,panel:panel()});a.energy=0;a.policy={...a.policy,autoUltimate:false};return a;};
const enemy=(extra={})=>({id:'enemy',name:'规则训练敌人',side:'enemy',level:90,element:'Physical',
  panel:{...panel(),hp:1e9,speed:1},energy:0,energyMax:0,res:{},
  actions:{basic:{name:'测试攻击',type:'Normal',terms:[{scaling:'atk',multiplier:1}],hitEnergy:10}},
  policy:{autoUltimate:false,basicOnly:true},...extra});
const mate=(extra={})=>({id:'mate',name:'测试队员',side:'ally',level:80,element:'Physical',panel:{...panel(),speed:1},energy:0,energyMax:100,
  actions:{basic:{name:'测试普攻',type:'Normal',terms:[{scaling:'atk',multiplier:1}],spGain:1,energyGain:20,toughness:30}},policy:{autoUltimate:false,basicOnly:true},...extra});
const config=(units,en=null,maxAV=201)=>({strict:true,maxAV,sp:3,maxSP:9,seed:42,critMode:'noncrit',units:[...units,en??enemy()]});
const baseOf=ev=>ev.formula.find(f=>f.zone==='base').value;
const dmgOf=(b,id)=>b.log.filter(e=>e.type==='damage'&&e.actor===id);
const actionsOf=(b,id)=>b.log.filter(e=>e.type==='action'&&e.actor===id);
const beamPlan=(h,count=6)=>Array.from({length:count},()=>({actor:h.id,key:'beam',after:{actor:h.id,key:'ultimate',kind:'ultimate',occurrence:1}}));
const ultReady=h=>{h.energy=h.energyMax;h.policy={...h.policy,autoUltimate:true};return h;};
// 用同面板打完整六束，读取首束实际命中伤害，避免把防御 / 抗性换算后的数值写死进测试。
const beamHitDamage=()=>{
  const h=ultReady(actor(1510));
  const cfg=config([h],enemy({id:'calib',panel:{...panel(),hp:1e9,speed:1}}));
  cfg.actionPlan=beamPlan(h,6);
  const b=createBattle(cfg);b.random=()=>0;stepBattle(b);
  return dmgOf(b,h.id)[0].damage;
};
let passed=0,failed=0;const test=(name,fn)=>{try{fn();passed++;console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+'\n'+e.stack);}};

test('1510 境界【拓星视界】/「拓星者」实体：开场展开，姬子离场关闭并移除 E4 全队抗穿',()=>{
  const b=createBattle(config([actor(1510),mate()]));
  const [h,m,en]=b.units;
  assert.equal(h.resources['境界·拓星视界'],1,'开场应展开境界');
  assert.equal(h.resources['实体·拓星者'],1,'场上应出现拓星者实体');
  // 通过真实 assist 分支施加 E4 全队抗穿。
  h.kit.eidolon=4;
  b.rules.after(b,h,'assist','followup',h.actions.assist,[en],[en]);
  assert.ok(m.buffs.some(x=>x.id===h.id+':talent-pen:'+m.id),'E4 应给队友抗穿');
  h.hp=0;
  b.rules.sync(b);
  b.rules.death(b,en,h);
  assert.equal(h.resources['境界·拓星视界'],0,'姬子离场后境界应关闭');
  assert.equal(h.resources['实体·拓星者'],0,'姬子离场后拓星者实体应消失');
  assert.ok(b.log.some(e=>e.type==='mechanic'&&e.name==='境界【拓星视界】关闭'),'缺少境界关闭日志');
  assert.ok(!m.buffs.some(x=>x.id===h.id+':talent-pen:'+m.id),'姬子离场后 E4 全队抗穿应移除');
});

test('1510 E2：领航旗语每回合恢复 1 次助战技，E2 额外 +1 次（全队）',()=>{
  for(const eidolon of [0,2]){
    const b=createBattle(config([actor(1510),mate()]));
    const [h,m]=b.units;
    h.kit.eidolon=eidolon;
    b.rules.after(b,h,'skill','normal',h.actions.skill,[h],[h]);
    assert.ok(h.buffs.some(e=>e.id===h.id+':flag'),'战技后应获得领航旗语');
    h.resources['助战技次数']=0;m.resources['助战技次数']=0;
    b.rules.onTurnStart(b,h);
    const expected=eidolon>=2?2:1;
    assert.equal(h.resources['助战技次数'],expected,`E${eidolon} 姬子回合开始恢复次数`);
    assert.equal(m.resources['助战技次数'],expected,`E${eidolon} 队友同样恢复`);
  }
});

test('1510 提前收尾：全部敌人锁血时，首束后取消剩余光束并立刻发动最后一击',()=>{
  const h=ultReady(actor(1510));
  const en=enemy({id:'locked'});
  const cfg=config([h],en);cfg.actionPlan=beamPlan(h,6);
  const b=createBattle(cfg);b.random=()=>0;
  // 对应原始脚本 MCommon_LockHPThresholdReached_Mark（配置里的 buffs 会在建场时清空，故运行时挂载）。
  b.units.find(u=>u.id==='locked').buffs.push({type:'buff',id:'locked:lock',name:'锁血阈值',key:'marker',value:0,remaining:null,tickOwner:'locked',tickAt:'end',tag:'lockHpThreshold'});
  stepBattle(b);
  const act=actionsOf(b,h.id);
  assert.equal(act.filter(e=>e.key==='beam').length,1,'锁血后不得继续消耗光束');
  assert.equal(act.filter(e=>e.key==='pulse').length,0,'锁血提前收尾不应再发动脉冲');
  assert.equal(act.filter(e=>e.key==='finalBlow').length,1,'应立即发动最后一击');
  assert.deepEqual(b.planUsed,[0],'只有实际执行的首束记为已用');
  const fin=ROSTER_DATA[1510].skills[151014];
  const key=Object.keys(ROSTER_DATA[1510].skills[151003].params).find(k=>Math.abs(ROSTER_DATA[1510].skills[151003].params[k].param_list[0]-h.kit.params.Ultra[0])<1e-9);
  const finRow=fin.params[key??'10'].param_list;
  const hu=b.units.find(u=>u.id===h.id);
  const hits=dmgOf(b,h.id).filter(e=>Math.abs(baseOf(e)-combatPanel(hu).atk*finRow[1])<1e-6);
  assert.equal(hits.length,finRow[0],'最后一击段数应取自 151014');
  assert.ok(b.log.some(e=>e.type==='mechanic'&&e.name==='拓星者 · 提前收尾'),'缺少提前收尾日志');
});

test('1510 提前收尾：唯一波次全灭后不再执行剩余光束，操作轴如实标记未用',()=>{
  const h=ultReady(actor(1510));
  const cfg=config([h],enemy({id:'only',panel:{...panel(),hp:1,speed:1}}));
  cfg.actionPlan=beamPlan(h,6);
  const b=createBattle(cfg);b.random=()=>0;
  stepBattle(b);
  assert.equal(actionsOf(b,h.id).filter(e=>e.key==='beam').length,1,'清场后不得继续执行光束');
  assert.ok(!actionsOf(b,h.id).some(e=>e.key==='pulse'),'清场后不应发动脉冲');
  assert.deepEqual(b.planUsed,[0]);
  assert.ok(b.log.some(e=>e.type==='mechanic'&&e.name==='拓星者 · 提前收尾'),'清场属于提前收尾');
});

test('1510 多波边界：首波全灭但存在后续波次时，六束/脉冲/终击完整延续到新波',()=>{
  const h=ultReady(actor(1510));
  const cfg=config([h],enemy({id:'wave-1',wave:1,panel:{...panel(),hp:1,speed:1}}));
  cfg.units.push(enemy({id:'wave-2',wave:2,panel:{...panel(),hp:1e9,speed:1}}));
  cfg.actionPlan=beamPlan(h,6);
  const b=createBattle(cfg);b.random=()=>0;
  assert.equal(stepBattle(b),true);
  const act=actionsOf(b,h.id);
  assert.equal(act.filter(e=>e.key==='beam').length,6,'换波后仍应完成六束');
  assert.equal(act.filter(e=>e.key==='pulse').length,1,'六束耗尽应自动脉冲');
  assert.equal(act.filter(e=>e.key==='finalBlow').length,1,'脉冲后应接终击');
  assert.equal(b.planUsed.length,6,'六束均真实执行');
  assert.ok(!b.log.some(e=>e.type==='mechanic'&&e.name==='拓星者 · 提前收尾'),'有后续波次时不得提前收尾');
  assert.ok(b.log.some(e=>e.type==='damage'&&e.actor===h.id&&e.target==='wave-2'),'后续伤害应落在新波');
});

test('1510 多波边界：第 6 束清空首波时，自动脉冲仍在新波继续结算',()=>{
  const d=beamHitDamage();
  const h=ultReady(actor(1510));
  const cfg=config([h],enemy({id:'wave-1',wave:1,panel:{...panel(),hp:5*d+Math.floor(d/2),speed:1}}));
  cfg.units.push(enemy({id:'wave-2',wave:2,panel:{...panel(),hp:1e9,speed:1}}));
  cfg.actionPlan=beamPlan(h,6);
  const b=createBattle(cfg);b.random=()=>0;
  assert.equal(stepBattle(b),true);
  const act=actionsOf(b,h.id);
  assert.equal(act.filter(e=>e.key==='beam').length,6,'六束均应执行');
  assert.equal(act.filter(e=>e.key==='pulse').length,1,'第 6 束清空首波后自动脉冲不得被换波丢弃');
  assert.equal(act.filter(e=>e.key==='finalBlow').length,1,'自动脉冲后终击不得被换波丢弃');
  const u=b.units.find(t=>t.id===h.id);
  const pulseBase=combatPanel(u).atk*h.actions.pulse.terms[0].multiplier;
  assert.ok(dmgOf(b,h.id).some(e=>e.target==='wave-2'&&Math.abs(baseOf(e)-pulseBase)<1e-6),'自动脉冲应落在新一波的敌人身上');
  assert.equal(b.planUsed.length,6,'六束均真实执行');
});

test('1510 多波边界：自动脉冲击杀首波时，最后一击仍在新波结算',()=>{
  const d=beamHitDamage();
  const h=ultReady(actor(1510));
  const cfg=config([h],enemy({id:'wave-1',wave:1,panel:{...panel(),hp:6*d+1,speed:1}}));
  cfg.units.push(enemy({id:'wave-2',wave:2,panel:{...panel(),hp:1e9,speed:1}}));
  cfg.actionPlan=beamPlan(h,6);
  const b=createBattle(cfg);b.random=()=>0;
  assert.equal(stepBattle(b),true);
  const act=actionsOf(b,h.id);
  assert.equal(act.filter(e=>e.key==='pulse').length,1,'首波尚未被六束清空时应先完成自动脉冲');
  assert.equal(act.filter(e=>e.key==='finalBlow').length,1,'自动脉冲击杀首波后终击必须延续到新波');
  const u=b.units.find(t=>t.id===h.id);
  const finalBase=combatPanel(u).atk*h.actions.finalBlow.terms[0].multiplier;
  const finalHits=dmgOf(b,h.id).filter(e=>e.target==='wave-2'&&Math.abs(baseOf(e)-finalBase)<1e-6);
  assert.equal(finalHits.length,h.actions.finalBlow.bounceCount+1,'三段终击应全部落在新波');
  assert.equal(b.planUsed.length,6,'六束均真实执行');
});

test('1510 提前收尾：仅部分敌人锁血时仍按未锁血目标继续，不提前终结',()=>{
  const h=ultReady(actor(1510));
  const cfg=config([h],enemy({id:'locked',hpLocked:true,panel:{...panel(),hp:1e9,speed:1}}));
  cfg.units.push(enemy({id:'open',panel:{...panel(),hp:1e9,speed:1}}));
  cfg.actionPlan=beamPlan(h,6);
  const b=createBattle(cfg);b.random=()=>0;
  assert.equal(stepBattle(b),true);
  const act=actionsOf(b,h.id);
  assert.equal(act.filter(e=>e.key==='beam').length,6,'仍有 1 名未锁血敌人时应继续光束');
  assert.equal(act.filter(e=>e.key==='pulse').length,1);
  assert.equal(act.filter(e=>e.key==='finalBlow').length,1);
  assert.ok(!b.log.some(e=>e.type==='mechanic'&&e.name==='拓星者 · 提前收尾'),'不得因部分敌人锁血而提前收尾');
});

test('1510 最后一击按 151014 削韧 12，整段终结技削韧可逐段核对',()=>{
  const h=ultReady(actor(1510));
  assert.equal(h.actions.finalBlow.toughness,ROSTER_DATA[1510].skills[151014].stance[0]);
  assert.equal(h.actions.finalBlow.bounceToughness,ROSTER_DATA[1510].skills[151014].stance[0]);
  // 1510 放行后 fixture 不再放宽 strict；火弱点敌人必须提供标准击破规则。
  const en=enemy({id:'tough',panel:{...panel(),hp:1e9,speed:1},toughnessMax:500,weaknesses:['Fire'],standardBreak:true,rank:'normal'});
  const cfg=config([h],en);cfg.actionPlan=beamPlan(h,6);
  const b=createBattle(cfg);b.random=()=>0;
  stepBattle(b);
  const target=b.units.find(u=>u.id==='tough');
  const expected=6*h.actions.beam.toughness+h.actions.pulse.toughness+3*ROSTER_DATA[1510].skills[151014].stance[0];
  near(target.toughnessMax-target.toughness,expected,'六束 + 脉冲 + 三段终击的削韧');
});

test('1510 行迹 point08：源能 ≥3 时脉冲随机单体额外伤害倍率 +30%',()=>{
  const b=createBattle(config([actor(1510)]));
  const [h]=b.units;
  assert.ok(h.kit.trace[3],'应携带 point08');
  const selected=[b.units.at(-1)];
  h.resources['源能']=3;
  const a={...h.actions.pulse};
  b.rules.before(b,h,'pulse','extra',a,selected);
  assert.equal(a.bounceCount,2,'3 点源能 = 1 次基础 + 2 次追加');
  near(a.bounceTerms[0].multiplier,h.kit.params.Ultra[4]*(1+h.kit.trace[3][2]));
  h.resources['源能']=2;
  const c={...h.actions.pulse};
  b.rules.before(b,h,'pulse','extra',c,selected);
  assert.equal(c.bounceCount,1);
  near(c.bounceTerms[0].multiplier,h.kit.params.Ultra[4],'源能 <3 时不加成');
});

console.log(`parallel laneC 1510 checks: ${passed} passed, ${failed} failed.`);
if(failed)process.exitCode=1;
