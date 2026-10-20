// DeepSeek 第 15 批：欢愉命途 6 名角色（1501 火花 / 1502 爻光 / 1503 真珠 / 1505 绯英 /
// 1506 银狼LV.999 / 1513 砂金•戏浪）的机制测试。
//
// 期望值全部由 4.6 编译出的 kit 参数（params / trace / ranks）与 ROSTER_DATA 的强化形态技能记录推导，
// 不写死倍率；时序用 b.rules.before / after / afterHit / afterDamage / onTurnStart / onWaveStart
// 直接驱动，数值用伤害事件的 base 乘区（= 攻击力 / 防御力 × 倍率 × 分段比例）核对。
//
// 三个「来源缺口」在本文件里都有对应的**负向**断言（缺口存在才通过）：
//   ① 欢愉附加伤害（kind='elation'）通过等级基值与好活当赏乘区结算，不能误用攻击力或队伍笑点；
//   ② 欢愉技（type='ElationDamage'）不在 ROSTER_DATA / u.kit.params 里；
//   ③ 1503 真珠的原始脚本 Avatar_Pearl_00_Ability.json 在固定提交不存在（并逐个核对目录）。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createContext} from '../core/ctx.mjs';
import {newBattleBuild,buildBattleActor} from '../simulator/builds.mjs';
import {createBattle as rawCreateBattle,receiveDamage,stepBattle,simulateBattle as rawSimulateBattle,validateBattle as rawValidateBattle,combatPanel} from '../simulator/engine.mjs';
const validateBattle=c=>rawValidateBattle(partialMechanicsFixture(c));
import {partialMechanicsFixture,assertFixtureDisclosure} from './partial-mechanics-fixtures.mjs';
const createBattle=c=>{const b=rawCreateBattle(partialMechanicsFixture(c));
  // Role callbacks below are isolated unit fixtures. The shared battle-entry state is covered by
  // test_codex_aha_action_bar.mjs and end-to-end simulateBattle remains unmodified.
  for(const u of b.units){const starts=u.buffs.filter(e=>e.source==='battle:start'&&e.tag==='punchline');
    if(!starts.length)continue;const removed=starts.reduce((n,e)=>n+(e.stacks??0),0);
    u.buffs=u.buffs.filter(e=>!starts.includes(e));u.resources['好活当赏']=Math.max(0,(u.resources['好活当赏']??0)-removed);if(u.resources['好活当赏']===0)delete u.resources['好活当赏'];
    if('能量快照'in u.resources)u.resources['能量快照']=u.energy;if('好活当赏快照'in u.resources)u.resources['好活当赏快照']=u.resources['好活当赏']??0;}
  return b;};
const simulateBattle=c=>rawSimulateBattle(partialMechanicsFixture(c));
import {validateKitActor} from '../simulator/kits.mjs';
import {ROSTER_DATA} from '../simulator/roster-data.mjs';
import {BREAK_BASE} from '../simulator/game-data.mjs';
import {SET_TABLES} from '../simulator/game-data.mjs';
import {IDS} from '../simulator/characters/extra/batch15.mjs';
import {KNOWN_MECHANICS_GAPS} from '../simulator/mechanics-status.mjs';
import {EXTRA_IDS,EXTRA_FACTORIES,EXTRA_ACTIONS} from '../simulator/characters/extra/index.mjs';

const data=JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url))),ctx=createContext(data);
const near=(a,b,m=1e-6,msg)=>{if(typeof m!=='number'){msg=m;m=1e-6;}assert.ok(Math.abs(a-b)<m,`${a} != ${b}${msg?' ('+msg+')':''}`);};
const panel=()=>({hp:10000,atk:1000,def:1000,speed:100,critRate:.5,critDmg:1,energyRegen:1,effectHit:0,effectRes:0,breakEffect:0,baseStats:{hp:1000,atk:1000,def:1000},elemDmg:{},elation:0});
const actor=(id,extra={})=>{const a=buildBattleActor(ctx,{...newBattleBuild(),characterId:id,relicAuto:false,panel:panel(),...extra});a.energy=0;a.policy={...a.policy,autoUltimate:false};return a;};
const enemy=(extra={})=>({id:'enemy',name:'规则训练敌人',side:'enemy',level:90,element:'Physical',panel:{...panel(),hp:1e9,speed:1},energy:0,energyMax:0,res:{},
  actions:{basic:{name:'测试攻击',type:'Normal',terms:[{scaling:'atk',multiplier:1}],hitEnergy:10}},policy:{autoUltimate:false,basicOnly:true},...extra});
const mate=(extra={})=>({id:'mate',name:'测试队员',side:'ally',level:80,element:'Physical',panel:{...panel(),speed:1},energy:0,energyMax:100,
  actions:{basic:{name:'测试普攻',type:'Normal',terms:[{scaling:'atk',multiplier:1}],spGain:1,energyGain:20,toughness:30},
    skill:{name:'测试战技',type:'BPSkill',terms:[{scaling:'atk',multiplier:1}],spCost:1,energyGain:30,toughness:60}},policy:{autoUltimate:false,basicOnly:true},...extra});
const config=(units,maxAV=201,sp=3)=>({strict:true,maxAV,sp,maxSP:9,seed:42,critMode:'noncrit',units:[...units,enemy()]});
const force=(b,u,key)=>{for(const t of b.units)t.distance=100000;u.distance=0;u.policy={...u.policy,turnPlan:[{turn:u.turns+1,key}]};stepBattle(b);};
const baseOf=ev=>ev.formula.find(f=>f.zone==='base').value;
const initialPunchline=b=>b.units.filter(u=>u.side==='ally'&&u.path==='欢愉'&&u.actions?.elation).length;
const elationBaseOf=(u,mult,punch=u.resources['好活当赏']??0)=>BREAK_BASE[u.level]*2*mult*(1+(combatPanel(u).elation??0))*(1+5*punch/(punch+240));
const dmgOf=(b,id,kind)=>b.log.filter(e=>e.type==='damage'&&e.actor===id&&(kind?e.kind===kind:true));
const plist=(id,skillId,level)=>ROSTER_DATA[id].skills[String(skillId)].params[String(level)].param_list;
const elationHits=(b,id)=>b.log.filter(e=>e.type==='damage'&&e.kind==='elation'&&(id==null||e.actor===id));
let passed=0,failed=0,skipped=0;const test=(name,fn)=>{try{if(fn()==='SKIP_OPTIONAL_FIXTURE'){skipped++;console.log('SKIP '+name+'：缺少可选 strict_research 夹具');return;}passed++;console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+'\n'+e.stack);}};

// ───────────────────────── 合同 / 加载 ─────────────────────────
test('batch15 注册 6 名欢愉角色，工厂与动作表齐备',()=>{
  assert.deepEqual([...IDS].sort((a,b)=>a-b),[1501,1502,1503,1505,1506,1513]);
  for(const id of IDS){
    assert.ok(EXTRA_IDS.includes(id),id+' 未登记');
    assert.equal(typeof EXTRA_FACTORIES[id],'function');
    assert.equal(typeof EXTRA_ACTIONS[id],'function');
    assert.equal(ROSTER_DATA[id].path,'欢愉',id+' 命途应为欢愉');
  }
});

test('batch15 6 名角色 E0～E6 动作合同可编译、每个角色都有带倍率的动作、且不能篡改倍率',()=>{
  for(const id of IDS)for(let eidolon=0;eidolon<=6;eidolon++){
    const a=actor(id,{eidolon});
    assert.deepEqual(validateKitActor(a),[],id+' E'+eidolon);
    assert.deepEqual(a.unsupported,[]);
    const key=Object.keys(a.actions).find(k=>(a.actions[k]?.terms??[]).length);
    assert.ok(key,id+' 没有任何带倍率的动作');
    a.actions[key].terms[0].multiplier=99;
    assert.ok(validateKitActor(a).length,id+' 篡改倍率未被发现');
  }
});

test('1503 真珠的来源缺口：Avatar_Pearl_00_Ability.json 在固定提交不存在（blocked_source）',()=>{
  const dir=new URL('../_data_cache/strict_research/',import.meta.url);
  if(!fs.existsSync(new URL('AvatarConfig.json',dir))){return 'SKIP_OPTIONAL_FIXTURE';}
  const cfg=JSON.parse(fs.readFileSync(new URL('AvatarConfig.json',dir),'utf8'));
  const pearl=cfg.filter(r=>String(r.JsonPath).includes('Avatar_Pearl_'));
  assert.equal(pearl.length,1,'AvatarConfig 应登记 Pearl 的 Config 路径');
  assert.ok(String(pearl[0].JsonPath).endsWith('Avatar_Pearl_00_Config.json'));
  assert.ok(!fs.existsSync(new URL('Avatar_Pearl_00_Ability.json',dir)),'Ability 脚本缺失这一事实是本批的前提');
  assert.ok(!fs.existsSync(new URL('Avatar_Pearl_00_Config.json',dir)),'Config 也没有缓存，无法从它反推技能');
  // 5 个有脚本的角色必须真实存在，否则上面的“缺失”结论不成立。
  for(const f of ['Avatar_Sparxie_00_Ability.json','Avatar_YaoGuang_00_Ability.json','Avatar_Evanescia_00_Ability.json','Avatar_SilverWolf999_00_Ability.json','Avatar_AventurineW_00_Ability.json'])
    assert.ok(fs.existsSync(new URL(f,dir)),f+' 应存在');
  // 1503 的所有动作都只能用未核对的 hitShares:[1]。
  const a=actor(1503);
  for(const key of Object.keys(a.actions))assert.deepEqual(a.actions[key].hitShares,[1],'1503.'+key+' 必须保持未核对的单段');
});

// ───────────────────────── 段数（原始脚本）─────────────────────────
test('段数与原始 Ability 脚本一致：火花 4 段强化普攻、爻光 4 段普攻、绯英 4+1 段战技、砂金 4 段普攻',()=>{
  const sx=actor(1501),yg=actor(1502),ev=actor(1505),aw=actor(1513),sw=actor(1506);
  // Avatar_Sparxie_00_Skill11_Phase02：两条 Normal（各 1）→ 等分归一
  assert.deepEqual(sx.actions.enhancedBasic.hitShares,[.25,.25,.25,.25]);
  assert.equal(sx.actions.enhancedBasic.terms[1].target,'adjacent');
  assert.deepEqual(sx.actions.basic.hitShares,[1]);                     // Skill01_Phase02 1 段
  // GlobalTemplates 1502_Skill01_Attack(_End)：HitSplitRatio 0.25，include 4 次
  assert.deepEqual(yg.actions.basic.hitShares,[.25,.25,.25,.25]);
  assert.equal(yg.actions.basic.target,'blast');
  assert.equal(yg.actions.basic.energyGain,30);                          // desc「普攻恢复的能量提高至 30 点」
  // Avatar_Evanescia_00_Skill02_Phase02：主目标 0.2/0.2/0.2/0.4 + 相邻 1 段
  assert.deepEqual(ev.actions.skill.hitShares,[.2,.2,.2,.4]);
  assert.equal(ev.actions.skill.terms[1].target,'adjacent');
  assert.deepEqual(ev.actions.followup.hitShares,[1]);                   // Insert_Phase02：AllEnemy 1 段
  assert.equal(ev.actions.followup.type,'Talent');
  // Avatar_AventurineW_00_Skill01_Phase02：HitSplitRatio 0.25 ×4
  assert.deepEqual(aw.actions.basic.hitShares,[.25,.25,.25,.25]);
  assert.equal(sw.actions.skill.target,'all');                           // Skill02_Phase02 AllEnemy
  assert.equal(sw.actions.basic.energyGain,0);                           // spBase=null：能量即【隐藏分】
  assert.equal(sw.energyMax,sw.kit.params.Talent[0]);                    // 60 = 隐藏分激活阈值
  for(const a of [sx,yg,ev,aw,sw])for(const key of Object.keys(a.actions)){
    // 1506 强化普攻是“1 段 + 99 次弹射”，hitShares 仍应为 1。
    near(a.actions[key].hitShares.reduce((x,y)=>x+y,0),1,1e-9,key);
  }
});

// ───────────────────────── 1501 火花 ─────────────────────────
test('火花：战技开启直播连线并发动 1 次互动陷阱，强化普攻按 #4/#5 提高倍率且 4 段、能量 40',()=>{
  const b=createBattle(config([actor(1501)]));b.random=()=>0;
  const [u]=b.units;
  assert.equal(u.resources['直播连线'],0);
  b.rules.after(b,u,'skill','normal',u.actions.skill,[u],[]);
  assert.equal(u.resources['直播连线'],1);
  assert.equal(u.resources['互动陷阱'],1);
  const P=u.kit.params,T=plist(1501,150109,u.kit.skillLevels.BPSkill);
  const a=b.rules.prepare(b,u,'basic','normal',u.actions.basic);
  assert.equal(a.name,plist(1501,150108,u.kit.skillLevels.Normal)&&ROSTER_DATA[1501].skills['150108'].name);
  assert.deepEqual(a.hitShares,[.25,.25,.25,.25]);
  near(a.terms[0].multiplier,plist(1501,150108,u.kit.skillLevels.Normal)[0]+T[3]*1);
  near(a.terms[1].multiplier,plist(1501,150108,u.kit.skillLevels.Normal)[1]+T[4]*1);
  assert.equal(a.energyGain,ROSTER_DATA[1501].skills['150108'].spBase);
  assert.ok(P.BPSkill[0]>=1);
  // 第二次战技把互动陷阱推到 2，倍率随之再加一档
  b.rules.after(b,u,'skill','normal',u.actions.skill,[u],[]);
  const a2=b.rules.prepare(b,u,'basic','normal',u.actions.basic);
  near(a2.terms[0].multiplier,plist(1501,150108,u.kit.skillLevels.Normal)[0]+T[3]*2);
});

