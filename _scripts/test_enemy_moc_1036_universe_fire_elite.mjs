import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createContext} from '../core/ctx.mjs';
import {inspectEndgameTarget} from '../simulator/endgame-scenes.mjs';
import {isEnemyMechanicRegistered,universeFireElite,validateEnemyActor} from '../simulator/encounters.mjs';
import {combatPanel,createBattle,stepBattle} from '../simulator/engine.mjs';
import {strictParty} from '../simulator/party.mjs';

const ctx=createContext(JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url))));
const scene=inspectEndgameTarget(ctx,{mode:'moc',seasonId:1036,floorId:'5511',side:2});
const source=scene.enemies.find(enemy=>enemy.childId===8003020);
assert.ok(source,'MoC 1036 5511/S2 contains 外宇宙之炎 (child 8003020)');
assert.equal(source.name,'外宇宙之炎');
assert.equal(source.level,92);
assert.equal(source.hp,598166);
assert.equal(source.speed,158.4);
assert.equal(source.stance,300);
assert.deepEqual(source.weakness,['Physical','Ice','Quantum']);

// ---- 场景 actor -------------------------------------------------------------
const actor=universeFireElite(ctx,{sceneEnemy:source,id:'universe-fire-1'});
assert.deepEqual(validateEnemyActor(actor),[]);
assert.equal(isEnemyMechanicRegistered(8003020),true);
assert.equal(actor.monsterId,8003020);
assert.equal(actor.childId,8003020);
assert.equal(actor.element,'Fire');
assert.equal(actor.rank,'elite');
assert.equal(actor.panel.hp,source.hp);
assert.equal(actor.panel.speed,source.speed);
assert.equal(actor.toughnessMax,source.toughness);
assert.deepEqual(actor.weaknesses,['Physical','Ice','Quantum']);
assert.deepEqual(actor.enemyKit.sourceHashes,{
  ai:'afd74e8c56c626c9d7d2df4ee49da9fae4dee872',
  ability:'ae9d1e62cb1329843928bdd9f8dc6f3664d1d22c',
  character:'32b5d2227bb65252fcb71f77a0f74c407bd4c096'});
assert.deepEqual(actor.enemyKit.skill01Params,[2.5,1,2,.5]);
assert.deepEqual(actor.enemyKit.skill03Params,[0,0,60,0]);
assert.deepEqual(actor.enemyKit.skill05Params,[1,1,2,.5,5,60]);
assert.deepEqual(actor.enemyKit.skill07Params,[.3]);
assert.deepEqual(actor.actions.skill01.terms,[{scaling:'atk',multiplier:2.5}]);
assert.equal(actor.actions.skill01.hitEnergy,10);
assert.equal(actor.actions.skill01.toughness,10);
assert.equal(actor.actions.skill03.target,'self');
assert.equal(actor.actions.skill05.randomHitTargets,true);
assert.equal(actor.actions.skill05.repeatCount,5);
assert.deepEqual(actor.actions.skill05.terms,[{scaling:'atk',multiplier:1}]);
assert.equal(actor.actions.skill07.target,'self');
assert.equal(actor.enemyMechanicNotes.length,7,'source gaps stay explicit');
assert.equal(actor.policy.autoUltimate,false);

