import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createContext } from '../core/ctx.mjs';
import { buildMonster } from '../core/enemy.mjs';
import { inspectEndgameTarget } from '../simulator/endgame-scenes.mjs';
import { buildEndgameEncounter } from '../simulator/endgame-battles.mjs';
import { isEnemyMechanicRegistered, validateEnemyActor, wingedSerpent } from '../simulator/encounters.mjs';
import { createBattle, receiveDamage, stepBattle, validateBattle, simulateBattle } from '../simulator/engine.mjs';
import { strictParty } from '../simulator/party.mjs';

const ctx=createContext(JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url))));
const inspected=inspectEndgameTarget(ctx,{mode:'moc',seasonId:1036,floorId:'5501',side:2});
const party=strictParty(ctx);
const scene=buildEndgameEncounter(ctx,party,{mode:'moc',seasonId:1036,floorId:'5501',side:2});
assert.equal(scene.sceneReplay.enemyLineupComplete,true);
assert.equal(scene.sceneReplay.enemyBehaviorRegistered,true);
assert.equal(scene.sceneReplay.enemyBehaviorComplete,false);
assert.equal(scene.sceneReplay.stageRulesComplete,false);
assert.equal(scene.sceneReplay.sourceRules.length,inspected.rules.length);
assert.equal(scene.endgameRules.length,1);
assert.deepEqual([scene.endgameRules[0].type,scene.endgameRules[0].laughterPerUltimate,scene.endgameRules[0].fixedPunchline],['mocAhaCycle',5,20]);
assert.deepEqual(scene.sceneReplay.appliedRuleIds,scene.endgameRules[0].sourceRuleIds);
assert.deepEqual(scene.sceneReplay.omittedRuleIds,inspected.rules.filter(rule=>!scene.sceneReplay.appliedRuleIds.includes(rule.id)).map(rule=>rule.id));
assert.deepEqual(scene.units.filter(u=>u.side==='enemy').map(u=>u.wave),[1,1,1,2,2]);
assert.deepEqual(scene.units.filter(u=>u.side==='enemy').map(u=>u.childId),inspected.enemies.map(e=>e.childId));
for(const [unit,source] of scene.units.filter(u=>u.side==='enemy').map((u,i)=>[u,inspected.enemies[i]])){
  const sceneMonster=buildMonster(ctx,{monsterId:source.monsterId,childId:source.childId,level:source.level,
    hardLevelGroup:scene.sceneReplay.hardLevelGroup,eliteGroup:scene.sceneReplay.eliteGroup});
  assert.equal(unit.panel.hp,source.hp);
  assert.equal(unit.panel.atk,sceneMonster.atk);
  assert.equal(unit.panel.def,source.def);
  assert.equal(unit.panel.speed,source.speed);
  assert.equal(unit.panel.effectRes,source.statusRes/100);
  assert.equal(unit.toughnessMax,source.toughness??source.stance);
  assert.deepEqual(unit.weaknesses,source.weakness);
}
assert.deepEqual(validateBattle(scene),[]);
assert.ok(validateBattle({...scene,strict:true}).some(e=>e.includes('OneMorePerTurn')));
const arbiterSource=inspectEndgameTarget(ctx,{mode:'as',seasonId:3022,floorId:'30224',side:2});
const arbiterTags=arbiterSource.rules.filter(rule=>rule.kind==='abyss_tag');
assert.deepEqual(arbiterTags.map(rule=>rule.label),[
  '层标签「坚防守备」','层标签「化整为零」','层标签「相生相成」','层标签「规模效应」',
]);
assert.deepEqual(arbiterTags.map(rule=>rule.scope.enemySide),[2,2,2,2]);
assert.deepEqual(arbiterTags[0].params,[0.5,1,1.5]);
assert.match(arbiterTags[1].text,/分裂为5只/);
assert.match(arbiterTags[2].text,/第二阶段分裂.*共享生命值/);
assert.equal(arbiterSource.enemies.length,1);
assert.equal(arbiterSource.enemies[0].childId,406401204);
assert.equal(arbiterSource.enemies[0].hp,10888875.7);
assert.equal(arbiterSource.enemies[0].hpCount,2);
assert.deepEqual(arbiterSource.enemies[0].phaseRatios,[1,1]);
assert.equal(arbiterSource.enemies[0].stance,360);
assert.equal(arbiterSource.enemies[0].toughness,120);
assert.equal(arbiterSource.events.length,1);
assert.equal(arbiterSource.events[0].stageId,420544);
assert.deepEqual(arbiterSource.events[0].waves,[{monster0:406401204}]);
const arbiterSplitSkill=arbiterSource.enemies[0].skills.find(skill=>skill.id===406401211);
assert.ok(arbiterSplitSkill);
assert.match(arbiterSplitSkill.desc,/雉形.*犬形.*翼蛇形/);
assert.match(arbiterSplitSkill.desc,/行动后.*减少1点.*血脉衰弱/);
assert.equal(arbiterSource.stageMechanics.source,'abyss_floors.phase_json');
assert.equal(arbiterSource.stageMechanics.enemySide,2);
assert.match(arbiterSource.stageMechanics.difficultyGuides[1].desc,/护盾.*壁垒反震.*真实伤害/s);
assert.match(arbiterSource.stageMechanics.phases[0].desc,/分裂为5只/);
assert.match(arbiterSource.stageMechanics.textGuides[0],/护盾/);
const arbiterScene=buildEndgameEncounter(ctx,party,{mode:'as',seasonId:3022,floorId:'30224',side:2});
const arbiter=arbiterScene.units.find(u=>u.side==='enemy');
assert.equal(arbiterScene.sceneReplay.enemyBehaviorRegistered,true);
assert.equal(arbiterScene.sceneReplay.enemyBehaviorComplete,false,'五忆灵分裂 / 合体和第二阶段共享生命仍未实现');
assert.equal(arbiterScene.sceneReplay.stageRulesComplete,false);
assert.equal(arbiterScene.endgameRules.length,1);
assert.deepEqual([arbiterScene.endgameRules[0].type,arbiterScene.endgameRules[0].id,arbiterScene.endgameRules[0].mode,
  arbiterScene.endgameRules[0].teamSide,arbiterScene.endgameRules[0].excludedMonsterId,arbiterScene.endgameRules[0].maxStacks,
  arbiterScene.endgameRules[0].damageReductionPerEnemy,arbiterScene.endgameRules[0].damageBoostPerEnemy,
  arbiterScene.endgameRules[0].sourceSkillId,arbiterScene.endgameRules[0].sourceRuleIds],
['enemyCountScaleEffect','as.3022.30224.scale-effect','as','enemy',4064012,5,.04,.04,406401216,[arbiterTags[3].id]]);
assert.match(arbiterScene.endgameRules[0].sourceAbilityPath,/Monster_W4_Serpent_01_Ability_IF\.json$/);
assert.equal(arbiter.childId,406401204);
assert.equal(arbiter.panel.hp,10888875.7);
assert.equal(arbiter.hpCount,2);
assert.deepEqual(arbiter.phaseRatios,[1,1]);
assert.deepEqual(arbiter.actions.skill04.hitShares,[.1,.1,.1,.1,.1,.1,.4]);
assert.ok(arbiter.unsupported.some(gap=>gap.includes('5只忆灵')));
assert.ok(arbiter.unsupported.some(gap=>gap.includes('坚防守备')));
assert.deepEqual(arbiter.enemyKit.stageTags.map(tag=>tag.name),['坚防守备','化整为零','相生相成','规模效应']);
assert.ok(arbiterScene.sceneReplay.partiallyAppliedMechanics.some(rule=>rule.effect.includes('坚防守备')));
assert.ok(arbiterScene.sceneReplay.partiallyAppliedMechanics.some(rule=>rule.effect.includes('规模效应')&&rule.effect.includes('4%')));
assert.ok(arbiterScene.sceneReplay.appliedRuleIds.includes(arbiterTags[3].id));
assert.deepEqual(validateBattle(arbiterScene),[]);
assert.ok(validateBattle({...arbiterScene,strict:true}).some(error=>error.includes('5只忆灵')),
  'strict mode must keep incomplete Arbiter behavior blocked');
