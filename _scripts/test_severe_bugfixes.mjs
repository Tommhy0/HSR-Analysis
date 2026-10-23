import assert from 'node:assert/strict';
import {actor,dummy,ctx,force} from './codex_test_helpers.mjs';
import {buildBattleActor,newBattleBuild} from '../simulator/builds.mjs';
import {createBattle,combatPanel,battleFrame,simulateBattle,stepBattle} from '../simulator/engine.mjs';
import {battleStatistics} from '../simulator/stats.mjs';
import {replayAt} from '../simulator/replay.mjs';
import {BREAK_BASE} from '../simulator/game-data.mjs';
import {listAbilities,toHitAbility} from '../core/abilities.mjs';
import {computeHit} from '../core/damage.mjs';
import {extractDamage} from './extract_buffs.mjs';

const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const config=(units,maxAV=300)=>({strict:false,maxAV,sp:3,maxSP:9,seed:42,critMode:'noncrit',units});
const enemy=()=>{const e=dummy('enemy','enemy');e.panel={...e.panel,hp:1e9,def:0};e.hp=1e9;return e;};
const mk=(id,eidolon=0)=>{const a=buildBattleActor(ctx,{...newBattleBuild(),characterId:id,eidolon,relicAuto:false,panel:dummy('panel').panel});a.energy=0;a.policy={...a.policy,autoUltimate:false,basicOnly:true};return a;};
let passed=0;
const test=(name,fn)=>{fn();passed++;console.log('PASS',name);};

test('RMC + team relic aura: no panel recursion and the crit damage conversion remains active',()=>{
  const b=createBattle(config([actor(8007),dummy('mate'),enemy()]));
  const [u,m]=b.units;force(b,u,'skill');
  const mem=b.units.find(t=>t.memospriteOwner===u.id);assert.ok(mem);
  u.gear={sets:[{id:319,count:2,p2:[0,0,.2]}]};
  m.gear={sets:[{id:310,count:2,p2:[0,0,.1]}]};
  const out=combatPanel(u),raw=combatPanel(u,{excludeConverted:true});
  assert.ok(Number.isFinite(out.critDmg));assert.ok(out.critDmg>raw.critDmg);
  const without=combatPanel(u,{skipAuras:true});assert.ok(out.critDmg>without.critDmg);
});

test('Aglaea + team relic aura: speed-to-ATK conversion remains finite and numerically correct',()=>{
  const b=createBattle(config([actor(1402),dummy('mate'),enemy()]));const [u,m]=b.units;
  u.energy=u.energyMax;force(b,u,'ultimate','ultimate');
  m.gear={sets:[{id:310,count:2,p2:[0,0,.1]}]};
  const mem=b.units.find(t=>t.memospriteOwner===u.id);assert.ok(mem);
  u.gear={sets:[{id:320,count:2,p2:[0,0,200,.1,.2]}]};
  const out=combatPanel(u),raw=combatPanel(u,{excludeConverted:true}),t=u.kit.trace[1];
  near(out.atk-raw.atk,out.speed*t[0]/100+combatPanel(mem).speed*t[1]/100);
});

test('Phainon: full energy during transformation cannot start overlapping countdowns or consume energy',()=>{
  const b=createBattle(config([actor(1408),dummy('mate'),enemy()]));const [u]=b.units;
  u.energy=u.energyMax;force(b,u,'ultimate','ultimate');
  assert.ok(u.buffs.some(e=>e.tag==='phainonKhaos'&&e.noUltimate));
  const cycle=u.resources['永续行动循环'];u.energy=u.energyMax;u.policy.autoUltimate=true;
  assert.ok(!battleFrame(b).readyUltimates.some(e=>e.actor===u.id));
  b.queue.push({actor:u.id,key:'ultimate',kind:'ultimate'});stepBattle(b);
  assert.equal(u.resources['永续行动循环'],cycle);near(u.energy,u.energyMax);
  assert.equal(b.log.filter(e=>e.type==='action'&&e.actor===u.id&&e.key==='ultimate').length,1);
  u.policy.autoUltimate=false;
  b.queue.push({actor:u.id,key:'ultimate',kind:'ultimate',planIndex:0});
  assert.throws(()=>stepBattle(b),/当前状态禁止施放终结技/,'an invalid replay plan must fail explicitly instead of being requeued forever');
  for(let i=0;i<50&&u.buffs.some(e=>e.tag==='phainonKhaos');i++)stepBattle(b);
  assert.ok(!u.buffs.some(e=>e.tag==='phainonKhaos'));
  assert.ok(b.log.some(e=>e.type==='damage'&&e.formula&&e.damage>0&&e.actor===u.id));
  assert.ok(b.log.filter(e=>e.type==='damage').every(e=>Number.isFinite(e.damage)&&e.damage>=0));
});

