import assert from 'node:assert/strict';
import {actor,dummy,force} from './codex_test_helpers.mjs';
import {createBattle,stepBattle,combatPanel} from '../simulator/engine.mjs';

function battle(units){return createBattle({strict:false,maxAV:800,maxEvents:30000,sp:3,maxSP:9,seed:17,critMode:'noncrit',units});}
function ultimateFor(cyrene,target,others=[]){
  const e=dummy('enemy','enemy');e.hp=1e9;e.panel={...e.panel,hp:1e9};
  const b=battle([cyrene,target,...others,e]);
  const c=b.units[0],t=b.units[1];c.energy=24;c.policy.allyTargetId=t.id;
  force(b,c,'ultimate');
  return {b,c,t};
}

{
  const c=actor(1415),ally=actor(1408),e=dummy('enemy','enemy');
  const b=battle([c,ally,e]);b.units[0].energy=24;b.units[0].resources['追忆']=24;b.units[1].buffs.push({id:'freeze-test',name:'Freeze',key:'marker',value:0,control:'freeze',debuff:true});force(b,b.units[0],'ultimate');
  assert.ok(!b.units[1].buffs.some(x=>x.control),'summoning Demigogue must cleanse control effects from all allies');
}

{
  const c=actor(1415),e=dummy('enemy','enemy');c.kit.eidolon=6;
  const b=battle([c,e]);b.units[0].energy=24;b.units[0].resources['追忆']=24;
  force(b,b.units[0],'ultimate');
  assert.equal(b.units[0].resources['真我之诗触发次数']??0,0,
    'E6 poem counters must not increase on ordinary Demigogue dances without a distinct Future trigger');
  assert.ok(!b.units[1].buffs.some(x=>x.id?.startsWith(c.id+':cyrene-e6-def:')),
    'the E6 first-trigger defense debuff requires an actual True Self poem trigger');
}

{
  const {b,c,t}=ultimateFor(actor(1415),actor(1408));
  const demo=b.units.find(x=>x.memospriteOwner===c.id);
  assert.equal(demo.resources['舞曲次数']??0,0,
    'in a normal party, Cyrene’s summon ultimate selects the source-defined support poem branch without an unsolicited dance');
  assert.equal(demo.resources['故事'],2,'the summon and first ultimate each grant one story; no unsupported turn-start story is added');
  assert.ok(c.resources['献诗目标']?.includes(t.id),'Phainon must count as the first distinct poem recipient');
  assert.equal(t.resources['永续的燃烧'],1,'the Negative poem must grant the persistent Khaos branch');
  assert.ok(t.buffs.some(x=>x.tag==='phainonKhaos'),'the team-wide ultimate must transform Phainon');
  assert.ok(t.buffs.some(x=>x.id?.endsWith(':poem-phainon-cr')),'Elation-linked poem must add the source CR increase');
  assert.ok(b.eventActions.active(b).length>=8,'Phainon must retain the independent eight-event action sequence');
  for(let i=0;i<12&&!b.log.some(x=>x.type==='action_event_start'&&x.actor===t.id);i++)stepBattle(b);
  const first=b.log.find(x=>x.type==='action_event_start'&&x.actor===t.id);
  const hpBefore=first.frame.units.find(x=>x.id===t.id).hp;
  const hpCost=b.log.find(x=>x.type==='hp_consume'&&x.reason==='永续的燃烧 · 额外回合');
  assert.ok(hpCost,'the first permanent extra action must pay its current-HP cost');
  assert.ok(Math.abs(hpCost.amount-hpBefore*.15)<1e-6,'the cost must be exactly 15% of HP at action start');
  assert.ok(b.log.some(x=>x.type==='mechanic'&&x.actor===t.id&&x.name==='永续的燃烧 · 追加攻击'&&x.hits===5),
    'each Khaos attack must append the five source-defined fire hits');
  for(let i=0;i<20&&(t.resources['永续行动循环']??0)<2;i++)stepBattle(b);
  assert.equal(t.resources['永续行动循环'],2,'after the eighth event, the permanent poem must refresh a new full Khaos cycle');
  assert.equal(t.resources['卡厄斯兰那回合'],8,'the prior event end must not erase the refreshed cycle counter');
  assert.ok(t.buffs.some(x=>x.tag==='phainonKhaos'),'the permanent branch must not end Khaos after its eighth event');
}