// ---- 战斗脚手架 -------------------------------------------------------------
const zeroDefPanel=atk=>({hp:1e9,atk,def:0,speed:1,critRate:0,critDmg:0,effectRes:0,energyRegen:1,elemDmg:{},baseStats:{hp:1e9,atk,def:0}});
function battleWith(extra,seed=23){
  const party=structuredClone(strictParty(ctx).units.filter(unit=>unit.side==='ally'));
  for(const unit of party){
    delete unit.kit;delete unit.characterId;delete unit.gear;delete unit.memospriteOwner;
    unit.panel=zeroDefPanel(100);unit.hp=1e9;unit.energy=0;unit.energyMax=100;
    unit.buffs=[];unit.shields=[];unit.dots=[];unit.resources={};
    unit.actions={basic:{name:'probe',type:'Normal',element:'Physical',target:'single',terms:[{scaling:'atk',multiplier:1}]}};
    unit.policy={autoUltimate:false,basicOnly:true};unit.standardBreak=false;
  }
  const battle=createBattle({strict:false,maxAV:1000,sp:3,maxSP:9,seed,critMode:'noncrit',units:[...party,extra]});
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
const hitsOf=(events,actor,key)=>{
  const slices=[];
  for(const event of events){
    if(event.type==='action'&&event.actor===actor.id)slices.push({key:event.key,hits:[]});
    else if(event.type==='damage'&&event.actor===actor.id&&slices.length)slices.at(-1).hits.push(event);
  }
  return slices.filter(slice=>slice.key===key).flatMap(slice=>slice.hits.filter(hit=>hit.kind!=='dot'));
};
const burnsOn=unit=>unit.dots.filter(effect=>effect.tag==='universeFireBurn');
const meltOf=battle=>battle.units.find(unit=>unit.id==='universe-fire-1')?.buffs.find(effect=>effect.tag==='universeFireMelt');
const burningOf=unit=>unit.buffs.find(effect=>effect.tag==='universeFireSpontaneousCombustion');

// ---- 阶段 1：咆哮之火 → 汲取炎华 --------------------------------------------
const battle=battleWith(universeFireElite(ctx,{sceneEnemy:source,id:'universe-fire-1'}));
const live=battle.units.find(unit=>unit.id==='universe-fire-1');
const atk=combatPanel(live).atk;
assert.equal(live.resources['外宇宙之炎Phase_Flag'],1);
assert.equal(live.resources['外宇宙之炎AIFlag'],1);
assert.equal(live.resources['外宇宙之炎StanceBreak_Sign'],0);

const turn1=takeTurn(battle,live);
assert.deepEqual(skillsOf(turn1,live),['skill01']);
assert.equal(live.resources['外宇宙之炎AIFlag'],2);
const roar=hitsOf(turn1,live,'skill01');
assert.equal(roar.length,1,'咆哮之火 is a single hit');
assert.equal(roar[0].hitEnergy,10);
assert.ok(Math.abs(roar[0].damage-atk*2.5)<1e-6,`咆哮之火 is 2.5x ATK, got ${roar[0].damage}`);
const burnTarget=battle.units.find(unit=>unit.id===roar[0].target);
const firstBurn=burnsOn(burnTarget)[0];
assert.ok(firstBurn,'咆哮之火 applies 【焚烧】');
assert.equal(firstBurn.stacks,1);
assert.equal(firstBurn.remaining,2,'LifeTime = Skill01[2] = 2');
assert.equal(firstBurn.element,'Fire');
assert.deepEqual(firstBurn.terms,[{scaling:'atk',multiplier:.5}],'MDF_DamagePercentage_Layer = Skill01[3] = 0.5 per layer');
assert.equal(firstBurn.snapshotAtk,atk,'UseSnapshotEntity snapshots the caster ATK');
assert.ok(turn1.some(event=>event.type==='mechanic'&&event.name==='【焚烧】施加'&&event.layers===1));

// AIFlag 2 → 汲取炎华：进入【自燃】（Phase_Flag 2）并写入 StanceBreak_Sign=1。
const turn2=takeTurn(battle,live);
assert.deepEqual(skillsOf(turn2,live),['skill03']);
assert.equal(hitsOf(turn2,live,'skill03').length,0,'汲取炎华 deals no damage');
assert.equal(live.resources['外宇宙之炎Phase_Flag'],2);
assert.equal(live.resources['外宇宙之炎AIFlag'],1);
assert.equal(live.resources['外宇宙之炎StanceBreak_Sign'],1);
assert.ok(burningOf(live),'【自燃】marker is present');
assert.ok(turn2.some(event=>event.type==='mechanic'&&event.name==='【自燃】施加'&&event.phaseFlag===2));

// ---- 阶段 2：净炎之雨 ↔ 熔聚 ------------------------------------------------
const turn3=takeTurn(battle,live);
assert.deepEqual(skillsOf(turn3,live),['skill05'],'Phase_Flag 2 / AIFlag 1 → 净炎之雨');
assert.equal(live.resources['外宇宙之炎AIFlag'],2);
const rain=hitsOf(turn3,live,'skill05');
assert.equal(rain.length,5,'Skill05[4] = 5 independently retargeted hits');
for(const hit of rain){
  assert.equal(hit.hitEnergy,10,'each hit grants 10 hit energy');
  assert.ok(Math.abs(hit.damage-atk)<1e-6,`净炎之雨 is 1.0x ATK per hit, got ${hit.damage}`);
}
const rainBurnTargets=[...new Set(rain.map(hit=>hit.target))];
assert.equal(turn3.filter(event=>event.type==='mechanic'&&event.name==='【焚烧】施加').length,rain.length,
  'every 净炎之雨 hit applies one 【焚烧】 stack');
for(const id of rainBurnTargets){
  const target=battle.units.find(unit=>unit.id===id);
  const burn=burnsOn(target)[0];
  const hits=rain.filter(hit=>hit.target===id).length;
  const carried=id===roar[0].target?1:0;
  assert.ok(burn,`${id} carries 【焚烧】`);
  assert.equal(burn.stacks,carried+hits,'duplicate hits stack 【焚烧】 per RetargetPerSequence');
  assert.deepEqual(burn.terms,[{scaling:'atk',multiplier:.5*burn.stacks}],'burn damage scales with layer count');
}

const turn4=takeTurn(battle,live);
assert.deepEqual(skillsOf(turn4,live),['skill07'],'AIFlag 2 → 熔聚');
assert.equal(live.resources['外宇宙之炎AIFlag'],1);
const meltOne=meltOf(battle);
assert.ok(meltOne,'熔聚 grants an Attack modifier');
assert.equal(meltOne.key,'atkPct');
assert.equal(meltOne.stacks,1);
assert.ok(Math.abs(meltOne.value-.3)<1e-12,'Skill07[0] = 30% Attack per layer');

const turn5=takeTurn(battle,live);
assert.deepEqual(skillsOf(turn5,live),['skill05'],'phase 2 keeps alternating');
const turn6=takeTurn(battle,live);
assert.deepEqual(skillsOf(turn6,live),['skill07']);
const meltTwo=meltOf(battle);
assert.equal(meltTwo.stacks,2,'熔聚 stacks up to MaxLayer 3');
assert.ok(Math.abs(meltTwo.value-.6)<1e-12,'two layers = +60% Attack');

// ---- 弱点击破：Sign==1 → 移除【自燃】与【熔聚】并复位旗标 -------------------
assert.equal(live.resources['外宇宙之炎StanceBreak_Sign'],1);
const ally=battle.units.find(unit=>unit.side==='ally');
battle.rules.weaknessBreak(battle,ally,live,{name:'probe',element:'Physical'},'Physical');
assert.equal(burningOf(live),undefined,'【自燃】is removed on break');
assert.equal(meltOf(battle),undefined,'【熔聚】is removed on break');
assert.equal(live.resources['外宇宙之炎Phase_Flag'],1);
assert.equal(live.resources['外宇宙之炎AIFlag'],1);
assert.equal(live.resources['外宇宙之炎StanceBreak_Sign'],0);
const breakEvent=battle.log.find(event=>event.type==='mechanic'&&event.name==='弱点击破 · 【自燃】/【熔聚】解除');
assert.ok(breakEvent,'the break is recorded');
assert.equal(breakEvent.burning,true);
assert.equal(breakEvent.melt,2);
assert.ok(battle.log.some(event=>event.type==='mechanic'&&event.name==='【自燃】解除'&&event.reason==='弱点击破'));

// 破韧回到阶段 1：咆哮之火 → 汲取炎华 重新进入阶段 2。
const turn7=takeTurn(battle,live);
assert.deepEqual(skillsOf(turn7,live),['skill01'],'after the break the AI restarts at phase 1 / AIFlag 1');

// ---- 未进入【自燃】时的击破不改动旗标 ----------------------------------------
{
  const fresh=battleWith(universeFireElite(ctx,{sceneEnemy:source,id:'universe-fire-1'}),29);
  const unit=fresh.units.find(target=>target.id==='universe-fire-1');
  takeTurn(fresh,unit); // 咆哮之火，AIFlag 2、Sign 仍为 0
  const before=fresh.log.length,breaker=fresh.units.find(target=>target.side==='ally');
  fresh.rules.weaknessBreak(fresh,breaker,unit,{name:'probe',element:'Physical'},'Physical');
  const events=fresh.log.slice(before);
  assert.equal(events.some(event=>event.type==='mechanic'&&event.name==='弱点击破 · 【自燃】/【熔聚】解除'),false,
    'StanceBreak_Sign != 1 → ListenStanceBreakModifier skips the removal branch');
  assert.equal(unit.resources['外宇宙之炎AIFlag'],2,'the AI flag is untouched');
}

// ---- 【焚烧】在持有者回合开始时按层结算 --------------------------------------
{
  live.resources['外宇宙之炎Phase_Flag']=1;
  live.resources['外宇宙之炎AIFlag']=1;
  const clean=battleWith(universeFireElite(ctx,{sceneEnemy:source,id:'universe-fire-1'}),31);
  const boss=clean.units.find(unit=>unit.id==='universe-fire-1');
  const victim=clean.units.find(unit=>unit.side==='ally');
  const hit=takeTurn(clean,boss).find(event=>event.type==='damage'&&event.actor===boss.id&&event.kind!=='dot');
  const burned=clean.units.find(unit=>unit.id===hit.target);
  const tickBefore=clean.log.length;
  burned.distance=0;
  stepBattle(clean);
  const tick=clean.log.slice(tickBefore).find(event=>event.type==='damage'&&event.kind==='dot'&&event.target===burned.id);
  assert.ok(tick,'焚烧 ticks when the holder takes a turn');
  assert.ok(Math.abs(tick.damage-atk*.5)<1e-6,`the first tick is 0.5x the snapshotted ATK, got ${tick.damage}`);
  assert.equal(tick.element,'Fire');
  void victim;
}

console.log('MoC 1036 5511/S2 外宇宙之炎: sourced 2.5x roar / 5x1.0 rain / 自燃 phase switch / 熔聚 stacking / Sign-gated break removal / snapshot burn ticks passed.');
