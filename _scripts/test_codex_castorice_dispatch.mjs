// 1407 遐蝶强化战技实际施放路径回归测试。
// 关键事实：engine 的 useAction 在 prepare() 之后仍把原始 key（skill）传给 before/after，
// 因此强化战技（骸爪，冥龙之环拥）必须以「准备后的动作」识别，不能依赖 key==='enhancedSkill'。
// 断言的 30% / 40% / 一次性语义直接取自 140702 / 140709 / E2 公开描述，不从被改函数推导。
import assert from 'node:assert/strict';
import {ctx,dummy,force} from './codex_test_helpers.mjs';
import {newBattleBuild,buildBattleActor} from '../simulator/builds.mjs';
import {createBattle} from '../simulator/engine.mjs';

const EPS=1e-6;
const close=(a,c,msg)=>assert.ok(Math.abs(a-c)<=EPS,`${msg}: got ${a}, want ${c}`);
const panel=(hp,atk=1000)=>({hp,atk,def:1000,speed:100,baseStats:{hp,atk,def:1000},critRate:0,critDmg:1,energyRegen:1,effectHit:0,effectRes:0,breakEffect:0,elemDmg:{}});

function castorice(eidolon=0){
  // technique:true 才会触发 roster 的 entry 钩子，即真实秘技入场（消耗 40% 并召唤死龙）。
  const a=buildBattleActor(ctx,{...newBattleBuild(),characterId:1407,eidolon,level:80,technique:true,relicAuto:false,panel:panel(10000)});
  a.energy=0;a.policy={...a.policy,autoUltimate:false,basicOnly:true};return a;
}
function enemy(){
  const e=dummy('enemy','enemy');
  e.panel=panel(1e9,1);e.hp=1e9;e.toughnessMax=0;e.toughness=0;return e;
}
function makeBattle({eidolon=0,spirit=false}={}){
  const units=[castorice(eidolon),dummy('mate'),enemy()];
  if(spirit){const s=dummy('mate:spirit');s.memospriteOwner='mate';units.push(s);}
  return createBattle({strict:false,maxAV:500,sp:3,maxSP:9,seed:42,critMode:'noncrit',units});
}
const find=(b,pred)=>b.units.find(pred);
const eventsAfter=(b,index)=>b.log.slice(index);
const consumes=(b,index)=>eventsAfter(b,index).filter(e=>e.type==='hp_consume');

// ① 无死龙：普通战技仍然只扣当前生命 30%。
{
  const b=makeBattle(),u=find(b,x=>x.characterId===1407),mate=find(b,x=>x.id==='mate');
  const dragon=find(b,x=>x.memospriteOwner===u.id);
  dragon.active=false;dragon.hp=0;
  const preU=u.hp,preM=mate.hp;
  assert.ok(preU>1&&preM>1);
  const mark=b.log.length;force(b,u,'skill');
  const evs=consumes(b,mark);
  const loss=id=>evs.filter(e=>e.target===id).reduce((n,e)=>n+e.amount,0);
  close(loss(u.id),preU*0.3,'普通战技遐蝶应扣 30%');
  close(loss(mate.id),preM*0.3,'普通战技队友应扣 30%');
  assert.equal(evs.filter(e=>e.target===u.id).length,1,'普通战技只扣一次');
  console.log('PASS ① 无死龙普通战技 30%');
}

