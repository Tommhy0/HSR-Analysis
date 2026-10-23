import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createContext} from '../core/ctx.mjs';
import {inspectEndgameTarget} from '../simulator/endgame-scenes.mjs';
import {buildEndgameEncounter} from '../simulator/endgame-battles.mjs';
import {waveLady,validateEnemyActor} from '../simulator/encounters.mjs';
import {simulateBattle,validateBattle} from '../simulator/engine.mjs';
import {strictParty} from '../simulator/party.mjs';

const ctx=createContext(JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url))));
const source=inspectEndgameTarget(ctx,{mode:'moc',seasonId:1036,floorId:'5503',side:2}).enemies.find(e=>e.childId===4053010);
assert.ok(source,'MoC 1036 5503 side 2 should contain Lady of Crashing Waves');
assert.equal(source.hp,163989);
assert.equal(source.speed,158.4);
assert.equal(source.toughness,180);
assert.equal(source.aiSource.aiFile.sha,'c7c8bfc77e9dd5fb8521a0acc337992356f2c9fe');

const actor=waveLady(ctx,{sceneEnemy:source,id:'manta'});
assert.deepEqual(validateEnemyActor(actor),[]);
assert.equal(actor.actions.skill01.terms[0].multiplier,2.5);
assert.equal(actor.actions.skill01.terms[1].multiplier,1.5);
assert.equal(actor.actions.skill02.terms[0].multiplier,2);
assert.equal(actor.enemyKit.skill02DefShred,.15);
assert.equal(actor.enemyKit.skill02ResReduction,.15);
assert.equal(actor.unsupported.length,3,'dance / DoT, maid passives, and insertion timing must remain explicit gaps');

const maidSource=inspectEndgameTarget(ctx,{mode:'pf',seasonId:2027,floorId:'20272',side:1}).enemies.find(e=>e.childId===4052010);
assert.ok(maidSource,'PF 2027 20272 side 1 should contain a database-backed Servant of Tides row');
assert.equal(maidSource.hp,116078.9);
assert.deepEqual(maidSource.aiSource.skillSpecs.find(s=>s.id===405201001).params,[1.8,.7]);
const maid=waveLady(ctx,{sceneEnemy:source,id:'unused'}).enemyKit.summonBlueprint;
assert.deepEqual(validateEnemyActor(maid),[]);

for(const floorId of ['5503','5508']){
  const scene=buildEndgameEncounter(ctx,strictParty(ctx),{mode:'moc',seasonId:1036,floorId,side:2});
  assert.equal(scene.sceneReplay.enemyLineupComplete,true);
  assert.equal(scene.units.some(u=>u.enemyKit?.id===4053010),true);
  assert.equal(scene.sceneReplay.enemyBehaviorComplete,false,'unsupported Manta mechanics must prevent a complete-behavior claim');
}

const idle={name:'等待',type:'Normal',element:'Physical',target:'single',terms:[],hitEnergy:0};
const allies=Array.from({length:4},(_,i)=>({id:`ally-${i+1}`,name:`测试队员${i+1}`,side:'ally',level:80,aggro:i===0?100:0,
  panel:{hp:1e8,atk:100,def:100,speed:1,critRate:0,critDmg:0,effectRes:0,controlRes:0,energyRegen:1,elemDmg:{},baseStats:{hp:1e8,atk:100,def:100,speed:1}},
  energy:0,energyMax:100,actions:{basic:{...idle}},policy:{basicOnly:true,autoUltimate:false}}));
const config={strict:false,sp:3,maxSP:5,maxAV:340,critMode:'noncrit',seed:7,units:[...allies,actor]};
assert.deepEqual(validateBattle(config),[]);
const replay=simulateBattle(config);
assert.deepEqual(replay.log.filter(e=>e.type==='action'&&e.actor==='manta').map(e=>e.key).slice(0,5),
  ['skill01','skill02','skill03','skill04','skill05']);
assert.equal(replay.actors.filter(a=>a.side==='enemy'&&a.id.startsWith('manta:servant:')).length,2);
assert.ok(replay.log.some(e=>e.type==='summon'&&e.actor==='manta'&&e.name==='召唤浪花侍女'));
assert.ok(replay.log.some(e=>e.type==='action'&&e.actor==='manta:servant:1'&&e.name==='海的裙摆飘荡'),
  'summoned maids must use their sourced sequence-three attack instead of falling through to a generic enemy AI');
const actionLog=replay.log.filter(e=>e.type==='action');
assert.ok(actionLog.findIndex(e=>e.actor==='manta:servant:1')<actionLog.findIndex(e=>e.actor==='manta'&&e.key==='skill04'),
  'summoned maids must use the sourced 0.25 action-delay ratio');
assert.ok(replay.log.some(e=>e.type==='buff'&&e.name==='蜜酿泼洒如星 · 防御降低'&&Math.abs(e.value-.15)<1e-8));
assert.ok(replay.log.some(e=>e.type==='buff'&&e.name==='蜜酿泼洒如星 · 全属性抗性降低 · Physical'&&Math.abs(e.value-.15)<1e-8));

console.log('Wave Lady checks: database lineup, exact opening damage / debuff, Flag1-5 actions, two servants, and explicit unsupported state chains passed.');
