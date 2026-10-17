// DeepSeek 第 13 批：1004 瓦尔特 / 1225 忘归人 / 1321 大丽花 / 1406 赛飞儿 / 1410 海瑟音 / 1507 千冶•刃 的机制测试。
// 期望值全部由 4.6 编译出的 kit 参数（params / trace / ranks）、`ROSTER_DATA` 的 stance / spBase / hits
// 以及原始脚本的段数与 DynamicHashes 推导，不写死倍率数字；时序用 b.rules.before / after / afterHit /
// afterDamage / onTurnStart / death / beforeLethal 直接驱动，数值用伤害事件的 base 乘区核对。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createContext} from '../core/ctx.mjs';
import {newBattleBuild,buildBattleActor} from '../simulator/builds.mjs';
import {createBattle,stepBattle,simulateBattle,validateBattle,combatPanel} from '../simulator/engine.mjs';
import {validateKitActor} from '../simulator/kits.mjs';
import {ROSTER_DATA} from '../simulator/roster-data.mjs';
import {BREAK_BASE} from '../simulator/game-data.mjs';
import {IDS} from '../simulator/characters/extra/batch13.mjs';
const data=JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url))),ctx=createContext(data);
const near=(a,b,m=1e-6,msg)=>{if(typeof m!=='number'){msg=m;m=1e-6;}assert.ok(Math.abs(a-b)<m,`${a} != ${b}${msg?' ('+msg+')':''}`);};
const panel=()=>({hp:10000,atk:1000,def:1000,speed:100,critRate:.5,critDmg:1,energyRegen:1,effectHit:0,effectRes:0,breakEffect:0,baseStats:{hp:1000,atk:1000,def:1000},elemDmg:{}});
const actor=(id,extra={})=>{const a=buildBattleActor(ctx,{...newBattleBuild(),characterId:id,relicAuto:false,panel:panel(),...extra});a.energy=0;a.policy={...a.policy,autoUltimate:false};return a;};
const enemy=(extra={})=>({id:'enemy',name:'规则训练敌人',side:'enemy',level:90,element:'Physical',panel:{...panel(),hp:1e9,speed:1},energy:0,energyMax:0,res:{},
  actions:{basic:{name:'测试攻击',type:'Normal',terms:[{scaling:'atk',multiplier:1}],hitEnergy:10}},policy:{autoUltimate:false,basicOnly:true},...extra});
// 可击破精英木桩：用于超击破 / 云火昭 / 无弱点削韧等需要韧性与弱点的场景。
const elite=(extra={})=>({id:'elite',name:'规则精英敌人',side:'enemy',level:90,element:'Physical',panel:{...panel(),hp:1e9,speed:1},energy:0,energyMax:0,res:{},
  toughnessMax:120,standardBreak:true,rank:'elite',weaknesses:['Fire','Quantum','Physical','Wind','Thunder','Imaginary'],
  actions:{basic:{name:'测试攻击',type:'Normal',terms:[{scaling:'atk',multiplier:1}],hitEnergy:10}},policy:{autoUltimate:false,basicOnly:true},...extra});
// 我方木桩：用于「队友攻击触发」类机制。
const mate=(extra={})=>({id:'mate',name:'测试队员',side:'ally',level:80,element:'Physical',panel:{...panel(),speed:1},energy:0,energyMax:100,
  actions:{basic:{name:'测试普攻',type:'Normal',element:'Physical',terms:[{scaling:'atk',multiplier:1}],spGain:1,energyGain:20,toughness:30},
    skill:{name:'测试战技',type:'BPSkill',element:'Physical',terms:[{scaling:'atk',multiplier:1}],spCost:1,energyGain:30,toughness:60}},policy:{autoUltimate:false,basicOnly:true},...extra});
const config=(units,en=null,maxAV=201)=>({strict:true,maxAV,sp:3,maxSP:9,seed:42,critMode:'noncrit',units:[...units,en??enemy()]});
const baseOf=ev=>ev.formula.find(f=>f.zone==='base').value;
const dmgOf=(b,id,kind)=>b.log.filter(e=>e.type==='damage'&&e.actor===id&&(kind?e.kind===kind:true));
const hitsOf=id=>ROSTER_DATA[id].hits;
let passed=0,failed=0;const test=(name,fn)=>{try{fn();passed++;console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+'\n'+e.stack);}};

test('batch13 6 名角色 E0～E6 动作合同可编译、不能篡改倍率、各有带倍率的动作',()=>{
  assert.deepEqual([...IDS].sort((a,b)=>a-b),[1004,1225,1321,1406,1410,1507]);
  for(const id of IDS)for(let eidolon=0;eidolon<=6;eidolon++){
    const a=actor(id,{eidolon});assert.deepEqual(validateKitActor(a),[]);assert.deepEqual(a.unsupported,[]);
    const key=Object.keys(a.actions).find(k=>(a.actions[k]?.terms??[]).length);
    assert.ok(key,id+' 没有任何带倍率的动作');
    a.actions[key].terms[0].multiplier=99;assert.ok(validateKitActor(a).length,id+' 篡改倍率未被发现');}
});

test('batch13 段数 / 权重与原始脚本一致（主目标节点逐条对齐 ROSTER_DATA.hits）',()=>{
  const welt=actor(1004,{eidolon:6}),fugue=actor(1225),cipher=actor(1406),hys=actor(1410),blade=actor(1507);
  assert.deepEqual(welt.actions.ultimate.hitShares,hitsOf(1004).Avatar_Welt_00_Skill03_Phase02);
  assert.equal(welt.actions.skill.hitShares.length,3);                       // 主节点 + 2 个无条件弹射节点
  assert.equal(welt.actions.skill.bounceCount,1);                           // E6 的 ByRankActivated 追加节点
  near(welt.actions.skill.hitShares.reduce((a,c)=>a+c,0),1,1e-9);
  assert.deepEqual(fugue.actions.ultimate.hitShares,hitsOf(1225).Avatar_Fugue_00_Skill03_Phase02);
  assert.equal(fugue.actions.enhancedBasic.target,'blast');                 // Skill11 主 + 相邻两个节点
  assert.deepEqual(cipher.actions.skill.hitShares,
    hitsOf(1406).Avatar_Cipher_00_Skill02_Phase02.filter((_,i)=>i%2===0));  // 只取主目标 HitSplitRatio
  assert.deepEqual(cipher.actions.followup.hitShares,hitsOf(1406).Avatar_Cipher_00_PassiveSkill01_Insert_Phase02);
  assert.deepEqual(hys.actions.basic.hitShares,hitsOf(1410).Avatar_Harscyline_00_Skill01_Phase02);
  assert.deepEqual(blade.actions.enhancedBasic.hitShares,hitsOf(1507).Avatar_MortenaxBlade_00_Skill11_Phase02);
  assert.equal(blade.actions.skill.bounceCount,blade.kit.params.BPSkill[1]); // LoopExecuteTaskListWithInterval
  for(const a of [welt,fugue,cipher,hys,blade])for(const key of Object.keys(a.actions))
    near(a.actions[key].hitShares.reduce((x,y)=>x+y,0),1,1e-9,key);
  assert.equal(blade.actions.skill.spCost,0);                                // 150702 bpNeed=-1：不消耗战技点
  assert.equal(blade.actions.ultimate.terms.length,0);                       // 150703 为变身，无伤害节点
  assert.equal(blade.actions.enhancedUltimate.target,'all');                 // 150714 Skill31_Phase02 = 2 段全体
  assert.equal(hitsOf(1507).Avatar_MortenaxBlade_00_Skill31_Phase02.length,2);
});

