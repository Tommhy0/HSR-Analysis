// DeepSeek 第 9 批：1005 卡芙卡 / 1307 黑天鹅 / 1308 黄泉 / 1006 银狼 的机制测试。
// 期望值全部由 4.6 编译出的 kit 参数（params / trace / ranks）推导，不写死倍率；
// 时序用 b.rules.before / after / afterHit / afterDamage / onTurnStart / onWaveStart / death 直接驱动，
// 数值用伤害事件的 base 乘区（= 攻击力 × 倍率 × 分段比例）核对（引擎的 damage 日志不带动作名，
// 因此按 kind / 元素 / base 值区分动作）。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createContext} from '../core/ctx.mjs';
import {newBattleBuild,buildBattleActor} from '../simulator/builds.mjs';
import {createBattle,stepBattle,simulateBattle,validateBattle,combatPanel} from '../simulator/engine.mjs';
import {validateKitActor} from '../simulator/kits.mjs';
import {IDS} from '../simulator/characters/extra/batch09.mjs';
const data=JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url))),ctx=createContext(data);
const near=(a,b,m=1e-6,msg)=>{if(typeof m!=='number'){msg=m;m=1e-6;}assert.ok(Math.abs(a-b)<m,`${a} != ${b}${msg?' ('+msg+')':''}`);};
const panel=()=>({hp:10000,atk:1000,def:1000,speed:100,critRate:.5,critDmg:1,energyRegen:1,effectHit:0,effectRes:0,breakEffect:0,baseStats:{hp:1000,atk:1000,def:1000},elemDmg:{}});
const actor=(id,extra={})=>{const a=buildBattleActor(ctx,{...newBattleBuild(),characterId:id,relicAuto:false,panel:panel(),...extra});a.energy=0;a.policy={...a.policy,autoUltimate:false};return a;};
const enemy=(extra={})=>({id:'enemy',name:'规则训练敌人',side:'enemy',level:90,element:'Physical',panel:{...panel(),hp:1e9,speed:1},energy:0,energyMax:0,res:{},
  actions:{basic:{name:'测试攻击',type:'Normal',terms:[{scaling:'atk',multiplier:1}],hitEnergy:10}},policy:{autoUltimate:false,basicOnly:true},...extra});
// 我方木桩：用于「队友普攻触发卡芙卡追加攻击」「队友施加减益触发黄泉天赋」等需要第二名的场景。
const mate=(extra={})=>({id:'mate',name:'测试队员',side:'ally',level:80,element:'Physical',panel:{...panel(),speed:1},energy:0,energyMax:100,
  actions:{basic:{name:'测试普攻',type:'Normal',terms:[{scaling:'atk',multiplier:1}],spGain:1,energyGain:20,toughness:30},
    skill:{name:'测试战技',type:'BPSkill',terms:[{scaling:'atk',multiplier:1}],spCost:1,energyGain:30,toughness:60}},policy:{autoUltimate:false,basicOnly:true},...extra});
const config=(units,en=null,maxAV=201)=>({strict:true,maxAV,sp:3,maxSP:9,seed:42,critMode:'noncrit',units:[...units,en??enemy()]});
const baseOf=ev=>ev.formula.find(f=>f.zone==='base').value;
const dmgOf=(b,id,kind)=>b.log.filter(e=>e.type==='damage'&&e.actor===id&&(kind?e.kind===kind:true));
const arcanaOf=to=>to.buffs.find(e=>e.tag==='blackSwanArcana')?.stacks??0;
const jzcOf=to=>to.buffs.find(e=>e.tag==='acheronJzc')?.stacks??0;
const clearArcana=to=>{to.buffs=to.buffs.filter(x=>x.tag!=='blackSwanArcana');to.dots=to.dots.filter(x=>!x.arcana);};
const debuffCount=to=>to.buffs.filter(e=>e.debuff).length+to.dots.length;
// 可控随机序列：便于把「必成功的前 k 次判定」与「之后的失败判定」分开。
const seq=(...vals)=>{let i=0;return ()=>vals[Math.min(i++,vals.length-1)];};
let passed=0,failed=0;const test=(name,fn)=>{try{fn();passed++;console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+'\n'+e.stack);}};

test('batch09 4 名角色 E0～E6 动作合同可编译且不能篡改倍率',()=>{
  assert.deepEqual([...IDS].sort((a,b)=>a-b),[1005,1006,1307,1308]);
  for(const id of IDS)for(let eidolon=0;eidolon<=6;eidolon++){
    const a=actor(id,{eidolon});assert.deepEqual(validateKitActor(a),[]);assert.deepEqual(a.unsupported,[]);
    a.actions.basic.terms[0].multiplier=99;assert.ok(validateKitActor(a).length,id+' 篡改普攻倍率未被发现');}
});

test('batch09 段数 / 削韧与原始脚本一致（卡芙卡 2+3 段、银狼 3 段、黄泉 4 段、返渡 2 段）',()=>{
  const k=actor(1005),bsw=actor(1307),ac=actor(1308),sw=actor(1006);
  assert.deepEqual(k.actions.basic.hitShares,[.5,.5]);            // Avatar_Kafka_00_Skill01_Phase02：两段各 0.5
  assert.deepEqual(k.actions.skill.hitShares,[.2,.3,.5]);         // Skill02_Phase02：主目标三段
  assert.equal(k.actions.skill.terms[1].target,'adjacent');
  assert.deepEqual(k.actions.followup.hitShares,[.15,.15,.15,.15,.15,.25]);   // PassiveAtk_Ability
  assert.equal(k.actions.followup.type,'Talent');
  assert.deepEqual(bsw.actions.basic.hitShares,[1]);
  assert.equal(bsw.actions.skill.target,'blast');
  assert.equal(bsw.actions.ultimate.target,'all');
  assert.deepEqual(ac.actions.basic.hitShares,[1]);               // Skill01 两节点为互斥分支
  assert.deepEqual(ac.actions.skill.hitShares,[.1,.1,.1,.7]);     // Skill02_Phase02：主目标四段
  assert.deepEqual(ac.actions.ultimate.hitShares,[.1,.9]);        // Skill34_Phase02 黄泉返渡：两段
  assert.equal(ac.actions.basic.energyGain,0);                    // 黄泉不回能（能量即残梦）
  assert.equal(ac.energyMax,ac.kit.params.Talent[0]);
  assert.deepEqual(sw.actions.basic.hitShares,[.25,.25,.5]);      // Avatar_Silwolf_00_Skill01_Phase02
  assert.equal(sw.actions.skill.toughness,60);assert.equal(sw.actions.ultimate.toughness,90);
  for(const a of [k,bsw,ac,sw])for(const key of Object.keys(a.actions))near(a.actions[key].hitShares.reduce((x,y)=>x+y,0),1,1e-9);
});

