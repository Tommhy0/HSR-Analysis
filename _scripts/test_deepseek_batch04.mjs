// DeepSeek 第4批（希儿 1102 / 彦卿 1209 / 托帕&账账 1112 / 貊泽 1223）机制测试。
// 期望值全部由 4.6 编译出的 kit.params / kit.trace / kit.ranks 推导；段数按固定提交原始脚本核对。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createContext} from '../core/ctx.mjs';
import {newBattleBuild,buildBattleActor} from '../simulator/builds.mjs';
import {createBattle,stepBattle,simulateBattle,validateBattle,combatPanel} from '../simulator/engine.mjs';
import {validateKitActor} from '../simulator/kits.mjs';
const data=JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url))),ctx=createContext(data);
const near=(a,b,m=1e-6)=>assert.ok(Math.abs(a-b)<m,`${a} != ${b}`);
const IDS=[1102,1209,1112,1223];
const panel=()=>({hp:10000,atk:1000,def:1000,speed:100,critRate:.5,critDmg:1,energyRegen:1,effectHit:0,effectRes:0,breakEffect:0,baseStats:{hp:1000,atk:1000,def:1000},elemDmg:{}});
const actor=(id,extra={})=>{const a=buildBattleActor(ctx,{...newBattleBuild(),characterId:id,relicAuto:false,panel:panel(),...extra});a.energy=0;a.policy={...a.policy,autoUltimate:false};return a;};
const enemy=(extra={})=>({id:'enemy',name:'规则训练敌人',side:'enemy',level:90,element:'Physical',panel:{...panel(),hp:1e9,speed:1},energy:0,energyMax:0,res:{},actions:{basic:{name:'测试攻击',type:'Normal',terms:[{scaling:'atk',multiplier:1}],hitEnergy:10}},policy:{autoUltimate:false,basicOnly:true},...extra});
const mate=(extra={})=>({id:'mate',name:'规则队友',side:'ally',level:80,element:'Physical',panel:panel(),energy:0,energyMax:100,onHitEnergy:5,actions:{basic:{name:'测试攻击',type:'Normal',element:'Physical',terms:[{scaling:'atk',multiplier:1}],hitShares:[1],toughness:30,energyGain:20,spGain:1}},policy:{autoUltimate:false,basicOnly:true},...extra});
const mkConfig=(units,{maxAV=120,sp=3,critMode='noncrit',seed=1,requiredAllies}={})=>({strict:true,maxAV,sp,maxSP:9,seed,critMode,...(requiredAllies?{requiredAllies}:{}),units:(units.some(u=>u.side==='enemy')?units:[...units,enemy()])});
const battle=(units,o)=>createBattle(mkConfig(units,o));
const runAll=b=>{while(stepBattle(b)){}return b;};
const dmgLog=(b,id,kind)=>b.log.filter(e=>e.type==='damage'&&(id==null||e.actor===id)&&(kind==null||e.kind===kind));
let passed=0,failed=0;const test=(name,fn)=>{try{fn();passed++;console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+'\n'+e.stack);}};

// ── 1. 合同编译 + 篡改检测 ──
test('第4批 4 名角色 E0～E6 动作合同可编译且不能篡改倍率 / 段数',()=>{
  for(const id of IDS)for(let eidolon=0;eidolon<=6;eidolon++){
    const a=actor(id,{eidolon});assert.deepEqual(validateKitActor(a),[]);
    const b=actor(id,{eidolon});
    b.actions.basic.terms=[{scaling:'atk',multiplier:99}];assert.ok(validateKitActor(b).length,'倍率篡改未被发现');
    const c=actor(id,{eidolon});
    const seg=Object.values(c.actions).find(a=>a.hitShares.length>1);seg.hitShares=[1];
    assert.ok(validateKitActor(c).length,'段数篡改未被发现');
  }
});

// ── 2. 真段数（原始脚本核对） ──
test('第4批 hitShares 与原始脚本真段数一致且总和为 1',()=>{
  const expected={
    // Avatar_Seele_00_Skill01/02/03
    1102:{basic:[.3,.7],skill:[.2,.1,.1,.6],ultimate:[1]},
    // Avatar_Yanqing_00_Skill01(3) / Skill02(循环 3+1 段) / Skill03 / PassiveSkill01_InsertAbilityPhase02
    1209:{basic:[.5,.25,.25],skill:[.25,.25,.25,.25],ultimate:[1],followup:[.3,.7]},
    // Avatar_Topaz_00_Skill01 / Skill02(7 段) / BE_UltraAttackDamage(8 段) / Skill03(无伤害)
    1112:{basic:[1],basicShot:[1],skill:[1],numby:Array(7).fill(1/7),numbyUlt:[...Array(7).fill(.1),.3],ultimate:[1]},
    // Avatar_Moze_00_Skill01/02(3 段)/03 / Skill02Modifier Pursued / Insert_Phase01(0.6+5×0.08)
    1223:{basic:[1],skill:[.15,.15,.7],ultimate:[1],ultStrike:[1],talentAdditional:[1],talentFollowup:[...Array(5).fill(.08),.6]},
  };
  for(const id of IDS){const a=actor(id);for(const [key,shares] of Object.entries(expected[id])){
    const got=a.actions[key].hitShares;assert.equal(got.length,shares.length,`${id}.${key} 段数 ${got.length} != ${shares.length}`);
    got.forEach((v,i)=>near(v,shares[i]));
    near(got.reduce((x,y)=>x+y,0),1,1e-9);}}
});

