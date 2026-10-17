// DeepSeek 第 6 批：1107 克拉拉 / 1221 云璃 / 1214 雪衣 / 1205 刃 的机制测试。
// 期望值全部由 4.6 编译出的 kit 参数（params / trace / ranks）与固定原始脚本常量推导，不写死倍率；
// 时序用 b.rules.before / after / attacked / afterDamage / onTurnStart / onTurnEnd 直接驱动，
// 数值用伤害事件的 base 乘区（= 面板基准 × 倍率）核对。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createContext} from '../core/ctx.mjs';
import {ROSTER_DATA} from '../simulator/roster-data.mjs';
import {newBattleBuild,buildBattleActor} from '../simulator/builds.mjs';
import {createBattle,stepBattle,simulateBattle,validateBattle,combatPanel} from '../simulator/engine.mjs';
import {validateKitActor} from '../simulator/kits.mjs';
import {IDS} from '../simulator/characters/extra/batch06.mjs';
const data=JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url))),ctx=createContext(data);
const near=(a,b,m=1e-6)=>assert.ok(Math.abs(a-b)<m,`${a} != ${b}`);
const same=(a,b,m=1e-6)=>Math.abs(a-b)<m;
const panel=()=>({hp:10000,atk:1000,def:1000,speed:100,critRate:.5,critDmg:1,energyRegen:1,effectHit:0,effectRes:0,breakEffect:0,baseStats:{hp:1000,atk:1000,def:1000},elemDmg:{}});
const actor=(id,extra={})=>{const a=buildBattleActor(ctx,{...newBattleBuild(),characterId:id,relicAuto:false,panel:panel(),...extra});a.energy=0;a.policy={...a.policy,autoUltimate:false};return a;};
const plain=(id='mate')=>({id,name:'测试队员',side:'ally',level:80,element:'Physical',panel:{...panel(),speed:1},energy:0,energyMax:100,
  actions:{basic:{name:'测试普攻',type:'Normal',terms:[{scaling:'atk',multiplier:1}],spGain:1,energyGain:20,toughness:30}},policy:{autoUltimate:false,basicOnly:true}});
const enemy=(extra={})=>({id:'enemy',name:'规则训练敌人',side:'enemy',level:90,element:'Physical',panel:{...panel(),hp:1e9,speed:1},energy:0,energyMax:0,res:{},
  actions:{basic:{name:'测试攻击',type:'Normal',terms:[{scaling:'atk',multiplier:1}],hitEnergy:10}},policy:{autoUltimate:false,basicOnly:true},...extra});
const toughEnemy=(extra={})=>enemy({toughnessMax:300,weaknesses:['Quantum'],standardBreak:true,rank:'elite',...extra});
const battle=(units,en=null,maxAV=201)=>({strict:true,maxAV,sp:3,maxSP:9,seed:42,critMode:'noncrit',units:[...units,en??enemy()]});
const baseOf=ev=>ev.formula.find(f=>f.zone==='base').value;
const dmgOf=(b,id,kind)=>b.log.filter(e=>e.type==='damage'&&e.actor===id&&(kind?e.kind===kind:true));
const actsOf=(b,id)=>b.log.filter(e=>e.type==='action'&&e.actor===id);
// 模拟一次动作对敌方韧性的削减：before 记录快照 → 手动扣减（引擎负责的那一步）→ after 结算。
const stride=(b,self,key,to,delta,kind='normal')=>{const a=self.actions[key];
  b.rules.before(b,self,key,kind,a,[to]);if(delta)to.toughness=Math.max(0,(to.toughness??0)-delta);
  b.rules.after(b,self,key,kind,a,[to],[to]);};
let passed=0,failed=0;const test=(name,fn)=>{try{fn();passed++;console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+'\n'+e.stack);}};

test('batch06 4 名角色 E0～E6 动作合同可编译且不能篡改倍率',()=>{
  assert.deepEqual([...IDS].sort((a,b)=>a-b),[1107,1205,1214,1221]);
  for(const id of IDS)for(let eidolon=0;eidolon<=6;eidolon++){
    const a=actor(id,{eidolon});assert.deepEqual(validateKitActor(a),[]);
    assert.deepEqual(a.unsupported,[]);
    a.actions.basic.terms[0].multiplier=99;assert.ok(validateKitActor(a).length,id+' 篡改倍率未被拒绝');}
});

test('克拉拉：被敌方攻击后给攻击者【反击标记】并反击，倍率取自 Talent[1]；天赋减伤常驻',()=>{
  const clara=actor(1107),b=createBattle(battle([clara,plain()]));
  const [self]=b.units,en=b.units.at(-1),p=self.kit.params;
  b.rules.attacked(b,self,en);
  assert.ok(en.buffs.some(e=>e.id==='klara:revenge'),'未给攻击者【反击标记】');
  const q=b.queue.find(x=>x.actor===self.id&&x.key==='counter');
  assert.ok(q&&q.kind==='followup'&&q.targetId===en.id,'反击未走 followup 事件链');
  near(b.rules.prepare(b,self,'counter','followup',self.actions.counter).terms[0].multiplier,p.Talent[1]);
  near(self.buffs.find(e=>e.key==='dmgReduction').value,p.Talent[2]);
  // 真实战斗：敌方攻击克拉拉后出现 followup 伤害事件
  const f=actor(1107),ally=plain();f.panel.speed=1;ally.panel.speed=1;
  const fast=enemy({id:'enemy',panel:{...panel(),hp:1e9,speed:400}});
  const rb=createBattle(battle([f,ally],fast,120));
  const rs=rb.units[0];let n=0;while(stepBattle(rb)&&n<60)n++;
  assert.ok(dmgOf(rb,rs.id,'followup').length>0,'真实战斗中未结算反击伤害');
  assert.ok(actsOf(rb,rs.id).some(e=>e.key==='counter'),'真实战斗中未执行反击动作');
});

