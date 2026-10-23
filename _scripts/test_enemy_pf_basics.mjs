import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createContext} from '../core/ctx.mjs';
import {inspectEndgameTarget} from '../simulator/endgame-scenes.mjs';
import {buildEndgameEncounter} from '../simulator/endgame-battles.mjs';
import {automatonHound,blackTideDaemon,bubbleHound,everwinterShadewalker,fictionalEnsemble,flamingShadewalker,maraStruckSoldier,roamingBandit,silvermaneGuard,seniorStaffTeamLeader,strongman,swarmBroodling,tanukiReporter,validateEnemyActor,wraithWarden,yunqiPatrolSoldier} from '../simulator/encounters.mjs';
import {createBattle,simulateBattle,stepBattle,validateBattle} from '../simulator/engine.mjs';
import {strictParty} from '../simulator/party.mjs';

const ctx=createContext(JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url))));
const pfTarget=inspectEndgameTarget(ctx,{mode:'pf',seasonId:2027,floorId:'20271',side:1});
const pfBothSides=inspectEndgameTarget(ctx,{mode:'pf',seasonId:2027,floorId:'20271'});
const source=pfTarget.enemies.find(e=>e.childId===1002040);
assert.ok(source,'PF 2027 20271 side 1 should include the Silvermane Guard');
assert.deepEqual([source.level,source.hp,source.speed,source.stance,source.toughness],[55,23532.8,83,60,20]);
assert.deepEqual(source.aiSource.skillSpecs.find(s=>s.id===100204001).params,[3,.5,2]);
assert.equal(source.infiniteWaveId,'303250113');
assert.equal(pfTarget.infiniteWavePlanComplete,true);
assert.equal(pfBothSides.infiniteWavePlanComplete,true);
const controllerSource=pfTarget.enemies.find(e=>e.childId===8003060);
assert.ok(controllerSource,'PF first source wave should list its group controller');
const controller=fictionalEnsemble(ctx,{sceneEnemy:controllerSource,id:'pf-controller'});
assert.deepEqual(validateEnemyActor(controller),[]);
assert.deepEqual([controller.panel.hp,controller.panel.speed,controller.toughnessMax],[26108.9,83,0]);
assert.equal(controller.unselectable,true);
assert.equal(controller.noAction,true);
assert.equal(pfBothSides.infiniteWavePlans.length,6);
for(const floorId of ['20271','20272','20273','20274']){
  const target=inspectEndgameTarget(ctx,{mode:'pf',seasonId:2027,floorId});
  assert.equal(target.infiniteWavePlanComplete,true,`PF ${floorId} must reconcile both sides' infinite-wave rosters`);
  assert.equal(target.infiniteWavePlans.length,6);
  assert.ok(target.infiniteWavePlans.every(wave=>wave.fieldCapSupported&&
    (wave.waveControllerChildId===8003060||wave.gateCandidateChildId!=null)),
    `PF ${floorId} must identify its unselectable group controller or unique Elite gate and use a supported field cap`);
}
assert.deepEqual(pfTarget.infiniteWavePlans.map(wave=>[wave.id,wave.sourceCount,wave.maxMonsterCount,wave.maxTeammateCount,wave.params]),[
  ['303250111',30,25,5,[0,.5]],['303250112',41,45,5,[0,1.4]],['303250113',41,45,5,[.1,4.2]],
]);
assert.deepEqual(pfTarget.infiniteWavePlans.map(wave=>wave.lineupConsistent),[true,true,true]);
assert.deepEqual(pfTarget.infiniteWavePlans.map(wave=>[wave.gateCandidateChildId,wave.fieldCapSupported]),[
  [null,true],[402301002,true],[403301002,true],
], 'the unselectable group controller is not a kill gate; later waves retain their unique Elite-ranked gates');
assert.deepEqual(pfTarget.infiniteWavePlans.map(wave=>wave.waveControllerChildId),[8003060,null,null]);
assert.deepEqual(pfTarget.infiniteWavePlans.map(wave=>[wave.ability,wave.attackAddedRatio,wave.hpAddedRatio,wave.hpScalingConsistent]),[
  ['FantasticStory_Wave_Ability_0001',0,.5,true],
  ['FantasticStory_Wave_Ability_0001',0,1.4,true],
  ['FantasticStory_Wave_Ability_0001',.1,4.2,true],
]);
assert.deepEqual(pfTarget.infiniteWavePlans[0].monsterGroupIds.slice(0,5),[8003060,4012020,4022010,501211002,4012020],
  'the true ordered spawn roster must be retained alongside grouped HP templates');
assert.deepEqual(pfTarget.enemies.slice(0,4).map(enemy=>enemy.childId),[8003060,4012020,4022010,501211002],
  'scene templates should be ordered by their real infinite-wave sequence');
assert.deepEqual([source.wave,source.templateGroupIndex],[2,0],
  'the actual infinite-wave index must not be confused with the database template group index');
const pfFirstSide=buildEndgameEncounter(ctx,strictParty(ctx),{mode:'pf',seasonId:2027,floorId:'20271',side:1});
assert.equal(pfFirstSide.sceneReplay.enemyLineupComplete,true,'every PF 20271/S1 member is constructible');
assert.equal(pfFirstSide.sceneReplay.enemyBehaviorRegistered,true,'the last two PF 20271/S1 members are registered');
assert.equal(pfFirstSide.sceneReplay.enemyBehaviorComplete,false,
  'the unmodeled season buffs keep the scene explicitly partial');

