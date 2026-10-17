// DeepSeek 第 12 批：1212 镜流 / 1213 丹恒•饮月 / 1312 米沙 / 1109 虎克 / 1008 阿兰 / 1014 Saber
// 的机制测试。期望值全部由 4.6 编译出的 kit 参数（params / trace / ranks）推导，不写死倍率；
// 段数 / 时序取自 `_data_cache/strict_research/Avatar_<Name>_00_Ability.json` 的真段数与节点结构。
// 时序用 b.rules.prepare / before / after / hit / afterHit / turnStart / turnEnd / death 直接驱动，
// 数值用伤害事件的 base 乘区（= 攻击力 × 倍率 × 分段比例）核对。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createContext} from '../core/ctx.mjs';
import {newBattleBuild,buildBattleActor} from '../simulator/builds.mjs';
import {createBattle,stepBattle,simulateBattle,validateBattle,combatPanel} from '../simulator/engine.mjs';
import {validateKitActor} from '../simulator/kits.mjs';
import {IDS} from '../simulator/characters/extra/batch12.mjs';
const data=JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url))),ctx=createContext(data);
const near=(a,b,m=1e-6,msg)=>{if(typeof m!=='number'){msg=m;m=1e-6;}assert.ok(Math.abs(a-b)<m,`${a} != ${b}${msg?' ('+msg+')':''}`);};
const panel=()=>({hp:10000,atk:1000,def:1000,speed:100,critRate:.5,critDmg:1,energyRegen:1,effectHit:0,effectRes:0,breakEffect:0,baseStats:{hp:1000,atk:1000,def:1000},elemDmg:{}});
const actor=(id,extra={})=>{const a=buildBattleActor(ctx,{...newBattleBuild(),characterId:id,relicAuto:false,panel:panel(),...extra});a.energy=0;a.policy={...a.policy,autoUltimate:false};return a;};
const enemy=(extra={})=>({id:'enemy',name:'规则训练敌人',side:'enemy',level:90,element:'Physical',panel:{...panel(),hp:1e9,speed:1},energy:0,energyMax:0,res:{},
  actions:{basic:{name:'测试攻击',type:'Normal',terms:[{scaling:'atk',multiplier:1}],hitEnergy:10}},policy:{autoUltimate:false,basicOnly:true},...extra});
// 我方木桩：用于「镜流消耗队友生命」「米沙天赋吃战技点」「Saber 魔力放出回战技点」等需要第二名的场景。
const mate=(extra={})=>({id:'mate',name:'测试队员',side:'ally',level:80,element:'Physical',panel:{...panel(),speed:1},energy:0,energyMax:100,
  actions:{basic:{name:'测试普攻',type:'Normal',terms:[{scaling:'atk',multiplier:1}],spGain:1,energyGain:20,toughness:30},
    skill:{name:'测试战技',type:'BPSkill',terms:[{scaling:'atk',multiplier:1}],spCost:1,energyGain:30,toughness:60}},policy:{autoUltimate:false,basicOnly:true},...extra});
const config=(units,en=null,maxAV=300)=>({strict:true,maxAV,sp:3,maxSP:9,seed:42,critMode:'noncrit',units:[...units,en??enemy()]});
const baseOf=ev=>ev.formula.find(f=>f.zone==='base').value;
const dmgOf=(b,id,kind)=>b.log.filter(e=>e.type==='damage'&&e.actor===id&&(kind?e.kind===kind:true));
// 只取「队列中第一个动作」结算期间的事件（stepBattle 之后引擎还会继续走正常回合）。
const actionWindow=(b,from)=>{
  const end=b.log.findIndex((e,i)=>i>=from&&e.type==='action_end');
  return b.log.slice(from,end<0?undefined:end);
};
const actionHits=(b,id,from)=>
  actionWindow(b,from).filter(e=>e.type==='damage'&&e.actor===id&&e.kind==='direct');
const NM=(id,sid)=>ctx.data.skills.find(s=>s.id===sid)?.name??sid;
const SKILL_JL=NM(1212,121202),ENH_JL=NM(1212,121209),ULT_JL=NM(1212,121203);
const N1=NM(1213,121308),N2=NM(1213,121310),N3=NM(1213,121312),ULT_DH=NM(1213,121303),SKILL_DH=NM(1213,121302);
const ULT_MI=NM(1312,131203),SKILL_MI=NM(1312,131202);
const ULT_HK=NM(1109,110903),ENH_HK=NM(1109,110909),SKILL_HK=NM(1109,110902);
const ULT_AR=NM(1008,100803),SKILL_AR=NM(1008,100802);
const ULT_SB=NM(1014,101403),ENH_SB=NM(1014,101408);
let passed=0,failed=0;const test=(name,fn)=>{try{fn();passed++;console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+'\n'+e.stack);}};

test('batch12 6 名角色 E0～E6 动作合同可编译且不能篡改倍率',()=>{
  assert.deepEqual([...IDS].sort((a,b)=>a-b),[1008,1014,1109,1212,1213,1312]);
  for(const id of IDS)for(let eidolon=0;eidolon<=6;eidolon++){
    const a=actor(id,{eidolon});assert.deepEqual(validateKitActor(a),[],id+' E'+eidolon);
    assert.deepEqual(a.unsupported,[]);
    a.actions.basic.terms[0].multiplier=99;
    assert.ok(validateKitActor(a).length,id+' 篡改普攻倍率未被发现');
  }
});

test('batch12 段数 / 削韧与原始脚本一致',()=>{
  const jl=actor(1212),dh=actor(1213),mi=actor(1312),hk=actor(1109),ar=actor(1008),sb=actor(1014);
  // 镜流：Skill01_Phase02 2 段 HitSplitRatio 0.3/0.7；Skill02 1 段；Skill03 主 1 + 相邻；121209 主 1 + 相邻。
  assert.deepEqual(jl.actions.basic.hitShares,[.3,.7]);
  assert.deepEqual(jl.actions.skill.hitShares,[1]);
  assert.equal(jl.actions.ultimate.target,'blast');
  assert.deepEqual(jl.actions.ultimate.hitShares,[1]);
  assert.equal(jl.actions.enhancedSkill.name,ENH_JL);
  assert.equal(jl.actions.enhancedSkill.spCost,0);
  assert.equal(jl.actions.enhancedSkill.toughness,60);assert.equal(jl.actions.enhancedSkill.adjacentToughness,30);
  // 丹恒•饮月：Skill11 3 段 / Skill12 主 5 段（第 4 段起相邻）/ Skill13 主 7 段 / Skill03 主 3 段。
  assert.deepEqual(dh.actions.basic.hitShares,[.3,.7]);
  assert.deepEqual(dh.actions.enhancedNormal1.hitShares,[.33,.33,.34]);
  assert.deepEqual(dh.actions.enhancedNormal2.hitShares,[.2,.2,.2,.2,.2]);
  assert.deepEqual(dh.actions.enhancedNormal3.hitShares,[.14,.14,.14,.14,.15,.14,.15]);
  assert.equal(dh.actions.enhancedNormal2.adjacentFrom,4);
  assert.equal(dh.actions.enhancedNormal3.adjacentFrom,4);
  assert.equal(dh.actions.enhancedNormal2.spCost,2);assert.equal(dh.actions.enhancedNormal3.spCost,3);
  assert.equal(dh.actions.skill.spCost,0);assert.deepEqual(dh.actions.skill.terms,[]);
  assert.deepEqual(dh.actions.ultimate.hitShares,[.3,.3,.4]);
  assert.equal(dh.actions.enhancedNormal2.toughness,90);assert.equal(dh.actions.enhancedNormal2.adjacentToughness,30);
  assert.equal(dh.actions.enhancedNormal3.toughness,120);assert.equal(dh.actions.enhancedNormal3.adjacentToughness,60);
  // 米沙：普攻 1 段；战技主 1 + 相邻；终结默认 3 段（首段 + 2 次弹射），削韧总量 30 均摊。
  assert.deepEqual(mi.actions.basic.hitShares,[1]);
  assert.equal(mi.actions.skill.target,'blast');
  assert.equal(mi.actions.ultimate.bounceCount,2);
  near(mi.actions.ultimate.toughness,30/3);
  // 虎克：Skill03_Phase02 2 段 HitSplitRatio 0.3/0.7；Skill21 主 1 + 相邻。
  assert.deepEqual(hk.actions.ultimate.hitShares,[.3,.7]);
  assert.equal(hk.actions.enhancedSkill.name,ENH_HK);
  assert.equal(hk.actions.enhancedSkill.target,'blast');
  assert.equal(hk.actions.enhancedSkill.adjacentToughness,30);
  // 阿兰：Skill01 2 段 spHit[0.3,0.7]；Skill03 主 3 段 spHit[0.3,0.1,0.6]（每段相邻）。
  assert.deepEqual(ar.actions.basic.hitShares,[.3,.7]);
  assert.deepEqual(ar.actions.ultimate.hitShares,[.3,.1,.6]);
  assert.equal(ar.actions.skill.spCost,0);
  // Saber：Skill02 主 4 段 spHit[0.1,0.1,0.1,0.7] + 每段相邻；Skill03 全体 + 10 次随机单体；Skill11 全体。
  assert.deepEqual(sb.actions.skill.hitShares,[.1,.1,.1,.7]);
  assert.equal(sb.actions.ultimate.target,'all');
  assert.equal(sb.actions.ultimate.bounceCount,10);
  near(sb.actions.ultimate.bounceTerms[0].multiplier,sb.kit.params.Ultra[1]);
  assert.equal(sb.actions.ultimate.toughness,120);
  assert.equal(sb.actions.enhancedBasic.name,ENH_SB);
  assert.equal(sb.actions.enhancedBasic.target,'all');
  assert.deepEqual(sb.actions.enhancedBasic.hitShares,[.5,.5]);
  assert.equal(sb.actions.enhancedBasic.toughness,60);
  for(const a of [jl,dh,mi,hk,ar,sb])for(const key of Object.keys(a.actions))
    near(a.actions[key].hitShares.reduce((x,y)=>x+y,0),1,1e-9,a.characterId+' '+key);
});

