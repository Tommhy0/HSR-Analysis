// DeepSeek 隔离副本第1批：阮•梅 1303 / 知更鸟 1309 机制测试。
// 只读取公开 4.6 数据；所有期望值都从角色实际编译出的 kit 参数与击破基数推导，不写死倍率。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createContext} from '../core/ctx.mjs';
import {newBattleBuild,buildBattleActor} from '../simulator/builds.mjs';
import {createBattle,stepBattle,simulateBattle,validateBattle,combatPanel} from '../simulator/engine.mjs';
import {validateKitActor,KIT_IDS} from '../simulator/kits.mjs';
import {replayAt} from '../simulator/replay.mjs';
import {BREAK_BASE} from '../simulator/game-data.mjs';
const data=JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url))),ctx=createContext(data);
// 98 名角色均已登记，已不存在「尚未登记角色」；缺口用例改为移除真实角色的可执行实现来等价构造。
const copy=x=>structuredClone(x),near=(a,b,m=1e-6)=>assert.ok(Math.abs(a-b)<m,`${a} != ${b}`);
const panel={hp:10000,atk:1000,def:1000,speed:100,critRate:.5,critDmg:1,energyRegen:1,effectHit:0,effectRes:0,breakEffect:0,baseStats:{hp:1000,atk:1000,def:1000},elemDmg:{}};
const actor=(id,extra={})=>{const a=buildBattleActor(ctx,{...newBattleBuild(),characterId:id,relicAuto:false,panel:copy(panel),...extra});a.energy=0;a.policy={...a.policy,autoUltimate:false};return a;};
const enemy=(extra={})=>({id:'enemy',name:'规则训练敌人',side:'enemy',level:90,element:'Physical',panel:{...copy(panel),hp:1e9,speed:1},energy:0,energyMax:0,res:{},actions:{basic:{name:'测试攻击',type:'Normal',terms:[{scaling:'atk',multiplier:1}],hitEnergy:10}},policy:{autoUltimate:false,basicOnly:true},...extra});
const config=(units,maxAV=201,sp=3)=>({strict:true,maxAV,sp,maxSP:9,seed:42,critMode:'noncrit',units:[...units,enemy()]});
// 让敌方从指定回合开始进入“可被击破”的精英规则。
const breakable=(c,toughnessMax=30,weaknesses=['Physical'])=>{const e=c.units.at(-1);Object.assign(e,{standardBreak:true,rank:'elite',toughnessMax,weaknesses,panel:{...e.panel,speed:100}});return e;};
const stepUntil=(b,fn,limit=12)=>{for(let i=0;i<limit&&!fn();i++)if(!stepBattle(b))break;return fn();};
let passed=0,failed=0;const test=(name,fn)=>{try{fn();passed++;console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+'\n'+e.stack);}};

test('阮•梅 / 知更鸟 E0～E6 参数、行迹、星魂与动作合同编译通过，且不能篡改倍率',()=>{
  for(const id of [1303,1309])for(let eidolon=0;eidolon<=6;eidolon++){
    const a=actor(id,{eidolon});assert.deepEqual(validateKitActor(a),[]);
    a.actions.basic.terms[0].multiplier=99;assert.ok(validateKitActor(a).length);
    const b=actor(id,{eidolon});b.kit.params.BPSkill[0]=99;assert.ok(validateKitActor(b).length);
  }
});

test('阮•梅战技「弦外音」全队增伤 3 回合、弱点击破效率 +50%，计时者为阮•梅',()=>{
  const rm=actor(1303),ar=actor(1015);ar.panel.speed=1;
  const b=createBattle(config([rm,ar]));stepBattle(b);
  const s=b.units[1].buffs.find(e=>e.tag==='ruanMeiString');
  near(s.value,rm.kit.params.BPSkill[0]);assert.equal(s.remaining,rm.kit.params.BPSkill[2]);
  assert.equal(s.tickOwner,rm.id);assert.equal(s.tickAt,'start');
  near(combatPanel(b.units[1]).breakEfficiency,rm.kit.params.BPSkill[1]);
  near(b.units[0].energy,rm.kit.trace[2][0]+rm.actions.skill.energyGain);
});

