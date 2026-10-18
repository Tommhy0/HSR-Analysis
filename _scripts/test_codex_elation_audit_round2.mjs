// 欢愉审计第二轮：1505 / 1512 / 1513 的已确证缺口。
// 来源：4.6 hsr_core 技能文本 + Avatar_Evanescia/Avatar_RobinS Ability 脚本。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createContext} from '../core/ctx.mjs';
import {newBattleBuild,buildBattleActor} from '../simulator/builds.mjs';
import {createBattle as rawCreateBattle,receiveDamage,stepBattle,combatPanel} from '../simulator/engine.mjs';
import {partialMechanicsFixture} from './partial-mechanics-fixtures.mjs';
import {ROSTER_DATA} from '../simulator/roster-data.mjs';
import {BREAK_BASE} from '../simulator/game-data.mjs';
import {KNOWN_MECHANICS_GAPS} from '../simulator/mechanics-status.mjs';
import {validateBattle} from '../simulator/engine.mjs';
const data=JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url))),ctx=createContext(data);
const createBattle=c=>rawCreateBattle(partialMechanicsFixture(c));
const near=(a,b,m=1e-6,msg)=>{if(typeof m!=='number'){msg=m;m=1e-6;}assert.ok(Math.abs(a-b)<m,`${a} != ${b}${msg?' ('+msg+')':''}`);};
const panel=()=>({hp:10000,atk:1000,def:1000,speed:100,critRate:.5,critDmg:1,energyRegen:1,effectHit:0,effectRes:0,breakEffect:0,baseStats:{hp:1000,atk:1000,def:1000},elemDmg:{}});
const actor=(id,extra={})=>{const a=buildBattleActor(ctx,{...newBattleBuild(),characterId:id,relicAuto:false,panel:panel(),...extra});a.energy=0;a.policy={...a.policy,autoUltimate:false};return a;};
const enemy=(extra={})=>({id:'enemy',name:'规则训练敌人',side:'enemy',level:90,element:'Physical',panel:{...panel(),hp:1e9,speed:1},energy:0,energyMax:0,res:{},
  actions:{basic:{name:'测试攻击',type:'Normal',terms:[{scaling:'atk',multiplier:1}],hitEnergy:10}},policy:{autoUltimate:false,basicOnly:true},...extra});
const mate=(extra={})=>({id:'mate',name:'测试队员',side:'ally',level:80,element:'Physical',panel:{...panel(),speed:1},energy:0,energyMax:100,
  actions:{basic:{name:'测试普攻',type:'Normal',terms:[{scaling:'atk',multiplier:1}],spGain:1,energyGain:20,toughness:30}},policy:{autoUltimate:false,basicOnly:true},...extra});
const config=(units,en=null,maxAV=201)=>({strict:true,maxAV,sp:3,maxSP:9,seed:42,critMode:'noncrit',units:[...units,en??enemy()]});
const memOf=(b,owner)=>b.units.find(t=>t.memospriteOwner===owner.id);
const tagOf=(u,name)=>u.buffs.find(e=>e.tag===name);
function fever(b,self){
  // 151202：首次战技只召唤；第二次 +6；第三次才达到 12 点进入 Fever。
  b.rules.after(b,self,'skill','normal',self.actions.skill,[self],[]);
  b.rules.after(b,self,'skill','normal',self.actions.skill,[self],[]);
  b.rules.after(b,self,'skill','normal',self.actions.skill,[self],[]);
  assert.ok(self.buffs.some(e=>e.tag==='fever'),'三次战技后应进入 Fever');
}
let passed=0,failed=0;const test=(name,fn)=>{try{fn();passed++;console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+'\n'+e.stack);}};

test('1505 欢愉技 150520：施放后获得 #1=5 点好活当赏（E0，不叠加 E1）',()=>{
  const b=createBattle(config([actor(1505)]));const [u]=b.units;
  u.resources['好活当赏']=0;
  b.rules.after(b,u,'elation','normal',u.actions.elation,[b.units.at(-1)],[]);
  const row=ROSTER_DATA[1505].skills['150520'].params['10'].param_list;
  near(u.resources['好活当赏'],row[0],'150520 #1 基础好活当赏');
});