const reporterSource=pfTarget.enemies.find(enemy=>enemy.childId===501211002);
assert.ok(reporterSource);
assert.equal(reporterSource.behaviorStatus,'registered');
assert.ok(!pfTarget.behaviorGaps.includes('狸猫记者'));
assert.deepEqual(reporterSource.aiSource.skillSpecs.find(skill=>skill.id===501211001).params,[2.8]);
assert.deepEqual(reporterSource.aiSource.skillSpecs.find(skill=>skill.id===501211002).params,[1,.5,10,5,3,.5,.2,.1,2]);
const strongmanSource=pfTarget.enemies.find(enemy=>enemy.childId===4012010);
assert.ok(strongmanSource,'PF 2027 20271 side 1 should include 天谴斗士');
assert.equal(strongmanSource.behaviorStatus,'registered');
assert.deepEqual(strongmanSource.aiSource.skillSpecs.find(skill=>skill.id===401201001).params,[3,.4,1,.4]);
assert.deepEqual(strongmanSource.aiSource.skillSpecs.find(skill=>skill.id===401201002).params,[3,.3,.1,.1,.06,.3]);
const pfBroodTarget=inspectEndgameTarget(ctx,{mode:'pf',seasonId:2027,floorId:'20272',side:2});
const broodSource=pfBroodTarget.enemies.find(enemy=>enemy.childId===8022010);
assert.ok(broodSource,'PF 2027 20272 side 2 should include 幼蛰虫');
assert.equal(broodSource.behaviorStatus,'registered');
assert.deepEqual(broodSource.aiSource.skillSpecs.find(skill=>skill.id===802201001).params,[2,1,.5,3,5]);
assert.deepEqual(broodSource.aiSource.skillSpecs.find(skill=>skill.id===802201002).params,[]);
assert.deepEqual(broodSource.aiSource.skillSpecs.find(skill=>skill.id===802201003).params,[2,1,.08]);
assert.deepEqual(broodSource.aiSource.skillSpecs.find(skill=>skill.id===802201004).params,[.5,1,.1,3,10,30]);
const houndSources=['20271','20272','20273','20274'].flatMap(floorId=>[1,2].flatMap(side=>
  inspectEndgameTarget(ctx,{mode:'pf',seasonId:2027,floorId,side}).enemies)).filter(enemy=>enemy.childId===1012010);
assert.equal(houndSources.length,2,'PF 2027 should contain two sourced Automaton Hounds');
const houndSource=houndSources[0];
assert.equal(houndSource.behaviorStatus,'registered');
assert.deepEqual(houndSource.aiSource.skillSequence.map(action=>Object.values(action)[0]),[101201001,101201002]);
assert.deepEqual(houndSource.aiSource.skillSpecs.map(skill=>[skill.id,skill.params]),[[101201001,[2.5]],[101201002,[.25]]]);
const wraithSources=['20271','20272','20273','20274'].flatMap(floorId=>[1,2].flatMap(side=>
  inspectEndgameTarget(ctx,{mode:'pf',seasonId:2027,floorId,side}).enemies)).filter(enemy=>enemy.childId===2002030);
assert.equal(wraithSources.length,2,'PF 2027 should contain two sourced Wraith Wardens');
const wraithSource=wraithSources[0];
assert.equal(wraithSource.behaviorStatus,'registered');
assert.deepEqual(wraithSource.aiSource.skillSequence.map(action=>Object.values(action)[0]),[200203001]);
assert.deepEqual(wraithSource.aiSource.skillSpecs.find(skill=>skill.id===200203001).params,[2.5,.35,2]);
const frostSources=['20271','20272','20273','20274'].flatMap(floorId=>[1,2].flatMap(side=>
  inspectEndgameTarget(ctx,{mode:'pf',seasonId:2027,floorId,side}).enemies)).filter(enemy=>enemy.childId===1022010);
assert.equal(frostSources.length,1,'PF 2027 should contain one sourced Everwinter Shadewalker');
const frostSource=frostSources[0];
assert.equal(frostSource.behaviorStatus,'registered');
assert.deepEqual(frostSource.aiSource.skillSequence.map(action=>Object.values(action)[0]),[102201001]);
assert.deepEqual(frostSource.aiSource.skillSpecs.find(skill=>skill.id===102201001).params,[3,.5]);
const fireSources=['20271','20272','20273','20274'].flatMap(floorId=>[1,2].flatMap(side=>
  inspectEndgameTarget(ctx,{mode:'pf',seasonId:2027,floorId,side}).enemies)).filter(enemy=>enemy.childId===1022020);
assert.equal(fireSources.length,1,'PF 2027 should contain one sourced Blazing Shadewalker');
const fireSource=fireSources[0];
assert.equal(fireSource.behaviorStatus,'registered');
assert.deepEqual(fireSource.aiSource.skillSequence.map(action=>Object.values(action)[0]),[102202001]);
assert.deepEqual(fireSource.aiSource.skillSpecs.find(skill=>skill.id===102202001).params,[3,1,3,.5]);
const reporter=tanukiReporter(ctx,{sceneEnemy:reporterSource,id:'reporter'});
assert.deepEqual(validateEnemyActor(reporter),[]);
assert.equal(reporter.actions.skill.terms[0].multiplier,2.8);
assert.equal(reporter.actions.skill.hitEnergy,10);
assert.equal(reporter.unsupported.length,1,'fatal-photo scoring and shared Punchline remain explicitly unresolved');
const strongmanActor=strongman(ctx,{sceneEnemy:strongmanSource,id:'strongman'});
assert.deepEqual(validateEnemyActor(strongmanActor),[]);
assert.deepEqual(strongmanActor.actions.skill.terms,[{scaling:'atk',multiplier:3}]);
assert.equal(strongmanActor.actions.skill.hitEnergy,15);
assert.equal(strongmanActor.unsupported.length,1,'the full armor stack / break reaction stays an explicit gap');
const broodActor=swarmBroodling(ctx,{sceneEnemy:broodSource,id:'broodling'});
assert.deepEqual(validateEnemyActor(broodActor),[]);
assert.deepEqual(broodActor.actions.skill.terms,[{scaling:'atk',multiplier:2}]);
assert.equal(broodActor.actions.skill.hitEnergy,10);
assert.equal(broodActor.unsupported.length,2,'spawn and fatal-passive chains stay explicit gaps');
const houndActor=automatonHound(ctx,{sceneEnemy:houndSource,id:'hound'});
assert.deepEqual(validateEnemyActor(houndActor),[]);
assert.deepEqual(houndActor.policy.rotation,['skill','skill05']);
assert.deepEqual(houndActor.actions.skill.terms,[{scaling:'atk',multiplier:2.5}]);
assert.deepEqual(houndActor.actions.skill05.effects,[{type:'heal',target:'allies',scaling:'hp',multiplier:.25}]);
assert.equal(houndActor.enemyKit.healFormula,'HealByHealerMaxHP');
const bubbleSources=['20272','20273'].flatMap(floorId=>inspectEndgameTarget(ctx,{mode:'pf',seasonId:2027,floorId,side:floorId==='20272'?1:2}).enemies)
  .filter(enemy=>enemy.childId===3002030);