test('卡芙卡：终结按 Ultra[3]/[2] 施加触电（行迹「荆棘」+30% 基础概率），并按 Ultra[4] 引爆已有触电',()=>{
  for(const eidolon of [0,6]){
    const b=createBattle(config([actor(1005,{eidolon})]));b.random=()=>0;
    const [u,en]=b.units,p=u.kit.params;
    b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[en],[en]);
    const d=en.dots.find(x=>x.shock);
    assert.ok(d,'终结未施加触电');
    near(d.terms[0].multiplier,p.Ultra[3]*(eidolon>=6?1+u.kit.ranks[6][0]:1));
    assert.equal(d.remaining,p.Ultra[2]+(eidolon>=6?u.kit.ranks[6][1]:0));
    assert.equal(d.tickOwner,en.id);assert.equal(d.element,'Thunder');
    const det=dmgOf(b,u.id,'dot');
    assert.equal(det.length,1,'行迹「折磨」下终结应引爆 1 次触电');
    near(baseOf(det[0]),combatPanel(u).atk*d.terms[0].multiplier*p.Ultra[4]);
    assert.equal(det[0].critMode,'noncrit','持续伤害引爆不应暴击');
  }
});

test('卡芙卡：触电在目标回合开始结算（不暴击），duration 用尽后消失，重复施加按 id 刷新',()=>{
  const b=createBattle(config([actor(1005)],enemy({panel:{...panel(),hp:1e9,speed:1000}})));
  b.random=()=>0;
  const [u,en]=b.units,p=u.kit.params;
  // 天赋追加攻击只施加触电、不引爆，便于单独观察 DoT 时序
  b.rules.after(b,u,'followup','followup',u.actions.followup,[en],[en]);
  const d=en.dots.find(x=>x.shock);
  assert.equal(d.remaining,p.Ultra[2]);assert.equal(d.tickOwner,en.id);
  const n0=dmgOf(b,u.id,'dot').length;
  stepBattle(b);                               // 敌人先手：回合开始结算触电
  const ticks=dmgOf(b,u.id,'dot').slice(n0);
  assert.equal(ticks.length,1,'触电应在目标回合开始结算 1 次');
  near(baseOf(ticks[0]),combatPanel(u).atk*d.terms[0].multiplier);
  assert.equal(ticks[0].critMode,'noncrit');
  assert.equal(en.dots.find(x=>x.shock).remaining,1,'回合结束应递减持续时间');
  // 重复施加按 id 刷新
  b.rules.after(b,u,'followup','followup',u.actions.followup,[en],[en]);
  assert.equal(en.dots.filter(x=>x.shock).length,1,'同一来源的触电不应叠加为两条');
  assert.equal(en.dots.find(x=>x.shock).remaining,p.Ultra[2],'重复施加应刷新持续时间');
  stepBattle(b);
  assert.equal(dmgOf(b,u.id,'dot').length-n0,2,'刷新后应继续按刷新后的 duration 结算');
  assert.ok(en.dots.some(x=>x.shock),'刷新后应仍有 1 回合剩余');
  stepBattle(b);
  assert.equal(dmgOf(b,u.id,'dot').length-n0,3,'duration=2 共应结算 3 次（第 1 次结算后刷新）');
  assert.ok(!en.dots.some(x=>x.shock),'duration 用尽后触电应消失');
});

test('卡芙卡：战技对处于持续伤害状态的指定目标按 BPSkill[1]=75% 引爆身上全部持续伤害（含非触电）',()=>{
  const b=createBattle(config([actor(1005)]));b.random=()=>0;
  const [u,en]=b.units,p=u.kit.params;
  b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[en],[en]);
  const tickMult=en.dots.find(x=>x.shock).terms[0].multiplier;
  en.dots.push({type:'dot',id:'extra-wind',name:'测试风化',source:u.id,element:'Wind',remaining:2,tickOwner:en.id,tickAt:'end',terms:[{scaling:'atk',multiplier:.3}]});
  const n0=dmgOf(b,u.id,'dot').length;
  b.rules.after(b,u,'skill','normal',u.actions.skill,[en],[en]);
  const det=dmgOf(b,u.id,'dot').slice(n0);
  assert.equal(det.length,2,'战技应引爆触电与风化两条持续伤害');
  near(baseOf(det.find(e=>e.element==='Thunder')),combatPanel(u).atk*tickMult*p.BPSkill[1]);
  near(baseOf(det.find(e=>e.element==='Wind')),combatPanel(u).atk*.3*p.BPSkill[1]);
  assert.ok(det.every(e=>e.critMode==='noncrit'));
});