test('1512 行迹 point06：气氛增益落在触发者身上，而不是队伍第一个队友',()=>{
  const b=createBattle(config([actor(1512),mate(),mate({id:'mate2'})]));
  const [self,a1,a2,en]=b.units;
  b.rules.after(b,a2,'basic','normal',a2.actions.basic,[en],[en]);
  const id=self.id+':trace6-cd';
  assert.ok(a2.buffs.some(e=>e.id===id),'触发气氛的 mate2 应获得偏离和弦');
  assert.ok(!a1.buffs.some(e=>e.id===id),'未触发气氛的 mate 不应获得');
});

test('1512 行迹 point08：知更鸟本人也获得 +50% 暴击率（不再只加给乐手）',()=>{
  const b=createBattle(config([actor(1512)]));const [self]=b.units;
  const withTrace=combatPanel(self).critRate;
  delete self.kit.trace['3'];
  const without=combatPanel(self).critRate;
  near(withTrace-without,0.5,'重构谐乐应同时作用于知更鸟本人');
});

test('1512 行迹 point07：受到队友治疗获得 12 层律动，上限 12',()=>{
  const healer=mate();
  healer.actions.skill={name:'治疗',type:'BPSkill',target:'allies',terms:[],spCost:0,energyGain:0,
    effects:[{type:'heal',target:'allies',scaling:'hp',multiplier:0.1},{type:'heal',target:'allies',scaling:'hp',multiplier:0.1}]};
  const b=createBattle(config([actor(1512),healer]));
  const [self]=b.units;
  b.queue.push({actor:healer.id,key:'skill',kind:'extra',targetId:healer.id});
  assert.equal(stepBattle(b),true);
  // 后续知更鸟自己的回合可能合法消耗 1 层并回能，因此按授予日志核对层数与上限。
  const grants=b.log.filter(e=>e.type==='mechanic'&&e.name==='即兴蓝调 · 律动');
  assert.ok(grants.length>0,'受到队友治疗后应获得律动');
  assert.equal(Math.max(...grants.map(e=>e.stacks)),12,'两次治疗也只到 12 层上限');
  assert.ok(grants.every(e=>e.stacks<=12),'律动不得超过 12 层');
});

test('1512 Fever：解除所有控制类负面状态，并免疫后续控制',()=>{
  const b=createBattle(config([actor(1512)]));const [self]=b.units;
  self.buffs.push({id:'stun-test',name:'眩晕',key:'stun',value:0,control:'stun',debuff:true});
  self.dots.push({id:'dot-control',name:'控制持续伤害',control:'stun',value:1,debuff:true});
  fever(b,self);
  assert.ok(!self.buffs.some(e=>e.control),'进入 Fever 应解除所有控制');
  assert.ok(!self.dots.some(e=>e.control),'控制类持续伤害也应解除');
  assert.equal(combatPanel(self).controlRes,1,'Fever 期间应免疫控制');
  const foe=b.units.find(u=>u.side==='enemy');
  foe.actions.basic.effects=[{type:'buff',name:'眩晕',key:'stun',value:0,duration:1,control:'stun',debuff:true}];
  b.queue.push({actor:foe.id,key:'basic',kind:'extra',targetId:self.id});
  const n=b.log.length;stepBattle(b);
  const ev=b.log.slice(n);
  assert.ok(ev.some(e=>e.type==='resist'&&e.actor===self.id),'Fever 期间应记录控制免疫');
  assert.ok(!self.buffs.some(e=>e.control),'Fever 期间不应被施加控制');
});

test('1512 Fever：知更鸟自己的回合被跳过',()=>{
  const b=createBattle(config([actor(1512)]));const [self]=b.units;
  fever(b,self);
  for(const u of b.units)u.distance=100000;
  self.distance=0;
  const n=b.log.length;stepBattle(b);
  const ev=b.log.slice(n);
  assert.ok(ev.some(e=>e.type==='skip'&&e.actor===self.id),'Fever 期间知更鸟的回合应被跳过');
  assert.ok(!ev.some(e=>e.type==='action'&&e.actor===self.id),'跳过回合时不应执行动作');
});