test('阮•梅行迹「落烛照水燃」按击破特攻超出 120% 的每 10% 加 6% 增伤，上限 36%',()=>{
  for(const [extraBe,steps] of [[0.4,0],[1.0,0],[1.35,3],[1.75,9]]){
    const rm=actor(1303);rm.panel.breakEffect=extraBe;const ar=actor(1015);ar.panel.speed=1;
    const b=createBattle(config([rm,ar]));stepBattle(b);
    const t=rm.kit.trace[3],eff=extraBe+rm.kit.trace[1][0];
    const expected=rm.kit.params.BPSkill[0]+Math.min(t[3],Math.floor(Math.max(0,eff-t[0])/t[1]+1e-9)*t[2]);
    near(b.units[1].buffs.find(e=>e.tag==='ruanMeiString').value,expected);
    assert.ok(expected>0&&expected<=rm.kit.params.BPSkill[0]+t[3]);
    assert.ok(steps>=0);
  }
});

test('阮•梅终结结界：全队抗性穿透、E6 延长 1 回合、E1 结界中无视 20% 防御',()=>{
  const rm=actor(1303,{eidolon:6});rm.energy=rm.energyMax;rm.policy.autoUltimate=true;rm.panel.speed=1;
  const ar=actor(1015);ar.panel.speed=1;
  const b=createBattle(config([rm,ar],1));stepBattle(b);
  const rmU=b.units[0],arU=b.units[1];
  const f=rmU.buffs.find(e=>e.tag==='ruanMeiField');
  assert.equal(f.remaining,rm.kit.params.Ultra[1]+rm.kit.ranks[6][0]);
  const pen=arU.buffs.find(e=>e.tag==='ruanMeiPen');
  near(pen.value,rm.kit.params.Ultra[0]);assert.equal(pen.tickOwner,rm.id);assert.equal(pen.tickAt,'start');
  near(b.rules.modifiers(b,arU,b.units.at(-1),arU.actions.basic,'direct').defIgnore,rm.kit.ranks[1][0]);
});

test('阮•梅天赋「分型的螺旋」由击破者触发、伤害归属阮•梅、E4 先叠 100% 击破特攻、E6 +200% 倍率',()=>{
  const run=eidolon=>{
    const rm=actor(1303,{eidolon});rm.panel.speed=1;
    const rob=actor(1309);rob.panel.speed=200;rob.policy.basicOnly=true;
    const c=config([rm,rob],200);breakable(c,60,['Physical']);
    const b=createBattle(c),rmU=b.units[0];
    stepUntil(b,()=>b.log.some(x=>x.type==='break'));
    const ev=b.log.find(x=>x.type==='damage'&&x.kind==='break_additional'&&x.actor===rmU.id);
    assert.ok(ev,'缺少阮•梅天赋击破伤害');
    return {base:ev.formula.find(z=>z.zone==='base').value,rmU};
  };
  const e0=run(0),e6=run(6);
  const be0=1+rmTrait(e0.rmU);   // 行迹「物体呼吸中」+20%
  near(e0.base,BREAK_BASE[80]*be0*(.5+60/120)*e0.rmU.kit.params.Talent[1]);
  const be6=1+rmTrait(e6.rmU)+e6.rmU.kit.ranks[4][0];   // E4 再 +100%
  near(e6.base,BREAK_BASE[80]*be6*(.5+60/120)*(e6.rmU.kit.params.Talent[1]+e6.rmU.kit.ranks[6][1]));
  function rmTrait(u){return u.kit.trace[1][0];}
});

