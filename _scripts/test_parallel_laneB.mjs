// Lane B 专属回归：1501 火花 / 1503 真珠 / 1505 绯英 / 1506 银狼LV.999 / 1513 砂金•戏浪。
// 每条断言都回读 4.6 编译参数（hsr_core param_list / stance）或原始 Ability 脚本的
// show_stance_list 语义，不写死倍率：
//   1) 150120 #4 → 欢愉技发放【爆点】；
//   2) 150607 → 每个波次的头号补给盲盒「固定计入 #1=99 点好活当赏」（不是直接获得 99 点资源）；
//   3) 150603 Rank02 → 只延长银狼自身的增益；
//   4) 150503 弹射段 StanceValue 动态哈希 1659254037 = show_stance_list[0] = 15；
//   5) 1503102 #2 → 真珠每个循环从行迹获得的好活当赏上限；
//   6) 150304 #3 → 真珠好活当赏持有上限；
//   7) 150608 → 全灭中断时保留剩余段数与 #5=3 次盲盒，新波次获得额外回合续放；
//   8) 150307 → 秘技把【美学底本】交给除自身外的队友并进入 2 充能【深度学习】。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createContext} from '../core/ctx.mjs';
import {newBattleBuild,buildBattleActor} from '../simulator/builds.mjs';
import {createBattle as rawCreateBattle,stepBattle,combatPanel} from '../simulator/engine.mjs';
import {partialMechanicsFixture} from './partial-mechanics-fixtures.mjs';
import {ROSTER_DATA} from '../simulator/roster-data.mjs';
import {BREAK_BASE} from '../simulator/game-data.mjs';

const data=JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url))),ctx=createContext(data);
const panel=()=>({hp:10000,atk:1000,def:1000,speed:100,critRate:.5,critDmg:1,energyRegen:1,effectHit:0,effectRes:0,breakEffect:0,baseStats:{hp:1000,atk:1000,def:1000},elemDmg:{},elation:0});
const actor=(id,extra={})=>{const a=buildBattleActor(ctx,{...newBattleBuild(),characterId:id,relicAuto:false,panel:panel(),...extra});a.energy=0;a.policy={...a.policy,autoUltimate:false};return a;};
const enemy=(extra={})=>({id:'enemy',name:'规则训练敌人',side:'enemy',level:90,element:'Physical',panel:{...panel(),hp:1e9,speed:1},energy:0,energyMax:0,res:{},
  actions:{basic:{name:'测试攻击',type:'Normal',terms:[{scaling:'atk',multiplier:1}],hitEnergy:10}},policy:{autoUltimate:false,basicOnly:true},...extra});
const weakEnemy=id=>({id,name:'规则训练敌人',side:'enemy',level:90,element:'Physical',
  panel:{...panel(),hp:1e9,speed:1},energy:0,energyMax:0,res:{},toughnessMax:1000,weaknesses:['Physical'],standardBreak:true,rank:'normal',
  actions:{basic:{name:'测试攻击',type:'Normal',terms:[{scaling:'atk',multiplier:1}],hitEnergy:10}},policy:{autoUltimate:false,basicOnly:true}});
const config=(units,maxAV=201,sp=3)=>({strict:true,maxAV,sp,maxSP:9,seed:42,critMode:'noncrit',units:[...units,enemy()]});
// 组件夹具：与 batch15 主测试同一口径，移除战斗开场写入的 certified banger，隔离角色自身机制。
const createBattle=c=>{const b=rawCreateBattle(partialMechanicsFixture(c));
  for(const u of b.units){const starts=u.buffs.filter(e=>e.source==='battle:start'&&e.tag==='punchline');
    if(!starts.length)continue;const removed=starts.reduce((n,e)=>n+(e.stacks??0),0);
    u.buffs=u.buffs.filter(e=>!starts.includes(e));u.resources['好活当赏']=Math.max(0,(u.resources['好活当赏']??0)-removed);if(u.resources['好活当赏']===0)delete u.resources['好活当赏'];
    if('能量快照'in u.resources)u.resources['能量快照']=u.energy;if('好活当赏快照'in u.resources)u.resources['好活当赏快照']=u.resources['好活当赏']??0;}
  return b;};
