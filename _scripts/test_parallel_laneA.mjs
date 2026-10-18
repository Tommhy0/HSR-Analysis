// laneA 专用机制测试（1407 遐蝶 / 1413 长夜月 / 1415 昔涟 / 1512 知更鸟•晴歌）。
// 证据：4.6 `_data_cache/hsr_core.json` 的技能/行迹/星魂文本，以及
// `_data_cache/strict_research/Avatar_{Castorice,Evernight,Cyrene,RobinS}_00_Ability.json`
// 的任务顺序与 Modifier 动态值。所有期望值从 kit 参数或 Ability 任务读取，不写死倍率。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ctx,actor,dummy,force} from './codex_test_helpers.mjs';
import {buildBattleActor,newBattleBuild} from '../simulator/builds.mjs';
import {createBattle,combatPanel,stepBattle} from '../simulator/engine.mjs';

// 4.6 忆灵技参数（hsr_core.json，等级 10）。
const CORE=JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url)));
const svp=(charId,skillId)=>CORE.characters.find(c=>c.id===charId).memosprite.skills[String(skillId)].level['10'].param_list;

const PANEL=()=>({hp:10000,atk:1000,def:1000,speed:100,critRate:0,critDmg:1,energyRegen:1,effectHit:0,effectRes:0,breakEffect:0,baseStats:{hp:1000,atk:1000,def:1000},elemDmg:{}});
const mk=(id,extra={})=>{
  const a=buildBattleActor(ctx,{...newBattleBuild(),characterId:id,relicAuto:false,panel:PANEL(),...extra});
  a.energy=0;a.policy={...a.policy,autoUltimate:false,basicOnly:true};return a;
};
function enemy(id='foe',hp=1e9){const f=dummy(id,'enemy');f.panel={...f.panel,hp};f.hp=hp;return f;}
const battle=(units,config={})=>createBattle({strict:false,maxAV:500,sp:2,maxSP:9,seed:17,critMode:'noncrit',units,...config});
const unit=(b,id)=>b.units.find(x=>x.characterId===id);
const memOf=(b,owner)=>b.units.find(t=>t.memospriteOwner===owner.id);
const near=(a,c,m=1e-6,msg='')=>assert.ok(Math.abs(a-c)<m,`${a} != ${c} ${msg}`);

let passed=0,failed=0;
const test=(name,fn)=>{try{fn();passed++;console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+'\n'+e.stack);}};

// ── 1407 遐蝶 ────────────────────────────────────────────────────────────────
test('1407 焰息阶数跨动作保留、重新召唤清零，并叠满西风的驻足 6 层',()=>{
  const o=mk(1407,{technique:true});
  const b=battle([o,dummy('mate'),enemy()]);
  const u=unit(b,1407),d=memOf(b,u),q=svp(1407,1140702),tw=u.kit.trace[3];
  const base=combatPanel(u).hp;
  b.activeAction={actor:d.id,key:'basic',sequence:1};
  const seen=[];
  for(let r=0;r<6;r++){
    b.rules.repeatStart(b,d,'basic','normal',d.actions.basic,r);
    seen.push(d.actions.basic.terms[0].flatAdd/base);
    const w=d.buffs.find(x=>x.tag==='castoriceWestWind');
    near(w.value,tw[0]*(r+1),1e-9,'西风的驻足应逐层 +'+tw[0]*100+'%');
  }
  near(seen[0],q[1],1e-9,'第一次焰息应为 0.336');
  near(seen[1],q[2],1e-9,'第二次焰息应为 0.392');
  near(seen[2],q[3],1e-9,'第三次焰息应为 0.476');
  near(seen[5],q[3],1e-9,'达到 0.476 后不再提高');
  assert.equal(d.resources['焰息阶数'],2,'阶数应保存在死龙身上');
  // 新动作仍从 0.476 起算（消失前不会降低）。
  b.rules.repeatStart(b,d,'basic','normal',d.actions.basic,0);
  near(d.actions.basic.terms[0].flatAdd/base,q[3],1e-9,'跨动作的倍率不应回落到 0.336');
  // 行迹「持续至本回合结束」。
  b.rules.onTurnEnd(b,d);
  assert.ok(!d.buffs.some(x=>x.tag==='castoriceWestWind'),'回合结束应清除西风的驻足');
  // 正常玩法中死龙在场时新蕊会转入死龙生命，重新召唤前必须先让死龙消失。
  d.hp=0;
  b.rules.death(b,b.units.find(x=>x.side==='enemy'),d);
  assert.equal(d.active,false,'死龙应已消失');
  assert.equal(d.resources['晦翼已结算'],1,'消失时应结算晦翼');
  // 重新召唤：1140702 只保证「死龙消失前」不降低。
  u.resources['新蕊']=34000;
  b.rules.before(b,u,'summonDragon','normal',u.actions.summonDragon,[u],[]);
  assert.equal(d.resources['焰息阶数'],0,'重新召唤应回到基础阶数');
  assert.ok(!('晦翼已结算' in d.resources),'重新召唤必须清除晦翼结算标记');
  assert.equal(d.resources['剩余回合'],u.kit.params.Ultra[1],'重新召唤应重置倒计时');
});