const anomalySource=inspectEndgameTarget(ctx,{mode:'anomaly',seasonId:10,floorId:'pre:2'});
assert.equal(anomalySource.stage.name,'骑士（三）');
assert.deepEqual(anomalySource.waves.map(wave=>wave.id),[305100131,305100132]);
assert.deepEqual(anomalySource.tags.map(tag=>tag.name),['闭锁']);
assert.equal(anomalySource.campaignRules.bossConfig.hardName,'将杀王棋•绝境');
assert.equal(anomalySource.campaignRules.bossConfig.events.length,1);
assert.equal(anomalySource.campaignRules.bossConfig.tags.length,3);
const invalidEnergyShares=structuredClone(scene);invalidEnergyShares.units.find(u=>u.childId===2013020).actions.skill04.hitEnergyShares=[.5];
assert.ok(validateBattle(invalidEnergyShares).some(e=>e.includes('分段受击回能比例无效')));
assert.throws(()=>buildEndgameEncounter(ctx,party,{mode:'anomaly',seasonId:10,floorId:'boss:1',side:1}),/没有场景数据/);
const devourerScene=buildEndgameEncounter(ctx,party,{mode:'moc',seasonId:1036,floorId:'5505',side:2});
assert.equal(devourerScene.sceneReplay.enemyLineupComplete,true);
assert.equal(devourerScene.sceneReplay.enemyBehaviorRegistered,true);
assert.equal(devourerScene.sceneReplay.enemyBehaviorComplete,false,'5505/S2 builds, but Devouring mechanics remain explicitly incomplete');
assert.ok(devourerScene.units.some(u=>u.childId===5023020));
const secondScene=buildEndgameEncounter(ctx,party,{mode:'moc',seasonId:1036,floorId:'5506',side:2});
assert.deepEqual(secondScene.units.filter(u=>u.side==='enemy').map(u=>u.childId),[8012010,2013020,8012010,2013020,2013020]);
assert.deepEqual(secondScene.units.filter(u=>u.side==='enemy').map(u=>u.wave),[1,1,1,2,2]);
for(const floorId of ['5502','5507']){
  const target=buildEndgameEncounter(ctx,party,{mode:'moc',seasonId:1036,floorId,side:2});
  const targetSource=inspectEndgameTarget(ctx,{mode:'moc',seasonId:1036,floorId,side:2});
  assert.deepEqual(target.units.filter(u=>u.side==='enemy').map(u=>u.childId),targetSource.enemies.map(e=>e.childId));
  assert.ok(target.units.some(u=>u.childId===2023020));
  assert.equal(target.sceneReplay.enemyBehaviorRegistered,true);
  assert.equal(target.sceneReplay.enemyBehaviorComplete,false);
  assert.deepEqual(validateBattle(target),[]);
  assert.ok(validateBattle({...target,strict:true}).some(e=>e.includes('AI 选择器')));
}

