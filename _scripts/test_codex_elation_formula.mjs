import assert from 'node:assert/strict';
import {dummy,force} from './codex_test_helpers.mjs';
import {createBattle} from '../simulator/engine.mjs';
import {BREAK_BASE} from '../simulator/game-data.mjs';

function run({atk=1000,elation=0,punch=0,laughter=0,extraDmg=0,elem=0,source}={}){
  const ally=dummy('probe');ally.path='欢愉';ally.panel.atk=atk;ally.panel.baseStats.atk=atk;ally.panel.elation=elation;
  ally.resources??={};ally.buffs??=[];ally.resources['好活当赏']=punch;ally.policy={...ally.policy,turnPlan:[{turn:1,key:'basic'}]};
  ally.actions.basic={name:'formula probe',type:'ElationDamage',...(source?{punchlineSource:source}:{}),element:'Fire',target:'single',terms:[{scaling:'atk',multiplier:.2}],toughness:0,spCost:0,spGain:0,energyGain:0};
  if(extraDmg)ally.buffs.push({id:'ordinary-dmg',key:'dmgBoost',value:extraDmg,source:ally.id});
  ally.panel.elemDmg.Fire=elem;
  const foe=dummy('foe','enemy',1000);foe.panel.def=0;foe.res={Fire:0};foe.broken=true;foe.hp=1e9;
  const b=createBattle({strict:false,maxAV:20,sp:3,maxSP:9,critMode:'noncrit',units:[ally,foe]});
  b.laughter.ally=laughter;
  const a=b.units.find(x=>x.id==='probe'),e=b.units.find(x=>x.id==='foe');a.resources['好活当赏']=punch;e.broken=true;
  force(b,a,'basic');
  const hit=b.log.find(x=>x.type==='damage'&&x.actor==='probe');if(!hit)throw new Error(JSON.stringify(b.log.map(x=>[x.type,x.actor,x.name,x.kind])));return hit.damage;
}

const baseline=run();
assert.ok(Math.abs(baseline-(BREAK_BASE[80]*2*.2))<1e-6,`Lv80 base anchor on a broken target: ${baseline}`);
assert.equal(run({atk:5000,extraDmg:4,elem:3}),baseline,'Elation DMG must ignore ATK, elemental DMG%, and ordinary DMG%');
assert.ok(Math.abs(run({elation:.5,punch:20})/baseline-(1.5*(1+5*20/260)))<1e-10,'Elation% and Certified Banger factor must multiply independently');
assert.ok(Math.abs(run({punch:20,laughter:100})/baseline-(1+5*20/260))<1e-10,'Elation damage outside Aha must use the attacker’s Certified Banger, not team Punchline');
assert.ok(Math.abs(run({source:'laughter',punch:20,laughter:100})/baseline-(1+5*100/340))<1e-10,'Aha-skill Elation DMG must use the current shared Punchline value');
console.log('PASS shared Elation formula: level base, Elation, attacker Banger vs team Punchline, and excluded ordinary multipliers');
