import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createContext} from '../core/ctx.mjs';
import {inspectEndgameTarget} from '../simulator/endgame-scenes.mjs';
import {buildEndgameEncounter} from '../simulator/endgame-battles.mjs';
import {createBattle,stepBattle,validateBattle} from '../simulator/engine.mjs';
import {strictParty} from '../simulator/party.mjs';
import {isEnemyMechanicRegistered,validateEnemyActor} from '../simulator/encounters.mjs';

const ctx=createContext(JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url),'utf8')));
const scene=inspectEndgameTarget(ctx,{mode:'anomaly',seasonId:10,floorId:'pre:0'});
assert.equal(scene.stage.name,'骑士（一）');
assert.deepEqual(scene.enemies.map(enemy=>enemy.childId),[5023010,5013040,5014020]);
assert.deepEqual(scene.enemies.map(enemy=>enemy.wave),[1,1,2]);
for(const id of [5023010,5014020])assert.equal(isEnemyMechanicRegistered(id),true);
const config=buildEndgameEncounter(ctx,strictParty(ctx),{mode:'anomaly',seasonId:10,floorId:'pre:0'});
assert.deepEqual(config.units.filter(unit=>unit.side==='enemy').map(unit=>unit.childId),[5023010,5013040,5014020]);
assert.equal(config.sceneReplay.enemyLineupComplete,true);
assert.equal(config.sceneReplay.enemyBehaviorComplete,false);
assert.equal(config.sceneReplay.spawnRosterComplete,true);
for(const enemy of config.units.filter(unit=>unit.side==='enemy'))assert.deepEqual(validateEnemyActor(enemy),[]);
assert.deepEqual(validateBattle(config),[]);

function isolated(enemyId,flagPatch={},sp=3){
  const source=config.units.find(unit=>unit.side==='enemy'&&unit.childId===enemyId);
  const party=config.units.filter(unit=>unit.side==='ally').map(unit=>structuredClone(unit));
  for(const ally of party){ally.panel.hp=1e9;ally.hp=1e9;ally.distance=1e9;}
  const actor=structuredClone(source);actor.distance=0;actor.wave=1;
  const battle=createBattle({...config,units:[...party,actor],sp});
  for(const unit of battle.units)if(unit.side==='ally'){unit.panel.hp=1e9;unit.hp=1e9;unit.distance=1e9;}
  const liveActor=battle.units.find(unit=>unit.side==='enemy');liveActor.distance=0;Object.assign(liveActor.resources,flagPatch);
  return {battle,actor:liveActor};
}

const joy=isolated(5023010,{'乐变化天人AIFlag':3});
joy.actor.enemyKit.blissChance=1;
assert.equal(stepBattle(joy.battle),true);
const joyAction=joy.battle.log.find(event=>event.type==='action'&&event.actor===joy.actor.id);
const joyHits=joy.battle.log.filter(event=>event.type==='damage'&&event.actor===joy.actor.id);
assert.equal(joyAction.key,'skill02');
assert.equal(joyHits.length,3);
assert.ok(joyHits.every(event=>event.formula.some(part=>part.value>0)));
assert.ok(joy.battle.units.filter(unit=>unit.side==='ally').some(unit=>unit.buffs.some(effect=>effect.tag==='joyAscendantBliss')));

const joyRotation=isolated(5023010),joyKeys=[];
for(let i=0;i<5;i++){if(i)joyRotation.actor.distance=0;assert.equal(stepBattle(joyRotation.battle),true);
  joyKeys.push(joyRotation.battle.log.filter(event=>event.type==='action'&&event.actor===joyRotation.actor.id).at(-1).key);}
assert.deepEqual(joyKeys,['skill01','skill02','skill02','skill03','skill04']);

const spiral=isolated(5023010,{'乐变化天人AIFlag':5});
const marked=spiral.battle.units.find(unit=>unit.side==='ally');
marked.buffs.push({type:'buff',id:spiral.actor.id+':bliss-test',name:'极乐',key:'marker',value:0,source:spiral.actor.id,
  remaining:null,tickOwner:marked.id,tickAt:'end',appliedTurn:0,tag:'joyAscendantBliss',debuff:true});
const beforeSP=spiral.battle.sp;
assert.equal(stepBattle(spiral.battle),true);
assert.equal(spiral.battle.log.find(event=>event.type==='action'&&event.actor===spiral.actor.id).key,'skill04');
assert.ok(!marked.buffs.some(effect=>effect.tag==='joyAscendantBliss'));
assert.ok(spiral.battle.log.some(event=>event.type==='delay'&&event.actor===marked.id));
assert.equal(spiral.battle.sp,Math.max(0,beforeSP-1));

const pom=isolated(5014020,{'帕姆王AI阶段':2,'帕姆王AIFlag':5});
assert.equal(stepBattle(pom.battle),true);
const pomAction=pom.battle.log.find(event=>event.type==='action'&&event.actor===pom.actor.id);
const pomHits=pom.battle.log.filter(event=>event.type==='damage'&&event.actor===pom.actor.id);
assert.equal(pomAction.key,'skill06');
assert.equal(pomHits.length,44); // 11 sourced hit calls × four allies
const targetHitGroups=pom.battle.units.filter(unit=>unit.side==='ally').map(ally=>pomHits.filter(event=>event.target===ally.id));
assert.ok(targetHitGroups.every(hits=>hits.length===11),'each ally receives all 11 source hit segments');
for(const hits of targetHitGroups){
  assert.ok(hits.slice(1,10).every(hit=>Math.abs(hit.damage-hits[0].damage)<1e-8),'first ten 5% shares are equal');
  assert.ok(Math.abs(hits[10].damage/hits[0].damage-10)<1e-8,'last 50% hit is ten times one 5% share');
}
const pomBasic=isolated(5014020);
assert.equal(stepBattle(pomBasic.battle),true);
const basicHit=pomBasic.battle.log.find(event=>event.type==='damage'&&event.actor===pomBasic.actor.id);
assert.equal(pomBasic.battle.log.find(event=>event.type==='action'&&event.actor===pomBasic.actor.id).key,'skill01');
const sameTargetMultiHit=pomHits.filter(event=>event.target===basicHit.target).reduce((sum,event)=>sum+event.damage,0);
assert.ok(Math.abs(sameTargetMultiHit/basicHit.damage-5/3)<1e-8,'11-hit Skill06 totals 5x attack, not 55x; compared against Skill01 at 3x');

const pomRotation=isolated(5014020),pomKeys=[];
for(let i=0;i<4;i++){if(i)pomRotation.actor.distance=0;assert.equal(stepBattle(pomRotation.battle),true);
  pomKeys.push(pomRotation.battle.log.filter(event=>event.type==='action'&&event.actor===pomRotation.actor.id).at(-1).key);}
assert.deepEqual(pomKeys,['skill01','skill03','skill01','skill02']);

console.log('anomaly pre:0 SQLite roster, source-derived enemy panels, Joy Ascendant random multi-hit/Bliss, and Pom King 11-hit total multiplier passed');
