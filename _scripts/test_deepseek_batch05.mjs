// DeepSeek 第5批：4 名虚无 / 持续伤害角色的机制测试。
// 期望值全部由 4.6 编译出的 u.kit.params / u.kit.trace / u.kit.ranks 推导，不写死倍率。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createContext} from '../core/ctx.mjs';
import {newBattleBuild,buildBattleActor} from '../simulator/builds.mjs';
import {createBattle,stepBattle,simulateBattle,validateBattle,combatPanel} from '../simulator/engine.mjs';
import {validateKitActor} from '../simulator/kits.mjs';
import {IDS} from '../simulator/characters/extra/batch05.mjs';
const data=JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url))),ctx=createContext(data);
const near=(a,b,m=1e-6)=>assert.ok(Math.abs(a-b)<m,`${a} != ${b}`);
const panel=()=>({hp:10000,atk:1000,def:1000,speed:100,critRate:.5,critDmg:1,energyRegen:1,effectHit:0,effectRes:0,breakEffect:0,baseStats:{hp:1000,atk:1000,def:1000},elemDmg:{}});
const actor=(id,extra={})=>{const a=buildBattleActor(ctx,{...newBattleBuild(),characterId:id,relicAuto:false,panel:panel(),...extra});a.energy=0;a.policy={...a.policy,autoUltimate:false};return a;};
const enemy=(extra={})=>({id:'enemy',name:'规则训练敌人',side:'enemy',level:90,element:'Physical',panel:{...panel(),hp:1e9,speed:1},energy:0,energyMax:0,res:{},actions:{basic:{name:'测试攻击',type:'Normal',terms:[{scaling:'atk',multiplier:1}],hitEnergy:10}},policy:{autoUltimate:false,basicOnly:true},...extra});
const config=(units,maxAV=201,sp=3)=>({strict:true,maxAV,sp,maxSP:9,seed:42,critMode:'noncrit',units:[...units,enemy()]});
const dmgOf=(b,who)=>b.log.filter(e=>e.type==='damage'&&e.kind==='dot'&&e.actor===who.id);
let passed=0,failed=0;const test=(name,fn)=>{try{fn();passed++;console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+'\n'+e.stack);}};

test('第5批 4 名角色 E0～E6 动作合同可编译且不能篡改倍率',()=>{
  assert.deepEqual(IDS,[1108,1111,1210,1218]);
  for(const id of IDS)for(let eidolon=0;eidolon<=6;eidolon++){
    const a=actor(id,{eidolon});assert.deepEqual(validateKitActor(a),[]);
    a.actions.basic.terms[0].multiplier=99;assert.ok(validateKitActor(a).length,'篡改普攻倍率未被发现');
  }
});

test('第5批 段数与真实脚本一致：桑博普攻 3 段、卢卡强化普攻 4 段、扩散 2 伤害项',()=>{
  const sampo=actor(1108),luka=actor(1111),gui=actor(1210),jq=actor(1218);
  assert.equal(sampo.actions.basic.hitShares.length,3);                       // Avatar_Sampo_00_Skill01_Phase02
  assert.equal(luka.actions.enhancedBasic.hitShares.length,4);                // 直冲拳 3 段 + 碎天拳 1 段
  assert.equal(luka.actions.basic.hitShares.length,1);                        // Avatar_Luka_Skill01_Phase02
  for(const a of [sampo,gui,jq])assert.ok(Math.abs(a.actions.basic.hitShares.reduce((x,y)=>x+y,0)-1)<1e-9);
  for(const a of [gui,jq]){
    assert.equal(a.actions.skill.target,'blast');
    assert.equal(a.actions.skill.terms.length,2);
    assert.equal(a.actions.skill.terms[1].target,'adjacent');
    assert.equal(a.actions.skill.toughness,60);
    assert.equal(a.actions.skill.adjacentToughness,30);
  }
});

