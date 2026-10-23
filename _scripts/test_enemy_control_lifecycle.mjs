import assert from 'node:assert/strict';
import {createBattle,receiveDamage,stepBattle} from '../simulator/engine.mjs';

const panel={hp:10000,atk:1000,def:0,speed:100,critRate:0,critDmg:.5,energyRegen:1,baseStats:{hp:10000,atk:1000,def:0},elemDmg:{}};
const unit=(id,side,speed,extra={})=>({id,name:id,side,level:80,panel:{...structuredClone(panel),speed},element:'Physical',energyMax:100,energy:0,
  actions:{basic:{name:'普攻',type:'Normal',element:'Physical',target:'single',terms:[{scaling:'atk',multiplier:1}],toughness:10,hitEnergy:0}},
  policy:{basicOnly:true,autoUltimate:false},...extra});
const config=units=>({strict:false,sp:3,maxSP:5,maxAV:200,critMode:'noncrit',seed:1,units});
const control=(source,extra={})=>({type:'marker',name:'支配',key:'charm',value:0,source,id:source+':charm',remaining:2,tickOwner:'controlled',tickAt:'end',control:'charm',...extra});

{
  const controlled=unit('controlled','ally',1,{toughnessMax:10,weaknesses:['Physical'],standardBreak:true,rank:'elite'});
  const breaker=unit('breaker','ally',200);
  const controller=unit('controller','enemy',1,{toughnessMax:10,weaknesses:['Physical'],standardBreak:true,rank:'elite'});
  const b=createBattle(config([controlled,breaker,controller]));
  const target=b.units.find(u=>u.id==='controlled');
  target.buffs.push(control('controller',{removeOnSourceBreak:true}));
  stepBattle(b);
  assert.ok(b.units.find(u=>u.id==='controller').broken,'the controller should be broken by the allied hit');
  assert.equal(target.buffs.some(e=>e.control==='charm'),false,'breaking the control source should remove its control effect');
  assert.ok(b.log.some(e=>e.type==='mechanic'&&e.name==='控制状态解除'&&e.reason==='source_break'));
}

{
  const controlled=unit('controlled','ally',1,{toughnessMax:10,weaknesses:['Physical'],standardBreak:true,rank:'elite'});
  const controller=unit('controller','enemy',200);
  const b=createBattle(config([controlled,controller]));
  const target=b.units.find(u=>u.id==='controlled');
  target.buffs.push(control('controller',{removeOnBreak:true}));
  stepBattle(b);
  assert.ok(target.broken,'the controlled character should be broken by the enemy hit');
  assert.equal(target.buffs.some(e=>e.control==='charm'),false,'breaking the control owner should remove its control effect');
}

{
  const controlled=unit('controlled','ally',200,{energy:100,policy:{basicOnly:true,autoUltimate:true},actions:{
    basic:{name:'普攻',type:'Normal',element:'Physical',target:'single',terms:[{scaling:'atk',multiplier:1}],hitEnergy:0},
    ultimate:{name:'终结技',type:'Ultra',element:'Physical',target:'single',terms:[{scaling:'atk',multiplier:1}],energyCost:100,hitEnergy:0},
  }});
  const enemy=unit('enemy','enemy',1);
  const b=createBattle(config([controlled,enemy]));
  b.units.find(u=>u.id==='controlled').buffs.push(control('enemy',{noUltimate:true}));
  stepBattle(b);
  assert.equal(b.log.some(e=>e.type==='action'&&e.actor==='controlled'&&e.key==='ultimate'),false,'control should block automatic ultimate insertion');
}

{
  const controlled=unit('controlled','ally',200);
  const support=unit('support','ally',1);
  const other=unit('other','ally',1);
  support.panel.atk=2000;other.panel.atk=3000;
  const enemy=unit('enemy','enemy',1);
  const b=createBattle(config([controlled,support,other,enemy]));
  b.units.find(u=>u.id==='controlled').buffs.push(control('enemy',{
    noUltimate:true,charmDamagePercent:2.5,minDamageRatio:.5,maxDamageRatio:1.5,
  }));
  stepBattle(b);
  const action=b.log.find(e=>e.type==='action'&&e.actor==='controlled');
  const damage=b.log.find(e=>e.type==='damage'&&e.actor==='controlled');
  assert.equal(action.kind,'followup','CharmUseSkill should resolve as an inserted follow-up action');
  assert.ok(['support','other'].includes(damage.target),'the forced attack must target another ally');
  assert.equal(damage.damage,3750,'damage should use 2.5x attack scaled by the sourced 1.5 upper ratio clamp');
  assert.equal(b.sp,3,'the forced attack must not spend skill points');
  assert.equal(b.units.find(u=>u.id==='controlled').energy,0,'the forced attack must not generate actor energy');
  assert.ok(b.log.some(e=>e.type==='mechanic'&&e.name==='CharmUseSkill · 同伴攻击'&&e.target===damage.target));
}