assert.equal(bubbleSources.length,2,'PF 2027 should contain two sourced Bubble Hounds');
const bubbleSource=bubbleSources[0];
assert.equal(bubbleSource.behaviorStatus,'registered');
assert.deepEqual(bubbleSource.aiSource.skillSequence.map(action=>Object.values(action)[0]),[300203001]);
assert.deepEqual(bubbleSource.aiSource.skillSpecs.find(skill=>skill.id===300203001).params,[2.5,.3]);
assert.deepEqual(bubbleSource.aiSource.skillSpecs.find(skill=>skill.id===300203002).params,[2,.3,2,.025,100,.01]);
assert.deepEqual(bubbleSource.aiSource.skillSpecs.find(skill=>skill.id===300203003).params,[4]);
const bubbleActor=bubbleHound(ctx,{sceneEnemy:bubbleSource,id:'bubble'});
assert.deepEqual(validateEnemyActor(bubbleActor),[]);
assert.deepEqual(bubbleActor.actions.skill.terms,[{scaling:'atk',multiplier:2.8}],
  'the initialized Current_Layer=1 feeds the sourced 2.5 + 0.3 × layer ratio');
assert.deepEqual(bubbleActor.actions.skill02.terms,[{scaling:'hp',multiplier:.01,target:'adjacent'}]);
assert.equal(bubbleActor.unsupported.length,0,'the normal strike and death-inserted skill are mapped from Ability callbacks');
const leaderSources=['20271','20272','20273','20274'].flatMap(floorId=>[1,2].flatMap(side=>
  inspectEndgameTarget(ctx,{mode:'pf',seasonId:2027,floorId,side}).enemies)).filter(enemy=>enemy.childId===803301011);
assert.equal(leaderSources.length,2,'PF 2027 should contain two sourced Senior Staff Team Leaders');
const leaderSource=leaderSources[0];
assert.equal(leaderSource.behaviorStatus,'registered');
assert.deepEqual(leaderSource.aiSource.skillSpecs.filter(skill=>[803301001,803301002,803301003,803301004,803301005,803301006,803301007].includes(skill.id))
  .map(skill=>[skill.id,skill.params]),[[803301001,[3.2]],[803301002,[3.8]],[803301003,[]],[803301004,[3.6]],
    [803301005,[]],[803301006,[1,.5]],[803301007,[.5]]]);
const leaderActor=seniorStaffTeamLeader(ctx,{sceneEnemy:leaderSource,id:'leader'});
assert.deepEqual(validateEnemyActor(leaderActor),[]);
assert.deepEqual(leaderActor.enemyKit.aiSequence,[803301001,803301002,803301005,803301003,803301004,803301002,803301005,803301002]);
assert.equal(leaderActor.enemyKit.oneMorePerTurn,true);
assert.deepEqual(leaderActor.actions.skill01.terms,[{scaling:'atk',multiplier:3.2}]);
assert.deepEqual(leaderActor.actions.skill06.hitShares,[.3,.3,.4]);
assert.deepEqual(leaderActor.actions.skill03.hitShares,Array(8).fill(.125));
assert.ok(leaderActor.unsupported.some(item=>item.includes('绩效点受击 / 击破 / 死亡时转移')),
  'company-coin teammate transfer and break/death behavior remain visible as a strict-mode gap');
const wraithActor=wraithWarden(ctx,{sceneEnemy:wraithSource,id:'wraith'});
assert.deepEqual(validateEnemyActor(wraithActor),[]);
assert.deepEqual(wraithActor.actions.skill.terms,[{scaling:'atk',multiplier:2.5}]);
assert.equal(wraithActor.unsupported.length,1,'the shared MCommon status condition remains an explicit gap');
const frostActor=everwinterShadewalker(ctx,{sceneEnemy:frostSource,id:'frost'});
assert.deepEqual(validateEnemyActor(frostActor),[]);
assert.deepEqual(frostActor.actions.skill.terms,[{scaling:'atk',multiplier:3}]);
assert.deepEqual(frostActor.actions.skill.effects,[{type:'delay',value:.5}]);
assert.equal(frostActor.unsupported.length,0,'the sourced attack and action delay are fully mapped');
const fireActor=flamingShadewalker(ctx,{sceneEnemy:fireSource,id:'fire'});
assert.deepEqual(validateEnemyActor(fireActor),[]);
assert.deepEqual(fireActor.actions.skill.terms,[{scaling:'atk',multiplier:3}]);
assert.deepEqual(fireActor.actions.skill.effects,[{type:'dot',key:'burn',name:'灼烧',element:'Fire',debuff:true,
  duration:3,tickAt:'start',terms:[{scaling:'atk',multiplier:.5}]}]);
assert.equal(fireActor.unsupported.length,0,'the sourced guaranteed burn has explicit chance, lifetime and tick ratio');
const yunqiScene=inspectEndgameTarget(ctx,{mode:'pf',seasonId:2027,floorId:'20274',side:2});
const yunqiSource=yunqiScene.enemies.find(enemy=>enemy.childId===2002010);
assert.ok(yunqiSource,'PF 2027 20274 side 2 should include 云骑巡防士卒');
assert.equal(yunqiSource.behaviorStatus,'registered');
assert.deepEqual(yunqiSource.aiSource.skillSequence.map(action=>Object.values(action)[0]),[200201001]);
assert.deepEqual(yunqiSource.aiSource.skillSpecs.find(skill=>skill.id===200201001).params,[2.5,1,2,.25]);
const yunqiActor=yunqiPatrolSoldier(ctx,{sceneEnemy:yunqiSource,id:'yunqi'});
assert.deepEqual(validateEnemyActor(yunqiActor),[]);
assert.deepEqual(yunqiActor.actions.skill.terms,[{scaling:'atk',multiplier:2.5}]);
assert.equal(yunqiActor.actions.skill.hitEnergy,15);
assert.equal(yunqiActor.unsupported.length,1,'damage-taken modifier and non-sequence triggers stay explicit until Ability mapping is available');

