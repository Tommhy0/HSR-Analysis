import { inspectEndgameTarget } from './endgame-scenes.mjs';
import { abundanceSpriteGoldenHound, alloyNanny, arbiterOfLostAbyss, ascended, assistantGraffitiRusher, automatonBeetle, automatonHound, blackTideBlade, blackTideAxe, blackTideDaemon, bloodclawWolf, brokenContainer, bubbleHound, cacoHarmony, cagePast, cyclonicSwarmMother, dawnCorpsRanger, darkSunGryphon, devourerShadow, direwolf, dreamjoltMrDomescreen, eclipsedWolf, everwinterShadewalker, fadedRageShell, fireProwler, fictionalEnsemble, flamingShadewalker, furiaePhilosopher, furiaePraetor, godDevourerOffspring, goldenScourge, iceOutOfSpace, ichorPheasant, illuminationDragonfish, imaginaryWeaver, joyAscendant, kingPomPom, kingPomPomFantasticStory, lighthouse, longRight, lycanMecha, magicalGirlTroupe, maraStruckSoldier, meteoricEagle, moonlitPegasus, noontideGryphon, obliterator, polluxRemnant, presentInebriatedInRevelry, reaver, roamingBandit, rockingRebel, searingProwler, seniorStaffTeamLeader, silvermaneCannoneer, silvermaneGuard, soulhookSovereign, strongman, sweetGorilla, swarmBroodling, swarmNightmare, tanukiReporter, universeFireElite, validateEnemyActor, voidrangerTrampler, waveLady, waveMaid, wraithWarden, wingedSerpent, woodenLupus, yabuli, yunqiPatrolSoldier } from './encounters.mjs';

