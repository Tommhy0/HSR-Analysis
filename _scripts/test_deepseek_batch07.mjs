// DeepSeek 第 7 批：1204 景元 / 1222 灵砂 / 1201 青雀 / 1003 姬子 的机制测试。
// 期望值全部由 4.6 编译出的 kit 参数（params / trace / ranks）与固定原始脚本的段数推导，不写死倍率；
// 时序用 b.rules.before / after / afterDamage / turnStart / summonTurn 直接驱动，
// 数值用伤害事件的 base 乘区（= 面板基准 × 倍率）核对。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createContext} from '../core/ctx.mjs';
import {ROSTER_DATA} from '../simulator/roster-data.mjs';
import {newBattleBuild,buildBattleActor} from '../simulator/builds.mjs';
import {createBattle,stepBattle,simulateBattle,validateBattle,combatPanel} from '../simulator/engine.mjs';
import {validateKitActor} from '../simulator/kits.mjs';
import {IDS} from '../simulator/characters/extra/batch07.mjs';
const data=JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url))),ctx=createContext(data);
const near=(a,b,m=1e-6,msg)=>{if(typeof m==='string'){msg=m;m=1e-6;}assert.ok(Math.abs(a-b)<m,`${msg?msg+'：':''}${a} != ${b}`);};
const panel=()=>({hp:10000,atk:1000,def:1000,speed:100,critRate:.5,critDmg:1,energyRegen:1,effectHit:0,effectRes:0,breakEffect:0,baseStats:{hp:1000,atk:1000,def:1000},elemDmg:{}});
const actor=(id,extra={})=>{const a=buildBattleActor(ctx,{...newBattleBuild(),characterId:id,relicAuto:false,panel:panel(),...extra});a.energy=0;a.policy={...a.policy,autoUltimate:false};return a;};
const plain=(id='mate')=>({id,name:'测试队员',side:'ally',level:80,element:'Physical',panel:{...panel(),speed:1},energy:0,energyMax:100,
  actions:{basic:{name:'测试普攻',type:'Normal',terms:[{scaling:'atk',multiplier:1}],spGain:1,energyGain:20,toughness:30}},policy:{autoUltimate:false,basicOnly:true}});
const enemy=(extra={})=>({id:'enemy',name:'规则训练敌人',side:'enemy',level:90,element:'Physical',panel:{...panel(),hp:1e9,speed:1},energy:0,energyMax:0,res:{},
  actions:{basic:{name:'测试攻击',type:'Normal',terms:[{scaling:'atk',multiplier:1}],hitEnergy:10}},policy:{autoUltimate:false,basicOnly:true},...extra});
const toughEnemy=(extra={})=>enemy({toughnessMax:300,weaknesses:['Fire'],standardBreak:true,rank:'elite',...extra});
const battle=(units,en=null,maxAV=201)=>({strict:true,maxAV,sp:3,maxSP:9,seed:42,critMode:'noncrit',units:[...units,en??enemy()]});
const baseOf=ev=>ev.formula.find(f=>f.zone==='base').value;
const zoneOf=(ev,z)=>ev.formula.find(f=>f.zone===z)?.value;
const dmgOf=(b,id,kind)=>b.log.filter(e=>e.type==='damage'&&e.actor===id&&(kind?e.kind===kind:true));
const actsOf=(b,id)=>b.log.filter(e=>e.type==='action'&&e.actor===id);
const runAll=(b,cap=800)=>{let n=0;while(stepBattle(b)&&n<cap)n++;return b;};
const suitNames=['万','筒','条'];
let passed=0,failed=0;const test=(name,fn)=>{try{fn();passed++;console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+'\n'+e.stack);}};

// ── 1. 合同编译 + 篡改检测 ──
test('batch07 4 名角色 E0～E6 动作合同可编译且不能篡改倍率 / 段数',()=>{
  assert.deepEqual([...IDS].sort((a,b)=>a-b),[1003,1201,1204,1222]);
  for(const id of IDS)for(let eidolon=0;eidolon<=6;eidolon++){
    const a=actor(id,{eidolon});assert.deepEqual(validateKitActor(a),[]);
    assert.deepEqual(a.unsupported,[]);
    const b=actor(id,{eidolon});b.actions.basic.terms=[{scaling:'atk',multiplier:99}];
    assert.ok(validateKitActor(b).length,id+' 篡改倍率未被发现');
    const c=actor(id,{eidolon});
    const seg=Object.values(c.actions).sort((x,y)=>y.hitShares.length-x.hitShares.length)[0];
    seg.hitShares=[1,1];
    assert.ok(validateKitActor(c).length,id+' 篡改段数未被发现');
  }
});

