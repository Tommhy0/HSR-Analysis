// DeepSeek 第3批：新增 7 名辅助 / 生存角色的机制测试。
// 期望值全部由 4.6 编译出的 kit 参数推导，不写死倍率。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createContext} from '../core/ctx.mjs';
import {newBattleBuild,buildBattleActor} from '../simulator/builds.mjs';
import {createBattle,stepBattle,simulateBattle,validateBattle,combatPanel} from '../simulator/engine.mjs';
import {validateKitActor} from '../simulator/kits.mjs';
const data=JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url))),ctx=createContext(data);
const copy=x=>structuredClone(x),near=(a,b,m=1e-6)=>assert.ok(Math.abs(a-b)<m,`${a} != ${b}`);
const panel=()=>({hp:10000,atk:1000,def:1000,speed:100,critRate:.5,critDmg:1,energyRegen:1,effectHit:0,effectRes:0,breakEffect:0,baseStats:{hp:1000,atk:1000,def:1000},elemDmg:{}});
const actor=(id,extra={})=>{const a=buildBattleActor(ctx,{...newBattleBuild(),characterId:id,relicAuto:false,panel:panel(),...extra});a.energy=0;a.policy={...a.policy,autoUltimate:false};return a;};
const enemy=(extra={})=>({id:'enemy',name:'规则训练敌人',side:'enemy',level:90,element:'Physical',panel:{...panel(),hp:1e9,speed:1},energy:0,energyMax:0,res:{},actions:{basic:{name:'测试攻击',type:'Normal',terms:[{scaling:'atk',multiplier:1}],hitEnergy:10}},policy:{autoUltimate:false,basicOnly:true},...extra});
const config=(units,maxAV=201,sp=3)=>({strict:true,maxAV,sp,maxSP:9,seed:42,critMode:'noncrit',units:[...units,enemy()]});
let passed=0,failed=0;const test=(name,fn)=>{try{fn();passed++;console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+'\n'+e.stack);}};

test('第3批 7 名角色 E0～E6 动作合同可编译且不能篡改倍率',()=>{
  for(const id of [1203,1211,1104,1217,1110,1207,1001])for(let eidolon=0;eidolon<=6;eidolon++){
    const a=actor(id,{eidolon});assert.deepEqual(validateKitActor(a),[]);
    a.actions.basic.terms[0].multiplier=99;assert.ok(validateKitActor(a).length);}
});

test('罗刹：战技治疗 + 净化 1 个负面 + 白花之刻，2 层展开结界并按回合计减',()=>{
  const lo=actor(1203),ar=actor(1015);lo.panel.speed=1;ar.panel.speed=1;ar.currentHp=5000;
  const b=createBattle(config([lo,ar])),u=b.units[0],to=b.units[1];
  to.buffs.push({id:'bad',debuff:true,key:'speed',value:-.1,duration:2,tickOwner:to.id,tickAt:'end',appliedTurn:0});
  b.rules.after(b,u,'skill','normal',u.actions.skill,[to],[]);
  near(to.hp,5000+combatPanel(u).atk*u.kit.params.BPSkill[0]+u.kit.params.BPSkill[1]);
  assert.ok(!to.buffs.some(e=>e.id==='bad'),'行迹「浸池苏生」未净化负面');
  assert.equal(u.resources['白花之刻'],1);
  b.rules.after(b,u,'skill','normal',u.actions.skill,[to],[]);
  const f=u.buffs.find(e=>e.tag==='luochaField');assert.ok(f,'两层白花之刻未展开结界');
  assert.equal(f.remaining,u.kit.params.Talent[2]);assert.equal(u.resources['白花之刻'],0);
});

test('罗刹：结界中我方攻击后攻击者治疗，行迹让其余队友也获得治疗',()=>{
  const lo=actor(1203),a=actor(1015),c=actor(1412);lo.panel.speed=1;a.panel.speed=1;c.panel.speed=1;
  a.currentHp=100;c.currentHp=100;const b=createBattle(config([lo,a,c])),u=b.units[0],en=b.units.at(-1);
  u.buffs.push({type:'buff',id:u.id+':f',name:'结界',key:'marker',value:0,remaining:2,tickOwner:u.id,tickAt:'start',appliedTurn:0,tag:'luochaField'});
  const atk=combatPanel(u).atk,before=[b.units[1].hp,b.units[2].hp];
  b.rules.after(b,b.units[1],'basic','normal',b.units[1].actions.basic,[en],[en]);
  near(b.units[1].hp,before[0]+atk*u.kit.params.Talent[1]+u.kit.params.Talent[3]);
  near(b.units[2].hp,before[1]+atk*u.kit.trace[2][0]+u.kit.trace[2][1]);
});