function actorFor(ctx,source,id,groups){
  const opts={sceneEnemy:source,id};
  // Endgame rows can point at a concrete monster_childs variant (for example
  // 501304001) while the shared kit is keyed by its parent monster (5013040).
  if([5013040,5013050,5013060,5013070].includes(source.monsterId))return dawnCorpsRanger(ctx,opts);
  // 1023010 的 102301001..102301021 变体只改面板倍率，共用同一套 Ability / AI。
  if(source.monsterId===1023010)return searingProwler(ctx,opts);
  switch(source.childId){
    case 2022040:return abundanceSpriteGoldenHound(ctx,opts);
    case 3002010:return dreamjoltMrDomescreen(ctx,opts);
    case 5012050:return assistantGraffitiRusher(ctx,opts);
    case 2012010:return illuminationDragonfish(ctx,opts);
    case 8033020:return lighthouse(ctx,opts);
    case 402302001:return moonlitPegasus(ctx,opts);
    case 402301001:case 402301002:return noontideGryphon(ctx,opts);
    case 503401002:return yabuli(ctx,opts);
    case 4033030:return darkSunGryphon(ctx,opts);
    case 8003060:return fictionalEnsemble(ctx,opts);
    case 4032010:return blackTideBlade(ctx,opts);
    case 4032030:return blackTideAxe(ctx,opts);
    case 401301201:case 4013012:return furiaePraetor(ctx,opts);
    case 5023020:return godDevourerOffspring(ctx,opts);
    case 202205004:return woodenLupus(ctx,opts);
    case 5023010:return joyAscendant(ctx,opts);
    case 5014020:return kingPomPom(ctx,opts);
    case 5014023:return kingPomPomFantasticStory(ctx,opts);
    case 5012120:return alloyNanny(ctx,opts);
    case 5012100:return magicalGirlTroupe(ctx,opts);
    case 4062010:return ichorPheasant(ctx,opts);
    case 1002030:return silvermaneCannoneer(ctx,opts);
    case 300305007:return presentInebriatedInRevelry(ctx,opts);
    case 300302007:return sweetGorilla(ctx,opts);
    case 403301002:return blackTideDaemon(ctx,opts);
    case 3003040:return cacoHarmony(ctx,opts);
    case 4053020:return cyclonicSwarmMother(ctx,opts);
    case 3024030:return swarmNightmare(ctx,opts);
    case 5013040:case 5013050:case 5013060:case 5013070:return dawnCorpsRanger(ctx,opts);
    case 4014030:return polluxRemnant(ctx,opts);
    case 8012010:return reaver(ctx,opts);
    case 8012020:return voidrangerTrampler(ctx,opts);
    case 8012030:return obliterator(ctx,opts);
    case 2023020:return longRight(ctx,opts);
    case 1012030:return automatonBeetle(ctx,opts);
    case 1012010:return automatonHound(ctx,opts);
    case 1022010:return everwinterShadewalker(ctx,opts);
    case 1022020:return flamingShadewalker(ctx,opts);
    case 2002030:return wraithWarden(ctx,opts);
    case 2002010:return yunqiPatrolSoldier(ctx,opts);
    case 3002030:return bubbleHound(ctx,opts);
    case 803301011:return seniorStaffTeamLeader(ctx,opts);
    case 1002020:return roamingBandit(ctx,opts);
    case 2022010:return maraStruckSoldier(ctx,opts);
    case 202303016:return ascended(ctx,opts);
    case 1013020:case 101302032:return direwolf(ctx,opts);
    case 1023010:return searingProwler(ctx,opts);
    case 2013020:return goldenScourge(ctx,opts);
    case 2032010:return bloodclawWolf(ctx,{...opts,rageGroup:groups.get(Number(source.wave??0)+1)});
    case 2032020:return eclipsedWolf(ctx,{...opts,rageGroup:groups.get(Number(source.wave??0)+1)});
    case 2033010:return lycanMecha(ctx,{...opts,rageGroup:groups.get(Number(source.wave??0)+1)});
    case 4022010:return meteoricEagle(ctx,opts);
    case 8003010:return iceOutOfSpace(ctx,opts);
    case 800301020:return iceOutOfSpace(ctx,opts);
    case 3013010:return fadedRageShell(ctx,opts);
    case 5013010:return rockingRebel(ctx,opts);
    case 1002040:return silvermaneGuard(ctx,opts);
    case 4012010:return strongman(ctx,opts);
    case 4012020:return furiaePhilosopher(ctx,opts);
    case 8002010:return imaginaryWeaver(ctx,opts);
    case 8003020:return universeFireElite(ctx,opts);
    case 3003050:case 300305007:return presentInebriatedInRevelry(ctx,opts);
    case 3003030:return cagePast(ctx,opts);
    case 800304016:return devourerShadow(ctx,opts);
    case 8022010:return swarmBroodling(ctx,opts);
    case 501211002:return tanukiReporter(ctx,opts);
    case 4052010:return waveMaid(ctx,opts);
    case 4053010:case 405301002:return waveLady(ctx,opts);
    case 200401401:case 200401402:case 200401403:case 200401404:return soulhookSovereign(ctx,opts);
    case 406401201:case 406401202:case 406401203:case 406401204:return arbiterOfLostAbyss(ctx,opts);
    case 4063010:case 406301001:return wingedSerpent(ctx,opts);
    case 4034010:case 4034014:return fireProwler(ctx,opts);
    case 4032024:case 403202401:return brokenContainer(ctx,opts);
    default:throw new Error(`${source.name}（${source.childId}）没有完整登记的可执行敌方机制`);
  }
}

function sameMultiset(a,b){
  if(a.length!==b.length)return false;
  const left=[...a].sort((x,y)=>x-y),right=[...b].sort((x,y)=>x-y);
  return left.every((x,i)=>x===right[i]);
}

function compileAnomalySceneRules(scene){
  const runtimeRules=[],appliedRuleIds=new Set();
  for(const tag of scene.tags??[]){
    if(tag.name==='洞穿'){
      const increase=/造成的伤害提高\s*(\d+(?:\.\d+)?)%/.exec(tag.text??'');
      if(increase){
        const id=`anomaly.${scene.seasonId}.${scene.floorId}.pierce-shield`;
        runtimeRules.push({type:'enemyDamageOnShieldedTarget',id,mode:'anomaly',attackerSide:'enemy',targetSide:'ally',
          damageBoost:Number(increase[1])/100,sourceTag:tag.name,sourceText:tag.text,sourceRef:'peak.stage_tag'});
        appliedRuleIds.add(tag.name);
      }
    }
  }
  return {runtimeRules,appliedRuleIds};
}