const guard=silvermaneGuard(ctx,{sceneEnemy:source,id:'guard'});
assert.deepEqual(validateEnemyActor(guard),[]);
assert.equal(guard.actions.skill.name,'奔袭');
assert.equal(guard.actions.skill.terms[0].multiplier,3);
assert.equal(guard.unsupported.length,1,'the absent defense-down magnitude must remain an explicit gap');
const basic={name:'测试普攻',type:'Normal',element:'Physical',target:'single',terms:[{scaling:'atk',multiplier:0}],hitEnergy:0};
const allies=Array.from({length:4},(_,i)=>({id:`ally-${i+1}`,name:`测试队员${i+1}`,side:'ally',level:80,aggro:i===0?100:0,
  panel:{hp:1e8,atk:100,def:100,speed:1,critRate:0,critDmg:0,effectRes:0,controlRes:0,energyRegen:1,elemDmg:{},baseStats:{hp:1e8,atk:100,def:100,speed:1}},
  energy:0,energyMax:100,actions:{basic:{...basic}},policy:{basicOnly:true,autoUltimate:false}}));
const config={strict:false,sp:3,maxSP:5,maxAV:121,critMode:'noncrit',seed:7,units:[...allies,guard]};
assert.deepEqual(validateBattle(config),[]);
assert.deepEqual(validateBattle({...config,strict:true,units:[...allies,houndActor]}),[],
  'the fully sourced hound attack/heal loop should pass strict enemy validation');
assert.deepEqual(validateBattle({...config,strict:true,units:[...allies,frostActor]}),[],
  'the fully sourced frost attack and action delay should pass strict enemy validation');
assert.deepEqual(validateBattle({...config,strict:true,units:[...allies,fireActor]}),[],
  'the fully sourced fire attack and burn should pass strict enemy validation');
assert.deepEqual(validateBattle({...config,strict:true,units:[...allies,bubbleActor]}),[],
  'the sourced Bubble Hound loop and death insert should pass strict enemy validation');
assert.ok(validateBattle({...config,strict:true,units:[...allies,leaderActor]}).some(error=>error.includes('公司货币队友转移')),
  'strict mode must reject unmodeled Team Leader company-coin interactions');
assert.ok(validateBattle({...config,strict:true,units:[...allies,yunqiActor]}).some(error=>error.includes('Ability 参数映射')),
  'strict mode must reject the unresolved Yunqi damage-taken modifier');
assert.ok(validateBattle({...config,strict:true,units:[...allies,wraithActor]}).some(error=>error.includes('共享状态来源')),
  'strict mode must continue to reject the unresolved shared status chain');
const replay=simulateBattle(config);
assert.ok(replay.log.some(e=>e.type==='action'&&e.actor==='guard'&&e.key==='skill'&&e.name==='奔袭'));
assert.ok(replay.log.some(e=>e.type==='damage'&&e.actor==='guard'&&e.damage>0));
const yunqiReplay=simulateBattle({...config,units:[...allies,yunqiActor]});
assert.ok(yunqiReplay.log.some(e=>e.type==='action'&&e.actor==='yunqi'&&e.key==='skill'&&e.name==='云刃'));
assert.ok(yunqiReplay.log.some(e=>e.type==='damage'&&e.actor==='yunqi'&&e.damage>0));
const reporterReplay=simulateBattle({...config,units:[...allies,reporter]});
assert.ok(reporterReplay.log.some(e=>e.type==='action'&&e.actor==='reporter'&&e.key==='skill'&&e.name==='抓拍'));
assert.ok(reporterReplay.log.some(e=>e.type==='damage'&&e.actor==='reporter'&&e.damage>0));
const wraithReplay=simulateBattle({...config,units:[...allies,wraithActor]});
assert.ok(wraithReplay.log.some(e=>e.type==='action'&&e.actor==='wraith'&&e.key==='skill'&&e.name==='锯恶'));
assert.ok(wraithReplay.log.some(e=>e.type==='damage'&&e.actor==='wraith'&&e.damage>0));
const frostReplay=simulateBattle({...config,units:[...allies,frostActor]});
assert.ok(frostReplay.log.some(e=>e.type==='action'&&e.actor==='frost'&&e.key==='skill'&&e.name==='霜冻重击'));
assert.ok(frostReplay.log.some(e=>e.type==='damage'&&e.actor==='frost'&&e.damage>0));
assert.ok(frostReplay.log.some(e=>e.type==='delay'&&e.ratio===.5),'霜冻重击 must delay its selected target by 50%');
const fireReplayAllies=structuredClone(allies);
fireReplayAllies[0].panel.speed=180;fireReplayAllies[0].panel.baseStats.speed=180;fireReplayAllies[0].baseSpeed=180;
const fireReplay=simulateBattle({...config,maxAV:150,units:[...fireReplayAllies,fireActor]});
assert.ok(fireReplay.log.some(e=>e.type==='action'&&e.actor==='fire'&&e.key==='skill'&&e.name==='灼炎重击'));
assert.ok(fireReplay.log.some(e=>e.type==='dot'&&e.actor==='fire'&&e.target==='ally-1'&&e.duration===3),
  '灼炎重击 must apply the sourced three-turn burn to its selected target');
assert.ok(fireReplay.log.some(e=>e.type==='damage'&&e.actor==='fire'&&e.target==='ally-1'&&e.kind==='dot'&&e.damage>0),
  'the burn must tick at the target turn start');
const strongmanReplay=simulateBattle({...config,units:[...allies,strongmanActor]});
assert.ok(strongmanReplay.log.some(e=>e.type==='action'&&e.actor==='strongman'&&e.key==='skill'&&e.name==='第三轨道的冲撞'));
assert.ok(strongmanReplay.log.some(e=>e.type==='damage'&&e.actor==='strongman'&&e.damage>0));
const broodReplay=simulateBattle({...config,units:[...allies,broodActor]});
assert.ok(broodReplay.log.some(e=>e.type==='action'&&e.actor==='broodling'&&e.key==='skill'&&e.name==='振翅'));
assert.ok(broodReplay.log.some(e=>e.type==='damage'&&e.actor==='broodling'&&e.damage>0));
const leaderReplayActor=structuredClone(leaderActor);
leaderReplayActor.panel.hp=1e8;leaderReplayActor.panel.baseStats.hp=1e8;
leaderReplayActor.panel.atk=100;leaderReplayActor.panel.baseStats.atk=100;
leaderReplayActor.panel.speed=1000;leaderReplayActor.panel.baseStats.speed=1000;leaderReplayActor.baseSpeed=1000;
const leaderReplay=simulateBattle({...config,maxAV:61,units:[...structuredClone(allies),leaderReplayActor]});
assert.deepEqual(leaderReplay.log.filter(event=>event.type==='action'&&event.actor==='leader').map(event=>event.key),
  ['skill01','skill01','skill06','skill04','skill02','skill03','skill06','skill04','skill06','skill01','skill06','skill04'],
  'OneMorePerTurn and the conditional AIFlag cycle must not collapse into one repeated single-target attack');
