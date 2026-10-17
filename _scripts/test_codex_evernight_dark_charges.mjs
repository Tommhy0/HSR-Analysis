import assert from 'node:assert/strict';
import {actor,dummy,force} from './codex_test_helpers.mjs';
import {createBattle,combatPanel} from '../simulator/engine.mjs';

const owner=actor(1413),ally=dummy('ally'),enemy=dummy('enemy','enemy');
enemy.hp=1e9;enemy.panel={...enemy.panel,hp:1e9};
const b=createBattle({strict:false,maxAV:800,sp:3,maxSP:9,seed:52,critMode:'noncrit',units:[owner,ally,enemy]});
const e=b.units.find(u=>u.characterId===1413),target=b.units.find(u=>u.id==='ally');
e.energy=e.energyMax;
force(b,e,'ultimate');
assert.equal(e.resources['至暗充能'],2,'the first ultimate grants two Dark Mystery charges');
assert.ok(e.buffs.some(x=>x.tag==='evernightDark'));
assert.equal(combatPanel(e).controlRes,1,
  'Dark Mystery grants control immunity to the owner as well as Long Night');

// A real ordinary owner action is not one of the source-defined charge consumers.
force(b,target,'basic');
force(b,e,'basic');
assert.equal(e.resources['至暗充能'],2,'ordinary turns must not spend Dark Mystery charges');
assert.ok(e.buffs.some(x=>x.tag==='evernightDark'),'Dark Mystery remains active without a Dream cast');

// A Dream consumes one charge. Re-summon through the real skill and cast the second Dream.
e.resources['忆质']=16;
let night=b.units.find(u=>u.memospriteOwner===e.id&&u.active!==false&&u.hp>0);
assert.ok(night);
force(b,night,'basic');
assert.equal(e.resources['至暗充能'],1,'the first real Dream spends exactly one charge');
assert.ok(e.buffs.some(x=>x.tag==='evernightDark'));

force(b,e,'skill');
night=b.units.find(u=>u.memospriteOwner===e.id&&u.active!==false&&u.hp>0);
assert.ok(night,'Long Night returns when the owner uses the skill');
e.resources['忆质']=16;
force(b,night,'basic');
assert.equal(e.resources['至暗充能'],0,'the second real Dream spends the last charge');
b.rules.onTurnStart(b,e);
assert.ok(!e.buffs.some(x=>x.tag==='evernightDark'),'Dark Mystery ends at the owner turn start after all charges are spent');
console.log('PASS Evernight Dark Mystery charges are consumed by Dream casts, not owner turns');
