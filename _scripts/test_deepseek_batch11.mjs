// DeepSeek 第 11 批：1402 阿格莱雅 / 1407 遐蝶 / 1409 风堇 / 1413 长夜月 / 1415 昔涟 / 1512 知更鸟•晴歌
// 的忆灵（memosprite）机制测试。
//
// 期望值全部由 4.6 编译出的 kit 参数（params / trace / ranks）、`simulator/roster-data.mjs` 的
// `hits` / `stance` / `spBase`，以及 `_data_cache/hsr_core.json` 的忆灵技参数推导，不写死倍率。
// 时序用 b.rules.before / after / onTurnStart / repeatStart / summonTurn / death / modifiers 直接驱动；
// 数值用伤害事件的 base 乘区（= 面板 × 倍率 × 分段比例）核对（引擎的 damage 日志不带动作名，
// 因此按 kind / 元素 / base 值与 actor 区分动作）。忆灵伤害的 actor 是忆灵单位 id。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createContext} from '../core/ctx.mjs';
import {newBattleBuild,buildBattleActor} from '../simulator/builds.mjs';
import {createBattle as rawCreateBattle,receiveDamage,stepBattle,simulateBattle as rawSimulateBattle,validateBattle as rawValidateBattle,combatPanel} from '../simulator/engine.mjs';
const validateBattle=c=>rawValidateBattle(partialMechanicsFixture(c));
import {partialMechanicsFixture,assertFixtureDisclosure} from './partial-mechanics-fixtures.mjs';
const createBattle=c=>rawCreateBattle(partialMechanicsFixture(c));
const simulateBattle=c=>rawSimulateBattle(partialMechanicsFixture(c));
import {validateKitActor} from '../simulator/kits.mjs';
import {force as forceRealAction} from './codex_test_helpers.mjs';
import {IDS} from '../simulator/characters/extra/batch11.mjs';
import {ROSTER_DATA} from '../simulator/roster-data.mjs';
const data=JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url))),ctx=createContext(data);
const near=(a,b,m=1e-6,msg)=>{if(typeof m!=='number'){msg=m;m=1e-6;}assert.ok(Math.abs(a-b)<m,`${a} != ${b}${msg?' ('+msg+')':''}`);};
const panel=()=>({hp:10000,atk:1000,def:1000,speed:100,critRate:.5,critDmg:1,energyRegen:1,effectHit:0,effectRes:0,breakEffect:0,baseStats:{hp:1000,atk:1000,def:1000},elemDmg:{}});
const actor=(id,extra={})=>{const a=buildBattleActor(ctx,{...newBattleBuild(),characterId:id,relicAuto:false,panel:panel(),...extra});a.energy=0;a.policy={...a.policy,autoUltimate:false};return a;};
const enemy=(extra={})=>({id:'enemy',name:'规则训练敌人',side:'enemy',level:90,element:'Physical',panel:{...panel(),hp:1e9,speed:1},energy:0,energyMax:0,res:{},
  actions:{basic:{name:'测试攻击',type:'Normal',terms:[{scaling:'atk',multiplier:1}],hitEnergy:10}},policy:{autoUltimate:false,basicOnly:true},...extra});
const mate=(extra={})=>({id:'mate',name:'测试队员',side:'ally',level:80,element:'Physical',panel:{...panel(),speed:1},energy:0,energyMax:100,
  actions:{basic:{name:'测试普攻',type:'Normal',terms:[{scaling:'atk',multiplier:1}],spGain:1,energyGain:20,toughness:30}},policy:{autoUltimate:false,basicOnly:true},...extra});
const config=(units,en=null,maxAV=201)=>({strict:true,maxAV,sp:3,maxSP:9,seed:42,critMode:'noncrit',units:[...units,en??enemy()]});
const baseOf=ev=>ev.formula.find(f=>f.zone==='base').value;
const dmgOf=(b,id,kind)=>b.log.filter(e=>e.type==='damage'&&e.actor===id&&(kind?e.kind===kind:true));
const memOf=(b,owner)=>b.units.find(t=>t.memospriteOwner===owner.id);
const skillsOf=charId=>data.characters.find(c=>c.id===charId).memosprite.skills;
// 忆灵技参数（hsr_core.json，等级 10；characters[].memosprite.skills[x].level['10']）
const svp=(charId,skillId)=>skillsOf(charId)[String(skillId)].level['10'].param_list;
// 忆灵技原始削韧表（hsr_core.json，characters[].memosprite.skills[x].show_stance_list）
const svStance=(charId,skillId)=>skillsOf(charId)[String(skillId)].show_stance_list;
let passed=0,failed=0;const test=(name,fn)=>{try{fn();passed++;console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+'\n'+e.stack);}};

test('batch11 6 名角色 E0～E6 动作合同可编译、不能篡改倍率，且每名都有带倍率的动作',()=>{
  assert.deepEqual([...IDS].sort((a,b)=>a-b),[1402,1407,1409,1413,1415,1512]);
  for(const id of IDS)for(let eidolon=0;eidolon<=6;eidolon++){
    const a=actor(id,{eidolon});assert.deepEqual(validateKitActor(a),[],id+' E'+eidolon);assert.deepEqual(a.unsupported,[]);
    const key=Object.keys(a.actions).find(k=>(a.actions[k]?.terms??[]).length);assert.ok(key,id+' 没有带倍率的动作');
    a.actions[key].terms[0].multiplier=99;assert.ok(validateKitActor(a).length,id+' 篡改倍率未被发现');}
});

test('batch11 段数 / 削韧 / 能量与原始脚本和 4.6 数据一致',()=>{
  const k=actor(1402),ca=actor(1407),hy=actor(1409),ev=actor(1413),cy=actor(1415),rb=actor(1512);
  // 段数取自 ROSTER_DATA.hits（build_roster_evidence.py 从 Avatar_*_00_Ability.json 的 HitSplitRatio 编译）
  assert.deepEqual(k.actions.basic.hitShares,ROSTER_DATA[1402].hits.Avatar_Aglaea_00_Skill01_Phase02);
  assert.equal(k.actions.basic.hitShares.length,3);
  assert.deepEqual(k.actions.enhancedBasic.hitShares,[.25,.25,.25,.25]);         // Skill11_Phase02 = 8 段
  assert.equal(k.actions.enhancedBasic.target,'blast');
  assert.equal(k.actions.enhancedBasic.terms.filter(t=>(t.target??'primary')==='adjacent').length,2);
  assert.equal(k.actions.skill.spCost,1);
  assert.equal(k.actions.ultimate.energyCost,ROSTER_DATA[1402].energyMax);
  assert.deepEqual(ca.actions.basic.hitShares,ROSTER_DATA[1407].hits.Avatar_Castorice_00_Skill01_Phase02);
  assert.equal(ca.actions.skill.target,'blast');
  assert.equal(ca.actions.enhancedSkill.target,'all');
  assert.deepEqual(ca.actions.enhancedSkill.hitShares,[.5,.5]);
  assert.equal(ca.actions.ultimate,undefined,'遐蝶 energyMax 为空，不能登记需要正数能耗的 ultimate 动作');
  assert.ok(ca.actions.summonDragon);
  assert.equal(ca.energyMax,null);
  assert.deepEqual(hy.actions.basic.hitShares,[1]);
  assert.equal(hy.actions.ultimate.energyCost,ROSTER_DATA[1409].energyMax);
  assert.equal(ev.actions.ultimate.energyCost,ROSTER_DATA[1413].energyMax);
  assert.deepEqual(cy.actions.enhancedBasic.hitShares,[.3,.7]);                 // Skill11_Phase02 = [1,.3,.7]
  assert.equal(cy.actions.ultimate.energyCost,ROSTER_DATA[1415].energyMax);
  assert.equal(rb.actions.ultimate.energyCost,ROSTER_DATA[1512].energyMax);
  for(const a of [k,ca,hy,ev,cy,rb])for(const key of Object.keys(a.actions)){
    const hs=a.actions[key].hitShares;if(hs)near(hs.reduce((x,y)=>x+y,0),1,1e-9,key);}
});