// ───────────────────────────── 1212 镜流 ─────────────────────────────
test('镜流：朔望 2 层进入【转魄】并把战技替换为【寒川映月】，消耗朔望归零后退出',()=>{
  const b=createBattle(config([actor(1212),mate()]));b.random=()=>0;
  const [u,,en]=b.units;
  assert.equal(u.resources['朔望'],0);
  b.rules.after(b,u,'skill','normal',u.actions.skill,[en],[en]);
  assert.equal(u.resources['朔望'],u.kit.params.BPSkill[1]);
  assert.equal(b.rules.prepare(b,u,'skill','normal',u.actions.skill).name,SKILL_JL,'未满 2 层时不应强化');
  b.rules.after(b,u,'skill','normal',u.actions.skill,[en],[en]);
  assert.equal(u.resources['朔望'],u.kit.params.Talent[4]);
  assert.ok(u.buffs.some(e=>e.tag==='jingliuMoonRage'),'2 层朔望未进入转魄');
  near(u.panel.baseStats.atk,1000);
  const prep=b.rules.prepare(b,u,'skill','normal',u.actions.skill);
  assert.equal(prep.name,ENH_JL);
  assert.equal(prep.spCost,0,'寒川映月不消耗战技点');
  near(prep.energyGain,30);
  // 终结技同样 +1 层朔望（Ultra[1]）。
  b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[en],[en]);
  assert.equal(u.resources['朔望'],u.kit.params.Talent[4]+u.kit.params.Ultra[1]);
  // 连续两次寒川映月 → 朔望归零退出转魄。
  for(let i=0;i<3;i++){
    const p=b.rules.prepare(b,u,'skill','normal',u.actions.skill);
    if(p.name!==ENH_JL)break;
    b.rules.after(b,u,'skill','normal',p,[en],[en]);
  }
  assert.equal(u.resources['朔望'],0);
  assert.ok(!u.buffs.some(e=>e.tag==='jingliuMoonRage'),'朔望归零后应退出转魄');
  assert.equal(b.rules.prepare(b,u,'skill','normal',u.actions.skill).name,SKILL_JL);
});

test('镜流：转魄中施放攻击消耗队友 4% 生命上限，并按消耗总量 540% 换攻击力（上限基础攻击 180%；E4 提高）',()=>{
  const b=createBattle(config([actor(1212),mate()]));b.random=()=>0;
  const [u,m,en]=b.units;
  for(let i=0;i<2;i++)b.rules.after(b,u,'skill','normal',u.actions.skill,[en],[en]);
  assert.ok(u.buffs.some(e=>e.tag==='jingliuMoonRage'));
  const prep=b.rules.prepare(b,u,'skill','normal',u.actions.skill),T=u.kit.params.Talent;
  b.rules.before(b,u,'skill','normal',prep,[en]);
  near(m.hp,10000-10000*T[1],1e-6,'队友应损失 4% 生命上限');
  const consumed=10000*T[1];
  near(u.resources['转魄消耗'],consumed);
  near(u.resources['转魄攻击加成'],Math.min(1000*T[3],consumed*T[2]));
  near(combatPanel(u).atk,1000+u.resources['转魄攻击加成']);
  b.rules.after(b,u,'skill','normal',prep,[en],[en]);
  near(u.resources['转魄攻击加成'],0,'攻击加成应在本次攻击结束后清零');
  near(combatPanel(u).atk,1000);
  // E4：转换率 +90%，上限 +30%。
  const b2=createBattle(config([actor(1212,{eidolon:4}),mate()]));b2.random=()=>0;
  const [u2,m2,en2]=b2.units;
  for(let i=0;i<2;i++)b2.rules.after(b2,u2,'skill','normal',u2.actions.skill,[en2],[en2]);
  const prep2=b2.rules.prepare(b2,u2,'skill','normal',u2.actions.skill),T2=u2.kit.params.Talent;
  b2.rules.before(b2,u2,'skill','normal',prep2,[en2]);
  near(m2.hp,10000-10000*T2[1]);
  const consumed2=10000*T2[1];
  near(u2.resources['转魄攻击加成'],Math.min(1000*T2[3]*(1+u2.kit.ranks[4][1]),consumed2*(T2[2]+u2.kit.ranks[4][0])));
  const b3=createBattle(config([actor(1212),mate()]));b3.random=()=>0;
  const [u3,m3,en3]=b3.units;
  for(let i=0;i<2;i++)b3.rules.after(b3,u3,'skill','normal',u3.actions.skill,[en3],[en3]);
  // 通过队列让引擎真正结算一次强化战技，核对伤害基础乘区 = (基础攻击 + 转魄加成) × 寒川映月 #1。
  b3.queue.push({actor:u3.id,key:'skill',kind:'normal',targetId:en3.id});
  const n0=b3.log.length;
  stepBattle(b3);
  const hits=actionHits(b3,u3.id,n0);
  assert.equal(hits.length,1,'寒川映月应结算 1 段主目标伤害');
  const T3=u3.kit.params.Talent,enh=ctx.data.skills.find(s=>s.id===121209).params['10'].param_list;
  const expectAtk=1000+Math.min(1000*T3[3],10000*T3[1]*T3[2]);
  near(baseOf(hits[0]),expectAtk*enh[0],1e-6,'转魄攻击加成应进入真实伤害乘区');
  const hpEvent=actionWindow(b3,n0).find(e=>e.type==='hp_consume'&&e.target===m3.id);
  assert.ok(hpEvent,'真实结算时应消耗队友生命');
  near(hpEvent.amount,10000*T3[1],1e-6,'真实结算时同样消耗队友 4% 生命上限');
});

test('镜流：转魄暴击率 +50%、行迹死境效果抵抗 +35%、E6 暴伤 +50% 且朔望上限 +1',()=>{
  const b=createBattle(config([actor(1212),mate()]));b.random=()=>0;
  const [u,,en]=b.units;
  near(combatPanel(u).critRate,.5);
  for(let i=0;i<2;i++)b.rules.after(b,u,'skill','normal',u.actions.skill,[en],[en]);
  near(combatPanel(u).critRate,.5+u.kit.params.Talent[6]);
  near(combatPanel(u).effectRes,u.kit.trace[1][0]);
  const b2=createBattle(config([actor(1212,{eidolon:6}),mate()]));b2.random=()=>0;
  const [u2,,en2]=b2.units;
  for(let i=0;i<2;i++)b2.rules.after(b2,u2,'skill','normal',u2.actions.skill,[en2],[en2]);
  near(u2.resources['朔望'],u2.kit.params.Talent[4]+u2.kit.ranks[6][0],'E6 进入转魄应额外获得朔望');
  near(combatPanel(u2).critDmg,1+u2.kit.ranks[6][1]);
  near(combatPanel(u2).critRate,.5+u2.kit.params.Talent[6]);
});

