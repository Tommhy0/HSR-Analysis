import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createContext} from '../core/ctx.mjs';
import {inspectEndgameTarget} from '../simulator/endgame-scenes.mjs';
import {longRight,validateEnemyActor} from '../simulator/encounters.mjs';
import {validateBattle,simulateBattle} from '../simulator/engine.mjs';

const ctx=createContext(JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url))));
const source=inspectEndgameTarget(ctx,{mode:'moc',seasonId:1036,floorId:'5502',side:2}).enemies.find(e=>e.childId===2023020);
assert.ok(source,'MoC 1036 5502 二侧应含丰饶灵兽·长右来源行');
const enemy=longRight(ctx,{sceneEnemy:source,id:'long-right'});
assert.deepEqual(validateEnemyActor(enemy),[]);

const idle={name:'测试无伤害动作',type:'Normal',element:'Physical',target:'single',terms:[],hitEnergy:0};
function ally(i,speed,hp=1e8){return {id:`ally-${i}`,name:`测试队员${i}`,side:'ally',level:80,aggro:i===1?100:0,
  panel:{hp,atk:1,def:0,speed,critRate:0,critDmg:0,energyRegen:1,elemDmg:{},baseStats:{hp,atk:1,def:0}},
  energy:0,energyMax:100,actions:{basic:{...idle},skill:{...idle,name:'测试战技'}},policy:{rotation:['skill'],autoUltimate:false}};}
const config={strict:false,sp:3,maxSP:5,maxAV:150,critMode:'noncrit',seed:7,
  units:[ally(1,source.speed+1),ally(2,100),ally(3,99),ally(4,98),enemy]};
assert.deepEqual(validateBattle(config),[]);
assert.ok(validateBattle({...config,strict:true}).some(e=>e.includes('AI 选择器')));

const result=simulateBattle(config);
const enemyActions=result.log.filter(e=>e.type==='action'&&e.actor==='long-right');
assert.deepEqual(enemyActions.slice(0,4).map(e=>[e.key,e.kind]),[
  ['skill04','normal'],['skill03','continuation'],['skill01','normal'],['skill03','continuation']
]);
assert.ok(result.log.some(e=>e.type==='mechanic'&&e.actor==='long-right'&&e.name==='怒啸 · 获得元气'&&e.count===3));
assert.ok(result.log.some(e=>e.type==='mechanic'&&e.actor==='long-right'&&e.name==='奋威 · 增伤叠层'&&e.stacks===1));
assert.ok(result.log.some(e=>e.type==='mechanic'&&e.actor==='long-right'&&e.name==='【监视目标】更新'&&e.reason==='我方施放战技'));
assert.ok(result.log.some(e=>e.type==='damage'&&e.actor==='long-right'&&e.damage>0),'猱击应使用源倍率攻击监视目标');
assert.ok(result.log.some(e=>e.type==='resource'&&e.actor==='long-right'&&e.name==='长右元气'&&e.value===2));
const deathProbe=simulateBattle({...config,maxAV:140,seed:11,units:[ally(1,1,1),ally(2,1,1),ally(3,1,1),ally(4,1,1),enemy]});
assert.ok(deathProbe.log.some(e=>e.type==='mechanic'&&e.actor==='long-right'&&e.name==='【监视目标】更新'&&e.reason==='监视目标退场'));
console.log('Long Right checks: sourced eight-step AI, one same-turn extra action, 3 yuanqi, skill/death retargeting, 4.75x attack and 20% damage layer passed.');