test('克拉拉：标记被反击消耗；每次受击重新标记并再次反击；E6 固定概率反击',()=>{
  const clara=actor(1107),b=createBattle(battle([clara,plain()]));
  const [self]=b.units,en=b.units.at(-1);
  b.rules.attacked(b,self,en);
  assert.equal(b.queue.filter(x=>x.actor===self.id&&x.key==='counter').length,1);
  assert.ok(!en.buffs.some(e=>e.id==='klara:counter-mark'),'触发标记未被消耗');
  assert.ok(en.buffs.some(e=>e.id==='klara:revenge'),'【反击标记】应保留到战技结算');
  b.queue.length=0;
  b.rules.attacked(b,self,en);                       // 第二次受击重新标记并再次反击
  assert.equal(b.queue.filter(x=>x.actor===self.id&&x.key==='counter').length,1,'第二次受击未再次反击');
  // E6：我方其他目标遭攻击时固定概率触发（b.random 固定为 0.1 < ranks[6][0]）
  const e6=actor(1107,{eidolon:6}),b2=createBattle(battle([e6,plain()]));
  const [s2,m2]=b2.units,e2=b2.units.at(-1);
  b2.random=()=>0.1;
  b2.rules.attacked(b2,m2,e2);
  assert.ok(b2.queue.some(x=>x.actor===s2.id&&x.key==='counter'),'E6 未按固定概率触发反击');
  assert.ok(e2.buffs.some(e=>e.id==='klara:revenge'),'E6 未给攻击者上标记');
  // 概率失败时不触发（0.9 > ranks[6][0]=0.5）
  const b3=createBattle(battle([e6,plain()]));b3.random=()=>0.9;
  const [,m3]=b3.units,e3=b3.units.at(-1);
  b3.rules.attacked(b3,m3,e3);
  assert.equal(b3.queue.filter(x=>x.key==='counter').length,0);
});

test('克拉拉：终结技给 Ultra[4] 次强化反击（E6 +ranks[6][1]）、倍率 +Ultra[1] 且相邻 50%，用尽回到普通反击',()=>{
  for(const eidolon of [0,6]){
    const clara=actor(1107,{eidolon}),b=createBattle(battle([clara,plain()]));
    const [self]=b.units,en=b.units.at(-1),p=self.kit.params;
    b.rules.after(b,self,'ultimate','ultimate',self.actions.ultimate,[self],[]);
    const expected=p.Ultra[4]+(eidolon>=6?self.kit.ranks[6][1]:0);
    assert.equal(self.resources['强化反击次数'],expected);
    const ult=self.buffs.find(e=>e.tag==='klaraUlt');
    assert.ok(ult,'终结技减伤 / 强化形态未挂载');
    near(ult.value,p.Ultra[3]);assert.equal(ult.remaining,p.Ultra[2]);
    const enh=b.rules.prepare(b,self,'counter','followup',self.actions.counter);
    near(enh.terms[0].multiplier,p.Talent[1]+p.Ultra[1]);
    near(enh.terms[1].multiplier,(p.Talent[1]+p.Ultra[1])*.5);
    assert.equal(enh.terms[1].target,'adjacent');
    // 强化反击的削韧与原始脚本 Talent stance 一致（主目标 30 / 相邻 30）
    assert.equal(enh.toughness,ROSTER_DATA[1107].skills['110704'].stance[0]);
    for(let i=0;i<expected;i++)b.rules.after(b,self,'counter','followup',enh,[en],[en]);
    assert.equal(self.resources['强化反击次数'],0);
    assert.equal(b.rules.prepare(b,self,'counter','followup',self.actions.counter).terms.length,1);
    // 终结形态到期后强化次数清零（PassiveATKCount 随 WarriorMode 销毁）
    self.buffs=self.buffs.filter(e=>e.tag!=='klaraUlt');
    b.rules.onTurnEnd(b,self);
    assert.equal(self.resources['强化反击次数'],0);
  }
});

test('克拉拉：战技对被标记目标追加 BPSkill[1] 伤害，E0 清除标记 / E1 保留',()=>{
  for(const eidolon of [0,1]){
    const clara=actor(1107,{eidolon}),b=createBattle(battle([clara,plain()]));
    const [self]=b.units,en=b.units.at(-1),p=self.kit.params;
    b.rules.attacked(b,self,en);
    assert.ok(en.buffs.some(e=>e.id==='klara:revenge'));
    const before=dmgOf(b,self.id).length;
    b.rules.after(b,self,'skill','normal',self.actions.skill,[en],[en]);
    const extra=dmgOf(b,self.id).slice(before);
    assert.equal(extra.length,1,'反击标记追加伤害次数错误');
    near(baseOf(extra[0]),combatPanel(self).atk*p.BPSkill[1]);
    assert.equal(en.buffs.some(e=>e.id==='klara:revenge'),eidolon>=1,'E1 应保留反击标记');
  }
});

