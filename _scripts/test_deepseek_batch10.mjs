// DeepSeek 第 10 批：1208 符玄 / 1304 砂金 / 1206 素裳 / 1220 飞霄 / 1224 三月七(巡猎) / 1305 真理医生
// 的机制测试。期望值全部由 4.6 编译出的 kit 参数（params / trace / ranks）推导，不写死倍率；
// 时序用 b.rules.before / after / afterDamage / attacked / beforeLethal / prepare / turnStart 直接驱动，
// 数值用伤害事件的 base 乘区（= 面板 × 倍率）核对（引擎的 damage 日志不带动作名，
// 因此按 kind / 元素 / base 值区分动作）。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createContext} from '../core/ctx.mjs';
import {newBattleBuild,buildBattleActor} from '../simulator/builds.mjs';
import {createBattle,stepBattle,simulateBattle,validateBattle,combatPanel} from '../simulator/engine.mjs';
import {validateKitActor} from '../simulator/kits.mjs';
import {ROSTER_DATA} from '../simulator/roster-data.mjs';
import {IDS} from '../simulator/characters/extra/batch10.mjs';
const data=JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url))),ctx=createContext(data);
const near=(a,b,m=1e-6,msg)=>{if(typeof m!=='number'){msg=m;m=1e-6;}assert.ok(Math.abs(a-b)<m,`${a} != ${b}${msg?' ('+msg+')':''}`);};
const panel=()=>({hp:10000,atk:1000,def:1000,speed:100,critRate:.5,critDmg:1,energyRegen:1,effectHit:0,effectRes:0,breakEffect:0,baseStats:{hp:1000,atk:1000,def:1000},elemDmg:{}});
const actor=(id,extra={})=>{const a=buildBattleActor(ctx,{...newBattleBuild(),characterId:id,relicAuto:false,panel:panel(),...extra});a.energy=0;a.policy={...a.policy,autoUltimate:false};return a;};
const enemy=(extra={})=>({id:'enemy',name:'规则训练敌人',side:'enemy',level:90,element:'Physical',panel:{...panel(),hp:1e9,speed:1},energy:0,energyMax:0,res:{},actions:{basic:{name:'测试攻击',type:'Normal',terms:[{scaling:'atk',multiplier:1}],hitEnergy:10}},policy:{autoUltimate:false,basicOnly:true},...extra});
// 我方木桩：用于「师父」「队友攻击触发天赋」「同谐/虚无命途」等需要第二名的场景。
const mate=(extra={})=>({id:'mate',name:'测试队员',side:'ally',level:80,element:'Physical',path:'Hunt',panel:{...panel(),speed:1},energy:0,energyMax:100,
  actions:{basic:{name:'测试普攻',type:'Normal',terms:[{scaling:'atk',multiplier:1}],spGain:1,energyGain:20,toughness:30},
    skill:{name:'测试战技',type:'BPSkill',terms:[{scaling:'atk',multiplier:1}],spCost:1,energyGain:30,toughness:60}},policy:{autoUltimate:false,basicOnly:true},...extra});
const config=(units,en=null,maxAV=201)=>({strict:true,maxAV,sp:3,maxSP:9,seed:42,critMode:'noncrit',units:[...units,en??enemy()]});
const baseOf=ev=>ev.formula.find(f=>f.zone==='base').value;
const dmgOf=(b,id,kind)=>b.log.filter(e=>e.type==='damage'&&e.actor===id&&(kind?e.kind===kind:true));
const timed=(id,skillId,index)=>ROSTER_DATA[id].skills[String(skillId)].stance[index];
let passed=0,failed=0;const test=(name,fn)=>{try{fn();passed++;console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+'\n'+e.stack);}};

test('batch10 6 名角色 E0～E6 动作合同可编译且不能篡改倍率',()=>{
  assert.deepEqual([...IDS].sort((a,b)=>a-b),[1206,1208,1220,1224,1304,1305]);
  for(const id of IDS)for(let eidolon=0;eidolon<=6;eidolon++){
    const a=actor(id,{eidolon});assert.deepEqual(validateKitActor(a),[]);assert.deepEqual(a.unsupported,[]);
    // 每名角色至少要有一个带倍率的动作，并能检测出篡改。
    const key=Object.keys(a.actions).find(k=>(a.actions[k]?.terms??[]).length);
    assert.ok(key,id+' 没有任何带倍率的动作');
    a.actions[key].terms[0].multiplier=99;
    assert.ok(validateKitActor(a).length,id+' 篡改倍率未被发现');
  }
});

test('batch10 段数 / 削韧 / 能量与原始脚本一致（枚举 HitSplitRatio 与 stance）',()=>{
  const fx=actor(1208),av=actor(1304),ss=actor(1206),fe=actor(1220),m7=actor(1224),dr=actor(1305);
  // 1208：Skill01_Phase02 1 段；Skill03_Phase02 为 E6 的成功 / 失败互斥分支（同一节点），因此终结 1 段、削韧 60。
  assert.deepEqual(fx.actions.basic.hitShares,[1]);
  assert.equal(fx.actions.basic.terms[0].scaling,'hp');
  assert.deepEqual(fx.actions.ultimate.hitShares,[1]);
  assert.equal(fx.actions.ultimate.toughness,timed(1208,120803,1));
  assert.equal(fx.actions.ultimate.toughness,60);
  assert.deepEqual(fx.actions.skill.terms,[]);
  // 1304：天赋追击 = Talent[1]=7 段弹射（E4 +ranks[4][2]=3），每段 Talent[2] 防御力、削韧 10。
  assert.equal(av.actions.followup.bounceCount,av.kit.params.Talent[1]);
  assert.equal(av.actions.followup.bounceCount,7);
  near(av.actions.followup.bounceTerms[0].multiplier,av.kit.params.Talent[2]);
  assert.equal(av.actions.followup.bounceToughness,timed(1304,130404,0));
  assert.equal(av.actions.followup.bounceToughness,10);
  assert.equal(av.actions.basic.terms[0].scaling,'def');
  assert.equal(actor(1304,{eidolon:4}).actions.followup.bounceCount,7+3);
  // 1206：Skill02_Phase02 SPHitRatio 0.3/0.7；终结削韧 90。
  assert.deepEqual(ss.actions.skill.hitShares,[.3,.7]);
  assert.equal(ss.actions.ultimate.toughness,timed(1206,120603,0));
  assert.deepEqual(ss.actions.basic.hitShares,[1]);
  // 1220：Skill01 HitSplitRatio 0.2/0.2/0.6；Skill02 0.34 + 0.33×2；能量条即【飞黄】。
  assert.deepEqual(fe.actions.basic.hitShares,[.2,.2,.6]);
  assert.deepEqual(fe.actions.skill.hitShares,[.34,.33,.33]);
  assert.equal(fe.energyMax,fe.kit.params.Talent[3]);
  assert.equal(fe.energyMax,12);
  assert.equal(fe.actions.ultimate.energyCost,fe.kit.params.Talent[2]);
  assert.equal(fe.actions.ultimate.energyCost,6);
  assert.equal(fe.actions.basic.energyGain,0);
  assert.equal(fe.actions.ultimate.toughness,0);   // 90 削韧由 6 次连段（各 15）结算
  assert.equal(fe.actions.followup.toughness,timed(1220,122004,0));
  assert.equal(actor(1220,{eidolon:4}).actions.followup.toughness,30);
  // 1224：Skill01_Phase02 0.4/0.6；强化普攻削韧 15、回能 30、不返战技点。
  assert.deepEqual(m7.actions.basic.hitShares,[.4,.6]);
  assert.equal(m7.actions.enhancedBasic.toughness,timed(1224,122408,0));
  assert.equal(m7.actions.enhancedBasic.toughness,15);
  assert.equal(m7.actions.enhancedBasic.spGain,0);
  assert.equal(m7.actions.enhancedBasic.energyGain,30);
  assert.deepEqual(m7.actions.followup.hitShares,[.4,.6]);
  assert.equal(m7.actions.followup.toughness,m7.kit.ranks[2][3]);
  assert.equal(m7.actions.followup.toughness,15);
  // 1305：Skill02 / Skill03 / PassiveSkill01_Insert 均 1 段。
  assert.deepEqual(dr.actions.skill.hitShares,[1]);
  assert.equal(dr.actions.ultimate.toughness,timed(1305,130503,0));
  assert.equal(dr.actions.followup.toughness,timed(1305,130504,0));
  assert.equal(dr.actions.followup.energyGain,ROSTER_DATA[1305].skills['130504'].spBase);
});

