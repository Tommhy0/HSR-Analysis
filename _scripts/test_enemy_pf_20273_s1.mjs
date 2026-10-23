import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createContext} from '../core/ctx.mjs';
import {inspectEndgameTarget} from '../simulator/endgame-scenes.mjs';
import {buildEndgameEncounter} from '../simulator/endgame-battles.mjs';
import {assistantGraffitiRusher,dreamjoltMrDomescreen,isEnemyMechanicRegistered,validateEnemyActor} from '../simulator/encounters.mjs';
import {createBattle,stepBattle,validateBattle} from '../simulator/engine.mjs';
import {strictParty} from '../simulator/party.mjs';

const ctx=createContext(JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url))));
const inspected=inspectEndgameTarget(ctx,{mode:'pf',seasonId:2027,floorId:'20273',side:1});
const tvSource=inspected.enemies.find(enemy=>enemy.childId===3002010);
const rusherSource=inspected.enemies.find(enemy=>enemy.childId===5012050);
assert.ok(tvSource,'PF 20273/S1 source lineup includes Dreamjolt Troupe Mr. Domescreen');
assert.ok(rusherSource,'PF 20273/S1 source lineup includes Assistant Graffiti: Rusher');

const tv=dreamjoltMrDomescreen(ctx,{sceneEnemy:tvSource,id:'tv'});
const rusher=assistantGraffitiRusher(ctx,{sceneEnemy:rusherSource,id:'rusher'});
assert.deepEqual(validateEnemyActor(tv),[]);
assert.deepEqual(validateEnemyActor(rusher),[]);
assert.equal(isEnemyMechanicRegistered(3002010),true);
assert.equal(isEnemyMechanicRegistered(5012050),true);
assert.equal(tv.panel.hp,tvSource.hp);
assert.equal(rusher.panel.hp,rusherSource.hp);

const scene=buildEndgameEncounter(ctx,strictParty(ctx),{mode:'pf',seasonId:2027,floorId:'20273',side:1});
assert.equal(scene.sceneReplay.enemyLineupComplete,true);
assert.equal(scene.sceneReplay.enemyBehaviorRegistered,true);
assert.equal(scene.sceneReplay.enemyBehaviorComplete,false,
  'source gaps such as TV channel hash and Wind Shear status timing remain explicit');
assert.deepEqual(validateBattle(scene),[]);
assert.ok(scene.endgameSpawnPlan.waves.some(wave=>wave.units.some(unit=>unit.childId===3002010)));
assert.ok(scene.endgameSpawnPlan.waves.some(wave=>wave.units.some(unit=>unit.childId===5012050)));

function probeParty(){
  return structuredClone(strictParty(ctx).units.filter(unit=>unit.side==='ally')).map((unit,index)=>{
    delete unit.kit;delete unit.characterId;delete unit.gear;delete unit.memospriteOwner;
    unit.panel={hp:1e9,atk:0,def:0,speed:1,critRate:0,critDmg:0,effectRes:0,energyRegen:1,elemDmg:{},baseStats:{hp:1e9,atk:0,def:0}};
    unit.hp=1e9;unit.energy=[10,50,30,20][index]??0;unit.energyMax=100;
    unit.buffs=[];unit.shields=[];unit.dots=[];unit.resources={};unit.actions={basic:{name:'probe',type:'Normal',element:'Physical',target:'single',terms:[]}};
    unit.policy={autoUltimate:false,basicOnly:true};unit.standardBreak=false;
    return unit;
  });
}
function battleWith(enemy){
  const battle=createBattle({strict:false,maxAV:1000,sp:3,maxSP:9,seed:31,critMode:'noncrit',units:[...probeParty(),enemy]});
  for(const unit of battle.units)unit.distance=10000;
  const liveEnemy=battle.units.find(unit=>unit.id===enemy.id);
  liveEnemy.distance=0;
  return {battle,enemy:liveEnemy,party:battle.units.filter(unit=>unit.side==='ally')};
}

