import assert from 'node:assert/strict';
import {actor,dummy} from './codex_test_helpers.mjs';
import {validateBattle,createBattle,simulateBattle} from '../simulator/engine.mjs';
import {KNOWN_MECHANICS_GAPS} from '../simulator/mechanics-status.mjs';
const config=(u,strict=true)=>({strict,maxAV:1,sp:3,maxSP:9,seed:42,critMode:'noncrit',units:[u,dummy('enemy','enemy')]});
let passed=0;
for(const id of Object.keys(KNOWN_MECHANICS_GAPS).map(Number)){
 const u=actor(id);u.unsupported=[];u.coverage={scope:'claimed complete'};
 const c=config(u);
 assert.ok(validateBattle(c).some(e=>e.includes('严格验算暂不可用')),id+' strict must block known gap');
 assert.throws(()=>createBattle(c),/严格验算暂不可用/);passed++;
 assert.deepEqual(validateBattle({...c,strict:false}),[],id+' explicit approximate must remain usable');
 const r=simulateBattle({...c,strict:false});assert.equal(r.accuracy,'approximate');
 assert.ok(r.unsupported.some(e=>e.includes(u.name)),id+' result must retain gap disclosure');passed++;
}
const clean=actor(1112);assert.deepEqual(validateBattle(config(clean)),[]);
const exact=simulateBattle(config(clean));assert.equal(exact.accuracy,'strict');assert.deepEqual(exact.unsupported,[]);passed++;
const tampered=actor(1415);tampered.actions.basic.terms[0].multiplier=999;
assert.ok(validateBattle(config(tampered,false)).length,'approximate mode must not permit registered multiplier tampering');passed++;
console.log('Mechanics accuracy gates:',passed,'passed');