// Slow, non-damaging teammates let the source enemies complete their 4-step
// loop and the Unstable -> Shake -> target-lock -> 天坠 chain deterministically.
const testParty=structuredClone(scene);
const enemies=testParty.units.filter(u=>u.side==='enemy'&&u.wave===1),sourceRows=inspected.enemies.filter(e=>e.wave===0);
const battleEnemies=enemies.filter(u=>[8012010,2013020].includes(u.childId)).slice(0,2);
for(const u of battleEnemies){const source=sourceRows.find(e=>e.childId===u.childId);u.panel={...u.panel,hp:1e8};u.toughnessMax=source.toughness??source.stance;}
const allies=Array.from({length:4},(_,i)=>({id:`dummy-${i+1}`,name:`测试队员${i+1}`,side:'ally',level:80,aggro:i===0?100:0,
  panel:{hp:1e8,atk:1,def:0,speed:1,critRate:0,critDmg:0,energyRegen:1,elemDmg:{},baseStats:{hp:1e8,atk:1,def:0}},
  energy:0,energyMax:100,actions:{basic:{name:'等待',type:'Normal',element:'Physical',target:'single',terms:[],spGain:0,energyGain:0}},policy:{basicOnly:true,autoUltimate:false}}));
const probe={...testParty,maxAV:280,units:[...allies,...battleEnemies]};
assert.deepEqual(validateBattle(probe),[]);
const result=simulateBattle(probe);
const jinrenId=battleEnemies.find(u=>u.childId===2013020).id;
assert.ok(result.unsupported.some(e=>e.includes('OneMorePerTurn')));
const jinrenActions=result.log.filter(e=>e.type==='action'&&e.actor===jinrenId).map(e=>e.name);
assert.ok(jinrenActions.includes('剖判'));
assert.ok(jinrenActions.includes('镇魂'));
assert.ok(result.log.some(e=>e.type==='action'&&e.actor===jinrenId&&e.name==='拘魂令'));
assert.ok(jinrenActions.includes('天坠'));
assert.ok(result.log.some(e=>e.type==='mechanic'&&e.name==='【震荡】转为【强烈震荡】'));
assert.ok(result.log.some(e=>e.type==='damage'&&e.actor===jinrenId&&e.damage>750));
const jinrenHits=result.log.filter(e=>e.type==='damage'&&e.actor===jinrenId);
assert.deepEqual(jinrenHits.slice(0,2).map(e=>e.hitEnergy),[5,5]);
assert.deepEqual(jinrenHits.filter(e=>e.frame.action?.key==='skill04').map(e=>e.hitEnergy),[10,10,10,10,5]);
const controlImmune=structuredClone(probe);controlImmune.units[0].controlRes=1;
const resisted=simulateBattle(controlImmune);
assert.ok(resisted.log.some(e=>e.type==='resist'&&e.name==='抵抗【强烈震荡】'));
assert.ok(!resisted.log.some(e=>e.type==='action'&&e.actor===jinrenId&&e.name==='拘魂令'));

