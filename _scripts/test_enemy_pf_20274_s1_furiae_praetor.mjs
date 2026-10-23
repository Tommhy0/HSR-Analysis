import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createContext} from '../core/ctx.mjs';
import {inspectEndgameTarget} from '../simulator/endgame-scenes.mjs';
import {furiaePraetor,isEnemyMechanicRegistered,validateEnemyActor} from '../simulator/encounters.mjs';
import {combatPanel,createBattle,stepBattle} from '../simulator/engine.mjs';
import {strictParty} from '../simulator/party.mjs';

const ctx=createContext(JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url))));
const scene=inspectEndgameTarget(ctx,{mode:'pf',seasonId:2027,floorId:'20274',side:1});
const source=scene.enemies.find(enemy=>enemy.childId===401301201);
assert.ok(source,'PF 20274/S1 wave 1 contains Furiae Praetor (child 401301201)');

const praetor=furiaePraetor(ctx,{sceneEnemy:source,id:'praetor-1'});
assert.deepEqual(validateEnemyActor(praetor),[]);
assert.equal(isEnemyMechanicRegistered(401301201),true);
assert.equal(isEnemyMechanicRegistered(4013012),true);
assert.equal(praetor.monsterId,401301201);
assert.equal(praetor.element,'Imaginary');
assert.equal(praetor.panel.hp,source.hp);
assert.equal(praetor.panel.speed,source.speed);
assert.equal(praetor.toughnessMax,source.toughness);
assert.deepEqual(praetor.weaknesses,['Ice','Thunder','Quantum']);
assert.deepEqual(praetor.enemyKit.sourceHashes,{
  ai:'f8ffacff194eea6f67d10d9ac60b720377af299d',
  ability:'6dd705d2b18d5a03b82395ec1063a708029befbb',
  character:'2326dcb65a9e7677506e965199527c14fe52464a',
  fantasticStoryCharacter:'a459c3b44d3c5d9c5599b8b4a3adf4acbb93dcbc'});
assert.deepEqual(praetor.actions.skill01.terms,[{scaling:'atk',multiplier:2.8}]);
assert.equal(praetor.actions.skill01.target,'sweep');
assert.equal(praetor.actions.skill01.sweepDirection,'left');
assert.deepEqual(praetor.actions.skill02.terms,[{scaling:'atk',multiplier:2.8}]);
assert.equal(praetor.actions.skill02.target,'sweep');
assert.equal(praetor.actions.skill02.sweepDirection,'right');
assert.equal(praetor.actions.skill03.target,'self');
assert.deepEqual(praetor.actions.skill03.terms,[]);
assert.equal(praetor.actions.skill04.target,'all');
assert.equal(praetor.actions.skill04.shareDamageAcrossTargets,true);
assert.deepEqual(praetor.actions.skill04.terms,[{scaling:'atk',multiplier:12}]);
assert.deepEqual([praetor.enemyKit.armorMaxLayers,praetor.enemyKit.armorDamageResistance,
  praetor.enemyKit.armorCrackedDelay,praetor.enemyKit.armorCrackedDamage,
  praetor.enemyKit.armorCrackedDamageAfter,praetor.enemyKit.armorBreakEnergyRatio],[6,.1,.2,.05,.015,.15]);
assert.equal(praetor.enemyMechanicNotes.length,4,'unsourced presentation / scoreboard / summon branches stay explicit');

const zeroDefPanel=atk=>({hp:1e9,atk,def:0,speed:1,critRate:0,critDmg:0,effectRes:0,energyRegen:1,elemDmg:{},baseStats:{hp:1e9,atk,def:0}});
function battleWith(extra){
  const party=structuredClone(strictParty(ctx).units.filter(unit=>unit.side==='ally'));
  for(const unit of party){
    delete unit.kit;delete unit.characterId;delete unit.gear;delete unit.memospriteOwner;
    unit.panel=zeroDefPanel(100);unit.hp=1e9;unit.energy=0;unit.energyMax=100;
    unit.buffs=[];unit.shields=[];unit.dots=[];unit.resources={};
    unit.actions={basic:{name:'probe',type:'Normal',element:'Physical',target:'single',terms:[{scaling:'atk',multiplier:1}]}};
    unit.policy={autoUltimate:false,basicOnly:true};unit.standardBreak=false;
  }
  const battle=createBattle({strict:false,maxAV:1000,sp:3,maxSP:9,seed:13,critMode:'noncrit',units:[...party,extra]});
  for(const unit of battle.units)unit.distance=10000;
  return battle;
}

