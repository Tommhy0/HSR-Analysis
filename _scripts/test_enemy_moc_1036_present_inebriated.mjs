import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createContext} from '../core/ctx.mjs';
import {inspectEndgameTarget} from '../simulator/endgame-scenes.mjs';
import {isEnemyMechanicRegistered,presentInebriatedInRevelry,validateEnemyActor} from '../simulator/encounters.mjs';
import {combatPanel,createBattle,stepBattle} from '../simulator/engine.mjs';
import {strictParty} from '../simulator/party.mjs';

const ctx=createContext(JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url))));
const scene=inspectEndgameTarget(ctx,{mode:'moc',seasonId:1036,floorId:'5510',side:1});
const source=scene.enemies.find(enemy=>enemy.childId===3003050);
assert.ok(source,'MoC 1036 5510/S1 contains 「醉于盛会的此刻」(child 3003050)');
assert.equal(source.level,90);
assert.equal(source.hp,420494.7);
assert.equal(source.speed,158.4);
assert.deepEqual(source.weakness,['Physical','Fire','Imaginary']);

const actor=presentInebriatedInRevelry(ctx,{sceneEnemy:source,id:'revelry-moc'});
assert.deepEqual(validateEnemyActor(actor),[]);
assert.equal(isEnemyMechanicRegistered(3003050),true);
assert.equal(actor.monsterId,3003050);
assert.equal(actor.childId,3003050);
assert.equal(actor.element,'Wind');
assert.equal(actor.panel.hp,source.hp);
assert.equal(actor.panel.speed,source.speed);
assert.equal(actor.toughnessMax,source.toughness);
assert.deepEqual(actor.enemyKit.sourceHashes,{
  ai:'641dbe791b7b4ec068154d5bde8bbac7f38875bb',
  ability:'645274ac487217b5c615d9a98535d9224e38ee8d',
  character:'b53aae93903c5ed65d8e07dfee83f7fb1aee6364'});
assert.deepEqual(actor.enemyKit.skill01Params,[1,2,1.2,3,3]);
assert.deepEqual(actor.enemyKit.skill05Params,[1.25]);
assert.equal(actor.enemyKit.dotSnapshot,true);
assert.equal(actor.enemyKit.dotPerTargetRoll,true);
assert.equal(actor.enemyKit.breakAiFlag,7);
assert.equal(actor.enemyMechanicNotes.length,5,'source gaps stay explicit');