const near=(a,b,m=1e-6,msg)=>{if(typeof m!=='number'){msg=m;m=1e-6;}assert.ok(Math.abs(a-b)<m,`${a} != ${b}${msg?' ('+msg+')':''}`);};
const baseOf=ev=>ev.formula.find(f=>f.zone==='base').value;
const elationBaseOf=(u,mult,punch)=>BREAK_BASE[u.level]*2*mult*(1+(combatPanel(u).elation??0))*(1+5*punch/(punch+240));
const plist=(id,skillId,level)=>ROSTER_DATA[id].skills[String(skillId)].params[String(level)].param_list;
let passed=0,failed=0;const test=(name,fn)=>{try{fn();passed++;console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+'\n'+e.stack);}};

// ───────────────────────── 1501 火花 ─────────────────────────
test('火花 150120：欢愉技额外发放 #4 个【爆点】，且只在该欢愉技结算后由火花获得',()=>{
  const b=createBattle(config([actor(1501)]));b.random=()=>0;
  const [u,en]=b.units,row=plist(1501,150120,10);
  assert.equal(row[3],2,'4.6 150120 #4 应为 2');
  assert.equal(u.resources['爆点']??0,0);
  b.aha.active=false;                              // 隔离自然阿哈，只观察本次欢愉技
  b.queue.push({actor:u.id,key:'elation',kind:'extra',targetId:en.id});
  const n0=b.log.length;
  assert.equal(stepBattle(b),true);
  // 只统计这次欢愉技动作窗口内的资源记录；后续正常回合若用战技会消耗爆点抵扣战技点。
  const start=b.log.findIndex((e,i)=>i>=n0&&e.type==='action'&&e.actor===u.id&&e.key==='elation');
  const end=b.log.findIndex((e,i)=>i>start&&e.type==='action_end');
  const log=b.log.slice(start,end<0?undefined:end+1);
  assert.ok(start>=0,'欢愉技必须真实执行');
  const spent=log.filter(e=>e.type==='resource'&&e.name==='爆点').at(-1);
  assert.ok(spent,'欢愉技应记录爆点资源变化');
  assert.equal(spent.value,row[3],'欢愉技应发放 #4 个【爆点】');
  // 非该角色动作不得发放
  const other=createBattle(config([actor(1501),actor(1502)]));other.random=()=>0;
  const sx=other.units[0],yg=other.units[1];
  other.rules.after(other,yg,'elation','extra',yg.actions.elation,[],[other.units.at(-1)]);
  assert.equal(sx.resources['爆点']??0,0,'他人施放欢愉技不应给火花爆点');
});

// ───────────────────────── 1506 银狼LV.999 ─────────────────────────
test('银狼LV.999 150607：波次开始的头号补给盲盒固定计入 #1=99 点好活当赏，而不是直接获得 99 点',()=>{
  const b=createBattle(config([actor(1506,{technique:true})]));b.random=()=>0;
  const [u]=b.units,p=u.kit.params,tech=p.Maze[0];
  assert.equal(tech,99,'4.6 150607 #1 应为 99');
  assert.equal(u.resources['怪怪怪味豆'],1,'秘技应召唤怪怪怪味豆');
  assert.equal(u.resources['好活当赏']??0,0,'固定计入不是资源发放：不应直接获得 99 点好活当赏');
  assert.ok(!u.buffs.some(e=>e.tag==='punchline'),'也不应生成 99 点的好活当赏批次');
  const hits=b.log.filter(e=>e.type==='damage'&&e.kind==='elation'&&e.actor===u.id);
  assert.equal(hits.length,1,'第 1 波开始时应触发 1 次盲盒（单体敌人 1 段）');
  near(baseOf(hits[0]),elationBaseOf(u,p.Ultra[2],tech),'本次欢愉伤害必须按固定 99 点计算');
  assert.ok(b.log.some(e=>e.type==='mechanic'&&e.actor===u.id&&e.name==='怪怪怪味豆 · 波次头号补给盲盒'));
  // 对照：没有固定计入时同样的伤害会低很多，证明 override 真的生效。
  assert.ok(baseOf(hits[0])>elationBaseOf(u,p.Ultra[2],0)*2);
  // 盲盒随机到【超超超大剑】：真实伤害 = 本次总伤害值 × #5（不能拿攻击力近似，欢愉伤害不吃攻击力）。
  const total=hits.reduce((n,e)=>n+(e.damage??0),0);
  const sword=b.log.find(e=>e.type==='damage'&&e.kind==='true'&&e.actor===u.id);
  assert.ok(sword,'random()=0 应触发【超超超大剑】');
  near(sword.damage,total*p.Ultra[4],'真实伤害必须等于本盲盒实际总伤害的 #5=20%');
});

