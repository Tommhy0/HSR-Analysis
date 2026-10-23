import assert from 'node:assert/strict';
import fs from 'node:fs';
import {actor,dummy} from './codex_test_helpers.mjs';
import {createContext} from '../core/ctx.mjs';
import {strictParty} from '../simulator/party.mjs';
import {buildEndgameEncounter} from '../simulator/endgame-battles.mjs';
import {createBattle,stepBattle,validateBattle} from '../simulator/engine.mjs';

const ctx=createContext(JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url))));
const scene=buildEndgameEncounter(ctx,strictParty(ctx),{mode:'moc',seasonId:1036,floorId:'5509',side:1});
const source=scene.units.find(unit=>unit.childId===5013010);
assert.ok(source,'the local endgame database maps Rocking Rebel to MoC 1036 floor 5509 first half');
assert.equal(scene.sceneReplay.enemyBehaviorRegistered,true);
assert.equal(scene.sceneReplay.enemyBehaviorComplete,false,'known OneMore and dynamic callback gaps stay visible');
assert.ok(source.unsupported.some(item=>item.includes('OneMore / OneMorePerTurn')));
assert.deepEqual(source.enemyKit.aiCombosByFlag,{1:['skill01','skill02'],2:['skill02','skill01']});
assert.deepEqual(validateBattle(scene),[]);

const party=()=>Array.from({length:4},(_,index)=>{
  const unit=dummy(`ally-${index+1}`,'ally',1000);unit.panel={...unit.panel,hp:1e9,atk:1000,def:1000,speed:1,baseStats:{hp:1e9,atk:1000,def:1000}};unit.hp=1e9;return unit;
});
const rebel=()=>{
  const unit=structuredClone(source);unit.id='rocker-test';unit.panel={...unit.panel,hp:1e9,atk:1000,def:1000,speed:200,baseStats:{hp:1e9,atk:1000,def:1000}};
  unit.baseSpeed=200;unit.hp=1e9;unit.wave=1;unit.active=true;delete unit.mechanicReserve;unit.unsupported=[...unit.unsupported];return unit;
};

const attacker=rebel(),enemyMate=dummy('enemy-mate','enemy',1000);
enemyMate.panel={...enemyMate.panel,hp:1e9,atk:1000,def:1000,speed:1,baseStats:{hp:1e9,atk:1000,def:1000}};enemyMate.hp=1e9;
const cycle=createBattle({strict:false,maxAV:300,sp:3,maxSP:5,seed:42,critMode:'noncrit',units:[...party(),attacker,enemyMate]});
assert.deepEqual(validateBattle(cycle.config),[]);
for(let i=0;i<40&&cycle.log.filter(event=>event.type==='action'&&event.actor===attacker.id).length<7;i++)stepBattle(cycle);
const cycleActions=cycle.log.filter(event=>event.type==='action'&&event.actor===attacker.id);
assert.deepEqual(cycleActions.map(event=>event.key),['skill01','skill02','skill03','skill04','skill02','skill01','skill05']);
assert.equal(cycleActions[0].av,cycleActions[1].av,'the paired opening sweeps resolve inside one enemy turn');
assert.equal(cycleActions[1].kind,'continuation');
assert.deepEqual(cycleActions[0].targets,['ally-1','ally-2','ally-3'],'left sweep selects the first three living party slots');
assert.deepEqual(cycleActions[1].targets,['ally-2','ally-3','ally-4'],'the opening right sweep follows immediately and selects the last three living party slots');
assert.equal(cycleActions[4].av,cycleActions[5].av,'the second paired sweep also resolves inside one enemy turn');
assert.deepEqual(cycleActions[4].targets,['ally-2','ally-3','ally-4']);
assert.deepEqual(cycleActions[5].targets,['ally-1','ally-2','ally-3']);
assert.ok(cycle.units.find(unit=>unit.id===enemyMate.id).buffs.some(effect=>effect.tag==='rockingRebelSpeed'&&effect.value===.5),'Skill05 speeds up other enemies');

const makeFlagThreeBattle=()=>{
  const unit=rebel(),battle=createBattle({strict:false,maxAV:51,sp:3,maxSP:5,seed:42,critMode:'noncrit',units:[...party(),unit]});
  const liveUnit=battle.units.find(value=>value.id===unit.id);liveUnit.resources['摇滚狂徒AIFlag']=3;return {battle,unit:liveUnit};
};
const oneMoreBranch=makeFlagThreeBattle();
oneMoreBranch.unit.buffs.push({id:oneMoreBranch.unit.id+':one-more',name:'OneMore',type:'buff',key:'marker',value:0,remaining:1,
  source:oneMoreBranch.unit.id,tag:'OneMore'});
