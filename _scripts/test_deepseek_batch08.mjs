// DeepSeek 第 8 批：1310 流萤 / 1315 波提欧 / 1317 乱破 / 8006 开拓者•同谐 的机制测试。
// 期望值全部由 4.6 编译出的 kit 参数（params / trace / ranks）、ROSTER_DATA 的 stance / spBase
// 与固定原始脚本常量推导，不写死倍率；时序用 b.rules.before / after / afterHit / afterDamage /
// death / summonTurn 直接驱动，数值用伤害事件的 base 乘区核对。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createContext} from '../core/ctx.mjs';
import {ROSTER_DATA} from '../simulator/roster-data.mjs';
import {BREAK_BASE} from '../simulator/game-data.mjs';
import {newBattleBuild,buildBattleActor} from '../simulator/builds.mjs';
import {createBattle,stepBattle,simulateBattle,validateBattle,combatPanel} from '../simulator/engine.mjs';
import {validateKitActor} from '../simulator/kits.mjs';
import {IDS} from '../simulator/characters/extra/batch08.mjs';
const data=JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url))),ctx=createContext(data);
const near=(a,b,m=1e-6)=>assert.ok(Math.abs(a-b)<m,`${a} != ${b}`);
const panel=()=>({hp:10000,atk:1000,def:1000,speed:100,critRate:.5,critDmg:1,energyRegen:1,effectHit:0,effectRes:0,breakEffect:0,baseStats:{hp:1000,atk:1000,def:1000},elemDmg:{}});
const actor=(id,extra={})=>{const a=buildBattleActor(ctx,{...newBattleBuild(),characterId:id,relicAuto:false,panel:panel(),...extra});a.energy=0;a.policy={...a.policy,autoUltimate:false};return a;};
const plain=()=>({id:'mate',name:'测试队员',side:'ally',level:80,element:'Physical',panel:{...panel(),speed:1},energy:0,energyMax:100,
  actions:{basic:{name:'测试普攻',type:'Normal',terms:[{scaling:'atk',multiplier:1}],spGain:1,energyGain:20,toughness:30}},policy:{autoUltimate:false,basicOnly:true}});
const enemy=(extra={})=>({id:'enemy',name:'规则训练敌人',side:'enemy',level:90,element:'Physical',panel:{...panel(),hp:1e9,speed:1},energy:0,energyMax:0,res:{},
  actions:{basic:{name:'测试攻击',type:'Normal',terms:[{scaling:'atk',multiplier:1}],hitEnergy:10}},policy:{autoUltimate:false,basicOnly:true},...extra});
const toughEnemy=(extra={})=>enemy({toughnessMax:300,weaknesses:['Physical'],standardBreak:true,rank:'elite',...extra});
const battle=(units,en=null,maxAV=201)=>({strict:true,maxAV,sp:3,maxSP:9,seed:42,critMode:'noncrit',units:[...units,en??enemy()]});
const baseOf=ev=>ev.formula.find(f=>f.zone==='base').value;
const dmgOf=(b,id,kind)=>b.log.filter(e=>e.type==='damage'&&e.actor===id&&(kind?e.kind===kind:true));
const st=(id,skillId,index)=>ROSTER_DATA[id].skills?.[String(skillId)]?.stance?.[index]??0;
const rowFor=(id,refId,targetId,refValue)=>{const t=ROSTER_DATA[id].skills[String(refId)].params;
  const k=Object.keys(t).find(k=>Math.abs(t[k].param_list[0]-refValue)<1e-9);return ROSTER_DATA[id].skills[String(targetId)].params[k??'10'].param_list;};
// 驱动一次真实动作：入队后走引擎的 flush（会触发 prepare / before / damageTo / after）。
const drive=(b,id,key,kind='normal',targetId=null)=>{b.queue.push({actor:id,key,kind,targetId});let n=0;while(stepBattle(b)&&n<4)n++;};
let passed=0,failed=0;const test=(name,fn)=>{try{fn();passed++;console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+'\n'+e.stack);}};

test('batch08 4 名角色 E0～E6 合同可编译且不能篡改倍率',()=>{
  assert.deepEqual([...IDS].sort((a,b)=>a-b),[1310,1315,1317,8006]);
  for(const id of IDS)for(let eidolon=0;eidolon<=6;eidolon++){
    const a=actor(id,{eidolon});assert.deepEqual(validateKitActor(a),[]);
    assert.deepEqual(a.unsupported,[]);
    a.actions.basic.terms[0].multiplier=99;assert.ok(validateKitActor(a).length,id+' 篡改倍率未被拒绝');}
});

