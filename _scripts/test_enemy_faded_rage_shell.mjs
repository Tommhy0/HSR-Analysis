import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createContext} from '../core/ctx.mjs';
import {inspectEndgameTarget} from '../simulator/endgame-scenes.mjs';
import {buildEndgameEncounter} from '../simulator/endgame-battles.mjs';
import {fadedRageShell,validateEnemyActor} from '../simulator/encounters.mjs';
import {strictParty} from '../simulator/party.mjs';
import {simulateBattle,validateBattle} from '../simulator/engine.mjs';

const ctx=createContext(JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url))));
const scene=inspectEndgameTarget(ctx,{mode:'moc',seasonId:1036,floorId:'5504',side:2});
assert.equal(scene.behaviorComplete,true);
const source=scene.enemies.find(e=>e.childId===3013010);
assert.ok(source,'MoC 1036 floor 5504 side 2 should include Shell of Faded Rage');
assert.equal(source.hp,172645.1);
assert.equal(source.speed,121);
assert.equal(source.toughness,120);
assert.deepEqual(source.weakness,['Thunder','Quantum','Imaginary']);

const actor=fadedRageShell(ctx,{sceneEnemy:source,id:'faded-rage-shell'});
assert.deepEqual(validateEnemyActor(actor),[]);
assert.equal(actor.panel.hp,source.hp);
assert.equal(actor.panel.effectRes,source.statusRes/100);
assert.equal(actor.actions.skill01.terms[0].multiplier,3);
assert.equal(actor.actions.skill06.terms[0].multiplier,1.8);
assert.equal(actor.enemyKit.superArmorDamageReduction,.6);
assert.equal(actor.enemyKit.superArmorBreakDelay,.75);
assert.equal(actor.enemyKit.superArmorBreakDamageTaken,.5);

const fullStage=buildEndgameEncounter(ctx,strictParty(ctx),{mode:'moc',seasonId:1036,floorId:'5504',side:2});
assert.equal(fullStage.sceneReplay.enemyLineupComplete,true);
assert.equal(fullStage.sceneReplay.enemyBehaviorRegistered,true);
assert.equal(fullStage.units.filter(u=>u.side==='enemy'&&u.childId===3013010).length,1);
assert.deepEqual(validateBattle(fullStage),[]);

const wait={name:'等待',type:'Normal',element:'Physical',target:'single',terms:[],spGain:0,energyGain:0};
function dummyTeam({breaker=false,targetId='faded-rage-shell'}={}){
  return Array.from({length:4},(_,i)=>{
    const speed=breaker&&i===0?200:1;
    return {id:`ally-${i+1}`,name:`测试队员${i+1}`,side:'ally',level:80,aggro:i===0?100:0,
      panel:{hp:1e8,atk:100,def:100,speed,critRate:0,critDmg:0,effectRes:0,controlRes:0,energyRegen:1,elemDmg:{},baseStats:{hp:1e8,atk:100,def:100,speed}},
      energy:0,energyMax:100,
      actions:{basic:breaker&&i===0?{name:'量子击破',type:'Normal',element:'Quantum',target:'single',targetId,terms:[{scaling:'atk',multiplier:1}],hitEnergy:0,toughness:60}:wait},
      policy:breaker&&i===0?{rotation:['basic'],autoUltimate:false}:{basicOnly:true,autoUltimate:false}};
  });
}

const battleEnemy=structuredClone(actor);
battleEnemy.panel={...battleEnemy.panel,hp:1e8,baseStats:{...battleEnemy.panel.baseStats,hp:1e8}};
const normal=simulateBattle({strict:false,sp:3,maxSP:5,maxAV:260,critMode:'noncrit',seed:9,units:[...dummyTeam(),battleEnemy]});
const actionRows=normal.log.filter(e=>e.type==='action'&&e.actor===actor.id);
assert.deepEqual(actionRows.map(e=>e.key),['skill01','skill07','skill06','skill07','skill04','skill07']);
assert.deepEqual(actionRows.filter((_,i)=>i%2===0).map((e,i)=>e.av),actionRows.filter((_,i)=>i%2===1).map(e=>e.av),
  'OneMorePerTurn extra strikes must stay inside the same turn');
assert.deepEqual(normal.log.filter(e=>e.type==='mechanic'&&e.actor===actor.id&&e.name==='【痛恶如刺剔骨】开始').map(e=>e.hits),[4,5,8]);
assert.equal(normal.log.filter(e=>e.type==='damage'&&e.actor===actor.id&&e.frame?.action?.key==='skill07').length,17,
  'Skill07 should resolve 3+layers individual random hits for each of the first three turns');

const breakEnemy=structuredClone(actor);
breakEnemy.id='faded-rage-break';
breakEnemy.panel={...breakEnemy.panel,hp:1e8,baseStats:{...breakEnemy.panel.baseStats,hp:1e8}};
breakEnemy.toughnessMax=30;breakEnemy.toughness=30;
const broken=simulateBattle({strict:false,sp:3,maxSP:5,maxAV:55,critMode:'noncrit',seed:7,
  units:[...dummyTeam({breaker:true,targetId:breakEnemy.id}),breakEnemy]});
assert.ok(broken.log.some(e=>e.type==='mechanic'&&e.actor===breakEnemy.id&&e.name==='癔症身壳 · 弱点击破'));
assert.ok(broken.log.some(e=>e.type==='break'&&e.target===breakEnemy.id));
const shellBreak=broken.log.find(e=>e.type==='mechanic'&&e.actor===breakEnemy.id&&e.name==='癔症身壳 · 弱点击破');
assert.equal(shellBreak.damageTaken,.5);
assert.ok(shellBreak.frame.units.find(u=>u.id===breakEnemy.id)?.buffs?.some(e=>e.tag==='fadedRageSuperArmorBreak'));

console.log('Faded Rage Shell checks: sourced MoC scene, AI loop, growth-scaled extra hits, super armor and break vulnerability passed.');
