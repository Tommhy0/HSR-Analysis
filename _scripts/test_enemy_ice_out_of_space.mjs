import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createContext} from '../core/ctx.mjs';
import {inspectEndgameTarget} from '../simulator/endgame-scenes.mjs';
import {iceOutOfSpace,validateEnemyActor} from '../simulator/encounters.mjs';
import {buildEndgameEncounter} from '../simulator/endgame-battles.mjs';
import {strictParty} from '../simulator/party.mjs';
import {simulateBattle,validateBattle} from '../simulator/engine.mjs';

const ctx=createContext(JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url))));
const scene=inspectEndgameTarget(ctx,{mode:'moc',seasonId:1036,floorId:'5504',side:1});
assert.equal(scene.behaviorComplete,true);
const source=scene.enemies.find(e=>e.childId===8003010);
assert.ok(source,'4.6 MoC 5504 side 1 wave 2 should contain Ice Out of Space');
assert.equal(source.wave,1);
assert.equal(source.hp,123317.9);
assert.equal(source.speed,110);
assert.equal(source.stance,300);
assert.deepEqual(source.weakness,['Fire','Wind','Quantum']);
assert.deepEqual(source.skills.map(s=>s.name),['叹息之寒','汲取霜晶','永冬之雨','叹息之寒']);
assert.equal(source.aiSource.aiFile.sha,'314f2b71b1edc8163038ce8c170d9ef6fb9a28c7');

const pfScene=inspectEndgameTarget(ctx,{mode:'pf',seasonId:2027,floorId:'20272',side:2});
const pfSource=pfScene.enemies.find(e=>e.childId===800301020);
assert.ok(pfSource,'PF 2027 20272 side 2 should contain the elite Ice Out of Space child template');
assert.equal(pfSource.behaviorStatus,'registered');
const pfActor=iceOutOfSpace(ctx,{sceneEnemy:pfSource,id:'ice-pf'});
assert.equal(pfActor.childId,800301020);
assert.equal(pfActor.panel.hp,pfSource.hp);
assert.deepEqual(validateEnemyActor(pfActor),[]);

const actor=iceOutOfSpace(ctx,{sceneEnemy:source,id:'ice'});
assert.deepEqual(validateEnemyActor(actor),[]);
assert.equal(actor.panel.hp,source.hp);
assert.equal(actor.panel.speed,source.speed);
assert.equal(actor.panel.effectRes,source.statusRes/100);
assert.deepEqual(actor.actions.skill03.hitShares,[.3,.3,.4]);
assert.deepEqual(actor.actions.skill03.hitEnergyShares,[.3,.3,.4]);

const actualStage=buildEndgameEncounter(ctx,strictParty(ctx),{mode:'moc',seasonId:1036,floorId:'5504',side:1});
const sceneActor=actualStage.units.find(u=>u.side==='enemy'&&u.childId===8003010);
assert.ok(sceneActor);
assert.equal(sceneActor.panel.hp,123317.9);
assert.equal(sceneActor.wave,2);
assert.equal(actualStage.sceneReplay.enemyLineupComplete,true);

const wait={name:'等待',type:'Normal',element:'Physical',target:'single',terms:[],spGain:0,energyGain:0};
function dummyTeam({breaker=false,targetId='ice'}={}){
  return Array.from({length:4},(_,i)=>{
    const speed=breaker&&i===0?60:1;
    return {id:`ally-${i+1}`,name:`测试队员${i+1}`,side:'ally',level:80,aggro:i===0?100:0,
      panel:{hp:1e8,atk:100,def:100,speed,critRate:0,critDmg:0,effectRes:0,controlRes:0,energyRegen:1,elemDmg:{},baseStats:{hp:1e8,atk:100,def:100,speed}},
      energy:0,energyMax:100,
      actions:{basic:breaker&&i===0?{name:'击破',type:'Normal',element:'Fire',target:'single',targetId,terms:[{scaling:'atk',multiplier:.1}],hitEnergy:0,toughness:150}:wait},
      policy:breaker&&i===0?{rotation:['basic'],autoUltimate:false}:{basicOnly:true,autoUltimate:false}};
  });
}

const normalActor=iceOutOfSpace(ctx,{sceneEnemy:source,id:'ice'});
normalActor.panel={...normalActor.panel,hp:1e8,baseStats:{...normalActor.panel.baseStats,hp:1e8}};
const normalBattle={strict:false,sp:3,maxSP:5,maxAV:190,critMode:'noncrit',seed:7,units:[...dummyTeam(),normalActor]};
assert.deepEqual(validateBattle(normalBattle),[]);
const normal=simulateBattle(normalBattle);
const actions=normal.log.filter(e=>e.type==='action'&&e.actor==='ice');
assert.deepEqual(actions.map(e=>e.key),['skill01','skill02','skill03','skill01']);
assert.equal(actions[0].av,actions[1].av,'OneMorePerTurn continuation should not spend AV');
assert.equal(actions[2].av,actions[3].av,'second OneMorePerTurn continuation should not spend AV');
assert.ok(normal.log.some(e=>e.type==='mechanic'&&e.name==='汲取霜晶 · 进入【冰点】'&&e.toughnessAdded===120));
assert.ok(normal.log.some(e=>e.type==='mechanic'&&e.name==='【永冬之雨】施加冻结'&&e.chance===.6));
assert.ok(normal.log.some(e=>e.type==='delay'&&e.ratio===1.2));
assert.ok(normal.log.some(e=>e.type==='mechanic'&&e.name==='【冰点】对冻结目标追加伤害'&&e.multiplier===1));

const brokenActor=iceOutOfSpace(ctx,{sceneEnemy:source,id:'ice-break'});
brokenActor.toughnessMax=30;brokenActor.toughness=30;
brokenActor.panel={...brokenActor.panel,hp:1e8,baseStats:{...brokenActor.panel.baseStats,hp:1e8}};
const broken=simulateBattle({strict:false,sp:3,maxSP:5,maxAV:300,critMode:'noncrit',seed:7,
  units:[...dummyTeam({breaker:true,targetId:'ice-break'}),brokenActor]});
const brokenActions=broken.log.filter(e=>e.type==='action'&&e.actor==='ice-break').map(e=>e.key);
assert.deepEqual(brokenActions,['skill01','skill02','skill01','skill02','skill03','skill01']);
assert.ok(broken.log.some(e=>e.type==='mechanic'&&e.name==='弱点击破 · 解除【冰点】'));
assert.ok(broken.log.some(e=>e.type==='recover'&&e.actor==='ice-break'));
assert.ok(broken.log.some(e=>e.type==='mechanic'&&e.name==='弱点击破结束 · 恢复【NoWeakAndResistance】'));

console.log('Ice Out of Space checks: sourced MoC lineup, Icepoint AI/extra action, freeze and weakness-break reset passed.');