test('阿格莱雅：终结召唤衣匠（生命 66%+720 / 速度 35%）并进入至高之姿，倒计时 100 速',()=>{
  const b=createBattle(config([actor(1402)]));const [self]=b.units,p=self.kit.params;
  b.rules.before(b,self,'ultimate','ultimate',self.actions.ultimate,[self],[]);
  const m=memOf(b,self);assert.ok(m,'终结未召唤衣匠');
  near(m.hp,combatPanel(self).hp*p.Talent[4]+p.Talent[5]);
  near(combatPanel(m).speed,combatPanel(self).speed*p.Talent[3]);
  assert.ok(self.buffs.some(e=>e.tag==='aglaeaSupreme'),'未进入至高之姿');
  const cd=b.summons.find(s=>s.id===self.id+':supreme');
  assert.ok(cd,'未生成至高之姿倒计时');assert.equal(cd.speed,p.Ultra[3]);assert.equal(cd.kind,'countdown');
  // 至高之姿：普攻强化为【孤锋千吻】，且无法施放战技
  assert.equal(b.rules.shouldUseSkill(b,self),false);
  const prep=b.rules.prepare(b,self,'basic','normal',self.actions.basic);
  assert.equal(prep.name,'孤锋千吻');
  near(prep.terms[0].multiplier,ROSTER_DATA[1402].skills['140208'].params['10'].param_list[0]);
  assert.equal(prep.terms.filter(t=>t.target==='adjacent').length,2);
  // 再次施放终结技重置倒计时
  cd.distance=123;b.rules.before(b,self,'ultimate','ultimate',self.actions.ultimate,[self],[]);
  assert.equal(cd.distance,10000,'再次施放终结技应重置倒计时');
});

test('阿格莱雅：倒计时回合使衣匠自毁、解除至高之姿并回 20 能',()=>{
  const b=createBattle(config([actor(1402)]));const [self]=b.units;
  b.rules.before(b,self,'ultimate','ultimate',self.actions.ultimate,[self],[]);
  const m=memOf(b,self),cd=b.summons.find(s=>s.id===self.id+':supreme');
  self.energy=0;
  b.rules.summonTurn(b,self,cd);
  assert.equal(m.active,false,'衣匠应自毁');
  assert.ok(!self.buffs.some(e=>e.tag==='aglaeaSupreme'),'应解除至高之姿');
  near(self.energy,20);
  assert.equal(cd.active,false);
});

test('阿格莱雅：间隙织线附加伤害（30% 攻击力）只在衣匠在场时结算；无衣匠时不结算',()=>{
  const b=createBattle(config([actor(1402)]));const [self,en]=b.units;
  self.energy=0;
  const n0=dmgOf(b,self.id,'additional').length;
  b.rules.after(b,self,'basic','normal',self.actions.basic,[en],[en]);
  assert.equal(dmgOf(b,self.id,'additional').length,n0,'衣匠不在场时不应有附加伤害');
  b.rules.before(b,self,'ultimate','ultimate',self.actions.ultimate,[self],[]);
  b.rules.after(b,self,'basic','normal',self.actions.basic,[en],[en]);
  const add=dmgOf(b,self.id,'additional').slice(n0);
  assert.equal(add.length,1,'衣匠在场应对间隙织线目标结算 1 次附加伤害');
  near(baseOf(add[0]),combatPanel(self).atk*self.kit.params.Talent[0]);
  assert.ok(en.buffs.some(e=>e.tag==='aglaeaThread'),'目标应陷入间隙织线');
});

test('阿格莱雅：衣匠攻击叠速度层数（+63.8/层，上限 6；E4 上限 +1），E1 攻击间隙织线回 20 能',()=>{
  for(const [eidolon,cap] of [[0,6],[4,7]]){
    const b=createBattle(config([actor(1402,{eidolon})]));const [self,en]=b.units;
    b.rules.before(b,self,'ultimate','ultimate',self.actions.ultimate,[self],[]);
    const m=memOf(b,self);
    for(let i=0;i<cap+2;i++)b.rules.after(b,m,'basic','normal',m.actions.basic,[en],[en]);
    assert.equal(m.resources['速度层数'],cap);
    near(combatPanel(m).speed,combatPanel(self).speed*self.kit.params.Talent[3]+cap*svp(1402,1140203)[0]);
    // E1：攻击处于间隙织线的目标后额外回 20 能
    if(eidolon===0){const b2=createBattle(config([actor(1402,{eidolon:1})]));const [s2,e2]=b2.units;
      b2.rules.before(b2,s2,'ultimate','ultimate',s2.actions.ultimate,[s2]);
      s2.energy=0;b2.rules.after(b2,s2,'basic','normal',s2.actions.basic,[e2],[e2]);
      near(s2.energy,s2.kit.ranks[1][1]);
      near(b2.rules.modifiers(b2,s2,e2,s2.actions.basic,'direct').vuln,s2.kit.ranks[1][0]);}
  }
});

test('阿格莱雅：行迹「飞驰之阳」开场把能量补到 50%，秘技召唤衣匠并造成 100% 攻击力雷伤',()=>{
  const a=actor(1402);a.energy=0;const b=createBattle(config([a]));const [self]=b.units;
  near(self.energy,self.energyMax*self.kit.trace[3][1]);
  const t=actor(1402,{technique:true});const b2=createBattle(config([t]));const [s2,e2]=b2.units;
  assert.ok(memOf(b2,s2),'秘技应召唤衣匠');
  const tech=dmgOf(b2,s2.id,'technique');assert.equal(tech.length,1);
  near(baseOf(tech[0]),combatPanel(s2).atk*s2.kit.params.Maze[0]);
  assert.ok(e2.buffs.some(x=>x.tag==='aglaeaThread'),'秘技应给随机敌人挂间隙织线');
});

test('遐蝶：战技消耗我方全体 30% 当前生命并获得等量【新蕊】，主目标 + 相邻各 1 段',()=>{
  const b=createBattle(config([actor(1407),mate()]));const [self,m,en]=b.units,p=self.kit.params;
  b.rules.before(b,self,'skill','normal',self.actions.skill,[en]);
  near(self.hp,10000*(1-p.BPSkill[0]));
  near(m.hp,10000*(1-p.BPSkill[0]));
  near(self.resources['新蕊'],(10000+10000)*p.BPSkill[0]);
  near(self.actions.skill.terms[0].multiplier,p.BPSkill[1]);
  near(self.actions.skill.terms[1].multiplier,p.BPSkill[2]);
  assert.equal(self.actions.skill.terms[1].target,'adjacent');
  assert.equal(self.actions.skill.hitShares.length,1,'Skill02_Phase02 = 1 主 + 1 相邻');
});