test('1304 砂金：战技护盾 = 24% 防御力+320、持续 3 回合、叠加上限 200% 且不超上限',()=>{
  const b=createBattle(config([actor(1304,{eidolon:1}),mate()]));b.random=()=>0;
  const [u,m]=b.units,p=u.kit.params;
  const base=combatPanel(u).def*p.BPSkill[0]+p.BPSkill[1];
  // 行迹 point07 热手：开场已为我方全体提供 100% 战技护盾量、trace[0] 回合。
  for(const to of [u,m]){
    const s=to.shields.find(x=>x.id.startsWith(u.id));
    assert.ok(s,'行迹热手未提供开场护盾');
    near(s.value,base*u.kit.trace[2][1]);assert.equal(s.remaining,u.kit.trace[2][0]);
  }
  b.rules.after(b,u,'skill','normal',u.actions.skill,[u],[u]);
  for(const to of [u,m]){
    const s=to.shields.find(x=>x.id.startsWith(u.id));
    assert.ok(s,'战技未给队友提供护盾');
    near(s.value,Math.min(base*p.BPSkill[3],base*(1+u.kit.trace[2][1])));
    assert.equal(s.remaining,p.BPSkill[2]);
  }
  b.rules.after(b,u,'skill','normal',u.actions.skill,[u],[u]);
  near(u.shields.find(s=>s.id.startsWith(u.id)).value,base*p.BPSkill[3],'护盾叠加不应超过 200%');
  // 天赋：持盾者效果抵抗 +Talent[3]=62.5%；E1：持盾者暴击伤害 +20%。
  near(combatPanel(m).effectRes,p.Talent[3]);
  near(combatPanel(m).critDmg,1+p.BPSkill[3]*0+u.kit.ranks[1][0]);
  // 行迹 point06 杠杆：防御 >1600 后每 100 点 +2% 暴击率，上限 48%。
  u.panel.def=2000;
  near(combatPanel(u).critRate,1*(1-1)+.5+Math.min(u.kit.trace[1][1],4*u.kit.trace[1][0]));
  near(combatPanel(u).critRate,.5+Math.min(.48,4*.02));
});

test('1304 砂金：持盾我方受击 +1【盲注】、砂金自身持盾再 +1，7 点消耗 7 点发动追击',()=>{
  const b=createBattle(config([actor(1304),mate({panel:{...panel(),hp:1e9}})]));b.random=()=>0;
  const [u,m,en]=b.units;
  b.rules.after(b,u,'skill','normal',u.actions.skill,[u],[u]);
  b.rules.attacked(b,m,en);near(u.resources['盲注'],1);
  b.rules.attacked(b,u,en);near(u.resources['盲注'],3);      // 1（持盾）+1（自身持盾额外）
  for(let i=0;i<2;i++)b.rules.attacked(b,m,en);
  near(u.resources['盲注'],5);
  b.queue.length=0;
  b.rules.attacked(b,u,en);
  near(u.resources['盲注'],0,'达到 7 点应消耗 7 点');
  assert.equal(b.queue.filter(q=>q.key==='followup').length,1,'未发动天赋追击');
  // 未持盾的队友受击不叠【盲注】。
  m.shields=[];
  b.rules.attacked(b,m,en);near(u.resources['盲注'],0);
});

test('1304 砂金：天赋追击后按行迹 point08 补盾（含护盾最低者额外一份）并受 200% 上限约束',()=>{
  const b=createBattle(config([actor(1304),mate({panel:{...panel(),hp:1e9}})]));b.random=()=>0;
  const [u,m,en]=b.units,p=u.kit.params;
  b.rules.after(b,u,'skill','normal',u.actions.skill,[u],[u]);
  const before=m.shields.find(s=>s.id.startsWith(u.id)).value;
  b.rules.after(b,u,'followup','followup',u.actions.followup,[en],[en]);
  const boost=1+(combatPanel(u).shieldBoost??0);
  const base=(combatPanel(u).def*u.kit.trace[3][0]+u.kit.trace[3][1])*boost;
  const cap=(combatPanel(u).def*p.BPSkill[0]+p.BPSkill[1])*boost*p.BPSkill[3];
  near(m.shields.find(s=>s.id.startsWith(u.id)).value,Math.min(cap,before+base),'追击补盾');
  // 护盾最低者额外一份：再补一次后应到 200% 上限。
  b.rules.after(b,u,'followup','followup',u.actions.followup,[en],[en]);
  near(m.shields.find(s=>s.id.startsWith(u.id)).value,cap);
});

test('1304 砂金：终结随机 1~7【盲注】+ 惊惶（我方暴击伤害 +18%）、E2 普攻降全抗、E6 按持盾队友增伤',()=>{
  const b=createBattle(config([actor(1304,{eidolon:6}),mate({panel:{...panel(),hp:1e9}})]));b.random=()=>0.5;
  const [u,m,en]=b.units,p=u.kit.params;
  b.rules.after(b,u,'skill','normal',u.actions.skill,[u],[u]);
  near(b.rules.modifiers(b,u,en,{type:'Normal',element:'Imaginary'},'direct').dmgBoost,
    Math.min(u.kit.ranks[6][1],u.kit.ranks[6][0]*2),'E6 应按 2 名持盾队友增伤');
  b.rules.before(b,u,'ultimate','ultimate',u.actions.ultimate,[en]);
  near(u.resources['盲注'],1+Math.floor(0.5*p.Ultra[0]));
  const panic=en.buffs.find(x=>x.tag==='aventurinePanic');
  assert.ok(panic,'终结未施加【惊惶】');assert.equal(panic.remaining,p.Ultra[3]);
  near(b.rules.modifiers(b,u,en,{type:'Normal',element:'Imaginary'},'direct').critDmg,p.Ultra[2]);
  // E2：普攻使目标全属性抗性降低 ranks[2][1]=12%、ranks[2][2]=3 回合。
  b.rules.after(b,u,'basic','normal',u.actions.basic,[en],[en]);
  const down=en.buffs.filter(x=>x.resReduction);
  assert.equal(down.length,7);near(down[0].value,u.kit.ranks[2][1]);assert.equal(down[0].remaining,u.kit.ranks[2][2]);
  // 秘技：防御力提高（取最高档 Maze[2]），Maze[3] 回合。
  const b2=createBattle(config([actor(1304,{technique:true}),mate()]));b2.random=()=>0;
  const [u2,m2]=b2.units;
  near(m2.buffs.find(x=>x.id.includes('aventurine-maze')).value,u2.kit.params.Maze[2]);
  assert.equal(m2.buffs.find(x=>x.id.includes('aventurine-maze')).remaining,u2.kit.params.Maze[3]);
});

