import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createContext} from '../core/ctx.mjs';
import {newBattleBuild,buildBattleActor} from '../simulator/builds.mjs';
import {createBattle,stepBattle} from '../simulator/engine.mjs';

const raw=JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url)));
const ctx=createContext(raw);
const panel=(atk=1000,speed=100)=>({hp:10000,atk,def:1000,speed,critRate:0,critDmg:1,energyRegen:1,effectHit:0,effectRes:0,breakEffect:0,baseStats:{hp:1000,atk,def:1000},elemDmg:{}});
const actor=(id,eidolon=0)=>{const u=buildBattleActor(ctx,{...newBattleBuild(),characterId:id,eidolon,relicAuto:false,panel:panel()});u.energy=0;u.policy={...u.policy,autoUltimate:false,basicOnly:true};return u;};
const mate={id:'mate',name:'mate',side:'ally',level:80,element:'Physical',panel:panel(1000,1),energy:0,energyMax:100,res:{},actions:{basic:{name:'probe',type:'Normal',element:'Physical',terms:[{scaling:'atk',multiplier:.01}],hitEnergy:10,spGain:0,energyGain:0,toughness:0}},policy:{autoUltimate:false,basicOnly:true}};
const enemy={id:'target',name:'target',side:'enemy',level:90,element:'Physical',panel:panel(1000,1),hp:1e9,energy:0,energyMax:0,res:{},actions:{basic:{name:'wait',type:'Normal',terms:[],hitEnergy:0,spGain:0,energyGain:0,toughness:0}},policy:{autoUltimate:false,basicOnly:true}};
const config=units=>({strict:true,maxAV:500,sp:3,maxSP:9,seed:11,critMode:'noncrit',units});
const baseOf=e=>e.formula.find(x=>x.zone==='base').value;
function tick(b,target,u){for(const x of b.units)x.distance=100000;target.distance=0;stepBattle(b);return b.log.filter(e=>e.type==='damage'&&e.kind==='dot'&&e.actor===u.id);}

// Luka 1111: Avatar_Luka_DOT_Tear.UseSnapshotEntity=true and MDF_CasterAttack
// explicitly reads SnapshotPropertyEntity.Attack.
{
  const u=actor(1111),b=createBattle(config([u,enemy]));b.random=()=>0;const src=b.units[0],to=b.units[1];
  b.rules.after(b,src,'skill','normal',src.actions.skill,[to],[to]);
  const dot=to.dots.find(e=>e.bleed),snap=dot.snapshotAtk;
  assert.equal(snap,1000);src.panel.atk=2000;
  const ev=tick(b,to,src)[0];
  assert.ok(ev);assert.ok(Math.abs(baseOf(ev)-snap*dot.terms[0].multiplier)<1e-6,'Luka bleed must use application-time attack');
}

// Hysilens 1410: all four talent DOT modifiers declare UseSnapshotEntity=true.
{
  const u=actor(1410,1),b=createBattle(config([u,mate,enemy]));b.random=()=>0;const src=b.units[0],ally=b.units[1],to=b.units[2];
  for(let i=0;i<4;i++)b.rules.after(b,ally,'basic','normal',ally.actions.basic,[to],[to]);
  const dots=to.dots.filter(e=>e.hysTalent&&e.terms?.some(t=>t.scaling==='atk'));
  assert.equal(dots.length,6,'three attack-scaled statuses plus their E1 duplicate must be present');
  assert.ok(dots.some(e=>e.element==='Wind'&&e.id.includes(':hys-e1:')),'E1 duplicate must preserve its own application snapshot');
  for(const d of dots)assert.equal(d.snapshotAtk,1000);
  src.panel.atk=2000;
  const ticks=tick(b,to,src).filter(e=>['Wind','Fire','Thunder'].includes(e.element));
  assert.equal(ticks.length,dots.length);
  for(const e of ticks)assert.ok(Math.abs(baseOf(e)-250)<1e-6,`${e.element} DoT must use application-time attack`);
}

console.log('Codex DoT source-attack snapshots: 5 source-backed regression cases passed');