test('卡芙卡：队友普攻后触发天赋追加攻击（每回合 1 次、6 段），并在真实战斗中结算',()=>{
  const b=createBattle(config([actor(1005),mate()]));b.random=()=>0;
  const [self,mateU,en]=b.units;
  b.rules.after(b,mateU,'basic','normal',mateU.actions.basic,[en],[en]);
  const q=b.queue.filter(x=>x.actor===self.id&&x.key==='followup');
  assert.equal(q.length,1);assert.equal(q[0].kind,'followup');assert.equal(q[0].targetId,en.id);
  b.queue.length=0;
  b.rules.after(b,mateU,'basic','normal',mateU.actions.basic,[en],[en]);
  assert.equal(b.queue.filter(x=>x.key==='followup').length,0,'同一回合不应再次触发');
  // 冷却计时者是卡芙卡自身回合：只有卡芙卡再次行动后才会重置（全场回合编号 b.turns 不适用）。
  self.turns++;b.turns++;
  b.rules.after(b,mateU,'basic','normal',mateU.actions.basic,[en],[en]);
  assert.equal(b.queue.filter(x=>x.key==='followup').length,1,'卡芙卡新回合应重新触发');
  // 追加攻击的后续效果：施加触电（Talent[1] 基础概率）
  b.rules.after(b,self,'followup','followup',self.actions.followup,[en],[en]);
  assert.ok(en.dots.some(x=>x.shock),'追加攻击未施加触电');
  near(en.dots.find(x=>x.shock).terms[0].multiplier,self.kit.params.Ultra[3]);
  // 真实战斗：队友（basicOnly、高速）普攻后卡芙卡的追加攻击被引擎结算（6 段 = PassiveAtk_Ability）
  const k=actor(1005),m=mate({panel:{...panel(),speed:300}});k.panel.speed=1;
  const rb=createBattle({strict:true,maxAV:240,sp:0,maxSP:9,seed:5,critMode:'noncrit',units:[k,m,enemy()]});
  const kk=rb.units[0];let ok=false;
  for(let i=0;i<20&&!ok;i++){stepBattle(rb);ok=rb.log.some(e=>e.type==='damage'&&e.actor===kk.id&&e.kind==='followup');}
  const seg=rb.log.filter(e=>e.type==='damage'&&e.actor===kk.id&&e.kind==='followup').length;
  assert.ok(ok,'真实战斗中队友普攻未触发卡芙卡追加攻击');
  assert.equal(seg,kk.actions.followup.hitShares.length,'追加攻击真段数应与动作表一致');
  assert.equal(seg,k.actions.followup.hitShares.length);
});

test('卡芙卡：E1 使目标受到的持续伤害提高 30%（只作用于 Dot），E2 使我方持续伤害提高 25%',()=>{
  const b=createBattle(config([actor(1005,{eidolon:2}),mate()]));b.random=()=>0;
  const [u,,en]=b.units;
  near(b.rules.modifiers(b,u,en,{type:'Normal',element:'Thunder'},'direct').dmgBoost,0);
  near(b.rules.modifiers(b,u,en,{type:'DoT',element:'Thunder'},'dot').dmgBoost,u.kit.ranks[2][0]);
  const b2=createBattle(config([actor(1005,{eidolon:1}),mate()]));b2.random=()=>0;
  const [u2,,en2]=b2.units;
  b2.rules.after(b2,u2,'followup','followup',u2.actions.followup,[en2],[en2]);
  assert.ok(en2.buffs.some(x=>x.tag==='kafkaE1'),'E1 未施加持续伤害易伤');
  near(b2.rules.modifiers(b2,u2,en2,{type:'DoT',element:'Thunder'},'dot').vuln,u2.kit.ranks[1][1]);
  near(b2.rules.modifiers(b2,u2,en2,{type:'Normal',element:'Thunder'},'direct').vuln,0);
});

test('卡芙卡：E4 触电每次产生伤害回 2 能、行迹「掠夺」触电目标阵亡回 5 能（引爆不触发 E4）',()=>{
  const b=createBattle(config([actor(1005,{eidolon:4})]));b.random=()=>0;
  const [u,en]=b.units;
  b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[en],[en]);
  u.energy=0;
  b.rules.afterDamage(b,u,en,'dot');
  near(u.energy,u.kit.ranks[4][0]);
  u.energy=0;
  b.rules.after(b,u,'skill','normal',u.actions.skill,[en],[en]);   // 引爆结算不应算「触电产生伤害」
  near(u.energy,0);
  u.energy=0;b.rules.death(b,null,en);
  near(u.energy,u.kit.trace[2][0]);
  const b2=createBattle(config([actor(1005,{eidolon:4})]));b2.random=()=>0;
  const [u2,en2]=b2.units;u2.energy=0;
  b2.rules.death(b2,null,en2);near(u2.energy,0);
});

test('卡芙卡：秘技对敌方全体造成伤害并按秘技概率施加与终结相同的触电',()=>{
  const b=createBattle(config([actor(1005,{technique:true})]));b.random=()=>0;
  const [u,en]=b.units,p=u.kit.params;
  const tech=dmgOf(b,u.id,'technique');
  assert.equal(tech.length,1,'秘技应对每个敌人造成 1 次伤害');
  near(baseOf(tech[0]),combatPanel(u).atk*p.Maze[2]);
  const d=en.dots.find(x=>x.shock);
  assert.ok(d,'秘技未施加触电');assert.equal(d.remaining,p.Maze[1]);
});

test('黑天鹅：战技按 BPSkill[1] 概率叠 1 层【奥迹】并降防（含相邻），奥迹上限 50 层',()=>{
  const c=config([actor(1307)]);c.units=[c.units[0],enemy({id:'e1'}),enemy({id:'e2'})];
  const b=createBattle(c);b.random=()=>0;
  const [self,e1,e2]=b.units,p=self.kit.params;
  clearArcana(e1);clearArcana(e2);
  b.rules.after(b,self,'skill','normal',self.actions.skill,[e1],[e1,e2]);
  for(const e of [e1,e2]){
    assert.equal(arcanaOf(e),1,'战技应各叠 1 层奥迹');
    const d=e.dots.find(x=>x.arcana);
    assert.ok(d&&d.remaining===null,'奥迹应为不会自然过期的持续伤害');
    near(d.terms[0].multiplier,p.Talent[0]);
    const dd=e.buffs.find(x=>x.key==='defShred');
    near(dd.value,p.BPSkill[3]);assert.equal(dd.remaining,p.BPSkill[4]);
  }
  for(let i=0;i<60;i++)b.rules.after(b,self,'basic','normal',self.actions.basic,[e1],[e1]);
  assert.equal(arcanaOf(e1),p.Talent[7],'奥迹层数上限应为 50');
});