test('银狼LV.999 Rank02：进入无敌玩家只延长自身增益 1 回合，不延长队友',()=>{
  const mate=({id:'mate',name:'测试队员',side:'ally',level:80,element:'Physical',panel:{...panel(),speed:1},energy:0,energyMax:100,
    actions:{basic:{name:'测试普攻',type:'Normal',terms:[{scaling:'atk',multiplier:1}],spGain:1,energyGain:20,toughness:30}},
    policy:{autoUltimate:false,basicOnly:true}});
  for(const eidolon of [0,2]){
    const b=createBattle({strict:true,maxAV:5,sp:3,maxSP:9,seed:17,critMode:'noncrit',units:[actor(1506,{eidolon}),mate,enemy()]});
    const u=b.units[0],m=b.units[1];
    const mk=id=>({type:'buff',id,name:'探针增益',key:'critDmg',value:0,remaining:2,tickOwner:id,tickAt:'end'});
    u.buffs.push(mk(u.id));m.buffs.push(mk(m.id));
    u.buffs.push({type:'debuff',id:'probe-debuff',name:'探针减益',key:'critDmg',value:0,remaining:2,debuff:true,tickOwner:u.id,tickAt:'end'});
    u.energy=u.energyMax;
    b.rules.before(b,u,'ultimate','ultimate',u.actions.ultimate,[u]);
    const self=u.buffs.find(e=>e.id===u.id&&e.name==='探针增益'),ally=m.buffs.find(e=>e.name==='探针增益');
    assert.equal(self.remaining,eidolon>=2?3:2,'E2 应只把银狼自身的增益延长 1 回合');
    assert.equal(ally.remaining,2,'队友增益不应被银狼 E2 延长');
    assert.equal(u.buffs.find(e=>e.id==='probe-debuff').remaining,2,'自身减益不属于「增益效果」，不得被 E2 延长');
  }
});

test('银狼LV.999 E6：禁限弱点必须先于波次头号补给盲盒生效',()=>{
  const waveDamage=eidolon=>{
    const b=createBattle({strict:true,maxAV:1,sp:3,maxSP:9,seed:42,critMode:'noncrit',units:[actor(1506,{eidolon,technique:true}),enemy()]});
    b.random=()=>0;
    const [u]=b.units;
    return b.log.filter(e=>e.type==='damage'&&e.kind==='elation'&&e.actor===u.id).reduce((n,e)=>n+(e.damage??0),0);
  };
  const e5=waveDamage(5),e6=waveDamage(6);
  assert.ok(e6>e5,'E6 的 20% 抗性降低应作用于本波次的【头号补给盲盒】欢愉伤害');
});