test('流萤：战技按 BPSkill 消耗生命上限、回能与行动提前',()=>{
  const u=actor(1310);u.panel.speed=200;
  const b=createBattle(battle([u,plain()]));
  const self=b.units[0],p=self.kit.params,max=combatPanel(self).hp;
  let n=0;while(stepBattle(b)&&n<2)n++;
  assert.ok(b.log.some(e=>e.type==='action'&&e.actor===self.id&&e.key==='skill'),'未施放战技');
  const cons=b.log.find(e=>e.type==='hp_consume'&&e.target===self.id);
  assert.ok(cons,'战技未消耗生命值');
  near(cons.amount,Math.min(max-1,max*p.BPSkill[1]));
  assert.equal(self.actions.skill.energyGain,self.energyMax*p.BPSkill[2]);
  assert.equal(self.actions.skill.spCost,1);
  assert.ok(b.log.some(e=>e.type==='advance'&&e.actor===self.id),'战技未行动提前');
});

test('流萤：终结技进入完全燃烧（速度 / 倒计时 / 禁用终结）并由倒计时解除',()=>{
  const u=actor(1310),b=createBattle(battle([u,plain()]));
  const [self]=b.units,p=self.kit.params;
  b.rules.after(b,self,'ultimate','ultimate',self.actions.ultimate,[self],[]);
  assert.ok(self.buffs.some(e=>e.tag==='samBurn'),'未进入完全燃烧');
  near(self.buffs.find(e=>e.id===self.id+':sam:speed').value,p.Ultra[2]);
  assert.equal(self.policy.autoUltimate,false,'完全燃烧中未禁用终结技');
  const s=b.summons.find(x=>x.kind==='countdown'&&x.owner===self.id);
  assert.ok(s,'未生成完全燃烧倒计时');near(s.speed,p.Ultra[3]);
  const dist=self.distance;void dist;
  b.rules.summonTurn(b,self,s);
  assert.ok(!self.buffs.some(e=>e.tag==='samBurn'),'倒计时未解除完全燃烧');
  assert.equal(self.policy.autoUltimate,true);
  assert.equal(s.active,false);
});

test('流萤：完全燃烧下普攻与战技替换为强化形态，强化战技按击破特攻动态增伤、E1 免费并无视防御',()=>{
  for(const eidolon of [0,1]){
    const u=actor(1310,{eidolon}),b=createBattle(battle([u,plain()]));
    const [self,en]=b.units,p=self.kit.params;
    self.buffs.push({id:'sam:burn',tag:'samBurn',type:'buff',key:'marker',value:0,source:self.id});
    assert.equal(b.rules.prepare(b,self,'basic','normal',self.actions.basic).name,self.actions.enhancedBasic.name);
    const eb=b.rules.prepare(b,self,'skill','normal',self.actions.skill);
    assert.equal(eb.name,self.actions.enhancedSkill.name);
    self.panel.breakEffect=1.0;
    const es=rowFor(1310,131002,131009,p.BPSkill[0]);
    const dyn=b.rules.prepare(b,self,'skill','normal',self.actions.skill);
    near(dyn.terms[0].multiplier,es[4]*Math.min(1.0,es[6])+es[0]);
    near(dyn.terms[1].multiplier,es[5]*Math.min(1.0,es[6])+es[1]);
    assert.equal(dyn.terms[1].target,'adjacent');
    assert.equal(dyn.spCost,eidolon>=1?0:1,'E1 强化战技应不消耗战技点');
    const m=b.rules.modifiers(b,self,en,dyn,'normal');
    assert.equal(m.defIgnore??0,eidolon>=1?self.kit.ranks[1][0]:0,'E1 强化战技未无视防御');
  }
});