// 轮转：AIFlag 1→Skill01、2→Skill02、3→Skill01、4→(OneMore ? Skill02 : 蓄力)、5→Skill04。
const rotationBattle=battleWith(furiaePraetor(ctx,{sceneEnemy:source,id:'praetor-1'}));
const live=rotationBattle.units.find(unit=>unit.id==='praetor-1');
assert.equal(live.resources['天谴先锋AIFlag'],1);
assert.equal(live.buffs.some(effect=>effect.tag==='furiaePraetorOneMorePerTurn'),true,'PassiveSkillInitiate grants OneMorePerTurn');
const armor=()=>live.buffs.find(effect=>effect.tag==='furiaePraetorArmor');
assert.equal(armor().stacks,6);
assert.ok(Math.abs(armor().value-.6)<1e-12,'6 layers x 10% damage reduction');
const atk=combatPanel(live).atk;
const actionsOf=events=>events.filter(event=>event.type==='action'&&event.actor===live.id);

function takeTurn(battle,actor){
  const before=battle.log.length;
  actor.distance=0;
  assert.equal(stepBattle(battle),true);
  return battle.log.slice(before);
}
const skills=events=>actionsOf(events).map(event=>event.key);
// damage events carry no action key; slice them under the action that produced them.
const slicesOf=events=>{
  const slices=[];
  for(const event of events){
    if(event.type==='action'&&event.actor===live.id)slices.push({key:event.key,hits:[]});
    else if(event.type==='damage'&&event.actor===live.id&&slices.length)slices.at(-1).hits.push(event);
  }
  return slices;
};
const hitsOf=(events,key)=>slicesOf(events).filter(slice=>slice.key===key).flatMap(slice=>slice.hits);

const turn1=takeTurn(rotationBattle,live);
assert.deepEqual(skills(turn1),['skill01','skill02'],'flag 1 then 2 in one turn through the OneMore follow-up');
assert.equal(live.resources['天谴先锋AIFlag'],3);
const sweepLeft=hitsOf(turn1,'skill01'),sweepRight=hitsOf(turn1,'skill02');
assert.deepEqual(sweepLeft.map(hit=>hit.target),['slot-1','slot-2','slot-3'],'Skill01 sweeps three consecutive targets from the player team\'s left');
assert.deepEqual(sweepRight.map(hit=>hit.target),['slot-2','slot-3','slot-4'],'Skill02 sweeps three consecutive targets from the right');
for(const hit of [...sweepLeft,...sweepRight]){
  assert.equal(hit.hitEnergy,10);
  assert.ok(Math.abs(hit.damage-atk*2.8)<1e-6,`sourced 2.8x ATK per swept target, got ${hit.damage} vs ${atk*2.8}`);
}

const turn2=takeTurn(rotationBattle,live);
assert.deepEqual(skills(turn2),['skill01','skill02'],'flag 3 then the OneMore branch of flag 4');
assert.equal(live.resources['天谴先锋AIFlag'],4,'the flag-4 OneMore branch does not advance AIFlag');

const turn3=takeTurn(rotationBattle,live);
assert.deepEqual(skills(turn3),['skill03'],'without OneMorePerTurn flag 4 falls through to the charge skill');
assert.equal(live.resources['天谴先锋AIFlag'],5);
assert.equal(live.buffs.some(effect=>effect.tag==='furiaePraetorOneMorePerTurn'),false,'the charge branch removes OneMorePerTurn');
assert.equal(hitsOf(turn3,'skill03').length,0);