// ───────────────────────── 1505 绯英 ─────────────────────────
test('绯英 150503：5 次随机单体弹射按 show_stance_list[0]=15 逐段削韧（主段仍为 60）',()=>{
  const b=createBattle({strict:true,maxAV:201,sp:3,maxSP:9,seed:42,critMode:'noncrit',units:[actor(1505),weakEnemy('enemy')]});
  b.random=()=>0;
  const [u,en]=b.units,stance=ROSTER_DATA[1505].skills['150503'].stance;
  assert.deepEqual(stance,[15,60,0]);
  const a=b.rules.prepare(b,u,'ultimate','ultimate',u.actions.ultimate);
  assert.equal(a.bounceToughness,stance[0],'弹射段削韧应取 stance[0]=15');
  assert.equal(a.toughness,stance[1],'主段削韧应取 stance[1]=60');
  u.energy=u.energyMax;
  b.aha.active=false;                              // 自然阿哈的欢愉技不参与削韧断言
  b.queue.push({actor:u.id,key:'ultimate',kind:'ultimate',targetId:en.id});
  const n0=b.log.length;
  assert.equal(stepBattle(b),true);
  // 只取这次终结技动作窗口内的削韧记录；窗口后的正常回合不属于本技能。
  const start=b.log.findIndex((e,i)=>i>=n0&&e.type==='action'&&e.actor===u.id&&e.key==='ultimate');
  const end=b.log.findIndex((e,i)=>i>start&&e.type==='action_end');
  assert.ok(start>=0,'终结技必须真实执行');
  const toughed=b.log.slice(start,end<0?undefined:end+1).filter(e=>e.type==='toughness'&&e.target===en.id);
  const expected=a.toughness+a.bounceCount*a.bounceToughness;
  assert.equal(toughed.length,1+a.bounceCount,'主段 + 每次弹射各记录一次削韧');
  near(1000-toughed.at(-1).value,expected,'削韧总量 = 主段 + 弹射次数×15');
  assert.ok(a.bounceCount>=1,'应至少有一次弹射');
});

// ───────────────────────── 1503 真珠 ─────────────────────────
test('真珠 1503102：我方目标回合开始累计发放的好活当赏上限为 #2=50（不是 50-5）',()=>{
  const mate=({id:'mate',name:'测试队员',side:'ally',level:80,element:'Physical',panel:{...panel(),speed:1},energy:0,energyMax:100,
    actions:{basic:{name:'测试普攻',type:'Normal',terms:[{scaling:'atk',multiplier:1}],spGain:1,energyGain:20,toughness:30}},
    policy:{autoUltimate:false,basicOnly:true}});
  const b=createBattle(config([actor(1503),mate]));b.random=()=>0;
  const [pearl,m]=b.units,T=pearl.kit.trace['2'];
  assert.deepEqual(T.slice(0,2),[5,50]);
  for(let i=0;i<12;i++)b.rules.onTurnStart(b,m);
  assert.equal(pearl.resources['好活当赏'],T[1],'12 次队友回合最多只能拿到 #2=50 点');
  assert.equal(pearl.resources['本回合已获好活当赏'],T[1]);
  // 真珠自己的回合开始重置计数。持有量已经被 #3=50 封顶，行迹本轮不会实际发放任何点数，
  // 因此「本回合已获」必须保持 0，不能被请求量提前消耗。
  b.rules.onTurnStart(b,pearl);
  assert.equal(pearl.resources['本回合已获好活当赏'],0,'真珠自己的回合开始应重置本循环额度');
  for(let i=0;i<12;i++)b.rules.onTurnStart(b,m);
  assert.equal(pearl.resources['本回合已获好活当赏'],0,'持有量封顶时没有实际获得，额度不应被消耗');
  assert.equal(pearl.resources['好活当赏'],T[1],'持有量受 150304 #3=50 上限约束，不会超过 50');
  // 消耗 20 点后重新累计：额度按实际到账量计（20 点），补满持有量后停止发放。
  pearl.resources['好活当赏']=T[1]-20;
  for(let i=0;i<12;i++)b.rules.onTurnStart(b,m);
  assert.equal(pearl.resources['本回合已获好活当赏'],20,'额度必须按 grantPunch 实际发放量累计');
  assert.equal(pearl.resources['好活当赏'],T[1],'补满后仍受 #3=50 持有上限');
});

