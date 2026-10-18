// DeepSeek 第 17 批：8001/8002 物理开拓者、8007/8008 记忆开拓者（忆灵迷迷）、
// 1404 万敌、1408 白厄、1509 吉尔伽美什 的机制测试。
//
// 期望值全部由 4.6 编译出的 kit 参数（params / trace / ranks）、`simulator/roster-data.mjs`
// 的 `hits` / `stance`，以及 `_data_cache/hsr_core.json` 的忆灵技参数推导，不写死倍率。
// 时序用 b.rules.before / after / afterDamage / onTurnStart / panel / prepare 直接驱动；
// 数值用伤害事件的 base 乘区（= 面板 × 倍率 × 分段比例）核对。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createContext} from '../core/ctx.mjs';
import {newBattleBuild,buildBattleActor} from '../simulator/builds.mjs';
import {createBattle as rawCreateBattle,stepBattle,simulateBattle as rawSimulateBattle,validateBattle as rawValidateBattle,combatPanel} from '../simulator/engine.mjs';
const validateBattle=c=>rawValidateBattle(partialMechanicsFixture(c));
import {partialMechanicsFixture,assertFixtureDisclosure} from './partial-mechanics-fixtures.mjs';
const createBattle=c=>rawCreateBattle(partialMechanicsFixture(c));
const simulateBattle=c=>rawSimulateBattle(partialMechanicsFixture(c));
import {validateKitActor} from '../simulator/kits.mjs';
import {IDS} from '../simulator/characters/extra/batch17.mjs';
import {ROSTER_DATA} from '../simulator/roster-data.mjs';
const data=JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url))),ctx=createContext(data);
const near=(a,b,m=1e-6,msg)=>{if(typeof m!=='number'){msg=m;m=1e-6;}assert.ok(Math.abs(a-b)<m,`${a} != ${b}${msg?' ('+msg+')':''}`);};
const panel=()=>({hp:10000,atk:1000,def:1000,speed:100,critRate:.5,critDmg:1,energyRegen:1,effectHit:0,effectRes:0,breakEffect:0,baseStats:{hp:1000,atk:1000,def:1000},elemDmg:{}});
const actor=(id,extra={})=>{const a=buildBattleActor(ctx,{...newBattleBuild(),characterId:id,relicAuto:false,panel:panel(),...extra});a.energy=0;a.policy={...a.policy,autoUltimate:false};return a;};
const enemy=(extra={})=>({id:'enemy',name:'规则训练敌人',side:'enemy',level:90,element:'Physical',panel:{...panel(),hp:1e9,speed:1},energy:0,energyMax:0,res:{},
  actions:{basic:{name:'测试攻击',type:'Normal',terms:[{scaling:'atk',multiplier:1}],hitEnergy:10}},policy:{autoUltimate:false,basicOnly:true},...extra});
const mate=(extra={})=>({id:'mate',name:'测试队员',side:'ally',level:80,element:'Physical',panel:{...panel(),speed:1},energy:0,energyMax:100,
  actions:{basic:{name:'测试普攻',type:'Normal',terms:[{scaling:'atk',multiplier:1}],spGain:1,energyGain:20,toughness:30},
    skill:{name:'测试战技',type:'BPSkill',terms:[{scaling:'atk',multiplier:1}],spCost:1,energyGain:30,toughness:60}},policy:{autoUltimate:false,basicOnly:true},...extra});
const config=(units,en=null,maxAV=201)=>({strict:true,maxAV,sp:3,maxSP:9,seed:42,critMode:'noncrit',units:[...units,en??enemy()]});
const baseOf=ev=>ev.formula.find(f=>f.zone==='base').value;
const dmgOf=(b,id,kind)=>b.log.filter(e=>e.type==='damage'&&e.actor===id&&(kind?e.kind===kind:true));
const memOf=(b,owner)=>b.units.find(t=>t.memospriteOwner===owner.id);
const svp=(charId,skillId)=>data.characters.find(c=>c.id===charId).memosprite.skills[String(skillId)].level['10'].param_list;
const skillsOf=id=>ROSTER_DATA[id].skills;
const P=(id,n,lv)=>skillsOf(id)[String(id*100+n)].params[lv??(n===1?'6':'10')].param_list;
let passed=0,failed=0;const test=(name,fn)=>{try{fn();passed++;console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+'\n'+e.stack);}};
const TB=[8001,8002],RM=[8007,8008];

test('batch17 7 名角色 E0～E6 动作合同可编译、不能篡改倍率，且每名都有带倍率的动作',()=>{
  assert.deepEqual([...IDS].sort((a,b)=>a-b),[1404,1408,1509,8001,8002,8007,8008]);
  for(const id of IDS)for(let eidolon=0;eidolon<=6;eidolon++){
    const a=actor(id,{eidolon});assert.deepEqual(validateKitActor(a),[],id+' E'+eidolon);assert.deepEqual(a.unsupported,[]);
    const key=Object.keys(a.actions).find(k=>(a.actions[k]?.terms??[]).length);assert.ok(key,id+' 没有带倍率的动作');
    a.actions[key].terms[0].multiplier=99;assert.ok(validateKitActor(a).length,id+' 篡改倍率未被发现');}
});

test('物理开拓者：段数 / 削韧与原始脚本一致，终结技两种模式按敌人数切换',()=>{
  for(const id of TB){
    const u=actor(id);
    assert.deepEqual(u.actions.basic.hitShares,[1]);                       // Skill01_Phase02
    assert.equal(u.actions.skill.target,'blast');
    assert.equal(u.actions.skill.terms[0].multiplier,u.kit.params.BPSkill[0]);
    assert.equal(u.actions.skill.terms[1].multiplier,u.kit.params.BPSkill[0]);
    assert.equal(u.actions.skill.terms[1].target,'adjacent');
    const blast=P(id,9),single=P(id,8);
    assert.equal(u.actions.ultimate.terms[0].multiplier,blast[0]);
    assert.equal(u.actions.ultimate.terms[1].multiplier,blast[1]);
    assert.equal(u.actions.ultimateSingle.terms[0].multiplier,single[0]);
    assert.equal(u.actions.ultimate.energyCost,u.energyMax);
    assert.equal(u.actions.ultimateSingle.energyCost,u.energyMax);
    // 1 名敌人 → 单体重击；≥2 名敌人 → 安息全垒打
    const b1=createBattle(config([actor(id)]));
    assert.equal(b1.rules.prepare(b1,b1.units[0],'ultimate','ultimate',b1.units[0].actions.ultimate).name,u.actions.ultimateSingle.name);
    const c=config([actor(id)]);c.units=[c.units[0],enemy({id:'e1'}),enemy({id:'e2'})];
    const b2=createBattle(c);
    assert.equal(b2.rules.prepare(b2,b2.units[0],'ultimate','ultimate',b2.units[0].actions.ultimate).name,u.actions.ultimate.name);
  }
});

