import assert from 'node:assert/strict';
import fs from 'node:fs';
import {actor,dummy} from './codex_test_helpers.mjs';
import {createContext} from '../core/ctx.mjs';
import {strictParty} from '../simulator/party.mjs';
import {buildEndgameEncounter} from '../simulator/endgame-battles.mjs';
import {createBattle,stepBattle,validateBattle} from '../simulator/engine.mjs';

const rule={type:'mocAhaCycle',id:'moc.1036.aha-cycle',mode:'moc',laughterPerUltimate:5,fixedPunchline:20};
const ctx=createContext(JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url))));
const actualScene=buildEndgameEncounter(ctx,strictParty(ctx),{mode:'moc',seasonId:1036,floorId:'5504',side:2});
const exactSourceRules=actualScene.sceneReplay.sourceRules.filter(source=>
  ['abyss_season','abyss_buff'].includes(source.kind)&&/每个轮开始时，使阿哈立即获得1个固定计入/.test(source.text??'')&&
  JSON.stringify(source.params??[])===JSON.stringify([5,20])).map(source=>source.id);
assert.deepEqual(actualScene.endgameRules,[{...rule,sourceRuleIds:exactSourceRules}]);
assert.equal(actualScene.units.filter(unit=>unit.side==='enemy').length,5);
assert.deepEqual(actualScene.sceneReplay.appliedRuleIds,exactSourceRules);
assert.ok(actualScene.sceneReplay.omittedRules.includes('混沌回忆星数与通关轮数判定'));
assert.equal(actualScene.sceneReplay.stageRulesComplete,false,'mode score and cycle-result rules remain explicit gaps');
assert.deepEqual(validateBattle(actualScene),[]);

const makeBattle=(maxAV=1)=>{
  const target=dummy('cycle-target','enemy',1e9);target.hp=1e9;target.panel.hp=1e9;
  return createBattle({strict:false,maxAV,sp:3,maxSP:5,seed:13,critMode:'noncrit',
    endgameRules:[rule],units:[actor(1501),target]});
};

const initial=makeBattle();
assert.deepEqual(validateBattle(initial.config),[]);
assert.equal(initial.laughter.ally,1,'battle start keeps normal shared Punchline separate from the fixed cycle action');
stepBattle(initial);
const fixedStart=initial.log.find(e=>e.type==='mechanic'&&e.name==='混沌回忆·物竞天择轮开始');
assert.ok(fixedStart);
assert.equal(fixedStart.cycle,0);
assert.equal(fixedStart.punchline,20);
assert.equal(initial.log.filter(e=>e.type==='action'&&e.kind==='aha'&&e.key==='elation').length,1);
assert.equal(initial.laughter.ally,1,'the fixed 20-point extra action does not consume shared Punchline');
stepBattle(initial);
assert.equal(initial.log.filter(e=>e.type==='mechanic'&&e.name==='混沌回忆·物竞天择轮开始').length,1,
  're-entering the same cycle cannot duplicate the Aha extra action');

const ultimate=makeBattle();
const wearer=ultimate.units.find(u=>u.side==='ally');
wearer.energy=wearer.energyMax;
ultimate.queue.push({actor:wearer.id,key:'ultimate',kind:'ultimate'});
stepBattle(ultimate);
const laughterRecords=ultimate.log.filter(e=>e.type==='resource'&&e.name==='累计获得笑点');
const stageLaughter=laughterRecords.find(e=>e.added===5&&e.reason.includes('施放终结技'));
const beforeStageLaughter=laughterRecords[laughterRecords.indexOf(stageLaughter)-1];
assert.ok(stageLaughter);
assert.equal(stageLaughter.value,beforeStageLaughter.value+5,'the stage rule adds five over the character Ultimate’s own laughter effects');

const nextCycle=makeBattle(151);
assert.equal(stepBattle(nextCycle),true);
let steps=1;
while(nextCycle.av<150&&steps<20){assert.equal(stepBattle(nextCycle),true);steps++;}
assert.equal(nextCycle.av,150,'cycle-one trigger is scheduled at the exact MoC action-value boundary');
assert.deepEqual(nextCycle.log.filter(e=>e.type==='mechanic'&&e.name==='混沌回忆·物竞天择轮开始').map(e=>e.cycle),[0,1]);

console.log('MoC 1036 checks: source-mapped fixed 20-Punchline Aha action per cycle, no shared-Punchline spend, and +5 per ally Ultimate passed.');