test('镜流：E1 终结 / 强化战技暴伤 +24% 且单体目标追加 100% 攻击力；E2 终结后下次强化战技 +80%',()=>{
  const b=createBattle(config([actor(1212,{eidolon:2})],enemy({id:'only'})));b.random=()=>0;
  const [u,en]=b.units;
  for(let i=0;i<2;i++)b.rules.after(b,u,'skill','normal',u.actions.skill,[en],[en]);
  u.energy=u.energyMax;
  const n0=dmgOf(b,u.id,'additional').length;
  b.rules.before(b,u,'ultimate','ultimate',u.actions.ultimate,[en]);
  near(combatPanel(u).critDmg,1+u.kit.ranks[1][0]);
  b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[en],[en]);
  assert.equal(dmgOf(b,u.id,'additional').length-n0,1,'E1 单体目标应追加 1 次伤害');
  near(baseOf(dmgOf(b,u.id,'additional').at(-1)),combatPanel(u).atk*u.kit.ranks[1][1]);
  assert.equal(u.resources['E2待触发'],1);
  // E2：下一次强化战技伤害 +80%（dmgBoost 临时增益）。
  const prep=b.rules.prepare(b,u,'skill','normal',u.actions.skill);
  assert.equal(prep.name,ENH_JL);
  b.rules.before(b,u,'skill','normal',prep,[en]);
  near(u.buffs.find(e=>e.key==='dmgBoost'&&e.id===u.id+':jl-e2')?.value,u.kit.ranks[2][0]);
  b.rules.after(b,u,'skill','normal',prep,[en],[en]);
  assert.ok(!u.buffs.some(e=>e.id===u.id+':jl-e2'),'E2 增益应在强化战技结束后移除');
});

test('镜流：秘技恢复 15 能量 / 1 层朔望并按 100% 基础概率冻结，冻结目标回合开始受 80% 攻击力附加伤害',()=>{
  const b=createBattle(config([actor(1212,{technique:true})]));b.random=()=>0;
  const [u,en]=b.units,p=u.kit.params;
  assert.equal(u.resources['朔望'],p.Maze[0]);
  assert.ok(u.energy>=p.Maze[5]);
  const f=en.buffs.find(e=>e.tag==='jingliuFreeze');
  assert.ok(f,'秘技未冻结敌人');assert.equal(f.control,'freeze');
  b.rules.onTurnStart(b,en);
  const add=dmgOf(b,u.id,'additional');
  assert.equal(add.length,1);
  near(baseOf(add[0]),combatPanel(u).atk*p.Maze[4]);
});

test('镜流4.6强化形态：可从正式编译入口选择，普攻/战技/终结/强化战技和E1附伤都按生命上限结算',()=>{
  const j=actor(1212,{variant:'enhanced'}),b=createBattle(config([j,mate()]));
  const [u,,en]=b.units;
  assert.equal(u.kit.enhanced,true);assert.equal(validateKitActor(u).length,0);
  for(const key of ['basic','skill','ultimate','enhancedSkill'])assert.ok(u.actions[key].terms.every(t=>t.scaling==='hp'),key+' 未转为生命倍率');
  const low=actor(1212,{variant:'enhanced',levels:{Normal:6,BPSkill:6,Ultra:6,Talent:10,Maze:1}});
  near(low.actions.basic.terms[0].multiplier,low.kit.params.Normal[0]);
  near(low.actions.skill.terms[0].multiplier,low.kit.params.BPSkill[0]);
  near(low.actions.ultimate.terms[0].multiplier,low.kit.params.Ultra[0]);
  for(let i=0;i<2;i++)b.rules.after(b,u,'skill','normal',u.actions.skill,[en],[en]);
  assert.ok(u.buffs.some(e=>e.tag==='jingliuMoonRage'));
  const start=b.log.length;b.queue.push({actor:u.id,key:'skill',kind:'normal',targetId:en.id});stepBattle(b);
  const hit=actionHits(b,u.id,start)[0];assert.ok(hit);near(baseOf(hit),combatPanel(u).hp*u.actions.enhancedSkill.terms[0].multiplier);
  const consume=actionWindow(b,start).find(e=>e.type==='hp_consume'&&e.target==='mate');
  assert.ok(consume);near(consume.amount,combatPanel(b.units.find(x=>x.id==='mate')).hp*u.kit.params.Talent[1]);
  near(u.resources['转魄攻击加成'],0,'强化形态不应把生命消耗换成攻击力');
  const e1=actor(1212,{variant:'enhanced',eidolon:1}),b1=createBattle(config([e1,mate()],enemy({id:'only'})));
  const [v,,only]=b1.units;for(let i=0;i<2;i++)b1.rules.after(b1,v,'skill','normal',v.actions.skill,[only],[only]);
  v.energy=v.energyMax;b1.rules.before(b1,v,'ultimate','ultimate',v.actions.ultimate,[only]);
  const n=b1.log.length;b1.rules.after(b1,v,'ultimate','ultimate',v.actions.ultimate,[only],[only]);
  const extra=dmgOf(b1,v.id,'additional').at(-1);
  assert.ok(extra);near(baseOf(extra),combatPanel(v).hp*v.kit.ranks[1][1]);
  const e2=createBattle(config([actor(1212,{variant:'enhanced',eidolon:2}),mate()])),[w,,target]=e2.units;
  for(let i=0;i<2;i++)e2.rules.after(e2,w,'skill','normal',w.actions.skill,[target],[target]);
  w.resources['E2待触发']=1;const enhanced=e2.rules.prepare(e2,w,'skill','normal',w.actions.skill);
  e2.rules.before(e2,w,'skill','normal',enhanced,[target]);
  near(w.buffs.find(x=>x.id===w.id+':jl-e2')?.value,w.kit.ranks[2][0]);
  e2.rules.after(e2,w,'skill','normal',enhanced,[target],[target]);
  assert.ok(!w.buffs.some(x=>x.id===w.id+':jl-e2'),'强化形态 E2 增伤应在该次强化战技后移除');
});

test('镜流4.6强化形态：队友实际掉血叠月色暴伤，E4逐层加成，转魄退出清除；20次单目标攻击后获得朔望',()=>{
  const b=createBattle(config([actor(1212,{variant:'enhanced',eidolon:4}),mate()]));b.random=()=>0;
  const [u,m,en]=b.units;for(let i=0;i<2;i++)b.rules.after(b,u,'skill','normal',u.actions.skill,[en],[en]);
  const before=m.hp;const prep=b.rules.prepare(b,u,'skill','normal',u.actions.skill);b.rules.before(b,u,'skill','normal',prep,[en]);
  near(m.hp,before-combatPanel(m).hp*u.kit.params.Talent[1]);
  assert.equal(u.resources['月色'],1,'消耗队友生命应获得月色');
  near(combatPanel(u).critDmg,1+u.kit.params.Talent[2]+u.kit.ranks[4][0]+u.kit.ranks[1][0]);
  // 同一次攻击中，同一目标承受多段伤害只计一次朔望进度；另一个行动另计一次。
  for(let seq=1;seq<=18;seq++){
    b.activeAction={sequence:1000+seq,actor:'mate',key:'skill'};
    b.rules.hpChanged(b,m,'damage',1,en);b.rules.hpChanged(b,m,'damage',1,en);
  }
  assert.equal(u.resources['月色累计受击'],19);
  b.activeAction={sequence:2000,actor:'mate',key:'skill'};b.rules.hpChanged(b,m,'consume',1,en);
  assert.equal(u.resources['月色累计受击'],0);assert.equal(u.resources['朔望'],4,'累计20次目标受击应获得1朔望');
  const rage=moon=>u.buffs.some(e=>e.tag==='jingliuMoonRage');
  b.rules.after(b,u,'skill','normal',prep,[en],[en]);
  for(let i=0;i<4;i++){
    if(!rage())break;
    const a=b.rules.prepare(b,u,'skill','normal',u.actions.skill);b.rules.after(b,u,'skill','normal',a,[en],[en]);
  }
  assert.equal(u.resources['月色'],0,'转魄结束时必须清空月色');
});

test('镜流4.6强化形态：E6提供冰抗穿且朔望上限提升，基础形态不受强化倍率污染',()=>{
  const b=createBattle(config([actor(1212,{variant:'enhanced',eidolon:6}),mate()])),base=createBattle(config([actor(1212),mate()]));
  const [u,,en]=b.units;for(let i=0;i<2;i++)b.rules.after(b,u,'skill','normal',u.actions.skill,[en],[en]);
  near(u.resources['朔望'],5);near(b.rules.modifiers(b,u,en,u.actions.enhancedSkill,'direct').resPen,u.kit.ranks[6][1]);
  assert.equal(u.buffs.some(x=>x.name==='镜流 E6 · 暴击伤害'),false,'强化E6不应错误转成暴伤');
  const normal=base.units[0];assert.equal(normal.kit.enhanced,false);assert.equal(normal.actions.skill.terms[0].scaling,'atk');
  assert.equal(normal.resources['月色'],0);assert.equal(base.rules.modifiers(base,normal,base.units.at(-1),normal.actions.skill,'direct').resPen??0,0);
});