test('1004 瓦尔特：普攻 30 削韧、战技 3 段每段 #1、E6 追加 1 次随机单体伤害（真实战斗结算）',()=>{
  for(const eidolon of [0,6]){
    const u=actor(1004,{eidolon}),b=createBattle(config([u]));b.random=()=>0;
    const self=b.units[0],p=self.kit.params;
    stepBattle(b);
    assert.equal(b.log.find(e=>e.type==='action'&&e.actor===self.id).key,'skill');
    const seg=dmgOf(b,self.id,'direct');
    assert.equal(seg.length,3+(eidolon>=6?1:0),'战技真段数不符');
    for(const e of seg)near(baseOf(e),1000*p.BPSkill[0],1e-6,'每段应各为 #1');
    assert.equal(self.actions.basic.toughness,ROSTER_DATA[1004].skills['100401'].stance[0]);
    assert.equal(self.actions.skill.toughness,ROSTER_DATA[1004].skills['100402'].stance[0]);
    assert.equal(self.actions.ultimate.toughness,ROSTER_DATA[1004].skills['100403'].stance[1]);
  }
});

test('1004 瓦尔特：战技按 #2 基础概率减速（E4 +35%），天赋对减速目标追加 #1 附加伤害并回能（E2）',()=>{
  const b=createBattle(config([actor(1004,{eidolon:2})]));b.random=()=>0;
  const [u,en]=b.units,p=u.kit.params;
  b.rules.after(b,u,'skill','normal',u.actions.skill,[en],[en]);
  const slow=en.buffs.find(e=>e.tag==='weltSlow');
  assert.ok(slow,'战技未施加减速');near(slow.value,-p.BPSkill[2]);assert.equal(slow.remaining,p.BPSkill[3]);
  const add=dmgOf(b,u.id,'additional');
  assert.equal(add.length,1,'减速目标应触发 1 次天赋附加伤害');
  near(baseOf(add[0]),1000*p.Talent[0]);
  near(u.energy,u.kit.ranks[2][0],'E2 应回 3 能');
  // 未减速目标不触发天赋
  en.buffs=en.buffs.filter(e=>e.tag!=='weltSlow');
  b.rules.after(b,u,'basic','normal',u.actions.basic,[en],[en]);
  assert.equal(dmgOf(b,u.id,'additional').length,1);
  // E4 使减速基础概率提高 +35%：效果命中 50% / 效果抵抗 50% 时
  //   E0  c = 0.75×1.5×0.5 = 0.5625 < 0.7 → 被抵抗；E4 c = 1.1×1.5×0.5 = 0.825 > 0.7 → 命中
  for(const [eidolon,expect] of [[0,false],[4,true]]){
    const b2=createBattle(config([actor(1004,{eidolon})]));b2.random=()=>0.7;
    const [u2,en2]=b2.units;
    u2.panel.effectHit=.5;en2.panel={...en2.panel,effectRes:.5};
    b2.rules.after(b2,u2,'skill','normal',u2.actions.skill,[en2],[en2]);
    assert.equal(en2.buffs.some(e=>e.tag==='weltSlow'),expect,'E'+eidolon+' 减速基础概率不符');
  }
});

test('1004 瓦尔特：终结禁锢（延后 #2 + 减速 #4）、行迹「惩戒」易伤、行迹「审判」回能、E1 随后 2 次附加伤害',()=>{
  const b=createBattle(config([actor(1004,{eidolon:1})]));b.random=()=>0;
  const [u,en]=b.units,p=u.kit.params;
  const d0=en.distance;
  b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[en],[en]);
  const imp=en.buffs.find(e=>e.tag==='weltImprison');
  assert.ok(imp&&imp.control==='imprisonment');near(imp.value,-p.Ultra[3]);assert.equal(imp.remaining,1);
  assert.ok(en.distance>d0,'禁锢应行动延后');
  near(en.buffs.find(x=>x.id===u.id+':welt-punish').value,u.kit.trace[1][1],'行迹「惩戒」易伤');
  near(u.energy,u.kit.trace[2][0],'行迹「审判」应额外回 10 能');
  // E1：随后 2 次普攻 / 战技各追加 1 次附加伤害，用尽后不再触发（天赋附加伤害需要目标处于减速状态）
  en.buffs.push({type:'buff',id:'test-slow',name:'测试减速',key:'speedPct',value:-.1,remaining:9,tickOwner:en.id,tickAt:'end',
    appliedTurn:en.turns,source:u.id,debuff:true,tag:'weltSlow'});
  for(let i=0;i<3;i++){
    const before=dmgOf(b,u.id,'additional').length;
    b.rules.after(b,u,'basic','normal',u.actions.basic,[en],[en]);
    const gained=dmgOf(b,u.id,'additional').length-before;
    if(i<2){
      assert.equal(gained,2,'第 '+(i+1)+' 次应同时结算天赋(减速)与 E1 附加伤害');
      near(baseOf(dmgOf(b,u.id,'additional').slice(-1)[0]),1000*p.Normal[0]*u.kit.ranks[1][0]);
    }else assert.equal(gained,1,'E1 次数用尽后只应剩天赋附加伤害');
  }
  assert.equal(u.resources['E1 剩余次数'],0);
});

test('1004 瓦尔特：行迹「裁决」只对弱点击破目标增伤 20%；秘技 100% 基础概率禁锢并延后 20%',()=>{
  const b=createBattle(config([actor(1004)]));b.random=()=>0;
  const [u,en]=b.units;
  near(b.rules.modifiers(b,u,en,{type:'Normal',element:'Imaginary'},'direct').dmgBoost,0);
  en.broken=true;
  near(b.rules.modifiers(b,u,en,{type:'Normal',element:'Imaginary'},'direct').dmgBoost,u.kit.trace[3][0]);
  const b2=createBattle(config([actor(1004,{technique:true})]));b2.random=()=>0;
  const [u2,en2]=b2.units;
  assert.ok(en2.buffs.some(e=>e.tag==='weltImprison'),'秘技应施加禁锢');
  // 初始距离为满条 10000；秘技禁锢按 #2=20% 行动延后
  near(en2.distance,10000+10000*u2.kit.params.Maze[1]);
  assert.equal(dmgOf(b2,u2.id,'technique').length,0,'画地为牢本体无伤害');
});

