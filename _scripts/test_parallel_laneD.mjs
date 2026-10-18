// 并行车道 D：8009 / 8010 开拓者（雷 · 欢愉）的对抗校验测试。
// 来源：4.6 hsr_core 文本 + Avatar_PlayerBoy_40 / PlayerGirl_40_Ability.json。
// 覆盖被中断车道的改动与本轮新增的源确证修正：
//   1) 欢愉技 ElationSkill_Phase02 的执行顺序：LoopExecuteTaskList(8×20%) → EqualSplitInTargets(60%)；
//   2) 战技 Skill02_Phase02 的 OnStart 顺序：point08 的 +2 在战技伤害之前、BPSkill[1]=20 在之后；
//   3) Skill03_Phase02 的 E1 层数只在「目标拥有欢愉技」分支清空；
//   4) 终结技的「立即施放 1 次固定计入 20 笑点的欢愉技」是目标自身插入行动（TurnInsertAction /
//      BIKKDNAMGMG + Rank01_InsertActionSaveMark），不是 Elation_StartElationTime 发动的阿哈时刻；
//   5) 男 / 女形态同一套实现；E3 / E5 欢愉技等级边界；好活当赏持续时间按接收者文本延长。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createContext} from '../core/ctx.mjs';
import {newBattleBuild,buildBattleActor} from '../simulator/builds.mjs';
import {createBattle as rawCreateBattle,stepBattle,combatPanel,validateBattle as rawValidateBattle} from '../simulator/engine.mjs';
import {partialMechanicsFixture} from './partial-mechanics-fixtures.mjs';
import {KNOWN_MECHANICS_GAPS} from '../simulator/mechanics-status.mjs';
import {ROSTER_DATA} from '../simulator/roster-data.mjs';
import {BREAK_BASE} from '../simulator/game-data.mjs';

const data=JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url)));
const ctx=createContext(data);
const core=Object.fromEntries(data.skills.map(s=>[s.id,s]));
const createBattle=c=>{
  const b=rawCreateBattle(partialMechanicsFixture(c));
  // 与 test_deepseek_batch16 一致：组件级断言先移除战斗入场的好活当赏，避免掩盖角色自身发放。
  for(const u of b.units){
    const starts=u.buffs.filter(e=>e.source==='battle:start'&&e.tag==='punchline');
    if(!starts.length)continue;
    const removed=starts.reduce((n,e)=>n+(e.stacks??0),0);
    u.buffs=u.buffs.filter(e=>!starts.includes(e));
    u.resources['好活当赏']=Math.max(0,(u.resources['好活当赏']??0)-removed);
    if(u.resources['好活当赏']===0)delete u.resources['好活当赏'];
  }
  return b;
};
const near=(a,b,m=1e-6,msg)=>{if(typeof m!=='number'){msg=m;m=1e-6;}assert.ok(Math.abs(a-b)<m,`${a} != ${b}${msg?' ('+msg+')':''}`);};
const panel=()=>({hp:10000,atk:1000,def:1000,speed:100,critRate:.5,critDmg:1,energyRegen:1,effectHit:0,effectRes:0,breakEffect:0,baseStats:{hp:1000,atk:1000,def:1000},elemDmg:{}});
const actor=(id,extra={})=>{const a=buildBattleActor(ctx,{...newBattleBuild(),characterId:id,relicAuto:false,panel:panel(),...extra});a.energy=0;a.policy={...a.policy,autoUltimate:false};return a;};
const enemy=(extra={})=>({id:'enemy',name:'规则训练敌人',side:'enemy',level:90,element:'Physical',panel:{...panel(),hp:1e9,speed:1},energy:0,energyMax:0,res:{},
  actions:{basic:{name:'测试攻击',type:'Normal',terms:[{scaling:'atk',multiplier:1}],hitEnergy:10}},policy:{autoUltimate:false,basicOnly:true},...extra});
const mate=(extra={})=>({id:'mate',name:'测试队员',side:'ally',level:80,element:'Physical',panel:{...panel(),speed:1},energy:0,energyMax:100,
  actions:{basic:{name:'测试普攻',type:'Normal',terms:[{scaling:'atk',multiplier:1}],spGain:1,energyGain:20,toughness:30}},policy:{autoUltimate:false,basicOnly:true},...extra});
