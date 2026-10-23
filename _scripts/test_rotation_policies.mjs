import assert from 'node:assert/strict';
import {actor,dummy,force} from './codex_test_helpers.mjs';
import {createBattle,stepBattle} from '../simulator/engine.mjs';

const foe=id=>{const e=dummy(id,'enemy');e.panel.hp=1e9;e.hp=1e9;e.panel.speed=1;return e;};
const battle=units=>createBattle({strict:false,maxAV:3000,maxEvents:30000,sp:5,maxSP:9,seed:42,critMode:'noncrit',units});
function autoTurn(b,u){
  for(const t of b.units)t.distance=100000;for(const s of b.summons)s.distance=100000;
  u.distance=0;delete u.policy.turnPlan;u.policy.basicOnly=false;
  const from=b.log.length;assert.equal(stepBattle(b),true);
  return b.log.slice(from).filter(e=>e.type==='action'&&e.actor===u.id);
}
let groups=0;const test=(name,fn)=>{fn();console.log('PASS',name);groups++;};

test('E0/E2 dragons finish four/six ten-hit breaths in one turn, then wings and departure',()=>{
  for(const [eidolon,expected]of [[0,4],[2,6]]){
    const c=actor(1407);c.kit.eidolon=eidolon;const b=battle([c,dummy('mate'),foe('enemy')]),u=b.units[0];
    b.rules.before(b,u,'summonDragon','extra',u.actions.summonDragon,[u]);
    const d=b.units.find(t=>t.memospriteOwner===u.id),from=b.log.length;
    for(const t of b.units)t.distance=100000;d.distance=0;assert.equal(stepBattle(b),true);
    const log=b.log.slice(from),actions=log.filter(e=>e.type==='action'&&e.actor===d.id);
    assert.equal(actions.length,expected);assert.equal(new Set(actions.map(e=>e.av)).size,1);
    assert.equal(log.filter(e=>e.type==='turn_start'&&e.actor===d.id).length,1);
    assert.equal(log.filter(e=>e.type==='damage'&&e.actor===d.id&&e.kind==='direct').length,expected*10);
    const wings=log.filter(e=>e.type==='damage'&&e.actor===d.id&&e.kind==='additional');assert.equal(wings.length,6);
    const firstWing=log.indexOf(wings[0]),lastBreath=log.findLastIndex(e=>e.type==='damage'&&e.actor===d.id&&e.kind==='direct');
    assert.ok(firstWing>lastBreath,'wings follow all damage from the final breath');
    assert.equal(d.active,false);assert.equal(u.resources['新蕊'],0,'wing healing must not charge a new dragon');
    assert.equal(u.resources['炽意'],0);
    // A fresh summon must not inherit the previous final-breath/departure flag.
    b.rules.before(b,u,'summonDragon','extra',u.actions.summonDragon,[u]);
    assert.equal(d.resources['焰息收尾'],undefined);const from2=b.log.length;
    for(const t of b.units)t.distance=100000;d.distance=0;stepBattle(b);
    assert.equal(b.log.slice(from2).filter(e=>e.type==='action'&&e.actor===d.id).length,expected);
  }
});

test('the chain rechecks actual HP after each activation and stops when no enemies survive',()=>{
  const b=battle([actor(1407),dummy('mate'),foe('enemy')]),u=b.units[0];
  b.rules.before(b,u,'summonDragon','extra',u.actions.summonDragon,[u]);
  const d=b.units.find(t=>t.memospriteOwner===u.id);d.hp=d.panel.hp*.5;
  const after=b.rules.after;let once=false;
  b.rules.after=(...args)=>{after(...args);if(args[1]===d&&!once){once=true;d.hp+=d.panel.hp*.25;}};
  for(const t of b.units)t.distance=100000;d.distance=0;stepBattle(b);
  assert.equal(b.log.filter(e=>e.type==='action'&&e.actor===d.id).length,3,'HP gained between breaths permits another paid breath');
  const b2=battle([actor(1407),foe('enemy2')]),c2=b2.units[0];
  b2.rules.before(b2,c2,'summonDragon','extra',c2.actions.summonDragon,[c2]);
  const d2=b2.units.find(t=>t.memospriteOwner===c2.id);b2.units[1].hp=1;
  for(const t of b2.units)t.distance=100000;d2.distance=0;stepBattle(b2);
  assert.equal(b2.log.filter(e=>e.type==='action'&&e.actor===d2.id).length,1);
});