test('火花：终结技倍率 = #2 + #3×欢愉度（desc 原文），且行迹 point06 按攻击力换算欢愉度、上限 #4',()=>{
  const b=createBattle(config([actor(1501)]));b.random=()=>0;
  const [u]=b.units,p=u.kit.params,T=u.kit.trace['1'];
  u.panel.elation=.4;u.panel.atk=1000;
  near(combatPanel(u).elation,.4,'atk 未达 #1 时不应有行迹欢愉度');
  const a=b.rules.prepare(b,u,'ultimate','ultimate',u.actions.ultimate);
  near(a.terms[0].multiplier,p.Ultra[1]+p.Ultra[2]*.4);
  u.panel.atk=T[0];
  near(combatPanel(u).elation,.4);
  u.panel.atk=T[0]+T[1]*4;
  near(combatPanel(u).elation,.4+T[2]*4);
  u.panel.atk=999999;
  near(combatPanel(u).elation,.4+T[3],'行迹欢愉度应封顶 #4');
});

test('火花：天赋欢愉伤害只在持有好活当赏时结算，每 1 次互动陷阱额外 1 次 #1',()=>{
  const c=config([actor(1501)]);c.units.push(enemy({id:'enemy-2'}));
  const b=createBattle(c);b.random=()=>0;
  const [u,en,en2]=b.units,p=u.kit.params;
  b.rules.after(b,u,'skill','normal',u.actions.skill,[u],[]);
  b.rules.after(b,u,'skill','normal',u.actions.skill,[u],[]);   // 互动陷阱 = 2
  const a=b.rules.prepare(b,u,'basic','normal',u.actions.basic);
  b.rules.after(b,u,'basic','normal',a,[en],[en,en2]);
  assert.equal(elationHits(b).length,0,'没有好活当赏时不应结算天赋欢愉伤害');
  assert.equal(u.resources['直播连线'],0,'结算后连线应关闭');
  // 再开两次连线（上一次结算已把互动陷阱清零），这次带好活当赏
  b.rules.after(b,u,'skill','normal',u.actions.skill,[u],[]);
  b.rules.after(b,u,'skill','normal',u.actions.skill,[u],[]);
  u.resources['好活当赏']=10;
  const a2=b.rules.prepare(b,u,'basic','normal',u.actions.basic);
  const n0=elationHits(b).length;
  b.rules.after(b,u,'basic','normal',a2,[en],[en,en2]);
  const hits=elationHits(b).slice(n0);
  assert.equal(hits.length,4,'1 次单体 + 1 次相邻 + 2 次互动陷阱');
  const bases=hits.map(baseOf).sort((x,y)=>x-y);
  const E=plist(1501,150108,u.kit.skillLevels.Normal),T=plist(1501,150109,u.kit.skillLevels.BPSkill);
  near(bases[0],elationBaseOf(u,p.Talent[3]));            // 一次相邻 #4
  near(bases[1],elationBaseOf(u,p.Talent[0]));            // 互动陷阱 ×2，每次 #1
  near(bases[2],elationBaseOf(u,p.Talent[0]));
  near(bases[3],elationBaseOf(u,p.Talent[2]));            // 一次单体 #3
  // 互动陷阱同时把强化普攻本体的倍率提高 #4/#5（由 prepare 注入）
  near(a2.terms[0].multiplier,E[0]+T[3]*2);
  near(a2.terms[1].multiplier,E[1]+T[4]*2);
});

test('火花 Point07：1/2/3+名欢愉队友分别按正确档位获得笑点/爆点；E4额外奖励仍生效',()=>{
  const party=[1502,1505,1506];
  for(const count of [1,2,3,4]){
    const units=[actor(1501),...party.slice(0,count-1).map(id=>actor(id))];
    const b=createBattle(config(units));b.random=()=>0;
    const [u]=b.units,p=u.kit.params,T=u.kit.trace['2'],tier=Math.min(3,count)-1;
    b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[b.units.at(-1)],[b.units.at(-1)]);
    near(b.laughter.ally,initialPunchline(b)+p.Ultra[0]+T[tier],count+'名欢愉队友的笑点档位错误');
    assert.equal(u.resources['爆点'],T[3+tier],count+'名欢愉队友的爆点档位错误');
  }
  const b=createBattle(config([actor(1501,{eidolon:4}),actor(1502),actor(1505)]));b.random=()=>0;
  const [u]=b.units,p=u.kit.params,T=u.kit.trace['2'];
  b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[b.units.at(-1)],[b.units.at(-1)]);
  near(b.laughter.ally,initialPunchline(b)+p.Ultra[0]+T[2]+u.kit.ranks[4][0]);
  assert.equal(u.resources['爆点'],T[5]);
  near(u.buffs.find(e=>e.id===u.id+':e4-elation').value,u.kit.ranks[4][1]);
  assert.equal(u.buffs.find(e=>e.id===u.id+':e4-elation').remaining,u.kit.ranks[4][2]);
});

test('欢愉队伍人数按编队计算：阵亡欢愉队友不降低火花奖励档位',()=>{
  const b=createBattle(config([actor(1501),actor(1502),actor(1505),actor(1506)]));
  const u=b.units.find(t=>t.kit?.characterId===1501),dead=b.units.find(t=>t.kit?.characterId===1502);
  dead.hp=0;dead.active=false;
  const before=b.laughter.ally,T=u.kit.trace['2'],tier=2;
  b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[b.units.at(-1)],[b.units.at(-1)]);
  near(b.laughter.ally,before+u.kit.params.Ultra[0]+T[tier],'四名欢愉角色的行迹档位不应因一人阵亡降级');
  assert.equal(u.resources['爆点'],T[3+tier]);
});

test('火花 E6：全属性抗性穿透只加给火花本人，队友仅保留 E1 的队伍增益',()=>{
  const b=createBattle(config([actor(1501,{eidolon:6}),actor(1502)])),u=b.units[0],mate=b.units[1],enemyUnit=b.units.at(-1);
  const self=b.rules.modifiers(b,u,enemyUnit,u.actions.basic,'direct');
  const teammate=b.rules.modifiers(b,mate,enemyUnit,mate.actions.basic,'direct');
  const e1=Math.min(u.kit.ranks[1][2],b.laughter.ally*u.kit.ranks[1][1]);
  near(self.resPen,e1+u.kit.ranks[6][2]);
  near(teammate.resPen,e1,'E6 文字未声明全队，不能把自身抗穿加给队友');
});

test('火花 E2：阿哈结束时首选目标阵亡，会把额外回合改派给存活目标',()=>{
  const u=actor(1501,{eidolon:2}),first=enemy({id:'sparkle-e2-dead'}),second=enemy({id:'sparkle-e2-live'});
  const b=createBattle({...config([]),units:[u,first,second]}),sparkle=b.units[0],dead=b.units[1];
  dead.hp=0;dead.active=false;b.ahaCount=1;b.ahaCounted=20;
  b.rules.after(b,sparkle,'basic','normal',sparkle.actions.basic,[dead],[dead]);
  const queued=b.queue.find(q=>q.actor===sparkle.id&&q.kind==='extra');
  assert.ok(queued,'E2 应保留额外回合');
  assert.equal(queued.targetId,b.units[2].id,'自动额外回合目标必须仍存活');
});

test('火花 E6：欢愉技每计入 1 个笑点增加 1 次弹射，最多 40 次；固定阿哈只按本次计入值',()=>{
  const run=(eidolon,{natural=false,counted=3,shared=90}={})=>{
    const b=createBattle(config([actor(1501,{eidolon})]));b.random=()=>0;
    const u=b.units[0],base=u.actions.elation.bounceCount??0;
    b.aha.active=false;
    b.laughter.ally=shared;
    b.ahaInstant={id:73,natural,fixedPunchline:counted,ending:false,participants:[u.id],completed:[],deferred:[]};
    b.queue.push({actor:u.id,key:'elation',kind:'aha',ahaInstantId:73});
    for(const unit of b.units)unit.distance=1e6;
    u.distance=0;
    assert.equal(stepBattle(b),true);
    return {b,u,base,hits:elationHits(b,u.id).length};
  };
  const base=run(0,{counted:3});
  assert.equal(base.hits,base.base+1,'E0 不应获得 E6 额外弹射');
  const fixed=run(6,{counted:3,shared:90});
  assert.equal(fixed.hits,fixed.base+4,'本次固定计入3点，E6 应在基础弹射上增加3次');
  const capped=run(6,{natural:true,shared:100});
  assert.equal(capped.hits,capped.base+41,'自然阿哈计入100点时 E6 额外弹射封顶40次，另含主段');
});

test('火花：爆点抵扣战技点消耗并触发 E2 暴击伤害叠层（最多 #4 层、持续 #3 回合）',()=>{
  const b=createBattle(config([actor(1501,{eidolon:2})]));b.random=()=>0;
  const [u]=b.units;
  u.resources['爆点']=3;
  b.sp=3;
  // 隔离技能自身回点与礼包小奖，只观察爆点抵扣是否会额外返还 SP。
  u.actions.skill.spGain=0;
  b.random=()=>.9;
  // 必须走真实引擎动作：爆点抵扣发生在 useAction 的 SP 拆分阶段。
  const en=b.units.find(x=>x.side==='enemy');
  for(const x of b.units)x.distance=100000;
  b.aha.distance=100000;
  b.queue.push({actor:u.id,key:'skill',kind:'extra',targetId:en.id});
  stepBattle(b);
  assert.equal(u.resources['爆点'],2,'战技应消耗 1 个爆点');
  assert.equal(b.sp,3,'爆点抵扣后不应额外返还战技点');
  const e=u.buffs.find(x=>x.id===u.id+':e2-crit');
  near(e.value,u.kit.ranks[2][1]);
  assert.equal(e.remaining,u.kit.ranks[2][2]);
  for(let i=0;i<10;i++)b.rules.before(b,u,'skill','normal',{...u.actions.skill,spCost:1,spSubstituteUsed:1},[u]);
  assert.ok((u.buffs.find(x=>x.id===u.id+':e2-crit')?.stacks??0)<=u.kit.ranks[2][3]);
});

test('火花：「阿哈时刻结束时」按 b.ahaCount 只结算一次（E1 给 5 笑点、E2 给额外回合与 2 爆点）',()=>{
  const b=createBattle(config([actor(1501,{eidolon:2}),actor(1502)]));b.random=()=>0;
  const [u]=b.units;
  b.ahaCount=1;b.ahaCounted=20;
  b.rules.after(b,u,'basic','normal',u.actions.basic,[b.units[2]],[b.units[2]]);
  assert.equal(b.queue.filter(q=>q.actor===u.id&&q.kind==='extra').length,1,'E2 应给出 1 个额外回合');
  assert.equal(u.resources['爆点'],u.kit.ranks[2][0]);
  b.queue.length=0;
  b.rules.after(b,u,'basic','normal',u.actions.basic,[b.units[2]],[b.units[2]]);
  assert.equal(b.queue.filter(q=>q.kind==='extra').length,0,'同一个阿哈时刻不应重复结算');
});

test('火花 E2：阿哈结束时全灭，额外回合暂存并在下一波入场后执行',()=>{
  const u=actor(1501,{eidolon:2});
  const first=enemy({id:'sparkle-e2-wave1'}),second=enemy({id:'sparkle-e2-wave2',wave:2});
  const b=createBattle({strict:true,maxAV:201,sp:3,maxSP:9,seed:42,critMode:'noncrit',units:[u,first,second]});
  const sparkle=b.units[0],dead=b.units.find(x=>x.id===first.id);
  dead.hp=0;dead.alive=false;
  b.ahaCount=1;b.ahaCounted=20;
  b.rules.after(b,sparkle,'basic','normal',sparkle.actions.basic,[dead],[dead]);
  assert.equal(sparkle.resources['火花 E2待插入回合'],1,'全灭时应保存插入动作');
  assert.equal(b.queue.some(q=>q.actor===sparkle.id&&q.kind==='extra'),false,'无存活敌人时不应排入会被换波清除的动作');
  assert.equal(stepBattle(b),true,'下一波应继续行动');
  assert.equal(sparkle.resources['火花 E2待插入回合'],0,'波次开始后应消费保存标记');
  assert.ok(b.log.some(e=>e.type==='action'&&e.actor===sparkle.id&&e.key==='basic'&&e.kind==='extra'),
    '保存的 E2 额外普攻应在下一波入场后真实执行');
});

// ───────────────────────── 1502 爻光 ─────────────────────────
test('爻光：战技展开 3 回合结界，结界把「爻光欢愉度×#2」加到我方全体（含爻光自己）',()=>{
  const b=createBattle(config([actor(1502),mate()]));b.random=()=>0;
  const [u,m]=b.units;
  u.panel.speed=200;
  const own=u.kit.trace['1'];
  const selfElation=own[1]+Math.min(own[4],(200-own[0])/own[2])*own[3];
  near(combatPanel(u).elation,selfElation);
  b.rules.before(b,u,'skill','normal',u.actions.skill,[u]);
  b.rules.after(b,u,'skill','normal',u.actions.skill,[u],[]);
  const f=u.buffs.find(e=>e.tag==='ygField');
  assert.ok(f);assert.equal(f.remaining,u.kit.params.BPSkill[0]);
  near(combatPanel(u).elation,selfElation*(1+u.kit.params.BPSkill[1]));
  near(combatPanel(m).elation,selfElation*u.kit.params.BPSkill[1]);
});

test('爻光：E2 使结界期间我方速度 +#2 与欢愉度 +#1',()=>{
  const b=createBattle(config([actor(1502,{eidolon:2}),mate()]));b.random=()=>0;
  const [u,m]=b.units;u.panel.speed=100;
  b.rules.after(b,u,'skill','normal',u.actions.skill,[u],[]);
  near(combatPanel(m).speed,m.panel.speed*(1+u.kit.ranks[2][1]),1e-6);
  const own=u.kit.trace['1'],base=own[1];
  near(combatPanel(m).elation,base*u.kit.params.BPSkill[1]+u.kit.ranks[2][0]);
});

