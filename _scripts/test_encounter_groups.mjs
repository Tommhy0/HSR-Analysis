import assert from 'node:assert/strict';
import {createBattle,receiveDamage,validateBattle} from '../simulator/engine.mjs';

const panel={hp:1000,atk:100,def:100,speed:100,critRate:0,critDmg:0,energyRegen:1,elemDmg:{},baseStats:{hp:1000,atk:100,def:100}};
const unit=(id,side,extra={})=>({id,name:id,side,level:80,panel:structuredClone(panel),element:'Physical',energyMax:0,
  actions:{basic:{name:'等待',type:'Normal',element:'Physical',target:'single',terms:[]}},...extra});
const adds=Array.from({length:5},(_,i)=>unit(`memory-${i+1}`,'enemy',{feignDeathGroup:'memory',wave:1}));
const boss=unit('arbiter','enemy',{mechanicReserve:true,active:false,wave:1});
const config={strict:false,sp:0,maxSP:5,maxAV:100,critMode:'noncrit',seed:1,
  units:[unit('ally','ally'),...adds,boss],
  encounterGroups:[{id:'memory',memberIds:adds.map(u=>u.id),activateOnClear:[{unitId:boss.id,hpRatio:1}]}]};

assert.deepEqual(validateBattle(config),[],'五只活动敌人加一只预置首领应通过每波上限校验');
const b=createBattle(config),attacker=b.units.find(u=>u.id==='ally');
assert.ok(adds.every(u=>b.units.find(x=>x.id===u.id).active),'初始忆灵应登场');
assert.equal(b.units.find(u=>u.id==='arbiter').active,false,'预置首领在合体前不应登场');

for(let i=0;i<adds.length;i++){
  const target=b.units.find(u=>u.id===adds[i].id);
  receiveDamage(b,attacker,target,2000,'direct');
  assert.equal(target.active,false,`第 ${i+1} 只忆灵受致命伤后应进入假死`);
  assert.equal(target.feignedDead,true);
  assert.equal(b.units.find(u=>u.id==='arbiter').active,i===adds.length-1,'首领只能在最后一只进入假死后登场');
}
const finalBoss=b.units.find(u=>u.id==='arbiter');
assert.equal(finalBoss.hp,finalBoss.panel.hp,'合体登场生命值应按场景声明比例恢复');
assert.ok(b.log.some(e=>e.type==='mechanic'&&e.name==='【假死】'));
assert.ok(b.log.some(e=>e.type==='mechanic'&&e.name==='假死成员全部集齐 · 触发合体'));
assert.equal(b.log.filter(e=>e.type==='death'&&adds.some(u=>u.id===e.actor)).length,0,'假死不能错误触发击杀事件');

const preservedAdd=unit('preserved-memory','enemy',{feignDeathGroup:'preserved',wave:1});
const preservedBoss=unit('preserved-arbiter','enemy',{mechanicReserve:true,active:false,currentHp:700,wave:1});
const preservedBattle=createBattle({...config,units:[unit('ally','ally'),preservedAdd,preservedBoss],
  encounterGroups:[{id:'preserved',memberIds:[preservedAdd.id],activateOnClear:[{unitId:preservedBoss.id}]}]});
const statefulBoss=preservedBattle.units.find(u=>u.id===preservedBoss.id);
statefulBoss.toughness=37;statefulBoss.broken=true;statefulBoss.turns=3;statefulBoss.distance=4567;
receiveDamage(preservedBattle,preservedBattle.units[0],preservedBattle.units.find(u=>u.id===preservedAdd.id),2000,'direct');
assert.deepEqual([statefulBoss.hp,statefulBoss.toughness,statefulBoss.broken,statefulBoss.turns,statefulBoss.distance],[700,37,true,3,4567],
  '没有阶段重置声明时，合体登场应保留首领已有战斗状态');

const invalid={...config,encounterGroups:[{id:'memory',memberIds:['memory-1'],activateOnClear:[{unitId:'missing'}]}]};
assert.ok(validateBattle(invalid).some(e=>e.includes('清空后登场单位不存在')),'无效组引用应在战前拒绝');
console.log('Encounter group checks: reserve units, five-member fake-death, gated re-entry, and validation passed.');