test('真珠 VS 绯英 瞰众乐：被 #3=50 上限拦下的请求不会转化为绯英的好活当赏',()=>{
  const b=createBattle(config([actor(1503),actor(1505)]));b.random=()=>0;
  const [pearl,ev,en]=b.units;
  assert.equal(ev.kit.trace['1'][4],0.5,'1505101 #5 应为 50%');
  pearl.resources['好活当赏']=pearl.kit.params.Talent[2];
  const before=ev.resources['好活当赏']??0;
  b.rules.after(b,pearl,'skill','normal',pearl.actions.skill,[en],[en]);
  assert.equal(pearl.resources['好活当赏'],pearl.kit.params.Talent[2],'真珠不得越过 #3=50');
  assert.equal((ev.resources['好活当赏']??0)-before,0,'实际发放量为 0 时瞰众乐不应转出任何点数');
});

test('真珠 150304：好活当赏持有上限 #3=50，超出部分不发放也不生成到期批次',()=>{
  const mate=({id:'mate',name:'测试队员',side:'ally',level:80,element:'Physical',panel:{...panel(),speed:1},energy:0,energyMax:100,
    actions:{basic:{name:'测试普攻',type:'Normal',terms:[{scaling:'atk',multiplier:1}],spGain:1,energyGain:20,toughness:30}},
    policy:{autoUltimate:false,basicOnly:true}});
  const b=createBattle(config([actor(1503),mate]));b.random=()=>0;
  const [pearl,m]=b.units,P=pearl.kit.params.Talent;
  assert.equal(P[2],50);
  for(let i=0;i<5;i++)b.rules.after(b,pearl,'skill','normal',pearl.actions.skill,[m],[m]);
  assert.equal(pearl.resources['好活当赏'],P[2],'战技每次 15 点，5 次应封顶在 50');
  const stacks=pearl.buffs.filter(e=>e.tag==='punchline').reduce((n,e)=>n+(e.stacks??0),0);
  assert.equal(stacks,P[2],'到期批次总量必须与持有量一致，不能写出 75 点的批次');
  // 上限不改变抵御值口径：仍按 min(#3, 持有量)×#5 计算。
  assert.equal(Math.min(P[2],pearl.resources['好活当赏'])*P[4],P[2]*P[4]);
});

// ───────────────────────── 跨波 / 秘技补齐 ─────────────────────────
test('银狼LV.999 150608：全灭中断时保留剩余段数与盲盒次数，新波次获得额外回合续放',()=>{
  const first=enemy({id:'wave1',name:'规则训练敌人',wave:1,panel:{...panel(),hp:1,speed:1}});
  const second=enemy({id:'wave2',name:'规则训练敌人',wave:2,panel:{...panel(),hp:1e9,speed:100}});
  // maxAV=1：只结算队列与换波，不进入普攻/自然阿哈的常规回合，避免额外伤害段混入计数。
  const b=createBattle({strict:true,maxAV:1,sp:3,maxSP:9,seed:42,critMode:'noncrit',units:[actor(1506),first,second]});
  b.random=()=>0;b.laughter.ally=0;
  const [u]=b.units;
  u.resources['好活当赏']=50;                       // 触发盲盒分支，验证剩余次数跨波保留
  u.energy=u.energyMax;
  b.queue.push({actor:u.id,key:'ultimate',kind:'ultimate',targetId:u.id});
  b.queue.push({actor:u.id,key:'basic',kind:'extra',targetId:'wave1',persistWave:true});
  stepBattle(b);                                     // 队列与换波在常规回合之前结算
  assert.equal(b.wave,2,'第一波应在强化普攻全灭后换波');
  assert.equal(u.resources['强化普攻剩余'],3,'中断的施放不扣强化普攻次数');
  assert.ok(u.resources['强化普攻续放'],'换波后应挂起续放动作，等待下一次队列结算');
  stepBattle(b);                                     // 第二次 flush 执行续放
  assert.equal(u.resources['强化普攻剩余'],2,'续放完成后只扣 1 次强化普攻');
  assert.equal(u.resources['强化普攻续放'],undefined,'续放完成后应清除挂起状态');
  assert.ok(b.log.some(e=>e.type==='mechanic'&&e.name==='狼尊时刻 · 全灭中断'));
  assert.ok(b.log.some(e=>e.type==='mechanic'&&e.name==='狼尊时刻 · 全灭后续放'));
  const wave1Segments=b.log.filter(e=>e.type==='damage'&&e.actor===u.id&&e.wave===1&&e.segment!=null);
  const wave2Segments=b.log.filter(e=>e.type==='damage'&&e.actor===u.id&&e.wave===2&&e.segment!=null);
  assert.equal(wave1Segments.length,1,'第一波只结算击杀目标的主段');
  assert.equal(wave2Segments.length,99,'续放应结算剩余 99 段（1 主段 + 98 次弹射）');
  assert.equal(wave1Segments.length+wave2Segments.length,100,'两次施放合计仍为 #3=100 段');
  const boxes=b.log.filter(e=>e.type==='mechanic'&&e.name==='头号补给盲盒');
  assert.equal(boxes.length,3,'盲盒 #5=3 次应保留到续放结算，全灭时不得空放');
});