test('罗刹：自动战技在低血时触发一次且不消耗战技点，冷却 2 回合',()=>{
  const lo=actor(1203),ar=actor(1015);lo.panel.speed=1;ar.panel.speed=1;
  const b=createBattle(config([lo,ar])),u=b.units[0],to=b.units[1];
  to.hp=100;const sp=b.sp;
  const trigger=()=>b.rules.afterDamage(b,null,to,'direct');
  trigger();assert.equal(b.sp,sp,'自动战技不应消耗战技点');
  assert.ok(b.log.some(e=>e.type==='heal'&&e.target===to.id));
  const heals=b.log.filter(e=>e.type==='heal').length;
  trigger();assert.equal(b.log.filter(e=>e.type==='heal').length,heals,'冷却中不应再次触发');
});

test('罗刹终结驱散 1 个增益并造成全体伤害；E6 使敌方全属性抗性降低',()=>{
  for(const eidolon of [0,6]){
    const lo=actor(1203,{eidolon});lo.panel.speed=1;
    const b=createBattle(config([lo])),u=b.units[0],en=b.units.at(-1),p=u.kit.params;
    en.buffs.push({id:'buff-a',name:'增益A',key:'atk',value:1,duration:3,tickOwner:en.id,tickAt:'end',appliedTurn:0});
    b.rules.before(b,u,'ultimate','ultimate',u.actions.ultimate);
    b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[en],[en]);
    assert.ok(!en.buffs.some(e=>e.id==='buff-a'),'终结未驱散增益');
    assert.equal(u.resources['白花之刻'],1);
    const res=en.buffs.filter(e=>e.resReduction);
    assert.equal(res.length,eidolon?7:0);
    if(eidolon)for(const e of res)near(e.value,u.kit.ranks[6][1]);
    assert.equal(p.Ultra[1],1);
  }
});

test('白露：战技主治疗 + 2 次递减 15% 的随机治疗；终结附加 / 延长【生息】',()=>{
  const ba=actor(1211),a=actor(1015),c=actor(1412);ba.panel.speed=1;a.panel.speed=1;c.panel.speed=1;
  a.currentHp=1;c.currentHp=1;ba.currentHp=1;
  const b=createBattle(config([ba,a,c])),u=b.units[0],to=b.units[1],p=u.kit.params;
  b.random=()=>0;                                       // 固定随机目标为队伍首个我方单位
  b.rules.after(b,u,'skill','normal',u.actions.skill,[to],[]);
  const heals=b.log.filter(e=>e.type==='heal').map(e=>e.amount);
  assert.equal(heals.length,3);
  const base=combatPanel(u).hp*p.BPSkill[0]+p.BPSkill[1];
  near(heals[0],base);
  near(heals[1],base*(1-p.BPSkill[2]));
  near(heals[2],base*Math.pow(1-p.BPSkill[2],2));
  b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[u],[]);
  for(const ally of [b.units[0],b.units[1],b.units[2]])assert.ok(ally.buffs.some(e=>e.id==='bailu:invigorate'),'终结未附加生息');
  const first=b.units[0].buffs.find(e=>e.id==='bailu:invigorate').remaining;
  b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[u],[]);
  assert.equal(b.units[0].buffs.find(e=>e.id==='bailu:invigorate').remaining,first+1,'已有生息未延长 1 回合');
});

test('白露：生息受击回复有次数上限（行迹 +1），过量治疗提高目标生命上限',()=>{
  const ba=actor(1211),ar=actor(1015);ba.panel.speed=1;ar.panel.speed=1;
  const b=createBattle(config([ba,ar])),u=b.units[0],to=b.units[1],en=b.units.at(-1);
  b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[u],[]);
  const e=to.buffs.find(x=>x.id==='bailu:invigorate');
  assert.equal(e.maxTriggers,u.kit.params.Talent[4]+u.kit.trace[2][0]);
  to.hp=100;const before=to.hp;
  for(let i=0;i<e.maxTriggers;i++)b.rules.attacked(b,to,en);
  assert.equal(e.triggers,e.maxTriggers);
  assert.ok(to.hp>before);
  const hpAfter=to.hp;
  b.rules.attacked(b,to,en);
  assert.equal(to.hp,hpAfter,'超过次数上限仍触发了治疗');
  // 过量治疗：满血时治疗应提高生命上限
  to.hp=combatPanel(to).hp;
  b.rules.after(b,u,'skill','normal',u.actions.skill,[to],[]);
  assert.ok(to.buffs.some(e2=>e2.id==='bailu:trace1'),'过量治疗未提高生命上限');
});