test('Dynamic servants: engine total and per-owner statistics include all enemy damage; old replays retain ownership',()=>{
  const u=actor(8007);u.policy.basicOnly=false;
  const r=simulateBattle(config([u,enemy()],250));
  const servants=r.actors.filter(a=>a.memospriteOwner===u.id);assert.ok(servants.length);
  const servantIds=new Set(servants.map(a=>a.id));
  assert.ok(r.log.some(e=>e.type==='damage'&&servantIds.has(e.actor)&&e.damage>0));
  const expected=r.log.filter(e=>e.type==='damage'&&e.target==='enemy').reduce((n,e)=>n+e.damage,0);
  near(r.damage,expected);near(battleStatistics(r)[0].damage,expected);
  const legacy={...r};delete legacy.actors;near(battleStatistics(legacy)[0].damage,expected);
  for(const replay of [r,legacy]){
    const start=replayAt(replay,0),end=replayAt(replay,replay.log.length-1);
    near(start.totals.ally,0);near(start.totals.enemy,0);
    near(end.totals.ally,expected);near(end.contributions[0].damage,expected);
    const enemyDamage=r.log.filter(e=>e.type==='damage'&&e.actor==='enemy').reduce((n,e)=>n+e.damage,0);
    near(end.totals.enemy,enemyDamage);
  }
});

test('Superbreak: final damage includes efficiency and HMC trace, without applying HMC trace to another source',()=>{
  for(const id of [8005,8006]){
    const b=createBattle(config([actor(id),dummy('mate'),enemy()]));const [h,m,e]=b.units;
    e.broken=true;m.panel.breakEffect=.3;
    b.rules.after(b,h,'ultimate','ultimate',h.actions.ultimate,[h],[]);
    const be=combatPanel(m).breakEffect,base=BREAK_BASE[m.level]*(1+be);
    b.breaks.superBreak(b,m,e,30);near(b.log.at(-1).damage,base);
    const hit=()=>b.rules.afterHit(b,m,e,{...m.actions.basic,toughness:30,hitShares:[1],segment:1},'direct');
    hit();near(b.log.at(-1).damage,base*(1+h.kit.trace[1][4]));
    m.buffs.push({id:'eff',key:'breakEfficiency',value:.5});
    hit();near(b.log.at(-1).damage,base*1.5*(1+h.kit.trace[1][4]));
    m.buffs.push({id:'generic-dmg',key:'dmgBoost',value:10});
    hit();near(b.log.at(-1).damage,base*1.5*(1+h.kit.trace[1][4]));
  }
});

test('Fugue E4: explicit break damage bonus reaches the final number, including break DoT',()=>{
  const b=createBattle(config([mk(1225,4),dummy('mate'),enemy()]));const [f,m,e]=b.units;e.broken=true;
  b.rules.before(b,f,'skill','normal',f.actions.skill,[m]);
  for(const kind of ['break','break_dot','break_additional','superbreak']){
    b.breaks.damage(b,m,e,10000,'Physical',false,kind);
    near(b.log.filter(e=>e.type==='damage').at(-1).damage,10000*(1+f.kit.ranks[4][0]));
  }
  const c=createBattle(config([mk(1225,4),actor(8006),dummy('mate'),enemy()]));const [fu,hmc,mate,foe]=c.units;foe.broken=true;
  c.rules.before(c,fu,'skill','normal',fu.actions.skill,[mate]);
  c.rules.after(c,hmc,'ultimate','ultimate',hmc.actions.ultimate,[hmc],[]);
  c.rules.afterHit(c,mate,foe,{...mate.actions.basic,toughness:30,hitShares:[1],segment:1},'direct');
  const mp=combatPanel(mate),want=BREAK_BASE[80]*(1+mp.breakEffect)*(1+(mp.breakEfficiency??0))*(1+hmc.kit.trace[1][4])*(1+fu.kit.ranks[4][0]);
  near(c.log.filter(e=>e.type==='damage').at(-1).damage,want);
});