test('1004 瓦尔特 4.6 强化形态：kit.enhanced 时替换动作表，终结施加【失重】并降防减速、受击延后封顶',()=>{
  // 期望值全部取自 4.6 角色记录的 enhanced 子记录（characters[1004].enhanced['1']）
  const enh=data.characters.find(c=>c.id===1004).enhanced['1'];
  const epl=(sid,lv)=>enh.skills[String(sid)].level[String(lv)].param_list;
  const b=createBattle(config([actor(1004,{eidolon:1})]));b.random=()=>0;
  const [u,en]=b.units;
  u.kit.enhanced=true;u.actions={...u.actions};
  b.rules.onStart(b);                                  // 触发 start 的强化分支
  const elv=u.kit.skillLevels;
  assert.equal(u.actions.skill.hitShares.length,4,'强化战技应为 4 段（主节点 + 3 个弹射节点常驻）');
  near(u.actions.skill.terms[0].multiplier,u.kit.params.BPSkill[0]*4);
  near(u.actions.ultimate.terms[0].multiplier,epl(1100403,elv.Ultra)[0]);
  near(u.energy,enh.skill_trees.point06['1'].param_list[3],'行迹「惩戒」战斗开始回能');
  b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[en],[en]);
  const eu=epl(1100403,elv.Ultra),et=epl(1100404,elv.Talent);
  const w=en.buffs.find(e=>e.tag==='weltWeight');
  assert.ok(w,'强化终结应施加【失重】');
  assert.equal(w.remaining,eu[6],'失重持续 #7 回合');
  near(en.buffs.find(e=>e.id===u.id+':welt-weight-def').value,et[1],'失重降防 #2');
  near(en.buffs.find(e=>e.id===u.id+':welt-weight-spd').value,-et[2],'失重减速 #3');
  // 失重目标受到后续攻击时延后 #5，每目标自身回合最多 #6 次。
  const countKey='失重延后次数:'+en.id,delayed=u.resources[countKey]??0;
  const d0=en.distance;
  b.rules.afterHit(b,u,en,u.actions.basic,'direct',{});
  near(en.distance-d0,10000*eu[4]);
  assert.equal(u.resources[countKey],delayed+1);
  for(let i=0;i<20;i++)b.rules.afterHit(b,u,en,u.actions.basic,'direct',{});
  assert.equal(u.resources[countKey],eu[5],'每个目标每回合最多 #6 次');
  // 效果命中转攻击力：>#1=40% 时每 #2=10% 提高 #3=20%，上限 #4=80%
  const t=enh.skill_trees.point08['1'].param_list;
  const b3=createBattle(config([actor(1004)]));const u3=b3.units[0];
  u3.kit.enhanced=true;u3.panel.effectHit=.5;
  const out={hp:10000,atk:1000,def:1000,speed:100,effectHit:.5,baseStats:{hp:1000,atk:1000,def:1000}};
  b3.rules.panel(b3,u3,out);
  near(out.atk,1000*(1+Math.min(t[3],Math.floor((0.5-t[0])/t[1])*t[2])));
  // 强化形态 E1：战技击中失重目标后额外造成 1 次 = 终结技倍率 #1 的附加伤害（与天赋附加伤害各 1 次）
  const n0=dmgOf(b,u.id,'additional').length;
  b.rules.after(b,u,'skill','normal',u.actions.skill,[en],[en]);
  const added=dmgOf(b,u.id,'additional').slice(n0);
  assert.equal(added.length,2,'应结算天赋(失重)与 E1 两次附加伤害');
  near(baseOf(added[0]),1000*et[0],'天赋附加伤害');
  near(baseOf(added[1]),1000*eu[0]*enh.ranks['1'].param_list[0],'E1 附加伤害 = 终结技倍率 40%');
});

test('1004 瓦尔特强化形态从配装编译器可选且合同有效',()=>{
  const u=actor(1004,{variant:'enhanced',eidolon:6});
  assert.equal(u.kit.variant,'enhanced');assert.equal(u.kit.enhanced,true);assert.match(u.name,/强化/);
  assert.deepEqual(validateKitActor(u),[]);
});

test('1004 强化形态编译后真实启用四段战技与行迹开场回能',()=>{
  const b=createBattle(config([actor(1004,{variant:'enhanced'})])),u=b.units[0];
  assert.equal(u.actions.skill.hitShares.length,4);
  assert.equal(u.resources['失重延后次数:enemy'],undefined,'未受击时不得消耗失重延后次数');
  assert.equal(u.energy,ROSTER_DATA[1004].traces.find(t=>String(t.id).endsWith('point06'))?.params?.[3]??30);
});

test('1004 强化终结从编译形态施加失重与 12% 禁锢行动延后',()=>{
  const b=createBattle(config([actor(1004,{variant:'enhanced'})])),u=b.units[0],to=b.units.at(-1);
  const beforeDistance=to.distance;
  b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[to],[to]);
  assert.ok(to.buffs.some(e=>e.tag==='weltWeight'));
  near(to.distance,beforeDistance+1200,'强化禁锢应使用 12% 延后');
  assert.ok(to.buffs.some(e=>e.id===u.id+':welt-weight-def'));
  assert.ok(to.buffs.some(e=>e.id===u.id+':welt-weight-spd'));
});

test('1004 强化失重只响应施加后的真实队友命中，且逐目标独立计数封顶',()=>{
  const b=createBattle(config([actor(1004,{variant:'enhanced'}),mate(),enemy({id:'enemy-a'})],enemy({id:'enemy-b'}),201));
  const [u,ally,a,c]=b.units,initialA=a.distance,initialC=c.distance;
  b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[a,c],[a,c]);
  near(a.distance-initialA,1200,'终结伤害后才施加失重，因此不追溯触发4%');
  near(c.distance-initialC,1200,'每个目标分别只接受禁锢延后');
  const targets=[a,c,a,c,a,c,a,c,a,a,a,a];
  ally.policy={...ally.policy,basicOnly:true,turnPlan:targets.map((to,i)=>({turn:i+1,key:'basic',targetId:to.id}))};
  for(let i=0;i<targets.length;i++){ally.distance=0;assert.ok(stepBattle(b),'队友攻击行动未执行');}
  assert.equal(ally.turns,targets.length);
  assert.equal(u.resources['失重延后次数:'+a.id],8,'A目标八次后封顶');
  assert.equal(u.resources['失重延后次数:'+c.id],4,'B目标独立保留四次');
  near(a.distance-initialA,1200+8*400,'A目标延后12%+8×4%');
  near(c.distance-initialC,1200+4*400,'B目标延后12%+4×4%');
});

test('1004 强化形态 E1 战技击中失重目标触发来源倍率附伤',()=>{
  const b=createBattle(config([actor(1004,{variant:'enhanced',eidolon:1})])),u=b.units[0],to=b.units.at(-1);
  b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[to],[to]);
  const before=dmgOf(b,u.id,'additional').length;
  b.rules.after(b,u,'skill','normal',u.actions.skill,[to],[to]);
  const added=dmgOf(b,u.id,'additional').slice(before);
  assert.equal(added.length,2,'失重天赋附伤 + 强化 E1 附伤');
  near(baseOf(added[1]),1000*1.5*.4,'E1 按强化终结 #1 × ranks[1][0]');
});

test('1004 强化 E4/E6 的抗性穿透与双暴修正从编译形态生效',()=>{
  const b=createBattle(config([actor(1004,{variant:'enhanced',eidolon:6})])),u=b.units[0],to=b.units.at(-1);
  b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[to],[to]);
  const mod=b.rules.modifiers(b,u,to,u.actions.skill,'direct');
  near(mod.resPen,.3,'E4 失重全抗降低');near(mod.critRate,.3);near(mod.critDmg,.6);
});

test('1225 忘归人：战技使指定队友获得【狐祈】、自身进入【炽灼】，普攻替换为强化普攻',()=>{
  const b=createBattle(config([actor(1225),mate()]));b.random=()=>0;
  const [u,m,en]=b.units,p=u.kit.params;
  b.rules.before(b,u,'skill','normal',u.actions.skill,[m]);
  const fox=m.buffs.find(e=>e.tag==='fugueFox');
  assert.ok(fox,'战技未施加【狐祈】');near(fox.remaining,p.BPSkill[0]);
  near(m.buffs.find(e=>e.key==='breakEffect').value,p.BPSkill[1],'狐祈击破特攻');
  assert.ok(u.buffs.some(e=>e.tag==='fugueBurn'),'自身未进入【炽灼】');
  const prep=b.rules.prepare(b,u,'basic','normal',u.actions.basic);
  assert.equal(prep.name,u.actions.enhancedBasic.name,'炽灼下普攻应替换为强化普攻');
  near(prep.terms[0].multiplier,ROSTER_DATA[1225].skills['122508'].params['6'].param_list[0]);
  near(prep.terms[1].multiplier,ROSTER_DATA[1225].skills['122508'].params['6'].param_list[1]);
  assert.equal(prep.terms[1].target,'adjacent');
  // 行迹「涂山玄设」：首次战技回 1 点战技点
  const b2=createBattle(config([actor(1225),mate()]));b2.random=()=>0;
  const [u2,m2]=b2.units;b2.sp=1;
  b2.rules.before(b2,u2,'skill','normal',u2.actions.skill,[m2]);
  assert.equal(b2.sp,2,'首次战技应返还 1 点战技点');
  near(u2.buffs.find(e=>e.id===u2.id+':fugue-be').value,u2.kit.trace[2][0],'行迹「涂山玄设」击破特攻 +30%');
  void en;
});