// ── 3. 希儿：增幅 ──
test('希儿：战技 / 终结进入增幅，增幅按天赋参数提高伤害',()=>{
  const u=actor(1102),x=mate();u.panel.speed=1;x.panel.speed=1;
  const b=battle([u,x]),self=b.units[0],en=b.units.at(-1),p=self.kit.params;
  b.rules.after(b,self,'skill','normal',self.actions.skill,[en],[en]);
  assert.equal(self.buffs.find(e=>e.tag==='seeleAmplify'),undefined,'战技不应进入增幅');
  b.rules.before(b,self,'ultimate','ultimate',self.actions.ultimate,[en]);
  const amp=self.buffs.find(e=>e.tag==='seeleAmplify');assert.ok(amp,'终结未进入增幅');
  near(amp.value,p.Talent[0]);assert.equal(amp.remaining,p.Talent[1]);
  // 增幅实际作用于伤害：两场同配置战斗，仅差一个同名增伤 buff。
  const raw=()=>{const a=actor(1102);a.panel.speed=200;a.policy.basicOnly=true;const e=enemy({panel:{...panel(),hp:1e9,speed:1}});
    const bb=battle([a,e],{maxAV:60});runAll(bb);return dmgLog(bb,a.id).reduce((s,d)=>s+d.damage,0);};
  const boosted=()=>{const a=actor(1102);a.panel.speed=200;a.policy.basicOnly=true;const e=enemy({panel:{...panel(),hp:1e9,speed:1}});
    const bb=battle([a,e],{maxAV:60});
    bb.units[0].buffs.push({type:'buff',id:'amp',name:'增幅',key:'dmgBoost',value:p.Talent[0],remaining:9,tickOwner:a.id,tickAt:'end',source:a.id,tag:'seeleAmplify',appliedTurn:0});
    runAll(bb);return dmgLog(bb,a.id).reduce((s,d)=>s+d.damage,0);};
  near(boosted()/raw(),(1+p.Talent[0])*(1+actor(1102).kit.trace[2][0]),1e-6);
});

// ── 4. 希儿：再现 ──
test('希儿：天赋【再现】击杀获得额外回合与增幅，E4 回能，天赋回合内击杀不再触发',()=>{
  for(const [eidolon,expectEnergy] of [[0,0],[4,1]]){
    const u=actor(1102,{eidolon}),x=mate();u.panel.speed=1;x.panel.speed=1;
    const b=battle([u,x]),self=b.units[0],en=b.units.at(-1);
    self.energy=0;b.activeAction={sequence:b.log.length,actor:self.id,key:'skill',kind:'normal',targets:[en.id]};
    b.rules.death(b,self,en);
    assert.ok(b.queue.some(q=>q.actor===self.id&&q.kind==='extra'),'击杀未获得额外回合');
    assert.ok(self.buffs.some(e=>e.tag==='seeleAmplify'),'击杀未进入增幅');
    near(self.energy,expectEnergy?self.kit.ranks[4][0]:0);
    // 天赋额外回合内击杀不再触发
    const q=b.queue.length;
    b.activeAction={sequence:b.log.length,actor:self.id,key:'skill',kind:'extra',targets:[en.id]};
    b.rules.death(b,self,en);
    assert.equal(b.queue.length,q,'天赋额外回合内击杀仍触发了再现');
  }
});

