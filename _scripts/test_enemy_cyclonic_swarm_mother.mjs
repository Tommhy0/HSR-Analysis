import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createContext} from '../core/ctx.mjs';
import {createBattle,stepBattle} from '../simulator/engine.mjs';
import {cyclonicSwarmMother,isEnemyMechanicRegistered,validateEnemyActor} from '../simulator/encounters.mjs';
import {buildEndgameEncounter} from '../simulator/endgame-battles.mjs';
import {inspectEndgameTarget} from '../simulator/endgame-scenes.mjs';

const ctx=createContext(JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url))));
const idle={name:'测试待机',type:'Normal',element:'Physical',target:'single',terms:[],hitEnergy:0};
function ally(id,speed,{hp=100000,atk=100}={}){
  return {id,name:id,side:'ally',level:80,currentHp:hp,panel:{hp,atk,def:100,speed,critRate:0,critDmg:0,effectRes:0,
    controlRes:0,energyRegen:1,elemDmg:{},baseStats:{hp,atk,def:100}},energy:0,energyMax:100,
    actions:{basic:{...idle},skill:{...idle,type:'BPSkill'}},policy:{rotation:['basic'],autoUltimate:false}};
}
const team=[ally('target',111),ally('ally-2',80),ally('ally-3',70),ally('ally-4',60)];
const config=units=>({strict:false,sp:3,maxSP:5,maxAV:500,critMode:'noncrit',seed:7,units});
const scene=inspectEndgameTarget(ctx,{mode:'moc',seasonId:1036,floorId:'5503',side:1});
const source=scene.enemies.find(e=>e.childId===4053020);
assert.ok(source,'MoC 1036 5503 一侧应含飓风大母');
assert.deepEqual([source.level,source.hp,source.speed,source.stance],[73,163989,181.5,480]);
assert.equal(isEnemyMechanicRegistered(4053020),true);
const actor=cyclonicSwarmMother(ctx,{sceneEnemy:source,id:'mother'});
assert.deepEqual(validateEnemyActor(actor),[]);
assert.equal(actor.actions.skill01.terms[0].multiplier,3.5);
assert.equal(actor.actions.skill02.target,'blast');
assert.equal(actor.actions.skill04.target,'all');
assert.equal(actor.enemyKit.nurseryDamageReduction,.25);
assert.equal(actor.enemyMechanicNotes.length,3);

for(const floorId of ['5503','5508']){
  const replay=buildEndgameEncounter(ctx,config(team),{mode:'moc',seasonId:1036,floorId,side:1});
  const boss=replay.units.find(u=>u.enemyKit?.id===4053020);
  assert.ok(boss,`MoC 1036 ${floorId} 应生成飓风大母`);
  assert.equal(replay.sceneReplay.enemyLineupComplete,true);
  assert.equal(replay.sceneReplay.enemyBehaviorComplete,false,'来源技能链缺口不得标成完整');
  assert.ok(replay.sceneReplay.omittedRules.some(note=>note.includes('泡影稚子')));
}

// Skill 03 applies the sourced 25% nursery reduction.
const incubating=createBattle(config([...team,actor]));
const boss=incubating.units.find(u=>u.id==='mother');
boss.distance=0;boss.resources['飓风大母AIFlag']=3;
assert.equal(stepBattle(incubating),true);
assert.ok(boss.buffs.some(e=>e.tag==='cyclonicMotherIncubation'&&e.key==='dmgReduction'&&e.value===.25));

// The local passive parameter [4] counts qualifying attack actions and then
// advances the mother's action gauge. A single multi-hit action is deduped by
// the engine's attackedTargets set before this hook is called.
const passiveBattle=createBattle(config([...team,cyclonicSwarmMother(ctx,{sceneEnemy:source,id:'passive-mother'})]));
const passiveBoss=passiveBattle.units.find(u=>u.id==='passive-mother'),attacker=passiveBattle.units.find(u=>u.id==='target');
passiveBoss.distance=9000;
for(let i=0;i<4;i++){
  passiveBattle.activeAction={sequence:100+i,actor:attacker.id,key:'skill',kind:'normal'};
  passiveBattle.rules.attacked(passiveBattle,passiveBoss,attacker);
}
assert.equal(passiveBoss.resources['飓风大母受击计数'],0);
assert.equal(passiveBoss.distance,0,'four qualifying attacks should fill its action advance');
assert.ok(passiveBattle.log.some(e=>e.type==='mechanic'&&e.name==='【请泊舟暂歇】行动提前'));

console.log('Cyclonic Swarm Mother: MoC 1036 source panels, 5503/5508 scene construction, sourced attack effects, passive action advance, and explicit summon/AI gaps passed.');
