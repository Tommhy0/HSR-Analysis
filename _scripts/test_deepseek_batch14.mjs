// DeepSeek 第 14 批：1302 银枝 / 1314 翡翠 / 1401 大黑塔 / 1405 那刻夏 / 1510 姬子•启行 / 1508 远坂凛 的机制测试。
// 期望值全部由 4.6 编译出的 kit 参数（params / trace / ranks）推导，不写死倍率；
// 时序用 b.rules.before / after / afterHit / onTurnStart / onWaveStart 直接驱动，
// 数值用伤害事件的 base 乘区（= 攻击力 × 倍率 × 分段比例）核对。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createContext} from '../core/ctx.mjs';
import {newBattleBuild,buildBattleActor} from '../simulator/builds.mjs';
import {createBattle as rawCreateBattle,stepBattle,simulateBattle as rawSimulateBattle,validateBattle as rawValidateBattle,combatPanel} from '../simulator/engine.mjs';
const validateBattle=c=>rawValidateBattle(partialMechanicsFixture(c));
import {partialMechanicsFixture,assertFixtureDisclosure} from './partial-mechanics-fixtures.mjs';
const createBattle=c=>rawCreateBattle(partialMechanicsFixture(c));
const simulateBattle=c=>rawSimulateBattle(partialMechanicsFixture(c));
import {validateKitActor} from '../simulator/kits.mjs';
import {IDS} from '../simulator/characters/extra/batch14.mjs';
import {ROSTER_DATA} from '../simulator/roster-data.mjs';
const data=JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url))),ctx=createContext(data);
const near=(a,b,m=1e-6,msg)=>{if(typeof m!=='number'){msg=m;m=1e-6;}assert.ok(Math.abs(a-b)<m,`${a} != ${b}${msg?' ('+msg+')':''}`);};
const panel=()=>({hp:10000,atk:1000,def:1000,speed:100,critRate:.5,critDmg:1,energyRegen:1,effectHit:0,effectRes:0,breakEffect:0,baseStats:{hp:1000,atk:1000,def:1000},elemDmg:{}});
const actor=(id,extra={})=>{const a=buildBattleActor(ctx,{...newBattleBuild(),characterId:id,relicAuto:false,panel:panel(),...extra});a.energy=0;a.policy={...a.policy,autoUltimate:false};return a;};
const enemy=(extra={})=>({id:'enemy',name:'规则训练敌人',side:'enemy',level:90,element:'Physical',panel:{...panel(),hp:1e9,speed:1},energy:0,energyMax:0,res:{},
  actions:{basic:{name:'测试攻击',type:'Normal',terms:[{scaling:'atk',multiplier:1}],hitEnergy:10}},policy:{autoUltimate:false,basicOnly:true},...extra});
const mate=(extra={})=>({id:'mate',name:'测试队员',side:'ally',level:80,element:'Physical',panel:{...panel(),speed:1},energy:0,energyMax:100,
  actions:{basic:{name:'测试普攻',type:'Normal',terms:[{scaling:'atk',multiplier:1}],spGain:1,energyGain:20,toughness:30},
    skill:{name:'测试战技',type:'BPSkill',terms:[{scaling:'atk',multiplier:1}],spCost:1,energyGain:30,toughness:60}},policy:{autoUltimate:false,basicOnly:true},...extra});
const config=(units,en=null,maxAV=201)=>({strict:true,maxAV,sp:3,maxSP:9,seed:42,critMode:'noncrit',units:[...units,en??enemy()]});
const baseOf=ev=>ev.formula.find(f=>f.zone==='base').value;
const dmgOf=(b,id,kind)=>b.log.filter(e=>e.type==='damage'&&e.actor===id&&(kind?e.kind===kind:true));
const markOf=to=>to.buffs.find(e=>e.tag==='hertaMark')?.stacks??0;
// 与 batch14 相同的等级反查：强化技能与基础技能共用等级轨道。
const rowAt=(id,refId,targetId,refValue)=>{
  const table=ROSTER_DATA[id].skills?.[String(refId)]?.params??{};
  const key=Object.keys(table).find(k=>Math.abs((table[k].param_list?.[0]??NaN)-refValue)<1e-9);
  return ROSTER_DATA[id].skills?.[String(targetId)]?.params?.[key??'10']?.param_list??[];
};
const weakOf=to=>{const s=new Set(to.weaknesses??[]);for(const e of to.buffs)if(e.weakness)s.add(e.weakness);return s;};
const dangOf=u=>u.buffs.find(e=>e.tag==='jadeDang')?.stacks??0;
let passed=0,failed=0;const test=(name,fn)=>{try{fn();passed++;console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+'\n'+e.stack);}};

test('batch14 6 名角色 E0～E6 动作合同可编译且不能篡改倍率',()=>{
  assert.deepEqual([...IDS].sort((a,b)=>a-b),[1302,1314,1401,1405,1508,1510]);
  for(const id of IDS)for(let eidolon=0;eidolon<=6;eidolon++){
    const a=actor(id,{eidolon});assert.deepEqual(validateKitActor(a),[]);assert.deepEqual(a.unsupported,[]);
    const key=Object.keys(a.actions).find(k=>(a.actions[k]?.terms??[]).length);assert.ok(key,id+' 没有任何带倍率的动作');
    a.actions[key].terms[0].multiplier=99;assert.ok(validateKitActor(a).length,id+' 篡改 '+key+' 倍率未被发现');
  }
});

test('batch14 段数 / 命中分配与原始脚本一致（银枝强化终结、翡翠普攻与追击、大黑塔三段、远坂凛连携）',()=>{
  const ar=actor(1302),ja=actor(1314),th=actor(1401),rin=actor(1508);
  // 1302：Skill31_Phase02 = AllEnemy 1 段 SPHitRatio 1 + 130214[1]=6 次随机单体。
  assert.deepEqual(ar.actions.enhancedUltimate.hitShares,[1]);
  assert.equal(ar.actions.enhancedUltimate.bounceCount,ROSTER_DATA[1302].skills[130214].params['10'].param_list[1]);
  assert.equal(ar.actions.enhancedUltimate.energyCost,180);
  assert.equal(ar.actions.ultimate.energyCost,ROSTER_DATA[1302].skills[130203].params['10'].param_list[1]);
  // 1314：Skill01 主 1 段 + AbilityTargetAdjoinEntity 相邻 1 段；Passive_Phase02_01 5 段。
  assert.equal(ja.actions.basic.target,'blast');assert.equal(ja.actions.basic.terms[1].target,'adjacent');
  assert.deepEqual(ja.actions.followup.hitShares,ROSTER_DATA[1314].hits['Avatar_Jade_00_Passive_Phase02_01']);
  // 1401：Skill02/Skill21 的 3 次「目标+相邻」模板。
  assert.equal(th.actions.skill.repeatCount,3);assert.equal(th.actions.skill.terms[1].target,'adjacent');
  assert.equal(th.actions.enhancedSkill.repeatCount,3);
  // 1508：Skill03_Phase02 = 主 1 段 + 其他 1 段；Insert_Phase02 = 5 段 0.2。
  assert.equal(rin.actions.ultimate.terms[1].target,'adjacent');
  assert.deepEqual(rin.actions.followup.hitShares,ROSTER_DATA[1508].hits['Avatar_TohsakaRin_00_Insert_Phase02']);
  for(const a of [ar,ja,th,rin])for(const key of Object.keys(a.actions)){
    const s=a.actions[key].hitShares;if(s)near(s.reduce((x,y)=>x+y,0),1,1e-9,key);
  }
});