test('残梅绽：敌方恢复前只附加一次，触发时延长击破、按击破特攻延后并造成 50% 冰击破伤害',()=>{
  const rm=actor(1303);rm.panel.speed=1;
  const rob=actor(1309);rob.panel.speed=200;rob.policy.basicOnly=true;
  const c=config([rm,rob],400);const enCfg=breakable(c,30,['Physical']);
  const b=createBattle(c),rmU=b.units[0],robU=b.units[1],en=b.units.at(-1);
  assert.equal(enCfg.id,en.id);
  b.rules.after(b,rmU,'ultimate','ultimate',rmU.actions.ultimate,[robU],[]);   // 展开结界
  assert.ok(stepUntil(b,()=>b.log.some(x=>x.type==='break')));
  assert.ok(en.buffs.some(x=>x.tag==='ruanMeiImprint'));
  const be=combatPanel(rmU).breakEffect??0,ratio=be*rmU.kit.params.Ultra[2]+rmU.kit.params.Ultra[3];
  const at=b.log.length;
  assert.ok(stepUntil(b,()=>b.log.some(x=>x.type==='delay'&&x.actor===en.id&&Math.abs(x.ratio-ratio)<1e-9)),'敌方回合未触发残梅绽');
  assert.ok(!en.buffs.some(x=>x.tag==='ruanMeiImprint'),'触发后残梅绽未消耗');
  assert.ok(en.broken,'残梅绽未延长弱点击破状态');
  const dly=b.log.slice(at).find(x=>x.type==='delay'&&x.actor===en.id);
  near(dly.ratio,ratio);
  const imp=b.log.slice(at).find(x=>x.type==='damage'&&x.kind==='break_additional'&&x.actor===rmU.id);
  assert.ok(imp,'残梅绽未造成击破伤害');
  near(imp.formula.find(z=>z.zone==='base').value,BREAK_BASE[80]*(1+be)*(.5+30/120)*rmU.kit.params.Ultra[4]);
  // 仍处于击破状态的后续攻击不能再次附加
  assert.ok(!en.buffs.some(x=>x.tag==='ruanMeiImprint'));
  assert.equal(en.resources['残梅绽锁定'],1);
  assert.ok(stepUntil(b,()=>!en.broken,20),'敌方未能恢复');
  assert.equal(en.resources['残梅绽锁定'],0,'恢复后仍未解除不可重复附加的限制');
});

test('阮•梅 E2 对击破状态敌人造成伤害时攻击力 +40%，仅作用于该次伤害',()=>{
  const hit=eidolon=>{
    const rm=actor(1303,{eidolon});rm.panel.speed=1;
    const rob=actor(1309);rob.panel.speed=200;rob.policy.basicOnly=true;
    const c=config([rm,rob],60);const b=createBattle(c);
    b.units.at(-1).broken=true;b.units.at(-1).toughness=0;
    assert.ok(stepUntil(b,()=>b.log.some(x=>x.type==='damage'&&x.actor===rob.id&&x.kind==='direct')));
    return b.log.find(x=>x.type==='damage'&&x.actor===rob.id&&x.kind==='direct').formula.find(z=>z.zone==='base').value;
  };
  const e0=hit(0),e2=hit(2);
  near(e2/e0,1+actor(1303,{eidolon:2}).kit.ranks[2][0]);
});

test('阮•梅行迹「日消遐思长」回合开始固定回 5 能；秘技开场自动触发一次不耗点的战技',()=>{
  const rm=actor(1303,{technique:true});
  const b=createBattle(config([rm]));
  assert.equal(b.sp,3,'秘技不应消耗战技点');
  assert.ok(b.units[0].buffs.some(e=>e.tag==='ruanMeiString'));
  const before=b.units[0].energy;b.rules.onTurnStart(b,b.units[0]);
  near(b.units[0].energy-before,rm.kit.trace[2][0]);
});

test('知更鸟行迹「华彩花腔」开局提前 25%，天赋全队暴伤 +20%',()=>{
  const ro=actor(1309),ar=actor(1015);
  const b=createBattle(config([ro,ar]));
  near(b.units[0].distance,10000*(1-ro.kit.trace[1][0]));
  near(combatPanel(b.units[1]).critDmg,ar.panel.critDmg+ro.kit.params.Talent[0]);
});

test('知更鸟战技全队增伤 3 回合、行迹「模进乐段」额外回 5 能',()=>{
  const ro=actor(1309),ar=actor(1015);ar.panel.speed=1;
  const b=createBattle(config([ro,ar]));stepBattle(b);
  const s=b.units[1].buffs.find(e=>e.tag==='robinSkill');
  near(s.value,ro.kit.params.BPSkill[0]);assert.equal(s.remaining,ro.kit.params.BPSkill[1]);assert.equal(s.tickOwner,ro.id);
  near(b.units[0].energy,ro.actions.skill.energyGain+ro.kit.trace[3][0]);
});

