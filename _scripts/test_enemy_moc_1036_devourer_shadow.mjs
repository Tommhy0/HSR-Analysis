import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createContext} from '../core/ctx.mjs';
import {inspectEndgameTarget} from '../simulator/endgame-scenes.mjs';
import {devourerShadow,isEnemyMechanicRegistered,validateEnemyActor} from '../simulator/encounters.mjs';
import {combatPanel,createBattle,receiveDamage,stepBattle} from '../simulator/engine.mjs';
import {strictParty} from '../simulator/party.mjs';

const ctx=createContext(JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url))));
const scene=inspectEndgameTarget(ctx,{mode:'moc',seasonId:1036,floorId:'5512',side:1});
const source=scene.enemies.find(enemy=>enemy.childId===800304016);
assert.ok(source,'MoC 1036 5512/S1 contains 蚕食者之影 (child 800304016)');
assert.equal(source.level,95);
assert.equal(source.hp,3404288.6);
assert.equal(source.speed,227);
assert.deepEqual(source.weakness,['Fire','Thunder','Wind']);

const actor=devourerShadow(ctx,{sceneEnemy:source,id:'devourer-shadow'});
assert.deepEqual(validateEnemyActor(actor),[]);
assert.equal(isEnemyMechanicRegistered(800304016),true);
assert.equal(actor.monsterId,800304016);
assert.equal(actor.childId,800304016);
assert.equal(actor.element,'Imaginary');
assert.equal(actor.panel.hp,source.hp);
assert.equal(actor.panel.speed,source.speed);
assert.deepEqual(actor.enemyKit.sourceHashes,{
  ai:'6157cae731e7dbcf33457793e50623dc5bf135d8',
  ability:'4ba3e2c9259bca78b636da5c13ed3afc11aa51a9',
  character:'7ac1e675c407e894b8a82c624a167ef615b453d7'});
assert.deepEqual(actor.enemyKit.skill02Params,[3]);
assert.deepEqual(actor.enemyKit.skill03Params,[5]);
assert.deepEqual(actor.enemyKit.skill04Params,[2.25]);
assert.deepEqual(actor.enemyKit.passiveParams,[.1,.2,.5]);
assert.deepEqual(actor.actions.skill02.terms,[{scaling:'atk',multiplier:3}]);
assert.deepEqual(actor.actions.skill03.terms,[{scaling:'atk',multiplier:5}]);
assert.deepEqual(actor.actions.skill03.hitShares,[.5,.5]);
assert.equal(actor.actions.skill04.repeatCount,9);
assert.equal(actor.actions.skill04.randomHitTargets,true);
assert.equal(actor.enemyMechanicNotes.length,6,'source gaps stay explicit');

const zeroDefPanel=atk=>({hp:1e9,atk,def:0,speed:1,critRate:0,critDmg:0,effectRes:0,energyRegen:1,elemDmg:{},baseStats:{hp:1e9,atk,def:0}});
function battleWith(seed=53){
  const party=structuredClone(strictParty(ctx).units.filter(unit=>unit.side==='ally'));
  for(const unit of party){
    delete unit.kit;delete unit.characterId;delete unit.gear;delete unit.memospriteOwner;
    unit.panel=zeroDefPanel(100);unit.hp=1e9;unit.energy=0;unit.energyMax=100;
    unit.buffs=[];unit.shields=[];unit.dots=[];unit.resources={};
    unit.actions={basic:{name:'probe',type:'Normal',element:'Fire',target:'single',terms:[{scaling:'atk',multiplier:1}]}};
    unit.policy={autoUltimate:false,basicOnly:true};unit.standardBreak=false;
  }
  const battle=createBattle({strict:false,maxAV:1000,sp:3,maxSP:9,seed,critMode:'noncrit',
    units:[...party,devourerShadow(ctx,{sceneEnemy:source,id:'devourer-shadow'})]});
  for(const unit of battle.units)unit.distance=10000;
  return battle;
}
function takeTurn(battle,actor){
  const before=battle.log.length;
  actor.distance=0;
  assert.equal(stepBattle(battle),true);
  return battle.log.slice(before);
}
const skillsOf=(events,actor)=>events.filter(event=>event.type==='action'&&event.actor===actor.id).map(event=>event.key);
const guardOf=unit=>unit.buffs.find(effect=>effect.tag==='devourerShadowGuard');

const battle=battleWith();
const live=battle.units.find(unit=>unit.id==='devourer-shadow');
const atk=combatPanel(live).atk;
const allies=battle.units.filter(unit=>unit.side==='ally');
assert.ok(guardOf(live),'【流年盾纱】10% damage reduction is applied at battle start');
assert.ok(Math.abs(guardOf(live).value-.1)<1e-12);
assert.equal(live.resources['蚕食者之影蓄力层数'],0);

// Flag 1 → 流年金刺；命中按 20% 独立判定【禁锢】。
const turn1=takeTurn(battle,live);
assert.deepEqual(skillsOf(turn1,live),['skill02']);
assert.equal(live.resources['蚕食者之影AIFlag'],3);
const spear=turn1.filter(event=>event.type==='damage'&&event.actor===live.id&&event.kind!=='dot');
assert.equal(spear.length,1);
assert.ok(Math.abs(spear[0].damage-atk*3)<1e-6,`流年金刺 is 3.0x ATK, got ${spear[0].damage}`);
assert.ok(turn1.some(event=>event.type==='mechanic'&&event.name==='【禁锢】施加')||
  turn1.some(event=>event.type==='resist'&&event.name==='抵抗【禁锢】'),'every hit rolls MCommon_Confine');

