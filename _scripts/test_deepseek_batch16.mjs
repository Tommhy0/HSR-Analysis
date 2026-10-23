// DeepSeek 第 16 批：8003 / 8004 开拓者（火 · 存护）、8005 开拓者（虚数 · 同谐）、
// 8009 / 8010 开拓者（雷 · 欢愉）、1504 不死途（雷 · 巡猎）的机制测试。
//
// 期望值全部由 4.6 编译出的 kit 参数（params / trace / ranks）推导，不写死倍率；
// 时序用 b.rules.before / after / afterHit / afterDamage / onTurnStart / death / attacked 直接驱动，
// 数值用伤害事件的 base 乘区（= 攻击力 / 防御力 × 倍率 × 分段比例）核对。
// 另外回读 `_data_cache/strict_research/Avatar_*_Ability.json` 的循环次数与 `ROSTER_DATA[*].hits`，
// 核对段数确实来自原始脚本。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createContext} from '../core/ctx.mjs';
import {newBattleBuild,buildBattleActor} from '../simulator/builds.mjs';
import {createBattle as rawCreateBattle,stepBattle,simulateBattle as rawSimulateBattle,validateBattle as rawValidateBattle,combatPanel} from '../simulator/engine.mjs';
const validateBattle=c=>rawValidateBattle(partialMechanicsFixture(c));
import {partialMechanicsFixture,assertFixtureDisclosure} from './partial-mechanics-fixtures.mjs';
const createBattle=c=>{const b=rawCreateBattle(partialMechanicsFixture(c));
  // Unit-level role checks isolate character triggers; shared battle-entry Elation state has its
  // own exact engine regression and real simulateBattle paths keep it enabled.
  for(const u of b.units){const starts=u.buffs.filter(e=>e.source==='battle:start'&&e.tag==='punchline');
    if(!starts.length)continue;const removed=starts.reduce((n,e)=>n+(e.stacks??0),0);
    u.buffs=u.buffs.filter(e=>!starts.includes(e));u.resources['好活当赏']=Math.max(0,(u.resources['好活当赏']??0)-removed);if(u.resources['好活当赏']===0)delete u.resources['好活当赏'];}
  return b;};
const simulateBattle=c=>rawSimulateBattle(partialMechanicsFixture(c));
import {validateKitActor} from '../simulator/kits.mjs';
import {ROSTER_DATA} from '../simulator/roster-data.mjs';
import {BREAK_BASE} from '../simulator/game-data.mjs';
import {IDS} from '../simulator/characters/extra/batch16.mjs';
const data=JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url))),ctx=createContext(data);
const core=Object.fromEntries(data.skills.map(s=>[s.id,s]));
const evidence=JSON.parse(fs.readFileSync(new URL('../data/combat/roster-evidence.json',import.meta.url))).characters;
const ability=name=>JSON.parse(fs.readFileSync(new URL('../_data_cache/strict_research/'+name,import.meta.url),'utf8'));
const near=(a,b,m=1e-6,msg)=>{if(typeof m!=='number'){msg=m;m=1e-6;}assert.ok(Math.abs(a-b)<m,`${a} != ${b}${msg?' ('+msg+')':''}`);};
const panel=()=>({hp:10000,atk:1000,def:1000,speed:100,critRate:.5,critDmg:1,energyRegen:1,effectHit:0,effectRes:0,breakEffect:0,baseStats:{hp:1000,atk:1000,def:1000},elemDmg:{}});
const actor=(id,extra={})=>{const a=buildBattleActor(ctx,{...newBattleBuild(),characterId:id,relicAuto:false,panel:panel(),...extra});a.energy=0;a.policy={...a.policy,autoUltimate:false};return a;};
const enemy=(extra={})=>({id:'enemy',name:'规则训练敌人',side:'enemy',level:90,element:'Physical',panel:{...panel(),hp:1e9,speed:1},energy:0,energyMax:0,res:{},
  actions:{basic:{name:'测试攻击',type:'Normal',terms:[{scaling:'atk',multiplier:1}],hitEnergy:10}},policy:{autoUltimate:false,basicOnly:true},...extra});
const mate=(extra={})=>({id:'mate',name:'测试队员',side:'ally',level:80,element:'Physical',panel:{...panel(),speed:1},energy:0,energyMax:100,
  actions:{basic:{name:'测试普攻',type:'Normal',terms:[{scaling:'atk',multiplier:1}],spGain:1,energyGain:20,toughness:30},
    skill:{name:'测试战技',type:'BPSkill',terms:[{scaling:'atk',multiplier:1}],spCost:1,energyGain:30,toughness:60}},policy:{autoUltimate:false,basicOnly:true},...extra});
const config=(units,en=null,maxAV=201)=>({strict:true,maxAV,sp:3,maxSP:9,seed:42,critMode:'noncrit',units:[...units,en??enemy()]});
const initialPunchline=b=>b.units.filter(u=>u.side==='ally'&&u.path==='欢愉'&&u.actions?.elation).length;
const baseOf=ev=>ev.formula.find(f=>f.zone==='base').value;
const elationBaseOf=(u,mult,punch=u.resources['好活当赏']??0)=>BREAK_BASE[u.level]*2*mult*(1+(combatPanel(u).elation??0))*(1+5*punch/(punch+240));
const dmgOf=(b,id,kind)=>b.log.filter(e=>e.type==='damage'&&e.actor===id&&(kind?e.kind===kind:true));
// 原始脚本走查：收集所有循环体的 MaxLoopCount 与 AttackData 的 HitSplitRatio。
const walkNodes=(node,fn)=>{if(Array.isArray(node)){for(const v of node)walkNodes(v,fn);return;}if(node&&typeof node==='object'){fn(node);for(const v of Object.values(node))walkNodes(v,fn);}};
const loopsOf=obj=>{const out=[];walkNodes(obj,o=>{if(typeof o.$type==='string'&&o.$type.includes('Loop'))out.push(o.MaxLoopCount?.FixedValue?.Value??'dynamic');});return out;};
const splitsOf=obj=>{const out=[];walkNodes(obj,o=>{if(o.$type==='RPG.GameCore.AttackData')out.push(o.HitSplitRatio?.FixedValue?.Value??1);});return out;};
const abil=(file,name)=>{const d=ability(file);return d.AbilityList.find(a=>a.Name===name);};
let passed=0,failed=0;const test=(name,fn)=>{try{fn();passed++;console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+'\n'+e.stack);}};

test('batch16 6 名角色 E0～E6 动作合同可编译、不能篡改倍率，且至少一个动作带倍率',()=>{
  assert.deepEqual([...IDS].sort((a,b)=>a-b),[1504,8003,8004,8005,8009,8010]);
  for(const id of IDS)for(let eidolon=0;eidolon<=6;eidolon++){
    const a=actor(id,{eidolon});assert.deepEqual(validateKitActor(a),[],id+' E'+eidolon);assert.deepEqual(a.unsupported,[]);
    const key=Object.keys(a.actions).find(k=>(a.actions[k]?.terms??[]).length);assert.ok(key,id+' 没有任何带倍率的动作');
    a.actions[key].terms[0].multiplier=99;assert.ok(validateKitActor(a).length,id+' 篡改倍率未被发现');}
});