test('1225 忘归人：狐祈持有者攻击时按战技 #3 概率降防；无弱点目标按 50% 削韧（临时弱点标记后清理）',()=>{
  const b=createBattle(config([actor(1225),mate()],elite({weaknesses:['Quantum']})));b.random=()=>0;
  const [u,m,en]=b.units,p=u.kit.params;
  b.rules.before(b,u,'skill','normal',u.actions.skill,[m]);
  b.rules.hit(b,m,en,m.actions.basic,'direct');
  assert.ok(en.buffs.some(e=>e.weakness===m.actions.basic.element),'无弱点时应挂临时弱点标记');
  assert.ok(m.buffs.some(e=>e.id===u.id+':fox-half'),'应临时把削韧比例降到 #6=50%');
  b.rules.after(b,m,'basic','normal',m.actions.basic,[en],[en]);
  assert.ok(!en.buffs.some(e=>String(e.id).startsWith(u.id+':fox-weak:')||e.id===u.id+':fox-half'),'动作结束应清理临时标记');
  const dd=en.buffs.find(e=>e.id===u.id+':fugue-def');
  assert.ok(dd,'狐祈持有者攻击应使目标降防');near(dd.value,p.BPSkill[3]);assert.equal(dd.remaining,p.BPSkill[4]);
});

test('1225 忘归人：队友攻击已击破目标按天赋 #1 转化超击破；【云火昭】= 40% 韧性上限并在耗尽时二次击破',()=>{
  const b=createBattle(config([actor(1225),mate()],elite()));b.random=()=>0;
  const [u,m,en]=b.units,p=u.kit.params;
  const cloud=en.buffs.find(e=>e.tag==='fugueCloud');
  assert.ok(cloud,'天赋应给敌人附加【云火昭】');
  near(cloud.stacks,en.toughnessMax*p.Talent[1]);
  en.broken=true;
  b.rules.after(b,m,'basic','normal',m.actions.basic,[en],[en]);
  const sb=dmgOf(b,m.id,'superbreak');
  assert.equal(sb.length,1,'应把本次削韧转化为 1 次超击破伤害');
  near(baseOf(sb[0]),BREAK_BASE[m.level]*m.actions.basic.toughness/30*(1+0)*p.Talent[0],1e-6,'超击破基础值 = 等级基数 × 削韧/30 × 倍率');
  near(en.buffs.find(e=>e.tag==='fugueCloud').stacks,en.toughnessMax*p.Talent[1]-30,'云火昭应按削韧值减少');
  b.rules.after(b,m,'basic','normal',m.actions.basic,[en],[en]);
  assert.ok(!en.buffs.some(e=>e.tag==='fugueCloud'),'云火昭耗尽应移除');
  assert.ok(dmgOf(b,u.id,'break').length>=1,'云火昭破碎应由忘归人再次触发弱点击破伤害');
});

test('1225 忘归人：终结 5 段火伤并无视弱点削韧；E2 终结后全队行动提前 24%；击破延后与回能',()=>{
  const b=createBattle(config([actor(1225,{eidolon:2}),mate()],elite({weaknesses:['Quantum']})));b.random=()=>0;
  const [u,m,en]=b.units;
  const d0=m.distance;
  b.rules.before(b,u,'ultimate','ultimate',u.actions.ultimate,[en]);
  assert.ok(en.buffs.some(e=>e.id===u.id+':fugue-ult-weak:'+en.id),'终结应在结算前挂上无视弱点标记');
  b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[en],[en]);
  near(m.distance,d0-10000*u.kit.ranks[2][1],'E2 应使全队行动提前 24%');
  assert.ok(!en.buffs.some(e=>String(e.id).startsWith(u.id+':fugue-ult-weak:')),'终结后应清理无视弱点标记');
  // 真实战斗：终结技对无火弱点的敌人同样削韧（60 点）
  const b2=createBattle(config([actor(1225)],elite({weaknesses:['Quantum']})));b2.random=()=>0;
  const [u2,en2]=b2.units;
  u2.energy=u2.energyMax;u2.policy={...u2.policy,autoUltimate:true};
  stepBattle(b2);
  assert.ok(en2.toughness<en2.toughnessMax,'终结技应无视弱点属性削减韧性');
  const d1=en.distance;
  u.energy=0;
  b.rules.afterDamage(b,u,en,'break');
  near(en.distance-d1,10000*u.kit.trace[1][0],'行迹「青丘重光」击破延后 15%');
  near(u.energy,u.kit.ranks[2][0],'E2 击破回 3 能');
  assert.ok(m.buffs.some(e=>e.id===u.id+':fugue-star:'+m.id),'行迹「玑星太素」应给队友击破特攻');
});

test('1225 忘归人：秘技使自身行动提前 40% 并对每个敌人施加与战技相同的降防',()=>{
  const b=createBattle(config([actor(1225,{technique:true})],elite()));b.random=()=>0;
  const [u,en]=b.units,p=u.kit.params;
  assert.equal(u.distance,10000*(1-p.Maze[3]),'自身应行动提前 40%');
  const dd=en.buffs.find(e=>e.id===u.id+':fugue-def');
  assert.ok(dd,'秘技应施加降防');near(dd.value,p.BPSkill[3]);assert.equal(dd.remaining,p.BPSkill[4]);
});

test('1321 大丽花：战技开启结界（我方弱点击破效率 +50%）并造成主 + 相邻 #1 伤害',()=>{
  const b=createBattle(config([actor(1321),actor(1410)]));b.random=()=>0;
  const [u,mate2,en]=b.units,p=u.kit.params;
  assert.ok(!u.buffs.some(e=>e.tag==='dahliaField'));
  b.rules.before(b,u,'skill','normal',u.actions.skill,[en]);
  const f=u.buffs.find(e=>e.tag==='dahliaField');
  assert.ok(f,'战技应开启结界');assert.equal(f.remaining,p.BPSkill[1]);assert.equal(f.tickAt,'start');
  // 结界持续期间我方全体弱点击破效率 +#3=50%
  for(const a of [u,mate2])near(combatPanel(a).breakEfficiency,p.BPSkill[2],1e-6,'结界内我方击破效率');
  assert.equal(u.actions.skill.terms[0].multiplier,p.BPSkill[0]);
  assert.equal(u.actions.skill.terms[1].multiplier,p.BPSkill[0]);
  assert.equal(u.actions.skill.terms[1].target,'adjacent');
  // 共舞者：自身 + 击破特攻最高的队友
  assert.ok(u.buffs.some(e=>e.tag==='dahliaDancer'));
});

test('1321 大丽花：终结使敌方全体陷入【败谢】（降防 #3 + 共舞者属性弱点）且伤害按敌人数均分',()=>{
  const c=config([actor(1321),actor(1410)]);c.units=[c.units[0],c.units[1],enemy({id:'e1'}),enemy({id:'e2'})];
  const b=createBattle(c);b.random=()=>0;
  const [u,d2,e1,e2]=b.units,p=u.kit.params;
  const scaled=b.rules.prepare(b,u,'ultimate','ultimate',u.actions.ultimate);
  near(scaled.terms[0].multiplier,p.Ultra[0]/2,'应由敌方全体均分');
  b.rules.before(b,u,'ultimate','ultimate',u.actions.ultimate,[e1,e2]);
  for(const e of [e1,e2]){
    assert.ok(e.buffs.some(x=>x.tag==='dahliaDecay'),'应陷入【败谢】');
    near(e.buffs.find(x=>x.id===u.id+':dahlia-decay-def').value,p.Ultra[2]);
    near(e.buffs.find(x=>x.id===u.id+':dahlia-decay-def').remaining,p.Ultra[1]);
    const weak=e.buffs.filter(x=>x.tag==='dahliaWeak').map(x=>x.weakness);
    assert.ok(weak.includes('Fire')&&weak.includes('Physical'),'应包含所有共舞者属性的弱点');
  }
  void d2;
});

