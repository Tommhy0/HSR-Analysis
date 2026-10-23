import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createContext} from '../core/ctx.mjs';
import {inspectEndgameTarget} from '../simulator/endgame-scenes.mjs';
import {cagePast,isEnemyMechanicRegistered,validateEnemyActor} from '../simulator/encounters.mjs';
import {combatPanel,createBattle,stepBattle} from '../simulator/engine.mjs';
import {strictParty} from '../simulator/party.mjs';

const ctx=createContext(JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url))));
const scene=inspectEndgameTarget(ctx,{mode:'moc',seasonId:1036,floorId:'5510',side:1});
const source=scene.enemies.find(enemy=>enemy.childId===3003030);
assert.ok(source,'MoC 1036 5510/S1 contains 「身陷樊笼的往昔」(child 3003030)');
assert.equal(source.level,90);
assert.equal(source.hp,420494.7);
assert.equal(source.speed,132);
assert.deepEqual(source.weakness,['Fire','Thunder','Imaginary']);

const actor=cagePast(ctx,{sceneEnemy:source,id:'cage-past'});
assert.deepEqual(validateEnemyActor(actor),[]);
assert.equal(isEnemyMechanicRegistered(3003030),true);
assert.equal(actor.monsterId,3003030);
assert.equal(actor.childId,3003030);
assert.equal(actor.element,'Physical');
assert.equal(actor.panel.hp,source.hp);
assert.equal(actor.panel.speed,source.speed);
assert.deepEqual(actor.enemyKit.sourceHashes,{
  ai:'fcf713f8ff11f06572987ef20089a16aa6838241',
  ability:'b6f859072be5f1e6652f7ffd1e44d195d7557359',
  character:'f41951771fd06e843c3395433d759559a0f852ba'});
assert.deepEqual(actor.enemyKit.skill01Params,[3.6,0]);
assert.deepEqual(actor.enemyKit.skill03Params,[3,0]);
assert.deepEqual(actor.enemyKit.skill05Params,[15]);
assert.deepEqual(actor.actions.skill01.terms,[{scaling:'atk',multiplier:3.6}]);
assert.deepEqual(actor.actions.skill03.terms,[{scaling:'atk',multiplier:3},{scaling:'atk',multiplier:3,target:'adjacent'}]);
assert.equal(actor.actions.skill05.target,'all');
assert.equal(actor.actions.skill05.terms.length,0,'笼中传福音 is resolved by the controller with a divided ratio');
assert.equal(actor.enemyMechanicNotes.length,6,'source gaps stay explicit');

