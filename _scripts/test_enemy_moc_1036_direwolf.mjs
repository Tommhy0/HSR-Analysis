import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createContext} from '../core/ctx.mjs';
import {direwolf,isEnemyMechanicRegistered,validateEnemyActor} from '../simulator/encounters.mjs';
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
    ally.actions={basic:{name:'source-check probe',type:'Normal',element:'Physical',target:'single',terms:[{scaling:'atk',multiplier:10}]}};
    ally.policy={autoUltimate:false,basicOnly:true};ally.standardBreak=false;
  }
  return allies;
}
const near=(actual,expected,tolerance=1e-6)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} != ${expected}`);
function hitsFor(battle,actorId,key){
  const log=battle.log,start=log.findIndex(event=>event.type==='action'&&event.actor===actorId&&event.key===key);
  if(start<0)return [];
  const end=log.findIndex((event,index)=>index>start&&event.type==='action');
  return log.slice(start+1,end<0?undefined:end).filter(event=>event.type==='damage'&&event.actor===actorId);
}

// ---- Source rows -----------------------------------------------------------
const mocScene=inspectEndgameTarget(ctx,{mode:'moc',seasonId:1036,floorId:'5510',side:2});
const mocSource=mocScene.enemies.find(enemy=>enemy.childId===1013020);
assert.ok(mocSource,'MoC 1036 5510/S2 includes 自动机兵•齿狼 1013020');
const pfScene=inspectEndgameTarget(ctx,{mode:'pf',seasonId:2027,floorId:'20273',side:1});
const pfSource=pfScene.enemies.find(enemy=>enemy.childId===101302032);
assert.ok(pfSource,'PF 2027 20273/S1 includes 自动机兵•齿狼 child 101302032');

for(const [source,label] of [[mocSource,'MoC'],...[[pfSource,'PF']]]){
  const actor=direwolf(ctx,{sceneEnemy:source});
  assert.equal(isEnemyMechanicRegistered(source.childId),true,label+' childId is registered');
  assert.deepEqual(validateEnemyActor(actor),[],label+' actor passes the strict validator');
  assert.equal(actor.monsterId,1013020);
  assert.equal(actor.childId,source.childId);
  assert.equal(actor.element,'Physical');
  assert.equal(actor.rank,'elite');
  near(actor.panel.hp,source.hp,.11);
  near(actor.panel.speed,source.speed,1e-9);
  assert.equal(actor.level,source.level);
  assert.deepEqual(actor.weaknesses,['Ice','Thunder','Imaginary']);
  assert.deepEqual(actor.enemyKit.sourceHashes,{
    ai:'7a0d3548bbef77ed7f426f5689145a174b2edd52',
    character:'20542b3095a4ec9ca9dd388df633354f25b25727',
    ability:'b24b234e209cfe17bbfdd5c24377b2f2a1a8d53e'});
  assert.deepEqual([actor.enemyKit.skill01Params,actor.enemyKit.skill03Params,actor.enemyKit.skill04Params],
    [[.5,.05,4,10],[2.5],[2.5]]);
  assert.deepEqual([actor.enemyKit.bleedChance,actor.enemyKit.bleedRatio,
    actor.enemyKit.bleedDuration,actor.enemyKit.bleedMaxStacks],[.5,.05,2,10]);
}

const actor=direwolf(ctx,{sceneEnemy:mocSource});
assert.equal(actor.actions.skill01.name,'砍伐指令');
assert.equal(actor.actions.skill01.repeatCount,10);
assert.deepEqual(actor.actions.skill01.terms,[{scaling:'atk',multiplier:.4}]);
assert.deepEqual([actor.actions.skill02.name,actor.actions.skill02.terms.length],['目标锁定',0]);
assert.equal(actor.enemyMechanicNotes.length,6);

// ---- Full AI rotation ------------------------------------------------------
function battleWithWolf(source,seed,opts={}){
  const allies=dummyParty(opts);
  const wolf=direwolf(ctx,{sceneEnemy:source,id:'direwolf-runtime'});
  const battle=createBattle({strict:false,maxAV:3000,sp:3,maxSP:9,seed,critMode:'noncrit',units:[...allies,wolf]});
  for(const unit of battle.units)unit.distance=10000;
  const live=battle.units.find(unit=>unit.id==='direwolf-runtime');
  live.distance=0;
  return {battle,live};
}

{
  const {battle,live}=battleWithWolf(mocSource,11);
  const steps=[];
  for(let turn=0;turn<5;turn++){
    const before=battle.log.length;
    assert.equal(stepBattle(battle),true);
    steps.push(battle.log.slice(before)
      .filter(event=>event.type==='action'&&event.actor===live.id)
      .map(event=>event.key+':'+event.kind));
  }
  assert.deepEqual(steps,[
    ['skill03:normal','skill03:continuation'],
    ['skill02:normal'],
    ['skill01:normal','skill03:continuation'],
    ['skill02:normal'],
    ['skill01:normal','skill03:continuation']],
  'AIFlag 1→2→3 plus the RemoveOneMore OnActionEnd rule produce the sourced rotation');
  const sawHits=hitsFor(battle,live.id,'skill01');
  assert.equal(sawHits.length,10,'砍伐指令 resolves ten separate hits');
  assert.ok(sawHits.every(event=>event.hitEnergy===2),'each saw hit grants 2 energy');
}

// ---- Bleed stacking and Max-HP tick ---------------------------------------
{
  const {battle,live}=battleWithWolf(mocSource,13,{speed:180});
  for(let turn=0;turn<3;turn++)assert.equal(stepBattle(battle),true);
  const applications=battle.log.filter(event=>event.type==='mechanic'&&event.name==='【裂伤】施加 / 叠层');
  assert.ok(applications.length>=1,'saw hits and 解体指令 apply 裂伤');
  const owners=battle.units.filter(unit=>unit.side==='ally'&&unit.dots.some(dot=>dot.tag==='direwolfBleed'));
  assert.ok(owners.length>=1,'裂伤 is attached to an ally');
  const bleed=owners[0].dots.find(dot=>dot.tag==='direwolfBleed');
  assert.equal(bleed.tickAt,'start');
  assert.equal(bleed.remaining,2);
  assert.equal(bleed.maxHpRatio,.05);
  assert.ok(Number.isInteger(bleed.stacks)&&bleed.stacks>=1&&bleed.stacks<=10);
  const applied=applications.filter(event=>event.target===owners[0].id).length;
  assert.equal(bleed.stacks,Math.min(10,applied),'layer count equals successful applications (capped at 10)');
  // Advance to the affected ally's turn: the DoT must tick for max HP × layers × 5%.
  let guard=0;
  while(!battle.log.some(event=>event.type==='damage'&&event.kind==='dot'&&event.actor===live.id)&&guard++<400)
    if(!stepBattle(battle))break;
  const ticks=battle.log.filter(event=>event.type==='damage'&&event.kind==='dot'&&event.actor===live.id);
  assert.ok(ticks.length>=1,'裂伤 ticks at the holder turn start');
  const perLayer=1e9*.05,layers=ticks[0].damage/perLayer;
  assert.ok(ticks[0].damage>0);
  near(layers,Math.round(layers),1e-3);
  assert.ok(Math.round(layers)>=1&&Math.round(layers)<=10,'tick scales with 1–10 layers of target max HP');
}

// ---- Shield predicate: retarget to the highest current-HP-ratio ally ------
{
  const {battle,live}=battleWithWolf(mocSource,17);
  for(let turn=0;turn<2;turn++)assert.equal(stepBattle(battle),true);
  const allies=battle.units.filter(unit=>unit.side==='ally');
  const signed=allies.find(unit=>unit.buffs.some(effect=>effect.tag==='direwolfSign'&&effect.source===live.id));
  assert.ok(signed,'目标锁定 marks one ally for the next 砍伐指令');
  signed.hp=1e6;
  const other=allies.find(unit=>unit!==signed);other.hp=1e9;
  const before=battle.log.length;
  assert.equal(stepBattle(battle),true);
  const events=battle.log.slice(before);
  const retarget=events.find(event=>event.type==='mechanic'&&event.name==='【砍伐指令】护盾判定失败 · 转火');
  assert.ok(retarget,'an unshielded 砍伐指令 target triggers the sourced retarget');
  assert.equal(retarget.target,signed.id);
  assert.equal(retarget.retarget,other.id);
  assert.equal(retarget.battleScoreFlag,1,'Mecha04_BattleScore2_Flag is capped at 1');
  const hits=hitsFor(battle,live.id,'skill01');
  assert.equal(hits.length,10);
  assert.ok(hits.every(event=>event.target===other.id),'all ten hits follow the retarget');
}

// ---- Shield present: no retarget -----------------------------------------
{
  const {battle,live}=battleWithWolf(mocSource,19);
  for(let turn=0;turn<2;turn++)assert.equal(stepBattle(battle),true);
  const allies=battle.units.filter(unit=>unit.side==='ally');
  const signed=allies.find(unit=>unit.buffs.some(effect=>effect.tag==='direwolfSign'&&effect.source===live.id));
  assert.ok(signed);
  signed.shields=[{id:'probe-shield',name:'probe',value:1e12}];
  const other=allies.find(unit=>unit!==signed);other.hp=1e9;
  const before=battle.log.length;
  assert.equal(stepBattle(battle),true);
  const events=battle.log.slice(before);
  assert.ok(!events.some(event=>event.name==='【砍伐指令】护盾判定失败 · 转火'),'a shielded target keeps the saw on itself');
  const hits=hitsFor(battle,live.id,'skill01');
  assert.equal(hits.length,10);
  assert.ok(hits.every(event=>event.target===signed.id));
}

// ---- PF spawn path initializes on first action ---------------------------
{
  const {battle,live}=battleWithWolf(pfSource,23);
  assert.equal(live.level,75);
  near(live.panel.hp,2237284.3,.11);
  // PF 波次 spawn 的单位跳过 createBattle 的 onStart：清空资源模拟该路径。
  delete live.resources;
  assert.equal(stepBattle(battle),true);
  assert.equal(live.resources['齿狼AIFlag'],2,'first action lazily initializes the flag and advances to 2');
  assert.equal(live.resources['齿狼OneMorePerTurn'],1);
}

console.log('direwolf: all checks passed');