// Arbiter's sourced 4.6 baseline AI flags are executable, while the real five-
// Memosprite split remains clearly marked as an approximation gap.
const arbiterAllies=Array.from({length:4},(_,i)=>({id:`arbiter-dummy-${i+1}`,name:`裁定测试队员${i+1}`,side:'ally',level:80,aggro:i===0?100:0,
  panel:{hp:1e8,atk:1,def:0,speed:1,critRate:0,critDmg:0,energyRegen:1,elemDmg:{},baseStats:{hp:1e8,atk:1,def:0}},
  energy:0,energyMax:100,actions:{basic:{name:'等待',type:'Normal',element:'Physical',target:'single',terms:[],spGain:0,energyGain:0}},policy:{basicOnly:true,autoUltimate:false}}));
const arbiterBattleConfig={...arbiterScene,maxAV:280,units:[...arbiterAllies,arbiter]};
const arbiterBattle=createBattle(arbiterBattleConfig),arbiterRuntime=arbiterBattle.units.find(u=>u.enemyKit?.id===4064012);
assert.equal(arbiterRuntime.buffs.find(effect=>effect.tag==='arbiterFortification')?.value,.5,
  '坚防守备 applies its source-backed 50% baseline damage reduction');
for(const unit of arbiterBattle.units.filter(u=>u.side==='ally'))unit.distance=10000;
for(const expected of ['skill03','skill02','skill02','skill05']){
  arbiterRuntime.distance=0;
  assert.equal(stepBattle(arbiterBattle),true);
  const action=arbiterBattle.log.filter(e=>e.type==='action'&&e.actor===arbiterRuntime.id).at(-1);
  assert.equal(action.key,expected);
}
const cutterHits=arbiterBattle.log.filter(e=>e.type==='damage'&&e.actor===arbiterRuntime.id&&e.frame.action?.key==='skill05');
assert.equal(cutterHits.length,12,'Skill05 is a 3-hit all-target attack across the four allies');
assert.deepEqual(cutterHits.map(hit=>hit.hitEnergy),Array(12).fill(10),'Skill05 AttackData uses SPHitRatio 1 for each hit');
const arbiterScaleAttack=(extraEnemies,feignedEnemies=0)=>{
  const attackers=structuredClone(arbiterAllies),boss=structuredClone(arbiter),adds=Array.from({length:extraEnemies},(_,i)=>({
    id:`scale-add-${extraEnemies}-${i}`,name:`规模计数忆灵${i+1}`,side:'enemy',wave:1,level:80,
    panel:{hp:1e8,atk:1,def:0,speed:1,critRate:0,critDmg:0,energyRegen:1,elemDmg:{},baseStats:{hp:1e8,atk:1,def:0}},
    energy:0,energyMax:0,actions:{basic:{name:'等待',type:'Normal',element:'Physical',target:'single',terms:[]}},policy:{basicOnly:true,autoUltimate:false},
  }));
  const b=createBattle({...arbiterScene,maxAV:280,units:[...attackers,boss,...adds]}),enemy=b.units.find(u=>u.enemyKit?.id===4064012);
  for(const add of adds.slice(0,feignedEnemies)){const unit=b.units.find(u=>u.id===add.id);unit.active=false;unit.hp=0;unit.feignedDead=true;}
  for(const unit of b.units)unit.distance=10000;
  enemy.resources['裁定者AIFlag']=4;enemy.distance=0;
  assert.equal(stepBattle(b),true);
  const hits=b.log.filter(e=>e.type==='damage'&&e.actor===enemy.id&&e.frame.action?.key==='skill05');
  return hits;
};
const noAddsSkill05=arbiterScaleAttack(0),fourAddsSkill05=arbiterScaleAttack(4);
const threeLiveAddsSkill05=arbiterScaleAttack(4,1);
assert.equal(noAddsSkill05[0].sceneMechanics,undefined,'没有额外敌方单位时规模效应不产生层数');
assert.equal(fourAddsSkill05[0].sceneMechanics[0].layers,4,'四只存活忆灵产生四层规模效应');
assert.ok(Math.abs(fourAddsSkill05[0].damage/noAddsSkill05[0].damage-1.16)<1e-8,'每只存活忆灵使敌方全体伤害提高4%');
assert.equal(threeLiveAddsSkill05[0].sceneMechanics[0].layers,3,'假死忆灵不计入规模效应层数');
assert.ok(Math.abs(threeLiveAddsSkill05[0].damage/noAddsSkill05[0].damage-1.12)<1e-8);
const arbiterScaleIncoming=(extraEnemies)=>{
  const attackers=structuredClone(arbiterAllies),boss=structuredClone(arbiter),adds=Array.from({length:extraEnemies},(_,i)=>({
    id:`scale-incoming-add-${extraEnemies}-${i}`,name:`规模减伤计数忆灵${i+1}`,side:'enemy',wave:1,level:80,
    panel:{hp:1e8,atk:1,def:0,speed:1,critRate:0,critDmg:0,energyRegen:1,elemDmg:{},baseStats:{hp:1e8,atk:1,def:0}},
    energy:0,energyMax:0,actions:{basic:{name:'等待',type:'Normal',element:'Physical',target:'single',terms:[]}},policy:{basicOnly:true,autoUltimate:false},
  }));
  boss.enemyKit.stageTags=boss.enemyKit.stageTags.filter(tag=>tag.name!=='坚防守备');
  attackers[0].panel.atk=1000;attackers[0].actions.basic.terms=[{scaling:'atk',multiplier:1}];
  const b=createBattle({...arbiterScene,maxAV:280,units:[...attackers,boss,...adds]}),source=b.units.find(u=>u.enemyKit?.id===4064012),attacker=b.units.find(u=>u.id===attackers[0].id);
  for(const unit of b.units)unit.distance=10000;
  attacker.distance=0;
  assert.equal(stepBattle(b),true);
  return b.log.find(e=>e.type==='damage'&&e.actor===attacker.id&&e.target===source.id);
};
const noAddsIncoming=arbiterScaleIncoming(0),fourAddsIncoming=arbiterScaleIncoming(4);
assert.equal(fourAddsIncoming.sceneMechanics[0].layers,4);
assert.ok(Math.abs(fourAddsIncoming.damage/noAddsIncoming.damage-.84)<1e-8,'每只存活忆灵使敌方全体受到伤害降低4%');
const crowdedEnemies=Array.from({length:4},(_,i)=>({id:`arbiter-add-${i+1}`,name:`计数用敌人${i+1}`,side:'enemy',wave:1,level:80,
  panel:{hp:1e8,atk:1,def:0,speed:1,critRate:0,critDmg:0,energyRegen:1,elemDmg:{},baseStats:{hp:1e8,atk:1,def:0}},
  energy:0,energyMax:0,actions:{basic:{name:'等待',type:'Normal',element:'Physical',target:'single',terms:[]}},policy:{basicOnly:true,autoUltimate:false}}));