const config=(units,en=null,maxAV=201)=>({strict:true,maxAV,sp:3,maxSP:9,seed:42,critMode:'noncrit',units:[...units,en??enemy()]});
// 显式给出全部敌人时不要再补默认敌人。
const battle=units=>({strict:true,maxAV:201,sp:3,maxSP:9,seed:42,critMode:'noncrit',units});
const baseOf=ev=>ev.formula.find(f=>f.zone==='base').value;
const elationBaseOf=(u,mult,punch)=>BREAK_BASE[u.level]*2*mult*(1+(combatPanel(u).elation??0))*(1+5*punch/(punch+240));
const dmgOf=(b,id,kind)=>b.log.filter(e=>e.type==='damage'&&e.actor===id&&(kind?e.kind===kind:true));
const suppressNaturalAha=b=>{b.laughter.ally=0;if(b.aha)b.aha.distance=1e9;};
let passed=0,failed=0;
const test=(name,fn)=>{try{fn();passed++;console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+'\n'+e.stack);}};

// ── 1. 欢愉技顺序 ───────────────────────────────────────────────────────────
test('欢愉技按脚本先 8 次 20% 弹射、再结算 60% 全体均分（2 敌 → 每敌 30%）',()=>{
  for(const id of [8009,8010]){
    const b=createBattle(battle([actor(id),mate(),enemy({id:'e1'}),enemy({id:'e2'})]));
    suppressNaturalAha(b);
    const u=b.units[0];
    const before=b.log.length;
    b.queue.push({actor:u.id,key:'elation',kind:'extra',overrides:{punchlineOverride:20}});
    b.config.maxAV=0;                       // 只结算插入动作，避免后续普通回合混入伤害
    stepBattle(b);
    const evs=b.log.slice(before).filter(e=>e.type==='damage'&&e.actor===u.id&&e.attackType==='ElationDamage');
    assert.equal(evs.length,10,`${id}: 8 次弹射 + 2 次均分`);
    const bounce=elationBaseOf(u,u.actions.elation.bounceTerms[0].multiplier,20);
    const split=elationBaseOf(u,u.actions.elation.terms[0].multiplier/2,20);
    for(const ev of evs.slice(0,8))near(baseOf(ev),bounce,`${id}: 前 8 条必须是 #2=20% 弹射`);
    for(const ev of evs.slice(8))near(baseOf(ev),split,`${id}: 收尾 #3=60% 由 2 个存活敌人均分`);
    assert.notEqual(baseOf(evs[0]),baseOf(evs.at(-1)),'弹射与收尾必须是不同倍率');
  }
});

test('欢愉技收尾分母取结算时的存活敌人数（击杀后不再均分给已阵亡目标）',()=>{
  const b=createBattle(battle([actor(8009),mate(),enemy({id:'e1'}),enemy({id:'e2'})]));
  suppressNaturalAha(b);
  const u=b.units[0];
  // 直接走 prepare/after：模拟弹射结束后只剩 1 个敌人时的收尾伤害。
  const a=b.rules.prepare(b,u,'elation','extra',u.actions.elation);
  assert.deepEqual(a.terms,[],'收尾倍率从 hitShares 移到 after，避免先于弹射结算');
  near(a.elationSplit,0.6);
  b.units.find(t=>t.id==='e2').hp=0;
  b.activeAction={sequence:b.log.length,actor:u.id,name:'欢愉技',key:'elation',kind:'extra',targets:['e1']};
  const before=b.log.length;
  b.rules.after(b,u,'elation','extra',a,[],[]);
  const splits=b.log.slice(before).filter(e=>e.type==='damage'&&e.actor===u.id&&e.attackType==='ElationDamage');
  assert.equal(splits.length,1,'只对 1 个存活敌人结算收尾');
  near(baseOf(splits[0]),elationBaseOf(u,0.6,0),'单敌人时 60% 全部落在该目标');
});

