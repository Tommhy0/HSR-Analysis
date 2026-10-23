import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createContext} from '../core/ctx.mjs';
import {inspectEndgameTarget} from '../simulator/endgame-scenes.mjs';
import {furiaePhilosopher,isEnemyMechanicRegistered,validateEnemyActor} from '../simulator/encounters.mjs';
import {combatPanel,createBattle,receiveDamage,stepBattle} from '../simulator/engine.mjs';
import {strictParty} from '../simulator/party.mjs';

const ctx=createContext(JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url))));
const scene=inspectEndgameTarget(ctx,{mode:'pf',seasonId:2027,floorId:'20271',side:1});
const source=scene.enemies.find(enemy=>enemy.childId===4012020);
assert.ok(source,'PF 20271/S1 contains Furiae Philosopher (child 4012020)');

const scholar=furiaePhilosopher(ctx,{sceneEnemy:source,id:'scholar-1'});
assert.deepEqual(validateEnemyActor(scholar),[]);
assert.equal(isEnemyMechanicRegistered(4012020),true);
assert.equal(scholar.monsterId,4012020);
assert.equal(scholar.element,'Physical');
assert.equal(scholar.panel.hp,source.hp);
assert.equal(scholar.panel.speed,source.speed);
assert.equal(scholar.toughnessMax,source.toughness);
assert.deepEqual(scholar.weaknesses,['Fire','Ice','Imaginary']);
assert.deepEqual(scholar.enemyKit.sourceHashes,{
  ai:'fc5465d5e7391f5e00f06fac75aa5e001d577331',
  ability:'f1faa8d8cf88ad45fdbb648694a788e214cf8d53',
  character:'e6e04448aab89d75460af0a66cbc0cbb87c8da6d'});
assert.equal(scholar.actions.skill01.name,'斗争即正义');
assert.equal(scholar.actions.skill01.target,'self');
assert.deepEqual(scholar.actions.skill01.terms,[]);
assert.deepEqual(scholar.actions.skill02.terms,[{scaling:'atk',multiplier:3}]);
assert.equal(scholar.actions.skill02.hitEnergy,15);
assert.deepEqual(scholar.enemyKit.skill01Params,[.3,.3]);
assert.deepEqual(scholar.enemyKit.passive02Params,[.3,.3,2]);
assert.deepEqual(scholar.enemyKit.passiveParams,[3,.3,.1,.1,.06,.3]);
assert.equal(scholar.enemyKit.bookBlockedCustomValue,296710484);
assert.equal(scholar.enemyMechanicNotes.length,5,'source gaps stay explicit');

