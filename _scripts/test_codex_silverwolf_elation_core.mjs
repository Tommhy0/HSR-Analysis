// 银狼LV.999（1506）核心欢愉机制回归：
//   1) 常态欢愉技 150620「殿堂级操作回放」只获得 15 隐藏分，不造成伤害；
//   2) 【无敌玩家】期间强化欢愉技 150621「崩坏级伤害演示」造成 6 段欢愉伤害并重置盲盒概率；
//   3) E1「结界中的敌方目标受到的伤害提高 20%」是全队易伤，不只作用于银狼本人；
//   4) 150608 强化普攻按每 60 点隐藏分 +15% 伤害，最多 2 层；
//   5) 持有好活当赏时，强化普攻的技能伤害改为欢愉伤害；
//   6) 150604 的【无敌玩家】控制免疫；
//   7) E6 的欢愉增笑只作用于强化普攻期间，不作用于强化欢愉技。
// 来源：4.6 Avatar_SilverWolf999_00_Ability.json 的 Skill04（150620）/ Skill41（150621）、
//       Skill11（150608），以及 hsr_core 的 150604 / E1 / E6 文本。
import assert from 'node:assert/strict';
import {ctx,dummy} from './codex_test_helpers.mjs';
import {newBattleBuild,buildBattleActor} from '../simulator/builds.mjs';
import {createBattle,stepBattle} from '../simulator/engine.mjs';

function fixture({eidolon=0,laughter=20,punchline=0}={}){
  const owner=buildBattleActor(ctx,{...newBattleBuild(),characterId:1506,eidolon,relicAuto:false});
  owner.policy={...owner.policy,autoUltimate:false,basicOnly:true};
  const mate=dummy('mate');
  const foe=dummy('foe','enemy');foe.panel={...foe.panel,hp:1e9,speed:1};foe.hp=1e9;
  const b=createBattle({strict:false,maxAV:5,sp:3,maxSP:9,seed:17,critMode:'noncrit',units:[owner,mate,foe]});
  const u=b.units.find(x=>x.characterId===1506);
  b.laughter.ally=laughter;u.resources['笑点快照']=laughter;
  if(punchline)u.resources['好活当赏']=punchline;
  return {b,u,mate,foe};
}
function enterUlt(b,u){
  u.energy=u.energyMax;
  b.rules.before(b,u,'ultimate','ultimate',u.actions.ultimate,[u]);
}
function runQueued(b,actorId,key,targetId){
  b.queue.push({actor:actorId,key,kind:'extra',targetId});
  const n=b.log.length;stepBattle(b);
  const events=b.log.slice(n);
  const start=events.findIndex(e=>e.type==='action'&&e.actor===actorId&&e.key===key);
  assert.ok(start>=0,`没有找到 ${key} 动作事件`);
  const end=events.findIndex((e,i)=>i>start&&e.type==='action_end');
  return events.slice(start,end<0?undefined:end+1);
}
const damageIn=ev=>ev.filter(e=>e.type==='damage');
const zone=(e,name)=>e.formula?.find(f=>f.zone===name)?.value;

let passed=0,failed=0;
const test=(name,fn)=>{try{fn();passed++;console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+'\n'+e.stack);}};

test('150620 常态欢愉技：不造成伤害，只获得 #1=15 隐藏分',()=>{
  const {b,u}=fixture();
  const before=u.resources['隐藏分']??0;
  const ev=runQueued(b,u.id,'elation');
  const action=ev.find(e=>e.type==='action');
  assert.equal(action.name,'殿堂级操作回放','常态欢愉技应为 150620');
  assert.equal(damageIn(ev).length,0,'150620 是 Enhance，不应产生伤害');
  const T=u.kit.trace['2'],counted=b.laughter.ally??0;
  const bonus=(counted>=T[0]?T[2]:0)+(counted>=T[1]?T[3]:0);
  assert.equal((u.resources['隐藏分']??0)-before,15+bonus,'150620 应获得 15 点基础隐藏分 + point07 档位');
});

test('150621 强化欢愉技：6 段欢愉伤害，并把盲盒概率重置为初始值',()=>{
  const {b,u}=fixture();
  enterUlt(b,u);
  u.resources['盲盒概率']=0.04;
  const ev=runQueued(b,u.id,'elation');
  const action=ev.find(e=>e.type==='action');
  assert.equal(action.name,'崩坏级伤害演示','无敌玩家期间应使用 150621');
  const hits=damageIn(ev);
  assert.equal(hits.length,6,'150621 应为 1 主 + 5 弹射');
  assert.ok(hits.every(e=>e.kind==='elation'),'150621 全部伤害应为欢愉伤害');
  assert.equal(u.resources['盲盒概率'],1,'150621 应重置头号补给盲盒固定概率');
});