test('爻光：终结技给 #1 笑点、我方抗穿 +#2 持续 #3 回合，并让阿哈额外回合固定计入 #4 笑点',()=>{
  const b=createBattle(config([actor(1502),mate()]));b.random=()=>0;
  const [u,m,en]=b.units,p=u.kit.params;
  b.rules.before(b,u,'ultimate','ultimate',u.actions.ultimate,[u]);
  b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[u],[u]);
  assert.equal(m.buffs.find(e=>e.id===u.id+':yg-pen:'+m.id).value,p.Ultra[1]);
  assert.equal(m.buffs.find(e=>e.id===u.id+':yg-pen:'+m.id).remaining,p.Ultra[2]);
  near(b.laughter.ally,initialPunchline(b)+p.Ultra[0],'固定计入的额外回合不消费或伪造共享笑点');
  assert.equal(b.ahaCount,1);
  assert.equal(b.ahaCounted,p.Ultra[3]);
  assert.equal(m.resources['好活当赏'],undefined,'非欢愉队友不应获得伪造的好活当赏');
  assert.deepEqual(b.queue.filter(q=>q.kind==='aha').map(q=>q.actor),[u.id]);
  void en;
});

test('爻光：E1 把阿哈额外回合的固定计入笑点提高到 #2=40',()=>{
  const b=createBattle(config([actor(1502,{eidolon:1}),mate()]));b.random=()=>0;
  const [u]=b.units,p=u.kit.params;
  b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[u],[u]);
  near(b.laughter.ally,initialPunchline(b)+p.Ultra[0]);
  assert.equal(b.ahaCounted,u.kit.ranks[1][1]);
});

test('爻光 E1：欢愉伤害防御无视作用于我方全体，不作用于敌方攻击者',()=>{
  const b=createBattle(config([actor(1502,{eidolon:1}),actor(1505)])),u=b.units[0],ally=b.units[1],target=b.units.at(-1);
  const own=b.rules.modifiers(b,u,target,u.actions.elation,'elation');
  const teammate=b.rules.modifiers(b,ally,target,ally.actions.elation,'elation');
  const hostile=b.rules.modifiers(b,{...ally,side:'enemy'},target,ally.actions.elation,'elation');
  near(own.defIgnore,u.kit.ranks[1][0]);
  near(teammate.defIgnore,u.kit.ranks[1][0],'E1 文本明确覆盖我方全体');
  near(hostile.defIgnore??0,0,'爻光 E1 不应替敌方攻击者增加减防');
});

test('爻光：天赋【大吉大利】在持有好活当赏时按 1 次/攻击触发，消耗战技点则额外 1 次，且同一动作只触发一次',()=>{
  const b=createBattle(config([actor(1502),mate({actions:{basic:{name:'多段普攻',type:'Normal',element:'Physical',terms:[{scaling:'atk',multiplier:1}],hitShares:[.5,.5],spCost:0,spGain:0,toughness:0},skill:{name:'多段战技',type:'BPSkill',element:'Physical',terms:[{scaling:'atk',multiplier:1}],hitShares:[.5,.5],spCost:1,spGain:0,toughness:0}}})]));b.random=()=>0;
  const [u,m,en]=b.units,p=u.kit.params,n0=elationHits(b).length;
  force(b,m,'basic');assert.equal(elationHits(b).length,n0,'没有好活当赏时不应触发');
  u.resources['好活当赏']=5;force(b,m,'basic');
  assert.equal(elationHits(b).length-n0,1,'多段普攻只应在完整动作后触发1次');
  near(baseOf(elationHits(b).at(-1)),elationBaseOf(u,p.Talent[0]));
  force(b,m,'skill');assert.equal(elationHits(b).length-n0,3,'消耗战技点应额外触发 1 次');
});

test('爻光：结界期间施放普攻 / 战技后获得 #3 个笑点（开结界的那次战技不算）；秘技让下一次战斗开始自动触发一次战技',()=>{
  const b=createBattle(config([actor(1502)]));b.random=()=>0;
  const [u,en]=b.units,p=u.kit.params;
  b.rules.after(b,u,'skill','normal',u.actions.skill,[u],[]);
  assert.equal(b.laughter.ally,initialPunchline(b),'展开结界的那次战技期间结界尚未存在，不应给额外笑点');
  b.rules.after(b,u,'basic','normal',u.actions.basic,[en],[en]);
  near(b.laughter.ally,initialPunchline(b)+p.BPSkill[2],'结界内普攻给 #3 个笑点');
  b.rules.after(b,u,'skill','normal',u.actions.skill,[u],[]);
  near(b.laughter.ally,initialPunchline(b)+p.BPSkill[2]*2,'结界内再施放战技应再给 #3 个笑点');
  const b2=createBattle(config([actor(1502,{technique:true})]));b2.random=()=>0;
  assert.ok(b2.queue.some(q=>q.actor===b2.units[0].id&&q.key==='skill'&&q.kind==='technique'));
  stepBattle(b2);
  assert.ok(b2.units[0].buffs.some(e=>e.tag==='ygField'),'秘技应自动展开结界');
});

// ───────────────────────── 1503 真珠 ─────────────────────────
test('真珠：普攻按防御力结算（真实战斗中 base = 防御力×#1）；未进入【深度学习】时 prepare 不改写普攻',()=>{
  const b=createBattle(config([actor(1503),mate()]));b.random=()=>0;
  const [u,m,en]=b.units,p=u.kit.params;
  assert.deepEqual(u.actions.basic.terms,[{scaling:'def',multiplier:p.Normal[0]}]);
  assert.equal(b.rules.prepare(b,u,'basic','normal',u.actions.basic).name,u.actions.basic.name);
  u.policy={...u.policy,basicOnly:true};
  const b2=createBattle({...config([actor(1503),mate()]),critMode:'noncrit'});
  b2.units[0].policy={...b2.units[0].policy,basicOnly:true};
  b2.units[0].distance=0;b2.aha.distance=100000;
  const n0=0;
  stepBattle(b2);
  const hit=b2.log.filter(e=>e.type==='damage'&&e.actor===b2.units[0].id)[0];
  assert.ok(hit,'应产生一次普攻伤害');
  near(baseOf(hit),combatPanel(b2.units[0]).def*p.Normal[0]);
  void b;void m;void en;void n0;
});

test('真珠：战技给 #1 好活当赏并按防御力治疗全队 + 额外治疗最低血量目标',()=>{
  const b=createBattle(config([actor(1503),mate()]));b.random=()=>0;
  const [u,m]=b.units,p=u.kit.params;
  u.panel.def=1000;m.hp=5000;u.hp=9000;
  b.rules.before(b,u,'skill','normal',u.actions.skill,[m]);
  b.rules.after(b,u,'skill','normal',u.actions.skill,[m],[]);
  assert.equal(u.resources['好活当赏'],p.BPSkill[0]);
  const heals=b.log.filter(e=>e.type==='heal');
  const atk=combatPanel(u).def*p.BPSkill[1]+p.BPSkill[2];
  const boost=(1+(combatPanel(u).healingBoost??0));
  near(heals.find(e=>e.target===m.id).amount,atk*boost,1e-4);
  assert.equal(heals.filter(e=>e.target===m.id).length,2,'最低血量目标应再获得一次治疗');
});

test('真珠：终结技指定【美学底本】、给 #3 好活当赏并进入 #1 点充能的【深度学习】',()=>{
  const b=createBattle(config([actor(1503),mate()]));b.random=()=>0;
  const [u,m]=b.units,p=u.kit.params;
  b.rules.before(b,u,'ultimate','ultimate',u.actions.ultimate,[m]);
  b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[m],[]);
  assert.equal(m.resources['美学底本'],1);
  assert.equal(u.resources['好活当赏'],p.Ultra[2]);
  assert.equal(u.resources['深度学习充能'],p.Ultra[0]);
  const a=b.rules.prepare(b,u,'basic','normal',u.actions.basic);
  assert.equal(a.name,ROSTER_DATA[1503].skills['150310'].name,'美学底本非欢愉命途 → 绘制末浪');
});

test('真珠：队伍中 4 名欢愉角色时终结技给【美学底本】额外回合，行动提前取 #6 档并给 #7 笑点 / #8 好活当赏',()=>{
  const units=[actor(1503),actor(1501),actor(1502),actor(1505)];
  const b=createBattle(config(units));b.random=()=>0;
  const [u,x1,x2,x3]=b.units,p=u.kit.params;
  void x1;void x2;
  const punchBefore=x3.resources['好活当赏']??0,laughterBefore=b.laughter.ally;
  b.rules.before(b,u,'ultimate','ultimate',u.actions.ultimate,[x3]);
  b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[x3],[]);
  assert.equal(u.resources['深度学习充能'],p.Ultra[0]);
  near(u.resources['好活当赏'],p.Ultra[2]*0.5,'真珠低于绯英参演编号，终结技获得的好活当赏有50%转化');
  near(x3.resources['好活当赏'],punchBefore+p.Ultra[7]+p.Ultra[2]*0.5,'【美学底本】获得临时资源及瞰众乐转化份额');
  near(b.laughter.ally,laughterBefore+p.Ultra[6],'额外回合中暂时增加 #7 笑点');
  assert.ok(b.queue.some(q=>q.actor===x3.id&&q.kind==='extra'));
  assert.ok(x3.resources['真珠额外回合临时资源'],'需将奖励标为本次额外回合的临时资源');
  assert.ok(b.log.some(e=>e.type==='advance'&&e.actor===x3.id));
  near(b.log.find(e=>e.type==='advance'&&e.actor===x3.id).ratio,p.Ultra[5],'4 名欢愉角色取 #6=0.3 档');
  for(const unit of b.units)unit.distance=1e6;
  assert.equal(stepBattle(b),true,'应实际执行美学底本的额外动作');
  assert.ok(b.log.some(e=>e.type==='resource'&&e.name==='真珠额外回合临时资源结束'&&e.removedPunchline===p.Ultra[7]&&e.removedLaughter===p.Ultra[6]),'应只移除真珠发放的临时批次；额外行动结束时可能紧接自然阿哈，不能用队伍总资源断言');
  assert.ok(!x3.resources['真珠额外回合临时资源'],'额外回合结束标记应清理');
  assert.ok(!x3.buffs.some(e=>e.id===`punchline:${x3.id}:2`),'临时好活当赏批次应移除');
  const e2Units=[actor(1503,{eidolon:2}),actor(1501),actor(1502),actor(1505)];
  const e2=createBattle(config(e2Units));e2.random=()=>0;
  const [pearl, , ,archetype]=e2.units,ep=pearl.kit.params.Ultra;
  const e2Punch=archetype.resources['好活当赏']??0,e2Laugh=e2.laughter.ally;
  e2.rules.before(e2,pearl,'ultimate','ultimate',pearl.actions.ultimate,[archetype]);
  near(archetype.resources['好活当赏'],e2Punch+ep[7]*2,'E2 将临时好活当赏翻倍');
  near(e2.laughter.ally,e2Laugh+ep[6]*2,'E2 将临时笑点翻倍');
});

test('绯英瞰众乐：队友通过非自然阿哈来源获得好活时按参演编号实时转化，E2与解锁边界正确',()=>{
  const run=({eidolon=0,unlock=true,targetId=1501,participantId}={})=>{
    const ids=targetId===1506?[1503,1505,1506,1513]:[1503,1501,1502,1505];
    const b=createBattle(config(ids.map(id=>actor(id,id===1505?{eidolon}:{}))));
    const pearl=b.units.find(t=>t.kit?.characterId===1503);
    const evanescia=b.units.find(t=>t.kit?.characterId===1505),target=b.units.find(t=>t.kit?.characterId===targetId);
    if(participantId!=null)target.participantId=participantId;
    if(!unlock)delete evanescia.kit.trace['1'];
    const before={target:target.resources['好活当赏']??0,evanescia:evanescia.resources['好活当赏']??0};
    b.rules.before(b,pearl,'ultimate','ultimate',pearl.actions.ultimate,[target]);
    return {b,target,evanescia,before};
  };
  for(const [eidolon,converted] of [[0,15],[2,22.5]]){
    const {b,target,evanescia,before}=run({eidolon});
    near((target.resources['好活当赏']??0)-before.target,30-converted,'真珠额外回合的低编号队友只保留未转化份额');
    near((evanescia.resources['好活当赏']??0)-before.evanescia,converted,'绯英在发放时获得基础50%以及E2追加50%');
    assert.ok(b.log.some(e=>e.type==='mechanic'&&e.name==='瞰众乐 · 好活当赏发放时转化'&&e.converted===converted));
  }
  const high=run({targetId:1506});
  near((high.target.resources['好活当赏']??0)-high.before.target,30,'参演编号高于绯英的银狼不触发转化');
  near((high.evanescia.resources['好活当赏']??0)-high.before.evanescia,0);
  const locked=run({unlock:false});
  near((locked.target.resources['好活当赏']??0)-locked.before.target,30,'未解锁瞰众乐时保留全部资源');
  near((locked.evanescia.resources['好活当赏']??0)-locked.before.evanescia,0);
  const reordered=run({participantId:200});
  near((reordered.target.resources['好活当赏']??0)-reordered.before.target,30,'排序按参演编号而不是队伍站位');
  near((reordered.evanescia.resources['好活当赏']??0)-reordered.before.evanescia,0);
});

test('绯英开不败：自然到期逐批转化，资源镜像同步扣除且不污染效果对象',()=>{
  const b=createBattle(config([actor(1503),actor(1505)]));b.random=()=>0;
  const pearl=b.units.find(x=>x.kit?.characterId===1503),evanescia=b.units.find(x=>x.kit?.characterId===1505);
  pearl.resources['好活当赏']=0;
  const marker={type:'buff',id:'punchline:'+pearl.id+':901',name:'好活当赏',key:'marker',value:0,tag:'punchline',stacks:8,remaining:1,tickOwner:pearl.id,tickAt:'end',appliedTurn:0,source:evanescia.id};
  pearl.buffs.push(marker);pearl.resources['好活当赏']=8;
  for(const u of b.units)u.distance=100000;pearl.distance=0;pearl.policy={...pearl.policy,turnPlan:[{turn:1,key:'basic'}]};
  assert.equal(stepBattle(b),true);
  near(evanescia.resources['好活当赏'],4,'自然到期的8点应转化50%');
  assert.equal(pearl.resources['好活当赏'],0);
  assert.equal('removeNotified'in marker,false,'移除通知状态不能泄漏进战斗效果数据');
  assert.ok(b.log.some(e=>e.type==='mechanic'&&e.name==='开不败 · 好活当赏转化'&&e.reason==='expire'));
});