assert.ok(leaderReplay.log.some(event=>event.type==='buff'&&event.actor==='leader'&&event.name==='绩效点 · 全伤害提高'&&event.value===.5),
  'the passive adds the sourced 50% all-damage performance coin after the first attack');
const companyAttack=leaderReplay.log.findIndex(event=>event.type==='action'&&event.actor==='leader'&&event.key==='skill03');
const nextLeaderAction=leaderReplay.log.findIndex((event,index)=>index>companyAttack&&event.type==='action'&&event.actor==='leader');
assert.equal(leaderReplay.log.slice(companyAttack+1,nextLeaderAction).filter(event=>event.type==='damage'&&event.actor==='leader').length,32,
  'Enterprise Culture Impact must make eight damage segments against each of the four allies');
assert.ok(leaderReplay.log.some(event=>event.type==='mechanic'&&event.actor==='leader'&&event.name==='【培训中…】蓄力解除'),
  'the charge marker is removed when the sourced eight-hit attack starts');
const breakLeader=structuredClone(leaderActor);breakLeader.id='leader-break';breakLeader.panel.hp=1e8;breakLeader.panel.baseStats.hp=1e8;breakLeader.panel.speed=1;breakLeader.panel.baseStats.speed=1;breakLeader.baseSpeed=1;
const breaker=structuredClone(allies[0]);breaker.id='leader-breaker';breaker.panel.speed=2000;breaker.panel.baseStats.speed=2000;breaker.baseSpeed=2000;
breaker.actions={basic:{name:'测试破韧',type:'Normal',element:'Fire',target:'single',terms:[{scaling:'atk',multiplier:0}],hitEnergy:0,toughness:breakLeader.toughnessMax}};
breaker.policy={autoUltimate:false,turnPlan:[{turn:1,key:'basic',targetId:'leader-break'}]};
const breakLeaderReplay=simulateBattle({...config,maxAV:6,units:[breaker,...structuredClone(allies).slice(1),breakLeader]});
assert.ok(breakLeaderReplay.log.some(event=>event.type==='mechanic'&&event.actor==='leader-break'&&event.name==='弱点击破 · 重置资深员工组长 AI'&&event.from===1&&event.to===9),
  'a sourced weakness break at AIFlag 1 redirects the next choice to the break-recovery skill');
const houndForHeal=structuredClone(houndActor);
houndForHeal.panel.hp=4000;houndForHeal.panel.baseStats.hp=4000;houndForHeal.currentHp=2000;
houndForHeal.panel.speed=100;houndForHeal.baseSpeed=100;
const houndBuddy={id:'hound-buddy',name:'受伤的战犬同伴',side:'enemy',level:1,panel:{hp:4000,atk:1,def:0,speed:1,critRate:0,critDmg:0,effectRes:0,controlRes:0,energyRegen:1,elemDmg:{},baseStats:{hp:4000,atk:1,def:0,speed:1}},baseSpeed:1,
  currentHp:1000,energy:0,energyMax:0,actions:{basic:{name:'待机',type:'Normal',target:'self',terms:[],hitEnergy:0}},policy:{autoUltimate:false,basicOnly:true}};
const houndHealReplay=simulateBattle({...config,maxAV:220,units:[...allies,houndForHeal,houndBuddy]});
const houndKeys=houndHealReplay.log.filter(e=>e.type==='action'&&e.actor==='hound').map(e=>e.key);
assert.deepEqual(houndKeys,['skill','skill05'],'the sourced AI must alternate strike and whole-team heal');
assert.deepEqual(houndHealReplay.log.filter(e=>e.type==='heal'&&e.actor==='hound').map(e=>[e.target,e.amount]),[['hound',1000],['hound-buddy',1000]],
  'each teammate must recover 25% of the healer hound\'s own max HP');
const bubbleAllies=structuredClone(allies).map((unit,index)=>({...unit,initialAdvance:index===1?1:0}));
for(const unit of bubbleAllies){
  unit.panel.hp=100000;unit.panel.baseStats.hp=100000;unit.panel.speed=1000;unit.panel.baseStats.speed=1000;unit.baseSpeed=1000;
  unit.panel.atk=100;unit.panel.baseStats.atk=100;unit.actions={basic:{name:'测试攻击',type:'Normal',element:'Physical',target:'single',terms:[{scaling:'atk',multiplier:0}],hitEnergy:0}};
  unit.policy={autoUltimate:false,rotation:['basic']};
}
const bubbleKiller=bubbleAllies[1];
bubbleKiller.actions.basic.terms=[{scaling:'atk',multiplier:1000}];
bubbleKiller.policy.turnPlan=[{turn:1,key:'basic',targetId:'bubble-death'}];
const bubbleMultiAllies=structuredClone(allies).map((unit,index)=>({...unit,initialAdvance:index===1?1:0}));
for(const unit of bubbleMultiAllies){
  unit.panel.hp=100000;unit.panel.baseStats.hp=100000;unit.panel.speed=1000;unit.panel.baseStats.speed=1000;unit.baseSpeed=1000;
  unit.actions={basic:{name:'测试多段攻击',type:'Normal',element:'Physical',target:'single',terms:[{scaling:'atk',multiplier:0}],hitEnergy:0}};
  unit.policy={autoUltimate:false,rotation:['basic']};
}
bubbleMultiAllies[1].actions.basic.hitShares=[.5,.5];
bubbleMultiAllies[1].policy.turnPlan=[{turn:1,key:'basic',targetId:'bubble-multi'}];
const bubbleMultiReplay=simulateBattle({strict:true,sp:3,maxSP:5,maxAV:.1,critMode:'noncrit',seed:7,
  units:[...bubbleMultiAllies,{...structuredClone(bubbleActor),id:'bubble-multi'}]});
assert.deepEqual(bubbleMultiReplay.log.filter(event=>event.type==='resource'&&event.actor==='bubble-multi'&&event.name==='苏乐达陶醉层数').map(event=>event.value),[0,1],
  'two damage segments in one attack add only one tipsiness layer');