function compileSceneRules(scene){
  const runtimeRules=[],appliedRuleIds=new Set();
  if(scene.mode==='moc'){
    const sources=(scene.rules??[]).filter(rule=>
      ['abyss_season','abyss_buff'].includes(rule.kind)&&
      /我方目标施放终结技时获得/.test(rule.text??'')&&
      /每个轮开始时，使阿哈立即获得1个固定计入/.test(rule.text??'')&&
      JSON.stringify(rule.params??[])===JSON.stringify([5,20]));
    if(sources.length){
      const signature=JSON.stringify([sources[0].text,sources[0].params]);
      const duplicateSources=sources.filter(rule=>JSON.stringify([rule.text,rule.params])===signature);
      runtimeRules.push({type:'mocAhaCycle',id:`moc.${scene.seasonId}.aha-cycle`,mode:'moc',
        laughterPerUltimate:5,fixedPunchline:20,sourceRuleIds:duplicateSources.map(rule=>rule.id)});
      for(const rule of duplicateSources)appliedRuleIds.add(rule.id);
    }
  }
  if(scene.mode==='as'&&scene.enemies.some(enemy=>enemy.monsterId===4064012||enemy.childId===4064012||enemy.childId>=406401201&&enemy.childId<=406401204)){
    const scaleTag=(scene.rules??[]).find(rule=>rule.kind==='abyss_tag'&&rule.label==='层标签「规模效应」');
    const source=scene.enemies.map(enemy=>enemy.aiSource?.skillSpecs?.find(spec=>spec.id===406401216)).find(Boolean);
    const params=source?.params;
    if(scaleTag&&Array.isArray(params)&&params.length===2&&params.every(value=>Number.isFinite(value)&&value>=0)){
      runtimeRules.push({type:'enemyCountScaleEffect',id:`as.${scene.seasonId}.${scene.floorId}.scale-effect`,mode:'as',teamSide:'enemy',
        excludedMonsterId:4064012,maxStacks:5,damageReductionPerEnemy:params[0],damageBoostPerEnemy:params[1],
        sourceSkillId:406401216,sourceRuleIds:[scaleTag.id],sourceRef:scene.enemies.find(enemy=>enemy.aiSource?.sourceRef)?.aiSource.sourceRef??null,
        sourceAIPath:'Config/ConfigAI/Monster_W4_Serpent_01_AI.json',sourceAIHash:'cfbe4746a7930a2200c4a0bf5df8f7f7e8b69e9e',
        sourceAbilityPath:'Config/ConfigAbility/Monster/Monster_W4_Serpent_01_Ability_IF.json',sourceAbilityHash:'7a34fc0c8a951b7c0d21bd4551148b8f158809f9',
        sourceCharacterPath:'Config/ConfigCharacter/Monster/Monster_W4_Serpent_01_Config_IF.json',sourceCharacterHash:'ef962a3a2f020cdf9348f1aecc8f22af12000d2c'});
      appliedRuleIds.add(scaleTag.id);
    }
  }
  return {runtimeRules,appliedRuleIds};
}

function prepareSceneParty(partyConfig){
  const config=structuredClone(partyConfig),oldEnemyIds=new Set(config.units.filter(unit=>unit.side==='enemy').map(unit=>unit.id));
  const allies=config.units.filter(unit=>unit.side==='ally');
  for(const ally of allies)for(const action of Object.values(ally.actions??[]))if(oldEnemyIds.has(action.targetId))delete action.targetId;
  if(config.actionPlan)config.actionPlan=config.actionPlan.filter(command=>![command.targetId,command.after?.targetId]
    .some(id=>oldEnemyIds.has(id)));
  return {config,allies};
}