// ② 死龙在场：实际施放强化战技（key 仍为 skill）扣 40%，且每名我方单位只扣一次。
{
  const b=makeBattle(),u=find(b,x=>x.characterId===1407),mate=find(b,x=>x.id==='mate');
  const dragon=find(b,x=>x.memospriteOwner===u.id);
  assert.ok(dragon&&dragon.hp>0,'入场后死龙在场');
  const preU=u.hp,preM=mate.hp,preD=dragon.hp;
  const mark=b.log.length;force(b,u,'skill');
  const logs=eventsAfter(b,mark);
  const action=logs.find(e=>e.type==='action'&&e.actor===u.id);
  assert.equal(action.key,'skill','引擎实际传入的 key 是原始 skill');
  assert.equal(action.name,u.actions.enhancedSkill.name,'实际施放的是强化战技');
  const evs=logs.filter(e=>e.type==='hp_consume');
  const loss=id=>evs.filter(e=>e.target===id).reduce((n,e)=>n+e.amount,0);
  close(loss(u.id),preU*0.4,'强化战技遐蝶应扣 40%');
  close(loss(mate.id),preM*0.4,'强化战技队友应扣 40%');
  assert.equal(evs.filter(e=>e.target===u.id).length,1,'强化战技 40% 只扣一次');
  assert.equal(evs.filter(e=>e.target===dragon.id).length,0,'死龙不作为扣血目标');
  assert.ok(dragon.hp>=preD,'死龙生命不应因扣血下降');
  console.log('PASS ② 死龙在场强化战技 40% 且仅一次');
}

// ③ 低血保底 1：任何扣血都不会把单位扣到 1 以下。
{
  const b=makeBattle(),u=find(b,x=>x.characterId===1407),mate=find(b,x=>x.id==='mate');
  u.hp=1.5;mate.hp=1.5;
  const mark=b.log.length;force(b,u,'skill');
  const evs=consumes(b,mark);
  assert.ok(evs.length>=2,'低血时仍记录扣血');
  assert.ok(u.hp>=1-EPS&&mate.hp>=1-EPS,'扣血后生命不低于 1');
  close(u.hp,1,'低血遐蝶停在 1');
  console.log('PASS ③ 低血至少保留 1 点');
}

// ④ 「除死龙以外的我方全体」：其他队友的忆灵同样消耗，死龙不被消耗。
{
  const b=makeBattle({spirit:true}),u=find(b,x=>x.characterId===1407),mate=find(b,x=>x.id==='mate');
  const spirit=find(b,x=>x.id==='mate:spirit'),dragon=find(b,x=>x.memospriteOwner===u.id);
  assert.ok(spirit&&dragon);
  const preS=spirit.hp,preD=dragon.hp;
  const mark=b.log.length;force(b,u,'skill');
  const evs=consumes(b,mark);
  close(evs.filter(e=>e.target===spirit.id).reduce((n,e)=>n+e.amount,0),preS*0.4,'队友忆灵应扣 40%');
  assert.equal(evs.filter(e=>e.target===dragon.id).length,0,'死龙不作为扣血目标');
  assert.ok(dragon.hp>=preD);
  console.log('PASS ④ 仅排除死龙，队友忆灵同样消耗');
}

// ⑤ E2：下一次强化战技返还新蕊上限 30%，消费后第二次不再重复。
{
  const b=makeBattle({eidolon:2}),u=find(b,x=>x.characterId===1407);
  force(b,u,'summonDragon');
  const dragon=find(b,x=>x.memospriteOwner===u.id);
  assert.ok(dragon&&dragon.hp===dragon.panel.hp,'终结技召唤死龙满生命');
  close(u.resources['E2新蕊返还'],0.3,'E2 记录一次性返还 30%');
  const cap=34000; // 默认均衡等级6，原始公式固定为34000
  close(dragon.panel.hp,cap,'死龙生命上限=新蕊上限');
  dragon.hp=1000;
  let mark=b.log.length;force(b,u,'skill');
  const loss1=consumes(b,mark).reduce((n,e)=>n+e.amount,0);
  close(dragon.hp,1000+loss1+cap*0.3,'第一次强化战技消费 E2 返还 30%');
  close(u.resources['E2新蕊返还'],0,'返还额度已被消费');
  dragon.hp=1000;
  mark=b.log.length;force(b,u,'skill');
  const loss2=consumes(b,mark).reduce((n,e)=>n+e.amount,0);
  close(dragon.hp,1000+loss2,'第二次强化战技不再返还');
  close(u.resources['E2新蕊返还'],0,'返还额度保持为 0');
  console.log('PASS ⑤ E2 返还仅在下一次强化战技触发一次');
}

console.log('ALL PASS castorice skill dispatch');
