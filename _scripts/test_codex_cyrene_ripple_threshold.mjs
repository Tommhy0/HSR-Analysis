import assert from 'node:assert/strict';
import {actor,dummy,force} from './codex_test_helpers.mjs';
import {createBattle,battleFrame} from '../simulator/engine.mjs';

const cyrene=actor(1415);
const mate=dummy('mate');
const enemy=dummy('enemy','enemy');
enemy.panel={...enemy.panel,hp:1e9};enemy.hp=1e9;
const b=createBattle({strict:false,maxAV:500,sp:3,maxSP:9,seed:42,critMode:'noncrit',units:[cyrene,mate,enemy]});
const u=b.units[0],ally=b.units[1];
u.resources['追忆']=24;
u.energy=24;

// The first, 24-point ultimate consumes only 12, enters Ripple and changes the next gate to Talent[4]=12.
force(b,u,'ultimate');
assert.ok(u.buffs.some(x=>x.tag==='cyreneRipple'),'first ultimate must enter Ripple');
assert.equal(u.actions.ultimate.energyCost,12,'Ripple ultimate gate must use Talent[4]');
assert.equal(u.resources['追忆'],12,'first ultimate spends 12 from the special store');
assert.equal(u.energy,12,'the energy mirror retains the unused 12 points');

// At 11 the action is not ready; a real ally action consumes Future and grants the twelfth point.
u.resources['追忆']=11;u.energy=11;
assert.ok(!battleFrame(b).readyUltimates.some(x=>x.actor===u.id),'11 Ripple points must not enable the ultimate');
force(b,ally,'basic');
assert.equal(u.resources['追忆'],12,'ally action should grant one real Future point');
assert.equal(u.energy,12,'energy mirror reaches the Ripple threshold');
u.policy.autoUltimate=true;
assert.ok(battleFrame(b).readyUltimates.some(x=>x.actor===u.id),'12 Ripple points must enable the ultimate');
const before=b.log.length;
force(b,u,'basic');
assert.ok(b.log.slice(before).some(x=>x.type==='action'&&x.actor===u.id&&x.key==='ultimate'&&x.name==='一如初见的重逢'),'second ultimate must use the exact 141514 action');
assert.ok(b.log.slice(before).some(x=>x.type==='action'&&x.actor===u.id+':demogogue'&&x.kind==='extra'),'141514 must grant Demogogue an immediate extra action');

// With fewer than two selectable allies, 141514 selects the servant dance (Skill01), not its ally poem (Skill02).
const solo=actor(1415),soloEnemy=dummy('solo-enemy','enemy');
const soloBattle=createBattle({strict:false,maxAV:500,sp:3,maxSP:9,seed:43,critMode:'noncrit',units:[solo,soloEnemy]});
const owner=soloBattle.units.find(x=>x.characterId===1415);owner.resources['追忆']=24;owner.energy=24;
force(soloBattle,owner,'ultimate');owner.energy=12;
const servant=soloBattle.units.find(x=>x.memospriteOwner===owner.id),from=soloBattle.log.length;
force(soloBattle,owner,'ultimate');
const repeatActions=soloBattle.log.slice(from).filter(x=>x.type==='action'&&x.actor===servant.id&&x.kind==='extra');
assert.equal(repeatActions.length,2,'second ripple use and third Story each schedule one servant dance');
assert.ok(repeatActions.every(x=>x.key==='basic'),'141514 and Story must follow the source-defined dance branch when fewer than two selectable allies exist');
console.log('PASS Cyrene Ripple ultimate gate and 141514 extra action');