test('1208 符玄：战技开启【穷观阵】3 回合、全队【鉴知】按生命上限 7.5% 提高生命上限与 15% 暴击率',()=>{
  const b=createBattle(config([actor(1208,{eidolon:1}),mate()]));b.random=()=>0;
  const [u,m]=b.units,p=u.kit.params;
  b.rules.after(b,u,'skill','support',u.actions.skill,[u],[u]);
  const arr=u.buffs.find(x=>x.tag==='fuxuanArray');
  assert.ok(arr,'战技未开启【穷观阵】');assert.equal(arr.remaining,p.BPSkill[2]);
  for(const to of [u,m]){
    const hpUp=to.buffs.find(x=>x.id.endsWith(':hp'));
    assert.ok(hpUp&&hpUp.convert,'未登记鉴知的生命上限转换');
    assert.equal(hpUp.convert.source,u.id);near(hpUp.convert.ratio,p.BPSkill[3]);
    near(combatPanel(to).hp,10000+10000*p.BPSkill[3]);
    near(to.buffs.find(x=>x.id.endsWith(':cr')).value,p.BPSkill[4]);
    near(to.buffs.find(x=>x.id.endsWith(':cd')).value,u.kit.ranks[1][0],'E1 暴击伤害');
  }
  // 【避厄】：我方全体受到的伤害降低 Talent[0]（写入 defender buff，再由引擎减伤乘区结算）。
  near(u.buffs.find(x=>x.tag==='fuxuanBie').value,p.Talent[0]);
  // 行迹 point06：穷观阵开启时施放战技额外回 20 能。
  u.energy=0;b.rules.before(b,u,'skill','normal',u.actions.skill,[u]);
  near(u.energy,u.kit.trace[1][0]);
});

test('1208 符玄：天赋生命回复按已损失 90%、初始 1 次上限 2 次，终结技 +1 次',()=>{
  const b=createBattle(config([actor(1208),mate()]));b.random=()=>0;
  const [u]=b.units,p=u.kit.params;
  const max=combatPanel(u).hp;
  u.hp=max*.4;
  b.rules.afterDamage(b,enemy(),u,'direct');
  near(u.hp,max*.4+(max-max*.4)*p.Talent[2]);
  near(u.resources['天赋触发次数'],0);
  u.hp=max*.3;b.rules.afterDamage(b,enemy(),u,'direct');
  near(u.hp,max*.3,'次数用尽后不应再触发');
  u.energy=u.energyMax;
  b.rules.before(b,u,'ultimate','ultimate',b.rules.prepare(b,u,'ultimate','ultimate',u.actions.ultimate),[b.units[2]]);
  b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[b.units[2]],[b.units[2]]);
  near(u.resources['天赋触发次数'],1,'终结技应补 1 次触发次数');
  const before=u.hp;u.hp=max*.2;b.rules.afterDamage(b,enemy(),u,'direct');
  near(u.hp,max*.2+(max-max*.2)*p.Talent[2]);
  void before;
});

test('1208 符玄：E4 穷观阵中队友受击回 5 能；E2 致命伤害拦截并回复 70% 生命上限',()=>{
  const b=createBattle(config([actor(1208,{eidolon:4}),mate({panel:{...panel(),hp:1e9}})]));b.random=()=>0;
  const [u,m,en]=b.units;
  b.rules.after(b,u,'skill','support',u.actions.skill,[u],[u]);
  u.energy=0;
  b.rules.attacked(b,m,en);
  near(u.energy,u.kit.ranks[4]?u.kit.ranks[4][0]:0);
  near(u.energy,5);
  // E2：致命伤害被拦截（单场 1 次，本次行动内所有我方目标都保留），并回复 70% 生命上限。
  m.hp=100;m.currentHp=100;
  assert.equal(b.rules.beforeLethal(b,en,m,999999),true);
  assert.ok(m.hp>100,'E2 未回复生命');
  near(m.hp,100+Math.min(combatPanel(m).hp-100,combatPanel(m).hp*u.kit.ranks[2][0]));
  assert.equal(b.rules.beforeLethal(b,en,u,999999),true,'同一次行动内其他我方目标也应被拦截');
});

test('1208 符玄：行迹 point08 穷观阵中我方全体免疫 1 次控制类负面，重新开启后刷新',()=>{
  const b=createBattle(config([actor(1208),mate({panel:{...panel(),hp:1e9}})]));b.random=()=>0;
  const [u,m]=b.units;
  b.rules.after(b,u,'skill','support',u.actions.skill,[u],[u]);
  near(combatPanel(m).controlRes,1);
  // 模拟引擎在被免疫时记录的 resist，再由模块在下一次 after 中消耗次数。
  b.log.push({index:b.log.length,type:'resist',actor:m.id,name:'免疫控制类负面状态'});
  b.rules.after(b,u,'basic','normal',u.actions.basic,[b.units[2]],[b.units[2]]);
  near(u.resources['控制免疫已用'],1);
  assert.ok(!combatPanel(m).controlRes,'次数用尽后不应继续免疫');
  b.rules.after(b,u,'skill','support',u.actions.skill,[u],[u]);
  near(combatPanel(m).controlRes,1,'重新开启【穷观阵】应刷新免疫次数');
});

test('1208 符玄：E6 终结技按累计已损失生命值 200% 加伤（上限 120% 生命上限），终结后清空累计',()=>{
  const b=createBattle(config([actor(1208,{eidolon:6}),mate({panel:{...panel(),hp:1e9}})]));b.random=()=>0;
  const [u,m,en]=b.units;
  const max=combatPanel(u).hp;
  // 用真实伤害事件累计：敌人 2 次攻击造成的生命损失会被记入日志。
  b.log.push({index:b.log.length,type:'damage',actor:en.id,target:m.id,kind:'direct',damage:6000,hpDamage:5000,formula:[]});
  u.resources['E6累计起算']=0;
  const prepared=b.rules.prepare(b,u,'ultimate','ultimate',u.actions.ultimate);
  b.rules.before(b,u,'ultimate','ultimate',prepared,[en]);
  const expect=u.kit.ranks[6][0]*Math.min(5000,u.kit.ranks[6][1]*max);
  near(prepared.terms[0].flatAdd,expect);
  near(prepared.terms[0].multiplier,u.kit.params.Ultra[0]);
  // 超过上限时按 120% 生命上限截断。
  const b2=createBattle(config([actor(1208,{eidolon:6})]));b2.random=()=>0;
  const [u2,en2]=b2.units;
  b2.log.push({index:b2.log.length,type:'damage',actor:en2.id,target:u2.id,kind:'direct',damage:9e9,hpDamage:9e9,formula:[]});
  u2.resources['E6累计起算']=0;
  const p2=b2.rules.prepare(b2,u2,'ultimate','ultimate',u2.actions.ultimate);
  b2.rules.before(b2,u2,'ultimate','ultimate',p2,[en2]);
  near(p2.terms[0].flatAdd,u2.kit.ranks[6][0]*u2.kit.ranks[6][1]*combatPanel(u2).hp);
  b2.rules.after(b2,u2,'ultimate','ultimate',u2.actions.ultimate,[en2],[en2]);
  assert.ok(u2.resources['E6累计起算']>=b2.log.length-2,'终结后应重新起算累计');
});

