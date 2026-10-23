import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createContext} from '../core/ctx.mjs';
import {inspectEndgameTarget} from '../simulator/endgame-scenes.mjs';
import {lycanMecha,validateEnemyActor} from '../simulator/encounters.mjs';
import {validateBattle,simulateBattle} from '../simulator/engine.mjs';

const ctx=createContext(JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url))));
const source=inspectEndgameTarget(ctx,{mode:'moc',seasonId:1036,floorId:'5504',side:1}).enemies.find(e=>e.childId===2033010);
assert.ok(source,'MoC 1036 5504 一侧应含咆哮灵柩来源行');
const mechaRows=['5504','5505','5509'].flatMap(floorId=>inspectEndgameTarget(ctx,{mode:'moc',seasonId:1036,floorId,side:1}).enemies.filter(e=>e.childId===2033010));
assert.equal(mechaRows.length,6);
assert.ok(mechaRows.every(e=>e.behaviorStatus==='registered'));
const enemy=lycanMecha(ctx,{sceneEnemy:source,id:'lycan-mecha',rageGroup:'test-lycan'});
assert.deepEqual(validateEnemyActor(enemy),[]);
assert.equal(enemy.panel.hp,source.hp);
assert.equal(enemy.panel.def,source.def);
assert.equal(enemy.panel.speed,source.speed);
assert.equal(enemy.panel.effectRes,source.statusRes/100);
assert.equal(enemy.actions.skill01.name,'仿生利爪');
assert.equal(enemy.actions.skill04.terms[0].multiplier,1.2);
assert.deepEqual(enemy.actions.skill02.terms,[{scaling:'atk',multiplier:2.6},{scaling:'atk',multiplier:1.8,target:'adjacent'}]);

const wait={name:'等待',type:'Normal',element:'Physical',target:'single',terms:[],spGain:0,energyGain:0};
const allies=Array.from({length:4},(_,i)=>({id:`ally-${i+1}`,name:`测试队员${i+1}`,side:'ally',level:80,aggro:i===0?100:0,
  panel:{hp:1e8,atk:1,def:100,speed:1,critRate:0,critDmg:0,energyRegen:1,elemDmg:{},baseStats:{hp:1e8,atk:1,def:100}},
  energy:0,energyMax:100,actions:{basic:wait},policy:{basicOnly:true,autoUltimate:false}}));
const battleEnemy=structuredClone(enemy);
battleEnemy.panel={...battleEnemy.panel,hp:1e8,baseStats:{...battleEnemy.panel.baseStats,hp:1e8}};
const config={strict:false,sp:3,maxSP:5,maxAV:700,critMode:'noncrit',seed:9,units:[...allies,battleEnemy]};
assert.deepEqual(validateBattle(config),[]);
assert.ok(validateBattle({...config,strict:true}).some(e=>e.includes('Skill06')));
const result=simulateBattle(config);
const actionKeys=result.log.filter(e=>e.type==='action'&&e.actor===enemy.id).map(e=>e.key);
assert.deepEqual(actionKeys.slice(0,6),['skill01','skill02','skill01','skill02','skill01','skill02']);
assert.ok(result.log.some(e=>e.type==='mechanic'&&e.name==='狼群进入【月狂】'));
assert.ok(actionKeys.includes('skill04'),'进入月狂后应按源 AI 转入全体轰鸣动作');
assert.ok(result.log.some(e=>e.type==='damage'&&e.actor===enemy.id&&e.frame.action?.key==='skill02'&&e.hitEnergy>0));

const fearEnemy=structuredClone(enemy);
fearEnemy.panel={...fearEnemy.panel,hp:1e8,baseStats:{...fearEnemy.panel.baseStats,hp:1e8}};
fearEnemy.enemyKit.rageCountdownSpeed=40;
const fearAllies=allies.map(a=>({...structuredClone(a),panel:{...a.panel,speed:100,baseStats:{...a.panel.baseStats,speed:100}}}));
const fearResult=simulateBattle({strict:false,sp:3,maxSP:5,maxAV:610,critMode:'noncrit',seed:11,units:[...fearAllies,fearEnemy]});
assert.equal(fearResult.log.filter(e=>e.type==='mechanic'&&e.name==='施加【恐惧萦绕】').length,4);
assert.ok(fearResult.log.some(e=>e.type==='mechanic'&&e.name==='【杀戮算法】恐惧追加伤害'));
assert.equal(fearResult.log.filter(e=>e.type==='mechanic'&&e.name==='【恐惧萦绕】转为【恐惧】并跳过行动').length,4);
assert.equal(fearResult.log.filter(e=>e.type==='skip').length,4);
console.log('LycanMecha checks: scene panel, AI phases, shared rage threshold, fear conversion / skip and conditional follow-up hooks passed.');
