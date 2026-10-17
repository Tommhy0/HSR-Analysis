// DeepSeek 隔离副本第2批（返工）：阮•梅 / 知更鸟 遗留缺口的机制测试。
// 覆盖：专属光锥 23019 / 23026 的真实条件与计时、逐波次事件、协奏倒计时跨波次、
// 残梅绽与冻结/解冻/恢复韧性的先后顺序、E6 与固定暴击边界、天赋速度缺口。
// 所有期望值都从 4.6 编译出的 kit 参数推导，不写死倍率。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createContext} from '../core/ctx.mjs';
import {newBattleBuild,buildBattleActor} from '../simulator/builds.mjs';
import {createBattle,stepBattle,simulateBattle,validateBattle,combatPanel,ACTION_DISTANCE} from '../simulator/engine.mjs';
import {validateKitActor} from '../simulator/kits.mjs';
import {BREAK_BASE} from '../simulator/game-data.mjs';
const data=JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url))),ctx=createContext(data);
const copy=x=>structuredClone(x),near=(a,b,m=1e-6)=>assert.ok(Math.abs(a-b)<m,`${a} != ${b}`);
const panel=()=>({hp:10000,atk:1000,def:1000,speed:100,critRate:.5,critDmg:1,energyRegen:1,effectHit:0,effectRes:0,breakEffect:0,baseStats:{hp:1000,atk:1000,def:1000},elemDmg:{}});
const actor=(id,extra={})=>{const a=buildBattleActor(ctx,{...newBattleBuild(),characterId:id,relicAuto:false,panel:panel(),...extra});a.energy=0;a.policy={...a.policy,autoUltimate:false};return a;};
const enemy=(extra={})=>({id:'enemy',name:'规则训练敌人',side:'enemy',level:90,element:'Physical',panel:{...panel(),hp:1e9,speed:1},energy:0,energyMax:0,res:{},actions:{basic:{name:'测试攻击',type:'Normal',terms:[{scaling:'atk',multiplier:1}],hitEnergy:10}},policy:{autoUltimate:false,basicOnly:true},...extra});
const config=(units,maxAV=201,sp=3)=>({strict:true,maxAV,sp,maxSP:9,seed:42,critMode:'noncrit',units:[...units,enemy()]});
const breakable=(c,toughnessMax=30,weaknesses=['Physical'])=>{const e=c.units.at(-1);Object.assign(e,{standardBreak:true,rank:'elite',toughnessMax,weaknesses,panel:{...e.panel,speed:100}});return e;};
const stepUntil=(b,fn,limit=40)=>{for(let i=0;i<limit&&!fn();i++)if(!stepBattle(b))break;return fn();};
let passed=0,failed=0;const test=(name,fn)=>{try{fn();passed++;console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+'\n'+e.stack);}};

test('镜中故我 23019 S1～S5：装备者击破特攻提高、终结技后全队增伤 3 回合、击破特攻达标返还 1 战技点',()=>{
  for(const superimpose of [1,3,5]){
    const rm=actor(1303,{lightconeId:23019,superimpose});rm.panel.speed=1;
    const ar=actor(1015);ar.panel.speed=1;
    const b=createBattle(config([rm,ar])),u=b.units[0],p=u.gear.cone.p,trail=u.kit.trace[1]?.[0]??0;
    near(combatPanel(u).breakEffect,p[0]+trail);
    assert.ok(combatPanel(u).breakEffect<p[3],'S1～S5 单靠光锥与行迹不应达到返还阈值');
    const spBefore=b.sp;
    b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[b.units[1]],[]);
    const ally=b.units[1].buffs.find(e=>e.name==='镜中故我 · 增伤');
    assert.ok(ally,'终结技后未给全队增伤');near(ally.value,p[1]);assert.equal(ally.remaining,p[2]);
    assert.equal(ally.tickOwner,u.id,'光锥增伤应在装备者回合计时');
    assert.equal(b.sp,spBefore,'击破特攻未达阈值时不应返还战技点');
    // 额外击破特攻让装备者达到阈值后返还 1 点。
    u.panel.breakEffect=p[3]-p[0]-trail+1e-6;
    b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[b.units[1]],[]);
    assert.equal(b.sp,spBefore+1);
  }
});

test('镜中故我每波次开始为我方全体恢复能量，同类技能不重复生效',()=>{
  const rm=actor(1303,{lightconeId:23019});const ar=actor(1015,{lightconeId:23019});
  const b=createBattle(config([rm,ar])),p=b.units[0].gear.cone.p;
  near(b.units[0].energy,p[4]);near(b.units[1].energy,p[4]);
  assert.ok(b.units[1].energy<2*p[4],'同类波次回能重复生效');
});