test('克拉拉：E4 受击减伤到自身回合开始、E2 终结加攻、行迹控制抗性与固定概率净化、行迹反击增伤',()=>{
  const clara=actor(1107,{eidolon:6}),b=createBattle(battle([clara,plain()]));
  const [self]=b.units,en=b.units.at(-1);
  const debuff={id:'bad',debuff:true,key:'speed',value:-.1,duration:2,tickOwner:self.id,tickAt:'end',appliedTurn:0};
  self.buffs.push(debuff);
  b.random=()=>0;                                        // < trace[0]，固定概率必中
  b.rules.attacked(b,self,en);
  const e4=self.buffs.find(e=>e.id===self.id+':klara-e4');
  assert.ok(e4,'E4 受击减伤未挂载');near(e4.value,self.kit.ranks[4][0]);
  assert.ok(!self.buffs.some(e=>e.id==='bad'),'行迹「家人」未解除负面效果');
  assert.equal(self.buffs.filter(e=>e.id===self.id+':klara-e4').length,1);
  // E4 减伤持续到自己的下个回合开始（真实战斗中由回合开始的计时结算移除）
  const c4=actor(1107,{eidolon:4});c4.panel.speed=100;
  const rb=createBattle(battle([c4,plain()],enemy({panel:{...panel(),hp:1e9,speed:101}}),160));
  const rs=rb.units[0];
  for(let i=0;i<50&&!rb.log.some(e=>e.type==='turn_start'&&e.actor===rs.id);i++)stepBattle(rb);
  assert.ok(rb.log.some(e=>e.type==='buff'&&e.target===rs.id&&e.name==='克拉拉 E4 · 减伤'),'真实战斗中 E4 未触发');
  assert.ok(rb.log.some(e=>e.type==='turn_start'&&e.actor===rs.id),'克拉拉未开始回合');
  assert.ok(!rs.buffs.some(e=>e.id===rs.id+':klara-e4'),'E4 减伤未在自己的回合开始时结束');
  // E2：终结技加攻按白值换算
  const atkBefore=combatPanel(self).atk;
  b.rules.after(b,self,'ultimate','ultimate',self.actions.ultimate,[self],[]);
  near(combatPanel(self).atk,atkBefore+self.panel.baseStats.atk*self.kit.ranks[2][0]);
  // 行迹「守护」控制抗性
  near(combatPanel(self).controlRes,1-(1-0)*(1-self.kit.trace[2][0]));
  // 行迹「复仇」只作用于天赋反击
  const m=b.rules.modifiers(b,self,en,self.actions.counter,'followup');
  near(m.dmgBoost,self.kit.trace[3][0]);
  assert.equal(b.rules.modifiers(b,self,en,self.actions.basic,'direct').dmgBoost??0,0);
});

test('云璃：受到敌方目标攻击后额外回 Talent[2] 能并立即反击（主目标 Talent[0] / 相邻 Talent[1]）',()=>{
  const yunli=actor(1221),b=createBattle(battle([yunli,plain()]));
  const [self,mate]=b.units,en=b.units.at(-1),p=self.kit.params;
  self.energy=0;
  b.rules.attacked(b,self,en);
  near(self.energy,p.Talent[2]);
  const q=b.queue.find(x=>x.actor===self.id&&x.key==='counter');
  assert.ok(q&&q.kind==='followup'&&q.targetId===en.id,'天赋反击未走 followup 事件链');
  const a=b.rules.prepare(b,self,'counter','followup',self.actions.counter);
  near(a.terms[0].multiplier,p.Talent[0]);
  near(a.terms[1].multiplier,p.Talent[1]);
  assert.equal(a.terms[1].target,'adjacent');
  assert.equal(a.energyGain,ROSTER_DATA[1221].skills['122104'].spBase);
  // 队友受击不会触发云璃的反击
  b.queue.length=0;b.rules.attacked(b,mate,en);
  assert.equal(b.queue.filter(x=>x.actor===self.id).length,0);
});

test('云璃：终结技进入【格挡】并嘲讽全体（持续到下一回合结束）；格挡中受击替换为【勘破•灭】',()=>{
  const yunli=actor(1221),b=createBattle(battle([yunli,plain()]));
  const [self]=b.units,en=b.units.at(-1),p=self.kit.params;
  self.energy=self.energyMax;
  b.rules.after(b,self,'ultimate','ultimate',self.actions.ultimate,[self],[]);
  assert.ok(self.buffs.some(e=>e.id==='yunli:block'),'未获得【格挡】');
  assert.equal(self.resources['格挡到期'],b.turns+1,'格挡应持续到下一个回合结束');
  assert.equal(self.resources['下次反击暴伤'],p.Ultra[1]);
  assert.ok(en.buffs.some(e=>e.id===self.id+':yunli-taunt:'+en.id),'未对敌方施加嘲讽');
  near(combatPanel(self).aggroRatio,10);
  // 终结技能量消耗来自说明 #8，而不是能量上限
  assert.equal(self.actions.ultimate.energyCost,p.Ultra[7]);
  assert.ok(p.Ultra[7]<self.energyMax);
  // 【勘破•灭】的段数与额外伤害来自原始脚本 OnStart[7]/[13]
  const sc=self.actions.superCounter;
  assert.equal(sc.hitShares.length,8);
  near(sc.hitShares.reduce((x,y)=>x+y,0),1);
  assert.equal(sc.bounceCount,p.Ultra[3]);
  near(sc.bounceTerms[0].multiplier,p.Ultra[6]);
  near(sc.terms[0].multiplier,p.Ultra[0]);near(sc.terms[1].multiplier,p.Ultra[5]);
  b.rules.attacked(b,self,en);
  assert.ok(b.queue.some(x=>x.key==='superCounter'),'格挡中受击未替换为【勘破•灭】');
  assert.ok(!self.buffs.some(e=>e.id==='yunli:block'),'触发后未移除【格挡】');
  near(b.rules.modifiers(b,self,en,sc,'followup').critDmg,p.Ultra[1]);
});

test('云璃：格挡到期未触发反击则补【勘破•斩】，行迹灼毂让下一次斩变灭',()=>{
  const yunli=actor(1221),b=createBattle(battle([yunli,plain()]));
  const [self]=b.units,en=b.units.at(-1);
  self.energy=self.energyMax;
  b.rules.after(b,self,'ultimate','ultimate',self.actions.ultimate,[self],[]);
  b.turns=self.resources['格挡到期'];
  b.rules.onTurnEnd(b,self);
  const q=b.queue.find(x=>x.actor===self.id);
  assert.ok(q&&q.key==='normalCounter','格挡结束未补【勘破•斩】');
  assert.ok(!self.buffs.some(e=>e.id==='yunli:block'));
  // 行迹「灼毂」：发动 1 次斩后，下一次斩替换为灭
  b.queue.length=0;
  b.rules.after(b,self,'normalCounter','followup',self.actions.normalCounter,[en],[en]);
  assert.equal(self.resources['灼毂'],1);
  self.energy=self.energyMax;
  b.rules.after(b,self,'ultimate','ultimate',self.actions.ultimate,[self],[]);
  b.turns=self.resources['格挡到期'];
  b.rules.onTurnEnd(b,self);
  assert.equal(b.queue.at(-1).key,'superCounter','灼毂未把下一次斩替换为灭');
  assert.equal(self.resources['灼毂'],0);
});