test('段数 / 削韧与原始脚本一致（含循环次数与 ROSTER_DATA.hits）',()=>{
  // 8003 / 8004：普攻 1 段；强化普攻主目标 2 段 + 相邻 1 段；终结 1 段。
  for(const [id,file] of [[8003,'Avatar_PlayerBoy_10_Ability.json'],[8004,'Avatar_PlayerGirl_10_Ability.json']]){
    const a=actor(id);
    assert.deepEqual(a.actions.basic.hitShares,[1]);
    assert.deepEqual(a.actions.enhancedBasic.hitShares,[.5,.5]);
    assert.equal(a.actions.enhancedBasic.terms.at(-1).target,'adjacent');
    assert.equal(a.actions.enhancedBasic.target,'blast');
    assert.deepEqual(ROSTER_DATA[id].hits[file.replace('_Ability.json','')+'_Skill11_Phase02'],[.5,.5,1]);
    assert.deepEqual(splitsOf(abil(file,'Avatar_Player'+file.match(/Boy|Girl/)[0].replace('Boy','Boy').replace('Girl','Girl')+'_10_Skill11_Phase02')),[.5,.5,1]);
  }
  // 8005：战技 1 段主目标 + Bounce_Count=4 次弹射（原始脚本 DefineDynamicValue Bounce_Count，E6 分支 +2）。
  const hm=actor(8005),hm6=actor(8005,{eidolon:6});
  assert.equal(hm.actions.skill.bounceCount,4);assert.equal(hm6.actions.skill.bounceCount,4+(hm6.kit.ranks[6][0]));
  assert.deepEqual(hm.actions.skill.bounceTerms,[{scaling:'atk',multiplier:hm.kit.params.BPSkill[0]}]);
  assert.equal(hm.actions.skill.bounceToughness,hm.actions.skill.toughness*0.5);
  assert.equal(abil('Avatar_PlayerBoy_20_Ability.json','Avatar_PlayerBoy_20_Skill02_Phase02').OnStart[6].FailedTaskList[0].ResetValue.FixedValue.Value,4);
  // 8009 / 8010：普攻 2 段（0.5/0.5）、战技 1 段、终结无伤害节点。
  for(const [id,file] of [[8009,'Avatar_PlayerBoy_40_Ability.json'],[8010,'Avatar_PlayerGirl_40_Ability.json']]){
    const a=actor(id);
    assert.deepEqual(a.actions.basic.hitShares,[.5,.5]);
    assert.deepEqual(splitsOf(abil(file,file.replace('_Ability.json','')+'_Skill01_Phase02')),[.5,.5]);
    assert.equal(a.actions.skill.target,'all');assert.deepEqual(a.actions.skill.hitShares,[1]);
    assert.equal(a.actions.ultimate.target,'ally');assert.deepEqual(a.actions.ultimate.terms,[]);
    assert.deepEqual(a.actions.elation.terms,[{scaling:'atk',multiplier:.6}],'欢愉技收尾 #3=60%（倍率取自 ROSTER_DATA，不再伪造/留空）');
    assert.equal(a.actions.elation.bounceCount,8,'#1=8 次弹射');
    assert.deepEqual(a.actions.elation.bounceTerms,[{scaling:'atk',multiplier:.2}]);
    assert.deepEqual(ROSTER_DATA[id].hits[file.replace('_Ability.json','')+'_Skill02_Phase02'],[1]);
  }
  // 1504：战技 0.6/0.4，终结 15+5=20 段 ×0.05，追加攻击 10 段 ×0.1。
  const av=actor(1504);
  assert.deepEqual(av.actions.skill.hitShares,[.6,.4]);
  assert.equal(av.actions.ultimate.hitShares.length,20);
  assert.ok(av.actions.ultimate.hitShares.every(x=>Math.abs(x-.05)<1e-9));
  assert.equal(av.actions.followup.hitShares.length,10);
  assert.ok(av.actions.followup.hitShares.every(x=>Math.abs(x-.1)<1e-9));
  assert.deepEqual(ROSTER_DATA[1504].hits['Avatar_Ashveil_00_Skill02_Phase02'],[.6,.4,1]);
  assert.deepEqual(loopsOf(abil('Avatar_Ashveil_00_Ability.json','Avatar_Ashveil_00_Skill03_Phase02')),[15,5]);
  assert.deepEqual(loopsOf(abil('Avatar_Ashveil_00_Ability.json','Avatar_Ashveil_00_Insert')),[10]);
  assert.equal(av.actions.ultimate.toughness,ROSTER_DATA[1504].skills['150403'].stance[0]);
  assert.equal(av.actions.followup.toughness,ROSTER_DATA[1504].skills['150404'].stance[0]);
});

test('每名角色的动作倍率取自 4.6 编译表（按技能等级回读 hsr_core）',()=>{
  for(const [id,skillId,key,field] of [[8003,800301,'basic','terms'],[8003,800303,'ultimate','terms'],
    [8005,800502,'skill','terms'],[8009,800901,'basic','terms'],[8009,800902,'skill','terms'],[1504,150401,'basic','terms']]){
    const a=actor(id),type=core[skillId].type,lv=String(a.kit.skillLevels[type]);
    near(a.actions[key][field][0].multiplier,core[skillId].params[lv].param_list[0]);
  }
  // 8003 强化普攻倍率取自 800308（与 800301 同级行），终结双基式 = 攻击力 + 防御力。
  const p=actor(8003),lv=String(p.kit.skillLevels.Normal);
  near(p.actions.enhancedBasic.terms[0].multiplier,core[800308].params[lv].param_list[0]);
  near(p.actions.enhancedBasic.terms.at(-1).multiplier,core[800308].params[lv].param_list[1]);
  assert.equal(p.actions.ultimate.terms[1].scaling,'def');
  near(p.actions.ultimate.terms[1].multiplier,core[800303].params[String(p.kit.skillLevels.Ultra)].param_list[1]);
  // 1504 追加攻击倍率 = Talent #4；终结 #1 / #4 与 Talent #4 在 1~15 级数值相同（脚本同哈希不同键）。
  const v=actor(1504),uv=String(v.kit.skillLevels.Ultra),tv=String(v.kit.skillLevels.Talent);
  near(v.actions.ultimate.terms[0].multiplier,core[150403].params[uv].param_list[0]);
  near(v.actions.followup.terms[0].multiplier,core[150404].params[tv].param_list[3]);
  near(core[150403].params[uv].param_list[3],core[150404].params[tv].param_list[3]);
});

test('男女脚本不是逐字节相同，但同 kit 的战斗签名一致（共用一份实现）',()=>{
  for(const [a,b] of [[8003,8004],[8009,8010]])
    assert.notEqual(evidence[a].sha256,evidence[b].sha256,`${a}/${b} 的 Ability 脚本 sha256 不应相同`);
  // 动作表数值（不含名称 / id）完全一致 → 同一套实现。
  const nums=x=>Object.fromEntries(Object.entries(x.actions).map(([k,v])=>[k,{target:v.target,hitShares:v.hitShares,terms:v.terms,
    toughness:v.toughness,adjacentToughness:v.adjacentToughness,spCost:v.spCost,spGain:v.spGain,energyGain:v.energyGain,
    bounceCount:v.bounceCount,bounceToughness:v.bounceToughness,energyCost:v.energyCost}]));
  for(const [a,b] of [[8003,8004],[8009,8010]])
    for(let eidolon=0;eidolon<=6;eidolon++)
      assert.deepEqual(nums(actor(a,{eidolon})),nums(actor(b,{eidolon})),`${a}/${b} E${eidolon} 动作表应一致`);
  // 8005 与既有 batch08 的 8006 是同一套 kit：段数 / 弹射次数 / 终结目标一致。
  for(const eidolon of [0,6])assert.deepEqual(
    {b:actor(8005,{eidolon}).actions.skill.bounceCount,u:actor(8005,{eidolon}).actions.ultimate.target},
    {b:actor(8006,{eidolon}).actions.skill.bounceCount,u:actor(8006,{eidolon}).actions.ultimate.target});
});

// ───────────────────────────── 8003 / 8004 开拓者（火 · 存护）─────────────────────────────
test('8003/8004：普攻 / 战技 / 终结技后为我方全体提供 def×Talent[0]+Talent[3] 护盾，持续 Talent[1] 回合',()=>{
  for(const id of [8003,8004])for(const eidolon of [0,2]){
    const b=createBattle(config([actor(id,{eidolon}),mate()]));b.random=()=>0;
    const [u,m,en]=b.units,p=u.kit.params;
    for(const key of ['basic','skill','ultimate']){
      for(const t of b.units)t.shields=[];
      b.rules.after(b,u,key,key==='ultimate'?'ultimate':'normal',u.actions[key],[key==='basic'||key==='ultimate'?en:u],[en]);
      for(const t of [u,m]){
        const s=t.shields.find(s=>s.id===u.id+':preservation-shield');
        assert.ok(s,`${id} E${eidolon} ${key} 未给 ${t.id} 护盾`);
        let expect=combatPanel(u).def*p.Talent[0]+p.Talent[3];
        if(eidolon>=2)expect+=combatPanel(u).def*u.kit.ranks[2][0]+u.kit.ranks[2][1];
        near(s.value,expect*(1+(combatPanel(u).shieldBoost??0)));
        assert.equal(s.remaining,p.Talent[1]);
      }
    }
  }
});

test('8003/8004：【灼热意志】普攻 / 战技 / 受击各 +1，上限 Talent[2]；E4 开场 4 层',()=>{
  const b=createBattle(config([actor(8003)],enemy()));b.random=()=>0;
  const [u,en]=b.units,p=u.kit.params;
  assert.equal(u.resources['灼热意志'],0);
  b.rules.after(b,u,'basic','normal',u.actions.basic,[en],[en]);
  assert.equal(u.resources['灼热意志'],1,'普攻应 +1 层');
  b.rules.before(b,u,'skill','normal',u.actions.skill,[u]);
  assert.equal(u.resources['灼热意志'],2,'战技应 +1 层');
  b.rules.attacked(b,u,en);
  assert.equal(u.resources['灼热意志'],3,'受击应 +1 层');
  for(let i=0;i<10;i++){b.rules.after(b,u,'basic','normal',u.actions.basic,[en],[en]);b.rules.attacked(b,u,en);}
  assert.equal(u.resources['灼热意志'],p.Talent[2],'层数上限应为 Talent[2]');
  const b4=createBattle(config([actor(8004,{eidolon:4})]));b4.random=()=>0;
  assert.equal(b4.units[0].resources['灼热意志'],b4.units[0].kit.ranks[4][0]);
});