test('银枝：普攻/战技/终结每击中 1 个敌人回 3 能量并叠 1 层【升格】，每层 +3.25% 暴击率（E1 +4% 暴伤）',()=>{
  for(const eidolon of [0,1]){
    const b=createBattle(config([actor(1302,{eidolon})]));b.random=()=>0;
    const [u,en]=b.units,p=u.kit.params;
    assert.equal(u.resources['升格'],0);
    near(combatPanel(u).critRate,.5);
    b.rules.after(b,u,'skill','normal',u.actions.skill,[en],[en]);   // AoE 命中 1 名
    assert.equal(u.resources['升格'],1);
    near(combatPanel(u).critRate,.5+p.Talent[1]);
    if(eidolon>=1)near(combatPanel(u).critDmg,1+u.kit.ranks[1][0]);
    const e1=u.energy;
    b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[en],[en]);
    near(u.energy-e1,p.Talent[0],'每击中 1 个敌人应回 3 能量');
    assert.equal(u.resources['升格'],2);
  }
  // 行迹「虔诚」回合开始 +1 层；行迹「慷慨」波次开始 +2 能量；行迹「勇气」低血 +15% 伤害。
  const b=createBattle(config([actor(1302)]));b.random=()=>0;
  const [u,en]=b.units;
  b.rules.onTurnStart(b,u);assert.equal(u.resources['升格'],1);
  const e0=u.energy;b.rules.onWaveStart(b);near(u.energy-e0,u.kit.trace[2][0]);
  en.hp=combatPanel(en).hp*.4;
  near(b.rules.modifiers(b,u,en,{type:'Normal',element:'Physical'},'direct').dmgBoost,u.kit.trace[3][1]);
  en.hp=combatPanel(en).hp*.9;
  near(b.rules.modifiers(b,u,en,{type:'Normal',element:'Physical'},'direct').dmgBoost,0);
});

test('银枝：能量 ≥180 时终结替换为强化终结（3.36 倍 AoE + 6 次 1.14 单体），E6 终结无视 30% 防御',()=>{
  const b=createBattle(config([actor(1302,{eidolon:6})]));b.random=()=>0;
  const [u,en]=b.units,p=u.kit.params;
  u.energy=179;assert.equal(b.rules.prepare(b,u,'ultimate','normal',u.actions.ultimate).name,p.Ultra&&ROSTER_DATA[1302].skills[130203].name);
  u.energy=180;
  const pa=b.rules.prepare(b,u,'ultimate','normal',u.actions.ultimate);
  const row=rowAt(1302,130203,130214,u.kit.params.Ultra[0]);
  assert.equal(pa.name,ROSTER_DATA[1302].skills[130214].name);
  assert.equal(pa.energyCost,row[3]);assert.equal(pa.bounceCount,row[1]);
  near(pa.terms[0].multiplier,row[0]);near(pa.bounceTerms[0].multiplier,row[2]);
  near(b.rules.modifiers(b,u,en,{type:'Ultra',element:'Physical'},'direct').defIgnore,u.kit.ranks[6]);
  near(b.rules.modifiers(b,u,en,{type:'Normal',element:'Physical'},'direct').defIgnore,0);
});

test('银枝：E2 终结时敌人 ≥3 名获得 40% 攻击提高；E4 开场 2 层升格且上限 +2；秘技 80% AoE 并回 15 能',()=>{
  const c=config([actor(1302,{eidolon:2})],null);c.units=[c.units[0],enemy({id:'e1'}),enemy({id:'e2'}),enemy({id:'e3'})];
  const b=createBattle(c);b.random=()=>0;
  const u=b.units[0];
  b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,b.units.slice(1),b.units.slice(1));
  const e2=u.buffs.find(x=>x.id===u.id+':e2');
  assert.ok(e2,'E2 未获得攻击提高');near(e2.value,u.kit.ranks[2][1]);assert.equal(e2.remaining,u.kit.ranks[2][2]);
  const b2=createBattle(config([actor(1302,{eidolon:4})]));b2.random=()=>0;
  const u2=b2.units[0];
  assert.equal(u2.resources['升格'],u2.kit.ranks[4][0]);
  for(let i=0;i<20;i++)b2.rules.after(b2,u2,'skill','normal',u2.actions.skill,[b2.units[1]],[b2.units[1]]);
  assert.equal(u2.resources['升格'],u2.kit.params.Talent[2]+u2.kit.ranks[4][1],'升格上限应 +2');
  // 秘技
  const b3=createBattle(config([actor(1302,{technique:true})]));b3.random=()=>0;
  const [u3,en3]=b3.units,p=u3.kit.params;
  const tech=dmgOf(b3,u3.id,'technique');
  assert.equal(tech.length,1);near(baseOf(tech[0]),combatPanel(u3).atk*p.Maze[1]);
  near(u3.energy,p.Maze[2]+u3.kit.trace[2][0]);
  void en3;
});

test('翡翠：战技指定我方单体为【收债人】（速度 +30、3 回合），存在收债人时无法再次施放战技',()=>{
  const b=createBattle(config([actor(1314),actor(1015)]));b.random=()=>0;
  const [u,ar]=b.units,p=u.kit.params;
  assert.equal(b.rules.shouldUseSkill(b,u),true);
  b.rules.after(b,u,'skill','normal',u.actions.skill,[ar],[ar]);
  assert.equal(u.resources['收债人'],ar.id);
  const buff=ar.buffs.find(x=>x.tag==='jadeDebtor');
  assert.ok(buff,'未施加收债人');near(buff.value,p.BPSkill[0]);assert.equal(buff.remaining,p.BPSkill[3]);
  assert.equal(b.rules.shouldUseSkill(b,u),false,'存在收债人时不应再次施放战技');
  b.rules.onTurnStart(b,u);
  assert.equal(ar.buffs.find(x=>x.tag==='jadeDebtor').remaining,p.BPSkill[3],'角色钩子不得重复递减引擎计时');
  assert.equal(buff.tickOwner,u.id);assert.equal(buff.tickAt,'start');
});

test('翡翠：【收债人】攻击时对每个命中目标造成 30% 攻击力量子附加伤害并消耗其 2% 生命上限',()=>{
  const b=createBattle(config([actor(1314),actor(1015)]));b.random=()=>0;
  const [u,ar,en]=b.units,p=u.kit.params;
  b.rules.after(b,u,'skill','normal',u.actions.skill,[ar],[ar]);
  const hp0=ar.hp,n0=dmgOf(b,u.id,'additional').length;
  b.rules.after(b,ar,'basic','normal',ar.actions.basic,[en],[en]);
  const add=dmgOf(b,u.id,'additional').slice(n0);
  assert.equal(add.length,1,'收债人攻击应对每个命中目标结算 1 次附加伤害');
  near(baseOf(add[0]),combatPanel(u).atk*p.BPSkill[2]);
  near(ar.hp,hp0-combatPanel(ar).hp*p.BPSkill[1],'应消耗收债人 2% 生命上限');
  // 翡翠本人为收债人时不消耗生命值
  const b2=createBattle(config([actor(1314)]));b2.random=()=>0;
  const [u2,en2]=b2.units;
  b2.rules.after(b2,u2,'skill','normal',u2.actions.skill,[u2],[u2]);
  const hp2=u2.hp;
  b2.rules.after(b2,u2,'basic','normal',u2.actions.basic,[en2],[en2]);
  near(u2.hp,hp2,'翡翠本人为收债人时不应消耗生命值');
});

test('翡翠：攻击每击中 1 名敌人 +1 充能，满 8 点发动全体追加攻击并获得 5 层【当品】，暴伤随层数提高',()=>{
  const b=createBattle(config([actor(1314)]));b.random=()=>0;
  const [u,en]=b.units,p=u.kit.params;
  u.resources['充能']=0;
  for(let i=0;i<7;i++)b.rules.after(b,u,'basic','normal',u.actions.basic,[en],[en]);
  assert.equal(u.resources['充能'],7);assert.equal(b.queue.length,0);
  b.rules.after(b,u,'basic','normal',u.actions.basic,[en],[en]);
  assert.equal(u.resources['充能'],0);
  assert.equal(b.queue.filter(q=>q.actor===u.id&&q.key==='followup').length,1,'满充能应发动天赋追加攻击');
  const dang0=dangOf(u);
  b.rules.after(b,u,'followup','followup',u.actions.followup,[en],[en]);
  assert.equal(dangOf(u),dang0+p.Talent[3]);
  near(b.rules.modifiers(b,u,en,{type:'Talent'},'followup').critDmg,dangOf(u)*p.Talent[0]);
  // 天赋追加攻击本身不能再获得充能
  const before=u.resources['充能'];
  b.rules.after(b,u,'followup','followup',u.actions.followup,[en],[en]);
  assert.equal(u.resources['充能'],before);
});