test('1512 E1：忆灵在真实 normal 回合也能结算记录伤害',()=>{
  const b=createBattle(config([actor(1512,{eidolon:1}),mate()]));
  const [self,m,en]=b.units;
  fever(b,self);
  const band=memOf(b,self);assert.ok(band);
  receiveDamage(b,m,en,1000,'direct');
  assert.ok((self.resources['晴空乐手记录伤害']??0)>0,'E1 应记录队友伤害');
  const n0=b.log.length;
  b.rules.after(b,band,'basic','normal',band.actions.basic,[en],[en]);
  assert.ok(b.log.slice(n0).some(e=>e.type==='damage'&&e.kind==='true'&&e.actor===band.id),
    'normal 回合应触发 E1 记录真实伤害（旧实现只接受 extra）');
});

test('1512 特邀嘉宾：持有者的召唤物攻击也额外 +2 气氛值',()=>{
  const b=createBattle(config([actor(1512),mate()]));
  const [self,m]=b.units;
  m.buffs.push({id:self.id+':guest',name:'特邀嘉宾',key:'marker',value:0,tag:'robinGuest'});
  const before=self.resources['气氛值'];
  const bandLike={id:'guest-band',name:'客人忆灵',side:'ally',level:80,element:'Physical',panel:panel(),memospriteOwner:m.id,buffs:[]};
  // rules.after 的第二个参数是**行动者**，不是模块持有者。
  b.rules.after(b,bandLike,'basic','normal',{name:'忆灵技',type:'Talent'},[bandLike],[b.units.at(-1)]);
  near(self.resources['气氛值']-before,1+self.kit.params.Ultra[1],'基础1点 + 特邀嘉宾召唤物2点');
});

test('1512 Fever：知更鸟与乐手伤害提高 84% + 气氛值×2.8%',()=>{
  const b=createBattle(config([actor(1512)]));
  const [self]=b.units;
  fever(b,self);
  const foe=b.units.find(x=>x.side==='enemy');
  const row=data.characters.find(c=>c.id===1512).memosprite.skills['1151203'].level['10'].param_list;
  near(b.rules.modifiers(b,self,foe,{type:'Normal'},'direct').dmgBoost,row[0]+self.resources['气氛值']*row[1]);
  const band=memOf(b,self);
  near(b.rules.modifiers(b,band,foe,{type:'Normal'},'direct').dmgBoost,row[0]+self.resources['气氛值']*row[1],'乐手同样吃到 Fever 增伤');
});

test('1512 Fever：乐手从满行动条开始',()=>{
  const b=createBattle(config([actor(1512)]));
  const [self]=b.units;
  fever(b,self);
  const band=memOf(b,self);
  assert.equal(band.distance,10000,'进入 Fever 应 ResetActionDelay');
});

test('1512 特邀嘉宾：持有者不能使其他友方行动提前，自己的提前仍生效',()=>{
  const guest=mate();
  guest.actions.skill={name:'提前',type:'BPSkill',target:'allies',terms:[],spCost:0,energyGain:0,
    effects:[{type:'advance',target:'allies',value:0.5}]};
  const other=mate({id:'mate2'});
  const b=createBattle(config([actor(1512),guest,other]));
  const [self,g,o]=b.units;
  g.buffs.push({id:self.id+':guest',name:'特邀嘉宾',key:'marker',value:0,tag:'robinGuest',blockAllyAdvance:true});
  for(const u of b.units)u.distance=100000;
  const beforeG=g.distance,beforeO=o.distance;
  b.queue.push({actor:g.id,key:'skill',kind:'extra',targetId:g.id});
  stepBattle(b);
  assert.equal(o.distance,beforeO,'其他友方不应获得行动提前');
  assert.ok(g.distance<beforeG,'持有者自己的行动提前仍生效');
  assert.ok(b.log.some(e=>e.type==='mechanic'&&e.name==='阻止友方行动提前'),'应记录被白名单拦截');
});

test('1502 大吉大利：笑点基数固定取爻光的 ElationEchoPoint，而非攻击者',()=>{
  const run=(own,matePunch)=>{
    const b=createBattle(config([actor(1502),mate()]));
    const [u,m,en]=b.units;
    u.resources['好活当赏']=own;m.resources['好活当赏']=matePunch;
    u.resources['大吉大利动作']=-2;
    b.rules.after(b,m,'basic','normal',m.actions.basic,[en],[en]);
    const hit=b.log.find(e=>e.type==='damage'&&e.kind==='elation');
    assert.ok(hit,'持有好活当赏时队友攻击应触发大吉大利');
    assert.ok(b.log.some(e=>e.type==='mechanic'&&e.name==='大吉大利'),'应记录大吉大利触发');
    // 欢愉度取攻击者与爻光中较高者；本题爻光的行迹使其更高。
    return {value:hit.formula.find(f=>f.zone==='base').value,elation:Math.max(combatPanel(u).elation??0,combatPanel(m).elation??0)};
  };
  const one=run(1,100),hundred=run(100,0);
  const base=(punch,el)=>BREAK_BASE[80]*2*(1+el)*(1+5*punch/(punch+240))*(ROSTER_DATA[1502].skills['150204'].params['10'].param_list[0]);
  near(one.value,base(1,one.elation),'爻光只有1点时不得读取攻击者的100点');
  near(hundred.value,base(100,hundred.elation),'爻光有100点时应使用100点');
});