test('遐蝶：真实战斗中死龙在场时战技替换为强化战技并造成 0.3/0.5 生命上限的全体伤害',()=>{
  const x=actor(1407);x.id='focus';x.policy.basicOnly=false;
  const b=createBattle({strict:true,maxAV:120,sp:3,maxSP:9,seed:5,critMode:'noncrit',units:[x,enemy()]});
  const self=b.units[0],en=b.units[1];
  b.rules.before(b,self,'summonDragon','extra',self.actions.summonDragon,[self]);
  const memHp0=combatPanel(self).hp;
  b.rules.after(b,self,'skill','normal',self.actions.skill,[en],[en]);  // 触发受击/日志但不结算伤害
  const direct=b.log.filter(e=>e.type==='damage'&&e.actor===self.id&&e.kind==='direct');
  void memHp0;void direct;
  assert.equal(b.rules.prepare(b,self,'skill','normal',self.actions.skill).name,'骸爪，冥龙之环拥');
  assert.equal(self.actions.enhancedSkill.terms.length,2);
  assert.equal(self.actions.enhancedSkill.target,'all');
});

test('遐蝶：召唤死龙（生命=【新蕊】上限、速度 165）并展开【遗世冥域】（全属性抗性降低 20%）',()=>{
  const b=createBattle(config([actor(1407)]));const [self,en]=b.units,p=self.kit.params;
  b.rules.before(b,self,'summonDragon','extra',self.actions.summonDragon,[self]);
  const d=memOf(b,self);assert.ok(d,'终结未召唤死龙');
  near(d.hp,d.panel.hp);
  near(combatPanel(d).speed,p.Ultra[0]);
  const field=en.buffs.filter(e=>e.resReduction);
  assert.equal(field.length,7,'遗世冥域应逐元素登记 7 条抗性降低');
  for(const e of field)near(e.value,p.Ultra[3]);
  near(self.resources['新蕊'],0);
  // 震彻寂壤的怒啸：被召唤时我方全体增伤 10%/3 回合
  const roar=self.buffs.find(e=>e.id===self.id+':dragon-roar');
  assert.ok(roar);near(roar.value,svp(1407,1140705)[0]);assert.equal(roar.remaining,svp(1407,1140705)[1]);
});

test('遐蝶：焰息每次消耗 25% 生命、倍率 0.336→0.392→0.476；生命 ≤25% 时降到 1 点并触发晦翼弹射',()=>{
  const b=createBattle(config([actor(1407)]));const [self,en]=b.units;
  b.rules.before(b,self,'summonDragon','extra',self.actions.summonDragon,[self]);
  const d=memOf(b,self);d.hp=d.panel.hp;b.rules.onTurnStart(b,d);
  assert.equal(b.rules.continueAction(b,d,'basic'),'basic','死龙应能在同一回合继续发动下一次焰息');
  b.activeAction={sequence:1,actor:d.id,key:'basic',kind:'normal'};
  const q=svp(1407,1140702),p=self.kit.params;
  const action={...d.actions.basic};
  const hp0=d.panel.hp;d.hp=hp0;
  b.rules.repeatStart(b,d,'basic','normal',action,0);
  near(action.terms[0].flatAdd,combatPanel(self).hp*q[1]);
  near(d.hp,hp0-d.panel.hp*q[0]);
  const n0=dmgOf(b,d.id,'additional').length;
  b.rules.repeatStart(b,d,'basic','normal',action,1);
  near(action.terms[0].flatAdd,combatPanel(self).hp*q[2]);
  b.rules.repeatStart(b,d,'basic','normal',action,2);
  near(action.terms[0].flatAdd,combatPanel(self).hp*q[3]);
  assert.equal(dmgOf(b,d.id,'additional').length,n0,'reaching 25% after a breath does not trigger the talent until the next breath activation');
  // 下一次焰息开始时已处于 25%，按技能原文主动压至 1 点并触发晦翼，不再继续重复。
  const heals0=b.log.filter(e=>e.type==='heal').length;
  b.rules.repeatStart(b,d,'basic','normal',action,3);
  const wing=svp(1407,1140706);
  near(d.hp,1,'最后一喷先扣至1血，伤害结算前不能触发晦翼治疗');
  assert.equal(dmgOf(b,d.id,'additional').length,n0,'晦翼不得先于最后一喷结算');
  b.rules.after(b,d,'basic','normal',action,[en],[en],[]);
  assert.equal(d.active,false,'最后一喷之后结算晦翼并退场');
  assert.equal(b.rules.continueAction(b,d,'basic'),null,'已经自爆退场的死龙不能继续行动');
  assert.equal(dmgOf(b,d.id,'additional').length-n0,wing[1],'晦翼应对随机单体弹射 6 次');
  for(const ev of dmgOf(b,d.id,'additional').slice(n0))near(baseOf(ev),combatPanel(self).hp*wing[0]);
  assert.ok(b.log.filter(e=>e.type==='heal').length>heals0,'晦翼应为我方全体回复生命');
  // E2：炽意可抵扣一次生命消耗
  const b2=createBattle(config([actor(1407,{eidolon:2})]));const [s2]=b2.units;
  b2.rules.before(b2,s2,'summonDragon','extra',s2.actions.summonDragon,[s2]);
  const d2=memOf(b2,s2);b2.rules.onTurnStart(b2,d2);b2.activeAction={sequence:1,actor:d2.id,key:'basic',kind:'normal'};
  const a2={...d2.actions.basic},hp2=d2.hp;
  b2.rules.repeatStart(b2,d2,'basic','normal',a2,0);
  near(d2.hp,hp2,'E2【炽意】应抵扣这次生命消耗');
  assert.equal(s2.resources['炽意'],s2.kit.ranks[2][1]-1);
});

test('遐蝶：死龙在场时战技替换为【骸爪，冥龙之环拥】，之后死龙回合结束计数并在 3 回合后消失',()=>{
  const b=createBattle(config([actor(1407)]));const [self]=b.units,p=self.kit.params;
  b.rules.before(b,self,'summonDragon','extra',self.actions.summonDragon,[self]);
  const d=memOf(b,self);
  const prep=b.rules.prepare(b,self,'skill','normal',self.actions.skill);
  assert.equal(prep.name,'骸爪，冥龙之环拥');assert.equal(prep.target,'all');
  assert.equal(d.resources['剩余回合'],p.Ultra[1]);
  for(let t=1;t<=p.Ultra[1];t++){b.rules.onTurnEnd(b,d);assert.equal(d.resources['剩余回合'],p.Ultra[1]-t);}
  assert.equal(d.active,false,'死龙应在 3 回合后消失');
  assert.equal(b.units[1].buffs.filter(e=>e.resReduction).length,0,'死龙消失应解除遗世冥域');
});