test('物理开拓者：天赋击破叠层 +20% 攻击 / 上限 2 层（行迹每层 +10% 防御），E6 击杀也触发',()=>{
  for(const id of TB){
    const b=createBattle(config([actor(id)]));const [u,en]=b.units,T=u.kit.params.Talent;
    b.rules.afterDamage(b,u,en,'break');
    let t=u.buffs.find(e=>e.tag==='tbPhysTalent');
    assert.ok(t,'击破弱点未触发天赋');near(t.value,T[0]);assert.equal(t.stacks,1);
    near(u.buffs.find(e=>e.tag==='tbPhysTalentDef').value,u.kit.trace[2][0]);
    b.rules.afterDamage(b,u,en,'break');
    assert.equal(u.buffs.find(e=>e.tag==='tbPhysTalent').stacks,2);
    b.rules.afterDamage(b,u,en,'break');
    assert.equal(u.buffs.find(e=>e.tag==='tbPhysTalent').stacks,T[1],'天赋层数上限应为 2');
    // E6：消灭敌方目标也触发天赋
    const b2=createBattle(config([actor(id,{eidolon:6})]));const [s2,e2]=b2.units;
    b2.rules.afterDamage(b2,s2,e2,'break');
    const before=s2.buffs.find(e=>e.tag==='tbPhysTalent').stacks;
    b2.rules.death(b2,s2,e2);
    assert.equal(s2.buffs.find(e=>e.tag==='tbPhysTalent').stacks,Math.min(before+1,2),'E6 击杀应触发天赋');
  }
});

test('物理开拓者：行迹「斗志」使战技 / 安息全垒打指定目标伤害 +25%，E4 击中击破目标暴击率 +25%',()=>{
  for(const id of TB){
    const b=createBattle(config([actor(id,{eidolon:4})]));const [u,en]=b.units;
    const skillName=u.actions.skill.name;
    b.activeAction={sequence:1,targets:[en.id]};
    near(b.rules.modifiers(b,u,en,{name:skillName,type:'BPSkill',element:'Physical'},'direct').dmgBoost,u.kit.trace[3][0]);
    near(b.rules.modifiers(b,u,en,{name:u.actions.ultimate.name,type:'Ultra',element:'Physical'},'direct').dmgBoost,u.kit.trace[3][0]);
    near(b.rules.modifiers(b,u,en,{name:u.actions.basic.name,type:'Normal',element:'Physical'},'direct').dmgBoost,0);
    en.broken=true;
    near(b.rules.modifiers(b,u,en,{name:u.actions.basic.name,type:'Normal',element:'Physical'},'direct').critRate,u.kit.ranks[4]);
    en.broken=false;
    near(b.rules.modifiers(b,u,en,{name:u.actions.basic.name,type:'Normal',element:'Physical'},'direct').critRate,0);
  }
});

test('物理开拓者：E1 终结技击杀回 10 能（每次攻击 1 次）、E2 击中物理弱点目标回复 5% 攻击力生命',()=>{
  for(const id of TB){
    const c=config([actor(id,{eidolon:2})]);c.units[1].weaknesses=['Physical'];
    const b=createBattle(c);const [u,en]=b.units;
    u.hp=5000;
    b.rules.after(b,u,'basic','normal',u.actions.basic,[en],[en]);
    near(u.hp,5000+combatPanel(u).atk*u.kit.ranks[2][0],'E2 应回复 5% 攻击力生命');
    const b2=createBattle(config([actor(id,{eidolon:1})]));const [s2,e2]=b2.units;
    s2.energy=0;b2.activeAction={sequence:7,key:'ultimate'};
    b2.rules.death(b2,s2,e2);near(s2.energy,s2.kit.ranks[1][0]);
    b2.rules.death(b2,s2,e2);near(s2.energy,s2.kit.ranks[1][0],'同一次攻击只应触发 1 次');
    b2.activeAction={sequence:8,key:'ultimate'};b2.rules.death(b2,s2,e2);
    near(s2.energy,2*s2.kit.ranks[1][0],'新一次终结技应可再次触发');
  }
});

test('物理开拓者：秘技为我方全体回复各自生命上限 15% 的生命',()=>{
  for(const id of TB){
    const a=actor(id,{technique:true}),m=mate();a.currentHp=1;m.currentHp=1;
    const b=createBattle(config([a,m]));const [u,mm]=b.units;
    near(u.hp,1+combatPanel(u).hp*u.kit.params.Maze[0]);
    near(mm.hp,1+combatPanel(mm).hp*u.kit.params.Maze[0]);
  }
});

test('记忆开拓者：战技召唤迷迷（生命 = 开拓者生命上限 80%+640 / 速度 130），首次召唤 +90% 充能',()=>{
  for(const id of RM){
    const b=createBattle(config([actor(id)]));const [u]=b.units,p=u.kit.params;
    b.rules.before(b,u,'skill','normal',u.actions.skill,[u]);
    const s=memOf(b,u);assert.ok(s,'战技未召唤忆灵迷迷');
    near(s.panel.hp,combatPanel(u).hp*p.Talent[1]+p.Talent[3]);
    near(combatPanel(s).speed,p.Talent[0]);
    // 被召唤 +50%（1800705）+ 行迹 point06 首次召唤 +40%
    near(s.resources['充能'],svp(id,1800705)[0]*100+u.kit.trace[1][1]*100);
    // 已在场时改为治疗迷迷 60% 生命上限并 +10% 充能
    s.hp=1;const before=s.resources['充能'];
    b.rules.before(b,u,'skill','normal',u.actions.skill,[u]);
    assert.ok(b.log.some(e=>e.type==='heal'&&e.target===s.id),'迷迷在场时战技应治疗迷迷');
    near(s.resources['充能'],Math.min(100,before+p.BPSkill[1]*100));
  }
});

test('记忆开拓者：终结技使迷迷对敌方全体造成 240% 攻击力冰伤（E6 固定暴击）',()=>{
  for(const id of [8007,8008]){
    const b=createBattle(config([actor(id,{eidolon:6})]));const [u,en]=b.units,p=u.kit.params;
    const n0=dmgOf(b,u.id).length;
    b.rules.before(b,u,'ultimate','ultimate',u.actions.ultimate,[u]);
    const s=memOf(b,u);assert.ok(s,'终结技未召唤迷迷');
    const hits=dmgOf(b,s.id);
    assert.equal(hits.length,1,'终结技应使迷迷对每个敌人造成 1 次伤害');
    near(baseOf(hits[0]),combatPanel(s).atk*p.Ultra[0]);
    assert.equal(hits[0].critMode,'crit','E6 终结技暴击率应固定 100%');
    near(s.resources['充能'],100,'召唤 50% + 行迹 40% + 终结技 40% 应封顶 100%');
    void n0;void en;
  }
});

test('记忆开拓者：迷迷忆灵技 4 次 50.4% 弹射 + 126% 全体，施放后行迹「袖珍的事诗」+5% 充能',()=>{
  const b=createBattle(config([actor(8007)]));const [u,en]=b.units;
  b.rules.before(b,u,'skill','normal',u.actions.skill,[u]);
  const s=memOf(b,u);s.resources['充能']=0;
  b.rules.onTurnStart(b,s);
  assert.equal(s.actions.basic.name,'坏人！麻烦！');
  const q=svp(8007,1800701);
  assert.equal(s.actions.basic.bounceCount,q[1]);
  near(s.actions.basic.bounceTerms[0].multiplier,q[0]);
  near(s.actions.basic.terms[0].multiplier,q[2]);
  b.rules.after(b,s,'basic','normal',s.actions.basic,[en],[en]);
  near(s.resources['充能'],u.kit.trace[2][0]*100,'施放【坏人！麻烦！】应立即获得 5% 充能');
  void en;
});

