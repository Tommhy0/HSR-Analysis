import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createContext} from '../core/ctx.mjs';
import {ascended,illuminationDragonfish,isEnemyMechanicRegistered,validateEnemyActor} from '../simulator/encounters.mjs';
import {combatPanel,createBattle,stepBattle} from '../simulator/engine.mjs';
import {inspectEndgameTarget} from '../simulator/endgame-scenes.mjs';
import {strictParty} from '../simulator/party.mjs';

const ctx=createContext(JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url))));
const scene=inspectEndgameTarget(ctx,{mode:'pf',seasonId:2027,floorId:'20272',side:1});
const source=scene.enemies.find(enemy=>enemy.childId===2012010);
assert.ok(source,'PF 20272/S1 database lineup includes Illumination Dragonfish');
const actor=illuminationDragonfish(ctx,{sceneEnemy:source});
assert.deepEqual(validateEnemyActor(actor),[]);
assert.equal(isEnemyMechanicRegistered(2012010),true);
assert.deepEqual([actor.panel.hp,actor.panel.speed,actor.toughnessMax],[15454.3,100,20],
  'actor uses the sourced PF stage panel');
assert.deepEqual(actor.enemyKit.sourceHashes,{ai:'26aab40120a49b8b467ac4535f80e4381d9df0c1',
  ability:'bf3f4640ad410e0879a55c1349d5f23c39488589',character:'fcfbfe5cd7a83302bd776eb212b4724843ed9bb3'});

function dummyParty({atk=0}={}){
  const allies=structuredClone(strictParty(ctx).units.filter(unit=>unit.side==='ally'));
  for(const ally of allies){
    delete ally.kit;delete ally.characterId;delete ally.gear;delete ally.memospriteOwner;
    ally.panel={hp:1e9,atk,def:0,speed:1,critRate:0,critDmg:0,effectRes:0,elemDmg:{},baseStats:{hp:1e9,atk,def:0}};
    ally.hp=1e9;ally.energy=0;ally.energyMax=0;ally.buffs=[];ally.shields=[];ally.dots=[];ally.resources={};
    ally.actions={basic:{name:'source-check probe',type:'Normal',element:'Physical',target:'single',terms:[{scaling:'atk',multiplier:10}]}};
    ally.policy={autoUltimate:false,basicOnly:true};ally.standardBreak=false;
  }
  return allies;
}

const allies=dummyParty();
const fish=illuminationDragonfish(ctx,{sceneEnemy:source,id:'dragonfish-normal'});
fish.panel.effectHit=10;
const normal=createBattle({strict:false,maxAV:1000,sp:3,maxSP:9,seed:29,critMode:'noncrit',units:[...allies,fish]});
for(const unit of normal.units)unit.distance=10000;
const liveFish=normal.units.find(unit=>unit.id==='dragonfish-normal');
liveFish.distance=0;
assert.equal(stepBattle(normal),true);
assert.ok(normal.log.some(event=>event.type==='action'&&event.actor===liveFish.id&&event.key==='skill01'),
  'shared SequenceThree path selects the sourced AllEnemy skill');
assert.equal(normal.log.filter(event=>event.type==='damage'&&event.actor===liveFish.id&&event.element==='Fire').length,4,
  '宵明 hits the full opposing team with fire damage');
const marked=normal.units.filter(unit=>unit.side==='ally'&&unit.buffs.some(effect=>effect.tag==='illuminationDragonfishDefenseDown'));
assert.equal(marked.length,2,'宵明 chooses no more than two targets for 防御力降低 when four opponents are alive');
assert.ok(marked.every(unit=>unit.buffs.find(effect=>effect.tag==='illuminationDragonfishDefenseDown').value===.3));
assert.ok(normal.log.some(event=>event.type==='mechanic'&&event.name==='【灯昼龙鱼】施加防御力降低'&&event.reason==='宵明'));

const lethalAllies=dummyParty({atk:1e9});
const doomedFish=illuminationDragonfish(ctx,{sceneEnemy:source,id:'dragonfish-doomed'});
doomedFish.panel.effectHit=10;
const lethal=createBattle({strict:false,maxAV:1000,sp:3,maxSP:9,seed:31,critMode:'noncrit',units:[...lethalAllies,doomedFish]});
for(const unit of lethal.units)unit.distance=10000;
lethal.units.find(unit=>unit.side==='ally').distance=0;
assert.equal(stepBattle(lethal),true);
const liveDoomed=lethal.units.find(unit=>unit.id==='dragonfish-doomed');
assert.ok(liveDoomed.hp<=1e-8,'probe attack defeats the dragonfish');
assert.equal(lethal.log.filter(event=>event.type==='action'&&event.actor===liveDoomed.id&&event.key==='skill02'&&event.kind==='extra').length,1,
  '烛花 is inserted exactly once on death');