// ── 2. 真段数 + 倍率索引 ──
test('batch07 hitShares 与原始脚本真段数一致、总和为 1，倍率索引与 kit 参数对齐',()=>{
  const expected={
    // Avatar_JingYuan_00：Skill01 [0.45,0.55]；Skill02 执行结构 [0.4,0.3,0.3]；Skill03 全体单段；
    // Passive_Insert 每段 1 次主目标
    1204:{basic:[.45,.55],skill:[.4,.3,.3],ultimate:[1],godSword:[1],godSwordAdjacent:[1]},
    // Avatar_Lingsha_00：Skill01/Skill02/Skill03 单段；BPSkill_BattleEvent 全体 1 段 + 模板额外段
    1222:{basic:[1],skill:[1],ultimate:[1],fuyuan:[1],fuyuanExtra:[1],fuyuanE6:[1]},
    // Avatar_Qingque_00：Skill01/Skill03 单段；Skill11 主 + 相邻 2 段；Rank04 1 段 / 2 段
    1201:{basic:[1],enhancedBasic:[1],skill:[1],ultimate:[1],rank04Atk:[1],rank04AtkSpecial:[1]},
    // Avatar_Himeko_00：Skill01 [0.4,0.6]；Skill02 主 0.2+0.2+4×0.05+0.4；Passive1Atk02 3×0.2+0.4
    1003:{basic:[.4,.6],skill:[.2,.2,.05,.05,.05,.05,.4],ultimate:[1],followup:[.2,.2,.2,.4]},
  };
  for(const id of IDS){const a=actor(id);for(const [key,shares] of Object.entries(expected[id])){
    const got=a.actions[key].hitShares;
    assert.equal(got.length,shares.length,`${id}.${key} 段数 ${got.length} != ${shares.length}`);
    got.forEach((v,i)=>near(v,shares[i]));
    near(got.reduce((x,y)=>x+y,0),1,1e-9);}}
  const jy=actor(1204),j1=actor(1204,{eidolon:1});
  near(jy.actions.godSword.terms[0].multiplier,jy.kit.params.Talent[1]);
  near(jy.actions.godSwordAdjacent.terms[0].multiplier,jy.kit.params.Talent[1]*jy.kit.params.Talent[4]);
  near(j1.actions.godSwordAdjacent.terms[0].multiplier,
    j1.kit.params.Talent[1]*(j1.kit.params.Talent[4]+j1.kit.ranks[1][0]));
  const ls=actor(1222);
  near(ls.actions.fuyuan.terms[0].multiplier,ls.kit.params.Talent[1]);
  near(ls.actions.fuyuanExtra.terms[0].multiplier,ls.kit.params.Talent[7]);
  near(ls.actions.fuyuanE6.terms[0].multiplier,ls.kit.ranks[6][2]);
  const hm=actor(1003),h6=actor(1003,{eidolon:6});
  near(hm.actions.followup.terms[0].multiplier,hm.kit.params.Talent[0]);
  assert.equal(hm.actions.ultimate.bounceCount,0);
  assert.equal(h6.actions.ultimate.bounceCount,2);
  near(h6.actions.ultimate.bounceTerms[0].multiplier,h6.kit.params.Ultra[0]*h6.kit.ranks[6][0]);
  const qq=actor(1201),table=ROSTER_DATA[1201].skills['120101'].params;
  const level=Object.keys(table).find(k=>Math.abs(table[k].param_list[0]-qq.kit.params.Normal[0])<1e-9);
  const en=ROSTER_DATA[1201].skills['120108'].params[level].param_list;
  near(qq.actions.enhancedBasic.terms[0].multiplier,en[0]);
  near(qq.actions.enhancedBasic.terms.find(t=>t.target==='adjacent').multiplier,en[1]);
  near(qq.actions.rank04AtkSpecial.terms[0].multiplier,en[0]);
  near(qq.actions.rank04Atk.terms[0].multiplier,qq.kit.params.Normal[0]);
});

// ── 3. 景元：神君召唤物 ──
test('景元：战斗开始召唤【神君】为 kind=countdown 独立行动条召唤物（速度 Talent[0]、段数 Talent[3]）',()=>{
  const u=actor(1204),b=createBattle(battle([u,plain()]));
  const self=b.units[0],s=b.summons.find(x=>x.owner===self.id);
  assert.ok(s,'入场未召唤神君');assert.equal(s.kind,'countdown');
  near(s.speed,self.kit.params.Talent[0]);
  assert.equal(s.hits,self.kit.params.Talent[3]);
  assert.equal(self.resources['神君段数'],self.kit.params.Talent[3]);
});

test('景元：战技 +BPSkill[1] 段、终结 +Ultra[1] 段，速度 = Talent[0]+Talent[2]×(段数−Talent[3]) 且封顶 Talent[5]',()=>{
  const u=actor(1204),x=plain();u.panel.speed=1;x.panel.speed=1;
  const b=createBattle(battle([u,x])),self=b.units[0],en=b.units.at(-1),p=self.kit.params;
  const s=b.summons.find(v=>v.owner===self.id),speed=h=>p.Talent[0]+p.Talent[2]*Math.max(0,h-p.Talent[3]);
  b.rules.before(b,self,'skill','normal',self.actions.skill,[en]);
  assert.equal(s.hits,p.Talent[3]+p.BPSkill[1]);near(s.speed,speed(s.hits));
  b.rules.before(b,self,'ultimate','ultimate',self.actions.ultimate,[en]);
  assert.equal(s.hits,p.Talent[3]+p.BPSkill[1]+p.Ultra[1]);near(s.speed,speed(s.hits));
  for(let i=0;i<5;i++)b.rules.before(b,self,'skill','normal',self.actions.skill,[en]);
  assert.equal(s.hits,p.Talent[5],'段数未封顶 Talent[5]');near(s.speed,speed(p.Talent[5]));
  // 行迹「破阵」：段数 ≥ trace[1][0] 时本次神君攻击暴击伤害 +trace[1][1]
  near(b.rules.modifiers(b,self,en,self.actions.godSword,'followup').critDmg,self.kit.trace[1][1]);
  // 行动结束后段数与速度恢复初始
  b.rules.summonTurn(b,self,s);
  assert.equal(s.hits,p.Talent[3],'行动后段数未复原');near(s.speed,p.Talent[0]);
});

test('景元：秘技「摄召威灵」入战后神君首回合段数 +Maze[0]，速度同步提高',()=>{
  const u=actor(1204,{technique:true}),b=createBattle(battle([u,plain()]));
  const self=b.units[0],p=self.kit.params,s=b.summons.find(v=>v.owner===self.id);
  assert.equal(s.hits,p.Talent[3]+p.Maze[0]);
  near(s.speed,p.Talent[0]+p.Talent[2]*p.Maze[0]);
});

test('景元：神君行动结算 hits 段随机单体并复原，E4 每段回能、E2 行动后自身增伤',()=>{
  const u=actor(1204,{eidolon:4}),x=plain();u.panel.speed=1;x.panel.speed=1;
  const b=createBattle(battle([u,x])),self=b.units[0],s=b.summons.find(v=>v.owner===self.id),p=self.kit.params;
  self.energy=0;
  b.rules.summonTurn(b,self,s);
  assert.equal(dmgOf(b,self.id,'followup').length,p.Talent[3],'神君段数不等于 Talent[3]');
  near(self.energy,p.Talent[3]*self.kit.ranks[4][0],1e-6);
  assert.ok(self.buffs.some(e=>e.id===self.id+':jyE2:BPSkill'),'E2 行动后增伤未生效');
  assert.equal(s.hits,p.Talent[3]);near(s.speed,p.Talent[0]);
});