// ── 2. 战技 OnStart 顺序 ────────────────────────────────────────────────────
test('战技：point08 的 +2 在伤害前发放，因此 0 好活当赏也会触发额外欢愉伤害；BPSkill[1] 在伤害后发放',()=>{
  for(const id of [8009,8010]){
    const b=createBattle(config([actor(id),mate()]));
    b.random=()=>0;
    const u=b.units[0],en=b.units.at(-1),P=u.kit.params;
    assert.equal(u.resources['好活当赏'],undefined);
    u.resources['下次战技额外好活当赏']=1;
    // 引擎在 hitShares 之前调用 before：+2 必须在 pre-hit 钩子里生效，主伤害尚未结算。
    b.rules.before(b,u,'skill','normal',u.actions.skill,[en]);
    assert.equal(dmgOf(b,u.id,'elation').length,0,`${id}: before 阶段不得已有战技伤害`);
    assert.equal(u.resources['好活当赏'],u.kit.trace[3][0],`${id}: +2 必须在战技伤害之前计入`);
    assert.equal(u.resources['下次战技额外好活当赏'],0,`${id}: 标记已在 before 消耗`);
    b.rules.after(b,u,'skill','normal',u.actions.skill,[en],[en]);
    const hits=dmgOf(b,u.id,'elation');
    assert.equal(hits.length,1,`${id}: +2 若在伤害后发放就不会触发（脚本 OnStart[3] 早于 [5]）`);
    near(baseOf(hits[0]),elationBaseOf(u,P.Talent[2],u.kit.trace[3][0]),
      `${id}: 额外欢愉伤害读取全队最高好活当赏 = 刚发放的 +2`);
    assert.equal(u.resources['好活当赏'],u.kit.trace[3][0]+P.BPSkill[1],`${id}: 共 2+20 点`);
    assert.equal(u.resources['下次战技额外好活当赏'],0,'标记已消耗');
  }
});

// ── 3. E1 边界 ──────────────────────────────────────────────────────────────
test('E1：目标拥有欢愉技才清空层数；无欢愉技的目标改为行动提前并保留层数',()=>{
  const b=createBattle(config([actor(8009,{eidolon:1}),mate()]));
  b.random=()=>0;
  const [u,m,en]=b.units,p=u.kit.params;
  for(let i=0;i<2;i++)b.rules.after(b,u,'skill','normal',u.actions.skill,[en],[en]);
  assert.equal(u.resources['E1层数'],2);
  b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[m],[m]);
  assert.equal(u.resources['E1层数'],2,'无欢愉技目标走 ModifyActionDelay，E1 层数必须保留');
  assert.ok(b.log.some(e=>e.type==='advance'&&e.actor===m.id&&Math.abs(e.ratio-p.Ultra[2])<1e-9));
  b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[u],[u]);
  assert.equal(u.resources['E1层数'],0,'目标拥有欢愉技的分支 RemoveModifier(Rank01_Count)');
});