test('1321 大丽花：另一位共舞者攻击触发追加攻击（每回合 1 次、#2 段弹射、E4 追加 5 段），并转化超击破',()=>{
  for(const eidolon of [0,4]){
    const b=createBattle(config([actor(1321,{eidolon}),mate()],elite()));b.random=()=>0;
    const [u,m,en]=b.units,p=u.kit.params;
    en.broken=true;
    b.rules.afterHit(b,m,en,m.actions.basic,'direct');
    const q=b.queue.filter(x=>x.actor===u.id&&x.key==='followup');
    assert.equal(q.length,1,'另一位共舞者攻击应触发追加攻击');
    assert.equal(q[0].targetId,en.id);
    b.queue.length=0;
    b.rules.afterHit(b,m,en,m.actions.basic,'direct');
    assert.equal(b.queue.filter(x=>x.key==='followup').length,0,'同一回合不应再次触发');
  }
  const u0=actor(1321),u4=actor(1321,{eidolon:4});
  assert.equal(u0.actions.followup.bounceCount,u0.kit.params.Talent[1]);
  assert.equal(u4.actions.followup.bounceCount,u4.kit.params.Talent[1]+ROSTER_DATA[1321].ranks[4][2]);
  assert.equal(u0.actions.followup.bounceToughness,ROSTER_DATA[1321].skills['132104'].stance[0]);
});

test('1321 大丽花：追击命中已击破目标按 #3 转化超击破；行迹「致哀」每 2 次追击回 1 点战技点；E6 提前共舞者',()=>{
  const b=createBattle(config([actor(1321,{eidolon:6}),mate()]));b.random=()=>0;
  const [u,m,en]=b.units,p=u.kit.params;
  b.rules.before(b,u,'skill','normal',u.actions.skill,[en]);
  en.broken=true;
  const sp0=b.sp,d0=m.distance;
  b.rules.after(b,u,'followup','followup',u.actions.followup,[en],[en]);
  const sb=dmgOf(b,u.id,'superbreak');
  assert.equal(sb.length,1,'追击命中已击破目标应转化超击破');
  near(baseOf(sb[0]),BREAK_BASE[u.level]*ROSTER_DATA[1321].skills['132104'].stance[0]/30*(1+combatPanel(u).breakEffect)*p.Talent[2]);
  b.rules.after(b,u,'followup','followup',u.actions.followup,[en],[en]);
  assert.equal(b.sp,sp0+1,'每 2 次追击应回 1 点战技点');
  assert.ok(m.distance<d0,'E6 应使共舞者行动提前');
});

test('1321 大丽花：进入战斗恢复 35 能并选定共舞者；E2 敌方全体全属性抗性降低 20%；E1 固定削韧每目标 1 次',()=>{
  const b=createBattle(config([actor(1321,{eidolon:2}),actor(1410)],elite()));b.random=()=>0;
  const [u,d2,en]=b.units,p=u.kit.params;
  near(u.energy,p.Talent[3],'进入战斗应恢复 35 点能量');
  assert.ok(d2.buffs.some(e=>e.tag==='dahliaDancer'),'击破特攻最高的队友应成为共舞者');
  assert.ok(en.buffs.some(e=>e.id===u.id+':dahlia-e2'),'E2 应给入场敌人挂全属性抗性降低');
  near(en.buffs.find(e=>e.id===u.id+':dahlia-e2').value,u.kit.ranks[2][0]);
  assert.ok(en.buffs.some(e=>e.tag==='dahliaDecay'));
  // E1：共舞者攻击后的固定削韧只触发 1 次
  const b2=createBattle(config([actor(1321,{eidolon:1}),mate()],elite()));b2.random=()=>0;
  const [u2,m2,en2]=b2.units,t0=en2.toughness;
  b2.rules.after(b2,m2,'basic','normal',m2.actions.basic,[en2],[en2]);
  const expect=Math.min(ROSTER_DATA[1321].ranks[1][2],Math.max(ROSTER_DATA[1321].ranks[1][1],en2.toughnessMax*ROSTER_DATA[1321].ranks[1][0]));
  near(en2.toughness,t0-expect,'E1 固定削韧应生效');
  b2.rules.after(b2,m2,'basic','normal',m2.actions.basic,[en2],[en2]);
  near(en2.toughness,t0-expect,'同一目标不应再次触发 E1 固定削韧');
});

test('1406 赛飞儿：初始【老主顾】为生命上限最高者；战技使主目标成为老主顾、虚弱并提高自身攻击力',()=>{
  const c=config([actor(1406)]);c.units=[c.units[0],enemy({id:'small',panel:{...panel(),hp:5000,speed:1}}),enemy({id:'big',panel:{...panel(),hp:200000,speed:1}})];
  const b=createBattle(c);b.random=()=>0;
  const [u,small,big]=b.units,p=u.kit.params;
  assert.ok(big.buffs.some(e=>e.tag==='cipherMark'),'老主顾应为生命上限最高者');
  assert.ok(!small.buffs.some(e=>e.tag==='cipherMark'));
  b.rules.before(b,u,'skill','normal',u.actions.skill,[small]);
  assert.ok(small.buffs.some(e=>e.tag==='cipherMark'),'战技主目标应成为老主顾');
  assert.ok(!big.buffs.some(e=>e.tag==='cipherMark'),'老主顾仅对最新目标生效');
  near(small.buffs.find(e=>e.id===u.id+':cipher-weak').value,-p.BPSkill[2]);
  near(u.buffs.find(e=>e.id===u.id+':cipher-atk').value,p.BPSkill[4]);
  assert.equal(small.buffs.find(e=>e.id===u.id+':cipher-weak').remaining,p.BPSkill[3]);
});

test('1406 赛飞儿：记录我方对敌方造成的非真实伤害（主目标 12%、其他敌人 8%），溢出伤害不计',()=>{
  const b=createBattle(config([actor(1406),mate({panel:{...panel(),speed:200}})]));b.random=()=>0;
  const [u,m,en]=b.units;
  assert.equal(u.resources['记录值'],0);
  stepBattle(b);                                     // 队友先手攻击老主顾
  const events=b.log.filter(e=>e.type==='damage'&&(e.actor===m.id||e.actor===u.id));
  assert.ok(events.length>=1,'队友应造成伤害');
  const total=events.reduce((n,e)=>n+e.hpDamage,0);
  near(u.resources['记录值'],total*u.kit.params.Talent[1],1e-6,'记录值应为全部非真实伤害的 12%');
  // 行迹「三百侠盗」：非老主顾敌人按 8% 记录
  en.buffs=en.buffs.filter(e=>e.tag!=='cipherMark');
  const r0=u.resources['记录值'];
  b.rules.afterDamage(b,m,en,'direct');
  const ev=b.log[b.log.length-1];
  near(u.resources['记录值']-r0,(ev.hpDamage??0)*u.kit.trace[2][0]);
});