test('黑天鹅：奥迹在敌方回合开始按层数结算风 DoT（倍率=Talent[0]+Talent[2]×(层数-1)）后重置为 1 层',()=>{
  const b=createBattle(config([actor(1307)],enemy({panel:{...panel(),hp:1e9,speed:1000}})));
  b.random=()=>0;
  const [u,en]=b.units,p=u.kit.params;
  clearArcana(en);
  for(let i=0;i<5;i++)b.rules.after(b,u,'basic','normal',u.actions.basic,[en],[en]);
  assert.equal(arcanaOf(en),5);
  const expected=p.Talent[0]+p.Talent[2]*4;
  b.random=seq(.999,.999,.999);
  stepBattle(b);                            // 敌人先手：回合开始结算奥迹
  const ticks=dmgOf(b,u.id,'dot');
  assert.equal(ticks.length,1,'奥迹应在敌方回合开始结算 1 次');
  near(baseOf(ticks[0]),combatPanel(u).atk*expected);
  assert.equal(ticks[0].critMode,'noncrit');
  assert.equal(arcanaOf(en),1,'奥迹结算后应重置为 1 层');
  near(en.dots.find(x=>x.arcana).terms[0].multiplier,p.Talent[0]);
});

test('黑天鹅：≥3 层对相邻造成 180% 风 DoT 并有概率叠层；≥7 层使本次持续伤害无视 20% 防御',()=>{
  const c=config([actor(1307)]);
  c.units=[c.units[0],enemy({id:'left',panel:{...panel(),hp:1e9,speed:1}}),enemy({id:'main',panel:{...panel(),hp:1e9,speed:1000}}),enemy({id:'right',panel:{...panel(),hp:1e9,speed:1}})];
  const b=createBattle(c);b.random=()=>0;
  const [self,left,main,right]=b.units,p=self.kit.params;
  for(const e of [left,main,right])clearArcana(e);
  for(let i=0;i<3;i++)b.rules.after(b,self,'basic','normal',self.actions.basic,[main],[main]);
  assert.equal(arcanaOf(main),3);
  near(b.rules.modifiers(b,self,main,{...main.dots.find(x=>x.arcana),type:'DoT'},'dot').defIgnore,0);
  b.random=seq(.999,.999,.999,.999);
  stepBattle(b);                            // main 先手
  const adj=dmgOf(b,self.id,'dot').filter(e=>e.target!=='main');
  assert.equal(adj.length,2,'≥3 层应对两个相邻目标各结算 1 次风 DoT');
  for(const e of adj)near(baseOf(e),combatPanel(self).atk*p.Talent[4]);
  // ≥7 层：奥迹本次伤害与相邻伤害无视 20% 防御
  b.random=()=>0;
  for(let i=0;i<6;i++)b.rules.after(b,self,'basic','normal',self.actions.basic,[main],[main]);
  assert.ok(arcanaOf(main)>=p.Talent[5],'奥迹层数应达到无视防御阈值');
  near(b.rules.modifiers(b,self,main,{...main.dots.find(x=>x.arcana),type:'DoT'},'dot').defIgnore,p.Talent[6]);
  near(b.rules.modifiers(b,self,main,{bsIgnoreDef:true,type:'Additional',element:'Wind'},'dot').defIgnore,p.Talent[6]);
  void left;void right;
});

test('黑天鹅：【揭露】使敌方自身回合内受到的伤害提高 25%，并使奥迹视为 4 种持续伤害状态（E1 降对应抗性）',()=>{
  const b=createBattle(config([actor(1307,{eidolon:1})]));b.random=()=>0;
  const [u,en]=b.units,p=u.kit.params;
  b.rules.before(b,u,'ultimate','ultimate',u.actions.ultimate,[en]);
  const rev=en.buffs.find(x=>x.tag==='blackSwanReveal');
  assert.ok(rev,'终结未施加【揭露】');assert.equal(rev.remaining,p.Ultra[1]);
  b.turnActor=en.id;
  near(b.rules.modifiers(b,u,en,{type:'Normal',element:'Quantum'},'direct').vuln,p.Ultra[2]);
  b.turnActor=null;
  near(b.rules.modifiers(b,u,en,{type:'Normal',element:'Quantum'},'direct').vuln,0);
  for(const el of ['Wind','Physical','Fire','Thunder'])near(b.rules.modifiers(b,u,en,{type:'Normal',element:el},'direct').resPen,u.kit.ranks[1][0]);
  near(b.rules.modifiers(b,u,en,{type:'Normal',element:'Ice'},'direct').resPen,0);
  en.buffs=en.buffs.filter(x=>x.tag!=='blackSwanReveal');
  near(b.rules.modifiers(b,u,en,{type:'Normal',element:'Wind'},'direct').resPen,0);
  en.dots.push({type:'dot',id:'shock-x',name:'测试触电',source:u.id,element:'Thunder',remaining:2,tickOwner:en.id,tickAt:'end',terms:[{scaling:'atk',multiplier:.1}]});
  near(b.rules.modifiers(b,u,en,{type:'Normal',element:'Thunder'},'direct').resPen,u.kit.ranks[1][0]);
  near(b.rules.modifiers(b,u,en,{type:'Normal',element:'Wind'},'direct').resPen,0);
});

test('黑天鹅：【揭露】期间每回合开始回 8 能（每次揭露最多 1 次）、E4 降效果抵抗 10%；第 1 次不重置奥迹',()=>{
  const b=createBattle(config([actor(1307,{eidolon:4})]));
  b.random=()=>0;
  const [u,en]=b.units,p=u.kit.params;
  clearArcana(en);
  for(let i=0;i<6;i++)b.rules.after(b,u,'basic','normal',u.actions.basic,[en],[en]);
  assert.equal(arcanaOf(en),6);
  b.rules.before(b,u,'ultimate','ultimate',u.actions.ultimate,[en]);
  near(en.buffs.find(x=>x.tag==='blackSwanE4').value,-u.kit.ranks[4][0]);
  b.random=seq(.999,.999);
  u.energy=0;
  b.rules.onTurnStart(b,en);                 // 敌方回合开始：奥迹结算 + 回能 + 第 1 次不重置
  near(u.energy,u.kit.ranks[4][1]);
  assert.equal(arcanaOf(en),6,'揭露期间第 1 次不重置奥迹');
  u.energy=0;
  b.rules.onTurnStart(b,en);                 // 第 2 次：不再回能，奥迹重置
  near(u.energy,0);
  assert.equal(arcanaOf(en),1,'揭露不重置次数用尽后应重置为 1 层');
  assert.equal(u.resources['揭露不重置已用'],p.Ultra[3]);
});