test('景元：神君对相邻目标造成 Talent[1]×(Talent[4]+E1 的 ranks[1][0]) 相邻伤害，段数结构可核',()=>{
  const u=actor(1204,{eidolon:1}),x=plain();u.panel.speed=1;x.panel.speed=1;
  const c={strict:true,maxAV:200,sp:3,maxSP:9,seed:7,critMode:'noncrit',
    units:[u,x,enemy({id:'e1'}),enemy({id:'e2'}),enemy({id:'e3'})]};
  const b=createBattle(c),self=b.units[0],p=self.kit.params,s=b.summons.find(v=>v.owner===self.id);
  b.rules.summonTurn(b,self,s);
  const fu=dmgOf(b,self.id,'followup');
  const mainV=combatPanel(self).atk*p.Talent[1];
  const adjV=combatPanel(self).atk*p.Talent[1]*(p.Talent[4]+self.kit.ranks[1][0]);
  const main=fu.filter(e=>Math.abs(baseOf(e)-mainV)<1e-6);
  const adj=fu.filter(e=>Math.abs(baseOf(e)-adjV)<1e-6);
  assert.equal(main.length,p.Talent[3],'主目标段数不符');
  assert.ok(adj.length>=p.Talent[3],'相邻伤害段数不足');
  assert.equal(main.length+adj.length,fu.length,'出现了非神君倍率的伤害段');
});

test('景元：E6 每段攻击后目标叠 ranks[6][0] 易伤（上限 ranks[6][1] 层）并在本次攻击结束后移除',()=>{
  const u=actor(1204,{eidolon:6}),x=plain();u.panel.speed=1;x.panel.speed=1;
  const b=createBattle(battle([u,x])),self=b.units[0],en=b.units.at(-1),s=b.summons.find(v=>v.owner===self.id);
  const n=self.kit.params.Talent[3];
  b.rules.summonTurn(b,self,s);
  const fu=dmgOf(b,self.id,'followup');
  const at=ev=>{const f=ev.frame.units.find(x=>x.id===en.id);return f.buffs.find(x=>x.id.startsWith(self.id+':jyE6:'))?.stacks??0;};
  fu.forEach((ev,i)=>assert.equal(at(ev),Math.min(i,self.kit.ranks[6][1]),`第 ${i+1} 段前的易伤层数不符`));
  assert.ok(!b.units.some(t=>t.buffs.some(e=>e.id.startsWith(self.id+':jyE6:'))),'E6 易伤未在攻击结束后移除');
  void n;
});

// ── 4. 灵砂：浮元 ──
test('灵砂：施放战技召唤【浮元】（速度 Talent[0]、Talent[6] 次行动）并提前 BPSkill[3]，重复施放叠加且封顶 Talent[4]',()=>{
  const u=actor(1222),x=plain();u.panel.speed=1;x.panel.speed=1;
  const b=createBattle(battle([u,x])),self=b.units[0],en=b.units.at(-1),p=self.kit.params;
  assert.ok(!b.summons.some(s=>s.owner===self.id),'未施放战技时不应有浮元');
  b.rules.after(b,self,'skill','normal',self.actions.skill,[en],[en]);
  const s=b.summons.find(v=>v.owner===self.id);
  assert.ok(s&&s.kind==='countdown','战技未召唤浮元');
  near(s.speed,p.Talent[0]);assert.equal(s.counts,p.Talent[6]);
  near(s.distance,10000-10000*p.BPSkill[3]);
  b.rules.after(b,self,'skill','normal',self.actions.skill,[en],[en]);
  assert.equal(s.counts,Math.min(p.Talent[4],p.Talent[6]*2));
  for(let i=0;i<3;i++)b.rules.after(b,self,'skill','normal',self.actions.skill,[en],[en]);
  assert.equal(s.counts,p.Talent[4],'行动次数未封顶 Talent[4]');
});

test('灵砂：浮元行动为追加攻击（全体 Talent[1] + 随机单体 Talent[7]），次数递减归零消失，E4 治疗最低生命友方',()=>{
  for(const eidolon of [0,4]){
    const u=actor(1222,{eidolon}),x=plain();u.panel.speed=1;x.panel.speed=1;
    const b=createBattle(battle([u,x])),self=b.units[0],mate=b.units[1],en=b.units.at(-1),p=self.kit.params;
    b.rules.after(b,self,'skill','normal',self.actions.skill,[en],[en]);
    const s=b.summons.find(v=>v.owner===self.id);s.counts=1;
    mate.hp=mate.panel.hp*.5;const hp0=mate.hp,heals0=b.log.filter(e=>e.type==='heal').length;
    b.rules.summonTurn(b,self,s);
    const fu=dmgOf(b,self.id,'followup'),atk=combatPanel(self).atk;
    assert.equal(fu.length,2,`浮元行动应为全体 1 段 + 随机单体 1 段，实际 ${fu.length}`);
    for(const e of fu)assert.ok([p.Talent[1],p.Talent[7]].some(v=>Math.abs(baseOf(e)-atk*v)<1e-6),
      '浮元伤害倍率不符（应为 Talent[1] / Talent[7]）');
    assert.equal(s.counts,0);assert.equal(s.active,false,'次数归零后浮元未消失');
    assert.ok(b.log.filter(e=>e.type==='heal').length>heals0,'浮元行动未治疗我方');
    if(eidolon>=4)assert.ok(mate.hp>hp0,'E4 未治疗最低生命友方');
  }
});

test('灵砂：E6 浮元额外 ranks[6][1] 次 ranks[6][2] 倍伤害，在场时敌方全属性抗性降低 ranks[6][0]',()=>{
  const u=actor(1222,{eidolon:6}),x=plain();u.panel.speed=1;x.panel.speed=1;
  const b=createBattle(battle([u,x])),self=b.units[0],en=b.units.at(-1);
  b.rules.after(b,self,'skill','normal',self.actions.skill,[en],[en]);
  const s=b.summons.find(v=>v.owner===self.id);
  near(b.rules.modifiers(b,self,en,self.actions.fuyuan,'followup').resPen,self.kit.ranks[6][0]);
  s.active=false;
  assert.equal(b.rules.modifiers(b,self,en,self.actions.fuyuan,'followup').resPen??0,0,'浮元不在场不应有抗性降低');
  s.active=true;
  b.rules.summonTurn(b,self,s);
  const atk=combatPanel(self).atk,fu=dmgOf(b,self.id,'followup');
  assert.equal(fu.filter(e=>Math.abs(baseOf(e)-atk*self.kit.ranks[6][2])<1e-6).length,self.kit.ranks[6][1]);
});