// ───────────────────────── 1213 丹恒•饮月 ─────────────────────────
test('丹恒•饮月：prepare 依战技点 + 逆鳞选择瞬华 / 天矢阴 / 盘拏耀跃，逆鳞抵扣战技点消耗',()=>{
  const b=createBattle(config([actor(1213)]));b.random=()=>0;
  const [u,en]=b.units;
  const nameOf=a=>a.name;
  assert.equal(nameOf(b.rules.prepare(b,u,'basic','normal',u.actions.basic)),N3,'3 战技点应使用盘拏耀跃');
  assert.equal(b.rules.prepare(b,u,'basic','normal',u.actions.basic).spCost,3);
  b.sp=2;assert.equal(nameOf(b.rules.prepare(b,u,'basic','normal',u.actions.basic)),N2);
  b.sp=1;assert.equal(nameOf(b.rules.prepare(b,u,'basic','normal',u.actions.basic)),N1);
  b.sp=0;assert.equal(nameOf(b.rules.prepare(b,u,'basic','normal',u.actions.basic)),u.actions.basic.name,'无资源应回到泽芝');
  u.resources['逆鳞']=2;
  const prep=b.rules.prepare(b,u,'basic','normal',u.actions.basic);
  assert.equal(prep.name,N2);assert.equal(prep.spCost,0);assert.equal(prep.scaleUsed,2);
  b.rules.before(b,u,'basic','normal',prep,[en]);
  assert.equal(u.resources['逆鳞'],0,'逆鳞应抵扣战技点消耗');
  u.resources['逆鳞']=3;b.sp=1;
  const prep3=b.rules.prepare(b,u,'basic','normal',u.actions.basic);
  // 逆鳞优先抵扣：盘拏耀跃 3 点消耗由 3 个逆鳞全部承担，战技点不再被扣（此前只抵扣 SP 不足部分）。
  assert.equal(prep3.name,N3);assert.equal(prep3.spCost,0);assert.equal(prep3.scaleUsed,3);
});

test('丹恒•饮月：亢心按真段数叠层（上限 6；E1 上限 10 且每段 +2），叱咤自第 4 段起每段 +1 层',()=>{
  const run=(eidolon,segments,name)=>{
    const b=createBattle(config([actor(1213,{eidolon}),actor(1203)]));b.random=()=>0;
    const [u]=b.units;
    b.activeAction={sequence:7,actor:u.id,key:'basic'};
    const a=u.actions[name==='n2'?'enhancedNormal2':'enhancedNormal3'];
    // 引擎顺序：hit（伤害前，叱咤 +1）→ 结算伤害 → afterHit（伤害后，亢心 +1）。
    // 亢心在 afterHit，故这里两钩子都按真段数依次调用（不再把缺陷行为固化成断言）。
    for(const seg of segments){
      b.rules.hit(b,u,b.units.at(-1),{...a,segment:seg},'direct');
      b.rules.afterHit(b,u,b.units.at(-1),{...a,segment:seg},'direct');
    }
    const cz=u.buffs.find(e=>e.id===u.id+':dhil-cz');
    return {hx:u.buffs.find(e=>e.id===u.id+':dhil-hx')?.stacks??0,cz:cz?.stacks??0,rem:cz?.remaining??0};
  };
  assert.deepEqual(run(0,[1,2,3,4,5],'n2'),{hx:5,cz:2,rem:1},'天矢阴 5 段：第 4~5 段各 +1 层叱咤');
  assert.deepEqual(run(0,[1,2,3,4,5,6,7],'n3'),{hx:6,cz:4,rem:1},'盘拏耀跃 7 段：第 4~7 段各 +1 层叱咤（上限 4）');
  assert.deepEqual(run(1,[1,2,3,4,5,6,7],'n3'),{hx:10,cz:4,rem:1},'E1 每段 +2 层、上限 10');
  assert.deepEqual(run(4,[1,2,3,4,5,6,7],'n3'),{hx:10,cz:4,rem:2},'E4 使叱咤持续到下一个自身回合结束');
});

test('丹恒•饮月：天矢阴 / 盘拏耀跃 自第 4 段起对相邻目标按 #2 总倍率 / 相邻段数 追伤',()=>{
  const c=config([actor(1213)]);c.units=[c.units[0],enemy({id:'left'}),enemy({id:'main'}),enemy({id:'right'})];
  const b=createBattle(c);b.random=()=>0;
  const [u,left,main,right]=b.units,p=u.kit.params;
  b.activeAction={sequence:9,actor:u.id,key:'basic'};
  const a=u.actions.enhancedNormal3,total=a.adjacentTotal,segs=4;
  const n0=dmgOf(b,u.id).length;
  b.rules.hit(b,u,main,{...a,segment:3},'direct');
  assert.equal(dmgOf(b,u.id).length-n0,0,'第 3 段不应有相邻追伤');
  b.rules.hit(b,u,main,{...a,segment:4},'direct');
  const seg4=dmgOf(b,u.id).slice(n0);
  assert.equal(seg4.length,2,'第 4 段应对左右相邻各 1 次');
  for(const e of seg4)near(baseOf(e),combatPanel(u).atk*(total/segs));
  assert.deepEqual(seg4.map(e=>e.target).sort(),['left','right']);
  // 相邻段数 = 7 段中的第 4~7 段 = 4 段；总相邻倍率 = #2。
  near(total/segs*segs,total);
  void left;void right;void p;
});

test('丹恒•饮月：终结技获得 2 个逆鳞（上限 3），E2 额外 +1 并行动提前；行迹伏辰开场 15 能',()=>{
  const b=createBattle(config([actor(1213)]));b.random=()=>0;
  const [u,en]=b.units;
  assert.equal(u.energy,15,'行迹「伏辰」应开场回 15 能');
  assert.equal(u.resources['逆鳞'],0);
  b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[en],[en]);
  assert.equal(u.resources['逆鳞'],u.kit.params.Ultra[2]);
  b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[en],[en]);
  assert.equal(u.resources['逆鳞'],u.kit.params.Ultra[3],'逆鳞上限 3');
  const b2=createBattle(config([actor(1213,{eidolon:2})]));b2.random=()=>0;
  const [u2,en2]=b2.units;
  const before=u2.distance;
  b2.rules.after(b2,u2,'ultimate','ultimate',u2.actions.ultimate,[en2],[en2]);
  assert.equal(u2.resources['逆鳞'],3,'E2 应额外 +1 个逆鳞');
  assert.ok(u2.distance<=before,'E2 应行动提前');
  near(u2.distance,0);
});

test('丹恒•饮月：行迹起蛰（虚数弱点暴伤 +24%）与 E6 盘拏耀跃抗穿叠层、用后清空',()=>{
  const b=createBattle(config([actor(1213,{eidolon:6}),actor(1203)]));b.random=()=>0;
  const [u,mateU,en]=b.units;
  en.weaknesses=['Imaginary'];
  near(b.rules.modifiers(b,u,en,{type:'Normal',element:'Imaginary'},'direct').critDmg,u.kit.trace[3][0]);
  en.weaknesses=[];
  near(b.rules.modifiers(b,u,en,{type:'Normal',element:'Imaginary'},'direct').critDmg,0);
  for(let i=0;i<4;i++)b.rules.after(b,mateU,'ultimate','ultimate',{name:'x',type:'Ultra'},[en],[en]);
  assert.equal(u.resources['E6层数'],u.kit.ranks[6][1],'E6 层数上限 3');
  const a=u.actions.enhancedNormal3;
  near(b.rules.modifiers(b,u,en,a,'direct').resPen,u.kit.ranks[6][0]*u.kit.ranks[6][1]);
  near(b.rules.modifiers(b,u,en,u.actions.enhancedNormal2,'direct').resPen,0,'仅盘拏耀跃享受 E6');
  b.rules.after(b,u,'basic','normal',a,[en],[en]);
  assert.equal(u.resources['E6层数'],0,'盘拏耀跃用后应清空 E6 层数');
});