test('流萤：β模组按击破特攻阈值注入超击破并在击破目标上结算 kind=superbreak',()=>{
  const u=actor(1310);u.panel.speed=200;u.panel.breakEffect=3.6;
  const b=createBattle(battle([u,plain()],toughEnemy({weaknesses:['Fire']})));
  const [self]=b.units,en=b.units.at(-1);
  // 阈值：>=2 用 0.35；>=3.6 用 0.5；低于 2 不注入。
  self.buffs.push({id:'sam:burn',tag:'samBurn',type:'buff',key:'marker',value:0,source:self.id});
  const t=self.kit.trace[2];
  self.panel.breakEffect=1.0;
  assert.equal(b.rules.prepare(b,self,'basic','normal',self.actions.basic).superBreak,undefined);
  self.panel.breakEffect=2.0;
  near(b.rules.prepare(b,self,'basic','normal',self.actions.basic).superBreak,t[2]);
  self.panel.breakEffect=3.6;
  near(b.rules.prepare(b,self,'basic','normal',self.actions.basic).superBreak,t[3]);
  // 真实结算：目标已击破时按本次削韧自动触发超击破。
  en.broken=true;
  const before=dmgOf(b,self.id,'superbreak').length;
  drive(b,self.id,'basic','normal',en.id);
  const evs=dmgOf(b,self.id,'superbreak').slice(before,before+self.actions.enhancedBasic.hitShares.length);
  assert.equal(evs.length,self.actions.enhancedBasic.hitShares.length,'超击破段数与强化普攻段数不一致');
  const total=evs.reduce((s,e)=>s+baseOf(e),0);
  const tough=st(1310,131008,0)*(1+(0));
  near(total,BREAK_BASE[self.level]*tough/30*(1+3.6)*t[3]);
});

test('流萤：α模组对无火弱点目标按 55% 削韧并挂临时火弱点，行动后移除',()=>{
  const u=actor(1310),b=createBattle(battle([u,plain()],toughEnemy({weaknesses:['Physical']})));
  const [self]=b.units,en=b.units.at(-1);
  assert.equal(self.kit.trace[1][0],0.55);
  self.buffs.push({id:'sam:burn',tag:'samBurn',type:'buff',key:'marker',value:0,source:self.id});
  const prep=b.rules.prepare(b,self,'basic','normal',self.actions.basic);
  b.rules.before(b,self,'basic','normal',prep,[en]);
  near(prep.toughness,st(1310,131008,0)*self.kit.trace[1][0]);
  assert.ok(en.buffs.some(e=>e.weakness==='Fire'),'未挂临时火弱点');
  b.rules.after(b,self,'basic','normal',prep,[en],[en]);
  assert.ok(!en.buffs.some(e=>e.weakness==='Fire'),'行动后未移除临时火弱点');
});

test('流萤：天赋能量下限 / 满能量净化 / γ模组攻击转击破特攻 / E4 效果抵抗 / E6 火抗穿',()=>{
  const u=actor(1310,{eidolon:6}),b=createBattle(battle([u,plain()]));
  const [self]=b.units,en=b.units.at(-1),p=self.kit.params;
  near(self.energy,self.energyMax*p.Talent[1],1e-6);        // 开场能量下限
  // 满能量解除所有负面效果
  self.buffs.push({id:'bad',debuff:true,type:'buff',key:'speed',value:-.1,source:en.id,remaining:3,tickOwner:self.id,tickAt:'end'});
  self.energy=self.energyMax;
  b.rules.afterDamage(b,en,self,'direct');
  assert.ok(!self.buffs.some(e=>e.id==='bad'),'满能量未解除负面效果');
  // γ模组：攻击力 2400 → (2400-1800)/10×0.8%
  self.panel.atk=2400;
  const g=self.kit.trace[3];
  near(combatPanel(self).breakEffect,Math.floor((2400-g[0])/g[1])*g[2]);
  // E4 燃烧中效果抵抗、E6 火抗穿
  b.rules.after(b,self,'ultimate','ultimate',self.actions.ultimate,[self],[]);
  near(combatPanel(self).effectRes,p.Talent[3]+self.kit.ranks[4][0]);
  near(b.rules.modifiers(b,self,en,{type:'Break',element:'Fire'},'break').resPen,self.kit.ranks[6][0]);
  // 天赋减伤：满血时低于燃烧中的上限
  const dr0=combatPanel(self).dmgReduction??0;
  assert.ok(dr0<=p.Talent[0]+1e-9,'燃烧中减伤超过上限');
});