stepBattle(oneMoreBranch.battle);
assert.equal(oneMoreBranch.battle.log.find(event=>event.type==='action'&&event.actor===oneMoreBranch.unit.id)?.key,'skill02');
assert.equal(oneMoreBranch.unit.resources['摇滚狂徒AIFlag'],3,'the OneMore-only AI branch keeps flag 3');
const stageMarkBranch=makeFlagThreeBattle();
stageMarkBranch.unit.buffs.push({id:stageMarkBranch.unit.id+':stage-mark',name:'Skill03 mark',type:'buff',key:'marker',value:0,remaining:null,
  source:stageMarkBranch.unit.id,modifierName:'MModifier_Monster_W4_Claymore_02_Skill03_Mark'});
stepBattle(stageMarkBranch.battle);
assert.equal(stageMarkBranch.battle.log.find(event=>event.type==='action'&&event.actor===stageMarkBranch.unit.id)?.key,'skill02');
assert.equal(stageMarkBranch.unit.resources['摇滚狂徒AIFlag'],5,'the stage-mark branch advances directly to flag 5');

const interrupting=rebel();
const fixedRule={type:'mocAhaCycle',id:'moc.test.aha-cycle',mode:'moc',laughterPerUltimate:5,fixedPunchline:20};
const interrupt=createBattle({strict:false,maxAV:1,sp:3,maxSP:5,seed:13,critMode:'noncrit',endgameRules:[fixedRule],
  units:[actor(1501),...party().slice(1),interrupting]});
const interruptRebel=interrupt.units.find(unit=>unit.id===interrupting.id);
interruptRebel.buffs.push({id:interruptRebel.id+':charge',name:'charge',type:'buff',key:'marker',value:0,
  remaining:null,source:interruptRebel.id,tag:'rockingRebelCharge'});
stepBattle(interrupt);
const interruptActions=interrupt.log.filter(event=>event.type==='action');
assert.equal(interruptActions[0].actor,interruptRebel.id);
assert.equal(interruptActions[0].key,'skill042','the charged rehearsal reaction resolves before the Elation participants');
assert.ok(!interruptRebel.buffs.some(effect=>effect.tag==='rockingRebelCharge'));
assert.ok(interruptRebel.buffs.some(effect=>effect.tag==='rockingRebelAhaVulnerability'&&effect.value===.4));
assert.ok(interrupt.log.some(event=>event.type==='resource'&&event.name==='累计获得笑点'&&event.added===10));
assert.equal(interrupt.ahaCounted,20);
assert.ok(interrupt.log.some(event=>event.type==='mechanic'&&event.name==='阿哈打断演出彩排'));

const frenzy=rebel();
const encore=createBattle({strict:false,maxAV:1,sp:3,maxSP:5,seed:42,critMode:'noncrit',units:[...party(),frenzy]});
const encoreRebel=encore.units.find(unit=>unit.id===frenzy.id);
encoreRebel.resources['摇滚狂徒AIFlag']=5;
encoreRebel.buffs.push({id:encoreRebel.id+':frenzy',name:'frenzy',type:'buff',key:'marker',value:0,remaining:null,source:encoreRebel.id,tag:'rockingRebelFrenzy'});
encore.random=()=>0.01;
encore.queue.push({actor:encoreRebel.id,key:'skill052',kind:'extra'});
stepBattle(encore);
assert.ok(encore.log.some(event=>event.type==='damage'&&event.actor===encoreRebel.id&&event.damage>0));
assert.ok(encore.log.some(event=>event.type==='mechanic'&&event.name==='【狂奏】施加陶醉'));
assert.ok(encore.units.filter(unit=>unit.side==='ally').some(unit=>unit.skipTurns===1));
assert.ok(encore.log.some(event=>event.type==='resource'&&event.name==='累计获得笑点'&&event.added===10));
assert.ok(!encoreRebel.buffs.some(effect=>effect.tag==='rockingRebelFrenzy'));

console.log('Rocking Rebel checks: database-backed MoC scene, five-flag AI loop with paired sweeps, Aha interruption, vulnerability, Dizzy, and shared laughter passed.');
