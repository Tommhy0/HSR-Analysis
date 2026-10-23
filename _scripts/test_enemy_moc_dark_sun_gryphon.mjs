import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createContext} from '../core/ctx.mjs';
import {createBattle,stepBattle} from '../simulator/engine.mjs';
import {darkSunGryphon,validateEnemyActor} from '../simulator/encounters.mjs';
import {buildEndgameEncounter} from '../simulator/endgame-battles.mjs';
import {inspectEndgameTarget} from '../simulator/endgame-scenes.mjs';

const ctx=createContext(JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url))));
const scene=inspectEndgameTarget(ctx,{mode:'moc',seasonId:1036,floorId:'5507',side:1});
const source=scene.enemies.find(e=>e.childId===4033030);
assert.ok(source,'MoC 1036 5507 一侧应含黑日狮鹫');
const actor=darkSunGryphon(ctx,{sceneEnemy:source,id:'dark-sun-gryphon'});
assert.deepEqual(validateEnemyActor(actor),[]);
assert.deepEqual([actor.panel.hp,actor.panel.speed,actor.toughnessMax],[291109.2,172.8,160]);
assert.deepEqual(actor.actions.skill01.terms,[{scaling:'atk',multiplier:3}]);
assert.deepEqual(actor.actions.skill04.terms,[{scaling:'atk',multiplier:4.5}]);

const idle={name:'测试待机',type:'Normal',element:'Physical',target:'single',terms:[],hitEnergy:0};
function ally(id,speed){
  return {id,name:id,side:'ally',level:80,aggro:1,panel:{hp:1e9,atk:100,def:100,speed,critRate:0,critDmg:0,
    effectRes:0,controlRes:0,energyRegen:1,elemDmg:{},baseStats:{hp:1e9,atk:100,def:100}},
    energy:0,energyMax:100,actions:{basic:{...idle}},policy:{rotation:['basic'],autoUltimate:false}};
}
const team=[ally('a',1),ally('b',1),ally('c',1),ally('d',1)];
const config=units=>({strict:false,sp:3,maxSP:5,maxAV:600,critMode:'noncrit',seed:7,units});
const built=buildEndgameEncounter(ctx,config(team),{mode:'moc',seasonId:1036,floorId:'5507',side:1});
assert.equal(built.sceneReplay.enemyLineupComplete,true);
assert.equal(built.sceneReplay.enemyBehaviorRegistered,true);
assert.equal(built.sceneReplay.enemyBehaviorComplete,false,'known erosion and archer gaps must stay visible');
assert.ok(built.sceneReplay.omittedRules.some(text=>text.includes('侵蚀')));
assert.equal(built.units.filter(u=>u.side==='enemy'&&u.enemyKit?.id===4033030).length,1);

const battle=createBattle(config([...team,darkSunGryphon(ctx,{sceneEnemy:source,id:'cycle'})]));
const boss=battle.units.find(u=>u.id==='cycle');
const keys=[];
for(let i=0;i<5;i++){
  boss.distance=0;
  for(const unit of battle.units.filter(u=>u.side==='ally'))unit.distance=999999;
  assert.equal(stepBattle(battle),true);
  keys.push(battle.log.findLast(e=>e.type==='action'&&e.actor==='cycle')?.key);
}
assert.deepEqual(keys,['skill01','skill02','skill01','skill03','skill04']);

const oneMoreBattle=createBattle(config([...team,darkSunGryphon(ctx,{sceneEnemy:source,id:'one-more'})]));
const oneMoreBoss=oneMoreBattle.units.find(u=>u.id==='one-more');
oneMoreBoss.resources['黑日狮鹫AIFlag']=2;
oneMoreBoss.buffs.push({id:'one-more-marker',tag:'OneMore',name:'OneMore',key:'marker',value:0});
oneMoreBoss.distance=0;
for(const unit of oneMoreBattle.units.filter(u=>u.side==='ally'))unit.distance=999999;
assert.equal(stepBattle(oneMoreBattle),true);
assert.equal(oneMoreBattle.log.find(e=>e.type==='action'&&e.actor==='one-more')?.key,'skill01');
assert.equal(oneMoreBoss.resources['黑日狮鹫AIFlag'],2,'OneMore repeats Skill01 without advancing the source flag');

console.log('Dark Sun Gryphon checks: MoC scene lineup, sourced panel/attack data, five-flag loop and explicit incomplete-mechanic status passed.');