// ── 5. 希儿：E2 / 行迹涟漪 ──
test('希儿：E2 战技加速可叠 2 层，行迹「涟漪」普攻后行动提前',()=>{
  const u=actor(1102,{eidolon:2}),x=mate();u.panel.speed=1;x.panel.speed=1;
  const b=battle([u,x]),self=b.units[0],en=b.units.at(-1),p=self.kit.params;
  b.rules.after(b,self,'skill','normal',self.actions.skill,[en],[en]);
  const e1=self.buffs.find(b=>b.id===self.id+':seeleSpeed');
  near(e1.value,p.BPSkill[1]);assert.equal(e1.stacks,1);
  b.rules.after(b,self,'skill','normal',self.actions.skill,[en],[en]);
  const e2=self.buffs.find(b=>b.id===self.id+':seeleSpeed');
  near(e2.value,p.BPSkill[1]*self.kit.ranks[2][0]);assert.equal(e2.stacks,self.kit.ranks[2][0]);
  b.rules.after(b,self,'skill','normal',self.actions.skill,[en],[en]);
  assert.equal(self.buffs.find(b=>b.id===self.id+':seeleSpeed').stacks,self.kit.ranks[2][0],'加速层数超过 E2 上限');
  const before=self.distance;
  b.rules.after(b,self,'basic','normal',self.actions.basic,[en],[en]);
  const adv=b.log.filter(e=>e.type==='advance'&&e.actor===self.id).at(-1);
  near(adv.ratio,self.kit.trace[3][0]);near(self.distance,Math.max(0,before-10000*self.kit.trace[3][0]));
});

// ── 6. 希儿：E1 / 割裂 / 夜行 ──
test('希儿：E1 低血暴击率、行迹「割裂」增幅态量子抗穿、行迹「夜行」低血降仇恨',()=>{
  const u=actor(1102,{eidolon:1}),x=mate();u.panel.speed=1;x.panel.speed=1;
  const b=battle([u,x]),self=b.units[0],en=b.units.at(-1),p=self.kit.params;
  const low=en.panel.hp*self.kit.ranks[1][0]*0.9;en.hp=low;
  const mod=b.rules.modifiers(b,self,en,{element:'Quantum',type:'Normal'},'direct');
  near(mod.critRate,self.kit.ranks[1][1]);
  assert.equal(mod.resPen??0,0,'未进入增幅时不应有割裂抗穿');
  self.buffs.push({type:'buff',id:'amp',name:'增幅',key:'dmgBoost',value:p.Talent[0],remaining:5,tickOwner:self.id,tickAt:'end',source:self.id,tag:'seeleAmplify',appliedTurn:0});
  near(b.rules.modifiers(b,self,en,{element:'Quantum',type:'Normal'},'direct').resPen,self.kit.trace[2][0]);
  self.hp=combatPanel(self).hp*self.kit.trace[1][0]*0.5;
  near(combatPanel(self).aggroRatio,1-self.kit.trace[1][1]);
});

// ── 7. 希儿：E6 乱蝶 ──
test('希儿：E6【乱蝶】被攻击后附加伤害（E5 无），伤害为本次终结技的 ranks[6][0]',()=>{
  const e5=actor(1102,{eidolon:5}),m5=mate();e5.panel.speed=1;m5.panel.speed=1;
  const b5=battle([e5,m5]),s5=b5.units[0],n5=b5.units.at(-1);
  b5.rules.before(b5,s5,'ultimate','ultimate',s5.actions.ultimate,[n5]);
  assert.ok(!n5.buffs.some(e=>e.tag==='seeleButterfly'),'E5 不应有乱蝶');
  const u=actor(1102,{eidolon:6}),m=mate();u.panel.speed=1;m.panel.speed=1;
  const b=battle([u,m]),self=b.units[0],en=b.units.at(-1),ally=b.units[1];
  b.rules.before(b,self,'ultimate','ultimate',self.actions.ultimate,[en]);
  const bf=en.buffs.find(e=>e.tag==='seeleButterfly');assert.ok(bf,'E6 终结未施加乱蝶');
  assert.equal(bf.remaining,self.kit.ranks[6][1]);
  b.activeAction={sequence:b.log.length,actor:ally.id,key:'basic',kind:'normal',targets:[en.id]};
  b.rules.attacked(b,en,ally);
  const add=dmgLog(b,self.id,'additional');assert.equal(add.length,1,'乱蝶附加伤害次数异常');
  assert.ok(add[0].damage>0);
  // 同一场战斗内终结伤害 : 乱蝶附加伤害 = 1 : ranks[6][0]
  const a=actor(1102,{eidolon:6}),x=mate();a.panel.speed=200;x.panel.speed=1;a.energy=a.energyMax;a.policy.autoUltimate=true;
  const bb=battle([a,x,enemy({panel:{...panel(),hp:1e9,speed:1}})],{maxAV:120});runAll(bb);
  const ult=dmgLog(bb,a.id,'direct')[0],add2=dmgLog(bb,a.id,'additional')[0];
  assert.ok(ult&&add2,'未触发终结 / 乱蝶');
  near(add2.damage/ult.damage,a.kit.ranks[6][0],1e-6);
});