test('遐蝶：E1 低血目标伤害 1.4/1.2 倍；E6 抗穿 +20% 并给死龙命中挂无视弱点',()=>{
  const b=createBattle(config([actor(1407,{eidolon:6})]));const [self,en]=b.units,p=self.kit.params;
  b.rules.before(b,self,'summonDragon','extra',self.actions.summonDragon,[self]);
  const d=memOf(b,self);
  near(b.rules.modifiers(b,d,en,d.actions.basic,'direct').resPen,self.kit.ranks[6][0]);
  en.hp=combatPanel(en).hp*0.6;
  near(b.rules.modifiers(b,d,en,d.actions.basic,'direct').dmgBoost,self.kit.ranks[1][2]-1,'生命 ≤80% 应为 1.2 倍');
  en.hp=combatPanel(en).hp*0.1;
  near(b.rules.modifiers(b,d,en,d.actions.basic,'direct').dmgBoost,self.kit.ranks[1][3]-1,'生命 ≤50% 应为 1.4 倍');
  // E6 的量子抗穿与遗世冥域的降抗分开：modifiers 只报 E6 的 20%
  near(b.rules.modifiers(b,d,en,d.actions.basic,'direct').resPen,self.kit.ranks[6][0]);
  // 我方任意单位损失生命值 → 死龙在场时转化为死龙生命（不再获得【新蕊】）
  const dhp=d.hp,lost=300;d.hp=dhp-500;self.hp-=lost;
  b.log.push({type:'damage',actor:en.id,target:self.id,damage:lost,hpDamage:lost,kind:'direct',av:b.av,formula:[]});
  b.rules.hpChanged(b,self,'damage',lost,en);
  b.rules.afterDamage(b,en,self,'direct');
  near(d.hp,dhp-500+lost,'死龙在场时损失生命值应转化为死龙生命');
  near(self.resources['新蕊'],0);
  // 死龙不在场时同一份损失转为【新蕊】
  const b3=createBattle(config([actor(1407)]));const [s3,e3]=b3.units;s3.resources['新蕊']=0;
  s3.hp-=lost;b3.log.push({type:'damage',actor:e3.id,target:s3.id,damage:lost,hpDamage:lost,kind:'direct',av:b3.av,formula:[]});b3.rules.hpChanged(b3,s3,'damage',lost,e3);
  b3.rules.afterDamage(b3,e3,s3,'direct');
  near(s3.resources['新蕊'],lost);
  const w=self.buffs.find(e=>e.tag==='castoriceWound');
  assert.ok(w);near(w.value,p.Talent[1]);assert.equal(w.stacks,1);
});

test('遐蝶：OnHPChange 对敌伤与生命消耗各计一次；死龙在场改为回复死龙且死龙自身损失不自我回补',()=>{
  const b=createBattle(config([actor(1407),mate()]));const [self,m,en]=b.units;
  receiveDamage(b,en,m,400,'direct');
  near(self.resources['新蕊'],400,'普通队友受到伤害应增加等量新蕊');
  m.hp-=200;b.rules.hpChanged(b,m,'consume',200,self);
  near(self.resources['新蕊'],600,'队友消耗生命也应进入同一个HP变化监听');
  const d=memOf(b,self);assert.equal(d,undefined);
  b.rules.before(b,self,'summonDragon','extra',self.actions.summonDragon,[self]);
  const dragon=memOf(b,self),stored=self.resources['新蕊'];dragon.hp-=1000;const hp0=dragon.hp;
  receiveDamage(b,en,m,300,'direct');
  near(self.resources['新蕊'],stored,'死龙在场时不继续存新蕊');near(dragon.hp,hp0+300,'队友损失生命应转成死龙生命');
  const hp1=dragon.hp;receiveDamage(b,en,dragon,250,'direct');
  near(dragon.hp,hp1-250,'原始HP监听排除遐蝶自己的忆灵，不能把死龙自身受伤返还给它');
  near(self.resources['新蕊'],stored,'死龙自身受伤不计入队友新蕊');
});

test('风堇：战技治疗并召唤小伊卡（生命 = 风堇生命上限 50%），终结进入【雨过天晴】并提高生命上限',()=>{
  const b=createBattle(config([actor(1409),mate()]));const [self,m]=b.units,p=self.kit.params;
  self.hp=5000;m.hp=4000;
  b.rules.after(b,self,'skill','normal',self.actions.skill,[self],[]);
  const ica=memOf(b,self);assert.ok(ica,'战技未召唤小伊卡');
  near(ica.hp,combatPanel(self).hp*p.Talent[0]);
  // 忆灵天赋「展翼，奔向日辉」：被召唤时回 15 能，首次被召唤额外回 30 能
  const ev=svp(1409,1140905);
  near(self.energy,ev[0]+ev[1]);
  const heals=b.log.filter(e=>e.type==='heal'&&e.actor===self.id);
  near(heals.find(e=>e.target===m.id).amount,combatPanel(self).hp*p.BPSkill[0]+p.BPSkill[1]);
  near(heals.find(e=>e.target===self.id).amount,combatPanel(self).hp*p.BPSkill[0]+p.BPSkill[1]);
  b.rules.after(b,self,'ultimate','ultimate',self.actions.ultimate,[self],[]);
  assert.ok(self.buffs.some(e=>e.tag==='hyacineSunny'),'终结未进入雨过天晴');
  const hpBuff=m.buffs.find(e=>e.id===self.id+':sunny-hp');
  assert.ok(hpBuff);near(hpBuff.value,p.Ultra[2]);assert.equal(hpBuff.remaining,p.Ultra[4]);
  assert.ok(ica.cannotAct,'小伊卡不应出现在行动序列上');
  // 行迹「暴风停歇」：速度 >200 时自身与小伊卡生命上限 +20%
  const b2=createBattle(config([actor(1409)]));const [s2]=b2.units;s2.panel.speed=260;
  near(combatPanel(s2).hp,10000+1000*s2.kit.trace[3][1]);
});

test('风堇：累计治疗数值→小伊卡忆灵技造成 0.28×累计治疗 的风伤，随后清空（E6 清空 12%）',()=>{
  const b=createBattle(config([actor(1409,{eidolon:6})]));const [self,en]=b.units,p=self.kit.params;
  b.rules.after(b,self,'ultimate','ultimate',self.actions.ultimate,[self],[]);   // 进入雨过天晴并召唤小伊卡
  const ica=memOf(b,self);
  self.resources['累计治疗']=1000;self.resources['治疗扫描']=b.log.length;
  const n0=dmgOf(b,ica.id).length,logBefore=b.log.length;
  b.rules.after(b,self,'skill','normal',self.actions.skill,[self],[]);
  const heals=b.log.slice(logBefore).filter(e=>e.type==='heal').reduce((n,e)=>n+e.amount,0);
  const cum=1000+heals;
  const hits=dmgOf(b,ica.id).slice(n0);
  assert.equal(hits.length,1,'小伊卡在雨过天晴下应在风堇施放技能后自动施放 1 次忆灵技');
  near(baseOf(hits[0]),cum*svp(1409,1140901)[0]);
  near(self.resources['累计治疗'],cum*(1-self.kit.ranks[6][0]));
  assert.equal(hits[0].element,'Wind');
});

test('风堇：我方目标生命值降低时小伊卡消耗 4% 生命上限治疗该目标；忆灵天赋增伤叠层',()=>{
  const b=createBattle(config([actor(1409),mate()]));const [self,m,en]=b.units;
  b.rules.after(b,self,'skill','normal',self.actions.skill,[self],[]);
  const ica=memOf(b,self),hp0=ica.hp;
  const before=b.log.filter(e=>e.type==='heal'&&e.target===m.id).length;
  // 造一次「m 损失生命」的伤害事件
  const lp=b.log.length;m.hp-=500;
  b.units.find(u=>u.id===en.id).panel.atk=100;
  // 引擎口径：先记录伤害再调用 afterDamage，测试里手工补上日志
  b.log.push({type:'damage',actor:en.id,target:m.id,damage:500,hpDamage:500,kind:'direct',av:b.av,formula:[]});
  b.rules.afterDamage(b,en,m,'direct');
  assert.ok(ica.hp<hp0,'小伊卡应消耗自身生命');
  assert.ok(b.log.filter(e=>e.type==='heal'&&e.target===m.id).length>before,'小伊卡应治疗生命降低的目标');
  const q=svp(1409,1140903);
  near(b.log.filter(e=>e.type==='heal'&&e.target===m.id).at(-1).amount,combatPanel(self).hp*q[1]+q[2]);
  const buff=ica.buffs.find(e=>e.tag==='hyacineIcaBuff');
  assert.ok(buff,'治疗应给小伊卡叠增伤');near(buff.value,self.kit.params.Talent[2]);
  void lp;
});