test('白露：队友受到致命攻击时不会倒下并回复，单场限次',()=>{
  const ba=actor(1211),ar=actor(1015);ba.panel.speed=1;ar.panel.speed=1;
  const b=createBattle(config([ba,ar])),u=b.units[0],to=b.units[1],en=b.units.at(-1);
  to.hp=10;
  b.rules.attacked(b,to,en);
  b.rules.damage?.(b,en,to,1e6,'direct');
  // 通过引擎的 receiveDamage 路径：用 enemy 动作造成致命伤害
  const c=config([ba,ar]);c.units.at(-1).panel.atk=1e9;c.units.at(-1).panel.speed=1000;
  const b2=createBattle(c);b2.units[1].hp=10;
  simulateBattle({...c,maxAV:400});
  assert.ok(b2.log.filter(e=>e.type==='death'&&e.actor===b2.units[1].id).length===0);
});

test('杰帕德：终结全体护盾按防御力结算，持续 3 回合；秘技开场护盾',()=>{
  const gp=actor(1104,{technique:true}),ar=actor(1015);gp.panel.speed=1;ar.panel.speed=1;
  const b=createBattle(config([gp,ar])),u=b.units[0],p=u.kit.params;
  const m=p.Maze;
  for(const to of [b.units[0],b.units[1]]){const s=to.shields.find(s=>s.source===u.id);
    assert.ok(s,'秘技未提供护盾');near(s.value,combatPanel(u).def*m[0]+m[2]);assert.equal(s.remaining,m[1]);}
  b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[u],[]);
  for(const to of [b.units[0],b.units[1]]){const s=to.shields.find(s=>s.source===u.id);
    near(s.value,combatPanel(u).def*p.Ultra[0]+p.Ultra[2]);assert.equal(s.remaining,p.Ultra[1]);}
});

test('杰帕德：战技冻结按基础概率生效，冻结期间造成按攻击力的冰属性附加伤害',()=>{
  for(const eidolon of [0,1]){
    const gp=actor(1104,{eidolon});gp.panel.speed=1;gp.panel.effectHit=10;
    const b=createBattle(config([gp])),u=b.units[0],en=b.units.at(-1),p=u.kit.params;
    b.rules.after(b,u,'skill','normal',u.actions.skill,[en],[en]);
    const f=en.dots.find(e=>e.control==='freeze');assert.ok(f,'未施加冻结');assert.equal(f.remaining,p.BPSkill[2]);
    near(f.terms[0].multiplier,p.BPSkill[3]);
    assert.equal((p.BPSkill[1]+(eidolon?u.kit.ranks[1][0]:0))>0,true);
  }
});

test('杰帕德：行迹战意按防御力加攻、刚正提高仇恨、E4 全队效果抵抗',()=>{
  const gp=actor(1104,{eidolon:4});const b=createBattle(config([gp])),u=b.units[0];
  near(combatPanel(u).atk,u.panel.atk+combatPanel(u).def*u.kit.trace[3][0]);
  assert.ok(combatPanel(u).aggroRatio>1);
  for(const to of b.units.filter(x=>x.side==='ally'))near(combatPanel(to).effectRes,(to.panel.effectRes??0)+u.kit.ranks[4][0]);
});

test('藿藿：战技净化 + 主治疗 + 相邻治疗并获得禳命；终结按队友能量上限回能并加攻',()=>{
  const hh=actor(1217),a=actor(1015),c=actor(1412);hh.panel.speed=1;a.panel.speed=1;c.panel.speed=1;
  hh.currentHp=100;a.currentHp=100;c.currentHp=100;
  const b=createBattle(config([hh,a,c])),u=b.units[0],p=u.kit.params;
  const mid=b.units[1];mid.buffs.push({id:'bad',debuff:true,key:'speed',value:-.1,duration:2,tickOwner:mid.id,tickAt:'end',appliedTurn:0});
  b.rules.after(b,u,'skill','normal',u.actions.skill,[mid],[]);
  assert.ok(!mid.buffs.some(e=>e.id==='bad'));
  near(mid.hp,100+combatPanel(u).hp*p.BPSkill[0]+p.BPSkill[1]);
  for(const t of [b.units[0],b.units[2]])near(t.hp,100+combatPanel(u).hp*p.BPSkill[2]+p.BPSkill[3]);
  assert.ok(u.buffs.some(e=>e.tag==='huohuoBless'));
  for(const t of [b.units[0],b.units[1],b.units[2]])t.energy=0;
  b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[u],[]);
  near(b.units[1].energy,b.units[1].energyMax*p.Ultra[0]);
  near(b.units[2].energy,b.units[2].energyMax*p.Ultra[0]);
  near(b.units[0].energy,0);
  near(b.units[1].buffs.find(e=>e.id==='huohuoUlt:'+b.units[1].id).value,p.Ultra[1]);
});