assert.equal(lethal.log.filter(event=>event.type==='damage'&&event.actor===liveDoomed.id&&event.element==='Fire').length,4,
  'deathrattle damages the full opposing team');
assert.equal(lethal.units.filter(unit=>unit.side==='ally'&&unit.buffs.some(effect=>effect.tag==='illuminationDragonfishDefenseDown')).length,4,
  'deathrattle applies its guaranteed defense-down attempt to every surviving opponent');

const ascendedSource=scene.enemies.find(enemy=>enemy.childId===202303016);
assert.ok(ascendedSource,'PF 20272/S1 database lineup includes The Ascended');
const ascendedActor=ascended(ctx,{sceneEnemy:ascendedSource});
assert.equal(isEnemyMechanicRegistered(202303016),true);
assert.deepEqual(validateEnemyActor(ascendedActor),[]);
const near=(actual,expected,tolerance=1e-6)=>assert.ok(Math.abs(actual-expected)<=tolerance,
  `${actual} != ${expected}`);
near(ascendedActor.panel.hp,1359978.1,.1);
near(ascendedActor.panel.atk,387.053928,1e-5);
near(ascendedActor.panel.def,849.99999,1e-4);
assert.equal(ascendedActor.level,65);
assert.deepEqual([ascendedActor.panel.speed,ascendedActor.toughnessMax,ascendedActor.element,ascendedActor.rank],
  [120,140,'Wind','elite']);
assert.deepEqual(ascendedActor.enemyKit.sourceHashes,{ai:'7a063305006f4e5676aa7aaaedec6d2e09e41852',
  character:'b7b0de2cb349983944eaba9bee2784f6a8ffa22a',
  ability:'4059b25ad18f6d0c1f5b0a05accc42c3196d855e',
  sharedModifier:'e043cdc0650741eb27049b0c1a0710bccb77618f'});
assert.deepEqual([
  ascendedActor.enemyKit.skill01Params,ascendedActor.enemyKit.skill02Params,
  ascendedActor.enemyKit.skill03Params,ascendedActor.enemyKit.skill04Params,ascendedActor.enemyKit.skill05Params],
[[1,1,3,.7],[2,1,3,.7],[3,1,3,.7],[],[.3,2,1]],'skill params match MonsterSkillConfig 202303001-202303005');
assert.equal(ascendedActor.enemyKit.oneMorePerTurn,true);
assert.deepEqual(ascendedActor.enemyKit.aiSequence,[202303001,202303002,202303003,202303004,202303005]);
assert.equal(ascendedActor.actions.skill01.repeatCount,5);
assert.equal(ascendedActor.actions.skill01.randomHitTargets,true);
assert.equal(ascendedActor.actions.skill01.hitEnergyPerHit,true);
assert.deepEqual(ascendedActor.actions.skill02.terms,
  [{scaling:'atk',multiplier:2,target:'primary'},{scaling:'atk',multiplier:1,target:'adjacent'}]);
assert.equal(ascendedActor.actions.skill03.terms[0].multiplier,3);
assert.deepEqual([ascendedActor.actions.skill04.target,ascendedActor.actions.skill05.target],['self','all']);
assert.equal(ascendedActor.enemyMechanicNotes.length,3,'internal DirtyHP formula, taunt priority and story branches remain explicit gaps');

const ascendedAllies=dummyParty();
const bossActor=ascended(ctx,{sceneEnemy:ascendedSource,id:'ascended-runtime'});
const ascendedBattle=createBattle({strict:false,maxAV:3000,sp:3,maxSP:9,seed:7,critMode:'noncrit',
  units:[...ascendedAllies,bossActor]});
for(const unit of ascendedBattle.units)unit.distance=10000;
const liveAscended=ascendedBattle.units.find(unit=>unit.id==='ascended-runtime');
liveAscended.distance=0;
const ascendedSteps=[];
for(let turn=0;turn<4;turn++){
  const before=ascendedBattle.log.length;
  assert.equal(stepBattle(ascendedBattle),true);
  ascendedSteps.push(ascendedBattle.log.slice(before)
    .filter(event=>event.type==='action'&&event.actor===liveAscended.id)
    .map(event=>event.key+':'+event.kind));
}
assert.deepEqual(ascendedSteps,[
  ['skill03:normal','skill02:continuation'],
  ['skill01:normal','skill03:continuation'],
  ['skill04:normal','skill05:continuation'],
  ['skill03:normal','skill03:continuation']],
'AI flags rotate 1→2→3→4→5→6 with OneMorePerTurn continuation actions');
assert.ok(ascendedBattle.log.some(event=>event.type==='mechanic'&&event.name==='【玄气咒厌法】进入【持咒】'));
assert.ok(ascendedBattle.log.some(event=>event.type==='mechanic'&&event.name==='【持咒】解除'));
assert.equal(liveAscended.buffs.some(effect=>effect.tag==='ascendedCharge'),false,
  '玄气噬身 removes ChargeEffect');