test('8003/8004：层数 ≥4 时普攻强化为强化普攻并消耗 4 层；终结技后的下一次普攻强化且不消耗',()=>{
  const b=createBattle(config([actor(8003)],enemy()));b.random=()=>0;
  const [u,en]=b.units,p=u.kit.params;
  assert.equal(b.rules.prepare(b,u,'basic','normal',u.actions.basic).name,u.actions.basic.name);
  u.resources['灼热意志']=4;
  const enh=b.rules.prepare(b,u,'basic','normal',u.actions.basic);
  assert.equal(enh.name,u.actions.enhancedBasic.name);assert.ok(enh.preservationEnhanced);
  b.rules.before(b,u,'basic','normal',enh);
  assert.equal(u.resources['灼热意志'],0,'强化普攻应消耗 4 层');
  // 终结技：留下「不消耗」标记，下一次普攻即使层数 <4 也强化，且不扣层。
  b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[en],[en]);
  assert.equal(u.resources['强化普攻不消耗'],1);
  u.resources['灼热意志']=1;
  const enh2=b.rules.prepare(b,u,'basic','normal',u.actions.basic);
  assert.equal(enh2.name,u.actions.enhancedBasic.name,'终结技后下一次普攻应强化');
  b.rules.before(b,u,'basic','normal',enh2);
  assert.equal(u.resources['强化普攻不消耗'],0);
  assert.equal(u.resources['灼热意志'],1,'强化且不消耗时不应扣层');
  assert.equal(p.Talent[2],8);
});

test('8003/8004：战技自身受伤降低 BPSkill[0]/BPSkill[2] 回合并使敌方全体陷入嘲讽（control=taunt）',()=>{
  const c=config([actor(8003),mate()]);
  c.units=[c.units[0],c.units[1],enemy({id:'e1'}),enemy({id:'e2'})];
  const b=createBattle(c);b.random=()=>0;
  const [u]=b.units,p=u.kit.params;
  b.rules.before(b,u,'skill','normal',u.actions.skill,[u]);
  const dr=u.buffs.find(e=>e.id===u.id+':preservation-skill-dr');
  assert.ok(dr);near(dr.value,p.BPSkill[0]);assert.equal(dr.remaining,p.BPSkill[2]);
  const taunted=b.units.filter(t=>t.side==='enemy'&&t.buffs.some(e=>e.tag==='preservationTaunt'));
  assert.equal(taunted.length,2,'战技应嘲讽敌方全体');
  for(const t of taunted){const e=t.buffs.find(e=>e.tag==='preservationTaunt');assert.equal(e.control,'taunt');assert.equal(e.remaining,p.BPSkill[2]);}
  // 嘲讽期间开拓者仇恨比提高（引擎按 aggro × aggroRatio 选目标）。
  assert.ok(combatPanel(u).aggroRatio>=10);
  // 行迹 point06「强援弱」：我方全体受伤降低 trace[1]=15%，持续 trace[2]=1 回合。
  const team=u.buffs.find(e=>e.id===u.id+':preservation-team-dr');
  assert.ok(team);near(team.value,u.kit.trace[1][1]);assert.equal(team.remaining,u.kit.trace[1][2]);
  assert.ok(b.units[1].buffs.some(e=>e.id===u.id+':preservation-team-dr'),'队友也应获得强援弱');
});

test('8003/8004：行迹 point07 强化普攻回复 5% 生命上限；point08 持盾回合开始 +5 能 / +15% 攻击',()=>{
  const b=createBattle(config([actor(8003)],enemy()));b.random=()=>0;
  const [u,en]=b.units;
  u.hp=500;
  u.resources['灼热意志']=4;
  const enh=b.rules.prepare(b,u,'basic','normal',u.actions.basic);
  b.rules.before(b,u,'basic','normal',enh);
  b.rules.after(b,u,'basic','normal',enh,[en],[en]);
  near(u.hp,500+combatPanel(u).hp*u.kit.trace[2][0],'强化普攻应回复 5% 生命上限');
  // point08：持盾时回合开始回 trace[3][0]=5 能与 trace[3][1]=15% 攻击力（本回合结束过期）。
  u.energy=0;u.buffs=u.buffs.filter(e=>e.id!==u.id+':preservation-point08');
  u.shields=[];
  b.rules.onTurnStart(b,u);
  near(u.energy,0,'无盾时不应回能');
  u.shields.push({type:'shield',id:'test-shield',value:100,source:u.id,remaining:2,tickOwner:u.id,tickAt:'end'});
  u.energy=0;
  b.rules.onTurnStart(b,u);
  near(u.energy,u.kit.trace[3][0]);
  const e=u.buffs.find(e=>e.id===u.id+':preservation-point08');
  assert.ok(e);near(e.value,u.kit.trace[3][1]);assert.equal(e.key,'atkPct');
  assert.equal(e.remaining,1);assert.ok(e.countApplyTurn,'应在本回合结束过期');
});

test('8003/8004：E1 普攻 / 强化普攻额外造成 25% / 50% 防御力火伤（同一段内多基式）',()=>{
  const a=actor(8003,{eidolon:1}),b=actor(8003,{eidolon:0}),r=a.kit.ranks[1];
  assert.equal(b.actions.basic.terms.length,1,'E0 普攻不应有防御力伤害项');
  assert.deepEqual(a.actions.basic.terms[1],{scaling:'def',multiplier:r[0]});
  assert.deepEqual(a.actions.enhancedBasic.terms[1],{scaling:'def',multiplier:r[1]});
  // 真实战斗：普攻一段的 base = 攻击力×Normal[0] + 防御力×ranks[1][0]。
  const x=actor(8003,{eidolon:1});x.panel.speed=200;x.policy={...x.policy,basicOnly:true};
  const battle=createBattle({strict:true,maxAV:80,sp:0,maxSP:9,seed:2,critMode:'noncrit',units:[x,enemy()]});
  stepBattle(battle);
  const direct=battle.log.filter(e=>e.type==='damage'&&e.actor===x.id&&e.kind==='direct');
  assert.equal(direct.length,1);
  near(baseOf(direct[0]),combatPanel(battle.units[0]).atk*x.kit.params.Normal[0]+combatPanel(battle.units[0]).def*r[0]);
  // 强化普攻：主目标 2 段（每段含攻击力 + 防御力项），并消耗 4 层。
  const x2=actor(8003,{eidolon:1});x2.panel.speed=200;x2.policy={...x2.policy,basicOnly:true};
  const b2=createBattle({strict:true,maxAV:80,sp:0,maxSP:9,seed:2,critMode:'noncrit',units:[x2,enemy()]});
  const u2=b2.units[0];u2.resources['灼热意志']=4;
  const enh=u2.actions.enhancedBasic;
  assert.ok(b2.rules.prepare(b2,u2,'basic','normal',u2.actions.basic).preservationEnhanced);
  stepBattle(b2);
  const hits=b2.log.filter(e=>e.type==='damage'&&e.actor===x2.id&&e.kind==='direct');
  assert.equal(hits.length,2,'强化普攻主目标 2 段（单敌人时无相邻段）');
  // 强化普攻倍率来自 800308（与 800301 同级行），E1 的强化普攻追加项为 ranks[1][1]=50%。
  const enhRow=ROSTER_DATA[8003].skills['800308'].params[String(u2.kit.skillLevels.Normal)].param_list;
  near(baseOf(hits[0]),(combatPanel(u2).atk*enhRow[0]+combatPanel(u2).def*r[1])*0.5);
  assert.equal(u2.resources['灼热意志'],0,'强化普攻应消耗 4 层');
  void enh;
});

test('8003/8004：E6 强化普攻 / 终结技后防御力 +10%、最多 3 层，且先于护盾结算',()=>{
  const b=createBattle(config([actor(8003,{eidolon:6})],enemy()));b.random=()=>0;
  const [u,en]=b.units,p=u.kit.params;
  let expectDef=combatPanel(u).def;
  for(let i=0;i<5;i++){
    expectDef*=1;
    const before=u.buffs.find(e=>e.id===u.id+':preservation-e6')?.stacks??0;
    b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[en],[en]);
    const st=u.buffs.find(e=>e.id===u.id+':preservation-e6').stacks;
    assert.equal(st,Math.min(u.kit.ranks[6][1],before+1));
  }
  assert.equal(u.buffs.find(e=>e.id===u.id+':preservation-e6').stacks,u.kit.ranks[6][1]);
  // 最后一次终结技：护盾值应已包含 3 层 E6（+30% 防御力）与 E2 的额外护盾。
  const def=combatPanel(u).def;
  const expected=(def*p.Talent[0]+p.Talent[3]+def*u.kit.ranks[2][0]+u.kit.ranks[2][1])
    *(1+(combatPanel(u).shieldBoost??0));
  near(u.shields.find(s=>s.id===u.id+':preservation-shield').value,expected);
  near(def,1000*(1+u.kit.ranks[6][0]*u.kit.ranks[6][1]));
});

// ───────────────────────────── 8005 开拓者（虚数 · 同谐）─────────────────────────────
test('8005：终结技为我方全体附上【伴舞】（击破特攻 +Ultra[2]、Ultra[0] 回合、开拓者回合开始递减）',()=>{
  const b=createBattle(config([actor(8005),mate()]));b.random=()=>0;
  const [u,m]=b.units,p=u.kit.params;
  b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[u,m],[u,m]);
  for(const t of [u,m]){
    const e=t.buffs.find(x=>x.tag==='hmcDance');
    assert.ok(e,`${t.id} 未获得伴舞`);
    near(e.value,p.Ultra[2]);assert.equal(e.key,'breakEffect');
    assert.equal(e.remaining,p.Ultra[0]);assert.equal(e.tickOwner,u.id);assert.equal(e.tickAt,'start');
  }
});