{
  const controlled=unit('controlled','ally',200),support=unit('support','ally',1),other=unit('other','ally',1),enemy=unit('enemy','enemy',1);
  controlled.panel.atk=5000;support.panel.atk=1000;other.panel.atk=1000;
  const b=createBattle(config([controlled,support,other,enemy]));
  b.units.find(u=>u.id==='controlled').buffs.push(control('enemy',{
    noUltimate:true,charmDamagePercent:2.5,minDamageRatio:.5,maxDamageRatio:1.5,
  }));
  stepBattle(b);
  const damage=b.log.find(e=>e.type==='damage'&&e.actor==='controlled');
  assert.equal(damage.damage,6250,'damage should use the sourced 0.5 lower ratio clamp for a high-ATK controlled actor');
}

{
  const attacker=unit('attacker','ally',100);
  const controller=unit('controller','enemy',1);
  const b=createBattle(config([attacker,controller]));
  const target=b.units.find(u=>u.id==='attacker');
  target.buffs.push(control('controller',{removeOnSourceDeath:true}));
  receiveDamage(b,b.units[0],b.units[1],20000,'true');
  assert.equal(target.buffs.some(e=>e.control==='charm'),false,'a dead control source should remove its control effect');
  assert.ok(b.log.some(e=>e.type==='mechanic'&&e.name==='控制状态解除'&&e.reason==='source_death'));
}

{
  const apply=(randomValue,{effectRes=0,controlRes=0}={})=>{
    const controlled=unit('controlled','ally',1);
    controlled.panel.effectRes=effectRes;controlled.controlRes=controlRes;
    const support=unit('support','ally',1);
    const controller=unit('controller','enemy',200,{actions:{basic:{name:'支配',type:'Normal',target:'single',terms:[],effects:[
      {type:'buff',name:'支配',key:'dmgBoost',value:0,duration:1,chance:.5,control:'charm',noUltimate:true,actionAdvance:true,
        charmDamagePercent:2.5,minDamageRatio:.5,maxDamageRatio:1.5,removeOnBreak:true,removeOnSourceBreak:true,removeOnSourceDeath:true},
    ]}}});
    const b=createBattle(config([controlled,support,controller]));let randomCalls=0;
    b.random=()=>{randomCalls++;return randomValue;};stepBattle(b);
    return {b,randomCalls,target:b.units.find(u=>u.id==='controlled')};
  };
  const resisted=apply(.4,{effectRes:.2,controlRes:.2});
  assert.equal(resisted.target.buffs.some(e=>e.control==='charm'),false);
  const resistEvent=resisted.b.log.find(e=>e.type==='resist');
  assert.ok(Math.abs(resistEvent.chance-.32)<1e-12,'base chance must include effect hit/resistance and control resistance');
  const applied=apply(.25,{effectRes:.2,controlRes:.2});
  assert.ok(applied.target.buffs.some(e=>e.control==='charm'&&e.noUltimate===true));
  assert.equal(applied.target.distance,0,'the sourced action-delay modifier should bring the charmed turn forward immediately');
  stepBattle(applied.b);
  assert.ok(applied.b.log.some(e=>e.type==='action'&&e.actor==='controlled'&&e.kind==='followup'));
  assert.ok(applied.b.log.some(e=>e.type==='damage'&&e.actor==='controlled'&&e.target==='support'));
  const immune=apply(.4,{effectRes:.2,controlRes:1});
  assert.equal(immune.target.buffs.some(e=>e.control==='charm'),false);
  assert.equal(immune.randomCalls,1,'complete control immunity must not consume a second random draw');
  assert.ok(immune.target.distance>0,'a resisted control must not advance the target');
}

console.log('enemy control lifecycle: 7 cases passed');