test('绯英开不败：真珠抵御完整消耗时转化整批资源',()=>{
  const b=createBattle(config([actor(1503),actor(1505)]));b.random=()=>0;
  const pearl=b.units.find(x=>x.kit?.characterId===1503),evanescia=b.units.find(x=>x.kit?.characterId===1505),holder=pearl;
  holder.resources['好活当赏']=10;holder.buffs.push({type:'buff',id:'punchline:'+holder.id+':901',key:'marker',value:0,tag:'punchline',stacks:10,remaining:2,tickOwner:holder.id,tickAt:'end'});
  b.rules.redirectDamage(b,b.units.find(x=>x.side==='enemy'),holder,4000,'direct');
  near(holder.resources['好活当赏'],0);near(evanescia.resources['好活当赏'],5,'完整消耗的10点转化50%');
  assert.ok(!holder.buffs.some(e=>e.tag==='punchline'));
});

test('绯英开不败：抵御部分消耗只缩减当前批次，未消耗部分到期再转化',()=>{
  const b=createBattle(config([actor(1503),actor(1505)]));b.random=()=>0;
  const pearl=b.units.find(x=>x.kit?.characterId===1503),evanescia=b.units.find(x=>x.kit?.characterId===1505);
  pearl.resources['好活当赏']=10;const marker={type:'buff',id:'punchline:'+pearl.id+':901',key:'marker',value:0,tag:'punchline',stacks:10,remaining:2,tickOwner:pearl.id,tickAt:'end'};pearl.buffs.push(marker);
  b.rules.redirectDamage(b,b.units.find(x=>x.side==='enemy'),pearl,500,'direct');
  near(marker.stacks,8.5,'300抵御值只消耗1.5点，批次保留8.5点');
  near(pearl.resources['好活当赏'],8.5);near(evanescia.resources['好活当赏']??0,0,'部分消费不等于移除，不应提前触发开不败');
  assert.ok(pearl.buffs.includes(marker),'部分消耗不得移除仍有效的批次');
});

test('绯英开不败：跨批消费按先入先出结算，不改写后批次的持续时间与堆叠',()=>{
  const b=createBattle(config([actor(1503),actor(1505)]));b.random=()=>0;
  const pearl=b.units.find(x=>x.kit?.characterId===1503),evanescia=b.units.find(x=>x.kit?.characterId===1505);
  const first={type:'buff',id:'punchline:'+pearl.id+':901',key:'marker',value:0,tag:'punchline',stacks:3,remaining:1,tickOwner:pearl.id,tickAt:'end'};
  const second={type:'buff',id:'punchline:'+pearl.id+':902',key:'marker',value:0,tag:'punchline',stacks:7,remaining:3,tickOwner:pearl.id,tickAt:'end'};
  pearl.buffs.push(first,second);pearl.resources['好活当赏']=10;
  b.rules.redirectDamage(b,b.units.find(x=>x.side==='enemy'),pearl,1000,'direct');
  near(evanescia.resources['好活当赏'],1.5,'先消费3点首批，首批移除时触发50%转化');
  assert.ok(!pearl.buffs.includes(first));assert.ok(pearl.buffs.includes(second));
  near(second.stacks,7,'先消费首批正好3点时第二批保持原始层数');assert.equal(second.remaining,3);
});

test('绯英开不败：真珠额外回合清理临时批次时触发移除转化并保留其他批次',()=>{
  const b=createBattle(config([actor(1503),actor(1501),actor(1502),actor(1505)]));b.random=()=>0;
  const pearl=b.units.find(x=>x.kit?.characterId===1503),evanescia=b.units.find(x=>x.kit?.characterId===1505),target=b.units.find(x=>x.kit?.characterId===1501);
  const persistent={type:'buff',id:'punchline:'+target.id+':800',key:'marker',value:0,tag:'punchline',stacks:4,remaining:3,tickOwner:target.id,tickAt:'end'};
  target.buffs.push(persistent);target.resources['好活当赏']=4;
  b.rules.before(b,pearl,'ultimate','normal',pearl.actions.ultimate,[target]);
  const temp=target.resources['真珠额外回合临时资源'];assert.ok(temp);
  assert.ok(target.buffs.some(e=>e.id===temp.punchlineId));
  b.rules.after(b,target,'basic','extra',target.actions.basic,[target],[target]);
  assert.ok(!target.buffs.some(e=>e.id===temp.punchlineId));assert.ok(target.buffs.includes(persistent));
  near(target.resources['好活当赏'],4,'清理临时批次后保留长期批次');
  assert.ok(b.log.some(e=>e.type==='mechanic'&&e.name==='开不败 · 好活当赏转化'&&e.reason==='temporary-extra-turn'));
});

test('绯英开不败：队友阵亡时移除持有的好活当赏并转化一次',()=>{
  const b=createBattle(config([actor(1505),mate()]));b.random=()=>0;
  const holder=b.units.find(x=>x.id==='mate'),evanescia=b.units.find(x=>x.kit?.characterId===1505),enemyUnit=b.units.find(x=>x.side==='enemy');
  holder.resources['好活当赏']=12;holder.buffs.push({type:'buff',id:'punchline:'+holder.id+':901',key:'marker',value:0,tag:'punchline',stacks:12,remaining:3,tickOwner:holder.id,tickAt:'end'});
  receiveDamage(b,enemyUnit,holder,holder.hp+1,'true');
  assert.equal(holder.hp,0);near(evanescia.resources['好活当赏'],6);
  assert.equal(b.log.filter(e=>e.type==='mechanic'&&e.name==='开不败 · 好活当赏转化'&&e.reason==='death').length,1);
});

test('真珠：行迹 point06 用防御力换算欢愉度并转成治疗加成（#6）',()=>{
  const b=createBattle(config([actor(1503)]));b.random=()=>0;
  const [u]=b.units,T=u.kit.trace['1'];
  u.panel.def=T[0];
  near(combatPanel(u).elation,T[1]);
  u.panel.def=T[0]+T[2]*5;
  near(combatPanel(u).elation,T[1]+T[3]*5);
  near(combatPanel(u).healingBoost,(T[1]+T[3]*5)*T[5]);
  u.panel.def=999999;
  // 4.6 文本：「最多计入 #5 点**超出的**防御力」——上限是超出部分 3600 点，不是防御力总量 3600。
  // 1506101 / 1513101 的「最多计入 #5 点超出的速度」按同一口径实现（Math.min(T[4], excess)）。
  near(combatPanel(u).elation,T[1]+T[4]/T[2]*T[3],'超出部分最多计入 #5 点');
});

test('真珠欢愉技：为全队下一次实际攻击挂票，四欢愉队 E4 将 40% 原倍率加倍',()=>{
  const run=e4=>{
    const b=createBattle(config([actor(1503,{eidolon:4}),actor(1501),actor(1502),actor(1505)]));b.random=()=>0;
    const [pearl,sparkle]=b.units;if(!e4)pearl.kit.ranks[4]=[];
    const team=b.units.filter(x=>x.side==='ally');
    b.rules.after(b,pearl,'elation','aha',pearl.actions.elation,[],[]);
    return {b,pearl,sparkle,team,enemy:b.units.find(x=>x.side==='enemy')};
  };
  const full=run(true),withoutE4=run(false),{b,pearl,sparkle,team}=full;
  for(const to of team){
    assert.equal(to.resources['真珠欢愉技待触发'].source,pearl.id);
    const level=Math.min(15,10+(pearl.kit.eidolon>=3?1:0)+(pearl.kit.eidolon>=5?1:0));
    near(to.resources['真珠欢愉技待触发'].multiplier,plist(1503,150320,level)[3]*2,'四人档按当前欢愉技等级取值并由E4增加100%');
  }
  const en=full.enemy;
  b.rules.after(b,sparkle,'basic','normal',sparkle.actions.basic,[en],[en]);
  withoutE4.b.rules.after(withoutE4.b,withoutE4.sparkle,'basic','normal',withoutE4.sparkle.actions.basic,[withoutE4.enemy],[withoutE4.enemy]);
  const hit=elationHits(b,sparkle.id).at(-1);
  assert.ok(hit,'下一次攻击后必须追加欢愉伤害');
  assert.equal(hit.element,'Fire','伤害属性跟随执行攻击的我方角色');
  near(baseOf(hit)/baseOf(elationHits(withoutE4.b,withoutE4.sparkle.id).at(-1)),2,'只移除E4、保留E3技能等级后，E4应严格加倍本欢愉技倍率');
  assert.ok(!sparkle.resources['真珠欢愉技待触发'],'成功结算后消耗一次攻击票');
  assert.ok(team.slice(2).every(to=>to.resources['真珠欢愉技待触发']),'其他队友仍各自保留独立攻击票');
});

test('真珠欢愉技：辅助动作和未命中动作不消费攻击票，命中后只结算一次',()=>{
  const b=createBattle(config([actor(1503),actor(1501)]));b.random=()=>0;
  const [pearl,sparkle]=b.units,en=b.units.find(x=>x.side==='enemy');
  b.rules.after(b,pearl,'elation','aha',pearl.actions.elation,[],[]);
  b.rules.after(b,sparkle,'skill','normal',sparkle.actions.skill,[],[]);
  assert.ok(sparkle.resources['真珠欢愉技待触发'],'未命中辅助动作不能消耗攻击票');
  b.rules.after(b,sparkle,'elation','aha',sparkle.actions.elation,[],[]);
  assert.ok(sparkle.resources['真珠欢愉技待触发'],'后续欢愉技本身不是其下一次攻击');
  b.rules.after(b,sparkle,'basic','normal',sparkle.actions.basic,[en],[en,en]);
  assert.equal(elationHits(b,sparkle.id).length,1,'多段/重复目标在同一动作后仅对同一敌人追加一次');
  assert.ok(!sparkle.resources['真珠欢愉技待触发']);
});

test('真珠：受击时按当下好活当赏即时生成抵御池，不等下个回合快照',()=>{
  const b=createBattle(config([actor(1503),mate()]));b.random=()=>0;
  const [u,m,en]=b.units,p=u.kit.params.Talent;
  b.rules.onTurnStart(b,u);
  assert.equal(u.resources['抵御值'],0);
  b.rules.after(b,u,'skill','normal',u.actions.skill,[m],[]);
  const earned=u.resources['好活当赏'];assert.ok(earned>0);
  const incoming=1000,expected=Math.min(incoming*p[1],Math.min(p[2],earned)*p[4]);
  const result=b.rules.redirectDamage(b,en,m,incoming,'direct');
  near(result[0].amount,expected,'新获得的好活当赏应即时转成抵御值');
  near(u.resources['抵御值'],Math.min(p[2],u.resources['好活当赏'])*p[4]);
});

test('真珠：队友生命跨过50%阈值时立即开关30%减伤状态',()=>{
  const b=createBattle(config([actor(1503),mate()]));b.random=()=>0;
  const [u,m]=b.units,id=u.id+':pearl-guard:'+m.id,max=combatPanel(m).hp;
  m.hp=max*.6;b.rules.hpChanged(b,m,'damage',max*.4,u);
  assert.ok(!m.buffs.some(e=>e.id===id),'高于50%时不应减伤');
  m.hp=max*.5;b.rules.hpChanged(b,m,'damage',max*.1,u);
  near(m.buffs.find(e=>e.id===id).value,u.kit.params.Talent[3],'正好50%应立即获得30%减伤');
  m.hp=max*.5001;b.rules.hpChanged(b,m,'heal',max*.0001,u);
  assert.ok(!m.buffs.some(e=>e.id===id),'治疗回到50%以上应即时移除减伤');
});

test('真珠 E1：欢愉角色人数按完整队伍计算，阵亡队友仍计入四人档',()=>{
  const b=createBattle(config([actor(1503,{eidolon:1}),actor(1501),actor(1502),actor(1505)]));
  const pearl=b.units.find(t=>t.kit?.characterId===1503),dead=b.units.find(t=>t.kit?.characterId===1501);
  dead.hp=0;dead.active=false;
  near(combatPanel(pearl).elation,pearl.kit.trace['1'][1]+pearl.kit.ranks[1][2],'四人队 E1 应给我方欢愉度 #3，即使一名队友阵亡');
});

test('真珠：抵御值在受击前抵消60%伤害并按消耗量扣减，低血减伤独立生效',()=>{
  const b=createBattle(config([actor(1503),mate()]));b.random=()=>0;
  const [u,m]=b.units,p=u.kit.params;
  b.rules.onTurnStart(b,u);
  const id=u.id+':pearl-guard:'+m.id;
  assert.ok(!m.buffs.some(e=>e.id===id),'没有好活当赏时不应有抵御');
  u.resources['好活当赏']=30;
  b.rules.onTurnStart(b,u);
  near(u.resources['抵御值'],Math.min(p.Talent[2],30)*p.Talent[4]);
  const incoming=10000,absorbed=incoming*p.Talent[1];
  const r=b.rules.redirectDamage(b, b.units[2],m,incoming,'direct');
  near(r[0].amount,absorbed);
  assert.equal(r[0].absorb,true);
  near(u.resources['抵御值'],Math.min(p.Talent[2],30)*p.Talent[4]-absorbed);
  near(u.resources['好活当赏'],30-absorbed/p.Talent[4]);
  const b2=createBattle(config([actor(1503),mate()]));
  const [u2,m2]=b2.units;
  m2.hp=combatPanel(m2).hp*p.Talent[0]*.5;
  b2.rules.onTurnStart(b2,u2);
  near(m2.buffs.find(e=>e.tag==='pearlGuard').value,p.Talent[3]);
  assert.equal(u2.resources['抵御值'],0,'抵御池为空不影响低血额外减伤');
});

