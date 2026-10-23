import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createContext} from '../core/ctx.mjs';
import {inspectEndgameTarget} from '../simulator/endgame-scenes.mjs';
import {obliterator} from '../simulator/encounters.mjs';
import {validateBattle,simulateBattle} from '../simulator/engine.mjs';

const ctx=createContext(JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url))));
const source=inspectEndgameTarget(ctx,{mode:'moc',seasonId:1036,floorId:'5502',side:2}).enemies.find(e=>e.childId===8012030);
assert.ok(source,'MoC 1036 5502 二侧应含虚卒·抹消者来源行');
const enemy=obliterator(ctx,{sceneEnemy:source,id:'obliterator'});
const emptyAttack={name:'等待',type:'Normal',element:'Physical',target:'single',terms:[],hitEnergy:0};
function ally(i){return {id:`ally-${i}`,name:`测试队员${i}`,side:'ally',level:80,aggro:i===1?100:0,
  panel:{hp:1e8,atk:1,def:0,speed:1,critRate:0,critDmg:0,energyRegen:1,elemDmg:{},baseStats:{hp:1e8,atk:1,def:0}},
  energy:0,energyMax:100,buffs:i===1?[{id:'external-target',tag:'MMonster_AML_Minion03_00_Target',source:'test',type:'buff'}]:[],
  actions:{basic:emptyAttack},policy:{basicOnly:true,autoUltimate:false}};}
function secondEnemy(speed){return {id:'second-enemy',name:'测试追击敌人',side:'enemy',level:80,element:'Physical',
  panel:{hp:1e8,atk:10,def:0,speed,critRate:0,critDmg:0,energyRegen:1,elemDmg:{},baseStats:{hp:1e8,atk:10,def:0}},
  energy:0,energyMax:0,actions:{basic:{name:'命中被标记者',type:'Normal',element:'Physical',target:'single',targetId:'ally-1',terms:[{scaling:'atk',multiplier:.1}],hitEnergy:0}},
  policy:{rotation:['basic'],autoUltimate:false}};}
function config(seed){return {strict:false,sp:3,maxSP:5,maxAV:200,critMode:'noncrit',seed,
  units:[ally(1),ally(2),ally(3),ally(4),enemy,secondEnemy((source.speed??100)-1)]};}

assert.deepEqual(validateBattle(config(1)),[]);
assert.ok(validateBattle({...config(1),strict:true}).some(e=>e.includes('MMonster_AML_Minion03_00_Target')));
assert.ok(validateBattle({...config(1),strict:true}).some(e=>e.includes('Count=4')));
assert.deepEqual(enemy.actions.skill01.hitShares,[.33,.33,.34]);
assert.equal(enemy.enemyKit.markChance,.75);
assert.equal(enemy.enemyKit.markMultiplier,.4);

let result=null;
for(let seed=1;seed<=32&&!result;seed++){
  const candidate=simulateBattle(config(seed));
  if(candidate.log.some(e=>e.type==='mechanic'&&e.name==='【起爆】追击伤害'))result=candidate;
}
assert.ok(result,'固定 seed 范围内应覆盖 75% 基础概率命中的分支');
const enemyActions=result.log.filter(e=>e.type==='action'&&e.actor==='obliterator').map(e=>e.key);
assert.deepEqual(enemyActions.slice(0,2),['skill01','skill02']);
const hits=result.log.filter(e=>e.type==='damage'&&e.actor==='obliterator'&&e.frame.action?.key==='skill01');
assert.equal(hits.length,3);
assert.ok(hits.slice(0,3).every((e,i)=>Math.abs(e.hitEnergy-[4.95,4.95,5.1][i])<1e-9));
const markHit=result.log.find(e=>e.type==='damage'&&e.actor==='obliterator'&&e.kind==='additional');
assert.ok(markHit,'标记者受到攻击时应触发抹消者追击伤害');
assert.ok(Math.abs(markHit.damage-enemy.panel.atk*.4)<1e-6,`${markHit.damage} should equal 40% of snapshotted ATK ${enemy.panel.atk*.4}`);
assert.ok(result.log.some(e=>e.type==='mechanic'&&e.name==='【起爆】受击计数'&&e.count===1));
console.log('Obliterator checks: sourced three-hit attack, Overheat alternation, mark chance and capped follow-up damage passed.');