// ── 8. 彦卿：智剑连心 ──
test('彦卿：战技附加【智剑连心】双暴 / 降仇恨 / 效果抵抗，受到伤害后消失',()=>{
  for(const eidolon of [0,2]){
    const u=actor(1209,{eidolon}),x=mate();u.panel.speed=1;x.panel.speed=1;
    const b=battle([u,x]),self=b.units[0],en=b.units.at(-1),p=self.kit.params;
    b.rules.before(b,self,'skill','normal',self.actions.skill,[en]);
    assert.ok(self.buffs.some(e=>e.tag==='soulsteel'),'战技未附加智剑连心');
    near(b.rules.modifiers(b,self,en,{element:'Ice',type:'BPSkill'},'direct').critRate,p.Talent[0]);
    near(b.rules.modifiers(b,self,en,{element:'Ice',type:'BPSkill'},'direct').critDmg,p.Talent[1]);
    const cp=combatPanel(self);
    near(cp.aggroRatio,0.5);near(cp.effectRes,(self.panel.effectRes??0)+self.kit.trace[2][0]);
    near(cp.energyRegen,(self.panel.energyRegen??1)+(eidolon?self.kit.ranks[2][0]:0));
    b.rules.attacked(b,self,en);
    assert.ok(!self.buffs.some(e=>e.tag==='soulsteel'),'受击后智剑连心未消失');
  }
});

// ── 9. 彦卿：终结双暴 ──
test('彦卿：终结提高自身暴击率，智剑连心时额外提高暴击伤害并持续 1 回合',()=>{
  const u=actor(1209),x=mate();u.panel.speed=1;x.panel.speed=1;
  const b=battle([u,x]),self=b.units[0],en=b.units.at(-1),p=self.kit.params;
  b.rules.before(b,self,'ultimate','ultimate',self.actions.ultimate,[en]);
  const cr=self.buffs.find(e=>e.tag==='yqUlt');assert.ok(cr,'终结未提高暴击率');
  near(cr.value,p.Ultra[0]);assert.equal(cr.remaining,1);
  assert.ok(!self.buffs.some(e=>e.id===self.id+':yqUltCrit'),'无智剑连心时不应有终结暴伤');
  self.buffs.push({type:'buff',id:self.id+':soul',name:'智剑连心',key:'marker',value:0,remaining:1,tickOwner:self.id,tickAt:'end',source:self.id,tag:'soulsteel',appliedTurn:0});
  b.rules.before(b,self,'ultimate','ultimate',self.actions.ultimate,[en]);
  const cd=self.buffs.find(e=>e.id===self.id+':yqUltCrit');assert.ok(cd,'智剑连心下终结未提高暴伤');
  near(cd.value,p.Ultra[1]);
});

// ── 10. 彦卿：天赋追击 / 冻结 ──
test('彦卿：天赋在智剑连心下按固定概率追击，并按基础概率冻结（冻结期间回合开始受附加伤害）',()=>{
  const u=actor(1209),x=mate();u.panel.speed=1;x.panel.speed=1;
  const b=battle([u,x]),self=b.units[0],en=b.units.at(-1),p=self.kit.params;
  b.random=()=>0;
  b.rules.before(b,self,'skill','normal',self.actions.skill,[en]);
  b.rules.after(b,self,'skill','normal',self.actions.skill,[en],[en]);
  assert.ok(b.queue.some(q=>q.actor===self.id&&q.kind==='followup'),'固定概率未触发天赋追击');
  b.rules.after(b,self,'followup','followup',self.actions.followup,[en],[en]);
  const fz=en.dots.find(e=>e.control==='freeze');assert.ok(fz,'追击未施加冻结');
  assert.equal(fz.remaining,1);near(fz.terms[0].multiplier,p.Talent[4]);
  // 冻结目标回合开始受到附加伤害
  const b2=battle([actor(1209),enemy({panel:{...panel(),hp:1e9,speed:500}})]);b2.random=()=>0;
  const m2=b2.units[0],e2=b2.units.at(-1);
  e2.dots.push({type:'dot',id:m2.id+':fz',name:'冻结',source:m2.id,element:'Ice',remaining:2,tickOwner:e2.id,tickAt:'end',appliedTurn:0,terms:[{scaling:'atk',multiplier:m2.kit.params.Talent[4]}],control:'freeze'});
  runAll(b2);
  assert.ok(dmgLog(b2,m2.id,'dot').length>=1,'冻结未在回合开始造成伤害');
});