// ───────────────────────────── 1312 米沙 ─────────────────────────────
test('米沙：战技与天赋按战技点增加下次终结技段数，上限 10，终结后恢复初始段数',()=>{
  const b=createBattle(config([actor(1312),mate()]));b.random=()=>0;
  const [u,m,en]=b.units,p=u.kit.params;
  assert.equal(u.resources['终结技段数'],p.Ultra[0]);
  b.rules.after(b,u,'skill','normal',u.actions.skill,[en],[en]);
  assert.equal(u.resources['终结技段数'],p.Ultra[0]+p.BPSkill[2],'战技 +1 段');
  // 天赋：我方每消耗 1 战技点 +Talent[1]=1 段并回 Talent[0]=2 能（战技本身消耗的战技点也算）。
  u.energy=0;
  b.rules.before(b,u,'skill','normal',u.actions.skill,[en]);
  assert.equal(u.resources['终结技段数'],p.Ultra[0]+p.BPSkill[2]+p.Talent[1]);
  near(u.energy,p.Talent[0],'天赋应回复 2 点能量');
  // 队友消耗战技点同样加成。
  b.rules.before(b,m,'skill','normal',m.actions.skill,[en]);
  assert.equal(u.resources['终结技段数'],p.Ultra[0]+p.BPSkill[2]+2*p.Talent[1]);
  // 上限 10。
  for(let i=0;i<20;i++)b.rules.before(b,m,'skill','normal',m.actions.skill,[en]);
  assert.equal(u.resources['终结技段数'],p.Ultra[4],'段数上限 10');
  // 终结：prepare 输出动态段数与每段倍率。
  const prep=b.rules.prepare(b,u,'ultimate','ultimate',u.actions.ultimate);
  assert.equal(prep.bounceCount,p.Ultra[4]-1);
  near(prep.terms[0].multiplier,p.Ultra[1]);
  b.rules.after(b,u,'ultimate','ultimate',prep,[en],[en]);
  assert.equal(u.resources['终结技段数'],p.Ultra[0],'终结后恢复初始段数');
});

test('米沙：E1 按场上敌人数量加段（上限 +5）、E4 每段倍率 +6%、行迹锁接终结期间效果命中 +60%',()=>{
  const c=config([actor(1312,{eidolon:4})]);
  c.units=[c.units[0],enemy({id:'e1'}),enemy({id:'e2'}),enemy({id:'e3'})];
  const b=createBattle(c);b.random=()=>0;
  const [u,,,en]=b.units,p=u.kit.params;
  u.resources['终结技段数']=p.Ultra[4];
  const prep=b.rules.prepare(b,u,'ultimate','ultimate',u.actions.ultimate);
  assert.equal(prep.bounceCount,p.Ultra[4]-1,'段数已被上限截断');
  near(prep.terms[0].multiplier,p.Ultra[1]+u.kit.ranks[4][0],'E4 每段倍率 +6%');
  u.resources['终结技段数']=3;
  const prep2=b.rules.prepare(b,u,'ultimate','ultimate',u.actions.ultimate);
  assert.equal(prep2.bounceCount,3+u.kit.ranks[1][0]*3-1,'E1 按 3 个敌人 +3 段');
  assert.equal(b.rules.prepare(b,u,'ultimate','ultimate',u.actions.ultimate).bounceCount,5);
  b.rules.before(b,u,'ultimate','ultimate',u.actions.ultimate,[en]);
  near(combatPanel(u).effectHit,u.kit.trace[2][0],'锁接应 +60% 效果命中');
  b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[en],[en]);
  near(combatPanel(u).effectHit,0,'终结结束后锁接应移除');
  void en;
});

test('米沙：每段攻击前 20% 基础概率冻结（首段 +行迹释放 80%），冻结目标回合开始受 30% 攻击力附加伤害',()=>{
  const b=createBattle(config([actor(1312)]));b.random=()=>0.99;
  const [u,en]=b.units,p=u.kit.params;
  b.activeAction={sequence:3,actor:u.id,key:'ultimate'};
  const a=u.actions.ultimate;
  b.rules.hit(b,u,en,{...a,segment:2},'direct');
  assert.ok(!en.buffs.some(e=>e.tag==='mishaFreeze'),'第二段 20% 概率应被 0.99 抵抗');
  b.rules.hit(b,u,en,{...a,segment:1},'direct');
  const f=en.buffs.find(e=>e.tag==='mishaFreeze');
  assert.ok(f,'首段应 100%（20%+80%）基础概率冻结');
  assert.equal(f.control,'freeze');
  b.rules.onTurnStart(b,en);
  const add=dmgOf(b,u.id,'additional');
  assert.equal(add.length,1);
  near(baseOf(add[0]),combatPanel(u).atk*p.Ultra[3]);
  // 行迹传冲：对冻结目标暴伤 +30%。
  near(b.rules.modifiers(b,u,en,{type:'Ultra'},'direct').critDmg,u.kit.trace[3][0]);
});

test('米沙：E2 每段 24% 基础概率降防 16% 3 回合；E6 终结后增伤 30% 且下次战技回 1 战技点',()=>{
  const b=createBattle(config([actor(1312,{eidolon:6})]));b.random=()=>0;
  const [u,en]=b.units;
  b.activeAction={sequence:5,actor:u.id,key:'ultimate'};
  b.rules.hit(b,u,en,{...u.actions.ultimate,segment:1},'direct');
  const dd=en.buffs.find(e=>e.id===u.id+':misha-e2');
  assert.ok(dd,'E2 未降防');
  near(dd.value,u.kit.ranks[2][0]);assert.equal(dd.remaining,u.kit.ranks[2][1]);
  b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[en],[en]);
  near(u.buffs.find(e=>e.tag==='mishaE6')?.value,u.kit.ranks[6][1]);
  b.sp=3;
  b.rules.after(b,u,'skill','normal',u.actions.skill,[en],[en]);
  near(b.sp,3+1,'E6 下次战技后应回 1 战技点');
  assert.equal(u.resources['E6待触发'],0);
  b.rules.onTurnEnd(b,u);
  assert.ok(!u.buffs.some(e=>e.tag==='mishaE6'),'E6 增伤应在自身回合结束时移除');
});

// ───────────────────────────── 1109 虎克 ─────────────────────────────
test('虎克：战技按 100% 基础概率施加 65% 攻击力灼烧（E2 延长 1 回合），天赋对已灼烧目标追加 100% 附加伤害并回 5 能',()=>{
  const b=createBattle(config([actor(1109,{eidolon:2})]));b.random=()=>0;
  const [u,en]=b.units,p=u.kit.params;
  const n0=dmgOf(b,u.id).length;
  b.rules.after(b,u,'skill','normal',u.actions.skill,[en],[en]);
  const d=en.dots.find(x=>x.hookBurn);
  assert.ok(d,'战技未施加灼烧');
  near(d.terms[0].multiplier,p.BPSkill[3]);
  assert.equal(d.remaining,p.BPSkill[2]+u.kit.ranks[2][0],'E2 灼烧持续 +1 回合');
  assert.equal(dmgOf(b,u.id).length-n0,0,'首次施加灼烧时不应触发天赋追加');
  // 第二次攻击（目标已灼烧）→ 天赋追加 1 次 + 回 5 能 + 行迹童真治疗。
  u.energy=0;u.hp=5000;
  const n1=dmgOf(b,u.id).length;
  b.rules.after(b,u,'basic','normal',u.actions.basic,[en],[en]);
  const add=dmgOf(b,u.id,'additional').slice(-1);
  assert.equal(add.length,1);
  near(baseOf(add[0]),combatPanel(u).atk*p.Talent[0]);
  near(u.energy,p.Talent[1]);
  near(u.hp,5000+combatPanel(u).hp*u.kit.trace[1][0],'行迹童真应回复 5% 生命上限');
  assert.equal(dmgOf(b,u.id).length-n1,1,'天赋应追加 1 次附加伤害');
});