test('记忆开拓者：充能满 100% 时迷迷立即行动并施放【我会！帮你！】，附上声援 3 回合并使目标行动提前 100%',()=>{
  const b=createBattle(config([actor(8007),mate()]));const [u,m]=b.units;
  b.rules.before(b,u,'skill','normal',u.actions.skill,[u]);
  const s=memOf(b,u);
  s.resources['充能']=99;
  b.rules.after(b,s,'basic','normal',s.actions.basic,[m],[m]);   // 行迹 +5 → 满
  assert.equal(s.resources['充能'],100);
  assert.equal(s.distance,0,'充能满应使迷迷立即行动');
  b.rules.onTurnStart(b,s);
  assert.equal(s.actions.basic.name,'我会！帮你！');
  assert.deepEqual(s.actions.basic.terms,[]);
  m.distance=10000;
  b.rules.after(b,s,'basic','normal',s.actions.basic,[m],[m]);
  const sup=m.buffs.find(e=>e.tag==='mimiSupport');
  assert.ok(sup,'未附上【迷迷的声援】');near(sup.remaining,svp(8007,1800707)[1]);
  assert.equal(m.distance,0,'声援应使目标行动提前 100%');
  assert.equal(s.resources['充能'],0,'施放声援后应清空充能');
});

test('记忆开拓者：声援持有者每造成 1 次伤害追加 36% 真实伤害（行迹「磁石与长链」按能量上限提高倍率）',()=>{
  const b=createBattle(config([actor(8007),mate({energyMax:200})]));const [u,m,en]=b.units;
  const q=svp(8007,1800707);
  b.log.push({type:'damage',actor:m.id,target:en.id,damage:1000,hpDamage:1000,kind:'direct',av:b.av,formula:[]});
  const n0=b.log.filter(e=>e.kind==='true').length;
  b.rules.afterDamage(b,m,en,'direct');
  assert.equal(b.log.filter(e=>e.kind==='true').length,n0,'无声援时不应追加真实伤害');
  // 直接挂上声援
  b.rules.before(b,u,'skill','normal',u.actions.skill,[u]);
  const s=memOf(b,u);m.buffs.push({id:'sup',type:'buff',name:'迷迷的声援',key:'marker',value:0,tag:'mimiSupport',source:u.id,remaining:3,tickOwner:m.id,appliedTurn:0});
  b.log.push({type:'damage',actor:m.id,target:en.id,damage:1000,hpDamage:1000,kind:'direct',av:b.av,formula:[]});
  b.rules.afterDamage(b,m,en,'direct');
  const td=b.log.filter(e=>e.kind==='true');
  assert.equal(td.length,n0+1,'声援应追加 1 次真实伤害');
  const t=u.kit.trace[3];
  const expect=q[0]+Math.min(t[3],Math.floor((200-t[0])/t[1])*t[2]);
  near(td.at(-1).damage,1000*expect);
  void s;
});

test('记忆开拓者：持有【史诗】且迷迷在场时普攻强化为【明天，一同写下！】，消耗 1 层（终结技后获得，上限 2）',()=>{
  for(const id of RM){
    const b=createBattle(config([actor(id)]));const [u,en]=b.units;
    b.rules.before(b,u,'ultimate','ultimate',u.actions.ultimate,[u]);
    b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[u],[en]);
    assert.equal(u.resources['史诗'],1,'终结技后应获得 1 层【史诗】');
    const s=memOf(b,u);
    const prep=b.rules.prepare(b,u,'basic','normal',u.actions.basic);
    assert.equal(prep.name,u.actions.enhancedBasic.name,'持有【史诗】时应强化普攻');
    const enh=P(id,8,'6');
    const n0=dmgOf(b,s.id).length;
    b.rules.before(b,u,'basic','normal',prep,[en]);
    b.rules.after(b,u,'basic','normal',prep,[en],[en]);
    assert.equal(u.resources['史诗'],0,'强化普攻应消耗 1 层【史诗】');
    const hits=dmgOf(b,s.id).slice(n0);
    assert.equal(hits.length,1,'迷迷应参与连携攻击');
    near(baseOf(hits[0]),combatPanel(s).atk*enh[1]);
    near(s.resources['充能'],100,'连携攻击后迷迷应 +10% 充能（封顶 100）');
  }
});

test('记忆开拓者：忆灵天赋使我方全体暴击伤害 = 迷迷暴伤 ×16.8% + 33.6%；每 10 点队友回能 +1% 充能',()=>{
  const b=createBattle(config([actor(8007),mate()]));const [u,m]=b.units;
  b.rules.before(b,u,'skill','normal',u.actions.skill,[u]);
  const s=memOf(b,u);
  const cd0=combatPanel(m).critDmg;
  const q=svp(8007,1800703);
  near(cd0,1+combatPanel(s).critDmg*q[0]+q[1]);
  // 队友回能 10 点 → +1% 充能（迷迷充能先清 0）
  s.resources['充能']=0;u.resources['能量扫描']=0;u.resources['能量累计']=0;
  const log0=b.log.length;
  u.resources['能量扫描']=log0;
  b.log.push({type:'energy',actor:m.id,amount:10,av:b.av});
  b.rules.after(b,u,'basic','normal',u.actions.basic,[],[ ]);
  near(s.resources['充能'],1,'每 10 点队友回能应给迷迷 1% 充能');
});

test('记忆开拓者：秘技使敌方全体行动延后 50% 并造成 100% 攻击力冰伤',()=>{
  for(const id of RM){
    const b=createBattle(config([actor(id,{technique:true})]));const [u,en]=b.units;
    const tech=dmgOf(b,u.id,'technique');
    assert.equal(tech.length,1);
    near(baseOf(tech[0]),combatPanel(u).atk*u.kit.params.Maze[2]);
    assert.ok(en.distance>10000,'秘技应使敌人行动延后');
  }
});

test('万敌：战技消耗 50% 当前生命并按损失量积攒充能（1% 生命 = 1 点），不消耗战技点',()=>{
  const b=createBattle(config([actor(1404)]));const [u,en]=b.units,p=u.kit.params;
  assert.equal(u.actions.skill.spCost,0,'万敌战技不消耗战技点');
  const hp0=u.hp;
  b.rules.before(b,u,'skill','normal',u.actions.skill,[en]);
  near(u.hp,hp0*(1-p.BPSkill[2]));
  near(u.resources['充能'],p.BPSkill[2]*100,'损失 50% 生命应积攒 50 点充能');
});

test('万敌：充能达到 100 进入【血仇】—— 回复 25% 生命上限、生命上限 +50%、防御归 0、行动提前',()=>{
  const b=createBattle(config([actor(1404)]));const [u,en]=b.units,p=u.kit.params;
  u.resources['充能']=99;
  b.rules.before(b,u,'skill','normal',u.actions.skill,[en]);   // +50 → 149 → 进入血仇
  assert.ok(u.buffs.some(e=>e.tag==='mydeimosBB'),'未进入【血仇】');
  near(u.resources['充能'],149-100);
  near(combatPanel(u).hp,u.panel.hp+u.panel.baseStats.hp*p.Talent[4],'血仇应使生命上限 +50%');
  assert.equal(combatPanel(u).def,0,'血仇期间防御力应为 0');
  assert.equal(u.distance,0,'进入血仇应行动提前 100%');
  void p;
});

test('万敌：【血仇】时回合开始自动施放【弑王成王】（主 110% / 相邻 66%，生命消耗 35%）',()=>{
  const b=createBattle(config([actor(1404)]));const [u,en]=b.units;
  u.resources['充能']=100;b.rules.onTurnStart(b,u);           // 进入血仇（100 → 0 + 回复）
  assert.ok(u.buffs.some(e=>e.tag==='mydeimosBB'));
  assert.equal(b.rules.shouldUseSkill(b,u),true);
  const prep=b.rules.prepare(b,u,'skill','normal',u.actions.skill);
  assert.equal(prep.name,ROSTER_DATA[1404].skills['140409'].name);
  near(prep.terms[0].multiplier,P(1404,9)[0]);
  near(prep.terms[1].multiplier,P(1404,9)[1]);
  const hp0=u.hp;
  b.rules.before(b,u,'skill','normal',prep,[en]);
  near(u.hp,hp0*(1-P(1404,9)[2]),'弑王成王应消耗 35% 当前生命');
});

