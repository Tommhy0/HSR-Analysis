import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createContext} from '../core/ctx.mjs';
import {createBattle,validateBattle} from '../simulator/engine.mjs';
import {blackTideBlade,fictionalEnsemble,validateEnemyActor} from '../simulator/encounters.mjs';
import {buildEndgameEncounter} from '../simulator/endgame-battles.mjs';
import {inspectEndgameTarget} from '../simulator/endgame-scenes.mjs';
import {strictParty} from '../simulator/party.mjs';

const ctx=createContext(JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url))));
const scene=inspectEndgameTarget(ctx,{mode:'pf',seasonId:2027,floorId:'20272',side:2});
assert.equal(scene.behaviorComplete,true,'PF 2027 20272/S2 source lineup should now have a registered actor for every template');
assert.deepEqual(scene.infiniteWavePlans.map(w=>[w.gateCandidateChildId,w.waveControllerChildId]),[
  [null,8003060],[800301020,null],[403301002,null],
]);
const source=scene.enemies.find(e=>e.childId===4032010);
assert.ok(source,'the second infinite-wave roster must include the Tide-Eroded Blade');
assert.deepEqual([source.level,source.hp,source.speed,source.toughness],[65,49453.7,100,30]);
const blade=blackTideBlade(ctx,{sceneEnemy:source,id:'blade'});
assert.deepEqual(validateEnemyActor(blade),[]);
assert.deepEqual(blade.actions.skill01.terms,[
  {scaling:'atk',multiplier:3.5},{scaling:'atk',multiplier:2.4,target:'adjacent'},
]);
assert.equal(blade.enemyMechanicNotes.length,1,'the Erosion gap remains explicit');

const config=buildEndgameEncounter(ctx,strictParty(ctx),{mode:'pf',seasonId:2027,floorId:'20272',side:2});
assert.equal(config.sceneReplay.enemyLineupComplete,true);
assert.equal(config.sceneReplay.enemyBehaviorRegistered,true);
assert.equal(config.sceneReplay.enemyBehaviorComplete,false,'partial Erosion / passive mechanics must not be advertised as complete');
assert.equal(config.endgameSpawnPlan.waves.length,3);
assert.equal(config.endgameSpawnPlan.waves[0].gateUnitId,undefined,'the unselectable controller is not a kill gate');
assert.equal(config.endgameSpawnPlan.waves[1].gateUnitId,'scene-pf-2027-20272-s2-p2-n3');
assert.ok(config.endgameSpawnPlan.waves[1].units.some(u=>u.enemyKit?.id===4032010));
const battle=createBattle(config);
assert.deepEqual(validateBattle(config),[]);
const controller=battle.units.find(u=>u.enemyKit?.waveController);
assert.ok(controller?.unselectable&&controller.noAction);
assert.equal(battle.units.filter(u=>u.side==='enemy'&&u.active&&u.hp>0).length,5,'the controller occupies one of five source field slots after battle-start effects');

console.log('PF 20272/S2 checks: local SQLite roster and panels, sourced blast attack, no-action wave controller, three-wave scene build, and explicit Erosion gap passed.');
