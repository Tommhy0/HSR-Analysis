import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createContext} from '../core/ctx.mjs';
import {inspectEndgameTarget} from '../simulator/endgame-scenes.mjs';
import {imaginaryWeaver,isEnemyMechanicRegistered,validateEnemyActor} from '../simulator/encounters.mjs';
import {combatPanel,createBattle,receiveDamage,stepBattle} from '../simulator/engine.mjs';
import {strictParty} from '../simulator/party.mjs';

const ctx=createContext(JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url))));
const scene=inspectEndgameTarget(ctx,{mode:'pf',seasonId:2027,floorId:'20271',side:1});
const source=scene.enemies.find(enemy=>enemy.childId===8002010);
assert.ok(source,'PF 20271/S1 contains Imaginary Weaver (child 8002010)');

const weaver=imaginaryWeaver(ctx,{sceneEnemy:source,id:'weaver-1'});
assert.deepEqual(validateEnemyActor(weaver),[]);
assert.equal(isEnemyMechanicRegistered(8002010),true);
assert.equal(weaver.monsterId,8002010);
assert.equal(weaver.element,'Imaginary');
assert.equal(weaver.panel.hp,source.hp);
assert.equal(weaver.panel.speed,source.speed);
assert.equal(weaver.toughnessMax,source.toughness);
assert.deepEqual(weaver.weaknesses,['Physical','Thunder','Quantum']);
assert.deepEqual(weaver.enemyKit.sourceHashes,{
  ai:'5e990af4de48425c98defc45b873b5e725269657',
  ability:'f296c0076837ca1d5131927e287cf4286a6d797c',
  character:'6077b22200e26b62b30c0ecaaf9accd558182b43'});
assert.deepEqual(weaver.actions.skill01.terms,[{scaling:'atk',multiplier:2.5}]);
assert.equal(weaver.actions.skill01.hitEnergy,15);
assert.deepEqual(weaver.actions.skill02.terms,[{scaling:'atk',multiplier:2.5}]);
assert.equal(weaver.actions.skill02.hitEnergy,15);
assert.equal(weaver.actions.skill03.target,'blast');
assert.deepEqual(weaver.actions.skill03.terms,[{scaling:'atk',multiplier:2.5},{scaling:'atk',multiplier:2.5,target:'adjacent'}]);
assert.equal(weaver.actions.skill03.hitEnergy,10);
assert.deepEqual(weaver.enemyKit.skill03Params,[2.5,1]);
assert.equal(weaver.enemyKit.attackBuffDamageBonus,1);
assert.equal(weaver.enemyMechanicNotes.length,5,'source gaps stay explicit');

const zeroDefPanel=atk=>({hp:1e9,atk,def:0,speed:1,critRate:0,critDmg:0,effectRes:0,energyRegen:1,elemDmg:{},baseStats:{hp:1e9,atk,def:0}});
function battleWith(extra,seed=13){
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
  return slices.filter(slice=>slice.key===key).flatMap(slice=>slice.hits);
};
const attackBuffOf=unit=>unit.buffs.find(effect=>effect.tag==='imaginaryWeaverAttackUp');

const rotation=battleWith(imaginaryWeaver(ctx,{sceneEnemy:source,id:'weaver-rotate'}));
const live=rotation.units.find(unit=>unit.id==='weaver-rotate');
const atk=combatPanel(live).atk;
assert.equal(live.resources['虚数织叶者AIFlag'],1);
assert.equal(attackBuffOf(live),undefined,'【后手】starts absent');

// AIFlag 1 → 颂歌震荡（主目标 + 相邻各 2.5 倍，命中回能 10），随后按 Skill03[1]=1.0 施加【后手】。
const turn1=takeTurn(rotation,live);
assert.deepEqual(skillsOf(turn1,live),['skill03']);
assert.equal(live.resources['虚数织叶者AIFlag'],2);
const blast=hitsOf(turn1,live,'skill03');
const slotOf=id=>Number(/-(\d+)$/.exec(id)?.[1]);
const mainSlot=slotOf(blast[0].target);
assert.ok(blast.length===2||blast.length===3,'颂歌震荡 hits the main target plus its live neighbours');
for(const hit of blast.slice(1))
  assert.ok(Math.abs(slotOf(hit.target)-mainSlot)===1,`${hit.target} is adjacent to the main target ${blast[0].target}`);
