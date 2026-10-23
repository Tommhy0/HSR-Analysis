import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createContext} from '../core/ctx.mjs';
import {searingProwler,isEnemyMechanicRegistered,validateEnemyActor} from '../simulator/encounters.mjs';
import {combatPanel,createBattle,stepBattle} from '../simulator/engine.mjs';
import {inspectEndgameTarget} from '../simulator/endgame-scenes.mjs';
import {strictParty} from '../simulator/party.mjs';

const ctx=createContext(JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url))));

function dummyParty({hp=1e9,atk=0,speed=1}={}){
  const allies=structuredClone(strictParty(ctx).units.filter(unit=>unit.side==='ally'));
  for(const ally of allies){
    delete ally.kit;delete ally.characterId;delete ally.gear;delete ally.memospriteOwner;
    ally.panel={hp,atk,def:0,speed,critRate:0,critDmg:0,effectRes:0,elemDmg:{},baseStats:{hp,atk,def:0}};
    ally.hp=hp;ally.energy=0;ally.energyMax=0;ally.buffs=[];ally.shields=[];ally.dots=[];ally.resources={};
    ally.actions={basic:{name:'source-check probe',type:'Normal',element:'Ice',target:'single',
      terms:[{scaling:'atk',multiplier:10}],toughness:60}};
    ally.policy={autoUltimate:false,basicOnly:true};ally.standardBreak=false;
  }
  return allies;
}
const near=(actual,expected,tolerance=1e-6)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} != ${expected}`);
function battleWithProwler(source,seed,opts={}){
  const allies=dummyParty(opts);
  const boss=searingProwler(ctx,{sceneEnemy:source,id:'prowler-runtime'});
  const battle=createBattle({strict:false,maxAV:3000,sp:3,maxSP:9,seed,critMode:'noncrit',units:[...allies,boss]});
  for(const unit of battle.units)unit.distance=10000;
  const live=battle.units.find(unit=>unit.id==='prowler-runtime');
  live.distance=0;
  return {battle,live};
}
const bossActions=battle=>battle.log.filter(event=>event.type==='action'&&event.actor==='prowler-runtime').map(event=>event.key);
const burnOn=unit=>unit.dots.find(dot=>dot.tag==='mechaFireBurn');

// ---- Source rows -----------------------------------------------------------
const mocSource=inspectEndgameTarget(ctx,{mode:'moc',seasonId:1036,floorId:'5510',side:2})
  .enemies.find(enemy=>enemy.childId===1023010);
assert.ok(mocSource,'MoC 1036 5510/S2 includes 炽燃徘徊者 1023010');
const pfScene=inspectEndgameTarget(ctx,{mode:'pf',seasonId:2005,floorId:'20051',side:2});
const pfSource=pfScene.enemies.find(enemy=>enemy.childId===102301017);
assert.ok(pfSource,'PF 2005 20051/S2 includes the 102301017 stat variant of 炽燃徘徊者');
assert.equal(pfSource.monsterId,1023010,'the PF row resolves its parent monster');

assert.equal(isEnemyMechanicRegistered(1023010),true);
for(const [source,label] of [[mocSource,'MoC'],[pfSource,'PF variant']]){
  const actor=searingProwler(ctx,{sceneEnemy:source});
  assert.deepEqual(validateEnemyActor(actor),[],label+' actor passes the strict validator');
  assert.equal(actor.monsterId,1023010);
  assert.equal(actor.childId,source.childId);
  assert.equal(actor.enemyKit.id,1023010,'the shared kit is keyed by the parent monster');
  assert.equal(actor.element,'Fire');
  assert.equal(actor.rank,'elite');
  near(actor.panel.hp,source.hp,1e-6);
  near(actor.panel.speed,source.speed,1e-9);
  near(actor.panel.critDmg,.2,1e-9);
  assert.equal(actor.level,source.level);
  assert.deepEqual(actor.weaknesses,['Ice','Thunder','Imaginary']);
  assert.deepEqual(actor.enemyKit.sourceHashes,{
    ai:'73c666d45ba11c87d642cf295b80b6ab3c2ab491',
    character:'8bdc0dfed2cb0a9efba3cff4b6a116bcad471810',
    ability:'9538d3777954950c18263a968362ff958b5550d4',
    sharedModifier:'e043cdc0650741eb27049b0c1a0710bccb77618f'});
  assert.deepEqual([actor.enemyKit.skill01Params,actor.enemyKit.skill02Params,
    actor.enemyKit.skill06Params,actor.enemyKit.skill07Params,actor.enemyKit.passiveParams],
    [[.2,100],[3,2],[3,.5,3],[4,2.5],[.06,3]]);
}

const actor=searingProwler(ctx,{sceneEnemy:mocSource});
assert.equal(actor.actions.skill01.name,'高温运转');
assert.equal(actor.actions.skill01.target,'self');
assert.equal(actor.actions.skill01.terms.length,0,'高温运转 is a self buff, not an attack');
assert.deepEqual([actor.actions.skill06.name,actor.actions.skill06.terms,actor.actions.skill06.toughness],
  ['赤红刀锋',[{scaling:'atk',multiplier:3}],10]);
assert.deepEqual([actor.actions.skill07.name,actor.actions.skill07.target,actor.actions.skill07.repeatCount,
  actor.actions.skill07.toughness,actor.actions.skill07.adjacentToughness],
  ['燃焰斩击','blast',2,7.5,7.5]);
assert.deepEqual(actor.actions.skill07.terms,
  [{scaling:'atk',multiplier:2},{scaling:'atk',multiplier:1.25,target:'adjacent'}]);
assert.deepEqual([actor.actions.skill02.name,actor.actions.skill02.target,actor.actions.skill02.repeatCount,
  actor.actions.skill02.toughness,actor.actions.skill02.terms],
  ['飞舞烬火','all',2,5,[{scaling:'atk',multiplier:1.5}]]);
assert.equal(actor.enemyMechanicNotes.length,7);

// ---- Full AI rotation ------------------------------------------------------
{
  const {battle,live}=battleWithProwler(mocSource,11);
  let guard=0;
  while(bossActions(battle).length<10&&guard++<80)assert.equal(stepBattle(battle),true);
  assert.deepEqual(bossActions(battle).slice(0,10),
    ['skill06','skill07','skill01','skill02','skill06','skill02','skill06','skill02','skill06','skill02'],
    'AICounter 1→2→3→4 with the Burning / Burning_CD predicates produces the sourced rotation');
  assert.equal(live.resources['炽燃徘徊者AICounter'],4);
  assert.equal(live.resources['炽燃徘徊者BurningCD'],0);
}

// ---- Burn: 0.5× snapshot ATK, 3 turns, ticks at the holder turn start ------
{
  const {battle,live}=battleWithProwler(mocSource,13,{speed:100});
  assert.equal(stepBattle(battle),true);
  const target=battle.units.find(unit=>unit.side==='ally'&&burnOn(unit));
  assert.ok(target,'赤红刀锋 applies 灼烧 to its target');
  const burn=burnOn(target);
  assert.equal(burn.modifierName,'MCommon_DOT_Burn');
  assert.equal(burn.tickAt,'start');
  assert.equal(burn.remaining,3);
  assert.equal(burn.stacks,1,'MCommon_DOT_Burn has MaxLayer 1');
  assert.equal(burn.snapshotAtk,662.784948,'the burn snapshots the caster ATK when applied');
  assert.deepEqual(burn.terms,[{scaling:'atk',multiplier:.5}]);
  let guard=0;
  while(!battle.log.some(event=>event.type==='damage'&&event.kind==='dot'&&event.actor===live.id)&&guard++<40)
    if(!stepBattle(battle))break;
  const tick=battle.log.find(event=>event.type==='damage'&&event.kind==='dot'&&event.actor===live.id);
  near(tick.damage,662.784948*.5,1e-6);
  assert.equal(tick.target,target.id);
}

// ---- 熔解: +6% crit rate per layer, capped at 5 ---------------------------
{
  const {battle,live}=battleWithProwler(mocSource,17);
  let guard=0;
  while(!(live.buffs.find(effect=>effect.tag==='mechaFireMelt')?.stacks>=5)&&guard++<60)
    if(!stepBattle(battle))break;
  const melt=live.buffs.find(effect=>effect.tag==='mechaFireMelt');
  assert.ok(melt,'attacks that hit a burning ally stack 熔解 on the caster');
  assert.equal(melt.stacks,5);
  near(melt.value,.3,1e-9);
  assert.equal(melt.key,'critRate');
  assert.ok(melt.remaining>=1&&melt.remaining<=3);
  assert.equal(melt.modifierName,'Monster_W1_Mecha_Fire_Passive');
  const gains=battle.log.filter(event=>event.type==='mechanic'&&event.name==='【熔解】叠层').map(event=>event.stacks);
  assert.deepEqual(gains.slice(0,5),[1,2,3,4,5]);
  assert.ok(gains.every(stacks=>stacks<=5),'MaxLayer 5');
  assert.ok(battle.log.some(event=>event.type==='mechanic'&&event.name==='【熔解】叠层'&&event.damageBonusMissing===true),
    'the unresolved AllDamageTypeAddedRatio is reported explicitly');
}

// ---- 飞舞烬火: 2.0× extra damage to burning allies, then removes the burn --
{
  const {battle,live}=battleWithProwler(mocSource,19);
  let guard=0;
  while(!bossActions(battle).includes('skill02')&&guard++<60)if(!stepBattle(battle))break;
  const extra=battle.log.filter(event=>event.kind==='additional'&&event.actor===live.id);
  assert.ok(extra.length>=1,'each burning ally takes the sourced 2.0× Pursued damage');
  const currentAtk=live.panel.atk*1.2;
  for(const event of extra)near(event.damage,currentAtk*2,1e-5);
  const removal=battle.log.find(event=>event.type==='mechanic'&&event.name==='【灼烧】解除');
  assert.ok(removal&&removal.reason==='飞舞烬火');
  const summary=battle.log.find(event=>event.type==='mechanic'&&event.name==='【飞舞烬火】灼烧追加伤害');
  assert.ok(summary);
  assert.equal(summary.removed,extra.length,'every extra-damage target loses its burn');
  assert.ok(battle.units.filter(unit=>unit.side==='ally').every(unit=>!burnOn(unit)),'no 灼烧 remains after 飞舞烬火');
}

// ---- 高温运转: +20% ATK / +100 speed; break clears it and locks Burning_CD --
{
  const {battle,live}=battleWithProwler(mocSource,23,{speed:100});
  let guard=0;
  while(!live.buffs.some(effect=>effect.tag==='mechaFireBurning')&&guard++<60)if(!stepBattle(battle))break;
  const burning=live.buffs.filter(effect=>effect.tag==='mechaFireBurning');
  assert.equal(burning.length,2);
  assert.deepEqual(burning.map(effect=>[effect.key,effect.value]),[['atkPct',.2],['speed',100]]);
  near(combatPanel(live).atk,662.784948*1.2,1e-6,'Burning raises ATK by 20%');
  near(combatPanel(live).speed,132+100,1e-9,'Burning raises speed by 100');

  guard=0;
  while(live.broken&&guard++<60)if(!stepBattle(battle))break;
  live.toughness=1;
  guard=0;
  while(!live.broken&&guard++<40)if(!stepBattle(battle))break;
  assert.equal(live.broken,true);
  assert.equal(live.buffs.some(effect=>effect.tag==='mechaFireBurning'),false,'weakness break removes Burning');
  assert.equal(live.buffs.some(effect=>effect.tag==='mechaFireMelt'),false,'weakness break removes 熔解');
  assert.equal(live.resources['炽燃徘徊者BurningCD'],1,'Burning OnDestroy writes Burning_CD');
  assert.equal(live.resources['炽燃徘徊者AICounter'],3,'1023010 does not reset AICounter on break');
  const breakNotes=battle.log.filter(event=>event.type==='mechanic'&&event.name==='弱点击破 · 炽燃徘徊者状态解除');
  const breakNote=breakNotes.at(-1);
  assert.ok(breakNote&&breakNote.burning===true&&breakNote.resetAiCounter===false);

  guard=0;
  while(live.resources['炽燃徘徊者BurningCD']>0&&guard++<40)if(!stepBattle(battle))break;
  const cooldownEnd=battle.log.find(event=>event.type==='mechanic'&&event.name==='【高温运转·冷却】结束');
  assert.ok(cooldownEnd,'the next attack removes Burning_CD');
  assert.equal(cooldownEnd.action,'skill07','counter 3 without Burning picks 燃焰斩击');
  assert.equal(live.resources['炽燃徘徊者AICounter'],4);
}

// ---- PF spawn path initializes lazily on the first action ------------------
{
  const {battle,live}=battleWithProwler(pfSource,29);
  assert.equal(live.level,55);
  near(live.panel.hp,28719.8,1e-6);
  // PF 波次 spawn 的单位跳过 createBattle 的 onStart：清空资源模拟该路径。
  delete live.resources;
  assert.equal(stepBattle(battle),true);
  assert.equal(live.resources['炽燃徘徊者AICounter'],2,'first action lazily initializes the counter and advances 1→2');
  assert.equal(live.resources['炽燃徘徊者BurningCD'],0);
  assert.equal(bossActions(battle)[0],'skill06');
}

console.log('searing prowler (1023010): all checks passed');