test('知更鸟秘技每波次恢复 5 点能量',()=>{
  const ro=actor(1309,{technique:true});
  const b=createBattle(config([ro]));
  near(b.units[0].energy,ro.kit.params.Maze[1]);
});

test('知更鸟终结技：队友立即行动、全队按知更鸟攻击力加攻、出现固定 90 速协奏倒计时、自身无法行动',()=>{
  const ro=actor(1309);ro.energy=ro.energyMax;ro.policy.autoUltimate=true;ro.panel.speed=1;
  const ar=actor(1015);ar.panel.speed=100;ar.policy.basicOnly=true;
  const b=createBattle(config([ro,ar],1));stepBattle(b);
  const roU=b.units[0],arU=b.units[1],p=roU.kit.params;
  assert.ok(roU.buffs.some(e=>e.tag==='robinConcerto'));
  assert.equal(roU.cannotAct,true);assert.equal(roU.policy.autoUltimate,false);
  const count=b.summons.find(s=>s.owner===roU.id&&s.kind==='countdown');
  assert.ok(count);assert.equal(count.speed,p.Ultra[1]);assert.equal(count.id,roU.id+':concerto');
  assert.ok(b.log.some(e=>e.type==='action'&&e.actor===arU.id&&e.av===0),'队友未立即行动');
  const baseAtk=roU.panel.atk;
  near(combatPanel(arU).atk,arU.panel.atk+baseAtk*p.Ultra[0]+p.Ultra[2]);
  near(roU.energy,roU.actions.ultimate.energyGain+p.Talent[1]);
});

test('协奏附加伤害归属知更鸟、暴击固定 100% / 150%，不随录像非暴击模式改变',()=>{
  const ro=actor(1309);ro.energy=ro.energyMax;ro.policy.autoUltimate=true;ro.panel.speed=1;
  const ar=actor(1015);ar.panel.speed=100;ar.policy.basicOnly=true;
  const b=createBattle(config([ro,ar],1));stepBattle(b);
  const roU=b.units[0],p=roU.kit.params;
  const add=b.log.filter(e=>e.type==='damage'&&e.kind==='additional'&&e.actor===roU.id);
  assert.equal(add.length,1);
  near(add[0].formula.find(z=>z.zone==='crit').value,1+p.Ultra[5]);
  near(add[0].formula.find(z=>z.zone==='base').value,combatPanel(roU).atk*p.Ultra[3]);
  // 天赋回能：我方目标攻击后知更鸟回 2 点
  near(roU.energy,roU.actions.ultimate.energyGain+p.Talent[1]);
});

test('知更鸟 E1 协奏中全队抗性穿透 +24%，行迹「即兴装饰」追加攻击暴伤 +25%',()=>{
  const ro=actor(1309,{eidolon:1});ro.energy=ro.energyMax;ro.policy.autoUltimate=true;ro.panel.speed=1;
  const ar=actor(1015);ar.panel.speed=1;
  const b=createBattle(config([ro,ar],1));stepBattle(b);
  const roU=b.units[0],arU=b.units[1],en=b.units.at(-1);
  near(b.rules.modifiers(b,arU,en,arU.actions.basic,'direct').resPen,roU.kit.ranks[1][0]);
  near(b.rules.modifiers(b,arU,en,arU.actions.basic,'followup').critDmg,roU.kit.trace[2][0]);
  near(b.rules.modifiers(b,arU,en,arU.actions.basic,'direct').critDmg,0);
});

test('知更鸟 E2 协奏中全队速度 +16% 且天赋回能 +1；E6 前 8 次附加伤害暴伤 +450%',()=>{
  const ro=actor(1309,{eidolon:6});ro.energy=ro.energyMax;ro.policy.autoUltimate=true;ro.panel.speed=1;
  const ar=actor(1015);ar.panel.speed=1;
  const c=config([ro,ar],1);const b=createBattle(c),roU=b.units[0],arU=b.units[1],en=b.units.at(-1);
  roU.energy=0;
  b.rules.after(b,roU,'ultimate','ultimate',roU.actions.ultimate,[arU],[]);
  near(arU.buffs.find(e=>e.source===roU.id&&e.key==='speedPct').value,roU.kit.ranks[2][0]);
  for(let i=0;i<9;i++){b.rules.after(b,arU,'basic','normal',arU.actions.basic,[en],[en]);}
  const add=b.log.filter(e=>e.type==='damage'&&e.kind==='additional'&&e.actor===roU.id);
  assert.equal(add.length,9);
  const zones=add.map(e=>e.formula.find(z=>z.zone==='crit').value);
  for(const z of zones.slice(0,roU.kit.ranks[6][0]))near(z,1+roU.kit.params.Ultra[5]+roU.kit.ranks[6][1]);
  near(zones.at(-1),1+roU.kit.params.Ultra[5]);
  near(roU.energy,(roU.kit.params.Talent[1]+roU.kit.ranks[2][1])*9);
});

