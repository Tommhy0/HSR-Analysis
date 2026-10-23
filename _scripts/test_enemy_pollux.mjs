import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createContext} from '../core/ctx.mjs';
import {buildMonster} from '../core/enemy.mjs';
import {inspectEndgameTarget} from '../simulator/endgame-scenes.mjs';
import {buildEndgameEncounter} from '../simulator/endgame-battles.mjs';
import {createBattle,stepBattle,validateBattle} from '../simulator/engine.mjs';
import {strictParty} from '../simulator/party.mjs';
import {isEnemyMechanicRegistered,validateEnemyActor} from '../simulator/encounters.mjs';

const ctx=createContext(JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url),'utf8')));
const inspected=inspectEndgameTarget(ctx,{mode:'anomaly',seasonId:10,floorId:'pre:1'});
assert.equal(inspected.stage.name,'骑士（二）');
assert.deepEqual(inspected.enemies.map(enemy=>enemy.childId),[5013050,5013070,4014030]);
assert.deepEqual(inspected.enemies.map(enemy=>enemy.wave),[1,1,2]);
assert.equal(isEnemyMechanicRegistered(4014030),true);
for(const [enemy,wave] of inspected.enemies.map((enemy,index)=>[enemy,inspected.waves[enemy.wave-1]])){
  const formula=buildMonster(ctx,{monsterId:enemy.monsterId,childId:enemy.childId,level:95,
    hardLevelGroup:3,eliteGroup:wave.eliteGroup});
  assert.equal(enemy.hp,formula.hp);
  assert.equal(enemy.atk,formula.atk);
  assert.equal(enemy.def,formula.def);
}

const config=buildEndgameEncounter(ctx,strictParty(ctx),{mode:'anomaly',seasonId:10,floorId:'pre:1'});
assert.deepEqual(config.units.filter(unit=>unit.side==='enemy').map(unit=>unit.childId),[5013050,5013070,4014030]);
assert.equal(config.sceneReplay.enemyLineupComplete,true);
assert.equal(config.sceneReplay.enemyBehaviorComplete,false);
assert.ok(config.sceneReplay.omittedRules.some(note=>note.includes('衰亡伤害')));
assert.ok(config.sceneReplay.omittedRules.some(note=>note.includes('AI 索引 skillSequence 为空')));
const pollux=config.units.find(unit=>unit.childId===4014030);
assert.deepEqual(validateEnemyActor(pollux),[]);
assert.deepEqual(validateBattle(config),[]);

function polluxBattle(action){
  const c=structuredClone(config);
  c.units=c.units.filter(unit=>unit.side==='ally'||unit.childId===4014030);
  const actor=c.units.find(unit=>unit.childId===4014030);
  actor.wave=1;actor.actions.skill01={...actor.actions.skill01,...action};
  const battle=createBattle(c);
  for(const unit of battle.units)unit.distance=unit.side==='enemy'?0:1e9;
  return {battle,actor:battle.units.find(unit=>unit.childId===4014030)};
}

const shared=polluxBattle({name:'分摊验证',target:'all',terms:[{scaling:'atk',multiplier:8}],shareDamageAcrossTargets:true});
assert.equal(stepBattle(shared.battle),true);
const sharedHits=shared.battle.log.filter(event=>event.type==='damage'&&event.actor===shared.actor.id);
assert.equal(sharedHits.length,4);
assert.ok(sharedHits.every(event=>event.share===.25));

const random=polluxBattle({name:'随机目标验证',target:'all',randomTargets:3,terms:[]});
assert.equal(stepBattle(random.battle),true);
const randomAction=random.battle.log.find(event=>event.type==='action'&&event.actor===random.actor.id);
assert.equal(randomAction.targets.length,3);
assert.equal(new Set(randomAction.targets).size,3);

console.log('anomaly knight (II) source roster, Pollux formula panels, explicit mechanics gaps, shared damage, and random target selection passed');
