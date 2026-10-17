import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createContext} from '../core/ctx.mjs';
import {newBattleBuild,buildBattleActor} from '../simulator/builds.mjs';
import {createBattle,stepBattle} from '../simulator/engine.mjs';
import {BREAK_BASE} from '../simulator/game-data.mjs';
import {partialMechanicsFixture} from './partial-mechanics-fixtures.mjs';

const ctx=createContext(JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url))));
const panel={hp:10000,atk:1000,def:1000,speed:100,critRate:0,critDmg:1,energyRegen:1,effectHit:0,effectRes:0,breakEffect:0,
  baseStats:{hp:1000,atk:1000,def:1000},elemDmg:{},elation:0};
const actor=(id,eidolon=0)=>{
  const u=buildBattleActor(ctx,{...newBattleBuild(),characterId:id,eidolon,relicAuto:false,panel:{...panel}});
  u.policy={...u.policy,autoUltimate:false,basicOnly:true};return u;
};
const enemy={id:'training-target',name:'训练目标',side:'enemy',level:90,element:'Physical',panel:{...panel,hp:1e9,speed:1},hp:1e9,energy:0,energyMax:0,res:{},toughnessMax:1000,
  weaknesses:[],actions:{basic:{name:'不行动',type:'Normal',terms:[],hitEnergy:0}},policy:{autoUltimate:false,basicOnly:true}};
const config=units=>partialMechanicsFixture({strict:false,maxAV:1,sp:3,maxSP:9,seed:9,critMode:'noncrit',units:[...units,structuredClone(enemy)]});
const baseOf=e=>e.formula.find(x=>x.zone==='base')?.value;

function runYaoUltimate(eidolon){
  const team=[actor(1502,eidolon),actor(1501),actor(1505),actor(1513)];
  const b=createBattle(config(team)),yao=b.units.find(u=>u.characterId===1502);
  yao.energy=yao.energyMax;
  for(const u of b.units)u.distance=100000;
  yao.distance=0;yao.policy={...yao.policy,turnPlan:[{turn:yao.turns+1,key:'ultimate'}]};
  assert.equal(stepBattle(b),true,'爻光终结技和随后的阿哈回合应在真实行动中执行');
  const hits=b.log.filter(e=>e.type==='damage'&&e.attackType==='ElationDamage'&&e.frame?.action?.key==='elation'&&e.frame?.action?.kind==='aha');
  return {b,team,hits};
}

const base=runYaoUltimate(3),rank4=runYaoUltimate(4); // E3 holds Elation Skill level constant while isolating E4.
assert.equal(base.hits.length,rank4.hits.length,'E4 不应改变欢愉技段数');
assert.ok(base.hits.length>0,'四人阿哈行动应产生实际欢愉技伤害');
for(const u of base.team){
  const before=base.hits.filter(e=>e.actor===u.id).reduce((n,e)=>n+baseOf(e),0);
  const after=rank4.hits.filter(e=>e.actor===u.id).reduce((n,e)=>n+baseOf(e),0);
  assert.ok(before>0,`${u.name} 应在阿哈回合造成欢愉技伤害`);
  assert.ok(Math.abs(after/before-1.5)<1e-9,`${u.name} E4 阿哈回合倍率应为原伤害的150%，实际 ${after/before}`);
}

function runYaoElationSkill(eidolon){
  const b=createBattle(config([actor(1502,eidolon)])),yao=b.units.find(u=>u.characterId===1502);
  for(const u of b.units)u.distance=100000;
  b.queue.push({actor:yao.id,key:'elation',kind:'extra'});
  stepBattle(b); // The queued skill resolves, then the deliberately distant normal turn exceeds maxAV.
  const hit=b.log.find(e=>e.type==='damage'&&e.actor===yao.id&&e.attackType==='ElationDamage'&&e.frame?.action?.key==='elation'&&e.frame?.action?.kind==='extra');
  assert.ok(hit,'应记录爻光欢愉技伤害');
  return baseOf(hit);
}
const e0=runYaoElationSkill(5),e6=runYaoElationSkill(6); // E5 holds Elation Skill level constant while isolating E6.
assert.ok(Math.abs(e6/e0-2.5)<1e-9,`E6 应把爻光自身欢愉技倍率翻倍并另乘25%增笑，实际倍率 ${e6/e0}`);
console.log('PASS Yaoguang E4 fixed Aha instant multiplies all four real Elation Skills by 150%; E6 doubles her own Elation multiplier');
