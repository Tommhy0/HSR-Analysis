// 姬子•启行（1510）同行协议：151025 裁决 / 151026 歼破。
// 来源：hsr_core 4.6 技能文本与 params（等级15），社区攻略确认触发逻辑。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createContext} from '../core/ctx.mjs';
import {newBattleBuild,buildBattleActor} from '../simulator/builds.mjs';
import {createBattle as rawCreateBattle,stepBattle,validateBattle} from '../simulator/engine.mjs';
import {KNOWN_MECHANICS_GAPS} from '../simulator/mechanics-status.mjs';
import {partialMechanicsFixture} from './partial-mechanics-fixtures.mjs';
import {ROSTER_DATA} from '../simulator/roster-data.mjs';
const data=JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url))),ctx=createContext(data);
const createBattle=c=>rawCreateBattle(partialMechanicsFixture(c));
const near=(a,b,m=1e-9,msg)=>{if(typeof m!=='number'){msg=m;m=1e-9;}assert.ok(Math.abs(a-b)<m,`${a} != ${b}${msg?' ('+msg+')':''}`);};
const panel=()=>({hp:10000,atk:1000,def:1000,speed:100,critRate:.5,critDmg:1,energyRegen:1,effectHit:0,effectRes:0,breakEffect:0,baseStats:{hp:1000,atk:1000,def:1000},elemDmg:{}});
const actor=(id,extra={})=>{const a=buildBattleActor(ctx,{...newBattleBuild(),characterId:id,relicAuto:false,panel:panel(),...extra});a.energy=0;a.policy={...a.policy,autoUltimate:false};return a;};
const enemy=(extra={})=>({id:'enemy',name:'规则训练敌人',side:'enemy',level:90,element:'Physical',panel:{...panel(),hp:1e9,speed:1},energy:0,energyMax:0,res:{},
  actions:{basic:{name:'测试攻击',type:'Normal',terms:[{scaling:'atk',multiplier:1}],hitEnergy:10}},policy:{autoUltimate:false,basicOnly:true},...extra});
const mate=(extra={})=>({id:'mate',name:'测试队员',side:'ally',level:80,element:'Physical',panel:{...panel(),speed:1},energy:0,energyMax:100,
  actions:{basic:{name:'测试普攻',type:'Normal',terms:[{scaling:'atk',multiplier:1}],spGain:1,energyGain:20,toughness:30},
    ultimate:{name:'测试终结技',type:'Ultra',terms:[{scaling:'atk',multiplier:1}],energyCost:100,toughness:60}},policy:{autoUltimate:false,basicOnly:true},...extra});
const config=(units,en=null)=>({strict:true,maxAV:201,sp:3,maxSP:9,seed:42,critMode:'noncrit',units:[...units,en??enemy()]});
const enterProtocol=(b,u,key)=>b.rules.after(b,u,key,'assist',u.actions[key],[b.units.find(t=>t.side==='enemy')],[]);
let passed=0,failed=0;const test=(name,fn)=>{try{fn();passed++;console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+'\n'+e.stack);}};

test('1510 裁决：协议状态、姬子伤害+125%/终结技再+125%，2 次队友终结后免费助战',()=>{
  const b=createBattle(config([actor(1510),mate()]));
  const [u,m,en]=b.units;
  enterProtocol(b,u,'assistJuecai');
  assert.equal(u.resources['同行协议'],'juecai');
  const row=data.skills.find(s=>s.id===151025).params['15'].param_list;
  near(b.rules.modifiers(b,u,en,{type:'Normal'},'direct').dmgBoost,row[7]);
  near(b.rules.modifiers(b,u,en,{type:'Ultra'},'direct').dmgBoost,row[7]+row[9]);
  b.rules.after(b,m,'ultimate','ultimate',m.actions.ultimate,[en],[]);
  assert.equal(b.queue.filter(q=>q.actor===u.id&&q.key==='assistFree').length,0,'1 次队友终结不应触发');
  b.rules.after(b,m,'ultimate','ultimate',m.actions.ultimate,[en],[]);
  const free=b.queue.filter(q=>q.actor===u.id&&q.key==='assistFree');
  assert.equal(free.length,1,'2 次队友终结应触发一次免费助战');
  assert.equal(free[0].persistWave,true);
});