// ── 11. 彦卿：E1 / 颁冰 / 轻吕 ──
test('彦卿：E1 攻击冻结目标附加伤害、行迹「颁冰」冰弱点附加伤害、行迹「轻吕」暴击提速',()=>{
  const u=actor(1209,{eidolon:1}),x=mate();u.panel.speed=1;x.panel.speed=1;
  const b=battle([u,x]),self=b.units[0],en=b.units.at(-1),p=self.kit.params;
  en.dots.push({type:'dot',id:self.id+':fz',name:'冻结',source:self.id,element:'Ice',remaining:2,tickOwner:en.id,tickAt:'end',appliedTurn:0,terms:[{scaling:'atk',multiplier:p.Talent[4]}],control:'freeze'});
  en.weaknesses=['Ice'];
  const before=dmgLog(b).length;
  b.rules.after(b,self,'basic','normal',self.actions.basic,[en],[en]);
  const add=dmgLog(b,self.id,'additional');
  assert.equal(add.length,2,'E1 与颁冰附加伤害次数应为 2');
  const ice=[{scaling:'atk',multiplier:self.kit.ranks[1][0]},{scaling:'atk',multiplier:self.kit.trace[1][0]}];
  assert.ok(add.every(a=>a.damage>0));void ice;void before;
  // 轻吕：暴击后提速
  b.rules.afterHit(b,self,en,self.actions.basic,'crit',{critMode:'crit'});
  const sp=self.buffs.find(e=>e.id===self.id+':yqSpeed');assert.ok(sp,'暴击未触发轻吕提速');
  near(sp.value,self.kit.trace[3][0]);assert.equal(sp.remaining,self.kit.trace[3][1]);
  b.rules.afterHit(b,self,en,self.actions.basic,'direct',{critMode:'noncrit'});
  assert.equal(b.log.filter(e=>e.type==='buff'&&e.name==='轻吕 · 速度').length,1,'非暴击不应触发轻吕');
});

// ── 12. 彦卿：E4 / 秘技 / E6 ──
test('彦卿：E4 高血冰抗穿、秘技高血目标增伤、E6 击杀延长智剑连心与终结增益',()=>{
  const u=actor(1209,{eidolon:6,technique:true}),x=mate();u.panel.speed=1;x.panel.speed=1;
  const b=battle([u,x]),self=b.units[0],en=b.units.at(-1),p=self.kit.params;
  assert.ok(self.buffs.some(e=>e.tag==='yqMaze'),'秘技未生效');
  en.hp=en.panel.hp;
  const mod=b.rules.modifiers(b,self,en,{element:'Ice',type:'Normal'},'direct');
  near(mod.resPen,self.kit.ranks[4][1]);
  near(mod.dmgBoost,p.Maze[1]);
  self.buffs.push({type:'buff',id:self.id+':soul',name:'智剑连心',key:'marker',value:0,remaining:1,tickOwner:self.id,tickAt:'end',source:self.id,tag:'soulsteel',appliedTurn:0});
  self.buffs.push({type:'buff',id:self.id+':yqUltCrit',name:'终结暴伤',key:'critDmg',value:p.Ultra[1],remaining:1,tickOwner:self.id,tickAt:'end',source:self.id,tag:'yqUlt',appliedTurn:0});
  b.rules.death(b,self,en);
  assert.equal(self.buffs.find(e=>e.tag==='soulsteel').remaining,2,'E6 未延长智剑连心');
  assert.equal(self.buffs.find(e=>e.id===self.id+':yqUltCrit').remaining,2,'E6 未延长终结增益');
});

// ── 13. 托帕：账账召唤物 ──
test('托帕：账账为独立行动条召唤物（速度=Talent[0]），行动时按【负债证明】追击，E2 回能 / E4 提前托帕',()=>{
  const u=actor(1112,{eidolon:4}),x=mate();u.panel.speed=1;x.panel.speed=1;
  const b=battle([u,x]),self=b.units[0],en=b.units.at(-1),p=self.kit.params;
  const s=b.summons.find(s=>s.owner===self.id);assert.ok(s,'入场未召唤账账');
  assert.equal(s.kind,'countdown');near(s.speed,p.Talent[0]);
  b.rules.after(b,self,'skill','normal',self.actions.skill,[en],[en]);
  self.energy=0;
  const adv=b.log.length;
  b.rules.summonTurn(b,self,s);
  assert.ok(dmgLog(b,self.id,'followup').length>0,'账账行动未发动追击');
  near(self.energy,self.kit.ranks[2][0],1e-6);
  const advEv=b.log.filter((e,i)=>i>=adv&&e.type==='advance'&&e.actor===self.id).at(-1);
  assert.ok(advEv,'E4 未使托帕行动提前');near(advEv.ratio,self.kit.ranks[4][0]);
});