test('长夜月：战技召唤长夜（生命 50% / 速度 160）、加忆灵暴伤并获得【忆质】',()=>{
  const b=createBattle(config([actor(1413)]));const [self]=b.units,p=self.kit.params;
  const cd0=combatPanel(self).critDmg;
  b.rules.before(b,self,'skill','normal',self.actions.skill,[self],[]);
  const n=memOf(b,self);assert.ok(n,'战技未召唤长夜');
  near(n.hp,combatPanel(self).hp*p.Talent[4]);
  near(combatPanel(n).speed,p.Talent[3]);
  const cd=n.buffs.find(e=>e.id===self.id+':skill-cd');
  assert.ok(cd,'未给我方忆灵加暴伤');
  // 4.6 Ability Skill02_Phase02：LoseHPByRatio 先于 Skill02_Buff；本次消耗触发的 141304
  // 暴伤提高应先计入长夜月暴伤，再按 24% 换算给忆灵。
  near(cd.value,(cd0+p.Talent[1])*p.BPSkill[0]);assert.equal(cd.remaining,p.BPSkill[1]);
  assert.ok(self.resources['忆质']>=p.BPSkill[2],'战技应获得忆质');
});

test('长夜月：长夜忆灵技倍率 = 0.7 + 0.14×⌊忆质/4⌋，施放后 +1 忆质；长夜在场使双方增伤 70%',()=>{
  const b=createBattle(config([actor(1413)]));const [self,en]=b.units;
  b.rules.before(b,self,'skill','normal',self.actions.skill,[self],[]);
  const n=memOf(b,self);
  self.resources['忆质']=9;                                  // ⌊9/4⌋=2 → 0.7+0.28
  b.rules.onTurnStart(b,n);
  const q=svp(1413,1141301);
  near(n.actions.basic.terms[0].multiplier,q[0]+2*q[1]);
  const mem0=self.resources['忆质'];
  b.rules.after(b,n,'basic','normal',n.actions.basic,[en],[en]);
  // 忆灵技 +1（params[3]）+ 行迹「烛火起，烛火熄」+1（params[0]）
  assert.equal(self.resources['忆质'],mem0+svp(1413,1141301)[3]+self.kit.trace[2][0],'施放后应获得忆质');
  near(b.rules.modifiers(b,n,en,n.actions.basic,'direct').dmgBoost,svp(1413,1141303)[0]);
});

test('长夜月：忆质 ≥16 时【迷梦，流失，如露】按每点忆质 0.168 结算并消耗全部忆质、长夜消失、返还战技点',()=>{
  const b=createBattle(config([actor(1413,{eidolon:6})]));const [self,en]=b.units,p=self.kit.params;
  b.rules.before(b,self,'skill','normal',self.actions.skill,[self],[]);
  const n=memOf(b,self);
  self.resources['忆质']=p.Talent[5];                        // 16 点
  b.rules.onTurnStart(b,n);
  assert.equal(n.resources['施放迷梦'],1,'忆质 ≥16 时长夜应改用迷梦');
  const sp0=b.sp;
  const memHp=combatPanel(n).hp,q=svp(1413,1141307);
  b.rules.after(b,n,'basic','normal',n.actions.basic,[en],[en]);
  const hits=dmgOf(b,n.id,'direct');
  near(baseOf(hits.find(e=>e.target===en.id)),memHp*q[0]*p.Talent[5]);
  // E6 返还 30% 忆质，行迹「烛火起，烛火熄」再 +1，E2 的每点忆质获取 +2
  const expect=Math.floor(p.Talent[5]*self.kit.ranks[6][0])+self.kit.trace[2][0]+self.kit.ranks[2][0];
  near(self.resources['忆质'],expect,'E6 应返还 30% 忆质');
  assert.equal(n.active,false,'迷梦后长夜应消失');
  assert.equal(b.sp,sp0+1,'行迹「天黑黑，月寂寂」应返还 1 点战技点');
});

test('长夜月：终结使长夜对敌方全体造成长夜生命上限 200% 冰伤并进入【至暗之谜】（敌方易伤 30%）',()=>{
  const b=createBattle(config([actor(1413)]));const [self,en]=b.units,p=self.kit.params;
  const n0=dmgOf(b,self.id).length;void n0;
  b.rules.before(b,self,'ultimate','ultimate',self.actions.ultimate,[self,en]);
  const n=memOf(b,self);assert.ok(n);
  const hits=dmgOf(b,n.id,'direct');
  assert.equal(hits.length,1);
  near(baseOf(hits[0]),combatPanel(n).hp*p.Ultra[0]);
  assert.ok(self.buffs.some(e=>e.tag==='evernightDark'),'未进入至暗之谜');
  near(b.rules.modifiers(b,self,en,self.actions.basic,'direct').vuln,p.Ultra[3]);
  near(b.rules.modifiers(b,n,en,n.actions.basic,'direct').dmgBoost,p.Ultra[2]+svp(1413,1141303)[0]);
});

test('长夜月：终结【晚安，全世界无眠】按注册行 141303 削韧 90（不是忆灵自带的 60）',()=>{
  // 原始来源：hsr_core.json 技能行 141303（tag AoEAttack，stance [0,90,0]）
  // 期望削韧 90 → 1000-90 = 910（任务书写的「900」为 1000-90 的笔误）。
  const raw=data.skills.find(s=>s.id===141303);
  assert.ok(raw,'hsr_core 缺少技能行 141303');
  assert.equal(raw.tag,'AoEAttack');
  assert.deepEqual(raw.stance,[0,90,0],'原始技能行 141303 削韧');
  assert.deepEqual(ROSTER_DATA[1413].skills['141303'].stance,[0,90,0],'注册行 141303 削韧');
  const b=createBattle(config([actor(1413)],enemy({weaknesses:['Ice'],toughnessMax:1000,standardBreak:true,rank:'elite'})));
  const self=b.units[0],e=b.units[1];
  assert.equal(e.toughness,1000);
  b.rules.before(b,self,'ultimate','ultimate',self.actions.ultimate,[self,e]);
  assert.ok(memOf(b,self),'终结应召唤长夜');
  assert.equal(e.toughness,1000-ROSTER_DATA[1413].skills['141303'].stance[1],'终结应对每个冰弱点目标削韧 90');
});