test('桑博：战技 1 次主段 + 4 次弹射（E1 +1），每次弹射独立回能',()=>{
  for(const eidolon of [0,1]){
    const build=actor(1108,{eidolon});build.panel.speed=200;build.policy.basicOnly=false;
    const b=createBattle(config([build]));b.random=()=>0;
    const u=b.units[0],p=u.kit.params;
    const act=u.actions.skill;
    assert.equal(act.terms[0].multiplier,p.BPSkill[1]);
    assert.equal(act.bounceTerms[0].multiplier,p.BPSkill[1]);
    assert.equal(act.bounceCount,p.BPSkill[0]+(eidolon?u.kit.ranks[1][0]:0));
    near(act.toughness,30);near(act.bounceToughness,15);
    b.sp=5;stepBattle(b);
    assert.equal(b.log.filter(e=>e.type==='damage'&&e.actor===u.id).length,1+act.bounceCount);
  }
});

test('桑博：命中按天赋基础概率叠风化，层数上限 5，行迹「圈套」延长 duration',()=>{
  const build=actor(1108);const b=createBattle(config([build]));b.random=()=>0;
  const u=b.units[0],en=b.units.at(-1),p=u.kit.params;
  const dur=p.Talent[2]+(u.kit.trace[1]?u.kit.trace[1][0]:0);
  b.rules.hit(b,u,en,{type:'Normal',element:'Wind'},'direct');
  let d=en.dots.find(x=>x.windShear);
  assert.ok(d,'未施加风化');assert.equal(d.stacks,1);assert.equal(d.remaining,dur);assert.equal(d.tickOwner,en.id);
  near(d.terms[0].multiplier,p.Talent[1]+(u.kit.eidolon>=6?u.kit.ranks[6][0]:0));
  for(let i=0;i<10;i++)b.rules.hit(b,u,en,{type:'Normal',element:'Wind'},'direct');
  d=en.dots.find(x=>x.windShear);assert.equal(d.stacks,p.Talent[3]);assert.equal(d.remaining,dur,'刷新未重置 duration');
  // 概率失败：effectHit=0、基础概率 0.65 时随机值 0.999 必被抵抗。
  const b2=createBattle(config([actor(1108)]));b2.random=()=>0.999;
  b2.rules.hit(b2,b2.units[0],b2.units.at(-1),{type:'Normal',element:'Wind'},'direct');
  assert.equal(b2.units.at(-1).dots.length,0,'抵抗判定失效');
});

test('桑博：E4 战技击中风化≥5 层目标立即造成原伤害 8% 的伤害',()=>{
  const build=actor(1108,{eidolon:4});build.panel.speed=1;
  const c=config([build],400);const b=createBattle(c);b.random=()=>0;
  const u=b.units[0],en=b.units.at(-1),p=u.kit.params;
  for(let i=0;i<5;i++)b.rules.hit(b,u,en,{type:'Normal',element:'Wind'},'direct');
  // 让敌人先动：先取得一次完整的风化 tick 伤害作为基准。
  u.panel.speed=1;en.panel.speed=1000;
  stepBattle(b);
  const ticks=dmgOf(b,u);assert.equal(ticks.length,1,'风化未在敌人回合开始结算');
  const base=ticks[0].damage;
  const before=dmgOf(b,u).length;
  b.rules.hit(b,u,en,{type:'BPSkill',element:'Wind'},'direct');
  const after=dmgOf(b,u);
  assert.equal(after.length-before,1,'E4 未引爆');
  near(after.at(-1).damage,base*u.kit.ranks[4][1],1e-6);
  assert.equal(u.kit.ranks[4][0],5);
});