test('真珠：敌方真实行动通过引擎消耗抵御值并降低队友实扣生命',()=>{
  const c=config([actor(1503),mate()]);
  const b=createBattle(c);b.random=()=>0;
  const [u,m,en]=b.units;u.resources['好活当赏']=30;b.rules.onTurnStart(b,u);
  const hp=m.hp;
  receiveDamage(b,en,m,10000,'direct',{attackType:'Normal'});
  const hit=b.log.find(e=>e.type==='damage'&&e.actor===en.id&&e.target===m.id);
  assert.ok(hit,'引擎应记录受击结算');
  assert.ok(hit.mechanicAbsorbed>0,'引擎应记录抵御池吸收量');
  assert.ok(hit.hpDamage<hp,'被抵御后的实扣生命应小于生命上限');
  assert.ok(u.resources['抵御值']<Math.min(u.kit.params.Talent[2],30)*u.kit.params.Talent[4]);
});

test('欢愉好活当赏：定时标记到期时资源镜像同步清零',()=>{
  const b=createBattle(config([actor(1501)]));
  const [u]=b.units;u.buffs=u.buffs.filter(e=>e.tag!=='punchline');u.resources['好活当赏']=7;
  u.buffs.push({type:'buff',id:'punchline:'+u.id,name:'好活当赏',key:'marker',value:0,tag:'punchline',stacks:7,
    remaining:1,tickOwner:u.id,tickAt:'end',appliedTurn:0,source:u.id});
  u.distance=0;for(const to of b.units)if(to!==u)to.distance=100000;
  assert.equal(stepBattle(b),true);
  assert.equal(u.resources['好活当赏'],0);
  assert.ok(!u.buffs.some(e=>e.tag==='punchline'));
  assert.ok(b.log.some(e=>e.type==='resource'&&e.actor===u.id&&e.name==='好活当赏'&&e.value===0&&e.reason==='独立持续时间结束'));
});

test('真珠：E1 致命伤害保护（单场 #5 次）保留 1 血并回复 #4 生命上限',()=>{
  const b=createBattle(config([actor(1503,{eidolon:1}),mate()]));b.random=()=>0;
  const [u,m]=b.units;
  m.hp=1;
  const saved=b.rules.beforeLethal(b,u,m,1e6);
  assert.equal(saved,true);
  near(m.hp,1+combatPanel(m).hp*u.kit.ranks[1][3]*(1+(combatPanel(u).healingBoost??0))*(1+(combatPanel(m).incomingHeal??0)),1e-4);
  assert.equal(u.resources['E1 保护已用'],1);
  assert.equal(b.rules.beforeLethal(b,u,m,1e6),true);
  assert.equal(b.rules.beforeLethal(b,u,m,1e6),false,'超过 #5=2 次后不再保护');
});

// ───────────────────────── 1505 绯英 ─────────────────────────
test('绯英：欢愉度 = 暴击伤害 × #5；行迹 point06 给 #1 暴击率',()=>{
  const b=createBattle(config([actor(1505)]));b.random=()=>0;
  const [u]=b.units,p=u.kit.params,T=u.kit.trace['1'];
  u.panel.critDmg=1.5;
  near(combatPanel(u).elation,1.5*p.Talent[4]);
  near(combatPanel(u).critRate,panel().critRate+T[0]);
});

test('绯英：战技 4 段 + 相邻，#4=10 笑点；持有好活当赏时额外 #7 欢愉伤害',()=>{
  const b=createBattle(config([actor(1505)]));b.random=()=>0;
  const [u,en]=b.units,p=u.kit.params;
  assert.equal(u.actions.skill.hitShares.length,4);
  b.rules.after(b,u,'skill','normal',u.actions.skill,[en],[en]);
  near(b.laughter.ally,initialPunchline(b)+p.BPSkill[3]);
  assert.equal(elationHits(b).length,0);
  u.resources['好活当赏']=100;
  b.rules.after(b,u,'skill','normal',u.actions.skill,[en],[en]);
  assert.equal(elationHits(b).length,1);
  near(baseOf(elationHits(b).at(-1)),elationBaseOf(u,p.Talent[6]));
  // 真实战斗里战技主目标确实结算 4 段
  const b2=createBattle(config([actor(1505)]));b2.random=()=>0;
  b2.units[0].policy={...b2.units[0].policy,rotation:['skill']};
  b2.units[0].panel.speed=200;b2.units[1].panel.speed=1;
  stepBattle(b2);
  assert.equal(b2.log.filter(e=>e.type==='damage'&&e.kind==='direct'&&e.actor===b2.units[0].id&&e.role==='primary').length,4,'战技主目标应为 4 段');
});

test('绯英：终结技弹射次数 = #2 + 行迹 point06 按敌方数量的追加（3+/2/1 → #2/#3/#4）',()=>{
  const mk=(n)=>{const c=config([actor(1505)]);c.units=[c.units[0],...Array.from({length:n},(_,i)=>enemy({id:'e'+i}))];return createBattle(c);};
  const T=actor(1505).kit.trace['1'];
  for(const n of [1,2,3]){
    const b=mk(n),[u]=b.units;
    const a=b.rules.prepare(b,u,'ultimate','ultimate',u.actions.ultimate);
    const extra=n>=3?T[1]:n===2?T[2]:T[3];
    assert.equal(a.bounceCount,u.kit.params.Ultra[1]+extra,'敌方 '+n+' 个');
  }
});

test('绯英：能量与好活当赏双向同步（单次上限 100），累计 #3=240 点能量触发【狐狸老师】追加攻击并回 #4 能量',()=>{
  const b=createBattle(config([actor(1505),mate()]));b.random=()=>0;
  const [u,m,en]=b.units,p=u.kit.params;
  const energyBefore=u.energy;u.energy=energyBefore+p.Talent[2]; // 一次 +240（单次最多计入 #3）
  b.rules.afterDamage(b,u,en,'direct');
  // 单次能量上限 100 转好活；狐狸老师回能 10 点也是获得能量，再转 10 点好活。
  near(u.resources['好活当赏'],100+p.Talent[3],'单次好活当赏上限 100，另加狐狸回能转出的 10 点');
  near(u.energy,Math.min(u.energyMax,energyBefore+p.Talent[2]+p.Talent[3]),'狐狸老师回能仍受角色能量上限约束');
  assert.ok(b.queue.some(q=>q.actor===u.id&&q.key==='followup'&&q.kind==='followup'));
  // 狐狸老师恢复的 #4=10 点能量也属于「获得能量」，应计入下一次累计。
  assert.equal(u.resources['狐狸累计'],p.Talent[3],'累计值应被消耗，但狐狸回能重新计入');
  // 反向：获得好活当赏 → 获得等值能量
  u.energy=0;u.resources['能量快照']=0;u.resources['好活当赏快照']=u.resources['好活当赏'];
  b.rules.afterDamage(b,m,en,'direct');
  b.rules.afterDamage(b,m,en,'direct');
  void m;
});

test('绯英：【狐狸老师】追加攻击在动作表里是全体 #1 攻击力伤害，after 结算 #2 欢愉伤害与行迹 point07 易伤',()=>{
  const b=createBattle(config([actor(1505)]));b.random=()=>0;
  const [u,en]=b.units,p=u.kit.params,T=u.kit.trace['2'];
  near(u.actions.followup.terms[0].multiplier,p.Talent[0]);
  assert.equal(u.actions.followup.target,'all');
  // 150504 / Insert_Phase02：狐狸老师的欢愉伤害只在绯英持有【好活当赏】时结算。
  u.resources['好活当赏']=10;
  const n0=elationHits(b).length;
  b.rules.after(b,u,'followup','followup',u.actions.followup,[en],[en]);
  assert.equal(elationHits(b).length-n0,1);
  near(baseOf(elationHits(b).at(-1)),elationBaseOf(u,p.Talent[1]));
  const v=en.buffs.find(e=>e.id===u.id+':fox-vuln');
  near(v.value,T[0]);assert.equal(v.remaining,T[1]);

  // 反向：没有好活当赏时，狐狸老师不造成欢愉伤害，但行迹易伤仍施加。
  const b2=createBattle(config([actor(1505)]));b2.random=()=>0;
  const [u2,en2]=b2.units;
  u2.resources['好活当赏']=0;
  const n2=elationHits(b2).length;
  b2.rules.after(b2,u2,'followup','followup',u2.actions.followup,[en2],[en2]);
  assert.equal(elationHits(b2).length,n2,'未持有好活当赏时不应造成欢愉伤害');
  assert.ok(en2.buffs.some(e=>e.id===u2.id+':fox-vuln'),'行迹易伤不受好活当赏条件限制');
});

test('绯英：E6 欢愉伤害增笑 = #1 + 每 100 点好活当赏 #3（最多计入 1000 点）；E1 抗穿 / E4 无视防御',()=>{
  const b=createBattle(config([actor(1505,{eidolon:6})]));b.random=()=>0;
  const [u,en]=b.units;
  u.resources['好活当赏']=0;
  near(b.rules.modifiers(b,u,en,{type:'ElationDamage'},'elation').elationBoost,u.kit.ranks[6][0]);
  u.resources['好活当赏']=250;
  near(b.rules.modifiers(b,u,en,{type:'ElationDamage'},'elation').elationBoost,u.kit.ranks[6][0]+2*u.kit.ranks[6][2]);
  u.resources['好活当赏']=9999;
  near(b.rules.modifiers(b,u,en,{type:'ElationDamage'},'elation').elationBoost,u.kit.ranks[6][0]+10*u.kit.ranks[6][2]);
  near(b.rules.modifiers(b,u,en,{type:'Normal'},'direct').resPen,u.kit.ranks[1][0]);
  near(b.rules.modifiers(b,u,en,{type:'Normal'},'direct').defIgnore,u.kit.ranks[4]);
  // E6：好活当赏持续时间 +1 回合（秘技入场给 #2=20 点好活当赏）
  const b2=createBattle(config([actor(1505,{eidolon:6,technique:true})]));b2.random=()=>0;
  const u2=b2.units[0];
  assert.ok((u2.resources['好活当赏']??0)>=u2.kit.params.Maze[1]);
  assert.equal(u2.buffs.find(e=>e.tag==='punchline').remaining,3,'E6 应把持续时间加到 3 回合');
});

test('绯英：秘技对敌方全体造成 #1 攻击力伤害并给 #2 好活当赏',()=>{
  const b=createBattle(config([actor(1505,{technique:true})]));b.random=()=>0;
  const [u,en]=b.units,p=u.kit.params;
  const tech=dmgOf(b,u.id,'technique');
  assert.equal(tech.length,1);
  near(baseOf(tech[0]),combatPanel(u).atk*p.Maze[0]);
  assert.ok((u.resources['好活当赏']??0)>=p.Maze[1]);
  void en;
});

// ───────────────────────── 1506 银狼LV.999 ─────────────────────────
test('银狼LV.999：普攻 / 战技不回能，战技给 #2 笑点；获得笑点同步获得等量【隐藏分】',()=>{
  const b=createBattle(config([actor(1506)]));b.random=()=>0;
  const [u,en]=b.units,p=u.kit.params;
  assert.equal(u.actions.basic.energyGain,0);
  assert.equal(u.actions.skill.energyGain,0);
  b.rules.after(b,u,'skill','normal',u.actions.skill,[en],[en]);
  near(b.laughter.ally,initialPunchline(b)+p.BPSkill[1]);
  b.rules.onTurnStart(b,u);            // syncHidden
  near(u.resources['隐藏分'],initialPunchline(b)+p.BPSkill[1],'开场笑点及本次战技获得的笑点均计入隐藏分');
  near(u.energy,initialPunchline(b)+p.BPSkill[1]);
});

test('银狼LV.999：【隐藏分】每点 +0.4% 暴击率，暴击率达 100% 后其余转 +0.8% 暴击伤害（溢出上限 #2=240）',()=>{
  const b=createBattle(config([actor(1506)]));b.random=()=>0;
  const [u]=b.units,p=u.kit.params;
  u.resources['隐藏分']=100;u.energy=60;
  near(combatPanel(u).critRate,panel().critRate+100*p.Talent[3]);
  u.resources['隐藏分']=p.Talent[0]+p.Talent[1];u.energy=60;
  near(combatPanel(u).critRate,1,'暴击率应停在 100%');
  const pts=(1-panel().critRate)/p.Talent[3];
  near(combatPanel(u).critDmg,panel().critDmg+(p.Talent[0]+p.Talent[1]-pts)*p.Talent[5]);
});

test('银狼LV.999：终结技进入【无敌玩家】、行动提前 100%、行迹 point08 给 #1 隐藏分；强化普攻为 150608（#3=100 段弹射）',()=>{
  const b=createBattle(config([actor(1506)]));b.random=()=>0;
  const [u,en]=b.units,p=u.kit.params,T=u.kit.trace['3'];
  u.energy=u.energyMax;
  const d0=u.distance;
  b.rules.before(b,u,'ultimate','ultimate',u.actions.ultimate,[u]);
  assert.ok(u.buffs.some(e=>e.tag==='sw999Ult'));
  assert.equal(u.distance,0,'应行动提前 100%');
  near(u.resources['隐藏分'],T[0],'进入状态应获得 #1 隐藏分');
  const a=b.rules.prepare(b,u,'basic','normal',u.actions.basic);
  const e=plist(1506,150608,u.kit.skillLevels.Normal);
  assert.equal(a.name,ROSTER_DATA[1506].skills['150608'].name);
  assert.equal(a.bounceCount,e[2]-1,'弹射段数应为 #3-1');
  near(a.terms[0].multiplier,e[0]/e[2]);
  void d0;void en;
});