const bubbleForDeath=structuredClone(bubbleActor);bubbleForDeath.id='bubble-death';bubbleForDeath.currentHp=1;
const inertEnemy={id:'inert-enemy',name:'测试留场敌人',side:'enemy',level:1,cannotAct:true,panel:{hp:1e8,atk:1,def:0,speed:1,critRate:0,critDmg:0,effectRes:0,energyRegen:1,elemDmg:{},baseStats:{hp:1e8,atk:1,def:0,speed:1}},baseSpeed:1,
  actions:{basic:{name:'待机',type:'Normal',element:'Physical',target:'single',terms:[],hitEnergy:0}},policy:{autoUltimate:false,basicOnly:true}};
const bubbleDeathReplay=simulateBattle({strict:true,sp:3,maxSP:5,maxAV:15,critMode:'noncrit',seed:7,units:[...bubbleAllies,bubbleForDeath,inertEnemy]});
assert.ok(bubbleDeathReplay.log.some(event=>event.type==='action'&&event.actor==='bubble-death'&&event.key==='skill02'&&event.kind==='extra'),
  'a lethal hit must trigger the Bubble Hound death-inserted skill before wave completion');
const bubbleRetaliation=bubbleDeathReplay.log.filter(event=>event.type==='damage'&&event.actor==='bubble-death'&&event.kind==='direct');
assert.deepEqual(bubbleRetaliation.map(event=>event.target).sort(),['ally-1','ally-3'],
  'the death insert damages only the two allies adjacent to its fatal attacker');
assert.ok(bubbleDeathReplay.log.some(event=>event.type==='buff'&&event.actor==='bubble-death'&&event.target==='ally-1'&&event.key==='speedPct'&&event.value===.3&&event.duration===2));
assert.ok(bubbleDeathReplay.log.some(event=>event.type==='dot'&&event.actor==='bubble-death'&&event.target==='ally-3'&&event.name==='裂伤'&&event.stacks===1&&event.duration===2),
  'the lethal hit adds one tipsiness layer before the inserted action applies the corresponding Bleed layers');
assert.ok(bubbleDeathReplay.log.some(event=>event.type==='damage'&&event.actor==='bubble-death'&&event.target==='ally-1'&&event.kind==='dot'&&event.damage>0),
  'the inserted Physical Bleed ticks from the hound HP snapshot on the adjacent target turn');
const roamingTarget=inspectEndgameTarget(ctx,{mode:'pf',seasonId:2027,floorId:'20271',side:2});
const roamingSource=roamingTarget.enemies.find(enemy=>enemy.childId===1002020);
assert.ok(roamingSource,'PF 2027 20271 side 2 should include 流浪者');
assert.equal(roamingSource.behaviorStatus,'registered');
assert.deepEqual(roamingSource.aiSource.skillSpecs.filter(skill=>[100202001,100202002].includes(skill.id)).map(skill=>[skill.id,skill.params]),
  [[100202001,[2.5]],[100202002,[.3,0,2]]]);
const roamingActor=roamingBandit(ctx,{sceneEnemy:roamingSource,id:'roaming'});
assert.deepEqual(validateEnemyActor(roamingActor),[]);
assert.equal(roamingActor.actions.skill.hitEnergy,10);
assert.deepEqual(roamingActor.actions.skill02.effects.map(effect=>[effect.type,effect.key??null,effect.value??null,effect.duration??null]),
  [['buff','atkPct',.3,2],['advance',null,1,null]]);
const roamingForReplay=structuredClone(roamingActor);
roamingForReplay.panel.hp=1e8;roamingForReplay.panel.baseStats.hp=1e8;
roamingForReplay.panel.speed=1000;roamingForReplay.panel.baseStats.speed=1000;roamingForReplay.baseSpeed=1000;
const banditBuddy={id:'bandit-buddy',name:'同侧敌人',side:'enemy',monsterId:1002030,childId:1002030,level:70,
  panel:{hp:1e8,atk:1,def:100,speed:1,critRate:0,critDmg:0,effectRes:0,controlRes:0,energyRegen:1,elemDmg:{},baseStats:{hp:1e8,atk:1,def:100,speed:1}},
  baseSpeed:1,energy:0,energyMax:0,toughnessMax:20,weaknesses:[],res:{},actions:{basic:{...basic}},policy:{basicOnly:true,autoUltimate:false}};
const roamingReplay=simulateBattle({...config,maxAV:31,units:[...structuredClone(allies),roamingForReplay,banditBuddy]});
assert.ok(roamingReplay.log.some(event=>event.type==='action'&&event.actor==='roaming'&&event.key==='skill02'&&event.name==='鼓舞'));
assert.ok(roamingReplay.log.some(event=>event.type==='buff'&&event.actor==='roaming'&&event.target==='bandit-buddy'&&
  event.key==='atkPct'&&event.value===.3&&event.duration===2),'鼓舞 grants exactly two turns of 30% ATK');
assert.ok(roamingReplay.log.some(event=>event.type==='advance'&&event.actor==='bandit-buddy'&&event.ratio===1),
  '鼓舞 sets its selected teammate action delay to zero');
assert.ok(roamingReplay.log.some(event=>event.type==='action'&&event.actor==='bandit-buddy'),
  'the 100% action advance lets the selected enemy teammate act immediately');
const maraScene=inspectEndgameTarget(ctx,{mode:'pf',seasonId:2027,floorId:'20271',side:2});
const maraSource=maraScene.enemies.find(enemy=>enemy.childId===2022010);
assert.ok(maraSource,'PF 2027 20271 side 2 should include 魔阴身士卒');
assert.equal(maraSource.behaviorStatus,'registered');
assert.deepEqual(maraSource.aiSource.skillSequence.map(action=>Object.values(action)[0]),[202201001]);
assert.deepEqual(maraSource.aiSource.skillSpecs.find(skill=>skill.id===202201001).params,[2,2,3,.5,1]);
const maraActor=maraStruckSoldier(ctx,{sceneEnemy:maraSource,id:'mara'});
assert.deepEqual(validateEnemyActor(maraActor),[]);
assert.deepEqual(maraActor.actions.skill.terms,[{scaling:'atk',multiplier:2}]);
assert.deepEqual(maraActor.actions.skill.hitShares,[.25,.25,.5]);
assert.equal(maraActor.actions.skill.hitEnergy,15);
assert.equal(maraActor.unsupported.length,1,'unprovided toughness damage remains an explicit partial-implementation gap');
assert.ok(validateBattle({...config,strict:true,units:[...structuredClone(allies),maraActor]}).some(error=>error.includes('削韧数值')),
  'strict validation must keep the missing toughness value visible');