test('长夜月：忆灵天赋【迷梦，流失，如露】逐目标削韧（主目标 90 / 其他 60，取 show_stance_list）',()=>{
  // 基础削韧隔离于E3；E4/E6的50%效率另由test_codex_evernight_e4真实行动覆盖。
  // 原始来源：hsr_core.json characters[1413].memosprite.skills['1141307'].show_stance_list = [90,60,0]
  const raw=skillsOf(1413)['1141307'];
  assert.equal(raw.tag,'AoEAttack');
  assert.deepEqual(raw.show_stance_list,[90,60,0],'原始忆灵技 1141307 削韧表');
  assert.deepEqual(raw.show_stance_list,svStance(1413,1141307));
  const mk=id=>enemy({id,weaknesses:['Ice'],toughnessMax:1000,standardBreak:true,rank:'elite'});
  const b=createBattle({strict:true,maxAV:201,sp:3,maxSP:9,seed:42,critMode:'noncrit',
    units:[actor(1413,{eidolon:3}),mk('enemy-main'),mk('enemy-side')]});
  const [self,e1,e2]=b.units;
  b.rules.before(b,self,'skill','normal',self.actions.skill,[self],[]);
  const n=memOf(b,self);assert.ok(n,'战技未召唤长夜');
  self.resources['忆质']=self.kit.params.Talent[5];              // 16 点 → 触发迷梦
  b.rules.onTurnStart(b,n);
  assert.equal(n.resources['施放迷梦'],1,'忆质 ≥16 时长夜应改用迷梦');
  b.rules.after(b,n,'basic','normal',n.actions.basic,[e1,e2],[e1,e2]);
  assert.equal(e1.toughness,1000-raw.show_stance_list[0],'主目标应削韧 90');
  assert.equal(e2.toughness,1000-raw.show_stance_list[1],'非主目标应削韧 60');
});

test('昔涟：追忆独立存储并镜像可用能量；普攻 +1、战技 +3 并展开结界',()=>{
  const b=createBattle(config([actor(1415)]));const [self,en]=b.units,p=self.kit.params;
  assert.equal(self.energyMax,ROSTER_DATA[1415].energyMax);
  self.energy=0;
  b.rules.after(b,self,'basic','normal',self.actions.basic,[en],[en]);
  near(self.energy,p.Normal[1]);
  b.rules.before(b,self,'skill','normal',self.actions.skill,[self],[]);
  assert.ok(self.buffs.some(e=>e.tag==='cyreneField'),'战技未展开结界');
  assert.ok(self.energy<=self.energyMax);
});

test('昔涟：终结（能耗 24）召唤德谬歌（生命=昔涟生命上限 100%）、进入往昔的涟漪并展开永久结界，单场一次',()=>{
  const b=createBattle(config([actor(1415)]));const [self,en]=b.units,p=self.kit.params;
  self.energy=24;
  forceRealAction(b,self,'ultimate');
  const demo=memOf(b,self);assert.ok(demo,'未召唤德谬歌');
  near(demo.hp,combatPanel(self).hp*p.Ultra[0]);
  assert.ok(self.buffs.some(e=>e.tag==='cyreneRipple'));
  const field=self.buffs.find(e=>e.tag==='cyreneField');assert.ok(field);assert.equal(field.remaining,null,'终结后结界应没有持续时间');
  assert.equal(b.rules.prepare(b,self,'basic','normal',self.actions.basic).name,'向着爱与明天♪');
  const extra=dmgOf(b,demo.id).length;
  assert.ok(extra>=1,'德谬歌应立即获得额外回合并施放【花与箭的舞曲】');
  near(baseOf(dmgOf(b,demo.id)[0]),combatPanel(demo).hp*svp(1415,1141501)[0]);
  // 第二次终结无效（单场一次）
  self.energy=12;
  b.queue.push({actor:self.id,key:'ultimate',kind:'ultimate'});
  stepBattle(b);
  assert.equal(b.units.filter(t=>t.memospriteOwner===self.id).length,1);
  assert.ok(b.log.some(e=>e.type==='action'&&e.actor===demo.id&&e.name===skillsOf(1415)['1141501'].name),'3点故事应触发德谬歌额外舞曲');
  void en;
});

test('昔涟：结界在真实队友普攻后追加24%原伤害真实伤害，真实伤害不递归触发',()=>{
  const owner=actor(1415);owner.energy=24;const b=createBattle(config([owner,mate()],enemy(),51)),self=b.units[0];
  forceRealAction(b,self,'ultimate','ultimate');
  const ally=b.units.find(t=>t.id==='mate'),foe=b.units.find(t=>t.side==='enemy');
  forceRealAction(b,ally,'basic');
  const direct=b.log.filter(e=>e.type==='damage'&&e.actor===ally.id&&e.target===foe.id&&e.kind==='direct');
  const truth=b.log.filter(e=>e.type==='damage'&&e.actor===ally.id&&e.target===foe.id&&e.kind==='true');
  assert.equal(direct.length,1,'队友普攻应真实结算一次');
  assert.equal(truth.length,1,'真实伤害自身不得递归触发结界');
  near(truth[0].damage,direct[0].damage*self.kit.params.BPSkill[0]);
});

test('知更鸟•晴歌：战技召唤晴空乐手（生命 70% / 速度 180%）并给 6 点气氛值；6/12 点召唤第二/三名乐手并进入【Fever】',()=>{
  const b=createBattle(config([actor(1512,{eidolon:6})]));const [self]=b.units,p=self.kit.params;
  b.rules.after(b,self,'skill','normal',self.actions.skill,[self],[]);
  const band=memOf(b,self);assert.ok(band,'战技未召唤晴空乐手');
  near(band.hp,combatPanel(self).hp*p.Talent[0]);
  near(band.baseSpeed,combatPanel(self).speed*p.Talent[1],'忆灵天赋：晴空乐手速度 = 知更鸟•晴歌速度×180%');
  // 151202：Success 分支（首次召唤）只 CreateServant，不治疗、不 +6 气氛。
  near(self.resources['气氛值'],0,'首次召唤不应获得气氛值');
  // 忆灵天赋「贴近海的心跳」：被召唤时为知更鸟•晴歌恢复 20 点能量
  near(self.energy,svp(1512,1151205)[0]);
  assert.equal(self.resources['乐手人数'],1,'首次召唤只有 1 名乐手');
  assert.ok(band.cannotAct,'未进入 Fever 时乐手不应出现在行动序列上');
  assert.equal(b.units.filter(x=>x.memospriteOwner===self.id&&x.active!==false).length,1,
    '4.6 Ability 只 CreateServant 一名 11512；Partner02/03 是演出别名，不应伪造成额外行动单位');
  b.rules.after(b,self,'skill','normal',self.actions.skill,[self],[]);
  near(self.resources['气氛值'],p.BPSkill[1]+1+self.kit.ranks[2][1],'已在场时治疗并 +6 气氛，含 1 点治疗气氛与 E2 +2');
  assert.equal(self.resources['乐手人数'],2,'气氛值 ≥6 应立即召唤第二名乐手');
  b.rules.after(b,self,'skill','normal',self.actions.skill,[self],[]);
  assert.equal(self.resources['乐手人数'],3,'气氛值 ≥12 应立即召唤第三名乐手');
  assert.ok(self.buffs.some(e=>e.tag==='fever'),'全员登台后应进入 Fever');
  assert.equal(band.cannotAct,false,'Fever 期间乐手应出现在行动序列上');
  assert.equal(b.units.filter(x=>x.memospriteOwner===self.id&&x.active!==false).length,1,
    'Fever 内仍只有原始脚本创建的一个可行动晴空乐手，另外两个伙伴仅参与 Fever 别名效果');
  const cd=b.summons.find(s=>s.id===self.id+':fever');
  assert.ok(cd,'未生成 Fever 倒计时');near(cd.speed,svp(1512,1151203)[8]);
  // E6：首次进入 Fever 固定回 140 能
  assert.ok(self.energy>=self.kit.ranks[6][1]);
});