test('Castorice E2 reserves 30% Newbud after the enhanced skill even while her dragon is present',()=>{
  const c=actor(1407);c.kit.eidolon=2;const b=battle([c,dummy('mate'),foe('enemy')]),u=b.units[0];
  b.rules.before(b,u,'summonDragon','extra',u.actions.summonDragon,[u]);
  const d=b.units.find(t=>t.memospriteOwner===u.id);force(b,u,'skill');
  assert.equal(u.resources['新蕊'],10200,'IgnoreBlock grants Newbud instead of redirecting the refund into dragon HP');
  force(b,u,'skill');assert.equal(u.resources['新蕊'],10200,'the refund is consumed once per summon');
  assert.ok(d.active,'the reserve is granted while the dragon is still alive');
});

test('March keeps a living master; Fugue maintains Foxian Prayer instead of recasting it',()=>{
  for(const id of [1224,1225]){
    const b=battle([actor(id),dummy('carry'),foe('enemy')]),u=b.units[0];u.policy.allyTargetId='carry';
    assert.equal(autoTurn(b,u)[0].key,'skill');assert.equal(autoTurn(b,u)[0].key,'basic');
    b.units[1].hp=0;assert.equal(b.rules.shouldUseSkill(b,u),true,'a dead recipient allows reapplication');
  }
});

test('Fu Xuan uses EAA; Aventurine attacks with healthy shields and refreshes depleted shields',()=>{
  const b=battle([actor(1208),dummy('mate'),foe('enemy')]),u=b.units[0];
  const sequence=Array.from({length:4},()=>autoTurn(b,u)[0].key);assert.deepEqual(sequence,['skill','basic','basic','skill']);
  const a=battle([actor(1304),dummy('mate'),foe('enemy')]),v=a.units[0];
  assert.equal(autoTurn(a,v)[0].key,'basic');a.units[1].shields=[];assert.equal(autoTurn(a,v)[0].key,'skill');
});

test('Gallagher saves SP at full health, heals wounded allies, and prioritizes his enhanced basic',()=>{
  const b=battle([actor(1301),dummy('mate'),foe('enemy')]),u=b.units[0];
  assert.equal(autoTurn(b,u)[0].key,'basic');b.units[1].hp=100;assert.equal(autoTurn(b,u)[0].key,'skill');
  u.resources['酒花奔涌']=1;assert.equal(autoTurn(b,u)[0].key,'basic');
});

test('Black Swan and Silver Wolf maintain debuffs and use basics between refreshes',()=>{
  for(const id of [1307,1006]){
    const b=battle([actor(id),foe('enemy')]),u=b.units[0];u.panel.effectHit=10;
    assert.equal(autoTurn(b,u)[0].key,'skill');assert.equal(autoTurn(b,u)[0].key,'basic');
    b.units[1].buffs=[];assert.equal(autoTurn(b,u)[0].key,'skill');
  }
});

test('Pela saves SP unless she can dispel; Lingsha reserves points while Fuyuan and HP are healthy',()=>{
  const b=battle([actor(1106),foe('enemy')]),u=b.units[0];assert.equal(autoTurn(b,u)[0].key,'basic');
  b.units[1].buffs.push({id:'dispellable',name:'enemy buff',key:'atkPct',value:.1});assert.equal(autoTurn(b,u)[0].key,'skill');
  const a=battle([actor(1222),dummy('mate'),foe('enemy')]),v=a.units[0];a.sp=2;
  assert.equal(autoTurn(a,v)[0].key,'skill');a.sp=2;assert.equal(autoTurn(a,v)[0].key,'basic');
});