test('灵砂：终结使敌方【醇醉】（击破伤害 +Ultra[3]）、浮元行动提前 Ultra[5]、我方击破特攻 +ranks[2][0] 并治疗',()=>{
  const u=actor(1222,{eidolon:2}),x=plain();u.panel.speed=1;x.panel.speed=1;
  const b=createBattle(battle([u,x])),self=b.units[0],mate=b.units[1],en=b.units.at(-1),p=self.kit.params;
  b.rules.after(b,self,'skill','normal',self.actions.skill,[en],[en]);
  const s=b.summons.find(v=>v.owner===self.id);s.distance=10000;
  mate.hp=mate.panel.hp*.5;const hp0=mate.hp;
  b.rules.before(b,self,'ultimate','ultimate',self.actions.ultimate,[en]);
  const mk=en.buffs.find(e=>e.tag==='lsDrunk');assert.ok(mk,'终结未施加醇醉');assert.equal(mk.remaining,p.Ultra[4]);
  near(b.rules.modifiers(b,self,en,{element:'Fire',type:'Ultra'},'break').vuln,p.Ultra[3]);
  assert.equal(b.rules.modifiers(b,self,en,{element:'Fire',type:'Ultra'},'direct').vuln??0,0,'醇醉只应提高击破伤害');
  const e2=mate.buffs.find(e=>e.id===self.id+':lsE2');
  assert.ok(e2,'E2 未提高我方击破特攻');near(e2.value,self.kit.ranks[2][0]);
  b.rules.after(b,self,'ultimate','ultimate',self.actions.ultimate,[en],[en]);
  near(s.distance,0,'浮元未行动提前 Ultra[5]');
  assert.ok(mate.hp>hp0,'终结未治疗我方');
});

test('灵砂：秘技入战立即召唤【浮元】（Talent[6] 次）并使敌方全体【醇醉】Maze[0] 回合',()=>{
  const u=actor(1222,{technique:true}),b=createBattle(battle([u,plain()]));
  const self=b.units[0],en=b.units.at(-1),p=self.kit.params;
  const s=b.summons.find(v=>v.owner===self.id);assert.ok(s,'秘技未召唤浮元');
  assert.equal(s.counts,p.Talent[6]);
  const mk=en.buffs.find(e=>e.tag==='lsDrunk');assert.ok(mk,'秘技未施加醇醉');assert.equal(mk.remaining,p.Maze[0]);
});

test('灵砂：行迹「遗爇」我方受击且有人 ≤trace[3][0] 生命时触发不消耗次数的追击，trace[3][1] 回合冷却',()=>{
  const u=actor(1222),x=plain();u.panel.speed=1;x.panel.speed=1;
  const b=createBattle(battle([u,x])),self=b.units[0],mate=b.units[1],en=b.units.at(-1),p=self.kit.params;
  b.rules.after(b,self,'skill','normal',self.actions.skill,[en],[en]);
  const s=b.summons.find(v=>v.owner===self.id);
  mate.hp=mate.panel.hp*.5;
  const n0=dmgOf(b,self.id,'followup').length;
  b.rules.afterDamage(b,en,mate,'direct');
  assert.ok(dmgOf(b,self.id,'followup').length>n0,'遗爇未触发追击');
  assert.equal(s.counts,p.Talent[6],'遗爇不应消耗行动次数');
  const n1=dmgOf(b,self.id,'followup').length;
  b.rules.afterDamage(b,en,mate,'direct');
  assert.equal(dmgOf(b,self.id,'followup').length,n1,'冷却期间不应再次触发');
  // 冷却计时者为灵砂自身回合（1222103「#2 回合后可再次触发」）。
  self.turns=(self.resources['遗爇触发回合']??0)+self.kit.trace[3][1];b.turns=self.turns;
  mate.hp=mate.panel.hp*.5;
  b.rules.afterDamage(b,en,mate,'direct');
  assert.ok(dmgOf(b,self.id,'followup').length>n1,'冷却结束后未再次触发');
});

test('灵砂：行迹「兰烟」普攻额外回能 trace[2][0]、「朱燎」按击破特攻提高攻击 / 治疗，E1 击破效率与减防',()=>{
  const u=actor(1222,{eidolon:1}),x=plain();u.panel.speed=1;x.panel.speed=1;
  const b=createBattle(battle([u,x])),self=b.units[0],en=b.units.at(-1);
  self.energy=0;
  b.rules.after(b,self,'basic','normal',self.actions.basic,[en],[en]);
  near(self.energy,self.kit.trace[2][0],1e-6);
  near(combatPanel(self).breakEfficiency??0,self.kit.ranks[1][1]);
  self.buffs.push({type:'buff',id:'be',name:'测试击破特攻',key:'breakEffect',value:.4,source:self.id,tickOwner:self.id,tickAt:'end'});
  const t=self.kit.trace[1],cp=combatPanel(self);
  near(cp.atk,self.panel.atk+self.panel.baseStats.atk*Math.min(t[2],.4*t[0]));
  near(cp.healingBoost??0,Math.min(t[3],.4*t[1]));
  b.rules.before(b,self,'basic','normal',self.actions.basic,[en]);
  en.broken=true;
  b.rules.after(b,self,'basic','normal',self.actions.basic,[en],[en]);
  const df=en.buffs.find(e=>e.id===self.id+':lsE1:'+en.id);assert.ok(df,'E1 击破未减防');
  near(df.value,self.kit.ranks[1][0]);
});