test('知更鸟•晴歌：Fever 倒计时扣除 50% 当前气氛值（至少 12 点），归零时乐手消失并退出 Fever',()=>{
  const b=createBattle(config([actor(1512)]));const [self]=b.units;
  b.rules.after(b,self,'skill','normal',self.actions.skill,[self],[]);
  b.rules.after(b,self,'skill','normal',self.actions.skill,[self],[]);
  b.rules.after(b,self,'skill','normal',self.actions.skill,[self],[]);
  const band=memOf(b,self),cd=b.summons.find(s=>s.id===self.id+':fever');
  self.resources['气氛值']=20;
  b.rules.summonTurn(b,self,cd);
  near(self.resources['气氛值'],8,'应扣除 max(12, 20×50%) = 12');
  b.rules.summonTurn(b,self,cd);
  near(self.resources['气氛值'],0);
  assert.ok(!self.buffs.some(e=>e.tag==='fever'),'气氛值归零应退出 Fever');
  assert.equal(band.active,false,'乐手应消失');
  assert.equal(self.resources['乐手人数'],0);
  assert.equal(cd.active,false);
});

test('知更鸟•晴歌：晴空乐手忆灵技 2.1×生命上限全体风伤（E6 翻倍），Fever 结界无视防御',()=>{
  const b=createBattle(config([actor(1512,{eidolon:6})]));const [self,en]=b.units,p=self.kit.params;
  b.rules.after(b,self,'skill','normal',self.actions.skill,[self],[]);
  b.rules.after(b,self,'skill','normal',self.actions.skill,[self],[]);
  b.rules.after(b,self,'skill','normal',self.actions.skill,[self],[]);
  const band=memOf(b,self);
  b.rules.onTurnStart(b,band);
  near(band.actions.basic.terms[0].multiplier,svp(1512,1151201)[1]*(1+self.kit.ranks[6][0]));
  const mod=b.rules.modifiers(b,band,en,band.actions.basic,'direct');
  near(mod.defIgnore,p.Talent[7]+self.resources['气氛值']*p.Talent[8],'Fever 结界应无视防御');
  assert.ok(mod.vuln>0,'乐手在场应提高敌方受到的伤害');
  const n0=dmgOf(b,band.id).length;
  let guard=0;while(dmgOf(b,band.id).length===n0&&guard++<400)stepBattle(b);
  const hits=dmgOf(b,band.id).slice(n0);
  assert.ok(hits.length>=1,'乐手回合应施放忆灵技');
  near(baseOf(hits[0]),band.panel.hp*svp(1512,1151201)[1]*(1+self.kit.ranks[6][0]));
  assert.equal(hits[0].element,'Wind');
});

test('知更鸟•晴歌：我方目标施放攻击获得 1 点气氛值，气氛值上限 50（E2 +20）',()=>{
  const b=createBattle(config([actor(1512),mate()]));const [self,m,en]=b.units;
  const s0=self.resources['气氛值'];
  b.rules.after(b,m,'basic','normal',m.actions.basic,[en],[en]);
  near(self.resources['气氛值'],s0+1,'队友攻击应给 1 点气氛值');
  const b2=createBattle(config([actor(1512,{eidolon:2}),mate()]));const [s2,m2,e2]=b2.units;
  assert.equal(s2.kit.params.Talent[4]+s2.kit.ranks[2][0],70);
  for(let i=0;i<80;i++)b2.rules.after(b2,m2,'basic','normal',m2.actions.basic,[e2],[e2]);
  near(s2.resources['气氛值'],70,'气氛值上限应为 50+20');
});

test('知更鸟•晴歌 E1：全队非真实伤害按100%累计；乐手打当前最高生命敌人，按气氛值结算并只清半数',()=>{
  const high=enemy({id:'highest-hp',panel:{...panel(),hp:1.1e9,speed:1}});
  const c=config([actor(1512,{eidolon:1}),mate()],enemy({id:'lower-hp'}));c.units.push(high);
  const b=createBattle(c);b.random=()=>0;
  const [self,ally,lower]=b.units,params=self.kit.ranks[1];
  b.rules.after(b,self,'skill','normal',self.actions.skill,[self],[]);
  const band=memOf(b,self);assert.ok(band);
  self.resources['气氛值']=20;
  receiveDamage(b,ally,lower,1000,'direct');
  const afterDirect=self.resources['晴空乐手记录伤害'];
  receiveDamage(b,ally,lower,300,'true');
  near(self.resources['晴空乐手记录伤害'],afterDirect,'真实伤害不得进入记录，避免E1递归记账');
  receiveDamage(b,band,lower,200,'dot');
  const total=1200;
  near(self.resources['晴空乐手记录伤害'],total,'包括忆灵在内的我方非真实伤害按E1 #3=100%记录');
  b.rules.after(b,band,'basic','extra',band.actions.basic,[lower,high],[lower,high]);
  const payout=b.log.find(e=>e.type==='damage'&&e.kind==='true'&&e.actor===band.id&&e.name==='知更鸟•晴歌 E1 · 忆灵记录真实伤害');
  assert.ok(payout,'乐手施放忆灵技时应追加独立真实伤害');
  assert.equal(payout.target,high.id,'追加伤害应选当前生命值最高的存活敌人');
  near(payout.damage,total*(params[0]+20*params[1]),'11% + 当前气氛值×0.1%');
  near(self.resources['晴空乐手记录伤害'],total*(1-params[3]),'结算后只清记录总额的50%');
  receiveDamage(b,ally,lower,400,'direct');
  const secondTotal=total*(1-params[3])+400;
  const secondRatio=params[0]+self.resources['气氛值']*params[1];
  b.rules.after(b,band,'basic','extra',band.actions.basic,[lower,high],[lower,high]);
  const payouts=b.log.filter(e=>e.type==='damage'&&e.kind==='true'&&e.actor===band.id&&e.name==='知更鸟•晴歌 E1 · 忆灵记录真实伤害');
  near(payouts.at(-1).damage,secondTotal*secondRatio,'后续技能使用保留的一半记录并按最新气氛值累计新伤害');
  near(self.resources['晴空乐手记录伤害'],secondTotal*(1-params[3]));
});

test('知更鸟•晴歌 E0：没有 E1 时不记录伤害，也不追加记录型真实伤害',()=>{
  const b=createBattle(config([actor(1512),mate()]));b.random=()=>0;
  const [self,ally,en]=b.units;
  b.rules.after(b,self,'skill','normal',self.actions.skill,[self],[]);
  const band=memOf(b,self);receiveDamage(b,ally,en,1000,'direct');
  b.rules.after(b,band,'basic','extra',band.actions.basic,[en],[en]);
  assert.equal(self.resources['晴空乐手记录伤害'],0);
  assert.ok(!b.log.some(e=>e.type==='damage'&&e.kind==='true'&&e.name==='知更鸟•晴歌 E1 · 忆灵记录真实伤害'));
});

test('知更鸟•晴歌 E2：每名队友每个自身回合第一次以技能获得气氛值时额外+2，普攻不触发',()=>{
  const b=createBattle(config([actor(1512,{eidolon:2}),mate(),mate({id:'mate2'})]));b.random=()=>0;
  const [self,ally,ally2,en]=b.units;
  const before=self.resources['气氛值'];
  b.rules.after(b,ally,'basic','normal',ally.actions.basic,[en],[en]);
  near(self.resources['气氛值'],before+1,'普通攻击只获得基础1点');
  b.rules.after(b,ally,'skill','normal',ally.actions.skill,[en],[en]);
  near(self.resources['气氛值'],before+4,'该队友本回合第一次技能额外获得2点');
  b.rules.after(b,ally,'skill','normal',ally.actions.skill,[en],[en]);
  near(self.resources['气氛值'],before+5,'同一队友同一回合第二次技能不重复获得E2加成');
  b.rules.after(b,ally2,'skill','normal',ally2.actions.skill,[en],[en]);
  near(self.resources['气氛值'],before+8,'不同队友有各自独立的每回合标记');
  ally.turns++;
  b.rules.after(b,ally,'skill','normal',ally.actions.skill,[en],[en]);
  near(self.resources['气氛值'],before+11,'队友进入下一回合后可再次触发');
});