for(const hit of blast){
  assert.equal(hit.hitEnergy,10);
  assert.ok(Math.abs(hit.damage-atk*2.5)<1e-6,`颂歌震荡 is 2.5x ATK per target, got ${hit.damage}`);
}
const applied=turn1.find(event=>event.type==='mechanic'&&event.name==='【后手】施加');
assert.ok(applied,'the Skill03 rider grants 【后手】');
assert.equal(applied.damageBonus,1);
assert.ok(attackBuffOf(live),'the caster holds the Attack modifier');
assert.ok(Math.abs(attackBuffOf(live).value-1)<1e-12,'AllDamageTypeAddedRatio = Skill03[1] = 100%');

// AIFlag 2 且持有【后手】→ 颂歌爆发（2.5 倍单体，命中回能 15），结算后移除【后手】。
const turn2=takeTurn(rotation,live);
assert.deepEqual(skillsOf(turn2,live),['skill02'],'holding Attack routes the flag-2 branch to 颂歌爆发');
assert.equal(live.resources['虚数织叶者AIFlag'],1);
const burst=hitsOf(turn2,live,'skill02');
assert.equal(burst.length,1,'the 0.3 / 0.3 / 0.4 hit split is still a single hit');
assert.equal(burst[0].hitEnergy,15);
assert.ok(Math.abs(burst[0].damage-atk*2.5*2)<1e-6,`颂歌爆发 is 2.5x ATK with the +100% 【后手】, got ${burst[0].damage}`);
assert.equal(attackBuffOf(live),undefined,'the modifier is removed after 颂歌光束 / 颂歌爆发');
assert.ok(turn2.some(event=>event.type==='mechanic'&&event.name==='【后手】解除'));

// AIFlag 1 → 颂歌震荡重新施加【后手】；弱点击破（OnBeingBreak）清除它。
const turn3=takeTurn(rotation,live);
assert.deepEqual(skillsOf(turn3,live),['skill03']);
assert.equal(live.resources['虚数织叶者AIFlag'],2);
assert.ok(attackBuffOf(live),'颂歌震荡 re-applies 【后手】');
const breaker=rotation.units.find(unit=>unit.side==='ally');
rotation.rules.weaknessBreak(rotation,breaker,live,{name:'probe',element:'Physical'},'Physical');
assert.equal(attackBuffOf(live),undefined,'a weakness break removes 【后手】');
assert.ok(rotation.log.some(event=>event.type==='mechanic'&&event.name==='【后手】解除'&&event.reason==='弱点击破'));

// AIFlag 2 且没有【后手】→ 颂歌光束（2.5 倍单体，命中回能 15）。
const turn4=takeTurn(rotation,live);
assert.deepEqual(skillsOf(turn4,live),['skill01'],'without Attack the flag-2 branch falls back to 颂歌光束');
assert.equal(live.resources['虚数织叶者AIFlag'],1);
const beam=hitsOf(turn4,live,'skill01');
assert.equal(beam.length,1);
assert.equal(beam[0].hitEnergy,15);
assert.ok(Math.abs(beam[0].damage-atk*2.5)<1e-6,`颂歌光束 is 2.5x ATK, got ${beam[0].damage}`);

// OnBeforeDying：阵亡时同样移除【后手】。
const deathBattle=battleWith(imaginaryWeaver(ctx,{sceneEnemy:source,id:'weaver-dying'}),17);
const dying=deathBattle.units.find(unit=>unit.id==='weaver-dying');
const killer=deathBattle.units.find(unit=>unit.side==='ally');
takeTurn(deathBattle,dying);
assert.ok(attackBuffOf(dying),'颂歌震荡 seeds 【后手】 before the lethal hit');
receiveDamage(deathBattle,killer,dying,1e12,'direct',{name:'lethal probe'});
assert.ok(dying.hp<=1e-8);
assert.ok(deathBattle.log.some(event=>event.type==='mechanic'&&event.name==='【后手】解除'&&event.reason==='自身阵亡'));

console.log('PF 20271/S1 Imaginary Weaver checks: sourced 2.5x beam / 2.5x burst / 2.5x+2.5x blast, AIFlag 1→3 / 2→1 rotation, 【后手】+100% damage grant, removal after beam/burst, on break and on death passed.');