{
  const {b,c,t}=ultimateFor(actor(1415),actor(1413));
  const night=b.units.find(x=>x.memospriteOwner===t.id);
  assert.ok(night,'the Time poem target must receive the queued summon as part of the team ultimate');
  assert.equal(combatPanel(night).controlRes,1,'Long Night is immune to control debuffs while present');
  assert.ok(night.buffs.some(x=>x.tag?.startsWith('cyreneEvernightPoem:')&&x.value===.252),
    'Evernight poem damage must attach to Long Night, not the owner character');
  assert.ok(t.resources['忆质']>=1,'each post-poem ultimate must grant its extra Remembrance point');
  const baseCd=combatPanel(t).critDmg*t.kit.params.BPSkill[0];
  force(b,t,'skill');
  const skillBuff=night.buffs.find(x=>x.id===t.id+':skill-cd');
  assert.ok(skillBuff,'Long Night poem must still use Evernight’s normal skill buff path');
  assert.ok(Math.abs(skillBuff.value-(baseCd+.168))<1e-6,
    'the 4.6 poem adds its exact 16.8 percentage points to the skill crit-damage buff');
}

for (const form of [8007,8008]) {
  const {b,c,t}=ultimateFor(actor(1415),actor(form));
  const demo=b.units.find(x=>x.memospriteOwner===c.id),mimi=b.units.find(x=>x.memospriteOwner===t.id);
  assert.ok(demo&&mimi,'the Creation poem test requires both summoned sprites');
  const amount=combatPanel(demo).hp*.224,crit=combatPanel(demo).critRate*1.008;
  for(const recipient of [t,mimi]){
    const atk=recipient.buffs.find(x=>x.id===c.id+':creation-atk:'+recipient.id);
    const cr=recipient.buffs.find(x=>x.id===c.id+':creation-crit:'+recipient.id);
    assert.ok(atk&&Math.abs(atk.value-amount)<1e-6,'Creation poem converts 22.4% of Demigogue max HP to fixed ATK');
    assert.ok(cr&&Math.abs(cr.value-crit)<1e-6,'Creation poem converts 100.8% of Demigogue crit rate to crit rate');
  }
  assert.equal(t.buffs.find(x=>x.tag==='cyreneCreationPoem:'+c.id)?.remaining,null,'Creation poem lasts for the whole battle');
  const before=demo.resources['舞曲次数']??0;
  force(b,t,'basic');
  assert.equal(demo.resources['舞曲次数'],before+1,'Memory Trailblazer enhanced basic grants Demigogue an immediate dance turn');
}

{
  const c=actor(1415),t=actor(8007),first=dummy('first','enemy'),second=dummy('second','enemy');
  first.wave=1;second.wave=2;first.hp=1e9;first.panel={...first.panel,hp:1e9};
  second.hp=1e9;second.panel={...second.panel,hp:1e9};
  const b=battle([c,t,first,second]),owner=b.units[0],tb=b.units[1],e1=b.units[2],e2=b.units[3];
  owner.energy=24;owner.resources['追忆']=24;owner.policy.allyTargetId=tb.id;force(b,owner,'ultimate');
  const demo=b.units.find(x=>x.memospriteOwner===owner.id);assert.ok(demo);
  e1.hp=1;e1.panel={...e1.panel,hp:1};
  tb.resources['史诗']=1;force(b,tb,'basic');
  assert.equal(e1.hp,0,'the enhanced basic kills the only active target in wave one');
  assert.equal(owner.resources['创世诗篇待弹射'],1,'the Creation poem dance waits when the wave has no living target');
  const before=demo.resources['舞曲次数']??0;stepBattle(b);
  assert.equal(b.wave,2,'the next wave enters before resolving the deferred dance');
  assert.equal(owner.resources['创世诗篇待弹射'],0,'the queued Creation poem dance clears after entering the new wave');
  assert.equal(demo.resources['舞曲次数'],before+1,'the deferred dance attacks the newly-entered enemies');
  assert.ok(b.log.some(e=>e.type==='damage'&&e.actor===demo.id&&e.target===e2.id),'the deferred attack resolves against the wave-two target');
}