// ── 4. 终结技插入（固定笑点 vs 自然阿哈）──────────────────────────────────
test('终结技只让指定目标插入 1 次固定 20 笑点的欢愉技，不建立阿哈时刻',()=>{
  for(const id of [8009,8010]){
    const b=createBattle(config([actor(id),actor(1501),actor(1502)]));
    const tb=b.units[0],sparxie=b.units[1],yaoguang=b.units[2];
    const aha0=b.ahaCount??0,laugh0=b.laughter.ally;
    b.rules.after(b,tb,'ultimate','ultimate',tb.actions.ultimate,[sparxie],[sparxie]);
    assert.equal(b.queue.filter(q=>q.kind==='aha').length,0,`${id}: 不是 Elation_StartElationTime`);
    assert.deepEqual(b.queue.filter(q=>q.key==='elation').map(q=>q.actor),[sparxie.id]);
    const q=b.queue.find(x=>x.key==='elation'&&x.actor===sparxie.id);
    assert.equal(q.kind,'extra');
    assert.equal(q.persistWave,true,'插放在换波后继续（OnWaveMonster / FailedTaskList）');
    assert.equal(q.overrides.punchlineOverride,tb.kit.params.Ultra[4]);
    assert.equal(b.ahaInstant??null,null);
    assert.equal(b.ahaCount??0,aha0);
    assert.equal(b.laughter.ally,laugh0+tb.kit.params.Ultra[5],'插入不消费共享笑点');
    assert.equal(yaoguang.resources['好活当赏'],undefined,'其他欢愉队友不获得好活当赏');

    b.config.maxAV=0;stepBattle(b);
    assert.equal(b.log.filter(e=>e.type==='action'&&e.actor===sparxie.id&&e.key==='elation').length,1);
    for(const u of [tb,yaoguang])
      assert.equal(b.log.filter(e=>e.type==='action'&&e.actor===u.id&&e.key==='elation').length,0,
        `${id}: ${u.name} 不得施放欢愉技`);
    const hits=dmgOf(b,sparxie.id,'elation');
    assert.ok(hits.length,'目标应产生欢愉伤害');
    // 150120：1 段 #2=50% 本体 + #1=25%×20 次弹射；整次插入都按固定 20 笑点结算。
    const rows=[...sparxie.actions.elation.terms,...sparxie.actions.elation.bounceTerms];
    for(const ev of hits){
      const ok=rows.some(t=>Math.abs(baseOf(ev)-elationBaseOf(sparxie,t.multiplier,tb.kit.params.Ultra[4]))<1e-6);
      assert.ok(ok,`${id}: ${baseOf(ev)} 必须使用固定 20 笑点（本体与弹射一致）`);
    }
    near(baseOf(hits[0]),elationBaseOf(sparxie,sparxie.actions.elation.terms[0].multiplier,tb.kit.params.Ultra[4]),
      `${id}: 插入的欢愉技按固定 20 笑点结算，而不是目标自身的好活当赏`);
    assert.equal(b.ahaInstant??null,null,'插入结束后仍不存在阿哈上下文');
  }
});

test('终结技插入不会覆盖正在进行的自然阿哈上下文',()=>{
  const b=createBattle(config([actor(8009),actor(1501)]));
  const tb=b.units[0],sparxie=b.units[1];
  const instant={id:99,natural:true,fixedPunchline:null,ending:false,participants:[sparxie.id],completed:[],deferred:[]};
  b.ahaInstant=instant;b.ahaCount=1;b.laughter.ally=40;
  b.rules.after(b,tb,'ultimate','ultimate',tb.actions.ultimate,[sparxie],[sparxie]);
  assert.equal(b.ahaInstant,instant,'插入不得替换自然阿哈上下文');
  assert.equal(b.ahaInstant.natural,true);
  assert.equal(b.ahaCount,1,'插入不增加 ahaCount');
  assert.equal(b.laughter.ally,40+tb.kit.params.Ultra[5],'共享笑点只增加终结技自身的 Ultra[5]');
});

test('「若欢愉技施放前敌方被消灭则对新入场敌方发动」：插入行动跨波保留',()=>{
  const w1=enemy({id:'w1',wave:1,panel:{...panel(),hp:1,speed:1}});w1.hp=1;
  const w2=enemy({id:'w2',wave:2,panel:{...panel(),hp:1e9,speed:1}});
  const b=createBattle(battle([actor(8009),actor(1501),w1,w2]));
  const tb=b.units[0],sparxie=b.units[1];
  b.rules.after(b,tb,'ultimate','ultimate',tb.actions.ultimate,[sparxie],[sparxie]);
  // 先让火花击杀第 1 波，插入行动随后才执行 → 必须在第 2 波的新敌人身上发动。
  b.queue.unshift({actor:sparxie.id,key:'basic',kind:'extra',targetId:'w1'});
  stepBattle(b);
  assert.equal(b.wave,2,'应先换到第 2 波');
  const hits=dmgOf(b,sparxie.id,'elation');
  assert.ok(hits.length>0,'插入的欢愉技应在新波次实际发动');
  for(const ev of hits)assert.equal(ev.target,'w2','插入的欢愉技应命中新入场的敌人');
});