test('翡翠：终结技使天赋追加攻击倍率 +100% 持续 2 次，E1 击中 1/2 名敌人额外 +2/+1 充能',()=>{
  const b=createBattle(config([actor(1314,{eidolon:1})]));b.random=()=>0;
  const [u,en]=b.units,p=u.kit.params;
  u.resources['充能']=0;
  b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[en],[en]);
  assert.equal(u.resources['强化次数'],p.Ultra[1]);
  const pa=b.rules.prepare(b,u,'followup','followup',u.actions.followup);
  near(pa.terms[0].multiplier,p.Talent[4]*(1+p.Ultra[0]),'强化追击倍率应为 1+100%');
  assert.equal(pa.enhancedFollow,true);
  // 击中 1 名：基础 1 + E1 额外 2（先清空终结技本身产生的充能）
  u.resources['充能']=0;
  b.rules.after(b,u,'basic','normal',u.actions.basic,[en],[en]);
  assert.equal(u.resources['充能'],3);
  // 击中 2 名：基础 2 + E1 额外 1
  u.resources['充能']=0;
  const c=config([actor(1314,{eidolon:1})],null);c.units=[c.units[0],enemy({id:'e1'}),enemy({id:'e2'})];
  const b2=createBattle(c);b2.random=()=>0;
  const u2=b2.units[0];
  b2.rules.after(b2,u2,'basic','normal',u2.actions.basic,[b2.units[1],b2.units[2]],[b2.units[1],b2.units[2]]);
  assert.equal(b2.units[0].resources['充能'],3,'击中 2 名应为 2+1');
});

test('翡翠：E4 终结后无视防御 12% 三回合、E6 有收债人时量子抗穿 +20%、行迹折牙票开场提前 50%',()=>{
  const b=createBattle(config([actor(1314,{eidolon:6})]));b.random=()=>0;
  const [u,en]=b.units;
  assert.ok(b.log.some(e=>e.type==='advance'&&e.actor===u.id&&Math.abs(e.ratio-u.kit.trace[2][0])<1e-9),'开场未提前 50%');
  b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[en],[en]);
  const e4=u.buffs.find(x=>x.id===u.id+':e4');
  assert.ok(e4,'E4 未获得无视防御');near(e4.value,u.kit.ranks[4][0]);assert.equal(e4.remaining,u.kit.ranks[4][1]);
  // 未指定收债人时 E6 不生效
  near(b.rules.modifiers(b,u,en,{type:'Normal',element:'Quantum'},'direct').resPen,0);
  // 指定收债人后 E6 生效
  const b2=createBattle(config([actor(1314,{eidolon:6}),actor(1015)]));b2.random=()=>0;
  const [u2,ar2,en2]=b2.units;
  near(b2.rules.modifiers(b2,u2,en2,{type:'Normal',element:'Quantum'},'direct').resPen,0);
  b2.rules.after(b2,u2,'skill','normal',u2.actions.skill,[ar2],[ar2]);
  near(b2.rules.modifiers(b2,u2,en2,{type:'Normal',element:'Quantum'},'direct').resPen,u2.kit.ranks[6]);
});

test('翡翠：秘技 50% 全体伤害并立即获得 15 层【当品】；每层额外提高 0.5% 攻击；E2 满 15 层 +18% 暴击率',()=>{
  const b=createBattle(config([actor(1314,{technique:true})]));b.random=()=>0;
  const [u,en]=b.units,p=u.kit.params;
  const tech=dmgOf(b,u.id,'technique');
  // 秘技伤害先于获得【当品】结算，故按基础攻击力（此时尚无当品加攻）。
  assert.equal(tech.length,1);near(baseOf(tech[0]),1000*p.Maze[1]);
  // 开场 waveStart 行迹 +1 层，秘技 +15 层
  assert.equal(dangOf(u),1+p.Maze[2]);
  near(combatPanel(u).atk,1000+1000*dangOf(u)*u.kit.trace[3][0]);
  void en;
  const b2=createBattle(config([actor(1314,{eidolon:2})]));b2.random=()=>0;
  const u2=b2.units[0];u2.buffs.find(x=>x.tag==='jadeDang').stacks=u2.kit.ranks[2][0];
  near(combatPanel(u2).critRate,.5+u2.kit.ranks[2][1]);
});

test('大黑塔：波次开始施加【解读】（随机目标 25 层），强化战技每层提高主目标 8%/其他 4% 伤害',()=>{
  const b=createBattle(config([actor(1401)]));b.random=()=>0;
  const [u,en]=b.units,p=u.kit.params;
  const marks=markOf(en);
  assert.ok(marks>=1,'波次开始应施加解读');
  assert.equal(marks,p.Talent[5]+1);
  assert.equal(u.resources['谜底'],marks,'每施加 1 层解读应获得 1 层谜底');
  u.resources['灵感']=1;
  const pa=b.rules.prepare(b,u,'skill','normal',u.actions.skill);
  assert.equal(pa.name,ROSTER_DATA[1401].skills[140109].name);assert.equal(pa.enhanced,true);
  b.rules.before(b,u,'skill','normal',pa,[en]);
  const row=ROSTER_DATA[1401].skills[140109].params['10'].param_list;
  near(pa.aoe,row[2]);
  near(b.rules.modifiers(b,u,en,pa,'direct').dmgBoost,Math.min(p.Talent[2],marks)*p.Talent[0]);
});

test('大黑塔：强化战技结算后主目标【解读】重置为 1（E1 为 15）并消耗 1 层【灵感】，E2 行动提前 35%',()=>{
  const b=createBattle(config([actor(1401)]));b.random=()=>0;
  const [u,en]=b.units;
  u.resources['灵感']=1;
  const pa=b.rules.prepare(b,u,'skill','normal',u.actions.skill);
  b.rules.before(b,u,'skill','normal',pa,[en]);
  b.rules.after(b,u,'skill','normal',pa,[en],[en]);
  assert.equal(markOf(en),u.kit.params.Talent[3],'重置应为 1 层');
  assert.equal(u.resources['灵感'],0,'应消耗 1 层灵感');
  const b2=createBattle(config([actor(1401,{eidolon:2})]));b2.random=()=>0;
  const [u2,en2]=b2.units;u2.resources['灵感']=2;
  const pa2=b2.rules.prepare(b2,u2,'skill','normal',u2.actions.skill);
  b2.rules.before(b2,u2,'skill','normal',pa2,[en2]);
  b2.rules.after(b2,u2,'skill','normal',pa2,[en2],[en2]);
  assert.ok(b2.log.some(e=>e.type==='advance'&&e.actor===u2.id&&Math.abs(e.ratio-u2.kit.ranks[2][0])<1e-9),'E2 未行动提前 35%');
  const b3=createBattle(config([actor(1401,{eidolon:1})]));b3.random=()=>0;
  const [u3,en3]=b3.units;u3.resources['灵感']=1;
  const pa3=b3.rules.prepare(b3,u3,'skill','normal',u3.actions.skill);
  b3.rules.before(b3,u3,'skill','normal',pa3,[en3]);
  b3.rules.after(b3,u3,'skill','normal',pa3,[en3],[en3]);
  assert.equal(markOf(en3),u3.kit.ranks[1][1],'E1 重置应为 15 层');
});