test('流萤：E2 强化攻击击破或击杀后获得额外回合并进入冷却',()=>{
  const u=actor(1310,{eidolon:2}),b=createBattle(battle([u,plain()],toughEnemy()));
  const [self]=b.units,en=b.units.at(-1);
  b.rules.after(b,self,'ultimate','ultimate',self.actions.ultimate,[self],[]);
  const prep=b.rules.prepare(b,self,'basic','normal',self.actions.basic);
  b.queue.length=0;en.broken=true;en.hp=en.panel.hp*0;en.hp=1;
  b.rules.after(b,self,'basic','normal',prep,[en],[en]);
  assert.ok(b.queue.some(q=>q.actor===self.id&&q.kind==='extra'),'E2 未给出额外回合');
  // 冷却计时者为流萤自身回合（E2「#2 回合后可再次触发」）。
  assert.equal(self.resources['E2冷却'],self.turns+self.kit.ranks[2][1]);
});

test('流萤：秘技每波次开始添加火弱点并造成 Maze 伤害',()=>{
  const u=actor(1310,{technique:true});u.panel.speed=200;
  const b=createBattle(battle([u,plain()],toughEnemy({weaknesses:['Physical']})));
  const self=b.units[0],en=b.units.at(-1),p=self.kit.params;
  assert.ok(en.buffs.some(e=>e.weakness==='Fire'),'秘技未添加火弱点');
  const ev=dmgOf(b,self.id,'technique');
  assert.equal(ev.length,1);
  near(baseOf(ev[0]),combatPanel(self).atk*p.Maze[1]);
  void en;
});

test('波提欧：战技进入绝命对峙（嘲讽/易伤/持续/不回能/额外回合/无法再放战技）',()=>{
  const u=actor(1315),b=createBattle(battle([u,plain()],toughEnemy()));
  const self=b.units[0],en=b.units.at(-1),p=self.kit.params;
  assert.equal(self.actions.skill.spCost,1);
  assert.equal(self.actions.skill.energyGain,0,'战技不应回能');
  b.rules.after(b,self,'skill','normal',self.actions.skill,[en],[]);
  assert.ok(en.buffs.some(e=>e.tag==='boothillMark'),'未标记对峙目标');
  const duel=self.buffs.find(e=>e.tag==='boothillDuel');
  assert.ok(duel,'未进入绝命对峙');
  assert.equal(duel.remaining,p.BPSkill[2]);
  assert.ok(b.queue.some(q=>q.actor===self.id&&q.kind==='extra'),'战技后本回合不应结束');
  assert.equal(b.rules.shouldUseSkill(b,self),false,'对峙中不应再施放战技');
  near(combatPanel(self).aggroRatio,10);
  // 对峙目标受到波提欧攻击时 +BPSkill[0]；波提欧受到该目标攻击时 +BPSkill[1]
  near(b.rules.modifiers(b,self,en,self.actions.basic,'normal').vuln,p.BPSkill[0]);
  near(b.rules.modifiers(b,en,self,en.actions.basic,'normal').vuln,p.BPSkill[1]);
});

test('波提欧：强化普攻仅指向对峙目标、不回战技点、按口袋层数提高削韧',()=>{
  const u=actor(1315),b=createBattle(battle([u,plain()],toughEnemy()));
  const self=b.units[0],en=b.units.at(-1),p=self.kit.params;
  b.rules.after(b,self,'skill','normal',self.actions.skill,[en],[]);
  self.resources['优势口袋']=p.Talent[4];
  const prep=b.rules.prepare(b,self,'basic','normal',self.actions.basic);
  assert.equal(prep.name,self.actions.enhancedBasic.name);
  assert.equal(prep.targetId,en.id,'强化普攻未锁定对峙目标');
  assert.equal(prep.spGain,0,'强化普攻不应恢复战技点');
  near(prep.toughness,st(1315,131508,0)*(1+p.Talent[3]*p.Talent[4]));
  // 无对峙时仍是普通普攻
  b.rules.death(b,self,en);
  assert.equal(b.rules.prepare(b,self,'basic','normal',self.actions.basic).name,self.actions.basic.name);
});

