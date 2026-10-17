import assert from 'node:assert/strict';
import {actor,dummy} from './codex_test_helpers.mjs';
import {battleFrame,createBattle,stepBattle} from '../simulator/engine.mjs';

const members=[actor(1501),actor(1502),actor(8009)];
for(const [i,u] of members.entries()){
  const speed=[100,120,80][i];u.panel.speed=speed;u.baseSpeed=speed;
}
const enemy=dummy('aha-target','enemy',1000);enemy.hp=1e9;enemy.panel.hp=1e9;enemy.toughnessMax=0;
const b=createBattle({strict:false,maxAV:130,sp:3,maxSP:9,seed:11,critMode:'noncrit',units:[...members,enemy]});
assert.equal(b.laughter.ally,3,'battle entry grants one shared Punchline per Elation ally');
const liveMembers=b.units.slice(0,3);
assert.deepEqual(liveMembers.map(u=>u.resources['好活当赏']),[20,20,20],'battle entry grants 20 Certified Banger independently from shared starting Punchline');
assert.equal(b.aha.speed,118,'Aha SPD uses current top four Elation ally SPD with 1/5, 1/10, 1/20, 1/40 weights');
assert.ok(battleFrame(b).normalOrder.some(e=>e.id==='aha:ally'&&Math.abs(e.wait-10000/118)<1e-9),'Aha is visible in the shared action bar');

b.aha.distance=0;
assert.equal(stepBattle(b),true);
for(const u of liveMembers)assert.equal(b.log.filter(e=>e.type==='action'&&e.actor===u.id&&e.key==='elation'&&e.kind==='aha').length,1,u.name+' acts once during natural Aha Instant');
assert.equal(b.ahaInstant,null,'natural instant closes after the final Elation Skill');
assert.equal(b.laughter.ally,3,'natural instant consumes current shared Punchline and restores one per team Elation member');
for(const u of liveMembers)assert.ok(u.resources['好活当赏']>20,'Aha Instant converts consumed Punchline to personal Certified Banger');

const acrossWaveMembers=[actor(1501),actor(1502),actor(8009)];
const firstWave=dummy('wave-one','enemy',1000);firstWave.hp=1;firstWave.panel.hp=1;firstWave.wave=1;
const secondWave=dummy('wave-two','enemy',1e9);secondWave.hp=1e9;secondWave.panel.hp=1e9;secondWave.wave=2;
const acrossWave=createBattle({strict:false,maxAV:130,sp:3,maxSP:9,seed:21,critMode:'noncrit',units:[...acrossWaveMembers,firstWave,secondWave]});
acrossWave.aha.distance=0;
assert.equal(stepBattle(acrossWave),true);
assert.equal(acrossWave.wave,2,'natural Aha Instant continues into a newly entered wave');
for(const u of acrossWave.units.slice(0,3))assert.equal(acrossWave.log.filter(e=>e.type==='action'&&e.actor===u.id&&e.kind==='aha').length,1,u.name+' acts once across the wave transition');
assert.equal(acrossWave.ahaInstant,null,'cross-wave Aha Instant closes once every queued performer has acted');

const speedBuffed=createBattle({strict:false,maxAV:80,sp:3,maxSP:9,seed:5,critMode:'noncrit',units:[actor(1513),actor(1001),dummy('speed-target','enemy',1e6)]});
const [waveflair,attacker,target]=speedBuffed.units;
speedBuffed.activeAction={sequence:9};
speedBuffed.rules.afterHit(speedBuffed,attacker,target,{spCost:0,type:'Normal'},'direct',{});
assert.equal(battleFrame(speedBuffed).aha.speed,125,'Aha action-bar display uses its current bonus SPD');

const timed= createBattle({strict:false,maxAV:80,sp:3,maxSP:9,seed:4,critMode:'noncrit',units:[actor(1501),dummy('timer-target','enemy',1000)]});
const wearer=timed.units[0];wearer.resources['好活当赏']=15;wearer.buffs=wearer.buffs.filter(e=>e.tag!=='punchline');
wearer.buffs.push(
  {type:'buff',id:'lot-short',name:'短批次',key:'marker',value:0,tag:'punchline',stacks:10,remaining:1,tickOwner:wearer.id,tickAt:'end',appliedTurn:wearer.turns},
  {type:'buff',id:'lot-long',name:'长批次',key:'marker',value:0,tag:'punchline',stacks:5,remaining:2,tickOwner:wearer.id,tickAt:'end',appliedTurn:wearer.turns},
);
wearer.distance=0;timed.aha.distance=10000;
stepBattle(timed);
assert.equal(wearer.resources['好活当赏'],5,'expiration subtracts only the batch whose own timer ended');
assert.ok(wearer.buffs.some(e=>e.id==='lot-long'&&e.remaining===1));
console.log('PASS natural Aha action bar, speed, shared Punchline conversion, and independent Certified Banger timers');