const zeroDefPanel=atk=>({hp:1e9,atk,def:0,speed:1,critRate:0,critDmg:0,effectRes:0,energyRegen:1,elemDmg:{},baseStats:{hp:1e9,atk,def:0}});
function battleWith(extras,seed=13){
  const party=structuredClone(strictParty(ctx).units.filter(unit=>unit.side==='ally'));
  for(const unit of party){
    delete unit.kit;delete unit.characterId;delete unit.gear;delete unit.memospriteOwner;
    unit.panel=zeroDefPanel(100);unit.hp=1e9;unit.energy=0;unit.energyMax=100;
    unit.buffs=[];unit.shields=[];unit.dots=[];unit.resources={};
    unit.actions={basic:{name:'probe',type:'Normal',element:'Physical',target:'single',terms:[{scaling:'atk',multiplier:1}]}};
    unit.policy={autoUltimate:false,basicOnly:true};unit.standardBreak=false;
  }
  const battle=createBattle({strict:false,maxAV:1000,sp:3,maxSP:9,seed,critMode:'noncrit',units:[...party,...extras]});
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
const bookOf=unit=>unit.buffs.filter(effect=>effect.tag==='furiaePhilosopherBookTarget');

// 轮转：队友没有【宣教】时施放 Skill01（ByRandom 1），全员带【宣教】后转 Skill02。
const rotation=battleWith([
  furiaePhilosopher(ctx,{sceneEnemy:source,id:'scholar-a'}),
  furiaePhilosopher(ctx,{sceneEnemy:source,id:'scholar-b'})]);
const caster=rotation.units.find(unit=>unit.id==='scholar-a');
const teammate=rotation.units.find(unit=>unit.id==='scholar-b');
const atk=combatPanel(caster).atk;

const turn1=takeTurn(rotation,caster);
assert.deepEqual(skillsOf(turn1,caster),['skill01'],'Skill01 is chosen while an unbuffed teammate exists');
assert.equal(turn1.some(event=>event.type==='damage'&&event.actor===caster.id),false,'斗争即正义 deals no damage');
const booked=turn1.filter(event=>event.type==='mechanic'&&event.name==='【宣教】施加');
assert.equal(booked.length,1,'AllTeammate + ByRandom 1 applies exactly one 【宣教】');
assert.equal(booked[0].speedBonus,.3);
assert.equal(booked[0].damageBonus,.3);
const firstTarget=booked[0].target;
assert.ok([caster.id,teammate.id].includes(firstTarget),'the retarget pool includes the caster itself');
const bookedUnit=rotation.units.find(unit=>unit.id===firstTarget);
const bookEffects=bookOf(bookedUnit);
assert.equal(bookEffects.length,2,'【宣教】grants one speed and one damage effect');
const speedEffect=bookEffects.find(effect=>effect.key==='speedPct');
const damageEffect=bookEffects.find(effect=>effect.key==='dmgBoost');
assert.ok(speedEffect&&damageEffect);
assert.equal(speedEffect.value,.3);
assert.equal(damageEffect.value,.3);
assert.equal(speedEffect.source,caster.id);
assert.equal(speedEffect.removeOnSourceDeath,true);
assert.equal(speedEffect.remaining,null,'【宣教】has no duration');

const turn2=takeTurn(rotation,caster);
assert.deepEqual(skillsOf(turn2,caster),['skill01'],'the last unbuffed teammate is still worth a support turn');
assert.equal([caster,teammate].every(unit=>bookOf(unit).length===2),true,'both teammates now carry 【宣教】');

const turn3=takeTurn(rotation,caster);
assert.deepEqual(skillsOf(turn3,caster),['skill02'],'with every teammate buffed the AI switches to 战是万物父');
const singleHits=hitsOf(turn3,caster,'skill02');
assert.equal(singleHits.length,1);
// 【宣教】可以直接落在施法者身上，此时它的 30% 增伤作用于自己的战是万物父。
const selfBooked=bookOf(caster).length===2;
assert.ok(Math.abs(singleHits[0].damage-atk*3*(selfBooked?1.3:1))<1e-6,
  `skill02 is 3.0x ATK${selfBooked?' x1.3 self 【宣教】':''}, got ${singleHits[0].damage}`);
assert.equal(singleHits[0].hitEnergy,15);

// 【战甲】：3 层、每层 10% 减伤；受击 -1 层；1→0 层破甲并解除【宣教】；0 层受击追加 10%；自身回合结束回满。
const armorBattle=battleWith([furiaePhilosopher(ctx,{sceneEnemy:source,id:'scholar-armor'})]);
const tank=armorBattle.units.find(unit=>unit.id==='scholar-armor');
const attacker=armorBattle.units.find(unit=>unit.side==='ally');
const armorOf=unit=>unit.buffs.find(effect=>effect.tag==='furiaePhilosopherArmor');
const layersOf=unit=>armorOf(unit)?.stacks??0;
assert.equal(layersOf(tank),3,'PassiveSkillInitiate applies a 3-layer 【战甲】');
assert.ok(Math.abs(armorOf(tank).value-.3)<1e-12,'3 layers x 10% damage reduction');

// 先让哲人给自己施加【宣教】，用于验证破甲时的 BookController 清除。
const setupEvents=takeTurn(armorBattle,tank);
assert.deepEqual(skillsOf(setupEvents,tank),['skill01']);
assert.equal(bookOf(tank).length,2,'the lone Scholar books itself');
assert.equal(tank.resources['天谴哲人战甲初始化'],1);
assert.equal(layersOf(tank),3,'its own turn end restores the full 【战甲】');

for(let expected=2;expected>=1;expected--){
  const events=takeTurn(armorBattle,attacker);
  assert.equal(layersOf(tank),expected,'each incoming attack removes one layer');
  assert.ok(Math.abs(armorOf(tank).value-.1*expected)<1e-12);
  assert.equal(events.some(event=>event.type==='mechanic'&&event.name==='【战甲】层数变化'),true);
}
const breakEvents=takeTurn(armorBattle,attacker);
assert.equal(layersOf(tank),0,'the attack against the last layer is the break hit');
const energyEvent=breakEvents.find(event=>event.type==='energy'&&event.actor===attacker.id);
assert.ok(energyEvent,'the breaker recovers energy');
assert.ok(Math.abs(energyEvent.amount-attacker.energyMax*.06)<1e-9);
const delayEvent=breakEvents.find(event=>event.type==='delay'&&event.actor===tank.id);
assert.ok(delayEvent,'the Scholar is delayed');
assert.ok(Math.abs(delayEvent.ratio-.3)<1e-12);
assert.equal(breakEvents.some(event=>event.type==='mechanic'&&event.name==='【战甲】被破坏'),true);
assert.equal(bookOf(tank).length,0,'BookController clears 【宣教】 when the caster\'s 【战甲】 breaks');
const breakSelf=breakEvents.find(event=>event.type==='damage'&&event.actor===tank.id&&event.target===tank.id);
assert.ok(breakSelf,'the break hits the Scholar for max-HP damage');
assert.ok(breakSelf.damage>0,'the break hits the Scholar for max-HP damage');

const crackedEvents=takeTurn(armorBattle,attacker);
assert.equal(layersOf(tank),0);
const crackedSelf=crackedEvents.find(event=>event.type==='damage'&&event.actor===tank.id&&event.target===tank.id);
assert.ok(crackedSelf,'a cracked Scholar takes extra damage from every attack');
assert.ok(Math.abs(crackedSelf.damage/breakSelf.damage-.1/.3)<1e-9,
  'the extra hit is 10% max HP versus the 30% break hit');

takeTurn(armorBattle,tank);
assert.equal(layersOf(tank),3,'【战甲】returns to max layers at the end of its own turn');

// 永恒的活火：我方致命一击时给击杀者 +30% 速度 / +30% 伤害，2 回合；同时清除【宣教】。
const deathBattle=battleWith([
  furiaePhilosopher(ctx,{sceneEnemy:source,id:'scholar-dying'}),
  furiaePhilosopher(ctx,{sceneEnemy:source,id:'scholar-ally'})],23);
const dying=deathBattle.units.find(unit=>unit.id==='scholar-dying');
const allyCaster=deathBattle.units.find(unit=>unit.id==='scholar-ally');
const killer=deathBattle.units.find(unit=>unit.side==='ally');
takeTurn(deathBattle,dying);
assert.equal([dying,allyCaster].some(unit=>bookOf(unit).length===2),true,'a 【宣教】 exists before the Scholar dies');
receiveDamage(deathBattle,killer,dying,1e12,'direct',{name:'lethal probe'});
assert.ok(dying.hp<=1e-8);
const killerSpeed=killer.buffs.find(effect=>effect.tag==='furiaePhilosopherBookKiller'&&effect.key==='speedPct');
const killerDamage=killer.buffs.find(effect=>effect.tag==='furiaePhilosopherBookKiller'&&effect.key==='dmgBoost');
assert.ok(killerSpeed&&killerDamage,'the killer gains 【永恒的活火】');
assert.equal(killerSpeed.value,.3);
assert.equal(killerDamage.value,.3);
assert.equal(killerSpeed.remaining,2);
assert.equal(killerDamage.remaining,2);
assert.equal(deathBattle.units.some(unit=>bookOf(unit).length>0),false,'RemoveWhenCasterDead clears the 【宣教】 of the dead Scholar');
assert.ok(deathBattle.log.some(event=>event.type==='mechanic'&&event.name==='【永恒的活火】致命一击者增益'));

console.log('PF 20271/S1 Furiae Philosopher checks: sourced 3.0x single, AllTeammate + ByRandom 1 【宣教】 (+30% SPD / +30% DMG, RemoveWhenCasterDead), 3-layer 【战甲】 break / cracked damage / turn-end restore, and 【永恒的活火】 killer buff passed.');