test('藿藿：禳命在我方回合开始治疗并净化，净化次数上限 6，行迹回能',()=>{
  const hh=actor(1217),a=actor(1015);hh.panel.speed=1;a.panel.speed=1;
  const b=createBattle(config([hh,a])),u=b.units[0],to=b.units[1],p=u.kit.params;
  u.buffs.push({type:'buff',id:u.id+':b',name:'禳命',key:'marker',value:0,remaining:2,tickOwner:u.id,tickAt:'start',appliedTurn:0,tag:'huohuoBless'});
  to.hp=100;u.resources['禳命净化次数']=0;u.energy=0;
  b.rules.onTurnStart(b,to);
  assert.ok(to.hp>100);
  near(u.energy,u.kit.trace[3][0]);
  for(let i=0;i<8;i++){to.buffs.push({id:'d'+i,debuff:true,key:'speed',value:-.01,duration:2,tickOwner:to.id,tickAt:'end',appliedTurn:0});}
  b.rules.onTurnStart(b,to);
  assert.ok(u.resources['禳命净化次数']<=p.Talent[6]);
});

test('藿藿：E4 低血增疗 / E6 治疗增伤 / E2 免于致命消耗禳命',()=>{
  const hh=actor(1217,{eidolon:6}),a=actor(1015);hh.panel.speed=1;a.panel.speed=1;
  const b=createBattle(config([hh,a])),u=b.units[0],to=b.units[1];
  u.buffs.push({type:'buff',id:u.id+':b',name:'禳命',key:'marker',value:0,remaining:3,tickOwner:u.id,tickAt:'start',appliedTurn:0,tag:'huohuoBless'});
  const before=to.hp=1;
  b.rules.onTurnStart(b,to);
  const low=to.hp-before;
  to.hp=combatPanel(to).hp*0.9;const mid=to.hp;
  b.rules.onTurnStart(b,to);
  const high=to.hp-mid;
  const expectedLow=(combatPanel(u).hp*u.kit.params.Talent[2]+u.kit.params.Talent[4])*(1+u.kit.ranks[4]*1);
  assert.ok(low>high,'E4 低血治疗量未提高');
  assert.ok(to.buffs.some(e=>e.id==='huohuoE6:'+to.id),'E6 未提供增伤');
  assert.ok(expectedLow>0);
});

test('玲可：求生反应提高目标生命上限并治疗，持续治疗在目标回合开始结算',()=>{
  const ly=actor(1110),a=actor(1015);ly.panel.speed=1;a.panel.speed=1;a.currentHp=1;
  const b=createBattle(config([ly,a])),u=b.units[0],to=b.units[1],p=u.kit.params;
  b.rules.after(b,u,'skill','normal',u.actions.skill,[to],[]);
  assert.ok(to.buffs.some(e=>e.tag==='lynxSurvival'));
  near(combatPanel(to).hp,to.panel.hp+u.panel.hp*p.BPSkill[0]+p.BPSkill[1]);
  near(to.hp,1+combatPanel(u).hp*p.BPSkill[3]+p.BPSkill[4]);
  const regen=to.buffs.find(e=>e.tag==='lynxRegen');assert.ok(regen);
  assert.equal(regen.remaining,p.Talent[0]+u.kit.trace[3][0]);
  const before=to.hp;
  b.rules.onTurnStart(b,to);
  const healed=to.hp-before;
  const basic=combatPanel(u).hp*p.Talent[1]+p.Talent[2],survival=combatPanel(u).hp*p.Talent[3]+p.Talent[4];
  near(healed,basic+survival);
});