test('波提欧：天赋对击破目标按口袋层数造成物理击破伤害（韧性上限 16×普攻削韧）与 E6 额外项',()=>{
  for(const eidolon of [0,6]){
    const u=actor(1315,{eidolon});
    const eA=toughEnemy({id:'enemyA'}),eB=toughEnemy({id:'enemyB'});
    const b=createBattle({strict:true,maxAV:201,sp:3,maxSP:9,seed:42,critMode:'noncrit',units:[u,plain(),eA,eB]});
    const self=b.units[0],en=b.units[2],adj=b.units[3],p=self.kit.params;
    b.rules.after(b,self,'skill','normal',self.actions.skill,[en],[]);
    self.resources['优势口袋']=1;en.broken=true;
    const prep=b.rules.prepare(b,self,'basic','normal',self.actions.basic);
    const before=dmgOf(b,self.id,'break').length;
    b.rules.after(b,self,'basic','normal',prep,[en],[en]);
    const evs=dmgOf(b,self.id,'break').slice(before);
    const tough=Math.min(en.toughnessMax,st(1315,131501,0)*16);
    const unit=BREAK_BASE[self.level]*(1+combatPanel(self).breakEffect)*(.5+tough/120)*2;
    assert.ok(evs.length>=1,'未造成天赋击破伤害');
    near(baseOf(evs[0]),unit*p.Talent[0]);
    if(eidolon>=6){
      const extras=evs.slice(1).map(baseOf);
      assert.ok(extras.some(v=>Math.abs(v-unit*p.Talent[0]*self.kit.ranks[6][0])<1e-6),'E6 单体额外项缺失');
      assert.ok(extras.some(v=>Math.abs(v-unit*p.Talent[0]*self.kit.ranks[6][1])<1e-6),'E6 相邻额外项缺失');
      assert.equal(adj.broken,false);
    } else assert.equal(evs.length,1);
  }
});

test('波提欧：口袋获取 / 抵近射击回能 / E1 开局口袋与无视防御 / E2 回战技点与击破特攻',()=>{
  // E1：开局 1 层口袋 + 无视 16% 防御
  const e1=actor(1315,{eidolon:1}),b=createBattle(battle([e1,plain()],toughEnemy()));
  const s1=b.units[0],en1=b.units.at(-1);
  assert.equal(s1.resources['优势口袋'],1,'E1 未在开局给予口袋');
  near(b.rules.modifiers(b,s1,en1,s1.actions.basic,'normal').defIgnore,s1.kit.ranks[1][0]);
  // 抵近射击：对峙中获得口袋回 10 能
  b.rules.after(b,s1,'skill','normal',s1.actions.skill,[en1],[]);
  const energy0=s1.energy;
  b.rules.death(b,s1,en1);
  near(s1.energy,Math.min(s1.energyMax,energy0+s1.kit.trace[3][0]),1e-6);
  assert.equal(s1.resources['优势口袋'],2);
  // E2：对峙中获得口袋 → +1 战技点 + 30% 击破特攻 2 回合
  const e2=actor(1315,{eidolon:2}),b2=createBattle(battle([e2,plain()],toughEnemy()));
  const s2=b2.units[0],en2=b2.units.at(-1);
  b2.rules.after(b2,s2,'skill','normal',s2.actions.skill,[en2],[]);
  const sp0=b2.sp;
  b2.rules.death(b2,s2,en2);
  assert.equal(b2.sp,Math.min(b2.maxSP,sp0+s2.kit.ranks[2][0]));
  near(s2.buffs.find(e=>e.id===s2.id+':boothill-e2').value,s2.kit.ranks[2][1]);
  // 行迹幽灵装填：暴击按击破特攻
  s2.panel.breakEffect=1.0;
  const be=combatPanel(s2).breakEffect??0;
  const m=b2.rules.modifiers(b2,s2,en2,s2.actions.basic,'normal');
  near(m.critRate,Math.min(s2.kit.trace[1][1],be*s2.kit.trace[1][0]),1e-6);
});

