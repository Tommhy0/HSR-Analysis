// 返工回归（2026-10 修复轮）：针对 Codex 独立抽样 6 项缺陷与同类模式（全局回合计数冒充角色冷却、
// 附加/相邻伤害漏削韧、增伤与易伤混用、持续伤害引爆丢失归属者面板）新增的独立边界/组合回归。
// 期望值全部对照 4.6 固定数据（hsr_core / ROSTER_DATA 的 params / trace / ranks 与原始说明文本），
// 不从 kit 同参数反推，也不改动既有断言来掩盖回归。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createContext} from '../core/ctx.mjs';
import {buildBattleActor,newBattleBuild} from '../simulator/builds.mjs';
import {createBattle,stepBattle,simulateBattle,combatPanel} from '../simulator/engine.mjs';
import {ROSTER_DATA} from '../simulator/roster-data.mjs';
const raw=JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url))),ctx=createContext(raw);
const near=(a,b,msg)=>{if(typeof b!=='number'){msg=b;b=a;}assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}${msg?' ('+msg+')':''}`);};
const panel=(atk=1000,speed=100)=>({hp:10000,atk,def:1000,speed,critRate:0,critDmg:1,energyRegen:1,effectHit:0,effectRes:0,breakEffect:0,baseStats:{hp:1000,atk,def:1000},elemDmg:{}});
const actor=(id,extra={})=>{const a=buildBattleActor(ctx,{...newBattleBuild(),characterId:id,relicAuto:false,panel:panel(),...extra});a.energy=0;a.policy={...a.policy,autoUltimate:false,basicOnly:true};return a;};
const mate=(extra={})=>({id:'mate',name:'规则队友',side:'ally',level:80,element:'Physical',panel:panel(),energy:0,energyMax:100,res:{},
  actions:{basic:{name:'测试普攻',type:'Normal',element:'Physical',terms:[{scaling:'atk',multiplier:1}],hitShares:[1],toughness:30,spGain:1,energyGain:20},
    followup:{name:'测试追击',type:'Talent',element:'Physical',terms:[{scaling:'atk',multiplier:1}],hitShares:[1],toughness:0,energyGain:0}},
  policy:{autoUltimate:false,basicOnly:true},...extra});
const enemy=(extra={})=>({id:'enemy',name:'规则训练敌人',side:'enemy',level:90,element:'Physical',panel:{...panel(),hp:1e9,speed:1},energy:0,energyMax:0,res:{},
  actions:{basic:{name:'测试攻击',type:'Normal',terms:[{scaling:'atk',multiplier:1}],hitEnergy:10}},policy:{autoUltimate:false,basicOnly:true},...extra});
const battle=(units,o={})=>createBattle({strict:true,maxAV:500,sp:o.sp??3,maxSP:9,seed:42,critMode:'noncrit',...(o.waveMode?{waveMode:o.waveMode}:{}),units:[...units,...(units.some(u=>u.side==='enemy')?[]:[enemy()])]});
const force=(b,u,key,kind='normal')=>{b.units.forEach(t=>t.distance=10000);b.summons.forEach(t=>t.distance=10000);u.distance=0;
  if(kind==='normal')u.policy={...u.policy,turnPlan:[{turn:u.turns+1,key}]};else b.queue.push({actor:u.id,key,kind,targetId:b.units.filter(t=>t.side!=='ally').at(-1)?.id});stepBattle(b);};
const dmgOf=(b,id,kind)=>b.log.filter(e=>e.type==='damage'&&(id==null||e.actor===id)&&(kind==null||e.kind===kind));
const baseOf=e=>e.formula.find(f=>f.zone==='base').value;
const zoneOf=(e,z)=>e.formula.find(f=>f.zone===z)?.value;
let passed=0,failed=0;const test=(name,fn)=>{try{fn();passed++;console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+'\n'+(e.stack??e));}};

// ── 1. 丹恒•饮月：逆鳞优先抵扣战技点 ────────────────────────────────────────
test('饮月：逆鳞优先抵扣（3 战技点 + 2 逆鳞 → 余 2 战技点 / 0 逆鳞）',()=>{
  const b=battle([actor(1213),mate()]);const u=b.units[0];
  u.resources['逆鳞']=2;
  force(b,u,'basic');
  assert.equal(u.resources['逆鳞'],0,'逆鳞应优先消耗');
  assert.equal(b.sp,2,'3-1=2 战技点应保留');
  assert.equal(dmgOf(b,u.id,'direct').length,7,'3 资源应使用盘拏耀跃 7 段');
});
test('饮月：逆鳞充足时战技点不被扣除；逆鳞不足时差额由战技点补足',()=>{
  const b=battle([actor(1213),mate()],{sp:1});const u=b.units[0];
  u.resources['逆鳞']=3;
  const p3=b.rules.prepare(b,u,'basic','normal',u.actions.basic);
  assert.equal(p3.name,u.actions.enhancedNormal3.name);assert.equal(p3.spCost,0);assert.equal(p3.scaleUsed,3,'3 逆鳞应全部抵扣 3 点消耗');
  b.sp=0;u.resources['逆鳞']=2;
  const p2=b.rules.prepare(b,u,'basic','normal',u.actions.basic);
  assert.equal(p2.name,u.actions.enhancedNormal2.name);assert.equal(p2.spCost,0);assert.equal(p2.scaleUsed,2);
});

// ── 2. 丹恒•饮月：相邻段削韧按 stance[2] 均摊 ──────────────────────────────
test('饮月：天矢阴相邻削韧 30（二级），盘拏耀跃相邻削韧 60（三级）',()=>{
  const build=sp=>{const main={...enemy({id:'main'}),weaknesses:['Imaginary'],toughnessMax:1000,rank:'normal',standardBreak:true};
    const adj={...enemy({id:'adj'}),weaknesses:['Imaginary'],toughnessMax:1000,rank:'normal',standardBreak:true};
    return battle([actor(1213),mate(),main,adj],{sp});};
  const lv2=build(2);force(lv2,lv2.units[0],'basic');
  assert.equal(lv2.units.at(-1).toughness,970,'天矢阴相邻总削韧 = stance[2]=30');
  const lv3=build(3);force(lv3,lv3.units[0],'basic');
  assert.equal(lv3.units.at(-1).toughness,940,'盘拏耀跃相邻总削韧 = stance[2]=60');
  // 与固定数据一致：相邻总削韧 = ROSTER_DATA stance[2]，而非写死 0
  assert.equal(ROSTER_DATA[1213].skills['121310'].stance[2],30);
  assert.equal(ROSTER_DATA[1213].skills['121312'].stance[2],60);
});

// ── 3. 托帕：天赋追击拉条 + 负债证明属易伤乘区 ─────────────────────────────
test('托帕：普通状态下队友追击命中负债证明目标 → 账账行动提前 50%',()=>{
  const b=battle([actor(1112),mate()]);const u=b.units[0],m=b.units[1],s=b.summons[0];
  force(b,m,'basic');
  assert.ok(b.units.at(-1).buffs.some(e=>e.tag==='topazDebt'),'需先有负债证明');
  force(b,m,'followup','followup');
  assert.equal(s.distance,5000,'Talent[2]=50% 提前：10000→5000');
});
test('托帕：解锁透支的普攻追击在未开终结时也应拉条账账',()=>{
  const b=battle([actor(1112),mate()]);const u=b.units[0],s=b.summons[0];
  force(b,u,'basic');                     // 1112101使普攻视为追击；111204基础追击拉条与涨幅无关
  assert.equal(s.distance,5000,'透支普攻满足基础天赋，10000→5000');
});
test('托帕：一次多段追击只拉条一次，账账自身回合不拉条',()=>{
  const m=mate();m.actions.followup={...m.actions.followup,hitShares:[.5,.5]};
  const b=battle([actor(1112),m]);const mm=b.units[1],s=b.summons[0];
  force(b,mm,'basic');
  const before=b.log.filter(e=>e.type==='advance'&&e.name==='账账行动提前').length;
  force(b,mm,'followup','followup');
  const adv=b.log.filter(e=>e.type==='advance'&&e.name==='账账行动提前').slice(before);
  assert.equal(adv.length,1,'一次追击无论几段都只应拉条一次');
  assert.equal(s.distance,5000,'第二段不应再扣 5000');
  const n0=b.log.filter(e=>e.type==='advance'&&e.name==='账账行动提前').length;
  b.turnActor=s.id;b.rules.summonTurn(b,b.units[0],s);b.turnActor=null;
  assert.equal(b.log.filter(e=>e.type==='advance'&&e.name==='账账行动提前').length,n0,'账账自身回合内不触发行动提前');
});
test('托帕：负债证明进入 vuln 易伤乘区且不进入 dmgBoost',()=>{
  const b=battle([actor(1112),mate()]);const u=b.units[0],m=b.units[1];
  force(b,m,'basic');force(b,m,'followup','followup');
  const hit=dmgOf(b,m.id,'followup').at(-1);
  near(zoneOf(hit,'vuln'),1+u.kit.params.BPSkill[1],'受追击伤害 +50% → vuln 1.5');
  const mod=b.rules.modifiers(b,u,b.units.at(-1),{type:'Talent',element:'Physical'},'followup');
  near(mod.vuln??0,u.kit.params.BPSkill[1]);near(mod.dmgBoost??0,0);
});

// ── 4. 卡芙卡：冷却以自身回合为准 ─────────────────────────────────────────
test('卡芙卡：全场回合推进不重置天赋冷却，自身回合才重置',()=>{
  const b=battle([actor(1005),mate(),mate({id:'mate2'})]);const u=b.units[0],m1=b.units[1],m2=b.units[2];
  b.rules.after(b,m1,'basic','normal',m1.actions.basic,[b.units.at(-1)],[b.units.at(-1)]);
  assert.equal(b.queue.filter(q=>q.actor===u.id&&q.key==='followup').length,1);
  b.queue.length=0;
  b.turns++;                              // 只有全场回合编号变化
  b.rules.after(b,m2,'basic','normal',m2.actions.basic,[b.units.at(-1)],[b.units.at(-1)]);
  assert.equal(b.queue.filter(q=>q.key==='followup').length,0,'卡芙卡未再次行动，不应重新触发');
  u.turns++;b.turns++;                    // 卡芙卡自身新回合
  b.rules.after(b,m2,'basic','normal',m2.actions.basic,[b.units.at(-1)],[b.units.at(-1)]);
  assert.equal(b.queue.filter(q=>q.key==='followup').length,1,'卡芙卡自身新回合应重置冷却');
});

// ── 5. 卡芙卡：引爆按 DoT 归属者面板结算 ───────────────────────────────────
test('卡芙卡：引爆队友持续伤害使用队友攻击力（1000 vs 3000）',()=>{
  const b=battle([actor(1005),mate()]);const u=b.units[0],m=b.units[1],en=b.units.at(-1);
  m.panel.atk=3000;
  en.dots.push({id:'external-dot',source:m.id,name:'external burn',element:'Fire',terms:[{scaling:'atk',multiplier:1}],remaining:3,tickOwner:en.id,tickAt:'end'});
  b.rules.after(b,u,'skill','normal',u.actions.skill,[en],[en]);
  const hit=dmgOf(b,m.id,'dot').at(-1);
  near(baseOf(hit),3000*1*u.kit.params.BPSkill[1],'3000×1×75% = 2250');
});
test('卡芙卡：击破持续伤害引爆按固定值（不受卡芙卡攻击力影响）',()=>{
  const b=battle([actor(1005),mate()]);const u=b.units[0],m=b.units[1],en=b.units.at(-1);
  m.panel.atk=3000;
  en.dots.push({type:'dot',id:'break-burn',name:'击破 · 灼烧',source:m.id,element:'Fire',remaining:2,tickOwner:en.id,tickAt:'end',value:1000,stacks:1,breakData:true,debuff:true});
  b.rules.after(b,u,'skill','normal',u.actions.skill,[en],[en]);
  const hit=dmgOf(b,m.id,'dot').at(-1);
  near(baseOf(hit),1000*u.kit.params.BPSkill[1],'固定值 1000×75% = 750');
});
test('卡芙卡：引爆队友 DoT 时目标身上的卡芙卡 E1 易伤仍然生效',()=>{
  const b=battle([actor(1005,{eidolon:1}),mate()]);const u=b.units[0],m=b.units[1],en=b.units.at(-1);
  m.panel.atk=3000;
  en.buffs.push({id:u.id+':kafka-e1',source:u.id,name:'卡芙卡 E1 · 持续伤害提高',key:'marker',value:0,tag:'kafkaE1',debuff:true,remaining:2,tickOwner:en.id,tickAt:'end'});
  en.dots.push({id:'external-dot',source:m.id,name:'external burn',element:'Fire',terms:[{scaling:'atk',multiplier:1}],remaining:3,tickOwner:en.id,tickAt:'end'});
  b.rules.after(b,u,'skill','normal',u.actions.skill,[en],[en]);
  const hit=dmgOf(b,m.id,'dot').at(-1);
  near(zoneOf(hit,'vuln'),1+u.kit.ranks[1][1],'E1 易伤必须对该引爆生效');
});

// ── 6. 海瑟音：盛会的泡沫引爆队友持续伤害同样按归属者结算 ──────────────────
test('海瑟音：盛会泡沫引爆队友持续伤害使用队友攻击力',()=>{
  const b=battle([actor(1410),mate()]);const u=b.units[0],m=b.units[1],en=b.units.at(-1);
  m.panel.atk=3000;
  en.dots.push({id:'external-dot',source:m.id,name:'external burn',element:'Fire',terms:[{scaling:'atk',multiplier:1}],remaining:3,tickOwner:en.id,tickAt:'end'});
  b.rules.before(b,u,'ultimate','ultimate',u.actions.ultimate,[en]);
  const hit=dmgOf(b,m.id,'dot').at(-1);
  assert.ok(hit,'盛会泡沫应引爆队友 DoT');
  near(baseOf(hit),3000*1*u.kit.trace[2][0],'3000×150% = 4500');
});

// ── 7. 同类模式：角色自身回合冷却（貊泽 / 灵砂 / 记忆开拓者） ──────────────
test('貊泽：墨毫绣衣 1 回合冷却以自身回合重置（全场回合不重置）',()=>{
  const b=battle([actor(1223),mate()]);const u=b.units[0],en=b.units.at(-1);
  b.rules.after(b,u,'talentFollowup','followup',u.actions.talentFollowup,[en],[en]);
  near(u.resources['墨毫绣衣回合'],u.turns);const sp1=b.sp;
  b.turns++;b.rules.after(b,u,'talentFollowup','followup',u.actions.talentFollowup,[en],[en]);
  assert.equal(b.sp,sp1,'全场回合推进不应重置');
  u.turns++;b.turns++;
  b.rules.after(b,u,'talentFollowup','followup',u.actions.talentFollowup,[en],[en]);
  assert.ok(b.sp>sp1,'自身新回合应可再次触发回点');
});
test('灵砂：遗爇 2 回合冷却以自身回合重置（全场回合不重置）',()=>{
  const b=battle([actor(1222),mate()]);const u=b.units[0],m=b.units[1],en=b.units.at(-1);
  b.rules.after(b,u,'skill','normal',u.actions.skill,[en],[en]);
  const s=b.summons.find(v=>v.owner===u.id);assert.ok(s&&s.active,'浮元应在场');
  m.hp=m.panel.hp*.5;
  const n0=dmgOf(b,u.id,'followup').length;
  b.rules.afterDamage(b,en,m,'direct');
  assert.ok(dmgOf(b,u.id,'followup').length>n0,'遗爇应触发');
  const n1=dmgOf(b,u.id,'followup').length;
  b.turns+=u.kit.trace[3][1];
  b.rules.afterDamage(b,en,m,'direct');
  assert.equal(dmgOf(b,u.id,'followup').length,n1,'全场回合推进不应结束冷却');
  u.turns+=u.kit.trace[3][1];b.turns=u.turns;
  b.rules.afterDamage(b,en,m,'direct');
  assert.ok(dmgOf(b,u.id,'followup').length>n1,'自身回合推进应结束冷却');
});
test('记忆开拓者：E2 回能次数在开拓者自身回合重置（全场回合不重置）',()=>{
  const own=mate();own.id='owning';
  const b=battle([actor(8007,{eidolon:2}),own,mate()]);const u=b.units[0],own2=b.units[1],en=b.units.at(-1);
  own2.memospriteOwner=own2.id;   // 视作另一名召唤者的忆灵（与 batch17 同一口径）
  u.resources['E2触发回合']=-1;u.energy=0;
  b.rules.after(b,own2,'basic','normal',own2.actions.basic,[en],[en]);
  near(u.energy,u.kit.ranks[2][0],'忆灵行动应回 8 能');
  b.turns++;u.energy=0;
  b.rules.after(b,own2,'basic','normal',own2.actions.basic,[en],[en]);
  near(u.energy,0,'全场回合推进不应重置 E2');
  u.turns++;b.turns++;u.energy=0;
  b.rules.after(b,own2,'basic','normal',own2.actions.basic,[en],[en]);
  near(u.energy,u.kit.ranks[2][0],'开拓者自身新回合应重置 E2');
});

// ── 8. 四人组合 / 多波 / 持续伤害 / 召唤 ──────────────────────────────────
test('修复角色四人混编严格战斗无未支持缺口（饮月/托帕/卡芙卡/海瑟音）',()=>{
  const units=[actor(1213),actor(1112),actor(1005),actor(1410)];
  units.forEach(u=>{u.energy=u.energyMax;});
  const r=simulateBattle({strict:true,maxAV:400,sp:3,maxSP:9,seed:9,critMode:'noncrit',requiredAllies:4,units:[...units,enemy({panel:{...panel(),hp:40000}})]});
  assert.ok(r.damage>0);
  assert.deepEqual(r.unsupported??[],[]);
});
test('多波次：持续伤害与引爆在换波后按新目标结算，无未支持缺口',()=>{
  const units=[actor(1005),actor(1410),actor(1112),actor(1213)];
  units.forEach(u=>u.energy=u.energyMax);
  const c={strict:true,maxAV:600,sp:3,maxSP:9,seed:5,critMode:'noncrit',requiredAllies:4,
    units:[...units,enemy({id:'w1',wave:1,panel:{...panel(),hp:8000,speed:1}}),enemy({id:'w2',wave:2,panel:{...panel(),hp:8000,speed:1}})]};
  const r=simulateBattle(c);
  assert.ok(r.log.some(e=>e.type==='wave_start'),'应发生换波');
  assert.deepEqual(r.unsupported??[],[]);
});

console.log(`Repair round-1 regressions: ${passed} passed, ${failed} failed.`);
if(failed)process.exitCode=1;