test('桑博：终结使敌方受到的持续伤害提高、按行迹回能；E2 风化目标阵亡后全敌叠 1 层',()=>{
  const build=actor(1108,{eidolon:2});const c=config([build]);c.units.push(enemy({id:'enemy2'}));
  const b=createBattle(c);b.random=()=>0;
  const u=b.units[0],e1=b.units[1],e2=b.units[2],p=u.kit.params;
  const before=u.energy;
  b.rules.before(b,u,'ultimate','ultimate',u.actions.ultimate,[e1,e2]);
  assert.equal(u.energy-before,u.kit.trace[2][0],'行迹「后手」未回能');
  assert.ok(e1.buffs.some(x=>x.tag==='sampoDotVuln'));
  near(b.rules.modifiers(b,u,e1,{type:'DoT',element:'Wind'},'dot').vuln,p.Ultra[1]);
  near(b.rules.modifiers(b,u,e1,{type:'Normal',element:'Wind'},'direct').vuln,0);
  b.rules.hit(b,u,e1,{type:'Normal',element:'Wind'},'direct');
  assert.equal(e1.dots.find(x=>x.windShear).stacks,1);
  assert.equal(e2.dots.length,0);
  e1.hp=0;
  b.rules.death(b,null,e1);
  assert.equal(e2.dots.find(x=>x.windShear).stacks,u.kit.ranks[2][1],'E2 未向全体叠加 1 层风化');
});

test('桑博：行迹「加料」使风化状态的敌人对桑博造成的伤害降低 15%',()=>{
  const reduction=actor(1108).kit.trace[3][0];
  const loss=shear=>{
    const build=actor(1108);build.panel.speed=1;
    const b=createBattle(config([build],400));b.random=()=>0;
    const u=b.units[0],en=b.units.at(-1);en.panel.speed=1000;
    if(shear)b.rules.hit(b,u,en,{type:'Normal',element:'Wind'},'direct');
    const hp0=u.hp;
    stepBattle(b);   // 敌人先手：回合开始时风化结算，然后攻击桑博
    return hp0-u.hp;
  };
  const plain=loss(false),reduced=loss(true);
  assert.ok(plain>0,'敌人未造成伤害');
  near(reduced,plain*(1-reduction),1e-6);
});

test('卢卡：战斗开始 1 层斗志，普攻/战技后 +1，≥2 层普攻强化并消耗 2 层',()=>{
  const build=actor(1111);const b=createBattle(config([build]));b.random=()=>0;
  const u=b.units[0],en=b.units.at(-1),p=u.kit.params;
  assert.equal(u.resources['斗志'],1);
  assert.equal(b.rules.prepare(b,u,'basic','normal',u.actions.basic).name,u.actions.basic.name);
  u.energy=0;
  b.rules.after(b,u,'basic','normal',u.actions.basic,[en],[en]);
  assert.equal(u.resources['斗志'],2);
  assert.equal(u.energy,u.kit.trace[2][0],'行迹「循环制动」未按层回能');
  const prep=b.rules.prepare(b,u,'basic','normal',u.actions.basic);
  assert.equal(prep.name,u.actions.enhancedBasic.name,'≥2 层未强化普攻');
  b.rules.before(b,u,'basic','normal',prep,[en]);
  assert.equal(u.resources['斗志'],0,'强化普攻未消耗 2 层斗志');
  void p;
});

test('卢卡：战技施加裂伤，伤害取目标生命上限 24% 与攻击力 338% 的较小值',()=>{
  const build=actor(1111);const b=createBattle(config([build]));b.random=()=>0;
  const u=b.units[0],en=b.units.at(-1),p=u.kit.params;
  b.rules.after(b,u,'skill','normal',u.actions.skill,[en],[en]);
  const d=en.dots.find(x=>x.bleed);
  assert.ok(d,'未施加裂伤');assert.equal(d.element,'Physical');assert.equal(d.remaining,p.BPSkill[4]);
  const atk=combatPanel(u).atk;
  near(d.terms[0].multiplier,Math.min(combatPanel(en).hp*p.BPSkill[2],atk*p.BPSkill[3])/atk);
  // 目标生命上限很低时按 24% 生命上限，而不是攻击力上限。
  en.panel.hp=100;en.hp=100;
  b.rules.after(b,u,'skill','normal',u.actions.skill,[en],[en]);
  near(en.dots.find(x=>x.bleed).terms[0].multiplier,100*p.BPSkill[2]/atk);
  // 行迹「动能过载」驱散 1 个增益
  en.buffs.push({id:'enemy-buff',name:'敌方增益',key:'atk',value:.1,remaining:3,tickOwner:en.id,tickAt:'end',appliedTurn:0});
  b.rules.after(b,u,'skill','normal',u.actions.skill,[en],[en]);
  assert.ok(!en.buffs.some(x=>x.id==='enemy-buff'),'战技未驱散增益');
});

