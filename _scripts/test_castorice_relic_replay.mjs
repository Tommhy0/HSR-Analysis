import assert from 'node:assert/strict';
import {ctx,actor,dummy} from './codex_test_helpers.mjs';
import {newBattleBuild,buildBattleActor} from '../simulator/builds.mjs';
import {createBattle,combatPanel} from '../simulator/engine.mjs';
import {relicOutsideSpeed} from '../simulator/relic-runtime.mjs';
import {replayAt,replayStops} from '../simulator/replay.mjs';
import {renderHpMeter} from '../ui/battle-replay.mjs';

const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const cast=(speed=93,sets=[{id:124,count:4},{id:319,count:2}])=>buildBattleActor(ctx,{
  ...newBattleBuild(),characterId:1407,eidolon:2,technique:true,relicAuto:false,relicSets:sets,
  panel:{...actor(1407).panel,hp:7800,speed,critRate:.5,critDmg:1.7},
});
const setup=u=>createBattle({strict:false,seed:42,maxAV:500,sp:3,maxSP:9,critMode:'noncrit',units:[u,dummy('enemy','enemy')]});
let count=0;
const test=(name,fn)=>{fn();count++;console.log('PASS',name);};

test('Poet reads outside-combat speed despite Castorice combat trace; owner and dragon each receive exactly 32% CR',()=>{
  const b=setup(cast()),u=b.units[0],s=b.units.find(t=>t.memospriteOwner===u.id);assert.ok(s);
  near(relicOutsideSpeed(u),93-95*.08);assert.ok(combatPanel(u).speed>110);
  near(combatPanel(u).critRate,.82);near(combatPanel(s).critRate,.82);
  near(combatPanel(u).critDmg,1.98);near(combatPanel(s).critDmg,1.98);
  b.rules.relics.ready(b);near(combatPanel(u).critRate,.82);near(combatPanel(s).critRate,.82);
  b.rules.after(b,u,'summonDragon','extra',u.actions.summonDragon,[],[]);
  near(combatPanel(s).critRate,.82);near(combatPanel(s).critDmg,1.98);
});

test('Poet strict boundaries remain fixed after combat speed changes; no double grant to summons',()=>{
  for(const [outside,bonus] of [[94.999,.32],[95,.2],[109.999,.2],[110,0]]){
    const b=setup(cast(outside+95*.08,[{id:124,count:4}])),u=b.units[0],s=b.units.find(t=>t.memospriteOwner===u.id);
    near(relicOutsideSpeed(u),outside);near(combatPanel(u).critRate,.5+bonus);near(combatPanel(s).critRate,.5+bonus);
    u.buffs.push({id:'combat-speed',key:'speed',value:200});
    near(combatPanel(u).critRate,.5+bonus);near(combatPanel(s).critRate,.5+bonus);
  }
});

test('Bone Collection servant crit damage is applied once and its HP threshold remains live',()=>{
  const b=setup(cast()),u=b.units[0],s=b.units.find(t=>t.memospriteOwner===u.id);
  near(combatPanel(s).critDmg,1.98);
  u.panel.hp=4000;near(combatPanel(s).critDmg,1.7);
  u.panel.hp=7800;near(combatPanel(s).critDmg,1.98);
});

test('Action totals include break and triggered damage, exclude nested independent actions, and resume parent context',()=>{
  const main={actor:'a',name:'parent',key:'skill',kind:'normal',sequence:1,targets:['enemy']};
  const child={actor:'a',name:'child',key:'followup',kind:'followup',sequence:5,targets:['enemy']};
  const ev=(type,action,extra={})=>({type,actor:'a',av:0,frame:{av:0,action},...extra});
  const dmg=(n,action,extra={})=>ev('damage',action,{target:'enemy',damage:n,hpDamage:n,...extra});
  const log=[ev('battle_start',null),ev('action',main,{name:main.name}),dmg(100,main,{segment:1}),dmg(20,main,{kind:'break'}),
    dmg(30,main,{kind:'true'}),ev('action',child,{name:child.name}),dmg(60,child,{segment:1}),ev('action_end',child),
    dmg(10,main,{kind:'additional'}),ev('action_end',main),ev('turn_end',null),dmg(7,null,{kind:'dot'}),ev('battle_end',null)];
  log.forEach((e,i)=>e.index=i);
  const r={config:{units:[dummy('a'),dummy('enemy','enemy')]},log};
  near(replayAt(r,4).actionDamage,150);assert.equal(replayAt(r,4).actionComplete,false);
  near(replayAt(r,7).actionDamage,60);assert.equal(replayAt(r,7).action.name,'child');
  const end=replayAt(r,9);assert.equal(end.action.name,'parent');assert.equal(end.actionComplete,true);
  near(end.skillDamage,100);near(end.triggeredDamage,60);near(end.actionDamage,160);
  near(replayAt(r,11).actionDamage,160);near(replayAt(r,11).totals.ally,227);
  assert.deepEqual(replayStops(r,'action'),[0,7,9,12]);
});

test('Shield border clamps at a full HP frame, uses the strongest shield, and never emits nonfinite widths',()=>{
  const render=shields=>renderHpMeter({hp:10000,maxHp:10000,shields},'unit');
  assert.ok(!render([]).includes('unit-shield-frame'));
  for(const [shields,width] of [[[{value:2500}],25],[[{value:10000}],100],[[{value:25000}],100],[[{value:2500},{value:6000}],60]]){
    const html=render(shields);assert.ok(html.includes(`style="width:${width}%"`));
    assert.ok(!/width:(?:NaN|Infinity)/.test(html));
  }
  assert.ok(!render([{value:Infinity}]).includes('unit-shield-frame'));
  assert.ok(renderHpMeter({hp:4500,maxHp:10000,shields:[{value:6000}]},'low HP').includes('style="width:100%"'));
});

console.log(`Castorice relic/replay checks: ${count} passed`);
