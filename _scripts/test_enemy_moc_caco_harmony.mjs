import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createContext} from '../core/ctx.mjs';
import {createBattle,stepBattle} from '../simulator/engine.mjs';
import {cacoHarmony,validateEnemyActor} from '../simulator/encounters.mjs';
import {buildEndgameEncounter} from '../simulator/endgame-battles.mjs';
import {inspectEndgameTarget} from '../simulator/endgame-scenes.mjs';

const ctx=createContext(JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url))));
const scene=inspectEndgameTarget(ctx,{mode:'moc',seasonId:1036,floorId:'5502',side:1});
const source=scene.enemies.find(e=>e.childId===3003040);
assert.ok(source,'MoC 1036 5502 一侧应含「同音共律的来日」');
const enemy=cacoHarmony(ctx,{sceneEnemy:source,id:'caco-harmony'});
assert.deepEqual(validateEnemyActor(enemy),[]);
assert.deepEqual([enemy.panel.hp,enemy.panel.speed,enemy.toughnessMax],[106005.7,110,100]);

const idle={name:'测试待机',type:'Normal',element:'Physical',target:'single',terms:[],hitEnergy:0};
function ally(id,speed,{hp=100000,currentHp=hp,atk=100,aggro=1}={}){
  return {id,name:id,side:'ally',level:80,aggro,currentHp,
    panel:{hp,atk,def:100,speed,critRate:0,critDmg:0,effectRes:0,controlRes:0,energyRegen:1,elemDmg:{},baseStats:{hp,atk,def:100}},
    energy:0,energyMax:100,actions:{basic:{...idle}},policy:{rotation:['basic'],autoUltimate:false}};
}
const team=[ally('target',111,{hp:100000,currentHp:50000,aggro:100}),ally('slow-1',80),ally('slow-2',70),ally('slow-3',60)];
function config(units,maxAV=500){return {strict:false,sp:3,maxSP:5,maxAV,critMode:'noncrit',seed:7,units};}

// The actual stage scene is buildable while preserving the known selector and
// phase-less Skill07 caveats in sceneReplay instead of claiming full fidelity.
const realScene=buildEndgameEncounter(ctx,config(team),{mode:'moc',seasonId:1036,floorId:'5502',side:1});
assert.equal(realScene.sceneReplay.enemyLineupComplete,true);
assert.equal(realScene.sceneReplay.enemyBehaviorRegistered,true);
assert.equal(realScene.sceneReplay.enemyBehaviorComplete,false);
assert.ok(realScene.sceneReplay.omittedRules.some(text=>text.includes('Skill07')));
assert.equal(realScene.units.filter(u=>u.side==='enemy'&&u.enemyKit?.id===3003040).length,2);

// Drive the control skill with its second AI flag to check its chance, sourced
// 10 energy, one-turn heal/skip, vulnerability and remove-after-hit behavior.
const battle=createBattle(config([...team,enemy]));
const boss=battle.units.find(u=>u.id==='caco-harmony'),target=battle.units.find(u=>u.id==='target');
boss.distance=9000;boss.resources['同音共律AIFlag']=2;
assert.equal(stepBattle(battle),true);
assert.ok(target.buffs.some(e=>e.tag==='cacoHarmonyDream'&&e.control==='sleep'&&e.value===.5));
assert.equal(target.energy,10,'the sourced non-damaging control hit grants SPHitBase to its target');
assert.equal(battle.log.find(e=>e.type==='action'&&e.actor===boss.id)?.key,'skill02');
assert.equal(stepBattle(battle),true);
assert.equal(target.hp,85000,'dream heals 35% of max HP at the target turn start');
assert.ok(battle.log.some(e=>e.type==='skip'&&e.actor===target.id&&e.name==='【异梦】无法行动'));
assert.ok(target.buffs.some(e=>e.tag==='cacoHarmonyDream'),'sleep persists through the skipped turn');

boss.distance=0;
assert.equal(stepBattle(battle),true);
const dreamHit=battle.log.find(e=>e.type==='damage'&&e.actor===boss.id&&e.target===target.id);
assert.ok(dreamHit,'the dream-aware AI should strike the sleeping target');
assert.equal(dreamHit.formula.find(row=>row.zone==='vuln')?.value,1.5,'the attack receives 50% vulnerability');
assert.equal(target.buffs.some(e=>e.tag==='cacoHarmonyDream'),false,'the first direct attack removes dream after damage');
assert.equal(target.energy,25,'the damaging dream-aware strike grants its sourced 15 energy');

// Verify the sourced six-step AI flag sequence independently of scene rules.
const cycleEnemy=cacoHarmony(ctx,{sceneEnemy:source,id:'caco-cycle'});
const cycle=createBattle(config([ally('a',1,{hp:1e8}),ally('b',1,{hp:1e8}),ally('c',1,{hp:1e8}),ally('d',1,{hp:1e8}),cycleEnemy],600));
for(let i=0;i<6;i++)assert.equal(stepBattle(cycle),true);
assert.deepEqual(cycle.log.filter(e=>e.type==='action'&&e.actor==='caco-cycle').map(e=>e.key),
  ['skill01','skill02','skill03','skill04','skill05','skill01']);

console.log('Cacophony of Harmony checks: real MoC lineup, six-step AI, dream healing/skip, sourced hit energy, 50% vulnerability, and hit removal passed.');