// ── 5. 青雀：琼玉牌 ──
test('青雀：我方目标回合开始时抽 1 张琼玉牌（上限 4），E2 每次抽牌回能 ranks[2][0]',()=>{
  const u=actor(1201,{eidolon:2}),x=plain();u.panel.speed=1;x.panel.speed=1;
  const b=createBattle(battle([u,x])),self=b.units[0];
  self.energy=0;
  for(let i=0;i<6;i++)b.rules.onTurnStart(b,b.units[1]);
  assert.equal(self.resources['琼玉牌'],4,'手牌上限应为 4');
  near(self.energy,4*self.kit.ranks[2][0],1e-6);
  const sum=suitNames.reduce((n,s)=>n+(self.resources['琼玉牌 · '+s]??0),0);
  assert.equal(sum,4,'花色计数与总数不符');
});

test('青雀：回合开始 4 张同花色进入【暗杠】（攻击 +Talent[0]、禁用战技、普攻→【杠上开花！】），强化普攻后结束并触发抢杠 / E6',()=>{
  const u=actor(1201,{eidolon:6}),x=plain();u.panel.speed=1;x.panel.speed=1;
  const b=createBattle(battle([u,x])),self=b.units[0],en=b.units.at(-1),p=self.kit.params;
  b.random=()=>0;
  for(let i=0;i<4;i++)b.rules.onTurnStart(b,b.units[1]);
  assert.equal(self.resources['琼玉牌'],4);
  b.rules.onTurnStart(b,self);
  const hu=self.buffs.find(e=>e.tag==='qqHu');assert.ok(hu,'未进入暗杠');near(hu.value,p.Talent[0]);
  assert.equal(b.rules.shouldUseSkill(b,self),false,'暗杠状态不应再施放战技');
  const a=b.rules.prepare(b,self,'basic','normal',self.actions.basic);
  assert.equal(a.name,self.actions.enhancedBasic.name,'普攻未替换为强化普攻');
  const sp0=b.sp;
  b.rules.before(b,self,'basic','normal',a,[en]);
  b.rules.after(b,self,'basic','normal',a,[en],[en]);
  assert.ok(!self.buffs.some(e=>e.tag==='qqHu'),'暗杠未在强化普攻后结束');
  assert.ok(self.buffs.some(e=>e.id===self.id+':qqSpeed'),'行迹「抢杠」未提速');
  near(b.sp,sp0+1,1e-9);   // E6 强化普攻后回 1 点战技点
});

test('青雀：战技抽 BPSkill[0] 张、伤害 +BPSkill[1]（行迹「听牌」+trace[2][0]）可叠 BPSkill[2] 层、本回合不结束、行迹「争番」只回 1 次点',()=>{
  const u=actor(1201),x=plain();u.panel.speed=1;x.panel.speed=1;
  const b=createBattle(battle([u,x])),self=b.units[0],en=b.units.at(-1),p=self.kit.params;
  b.random=()=>0;
  const sp0=b.sp;
  b.rules.after(b,self,'skill','normal',self.actions.skill,[en],[en]);
  assert.equal(self.resources['琼玉牌'],p.BPSkill[0],'战技未抽 BPSkill[0] 张牌');
  const dmg=self.buffs.find(e=>e.id===self.id+':qqDmg');
  near(dmg.value,p.BPSkill[1]+self.kit.trace[2][0]);assert.equal(dmg.stacks,1);
  near(b.sp,sp0+1,1e-9);   // 争番 +1（战技点消耗由引擎的 useAction 结算，此处未经过）
  assert.ok(b.queue.some(q=>q.actor===self.id&&q.kind==='extra'),'战技后本回合未继续行动');
  for(let i=0;i<3;i++)b.rules.after(b,self,'skill','extra',self.actions.skill,[en],[en]);
  assert.equal(self.buffs.find(e=>e.id===self.id+':qqDmg').stacks,p.BPSkill[2],'伤害层数未封顶 BPSkill[2]');
  assert.equal(b.log.filter(e=>e.type==='sp'&&e.reason==='争番').length,1,'争番应只触发 1 次');
});

test('青雀：终结获得 4 张同花色牌（E1 终结增伤），普攻【门前清】消耗 1 张持有花色最少的牌',()=>{
  const u=actor(1201,{eidolon:1}),x=plain();u.panel.speed=1;x.panel.speed=1;
  const b=createBattle(battle([u,x])),self=b.units[0],en=b.units.at(-1);
  b.random=()=>.5;   // 花色下标 1 =「筒」
  b.rules.after(b,self,'ultimate','ultimate',self.actions.ultimate,[en],[en]);
  assert.equal(self.resources['琼玉牌'],4);
  assert.equal(self.resources['琼玉牌 · 筒'],4,'终结未获得 4 张同花色牌');
  near(b.rules.modifiers(b,self,en,self.actions.ultimate,'direct').dmgBoost,self.kit.ranks[1][0]);
  b.rules.before(b,self,'basic','normal',self.actions.basic,[en]);
  assert.equal(self.resources['琼玉牌'],3);
  assert.equal(self.resources['琼玉牌 · 筒'],3);
});

test('青雀：E4【不求人】普攻 / 强化普攻后立即追加一次等量伤害（普通 1 段 / 强化 2 段）',()=>{
  const u=actor(1201,{eidolon:4}),x=plain();u.panel.speed=1;x.panel.speed=1;
  const b=createBattle(battle([u,x])),self=b.units[0],en=b.units.at(-1);
  b.random=()=>.1;   // < ranks[4][0]
  b.rules.after(b,self,'skill','normal',self.actions.skill,[en],[en]);
  assert.ok(self.buffs.some(e=>e.tag==='qqNoHelp'),'E4 未获得【不求人】');
  b.queue.length=0;
  b.rules.before(b,self,'basic','normal',self.actions.basic,[en]);
  b.rules.after(b,self,'basic','normal',self.actions.basic,[en],[en]);
  const q=b.queue.find(x=>x.actor===self.id&&x.kind==='followup');
  assert.ok(q,'普攻后未触发追加攻击');assert.equal(q.key,'rank04Atk');
  near(self.actions.rank04Atk.terms[0].multiplier,self.actions.basic.terms[0].multiplier);
  self.buffs.push({type:'buff',id:self.id+':q',name:'不求人',key:'marker',value:0,tag:'qqNoHelp',source:self.id,tickOwner:self.id,tickAt:'end'});
  b.queue.length=0;
  const enh=self.actions.enhancedBasic;
  b.rules.before(b,self,'basic','normal',enh,[en]);
  b.rules.after(b,self,'basic','normal',enh,[en],[en]);
  const q2=b.queue.find(x=>x.actor===self.id&&x.kind==='followup');
  assert.ok(q2&&q2.key==='rank04AtkSpecial','强化普攻后未触发强化追击');
  near(self.actions.rank04AtkSpecial.terms[0].multiplier,enh.terms[0].multiplier);
});