test('8005：敌方弱点被击破时开拓者回 Talent[0] 能量，行迹 point08 使敌方行动延后 30%',()=>{
  const b=createBattle(config([actor(8005),mate()]));b.random=()=>0;
  const [u,m,en]=b.units;
  const n0=u.energy;
  b.rules.afterDamage(b,m,en,'break');
  near(u.energy,n0+u.kit.params.Talent[0]);
  const t=u.kit.trace[3];
  assert.equal(t[0],0.3);
  assert.ok(b.log.some(e=>e.type==='delay'&&e.actor===en.id&&Math.abs(e.ratio-t[0])<1e-9),'应延后 30%');
  const before=u.energy;
  b.rules.afterDamage(b,m,en,'break_dot');
  near(u.energy,before,'击破持续伤害不应再次回能');
});

test('8005：【伴舞】持有者攻击已击破目标后按本次削韧 ×Ultra[1] 触发 1 次超击破；行迹 point06 按敌人数增伤',()=>{
  const c=config([actor(8005)]);c.units=[c.units[0],enemy({id:'e1'})];
  const b=createBattle(c);b.random=()=>0;
  const [u,en]=b.units,p=u.kit.params;
  assert.equal(p.Ultra[1],1);
  // 无伴舞：不触发。
  en.broken=true;en.toughness=0;
  b.rules.afterHit(b,u,en,{...u.actions.basic,segment:1,hitShares:[1],toughness:30},'direct');
  assert.equal(dmgOf(b,u.id,'superbreak').length,0);
  b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[u],[u]);
  b.rules.afterHit(b,u,en,{...u.actions.basic,segment:1,hitShares:[1],toughness:30},'direct');
  const hits=dmgOf(b,u.id,'superbreak');
  assert.equal(hits.length,1,'应触发 1 次超击破');
  assert.equal(hits[0].critMode,'noncrit');
  // 行迹 point06：1 名敌人 → trace[1][4]=60%。
  const mod=b.rules.modifiers(b,u,en,{type:'SuperBreak',element:'Imaginary',superBreakSource:u.id},'superbreak');
  near(mod.superBreakDmgBoost,u.kit.trace[1][4]);
  // 未击破目标不触发。
  en.broken=false;
  b.rules.afterHit(b,u,en,{...u.actions.basic,segment:1,hitShares:[1],toughness:30},'direct');
  assert.equal(dmgOf(b,u.id,'superbreak').length,1);
});

test('8005：行迹 point07 战技第一次伤害削韧 +100%，弹射每次削韧为技能削韧的 50%，真实战斗共 5 次伤害',()=>{
  const b=createBattle(config([actor(8005)]));b.random=()=>0;
  const [u]=b.units;
  const a=b.rules.prepare(b,u,'skill','normal',u.actions.skill);
  near(a.toughness,u.actions.skill.toughness*2);
  near(u.actions.skill.bounceToughness,u.actions.skill.toughness*0.5);
  assert.equal(a.bounceCount,4);
  // 真实战斗：1 段主目标 + 4 次弹射 = 5 次直接伤害。
  const u3=actor(8005);u3.panel.speed=200;
  const b3=createBattle({strict:true,maxAV:80,sp:3,maxSP:9,seed:1,critMode:'noncrit',units:[u3,enemy({id:'e1'})]});
  stepBattle(b3);
  const direct=b3.log.filter(e=>e.type==='damage'&&e.actor===u3.id);
  assert.equal(direct.length,5,'战技应为 1 主段 + 4 弹射');
});

test('8005：E1 首次战技回 1 战技点、E2 开场回能效率 +25%、E4 队友按开拓者 15% 击破特攻加成、秘技 30%/2 回合',()=>{
  const b=createBattle(config([actor(8005,{eidolon:4,technique:true}),mate()]));b.random=()=>0;
  const [u,m]=b.units,p=u.kit.params;
  // 秘技：我方全体击破特攻 +Maze[0]，Maze[1] 回合。
  for(const t of [u,m]){const e=t.buffs.find(x=>x.id===u.id+':hmc-maze');assert.ok(e);near(e.value,p.Maze[0]);assert.equal(e.remaining,p.Maze[1]);}
  // E2：回能效率 +ranks[2][0]，ranks[2][1] 回合。
  const e2=u.buffs.find(x=>x.id===u.id+':hmc-e2');
  assert.ok(e2);near(e2.value,u.kit.ranks[2][0]);assert.equal(e2.remaining,u.kit.ranks[2][1]);assert.equal(e2.key,'energyRegen');
  // E4：队友击破特攻 = 开拓者当前击破特攻 × ranks[4][0]（动态换算）。
  u.buffs=u.buffs.filter(e=>e.id!==u.id+':hmc-maze');
  m.buffs=m.buffs.filter(e=>e.id!==u.id+':hmc-maze');
  u.panel.breakEffect=.5;
  const e4=m.buffs.find(x=>x.id===u.id+':hmc-e4');
  assert.ok(e4);assert.ok(e4.convert);near(e4.convert.ratio,u.kit.ranks[4][0]);
  near(combatPanel(m).breakEffect,combatPanel(u,{excludeConverted:true}).breakEffect*u.kit.ranks[4][0]);
  // E1：首次战技后回 1 战技点（只触发一次）。
  const b2=createBattle(config([actor(8005,{eidolon:1}),mate()]));b2.random=()=>0;
  const [u2]=b2.units;const sp0=b2.sp;
  b2.rules.after(b2,u2,'skill','normal',u2.actions.skill,[b2.units[2]],[b2.units[2]]);
  near(b2.sp,sp0+u2.kit.ranks[1][0]);
  b2.rules.after(b2,u2,'skill','normal',u2.actions.skill,[b2.units[2]],[b2.units[2]]);
  near(b2.sp,sp0+u2.kit.ranks[1][0],'E1 只应在首次战技触发');
});

// ───────────────────────────── 8009 / 8010 开拓者（雷 · 欢愉）─────────────────────────────
test('8009/8010：欢愉技倍率取自 ROSTER_DATA（hsr_core 800920/801020），#1 次弹射 + #3 全体均分',()=>{
  for(const id of [8009,8010]){
    const skillId=id+'20';
    assert.ok(core[skillId],`hsr_core 应有 ${skillId}`);
    assert.deepEqual(core[skillId].params['10'].param_list,[8,.2,.6]);
    assert.ok(ROSTER_DATA[id].skills[skillId],`${skillId} 应已编入 ROSTER_DATA（倍率缺口已收口）`);
    const a=actor(id);
    assert.equal(a.actions.elation.type,'ElationDamage');
    near(a.actions.elation.terms[0].multiplier,.6,'收尾 #3=60%（全体均分在 prepare 折算）');
    assert.equal(a.actions.elation.bounceCount,8,'#1=8 次弹射');
    near(a.actions.elation.bounceTerms[0].multiplier,.2,'每次弹射 #2=20%');
  }
});

test('8009/8010：天赋施放攻击后固定回 Talent[0] 能量并获得 Talent[1] 个笑点',()=>{
  const b=createBattle(config([actor(8009)]));b.random=()=>0;
  const [u,en]=b.units,p=u.kit.params;
  u.panel.energyRegen=5;                       // 「固定恢复」不应乘回能效率
  u.energy=0;
  b.rules.after(b,u,'basic','normal',u.actions.basic,[en],[en]);
  near(u.energy,p.Talent[0],'应固定回 Talent[0] 点能量');
  assert.equal(b.laughter.ally,initialPunchline(b)+p.Talent[1]);
  u.energy=0;
  b.rules.after(b,u,'skill','normal',u.actions.skill,[en],[en]);
  near(u.energy,p.Talent[0]);
  assert.equal(b.laughter.ally,initialPunchline(b)+p.Talent[1]*2);
  // 终结技不是攻击：不触发天赋的能量与笑点（只有终结技自身写明的 Ultra[5]）。
  u.energy=0;
  b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[u],[]);
  near(u.energy,0,'终结技不应触发天赋回能');
  assert.equal(b.laughter.ally,initialPunchline(b)+p.Talent[1]*2+p.Ultra[5]);
});

test('8009/8010：战技获得 BPSkill[1] 点好活当赏；已持有好活当赏时额外造成 Talent[2] 雷属性欢愉伤害',()=>{
  const b=createBattle(config([actor(8009),mate()]));b.random=()=>0;
  const [u,m,en]=b.units,p=u.kit.params;
  assert.equal(u.resources['好活当赏'],undefined);
  b.rules.after(b,u,'skill','normal',u.actions.skill,[en],[en]);
  assert.equal(u.resources['好活当赏'],p.BPSkill[1],'首次战技不应触发额外欢愉伤害（先获得再判定）');
  assert.equal(dmgOf(b,u.id,'elation').length,0);
  b.rules.after(b,u,'skill','normal',u.actions.skill,[en],[en]);
  const extra=dmgOf(b,u.id,'elation');
  assert.equal(extra.length,1,'第二次战技应额外造成 1 次欢愉伤害');
  near(baseOf(extra[0]),elationBaseOf(u,p.Talent[2],p.BPSkill[1]));
  assert.equal(extra[0].attackType,'ElationDamage');
  assert.equal(extra[0].formula.some(f=>f.zone==='dmgBoost'),true);
  assert.equal(u.resources['好活当赏'],p.BPSkill[1]*2);
  // 行迹 point08：我方目标施放欢愉技后，下一次战技额外获得 trace[3][0]=2 点好活当赏。
  const before=u.resources['好活当赏'];
  b.rules.after(b,u,'elation','followup',u.actions.elation,[],[]);
  // +2 由 before（OnStart[3]）发放，BPSkill[1]=20 由 after（OnStart[7]）发放。
  b.rules.before(b,u,'skill','normal',u.actions.skill,[en]);
  b.rules.after(b,u,'skill','normal',u.actions.skill,[en],[en]);
  assert.equal(u.resources['好活当赏'],before+p.BPSkill[1]+u.kit.trace[3][0]);
  void m;
});