test('1406 赛飞儿：老主顾被其他我方目标攻击后触发追加攻击（每回合 1 次），E4 另加 #1 附加伤害',()=>{
  const b=createBattle(config([actor(1406,{eidolon:4}),mate()]));b.random=()=>0;
  const [u,m,en]=b.units;
  const n0=dmgOf(b,u.id,'additional').length;
  b.rules.afterHit(b,m,en,m.actions.basic,'direct');
  assert.equal(b.queue.filter(x=>x.key==='followup').length,1);
  assert.equal(dmgOf(b,u.id,'additional').length-n0,1,'E4 应追加 1 次附加伤害');
  near(baseOf(dmgOf(b,u.id,'additional').slice(-1)[0]),1000*u.kit.ranks[4][0]);
  b.queue.length=0;
  b.rules.afterHit(b,m,en,m.actions.basic,'direct');
  assert.equal(b.queue.filter(x=>x.key==='followup').length,0,'每回合最多 1 次');
  b.rules.onTurnStart(b,u);
  b.rules.afterHit(b,m,en,m.actions.basic,'direct');
  assert.equal(b.queue.filter(x=>x.key==='followup').length,1,'新回合应重置');
});

test('1406 赛飞儿：终结按记录值结算真实伤害（5 次共 25% 给主目标 + 75% 均分给目标），E6 返还 20%',()=>{
  for(const eidolon of [0,6]){
    const c=config([actor(1406,{eidolon})]);c.units=[c.units[0],enemy({id:'e1'}),enemy({id:'e2'})];
    const b=createBattle(c);b.random=()=>0;
    const [u,e1,e2]=b.units,p=u.kit.params;
    u.resources['记录值']=1000;
    b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[e1],[e1,e2]);
    const truth=b.log.filter(e=>e.type==='damage'&&e.kind==='true'&&e.target===e1.id);
    const split=b.log.filter(e=>e.type==='damage'&&e.kind==='true'&&e.target===e2.id);
    assert.equal(truth.length,6,'主目标应收 5 次 #2 真实伤害 + 1 次 #3 均分真实伤害');
    for(const e of truth.slice(0,5))near(e.damage,1000*p.Ultra[1]/5);
    near(truth[5].damage,1000*p.Ultra[2]/2);
    assert.equal(split.length,1,'相邻目标应收 1 次均分真实伤害');
    near(split[0].damage,1000*p.Ultra[2]/2);
    near(u.resources['记录值'],eidolon>=6?1000*u.kit.ranks[6][0]:0,'施放终结技后清空记录值（E6 返还 20%）');
  }
});

test('1406 赛飞儿：行迹「偷天换日」敌方全体易伤 40% 且追击暴伤 +100%；E6 追击增伤 350%；E2 命中易伤',()=>{
  const b=createBattle(config([actor(1406,{eidolon:6})]));b.random=()=>0;
  const [u,en]=b.units;
  near(b.rules.modifiers(b,u,en,{type:'Normal',element:'Quantum'},'direct').vuln,u.kit.trace[3][0]);
  near(b.rules.modifiers(b,u,en,{type:'Normal',element:'Quantum'},'followup').critDmg,u.kit.trace[3][1]);
  near(b.rules.modifiers(b,u,en,{type:'Normal',element:'Quantum'},'followup').dmgBoost,u.kit.ranks[6][1]);
  b.rules.after(b,u,'basic','normal',u.actions.basic,[en],[en]);
  assert.ok(en.buffs.some(e=>e.id===u.id+':cipher-e2'),'E2 应施加易伤');
  near(en.buffs.find(e=>e.id===u.id+':cipher-e2').value,u.kit.ranks[2][2]);
});

test('1406 赛飞儿：秘技对敌方全体造成 #3 攻击力伤害并使该次记录值提高 200%',()=>{
  const b=createBattle(config([actor(1406,{technique:true})]));b.random=()=>0;
  const [u,en]=b.units,p=u.kit.params;
  const tech=dmgOf(b,u.id,'technique');
  assert.equal(tech.length,1,'秘技应对每个敌人造成 1 次伤害');
  near(baseOf(tech[0]),1000*p.Maze[2]);
  near(u.resources['记录值'],tech[0].hpDamage*p.Talent[1]*(1+p.Maze[1]),1e-6,'秘技伤害的记录值应提高 200%');
});

test('1410 海瑟音：天赋优先施加不同种类的持续伤害，裂伤按目标生命上限并有攻击力上限',()=>{
  const b=createBattle(config([actor(1410),mate()]));b.random=()=>0;
  const [u,m,en]=b.units,p=u.kit.params;
  for(let i=0;i<4;i++)b.rules.after(b,m,'basic','normal',m.actions.basic,[en],[en]);
  const dots=en.dots.filter(d=>d.hysTalent);
  assert.equal(dots.length,4,'应依次施加 4 种持续伤害');
  assert.equal(new Set(dots.map(d=>d.element)).size,4,'应优先陷入不同状态');
  for(const d of dots)assert.equal(d.remaining,p.Talent[4]);
  const bleed=dots.find(d=>d.element==='Physical');
  near(bleed.value,Math.min(en.panel.hp*p.Talent[2],1000*p.Talent[3]),1e-3);
  const wind=dots.find(d=>d.element==='Wind');
  near(wind.terms[0].multiplier,p.Talent[1]);
  // 第 5 次攻击（4 种齐全）在同 id 上刷新其中 1 种，不新增条目
  b.rules.after(b,m,'basic','normal',m.actions.basic,[en],[en]);
  assert.equal(en.dots.filter(d=>d.hysTalent).length,4,'同类持续伤害应按 id 刷新而非叠加');
});

test('1410 海瑟音：终结展开结界（敌方攻降 #6 / 防降 #3），结界内敌人受持续伤害触发 #4 物理持续伤害且次数封顶',()=>{
  const b=createBattle(config([actor(1410)]));b.random=()=>0;
  const [u,en]=b.units,p=u.kit.params;
  b.rules.before(b,u,'ultimate','ultimate',u.actions.ultimate,[en]);
  assert.ok(u.buffs.some(e=>e.tag==='hysField'),'终结应展开结界');
  near(en.buffs.find(e=>e.id===u.id+':hys-atkdown').value,-p.Ultra[5]);
  near(en.buffs.find(e=>e.id===u.id+':hys-defdown').value,p.Ultra[2]);
  // 敌方受到持续伤害 → 触发结界持续伤害（最多 #5 次，不重复触发自身）
  const cap=p.Ultra[4];
  for(let i=0;i<cap+3;i++)b.rules.afterDamage(b,u,en,'dot');
  const trig=b.log.filter(e=>e.type==='damage'&&e.kind==='dot'&&e.element==='Physical');
  assert.equal(trig.length,cap,'结界触发次数应封顶 #5');
  for(const e of trig)near(baseOf(e),1000*p.Ultra[3]);
  assert.equal(u.resources['结界触发次数'],cap);
  // E6：上限提高至 #1=12 且倍率 +#2=20%
  const b2=createBattle(config([actor(1410,{eidolon:6})]));b2.random=()=>0;
  const [u2,en2]=b2.units,p2=u2.kit.params;
  b2.rules.before(b2,u2,'ultimate','ultimate',u2.actions.ultimate,[en2]);
  for(let i=0;i<u2.kit.ranks[6][0]+3;i++)b2.rules.afterDamage(b2,u2,en2,'dot');
  const trig2=b2.log.filter(e=>e.type==='damage'&&e.kind==='dot'&&e.element==='Physical');
  assert.equal(trig2.length,u2.kit.ranks[6][0]);
  near(baseOf(trig2[0]),1000*p2.Ultra[3]*(1+u2.kit.ranks[6][1]));
  void p2;
});

