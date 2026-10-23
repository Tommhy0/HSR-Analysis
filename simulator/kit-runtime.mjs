// Game kit hooks operate on battle state only. No DOM and no hidden external state.
import {relicRuntime} from './relic-runtime.mjs';
import {rosterRuntime} from './characters/runtime.mjs';
import {equipmentRuntime} from './equipment-runtime.mjs';
const joyAscendantBlissTag='joyAscendantBliss';
const ichorPheasantResonanceTag='ichorPheasantResonance';
const silvermaneSupportTag='silvermaneCannoneerSupport';
const live=u=>u&&u.active!==false&&u.hp>1e-8;
const allies=(b,u)=>b.units.filter(t=>live(t)&&t.side===u.side);
const enemies=(b,u)=>b.units.filter(t=>live(t)&&t.side!==u.side);
const is=(u,id)=>u.kit?.characterId===id;
const rank=(u,n,i=0)=>u.kit.eidolon>=n?u.kit.ranks[n]?.[i]??0:0;
const trace=(u,n)=>u.kit?.trace?.[n];
const set=(u,id)=>u.gear?.sets?.find(s=>s.id===id);
const rolePath=u=>({1306:'Harmony',1412:'Harmony',1015:'Hunt',1414:'Preservation'})[u.characterId]??({同谐:'Harmony',巡猎:'Hunt',存护:'Preservation',丰饶:'Abundance',虚无:'Nihility',毁灭:'Destruction',智识:'Erudition',记忆:'Remembrance',欢愉:'Elation'})[u.path]??u.path;
const cone=(u,id)=>u.gear?.cone?.id===id?u.gear.cone.p:null;
const get=(b,id)=>b.units.find(u=>u.id===id);
const tag=(u,name)=>u.buffs.find(e=>e.tag===name);
const obliteratorOverheatTag='amlObliteratorOverheat',obliteratorMarkTag='amlObliteratorMark';
const longRightMonitorTag='longRightMonitor';
const meteoricEagleWindwalkTag='meteoricEagleWindwalk',meteoricEagleMarkTag='meteoricEagleSkill02Mark';
const iceOutOfSpaceIcepointTag='iceOutOfSpaceIcepoint';
const voidrangerTramplerTargetTag='MMonster_AML_Minion03_00_Target';
const rockingRebelChargeTag='rockingRebelCharge',rockingRebelFrenzyTag='rockingRebelFrenzy',rockingRebelDizzyTag='rockingRebelDizzy';
const wingedSerpentChargeTag='wingedSerpentCharge',wingedSerpentOneMoreTag='wingedSerpentOneMorePerTurn';
const cacoHarmonyDreamTag='cacoHarmonyDream';
const cyclonicMotherIncubationTag='cyclonicMotherIncubation';
const dawnCorpsForceTag='dawnCorpsForceField';
const waveLadyOneMorePerTurnTag='waveLadyOneMorePerTurn',waveMaidServantTag='waveMaidServant';
const seniorStaffOneMorePerTurnTag='seniorStaffOneMorePerTurn',seniorStaffPerformanceTag='seniorStaffPerformance',seniorStaffChargeTag='seniorStaffCharge';
const ascendedOneMorePerTurnTag='ascendedOneMorePerTurn',ascendedChargeTag='ascendedCharge',ascendedDirtyHpTag='ascendedDirtyHp';
const direwolfSignTag='direwolfSign',direwolfBleedTag='direwolfBleed';
const isDirewolf=u=>u?.side==='enemy'&&(u.enemyKit?.id===1013020||u.enemyKit?.id===101302032);
const mechaFireBurnTag='mechaFireBurn',mechaFireBurningTag='mechaFireBurning',mechaFireMeltTag='mechaFireMelt';
const isMechaFire=u=>u?.side==='enemy'&&u.enemyKit?.id===1023010;
const maraSoldierReviveTag='maraSoldierRevive';
const wingedSerpentMarkTag=sourceId=>'wingedSerpentTurnMark:'+sourceId;
// 4034010 / 4034014 盗火行者与召唤体 4032020（残破容器）。
const fireProwlerOneMoreTag='fireProwlerOneMorePerTurn';
const fireProwlerReduceTag='fireProwlerAllDamageReduce';
const fireProwlerTimePowerTag='fireProwlerTimePower';
const fireProwlerChargeTag='fireProwlerCharge';
const fireProwlerMarkTag='fireProwlerRallyHpMark';
const fireProwlerDeathrattleTag='fireProwlerDeathrattle';
const fireProwlerHpBackTag='fireProwlerHpBack';
const fireProwlerServantTag='fireProwlerServant';
const isFireProwler=u=>u?.side==='enemy'&&(u.enemyKit?.id===4034010||u.enemyKit?.id===4034014);
const isFireProwlerVessel=u=>u?.side==='enemy'&&u.enemyKit?.id===4032020;
// 401301201 天谴先锋（FantasticStory 变体）。
const furiaePraetorArmorTag='furiaePraetorArmor';
const furiaePraetorOneMoreTag='furiaePraetorOneMorePerTurn';
const furiaePraetorVulnerabilityTag='furiaePraetorVulnerability';
const isFuriaePraetor=u=>u?.side==='enemy'&&u.enemyKit?.id===401301201;
// 402301001 / 402301002 正阳狮鹫（模板 4023010）。
const noontideGryphonMarkTag='noontideGryphonAegleMark';
const noontideGryphonOneMoreTag='noontideGryphonOneMorePerTurn';
const noontideGryphonSignTag='noontideGryphonSignOnAvatar';
const noontideGryphonUltraReadyTag='noontideGryphonUltraReady';
const noontideGryphonServantTag='noontideGryphonServant';
// 月夜天马（402302001）的【欧洛尼斯印记】尚未由其实现在施加端挂载；组合印记分支
// 依赖该 tag，因此当前场景里不可达。
const moonlitPegasusMarkTag='moonlitPegasusOronisMark';
const isNoontideGryphon=u=>u?.side==='enemy'&&(u.enemyKit?.id===402301001||u.enemyKit?.id===402301002);
// 4012020 天谴哲人：BookTarget（【宣教】）、城邦守护者【战甲】与永恒的活火。
const furiaePhilosopherBookTag='furiaePhilosopherBookTarget';
const furiaePhilosopherArmorTag='furiaePhilosopherArmor';
const furiaePhilosopherKillerTag='furiaePhilosopherBookKiller';
const isFuriaePhilosopher=u=>u?.side==='enemy'&&u.enemyKit?.id===4012020;
// 8002010 虚数织叶者：AIFlag 轮转与【后手】Attack 增伤。
const imaginaryWeaverAttackTag='imaginaryWeaverAttackUp';
const isImaginaryWeaver=u=>u?.side==='enemy'&&u.enemyKit?.id===8002010;
// 8003020 外宇宙之炎：Phase_Flag / AIFlag 双阶段、【焚烧】与【熔聚】。
const universeFireBurnTag='universeFireBurn';
const universeFireBurningTag='universeFireSpontaneousCombustion';
const universeFireMeltTag='universeFireMelt';
const isUniverseFireElite=u=>u?.side==='enemy'&&u.enemyKit?.id===8003020;
// 「醉于盛会的此刻」：MoC 5510/S1 的 3003050 本体与 PF 20273/S2 的 300305007 共用同一 AI。
const isPresentInebriated=u=>u?.side==='enemy'&&(u.enemyKit?.id===3003050||u.enemyKit?.id===300305007);
// 「身陷樊笼的往昔」(3003030)：使者带锁链的锁定 / 蓄力与笼中传福音的平均分摊。
const cagePastAimTag='cagePastAimTarget';
const cagePastAimingTag='cagePastIsAiming';
const isCagePast=u=>u?.side==='enemy'&&u.enemyKit?.id===3003030;
// 蚕食者之影 (800304016)：AIFlag 轮转 + 蓄力层数与 9 发黄金年代的解放。
const devourerShadowConfineTag='devourerShadowConfine';
const devourerShadowGuardTag='devourerShadowGuard';
const isDevourerShadow=u=>u?.side==='enemy'&&u.enemyKit?.id===800304016;

export function kitRuntime(api) {
  const {record,energy,advance,delay,damageTo,combatPanel,useAction,trueDamage}=api;
  function remove(b,to,id){to.buffs=to.buffs.filter(e=>e.id!==id);}
  function buff(b,from,to,name,key,value,duration=null,extra={}){
    const owner=extra.tickOwner?get(b,extra.tickOwner):to,id=extra.id??from.id+':'+name+':'+key;
    // 入场 / 秘技阶段施加、且在持有者回合开始递减的效果：持有者的第 1 个回合不应消耗持续时间，
    // 否则与「N 回合」的说明相比会少 1 回合（例如缇宝秘技的【神启】）。
    const preBattle=(extra.tickAt??'end')==='start'&&b.turnActor==null&&owner.turns===0;
    const item={type:'buff',id,name,key,value,remaining:duration,tickOwner:owner.id,tickAt:'end',appliedTurn:owner.turns,source:from.id,removeOnSourceDeath:!!(extra.merit||extra.bond),...extra,...(preBattle?{skipFirstTick:true}:{})};
    const at=to.buffs.findIndex(x=>x.id===id);if(at<0)to.buffs.push(item);else to.buffs[at]=item;
    record(b,'buff',from,{target:to.id,name,key,value,duration});if(item.debuff)relics.debuff(b,from,to,item);return item;
  }
  function illuminationDragonfishDefenseDown(b,from,candidates,reason,{allTargets=false,baseChance=null}={}){
    const pool=candidates.filter(to=>live(to)&&to.side!==from.side),limit=allTargets?pool.length:(pool.length>2?2:1),applied=[];
    for(let i=0;i<Math.min(limit,pool.length);i++){
      const to=allTargets?pool[i]:pool.splice(Math.floor(b.random()*pool.length),1)[0],attacker=combatPanel(from),target=combatPanel(to);
      const chance=Math.max(0,Math.min(1,(baseChance??from.enemyKit.defDownChance)*(1+(attacker.effectHit??0))*(1-(target.effectRes??0))));
      if(chance<1&&b.random()>=chance){record(b,'resist',to,{name:'抵抗【防御力降低】',source:from.id,chance});continue;}
      buff(b,from,to,'防御力降低','defShred',from.enemyKit.defDownRatio,from.enemyKit.defDownDuration,
        {id:from.id+':illumination-dragonfish-defense:'+to.id,tag:'illuminationDragonfishDefenseDown',debuff:true});
      applied.push(to.id);
    }
    record(b,'mechanic',from,{name:'【灯昼龙鱼】施加防御力降低',reason,attempted:Math.min(limit,candidates.filter(to=>live(to)&&to.side!==from.side).length),
      applied,maximumTargets:limit,chance:baseChance??from.enemyKit.defDownChance,ratio:from.enemyKit.defDownRatio,
      duration:from.enemyKit.defDownDuration});
  }
  function stacks(b,from,to,name,key,per,max,duration,extra={}){
    const id=extra.id??from.id+':'+name+':'+key,old=to.buffs.find(e=>e.id===id),n=Math.min(max,(old?.stacks??0)+1);
    return buff(b,from,to,name,key,per*n,duration,{...extra,id,stacks:n});
  }
  function resource(b,u,key,value){u.resources??={};u.resources[key]=value;record(b,'resource',u,{name:key,value});}
  function bubbleHoundTipsiness(b,from,to,kind,eventToken){
    if(to?.side!=='enemy'||to.enemyKit?.id!==3002030||to.resources?.['苏乐达陶醉计数事件']===eventToken)return false;
    const previous=Math.max(0,to.resources?.['苏乐达陶醉层数']??0),layers=Math.min(to.enemyKit.tipsinessMax??4,previous+1);
    to.resources['苏乐达陶醉计数事件']=eventToken;
    if(layers===previous)return false;
    resource(b,to,'苏乐达陶醉层数',layers);
    record(b,'mechanic',to,{name:'【苏乐达陶醉】受攻击 / 持续伤害叠层',layers,currentLayer:Math.max(1,layers),source:from?.id??null,damageKind:kind});
    return true;
  }
  function wingedSerpentLayers(u){return Math.max(0,u.resources?.['翼蛇形旋绕层数']??0);}
  function setWingedSerpentOneMore(b,u,active){
    u.buffs=u.buffs.filter(e=>e.tag!==wingedSerpentOneMoreTag);
    if(active)buff(b,u,u,'OneMorePerTurn','marker',0,null,{id:u.id+':winged-serpent-one-more',tag:wingedSerpentOneMoreTag});
  }
  function setWingedSerpentLayers(b,u,layers){
    const value=Math.max(0,Math.floor(layers));resource(b,u,'翼蛇形旋绕层数',value);
    const status=u.buffs.find(e=>e.tag===wingedSerpentChargeTag);
    if(status){status.stacks=value;status.value=value;}
    else if(value>0)buff(b,u,u,'蜷曲蓄力 · 旋绕','marker',value,null,{id:u.id+':winged-serpent-charge',tag:wingedSerpentChargeTag,stacks:value});
  }
  function clearWingedSerpentCharge(b,u,reason){
    const previous=wingedSerpentLayers(u),wasCharging=previous>0||u.buffs.some(e=>e.tag===wingedSerpentChargeTag);
    if(!wasCharging)return false;
    setWingedSerpentLayers(b,u,0);u.buffs=u.buffs.filter(e=>e.tag!==wingedSerpentChargeTag);
    resource(b,u,'翼蛇形本回合反击已触发',0);
    const flag=u.resources?.['翼蛇形AIFlag']??1,next=[3,4].includes(flag)?4:1;
    resource(b,u,'翼蛇形AIFlag',next);setWingedSerpentOneMore(b,u,true);
    for(const target of b.units)target.buffs=target.buffs.filter(e=>e.tag!==wingedSerpentMarkTag(u.id));
    record(b,'mechanic',u,{name:'【蜷曲蓄力】解除',reason,layers:previous,aiFlag:next,oneMorePerTurn:true});
    return true;
  }
  function wingedSerpentCanContinue(u){
    return !u.broken&&!u.cannotAct&&(u.skipTurns??0)<=0&&
      ![...(u.buffs??[]),...(u.dots??[])].some(e=>e.control||e.disableAction===true);
  }
  function spawnWaveLadyServants(b,boss){
    const blueprint=boss.enemyKit?.summonBlueprint;
    if(!blueprint)return 0;
    let spawned=0;
    for(let i=0;i<boss.enemyKit.summonCount;i++){
      const s=structuredClone(blueprint),order=b.units.reduce((n,t)=>Math.max(n,t.order??-1),-1)+1;
      s.id=boss.id+':servant:'+(i+1);s.summonerId=boss.id;s.order=order;s.active=true;s.wave=boss.wave??b.wave;
      s.hp=s.currentHp??s.panel.hp;s.energy=0;s.distance=10000*(boss.enemyKit.summonDelayRatio??1);s.advanceOrder=0;s.toughness=s.toughnessMax;
      s.broken=false;s.resources={};s.shields=[];s.buffs=[];s.dots=[];s.turns=0;s.skipTurns=0;
      Object.defineProperty(s,'battle',{value:b});b.units.push(s);b.rules?.unitCreated?.(b,s);
      buff(b,boss,s,'MCommon_Servant','marker',0,null,{id:boss.id+':servant-marker:'+s.id,tag:waveMaidServantTag,removeOnSourceDeath:true});
      record(b,'summon',boss,{name:'召唤浪花侍女',target:s.id,monsterId:s.childId,slot:i===0?'BeforeCaster':'AfterCaster'});spawned++;
    }
    return spawned;
  }
  const jinrenUnstableTag='jinrenUnstable',jinrenShakeTag='jinrenShake',jinrenTargetTag='jinrenTarget';
  function jinrenDebuffChance(b,from,to,base){
    const eh=combatPanel(from).effectHit??0,res=combatPanel(to).effectRes??0;
    return Math.max(0,Math.min(1,base*(1+eh)*(1-res)));
  }
  function applyJinrenUnstable(b,from,to,base){
    if(!live(to)||to.buffs.some(e=>e.tag===jinrenUnstableTag||e.tag===jinrenShakeTag))return false;
    if(b.random()>=jinrenDebuffChance(b,from,to,base)){record(b,'resist',to,{name:'抵抗【震荡】',source:from.id});return false;}
    buff(b,from,to,'震荡','marker',0,from.enemyKit.unstableDuration,{tag:jinrenUnstableTag,debuff:true,tickAt:'end'});
    return true;
  }
  function longRightMonitor(b,boss){return enemies(b,boss).find(t=>t.buffs.some(e=>e.tag===longRightMonitorTag&&e.source===boss.id))??null;}
  function longRightSetMonitor(b,boss,to,reason){
    for(const target of b.units)target.buffs=target.buffs.filter(e=>!(e.tag===longRightMonitorTag&&e.source===boss.id));
    if(live(to))buff(b,boss,to,'监视目标','marker',0,null,{id:boss.id+':long-right-monitor',tag:longRightMonitorTag,removeOnSourceDeath:true});
    record(b,'mechanic',boss,{name:'【监视目标】更新',target:live(to)?to.id:null,reason});
  }
  function longRightRandomTarget(b,u){const pool=enemies(b,u);return pool.length?pool[Math.floor(b.random()*pool.length)]:null;}
  function longRightNextAction(b,u){
    const flag=u.resources?.['长右AIFlag']??1;
    const key=({1:'skill04',2:'skill03',3:'skill01',4:'skill03',5:'skill01',6:'skill03',7:'skill02',8:'skill05'})[flag]??'skill04';
    resource(b,u,'长右AIFlag',flag>=8?1:flag+1);
    const target=key==='skill04'?longRightRandomTarget(b,u):key==='skill01'||key==='skill02'?longRightMonitor(b,u):null;
    return {key,...(target?{targetId:target.id}:{})};
  }
  function longRightEnemyAction(b,u){
    resource(b,u,'长右本回合额外行动',u.enemyKit.extraActionsPerTurn??1);
    return longRightNextAction(b,u);
  }
  // ── 4034010 / 4034014 至黑之剑 · 盗火行者，以及 4032020 残破容器 ────────────────────
  // 固定版本数据：DimbreathBot/TurnBasedGameData@312b4597 的
  // Monster_W4_FireProwler_00_{AI,Ability,Config}.json（FantasticStory 变体同名后缀）与
  // Monster_W4_FireProwler_01_{AI,Ability,Config}.json。Ability 里的 dynamic 哈希按
  // Character Config 的 DynamicValues.Floats 解析到 SkillParam / 本地动态值。
  const fireProwlerActionDistance=10000; // 与 engine.mjs 的 ACTION_DISTANCE 同值
  function fireProwlerMaxHp(u){return combatPanel(u).hp*(u.phaseRatios?.[(u.hpPhase??1)-1]??1);}
  function fireProwlerVessels(b,boss,kind=null){
    return b.units.filter(t=>live(t)&&t.summonerId===boss.id&&t.enemyKit?.id===4032020&&(!kind||t.enemyKit?.vesselKind===kind));
  }
  function fireProwlerTimePower(u){return Math.max(0,Math.floor(u.resources?.['盗火行者灾难之力']??0));}
  function fireProwlerPhase(u){return u.resources?.['盗火行者PhaseFlag']??1;}
  function fireProwlerSkillFlag(u){return u.resources?.['盗火行者SkillFlag']??1;}
  function fireProwlerAssistFlag(u){return u.resources?.['盗火行者AssistFlag']??1;}
  function fireProwlerMarks(u){return u.buffs.filter(e=>e.tag===fireProwlerMarkTag);}
  function fireProwlerSetTimePower(b,u,layers,reason){
    const value=Math.max(0,Math.floor(layers));u.resources??={};u.resources['盗火行者灾难之力']=value;
    u.buffs=u.buffs.filter(e=>e.tag!==fireProwlerTimePowerTag);
    if(value>0)buff(b,u,u,'灾难之力','marker',value,null,{id:u.id+':fire-prowler-time-power',tag:fireProwlerTimePowerTag,stacks:value});
    record(b,'mechanic',u,{name:'【灾难之力】层数更新',layers:value,reason});
  }
  function fireProwlerReduceLayers(u){return u.buffs.find(e=>e.tag===fireProwlerReduceTag)?.stacks??0;}
  function fireProwlerSetReduce(b,u,layers,reason){
    const max=u.enemyKit?.allDamageReduceLayers??8,per=u.enemyKit?.allDamageReducePerLayer??.05,
      value=Math.max(0,Math.min(max,Math.floor(layers)));
    u.buffs=u.buffs.filter(e=>e.tag!==fireProwlerReduceTag);
    if(value>0)buff(b,u,u,'永别的决绝 · 全伤害减免','dmgReduction',per*value,null,
      {id:u.id+':fire-prowler-all-damage-reduce',tag:fireProwlerReduceTag,stacks:value});
    // MMonster_W4_FireProwler_00_AllDamageReduce 的 OnStack 把 Layer 与每层比例相乘写入
    // AllDamageReduce 属性，Layer 归零时 RemoveSelfModifier。
    record(b,'mechanic',u,{name:'【永别的决绝】减伤层数更新',layers:value,perLayer:per,damageReduction:per*value,reason});
  }
  function fireProwlerHasOneMore(u){return !!tag(u,fireProwlerOneMoreTag);}
  function fireProwlerSetOneMore(b,u,active,reason){
    const had=fireProwlerHasOneMore(u);u.buffs=u.buffs.filter(e=>e.tag!==fireProwlerOneMoreTag);
    if(active)buff(b,u,u,'OneMorePerTurn','marker',0,null,{id:u.id+':fire-prowler-one-more',tag:fireProwlerOneMoreTag});
    if(had!==active)record(b,'mechanic',u,{name:'OneMorePerTurn 更新',active,reason});
  }
  function fireProwlerSetCharge(b,u,active,reason){
    const had=!!tag(u,fireProwlerChargeTag);
    if(active===had)return;
    if(active){buff(b,u,u,'Charge','marker',0,null,{id:u.id+':fire-prowler-charge',tag:fireProwlerChargeTag});return;}
    // Charge 的 OnDestroy：恢复阶段外观并追加 OneMorePerTurn。
    u.buffs=u.buffs.filter(e=>e.tag!==fireProwlerChargeTag);
    fireProwlerSetOneMore(b,u,true,'Charge 解除');
    record(b,'mechanic',u,{name:'【沉默的悲叹】Charge 解除',reason,oneMorePerTurn:true});
  }
  function fireProwlerAddMark(b,boss,vessel,hpCost,reason){
    if(!live(boss))return;
    const ratio=hpCost/Math.max(1,fireProwlerMaxHp(boss));
    buff(b,boss,boss,'苦痛缠绕 · 印记','marker',Math.max(0,hpCost),null,
      {id:boss.id+':fire-prowler-mark:'+vessel.id,tag:fireProwlerMarkTag,vesselId:vessel.id,
        vesselKind:vessel.enemyKit?.vesselKind??null,stacks:1});
    record(b,'mechanic',boss,{name:'【苦痛缠绕】印记',vessel:vessel.id,hpCost,hpRatio:ratio,reason});
  }
  function fireProwlerRemoveAllMarks(b,boss,reason){
    const count=fireProwlerMarks(boss).length;
    boss.buffs=boss.buffs.filter(e=>e.tag!==fireProwlerMarkTag);
    if(count)record(b,'mechanic',boss,{name:'【苦痛缠绕】印记全部移除',count,reason});
    return count;
  }
  function fireProwlerLoseHp(b,u,amount,reason){
    if(!live(u)||!(amount>0))return 0;
    const value=Math.min(u.hp,amount);u.hp-=value;
    record(b,'hp_consume',u,{target:u.id,amount:value,hp:u.hp,reason});
    if(!live(u)){record(b,'death',u,{name:reason});b.rules?.death?.(b,null,u);}
    return value;
  }
  function fireProwlerHeal(b,u,amount,reason){
    if(!live(u)||!(amount>0))return 0;
    const value=Math.min(fireProwlerMaxHp(u)-u.hp,amount);
    if(value<=0)return 0;
    u.hp+=value;record(b,'heal',u,{target:u.id,amount:value,hp:u.hp,reason});
    return value;
  }
  function fireProwlerForceKill(b,u,reason){
    if(u.active===false)return false;
    u.buffs=u.buffs.filter(e=>e.tag!==fireProwlerHpBackTag&&e.tag!==fireProwlerDeathrattleTag);
    u.active=false;u.hp=0;
    record(b,'mechanic',u,{name:'ForceKill · 容器退场',reason});
    return true;
  }
  function fireProwlerSpawnVessel(b,boss,kind,reason){
    const blueprint=boss.enemyKit?.vesselBlueprints?.[kind];if(!blueprint)return null;
    const s=structuredClone(blueprint);
    b.enemyMechanics??={};b.enemyMechanics.fireProwlerVesselSerial=(b.enemyMechanics.fireProwlerVesselSerial??0)+1;
    s.id=boss.id+':vessel:'+kind+':'+b.enemyMechanics.fireProwlerVesselSerial;
    s.summonerId=boss.id;s.order=b.units.reduce((n,t)=>Math.max(n,t.order??-1),-1)+1;s.active=true;s.wave=boss.wave??b.wave;
    s.hp=s.currentHp??s.panel.hp;s.energy=0;s.distance=fireProwlerActionDistance;s.advanceOrder=0;
    s.toughness=s.toughnessMax;s.broken=false;s.resources={};s.shields=[];s.buffs=[];s.dots=[];s.turns=0;s.skipTurns=0;
    Object.defineProperty(s,'battle',{value:b});b.units.push(s);b.rules?.unitCreated?.(b,s);
    buff(b,boss,s,'MCommon_Servant','marker',0,null,{id:boss.id+':fire-prowler-servant:'+s.id,tag:fireProwlerServantTag,removeOnSourceDeath:true});
    record(b,'summon',boss,{name:'召唤'+s.name,target:s.id,monsterId:s.monsterId,childId:s.childId,kind,reason});
    fireProwlerVesselInitiate(b,boss,s,reason);
    return s;
  }
  // PassiveSkillInitiate：首领没有 Charge 时才按 PassiveSkill01[1]（缺省 0）扣血并挂印记，
  // 并写入 01_DeathRattle（死亡遗言自伤）。无论是否扣血都会写入 DamageValue（仅表现）。
  function fireProwlerVesselInitiate(b,boss,vessel,reason){
    const hasCharge=!!tag(boss,fireProwlerChargeTag);
    if(hasCharge){vessel.resources['容器入场生命消耗']=0;
      record(b,'mechanic',boss,{name:'容器入场 · 首领持有 Charge，跳过生命消耗与印记',vessel:vessel.id,reason});return;}
    const ratio=vessel.enemyKit?.hpCostRatio??0,raw=fireProwlerMaxHp(boss)*ratio,paid=fireProwlerLoseHp(b,boss,Math.max(1,raw),'容器入场 · LoseHPByRatio');
    vessel.resources['容器入场生命消耗']=paid;
    if(paid>0)fireProwlerAddMark(b,boss,vessel,paid,'容器入场');
    buff(b,vessel,vessel,'死亡遗言','marker',0,null,{id:vessel.id+':fire-prowler-deathrattle',tag:fireProwlerDeathrattleTag});
    record(b,'mechanic',boss,{name:'容器入场结算',vessel:vessel.id,hpCostRatio:ratio,hpCost:paid,
      hpRatio:paid/Math.max(1,fireProwlerMaxHp(boss)),reason});
  }
  // 容器阵亡：只有带死亡遗言（01_DeathRattle）或 HPBack 的容器才会触发首领侧结算——
  // 移除该容器对应的苦痛缠绕印记、把永别的决绝减 1 层；死亡遗言额外让首领自伤
  // Skill01[4]（5%）最大生命。被 Skill06 / Skill07 ForceKill 且已解除 DeathRattle 的容器
  // 不产生任何结算。HPBack 在首领仍有灾难之力时消耗 1 层重新召唤 403202003。
  function fireProwlerVesselDeath(b,vessel){
    const boss=get(b,vessel.summonerId);
    if(!live(boss))return;
    const rattle=!!tag(vessel,fireProwlerDeathrattleTag),hpBack=!!tag(vessel,fireProwlerHpBackTag);
    if(!rattle&&!hpBack){
      record(b,'mechanic',boss,{name:'容器退场 · 无死亡遗言 / HPBack，不触发首领结算',
        vessel:vessel.id,kind:vessel.enemyKit?.vesselKind??null});
      return;
    }
    boss.buffs=boss.buffs.filter(e=>!(e.tag===fireProwlerMarkTag&&e.vesselId===vessel.id));
    const layers=fireProwlerReduceLayers(boss);
    if(layers>0)fireProwlerSetReduce(b,boss,layers-1,'容器被消灭');
    let selfDamage=0;
    if(rattle)selfDamage=fireProwlerLoseHp(b,boss,fireProwlerMaxHp(boss)*(boss.enemyKit?.skill01Params?.[4]??.05),'死亡遗言');
    record(b,'mechanic',boss,{name:'容器被消灭',vessel:vessel.id,kind:vessel.enemyKit?.vesselKind??null,deathrattle:rattle,
      hpBack:hpBack,selfDamage,reduceLayers:fireProwlerReduceLayers(boss)});
    if(!hpBack||!live(boss))return;
    const tp=fireProwlerTimePower(boss);
    if(tp<=0){boss.resources['盗火行者HPBack批次']=0;return;}
    if((boss.resources['盗火行者HPBack批次']??0)>0)return;
    boss.resources['盗火行者HPBack批次']=1;
    fireProwlerSetTimePower(b,boss,tp-1,'迷失的共祭 · 消耗 1 层灾难之力');
    fireProwlerLoseHp(b,boss,Math.max(1,fireProwlerMaxHp(boss)*(boss.enemyKit?.skill04Params?.[1]??.05)),'迷失的共祭 · 重新召唤代价');
    const next=fireProwlerSpawnVessel(b,boss,'c','迷失的共祭 · 重新召唤');
    if(next){buff(b,next,next,'HPBack','marker',0,null,{id:next.id+':fire-prowler-hpback',tag:fireProwlerHpBackTag});
      record(b,'mechanic',boss,{name:'【迷失的共祭】重新召唤残破容器',vessel:next.id,timePower:fireProwlerTimePower(boss)});}
  }
  function fireProwlerSummon(b,boss,kind,count,reason){
    const spawned=[];
    for(let i=0;i<count;i++){const s=fireProwlerSpawnVessel(b,boss,kind,reason);if(s)spawned.push(s);}
    return spawned;
  }
  // 每一名助战容器在首领的 Skill01_Assist / Skill02_Assist 里追加一次伤害节点
  // （DamageByAttackProperty 的 Caster 仍是首领，因此按首领攻击力结算），倍率由容器
  // 自己的 Skill01[0]/[1]（A=0.5/0.25）或 Skill02[0]（B=0.5）经
  // MMonster_W4_FireProwler_01_DamageValue 的 MDF_Skill01/MDF_Skill02 复制而来。
  function fireProwlerVesselAssist(b,boss,vessel,reason,mainTarget=null){
    const kit=vessel.enemyKit?.assist;if(!kit||!kit.main)return;
    const hit={name:'残破容器 · 助战追加',type:'Normal',element:'Physical',
      terms:[{scaling:'atk',multiplier:kit.main},...(kit.adjacent?[{scaling:'atk',multiplier:kit.adjacent,target:'adjacent'}]:[])],
      toughness:0,hitEnergy:5,hitEnergyPerHit:true};
    if(kit.target==='all'){for(const to of enemies(b,boss))damageTo(b,boss,to,hit,1,'primary','direct');}
    else {const pool=enemies(b,boss),to=mainTarget&&pool.some(t=>t.id===mainTarget.id)?mainTarget:pool[0];
      if(to){damageTo(b,boss,to,hit,1,'primary','direct');
        const at=pool.findIndex(t=>t.id===to.id);
        for(const adj of [pool[at-1],pool[at+1]].filter(t=>t&&live(t)))damageTo(b,boss,adj,hit,1,'adjacent','direct');}}
    record(b,'mechanic',boss,{name:'容器助战追加',vessel:vessel.id,kind:vessel.enemyKit?.vesselKind??null,
      target:kit.target,main:kit.main,adjacent:kit.adjacent??0,targetId:kit.target==='all'?null:(mainTarget?.id??null),reason});
  }
  function fireProwlerNextAction(b,u,oneMore=false){
    const phase=fireProwlerPhase(u),flag=u.resources?.['盗火行者AIFlag']??1,setFlag=v=>resource(b,u,'盗火行者AIFlag',v);
    // SkillFlag 决定 亡死的黑云 / 将尽的命数 的交替，并在释放后取反。
    const alternate=()=>{const skill=fireProwlerSkillFlag(u);resource(b,u,'盗火行者SkillFlag',skill===1?2:1);
      return {key:skill===1?'skill01':'skill02'};};
    // 幽冥的悼念：Assist_Flag 决定助战容器种类。没有对应容器时技能照常以首领自身
    // 阵型结算（Skill01 4.0/2.0 或 Skill02 3.0），只是没有容器追加攻击。
    const mourning=()=>({key:'skill06'});
    // Monster_W4_FireProwler_00_AI_FantasticStory 只有三个阶段决策：异相仲裁形态不进入
    // 第二血条、不召唤容器，决策 2 用当前追加行动（OneMore）决定是否继续攻击。
    if(u.enemyKit?.fantasticStory){
      if(phase>=2){setFlag(1);return {key:'skill07'};}
      if(flag===1){setFlag(2);return alternate();}
      if(flag===2){
        if(oneMore){setFlag(2);return alternate();}
        fireProwlerSetOneMore(b,u,false,'FantasticStory · 沉默的悲叹前移除追加行动');
        setFlag(3);return {key:'skill04'};
      }
      setFlag(1);return {key:'skill07'};
    }
    if(phase>=2){
      if(flag===1){setFlag(2);return alternate();}
      if(flag===2){setFlag(3);return {key:'skill03'};}
      if(flag===3){resource(b,u,'盗火行者AssistFlag',fireProwlerSkillFlag(u)===1?2:1);setFlag(4);return mourning();}
      if(flag===4){
        // ChangePhase1 之前/之后的 AI 决策 4 都会先移除 OneMore 与 OneMorePerTurn。
        fireProwlerSetOneMore(b,u,false,'【沉默的悲叹】前移除追加行动');
        setFlag(5);return {key:'skill04'};
      }
      setFlag(1);return {key:'skill07'};
    }
    if(flag===1){setFlag(2);return alternate();}
    if(flag===2){setFlag(3);return alternate();}
    if(flag===3){
      if(fireProwlerVessels(b,u).length){setFlag(4);return {key:'skill03'};}
      setFlag(2);return alternate();
    }
    if(flag===4){setFlag(5);return mourning();}
    if(flag===5){setFlag(6);return mourning();}
    setFlag(1);return {key:'skill05'};
  }
  function fireProwlerEnemyAction(b,u){
    return fireProwlerNextAction(b,u,false);
  }
  function fireProwlerInitialize(b,u){
    u.resources??={};
    resource(b,u,'盗火行者PhaseFlag',u.resources['盗火行者PhaseFlag']??1);
    resource(b,u,'盗火行者AIFlag',u.resources['盗火行者AIFlag']??1);
    resource(b,u,'盗火行者SkillFlag',u.resources['盗火行者SkillFlag']??1);
    resource(b,u,'盗火行者AssistFlag',u.resources['盗火行者AssistFlag']??1);
    resource(b,u,'盗火行者本回合追加行动',0);
    resource(b,u,'盗火行者HPBack批次',0);
    if(u.resources['盗火行者灾难之力']==null)resource(b,u,'盗火行者灾难之力',0);
    if(!u.enemyKit?.fantasticStory&&!fireProwlerHasOneMore(u))
      fireProwlerSetOneMore(b,u,true,'战斗开始 · OneMorePerTurn');
    // PassiveSkill01：!FantasticStory 时以 Skill01[3] 层施加永别的决绝（全伤害减免）。
    if(!u.enemyKit?.fantasticStory&&fireProwlerReduceLayers(u)===0)
      fireProwlerSetReduce(b,u,u.enemyKit?.skill01Params?.[3]??8,'战斗开始 · PassiveSkill01');
  }
  function fireProwlerSummonAction(b,u,key){
    if(u.enemyKit?.fantasticStory)return []; // SummonMonster 受 !FantasticStory 门控
    const count=fireProwlerPhase(u)>=2?(u.enemyKit.phaseTwoSummonCount??4):(u.enemyKit.phaseOneSummonCount??2);
    return fireProwlerSummon(b,u,key==='skill01'?'a':'b',count,key==='skill01'?'亡死的黑云':'将尽的命数');
  }
  function fireProwlerCrossing(b,u,kind='normal'){
    const activated=[];
    for(const v of fireProwlerVessels(b,u)){
      if(tag(v,'fireProwlerActivated'))continue;
      buff(b,u,v,'已激活','marker',0,null,{id:v.id+':fire-prowler-activated',tag:'fireProwlerActivated'});activated.push(v.id);
    }
    // Skill03 Phase02：ByAny[PhaseEqual2, Template(Caster=4034017)] && !HasMod(OneMore) 时
    // ModifyCurrentSkillDelayCost Skill03[0]（混沌回忆 0.5、异相仲裁 0）。引擎里 OneMore
    // 只可能出现在追加行动中，因此以 kind==='continuation' 作为 !HasMod(OneMore) 的等价条件。
    const delayCost=fireProwlerPhase(u)>=2&&kind!=='continuation'?(u.enemyKit.skill03Params?.[0]??0):null;
    if(delayCost!=null)u.distance=fireProwlerActionDistance*delayCost;
    record(b,'mechanic',u,{name:'【相混的道途】激活容器',activated,delayCost});
  }
  function fireProwlerSilentSigh(b,u){
    fireProwlerSetCharge(b,u,true,'【沉默的悲叹】');
    const summoned=u.enemyKit?.fantasticStory?[]:fireProwlerSummon(b,u,'c',u.enemyKit?.phaseTwoSummonCount??4,'【沉默的悲叹】');
    let cost=0;
    for(const v of summoned){
      const paid=fireProwlerLoseHp(b,u,Math.max(1,fireProwlerMaxHp(u)*(u.enemyKit?.skill04Params?.[1]??.05)),'【沉默的悲叹】· 召唤代价');
      if(paid>0){fireProwlerAddMark(b,u,v,paid,'【沉默的悲叹】');cost+=paid;}
    }
    for(const v of fireProwlerVessels(b,u)){
      if(!tag(v,fireProwlerHpBackTag))buff(b,u,v,'HPBack','marker',0,null,{id:v.id+':fire-prowler-hpback',tag:fireProwlerHpBackTag});
      if(!tag(v,fireProwlerServantTag))buff(b,u,v,'MCommon_Servant','marker',0,null,
        {id:u.id+':fire-prowler-servant:'+v.id,tag:fireProwlerServantTag,removeOnSourceDeath:true});
    }
    const layers=(u.resources?.['盗火行者灾难之力']??0)+(u.enemyKit?.skill04Params?.[0]??8);
    fireProwlerSetTimePower(b,u,layers,'【沉默的悲叹】');
    const delayCost=u.enemyKit?.skill04Params?.[2]??1;
    u.distance=fireProwlerActionDistance*delayCost;
    record(b,'mechanic',u,{name:'【沉默的悲叹】结算',summoned:summoned.map(v=>v.id),hpCost:cost,
      timePower:fireProwlerTimePower(u),delayCost});
  }
  function fireProwlerNecessarySuffering(b,u,a){
    const params=u.enemyKit?.skill05Params??[2,1,2],attackCount=Math.max(0,a?.fireProwlerAttackCount??0),
      hits=a?.fireProwlerHits??0;
    // Skill05 Phase02：AttackCount 为 2 / 4 / >=6 时分别结算 2 / 4 / 6 段 Skill05[1]；
    // 恰为 8 时在 6 段之后追加 1 段 2×Skill05[1]。其余取值（含 AttackCount=0）走
    // Skill05_Attack 分支，只有 1 段 Skill05[2]。收尾固定追加 OneMorePerTurn。
    if(hits===0){
      const fallback={name:'却是必要的苦难 · 收束',type:'Normal',element:'Physical',
        terms:[{scaling:'atk',multiplier:params[2]}],toughness:0,hitEnergy:0};
      for(const to of enemies(b,u))damageTo(b,u,to,fallback,1,'primary','direct');
    }
    if(attackCount===8){
      const bonus={name:'却是必要的苦难 · 第 8 段',type:'Normal',element:'Physical',
        terms:[{scaling:'atk',multiplier:params[1]*2}],toughness:0,hitEnergy:0};
      for(const to of enemies(b,u))damageTo(b,u,to,bonus,1,'primary','direct');
    }
    fireProwlerSetTimePower(b,u,0,'【却是必要的苦难】消耗全部灾难之力');
    fireProwlerSetOneMore(b,u,true,'【却是必要的苦难】结束');
    record(b,'mechanic',u,{name:'【却是必要的苦难】结算',attackCount,shadowHits:hits,
      bonusHit:attackCount===8,fallbackMultiplier:hits===0?params[2]:null});
  }
  function fireProwlerMourning(b,u,a,selected){
    const flag=fireProwlerAssistFlag(u),kind=a?.fireProwlerAssistKind??(flag===2?'b':'a'),
      cap=fireProwlerPhase(u)>=2?(u.enemyKit?.assistCountPhaseTwo??4):(u.enemyKit?.assistCountPhaseOne??2),
      assisting=fireProwlerVessels(b,u,kind).slice(0,cap),
      mainTarget=selected?.find(to=>to&&to.side!==u.side&&live(to))??null;
    if(!assisting.length){
      // Skill06_Phase02 的 TriggerParallelAbility 位于 RetargetList 的任务列表内：
      // 首领自身的阵型攻击与容器助战属于同一组并行技能，没有可助战的容器时整组都不执行，
      // 因此本回合不造成任何伤害；Assist_Flag 也不会被改写。
      record(b,'mechanic',u,{name:'【幽冥的悼念】没有可助战的容器 · 本回合无伤害',assistFlag:flag,kind});
      return;
    }
    const pool=enemies(b,u);
    if(!pool.length||!a?.terms?.length)
      record(b,'mechanic',u,{name:'【幽冥的悼念】阵型攻击未命中',assistFlag:flag,kind});
    let timePowerGain=0,healed=0;
    for(let i=0;i<assisting.length;i++){
      const v=assisting[i];
      fireProwlerVesselAssist(b,u,v,'【幽冥的悼念】',mainTarget);
      // 容器自身的 Skill01_Assist / Skill02_Assist：移除自己的苦痛缠绕印记与死亡遗言，
      // 每名容器为灾难之力叠加 PassiveSkill01[0] 层。
      u.buffs=u.buffs.filter(e=>!(e.tag===fireProwlerMarkTag&&e.vesselId===v.id));
      v.buffs=v.buffs.filter(e=>e.tag!==fireProwlerDeathrattleTag);
      const per=v.enemyKit?.passive01Params?.[0]??0;
      if(per>0){timePowerGain+=per;fireProwlerSetTimePower(b,u,fireProwlerTimePower(u)+per,'容器助战 · TimePower');}
      if(i===assisting.length-1){
        // 最后一次助战（AssistCount == 助战上限）触发 HealHP：HealByTargetMaxHP
        const healRatio=v.enemyKit?.passive01Params?.[1]??0;
        if(healRatio>0)healed=fireProwlerHeal(b,u,fireProwlerMaxHp(u)*healRatio*assisting.length,'容器助战 · 最后一次');
        record(b,'mechanic',u,{name:'【幽冥的悼念】最后一名容器助战',vessel:v.id,timePowerPerAssist:per,healRatio});
      }
      fireProwlerForceKill(b,v,'【幽冥的悼念】· 助战后退场');
    }
    record(b,'mechanic',u,{name:'【幽冥的悼念】结算',assistFlag:flag,kind,assisting:assisting.map(v=>v.id),
      timePowerGain,healed,mainTarget:mainTarget?.id??null});
  }
  function fireProwlerFarewell(b,u,a){
    const params=u.enemyKit?.skill07Params??[1,1.6,3],attackCount=Math.max(0,a?.fireProwlerAttackCount??0);
    const hit={name:'莫因舍弃而哭泣 · 连续斩',type:'Normal',element:'Physical',
      terms:[{scaling:'atk',multiplier:params[1]}],toughness:0,hitEnergy:15,hitEnergyPerHit:true};
    for(let i=0;i<attackCount;i++)for(const to of enemies(b,u))damageTo(b,u,to,hit,1,'primary','direct');
    const vessels=fireProwlerVessels(b,u),heal=fireProwlerMarks(u).reduce((n,e)=>n+(e.value??0),0);
    for(const v of vessels)fireProwlerForceKill(b,v,'【莫因舍弃而哭泣】');
    const healed=fireProwlerHeal(b,u,heal,'【莫因舍弃而哭泣】· 苦痛缠绕');
    fireProwlerRemoveAllMarks(b,u,'【莫因舍弃而哭泣】');
    fireProwlerSetTimePower(b,u,0,'【莫因舍弃而哭泣】');
    fireProwlerSetOneMore(b,u,true,'【莫因舍弃而哭泣】');
    fireProwlerSetCharge(b,u,false,'【莫因舍弃而哭泣】');
    record(b,'mechanic',u,{name:'【莫因舍弃而哭泣】结算',extraHits:attackCount,vessels:vessels.length,healed});
  }
  function fireProwlerAfter(b,u,key,kind,a,selected){
    if(!isFireProwler(u))return;
    if(key==='skill01'||key==='skill02')fireProwlerSummonAction(b,u,key);
    else if(key==='skill03')fireProwlerCrossing(b,u,kind);
    else if(key==='skill04')fireProwlerSilentSigh(b,u);
    else if(key==='skill05')fireProwlerNecessarySuffering(b,u,a);
    else if(key==='skill06')fireProwlerMourning(b,u,a,selected);
    else if(key==='skill07')fireProwlerFarewell(b,u,a);
    // OneMorePerTurn：每回合最多一次追加行动；本次已经是追加行动时不再授予。
    resource(b,u,'盗火行者本回合追加行动',fireProwlerHasOneMore(u)&&kind!=='continuation'?1:0);
  }
  function fireProwlerChargeBreak(b,u){
    // MMonster_W4_FireProwler_00_Charge 的 OnBeingBreak：AIFlag=1；有苦痛缠绕印记时
    // 只移除全部印记，否则插入 MonsterForceKill（Monster_W4_FireProwler_00_ChargeBreak：
    // 永别的决绝减 1 层、移除 HPBack、ForceKill 全部容器）；随后灾难之力按当前层数
    // 一次性抵消为空，最后移除 Charge 自身（OnDestroy 追加 OneMorePerTurn）。
    const before=fireProwlerTimePower(u),vessels=fireProwlerVessels(b,u);
    resource(b,u,'盗火行者AIFlag',1);
    let forceKilled=0,marksRemoved=0,reduceLayers=fireProwlerReduceLayers(u);
    if(fireProwlerMarks(u).length)marksRemoved=fireProwlerRemoveAllMarks(b,u,'Charge 被击破');
    else{
      if(reduceLayers>0)fireProwlerSetReduce(b,u,reduceLayers-1,'ChargeBreak · MonsterForceKill');
      for(const v of vessels)if(fireProwlerForceKill(b,v,'ChargeBreak'))forceKilled++;
      u.resources['盗火行者HPBack批次']=0;
    }
    fireProwlerSetTimePower(b,u,0,'Charge 被击破');
    fireProwlerSetCharge(b,u,false,'Charge 被击破');
    record(b,'mechanic',u,{name:'【沉默的悲叹】被击破 · ChargeBreak',timePowerBefore:before,
      marksRemoved,forceKilled,aiFlag:1});
  }
  function fireProwlerPhaseChange(b,to,previousPhase,nextPhase){
    // Monster_W4_FireProwler_00_ChangePhase1：静默驱散自身状态、灾难之力清零、
    // 以 Skill01[3]=8 层重新施加 AllDamageReduce、SetActionDelay 0，
    // 并把 Phase_Flag 置 2、AIFlag 置 1、SkillFlag 置 2。
    const dispelled=to.buffs.filter(e=>e.debuff).map(e=>e.name);
    to.buffs=to.buffs.filter(e=>!e.debuff);to.dots=[];
    const timePowerBefore=fireProwlerTimePower(to);
    fireProwlerSetTimePower(b,to,0,'ChangePhase1');
    fireProwlerSetReduce(b,to,to.enemyKit?.skill01Params?.[3]??8,'ChangePhase1');
    fireProwlerSetCharge(b,to,false,'ChangePhase1');
    resource(b,to,'盗火行者PhaseFlag',2);
    resource(b,to,'盗火行者AIFlag',1);
    resource(b,to,'盗火行者SkillFlag',2);
    resource(b,to,'盗火行者本回合追加行动',0);
    resource(b,to,'盗火行者HPBack批次',0);
    to.distance=0; // SetActionDelay 0
    record(b,'mechanic',to,{name:'盗火行者切换生命阶段',fromPhase:previousPhase,toPhase:nextPhase,dispelled,
      timePowerBefore,damageReduceLayers:fireProwlerReduceLayers(to),delay:0,phaseFlag:2,aiFlag:1,skillFlag:2});
  }
  function continueAction(b,actor,key){
    if(isFireProwler(actor)){
      if((actor.resources?.['盗火行者本回合追加行动']??0)<=0)return null;
      resource(b,actor,'盗火行者本回合追加行动',0);
      if(!live(actor)||actor.broken||actor.cannotAct||(actor.skipTurns??0)>0){
        record(b,'skip',actor,{name:'控制 / 弱点击破中断盗火行者 OneMorePerTurn'});return null;
      }
      return fireProwlerNextAction(b,actor,true);
    }
    if(isFuriaePraetor(actor)){
      if((actor.resources?.['天谴先锋本回合追加行动']??0)<=0)return null;
      resource(b,actor,'天谴先锋本回合追加行动',0);
      if(!live(actor)||actor.broken||actor.cannotAct||(actor.skipTurns??0)>0){
        record(b,'skip',actor,{name:'控制 / 弱点击破中断天谴先锋 OneMorePerTurn'});return null;
      }
      return furiaePraetorNextAction(b,actor,true);
    }
    if(isNoontideGryphon(actor)){
      if((actor.resources?.['正阳狮鹫本回合追加行动']??0)<=0)return null;
      resource(b,actor,'正阳狮鹫本回合追加行动',0);
      if(!live(actor)||actor.broken||actor.cannotAct||(actor.skipTurns??0)>0){
        record(b,'skip',actor,{name:'控制 / 弱点击破中断正阳狮鹫 OneMorePerTurn'});return null;
      }
      return noontideGryphonNextAction(b,actor);
    }
    if(actor.side==='enemy'&&actor.enemyKit?.id===403301002){
      if((actor.resources?.['黑潮蚀魔本回合追加行动']??0)<=0)return null;
      resource(b,actor,'黑潮蚀魔本回合追加行动',0);
      if(!live(actor)||actor.broken||actor.cannotAct||(actor.skipTurns??0)>0){
        record(b,'skip',actor,{name:'控制 / 弱点击破中断黑潮蚀魔 OneMorePerTurn'});return null;
      }
      return blackTideNextAction(b,actor,true);
    }
    if(actor.side==='enemy'&&actor.enemyKit?.id===8033010){
      if((actor.resources?.['资深员工本回合追加行动']??0)<=0)return null;
      resource(b,actor,'资深员工本回合追加行动',0);
      if(!live(actor)||actor.broken||actor.cannotAct||(actor.skipTurns??0)>0){
        record(b,'skip',actor,{name:'控制 / 弱点击破中断组长 OneMorePerTurn'});return null;
      }
      return seniorStaffNextAction(b,actor,true);
    }
    if(actor.side==='enemy'&&actor.enemyKit?.id===202303016){
      if((actor.resources?.['承露天人本回合追加行动']??0)<=0)return null;
      resource(b,actor,'承露天人本回合追加行动',0);
      if(!live(actor)||actor.broken||actor.cannotAct||(actor.skipTurns??0)>0){
        record(b,'skip',actor,{name:'控制 / 弱点击破中断承露天人 OneMorePerTurn'});return null;
      }
      return ascendedNextAction(b,actor,true);
    }
    if(isDirewolf(actor)){
      if((actor.resources?.['齿狼本回合追加行动']??0)<=0)return null;
      resource(b,actor,'齿狼本回合追加行动',0);
      if(!live(actor)||actor.broken||actor.cannotAct||(actor.skipTurns??0)>0){
        record(b,'skip',actor,{name:'控制 / 弱点击破中断自动机兵•齿狼 OneMorePerTurn'});return null;
      }
      return direwolfNextAction(b,actor,true);
    }
    if(actor.side==='enemy'&&actor.enemyKit?.id===4063010){
      const next=actor.resources?.['翼蛇形待追加行动'];if(!next)return null;
      resource(b,actor,'翼蛇形待追加行动',null);
      if(!wingedSerpentCanContinue(actor)){record(b,'skip',actor,{name:'控制 / 击破中断翼蛇形 OneMorePerTurn'});return null;}
      return {key:next};
    }
    if(actor.side==='enemy'&&actor.enemyKit?.id===5013010&&actor.resources?.['摇滚狂徒连携动作']){
      const next=actor.resources['摇滚狂徒连携动作'];resource(b,actor,'摇滚狂徒连携动作',null);return {key:next};
    }
    if(actor.side==='enemy'&&actor.enemyKit?.id===3013010&&(actor.resources?.['狂怒褪去之壳本回合追加行动']??0)>0){
      resource(b,actor,'狂怒褪去之壳本回合追加行动',0);
      return {key:'skill07'};
    }
    if(actor.side==='enemy'&&actor.enemyKit?.id===2023020&&(actor.resources?.['长右本回合额外行动']??0)>0){
      resource(b,actor,'长右本回合额外行动',0);
      return longRightNextAction(b,actor);
    }
    if(actor.side==='enemy'&&actor.enemyKit?.id===8003010&&(actor.resources?.['外宇宙之冰本回合追加行动']??0)>0){
      resource(b,actor,'外宇宙之冰本回合追加行动',0);
      return iceOutOfSpaceNextAction(b,actor);
    }
    return roster.continueAction(b,actor,key);
  }
  function longRightRandomMonitorIfMissing(b,boss,reason){
    if((boss.resources?.['长右元气']??0)<=0||longRightMonitor(b,boss))return;
    longRightSetMonitor(b,boss,longRightRandomTarget(b,boss),reason);
  }
  function jinrenEnemyAction(b,u){
    if(u.enemyKit?.id!==2013020)return null;
    const locked=get(b,u.resources?.['拘魂目标']);
    if(live(locked))return {key:'skill04',targetId:locked.id};
    if(u.resources?.['拘魂目标'])resource(b,u,'拘魂目标',null);
    const seq=u.enemyKit.aiSequence,index=u.resources?.['金人AI计数']??0,id=seq[index%seq.length];
    resource(b,u,'金人AI计数',(index+1)%seq.length);
    const key=({201302001:'skill01',201302002:'skill02',201302003:'skill03'})[id];
    if(key==='skill02'){
      const pool=enemies(b,u),marked=pool.find(t=>t.buffs.some(e=>e.tag===jinrenShakeTag));
      const target=marked??pool.find(t=>!t.buffs.some(e=>e.tag===jinrenUnstableTag));
      if(target)return {key,targetId:target.id};
    }
    return {key};
  }
  function lycanMechaEnemyAction(b,u){
    const flag=u.resources?.['咆哮灵柩AIFlag']??1;
    const raging=!!b.enemyMechanics?.lycanGroups?.[u.enemyKit.lycanGroup]?.rageActive;
    const key=raging?(flag===4?'skill04':'skill05'):(flag===1?'skill01':'skill02');
    const next=raging?(key==='skill04'?5:4):(key==='skill01'?2:1);
    resource(b,u,'咆哮灵柩AIFlag',next);
    return {key};
  }
  function hasFastActionModifier(u){return u.buffs.some(e=>e.tag===meteoricEagleWindwalkTag||e.modifierName==='MCommon_FastAction'||e.modifierName==='MCommon_FastAction_Permanent'||e.tag==='MCommon_FastAction'||e.tag==='MCommon_FastAction_Permanent');}
  function meteorRankScore(u){return ({Minion:0,MinionLv2:1,Elite:2,LittleBoss:3,BigBoss:4})[u.enemyKit?.monsterRank]??0;}
  function syncMeteoricEagleMark(b,reason){
    const team=b.units.filter(u=>live(u)&&u.side==='enemy');
    for(const u of b.units)u.buffs=u.buffs.filter(e=>e.tag!==meteoricEagleMarkTag);
    if(!team.length)return;
    const source=team.find(u=>u.enemyKit?.id===4022010);if(!source)return;
    const target=[...team].sort((a,c)=>meteorRankScore(c)-meteorRankScore(a)||b.units.indexOf(a)-b.units.indexOf(c))[0];
    if(target)buff(b,source,target,'如流星闪耀 · 怪物阶级标记','marker',0,null,{id:'meteoric-eagle-mark',tag:meteoricEagleMarkTag});
    if(source)record(b,'mechanic',source,{name:'【如流星闪耀】阶级标记更新',target:target?.id??null,reason});
  }
  function meteoricEagleEnemyAction(b,u){
    const eligible=allies(b,u).filter(t=>t!==u&&!hasFastActionModifier(t));
    const target=eligible[0]??null,last=u.resources?.['流星铁鹰Skill02上次行动值'];
    const cooldownReady=last==null||b.av-last>=(u.enemyKit.skill02ActionDelay??12)-1e-8;
    if((u.resources?.['流星铁鹰监听技能已触发']??0)>0&&target&&cooldownReady)return {key:'skill02',targetId:target.id};
    return {key:'skill'};
  }
  function iceOutOfSpaceFrozenTarget(b,u){return enemies(b,u).find(t=>[...t.buffs,...t.dots].some(e=>e.control==='freeze'))??null;}
  function iceOutOfSpaceNextAction(b,u){
    const phase=u.resources?.['外宇宙之冰PhaseFlag']??1,flag=u.resources?.['外宇宙之冰AIFlag']??1;
    if(phase===1){
      if(flag===2){resource(b,u,'外宇宙之冰AIFlag',3);return {key:'skill02'};}
      resource(b,u,'外宇宙之冰AIFlag',2);return {key:'skill01'};
    }
    if(flag===3){resource(b,u,'外宇宙之冰AIFlag',1);return {key:'skill03'};}
    resource(b,u,'外宇宙之冰AIFlag',3);
    const frozen=iceOutOfSpaceFrozenTarget(b,u);
    return {key:'skill01',...(frozen?{targetId:frozen.id}:{})};
  }
  function iceOutOfSpaceEnemyAction(b,u){
    resource(b,u,'外宇宙之冰本回合追加行动',u.enemyKit.oneMorePerTurn?1:0);
    return iceOutOfSpaceNextAction(b,u);
  }
  function fadedRageNextAction(b,u){
    const flag=u.resources?.['狂怒褪去之壳AIFlag']??1;
    const choice=({1:['skill01',2],2:['skill06',3],3:['skill04',1]})[flag]??['skill01',2];
    resource(b,u,'狂怒褪去之壳AIFlag',choice[1]);
    return {key:choice[0]};
  }
  function fadedRageEnemyAction(b,u){
    resource(b,u,'狂怒褪去之壳本回合追加行动',u.enemyKit.oneMorePerTurn?1:0);
    return fadedRageNextAction(b,u);
  }
  function fadedRageAddGrowth(b,u,count){
    const old=u.resources?.['无明火层数']??0,next=Math.min(u.enemyKit.growthMax,old+count);
    resource(b,u,'无明火层数',next);
    record(b,'mechanic',u,{name:'【无明火】叠层',previous:old,added:next-old,layers:next,max:u.enemyKit.growthMax});
  }
  function fadedRageSkill07(b,u){
    const targets=enemies(b,u),layers=u.resources?.['无明火层数']??0;
    const count=u.enemyKit.skill07BaseHits+layers,hitIds=new Set();
    const hitAction={name:'痛恶如刺剔骨',type:'Normal',element:'Quantum',terms:[{scaling:'atk',multiplier:u.enemyKit.skill07DamageMultiplier}],
      hitEnergy:u.enemyKit.skill07HitEnergy,hitEnergyPerHit:true};
    record(b,'mechanic',u,{name:'【痛恶如刺剔骨】开始',layers,hits:count,damageMultiplier:u.enemyKit.skill07DamageMultiplier});
    for(let i=0;i<count&&targets.length;i++){
      let pool=targets.filter(t=>!hitIds.has(t.id));
      if(!pool.length){hitIds.clear();pool=targets;}
      const taunted=pool.filter(t=>t.taunt||t.buffs.some(e=>e.taunt||e.control==='taunt'));
      if(i===0&&taunted.length)pool=taunted;
      const to=pool[Math.floor(b.random()*pool.length)];
      if(!live(to))continue;
      hitIds.add(to.id);
      damageTo(b,u,to,hitAction,1,'primary','direct');
    }
  }
  function voidrangerTramplerEnemyAction(b,u){
    const selector=u.enemyKit.targetSelector??voidrangerTramplerTargetTag;
    const pool=enemies(b,u),marked=pool.find(t=>t.buffs.some(e=>e.tag===selector||e.modifierName===selector));
    if(marked)return {key:'skill02',targetId:marked.id};
    if(pool.length<(u.enemyKit.skill01MinAliveTargets??2)||allies(b,u).length<(u.enemyKit.skill01MinTeamSize??2))return {key:'wait'};
    const target=pool[Math.floor(b.random()*pool.length)];
    return {key:'skill01',targetId:target.id};
  }
  function rockingRebelNextAction(b,u){
    const flag=u.resources?.['摇滚狂徒AIFlag']??1;
    const oneMore=u.buffs.some(e=>e.tag==='OneMore'||e.modifierName==='OneMore');
    const stageMark=u.buffs.some(e=>e.tag==='rockingRebelSkill03Mark'||e.modifierName==='MModifier_Monster_W4_Claymore_02_Skill03_Mark');
    let choice,next=null;
    if(flag===1||flag===2){
      const combo=u.enemyKit.aiCombosByFlag?.[flag]??(flag===1?['skill01','skill02']:['skill02','skill01']);
      choice=[combo[0],flag===1?3:5];next=combo[1]??null;
    }
    else if(flag===3&&(oneMore||stageMark)){
      choice=[b.units.filter(t=>t.side!==u.side).slice(0,3).some(live)?'skill02':'skill01',stageMark?5:3];
    }else choice=({3:['skill03',4],4:['skill04',2],5:[tag(u,rockingRebelFrenzyTag)?'skill052':'skill05',1]})[flag]??['skill01',3];
    resource(b,u,'摇滚狂徒AIFlag',choice[1]);
    resource(b,u,'摇滚狂徒连携动作',next);
    return {key:choice[0]};
  }
  function soulhookSovereignNextAction(b,u){
    const phase=u.hpPhase??1,sequence=u.enemyKit.aiSequenceByPhase?.[phase]??u.enemyKit.aiSequenceByPhase?.[1]??['skill01','skill02','skill05'];
    const flag=u.resources?.['支配者AIFlag']??1,key=sequence[(flag-1)%sequence.length];
    resource(b,u,'支配者AIFlag',flag>=sequence.length?1:flag+1);
    const pool=enemies(b,u),shocked=pool.filter(t=>t.dots.some(d=>d.tag==='soulhookElectric'));
    const target=key==='skill02'&&shocked.length?shocked[Math.floor(b.random()*shocked.length)]:null;
    if(key==='skill02'&&target)resource(b,u,'支配者扩散触电',1);else resource(b,u,'支配者扩散触电',0);
    return {key,...(target?{targetId:target.id}:{})};
  }
  function arbiterOfLostAbyssNextAction(b,u){
    const phase=u.hpPhase??1,flag=u.resources?.['裁定者AIFlag']??1;
    const teamCount=b.units.filter(t=>live(t)&&t.side===u.side).length;
    const hasOneMore=u.buffs.some(e=>e.tag==='OneMore'||e.modifierName==='OneMore');
    let key,nextFlag;
    if(phase===1){
      if(flag===1){key='skill03';nextFlag=2;}
      else if(flag===2||flag===3){key=teamCount<5?'skill02':'skill05';nextFlag=flag+1;}
      else {key='skill05';nextFlag=1;}
    }else if(flag===1){key='skill05';nextFlag=2;}
    else if(flag===2){key='skill02';nextFlag=3;}
    else if(flag===3){key=hasOneMore?'skill06':'skill05';nextFlag=hasOneMore?4:3;}
    else if(flag===4){key='skill07';nextFlag=5;}
    else if(flag===5){key='skill03';nextFlag=6;}
    else if(flag===6||flag===7){key=teamCount<5?'skill02':'skill05';nextFlag=flag+1;}
    else {key=hasOneMore?'skill06':'skill05';nextFlag=hasOneMore?4:3;}
    resource(b,u,'裁定者AIFlag',nextFlag);
    return {key};
  }
  function soulhookSovereignShock(b,from,to,{chance=1,duration=3,multiplier=.5}={}){
    if(!live(to))return false;
    const attacker=combatPanel(from),target=combatPanel(to),probability=Math.max(0,Math.min(1,chance*(1+(attacker.effectHit??0))*(1-(target.effectRes??0))));
    if(probability<1&&b.random()>=probability){record(b,'resist',to,{name:'抵抗【触电】',source:from.id,chance:probability});return false;}
    const id=from.id+':soulhook-electric:'+to.id;
    const dot={type:'dot',id,name:'触电',tag:'soulhookElectric',element:'Thunder',terms:[{scaling:'atk',multiplier}],
      source:from.id,remaining:duration,tickOwner:to.id,tickAt:'start',appliedTurn:to.turns,debuff:true};
    const old=to.dots.findIndex(e=>e.tag==='soulhookElectric'&&e.source===from.id);if(old>=0)to.dots[old]=dot;else to.dots.push(dot);
    record(b,'dot',from,{target:to.id,name:'触电',value:multiplier,duration});return true;
  }
  function soulhookSovereignFollowups(b,u,key,selected){
    if(key==='skill01'){
      const to=selected.find(live);if(to)soulhookSovereignShock(b,u,to,{chance:u.enemyKit.shockChance,duration:u.enemyKit.shockDuration,multiplier:u.enemyKit.shockDamageRatio});
    }
    if(key==='skill02'){
      const primary=selected.find(live),pool=b.units.filter(t=>live(t)&&t.side!==u.side),index=pool.findIndex(t=>t.id===primary?.id);
      const adjacent=[pool[index-1],pool[index+1]].filter(t=>t&&live(t));
      for(const to of adjacent){
        damageTo(b,u,to,{name:'月光摩挲连绵 · 相邻伤害',type:'Normal',element:'Thunder',terms:[{scaling:'atk',multiplier:u.enemyKit.skill02AdjacentMultiplier,target:'adjacent'}],hitEnergy:0,toughness:0},1,'adjacent','direct');
        if(u.resources?.['支配者扩散触电'])soulhookSovereignShock(b,u,to,{chance:1,duration:u.enemyKit.shockDuration,multiplier:u.enemyKit.shockDamageRatio});
      }
      resource(b,u,'支配者扩散触电',0);
    }
    if(key==='skill04'){
      const to=selected.find(live);if(to)soulhookSovereignShock(b,u,to,{chance:u.enemyKit.shockChance,duration:u.enemyKit.shockDuration,multiplier:u.enemyKit.shockDamageRatio});
      for(const target of enemies(b,u).filter(t=>t.dots.some(d=>d.tag==='soulhookElectric')))
        damageTo(b,u,target,{name:'亡者切齿呢喃 · 触电追击',type:'Normal',element:'Thunder',terms:[{scaling:'atk',multiplier:u.enemyKit.skill04ShockMultiplier}],hitEnergy:0,toughness:0},1,'primary','direct');
    }
  }
  function rockingRebelAddLaughter(b,u,amount,reason){
    if(!amount)return;
    const apply=()=>{b.laughter.ally=(b.laughter.ally??0)+amount;
      record(b,'resource',u,{name:'累计获得笑点',value:b.laughter.ally,added:amount,reason});
      b.rules?.laughterGained?.(b,'ally',amount,u,reason);};
    // Natural Aha snapshots its count before enemy reactions. Preserve laughter
    // granted by a reaction for the next Aha instead of letting the reset erase it.
    if(b.ahaInstant?.natural)b.ahaInstant.deferred.push(apply);else apply();
  }
  function removePfPamAntibacterialLayer(b,u,reason){
    const previous=Math.max(0,u.resources?.['PF帕姆王长效抗菌层数']??0);
    if(previous<=0)return false;
    const layers=previous-1;
    resource(b,u,'PF帕姆王长效抗菌层数',layers);
    const effect=u.buffs.find(e=>e.tag==='pfPamAntibacterial');
    if(layers>0){
      if(effect){effect.stacks=layers;effect.value=u.enemyKit.antibacterialDamageReductionPerLayer*layers;}
      record(b,'mechanic',u,{name:'【合金保姆】强化普攻移除一层【长效抗菌】',reason,previous,layers,
        damageReductionPerLayer:u.enemyKit.antibacterialDamageReductionPerLayer,totalDamageReduction:effect?.value??null});
      return true;
    }
    u.buffs=u.buffs.filter(e=>e.tag!=='pfPamAntibacterial'&&e.tag!=='pfPamSteam');
    record(b,'mechanic',u,{name:'【蒸汽洗涤】长效抗菌耗尽，退出状态',reason,previous,layers});
    const maxHp=combatPanel(u).hp,ratio=u.enemyKit.steamBreakTrueDamageRatio;
    trueDamage(b,u,u,maxHp*ratio,'【蒸汽洗涤】解除 · 真实伤害');
    record(b,'mechanic',u,{name:'【蒸汽洗涤】解除伤害',damageType:'true',formula:'MaxHP × ratio',maxHp,ratio,
      damage:maxHp*ratio});
    return true;
  }
  function pfPamHiddenNannyLaughter(b,side,amount,source,reason){
    if(side!=='ally'||!(amount>0))return;
    for(const u of b.units.filter(t=>live(t)&&t.side==='enemy'&&t.enemyKit?.id===5014023)){
      const threshold=u.enemyKit.nannyChargeThreshold??20;
      let charge=Math.max(0,u.resources?.['PF帕姆王合金保姆充能']??0)+amount;
      while(charge>=threshold){
        charge-=threshold;
        record(b,'mechanic',u,{name:'【合金保姆】充能完成',threshold,source:source?.id??null,reason,
          action:'强化普攻移除【长效抗菌】'});
        removePfPamAntibacterialLayer(b,u,'笑点充能达到阈值');
      }
      resource(b,u,'PF帕姆王合金保姆充能',charge);
    }
  }
  function initializePfPamFantasticStory(b,u){
    if(u?.side!=='enemy'||u.enemyKit?.id!==5014023)return;
    u.resources??={};
    if(u.resources['PF帕姆王AIFlag']==null)resource(b,u,'PF帕姆王AIFlag',1);
    if(u.resources['PF帕姆王长效抗菌层数']==null)resource(b,u,'PF帕姆王长效抗菌层数',0);
    if(u.resources['PF帕姆王合金保姆充能']==null)resource(b,u,'PF帕姆王合金保姆充能',0);
    if(u.resources['PF帕姆王隐藏合金保姆已召唤'])return;
    u.resources['PF帕姆王隐藏合金保姆已召唤']=1;
    record(b,'mechanic',u,{name:'战斗开始 · 召唤隐藏合金保姆',monsterId:5012120,selectable:false,
      chargeThreshold:u.enemyKit.nannyChargeThreshold??20,representedAs:'帕姆王关联的充能状态'});
  }
  function initializeMagicalGirlTroupe(b,u){
    if(u?.side!=='enemy'||u.enemyKit?.id!==5012100)return;
    u.resources??={};
    if(u.resources['魔法少女天气']!=null)return;
    resource(b,u,'魔法少女天气',0); // Weather=0: Rain.
    u.buffs=u.buffs.filter(e=>!['magicalGirlRain','magicalGirlSun'].includes(e.tag));
    buff(b,u,u,'雨天','marker',0,null,{id:u.id+':magical-girl-weather',tag:'magicalGirlRain'});
  }
  function applyIchorPheasantResonance(b,u){
    const targetsNow=b.units.filter(t=>live(t)&&t.side===u.side&&t.enemyKit?.id===4062010);
    for(const to of targetsNow)if(!tag(to,ichorPheasantResonanceTag))
      buff(b,u,to,'罪血共鸣','marker',0,null,{id:to.id+':ichor-pheasant-resonance',tag:ichorPheasantResonanceTag});
    record(b,'mechanic',u,{name:'【罪血共鸣】扩散至场上雉形',targets:targetsNow.map(to=>to.id),effectId:u.enemyKit.resonanceEffectId});
  }
  function ichorPheasantEnemyAction(u){
    return {key:tag(u,ichorPheasantResonanceTag)?'skill01':'skill02'};
  }
  function silvermaneCannoneerEnemyAction(b,u){
    const alreadySupported=allies(b,u).some(to=>to.buffs.some(effect=>effect.tag===silvermaneSupportTag&&live(get(b,effect.source))));
    const candidates=allies(b,u).filter(to=>to!==u&&!to.buffs.some(effect=>effect.tag===silvermaneSupportTag));
    if(!alreadySupported&&candidates.length)return {key:'skill02',targetId:candidates[0].id};
    return {key:'skill01'};
  }
  function presentInebriatedEnemyAction(b,u){
    const flag=u.resources?.['醉于盛会AIFlag']??1,marked=enemies(b,u).filter(t=>t.dots.length>0);
    const oneMore=u.buffs.some(effect=>effect.tag==='OneMore'||effect.modifierName==='OneMore');
    let key,nextFlag=flag,retarget=null;
    if(flag===1){key='skill02';nextFlag=2;}
    else if(flag===2){
      if(oneMore){key='skill02';nextFlag=2;}
      else if(marked.length){key='skill04';nextFlag=3;retarget=marked[Math.floor(b.random()*marked.length)];}
      else {key='skill01';nextFlag=1;}
    }else if(flag===3){key='skill05';nextFlag=4;}
    else if(flag===4||flag===6){key='skill01';nextFlag=1;}
    else if(flag===7){key='skill02';nextFlag=6;}
    else {key='skill01';nextFlag=1;}
    resource(b,u,'醉于盛会AIFlag',nextFlag);
    record(b,'mechanic',u,{name:'「醉于盛会的此刻」AI 分支',flag,nextFlag,action:key,
      oneMore,hasDotTargets:marked.length>0,...(retarget?{dotTarget:retarget.id}:{})});
    return {key};
  }
  function magicalGirlLaughter(b,u,amount,reason){
    if(!(amount>0))return;
    b.laughter.ally=(b.laughter.ally??0)+amount;
    record(b,'resource',u,{name:'累计获得笑点',value:b.laughter.ally,added:amount,reason});
    b.rules?.laughterGained?.(b,'ally',amount,u,reason);
  }
  function magicalGirlTurnSunny(b,u,reason){
    if(u?.side!=='enemy'||u.enemyKit?.id!==5012100||(u.resources?.['魔法少女天气']??0)!==0)return false;
    const k=u.enemyKit,delayRatio=k.elationActionDelay??1,laughter=k.transitionLaughter??2;
    resource(b,u,'魔法少女天气',1); // Weather=1: Sun.
    u.buffs=u.buffs.filter(e=>!['magicalGirlRain','magicalGirlSun'].includes(e.tag));
    buff(b,u,u,'晴天','marker',0,null,{id:u.id+':magical-girl-weather',tag:'magicalGirlSun'});
    delay(b,u.id,delayRatio);
    magicalGirlLaughter(b,u,laughter,'魔法少女【倾心❤雨转晴】');
    record(b,'mechanic',u,{name:'【倾心❤雨转晴】进入晴天',reason,delayRatio,laughter,
      sourcePassiveId:k.passiveSkillId,weather:1});
    return true;
  }
  function magicalGirlShock(b,from,to){
    if(!live(to))return false;
    const k=from.enemyKit,attacker=combatPanel(from),target=combatPanel(to);
    const chance=Math.max(0,Math.min(1,(k.rainShockChance??1)*(1+(attacker.effectHit??0))*(1-(target.effectRes??0))));
    if(chance<1&&b.random()>=chance){record(b,'resist',to,{name:'抵抗【触电】',source:from.id,chance});return false;}
    const id=from.id+':magical-girl-electric:'+to.id,duration=k.rainShockDuration??2,multiplier=k.rainShockMultiplier??.5;
    const effect={type:'dot',id,name:'触电',tag:'magicalGirlElectric',element:'Thunder',terms:[{scaling:'atk',multiplier}],
      source:from.id,remaining:duration,tickOwner:to.id,tickAt:'start',appliedTurn:to.turns,debuff:true};
    const old=to.dots.findIndex(e=>e.tag==='magicalGirlElectric'&&e.source===from.id);
    if(old>=0)to.dots[old]=effect;else to.dots.push(effect);
    record(b,'dot',from,{target:to.id,name:'触电',value:multiplier,duration,chance});
    return true;
  }
  function rockingRebelClearCharge(b,u,reason){
    const had=!!tag(u,rockingRebelChargeTag);
    u.buffs=u.buffs.filter(e=>e.tag!==rockingRebelChargeTag);
    if(u.resources?.['摇滚狂徒蓄力'])resource(b,u,'摇滚狂徒蓄力',0);
    if(had)record(b,'mechanic',u,{name:'演出彩排蓄力解除',reason});
    return had;
  }
  function rockingRebelAhaStart(b,metadata){
    const reactions=[];
    for(const u of b.units.filter(t=>live(t)&&t.side==='enemy'&&t.enemyKit?.id===5013010)){
      if(!tag(u,rockingRebelFrenzyTag))buff(b,u,u,'摇滚狂徒 · 狂奏','marker',0,null,
        {id:u.id+':rocking-rebel-frenzy',tag:rockingRebelFrenzyTag});
      if(tag(u,rockingRebelChargeTag)){
        u.resources??={};u.resources['摇滚狂徒阿哈打断笑点待结算']=u.enemyKit.chargeAhaLaughter;
        reactions.push({actor:u.id,key:'skill042',kind:'extra'});
      }
    }
    return reactions;
  }
  function rockingRebelEnemyAction(b,u){return rockingRebelNextAction(b,u);}
  function waveLadyEnemyAction(b,u){
    const flag=u.resources?.['波涛夫人AIFlag']??1;
    const oneMore=u.buffs.some(e=>e.tag==='OneMore'||e.modifierName==='OneMore');
    if(flag===1){resource(b,u,'波涛夫人AIFlag',2);return {key:'skill01'};}
    if(flag===2){resource(b,u,'波涛夫人AIFlag',3);return {key:'skill02'};}
    if(flag===3){resource(b,u,'波涛夫人AIFlag',4);return {key:allies(b,u).length<5?'skill03':'skill01'};}
    if(flag===4){
      if(oneMore){resource(b,u,'波涛夫人AIFlag',4);return {key:'skill01'};}
      resource(b,u,'波涛夫人AIFlag',5);u.buffs=u.buffs.filter(e=>e.tag!==waveLadyOneMorePerTurnTag);
      return {key:'skill04'};
    }
    return {key:oneMore?'skill02':'skill05'};
  }
  function seniorStaffNextAction(b,u,oneMore=false){
    const flag=u.resources?.['资深员工AIFlag']??1;
    const choose=(key,next=flag+1)=>{resource(b,u,'资深员工AIFlag',next);return {key};};
    // The local DB action IDs differ from Character Skill slots: 803301002 is
    // Skill06, 803301003 is Skill02, and 803301004 is Skill03. Follow the
    // sourced AIFlag branches, including the OneMore-only repeat of Skill01.
    if(flag===1)return choose('skill01',2);
    if(flag===2)return oneMore?choose('skill01',2):choose('skill06',3);
    if(flag===3)return choose('skill04',4);
    if(flag===4)return oneMore?choose('skill01',4):choose('skill02',5);
    if(flag===5)return choose('skill03',6);
    if(flag===6)return oneMore?choose('skill01',6):choose('skill06',7);
    if(flag===7)return choose('skill04',8);
    if(flag===8)return oneMore?choose('skill01',8):choose('skill06',1);
    if(flag===9)return choose('skill06',4);
    if(flag===10)return choose('skill01',6);
    return choose('skill01',2);
  }
  function seniorStaffEnemyAction(b,u){
    resource(b,u,'资深员工本回合追加行动',u.enemyKit?.oneMorePerTurn?1:0);
    return seniorStaffNextAction(b,u,false);
  }
  function setSeniorStaffPerformance(b,u,layers,reason){
    const n=Math.max(0,Math.min(u.enemyKit?.performanceMax??3,Math.floor(layers)));
    u.buffs=u.buffs.filter(e=>e.tag!==seniorStaffPerformanceTag);
    resource(b,u,'资深员工绩效点',n);
    if(n>0)buff(b,u,u,'绩效点 · 全伤害提高','dmgBoost',n*(u.enemyKit?.performanceDamagePerPoint??.5),null,
      {id:u.id+':senior-staff-performance',tag:seniorStaffPerformanceTag,stacks:n});
    record(b,'mechanic',u,{name:'【绩效点】更新',layers:n,max:u.enemyKit?.performanceMax??3,reason});
    return n;
  }
  function clearSeniorStaffCharge(b,u,reason){
    const active=u.buffs.some(e=>e.tag===seniorStaffChargeTag);
    u.buffs=u.buffs.filter(e=>e.tag!==seniorStaffChargeTag);
    if(active)record(b,'mechanic',u,{name:'【培训中…】蓄力解除',reason});
    return active;
  }
  // 202303016 承露天人：Skill01/02/03 的每次命中都附加 MCommon_DOT_Poison（风化）。
  // 该 modifier 的 Stacking=ReplaceByCaster、MaxLayer=5，因此同一来源的重复命中按层叠加，
  // 每层继续使用快照攻击力 × 0.7。
  function ascendedApplyPoison(b,u,to,{chance,duration,ratio}){
    if(!live(to))return null;
    const id=u.id+':ascended-poison:'+to.id,previous=to.dots.find(e=>e.id===id),
      stacks=Math.min(5,(previous?.stacks??0)+1);
    const effect=dot(b,u,to,{name:'风化',element:'Wind',chance,duration,stacks,
      terms:[{scaling:'atk',multiplier:ratio*stacks}],
      extra:{id,tag:'ascendedPoison',modifierName:'MCommon_DOT_Poison',snapshotAtk:true}});
    if(effect)record(b,'mechanic',u,{name:'【风化】施加 / 叠层',target:to.id,stacks,
      duration,multiplier:ratio*stacks,modifier:'MCommon_DOT_Poison'});
    return effect;
  }
  // 噬命：MCommon_BlackBlood 只公开 DirtyHPRatio（初始 0.3）与「攻击时把本次伤害转化为
  // 额外上限削减、刷新持续时间」的说明，以及 50% 上限。内部 DirtyHP 层数公式属于内核，
  // 这里按「实际损失生命 / 白值生命上限」线性追加，并把当前生命夹到新的上限。
  function ascendedSetDirtyHp(b,from,to,ratio,duration,reason){
    const current=tag(to,ascendedDirtyHpTag),previous=current?.value??0,
      cap=from?.enemyKit?.dirtyHpCap??current?.dirtyCap??.5,
      next=Math.min(cap,Math.max(previous,ratio));
    buff(b,from,to,'噬命','dirtyHpRatio',next,duration,
      {id:'ascended-dirty-hp:'+to.id,tag:ascendedDirtyHpTag,debuff:true,dirtyCap:cap,dirtyLifetime:duration});
    to.hp=Math.min(to.hp,combatPanel(to).hp);
    record(b,'mechanic',from,{name:'【噬命】生命上限降低',target:to.id,previous,ratio:next,cap,
      maxHp:combatPanel(to).hp,duration,reason});
    return next;
  }
  function ascendedNextAction(b,u,oneMore=false){
    const flag=u.resources?.['承露天人AIFlag']??1,special=u.resources?.['承露天人特殊标记']??0;
    const choose=(key,next=flag)=>{resource(b,u,'承露天人AIFlag',next);return {key};};
    // AI 决策顺序：SpecialFlag=2 → Skill04（并把 SpecialFlag 置 1）；SpecialFlag=1 → Skill05
    // （清零）。正常循环中 SpecialFlag 始终为 0，只有剧情 InstantDirtyHP 能力会置 2；
    // 弱点击破只会把 1 改成 2，因此该分支是来源中真实存在的恢复链，保留并如实记录。
    if(special===2){resource(b,u,'承露天人特殊标记',1);return {key:'skill04'};}
    if(special===1){resource(b,u,'承露天人特殊标记',0);return {key:'skill05'};}
    if(flag===1)return choose('skill03',2);
    if(flag===2)return choose('skill02',3);
    if(flag===3)return choose('skill01',4);
    if(flag===4)return oneMore?choose('skill03',4):choose('skill04',5);
    if(flag===5)return choose('skill05',6);
    if(flag===6)return choose('skill03',oneMore?2:1);
    return choose('skill03',2);
  }
  function ascendedEnemyAction(b,u){
    // 虚构叙事按波次 spawn 的单位不会走 createBattle 的 onStart，仍可能缺少初始旗标；
    // 首次行动时按角色配置的 CustomValues 懒初始化，避免补怪路线与首波路线行为不一致。
    u.resources??={};u.resources['承露天人AIFlag']??=1;u.resources['承露天人特殊标记']??=0;
    if(!tag(u,ascendedOneMorePerTurnTag))
      buff(b,u,u,'每回合额外行动','marker',0,null,{id:u.id+':ascended-one-more-per-turn',tag:ascendedOneMorePerTurnTag});
    resource(b,u,'承露天人本回合追加行动',u.enemyKit?.oneMorePerTurn?1:0);
    return ascendedNextAction(b,u,false);
  }
  function clearAscendedCharge(b,u,reason){
    const active=u.buffs.some(e=>e.tag===ascendedChargeTag);
    u.buffs=u.buffs.filter(e=>e.tag!==ascendedChargeTag);
    if(active)record(b,'mechanic',u,{name:'【持咒】解除',reason});
    return active;
  }
  // 1013020 自动机兵•齿狼：Skill06 的每次命中以 50% 基础概率叠加 W1_Mecha02_ThunderDOT。
  // 该 modifier 被 Skill06 覆写为 LifeTime 2 / MaxLayer 10（全局默认 3 / 5），
  // 每层在持有者回合开始（ModifierPhase1End）造成目标最大生命 5% 的物理持续伤害。
  function direwolfInitialize(b,u){
    u.resources??={};
    u.resources['齿狼AIFlag']??=1;
    u.resources['齿狼插入标记']??=0;
    u.resources['齿狼OneMorePerTurn']??=1;
    u.resources['齿狼本回合追加行动']??=0;
    u.resources['齿狼战斗评分标记']??=0;
  }
  function direwolfMaxHpRatioTarget(b,u){
    const pool=enemies(b,u);if(!pool.length)return null;
    const ratio=to=>to.hp/Math.max(1,combatPanel(to).hp),
      best=Math.max(...pool.map(ratio)),top=pool.filter(to=>Math.abs(ratio(to)-best)<=1e-9);
    // Retarget 使用 ByRandom：同分目标之间随机，其他情况唯一最高。
    return top[Math.floor(b.random()*top.length)];
  }
  function direwolfNextAction(b,u,oneMore=false){
    if((u.resources?.['齿狼插入标记']??0)===1){
      resource(b,u,'齿狼插入标记',0);
      const target=direwolfMaxHpRatioTarget(b,u);
      return {key:'skill04',...(target?{targetId:target.id}:{})};
    }
    const flag=u.resources?.['齿狼AIFlag']??1;
    if(flag===1){resource(b,u,'齿狼AIFlag',2);return {key:'skill03'};}
    if(flag===2){
      // UseSkill07 先检查 OneMore：追加行动中命中该分支时继续 Skill09 且不推进旗标。
      if(oneMore)return {key:'skill03'};
      resource(b,u,'齿狼AIFlag',3);return {key:'skill02'};
    }
    resource(b,u,'齿狼AIFlag',1);
    const signed=enemies(b,u).find(to=>to.buffs.some(e=>e.tag===direwolfSignTag&&e.source===u.id));
    return {key:'skill01',...(signed?{targetId:signed.id}:{})};
  }
  function direwolfEnemyAction(b,u){
    // PF 波次 spawn 的单位不会走 createBattle 的 onStart；首次行动时懒初始化。
    direwolfInitialize(b,u);
    // 追加行动由本次行动结束时的 RemoveOneMore 规则授予，这里先清掉上回合残留。
    resource(b,u,'齿狼本回合追加行动',0);
    return direwolfNextAction(b,u,false);
  }
  function direwolfApplyBleed(b,u,to,{chance}){
    if(!live(to))return null;
    const ids=u.id+':direwolf-bleed:'+to.id,previous=to.dots.find(e=>e.id===ids),
      max=u.enemyKit.bleedMaxStacks??10,stacks=Math.min(max,(previous?.stacks??0)+1),
      duration=u.enemyKit.bleedDuration??2,ratio=u.enemyKit.bleedRatio??.05;
    const effect=dot(b,u,to,{name:'裂伤',element:'Physical',chance,duration,stacks,
      extra:{id:ids,tag:direwolfBleedTag,modifierName:u.enemyKit.dotModifier??'W1_Mecha02_ThunderDOT',
        maxHpRatio:ratio,tickAt:'start'}});
    if(effect)record(b,'mechanic',u,{name:'【裂伤】施加 / 叠层',target:to.id,stacks,duration,
      chance,maxHpRatio:ratio,damage:'目标最大生命 × 层数 × 5%'});
    return effect;
  }
  function direwolfRemoveSign(b,u,reason){
    const owners=enemies(b,u).filter(to=>to.buffs.some(e=>e.tag===direwolfSignTag&&e.source===u.id));
    for(const to of owners)to.buffs=to.buffs.filter(e=>!(e.tag===direwolfSignTag&&e.source===u.id));
    if(owners.length)record(b,'mechanic',u,{name:'【目标锁定】标记解除',reason,targets:owners.map(to=>to.id)});
    return owners.length;
  }
  // 1023010 炽燃徘徊者：AI 用 Monster_W1_Mecha_Fire_AICounter_01（初值 1）在 1..4
  // 之间推进；Skill01 自身灼烧（Burning）与击破后写入的 Burning_CD 决定分支。
  // Skill06/07/02 命中带 MCommon_DOT_Burn 的目标后，由被动 Initiate 的
  // OnAfterHit → OnAfterAttack 叠加一层熔解（上限 5 / 3 回合）。
  function mechaFireInitialize(b,u){
    u.resources??={};
    u.resources['炽燃徘徊者AICounter']??=1;
    u.resources['炽燃徘徊者BurningCD']??=0;
  }
  function mechaFireHasBurning(u){return (u.buffs??[]).some(e=>e.tag===mechaFireBurningTag);}
  function mechaFireHasBurn(to){
    return (to?.dots??[]).some(e=>e.tag===mechaFireBurnTag||e.modifierName==='MCommon_DOT_Burn');
  }
  function mechaFireNextAction(b,u){
    const counter=u.resources?.['炽燃徘徊者AICounter']??1,burning=mechaFireHasBurning(u),
      cooldown=(u.resources?.['炽燃徘徊者BurningCD']??0)>0;
    const set=value=>resource(b,u,'炽燃徘徊者AICounter',value);
    // Decision 3（UseSkill01，SuccessScore 1）优先于其余 0.5 分支。
    if(!burning&&!cooldown&&(counter===3||counter===4))return {key:'skill01'};
    // Decision 1（UseSkill06）：1→2，4→3。
    if(counter===1||counter===4){set(counter===1?2:3);return {key:'skill06'};}
    // Decision 2（UseSkill07）：2→3；无灼烧且 counter=3 时 3→4。
    if(counter===2||(!burning&&counter===3)){
      set(counter===2?3:4);
      // AIModifierNameSelector MCommon_DOT_Burn：优先命中灼烧目标，没有则退回默认选敌。
      const burn=(b.units??[]).find(to=>live(to)&&to.side!==u.side&&mechaFireHasBurn(to));
      return {key:'skill07',...(burn?{targetId:burn.id}:{})};
    }
    // Decision 4（UseSkill02）：持有灼烧且 counter=3，结算后 counter=4。
    if(burning&&counter===3){set(4);return {key:'skill02'};}
    // 1..4 已被四个分支穷尽；外部改写状态时回到 Skill06 的安全回退。
    set(2);return {key:'skill06'};
  }
  function mechaFireEnemyAction(b,u){
    // PF / 补怪路线不会走 createBattle 的 onStart；首次行动时懒初始化。
    mechaFireInitialize(b,u);
    return mechaFireNextAction(b,u);
  }
  function mechaFireApplyBurn(b,u,to){
    if(!live(to))return null;
    const k=u.enemyKit,id=u.id+':mecha-fire-burn:'+to.id,
      duration=k.burnDuration??3,ratio=k.burnRatio??.5;
    const effect=dot(b,u,to,{name:'灼烧',element:'Fire',chance:1,duration,stacks:1,
      terms:[{scaling:'atk',multiplier:ratio}],
      extra:{id,tag:mechaFireBurnTag,modifierName:k.burnModifier??'MCommon_DOT_Burn',tickAt:'start',snapshotAtk:true}});
    if(effect)record(b,'mechanic',u,{name:'【灼烧】施加',target:to.id,modifier:k.burnModifier??'MCommon_DOT_Burn',
      duration,atkRatio:ratio,snapshotAtk:true,chance:1,replacesCaster:true});
    return effect;
  }
  function mechaFireAddMelt(b,u){
    const k=u.enemyKit,previous=u.buffs.find(e=>e.tag===mechaFireMeltTag),
      stacks=Math.min(k.meltMaxLayers??5,(previous?.stacks??0)+1),
      critRate=(k.meltCritPerLayer??.06)*stacks,duration=k.meltDuration??3;
    buff(b,u,u,'熔解','critRate',critRate,duration,{id:u.id+':mecha-fire-melt',tag:mechaFireMeltTag,
      stacks,modifierName:k.meltModifier});
    record(b,'mechanic',u,{name:'【熔解】叠层',stacks,critRate,duration,maxLayers:k.meltMaxLayers??5,
      modifier:k.meltModifier,damageBonusMissing:true});
  }
  function mechaFireApplyBurning(b,u){
    if(mechaFireHasBurning(u))return;
    const k=u.enemyKit;
    buff(b,u,u,'高温运转 · 攻击力提高','atkPct',k.attackBuff??.2,null,
      {id:u.id+':mecha-fire-burning-atk',tag:mechaFireBurningTag,modifierName:k.burningModifier});
    buff(b,u,u,'高温运转 · 速度提高','speed',k.speedBuff??100,null,
      {id:u.id+':mecha-fire-burning-speed',tag:mechaFireBurningTag,modifierName:k.burningModifier});
    record(b,'mechanic',u,{name:'【高温运转】启动',atkPct:k.attackBuff??.2,speed:k.speedBuff??100,
      modifier:k.burningModifier,removedOnBreak:true});
  }
  function mechaFireClearBurning(b,u,reason){
    const had=mechaFireHasBurning(u);
    u.buffs=u.buffs.filter(e=>e.tag!==mechaFireBurningTag);
    // Burning 的 OnDestroy 无条件写入 Burning_CD；来源中只有击破会摧毁它。
    if(had)resource(b,u,'炽燃徘徊者BurningCD',1);
    if(had)record(b,'mechanic',u,{name:'【高温运转】解除',reason,burningCD:1});
    return had;
  }
  function mechaFireClearMelt(b,u,reason){
    const had=u.buffs.some(e=>e.tag===mechaFireMeltTag);
    u.buffs=u.buffs.filter(e=>e.tag!==mechaFireMeltTag);
    if(had)record(b,'mechanic',u,{name:'【熔解】解除',reason});
    return had;
  }
  function applyIceOutOfSpaceFreeze(b,from,to,{chance,duration,delayRatio}){
    if(!live(to))return false;
    const attacker=combatPanel(from),target=combatPanel(to),controlRes=target.controlRes??to.controlRes??0;
    const probability=Math.max(0,Math.min(1,chance*(1+(attacker.effectHit??0))*(1-(target.effectRes??0))*(1-controlRes)));
    if(controlRes>=1||probability<1&&b.random()>=probability){record(b,'resist',to,{name:'抵抗【冻结】',source:from.id});return false;}
    buff(b,from,to,'冻结','marker',0,duration,{id:from.id+':ice-freeze:'+to.id,tag:'iceOutOfSpaceFreeze',debuff:true,control:'freeze',tickAt:'start'});
    if(delayRatio>0)delay(b,to.id,delayRatio);
    record(b,'mechanic',from,{name:'【永冬之雨】施加冻结',target:to.id,chance,duration,delayRatio});
    return true;
  }
  function roamingBanditEnemyAction(b,u){
    const modifier=u.enemyKit.supportModifier??'Monster_W1_Soldier01_03_Buff';
    const eligible=allies(b,u).filter(to=>to.monsterId!==1002020&&
      !to.buffs.some(e=>e.modifierName===modifier||e.tag==='roamingBanditInspiration'));
    const last=u.resources?.['流浪者鼓舞上次行动'];
    const cooldown=u.enemyKit.skill02Cooldown??2;
    if(eligible.length&&u.turns>=(u.enemyKit.skill02InitialCooldown??1)&&
      (last==null||u.turns-last>=cooldown)){
      resource(b,u,'流浪者鼓舞上次行动',u.turns);
      return {key:'skill02',targetId:eligible[0].id};
    }
    return {key:'skill'};
  }
  function blackTideNextAction(b,u,oneMore=false){
    const flag=u.resources?.['黑潮蚀魔AIFlag']??1;
    const chargeComplete=u.buffs.some(e=>e.tag==='blackTideChargeComplete'||e.modifierName==='MMonster_XP_Elite01_02_Charge_Complete');
    const hasRally=enemies(b,u).some(to=>to.buffs.some(e=>e.tag==='blackTideRallyHP'||e.modifierName==='MMonster_AML_Minion02_01_RallyHP_V2'));
    if(flag===1){resource(b,u,'黑潮蚀魔AIFlag',2);return {key:'skill01'};}
    if(flag===2){resource(b,u,'黑潮蚀魔AIFlag',3);return {key:'skill02'};}
    if(flag===3){resource(b,u,'黑潮蚀魔AIFlag',4);return {key:hasRally?'skill03':'skill06'};}
    if(flag===4){
      if(chargeComplete){if(oneMore)return {key:'skill01'};resource(b,u,'黑潮蚀魔AIFlag',5);return {key:'skill04'};}
      resource(b,u,'黑潮蚀魔AIFlag',3);return {key:'skill02'};
    }
    if(flag===5){resource(b,u,'黑潮蚀魔AIFlag',3);return {key:'skill05'};}
    resource(b,u,'黑潮蚀魔AIFlag',2);return {key:'skill01'};
  }
  function blackTideDaemonEnemyAction(b,u){
    resource(b,u,'黑潮蚀魔本回合追加行动',u.enemyKit.oneMorePerTurn?1:0);
    return blackTideNextAction(b,u,false);
  }
  function cacoHarmonyEnemyAction(b,u){
    const flag=u.resources?.['同音共律AIFlag']??1,liveAllies=enemies(b,u);
    const selectDream=asleep=>liveAllies.find(t=>t.buffs.some(e=>e.tag===cacoHarmonyDreamTag)===asleep);
    if(flag===1){resource(b,u,'同音共律AIFlag',2);const t=selectDream(true);return {key:'skill01',...(t?{targetId:t.id}:{})};}
    if(flag===2){resource(b,u,'同音共律AIFlag',3);const t=selectDream(false);return {key:'skill02',...(t?{targetId:t.id}:{})};}
    if(flag===3){resource(b,u,'同音共律AIFlag',4);const t=selectDream(true);return {key:'skill03',...(t?{targetId:t.id}:{})};}
    if(flag===4){resource(b,u,'同音共律AIFlag',5);return {key:'skill04'};}
    if(flag===5){resource(b,u,'同音共律AIFlag',6);return {key:'skill05'};}
    resource(b,u,'同音共律AIFlag',1);const t=selectDream(true);return {key:'skill01',...(t?{targetId:t.id}:{})};
  }
  function cyclonicSwarmMotherEnemyAction(b,u){
    const flag=u.resources?.['飓风大母AIFlag']??1;
    // The 4.6 DB documents these skills and their effects but the indexed AI
    // file has no sequence; this fallback is intentionally reported as partial.
    if(flag===1){resource(b,u,'飓风大母AIFlag',2);return {key:'skill01'};}
    if(flag===2){resource(b,u,'飓风大母AIFlag',3);return {key:'skill02'};}
    if(flag===3){resource(b,u,'飓风大母AIFlag',4);return {key:'skill03'};}
    resource(b,u,'飓风大母AIFlag',1);return {key:'skill05'};
  }
  function swarmNightmareEnemyAction(b,u){
    // AIFlag candidates are present in the local index, but their dynamic
    // predicates are not. This fallback follows the indexed decision order;
    // the actor keeps that rotation explicitly marked as incomplete.
    const sequence=['skill01','skill04','skill03','skill06','skill01','skill02','skill05'];
    const flag=u.resources?.['示死祸源AIFlag']??1;
    const key=sequence[(flag-1)%sequence.length];
    resource(b,u,'示死祸源AIFlag',flag>=sequence.length?1:flag+1);
    return {key};
  }
  function dawnCorpsEnemyAction(b,u){
    if(u.buffs.some(e=>e.tag===dawnCorpsForceTag))return {key:'skill04'};
    const flag=u.resources?.['破晓战队AIFlag']??1;
    if(flag===1){resource(b,u,'破晓战队AIFlag',2);return {key:'skill01'};}
    if(flag===2){resource(b,u,'破晓战队AIFlag',3);return {key:'skill02'};}
    resource(b,u,'破晓战队AIFlag',1);return {key:'skill03'};
  }
  function joyAscendantEnemyAction(b,u){
    const flag=u.resources?.['乐变化天人AIFlag']??1,oneMore=u.buffs.some(e=>e.tag==='OneMore'||e.modifierName==='OneMore');
    if(flag===1){resource(b,u,'乐变化天人AIFlag',2);return {key:'skill01'};}
    if(flag===2){if(oneMore){resource(b,u,'乐变化天人AIFlag',2);return {key:'skill01'};}
      resource(b,u,'乐变化天人AIFlag',3);return {key:'skill02'};}
    if(flag===3){resource(b,u,'乐变化天人AIFlag',4);return {key:'skill02'};}
    if(flag===4){if(oneMore){resource(b,u,'乐变化天人AIFlag',4);return {key:'skill01'};}
      resource(b,u,'乐变化天人AIFlag',5);return {key:'skill03'};}
    if(flag===5){resource(b,u,'乐变化天人AIFlag',6);return {key:'skill04'};}
    if(flag===6){if(oneMore){resource(b,u,'乐变化天人AIFlag',8);return {key:'skill02'};}
      resource(b,u,'乐变化天人AIFlag',7);return {key:'skill01'};}
    if(flag===7){resource(b,u,'乐变化天人AIFlag',8);return {key:'skill02'};}
    if(oneMore){resource(b,u,'乐变化天人AIFlag',8);return {key:'skill02'};}
    resource(b,u,'乐变化天人AIFlag',5);return {key:'skill03'};
  }
  function kingPomPomEnemyAction(b,u){
    const flag=u.resources?.['帕姆王AIFlag']??1,phase=u.resources?.['帕姆王AI阶段']??1;
    const oneMore=u.buffs.some(e=>e.tag==='OneMore'||e.modifierName==='OneMore');
    if(phase===1){
      if(flag===1){resource(b,u,'帕姆王AIFlag',2);return {key:'skill01'};}
      if(flag===2){if(oneMore){resource(b,u,'帕姆王AIFlag',2);return {key:'skill01'};}
        resource(b,u,'帕姆王AIFlag',3);return {key:'skill03'};}
      if(flag===3){resource(b,u,'帕姆王AIFlag',4);return {key:'skill01'};}
      if(oneMore){resource(b,u,'帕姆王AIFlag',4);return {key:'skill01'};}
      resource(b,u,'帕姆王AIFlag',3);return {key:'skill02'};
    }
    if(flag===1){resource(b,u,'帕姆王AIFlag',2);return {key:'skill04'};}
    if(flag===2){if(oneMore){resource(b,u,'帕姆王AIFlag',2);return {key:'skill01'};}
      resource(b,u,'帕姆王AIFlag',3);return {key:'skill02'};}
    if(flag===3){resource(b,u,'帕姆王AIFlag',4);return {key:'skill02'};}
    if(flag===4){if(oneMore){resource(b,u,'帕姆王AIFlag',4);return {key:'skill02'};}
      resource(b,u,'帕姆王AIFlag',5);return {key:'skill05'};}
    if(flag===5){resource(b,u,'帕姆王AIFlag',6);return {key:'skill06'};}
    if(flag===6){resource(b,u,'帕姆王AIFlag',oneMore?8:7);return {key:'skill01'};}
    if(flag===7){resource(b,u,'帕姆王AIFlag',8);return {key:'skill04'};}
    resource(b,u,'帕姆王AIFlag',3);return {key:'skill02'};
  }
  function moonlitPegasusEnemyAction(b,u){
    const flag=u.resources?.['月夜天马AIFlag']??1;
    const next={1:['skill01',2],2:['skill03',3],3:['skill04',4],4:['skill01',5],5:['skill02',1]}[flag]??['skill01',2];
    resource(b,u,'月夜天马AIFlag',next[1]);return {key:next[0]};
  }
  function lighthouseEnemyAction(b,u){
    const flag=u.resources?.['灯塔AIFlag']??1,oneMore=u.buffs.some(e=>e.tag==='OneMore'||e.modifierName==='OneMore');
    if(flag===1){resource(b,u,'灯塔AIFlag',5);return {key:allies(b,u).length<5?'skill02':'skill01'};}
    if(flag===5){if(oneMore){resource(b,u,'灯塔AIFlag',5);return {key:'skill01'};}
      resource(b,u,'灯塔AIFlag',6);return {key:'skill03'};}
    if(flag===6){resource(b,u,'灯塔AIFlag',7);return {key:'skill04'};}
    resource(b,u,'灯塔AIFlag',1);return {key:'skill01'};
  }
  function darkSunGryphonEnemyAction(b,u){
    const flag=u.resources?.['黑日狮鹫AIFlag']??1;
    const oneMore=u.buffs.some(e=>e.tag==='OneMore'||e.modifierName==='OneMore'||e.name==='OneMore');
    if(flag===1){resource(b,u,'黑日狮鹫AIFlag',2);return {key:'skill01'};}
    if(flag===2){
      if(oneMore)return {key:'skill01'};
      resource(b,u,'黑日狮鹫AIFlag',3);
      return {key:allies(b,u).length>=4?'skill01':'skill02'};
    }
    if(flag===3){resource(b,u,'黑日狮鹫AIFlag',4);return {key:'skill01'};}
    if(flag===4){
      if(oneMore)return {key:'skill01'};
      resource(b,u,'黑日狮鹫AIFlag',5);return {key:'skill03'};
    }
    resource(b,u,'黑日狮鹫AIFlag',1);return {key:'skill04'};
  }
  function sweetGorillaEnemyAction(b,u){
    const flag=u.resources?.['甜猿泰山AIFlag']??1,teamSize=allies(b,u).length;
    if(flag===1){resource(b,u,'甜猿泰山AIFlag',2);return {key:'skill01'};}
    if(flag===2){resource(b,u,'甜猿泰山AIFlag',3);return {key:teamSize<=4?'skill03':'skill01'};}
    if(flag===3){resource(b,u,'甜猿泰山AIFlag',4);return {key:'skill01'};}
    if(flag===4){resource(b,u,'甜猿泰山AIFlag',5);return {key:'skill04'};}
    if(flag===5){resource(b,u,'甜猿泰山AIFlag',1);return {key:'skill02'};}
    resource(b,u,'甜猿泰山AIFlag',4);return {key:teamSize<=4?'skill03':'skill01'};
  }
  function alloyNannyEnemyAction(b,u){
    const flag=u.resources?.['合金保姆AIFlag']??1;
    resource(b,u,'合金保姆AIFlag',flag===1?2:1);
    return {key:flag===1?'skill01':'skill02'};
  }
  function dreamjoltMrDomescreenEnemyAction(b,u){
    u.resources??={};
    const side=u.resources['圆幕先生FlopSide']??u.enemyKit.flopSideInitial??-1;
    const flag=u.resources['圆幕先生AIFlag']??u.enemyKit.aiFlagInitial??0;
    if(side!==1){resource(b,u,'圆幕先生AIFlag',2);return {key:'skill02'};}
    if(flag!==1){
      resource(b,u,'圆幕先生AIFlag',1);
      const targets=enemies(b,u).filter(to=>(to.energyMax??0)>0);
      targets.sort((a,c)=>(a.energy??0)/a.energyMax-(c.energy??0)/c.energyMax||(a.order??0)-(c.order??0));
      return {key:'skill01',...(targets[0]?{targetId:targets[0].id}:{})};
    }
    resource(b,u,'圆幕先生AIFlag',3);
    return {key:'skill03'};
  }
  function blackTideAxeEnemyAction(b,u){
    // Monster_W2_Valkyrie01_02_AI：AIFlag=1 → Skill01；AIFlag=2 → 先置 1 再放 Skill02。
    const flag=u.resources?.['黑潮蚀斧AIFlag']??1;
    if(flag===2){resource(b,u,'黑潮蚀斧AIFlag',1);return {key:'skill02'};}
    return {key:'skill01'};
  }
  function blackTideAxeInitialize(b,u){
    u.resources??={};
    resource(b,u,'黑潮蚀斧AIFlag',u.resources['黑潮蚀斧AIFlag']??1);
    // SkillP01 OnCreate：若队伍中已有 Flag_RevengeTrigger=1 的蚀斧，新蚀斧初始化为 2。
    const armed=b.units.some(t=>t!==u&&t.side==='enemy'&&live(t)&&t.enemyKit?.id===4032030&&
      (t.resources?.['黑潮蚀斧触发标记']??0)===1);
    if(u.resources['黑潮蚀斧触发标记']==null)resource(b,u,'黑潮蚀斧触发标记',armed?2:0);
  }
  function blackTideAxeCanRevenge(u){
    // 第二个回调的 ByAnd：TeamDark、非自身、非战斗事件、Flag=0、未 Break / STAT_CTRL / DisableAction。
    return live(u)&&!u.broken&&!u.cannotAct&&(u.skipTurns??0)<=0&&
      ![...(u.buffs??[]),...(u.dots??[])].some(e=>e.control||e.disableAction===true);
  }
  function blackTideAxeRevenge(b,dead){
    if(dead?.side!=='enemy')return;
    const axes=b.units.filter(u=>u.side==='enemy'&&live(u)&&u.id!==dead.id&&u.enemyKit?.id===4032030);
    if(!axes.length)return;
    // 第一个回调：持有 Flag=1 的蚀斧阵亡时，把其他蚀斧的 Flag 清回 0。
    if((dead.resources?.['黑潮蚀斧触发标记']??0)===1)
      for(const axe of axes)resource(b,axe,'黑潮蚀斧触发标记',0);
    const eligible=axes.filter(axe=>blackTideAxeCanRevenge(axe)&&(axe.resources?.['黑潮蚀斧触发标记']??0)===0);
    if(!eligible.length)return;
    // AllDarkTeam + ByRandom + MaxNumber 1：每次死亡事件最多 1 把蚀斧获得仇隙。
    const chosen=eligible[Math.floor(b.random()*eligible.length)];
    for(const axe of axes){
      if(axe===chosen)resource(b,axe,'黑潮蚀斧触发标记',1);
      else if((axe.resources?.['黑潮蚀斧触发标记']??0)!==1)resource(b,axe,'黑潮蚀斧触发标记',2);
    }
    resource(b,chosen,'黑潮蚀斧AIFlag',2);
    chosen.distance=0; // SetActionDelay 0
    record(b,'mechanic',chosen,{name:'【仇隙】其他敌方单位被消灭 · 立即施放仇心忿火',trigger:dead.id,
      eligible:eligible.map(axe=>axe.id),actionDelay:0});
    useAction(b,chosen,'skill02','extra');
    resource(b,chosen,'黑潮蚀斧AIFlag',1);
    record(b,'mechanic',chosen,{name:'【仇心忿火】结算 · 清除仇隙标记'});
  }
  // 401301201 天谴先锋：AIFlag 轮转 + OneMorePerTurn 追加行动 + 【战甲】层数。
  function furiaePraetorNextAction(b,u,oneMore=false){
    const flag=u.resources?.['天谴先锋AIFlag']??1,set=value=>resource(b,u,'天谴先锋AIFlag',value);
    if(flag===1){set(2);return {key:'skill01'};}
    if(flag===2){set(3);return {key:'skill02'};}
    if(flag===3){set(4);return {key:'skill01'};}
    if(flag===4){
      // ByIsContainModifier OneMore：追加行动里继续 Skill02 且不推进旗标。
      if(oneMore)return {key:'skill02'};
      set(5);furiaePraetorSetOneMore(b,u,false,'【像威猛暴怒的雄狮】前移除 OneMorePerTurn');
      return {key:'skill03'};
    }
    set(1);return {key:'skill04'};
  }
  function furiaePraetorHasOneMore(u){return !!tag(u,furiaePraetorOneMoreTag);}
  function furiaePraetorSetOneMore(b,u,active,reason){
    const had=furiaePraetorHasOneMore(u);
    u.buffs=u.buffs.filter(e=>e.tag!==furiaePraetorOneMoreTag);
    if(active)buff(b,u,u,'OneMorePerTurn','marker',0,null,
      {id:u.id+':furiae-praetor-one-more',tag:furiaePraetorOneMoreTag});
    if(had!==active)record(b,'mechanic',u,{name:'OneMorePerTurn 更新',active,reason});
  }
  // MMonster_Heaven_StoneShieldController 通用【战甲】：401301201 天谴先锋与 4012020 天谴哲人共用。
  function stoneShieldTagOf(u){return isFuriaePhilosopher(u)?furiaePhilosopherArmorTag:furiaePraetorArmorTag;}
  function stoneShieldLayers(u){
    const effect=tag(u,stoneShieldTagOf(u));
    return Math.max(0,Math.floor(effect?.stacks??0));
  }
  function stoneShieldSet(b,u,layers,reason){
    const armorTag=stoneShieldTagOf(u),max=u.enemyKit?.armorMaxLayers??6,before=stoneShieldLayers(u);
    const next=Math.max(0,Math.min(max,Math.floor(layers)));
    u.buffs=u.buffs.filter(e=>e.tag!==armorTag);
    if(next>0)buff(b,u,u,'【战甲】','dmgReduction',(u.enemyKit?.armorDamageResistance??.1)*next,null,
      {id:u.id+':stone-shield',tag:armorTag,stacks:next});
    if(before!==next)record(b,'mechanic',u,{name:'【战甲】层数变化',layers:next,max,damageReduction:
      (u.enemyKit?.armorDamageResistance??.1)*next,reason});
    return next;
  }
  function furiaePraetorLayers(u){return stoneShieldLayers(u);}
  function furiaePraetorSetArmor(b,u,layers,reason){return stoneShieldSet(b,u,layers,reason);}
  function furiaePraetorInitialize(b,u){
    u.resources??={};
    resource(b,u,'天谴先锋AIFlag',u.resources['天谴先锋AIFlag']??1);
    resource(b,u,'天谴先锋本回合追加行动',0);
    if(!furiaePraetorHasOneMore(u))furiaePraetorSetOneMore(b,u,true,'战斗开始 · PassiveSkillInitiate');
    if(u.resources['天谴先锋战甲初始化']==null){
      u.resources['天谴先锋战甲初始化']=1;
      furiaePraetorSetArmor(b,u,u.enemyKit?.armorMaxLayers??6,'战斗开始 · MMonster_Heaven_StoneShieldController');
    }
  }
  function stoneShieldHit(b,u,from){
    const layers=stoneShieldLayers(u),crackedDamage=u.enemyKit?.armorCrackedDamage??.05;
    if(layers>0){
      if(layers>1){stoneShieldSet(b,u,layers-1,'受到攻击');return;}
      // OnAfterBeingAttacked 的 layer==1 分支：先回能，再 -1 层、行动延后，最后 5% 最大生命自伤。
      energy(b,from,Math.max(0,from.energyMax??0)*(u.enemyKit?.armorBreakEnergyRatio??.15),true);
      stoneShieldSet(b,u,0,'【战甲】被破坏');
      delay(b,u.id,u.enemyKit?.armorCrackedDelay??.2);
      record(b,'mechanic',u,{name:'【战甲】被破坏',attacker:from.id,energyRatio:u.enemyKit?.armorBreakEnergyRatio??.15,
        delayRatio:u.enemyKit?.armorCrackedDelay??.2,selfDamageMaxHpRatio:crackedDamage});
      // BookController.OnTrigger：天谴哲人的【战甲】被破坏时同时解除【宣教】。
      if(isFuriaePhilosopher(u))furiaePhilosopherRemoveBook(b,u,'【战甲】被破坏');
      damageTo(b,u,u,{name:'【战甲】破甲伤害',type:'Normal',element:'Imaginary',
        terms:[{scaling:'hp',multiplier:crackedDamage}],hitEnergy:0,toughness:0},1,'primary','additional');
      return;
    }
    // OnAfterBeingAttacked 的外层失败分支：layer==0 时每次受击追加少量自伤。
    const extra=u.enemyKit?.armorCrackedDamageAfter??.015;
    damageTo(b,u,u,{name:'【战甲】破损追加伤害',type:'Normal',element:'Imaginary',
      terms:[{scaling:'hp',multiplier:extra}],hitEnergy:0,toughness:0},1,'primary','additional');
  }
  function furiaePraetorArmorHit(b,u,from){return stoneShieldHit(b,u,from);}
  function furiaePraetorAfter(b,u,key,kind,selected){
    // Skill04_Phase02 末尾 AddModifier OneMorePerTurn；随后按是否有 OneMorePerTurn 决定追加行动。
    if(key==='skill04'&&!furiaePraetorHasOneMore(u))furiaePraetorSetOneMore(b,u,true,'【在滔滔血海中沉溺】');
    resource(b,u,'天谴先锋本回合追加行动',furiaePraetorHasOneMore(u)&&kind!=='continuation'?1:0);
    if(key!=='skill04')return;
    // AddModifier ..._Skill04_DamageTakenUp（AllEnemy, LifeTime=Skill04[3]）：
    // MDF_DamageTakenUpRatio = Skill04[1] / TargetCount，TargetCount 是结算前的存活我方人数。
    const count=Math.max(1,selected?.length??0),ratio=(u.enemyKit?.skill04Params?.[1]??1.2)/count,
      duration=u.enemyKit?.skill04Params?.[3]??2,applied=[];
    for(const to of (selected??[]).filter(live)){
      buff(b,u,to,'【易伤】','vuln',ratio,duration,
        {id:u.id+':furiae-praetor-vulnerability:'+to.id,tag:furiaePraetorVulnerabilityTag,debuff:true});
      applied.push(to.id);
    }
    record(b,'mechanic',u,{name:'【在滔滔血海中沉溺】· 平均分摊易伤',targets:applied,ratio,duration,targetCount:count,
      modifierId:'MModifier_Monster_W4_Claymore_00_Skill04_DamageTakenUp'});
  }
  // 4012020 天谴哲人：Skill01【宣教】增益、Skill02 单体、StoneShield【战甲】与 BookKiller【永恒的活火】。
  function furiaePhilosopherBookTargets(b,u){
    // AllTeammate 含施法者本人；296710484 的写入方未在已下载文件中出现，按「始终为假」处理。
    return b.units.filter(t=>live(t)&&t.side===u.side&&!tag(t,furiaePhilosopherBookTag));
  }
  function furiaePhilosopherApplyBook(b,u,to,reason){
    const speed=u.enemyKit?.bookSpeedBonus??.3,damage=u.enemyKit?.bookDamageBonus??.3;
    buff(b,u,to,'【宣教】· 速度','speedPct',speed,null,
      {id:u.id+':scholar-book-speed:'+to.id,tag:furiaePhilosopherBookTag,removeOnSourceDeath:true});
    buff(b,u,to,'【宣教】· 伤害','dmgBoost',damage,null,
      {id:u.id+':scholar-book-damage:'+to.id,tag:furiaePhilosopherBookTag,removeOnSourceDeath:true});
    record(b,'mechanic',u,{name:'【宣教】施加',target:to.id,speedBonus:speed,damageBonus:damage,reason,
      modifier:'MModifier_Monster_W4_Scholar_00_BookTarget'});
  }
  function furiaePhilosopherRemoveBook(b,u,reason){
    const cleared=[];
    for(const t of b.units){
      const before=t.buffs.length;
      t.buffs=t.buffs.filter(e=>e.tag!==furiaePhilosopherBookTag||e.source!==u.id);
      if(t.buffs.length<before)cleared.push(t.id);
    }
    if(cleared.length)record(b,'mechanic',u,{name:'【宣教】解除',reason,targets:cleared,
      modifier:'MModifier_Monster_W4_Scholar_00_BookController'});
    return cleared;
  }
  function furiaePhilosopherNextAction(b,u){
    // AI：存在可施加【宣教】的队友时施放 Skill01，否则施放 Skill02。
    return furiaePhilosopherBookTargets(b,u).length?{key:'skill01'}:{key:'skill02'};
  }
  function furiaePhilosopherAfter(b,u,key){
    if(key!=='skill01')return;
    const pool=furiaePhilosopherBookTargets(b,u);
    if(!pool.length)return;
    // Retarget：AllTeammate + ByRandom + MaxNumber 1。
    furiaePhilosopherApplyBook(b,u,pool[Math.floor(b.random()*pool.length)],'斗争即正义 · ByRandom');
  }
  function furiaePhilosopherInitialize(b,u){
    u.resources??={};
    if(u.resources['天谴哲人战甲初始化']==null){
      u.resources['天谴哲人战甲初始化']=1;
      stoneShieldSet(b,u,u.enemyKit?.armorMaxLayers??3,'战斗开始 · MMonster_Heaven_StoneShieldController');
    }
  }
  function furiaePhilosopherDeath(b,from,to){
    // RemoveWhenCasterDead：施法者阵亡时清除其施加的【宣教】。
    furiaePhilosopherRemoveBook(b,to,'施法者阵亡');
    // BookKillerListener：仅 TeamLight（我方）击杀时，给击杀者附加 BookKiller。
    if(from?.side!=='ally'||!live(from)||from.id===to.id)return;
    const params=to.enemyKit?.passive02Params??[.3,.3,2],duration=to.enemyKit?.bookKillerLifeTime??params[2]??2;
    buff(b,to,from,'【永恒的活火】· 速度','speedPct',params[0]??.3,duration,
      {id:to.id+':scholar-killer-speed:'+from.id,tag:furiaePhilosopherKillerTag});
    buff(b,to,from,'【永恒的活火】· 伤害','dmgBoost',params[1]??.3,duration,
      {id:to.id+':scholar-killer-damage:'+from.id,tag:furiaePhilosopherKillerTag});
    record(b,'mechanic',to,{name:'【永恒的活火】致命一击者增益',target:from.id,speedBonus:params[0]??.3,
      damageBonus:params[1]??.3,duration,modifier:'MModifier_Monster_W4_Scholar_00_BookKiller'});
  }
  // 8002010 虚数织叶者：AIFlag 轮转（1→Skill03 / 2→Skill01+Skill02）与【后手】增伤。
  function imaginaryWeaverNextAction(b,u){
    const flag=u.resources?.['虚数织叶者AIFlag']??1;
    if(flag===1){resource(b,u,'虚数织叶者AIFlag',2);return {key:'skill03'};}
    resource(b,u,'虚数织叶者AIFlag',1);
    // 持有 Attack 增益时 AI 走 Skill02，否则走 Skill01。
    return {key:tag(u,imaginaryWeaverAttackTag)?'skill02':'skill01'};
  }
  function imaginaryWeaverInitialize(b,u){
    u.resources??={};
    resource(b,u,'虚数织叶者AIFlag',u.resources['虚数织叶者AIFlag']??1);
  }
  function imaginaryWeaverClearAttack(b,u,reason){
    if(!tag(u,imaginaryWeaverAttackTag))return false;
    u.buffs=u.buffs.filter(e=>e.tag!==imaginaryWeaverAttackTag);
    record(b,'mechanic',u,{name:'【后手】解除',reason,modifier:'XP_Minion02_00_Attack'});
    return true;
  }
  function imaginaryWeaverAfter(b,u,key){
    if(key==='skill03'){
      const bonus=u.enemyKit?.attackBuffDamageBonus??1;
      buff(b,u,u,'【后手】','dmgBoost',bonus,null,{id:u.id+':weaver-attack-up',tag:imaginaryWeaverAttackTag});
      record(b,'mechanic',u,{name:'【后手】施加',damageBonus:bonus,sourceParam:'Skill03[1]',modifier:'XP_Minion02_00_Attack'});
      return;
    }
    // Skill01/Skill02 命中结算后移除 Attack。
    if(key==='skill01'||key==='skill02')imaginaryWeaverClearAttack(b,u,`${key==='skill02'?'颂歌爆发':'颂歌光束'}结算后`);
  }
  // 8003020 外宇宙之炎：Phase_Flag / AIFlag 双旗标、【焚烧】持续伤害、【自燃】与【熔聚】。
  function universeFireNextAction(b,u){
    // 决策在 UseSkill 之前写回下一状态；AIControl.OnAfterSkillUse 的 +1 只在
    // 两个不写旗标的 AIFlag=3 备用分支上改变走向（加到上限后回绕到 1）。
    const phase=u.resources?.['外宇宙之炎Phase_Flag']??1,flag=u.resources?.['外宇宙之炎AIFlag']??1,
      set=value=>resource(b,u,'外宇宙之炎AIFlag',value);
    if(phase===1){
      if(flag===1){set(2);return {key:'skill01'};}
      if(flag===2){set(1);return {key:'skill03'};}
      set(1);return {key:'skill01'};
    }
    if(flag===1){set(2);return {key:'skill05'};}
    if(flag===2){set(1);return {key:'skill07'};}
    set(1);return {key:'skill05'};
  }
  function universeFireInitialize(b,u){
    u.resources??={};
    resource(b,u,'外宇宙之炎Phase_Flag',u.resources['外宇宙之炎Phase_Flag']??1);
    resource(b,u,'外宇宙之炎AIFlag',u.resources['外宇宙之炎AIFlag']??1);
    resource(b,u,'外宇宙之炎StanceBreak_Sign',u.resources['外宇宙之炎StanceBreak_Sign']??0);
  }
  function universeFireBurnLayers(u){return tag(u,universeFireBurnTag)?.stacks??0;}
  function universeFireApplyBurn(b,u,to,reason){
    // AddModifier MMonster_XP_Elite01_00_Burn：Chance / LifeTime / MDF_DamagePercentage_Layer
    // 分别取 Skill01[1..3] 或 Skill05[1..3]；伤害为 MDF 0.5 × 层数（UseSnapshotEntity）。
    if(!live(to)||to.side===u.side)return null;
    const k=u.enemyKit,id=u.id+':xp-elite01-burn:'+to.id,previous=to.dots.find(effect=>effect.id===id),
      layers=(previous?.stacks??0)+1,perLayer=k?.burnDamagePerLayer??.5;
    const applied=dot(b,u,to,{name:'焚烧',element:'Fire',chance:k?.burnChance??1,duration:k?.burnDuration??2,stacks:layers,
      terms:[{scaling:'atk',multiplier:perLayer*layers}],
      extra:{id,tag:universeFireBurnTag,tickAt:'start',snapshotAtk:true,
        modifierName:k?.burnModifier??'MMonster_XP_Elite01_00_Burn'}});
    if(applied)record(b,'mechanic',u,{name:'【焚烧】施加',target:to.id,layers,duration:k?.burnDuration??2,
      damagePerLayer:perLayer,reason});
    return applied;
  }
  function universeFireMeltLayers(u){return tag(u,universeFireMeltTag)?.stacks??0;}
  function universeFireSetMelt(b,u,layers,reason){
    // XP_Elite_Fire_Skill07_AttackUp_Modifier：MaxLayer 3，每层 +Skill07[0] 攻击力。
    const max=u.enemyKit?.meltMaxLayers??3,bonus=u.enemyKit?.meltAttackBonus??.3,before=universeFireMeltLayers(u),
      next=Math.max(0,Math.min(max,Math.floor(layers)));
    u.buffs=u.buffs.filter(effect=>effect.tag!==universeFireMeltTag);
    if(next>0)buff(b,u,u,'【熔聚】· 攻击力','atkPct',bonus*next,null,
      {id:u.id+':xp-elite01-melt',tag:universeFireMeltTag,stacks:next,modifierName:u.enemyKit?.meltModifier});
    if(before!==next)record(b,'mechanic',u,{name:'【熔聚】层数变化',layers:next,max,layerBonus:bonus,
      attackBonus:bonus*next,reason});
  }
  function universeFireEnterBurning(b,u,reason){
    // Skill03_Phase02：AddModifier XP_Fire_Elite_Burning_Modifier_2（OnStack 写 Phase_Flag=2），
    // 随后 DefineDynamicValue StanceBreak_Sign=1。
    resource(b,u,'外宇宙之炎Phase_Flag',2);
    resource(b,u,'外宇宙之炎StanceBreak_Sign',1);
    buff(b,u,u,'【自燃】','marker',0,null,{id:u.id+':xp-elite01-burning',tag:universeFireBurningTag,
      modifierName:u.enemyKit?.burningModifier??'XP_Fire_Elite_Burning_Modifier_2'});
    record(b,'mechanic',u,{name:'【自燃】施加',phaseFlag:2,stanceBreakSign:1,reason});
  }
  function universeFireLeaveBurning(b,u,reason){
    // XP_Fire_Elite_Burning_Modifier_2.OnDestroy：Phase_Flag=1、AIFlag=1。
    if(!tag(u,universeFireBurningTag))return false;
    u.buffs=u.buffs.filter(effect=>effect.tag!==universeFireBurningTag);
    resource(b,u,'外宇宙之炎Phase_Flag',1);
    resource(b,u,'外宇宙之炎AIFlag',1);
    record(b,'mechanic',u,{name:'【自燃】解除',phaseFlag:1,aIFlag:1,reason});
    return true;
  }
  function universeFireBreak(b,u){
    // MMonster_XP_Elite01_00_ListenStanceBreakModifier.OnBeingBreak：仅当
    // StanceBreak_Sign==1 时移除【自燃】与【熔聚】（8003021 变体保留【熔聚】）。
    if((u.resources?.['外宇宙之炎StanceBreak_Sign']??0)!==1)return;
    const burning=tag(u,universeFireBurningTag)!=null,melt=universeFireMeltLayers(u);
    universeFireLeaveBurning(b,u,'弱点击破');
    universeFireSetMelt(b,u,0,'弱点击破');
    resource(b,u,'外宇宙之炎StanceBreak_Sign',0);
    record(b,'mechanic',u,{name:'弱点击破 · 【自燃】/【熔聚】解除',burning,melt,maxMelt:u.enemyKit?.meltMaxLayers??3,
      modifier:'MMonster_XP_Elite01_00_ListenStanceBreakModifier'});
  }
  function universeFireHitCounts(b,u){
    // b.hitTargets 只保留去重后的目标，而 Skill05_Phase02 的每个 RetargetPerSequence
    // 都各自施加一次【焚烧】；按本次行动已记录的伤害事件统计每个目标被命中的次数。
    const counts=new Map();
    let start=0;
    for(let index=b.log.length-1;index>=0;index--){
      const event=b.log[index];
      if(event.type==='action'&&event.actor===u.id){start=index;break;}
    }
    for(let index=start+1;index<b.log.length;index++){
      const event=b.log[index];
      if(event.type==='damage'&&event.actor===u.id&&event.kind!=='dot'&&event.target)
        counts.set(event.target,(counts.get(event.target)??0)+1);
    }
    return counts;
  }
  function universeFireAfter(b,u,key,hitTargets,selected){
    const hit=target=>live(target)&&target.side!==u.side;
    if(key==='skill01'){
      const to=(hitTargets??selected??[]).find(hit);
      if(to)universeFireApplyBurn(b,u,to,'咆哮之火命中');
      return;
    }
    if(key==='skill05'){
      // Skill05_Phase02：5 个 RetargetPerSequence 各自结算命中并施加一次【焚烧】；
      // 同一目标被多次命中时按 LayerAddWhenStack 逐次叠层。
      for(const [id,count] of universeFireHitCounts(b,u)){
        const to=b.units.find(unit=>unit.id===id);
        for(let index=0;index<count;index++)universeFireApplyBurn(b,u,to,'净炎之雨命中');
      }
      return;
    }
    if(key==='skill03'){universeFireEnterBurning(b,u,'汲取炎华');return;}
    if(key==='skill07')universeFireSetMelt(b,u,universeFireMeltLayers(u)+1,'熔聚');
  }
  // 3003030「身陷樊笼的往昔」：使者带锁链（AimTarget）→ 蓄力期间被攻击追加锁定 → 笼中传福音按锁定人数平均分摊。
  function cagePastMarked(b,u){return b.units.filter(target=>live(target)&&target.side!==u.side&&
    target.buffs.some(effect=>effect.tag===cagePastAimTag&&effect.source===u.id));}
  function cagePastAimCount(u){return u.resources?.['身陷樊笼锁定人数']??0;}
  function cagePastLayers(u){return u.buffs.find(effect=>effect.tag===cagePastAimingTag)?.stacks??0;}
  function cagePastHasOneMore(u){return u.buffs.some(effect=>effect.tag==='OneMore'||effect.modifierName==='OneMore');}
  function cagePastMark(b,u,to,reason){
    if(!live(to)||to.side===u.side)return false;
    if(to.buffs.some(effect=>effect.tag===cagePastAimTag&&effect.source===u.id))return false;
    buff(b,u,to,'【使者带锁链】锁定','marker',0,null,{id:u.id+':cage-past-aim:'+to.id,tag:cagePastAimTag,debuff:true,
      removeOnSourceDeath:true,modifierName:'Monster_W3_Figure_02_AimTarget'});
    const count=cagePastAimCount(u)+1;
    resource(b,u,'身陷樊笼锁定人数',count);
    record(b,'mechanic',u,{name:'【使者带锁链】锁定',target:to.id,count,reason,
      modifier:'Monster_W3_Figure_02_AimTarget'});
    return true;
  }
  function cagePastStartAiming(b,u,reason){
    u.buffs=u.buffs.filter(effect=>effect.tag!==cagePastAimingTag);
    buff(b,u,u,'【蓄力】· 使者带锁链','marker',0,null,{id:u.id+':cage-past-aiming',tag:cagePastAimingTag,
      stacks:u.enemyKit?.aimInitialLayers??4,modifierName:'Monster_W3_Figure_02_IsAiming'});
    record(b,'mechanic',u,{name:'【使者带锁链】开始蓄力',layers:u.enemyKit?.aimInitialLayers??4,reason,
      modifier:'Monster_W3_Figure_02_IsAiming'});
  }
  function cagePastClearMarks(b,u,reason){
    const cleared=[];
    for(const target of b.units){
      const before=target.buffs.length;
      target.buffs=target.buffs.filter(effect=>effect.tag!==cagePastAimTag||effect.source!==u.id);
      if(target.buffs.length<before)cleared.push(target.id);
    }
    u.buffs=u.buffs.filter(effect=>effect.tag!==cagePastAimingTag);
    resource(b,u,'身陷樊笼锁定人数',0);
    if(cleared.length||reason)record(b,'mechanic',u,{name:'清除【使者带锁链】锁定',targets:cleared,reason});
    return cleared;
  }
  function cagePastNextAction(b,u){
    // AI 只有 AIFlag 驱动、没有技能 CD；AIFlag=10 → Skill07 在已下载文件中没有写入方。
    const flag=u.resources?.['身陷樊笼AIFlag']??1,set=value=>resource(b,u,'身陷樊笼AIFlag',value);
    if(flag===1){set(2);return {key:'skill01'};}
    if(flag===2){set(3);return {key:'skill03'};}
    if(flag===3){set(4);return {key:'skill03'};}
    if(flag===4){
      if(cagePastHasOneMore(u))return {key:'skill03'};
      set(5);return {key:'skill04'};
    }
    if(flag===5){set(6);return {key:'skill05'};}
    if(flag===6){set(1);return {key:'skill01'};}
    if(flag===7){set(6);return {key:'skill03'};}
    if(flag===10){set(1);return {key:'skill07'};}
    return {key:'skill01'};
  }
  function cagePastAfter(b,u,key,selected){
    if(key==='skill04'){
      // Skill04_Phase02：MarkCount 复位 → 随机 1 名我方施加 AimTarget（AimTargetCount=1）→ 自身 IsAiming 4 层。
      resource(b,u,'身陷樊笼锁定人数',0);
      const pool=enemies(b,u).filter(live);
      const target=pool.length?pool[Math.floor(b.random()*pool.length)]:null;
      if(target)cagePastMark(b,u,target,'使者带锁链 · 随机 1 名');
      cagePastStartAiming(b,u,'使者带锁链');
      return;
    }
    if(key==='skill05'){
      // Skill05_Phase02：对每个被锁目标造成 15 ÷ 锁定人数 倍攻击力物理伤害，随后清除全部锁定与蓄力。
      const marked=cagePastMarked(b,u),count=Math.max(1,marked.length),
        ratio=(u.enemyKit?.skill05Params?.[0]??15)/count;
      for(const target of marked)
        damageTo(b,u,target,{name:'笼中传福音',type:'Normal',element:'Physical',
          terms:[{scaling:'atk',multiplier:ratio}],hitEnergy:u.enemyKit?.skill05HitEnergy??15,
          toughness:u.enemyKit?.skill05Toughness??15},1,'primary','direct');
      record(b,'mechanic',u,{name:'【笼中传福音】平均分摊',targets:marked.map(target=>target.id),count,ratio,
        extraEffectId:u.enemyKit?.shareDamageExtraId??401301001});
      cagePastClearMarks(b,u,'笼中传福音结算');
    }
    void selected;
  }
  function cagePastAttacked(b,to,from){
    // IsAiming.OnAfterBeingAttacked：攻击者未被锁定、属我方、自身未破韧且锁定不满 4 人时，追加锁定并 +1 层。
    if(!cagePastLayers(to)||from?.side!=='ally'||!live(from)||!live(to))return;
    if((to.toughness??0)<=0)return;
    const count=cagePastAimCount(to),max=to.enemyKit?.maxAimTargets??4;
    if(count>=max)return;
    if(!cagePastMark(b,to,from,'蓄力期间被攻击追加'))return;
    const effect=to.buffs.find(candidate=>candidate.tag===cagePastAimingTag);
    if(effect)effect.stacks=Math.min(max,(effect.stacks??0)+1);
    record(b,'mechanic',to,{name:'【蓄力】追加锁定层数',target:from.id,layers:effect?.stacks??0,count});
  }
  function cagePastBreak(b,u){
    // IsAiming.OnBeingBreak：AIFlag=7、行动延后 0.5、清除自身与全部锁定。
    resource(b,u,'身陷樊笼AIFlag',u.enemyKit?.breakAiFlag??7);
    const ratio=u.enemyKit?.breakDelayRatio??.5;
    delay(b,u.id,ratio);
    cagePastClearMarks(b,u,'弱点击破');
    record(b,'mechanic',u,{name:'弱点击破 · 中断【使者带锁链】',aIFlag:u.enemyKit?.breakAiFlag??7,delayRatio:ratio});
  }

  // 蚕食者之影：AIFlag 轮转、蓄力层数（EnergyLayer）与黄金年代的解放 9 发投射物。
  function devourerShadowEnergy(u){return u.resources?.['蚕食者之影蓄力层数']??0;}
  function devourerShadowSetEnergy(b,u,value,reason){
    const next=Math.max(-1,Math.floor(value));
    resource(b,u,'蚕食者之影蓄力层数',next);
    record(b,'mechanic',u,{name:'【黄金年代的绸缪】蓄力层数',layers:next,reason});
  }
  function devourerShadowNextAction(b,u){
    const flag=u.resources?.['蚕食者之影AIFlag']??1,set=value=>resource(b,u,'蚕食者之影AIFlag',value);
    if(flag===0||flag===1){set(3);return {key:'skill02'};}
    if(flag===2){set(3);return {key:'skill02'};}
    if(flag===3){set(4);return {key:'skill03'};}
    if(flag===4){set(5);return {key:'skill05'};}
    if(flag===5){
      set(6);
      // EnergyLayer==0 → Skill06（清空），否则 Skill04（9 发黄金年代的解放）。
      return {key:devourerShadowEnergy(u)===0?'skill06':'skill04'};
    }
    if(flag===6){set(1);return {key:'skill03'};}
    // AIFlag 7 的整支决策在当前源中没有写入方；保底回到流年金刺。
    set(3);return {key:'skill02'};
  }
  function devourerShadowInitialize(b,u){
    u.resources??={};
    resource(b,u,'蚕食者之影AIFlag',u.resources['蚕食者之影AIFlag']??1);
    resource(b,u,'蚕食者之影蓄力层数',u.resources['蚕食者之影蓄力层数']??0);
    if(!tag(u,devourerShadowGuardTag))
      buff(b,u,u,'【流年盾纱】','dmgReduction',u.enemyKit?.damageReduce??.1,null,
        {id:u.id+':devourer-shadow-guard',tag:devourerShadowGuardTag,modifierName:'Monster_XP_Elite02_01_Passive'});
  }
  function devourerShadowConfine(b,u,to,reason){
    // MCommon_Confine：Chance = PassiveSkill01[1]，1 回合，行动延后 PassiveSkill01[2]。
    if(!live(to)||to.side===u.side)return false;
    const chance=Math.max(0,Math.min(1,(u.enemyKit?.confineChance??.2)*(1+(combatPanel(u).effectHit??0))*
      (1-(combatPanel(to).effectRes??0))));
    if(b.random()>=chance){record(b,'resist',u,{name:'抵抗【禁锢】',target:to.id,chance});return false;}
    buff(b,u,to,'【禁锢】','marker',0,1,{id:u.id+':devourer-shadow-confine:'+to.id,tag:devourerShadowConfineTag,
      debuff:true,control:'confine',tickAt:'start',modifierName:'MCommon_Confine'});
    delay(b,to.id,u.enemyKit?.confineDelayRatio??.5);
    record(b,'mechanic',u,{name:'【禁锢】施加',target:to.id,chance,delayRatio:u.enemyKit?.confineDelayRatio??.5,reason});
    return true;
  }
  function devourerShadowAfter(b,u,key,hitTargets,selected){
    if(key==='skill02'||key==='skill03'){
      const hits=(hitTargets??[]).filter(target=>live(target)&&target.side!==u.side);
      const targets=[...new Set(hits.length?hits:(selected??[]).filter(target=>target.side!==u.side))];
      for(const target of targets)devourerShadowConfine(b,u,target,key==='skill02'?'流年金刺命中':'流年谴罚命中');
      return;
    }
    if(key==='skill05'){devourerShadowSetEnergy(b,u,u.enemyKit?.energyChargeLayers??9,'黄金年代的绸缪');return;}
    if(key==='skill04'){
      // Skill04_Phase02：AccelerateLayer = EnergyLayer，随后 EnergyLayer = -1。
      resource(b,u,'蚕食者之影加速层数',devourerShadowEnergy(u));
      devourerShadowSetEnergy(b,u,-1,'黄金年代的解放开场');
      record(b,'mechanic',u,{name:'【黄金年代的解放】9 发投射物',hits:u.enemyKit?.volleyCount??9,
        multiplier:u.enemyKit?.volleyMultiplier??2.25});
      return;
    }
    if(key==='skill06'){devourerShadowSetEnergy(b,u,-1,'黄金年代的解放 · 清空');
      record(b,'mechanic',u,{name:'黄金年代的解放 · 清空',layers:-1});}
  }
  function devourerShadowAttacked(b,to,from){
    // Monster_XP_Elite02_01_Energy.OnAfterBeingAttacked：EnergyLayer>0 时 −1。
    if(from?.side!=='ally'||!live(to))return;
    const layers=devourerShadowEnergy(to);
    if(layers<=0)return;
    devourerShadowSetEnergy(b,to,layers-1,'受击削减蓄力');
  }
  function devourerShadowBreak(b,u){
    // AIChange.OnBeingBreak：延后 0.25；AIFlag ≤1→1、2..5→4、>5→1；EnergyLayer 减到 -1。
    const previous=u.resources?.['蚕食者之影AIFlag']??1,next=previous<=1?1:previous<=5?4:1;
    resource(b,u,'蚕食者之影AIFlag',next);
    delay(b,u.id,u.enemyKit?.breakDelayRatio??.25);
    devourerShadowSetEnergy(b,u,-1,'弱点击破');
    record(b,'mechanic',u,{name:'弱点击破 · 蚕食者之影蓄力中断',previousAIFlag:previous,aIFlag:next,
      delayRatio:u.enemyKit?.breakDelayRatio??.25});
  }
  // 402301001 / 402301002 正阳狮鹫：AIFlag 轮转、OneMorePerTurn、召唤与【艾格勒印记】。
  function noontideGryphonHasOneMore(u){return !!tag(u,noontideGryphonOneMoreTag);}
  function noontideGryphonSetOneMore(b,u,active,reason){
    const had=noontideGryphonHasOneMore(u);
    u.buffs=u.buffs.filter(e=>e.tag!==noontideGryphonOneMoreTag);
    if(active)buff(b,u,u,'OneMorePerTurn','marker',0,null,{id:u.id+':noontide-gryphon-one-more',tag:noontideGryphonOneMoreTag});
    if(had!==active)record(b,'mechanic',u,{name:'OneMorePerTurn 更新',active,reason});
  }
  function noontideGryphonNextAction(b,u){
    const flag=u.resources?.['正阳狮鹫AIFlag']??1,set=value=>resource(b,u,'正阳狮鹫AIFlag',value);
    if(flag===1){set(2);return {key:'skill01'};}
    if(flag===2){set(3);return {key:'skill02'};}
    if(flag===3){set(4);return {key:'skill01'};}
    if(flag===4){set(5);return {key:'skill03'};}
    set(1);
    // SelectAISkillTarget(Skill04, AIModifierNameSelector MMonster_W4_Griffin_SignOnAvatar)
    const locked=get(b,u.resources?.['正阳狮鹫锁定目标']);
    return {key:'skill04',...(live(locked)?{targetId:locked.id}:{})};
  }
  function noontideGryphonInitialize(b,u){
    u.resources??={};
    resource(b,u,'正阳狮鹫AIFlag',u.resources['正阳狮鹫AIFlag']??1);
    resource(b,u,'正阳狮鹫本回合追加行动',0);
    if(!noontideGryphonHasOneMore(u))noontideGryphonSetOneMore(b,u,true,'战斗开始 · PassiveSkillInitiate');
  }
  function noontideGryphonDetonate(b,owner,to,reason,layers=2,mixed=false){
    const kit=owner.enemyKit??{};
    record(b,'mechanic',owner,{name:'【艾格勒印记】爆发',target:to.id,layers,reason,mixed,
      energyCost:kit.markEnergyCost??40});
    // ModifySPNew：-1 × P01[0]（40 点能量）。
    energy(b,to,-(kit.markEnergyCost??40),true);
    if(mixed){
      // 组合印记：SetDynamicValueByProperty _MaxHP 后按 P01[2] 造成真实伤害，
      // 再追加 MCommon_Entangle（P02[0..4] = 概率 / 持续 / 行动延后 / 伤害倍率）。
      trueDamage(b,owner,to,Math.max(0,combatPanel(to).hp*(kit.mixedLoseHpRatio??.25)),
        '【艾格勒印记】与【欧洛尼斯印记】共鸣');
      const ent=kit.mixedEntangle??{},chance=Math.max(0,Math.min(1,ent.chance??1.2));
      if(chance>=1||b.random()<chance){
        buff(b,owner,to,'纠缠','marker',0,ent.lifetime??1,{id:owner.id+':noontide-gryphon-entangle:'+to.id,
          tag:'noontideGryphonEntangle',debuff:true,control:'entangle'});
        delay(b,to.id,ent.actionDelayRatio??.4);
        record(b,'mechanic',owner,{name:'【共鸣】施加纠缠',target:to.id,chance:ent.chance??1.2,
          lifetime:ent.lifetime??1,actionDelayRatio:ent.actionDelayRatio??.4,damagePercentage:ent.damagePercentage??1});
      }
    }else{
      damageTo(b,owner,to,{name:'【艾格勒印记】爆发',type:'Normal',element:'Fire',
        terms:[{scaling:'atk',multiplier:kit.markDamageMultiplier??1.5}],hitEnergy:0,toughness:0},1,'primary','additional');
    }
    // RemoveModifier(ModifierOwnerEntity, RemoveAllInstance)：只清除该目标身上的印记；
    // 组合印记分支同时移除【欧洛尼斯印记】。
    const before=to.buffs.length;
    to.buffs=to.buffs.filter(e=>e.tag!==noontideGryphonMarkTag&&!(mixed&&e.tag===moonlitPegasusMarkTag));
    const cleared=before-to.buffs.length;
    if(cleared)record(b,'mechanic',owner,{name:'【艾格勒印记】清除',target:to.id,count:cleared,reason});
  }
  function noontideGryphonApplyMark(b,owner,to,reason){
    if(!live(to)||to.side===owner.side)return;
    const max=owner.enemyKit?.markMaxLayers??2;
    const existing=to.buffs.find(e=>e.tag===noontideGryphonMarkTag&&e.source===owner.id);
    const layers=(existing?.stacks??0)+1,unicorn=to.buffs.some(e=>e.tag===moonlitPegasusMarkTag);
    if(!existing){
      buff(b,owner,to,'【艾格勒印记】','marker',0,null,{id:owner.id+':noontide-gryphon-mark:'+to.id,
        tag:noontideGryphonMarkTag,debuff:true,stacks:1,removeOnSourceDeath:true});
      if(!unicorn)record(b,'mechanic',owner,{name:'【艾格勒印记】叠加',target:to.id,layers:1,maxLayers:max,reason});
    }else existing.stacks=layers;
    // 叠加回调：层数 < 2 且持有【欧洛尼斯印记】时立即按组合印记结算；
    // 层数 == 2 时走普通爆发（此时即便同时持有【欧洛尼斯印记】也不再走组合分支）。
    if(layers>=max){noontideGryphonDetonate(b,owner,to,reason,layers,false);return;}
    if(unicorn){noontideGryphonDetonate(b,owner,to,reason,layers,true);return;}
    if(existing)record(b,'mechanic',owner,{name:'【艾格勒印记】叠加',target:to.id,layers,maxLayers:max,reason});
  }
  function noontideGryphonSummonEagles(b,boss){
    // SetDieImmediately + ForceKill CasterSummonedMinions：旧召唤物立即退场。
    let killed=0;
    for(const t of b.units)if(t!==boss&&t.side===boss.side&&t.summonerId===boss.id&&t.active!==false){
      t.active=false;t.hp=0;killed++;
    }
    if(killed)record(b,'mechanic',boss,{name:'ForceKill · 旧召唤物退场',count:killed});
    const blueprint=boss.enemyKit?.summonBlueprint;if(!blueprint)return;
    const delays=boss.enemyKit?.summonDelayRatios??[.5,.8,1.1,1.5],count=Math.min(boss.enemyKit?.summonCount??4,delays.length);
    for(let i=0;i<count;i++){
      const eagle=structuredClone(blueprint),order=b.units.reduce((n,t)=>Math.max(n,t.order??-1),-1)+1;
      eagle.id=boss.id+':meteoric-eagle:'+(i+1);eagle.name='流星铁鹰';eagle.summonerId=boss.id;
      eagle.order=order;eagle.active=true;eagle.wave=boss.wave??b.wave;
      eagle.hp=eagle.currentHp??eagle.panel.hp;eagle.energy=0;eagle.distance=10000*delays[i];eagle.advanceOrder=0;
      eagle.toughness=eagle.toughnessMax;eagle.broken=false;eagle.resources={};eagle.shields=[];
      eagle.buffs=[];eagle.dots=[];eagle.turns=0;eagle.skipTurns=0;
      Object.defineProperty(eagle,'battle',{value:b});b.units.push(eagle);b.rules?.unitCreated?.(b,eagle);
      buff(b,boss,eagle,'MCommon_Servant','marker',0,null,{id:boss.id+':griffin-servant:'+eagle.id,
        tag:noontideGryphonServantTag,removeOnSourceDeath:true});
      record(b,'summon',boss,{name:'降示黎明 · 召唤流星铁鹰',target:eagle.id,monsterId:eagle.monsterId,
        delayRatio:delays[i]});
    }
  }
  function noontideGryphonAfter(b,u,key,kind,selected,hitTargets){
    if(key==='skill03'){
      // Skill03_Phase01：随机 1 名持有【艾格勒印记】的我方；没有印记时改为随机 1 名我方。
      const marked=enemies(b,u).filter(to=>to.buffs.some(e=>e.tag===noontideGryphonMarkTag&&e.source===u.id));
      const pool=marked.length?marked:enemies(b,u);
      if(pool.length){
        const to=pool[Math.floor(b.random()*pool.length)];
        u.resources??={};resource(b,u,'正阳狮鹫锁定目标',to.id);
        buff(b,u,to,'【艾格勒 Sign】','marker',0,null,{id:u.id+':noontide-gryphon-sign:'+to.id,
          tag:noontideGryphonSignTag,debuff:true,removeOnSourceDeath:true});
        buff(b,u,u,'极高光 · 终结待机','marker',0,null,{id:u.id+':noontide-gryphon-ultra-ready',tag:noontideGryphonUltraReadyTag});
        record(b,'mechanic',u,{name:'点亮未来 · 锁定目标',target:to.id,priority:marked.length?'带有【艾格勒印记】':'随机我方',
          ultraReady:true,oneMorePerTurn:false});
      }
      noontideGryphonSetOneMore(b,u,false,'【点亮未来】移除 OneMorePerTurn');
    }
    if(key==='skill02'||key==='skill04'){
      const targets=[...new Set((hitTargets??selected??[]).filter(to=>live(to)&&to.side!==u.side))];
      for(const to of targets)noontideGryphonApplyMark(b,u,to,key==='skill02'?'【降示黎明】命中':'【赞美艾格勒】命中');
    }
    if(key==='skill04'){
      // DamagePerformFinish：移除全体我方身上的 SignOnAvatar。
      let cleared=0;
      for(const to of b.units)if(to.side!==u.side){const before=to.buffs.length;
        to.buffs=to.buffs.filter(e=>e.tag!==noontideGryphonSignTag);cleared+=before-to.buffs.length;}
      resource(b,u,'正阳狮鹫锁定目标',null);
      if(cleared)record(b,'mechanic',u,{name:'【赞美艾格勒】结算 · 清除 SignOnAvatar',count:cleared});
    }
    resource(b,u,'正阳狮鹫本回合追加行动',noontideGryphonHasOneMore(u)&&kind!=='continuation'?1:0);
  }
  function noontideGryphonBreak(b,u){
    const previous=u.resources?.['正阳狮鹫AIFlag']??1;
    const next=previous===2||previous===4?previous-1:previous===5?1:previous;
    resource(b,u,'正阳狮鹫AIFlag',next);
    if(!noontideGryphonHasOneMore(u))noontideGryphonSetOneMore(b,u,true,'弱点击破 · MMonster_W4_Griffin_00_Status');
    const hadUltra=!!tag(u,noontideGryphonUltraReadyTag);
    u.buffs=u.buffs.filter(e=>e.tag!==noontideGryphonUltraReadyTag);
    let signs=0;
    for(const to of b.units)if(to.side!==u.side){const before=to.buffs.length;
      to.buffs=to.buffs.filter(e=>e.tag!==noontideGryphonSignTag);signs+=before-to.buffs.length;}
    resource(b,u,'正阳狮鹫锁定目标',null);
    record(b,'mechanic',u,{name:'弱点击破 · 重置正阳狮鹫 AI',from:previous,to:next,oneMorePerTurn:true,
      clearedSigns:signs,clearedUltraReady:hadUltra});
  }
  function noontideGryphonAllyDeath(b,to){
    const griffins=b.units.filter(t=>live(t)&&isNoontideGryphon(t));
    if(!griffins.length)return;
    // MMonster_W4_Griffin_SignOnAvatar OnBeforeDying：锁定目标阵亡时转移到另一名我方。
    const sign=to.buffs.find(e=>e.tag===noontideGryphonSignTag);
    if(sign){
      const owner=griffins.find(g=>g.id===sign.source)??griffins[0];
      const candidates=b.units.filter(t=>live(t)&&t.side===to.side&&t!==to);
      if(candidates.length){
        const next=candidates[Math.floor(b.random()*candidates.length)];
        to.buffs=to.buffs.filter(e=>e.tag!==noontideGryphonSignTag);
        buff(b,owner,next,'【艾格勒 Sign】','marker',0,null,{id:owner.id+':noontide-gryphon-sign:'+next.id,
          tag:noontideGryphonSignTag,debuff:true,removeOnSourceDeath:true});
        resource(b,owner,'正阳狮鹫锁定目标',next.id);
        record(b,'mechanic',owner,{name:'SignOnAvatar 转移',from:to.id,to:next.id});
      }
    }
  }
  function noontideGryphonEnemyDeath(b,from,to){
    // MMonster_W4_Griffin_00_Debuff_Avatar_Status OnTriggerDeath：消灭敌方目标后解除 1 层印记，
    // 优先解除造成致命伤害的目标；该目标没有印记时随机解除 1 名持有印记的我方。
    const griffins=b.units.filter(t=>live(t)&&isNoontideGryphon(t));
    if(!griffins.length)return;
    const marked=u=>u?.side==='ally'&&u.buffs.some(e=>e.tag===noontideGryphonMarkTag);
    const preferred=marked(from);
    let owner=preferred?from:null;
    if(!owner){
      const pool=b.units.filter(t=>live(t)&&marked(t));
      if(pool.length)owner=pool[Math.floor(b.random()*pool.length)];
    }
    if(!owner)return;
    const layers=owner.buffs.find(e=>e.tag===noontideGryphonMarkTag)?.stacks??1;
    owner.buffs=owner.buffs.filter(e=>e.tag!==noontideGryphonMarkTag);
    // 解除计数写入 W4_Griffin_00_Debuff_Resolve（0..3，仅供 BattleScore 成就使用）。
    resource(b,griffins[0],'【艾格勒印记】解除次数',Math.min(3,(griffins[0].resources?.['【艾格勒印记】解除次数']??0)+1));
    record(b,'mechanic',griffins[0],{name:'【艾格勒印记】解除',target:owner.id,killer:preferred?from.id:null,
      victim:to.id,layers,reason:'消灭敌方目标 · MMonster_W4_Griffin_00_Debuff_Avatar_Status'});
  }
  function assistantGraffitiRusherEnemyAction(){return {key:'skill01'};}
  function kingPomPomFantasticStoryEnemyAction(b,u){
    const flag=u.resources?.['PF帕姆王AIFlag']??1;
    const oneMore=u.buffs.some(e=>e.tag==='OneMore'||e.modifierName==='OneMore');
    if(flag===1){resource(b,u,'PF帕姆王AIFlag',2);return {key:'skill03'};}
    if(flag===2){if(oneMore){resource(b,u,'PF帕姆王AIFlag',2);return {key:'skill01'};}
      resource(b,u,'PF帕姆王AIFlag',3);return {key:'skill04'};}
    if(flag===3){resource(b,u,'PF帕姆王AIFlag',4);return {key:'skill02'};}
    if(flag===4){if(oneMore){resource(b,u,'PF帕姆王AIFlag',4);return {key:'skill02'};}
      resource(b,u,'PF帕姆王AIFlag',5);return {key:'skill05'};}
    if(flag===5){resource(b,u,'PF帕姆王AIFlag',6);return {key:'skill06'};}
    if(flag===6){resource(b,u,'PF帕姆王AIFlag',oneMore?8:7);return {key:'skill01'};}
    if(flag===7){resource(b,u,'PF帕姆王AIFlag',8);return {key:'skill04'};}
    resource(b,u,'PF帕姆王AIFlag',3);return {key:'skill02'};
  }
  function enemyAction(b,u){
    if(isFireProwler(u))return fireProwlerEnemyAction(b,u);
    if(u.enemyKit?.id===3002010)return dreamjoltMrDomescreenEnemyAction(b,u);
    if(u.enemyKit?.id===5012050)return assistantGraffitiRusherEnemyAction();
    if(u.enemyKit?.id===2022040)return {key:'skill01'};
    if(u.enemyKit?.id===2012010)return {key:'skill01'};
    if(u.enemyKit?.id===300302007)return sweetGorillaEnemyAction(b,u);
    if(u.enemyKit?.id===5012120)return alloyNannyEnemyAction(b,u);
    if(u.enemyKit?.id===5012100)return {key:'skill01'};
    if(u.enemyKit?.id===4062010)return ichorPheasantEnemyAction(u);
    if(u.enemyKit?.id===1002030)return silvermaneCannoneerEnemyAction(b,u);
    if(isPresentInebriated(u))return presentInebriatedEnemyAction(b,u);
    if(isCagePast(u))return cagePastNextAction(b,u);
    if(isDevourerShadow(u))return devourerShadowNextAction(b,u);
    if(u.enemyKit?.id===5014023)return kingPomPomFantasticStoryEnemyAction(b,u);
    if(u.enemyKit?.id===3003040)return cacoHarmonyEnemyAction(b,u);
    if(u.enemyKit?.id===5023010)return joyAscendantEnemyAction(b,u);
    if(u.enemyKit?.id===5014020)return kingPomPomEnemyAction(b,u);
    if(u.enemyKit?.id===402302001)return moonlitPegasusEnemyAction(b,u);
    if(u.enemyKit?.id===8033020)return lighthouseEnemyAction(b,u);
    if(u.enemyKit?.id===4033030)return darkSunGryphonEnemyAction(b,u);
    if(u.enemyKit?.id===4032010)return {key:'skill01'};
    if(u.enemyKit?.id===4032030)return blackTideAxeEnemyAction(b,u);
    if(isFuriaePraetor(u))return furiaePraetorNextAction(b,u);
    if(isFuriaePhilosopher(u))return furiaePhilosopherNextAction(b,u);
    if(isImaginaryWeaver(u))return imaginaryWeaverNextAction(b,u);
    if(isUniverseFireElite(u))return universeFireNextAction(b,u);
    if(isNoontideGryphon(u))return noontideGryphonNextAction(b,u);
    if(u.enemyKit?.id===5023020)return {key:'skill01'};
    if(u.enemyKit?.id===202205004)return {key:'skill01'};
    if(u.enemyKit?.id===503401002)return {key:'skill01'};
    // Pollux's indexed skill candidates are available locally, but the source
    // AI sequence is empty. Use the sourced single-target skill as a visible
    // fallback; buildEndgameEncounter keeps the behavior marked incomplete.
    if(u.enemyKit?.id===4014030)return {key:'skill01'};
    if(u.enemyKit?.id===4053020)return cyclonicSwarmMotherEnemyAction(b,u);
    if(u.enemyKit?.id===3024030)return swarmNightmareEnemyAction(b,u);
    if([5013040,5013050,5013060,5013070].includes(u.enemyKit?.id))return dawnCorpsEnemyAction(b,u);
    if(u.enemyKit?.id===403301002)return blackTideDaemonEnemyAction(b,u);
    if(u.enemyKit?.id===1002020)return roamingBanditEnemyAction(b,u);
    if(u.enemyKit?.id===2022010)return {key:'skill'};
    if(u.enemyKit?.id===4052010)return {key:'skill'};
    if(u.enemyKit?.id===1002040)return {key:'skill'};
    if(u.enemyKit?.id===2004014)return soulhookSovereignNextAction(b,u);
    if(u.enemyKit?.id===4064012)return arbiterOfLostAbyssNextAction(b,u);
    if(u.enemyKit?.id===4063010){
      const flag=u.resources?.['翼蛇形AIFlag']??1;
      if(flag===1){resource(b,u,'翼蛇形AIFlag',2);resource(b,u,'翼蛇形待追加行动','skill01');return {key:'skill02'};}
      if(flag===2){resource(b,u,'翼蛇形AIFlag',3);return {key:'skill03'};}
      if(flag===3){resource(b,u,'翼蛇形AIFlag',4);return {key:'skill04'};}
      if(flag===4){resource(b,u,'翼蛇形AIFlag',5);resource(b,u,'翼蛇形待追加行动','skill02');return {key:'skill01'};}
      if(flag===5){resource(b,u,'翼蛇形AIFlag',6);return {key:'skill03'};}
      resource(b,u,'翼蛇形AIFlag',1);return {key:'skill04'};
    }
    if(u.enemyKit?.id===3013010)return fadedRageEnemyAction(b,u);
    if(u.enemyKit?.id===8012020)return voidrangerTramplerEnemyAction(b,u);
    if(u.enemyKit?.id===8012030){
      if(u.buffs.some(e=>e.tag===obliteratorOverheatTag))return {key:'skill02'};
      const marked=enemies(b,u).find(t=>t.buffs.some(e=>e.tag===u.enemyKit.targetSelector||e.modifierName===u.enemyKit.targetSelector));
      return {key:'skill01',...(marked?{targetId:marked.id}:{})};
    }
    if(u.enemyKit?.id===2023020)return longRightEnemyAction(b,u);
    if(u.enemyKit?.id===2033010)return lycanMechaEnemyAction(b,u);
    if(u.enemyKit?.id===4022010)return meteoricEagleEnemyAction(b,u);
    if(u.enemyKit?.id===8003010)return iceOutOfSpaceEnemyAction(b,u);
    if(u.enemyKit?.id===5013010)return rockingRebelEnemyAction(b,u);
    if(u.enemyKit?.id===4053010)return waveLadyEnemyAction(b,u);
    if(u.enemyKit?.id===8033010)return seniorStaffEnemyAction(b,u);
    if(u.enemyKit?.id===202303016)return ascendedEnemyAction(b,u);
    if(isDirewolf(u))return direwolfEnemyAction(b,u);
    if(isMechaFire(u))return mechaFireEnemyAction(b,u);
    return jinrenEnemyAction(b,u);
  }
  function spawnSweetGorillaHounds(b,boss){
    const blueprint=boss.enemyKit?.summonBlueprint;
    if(!blueprint)return 0;
    const room=Math.max(0,5-allies(b,boss).length),count=Math.min(boss.enemyKit.summonCount??2,room);
    for(let i=0;i<count;i++){
      const hound=structuredClone(blueprint),order=b.units.reduce((n,t)=>Math.max(n,t.order??-1),-1)+1;
      hound.id=boss.id+':bubble-hound:'+(i+1);hound.name='气泡锂犬';hound.summonerId=boss.id;
      hound.order=order;hound.active=true;hound.wave=boss.wave??b.wave;
      hound.hp=hound.currentHp??hound.panel.hp;hound.energy=0;
      hound.distance=10000*(boss.enemyKit.summonDelayRatios?.[i]??.25);hound.advanceOrder=0;
      hound.toughness=hound.toughnessMax;hound.broken=false;hound.resources={};hound.shields=[];
      hound.buffs=[];hound.dots=[];hound.turns=0;hound.skipTurns=0;
      Object.defineProperty(hound,'battle',{value:b});b.units.push(hound);b.rules?.unitCreated?.(b,hound);
      buff(b,boss,hound,'MCommon_Servant','marker',0,null,{id:boss.id+':servant:'+hound.id,
        tag:'sweetGorillaServant',removeOnSourceDeath:true});
      record(b,'summon',boss,{name:'苏乐达派对 · 召唤气泡锂犬',target:hound.id,monsterId:hound.childId,
        delayRatio:boss.enemyKit.summonDelayRatios?.[i]??.25});
    }
    return count;
  }
  function jinrenTurnEffect(b,u,key,selected){
    if(u.enemyKit?.id!==2013020)return;
    if(key==='skill02'&&selected[0])applyJinrenUnstable(b,u,selected[0],u.enemyKit.unstableChance);
    if(key==='skill03'){
      const eligible=enemies(b,u).filter(t=>!t.buffs.some(e=>e.tag===jinrenUnstableTag||e.tag===jinrenShakeTag));
      const count=Math.min(eligible.length>=3?u.enemyKit.skill03MaxTargets:1,eligible.length);
      for(let i=eligible.length-1;i>0;i--){const j=Math.floor(b.random()*(i+1));[eligible[i],eligible[j]]=[eligible[j],eligible[i]];}
      for(const to of eligible.slice(0,count))applyJinrenUnstable(b,u,to,u.enemyKit.skill03Chance);
    }
    if(key==='skill04'||key==='skill06'){
      const to=selected[0];
      if(to?.buffs.some(e=>e.tag===jinrenShakeTag)){
        damageTo(b,u,to,{name:'天坠 · 强烈震荡追加伤害',type:'Normal',element:'Physical',terms:[{scaling:'atk',multiplier:u.enemyKit.skill04BonusMultiplier}],hitEnergy:5,hitEnergyPerHit:true,toughness:0},1,'primary','direct');
        record(b,'mechanic',u,{name:'【天坠】追加伤害',target:to.id,multiplier:u.enemyKit.skill04BonusMultiplier});
      }
      for(const to of selected){to.buffs=to.buffs.filter(e=>e.tag!==jinrenShakeTag&&e.tag!==jinrenTargetTag);}
      resource(b,u,'拘魂目标',null);
    }
    if(key==='skill04Insert'&&selected[0]){
      const to=selected[0];resource(b,u,'拘魂目标',to.id);
      buff(b,u,u,'拘魂令 · 目标锁定','marker',0,null,{id:u.id+':jinren-target-lock',tag:jinrenTargetTag});
      buff(b,u,to,'被拘魂锁定','marker',0,null,{id:u.id+':jinren-target:'+to.id,tag:jinrenTargetTag});
      record(b,'mechanic',u,{name:'拘魂令 · 锁定下次【天坠】目标',target:to.id});
    }
  }
  function sp(b,from,amount,reason,{bank=false}={}){
    if(!amount)return;const old=b.sp,requested=amount;b.sp=Math.max(0,Math.min(b.maxSP,b.sp+amount));
    if(bank&&is(from,1306)&&from.kit.enhanced){const cap=from.kit.params.Ultra[4];resource(b,from,'溢出战技点',Math.min(cap,(from.resources['溢出战技点']??0)+Math.max(0,old+amount-b.maxSP)));}
    record(b,'sp',from,{amount:b.sp-old,requested,reason});
    if(amount>0){
      for(const a of b.units.filter(a=>live(a)&&is(a,1015)&&trace(a,3)))if(b.sp>=trace(a,3)[2])buff(b,a,a,'守护者','critDmg',trace(a,3)[0],trace(a,3)[1]);
      const p=cone(from,23021);if(p){let n=(from.resources['彩焰']??0)+amount;if(n>=p[3]){n=0;mask(b,from,p[2]);}resource(b,from,'彩焰',n);}
    }
  }
  function mask(b,u,duration){const p=cone(u,23021);buff(b,u,u,'假面','marker',0,duration,{tag:'mask',removeOnSourceDeath:true});for(const t of allies(b,u).filter(t=>t!==u)){
    buff(b,u,t,'假面 · 暴击率','critRate',p[4],duration,{tickOwner:u.id,requiresTag:{unit:u.id,tag:'mask'}});
    buff(b,u,t,'假面 · 暴伤','critDmg',p[1],duration,{tickOwner:u.id,requiresTag:{unit:u.id,tag:'mask'}});
  }}
  function spend(b,u,amount){
    if(!amount)return;sp(b,u,-amount,'技能消耗');u.spentThisTurn=(u.spentThisTurn??0)+amount;
    relics.spSpent(b,u);
    // 通用「消耗战技点」广播：模块可用它统计实际消耗（含 1306 免费战技等绕过路径由各自处理）。
    roster.spSpent?.(b,u,amount);
    for(const s of b.units.filter(t=>live(t)&&t.side===u.side&&is(t,1306))){const p=s.kit.params.Talent;
      // 强化花火的 E4 只提高「战技点上限增加效果」（由 maximumSP 结算），不提高【幻相】层数上限。
      const max=p[3];
      const recipients=s.kit.enhanced?[s]:allies(b,s),tagName=s.kit.enhanced?'illusion':'sparkleTalent:'+s.id;
      for(const to of recipients)buff(b,s,to,s.kit.enhanced?'幻相':'叙述性诡计','marker',0,p[0],{tag:tagName,stacks:Math.min(max,(tag(to,tagName)?.stacks??0)+amount)});
      if(s.kit.enhanced&&trace(s,1)&&u.buffs.some(e=>e.source===s.id&&e.tag==='sparkleSkill'))energy(b,s,trace(s,1)[1]*amount);
      if(s.kit.enhanced&&trace(s,2)&&u.spentThisTurn>=trace(s,2)[0])resource(b,s,'免费战技',1);
    }
  }
  function shield(b,u,to,mult,flat,{factor=1}={}){
    const p=combatPanel(u),boost=p.shieldBoost??0,value=(p.atk*mult+flat)*(1+boost)*factor;
    const cap=(p.atk*u.kit.params.BPSkill[0]+u.kit.params.BPSkill[1])*u.kit.params.BPSkill[3]*(1+boost),id=u.id+':dragon-shield',old=to.shields.find(s=>s.id===id),previous=old?.value??0,total=Math.min(cap,previous+value);
    const e={type:'shield',id,name:'腾荒 · 叠加护盾',value:total,source:u.id,remaining:u.kit.params.BPSkill[2],tickOwner:to.id,tickAt:'end',appliedTurn:to.turns};
    if(old)Object.assign(old,e);else to.shields.push(e);record(b,'shield',u,{target:to.id,name:e.name,value:total-previous,total,duration:e.remaining});
  }
  // 通用护盾：同类来源不叠加，取更强的一次并刷新持续时间（三月七 / 杰帕德 / 罗刹 E2 等）。
  function barrier(b,u,to,{name='护盾',value,duration,id=null,group='shield'}){
    const p=combatPanel(u),boost=p.shieldBoost??0,w=value*(1+boost),eid=id??u.id+':'+group,old=to.shields.find(s=>s.id===eid);
    const previous=old?.value??0,total=Math.max(previous,w);
    const e={type:'shield',id:eid,name,value:total,source:u.id,remaining:duration,tickOwner:to.id,tickAt:'end',appliedTurn:to.turns};
    if(old)Object.assign(old,e);else to.shields.push(e);
    record(b,'shield',u,{target:to.id,name,value:total-previous,total,duration});
    return total;
  }
  // 通用持续伤害：按基础概率命中，命中后按 id 覆盖刷新层数 / 持续时间。
  function dot(b,u,to,{name,element,value=0,terms=null,chance=1,duration=2,stacks=1,extra={}}){
    // dotRes：1008 阿兰行迹「抵抗持续伤害类负面状态的概率提高 50%」。dotRes=0 时表达式与旧实现完全一致
    // （保留 chance>=1 短路，不额外消耗随机数）。
    const dotRes=combatPanel(to).dotRes??0;
    const base=chance*(1+(combatPanel(u).effectHit??0))*(1-(combatPanel(to).effectRes??0));
    // 「基础概率」在游戏中仍需乘以 (1+效果命中)(1-效果抵抗)。chance>=1 时只有目标效果抵抗为 0
    // 才短路（此时 base>=1，结果一定是命中，且保持不消耗随机数）；目标有 effectRes 时必须按 base
    // 判定，否则 100% 基础概率的 DoT 会无视效果抵抗，与 dotRes>0 分支自相矛盾。
    const res=1-(combatPanel(to).effectRes??0);
    const hit=dotRes>0?b.random()<base*(1-Math.min(1,dotRes)):(chance>=1&&res>=1)||b.random()<base;
    if(!hit){record(b,'resist',to,{name:name+' 被抵抗',element});return null;}
    const {snapshotAtk:wantSnapshotAtk,...dotExtra}=extra;
    const data={type:'dot',id:u.id+':'+name,name,source:u.id,remaining:duration,tickOwner:to.id,tickAt:'end',appliedTurn:to.turns,element,value,terms,stacks,debuff:true,...dotExtra,
      ...(wantSnapshotAtk?{snapshotAtk:combatPanel(u).atk}: {})};
    to.dots=to.dots.filter(e=>e.id!==data.id);to.dots.push(data);
    record(b,'dot',u,{target:to.id,name,duration,stacks});relics.debuff(b,u,to,data);return data;
  }
  function applyPresentInebriatedDot(b,u,to,element){
    if(!live(to))return null;
    const k=u.enemyKit,isWind=element==='Wind',name=isWind?'荒宴醉':'欢宴罪',tagName=isWind?'presentInebriatedWindDot':'presentInebriatedThunderDot';
    const maxStacks=k.dotMaxStacks?.[isWind?'wind':'thunder']??3;
    const previous=to.dots.find(effect=>effect.tag===tagName&&effect.source===u.id);
    const stacks=Math.min(maxStacks,(previous?.stacks??0)+1);
    const effect=dot(b,u,to,{name,element,chance:k.dotChance,duration:k.dotDuration,stacks,
      terms:[{scaling:'atk',multiplier:k.dotMultiplier*stacks}],
      extra:{id:u.id+':'+tagName+':'+to.id,tag:tagName,tickAt:'start',
        modifierName:k.dotSnapshot?(isWind?'MMonster_W3_Figure_01_Poison':'MMonster_W3_Figure_01_Electric')
          :(isWind?'Monster_XP_Elite02_00_DotWind':'Monster_XP_Elite02_00_DotThunder'),
        ...(k.dotSnapshot?{snapshotAtk:true}:{})}});
    if(effect)record(b,'mechanic',u,{name:'「醉于盛会的此刻」施加宴饮持续伤害',status:name,target:to.id,
      element,stacks,maxStacks,duration:k.dotDuration,multiplier:k.dotMultiplier*stacks});
    return effect;
  }
  function initializeMaraSoldier(b,u){
    if(u?.side!=='enemy'||u.enemyKit?.id!==2022010)return;
    u.resources??={};u.resources['魔阴身士卒复起已触发']=0;
    buff(b,u,u,'复起 · 返魂','marker',0,null,{id:u.id+':mara-soldier-revive',tag:maraSoldierReviveTag,
      modifierName:'Monster_W2_Abomi01_00_Revive',debuff:true});
  }
  // 全属性抗性降低：引擎按元素分别读取 resReduction，需要逐个元素登记。
  function allResDown(b,u,to,value,duration,name='全属性抗性降低'){
    for(const element of ['Physical','Fire','Ice','Thunder','Wind','Quantum','Imaginary'])
      buff(b,u,to,name+' · '+element,'resPen',value,duration,{id:u.id+':resdown:'+element,debuff:true,element,resReduction:true});
  }
  // 通用持续治疗：模块在目标回合开始时调用 tickRegen 结算（数值以施法者面板为基准）。
  function regen(b,u,to,name,multiplier,flat,duration,extra={}){
    const {snapshotHp:wantSnapshotHp,...regenExtra}=extra;
    return buff(b,u,to,name,'marker',0,duration,{id:regenExtra.id??u.id+':regen:'+name,
      regen:{multiplier,flat,...(wantSnapshotHp?{snapshotHp:combatPanel(u).hp}:{})},removeOnSourceDeath:false,...regenExtra});
  }
  function tickRegen(b,u,actor,bonus=null){
    for(const e of actor.buffs.filter(e=>e.regen&&e.source===u.id))heal(b,u,actor,(e.regen.snapshotHp??combatPanel(u).hp)*e.regen.multiplier+e.regen.flat+(bonus?bonus(e):0));
  }
  function cleanseOne(b,u,to){const negative=[...to.buffs.filter(e=>e.debuff),...to.dots];const first=negative.find(e=>e.control)??negative[0];if(!first)return;to.buffs=to.buffs.filter(e=>e!==first);to.dots=to.dots.filter(e=>e!==first);record(b,'cleanse',u,{target:to.id,name:first.name});}
  function supportTarget(b,u){const id=u.policy?.allyTargetId??u.actions.skill?.targetId;return get(b,id)??allies(b,u).find(t=>is(t,1015))??allies(b,u).find(t=>t!==u)??u;}
  // 1141523「持有【军功】的角色暴击伤害提高 42%」是持有者状态光环。昔涟的诗篇把数值记在
  // 1412 的 resources（castPoem），这里保证光环总是挂在当前【军功】持有者身上：
  // 旧持有者身上的光环被移走，首次指定持有者时补挂。
  function syncLawPoem(b,u,to){
    for(const t of b.units){
      for(const e of [...t.buffs]){
        const tag=String(e.tag??'');
        if(!tag.startsWith('cyreneLawPoem:'))continue;
        if(t===to)continue;
        t.buffs=t.buffs.filter(x=>x!==e);
        if(!to.buffs.some(x=>x.tag===e.tag)){
          // id 里含旧持有者，迁移后同步重写，避免同一光环出现两条。
          e.id=tag.slice('cyreneLawPoem:'.length)+':poem-law-cd:'+to.id;
          to.buffs.push(e);
        }
      }
    }
    for(const key of Object.keys(u.resources)){
      if(!key.startsWith('Cyrene律法诗篇:'))continue;
      const cyreneId=key.slice('Cyrene律法诗篇:'.length),tag='cyreneLawPoem:'+cyreneId;
      if(to.buffs.some(e=>e.tag===tag))continue;
      buff(b,u,to,'献予「律法」之诗 · 暴击伤害','critDmg',u.resources[key],null,
        {id:cyreneId+':poem-law-cd:'+to.id,tag});
    }
  }
  function merit(b,u,to){const old=u.resources['军功目标'];if(old!==to.id){resource(b,u,'充能',0);resource(b,u,'军功目标',to.id);for(const t of b.units)t.buffs=t.buffs.filter(e=>!(e.source===u.id&&e.merit));syncLawPoem(b,u,to);}
    buff(b,u,to,'军功','atk',0,null,{tag:'merit',merit:true,convert:{source:u.id,stat:'atk',ratio:u.kit.params.Talent[1]}});
    if(rank(u,1))buff(b,u,to,'军功 · 无视防御','defIgnore',rank(u,1),null,{merit:true});
    if(rank(u,2))buff(b,u,to,'军功 · 增伤','dmgBoost',rank(u,2),null,{merit:true});
    if(rank(u,6))buff(b,u,to,'军功 · 抗穿','resPen',rank(u,6),null,{merit:true});
  }
  function ceryCharge(b,u,n){const max=u.kit.params.BPSkill[2];resource(b,u,'充能',Math.min(max,(u.resources['充能']??0)+n));u.pendingPromotion=u.resources['充能']>=u.kit.params.BPSkill[3];}
  function promotions(b){for(const u of b.units.filter(t=>live(t)&&is(t,1412)&&t.pendingPromotion)){u.pendingPromotion=false;
    const to=get(b,u.resources['军功目标']);if(to&&!tag(to,'peerage')){buff(b,u,to,'爵位 · 战技暴伤','critDmg',u.kit.params.BPSkill[0],null,{tag:'peerage',merit:true,abilityType:'BPSkill'});
      buff(b,u,to,'爵位 · 战技抗穿','resPen',u.kit.params.BPSkill[4],null,{merit:true,peerage:true,abilityType:'BPSkill'});
      if(rank(u,1,1))buff(b,u,to,'爵位 · 战技无视防御','defIgnore',rank(u,1,1),null,{merit:true,peerage:true,abilityType:'BPSkill'});
      to.buffs=to.buffs.filter(e=>!e.control);record(b,'mechanic',u,{name:'军功升级为爵位',target:to.id});
    }
  }}
  function bond(b,u,to){if(u.resources['同袍目标']!==to.id){for(const t of b.units)t.buffs=t.buffs.filter(e=>!(e.source===u.id&&e.bond));resource(b,u,'同袍目标',to.id);}
    if(trace(u,1))buff(b,u,to,'同袍 · 神秀','atk',0,null,{tag:'bondmate',bond:true,removeOnSourceDeath:true,convert:{source:u.id,stat:'atk',ratio:trace(u,1)[0]}});
    else buff(b,u,to,'同袍','marker',0,null,{tag:'bondmate',bond:true});
    if(rank(u,4))buff(b,u,to,'同袍 · 减伤','dmgReduction',rank(u,4),null,{bond:true});
    if(rank(u,6,2))buff(b,u,to,'同袍 · 无视防御','defIgnore',rank(u,6,2),null,{bond:true});
    let summon=b.summons.find(s=>s.owner===u.id);if(summon){summon.bondmate=to.id;summon.active=true;}
    else {summon={id:u.id+':dragon',name:'龙灵（'+u.name+'）',owner:u.id,bondmate:to.id,speed:u.kit.params.Talent[4],distance:10000,enhanced:0,active:true,order:b.units.length+b.summons.length};b.summons.push(summon);record(b,'summon',u,{name:'召唤龙灵',target:to.id});}
    return summon;
  }
  function heal(b,u,to,value,extraBoost=0){const action=b.activeAction?.actor===u.id?u.actions[b.activeAction.key]:null,p=combatPanel(u,{action}),amount=Math.max(0,Math.min(combatPanel(to).hp-to.hp,value*(1+(p.healingBoost??0)+extraBoost)*(1+(combatPanel(to).incomingHeal??0))));to.hp+=amount;record(b,'heal',u,{target:to.id,amount,hp:to.hp});if(amount>0)roster.hpChanged(b,to,'heal',amount,u);relics.healed(b,u,to);}
  const relics=relicRuntime({buff,stacks,record,energy,combatPanel});
  const shared={...api,live,allies,enemies,get,tag,rank,trace,buff,stacks,resource,sp,heal,cleanseOne,barrier,dot,allResDown,regen,tickRegen};
  const roster=rosterRuntime(shared),equipment=equipmentRuntime(shared);
  function onStart(b){
    for(const u of b.units){u.resources={};if(!u.kit)continue;
      if(is(u,1015)){resource(b,u,'充能',trace(u,2)?.[0]??0);}
      if(is(u,1306)){resource(b,u,'溢出战技点',0);resource(b,u,'免费战技',0);}
      if(is(u,1412)){resource(b,u,'充能',0);resource(b,u,'附加伤害次数',u.kit.params.Talent[3]);}
      if(is(u,1414)&&trace(u,2))advance(b,u.id,trace(u,2)[0]);
      if(is(u,1306)&&u.kit.enhanced&&rank(u,1,1))buff(b,u,u,'花火 E1 · 速度','speedPct',rank(u,1,1),u.kit.ranks[1][2]);
    }
    for(const u of b.units.filter(u=>live(u)&&u.enemyKit?.id===4022010)){
      u.resources['流星铁鹰监听技能已触发']=0;
      buff(b,u,u,'流星铁鹰 · 被动监听','marker',0,null,{id:u.id+':meteoric-eagle-status',tag:'meteoricEagleStatus'});
    }
    for(const u of b.units.filter(u=>live(u)&&u.enemyKit?.id===8003010)){
      resource(b,u,'外宇宙之冰AIFlag',1);resource(b,u,'外宇宙之冰PhaseFlag',1);
      resource(b,u,'外宇宙之冰本回合追加行动',0);resource(b,u,'外宇宙之冰击破结束待恢复',0);
      u.enemyKit.baseToughness??=u.toughnessMax;
    }
    for(const u of b.units.filter(u=>live(u)&&u.enemyKit?.id===5013010)){
      resource(b,u,'摇滚狂徒AIFlag',1);resource(b,u,'摇滚狂徒蓄力',0);
    }
    for(const u of b.units.filter(u=>live(u)&&u.side==='enemy'&&u.enemyKit?.id===4033030))
      resource(b,u,'黑日狮鹫AIFlag',1);
    for(const u of b.units.filter(u=>live(u)&&u.enemyKit?.id===2004014))resource(b,u,'支配者AIFlag',1);
    for(const u of b.units.filter(u=>live(u)&&u.enemyKit?.id===4053010)){
      resource(b,u,'波涛夫人AIFlag',1);
      buff(b,u,u,'OneMorePerTurn','marker',0,null,{id:u.id+':wave-lady-one-more-per-turn',tag:waveLadyOneMorePerTurnTag});
    }
    for(const u of b.units.filter(u=>live(u)&&u.enemyKit?.id===4064012)){
      resource(b,u,'裁定者AIFlag',1);
      const fortification=u.enemyKit.stageTags?.find(tag=>tag.name==='坚防守备'),damageReduction=fortification?.params?.[0];
      if(Number.isFinite(damageReduction)&&damageReduction>0&&damageReduction<1)
        buff(b,u,u,'坚防守备 · 基础减伤','dmgReduction',damageReduction,null,{id:u.id+':arbiter-fortification',tag:'arbiterFortification'});
    }
    for(const u of b.units.filter(t=>live(t)&&t.side==='enemy'&&t.enemyKit?.id===4063010)){
      resource(b,u,'翼蛇形AIFlag',1);resource(b,u,'翼蛇形旋绕层数',0);
      resource(b,u,'翼蛇形本回合反击已触发',0);resource(b,u,'翼蛇形待追加行动',null);
      setWingedSerpentOneMore(b,u,true);
    }
    for(const u of b.units.filter(t=>live(t)&&t.side==='enemy'&&t.enemyKit?.id===3002030))
      resource(b,u,'苏乐达陶醉层数',0);
    for(const u of b.units.filter(t=>live(t)&&t.side==='enemy'&&t.enemyKit?.id===2022010))initializeMaraSoldier(b,u);
    for(const u of b.units.filter(t=>live(t)&&t.side==='enemy'&&t.enemyKit?.id===8033010)){
      resource(b,u,'资深员工AIFlag',1);resource(b,u,'资深员工绩效点',0);
      resource(b,u,'资深员工本回合追加行动',0);
      if(u.enemyKit.oneMorePerTurn)buff(b,u,u,'每回合额外行动','marker',0,null,
        {id:u.id+':senior-staff-one-more-per-turn',tag:seniorStaffOneMorePerTurnTag});
    }
    for(const u of b.units.filter(t=>live(t)&&t.side==='enemy'&&t.enemyKit?.id===202303016)){
      resource(b,u,'承露天人AIFlag',1);resource(b,u,'承露天人特殊标记',0);
      resource(b,u,'承露天人本回合追加行动',0);
      if(u.enemyKit.oneMorePerTurn)buff(b,u,u,'每回合额外行动','marker',0,null,
        {id:u.id+':ascended-one-more-per-turn',tag:ascendedOneMorePerTurnTag});
    }
    for(const u of b.units.filter(t=>live(t)&&t.side==='enemy'&&isDirewolf(t)))direwolfInitialize(b,u);
    for(const u of b.units.filter(t=>live(t)&&t.side==='enemy'&&isMechaFire(t)))mechaFireInitialize(b,u);
    for(const u of b.units.filter(t=>live(t)&&t.side==='enemy'&&isFireProwler(t)))fireProwlerInitialize(b,u);
    for(const u of b.units.filter(t=>live(t)&&t.side==='enemy'&&t.enemyKit?.id===4032030))blackTideAxeInitialize(b,u);
    for(const u of b.units.filter(t=>live(t)&&t.side==='enemy'&&isFuriaePraetor(t)))furiaePraetorInitialize(b,u);
    for(const u of b.units.filter(t=>live(t)&&t.side==='enemy'&&isFuriaePhilosopher(t)))furiaePhilosopherInitialize(b,u);
    for(const u of b.units.filter(t=>live(t)&&t.side==='enemy'&&isImaginaryWeaver(t)))imaginaryWeaverInitialize(b,u);
    for(const u of b.units.filter(t=>live(t)&&t.side==='enemy'&&isUniverseFireElite(t)))universeFireInitialize(b,u);
    for(const u of b.units.filter(t=>live(t)&&t.side==='enemy'&&isDevourerShadow(t)))devourerShadowInitialize(b,u);
    for(const u of b.units.filter(t=>live(t)&&t.side==='enemy'&&isNoontideGryphon(t)))noontideGryphonInitialize(b,u);
    for(const u of b.units.filter(t=>live(t)&&t.side==='enemy'&&t.enemyKit?.id===300302007)){
      resource(b,u,'甜猿泰山AIFlag',1);u.enemyKit.toughnessImmuneTag='sweetGorillaCharge';
      u.resources['甜猿泰山本次盾击目标']=[];
    }
    for(const u of b.units.filter(t=>live(t)&&t.side==='enemy'&&t.enemyKit?.id===5012120))
      resource(b,u,'合金保姆AIFlag',1);
    for(const u of b.units.filter(t=>live(t)&&t.side==='enemy'&&t.enemyKit?.id===5014023)){
      initializePfPamFantasticStory(b,u);
    }
    for(const u of b.units.filter(t=>live(t)&&t.side==='enemy'&&t.enemyKit?.id===5012100))initializeMagicalGirlTroupe(b,u);
    syncMeteoricEagleMark(b,'战斗开始');
    for(const u of b.units.filter(live)){
      const p=u.gear?.cone?.p,id=u.gear?.cone?.id;
      if(p){if([23051,23048,22005,21003].includes(id))buff(b,u,u,'光锥 · 攻击','atkPct',p[0]);
        if(id===23021){buff(b,u,u,'游戏尘寰 · 暴伤','critDmg',p[0]);mask(b,u,p[5]);}
        if(id===23046){buff(b,u,u,'理想燃烧的地狱 · 暴击','critRate',p[0]);if(b.maxSP>=p[1])buff(b,u,u,'理想燃烧的地狱 · 入场攻击','atkPct',p[2]);}
        if(id===21004)buff(b,u,u,'记忆中的模样 · 击破','breakEffect',p[0]);
      }
      for(const s of u.gear?.sets??[])setStart(b,u,s);
      if(is(u,1306)&&trace(u,3)){const p=trace(u,3),q=allies(b,u).filter(t=>t.element==='Quantum').length;for(const to of allies(b,u))buff(b,u,to,'夜想曲','atkPct',u.kit.enhanced?p[0]:p[3]+(to.element==='Quantum'?p[Math.min(3,q)-1]??0:0),null,{removeOnSourceDeath:true});}
    }
    equipment.start(b);roster.start(b);relics.ready(b);
    // Permanent HP set bonuses are present before the first hit, including Techniques.
    for(const u of b.units)u.hp=u.currentHp??combatPanel(u).hp*(u.phaseRatios?.[0]??1);
    const entryPriority=u=>is(u,1306)?-80:is(u,1015)?-60:-55;
    for(const u of b.units.filter(t=>live(t)&&t.kit?.technique).sort((a,c)=>entryPriority(a)-entryPriority(c)||a.order-c.order)){
      if(is(u,1306)){sp(b,u,u.kit.params.Maze[0],'不可靠叙事者');if(u.kit.enhanced)energy(b,u,u.kit.params.Maze[1]);}
      if(is(u,1015)){resource(b,u,'充能',Math.min(u.kit.params.Ultra[2],u.resources['充能']+u.kit.params.Maze[1]));const a={name:'千里眼',type:'Maze',element:u.element,terms:[{scaling:'atk',multiplier:u.kit.params.Maze[0]}],toughness:60};for(const to of enemies(b,u))damageTo(b,u,to,a,1,'primary','technique');}
      if(is(u,1412)||is(u,1414))useAction(b,u,'skill','technique',supportTarget(b,u).id);
    }
    roster.entry(b);
  }
  function setStart(b,u,s){const p=s.p2;
    relics.start(b,u,s);
    const simple={101:['healingBoost',p[0]],102:['atkPct',p[0]],103:['defPct',p[0]],106:['dmgReduction',p[0]],108:['elemDmg.Quantum',p[0]],110:['elemDmg.Wind',p[0]],114:['speedPct',p[0]],120:['atkPct',p[0]],121:['speedPct',p[0]],122:['critRate',p[0]],124:['elemDmg.Quantum',p[0]],128:['shieldBoost',p[0]],301:['atkPct',p[0]],302:['hpPct',p[0]],303:['effectHit',p[0]],304:['defPct',p[0]],306:['critRate',p[0]],307:['breakEffect',p[0]],308:['energyRegen',p[0]],309:['critRate',p[0]],310:['effectRes',p[0]],311:['atkPct',p[0]],312:['energyRegen',p[0]],314:['atkPct',p[0]],317:['energyRegen',p[0]],318:['critDmg',p[0]],319:['hpPct',p[0]],320:['speedPct',p[0]]};
    if(simple[s.id])buff(b,u,u,s.name+' · 两件',...simple[s.id]);
    if(s.id===314&&rolePath(u)&&allies(b,u).some(t=>t!==u&&rolePath(t)===rolePath(u)))buff(b,u,u,s.name+' · 同命途','critRate',p[1]);
    if(s.id===128&&s.count>=4)buff(b,u,u,s.name+' · 四件盾量','shieldBoost',s.p4[0]);
    if(s.id===103&&s.count>=4)buff(b,u,u,s.name+' · 四件盾量','shieldBoost',s.p4[0]);
    if(s.id===317){const first=allies(b,u)[0];if(first!==u)buff(b,u,first,s.name,'atkPct',p[1],null,{removeOnSourceDeath:true});}
    if(s.id===308&&combatPanel(u).speed>=p[1])advance(b,u.id,p[2]);
    if(s.count>=4){if(s.id===101)sp(b,u,1,s.name);if(s.id===102)buff(b,u,u,s.name+' · 速度','speedPct',s.p4[0]);if(s.id===120)buff(b,u,u,s.name+' · 暴击','critRate',s.p4[0]);if(s.id===124)buff(b,u,u,s.name+' · 速度','speedPct',-s.p4[5]);}
  }
  function prepare(b,u,key,kind,action){
    const a={...roster.prepare(b,u,key,kind,action)};if(kind==='copy'||kind==='technique'){a.spCost=0;a.spGain=0;}
    if(key==='skill'&&is(u,1306)&&u.kit.enhanced&&u.resources['免费战技'])a.spCost=0;
    if(a.target==='ally')a.targetId=a.targetId??u.policy?.allyTargetId??([1105,1301].includes(u.characterId)?allies(b,u).sort((a,c)=>a.hp/combatPanel(a).hp-c.hp/combatPanel(c).hp)[0]?.id:supportTarget(b,u).id);
    if(u.side==='enemy'&&u.enemyKit?.id===3002030&&key==='skill'){
      const layers=Math.max(1,Math.min(u.enemyKit.tipsinessMax??4,u.resources?.['苏乐达陶醉层数']??0));
      a.terms=[{scaling:'atk',multiplier:u.enemyKit.skill01BaseMultiplier+u.enemyKit.skill01LayerMultiplier*layers}];
    }
    if(isFireProwler(u)&&key==='skill05'){
      // Skill05：AttackCount = 灾难之力 × Skill05[0]；2 / 4 / ≥6 分别结算 2 / 4 / 6 段
      // Skill05[1]，AttackCount == 8 时追加 1 段 2 倍，最后以 Skill05[2] 收尾。
      const params=u.enemyKit.skill05Params??[2,1,2],attackCount=fireProwlerTimePower(u)*params[0],
        hits=attackCount===2?2:attackCount===4?4:attackCount>=6?6:0;
      a.target='all';a.terms=hits?[{scaling:'atk',multiplier:params[1]}]:[];
      a.repeatCount=Math.max(1,hits);a.toughness=0;a.hitEnergy=0;
      a.fireProwlerAttackCount=attackCount;a.fireProwlerHits=hits;
    }
    if(isFireProwler(u)&&key==='skill06'){
      // Assist_Flag 1 → Skill01 阵型（4.0 / 2.0 震击），2 → Skill02 阵型（3.0 群体）。
      // 首领的阵型攻击与容器助战同属 Skill06_Phase02 的并行技能组：没有可助战容器时
      // RetargetList 为空，整组不执行，本回合也没有伤害。
      const kind=fireProwlerAssistFlag(u)===2?'b':'a',cap=fireProwlerPhase(u)>=2?(u.enemyKit.assistCountPhaseTwo??4):(u.enemyKit.assistCountPhaseOne??2),
        assisting=fireProwlerVessels(b,u,kind).slice(0,cap);
      a.fireProwlerAssistKind=kind;
      if(!assisting.length){a.terms=[];a.toughness=0;}
      else if(kind==='b'){a.target='all';a.terms=[{scaling:'atk',multiplier:u.enemyKit.skill02Params[0]}];}
      else{a.target='blast';a.terms=[{scaling:'atk',multiplier:u.enemyKit.skill01Params[0]},
        {scaling:'atk',multiplier:u.enemyKit.skill01Params[1],target:'adjacent'}];}
    }
    if(isFireProwler(u)&&key==='skill07')a.fireProwlerAttackCount=fireProwlerTimePower(u)*(u.enemyKit.skill07Params?.[0]??1);
    // 仇心忿火（Skill02_Phase02）OnStart[1]：Retarget AllDarkTeam，把所有蚀斧的
    // Flag_RevengeTrigger 清回 0，因此同一把蚀斧之后还能再次响应仇隙。
    if(u.side==='enemy'&&u.enemyKit?.id===4032030&&key==='skill02')
      for(const axe of b.units)if(axe.side==='enemy'&&axe.enemyKit?.id===4032030)resource(b,axe,'黑潮蚀斧触发标记',0);
    return a;
  }
  function before(b,u,key,kind,a,selected){
    equipment.before(b,u,key,kind);roster.before(b,u,key,kind,a,selected);
    relics.before(b,u,key,kind,a,selected);
    if(key==='elation')for(const girl of b.units.filter(t=>live(t)&&t.side==='enemy'&&t.enemyKit?.id===5012100))
      magicalGirlTurnSunny(b,girl,'任意单位施放欢愉技');
    if(u.side==='enemy'&&u.enemyKit?.id===300302007&&['skill01','skill02'].includes(key))
      u.resources['甜猿泰山本次盾击目标']=[];
    if(isNoontideGryphon(u)&&key==='skill02')noontideGryphonSummonEagles(b,u);
    if(u.side==='enemy'&&u.enemyKit?.id===300302007&&key==='skill02'&&tag(u,u.enemyKit.chargeTag)){
      u.buffs=u.buffs.filter(e=>e.tag!==u.enemyKit.chargeTag);
      record(b,'mechanic',u,{name:'【酬宾喷泉】蓄力解除',reason:'下一次无限畅饮开始'});
    }
    // Skill06 Phase02：对原目标检查 Shield；失败时写入 BattleScore2_Flag 并按
    // MaxRatio CurrentHP（并列随机）转火给生命比例最高的我方单体，10 段全部改打该目标。
    if(isDirewolf(u)&&key==='skill01'&&selected.length){
      const original=selected[0];
      if(!(original.shields??[]).some(effect=>(effect.value??0)>0)){
        u.resources['齿狼战斗评分标记']=Math.min(1,(u.resources['齿狼战斗评分标记']??0)+1);
        const retarget=direwolfMaxHpRatioTarget(b,u);
        record(b,'mechanic',u,{name:'【砍伐指令】护盾判定失败 · 转火',target:original.id,
          retarget:retarget?.id??null,battleScoreFlag:u.resources['齿狼战斗评分标记'],reason:'ByContainBehaviorFlag Shield'});
        if(retarget&&retarget.id!==original.id){
          selected.length=0;selected.push(retarget);
          if(b.activeAction)b.activeAction.targets=[retarget.id];
        }
      }
    }
    if(u.side==='enemy'&&u.enemyKit?.id===4063010&&kind==='followup'&&['skill05','skill05ToStb'].includes(key)){
      const previous=wingedSerpentLayers(u);
      if(previous>0){setWingedSerpentLayers(b,u,previous-1);record(b,'mechanic',u,{name:'【旋绕】受击反击消耗',previous,layers:previous-1,action:key});}
    }
    if(u.side==='ally'&&key==='skill')for(const boss of b.units.filter(t=>live(t)&&t.enemyKit?.id===2023020&&(t.resources?.['长右元气']??0)>0))
      longRightSetMonitor(b,boss,u,'我方施放战技');
    if(u.enemyKit?.lycanGroup&&key==='moonrageStart')enterLycanRage(b,u.enemyKit.lycanGroup,u);
    if(u.enemyKit?.lycanGroup&&key==='moonrageFinish')finishLycanRage(b,u.enemyKit.lycanGroup,'最后一只狂化狼被击破',{cancelEvent:true});
    if(u.enemyKit?.id===1012030&&key==='skill'&&kind==='normal'){
      buff(b,u,u,'自动机兵·甲虫 · 屏障','marker',0,null,{id:u.id+':mecha-block-damage',tag:'mechaBlockDamage'});
      record(b,'mechanic',u,{name:'不稳定力场 · 屏障生效',blocks:'除持续伤害外的攻击伤害',charges:1});
    }
    if(u.enemyKit?.id===2023020&&(key==='skill01'||key==='skill02'))
      resource(b,u,'长右元气',Math.max(0,(u.resources?.['长右元气']??0)-1));
    if(u.side==='enemy'&&u.enemyKit?.id===8033010&&key==='skill03')
      clearSeniorStaffCharge(b,u,'【企业文化冲击】启动');
    if(is(u,1414)&&kind==='summon'){
      const p=u.kit.params,factor=key==='dragon'&&u.kit.eidolon>=2?u.kit.ranks[2][2]:1;
      const team=allies(b,u),lowest=team.reduce((a,c)=>Math.max(0,...a.shields.map(s=>s.value))<=Math.max(0,...c.shields.map(s=>s.value))?a:c);
      for(const to of team){for(let i=0;i<p.Talent[5];i++)cleanseOne(b,u,to);shield(b,u,to,p.Talent[0],p.Talent[1],{factor});}
      if(trace(u,3))shield(b,u,lowest,trace(u,3)[1],trace(u,3)[2],{factor});
    }
    if(key==='skill'&&is(u,1306)&&u.resources['免费战技'])resource(b,u,'免费战技',0);
    if(is(u,1015)&&key==='ultimate'&&rank(u,2)){for(const to of selected){buff(b,u,to,'Archer E2 · 量子抗性降低','resPen',rank(u,2),u.kit.ranks[2][1],{debuff:true,element:'Quantum',resReduction:true});buff(b,u,to,'Archer E2 · 量子弱点','marker',0,u.kit.ranks[2][1],{weakness:'Quantum'});}}
    if(is(u,1412)&&key==='ultimate'){if(!live(get(b,u.resources['军功目标'])))merit(b,u,allies(b,u)[0]);ceryCharge(b,u,u.kit.params.Ultra[1]);resource(b,u,'附加伤害次数',u.kit.params.Talent[3]);}
    if(is(u,1414)&&key==='ultimate'){
      const summon=b.summons.find(s=>s.owner===u.id&&s.active);if(summon){summon.enhanced=u.kit.params.Ultra[2]+rank(u,2);record(b,'resource',u,{name:'强化龙灵行动',value:summon.enhanced});}
      if(rank(u,1)){sp(b,u,rank(u,1),'腾荒 E1');const to=get(b,u.resources['同袍目标']);if(live(to))buff(b,u,to,'同袍 · 终结技抗穿','resPen',u.kit.ranks[1][1],u.kit.ranks[1][2],{bond:true});}
      if(summon&&rank(u,2)){summon.distance=0;record(b,'advance',u,{name:'龙灵立即行动',ratio:1});}
    }
    for(const c of b.units.filter(c=>live(c)&&is(c,1412)&&c.resources['军功目标']===u.id)){
      if(['basic','skill'].includes(key)){if(!u.coupActive)ceryCharge(b,c,c.kit.params.Talent[0]);if(trace(c,3))energy(b,c,trace(c,3)[0]);}
      if(key==='ultimate'&&trace(c,2)&&!c.resources['终结技充能已触发']&&c.resources['充能']<c.kit.params.BPSkill[2]){resource(b,c,'终结技充能已触发',1);ceryCharge(b,c,trace(c,2)[1]);}
    }
  }
  function copyOwner(b,u,key,kind,a){if(key!=='skill'||kind==='copy'||kind==='technique'||!(a.terms?.length))return null;return b.units.find(c=>live(c)&&is(c,1412)&&c.resources['军功目标']===u.id&&tag(u,'peerage'));}
  function consumeCopy(b,c,u){resource(b,c,'充能',Math.max(0,c.resources['充能']-c.kit.params.BPSkill[3]));
    // 1141523 献予「律法」之诗：奇袭结束后，使刻律德菈获得 1 点充能。
    if(Object.keys(c.resources??{}).some(k=>k.startsWith('Cyrene律法诗篇:')))ceryCharge(b,c,1);
    u.buffs=u.buffs.filter(e=>!(e.source===c.id&&(e.peerage||e.tag==='peerage')));record(b,'mechanic',c,{name:'奇袭结束 · 爵位降为军功',target:u.id});}
  function after(b,u,key,kind,a,selected,hitTargets,bounceTargets){
    jinrenTurnEffect(b,u,key,selected);
    if(u.side==='enemy'&&u.enemyKit?.id===3002010){
      if(key==='skill01')for(const to of selected.filter(target=>target.side!==u.side&&(target.energyMax??0)>0))
        energy(b,to,to.energyMax*(u.enemyKit.surpriseEnergyRatio??.5),true);
      if(key==='skill02')for(const to of b.units.filter(target=>target.side!==u.side&&(target.energyMax??0)>0))
        energy(b,to,-to.energyMax*(u.enemyKit.shockEnergyLossRatio??.2),true);
      if(key==='skill03'){
        resource(b,u,'圆幕先生FlopSide',-1);
        resource(b,u,'圆幕先生AIFlag',0);
        record(b,'mechanic',u,{name:'【频道切换】进入惊吓频道',flopSide:-1,
          sourceDynamicHash:u.enemyKit.flopDynamicHash});
      }
    }
    if(u.side==='enemy'&&u.enemyKit?.id===5012050&&key==='skill01'){
      for(const to of hitTargets.filter(target=>live(target)&&target.side!==u.side)){
        const id=u.id+':assistant-graffiti-wind-shear:'+to.id;
        const previous=to.dots.find(effect=>effect.id===id);
        const layers=Math.min(u.enemyKit.windShearMaxLayers??5,(previous?.stacks??0)+1);
        const applied=dot(b,u,to,{name:'风化',element:'Wind',chance:u.enemyKit.windShearChance??1,
          duration:u.enemyKit.windShearDuration??2,stacks:layers,
          terms:[{scaling:'atk',multiplier:(u.enemyKit.windShearDamagePerLayer??.5)*layers}],
          extra:{id,tag:'assistantGraffitiWindShear',tickAt:'start',snapshotAtk:true}});
        if(applied)record(b,'mechanic',u,{name:'【快！再快点！】施加 / 叠加风化',target:to.id,
          layers,maxLayers:u.enemyKit.windShearMaxLayers??5,duration:u.enemyKit.windShearDuration??2,
          damagePerLayer:u.enemyKit.windShearDamagePerLayer??.5,snapshotAtk:true});
      }
    }
    if(isFireProwler(u))fireProwlerAfter(b,u,key,kind,a,selected);
    if(isFuriaePraetor(u))furiaePraetorAfter(b,u,key,kind,selected);
    if(isFuriaePhilosopher(u))furiaePhilosopherAfter(b,u,key);
    if(isImaginaryWeaver(u))imaginaryWeaverAfter(b,u,key);
    if(isUniverseFireElite(u))universeFireAfter(b,u,key,hitTargets,selected);
    if(isCagePast(u))cagePastAfter(b,u,key,selected);
    if(isDevourerShadow(u))devourerShadowAfter(b,u,key,hitTargets,selected);
    if(isNoontideGryphon(u))noontideGryphonAfter(b,u,key,kind,selected,hitTargets);
    if(isDirewolf(u)){
      // Skill07 Phase02 对 AbilityTargetEntity 施加 Sign_W1_Mecha02（RemoveWhenCasterDead）。
      if(key==='skill02')for(const to of selected.filter(target=>target.side!==u.side&&live(target))){
        buff(b,u,to,'目标锁定','marker',0,null,
          {id:u.id+':direwolf-sign:'+to.id,tag:direwolfSignTag,debuff:true,removeOnSourceDeath:true});
        record(b,'mechanic',u,{name:'【目标锁定】施加',target:to.id,modifier:u.enemyKit.signModifier??'Sign_W1_Mecha02'});
      }
      // Skill06 Phase02 结算后移除本方施加的全部锁定标记。
      if(key==='skill01')direwolfRemoveSign(b,u,'砍伐指令结束后');
      // GlobalModifier RemoveOneMore：OnActionEnd 时 AIFlag=3 或 InsertFlag=1 则移除
      // OneMorePerTurn，否则确保其存在。决定下一回合是否获得追加行动。
      const flag=u.resources?.['齿狼AIFlag']??1,insert=u.resources?.['齿狼插入标记']??0,
        previous=u.resources?.['齿狼OneMorePerTurn']??1,next=flag===3||insert===1?0:1;
      resource(b,u,'齿狼OneMorePerTurn',next);
      // 每回合至多一次追加行动：本次行动是 continuation 时不再授予下一次。
      resource(b,u,'齿狼本回合追加行动',next===1&&kind!=='continuation'?1:0);
      if(previous!==next)
        record(b,'mechanic',u,{name:'RemoveOneMore · 追加行动规则',aIFlag:flag,insertFlag:insert,oneMorePerTurn:next,
          granted:next===1&&kind!=='continuation'});
    }
    if(isMechaFire(u)){
      const attacked=['skill06','skill07','skill02'].includes(key);
      // Burning_CD（Monster_W1_Mecha_Fire_Burning_CD）：OnAfterAttack 移除自身。
      if(attacked&&(u.resources?.['炽燃徘徊者BurningCD']??0)>0){
        resource(b,u,'炽燃徘徊者BurningCD',0);
        record(b,'mechanic',u,{name:'【高温运转·冷却】结束',action:key});
      }
      if(attacked){
        // 被动 Initiate：OnAfterHit 检查 DamageDefenderEntity 是否带 MCommon_DOT_Burn，
        // OnAfterAttack 计数≥1 时给自身叠加一层熔解并清零。必须在本次施加 / 解除灼烧之前判定。
        if(hitTargets.some(to=>to.side!==u.side&&mechaFireHasBurn(to)))mechaFireAddMelt(b,u);
        if(key==='skill02'){
          // 2 段群体攻击后，对每名仍处于灼烧的目标追加 2.0 倍 Pursued 伤害；
          // 1023010 随后移除灼烧（1023011 改为重新施加，当前 actor 未覆盖）。
          const burning=enemies(b,u).filter(to=>mechaFireHasBurn(to));
          for(const to of burning)additional(b,u,to,u.enemyKit.burnExtraRatio??2,'飞舞烬火·灼烧追加');
          let removed=0;
          for(const to of enemies(b,u)){
            const count=to.dots.filter(e=>e.tag===mechaFireBurnTag||e.modifierName==='MCommon_DOT_Burn').length;
            if(!count)continue;
            to.dots=to.dots.filter(e=>!(e.tag===mechaFireBurnTag||e.modifierName==='MCommon_DOT_Burn'));
            removed++;
            record(b,'mechanic',u,{name:'【灼烧】解除',target:to.id,layers:count,reason:'飞舞烬火'});
          }
          if(burning.length)record(b,'mechanic',u,{name:'【飞舞烬火】灼烧追加伤害',targets:burning.map(to=>to.id),removed});
        }
        if(key==='skill06'){
          // Skill06 Phase02：伤害结算后对 AbilityTargetEntity 施加 MCommon_DOT_Burn。
          mechaFireApplyBurn(b,u,selected[0]??hitTargets.find(to=>to.side!==u.side));
        }
      }
      if(key==='skill01')mechaFireApplyBurning(b,u);
    }
    if(u.side==='enemy'&&u.enemyKit?.id===2012010&&key==='skill01'&&kind==='normal')
      illuminationDragonfishDefenseDown(b,u,selected,'宵明');
    if(u.side==='enemy'&&u.enemyKit?.id===2012010&&key==='skill02'&&kind==='extra')
      illuminationDragonfishDefenseDown(b,u,enemies(b,u),'烛花死亡反击',{allTargets:true,baseChance:1});
    if(isPresentInebriated(u)){
      if(['skill01','skill02','skill04'].includes(key)){
        // Skill02 的属性选择按来源是逐目标独立掷骰；300305007 旧版按整次行动共享一次。
        const shared=u.enemyKit.dotPerTargetRoll?null:b.random();
        const applied=[];
        for(const to of selected.filter(target=>live(target)&&target.side!==u.side)){
          const status=key==='skill04'?null
            :((u.enemyKit.dotPerTargetRoll?b.random():shared)<.5?'Wind':'Thunder');
          energy(b,to,a.hitEnergy??0,false);
          if(key==='skill04'){
            applyPresentInebriatedDot(b,u,to,'Wind');
            applyPresentInebriatedDot(b,u,to,'Thunder');
          }else applyPresentInebriatedDot(b,u,to,status);
          applied.push({target:to.id,status:status??'荒宴醉 + 欢宴罪'});
        }
        record(b,'mechanic',u,{name:'宴饮状态施加动作',action:key,
          status:key==='skill04'?'荒宴醉 + 欢宴罪':applied.map(entry=>entry.status).join(' / '),
          targets:applied.map(entry=>entry.target)});
      }
      if(key==='skill05'){
        let resolved=0,unsupported=0;
        for(const to of selected.filter(target=>target.side!==u.side)){
          const current=[...to.dots];
          for(const effect of current){
            if(effect.breakData){unsupported++;continue;}
            const dotSource=get(b,effect.source)??u;
            const terms=Array.isArray(effect.terms)
              ?effect.terms.map(term=>({...term,multiplier:(term.multiplier??0)*u.enemyKit.burstMultiplier,
                flatAdd:(term.flatAdd??0)*u.enemyKit.burstMultiplier}))
              :Number.isFinite(effect.value)?[{scaling:'atk',multiplier:0,
                flatAdd:effect.value*(effect.element==='Physical'?1:(effect.stacks??1))*u.enemyKit.burstMultiplier}]:null;
            if(!terms){unsupported++;continue;}
            damageTo(b,dotSource,to,{...effect,name:'为你洗去一切罪 · '+(effect.name??'持续伤害'),type:'DoT',
              element:effect.element??dotSource.element,terms,toughness:0},1,'primary','dot');
            resolved++;
          }
          energy(b,to,a.hitEnergy??0,false);
          to.dots=[];
          record(b,'cleanse',u,{target:to.id,name:'为你洗去一切罪',dots:current.length});
        }
        record(b,'mechanic',u,{name:'【为你洗去一切罪】引爆并清除持续伤害',resolved,unsupported,
          multiplier:u.enemyKit.burstMultiplier});
      }
    }
    if(u.side==='enemy'&&u.enemyKit?.id===1002030&&key==='skill02'&&live(selected[0])&&selected[0]!==u){
      for(const to of b.units)to.buffs=to.buffs.filter(effect=>!(effect.tag===silvermaneSupportTag&&effect.source===u.id));
      const to=selected[0];buff(b,u,to,'掩护支援','marker',0,null,
        {id:u.id+':silvermane-support:'+to.id,tag:silvermaneSupportTag,removeOnSourceDeath:true});
      record(b,'mechanic',u,{name:'【掩护支援】指定协同目标',target:to.id,skillId:u.enemyKit.skill02Id});
    }
    if(u.side==='enemy'&&u.enemyKit?.id===4062010){
      if(key==='skill02')applyIchorPheasantResonance(b,u);
      if(key==='skill01'&&kind==='normal'&&hitTargets.length){
        const peers=b.units.filter(t=>live(t)&&t.side===u.side&&t!==u&&t.enemyKit?.id===4062010&&tag(t,ichorPheasantResonanceTag));
        const target=hitTargets.find(live)??enemies(b,u)[0];
        if(peers.length&&target){
          for(const peer of peers)useAction(b,peer,'skill01','extra',target.id);
          record(b,'mechanic',u,{name:'【罪血共鸣】协同啄食',target:target.id,attackers:peers.map(peer=>peer.id),effectId:u.enemyKit.resonanceEffectId});
        }
      }
    }
    if(u.side==='enemy'&&kind!=='followup'&&kind!=='extra'&&hitTargets.length){
      const hitTarget=hitTargets.find(target=>target.side!==u.side);
      if(hitTarget)for(const effect of [...u.buffs].filter(item=>item.tag===silvermaneSupportTag)){
        const gunner=get(b,effect.source);if(!live(gunner))continue;
        remove(b,u,effect.id);
        useAction(b,gunner,'skill03','followup',hitTarget.id);
        record(b,'mechanic',gunner,{name:'【掩护支援】协同追加攻击',supportTarget:u.id,target:hitTarget.id,skillId:gunner.enemyKit.skillP01Id});
      }
    }
    if(u.side==='enemy'&&u.enemyKit?.id===5012100&&key==='skill03'){
      const value=u.enemyKit.sunnyCritDmg??.25,duration=u.enemyKit.sunnyCritDuration??2,targetsNow=enemies(b,u);
      for(const to of targetsNow)buff(b,u,to,'初吻❤天气晴 · 暴伤','critDmg',value,duration,
        {id:u.id+':magical-girl-sunny-crit:'+to.id});
      record(b,'mechanic',u,{name:'【初吻❤天气晴】我方全体暴伤提高',value,duration,
        targets:targetsNow.map(to=>to.id)});
    }
    if(u.side==='enemy'&&u.enemyKit?.id===300302007){
      if(['skill01','skill02'].includes(key)){
        const shielded=(u.resources?.['甜猿泰山本次盾击目标']??[]).length>0;
        u.resources['甜猿泰山本次盾击目标']=[];
        if(shielded){
          damageTo(b,u,u,{name:'护盾反噬',type:'Normal',element:'Ice',
            terms:[{scaling:'hp',multiplier:u.enemyKit.backlashMaxHpRatio}],hitEnergy:0,toughness:0},1,'primary','direct');
          const chance=jinrenDebuffChance(b,u,u,Math.min(1,u.enemyKit.backlashChance));
          if(chance>=1||b.random()<chance){
            buff(b,u,u,'护盾反噬 · 防御降低','defShred',u.enemyKit.backlashDefShred,u.enemyKit.backlashDuration,
              {id:u.id+':sweet-gorilla-backlash-def',debuff:true,tickAt:'start'});
            record(b,'mechanic',u,{name:'目标有护盾 · 自身受伤并降低防御',maxHpRatio:u.enemyKit.backlashMaxHpRatio,
              defShred:u.enemyKit.backlashDefShred,duration:u.enemyKit.backlashDuration,chance});
          }else record(b,'resist',u,{name:'抵抗护盾反噬减防',chance});
        }
      }
      if(key==='skill03'){
        const count=spawnSweetGorillaHounds(b,u);
        record(b,'mechanic',u,{name:'【苏乐达派对】召唤气泡锂犬',count,fieldLimit:5});
      }
      if(key==='skill04'){
        buff(b,u,u,'酬宾喷泉 · 韧性保护','marker',0,null,{id:u.id+':sweet-gorilla-charge',tag:u.enemyKit.chargeTag});
        record(b,'mechanic',u,{name:'【酬宾喷泉】进入蓄力并获得韧性保护',nextAction:'无限畅饮'});
      }
    }
    if(u.side==='enemy'&&u.enemyKit?.id===5012120&&key==='skill02')for(const to of selected.filter(live)){
      const chance=jinrenDebuffChance(b,u,to,1);
      if(chance>=1||b.random()<chance){
        buff(b,u,to,'泼脏水 · 防御降低','defShred',u.enemyKit.skill02DefShred,u.enemyKit.skill02Duration,
          {id:u.id+':alloy-nanny-def:'+to.id,debuff:true,tickAt:'start'});
        record(b,'mechanic',u,{name:'【泼脏水】降低防御',target:to.id,defShred:u.enemyKit.skill02DefShred,
          duration:u.enemyKit.skill02Duration,chance});
      }else record(b,'resist',to,{name:'抵抗【泼脏水】减防',source:u.id,chance});
    }
    if(u.side==='enemy'&&u.enemyKit?.id===5014023){
      if(key==='skill03'){
        resource(b,u,'PF帕姆王长效抗菌层数',u.enemyKit.antibacterialLayers);
        buff(b,u,u,'蒸汽洗涤 · 造成伤害提高','dmgBoost',u.enemyKit.steamDamageBoost,null,
          {id:u.id+':pf-pam-steam-damage',tag:'pfPamSteam'});
        buff(b,u,u,'长效抗菌','dmgReduction',u.enemyKit.antibacterialDamageReductionPerLayer*u.enemyKit.antibacterialLayers,null,
          {id:u.id+':pf-pam-antibacterial',tag:'pfPamAntibacterial',stacks:u.enemyKit.antibacterialLayers,
            damageReductionPerLayer:u.enemyKit.antibacterialDamageReductionPerLayer});
        record(b,'mechanic',u,{name:'【蒸汽洗涤】开始',layers:u.enemyKit.antibacterialLayers,
          damageBoost:u.enemyKit.steamDamageBoost,damageReductionPerLayer:u.enemyKit.antibacterialDamageReductionPerLayer,
          totalDamageReduction:u.enemyKit.antibacterialDamageReductionPerLayer*u.enemyKit.antibacterialLayers});
      }
      if(key==='skill05'){
        u.enemyKit.toughnessImmuneTag='pfPamCharge';
        buff(b,u,u,'摩拳擦掌 · 弱点无效','marker',0,null,{id:u.id+':pf-pam-charge',tag:'pfPamCharge'});
        record(b,'mechanic',u,{name:'【值日准备中…】获得弱点无效',nextAction:'饱和式大扫除！'});
      }
      if(key==='skill06'){
        u.buffs=u.buffs.filter(e=>e.tag!=='pfPamCharge');
        record(b,'mechanic',u,{name:'【饱和式大扫除！】解除摩拳擦掌'});
        rockingRebelAddLaughter(b,u,8,'PF 帕姆王 · 饱和式大扫除');
      }
      if(key==='skill02')rockingRebelAddLaughter(b,u,3,'PF 帕姆王 · 无死角洗涤');
      if(key==='skill04'){
        for(const to of selected.filter(live))buff(b,u,to,'劳动最快乐！','marker',0,u.enemyKit.skill04Params[4],
          {id:u.id+':pf-pam-labor:'+to.id,tag:'pfPamLabor',debuff:true,tickAt:'start'});
        rockingRebelAddLaughter(b,u,5,'PF 帕姆王 · 强效肥皂泡');
      }
    }
    if(u.side==='enemy'&&u.enemyKit?.id===5023010&&key==='skill04')for(const to of selected){
      const bliss=to.buffs.find(e=>e.tag===u.enemyKit.blissTag&&e.source===u.id);if(!bliss)continue;
      to.buffs=to.buffs.filter(e=>e!==bliss);
      if(live(to)){
        to.distance+=10000*u.enemyKit.skill04ActionDelay;
        record(b,'delay',to,{ratio:u.enemyKit.skill04ActionDelay,source:u.id,name:'【极乐】· 行动延后'});
        sp(b,u,-u.enemyKit.skill04SpLoss,'【极乐螺旋】消耗战技点');
      }
      record(b,'mechanic',u,{name:'【极乐螺旋】移除【极乐】',target:to.id});
    }
    if(u.side==='enemy'&&[5013040,5013050,5013060,5013070].includes(u.enemyKit?.id)&&key==='skill03'){
      buff(b,u,u,'破晓力场','marker',0,null,{id:u.id+':dawn-corps-force-field',tag:dawnCorpsForceTag});
      resource(b,u,'破晓战队力场受击计数',0);
      record(b,'mechanic',u,{name:'进入【破晓力场】',controlImmune:true,toughnessImmune:true,
        matchingElement:u.enemyKit.element,action:'破晓剑影舞'});
    }
    if(u.side==='enemy'&&[5013040,5013050,5013060,5013070].includes(u.enemyKit?.id)&&key==='skill05'){
      u.buffs=u.buffs.filter(e=>e.tag!==dawnCorpsForceTag);
      resource(b,u,'破晓战队力场受击计数',0);resource(b,u,'破晓战队AIFlag',1);
      buff(b,u,u,'失意 · 受到伤害提高','vuln',u.enemyKit.fieldDamageTakenIncrease,u.enemyKit.fieldDebuffDuration,
        {id:u.id+':dawn-corps-failure-vuln',debuff:true});
      buff(b,u,u,'失意 · 属性抗性降低','resPen',u.enemyKit.fieldElementResReduction,u.enemyKit.fieldDebuffDuration,
        {id:u.id+':dawn-corps-failure-res',debuff:true,element:u.enemyKit.element,resReduction:true});
      record(b,'mechanic',u,{name:'【破晓退散】解除力场并附加失意',vulnerability:u.enemyKit.fieldDamageTakenIncrease,
        element:u.enemyKit.element,resistanceReduction:u.enemyKit.fieldElementResReduction,duration:u.enemyKit.fieldDebuffDuration});
    }
    if(u.side==='enemy'&&u.enemyKit?.id===4053020&&key==='skill03')
      buff(b,u,u,'孵育狂潮','dmgReduction',u.enemyKit.nurseryDamageReduction,null,
        {id:u.id+':cyclonic-mother-incubation',tag:cyclonicMotherIncubationTag,modifierId:240530201});
    if(u.side==='enemy'&&u.enemyKit?.id===4053020&&key==='skill05'){
      u.buffs=u.buffs.filter(e=>e.tag!==cyclonicMotherIncubationTag);
      record(b,'mechanic',u,{name:'【洪潮浪的分娩】来源行动已结算',summonMonsterId:u.enemyKit.broodlingMonsterId,
        summonSimulated:false,omitted:['泡影稚子实体召唤与【风眼巢】效果未接入']});
    }
    if(u.side==='enemy'&&u.enemyKit?.id===2022010&&key==='skill')for(const to of hitTargets.filter(live)){
      const k=u.enemyKit,id=u.id+':mara-soldier-wind-shear:'+to.id;
      const previous=to.dots.find(effect=>effect.id===id),layers=Math.min(k.windShearMaxLayers,(previous?.stacks??0)+k.windShearLayerAdd);
      const applied=dot(b,u,to,{name:'风化',element:'Wind',chance:k.windShearChance,duration:k.windShearDuration,stacks:layers,
        terms:[{scaling:'atk',multiplier:k.windShearDamagePerLayer*layers}],extra:{id,snapshotAtk:true}});
      if(applied)record(b,'mechanic',u,{name:'【风化】施加 / 叠层',target:to.id,layers,maxLayers:k.windShearMaxLayers,
        duration:k.windShearDuration,damagePerLayer:k.windShearDamagePerLayer,snapshotAtk:true});
    }
    if(u.side==='enemy'&&u.enemyKit?.id===202303016){
      if(key==='skill04'){
        u.buffs=u.buffs.filter(e=>e.tag!==ascendedChargeTag);
        buff(b,u,u,'持咒 · 蓄力','marker',0,null,{id:u.id+':ascended-charge',tag:ascendedChargeTag});
        record(b,'mechanic',u,{name:'【玄气咒厌法】进入【持咒】',nextAction:'玄气噬身',
          modifier:'Monster_XP_Elite02_02_ChargeEffect',removedOnBreak:true});
      }
      if(key==='skill05'){
        clearAscendedCharge(b,u,'玄气噬身');
        const applied=[],baseChance=u.enemyKit.dirtyHpChance??1;
        for(const to of selected.filter(live)){
          if(to.side===u.side)continue;
          const probability=jinrenDebuffChance(b,u,to,baseChance);
          if(probability<1&&b.random()>=probability){record(b,'resist',to,{name:'抵抗【噬命】',source:u.id,chance:probability});continue;}
          ascendedSetDirtyHp(b,u,to,u.enemyKit.dirtyHpInitialRatio??.3,u.enemyKit.dirtyHpDuration??2,'玄气噬身');
          applied.push(to.id);
        }
        record(b,'mechanic',u,{name:'【玄气噬身】施加噬命',targets:applied,
          initialRatio:u.enemyKit.dirtyHpInitialRatio??.3,cap:u.enemyKit.dirtyHpCap??.5,
          duration:u.enemyKit.dirtyHpDuration??2,chance:baseChance});
      }
    }
    if(u.side==='enemy'&&u.enemyKit?.id===8033010){
      if(key==='skill02'){
        buff(b,u,u,'培训中… · 蓄力','marker',0,null,{id:u.id+':senior-staff-charge',tag:seniorStaffChargeTag});
        record(b,'mechanic',u,{name:'【培训中…】开始蓄力',removedOnBreak:true,consumedBy:'企业文化冲击'});
      }
      if(key==='skill04'){
        record(b,'mechanic',u,{name:'【720度考核】',companyCoinActors:allies(b,u).filter(t=>t!==u).length,
          note:'当前 PF 阵容没有带 Monster_Company_Coin 的同阵营基层员工；特殊选靶与绩效转移留作明确缺口'});
      }
      if(['skill','skill01','skill02','skill03','skill04','skill06'].includes(key)&&
        !(u.resources?.['资深员工绩效点']??0))
        setSeniorStaffPerformance(b,u,1,'攻击后的公司货币被动');
    }
    if(u.side==='enemy'&&u.enemyKit?.id===3002030&&key==='skill02'){
      const layers=Math.max(1,Math.min(u.enemyKit.tipsinessMax??4,u.resources?.['苏乐达陶醉层数']??0));
      const snapshotHp=combatPanel(u).hp;
      for(const to of hitTargets.filter(live)){
        buff(b,u,to,'泼洒甜蜜 · 速度提高','speedPct',u.enemyKit.skill02SpeedRatio,u.enemyKit.skill02SpeedDuration,
          {id:u.id+':bubble-hound-speed:'+to.id});
        const id=u.id+':bubble-hound-bleed:'+to.id,data={type:'dot',id,key:'裂伤',name:'裂伤',source:u.id,
          remaining:u.enemyKit.skill02BleedDuration,tickOwner:to.id,tickAt:'start',appliedTurn:to.turns,
          element:'Physical',stacks:layers,debuff:true,snapshotAtk:snapshotHp,
          bleedAtkRatio:u.enemyKit.skill02BleedRatio*layers,maxHpCapRatio:u.enemyKit.skill02BleedMaxHpCapRatio};
        to.dots=to.dots.filter(effect=>effect.id!==id);to.dots.push(data);
        record(b,'dot',u,{target:to.id,name:'裂伤',duration:data.remaining,stacks:layers});
        relics.debuff(b,u,to,data);
      }
      record(b,'mechanic',u,{name:'【泼洒甜蜜】死亡插入伤害后施加速度提升与裂伤',targets:hitTargets.filter(live).map(to=>to.id),
        layers,damageMaxHpRatio:u.enemyKit.skill02MaxHpDamageRatio,bleedPerLayer:u.enemyKit.skill02BleedRatio,
        bleedMaxHpCapRatio:u.enemyKit.skill02BleedMaxHpCapRatio});
    }
    if(u.side==='enemy'&&u.enemyKit?.id===4063010){
      if(key==='skill03'){
        setWingedSerpentLayers(b,u,u.enemyKit.chargeLayers);
        resource(b,u,'翼蛇形本回合反击已触发',0);setWingedSerpentOneMore(b,u,false);
        record(b,'mechanic',u,{name:'【蜷曲蓄力】开始',layers:u.enemyKit.chargeLayers,oneMorePerTurn:false});
      }
      if(key==='skill04')clearWingedSerpentCharge(b,u,'罪血涡旋结束（伤害倍率 / 侵蚀仍未完整模拟）');
      if(key==='skill05ToStb'||key==='skill05'&&wingedSerpentLayers(u)<=0)
        clearWingedSerpentCharge(b,u,'最后一层反击完成');
    }
    if(u.side==='enemy'&&u.enemyKit?.id===4053010){
      if(key==='skill02')for(const to of selected.filter(live)){
        const probability=jinrenDebuffChance(b,u,to,u.enemyKit.skill02Chance);
        if(b.random()>=probability){record(b,'resist',to,{name:'抵抗【蜜酿泼洒如星】',source:u.id,chance:probability});continue;}
        buff(b,u,to,'蜜酿泼洒如星 · 防御降低','defShred',u.enemyKit.skill02DefShred,u.enemyKit.skill02Duration,
          {id:u.id+':manta-defense-down:'+to.id,debuff:true,tickAt:'start'});
        allResDown(b,u,to,u.enemyKit.skill02ResReduction,u.enemyKit.skill02Duration,'蜜酿泼洒如星 · 全属性抗性降低');
        record(b,'mechanic',u,{name:'【蜜酿泼洒如星】施加减防 / 全属性抗性降低',target:to.id,chance:probability,
          defShred:u.enemyKit.skill02DefShred,resReduction:u.enemyKit.skill02ResReduction,duration:u.enemyKit.skill02Duration});
      }
      if(key==='skill03'){
        const count=allies(b,u).length<5?spawnWaveLadyServants(b,u):0;
        record(b,'mechanic',u,{name:'【高歌邀客入席】召唤浪花侍女',count,sourceDelayRatio:u.enemyKit.summonDelayRatio,
          omitted:['召唤动作的 0.25 行动延迟尚未对拍','OneMorePerTurn 插入行动']});
      }
      if(key==='skill04')record(b,'mechanic',u,{name:'【聆听海的礼赠】进入准备状态',maxLayer:u.enemyKit.skill04MaxLayer,
        transferRatio:u.enemyKit.skill04TransferRatio,omitted:['共舞的渴望','在毁灭中狂欢','倒计时插入行动','黑潮热 DoT']});
      if(key==='skill05')record(b,'mechanic',u,{name:'【波涛与你相拥】伤害转移缺口',transferRatio:u.enemyKit.skill05TransferRatio,
        omitted:['黑潮热 DoT 与在毁灭中狂欢状态链']});
    }
    if(u.enemyKit?.id===2004014)soulhookSovereignFollowups(b,u,key,selected);
    if(u.enemyKit?.id===5013010){
      if(key==='skill03'){
        resource(b,u,'摇滚狂徒蓄力',1);
        buff(b,u,u,'演出彩排 · 蓄力','marker',0,null,{id:u.id+':rocking-rebel-charge',tag:rockingRebelChargeTag});
        record(b,'mechanic',u,{name:'演出彩排开始蓄力'});
      }
      if(key==='skill04')rockingRebelClearCharge(b,u,'摇滚时刻完成');
      if(key==='skill042'){
        const interrupted=rockingRebelClearCharge(b,u,'阿哈开始行动');
        resource(b,u,'摇滚狂徒AIFlag',2);
        if(interrupted){
          buff(b,u,u,'演出彩排 · 阿哈打断易伤','vuln',u.enemyKit.chargeAhaVulnerability,
            u.enemyKit.chargeAhaVulnerabilityDuration,{id:u.id+':rocking-rebel-aha-vulnerability',tag:'rockingRebelAhaVulnerability',debuff:true});
          const laughter=u.resources?.['摇滚狂徒阿哈打断笑点待结算']??u.enemyKit.chargeAhaLaughter;
          resource(b,u,'摇滚狂徒阿哈打断笑点待结算',0);
          rockingRebelAddLaughter(b,u,laughter,'摇滚狂徒 · 阿哈打断蓄力');
          record(b,'mechanic',u,{name:'阿哈打断演出彩排',damageTaken:u.enemyKit.chargeAhaVulnerability,
            duration:u.enemyKit.chargeAhaVulnerabilityDuration,laughter});
        }
      }
      if(key==='skill05')for(const to of b.units.filter(t=>live(t)&&t.side===u.side&&t!==u))
        buff(b,u,to,'摇滚狂徒 · 速度','speedPct',u.enemyKit.skill05SpeedRatio,u.enemyKit.skill05SpeedDuration,
          {id:u.id+':rocking-rebel-speed:'+to.id,tag:'rockingRebelSpeed'});
      if(key==='skill052'){
        const to=selected.find(live);
        if(to){
          const maxHp=combatPanel(to).hp;
          damageTo(b,u,to,{name:'燥起来吧！·狂奏',type:'Normal',element:'Imaginary',
            terms:[{scaling:'atk',multiplier:0,flatAdd:maxHp*u.enemyKit.skill052DamageMaxHpRatio}],hitEnergy:10,toughness:0},1,'primary','direct');
          const attacker=combatPanel(u),target=combatPanel(to),controlRes=target.controlRes??to.controlRes??0;
          const chance=Math.max(0,Math.min(1,u.enemyKit.skill052DizzyChance*(1+(attacker.effectHit??0))*(1-(target.effectRes??0))*(1-controlRes)));
          if(controlRes>=1||chance<1&&b.random()>=chance)record(b,'resist',to,{name:'抵抗【陶醉】',source:u.id});
          else{
            buff(b,u,to,'陶醉','marker',0,u.enemyKit.skill052DizzyDuration,
              {id:u.id+':rocking-rebel-dizzy:'+to.id,tag:rockingRebelDizzyTag,debuff:true,control:'dizzy',tickAt:'start'});
            to.skipTurns=Math.max(1,to.skipTurns??0);
            record(b,'mechanic',u,{name:'【狂奏】施加陶醉',target:to.id,chance,duration:u.enemyKit.skill052DizzyDuration,skipTurns:1});
          }
        }
        rockingRebelAddLaughter(b,u,u.enemyKit.skill052Laughter,'摇滚狂徒 · 狂奏');
        u.buffs=u.buffs.filter(e=>e.tag!==rockingRebelFrenzyTag);
      }
    }
    if(u.enemyKit?.id===3013010){
      if(key==='skill01'||key==='skill06')fadedRageAddGrowth(b,u,1);
      if(key==='skill04')fadedRageAddGrowth(b,u,3);
      if(key==='skill07')fadedRageSkill07(b,u);
    }
    if(u.enemyKit?.id===8012020){
      if(key==='skill01'){
        const to=selected.find(live);
        if(to){
          buff(b,u,to,'虚无命意 · 锁定目标','vuln',u.enemyKit.markVulnerability,null,
            {id:u.id+':voidranger-target:'+to.id,tag:u.enemyKit.targetSelector??voidrangerTramplerTargetTag,
              modifierName:u.enemyKit.targetSelector??voidrangerTramplerTargetTag,debuff:true,removeOnSourceDeath:true,teamAction:true});
          record(b,'mechanic',u,{name:'【虚无命意】标记目标',target:to.id,vulnerability:u.enemyKit.markVulnerability});
        }
      }else if(key==='skill02'){
        const to=selected[0],own=to?.buffs?.find(e=>(e.tag===u.enemyKit.targetSelector||e.modifierName===u.enemyKit.targetSelector)&&e.source===u.id);
        if(own){remove(b,to,own.id);record(b,'mechanic',u,{name:'【无影虚击】移除自身标记',target:to.id});}
      }
    }
    if(u.enemyKit?.id===8003010){
      if(key==='skill02'){
        const base=u.enemyKit.baseToughness??u.toughnessMax??300;
        u.enemyKit.baseToughness=base;u.toughnessMax=base+u.enemyKit.icepointToughnessAdded;
        if(!u.broken&&Number.isFinite(u.toughness))u.toughness=Math.min(u.toughness+u.enemyKit.icepointToughnessAdded,u.toughnessMax);
        resource(b,u,'外宇宙之冰PhaseFlag',2);resource(b,u,'外宇宙之冰击破标记',1);
        buff(b,u,u,'冰点','marker',0,null,{id:u.id+':icepoint',tag:iceOutOfSpaceIcepointTag});
        record(b,'mechanic',u,{name:'汲取霜晶 · 进入【冰点】',toughnessAdded:u.enemyKit.icepointToughnessAdded});
      }
      if(key==='skill01'&&(u.resources?.['外宇宙之冰PhaseFlag']??1)===2){
        const hitIds=new Set(hitTargets.map(x=>typeof x==='string'?x:x?.id).filter(Boolean));
        const to=selected.find(t=>live(t)&&hitIds.has(t.id)&&[...t.buffs,...t.dots].some(e=>e.control==='freeze'));
        if(to){damageTo(b,u,to,{name:'叹息之寒 · 冻结追加伤害',type:'Normal',element:'Ice',terms:[{scaling:'atk',multiplier:u.enemyKit.skill01FrozenBonusMultiplier}],
          hitEnergy:10,hitEnergyPerHit:true,toughness:0},1,'primary','direct');
          record(b,'mechanic',u,{name:'【冰点】对冻结目标追加伤害',target:to.id,multiplier:u.enemyKit.skill01FrozenBonusMultiplier});}
      }
      if(key==='skill03')for(const to of selected)applyIceOutOfSpaceFreeze(b,u,to,{chance:u.enemyKit.skill03FreezeChance,
        duration:u.enemyKit.skill03FreezeDuration,delayRatio:u.enemyKit.skill03FreezeActionDelay});
    }
    if(u.enemyKit?.id===4022010&&(key==='skill'||key==='skill02')){
      resource(b,u,'流星铁鹰监听技能已触发',1);
      if(key==='skill02'){
        resource(b,u,'流星铁鹰Skill02上次行动值',b.av);
        const to=selected.find(t=>live(t)&&t.id!==u.id);
        if(to&&!hasFastActionModifier(to)){
          buff(b,u,to,'风行','marker',0,null,{id:u.id+':windwalk:'+to.id,tag:meteoricEagleWindwalkTag,modifierName:'MCommon_FastAction'});
          record(b,'mechanic',u,{name:'如流星闪耀 · 施加【风行】',target:to.id,modifier:'MCommon_FastAction'});
        }
      }
    }
    if(u.enemyKit?.id===2023020){
      if(key==='skill04'){
        resource(b,u,'长右元气',u.enemyKit.bulletCount);
        buff(b,u,u,'元气','marker',0,null,{id:u.id+':long-right-bullets',tag:'longRightBullets',stacks:u.enemyKit.bulletCount});
        longRightSetMonitor(b,u,selected[0]??longRightRandomTarget(b,u),'怒啸');
        record(b,'mechanic',u,{name:'怒啸 · 获得元气',count:u.enemyKit.bulletCount});
      }else if(key==='skill03'){
        stacks(b,u,u,'奋威 · 造成伤害提高','dmgBoost',u.enemyKit.damageUpPerLayer,u.enemyKit.damageUpLayers,u.enemyKit.damageUpDuration,
          {id:u.id+':long-right-damage-up',tag:'longRightDamageUp'});
        record(b,'mechanic',u,{name:'奋威 · 增伤叠层',stacks:tag(u,'longRightDamageUp')?.stacks??1});
      }else if(key==='skill02'){
        buff(b,u,u,'弱势','marker',0,null,{id:u.id+':long-right-weak',tag:'longRightWeak'});
      }else if(key==='skill05'){
        u.buffs=u.buffs.filter(e=>e.tag!=='longRightWeak');
      }
      if((u.resources?.['长右元气']??0)<=0){
        u.buffs=u.buffs.filter(e=>e.tag!=='longRightBullets');
        for(const target of b.units)target.buffs=target.buffs.filter(e=>!(e.tag===longRightMonitorTag&&e.source===u.id));
        record(b,'mechanic',u,{name:'元气耗尽 · 解除监视目标'});
      }
    }
    if(u.side==='enemy')for(const boss of b.units.filter(t=>live(t)&&t.enemyKit?.id===2023020))longRightRandomMonitorIfMissing(b,boss,'原监视目标离场');
    if(u.enemyKit?.id===8012030){
      const p=u.enemyKit;
      if(key==='skill01'){
        buff(b,u,u,'超负荷','marker',0,null,{tag:obliteratorOverheatTag});
        const target=selected[0],didHit=target&&hitTargets.some(x=>(typeof x==='string'?x:x?.id)===target.id);
        if(didHit&&live(target)){
          const chance=jinrenDebuffChance(b,u,target,p.markChance);
          if(b.random()<chance){
            const mark=buff(b,u,target,'起爆','marker',0,p.markDuration,{tag:obliteratorMarkTag,debuff:true,tickOwner:target.id,tickAt:'end'});
            Object.assign(mark,{snapshotAtk:combatPanel(u).atk,markMultiplier:p.markMultiplier,attackedActions:0,appliedActionToken:b.activeAction?.sequence});
          }else record(b,'resist',target,{name:'抵抗【起爆】',source:u.id});
        }
      }else if(key==='skill02'){
        const had=u.buffs.some(e=>e.tag===obliteratorOverheatTag);
        u.buffs=u.buffs.filter(e=>e.tag!==obliteratorOverheatTag);
        if(had)record(b,'mechanic',u,{name:'热障阻塞 · 解除【超负荷】'});
      }
    }
    if(u.enemyKit?.id===8012010&&hitTargets.length){const p=u.enemyKit;stacks(b,u,u,'掠夺者 · 速度叠层','speedPct',p.speedPerLayer,p.speedLayers,p.speedDuration,{tickAt:'start'});}
    const actionToken=b.activeAction?.sequence;
    const hitIds=new Set(hitTargets.map(x=>typeof x==='string'?x:x?.id).filter(Boolean));
    for(const target of b.units){
      const mark=tag(target,obliteratorMarkTag);
      if(!mark||!hitIds.has(target.id)||mark.appliedActionToken===actionToken)continue;
      mark.attackedActions=(mark.attackedActions??0)+1;
      const source=get(b,mark.source)??u;
      record(b,'mechanic',source,{name:'【起爆】受击计数',target:target.id,count:mark.attackedActions,limit:source.enemyKit?.markAttackCount??4});
      if(mark.attackedActions>=(source.enemyKit?.markAttackCount??4)){target.buffs=target.buffs.filter(e=>e!==mark);record(b,'mechanic',source,{name:'【起爆】计数耗尽',target:target.id});}
    }
    if(actionToken!=null)for(const hit of hitTargets){
      const target=typeof hit==='string'?get(b,hit):hit,barrier=target?.buffs.find(e=>e.tag==='mechaBlockDamage'&&e.blockingAction===actionToken);
      if(barrier){target.buffs=target.buffs.filter(e=>e!==barrier);record(b,'mechanic',u,{name:'自动机兵·甲虫 · 屏障受到攻击后解除',target:target.id});}
    }
    if(is(u,1306)){
      const p=u.kit.params;
      if(key==='basic'&&trace(u,1))energy(b,u,trace(u,1)[0]);
      if(key==='skill'){
        const to=selected[0],ratio=p.BPSkill[0]+rank(u,6),value=combatPanel(u,{excludeConverted:true}).critDmg*ratio+p.BPSkill[1];
        const extra={tag:'sparkleSkill',converted:true};
        if(!u.kit.enhanced&&trace(u,2))Object.assign(extra,{tickAt:'start',countApplyTurn:true});
        const duration=!u.kit.enhanced&&trace(u,2)?2:p.BPSkill[2];
        const recipients=u.kit.eidolon>=6?allies(b,u).filter(t=>t===to||t!==u&&tag(t,'cipher')):[to];
        for(const t of recipients){buff(b,u,t,'梦游鱼','critDmg',value,duration,extra);if(u.kit.enhanced&&trace(u,3))buff(b,u,t,'梦游鱼 · 抗穿','resPen',trace(u,3)[1],duration,{...extra,tag:'sparklePen'});}
        if(to!==u)advance(b,to.id,p.BPSkill[3]);
        if(u.kit.enhanced&&rank(u,1,1))buff(b,u,u,'花火 E1 · 速度','speedPct',rank(u,1,1),u.kit.ranks[1][2]);
      }
      if(key==='ultimate'){
        sp(b,u,p.Ultra[1]+(u.kit.eidolon>=4?1:0),'一人千役',{bank:true});
        for(const to of allies(b,u)){const duration=p.Ultra[3]+(u.kit.eidolon>=1?1:0);buff(b,u,to,'谜诡','marker',0,duration,{tag:'cipher'});if(rank(u,1))buff(b,u,to,'谜诡 · 攻击','atkPct',rank(u,1),duration);}
        if(u.kit.eidolon>=6){const old=b.units.flatMap(t=>t.buffs).find(e=>e.source===u.id&&e.tag==='sparkleSkill');if(old)for(const to of allies(b,u).filter(t=>t!==u)){buff(b,u,to,'梦游鱼','critDmg',old.value,old.remaining,{tag:'sparkleSkill',converted:true,tickAt:old.tickAt,countApplyTurn:old.countApplyTurn});if(u.kit.enhanced&&trace(u,3))buff(b,u,to,'梦游鱼 · 抗穿','resPen',trace(u,3)[1],old.remaining,{tag:'sparklePen',tickAt:old.tickAt,countApplyTurn:old.countApplyTurn});}}
      }
    }
    if(is(u,1015)){
      if(key==='skill'){resource(b,u,'连续战技次数',(u.resources['连续战技次数']??0)+(kind==='copy'?0:1));resource(b,u,'战技施放次数',(u.resources['战技施放次数']??0)+1);
        stacks(b,u,u,'回路连接','dmgBoost',u.kit.params.BPSkill[1],u.kit.params.BPSkill[2]+rank(u,6),null,{abilityType:'BPSkill',tag:'circuit'});
        if(rank(u,1)&&u.resources['战技施放次数']===u.kit.ranks[1][0])sp(b,u,u.kit.ranks[1][1],'Archer E1');
      }
      if(key==='ultimate')resource(b,u,'充能',Math.min(u.kit.params.Ultra[2],(u.resources['充能']??0)+u.kit.params.Ultra[1]));
    }
    if(is(u,1412)&&key==='skill'){
      const to=selected[0];merit(b,u,to);ceryCharge(b,u,u.kit.params.BPSkill[1]);
      if(trace(u,3))for(const t of new Set([u,to]))buff(b,u,t,'征服者 · 速度','speed',trace(u,3)[1],trace(u,3)[2]);
      if(rank(u,1,2))energy(b,to,rank(u,1,2));
    }
    if(is(u,1414)){
      const p=u.kit.params;
      if(key==='skill'){bond(b,u,selected[0]);for(const to of allies(b,u))shield(b,u,to,p.BPSkill[0],p.BPSkill[1]);}
      if(key==='ultimate'){for(const to of allies(b,u))shield(b,u,to,p.Ultra[3],p.Ultra[4]);const mate=get(b,u.resources['同袍目标']);if(live(mate)&&rank(u,6,1))for(const to of enemies(b,u))additional(b,mate,to,rank(u,6,1),'同袍 · E6 附加伤害');}
      if(key==='dragon'&&kind==='summon'){
        const s=b.summons.find(s=>s.owner===u.id&&s.active),mate=get(b,s?.bondmate),n=u.kit.eidolon>=2?u.kit.ranks[2][1]:1;
        if(live(mate)){for(const to of enemies(b,u))additional(b,mate,to,p.Ultra[7]*n,'龙灵 · 同袍附加伤害');const enemy=enemies(b,u).sort((a,c)=>c.hp-a.hp||a.order-c.order)[0];if(enemy&&trace(u,3))additional(b,mate,enemy,trace(u,3)[0]*n,'峥嵘 · 附加伤害');}
        if(s){s.enhanced--;record(b,'resource',u,{name:'强化龙灵行动',value:s.enhanced});}
      }
    }
    equipmentAfter(b,u,key,kind,a,selected,hitTargets);
    if(hitTargets.length){
      for(const c of b.units.filter(c=>live(c)&&is(c,1412)&&c.resources['军功目标']===u.id&&c.resources['附加伤害次数']>0)){
        const pool=hitTargets.filter(live);if(pool.length){resource(b,c,'附加伤害次数',c.resources['附加伤害次数']-1);additional(b,c,pool[Math.floor(b.random()*pool.length)],c.kit.params.Talent[2]+rank(c,6,1),'军功 · 附加伤害');}
      }
      for(const d of b.units.filter(d=>live(d)&&is(d,1414)&&d.resources['同袍目标']===u.id&&trace(d,2))){energy(b,d,trace(d,2)[1]);const s=b.summons.find(s=>s.owner===d.id&&s.active);if(s){s.distance=Math.max(0,s.distance-10000*trace(d,2)[2]);record(b,'advance',d,{name:'龙灵行动提前',target:s.id,ratio:trace(d,2)[2]});}}
      for(const ar of b.units.filter(ar=>live(ar)&&ar!==u&&ar.side===u.side&&is(ar,1015)&&ar.resources['充能']>0)){
        let to=selected[0];if(!live(to)){const pool=enemies(b,ar);to=pool[Math.floor(b.random()*pool.length)];}if(to){resource(b,ar,'充能',ar.resources['充能']-1);b.queue.push({actor:ar.id,key:'followup',kind:'followup',targetId:to.id});}
      }
    }
    roster.after(b,u,key,kind,a,selected,hitTargets,bounceTargets);
    lycanAfterAttack(b,u,a,hitTargets);
    if(u.enemyKit?.id===2033010&&key==='skill04')for(const to of hitTargets.filter(live))applyLycanFearPre(b,u,to);
    promotions(b);
  }
  const lycanBloodTag=group=>'lycanBlood:'+group,lycanMarkTag=group=>'lycanMoonrageMark:'+group,lycanRageTag=group=>'lycanMoonrage:'+group,
    lycanFearPreTag=sourceId=>'lycanFearPre:'+sourceId,lycanFearTag=sourceId=>'lycanFear:'+sourceId;
  function lycanWolves(b,group){return b.units.filter(x=>live(x)&&x.side==='enemy'&&x.enemyKit?.lycanGroup===group);}
  function lycanState(b,group,threshold=6){
    b.enemyMechanics??={};b.enemyMechanics.lycanGroups??={};
    return b.enemyMechanics.lycanGroups[group]??(b.enemyMechanics.lycanGroups[group]={group,count:0,threshold,rageActive:false,triggerPending:false,eventOwner:null});
  }
  function removeLycanTag(b,u,tagName,reason){
    const removed=u.buffs.filter(e=>e.tag===tagName);if(!removed.length)return 0;
    u.buffs=u.buffs.filter(e=>e.tag!==tagName);
    for(const e of removed)record(b,'mechanic',u,{name:reason,target:u.id,effect:e.name});
    return removed.length;
  }
  function applyLycanFearPre(b,source,to){
    if(!live(to)||to.buffs.some(e=>e.tag===lycanFearPreTag(source.id)||e.tag===lycanFearTag(source.id)))return false;
    const chance=jinrenDebuffChance(b,source,to,1);
    if(b.random()>=chance){record(b,'resist',to,{name:'抵抗【恐惧萦绕】',source:source.id});return false;}
    buff(b,source,to,'恐惧萦绕','marker',0,null,{tag:lycanFearPreTag(source.id),debuff:true,removeOnSourceDeath:true});
    record(b,'mechanic',source,{name:'施加【恐惧萦绕】',target:to.id,chance});return true;
  }
  function resolveLycanFearPre(b,u){
    if(u.side!=='ally')return;
    const pending=u.buffs.filter(e=>typeof e.tag==='string'&&e.tag.startsWith('lycanFearPre:'));
    const fear=pending.find(e=>live(get(b,e.source)));
    if(!fear){for(const e of pending)removeLycanTag(b,u,e.tag,'施加者退场，解除【恐惧萦绕】');return;}
    for(const e of pending)removeLycanTag(b,u,e.tag,'【恐惧萦绕】到期');
    const source=get(b,fear.source);
    buff(b,source,u,'恐惧','marker',0,1,{tag:lycanFearTag(source.id),debuff:true,control:'fear',tickAt:'start'});
    u.skipTurns=Math.max(1,u.skipTurns??0);
    record(b,'mechanic',source,{name:'【恐惧萦绕】转为【恐惧】并跳过行动',target:u.id});
  }
  function setLycanBlood(b,source,group,count){
    for(const wolf of lycanWolves(b,group)){
      const tagName=lycanBloodTag(group);
      if(count<=0)removeLycanTag(b,wolf,tagName,'嗜血进度清除');
      else buff(b,source,wolf,'嗜血','marker',0,null,{id:group+':blood:'+wolf.id,tag:tagName,stacks:count});
    }
  }
  function finishLycanRage(b,group,reason,{cancelEvent=true}={}){
    const state=b.enemyMechanics?.lycanGroups?.[group];if(!state||!state.rageActive&&!state.triggerPending)return;
    const host=get(b,state.eventOwner)??lycanWolves(b,group)[0]??null;
    for(const wolf of b.units.filter(x=>x.side==='enemy'&&x.enemyKit?.lycanGroup===group)){
      removeLycanTag(b,wolf,lycanBloodTag(group),'嗜血进度清除');
      removeLycanTag(b,wolf,lycanMarkTag(group),'月狂标记移除');
      removeLycanTag(b,wolf,lycanRageTag(group),'月狂状态移除');
    }
    state.rageActive=false;state.triggerPending=false;state.count=0;
    for(const wolf of b.units.filter(x=>x.enemyKit?.id===2033010&&x.enemyKit?.lycanGroup===group))wolf.resources['咆哮灵柩AIFlag']=1;
    if(cancelEvent&&state.eventOwner)api.cancelActionEvents(b,state.eventOwner,'lycan-moonrage:'+group);
    state.eventOwner=null;
    record(b,'mechanic',host,{name:'狼群【月狂】结束',reason,countdown:!cancelEvent});
  }
  function enterLycanRage(b,group,source){
    const state=lycanState(b,group),wolves=lycanWolves(b,group);
    if(state.rageActive||!state.triggerPending||!wolves.length)return;
    state.rageActive=true;state.triggerPending=false;state.count=0;
    setLycanBlood(b,source,group,0);
    for(const wolf of wolves){
      buff(b,source,wolf,'月狂标记','marker',0,null,{id:group+':rage-mark:'+wolf.id,tag:lycanMarkTag(group)});
      buff(b,source,wolf,'月狂 · 速度','speedPct',wolf.enemyKit.rageSpeedRatio,null,{id:group+':rage-speed:'+wolf.id,tag:lycanRageTag(group)});
      if(wolf.enemyKit.id===2033010)wolf.resources['咆哮灵柩AIFlag']=4;
    }
    const host=wolves.find(x=>x.id===source.id)??wolves[0];state.eventOwner=host.id;state.rageCycles=(state.rageCycles??0)+1;
    const eventGroup='lycan-moonrage:'+group;
    api.scheduleActionEvents(b,host.id,[{id:group+':rage-countdown:'+state.rageCycles,name:'月狂倒计时',key:'moonrageCountdown',speed:host.enemyKit.rageCountdownSpeed,
      distance:10000,ignoreFrozen:true,noWaveReset:true}],{group:eventGroup,suspendNormalGauge:false});
    record(b,'mechanic',host,{name:'狼群进入【月狂】',threshold:state.threshold,targets:wolves.map(x=>x.id),countdownSpeed:host.enemyKit.rageCountdownSpeed});
  }
  function lycanAfterAttack(b,actor,action,hitTargets){
    // The source controller listens to OnListenAfterAttack, not to arbitrary
    // extra actions. Count completed attack actions even if their target does
    // not take HP damage (for example, a shield absorbs the hit).
    if(actor.side!=='enemy'||!action?.terms?.some(t=>(t.multiplier??0)!==0||(t.flatAdd??0)!==0))return;
    const groups=[...new Set(b.units.filter(x=>live(x)&&x.side==='enemy'&&x.enemyKit?.lycanGroup).map(x=>x.enemyKit.lycanGroup))];
    for(const group of groups){
      const wolves=lycanWolves(b,group);if(!wolves.length)continue;
      const state=lycanState(b,group,wolves[0].enemyKit.rageThreshold);
      if(state.rageActive||state.triggerPending)continue;
      state.count=Math.min(state.threshold,state.count+1);setLycanBlood(b,actor,group,state.count);
      record(b,'mechanic',actor,{name:'狼群【嗜血】增加',count:state.count,max:state.threshold,group});
      if(state.count>=state.threshold){
        state.count=0;state.triggerPending=true;setLycanBlood(b,actor,group,0);
        const ordered=[...wolves].reverse();
        for(const target of ordered)b.queue.unshift({actor:target.id,key:'moonrageStart',kind:'extra'});
        if(ordered.length)record(b,'mechanic',actor,{name:'插入狼群【月狂】转换行动',targets:ordered.map(x=>x.id),priority:'MonsterChangeState'});
      }
    }
    for(const wolf of b.units.filter(x=>live(x)&&x.side==='enemy'&&x.enemyKit?.lycanGroup&&tag(x,lycanRageTag(x.enemyKit.lycanGroup)))){
      const state=b.enemyMechanics?.lycanGroups?.[wolf.enemyKit.lycanGroup];
      if(state?.rageActive&&actor.enemyKit?.lycanGroup===wolf.enemyKit.lycanGroup&&wolf===actor){
        if(wolf.enemyKit.rageHealRatio>0){
          heal(b,wolf,wolf,combatPanel(wolf).hp*wolf.enemyKit.rageHealRatio);
          record(b,'mechanic',wolf,{name:'【月狂】攻击后回复生命',ratio:wolf.enemyKit.rageHealRatio});
        }
        if(wolf.enemyKit.rageDotChance>0)for(const to of hitTargets.filter(live))dot(b,wolf,to,{name:'月狂 · 裂伤',element:'Physical',chance:wolf.enemyKit.rageDotChance,duration:wolf.enemyKit.rageDotDuration,
          value:Math.min(combatPanel(wolf).atk*wolf.enemyKit.rageDotAtkRatio,combatPanel(to).hp*wolf.enemyKit.rageDotMaxHpPercent/100),
          extra:{id:wolf.id+':lycan-tear:'+to.id,snapshotAtk:true,bleedAtkRatio:wolf.enemyKit.rageDotAtkRatio,maxHpCapRatio:wolf.enemyKit.rageDotMaxHpPercent/100}});
      }
    }
  }
  function actionEventStart(b,u,e){
    if(e.group?.startsWith('lycan-moonrage:'))finishLycanRage(b,e.group.slice('lycan-moonrage:'.length),'倒计时行动开始',{cancelEvent:false});
    return roster.actionEventStart(b,u,e);
  }
  function unitCreated(b,u){
    roster.unitCreated(b,u);
    if(u?.side==='enemy'){
      if(isPresentInebriated(u)){u.resources??={};u.resources['醉于盛会AIFlag']??=1;}
      initializeMaraSoldier(b,u);
      if(u.enemyKit?.id===3013010){
        u.resources??={};u.resources['狂怒褪去之壳AIFlag']??=1;u.resources['无明火层数']??=0;
        buff(b,u,u,'癔症身壳 · 超级护甲','dmgReduction',u.enemyKit.superArmorDamageReduction,null,
          {id:u.id+':faded-rage-super-armor',tag:'fadedRageSuperArmor'});
      }
      if(u.enemyKit?.id===4022010){u.resources??={};u.resources['流星铁鹰监听技能已触发']??=0;
        if(!tag(u,'meteoricEagleStatus'))buff(b,u,u,'流星铁鹰 · 被动监听','marker',0,null,{id:u.id+':meteoric-eagle-status',tag:'meteoricEagleStatus'});}
      if(u.enemyKit?.id===8003010){u.resources??={};u.resources['外宇宙之冰AIFlag']??=1;u.resources['外宇宙之冰PhaseFlag']??=1;
        u.resources['外宇宙之冰本回合追加行动']??=0;u.enemyKit.baseToughness??=u.toughnessMax;}
      if(u.enemyKit?.id===5013010){u.resources??={};u.resources['摇滚狂徒AIFlag']??=1;u.resources['摇滚狂徒蓄力']??=0;}
      if(u.enemyKit?.id===202303016){u.resources??={};u.resources['承露天人AIFlag']??=1;
        u.resources['承露天人特殊标记']??=0;u.resources['承露天人本回合追加行动']??=0;
        if(!tag(u,ascendedOneMorePerTurnTag))buff(b,u,u,'每回合额外行动','marker',0,null,
          {id:u.id+':ascended-one-more-per-turn',tag:ascendedOneMorePerTurnTag});}
      if(isFireProwler(u))fireProwlerInitialize(b,u);
      if(isFireProwlerVessel(u)){u.resources??={};u.resources['容器入场生命消耗']??=0;}
      if(u.enemyKit?.id===4032030)blackTideAxeInitialize(b,u);
      if(isFuriaePraetor(u))furiaePraetorInitialize(b,u);
      if(isFuriaePhilosopher(u))furiaePhilosopherInitialize(b,u);
      if(isImaginaryWeaver(u))imaginaryWeaverInitialize(b,u);
      if(isUniverseFireElite(u))universeFireInitialize(b,u);
      if(isDevourerShadow(u))devourerShadowInitialize(b,u);
      if(isNoontideGryphon(u))noontideGryphonInitialize(b,u);
      if(isDirewolf(u))direwolfInitialize(b,u);
      if(isMechaFire(u))mechaFireInitialize(b,u);
      if(u.enemyKit?.id===2004014){u.resources??={};u.resources['支配者AIFlag']??=1;}
      initializeMagicalGirlTroupe(b,u);
      initializePfPamFantasticStory(b,u);
      if(b.units.some(t=>live(t)&&t.enemyKit?.id===4022010))syncMeteoricEagleMark(b,'敌人入场');
    }
    const group=u?.enemyKit?.lycanGroup;if(!group||u.side!=='enemy')return;
    const state=lycanState(b,group,u.enemyKit.rageThreshold);
    if(u.enemyKit.id===2033010){u.resources['咆哮灵柩AIFlag']??=1;state.threshold=6;}
    if(state.rageActive){
      buff(b,u,u,'月狂标记','marker',0,null,{id:group+':rage-mark:'+u.id,tag:lycanMarkTag(group)});
      buff(b,u,u,'月狂 · 速度','speedPct',u.enemyKit.rageSpeedRatio,null,{id:group+':rage-speed:'+u.id,tag:lycanRageTag(group)});
    }else if(state.count>0)buff(b,u,u,'嗜血','marker',0,null,{id:group+':blood:'+u.id,tag:lycanBloodTag(group),stacks:state.count});
  }
  function weaknessBreak(b,from,to,action,element){
    roster.weaknessBreak(b,from,to,action,element);
    if(isFireProwler(to)&&tag(to,fireProwlerChargeTag))fireProwlerChargeBreak(b,to);
    if(isNoontideGryphon(to))noontideGryphonBreak(b,to);
    // 击破时移除【后手】（XP_Minion02_00_Attack 的 OnBreak 分支）。
    if(isImaginaryWeaver(to))imaginaryWeaverClearAttack(b,to,'弱点击破');
    if(isUniverseFireElite(to))universeFireBreak(b,to);
    if(isCagePast(to))cagePastBreak(b,to);
    if(isDevourerShadow(to))devourerShadowBreak(b,to);
    if(to?.enemyKit?.id===300305007){
      const previous=to.resources?.['醉于盛会AIFlag']??1,next=previous<=3?1:3;
      resource(b,to,'醉于盛会AIFlag',next);
      record(b,'mechanic',to,{name:'弱点击破 · 重置宴饮 AI',previous,next});
    }
    if(to?.enemyKit?.id===3003050){
      // Monster_W3_Figure_01_Passive.OnBeingBreak：清除武器特效、全体 DotMark 与 listener，并把 AIFlag 置 7。
      const previous=to.resources?.['醉于盛会AIFlag']??1,next=to.enemyKit.breakAiFlag??7;
      resource(b,to,'醉于盛会AIFlag',next);
      record(b,'mechanic',to,{name:'弱点击破 · 「醉于盛会的此刻」进入 7 号分支',previous,next,
        modifier:'Monster_W3_Figure_01_Passive'});
    }
    if(to?.enemyKit?.id===3003040){
      resource(b,to,'同音共律AIFlag',1);
      record(b,'mechanic',to,{name:'弱点击破 · 中断蓄力并重置 AI 轮转'});
    }
    if(to?.enemyKit?.id===4063010&&wingedSerpentLayers(to)>0){
      clearWingedSerpentCharge(b,to,'弱点击破解除蓄力');
      record(b,'mechanic',to,{name:'弱点击破 · 打断【蜷曲蓄力】'});
    }
    if(to?.enemyKit?.id===5013010){
      rockingRebelClearCharge(b,to,'弱点击破');
      resource(b,to,'摇滚狂徒AIFlag',2);
      record(b,'mechanic',to,{name:'摇滚狂徒弱点击破 · 结束彩排'});
    }
    if(to?.enemyKit?.id===3013010){
      to.buffs=to.buffs.filter(e=>e.tag!=='fadedRageSuperArmor'&&e.tag!=='fadedRageSuperArmorBreak');
      buff(b,from??to,to,'癔症身壳 · 弱点击破','vuln',to.enemyKit.superArmorBreakDamageTaken,null,
        {id:to.id+':faded-rage-super-armor-break',tag:'fadedRageSuperArmorBreak',debuff:true});
      resource(b,to,'狂怒褪去之壳AIFlag',1);resource(b,to,'无明火层数',0);
      delay(b,to.id,to.enemyKit.superArmorBreakDelay);
      record(b,'mechanic',to,{name:'癔症身壳 · 弱点击破',removed:'超级护甲',damageTaken:to.enemyKit.superArmorBreakDamageTaken,
        extraDelay:to.enemyKit.superArmorBreakDelay,resetAI:true,resetGrowth:true});
    }
    if(to?.enemyKit?.id===8003010){
      const hadIcepoint=!!tag(to,iceOutOfSpaceIcepointTag),base=to.enemyKit.baseToughness??to.toughnessMax;
      resource(b,to,'外宇宙之冰AIFlag',1);
      if(hadIcepoint){
        to.buffs=to.buffs.filter(e=>e.tag!==iceOutOfSpaceIcepointTag);
        to.toughnessMax=base;resource(b,to,'外宇宙之冰PhaseFlag',1);resource(b,to,'外宇宙之冰击破标记',0);
        record(b,'mechanic',to,{name:'弱点击破 · 解除【冰点】',toughnessRestored:base});
      }else record(b,'mechanic',to,{name:'弱点击破 · 重置外宇宙之冰 AI'});
      resource(b,to,'外宇宙之冰击破结束待恢复',1);
    }
    if(to?.side==='enemy'&&tag(to,meteoricEagleWindwalkTag)){
      to.buffs=to.buffs.filter(e=>e.tag!==meteoricEagleWindwalkTag);
      to.resources['风行立即行动待触发']=0;
      record(b,'mechanic',to,{name:'弱点击破 · 解除【风行】'});
    }
    if(to?.enemyKit?.id===2023020&&(to.resources?.['长右AIFlag']??0)===8){
      resource(b,to,'长右AIFlag',1);
      record(b,'mechanic',to,{name:'弱点击破 · 重置长右 AI 循环',from:8,to:1});
    }
    if(to?.side==='enemy'&&to.enemyKit?.id===8033010){
      const previous=to.resources?.['资深员工AIFlag']??1,next=previous<=5?9:10;
      resource(b,to,'资深员工AIFlag',next);resource(b,to,'资深员工本回合追加行动',0);
      clearSeniorStaffCharge(b,to,'弱点击破');
      record(b,'mechanic',to,{name:'弱点击破 · 重置资深员工组长 AI',from:previous,to:next});
    }
    if(to?.side==='enemy'&&to.enemyKit?.id===202303016){
      const previous=to.resources?.['承露天人AIFlag']??1,previousSpecial=to.resources?.['承露天人特殊标记']??0;
      // Passive01：仅当 AIFlag=5 时回到 4；PhaseControl 再按 SpecialFlag 1 → 2。
      if(previous===5)resource(b,to,'承露天人AIFlag',4);
      if(previousSpecial===1)resource(b,to,'承露天人特殊标记',2);
      resource(b,to,'承露天人本回合追加行动',0);
      clearAscendedCharge(b,to,'弱点击破');
      record(b,'mechanic',to,{name:'弱点击破 · 重置承露天人 AI',from:previous,
        to:previous===5?4:previous,specialFrom:previousSpecial,specialTo:previousSpecial===1?2:previousSpecial});
    }
    if(isDirewolf(to)){
      // InsertControl：OnBeingBreak 清空 InsertFlag；OnEndBreak 在存在锁定标记时
      // 只给施放者添加动画用的 ChainSawSpeedUpAgain / ChainSawSpeedUp（不改变行动与伤害）。
      const signed=enemies(b,to).some(target=>target.buffs.some(e=>e.tag===direwolfSignTag&&e.source===to.id));
      resource(b,to,'齿狼插入标记',0);
      record(b,'mechanic',to,{name:'弱点击破 · 清除插入标记',hadSign:signed,
        animationOnly:signed?'恢复时添加 ChainSawSpeedUp（SetEffectAnimSpeed）':'无锁定标记，恢复时不添加'});
    }
    if(isMechaFire(to)){
      // Burning / Passive 都在 OnBeingBreak 时 RemoveSelfModifier；Burning 被移除后
      // OnDestroy 写入 Burning_CD。AICounter 只有 1023011 变体才在击破时重置为 1。
      const hadBurning=mechaFireClearBurning(b,to,'弱点击破'),hadMelt=mechaFireClearMelt(b,to,'弱点击破');
      record(b,'mechanic',to,{name:'弱点击破 · 炽燃徘徊者状态解除',burning:hadBurning,melt:hadMelt,
        aiCounter:to.resources?.['炽燃徘徊者AICounter']??1,resetAiCounter:false});
    }
    const group=to?.enemyKit?.lycanGroup;if(!group)return;
    const state=b.enemyMechanics?.lycanGroups?.[group];if(!state?.rageActive)return;
    removeLycanTag(b,to,lycanMarkTag(group),'弱点击破移除月狂标记');
    removeLycanTag(b,to,lycanRageTag(group),'弱点击破移除月狂状态');
    if(!lycanWolves(b,group).some(x=>tag(x,lycanMarkTag(group)))){
      b.queue.unshift({actor:to.id,key:'moonrageFinish',kind:'extra'});
      record(b,'mechanic',to,{name:'最后一只狂化狼被击破，插入【月狂】结束行动'});
    }
  }
  function hpBarTransition(b,from,to,previousPhase,nextPhase){
    if(isFireProwler(to)&&!to.enemyKit?.fantasticStory){
      fireProwlerPhaseChange(b,to,previousPhase,nextPhase);
      return;
    }
    if(to?.enemyKit?.id===2004014){
      resource(b,to,'支配者AIFlag',1);
      record(b,'mechanic',to,{name:'支配者阶段切换',fromPhase:previousPhase,toPhase:nextPhase,
        omitted:['召唤物清场与重召','第二阶段助战 / 心理暗示流程']});
      return;
    }
    if(to?.enemyKit?.id===4064012){
      resource(b,to,'裁定者AIFlag',1);
      record(b,'mechanic',to,{name:'裁定者进入第二血条',fromPhase:previousPhase,toPhase:nextPhase,
        omitted:['五只金血忆灵分裂 / 合体','第二阶段共享生命与规模效应']});
    }
  }
  function death(b,from,to){
    // OnBeforeDying：虚数织叶者濒死时移除【后手】（XP_Minion02_00_Attack）。
    if(isImaginaryWeaver(to))imaginaryWeaverClearAttack(b,to,'自身阵亡');
    roster.death(b,from,to);
    // AimTarget.OnDestroy（非施法者死亡）：锁定人数 −1；归零时重新随机锁定 1 名，否则施法者 +1 层蓄力。
    if(to?.side==='ally'){
      const source=b.units.find(unit=>unit.side==='enemy'&&isCagePast(unit)&&live(unit)&&
        to.buffs.some(effect=>effect.tag===cagePastAimTag&&effect.source===unit.id));
      if(source){
        const count=Math.max(0,cagePastAimCount(source)-1);
        resource(b,source,'身陷樊笼锁定人数',count);
        const pool=enemies(b,source).filter(unit=>live(unit)&&!unit.buffs.some(effect=>effect.tag===cagePastAimTag&&effect.source===source.id));
        if(count===0&&pool.length)cagePastMark(b,source,pool[Math.floor(b.random()*pool.length)],'锁定目标阵亡 · 重新锁定');
        else if(count>0&&cagePastLayers(source)>0){
          const effect=source.buffs.find(candidate=>candidate.tag===cagePastAimingTag);
          if(effect)effect.stacks=Math.min(source.enemyKit?.maxAimTargets??4,(effect.stacks??0)+1);
        }
        record(b,'mechanic',source,{name:'锁定目标阵亡 · 标记转移',target:to.id,count});
      }
    }
    if(to?.side==='ally')noontideGryphonAllyDeath(b,to);
    if(to?.side==='enemy')noontideGryphonEnemyDeath(b,from,to);
    if(isNoontideGryphon(to)){
      // MMonster_W4_Griffin_00_Status OnBeforeDying：移除施放者施加的 SignOnAvatar。
      let cleared=0;
      for(const t of b.units)if(t.side!==to.side){const before=t.buffs.length;
        t.buffs=t.buffs.filter(e=>e.tag!==noontideGryphonSignTag);cleared+=before-t.buffs.length;}
      if(cleared)record(b,'mechanic',to,{name:'正阳狮鹫阵亡 · 清除 SignOnAvatar',count:cleared});
    }
    if(isFuriaePhilosopher(to))furiaePhilosopherDeath(b,from,to);
    if(to?.side==='enemy')blackTideAxeRevenge(b,to);
    if(isFireProwlerVessel(to))fireProwlerVesselDeath(b,to);
    if(to?.side==='enemy'&&to.enemyKit?.id===2012010&&!(to.resources?.['灯昼龙鱼死亡反击已触发']??0)){
      resource(b,to,'灯昼龙鱼死亡反击已触发',1);
      record(b,'mechanic',to,{name:'【烛花】阵亡时对我方全体反击',damageRatio:to.enemyKit.deathDamageMaxHpRatio,
        scaling:'自身最大生命值',targets:enemies(b,to).map(target=>target.id)});
      useAction(b,to,'skill02','extra');
    }
    if(to?.side==='enemy'&&to.enemyKit?.id===5012100){
      const sunny=(to.resources?.['魔法少女天气']??0)===1,key=sunny?'skill03':'skill02';
      record(b,'mechanic',to,{name:'魔法少女阵亡 · 天气退场技',weather:sunny?'Sun':'Rain',action:key});
      useAction(b,to,key,'extra');
    }
    if(to?.side==='enemy'&&to.enemyKit?.id===5012120){
      rockingRebelAddLaughter(b,to,to.enemyKit.deathLaughter??5,'合金保姆 · 线路故障死亡奖励');
      record(b,'mechanic',to,{name:'【线路故障】阵亡时获得笑点',laughter:to.enemyKit.deathLaughter??5});
    }
    if(to?.side==='enemy'&&to.enemyKit?.id===3002030&&!(to.resources?.['气泡锂犬死亡插入已触发']??0)){
      resource(b,to,'气泡锂犬死亡插入已触发',1);
      const targetId=from?.side!==to.side&&from?.side==='ally'?from.id:null;
      record(b,'mechanic',to,{name:'【苏乐达陶醉】死亡时插入泼洒甜蜜',layers:Math.max(1,to.resources?.['苏乐达陶醉层数']??0),
        anchorTarget:targetId??null,hitPattern:'锚定致命攻击者，对其左右相邻我方目标造成伤害'});
      useAction(b,to,'skill02','extra',targetId);
    }
    if(to?.side==='enemy')syncMeteoricEagleMark(b,'敌人退场');
    if(to?.buffs?.some(e=>e.tag===longRightMonitorTag))for(const boss of b.units.filter(u=>live(u)&&u.enemyKit?.id===2023020&&
      (u.resources?.['长右元气']??0)>0&&to.buffs.some(e=>e.tag===longRightMonitorTag&&e.source===u.id)))
      longRightSetMonitor(b,boss,longRightRandomTarget(b,boss),'监视目标退场');
    const group=to?.enemyKit?.lycanGroup;if(!group)return;
    const state=b.enemyMechanics?.lycanGroups?.[group];if(!state)return;
    const next=lycanWolves(b,group)[0];
    for(const event of b.actionEvents??[])if(event.active&&event.group==='lycan-moonrage:'+group&&event.owner===to.id){
      if(next){event.owner=next.id;event.side=next.side;state.eventOwner=next.id;record(b,'mechanic',next,{name:'月狂倒计时转移',from:to.id});}
      else {event.active=false;state.eventOwner=null;}
    }
    if(!next){state.count=0;state.triggerPending=false;state.rageActive=false;}
  }
  function additional(b,u,to,mult,name){if(!live(to))return;damageTo(b,u,to,{name,type:'Additional',element:u.element,terms:[{scaling:'atk',multiplier:mult}],toughness:0},1,'primary','additional');}
  function afterDamage(b,from,to,kind,amount=0){
    if(to?.side==='enemy'&&to.enemyKit?.id===3002010&&from?.side!==to.side&&
      ['direct','followup'].includes(kind)&&b.activeAction?.actor===from?.id){
      const sequence=b.activeAction.sequence;
      if(to.resources?.['圆幕先生最近受击行动序号']!==sequence){
        resource(b,to,'圆幕先生最近受击行动序号',sequence);
        const controlled=to.broken||to.buffs.some(effect=>effect.control)||to.dots.some(effect=>effect.control);
        const previous=to.resources?.['圆幕先生FlopSide']??to.enemyKit.flopSideInitial??-1;
        const next=controlled?-1:-previous;
        resource(b,to,'圆幕先生FlopSide',next);
        resource(b,to,'圆幕先生AIFlag',0);
        record(b,'mechanic',to,{name:controlled?'受击时控制 / 击破强制惊吓频道':'【串台】受击翻转频道',
          previousFlopSide:previous,flopSide:next,controlled,sourceDynamicHash:to.enemyKit.flopDynamicHash});
      }
    }
    if(to?.side==='ally'&&from?.side==='enemy'&&from.enemyKit?.id===202303016&&kind==='direct'&&
      live(to)&&b.activeAction?.actor===from.id&&['skill01','skill02','skill03'].includes(b.activeAction.key))
      ascendedApplyPoison(b,from,to,{chance:from.enemyKit.poisonChance??1,
        duration:from.enemyKit.poisonDuration??3,ratio:from.enemyKit.poisonRatio??.7});
    // Skill06 每段 50% 基础概率叠 1 层裂伤；Skill09 / Skill11 为 100% 基础概率。
    if(isDirewolf(from)&&to?.side==='ally'&&kind==='direct'&&live(to)&&b.activeAction?.actor===from.id&&
      ['skill01','skill03','skill04'].includes(b.activeAction.key))
      direwolfApplyBleed(b,from,to,{chance:b.activeAction.key==='skill01'?(from.enemyKit.bleedChance??.5):1});
    if(to?.side==='ally'&&from?.side==='enemy'&&['direct','followup'].includes(kind)){
      const dirty=tag(to,ascendedDirtyHpTag);
      if(dirty&&amount>0){
        const base=to.panel?.baseStats?.hp;
        if(Number.isFinite(base)&&base>0)
          ascendedSetDirtyHp(b,from,to,dirty.value+amount/base,dirty.dirtyLifetime??2,'攻击噬命目标');
      }
    }
    if(to?.side==='enemy'&&to.enemyKit?.id===5012100&&kind==='elation')
      magicalGirlTurnSunny(b,to,'受到欢愉伤害');
    if(from?.side==='enemy'&&from.enemyKit?.id===5012100&&b.activeAction?.actor===from.id&&
      b.activeAction?.key==='skill02'&&to?.side==='ally')magicalGirlShock(b,from,to);
    if(to?.enemyKit?.id===2022010&&(to.resources?.['魔阴身士卒复起待记录']??0)>0){
      delete to.resources['魔阴身士卒复起待记录'];
      record(b,'mechanic',to,{name:'复起',reason:'受到致命攻击后回复生命',hp:to.hp,maxHp:combatPanel(to).hp,
        hpRatio:to.hp/combatPanel(to).hp,reviveHpRatio:to.enemyKit.reviveHpRatio,uses:1});
    }
    if(to?.enemyKit?.id===3002030&&(kind==='dot'||kind==='additional'||!live(to))){
      const sequence=b.activeAction?.sequence??b.log.length;
      const token=kind==='dot'?'dot:'+b.log.length:(kind==='additional'?'additional:':'attack:')+sequence;
      bubbleHoundTipsiness(b,from,to,kind,token);
    }
    roster.afterDamage(b,from,to,kind);
  }
  function equipmentAfter(b,u,key,kind,a,selected,hitTargets){
    relics.after(b,u,key,kind,a,selected,hitTargets);
    equipment.after(b,u,key,kind,a,selected,hitTargets);
    const p=u.gear?.cone?.p,id=u.gear?.cone?.id;
    if(p){
      if(id===23046&&key==='skill')stacks(b,u,u,'理想燃烧的地狱 · 战技攻击','atkPct',p[3],p[4],null);
      if(id===23048){if(key==='ultimate'&&hitTargets.length)sp(b,u,p[2],'金血铭刻的时代');if(key==='skill'&&a.target==='ally')buff(b,u,selected[0],'金血铭刻的时代 · 战技增伤','dmgBoost',p[3],p[4],{abilityType:'BPSkill'});}
      if(id===23051&&key==='ultimate'){const team=allies(b,u),atk=combatPanel(u).atk,lowest=team.reduce((a,c)=>a.hp<c.hp?a:c);for(const to of team){heal(b,u,to,atk*p[4]);buff(b,u,to,'卫戍','dmgBoost',p[1],p[3],{tag:'garrison'});}heal(b,u,lowest,atk*p[5]);}
      if(id===21018&&key==='ultimate')for(const to of allies(b,u))advance(b,to.id,p[0]);
      if(id===21004&&hitTargets.length&&u.resources['模样触发回合']!==u.turns){resource(b,u,'模样触发回合',u.turns);energy(b,u,p[1]);}
      if(id===22005&&key==='skill')stacks(b,u,u,'迷境饭 · 战技攻击','atkPct',p[1],p[2],null);
    }
    for(const s of u.gear?.sets??[])if(s.count>=4){
      if(s.id===110&&key==='ultimate')advance(b,u.id,s.p4[0]);
      if(s.id===114&&key==='ultimate'&&['ally','allies','self','lowestAlly'].includes(a.target))for(const to of allies(b,u))buff(b,u,to,s.name,'speedPct',s.p4[0],s.p4[1],{id:'messenger-speed'});
      if(s.id===121&&['skill','ultimate'].includes(key)&&a.target==='ally')stacks(b,u,selected[0],s.name,'critDmg',s.p4[0],s.p4[2],s.p4[1]);
      if(s.id===122&&key==='ultimate')buff(b,u,u,s.name+' · 下次战技','dmgBoost',s.p4[1],null,{tag:'scholar',abilityType:'BPSkill'});
      else if(s.id===122&&key==='skill'&&kind!=='copy')u.buffs=u.buffs.filter(e=>e.tag!=='scholar');
      if(s.id===120&&(kind==='followup'||key==='dragon'))buff(b,u,u,s.name+' · 终结增伤','dmgBoost',s.p4[1],s.p4[2],{abilityType:'Ultra'});
    }
  }
  function onWaveStart(b){equipment.waveStart(b);roster.waveStart(b);}
  // 敌方尝试从弱点击破恢复；返回 true 表示本次恢复被延长（残梅绽等）。
  function beforeRecover(b,u){
    const hold=roster.beforeRecover(b,u);
    if(!hold&&u?.enemyKit?.id===3013010&&u.broken){
      const ended=u.buffs.some(e=>e.tag==='fadedRageSuperArmorBreak');
      u.buffs=u.buffs.filter(e=>e.tag!=='fadedRageSuperArmorBreak');
      buff(b,u,u,'癔症身壳 · 超级护甲','dmgReduction',u.enemyKit.superArmorDamageReduction,null,
        {id:u.id+':faded-rage-super-armor',tag:'fadedRageSuperArmor'});
      if(ended)record(b,'mechanic',u,{name:'癔症身壳 · 超级护甲恢复'});
    }
    return hold;
  }
  function redirectDamage(b,from,to,amount,kind){
    const out=roster.redirectDamage(b,from,to,amount,kind);
    const barrier=to?.enemyKit?.id===1012030&&to.buffs?.find(e=>e.tag==='mechaBlockDamage');
    const dotDamage=String(kind).includes('dot');
    if(barrier&&amount>0&&!dotDamage&&to.enemyKit.blockDot===false){
      const actionToken=b.activeAction?.sequence;
      if(actionToken!=null){barrier.blockingAction=actionToken;out.push({absorb:true,amount,muteBreak:to.enemyKit.muteBreak===true,reason:'自动机兵·甲虫的屏障'});}
    }
    return out;
  }
  // 致命伤害拦截；返回 true 表示保留 1 点生命（免于无法战斗）。
  function beforeLethal(b,from,to,amount){
    if(roster.beforeLethal(b,from,to,amount))return true;
    if(to?.side!=='enemy'||to.enemyKit?.id!==2022010||!tag(to,maraSoldierReviveTag)||
      (to.resources?.['魔阴身士卒复起已触发']??0)>0)return false;
    const k=to.enemyKit,healAmount=combatPanel(to).hp*k.reviveHpRatio;
    to.hp+=healAmount;
    // The sourced revive ability uses DispelStatus with no BuffType, which
    // follows the game's default debuff-cleanse behavior. Preserve positive
    // buffs and shields; the revive marker itself is a dispellable debuff.
    const dispelledDebuffs=to.buffs.filter(effect=>effect.debuff).length,dispelledDots=to.dots.length;
    to.buffs=to.buffs.filter(effect=>!effect.debuff);to.dots=[];
    record(b,'cleanse',to,{target:to.id,name:'复起',debuffs:dispelledDebuffs,dots:dispelledDots,silent:true});
    resource(b,to,'魔阴身士卒复起已触发',1);to.resources['魔阴身士卒复起待记录']=1;
    buff(b,to,to,'复起 · 速度提高','speedPct',k.reviveSpeedRatio,null,
      {id:to.id+':mara-soldier-revive-speed',tag:'maraSoldierReviveSpeed'});
    return true;
  }
  function onTurnStart(b,u){u.spentThisTurn=0;
    for(const serpent of b.units.filter(t=>live(t)&&t.side==='enemy'&&t.enemyKit?.id===4063010&&wingedSerpentLayers(t)>0)){
      resource(b,serpent,'翼蛇形本回合反击已触发',0);
      for(const target of b.units)target.buffs=target.buffs.filter(e=>e.tag!==wingedSerpentMarkTag(serpent.id));
    }
    if(u.enemyKit?.id===8003010&&(u.resources?.['外宇宙之冰击破结束待恢复']??0)>0&&!u.broken){
      resource(b,u,'外宇宙之冰击破结束待恢复',0);
      buff(b,u,u,'NoWeakAndResistance · 击破结束','marker',0,null,{id:u.id+':ice-no-weak-resistance',tag:'iceOutOfSpaceNoWeakResistance'});
      record(b,'mechanic',u,{name:'弱点击破结束 · 恢复【NoWeakAndResistance】'});
    }
    if(u.side==='enemy'&&tag(u,meteoricEagleWindwalkTag)){
      const pending=(u.resources?.['风行立即行动待触发']??0)>0;
      u.resources??={};u.resources['风行立即行动待触发']=0;u.resources['风行额外行动中']=pending?1:0;
      if(pending)record(b,'mechanic',u,{name:'【风行】立即行动开始'});
    }
    for(const t of b.units)t.hp=Math.min(t.hp,combatPanel(t).hp);
    for(const effect of [...(u.buffs??[]),...(u.dots??[])].filter(e=>e.tag===cacoHarmonyDreamTag)){
      const source=get(b,effect.source)??u,ratio=effect.healAtTurnStartRatio??0;
      if(ratio>0)heal(b,source,u,combatPanel(u).hp*ratio);
    }
    roster.turnStart(b,u);equipment.turnStart(b,u);
    relics.turnStart(b,u);
    resolveLycanFearPre(b,u);
    if(is(u,1015)){resource(b,u,'连续战技次数',0);resource(b,u,'战技施放次数',0);u.buffs=u.buffs.filter(e=>e.tag!=='circuit');if(u.kit.eidolon>=6)sp(b,u,1,'Archer E6');}
    if(u.enemyKit?.id===2023020)resource(b,u,'长右本回合额外行动',0);
    const s=set(u,106);if(s?.count>=4&&u.hp/combatPanel(u).hp<=s.p4[0]){heal(b,u,u,combatPanel(u).hp*s.p4[1]);energy(b,u,s.p4[2]);}
  }
  function onTurnEnd(b,u){
    roster.turnEnd(b,u);
    // 【战甲】在自身回合结束时恢复到最大层数。
    if(isFuriaePraetor(u)&&live(u))furiaePraetorSetArmor(b,u,u.enemyKit?.armorMaxLayers??6,'回合结束 · 【战甲】恢复');
    if(isFuriaePhilosopher(u)&&live(u))stoneShieldSet(b,u,u.enemyKit?.armorMaxLayers??3,'回合结束 · 【战甲】恢复');
    if(u.side==='enemy'){
      if((u.resources?.['风行额外行动中']??0)>0)u.resources['风行额外行动中']=0;
      else if(tag(u,meteoricEagleWindwalkTag)){
        u.resources??={};u.resources['风行立即行动待触发']=1;u.distance=0;
        record(b,'mechanic',u,{name:'【风行】回合结束后立即行动'});
      }
    }
    if(is(u,1015)){u.buffs=u.buffs.filter(e=>e.tag!=='circuit');resource(b,u,'连续战技次数',0);}
    if(u.side==='ally')for(const s of b.units.filter(s=>live(s)&&is(s,1306)&&s.kit.enhanced)){const bank=s.resources['溢出战技点']??0,n=Math.min(bank,b.maxSP-b.sp);for(let i=0;i<n;i++){resource(b,s,'溢出战技点',bank-i-1);sp(b,s,1,'花火 · 溢出回补');}}
    sync(b);
  }
  function sync(b){
    // bondmate 可空（例如知更鸟的协奏倒计时只绑定施法者本人）。
    for(const s of b.summons)if(!live(get(b,s.owner))||(s.bondmate!=null&&!live(get(b,s.bondmate))))s.active=false;
    for(const hound of b.units.filter(u=>u.enemyKit?.id===3002030&&u.summonerId&&u.active&&!live(get(b,u.summonerId)))){
      hound.active=false;hound.hp=0;
      record(b,'mechanic',hound,{name:'甜猿泰山退场 · 气泡锂犬随从退场',summonerId:hound.summonerId});
    }
    for(const u of b.units)u.buffs=u.buffs.filter(e=>(!e.removeOnSourceDeath||live(get(b,e.source)))&&(!e.requiresTag||tag(get(b,e.requiresTag.unit),e.requiresTag.tag)));
  }
  function hit(b,u,to,a,kind){
    roster.hit(b,u,to,a,kind);
    if(u.side==='enemy'&&u.enemyKit?.id===300302007&&['限量赠饮','无限畅饮'].includes(a?.name)&&
      to?.shields?.some(shield=>shield.value>1e-8)){
      const targets=u.resources['甜猿泰山本次盾击目标']??(u.resources['甜猿泰山本次盾击目标']=[]);
      if(!targets.includes(to.id))targets.push(to.id);
    }
  }
  function afterHit(b,u,to,a,kind,info){
    roster.afterHit(b,u,to,a,kind,info);
    if(u.side==='enemy'&&u.enemyKit?.id===5023010&&a?.name==='欢乐笑语'&&live(to)){
      const k=u.enemyKit,p=combatPanel(u),target=combatPanel(to),chance=Math.max(0,Math.min(1,k.blissChance*(1+(p.effectHit??0))*(1-(target.effectRes??0))));
      if(b.random()<chance){
        const id=u.id+':joy-bliss:'+to.id;
        to.buffs=to.buffs.filter(e=>e.id!==id);
        buff(b,u,to,'极乐','marker',0,null,{id,tag:k.blissTag,debuff:true,modifierName:'Monster_XP_Elite02_03_ElationControl'});
        record(b,'mechanic',u,{name:'【欢乐笑语】施加【极乐】',target:to.id,chance});
      }
    }
    if(u.side==='ally'&&b.activeAction?.key==='basic'){
      const bliss=to?.buffs?.find(e=>e.tag===joyAscendantBlissTag);if(bliss){
        to.buffs=to.buffs.filter(e=>e!==bliss);
        const source=b.units.find(enemy=>enemy.id===bliss.source),chance=source?.enemyKit?.blissBasicRewardChance??.7;
        if(b.random()<chance)sp(b,u,1,'【极乐】· 普攻后获得战技点');
        record(b,'mechanic',u,{name:'普攻移除【极乐】并判定战技点',target:to.id,chance});
      }
    }
    if(u.side==='ally'&&to?.enemyKit?.id===2033010&&['direct','followup'].includes(kind))
      removeLycanTag(b,u,lycanFearPreTag(to.id),'攻击施加者解除【恐惧萦绕】');
    if(u.enemyKit?.id===2033010&&a?.name==='杀戮算法'&&live(to)&&
      to.buffs.some(e=>e.source===u.id&&(e.tag===lycanFearPreTag(u.id)||e.tag===lycanFearTag(u.id)))){
      b.enemyMechanics??={};const seen=b.enemyMechanics.lycanFearBonusKeys??(b.enemyMechanics.lycanFearBonusKeys=[]);
      const key=(b.activeAction?.sequence??b.log.length)+':'+to.id;
      if(!seen.includes(key)){
        seen.push(key);
        damageTo(b,u,to,{name:'杀戮算法·恐惧追加',type:'Normal',element:'Physical',terms:[{scaling:'atk',multiplier:1.8}],toughness:0},1,'primary','additional');
        record(b,'mechanic',u,{name:'【杀戮算法】恐惧追加伤害',target:to.id,multiplier:1.8});
      }
    }
    if(!live(to)||a?.obliteratorMarkProc===true||!['direct','followup','additional'].includes(kind))return;
    const mark=tag(to,obliteratorMarkTag);if(!mark)return;
    const source=get(b,mark.source);if(!source)return;
    const amount=(mark.snapshotAtk??combatPanel(source).atk)*(mark.markMultiplier??source.enemyKit?.markMultiplier??0);
    damageTo(b,source,to,{name:'起爆',type:'Additional',element:'Imaginary',countAsFollowup:true,obliteratorMarkProc:true,
      terms:[{scaling:'atk',multiplier:0,flatAdd:amount}],toughness:0},1,'primary','additional');
    record(b,'mechanic',source,{name:'【起爆】追击伤害',target:to.id,multiplier:mark.markMultiplier??source.enemyKit?.markMultiplier??0});
  }
  function modifiers(b,u,to,a,kind){
    const out={dmgBoost:0,defIgnore:0,vuln:0,resPen:0,critRate:0,critDmg:0};
    const rosterMod=roster.modifiers(b,u,to,a,kind);
    for(const [key,value]of Object.entries(rosterMod))out[key]=(out[key]??0)+value;
    if(a.countAsFollowup&&kind!=='followup'){
      // Preserve category-specific modifiers (e.g. Elation DMG) while replacing only
      // the ordinary hit classification with Follow-Up Attack classification.
      const direct=roster.modifiers(b,u,to,a,'direct'),followup=roster.modifiers(b,u,to,a,'followup');
      for(const key of new Set([...Object.keys(direct),...Object.keys(followup)]))out[key]=(out[key]??0)+(followup[key]??0)-(direct[key]??0);
    }
    if(is(u,1412)){if(live(get(b,u.resources['军功目标']))&&u.resources['军功目标']!==u.id){out.dmgBoost+=rank(u,2,1);out.resPen+=rank(u,6);}}
    if(is(u,1015)){if(a.type==='Ultra')out.dmgBoost+=rank(u,4);if(a.type==='BPSkill')out.defIgnore+=rank(u,6,1);}
    for(const s of b.units.filter(s=>live(s)&&s.side===u.side&&is(s,1306))){const n=(s.kit.enhanced?tag(s,'illusion'):tag(u,'sparkleTalent:'+s.id))?.stacks??0,p=s.kit.params;
      if(s.kit.enhanced)out.vuln+=n*(p.Talent[1]+(tag(u,'cipher')?p.Ultra[2]:0));else out.dmgBoost+=n*(p.Talent[1]+(tag(u,'cipher')?p.Ultra[2]:0));
      out.defIgnore+=n*rank(s,2);
    }
    for(const d of b.units.filter(d=>live(d)&&d.side===u.side&&is(d,1414)&&live(get(b,d.resources['同袍目标']))))out.vuln+=rank(d,6);
    for(const s of b.units.filter(t=>live(t)&&t.side===u.side)){
      const p=cone(s,21011);if(p&&a.element===s.element)out.dmgBoost+=p[0];
      for(const rs of s.gear?.sets??[]){if(rs.id===302&&combatPanel(s).speed>=rs.p2[1]){/* attack aura is applied in panel hook */}
        if(rs.id===312&&s!==u&&a.element===s.element)out.dmgBoost+=rs.p2[1];}
    }
    const g=cone(u,23051);if(g&&tag(u,'garrison')&&b.summons.some(s=>s.active&&s.bondmate===u.id))out.dmgBoost+=g[2];
    // Garrison's conditional portion belongs to the wearer of the cone, not the recipient.
    if(!g&&tag(u,'garrison')){const from=get(b,tag(u,'garrison').source),p=cone(from??{},23051);if(p&&b.summons.some(s=>s.active&&s.bondmate===u.id))out.dmgBoost+=p[2];}
    for(const s of u.gear?.sets??[]){if(s.id===108&&s.count>=4)out.defIgnore+=s.p4[0]+((to.weaknesses??[]).includes('Quantum')||to.buffs.some(e=>e.weakness==='Quantum')?s.p4[1]:0);
      if(s.id===306&&combatPanel(u).critRate>=s.p2[1]&&(a.type==='Ultra'||kind==='followup'||a.countAsFollowup))out.dmgBoost+=s.p2[2];
      if(s.id===311){const speed=combatPanel(u).speed;if(speed>=s.p2[1])out.dmgBoost+=speed>=s.p2[2]?s.p2[4]:s.p2[3];}
      if(s.id===102&&s.count>=4&&a.type==='Normal')out.dmgBoost+=s.p4[1];
      if(s.id===122&&s.count>=4&&['BPSkill','Ultra'].includes(a.type))out.dmgBoost+=s.p4[0];
      if(s.id===309&&combatPanel(u).critRate>=s.p2[1]&&['Normal','BPSkill'].includes(a.type))out.dmgBoost+=s.p2[2];
    }
    const relicMod=relics.modifiers(b,u,to,a,kind);for(const [k,v] of Object.entries(relicMod))out[k]+=v;
    return out;
  }
  function dragon(b,s){const u=get(b,s.owner);if(!live(u)){s.active=false;return;}
    // 通用倒计时 / 召唤物：由角色模块自己的 summonTurn 结算。
    if(s.kind==='countdown'){roster.summonTurn(b,u,s);return;}
    // 非倒计时召唤物：拥有者模块声明了 summonTurn（1510 拓星者等）就交给模块，否则维持 1414 龙灵分支。
    if(roster.hasSummonTurn(u)){roster.summonTurn(b,u,s);return;}
    const mate=get(b,s.bondmate);if(!live(mate)){s.active=false;return;}
    useAction(b,u,s.enhanced>0?'dragon':'dragonShield','summon');
  }
  function displayEffects(b,u){
    const out=[],add=(from,name,key,value,extra={})=>out.push({type:'buff',id:'derived:'+from.id+':'+name,source:from.id,name,key,value,remaining:null,tickOwner:from.id,tickAt:'end',derived:true,...extra});
    for(const s of b.units.filter(s=>live(s)&&is(s,1306))){const p=s.kit.params,illusion=tag(s,'illusion');
      if(s.kit.enhanced&&s.side!==u.side&&illusion){add(s,'幻相 · 易伤','vuln',illusion.stacks*p.Talent[1],{debuff:true,stacks:illusion.stacks,remaining:illusion.remaining,note:'持有谜诡的攻击者额外增加 '+Math.round(illusion.stacks*p.Ultra[2]*100)+'% 易伤'});if(rank(s,2))add(s,'幻相 · 减防','defShred',illusion.stacks*rank(s,2),{debuff:true,remaining:illusion.remaining});}
      if(!s.kit.enhanced&&s.side===u.side){const t=tag(u,'sparkleTalent:'+s.id);if(t){add(s,'叙述性诡计 · 增伤','dmgBoost',t.stacks*(p.Talent[1]+(tag(u,'cipher')?p.Ultra[2]:0)),{stacks:t.stacks,remaining:t.remaining,tickOwner:u.id});if(rank(s,2))add(s,'叙述性诡计 · 无视防御','defIgnore',t.stacks*rank(s,2),{remaining:t.remaining,tickOwner:u.id});}}
    }
    for(const d of b.units.filter(d=>live(d)&&is(d,1414)&&d.side!==u.side&&live(get(b,d.resources['同袍目标']))))if(rank(d,6))add(d,'腾荒 E6 · 易伤','vuln',rank(d,6),{debuff:true});
    if(is(u,1412)){if(trace(u,2))add(u,'见者 · 暴击率','critRate',trace(u,2)[0]);if(trace(u,1)){const p=trace(u,1);add(u,'来者 · 攻击转暴伤','critDmg',Math.min(p[3],Math.max(0,combatPanel(u).atk-p[0])/p[1]*p[2]));}if(live(get(b,u.resources['军功目标']))&&u.resources['军功目标']!==u.id){if(rank(u,2,1))add(u,'刻律德菈 E2 · 增伤','dmgBoost',rank(u,2,1));if(rank(u,6))add(u,'刻律德菈 E6 · 抗穿','resPen',rank(u,6));}}
    if(is(u,1015)){if(rank(u,4))add(u,'Archer E4 · 终结增伤','dmgBoost',rank(u,4),{abilityType:'Ultra'});if(rank(u,6,1))add(u,'Archer E6 · 战技无视防御','defIgnore',rank(u,6,1),{abilityType:'BPSkill'});}
    for(const source of b.units.filter(s=>live(s)&&s.side===u.side)){
      const p=cone(source,21011);if(p&&u.element===source.element)add(source,'与行星相会','dmgBoost',p[0],{note:'仅 '+source.element+' 属性伤害'});
      for(const s of source.gear?.sets??[]){if(s.id===302&&combatPanel(source).speed>=s.p2[1])add(source,s.name+' · 全队攻击','atkPct',s.p2[2]);if(s.id===310&&combatPanel(source).effectRes>=s.p2[1])add(source,s.name+' · 全队暴伤','critDmg',s.p2[2]);if(s.id===312&&source!==u&&source.element===u.element)add(source,s.name+' · 同属性增伤','dmgBoost',s.p2[1]);}
      const hermit=set(source,128);if(hermit?.count>=4&&u.shields.some(sh=>sh.source===source.id&&sh.value>0))add(source,hermit.name+' · 持有来源护盾','critDmg',hermit.p4[1]);
    }
    const g=tag(u,'garrison'),from=g?get(b,g.source):null,p=from?cone(from,23051):null;if(p&&b.summons.some(s=>s.active&&s.bondmate===u.id))add(from,'卫戍 · 持有召唤物','dmgBoost',p[2],{remaining:g.remaining,tickOwner:u.id});
    const silent=cone(u,21003);if(silent&&enemies(b,u).length<=2)add(u,'唯有沉默 · 暴击率','critRate',silent[1]);
    for(const s of u.gear?.sets??[]){if(s.id===108&&s.count>=4)add(u,s.name+' · 无视防御','defIgnore',s.p4[0],{note:'目标有量子弱点时额外 '+Math.round(s.p4[1]*100)+'%'});
      if(s.id===301&&combatPanel(u).speed>=s.p2[1])add(u,s.name+' · 速度达标','atkPct',s.p2[2]);
      if(s.id===303)add(u,s.name+' · 命中转攻击','atkPct',Math.min(s.p2[2],(combatPanel(u).effectHit??0)*s.p2[1]));
      if(s.id===304&&combatPanel(u).effectHit>=s.p2[1])add(u,s.name+' · 命中达标','defPct',s.p2[2]);
      if(s.id===307&&combatPanel(u).speed>=s.p2[1])add(u,s.name+' · 速度达标','breakEffect',s.p2[2]);
      if(s.id===306&&combatPanel(u).critRate>=s.p2[1])add(u,s.name+' · 终结与追击','dmgBoost',s.p2[2],{note:'仅终结技与追加攻击'});
      if(s.id===311&&combatPanel(u).speed>=s.p2[1])add(u,s.name+' · 速度达标','dmgBoost',combatPanel(u).speed>=s.p2[2]?s.p2[4]:s.p2[3]);
      if(s.id===319&&combatPanel(u).hp>=s.p2[1])add(u,s.name+' · 生命达标','critDmg',s.p2[2]);
      if(s.id===320&&combatPanel(u).speed>=s.p2[1])add(u,s.name+' · 速度达标','healingBoost',combatPanel(u).speed>=s.p2[2]?s.p2[4]:s.p2[3]);
      if(s.id===309&&combatPanel(u).critRate>=s.p2[1])for(const type of ['Normal','BPSkill'])add(u,s.name+' · '+type,'dmgBoost',s.p2[2],{abilityType:type});
      if(s.id===318&&b.summons.some(s=>s.active&&s.bondmate===u.id))add(u,s.name+' · 持有召唤物','critDmg',s.p2[1]);
      if(s.id===122&&s.count>=4)for(const type of ['BPSkill','Ultra'])add(u,s.name+' · '+type,'dmgBoost',s.p4[0],{abilityType:type});
      if(s.id===102&&s.count>=4)add(u,s.name+' · 普攻增伤','dmgBoost',s.p4[1],{abilityType:'Normal'});
    }
    out.push(...relics.display(b,u),...roster.display(b,u));return out;
  }
  return {unitCreated,actionEventStart,actionEventEnd:roster.actionEventEnd,onStart,onWaveStart,beforeRecover,weaknessBreak,beforeLethal,hpBarTransition,redirectDamage,energy,dot,prepare,before,after,enemyAction,ahaStart:rockingRebelAhaStart,
    laughterGained(b,side,amount,source,reason){pfPamHiddenNannyLaughter(b,side,amount,source,reason);},
    copyOwner,consumeCopy,onTurnStart,onTurnEnd,modifiers,dragon,summonTurn:roster.summonTurn,hasSummonTurn:roster.hasSummonTurn,onEffectExpire:roster.onEffectExpire,onEffectRemove:roster.onEffectRemove,spSpent:roster.spSpent,sp,spend,sync,supportTarget,displayEffects,relics,panel:roster.panel,repeatStart:roster.repeatStart,hit,afterHit,afterDamage,hpChanged:roster.hpChanged,shouldUseSkill:roster.shouldUseSkill,shouldUseUltimate:roster.shouldUseUltimate,continueAction,attacked(b,to,from){
    const dreams=[...(to?.buffs??[]),...(to?.dots??[])].filter(e=>e.tag===cacoHarmonyDreamTag&&e.removeOnAttacked===true);
    if(dreams.length){to.buffs=to.buffs.filter(e=>!dreams.includes(e));to.dots=to.dots.filter(e=>!dreams.includes(e));
      for(const effect of dreams)record(b,'mechanic',from??to,{name:'受到攻击 · 解除【异梦】',target:to.id,source:effect.source});}
    if(isFuriaePraetor(to)&&from?.side==='ally'&&live(to))furiaePraetorArmorHit(b,to,from);
    if(isFuriaePhilosopher(to)&&from?.side==='ally'&&live(to))stoneShieldHit(b,to,from);
    if(to?.enemyKit?.id===3002030)
      bubbleHoundTipsiness(b,from,to,b.activeAction?.kind??'attack','attack:'+(b.activeAction?.sequence??b.log.length));
    if(to?.enemyKit?.id===4053020&&from?.side==='ally'&&!to.broken){
      const type=from.actions?.[b.activeAction?.key]?.type;
      if(['Normal','BPSkill','Ultra','Servant'].includes(type)){
        const token=b.activeAction?.sequence??b.log.length;
        if(to.resources?.['飓风大母上次受击行动']!==token){
          to.resources??={};to.resources['飓风大母上次受击行动']=token;
          const count=(to.resources['飓风大母受击计数']??0)+1,threshold=to.buffs.some(e=>e.name==='在毁灭中狂欢')
            ?to.enemyKit.passiveParams[1]:to.enemyKit.passiveParams[0];
          to.resources['飓风大母受击计数']=count;
          record(b,'mechanic',to,{name:'【请泊舟暂歇】受击计数',count,threshold,sourceActionType:type});
          if(count>=threshold){to.resources['飓风大母受击计数']=0;advance(b,to.id,1);
            record(b,'mechanic',to,{name:'【请泊舟暂歇】行动提前',threshold,incubating:to.buffs.some(e=>e.tag===cyclonicMotherIncubationTag),
              omitted:to.buffs.some(e=>e.tag===cyclonicMotherIncubationTag)?['孵育狂潮期间扣血、召唤泡影稚子与孵化行动延后']:[]});}
        }
      }
    }
    if(to?.side==='enemy'&&[5013040,5013050,5013060,5013070].includes(to.enemyKit?.id)&&from?.side==='ally'){
      const token=b.activeAction?.sequence??b.log.length;
      if(to.buffs.some(e=>e.tag===dawnCorpsForceTag)&&to.resources?.['破晓战队上次受击行动']!==token){
        to.resources??={};to.resources['破晓战队上次受击行动']=token;
        const count=(to.resources['破晓战队力场受击计数']??0)+1;
        to.resources['破晓战队力场受击计数']=count;
        record(b,'mechanic',to,{name:'【破晓退散】受击计数',count,threshold:to.enemyKit.fieldAttackThreshold});
        if(count>=to.enemyKit.fieldAttackThreshold){
          record(b,'mechanic',to,{name:'力场受击阈值已达，插入【破晓退散】',count});
          b.queue.unshift({actor:to.id,key:'skill05',kind:'followup'});
        }
      }
      const element=from.actions?.[b.activeAction?.key]?.element??from.element;
      if(to.buffs.some(e=>e.tag===dawnCorpsForceTag)&&element===to.enemyKit.element&&
        to.resources?.['破晓战队属性行动提前']!==token){
        to.resources??={};to.resources['破晓战队属性行动提前']=token;advance(b,to.id,1);
        record(b,'mechanic',to,{name:'受到对应属性攻击 · 破晓力场行动提前',element,attacker:from.id});
      }
    }
    if(to?.enemyKit?.id===4063010&&wingedSerpentLayers(to)>0&&from?.side==='ally'&&!to.broken&&!to.cannotAct&&
      (to.skipTurns??0)<=0&&![...(to.buffs??[]),...(to.dots??[])].some(e=>e.control||e.disableAction===true)&&
      !(to.resources?.['翼蛇形本回合反击已触发']??0)){
      const markOwner=from.memospriteOwner?get(b,from.memospriteOwner):from,mark=markOwner&&wingedSerpentMarkTag(to.id);
      if(markOwner&&!markOwner.buffs.some(e=>e.tag===mark)){
        resource(b,to,'翼蛇形本回合反击已触发',1);
        buff(b,to,markOwner,'蜷曲蓄力 · 本回合攻击标记','marker',0,null,{id:to.id+':winged-serpent-mark:'+markOwner.id,tag:mark,removeOnSourceDeath:true});
        const layers=wingedSerpentLayers(to),key=layers>1?'skill05':'skill05ToStb';
        record(b,'mechanic',to,{name:'【蜷曲蓄力】受击插入扭矩反打',attacker:markOwner.id,layers,action:key,
          oncePerTargetTurn:true,omitted:['侵蚀与 RallyHP 生命联动']});
        b.queue.unshift({actor:to.id,key,kind:'followup'});
      }
    }
    roster.attacked(b,to,from);equipment.attacked(b,to);
    if(isCagePast(to))cagePastAttacked(b,to,from);
    if(isDevourerShadow(to))devourerShadowAttacked(b,to,from);
    const unstable=to?.buffs?.find(e=>e.tag===jinrenUnstableTag),caster=unstable&&get(b,unstable.source);
    if(!unstable||!live(caster)||from?.side===to.side)return;
    to.buffs=to.buffs.filter(e=>e!==unstable);
    const controlRes=combatPanel(to).controlRes??to.controlRes??0;
    if(controlRes>=1||b.random()>=jinrenDebuffChance(b,caster,to,caster.enemyKit.shakeChance)*(1-controlRes)){
      record(b,'resist',to,{name:'抵抗【强烈震荡】',source:caster.id});return;
    }
    buff(b,caster,to,'强烈震荡','marker',0,caster.enemyKit.shakeDuration,{tag:jinrenShakeTag,debuff:true,control:'shake',tickOwner:caster.id,tickAt:'end'});
    delay(b,to.id,caster.enemyKit.shakeDelayRatio);to.skipTurns=(to.skipTurns??0)+caster.enemyKit.shakeSkipTurns;
    record(b,'mechanic',caster,{name:'【震荡】转为【强烈震荡】',target:to.id,skipTurns:caster.enemyKit.shakeSkipTurns,delayRatio:caster.enemyKit.shakeDelayRatio});
    const disabled=caster.broken||caster.cannotAct||(caster.skipTurns??0)>0||[...caster.buffs,...caster.dots].some(e=>e.control||e.disableAction===true);
    if(!disabled&&!caster.resources?.['拘魂目标'])b.queue.unshift({actor:caster.id,key:'skill04Insert',kind:'extra',targetId:to.id});
  },death};
}