test('云璃：E6 格挡期间敌方施放技能触发【勘破•灭】；E1/E2/E4/E6 增伤与命中加成',()=>{
  const yunli=actor(1221,{eidolon:6}),b=createBattle(battle([yunli,plain()]));
  const [self]=b.units,en=b.units.at(-1),p=self.kit.params;
  self.energy=self.energyMax;
  b.rules.after(b,self,'ultimate','ultimate',self.actions.ultimate,[self],[]);
  b.rules.before(b,en,'skill','normal',{type:'BPSkill',target:'single'},[self]);
  assert.ok(b.queue.some(x=>x.actor===self.id&&x.key==='superCounter'),'E6 未在敌方施放技能时触发【勘破•灭】');
  assert.ok(!self.buffs.some(e=>e.id==='yunli:block'));
  const sc=self.actions.superCounter,nc=self.actions.normalCounter,ta=self.actions.counter;
  // E1：额外 3 次伤害 + 斩/灭增伤
  assert.equal(sc.bounceCount,p.Ultra[3]+self.kit.ranks[1][1]);
  near(b.rules.modifiers(b,self,en,nc,'followup').dmgBoost,self.kit.ranks[1][0]);
  assert.equal(b.rules.modifiers(b,self,en,ta,'followup').dmgBoost??0,0);
  // E2：反击无视防御
  near(b.rules.modifiers(b,self,en,ta,'followup').defIgnore,self.kit.ranks[2][0]);
  // E6：斩/灭暴击率与物理抗穿
  const m=b.rules.modifiers(b,self,en,sc,'followup');
  near(m.critRate,self.kit.ranks[6][0]);near(m.resPen,self.kit.ranks[6][1]);
  assert.equal(b.rules.modifiers(b,self,en,ta,'followup').critRate??0,0);
  // 行迹「真刚」：反击时攻击力 +30%（作用在本次反击伤害之前）
  b.rules.before(b,self,'normalCounter','followup',nc,[en]);
  near(self.buffs.find(e=>e.id===self.id+':yunli-zhengang').value,self.kit.trace[3][0]);
  // E4：斩/灭后效果抵抗
  b.rules.after(b,self,'normalCounter','followup',nc,[en],[en]);
  const e4=self.buffs.find(e=>e.id===self.id+':yunli-e4');
  assert.ok(e4,'E4 效果抵抗未挂载');
  near(e4.value,self.kit.ranks[4][0]);assert.equal(e4.remaining,self.kit.ranks[4][1]);
});

test('云璃：战技治疗按 BPSkill[2] 攻击力 + BPSkill[3]，扩散倍率与削韧来自 4.6 数据',()=>{
  const yunli=actor(1221);yunli.panel.speed=200;yunli.currentHp=1000;
  const b=createBattle(battle([yunli,plain()]));
  const [self]=b.units,p=self.kit.params;
  let n=0;while(stepBattle(b)&&n<3)n++;
  assert.ok(actsOf(b,self.id).some(a=>a.key==='skill'),'云璃未施放战技');
  const heal=b.log.filter(e=>e.type==='heal'&&e.actor===self.id).at(-1);
  assert.ok(heal,'战技未治疗自身');
  near(heal.amount,Math.min(combatPanel(self).hp-1000,combatPanel(self).atk*p.BPSkill[2]+p.BPSkill[3]));
  const d=self.actions.skill;
  near(d.terms[0].multiplier,p.BPSkill[0]);near(d.terms[1].multiplier,p.BPSkill[1]);
  assert.equal(d.toughness,ROSTER_DATA[1221].skills['122102'].stance[0]);
  assert.equal(d.adjacentToughness,ROSTER_DATA[1221].skills['122102'].stance[2]);
});

test('雪衣：自己削韧 30 换 1 层、按份数叠加，队友固定 Talent[2] 层，上限 8（E6 6）与溢出 trace3',()=>{
  for(const eidolon of [0,6]){
    const x=actor(1214,{eidolon}),b=createBattle(battle([x,plain()],toughEnemy({toughnessMax:3000})));
    const [self,mate]=b.units,en=b.units.at(-1),p=self.kit.params;
    const cap=eidolon>=6?self.kit.ranks[6][0]:p.Talent[0];
    stride(b,self,'basic',en,30);
    assert.equal(self.resources['恶报'],1,'30 点削韧应记 1 层');
    stride(b,self,'skill',en,60);
    assert.equal(self.resources['恶报'],3,'60 点削韧应记 2 层');
    // 队友削减韧性固定 Talent[2] 层
    stride(b,mate,'basic',en,30,undefined);   // plain 单位无 actions 校验问题
    assert.equal(self.resources['恶报'],3+p.Talent[2]);
    // 队友不削韧（delta=0）不加层
    stride(b,mate,'basic',en,0);
    assert.equal(self.resources['恶报'],3+p.Talent[2]);
    // 一次超大削韧：先补满上限，溢出按 trace[0] 累计，并立即触发追加攻击
    b.queue.length=0;
    const layers=self.resources['恶报'];                    // 目前层数（3+Talent[2]）
    stride(b,self,'ultimate',en,(cap-layers)*30+300);       // 补满 cap-layers 层后再溢出 10 份
    assert.equal(self.resources['恶报'],0,'满层应立即消耗并触发追加攻击');
    assert.ok(b.queue.some(q=>q.actor===self.id&&q.key==='followup'),'满层未触发天赋追加攻击');
    assert.equal(self.resources['恶报溢出'],Math.min(self.kit.trace[3][0],10),'溢出层数未按行迹上限累计');
  }
});