test('卢卡：终结先获得 2 层斗志并施加易伤，再造成伤害；E4 每层斗志提高攻击力',()=>{
  const build=actor(1111,{eidolon:4});const b=createBattle(config([build]));b.random=()=>0;
  const u=b.units[0],en=b.units.at(-1),p=u.kit.params;
  b.rules.before(b,u,'ultimate','ultimate',u.actions.ultimate,[en]);
  assert.equal(u.resources['斗志'],1+p.Ultra[4]);
  const vuln=en.buffs.find(x=>x.key==='vuln');
  assert.ok(vuln,'终结未施加易伤');near(vuln.value,p.Ultra[2]);assert.equal(vuln.remaining,p.Ultra[3]);
  near(combatPanel(u).atk,u.panel.atk+u.panel.baseStats.atk*u.kit.ranks[4][0]*u.resources['斗志']);
  // E1：行动时目标带裂伤 → 增伤 2 回合
  b.rules.after(b,u,'skill','normal',u.actions.skill,[en],[en]);
  b.rules.onTurnStart(b,u);
  const boost=u.buffs.find(x=>x.key==='dmgBoost'&&x.value===u.kit.ranks[1][0]);
  assert.ok(boost,'E1 未在行动时提供增伤');
});

test('卢卡：碎天拳的 E6 按直冲拳段数各引爆一次裂伤，行迹 50% 追加额外段',()=>{
  const build=actor(1111,{eidolon:6});const b=createBattle(config([build]));b.random=()=>0;
  const u=b.units[0],en=b.units.at(-1);
  b.rules.after(b,u,'skill','normal',u.actions.skill,[en],[en]);
  assert.ok(en.dots.some(x=>x.bleed));
  const before=dmgOf(b,u).length;
  u.resources['斗志']=4;
  const prep=b.rules.prepare(b,u,'basic','normal',u.actions.basic);
  b.rules.before(b,u,'basic','normal',prep,[en]);
  b.rules.after(b,u,'basic','normal',prep,[en],[en]);
  assert.equal(dmgOf(b,u).length-before,3,'E6 引爆次数应等于直冲拳段数 3');
  const extra=b.log.filter(e=>e.type==='damage'&&e.kind==='direct'&&e.actor===u.id);
  assert.equal(extra.length,3,'行迹「粉碎斗志」追加段数不正确');
  assert.ok(extra.every(e=>e.damage>0));
  // 同一动作在随机值偏高时不追加额外段。
  const b2=createBattle(config([actor(1111,{eidolon:6})]));b2.random=()=>0.99;
  const u2=b2.units[0],en2=b2.units.at(-1);
  b2.rules.after(b2,u2,'skill','normal',u2.actions.skill,[en2],[en2]);
  u2.resources['斗志']=4;
  const prep2=b2.rules.prepare(b2,u2,'basic','normal',u2.actions.basic);
  b2.rules.after(b2,u2,'basic','normal',prep2,[en2],[en2]);
  assert.equal(b2.log.filter(e=>e.type==='damage'&&e.kind==='direct'&&e.actor===u2.id).length,0,'固定概率 50% 未生效');
});