test('万敌：【血仇】期间充能达到 150 时回合开始立即施放【弑神登神】（2.8/1.68 生命上限）并消耗充能',()=>{
  const b=createBattle(config([actor(1404)]));const [u,en]=b.units;
  u.resources['充能']=100;b.rules.onTurnStart(b,u);           // 进入血仇
  u.resources['充能']=150;
  b.rules.onTurnStart(b,u);
  const hits=dmgOf(b,u.id,'direct');
  assert.equal(hits.length,2,'弑神登神应对主目标结算 2 段');
  for(const ev of hits)near(baseOf(ev),combatPanel(u).hp*P(1404,11)[0]*0.5);
  assert.equal(u.resources['充能'],0,'应消耗 150 点充能');
  assert.ok(u.resources['禁止充能']===0,'弑神登神结束后应恢复充能积攒');
  void en;
});

test('万敌：E1 使【弑神登神】变为对敌方全体造成主目标倍率 ×1.3 的虚数伤害',()=>{
  const c=config([actor(1404,{eidolon:1})]);c.units=[c.units[0],enemy({id:'e1'}),enemy({id:'e2'}),enemy({id:'e3'})];
  const b=createBattle(c);const [u]=b.units;
  assert.equal(u.kit.ranks[1][0],0.3);
  u.resources['充能']=100;b.rules.onTurnStart(b,u);
  u.resources['充能']=150;b.rules.onTurnStart(b,u);
  const hits=dmgOf(b,u.id,'direct');
  assert.equal(hits.length,6,'E1 下弑神登神应对 3 名敌人各结算 2 段');
  for(const ev of hits)near(baseOf(ev),combatPanel(u).hp*P(1404,11)[0]*1.3*0.5);
  // 无 E1 时为 2 段（主目标）
});

test('万敌：【血仇】期间受到致命攻击不阵亡（回复 50% 生命、清空充能），行迹「水与泥土」可留场 3 次',()=>{
  // 行迹 point06 在晋阶 2 即解锁，80 级必然生效：前 3 次留场，第 4 次退出【血仇】。
  const b2=createBattle(config([actor(1404)]));const [s2]=b2.units;
  s2.resources['充能']=100;b2.rules.onTurnStart(b2,s2);
  const hp=s2.hp;
  for(let i=0;i<3;i++){s2.hp=1;s2.resources['充能']=80;b2.rules.beforeLethal(b2,null,s2,1e9);
    assert.ok(s2.buffs.some(e=>e.tag==='mydeimosBB'),'行迹触发时应留在【血仇】');}
  assert.equal(s2.resources['水与泥土'],3);
  near(s2.hp,1+combatPanel(s2).hp*s2.kit.params.Talent[3]*(1+s2.kit.trace[3][4]));
  s2.hp=1;s2.resources['充能']=80;b2.rules.beforeLethal(b2,null,s2,1e9);
  assert.ok(!s2.buffs.some(e=>e.tag==='mydeimosBB'),'行迹用尽后应退出【血仇】');
  void hp;
});

test('万敌：E2 血仇中无视 15% 防御且治疗 40% 转充能（单次行动上限 40），E4 暴伤 +30% 且受击回 10% 生命',()=>{
  const b=createBattle(config([actor(1404,{eidolon:4})]));const [u,en]=b.units;
  u.resources['充能']=100;b.rules.onTurnStart(b,u);
  near(b.rules.modifiers(b,u,en,u.actions.basic,'direct').defIgnore,u.kit.ranks[2][0]);
  near(b.rules.modifiers(b,u,en,u.actions.basic,'direct').critDmg,u.kit.ranks[4][1]);
  // E4 受击回复 10% 生命上限
  u.hp=1000;u.resources['治疗扫描']=b.log.length;u.resources['禁止充能']=0;
  b.log.push({type:'damage',actor:en.id,target:u.id,damage:0,hpDamage:0,kind:'direct',av:b.av,formula:[]});
  b.rules.afterDamage(b,en,u,'direct');
  near(u.hp,1000+combatPanel(u).hp*u.kit.ranks[4][0]*(1+u.kit.trace[3][4]));
  // E2 治疗转充能：模拟一次 100 点治疗 → +40 充能
  u.resources['充能']=0;u.resources['治疗扫描']=b.log.length;
  b.log.push({type:'heal',actor:u.id,target:u.id,amount:100,av:b.av});
  b.log.push({type:'action',actor:u.id,av:b.av});
  b.rules.after(b,u,'basic','normal',u.actions.basic,[],[ ]);
  near(u.resources['充能'],Math.min(u.kit.ranks[2][2],100*u.kit.ranks[2][1]));
});

test('万敌：终结技回复 20% 生命上限、+20 充能、对主/相邻造成 160%/100% 生命上限伤害并嘲讽',()=>{
  const c=config([actor(1404)]);c.units=[c.units[0],enemy({id:'e1'}),enemy({id:'e2'})];
  const b=createBattle(c);const [u,e1,e2]=b.units,p=u.kit.params;
  u.hp=1000;u.resources['充能']=0;u.energy=u.energyMax;
  b.rules.before(b,u,'ultimate','ultimate',u.actions.ultimate,[e1,e2]);
  const heal=combatPanel(u).hp*p.Ultra[2]*(1+u.kit.trace[3][4]);
  near(u.hp,Math.min(combatPanel(u).hp,1000+heal));
  near(u.resources['充能'],p.Ultra[4]);
  assert.ok(e1.buffs.some(e=>e.tag==='mydeimosTaunt'),'终结技应使目标陷入嘲讽');
  assert.ok(e2.buffs.some(e=>e.tag==='mydeimosTaunt'),'相邻目标也应陷入嘲讽');
});

test('万敌：行迹「血祥罩衫」按超过 4000 的生命上限提高暴击率（每 100 点 +1.2%，最多计入 4000 点）',()=>{
  const b=createBattle(config([actor(1404)]));const [u]=b.units,t=u.kit.trace[3];
  // 面板生命 10000 → 超出 6000，最多计入 4000 → 40×1.2% = 48%
  const over=Math.min(t[1],Math.max(0,combatPanel(u).hp-t[0]));
  near(u.buffs.find(e=>e.id===u.id+':hp-crit').value,Math.floor(over/100)*t[2]);
  near(u.buffs.find(e=>e.id===u.id+':hp-heal').value,t[4]);
});

test('白厄：能量上限即【火种】12 点；战技 +2 点、行迹开场 +1 点、E6 开场 +6 点、溢出上限 3 点',()=>{
  const b=createBattle(config([actor(1408)]));const [u,en]=b.units,p=u.kit.params;
  assert.equal(u.energyMax,12);assert.equal(u.actions.ultimate.energyCost,12);
  near(u.energy,u.kit.trace[1][1],'行迹应开场给 1 点【火种】');
  b.rules.after(b,u,'skill','normal',u.actions.skill,[en],[en]);
  near(u.energy,1+p.BPSkill[2]);
  u.energy=11;b.rules.after(b,u,'skill','normal',u.actions.skill,[en],[en]);
  near(u.energy,12);near(u.resources['火种溢出'],Math.min(p.Talent[2],1));
  const b6=createBattle(config([actor(1408,{eidolon:6})]));const [u6]=b6.units;
  near(u6.energy,Math.min(12,6+1),'E6 开场应给 6 点【火种】');
  // 溢出上限：E6 取消上限
  u6.energy=12;u6.resources['火种溢出']=0;
  b6.rules.after(b6,u6,'skill','normal',u6.actions.skill,[],[ ]);
  near(u6.resources['火种溢出'],2);
});