test('知更鸟协奏期间免疫控制类负面状态，E4 施放终结技解除全队控制并提高 50% 效果抵抗',()=>{
  const run=withUlt=>{
    const ro=actor(1309,{eidolon:4}),ar=actor(1015);ar.panel.speed=1;
    const c=config([ro,ar],60);const e=c.units.at(-1);e.panel.speed=1000;
    e.actions.basic={name:'控制',type:'Normal',terms:[{scaling:'atk',multiplier:0}],hitEnergy:10,targetId:ro.id,effects:[{type:'buff',key:'atkPct',value:-.1,duration:1,tickAt:'end',debuff:true,control:'freeze'}]};
    ro.energy=ro.energyMax;ro.policy.autoUltimate=withUlt;ro.panel.speed=100;
    const b=createBattle(c);
    b.units[1].buffs.push({id:'ally-control',name:'冻结',key:'atkPct',value:-.05,debuff:true,control:'freeze',remaining:2,tickOwner:b.units[1].id,tickAt:'end',appliedTurn:b.units[1].turns});
    for(let i=0;i<4;i++)stepBattle(b);
    return b;
  };
  const on=run(true),off=run(false);
  assert.ok(on.log.some(e=>e.type==='resist'&&e.actor===on.units[0].id));
  assert.ok(!on.units[0].buffs.some(e=>e.control),'协奏中仍被施加控制');
  near(combatPanel(on.units[0]).controlRes,1);
  assert.ok(!on.units[1].buffs.some(e=>e.id==='ally-control'),'E4 未解除队友控制');
  near(on.units[1].buffs.find(e=>e.source===on.units[0].id&&e.key==='effectRes').value,on.units[0].kit.ranks[4][0]);
  assert.ok(off.units[0].buffs.some(e=>e.control),'未处于协奏时不应免疫控制');
  assert.ok(off.units[1].buffs.some(e=>e.id==='ally-control'),'E0 不应解除控制');
});

test('协奏倒计时固定 90 速结算：退出协奏、清空协奏增益、解除无法行动并立即行动',()=>{
  const ro=actor(1309);ro.energy=ro.energyMax;ro.policy.autoUltimate=true;ro.panel.speed=1;
  const ar=actor(1015);ar.panel.speed=1;ar.policy.basicOnly=true;
  const c=config([ro,ar],250);const b=createBattle(c),roU=b.units[0];
  const atkBuff=()=>b.units[1].buffs.find(e=>e.source===roU.id&&e.key==='atk');
  for(let i=0;i<40&&!b.log.some(e=>e.type==='summon_turn');i++)stepBattle(b);
  const st=b.log.find(e=>e.type==='summon_turn'&&e.summon===roU.id+':concerto');
  assert.ok(st,'协奏倒计时未结算');
  near(st.av,10000/roU.kit.params.Ultra[1]);
  assert.equal(roU.cannotAct,false);assert.ok(!roU.buffs.some(e=>e.tag==='robinConcerto'));
  assert.equal(roU.policy.autoUltimate,true);assert.equal(roU.distance,0);
  assert.equal(b.summons.find(s=>s.kind==='countdown').active,false);
  assert.ok(!atkBuff(),'协奏增益未随倒计时结束清除');
  const av=b.av;stepBattle(b);
  const act=b.log.filter(e=>e.type==='action'&&e.actor===roU.id).at(-1);
  near(act.av,av);
});