test('黑天鹅：E2 阵亡转移 6 层、E6 队友攻击按 65% 叠层且 50% 固定概率额外 +1、行迹「烛影朕兆」增伤上限',()=>{
  const c=config([actor(1307,{eidolon:6})]);
  c.units=[c.units[0],enemy({id:'main'}),enemy({id:'adj'})];
  const b=createBattle(c);b.random=()=>0;
  const [self,main,adj]=b.units,p=self.kit.params;
  for(let i=0;i<3;i++)b.rules.after(b,self,'basic','normal',self.actions.basic,[main],[main]);
  assert.ok(arcanaOf(main)>=3);
  const cur0=arcanaOf(adj);
  b.rules.death(b,null,main);
  assert.equal(arcanaOf(adj),Math.min(p.Talent[7],cur0+self.kit.ranks[2][1]+self.kit.ranks[6][2]),'E2 未按 6 层转移');
  const beforeE6=arcanaOf(adj);
  b.rules.afterHit(b,{id:'mate',side:'ally',element:'Physical'},adj,{type:'Normal',element:'Physical'},'direct',{});
  near(arcanaOf(adj)-beforeE6,2,'E6 应叠 1 层 + 固定概率额外 1 层');
  const b2=createBattle(config([actor(1307,{eidolon:6})]));b2.random=()=>0.9;
  const [s2,e2]=b2.units;
  const before2=arcanaOf(e2);
  b2.rules.afterHit(b2,{id:'mate',side:'ally',element:'Physical'},e2,{type:'Normal',element:'Physical'},'direct',{});
  assert.equal(arcanaOf(e2),before2,'E6 基础概率失败时不应叠层');
  const b3=createBattle(config([actor(1307)]));b3.random=()=>0;
  const [s3,e3]=b3.units;s3.panel.effectHit=.5;
  near(b3.rules.modifiers(b3,s3,e3,{type:'Normal',element:'Wind'},'direct').dmgBoost,s3.kit.trace[3][0]*.5);
  s3.panel.effectHit=5;
  near(b3.rules.modifiers(b3,s3,e3,{type:'Normal',element:'Wind'},'direct').dmgBoost,s3.kit.trace[3][1]);
});

test('黑天鹅：行迹「杯底端倪」开场 65% 叠 1 层、单次攻击内每受 1 次持续伤害叠 1 层且上限 3 层',()=>{
  const b=createBattle(config([actor(1307)]));b.random=()=>0;
  const [u,en]=b.units;
  clearArcana(en);
  b.rules.onWaveStart(b);                    // 逐波次事件（含第 1 波）
  assert.equal(arcanaOf(en),1,'开场行迹未叠层');
  clearArcana(en);
  b.activeAction={sequence:1234};
  for(let i=0;i<5;i++)b.rules.afterDamage(b,u,en,'dot');
  assert.equal(arcanaOf(en),u.kit.trace[2][1],'单次攻击最多叠 3 层');
  b.activeAction={sequence:1235};
  b.rules.afterDamage(b,u,en,'dot');
  assert.equal(arcanaOf(en),u.kit.trace[2][1]+1,'换一次攻击后计数应重置');
});

test('黑天鹅：秘技连锁叠层，每次成功后基础概率变为上一次的 50%，失败即停止',()=>{
  const b=createBattle(config([actor(1307,{technique:true})]));
  const [u,en]=b.units,p=u.kit.params;
  clearArcana(en);
  assert.equal(p.Maze[1],.5);
  b.random=seq(.1,.1,.9);
  b.rules.onStart(b);                        // 秘技 entry 在 onStart 内结算
  assert.equal(arcanaOf(en),3,`期望 3 层（1.5 必定成功 + 0.75/0.375 成功，0.1875 失败），实际 ${arcanaOf(en)}`);
});

test('黄泉：战斗开始 5 点残梦 + 随机敌人 5 层【集真赤】；战技获得 1 点残梦并附上 1 层（其集真赤再触发天赋）',()=>{
  const b=createBattle(config([actor(1308)]));b.random=()=>0;
  const [u,en]=b.units,p=u.kit.params;
  near(u.energy,u.kit.trace[1][0]);
  assert.equal(jzcOf(en),u.kit.trace[1][0]);
  assert.equal(u.actions.ultimate.energyCost,u.energyMax);
  b.rules.after(b,u,'skill','normal',u.actions.skill,[en],[en]);
  near(u.energy,u.kit.trace[1][0]+2*p.BPSkill[2]);
  assert.equal(jzcOf(en),u.kit.trace[1][0]+2);
});

test('黄泉：天赋在任意单位施放技能使敌方陷入负面效果时 +1 残梦 / +1 集真赤，每次技能最多 1 次',()=>{
  const b=createBattle(config([actor(1308),mate()]));b.random=()=>0;
  const [self,mateU,en]=b.units;
  const e0=self.energy,j0=jzcOf(en);
  en.buffs.push({id:'mate-debuff',name:'测试减益',key:'defShred',value:.1,remaining:2,tickOwner:en.id,tickAt:'end',appliedTurn:0,debuff:true,source:mateU.id});
  b.rules.after(b,mateU,'skill','normal',mateU.actions.skill,[en],[en]);
  near(self.energy,e0+1);assert.equal(jzcOf(en),j0+1);
  en.buffs.push({id:'mate-debuff2',name:'测试减益2',key:'defShred',value:.1,remaining:2,tickOwner:en.id,tickAt:'end',appliedTurn:0,debuff:true,source:mateU.id});
  b.rules.after(b,mateU,'skill','normal',mateU.actions.skill,[en],[en]);
  near(self.energy,e0+2);assert.equal(jzcOf(en),j0+2);
});