test('白厄：终结技变身卡厄斯兰那（攻击 +80% / 生命上限 +270% / 八个独立倒计时）',()=>{
  const b=createBattle(config([actor(1408)]));const [u,en]=b.units,k=ROSTER_DATA[1408];
  const form=k.skills['140805'].params['10'].param_list,base=u.panel;
  u.energy=12;
  b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[],[en]);
  assert.ok(u.buffs.some(e=>e.tag==='phainonKhaos'),'未进入卡厄斯兰那');
  assert.equal(u.resources['毁伤'],form[0]);
  near(combatPanel(u).atk,base.atk+base.baseStats.atk*(form[3]+u.kit.trace[3][0]));
  near(combatPanel(u).hp,base.hp+base.baseStats.hp*form[4]);
  assert.equal(b.actionEvents.filter(e=>e.active).length,u.kit.params.Ultra[3],'变身应创建8个独立行动条倒计时');
  for(const [i,e] of b.actionEvents.entries()){
    near(e.speed,(u.baseSpeed??u.panel.speed)*u.kit.params.Ultra[2],'倒计时速度应为白厄基础速度的60%');
    // 首动 0，其余 7 等分（社区实测：8 次额外回合共享一次行动条）。
    near(e.distance,u.kit.params.Ultra[3]>1?10000*i/(u.kit.params.Ultra[3]-1):0,'初始倒计时按 0 + 7 等分分布');
  }
  const [first,...rest]=b.actionEvents;for(const event of rest)event.active=false;first.distance=0;
  u.policy.rotation=['skill'];b.sp=3;
  stepBattle(b);
  const inserted=b.log.find(e=>e.type==='action'&&e.actor===u.id&&e.kind==='extra');
  assert.equal(inserted?.key,'skill','倒计时插入应按队伍行动策略选择强化战技');
  assert.equal(inserted?.name,u.actions.enhancedSkill2.name,'插入强化战技需走真实动作替换路径');
  assert.equal(u.resources['卡厄斯兰那回合'],u.kit.params.Ultra[3]-1,'第一段倒计时后应剩7段');
  // 变身中普攻 / 战技被替换
  assert.equal(b.rules.prepare(b,u,'basic','normal',u.actions.basic).name,k.skills['140808'].name);
  assert.equal(b.rules.prepare(b,u,'skill','normal',u.actions.skill).name,k.skills['140811'].name);
});

test('白厄：第八个倒计时触发最后一击（960%攻击由敌方均分）并结束变身',()=>{
  const c=config([actor(1408)]);c.units=[c.units[0],enemy({id:'e1'}),enemy({id:'e2'})];
  const b=createBattle(c);const [u,e1,e2]=b.units;
  u.energy=12;b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[],[]);
  const atk=combatPanel(u).atk;
  const countdown=b.actionEvents.filter(e=>e.active);for(const e of countdown.slice(0,-1))e.active=false;
  countdown.at(-1).distance=0;u.resources['火种溢出']=2;u.energy=0;
  const n0=dmgOf(b,u.id,'direct').length;
  stepBattle(b);
  const hits=dmgOf(b,u.id,'direct').slice(n0);
  assert.equal(hits.length,2,'最后一击应对每名敌人各结算 1 段');
  assert.equal(u.kit.params.Ultra[3],8,'终结技应拥有 8 个额外回合');
  for(const ev of hits)near(baseOf(ev),atk*u.kit.params.Ultra[0]/2);
  assert.ok(!u.buffs.some(e=>e.tag==='phainonKhaos'),'最后一击后应变身结束');
  near(u.energy,Math.min(12,u.kit.trace[1][0]+2),'变身结束应返还行迹 3 点 + 溢出 2 点【火种】');
  void e1;void e2;
});

test('白厄：卡厄斯兰那强化普攻 250%/75%（2 段）并获得 2 点毁伤；支柱•死星天裁按毁伤结算',()=>{
  const b=createBattle(config([actor(1408),mate()]));const [u,m,en]=b.units,form=ROSTER_DATA[1408].skills['140805'].params['10'].param_list;
  u.energy=12;b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[],[]);
  const enh=ROSTER_DATA[1408].skills['140808'].params['6'].param_list;
  assert.deepEqual(u.actions.enhancedBasic.hitShares,[.3,.7]);
  b.rules.after(b,u,'basic','normal',u.actions.enhancedBasic,[en],[en]);
  assert.equal(u.resources['毁伤'],form[0]+enh[2]);
  // 支柱：消耗全部毁伤，每点 4 次 45%，达 4 点额外 450% 均分
  const nuke=ROSTER_DATA[1408].skills['140811'].params['10'].param_list;
  u.resources['毁伤']=4;
  const n0=dmgOf(b,u.id,'direct').length;
  b.rules.before(b,u,'skill','normal',u.actions.enhancedSkill2,[en]);
  const hits=dmgOf(b,u.id,'direct').slice(n0);
  const extra=hits.filter(e=>Math.abs(baseOf(e)-combatPanel(u).atk*nuke[0])<1e-6);
  assert.equal(hits.length,4*nuke[2]+1,'4 点毁伤应结算 16 次随机单体 + 1 次均分终结');
  assert.equal(extra.length,1);
  assert.equal(u.resources['毁伤'],0);
  void m;
});

test('白厄：E2 消耗 4 点以上毁伤获得额外回合、物理抗穿 +20%；E6 追加本次总伤害 36% 真实伤害',()=>{
  const b=createBattle(config([actor(1408,{eidolon:6}),mate()]));const [u,m,en]=b.units;
  u.energy=12;b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[],[]);
  near(b.rules.modifiers(b,u,en,u.actions.basic,'direct').resPen,u.kit.ranks[2][1]);
  u.resources['毁伤']=4;u.distance=10000;
  const n0=b.log.filter(e=>e.kind==='true').length;
  b.rules.before(b,u,'skill','normal',u.actions.enhancedSkill2,[en]);
  // 4.6 原始脚本 Avatar_Phainon_00_Skill22_Phase02 OnStart：ByRankActivated + _prev_energy 达标后
  // 执行 RPG.GameCore.TurnInsertAction（插入一个行动），不是行动提前；因此 E2 不能再推进倒计时行动条。
  const queued=b.queue.filter(q=>q.actor===u.id&&q.kind==='extra');
  assert.equal(queued.length,1,'E2 应插入 1 个额外回合');
  assert.ok(['basic','skill'].includes(queued[0].key),'插入回合应走卡厄斯兰那的强化动作选择');
  assert.equal(b.actionEvents.find(e=>e.active)?.distance,0,'E2 不应改变倒计时行动值（首个倒计时距离为 0）');
  assert.ok(b.log.filter(e=>e.kind==='true').length>n0,'E6 应追加真实伤害');
  const total=b.log.filter(e=>e.type==='damage'&&e.actor===u.id&&e.kind==='direct').reduce((s,e)=>s+e.damage,0);
  const td=b.log.filter(e=>e.kind==='true').at(-1);
  near(td.damage,total*u.kit.ranks[6][0]);
  void m;
});

