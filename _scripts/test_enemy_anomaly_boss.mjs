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
const scene=inspectEndgameTarget(ctx,{mode:'anomaly',seasonId:10,floorId:'boss:0'});
assert.equal(scene.stage.name,'将杀王棋');
assert.equal(scene.stage.sourceStageId,30510021);
assert.equal(scene.stage.level,100);
assert.equal(scene.stageHp.hardLevelGroup,3);
assert.deepEqual(scene.waves.map(wave=>wave.eliteGroup),[368,374]);
assert.deepEqual(scene.enemies.map(enemy=>enemy.childId),[402302001,8033020,503401002]);
assert.deepEqual(scene.enemies.map(enemy=>enemy.wave),[1,1,2]);
assert.deepEqual(scene.waves.map(wave=>Object.values(wave.monsters)),[[402302001,8033020],[503401002]]);
for(const id of [402302001,8033020,503401002])assert.equal(isEnemyMechanicRegistered(id),true);

for(const enemy of scene.enemies){
  const formula=buildMonster(ctx,{monsterId:enemy.monsterId,childId:enemy.childId,level:100,
    hardLevelGroup:3,eliteGroup:enemy.eliteGroup});
  for(const stat of ['hp','atk','def','speed','stance'])assert.equal(enemy[stat],formula[stat],`${enemy.name} ${stat} should come from the local formula`);
}
assert.ok(Math.abs(scene.enemies.reduce((sum,enemy)=>sum+enemy.hp,0)-scene.stageHp.estimatedHp)<2,
  'formula-derived enemy HP should reconcile with the source stage estimate within per-enemy rounding');

const config=buildEndgameEncounter(ctx,strictParty(ctx),{mode:'anomaly',seasonId:10,floorId:'boss:0'});
const enemies=config.units.filter(unit=>unit.side==='enemy');
assert.deepEqual(enemies.map(unit=>unit.childId),[402302001,8033020,503401002]);
assert.deepEqual(enemies.map(unit=>unit.wave),[1,1,2]);
assert.equal(config.sceneReplay.enemyLineupComplete,true);
assert.equal(config.sceneReplay.spawnRosterComplete,true);
assert.equal(config.sceneReplay.enemyBehaviorComplete,false);
assert.equal(config.sceneReplay.stageRulesComplete,false);
assert.deepEqual(config.sceneReplay.appliedRuleIds,['洞穿']);
assert.deepEqual(config.sceneReplay.omittedRuleIds,['血嗜']);
assert.ok(config.sceneReplay.omittedRules.some(note=>note.includes('血嗜')&&note.includes('500点生命值')));
assert.ok(config.sceneReplay.omittedRules.some(note=>note.includes('幻身')));
for(const enemy of enemies)assert.deepEqual(validateEnemyActor(enemy),[]);
assert.deepEqual(validateBattle(config),[]);

function isolated(enemyId,resourcePatch={}){
  const party=config.units.filter(unit=>unit.side==='ally').map(unit=>structuredClone(unit));
  for(const ally of party){
    delete ally.kit;delete ally.characterId;delete ally.gear;delete ally.memospriteOwner;
    ally.panel={hp:1e9,atk:0,def:0,speed:1,critRate:0,critDmg:0,elemDmg:{}};ally.hp=1e9;ally.distance=1e9;
    ally.energy=0;ally.energyMax=0;ally.buffs=[];ally.shields=[];ally.dots=[];ally.resources={};
    ally.actions={basic:{name:'probe',type:'Normal',element:'Physical',target:'single',terms:[]}};
    ally.policy={autoUltimate:false,basicOnly:true};ally.standardBreak=false;
  }
  const actor=structuredClone(enemies.find(unit=>unit.childId===enemyId));actor.distance=0;actor.wave=1;
  const battle=createBattle({...config,units:[...party,actor],sp:3});
  for(const ally of battle.units.filter(unit=>unit.side==='ally')){ally.panel.hp=1e9;ally.hp=1e9;ally.distance=1e9;}
  const live=battle.units.find(unit=>unit.side==='enemy');live.distance=0;Object.assign(live.resources,resourcePatch);
  return {battle,actor:live};
}

