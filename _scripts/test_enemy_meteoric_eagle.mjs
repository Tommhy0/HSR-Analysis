import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createContext} from '../core/ctx.mjs';
import {inspectEndgameTarget} from '../simulator/endgame-scenes.mjs';
import {meteoricEagle,validateEnemyActor} from '../simulator/encounters.mjs';
import {simulateBattle,validateBattle} from '../simulator/engine.mjs';

const ctx=createContext(JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url))));
const floors=['20271','20272','20273','20274'];
const sources=floors.flatMap(floorId=>[1,2].flatMap(side=>{
  try{return inspectEndgameTarget(ctx,{mode:'pf',seasonId:2027,floorId,side}).enemies.filter(e=>e.childId===4022010);}
  catch{return [];}
}));
assert.equal(sources.length,6,'4.6 最新 PF 场景应保留六条流星铁鹰实例记录');
assert.ok(sources.every(e=>e.behaviorStatus==='registered'));
const source=sources[0],enemy=meteoricEagle(ctx,{sceneEnemy:source,id:'meteoric-eagle'});
assert.deepEqual(validateEnemyActor(enemy),[]);
assert.equal(enemy.panel.hp,source.hp);
assert.equal(enemy.panel.speed,source.speed);
assert.equal(enemy.panel.effectRes,source.statusRes/100);
assert.equal(enemy.enemyKit.monsterRank,'MinionLv2');
assert.equal(enemy.actions.skill.name,'划破夜空');
assert.deepEqual(enemy.actions.skill.terms,[{scaling:'atk',multiplier:2}]);
assert.equal(enemy.actions.skill02.name,'如流星闪耀');
assert.deepEqual(enemy.provenance.sourceHashes,{ai:'6ef93db212cbc45b247f120fc208e115c54ed95c',character:'5aa6fff2bdec05c817eae31b9c81f9b82a3ca070',
  ability:'6c398c838683919a054fe8b8dab0d64420be6171',sharedModifier:'949b382738cbbf13dc22014792c73249215fe8bf'});

const wait={name:'等待',type:'Normal',element:'Physical',target:'single',terms:[],spGain:0,energyGain:0};
const allies=Array.from({length:4},(_,i)=>({id:`ally-${i+1}`,name:`测试队员${i+1}`,side:'ally',level:80,aggro:i===0?100:0,
  panel:{hp:1e8,atk:1,def:100,speed:1,critRate:0,critDmg:0,energyRegen:1,elemDmg:{},baseStats:{hp:1e8,atk:1,def:100}},
  energy:0,energyMax:100,actions:{basic:wait},policy:{basicOnly:true,autoUltimate:false}}));
const eagle=structuredClone(enemy);
eagle.panel={...eagle.panel,hp:1e8,speed:100,baseStats:{...eagle.panel.baseStats,hp:1e8,speed:100}};
const rankMate={id:'rank-mate',name:'高阶同伴',side:'enemy',level:80,rank:'elite',enemyKit:{monsterRank:'Elite'},panel:{hp:1e8,atk:1,def:100,speed:20,critRate:0,critDmg:0,effectRes:0,energyRegen:1,elemDmg:{},baseStats:{hp:1e8,atk:1,def:100,speed:20}},
  energy:0,energyMax:0,toughnessMax:90,weaknesses:['Physical'],res:{},actions:{basic:{name:'普通攻击',type:'Normal',element:'Physical',target:'single',terms:[{scaling:'atk',multiplier:.1}],hitEnergy:0}},policy:{rotation:['basic'],autoUltimate:false}};
const config={strict:false,sp:3,maxSP:5,maxAV:520,critMode:'noncrit',seed:7,units:[...allies,eagle,rankMate]};
assert.deepEqual(validateBattle(config),[]);
const result=simulateBattle(config);
const eagleActions=result.log.filter(e=>e.type==='action'&&e.actor===eagle.id).map(e=>e.key);
assert.deepEqual(eagleActions.slice(0,3),['skill','skill02','skill']);
const windwalk=result.log.find(e=>e.type==='mechanic'&&e.name==='如流星闪耀 · 施加【风行】');
assert.equal(windwalk.target,rankMate.id);
assert.ok(result.log.some(e=>e.type==='mechanic'&&e.name==='【风行】回合结束后立即行动'&&e.actor===rankMate.id));
const targetStarts=result.log.filter(e=>e.type==='turn_start'&&e.actor===rankMate.id);
assert.equal(targetStarts.length,2,'风行让目标自然行动后立即再行动一次');
assert.equal(targetStarts[0].av,targetStarts[1].av,'风行追加行动不消耗行动值');
assert.equal(result.log.filter(e=>e.type==='mechanic'&&e.name==='【风行】立即行动开始'&&e.actor===rankMate.id).length,1,
  '由风行触发的那次行动不能再次触发风行');
assert.ok(result.log.some(e=>e.type==='mechanic'&&e.name==='【如流星闪耀】阶级标记更新'&&e.target===rankMate.id));

const breakEagle=structuredClone(eagle);
breakEagle.panel={...breakEagle.panel,hp:1e8,speed:100,baseStats:{...breakEagle.panel.baseStats,hp:1e8,speed:100}};
const breakMate=structuredClone(rankMate);
breakMate.toughness=30;breakMate.toughnessMax=30;breakMate.weaknesses=['Physical'];
const breaker={id:'breaker',name:'击破者',side:'ally',level:80,aggro:0,
  panel:{hp:1e8,atk:1000,def:100,speed:40,critRate:0,critDmg:0,energyRegen:1,elemDmg:{},baseStats:{hp:1e8,atk:1000,def:100,speed:40}},
  energy:0,energyMax:100,actions:{basic:{name:'击破攻击',type:'Normal',element:'Physical',target:'single',targetId:breakMate.id,terms:[{scaling:'atk',multiplier:.1}],toughness:30}},policy:{rotation:['basic'],autoUltimate:false}};
const breakResult=simulateBattle({...config,maxAV:300,units:[...allies.slice(1).map((u,i)=>({...u,aggro:i===0?100:0})),breaker,breakEagle,breakMate]});
assert.ok(breakResult.log.some(e=>e.type==='mechanic'&&e.name==='弱点击破 · 解除【风行】'&&e.actor===breakMate.id));
assert.ok(!breakResult.log.some(e=>e.type==='mechanic'&&e.name==='【风行】回合结束后立即行动'&&e.actor===breakMate.id));
console.log('Meteoric Eagle checks: latest PF panels, AI switch, ranked mark, Windwalk extra action and break removal passed.');