test('白厄：灾厄•弑魂焚诏使敌方立即行动、按 Guard 回调分层，并在最后一个被标记敌人行动结束后立即反击',()=>{
  const c=config([actor(1408,{eidolon:4}),mate()]);c.units=[c.units[0],c.units[1],enemy({id:'e1'}),enemy({id:'e2'})];
  const b=createBattle(c);const [u,m,e1,e2]=b.units,counter=ROSTER_DATA[1408].skills['140809'].params['10'].param_list;
  u.energy=12;b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[],[]);
  u.resources['毁伤']=0;
  const n0=dmgOf(b,u.id,'direct').length;
  b.rules.before(b,u,'skill','normal',u.actions.enhancedSkill,[e1]);
  assert.equal(dmgOf(b,u.id,'direct').length,n0,'施放技能只提前敌方行动，不应在敌方行动前结算反击');
  const layers=1+u.kit.ranks[4][0];
  assert.equal(u.resources['弑魂之炽'],layers,'基础反击层数应含 E4 加层');
  assert.equal(e1.distance,0);assert.equal(e2.distance,0,'敌方全体应被立即拉到行动点');
  // Skill21_Phase02 OnStart：AddModifier(AllEnemy, M_Phainon_00_Skill21_Mark) → 施放时在场的全部敌人。
  assert.deepEqual([...(u.counterMarkIds??[])],[e1.id,e2.id],'施放时应把在场全部敌人记为待反击目标');
  // MAvatar_Phainon_00_Guard 的 OnAfterBeingAttacked 挂在 Guard 持有者（卡厄斯兰那）身上：
  // 只有本人被敌方攻击才 +1 层；队友受击不叠层。
  b.rules.attacked(b,m,e1);
  assert.equal(u.resources['弑魂之炽'],layers,'队友受击不应给卡厄斯兰那叠层');
  for(const unit of b.units)unit.distance=1e6;
  e1.distance=0;e2.distance=0;u.policy.basicOnly=true;   // 让随后的倒计时用强化普攻，保留毁伤断言
  assert.equal(stepBattle(b),true,'提前行动的敌人应实际执行一次战斗行动');
  // OnListenAfterAction：敌人行动结束且本回合没有通过「受击」叠层时 +1（受击路径只加一次）。
  assert.equal(u.resources['弑魂之炽'],layers+1,'一次敌人行动应恰好叠 1 层');
  assert.equal(u.resources['毁伤'],2,'应获得等同于敌人数的毁伤');
  assert.equal(dmgOf(b,u.id,'direct').length,n0,'仍有被标记的敌人未行动，不应提前结算反击');
  // 4.6 文本「上述敌方目标行动完毕后，立即发动反击」：最后一个被标记的敌人行动结束即由
  // TAvatar_Phainon_00_HitBackCheck → TurnInsertAbility(Skill21_Insert_Phase01) 结算，
  // 不等待卡厄斯兰那倒计时。
  const from=b.log.length;
  assert.equal(stepBattle(b),true,'第二名被标记的敌人应实际执行行动');
  assert.ok(!b.log.slice(from).some(e=>e.type==='action_event_start'),'反击不得等待卡厄斯兰那倒计时');
  const hits=b.log.slice(from).filter(e=>e.type==='damage'&&e.actor===u.id);
  assert.equal(hits.length,2+counter[2],'反击全体 + 4 次额外随机单体，且在敌方行动结算后立即发生');
  const expectedLayers=layers+2;
  const base=baseOf(hits[0]),aoe=hits.filter(e=>Math.abs(baseOf(e)-base)<1e-6);
  const bounce=hits.filter(e=>Math.abs(baseOf(e)-base*counter[3]/counter[0])<1e-6);
  assert.equal(aoe.length,2,'反击应对每名敌人各 1 段');
  assert.equal(bounce.length,counter[2],'四次随机弹射应使用相同层数倍率');
  near(baseOf(bounce[0]),baseOf(aoe[0])*counter[3]/counter[0],1e-6,'弹射段应与群攻段使用相同层数倍率');
  const counterEvent=b.log.find(e=>e.type==='mechanic'&&e.name==='灾厄•弑魂焚诏 · 反击');
  assert.equal(counterEvent.layers,expectedLayers,'两次敌人行动叠出的层数应保留到反击');
  assert.equal(u.resources['弑魂之炽'],0,'反击结算后应清空弑魂之炽');
  // 反击之后倒计时照常执行自己的行动，且不会重复结算反击。
  const fromEvent=b.log.length;
  assert.equal(stepBattle(b),true,'下一个卡厄斯兰那额外回合应开始');
  const eventStart=b.log.findIndex((e,i)=>i>=fromEvent&&e.type==='action_event_start'&&e.actor===u.id);
  const actionIndex=b.log.findIndex((e,i)=>i>=fromEvent&&e.type==='action'&&e.actor===u.id);
  assert.ok(eventStart>=0&&actionIndex>eventStart,'倒计时事件应实际执行行动');
  assert.equal(b.log.filter(e=>e.type==='mechanic'&&e.name==='灾厄•弑魂焚诏 · 反击').length,1,'反击只应结算一次');
  // 该额外回合按 basicOnly 走强化普攻 140808，结束后再获得 #3=2 点【毁伤】（天赋段）。
  assert.equal(u.resources['毁伤'],2+ROSTER_DATA[1408].skills['140808'].params['6'].param_list[2]);
  void e1;void e2;void m;
});

test('吉尔伽美什：段数与原始脚本一致（普攻 3 段 / 王之财宝 5 段 / 终结 10 次弹射 / 追加 4 段）',()=>{
  const u=actor(1509),p=u.kit.params,d=ROSTER_DATA[1509];
  assert.deepEqual(u.actions.basic.hitShares,ROSTER_DATA[1509].hits['Avatar_Gilgamesh_00_Skill01_Phase02']);
  assert.deepEqual(u.actions.skill.hitShares,[.1,.1,.2,.2,.4]);
  assert.equal(u.actions.skill.terms[1].target,'adjacent');
  assert.equal(u.actions.ultimate.bounceCount,p.Ultra[2]);
  near(u.actions.ultimate.bounceTerms[0].multiplier,p.Ultra[1]);
  assert.deepEqual(u.actions.followup.hitShares,[.2,.2,.2,.4]);
  assert.equal(u.actions.ultimate.energyCost,d.energyMax);
  assert.equal(u.actions.skill.spCost,0);
  // E6：弹射倍率 +80%
  const u6=actor(1509,{eidolon:6});
  near(u6.actions.ultimate.bounceTerms[0].multiplier,u6.kit.params.Ultra[1]*(1+u6.kit.ranks[6][0]));
});

test('吉尔伽美什：队友行动 +1 兴致（每点速度 +10%），达到 10 点进入【来兴致了！】且只能施放战技',()=>{
  const b=createBattle(config([actor(1509),mate()]));const [u,m]=b.units,T=u.kit.params.Talent;
  u.turns=5;
  const speed0=combatPanel(u).speed;
  b.rules.after(b,m,'basic','normal',m.actions.basic,[],[ ]);
  near(u.resources['兴致'],1);
  const sp=u.buffs.find(e=>e.tag==='gilgSpeed');
  assert.ok(sp);near(sp.value,T[3]);
  assert.ok(combatPanel(u).speed>speed0);
  for(let i=0;i<20;i++)b.rules.after(b,m,'basic','normal',m.actions.basic,[],[ ]);
  assert.equal(u.resources['来兴致了'],1,'兴致达到 10 点应进入【来兴致了！】');
  assert.equal(b.rules.shouldUseSkill(b,u),true,'【来兴致了！】下只能施放战技');
  // 施放战技后清空兴致
  u.resources['兴致']=T[1]+3;
  b.rules.after(b,u,'skill','normal',u.actions.skill,[],[ ]);
  assert.equal(u.resources['兴致'],0,'施放战技后应清空【兴致】');
  assert.equal(u.buffs.find(e=>e.tag==='gilgSpeed').value,0);
});

