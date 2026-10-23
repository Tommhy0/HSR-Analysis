import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createContext } from '../core/ctx.mjs';
import { buildMonster } from '../core/enemy.mjs';
import { inspectEndgameTarget } from '../simulator/endgame-scenes.mjs';
import { buildEndgameEncounter } from '../simulator/endgame-battles.mjs';
import { createBattle, stepBattle, validateBattle } from '../simulator/engine.mjs';
import { strictParty } from '../simulator/party.mjs';

const ctx=createContext(JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url),'utf8')));
const inspected=inspectEndgameTarget(ctx,{mode:'anomaly',seasonId:10,floorId:'pre:2'});
assert.equal(inspected.stage.name,'骑士（三）');
assert.equal(inspected.stage.level,95);
assert.equal(inspected.stageHp.hardLevelGroup,3);
assert.deepEqual(inspected.enemies.map(enemy=>enemy.childId),[4053020,2023020,3024030]);
assert.deepEqual(inspected.enemies.map(enemy=>enemy.wave),[1,1,2]);
for(const [enemy,wave] of inspected.enemies.map((enemy,index)=>[enemy,inspected.waves[enemy.wave-1]])){
  const formula=buildMonster(ctx,{monsterId:enemy.monsterId,childId:enemy.childId,level:95,
    hardLevelGroup:3,eliteGroup:wave.eliteGroup});
  assert.equal(enemy.hp,formula.hp);
  assert.equal(enemy.atk,formula.atk);
  assert.equal(enemy.def,formula.def);
  assert.equal(enemy.speed,formula.speed);
}
const formulaHpTotal=inspected.enemies.reduce((sum,enemy)=>sum+enemy.hp,0);
assert.ok(Math.abs(formulaHpTotal-inspected.stageHp.estimatedHp)<.1,
  'per-enemy formula HP should reconcile to the stage estimate within one-decimal rounding');
assert.ok(inspected.waves.every(wave=>wave.calculatedHpTotal>0));
assert.ok(inspected.waves.every(wave=>wave.sourceHpEstimate<wave.calculatedHpTotal),
  'source per-wave estimate omits the hard-level multiplier');

const config=buildEndgameEncounter(ctx,strictParty(ctx),{mode:'anomaly',seasonId:10,floorId:'pre:2'});
assert.deepEqual(config.units.filter(unit=>unit.side==='enemy').map(unit=>unit.childId),[4053020,2023020,3024030]);
assert.deepEqual(config.units.filter(unit=>unit.side==='enemy').map(unit=>unit.wave),[1,1,2]);
assert.equal(config.sceneReplay.enemyLineupComplete,true);
assert.equal(config.sceneReplay.spawnRosterComplete,true);
assert.equal(config.sceneReplay.spawnMechanicsComplete,true);
assert.equal(config.sceneReplay.enemyBehaviorComplete,false);
assert.equal(config.sceneReplay.stageRulesComplete,false);
assert.ok(config.sceneReplay.omittedRules.some(note=>note.includes('幼蛰虫')));
assert.ok(validateBattle(config).length===0,validateBattle(config).join('\n'));

const battle=createBattle(config);
assert.equal(battle.units.filter(unit=>unit.side==='enemy'&&unit.active).length,2);
assert.equal(battle.units.find(unit=>unit.side==='enemy'&&unit.wave===2).active,false);
for(const unit of battle.units.filter(unit=>unit.side==='ally'))unit.distance=10000;
for(const unit of battle.units.filter(unit=>unit.side==='enemy'&&unit.wave===1))unit.distance=0;
assert.equal(stepBattle(battle),true);
assert.ok(battle.log.some(event=>event.type==='action'&&event.actor===battle.units.find(unit=>unit.side==='enemy'&&unit.wave===1).id));
for(const unit of battle.units.filter(unit=>unit.side==='enemy'&&unit.wave===1))unit.hp=0;
assert.equal(stepBattle(battle),true);
assert.equal(battle.units.find(unit=>unit.side==='enemy'&&unit.wave===2).active,true);

console.log('anomaly scenario source roster, formula panels, partial behavior status, and wave transition passed');
