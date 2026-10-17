// 返工回归（repair-round3）：独立复核确认项的复现 / 回归 + DoT / 击破 DoT 特殊结算审计。
//
// 本文件只断言「原始公开来源」的预期值（技能 desc / 星魂 / 击破持续伤害 tick 语义），
// 不从实现参数反推，也不放宽既有断言。对应：
//   F1  1213 丹恒•饮月【亢心】应在「每段攻击后」加层（121304 desc / Avatar_DanHengIL_00_Ability.json）
//   F2  1213 E6 抗穿 20%/层应作用于整个【盘拏耀跃】，含相邻段（1213 星魂 6 desc）
//   F3  1223 貊泽行迹 1223103「【猎物】受到的追加攻击伤害提高 25%」属易伤乘区（vuln）
//   D1  1005 卡芙卡引爆击破持续伤害：应沿用 tick 的「固定值 × 层数」语义
//   D2  1410 海瑟音行迹「盛会的泡沫」引爆同理
//   D3  引爆归属施加者 + 目标身上卡芙卡 E1 易伤仍生效
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createContext} from '../core/ctx.mjs';
import {buildBattleActor,newBattleBuild} from '../simulator/builds.mjs';
import {createBattle,stepBattle} from '../simulator/engine.mjs';
import {ROSTER_DATA} from '../simulator/roster-data.mjs';
const raw=JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url))),ctx=createContext(raw);
const near=(a,b,msg)=>{if(typeof b!=='number'){msg=b;b=a;}assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}${msg?' ('+msg+')':''}`);};
const panel=(atk=1000,speed=100)=>({hp:10000,atk,def:1000,speed,critRate:0,critDmg:1,energyRegen:1,effectHit:0,effectRes:0,breakEffect:0,baseStats:{hp:1000,atk,def:1000},elemDmg:{}});
const actor=(id,extra={})=>{const a=buildBattleActor(ctx,{...newBattleBuild(),characterId:id,relicAuto:false,panel:panel(),...extra});a.energy=0;a.policy={...a.policy,autoUltimate:false,basicOnly:true};return a;};
const mate=(extra={})=>({id:'mate',name:'规则队友',side:'ally',level:80,element:'Physical',panel:panel(),energy:0,energyMax:100,res:{},
  actions:{
    basic:{name:'测试普攻',type:'Normal',element:'Physical',terms:[{scaling:'atk',multiplier:1}],hitShares:[1],toughness:30,spGain:1,energyGain:20},
    skill:{name:'测试战技',type:'BPSkill',element:'Physical',terms:[{scaling:'atk',multiplier:1}],hitShares:[1],toughness:30,spCost:1},
    followup:{name:'测试追击',type:'Talent',element:'Physical',terms:[{scaling:'atk',multiplier:1}],hitShares:[1],toughness:0},
  },
  policy:{autoUltimate:false,basicOnly:true},...extra});
const enemy=(extra={})=>({id:'enemy',name:'规则训练敌人',side:'enemy',level:90,element:'Physical',panel:{...panel(),hp:1e9,speed:1},energy:0,energyMax:0,res:{},
  actions:{basic:{name:'测试攻击',type:'Normal',terms:[{scaling:'atk',multiplier:1}],hitEnergy:10}},policy:{autoUltimate:false,basicOnly:true},...extra});
const battle=(units,o={})=>createBattle({strict:true,maxAV:500,sp:o.sp??3,maxSP:9,seed:o.seed??42,critMode:'noncrit',units:[...units,...(units.some(u=>u.side==='enemy')?[]:[enemy()])]});
const force=(b,u,key,kind='normal',targetId=null)=>{b.units.forEach(t=>t.distance=10000);b.summons.forEach(t=>t.distance=10000);u.distance=0;
  if(kind==='normal')u.policy={...u.policy,turnPlan:[{turn:u.turns+1,key,...(targetId?{targetId}:{})}]};
  else b.queue.push({actor:u.id,key,kind,targetId:targetId??b.units.filter(t=>t.side!=='ally'&&t.hp>0)[0]?.id});stepBattle(b);};
const dmg=(b,id,kind)=>b.log.filter(e=>e.type==='damage'&&(id==null||e.actor===id)&&(kind==null||e.kind===kind));
const zone=(e,z)=>e.formula.find(f=>f.zone===z)?.value;
let passed=0,failed=0;const test=(name,fn)=>{try{fn();passed++;console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+'\n'+(e.stack??e));}};

// ── F1 1213【亢心】逐段时序：第 k 段应吃 min(6,k-1) 层 ───────────────────────
test('1213 饮月【亢心】：第 k 段应为 min(6,k-1) 层（段后加层，E0 每层 10%）',()=>{
  assert.equal(ROSTER_DATA[1213].skills['121304'].params['10'].param_list[0],0.1,'亢心每层 10%');
  assert.equal(ROSTER_DATA[1213].skills['121304'].params['10'].param_list[1],6,'亢心上限 6 层');
  const b=battle([actor(1213),mate()]);const u=b.units[0];
  force(b,u,'basic');                                   // 3 战技点 → 盘拏耀跃 7 段
  const hits=dmg(b,u.id,'direct').filter(e=>e.target===b.units.at(-1).id).sort((x,y)=>(x.segment??0)-(y.segment??0));
  assert.equal(hits.length,7,'盘拏耀跃主目标 7 段');
  const actual=hits.map(e=>+zone(e,'dmgBoost').toFixed(6));
  const expected=[1,1.1,1.2,1.3,1.4,1.5,1.6];
  assert.deepEqual(actual,expected,'亢心必须在每段伤害之后加层（第 k 段 min(6,k-1) 层）');
});

// ── F2 1213 E6 抗穿作用于整个【盘拏耀跃】（含相邻段） ─────────────────────────
test('1213 饮月 E6：抗穿 20%/层作用于主目标与相邻段（含相邻包）',()=>{
  assert.equal(ROSTER_DATA[1213].ranks[6][0],0.2,'E6 抗穿 20%/层');
  const b=battle([actor(1213,{eidolon:6}),mate(),
    enemy({id:'e1',res:{Imaginary:0.4}}),enemy({id:'e2',res:{Imaginary:0.4}})],{sp:3});
  const u=b.units[0];
  u.resources['E6层数']=1;
  force(b,u,'basic');
  const evs=dmg(b,u.id,'direct');
  const main=evs.find(e=>e.target==='e1');
  const adj=evs.find(e=>e.target==='e2');
  assert.ok(main&&adj,'主目标与相邻目标都应有伤害');
  near(zone(main,'res'),0.8,'主目标 res 乘区 = 1-(0.4-0.2)');
  near(zone(adj,'res'),0.8,'相邻段同样吃到 E6 的 20% 抗穿');
  // 无 E6 层数时相邻段应恢复为 1-0.4=0.6，证明差异确实来自 E6 而非全局改动
  const b2=battle([actor(1213,{eidolon:6}),mate(),
    enemy({id:'e1',res:{Imaginary:0.4}}),enemy({id:'e2',res:{Imaginary:0.4}})],{sp:3});
  force(b2,b2.units[0],'basic');
  near(zone(dmg(b2,b2.units[0].id,'direct').find(e=>e.target==='e2'),'res'),0.6,'无 E6 层数时相邻段无穿透');
});

// ── F3 1223 貊泽行迹 1223103 属易伤乘区 ─────────────────────────────────────
test('1223 貊泽行迹「墨毫绣衣 · 受追击增伤」：25% 应进 vuln 而非 dmgBoost',()=>{
  const tr=ROSTER_DATA[1223].traces.find(t=>t.id===1223103);
  assert.ok(tr&&Math.abs(tr.params[0]-0.25)<1e-9,'1223103 = 25%');
  const b=battle([actor(1223),mate(),enemy()]);const u=b.units[0],m=b.units[1],en=b.units.at(-1);
  force(b,u,'skill');                                   // 战技标记【猎物】
  assert.ok(en.buffs.some(e=>e.tag==='mozePrey'),'战技应标记【猎物】');
  force(b,m,'followup','followup',en.id);               // 队友追击命中【猎物】
  const hit=dmg(b,m.id,'followup').at(-1);
  assert.ok(hit,'队友追击应产生伤害');
  assert.equal(zone(hit,'vuln'),1.25,'「受到的追加攻击伤害提高」属易伤乘区');
  assert.equal(zone(hit,'dmgBoost'),1,'不应混入增伤乘区');
});

// ── D1 1005 卡芙卡引爆击破持续伤害：固定值 × 层数 × 75% ──────────────────────
test('1005 卡芙卡：引爆击破持续伤害（风化 3 层）应按 tick 语义 value×层数×75%',()=>{
  const b=battle([actor(1005),mate(),enemy()]);const u=b.units[0],m=b.units[1],en=b.units.at(-1);
  en.rank='normal';en.toughnessMax=1000;
  en.dots.push({type:'dot',id:'break-wind',name:'击破 · 风化',source:m.id,element:'Wind',value:1000,stacks:3,
    remaining:2,tickOwner:en.id,tickAt:'end',appliedTurn:en.turns,breakData:true,debuff:true});
  force(b,u,'skill');                                   // 战技引爆全部持续伤害
  const det=dmg(b,m.id,'dot')[0];
  assert.ok(det,'应产生归属施加者的引爆伤害');
  near(zone(det,'base'),1000*3*0.75,'击破 DoT 固定值须乘层数（与 breaks.tick 一致）');
  assert.equal(det.actor,m.id,'引爆伤害归属 DoT 施加者');
});

// ── D2 1410 海瑟音「盛会的泡沫」引爆击破 DoT 同理 ───────────────────────────
test('1410 海瑟音：行迹「盛会的泡沫」引爆击破持续伤害按 value×层数×150%',()=>{
  const tr=ROSTER_DATA[1410].traces.find(t=>t.id===1410203)??ROSTER_DATA[1410].traces.find(t=>t.type===3&&t.params?.length&&Math.abs(t.params[0]-1.5)<1e-9);
  assert.ok(tr&&Math.abs(tr.params[0]-1.5)<1e-9,'盛会的泡沫 = 150%');
  const b=battle([actor(1410),mate(),enemy()]);const u=b.units[0],m=b.units[1],en=b.units.at(-1);
  en.dots.push({type:'dot',id:'break-wind',name:'击破 · 风化',source:m.id,element:'Wind',value:1000,stacks:4,
    remaining:2,tickOwner:en.id,tickAt:'end',appliedTurn:en.turns,breakData:true,debuff:true});
  u.energy=u.energyMax;
  force(b,u,'ultimate','ultimate');
  const det=dmg(b,m.id,'dot')[0];
  assert.ok(det,'终结技应引爆目标全部持续伤害');
  near(zone(det,'base'),1000*4*1.5,'击破 DoT 固定值须乘层数');
});

// ── D3 引爆时目标身上的卡芙卡 E1 易伤仍生效（不因改归属而丢失） ──────────────
test('1005 卡芙卡 E1：引爆队友 DoT 时目标身上的持续伤害易伤仍生效',()=>{
  const b=battle([actor(1005,{eidolon:1}),mate(),enemy()]);const u=b.units[0],m=b.units[1],en=b.units.at(-1);
  assert.equal(ROSTER_DATA[1005].ranks[1][1],0.3,'E1 持续伤害易伤 30%');
  en.buffs.push({type:'buff',id:u.id+':kafka-e1',name:'卡芙卡 E1 · 持续伤害提高',key:'marker',value:0,
    remaining:2,tickOwner:en.id,tickAt:'end',appliedTurn:en.turns,source:u.id,tag:'kafkaE1',debuff:true});
  en.dots.push({type:'dot',id:'mate-burn',name:'队友灼烧',source:m.id,element:'Fire',value:500,stacks:1,
    remaining:2,tickOwner:en.id,tickAt:'end',appliedTurn:en.turns,breakData:true,debuff:true});
  force(b,u,'skill');
  const det=dmg(b,m.id,'dot')[0];
  assert.ok(det);
  near(zone(det,'base'),500*0.75,'固定值 × 75%');
  near(zone(det,'vuln'),1.3,'E1 易伤属目标减益，改归属后仍应生效');
});

console.log(`\nrepair-round3 checks: ${passed} passed, ${failed} failed.`);
if(failed)process.exit(1);
