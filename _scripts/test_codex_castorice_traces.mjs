import assert from 'node:assert/strict';
import {ctx,dummy} from './codex_test_helpers.mjs';
import {newBattleBuild,buildBattleActor} from '../simulator/builds.mjs';
import {createBattle,combatPanel,stepBattle} from '../simulator/engine.mjs';

const mkPanel=(hp,atk=1000,speed=100)=>({hp,atk,def:1000,speed,baseStats:{hp,atk,def:1000},critRate:0,critDmg:1,energyRegen:1,effectHit:0,effectRes:0,breakEffect:0,elemDmg:{}});
const castorice=buildBattleActor(ctx,{...newBattleBuild(),characterId:1407,level:80,eidolon:0,technique:false,relicAuto:false,panel:mkPanel(10000)});
castorice.energy=0;castorice.policy={...castorice.policy,autoUltimate:false,basicOnly:true};
const mate=dummy('mate');mate.panel=mkPanel(10000);mate.hp=5000;
const healer=dummy('healer');healer.panel=mkPanel(10000);healer.hp=5000;
healer.actions.basic.effects=[{type:'heal',target:'lowestAlly',multiplier:0,flat:10000}];
const foe=dummy('foe','enemy');foe.panel=mkPanel(1e9,1);foe.hp=1e9;foe.toughnessMax=0;foe.toughness=0;
const b=createBattle({strict:false,maxAV:500,sp:3,maxSP:9,seed:12,critMode:'noncrit',units:[castorice,mate,healer,foe]});
const actor=b.units.find(x=>x.characterId===1407);
const inBattleHealer=b.units.find(x=>x.id==='healer');

assert.equal(actor.kit.trace[1][0],1);
const highHpSpeed=combatPanel(actor).speed;
actor.hp=4999;
const lowHpSpeed=combatPanel(actor).speed;
assert.equal(highHpSpeed-lowHpSpeed,(actor.baseSpeed??actor.panel.speed)*0.4,'HP >= 50% should grant 40% base speed');

const converted=()=>actor.resources['新蕊']??0;
const initial=converted();
function act(battle,u,key){battle.units.forEach(t=>t.distance=10000);u.distance=0;u.policy={...u.policy,turnPlan:[{turn:u.turns+1,key}]};stepBattle(battle);}
act(b,inBattleHealer,'basic');
assert.equal(converted(),initial+34000*0.12,'healing should convert at most 12% of Newbud cap per target');
assert.equal(actor.resources['新蕊'],initial+4080,'recipient-specific cap is enforced');
// The next action resets the per-recipient cap, so a later heal can convert again.
mate.hp=1000;inBattleHealer.hp=1000;act(b,inBattleHealer,'basic');
assert.equal(actor.resources['新蕊'],initial+8160,'healing conversion cap resets after each action');

// Trace 1407102: a breath that defeats every living enemy grants the dragon +100% speed for one turn.
const c2=buildBattleActor(ctx,{...newBattleBuild(),characterId:1407,level:80,technique:true,relicAuto:false,panel:mkPanel(10000)});
c2.energy=0;c2.policy={...c2.policy,autoUltimate:false,basicOnly:true};
const foe2=dummy('foe2','enemy');foe2.panel=mkPanel(1,1,1);foe2.hp=1;foe2.toughnessMax=0;foe2.toughness=0;
const b2=createBattle({strict:false,maxAV:500,sp:3,maxSP:9,seed:1,critMode:'noncrit',units:[c2,dummy('mate2'),foe2]});
const dragon2=b2.units.find(x=>x.memospriteOwner===b2.units.find(t=>t.characterId===1407).id);
b2.units.forEach(t=>t.distance=10000);dragon2.distance=0;
stepBattle(b2);
assert.ok(dragon2.buffs.some(e=>e.id===c2.id+':dragon-trace-speed'&&e.value===1),'dragon gets +100% speed after the lethal/all-enemies-dead breath');

// The 4.6 PointB1_HealTaxes target list explicitly excludes Castorice's own servant.
const c3=buildBattleActor(ctx,{...newBattleBuild(),characterId:1407,level:80,eidolon:0,technique:true,relicAuto:false,panel:mkPanel(10000)});
c3.energy=0;c3.policy={...c3.policy,autoUltimate:false,basicOnly:true};
const healer3=dummy('healer3');healer3.panel=mkPanel(10000);healer3.actions.basic.effects=[{type:'heal',target:'lowestAlly',value:10000}];
const mate3=dummy('mate3');mate3.panel=mkPanel(10000);
const foe3=dummy('foe3','enemy');foe3.panel=mkPanel(1e9,1);foe3.hp=1e9;
const b3=createBattle({strict:false,maxAV:500,sp:3,maxSP:9,seed:13,critMode:'noncrit',units:[c3,mate3,healer3,foe3]});
const owner3=b3.units.find(x=>x.characterId===1407),dragon3=b3.units.find(x=>x.memospriteOwner===owner3.id),healerUnit3=b3.units.find(x=>x.id==='healer3');
for(const ally of b3.units.filter(x=>x.side==='ally'))if(ally!==dragon3)ally.hp=combatPanel(ally).hp;
dragon3.hp=1;const newbudBefore=b3.units.find(x=>x.id===owner3.id).resources['新蕊']??0;
act(b3,healerUnit3,'basic');
assert.ok(dragon3.hp>1,'the real healing action should heal Castorice’s servant');
assert.equal(owner3.resources['新蕊']??0,newbudBefore,'healing Castorice’s own servant is excluded from Newbud conversion by the raw PointB1 target list');

// The cap branches follow the game's Equilibrium-level formula: EQ1-4 use 5.3125×highest-level² (min 2000); EQ5-6 use 34000.
for(const [worldLevel,level,expected] of [[4,60,5.3125*60*60],[5,60,34000]]){
  const low=buildBattleActor(ctx,{...newBattleBuild(),characterId:1407,level,technique:false,relicAuto:false,panel:mkPanel(10000)});low.energy=0;low.policy={...low.policy,autoUltimate:false,basicOnly:true};
  const lowMate=dummy('low-mate');lowMate.level=level;
  const lowFoe=dummy('low-foe','enemy');
  const lowBattle=createBattle({strict:false,worldLevel,maxAV:100,sp:3,maxSP:9,seed:4,critMode:'noncrit',units:[low,lowMate,lowFoe]});
  const lowOwner=lowBattle.units.find(x=>x.characterId===1407);lowOwner.resources['新蕊']=50000;
  lowBattle.log.push({type:'damage',target:'low-mate',hpDamage:1});
  lowBattle.rules.hpChanged(lowBattle,lowBattle.units.find(x=>x.id==='low-mate'),'damage',1,lowBattle.units.find(x=>x.id==='low-foe'));
  assert.equal(lowOwner.resources['新蕊'],expected,`EQ${worldLevel} cap formula`);
}
console.log('PASS Castorice trace speed and healing conversion');
