import assert from 'node:assert/strict';
import fs from 'node:fs';
import {handleRequest} from '../hsr_server.mjs';
import {declarationNames} from './bundle-exports.mjs';
import {createContext} from '../core/ctx.mjs';
import {collectBuffs,aggregate} from '../core/buffs.mjs';
import {buffsFromSelections,blockedReason} from '../core/catalog.mjs';
import {matchAttr} from '../core/attr.mjs';
import {buildComparison,loadScenario} from '../core/scenario.mjs';
import {validatePanel} from '../core/panel.mjs';
import {newBattleBuild,buildBattleActor} from '../simulator/builds.mjs';
import {createBattle,simulateBattle,stepBattle,combatPanel,validateBattle,battleFrame} from '../simulator/engine.mjs';
import {battleStatistics} from '../simulator/stats.mjs';
import {replayAt} from '../simulator/replay.mjs';
import {outsideBonuses} from '../simulator/config-import.mjs';
import {mountBattleReplay} from '../ui/battle-replay.mjs';
import {renderSimulator} from '../ui/simulator-view.mjs';
import {partialMechanicsFixture} from './partial-mechanics-fixtures.mjs';
const data=JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url))),ctx=createContext(data);
const panel=()=>({hp:10000,atk:1000,def:1000,speed:100,critRate:.5,critDmg:1,energyRegen:1,effectHit:0,effectRes:0,breakEffect:0,baseStats:{hp:1000,atk:1000,def:1000},elemDmg:{}});
const actor=(id,extra={})=>{const a=buildBattleActor(ctx,{...newBattleBuild(),characterId:id,relicAuto:false,panel:panel(),...extra});a.energy=0;a.policy={...a.policy,autoUltimate:false};return a;};
const dummy=(id='mate',side='ally')=>({id,name:id,side,level:80,element:'Physical',panel:{...panel(),hp:side==='enemy'?1e9:10000,speed:1},energy:0,energyMax:100,res:{},actions:{basic:{name:'测试普攻',type:'Normal',target:'single',terms:[{scaling:'atk',multiplier:1}],hitShares:[1],toughness:0,spGain:1}},policy:{autoUltimate:false,basicOnly:true}});
const config=(units,maxAV=200)=>({strict:false,maxAV,sp:5,maxSP:9,seed:42,critMode:'noncrit',units:[...units,dummy('enemy','enemy')]});
const battle=(units,maxAV)=>createBattle(partialMechanicsFixture(config(units,maxAV)));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
let passed=0,failed=0;
const test=(name,fn)=>{try{fn();passed++;console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+'\n'+e.stack);}};
const force=(b,u,key='basic',targetId)=>{for(const t of b.units)t.distance=10000;for(const s of b.summons)s.distance=10000;u.distance=0;u.policy={...u.policy,turnPlan:[{turn:u.turns+1,key,...(targetId?{targetId}:{})}]};stepBattle(b);};
// DOM fixture exercises both renderers and their actual event handlers.
const nodes=new Map();
const node=id=>{if(!nodes.has(id))nodes.set(id,{id,innerHTML:'',value:'',textContent:'',style:{},dataset:{},querySelectorAll:()=>[],querySelector:key=>node(id+key),setAttribute(){},contains:()=>false,insertAdjacentHTML(){}});return nodes.get(id);};
globalThis.document={getElementById:node,addEventListener(){},documentElement:node('root')};
globalThis.window=globalThis;globalThis.addEventListener=()=>{};globalThis.location={hash:'',search:''};globalThis.__HSR_DATA__=data;