function buildAnomalyEncounter(ctx,partyConfig,{seasonId=null,floorId}={}){
  const scene=inspectEndgameTarget(ctx,{mode:'anomaly',seasonId,floorId});
  if(!scene.enemies.length)throw new Error('所选异相仲裁关卡没有敌人记录');
  if(!scene.behaviorComplete)throw new Error(`所选异相仲裁关卡仍有未登记敌方机制：${scene.behaviorGaps.join('、')}`);
  if(!Number.isInteger(scene.stage.waveCount)||scene.waves.length!==scene.stage.waveCount)
    throw new Error('异相仲裁阶段波次数与 source wave 表不一致');
  const waveGroups=new Map(scene.waves.map((wave,index)=>[index+1,`anomaly:${scene.seasonId}:${floorId}:${wave.id}`]));
  const runtimeEnemies=[];
  for(const [index,wave] of scene.waves.entries()){
    const expected=Object.values(wave.monsters??{}).map(Number),actual=scene.enemies.filter(enemy=>enemy.waveId===wave.id);
    if(!expected.length||expected.length!==actual.length||expected.some((id,slot)=>id!==Number(actual[slot]?.childId)))
      throw new Error(`异相仲裁第 ${index+1} 波名单与 stage_monster 顺序不一致`);
    if(Number.isInteger(wave.maxMonsterCount)&&wave.maxMonsterCount!==expected.length)
      throw new Error(`异相仲裁第 ${index+1} 波名单数量与 max_monster_count 不一致`);
    if(Number.isInteger(wave.maxTeammateCount)&&expected.length>wave.maxTeammateCount)
      throw new Error(`异相仲裁第 ${index+1} 波单位数超过 max_teammate_count，需实现补位规则后才能运行`);
    for(const source of actual){
      const actor=actorFor(ctx,{...source,hardLevelGroup:scene.stageHp?.hardLevelGroup,
        eliteGroup:wave.eliteGroup,stageMechanics:null},
        `scene-anomaly-${scene.seasonId}-${floorId}-w${index+1}-${source.slot+1}`,waveGroups);
      actor.enemyKit.monsterRank??=source.rank??ctx.monsterById.get(source.monsterId)?.rank??'Minion';
      actor.wave=index+1;
      runtimeEnemies.push(actor);
    }
  }
  const {config,allies}=prepareSceneParty(partyConfig);
  if(allies.filter(unit=>!unit.memospriteOwner).length!==4)throw new Error('异相仲裁真实场景需要四名我方角色');
  const formulaHpTotal=scene.enemies.reduce((sum,enemy)=>sum+(Number.isFinite(enemy.hp)?enemy.hp:0),0);
  const compiled=compileAnomalySceneRules(scene);
  const enemyBehaviorComplete=runtimeEnemies.every(actor=>!(actor.unsupported?.length)&&
    !(actor.enemyMechanicNotes?.length)&&validateEnemyActor(actor).length===0);
  const omittedRules=[
    '异相仲裁阶段词条、活动增益、目标阶段规则和评价条件尚未执行',
    ...(scene.tags??[]).filter(tag=>!compiled.appliedRuleIds.has(tag.name)).map(tag=>`异相仲裁词条未应用：${tag.name}（${tag.text}）`),
    ...new Set(runtimeEnemies.flatMap(actor=>(actor.enemyMechanicNotes??[]).map(note=>actor.name+'：'+note))),
    ...new Set(runtimeEnemies.flatMap(actor=>(actor.unsupported??[]).map(note=>actor.name+'：'+note))),
  ];
  return {...config,strict:false,units:[...allies,...runtimeEnemies],waveMode:'continuous',requiredAllies:4,endgameRules:compiled.runtimeRules,
    sceneReplay:{mode:'anomaly',seasonId:scene.seasonId,floorId:String(floorId),stageId:scene.stage.sourceStageId,
      stageName:scene.stage.name,level:scene.stage.level,hardLevelGroup:scene.stageHp?.hardLevelGroup??null,
      enemyLineupComplete:true,enemyBehaviorRegistered:true,enemyBehaviorComplete,
      spawnRosterComplete:true,spawnMechanicsComplete:true,stageRulesComplete:false,
      sourceRules:structuredClone(scene.tags??[]),sourceMechanics:structuredClone(scene.campaignRules),
      sourceHp:{stageEstimate:scene.stageHp?.estimatedHp??null,formulaTotal:formulaHpTotal,
        roundingDelta:scene.stageHp?formulaHpTotal-scene.stageHp.estimatedHp:null},
      appliedRuleIds:[...compiled.appliedRuleIds],omittedRuleIds:(scene.tags??[]).filter(tag=>!compiled.appliedRuleIds.has(tag.name)).map(tag=>tag.name),omittedRules,
      spawnSource:scene.waves.map(wave=>({id:wave.id,monsterGroupIds:Object.values(wave.monsters??{}),
        maxMonsterCount:wave.maxMonsterCount,maxTeammateCount:wave.maxTeammateCount,eliteGroup:wave.eliteGroup})),
      source:'peak.stage + stage_wave + stage_monster + stage_hp + HSR_4.6.db'},
    description:`异相仲裁 ${scene.seasonId} · ${scene.stage.name}：按 stage_monster 和逐波精英组构建 ${scene.waves.length} 波敌人，面板由关卡等级组公式生成；AI 缺口与阶段规则仍未完整还原。`};
}