test('波提欧：终结技加物理弱点与行动延后；秘技使下次战技附加物理弱点',()=>{
  const u=actor(1315),b=createBattle(battle([u,plain()],toughEnemy({weaknesses:['Physical']})));
  const self=b.units[0],en=b.units.at(-1),p=self.kit.params;
  b.rules.after(b,self,'ultimate','ultimate',self.actions.ultimate,[en],[en]);
  assert.ok(en.buffs.some(e=>e.weakness==='Physical'),'终结技未加物理弱点');
  assert.ok(b.log.some(e=>e.type==='delay'&&e.actor===en.id),'终结技未行动延后');
  // 秘技
  const t=actor(1315,{technique:true}),bt=createBattle(battle([t,plain()],toughEnemy({weaknesses:[]})));
  const st1=bt.units[0],en1=bt.units.at(-1);
  assert.ok(st1.resources['秘技激活']);
  bt.rules.after(bt,st1,'skill','normal',st1.actions.skill,[en1],[]);
  assert.ok(en1.buffs.some(e=>e.weakness==='Physical'),'秘技未让下次战技加物理弱点');
  near(en1.buffs.find(e=>e.weakness==='Physical').remaining,p.Maze[0]);
});

test('乱破：终结技进入结印（额外回合/彩墨/击破效率/击破特攻）并禁用战技与终结',()=>{
  const u=actor(1317),b=createBattle(battle([u,plain()]));
  const [self]=b.units,p=self.kit.params;
  b.rules.after(b,self,'ultimate','ultimate',self.actions.ultimate,[self],[]);
  assert.ok(self.buffs.some(e=>e.tag==='rappaSeal'),'未进入结印');
  assert.equal(self.resources['彩墨'],p.Ultra[2]);
  near(self.buffs.find(e=>e.id===self.id+':rappa-beff').value,p.Ultra[0]);
  near(self.buffs.find(e=>e.id===self.id+':rappa-be').value,p.Ultra[1]);
  assert.equal(self.policy.autoUltimate,false);
  assert.equal(b.rules.shouldUseSkill(b,self),false,'结印中不应施放战技');
  assert.ok(b.queue.some(q=>q.actor===self.id&&q.kind==='extra'),'结印未给出额外回合');
});

test('乱破：强化普攻消耗彩墨、耗尽退出结印，E1 无视防御与退出回能',()=>{
  const u=actor(1317,{eidolon:1}),b=createBattle(battle([u,plain()],toughEnemy({weaknesses:['Imaginary']})));
  const self=b.units[0],en=b.units.at(-1),p=self.kit.params;
  b.rules.after(b,self,'ultimate','ultimate',self.actions.ultimate,[self],[]);
  const prep=b.rules.prepare(b,self,'basic','normal',self.actions.basic);
  assert.equal(prep.name,self.actions.enhancedNormal.name);
  assert.equal(prep.spGain,0,'强化普攻不应恢复战技点');
  near(b.rules.modifiers(b,self,en,prep,'direct').defIgnore,self.kit.ranks[1][0]);
  b.queue.length=0;
  for(let i=0;i<p.Ultra[2];i++)b.rules.after(b,self,'basic','normal',prep,[en],[en]);
  assert.equal(self.resources['彩墨'],0);
  assert.ok(!self.buffs.some(e=>e.tag==='rappaSeal'),'彩墨耗尽未退出结印');
  assert.equal(self.policy.autoUltimate,true);
  assert.ok(b.log.some(e=>e.type==='energy'&&e.actor===self.id&&e.amount===self.kit.ranks[1][1]),'退出结印未回复能量');
});

test('乱破：天赋充能上限、破韧叠层与第 3 段消耗充能造成虚数击破伤害（E6 返还）',()=>{
  for(const eidolon of [0,6]){
    const u=actor(1317,{eidolon}),b=createBattle(battle([u,plain()],toughEnemy({weaknesses:['Imaginary']})));
    const self=b.units[0],en=b.units.at(-1),p=self.kit.params;
    const max=p.Talent[0]+(eidolon>=6?self.kit.ranks[6][1]:0);
    assert.equal(self.resources['充能上限'],max);
    if(eidolon>=6)assert.equal(self.resources['充能'],self.kit.ranks[6][0]);
    // 破韧事件叠层（引擎先写 type='break' 日志）
    b.log.push({type:'break',target:en.id});
    const c0=self.resources['充能'];
    b.rules.afterDamage(b,plain,en,'break');
    // 精英目标额外触发行迹「魔天」：+trace[1][1] 充能（与基础 +1 叠加）。
    const elite=self.kit.trace[1]&&en.rank==='elite'?self.kit.trace[1][1]:0;
    assert.equal(self.resources['充能'],Math.min(max,c0+1+elite),'破韧未叠充能');
    // 结印 + 第 3 段：按层数造成虚数击破伤害并消耗充能
    b.rules.after(b,self,'ultimate','ultimate',self.actions.ultimate,[self],[]);
    self.resources['充能']=3;
    const before=dmgOf(b,self.id,'break').length;
    b.rules.after(b,self,'basic','normal',b.rules.prepare(b,self,'basic','normal',self.actions.basic),[en],[en]);
    const evs=dmgOf(b,self.id,'break').slice(before).filter(e=>baseOf(e)>0);
    assert.equal(evs.length,1,'第 3 段未造成虚数击破伤害');
    const unit=BREAK_BASE[self.level]*(1+combatPanel(self).breakEffect)*(.5+en.toughnessMax/120)*0.5;
    near(baseOf(evs[0]),unit*(p.Talent[2]+p.Talent[4]*3));
    assert.equal(self.resources['充能'],eidolon>=6?self.kit.ranks[6][0]:0,'充能消耗 / E6 返还错误');
  }
});