test('1208 符玄：行迹 point07 终结技为我方其他目标回复 5% 生命上限+133',()=>{
  const b=createBattle(config([actor(1208),mate()]));b.random=()=>0;
  const [u,m,en]=b.units;
  m.hp=100;
  b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[en],[en]);
  const heal=b.log.filter(x=>x.type==='heal'&&x.target===m.id).pop();
  assert.ok(heal,'终结技未回复队友');
  near(heal.amount,10000*u.kit.trace[2][0]+u.kit.trace[2][1]);
  const self=b.log.filter(x=>x.type==='heal'&&x.target===u.id);
  assert.equal(self.length,0,'只应回复其他目标');
});

test('1206 素裳：战技最后一击后按 33% 发动【剑势】（击破目标必定），逐寇每层 +2.5%、E2 减伤',()=>{
  const brokenEnemy=enemy({broken:true,standardBreak:true,rank:'normal',toughnessMax:100,weaknesses:['Physical']});
  const b=createBattle(config([actor(1206,{eidolon:2})],brokenEnemy));b.random=()=>0.99;
  const [u,en]=b.units,p=u.kit.params;
  en.broken=true;   // createBattle 会把 broken 重置为 false，这里按原始脚本的「弱点击破状态」直接置位
  const n0=dmgOf(b,u.id,'additional').length;
  b.rules.after(b,u,'skill','normal',u.actions.skill,[en],[en]);
  const judge=dmgOf(b,u.id,'additional').slice(n0);
  assert.equal(judge.length,1,'击破目标应必定发动【剑势】');
  near(baseOf(judge[0]),combatPanel(u).atk*p.BPSkill[1]);
  assert.equal(u.resources['剑势层数'],1);
  near(u.buffs.find(x=>x.id===u.id+':sushang-e2').value,u.kit.ranks[2]);
  // 逐寇：第二层 +2.5%。
  b.rules.after(b,u,'skill','normal',u.actions.skill,[en],[en]);
  const second=dmgOf(b,u.id,'additional').at(-1);
  near(baseOf(second),combatPanel(u).atk*p.BPSkill[1]*(1+u.kit.trace[2][0]));
  // 未击破时按 33% 概率判定：random=0.99 不发动。
  const b2=createBattle(config([actor(1206)],brokenEnemy));b2.random=()=>0.99;
  const [u2,en2]=b2.units;
  en2.broken=false;
  const m0=dmgOf(b2,u2.id,'additional').length;
  b2.rules.after(b2,u2,'skill','normal',u2.actions.skill,[en2],[en2]);
  assert.equal(dmgOf(b2,u2.id,'additional').length,m0,'33% 判定失败不应发动剑势');
});

test('1206 素裳：终结立即行动、攻击力 +36% 两回合，并让战技额外增加 2 次 50% 的【剑势】判定',()=>{
  const brokenEnemy=enemy({broken:true,standardBreak:true,rank:'normal',toughnessMax:1000,weaknesses:['Physical']});
  const b=createBattle(config([actor(1206)],brokenEnemy));b.random=()=>0;
  const [u,en]=b.units,p=u.kit.params;
  b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[en],[en]);
  assert.equal(u.distance,0,'终结技应立即行动');
  const atkBuff=u.buffs.find(x=>x.tag==='sushangUlt');
  near(atkBuff.value,p.Ultra[3]);assert.equal(atkBuff.remaining,p.Ultra[1]);
  const n0=dmgOf(b,u.id,'additional').length;
  b.rules.after(b,u,'skill','normal',u.actions.skill,[en],[en]);
  const extra=dmgOf(b,u.id,'additional').slice(n0);
  assert.equal(extra.length,3,'应为 触发 1 次 + 额外 2 次判定');
  near(baseOf(extra[0]),combatPanel(u).atk*p.BPSkill[1]);
  near(baseOf(extra[1]),combatPanel(u).atk*p.BPSkill[1]*p.Ultra[2]*(1+u.kit.trace[2][0]));
  near(baseOf(extra[2]),combatPanel(u).atk*p.BPSkill[1]*p.Ultra[2]*(1+2*u.kit.trace[2][0]));
});

test('1206 素裳：天赋击破加速（E6 两层并在开场 1 层）、行迹 point08 破敌提前 15%、E1 回战技点',()=>{
  const b=createBattle(config([actor(1206,{eidolon:6})]));b.random=()=>0;
  const [u,en]=b.units,p=u.kit.params;
  const spd=u.buffs.find(x=>x.id===u.id+':sushang-spd');
  assert.ok(spd&&spd.stacks===1,'E6 开场应获得 1 层天赋加速');
  const speedBase=u.baseSpeed??u.panel.speed;
  near(combatPanel(u).speed,u.panel.speed+speedBase*p.Talent[0]);
  b.rules.afterDamage(b,en,en,'break');
  const spd2=u.buffs.find(x=>x.id===u.id+':sushang-spd');
  near(spd2.stacks,2);near(combatPanel(u).speed,u.panel.speed+speedBase*2*p.Talent[0]);
  // 行迹 point08：普攻或战技后有敌方处于弱点击破状态 → 行动提前 15%。
  en.broken=true;
  u.distance=10000;
  b.rules.after(b,u,'basic','normal',u.actions.basic,[en],[en]);
  near(u.distance,10000-10000*u.kit.trace[3][0]);
  // E1：对弱点击破目标施放战技后回 1 战技点。
  const sp0=b.sp;
  b.rules.after(b,u,'skill','normal',u.actions.skill,[en],[en]);
  near(b.sp,Math.min(b.maxSP,sp0+1));
  // E4：击破特攻 +40%。
  const b2=createBattle(config([actor(1206,{eidolon:4})]));b2.random=()=>0;
  near(combatPanel(b2.units[0]).breakEffect,b2.units[0].kit.ranks[4][0]);
});

test('1206 素裳：秘技对敌方全体造成 80% 攻击力物理伤害并削韧 60',()=>{
  const b=createBattle(config([actor(1206,{technique:true})]));b.random=()=>0;
  const [u,en]=b.units;
  const tech=dmgOf(b,u.id,'technique');
  assert.equal(tech.length,1);near(baseOf(tech[0]),combatPanel(u).atk*u.kit.params.Maze[0]);
  near(tech[0].formula.find(f=>f.zone==='base').value,u.kit.params.Maze[0]*combatPanel(u).atk);
  assert.equal(u.kit.params.Maze[0],ROSTER_DATA[1206].skills['120607'].params['1'].param_list[0]);
  void en;
});

test('1220 飞霄：开场 +3【飞黄】、每 2 次我方攻击 +1、终结消耗 6 点',()=>{
  const b=createBattle(config([actor(1220),mate()]));b.random=()=>0;
  const [u,m,en]=b.units,p=u.kit.params;
  near(u.energy,u.kit.trace[1][0]);near(u.energy,3);
  const start=u.energy;
  b.rules.after(b,m,'basic','normal',m.actions.basic,[en],[en]);   // 第 1 次
  near(u.energy,start);
  assert.equal(b.queue.filter(q=>q.key==='followup').length,1,'队友攻击应触发天赋追击');
  b.rules.after(b,m,'basic','normal',m.actions.basic,[en],[en]);   // 第 2 次（每回合天赋只触发 1 次）
  near(u.energy,start+1,'每 2 次攻击应 +1【飞黄】');
  assert.equal(b.queue.filter(q=>q.key==='followup').length,1,'每回合只应触发 1 次天赋追击');
  // 行迹 point06：上回合未通过天赋发动追击时补 1 次计数。
  u.resources['攻击计数']=1;u.resources['上回合追加']=0;
  b.rules.onTurnStart(b,u);
  near(u.energy,start+2);
  // 飞霄自身终结技不计入攻击次数。
  const e0=u.energy;
  b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[en],[en]);
  near(u.energy,e0);
  void p;
});