test('虎克：终结技后下一次战技替换为强化战技（主 + 相邻），并在用后恢复普通战技',()=>{
  const c=config([actor(1109)]);c.units=[c.units[0],enemy({id:'main'}),enemy({id:'adj'})];
  const b=createBattle(c);b.random=()=>0;
  const [u,main,adj]=b.units,p=u.kit.params;
  assert.equal(b.rules.prepare(b,u,'skill','normal',u.actions.skill).name,SKILL_HK);
  b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[main],[main]);
  const prep=b.rules.prepare(b,u,'skill','normal',u.actions.skill);
  assert.equal(prep.name,ENH_HK);
  assert.equal(prep.target,'blast');
  // 强化战技倍率来自独立记录 110909 的 #1 / #5。
  const enh=ctx.data.skills.find(s=>s.id===110909).params['10'].param_list;
  if(Math.abs(u.kit.params.BPSkill[0]-2.4)<1e-9){near(prep.terms[0].multiplier,enh[0]);near(prep.terms[1].multiplier,enh[4]);}
  b.rules.after(b,u,'skill','normal',prep,[main],[main,adj]);
  assert.equal(u.resources['强化战技'],0);
  assert.equal(b.rules.prepare(b,u,'skill','normal',u.actions.skill).name,SKILL_HK,'强化战技用后应恢复');
  // E1 强化战技伤害 +20%；E6 对灼烧目标 +20%。
  const b2=createBattle(config([actor(1109,{eidolon:6})]));b2.random=()=>0;
  const [u2,en2]=b2.units;
  b2.rules.after(b2,u2,'skill','normal',u2.actions.skill,[en2],[en2]);
  const mods=b2.rules.modifiers(b2,u2,en2,u2.actions.enhancedSkill,'direct');
  near(mods.dmgBoost,u2.kit.ranks[1][0]+u2.kit.ranks[6][0],'E1 +20% 与 E6 +20% 叠加');
  near(b2.rules.modifiers(b2,u2,en2,u2.actions.basic,'direct').dmgBoost,u2.kit.ranks[6][0],'普通攻击只吃 E6');
  const b3=createBattle(config([actor(1109,{eidolon:1})]));b3.random=()=>0;
  const [u3,en3]=b3.units;
  near(b3.rules.modifiers(b3,u3,en3,u3.actions.enhancedSkill,'direct').dmgBoost,u3.kit.ranks[1][0]);
  near(b3.rules.modifiers(b3,u3,en3,u3.actions.skill,'direct').dmgBoost,0);
  near(b3.rules.modifiers(b3,u3,en3,u3.actions.basic,'direct').dmgBoost,0,'未灼烧时 E6 不生效');
});

test('虎克：E4 天赋触发时相邻目标 100% 基础概率同享灼烧；行迹玩火使终结后行动提前 20% 并回 5 能',()=>{
  const c=config([actor(1109,{eidolon:4})]);
  c.units=[c.units[0],enemy({id:'main'}),enemy({id:'adj'})];
  const b=createBattle(c);b.random=()=>0;
  const [u,main,adj]=b.units,p=u.kit.params;
  b.rules.after(b,u,'skill','normal',u.actions.skill,[main],[main]);
  assert.ok(main.dots.some(d=>d.hookBurn));
  assert.ok(!adj.dots.some(d=>d.hookBurn),'未触发天赋时相邻不应有灼烧');
  b.rules.after(b,u,'basic','normal',u.actions.basic,[main],[main]);
  assert.ok(adj.dots.some(d=>d.hookBurn),'E4 应在天赋触发时给相邻挂灼烧');
  // 行迹玩火：终结后行动提前 20% + 5 能（目标已灼烧，故同时触发天赋回能）。
  u.distance=10000;u.energy=0;
  b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[main],[main]);
  near(u.distance,10000-10000*u.kit.trace[3][1]);
  near(u.energy,u.kit.trace[3][0]+u.kit.params.Talent[1]);
  // 秘技：随机单体 50% 攻击力伤害 + 全体 50% 攻击力灼烧 3 回合。
  const b2=createBattle(config([actor(1109,{technique:true})],enemy({id:'only'})));b2.random=()=>0;
  const [u2,en2]=b2.units;
  const tech=dmgOf(b2,u2.id,'technique');
  assert.equal(tech.length,1);
  near(baseOf(tech[0]),combatPanel(u2).atk*u2.kit.params.Maze[3]);
  const d2=en2.dots.find(x=>x.hookBurn);
  near(d2.terms[0].multiplier,u2.kit.params.Maze[1]);
  assert.equal(d2.remaining,u2.kit.params.Maze[2]);
  void p;
});

// ───────────────────────────── 1008 阿兰 ─────────────────────────────
test('阿兰：战技消耗 15% 生命上限（不足降至 1 点）且不消耗战技点；天赋按已损生命百分比增伤最多 72%',()=>{
  const b=createBattle(config([actor(1008)]));b.random=()=>0;
  const [u,en]=b.units,p=u.kit.params;
  near(u.hp,10000);
  near(combatPanel(u).atk,1000);
  b.rules.before(b,u,'skill','normal',u.actions.skill,[en]);
  near(u.hp,10000-10000*p.BPSkill[0]);
  const lost=(10000-u.hp)/10000;
  near(b.rules.modifiers(b,u,en,u.actions.skill,'direct').dmgBoost,p.Talent[0]*lost);
  assert.equal(u.actions.skill.spCost,0,'战技不消耗战技点');
  // 生命不足时降至 1 点。
  const b2=createBattle(config([actor(1008)]));b2.random=()=>0;
  const [u2,en2]=b2.units;
  u2.hp=100;
  b2.rules.before(b2,u2,'skill','normal',u2.actions.skill,[en2]);
  near(u2.hp,1);
  near(b2.rules.modifiers(b2,u2,en2,u2.actions.skill,'direct').dmgBoost,u2.kit.params.Talent[0]*(1-1/combatPanel(u2).hp));
});

test('阿兰：E1 低血战技 +10%、E6 低血终结 +20% 且相邻倍率提高到与主目标相同、E2 解除自身 1 个负面',()=>{
  const b=createBattle(config([actor(1008,{eidolon:6})]));b.random=()=>0;
  const [u,en]=b.units;
  u.hp=combatPanel(u).hp*.4;
  near(b.rules.modifiers(b,u,en,u.actions.skill,'direct').dmgBoost,u.kit.params.Talent[0]*.6+u.kit.ranks[1][0]);
  near(b.rules.modifiers(b,u,en,u.actions.ultimate,'direct').dmgBoost,u.kit.params.Talent[0]*.6+u.kit.ranks[6][0]);
  const prep=b.rules.prepare(b,u,'ultimate','ultimate',u.actions.ultimate);
  near(prep.terms[1].multiplier,u.kit.params.Ultra[0],'E6 低血时相邻倍率应等于主目标倍率');
  // E2：施放战技 / 终结技解除自身 1 个负面。
  u.buffs.push({id:'neg',name:'测试负面',key:'defShred',value:.1,remaining:2,tickOwner:u.id,tickAt:'end',debuff:true,source:'enemy'});
  b.rules.after(b,u,'skill','normal',u.actions.skill,[en],[en]);
  assert.ok(!u.buffs.some(e=>e.id==='neg'),'E2 未解除负面效果');
});

test('阿兰：行迹苏生击杀回血、E4 致命伤害免于无法战斗并回复 25% 生命上限',()=>{
  const b=createBattle(config([actor(1008,{eidolon:4})]));b.random=()=>0;
  const [u,en]=b.units;
  u.hp=combatPanel(u).hp*.2;
  b.rules.death(b,u,en);
  near(u.hp,combatPanel(u).hp*.2+combatPanel(u).hp*u.kit.trace[1][1],'行迹苏生应回复 20% 生命上限');
  // E4：致命伤害拦截。
  u.hp=1;
  const saved=b.rules.beforeLethal(b,en,u,99999);
  assert.equal(saved,true,'E4 应拦截致命伤害');
  near(u.hp,combatPanel(u).hp*u.kit.ranks[4][0]);
  assert.equal(b.rules.beforeLethal(b,en,u,99999),false,'E4 每次战斗只能触发 1 次');
});

test('阿兰：行迹抗御在开场低血时抵抗除持续伤害外的所有伤害，受到攻击后解除',()=>{
  const a=actor(1008);a.currentHp=4000;
  const b=createBattle(config([a]));b.random=()=>0;
  const [u]=b.units;
  assert.ok(u.buffs.some(e=>e.id===u.id+':arlan-guard'),'低血开场应获得抗御');
  // 持续伤害穿透：hit(kind='dot') 临时卸下减伤，afterHit 恢复。
  b.rules.hit(b,u,u,{name:'测试持续伤害',type:'DoT'},'dot');
  near(u.buffs.find(e=>e.id===u.id+':arlan-guard').value,0,'持续伤害应穿透抗御');
  b.rules.afterHit(b,u,u,{name:'测试持续伤害'},'dot');
  near(u.buffs.find(e=>e.id===u.id+':arlan-guard').value,1);
  // 真实战斗：敌人先手攻击后抗御解除（第一次攻击被完全抵消）。
  const e=enemy({panel:{...panel(),hp:1e9,speed:1000}});
  const a2=actor(1008);a2.currentHp=4000;a2.panel.speed=1;
  const b2=createBattle({strict:true,maxAV:200,sp:0,maxSP:5,seed:7,critMode:'noncrit',units:[a2,e]});
  const [u2,en2]=b2.units;
  assert.ok(u2.buffs.some(e=>e.id===u2.id+':arlan-guard'));
  stepBattle(b2);
  assert.equal(u2.hp,4000,'第一次受击应被抗御完全抵消');
  assert.ok(!u2.buffs.some(e=>e.id===u2.id+':arlan-guard'),'受到攻击后应解除抗御');
  stepBattle(b2);
  assert.ok(u2.hp<4000,'解除抗御后应正常受伤');
  void en2;
});