test('卢卡：行迹「粉碎斗志」额外段无 StanceValue，不削韧（直冲拳 3 段 StanceValue 合计 = 注册的 60）',()=>{
  // Avatar_Luka_00_Ability.json → Avatar_Luka_Skill11_Phase02 的全部伤害节点：
  //   .OnStart[7]                                                   直冲拳第 1 段 StanceValue = 0.5*0.4*base
  //   .OnStart[10].TaskList[8].FailedTaskList[0].FailedTaskList[0]  直冲拳第 2/3 段 StanceValue = 0.5*0.3*base
  //   .OnStart[24]                                                  碎天拳（收尾）StanceValue = 0.5*base
  //   .OnStart[10].TaskList[8].SuccessTaskList[0]                   行迹额外段（_PointB3_Trigger==1）无 StanceValue
  //   .OnStart[10].TaskList[8].FailedTaskList[0].SuccessTaskList[1] 行迹额外段（_PointB3_FirstPunch==1）无 StanceValue
  // base = AvatarSkillConfig 111108.ShowStanceList[0] = 60 ⇒ 0.5*0.4*60 + 2*(0.5*0.3*60) + 0.5*60 = 12+9+9+30 = 60，
  // 正好等于注册削韧；行迹额外段未声明 StanceValue，故削韧为 0（对照 batch16 不死途额外节点带 StanceValue 才补削韧）。
  const build=actor(1111);build.panel.speed=1;
  const weak=enemy({toughnessMax:1000,weaknesses:['Physical'],standardBreak:true,rank:'normal',panel:{...panel(),hp:1e9,speed:1}});
  const c=config([build]);c.units[c.units.length-1]=weak;
  const b=createBattle(c);b.random=()=>0;
  const u=b.units[0],en=b.units.at(-1);
  assert.equal(u.kit.trace[3][0],0.5);
  assert.equal(u.actions.enhancedBasic.toughness,60);
  u.resources['斗志']=4;
  const prep=b.rules.prepare(b,u,'basic','normal',u.actions.basic);
  assert.equal(prep.name,u.actions.enhancedBasic.name,'应进入强化普攻');
  b.rules.before(b,u,'basic','normal',prep,[en]);
  const t0=en.toughness;
  b.rules.after(b,u,'basic','normal',prep,[en],[en]);
  const extras=b.log.filter(e=>e.type==='damage'&&e.kind==='direct'&&e.actor===u.id);
  assert.equal(extras.length,3,'随机值 0 时应追加 3 段额外攻击');
  assert.equal(en.toughness,t0,'行迹额外段无 StanceValue，不应削韧');
});

test('桂乃芬：战技对主目标与相邻施加灼烧，E1 降低效果抵抗，E2 提高重复施加的灼烧倍率',()=>{
  for(const eidolon of [0,1,2]){
    const build=actor(1210,{eidolon});const c=config([build]);c.units.push(enemy({id:'enemy2'}));
    const b=createBattle(c);b.random=()=>0;
    const u=b.units[0],e1=b.units[1],e2=b.units[2],p=u.kit.params;
    b.rules.after(b,u,'skill','normal',u.actions.skill,[e1],[e1,e2]);
    for(const e of [e1,e2]){
      const d=e.dots.find(x=>x.burn);
      assert.ok(d,'灼烧缺失');near(d.terms[0].multiplier,p.BPSkill[3]);assert.equal(d.remaining,p.BPSkill[4]);
    }
    if(eidolon>=1)for(const e of [e1,e2]){
      const r=e.buffs.find(x=>x.key==='effectRes');
      assert.ok(r,'E1 未降低效果抵抗');near(r.value,-u.kit.ranks[1][1]);assert.equal(r.remaining,u.kit.ranks[1][2]);
    }
    if(eidolon>=2){
      b.rules.after(b,u,'skill','normal',u.actions.skill,[e1],[e1,e2]);
      near(e1.dots.find(x=>x.burn).terms[0].multiplier,p.BPSkill[3]*(1+u.kit.ranks[2][0]));
    }
  }
});