test('001: collect every exported variable without reading initializer commas',()=>{
  near(declarationNames('a=[],b={x:[1,2]},c=(x,y)=>[x,y],d=/a,b/;',0).length,4);
  assert.deepEqual(declarationNames('a="x,y", /* , */ b=`x,y`, c=1;',0),['a','b','c']);
});
test('002/005: annotations have one route; unsupported flat damage cannot bypass the catalog',()=>{
  const auto=collectBuffs(ctx,{characterId:1412,lightconeId:23048,superimpose:{23048:1},annotations:data.annotations});
  const picks=buffsFromSelections(ctx,data.buffCatalog,new Set(['lc.23048.b3']),{}, {characterId:1412});
  assert.ok(picks.active.length);assert.ok(!auto.active.some(b=>picks.active.some(s=>s.id===b.id)));
  near(picks.active[0].value,.54);
  const bare={...ctx,data:{...ctx.data,buffCatalog:[]}};
  assert.ok(!collectBuffs(bare,{characterId:1001,lightconeId:21030,superimpose:{21030:1},annotations:data.annotations}).active.some(b=>b.id==='lc.21030.b2'));
});
test('006/007/032: enemy stats, action triggers and selected stacks stay separate',()=>{
  const a=aggregate([{key:'atkPct',value:.1,side:'enemy'},{key:'dmgBoost',value:.1,condition:{trigger:'on_终结技'}},{key:'critDmg',value:.2,condition:{stacks:true},stacks:3}],{ability:{type:'Normal'}});
  near(a.atkPct,0);near(a.dmgBoost,0);near(a.critDmg,.6);near(a._skipped.length,2);
  near(aggregate([{key:'dmgBoost',value:.1,condition:{trigger:'on_终结技'}}],{ability:{type:'Ultra'}}).dmgBoost,.1);
});
test('008: follow-up vulnerability and Assist never become universal skill bonuses',()=>{
  const follow=matchAttr('追加攻击的暴击伤害提高#1[i]%');assert.deepEqual(follow.scope.abilityTypes,['FollowUp']);
  const vuln=matchAttr('【猎物】受到的追加攻击伤害提高#1[i]%');assert.equal(vuln.key,'vuln');assert.equal(vuln.side,'enemy');
  const assist=matchAttr('助战技造成的伤害提高#1[i]%');assert.deepEqual(assist.scope.abilityTypes,['Assist']);
  assert.equal(blockedReason({scope:assist.scope},{}),'unmodelled_ability');
});
test('009: summon ownership buffs belong to its summoner, independently of bondmate',()=>{
  const b=battle([actor(1414,{technique:true,relicSets:[{id:318,count:2}]}),actor(1306,{relicSets:[{id:318,count:2}]})]);
  const [u,m]=b.units;b.summons[0].bondmate=m.id;
  near(combatPanel(u).critDmg,1+.16+.32);near(combatPanel(m).critDmg,1+.16);
});
test('011: comparison merges named zones using the worst provenance',()=>{
  const agg={...aggregate([]),_zones:{dmgBoost:{level:'unknown',missing:['missing source']}}};
  const ability={type:'Normal',element:'Physical',terms:[{scaling:'atk',multiplier:1}]};
  const r=buildComparison(ctx,{loadouts:[{label:'a',panel:panel(),ability,agg},{label:'b',panel:panel(),ability,agg:aggregate([])}]});
  assert.equal(r.coverage.overall,'unknown');assert.ok(r.coverage.missing.includes('missing source'));assert.ok(!('0' in r.coverage.zones));
});
test('003/004: runtime memosprites and Aha render; damage and replay totals agree',()=>{
  for(const id of [1407,1409,1413,1415,1512,1501]){
    const a=actor(id,{technique:true}),r=simulateBattle(partialMechanicsFixture(config([a],160)));
    assert.equal(battleStatistics(r).reduce((n,x)=>n+x.damage,0),r.damage);
    near(replayAt(r,r.log.length-1).totals.ally,r.damage);
    mountBattleReplay({host:node('replay-'+id),result:r,playback:{cursor:r.log.length-1}}).dispose();
    renderSimulator({host:node('sim-'+id),state:{config:r.config,result:r},requireFour:false});
  }
  const b=battle([actor(1407)]),u=b.units[0];b.rules.before(b,u,'summonDragon','extra',u.actions.summonDragon,[u]);
  const s=b.units.find(t=>t.memospriteOwner===u.id);force(b,s);
  const r={config:b.config,units:battleFrame(b).units,log:b.log};assert.ok(battleStatistics(r)[0].damage>0);
  const frame=battleFrame(b).units.find(t=>t.id===s.id);assert.equal(frame.owner,u.id);assert.equal(frame.side,'ally');
});
test('012: Misha E6 applies during the ultimate and survives other units ending turns',()=>{
  const b=battle([actor(1312,{eidolon:6}),dummy()]),[u,m,en]=b.units;
  b.rules.before(b,u,'ultimate','ultimate',u.actions.ultimate,[en]);
  assert.ok(u.buffs.some(e=>e.name==='米沙 E6 · 增伤'));
  b.rules.onTurnEnd(b,m);assert.ok(u.buffs.some(e=>e.name==='米沙 E6 · 增伤'));
  b.rules.onTurnEnd(b,u);assert.ok(!u.buffs.some(e=>e.name==='米沙 E6 · 增伤'));
});
test('013: self-inflicted breaks grant energy once per break event',()=>{
  const b=battle([actor(8006)]),[u,en]=b.units;u.energy=0;
  b.log.push({type:'break',target:en.id,index:b.log.length});
  b.rules.afterDamage(b,u,en,'break');const first=u.energy;assert.ok(first>0);
  for(let i=0;i<5;i++){b.log.push({type:'probe'});b.rules.afterDamage(b,u,en,'direct');}
  near(u.energy,first);
  b.log.push({type:'break',target:en.id,index:b.log.length});b.rules.afterDamage(b,u,en,'break');near(u.energy,first*2);
});
test('014/015: Hyacine E1 heals allied attackers only in Sunny, E6 covers the team',()=>{
  const b=battle([actor(1409,{eidolon:6}),dummy()]),[u,m,en]=b.units;m.hp=5000;
  b.rules.after(b,m,'basic','normal',m.actions.basic,[en],[en]);near(m.hp,5000);
  b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[u],[]);m.hp=4000;
  b.rules.after(b,m,'basic','normal',m.actions.basic,[en],[en]);assert.ok(m.hp>4000);
  near(b.rules.modifiers(b,m,en,m.actions.basic,'direct').resPen,u.kit.ranks[6][1]);
});
test('016: Jade debtor ticks exactly once per Jade turn and permits recasting after expiration',()=>{
  const b=battle([actor(1314),dummy()]),[u,m,en]=b.units;
  force(b,u,'skill',m.id);const effect=m.buffs.find(e=>e.tag==='jadeDebtor');
  for(let i=0;i<2;i++){force(b,m);assert.equal(effect.remaining,3-i);force(b,u);assert.equal(effect.remaining,2-i);}
  force(b,m);force(b,u);assert.ok(!m.buffs.some(e=>e.tag==='jadeDebtor'));assert.equal(b.rules.shouldUseSkill(b,u),true);
});
test('017/018/019/020: all-element reduction, resummon, hit-only reveal and SP recovery',()=>{
  const d=battle([actor(1321,{eidolon:2})]);assert.equal(d.units.at(-1).buffs.find(e=>e.tag==='dahlia-e2').element,undefined);
  const rb=battle([actor(1512)]),r=rb.units[0];rb.rules.after(rb,r,'skill','normal',r.actions.skill,[r],[]);
  const s=rb.units.find(t=>t.memospriteOwner===r.id);s.hp=0;s.active=false;
  const scent=r.resources['气氛值']??0;rb.rules.after(rb,r,'skill','normal',r.actions.skill,[r],[]);
  assert.ok(s.hp>0&&s.active!==false);near(r.resources['气氛值']??0,scent);
  const nb=battle([actor(1405)]),n=nb.units[0],e=nb.units.at(-1);const other={...dummy('enemy2','enemy'),buffs:[],dots:[],shields:[],resources:{},weaknesses:['Physical','Fire','Ice','Thunder','Wind','Quantum','Imaginary'],hp:1e9,battle:nb,active:true};nb.units.push(other);
  nb.rules.after(nb,n,'basic','normal',n.actions.basic,[e],[e]);assert.ok(!nb.queue.some(q=>q.kind==='followup'));
  const rin=battle([actor(1508),dummy()]),[rr,m,enemy]=rin.units;
  rin.rules.after(rin,m,'basic','normal',m.actions.basic,[enemy],[enemy]);assert.ok(m.buffs.some(x=>x.name==='宝石魔术 · 暴击伤害'));
});
test('021/022: Lynx E4 has its own duration; E2 wards one debuff, Luocha has control resistance',()=>{
  const b=battle([actor(1110,{eidolon:4}),dummy()]),[u,m,en]=b.units;
  b.rules.after(b,u,'skill','normal',u.actions.skill,[m],[]);
  assert.equal(m.buffs.find(e=>e.name==='玲可 E4 · 攻击力').remaining,u.kit.ranks[4][1]);near(combatPanel(u).controlRes,.35);
  const dot={name:'负面探针',element:'Physical',chance:1,duration:2,terms:[]};
  assert.equal(b.rules.dot(b,en,m,dot),null);assert.ok(b.rules.dot(b,en,m,dot));
  const l=battle([actor(1203)]);near(combatPanel(l.units[0]).controlRes,.7);
  const y=battle([actor(1207)]),yu=y.units[0],ye=y.units.at(-1);assert.equal(y.rules.dot(y,ye,yu,dot),null);assert.ok(y.rules.dot(y,ye,yu,dot));yu.turns+=2;assert.equal(y.rules.dot(y,ye,yu,dot),null);
});
test('023: Phainon transformation resists every control before insertion',()=>{
  const b=battle([actor(1408)]),[u,en]=b.units;u.energy=12;b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[],[]);
  near(combatPanel(u).controlRes,1);
  for(const control of ['freeze','stun','imprisonment','entanglement','taunt'])assert.equal(b.rules.dot(b,en,u,{name:control,element:'Physical',duration:2,chance:1,extra:{control}}),null);
});
test('024: transformed actions preserve the operation-axis target',()=>{
  const a=actor(1310),c=config([a]);c.units.push(dummy('second','enemy'));
  const b=createBattle(partialMechanicsFixture(c)),u=b.units[0];b.rules.after(b,u,'ultimate','ultimate',u.actions.ultimate,[u],[]);
  force(b,u,'basic','second');assert.equal(b.log.findLast(e=>e.type==='action'&&e.actor===u.id).targets[0],'second');
});
test('025: all newly listed cones support out-of-combat import',()=>{
  near(outsideBonuses(ctx,{lightconeId:23019,superimpose:1}).values.breakEffect,.6);
  near(outsideBonuses(ctx,{lightconeId:23063,superimpose:1}).values.hpPct,.3);
  assert.deepEqual(outsideBonuses(ctx,{lightconeId:23026,superimpose:1}).values,{});
});
test('034: Sunday E1 follows gauge summon owners and runtime memosprites',()=>{
  const b=battle([actor(1313,{eidolon:1}),actor(1407)]),[u,owner]=b.units;
  b.rules.after(b,u,'skill','normal',u.actions.skill,[owner],[]);
  b.rules.before(b,owner,'summonDragon','extra',owner.actions.summonDragon,[owner]);const mem=b.units.find(t=>t.memospriteOwner===owner.id);
  near(b.rules.modifiers(b,mem,b.units.at(-1),mem.actions.basic,'direct').defIgnore,u.kit.ranks[1][2]);
  b.activeSummon={owner:owner.id};near(b.rules.modifiers(b,owner,b.units.at(-1),owner.actions.basic,'direct').defIgnore,u.kit.ranks[1][2]-u.kit.ranks[1][1]);
});
test('035/037: HuoHuo technique respects effect resistance; skipped final Aha closes the instant',()=>{
  const a=actor(1217,{technique:true}),c=config([a]);c.units.at(-1).panel.effectRes=1;
  const b=createBattle(partialMechanicsFixture(c));assert.ok(!b.units.at(-1).buffs.some(e=>e.name==='魄散 · 攻击降低'));
  for(const state of ['dead','frozen']){const ab=battle([actor(1501),dummy()]),u=ab.units[0];ab.ahaInstant={id:99,natural:true,participants:[u.id],completed:[],deferred:[],ending:false};ab.queue.push({actor:u.id,key:'elation',kind:'aha',ahaInstantId:99});if(state==='dead')u.hp=0;else u.buffs.push({id:'freeze',control:'freeze',key:'marker',value:0});stepBattle(ab);assert.equal(ab.ahaInstant,null);}
});
test('045/047: imported build metadata and non-finite panel values are rejected',()=>{
  const c=config([actor(1015)]);c.units[0].build.superimpose='1" onfocus="alert(1)';assert.ok(validateBattle(c).some(e=>e.includes('superimpose')));
  assert.ok(validatePanel({...panel(),critRate:5}).length);assert.ok(validatePanel({...panel(),critDmg:Infinity}).length);
});
test('038: action HP costs broadcast the actual consumed amount',()=>{
  const a=dummy();a.actions.basic.hpCostRatio=.1;const b=battle([a]),u=b.units[0];
  const changes=[],original=b.rules.hpChanged;b.rules.hpChanged=(...args)=>{changes.push(args);original(...args);};
  force(b,u);const consumption=changes.filter(x=>x[1]===u&&x[2]==='consume');near(consumption.length,1);near(consumption[0][3],1000);
});
test('043/044: target-specific seasons stay disabled; raw annotation records become numeric buffs',()=>{
  const sc={mode:'moc',seasonId:1002,floorId:'2101'},entry=data.scenarioEffects['abyss.moc.1002.season'].effects[0];
  const unresolved=loadScenario(ctx,{...sc,selections:{[entry.id]:true}});
  assert.ok(unresolved.availableBuffs.find(e=>e.id===entry.id).scope.unresolvedTarget);assert.ok(!unresolved.buffs.some(e=>e.id===entry.id));
  const recs=[0,1].map(i=>({id:'abyss.moc.1002.season.b'+i,source:{kind:'abyss_season',mode:'moc',seasonId:1002},param:{index:1},effect:{key:i?'critDmg':'dmgBoost',side:'ally',target:'team',scale:.1}}));
  const parsed=loadScenario(ctx,{...sc,annotations:{buffs:recs}}).buffs.filter(b=>recs.some(r=>r.id===b.id));
  near(parsed.length,2);for(const b of parsed){assert.ok(b.key);near(b.value,.2);}
});
test('040: Archer policy controls work when JSON omitted policy',()=>{
  const c=config([actor(1015)]);delete c.units[0].policy;
  const control={dataset:{skillLimit:'0'},value:'2'},host=node('policy-host');host.querySelectorAll=q=>q==='[data-skill-limit]'?[control]:[];
  renderSimulator({host,state:{config:c}});control.onchange();near(c.units[0].policy.skillLimit,2);
});

