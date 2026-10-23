import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createContext} from '../core/ctx.mjs';
import {presentInebriatedInRevelry,silvermaneCannoneer,validateEnemyActor} from '../simulator/encounters.mjs';
import {createBattle,stepBattle} from '../simulator/engine.mjs';
import {inspectEndgameTarget} from '../simulator/endgame-scenes.mjs';
import {buildEndgameEncounter} from '../simulator/endgame-battles.mjs';
import {strictParty} from '../simulator/party.mjs';

const ctx=createContext(JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url))));
const scene=inspectEndgameTarget(ctx,{mode:'pf',seasonId:2027,floorId:'20273',side:2});
const source=scene.enemies.find(enemy=>enemy.childId===1002030);
assert.ok(source,'PF 20273/S2 database lineup includes Silvermane Cannoneer');
const template=silvermaneCannoneer(ctx,{sceneEnemy:source});
assert.deepEqual(validateEnemyActor(template),[]);
assert.equal(template.actions.skill01.terms[0].multiplier,1.3);
assert.equal(template.actions.skill01.target,'blast');
assert.equal(template.actions.skill03.terms[0].multiplier,2.2);
assert.equal(template.enemyKit.skillP01Id,100203003);

const revelrySource=scene.enemies.find(enemy=>enemy.childId===300305007);
assert.ok(revelrySource,'PF 20273/S2 database lineup includes Present Inebriated in Revelry');
const revelry=presentInebriatedInRevelry(ctx,{sceneEnemy:revelrySource});
assert.deepEqual(validateEnemyActor(revelry),[]);
assert.deepEqual([revelry.panel.hp,revelry.panel.speed,revelry.toughnessMax],
  [2237284.3,132,100],'actor uses the sourced PF stage panel');
assert.deepEqual(revelry.enemyKit.skill01Params,[1,2,1.2,3,3]);
assert.equal(revelry.actions.skill05.name,'为你洗去一切罪');
assert.equal(revelry.enemyMechanicNotes.length,3,'source gaps stay visible');
const completeRoster=buildEndgameEncounter(ctx,strictParty(ctx),{mode:'pf',seasonId:2027,floorId:'20273',side:2});
assert.equal(completeRoster.sceneReplay.enemyLineupComplete,true);
assert.equal(completeRoster.sceneReplay.enemyBehaviorRegistered,true);
assert.equal(completeRoster.sceneReplay.enemyBehaviorComplete,false,
  'an incomplete mechanic remains explicitly incomplete despite a buildable roster');
assert.ok(completeRoster.endgameSpawnPlan.waves.some(wave=>wave.units.some(unit=>unit.childId===300305007)));

const allies=structuredClone(strictParty(ctx).units.filter(unit=>unit.side==='ally'));
for(const ally of allies){
  delete ally.kit;delete ally.characterId;delete ally.gear;delete ally.memospriteOwner;
  ally.panel={hp:1e9,atk:0,def:0,speed:1,critRate:0,critDmg:0,effectRes:0,elemDmg:{},baseStats:{hp:1e9,atk:0,def:0}};
  ally.hp=1e9;ally.energy=0;ally.energyMax=0;ally.buffs=[];ally.shields=[];ally.dots=[];ally.resources={};
  ally.actions={basic:{name:'probe',type:'Normal',element:'Physical',target:'single',terms:[]}};
  ally.policy={autoUltimate:false,basicOnly:true};ally.standardBreak=false;
}
const gunner=silvermaneCannoneer(ctx,{sceneEnemy:source,id:'gunner'});
const supported=structuredClone(allies[0]);
supported.id='supported-enemy';supported.name='受支援敌人';supported.side='enemy';
supported.actions={basic:{name:'支援目标攻击',type:'Normal',element:'Physical',target:'single',terms:[{scaling:'atk',multiplier:1}],hitEnergy:0}};
supported.panel.atk=200;supported.panel.baseStats.atk=200;
const battle=createBattle({strict:false,maxAV:1000,sp:3,maxSP:9,seed:29,critMode:'noncrit',units:[...allies,gunner,supported]});
for(const unit of battle.units)unit.distance=10000;
const liveGunner=battle.units.find(unit=>unit.id==='gunner'),liveSupported=battle.units.find(unit=>unit.id==='supported-enemy');
liveGunner.distance=0;
assert.equal(stepBattle(battle),true);
assert.ok(liveSupported.buffs.some(effect=>effect.tag==='silvermaneCannoneerSupport'),
  'Skill02 marks one same-side teammate for support');
liveSupported.distance=0;
assert.equal(stepBattle(battle),true);
assert.ok(battle.log.some(event=>event.type==='action'&&event.actor===liveGunner.id&&event.key==='skill03'&&event.kind==='followup'),
  'the gunner triggers one follow-up after the marked ally attacks');
assert.ok(battle.log.some(event=>event.type==='mechanic'&&event.name==='【掩护支援】协同追加攻击'));
assert.ok(!liveSupported.buffs.some(effect=>effect.tag==='silvermaneCannoneerSupport'),
  'the source action consumes the one-trigger support marker');

const revelryActor=presentInebriatedInRevelry(ctx,{sceneEnemy:revelrySource,id:'revelry'});
const battle2=createBattle({strict:false,maxAV:1000,sp:3,maxSP:9,seed:29,critMode:'noncrit',units:[...allies,revelryActor]});
for(const unit of battle2.units)unit.distance=10000;
const liveRevelry=battle2.units.find(unit=>unit.id==='revelry');
for(const key of ['skill02','skill04','skill05']){
  liveRevelry.distance=0;
  assert.equal(stepBattle(battle2),true);
  const action=battle2.log.filter(event=>event.type==='action'&&event.actor===liveRevelry.id).at(-1);
  assert.equal(action.key,key,'fixed AI flag route chooses the sourced DoT / charge / burst action');
}
assert.ok(battle2.log.some(event=>event.type==='mechanic'&&event.name==='【为你洗去一切罪】引爆并清除持续伤害'&&event.resolved>0),
  'Skill05 immediately resolves stored DoTs');
assert.ok(battle2.units.filter(unit=>unit.side==='ally').every(unit=>unit.dots.length===0),
  'Skill05 clears DoTs on the entire allied team');
assert.ok(battle2.log.some(event=>event.type==='damage'&&event.kind==='dot'),
  'Skill05 produces actual damage events for stored DoTs');

console.log('PF 20273/S2 checks: complete source roster build, explicit partial status, Cannoneer support/follow-up, and Present Inebriated source AI/DoT charge/burst path passed.');