test('1407 死龙消失后重新召唤：西风的驻足与结算状态不得跨生命残留',()=>{
  const o=mk(1407,{technique:true});
  const b=battle([o,dummy('mate'),enemy()]);
  const u=unit(b,1407),d=memOf(b,u);
  b.activeAction={actor:d.id,key:'basic',sequence:1};
  for(let r=0;r<3;r++)b.rules.repeatStart(b,d,'basic','normal',d.actions.basic,r);
  assert.equal(d.buffs.find(x=>x.tag==='castoriceWestWind')?.stacks,3,'应有 3 层西风的驻足');
  const firstId=d.id;
  d.hp=0;
  b.rules.death(b,b.units.find(x=>x.side==='enemy'),d);
  assert.equal(d.active,false,'死龙应离场');
  u.resources['新蕊']=34000;
  b.rules.before(b,u,'summonDragon','normal',u.actions.summonDragon,[u],[]);
  assert.equal(d.id,firstId,'引擎应复用同一忆灵对象');
  assert.ok(!d.buffs.some(x=>x.tag==='castoriceWestWind'),'西风的驻足不得跨生命残留');
  assert.equal(d.resources['焰息阶数'],0,'焰息阶数应重置');
  assert.ok(!('晦翼已结算' in d.resources),'晦翼结算标记应清除');
  // 新生命的 3 回合倒计时必须能正常触发消失并结算晦翼。
  const n=b.log.length;
  d.resources['剩余回合']=1;
  b.rules.onTurnEnd(b,d);
  assert.equal(d.active,false,'到期应消失');
  assert.ok(b.log.slice(n).some(e=>e.type==='mechanic'&&e.name==='灼掠幽墟的晦翼'),'到期消失也应结算晦翼');
});

test('1407 死龙被伤害击倒时仍触发晦翼并离场（1140706「消失时」）',()=>{
  const o=mk(1407,{technique:true});
  const b=battle([o,dummy('mate'),enemy()]);
  const u=unit(b,1407),d=memOf(b,u);
  assert.ok(d&&d.active);
  const n=b.log.length;
  d.hp=0;
  b.rules.death(b,b.units.find(x=>x.side==='enemy'),d);
  const wing=b.log.slice(n).filter(e=>e.type==='damage'&&e.actor===d.id);
  assert.equal(wing.length,svp(1407,1140706)[1],'晦翼应按 1140706 的弹射次数结算');
  assert.ok(b.log.slice(n).some(e=>e.type==='mechanic'&&e.name==='灼掠幽墟的晦翼'));
  assert.equal(d.active,false,'死龙应离场');
});