// ── 6. 姬子：充能与追击 ──
test('姬子：战斗开始 1 点充能、敌方被击破 +1、上限 Talent[1]，满层后我方攻击触发全体追加攻击并清空',()=>{
  const u=actor(1003),x=plain();u.panel.speed=1;x.panel.speed=1;
  const b=createBattle(battle([u,x],toughEnemy())),self=b.units[0],mate=b.units[1],en=b.units.at(-1),p=self.kit.params;
  assert.equal(self.resources['充能'],1);
  b.rules.before(b,self,'basic','normal',self.actions.basic,[en]);
  en.broken=true;
  b.rules.after(b,self,'basic','normal',self.actions.basic,[en],[en]);
  assert.equal(self.resources['充能'],2,'击破未获得充能');
  assert.equal(b.queue.some(q=>q.key==='followup'),false,'未满层不应追加攻击');
  self.resources['充能']=p.Talent[1];
  b.rules.before(b,mate,'basic','normal',mate.actions.basic,[en]);
  b.rules.after(b,mate,'basic','normal',mate.actions.basic,[en],[en]);
  assert.ok(b.queue.some(q=>q.actor===self.id&&q.key==='followup'&&q.kind==='followup'),'满层未追加攻击');
  assert.equal(self.resources['充能'],0,'追加攻击未清空充能');
  // E4：姬子战技造成弱点击破时额外 +1 充能
  const u4=actor(1003,{eidolon:4}),m4=plain();u4.panel.speed=1;m4.panel.speed=1;
  const b4=createBattle(battle([u4,m4],toughEnemy())),s4=b4.units[0],e4=b4.units.at(-1);
  s4.resources['充能']=0;
  b4.rules.before(b4,s4,'skill','normal',s4.actions.skill,[e4]);e4.broken=true;
  b4.rules.after(b4,s4,'skill','normal',s4.actions.skill,[e4],[e4]);
  assert.equal(s4.resources['充能'],2,'E4 未在战技击破时额外获得充能');
});

test('姬子：天赋追加攻击为全体 4 段（Talent[0]），E1 触发后提速，真实战斗中按段结算',()=>{
  const u=actor(1003,{eidolon:1}),x=plain();u.panel.speed=1;x.panel.speed=1;
  const b=createBattle(battle([u,x],toughEnemy())),self=b.units[0],mate=b.units[1],en=b.units.at(-1),p=self.kit.params;
  assert.equal(self.actions.followup.target,'all');
  near(self.actions.followup.terms[0].multiplier,p.Talent[0]);
  assert.equal(self.actions.followup.hitShares.length,4);
  self.resources['充能']=p.Talent[1];
  b.rules.before(b,mate,'basic','normal',mate.actions.basic,[en]);
  b.rules.after(b,mate,'basic','normal',mate.actions.basic,[en],[en]);
  const sp=self.buffs.find(e=>e.id===self.id+':hmkE1');assert.ok(sp,'E1 未提速');
  near(sp.value,self.kit.ranks[1][0]);assert.equal(sp.remaining,self.kit.ranks[1][1]);
  // 真实战斗：满层充能后追加攻击实际结算 4 段
  const a2=actor(1003),m2=plain();a2.panel.speed=200;m2.panel.speed=1;
  const bb=createBattle(battle([a2,m2],toughEnemy({panel:{...panel(),hp:1e9,speed:1}}),150));
  bb.units[0].resources['充能']=a2.kit.params.Talent[1];
  runAll(bb);
  assert.ok(dmgOf(bb,a2.id,'followup').length>=4,'真实战斗中未结算 4 段追加攻击');
});

test('姬子：E6 终结额外 2 次 40% 弹射（E0 无），真实战斗段数 = 1 / 3',()=>{
  for(const [eidolon,expect] of [[0,1],[6,3]]){
    const u=actor(1003,{eidolon});u.panel.speed=200;u.energy=u.energyMax;
    u.policy={...u.policy,autoUltimate:true};
    const b=createBattle(battle([u,plain()],enemy({panel:{...panel(),hp:1e9,speed:1}}),20));
    runAll(b,20);
    assert.equal(dmgOf(b,u.id,'direct').length,expect,`E${eidolon} 终结伤害段数`);
  }
});

test('姬子：行迹「星火」灼烧、「灼热」对灼烧目标战技增伤、「道标」高血暴击，E2 低血增伤，秘技火属性易伤',()=>{
  const u=actor(1003,{eidolon:2,technique:true}),x=plain();u.panel.speed=1;x.panel.speed=1;
  const b=createBattle(battle([u,x])),self=b.units[0],en=b.units.at(-1),p=self.kit.params;
  b.random=()=>0;
  const mm=en.buffs.find(e=>e.tag==='hmkMaze');assert.ok(mm,'秘技未生效');
  near(b.rules.modifiers(b,self,en,{element:'Fire',type:'Normal'},'direct').vuln,p.Maze[1]);
  assert.equal(b.rules.modifiers(b,self,en,{element:'Ice',type:'Normal'},'direct').vuln??0,0,'秘技只提高火属性伤害');
  b.rules.after(b,self,'basic','normal',self.actions.basic,[en],[en]);
  const burn=en.dots.find(d=>d.element==='Fire');assert.ok(burn,'行迹「星火」未灼烧');
  near(burn.terms[0].multiplier,self.kit.trace[1][2]);assert.equal(burn.remaining,self.kit.trace[1][1]);
  near(b.rules.modifiers(b,self,en,{element:'Fire',type:'BPSkill'},'direct').dmgBoost,self.kit.trace[2][0]);
  en.hp=en.panel.hp*self.kit.ranks[2][0]*.5;
  assert.ok(b.rules.modifiers(b,self,en,{element:'Fire',type:'Normal'},'direct').dmgBoost>=self.kit.ranks[2][1]);
  self.hp=combatPanel(self).hp;
  near(combatPanel(self).critRate,self.panel.critRate+self.kit.trace[3][1]);
});