test('1502 大吉大利：欢愉技施放后同样触发（OnAfterAttack 未排除伤害类型）',()=>{
  const b=createBattle(config([actor(1502)]));
  const [u,en]=b.units;
  u.resources['好活当赏']=10;u.resources['大吉大利动作']=-2;
  b.rules.after(b,u,'elation','normal',u.actions.elation,[en],[en]);
  assert.ok(b.log.some(e=>e.type==='mechanic'&&e.name==='大吉大利'),
    '欢愉技施放后应触发一次大吉大利');
});

test('1502 已从严格阻断名单移除，四人严格校验通过',()=>{
  assert.equal(KNOWN_MECHANICS_GAPS[1502],undefined,'1502 不应再出现在严格阻断名单');
  const cfg=config([actor(1502),mate(),mate({id:'mate2'}),mate({id:'mate3'})]);
  assert.deepEqual(validateBattle(cfg),[],'1502 四人编队应通过严格校验');
});

test('1503 E6：深度学习期间我方全属性抗穿 +20% 走 modifiers 而非 panel',()=>{
  const b=createBattle(config([actor(1503,{eidolon:6}),mate()]));
  const [u,m,en]=b.units;
  u.resources['深度学习充能']=1;
  near(b.rules.modifiers(b,m,en,{type:'ElationDamage'},'elation').resPen,u.kit.ranks[6][0]);
  u.resources['深度学习充能']=0;
  assert.equal(b.rules.modifiers(b,m,en,{type:'ElationDamage'},'elation').resPen??0,0);
});

test('1503 欢愉技：插入施放（kind=extra）同样发放下一次攻击票',()=>{
  const b=createBattle(config([actor(1503),mate()]));
  const [u,m,en]=b.units;
  b.rules.after(b,u,'elation','extra',u.actions.elation,[en],[]);
  assert.ok(m.resources['真珠欢愉技待触发'],'队友应获得攻击票');
  assert.ok(u.resources['真珠欢愉技待触发'],'真珠自己也应获得攻击票');
});

test('8009 向真珠发放好活当赏时按 1503 上限 50 截断',()=>{
  const b=createBattle(config([actor(8009),actor(1503)]));
  const u=b.units.find(x=>x.characterId===8009),to=b.units.find(x=>x.characterId===1503);
  to.resources['好活当赏']=45;
  b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[to],[]);
  assert.equal(to.resources['好活当赏'],50,'超出 1503 上限的部分不得发放');
  const batch=to.buffs.filter(e=>e.tag==='punchline').at(-1);
  assert.ok(batch,'应生成好活当赏批次');
  assert.equal(batch.stacks,5,'批次层数应与实际上限后的增量一致');
});

test('1503 已从严格阻断名单移除，四人严格校验通过',()=>{
  assert.equal(KNOWN_MECHANICS_GAPS[1503],undefined,'1503 不应再出现在严格阻断名单');
  const cfg=config([actor(1503),mate(),mate({id:'mate2'}),mate({id:'mate3'})]);
  assert.deepEqual(validateBattle(cfg),[],'1503 四人编队应通过严格校验');
});

test('1512 已从严格阻断名单移除，四人严格校验通过',()=>{
  assert.equal(KNOWN_MECHANICS_GAPS[1512],undefined,'1512 不应再出现在严格阻断名单');
  const cfg=config([actor(1512),mate(),mate({id:'mate2'}),mate({id:'mate3'})]);
  assert.deepEqual(validateBattle(cfg),[],'1512 四人编队应通过严格校验');
});

console.log(`Elation audit round 2: ${passed} passed, ${failed} failed.`);
if(failed)process.exitCode=1;