test('雪衣：满层追加攻击 3 次随机单体 Talent[1]，清空层数并在结算后返还溢出层数',()=>{
  const x=actor(1214),b=createBattle(battle([x,plain()],toughEnemy()));
  const [self]=b.units,en=b.units.at(-1),p=self.kit.params;
  const cap=p.Talent[0];
  b.queue.length=0;
  stride(b,self,'ultimate',en,cap*30+60);            // 记 (cap+2) 层 → 溢出 2
  assert.equal(self.resources['恶报'],0);
  assert.equal(self.resources['恶报溢出'],2);
  const q=b.queue.find(x2=>x2.actor===self.id&&x2.key==='followup');
  assert.ok(q&&q.kind==='followup');
  const f=self.actions.followup;
  assert.equal(f.bounceCount,3,'天赋追加攻击应为 3 次伤害');
  near(f.bounceTerms[0].multiplier,p.Talent[1]);
  assert.equal(f.bounceToughness,ROSTER_DATA[1214].skills['121404'].stance[0]);
  // 结算追加攻击：溢出层数返还
  b.rules.before(b,self,'followup','followup',f,[en]);
  b.rules.after(b,self,'followup','followup',f,[en],[en]);
  assert.equal(self.resources['恶报溢出'],0);
  assert.equal(self.resources['恶报'],2,'追加攻击后未获得溢出的【恶报】');
});

test('雪衣：终结技无视弱点削韧并按本次削韧量增伤（每 30 点 1 份，上限 Ultra[2]）',()=>{
  for(const [tough,units] of [[120,4],[60,2],[30,1]]){
    const x=actor(1214),b=createBattle(battle([x,plain()],toughEnemy()));
    const [self]=b.units,en=b.units.at(-1),p=self.kit.params;
    en.toughness=tough;
    b.rules.before(b,self,'ultimate','ultimate',self.actions.ultimate,[en]);
    near(self.resources['终结增伤'],Math.min(p.Ultra[2],p.Ultra[1]*units));
    assert.ok(en.buffs.some(e=>e.weakness==='Quantum'),'终结技未获得无视弱点的削韧标记');
    const m=b.rules.modifiers(b,self,en,self.actions.ultimate,'direct');
    assert.ok(m.dmgBoost>=self.resources['终结增伤'],'终结技增伤未进入乘区');
    b.rules.after(b,self,'ultimate','ultimate',self.actions.ultimate,[en],[en]);
    assert.ok(!en.buffs.some(e=>e.weakness==='Quantum'),'终结技后未移除临时弱点标记');
  }
  // 真实战斗：量子弱点敌人被终结技削韧并击破
  const x=actor(1214);x.panel.speed=200;x.energy=x.energyMax;x.policy={...x.policy,autoUltimate:true};
  const e=toughEnemy({panel:{...panel(),hp:1e9,speed:1}});
  const b=createBattle(battle([x,plain()],e,200));
  const self=b.units[0];let n=0;while(stepBattle(b)&&n<40)n++;
  assert.ok(actsOf(b,self.id).some(a=>a.key==='ultimate'),'未施放终结技');
  assert.ok(b.units.at(-1).broken===true||b.units.at(-1).toughness<e.toughnessMax,'终结技未削减韧性');
});

test('雪衣：行迹预兆机杼按击破特攻增伤且封顶，摧锋轴承按韧性比例，E1 追加攻击增伤，E4 击破特攻',()=>{
  const x=actor(1214,{eidolon:4}),b=createBattle(battle([x,plain()],toughEnemy()));
  const [self]=b.units,en=b.units.at(-1);
  const t1=self.kit.trace[1],t2=self.kit.trace[2];
  self.panel.breakEffect=1.5;
  near(b.rules.modifiers(b,self,en,self.actions.basic,'direct').dmgBoost,Math.min(t1[1],1.5*t1[0]));
  self.panel.breakEffect=t1[1]/t1[0]+5;
  near(b.rules.modifiers(b,self,en,self.actions.basic,'direct').dmgBoost,t1[1]);
  self.panel.breakEffect=0;
  // 摧锋轴承：目标当前韧性 ≥ 上限 50%
  en.toughness=en.toughnessMax;
  assert.ok(b.rules.modifiers(b,self,en,self.actions.ultimate,'direct').dmgBoost>=t2[1]);
  en.toughness=en.toughnessMax*t2[0]-1;
  assert.ok(b.rules.modifiers(b,self,en,self.actions.ultimate,'direct').dmgBoost<t2[1]);
  // E1：天赋追加攻击增伤
  near(b.rules.modifiers(b,self,en,self.actions.followup,'followup').dmgBoost,self.kit.ranks[1][0]);
  // E4：终结技时击破特攻（原始脚本在伤害之前生效）
  b.rules.before(b,self,'ultimate','ultimate',self.actions.ultimate,[en]);
  const be=self.buffs.find(e=>e.name==='雪衣 E4 · 击破特攻');
  assert.ok(be,'E4 击破特攻未挂载');
  near(be.value,self.kit.ranks[4][0]);assert.equal(be.remaining,self.kit.ranks[4][1]);
  assert.ok(b.rules.modifiers(b,self,en,self.actions.ultimate,'direct').dmgBoost>=Math.min(t1[1],self.kit.ranks[4][0]*t1[0]),
    'E4 击破特攻未通过行迹「预兆机杼」转为终结技增伤');
  b.rules.after(b,self,'ultimate','ultimate',self.actions.ultimate,[en],[en]);
});