test('1510 裁决 E1：所需终结技次数减 1（1 次即触发）',()=>{
  const b=createBattle(config([actor(1510,{eidolon:1}),mate()]));
  const [u,m,en]=b.units;
  enterProtocol(b,u,'assistJuecai');
  b.rules.after(b,m,'ultimate','ultimate',m.actions.ultimate,[en],[]);
  assert.equal(b.queue.filter(q=>q.actor===u.id&&q.key==='assistFree').length,1);
});

test('1510 歼破：全队暴伤+125%、战技额外+125%，9 次命中后免费助战',()=>{
  const b=createBattle(config([actor(1510),mate()]));
  const [u,m,en]=b.units;
  enterProtocol(b,u,'assistJianpo');
  assert.equal(u.resources['同行协议'],'jianpo');
  const row=data.skills.find(s=>s.id===151026).params['15'].param_list;
  near(b.rules.modifiers(b,m,en,{type:'Normal'},'direct').critDmg,row[7]);
  near(b.rules.modifiers(b,m,en,{type:'BPSkill'},'direct').critDmg,row[7]+row[9]);
  for(let i=0;i<8;i++)b.rules.afterHit(b,m,en,{type:'Normal'},'direct',{});
  assert.equal(b.queue.filter(q=>q.actor===u.id&&q.key==='assistFree').length,0,'8 点充能不应触发');
  b.rules.afterHit(b,m,en,{type:'Normal'},'direct',{});
  assert.equal(b.queue.filter(q=>q.actor===u.id&&q.key==='assistFree').length,1,'9 点充能应触发');
});

test('1510 歼破 E1：所需充能减 3（6 点触发）',()=>{
  const b=createBattle(config([actor(1510,{eidolon:1}),mate()]));
  const [u,m,en]=b.units;
  enterProtocol(b,u,'assistJianpo');
  for(let i=0;i<6;i++)b.rules.afterHit(b,m,en,{type:'Normal'},'direct',{});
  assert.equal(b.queue.filter(q=>q.actor===u.id&&q.key==='assistFree').length,1);
});

test('1510 歼破：无消耗助战技本身不获得充能',()=>{
  const b=createBattle(config([actor(1510),mate()]));
  const [u,m,en]=b.units;
  enterProtocol(b,u,'assistJianpo');
  b.rules.afterHit(b,m,en,{type:'Normal'},'direct',{});
  const before=u.resources['协议计数'];
  b.activeAction={key:'assistFree'};
  b.rules.afterHit(b,m,en,{type:'Normal'},'direct',{});
  assert.equal(u.resources['协议计数'],before);
  b.activeAction=null;
});

test('1510 协议额外助战技每场最多 2 次，姬子终结技后刷新',()=>{
  const b=createBattle(config([actor(1510),mate()]));
  const [u,m,en]=b.units;
  enterProtocol(b,u,'assistJianpo');
  for(let i=0;i<27;i++)b.rules.afterHit(b,m,en,{type:'Normal'},'direct',{});
  assert.equal(b.queue.filter(q=>q.actor===u.id&&q.key==='assistFree').length,2,'每场最多 2 次');
  b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[],[]);
  for(let i=0;i<9;i++)b.rules.afterHit(b,m,en,{type:'Normal'},'direct',{});
  assert.equal(b.queue.filter(q=>q.actor===u.id&&q.key==='assistFree').length,3,'姬子终结技后刷新次数');
});

test('1510 已从严格阻断名单移除，四人严格校验通过',()=>{
  assert.equal(KNOWN_MECHANICS_GAPS[1510],undefined,'1510 不应再出现在严格阻断名单');
  const cfg=config([actor(1510),mate(),mate({id:'mate2'}),mate({id:'mate3'})]);
  assert.deepEqual(validateBattle(cfg),[],'1510 四人编队应通过严格校验');
});

console.log(`Himeko protocol checks: ${passed} passed, ${failed} failed.`);
if(failed)process.exitCode=1;