test('夜色流光溢彩 23026：我方每次攻击叠 1 层歌咏（上限 5）、施放终结技时转为华彩',()=>{
  const sp=actor(1306,{lightconeId:23026});sp.panel.speed=1;
  const ar=actor(1015);ar.panel.speed=1;
  const b=createBattle(config([sp,ar])),u=b.units[0],a=b.units[1],en=b.units.at(-1),p=u.gear.cone.p;
  const base=combatPanel(u).atk;
  near(combatPanel(u).energyRegen,1);
  for(let i=0;i<7;i++)b.rules.after(b,a,'basic','normal',a.actions.basic,[en],[en]);
  const verse=u.buffs.find(e=>e.id==='cone:23026:regen');
  assert.equal(verse.stacks,p[1],'歌咏层数未封顶');
  near(combatPanel(u).energyRegen,1+p[0]*p[1]);
  b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[a],[]);
  assert.ok(!u.buffs.some(e=>e.id==='cone:23026:regen'),'终结技后未移除歌咏');
  near(combatPanel(u).energyRegen,1);
  assert.ok(u.buffs.some(e=>e.id==='cone:23026:atk'),'未获得华彩攻击');
  near(combatPanel(u).atk,base+(u.panel.baseStats?.atk??0)*p[3]);
  const team=a.buffs.find(e=>e.id==='cone:23026:dmgBoost');
  near(team.value,p[2]);assert.equal(team.remaining,p[4]);
});

test('知更鸟秘技回能在每个波次开始时各结算一次（含第 1 波）',()=>{
  const ro=actor(1309,{technique:true});ro.policy={...ro.policy,basicOnly:true};
  const killer=actor(1015);killer.panel.atk=1e9;killer.panel.speed=300;killer.panel.critRate=1;killer.policy.basicOnly=true;
  const c={strict:true,maxAV:600,sp:3,maxSP:9,seed:7,critMode:'crit',units:[ro,killer,enemy({id:'w1',wave:1,panel:{...panel(),hp:10,speed:1}}),enemy({id:'w2',wave:2,panel:{...panel(),hp:10,speed:1}})]};
  const b=createBattle(c);
  near(b.units[0].energy,ro.kit.params.Maze[1]);
  const r=simulateBattle(c);
  assert.ok(r.log.some(e=>e.type==='wave_start'),'未进入第二波');
  const five=r.log.filter(e=>e.type==='energy'&&e.actor===ro.id&&Math.abs(e.amount-ro.kit.params.Maze[1])<1e-9);
  assert.equal(five.length,2,'秘技回能不是每波次各一次');
});

test('协奏倒计时跨波次：非连续模式换波重置行动值，连续模式保留倒计时进度',()=>{
  for(const [waveMode,expectReset] of [[undefined,true],['moc',true],['continuous',false]]){
    const ro=actor(1309);ro.panel.speed=1;ro.policy={...ro.policy,basicOnly:true};
    const killer=actor(1015);killer.panel.speed=200;
    const c={strict:true,maxAV:600,sp:3,maxSP:9,seed:11,critMode:'noncrit',waveMode,units:[ro,killer,enemy({id:'w1',wave:1,panel:{...panel(),hp:1e9,speed:1}}),enemy({id:'w2',wave:2,panel:{...panel(),hp:1e9,speed:1000}})]};
    const b=createBattle(c),roU=b.units[0];
    b.rules.after(b,roU,'ultimate','ultimate',roU.actions.ultimate,[roU],[]);
    const summon=b.summons.find(s=>s.kind==='countdown');assert.ok(summon,'未生成协奏倒计时');
    assert.equal(summon.speed,roU.kit.params.Ultra[1]);
    summon.distance=4000;
    b.units.find(u=>u.id==='w1').hp=0;                      // 直接结束第一波
    stepBattle(b);
    assert.equal(b.wave,2);
    // wave_start 快照记录的是换波瞬间（行动值与倒计时都已按模式处理）的状态。
    const start=b.log.find(e=>e.type==='wave_start'&&e.wave===2);
    const snap=start.frame.summons.find(s=>s.kind==='countdown');
    assert.ok(snap,'wave_start 快照缺少协奏倒计时');
    assert.equal(snap.distance,expectReset?ACTION_DISTANCE:4000,waveMode+' 换波倒计时处理不符');
    const roSnap=start.frame.units.find(u=>u.id===roU.id);
    assert.ok(roSnap.buffs.some(e=>e.tag==='robinConcerto'),'换波后协奏被意外清除');
    assert.ok(roSnap.cannotAct,'换波后知更鸟应保持无法行动');
  }
});