test('大黑塔：强化战技收尾包对冰弱点敌人削韧 15（Skill21_Phase02 收尾节点 StanceValue，而非 stance 索引）',()=>{
  // 收尾包由 after 钩子单独发出：直接驱动 after 即可与主包的 3 段重复隔离，逐条核对收尾削韧。
  const b=createBattle(config([actor(1401)],enemy({weaknesses:['Ice'],toughnessMax:1000,standardBreak:true,rank:'normal'})));
  b.random=()=>0;
  const [u,en]=b.units;
  u.resources['灵感']=1;
  const pa=b.rules.prepare(b,u,'skill','normal',u.actions.skill);
  assert.equal(pa.enhanced,true,'持有灵感时应替换为强化战技');
  b.rules.before(b,u,'skill','normal',pa,[en]);
  const t0=en.toughness,n0=b.log.length;
  b.rules.after(b,u,'skill','normal',pa,[en],[en]);
  const drops=b.log.slice(n0).filter(e=>e.type==='toughness'&&e.target===en.id);
  assert.equal(drops.length,1,'收尾包应对每个冰弱点敌人结算 1 次削韧');
  near(t0-en.toughness,15,1e-9,'收尾包削韧应为 Skill21_Phase02 节点的 StanceValue=15');
  near(drops[0].value,t0-15,1e-9);
  // 全流程：主包 3 段 × 60 + 收尾 15，证明 15 是叠加在主包之上的独立削韧。
  const b2=createBattle(config([actor(1401)],enemy({weaknesses:['Ice'],toughnessMax:1000,standardBreak:true,rank:'normal'})));
  b2.random=()=>0;
  const u2=b2.units[0],en2=b2.units[1];
  u2.resources['灵感']=1;
  u2.policy={...u2.policy,turnPlan:[{turn:1,key:'skill'}]};
  const t2=en2.toughness;
  stepBattle(b2);
  near(t2-en2.toughness,3*60+15,1e-9,'主包 3 段 × 60 后收尾应再削 15');
});

test('大黑塔：我方任意角色攻击命中后施加 1 层【解读】并固定回 3 能（point07 至少计 3 个目标）',()=>{
  const b=createBattle(config([actor(1401),mate()]));b.random=()=>0;
  const [u,m,en]=b.units;
  const m0=markOf(en),e0=u.energy;
  b.rules.after(b,m,'basic','normal',m.actions.basic,[en],[en]);
  // point06 施加 1 层 + point07 对层数最高者再施加 1 层（攻击者非智识）
  assert.equal(markOf(en),m0+1+u.kit.trace[2][2],'队友攻击应施加解读层数');
  // point07 使计算击中目标数时至少计算 3 个目标 → 3 目标 × 3 能量
  near(u.energy-e0,u.kit.trace[1][0]*u.kit.trace[2][1],'应固定恢复能量');
});

test('大黑塔：终结技按每层【谜底】+1% 倍率、攻击力 +100% 三回合、立即行动并获得 1 层【灵感】',()=>{
  const b=createBattle(config([actor(1401)]));b.random=()=>0;
  const [u,en]=b.units,p=u.kit.params;
  u.resources['谜底']=10;
  const pa=b.rules.prepare(b,u,'ultimate','normal',u.actions.ultimate);
  near(pa.terms[0].multiplier,p.Ultra[0]*(1+10*u.kit.trace[3][0]));
  b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[en],[en]);
  const atk=u.buffs.find(x=>x.id===u.id+':ult-atk');
  assert.ok(atk,'未获得终结技攻击提高');near(atk.value,p.Ultra[3]);assert.equal(atk.remaining,p.Ultra[4]);
  assert.equal(u.resources['灵感'],1);
  assert.ok(b.log.some(e=>e.type==='advance'&&e.actor===u.id&&e.ratio===1),'终结技应立即行动');
});

test('大黑塔：E6 终结技倍率按敌方数量 +140%/250%/400% 且冰抗穿 +20%；E4 智识队友速度 +12%',()=>{
  for(const [count,bonusIdx] of [[3,0],[2,1],[1,2]]){
    const c=config([actor(1401,{eidolon:6})],null);
    c.units=[c.units[0]];for(let i=0;i<count;i++)c.units.push(enemy({id:'e'+i}));
    const b=createBattle(c);b.random=()=>0;
    const u=b.units[0],en=b.units[1];
    u.resources['谜底']=0;
    const pa=b.rules.prepare(b,u,'ultimate','normal',u.actions.ultimate);
    near(pa.terms[0].multiplier,u.kit.params.Ultra[0]+u.kit.ranks[6][bonusIdx]);
    near(b.rules.modifiers(b,u,en,{type:'Ultra',element:'Ice'},'direct').resPen,u.kit.ranks[6][3]);
    assert.ok(u.buffs.some(x=>x.id===u.id+':e4'));
  }
});

test('大黑塔：秘技使战斗开始时攻击力 +60% 持续 2 回合；行迹 point07 智识 ≥2 名时全队 +80% 暴伤',()=>{
  const b=createBattle(config([actor(1401,{technique:true})]));b.random=()=>0;
  const u=b.units[0],p=u.kit.params;
  const maze=u.buffs.find(x=>x.id===u.id+':maze');
  assert.ok(maze,'秘技未获得攻击提高');near(maze.value,p.Maze[0]);assert.equal(maze.remaining,p.Maze[1]);
  const b2=createBattle(config([actor(1401),actor(1314)]));b2.random=()=>0;
  for(const to of b2.units.filter(x=>x.side==='ally'))
    assert.ok(to.buffs.some(x=>x.id.startsWith(b2.units[0].id+':trace7')),'智识 ≥2 名应全队 +80% 暴伤');
});

test('那刻夏：命中后植入随机弱点，≥5 个不同弱点进入【质性揭露】并获得 30% 增伤与每弱点 4% 无视防御',()=>{
  const b=createBattle(config([actor(1405)]));b.random=()=>0;
  const [u,en]=b.units,p=u.kit.params;
  for(let i=0;i<10&&weakOf(en).size<p.Talent[2];i++)b.rules.after(b,u,'basic','normal',u.actions.basic,[en],[en]);
  assert.ok(weakOf(en).size>=p.Talent[2],'弱点数量应达到质性揭露阈值');
  near(b.rules.modifiers(b,u,en,{type:'Normal',element:'Wind'},'direct').dmgBoost,p.Talent[0]);
  near(b.rules.modifiers(b,u,en,{type:'Normal',element:'Wind'},'direct').defIgnore,Math.min(7,weakOf(en).size)*u.kit.trace[3][0]);
  // 弱点持续 3 回合
  assert.equal(en.buffs.find(x=>x.weakness)?.remaining,p.Talent[1]);
});

test('那刻夏：战技每多 1 个可攻击敌人 +20% 伤害，命中【质性揭露】目标后额外施放一次不耗战技点的战技',()=>{
  const c=config([actor(1405)],null);c.units=[c.units[0],enemy({id:'e1'}),enemy({id:'e2'})];
  const b=createBattle(c);b.random=()=>0;
  const u=b.units[0],en=b.units[1],p=u.kit.params;
  near(b.rules.modifiers(b,u,en,{type:'BPSkill',element:'Wind'},'direct').dmgBoost,p.BPSkill[2]*2);
  for(let i=0;i<6;i++)b.rules.after(b,u,'basic','normal',u.actions.basic,[en],[en]);
  assert.ok(weakOf(en).size>=p.Talent[2]);
  b.queue.length=0;
  b.rules.after(b,u,'basic','normal',u.actions.basic,[en],[en]);
  const q=b.queue.filter(x=>x.actor===u.id&&x.key==='skill'&&x.kind==='followup');
  assert.equal(q.length,1,'应额外施放 1 次战技');
  const pa=b.rules.prepare(b,u,'skill','followup',u.actions.skill);
  assert.equal(pa.spCost,0,'额外战技不消耗战技点');
  assert.equal(pa.extraSkill,true);
  // 额外战技（kind='followup'）不再触发
  b.queue.length=0;
  b.rules.after(b,u,'skill','followup',u.actions.skill,[en],[en]);
  assert.equal(b.queue.filter(x=>x.kind==='followup').length,0);
});

