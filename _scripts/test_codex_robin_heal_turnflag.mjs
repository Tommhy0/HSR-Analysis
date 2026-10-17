import assert from 'node:assert/strict';
import {actor,dummy} from './codex_test_helpers.mjs';
import {createBattle} from '../simulator/engine.mjs';

const robin=actor(1512),healer=dummy('healer'),other=dummy('other'),enemy=dummy('enemy','enemy');
const b=createBattle({strict:false,maxAV:500,sp:3,maxSP:9,seed:31,critMode:'noncrit',units:[robin,healer,other,enemy]});
const r=b.units.find(x=>x.characterId===1512),h=b.units.find(x=>x.id==='healer');
const base=r.resources['气氛值']??0;
function healFromProvider(){
  b.log.push({type:'heal',actor:h.id,target:'other',amount:1,hp:9999});
  // A different unit's normal turn advances the global count without beginning the provider's next turn.
  b.turns++;
  b.rules.after(b,r,'basic','normal',null,[],[]);
}
h.turns=2;healFromProvider();
assert.equal(r.resources['气氛值'],base+1,'provider first healing during its turn grants one Atmosphere');
healFromProvider();
assert.equal(r.resources['气氛值'],base+1,'the same provider cannot retrigger before its own next turn, even after another unit acts');
h.turns=3;healFromProvider();
assert.equal(r.resources['气氛值'],base+2,'the provider turn-begin reset permits one new trigger');

const second=b.units.find(x=>x.id==='other');
b.log.push({type:'shield',actor:second.id,target:'healer',amount:5});
b.turns++;
b.rules.after(b,r,'basic','normal',null,[],[]);
assert.equal(r.resources['气氛值'],base+3,'a different provider tracks its own turn flag independently');
console.log('PASS Robin HyperCharge healing/shield trigger uses each provider turn flag');