test('1220 飞霄：终结 = 6 次连段（各 0.72+0.375，削韧 15）+ 收尾 192%，总倍率 = Ultra[3]',()=>{
  const toughEnemy=enemy({panel:{...panel(),hp:1e9},toughnessMax:300,weaknesses:['Wind'],standardBreak:true,rank:'normal'});
  const b=createBattle(config([actor(1220)],toughEnemy));b.random=()=>0;
  const [u,en]=b.units,p=u.kit.params;
  const combo=ROSTER_DATA[1220].skills['122008'].params['10'].param_list;
  const n0=dmgOf(b,u.id).length;
  b.rules.before(b,u,'ultimate','ultimate',u.actions.ultimate,[en]);
  const comboHits=dmgOf(b,u.id).slice(n0);
  assert.equal(comboHits.length,p.Ultra[2]);
  for(const h of comboHits)near(baseOf(h),combatPanel(u).atk*(combo[0]+combo[1]));
  near(en.toughness,300-15*p.Ultra[2]*(1+p.Ultra[1]),'6 次连段在未击破时应共削韧 90×2（击破效率 +100%）');
  assert.ok(en.buffs.some(x=>x.weakness==='Wind'),'终结期间应无视弱点削韧');
  // 引擎随后结算收尾段：total = Ultra[3]（= Ultra[0] + 6×(0.72+0.375)）。
  const atk=combatPanel(u).atk;
  near(atk*p.Ultra[3],atk*p.Ultra[0]+atk*(combo[0]+combo[1])*p.Ultra[2]);
  b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[en],[en]);
  assert.ok(!en.buffs.some(x=>x.weakness==='Wind'),'终结结束后应移除无视弱点标记');
});

test('1220 飞霄：E1 每次连段叠终结技增伤（上限 5 层、终结后清空）；E6 追击视为终结技且倍率 +40%、抗穿 +20%',()=>{
  const b=createBattle(config([actor(1220,{eidolon:6})]));b.random=()=>0;
  const [u,en]=b.units,p=u.kit.params;
  b.rules.before(b,u,'ultimate','ultimate',u.actions.ultimate,[en]);
  const e1=u.buffs.find(x=>x.id===u.id+':feixiao-e1');
  assert.ok(e1,'E1 未叠层');near(e1.stacks,u.kit.ranks[1][1]);near(e1.stacks,5);
  near(e1.value,u.kit.ranks[1][0]*5);
  b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[en],[en]);
  assert.ok(!u.buffs.some(x=>x.id===u.id+':feixiao-e1'),'终结技结束后应清空 E1');
  const pre=b.rules.prepare(b,u,'followup','followup',u.actions.followup);
  assert.equal(pre.type,'Ultra','E6 追击应视为终结技伤害');
  near(pre.terms[0].multiplier,p.Talent[0]*(1+u.kit.ranks[6][1]));
  near(b.rules.modifiers(b,u,en,{type:'Ultra',element:'Wind'},'Ultra').resPen,u.kit.ranks[6][0]);
});

test('1220 飞霄：行迹解形使追击暴击伤害 +36%（终结技伤害视为追击）、电举战技攻击 +48%',()=>{
  const b=createBattle(config([actor(1220),mate()]));b.random=()=>0;
  const [u,m,en]=b.units;
  near(b.rules.modifiers(b,u,en,{type:'Talent',element:'Wind'},'followup').critDmg,u.kit.trace[2][0]);
  near(b.rules.modifiers(b,u,en,{type:'Ultra',element:'Wind'},'direct').critDmg,u.kit.trace[2][0]);
  near(b.rules.modifiers(b,u,en,{type:'Normal',element:'Wind'},'direct').critDmg,0);
  b.rules.after(b,u,'skill','normal',u.actions.skill,[en],[en]);
  const dianju=u.buffs.find(x=>x.id===u.id+':feixiao-dianju');
  near(dianju.value,u.kit.trace[3][0]);assert.equal(dianju.remaining,u.kit.trace[3][1]);
  assert.equal(b.queue.filter(q=>q.key==='followup').length,1,'战技后应额外发动 1 次天赋追击');
  // 天赋追击自身增伤 Talent[4]=75%、Talent[5]=2 回合；E4 追加削韧 +100% 与速度 +8%。
  b.rules.before(b,u,'followup','followup',u.actions.followup,[en]);
  const buff=u.buffs.find(x=>x.id===u.id+':feixiao-talent-buff');
  near(buff.value,u.kit.params.Talent[4]);assert.equal(buff.remaining,u.kit.params.Talent[5]);
  const b4=createBattle(config([actor(1220,{eidolon:4})]));b4.random=()=>0;
  const [u4,en4]=b4.units;
  near(u4.actions.followup.toughness,timed(1220,122004,0)*(1+u4.kit.ranks[4][0]),'E4 追击削韧 +100%');
  b4.rules.before(b4,u4,'followup','followup',u4.actions.followup,[en4]);
  const spd4=u4.buffs.find(x=>x.id===u4.id+':feixiao-e4');
  near(spd4.value,u4.kit.ranks[4][1]);assert.equal(spd4.remaining,u4.kit.ranks[4][2]);
  void m;
});

test('1220 飞霄：秘技每波次对敌方全体造成 200% 风伤（每多 1 个敌人 +100%、上限 1000%）并必定暴击',()=>{
  const b=createBattle(config([actor(1220,{technique:true})],null,1));b.random=()=>0;
  const [u]=b.units,p=u.kit.params;
  near(u.energy,u.kit.trace[1][0]+p.Maze[3],'秘技应额外给 1 点【飞黄】');
  const tech=dmgOf(b,u.id,'technique');
  assert.equal(tech.length,1);
  near(baseOf(tech[0]),combatPanel(u).atk*p.Maze[2]);
  assert.equal(tech[0].critMode,'crit','秘技伤害应必定暴击');
  const c={strict:true,maxAV:1,sp:3,maxSP:9,seed:42,critMode:'noncrit',
    units:[actor(1220,{technique:true}),enemy({id:'e1'}),enemy({id:'e2'}),enemy({id:'e3'})]};
  const b3=createBattle(c);b3.random=()=>0;
  const u3=b3.units[0];
  const mult=p.Maze[2]*(1+Math.min(p.Maze[5],p.Maze[4]*2));
  for(const to of b3.units.slice(1))near(dmgOf(b3,u3.id,'technique').find(x=>x.target===to.id).formula.find(f=>f.zone==='base').value,combatPanel(u3).atk*mult);
});

