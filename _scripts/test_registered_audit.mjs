// 描述级审计驱动的回归测试：修正前批已登记角色与 4.6 原文不符的时序/条件。
// 覆盖：丹恒天赋冷却起算点与消耗条件、黑塔 E1 命中前判定、黑塔控制免疫范围。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createContext} from '../core/ctx.mjs';
import {newBattleBuild,buildBattleActor} from '../simulator/builds.mjs';
import {createBattle,stepBattle,simulateBattle,combatPanel,validateBattle} from '../simulator/engine.mjs';
const data=JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url))),ctx=createContext(data);
const copy=x=>structuredClone(x),near=(a,b,m=1e-6)=>assert.ok(Math.abs(a-b)<m,`${a} != ${b}`);
const panel=()=>({hp:10000,atk:1000,def:1000,speed:100,critRate:.5,critDmg:1,energyRegen:1,effectHit:0,effectRes:0,breakEffect:0,baseStats:{hp:1000,atk:1000,def:1000},elemDmg:{}});
const actor=(id,extra={})=>{const a=buildBattleActor(ctx,{...newBattleBuild(),characterId:id,relicAuto:false,panel:panel(),...extra});a.energy=0;a.policy={...a.policy,autoUltimate:false};return a;};
const enemy=(extra={})=>({id:'enemy',name:'规则训练敌人',side:'enemy',level:90,element:'Physical',panel:{...panel(),hp:1e9,speed:1},energy:0,energyMax:0,res:{},actions:{basic:{name:'测试攻击',type:'Normal',terms:[{scaling:'atk',multiplier:1}],hitEnergy:10}},policy:{autoUltimate:false,basicOnly:true},...extra});
const config=(units,maxAV=201,sp=3)=>({strict:true,maxAV,sp,maxSP:9,seed:42,critMode:'noncrit',units:[...units,enemy()]});
let passed=0,failed=0;const test=(name,fn)=>{try{fn();passed++;console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+'\n'+e.stack);}};

test('丹恒天赋：冷却在抗穿被消耗后才起算，而不是成为目标时',()=>{
  const ty=actor(1202),d=actor(1002);ty.panel.speed=200;ty.policy.allyTargetId=d.id;
  const b=createBattle(config([ty,d]));
  stepBattle(b);
  const dd=b.units[1],en=b.units.at(-1);
  assert.ok(dd.buffs.some(e=>e.tag==='danPenetration'),'成为我方技能目标后未获得寸长寸强');
  assert.equal(dd.resources['寸长寸强可用回合'],undefined,'冷却不应在成为目标时就开始计时');
  b.rules.after(b,dd,'basic','normal',dd.actions.basic,[en],[]);
  assert.ok(!dd.buffs.some(e=>e.tag==='danPenetration'),'攻击后未消耗寸长寸强');
  near(dd.resources['寸长寸强可用回合'],dd.turns+dd.kit.params.Talent[1]);
});

test('丹恒天赋：即使本次攻击没有命中目标，也会消耗抗穿并进入冷却',()=>{
  const d=actor(1002);const b=createBattle(config([d]));
  const dd=b.units[0];
  dd.buffs.push({type:'buff',id:dd.id+':dan',name:'寸长寸强',key:'marker',value:0,remaining:null,tickOwner:dd.id,tickAt:'end',appliedTurn:0,source:dd.id,tag:'danPenetration'});
  b.rules.after(b,dd,'basic','normal',dd.actions.basic,[],[]);
  assert.ok(!dd.buffs.some(e=>e.tag==='danPenetration'),'未命中也应消耗（原始脚本 OnAfterSkillUse）');
  near(dd.resources['寸长寸强可用回合'],dd.turns+dd.kit.params.Talent[1]);
});

