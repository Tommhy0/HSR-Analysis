import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createContext} from '../core/ctx.mjs';
import {fireProwler,brokenContainer,isEnemyMechanicRegistered,validateEnemyActor} from '../simulator/encounters.mjs';
import {combatPanel,createBattle,stepBattle,receiveDamage,validateBattle} from '../simulator/engine.mjs';
import {buildEndgameEncounter} from '../simulator/endgame-battles.mjs';
import {inspectEndgameTarget} from '../simulator/endgame-scenes.mjs';
import {strictParty} from '../simulator/party.mjs';

const ctx=createContext(JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url))));
const id='fire-prowler-runtime';
const near=(actual,expected,tolerance=1e-5)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} != ${expected}`);

function dummyParty(){
  const allies=structuredClone(strictParty(ctx).units.filter(unit=>unit.side==='ally'));
  for(const ally of allies){
    delete ally.kit;delete ally.characterId;delete ally.gear;delete ally.memospriteOwner;
    ally.panel={hp:1e9,atk:0,def:0,speed:1,critRate:0,critDmg:0,effectRes:0,elemDmg:{},baseStats:{hp:1e9,atk:0,def:0}};
    ally.hp=1e9;ally.energy=0;ally.energyMax=0;ally.buffs=[];ally.shields=[];ally.dots=[];ally.resources={};
    ally.actions={basic:{name:'source-check probe',type:'Normal',element:'Ice',target:'single',
      terms:[{scaling:'atk',multiplier:10}],toughness:60}};
    ally.policy={autoUltimate:false,basicOnly:true};ally.standardBreak=false;
  }
  return allies;
}
function battleWith(source){
  const boss=fireProwler(ctx,{sceneEnemy:source,id});
  const battle=createBattle({strict:false,maxAV:3000,sp:3,maxSP:9,seed:7,critMode:'noncrit',units:[...dummyParty(),boss]});
  for(const unit of battle.units)unit.distance=10000;
  const live=battle.units.find(unit=>unit.id===id);
  live.distance=0;
  return {battle,live};
}
const bossActions=battle=>battle.log.filter(event=>event.type==='action'&&event.actor===id).map(event=>event.key);
function stepUntil(battle,count,guard=400){
  while(bossActions(battle).length<count&&guard-->0)if(!stepBattle(battle))break;
}
// 每个动作窗口 = 该动作的事件起点到下一个动作起点之间的日志。
function actionWindows(battle){
  const starts=[];
  battle.log.forEach((event,index)=>{if(event.type==='action'&&event.actor===id)starts.push(index);});
  return starts.map((start,index)=>battle.log.slice(start,starts[index+1]??battle.log.length));
}
const damages=events=>events.filter(event=>event.type==='damage'&&event.actor===id);
const mechanic=(events,name)=>events.filter(event=>event.type==='mechanic'&&event.name===name);
const marksOn=unit=>unit.buffs.filter(effect=>effect.tag==='fireProwlerRallyHpMark');
const reduceLayers=unit=>unit.buffs.find(effect=>effect.tag==='fireProwlerAllDamageReduce')?.stacks??0;
const hasTag=(unit,tag)=>unit.buffs.some(effect=>effect.tag===tag);

// ---- Source rows -----------------------------------------------------------
const mocSource=inspectEndgameTarget(ctx,{mode:'moc',seasonId:1036,floorId:'5510',side:2})
  .enemies.find(enemy=>enemy.childId===4034010);
assert.ok(mocSource,'MoC 1036 5510/S2 includes 至黑之剑，盗火行者 4034010');
near(mocSource.hp,1138839.7);
assert.equal(mocSource.speed,174.2);
assert.equal(mocSource.stance,720);

const pfScene=inspectEndgameTarget(ctx,{mode:'pf',seasonId:2027,floorId:'20274',side:1});
const fantasticSource=pfScene.enemies.find(enemy=>enemy.childId===4034014);
const containerSource=pfScene.enemies.find(enemy=>enemy.childId===4032024);
assert.ok(fantasticSource,'PF 2027 20274/S1 includes the 4034014 FantasticStory variant');
assert.ok(containerSource,'PF 2027 20274/S1 includes 残破容器 4032024');
near(fantasticSource.hp,66444811.5);
assert.equal(fantasticSource.speed,158.4);
near(containerSource.hp,1932940);
assert.equal(containerSource.speed,168);

for(const monsterId of [4034010,4034014,4032024,403202401,403202001,403202002,403202003])
  assert.equal(isEnemyMechanicRegistered(monsterId),true,`${monsterId} is registered`);

// ---- 4034010 actor ---------------------------------------------------------
const actor=fireProwler(ctx,{sceneEnemy:mocSource});
assert.deepEqual(validateEnemyActor(actor),[]);
assert.equal(actor.monsterId,4034010);
assert.equal(actor.childId,4034010);
assert.equal(actor.enemyKit.id,4034010);
assert.equal(actor.enemyKit.fantasticStory,false);
assert.equal(actor.element,'Physical');
assert.equal(actor.rank,'elite');
assert.equal(actor.level,90);
assert.equal(actor.hpCount,2);
assert.deepEqual(actor.phaseRatios,[1,1]);
near(actor.panel.hp,1138839.7);
near(actor.panel.speed,174.2);
near(actor.panel.atk,662.784948);
near(actor.panel.critDmg,.2);
assert.equal(actor.toughnessMax,240);
assert.deepEqual(actor.weaknesses,['Ice','Thunder','Quantum']);
assert.deepEqual([actor.enemyKit.skill01Params,actor.enemyKit.skill02Params,actor.enemyKit.skill03Params,
  actor.enemyKit.skill04Params,actor.enemyKit.skill05Params,actor.enemyKit.skill07Params],
  [[4,2,.05,8,.05],[3],[.5],[8,.05,2.5],[2,1,2],[1,1.6,3]]);
assert.deepEqual([actor.enemyKit.phaseOneSummonCount,actor.enemyKit.phaseTwoSummonCount,
  actor.enemyKit.assistCountPhaseOne,actor.enemyKit.assistCountPhaseTwo,actor.enemyKit.timePowerInitial],
  [2,4,2,4,8]);
assert.equal(actor.enemyMechanicNotes.length,10);
assert.equal(actor.policy.autoUltimate,false);

// 三种容器的召唤模板（Monster_W4_FireProwler_01_*）
const vessels=actor.enemyKit.vesselBlueprints;
assert.deepEqual(Object.values(vessels).map(vessel=>vessel.childId),[403202001,403202002,403202003]);
for(const vessel of Object.values(vessels)){
  assert.equal(vessel.monsterId,4032020,'容器按基础怪物 4032020 构建');
  assert.equal(vessel.cannotAct,true,'容器不自主行动');
  assert.equal(vessel.enemyKit.id,4032020);
}
assert.deepEqual([vessels.a.enemyKit.assist,vessels.a.enemyKit.hpCostRatio], [{target:'blast',main:.5,adjacent:.25},0]);
assert.deepEqual([vessels.b.enemyKit.assist,vessels.b.enemyKit.hpCostRatio], [{target:'all',main:.5,adjacent:0},0]);
assert.equal(vessels.c.enemyKit.assist,null,'403202003 没有助战伤害节点');
assert.equal(vessels.c.enemyKit.hpCostRatio,.06,'403202003 的 PassiveSkill01[1] = 6%');
assert.deepEqual(vessels.c.enemyKit.passive01Params,[1,.06],'最后一名 403202003 助战叠 1 层灾难之力并按 6% 回复');

// ---- 战斗开始：8 层永别的决绝 + OneMorePerTurn ------------------------------
{
  const {live}=battleWith(mocSource);
  assert.equal(reduceLayers(live),8);
  const reduction=live.buffs.find(effect=>effect.tag==='fireProwlerAllDamageReduce');
  assert.equal(reduction.key,'dmgReduction');
  near(reduction.value,.4);
  assert.equal(hasTag(live,'fireProwlerOneMorePerTurn'),true,'PassiveSkill01 追加 OneMorePerTurn');
  assert.equal(live.resources['盗火行者灾难之力'],0);
  assert.deepEqual([live.resources['盗火行者PhaseFlag'],live.resources['盗火行者AIFlag'],
    live.resources['盗火行者SkillFlag'],live.resources['盗火行者AssistFlag']],[1,1,1,1]);
}

// ---- 第一阶段 AI 轮转 + 召唤 + 幽冥的悼念 -----------------------------------
{
  const {battle,live}=battleWith(mocSource);
  // 第一个回合：AIFlag 1/2 交替释放亡死的黑云与将尽的命数。
  stepUntil(battle,2);
  assert.deepEqual(bossActions(battle),['skill01','skill02']);
  const firstTurn=actionWindows(battle);
  // 两个技能各召唤 2 个容器，LoseHPByRatio 的 Floor 1 让首领各掉 1 点生命。
  assert.equal(mechanic(firstTurn[0],'【苦痛缠绕】印记').length,2);
  assert.equal(mechanic(firstTurn[1],'【苦痛缠绕】印记').length,2);
  assert.deepEqual(mechanic(firstTurn[0],'容器入场结算').map(event=>event.hpCost),[1,1]);
  assert.deepEqual(mechanic(firstTurn[1],'容器入场结算').map(event=>event.hpCost),[1,1]);
  const summons=battle.log.filter(event=>event.type==='summon').map(event=>event.childId);
  assert.deepEqual(summons,[403202001,403202001,403202002,403202002]);
  near(live.hp,1138839.7-4);
  assert.equal(marksOn(live).length,4);
  assert.ok(marksOn(live).every(mark=>mark.value===1));
  const aVessels=battle.units.filter(unit=>unit.enemyKit?.vesselKind==='a'&&unit.active);
  const bVessels=battle.units.filter(unit=>unit.enemyKit?.vesselKind==='b'&&unit.active);
  assert.equal(aVessels.length,2);
  assert.equal(bVessels.length,2);

  stepUntil(battle,6);
  assert.deepEqual(bossActions(battle).slice(0,6),
    ['skill01','skill02','skill03','skill06','skill06','skill05'],
    'AIFlag 1/2→交替攻击、3→相混的道途、4/5→幽冥的悼念、6→却是必要的苦难');
  const kinds=battle.log.filter(event=>event.type==='action'&&event.actor===id).map(event=>event.kind);
  assert.deepEqual(kinds.slice(0,6),['normal','continuation','normal','continuation','normal','continuation'],
    'OneMorePerTurn 让每个回合都带一次追加行动');
  const windows=actionWindows(battle);

  // 相混的道途：激活全部容器；第一阶段不改变行动条。
  assert.deepEqual(mechanic(windows[2],'【相混的道途】激活容器')[0].activated.sort(),aVessels.concat(bVessels).map(unit=>unit.id).sort());
  assert.equal(mechanic(windows[2],'【相混的道途】激活容器')[0].delayCost,null);

  // 第一次幽冥的悼念（Assist_Flag=1 → A 阵型）：首领 4.0 / 2.0 阵型攻击，
  // 每名 A 容器再追加一次首领攻击力 × 0.5 / 0.25 的伤害。
  const first=windows[3];
  const assists=mechanic(first,'容器助战追加');
  assert.equal(assists.length,2,'两名 403202001 各追加一次伤害');
  assert.ok(assists.every(event=>event.kind==='a'&&event.target==='blast'&&event.main===.5&&event.adjacent===.25));
  const atk=combatPanel(live).atk;
  near(atk,662.784948);
  const primary=damages(first).filter(event=>event.role==='primary').map(event=>event.damage).sort((a,b)=>a-b);
  const adjacent=damages(first).filter(event=>event.role==='adjacent').map(event=>event.damage).sort((a,b)=>a-b);
  assert.deepEqual(primary.map(value=>+value.toFixed(5)),[atk*.5,atk*.5,atk*4].map(value=>+value.toFixed(5)));
  assert.deepEqual(adjacent.map(value=>+value.toFixed(5)),[atk*.25,atk*.25,atk*2].map(value=>+value.toFixed(5)));
  const summary=mechanic(first,'【幽冥的悼念】结算')[0];
  assert.deepEqual(summary.assisting,aVessels.map(unit=>unit.id));
  assert.equal(summary.timePowerGain,0,'403202001 没有 PassiveSkill01 行');
  assert.equal(summary.healed,0);
  assert.equal(live.resources['盗火行者灾难之力'],0);
  assert.equal(marksOn(live).length,2,'参与助战的 A 容器各自移除自己的印记');
  assert.equal(battle.units.filter(unit=>unit.enemyKit?.vesselKind==='a'&&unit.active).length,0,'助战后 ForceKill');
  assert.equal(mechanic(first,'【幽冥的悼念】最后一名容器助战')[0].vessel,aVessels[1].id);

  // 第二次幽冥的悼念：A 容器已全部退场，RetargetList 为空 → 整组并行技能不执行。
  const second=windows[4];
  const empty=mechanic(second,'【幽冥的悼念】没有可助战的容器 · 本回合无伤害');
  assert.equal(empty.length,1);
  assert.equal(empty[0].kind,'a');
  assert.equal(empty[0].assistFlag,1,'Assist_Flag 不会被改写');
  assert.equal(damages(second).length,0,'没有可助战容器时本回合不造成伤害');
  assert.deepEqual(bossActions(battle).slice(2,3),['skill03']);

  // 却是必要的苦难：灾难之力为 0 → AttackCount 0 走 Skill05_Attack，只结算 1 段 2.0。
  const fifth=windows[5];
  const suffering=mechanic(fifth,'【却是必要的苦难】结算')[0];
  assert.deepEqual([suffering.attackCount,suffering.shadowHits,suffering.bonusHit,suffering.fallbackMultiplier],[0,0,false,2]);
  assert.deepEqual(damages(fifth).map(event=>+event.damage.toFixed(5)),[atk*2,atk*2,atk*2,atk*2].map(value=>+value.toFixed(5)));
}

// ---- 却是必要的苦难：AttackCount 分档 --------------------------------------
for(const [timePower,expected] of [[8,{attackCount:16,shadowHits:6,bonusHit:false,fallback:null}],
  [4,{attackCount:8,shadowHits:6,bonusHit:true,fallback:null}],
  [0,{attackCount:0,shadowHits:0,bonusHit:false,fallback:2}]]){
  const {battle,live}=battleWith(mocSource);
  live.resources['盗火行者AIFlag']=6;
  live.resources['盗火行者灾难之力']=timePower;
  stepBattle(battle);
  assert.equal(bossActions(battle)[0],'skill05');
  const window=actionWindows(battle)[0],atk=combatPanel(live).atk;
  const resolution=mechanic(window,'【却是必要的苦难】结算')[0];
  assert.deepEqual([resolution.attackCount,resolution.shadowHits,resolution.bonusHit,resolution.fallbackMultiplier],
    [expected.attackCount,expected.shadowHits,expected.bonusHit,expected.fallback]);
  const hits=damages(window).map(event=>+event.damage.toFixed(5));
  const ones=hits.filter(value=>Math.abs(value-atk)<=1e-4).length;
  const doubles=hits.filter(value=>Math.abs(value-atk*2)<=1e-4).length;
  if(expected.shadowHits){assert.equal(ones,expected.shadowHits*4,'每段 Skill05[1] 命中全体 4 名我方');}
  else assert.equal(hits.length,4,'AttackCount=0 时只有 1 段 Skill05[2]');
  assert.equal(doubles,expected.bonusHit?4:expected.shadowHits?0:4,'AttackCount=8 追加 1 段 2×Skill05[1]');
  assert.equal(live.resources['盗火行者灾难之力'],0,'结算后灾难之力清零');
  assert.equal(hasTag(live,'fireProwlerOneMorePerTurn'),true);
}

// ---- 沉默的悲叹：Charge + 4 个 403202003 + 8 层灾难之力 + 行动延后 ----------
{
  const {battle,live}=battleWith(mocSource);
  live.resources['盗火行者PhaseFlag']=2;
  live.resources['盗火行者AIFlag']=4;
  stepBattle(battle);
  assert.deepEqual(bossActions(battle),['skill04'],'决策 4 先移除 OneMore 再释放沉默的悲叹');
  assert.equal(hasTag(live,'fireProwlerOneMorePerTurn'),false);
  assert.equal(hasTag(live,'fireProwlerCharge'),true);
  const cVessels=battle.units.filter(unit=>unit.enemyKit?.vesselKind==='c'&&unit.active);
  assert.equal(cVessels.length,4,'第二阶段沉默的悲叹召唤 4 个 403202003');
  assert.ok(cVessels.every(vessel=>vessel.childId===403202003));
  const maxHp=combatPanel(live).hp;
  const costs=battle.log.filter(event=>event.type==='hp_consume'&&event.reason==='【沉默的悲叹】· 召唤代价');
  assert.equal(costs.length,4);
  for(const cost of costs)near(cost.amount,maxHp*.05);
  near(live.hp,maxHp-4*maxHp*.05);
  assert.equal(marksOn(live).length,4,'每次召唤代价各挂一条苦痛缠绕印记');
  assert.ok(marksOn(live).every(mark=>Math.abs(mark.value-maxHp*.05)<=1e-4));
  assert.equal(live.resources['盗火行者灾难之力'],8,'Skill04[0] = 8 层灾难之力');
  assert.equal(live.resources['盗火行者AIFlag'],5);
  assert.equal(live.distance,25000,'SetActionDelay Skill04[2] = 2.5 × ACTION_DISTANCE');
  const settlement=mechanic(battle.log,'【沉默的悲叹】结算')[0];
  assert.deepEqual([settlement.summoned.length,settlement.timePower,settlement.delayCost],[4,8,2.5]);
  assert.ok(cVessels.every(vessel=>hasTag(vessel,'fireProwlerHpBack')),'沉默的悲叹后容器获得 HPBack');
}

// ---- 莫因舍弃而哭泣：3.0 群体 + 逐层 1.6 + 击杀容器 + 印记回血 -------------
{
  const {battle,live}=battleWith(mocSource);
  stepBattle(battle); // skill01 + skill02：4 个容器，4 条印记
  assert.equal(marksOn(live).length,4);
  const before=bossActions(battle).length;
  assert.deepEqual(bossActions(battle),['skill01','skill02']);
  const vesselsBefore=battle.units.filter(unit=>unit.monsterId===4032020&&unit.active).map(unit=>unit.id);
  assert.equal(vesselsBefore.length,4);
  live.resources['盗火行者PhaseFlag']=2;
  live.resources['盗火行者AIFlag']=5;
  live.resources['盗火行者灾难之力']=6;
  live.hp=combatPanel(live).hp*.9;
  stepBattle(battle);
  assert.equal(bossActions(battle)[before],'skill07');
  const window=actionWindows(battle)[before],atk=combatPanel(live).atk;
  const summary=mechanic(window,'【莫因舍弃而哭泣】结算')[0];
  assert.deepEqual([summary.extraHits,summary.vessels],[6,4],'AttackCount = 灾难之力 × Skill07[0] = 6');
  assert.equal(summary.healed,4,'按印记记录的入场生命消耗回复（4 × 1）');
  const hits=damages(window).map(event=>+event.damage.toFixed(5));
  assert.equal(hits.filter(value=>Math.abs(value-atk*3)<=1e-4).length,4,'3.0 倍群体主段');
  assert.equal(hits.filter(value=>Math.abs(value-atk*1.6)<=1e-4).length,24,'6 段 × 全体 4 人');
  // 追加行动会在 Skill07 之后立刻召唤新容器，这里只核对结算前的旧容器被全部击杀。
  assert.ok(vesselsBefore.every(vesselId=>battle.units.find(unit=>unit.id===vesselId).active===false));
  assert.ok(!marksOn(live).some(mark=>vesselsBefore.includes(mark.vesselId)));
  assert.equal(live.resources['盗火行者灾难之力'],0);
  assert.equal(hasTag(live,'fireProwlerCharge'),false);
  assert.equal(hasTag(live,'fireProwlerOneMorePerTurn'),true,'Skill07 结束追加 OneMorePerTurn');
}

// ---- 生命阶段切换 ----------------------------------------------------------
{
  const {battle,live}=battleWith(mocSource);
  live.buffs.push({id:'test-debuff',name:'测试减益',key:'test',value:0,tag:'testDebuff',debuff:true});
  receiveDamage(battle,null,live,live.hp+1,'direct');
  assert.equal(live.hpPhase,2);
  near(live.hp,1138839.7);
  assert.equal(live.toughness,live.toughnessMax,'resetToughnessOnHpBarChange');
  assert.equal(reduceLayers(live),8,'ChangePhase1 重新施加 8 层');
  assert.equal(live.resources['盗火行者灾难之力'],0);
  assert.deepEqual([live.resources['盗火行者PhaseFlag'],live.resources['盗火行者AIFlag'],live.resources['盗火行者SkillFlag']],
    [2,1,2]);
  assert.equal(live.distance,0,'SetActionDelay 0');
  assert.equal(live.buffs.some(effect=>effect.name==='测试减益'),false,'静默驱散自身减益');
  const change=mechanic(battle.log,'盗火行者切换生命阶段')[0];
  assert.deepEqual([change.fromPhase,change.toPhase,change.phaseFlag,change.aiFlag,change.skillFlag],[1,2,2,1,2]);
  assert.deepEqual(change.dispelled,['测试减益']);
}

// ---- 容器阵亡：死亡遗言 / HPBack 门控 --------------------------------------
{
  const {battle,live}=battleWith(mocSource);
  stepBattle(battle);
  const maxHp=combatPanel(live).hp,before=live.hp;
  assert.equal(marksOn(live).length,4);
  const victim=battle.units.find(unit=>unit.monsterId===4032020&&unit.active);
  assert.ok(hasTag(victim,'fireProwlerDeathrattle'),'容器入场写入死亡遗言');
  victim.hp=0;victim.active=false;
  battle.rules.death(battle,null,victim);
  near(live.hp,before-maxHp*.05);
  assert.equal(reduceLayers(live),7,'永别的决绝减 1 层');
  assert.equal(marksOn(live).length,3);

  // 已移除死亡遗言的容器（Skill06 / Skill07 / ChargeBreak 的 ForceKill）不结算。
  const quiet=battle.units.find(unit=>unit.monsterId===4032020&&unit.active);
  quiet.buffs=quiet.buffs.filter(effect=>effect.tag!=='fireProwlerDeathrattle'&&effect.tag!=='fireProwlerHpBack');
  const hpBefore=live.hp,layersBefore=reduceLayers(live),marksBefore=marksOn(live).length;
  quiet.hp=0;quiet.active=false;
  battle.rules.death(battle,null,quiet);
  assert.equal(live.hp,hpBefore);
  assert.equal(reduceLayers(live),layersBefore);
  assert.equal(marksOn(live).length,marksBefore);
  assert.ok(battle.log.some(event=>event.type==='mechanic'&&event.name==='容器退场 · 无死亡遗言 / HPBack，不触发首领结算'));
}

// ---- 沉默的悲叹被击破：ChargeBreak 的 IF / ELSE ----------------------------
for(const withMarks of [true,false]){
  const {battle,live}=battleWith(mocSource);
  live.resources['盗火行者PhaseFlag']=2;
  live.resources['盗火行者AIFlag']=4;
  stepBattle(battle);
  assert.equal(hasTag(live,'fireProwlerCharge'),true);
  assert.equal(marksOn(live).length,4);
  const activeVessels=()=>battle.units.filter(unit=>unit.monsterId===4032020&&unit.active).length;
  assert.equal(activeVessels(),4);
  if(!withMarks)live.buffs=live.buffs.filter(effect=>effect.tag!=='fireProwlerRallyHpMark');
  const layersBefore=reduceLayers(live);
  battle.rules.weaknessBreak(battle,null,live,{toughness:0},'Physical');
  const breakEvent=mechanic(battle.log,'【沉默的悲叹】被击破 · ChargeBreak')[0];
  assert.equal(breakEvent.aiFlag,1);
  assert.equal(breakEvent.timePowerBefore,8);
  if(withMarks){
    assert.equal(breakEvent.marksRemoved,4);
    assert.equal(breakEvent.forceKilled,0,'有印记时 ChargeBreak 只移除印记');
    assert.equal(reduceLayers(live),layersBefore);
    assert.equal(activeVessels(),4);
  }else{
    assert.equal(breakEvent.marksRemoved,0);
    assert.equal(breakEvent.forceKilled,4,'无印记时插入 MonsterForceKill');
    assert.equal(reduceLayers(live),layersBefore-1);
    assert.equal(activeVessels(),0);
  }
  assert.equal(live.resources['盗火行者灾难之力'],0,'灾难之力按当前层数抵消为空');
  assert.equal(live.resources['盗火行者AIFlag'],1);
  assert.equal(hasTag(live,'fireProwlerCharge'),false);
  assert.equal(hasTag(live,'fireProwlerOneMorePerTurn'),true,'Charge 的 OnDestroy 追加 OneMorePerTurn');
  // Charge 已解除，再次击破不会触发第二次 ChargeBreak。
  battle.rules.weaknessBreak(battle,null,live,{toughness:0},'Physical');
  assert.equal(mechanic(battle.log,'【沉默的悲叹】被击破 · ChargeBreak').length,1);
}

// ---- 4034014 异相仲裁形态：不召唤、无减伤、决策 1/2/3 ----------------------
{
  const boss=fireProwler(ctx,{sceneEnemy:fantasticSource,id});
  assert.deepEqual(validateEnemyActor(boss),[]);
  assert.equal(boss.monsterId,4034014);
  assert.equal(boss.enemyKit.fantasticStory,true);
  assert.equal(boss.enemyKit.vesselBlueprints,null,'!FantasticStory 门控不携带召唤模板');
  assert.equal(boss.hpCount,1);
  assert.deepEqual(boss.phaseRatios,[1]);
  assert.deepEqual([boss.enemyKit.skill01Params,boss.enemyKit.skill03Params,boss.enemyKit.skill04Params,
    boss.enemyKit.skill05Params,boss.enemyKit.skill07Params],
    [[4,2,0,8,.05],[0],[8,0,1.5],[1,1,3],[1,.4,3]]);
  assert.equal(boss.enemyMechanicNotes.length,10);
  const battle=createBattle({strict:false,maxAV:3000,sp:3,maxSP:9,seed:7,critMode:'noncrit',units:[...dummyParty(),boss]});
  for(const unit of battle.units)unit.distance=10000;
  const live=battle.units.find(unit=>unit.id===id);
  live.distance=0;
  assert.equal(live.buffs.length,0,'FantasticStory 不施加 OneMorePerTurn / 永别的决绝');
  assert.equal(live.resources['盗火行者灾难之力'],0);
  stepUntil(battle,3);
  const fantasticActions=battle.log.filter(event=>event.type==='action'&&event.actor===id).map(event=>event.key);
  assert.deepEqual(fantasticActions.slice(0,3),
    ['skill01','skill04','skill07'],'决策 1→交替攻击并置 2、2→沉默的悲叹、3→莫因舍弃而哭泣');
  assert.equal(fantasticActions[3],'skill02','莫因舍弃而哭泣结束追加 OneMorePerTurn 后的行动');
  assert.equal(battle.units.filter(unit=>unit.side==='enemy').length,1,'FantasticStory 全程不召唤容器');
  assert.equal(battle.log.some(event=>event.type==='summon'),false);
  const atk=combatPanel(live).atk;
  near(atk,607.552866);
  const firstWindow=actionWindows(battle)[0];
  const firstHits=damages(firstWindow).map(event=>+event.damage.toFixed(5)).sort((a,b)=>a-b);
  assert.deepEqual(firstHits,[atk*2,atk*2,atk*4].map(value=>+value.toFixed(5)).sort((a,b)=>a-b),
    '亡死的黑云仍按 4.0 / 2.0 结算，只是没有召唤');
  assert.equal(mechanic(battle.log,'【沉默的悲叹】结算')[0].timePower,8);
  const lastWindow=actionWindows(battle)[2];
  const farewell=mechanic(lastWindow,'【莫因舍弃而哭泣】结算')[0];
  assert.equal(farewell.extraHits,8,'异相仲裁 AttackCount = 8 × Skill07[0] = 8');
  assert.equal(farewell.vessels,0);
  assert.equal(damages(lastWindow).filter(event=>Math.abs(+event.damage.toFixed(5)-atk*.4)<=1e-4).length,32,'8 段 × 全体 4 人');
}

// ---- 4032024 残破容器（虚构叙事填充怪）------------------------------------
{
  const container=brokenContainer(ctx,{sceneEnemy:containerSource,id:'broken-container-check'});
  assert.deepEqual(validateEnemyActor(container),[]);
  assert.equal(container.monsterId,4032024);
  assert.equal(container.childId,4032024);
  assert.equal(container.element,'Physical');
  assert.equal(container.rank,'normal');
  assert.deepEqual(container.enemyKit.aiSequence,[403202402]);
  assert.deepEqual(container.enemyKit.skill02Params,[1.6,.6,.3,.2]);
  assert.deepEqual(container.actions.skill.terms,[{scaling:'atk',multiplier:1.6}]);
  assert.equal(container.actions.skill.target,'all');
  assert.ok(container.unsupported.some(note=>note.includes('侵蚀')));
  const battle=createBattle({strict:false,maxAV:3000,sp:3,maxSP:9,seed:7,critMode:'noncrit',units:[...dummyParty(),container]});
  for(const unit of battle.units)unit.distance=10000;
  const liveContainer=battle.units.find(unit=>unit.id==='broken-container-check');
  liveContainer.distance=0;
  stepBattle(battle);
  const atk=combatPanel(liveContainer).atk;
  const hits=battle.log.filter(event=>event.type==='damage'&&event.actor==='broken-container-check');
  assert.equal(hits.length,4);
  for(const hit of hits)near(hit.damage,atk*1.6);
}

// ---- 混沌回忆 1036 第 10 层下半整面构建 ------------------------------------
{
  const battleConfig=buildEndgameEncounter(ctx,strictParty(ctx),{mode:'moc',seasonId:1036,floorId:'5510',side:2});
  assert.deepEqual(validateBattle(battleConfig),[]);
  const enemyUnits=battleConfig.units.filter(unit=>unit.side==='enemy');
  assert.deepEqual(enemyUnits.map(unit=>unit.childId),[1013020,1023010,4034010]);
  assert.equal(battleConfig.sceneReplay.enemyLineupComplete,true);
  assert.equal(battleConfig.sceneReplay.enemyBehaviorRegistered,true);
  const builtProwler=enemyUnits.find(unit=>unit.childId===4034010);
  assert.equal(builtProwler.enemyKit.id,4034010);
  assert.equal(builtProwler.hpCount,2);
  near(builtProwler.panel.hp,1138839.7);
  near(builtProwler.baseSpeed,174.2);
}

console.log('fire prowler (4034010 / 4034014) and broken container (4032024): all checks passed');