test('1410 海瑟音：行迹「盛会的泡沫」使终结前已有持续伤害立即结算 150%；E1 持续伤害 +16% 并追加同类状态',()=>{
  const b=createBattle(config([actor(1410,{eidolon:1})]));b.random=()=>0;
  const [u,en]=b.units,p=u.kit.params;
  en.dots.push({type:'dot',id:'test-shock',name:'测试触电',source:u.id,element:'Thunder',remaining:2,tickOwner:en.id,tickAt:'end',
    terms:[{scaling:'atk',multiplier:.3}]});
  b.rules.before(b,u,'ultimate','ultimate',u.actions.ultimate,[en]);
  const bubble=b.log.filter(e=>e.type==='damage'&&e.kind==='dot'&&e.element==='Thunder');
  assert.equal(bubble.length,1,'行迹应使已有持续伤害立即结算 1 次');
  near(baseOf(bubble[0]),1000*.3*u.kit.trace[2][0]);
  near(b.rules.modifiers(b,u,en,{type:'DoT',element:'Thunder'},'dot').dmgBoost,u.kit.ranks[1][0]-1);
  near(b.rules.modifiers(b,u,en,{type:'Normal',element:'Thunder'},'direct').dmgBoost,0,'E1 只作用于持续伤害');
  // 行迹「珍珠的琴弦」：效果命中 100% → 提高 (100-60)/10 × 15% = 60%
  u.panel.effectHit=1;
  near(b.rules.modifiers(b,u,en,{type:'Normal',element:'Thunder'},'direct').dmgBoost,
    Math.min(u.kit.trace[3][3],Math.floor((1-u.kit.trace[3][0])/u.kit.trace[3][1])*u.kit.trace[3][2]));
  // E4：结界期间敌方全属性抗性降低 20%（行迹「征服的剑旗」战斗开始即展开结界）
  const b4=createBattle(config([actor(1410,{eidolon:4})]));b4.random=()=>0;
  const [u4,en4]=b4.units;
  assert.ok(u4.buffs.some(e=>e.tag==='hysField'),'行迹应在战斗开始时展开结界');
  near(b4.rules.modifiers(b4,u4,en4,{type:'Normal',element:'Thunder'},'direct').resPen,u4.kit.ranks[4][0]);
  u4.buffs=u4.buffs.filter(e=>e.tag!=='hysField');
  near(b4.rules.modifiers(b4,u4,en4,{type:'Normal',element:'Thunder'},'direct').resPen,0,'结界解除后不再降抗');
  // 结界内天赋施加持续伤害时 E1 追加一次同类状态
  const b2=createBattle(config([actor(1410,{eidolon:1})]));b2.random=()=>0;
  const [u2,en2]=b2.units;
  b2.rules.before(b2,u2,'ultimate','ultimate',u2.actions.ultimate,[en2]);
  b2.rules.after(b2,u2,'basic','normal',u2.actions.basic,[en2],[en2]);
  assert.equal(en2.dots.filter(d=>d.hysTalent).length,2,'E1 应额外施加 1 次同类持续伤害');
  void p;
});

test('1410 海瑟音：秘技使每个敌人陷入天赋的 2 种状态；行迹「征服的剑旗」战斗开始展开结界并回 1 点战技点',()=>{
  const b=createBattle(config([actor(1410,{technique:true})],elite()));b.random=()=>0;
  const [u,en]=b.units;
  assert.equal(en.dots.filter(d=>d.hysTalent).length,2,'秘技应施加 2 种状态');
  assert.ok(u.buffs.some(e=>e.tag==='hysField'),'行迹应在战斗开始时展开结界');
  assert.equal(u.buffs.find(e=>e.tag==='hysField').remaining,u.kit.trace[1][0]);
  assert.equal(b.sp,4,'展开结界应恢复 1 个战技点');
});

test('1507 千冶•刃：普攻按生命上限结算并施加嘲讽（面板仇恨倍率提高），未变身时不能施放战技',()=>{
  const b=createBattle(config([actor(1507)]));b.random=()=>0;
  const [u,en]=b.units,p=u.kit.params;
  assert.equal(u.actions.basic.terms[0].scaling,'hp');
  near(u.actions.basic.terms[0].multiplier,p.Normal[0]);
  assert.equal(b.rules.shouldUseSkill(b,u),false,'未进入【无量忿怒】不能施放战技');
  stepBattle(b);                                     // 自身先手普攻
  const act=b.log.find(e=>e.type==='action'&&e.actor===u.id);
  assert.equal(act.key,'basic');
  const seg=dmgOf(b,u.id,'direct');
  assert.equal(seg.length,1);
  near(baseOf(seg[0]),10000*p.Normal[0],1e-6,'普攻按生命上限结算');
  assert.ok(en.buffs.some(e=>e.tag==='mortaTaunted'),'普攻应使目标陷入嘲讽');
  assert.equal(en.buffs.find(e=>e.tag==='mortaTaunted').remaining,1);
  const out={hp:10000,atk:1000,def:1000,speed:100,baseStats:{hp:1000,atk:1000,def:1000}};
  b.rules.panel(b,u,out);
  assert.equal(out.aggroRatio,1000,'嘲讽应提高自身被攻击概率');
});

test('1507 千冶•刃：终结变身为【无量忿怒】+结界 +倒计时，替换普攻 / 终结并给敌方【煞火缠身】',()=>{
  const b=createBattle(config([actor(1507,{eidolon:6})]));b.random=()=>0;
  const [u,en]=b.units,p=u.kit.params;
  const hp0=u.hp;
  b.rules.before(b,u,'ultimate','ultimate',u.actions.ultimate,[en]);
  assert.ok(u.buffs.some(e=>e.tag==='mortaRage')&&u.buffs.some(e=>e.tag==='mortaField'));
  near(u.buffs.find(e=>e.id===u.id+':morta-crit').value,p.Ultra[1]);
  near(u.buffs.find(e=>e.id===u.id+':morta-critdmg').value,p.Ultra[2]);
  assert.ok(en.buffs.some(e=>e.tag==='mortaEmber'),'敌方全体应陷入【煞火缠身】');
  near(en.buffs.find(e=>e.id===u.id+':morta-ember-def').value,p.Ultra[6]);
  near(en.buffs.find(e=>e.id===u.id+':morta-ember-vuln').value,p.Ultra[3]);
  near(en.buffs.find(e=>e.id===u.id+':morta-ember-def').remaining,p.Ultra[7]);
  const s=b.summons.find(s=>s.owner===u.id);
  assert.ok(s&&s.kind==='countdown','应出现倒计时召唤物');
  near(s.speed,p.Ultra[4]);
  assert.equal(b.rules.shouldUseSkill(b,u),true,'变身后可施放战技');
  const prep=b.rules.prepare(b,u,'basic','normal',u.actions.basic);
  assert.equal(prep.name,u.actions.enhancedBasic.name);
  near(prep.terms[0].multiplier,ROSTER_DATA[1507].skills['150708'].params[String(u.kit.skillLevels.Normal)].param_list[0]);
  const prepU=b.rules.prepare(b,u,'ultimate','ultimate',u.actions.ultimate);
  assert.equal(prepU.name,u.actions.enhancedUltimate.name);
  near(prepU.terms[0].multiplier,ROSTER_DATA[1507].skills['150714'].params[String(u.kit.skillLevels.Ultra)].param_list[0]*u.kit.ranks[6][0]);
  // 倒计时回合开始 → 解除结界
  b.rules.summonTurn(b,u,s);
  assert.ok(!u.buffs.some(e=>e.tag==='mortaRage'),'倒计时应退出【无量忿怒】');
  assert.ok(!s.active);
  void hp0;
});

