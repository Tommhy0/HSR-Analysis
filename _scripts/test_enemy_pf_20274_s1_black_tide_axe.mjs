import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createContext} from '../core/ctx.mjs';
import {inspectEndgameTarget} from '../simulator/endgame-scenes.mjs';
import {blackTideAxe,isEnemyMechanicRegistered,validateEnemyActor} from '../simulator/encounters.mjs';
import {combatPanel,createBattle,stepBattle} from '../simulator/engine.mjs';
import {strictParty} from '../simulator/party.mjs';

const ctx=createContext(JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url))));
const scene=inspectEndgameTarget(ctx,{mode:'pf',seasonId:2027,floorId:'20274',side:1});
const source=scene.enemies.find(enemy=>enemy.childId===4032030);
assert.ok(source,'PF 20274/S1 source waves include Black Tide\'s Corroded Axe');

const axe=blackTideAxe(ctx,{sceneEnemy:source,id:'axe-1'});
assert.deepEqual(validateEnemyActor(axe),[]);
assert.equal(isEnemyMechanicRegistered(4032030),true);
assert.equal(axe.panel.hp,source.hp);
assert.equal(axe.panel.speed,source.speed);
assert.equal(axe.toughnessMax,source.toughness??source.stance);
assert.equal(axe.element,'Fire');
assert.deepEqual(axe.enemyKit.sourceHashes,{
  ai:'7e526de81bbc8790819047841f52e49fb8c401a1',ability:'6b28f5a2def147e64c2848fbf11a76da32126376'});
assert.deepEqual(axe.actions.skill01.terms,[{scaling:'atk',multiplier:3}]);
assert.deepEqual(axe.actions.skill02.terms,[{scaling:'atk',multiplier:14}]);
assert.equal(axe.actions.skill02.target,'all');
assert.equal(axe.actions.skill02.shareDamageAcrossTargets,true);

const party=structuredClone(strictParty(ctx).units.filter(unit=>unit.side==='ally'));
for(const unit of party){
  delete unit.kit;delete unit.characterId;delete unit.gear;delete unit.memospriteOwner;
  unit.panel={hp:1e9,atk:0,def:0,speed:1,critRate:0,critDmg:0,effectRes:0,energyRegen:1,elemDmg:{},baseStats:{hp:1e9,atk:0,def:0}};
  unit.hp=1e9;unit.energy=0;unit.energyMax=100;unit.buffs=[];unit.shields=[];unit.dots=[];unit.resources={};
  unit.actions={basic:{name:'probe',type:'Normal',element:'Physical',target:'single',terms:[]}};
  unit.policy={autoUltimate:false,basicOnly:true};unit.standardBreak=false;
}
const axe2=blackTideAxe(ctx,{sceneEnemy:source,id:'axe-2'});
const battle=createBattle({strict:false,maxAV:1000,sp:3,maxSP:9,seed:13,critMode:'noncrit',units:[...party,axe,axe2]});
for(const unit of battle.units)unit.distance=10000;
const live1=battle.units.find(unit=>unit.id==='axe-1');
const live2=battle.units.find(unit=>unit.id==='axe-2');
assert.equal(live1.resources['黑潮蚀斧AIFlag'],1);
assert.equal(live1.resources['黑潮蚀斧触发标记'],0);
live1.distance=0;

assert.equal(stepBattle(battle),true);
const first=battle.log.find(event=>event.type==='action'&&event.actor===live1.id);
assert.equal(first.key,'skill01');
assert.equal(first.name,'怒潮炽斧');
const hit=battle.log.find(event=>event.type==='damage'&&event.actor===live1.id);
assert.ok(hit,'怒潮炽斧 produces an executable direct hit');
assert.equal(hit.hitEnergy,10);
assert.equal(first.targets.length,1);
const atk=combatPanel(live1).atk;
assert.ok(Math.abs(hit.damage-atk*3)<1e-6,'怒潮炽斧 deals exactly 3.0x ATK to a zero-DEF target');
assert.equal(live1.resources['黑潮蚀斧AIFlag'],1,'Skill01 does not advance AIFlag');

// 【仇隙】：another enemy dies → one eligible axe immediately casts 仇心忿火.
const before=battle.log.length;
live2.hp=0;
battle.rules.death(battle,null,live2);
const revenge=battle.log.slice(before);
const trigger=revenge.find(event=>event.type==='mechanic'&&event.actor===live1.id&&event.name.includes('仇隙'));
assert.ok(trigger,'the surviving axe must claim 仇隙 when another enemy dies');
assert.deepEqual(trigger.eligible,['axe-1']);
const cast=revenge.find(event=>event.type==='action'&&event.actor===live1.id);
assert.equal(cast.key,'skill02');
assert.equal(cast.name,'仇心忿火');
const shares=revenge.filter(event=>event.type==='damage'&&event.actor===live1.id);
assert.equal(shares.length,4,'仇心忿火 hits every live ally once');
const perTarget=atk*14/4;
for(const share of shares){
  assert.equal(share.hitEnergy,10);
  assert.ok(Math.abs(share.damage-perTarget)<1e-6,`each ally takes 14.0/4 x ATK, got ${share.damage} vs ${perTarget}`);
}
assert.equal(revenge.some(event=>event.type==='mechanic'&&event.name==='【仇心忿火】结算 · 清除仇隙标记'),true);

console.log('PF 20274/S1 Black Tide\'s Corroded Axe checks: source wave record / panel, sourced 3.0x single hit, shared 14.0x all-target hit, and 仇隙 revenge trigger passed.');