// The TV starts in Shock, drains 20% max Energy, then one incoming player
// action flips it to Surprise. Its AI restores half of one target's max Energy
// before switching back to Shock.
const tvBattle=battleWith(dreamjoltMrDomescreen(ctx,{sceneEnemy:tvSource,id:'tv-probe'}));
for(const unit of tvBattle.party)unit.energy=100;
assert.equal(stepBattle(tvBattle.battle),true);
assert.equal(tvBattle.battle.log.find(event=>event.type==='action'&&event.actor==='tv-probe').key,'skill02');
assert.deepEqual(tvBattle.party.map(unit=>unit.energy),[80,80,80,80]);
tvBattle.enemy.broken=false;
tvBattle.battle.activeAction={sequence:9001,actor:tvBattle.party[0].id,key:'basic',kind:'normal'};
tvBattle.battle.rules.afterDamage(tvBattle.battle,tvBattle.party[0],tvBattle.enemy,'direct');
assert.equal(tvBattle.enemy.resources['圆幕先生FlopSide'],1);
tvBattle.battle.rules.afterDamage(tvBattle.battle,tvBattle.party[0],tvBattle.enemy,'direct');
assert.equal(tvBattle.enemy.resources['圆幕先生FlopSide'],1,'a multihit action flips the TV only once');
tvBattle.party[0].energy=10;tvBattle.party[1].energy=50;tvBattle.party[2].energy=30;tvBattle.party[3].energy=20;
tvBattle.enemy.distance=0;
assert.equal(stepBattle(tvBattle.battle),true);
const surpriseAction=tvBattle.battle.log.filter(event=>event.type==='action'&&event.actor==='tv-probe').at(-1);
assert.equal(surpriseAction.key,'skill01');
assert.deepEqual(surpriseAction.targets,[tvBattle.party[0].id]);
assert.equal(tvBattle.party[0].energy,60);
tvBattle.enemy.distance=0;
assert.equal(stepBattle(tvBattle.battle),true);
assert.equal(tvBattle.battle.log.filter(event=>event.type==='action'&&event.actor==='tv-probe').at(-1).key,'skill03');
assert.equal(tvBattle.enemy.resources['圆幕先生FlopSide'],-1);
assert.equal(tvBattle.enemy.resources['圆幕先生AIFlag'],0);

// The Rusher uses the 2x single Wind hit. Repeated hits by the same source add
// Wind Shear up to its AI-indexed five layers while refreshing its duration.
const rusherBattle=battleWith(assistantGraffitiRusher(ctx,{sceneEnemy:rusherSource,id:'rusher-probe'}));
const liveRusher=rusherBattle.enemy;
liveRusher.actions.skill01.targetId=rusherBattle.party[0].id;
for(let i=0;i<6;i++){
  liveRusher.distance=0;
  assert.equal(stepBattle(rusherBattle.battle),true);
}
const hitEvents=rusherBattle.battle.log.filter(event=>event.type==='damage'&&event.actor===liveRusher.id&&event.kind==='direct');
assert.equal(hitEvents.length,6);
assert.equal(rusherBattle.battle.log.filter(event=>event.type==='action'&&event.actor===liveRusher.id)
  .every(event=>event.key==='skill01'&&event.name==='快！再快点！'),true);
const windShear=rusherBattle.party[0].dots.find(effect=>effect.tag==='assistantGraffitiWindShear');
assert.ok(windShear);
assert.equal(windShear.stacks,5);
assert.equal(windShear.remaining,2);
assert.equal(windShear.terms[0].multiplier,2.5);
assert.equal(windShear.snapshotAtk,liveRusher.panel.atk);
assert.ok(rusherBattle.battle.log.some(event=>event.type==='mechanic'&&event.name==='【快！再快点！】施加 / 叠加风化'&&event.layers===5));

console.log('PF 20273/S1 checks: source lineup and panels, explicit partial status, TV channel/energy loop, once-per-action flip, Rusher damage and five-layer Wind Shear cap passed.');