test('Firefly + Fugue: deferred superbreak retains the temporary efficiency of the triggering attack',()=>{
  const ff=actor(1310);ff.panel.breakEffect=4;
  const b=createBattle(config([ff,actor(1225),enemy()]));const [u,f,e]=b.units;e.broken=true;
  u.buffs.push({id:'burn-probe',tag:'samBurn',key:'marker',value:0});
  const be=combatPanel(u).breakEffect,raw=u.actions.enhancedBasic.toughness;
  force(b,u,'basic');
  const sb=b.log.filter(x=>x.type==='damage'&&x.actor===u.id&&x.kind==='superbreak');
  const base=sb.reduce((n,x)=>n+x.formula.find(z=>z.zone==='base').value,0);
  near(base,BREAK_BASE[80]*raw/30*(1+be)*(1+u.kit.params.Ultra[1])*(u.kit.trace[2][3]+f.kit.params.Talent[0]));
  assert.ok(!u.buffs.some(x=>x.key==='breakEfficiency'),'temporary efficiency must still expire');
});

test('Ruan Mei: instantaneous break add-ons ignore Sampo DoT vulnerability; genuine break DoT still receives it',()=>{
  const b=createBattle(config([actor(1303),actor(1108),dummy('mate'),enemy()]));const [r,s,m,e]=b.units;e.broken=true;
  const talent=()=>{b.rules.afterDamage(b,m,e,'break');return b.log.filter(x=>x.type==='damage'&&x.actor===r.id).at(-1);};
  const baseline=talent();assert.equal(baseline.kind,'break_additional');
  b.rules.before(b,s,'ultimate','ultimate',s.actions.ultimate,[e]);
  const enhanced=talent();near(enhanced.damage,baseline.damage);
  b.breaks.damage(b,m,e,10000,'Fire',false,'break_dot');
  near(b.log.filter(x=>x.type==='damage').at(-1).damage,10000*(1+s.kit.params.Ultra[1]));
});

test('Harmony Trailblazer: both genders remove exactly 120 toughness with E0 first skill',()=>{
  const amounts=[];
  for(const id of [8005,8006]){
    const en=enemy();en.toughnessMax=10000;en.toughness=10000;en.weaknesses=['Imaginary'];en.standardBreak=true;en.rank='elite';
    const b=createBattle(config([actor(id),en]));const [u,e]=b.units;
    near(u.actions.skill.bounceToughness,15);force(b,u,'skill');
    amounts.push(e.toughnessMax-e.toughness);near(amounts.at(-1),120);
  }
  near(amounts[0],amounts[1]);
});

test('Sampo ultimate: the built single-hit calculator retains direct damage before the DoT vulnerability clause',()=>{
  const a=listAbilities(ctx,1108,{baked:ctx.data.abilities}).find(a=>String(a.skillId??a.id)==='110803');
  assert.ok(a,'missing built Sampo ultimate');assert.ok(a.terms.some(t=>t.timing==='direct'));
  const hit=computeHit({panel:{...dummy('p', 'ally').panel,critRate:0},ability:toHitAbility(a),agg:{},enemy:{def:0,res:{}},state:{broken:true},options:{critMode:'noncrit'},attackerLevel:80});
  assert.ok(hit.ok,hit.error);near(hit.total,1600);
  const delayed=extractDamage('每回合开始时，受到等同于桑博#1[i]%攻击力的风属性持续伤害。');
  assert.ok(delayed.terms.length&&delayed.terms.every(t=>t.timing==='delayed'));
});

console.log(`Severe bug regression checks: ${passed} passed`);