test('吉尔伽美什：战技获得【王来承认】无视 30% 防御（E1 全队生效 + 攻击 +60% + 回 40 能）',()=>{
  const b=createBattle(config([actor(1509),mate()]));const [u,m]=b.units,p=u.kit.params;
  b.rules.after(b,u,'skill','normal',u.actions.skill,[],[ ]);
  const c=u.buffs.find(e=>e.tag==='gilgCrown');
  assert.ok(c,'战技未获得【王来承认】');near(c.value,p.BPSkill[4]);assert.equal(c.remaining,p.BPSkill[5]);
  assert.ok(!m.buffs.some(e=>e.tag==='gilgCrownTeam'),'无 E1 时不应给队友');
  const b1=createBattle(config([actor(1509,{eidolon:1}),mate()]));const [s1,m1]=b1.units;
  s1.energy=0;
  b1.rules.after(b1,s1,'skill','normal',s1.actions.skill,[],[ ]);
  assert.ok(m1.buffs.some(e=>e.tag==='gilgCrownTeam'),'E1 应使【王来承认】对队友生效');
  near(s1.buffs.find(e=>e.tag==='gilgCrownAtk').value,s1.kit.ranks[1][0]);
  near(s1.energy,s1.kit.ranks[1][1],'E1 战技应额外回 40 能');
});

test('吉尔伽美什：队友施放终结技 →【王来背负】终结技增伤 40%/3 回合，行迹 +2 兴致并返还 30% 能量',()=>{
  const b=createBattle(config([actor(1509),mate({energyMax:120})]));const [u,m,en]=b.units;
  u.energy=0;
  b.rules.after(b,m,'ultimate','ultimate',{type:'Ultra',name:'测试终结',energyCost:120,terms:[]},[en],[en]);
  const carry=u.buffs.find(e=>e.tag==='gilgCarry');
  assert.ok(carry,'队友终结技应给【王来背负】');near(carry.value,u.kit.params.Talent[2]);
  assert.equal(carry.abilityType,'Ultra');
  near(u.resources['兴致'],1+u.kit.trace[1][0],'队友行动 +1，行迹队友终结技 +2');
  near(u.energy,120*u.kit.trace[1][1],'应返还本次消耗能量的 30%');
  // 行迹「英雄的孤傲」：每获得 1 点兴致暴伤 +25%（上限 6 层）
  near(u.buffs.find(e=>e.tag==='gilgCd').value,u.kit.trace[2][0]*Math.min(u.kit.trace[2][1],u.resources['兴致累计']));
});

test('吉尔伽美什：攻击计数达 8 触发连携追加攻击（全体 400% 雷伤 4 段），有 Saber 时追加 600% 风伤',()=>{
  const b=createBattle(config([actor(1509)]));const [u,en]=b.units,f=ROSTER_DATA[1509].skills['150905'].params['10'].param_list;
  b.queue.length=0;
  for(let i=0;i<7;i++)b.rules.after(b,u,'basic','normal',u.actions.basic,[en],[en]);
  assert.equal(b.queue.filter(q=>q.key==='followup').length,0,'7 次攻击不应触发');
  b.rules.after(b,u,'basic','normal',u.actions.basic,[en],[en]);
  assert.equal(b.queue.filter(q=>q.key==='followup').length,1,'第 8 次攻击应触发连携追加攻击');
  assert.equal(u.resources['攻击计数'],0);
  const n0=dmgOf(b,u.id,'followup').length;
  b.rules.after(b,u,'followup','followup',u.actions.followup,[en],[en]);
  const hits=dmgOf(b,u.id,'followup').slice(n0);
  assert.equal(hits.length,4,'连携追加攻击应为 4 段');
  const f05=ROSTER_DATA[1509].skills['150905'].params['10'].param_list;
  near(baseOf(hits[0]),combatPanel(u).atk*f05[0]*0.2);
  near(u.resources['兴致'],f05[2]);
});

test('吉尔伽美什：行迹「王霸的竞逐」使我方全体攻击 +20% / 暴伤 +20%，能量上限超出部分按 1%/点提高',()=>{
  const b=createBattle(config([actor(1509),mate({energyMax:240})]));const [u,m,en]=b.units,t=u.kit.trace[3];
  const over=Math.min(t[4],(m.energyMax-t[2])*t[3]);
  const out=combatPanel(m);
  near(out.critDmg,1+t[1]+over);
  near(out.atk,m.panel.baseStats.atk*(1+t[0]+over));
  void en;void u;
});

test('吉尔伽美什：E2 王之财宝主目标倍率 +100%、相邻 +50%，开场 +5 兴致、终结额外 +5',()=>{
  const b=createBattle(config([actor(1509,{eidolon:2})]));const [u,en]=b.units;
  near(u.resources['兴致'],u.kit.ranks[2][0],'E2 开场应给 5 点兴致');
  const prep=b.rules.prepare(b,u,'skill','normal',u.actions.skill);
  near(prep.terms[0].multiplier,u.kit.params.BPSkill[0]*(1+u.kit.ranks[2][2]));
  near(prep.terms[1].multiplier,u.kit.params.BPSkill[1]*(1+u.kit.ranks[2][3]));
  const before=u.resources['兴致'];
  b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[en],[en]);
  near(u.resources['兴致'],before+u.kit.trace[1][2]+u.kit.ranks[2][1],'终结技 +2（行迹）+5（E2）兴致');
});

test('吉尔伽美什：E6 队友终结技获得黄金律（上限 3），自身终结技消耗全部并提高终结技暴伤',()=>{
  const b=createBattle(config([actor(1509,{eidolon:6}),mate()]));const [u,m,en]=b.units;
  b.rules.after(b,m,'ultimate','ultimate',{type:'Ultra',name:'测试终结',energyCost:120,terms:[]},[en],[en]);
  near(u.resources['黄金律'],1);
  for(let i=0;i<5;i++)b.rules.after(b,m,'ultimate','ultimate',{type:'Ultra',name:'测试终结',energyCost:120,terms:[]},[en],[en]);
  near(u.resources['黄金律'],u.kit.ranks[6][2],'黄金律上限应为 3');
  b.rules.before(b,u,'ultimate','ultimate',u.actions.ultimate,[en]);
  near(u.resources['黄金律'],0,'自身终结技应消耗全部黄金律');
  near(b.rules.modifiers(b,u,en,{type:'Ultra',element:'Thunder'},'direct').critDmg,u.kit.ranks[6][2]*u.kit.ranks[6][3]);
  near(b.rules.modifiers(b,u,en,{type:'Normal',element:'Thunder'},'direct').resPen,u.kit.ranks[6][1],'E6 全队抗穿 +20%');
});

test('吉尔伽美什：E4 能量恢复效率 +20%',()=>{
  const b=createBattle(config([actor(1509,{eidolon:4})]));const [u]=b.units;
  near(u.buffs.find(e=>e.tag==='gilgE4').value,u.kit.ranks[4][0]);
  // 引擎的 energy() 按 combatPanel(u).energyRegen 结算回能，因此面板效率即为回能系数。
  near(combatPanel(u).energyRegen,1+u.kit.ranks[4][0]);
});

