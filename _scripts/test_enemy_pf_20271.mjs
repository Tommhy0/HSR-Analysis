import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createContext} from '../core/ctx.mjs';
import {ichorPheasant,magicalGirlTroupe,validateEnemyActor} from '../simulator/encounters.mjs';
import {createBattle,receiveDamage,stepBattle} from '../simulator/engine.mjs';
import {buildEndgameEncounter} from '../simulator/endgame-battles.mjs';
import {inspectEndgameTarget} from '../simulator/endgame-scenes.mjs';
import {strictParty} from '../simulator/party.mjs';

const ctx=createContext(JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url))));
const scene=inspectEndgameTarget(ctx,{mode:'pf',seasonId:2027,floorId:'20271',side:2});
const source=scene.enemies.find(enemy=>enemy.childId===5012100);
assert.ok(source,'PF 20271/S2 database lineup includes Magical Girl Troupe');
const template=magicalGirlTroupe(ctx,{sceneEnemy:source});
assert.deepEqual(validateEnemyActor(template),[]);
assert.deepEqual(template.actions.skill01.hitShares,[.1,.1,.1,.1,.1,.1,.4]);
assert.equal(template.actions.skill01.hitShares.reduce((sum,value)=>sum+value,0),1);

const allies=structuredClone(strictParty(ctx).units.filter(unit=>unit.side==='ally'));
for(const ally of allies){
  delete ally.kit;delete ally.characterId;delete ally.gear;delete ally.memospriteOwner;
  ally.panel={hp:1e9,atk:0,def:0,speed:1,critRate:0,critDmg:0,effectRes:0,elemDmg:{},baseStats:{hp:1e9,atk:0,def:0}};
  ally.hp=1e9;ally.energy=0;ally.energyMax=0;ally.buffs=[];ally.shields=[];ally.dots=[];ally.resources={};
  ally.actions={basic:{name:'probe',type:'Normal',element:'Physical',target:'single',terms:[]}};
  ally.policy={autoUltimate:false,basicOnly:true};ally.standardBreak=false;
}
function fixture(seed=41){
  const battle=createBattle({strict:false,maxAV:1000,sp:3,maxSP:9,seed,critMode:'noncrit',units:[...structuredClone(allies),magicalGirlTroupe(ctx,{sceneEnemy:source,id:'magic-girl'})]});
  const enemy=battle.units.find(unit=>unit.enemyKit?.id===5012100);
  for(const unit of battle.units)unit.distance=10000;
  assert.equal(enemy.resources['魔法少女天气'],0,'Battle start initializes Rain weather');
  assert.ok(enemy.buffs.some(buff=>buff.tag==='magicalGirlRain'));
  return {battle,enemy};
}

const skillTrigger=fixture();
skillTrigger.battle.rules.before(skillTrigger.battle,skillTrigger.battle.units[0],'elation','normal',{},[]);
assert.equal(skillTrigger.enemy.resources['魔法少女天气'],1,'any Elation skill switches Rain to Sun before execution');
assert.equal(skillTrigger.battle.laughter.ally,2);
assert.ok(skillTrigger.battle.log.some(event=>event.type==='delay'&&event.actor===skillTrigger.enemy.id&&event.ratio===1));

const hitTrigger=fixture();
receiveDamage(hitTrigger.battle,hitTrigger.battle.units[0],hitTrigger.enemy,1,'elation',{name:'probe Elation Damage'});
assert.equal(hitTrigger.enemy.resources['魔法少女天气'],1,'being hit by Elation damage switches Rain to Sun');
assert.equal(hitTrigger.battle.laughter.ally,2);

const sunnyDeath=fixture();
receiveDamage(sunnyDeath.battle,sunnyDeath.battle.units[0],sunnyDeath.enemy,sunnyDeath.enemy.hp,'elation',{name:'lethal Elation Damage'});
assert.ok(sunnyDeath.enemy.hp<=1e-8);
assert.ok(sunnyDeath.battle.units.filter(unit=>unit.side==='ally').every(unit=>
  unit.buffs.some(buff=>buff.name==='初吻❤天气晴 · 暴伤'&&buff.key==='critDmg'&&buff.value===.25&&buff.remaining===2)));
assert.ok(sunnyDeath.battle.log.some(event=>event.type==='mechanic'&&event.name==='魔法少女阵亡 · 天气退场技'&&event.weather==='Sun'));

