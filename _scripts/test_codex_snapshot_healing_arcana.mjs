import assert from 'node:assert/strict';
import {actor,dummy} from './codex_test_helpers.mjs';
import {createBattle,stepBattle,combatPanel} from '../simulator/engine.mjs';

const panel={hp:10000,atk:1000,def:1000,speed:100,critRate:0,critDmg:1,energyRegen:1,effectHit:0,effectRes:0,breakEffect:0,baseStats:{hp:1000,atk:1000,def:1000},elemDmg:{}};
const foe=(id='foe')=>{const e=dummy(id,'enemy');e.panel={...structuredClone(panel),hp:1e9,def:0,speed:1};e.hp=1e9;e.res={};return e;};
const cfg=units=>({strict:true,maxAV:500,sp:3,maxSP:9,seed:13,critMode:'noncrit',units});
function lynxCase(route){
  const lynx=actor(1110),to=dummy('recipient');lynx.panel=structuredClone(panel);
  if(route==='technique')lynx.kit.technique=true;
  const b=createBattle(cfg([lynx,to,foe()])),u=b.units[0],t=b.units[1];
  if(route==='skill')b.rules.after(b,u,'skill','normal',u.actions.skill,[t],[]);
  if(route==='ultimate')b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[t],[]);
  const effect=t.buffs.find(x=>x.tag==='lynxRegen'),regen=effect?.regen;
  assert.ok(regen);assert.equal(regen.snapshotHp,10000,route+' should snapshot healer max HP');
  u.panel.hp=20000;t.hp=100;
  b.rules.onTurnStart(b,t);
  return {b,u,t,effect,regen,heal:b.log.filter(x=>x.type==='heal'&&x.actor===u.id&&x.target===t.id).at(-1)};
}

for(const route of ['technique','skill','ultimate']){
  const {u,effect,regen,heal}=lynxCase(route),expected=regen.snapshotHp*regen.multiplier+regen.flat;
  const bonus=route==='skill'?regen.snapshotHp*effect.survivalBonus+effect.survivalFlat:0;
  assert.ok(heal);assert.ok(Math.abs(heal.amount-(expected+bonus))<1e-6,route+' HoT tick must use application-time healer HP');
}

// Black Swan's MAvatar_BlackSwan_00_DOT sets UseSnapshotEntity=true. Reapplying
// Arcana refreshes the DoT snapshot, and the next real enemy turn uses that new value.
{
  const tick=(atTickAtk)=>{
    const swan=actor(1307),enemy=foe();swan.panel=structuredClone(panel);
    const b=createBattle(cfg([swan,enemy]));b.random=()=>0;const u=b.units[0],to=b.units[1];
    b.rules.after(b,u,'basic','normal',u.actions.basic,[to],[to]);
    assert.equal(to.dots.find(x=>x.arcana).snapshotAtk,1000,'first Arcana application snapshots ATK');
    u.panel.atk=2000;
    b.rules.after(b,u,'basic','normal',u.actions.basic,[to],[to]);
    const d=to.dots.find(x=>x.arcana);assert.equal(d.snapshotAtk,2000,'stacking application refreshes Arcana snapshot');
    u.panel.atk=atTickAtk;for(const x of b.units)x.distance=100000;to.distance=0;stepBattle(b);
    const hit=b.log.find(e=>e.type==='damage'&&e.actor===u.id&&e.kind==='dot');
    assert.ok(hit);return hit.formula.find(x=>x.zone==='base').value;
  };
  assert.equal(tick(3000),tick(2000),'Arcana uses refreshed application-time ATK when it ticks');
}

void combatPanel;
console.log('Codex healer/Arcana snapshot mechanics: 5 source-backed regression cases passed');