/** Build one actual regular-endgame enemy event from source lineup rows.
 * It refuses unregistered enemies, multiple event tracks, or mismatched wave
 * data. Known source gaps remain visible in sceneReplay rather than being
 * silently promoted to complete behavior. Mode blessings / scoring are
 * metadata only until their rules have separate executable implementations. */
export function buildEndgameEncounter(ctx,partyConfig,{mode,seasonId=null,floorId,side}={}){
  if(mode==='anomaly')return buildAnomalyEncounter(ctx,partyConfig,{seasonId,floorId});
  if(!['moc','pf','as'].includes(mode))throw new Error('未知终局模式');
  if(![1,2].includes(Number(side)))throw new Error('请选择第 1 侧或第 2 侧作为本次四人队伍挑战');
  side=Number(side);
  const scene=inspectEndgameTarget(ctx,{mode,seasonId,floorId,side});
  if(!scene.enemies.length)throw new Error('所选挑战侧没有敌人记录');
  if(mode==='pf'){
    if(!scene.infiniteWavePlanComplete)throw new Error('虚构叙事无限波次名单与数据库敌人模板不一致，拒绝构建场景');
    if(scene.infiniteWavePlans.some(wave=>!wave.fieldCapSupported))throw new Error('虚构叙事 max_teammate_count 超出当前引擎最多五名敌人的范围');
  }
  const events=scene.events??[];
  if(events.length!==1)throw new Error(`该挑战侧有 ${events.length} 条敌方事件轨道；当前执行器只接受一条已核对的事件轨道`);
  const event=events[0];
  const {config,allies}=prepareSceneParty(partyConfig);
  if(allies.filter(u=>!u.memospriteOwner).length!==4)throw new Error('真实终局场景需要四名我方角色');
  if(mode==='pf'){
    if(!scene.behaviorComplete)throw new Error(`虚构叙事动态补怪引擎已接入，但所选名单仍有未登记敌方机制：${scene.behaviorGaps.join('、')}`);
    const groups=new Map(scene.infiniteWavePlans.map(wave=>[wave.index,`endgame:pf:${scene.seasonId}:${floorId}:side${side}:wave${wave.index}`]));
    const compiledWaves=scene.infiniteWavePlans.map(wave=>{
      const byChildId=new Map(scene.enemies.filter(enemy=>enemy.event===event.event&&enemy.infiniteWaveId===wave.id)
        .map(enemy=>[Number(enemy.childId),enemy]));
      const units=wave.monsterGroupIds.map((childId,index)=>{
        const source=byChildId.get(Number(childId));
        if(!source)throw new Error(`虚构叙事第 ${wave.index} 波名单敌人 ${childId} 缺少数据库模板`);
        const actor=actorFor(ctx,{...source,hardLevelGroup:event.hardLevelGroup,eliteGroup:event.eliteGroup,
          stageMechanics:scene.stageMechanics},`scene-pf-${scene.seasonId}-${floorId}-s${side}-p${wave.index}-n${index+1}`,groups);
        actor.enemyKit.monsterRank??=ctx.monsterById.get(source.monsterId)?.rank??ctx.monsterById.get(source.childId)?.rank??'Minion';
        // HP in abyss_wave_monsters already includes ParamList[1]. The
        // matching source ability separately adds ParamList[0] to attack.
        const attackRatio=wave.attackAddedRatio??0;
        actor.panel.atk*=1+attackRatio;
        actor.enemyKit.infiniteWaveAbility={id:wave.ability,idSource:'abyss_events.waves_json',
          attackAddedRatio:attackRatio,hpAddedRatio:wave.hpAddedRatio,sourceParams:wave.params};
        actor.wave=wave.index;
        return actor;
      });
      const gateUnitId=wave.gateCandidateChildId==null?null:units.find(unit=>Number(unit.childId)===Number(wave.gateCandidateChildId))?.id;
      if(wave.gateCandidateChildId!=null&&!gateUnitId)throw new Error(`虚构叙事第 ${wave.index} 波推定门槛敌人 ${wave.gateCandidateChildId} 未出现在生成队列`);
      return {id:wave.id,...(gateUnitId?{gateUnitId}:{}),maxTeammateCount:wave.maxTeammateCount,maxMonsterCount:wave.maxMonsterCount,
        sourceCount:wave.sourceCount,units};
    });
    const first=compiledWaves[0],initialEnemyCount=Math.min(first.maxTeammateCount,first.units.length);
    if(!Number.isInteger(initialEnemyCount)||initialEnemyCount<1)throw new Error('虚构叙事首波缺少有效的敌方场上人数上限');
    const initialEnemies=first.units.slice(0,initialEnemyCount);
    const allActors=compiledWaves.flatMap(wave=>wave.units);
    const enemyBehaviorComplete=allActors.every(actor=>!(actor.unsupported?.length)&&!(actor.enemyMechanicNotes?.length)&&validateEnemyActor(actor).length===0);
    const partiallyAppliedMechanics=allActors.flatMap(actor=>(actor.enemyKit?.partiallyImplementedStageEffects??[])
      .map(effect=>({enemyId:actor.id,effect})));
    const omittedRuleIds=(scene.rules??[]).map(rule=>rule.id);
    const omittedRules=['虚构叙事计分、击杀积分与小怪击杀向门槛敌人转移伤害尚未实现',
      'Rank≥3 敌人被击败后的关卡清场与积分归零回调尚未全部映射；没有首领门槛的波次等来源名单耗尽后结束',
      '场景祝福与词条未全部执行',...(allActors.some(actor=>actor.unsupported?.length)?['部分敌方 AI 与被动机制仍有缺口']:[]),
      ...new Set(allActors.flatMap(actor=>(actor.enemyMechanicNotes??[]).map(note=>actor.name+'：'+note)))];
    config.strict=false;
    return {...config,units:[...allies,...initialEnemies],waveMode:'continuous',requiredAllies:4,
      endgameSpawnPlan:{type:'orderedEnemyWaves',initialEnemyCount,
        waves:compiledWaves.map(({id,gateUnitId,maxTeammateCount,maxMonsterCount,sourceCount,units})=>({id,...(gateUnitId?{gateUnitId}:{}),maxTeammateCount,maxMonsterCount,sourceCount,units}))},
      sceneReplay:{mode,seasonId:scene.seasonId,floorId:String(floorId),side,event:event.event,stageId:event.stageId,level:event.level,
        hardLevelGroup:event.hardLevelGroup,eliteGroup:event.eliteGroup,enemyLineupComplete:true,enemyBehaviorRegistered:true,
        enemyBehaviorComplete,spawnRosterComplete:true,spawnMechanicsComplete:false,
        spawnTimingStatus:'source-order-and-field-cap; excludes unselectable 8003060 controller; optional unique Elite gate',stageRulesComplete:false,
        sourceRules:structuredClone(scene.rules??[]),sourceMechanics:structuredClone(scene.stageMechanics??null),
        appliedRuleIds:[],omittedRuleIds,partiallyAppliedMechanics,
        spawnSource:scene.infiniteWavePlans.map(wave=>({id:wave.id,sourceCount:wave.sourceCount,maxMonsterCount:wave.maxMonsterCount,
          maxTeammateCount:wave.maxTeammateCount,waveControllerChildId:wave.waveControllerChildId,
          gateCandidateChildId:wave.gateCandidateChildId,gateCandidateSource:wave.gateCandidateSource,params:wave.params})),
        omittedRules,source:'abyss_events.waves_json + abyss_wave_monsters + Monster_XP_MonsterGroup_00_Ability'},
      description:`虚构叙事 ${scene.seasonId} · ${floorId} 第 ${side} 侧：按数据库有序名单与场上人数上限补怪；不可选波次控制体不再误作首领门槛，唯一高阶敌人按来源条件推进，其余波次在名单清空后推进。敌方计分和控制体 HP 组仍未完整还原。`};
  }
  if(!scene.behaviorComplete)throw new Error(`所选挑战侧仍有未登记行为：${scene.behaviorGaps.join('、')}`);
  const byWave=new Map();
  for(const e of scene.enemies){const wave=Number(e.wave??0)+1;const list=byWave.get(wave)??[];list.push(e);byWave.set(wave,list);}
  const sourceWaves=event.waves??[];
  if(byWave.size!==sourceWaves.length)throw new Error('场景敌人行数与来源波次表不一致');
  for(let i=0;i<sourceWaves.length;i++){
    const expected=Object.values(sourceWaves[i]??{}).filter(Number.isFinite);
    const actual=(byWave.get(i+1)??[]).map(e=>e.childId);
    if(!sameMultiset(expected,actual))throw new Error(`第 ${i+1} 波敌人行与场景来源编队不一致`);
  }

  const groups=new Map([...byWave.keys()].map(wave=>[wave,`endgame:${mode}:${seasonId??scene.seasonId}:${floorId}:side${side}:wave${wave}`]));
  // Slot IDs are unique within each sourced wave; use the original row to set
  // the one-based runtime wave without inferring from species or ordering.
  const runtimeEnemies=scene.enemies.map((source,index)=>{
    const actor=actorFor(ctx,{...source,hardLevelGroup:event.hardLevelGroup,eliteGroup:event.eliteGroup,stageMechanics:scene.stageMechanics},`scene-${mode}-${seasonId??scene.seasonId}-${floorId}-s${side}-w${Number(source.wave??0)+1}-${source.slot??index+1}`,groups);
    actor.enemyKit.monsterRank??=ctx.monsterById.get(source.monsterId)?.rank??ctx.monsterById.get(source.childId)?.rank??'Minion';
    return {...actor,wave:Number(source.wave??0)+1};
  });
  const compiled=compileSceneRules(scene),omittedRuleIds=(scene.rules??[])
    .filter(rule=>!compiled.appliedRuleIds.has(rule.id)).map(rule=>rule.id);
  const enemyBehaviorComplete=runtimeEnemies.every(actor=>
    !(actor.unsupported?.length)&&!(actor.enemyMechanicNotes?.length)&&validateEnemyActor(actor).length===0);
  const omittedRules=[
    ...(runtimeEnemies.some(actor=>actor.unsupported?.length)?['部分敌人 AI 或边界机制仍未对拍']:[]),
    ...(omittedRuleIds.length?['未应用的关卡祝福或场景词条']:[]),
    mode==='moc'?'混沌回忆星数与通关轮数判定':'模式计分与轮次规则',
    ...new Set(runtimeEnemies.flatMap(actor=>(actor.enemyMechanicNotes??[]).map(note=>actor.name+'：'+note))),
  ];
  const partiallyAppliedMechanics=runtimeEnemies.flatMap(actor=>(actor.enemyKit?.partiallyImplementedStageEffects??[])
    .map(effect=>({enemyId:actor.id,effect})));
  partiallyAppliedMechanics.push(...compiled.runtimeRules.filter(rule=>rule.type==='enemyCountScaleEffect')
    .map(rule=>({enemyId:runtimeEnemies.find(actor=>actor.enemyKit?.id===4064012)?.id??null,
      effect:`规模效应：每个未假死的非首领敌方单位令敌方全体获得${rule.damageReductionPerEnemy*100}%减伤和${rule.damageBoostPerEnemy*100}%增伤（上限${rule.maxStacks}层）`})));
  return {...config,strict:false,units:[...allies,...runtimeEnemies],waveMode:mode==='moc'?'moc':'continuous',requiredAllies:4,
    endgameRules:compiled.runtimeRules,
    sceneReplay:{mode,seasonId:scene.seasonId,floorId:String(floorId),side,event:event.event,stageId:event.stageId,level:event.level,
      hardLevelGroup:event.hardLevelGroup,eliteGroup:event.eliteGroup,enemyLineupComplete:true,enemyBehaviorRegistered:true,enemyBehaviorComplete,
      stageRulesComplete:false,sourceRules:structuredClone(scene.rules??[]),sourceMechanics:structuredClone(scene.stageMechanics??null),
      appliedRuleIds:[...compiled.appliedRuleIds],omittedRuleIds,partiallyAppliedMechanics,
      omittedRules,source:'abyss_wave_monsters'},
    description:`${mode==='moc'?'混沌回忆':mode==='pf'?'虚构叙事':'末日幻影'} ${scene.seasonId} · ${floorId} 第 ${side} 侧：逐波敌人、等级与面板取自场景源表；已应用 ${compiled.runtimeRules.length} 项可识别关卡规则。${omittedRules.join('；')}仍未完整模拟。`};
}