test('桂乃芬：灼烧触发后按天赋概率叠吞火（易伤），E4 每次自己的灼烧回能，层数受上限约束',()=>{
  for(const eidolon of [0,6]){
    const build=actor(1210,{eidolon});const b=createBattle(config([build]));b.random=()=>0;
    const u=b.units[0],en=b.units.at(-1),p=u.kit.params;
    b.rules.after(b,u,'skill','normal',u.actions.skill,[en],[en]);
    u.energy=0;
    b.rules.afterDamage(b,u,en,'dot');
    const kiss=en.buffs.find(x=>x.tag==='firekiss');
    assert.ok(kiss,'未施加吞火');near(kiss.value,p.Talent[3]);assert.equal(kiss.stacks,1);assert.equal(kiss.remaining,p.Talent[4]);
    if(eidolon>=4)near(u.energy,u.kit.ranks[4][0]);
    for(let i=0;i<10;i++)b.rules.afterDamage(b,u,en,'dot');
    const max=p.Talent[5]+(eidolon>=6?u.kit.ranks[6][0]:0);
    assert.equal(en.buffs.find(x=>x.tag==='firekiss').stacks,max);
    // 非灼烧 dot 不触发吞火
    const before=en.buffs.find(x=>x.tag==='firekiss').stacks;
    en.dots.push({type:'dot',id:'other',name:'别的持续伤害',source:u.id,element:'Wind',remaining:2,tickOwner:en.id,tickAt:'end',appliedTurn:0,terms:[{scaling:'atk',multiplier:.1}]});
    b.rules.afterDamage(b,u,en,'dot');
    assert.equal(en.buffs.find(x=>x.tag==='firekiss').stacks,before);
  }
});

test('桂乃芬：终结对全体结算并立即引爆灼烧，伤害为原灼烧的 92%',()=>{
  const build=actor(1210);build.panel.speed=1;const c=config([build],400);
  const b=createBattle(c);b.random=()=>0;
  const u=b.units[0],en=b.units.at(-1),p=u.kit.params;
  b.rules.after(b,u,'skill','normal',u.actions.skill,[en],[en]);
  // 先把吞火叠满，保证引爆时易伤与 tick 时一致。
  for(let i=0;i<10;i++)b.rules.afterDamage(b,u,en,'dot');
  u.panel.speed=1;en.panel.speed=1000;
  stepBattle(b);
  const ticks=dmgOf(b,u);assert.ok(ticks.length>=1,'灼烧未结算');
  const tick=ticks.at(-1).damage;
  const before=ticks.length;
  b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[en],[en]);
  const all=dmgOf(b,u);
  assert.equal(all.length-before,1,'终结未引爆灼烧');
  near(all.at(-1).damage,tick*p.Ultra[1],1e-6);
});

test('桂乃芬：行迹缘竿让普攻施加灼烧、投狭开场提前 25%、逾锋对灼烧目标增伤 20%',()=>{
  const build=actor(1210);const b=createBattle(config([build]));b.random=()=>0;
  const u=b.units[0],en=b.units.at(-1);
  near(u.distance,10000*(1-u.kit.trace[2][0]),1e-6);
  b.rules.after(b,u,'basic','normal',u.actions.basic,[en],[en]);
  const d=en.dots.find(x=>x.burn);
  assert.ok(d,'行迹「缘竿」未让普攻施加灼烧');
  near(d.terms[0].multiplier,u.kit.params.BPSkill[3]);
  near(b.rules.modifiers(b,u,en,{type:'Normal',element:'Fire'},'direct').dmgBoost,u.kit.trace[3][0]);
});