test('1407 天赋增伤对生命消耗触发并扩散至死龙',()=>{
  const o=mk(1407,{technique:true});
  const b=battle([o,dummy('mate'),enemy()]);
  const u=unit(b,1407),d=memOf(b,u);
  const T=u.kit.params.Talent;
  const before=(u.resources['新蕊']??0),dhp0=d.hp;
  const wound0=u.buffs.find(x=>x.tag==='castoriceWound')?.stacks??0;
  b.rules.hpChanged(b,u,'consume',100,u);
  const wound=u.buffs.find(x=>x.tag==='castoriceWound');
  assert.ok(wound,'生命消耗应触发天赋增伤');
  near(wound.stacks,Math.min(T[2],wound0+1),1e-9,'生命消耗应叠 1 层天赋增伤');
  near(wound.value,T[1]*wound.stacks,1e-9);
  // 死龙在场时，损失的生命值转化为死龙生命值（不是新蕊）。
  assert.ok(d.hp>dhp0||(u.resources['新蕊']??0)>before,'生命消耗应转化为死龙生命值或新蕊');
  const out=b.rules.modifiers(b,d,b.units.find(x=>x.side==='enemy'),{name:'燎尽黯泽的焰息',type:'Talent'},'direct');
  assert.ok((out.dmgBoost??0)>=wound.value-1e-9,'死龙应继承天赋的造成伤害提高');
});

// ── 1413 长夜月 ──────────────────────────────────────────────────────────────
test('1413 战技的 10% 与行迹 5% 生命消耗都触发天赋（各 +2 忆质）',()=>{
  const o=mk(1413);
  const b=battle([o,dummy('mate'),enemy()]);
  const u=unit(b,1413),p=u.kit.params,T=p.Talent;
  const start=u.resources['忆质']??0,hp0=u.hp;
  b.rules.before(b,u,'skill','normal',u.actions.skill,[u],[]);
  assert.ok(u.hp<hp0,'战技应消耗生命');
  near(u.resources['忆质'],start+p.BPSkill[2]+2*T[0]+(u.kit.trace[2]?u.kit.trace[2][0]:0),1e-9,
    '两次生命消耗 + 战技忆质 + 行迹 point07');
});

test('1413 忆质 ≥16 解除并免疫全部控制类负面状态',()=>{
  const o=mk(1413);
  const b=battle([o,dummy('mate'),enemy()]);
  const u=unit(b,1413),T=u.kit.params.Talent;
  u.buffs.push({id:'probe-stun',name:'眩晕',type:'buff',key:'marker',control:'stun',value:0,remaining:2,tickOwner:u.id});
  u.dots.push({id:'probe-freeze',name:'冻结',type:'dot',key:'dot',control:'freeze',value:0,remaining:2,terms:[]});
  u.resources['忆质']=T[5]-1;
  b.rules.hpChanged(b,u,'consume',1,u); // 天赋 +2 忆质 → 跨过 16
  assert.ok(!u.buffs.some(e=>e.control),'控制类 buff 应被解除');
  assert.ok(!u.dots.some(e=>e.control),'控制类 DoT 应被解除');
  const out={};b.rules.panel(b,u,out);
  assert.equal(out.controlRes,1,'≥16 时应免疫控制');
});

test('1413 E1 覆盖所有我方忆灵，且不要求「长夜」在场',()=>{
  const o=mk(1413,{eidolon:1});
  const b=battle([o,dummy('mate'),enemy()]);
  const u=unit(b,1413),night=memOf(b,u),foe=b.units.find(x=>x.side==='enemy');
  // 把长夜改挂到另一名队友名下：它仍是真实战斗单位（有 buffs/dots），但不再是长夜月的忆灵，
  // 因此 mem(b,u) 为空，正好验证 E1 不依赖「长夜」在场。
  night.memospriteOwner=b.units.find(x=>x.id==='mate').id;
  const out=b.rules.modifiers(b,night,foe,{name:'忆灵技',type:'Talent'},'direct');
  const p=u.kit.ranks[1];
  near(out.dmgBoost,p[3]-1,1e-9,'1 名敌人时 E1 应为 150%（+50%）');
});

test('1413 迷梦的 1141306 加速在长夜月下个回合开始移除',()=>{
  const o=mk(1413);
  const b=battle([o,dummy('mate'),enemy()]);
  const u=unit(b,1413),night=memOf(b,u),T=u.kit.params.Talent;
  u.resources['忆质']=T[5];
  b.rules.onTurnStart(b,night);
  assert.equal(night.resources['施放迷梦'],1,'忆质≥16 且未受控时应施放迷梦');
  b.rules.after(b,night,'basic','normal',night.actions.basic,[enemy()],[]);
  const haste=u.buffs.find(x=>x.tag==='night-haste');
  assert.ok(haste,'迷梦消失应给长夜月加速');
  near(haste.value,0.1+Math.min(40,T[5])*0.01,1e-9);
  b.rules.onTurnStart(b,u);
  assert.ok(!u.buffs.some(x=>x.tag==='night-haste'),'下个长夜月回合开始应移除加速');
});