test('8009/8010：战技额外欢愉伤害读取队伍最高 ElationEchoPoint，而非只读开拓者自身好活当赏',()=>{
  for(const id of [8009,8010]){
    const u=actor(id);u.panel.speed=300;u.policy={...u.policy,rotation:['skill']};
    const cfg=config([u,mate()],enemy({id:'dummy',panel:{...panel(),hp:1e9,speed:1}}));
    const b=createBattle(cfg);b.random=()=>0;
    const [owner,ally]=b.units;owner.resources['好活当赏']=20;ally.resources['好活当赏']=300;
    assert.equal(stepBattle(b),true,'队伍必须实际执行开拓者战技');
    const hits=dmgOf(b,owner.id,'elation');assert.equal(hits.length,1,'持有好活当赏的战技应触发额外欢愉伤害');
    const expected=BREAK_BASE[owner.level]*2*owner.kit.params.Talent[2]*(1+combatPanel(owner).elation)*(1+5*300/(300+240));
    near(baseOf(hits[0]),expected,'额外欢愉伤害应使用队伍最高的300点 ElationEchoPoint');
    assert.equal(owner.resources['好活当赏'],20+owner.kit.params.BPSkill[1],'先判定已有资源，再发放战技资源');
  }
});

test('8009/8010：Point08 只响应我方施放的欢愉技，不响应敌方欢愉技',()=>{
  for(const id of [8009,8010]){
    const b=createBattle(config([actor(id),mate()]));
    const [u,ally,foe]=b.units;
    b.rules.after(b,foe,'elation','aha',{},[],[]);
    assert.equal(u.resources['下次战技额外好活当赏']??0,0,'敌方欢愉技不得触发我方行迹');
    b.rules.after(b,ally,'elation','aha',{},[],[]);
    assert.equal(u.resources['下次战技额外好活当赏'],1,'我方队友欢愉技应触发一次行迹');
  }
});

test('8009/8010：终结技使目标暴伤 +Ultra[0]、Ultra[1] 回合并解除控制；固定计入笑点不是阿哈额外回合',()=>{
  const b=createBattle(config([actor(8009)]));b.random=()=>0;
  const [u,en]=b.units,p=u.kit.params;
  // 两个控制类负面 + 一个非控制类负面：脚本是 DispelStatus(STAT_CTRL)，两条控制都必须消失，
  // 非控制类负面必须保留（旧实现复用 cleanseOne 只会解第一条）。
  u.buffs.push({id:'ctrl',name:'冻结',key:'speed',value:-.1,remaining:2,tickOwner:u.id,tickAt:'end',debuff:true,control:'freeze'});
  u.buffs.push({id:'ctrl2',name:'禁锢',key:'speed',value:-.1,remaining:2,tickOwner:u.id,tickAt:'end',debuff:true,control:'imprison'});
  u.buffs.push({id:'debuff',name:'灼烧',key:'speed',value:-.1,remaining:2,tickOwner:u.id,tickAt:'end',debuff:true});
  const sp0=b.sp,aha0=b.ahaCount??0;
  b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[u],[u]);
  const cd=u.buffs.find(e=>e.id===u.id+':elation-ult:'+u.id);
  assert.ok(cd);near(cd.value,p.Ultra[0]);assert.equal(cd.remaining,p.Ultra[1]);
  assert.ok(!u.buffs.some(e=>e.id==='ctrl'),'应解除控制类负面');
  assert.ok(!u.buffs.some(e=>e.id==='ctrl2'),'应解除全部控制类负面，而不是只解第一条');
  assert.ok(u.buffs.some(e=>e.id==='debuff'),'非控制类负面不得被解除');
  assert.equal(b.log.filter(e=>e.type==='cleanse'&&e.target===u.id).length,2,'每条控制类负面各记录一次解除');
  // 原始脚本 Skill03_Phase02 的 ByHasSkillTag → Rank01_InsertActionSave → TurnInsertAction
  // （BIKKDNAMGMG）只让**目标**插入 1 次欢愉技；没有调用 Elation_StartElationTime，
  // 所以不得建立 ahaInstant / ahaCount，也不得排入全队参演队列。
  assert.equal(b.laughter.ally,initialPunchline(b)+p.Ultra[5]);
  assert.equal(b.ahaInstant??null,null,'固定计入笑点的插入不是阿哈时刻');
  assert.equal(b.ahaCount??0,aha0,'固定计入笑点的插入不得增加 ahaCount');
  assert.equal(u.resources['好活当赏'],p.Ultra[3]);
  const inserts=b.queue.filter(q=>q.actor===u.id&&q.key==='elation');
  assert.equal(inserts.length,1,'只应排入目标自身 1 次欢愉技');
  assert.equal(inserts[0].kind,'extra');
  assert.equal(inserts[0].persistWave,true,'「施放前敌方被消灭则对新入场敌方发动」');
  assert.equal(inserts[0].overrides.punchlineOverride,p.Ultra[4],'固定计入 Ultra[4]=20 笑点');
  near(b.sp,sp0+u.kit.trace[2][1],'行迹 point07 应恢复 1 个战技点');
  // 无欢愉技的目标改为行动提前 Ultra[2]。
  const b2=createBattle(config([actor(8010),mate()]));b2.random=()=>0;
  const [u2,m2]=b2.units;
  u2.policy={...u2.policy,allyTargetId:m2.id};
  b2.rules.after(b2,u2,'ultimate','ultimate',u2.actions.ultimate,[m2],[m2]);
  assert.ok(b2.log.some(e=>e.type==='advance'&&e.actor===m2.id&&Math.abs(e.ratio-u2.kit.params.Ultra[2])<1e-9));
  assert.equal(m2.resources['好活当赏'],undefined);
  assert.equal(b2.queue.filter(q=>q.key==='elation').length,0,'无欢愉技的目标不得插入欢愉技');
});

test('8009/8010：终结技只让指定目标插入 1 次固定 20 笑点的欢愉技，不触发全队阿哈',()=>{
  const b=createBattle(config([actor(8009),actor(1501),actor(1502)]));
  const [tb,sparxie,yaoguang]=b.units;
  const aha0=b.ahaCount??0;
  b.rules.after(b,tb,'ultimate','ultimate',tb.actions.ultimate,[sparxie],[sparxie]);
  assert.equal(b.queue.filter(q=>q.kind==='aha').length,0,'不应建立全队阿哈队列');
  assert.deepEqual(b.queue.filter(q=>q.key==='elation').map(q=>q.actor),[sparxie.id],
    '只有终结技指定的目标插入欢愉技');
  assert.equal(sparxie.resources['好活当赏'],tb.kit.params.Ultra[3],
    '开拓者指定的欢愉目标仍获得 Ultra[3] 好活当赏');
  assert.equal(yaoguang.resources['好活当赏'],undefined,'其他欢愉队友不获得本条好活当赏');
  b.config.maxAV=0;
  stepBattle(b);
  assert.equal(b.log.filter(e=>e.type==='action'&&e.actor===sparxie.id&&e.key==='elation'&&e.kind==='extra').length,1,
    '目标必须实际插入施放 1 次欢愉技');
  for(const u of [tb,yaoguang])
    assert.equal(b.log.filter(e=>e.type==='action'&&e.actor===u.id&&e.key==='elation').length,0,
      u.name+' 不得因开拓者终结技施放欢愉技');
  assert.equal(b.ahaInstant??null,null,'固定计入笑点的插入不是阿哈时刻');
  assert.equal(b.ahaCount??0,aha0,'固定计入笑点的插入不得增加 ahaCount');
  assert.equal(b.laughter.ally,initialPunchline(b)+tb.kit.params.Ultra[5],
    '目标施放欢愉技不产生开拓者天赋笑点；共享笑点未被消费');
  // 150120 的欢愉技是 1 段 #2=50% 本体 + #1=25%×20 次弹射；本体按固定 20 笑点结算。
  const hits=b.log.filter(e=>e.type==='damage'&&e.actor===sparxie.id&&e.attackType==='ElationDamage');
  assert.ok(hits.length>=1,'目标应产生 ElationDamage');
  const main=hits[0];
  near(baseOf(main),elationBaseOf(sparxie,sparxie.actions.elation.terms[0].multiplier,tb.kit.params.Ultra[4]),
    '插入的欢愉技必须使用固定计入的 20 笑点，而不是目标自身的好活当赏(10)');
  assert.ok(baseOf(main)>elationBaseOf(sparxie,sparxie.actions.elation.terms[0].multiplier,sparxie.resources['好活当赏']),
    '固定 20 笑点应高于目标自身的 10 点好活当赏');
});

