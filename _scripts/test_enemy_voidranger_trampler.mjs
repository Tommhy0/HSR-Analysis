import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createContext} from '../core/ctx.mjs';
import {inspectEndgameTarget} from '../simulator/endgame-scenes.mjs';
import {voidrangerTrampler,validateEnemyActor} from '../simulator/encounters.mjs';
import {validateBattle,simulateBattle} from '../simulator/engine.mjs';

const ctx=createContext(JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url))));
const scenes=['5504','5509'].map(floorId=>inspectEndgameTarget(ctx,{mode:'moc',seasonId:1036,floorId,side:2}));
const rows=scenes.flatMap(s=>s.enemies.filter(e=>e.childId===8012020));
assert.equal(rows.length,4,'MoC 1036 current lineup should contain four Trampler rows');
assert.ok(rows.every(e=>e.behaviorStatus==='registered'));
assert.equal(rows[0].aiSource.aiFile.sha,'357f6b6b18e3903c206741b316da3799a6a66968');
assert.deepEqual(rows[0].skills.map(s=>s.name),['虚无命意','无影虚击']);

const source=rows[0],enemy=voidrangerTrampler(ctx,{sceneEnemy:source,id:'trampler'});
assert.deepEqual(validateEnemyActor(enemy),[]);
assert.equal(enemy.panel.hp,source.hp);
assert.equal(enemy.panel.speed,source.speed);
assert.deepEqual(enemy.weaknesses,source.weakness);
assert.equal(enemy.actions.skill02.terms[0].multiplier,5);

const wait={name:'等待',type:'Normal',element:'Physical',target:'single',terms:[],hitEnergy:0};
const allies=Array.from({length:4},(_,i)=>({id:`ally-${i+1}`,name:`测试队员${i+1}`,side:'ally',level:80,aggro:i===0?100:0,
  panel:{hp:1e8,atk:1,def:0,speed:1,critRate:0,critDmg:0,energyRegen:1,elemDmg:{},baseStats:{hp:1e8,atk:1,def:0}},
  energy:0,energyMax:100,actions:{basic:wait},policy:{basicOnly:true,autoUltimate:false}}));
const companion={id:'enemy-mate',name:'测试同侧队友',side:'enemy',level:80,panel:{hp:1e8,atk:1,def:0,speed:1,critRate:0,critDmg:0,energyRegen:1,elemDmg:{},baseStats:{hp:1e8,atk:1,def:0}},
  energy:0,energyMax:0,actions:{basic:wait},policy:{rotation:['basic'],autoUltimate:false}};
const battle={strict:false,sp:3,maxSP:5,maxAV:230,critMode:'noncrit',seed:9,units:[...allies,enemy,companion]};
assert.deepEqual(validateBattle(battle),[]);
assert.ok(validateBattle({...battle,strict:true}).some(e=>e.includes('并列目标顺序')));
const result=simulateBattle(battle);
const turns=result.log.filter(e=>e.type==='action'&&e.actor==='trampler');
assert.deepEqual(turns.slice(0,3).map(e=>e.key),['skill01','skill02','skill01']);
assert.ok(result.log.some(e=>e.type==='buff'&&e.name==='虚无命意 · 锁定目标'&&e.key==='vuln'&&e.value===.1));
assert.ok(result.log.some(e=>e.type==='mechanic'&&e.name==='【虚无命意】标记目标'));
assert.ok(result.log.some(e=>e.type==='mechanic'&&e.name==='【无影虚击】移除自身标记'));
assert.ok(result.log.some(e=>e.type==='damage'&&e.actor==='trampler'&&e.frame.action?.key==='skill02'&&e.damage>0));
const solo=simulateBattle({...battle,maxAV:80,units:[allies[0],structuredClone(enemy)]});
assert.ok(solo.log.some(e=>e.type==='action'&&e.actor==='trampler'&&e.key==='wait'),'without a teammate and enough enemies, source AI has no eligible action and should pass without damage');

console.log('Voidranger Trampler checks: four sourced MoC rows, 10% marked-target vulnerability, 5x selector attack and mark removal passed.');