test('残梅绽与冻结顺序：解冻回合不尝试恢复韧性，因此不消耗残梅绽',()=>{
  const rm=actor(1303);rm.panel.speed=200;rm.policy={...rm.policy,basicOnly:true};
  const c=config([rm],900);breakable(c,30,['Ice']);
  const b=createBattle(c),rmU=b.units[0],e=b.units.at(-1);
  b.rules.after(b,rmU,'ultimate','ultimate',rmU.actions.ultimate,[rmU],[]);   // 展开结界
  assert.ok(stepUntil(b,()=>b.log.some(x=>x.type==='break')),'未能击破冰弱点');
  assert.ok(e.buffs.some(x=>x.tag==='ruanMeiImprint'),'破韧后未附加残梅绽');
  const at=b.log.length;
  assert.ok(stepUntil(b,()=>b.log.slice(at).some(x=>x.type==='skip'&&x.name==='冻结 · 解冻回合')),'未进入解冻回合');
  assert.ok(!b.log.slice(at).some(x=>x.type==='resource'&&x.name==='弱点击破恢复被延长'),'解冻回合错误触发了残梅绽');
  assert.ok(e.buffs.some(x=>x.tag==='ruanMeiImprint'),'解冻回合提前消耗了残梅绽');
  assert.ok(e.broken,'解冻回合不应恢复韧性');
});

test('残梅绽与恢复顺序：真正尝试恢复时延长击破，之后一次才解除锁定并复原韧性',()=>{
  const rm=actor(1303);rm.panel.speed=200;rm.policy={...rm.policy,basicOnly:true};
  const c=config([rm],900);breakable(c,30,['Ice']);
  const b=createBattle(c),rmU=b.units[0],e=b.units.at(-1);
  b.rules.after(b,rmU,'ultimate','ultimate',rmU.actions.ultimate,[rmU],[]);
  assert.ok(stepUntil(b,()=>b.log.some(x=>x.type==='break')));
  const be=combatPanel(rmU).breakEffect??0,ratio=be*rmU.kit.params.Ultra[2]+rmU.kit.params.Ultra[3];
  const at=b.log.length;
  assert.ok(stepUntil(b,()=>b.log.slice(at).some(x=>x.type==='delay'&&x.actor===e.id&&Math.abs(x.ratio-ratio)<1e-9)),'恢复时未触发残梅绽');
  assert.ok(e.broken,'残梅绽未延长弱点击破');
  assert.ok(!e.buffs.some(x=>x.tag==='ruanMeiImprint'),'残梅绽未消耗');
  const want=BREAK_BASE[80]*(1+be)*(.5+30/120)*rmU.kit.params.Ultra[4];
  const imp=b.log.slice(at).find(x=>x.type==='damage'&&x.kind==='break_dot'&&x.actor===rmU.id&&Math.abs(x.formula.find(z=>z.zone==='base').value-want)<1e-6);
  assert.ok(imp,'残梅绽未造成 50% 冰属性击破伤害');
  near(imp.formula.find(z=>z.zone==='base').value,want);
  assert.equal(e.resources['残梅绽锁定'],1,'延长期间不应解除不可重复附加限制');
  assert.ok(stepUntil(b,()=>!e.broken),'未能最终恢复');
  assert.equal(e.resources['残梅绽锁定'],0,'恢复后未解除不可重复附加限制');
});

test('阮•梅天赋「分型的螺旋」：除自身外队友速度提高，自身不受影响',()=>{
  const rm=actor(1303);const ar=actor(1015);
  const b=createBattle(config([rm,ar])),u=b.units[0],to=b.units[1];
  assert.ok(!u.buffs.some(e=>e.name==='分型的螺旋 · 速度'),'阮•梅不应给自己加速度');
  assert.ok(to.buffs.some(e=>e.name==='分型的螺旋 · 速度'),'队友未获得速度增益');
  near(combatPanel(to).speed,to.panel.speed+(to.baseSpeed??to.panel.speed)*u.kit.params.Talent[0]);
  near(combatPanel(u).speed,u.panel.speed);
});