const zeroDefPanel=atk=>({hp:1e9,atk,def:0,speed:1,critRate:0,critDmg:0,effectRes:0,energyRegen:1,elemDmg:{},baseStats:{hp:1e9,atk,def:0}});
function battleWith(seed=41){
  const party=structuredClone(strictParty(ctx).units.filter(unit=>unit.side==='ally'));
  for(const unit of party){
    delete unit.kit;delete unit.characterId;delete unit.gear;delete unit.memospriteOwner;
    unit.panel=zeroDefPanel(100);unit.hp=1e9;unit.energy=0;unit.energyMax=100;
    unit.buffs=[];unit.shields=[];unit.dots=[];unit.resources={};
    unit.actions={basic:{name:'probe',type:'Normal',element:'Physical',target:'single',terms:[{scaling:'atk',multiplier:1}]}};
    unit.policy={autoUltimate:false,basicOnly:true};unit.standardBreak=false;
  }
  const battle=createBattle({strict:false,maxAV:1000,sp:3,maxSP:9,seed,critMode:'noncrit',
    units:[...party,cagePast(ctx,{sceneEnemy:source,id:'cage-past'})]});
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
const markedOf=battle=>battle.units.filter(unit=>unit.side==='ally'&&
  unit.buffs.some(effect=>effect.tag==='cagePastAimTarget'));

const battle=battleWith();
const live=battle.units.find(unit=>unit.id==='cage-past');
const atk=combatPanel(live).atk;
const allies=battle.units.filter(unit=>unit.side==='ally');
assert.equal(live.resources['身陷樊笼AIFlag']??1,1);

// Flag 1/2/3：鞭伤除净恶 3.6 倍单体 → 责打入人心 3.0 倍主目标 + 相邻。
const turn1=takeTurn(battle,live);
assert.deepEqual(skillsOf(turn1,live),['skill01']);
const single=turn1.filter(event=>event.type==='damage'&&event.actor===live.id&&event.kind!=='dot');
assert.equal(single.length,1);
assert.ok(Math.abs(single[0].damage-atk*3.6)<1e-6,`鞭伤除净恶 is 3.6x ATK, got ${single[0].damage}`);
const turn2=takeTurn(battle,live);
assert.deepEqual(skillsOf(turn2,live),['skill03']);
const blast=turn2.filter(event=>event.type==='damage'&&event.actor===live.id&&event.kind!=='dot');
assert.ok(blast.length===2||blast.length===3,'责打入人心 hits the main target plus live neighbours');
for(const hit of blast)assert.ok(Math.abs(hit.damage-atk*3)<1e-6,`责打入人心 is 3.0x ATK per target, got ${hit.damage}`);
const turn3=takeTurn(battle,live);
assert.deepEqual(skillsOf(turn3,live),['skill03']);

// Flag 4（无 OneMore）→ 使者带锁链：随机锁定 1 人、AimTargetCount=1、IsAiming 4 层。
const turn4=takeTurn(battle,live);
assert.deepEqual(skillsOf(turn4,live),['skill04']);
assert.equal(live.resources['身陷樊笼AIFlag'],5);
assert.equal(live.resources['身陷樊笼锁定人数'],1);
assert.equal(markedOf(battle).length,1,'exactly one ally is locked');
const aiming=live.buffs.find(effect=>effect.tag==='cagePastIsAiming');
assert.ok(aiming,'IsAiming is applied');
assert.equal(aiming.stacks,4);
assert.ok(turn4.some(event=>event.type==='mechanic'&&event.name==='【使者带锁链】开始蓄力'));

// 蓄力期间被未锁定我方攻击 → 追加锁定 +1 层。
const firstMarked=markedOf(battle)[0];
const unmarked=allies.find(unit=>unit!==firstMarked);
takeTurn(battle,unmarked);
assert.equal(markedOf(battle).length,2,'attacking during the charge adds a lock');
assert.ok(unmarked.buffs.some(effect=>effect.tag==='cagePastAimTarget'&&effect.source===live.id));
assert.equal(live.resources['身陷樊笼锁定人数'],2);
const secondUnmarked=allies.find(unit=>!markedOf(battle).includes(unit));
takeTurn(battle,secondUnmarked);
assert.equal(markedOf(battle).length,3);
assert.equal(live.buffs.find(effect=>effect.tag==='cagePastIsAiming').stacks,4,'IsAiming stays capped at 4 layers');

// Flag 5 → 笼中传福音：对每名被锁目标造成 15 ÷ 锁定人数 倍攻击力。
const turn5=takeTurn(battle,live);
assert.deepEqual(skillsOf(turn5,live),['skill05']);
assert.equal(live.resources['身陷樊笼AIFlag'],6);
const burst=turn5.filter(event=>event.type==='damage'&&event.actor===live.id&&event.kind!=='dot');
assert.equal(burst.length,3,'one hit per locked ally');
for(const hit of burst)assert.ok(Math.abs(hit.damage-atk*15/3)<1e-6,`笼中传福音 is 15/3 x ATK, got ${hit.damage}`);
const share=turn5.find(event=>event.type==='mechanic'&&event.name==='【笼中传福音】平均分摊');
assert.deepEqual([share.count,share.ratio,share.extraEffectId],[3,5,401301001]);
assert.equal(markedOf(battle).length,0,'the burst clears every lock');
assert.equal(live.buffs.some(effect=>effect.tag==='cagePastIsAiming'),false,'IsAiming is removed');

// Flag 6 → 鞭伤除净恶，回到 1。
const turn6=takeTurn(battle,live);
assert.deepEqual(skillsOf(turn6,live),['skill01']);
assert.equal(live.resources['身陷樊笼AIFlag'],1);

// 弱点击破：IsAiming.OnBeingBreak → AIFlag=7、延后 0.5、清除锁定。
const breakBattle=battleWith(43);
const breaker=battle0=>battle0.units.find(unit=>unit.side==='ally');
const boss=breakBattle.units.find(unit=>unit.id==='cage-past');
takeTurn(breakBattle,boss);takeTurn(breakBattle,boss);takeTurn(breakBattle,boss);
takeTurn(breakBattle,boss); // skill04
assert.equal(markedOf(breakBattle).length,1);
const distanceBefore=boss.distance;
breakBattle.rules.weaknessBreak(breakBattle,breaker(breakBattle),boss,{name:'probe',element:'Fire'},'Fire');
assert.equal(boss.resources['身陷樊笼AIFlag'],7);
assert.equal(markedOf(breakBattle).length,0);
assert.equal(boss.buffs.some(effect=>effect.tag==='cagePastIsAiming'),false);
assert.ok(Math.abs(boss.distance-(distanceBefore+10000*.5))<1e-6,'break delays the boss by 0.5 action value');
const turn7=takeTurn(breakBattle,boss);
assert.deepEqual(skillsOf(turn7,boss),['skill03'],'flag 7 → 责打入人心 → 6');
assert.equal(boss.resources['身陷樊笼AIFlag'],6);

console.log('MoC 1036 5510/S1 「身陷樊笼的往昔」: sourced 3.6x single / 3.0x blast, charge locks, attack-while-charging extra locks, 15/count shared burst, break flag 7 + 0.5 delay passed.');