test('雪衣：E2 追加攻击无视弱点削韧并回复 ranks[2] 生命上限',()=>{
  const x=actor(1214,{eidolon:2}),b=createBattle(battle([x,plain()],toughEnemy({weaknesses:[]})));
  const [self]=b.units,en=b.units.at(-1);
  self.hp=1000;
  b.rules.before(b,self,'followup','followup',self.actions.followup,[en]);
  assert.ok(en.buffs.some(e=>e.weakness==='Quantum'),'E2 未让追加攻击无视弱点削韧');
  near(self.hp,1000+combatPanel(self).hp*self.kit.ranks[2][0]);
  b.rules.after(b,self,'followup','followup',self.actions.followup,[en],[en]);
  assert.ok(!en.buffs.some(e=>e.weakness==='Quantum'),'追加攻击后未移除临时弱点');
});

test('刃：充能按受伤 / 消耗生命各 +1，每次受击最多 1 层，上限 5（E6 4），满层触发追加攻击',()=>{
  for(const eidolon of [0,6]){
    const ren=actor(1205,{eidolon}),b=createBattle(battle([ren,plain()]));
    const [self]=b.units,en=b.units.at(-1),p=self.kit.params;
    const cap=eidolon>=6?4:5;
    assert.equal(self.resources['充能上限'],cap);
    // 同一次攻击（同一 activeAction.sequence）多段只记 1 层
    b.activeAction={sequence:7,actor:en.id};
    for(let i=0;i<3;i++)b.rules.afterDamage(b,en,self,'direct');
    assert.equal(self.resources['充能'],1,'同一次攻击叠加了多层充能');
    b.activeAction={sequence:8,actor:en.id};
    b.rules.afterDamage(b,en,self,'direct');
    assert.equal(self.resources['充能'],2);
    // 消耗生命值 +1（真实技能动作：hpConsume 事件；追加攻击会清空充能，所以只走到强化普攻为止）
    const rx=actor(1205,{eidolon});rx.panel.speed=200;
    const rb=createBattle(battle([rx,plain()]));
    const rs=rb.units[0];
    for(let i=0;i<5&&!actsOf(rb,rs.id).some(a=>a.kind==='extra');i++)stepBattle(rb);
    assert.ok(actsOf(rb,rs.id).some(a=>a.kind==='extra'),'未走到强化普攻的额外回合');
    assert.ok((rs.resources['充能']??0)>=2,'消耗生命值未增加充能');
    // 满层触发追加攻击（上限由原始脚本 FixedValue 决定：5 / E6 4）
    const b2=createBattle(battle([actor(1205,{eidolon}),plain()]));
    const s2=b2.units[0];b2.activeAction={sequence:1,actor:'enemy'};
    for(let i=0;i<cap+3;i++){b2.activeAction={sequence:i+1,actor:'enemy'};b2.rules.afterDamage(b2,b2.units.at(-1),s2,'direct');}
    assert.ok(b2.queue.some(q=>q.actor===s2.id&&q.key==='followup'),'满层未触发天赋追加攻击');
    void p;
  }
});

test('刃：地狱变消耗 BPSkill[0] 生命上限、不回能、本回合不结束（额外回合），期间普攻强化为无间剑树且不能施放战技',()=>{
  const ren=actor(1205);ren.panel.speed=200;
  const b=createBattle(battle([ren,plain()]));
  const self=b.units[0],p=self.kit.params;
  const hp0=combatPanel(self).hp;
  for(let i=0;i<3&&!actsOf(b,self.id).some(a=>a.kind==='extra');i++)stepBattle(b);
  assert.ok(actsOf(b,self.id).some(a=>a.key==='skill'&&a.kind==='normal'));
  assert.ok(self.buffs.some(e=>e.tag==='renHell'),'未进入【地狱变】');
  assert.equal(self.actions.skill.energyGain,0,'地狱变不应回能');
  near(self.resources['累计已损失生命值'],hp0*p.BPSkill[0]+self.actions.enhancedBasic.effects[0].multiplier*hp0);
  assert.equal(b.rules.shouldUseSkill(b,self),false,'地狱变期间不应施放战技');
  assert.equal(b.rules.prepare(b,self,'basic','normal',self.actions.basic).name,self.actions.enhancedBasic.name);
  // 强化普攻 = 独立技能记录 120508 的同级参数：0.4 倍攻击力 + 1.0 倍生命上限（4.6 数据关系）
  const en=ROSTER_DATA[1205].skills['120508'].params['6'].param_list;
  assert.equal(self.actions.enhancedBasic.terms[0].multiplier,en[1]);
  assert.equal(self.actions.enhancedBasic.terms[1].multiplier,en[3]);
  assert.equal(self.actions.enhancedBasic.spGain,0,'无间剑树不应恢复战技点');
  assert.equal(self.actions.enhancedBasic.energyGain,ROSTER_DATA[1205].skills['120508'].spBase);
  assert.equal(self.actions.enhancedBasic.effects[0].multiplier,en[0]);
  // 记录“施放战技后本回合不会结束”：动作序列里出现 kind='extra' 的普攻
  assert.ok(actsOf(b,self.id).some(a=>a.kind==='extra'),'地狱变未产生额外回合');
});