test('银狼LV.999：强化普攻收尾（150608 最后一击，敌方全体均分）带全体削韧 = show_stance_list[1]=30',()=>{
  // Raw Avatar_SilverWolf999_00_Skill11_End_Phase02：4 个 AttackData（Elation/Normal ×
  // AllDarkTeam.GetAliveOnly/AllEnemy，均 EqualSplitInTargets）全部带 StanceValue 动态哈希
  // 1182064154。该哈希随技能 show_stance_list[1] 取值（例：1204 终结技 120403 stance [0,60,0]
  // 的 Skill03_Phase02 亦用此哈希 → 60），所以 150608.stance=[30,30,0] 的收尾对每个目标削韧 30，
  // 而不是 0，也不是把 30 均分给全体（对照 1321 终结技 132103 [0,60,0] 的均分全体仍按 60/目标）。
  const weak=id=>({id,name:'规则训练敌人',side:'enemy',level:90,element:'Physical',
    panel:{...panel(),hp:1e9,speed:1},energy:0,energyMax:0,res:{},toughnessMax:1000,
    weaknesses:['Imaginary'],standardBreak:true,rank:'normal',
    actions:{basic:{name:'测试攻击',type:'Normal',terms:[{scaling:'atk',multiplier:1}],hitEnergy:10}},
    policy:{autoUltimate:false,basicOnly:true}});
  const stance=ROSTER_DATA[1506].skills['150608'].stance[1];
  assert.equal(stance,30,'150608 的全体削韧 show_stance_list[1] 应为 30');
  // 单目标：手动驱动 after 只结算「收尾」段（弹射段由真实动作执行，不在 after 里）。
  const b=createBattle({strict:true,maxAV:201,sp:3,maxSP:9,seed:42,critMode:'noncrit',units:[actor(1506),weak('enemy')]});
  b.random=()=>0;
  const [u,en]=b.units;
  u.energy=u.energyMax;
  b.rules.before(b,u,'ultimate','ultimate',u.actions.ultimate,[u]);
  const a=b.rules.prepare(b,u,'basic','normal',u.actions.basic);
  const before=en.toughness;
  b.rules.after(b,u,'basic','normal',a,[en],[en]);
  near(before-en.toughness,stance,'收尾应对每个目标削韧 '+stance);
  // 双目标：均分的是伤害，削韧依旧是每目标 stance，而不是 stance/2。
  const b2=createBattle({strict:true,maxAV:201,sp:3,maxSP:9,seed:42,critMode:'noncrit',units:[actor(1506),weak('enemy-a'),weak('enemy-b')]});
  b2.random=()=>0;
  const [u2,ea,eb]=b2.units;
  u2.energy=u2.energyMax;
  b2.rules.before(b2,u2,'ultimate','ultimate',u2.actions.ultimate,[u2]);
  const a2=b2.rules.prepare(b2,u2,'basic','normal',u2.actions.basic);
  const ba=ea.toughness,bb=eb.toughness;
  b2.rules.after(b2,u2,'basic','normal',a2,[ea],[ea,eb]);
  near(ba-ea.toughness,stance,'双目标下每个目标仍削韧 '+stance);
  near(bb-eb.toughness,stance,'双目标下每个目标仍削韧 '+stance);
});

test('银狼LV.999：【强化普攻 3 次】后退出状态并清空隐藏分（E1 改为保留 20%）',()=>{
  for(const eidolon of [0,1]){
    const b=createBattle(config([actor(1506,{eidolon})]));b.random=()=>0;
    const [u,en]=b.units,p=u.kit.params;
    u.energy=u.energyMax;
    b.rules.before(b,u,'ultimate','ultimate',u.actions.ultimate,[u]);
    u.resources['隐藏分']=300;u.energy=60;
    for(let i=0;i<p.Talent[4];i++){
      const a=b.rules.prepare(b,u,'basic','normal',u.actions.basic);
      assert.ok(a.bounceCount>0,'第 '+(i+1)+' 次强化普攻应仍是 150608');
      b.rules.after(b,u,'basic','normal',a,[en],[en]);
    }
    assert.ok(!u.buffs.some(e=>e.tag==='sw999Ult'),'应退出【无敌玩家】');
    near(u.resources['隐藏分'],eidolon>=1?300*u.kit.ranks[1][0]:0);
  }
});

test('银狼LV.999：【头号补给盲盒】在结界内按消耗的战技点触发，成功后概率降至当前的 #4',()=>{
  const b=createBattle(config([actor(1506)]));b.random=()=>0;
  const [u,en]=b.units,p=u.kit.params;
  u.energy=u.energyMax;
  b.rules.before(b,u,'ultimate','ultimate',u.actions.ultimate,[u]);
  u.resources['好活当赏']=50;
  u.resources['盲盒概率']=1;
  const n0=elationHits(b).length;
  b.rules.spend(b,u,1); // 实际扣除SP并触发spSpent，不伪造after事件
  assert.ok(elationHits(b).length>n0,'消耗战技点应触发盲盒');
  // 4.6 desc：初始 100%，**成功触发后**下一次降低至当前概率的 #4=20%。
  near(u.resources['盲盒概率'],1*p.Ultra[3],'成功后下一次概率应为当前的 20%');
  u.resources['盲盒概率']=.5;b.random=()=>.9;
  const n1=elationHits(b).length;
  b.rules.spend(b,u,1); // 实际扣除SP并触发spSpent，不伪造after事件
  assert.equal(elationHits(b).length,n1,'判定失败不应造成伤害');
  // 判定失败不改变固定概率（desc 只规定成功后的衰减）。
  near(u.resources['盲盒概率'],.5);
});

test('银狼LV.999：E6 使进入战斗的敌方目标被植入【禁限弱点】（7 元素抗性降低 #1）',()=>{
  const b=createBattle(config([actor(1506,{eidolon:6})]));b.random=()=>0;
  const [u,en]=b.units;
  b.rules.onWaveStart(b);
  assert.ok(en.buffs.some(e=>e.tag==='sw999Weak'));
  const down=en.buffs.filter(e=>e.resReduction);
  assert.equal(down.length,7);
  near(down[0].value,u.kit.ranks[6][0]);
});

test('银狼LV.999 E6：弱点覆盖七属性、按基础抗性归零或降低，并追踪新敌人与来源阵亡清理',()=>{
  const res={Physical:.2,Fire:.1,Ice:0,Thunder:0,Wind:0,Quantum:0,Imaginary:0};
  const u=actor(1506,{eidolon:6}),first=enemy({id:'sw999-first',res}),late=enemy({id:'sw999-late',wave:2,res:{...res}});
  const b=createBattle({...config([]),units:[u,first,late]}),sw=b.units[0],initial=b.units[1],spawned=b.units[2];
  const elements=['Physical','Fire','Ice','Thunder','Wind','Quantum','Imaginary'],expected=el=>res[el]>0?res[el]:sw.kit.ranks[6][0];
  for(const to of [initial]){
    const effects=to.buffs.filter(e=>e.tag==='sw999Weak');
    assert.equal(effects.length,7,'每个属性都需同时植入弱点并处理抗性');
    for(const el of elements){const effect=effects.find(e=>e.element===el);assert.ok(effect?.weakness===el,el+' 弱点未植入');near(effect.value,expected(el),el+' 基础抗性规则错误');}
  }
  spawned.active=true;b.rules.unitCreated(b,spawned);
  assert.equal(spawned.buffs.filter(e=>e.tag==='sw999Weak').length,7,'战斗中召唤/入场的新敌人也要应用 E6');
  sw.hp=0;sw.active=false;b.rules.death(b,initial,sw);
  assert.ok([initial,spawned].every(to=>!to.buffs.some(e=>e.source===sw.id&&e.tag.startsWith('sw999Weak'))),'银狼阵亡后移除由其施加的 E6 弱点与抗性效果');
});

// ───────────────────────── 1513 砂金•戏浪 ─────────────────────────
test('砂金•戏浪：战技全体 #1 + #2 笑点 + #3 热意；终结技使热意越过 #1=10 触发【举杯】，再给 #2 热意 + #3 笑点 + #4 速度 #5 回合',()=>{
  const b=createBattle(config([actor(1513)]));b.random=()=>0;
  const [u,en]=b.units,p=u.kit.params;
  b.rules.after(b,u,'skill','normal',u.actions.skill,[en],[en]);
  near(b.laughter.ally,initialPunchline(b)+p.BPSkill[1]);
  near(u.resources['热意'],p.BPSkill[2]);
  b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[en],[en]);
  // 4+8=12 越过 #1=10 → 触发【举杯】；固定计入的 #5 只供本次全队欢愉技计算。
  near(b.laughter.ally,initialPunchline(b)+p.BPSkill[1]+p.Ultra[2]);
  near(u.resources['热意'],p.BPSkill[2]+p.Ultra[1],'触发时保留已累计热意，不消耗阈值');
  // 热意阈值触发的是砂金自身插入动作，不是全队阿哈额外回合。
  assert.ok(b.queue.some(q=>q.key==='elationHeat'),'应排队一次自身插入的【举杯】');
  assert.ok(!b.ahaCount,'阈值插入不应伪造阿哈时刻');
  const sp=u.buffs.find(e=>e.id===u.id+':aw-ult-speed');
  near(sp.value,p.Ultra[3]);assert.equal(sp.remaining,p.Ultra[4]);
  assert.equal(u.actions.ultimate.target,'all');
});

test('砂金•戏浪：【热意】达到 #1=10 立即结算【举杯！敬炽烈一夏】并强化下一次欢愉技（AllIn）',()=>{
  const b=createBattle(config([actor(1513),mate()]));b.random=()=>0;
  const [u,m,en]=b.units,p=u.kit.params;
  u.resources['热意']=p.Talent[0]-1;
  b.activeAction={sequence:5};
  b.rules.afterHit(b,m,en,{spCost:0,type:'Normal'},'direct',{});
  assert.equal(u.resources['热意'],p.Talent[0]+u.kit.trace['3'][3],'跨过10点后应保留累计热意，并叠加行迹 #4');
  assert.equal(u.resources['AllIn']??0,0,'插入动作结算前不应提前标记 All in');
  assert.ok(b.queue.some(q=>q.key==='elationHeat'),'应排队一次自身插入的【举杯】');
  assert.ok(!b.ahaCount,'阈值插入不是全队阿哈额外回合');
  near(b.laughter.ally,initialPunchline(b)+p.Talent[5]+u.kit.trace['2'][3],'队友攻击 #6 笑点 + 行迹 point07 #4 笑点；固定计入 #5 不进入共享笑点池');
  assert.equal(u.resources['欢愉技次数'],1);
  assert.equal(elationHits(b).length,0,'插入动作尚未结算，不应立即产生伤害');
  for(const x of b.units)x.distance=100000;
  b.aha.distance=100000; // 避免自然阿哈在插入后立刻消费标记
  stepBattle(b);
  assert.equal(u.resources['AllIn'],1,'插入动作结算后应标记 All in');
});

test('砂金•戏浪 E2：热意累计跨过10/20/30/40/50各触发一次，阈值本身不消耗热意',()=>{
  const b=createBattle(config([actor(1513,{eidolon:2}),mate()]));b.random=()=>0;
  const [u,m,en]=b.units;
  const crossings=[4,8,18,28,38];
  for(let i=1;i<=38;i++){
    b.activeAction={sequence:100+i};
    b.rules.afterHit(b,m,en,{spCost:0,type:'Normal'},'direct',{});
    const expectedHeat=Math.min(50,Math.min(i,6)*3+Math.max(0,i-6));
    if(crossings.includes(i)){
      assert.equal(u.resources['欢愉技次数'],crossings.indexOf(i)+1,`每跨过一个累计阈值应插入一次【举杯】(i=${i}, heat=${u.resources['热意']})`);
      assert.equal(u.resources['热意'],expectedHeat,'触发阈值不得扣除已累计热意');
      b.queue.length=0;
    }else assert.equal(u.resources['欢愉技次数']??0,crossings.filter(n=>n<i).length,'未跨新阈值时不可重复触发');
  }
  assert.equal(u.resources['热意'],50,'E2热意应保留到来源所述的50点上限');
  assert.equal(u.resources['欢愉技次数'],5,'E2应分别在10/20/30/40/50累计点触发');
});

test('砂金•戏浪：队友施放攻击后给 #7 热意、#6 笑点（带好活当赏 #2 与阿哈速度 #3）与行迹 #4 热意，同一动作只结算一次',()=>{
  const b=createBattle(config([actor(1513),mate()]));b.random=()=>0;
  const [u,m,en]=b.units,p=u.kit.params,T=u.kit.trace['2'],T8=u.kit.trace['3'];
  b.activeAction={sequence:21};
  b.rules.afterHit(b,m,en,{spCost:0,type:'Normal'},'direct',{});
  near(u.resources['热意'],p.Talent[6]+T8[3],'天赋 #7=1 热意 + 行迹 point08 #4=2 热意');
  near(b.laughter.ally,initialPunchline(b)+p.Talent[5]+T[3],'天赋 #6 笑点 + 行迹 point07 #4 笑点');
  near(u.resources['好活当赏'],T[1]);
  near(b.ahaSpeedBonus,T[2]);
  b.rules.afterHit(b,m,en,{spCost:0,type:'Normal'},'direct',{});
  near(u.resources['热意'],p.Talent[6]+T8[3],'同一动作不应重复触发');
  near(b.laughter.ally,initialPunchline(b)+p.Talent[5]+T[3]);
  near(b.ahaSpeedBonus,T[2],'同一多段动作只应用一次替换型加速');
});

test('砂金•戏浪 Point07：后续独立队友攻击替换为单份阿哈加速，而非永久叠层',()=>{
  const b=createBattle(config([actor(1513),mate()]));b.random=()=>0;
  const [u,m,en]=b.units,T=u.kit.trace['2'];
  b.activeAction={sequence:220};b.rules.afterHit(b,m,en,{spCost:0,type:'Normal'},'direct',{});
  b.activeAction={sequence:221};b.rules.afterHit(b,m,en,{spCost:0,type:'Normal'},'direct',{});
  near(b.ahaSpeedBonus,T[2],'原始 PointB2 的 Stacking=Replace');
});