const maraTestAllies=structuredClone(allies).map(unit=>({...unit,panel:{...unit.panel,hp:1e8,def:100,speed:1,
  baseStats:{...unit.panel.baseStats,hp:1e8,def:100,speed:1}},baseSpeed:1}));
const maraStackActor=structuredClone(maraActor);maraStackActor.panel={...maraStackActor.panel,speed:1000,
  baseStats:{...maraStackActor.panel.baseStats,speed:1000}};maraStackActor.baseSpeed=1000;maraStackActor.actions.skill.targetId='ally-1';
const maraStackBattle=createBattle({strict:false,sp:3,maxSP:5,maxAV:100,critMode:'noncrit',seed:7,
  units:[...maraTestAllies,maraStackActor]});
assert.ok(maraStackBattle.units.find(unit=>unit.id==='mara').buffs.some(effect=>effect.tag==='maraSoldierRevive'&&effect.debuff),
  'the one-time revive passive is represented as a dispellable status');
for(let i=0;i<3;i++)stepBattle(maraStackBattle);
const windShearTarget=maraStackBattle.units.find(unit=>unit.id==='ally-1');
const windShear=windShearTarget.dots.find(effect=>effect.source==='mara');
assert.equal(windShear.stacks,5,'wind shear adds two layers per successful hit, capped at five');
assert.equal(windShear.remaining,3,'wind shear duration refreshes to three turns on reapplication');
assert.deepEqual(windShear.terms,[{scaling:'atk',multiplier:2.5}],
  'wind shear snapshots the Mara soldier attack and deals 50% per layer');
assert.equal(windShear.snapshotAtk,maraStackActor.panel.atk);
for(const unit of maraStackBattle.units)if(unit!==windShearTarget)unit.distance=1e6;
windShearTarget.distance=0;
assert.equal(stepBattle(maraStackBattle),true);
assert.ok(maraStackBattle.log.some(event=>event.type==='damage'&&event.actor==='mara'&&event.target==='ally-1'&&event.kind==='dot'&&event.element==='Wind'),
  'the five-layer Wind shear ticks at the afflicted unit turn');
const maraCleanserAllies=structuredClone(maraTestAllies);maraCleanserAllies[0].panel.speed=1000;
maraCleanserAllies[0].panel.baseStats.speed=1000;maraCleanserAllies[0].baseSpeed=1000;
maraCleanserAllies[0].actions.basic={name:'驱散测试',type:'Normal',element:'Physical',target:'single',terms:[],hitEnergy:0,
  effects:[{type:'cleanse',target:'enemies'}]};
const maraCleanseBattle=createBattle({strict:false,sp:3,maxSP:5,maxAV:100,critMode:'noncrit',seed:7,
  units:[...maraCleanserAllies,structuredClone(maraActor)]});
stepBattle(maraCleanseBattle);
assert.ok(!maraCleanseBattle.units.find(unit=>unit.id==='mara').buffs.some(effect=>effect.tag==='maraSoldierRevive'),
  'the revive status can be removed before the passive triggers');
const maraReviveAllies=structuredClone(allies);maraReviveAllies[0].panel={...maraReviveAllies[0].panel,atk:1e6,speed:1000,
  baseStats:{...maraReviveAllies[0].panel.baseStats,atk:1e6,speed:1000}};maraReviveAllies[0].baseSpeed=1000;
maraReviveAllies[0].actions.basic={name:'致命测试',type:'Normal',element:'Quantum',target:'single',targetId:'mara-revive',
  terms:[{scaling:'atk',multiplier:1}],hitEnergy:0};
const maraReviveActor=structuredClone(maraActor);maraReviveActor.id='mara-revive';maraReviveActor.panel={...maraReviveActor.panel,hp:1000,
  baseStats:{...maraReviveActor.panel.baseStats,hp:1000}};
const maraReviveBattle=createBattle({strict:false,sp:3,maxSP:5,maxAV:100,critMode:'noncrit',seed:7,
  units:[...maraReviveAllies,maraReviveActor]});
const maraReviveTarget=maraReviveBattle.units.find(unit=>unit.id==='mara-revive');
maraReviveTarget.buffs.push({type:'buff',id:'mara-revive-benefit',name:'测试增益',key:'atkPct',value:.2,debuff:false,remaining:3});
maraReviveTarget.buffs.push({type:'buff',id:'mara-revive-debuff',name:'测试负面状态',key:'vuln',value:.2,debuff:true,remaining:3});
maraReviveTarget.dots.push({type:'dot',id:'mara-revive-dot',name:'测试持续伤害',source:'ally-1',debuff:true,remaining:3});
stepBattle(maraReviveBattle);
const maraAfterRevive=maraReviveBattle.units.find(unit=>unit.id==='mara-revive');
assert.equal(maraAfterRevive.hp,500,'one lethal hit restores exactly 50% of maximum HP');
assert.ok(maraAfterRevive.buffs.some(effect=>effect.id==='mara-revive-benefit'),
  'the sourced default debuff dispel preserves positive buffs');
assert.ok(!maraAfterRevive.buffs.some(effect=>effect.id==='mara-revive-debuff')&&maraAfterRevive.dots.length===0,
  'the revive removes debuffs and DoTs from the soldier');
assert.ok(maraReviveBattle.log.some(event=>event.type==='cleanse'&&event.actor==='mara-revive'&&event.name==='复起'&&
  event.debuffs===2&&event.dots===1),'the silent dispel is recorded with the number of cleared statuses');
assert.ok(maraAfterRevive.buffs.some(effect=>effect.tag==='maraSoldierReviveSpeed'&&effect.value===.5&&effect.remaining==null),
  'the sourced revive applies a permanent 50% speed increase');
assert.ok(maraReviveBattle.log.some(event=>event.type==='mechanic'&&event.actor==='mara-revive'&&event.name==='复起'&&event.hp===500));
assert.ok(!maraReviveBattle.log.some(event=>event.type==='death'&&event.actor==='mara-revive'),
  'the first fatal hit is intercepted by the revival');
