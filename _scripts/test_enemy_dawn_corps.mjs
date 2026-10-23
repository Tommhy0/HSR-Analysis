import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createContext} from '../core/ctx.mjs';
import {createBattle,stepBattle} from '../simulator/engine.mjs';
import {dawnCorpsRanger,isEnemyMechanicRegistered,validateEnemyActor} from '../simulator/encounters.mjs';
import {buildEndgameEncounter} from '../simulator/endgame-battles.mjs';
import {inspectEndgameTarget} from '../simulator/endgame-scenes.mjs';

const ctx=createContext(JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url))));
const idle={name:'待机',type:'Normal',element:'Physical',target:'single',terms:[],hitEnergy:0};
function ally(id,speed,{hp=100000,atk=100}={}){
  return {id,name:id,side:'ally',level:80,currentHp:hp,panel:{hp,atk,def:100,speed,critRate:0,critDmg:0,effectRes:0,
    controlRes:0,energyRegen:1,elemDmg:{},baseStats:{hp,atk,def:100}},energy:0,energyMax:100,
    actions:{basic:{...idle}},policy:{rotation:['basic'],autoUltimate:false}};
}
const party=[ally('hitter',400),ally('a2',80),ally('a3',70),ally('a4',60)];
const config=units=>({strict:false,sp:3,maxSP:5,maxAV:500,critMode:'noncrit',seed:11,units});
const force=unit=>unit.buffs.push({id:unit.id+':test-force',name:'破晓力场',type:'buff',key:'marker',value:0,
  source:unit.id,remaining:null,tickOwner:unit.id,tickAt:'end',tag:'dawnCorpsForceField'});

for(const floorId of ['5501','5506']){
  const source=inspectEndgameTarget(ctx,{mode:'moc',seasonId:1036,floorId,side:1});
  const replay=buildEndgameEncounter(ctx,config(party),{mode:'moc',seasonId:1036,floorId,side:1});
  const dawn=replay.units.filter(u=>u.enemyKit?.id===5013060),ash=replay.units.filter(u=>u.enemyKit?.id===5013070);
  assert.equal(dawn.length,2,`MoC ${floorId} 应有两波曙光`);
  assert.equal(ash.length,1,`MoC ${floorId} 第二波应有灰烬`);
  assert.equal(replay.sceneReplay.enemyLineupComplete,true);
  assert.equal(replay.sceneReplay.enemyBehaviorComplete,false,'空的来源 AI 序列必须保留未完成标记');
  assert.ok(source.enemies.some(e=>e.childId===5013060));
  for(const unit of [...dawn,...ash])assert.deepEqual(validateEnemyActor(unit),[]);
}
assert.equal(isEnemyMechanicRegistered(5013060),true);
assert.equal(isEnemyMechanicRegistered(5013070),true);
assert.equal(isEnemyMechanicRegistered(5013040),true);
assert.equal(isEnemyMechanicRegistered(5013050),true);

const source=inspectEndgameTarget(ctx,{mode:'moc',seasonId:1036,floorId:'5501',side:1}).enemies.find(e=>e.childId===5013060);
const boss=dawnCorpsRanger(ctx,{sceneEnemy:source,id:'dawn'});
assert.deepEqual([boss.panel.hp,boss.panel.speed,boss.toughnessMax],[120715.7,132,160]);
assert.deepEqual(boss.actions.skill02.terms,[{scaling:'atk',multiplier:6},{scaling:'atk',multiplier:3,target:'adjacent'}]);

// Force field blocks both control and toughness loss. The source element is
// off weakness in this variant, so test weakness damage with Fire separately.
const fireAction={name:'火焰测试攻击',type:'BPSkill',element:'Fire',target:'single',
  terms:[{scaling:'atk',multiplier:1}],toughness:10,hitEnergy:0,
  effects:[{type:'buff',name:'冻结测试',key:'vuln',value:0,duration:1,control:'freeze',debuff:true}]};
party[0].actions.skill=fireAction;party[0].policy.rotation=['skill'];
const battle=createBattle(config([...party,boss]));
const liveBoss=battle.units.find(u=>u.id==='dawn'),hitter=battle.units.find(u=>u.id==='hitter');
force(liveBoss);liveBoss.distance=10000;hitter.distance=0;
assert.equal(stepBattle(battle),true);
assert.equal(liveBoss.toughness,160,'force field should prevent weakness damage from reducing toughness');
assert.equal(liveBoss.buffs.some(e=>e.control==='freeze'),false,'force field should reject control');
assert.ok(battle.log.some(e=>e.type==='resist'&&e.actor===liveBoss.id&&e.name==='免疫控制类负面状态'));