test('砂金•戏浪 Point07：自然阿哈结束时解除速度修正',()=>{
  const b=createBattle(config([actor(1513)]));b.random=()=>0;
  const [u]=b.units;b.ahaSpeedBonus=u.kit.trace['2'][2];b.aha.distance=0;
  for(const t of b.units)t.distance=100000;
  assert.equal(stepBattle(b),true);
  const aha=b.log.find(e=>e.type==='mechanic'&&e.name==='阿哈自然行动');
  assert.ok(aha);near(aha.speed,80+combatPanel(u).speed/5+u.kit.trace['2'][2]);
  near(b.ahaSpeedBonus,0,'加速在自然阿哈结束事件移除');
});

test('砂金•戏浪 Point07：热意触发不创建阿哈；下一次固定阿哈结束时解除速度修正',()=>{
  const b=createBattle(config([actor(1513,{eidolon:1}),actor(1502),mate()]));b.random=()=>0;
  const [u,yg,m,en]=b.units;u.resources['热意']=9;b.activeAction={sequence:222};
  b.rules.afterHit(b,m,en,{spCost:0,type:'Normal'},'direct',{});
  // 该编队含爻光，是双欢愉队伍；PointB2 的加速只应在单欢愉队伍生效。
  near(b.ahaSpeedBonus??0,0,'多欢愉队伍中 PointB2 不提供阿哈加速');
  b.ahaSpeedBonus=u.kit.trace['2'][2]; // 手动设置，单独验证阿哈结束时的清除
  assert.ok(!b.ahaCount,'热意阈值插入不应创建阿哈时刻');
  assert.ok(b.queue.some(q=>q.key==='elationHeat'),'应排队自身插入的【举杯】');
  // 由爻光终结技创建固定计入笑点的阿哈时刻，验证速度修正在该阿哈结束时移除。
  b.rules.after(b,yg,'ultimate','ultimate',yg.actions.ultimate,[yg],[]);
  assert.ok(b.ahaInstant,'爻光终结应创建固定阿哈时刻');
  stepBattle(b);
  near(b.ahaSpeedBonus,0,'固定计入笑点的阿哈结束也触发持续时间移除');
});

test('砂金•戏浪 Point07：发放者阵亡后阿哈仍保有加速直到自然时刻结束',()=>{
  const b=createBattle(config([actor(1513),actor(1501)]));b.random=()=>0;
  const [u]=b.units,enemyUnit=b.units.find(t=>t.side==='enemy');
  b.ahaSpeedBonus=u.kit.trace['2'][2];receiveDamage(b,enemyUnit,u,u.hp+1,'true');
  b.aha.distance=0;for(const t of b.units)if(t.side==='ally')t.distance=100000;
  assert.equal(stepBattle(b),true);
  const aha=b.log.find(e=>e.type==='mechanic'&&e.name==='阿哈自然行动');
  near(aha.speed,80+b.units.filter(t=>t.side==='ally'&&t.path==='欢愉'&&t.kit?.characterId!==1513).reduce((sum,t,i)=>sum+combatPanel(t).speed/(5*2**i),0)+25,'加速作用于阿哈自身，不随发放者死亡提前失效');
  near(b.ahaSpeedBonus,0);
});

test('砂金•戏浪：行迹 point08 使队友攻击后我方全体暴击伤害 +#2 持续 #3 回合、自身额外 +#4 热意，最多 #5 次且战技重置',()=>{
  const b=createBattle(config([actor(1513),mate()]));b.random=()=>0;
  const [u,m,en]=b.units,T=u.kit.trace['3'];
  for(let i=0;i<T[4]+2;i++){b.activeAction={sequence:100+i};b.rules.afterHit(b,m,en,{spCost:0,type:'Normal'},'direct',{});}
  assert.equal(u.resources['旧梦淘金已用'],T[4],'最多触发 #5 次');
  const e=m.buffs.find(x=>x.id===u.id+':aw-e8b:'+m.id);
  near(e.value,T[1]);assert.equal(e.remaining,T[2]);
  b.rules.after(b,u,'skill','normal',u.actions.skill,[en],[en]);
  assert.equal(u.resources['旧梦淘金已用'],0,'施放战技应重置');
  // 自身暴伤 = 常驻 #1 + 触发后的 #2（两者是 desc 里两条独立效果）
  near(combatPanel(u).critDmg,panel().critDmg+T[0]+T[1]);
});

test('砂金•戏浪：持有好活当赏时战技额外 #2、终结技额外 #3 量子欢愉伤害',()=>{
  const b=createBattle(config([actor(1513)]));b.random=()=>0;
  const [u,en]=b.units,p=u.kit.params;
  b.rules.after(b,u,'skill','normal',u.actions.skill,[en],[en]);
  assert.equal(elationHits(b).length,0);
  u.resources['好活当赏']=50;
  b.rules.after(b,u,'skill','normal',u.actions.skill,[en],[en]);
  assert.equal(elationHits(b).length,1);
  near(baseOf(elationHits(b).at(-1)),elationBaseOf(u,p.Talent[1]));
  b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[en],[en]);
  assert.equal(elationHits(b).length,2);
  near(baseOf(elationHits(b).at(-1)),elationBaseOf(u,p.Talent[2]));
});

test('砂金•戏浪 All in：固定弹射使用 18% 倍率，热意追加弹射使用 21% 倍率并逐段结算',()=>{
  const b=createBattle(config([actor(1513)]));b.random=()=>0;
  const [u,en]=b.units;
  u.resources.AllIn=1;u.resources['热意']=3;
  const boosted=b.rules.prepare(b,u,'elation','aha',u.actions.elation);
  assert.deepEqual(boosted.bounceGroups.map(g=>[g.count,g.terms[0].multiplier]),[[10,.18],[3,.21]]);
  // 将刚生成的实战欢愉技动作放进真实行动解析器，验证通用引擎按分组倍率逐段伤害。
  u.actions.basic=boosted;
  force(b,u,'basic');
  const hits=dmgOf(b,u.id,'elation');
  assert.equal(hits.length,14,'1 次全体主击 + 10 次固定弹射 + 3 次热意弹射');
  const main=baseOf(hits[0]);
  for(const hit of hits.slice(1,11))near(baseOf(hit)/main,.18/.6,1e-9,'固定弹射 18%');
  for(const hit of hits.slice(11))near(baseOf(hit)/main,.21/.6,1e-9,'热意弹射 21%');
});

test('砂金•戏浪 E2/E6：每次欢愉技加 4 热意，施放两次后强制 All in；阿哈外不消耗热意',()=>{
  const b=createBattle(config([actor(1513,{eidolon:6})]));b.random=()=>0;
  const [u,en]=b.units;
  for(let i=0;i<2;i++)b.rules.after(b,u,'elation','aha',u.actions.elation,[en],[en]);
  assert.equal(u.resources['欢愉技施放次数'],2,'计数应按实际欢愉技施放累计');
  assert.equal(u.resources['热意'],8,'E2 每次欢愉技施放后获得 #2=4 热意');
  const forced=b.rules.prepare(b,u,'elation','normal',u.actions.elation);
  assert.equal(forced.name,'All in！敬炽烈一夏','第 2 次施放完成后的所有欢愉技转为 All in');
  assert.equal(forced.preserveHeatOutsideAha,true);
  b.rules.before(b,u,'elation','normal',forced,[en]);
  assert.equal(u.resources['热意'],8,'E6 阿哈时刻外的 All in 额外伤害不消耗热意');
});

test('砂金•戏浪：E1 抗穿 #1、E4 施放战技后我方全体无视 #1 防御 #2 回合、行迹 point06 速度换算欢愉度、point08 暴伤 #1、E6 欢愉增笑 #2',()=>{
  const b=createBattle(config([actor(1513,{eidolon:6}),mate()]));b.random=()=>0;
  const [u,m,en]=b.units,T=u.kit.trace['1'],T8=u.kit.trace['3'];
  near(combatPanel(u).elation,T[1]);
  u.panel.speed=T[0]+T[2]*3;
  near(combatPanel(u).elation,T[1]+T[3]*3);
  near(combatPanel(u).critDmg,panel().critDmg+T8[0]);
  b.rules.before(b,u,'skill','normal',u.actions.skill,[en]);
  const e=m.buffs.find(x=>x.id===u.id+':aw-e4:'+m.id);
  near(e.value,u.kit.ranks[4][0]);assert.equal(e.remaining,u.kit.ranks[4][1]);
  near(b.rules.modifiers(b,u,en,{type:'Normal'},'direct').resPen,u.kit.ranks[1][0]);
  near(b.rules.modifiers(b,u,en,{type:'ElationDamage'},'elation').elationBoost,u.kit.ranks[6][1]);
});

test('砂金•戏浪：秘技对敌方全体造成 #1 攻击力量子伤害并给 #2 热意与 #3 好活当赏',()=>{
  const b=createBattle(config([actor(1513,{technique:true})]));b.random=()=>0;
  const [u]=b.units,p=u.kit.params;
  const tech=dmgOf(b,u.id,'technique');
  assert.equal(tech.length,1);
  near(baseOf(tech[0]),combatPanel(u).atk*p.Maze[0]);
  assert.ok((u.resources['热意']??0)>=p.Maze[1]);
  assert.ok((u.resources['好活当赏']??0)>=p.Maze[2]);
});

test('砂金•戏浪单欢愉队伍：欢愉技按追加攻击触发装备条件，但伤害仍记为欢愉伤害',()=>{
  const source=data.traces.find(t=>t.id===1513102);
  assert.match(source?.desc??'',/只存在砂金•戏浪1名.*欢愉.*视为发动了<u>追加攻击/u,'4.6 Point07原文应明确限定单欢愉队伍');
  const b=createBattle(config([actor(1513)]));b.random=()=>0;
  const [u,en]=b.units,s=structuredClone(SET_TABLES[115]);
  u.gear.sets=[{id:115,count:4,name:'大公',...s}];
  const prepared=b.rules.prepare(b,u,'elation','aha',u.actions.elation);
  assert.equal(prepared.countAsFollowup,true,'单欢愉队伍的Point07应在战斗开始锁定追击分类');
  near(b.rules.modifiers(b,u,en,prepared,'elation').dmgBoost,s.p2[0],'大公两件的追击增伤应生效');
  u.actions.basic=prepared;force(b,u,'basic');
  const hits=dmgOf(b,u.id,'elation');
  assert.ok(hits.length>=1);
  assert.ok(hits.every(e=>e.triggerKind==='followup'),'事件须同时保留 elation 伤害类型和 followup 触发类型');
  near(combatPanel(u).atk,panel().atk*(1+Math.min(s.p4[1],hits.length)*s.p4[0]),'欢愉伤害仍记为 elation，但大公四件按每次追击命中叠层');
  const multi=createBattle(config([actor(1513),actor(1501)]));
  const [multiAventurine]=multi.units;
  assert.equal(multi.rules.prepare(multi,multiAventurine,'elation','aha',multiAventurine.actions.elation).countAsFollowup,undefined,
    '队伍存在其他欢愉角色时不应套用单欢愉追击分类');
});

// ───────────────────────── 欢愉伤害统一口径 ─────────────────────────
test('欢愉伤害使用等级基值、欢愉度与好活当赏乘区，且以 ElationDamage 记录',()=>{
  const b=createBattle(config([actor(1513)]));b.random=()=>0;
  const [u,en]=b.units,p=u.kit.params;
  u.resources['好活当赏']=10;
  b.laughter.ally=100; // 故意与个人好活当赏拉开，验证阿哈外必须读施伤者个人资源。
  b.rules.after(b,u,'skill','normal',u.actions.skill,[en],[en]);
  const hit=elationHits(b)[0];
  assert.ok(hit,'应产生欢愉伤害事件');
  near(baseOf(hit),elationBaseOf(u,p.Talent[1]),'阿哈外附加欢愉伤害应使用个人好活当赏，而不是团队笑点');
  assert.equal(hit.kind,'elation');
  assert.equal(hit.attackType,'ElationDamage');
  assert.equal(hit.critMode,b.config.critMode,'欢愉伤害不是持续伤害，可暴击');
  // 欢愉技（ElationDamage 类型）使用角色模块内按原始技能表取值的倍率。
  for(const id of IDS){
    assert.equal(u.kit.params.ElationDamage,undefined);
    assert.ok(!('ElationDamage' in ROSTER_DATA[id].skills),id+' 的 kit 表不应含 ElationDamage');
  }
});

test('绯英瞰众乐：真实阿哈结算按官方参演编号转出队友好活，E2额外增加本次转化量的50%',()=>{
  const run=eidolon=>{
    const units=[actor(1505,{eidolon}),actor(1506),actor(1501),actor(1502)];
    const b=rawCreateBattle(partialMechanicsFixture(config(units)));
    const before=Object.fromEntries(b.units.filter(u=>u.side==='ally').map(u=>[u.kit.characterId,u.resources['好活当赏']??0]));
    for(const u of b.units)u.distance=100000;
    b.aha.distance=0;
    assert.equal(stepBattle(b),true,'阿哈应执行真实额外回合');
    const end=b.log.find(e=>e.type==='mechanic'&&e.name==='阿哈额外回合结束');
    assert.ok(end,'真实阿哈回合应完成');
    return {b,before,counted:end.counted};
  };
  // 150520 #1：欢愉技本身额外获得 5 点【好活当赏】（E0/E2 的欢愉技等级均为 10）。
  const plainPunchline=ROSTER_DATA[1505].skills['150520'].params['10'].param_list[0];
  for(const [eid,share] of [[0,.5],[2,.75]]){
    const {b,before,counted}=run(eid),after=Object.fromEntries(b.units.filter(u=>u.side==='ally').map(u=>[u.kit.characterId,u.resources['好活当赏']??0]));
    near(after[1502]-before[1502],counted*(1-share),'116号爻光只保留转化后的部分');
    near(after[1501]-before[1501],counted*(1-share),'144号火花只保留转化后的部分');
    near(after[1506]-before[1506],counted,'999号银狼高于绯英，不触发瞰众乐');
    near(after[1505]-before[1505],counted+2*counted*share+plainPunchline+(eid>=1?10:0),'绯英获得自身好活、低编号队友转入部分、150520 基础好活及E1欢愉技奖励');
    const order=b.log.filter(e=>e.type==='action'&&e.kind==='aha').map(e=>b.units.find(u=>u.id===e.actor)?.kit?.characterId);
    assert.deepEqual(order,[1502,1501,1505,1506],'阿哈参演顺序按固定参演编号而非队伍站位');
  }
});

