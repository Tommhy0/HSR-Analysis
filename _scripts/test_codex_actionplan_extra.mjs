import assert from 'node:assert/strict';
import {createBattle,stepBattle,validateBattle} from '../simulator/engine.mjs';

const panel={hp:10000,atk:100,def:100,speed:100,critRate:0,critDmg:0,energyRegen:1,baseStats:{hp:10000,atk:100,def:100},elemDmg:{}};
const ally=id=>({id,name:id,side:'ally',level:80,element:'Physical',panel:{...panel},energy:0,energyMax:100,
  policy:{autoUltimate:false,basicOnly:true},actions:{
    basic:{name:'普攻',type:'Normal',terms:[{scaling:'atk',multiplier:1}]},
    skill:{name:'战技',type:'BPSkill',spCost:1,terms:[{scaling:'atk',multiplier:2}]},
    ultimate:{name:'终结技',type:'Ultra',energyCost:100,terms:[{scaling:'atk',multiplier:3}]},
  }});
const enemy={id:'enemy',name:'测试敌人',side:'enemy',level:80,element:'Physical',panel:{...panel,speed:1},energy:0,energyMax:0,
  actions:{basic:{name:'敌方普攻',type:'Normal',terms:[{scaling:'atk',multiplier:1}]}},policy:{autoUltimate:false,basicOnly:true}};
const cfg=(sp=3)=>({strict:true,maxAV:101,sp,maxSP:5,critMode:'noncrit',seed:1,units:[ally('trigger'),ally('extra'),{...enemy,panel:{...enemy.panel}}],
  actionPlan:[{actor:'extra',key:'skill',after:{actor:'trigger',key:'basic',kind:'normal',occurrence:1}}]});
const c=cfg(),b=createBattle(c);b.units.forEach(u=>u.distance=10000);b.units[0].distance=0;
assert.deepEqual(validateBattle(c),[]);
assert.equal(stepBattle(b),true);
assert.ok(b.log.some(e=>e.type==='action'&&e.actor==='extra'&&e.key==='skill'&&e.kind==='extra'));
assert.equal(b.sp,2);
const noSp=cfg(0),dry=createBattle(noSp);dry.units.forEach(u=>u.distance=10000);dry.units[0].distance=0;
assert.throws(()=>stepBattle(dry),/录像操作轴.*战技点不足/);
const invalid=cfg();invalid.actionPlan[0].key='supportSkill';
assert.ok(validateBattle(invalid).some(e=>/须指定我方普攻、战技.*终结技/.test(e)));
console.log('Codex actionPlan extra actions: 3 passed');
