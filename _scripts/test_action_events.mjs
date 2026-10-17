import assert from 'node:assert/strict';
import {dummy} from './codex_test_helpers.mjs';
import {createBattle,stepBattle,battleFrame,scheduleActionEvents,cancelActionEvents,updateActionEventSpeed,advance} from '../simulator/engine.mjs';
const near=(x,y)=>assert.ok(Math.abs(x-y)<1e-7,`${x} != ${y}`);
const make=(extra={})=>{const a=dummy('a'),e=dummy('e','enemy');a.panel.speed=100;e.panel.speed=20;e.panel.hp=1e9;return createBattle({strict:true,maxAV:1000,sp:3,units:[a,e],...extra});};
const specs=[{id:'ev1',name:'第一额外行动',key:'basic',speed:100,distance:2000},{id:'ev2',name:'第二额外行动',key:'basic',speed:100,distance:4000}];
let count=0;const test=(name,fn)=>{fn();count++;console.log('PASS',name);};
test('two independent events hold normal gauge and do not count normal turns',()=>{
 const b=make(),u=b.units[0];scheduleActionEvents(b,u.id,specs);
 const f=battleFrame(b);assert.equal(f.units[0].normalGaugeSuspended,true);assert.deepEqual(f.normalOrder.map(x=>x.id),['ev1','ev2','e']);assert.equal(f.actionEvents[0].name,'第一额外行动');
 stepBattle(b);near(b.av,20);near(u.distance,10000);assert.equal(u.turns,0);assert.equal(b.turns,0);
 stepBattle(b);near(b.av,40);near(u.distance,10000);assert.equal(b.turns,0);
 assert.deepEqual(b.log.filter(x=>x.type==='action').map(x=>x.kind),['extra','extra']);
 stepBattle(b);near(b.av,140);assert.equal(u.turns,1);assert.equal(b.turns,1);
});
test('extra actions do not tick owner buffs or damage over time',()=>{
 const b=make(),u=b.units[0];u.buffs.push({id:'probe',source:u.id,key:'atkPct',value:0.1,remaining:2,tickOwner:u.id,tickAt:'end'});
 u.dots.push({id:'dot',source:'e',name:'probe DoT',element:'Physical',value:100,remaining:2,tickOwner:u.id,tickAt:'start'});
 scheduleActionEvents(b,u.id,specs);const hp=u.hp;stepBattle(b);stepBattle(b);
 assert.equal(u.hp,hp);assert.equal(u.buffs[0].remaining,2);assert.equal(u.dots[0].remaining,2);
 stepBattle(b);assert.ok(u.hp<hp);assert.equal(u.buffs[0].remaining,1);
});
test('opt out leaves normal progress running',()=>{const b=make();scheduleActionEvents(b,'a',specs,{suspendNormalGauge:false});stepBattle(b);stepBattle(b);stepBattle(b);near(b.av,100);assert.equal(b.units[0].turns,1);});
test('cancel group resumes prior normal gauge',()=>{const b=make();b.units[0].distance=7000;scheduleActionEvents(b,'a',specs,{group:'x'});stepBattle(b);assert.equal(cancelActionEvents(b,'a','wrong'),0);assert.equal(cancelActionEvents(b,'a','x'),1);stepBattle(b);near(b.av,90);});
test('owner death removes queued events',()=>{const b=make();scheduleActionEvents(b,'a',specs);b.units[0].hp=0;assert.equal(stepBattle(b),false);assert.ok(b.actionEvents.every(e=>!e.active));assert.equal(b.log.filter(e=>e.type==='action_event_start').length,0);});
test('speed change retains event distance',()=>{const b=make();const es=scheduleActionEvents(b,'a',specs);assert.equal(updateActionEventSpeed(b,'a',200),2);assert.equal(es[0].distance,2000);stepBattle(b);near(b.av,10);});
test('advance redirect affects earliest event only',()=>{const b=make();const es=scheduleActionEvents(b,'a',specs,{redirectAdvance:true});advance(b,'a',0.1);assert.equal(es[0].distance,1000);assert.equal(es[1].distance,4000);assert.equal(b.units[0].distance,10000);stepBattle(b);near(b.av,10);});
test('without redirect normal advance is preserved',()=>{const b=make();const es=scheduleActionEvents(b,'a',specs);advance(b,'a',0.1);assert.equal(b.units[0].distance,9000);assert.equal(es[0].distance,2000);});
test('invalid batch is transactional',()=>{const b=make();for(const bad of [{...specs[1],speed:0},{...specs[1],id:'a'},{...specs[1],key:'missing'},{...specs[1],distance:-1}])assert.throws(()=>scheduleActionEvents(b,'a',[specs[0],bad]));assert.equal(b.actionEvents.length,0);assert.equal(b.actionEventSequence,undefined);});
test('max AV does not execute out of budget events',()=>{const b=make({maxAV:19});scheduleActionEvents(b,'a',specs);assert.equal(stepBattle(b),false);assert.equal(b.av,0);assert.ok(b.actionEvents.every(e=>e.active));});
test('frozen event skips without ticking or thawing normal turn',()=>{const b=make();b.units[0].buffs.push({id:'frozen',source:'e',key:'marker',value:0,control:'freeze',remaining:1});scheduleActionEvents(b,'a',specs);stepBattle(b);assert.equal(b.units[0].turns,0);assert.equal(b.units[0].buffs.length,1);assert.equal(b.log.at(-1).skipped,'frozen');assert.equal(b.log.filter(e=>e.type==='action').length,0);});
test('same AV events preserve insertion order',()=>{const b=make();scheduleActionEvents(b,'a',specs.map(s=>({...s,distance:2000})));stepBattle(b);stepBattle(b);assert.deepEqual(b.log.filter(e=>e.type==='action_event_start').map(e=>e.eventId),['ev1','ev2']);near(b.av,20);});
test('lifecycle hooks run without normal-turn hooks',()=>{const b=make(),seen=[];b.rules.actionEventStart=(b,u,e)=>{seen.push('start:'+e.id);return false;};b.rules.actionEventEnd=(b,u,e,r)=>seen.push(r.skipped);b.rules.onTurnStart=()=>{throw Error('unexpected normal turn');};scheduleActionEvents(b,'a',specs);stepBattle(b);assert.deepEqual(seen,['start:ev1','module']);assert.equal(b.turnActor,null);});
for(const [mode,noReset,expected] of [['moc',false,null],['moc',true,20],['continuous',false,20]])test(`wave reset mode=${mode} preserve=${noReset}`,()=>{
 const b=make({waveMode:mode,maxAV:40}),next={...dummy('e2','enemy'),wave:2};
 // Build the next wave through the public configuration, then expire wave one.
 const c=make({waveMode:mode,maxAV:40,units:[b.config.units[0],b.config.units[1],next]});
 const es=scheduleActionEvents(c,'a',[{...specs[0],distance:5000}],{noWaveReset:noReset});es[0].distance=2000;c.units[1].hp=0;
 stepBattle(c);assert.equal(c.wave,2);if(expected!==null)near(c.av,expected);else {near(c.av,0);near(es[0].distance,5000);}
});
console.log('Independent action-event runtime:',count,'passed');
