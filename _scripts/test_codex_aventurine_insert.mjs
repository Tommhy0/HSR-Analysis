// 砂金•戏浪（1513）热意阈值插入 / All-in 时序 + 绯英（1505）狐狸回能累计。
// 来源：Avatar_AventurineW_00_Ability.json 的 InsertElationSkillSave /
//       UpGradeElationSkill_OnceMark / OnListenBeforeElationTimeStart；150504 desc。
import assert from 'node:assert/strict';
import {ctx,dummy} from './codex_test_helpers.mjs';
import {newBattleBuild,buildBattleActor} from '../simulator/builds.mjs';
import {createBattle,stepBattle,combatPanel} from '../simulator/engine.mjs';
import {BREAK_BASE} from '../simulator/game-data.mjs';
import {ROSTER_DATA} from '../simulator/roster-data.mjs';

function battleFor(id,eidolon=0){
  const owner=buildBattleActor(ctx,{...newBattleBuild(),characterId:id,eidolon,relicAuto:false});
  owner.policy={...owner.policy,autoUltimate:false,basicOnly:true};
  const mate=dummy('mate'),foe=dummy('foe','enemy');
  foe.panel={...foe.panel,hp:1e9,speed:1};foe.hp=1e9;
  const b=createBattle({strict:false,maxAV:5,sp:3,maxSP:9,seed:17,critMode:'noncrit',units:[owner,mate,foe]});
  return {b,u:b.units.find(x=>x.characterId===id),mate:b.units.find(x=>x.id==='mate'),foe:b.units.find(x=>x.id==='foe')};
}
function triggerHeat(b,u,mate,foe,heat){
  u.resources['热意']=heat;
  b.activeAction={sequence:900};
  b.rules.afterHit(b,mate,foe,{spCost:0,type:'Normal'},'direct',{});
}
const near=(a,b,m=1e-6,msg)=>{if(typeof m!=='number'){msg=m;m=1e-6;}assert.ok(Math.abs(a-b)<m,`${a} != ${b}${msg?' ('+msg+')':''}`);};
let passed=0,failed=0;const test=(name,fn)=>{try{fn();passed++;console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+'\n'+e.stack);}};

test('1513 热意阈值：只插入砂金自身的【举杯】，不创建全队阿哈回合',()=>{
  const {b,u,mate,foe}=battleFor(1513);
  triggerHeat(b,u,mate,foe,u.kit.params.Talent[0]-1);
  const inserts=b.queue.filter(q=>q.actor===u.id&&q.key==='elationHeat');
  assert.equal(inserts.length,1,'应排队一次自身插入动作');
  assert.ok(!b.queue.some(q=>q.kind==='aha'),'不应把其他欢愉角色排入阿哈回合');
  assert.ok(!b.ahaCount,'不应伪造阿哈时刻');
});

test('1513 插入的【举杯】固定计入 #5=20 笑点，且不被 AllIn 标记提前升级',()=>{
  const {b,u}=battleFor(1513);
  u.resources['AllIn']=1;
  u.resources['热意']=5;
  const a=b.rules.prepare(b,u,'elationHeat','extra',u.actions.elationHeat);
  assert.equal(a.name,'举杯！敬炽烈一夏','插入动作应保持 151320');
  assert.equal(a.punchlineOverride,u.kit.params.Talent[4],'应固定计入 20 点');
  assert.ok(!a.allIn);
});

test('1513 下一次阿哈欢愉技才吃 All-in，并在施放后消耗标记',()=>{
  const {b,u,foe}=battleFor(1513);
  u.resources['AllIn']=1;u.resources['热意']=7;
  const a=b.rules.prepare(b,u,'elation','aha',u.actions.elation);
  assert.equal(a.name,'All in！敬炽烈一夏','阿哈时刻应升级为 151321');
  assert.equal(a.allIn,true);
  b.rules.before(b,u,'elation','aha',a,[foe]);
  assert.equal(u.resources['AllIn'],0,'All-in 标记在阿哈施放后消耗');
});

test('1513 只有 All-in 消耗热意，基础【举杯】不消耗',()=>{
  const base=battleFor(1513);
  base.u.resources['热意']=7;
  const a=base.b.rules.prepare(base.b,base.u,'elation','aha',base.u.actions.elation);
  base.b.rules.before(base.b,base.u,'elation','aha',a,[base.foe]);
  assert.equal(base.u.resources['热意'],7,'基础举杯不应消耗热意');

  const allIn=battleFor(1513);
  allIn.u.resources['热意']=7;allIn.u.resources['AllIn']=1;
  const a2=allIn.b.rules.prepare(allIn.b,allIn.u,'elation','aha',allIn.u.actions.elation);
  allIn.b.rules.before(allIn.b,allIn.u,'elation','aha',a2,[allIn.foe]);
  assert.equal(allIn.u.resources['热意'],0,'All-in 应消耗全部热意');
});

test('1513 插入动作按固定 20 笑点结算真实欢愉伤害',()=>{
  const {b,u}=battleFor(1513);
  triggerHeat(b,u,b.units.find(x=>x.id==='mate'),b.units.find(x=>x.id==='foe'),u.kit.params.Talent[0]-1);
  // 排队动作在 stepBattle 的 flush 阶段执行；maxAV 很短时返回值可能为 false，不影响已排队的插入动作。
  stepBattle(b);
  const hit=b.log.find(e=>e.type==='damage'&&e.actor===u.id&&e.kind==='elation');
  assert.ok(hit,'插入的举杯应产生真实欢愉伤害');
  const mult=ROSTER_DATA[1513].skills['151320'].params['10'].param_list[0];
  const punchline=1+5*20/(20+240);
  const expected=BREAK_BASE[u.level]*2*(1+(combatPanel(u).elation??0))*punchline*mult;
  near(hit.formula.find(f=>f.zone==='base').value,expected,'固定20笑点应进入欢愉基式');
});

test('1505 狐狸老师回能计入下一次 240 累计',()=>{
  const {b,u,mate,foe}=battleFor(1505);
  const p=u.kit.params;
  u.energy=0;u.resources['能量快照']=0;u.resources['好活当赏快照']=u.resources['好活当赏']??0;
  u.resources['狐狸累计']=p.Talent[2]-10;
  u.energy=10;
  b.rules.afterDamage(b,u,foe,'direct');
  near(u.resources['狐狸累计'],p.Talent[3],'越过门槛后余量 0 + 回能 10');
  assert.equal(b.queue.filter(q=>q.actor===u.id&&q.key==='followup').length,1,'应触发一次狐狸老师');
  // 再累积到门槛：10 + 230 = 240，应再次触发，证明回能没有被快照吞掉。
  u.resources['能量快照']=u.energy;
  u.energy=Math.min(u.energyMax,u.energy+p.Talent[2]-p.Talent[3]);
  b.rules.afterDamage(b,u,foe,'direct');
  assert.equal(b.queue.filter(q=>q.actor===u.id&&q.key==='followup').length,2,'回能后的 10 点应参与下一次累计');
  near(u.resources['狐狸累计'],p.Talent[3],'第二次触发后同样只保留回能余量');
  void mate;
});

console.log(`Aventurine insert / Evanescia refund: ${passed} passed, ${failed} failed.`);
if(failed)process.exitCode=1;