test('姬子：秘技「不完全燃烧」火易伤对队友火伤同样生效，行迹「灼热」/E2 仍只作用于姬子自身',()=>{
  // 原始数据核对：100307 的 #2 即 Maze[1]，说明是「使敌方目标受到的火属性伤害提高」——目标侧易伤、全队共享。
  const mazeRaw=ROSTER_DATA[1003].skills['100307'].params['1'].param_list;
  assert.match(data.skills.find(s=>s.id===100307).desc,/受到的火属性伤害提高/,'100307 应为目标侧火易伤');
  const u=actor(1003,{eidolon:2,technique:true}),fx=plain('mateFire'),ix=plain('mateIce');
  u.panel.speed=200;fx.panel.speed=200;ix.panel.speed=200;
  fx.element='Fire';fx.actions.basic={...fx.actions.basic,name:'测试火战技',type:'BPSkill',element:'Fire'};
  ix.element='Ice';ix.actions.basic={...ix.actions.basic,name:'测试冰战技',type:'BPSkill',element:'Ice'};
  const b=createBattle(battle([u,fx,ix],null,60)),self=b.units[0],
    mf=b.units.find(t=>t.id==='mateFire'),mi=b.units.find(t=>t.id==='mateIce'),en=b.units.at(-1),p=self.kit.params;
  near(p.Maze[1],mazeRaw[1],'kit Maze[1] 必须对应 100307 #2');
  const mm=en.buffs.find(e=>e.tag==='hmkMaze');
  assert.ok(mm&&mm.source===self.id,'秘技未生效或火易伤来源不属于姬子');
  // 让「灼热」与 E2 的触发条件对任何攻击者都成立（目标带火 DoT 且生命低于 ranks[2][0]）；
  // 正确实现下队友不应因此获得姬子的自身增伤。
  en.dots.push({id:'test-burn',source:self.id,name:'测试灼烧',element:'Fire',
    terms:[{scaling:'atk',multiplier:1}],remaining:3,tickOwner:en.id,tickAt:'end'});
  en.hp=combatPanel(en).hp*self.kit.ranks[2][0]*.5;
  let n=0;while((!dmgOf(b,mf.id,'direct').length||!dmgOf(b,mi.id,'direct').length
    ||!dmgOf(b,self.id,'direct').length)&&stepBattle(b)&&n++<20){}
  const fireHit=dmgOf(b,mf.id,'direct')[0],iceHit=dmgOf(b,mi.id,'direct')[0],selfHit=dmgOf(b,self.id,'direct')[0];
  assert.ok(fireHit&&iceHit&&selfHit,'战斗内未采集到三方伤害实例');
  near(zoneOf(fireHit,'vuln'),1+p.Maze[1],'队友火伤应吃到姬子秘技的目标侧火易伤');
  near(zoneOf(fireHit,'dmgBoost'),1,'队友不应吃姬子「灼热」/E2 的自身增伤');
  near(zoneOf(iceHit,'vuln'),1,'队友非火伤不应吃姬子秘技火易伤');
  near(zoneOf(selfHit,'vuln'),1+p.Maze[1],'姬子自身火伤仍应吃到秘技火易伤');
  // 逐模块口径：队友只拿到 vuln，没有 dmgBoost；姬子自身两者齐全。
  const modMate=b.rules.modifiers(b,mf,en,{element:'Fire',type:'BPSkill'},'direct');
  near(modMate.vuln??0,p.Maze[1],'队友火伤只应获得火易伤');
  near(modMate.dmgBoost??0,0,'队友不应获得姬子自身增伤');
  // 移除姬子自己施加的 debuff 实例后，任何攻击者都不再享受火易伤。
  en.buffs=en.buffs.filter(e=>e.tag!=='hmkMaze');
  near(b.rules.modifiers(b,self,en,{element:'Fire',type:'Normal'},'direct').vuln??0,0,'移除秘技后姬子火伤不应再有易伤');
  near(b.rules.modifiers(b,mf,en,{element:'Fire',type:'BPSkill'},'direct').vuln??0,0,'移除秘技后队友火伤不应再有易伤');
});

// ── 7. 目标选择 / 削韧 / 控制 / 阵亡 ──
test('灵砂：浮元的额外单体伤害优先选择韧性>0 且火弱点的目标',()=>{
  const u=actor(1222),x=plain();u.panel.speed=1;x.panel.speed=1;
  const plainEnemy=enemy({id:'plain'});
  const fireEnemy=toughEnemy({id:'fire',weaknesses:['Fire']});
  const b=createBattle({strict:true,maxAV:200,sp:3,maxSP:9,seed:11,critMode:'noncrit',units:[u,x,plainEnemy,fireEnemy]});
  b.random=()=>.99;   // 若有优先池，只能在优先池内取值
  const self=b.units[0];
  b.rules.after(b,self,'skill','normal',self.actions.skill,[b.units[3]],[b.units[3]]);
  const s=b.summons.find(v=>v.owner===self.id);
  b.rules.summonTurn(b,self,s);
  const hits=id=>b.log.filter(e=>e.type==='damage'&&e.actor===self.id&&e.kind==='followup'&&e.target===id).length;
  assert.equal(hits('fire'),2,'火弱点目标应吃到全体段 + 额外单体段');
  assert.equal(hits('plain'),1,'无火弱点目标只应吃到全体段');
});