// ── 5. 男 / 女形态对称 ──────────────────────────────────────────────────────
test('8009 / 8010 共用同一套欢愉技与终结技实现（倍率、段数、插入参数一致）',()=>{
  const a=actor(8009),c=actor(8010);
  assert.deepEqual(a.actions.elation.terms,c.actions.elation.terms);
  assert.deepEqual(a.actions.elation.bounceTerms,c.actions.elation.bounceTerms);
  assert.deepEqual(a.actions.elation.hitShares,c.actions.elation.hitShares);
  assert.equal(a.actions.elation.bounceCount,c.actions.elation.bounceCount);
  for(const lv of Object.keys(ROSTER_DATA[8009].skills['800920'].params))
    assert.deepEqual(ROSTER_DATA[8009].skills['800920'].params[lv].param_list,
      ROSTER_DATA[8010].skills['801020'].params[lv].param_list,`欢愉技等级 ${lv} 男女一致`);
  assert.equal(a.actions.elation.bounceCount,8);
  near(a.actions.elation.terms[0].multiplier,.6);
  near(a.actions.elation.bounceTerms[0].multiplier,.2);
});

// ── 6. 星魂边界 ────────────────────────────────────────────────────────────
test('E3 / E5 各 +1 级欢愉技（上限 15），E4 / E6 的触发窗口只在施放欢愉技时',()=>{
  const row=id=>core[id].params;
  assert.deepEqual(row(800920)['11'].param_list,[8,.21,.63]);
  assert.deepEqual(row(800920)['12'].param_list,[8,.22,.66]);
  const byEidolon=e=>actor(8009,{eidolon:e}).actions.elation;
  near(byEidolon(0).terms[0].multiplier,.6);
  near(byEidolon(3).terms[0].multiplier,.63,'E3 欢愉技等级 11');
  near(byEidolon(5).terms[0].multiplier,.66,'E5 再 +1 到 12');
  near(byEidolon(6).terms[0].multiplier,.66,'15 级封顶前 E6 不再增加等级');
  // E4 / E6 只在欢愉技施放时施加。
  const b=createBattle(config([actor(8009,{eidolon:6})]));
  const [u,en]=b.units;
  b.rules.after(b,u,'skill','normal',u.actions.skill,[en],[en]);
  assert.equal(en.buffs.some(e=>e.id===u.id+':elation-e4:'+en.id),false,'战技不触发 E4');
  assert.equal(u.buffs.some(e=>e.id===u.id+':elation-e6'),false,'战技不触发 E6');
});

// ── 7. 好活当赏持续时间边界 ────────────────────────────────────────────────
test('好活当赏按接收者文本延长：1502 point08 / 1505 E6 / 1513 天赋各 +1 回合；1503 无限',()=>{
  const remaining=(target,{unlock=true}={})=>{
    const b=createBattle(config([actor(8009),target]));
    const tb=b.units[0],to=b.units[1];
    // 解锁状态在建模之后调整，避免触发 partial fixture 的「与正式服一致」锁。
    if(!unlock)delete to.kit.trace['3'];
    b.rules.after(b,tb,'ultimate','ultimate',tb.actions.ultimate,[to],[to]);
    const batch=to.buffs.filter(e=>e.tag==='punchline'&&e.stacks>0).at(-1);
    return {remaining:batch?.remaining,b,tb,to};
  };
  near(remaining(actor(1501)).remaining,2);
  const t1502=actor(1502);
  near(remaining(t1502).remaining,2+t1502.kit.trace[3][1]);
  near(remaining(actor(1502),{unlock:false}).remaining,2,'point08 未解锁时不延长');
  const e6=actor(1505,{eidolon:6});
  near(remaining(e6).remaining,2+e6.kit.ranks[6][1]);
  near(remaining(actor(1505)).remaining,2,'E6 前不延长');
  near(remaining(actor(1513)).remaining,3);
  // 1503 真珠：【好活当赏】持续时间无限（不能落回基础 2 回合）。
  assert.equal(remaining(actor(1503)).remaining,null,'真珠的好活当赏持续时间无限');
});

test('8009/8010 已从严格阻断名单移除，四人严格校验通过',()=>{
  for(const id of [8009,8010]){
    assert.equal(KNOWN_MECHANICS_GAPS[id],undefined,id+' 不应再出现在严格阻断名单');
    const cfg=config([actor(id),mate(),mate({id:'mate2'}),mate({id:'mate3'})]);
    assert.deepEqual(rawValidateBattle(partialMechanicsFixture(cfg)),[],id+' 四人编队应通过严格校验');
  }
});

console.log(`parallel laneD checks: ${passed} passed, ${failed} failed`);
if(failed)process.exitCode=1;