test('绯英瞰众乐：开拓者将好活发给队友时按参演编号实时转化，E2与解锁边界正确',()=>{
  const run=({eidolon=0,unlock=true,targetId=1501,participantId}={})=>{
    const ids=targetId===1506?[8009,1505,1506,1513]:[8009,1501,1502,1505];
    const b=createBattle(config(ids.map(id=>actor(id,id===1505?{eidolon}:{}))));
    const pioneer=b.units.find(t=>t.kit?.characterId===8009),evanescia=b.units.find(t=>t.kit?.characterId===1505);
    const target=b.units.find(t=>t.kit?.characterId===targetId);
    if(participantId!=null)target.participantId=participantId;
    if(!unlock)delete evanescia.kit.trace['1'];
    const before={target:target.resources['好活当赏']??0,evanescia:evanescia.resources['好活当赏']??0};
    b.rules.after(b,pioneer,'ultimate','ultimate',pioneer.actions.ultimate,[target],[target]);
    return {b,target,evanescia,before,amount:pioneer.kit.params.Ultra[3]};
  };
  for(const [eidolon,ratio] of [[0,.5],[2,.75]]){
    const {b,target,evanescia,before,amount}=run({eidolon}),converted=amount*ratio;
    near((target.resources['好活当赏']??0)-before.target,amount-converted,'开拓者助益只保留未转化部分');
    near((evanescia.resources['好活当赏']??0)-before.evanescia,converted,'E0转50%，E2再增加转化量的50%');
    assert.ok(b.log.some(e=>e.type==='mechanic'&&e.name==='瞰众乐 · 好活当赏发放时转化'));
  }
  const high=run({targetId:1506});
  near((high.target.resources['好活当赏']??0)-high.before.target,high.amount,'高于绯英参演编号的角色不触发');
  const locked=run({unlock:false});
  near((locked.target.resources['好活当赏']??0)-locked.before.target,locked.amount,'行迹未解锁时不转化');
  const reordered=run({participantId:200});
  near((reordered.target.resources['好活当赏']??0)-reordered.before.target,reordered.amount,'按参演编号判断而非队伍站位');
});

test('8009/8010：施放欢愉技时 E4 使敌方受伤 +10%/2 回合、E6 自身暴伤 +100%/3 回合、欢愉技计数 +1',()=>{
  const b=createBattle(config([actor(8009,{eidolon:6})]));
  b.random=()=>0;
  const [u,en]=b.units;
  b.rules.before(b,u,'elation','followup',u.actions.elation,[en]);
  const e4=en.buffs.find(e=>e.id===u.id+':elation-e4:'+en.id);
  assert.ok(e4);near(e4.value,u.kit.ranks[4][0]);assert.equal(e4.remaining,u.kit.ranks[4][1]);assert.equal(e4.key,'vuln');
  const e6=u.buffs.find(e=>e.id===u.id+':elation-e6');
  assert.ok(e6);near(e6.value,u.kit.ranks[6][0]);assert.equal(e6.remaining,u.kit.ranks[6][1]);assert.equal(e6.key,'critDmg');
  assert.equal(u.resources['欢愉技施放次数'],1);
  // E4 的易伤在 damageTo 中由 to.buffs 读取，这里按真实伤害的 formula 乘区核对。
  const x=actor(8010,{eidolon:6});x.panel.speed=200;x.policy={...x.policy,autoUltimate:false,basicOnly:true};
  const b2=createBattle({strict:true,maxAV:80,sp:0,maxSP:9,seed:3,critMode:'noncrit',units:[x,enemy()]});
  const [u2,en2]=b2.units;
  b2.rules.before(b2,u2,'elation','followup',u2.actions.elation,[en2]);
  stepBattle(b2);
  const ev=b2.log.find(e=>e.type==='damage'&&e.actor===x.id);
  assert.ok(ev,'欢愉技后应能造成伤害');
  near(ev.formula.find(f=>f.zone==='vuln').value,1+u2.kit.ranks[4][0]);
});

test('8009/8010：E1 每次战技累计层数（上限 ranks[1][1]），终结技按层数提高目标获得的好活当赏',()=>{
  const b=createBattle(config([actor(8009,{eidolon:1})]));b.random=()=>0;
  const [u,en]=b.units,p=u.kit.params;
  for(let i=0;i<5;i++)b.rules.after(b,u,'skill','normal',u.actions.skill,[en],[en]);
  assert.equal(u.resources['E1层数'],u.kit.ranks[1][1]);
  const punch0=u.resources['好活当赏'];
  assert.equal(punch0,p.BPSkill[1]*5);
  b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[u],[u]);
  assert.equal(u.resources['好活当赏'],
    punch0+p.Ultra[3]+u.kit.ranks[1][1]*u.kit.ranks[1][0],
    '终结技的好活当赏应含 E1 层数加成');
  assert.equal(u.resources['E1层数'],0,'终结技后应清空 E1 层数');
  // E2：终结技额外使目标欢愉度 +ranks[2][0]、ranks[2][1] 回合。
  const b2=createBattle(config([actor(8010,{eidolon:2})]));b2.random=()=>0;
  const [u2]=b2.units;
  b2.rules.after(b2,u2,'ultimate','ultimate',u2.actions.ultimate,[u2],[u2]);
  const e2=u2.buffs.find(e=>e.id===u2.id+':elation-e2:'+u2.id);
  assert.ok(e2);near(e2.value,u2.kit.ranks[2][0]);assert.equal(e2.remaining,u2.kit.ranks[2][1]);assert.equal(e2.key,'elation');
});

test('8009/8010：行迹 point06 攻击力转欢愉度（1000+每200点+10%，上限60%）；point07 暴击率 +15%',()=>{
  const b=createBattle(config([actor(8009)]));b.random=()=>0;
  const [u]=b.units,t=u.kit.trace[1];
  assert.deepEqual(t,[1000,200,.1,.6]);
  u.panel.atk=1000;near(combatPanel(u).elation,0);
  u.panel.atk=1800;near(combatPanel(u).elation,Math.min(t[3],800/200*t[2]));
  u.panel.atk=5000;near(combatPanel(u).elation,t[3]);
  near(combatPanel(u).critRate,.5+u.kit.trace[2][0]);
});

test('8009/8010：秘技随机使全队欢愉度 +Maze[0]=30% 或 +Maze[2]=20%，持续 Maze[4] 回合',()=>{
  const b=createBattle(config([actor(8010,{technique:true}),mate()]));
  const [u,m]=b.units,p=u.kit.params;
  assert.ok([p.Maze[0],p.Maze[2]].includes(u.buffs.find(x=>x.id===u.id+':elation-maze').value));
  // 两次重跑 onStart 并锁定随机数，覆盖【开怀大笑】/【忍俊不禁】两个分支。
  for(const [rnd,key,value] of [[0,'开怀大笑',p.Maze[0]],[0.99,'忍俊不禁',p.Maze[2]]]){
    for(const t of [u,m])t.buffs=t.buffs.filter(e=>e.id!==u.id+':elation-maze');
    b.random=()=>rnd;
    b.rules.onStart(b);
    for(const t of [u,m]){
      const e=t.buffs.find(x=>x.id===u.id+':elation-maze');
      assert.ok(e,key);near(e.value,value);assert.equal(e.remaining,p.Maze[4]);assert.equal(e.key,'elation');
    }
    assert.ok(b.log.some(e=>e.type==='mechanic'&&e.name==='燃起来了！'&&e.variant===key),key);
  }
});

// ───────────────────────────── 1504 不死途（雷 · 巡猎）─────────────────────────────
test('1504：初始 Talent[0] 点充能（上限 Talent[1]），战技使目标成为【饲饵】并使敌方全体防御力降低 BPSkill[3]',()=>{
  const c=config([actor(1504)]);c.units=[c.units[0],enemy({id:'e1'}),enemy({id:'e2'})];
  const b=createBattle(c);b.random=()=>0;
  const [u,e1,e2]=b.units,p=u.kit.params;
  assert.equal(u.resources['充能'],p.Talent[0]);
  // 原始脚本 DebuffShift OnEnterBattle：开场最低生命百分比敌人已是【饲饵】。
  assert.equal(b.units.filter(t=>t.side==='enemy'&&t.buffs.some(x=>x.tag==='ashveilBait')).length,1);
  b.rules.before(b,u,'skill','normal',u.actions.skill,[e2]);
  assert.ok(u.buffs,()=>true);
  assert.ok(e2.buffs.some(x=>x.tag==='ashveilBait'),'战技目标应成为饲饵');
  assert.equal(b.units.filter(t=>t.side==='enemy'&&t.buffs.some(x=>x.tag==='ashveilBait')).length,1,'饲饵只对最新目标生效');
  for(const t of [e1,e2]){
    const d=t.buffs.find(x=>x.id===u.id+':ashveil-defdown');
    assert.ok(d,`${t.id} 应获得饲饵防御力降低`);near(d.value,p.BPSkill[3]);assert.equal(d.key,'defShred');
  }
  // E6：场上存在饲饵时敌方全体全属性抗性降低 ranks[6][0]=20%（7 个元素）。
  const b6=createBattle(config([actor(1504,{eidolon:6})]));b6.random=()=>0;
  const [u6,en6]=b6.units;
  const res=en6.buffs.filter(e=>e.resReduction);
  assert.equal(res.length,7);near(res[0].value,u6.kit.ranks[6][0]);
  // 全属性抗性降低是挂在敌人身上的 resReduction，真实伤害应吃到对应穿透。
  const x=actor(1504,{eidolon:6});x.panel.speed=200;x.policy={...x.policy,basicOnly:true};
  const bx=createBattle({strict:true,maxAV:80,sp:0,maxSP:9,seed:4,critMode:'noncrit',units:[x,enemy()]});
  stepBattle(bx);
  const ev=bx.log.find(e=>e.type==='damage'&&e.actor===x.id);
  assert.ok(ev,'应造成伤害');
  assert.ok(ev.formula.find(f=>f.zone==='res').value>1,'全属性抗性降低应体现在抗性乘区');
});