const zeroDefPanel=atk=>({hp:1e9,atk,def:0,speed:1,critRate:0,critDmg:0,effectRes:0,energyRegen:1,elemDmg:{},baseStats:{hp:1e9,atk,def:0}});
function battleWith(seed=37){
  const party=structuredClone(strictParty(ctx).units.filter(unit=>unit.side==='ally'));
  for(const unit of party){
    delete unit.kit;delete unit.characterId;delete unit.gear;delete unit.memospriteOwner;
    unit.panel=zeroDefPanel(100);unit.hp=1e9;unit.energy=0;unit.energyMax=100;
    unit.buffs=[];unit.shields=[];unit.dots=[];unit.resources={};
    unit.actions={basic:{name:'probe',type:'Normal',element:'Physical',target:'single',terms:[{scaling:'atk',multiplier:1}]}};
    unit.policy={autoUltimate:false,basicOnly:true};unit.standardBreak=false;
  }
  const battle=createBattle({strict:false,maxAV:1000,sp:3,maxSP:9,seed,critMode:'noncrit',
    units:[...party,presentInebriatedInRevelry(ctx,{sceneEnemy:source,id:'revelry-moc'})]});
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
const dotsOn=unit=>unit.dots.filter(effect=>['presentInebriatedWindDot','presentInebriatedThunderDot'].includes(effect.tag));

const battle=battleWith();
const live=battle.units.find(unit=>unit.id==='revelry-moc');
const atk=combatPanel(live).atk;
assert.equal(live.resources['醉于盛会AIFlag']??1,1,'the AI starts at flag 1 (lazily initialised)');

// Flag 1 → 为你摆设筵席：每名我方各自获得荒宴醉 / 欢宴罪之一（逐目标独立掷骰）。
const turn1=takeTurn(battle,live);
assert.deepEqual(skillsOf(turn1,live),['skill02']);
assert.equal(live.resources['醉于盛会AIFlag'],2);
const allies=battle.units.filter(unit=>unit.side==='ally');
for(const unit of allies){
  const dots=dotsOn(unit);
  assert.equal(dots.length,1,`${unit.id} gains exactly one DoT from 为你摆设筵席`);
  const dot=dots[0];
  assert.equal(dot.remaining,2,'LifeTime = Skill02[1] = 2');
  assert.deepEqual(dot.terms,[{scaling:'atk',multiplier:1.2}],'one stack = 1.2x ATK');
  assert.equal(dot.snapshotAtk,atk,'UseSnapshotEntity snapshots the caster ATK');
  assert.ok(dot.modifierName==='MMonster_W3_Figure_01_Poison'||dot.modifierName==='MMonster_W3_Figure_01_Electric');
}

// Flag 2 + 我方持有 DoT → 使你福杯满溢：同时施加两种，已有的那种再叠 1 层。
const carried=new Map(allies.map(unit=>[unit.id,new Set(dotsOn(unit).map(dot=>dot.tag))]));
const turn2=takeTurn(battle,live);
assert.deepEqual(skillsOf(turn2,live),['skill04']);
assert.equal(live.resources['醉于盛会AIFlag'],3);
for(const unit of allies){
  const dots=dotsOn(unit);
  assert.equal(dots.length,2,`${unit.id} now carries 荒宴醉 + 欢宴罪`);
  for(const dot of dots)
    assert.equal(dot.stacks,carried.get(unit.id).has(dot.tag)?2:1,'the DoT already present stacks once more');
}

// Flag 3 → 为你洗去一切罪：按 1.25 倍立即结算全部 DoT 并清除。
const turn3=takeTurn(battle,live);
assert.deepEqual(skillsOf(turn3,live),['skill05']);
assert.equal(live.resources['醉于盛会AIFlag'],4);
const burst=turn3.filter(event=>event.type==='damage'&&event.kind==='dot');
assert.equal(burst.length,allies.length*2,'every stored DoT is resolved once');
for(const hit of burst)assert.ok(hit.damage>0);
assert.ok(allies.every(unit=>dotsOn(unit).length===0),'为你洗去一切罪 clears the whole team');
const burstLog=turn3.find(event=>event.type==='mechanic'&&event.name==='【为你洗去一切罪】引爆并清除持续伤害');
assert.equal(burstLog.multiplier,1.25);

// Flag 4 → 为你倾流宝血（单体，50/50 一种 DoT）。
const turn4=takeTurn(battle,live);
assert.deepEqual(skillsOf(turn4,live),['skill01']);
assert.equal(live.resources['醉于盛会AIFlag'],1);
assert.equal(turn4.filter(event=>event.type==='damage'&&event.actor===live.id&&event.kind!=='dot').length,0,
  'the source action has no direct damage — it only applies a DoT');
assert.equal(allies.filter(unit=>dotsOn(unit).length).length,1,'only the hit target carries a DoT');

// 弱点击破 → Monster_W3_Figure_01_Passive.OnBeingBreak 把 AIFlag 置 7，下一步回到 Skill02。
const breaker=allies[0];
battle.rules.weaknessBreak(battle,breaker,live,{name:'probe',element:'Physical'},'Physical');
assert.equal(live.resources['醉于盛会AIFlag'],7);
assert.ok(battle.log.some(event=>event.type==='mechanic'&&event.name==='弱点击破 · 「醉于盛会的此刻」进入 7 号分支'));
const turn5=takeTurn(battle,live);
assert.deepEqual(skillsOf(turn5,live),['skill02'],'flag 7 → Skill02 → 6');
assert.equal(live.resources['醉于盛会AIFlag'],6);

console.log('MoC 1036 5510/S1 「醉于盛会的此刻」: sourced per-target 50/50 DoTs, 你福杯满溢 double application, 1.25x burst, break flag 7 route and snapshot ATK passed.');