{
  const evernight=actor(1413),ally=actor(1408),enemy=dummy('enemy','enemy');
  evernight.kit.eidolon=1;
  const b=battle([evernight,ally,enemy]);
  const owner=b.units[0],target=b.units[2];force(b,owner,'skill');
  const night=b.units.find(x=>x.memospriteOwner===owner.id);
  const source={...night,id:'probe-memosprite',memospriteOwner:owner.id};
  const action={name:'probe',type:'Talent',element:'Ice',terms:[{scaling:'atk',multiplier:1}]};
  const withNight=b.rules.modifiers(b,source,target,action,'direct');
  assert.ok(withNight.dmgBoost>0,'Evernight E1 applies to allied memosprites while Long Night is present');
  night.hp=0;night.active=false;
  const withoutNight=b.rules.modifiers(b,source,target,action,'direct');
  assert.equal(withoutNight.dmgBoost??0,0,'Evernight E1’s memosprite damage multiplier ends when Long Night leaves the field');
}

{
  const evernight=actor(1413),ally=actor(1408),enemy=dummy('enemy','enemy');
  const b=battle([evernight,ally,enemy]),owner=b.units[0];force(b,owner,'skill');
  const night=b.units.find(x=>x.memospriteOwner===owner.id);assert.ok(night);
  owner.resources['忆质']=16;owner.buffs.push({id:'control-test',key:'marker',value:0,control:'freeze',debuff:true});
  b.rules.onTurnStart(b,night);
  assert.equal(night.resources['施放迷梦']??0,0,'16 Recollection alone cannot select Dream while Evernight is controlled');
  assert.equal(night.actions.basic.target,'single','a controlled owner leaves Long Night on the ordinary single-target servant skill');
  owner.buffs=owner.buffs.filter(x=>x.id!=='control-test');
  b.rules.onTurnStart(b,night);
  assert.equal(night.resources['施放迷梦'],1,'Dream becomes available once the owner is no longer controlled');
}

{
  const ca=actor(1407);ca.policy.holdNewbudOverflow=true;
  const {b,c,t}=ultimateFor(actor(1415),ca);
  assert.equal(t.resources['新蕊溢出倍率'],2,'the Death poem must open the 200% Newbud cap');
  // Each cycle adds 8271.36 Newbud here; eight cycles stop at 66170.88,
  // below the 68000 overflow cap. The ninth real skill reaches the cap.
  for(let n=0;n<9;n++){
    for(const u of b.units.filter(x=>x.side==='ally'))u.hp=combatPanel(u).hp;
    b.sp=3;
    force(b,t,'skill');
  }
  assert.ok(b.log.some(e=>e.type==='resource'&&e.actor===t.id&&e.name==='新蕊'&&e.value===68000),
    'the ninth real skill must reach the exact upgraded 200% cap before the queued summon consumes Newbud');
  assert.equal(t.resources['新蕊'],0,'the queued summon consumes Newbud after reaching its cap');
  const dragon=b.units.find(x=>x.memospriteOwner===t.id&&x.active!==false&&x.hp>0);
  assert.ok(dragon,'a held overflow should summon when Newbud reaches the upgraded cap');
  assert.ok(Math.abs((t.resources['死龙晦翼增伤']??0)-.672)<1e-6,
    'at 100% overflow and at most two enemies, Wingblast damage bonus must be 67.2%');
  assert.ok(c.resources['献诗目标']?.includes(t.id));
}