test('1504：战技对已是【饲饵】的目标额外造成 BPSkill[2] 伤害并恢复 BPSkill[4] 点战技点',()=>{
  const b=createBattle(config([actor(1504)]));b.random=()=>0;
  const [u,en]=b.units,p=u.kit.params;
  // 开场饲料已是该敌人 → 第一次战技即触发额外伤害。
  assert.ok(en.buffs.some(x=>x.tag==='ashveilBait'));
  b.rules.before(b,u,'skill','normal',u.actions.skill,[en]);
  const sp0=b.sp;
  b.rules.after(b,u,'skill','normal',u.actions.skill,[en],[en]);
  const extra=dmgOf(b,u.id,'direct').filter(e=>Math.abs(baseOf(e)-combatPanel(u).atk*p.BPSkill[2])<1e-6);
  assert.equal(extra.length,1,'应额外造成 1 次 BPSkill[2] 伤害');
  near(b.sp,Math.min(b.maxSP,sp0+p.BPSkill[4]));
  // 非饲饵目标：先清掉饲饵，此时不触发额外伤害与战技点恢复。
  const b2=createBattle(config([actor(1504)]));b2.random=()=>0;
  const [u2,en2]=b2.units;
  en2.buffs=en2.buffs.filter(x=>x.tag!=='ashveilBait');
  b2.rules.before(b2,u2,'skill','normal',u2.actions.skill,[en2]);
  const sp1=b2.sp;
  b2.rules.after(b2,u2,'skill','normal',u2.actions.skill,[en2],[en2]);
  assert.equal(dmgOf(b2,u2.id,'direct').length,0);
  near(b2.sp,sp1);
  assert.equal(u2.resources['本次战技已为饲饵'],0);
});

test('1504：饲饵额外战技伤害与主伤害削韧相同（原始脚本两个 StanceValue 同哈希）',()=>{
  // 原始脚本 Avatar_Ashveil_00_Skill02_Phase02 的两个伤害节点 OnStart[5] / OnStart[9]
  // 的 StanceValue 完全一致（同一 DynamicHashes 1659254037）→ 额外伤害不应削韧为 0。
  const phase=abil('Avatar_Ashveil_00_Ability.json','Avatar_Ashveil_00_Skill02_Phase02');
  const s5=phase.OnStart[5].AttackProperty.StanceValue,s9=phase.OnStart[9].AttackProperty.StanceValue;
  assert.deepEqual(s5,s9,'主伤害与饲饵额外伤害的 StanceValue 应完全相同');
  assert.deepEqual(s5.PostfixExpr.DynamicHashes,[1659254037]);
  const raw=ROSTER_DATA[1504].skills['150402'].stance[0];
  assert.equal(raw,60);
  assert.equal(actor(1504).actions.skill.toughness,raw,'主伤害削韧同样取自 150402');
  const weak=()=>enemy({toughnessMax:1000,weaknesses:['Thunder'],standardBreak:true,rank:'normal',
    panel:{...panel(),hp:1e9,speed:1}});
  // 直接驱动 after：饲饵已就绪时，额外伤害自身应削韧 raw。
  const b=createBattle(config([actor(1504)],weak()));b.random=()=>0;
  const [u,en]=b.units;
  assert.ok(en.buffs.some(e=>e.tag==='ashveilBait'),'开场饲饵已在敌人身上');
  u.resources['本次战技已为饲饵']=1;
  const t0=en.toughness;
  b.rules.after(b,u,'skill','normal',u.actions.skill,[en],[en]);
  near(t0-en.toughness,raw,'额外伤害自身的削韧应为 raw（修复前为 0）');
  assert.equal(u.resources['本次战技已为饲饵'],0);
  // 真实战斗：主伤害（0.6 / 0.4 两段合计 raw）+ 饲饵额外伤害 raw = 2×raw。
  const x=actor(1504);x.panel.speed=200;x.policy={...x.policy,rotation:['skill']};
  const r=simulateBattle(config([x],weak(),60));
  const en2=r.units.find(t=>t.id==='enemy');
  const drops=r.log.filter(e=>e.type==='toughness'&&e.actor===x.id&&e.target===en2.id).map(e=>e.value);
  const deltas=drops.map((v,i)=>(i?drops[i-1]:1000)-v);
  assert.equal(deltas.length,3,'应为战技主伤害 2 段 + 饲饵额外伤害 1 段');
  near(deltas[0],raw*.6);near(deltas[1],raw*.4);near(deltas[2],raw,'额外伤害应追加削韧 raw');
  near(1000-en2.toughness,2*raw,'总削韧应为主伤害 + 额外伤害');
});

test('1504：天赋——饲饵被我方其他目标攻击后固定回 Talent[6] 能、消耗 Talent[2] 充能发动 10 段追加攻击并获得 Talent[4] 层婪酣',()=>{
  const b=createBattle(config([actor(1504),mate()]));b.random=()=>0;
  const [u,m,en]=b.units,p=u.kit.params;
  u.panel.energyRegen=5;u.energy=0;
  // 让敌人成为饲饵（开局已由 DebuffShift 挂上）。
  assert.ok(en.buffs.some(x=>x.tag==='ashveilBait'));
  b.rules.after(b,m,'basic','normal',m.actions.basic,[en],[en]);
  near(u.energy,p.Talent[6],'应固定回 Talent[6] 点能量（不吃回能效率）');
  assert.equal(u.resources['充能'],p.Talent[0]-p.Talent[2]);
  const q=b.queue.filter(x=>x.actor===u.id&&x.key==='followup');
  assert.equal(q.length,1);assert.equal(q[0].targetId,en.id);
  b.queue.length=0;
  b.rules.before(b,u,'followup','followup',u.actions.followup,[en]);
  assert.equal(u.resources['婪酣'],0);
  b.rules.after(b,u,'followup','followup',u.actions.followup,[en],[en]);
  assert.equal(u.resources['婪酣'],p.Talent[4],'追加攻击后应获得 Talent[4] 层婪酣');
  // 充能不足时不发动追加攻击，但能量仍然恢复。
  const b2=createBattle(config([actor(1504),mate()]));b2.random=()=>0;
  const [u2,m2,en2]=b2.units;
  u2.resources['充能']=0;u2.energy=0;
  b2.rules.after(b2,m2,'basic','normal',m2.actions.basic,[en2],[en2]);
  assert.equal(b2.queue.filter(x=>x.key==='followup').length,0);
  near(u2.energy,u2.kit.params.Talent[6]);
  // 攻击者是不死途自己时不触发。
  b2.rules.after(b2,u2,'basic','normal',u2.actions.basic,[en2],[en2]);
  near(u2.energy,u2.kit.params.Talent[6]);
});

test('1504：终结技后立即发动强化天赋追加攻击——每次消耗 Ultra[2]=4 层婪酣多 1 次，E2 返还 35%',()=>{
  const b=createBattle(config([actor(1504,{eidolon:4})]));b.random=()=>0;
  const [u,en]=b.units,p=u.kit.params;
  u.resources['婪酣']=9;
  u.resources['充能']=0;
  b.rules.before(b,u,'ultimate','ultimate',u.actions.ultimate,[en]);
  const e4=u.buffs.find(e=>e.id===u.id+':ashveil-e4');
  assert.ok(e4);near(e4.value,u.kit.ranks[4][0]);assert.equal(e4.remaining,u.kit.ranks[4][1]);
  const lazeBefore=u.resources['婪酣'];
  assert.equal(lazeBefore,9+u.kit.trace[1][1],'终结技应叠加 trace[1] 层婪酣');
  b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[en],[en]);
  const insert=dmgOf(b,u.id,'followup');
  const consumed=Math.floor(lazeBefore/p.Ultra[2])*p.Ultra[2];
  assert.equal(insert.length,(1+consumed/p.Ultra[2])*10,'应为 1+2 次 × 10 段追加重击');
  // 第 1 次本体用 Talent[3]，其余额外次数用 Ultra[3]（两者只保证「同一等级」数值相同，
  // E3 只抬终结技等级、E5 才抬天赋等级，因此高星魂下两者可以不同）。
  const atk0=combatPanel(u).atk;
  for(const e of insert.slice(0,10))near(baseOf(e),atk0*p.Talent[3]*0.1);
  for(const e of insert.slice(10))near(baseOf(e),atk0*p.Ultra[3]*0.1);
  assert.notEqual(p.Talent[3],p.Ultra[3],'E3 只提升终结技等级，此处应体现 Talent/Ultra 等级差');
  assert.equal(u.resources['婪酣'],lazeBefore-consumed+Math.floor(consumed*u.kit.ranks[2][1]),'E2 应返还 35% 已移除层数');
  assert.equal(u.resources['充能'],p.Ultra[1],'终结技后应获得 Ultra[1] 点充能');
  // 婪酣 <4（叠加 trace[1] 后仍 <4）时不产生额外次数。
  const b2=createBattle(config([actor(1504,{eidolon:2})]));b2.random=()=>0;
  const [u2,en2]=b2.units;
  u2.resources['婪酣']=1;
  b2.rules.before(b2,u2,'ultimate','ultimate',u2.actions.ultimate,[en2]);
  b2.rules.after(b2,u2,'ultimate','ultimate',u2.actions.ultimate,[en2],[en2]);
  assert.equal(dmgOf(b2,u2.id,'followup').length,10);
  assert.equal(u2.resources['婪酣'],1+u2.kit.trace[1][1],'不足 4 层不应被消耗');
});