const rainDeath=fixture(17);
receiveDamage(rainDeath.battle,rainDeath.battle.units[0],rainDeath.enemy,rainDeath.enemy.hp,'direct',{name:'lethal normal damage'});
assert.ok(rainDeath.enemy.hp<=1e-8);
assert.equal(rainDeath.battle.log.filter(event=>event.type==='damage'&&event.actor===rainDeath.enemy.id&&event.kind==='direct').length,5,
  'Rain deathrattle deals five random Thunder hits');
assert.equal(rainDeath.battle.log.filter(event=>event.type==='dot'&&event.actor===rainDeath.enemy.id&&event.name==='触电').length,5,
  'each Rain deathrattle hit independently attempts Shock');

const ordinary=fixture();
ordinary.enemy.distance=0;
assert.equal(stepBattle(ordinary.battle),true);
assert.ok(ordinary.battle.log.some(event=>event.type==='action'&&event.actor===ordinary.enemy.id&&event.key==='skill01'));

console.log('PF 20271/S2 Magical Girl Troupe checks: database roster/template, seven-hit basic, battle-entry Rain, Elation triggers, delay/laughter, and both weather deathrattles passed.');

const pheasantSource=scene.enemies.find(enemy=>enemy.childId===4062010);
assert.ok(pheasantSource,'PF 20271/S2 database lineup includes Ichor Memosprite: Pheasant');
const pheasant=ichorPheasant(ctx,{sceneEnemy:pheasantSource});
assert.deepEqual(validateEnemyActor(pheasant),[]);
assert.deepEqual(pheasant.actions.skill01.terms,[{scaling:'atk',multiplier:2.8}]);
assert.equal(pheasant.actions.skill01.toughness,1.2);
assert.equal(pheasant.enemyKit.resonanceEffectId,240620101);
assert.deepEqual(pheasant.enemyKit.aiSequence,[405201001],'the source AI mismatch remains visible in the actor record');

const sceneBattle=buildEndgameEncounter(ctx,strictParty(ctx),{mode:'pf',seasonId:2027,floorId:'20271',side:2});
assert.equal(sceneBattle.sceneReplay.enemyLineupComplete,true,'the full source roster is now constructible');
assert.equal(sceneBattle.sceneReplay.enemyBehaviorComplete,false,'AI skill-ID mismatch keeps the battle explicitly partial');
assert.ok(sceneBattle.endgameSpawnPlan.waves.flatMap(wave=>wave.units).some(unit=>unit.childId===4062010));

const pheasantOne=ichorPheasant(ctx,{sceneEnemy:pheasantSource,id:'pheasant-one'});
const pheasantTwo=ichorPheasant(ctx,{sceneEnemy:pheasantSource,id:'pheasant-two'});
const flock=createBattle({strict:false,maxAV:1000,sp:3,maxSP:9,seed:19,critMode:'noncrit',units:[...structuredClone(allies),pheasantOne,pheasantTwo]});
for(const unit of flock.units)unit.distance=10000;
const firstPheasant=flock.units.find(unit=>unit.id==='pheasant-one'),secondPheasant=flock.units.find(unit=>unit.id==='pheasant-two');
firstPheasant.distance=0;
assert.equal(stepBattle(flock),true);
assert.ok(firstPheasant.buffs.some(buff=>buff.tag==='ichorPheasantResonance'));
assert.ok(secondPheasant.buffs.some(buff=>buff.tag==='ichorPheasantResonance'),
  'Skill02 applies resonance to every on-field Pheasant');
secondPheasant.distance=0;
assert.equal(stepBattle(flock),true);
assert.ok(flock.log.some(event=>event.type==='action'&&event.actor===secondPheasant.id&&event.key==='skill01'));
assert.ok(flock.log.some(event=>event.type==='action'&&event.actor===firstPheasant.id&&event.kind==='extra'&&event.key==='skill01'),
  'another resonant Pheasant follows up after the attack');
assert.ok(flock.log.some(event=>event.type==='mechanic'&&event.name==='【罪血共鸣】协同啄食'));

console.log('PF 20271/S2 Pheasant checks: source roster construction, explicit AI mismatch, resonance application, and one non-recursive cooperative attack passed.');