{
  const {b,c,t}=ultimateFor(actor(1415),actor(1410));
  assert.ok(t.buffs.some(x=>x.tag==='cyreneHysPoem:'+c.id),'Ocean poem must grant Hysilens its permanent 168% damage buff');
  assert.equal(t.resources['海瑟音浪潮暖流已触发'],1,'the queued ultimate immediately consumes Warm Current after the poem is granted');
  assert.ok(b.log.some(x=>x.type==='energy'&&x.actor===t.id&&x.amount===60),'Warm Current restores 60 energy on that first attack');
  const enemy=b.units.at(-1);enemy.dots.push({id:'wave-dot-1',name:'test burn',source:t.id,element:'Fire',terms:[{scaling:'atk',multiplier:.5}],stacks:1,duration:3});
  const beforeBasic=b.log.filter(x=>x.type==='mechanic'&&x.name==='献予「海洋」之诗 · 持续伤害引爆').length;
  force(b,t,'basic');
  assert.equal(t.resources['海瑟音浪潮暖流已触发'],1,'Warm Current must remain consumed after the first attack');
  const basicIgnitions=b.log.filter(x=>x.type==='mechanic'&&x.name==='献予「海洋」之诗 · 持续伤害引爆');
  assert.equal(basicIgnitions.length,beforeBasic+1,'the basic attack runs one DoT ignition pass on its hit target');
  assert.ok(b.log.some(x=>x.type==='mechanic'&&x.name==='献予「海洋」之诗 · 持续伤害引爆'&&x.ratio===.84),'basic uses the exact 84% ignition ratio');
  const beforeSkill=basicIgnitions.length;
  enemy.dots.push({id:'wave-dot-2',name:'test shock',source:t.id,element:'Thunder',terms:[{scaling:'atk',multiplier:.4}],stacks:1,duration:3});
  force(b,t,'skill');
  const allIgnitions=b.log.filter(x=>x.type==='mechanic'&&x.name==='献予「海洋」之诗 · 持续伤害引爆');
  assert.equal(allIgnitions.length,beforeSkill+1,'the later skill still ignites active DoTs after Warm Current is consumed');
  assert.equal(t.resources['海瑟音浪潮暖流已触发'],1,'later attacks cannot consume Warm Current twice');
  assert.ok(b.log.some(x=>x.type==='mechanic'&&x.name==='献予「海洋」之诗 · 持续伤害引爆'&&x.ratio===1.12),'skill uses the exact 112% ignition ratio');
}


{
  const other=dummy('other-enemy','enemy');other.hp=1.2e9;other.panel={...other.panel,hp:1.2e9};
  const {b,c,t}=ultimateFor(actor(1415),actor(1406),[other]);
  const marked=b.units.find(x=>x.side==='enemy'&&x.buffs.some(y=>y.tag==='cipherMark'));
  const unmarked=b.units.find(x=>x.side==='enemy'&&x!==marked);
  assert.ok(t.buffs.some(x=>x.tag==='cyreneCipherPoem:'+c.id&&x.value===.504),'Trick poem gives Cipher the exact permanent 50.4% damage bonus');
  const action=t.actions.basic;
  assert.equal(b.rules.modifiers(b,t,marked,action,'direct').defShred,.28,'Cipher’s current marked enemy gets 28% defense reduction');
  assert.equal(b.rules.modifiers(b,t,unmarked,action,'direct').defShred,.168,'all other enemies get 16.8% defense reduction');
}


{
  const {b,c}=ultimateFor(actor(1415),actor(1413));
  const demo=b.units.find(x=>x.memospriteOwner===c.id);assert.ok(demo);
  assert.equal(demo.resources['故事'],2,'the first summon and ultimate grant two story');
  const before=b.log.filter(x=>x.type==='action'&&x.actor===demo.id&&x.key==='basic').length;
  c.energy=c.energyMax;force(b,c,'ultimate');
  assert.equal(demo.resources['故事'],0,'the third story is consumed at the threshold');
  const after=b.log.filter(x=>x.type==='action'&&x.actor===demo.id&&x.key==='basic').length;
  assert.ok(after>before,'the threshold immediately gives Demigogue an extra turn to dance');
}


{
  const {b,c,t}=ultimateFor(actor(1415),actor(1402));
  const garment=b.units.find(x=>x.memospriteOwner===t.id);assert.ok(garment,'Romance poem needs Aglaea’s summoned Garmentmaker');
  assert.equal(garment.resources['速度层数'],6,'Romance immediately fills Garmentmaker’s speed stacks');
  for(const recipient of [t,garment]){
    assert.ok(recipient.buffs.some(x=>x.tag?.startsWith('cyreneAglaeaPower:')&&x.key==='dmgBoost'&&x.value===1.008),'Aglaea and Garmentmaker get 100.8% damage increase');
    assert.ok(recipient.buffs.some(x=>x.tag?.startsWith('cyreneAglaeaPower:')&&x.key==='defIgnore'&&x.value===.504),'Aglaea and Garmentmaker ignore 50.4% defense');
  }
  force(b,garment,'basic');
  assert.ok(b.log.some(x=>x.type==='energy'&&x.actor===t.id&&x.amount===70),'Garmentmaker consumes Romance and restores 70 energy to Aglaea');
  assert.ok(!t.buffs.some(x=>x.tag?.startsWith('cyreneAglaeaRomance:')),'Romance is consumed after the attack');
}

console.log('PASS priority poem branches: Phainon, Evernight, Castorice, and Hysilens, and Cipher and the True Self story threshold, and Aglaea');