test('那刻夏：普攻额外回 10 能、回合开始无【质性揭露】时回 30 能、E1 首次战技返 1 点并使目标降防 16%',()=>{
  const b=createBattle(config([actor(1405)]));b.random=()=>0;
  const [u,en]=b.units,p=u.kit.params;
  const e0=u.energy;
  b.rules.after(b,u,'basic','normal',u.actions.basic,[en],[en]);
  near(u.energy-e0,u.kit.trace[1][0]);
  u.energy=0;b.rules.onTurnStart(b,u);
  near(u.energy,u.kit.trace[1][1]);
  const b2=createBattle(config([actor(1405,{eidolon:1})]));b2.random=()=>0;
  const [u2,en2]=b2.units;
  const sp0=b2.sp;
  b2.rules.after(b2,u2,'skill','normal',u2.actions.skill,[en2],[en2]);
  assert.equal(b2.sp,sp0+u2.kit.ranks[1][2],'E1 应返还 1 个战技点');
  const shred=en2.buffs.find(x=>x.id===u2.id+':e1');
  assert.ok(shred,'E1 未降防');near(shred.value,u2.kit.ranks[1][0]);assert.equal(shred.remaining,u2.kit.ranks[1][1]);
  b2.rules.after(b2,u2,'skill','normal',u2.actions.skill,[en2],[en2]);
  assert.equal(b2.sp,sp0+u2.kit.ranks[1][2],'E1 只应生效一次');
})

test('那刻夏：E4 每层 +30% 攻击最多 2 层、E6 无条件触发两种行迹并 +30% 伤害、秘技植入风弱点',()=>{
  const b=createBattle(config([actor(1405,{eidolon:4})]));b.random=()=>0;
  const [u,en]=b.units;
  b.rules.after(b,u,'skill','normal',u.actions.skill,[en],[en]);
  b.rules.after(b,u,'skill','normal',u.actions.skill,[en],[en]);
  b.rules.after(b,u,'skill','normal',u.actions.skill,[en],[en]);
  const e4=u.buffs.find(x=>x.id===u.id+':e4');
  near(e4.stacks,u.kit.ranks[4][2]);near(e4.value,u.kit.ranks[4][0]*u.kit.ranks[4][2]);
  const b2=createBattle(config([actor(1405,{eidolon:6})]));b2.random=()=>0;
  const [u2,en2]=b2.units;
  near(combatPanel(u2).critDmg,1+u2.kit.trace[2][0],'E6 应无条件触发 1 名智识效果');
  near(b2.rules.modifiers(b2,u2,en2,{type:'Normal',element:'Wind'},'direct').dmgBoost,u2.kit.trace[2][1]+(u2.kit.ranks[6]-1));
  const b3=createBattle(config([actor(1405,{technique:true})]));b3.random=()=>0;
  assert.ok(b3.units[1].buffs.some(x=>x.id===b3.units[0].id+':maze-weak'&&x.weakness==='Wind'),'秘技未植入风弱点');
});

test('姬子•启行：普通攻击不消耗助战技；队友主动使用独立助战技后回 4 能并触发姬子助战技（+25% 抗穿 / +100% 暴伤）',()=>{
  const planned=config([actor(1510),actor(1015)]);planned.units[1].policy.turnPlan=[{turn:1,key:'supportSkill'}];
  assert.deepEqual(validateBattle(planned),[],'有姬子时逐回合操作轴应允许主动助战动作');
  const unsupported=config([actor(1015)]);unsupported.units[0].policy.turnPlan=[{turn:1,key:'supportSkill'}];
  assert.ok(validateBattle(unsupported).some(e=>e.includes('动作无效')),'没有姬子时不得伪造助战动作');
  const b=createBattle(config([actor(1510),actor(1015)]));b.random=()=>0;
  const [u,ar,en]=b.units,p=u.kit.params;
  assert.equal(u.resources['助战技次数'],1);assert.equal(ar.resources['助战技次数'],1);
  assert.ok(ar.actions.supportSkill,'队友应有独立可选择的助战技能动作');
  ar.energy=0;
  const act=key=>{b.units.forEach(t=>t.distance=10000);ar.distance=0;ar.policy={...ar.policy,turnPlan:[{turn:ar.turns+1,key}]};stepBattle(b);};
  act('basic');
  assert.equal(ar.resources['助战技次数'],1,'普通攻击不能消耗助战技次数');
  assert.ok(!b.log.some(e=>e.type==='action'&&e.actor===u.id&&e.key==='assist'),'普通攻击不能自动触发姬子助战技');
  const energyBeforeAssist=ar.energy;
  act('supportSkill');
  assert.equal(ar.resources['助战技次数'],0);
  near(ar.energy-energyBeforeAssist,p.Talent[2]+5,'助战技固定回 4 点；其余 5 点为自身行动结束基础回能');
  assert.equal(b.log.filter(e=>e.type==='action'&&e.actor===u.id&&e.key==='assist').length,1,'主动助战技能触发姬子助战技');
  const assistHits=dmgOf(b,u.id).filter(e=>e.attackType==='Assist');
  assert.equal(assistHits.length,5,'姬子自身助战技为 1 次 250% 全体攻击 + 4 次 39% 弹射');
  const assist15=data.skills.find(x=>x.id===151022).params['15'].param_list;
  near(baseOf(assistHits[0]),combatPanel(u).atk*assist15[3]);
  for(const hit of assistHits.slice(1))near(baseOf(hit),combatPanel(u).atk*assist15[5]);
  near(u.buffs.find(x=>x.id===u.id+':talent-pen').value,p.Talent[1]);
  near(u.buffs.find(x=>x.id===u.id+':talent-cd').value,p.Talent[0]);
  near(b.rules.modifiers(b,u,en,u.actions.assist,'followup').resPen,0,'E0 无 E6 抗穿');
});

test('姬子•启行行迹：助战技触发的额外回合可按行动轴插入终结技',()=>{
  const ineligible=config([actor(1510),actor(1015)]);
  ineligible.actionPlan=[{actor:'char-1015',key:'ultimate',targetId:'enemy',after:{actor:'char-1015',key:'supportSkill',kind:'normal',occurrence:1}}];
  assert.ok(validateBattle(ineligible).some(e=>e.includes('非开拓同行须姬子达到 E2')),'E0 姬子不能给非开拓同行插入终结技');
  const cfg=config([actor(1510,{eidolon:2}),actor(1015)]),[himeko,trailblazer]=cfg.units;
  trailblazer.energy=trailblazer.energyMax;
  trailblazer.policy={...trailblazer.policy,autoUltimate:false,turnPlan:[{turn:1,key:'supportSkill'}]};
  cfg.actionPlan=[{actor:trailblazer.id,key:'ultimate',targetId:'enemy',after:{actor:trailblazer.id,key:'supportSkill',kind:'normal',occurrence:1}}];
  assert.deepEqual(validateBattle(cfg),[],'行动轴应接受由姬子授予的 supportSkill 作为插入终结技触发点');
  const b=createBattle(cfg),u=b.units.find(x=>x.id===trailblazer.id);
  b.units.forEach(x=>x.distance=10000);u.distance=0;
  assert.equal(stepBattle(b),true);
  const actions=b.log.filter(e=>e.type==='action');
  assert.ok(actions.some(e=>e.actor===u.id&&e.key==='supportSkill'&&e.kind==='normal'),'队友应先实际执行助战技');
  assert.ok(actions.some(e=>e.actor===u.id&&e.key==='ultimate'&&e.kind==='ultimate'),'手动插入终结技应在助战技触发后执行');
  assert.ok(actions.findIndex(e=>e.actor===u.id&&e.key==='ultimate')>actions.findIndex(e=>e.actor===u.id&&e.key==='supportSkill'),'终结技不能跑到触发动作之前');
  assert.equal(himeko.kit.eidolon,2,'扩展到非开拓同行须由姬子 E2 授权');
});