test('知更鸟 E6 每次施放终结技重置 8 次计数，第 9 次回落固定暴伤',()=>{
  const ro=actor(1309,{eidolon:6});ro.panel.speed=1;
  const ar=actor(1015);ar.panel.speed=1;
  const b=createBattle(config([ro,ar])),u=b.units[0],a=b.units[1],en=b.units.at(-1),p=u.kit.params;
  const run=()=>{for(let i=0;i<9;i++)b.rules.after(b,a,'basic','normal',a.actions.basic,[en],[en]);};
  b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[a],[]);run();
  b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[a],[]);run();
  const add=b.log.filter(e=>e.type==='damage'&&e.kind==='additional'&&e.actor===u.id);
  assert.equal(add.length,18);
  const crit=add.map(e=>e.formula.find(z=>z.zone==='crit').value);
  for(let cycle=0;cycle<2;cycle++){
    for(let i=0;i<u.kit.ranks[6][0];i++)near(crit[cycle*9+i],1+p.Ultra[5]+u.kit.ranks[6][1]);
    near(crit[cycle*9+8],1+p.Ultra[5]);
  }
  // 计数按「每次施放终结技」重置，因此两轮各为 9 次。
  assert.equal(u.resources['协奏触发次数'],9);
});

test('冻结持续伤害不再冒充弱点击破：解冻回合不会重复触发阮•梅天赋',()=>{
  const rm=actor(1303);rm.panel.speed=200;rm.policy={...rm.policy,basicOnly:true};
  const c=config([rm],900);breakable(c,30,['Ice']);
  const b=createBattle(c),rmU=b.units[0],e=b.units.at(-1);
  b.rules.after(b,rmU,'ultimate','ultimate',rmU.actions.ultimate,[rmU],[]);
  assert.ok(stepUntil(b,()=>b.log.some(x=>x.type==='break')));
  const be=combatPanel(rmU).breakEffect??0;
  const talentBase=BREAK_BASE[80]*(1+be)*(.5+30/120)*rmU.kit.params.Talent[1];
  const countTalent=()=>b.log.filter(x=>x.type==='damage'&&x.kind==='break_dot'&&x.actor===rmU.id&&Math.abs(x.formula.find(z=>z.zone==='base').value-talentBase)<1e-6).length;
  assert.equal(countTalent(),1,'击破时未触发天赋');
  assert.ok(stepUntil(b,()=>b.log.some(x=>x.type==='skip'&&x.name==='冻结 · 解冻回合')),'未进入解冻回合');
  assert.equal(countTalent(),1,'解冻回合的持续伤害错误触发了天赋');
  // 冻结持续伤害沿用共用击破持续伤害模型：数值取存储的冻结 DoT 值（等级基数 × (1+击破特攻)），
  // 但 kind 必须是 break_dot，不能冒充真正的弱点击破。
  assert.ok(b.log.some(x=>x.type==='damage'&&x.kind==='break_dot'&&Math.abs(x.formula.find(z=>z.zone==='base').value-BREAK_BASE[80]*(1+be))<1e-6),'冻结持续伤害未按击破持续伤害结算');
});

test('阮•梅 / 知更鸟带专属光锥的 E0～E6 严格合同与四人混编回归',()=>{
  for(const [id,lc] of [[1303,23019],[1309,23026]])for(let eidolon=0;eidolon<=6;eidolon++){
    const a=actor(id,{eidolon,lightconeId:lc});
    assert.deepEqual(validateKitActor(a),[]);
    const ar=actor(1015,{lightconeId:23048}),s=actor(1306,{lightconeId:23021}),ce=actor(1412,{lightconeId:23048});
    a.id='focus';a.energy=a.energyMax;a.policy={...a.policy,autoUltimate:true,allyTargetId:ar.id};
    s.policy.allyTargetId=ar.id;ce.policy.allyTargetId=ar.id;
    const c={strict:true,maxAV:260,sp:3,maxSP:9,seed:3,critMode:'expected',requiredAllies:4,units:[a,s,ar,ce,enemy()]};
    assert.deepEqual(validateBattle(c),[]);
    const r=simulateBattle(c);
    assert.ok(r.damage>0);assert.deepEqual(r.unsupported,[]);
  }
});

test('协奏倒计时与残梅绽在固定种子下可回放，两次模拟逐事件一致',()=>{
  const build=()=>{
    const rm=actor(1303,{lightconeId:23019}),ro=actor(1309,{eidolon:2,lightconeId:23026});
    rm.panel.speed=180;ro.panel.speed=120;ro.energy=ro.energyMax;ro.policy={...ro.policy,autoUltimate:true};
    const c=config([rm,ro],300);breakable(c,30,['Ice']);return c;
  };
  const a=simulateBattle(build()),b=simulateBattle(build());
  assert.equal(a.log.length,b.log.length);
  assert.deepEqual(a.log.map(e=>[e.type,e.actor,e.av]),b.log.map(e=>[e.type,e.actor,e.av]));
  assert.ok(a.log.some(e=>e.type==='summon_turn'));
});

console.log(`DeepSeek batch02 repair checks: ${passed} passed, ${failed} failed.`);if(failed)process.exitCode=1;