test('E1 结界易伤：队友攻击同样享受敌方受到伤害 +20%',()=>{
  const withUlt=fixture({eidolon:1});enterUlt(withUlt.b,withUlt.u);
  const ev1=runQueued(withUlt.b,withUlt.mate.id,'basic',withUlt.foe.id);
  const hit1=damageIn(ev1).find(e=>e.actor===withUlt.mate.id);
  assert.ok(hit1,'队友应造成一次真实伤害');
  assert.ok(Math.abs(zone(hit1,'vuln')-1.2)<1e-9,'E1 结界内队友伤害应获得 1.2 易伤区');

  const noUlt=fixture({eidolon:1});
  const ev2=runQueued(noUlt.b,noUlt.mate.id,'basic',noUlt.foe.id);
  const hit2=damageIn(ev2).find(e=>e.actor===noUlt.mate.id);
  assert.ok(Math.abs(zone(hit2,'vuln')-1)<1e-9,'未进入结界时不应有 E1 易伤');
});

test('150608 强化普攻：每 60 点隐藏分 +15% 伤害，最多 2 层',()=>{
  const low=fixture();enterUlt(low.b,low.u);low.u.resources['隐藏分']=0;
  const lowEv=runQueued(low.b,low.u.id,'basic',low.foe.id);
  const lowHit=damageIn(lowEv).find(e=>e.actor===low.u.id);
  const high=fixture();enterUlt(high.b,high.u);high.u.resources['隐藏分']=120;
  const highEv=runQueued(high.b,high.u.id,'basic',high.foe.id);
  const highHit=damageIn(highEv).find(e=>e.actor===high.u.id);
  const ratio=zone(highHit,'base')/zone(lowHit,'base');
  assert.ok(Math.abs(ratio-1.3)<1e-9,`120 点隐藏分应带来 2 层 ×15%：期望 1.3，实际 ${ratio}`);
});

test('150604 持有好活当赏：强化普攻技能伤害改为欢愉伤害',()=>{
  const {b,u,foe}=fixture({punchline:10});
  enterUlt(b,u);
  const ev=runQueued(b,u.id,'basic',foe.id);
  const hits=damageIn(ev).filter(e=>e.actor===u.id);
  const elation=hits.filter(e=>e.kind==='elation');
  assert.ok(elation.length>=100,'强化普攻应有 100 段欢愉伤害');
  // 盲盒的【超超超大剑】是独立真实伤害，不属于技能伤害转换的范围。
  assert.ok(hits.every(e=>e.kind==='elation'||e.kind==='true'),'持有好活当赏时强化普攻技能伤害应全部记为欢愉伤害');
});

test('150604 无敌玩家：免疫控制类负面状态',()=>{
  const inUlt=fixture();enterUlt(inUlt.b,inUlt.u);
  // createBattle 会规范化单位对象，效果必须写到战斗内的同一个单位上。
  inUlt.b.units.find(x=>x.id===inUlt.foe.id).actions.basic.effects=[{type:'buff',name:'冻结',key:'freeze',value:0,duration:1,control:'freeze',debuff:true}];
  const ev1=runQueued(inUlt.b,inUlt.foe.id,'basic',inUlt.u.id);
  assert.ok(ev1.some(e=>e.type==='resist'&&e.actor===inUlt.u.id&&e.name==='免疫控制类负面状态'),'无敌玩家应记录控制免疫');
  assert.ok(!inUlt.u.buffs.some(e=>e.control),'无敌玩家不应被施加控制');

  const normal=fixture();
  normal.b.units.find(x=>x.id===normal.foe.id).actions.basic.effects=[{type:'buff',name:'冻结',key:'freeze',value:0,duration:1,control:'freeze',debuff:true}];
  runQueued(normal.b,normal.foe.id,'basic',normal.u.id);
  assert.ok(normal.u.buffs.some(e=>e.control),'未进入无敌玩家时应正常被控制');
});

test('E6 增笑只作用于强化普攻期间，不作用于强化欢愉技',()=>{
  const {b,u}=fixture({eidolon:6});
  const foe=b.units.find(x=>x.id==='foe');
  enterUlt(b,u);
  b.activeAction={key:'basic'};
  // kit-runtime 的 rules.modifiers 合同为 (b, 攻击者, 目标, 动作, 伤害类别)。
  const inBasic=b.rules.modifiers(b,u,foe,u.actions.basic,'elation').elationBoost??0;
  assert.ok(Math.abs(inBasic-0.5)<1e-9,'强化普攻期间 E6 应提供 0.5 增笑');
  b.activeAction={key:'elation'};
  const inElation=b.rules.modifiers(b,u,foe,u.actions.elation,'elation').elationBoost??0;
  assert.equal(inElation,0,'强化欢愉技本身不应获得强化普攻的 E6 增笑');
  b.activeAction=null;
});

console.log(`Silver Wolf LV.999 Elation core: ${passed} passed, ${failed} failed.`);
if(failed)process.exitCode=1;
