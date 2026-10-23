import assert from 'node:assert/strict';
import { simulateBattle, validateBattle } from '../simulator/engine.mjs';

const panel=(hp,atk,speed)=>({hp,atk,def:0,speed,critRate:0,critDmg:0,effectRes:0,controlRes:0,
  energyRegen:1,elemDmg:{},baseStats:{hp,atk,def:0,speed}});
const harmless={name:'不造成伤害的测试攻击',type:'Normal',element:'Physical',target:'single',terms:[{scaling:'atk',multiplier:0}],hitEnergy:0};
const kill={name:'测试击杀',type:'Normal',element:'Physical',target:'single',terms:[{scaling:'atk',multiplier:100}],hitEnergy:0};
const allies=Array.from({length:4},(_,i)=>({id:`ally-${i+1}`,name:`测试队员${i+1}`,side:'ally',level:80,
  panel:panel(1e9,100,1000),energy:0,energyMax:100,actions:{basic:kill},
  policy:{rotation:['basic'],autoUltimate:false}}));
const enemy=(id,wave)=>({id,name:id,side:'enemy',wave,level:80,panel:panel(1,1,1),energy:0,energyMax:0,
  toughnessMax:0,weaknesses:[],actions:{basic:harmless,skill:harmless},policy:{rotation:['skill'],autoUltimate:false}});
const firstWave=[enemy('pf-w1-1',1),enemy('pf-w1-2',1),enemy('pf-w1-3',1),enemy('pf-w1-4',1)];
const secondWave=[enemy('pf-w2-1',2),enemy('pf-w2-2',2)];
const config={strict:false,sp:3,maxSP:5,maxAV:10.5,critMode:'noncrit',seed:12,waveMode:'continuous',
  units:[...allies,...firstWave.slice(0,2)],
  endgameSpawnPlan:{type:'orderedEnemyWaves',initialEnemyCount:2,waves:[
    {id:'fixture-wave-1',maxTeammateCount:2,units:firstWave},
    {id:'fixture-wave-2',maxTeammateCount:2,units:secondWave},
  ]}};

assert.deepEqual(validateBattle(config),[]);
const replay=simulateBattle(config);
const firstWaveDeaths=replay.log.filter(event=>event.type==='death'&&event.actor?.startsWith('pf-w1-'));
const firstWaveSpawns=replay.log.filter(event=>event.type==='enemy_spawn'&&event.sourceWaveIndex===1);
const nextWaveSpawns=replay.log.filter(event=>event.type==='enemy_spawn'&&event.sourceWaveIndex===2);
assert.equal(firstWaveDeaths.length,4,'all queued members of wave one should be individually defeated');
assert.deepEqual(firstWaveSpawns.map(event=>event.actor),['pf-w1-3','pf-w1-4'],
  'each death should refill the vacancy in source order without exceeding the field cap');
assert.ok(firstWaveSpawns.every(event=>event.activeEnemyCount===2&&event.maxTeammateCount===2));
assert.deepEqual(nextWaveSpawns.map(event=>event.actor),['pf-w2-1','pf-w2-2'],
  'the next source wave should enter only after the current roster and living units are cleared');
assert.ok(replay.log.some(event=>event.type==='wave_start'&&event.wave===2));
assert.equal(replay.log.find(event=>event.type==='wave_start'&&event.wave===2)?.av,10,
  'continuous endgame waves must retain the current action value at transition');

assert.ok(validateBattle({...config,endgameSpawnPlan:{...config.endgameSpawnPlan,initialEnemyCount:1}})
  .some(message=>message.includes('首批名单')),'a source queue that does not match initial field units must be rejected');
assert.ok(validateBattle({...config,endgameSpawnPlan:{...config.endgameSpawnPlan,waves:[
  {...config.endgameSpawnPlan.waves[0],maxTeammateCount:6},config.endgameSpawnPlan.waves[1],
]}}).some(message=>message.includes('波名单无效')),'the field cap must stay within the engine-supported five enemy slots');

const gateWave=[enemy('gate-w1-small-a',1),enemy('gate-w1-boss',1),enemy('gate-w1-small-b',1),enemy('gate-w1-small-c',1)];
const afterGate=[enemy('gate-w2-a',2),enemy('gate-w2-b',2)];
const gateConfig={...config,units:[...allies,...gateWave.slice(0,2)],endgameSpawnPlan:{type:'orderedEnemyWaves',initialEnemyCount:2,waves:[
  {id:'gate-fixture-1',gateUnitId:'gate-w1-boss',maxTeammateCount:2,units:gateWave},
  {id:'gate-fixture-2',maxTeammateCount:2,units:afterGate},
]}};
assert.deepEqual(validateBattle(gateConfig),[]);
const gateReplay=simulateBattle(gateConfig);
assert.ok(gateReplay.log.some(event=>event.type==='mechanic'&&event.name==='虚构叙事 · 首领门槛已击败'));
assert.ok(gateReplay.log.some(event=>event.type==='enemy_despawn'&&event.actor==='gate-w1-small-b'),
  'killing the wave gate should clear still-living enemies from the previous wave');
assert.deepEqual(gateReplay.log.filter(event=>event.type==='enemy_spawn'&&event.sourceWaveIndex===2).map(event=>event.actor),
  ['gate-w2-a','gate-w2-b'],'the gate should bring in the next roster after the killing action settles');
assert.ok(gateReplay.log.some(event=>event.type==='wave_start'&&event.wave===2));

const controller=enemy('pf-group-controller',1);
Object.assign(controller,{unselectable:true,noAction:true,enemyKit:{id:8003060,waveController:true,unselectable:true,noAction:true}});
const controllerRoster=[controller,enemy('pf-queue-a',1),enemy('pf-queue-b',1),enemy('pf-queue-c',1)];
const noGateWave=[enemy('pf-final-a',2),enemy('pf-final-b',2)];
const controllerConfig={...config,units:[...allies,...controllerRoster.slice(0,2)],maxAV:20,
  endgameSpawnPlan:{type:'orderedEnemyWaves',initialEnemyCount:2,waves:[
    {id:'controller-wave-1',maxTeammateCount:2,units:controllerRoster},
    {id:'controller-wave-2',maxTeammateCount:2,units:noGateWave},
  ]}};
assert.deepEqual(validateBattle(controllerConfig),[]);
const controllerReplay=simulateBattle(controllerConfig);
assert.equal(controllerReplay.outcome,'victory','the no-action, unselectable controller must not stall roster-exhausted waves');
assert.equal(controllerReplay.log.some(event=>event.type==='action'&&event.actor==='pf-group-controller'),false);
assert.ok(controllerReplay.log.some(event=>event.type==='mechanic'&&event.actor==='pf-group-controller'&&
  event.name==='虚构叙事 · 来源名单耗尽后移除波次控制体'));
assert.deepEqual(controllerReplay.log.filter(event=>event.type==='enemy_spawn'&&event.sourceWaveIndex===2).map(event=>event.actor),
  ['pf-final-a','pf-final-b']);

console.log('PF spawn checks: source order, five-slot cap, death refill, gate-triggered transition, and continuous action value are covered.');