// ── 1415 昔涟 ────────────────────────────────────────────────────────────────
function cyreneBattle(extraIds=[]){
  const o=mk(1415);
  const units=[o,...extraIds.map(id=>mk(id)),dummy('mate'),enemy()];
  const b=battle(units);
  const u=unit(b,1415);
  u.policy.allyTargetId=u.id; // 首次终结的诗篇砸在自己身上，避免触发队友终结技
  u.energy=u.energyMax;
  force(b,u,'ultimate');
  const s=memOf(b,u);
  assert.ok(s&&s.active,'德谬歌应已召唤');
  return {b,u,s};
}

test('1415 献予「理性」之诗：+1 战技点、立即行动、下一次普攻获得真知并在下个回合开始移除',()=>{
  const {b,u,s}=cyreneBattle([1405]);
  const nx=unit(b,1405),p2=svp(1415,1141518);
  const sp0=b.sp,d0=nx.distance;
  b.rules.after(b,s,'poem','extra',s.actions.poem,[nx],[]);
  assert.equal(b.sp,Math.min(b.maxSP,sp0+1),'应恢复 1 个战技点');
  assert.equal(nx.distance,0,'那刻夏应立即行动');
  assert.equal(nx.resources['Cyrene理性诗篇待真知'],1);
  nx.turns=1;
  b.rules.before(b,nx,'basic','normal',nx.actions.basic,[enemy()],[]);
  const truth=nx.buffs.filter(x=>x.tag===('cyreneTruth:'+u.id));
  assert.ok(truth.some(x=>x.key==='atkPct'&&Math.abs(x.value-p2[2])<1e-9),'智识角色攻击力 +'+p2[2]*100+'%');
  assert.ok(truth.some(x=>x.key==='dmgBoost'&&x.abilityType==='BPSkill'&&Math.abs(x.value-p2[1])<1e-9),'战技伤害 +'+p2[1]*100+'%');
  nx.turns=2;
  b.rules.onTurnStart(b,nx);
  assert.ok(!nx.buffs.some(x=>x.tag===('cyreneTruth:'+u.id)),'下个那刻夏回合开始应移除真知');
  void d0;
});

test('1415 献予「天空」之诗：回能 33.6、舞曲 +2 层、治疗转化 +100.8%、战技消耗 1 层',()=>{
  const {b,u,s}=cyreneBattle([1409]);
  const hy=unit(b,1409),p=svp(1415,1141519);
  const e0=hy.energy;
  b.rules.after(b,s,'poem','extra',s.actions.poem,[hy],[]);
  near(hy.energy,e0+p[1],1e-9,'施放时应恢复 33.6 能');
  const sky=()=>hy.buffs.find(x=>String(x.tag??'').startsWith('cyreneSkyPoem:'));
  assert.equal(sky().stacks,2,'施放时应获得 2 层');
  // 德谬歌施放忆灵技 → 再 +2 层。
  b.rules.after(b,s,'basic','normal',s.actions.basic,[],[]);
  assert.equal(sky().stacks,4,'舞曲应再给 2 层');
  // 治疗 1000 → 计入小伊卡的数值 1000×(1+100.8%)。
  const cum0=hy.resources['累计治疗']??0;
  hy.resources['治疗扫描']=b.log.length;
  b.log.push({index:b.log.length,type:'heal',actor:hy.id,target:hy.id,amount:1000});
  b.rules.after(b,hy,'basic','normal',hy.actions.basic,[],[]);
  near((hy.resources['累计治疗']??0)-cum0,1000*(1+p[0]),1e-9,'天空诗篇应按 100.8% 追加计入');
  b.rules.after(b,hy,'skill','normal',hy.actions.skill,[],[]);
  assert.equal(sky().stacks,3,'战技后消耗 1 层');
});

