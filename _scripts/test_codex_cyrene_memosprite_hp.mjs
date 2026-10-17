import assert from 'node:assert/strict';
import {actor,dummy,force} from './codex_test_helpers.mjs';
import {createBattle,receiveDamage,combatPanel} from '../simulator/engine.mjs';

const cyrene=actor(1415),healer=dummy('healer'),foe=dummy('foe','enemy');
const b=createBattle({strict:false,maxAV:500,sp:3,maxSP:9,seed:26,critMode:'noncrit',units:[cyrene,healer,foe]});
const owner=b.units.find(u=>u.characterId===1415),medic=b.units.find(u=>u.id==='healer'),enemy=b.units.find(u=>u.id==='foe');
owner.energy=owner.energyMax;
force(b,owner,'ultimate');
const demo=b.units.find(u=>u.memospriteOwner===owner.id);
assert.ok(demo&&demo.active,'the real ultimate action must create Demigogue');

function assertSynchronizedHp(when){
  const ownerRatio=owner.hp/combatPanel(owner).hp;
  const demoRatio=demo.hp/combatPanel(demo).hp;
  assert.ok(Math.abs(ownerRatio-demoRatio)<1e-10,`${when}: Demigogue must track Cyrene HP percentage (${demoRatio} vs ${ownerRatio})`);
}

// The raw 1141503 servant talent says Demigogue's HP percentage follows Cyrene's.
receiveDamage(b,enemy,owner,combatPanel(owner).hp*.2,'direct');
assertSynchronizedHp('after real damage resolution');

medic.actions.basic.target='ally';
medic.actions.basic.terms=[];
medic.actions.basic.effects=[{type:'heal',target:'allies',value:combatPanel(owner).hp*.1}];
medic.policy={...medic.policy,turnPlan:[{turn:medic.turns+1,key:'basic',targetId:owner.id}]};
force(b,medic,'basic');
assert.ok(b.log.some(e=>e.type==='heal'&&e.target===owner.id&&e.amount>0),'the teammate action must actually heal Cyrene');
assertSynchronizedHp('after a real teammate healing action');

// HP consumption uses the same source event path as character and technique costs.
medic.actions.basic.effects=[{type:'hpConsume',target:'allies',value:combatPanel(owner).hp*.05}];
medic.policy={...medic.policy,turnPlan:[{turn:medic.turns+1,key:'basic',targetId:owner.id}]};
force(b,medic,'basic');
assert.ok(b.log.some(e=>e.type==='hp_consume'&&e.target===owner.id&&e.amount>0),'the teammate action must actually consume Cyrene HP');
assertSynchronizedHp('after real HP consumption');

console.log('PASS Cyrene HP percentage synchronizes to Demigogue after damage, healing, and HP consumption');
