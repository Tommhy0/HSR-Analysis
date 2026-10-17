import assert from 'node:assert/strict';
import {ctx,dummy} from './codex_test_helpers.mjs';
import {newBattleBuild,buildBattleActor} from '../simulator/builds.mjs';
import {createBattle,stepBattle} from '../simulator/engine.mjs';

const panel=(hp,atk=1000,speed=100)=>({hp,atk,def:1000,speed,baseStats:{hp,atk,def:1000},critRate:0,critDmg:1,energyRegen:1,effectHit:0,effectRes:0,breakEffect:0,elemDmg:{}});
const c=buildBattleActor(ctx,{...newBattleBuild(),characterId:1407,level:80,technique:true,relicAuto:false,panel:panel(10000)});c.energy=0;c.policy={...c.policy,autoUltimate:false,basicOnly:true};
const mate=dummy('mate');mate.panel=panel(10000);mate.hp=10;
const foe=dummy('foe','enemy',1000);foe.panel=panel(1e9,1000,1);foe.actions.basic.target='single';foe.actions.basic.terms=[{scaling:'atk',multiplier:0.2}];foe.policy={...foe.policy,turnPlan:[{turn:1,key:'basic',targetId:'mate'}]};
const b=createBattle({strict:false,maxAV:500,sp:3,maxSP:9,seed:42,critMode:'noncrit',units:[c,mate,foe]});
const ally=b.units.find(u=>u.id==='mate'),enemy=b.units.find(u=>u.id==='foe'),owner=b.units.find(u=>u.characterId===1407),dragon=b.units.find(u=>u.memospriteOwner===owner.id);
ally.hp=10;
assert.ok(dragon&&dragon.active,'遐蝶秘技应召唤死龙');
const before=dragon.hp;
for(const u of b.units)u.distance=10000;enemy.distance=0;
assert.equal(stepBattle(b),true);
assert.equal(ally.hp,1,'死龙在场时盟友受到致命伤害后最低保留1点生命');
const payment=b.log.filter(e=>e.type==='hp_consume'&&e.target===dragon.id&&e.reason?.includes('500%生命承担')).reduce((n,e)=>n+e.amount,0);
assert.ok(payment>0,'致命伤害溢出应扣除死龙生命');
assert.ok(payment<=before,'扣血支付不得超过死龙当前生命');

// 真实行动轴：死龙从50%生命开始，第一发降至25%；第二次焰息启动时才触发晦翼，
// 并结束本次重复序列。不能在第一发刚跨到25%时提前触发。
const c3=buildBattleActor(ctx,{...newBattleBuild(),characterId:1407,level:80,technique:false,relicAuto:false,panel:panel(10000)});c3.energy=0;c3.policy={...c3.policy,autoUltimate:false,basicOnly:true};
const foe3=dummy('foe3','enemy'),foe4=dummy('foe4','enemy');
for(const e of [foe3,foe4]){e.panel=panel(1e9,1000,1);e.hp=1e9;e.distance=100000;}
const b3=createBattle({strict:false,maxAV:500,sp:3,maxSP:9,seed:19,critMode:'noncrit',units:[c3,foe3,foe4]}),owner3=b3.units.find(u=>u.characterId===1407);
b3.rules.before(b3,owner3,'summonDragon','extra',owner3.actions.summonDragon,[owner3]);
const dragon3=b3.units.find(u=>u.memospriteOwner===owner3.id);dragon3.hp=dragon3.panel.hp*.5;
for(const u of b3.units)u.distance=100000;dragon3.distance=0;
const attackStart=b3.log.length;
assert.equal(stepBattle(b3),true,'the dragon gets its scheduled turn');
const breathHits=b3.log.slice(attackStart).filter(e=>e.type==='damage'&&e.actor===dragon3.id&&e.kind==='direct');
const wingHits=b3.log.slice(attackStart).filter(e=>e.type==='damage'&&e.actor===dragon3.id&&e.kind==='additional');
assert.equal(breathHits.length,4,'two breath activations hit both live enemies');
assert.equal(wingHits.length,6,'the 25%-HP activation triggers six real random bounces');
assert.equal(b3.log.slice(attackStart).filter(e=>e.type==='action'&&e.actor===dragon3.id).length,1,'all breaths remain one scheduled servant turn');

const c4=buildBattleActor(ctx,{...newBattleBuild(),characterId:1407,level:80,technique:false,relicAuto:false,panel:panel(10000)});c4.energy=0;c4.policy={...c4.policy,autoUltimate:false,basicOnly:true};
const foe5=dummy('foe5','enemy'),foe6=dummy('foe6','enemy');
for(const e of [foe5,foe6]){e.panel=panel(1,1000,1);e.hp=1;e.distance=100000;}
const b4=createBattle({strict:false,maxAV:500,sp:3,maxSP:9,seed:23,critMode:'noncrit',units:[c4,foe5,foe6]}),owner4=b4.units.find(u=>u.characterId===1407);
b4.rules.before(b4,owner4,'summonDragon','extra',owner4.actions.summonDragon,[owner4]);
const dragon4=b4.units.find(u=>u.memospriteOwner===owner4.id);dragon4.hp=dragon4.panel.hp*.5;
for(const u of b4.units)u.distance=100000;dragon4.distance=0;
stepBattle(b4);
const speedBuff=dragon4.buffs.find(e=>e.id===owner4.id+':dragon-trace-speed');
assert.ok(speedBuff&&speedBuff.value===1,'after the breath kills every enemy, the dragon gains the source-defined +100% speed for one turn');

// Reaching the resource cap queues the resource-type Ultimate immediately, without waiting for Castorice's turn.
const c2=buildBattleActor(ctx,{...newBattleBuild(),characterId:1407,level:80,technique:false,relicAuto:false,panel:panel(10000)});c2.energy=0;c2.policy={...c2.policy,autoUltimate:false,basicOnly:true};
const a2=dummy('a2'),e2=dummy('e2','enemy');e2.panel=panel(1e9,1,1);e2.hp=1e9;
const b2=createBattle({strict:false,maxAV:500,sp:3,maxSP:9,seed:7,critMode:'noncrit',units:[c2,a2,e2]}),owner2=b2.units.find(u=>u.characterId===1407);
owner2.resources['新蕊']=34000-1;
b2.log.push({type:'damage',actor:'e2',target:'a2',hpDamage:1});
b2.rules.hpChanged(b2,b2.units.find(u=>u.id==='a2'),'damage',1,b2.units.find(u=>u.id==='e2'));
assert.ok(b2.queue.some(q=>q.actor===owner2.id&&q.key==='summonDragon'),'reaching Newbud cap should queue the resource-type Ultimate immediately');
stepBattle(b2);
assert.ok(b2.units.some(u=>u.memospriteOwner===owner2.id&&u.active!==false&&u.hp>0),'queued resource-type Ultimate should summon the dragon');
console.log('PASS Castorice sanctuary damage overflow and 500% dragon HP payment');