test('1224 三月七：战技指定【师父】并加速，普攻给 1 点充能；师父攻击后 +1 点充能',()=>{
  const b=createBattle(config([actor(1224,{eidolon:2}),mate()]));b.random=()=>0;
  const [u,m,en]=b.units,p=u.kit.params;
  b.rules.after(b,u,'skill','support',u.actions.skill,[m],[m]);
  assert.equal(u.resources['师父'],m.id);
  const spd=m.buffs.find(x=>x.tag==='marchMaster');
  near(spd.value,p.BPSkill[0]);
  near(combatPanel(u).speed,u.panel.speed+(u.baseSpeed??u.panel.speed)*u.kit.ranks[1][0],'E1 有师父时速度 +10%');
  b.rules.after(b,u,'basic','normal',u.actions.basic,[en],[en]);
  near(u.resources['充能'],p.Normal[1]);
  b.rules.after(b,m,'basic','normal',m.actions.basic,[en],[en]);
  near(u.resources['充能'],p.Normal[1]+2,'师父攻击 +1 且 E2 追击再 +1');
  assert.equal(b.queue.filter(q=>q.key==='followup').length,1,'E2 应发动追击');
  // 每回合最多 1 次 E2 追击。
  b.rules.after(b,m,'basic','normal',m.actions.basic,[en],[en]);
  assert.equal(b.queue.filter(q=>q.key==='followup').length,1);
});

test('1224 三月七：充能达到 7 点立即行动、伤害提高 100%，强化普攻逐段结算并消耗 7 点',()=>{
  const b=createBattle(config([actor(1224),mate()],null,1));b.random=()=>0;
  const [u,m,en]=b.units,p=u.kit.params;
  b.rules.after(b,u,'skill','support',u.actions.skill,[m],[m]);
  u.resources['充能']=p.Talent[0]-1;
  b.rules.after(b,m,'basic','normal',m.actions.basic,[en],[en]);
  near(u.resources['强化'],1);near(u.distance,0);
  assert.ok(u.buffs.some(x=>x.tag==='marchEnhance'),'强化状态应提高伤害');
  near(u.buffs.find(x=>x.tag==='marchEnhance').value,p.Talent[1]);
  const pre=b.rules.prepare(b,u,'basic','normal',u.actions.basic);
  assert.equal(pre.name,ROSTER_DATA[1224].skills['122408'].name);
  assert.equal(b.rules.shouldUseSkill(b,u),false,'强化普攻状态无法施放战技');
  const n0=dmgOf(b,u.id,'direct').length;
  b.rules.before(b,u,'basic','normal',pre,[en]);
  const segs=dmgOf(b,u.id,'direct').slice(n0);
  const row=ROSTER_DATA[1224].skills['122408'].params['6'].param_list;
  assert.equal(segs.length,row[3]+row[2],'random=0 时追加段数应取满');
  for(const s of segs)near(baseOf(s),combatPanel(u).atk*row[0]);
  assert.equal(u.buffs.filter(x=>x.id==='$'.replace('$',u.id)+':march-tough').length,0);
  b.rules.after(b,u,'basic','normal',pre,[en],[en]);
  near(u.resources['充能'],0);near(u.resources['强化'],0);
  assert.ok(!u.buffs.some(x=>x.tag==='marchEnhance'),'强化状态应被消耗');
  const wobo=m.buffs.filter(x=>x.id.includes('wobo'));
  assert.equal(wobo.length,2,'行迹 point08 应给师父暴击伤害与击破特攻');
});

test('1224 三月七：师父命途决定附加伤害（25% 攻击力）或削韧 +100%；终结技增加初始段数与固定概率',()=>{
  const b=createBattle(config([actor(1224),mate({path:'巡猎',element:'Thunder'})]));b.random=()=>0.99;
  const [u,m,en]=b.units,p=u.kit.params;
  b.rules.after(b,u,'skill','support',u.actions.skill,[m],[m]);
  const n0=dmgOf(b,u.id,'additional').length;
  b.rules.after(b,u,'basic','normal',u.actions.basic,[en],[en]);
  const add=dmgOf(b,u.id,'additional').slice(n0);
  assert.equal(add.length,1,'巡猎师父应触发附加伤害');
  near(baseOf(add[0]),combatPanel(u).atk*p.BPSkill[1]);
  assert.equal(add[0].element,'Thunder');
  // 同谐师父 → 削韧提高 100%（breakEfficiency 临时 buff）；行迹玲珑让师父属性弱点的敌人可被削韧。
  const b2=createBattle(config([actor(1224),mate({path:'Harmony',element:'Thunder'})],
    enemy({panel:{...panel(),hp:1e9},toughnessMax:300,weaknesses:['Thunder'],standardBreak:true,rank:'normal'})));b2.random=()=>0;
  const [u2,m2,en2]=b2.units;
  b2.rules.after(b2,u2,'skill','support',u2.actions.skill,[m2],[m2]);
  const n2=dmgOf(b2,u2.id,'additional').length;
  b2.rules.before(b2,u2,'basic','normal',u2.actions.basic,[en2]);
  assert.ok(u2.buffs.some(x=>x.id===u2.id+':march-tough'),'同谐师父应在本次动作内提供削韧提高');
  near(combatPanel(u2).breakEfficiency,u2.kit.params.BPSkill[2]);
  assert.ok(en2.buffs.some(x=>x.weakness==='Imaginary'),'行迹玲珑应临时植入师父属性弱点');
  b2.rules.after(b2,u2,'basic','normal',u2.actions.basic,[en2],[en2]);
  assert.equal(dmgOf(b2,u2.id,'additional').length,n2,'同谐师父不应触发附加伤害');
  assert.ok(!en2.buffs.some(x=>String(x.id).includes('march-weak')),'临时弱点标记应在动作后移除');
  assert.ok(!u2.buffs.some(x=>x.id===u2.id+':march-tough'),'削韧提高应只作用于本次动作');
  // 真实战斗：同谐师父使普攻削韧翻倍（30 → 60），且只作用于该次攻击。
  const mHarmony=mate({path:'Harmony',element:'Thunder',panel:{...panel(),speed:1}});
  const b4=createBattle(config([actor(1224),mHarmony],
    enemy({panel:{...panel(),hp:1e9,speed:1},toughnessMax:1000,weaknesses:['Thunder'],standardBreak:true,rank:'normal'}),2000));
  b4.random=()=>0.9;
  const [u4]=b4.units,en4=b4.units[2];
  b4.rules.after(b4,u4,'skill','support',u4.actions.skill,[b4.units[1]],[b4.units[1]]);
  u4.panel.speed=300;u4.policy={...u4.policy,basicOnly:true};
  const t0=en4.toughness;
  for(let i=0;i<8&&!b4.log.some(e=>e.type==='action'&&e.actor===u4.id&&e.key==='basic');i++)stepBattle(b4);
  near(t0-en4.toughness,30*(1+u4.kit.params.BPSkill[2]),'同谐师父应使普攻削韧提高 100%');
  assert.ok(!u4.buffs.some(x=>x.id===u4.id+':march-tough'),'削韧提高应只作用于本次动作');
  assert.ok(!en4.buffs.some(x=>x.weakness==='Imaginary'),'临时弱点标记应在动作后移除');
  // 终结技：下一次强化普攻初始段数 +Ultra[1]、固定概率 +Ultra[2]，E6 追加暴击伤害。
  const b3=createBattle({...config([actor(1224,{eidolon:6}),mate()]),critMode:'crit'});b3.random=()=>0;
  const [u3,m3,en3]=b3.units;
  b3.rules.after(b3,u3,'skill','support',u3.actions.skill,[m3],[m3]);
  b3.rules.after(b3,u3,'ultimate','ultimate',u3.actions.ultimate,[en3],[en3]);
  assert.ok(u3.buffs.some(x=>x.tag==='marchUltEnhance'));
  near(u3.resources['E6待触发'],1);
  u3.resources['充能']=7;u3.resources['强化']=1;
  const pre3=b3.rules.prepare(b3,u3,'basic','normal',u3.actions.basic);
  const n3=dmgOf(b3,u3.id,'direct').length;
  b3.rules.before(b3,u3,'basic','normal',pre3,[en3]);
  const row=ROSTER_DATA[1224].skills['122408'].params['6'].param_list;
  assert.equal(dmgOf(b3,u3.id,'direct').length-n3,row[3]+u3.kit.params.Ultra[1]+row[2]);
  const e6dmg=dmgOf(b3,u3.id,'direct').slice(n3)[0];
  near(e6dmg.formula.find(f=>f.zone==='crit').value,2+u3.kit.ranks[6][0],'E6 暴击伤害应 +50%');
  b3.rules.after(b3,u3,'basic','normal',pre3,[en3],[en3]);
  assert.ok(!u3.buffs.some(x=>x.tag==='marchUltEnhance'),'强化形态应在强化普攻后消耗');
  near(u3.resources['充能'],0,'强化普攻应消耗 Talent[0]=7 点充能');
});