test('黑塔 E1 按命中前的生命值判定：被本次普攻打到 50% 以下不补附加伤害',()=>{
  const h=actor(1013,{eidolon:1});h.panel.speed=200;h.policy={...h.policy,basicOnly:true};
  const c=config([h],60);c.units.at(-1).currentHp=5200;c.units.at(-1).panel.hp=10000;
  const r=simulateBattle(c);
  assert.ok(r.log.some(e=>e.type==='action'&&e.actor===h.id),'黑塔未行动');
  assert.equal(r.log.filter(e=>e.type==='damage'&&e.kind==='additional'&&e.actor===h.id).length,0,'命中后才降到 50% 以下被错误计入 E1');
});

test('黑塔 E1 对命中前已处于 50% 以下的目标补一次 40% 冰附加伤害',()=>{
  const h=actor(1013,{eidolon:1});h.panel.speed=200;h.policy={...h.policy,basicOnly:true};
  const c=config([h],60);c.units.at(-1).currentHp=4000;
  const r=simulateBattle(c);
  const extra=r.log.filter(e=>e.type==='damage'&&e.kind==='additional'&&e.actor===h.id);
  assert.equal(extra.length,1);
  const base=extra[0].formula.find(z=>z.zone==='base').value;
  near(base,combatPanel(r.log.at(-1).frame.units.find(u=>u.id===h.id)).atk*h.kit.ranks[1][1],1e-6);
});

test('黑塔天赋在任意控制类负面状态下都不发动追击（不只是冻结）',()=>{
  const h=actor(1013),a=actor(1106);h.panel.speed=100;a.panel.speed=200;
  const b=createBattle(config([h,a])),to=b.units.at(-1),hh=b.units[0];
  to.hp=combatPanel(to).hp*0.4;
  hh.buffs.push({type:'buff',id:'ctrl',name:'禁锢',key:'atkPct',value:-.1,remaining:2,tickOwner:hh.id,tickAt:'end',appliedTurn:0,control:'imprisonment',debuff:true});
  b.rules.afterDamage(b,b.units[1],to,'direct');
  assert.equal(b.queue.filter(q=>q.actor===hh.id&&q.key==='followup').length,0,'控制状态下仍发动了追击');
  hh.buffs=hh.buffs.filter(e=>e.id!=='ctrl');
  to.hp=combatPanel(to).hp*0.4;
  b.rules.afterDamage(b,b.units[1],to,'direct');
  assert.equal(b.queue.filter(q=>q.actor===hh.id&&q.key==='followup').length,1,'解除控制后未恢复追击');
});

test('入场阶段施加的「回合开始递减」效果不再少 1 回合：缇宝秘技神启覆盖 3 个回合',()=>{
  const tr=actor(1403,{technique:true});tr.panel.speed=200;tr.policy={...tr.policy,basicOnly:true};
  const ar=actor(1015);ar.panel.speed=1;
  const r=simulateBattle(config([tr,ar],200));
  const trId=tr.id,acts=r.log.filter(e=>e.type==='action'&&e.actor===trId);
  const has=a=>a.frame.units.find(u=>u.id===trId).buffs.some(b=>b.tag==='revelation');
  assert.ok(acts.length>=4,'缇宝回合数不足');
  assert.deepEqual(acts.slice(0,4).map(has),[true,true,true,false],'秘技神启的覆盖回合数不符');
});

test('审计修正后 4 名前批角色仍可通过严格合同与混编战斗',()=>{
  for(const id of [1002,1013,1103,1301])for(let eidolon=0;eidolon<=6;eidolon++){
    const x=actor(id,{eidolon}),ar=actor(1015),s=actor(1306),ce=actor(1412);
    x.id='audit';x.energy=x.energyMax;x.policy={...x.policy,autoUltimate:true,allyTargetId:ar.id};
    s.policy.allyTargetId=ar.id;ce.policy.allyTargetId=ar.id;
    const c={strict:true,maxAV:260,sp:3,maxSP:9,seed:3,critMode:'expected',requiredAllies:4,units:[x,s,ar,ce,enemy()]};
    assert.deepEqual(validateBattle(c),[]);
    const r=simulateBattle(c);assert.deepEqual(r.unsupported,[]);
  }
});

console.log(`Registered-kit audit checks: ${passed} passed, ${failed} failed.`);if(failed)process.exitCode=1;