test('绯英瞰众乐边界：未解锁行迹不生效，缺少参演编号的队友不按站位误判',()=>{
  const lockedUnits=[actor(1505,{level:40}),actor(1502),actor(1501),actor(1506)];
  const locked=rawCreateBattle(partialMechanicsFixture(config(lockedUnits)));
  delete locked.units.find(u=>u.kit?.characterId===1505).kit.trace['1'];
  for(const u of locked.units)u.distance=100000;
  locked.aha.distance=0;
  const lockedBefore=Object.fromEntries(locked.units.filter(u=>u.side==='ally').map(u=>[u.id,u.resources['好活当赏']??0]));
  assert.equal(stepBattle(locked),true);
  const lockedEnd=locked.log.find(e=>e.type==='mechanic'&&e.name==='阿哈额外回合结束');
  for(const u of locked.units.filter(u=>u.side==='ally')){
    // 绯英施放自己的欢愉技时仍会按 150520 #1 获得 5 点基础好活，与瞰众乐是否解锁无关。
    const base=u.kit?.characterId===1505?ROSTER_DATA[1505].skills['150520'].params['10'].param_list[0]:0;
    near((u.resources['好活当赏']??0)-lockedBefore[u.id],lockedEnd.counted+base,'行迹未解锁时不发生好活转化');
  }

  const unknownUnits=[actor(1505),actor(1502),actor(1501),actor(1506)];
  const unknownId=unknownUnits[1].id;unknownUnits[1].participantId=Number.NaN;
  const unknown=rawCreateBattle(partialMechanicsFixture(config(unknownUnits)));
  for(const u of unknown.units)u.distance=100000;
  unknown.aha.distance=0;
  const evanescia=unknown.units.find(u=>u.kit?.characterId===1505),unknownActor=unknown.units.find(u=>u.id===unknownId);
  const ownBefore=evanescia.resources['好活当赏']??0;
  assert.equal(stepBattle(unknown),true);
  const unknownEnd=unknown.log.find(e=>e.type==='mechanic'&&e.name==='阿哈额外回合结束');
  near((unknownActor.resources['好活当赏']??0)-20,unknownEnd.counted,'没有参演编号时完整获得资源，不用队伍站位冒充编号');
  near((evanescia.resources['好活当赏']??0)-ownBefore,unknownEnd.counted*1.5+ROSTER_DATA[1505].skills['150520'].params['10'].param_list[0],'只有已知低编号的爻光和火花触发 E0 转化，另加 150520 基础好活');
});

test('绯英终结技：欢愉伤害至少按能量上限计入好活当赏，并取真实随机弹射目标',()=>{
  const enemies=[enemy({id:'e1'}),enemy({id:'e2'}),enemy({id:'e3'})];
  const b=rawCreateBattle(partialMechanicsFixture({...config([actor(1505),...enemies]),units:[actor(1505),...enemies]}));
  const u=b.units.find(t=>t.kit?.characterId===1505),target=b.units.find(t=>t.id==='e1');
  for(const t of b.units)t.distance=100000;
  u.resources['好活当赏']=1;u.energy=u.energyMax;b.random=()=>0;
  u.policy={...u.policy,turnPlan:[{turn:1,key:'ultimate',targetId:target.id}]};u.distance=0;
  assert.equal(stepBattle(b),true,'应执行绯英终结技');
  const elationEvents=b.log.filter(e=>e.type==='damage'&&e.actor===u.id&&e.kind==='elation');
  const event=elationEvents[0];
  assert.ok(event,'应产生全体终结技欢愉伤害');
  near(baseOf(event),elationBaseOf(u,u.kit.params.Talent[5],u.energyMax),'好活当赏低于能量上限时使用能量上限');
  const bounce=b.log.find(e=>e.type==='mechanic'&&e.name==='绯英终结技随机欢愉目标');
  assert.ok(bounce,'应选用真实弹射命中记录');
  const bounced=b.log.filter(e=>e.type==='damage'&&e.actor===u.id&&e.kind==='direct'&&e.segment>1).map(e=>e.target);
  assert.ok(bounced.length>0);
  assert.ok(bounced.includes(bounce.target),'随机欢愉伤害目标必须来自本次终结技真实随机弹射目标');
});

test('秘技削韧：秘技技能自身 stance 为 0 时使用已核对的 MazeNormal stance（30）',()=>{
  const byId=new Map();
  for(const s of data.skills)if(s.type==='MazeNormal')byId.set(s.charId,s.stance?.[0]);
  for(const id of IDS){
    const el={1501:'Fire',1502:'Physical',1503:'Ice',1505:'Physical',1506:'Imaginary',1513:'Quantum'}[id];
    const c={strict:true,maxAV:201,sp:3,maxSP:9,seed:1,critMode:'noncrit',
      units:[actor(id,{technique:true,panel:{...panel(),speed:500}}),enemy({toughnessMax:120,weaknesses:[el],standardBreak:true,rank:'normal'})]};
    const b=createBattle(c);b.random=()=>0;
    const tech=b.log.filter(e=>e.type==='damage'&&e.kind==='technique');
    if(!tech.length)continue;                             // 爻光 / 真珠的秘技不造成伤害
    const drop=b.log.filter(e=>e.type==='toughness')[0]?.value;
    const maze=Object.values(ROSTER_DATA[id].skills).find(x=>x.type==='Maze');
    if(maze.stance[0]>0)assert.equal(drop,120-maze.stance[0],id+' 应取【秘技】自身 stance '+maze.stance[0]);
    else{
      assert.equal(byId.get(id),30,id+' 的 MazeNormal stance 应为 30');
      assert.equal(drop,120-30,id+' 应退回 MazeNormal 的 30');
    }
  }
});

// ───────────────────────── 严格战斗 ─────────────────────────
test('第15批 6 名角色 E0/E3/E6 与既有四人体系混编可完成组件试算（已知缺口角色显式近似）',()=>{
  for(const id of IDS)for(const eidolon of [0,3,6]){
    const x=actor(id,{eidolon}),ar=actor(1015),s=actor(1306),ce=actor(1412);
    x.id='focus';x.energy=x.energyMax;x.policy={...x.policy,autoUltimate:true,allyTargetId:ar.id};
    s.policy.allyTargetId=ar.id;ce.policy.allyTargetId=ar.id;
    const c={strict:true,maxAV:300,sp:3,maxSP:9,seed:3,critMode:'expected',requiredAllies:4,units:[x,s,ar,ce,enemy()]};
    assert.deepEqual(validateBattle(c).map(e=>e),[],id+' E'+eidolon);
    const r=simulateBattle(c);
    assert.ok(r.damage>0,id+' 未造成伤害');
    assertFixtureDisclosure(r,c);
  }
});

test('第15批 角色在多波次组件试算中处理换波 / 阵亡 / 时序（缺口保留并显式披露）',()=>{
  for(const id of IDS){
    const x=actor(id,{eidolon:6}),ar=actor(1015),s=actor(1306),ce=actor(1412);
    x.id='focus';x.energy=x.energyMax;x.policy={...x.policy,autoUltimate:true,allyTargetId:ar.id};
    s.policy.allyTargetId=ar.id;ce.policy.allyTargetId=ar.id;
    const c={strict:true,maxAV:900,sp:3,maxSP:9,seed:7,critMode:'expected',requiredAllies:4,
      units:[x,s,ar,ce,enemy({panel:{...panel(),hp:6000,speed:1}}),
        enemy({id:'enemy-w2',wave:2,panel:{...panel(),hp:6000,speed:1}}),
        enemy({id:'enemy-w3',wave:3,panel:{...panel(),hp:6000,speed:1}})]};
    assert.deepEqual(validateBattle(c).map(e=>e),[],id);
    const r=simulateBattle(c);
    assert.equal(r.outcome,'victory',id+' 未能完成三波战斗');
    assertFixtureDisclosure(r,c);
  }
});

test('欢愉额外动作已取得后跨波保留；绯英累计能量越过240时保留余量',()=>{
  const cases=[
    [1501,'basic','extra'], // 火花 E2
    [1503,'basic','extra'], // 真珠美学底本额外回合
    [1505,'followup','followup'], // 绯英狐狸老师
    [1505,'elation','followup'], // 绯英 E1
    [1506,'basic','extra'], // 银狼 E2
  ];
  for(const [id,key,kind] of cases){
    const u=actor(id,{eidolon:id===1501||id===1503||id===1505||id===1506?6:0});u.id='carry-'+id;
    const first=enemy({id:'wave1-'+id,wave:1});
    const second=enemy({id:'wave2-'+id,wave:2});
    const b=createBattle({strict:false,maxAV:201,sp:3,maxSP:9,seed:19,critMode:'noncrit',units:[u,first,second]});
    const liveActor=b.units.find(x=>x.id==='carry-'+id);
    const defeated=b.units.find(x=>x.id==='wave1-'+id);defeated.hp=0;defeated.alive=false;
    b.queue.push({actor:liveActor.id,key,kind,persistWave:true});
    assert.equal(stepBattle(b),true,id+' 第2波应可继续行动');
    assert.equal(b.wave,2,id+' 应先进入第2波');
    assert.ok(b.log.some(e=>e.type==='action'&&e.actor===liveActor.id&&e.key===key&&e.kind===kind),id+' 已获得动作不应因换波丢失');
  }
  const b=createBattle(config([actor(1505)])),u=b.units.find(x=>x.kit?.characterId===1505),en=b.units.find(x=>x.side==='enemy');
  u.resources['狐狸累计']=100;u.resources['能量快照']=0;u.energy=200;
  b.rules.afterDamage(b,u,en,'direct');
  // 300 越过 240 → 余 60；狐狸老师回 10 能再计入，余 70。
  assert.equal(u.resources['狐狸累计'],60+u.kit.params.Talent[3],'已越过的240点门槛应扣除并保留余量，狐狸回能重新计入');
  assert.equal(b.queue.filter(q=>q.actor===u.id&&q.key==='followup').length,1,'越过一个门槛应只排一个狐狸老师');
});

test('绯英：战斗开始的 20 好活也按瞰众乐转化给低参演编号队友',()=>{
  // 本文件的 createBattle 会剥离 battle:start 批次以隔离角色回调；这里必须用原始入口。
  const b=rawCreateBattle(partialMechanicsFixture(config([actor(1505),actor(1502),actor(1501)])));
  const ev=b.units.find(x=>x.kit?.characterId===1505),yg=b.units.find(x=>x.kit?.characterId===1502),sx=b.units.find(x=>x.kit?.characterId===1501);
  // 1502(116) / 1501(144) 都低于 1505(146)，E0 各转 50%；绯英自身 20 + 10 + 10。
  near(ev.resources['好活当赏'],40,'绯英应获得自身 20 + 两名低编号队友各 10');
  near(yg.resources['好活当赏'],10,'爻光只保留转化后的 10 点');
  near(sx.resources['好活当赏'],10,'火花只保留转化后的 10 点');
});

test('砂金：队友无伤战技/欢愉技也触发天赋热意与笑点',()=>{
  for(const key of ['skill','elation']){
    const b=createBattle(config([actor(1513),mate()]));
    const [u,m]=b.units;
    const heat0=u.resources['热意']??0,laugh0=b.laughter.ally??0;
    b.activeAction={sequence:777};
    b.rules.after(b,m,key,'normal',{name:'probe',type:key==='elation'?'ElationDamage':'BPSkill',target:'single',terms:[],toughness:0},[],[]);
    // 天赋热意始终结算；行迹 point08 的额外热意只在普攻/战技/追击/终结（不含欢愉技）。
    const traceHeat=key==='skill'?u.kit.trace['3'][3]:0;
    near(u.resources['热意'],heat0+u.kit.params.Talent[6]+traceHeat,key+' 应给天赋热意');
    // 单欢愉队伍中行迹 point07 的笑点也生效。
    near(b.laughter.ally,laugh0+u.kit.params.Talent[5]+u.kit.trace['2'][3],key+' 应给天赋与行迹笑点');
  }
});

test('1505/1513 已从严格阻断名单移除，四人严格校验通过',()=>{
  for(const id of [1505,1513]){
    assert.equal(KNOWN_MECHANICS_GAPS[id],undefined,id+' 不应再出现在严格阻断名单');
    const cfg=config([actor(id),mate(),mate({id:'mate2'}),mate({id:'mate3'})]);
    assert.deepEqual(rawValidateBattle(partialMechanicsFixture(cfg)),[],id+' 四人编队应通过严格校验');
  }
});

test('1506 150620 常态欢愉技同样吃到 point07 的 20/40 隐藏分档位',()=>{
  const b=createBattle(config([actor(1506)]));const [u,en]=b.units;
  b.laughter.ally=40;u.resources['笑点快照']=40;
  const before=u.resources['隐藏分']??0;
  const a=b.rules.prepare(b,u,'elation','extra',u.actions.elation);
  b.rules.after(b,u,'elation','extra',a,[en],[]);
  const T=u.kit.trace['2'];
  near((u.resources['隐藏分']??0)-before,15+T[2]+T[3],'15 基础 + 20 + 20 档位');
});

console.log(`DeepSeek batch15 checks: ${passed} passed, ${failed} failed, ${skipped} skipped.`);if(failed)process.exitCode=1;