test('吉尔伽美什：秘技对敌方全体造成 200% 攻击力雷伤并获得 3 点兴致',()=>{
  const b=createBattle(config([actor(1509,{technique:true})]));const [u]=b.units;
  const tech=dmgOf(b,u.id,'technique');
  assert.equal(tech.length,1);
  near(baseOf(tech[0]),combatPanel(u).atk*u.kit.params.Maze[1]);
  near(u.resources['兴致'],u.kit.params.Maze[2]);
});

test('第17批 7 名角色与既有四人体系混编可完成组件试算（已知缺口角色显式近似）',()=>{
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

test('第17批 角色在多波次组件试算中处理换波 / 阵亡 / 忆灵续存（缺口保留并显式披露）',()=>{
  for(const id of IDS){
    const x=actor(id,{eidolon:6}),ar=actor(1015),s=actor(1306),ce=actor(1412);
    x.id='focus';x.energy=x.energyMax??0;x.policy={...x.policy,autoUltimate:true,allyTargetId:ar.id};
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

test('白厄：天赋「此身为炬」被队友技能指定时 +1 火种并 +30% 暴伤；行迹「身承炎炬万千」受队友治疗增伤 45%、受队友回能 +1 火种',()=>{
  const b=createBattle(config([actor(1408),mate(),mate({id:'second-mate'})]));const [u,m,secondMate,en]=b.units;
  const e0=u.energy;
  b.rules.before(b,m,'basic','normal',m.actions.basic,[u]);
  near(u.energy,e0+1,'被队友技能指定应 +1【火种】');
  near(u.buffs.find(e=>e.id===u.id+':talent-cd').value,u.kit.params.Talent[0]);
  b.rules.before(b,secondMate,'basic','normal',secondMate.actions.basic,[u]);
  near(u.energy,e0+2,'同一全局回合内第二名队友再次指定白厄，也应再得1点火种');
  // 行迹 point07：队友治疗
  b.log.push({type:'heal',actor:m.id,target:u.id,amount:100,av:b.av});
  b.rules.after(b,m,'basic','normal',m.actions.basic,[u],[u]);
  near(u.buffs.find(e=>e.tag==='phainonTrace7').value,u.kit.trace[2][0]);
  near(b.rules.modifiers(b,u,en,{type:'Normal',element:'Physical'},'direct').dmgBoost,u.kit.trace[2][0]);
  // 行迹 point07：队友回能
  b.activeAction={sequence:99,actor:m.id};
  const e1=u.energy;u.energy=0;
  b.log.push({type:'energy',actor:u.id,amount:10,av:b.av});
  b.rules.after(b,m,'basic','normal',m.actions.basic,[u],[u]);
  near(u.energy,u.kit.trace[2][2],'受队友回能应 +1【火种】');
  void e1;
});

test('白厄：行迹「身承炎炬万千」冷却按自身回合 u.turns 而非全局回合 b.turns',()=>{
  const b=createBattle(config([actor(1408),mate(),mate({id:'mate2'})]));const [u,m1,m2,en]=b.units;
  const NAME='身承炎炬万千';
  // 以日志中的 buff 施加次数作为「触发」计数（buff() 会 record type:'buff'）。
  const applied=()=>b.log.filter(e=>e.type==='buff'&&e.name===NAME&&e.target===u.id).length;
  // 构造「白厄自身第 5 回合、全局第 7 回合」：其间其他单位已行动，两个计数器必然不同。
  b.turns=7;u.turns=5;
  // 同一全局回合内，两名不同队友分别提供治疗 → 单个回合内只应触发 1 次。
  for(const m of [m1,m2]){
    b.log.push({type:'heal',actor:m.id,target:u.id,amount:100,av:b.av});
    b.rules.after(b,m,'basic','normal',m.actions.basic,[u],[u]);
  }
  assert.equal(applied(),1,'同一全局回合内不应重复触发「身承炎炬万千」');
  assert.equal(b.turns,7,'两次支援之间全局回合计数不应变化');
  near(u.buffs.find(e=>e.tag==='phainonTrace7').value,u.kit.trace[2][0]);
  // 关键判别：冷却键必须记白厄自身回合（u.turns=5），而不是全局回合（b.turns=7）。
  assert.equal(u.resources['支援扫描回合'],u.turns,'冷却回合应记录 u.turns');
  assert.notEqual(u.resources['支援扫描回合'],b.turns,'冷却回合不应记录全局 b.turns');
  // 白厄自身回合边界（u.turns→6）时全局回合 b.turns 保持不变 → 冷却重置，新支援应重新触发。
  u.turns=6;
  b.log.push({type:'heal',actor:m1.id,target:u.id,amount:100,av:b.av});
  b.rules.after(b,m1,'basic','normal',m1.actions.basic,[u],[u]);
  assert.equal(applied(),2,'白厄自身回合结束后，新的队友治疗应可再次触发');
  assert.equal(b.turns,7,'再次触发不应依赖全局回合前进');
  void en;
});

test('记忆开拓者：E2 其他我方忆灵行动时开拓者回 8 能；E4 能量上限为 0 的队友施放技能使迷迷 +3% 充能',()=>{
  const b=createBattle(config([actor(8007,{eidolon:4}),mate({energyMax:0})]));const [u,m,en]=b.units;
  b.rules.before(b,u,'skill','normal',u.actions.skill,[u]);
  const s=memOf(b,u);s.resources['充能']=0;
  u.energy=0;u.resources['E2触发回合']=-1;
  // 普通队友（能量上限 0）施放技能 → 只有 E4 生效（+3% 充能）
  b.rules.after(b,m,'basic','normal',m.actions.basic,[en],[en]);
  near(u.energy,0,'E2 只应在我方忆灵行动时回能');
  near(s.resources['充能'],u.kit.ranks[4][0]*100,'E4：能量上限 0 的队友施放技能 → 迷迷 +3% 充能');
  // E2：其他我方忆灵行动回 8 能（每回合 1 次）
  const own=mate();own.id='other';
  const b2=createBattle(config([actor(8007,{eidolon:2}),own,mate({energyMax:0})]));
  const [u2,own2,m2,en2]=b2.units;
  b2.rules.before(b2,u2,'skill','normal',u2.actions.skill,[u2]);
  u2.energy=0;u2.resources['E2触发回合']=-1;
  m2.memospriteOwner=own2.id;                 // 把第三名木桩当作另一名召唤者的忆灵
  b2.rules.after(b2,m2,'basic','normal',m2.actions.basic,[en2],[en2]);
  near(u2.energy,u2.kit.ranks[2][0],'E2：其他忆灵行动应回 8 能');
  b2.rules.after(b2,m2,'basic','normal',m2.actions.basic,[en2],[en2]);
  near(u2.energy,u2.kit.ranks[2][0],'E2 每回合只应触发 1 次');
});

test('万敌：秘技造成 80% 生命上限全体伤害、使敌方全体陷入嘲讽并积攒 50 点充能',()=>{
  const c=config([actor(1404,{technique:true})]);c.units=[c.units[0],enemy({id:'e1'}),enemy({id:'e2'})];
  const b=createBattle(c);const [u,e1,e2]=b.units,p=u.kit.params;
  const tech=dmgOf(b,u.id,'technique');
  assert.equal(tech.length,2);
  for(const ev of tech)near(baseOf(ev),combatPanel(u).hp*p.Maze[1]);
  assert.ok(e1.buffs.some(e=>e.tag==='mydeimosTaunt')&&e2.buffs.some(e=>e.tag==='mydeimosTaunt'));
  near(u.resources['充能'],p.Maze[4]);
});

console.log(`DeepSeek batch17 checks: ${passed} passed, ${failed} failed.`);if(failed)process.exitCode=1;