stepBattle(maraReviveBattle);
assert.ok(maraReviveBattle.log.some(event=>event.type==='death'&&event.actor==='mara-revive'),
  'the revival cannot trigger a second time in the same battle');
const maraShieldBattle=createBattle({strict:false,sp:3,maxSP:5,maxAV:100,critMode:'noncrit',seed:7,
  units:[...maraTestAllies,structuredClone(maraActor)]});
const maraShieldTarget=maraShieldBattle.units.find(unit=>unit.id==='mara');
maraShieldTarget.shields.push({type:'shield',id:'mara-revive-shield',name:'测试护盾',source:'ally-1',value:1234,remaining:3});
assert.equal(maraShieldBattle.rules.beforeLethal(maraShieldBattle,maraShieldBattle.units[0],maraShieldTarget,1e6),true);
assert.ok(maraShieldTarget.shields.some(effect=>effect.id==='mara-revive-shield'),
  'the default debuff dispel preserves shields');
const blackTideSource=pfTarget.enemies.find(enemy=>enemy.childId===403301002);
assert.ok(blackTideSource,'PF 2027 20271/S1 should include the Black Tide Corroded Daemon');
assert.equal(blackTideSource.behaviorStatus,'registered');
assert.deepEqual([blackTideSource.level,blackTideSource.hp,blackTideSource.speed,blackTideSource.stance,blackTideSource.toughness],
  [55,1493429.7,120,480,160]);
const blackTideSecondScene=inspectEndgameTarget(ctx,{mode:'pf',seasonId:2027,floorId:'20272',side:2});
const blackTideSecondSource=blackTideSecondScene.enemies.find(enemy=>enemy.childId===403301002);
assert.ok(blackTideSecondSource,'PF 2027 20272/S2 should also include the Black Tide Corroded Daemon');
assert.deepEqual([blackTideSecondSource.level,blackTideSecondSource.hp,blackTideSecondSource.speed,blackTideSecondSource.toughness],
  [65,2946619.1,120,160]);
assert.deepEqual(validateEnemyActor(blackTideDaemon(ctx,{sceneEnemy:blackTideSecondSource,id:'black-tide-second'})),[]);
assert.deepEqual(blackTideSource.aiSource.skillSpecs.filter(skill=>[403301001,403301002,403301005,403301006,403301007].includes(skill.id))
  .map(skill=>[skill.id,skill.params]),[[403301001,[3]],[403301002,[2.4,4]],[403301005,[4.5,.2]],
    [403301006,[3,.5,.2,0,.5]],[403301007,[.3,1]]]);
const blackTideActor=blackTideDaemon(ctx,{sceneEnemy:blackTideSource,id:'black-tide-test'});
assert.deepEqual(validateEnemyActor(blackTideActor),[]);
assert.equal(blackTideActor.actions.skill01.terms[0].multiplier,3);
assert.equal(blackTideActor.actions.skill02.randomUniqueHitTargets,true);
assert.deepEqual(blackTideActor.actions.skill02.hitShares,Array(5).fill(.2));
assert.deepEqual(blackTideActor.unsupported.length,3,'Erosion, Charge/OneMore state and sourced toughness remain visible strict-mode blockers');
assert.ok(validateBattle({strict:true,sp:3,maxSP:5,maxAV:100,units:[blackTideActor]}).some(error=>error.includes('【侵蚀】')),
  'strict validation must continue rejecting the incomplete Erosion mechanic');
const blackTideParty=Array.from({length:4},(_,index)=>({id:'bt-ally-'+index,name:'测试我方 '+index,side:'ally',level:80,element:'Physical',
  panel:{hp:1000000,atk:100,def:100,speed:1,critRate:0,critDmg:0,effectRes:0,energyRegen:1,elemDmg:{},baseStats:{hp:1000000,atk:100,def:100,speed:1}},
  energy:0,energyMax:100,toughnessMax:20,weaknesses:[],res:{},actions:{basic:{name:'等待',type:'Normal',element:'Physical',target:'single',terms:[],hitEnergy:0}},
  policy:{basicOnly:true,autoUltimate:false}}));
const blackTideFast=structuredClone(blackTideActor);
blackTideFast.panel={...blackTideFast.panel,speed:1000,baseStats:{...blackTideFast.panel.baseStats,speed:1000}};
blackTideFast.baseSpeed=1000;
const blackTideBattle=createBattle({strict:false,sp:3,maxSP:5,maxAV:100,critMode:'noncrit',seed:7,units:[...blackTideParty,blackTideFast]});
stepBattle(blackTideBattle);stepBattle(blackTideBattle);stepBattle(blackTideBattle);
const blackTideActions=blackTideBattle.log.filter(event=>event.type==='action'&&event.actor==='black-tide-test');
assert.deepEqual(blackTideActions.map(event=>event.key),['skill01','skill02','skill06','skill02','skill06','skill02'],
  'each natural turn resolves one OneMorePerTurn continuation using the next AIFlag branch');
const blackTideHits=blackTideBattle.log.filter(event=>event.type==='damage'&&event.actor==='black-tide-test');
assert.equal(blackTideHits.length,16,'Skill01 deals one hit and each of three Skill02 actions resolves five separate projectile hits');
const projectileCounts=blackTideHits.slice(1,6).reduce((counts,event)=>counts.set(event.target,(counts.get(event.target)??0)+1),new Map());
assert.deepEqual([...projectileCounts.values()].sort(),[1,1,1,2],
  'Skill02 selects each of four living allies once before clearing its marks and selecting a fifth target');
assert.ok(blackTideBattle.log.some(event=>event.type==='buff'&&event.actor==='black-tide-test'&&event.key==='defPct'&&event.value===-.3&&event.duration===1),
  'Skill06 lowers the daemon defense by 30% for one turn');
console.log('PF checks: ordered infinite-wave rosters, unique inferred gate candidates, sourced Silvermane Guard / Automaton Hound / Bubble Hound / Everwinter and Blazing Shadewalkers / 流浪者 / 魔阴身士卒 / 幽府武弁 / 云骑巡防士卒 / 天谴斗士 / 幼蛰虫 / 资深员工·组长 / Tanuki Reporter / 黑潮蚀魔 mechanics, explicit passive gaps, and remaining full-scene blockers are covered.');