test('Cyrene gives Evernight/Castorice their permanent poems once and then uses her attack branch',()=>{
  const b=battle([actor(1415),actor(1407),actor(1413),actor(1409),foe('enemy')]),u=b.units[0];
  u.policy.allyTargetId=b.units[1].id;
  for(let i=0;i<3;i++){u.resources['追忆']=24;u.energy=24;force(b,u,'ultimate');}
  assert.deepEqual(b.log.filter(e=>e.name==='德谬歌施放诗篇').slice(0,3).map(e=>e.target),[b.units[2].id,b.units[1].id,u.id]);
  assert.equal(autoTurn(b,u)[0].key,'basic','ripple form uses enhanced basics');
  u.policy.poemStrategy='fixed';u.resources['追忆']=24;u.energy=24;force(b,u,'ultimate');
  assert.equal(b.log.filter(e=>e.name==='德谬歌施放诗篇').at(-1).target,b.units[1].id,'explicit fixed targeting takes precedence');
});

test('Phainon builds Ruin with basics versus 1–2 enemies and uses the nuke only at four Ruin',()=>{
  for(const count of [1,2,3]){
    const b=battle([actor(1408),...Array.from({length:count},(_,i)=>foe('enemy'+i))]),u=b.units[0];
    u.buffs.push({id:'test-khaos',tag:'phainonKhaos',key:'marker',value:0});
    u.resources['毁伤']=0;assert.equal(b.rules.shouldUseSkill(b,u),count>=3);
    assert.equal(b.rules.prepare(b,u,'skill','normal',u.actions.skill).name,u.actions.enhancedSkill.name);
    u.resources['毁伤']=4;assert.equal(b.rules.shouldUseSkill(b,u),true);
    assert.equal(b.rules.prepare(b,u,'skill','normal',u.actions.skill).name,u.actions.enhancedSkill2.name);
  }
});

test('Aglaea attacks while her servant is healthy; Cyrene does not overwrite unspent Romance',()=>{
  const a=battle([actor(1402),foe('enemy')]),v=a.units[0];
  assert.equal(autoTurn(a,v)[0].key,'skill');assert.equal(autoTurn(a,v)[0].key,'basic');
  const b=battle([actor(1415),actor(1402),foe('enemy')]),u=b.units[0];u.policy.allyTargetId=b.units[1].id;
  for(let i=0;i<2;i++){u.resources['追忆']=24;u.energy=24;force(b,u,'ultimate');}
  assert.deepEqual(b.log.filter(e=>e.name==='德谬歌施放诗篇').slice(0,2).map(e=>e.target),[b.units[1].id,u.id]);
});

test('Yunli waits through ally turns and parries immediately before an enemy turn',()=>{
  const b=battle([actor(1221),dummy('mate'),foe('enemy')]),u=b.units[0];u.policy.autoUltimate=true;u.energy=120;
  autoTurn(b,b.units[1]);assert.equal(b.log.some(e=>e.type==='action'&&e.actor===u.id&&e.key==='ultimate'),false);
  for(const t of b.units)t.distance=100000;b.units[2].distance=0;stepBattle(b);
  const ult=b.log.findIndex(e=>e.type==='action'&&e.actor===u.id&&e.key==='ultimate');
  const enemyTurn=b.log.findIndex(e=>e.type==='turn_start'&&e.actor==='enemy');
  assert.ok(ult>=0&&ult<enemyTurn);assert.ok(b.log.some(e=>e.type==='action'&&e.actor===u.id&&e.name.includes('灭')));
  const manual=battle([actor(1221),dummy('mate2'),foe('enemy2')]),m=manual.units[0];
  m.policy={autoUltimate:true,ultimateTiming:'afterTurn'};m.energy=120;autoTurn(manual,manual.units[1]);
  assert.ok(manual.log.some(e=>e.type==='action'&&e.actor===m.id&&e.key==='ultimate'),'explicit ultimate timing overrides the enemy-window default');
});

test('manual rotations remain authoritative over automatic skill maintenance',()=>{
  const b=battle([actor(1224),dummy('carry'),foe('enemy')]),u=b.units[0];u.policy.allyTargetId='carry';
  u.policy.rotation=['skill'];autoTurn(b,u);assert.equal(autoTurn(b,u)[0].key,'skill');
});
console.log(`Rotation regression groups: ${groups} passed`);