test('刃：终结技把当前生命值转化为上限 50%，按累计已损失生命结算（上限 Ultra[6]），E1 额外项，施放后清空',()=>{
  for(const eidolon of [0,1]){
    // ① 形态/项数：先真实走一步（地狱变 + 强化普攻消耗生命）拿到“本场累计已损失生命值”
    const ren=actor(1205,{eidolon});ren.panel.speed=200;
    const b=createBattle(battle([ren,plain()]));
    const [self]=b.units,en=b.units.at(-1),p=self.kit.params;
    for(let i=0;i<1;i++)stepBattle(b);       // 第 1 回合：地狱变（30% 生命）+ 额外回合强化普攻（10% 生命）
    assert.ok(self.resources['累计已损失生命值']>0,'消耗生命未计入累计已损失生命');
    const max=combatPanel(self).hp;
    const conv=Math.max(0,self.hp-max*.5);                  // 终结技把生命值转为上限 50%
    const lost=Math.min(p.Ultra[6]*max,self.resources['累计已损失生命值']+conv);
    const ratio=lost/max;
    const prep=b.rules.prepare(b,self,'ultimate','ultimate',self.actions.ultimate);
    const hpTerms=prep.terms.filter(t=>t.scaling==='hp');
    assert.ok(hpTerms.some(t=>!t.target&&same(t.multiplier,p.Ultra[1])));
    assert.ok(hpTerms.some(t=>!t.target&&same(t.multiplier,p.Ultra[4]*ratio)),'未按累计已损失生命追加主目标项');
    assert.ok(hpTerms.some(t=>t.target==='adjacent'&&same(t.multiplier,p.Ultra[5]*ratio)),'相邻项未按累计已损失生命结算');
    if(eidolon>=1)assert.ok(hpTerms.some(t=>!t.target&&same(t.multiplier,self.kit.ranks[1][0]*ratio)),'E1 额外项缺失');
    b.rules.before(b,self,'ultimate','ultimate',self.actions.ultimate,[en]);
    assert.ok(same(self.hp,max*.5),'终结技未把生命值转化为上限 50%');
    b.rules.after(b,self,'ultimate','ultimate',prep,[en],[en]);
    assert.equal(self.resources['累计已损失生命值'],0,'终结技后未清空累计已损失生命');
    // ② 实际伤害：真实战斗中终结技主目标基座 = 攻击力项 + 生命上限项 + 累计已损失生命项
    const ren2=actor(1205,{eidolon});ren2.panel.speed=200;
    const b2=createBattle(battle([ren2,plain()]));
    const [s2]=b2.units;
    for(let i=0;i<1;i++)stepBattle(b2);
    const max2=combatPanel(s2).hp;
    const ledger=s2.resources['累计已损失生命值'];
    s2.energy=s2.energyMax;s2.policy={...s2.policy,autoUltimate:true};
    let guard=0;while(!actsOf(b2,s2.id).some(a=>a.key==='ultimate')&&guard++<10)stepBattle(b2);
    assert.ok(actsOf(b2,s2.id).some(a=>a.key==='ultimate'),'未施放终结技');
    const start=b2.log.findIndex(e=>e.type==='action'&&e.actor===s2.id&&e.key==='ultimate');
    const ev=b2.log.slice(start).find(e=>e.type==='damage'&&e.actor===s2.id&&e.role==='primary');
    const ratio2=Math.min(p.Ultra[6]*max2,ledger+Math.max(0,max2-ledger-max2*.5))/max2;
    const base=combatPanel(s2).atk*p.Ultra[0]+max2*p.Ultra[1]+max2*p.Ultra[4]*ratio2+
      (eidolon>=1?max2*s2.kit.ranks[1][0]*ratio2:0);
    near(baseOf(ev),base);
  }
});

test('刃：E4 生命上限阈值叠层、E2 地狱变暴击、行迹无尽形寿与坏劫隳亡、吞忍百死治疗',()=>{
  const ren=actor(1205,{eidolon:6}),b=createBattle(battle([ren,plain()]));
  const [self]=b.units,en=b.units.at(-1);
  // E4：从 >50% 降到 ≤50% 触发，最多 ranks[4][1] 层
  for(let i=0;i<self.kit.ranks[4][1]+1;i++){
    self.hp=combatPanel(self).hp;
    const before=combatPanel(self).hp;
    b.rules.before(b,self,'ultimate','ultimate',self.actions.ultimate,[en]);
    assert.ok(combatPanel(self).hp>=before,'生命上限未随 E4 提高');
  }
  const e4=self.buffs.find(e=>e.id===self.id+':ren-e4');
  assert.ok(e4,'E4 未叠层');assert.equal(e4.stacks,self.kit.ranks[4][1]);
  near(e4.value,self.kit.ranks[4][0]*self.kit.ranks[4][1]);
  // E2：地狱变期间暴击率
  b.rules.after(b,self,'skill','normal',self.actions.skill,[self],[]);
  near(b.rules.modifiers(b,self,en,self.actions.basic,'direct').critRate,self.kit.ranks[2][0]);
  // 行迹「坏劫隳亡」：天赋追加攻击增伤
  near(b.rules.modifiers(b,self,en,self.actions.followup,'followup').dmgBoost,
    self.kit.params.BPSkill[3]+self.kit.trace[3][0]);
  // 行迹「无尽形寿」：≤50% 时治疗加成
  self.hp=combatPanel(self).hp*.4;
  near(combatPanel(self).incomingHeal,self.kit.trace[1][0]);
  self.hp=combatPanel(self).hp;
  assert.equal(combatPanel(self).incomingHeal??0,0);
  // 行迹「吞忍百死」：无间剑树击中击破目标回复生命（此时生命值 ≤50%，行迹「无尽形寿」再放大 20%）
  en.broken=true;self.hp=1000;
  const healRaw=combatPanel(self).hp*self.kit.trace[2][0]+self.kit.trace[2][1];
  b.rules.after(b,self,'basic','normal',self.actions.enhancedBasic,[en],[en]);
  near(self.hp,1000+healRaw*(1+self.kit.trace[1][0]));
});