test('1224 三月七：行迹惊鸿开场提前 25%、E4 回合开始回 5 能、秘技回 30 能并按队友秘技给充能',()=>{
  const b=createBattle(config([actor(1224,{eidolon:4,technique:true}),actor(1206,{technique:true})],null,1));
  b.random=()=>0;
  const [u]=b.units,p=u.kit.params;
  near(u.energy,p.Maze[1]);
  near(u.resources['充能'],Math.min(p.Maze[0],1),'每名队友秘技 +1 点充能（上限 Maze[0]）');
  const b2=createBattle(config([actor(1224,{eidolon:4})]));b2.random=()=>0;
  const u2=b2.units[0];
  near(u2.distance,10000-10000*u2.kit.trace[1][0],'行迹惊鸿应提前 25%');
  u2.energy=0;b2.rules.onTurnStart(b2,u2);
  near(u2.energy,u2.kit.ranks[4]);
  void b;
});

test('1305 真理医生：战技按 40%+20%×负面数发动追击，归纳叠层受 6（E1 10）上限约束，演绎降效果抵抗',()=>{
  const b=createBattle(config([actor(1305,{eidolon:1}),mate()]));b.random=()=>0;
  const [u,m,en]=b.units,p=u.kit.params;
  assert.equal(u.resources['归纳层数'],u.kit.ranks[1][1],'E1 开场应给 4 层归纳');
  for(let i=0;i<3;i++)en.buffs.push({id:'neg'+i,name:'负面'+i,key:'defShred',value:.1,remaining:2,tickOwner:en.id,tickAt:'end',debuff:true,source:m.id});
  b.rules.after(b,u,'skill','normal',u.actions.skill,[en],[en]);
  assert.equal(b.queue.filter(q=>q.key==='followup').length,1,'固定概率必定发动追击（random=0）');
  near(u.resources['归纳层数'],4+3);
  const cr=u.buffs.find(x=>x.id===u.id+':ratio-insight-cr');
  near(cr.value,u.kit.trace[1][0]*7);near(cr.stacks,7);
  const slow=en.buffs.find(x=>x.id.startsWith(u.id+':ratio-slow'));
  near(slow.value,-u.kit.trace[2][1]);assert.equal(slow.remaining,u.kit.trace[2][2]);
  // 概率不足时不发动：40% + 20%×0 负面 = 40%，random=0.99 应失败。
  const b2=createBattle(config([actor(1305)]));b2.random=()=>0.99;
  const [u2,en2]=b2.units;
  b2.rules.after(b2,u2,'skill','normal',u2.actions.skill,[en2],[en2]);
  assert.equal(b2.queue.filter(q=>q.key==='followup').length,0);
  // 上限：E0 最多 6 层。
  const b3=createBattle(config([actor(1305)]));b3.random=()=>0.99;
  const [u3,en3]=b3.units;
  for(let i=0;i<3;i++)en3.buffs.push({id:'n'+i,name:'负面'+i,key:'defShred',value:.1,remaining:2,tickOwner:en3.id,tickAt:'end',debuff:true,source:u3.id});
  for(let i=0;i<5;i++)b3.rules.after(b3,u3,'skill','normal',u3.actions.skill,[en3],[en3]);
  near(u3.resources['归纳层数'],u3.kit.trace[1][2]);
  void p;
});

test('1305 真理医生：终结附加【智者的短见】，队友攻击触发追击（上限 2、E6 3），E2 每次追击附加 20%×负面数（≤4）',()=>{
  const b=createBattle(config([actor(1305,{eidolon:6}),mate()]));b.random=()=>0.99;
  const [u,m,en]=b.units,p=u.kit.params;
  b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[en],[en]);
  near(u.resources['短见次数'],p.Ultra[1]+u.kit.ranks[6][0]);
  near(u.resources['短见次数'],3);
  assert.equal(en.buffs.filter(x=>x.tag==='ratioMark').length,1);
  for(let i=0;i<6;i++)en.buffs.push({id:'neg'+i,name:'负面'+i,key:'defShred',value:.1,remaining:2,tickOwner:en.id,tickAt:'end',debuff:true,source:m.id});
  const n0=dmgOf(b,u.id,'additional').length;
  b.rules.after(b,m,'basic','normal',m.actions.basic,[en],[en]);
  near(u.resources['短见次数'],2);
  assert.equal(b.queue.filter(q=>q.key==='followup').length,1);
  b.rules.after(b,u,'followup','followup',u.actions.followup,[en],[en]);
  const add=dmgOf(b,u.id,'additional').slice(n0);
  assert.equal(add.length,u.kit.ranks[2][1]);
  near(baseOf(add[0]),combatPanel(u).atk*u.kit.ranks[2][0]);
  // 触发次数用尽后移除标记与后续追击。
  b.rules.after(b,m,'basic','normal',m.actions.basic,[en],[en]);
  b.rules.after(b,m,'basic','normal',m.actions.basic,[en],[en]);
  near(u.resources['短见次数'],0);
  assert.equal(en.buffs.filter(x=>x.tag==='ratioMark').length,0);
  // E4：触发天赋时额外回 15 点能量。
  const b2=createBattle(config([actor(1305,{eidolon:4})]));b2.random=()=>0;
  const u2=b2.units[0];u2.energy=0;
  b2.rules.after(b2,u2,'skill','normal',u2.actions.skill,[b2.units[1]],[b2.units[1]]);
  near(u2.energy,u2.kit.ranks[4]);
  // E6：天赋追击伤害 +50%（视为追加攻击增伤）。
  const b3=createBattle(config([actor(1305,{eidolon:6}),mate()]));b3.random=()=>0;
  const [u3,m3,en3]=b3.units;
  near(b3.rules.modifiers(b3,u3,en3,{type:'Talent',element:'Imaginary'},'followup').dmgBoost,u3.kit.ranks[6][1]+b3.rules.modifiers(b3,u3,en3,{type:'Talent',element:'Imaginary'},'followup').dmgBoost*0);
  void m3;
});