// ── 14. 托帕：负债证明 / 透支 ──
test('托帕：战技施加【负债证明】并让账账追击（追击增伤 = BPSkill[1]），行迹「透支」普攻按追击结算',()=>{
  const u=actor(1112),x=mate();u.panel.speed=1;x.panel.speed=1;
  const b=battle([u,x]),self=b.units[0],en=b.units.at(-1),p=self.kit.params;
  b.rules.after(b,self,'skill','normal',self.actions.skill,[en],[en]);
  const mk=en.buffs.find(e=>e.tag==='topazDebt');assert.ok(mk,'战技未施加负债证明');
  const mod=b.rules.modifiers(b,self,en,{element:'Fire',type:'Normal'},'followup');
  // 111202 原文：「使其受到的追加攻击伤害提高」= 目标易伤乘区（vuln），不是攻击者增伤（dmgBoost）。
  near(mod.vuln,p.BPSkill[1]);
  near(mod.dmgBoost,0);
  assert.ok(dmgLog(b,self.id,'followup').length>0,'战技未让账账追击');
  const n=b.log.length;
  b.rules.after(b,self,'basic','normal',self.actions.basic,[en],[]);
  const basicHits=b.log.slice(n).filter(e=>e.type==='damage');
  assert.equal(basicHits.length,1);assert.equal(basicHits[0].kind,'followup','透支普攻未按追击结算');
});

// ── 15. 托帕：终结【涨幅惊人！】 ──
test('托帕：终结使账账进入【涨幅惊人！】（倍率 Talent[1]+Ultra[0]、暴伤 +Ultra[1]、8 段），Ultra[3] 次攻击后退出，E6 +1 次',()=>{
  for(const eidolon of [0,6]){
    const u=actor(1112,{eidolon}),x=mate();u.panel.speed=1;x.panel.speed=1;
    const b=battle([u,x]),self=b.units[0],en=b.units.at(-1),p=self.kit.params;
    const s=b.summons.find(s=>s.owner===self.id);
    b.rules.before(b,self,'ultimate','ultimate',self.actions.ultimate,[self]);
    const n=p.Ultra[3]+(eidolon?self.kit.ranks[6][0]:0);
    assert.equal(s.enhanced,n,'涨幅惊人攻击次数不符');
    const n0=dmgLog(b,self.id,'followup').length;
    b.rules.summonTurn(b,self,s);
    assert.equal(dmgLog(b,self.id,'followup').length-n0,8,'涨幅攻击应为 8 段');
    assert.equal(s.enhanced,n-1);
    const mod=b.rules.modifiers(b,self,en,self.actions.numbyUlt,'followup');
    near(mod.critDmg,p.Ultra[1]);
    near(mod.resPen??0,eidolon?self.kit.ranks[6][1]:0);
    for(let i=0;i<n-1;i++)b.rules.summonTurn(b,self,s);
    assert.equal(s.enhanced,0,'涨幅惊人未按次数退出');
    // 倍率：涨幅单段 = (Talent[1]+Ultra[0])×0.1，普通单段 = Talent[1]/7
    const plain=actor(1112);near(plain.actions.numbyUlt.terms[0].multiplier,(plain.kit.params.Talent[1]+plain.kit.params.Ultra[0]));
    near(plain.actions.numby.terms[0].multiplier,plain.kit.params.Talent[1]);
  }
});

// ── 16. 托帕：金融动荡 / 技术性调整 / E1 被执行 / 涨幅提前 ──
test('托帕：行迹火弱点增伤与涨幅回能、E1【被执行】追击暴伤叠 2 层、涨幅期间标记目标受击提前账账',()=>{
  const u=actor(1112,{eidolon:1}),x=mate();u.panel.speed=1;x.panel.speed=1;
  const b=battle([u,x]),self=b.units[0],en=b.units.at(-1),p=self.kit.params;
  en.weaknesses=['Fire'];
  near(b.rules.modifiers(b,self,en,{element:'Fire',type:'Normal'},'direct').dmgBoost,self.kit.trace[2][0]);
  b.rules.after(b,self,'skill','normal',self.actions.skill,[en],[en]);
  const s=b.summons.find(s=>s.owner===self.id);
  b.rules.before(b,self,'ultimate','ultimate',self.actions.ultimate,[self]);
  self.energy=0;b.rules.summonTurn(b,self,s);
  near(self.energy,self.kit.trace[3][0],1e-6);
  // E1 被执行
  for(let i=0;i<3;i++){
    b.activeAction={sequence:100+i,actor:x.id,key:'basic',kind:'normal',targets:[en.id]};
    b.rules.afterHit(b,self,en,self.actions.numbyUlt,'followup',{critMode:'crit'});
  }
  const ex=en.buffs.find(e=>e.tag==='topazExecuted');assert.ok(ex,'E1 未叠【被执行】');
  assert.equal(ex.stacks,self.kit.ranks[1][1],'被执行层数不符');
  near(b.rules.modifiers(b,self,en,{element:'Fire',type:'Normal'},'followup').critDmg,self.kit.ranks[1][1]*self.kit.ranks[1][0]);
  // 涨幅期间标记目标被普攻命中 -> 账账行动提前
  const d0=s.distance;s.distance=10000;
  b.rules.after(b,self,'skill','normal',self.actions.skill,[en],[en]);
  s.enhanced=p.Ultra[3];s.distance=10000;
  b.rules.after(b,b.units[1],'basic','normal',b.units[1].actions.basic,[en],[en]);
  near(s.distance,10000-10000*p.Ultra[2]);
  void d0;
});