await import('../ui/app.mjs');
const ui=window.__HSR;
test('026/028/030/031/032: calculator defaults, manual panels and unsupported skills',()=>{
  ui.st.characterId=1015;ui.st.eidolon=0;ui.st.selfPickOverrides={};ui.st.selfPicks={};ui.syncSelfPicks();
  for(const e of ui.selfEntries().filter(e=>e.kind==='eidolon'))assert.equal(ui.st.selfPicks[e.id],false);
  ui.st.eidolon=6;ui.syncSelfPicks();for(const e of ui.selfEntries().filter(e=>e.kind==='eidolon'&&!blockedReason(e,ui.catalogOpts())))assert.equal(ui.st.selfPicks[e.id],true);
  ui.st.relicAuto=false;ui.st.panel={...panel(),atk:3456};ui.renderAll();node('f-level').onchange({target:{value:'70'}});near(ui.st.panel.atk,3456);
  ui.st.lightconeId=23021;assert.ok(!ui.selfEntries().some(e=>e.kind==='lightcone'));
  ui.st.stacks=3;near(ui.catalogOpts().stacks,3);
  ui.st.characterId=1303;ui.st.abilityId=130303;ui.st.selfPickOverrides={};ui.syncSelfPicks();ui.compute();assert.ok(!ui.st.result.ok);assert.ok(!ui.st.result.error.includes('还没补录'));
});
test('042/047: clearing an element restores missing-value semantics; crit inputs are bounded',()=>{
  const elem={dataset:{elem:'Physical'},value:''},crit={dataset:{panel:'critRate'},value:'500'};
  node('sec-panel').querySelectorAll=q=>q==='[data-elem]'?[elem]:q==='[data-panel]'?[crit]:[];
  ui.st.panel=panel();ui.st.panel.elemDmg.Physical=.2;ui.renderAll();elem.oninput();assert.equal(ui.st.panel.elemDmg.Physical,null);
  crit.oninput();near(ui.st.panel.critRate,1);crit.value='-5';crit.oninput();near(ui.st.panel.critRate,0);
  node('sec-panel').querySelectorAll=()=>[];
});
await import('../ui/battle-app.mjs');
const builder=window.__HSR_BATTLE__;
test('039/041: choosing custom clears the kit and editing runtime stats preserves equipment drafts',()=>{
  const selected=builder.state.config.units[0];
  node('battle-level').onchange({target:{value:'70'}});
  const input={dataset:{unit:'0',key:'atk'},value:'2345'};node('battle-runtime').querySelectorAll=q=>q==='[data-unit]'?[input]:[];
  builder.renderRuntime();input.oninput();
  assert.ok(node('battle-builder').innerHTML.includes('value="70"'));
  node('battle-character').onchange({target:{value:''}});node('battle-build-apply').onclick();
  const current=builder.state.config.units.find(u=>u.id===selected.id);
  assert.equal(current.characterId,undefined);assert.equal(current.kit,undefined);assert.equal(current.name,'自定义测试单位');near(current.level,70);near(current.panel.atk,2345);assert.deepEqual(Object.keys(current.actions),['basic']);
});
test('046: production HTTP handler blocks internals and serves both workspaces',()=>{
  const request=url=>{const res={status:0,headers:{},body:'',writeHead(status,headers={}){this.status=status;this.headers=headers;},end(body){this.body=String(body??'');}};handleRequest({url},res);return res;};
  for(const route of ['/.git/config','/.claude/config','/package.json','/_scripts/verify.mjs','/ui/../.git/config'])near(request(route).status,403);
  for(const route of ['/calculator','/battle','/ui/app.mjs','/core/ctx.mjs','/simulator/engine.mjs'])near(request(route).status,200);
  near(request('/bad%zz').status,400);
});
console.log(`Review report regressions: ${passed} passed, ${failed} failed`);
if(failed)process.exitCode=1;