test('黄泉：溢出的残梦转化为【四相断我】（上限 3 层）；E2 回合开始 +1 残梦与集真赤；终结后按层数返还',()=>{
  const b=createBattle(config([actor(1308,{eidolon:2})]));b.random=()=>0;
  const [u,en]=b.units;
  u.energy=8;
  b.rules.after(b,u,'skill','normal',u.actions.skill,[en],[en]);   // +2 → 溢出 1 点
  assert.equal(u.resources['四相断我'],1,'溢出的残梦未转为四相断我');
  u.energy=u.energyMax;
  for(let i=0;i<5;i++)b.rules.after(b,u,'skill','normal',u.actions.skill,[en],[en]);
  assert.equal(u.resources['四相断我'],u.kit.trace[1][1],'四相断我层数上限应为 3');
  u.energy=0;
  const before=jzcOf(en);
  assert.equal(before,9,'【集真赤】每目标上限 9 层（原始脚本 Skill02_FlowerTotalCount < 9）');
  b.rules.onTurnStart(b,u);
  near(u.energy,1);assert.equal(jzcOf(en),Math.min(9,before+1));
  // 终结：引擎会先扣 9 点残梦，这里手动模拟
  u.energy=0;b.random=()=>0;
  b.rules.before(b,u,'ultimate','ultimate',u.actions.ultimate,[en]);
  b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[en],[en]);
  assert.equal(u.resources['四相断我'],0);
  near(u.energy,3,'3 层四相断我应返还 3 点残梦');
  assert.ok(jzcOf(en)>=1);
});

test('黄泉：终结依次结算 3 次啼泽雨斩（单体 24% + 消去集真赤的全体伤害），期间降全抗并清除集真赤',()=>{
  const c=config([actor(1308)]);
  c.units=[c.units[0],enemy({id:'main'}),enemy({id:'other'})];
  const b=createBattle(c);b.random=()=>0;
  const [self,main,other]=b.units,p=self.kit.params;
  for(let i=0;i<5;i++)b.rules.after(b,self,'skill','normal',self.actions.skill,[main],[main]);
  assert.ok(jzcOf(main)>=9,'需要 ≥9 层集真赤');
  self.resources['四相断我']=0;             // 单独验证黄泉返渡清除集真赤
  self.energy=self.energyMax-self.actions.ultimate.energyCost;
  const atk=combatPanel(self).atk,before=dmgOf(b,self.id).length;
  b.rules.before(b,self,'ultimate','ultimate',self.actions.ultimate,[main,other]);
  const slice=dmgOf(b,self.id).slice(before);
  const single=slice.filter(e=>Math.abs(baseOf(e)-atk*p.Ultra[0])<1e-6);
  const aoe=slice.filter(e=>Math.abs(baseOf(e)-atk*Math.min(p.Ultra[4],p.Ultra[1]*4))<1e-6);
  assert.equal(single.length,3,'应结算 3 次啼泽雨斩单体');
  assert.equal(aoe.length,6,'3 次 × 2 名敌人 = 6 次全体伤害');
  assert.equal(main.buffs.filter(x=>x.resReduction).length,7,'终结期间应降低全属性抗性');
  assert.ok(main.buffs.some(x=>x.weakness==='Thunder'),'终结期间应无视弱点削韧');
  assert.equal(self.buffs.find(x=>x.id===self.id+':leixin')?.stacks,self.kit.trace[3][1],'行迹「雷心」应叠满 3 层');
  b.rules.after(b,self,'ultimate','ultimate',self.actions.ultimate,[main,other],[main,other]);
  assert.equal(jzcOf(main),0,'黄泉返渡应移除所有集真赤');
  assert.equal(main.buffs.filter(x=>x.resReduction).length,0,'终结结束后应移除抗性降低');
  assert.ok(!main.buffs.some(x=>x.weakness==='Thunder'));
  const extra=dmgOf(b,self.id,'additional');
  assert.equal(extra.length,self.kit.trace[3][3],'雷心应额外造成 6 次伤害');
  for(const e of extra)near(baseOf(e),atk*self.kit.trace[3][4]);
});

