// 返工回归（repair-round2）：共享引擎缺口收口后的独立边界回归。
// 期望值全部对照 4.6 固定数据（hsr_core / ROSTER_DATA 的 params / trace / ranks 与原始说明文本），
// 不从 kit 同参数反推，也不改动既有断言来掩盖回归。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createContext} from '../core/ctx.mjs';
import {buildBattleActor,newBattleBuild} from '../simulator/builds.mjs';
import {createBattle as rawCreateBattle,stepBattle,simulateBattle as rawSimulateBattle,combatPanel} from '../simulator/engine.mjs';
import {partialMechanicsFixture} from './partial-mechanics-fixtures.mjs';
const createBattle=c=>rawCreateBattle(partialMechanicsFixture(c));
const simulateBattle=c=>rawSimulateBattle(partialMechanicsFixture(c));
import {ROSTER_DATA} from '../simulator/roster-data.mjs';
import {BREAK_BASE} from '../simulator/game-data.mjs';
const raw=JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url))),ctx=createContext(raw);
const near=(a,b,msg)=>{if(typeof b!=='number'){msg=b;b=a;}assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}${msg?' ('+msg+')':''}`);};
const panel=(atk=1000,speed=100)=>({hp:10000,atk,def:1000,speed,critRate:0,critDmg:1,energyRegen:1,effectHit:0,effectRes:0,breakEffect:0,baseStats:{hp:1000,atk,def:1000},elemDmg:{}});
const actor=(id,extra={})=>{const a=buildBattleActor(ctx,{...newBattleBuild(),characterId:id,relicAuto:false,panel:panel(),...extra});a.energy=0;a.policy={...a.policy,autoUltimate:false,basicOnly:true};return a;};
const mate=(extra={})=>({id:'mate',name:'规则队友',side:'ally',level:80,element:'Physical',panel:panel(),energy:0,energyMax:100,res:{},
  actions:{basic:{name:'测试普攻',type:'Normal',element:'Physical',terms:[{scaling:'atk',multiplier:1}],hitShares:[1],toughness:30,spGain:1,energyGain:20}},
  policy:{autoUltimate:false,basicOnly:true},...extra});
const enemy=(extra={})=>({id:'enemy',name:'规则训练敌人',side:'enemy',level:90,element:'Physical',panel:{...panel(),hp:1e9,speed:1},energy:0,energyMax:0,res:{},
  actions:{basic:{name:'测试攻击',type:'Normal',terms:[{scaling:'atk',multiplier:1}],hitEnergy:10}},policy:{autoUltimate:false,basicOnly:true},...extra});
const battle=(units,o={})=>createBattle({strict:true,maxAV:500,sp:o.sp??3,maxSP:9,seed:o.seed??42,critMode:'noncrit',units:[...units,...(units.some(u=>u.side==='enemy')?[]:[enemy()])]});
const force=(b,u,key,kind='normal')=>{b.units.forEach(t=>t.distance=10000);b.summons.forEach(t=>t.distance=10000);u.distance=0;
  if(kind==='normal')u.policy={...u.policy,turnPlan:[{turn:u.turns+1,key}]};else b.queue.push({actor:u.id,key,kind,targetId:b.units.filter(t=>t.side!=='ally').at(-1)?.id});stepBattle(b);};
const dmgOf=(b,id,kind)=>b.log.filter(e=>e.type==='damage'&&(id==null||e.actor===id)&&(kind==null||e.kind===kind));
let passed=0,failed=0;const test=(name,fn)=>{try{fn();passed++;console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+'\n'+(e.stack??e));}};

// ── 1. 溢出能量：1014 Saber / 1507 千冶•刃（施放终结技后清空并取回） ──────────
test('1014 Saber：湖之祝福积攒溢出能量，终结技后取回（上限 trace[0]=120）',()=>{
  const b=battle([actor(1014),mate()]);const u=b.units[0];
  u.energy=u.energyMax;u.resources['炉心共鸣']=1;
  force(b,u,'skill');                                   // 满能量下的所有回能（含炉心共鸣 8 点）都应积攒为溢出
  const accrued=u.energyOverflow??0;
  assert.ok(accrued>=u.kit.params.Talent[4],`应至少积攒炉心共鸣的 8 点溢出（实际 ${accrued}）`);
  force(b,u,'ultimate','ultimate');
  const restore=b.log.filter(e=>e.type==='mechanic'&&e.name==='湖之祝福 · 取回溢出能量').at(-1);
  assert.ok(restore,'终结技后应取回溢出能量');
  near(restore.amount,Math.min(120,accrued),'取回量应为积攒量与上限 120 的较小值');
  assert.equal(u.energyOverflow,0,'取回后应清空');
});
test('1014 Saber E6：溢出能量上限提高到 ranks[6][3]=200（超过总量的部分丢弃）',()=>{
  const b=battle([actor(1014,{eidolon:6}),mate()]);const u=b.units[0];
  assert.equal(ROSTER_DATA[1014].ranks[6][3],200);
  u.energy=u.energyMax;u.energyOverflow=500;
  force(b,u,'ultimate','ultimate');
  const restore=b.log.filter(e=>e.type==='mechanic'&&e.name==='湖之祝福 · 取回溢出能量').at(-1);
  near(restore.amount,200,'E6 上限 200');
});
test('1507 千冶•刃：百炼骨积攒溢出能量，终结技后取回（上限 trace[1]=80）',()=>{
  const b=battle([actor(1507),mate()]);const u=b.units[0];
  u.energy=u.energyMax;u.energyOverflow=55;
  force(b,u,'ultimate','ultimate');
  const restore=b.log.filter(e=>e.type==='mechanic'&&e.name==='百炼骨 · 取回溢出能量').at(-1);
  assert.ok(restore);near(restore.amount,55);
  assert.equal(u.energyOverflow,0);
  // 超过上限的部分丢弃
  const b2=battle([actor(1507),mate()]);const v=b2.units[0];
  v.energy=v.energyMax;v.energyOverflow=300;
  force(b2,v,'ultimate','ultimate');
  near(b2.log.filter(e=>e.type==='mechanic'&&e.name==='百炼骨 · 取回溢出能量').at(-1).amount,80);
});

// ── 2. 持续伤害类 / 控制类部分抵抗（dotRes / controlRes） ───────────────────
test('1008 阿兰：坚忍使 dotRes=50%，dot 命中率按 dotRes 折减',()=>{
  const b=battle([actor(1008),mate()]);const u=b.units[0];
  near(combatPanel(u).dotRes,0.5,'坚忍 1008102 = +50% 持续伤害抗性');
  let hits=0;const n=40;
  for(let i=0;i<n;i++)if(b.rules.dot(b,u,u,{name:'测试持续伤害',element:'Fire',chance:1,duration:3}))hits++;
  assert.ok(hits>4&&hits<36,`dotRes=0.5 时 40 次命中应显著少于全中（实际 ${hits}）`);
});
test('1213 丹恒•饮月 / 1109 虎克：修禹 / 无邪使 controlRes=35%',()=>{
  for(const id of [1213,1109]){
    const b=battle([actor(id),mate()]);const u=b.units[0];
    near(combatPanel(u).controlRes,0.35,`${id} 控制类负面抗性 +35%`);
    assert.equal(ROSTER_DATA[id].traces.find(t=>t.id===id*1000+102).params[0],0.35);
  }
});
test('部分控制抗性：controlRes=0.35 时只有一部分控制被抵抗（多随机种子）',()=>{
  let resisted=0;const n=60;
  for(let seed=1;seed<=n;seed++){
    const b=battle([actor(1109),mate()],{seed});const en=b.units.at(-1);
    en.actions.control={name:'测试控制',type:'Normal',terms:[],hitShares:[1],toughness:0,target:'enemies',
      effects:[{type:'buff',name:'测试冰封',key:'speedPct',value:-0.5,control:'freeze',duration:1,target:'enemies'}]};
    b.queue.push({actor:en.id,key:'control',kind:'followup'});stepBattle(b);
    if(b.log.some(e=>e.type==='resist'&&String(e.name).includes('抵抗控制类')))resisted++;
  }
  assert.ok(resisted>0&&resisted<n,`应同时存在抵抗与命中（实际抵抗 ${resisted}/${n}）`);
  assert.ok(resisted>=9&&resisted<=33,`35% 附近的抵抗率（实际 ${resisted}/${n}）`);
});

// ── 3. 强制嘲讽选敌（云璃 / 波提欧既有口径，补 1404 万敌 / 8003） ─────────────
test('嘲讽：敌方单攻被强制指向持有 control:taunt 的施加者',()=>{
  const b=battle([actor(1404),mate()]);const u=b.units[0],en=b.units.at(-1);
  en.buffs.push({type:'buff',id:'t',name:'嘲讽',key:'marker',value:0,remaining:3,control:'taunt',source:u.id,debuff:true});
  b.queue.push({actor:en.id,key:'basic',kind:'followup'});stepBattle(b);
  const hit=b.log.filter(e=>e.type==='damage'&&e.actor===en.id).at(-1);
  assert.equal(hit.target,u.id,'嘲讽应强制选中施加者');
});
test('1404 万敌：终结技施加的嘲讽带 control:taunt',()=>{
  const b=battle([actor(1404),mate()]);const u=b.units[0];
  u.energy=u.energyMax;
  force(b,u,'ultimate','ultimate');
  assert.ok(b.units.at(-1).buffs.some(e=>e.tag==='mydeimosTaunt'&&e.control==='taunt'),'1404 嘲讽需可被引擎识别');
});

// ── 4. 1208 符玄【穷观阵】：65% 伤害改道（护盾结算之前） ────────────────────
test('1208 符玄：队友受到 65% 伤害分摊给符玄，比例与 BPSkill[0] 一致',()=>{
  const b=battle([actor(1208),mate()]);const u=b.units[0],m=b.units[1],en=b.units.at(-1);
  force(b,u,'skill');
  assert.ok(u.buffs.some(e=>e.tag==='fuxuanArray'),'战技应开启穷观阵');
  near(u.kit.params.BPSkill[0],0.65);
  b.queue.push({actor:en.id,key:'basic',kind:'followup',targetId:m.id});stepBattle(b);
  const evs=b.log.filter(e=>e.type==='damage'&&e.actor===en.id);
  const toM=evs.filter(e=>e.target===m.id).reduce((s,e)=>s+e.hpDamage,0);
  const toU=evs.filter(e=>e.target===u.id).reduce((s,e)=>s+e.hpDamage,0);
  assert.ok(toM>0&&toU>0,'伤害应被拆分给双方');
  near(toU/(toM+toU),0.65,'65% 分摊给符玄');
});
test('1208 符玄：未开启穷观阵时不改道',()=>{
  const b=battle([actor(1208),mate()]);const u=b.units[0],m=b.units[1],en=b.units.at(-1);
  b.queue.push({actor:en.id,key:'basic',kind:'followup',targetId:m.id});stepBattle(b);
  assert.equal(b.log.filter(e=>e.type==='damage'&&e.actor===en.id).filter(e=>e.target===u.id).length,0);
});

// ── 5. 1410 海瑟音：战技「受到的伤害提高」漏实现（补 vuln） ─────────────────
test('1410 海瑟音：战技使敌方全体受到的伤害提高 20% / 3 回合（vuln 乘区）',()=>{
  const b=battle([actor(1410),mate()]);const u=b.units[0],en=b.units.at(-1);
  near(u.kit.params.BPSkill[1],1);near(u.kit.params.BPSkill[2],0.2);near(u.kit.params.BPSkill[3],3);
  force(b,u,'skill');
  const v=en.buffs.find(e=>e.key==='vuln'&&e.source===u.id);
  assert.ok(v,'战技应施加易伤');near(v.value,0.2);assert.equal(v.remaining,3);
});

// ── 6. 欢愉技倍率数据（本轮修复：ElationDamage 进入 ROSTER_DATA） ─────────────
test('欢愉技参数已进入 ROSTER_DATA，且与 4.6 AvatarSkillConfig 逐位一致',()=>{
  const elation=raw.skills.filter(s=>s.type==='ElationDamage');
  assert.equal(elation.length,10,'4.6 固定数据有 10 条欢愉技');
  for(const s of elation){
    const row=ROSTER_DATA[s.charId]?.skills?.[String(s.id)];
    assert.ok(row,'ROSTER_DATA 缺少欢愉技 '+s.id);
    assert.equal(row.type,'ElationDamage');
    for(const [level,p] of Object.entries(s.params))
      assert.deepEqual(row.params[level].param_list,p.param_list,'欢愉技 '+s.id+' L'+level+' 参数不一致');
  }
  assert.deepEqual(ROSTER_DATA[1501].skills['150120'].params['10'].param_list,[0.25,0.5,20,2]);
  assert.deepEqual(ROSTER_DATA[8009].skills['800920'].params['10'].param_list,[8,0.2,0.6]);
  assert.deepEqual(ROSTER_DATA[1513].skills['151321'].params['10'].param_list,[0.6,0.21,10,0.18]);
});
const baseOf=e=>e.formula.find(f=>f.zone==='base').value;
const elationBase=(u,mult,count=0)=>2*BREAK_BASE[u.level]*mult*(1+(combatPanel(u).elation??0))*(1+5*count/(count+240));
const clearCertifiedBangerForFormulaFixture=u=>{u.resources['好活当赏']=0;u.buffs=u.buffs.filter(e=>e.name!=='好活当赏');};
const suppressNaturalAhaForActionFixture=b=>{b.laughter.ally=0;if(b.aha)b.aha.distance=1e9;};
test('欢愉技（数据驱动）：1501 火花 150120 = 全体 50% + 20 段 25% 弹射',()=>{
  const b=battle([actor(1501),mate()]);const u=b.units[0];clearCertifiedBangerForFormulaFixture(u);suppressNaturalAhaForActionFixture(b);
  const expectedAoe=elationBase(u,0.5),expectedBounce=elationBase(u,0.25);
  const before=b.log.length;
  b.queue.push({actor:u.id,key:'elation',kind:'followup'});stepBattle(b);
  const evs=b.log.slice(before).filter(e=>e.type==='damage'&&e.actor===u.id);
  const aoe=evs.filter(e=>Math.abs(baseOf(e)-expectedAoe)<1),bounce=evs.filter(e=>Math.abs(baseOf(e)-expectedBounce)<1);
  assert.equal(aoe.length,1,'全体 1 段 50% 欢愉倍率');
  assert.equal(bounce.length,20,'#3=20 次 25% 弹射');
});
test('欢愉技（数据驱动）：8009 收尾 60% 由敌方全体均分（2 敌 → 每敌 30%）+ 8 段 20% 弹射',()=>{
  const b=battle([actor(8009),mate(),enemy(),enemy({id:'enemy2'})]);const u=b.units[0];clearCertifiedBangerForFormulaFixture(u);suppressNaturalAhaForActionFixture(b);
  const expectedAoe=elationBase(u,0.6/2),expectedBounce=elationBase(u,0.2);
  const before=b.log.length;
  b.queue.push({actor:u.id,key:'elation',kind:'followup'});stepBattle(b);
  const evs=b.log.slice(before).filter(e=>e.type==='damage'&&e.actor===u.id);
  const aoe=evs.filter(e=>Math.abs(baseOf(e)-expectedAoe)<1),bounce=evs.filter(e=>Math.abs(baseOf(e)-expectedBounce)<1);
  assert.equal(aoe.length,2,'60% 欢愉倍率均分给 2 个敌人');
  assert.equal(bounce.length,8,'#1=8 次 20% 弹射');
});

// ── 7. 四人组合 / 多波 / 受控 / 持续伤害：本轮修复角色的完整严格战斗 ──────────
test('四人混编组件试算通过（不等于严格验收）（符玄/阿兰/海瑟音/千冶•刃）',()=>{
  const units=[actor(1208),actor(1008),actor(1410),actor(1507)];
  units.forEach(u=>u.energy=u.energyMax);
  const r=simulateBattle({strict:true,maxAV:400,sp:3,maxSP:9,seed:9,critMode:'noncrit',requiredAllies:4,
    units:[...units,enemy({panel:{...panel(),hp:40000}})]});
  assert.ok(r.damage>0,'应有伤害产出');
  assert.deepEqual(r.unsupported??[],[]);
});
test('多波次：新修复角色换波后继续结算，无未支持缺口',()=>{
  const units=[actor(1208),actor(1008),actor(1109),actor(1213)];
  units.forEach(u=>u.energy=u.energyMax);
  const r=simulateBattle({strict:true,maxAV:600,sp:3,maxSP:9,seed:5,critMode:'noncrit',requiredAllies:4,
    units:[...units,enemy({id:'w1',wave:1,panel:{...panel(),hp:8000,speed:1}}),enemy({id:'w2',wave:2,panel:{...panel(),hp:8000,speed:1}})]});
  assert.ok(r.log.some(e=>e.type==='wave_start'),'应发生换波');
  assert.deepEqual(r.unsupported??[],[]);
});
test('受控：冻结单位跳过行动并在解冻回合解除，不产生未支持缺口',()=>{
  const b=battle([actor(1213),mate()]);const u=b.units[0];
  u.buffs.push({type:'buff',id:'fz',name:'冻结',key:'speedPct',value:-0.5,control:'freeze',remaining:2,tickOwner:u.id,tickAt:'end',debuff:true});
  force(b,u,'basic');
  assert.ok(b.log.some(e=>e.type==='skip'&&String(e.name).includes('冻结')),'冻结单位应被跳过并记录解冻');
  assert.ok(!u.buffs.some(e=>e.control==='freeze'),'解冻回合应移除冻结');
});
test('死亡：队友阵亡后穷观阵仍按存活队友结算，无未支持缺口',()=>{
  const b=battle([actor(1208),mate(),enemy()]);const u=b.units[0],m=b.units[1];
  force(b,u,'skill');
  m.hp=0;m.active=false;b.rules.sync(b);
  const rest=b.units.filter(t=>t.side==='ally'&&t.active!==false).length;
  assert.equal(rest,1,'仅符玄存活');
  assert.deepEqual(b.units.flatMap(t=>t.unsupported??[]),[]);
});

test('召唤：千冶•刃终结技生成无量忿怒倒计时，其回合解除结界',()=>{
  const b=battle([actor(1507),mate()]);const u=b.units[0];
  u.energy=u.energyMax;
  force(b,u,'ultimate','ultimate');
  const s=b.summons.find(x=>x.owner===u.id&&x.kind==='countdown');
  assert.ok(s,'应生成「无量忿怒 · 倒计时」召唤物');
  assert.ok(u.buffs.some(e=>e.tag==='mortaField'),'终结技应展开烬灭结界');
  b.turnActor=s.id;b.rules.dragon(b,s);b.turnActor=null;
  assert.ok(!u.buffs.some(e=>e.tag==='mortaField'),'倒计时回合应解除结界');
});

console.log(`\nrepair-round2 checks: ${passed} passed, ${failed} failed.`);
if(failed)process.exit(1);