// Flag 3 → 流年谴罚：两段各 2.5 倍，每段独立判定禁锢。
const turn2=takeTurn(battle,live);
assert.deepEqual(skillsOf(turn2,live),['skill03']);
assert.equal(live.resources['蚕食者之影AIFlag'],4);
const punish=turn2.filter(event=>event.type==='damage'&&event.actor===live.id&&event.kind!=='dot');
assert.equal(punish.length,2,'流年谴罚 is two 2.5x segments');
for(const hit of punish)assert.ok(Math.abs(hit.damage-atk*2.5)<1e-6,`each segment is 2.5x ATK, got ${hit.damage}`);

// Flag 4 → 黄金年代的绸缪：EnergyLayer=9，无伤害。
const turn3=takeTurn(battle,live);
assert.deepEqual(skillsOf(turn3,live),['skill05']);
assert.equal(live.resources['蚕食者之影AIFlag'],5);
assert.equal(live.resources['蚕食者之影蓄力层数'],9);
assert.equal(turn3.filter(event=>event.type==='damage'&&event.actor===live.id).length,0);

// Flag 5 且 EnergyLayer>0 → 黄金年代的解放：9 发 2.25 倍随机投射物，开场把蓄力清到 -1。
const turn4=takeTurn(battle,live);
assert.deepEqual(skillsOf(turn4,live),['skill04']);
assert.equal(live.resources['蚕食者之影AIFlag'],6);
assert.equal(live.resources['蚕食者之影加速层数'],9,'AccelerateLayer takes the charge value');
assert.equal(live.resources['蚕食者之影蓄力层数'],-1);
const volley=turn4.filter(event=>event.type==='damage'&&event.actor===live.id&&event.kind!=='dot');
assert.equal(volley.length,9,'Skill04 fires nine projectiles');
for(const hit of volley)assert.ok(Math.abs(hit.damage-atk*2.25)<1e-6,`each projectile is 2.25x ATK, got ${hit.damage}`);
assert.equal(turn4.find(event=>event.type==='mechanic'&&event.name==='【黄金年代的解放】9 发投射物').hits,9);

// Flag 6 → 流年谴罚，回到 1。
const turn5=takeTurn(battle,live);
assert.deepEqual(skillsOf(turn5,live),['skill03']);
assert.equal(live.resources['蚕食者之影AIFlag'],1);

// 受击削减蓄力：蓄力 9 层时被打一次 −1，打满 9 次后 flag 5 走清空分支。
const drain=battleWith(59);
const boss=drain.units.find(unit=>unit.id==='devourer-shadow');
const attacker=drain.units.find(unit=>unit.side==='ally');
takeTurn(drain,boss);takeTurn(drain,boss);takeTurn(drain,boss); // → flag 5, energy 9
assert.equal(boss.resources['蚕食者之影蓄力层数'],9);
for(let index=0;index<9;index++)receiveDamage(drain,attacker,boss,1,'direct',{name:'probe'});
assert.equal(boss.resources['蚕食者之影蓄力层数'],0,'each hit drains one charge layer');
const turn6=takeTurn(drain,boss);
assert.deepEqual(skillsOf(turn6,boss),['skill06'],'with EnergyLayer==0 the flag-5 branch clears instead');
assert.equal(boss.resources['蚕食者之影蓄力层数'],-1);
assert.ok(turn6.some(event=>event.type==='mechanic'&&event.name==='黄金年代的解放 · 清空'));

// 弱点击破：AIFlag 2..5 → 4、延后 0.25、蓄力清零。
const breakBattle=battleWith(61);
const brokenBoss=breakBattle.units.find(unit=>unit.id==='devourer-shadow');
const breaker=breakBattle.units.find(unit=>unit.side==='ally');
takeTurn(breakBattle,brokenBoss);takeTurn(breakBattle,brokenBoss);takeTurn(breakBattle,brokenBoss);
assert.equal(brokenBoss.resources['蚕食者之影AIFlag'],5);
const distanceBefore=brokenBoss.distance;
breakBattle.rules.weaknessBreak(breakBattle,breaker,brokenBoss,{name:'probe',element:'Fire'},'Fire');
assert.equal(brokenBoss.resources['蚕食者之影AIFlag'],4);
assert.equal(brokenBoss.resources['蚕食者之影蓄力层数'],-1);
assert.ok(Math.abs(brokenBoss.distance-(distanceBefore+10000*.25))<1e-6,'break delays by 0.25 action value');
assert.ok(breakBattle.log.some(event=>event.type==='mechanic'&&event.name==='弱点击破 · 蚕食者之影蓄力中断'));
void allies;

console.log('MoC 1036 5512/S1 蚕食者之影: sourced 3.0x spear / two 2.5x segments / 9x2.25 volley, EnergyLayer charge + per-hit drain + clear branch, 10% guard, confine rolls and break reset passed.');