test('椒丘：命中按天赋概率叠烬煨（易伤递增 + 灼烧），层数上限 5（E6 9）',()=>{
  for(const eidolon of [0,6]){
    const build=actor(1218,{eidolon});const b=createBattle(config([build]));b.random=()=>0;
    const u=b.units[0],en=b.units.at(-1),p=u.kit.params;
    b.rules.afterHit(b,u,en,{type:'Normal',element:'Fire'},'direct',{});
    const ember=en.buffs.find(x=>x.tag==='jiaoqiuEmber');
    const flame=en.dots.find(x=>x.ember);
    assert.ok(ember&&flame,'未施加烬煨');
    const add=1+(eidolon>=1?u.kit.ranks[1][1]:0);
    assert.equal(ember.stacks,add);
    near(ember.value,p.Talent[1]+p.Talent[2]*(add-1));assert.equal(ember.remaining,p.Talent[4]);
    near(flame.terms[0].multiplier,p.Talent[5]+(eidolon>=2?u.kit.ranks[2][0]:0));
    for(let i=0;i<20;i++)b.rules.afterHit(b,u,en,{type:'Normal',element:'Fire'},'direct',{});
    const max=eidolon>=6?u.kit.ranks[6][1]:p.Talent[3];
    assert.equal(en.buffs.find(x=>x.tag==='jiaoqiuEmber').stacks,max);
    near(en.buffs.find(x=>x.tag==='jiaoqiuEmber').value,p.Talent[1]+p.Talent[2]*(max-1));
    if(eidolon>=6)assert.equal(en.buffs.filter(x=>x.resReduction).length,7,'E6 未降低全属性抗性');
  }
});

test('椒丘：终结统一烬煨层数、展开结界（自身回合开始计时）并提高敌方受到的终结技伤害',()=>{
  const build=actor(1218);const c=config([build]);c.units.push(enemy({id:'enemy2'}));
  const b=createBattle(c);b.random=()=>0;
  const u=b.units[0],e1=b.units[1],e2=b.units[2],p=u.kit.params;
  for(let i=0;i<3;i++)b.rules.afterHit(b,u,e1,{type:'Normal'},'direct',{});
  b.turnActor=u.id;   // 模拟在椒丘自身回合内施放终结技
  b.rules.before(b,u,'ultimate','ultimate',u.actions.ultimate,[e1,e2]);
  b.turnActor=null;
  assert.equal(e1.buffs.find(x=>x.tag==='jiaoqiuEmber').stacks,3);
  assert.equal(e2.buffs.find(x=>x.tag==='jiaoqiuEmber')?.stacks,3,'终结未统一烬煨层数');
  const domain=u.buffs.find(x=>x.tag==='jiaoqiuDomain');
  assert.ok(domain,'未展开结界');assert.equal(domain.remaining,p.Ultra[3]);assert.equal(domain.tickAt,'start');
  near(b.rules.modifiers(b,u,e1,{type:'Ultra',element:'Fire'},'direct').vuln,p.Ultra[2]);
  near(b.rules.modifiers(b,u,e1,{type:'Normal',element:'Fire'},'direct').vuln,0);
  // 结界持续回合在椒丘自身回合开始时递减（tickAt:'start'）。
  u.panel.speed=200;e1.panel.speed=1;e2.panel.speed=1;
  stepBattle(b);
  assert.equal(u.buffs.find(x=>x.tag==='jiaoqiuDomain').remaining,p.Ultra[3]-1);
});

test('椒丘：结界中敌方行动按基础概率叠层且最多触发 6 次；E4 降低敌方攻击力',()=>{
  const build=actor(1218,{eidolon:4});const b=createBattle(config([build]));b.random=()=>0;
  const u=b.units[0],en=b.units.at(-1),p=u.kit.params;
  b.rules.before(b,u,'ultimate','ultimate',u.actions.ultimate,[en]);
  const down=en.buffs.find(x=>x.key==='atkPct');
  assert.ok(down,'E4 未降低敌方攻击力');near(down.value,-u.kit.ranks[4][0]);
  for(let i=0;i<12;i++)b.rules.onTurnStart(b,en);
  assert.equal(u.resources['烬煨结界触发'],p.Ultra[4],'结界触发次数不受上限约束');
  const max=p.Talent[3]+(u.kit.eidolon>=6?u.kit.ranks[6][1]:0);
  assert.ok(en.buffs.find(x=>x.tag==='jiaoqiuEmber').stacks<=max);
});