// ── 17. 貊泽：猎物 / 充能 / 离场 / 天赋 ──
test('貊泽：战技标记【猎物】并获得充能进入离场；我方攻击猎物触发附加伤害、充能递减、每 Talent[1] 点充能追击、归零解除',()=>{
  const u=actor(1223),x=mate();u.panel.speed=1;x.panel.speed=1;
  const b=battle([u,x]),self=b.units[0],en=b.units.at(-1),p=self.kit.params;
  b.rules.after(b,self,'skill','normal',self.actions.skill,[en],[en]);
  assert.ok(en.buffs.some(e=>e.tag==='mozePrey'),'战技未标记猎物');
  assert.equal(self.resources['充能'],p.BPSkill[1]);
  assert.equal(self.cannotAct,true,'未进入离场');
  assert.equal(combatPanel(self).aggroRatio,0,'离场时不应被选中');
  near(self.energy,0);
  for(let i=0;i<p.BPSkill[1];i++){
    b.rules.attacked(b,en,x);
    const n=i+1;
    assert.equal(self.resources['充能'],p.BPSkill[1]-n);
    if(n%p.Talent[1]===0)assert.ok(b.queue.some(q=>q.actor===self.id&&q.key==='talentFollowup'&&q.kind==='followup'),`第 ${n} 点充能未触发天赋追击`);
  }
  assert.equal(dmgLog(b,self.id,'additional').length,p.BPSkill[1],'附加伤害次数应等于消耗充能次数');
  assert.ok(!en.buffs.some(e=>e.tag==='mozePrey'),'充能归零未解除猎物');
  assert.equal(self.cannotAct,false,'充能归零未解除离场');
  near(b.log.filter(e=>e.type==='advance'&&e.actor===self.id).at(-1).ratio,self.kit.trace[2][0]);
});

// ── 18. 貊泽：终结 / E4 ──
test('貊泽：终结按追击结算（行迹「不折镆干」）并附带天赋追击，E4 施放终结后增伤',()=>{
  const u=actor(1223,{eidolon:4}),x=mate();u.panel.speed=1;x.panel.speed=1;
  const b=battle([u,x]),self=b.units[0],en=b.units.at(-1),p=self.kit.params;
  b.rules.before(b,self,'ultimate','ultimate',self.actions.ultimate,[en]);
  assert.ok(self.buffs.some(e=>e.id===self.id+':mozeE4'),'E4 增伤未生效');
  b.rules.after(b,self,'ultimate','ultimate',self.actions.ultimate,[en],[]);
  const fu=dmgLog(b,self.id,'followup');
  assert.equal(fu.length,1,'终结伤害未按追击结算');
  assert.ok(b.queue.some(q=>q.actor===self.id&&q.key==='talentFollowup'&&q.kind==='followup'),'终结未附带天赋追击');
  near(self.actions.ultStrike.terms[0].multiplier,p.Ultra[0]);
});

// ── 19. 貊泽：星魂 / 行迹 / 战技限制 ──
test('貊泽：E2 对猎物暴伤、不折镆干追击增伤、E6 追击倍率、墨毫绣衣回点、手奋匕尺波次提前、无队友禁用战技',()=>{
  const u=actor(1223,{eidolon:6}),x=mate();u.panel.speed=1;x.panel.speed=1;
  const b=battle([u,x]),self=b.units[0],en=b.units.at(-1),p=self.kit.params;
  b.rules.after(b,self,'skill','normal',self.actions.skill,[en],[en]);
  near(b.rules.modifiers(b,self,en,{element:'Thunder',type:'Normal'},'direct').critDmg,self.kit.ranks[2][0]);
  // 行迹 1223103「【猎物】受到的追加攻击伤害提高 25%」是目标易伤乘区（vuln），
  // 不是攻击者增伤（dmgBoost）。原断言写成 dmgBoost 属于把缺陷本身编码进测试，现更正为正确乘区。
  near(b.rules.modifiers(b,self,en,{element:'Thunder',type:'Normal'},'followup').vuln,self.kit.trace[3][0]);
  near(b.rules.modifiers(b,self,en,{element:'Thunder',type:'Normal'},'followup').dmgBoost??0,0);
  const a6=actor(1223,{eidolon:6}),a0=actor(1223);
  near(a6.actions.talentFollowup.terms[0].multiplier/a0.actions.talentFollowup.terms[0].multiplier,(a6.kit.params.Talent[2]+a6.kit.ranks[6][0])/a0.kit.params.Talent[2]);
  const sp0=b.sp;
  b.rules.after(b,self,'talentFollowup','followup',self.actions.talentFollowup,[en],[en]);
  near(b.sp,sp0+self.kit.trace[1][0]);
  b.rules.after(b,self,'talentFollowup','followup',self.actions.talentFollowup,[en],[en]);
  assert.equal(b.sp,sp0+self.kit.trace[1][0],'墨毫绣衣冷却中不应再次恢复战技点');
  const d0=self.distance;
  b.rules.onWaveStart(b);
  near(self.distance,Math.max(0,d0-10000*self.kit.trace[2][1]));
  const solo=battle([actor(1223),enemy()]);
  assert.equal(solo.rules.shouldUseSkill(solo,solo.units[0]),false,'无队友时不应使用战技');
  const duo=battle([actor(1223),mate(),enemy()]);
  assert.equal(duo.rules.shouldUseSkill(duo,duo.units[0]),true,'有队友时应可使用战技');
});