test('乱破：海鸣对击破目标注入 60% 超击破；E2 削韧系数 / E4 全队速度 / 枯叶易伤',()=>{
  const u=actor(1317,{eidolon:4}),b=createBattle(battle([u,plain()],toughEnemy({weaknesses:['Imaginary']})));
  const [self,mate,en]=b.units;  b.rules.after(b,self,'ultimate','ultimate',self.actions.ultimate,[self],[]);
  const prep=b.rules.prepare(b,self,'basic','normal',self.actions.basic);
  near(prep.superBreak,self.kit.trace[2][0]);              // 行迹海鸣 60%
  const ph1=st(1317,131708,0),ph3=st(1317,131712,1);
  near(prep.toughness,st(1317,131718,0)*(1+self.kit.ranks[2][0]*2*(ph1/(ph1*2+ph3))));
  near(mate.buffs.find(e=>e.id==='rappa-e4').value,self.kit.ranks[4][0]);   // E4 全队速度
  // 枯叶：破韧后 2 回合易伤
  b.log.push({type:'break',target:en.id});
  b.rules.afterDamage(b,mate,en,'break');
  const leaf=en.buffs.find(e=>e.id===self.id+':rappa-leaf');
  assert.ok(leaf,'枯叶未挂易伤');
  const t=self.kit.trace[3];
  const extra=Math.min(t[3],Math.floor(Math.max(0,combatPanel(self).atk-t[1])/100)*t[2]);
  near(leaf.value,t[0]+extra);assert.equal(leaf.remaining,t[4]);
  // 真实超击破结算
  en.broken=true;
  const before=dmgOf(b,self.id,'superbreak').length;
  drive(b,self.id,'basic','normal',en.id);
  assert.ok(dmgOf(b,self.id,'superbreak').length>before,'海鸣未结算超击破');
});

test('开拓者•同谐：终结技给全队伴舞（击破特攻/持续回合），伴舞按削韧触发超击破并按敌方数量增伤',()=>{
  const hmc=actor(8006),mate=plain();
  const b=createBattle(battle([hmc,mate],toughEnemy()));
  const [self,m,en]=b.units,p=self.kit.params;
  b.rules.after(b,self,'ultimate','ultimate',self.actions.ultimate,[self],[]);
  for(const to of [self,m]){
    const d=to.buffs.find(e=>e.tag==='hmcDance');
    assert.ok(d,'伴舞未覆盖全队');
    near(d.value,p.Ultra[2]);assert.equal(d.remaining,p.Ultra[0]);
  }
  en.broken=true;
  const before=dmgOf(b,m.id,'superbreak').length;
  b.rules.afterHit(b,m,en,{toughness:30,hitShares:[1],segment:1,target:'single',element:'Physical',type:'Normal'},'direct',{});
  const evs=dmgOf(b,m.id,'superbreak').slice(before);
  assert.equal(evs.length,1,'伴舞未触发超击破');
  const be=combatPanel(m).breakEffect??0;
  near(baseOf(evs[0]),BREAK_BASE[m.level]*30/30*(1+be)*1);
  // 卫我起舞：1 名敌人 → trace[1][4] 增伤在 modifiers 中按 kind=superbreak 提供
  near(b.rules.modifiers(b,m,en,{type:'SuperBreak',element:'Physical'},'superbreak').dmgBoost,self.kit.trace[1][4]);
});