test('阮•梅 / 知更鸟 E0～E6 与既有四人体系交叉混编均可完成严格战斗，无未支持缺口',()=>{
  const team=(ids,eidolon)=>{
    const units=ids.map(id=>actor(id,{eidolon:id===1303||id===1309?eidolon:0}));
    const ar=units.find(u=>u.characterId===1015);
    units.forEach((u,i)=>{u.panel.speed=u.characterId===1015?100:1;u.policy.autoUltimate=[1303,1309,1306,1412].includes(u.characterId);
      if(u.characterId!==1015)u.policy.allyTargetId=ar.id;});
    const c=config(units,220,3);c.requiredAllies=4;return c;};
  for(let eidolon=0;eidolon<=6;eidolon++){
    for(const ids of [[1303,1306,1015,1412],[1309,1306,1015,1412],[1303,1309,1306,1015],[1303,1309,1412,1015]]){
      const c=team(ids,eidolon);assert.deepEqual(validateBattle(c),[]);
      const r=simulateBattle(c);
      assert.ok(r.damage>0,ids+' 无伤害');assert.deepEqual(r.unsupported,[]);assert.ok(r.log.length<12000);
    }
  }
});

test('阮•梅 / 知更鸟专属光锥已接入严格合同；真正未登记的光锥仍然拒绝',()=>{
  for(const [id,lc] of [[1303,23019],[1309,23026]])for(let superimpose=1;superimpose<=5;superimpose++){
    const u=actor(id,{lightconeId:lc,superimpose});
    assert.equal(u.gear.cone?.id,lc);
    assert.deepEqual(u.unsupported,[]);
    assert.deepEqual(validateKitActor(u),[]);
    const c={...config([u]),units:[u,enemy()]};
    assert.deepEqual(validateBattle(c),[]);
  }
  // 未登记的光锥（同为同谐命途）仍然被拒绝，不能通过清空 unsupported 绕过。
  for(const id of [1303,1309]){
    const u=actor(id,{lightconeId:21032});
    assert.equal(u.gear.cone,null);
    assert.deepEqual(u.unsupported,['光锥「'+ctx.lcById.get(21032).name+'」的战斗被动未实现']);
    assert.ok(validateBattle({...config([u]),units:[u,enemy()]}).some(s=>s.includes('战斗被动未实现')));
  }
});

test('未登记角色仍然拒绝，新角色模块不会放宽严格模式准入',()=>{
  const u=actor(1015);delete u.kit;u.unsupported=[];
  assert.ok(validateBattle({...config([u]),units:[u,enemy()]}).some(s=>s.includes('可执行角色机制')));
});

test('持续时间与计时者：阮•梅结界 2 回合、弦外音 3 回合，都在她自己的回合开始时递减',()=>{
  const rm=actor(1303);rm.energy=rm.energyMax;rm.policy.autoUltimate=true;rm.panel.speed=200;
  const ar=actor(1015);ar.panel.speed=1;
  const r=simulateBattle(config([rm,ar],400));
  const rmId=rm.id,turns=r.log.filter(e=>e.type==='turn_start'&&e.actor===rmId),acts=r.log.filter(e=>e.type==='action'&&e.actor===rmId);
  const buff=(e,tag)=>e.frame.units.find(u=>u.id===rmId).buffs.find(b=>b.tag===tag);
  // 以「行动时效果仍存在」为准统计实际覆盖回合：结界在终结技插入（第一回合开始前）展开，
  // 因此覆盖她接下来 2 个回合；弦外音在她施放战技的当回合起覆盖 3 个回合。
  const activeOn=(tag,n)=>{const list=acts.filter(a=>a.av>=turns[0].av);return list.slice(0,n).every(a=>buff(a,tag))&&!buff(list[n],tag);};
  assert.ok(turns.length>=5,'阮•梅回合数不足');
  assert.ok(activeOn('ruanMeiField',rm.kit.params.Ultra[1]),'结界未覆盖 2 个回合');
  const seq=turns.map(e=>buff(e,'ruanMeiString')?.remaining),d=rm.kit.params.BPSkill[2],start=seq.indexOf(d);
  assert.ok(start>=0);
  assert.deepEqual(seq.slice(start,start+3),[d,d-1,d-2]);
  // 第 d 个回合开始时到期，她在同一回合立刻补一次弦外音。
  assert.equal(acts.find(a=>a.av===turns[start+2].av).key,'skill');
  assert.equal(buff(turns[start+3],'ruanMeiString').remaining,d);
  assert.equal(turns[start].frame.units.find(u=>u.id===ar.id).buffs.find(b=>b.tag==='ruanMeiString').tickOwner,rmId);
});