const pegasus=isolated(402302001),pegasusKeys=[];
for(let i=0;i<5;i++){
  if(i)pegasus.actor.distance=0;
  assert.equal(stepBattle(pegasus.battle),true);
  pegasusKeys.push(pegasus.battle.log.filter(event=>event.type==='action'&&event.actor===pegasus.actor.id).at(-1).key);
}
assert.deepEqual(pegasusKeys,['skill01','skill03','skill04','skill01','skill02']);
assert.equal(pegasus.actor.actions.skill02.target,'sweep');
assert.equal(pegasus.actor.actions.skill02.sweepDirection,'right');

const lighthouseSummonBranch=isolated(8033020);
assert.equal(stepBattle(lighthouseSummonBranch.battle),true);
assert.equal(lighthouseSummonBranch.battle.log.find(event=>event.type==='action'&&event.actor===lighthouseSummonBranch.actor.id).key,'skill02');
const lighthouseAttack=isolated(8033020,{'灯塔AIFlag':6});
assert.equal(stepBattle(lighthouseAttack.battle),true);
assert.equal(lighthouseAttack.battle.log.find(event=>event.type==='action'&&event.actor===lighthouseAttack.actor.id).key,'skill04');
assert.equal(lighthouseAttack.battle.log.filter(event=>event.type==='damage'&&event.actor===lighthouseAttack.actor.id).length,20,
  'Skill04 retains five sourced hits against four allies');
const lighthouseShielded=isolated(8033020,{'灯塔AIFlag':6}),lighthousePlain=isolated(8033020,{'灯塔AIFlag':6});
for(const ally of lighthouseShielded.battle.units.filter(unit=>unit.side==='ally'))ally.shields.push({id:'scene-shield-probe',name:'probe',value:1e9});
assert.equal(stepBattle(lighthouseShielded.battle),true);
assert.equal(stepBattle(lighthousePlain.battle),true);
const shieldedHit=lighthouseShielded.battle.log.find(event=>event.type==='damage'&&event.actor===lighthouseShielded.actor.id);
const plainHit=lighthousePlain.battle.log.find(event=>event.type==='damage'&&event.actor===lighthousePlain.actor.id);
assert.ok(shieldedHit.sceneMechanics.some(rule=>rule.ruleId==='anomaly.10.boss:0.pierce-shield'&&rule.damageBoost===2));
assert.ok(Math.abs(shieldedHit.damage/plainHit.damage-3)<1e-10,`洞穿 +200% should triple an otherwise unchanged enemy hit (${shieldedHit.damage}/${plainHit.damage})`);

const yabuli=isolated(503401002);
assert.equal(stepBattle(yabuli.battle),true);
assert.equal(yabuli.battle.log.find(event=>event.type==='action'&&event.actor===yabuli.actor.id).key,'skill01');
assert.equal(yabuli.battle.log.filter(event=>event.type==='damage'&&event.actor===yabuli.actor.id).length,1);
assert.ok(yabuli.actor.enemyMechanicNotes.some(note=>note.includes('Skill01 仅作可见占位')));

const transition=createBattle(config);
assert.equal(transition.units.filter(unit=>unit.side==='enemy'&&unit.active).length,2);
for(const enemy of transition.units.filter(unit=>unit.side==='enemy'&&unit.wave===1))enemy.hp=0;
assert.equal(stepBattle(transition),true);
assert.equal(transition.units.find(unit=>unit.side==='enemy'&&unit.wave===2).active,true);

console.log('anomaly boss source lineup, formula panels, partial-mechanic disclosure, sourced AI loops, Lighthouse hit count, Yabuli placeholder, and wave transition passed');