test('batch07 削韧：神君每段按 Talent 的 stance[0]=15，姬子天赋追加攻击按 stance[1]=30 结算',()=>{
  {
    const u=actor(1204),x=plain();u.panel.speed=1;x.panel.speed=1;
    const b=createBattle(battle([u,x],toughEnemy({id:'thunder',weaknesses:['Thunder']})));
    const self=b.units[0],en=b.units.at(-1),s=b.summons.find(v=>v.owner===self.id);
    const t0=en.toughness,stance=ROSTER_DATA[1204].skills['120404'].stance[0];
    b.rules.summonTurn(b,self,s);
    near(en.toughness,t0-stance*self.kit.params.Talent[3],1e-6);
  }
  {
    const u=actor(1003),x=plain();u.panel.speed=1;x.panel.speed=1;
    const b=createBattle({strict:true,maxAV:1,sp:3,maxSP:9,seed:13,critMode:'noncrit',
      units:[u,x,toughEnemy({id:'fire'})]});
    const self=b.units[0],mate=b.units[1],en=b.units.at(-1),p=self.kit.params;
    self.resources['充能']=p.Talent[1];
    b.rules.before(b,mate,'basic','normal',mate.actions.basic,[en]);
    b.rules.after(b,mate,'basic','normal',mate.actions.basic,[en],[en]);
    const t0=en.toughness;
    stepBattle(b);   // 队列中的天赋追加攻击在此结算
    near(en.toughness,t0-ROSTER_DATA[1003].skills['100304'].stance[1],1e-6);
  }
});

test('景元：景元陷入控制类负面状态时【神君】无法行动',()=>{
  const u=actor(1204),x=plain();u.panel.speed=1;x.panel.speed=1;
  const b=createBattle(battle([u,x])),self=b.units[0],s=b.summons.find(v=>v.owner===self.id);
  self.buffs.push({type:'buff',id:'ctrl',name:'测试控制',key:'marker',value:0,control:'imprisonment',
    source:'enemy',tickOwner:self.id,tickAt:'end'});
  const n0=dmgOf(b,self.id,'followup').length;
  b.rules.summonTurn(b,self,s);
  assert.equal(dmgOf(b,self.id,'followup').length,n0,'受控时神君不应结算攻击');
  assert.ok(b.log.some(e=>e.type==='mechanic'&&e.name==='神君 · 景元受控无法行动'),'未记录受控跳过');
});

test('batch07：召唤者阵亡后神君 / 浮元随 sync 消失（不置 active=false 于其它路径）',()=>{
  {
    const u=actor(1204),x=plain();u.panel.speed=1;x.panel.speed=1;
    const b=createBattle(battle([u,x])),self=b.units[0],s=b.summons.find(v=>v.owner===self.id);
    self.hp=0;b.rules.sync(b);
    assert.equal(s.active,false,'景元阵亡后神君未消失');
  }
  {
    const u=actor(1222),x=plain();u.panel.speed=1;x.panel.speed=1;
    const b=createBattle(battle([u,x])),self=b.units[0],en=b.units.at(-1);
    b.rules.after(b,self,'skill','normal',self.actions.skill,[en],[en]);
    const s=b.summons.find(v=>v.owner===self.id);
    self.hp=0;b.rules.sync(b);
    assert.equal(s.active,false,'灵砂阵亡后浮元未消失');
  }
});

// ── 8. 真实战斗：召唤物行动条推进 / 抽牌链 ──
test('batch07：真实战斗中召唤物按独立行动条推进（神君多次行动、浮元进场并结算），青雀战技链与手牌上限',()=>{
  {
    const u=actor(1204),x=plain();u.panel.speed=1;x.panel.speed=1;
    const b=createBattle(battle([u,x],enemy({panel:{...panel(),hp:1e9,speed:1}}),700));
    runAll(b);
    const turns=b.log.filter(e=>e.type==='summon_turn'&&e.actor===u.id);
    assert.ok(turns.length>=2,'神君未按独立行动条多次行动');
    assert.ok(dmgOf(b,u.id,'followup').length>=u.kit.params.Talent[3],'神君未结算追加攻击');
    assert.ok(!b.summons.some(s=>s.owner===u.id&&s.active===false),'神君不应消失');
  }
  {
    const u=actor(1222),x=plain();u.panel.speed=120;x.panel.speed=1;
    const b=createBattle(battle([u,x],enemy({panel:{...panel(),hp:1e9,speed:1}}),700));
    runAll(b);
    assert.ok(b.summons.some(s=>s.owner===u.id),'浮元未出现');
    assert.ok(b.log.some(e=>e.type==='summon_turn'),'浮元未按独立行动条行动');
    assert.ok(dmgOf(b,u.id,'followup').length>0,'浮元未结算追加攻击');
  }
  {
    const u=actor(1201),x=plain();u.panel.speed=100;x.panel.speed=1;
    const b=createBattle(battle([u,x],enemy({panel:{...panel(),hp:1e9,speed:1}}),400));
    b.random=()=>.4;
    runAll(b);
    const acts=actsOf(b,u.id);
    assert.ok(acts.some(e=>e.key==='skill'),'青雀未施放战技');
    assert.ok(acts.some(e=>e.kind==='extra'),'战技后本回合未继续行动');
    const over=b.log.some(e=>{const f=e.frame?.units?.find(x2=>x2.id===u.id);return f&&(f.resources['琼玉牌']??0)>4;});
    assert.ok(!over,'琼玉牌超过 4 张上限');
  }
});

// ── 9. 四人严格战斗 ──
test('batch07 4 名角色 E0/E3/E6 与既有四人体系混编可完成严格战斗，无未支持缺口',()=>{
  for(const id of IDS)for(const eidolon of [0,3,6]){
    const a=actor(id,{eidolon}),ar=actor(1015),s=actor(1306),ce=actor(1412);
    a.id='focus';a.energy=a.energyMax;a.policy={...a.policy,autoUltimate:true,allyTargetId:ar.id};
    s.policy.allyTargetId=ar.id;ce.policy.allyTargetId=ar.id;
    const c={strict:true,maxAV:260,sp:3,maxSP:9,seed:3,critMode:'expected',requiredAllies:4,units:[a,s,ar,ce,enemy()]};
    assert.deepEqual(validateBattle(c),[]);
    const r=simulateBattle(c);
    assert.ok(r.damage>0,id+' E'+eidolon+' 混编战斗没有伤害');
    assert.deepEqual(r.unsupported,[],id+' E'+eidolon+' 出现未支持缺口');
  }
});

console.log(`DeepSeek batch07 checks: ${passed} passed, ${failed} failed.`);if(failed)process.exitCode=1;