test('姬子•启行点07/E2：额外回合可选择普攻或战技，遵守资源并仅触发一次',()=>{
  const trailCfg=config([actor(1510),actor(8009)]),tb=trailCfg.units[1];
  tb.policy={...tb.policy,turnPlan:[{turn:1,key:'supportSkill'}]};
  trailCfg.actionPlan=[{actor:tb.id,key:'basic',after:{actor:tb.id,key:'supportSkill',kind:'normal',occurrence:1}}];
  assert.deepEqual(validateBattle(trailCfg),[],'点07应可将开拓同行额外回合录为普攻');
  const trail=createBattle(trailCfg);trail.units.forEach(u=>u.distance=10000);trail.units[1].distance=0;
  assert.equal(stepBattle(trail),true);
  const tbActions=trail.log.filter(e=>e.type==='action'&&e.actor===tb.id);
  assert.ok(tbActions.some(e=>e.key==='supportSkill'&&e.kind==='normal'));
  assert.ok(tbActions.some(e=>e.key==='basic'&&e.kind==='extra'),'额外普攻应在原助战技后执行');
  assert.equal(tbActions.filter(e=>e.kind==='extra').length,1,'点07授予的一次额外回合不得循环触发');

  const e0=config([actor(1510),mate({id:'non-trailblazer'})]);
  e0.actionPlan=[{actor:'non-trailblazer',key:'skill',after:{actor:'non-trailblazer',key:'supportSkill',kind:'normal',occurrence:1}}];
  assert.ok(validateBattle(e0).some(e=>e.includes('须姬子达到 E2')),'E0 不得给非开拓同行额外回合');

  const e2=config([actor(1510,{eidolon:2}),mate({id:'non-trailblazer'})]);
  e2.units[1].energy=0;e2.units[1].policy={...e2.units[1].policy,turnPlan:[{turn:1,key:'supportSkill'}]};
  e2.actionPlan=[{actor:'non-trailblazer',key:'skill',after:{actor:'non-trailblazer',key:'supportSkill',kind:'normal',occurrence:1}}];
  assert.deepEqual(validateBattle(e2),[],'E2 应让非开拓同行获得同类额外回合');
  const extra=createBattle(e2);extra.units.forEach(u=>u.distance=10000);extra.units[1].distance=0;
  assert.equal(stepBattle(extra),true);
  assert.ok(extra.log.some(e=>e.type==='action'&&e.actor==='non-trailblazer'&&e.key==='skill'&&e.kind==='extra'),'E2 额外战技须实际执行');
  assert.equal(extra.sp,2,'额外战技按实际资源规则消耗1点战技点');

  const illegal={...e2,actionPlan:[{actor:'non-trailblazer',key:'supportSkill',after:{actor:'non-trailblazer',key:'supportSkill',kind:'normal',occurrence:1}}]};
  assert.ok(validateBattle(illegal).some(e=>e.includes('我方普攻、战技、终结技')),'不能把助战技能本身伪装成额外回合指令');
  const noSp={...e2,sp:0},dry=createBattle(noSp);dry.units.forEach(u=>u.distance=10000);dry.units[1].distance=0;
  let noSpError=null;try{stepBattle(dry);}catch(e){noSpError=e;}
  assert.ok(noSpError,`额外战技资源不足时必须阻止，不可免费执行；sp=${dry.sp} actions=${JSON.stringify(dry.log.filter(e=>e.type==='action').map(e=>[e.actor,e.key,e.kind]))} plans=${JSON.stringify(dry.planUsed)}`);
});

test('姬子•启行 E1/E2：本人助战技追加一次效果，终结技与助战技按 E2×130% 结算',()=>{
  const run=eidolon=>{
    const b=createBattle(config([actor(1510,{eidolon}),actor(1015)]));b.random=()=>0;
    const [u,ar]=b.units;
    ar.distance=0;u.distance=10000;
    ar.policy={...ar.policy,turnPlan:[{turn:ar.turns+1,key:'supportSkill'}]};
    stepBattle(b);
    return {b,u,hits:dmgOf(b,u.id).filter(e=>e.attackType==='Assist')};
  };
  const e0=run(0),e1=run(1),e2=run(2);
  assert.equal(e0.hits.length,5);
  assert.equal(e1.hits.length,6,'E1 #3=1 增加 1 次助战技额外伤害');
  assert.equal(e2.hits.length,6,'E2 保留 E1 的额外伤害次数');
  near(e2.hits[0].damage/e1.hits[0].damage,ROSTER_DATA[1510].ranks[2][0]);
  const e2Ultra=e2.u.actions.ultimate;
  near(e2.b.rules.modifiers(e2.b,e2.u,e2.b.units.at(-1),e2Ultra,'direct').dmgBoost,
    ROSTER_DATA[1510].ranks[2][0]-1,'E2 增伤应同时作用于终结技');
  const ultDamage=eidolon=>{
    const cfg=config([actor(1510,{eidolon})]),u=cfg.units[0];u.energy=u.energyMax;u.policy={...u.policy,autoUltimate:true};
    cfg.actionPlan=Array.from({length:6},()=>({actor:u.id,key:'beam',after:{actor:u.id,key:'ultimate',kind:'ultimate',occurrence:1}}));
    const b=createBattle(cfg);stepBattle(b);
    return dmgOf(b,u.id)[0].damage;
  };
  near(ultDamage(2)/ultDamage(0),ROSTER_DATA[1510].ranks[2][0],'真实终结技伤害也应为 E2 的 130%');
});

test('姬子•启行：战技恢复全部助战技次数并给予全体 +25% 增伤三回合；E2 上限 2 次；终结时获得 3 点源能',()=>{
  const b=createBattle(config([actor(1510),actor(1015)]));b.random=()=>0;
  const [u,ar]=b.units,p=u.kit.params;
  ar.resources['助战技次数']=0;
  b.rules.after(b,u,'skill','normal',u.actions.skill,[u],[u]);
  assert.equal(ar.resources['助战技次数'],1,'战技应恢复所有助战技次数');
  const flag=ar.buffs.find(x=>x.id===u.id+':flag');
  assert.ok(flag,'未获得领航旗语');near(flag.value,p.BPSkill[0]);assert.equal(flag.remaining,p.BPSkill[1]);
  const beforePrepare=u.resources['源能'];b.rules.prepare(b,u,'ultimate','normal',u.actions.ultimate);
  near(u.resources['源能'],beforePrepare,'准备阶段不得提前结算实际终结技资源');
  const b2=createBattle(config([actor(1510,{eidolon:2}),actor(1015)]));b2.random=()=>0;
  const [u2,ar2]=b2.units;
  b2.rules.after(b2,u2,'skill','normal',u2.actions.skill,[u2],[u2]);
  assert.equal(ar2.resources['助战技次数'],2,'E2 助战技上限应为 2');
  const b3=createBattle(config([actor(1510,{eidolon:6}),actor(1015)]));b3.random=()=>0;
  const [u3,,en3]=b3.units;
  near(b3.rules.modifiers(b3,u3,en3,u3.actions.assist,'followup').resPen,u3.kit.ranks[6][0]);
  const beforePrepareE6=u3.resources['源能'];b3.rules.prepare(b3,u3,'ultimate','normal',u3.actions.ultimate);
  near(u3.resources['源能'],beforePrepareE6,'E6 也不能在准备阶段虚增光束源能');
});