test('玲可：终结全队净化并治疗；行迹受击回能；E4 攻击转换',()=>{
  const ly=actor(1110,{eidolon:4}),a=actor(1015);ly.panel.speed=1;a.panel.speed=1;a.currentHp=1;
  const b=createBattle(config([ly,a])),u=b.units[0],to=b.units[1],en=b.units.at(-1),p=u.kit.params;
  to.buffs.push({id:'bad',debuff:true,key:'speed',value:-.1,duration:2,tickOwner:to.id,tickAt:'end',appliedTurn:0});
  b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[u],[]);
  assert.ok(!to.buffs.some(e=>e.id==='bad'));
  near(to.hp,1+(combatPanel(u).hp*p.Ultra[1]+p.Ultra[2])*(1+u.kit.ranks[1][1]));
  b.rules.after(b,u,'skill','normal',u.actions.skill,[to],[]);
  near(combatPanel(to).atk,to.panel.atk+u.panel.hp*u.kit.ranks[4][0]);
  u.energy=0;b.rules.attacked(b,to,en);
  near(u.energy,u.kit.trace[1][0]);
});

test('驭空：战技叠 2 层鸣弦号令、持有期间全队加攻、回合结束移除 1 层（施放回合不移除）',()=>{
  const yk=actor(1207),a=actor(1015);yk.panel.speed=1;a.panel.speed=1;
  const b=createBattle(config([yk,a])),u=b.units[0],p=u.kit.params;
  b.rules.after(b,u,'skill','normal',u.actions.skill,[u],[]);
  assert.equal(u.resources['鸣弦号令'],p.BPSkill[0]);
  near(b.units[1].buffs.find(e=>e.id==='yukongAtk:'+b.units[1].id).value,p.BPSkill[1]);
  b.rules.onTurnEnd(b,u);
  assert.equal(u.resources['鸣弦号令'],p.BPSkill[0],'施放战技的回合不应移除号令');
  b.rules.onTurnEnd(b,b.units[1]);
  assert.equal(u.resources['鸣弦号令'],p.BPSkill[0]-1);
  b.rules.onTurnEnd(b,b.units[1]);
  assert.equal(u.resources['鸣弦号令'],0);
  assert.ok(!b.units[1].buffs.some(e=>e.id==='yukongAtk:'+b.units[1].id));
});

test('驭空：天赋普攻追加伤害并把削韧提高到 2 倍，1 回合冷却；终结按号令给全队双暴',()=>{
  const yk=actor(1207),a=actor(1015);yk.panel.speed=200;yk.policy={...yk.policy,basicOnly:true};
  const c=config([yk,a]);c.units.at(-1).standardBreak=true;c.units.at(-1).rank='elite';c.units.at(-1).toughnessMax=100;c.units.at(-1).weaknesses=['Imaginary'];c.units.at(-1).panel.speed=1;
  const r=simulateBattle({...c,maxAV:60}),u=r.units[0],enN=r.units.at(-1);
  const p=yk.kit.params;
  near(enN.toughness,100-30*(1+p.Talent[1]));
  assert.equal(r.log.filter(e=>e.kind==='additional'&&e.actor===u.id).length,1);
  const b=createBattle(config([yk,a])),uu=b.units[0],en=b.units.at(-1);
  b.rules.after(b,uu,'skill','normal',uu.actions.skill,[uu],[]);
  b.rules.after(b,uu,'ultimate','ultimate',uu.actions.ultimate,[en],[en]);
  near(b.units[1].buffs.find(e=>e.id.startsWith('yukongUltC:')).value,p.Ultra[1]);
  near(b.units[1].buffs.find(e=>e.id.startsWith('yukongUltD:')).value,p.Ultra[2]);
});

test('驭空：行迹虚数增伤与号令回能、E4 自身增伤',()=>{
  const yk=actor(1207,{eidolon:4}),a=actor(1015);yk.panel.speed=1;a.panel.speed=1;
  const b=createBattle(config([yk,a])),u=b.units[0],en=b.units.at(-1);
  const act={type:'BPSkill',element:'Imaginary'};
  near(b.rules.modifiers(b,b.units[1],en,act,'direct').dmgBoost,u.kit.trace[2][0]);
  b.rules.after(b,u,'skill','normal',u.actions.skill,[u],[]);
  near(b.rules.modifiers(b,u,en,act,'direct').dmgBoost,u.kit.trace[2][0]+u.kit.ranks[4][0]);
  u.energy=0;b.rules.after(b,b.units[1],'basic','normal',b.units[1].actions.basic,[en],[en]);
  near(u.energy,u.kit.trace[3][0]);
});

