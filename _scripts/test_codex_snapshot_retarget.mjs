import assert from 'node:assert/strict';
import {actor,dummy,force,ctx} from './codex_test_helpers.mjs';
import {newBattleBuild,buildBattleActor} from '../simulator/builds.mjs';
import {createBattle,combatPanel} from '../simulator/engine.mjs';

const near=(a,b,eps=1e-6)=>assert.ok(Math.abs(a-b)<=eps,`${a} != ${b}`);
const enemy=(id,hp=1e9)=>{const e=dummy(id,'enemy');e.hp=hp;e.panel.hp=1e9;e.panel.def=0;e.panel.speed=1;e.res={};return e;};
const config=units=>({strict:true,maxAV:300,sp:3,maxSP:9,seed:7,critMode:'noncrit',units});
const panel={hp:10000,atk:1000,def:1000,speed:100,critRate:0,critDmg:1,energyRegen:1,effectHit:0,effectRes:0,breakEffect:0,baseStats:{hp:1000,atk:1000,def:1000},elemDmg:{}};
const actorRank=(id,eidolon=0)=>{const u=buildBattleActor(ctx,{...newBattleBuild(),characterId:id,eidolon,relicAuto:false,panel:structuredClone(panel)});u.energy=0;u.policy={...u.policy,autoUltimate:false,basicOnly:true};return u;};

function natashaScenario(eidolon=0){
  const n=actorRank(1105,eidolon),t=dummy('recipient');n.policy.allyTargetId=t.id;
  const b=createBattle(config([n,t,enemy('foe')]));return {b,n:b.units[0],t:b.units[1]};
}

// 4.6 MAvatar_Natasha_00_HOT_HPByMaxHP and Rank02_HOT_HPByMaxHP both set
// UseSnapshotEntity=true. The recipient's low-HP bonus is still checked at tick time.
{
  const {b,n,t}=natashaScenario();t.hp=100;const hpAtApply=combatPanel(n).hp;
  force(b,n,'skill');const hot=t.buffs.find(e=>e.regen);assert.ok(hot);
  assert.equal(hot.regen.snapshotHp,hpAtApply,'skill HoT must snapshot Natasha HP at application');
  n.panel.hp*=2;const before=t.hp,low=before/combatPanel(t).hp<=n.kit.params.Talent[0];force(b,t,'basic');
  const tick=b.log.filter(e=>e.type==='heal'&&e.actor===n.id&&e.target===t.id).at(-1);
  near(tick.amount,(hpAtApply*hot.regen.multiplier+hot.regen.flat)*(1+(low?n.kit.params.Talent[1]:0)+(n.kit.trace[2]?.[0]??0)));
  assert.ok(t.hp>before);
}

{
  const {b,n,t}=natashaScenario(2);t.hp=100;n.energy=n.energyMax;
  const hpAtApply=combatPanel(n).hp;force(b,n,'ultimate');
  const hot=t.buffs.find(e=>e.regen&&e.name.includes('E2'));assert.ok(hot);
  assert.equal(hot.regen.snapshotHp,hpAtApply,'E2 HoT must snapshot Natasha HP at application');
  n.panel.hp*=2;const before=t.hp,low=before/combatPanel(t).hp<=n.kit.params.Talent[0];force(b,t,'basic');
  const tick=b.log.filter(e=>e.type==='heal'&&e.actor===n.id&&e.target===t.id).at(-1);
  near(tick.amount,(hpAtApply*hot.regen.multiplier+hot.regen.flat)*(1+(low?n.kit.params.Talent[1]:0)+(n.kit.trace[2]?.[0]??0)));
  assert.ok(t.hp>before);
}

// Raw Benediction callback is Retarget(AttackTargetList, ByRandom, MaxNumber=1).
{
  const ty=actor(1202),carry=dummy('carry');ty.policy.allyTargetId=carry.id;
  const e1=enemy('first'),e2=enemy('second');
  const b=createBattle(config([ty,carry,e1,e2]));force(b,b.units[0],'skill');
  const c=b.units[1];c.actions.basic={...c.actions.basic,target:'all',terms:[{scaling:'atk',multiplier:.01}],toughness:0};
  b.random=()=>.999;force(b,c,'basic');
  const bonus=b.log.filter(e=>e.type==='damage'&&e.kind==='additional'&&e.actor===c.id);
  assert.equal(bonus.length,1,'one Benediction extra hit per attack');
  assert.equal(bonus[0].target,'second','random retarget must not be hard-coded to the first hit target');
}

// The field callback re-resolves its highest-current-HP marked target in each
// LoopExecuteTaskList iteration; E1 then resolves the living highest-HP alias.
{
  const make=()=>{
    const tr=actorRank(1403,1),carry=dummy('carry');tr.energy=tr.energyMax;
    const es=[enemy('A'),enemy('B'),enemy('C')];
    carry.actions.basic={...carry.actions.basic,target:'all',terms:[{scaling:'atk',multiplier:.001}],toughness:0};
    const b=createBattle(config([tr,carry,...es]));force(b,b.units[0],'ultimate');
    for(const e of b.units.filter(x=>x.side==='enemy'))e.panel.def=0;
    return {b,tr:b.units[0],carry:b.units[1],es:b.units.slice(2)};
  };
  const calibration=make();force(calibration.b,calibration.carry,'basic');
  const pulse=calibration.b.log.find(e=>e.type==='damage'&&e.actor===calibration.tr.id&&e.kind==='additional');
  assert.ok(pulse&&pulse.damage>0);
  const {b,tr,carry,es}=make(),d=pulse.damage;
  [6,5.5,3].forEach((m,i)=>{es[i].hp=d*m;});
  b.random=()=>0;force(b,carry,'basic');
  const pulses=b.log.filter(e=>e.type==='damage'&&e.actor===tr.id&&e.kind==='additional'&&e.frame?.action?.actor===carry.id);
  assert.equal(pulses.length,3);
  assert.deepEqual(pulses.map(e=>e.target),['A','B','A'],'each pulse should re-rank the current HP of attacked living targets');
  const e1=b.log.find(e=>e.type==='damage'&&e.kind==='true'&&e.actor===tr.id&&e.frame?.action?.actor===carry.id);
  assert.ok(e1);assert.equal(e1.target,'B','E1 true damage should follow the living highest-HP alias after field hits');
}

console.log('Codex snapshot / retarget mechanics: 5 regressions passed');