test('姬子·启行拓星者：六束逐段结算、E6逐束回能、自动脉冲消耗源能并接三段终击',()=>{
  const run=eidolon=>{
    const cfg=config([actor(1510,{eidolon})]);
    const h=cfg.units[0];h.energy=h.energyMax;h.policy={...h.policy,autoUltimate:true};
    cfg.actionPlan=Array.from({length:6},()=>({actor:h.id,key:'beam',after:{actor:h.id,key:'ultimate',kind:'ultimate',occurrence:1}}));
    const b=createBattle(cfg);b.random=()=>0;stepBattle(b);
    return {b,h:b.units.find(u=>u.id===h.id)};
  };
  const e0=run(0),e6=run(6);
  for(const x of [e0,e6]){
    const log=x.b.log.filter(e=>e.type==='action'&&e.actor===x.h.id);
    assert.equal(log.filter(e=>e.key==='beam').length,6,'必须逐次记录六束光束');
    assert.equal(log.filter(e=>e.key==='pulse').length,1,'六束耗尽后自动发动一次脉冲');
    assert.equal(log.filter(e=>e.key==='finalBlow').length,1,'脉冲后自动发动最后一击');
    const beamHits=dmgOf(x.b,x.h.id).filter(e=>e.formula?.some(f=>f.zone==='base'&&Math.abs(f.value-combatPanel(x.h).atk*x.h.kit.params.Ultra[0])<1e-6));
    assert.equal(beamHits.length,6,'光束伤害必须拆成六个独立命中');
    const finalHits=dmgOf(x.b,x.h.id).filter(e=>Math.abs(baseOf(e)-combatPanel(x.h).atk*x.h.kit.params.Ultra[6])<1e-6);
    assert.equal(finalHits.length,3,'最后一击应是三段随机单体伤害');
  }
  assert.equal(e0.h.resources['源能'],0,'E0 的3点脉冲源能应全部消耗');
  assert.equal(e6.h.resources['源能'],0,'E6 光束额外回能后的6点源能应全部消耗');
  const e6Extra=e6.b.log.filter(e=>e.type==='damage'&&e.actor===e6.h.id&&Math.abs(baseOf(e)-combatPanel(e6.h).atk*e6.h.kit.ranks[6][4])<1e-6);
  assert.equal(e6Extra.length,1,'E6 达6点门槛时额外群伤应只在脉冲段触发一次');
});

test('姬子·启行拓星者：同一终结序列跨波保留，实际执行过的操作轴才记为已用',()=>{
  for(const eidolon of [0,6]){
    const h=actor(1510,{eidolon});h.energy=h.energyMax;h.policy={...h.policy,autoUltimate:true};
    const cfg=config([h],enemy({id:'wave-1',wave:1,panel:{...panel(),hp:1,speed:1}}));
    cfg.units.push(enemy({id:'wave-2',wave:2,panel:{...panel(),hp:1e9,speed:1}}));
    cfg.actionPlan=Array.from({length:6},()=>({actor:h.id,key:'beam',after:{actor:h.id,key:'ultimate',kind:'ultimate',occurrence:1}}));
    const b=createBattle(cfg);b.random=()=>0;assert.equal(stepBattle(b),true);
    const actions=b.log.filter(e=>e.type==='action'&&e.actor===h.id);
    assert.equal(actions.filter(e=>e.key==='beam').length,6,'首波清空不能丢掉后续光束');
    assert.equal(actions.filter(e=>e.key==='pulse').length,1,'首波清空后脉冲仍须完成');
    assert.equal(actions.filter(e=>e.key==='finalBlow').length,1,'跨波脉冲后的终击仍须完成');
    assert.ok(b.log.some(e=>e.type==='damage'&&e.actor===h.id&&e.target==='wave-2'),'后续动作须按新波存活敌人重新选目标');
    assert.equal(b.planUsed.length,6,'六个计划光束都真实执行后才标记已用');
    assert.equal(b.units.find(e=>e.id===h.id).resources['源能'],0,'跨波不能重置脉冲消耗的源能');
  }
  const h=actor(1510);h.energy=h.energyMax;h.policy={...h.policy,autoUltimate:true};
  const cfg=config([h],enemy({id:'only-wave',panel:{...panel(),hp:1,speed:1}}));
  cfg.actionPlan=[{actor:h.id,key:'beam',after:{actor:h.id,key:'ultimate',kind:'ultimate',occurrence:1}},
    {actor:h.id,key:'pulse',after:{actor:h.id,key:'ultimate',kind:'ultimate',occurrence:1}}];
  const b=createBattle(cfg);assert.equal(stepBattle(b),false);
  assert.deepEqual(b.planUsed,[0],'唯一波次被清空后，已执行光束应标记已用');
  const result=simulateBattle(cfg);
  assert.deepEqual(result.plan.unused,[1],'未执行的脉冲不能因已入队而误报已用');
});

test('姬子•启行 E4/E6：抗穿全队共享、E6助战回源能且6源能时追加全体终结伤害',()=>{
  const e4=createBattle(config([actor(1510,{eidolon:4}),actor(1015),mate({id:'mate'})]));
  const [h4,ar4,m4]=e4.units,p4=h4.kit.params;
  e4.rules.after(e4,h4,'assist','followup',h4.actions.assist,[e4.units.at(-1)],[e4.units.at(-1)]);
  near(h4.buffs.find(x=>x.id===h4.id+':talent-pen').value,p4.Talent[1]+h4.kit.ranks[4][0],'E4 姬子本人应在全队基础抗穿上再加10%');
  for(const ally of [ar4,m4])near(ally.buffs.find(x=>x.id===h4.id+':talent-pen:'+ally.id).value,p4.Talent[1],'E4 应把助战抗穿共享给每名队友');

  const support=createBattle(config([actor(1510,{eidolon:6}),actor(1015)]));support.random=()=>0;
  const [h6,ar6]=support.units;ar6.distance=0;h6.distance=10000;
  ar6.policy={...ar6.policy,turnPlan:[{turn:ar6.turns+1,key:'supportSkill'}]};
  assert.equal(stepBattle(support),true);
  assert.equal(h6.resources['源能'],1,'E6 每次队友使用助战技增加1点源能');
  near(support.rules.modifiers(support,h6,support.units.at(-1),h6.actions.assist,'followup').dmgBoost,h6.kit.ranks[6][2]+h6.kit.ranks[2][0]-1,'E6 助战技伤害提高应与 E2 增伤叠加');

  const runPulse=eidolon=>{
    const cfg=config([actor(1510,{eidolon})]);cfg.units.push(enemy({id:'enemy-2'}));
    const u=cfg.units[0];u.energy=u.energyMax;u.policy={...u.policy,autoUltimate:true};
    cfg.actionPlan=Array.from({length:6},()=>({actor:u.id,key:'beam',after:{actor:u.id,key:'ultimate',kind:'ultimate',occurrence:1}}));
    const b=createBattle(cfg);
    assert.equal(stepBattle(b),true);
    return {b,u:b.units.find(t=>t.id===u.id)};
  };
  const e5=runPulse(5),e6=runPulse(6),isExtra=e=>e.type==='damage'&&e.actor===e6.u.id&&Math.abs(baseOf(e)-combatPanel(e6.u).atk*e6.u.kit.ranks[6][4])<1e-6;
  const extra=e6.b.log.filter(isExtra);
  assert.equal(e5.b.log.filter(e=>e.type==='damage'&&e.actor===e5.u.id&&Math.abs(baseOf(e)-combatPanel(e5.u).atk*1.6)<1e-6).length,0,'E5 不应产生 E6 追加段');
  assert.equal(extra.length,2,'E6 达到6点源能后应逐个命中全体敌人');
  for(const hit of extra)near(baseOf(hit),combatPanel(e6.u).atk*e6.u.kit.ranks[6][4],'追加段倍率应为 E6 #5');
});

test('远坂凛：开场 20 点【宝石能量】、战技点上限 +2、攻击力 +150% 与量子抗穿 +15%（Archer 同享）',()=>{
  const b=createBattle(config([actor(1508),actor(1015)]));b.random=()=>0;
  const [u,ar]=b.units,p=u.kit.params;
  assert.equal(u.resources['宝石能量'],p.Talent[0]);
  // 基准：不带远坂凛时 Archer（1015）自身的战技点上限加成。
  const control=createBattle(config([actor(1015)]));
  assert.equal(b.maxSP,control.maxSP+u.kit.trace[1][0],'行迹应使战技点上限 +2');
  near(combatPanel(u).atk,1000*(1+u.kit.trace[1][1]));
  assert.ok(u.buffs.some(x=>x.id===u.id+':trace6-pen'&&Math.abs(x.value-u.kit.trace[1][2])<1e-9));
  assert.ok(ar.buffs.some(x=>x.id===u.id+':trace6-atk'),'Archer 应同享攻击提高');
});