test('1415 献予「门径」之诗：缇宝无视 16.8% 防御',()=>{
  const {b,s}=cyreneBattle([1403]);
  const tb=unit(b,1403),p=svp(1415,1141515);
  b.rules.after(b,s,'poem','extra',s.actions.poem,[tb],[]);
  const buff=tb.buffs.find(x=>String(x.tag??'').startsWith('cyreneGatePoem:'));
  assert.ok(buff,'应施加门径诗篇');
  near(buff.value,p[1],1e-9,'无视防御应为 16.8%');
});

test('1413 战技暴伤持续时间在长夜月回合开始递减（不是忆灵回合）',()=>{
  const o=mk(1413);
  const b=battle([o,dummy('mate'),enemy()]);
  const u=unit(b,1413),night=memOf(b,u);
  force(b,u,'skill');
  const cd=()=>night.buffs.find(x=>x.id===u.id+':skill-cd');
  assert.equal(cd()?.remaining,2);
  force(b,u,'basic');
  assert.equal(cd()?.remaining,1,'第一个长夜月回合开始应减为 1');
  force(b,u,'basic');
  assert.ok(!cd(),'第二个长夜月回合开始应到期');
});

test('1415 献予「律法」之诗：军功持有者暴伤 +42% 且随新的持有者迁移',()=>{
  const {b,s}=cyreneBattle([1412]);
  const cy=unit(b,1412),p=svp(1415,1141523);
  const tag='cyreneLawPoem:'+s.memospriteOwner,law=u=>u.buffs.find(e=>e.tag===tag);
  // 1412 的终结技先指定一名【军功】持有者；诗篇应挂在该持有者身上。
  const holder=b.units.find(x=>x.id===cy.resources['军功目标']);
  assert.ok(holder,'1412 终结技后应已有【军功】持有者');
  b.rules.after(b,s,'poem','extra',s.actions.poem,[cy],[]);
  assert.ok(law(holder),'军功持有者应获得律法诗篇暴伤');
  near(law(holder).value,p[0],1e-9,'暴伤应为 42%');
  // 1412 战技重新指定持有者：光环跟随迁移，旧持有者不得保留 +42%。
  const mate2={...dummy('mate2'),buffs:[],dots:[],resources:{},shields:[]};Object.defineProperty(mate2,'battle',{value:b});b.units.push(mate2);
  b.rules.after(b,cy,'skill','normal',cy.actions.skill,[mate2],[]);
  assert.equal(cy.resources['军功目标'],mate2.id);
  assert.ok(!law(holder),'旧持有者不应保留律法诗篇暴伤');
  assert.ok(law(mate2),'新持有者应获得律法诗篇暴伤');
  near(law(mate2).value,p[0],1e-9,'迁移后暴伤应保持 42%');
  assert.equal(mate2.buffs.filter(e=>e.tag===tag).length,1,'同一光环不应重复叠层');
});

// ── 1512 知更鸟•晴歌 ─────────────────────────────────────────────────────────
test('1512 专武 23063：生命上限、入场提前 30%、新声给全队 20% 速度、终结后 +1 战技点',()=>{
  const o=mk(1512,{lightconeId:23063});
  assert.deepEqual(o.unsupported,[],'23063 不应再被列为未实现');
  assert.equal(o.gear.cone.id,23063);
  const b=battle([o,dummy('mate'),enemy()]);
  const u=unit(b,1512),mate=b.units.find(x=>x.id==='mate'),c=u.gear.cone.p;
  assert.ok(u.hp>u.panel.baseStats.hp,'生命上限应受 +30% 影响');
  assert.equal(u.distance,10000*(1-c[1]),'入场应行动提前 30%');
  assert.ok(u.buffs.some(x=>x.tag==='cone23063Voice'));
  near(combatPanel(mate).speed,mate.panel.speed*(1+c[2]),1e-9,'新声应给全队 +20% 速度');
  u.energy=u.energyMax;
  force(b,u,'ultimate');
  assert.ok(b.log.some(e=>e.type==='sp'&&e.reason==='你将起身歌唱'&&e.amount===1),'终结后应恢复 1 战技点');
});