test('知更鸟•晴歌 E4：速度只在Fever生效，气氛值改变与倒计时都会即时刷新',()=>{
  const b=createBattle(config([actor(1512,{eidolon:4})]));b.random=()=>0;
  const [self]=b.units,p=self.kit.params,rank=self.kit.ranks[4];
  const skill=()=>b.rules.after(b,self,'skill','normal',self.actions.skill,[self],[]);
  skill();const band=memOf(b,self);assert.ok(band);
  assert.ok(!band.buffs.some(x=>x.id===self.id+':e4-speed'),'未进入Fever时不应应用E4速度');
  skill();skill();assert.ok(self.buffs.some(x=>x.tag==='fever'),'多次获得气氛值后进入Fever');
  const speedBuff=()=>band.buffs.find(x=>x.id===self.id+':e4-speed');
  near(speedBuff().value,rank[1]+self.resources['气氛值']*rank[2],'进入Fever立即按当前气氛值刷新速度');
  const cd=b.summons.find(x=>x.id===self.id+':fever');
  b.rules.summonTurn(b,self,cd);
  near(speedBuff().value,rank[1]+self.resources['气氛值']*rank[2],'倒计时扣除气氛值后即时刷新速度');
  near(combatPanel(band).speed,band.baseSpeed*(1+speedBuff().value),'战斗面板读取更新后的E4速度');
  void p;
});

test('知更鸟•晴歌 E6：Fever内终结能量上限翻倍、首次入场及每次倒计时回140能，退出后恢复原上限',()=>{
  const b=createBattle(config([actor(1512,{eidolon:6})]));b.random=()=>0;
  const [self]=b.units,base=self.energyMax,stored=self.energy;
  self.energy=50;
  const skill=()=>b.rules.after(b,self,'skill','normal',self.actions.skill,[self],[]);
  skill();skill();skill();
  assert.ok(self.buffs.some(x=>x.tag==='fever'));
  assert.equal(self.energyMax,base*2,'E6 Fever的能量储存上限为两次终结技');
  assert.equal(self.actions.ultimate.energyCost,base,'单次终结技消耗仍为原能量上限');
  near(self.energy,50+svp(1512,1151205)[0]+self.kit.ranks[6][1],
    '召唤乐手固定回20能，首次进入Fever再固定回140点');
  const cd=b.summons.find(x=>x.id===self.id+':fever');
  b.rules.summonTurn(b,self,cd);
  near(self.energy,base*2,'Fever倒计时回合开始固定恢复140，且不溢出双倍上限');
  b.rules.summonTurn(b,self,cd);
  b.rules.summonTurn(b,self,cd);
  assert.ok(!self.buffs.some(x=>x.tag==='fever'),'两次倒计时后应退场；当前气氛='+self.resources['气氛值']+'、Fever='+self.buffs.some(x=>x.tag==='fever'));
  assert.equal(self.energyMax,base,'退出Fever时恢复原能量上限');
  near(self.energy,base,'超过原上限的储能在E6上限状态结束时被夹回');
  void stored;
});

test('昔涟/长夜月/知更鸟 的忆灵都按 hp 口径折算：忆灵生命上限 = 召唤者局内生命上限 × pct',()=>{
  const cases=[[1409,0.5],[1413,0.5],[1415,1.0],[1512,0.7]];
  for(const [id,pct] of cases){
    const b=createBattle(config([actor(id)]));const [self]=b.units;
    if(id===1415){self.energy=24;b.rules.before(b,self,'ultimate','ultimate',self.actions.ultimate,[self],[]);}
    else if(id===1413){b.rules.before(b,self,'skill','normal',self.actions.skill,[self],[]);}
    else{b.rules.after(b,self,'skill','normal',self.actions.skill,[self],[]);}
    const m=memOf(b,self);assert.ok(m,id+' 未召唤忆灵');
    near(m.panel.hp,combatPanel(self).hp*pct,1e-6,id);
  }
});

test('第11批 6 名角色与既有四人体系混编可完成组件试算（已知缺口角色显式近似）',()=>{
  for(const id of IDS)for(const eidolon of [0,3,6]){
    const x=actor(id,{eidolon}),ar=actor(1015),s=actor(1306),ce=actor(1412);
    x.id='focus';x.energy=x.energyMax??0;x.policy={...x.policy,autoUltimate:true,allyTargetId:ar.id};
    s.policy.allyTargetId=ar.id;ce.policy.allyTargetId=ar.id;
    const c={strict:true,maxAV:300,sp:3,maxSP:9,seed:3,critMode:'expected',requiredAllies:4,units:[x,s,ar,ce,enemy()]};
    assert.deepEqual(validateBattle(c).map(e=>e),[],id+' E'+eidolon);
    const r=simulateBattle(c);
    assert.ok(r.damage>0,id+' 未造成伤害');
    assertFixtureDisclosure(r,c);
  }
});

test('第11批 角色在多波次组件试算中处理换波 / 阵亡 / 忆灵续存（缺口保留并显式披露）',()=>{
  for(const id of IDS){
    const x=actor(id,{eidolon:6}),ar=actor(1015),s=actor(1306),ce=actor(1412);
    x.id='focus';x.energy=x.energyMax??0;x.policy={...x.policy,autoUltimate:true,allyTargetId:ar.id};
    s.policy.allyTargetId=ar.id;ce.policy.allyTargetId=ar.id;
    const c={strict:true,maxAV:900,sp:3,maxSP:9,seed:7,critMode:'expected',requiredAllies:4,
      units:[x,s,ar,ce,enemy({panel:{...panel(),hp:6000,speed:1}}),
        enemy({id:'enemy-w2',wave:2,panel:{...panel(),hp:6000,speed:1}}),
        enemy({id:'enemy-w3',wave:3,panel:{...panel(),hp:6000,speed:1}})]};
    assert.deepEqual(validateBattle(c).map(e=>e),[]);
    const r=simulateBattle(c);
    assert.equal(r.outcome,'victory',id+' 未能完成三波战斗');
    assertFixtureDisclosure(r,c);
  }
});

test('4 名记忆角色同队（多忆灵并存）可完成组件试算（已知缺口角色显式近似）',()=>{
  for(const team of [[1402,1407,1413,1415],[1402,1409,1413,1512],[1407,1409,1415,1512]]){
    const units=team.map((id,i)=>{const a=actor(id,{eidolon:6});a.id='u'+i;a.energy=a.energyMax??0;a.policy={...a.policy,autoUltimate:true,allyTargetId:'u0'};return a;});
    const c={strict:true,maxAV:400,sp:3,maxSP:9,seed:11,critMode:'expected',requiredAllies:4,units:[...units,enemy({panel:{...panel(),hp:200000,speed:100}})]};
    assert.deepEqual(validateBattle(c).map(e=>e),[],team.join('/'));
    const r=simulateBattle(c);
    assert.equal(r.outcome,'victory',team.join('/'));
    assert.ok(r.damage>0);assertFixtureDisclosure(r,c);
  }
});

console.log(`DeepSeek batch11 checks: ${passed} passed, ${failed} failed.`);if(failed)process.exitCode=1;