test('远坂凛：宝石能量 ≥15 时战技强化为【第二魔法实验】，按每 3 点弹射一次并消耗，战技点超过 2 时转化为能量',()=>{
  const b=createBattle(config([actor(1508)]));b.random=()=>0;
  const [u,en]=b.units,p=u.kit.params;
  b.sp=3;
  const pa=b.rules.prepare(b,u,'skill','normal',u.actions.skill);
  assert.equal(pa.name,ROSTER_DATA[1508].skills[150809].name);assert.equal(pa.enhancedSkill,true);
  assert.equal(pa.bounceCount,Math.floor(p.Talent[0]/pa.consumePer));
  const gems0=u.resources['宝石能量'];
  b.rules.before(b,u,'skill','normal',pa,[en]);
  near(u.resources['宝石能量'],gems0-pa.bounceCount*pa.consumePer+ (3-pa.drainTo)*pa.gemPerSp);
  assert.equal(b.sp,pa.drainTo,'战技点应被消耗至 2');
  // 能量不足且战技点不足时不强化
  u.resources['宝石能量']=0;b.sp=0;
  assert.equal(b.rules.prepare(b,u,'skill','normal',u.actions.skill).name,p.BPSkill&&ROSTER_DATA[1508].skills[150802].name);
});

test('远坂凛：E1 单次消耗 ≥30 点获得等量【影子宝石】；天赋按消耗/恢复战技点叠暴伤（E4 可叠 2 层）',()=>{
  const b=createBattle(config([actor(1508,{eidolon:1})]));b.random=()=>0;
  const [u,en]=b.units,p=u.kit.params;
  u.resources['宝石能量']=99;b.sp=2;
  const pa=b.rules.prepare(b,u,'skill','normal',u.actions.skill);
  b.rules.before(b,u,'skill','normal',pa,[en]);
  assert.equal(u.resources['影子宝石'],pa.bounceCount*pa.consumePer);
  assert.ok(u.resources['影子宝石']>=u.kit.ranks[1][0]);
  // 影子宝石存在时下一次强化不消耗宝石能量、不转化战技点
  const gems=u.resources['宝石能量'];b.sp=5;
  const pa2=b.rules.prepare(b,u,'skill','normal',u.actions.skill);
  assert.equal(pa2.shadow,true);
  b.rules.before(b,u,'skill','normal',pa2,[en]);
  assert.equal(u.resources['宝石能量'],gems);assert.equal(u.resources['影子宝石'],0);assert.equal(b.sp,5);
  // 天赋暴伤：队友消耗战技点
  const b2=createBattle(config([actor(1508,{eidolon:4}),mate()]));b2.random=()=>0;
  const [u2,m2,en2]=b2.units;
  b2.rules.after(b2,m2,'skill','normal',m2.actions.skill,[en2],[en2]);
  const cd=m2.buffs.find(x=>x.id===u2.id+':gem-cd:'+m2.id);
  assert.ok(cd,'消耗战技点应提高暴伤');near(cd.value,u2.kit.params.Talent[2]);
  void p;
});

test('远坂凛：Archer 施放战技后（战技点 ≤3）发动连携追加攻击，追加中 Archer 同样造成伤害并恢复 4 战技点，回合结束重置',()=>{
  const b=createBattle(config([actor(1508),actor(1015)]));b.random=()=>0;
  const [u,ar,en]=b.units;
  b.sp=2;
  b.rules.after(b,ar,'skill','normal',ar.actions.skill,[en],[en]);
  assert.equal(b.queue.filter(x=>x.actor===u.id&&x.key==='followup').length,1,'应发动自在远坂流');
  assert.equal(u.resources['自在远坂流已触发'],1);
  b.rules.after(b,ar,'skill','normal',ar.actions.skill,[en],[en]);
  assert.equal(b.queue.filter(x=>x.actor===u.id&&x.key==='followup').length,1,'同一回合只应触发一次');
  const sp0=b.sp;
  const n0=dmgOf(b,ar.id,'additional').length;
  b.rules.after(b,u,'followup','followup',u.actions.followup,[en],[en]);
  assert.equal(b.sp,sp0+ROSTER_DATA[1508].skills[150805].params['10'].param_list[1]);
  assert.ok(dmgOf(b,ar.id,'additional').length>n0,'Archer 应参与连携追加攻击');
  b.rules.onTurnEnd(b,u);
  assert.equal(u.resources['自在远坂流已触发'],0,'回合结束应重置触发次数');
});

test('远坂凛：终结技恢复 1 战技点、使敌方全体易伤 25% 三回合，并行迹 +12 / E6 +24 点宝石能量',()=>{
  for(const eidolon of [0,6]){
    const b=createBattle(config([actor(1508,{eidolon})]));b.random=()=>0;
    const [u,en]=b.units,p=u.kit.params;
    const gems0=u.resources['宝石能量'],sp0=b.sp;
    u.energy=u.energyMax;
    b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[en],[en]);
    assert.equal(b.sp,sp0+p.Ultra[3]);
    const vuln=en.buffs.find(x=>x.id===u.id+':ult');
    near(vuln.value,p.Ultra[4]);assert.equal(vuln.remaining,p.Ultra[5]);
    let expect=gems0+u.kit.trace[3][0];
    if(eidolon>=6)expect+=u.kit.ranks[6][1];
    near(u.resources['宝石能量'],expect);
    if(eidolon>=6)near(u.buffs.find(x=>x.id===u.id+':e6').value,u.kit.ranks[6][0]);
  }
});

test('第14批 6 名角色与既有四人体系混编可完成组件试算（已知缺口角色显式近似）',()=>{
  for(const id of IDS)for(const eidolon of [0,3,6]){
    const x=actor(id,{eidolon}),ar=actor(1015),s=actor(1306),ce=actor(1412);
    x.id='focus';x.energy=x.energyMax;x.policy={...x.policy,autoUltimate:true,allyTargetId:ar.id};
    s.policy.allyTargetId=ar.id;ce.policy.allyTargetId=ar.id;
    const c={strict:true,maxAV:300,sp:3,maxSP:9,seed:3,critMode:'expected',requiredAllies:4,units:[x,s,ar,ce,enemy()]};
    assert.deepEqual(validateBattle(c).map(e=>e),[]);
    const r=simulateBattle(c);
    assert.ok(r.damage>0,id+' 未造成伤害');
    assertFixtureDisclosure(r,c);
  }
});

test('第14批 角色在多波次组件试算中处理换波 / 阵亡 / 资源时序（缺口保留并显式披露）',()=>{
  for(const id of IDS){
    const x=actor(id,{eidolon:6}),ar=actor(1015),s=actor(1306),ce=actor(1412);
    x.id='focus';x.energy=x.energyMax;x.policy={...x.policy,autoUltimate:true,allyTargetId:ar.id};
    s.policy.allyTargetId=ar.id;ce.policy.allyTargetId=ar.id;
    const c={strict:true,maxAV:900,sp:3,maxSP:9,seed:7,critMode:'expected',requiredAllies:4,
      units:[x,s,ar,ce,enemy({panel:{...panel(),hp:6000,speed:1}}),enemy({id:'enemy-w2',wave:2,panel:{...panel(),hp:6000,speed:1}}),enemy({id:'enemy-w3',wave:3,panel:{...panel(),hp:6000,speed:1}})]};
    assert.deepEqual(validateBattle(c).map(e=>e),[]);
    const r=simulateBattle(c);
    assert.equal(r.outcome,'victory',id+' 未能完成三波战斗');
    assertFixtureDisclosure(r,c);
  }
});

console.log(`DeepSeek batch14 checks: ${passed} passed, ${failed} failed.`);if(failed)process.exitCode=1;