test('椒丘：行迹爟火开场回能、举炊命中转攻击、炙香给新入场敌人叠烬煨；E6 阵亡转移层数',()=>{
  const build=actor(1218,{eidolon:6});build.panel.effectHit=1.0;
  const c=config([build]);c.units.push(enemy({id:'enemy2'}));
  const b=createBattle(c);b.random=()=>0;
  const u=b.units[0],e1=b.units[1],e2=b.units[2],p=u.kit.params;
  near(u.energy,u.kit.trace[1][0]);                       // 爟火：开场 +15 能量
  const steps=Math.max(0,Math.floor((1.0-u.kit.trace[2][0])/u.kit.trace[2][1]));
  near(combatPanel(u).atk,u.panel.atk+u.panel.baseStats.atk*Math.min(u.kit.trace[2][3],steps*u.kit.trace[2][2]));
  b.rules.afterHit(b,u,e1,{type:'Normal'},'direct',{});
  b.rules.before(b,u,'ultimate','ultimate',u.actions.ultimate,[e1,e2]);
  assert.equal(u.resources['烬煨最高层'],2,'未记录烬煨最高层');
  for(const e of [e1,e2])e.buffs=e.buffs.filter(x=>x.tag!=='jiaoqiuEmber');
  b.rules.onWaveStart(b);
  for(const e of [e1,e2])assert.equal(e.buffs.find(x=>x.tag==='jiaoqiuEmber')?.stacks,2,'行迹「炙香」未给新入场敌人叠层');
  const kept=e1.buffs.find(x=>x.tag==='jiaoqiuEmber').stacks;
  const e2Before=e2.buffs.find(x=>x.tag==='jiaoqiuEmber').stacks;
  e1.hp=0;b.rules.death(b,null,e1);
  assert.equal(e2.buffs.find(x=>x.tag==='jiaoqiuEmber').stacks,e2Before+kept,'E6 未转移烬煨');
  assert.equal(b.rules.modifiers(b,u,e2,{type:'Normal',element:'Fire'},'direct').vuln,u.kit.ranks[1][0]);
});

test('第5批 4 名角色与既有四人体系混编可完成严格战斗，无未支持缺口',()=>{
  for(const id of IDS)for(const eidolon of [0,3,6]){
    const x=actor(id,{eidolon}),ar=actor(1015),s=actor(1306),ce=actor(1412);
    x.id='focus';x.energy=x.energyMax;x.policy={...x.policy,autoUltimate:true,allyTargetId:ar.id};
    s.policy.allyTargetId=ar.id;ce.policy.allyTargetId=ar.id;
    const c={strict:true,maxAV:260,sp:3,maxSP:9,seed:3,critMode:'expected',requiredAllies:4,units:[x,s,ar,ce,enemy()]};
    assert.deepEqual(validateBattle(c).map(e=>e),[]);
    const r=simulateBattle(c);
    assert.ok(r.damage>0,id+' 未造成伤害');
    assert.deepEqual(r.unsupported,[]);
  }
});

test('第5批 角色在多波次严格战斗中处理换波 / 阵亡 / 持续伤害与时序，无未支持缺口',()=>{
  for(const id of IDS){
    const x=actor(id,{eidolon:6}),ar=actor(1015),s=actor(1306),ce=actor(1412);
    x.id='focus';x.energy=x.energyMax;x.policy={...x.policy,autoUltimate:true,allyTargetId:ar.id};
    s.policy.allyTargetId=ar.id;ce.policy.allyTargetId=ar.id;
    const c={strict:true,maxAV:900,sp:3,maxSP:9,seed:7,critMode:'expected',requiredAllies:4,
      units:[x,s,ar,ce,enemy({panel:{...panel(),hp:6000,speed:1}}),enemy({id:'enemy-w2',wave:2,panel:{...panel(),hp:6000,speed:1}}),enemy({id:'enemy-w3',wave:3,panel:{...panel(),hp:6000,speed:1}})]};
    assert.deepEqual(validateBattle(c).map(e=>e),[]);
    const r=simulateBattle(c);
    assert.equal(r.outcome,'victory',id+' 未能完成三波战斗');
    assert.deepEqual(r.unsupported,[]);
  }
});

console.log(`DeepSeek batch05 checks: ${passed} passed, ${failed} failed.`);if(failed)process.exitCode=1;