// ── 20. 貊泽：猎物死亡解除离场 ──
test('貊泽：猎物被消灭后解除【猎物】与离场',()=>{
  const u=actor(1223),x=mate();u.panel.speed=1;x.panel.speed=1;
  const b=battle([u,x]),self=b.units[0],en=b.units.at(-1);
  b.rules.after(b,self,'skill','normal',self.actions.skill,[en],[en]);
  assert.equal(self.cannotAct,true);
  b.rules.death(b,x,en);
  assert.ok(!en.buffs.some(e=>e.tag==='mozePrey'));
  assert.equal(self.cannotAct,false);
});

// ── 21. 多波次换波 ──
test('第4批：换波时行迹「手奋匕尺」按每波次结算且角色不产生未支持缺口',()=>{
  const u=actor(1223),x=mate();
  const w1=enemy({panel:{...panel(),hp:1,speed:1}}),w2=enemy({id:'enemy2',panel:{...panel(),hp:1e9,speed:1},wave:2});
  const b=createBattle({strict:true,maxAV:400,sp:3,maxSP:9,seed:5,critMode:'noncrit',units:[u,x,w1,w2]});
  runAll(b);
  assert.ok(b.log.some(e=>e.type==='wave_start'&&e.wave===2),'未进入第二波次');
  const adv=b.log.filter(e=>e.type==='advance'&&e.actor===u.id&&e.wave===2);
  assert.ok(adv.some(e=>Math.abs(e.ratio-u.kit.trace[2][1])<1e-9),'换波未触发行迹「手奋匕尺」行动提前');
});

// ── 22. 秘技 ──
test('第4批：四名角色秘技入场效果（希儿增幅 / 彦卿增伤 / 托帕明补回能 / 貊泽增伤）',()=>{
  const start=id=>{const u=actor(id,{technique:true}),x=mate();const b=battle([u,x]);return {b,self:b.units[0]};};
  const se=start(1102);assert.ok(se.self.buffs.some(e=>e.tag==='seeleAmplify'),'希儿秘技未进入增幅');
  const yq=start(1209);assert.ok(yq.self.buffs.some(e=>e.tag==='yqMaze'),'彦卿秘技未生效');
  const tp=start(1112);assert.equal(tp.self.resources['明补待触发'],1,'托帕秘技未登记明补');
  const s=tp.b.summons.find(s=>s.owner===tp.self.id),en=tp.b.units.at(-1);
  tp.self.energy=0;tp.b.rules.after(tp.b,tp.self,'skill','normal',tp.self.actions.skill,[en],[en]);
  near(tp.self.energy,tp.self.kit.params.Maze[0],1e-6);
  const mz=start(1223),maze=mz.self.buffs.find(e=>e.id===mz.self.id+':mozeMaze');
  assert.ok(maze,'貊泽秘技未生效');near(maze.value,mz.self.kit.params.Maze[1]);assert.equal(maze.remaining,mz.self.kit.params.Maze[2]);
  void s;
});

// ── 23. 四人严格战斗 ──
test('第4批 4 名角色 E0/E3/E6 与既有四人体系混编可完成严格战斗，无未支持缺口',()=>{
  for(const id of IDS)for(const eidolon of [0,3,6]){
    const a=actor(id,{eidolon}),ar=actor(1015),s=actor(1306),ce=actor(1412);
    a.id='focus';a.energy=a.energyMax;a.policy={...a.policy,autoUltimate:true,allyTargetId:ar.id};
    s.policy.allyTargetId=ar.id;ce.policy.allyTargetId=ar.id;
    const c={strict:true,maxAV:260,sp:3,maxSP:9,seed:3,critMode:'expected',requiredAllies:4,units:[a,s,ar,ce,enemy()]};
    assert.deepEqual(validateBattle(c),[]);
    const r=simulateBattle(c);assert.deepEqual(r.unsupported,[]);assert.ok(r.damage>0);
  }
});

console.log(`DeepSeek batch04 checks: ${passed} passed, ${failed} failed.`);if(failed)process.exitCode=1;
