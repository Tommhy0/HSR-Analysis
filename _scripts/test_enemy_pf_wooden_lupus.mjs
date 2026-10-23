import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createContext} from '../core/ctx.mjs';
import {createBattle,stepBattle,validateBattle} from '../simulator/engine.mjs';
import {validateEnemyActor,woodenLupus} from '../simulator/encounters.mjs';
import {buildEndgameEncounter} from '../simulator/endgame-battles.mjs';
import {inspectEndgameTarget} from '../simulator/endgame-scenes.mjs';
import {strictParty} from '../simulator/party.mjs';

const ctx=createContext(JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url))));
const scene=inspectEndgameTarget(ctx,{mode:'pf',seasonId:2027,floorId:'20274',side:2});
const sourceRows=scene.enemies.filter(enemy=>enemy.childId===202205004);
assert.equal(sourceRows.length,2,'the SQLite scene table stores both infinite-wave groups');
assert.deepEqual(sourceRows.map(row=>[row.level,row.hp,row.speed,row.toughness,row.spawnCount]),[
  [85,175085.1,120,30,13],[85,1610783.3,120,30,20],
]);
assert.equal(scene.infiniteWavePlans[0].templates.find(row=>row.childId===202205004)?.count,13);
assert.ok(!scene.behaviorGaps.includes('丰饶灵兽•奎木'));
assert.deepEqual(scene.behaviorGaps,[],
  'the PF 20274/S2 lineup now has a sourced actor for every database template');

const actor=woodenLupus(ctx,{sceneEnemy:sourceRows[0],id:'wooden-lupus'});
assert.deepEqual(validateEnemyActor(actor),[]);
assert.deepEqual(actor.actions.skill01.terms,[{scaling:'atk',multiplier:2}]);
assert.equal(actor.actions.skill01.hitEnergy,10);
assert.equal(actor.enemyKit.skill02Params[0],.8);
assert.equal(actor.enemyMechanicNotes.length,2,'Shock and the summoned Shadow remain explicit gaps');

const party=strictParty(ctx),config={...party,units:[...party.units,actor],waveMode:'continuous',maxAV:220};
assert.deepEqual(validateBattle(config),[]);
const battle=createBattle(config),wolf=battle.units.find(unit=>unit.id===actor.id);
for(const unit of battle.units)unit.distance=10000;
wolf.distance=0;
assert.equal(stepBattle(battle),true);
assert.ok(battle.log.some(event=>event.type==='action'&&event.actor===wolf.id&&event.key==='skill01'));
const pfScene=buildEndgameEncounter(ctx,party,{mode:'pf',seasonId:2027,floorId:'20274',side:2});
assert.equal(pfScene.sceneReplay.enemyLineupComplete,true);
assert.equal(pfScene.sceneReplay.enemyBehaviorRegistered,true);
assert.equal(pfScene.sceneReplay.enemyBehaviorComplete,false,'lupus and new PF boss mechanics remain partial');
assert.deepEqual(validateBattle(pfScene),[]);
console.log('PF Wooden Lupus checks: SQLite infinite-wave groups and panels, common AI attack, source-based Lightning multiplier, explicit mechanic gaps, and newly buildable 20274/S2 scene passed.');
