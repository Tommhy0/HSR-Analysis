import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createContext} from '../core/ctx.mjs';
import {inspectEndgameTarget} from '../simulator/endgame-scenes.mjs';
import {buildEndgameEncounter} from '../simulator/endgame-battles.mjs';
import {battleFrame,createBattle,receiveDamage,stepBattle,validateBattle} from '../simulator/engine.mjs';

const ctx=createContext(JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url))));
const panel={hp:100000,atk:100,def:0,speed:1,critRate:0,critDmg:0,energyRegen:1,elemDmg:{},baseStats:{hp:100000,atk:100,def:0}};
const party={sp:3,maxSP:5,maxAV:280,critMode:'noncrit',seed:19,units:Array.from({length:4},(_,i)=>({
  id:`dummy-${i+1}`,name:`占位队员${i+1}`,side:'ally',level:80,element:'Physical',aggro:i===0?100:1,
  panel:structuredClone(panel),energy:0,energyMax:100,
  actions:{basic:{name:'普攻',type:'Normal',element:'Physical',target:'single',terms:[{scaling:'atk',multiplier:1}],hitEnergy:10,toughness:0}},
  policy:{basicOnly:true,autoUltimate:false},
}))};

for(const [floorId,childId] of [['30221',200401401],['30222',200401402],['30223',200401403],['30224',200401404]]){
  const source=inspectEndgameTarget(ctx,{mode:'as',seasonId:3022,floorId,side:1});
  const scene=buildEndgameEncounter(ctx,party,{mode:'as',seasonId:3022,floorId,side:1});
  const boss=scene.units.find(u=>u.side==='enemy');
  assert.equal(source.enemies.length,1);
  assert.equal(source.enemies[0].childId,childId);
  assert.equal(boss.childId,childId);
  assert.equal(boss.panel.hp,source.enemies[0].hp);
  assert.equal(boss.panel.speed,source.enemies[0].speed);
  assert.equal(boss.hpCount,source.enemies[0].hpCount);
  assert.deepEqual(boss.phaseRatios,source.enemies[0].phaseRatios);
  assert.equal(scene.sceneReplay.enemyBehaviorRegistered,true);
  assert.equal(scene.sceneReplay.enemyBehaviorComplete,false,'未还原召唤、揭晓与触电追击必须继续显式显示为未完成');
  assert.deepEqual(validateBattle(scene),[]);
}

const scene=buildEndgameEncounter(ctx,party,{mode:'as',seasonId:3022,floorId:'30224',side:1});
const boss=scene.units.find(u=>u.side==='enemy'),battle=createBattle(scene),runtimeBoss=battle.units.find(u=>u.id===boss.id);
assert.equal(runtimeBoss.hpCount,2);
assert.equal(runtimeBoss.hpPhase,1);
assert.equal(runtimeBoss.hp,boss.panel.hp);
assert.deepEqual(validateBattle(scene),[]);

// The stage row stores per-bar HP. Lethal damage closes only the current bar,
// discards overflow, restores the next sourced bar and resets Kafka's AI flag.
const ally=battle.units.find(u=>u.side==='ally');
runtimeBoss.hp=1;runtimeBoss.toughness=0;runtimeBoss.broken=true;runtimeBoss.resources['支配者AIFlag']=3;
receiveDamage(battle,ally,runtimeBoss,10,'true');
assert.equal(runtimeBoss.active,true);
assert.equal(runtimeBoss.hpPhase,2);
assert.equal(runtimeBoss.hp,boss.panel.hp*boss.phaseRatios[1]);
assert.equal(runtimeBoss.toughness,runtimeBoss.toughnessMax);
assert.equal(runtimeBoss.broken,false);
assert.equal(runtimeBoss.resources['支配者AIFlag'],1);
assert.ok(battle.log.some(e=>e.type==='mechanic'&&e.name==='切换生命阶段'&&e.fromPhase===1&&e.toPhase===2));
assert.ok(battle.log.some(e=>e.type==='mechanic'&&e.name==='支配者阶段切换'));
assert.equal(battleFrame(battle).units.find(u=>u.id===runtimeBoss.id).maxHp,boss.panel.hp*boss.phaseRatios[1]);

// Phase 1 is AIFlag 1 -> 2 -> 3: two-part single hit, blast, then immediate Charm.
const sequenceBattle=createBattle(scene),sequenceBoss=sequenceBattle.units.find(u=>u.side==='enemy');
for(const u of sequenceBattle.units.filter(u=>u.side==='ally'))u.distance=10000;
for(const expected of ['skill01','skill02','skill05']){
  sequenceBoss.distance=0;
  assert.equal(stepBattle(sequenceBattle),true);
  const action=sequenceBattle.log.filter(e=>e.type==='action'&&e.actor===sequenceBoss.id).at(-1);
  assert.equal(action.key,expected);
}
const skill02Action=sequenceBattle.log.filter(e=>e.type==='action'&&e.actor===sequenceBoss.id&&e.key==='skill02').at(-1);
const allyOrder=sequenceBattle.units.filter(u=>u.side==='ally'),mainIndex=allyOrder.findIndex(u=>u.id===skill02Action.targets[0]);
const expectedSkill02Hits=3+(mainIndex>0?1:0)+(mainIndex<allyOrder.length-1?1:0);
const bossDamageEvents=sequenceBattle.log.filter(e=>e.type==='damage'&&e.actor===sequenceBoss.id);
assert.equal(bossDamageEvents.length,2+expectedSkill02Hits,
  `Skill01 has two half hits and Skill02 has three main hits plus one single hit per adjacent target: ${JSON.stringify(bossDamageEvents.map(e=>({name:e.name,target:e.target,damage:e.damage})))}`);
assert.ok(sequenceBattle.units.some(u=>u.side==='ally'&&u.buffs.some(e=>e.control==='charm')));
assert.equal(stepBattle(sequenceBattle),true);
assert.ok(sequenceBattle.log.some(e=>e.type==='mechanic'&&e.name==='CharmUseSkill · 同伴攻击'));
assert.ok(sequenceBattle.log.some(e=>e.type==='damage'&&e.actor!==sequenceBoss.id&&e.target!==sequenceBoss.id));

console.log('Soulhook Sovereign: four sourced AS variants, per-bar HP, phase-1 AI, Shock and Charm checks passed; known gaps remain explicit.');