const turn4=takeTurn(rotationBattle,live);
assert.deepEqual(skills(turn4),['skill04','skill01'],'Skill04 re-grants OneMorePerTurn, so the follow-up uses flag 1');
assert.equal(live.resources['天谴先锋AIFlag'],2);
const shared=hitsOf(turn4,'skill04');
assert.equal(shared.length,4,'Skill04 is split across every live ally');
for(const hit of shared){
  assert.equal(hit.hitEnergy,20);
  assert.ok(Math.abs(hit.damage-atk*12/4)<1e-6,`Skill04 splits 12.0/4 x ATK per target, got ${hit.damage}`);
}
const vulnerability=new Map();
for(const unit of rotationBattle.units.filter(unit=>unit.side==='ally')){
  const effect=unit.buffs.find(buff=>buff.tag==='furiaePraetorVulnerability');
  assert.ok(effect,unit.id+' receives the shared 【易伤】');
  assert.ok(Math.abs(effect.value-1.2/4)<1e-12,'vulnerability is Skill04[1] / target count');
  assert.equal(effect.remaining,2);
  vulnerability.set(unit.id,effect.value);
}
assert.equal(vulnerability.size,4);
const followup=hitsOf(turn4,'skill01');
for(const hit of followup)assert.ok(Math.abs(hit.damage-atk*2.8*1.3)<1e-6,'the follow-up already benefits from the 30% vulnerability');

// 【战甲】：每层 10% 减伤，受击 -1 层；1→0 层破甲；0 层每次受击追加 1.5% 最大生命伤害；自身回合结束回满。
const armorBattle=battleWith(furiaePraetor(ctx,{sceneEnemy:source,id:'praetor-2'}));
const tank=armorBattle.units.find(unit=>unit.id==='praetor-2');
const attacker=armorBattle.units.find(unit=>unit.side==='ally');
const layersOf=unit=>unit.buffs.find(effect=>effect.tag==='furiaePraetorArmor')?.stacks??0;
assert.equal(layersOf(tank),6);
for(let expected=5;expected>=2;expected--){
  const events=takeTurn(armorBattle,attacker);
  assert.equal(layersOf(tank),expected,'each incoming attack removes one layer');
  assert.ok(Math.abs((tank.buffs.find(effect=>effect.tag==='furiaePraetorArmor').value)-.1*expected)<1e-12);
  assert.equal(events.some(event=>event.type==='mechanic'&&event.name==='【战甲】层数变化'),true);
}
takeTurn(armorBattle,attacker);
assert.equal(layersOf(tank),1);
const breakEvents=takeTurn(armorBattle,attacker);
assert.equal(layersOf(tank),0,'the attack against the last layer is the break hit');
const energyEvent=breakEvents.find(event=>event.type==='energy'&&event.actor===attacker.id);
assert.ok(energyEvent,'the breaker recovers energy');
assert.ok(Math.abs(energyEvent.amount-attacker.energyMax*.15)<1e-9);
const delayEvent=breakEvents.find(event=>event.type==='delay'&&event.actor===tank.id);
assert.ok(delayEvent,'the praetor is delayed');
assert.ok(Math.abs(delayEvent.ratio-.2)<1e-12);
assert.equal(breakEvents.some(event=>event.type==='mechanic'&&event.name==='【战甲】被破坏'),true);
const breakSelf=breakEvents.find(event=>event.type==='damage'&&event.actor===tank.id&&event.target===tank.id);
assert.ok(breakSelf,'the break deals max-HP damage to the praetor itself');
assert.ok(breakSelf.damage>0);

const crackedEvents=takeTurn(armorBattle,attacker);
assert.equal(layersOf(tank),0);
const crackedSelf=crackedEvents.find(event=>event.type==='damage'&&event.actor===tank.id&&event.target===tank.id);
assert.ok(crackedSelf,'a cracked praetor takes extra damage from every attack');
assert.ok(Math.abs(crackedSelf.damage/breakSelf.damage-.015/.05)<1e-9,'the extra hit is 1.5% max HP versus the 5% break hit');

takeTurn(armorBattle,tank);
assert.equal(layersOf(tank),6,'【战甲】returns to max layers at the end of its own turn');
assert.ok(Math.abs(tank.buffs.find(effect=>effect.tag==='furiaePraetorArmor').value-.6)<1e-12);

console.log('PF 20274/S1 Furiae Praetor checks: sourced sweep 2.8x / shared 12.0x Skill04 with averaged vulnerability, AIFlag + OneMorePerTurn rotation, and 6-layer 【战甲】 break / cracked damage / turn-end restore passed.');