test('1512 E6：Fever 内可存 280 能，退出时钳回 140；再次进入 Fever 重新启用倒计时',()=>{
  const o=mk(1512,{eidolon:6,technique:true});
  const b=battle([o,dummy('mate'),enemy()]);
  const u=unit(b,1512),f=enemy('f2');
  u.resources['气氛值']=12;u.resources['乐手人数']=1;
  b.rules.after(b,u,'basic','normal',u.actions.basic,[f],[f]);
  assert.ok(u.buffs.some(x=>x.tag==='fever'));
  const cd=b.summons.find(x=>x.id===u.id+':fever');
  assert.equal(cd.active,true);
  assert.equal(u.energyMax,280,'E6 在 Fever 内应使能量上限翻倍');
  u.energy=280;
  u.resources['气氛值']=0;
  b.rules.summonTurn(b,u,cd);
  assert.ok(!u.buffs.some(x=>x.tag==='fever'),'气氛值归零应退出 Fever');
  assert.equal(u.energyMax,140,'退出后恢复原上限');
  assert.equal(u.energy,140,'储存的第二次终结应被钳回 1 次');
  assert.equal(cd.active,false,'倒计时应失活');
  u.resources['气氛值']=12;u.resources['乐手人数']=2;
  b.rules.after(b,u,'basic','normal',u.actions.basic,[f],[f]);
  assert.ok(u.buffs.some(x=>x.tag==='fever'),'应能再次进入 Fever');
  assert.equal(cd.active,true,'再次进入 Fever 应重新启用倒计时');
  assert.equal(cd.distance,10000,'倒计时应回到满行动条');
});

test('1512 秘技只在第 1 波生效（Ability SkillMazeInLevel 的 ByCompareWaveCount=1）',()=>{
  const o=mk(1512,{technique:true});
  const w2=enemy('wave2');w2.wave=2;
  const b=createBattle({strict:false,maxAV:1,sp:2,maxSP:9,seed:17,critMode:'noncrit',
    units:[o,dummy('mate'),enemy('wave1'),w2]});
  const u=unit(b,1512);
  const maze=()=>b.log.filter(e=>e.type==='buff'&&e.name==='我们自成旋律').length;
  const scent0=u.resources['气氛值'];
  assert.equal(maze(),2,'第 1 波应为两名友方结算秘技');
  for(const e of b.units.filter(x=>x.side==='enemy'&&(x.wave??1)===1)){e.hp=0;e.active=false;}
  stepBattle(b);
  assert.equal(b.wave,2);
  assert.equal(maze(),2,'换波不应重复施加秘技增伤');
  assert.equal(u.resources['气氛值'],scent0,'换波不应重复获得秘技气氛值');
});

test('1413 1141303 +70% 只计一次；point06 暴击与 point08 含本体',()=>{
  const o=mk(1413);const b=battle([o,dummy('mate'),enemy()]);
  const u=unit(b,1413),s=memOf(b,u),foe=b.units.find(x=>x.side==='enemy');
  assert.ok(s,'长夜应已生成');
  near(b.rules.modifiers(b,s,foe,{type:'Normal'},'direct').dmgBoost,.7,1e-6,'1141303 不应重复叠加');
  near(combatPanel(u).critRate,PANEL().critRate+u.kit.trace[1][0],1e-6,'point06 本体 +35% 暴击');
  near(combatPanel(s).critRate,PANEL().critRate+u.kit.trace[1][0],1e-6,'point06 长夜 +35% 暴击');
  s.buffs=s.buffs.filter(e=>e.id!==u.id+':trace8-cd');
  // point08 的战技暴伤在 before 结算。
  b.rules.before(b,u,'skill','normal',u.actions.skill,[foe]);
  const buff=s.buffs.find(e=>e.id===u.id+':trace8-cd');
  assert.ok(buff,'point08 应在单人记忆队伍也生效（含本体）');
  near(buff.value,u.kit.trace[3][0],1e-6,'单人档应取 point08 第 1 档');
});

test('1407 普通战技 140702 不消耗战技点',()=>{
  assert.equal(mk(1407).actions.skill.spCost,0);
});

console.log(`laneA checks: ${passed} passed, ${failed} failed.`);
if(failed)process.exitCode=1;