// Matching type directly advances action, and seven field hits queue breakaway.
const passive=createBattle(config([...party,dawnCorpsRanger(ctx,{sceneEnemy:source,id:'passive-dawn'})]));
const passiveBoss=passive.units.find(u=>u.id==='passive-dawn'),attacker=passive.units.find(u=>u.id==='hitter');
force(passiveBoss);passiveBoss.distance=9000;
attacker.actions.basic.element='Imaginary';
passive.activeAction={sequence:1,actor:attacker.id,key:'basic',kind:'normal'};
passive.rules.attacked(passive,passiveBoss,attacker);
assert.equal(passiveBoss.distance,0,'matching Imaginary attack should immediately advance Dawn');
for(let i=0;i<7;i++){
  passive.activeAction={sequence:10+i,actor:attacker.id,key:'skill',kind:'normal'};
  attacker.actions.skill={...idle,type:'BPSkill',element:'Fire'};
  passive.rules.attacked(passive,passiveBoss,attacker);
}
assert.ok(passive.queue.some(q=>q.actor===passiveBoss.id&&q.key==='skill05'));

// Skill03 starts the force-field loop; Skill05 removes it and applies sourced
// vulnerability / element-resistance reduction.
const lifecycle=createBattle(config([...party,dawnCorpsRanger(ctx,{sceneEnemy:source,id:'lifecycle'})]));
const lifecycleBoss=lifecycle.units.find(u=>u.id==='lifecycle');lifecycleBoss.distance=0;
lifecycleBoss.resources['破晓战队AIFlag']=3;
assert.equal(stepBattle(lifecycle),true);
assert.ok(lifecycleBoss.buffs.some(e=>e.tag==='dawnCorpsForceField'));
lifecycle.rules.after(lifecycle,lifecycleBoss,'skill05','followup',lifecycleBoss.actions.skill05,[],[],[]);
assert.equal(lifecycleBoss.buffs.some(e=>e.tag==='dawnCorpsForceField'),false);
assert.ok(lifecycleBoss.buffs.some(e=>e.key==='vuln'&&e.value===.3));
assert.ok(lifecycleBoss.buffs.some(e=>e.resReduction&&e.element==='Imaginary'&&e.value===.4));

const wingedSource=inspectEndgameTarget(ctx,{mode:'anomaly',seasonId:10,floorId:'pre:0'}).enemies.find(e=>e.childId===5013040);
const winged=dawnCorpsRanger(ctx,{sceneEnemy:wingedSource,id:'dawn-winged'});
assert.equal(winged.element,'Quantum');
assert.equal(winged.enemyKit.variant,'苍翼');
assert.equal(winged.enemyKit.skill01Id,wingedSource.aiSource.skillSpecs[0].id);
assert.equal(winged.actions.skill01.element,wingedSource.aiSource.skillSpecs[0].element);
assert.deepEqual(winged.weaknesses,wingedSource.weakness);
assert.deepEqual(validateEnemyActor(winged),[]);
const wingedBattle=createBattle(config([...party,winged])),wingedBoss=wingedBattle.units.find(u=>u.id==='dawn-winged'),wingedHitter=wingedBattle.units.find(u=>u.id==='hitter');
force(wingedBoss);wingedBoss.distance=8000;
wingedHitter.actions.basic.element='Quantum';
wingedBattle.activeAction={sequence:1,actor:'hitter',key:'basic',kind:'normal'};
wingedBattle.rules.attacked(wingedBattle,wingedBoss,wingedHitter);
assert.equal(wingedBoss.distance,0,'苍翼受量子攻击时按其源元素提前行动');

const redSource=inspectEndgameTarget(ctx,{mode:'anomaly',seasonId:10,floorId:'pre:1'}).enemies.find(e=>e.childId===5013050);
const redFlame=dawnCorpsRanger(ctx,{sceneEnemy:redSource,id:'dawn-red-flame'});
assert.ok(Number.isFinite(redSource.hp),'red-flame source row should now derive its panel from its object-form resistance row');
assert.equal(redFlame.element,'Fire');
assert.equal(redFlame.enemyKit.variant,'赤焰');
assert.equal(redFlame.enemyKit.skill01Id,redSource.aiSource.skillSpecs[0].id);
assert.deepEqual(redFlame.weaknesses,redSource.weakness);
assert.deepEqual(validateEnemyActor(redFlame),[]);

console.log('Dawn Corps: MoC 1036 source waves, four variants, force-field control/toughness immunity, matching-element advance, hit threshold, and breakaway debuffs passed; AI sequence gaps remain explicit.');