test('1507 千冶•刃：战技不消耗战技点、消耗 10% 生命上限、全体 #1 + #2 次随机 #3（额外战技视为追击）',()=>{
  const u=actor(1507),p=u.kit.params;
  assert.equal(u.actions.skill.spCost,0);
  assert.equal(u.actions.skill.hpCostRatio,p.BPSkill[3]);
  assert.equal(u.actions.skill.bounceCount,p.BPSkill[1]);
  assert.equal(u.actions.skill.bounceTerms[0].scaling,'hp');
  near(u.actions.skill.bounceTerms[0].multiplier,p.BPSkill[2]);
  assert.equal(u.actions.skill.terms[0].scaling,'hp');
  near(u.actions.skill.terms[0].multiplier,p.BPSkill[0]);
  assert.equal(u.actions.followup.name,u.actions.skill.name);
  assert.equal(u.actions.followup.type,'BPSkill');
  assert.equal(u.actions.followup.spCost,0);
  assert.equal(u.actions.followup.hpCostRatio,ROSTER_DATA[1507].skills['150709'].params['10'].param_list[0]);
  // 真实战斗：变身后引擎选择战技 → 扣血 + 全体 1 段 + #2 次随机单体
  const b=createBattle(config([actor(1507)]));b.random=()=>0;
  const [self,en]=b.units;
  const hp0=self.hp;
  b.rules.before(b,self,'ultimate','ultimate',self.actions.ultimate,[en]);
  assert.equal(b.rules.shouldUseSkill(b,self),true,'变身后可施放战技');
  stepBattle(b);
  assert.equal(b.log.find(e=>e.type==='action'&&e.actor===self.id).key,'skill');
  assert.ok(self.hp<hp0,'战技应消耗生命上限 10%');
  const dmg=b.log.filter(e=>e.type==='damage'&&e.actor===self.id&&e.frame?.action?.key==='skill');
  assert.equal(dmg.length,1+self.kit.params.BPSkill[1],'全体 1 段 + #2 次随机单体');
  near(baseOf(dmg[0]),10000*self.kit.params.BPSkill[0]);
  for(const e of dmg.slice(1))near(baseOf(e),10000*self.kit.params.BPSkill[2]);
});

test('1507 千冶•刃：天赋充能 9 点（E2 降为 7）后消耗 9 点回 25 能并额外施放 1 次战技',()=>{
  for(const eidolon of [0,2]){
    const b=createBattle(config([actor(1507,{eidolon}),mate()]));b.random=()=>0;
    const [u,m,en]=b.units,p=u.kit.params;
    b.rules.before(b,u,'ultimate','ultimate',u.actions.ultimate,[en]);
    u.energy=0;
    const cap=eidolon>=2?u.kit.ranks[2][1]:p.Talent[0];
    for(let i=0;i<cap-1;i++)b.rules.after(b,m,'basic','normal',m.actions.basic,[en],[en]);
    assert.equal(u.resources['充能'],cap-1);
    assert.equal(b.queue.filter(x=>x.key==='followup').length,0);
    b.rules.after(b,m,'basic','normal',m.actions.basic,[en],[en]);
    assert.equal(u.resources['充能'],0,'满充能应被消耗');
    near(u.energy,p.Talent[1],'应恢复 25 点能量');
    assert.equal(b.queue.filter(x=>x.actor===u.id&&x.key==='followup').length,1,'应额外施放 1 次战技（追加攻击）');
    b.queue.length=0;
    // E1：施放天赋额外战技后使倒计时行动延后 #2=15%
    const s=b.summons.find(s=>s.owner===u.id);
    if(eidolon>=1){
      const d0=s.distance;
      b.rules.after(b,u,'followup','followup',u.actions.followup,[en],[en]);
      near(s.distance-d0,10000*u.kit.ranks[1][1],'E1 应使倒计时行动延后 15%');
    }
  }
});

test('1507 千冶•刃：结界期间受伤获得充能（E6 每回合 1 次）、行迹减伤/增疗、E1 全抗降低、行迹「万淬心」增伤',()=>{
  const b=createBattle(config([actor(1507,{eidolon:6}),mate(),actor(1410)]));b.random=()=>0;
  const [u,m,nih]=b.units;
  b.rules.before(b,u,'ultimate','ultimate',u.actions.ultimate,[b.units.at(-1)]);
  const out={hp:10000,atk:1000,def:1000,speed:100,baseStats:{hp:1000,atk:1000,def:1000}};
  b.rules.panel(b,u,out);
  near(out.dmgReduction,1-(1-0)*(1-u.kit.trace[2][1]),'行迹「千锻魂」减伤 50%');
  near(out.incomingHeal,u.kit.trace[2][2]);
  u.resources['充能']=0;
  b.rules.afterDamage(b,m,u,'direct');
  assert.equal(u.resources['充能'],1,'E6 受伤应获得 1 点充能');
  b.rules.afterDamage(b,m,u,'direct');
  assert.equal(u.resources['充能'],1,'同一回合只应触发 1 次');
  const en=b.units.at(-2);
  near(b.rules.modifiers(b,u,en,{type:'Normal',element:'Fire'},'direct').dmgBoost,
    u.kit.trace[3][0]+u.kit.ranks[4][0],'行迹「万淬心」+E4 增伤');
  near(b.rules.modifiers(b,u,en,{type:'Ultra',element:'Fire'},'direct').dmgBoost,
    u.kit.trace[3][0]+u.kit.ranks[4][0]+u.kit.trace[3][1],'存在其他虚无角色时终结技增伤');
  assert.ok(nih);
  void m;
});

test('1507 千冶•刃：结界期间致命伤害不阵亡、退出状态并回复 50% 生命上限；行迹「百炼骨」满能量净化',()=>{
  const b=createBattle(config([actor(1507)]));b.random=()=>0;
  const [u,en]=b.units,p=u.kit.params;
  b.rules.before(b,u,'ultimate','ultimate',u.actions.ultimate,[en]);
  assert.equal(b.rules.beforeLethal(b,en,u,1),true,'结界期间应免于无法战斗');
  assert.ok(!u.buffs.some(e=>e.tag==='mortaRage'),'应解除结界退出【无量忿怒】');
  u.hp=1;
  b.rules.afterDamage(b,en,u,'direct');
  assert.ok(u.hp>1,'应回复生命值');
  near(u.hp,1+10000*p.Ultra[5],1e-6);
  // 行迹「百炼骨」：满能量解除自身所有负面效果
  u.buffs.push({id:'deb',name:'负面',key:'defShred',value:.1,remaining:2,tickOwner:u.id,tickAt:'end',debuff:true,source:en.id});
  b.rules.before(b,u,'ultimate','ultimate',u.actions.ultimate,[en]);
  u.energy=u.energyMax;
  b.rules.after(b,u,'basic','normal',u.actions.basic,[en],[en]);
  assert.ok(!u.buffs.some(e=>e.id==='deb'),'满能量应净化负面效果');
});

test('1507 千冶•刃：秘技使敌方全体陷入嘲讽并降低自身受到的伤害 90%',()=>{
  const b=createBattle(config([actor(1507,{technique:true})],elite()));b.random=()=>0;
  const [u,en]=b.units,p=u.kit.params;
  assert.ok(en.buffs.some(e=>e.tag==='mortaTaunted'),'秘技应使敌人陷入嘲讽');
  assert.equal(en.buffs.find(e=>e.tag==='mortaTaunted').remaining,1);
  near(u.buffs.find(e=>e.id===u.id+':morta-maze-dr').value,p.Maze[0]);
  assert.equal(u.buffs.find(e=>e.id===u.id+':morta-maze-dr').remaining,p.Maze[1]);
});

test('第13批 6 名角色与既有四人体系混编可完成严格战斗，无未支持缺口',()=>{
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

test('第13批 角色在多波次严格战斗中处理换波 / 阵亡 / 持续伤害与时序，无未支持缺口',()=>{
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

console.log(`DeepSeek batch13 checks: ${passed} passed, ${failed} failed.`);if(failed)process.exitCode=1;
