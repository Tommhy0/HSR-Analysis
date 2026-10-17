import assert from 'node:assert/strict';
import {actor,dummy,force} from './codex_test_helpers.mjs';
import {createBattle,receiveDamage} from '../simulator/engine.mjs';

const cyrene=actor(1415),mate=dummy('mate'),foe=dummy('foe','enemy');
foe.panel={...foe.panel,hp:1e9};foe.hp=1e9;
const b=createBattle({strict:false,maxAV:500,sp:3,maxSP:9,seed:41,critMode:'noncrit',units:[cyrene,mate,foe]});
const owner=b.units.find(u=>u.characterId===1415),ally=b.units.find(u=>u.id==='mate'),enemy=b.units.find(u=>u.id==='foe');
force(b,owner,'skill');
assert.ok(owner.buffs.some(x=>x.tag==='cyreneField'),'the real skill must establish the field');
force(b,ally,'basic');
assert.ok(b.log.some(x=>x.type==='damage'&&x.kind==='true'&&x.name==='来世的乐土 · 真实伤害'),
  'an ally attack while the field is active must add its source-defined True Damage');

owner.hp=1;
receiveDamage(b,enemy,owner,1,'direct');
assert.equal(owner.hp,0,'lethal damage must put Cyrene into the unable-to-fight state');
assert.ok(!owner.buffs.some(x=>x.tag==='cyreneField'),'the field must end when its owner becomes unable to fight');

const trueHits=b.log.filter(x=>x.type==='damage'&&x.kind==='true'&&x.name==='来世的乐土 · 真实伤害').length;
force(b,ally,'basic');
assert.equal(b.log.filter(x=>x.type==='damage'&&x.kind==='true'&&x.name==='来世的乐土 · 真实伤害').length,trueHits,
  'surviving allies must stop receiving field True Damage after Cyrene falls');
console.log('PASS Cyrene field ends immediately when its owner is unable to fight');