test('开拓者•同谐：战技首段削韧 +100% 与 E6 额外弹射；E1 首次战技回点 / E2 回能效率 / E4 队友击破特攻',()=>{
  const u=actor(8006,{eidolon:6}),b=createBattle(battle([u,plain()]));
  const [self,mate]=b.units,p=self.kit.params;
  const prep=b.rules.prepare(b,self,'skill','normal',self.actions.skill);
  near(prep.toughness,st(8006,800602,0)*(1+self.kit.trace[2][0]));
  assert.equal(self.actions.skill.bounceCount,4+self.kit.ranks[6][0]);
  near(self.actions.skill.bounceTerms[0].multiplier,p.BPSkill[0]);
  assert.equal(self.actions.skill.energyGain,ROSTER_DATA[8006].skills['800602'].spBase);
  // E1：首次战技回点
  assert.ok(self.resources['E1已触发']===undefined);
  const sp0=b.sp;b.rules.after(b,self,'skill','normal',self.actions.skill,[b.units.at(-1)],[]);
  assert.equal(b.sp,Math.min(b.maxSP,sp0+self.kit.ranks[1][0]));
  b.rules.after(b,self,'skill','normal',self.actions.skill,[b.units.at(-1)],[]);
  assert.equal(b.sp,Math.min(b.maxSP,sp0+self.kit.ranks[1][0]),'E1 重复触发');
  // E2 回能效率
  const e2=self.buffs.find(e=>e.id===self.id+':hmc-e2');
  assert.ok(e2,'E2 回能效率未挂载');
  near(e2.value,self.kit.ranks[2][0]);assert.equal(e2.remaining,self.kit.ranks[2][1]);
  // E4 队友击破特攻按开拓者击破特攻动态换算
  const e4=mate.buffs.find(e=>e.id==='hmc-e4');
  assert.ok(e4,'E4 未给队友挂击破特攻');assert.equal(e4.convert.ratio,self.kit.ranks[4][0]);
  self.panel.breakEffect=1.0;
  near(combatPanel(mate).breakEffect,1.0*self.kit.ranks[4][0],1e-6);
});

test('开拓者•同谐：天赋破韧回能与剧院之帽延后；秘技全队击破特攻',()=>{
  const u=actor(8006),mate=plain();
  const b=createBattle(battle([u,mate],toughEnemy()));
  const [self,m,en]=b.units;
  self.energy=0;
  b.log.push({type:'break',target:en.id});
  b.rules.afterDamage(b,m,en,'break');
  near(self.energy,self.kit.params.Talent[0],1e-6);
  assert.ok(b.log.some(e=>e.type==='delay'&&e.actor===en.id),'剧院之帽未延后敌方行动');
  // 秘技
  const t=actor(8006,{technique:true}),bt=createBattle(battle([t,plain()]));
  const [s1,m1]=bt.units;
  for(const to of [s1,m1]){
    const e=to.buffs.find(x=>x.id===t.id+':hmc-maze');
    assert.ok(e,'秘技未覆盖全队');near(e.value,ROSTER_DATA[8006].skills['800607'].params['1'].param_list[0]);
    assert.equal(e.remaining,ROSTER_DATA[8006].skills['800607'].params['1'].param_list[1]);
  }
});

test('batch08 4 名角色与既有四人体系混编可完成严格战斗，无未支持缺口',()=>{
  for(const id of IDS)for(const eidolon of [0,3,6]){
    const a=actor(id,{eidolon}),ar=actor(1015),s=actor(1306),ce=actor(1412);
    a.id='focus';a.energy=a.energyMax;a.policy={...a.policy,autoUltimate:true,allyTargetId:ar.id};
    s.policy.allyTargetId=ar.id;ce.policy.allyTargetId=ar.id;
    const c={strict:true,maxAV:260,sp:3,maxSP:9,seed:3,critMode:'expected',requiredAllies:4,units:[a,s,ar,ce,enemy()]};
    assert.deepEqual(validateBattle(c),[]);
    const r=simulateBattle(c);
    assert.ok(r.damage>0,id+' 混编战斗没有伤害');
    assert.deepEqual(r.unsupported,[],id+' E'+eidolon+' 出现未支持缺口');
  }
});

console.log(`DeepSeek batch08 checks: ${passed} passed, ${failed} failed.`);if(failed)process.exitCode=1;