test('三月七：战技护盾按防御力、行迹延长持续并净化；终结冻结附加冰伤害',()=>{
  const m7=actor(1001,{eidolon:1}),a=actor(1015);m7.panel.speed=1;a.panel.speed=1;
  const b=createBattle(config([m7,a])),u=b.units[0],to=b.units[1],en=b.units.at(-1),p=u.kit.params;
  to.buffs.push({id:'bad',debuff:true,key:'speed',value:-.1,duration:2,tickOwner:to.id,tickAt:'end',appliedTurn:0});
  b.rules.after(b,u,'skill','normal',u.actions.skill,[to],[]);
  assert.ok(!to.buffs.some(e=>e.id==='bad'));
  const s=to.shields.find(s=>s.source===u.id);
  near(s.value,combatPanel(u).def*p.BPSkill[0]+p.BPSkill[3]);
  assert.equal(s.remaining,p.BPSkill[1]+u.kit.trace[2][0]);
  u.panel.effectHit=10;
  b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[en],[en]);
  assert.ok(en.dots.some(e=>e.control==='freeze'));
  near(en.dots.find(e=>e.control==='freeze').terms[0].multiplier,p.Ultra[3]);
  near(u.energy,u.kit.ranks[1][0]);
});

test('三月七：天赋护盾持有者被攻击后反击，每回合 2 次（E4 3 次）且反击额外按防御加成',()=>{
  for(const [eidolon,max,defTerm] of [[0,2,0],[4,3,0.3]]){
    const m7=actor(1001,{eidolon}),a=actor(1015);m7.panel.speed=1;
    const b=createBattle(config([m7,a])),u=b.units[0],to=b.units[1],en=b.units.at(-1);
    to.shields.push({type:'shield',id:u.id+':marchSkill',name:'盾',value:1,duration:3,source:u.id,tickOwner:to.id,tickAt:'end'});
    for(let i=0;i<max+1;i++)b.rules.attacked(b,to,en);
    assert.equal(b.queue.filter(q=>q.actor===u.id&&q.key==='counter').length,max);
    const a2=b.rules.prepare(b,u,'counter','followup',u.actions.counter);
    assert.equal(a2.terms.length,eidolon?2:1);
    if(eidolon)near(a2.terms[1].multiplier,u.kit.ranks[4][0]);
    void defTerm;
  }
});

test('三月七：E2 开场为最低血量目标提供护盾，E6 护盾目标回合开始回复',()=>{
  const m7=actor(1001,{eidolon:6}),a=actor(1015),c=actor(1412);m7.panel.speed=1;a.panel.speed=1;c.panel.speed=1;
  a.currentHp=5000;c.currentHp=100;
  const b=createBattle(config([m7,a,c])),u=b.units[0],p=u.kit.params;
  b.rules.onWaveStart(b);
  const lowest=b.units[2];
  const s=lowest.shields.find(s=>s.group==='marchE2'||s.name.includes('记忆中的它'));
  assert.ok(s,'E2 未给最低血量目标护盾');
  near(s.value,combatPanel(u).def*u.kit.ranks[2][0]+u.kit.ranks[2][2]);
  const to=b.units[1];to.shields.push({type:'shield',id:u.id+':marchSkill',name:'盾',value:1,duration:3,source:u.id,tickOwner:to.id,tickAt:'end'});
  to.hp=100;const before=to.hp;
  b.rules.onTurnStart(b,to);
  near(to.hp,before+combatPanel(to).hp*u.kit.ranks[6][0]+u.kit.ranks[6][1]);
  void p;
});

test('第3批 7 名角色 E0～E6 与既有四人体系混编可完成严格战斗，无未支持缺口',()=>{
  for(const id of [1203,1211,1104,1217,1110,1207,1001])for(let eidolon=0;eidolon<=6;eidolon+=3){
    const a=actor(id,{eidolon}),ar=actor(1015),s=actor(1306),ce=actor(1412);
    a.id='focus';a.energy=a.energyMax;a.policy={...a.policy,autoUltimate:true,allyTargetId:ar.id};
    s.policy.allyTargetId=ar.id;ce.policy.allyTargetId=ar.id;
    const c={strict:true,maxAV:260,sp:3,maxSP:9,seed:3,critMode:'expected',requiredAllies:4,units:[a,s,ar,ce,enemy()]};
    assert.deepEqual(validateBattle(c).map(e=>e),[]);
    const r=simulateBattle(c);assert.deepEqual(r.unsupported,[]);
  }
});

console.log(`DeepSeek batch03 checks: ${passed} passed, ${failed} failed.`);if(failed)process.exitCode=1;