test('刃：天赋追加强化攻击为全体 3 段（0.33/0.33/0.34）并按 E6 追加生命上限项、施放后回 Talent[2] 生命',()=>{
  const ren=actor(1205,{eidolon:6}),b=createBattle(battle([ren,plain()]));
  const [self]=b.units,en=b.units.at(-1),p=self.kit.params;
  const f=self.actions.followup;
  assert.equal(f.target,'all');
  assert.equal(f.hitShares.length,3);
  near(f.hitShares.reduce((x,y)=>x+y,0),1);
  near(f.hitShares[0],ROSTER_DATA[1205].hits['Avatar_Ren_00_Passive1Atk02_Ability'][0]);
  near(f.terms[0].multiplier,p.Talent[1]);near(f.terms[1].multiplier,p.Talent[3]);
  const prep=b.rules.prepare(b,self,'followup','followup',f);
  assert.ok(prep.terms.some(t=>t.scaling==='hp'&&same(t.multiplier,self.kit.ranks[6][0])),'E6 未追加生命上限项');
  self.hp=1000;
  const healRaw=combatPanel(self).hp*p.Talent[2];
  b.rules.after(b,self,'followup','followup',prep,[en],[en]);
  // 生命值 ≤50% 时行迹「无尽形寿」使受到治疗的回复量 +trace[1][0]
  near(self.hp,1000+healRaw*(1+self.kit.trace[1][0]));
  assert.equal(self.resources['充能'],0,'施放追加攻击后未消耗全部充能');
});

test('雪衣：真实战斗中叠满【恶报】触发天赋追加攻击（量子弱点敌人）',()=>{
  const x=actor(1214);x.panel.speed=200;x.energy=x.energyMax;x.policy={...x.policy,autoUltimate:true};
  const e=toughEnemy({panel:{...panel(),hp:1e9,speed:1}});
  const b=createBattle(battle([x,plain()],e,200));
  const self=b.units[0];let n=0;while(stepBattle(b)&&n<40)n++;
  assert.ok(actsOf(b,self.id).some(a=>a.key==='followup'),
    '真实战斗中叠满【恶报】后未触发天赋追加攻击');
  assert.ok(dmgOf(b,self.id,'followup').length>0);
});

test('batch06 秘技：克拉拉仇恨、云璃后发先至【勘破•灭】、雪衣斩立决削韧叠层、刃业途风消耗生命',()=>{
  const maze=id=>Object.values(ROSTER_DATA[id].skills).find(s=>s.type==='Maze');
  // 克拉拉「胜利的小小代价」：AggroAddedRatio +Maze[1]，持续 Maze[0] 回合
  {
    const clara=actor(1107,{technique:true});
    const b=createBattle(battle([clara,plain()],toughEnemy({weaknesses:['Physical']})));
    const self=b.units[0],en=b.units.at(-1);
    const buff=self.buffs.find(e=>e.tag==='klaraMaze');
    assert.ok(buff,'秘技仇恨未挂载');
    assert.equal(buff.remaining,self.kit.params.Maze[0]);
    near(combatPanel(self).aggroRatio,1+self.kit.params.Maze[1]);
    const ev=dmgOf(b,self.id,'technique');
    assert.equal(ev.length,1);
    near(baseOf(ev[0]),combatPanel(self).atk*self.kit.params.Normal[0]);
    near(en.toughness,en.toughnessMax-maze(1107).stance[0]);
  }
  // 云璃「后发先至」：进入战斗立即施放【勘破•灭】，本次伤害 +Maze[0]
  {
    const yunli=actor(1221,{technique:true});
    const b=createBattle(battle([yunli,plain()]));
    const self=b.units[0],en=b.units.at(-1);
    const q=b.queue.find(x=>x.actor===self.id&&x.key==='superCounter');
    assert.ok(q&&q.kind==='followup','秘技未立即施放【勘破•灭】');
    assert.ok(b.units.some(t=>t.side!=='ally'&&t.id===q.targetId),'秘技目标不是敌方单体');
    near(self.buffs.find(e=>e.tag==='yunliMaze').value,self.kit.params.Maze[0]);
  }
  // 雪衣「斩立决」：全体 Maze[0] 倍量子伤害并按削减韧性叠【恶报】
  {
    const xueyi=actor(1214,{technique:true});
    const b=createBattle(battle([xueyi,plain()],toughEnemy()));
    const self=b.units[0],en=b.units.at(-1);
    const ev=dmgOf(b,self.id,'technique');
    assert.equal(ev.length,1);
    near(baseOf(ev[0]),combatPanel(self).atk*self.kit.params.Maze[0]);
    near(en.toughness,en.toughnessMax-maze(1214).stance[0]);
    assert.equal(self.resources['恶报'],Math.max(1,Math.floor(maze(1214).stance[0]/30)));
  }
  // 刃「业途风」：消耗生命上限 Maze[1] 的生命并对敌方全体造成 Maze[0] 倍生命上限伤害
  {
    const ren=actor(1205,{technique:true});
    const b=createBattle(battle([ren,plain()]));
    const self=b.units[0],en=b.units.at(-1);
    const max=combatPanel(self).hp;
    near(self.hp,max-max*self.kit.params.Maze[1]);
    near(self.resources['累计已损失生命值'],max*self.kit.params.Maze[1]);
    assert.equal(self.resources['充能'],1);
    const ev=dmgOf(b,self.id,'technique');
    assert.equal(ev.length,1);
    near(baseOf(ev[0]),max*self.kit.params.Maze[0]);
  }
});

test('batch06 4 名角色与既有四人体系混编可完成严格战斗，无未支持缺口',()=>{
  for(const id of IDS)for(const eidolon of [0,3,6]){
    const a=actor(id,{eidolon}),ar=actor(1015),s=actor(1306),ce=actor(1412);
    a.id='focus';a.energy=a.energyMax;a.policy={...a.policy,autoUltimate:true,allyTargetId:ar.id};
    s.policy.allyTargetId=ar.id;ce.policy.allyTargetId=ar.id;
    const c={strict:true,maxAV:260,sp:3,maxSP:9,seed:3,critMode:'expected',requiredAllies:4,units:[a,s,ar,ce,enemy()]};
    assert.deepEqual(validateBattle(c),[]);
    const r=simulateBattle(c);
    assert.ok(r.damage>0,'混编战斗没有伤害');
    assert.deepEqual(r.unsupported,[],id+' E'+eidolon+' 出现未支持缺口');
  }
});

console.log(`DeepSeek batch06 checks: ${passed} passed, ${failed} failed.`);if(failed)process.exitCode=1;