test('黄泉：行迹「奈落」按队伍虚无角色数把伤害提高到 115%/160%（E2 需求 -1），E6 使普攻/战技视为终结技',()=>{
  const b1=createBattle(config([actor(1308),mate()]));b1.random=()=>0;
  const [s1]=b1.units;
  near(b1.rules.prepare(b1,s1,'basic','normal',s1.actions.basic).terms[0].multiplier,s1.kit.params.Normal[0]);
  for(const count of [1,2]){
    const u=actor(1308),mates=[actor(1006),actor(1005)].slice(0,count);
    const b=createBattle(config([u,...mates]));b.random=()=>0;
    const [self]=b.units,t=self.kit.trace[2],ratio=count>=2?t[1]:t[0];
    assert.equal(b.units.filter(x=>x.side==='ally').length,1+count);
    near(b.rules.prepare(b,self,'basic','normal',self.actions.basic).terms[0].multiplier,self.kit.params.Normal[0]*ratio);
    near(b.rules.prepare(b,self,'skill','normal',self.actions.skill).terms[0].multiplier,self.kit.params.BPSkill[0]*ratio);
    near(b.rules.prepare(b,self,'ultimate','ultimate',self.actions.ultimate).terms[0].multiplier,self.kit.params.Ultra[2]*ratio);
  }
  const b2=createBattle(config([actor(1308,{eidolon:2}),actor(1006)]));b2.random=()=>0;
  const [s2]=b2.units;
  near(b2.rules.prepare(b2,s2,'basic','normal',s2.actions.basic).terms[0].multiplier,s2.kit.params.Normal[0]*s2.kit.trace[2][1]);
  // E6：普攻 / 战技视为终结技伤害，终结技抗穿 +20%，并无视弱点削韧
  const b3=createBattle(config([actor(1308,{eidolon:6})]));b3.random=()=>0;
  const [s3,e3]=b3.units;
  assert.equal(b3.rules.prepare(b3,s3,'basic','normal',s3.actions.basic).type,'Ultra');
  near(b3.rules.modifiers(b3,s3,e3,{type:'Ultra',element:'Thunder'},'direct').resPen,s3.kit.ranks[6]);
  b3.rules.before(b3,s3,'basic','normal',s3.actions.basic,[e3]);
  assert.ok(e3.buffs.some(x=>x.weakness==='Thunder'),'E6 普攻应无视弱点削韧');
  b3.rules.after(b3,s3,'basic','normal',s3.actions.basic,[e3],[e3]);
  assert.ok(!e3.buffs.some(x=>x.id===s3.id+':e6-weakness'),'动作结束后应移除无视弱点标记');
  // E1 对带负面的目标 +18% 暴击率；E4 终结技易伤（进入战斗时，E4 标记本身是负面效果）
  const b4=createBattle(config([actor(1308,{eidolon:4})]));b4.random=()=>0;
  const [s4,e4]=b4.units;
  near(b4.rules.modifiers(b4,s4,e4,{type:'Normal',element:'Thunder'},'direct').critRate,s4.kit.ranks[1][0]);
  b4.rules.onWaveStart(b4);
  assert.ok(e4.buffs.some(x=>x.tag==='acheronE4'),'E4 未给进入战斗的敌人挂终结技易伤');
  near(b4.rules.modifiers(b4,s4,e4,{type:'Ultra',element:'Thunder'},'direct').vuln,s4.kit.ranks[4][0]);
  near(b4.rules.modifiers(b4,s4,e4,{type:'Normal',element:'Thunder'},'direct').vuln,0);
  // 无负面时不提供暴击率（先清掉行迹「赤鬼」开场附上的集真赤——它本身也是负面效果）
  const b5=createBattle(config([actor(1308,{eidolon:1})]));b5.random=()=>0;
  const [s5,e5]=b5.units;
  e5.buffs=e5.buffs.filter(x=>x.tag!=='acheronJzc');
  near(b5.rules.modifiers(b5,s5,e5,{type:'Normal',element:'Thunder'},'direct').critRate,0);
  e5.buffs.push({id:'neg',name:'负面',key:'defShred',value:.1,remaining:2,tickOwner:e5.id,tickAt:'end',debuff:true,source:s5.id});
  near(b5.rules.modifiers(b5,s5,e5,{type:'Normal',element:'Thunder'},'direct').critRate,s5.kit.ranks[1][0]);
});

test('银狼：战技按 85% 基础概率植入我方属性弱点并降低对应抗性，原有弱点不降抗；全抗降低 10%（负面≥3 时 +3%）',()=>{
  const b=createBattle(config([actor(1006),mate()]));b.random=()=>0;
  const [self,,en]=b.units,p=self.kit.params;
  b.rules.before(b,self,'skill','normal',self.actions.skill,[en]);
  const w=en.buffs.find(x=>x.tag==='silverwolfWeakness');
  assert.ok(w,'战技未植入弱点');assert.equal(w.weakness,self.element);
  assert.equal(w.remaining,p.BPSkill[2]+self.kit.trace[2][0]);
  const r=en.buffs.find(x=>x.tag==='silverwolfWeakRes');
  assert.ok(r,'未降低植入弱点对应抗性');near(r.value,p.BPSkill[3]);assert.equal(r.element,'Quantum');
  const all=en.buffs.filter(x=>String(x.id).includes(':resdown:'));
  assert.equal(all.length,7,'全属性抗性降低应登记 7 个元素');
  near(all[0].value,p.BPSkill[5]);
  // 原有弱点：不再降低对应抗性
  const b2=createBattle(config([actor(1006)]));b2.random=()=>0;
  const [s2,e2]=b2.units;e2.weaknesses=['Quantum'];
  b2.rules.before(b2,s2,'skill','normal',s2.actions.skill,[e2]);
  assert.ok(e2.buffs.some(x=>x.tag==='silverwolfWeakness'));
  assert.ok(!e2.buffs.some(x=>x.tag==='silverwolfWeakRes'),'原有弱点不应再降抗');
  b2.rules.before(b2,s2,'skill','normal',s2.actions.skill,[e2]);
  assert.equal(e2.buffs.filter(x=>x.tag==='silverwolfWeakness').length,1,'只应保留最新植入的弱点');
  // 行迹「旁注」：目标负面 ≥3 → 全抗额外 +3%
  const b3=createBattle(config([actor(1006)]));b3.random=()=>0;
  const [s3,e3]=b3.units;
  for(let i=0;i<3;i++)e3.buffs.push({id:'neg'+i,name:'负面'+i,key:'defShred',value:.01,remaining:2,tickOwner:e3.id,tickAt:'end',debuff:true,source:s3.id});
  b3.rules.before(b3,s3,'skill','normal',s3.actions.skill,[e3]);
  near(e3.buffs.find(x=>String(x.id).includes(':resdown:')).value,s3.kit.params.BPSkill[5]+s3.kit.trace[3][1]);
});