// ───────────────────────────── 1014 Saber ─────────────────────────────
test('Saber：炉心共鸣上限 99、开场 1 点、秘技 +2 点且攻击力 +35%；战技无消耗分支获得 3 点',()=>{
  const b=createBattle(config([actor(1014)]));b.random=()=>0;
  const [u,en]=b.units,p=u.kit.params;
  near(u.resources['炉心共鸣'],p.Talent[7],'天赋开场 +1 点炉心共鸣');
  assert.equal(p.Talent[6],99,'炉心共鸣上限取自 Talent #7（原始脚本 DV_SurgePointMax=99）');
  near(u.energy,u.energyMax*u.kit.trace[2][1],'行迹湖之祝福开场回至 60% 能量');
  const prep=b.rules.prepare(b,u,'skill','normal',u.actions.skill);
  assert.equal(prep.saberConsume,undefined,'能量不足时不应触发消耗分支');
  b.rules.after(b,u,'skill','normal',prep,[en],[en]);
  near(u.resources['炉心共鸣'],p.Talent[7]+p.BPSkill[2]);
  const b2=createBattle(config([actor(1014,{technique:true})]));b2.random=()=>0;
  const [u2]=b2.units;
  near(u2.resources['炉心共鸣'],u2.kit.params.Talent[7]+u2.kit.params.Maze[2]);
  near(combatPanel(u2).atk,1000*(1+u2.kit.params.Maze[0]),'秘技应 +35% 攻击力');
});

test('Saber：消耗炉心共鸣可将战技倍率每点 +14%（E2 再 +7%）并在攻击后回满能量、清空层数',()=>{
  const b=createBattle(config([actor(1014,{eidolon:2})]));b.random=()=>0;
  const [u,en]=b.units,p=u.kit.params;
  u.energy=u.energyMax-2*p.Talent[4];
  u.resources['炉心共鸣']=2;
  const prep=b.rules.prepare(b,u,'skill','normal',u.actions.skill);
  assert.equal(prep.saberConsume,2);
  const per=p.BPSkill[3]+u.kit.ranks[2][0];
  near(prep.terms[0].multiplier,p.BPSkill[0]+per*2);
  near(prep.terms[1].multiplier,p.BPSkill[1]+per*2);
  b.rules.before(b,u,'skill','normal',prep,[en]);
  near(u.energy,u.energyMax,'消耗 2 点应恰好回满能量');
  near(u.resources['炉心共鸣'],0,'消耗后应清空炉心共鸣');
  // 不能回满时不触发消耗分支，而是获得 3 点。
  const b2=createBattle(config([actor(1014)]));b2.random=()=>0;
  const [u2,en2]=b2.units;
  u2.energy=100;u2.resources['炉心共鸣']=3;
  const prep2=b2.rules.prepare(b2,u2,'skill','normal',u2.actions.skill);
  assert.equal(prep2.saberConsume,undefined);
  b2.rules.after(b2,u2,'skill','normal',prep2,[en2],[en2]);
  near(u2.resources['炉心共鸣'],3+p.BPSkill[2]);
  void en;
});

test('Saber：行迹龙之骑士开场与强化普攻获得【魔力放出】，触发时回 1 战技点并立即行动',()=>{
  const b=createBattle(config([actor(1014)]));b.random=()=>0;
  const [u,en]=b.units,p=u.kit.params;
  assert.ok(u.buffs.some(e=>e.tag==='saberMana'),'开场应获得魔力放出');
  near(combatPanel(u).critRate,.5+u.kit.trace[1][0],'龙之骑士暴击率 +20%');
  u.energy=u.energyMax-p.Talent[4];u.resources['炉心共鸣']=1;u.distance=10000;u.spentThisTurn=0;
  const prep=b.rules.prepare(b,u,'skill','normal',u.actions.skill);
  assert.equal(prep.saberConsume,1);
  b.rules.before(b,u,'skill','normal',prep,[en]);
  assert.ok(!u.buffs.some(e=>e.tag==='saberMana'),'魔力放出应被消耗');
  assert.ok(u.distance<10000,'应立即行动');
  near(u.energy,u.energyMax);
  void en;
});

test('Saber：终结技后普攻替换为【解放的金色王权】（全体 +2 点炉心共鸣，敌方 2/1 时额外全体伤害）',()=>{
  const b=createBattle(config([actor(1014)]));b.random=()=>0;
  const [u,en]=b.units,p=u.kit.params;
  assert.equal(b.rules.prepare(b,u,'basic','normal',u.actions.basic).name,u.actions.basic.name);
  b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[en],[en]);
  assert.equal(u.resources['saberNoble'],1);
  assert.equal(b.rules.shouldUseSkill(b,u),false,'宝具状态下仅能施放解放的金色王权');
  const prep=b.rules.prepare(b,u,'basic','normal',u.actions.basic);
  assert.equal(prep.name,ENH_SB);assert.equal(prep.target,'all');
  const row=ctx.data.skills.find(s=>s.id===101408).params[String(u.kit.skillLevels.Normal)].param_list;
  const before=u.resources['炉心共鸣'];
  const n0=dmgOf(b,u.id).length;
  b.rules.after(b,u,'basic','normal',prep,[en],[en]);
  near(u.resources['炉心共鸣'],before+row[1]);
  assert.equal(u.resources['saberNoble'],0,'宝具用后应复位');
  // 单个敌人 → 额外 #4 倍率的全体伤害。
  const extra=dmgOf(b,u.id).slice(n0);
  assert.equal(extra.length,1,'单体敌人应追加 1 次全体伤害');
  near(baseOf(extra[0]),combatPanel(u).atk*row[3]);
  // 两个敌人 → 额外 #3 倍率。
  const c=config([actor(1014)]);c.units=[c.units[0],enemy({id:'e1'}),enemy({id:'e2'})];
  const b2=createBattle(c);b2.random=()=>0;
  const [u2]=b2.units;
  b2.rules.after(b2,u2,'ultimate','ultimate',u2.actions.ultimate,b2.units.slice(1),b2.units.slice(1));
  const n1=dmgOf(b2,u2.id).length;
  const row2=ctx.data.skills.find(s=>s.id===101408).params[String(u2.kit.skillLevels.Normal)].param_list;
  b2.rules.after(b2,u2,'basic','normal',b2.rules.prepare(b2,u2,'basic','normal',u2.actions.basic),b2.units.slice(1),b2.units.slice(1));
  const ex2=dmgOf(b2,u2.id).slice(n1);
  assert.equal(ex2.length,2,'两个敌人应各追加 1 次全体伤害');
  for(const e of ex2)near(baseOf(e),combatPanel(u2).atk*row2[2]);
  void p;
});

test('Saber：E1/E2/E4/E6 终结增伤、无视防御、风抗穿与首次终结回 300 能',()=>{
  const b=createBattle(config([actor(1014,{eidolon:6})]));b.random=()=>0;
  const [u,en]=b.units;
  u.resources['累计炉心共鸣']=20;
  near(b.rules.modifiers(b,u,en,u.actions.ultimate,'direct').dmgBoost,u.kit.ranks[1][0]);
  near(b.rules.modifiers(b,u,en,u.actions.skill,'direct').defIgnore,u.kit.ranks[2][2]*u.kit.ranks[2][1]);
  assert.equal(u.kit.ranks[2][2],15,'E2 无视防御最多 15 层');
  near(b.rules.modifiers(b,u,en,u.actions.skill,'direct').resPen,u.kit.ranks[4][0]);
  near(b.rules.modifiers(b,u,en,u.actions.ultimate,'direct').resPen,u.kit.ranks[4][0]+u.kit.ranks[6][0]);
  u.energy=0;
  b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[en],[en]);
  near(u.energy,u.kit.ranks[6][2],'首次终结后应固定回复 300 能');
  near(u.buffs.find(e=>e.id===u.id+':saber-e4')?.stacks,1);
  u.energy=0;
  b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[en],[en]);
  near(u.energy,0,'第 2 次终结不应再回能（每 3 次触发 1 次）');
});