test('1305 真理医生：行迹推理在目标负面 ≥3 时按每 1 个负面 +10%、最多 50%',()=>{
  const b=createBattle(config([actor(1305)]));b.random=()=>0;
  const [u,en]=b.units;
  const mk=n=>{en.buffs=en.buffs.filter(x=>!String(x.id).startsWith('neg'));for(let i=0;i<n;i++)en.buffs.push({id:'neg'+i,name:'负面'+i,key:'defShred',value:.1,remaining:2,tickOwner:en.id,tickAt:'end',debuff:true,source:u.id});};
  mk(2);near(b.rules.modifiers(b,u,en,{type:'Normal',element:'Imaginary'},'direct').dmgBoost,0,'负面不足 3 个不应增伤');
  mk(3);near(b.rules.modifiers(b,u,en,{type:'Normal',element:'Imaginary'},'direct').dmgBoost,.3);
  mk(8);near(b.rules.modifiers(b,u,en,{type:'Normal',element:'Imaginary'},'direct').dmgBoost,u.kit.trace[3][2]);
  // 秘技：100% 基础概率使敌方全体速度 -15%、2 回合。
  const b2=createBattle(config([actor(1305,{technique:true})]));b2.random=()=>0;
  const [u2,en2]=b2.units;
  const slow=en2.buffs.find(x=>x.id.includes('ratio-maze'));
  near(slow.value,-u2.kit.params.Maze[2]);assert.equal(slow.remaining,u2.kit.params.Maze[3]);
});

test('第10批 真实战斗时序：三月七充能满后立即行动并结算强化普攻 / 砂金盲注满 7 点插入追击',()=>{
  // 三月七：师父（高速队友）连续攻击 → 充能 → 立即行动 → 强化普攻在真实动作轴内结算。
  const m7=actor(1224,{eidolon:2}),m=mate({panel:{...panel(),speed:400}});m7.panel.speed=80;
  const r=simulateBattle({strict:true,maxAV:1500,sp:3,maxSP:9,seed:11,critMode:'noncrit',units:[m7,m,enemy({panel:{...panel(),hp:1e9,speed:1}})]});
  const act=r.log.find(e=>e.type==='action'&&e.actor===m7.id&&e.name===ROSTER_DATA[1224].skills['122408'].name);
  assert.ok(act,'真实战斗中未进入强化普攻');
  const seg=r.log.filter(e=>e.type==='damage'&&e.actor===m7.id&&e.kind==='direct'&&e.frame?.action?.sequence===act.frame.action.sequence);
  assert.ok(seg.length>=3&&seg.length<=6,'强化普攻应逐段结算（3 段 + 最多 3 段追加）');
  assert.ok(r.log.some(e=>e.type==='action'&&e.actor===m7.id&&e.kind==='followup'),'E2 追击应在真实战斗中结算');
  // 砂金：盲注满 7 点后由引擎 flush 插入天赋追击（7 段弹射）。
  const av=actor(1304),m2=mate({panel:{...panel(),hp:1e9,speed:1}});av.panel.speed=1;
  const c={strict:true,maxAV:400,sp:3,maxSP:9,seed:5,critMode:'noncrit',units:[av,m2,enemy({panel:{...panel(),hp:1e9,speed:400,atk:100}})]};
  const b=createBattle(c);b.random=()=>0;
  const [u]=b.units;
  b.rules.after(b,u,'skill','normal',u.actions.skill,[u],[u]);
  u.resources['盲注']=6;
  let ok=false;
  for(let i=0;i<6&&!ok;i++){stepBattle(b);ok=b.log.some(e=>e.type==='action'&&e.actor===u.id&&e.kind==='followup');}
  assert.ok(ok,'盲注满 7 点未在真实战斗中插入追击');
  const fu=b.log.find(e=>e.type==='action'&&e.actor===u.id&&e.kind==='followup');
  const hits=b.log.filter(e=>e.type==='damage'&&e.actor===u.id&&e.kind==='followup'&&e.frame?.action?.sequence===fu.frame.action.sequence);
  assert.equal(hits.length,u.actions.followup.bounceCount,'追击段数应与动作表一致');
});

test('第10批 真实战斗时序：飞霄终结在动作轴内先结算 6 次连段再结算收尾段；符玄 E2 在真实伤害路径拦截致命伤',()=>{
  const fe=actor(1220),m=mate({panel:{...panel(),speed:1}});fe.panel.speed=200;
  const c={strict:true,maxAV:201,sp:3,maxSP:9,seed:9,critMode:'noncrit',units:[fe,m,enemy({panel:{...panel(),hp:1e9,speed:1}})]};
  const b=createBattle(c);b.random=()=>0;
  const u=b.units[0];
  u.energy=u.energyMax;u.policy.autoUltimate=true;
  stepBattle(b);
  const act=b.log.find(e=>e.type==='action'&&e.actor===u.id&&e.key==='ultimate');
  assert.ok(act,'飞霄终结未在动作轴内发动');
  const hits=b.log.filter(e=>e.type==='damage'&&e.actor===u.id&&e.frame?.action?.sequence===act.frame.action.sequence);
  assert.equal(hits.length,u.kit.params.Ultra[2]+1,'应为 6 次连段 + 1 次收尾');
  // 连段每段 = atk×(0.72+0.375)，收尾 = atk×Ultra[0]；总倍率必须落在 Ultra[3] 上。
  const combo=ROSTER_DATA[1220].skills['122008'].params['10'].param_list;
  const atk0=baseOf(hits[0])/(combo[0]+combo[1]);
  const total=hits.reduce((n,e)=>n+baseOf(e),0);
  near(total,atk0*u.kit.params.Ultra[3],1e-6,'终结总倍率应等于 Ultra[3]');
  near(act.energy,u.energyMax-u.kit.params.Talent[2],'终结应消耗 Talent[2]=6 点【飞黄】');
  // 符玄：穷观阵开启后队友受到致命伤害，E2 在引擎 receiveDamage 内生效。
  const fx=actor(1208,{eidolon:2});fx.panel.speed=400;
  const c2={strict:true,maxAV:201,sp:3,maxSP:9,seed:4,critMode:'noncrit',
    units:[fx,mate({currentHp:500,panel:{...panel(),speed:1}}),enemy({panel:{...panel(),hp:1e9,speed:200,atk:50000}})]};
  const r=simulateBattle(c2);
  assert.ok(r.log.some(e=>e.type==='mechanic'&&e.name==='柔兆 · 致命伤害拦截'),'E2 未在真实伤害路径拦截致命伤');
  assert.ok(r.log.some(e=>e.type==='action'&&e.actor===fx.id&&e.key==='skill'),'符玄应先开启【穷观阵】');
});

test('第10批 6 名角色与原四人体系混编可完成严格战斗，无未支持缺口',()=>{
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

test('第10批 角色在多波次严格战斗中处理换波 / 阵亡 / 资源累积，无未支持缺口',()=>{
  for(const id of IDS){
    const x=actor(id,{eidolon:6}),ar=actor(1015),s=actor(1306),ce=actor(1412);
    x.id='focus';x.energy=x.energyMax;x.policy={...x.policy,autoUltimate:true,allyTargetId:ar.id};
    s.policy.allyTargetId=ar.id;ce.policy.allyTargetId=ar.id;
    const c={strict:true,maxAV:900,sp:3,maxSP:9,seed:7,critMode:'expected',requiredAllies:4,
      units:[x,s,ar,ce,enemy({panel:{...panel(),hp:6000,speed:1}}),enemy({id:'enemy-w2',wave:2,panel:{...panel(),hp:6000,speed:1}}),enemy({id:'enemy-w3',wave:3,panel:{...panel(),hp:6000,speed:1}})]};
    assert.deepEqual(validateBattle(c).map(e=>e),[]);
    const r=simulateBattle(c);
    assert.notEqual(r.outcome,'defeat',id+' 在三波战斗中全灭');
    assert.ok(r.damage>0);
    assert.deepEqual(r.unsupported,[]);
  }
});

console.log(`DeepSeek batch10 checks: ${passed} passed, ${failed} failed.`);if(failed)process.exitCode=1;