test('持续时间与计时者：知更鸟战技增伤 3 回合，增益计时者为知更鸟而不是受益者',()=>{
  const ro=actor(1309),ar=actor(1015);ro.panel.speed=200;ar.panel.speed=1;
  const r=simulateBattle(config([ro,ar],400));
  const turns=r.log.filter(e=>e.type==='turn_start'&&e.actor===ro.id),acts=r.log.filter(e=>e.type==='action'&&e.actor===ro.id);
  const seq=turns.map(e=>e.frame.units.find(u=>u.id===ar.id).buffs.find(b=>b.tag==='robinSkill')?.remaining),d=ro.kit.params.BPSkill[1],start=seq.indexOf(d);
  assert.ok(start>=0,'战技增益未生效');
  assert.deepEqual(seq.slice(start,start+3),[d,d-1,d-2]);
  assert.equal(acts.find(a=>a.av===turns[start+2].av).key,'skill');
  assert.equal(seq[start+3],d);
  assert.equal(turns[start].frame.units.find(u=>u.id===ar.id).buffs.find(b=>b.tag==='robinSkill').tickOwner,ro.id);
});

test('协奏攻击力加成是施放瞬间快照：知更鸟攻击力中途变化不会改写已挂上的增益',()=>{
  const ro=actor(1309);ro.energy=ro.energyMax;ro.policy.autoUltimate=true;ro.panel.speed=1;
  const ar=actor(1015);ar.panel.speed=1;
  const b=createBattle(config([ro,ar],1));stepBattle(b);
  const roU=b.units[0],arU=b.units[1],p=roU.kit.params,expect=1000*p.Ultra[0]+p.Ultra[2];
  near(arU.buffs.find(e=>e.source===roU.id&&e.key==='atk').value,expect);
  near(combatPanel(arU).atk,arU.panel.atk+expect);
  roU.panel.atk=2000;
  near(arU.buffs.find(e=>e.source===roU.id&&e.key==='atk').value,expect);
  near(combatPanel(arU).atk,arU.panel.atk+expect);
});

test('协奏倒计时进入行动序列，逐事件快照可回放且两次模拟完全一致',()=>{
  const build=()=>{const ro=actor(1309);ro.energy=ro.energyMax;ro.policy.autoUltimate=true;ro.panel.speed=1;
    const ar=actor(1015);ar.panel.speed=1;ar.policy.basicOnly=true;return config([ro,ar],250);};
  const a=simulateBattle(build()),b=simulateBattle(build());
  assert.deepEqual(a,b);
  const roId=a.config.units[0].id;
  const st=a.log.find(e=>e.type==='summon_turn'&&e.summon===roId+':concerto');
  assert.ok(st.frame.summons.some(s=>s.kind==='countdown'&&s.speed===90));
  assert.ok(st.frame.normalOrder.some(o=>o.id===st.summon),'倒计时未出现在行动序列');
  const saved=JSON.parse(JSON.stringify(a)),v=replayAt(saved,saved.log.length-1);
  near(v.contributions.reduce((n,u)=>n+u.damage,0),a.damage);
});

test('动作分段与能量消耗取自固定数据源：阮•梅普攻 1 段、知更鸟普攻 3 段，终结技无伤害',()=>{
  const rm=actor(1303),ro=actor(1309);
  assert.deepEqual(rm.actions.basic.hitShares,[1]);
  assert.deepEqual(ro.actions.basic.hitShares,[.33,.33,.34]);
  assert.equal(rm.actions.ultimate.energyCost,130);assert.equal(ro.actions.ultimate.energyCost,160);
  assert.equal(rm.actions.skill.target,'self');assert.equal(ro.actions.skill.target,'self');
  assert.equal(rm.actions.ultimate.target,'allies');assert.equal(ro.actions.ultimate.target,'allies');
  assert.deepEqual(rm.actions.ultimate.terms,[]);assert.deepEqual(ro.actions.ultimate.terms,[]);
});

console.log(`DeepSeek batch01 checks: ${passed} passed, ${failed} failed.`);if(failed)process.exitCode=1;