test('银狼：天赋每次攻击后按 72% 基础概率植入随机缺陷（避开已有类型），行迹「生成」延长 1 回合并在击破时再植入',()=>{
  const b=createBattle(config([actor(1006)]));b.random=()=>0;
  const [u,en]=b.units,p=u.kit.params;
  const dur=p.Talent[4]+u.kit.trace[1][0];
  b.rules.after(b,u,'basic','normal',u.actions.basic,[en],[en]);
  const bug1=en.buffs.find(x=>x.id===u.id+':bug1');
  assert.ok(bug1,'未植入攻击降低缺陷');near(bug1.value,-p.Talent[0]);assert.equal(bug1.remaining,dur);
  b.rules.after(b,u,'basic','normal',u.actions.basic,[en],[en]);
  assert.ok(en.buffs.some(x=>x.id===u.id+':bug2'),'第二次应避开已有类型选 bug2');
  assert.equal(en.buffs.find(x=>x.id===u.id+':bug2').key,'defShred');
  b.rules.after(b,u,'basic','normal',u.actions.basic,[en],[en]);
  const bug3=en.buffs.find(x=>x.id===u.id+':bug3');
  assert.ok(bug3);near(bug3.value,-p.Talent[2]);assert.equal(bug3.key,'speedPct');
  b.rules.after(b,u,'basic','normal',u.actions.basic,[en],[en]);
  assert.ok(en.buffs.some(x=>x.id===u.id+':bug1'),'三种齐全后应在三种中随机刷新');
  const b2=createBattle(config([actor(1006)]));b2.random=()=>0.9;
  const [s2,e2]=b2.units;
  b2.rules.after(b2,s2,'basic','normal',s2.actions.basic,[e2],[e2]);
  assert.equal(e2.buffs.filter(x=>String(x.id).includes(':bug')).length,0,'72% 基础概率失败不应植入缺陷');
  b2.random=()=>0;
  b2.rules.afterDamage(b2,s2,e2,'break');
  assert.equal(e2.buffs.filter(x=>String(x.id).includes(':bug')).length,1,'击破未按行迹植入缺陷');
});

test('银狼：终结降防 45%、E1 每负面回 7 能（≤5 次）、E4 每负面附加 20% 伤害（≤5 次）、E6 每负面增伤 20%（≤100%）',()=>{
  const b=createBattle(config([actor(1006,{eidolon:6})]));b.random=()=>0.9;
  const [u,en]=b.units,p=u.kit.params;
  for(let i=0;i<4;i++)en.buffs.push({id:'neg'+i,name:'负面'+i,key:'defShred',value:.01,remaining:2,tickOwner:en.id,tickAt:'end',debuff:true,source:u.id});
  u.energy=0;
  b.rules.before(b,u,'ultimate','ultimate',u.actions.ultimate,[en]);
  const down=en.buffs.find(x=>x.key==='defShred'&&x.value===p.Ultra[2]);
  assert.ok(down,'终结未降防');near(down.value,p.Ultra[2]);assert.equal(down.remaining,p.Ultra[3]);
  const before=dmgOf(b,u.id,'additional').length;
  b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[en],[en]);
  const n=debuffCount(en);
  assert.ok(n>=5,'负面效果数量应≥5');
  near(u.energy,u.kit.ranks[1][0]*Math.min(u.kit.ranks[1][1],n));
  const extra=dmgOf(b,u.id,'additional').slice(before);
  assert.equal(extra.length,Math.min(u.kit.ranks[4][1],n),'E4 附加伤害次数应≤5');
  near(baseOf(extra[0]),combatPanel(u).atk*u.kit.ranks[4][0]);
  near(b.rules.modifiers(b,u,en,{type:'Normal',element:'Quantum'},'direct').dmgBoost,Math.min(u.kit.ranks[6][1],u.kit.ranks[6][0]*n));
  // E6 上限 100%
  for(let i=0;i<10;i++)en.buffs.push({id:'more'+i,name:'负面',key:'defShred',value:.01,remaining:2,tickOwner:en.id,tickAt:'end',debuff:true,source:u.id});
  near(b.rules.modifiers(b,u,en,{type:'Normal',element:'Quantum'},'direct').dmgBoost,u.kit.ranks[6][1]);
  // 负面为 1 个时按 1 次结算
  const b2=createBattle(config([actor(1006,{eidolon:4})]));b2.random=()=>0.9;
  const [s2,e2]=b2.units;
  s2.energy=0;
  b2.rules.before(b2,s2,'ultimate','ultimate',s2.actions.ultimate,[e2]);
  const n0=dmgOf(b2,s2.id,'additional').length;
  b2.rules.after(b2,s2,'ultimate','ultimate',s2.actions.ultimate,[e2],[e2]);
  const n2=debuffCount(e2);
  assert.equal(dmgOf(b2,s2.id,'additional').length-n0,Math.min(s2.kit.ranks[4][1],n2),'E4 次数应等于负面效果数（≤5）');
  near(s2.energy,s2.kit.ranks[1][0]*Math.min(s2.kit.ranks[1][1],n2));
  // E2：进入战斗时效果抵抗降低 20%
  const b3=createBattle(config([actor(1006,{eidolon:2})]));b3.random=()=>0;
  const [s3,e3]=b3.units;
  near(e3.buffs.find(x=>x.id===s3.id+':sw-e2').value,-s3.kit.ranks[2]);
});

test('银狼：秘技对敌方全体造成 80% 量子伤害并无视弱点削韧',()=>{
  const b=createBattle(config([actor(1006,{technique:true})]));b.random=()=>0;
  const [u]=b.units,p=u.kit.params;
  const tech=dmgOf(b,u.id,'technique');
  assert.equal(tech.length,1,'秘技应对每个敌人各造成 1 次伤害');
  near(baseOf(tech[0]),combatPanel(u).atk*p.Maze[0]);
});

test('第9批 4 名角色与既有四人体系混编可完成严格战斗，无未支持缺口',()=>{
  for(const id of IDS)for(const eidolon of [0,3,6]){
    const x=actor(id,{eidolon}),ar=actor(1015),s=actor(1306),ce=actor(1412);
    x.id='focus';x.energy=x.energyMax;x.policy={...x.policy,autoUltimate:true,allyTargetId:ar.id};
    s.policy.allyTargetId=ar.id;ce.policy.allyTargetId=ar.id;
    const c={strict:true,maxAV:300,sp:3,maxSP:9,seed:3,critMode:'expected',requiredAllies:4,units:[x,s,ar,ce,enemy()]};
    assert.deepEqual(validateBattle(c).map(e=>e),[]);
    const r=simulateBattle(c);
    assert.ok(r.damage>0,id+' 未造成伤害');
    assert.deepEqual(r.unsupported,[]);
  }
});

test('第9批 角色在多波次严格战斗中处理换波 / 阵亡 / 持续伤害与时序，无未支持缺口',()=>{
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

console.log(`DeepSeek batch09 checks: ${passed} passed, ${failed} failed.`);if(failed)process.exitCode=1;