assert.equal(liveAscended.resources['承露天人AIFlag'],2);
assert.equal(liveAscended.resources['承露天人特殊标记'],0);

const poisoned=ascendedBattle.units.filter(unit=>unit.side==='ally')
  .map(unit=>unit.dots.find(effect=>effect.tag==='ascendedPoison'));
assert.ok(poisoned.every(Boolean),'every ally receives MCommon_DOT_Poison from Skill01-03');
assert.ok(poisoned.every(effect=>effect.element==='Wind'&&effect.modifierName==='MCommon_DOT_Poison'));
assert.ok(poisoned.every(effect=>effect.stacks>=1&&effect.stacks<=5));
assert.ok(poisoned.some(effect=>effect.stacks===5),'repeated hits stack poison to MaxLayer 5');
const dirtyState=ascendedBattle.units.filter(unit=>unit.side==='ally').map(unit=>({
  unit,effect:unit.buffs.find(effect=>effect.tag==='ascendedDirtyHp')
}));
assert.ok(dirtyState.every(({effect})=>effect),'玄气噬身 applies 噬命 to the whole team');
for(const {unit,effect} of dirtyState){
  assert.ok(effect.value>=.3-1e-9&&effect.value<=.5+1e-9,'initial DirtyHPRatio 0.3, cap 0.5');
  near(combatPanel(unit).hp,(1-effect.value)*1e9,.01);
  assert.ok(unit.hp<=combatPanel(unit).hp+1e-6,'current HP is clamped to the reduced maximum');
}
const converted=dirtyState.filter(({effect})=>effect.value>.3+1e-9);
assert.ok(converted.length>0,'damage dealt to a 噬命 target further reduces the maximum HP');

const chargeBoss=liveAscended;
chargeBoss.resources['承露天人AIFlag']=5;
chargeBoss.resources['承露天人特殊标记']=1;
chargeBoss.resources['承露天人本回合追加行动']=1;
chargeBoss.buffs.push({type:'buff',id:'test-charge',tag:'ascendedCharge',name:'持咒',key:'marker',value:0});
ascendedBattle.rules.weaknessBreak(ascendedBattle,ascendedBattle.units.find(unit=>unit.side==='ally'),
  chargeBoss,chargeBoss.actions.skill01,'Wind');
assert.deepEqual([chargeBoss.resources['承露天人AIFlag'],chargeBoss.resources['承露天人特殊标记'],
  chargeBoss.resources['承露天人本回合追加行动']],[4,2,0],
'PhaseControl: AIFlag 5→4 on break, SpecialFlag 1→2, pending extra action cancelled');
assert.equal(chargeBoss.buffs.some(effect=>effect.tag==='ascendedCharge'),false,
  'ChargeEffect OnBeingBreak removes the charge marker');
chargeBoss.broken=false;
const beforeBreakTurn=ascendedBattle.log.length;
assert.equal(stepBattle(ascendedBattle),true);
assert.deepEqual(ascendedBattle.log.slice(beforeBreakTurn)
  .filter(event=>event.type==='action'&&event.actor===chargeBoss.id).map(event=>event.key+':'+event.kind),
['skill04:normal','skill05:continuation'],'SpecialFlag=2 re-enters Skill04, then Skill05');

chargeBoss.resources={};
chargeBoss.buffs=chargeBoss.buffs.filter(effect=>effect.tag!=='ascendedOneMorePerTurn');
const beforeSpawnTurn=ascendedBattle.log.length;
assert.equal(stepBattle(ascendedBattle),true);
assert.deepEqual(ascendedBattle.log.slice(beforeSpawnTurn)
  .filter(event=>event.type==='action'&&event.actor===chargeBoss.id).map(event=>event.key+':'+event.kind),
['skill03:normal','skill02:continuation'],
'wave-spawned actors lazily initialize AIFlag=1 and the OneMorePerTurn marker on their first action');
assert.equal(chargeBoss.resources['承露天人AIFlag'],3);
assert.ok(chargeBoss.buffs.some(effect=>effect.tag==='ascendedOneMorePerTurn'));

console.log('PF 20272/S1 checks: Dragonfish sourced panel / AoE / capped defense-down / deathrattle, plus The Ascended sourced panel, AI flag cycle, OneMore, poison stacking, 噬命, break recovery and spawn initialization passed.');