test('Saber：我方队友施放终结技时按 Talent #3=60% 增伤 2 回合并获得 3 点炉心共鸣',()=>{
  const b=createBattle(config([actor(1014),actor(1203)]));b.random=()=>0;
  const [u,mateU,en]=b.units,p=u.kit.params;
  u.resources['炉心共鸣']=0;
  b.rules.after(b,mateU,'ultimate','ultimate',{name:'x',type:'Ultra'},[en],[en]);
  const t=u.buffs.find(e=>e.id===u.id+':saber-talent');
  assert.ok(t,'队友终结技未触发龙之炉心');
  near(t.value,p.Talent[2]);assert.equal(t.remaining,p.Talent[3]);
  near(u.resources['炉心共鸣'],p.Talent[0]);
});

// ─────────────────── 真实引擎结算（伤害乘区 / 段数） ───────────────────
test('真实战斗：米沙终结技按当前段数结算（E1 按敌人数量加段）并在施放后重置段数',()=>{
  const c=config([actor(1312,{eidolon:1})]);
  c.units=[c.units[0],enemy({id:'e1'}),enemy({id:'e2'}),enemy({id:'e3'})];
  const b=createBattle(c);b.random=()=>0;
  const [u,e1]=b.units,p=u.kit.params;
  u.resources['终结技段数']=3;u.energy=u.energyMax;
  b.queue.push({actor:u.id,key:'ultimate',kind:'ultimate',targetId:e1.id});
  const n0=b.log.length;
  stepBattle(b);
  const hits=actionHits(b,u.id,n0);
  assert.equal(hits.length,3+Math.min(u.kit.ranks[1][1],3*u.kit.ranks[1][0]),'E1 应按 3 个敌人加 3 段');
  for(const h of hits)near(baseOf(h),combatPanel(u).atk*p.Ultra[1]);
  assert.ok(actionWindow(b,n0).some(e=>e.type==='resource'&&e.name==='终结技段数'&&e.value===p.Ultra[0]),
    '施放后应恢复初始段数');
});

test('真实战斗：丹恒•饮月战技点不足时用逆鳞抵扣，并打出盘拏耀跃的 7 段真段数',()=>{
  const b=createBattle({strict:true,maxAV:300,sp:0,maxSP:5,seed:42,critMode:'noncrit',units:[actor(1213),enemy()]});
  b.random=()=>0;
  const [u,en]=b.units;
  u.resources['逆鳞']=3;
  const shares=u.actions.enhancedNormal3.hitShares,total=u.actions.enhancedNormal3.terms[0].multiplier;
  b.queue.push({actor:u.id,key:'basic',kind:'normal',targetId:en.id});
  const n0=b.log.length;
  stepBattle(b);
  const hits=actionHits(b,u.id,n0);
  assert.equal(hits.length,7,'盘拏耀跃应为 7 段');
  assert.equal(u.resources['逆鳞'],0,'3 个逆鳞应抵扣 3 点战技点消耗');
  hits.forEach((h,i)=>near(baseOf(h),combatPanel(u).atk*total*shares[i],1e-6,'第 '+(i+1)+' 段'));
});

test('真实战斗：虎克灼烧在目标回合开始结算（不暴击），倍率取自战技 #4',()=>{
  const b=createBattle(config([actor(1109)],enemy({panel:{...panel(),hp:1e9,speed:1000}})));
  b.random=()=>0;
  const [u,en]=b.units,p=u.kit.params;
  b.rules.after(b,u,'skill','normal',u.actions.skill,[en],[en]);
  const d=en.dots.find(x=>x.hookBurn);
  assert.ok(d);
  const n0=dmgOf(b,u.id,'dot').length;
  stepBattle(b);
  const ticks=dmgOf(b,u.id,'dot').slice(n0);
  assert.equal(ticks.length,1,'灼烧应在目标回合开始结算 1 次');
  near(baseOf(ticks[0]),combatPanel(u).atk*p.BPSkill[3]);
  assert.equal(ticks[0].critMode,'noncrit','持续伤害不应暴击');
});

test('真实战斗：Saber 能量可回满时战技按每点炉心共鸣 +14% 倍率结算并消耗全部层数',()=>{
  const b=createBattle(config([actor(1014)]));b.random=()=>0;
  const [u,en]=b.units,p=u.kit.params;
  const n=2,row=ctx.data.skills.find(s=>s.id===101402).params['10'].param_list;
  u.energy=u.energyMax-n*p.Talent[4];u.resources['炉心共鸣']=n;
  b.queue.push({actor:u.id,key:'skill',kind:'normal',targetId:en.id});
  const n0=b.log.length;
  stepBattle(b);
  const win=actionWindow(b,n0);
  const hits=win.filter(e=>e.type==='damage'&&e.actor===u.id&&e.kind==='direct');
  assert.equal(hits.length,4,'风王铁槌为 4 段主目标（单体敌人无相邻）');
  const per=row[0]+n*p.BPSkill[3];
  near(baseOf(hits[0]),combatPanel(u).atk*per*0.1);
  near(baseOf(hits[3]),combatPanel(u).atk*per*0.7);
  assert.ok(win.some(e=>e.type==='resource'&&e.name==='炉心共鸣'&&e.value===0),'消耗分支应清空炉心共鸣');
  assert.ok(win.some(e=>e.type==='mechanic'&&e.name==='风王铁槌 · 消耗炉心共鸣'),'应记录消耗炉心共鸣');
  near(u.energy,u.energyMax,'消耗分支应回满能量');
});

// ───────────────────────── 真实战斗集成 ─────────────────────────
test('第12批 6 名角色与既有四人体系混编可完成严格战斗，无未支持缺口',()=>{
  for(const id of IDS)for(const eidolon of [0,3,6]){
    const x=actor(id,{eidolon}),ar=actor(1015),s=actor(1306),ce=actor(1412);
    x.id='focus';x.energy=x.energyMax;x.policy={...x.policy,autoUltimate:true,allyTargetId:ar.id};
    s.policy.allyTargetId=ar.id;ce.policy.allyTargetId=ar.id;
    const c={strict:true,maxAV:300,sp:3,maxSP:9,seed:3,critMode:'expected',requiredAllies:4,units:[x,s,ar,ce,enemy()]};
    assert.deepEqual(validateBattle(c).map(e=>e),[],id+' E'+eidolon);
    const r=simulateBattle(c);
    assert.ok(r.damage>0,id+' 未造成伤害');
    assert.deepEqual(r.unsupported,[]);
  }
});

test('第12批 角色在多波次严格战斗中处理换波 / 阵亡 / 时序，无未支持缺口',()=>{
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

test('第12批 变身 / 强化形态在真实四人战斗中确实被触发',()=>{
  const checks={
    1212:r=>r.log.some(e=>e.type==='mechanic'&&e.name==='进入转魄')&&r.log.some(e=>e.type==='action'&&e.name===ENH_JL),
    1213:r=>r.log.some(e=>e.type==='action'&&[N1,N2,N3].includes(e.name)),
    1312:r=>r.log.some(e=>e.type==='action'&&e.name===ULT_MI),
    1109:r=>r.log.some(e=>e.type==='mechanic'&&e.name==='火上浇油'),
    1008:r=>r.log.some(e=>e.type==='hp_consume'&&e.name==='禁锢解除'),
    1014:r=>r.log.some(e=>e.type==='action'&&e.name===ENH_SB),
  };
  for(const id of IDS){
    const x=actor(id,{eidolon:6}),ar=actor(1015),s=actor(1306),ce=actor(1412);
    x.id='focus';x.energy=x.energyMax;x.policy={...x.policy,autoUltimate:true,allyTargetId:ar.id};
    s.policy.allyTargetId=ar.id;ce.policy.allyTargetId=ar.id;
    const c={strict:true,maxAV:900,sp:3,maxSP:9,seed:11,critMode:'expected',requiredAllies:4,
      units:[x,s,ar,ce,enemy({panel:{...panel(),hp:2e9,speed:1}})]};
    assert.deepEqual(validateBattle(c).map(e=>e),[]);
    const r=simulateBattle(c);
    assert.deepEqual(r.unsupported,[]);
    assert.ok(checks[id](r),id+' 的强化 / 变身形态未在真实战斗中触发');
  }
});

console.log(`DeepSeek batch12 checks: ${passed} passed, ${failed} failed.`);if(failed)process.exitCode=1;