test('银狼LV.999 150608：盲盒击杀最后一个敌人后立即停止，未结算次数跨波保留',()=>{
  const first=enemy({id:'wave1',name:'规则训练敌人',wave:1,panel:{...panel(),hp:1,speed:1}});
  const second=enemy({id:'wave2',name:'规则训练敌人',wave:2,panel:{...panel(),hp:1e9,speed:100}});
  const b=createBattle({strict:true,maxAV:1,sp:3,maxSP:9,seed:42,critMode:'noncrit',units:[actor(1506),first,second]});
  b.random=()=>0;
  const [u,en]=b.units;
  u.resources['好活当赏']=50;en.hp=1;
  u.buffs.push({type:'buff',id:u.id+':sw999-ult',name:'无敌玩家',key:'marker',value:0,remaining:3,tag:'sw999Ult'});
  // 直接调用收尾结算：hitTargets 为空，避免前置【顺风局】先击杀目标；第 1 个盲盒击杀最后一个敌人。
  b.rules.after(b,u,'basic','extra',{},[],[],[]);
  const boxes=b.log.filter(e=>e.type==='mechanic'&&e.name==='头号补给盲盒');
  assert.equal(boxes.length,1,'只应结算击杀前的第 1 个盲盒，后两次不得空放');
  const e=plist(1506,150608,u.kit.skillLevels?.Normal)??[2.4,0,100,1,3];
  assert.equal(u.resources['强化普攻续放'].boxes,e[4]-1,'剩余 #5-1 次盲盒必须挂起到续放');
});

test('真珠秘技 150307：战斗开始时把【美学底本】交给除自身外的队友并进入 2 充能【深度学习】',()=>{
  // 用 1506 作欢愉队友：避免 1505 的【瞰众乐】把秘技的 20 点好活当赏按参演编号转走一半。
  const b=createBattle(config([actor(1503,{technique:true}),actor(1506)]));
  b.random=()=>0;
  const pearl=b.units[0],ev=b.units[1];
  assert.equal(ev.resources['美学底本'],1,'秘技必须实际持有【美学底本】才能深度学习对应角色');
  assert.equal(pearl.resources['深度学习充能'],2,'#1=2 点充能');
  assert.equal(pearl.resources['好活当赏'],20,'#2=20 点好活当赏');
  const a=b.rules.prepare(b,pearl,'basic','normal',pearl.actions.basic);
  assert.equal(a.name,ROSTER_DATA[1503].skills['150308'].name,'欢愉命途的美学底本应强化为【行笔，幻造星月】');
});

console.log(`Parallel laneB checks: ${passed} passed, ${failed} failed.`);
if(failed)process.exitCode=1;