const crowdedBattle=createBattle({...arbiterBattleConfig,units:[...arbiterAllies,arbiter,...crowdedEnemies]}),crowdedBoss=crowdedBattle.units.find(u=>u.enemyKit?.id===4064012);
for(const unit of crowdedBattle.units.filter(u=>u.side==='ally'||u.id!==crowdedBoss.id))unit.distance=10000;
crowdedBoss.resources['裁定者AIFlag']=2;crowdedBoss.distance=0;
assert.equal(stepBattle(crowdedBattle),true);
assert.equal(crowdedBattle.log.filter(e=>e.type==='action'&&e.actor===crowdedBoss.id).at(-1).key,'skill05',
  'when the enemy team has five members, AIFlag 2 uses the group strike instead of summoning');
arbiterRuntime.hp=1;arbiterRuntime.toughness=0;arbiterRuntime.broken=true;arbiterRuntime.resources['裁定者AIFlag']=4;
receiveDamage(arbiterBattle,arbiterBattle.units.find(u=>u.side==='ally'),arbiterRuntime,10,'true');
assert.equal(arbiterRuntime.hpPhase,2);
assert.equal(arbiterRuntime.hp,arbiter.panel.hp*arbiter.phaseRatios[1]);
assert.equal(arbiterRuntime.toughness,arbiterRuntime.toughnessMax);
assert.equal(arbiterRuntime.resources['裁定者AIFlag'],1);
assert.ok(arbiterBattle.log.some(e=>e.type==='mechanic'&&e.name==='裁定者进入第二血条'));
const arbiterSkill05Total=(fortified)=>{
  const sourceActor=structuredClone(arbiter);
  if(!fortified)sourceActor.enemyKit.stageTags=sourceActor.enemyKit.stageTags.filter(tag=>tag.name!=='坚防守备');
  const attackers=structuredClone(arbiterAllies);
  attackers[0].panel.atk=1000;attackers[0].actions.basic.terms=[{scaling:'atk',multiplier:1}];
  const battle=createBattle({...arbiterBattleConfig,units:[...attackers,sourceActor]}),enemy=battle.units.find(u=>u.childId===406401204),attacker=battle.units.find(u=>u.id===attackers[0].id);
  for(const unit of battle.units.filter(u=>u.side==='ally'))unit.distance=10000;
  attacker.distance=0;enemy.distance=10000;
  assert.equal(stepBattle(battle),true);
  return battle.log.filter(e=>e.type==='damage'&&e.actor===attacker.id&&e.target===enemy.id).reduce((sum,event)=>sum+event.damage,0);
};
const withFortification=arbiterSkill05Total(true),withoutFortification=arbiterSkill05Total(false);
assert.ok(Math.abs(withFortification/withoutFortification-.5)<1e-8,'source-tagged base damage reduction halves incoming damage');
const forcedSaw=structuredClone(arbiter);
forcedSaw.enemyKit.id=406401299;
forcedSaw.policy.rotation=['skill04'];
const arbiterSawConfig={...arbiterBattleConfig,units:[...arbiterAllies,forcedSaw]};
const arbiterSawBattle=createBattle(arbiterSawConfig),arbiterSaw=arbiterSawBattle.units.find(u=>u.childId===406401204);
for(const unit of arbiterSawBattle.units.filter(u=>u.side==='ally'))unit.distance=10000;
arbiterSaw.distance=0;
assert.equal(stepBattle(arbiterSawBattle),true);
const sawHits=arbiterSawBattle.log.filter(e=>e.type==='damage'&&e.actor===arbiterSaw.id&&e.frame.action?.key==='skill04');
assert.equal(sawHits.length,7,'Skill04 uses six 10% hits and one final 40% hit');
assert.ok(sawHits.slice(1,6).every(hit=>Math.abs(hit.damage-sawHits[0].damage)<1e-8));
assert.ok(Math.abs(sawHits[6].damage/sawHits[0].damage-4)<1e-8);
assert.deepEqual(sawHits.map(hit=>hit.hitEnergy),Array(7).fill(15),'each Skill04 AttackData has SPHitRatio 1');
const arbiterSecondPhase=createBattle(arbiterBattleConfig),arbiterPhase2=arbiterSecondPhase.units.find(u=>u.enemyKit?.id===4064012);
arbiterPhase2.hpPhase=2;
for(const unit of arbiterSecondPhase.units.filter(u=>u.side==='ally'))unit.distance=10000;
for(const expected of ['skill05','skill02','skill05']){
  arbiterPhase2.distance=0;
  assert.equal(stepBattle(arbiterSecondPhase),true);
  const action=arbiterSecondPhase.log.filter(e=>e.type==='action'&&e.actor===arbiterPhase2.id).at(-1);
  assert.equal(action.key,expected);
}
assert.equal(arbiterPhase2.resources['裁定者AIFlag'],3,'without OneMore, AIFlag 3 repeats Skill05');
arbiterPhase2.buffs.push({name:'OneMore',tag:'OneMore',modifierName:'OneMore',key:'marker',value:0,remaining:null});
arbiterPhase2.distance=0;assert.equal(stepBattle(arbiterSecondPhase),true);
assert.equal(arbiterSecondPhase.log.filter(e=>e.type==='action'&&e.actor===arbiterPhase2.id).at(-1).key,'skill06');
assert.equal(arbiterPhase2.resources['裁定者AIFlag'],4,'OneMore lets AIFlag 3 move into the target-lock branch');
arbiterPhase2.buffs=arbiterPhase2.buffs.filter(effect=>effect.tag!=='OneMore');
for(const expected of ['skill07','skill03','skill02','skill02','skill05']){
  arbiterPhase2.distance=0;
  assert.equal(stepBattle(arbiterSecondPhase),true);
  const action=arbiterSecondPhase.log.filter(e=>e.type==='action'&&e.actor===arbiterPhase2.id).at(-1);
  assert.equal(action.key,expected);
}
assert.equal(arbiterPhase2.resources['裁定者AIFlag'],3,'AIFlag 8 returns to 3 when OneMore has expired');
const flag8OneMoreBattle=createBattle(arbiterBattleConfig),flag8OneMoreBoss=flag8OneMoreBattle.units.find(u=>u.enemyKit?.id===4064012);
flag8OneMoreBoss.hpPhase=2;flag8OneMoreBoss.resources['裁定者AIFlag']=8;
flag8OneMoreBoss.buffs.push({name:'OneMore',tag:'OneMore',modifierName:'OneMore',key:'marker',value:0,remaining:null});
for(const unit of flag8OneMoreBattle.units.filter(u=>u.side==='ally'))unit.distance=10000;
flag8OneMoreBoss.distance=0;assert.equal(stepBattle(flag8OneMoreBattle),true);
assert.equal(flag8OneMoreBattle.log.filter(e=>e.type==='action'&&e.actor===flag8OneMoreBoss.id).at(-1).key,'skill06');
assert.equal(flag8OneMoreBoss.resources['裁定者AIFlag'],4,'OneMore at AIFlag 8 returns to the lock branch at flag 4');
const wingedScene=inspectEndgameTarget(ctx,{mode:'moc',seasonId:1036,floorId:'5505',side:2});
const wingedRow=wingedScene.enemies.find(unit=>unit.childId===4063010&&unit.wave===0);
assert.ok(wingedRow,'database lineup contains the reusable Winged Serpent template');
assert.equal(isEnemyMechanicRegistered(4063010),true);
const winged=wingedSerpent(ctx,{sceneEnemy:wingedRow,id:'winged-serpent-test'});
assert.deepEqual(validateEnemyActor(winged),[]);
assert.ok(winged.unsupported.some(gap=>gap.includes('动态倍率哈希')));
assert.ok(winged.unsupported.some(gap=>gap.includes('侵蚀')));
const wingedConfig={...probe,maxAV:220,units:[...structuredClone(allies),{...structuredClone(winged),wave:1}]};
assert.deepEqual(validateBattle(wingedConfig),[]);
const wingedBattle=createBattle(wingedConfig),wingedRuntime=wingedBattle.units.find(unit=>unit.id===winged.id);
for(const unit of wingedBattle.units.filter(unit=>unit.side==='ally'))unit.distance=1e6;
wingedRuntime.distance=10000;
for(let i=0;i<12&&wingedBattle.av<220;i++)if(!stepBattle(wingedBattle))break;
const wingedActions=wingedBattle.log.filter(event=>event.type==='action'&&event.actor===wingedRuntime.id);
assert.deepEqual(wingedActions.slice(0,4).map(event=>[event.key,event.kind]),[
  ['skill02','normal'],['skill01','continuation'],['skill03','normal'],['skill04','normal'],
],'OneMorePerTurn branch, charge turn, and seven-hit release follow the source AIFlag cycle');
const vortexHits=wingedBattle.log.filter(event=>event.type==='damage'&&event.actor===wingedRuntime.id&&event.frame.action?.key==='skill04');
assert.equal(vortexHits.length,28,'the source ability contains seven AoE damage packets for four allies');
assert.equal(wingedRuntime.resources['翼蛇形旋绕层数'],0,'罪血涡旋 removes the remaining charge layers');
const counterBattle=createBattle({...wingedConfig,maxAV:150}),counterSerpent=counterBattle.units.find(unit=>unit.id===winged.id),counterAttacker=counterBattle.units.find(unit=>unit.side==='ally');
for(const unit of counterBattle.units.filter(unit=>unit.side==='ally'))unit.distance=1e6;
counterSerpent.distance=10000;
for(let i=0;i<8&&counterBattle.av<150;i++)if(!stepBattle(counterBattle))break;
assert.equal(counterSerpent.resources['翼蛇形旋绕层数'],5,'威慑警戒 grants five source layers');
receiveDamage(counterBattle,counterAttacker,counterSerpent,100,'direct');
receiveDamage(counterBattle,counterAttacker,counterSerpent,100,'direct');
assert.equal(counterBattle.queue.filter(action=>action.actor===counterSerpent.id).length,1,'one counter is inserted per target turn');
stepBattle(counterBattle);
assert.ok(counterBattle.log.some(event=>event.type==='action'&&event.actor===counterSerpent.id&&event.key==='skill05'&&event.kind==='followup'));
assert.equal(counterSerpent.resources['翼蛇形旋绕层数'],4);
counterSerpent.resources['翼蛇形旋绕层数']=1;
counterSerpent.buffs.find(effect=>effect.tag==='wingedSerpentCharge').stacks=1;
counterBattle.rules.onTurnStart(counterBattle,counterBattle.units.find(unit=>unit.side==='ally'&&unit.id!==counterAttacker.id));
counterBattle.attackedTargets=new Set();
receiveDamage(counterBattle,counterAttacker,counterSerpent,100,'direct');
stepBattle(counterBattle);
assert.ok(counterBattle.log.some(event=>event.type==='action'&&event.actor===counterSerpent.id&&event.key==='skill05ToStb'));
assert.equal(counterSerpent.resources['翼蛇形旋绕层数'],0);
assert.ok(!counterSerpent.buffs.some(effect=>effect.tag==='wingedSerpentCharge'));
assert.ok(counterSerpent.buffs.some(effect=>effect.tag==='wingedSerpentOneMorePerTurn'));
console.log('Endgame scene checks: local DB lineups, Arbiter partial scene, Winged Serpent AI/charge counters, staged HP, and control loop passed.');