test('1504：强化天赋追击过程中目标阵亡时，饲饵转移到最低生命百分比敌人并继续（行迹 point06 每次致命 +1 层婪酣）',()=>{
  const c=config([actor(1504)]);c.units=[c.units[0],enemy({id:'weak',panel:{...panel(),hp:1000,speed:1}}),enemy({id:'strong',panel:{...panel(),hp:1e9,speed:1}})];
  const b=createBattle(c);b.random=()=>0;
  const [u,weak,strong]=b.units,p=u.kit.params;
  // 只让 weak 持有饲饵。
  for(const t of b.units)t.buffs=t.buffs.filter(x=>x.tag!=='ashveilBait');
  b.rules.before(b,u,'skill','normal',u.actions.skill,[weak]);
  assert.ok(weak.buffs.some(x=>x.tag==='ashveilBait'));
  u.resources['婪酣']=9;
  u.resources['婪酣累计获得']=0;
  weak.hp=1;                                   // 一次追击即致命
  b.rules.before(b,u,'ultimate','ultimate',u.actions.ultimate,[weak]);
  b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[weak],[weak]);
  assert.ok(!weak.buffs.some(x=>x.tag==='ashveilBait'),'阵亡目标应失去饲饵');
  assert.ok(strong.buffs.some(x=>x.tag==='ashveilBait'),'最低生命百分比敌人应成为新饲饵');
  const toStrong=dmgOf(b,u.id,'followup').filter(e=>e.target==='strong');
  assert.ok(toStrong.length>0,'追加攻击应继续命中新饲饵');
  assert.ok((u.resources['婪酣累计获得']??0)>=1,'行迹 point06 应在致命攻击时 +trace[3] 层婪酣');
  void p;
});

test('1504：行迹 point07 追加攻击 +80% 且每层婪酣 +10%；point08 我方暴伤 +40%、追加攻击再 +80%',()=>{
  const b=createBattle(config([actor(1504),mate()]));b.random=()=>0;
  const [u,m,en]=b.units,t7=u.kit.trace[2],t8=u.kit.trace[3];
  assert.deepEqual(t7,[.8,1,.1]);assert.deepEqual(t8,[.4,.8]);
  u.resources['婪酣']=5;
  near(b.rules.modifiers(b,u,en,{type:'Talent'},'followup').dmgBoost,t7[0]+t7[2]*5);
  near(b.rules.modifiers(b,u,en,{type:'Ultra'},'direct').dmgBoost??0,0);
  near(b.rules.modifiers(b,u,en,{type:'Normal'},'direct').critDmg,t8[0]);
  near(b.rules.modifiers(b,u,en,{type:'Talent'},'followup').critDmg,t8[0]+t8[1]);
  near(b.rules.modifiers(b,m,en,{type:'Normal'},'direct').critDmg,t8[0],'队友也应获得头狼暴伤');
});

test('1504：E1 敌方全体受伤 +24%，生命百分比 ≤50% 时提高至 36%；E6 每累计 1 层婪酣 +4% 增伤（≤30 层）',()=>{
  const b=createBattle(config([actor(1504,{eidolon:6})]));b.random=()=>0;
  const [u,en]=b.units,r=u.kit.ranks;
  near(b.rules.modifiers(b,u,en,{type:'Normal',element:'Thunder'},'direct').vuln,r[1][0]);
  en.hp=combatPanel(en).hp*r[1][1];
  near(b.rules.modifiers(b,u,en,{type:'Normal',element:'Thunder'},'direct').vuln,r[1][2]);
  en.hp=combatPanel(en).hp;
  assert.equal(u.resources['婪酣累计获得'],0);
  // 通过天赋触发累计。
  const mateU=b.units.find(x=>x.side==='ally'&&x!==u)??null;
  void mateU;
  u.resources['婪酣']=0;u.resources['婪酣累计获得']=0;
  b.rules.before(b,u,'ultimate','ultimate',u.actions.ultimate,[en]);
  b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[en],[en]);
  const acc=u.resources['婪酣累计获得'];
  assert.ok(acc>=u.kit.trace[1][1]);
  near(b.rules.modifiers(b,u,en,{type:'Normal',element:'Thunder'},'direct').dmgBoost,r[6][1]*Math.min(r[6][2],acc));
  u.resources['婪酣累计获得']=999;
  near(b.rules.modifiers(b,u,en,{type:'Normal',element:'Thunder'},'direct').dmgBoost,r[6][1]*r[6][2]);
});

test('1504：秘技对敌方全体造成 Maze[1] 攻击力雷伤并获得 Maze[2] 点充能',()=>{
  const c=config([actor(1504,{technique:true})]);
  c.units=[c.units[0],enemy({id:'e1'}),enemy({id:'e2'})];
  const b=createBattle(c);b.random=()=>0;
  const [u]=b.units,p=u.kit.params;
  const tech=dmgOf(b,u.id,'technique');
  assert.equal(tech.length,2,'秘技应对每个敌人各造成 1 次伤害');
  for(const e of tech)near(baseOf(e),combatPanel(u).atk*p.Maze[1]);
  assert.equal(u.resources['充能'],p.Talent[0]+p.Maze[2]);
});

// ───────────────────────────── 集成：真实严格战斗 ─────────────────────────────
test('第16批 6 名角色与既有四人体系混编可完成组件试算（已知缺口角色显式近似）',()=>{
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

test('第16批 角色在多波次组件试算中处理换波 / 阵亡 / 持续伤害与时序（缺口保留并显式披露）',()=>{
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

test('第16批 开拓者（存护）在真实战斗中护盾 / 强化普攻 / 嘲讽链路可跑通',()=>{
  const x=actor(8003,{eidolon:6}),ar=actor(1015),s=actor(1306),ce=actor(1412);
  x.id='focus';x.energy=x.energyMax;x.policy={...x.policy,autoUltimate:true,allyTargetId:ar.id};
  s.policy.allyTargetId=ar.id;ce.policy.allyTargetId=ar.id;
  const c={strict:true,maxAV:300,sp:3,maxSP:9,seed:11,critMode:'expected',requiredAllies:4,units:[x,s,ar,ce,enemy()]};
  const r=simulateBattle(c);
  assert.ok(r.log.some(e=>e.type==='shield'&&e.name==='筑城者遗宝'),'真实战斗中应产生护盾');
  assert.ok(r.log.some(e=>e.type==='action'&&e.actor===x.id&&e.key==='ultimate'));
  assert.ok(r.log.some(e=>e.type==='action'&&e.actor===x.id&&e.key==='skill'));
  const last=r.log.at(-1).frame.units.find(u=>u.id===x.id);
  assert.ok(last.resources['灼热意志']<=x.kit.params.Talent[2]);
});

test('第16批 不死途在真实战斗中触发追加攻击链与饲饵转移',()=>{
  const x=actor(1504,{eidolon:6}),s=actor(1306),ar=actor(1015),ce=actor(1412);
  x.id='focus';x.energy=x.energyMax;x.policy={...x.policy,autoUltimate:true,allyTargetId:ar.id};
  s.policy.allyTargetId=ar.id;ce.policy.allyTargetId=ar.id;
  const c={strict:true,maxAV:400,sp:3,maxSP:9,seed:5,critMode:'expected',requiredAllies:4,units:[x,s,ar,ce,enemy()]};
  const r=simulateBattle(c);
  assert.ok(r.log.some(e=>e.type==='action'&&e.actor===x.id&&e.kind==='followup'),'应触发天赋追加攻击');
  assert.ok(r.log.some(e=>e.type==='damage'&&e.actor===x.id&&e.kind==='followup'),'追加攻击应造成伤害');
  const bait=r.log.some(e=>e.type==='mechanic'&&e.name==='饲饵');
  assert.ok(bait,'应记录饲饵的施加 / 转移');
});

console.log(`DeepSeek batch16 checks: ${passed} passed, ${failed} failed.`);if(failed)process.exitCode=1;
