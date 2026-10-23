import { buildMonster } from '../core/enemy.mjs';
const sceneStatusRes=(sceneEnemy,fallback)=>Number.isFinite(sceneEnemy?.statusRes)
  ? (sceneEnemy.statusRes>1?sceneEnemy.statusRes/100:sceneEnemy.statusRes)
  : fallback;
// abyss_wave_monsters keeps the template stance value and the battle's actual
// toughness as separate columns. In 4.6 they are commonly in a 3:1 ratio.
const sceneToughness=(sceneEnemy,stance)=>Number.isFinite(sceneEnemy?.toughness)&&sceneEnemy.toughness>0
  ? sceneEnemy.toughness : stance;
function buildSceneMonster(ctx,sceneEnemy,monsterId,childId,level){
  return buildMonster(ctx,{monsterId,childId,level,
    hardLevelGroup:sceneEnemy?.hardLevelGroup,eliteGroup:sceneEnemy?.eliteGroup});
}
const cacoHarmonyDreamTag='cacoHarmonyDream';
// 4014030 -> Pollux in the Anomaly season-10 pre:1 scene. The local SQLite
// skill table and AI index provide the sourced attack ratios, but the AI
// sequence and the Doom / sleep status formulas are not present locally.
export function polluxRemnant(ctx,{sceneEnemy=null,level=95,id='pollux-remnant-1'}={}){
  const childId=sceneEnemy?.childId??4014030;
  if(childId!==4014030)throw new Error('玻吕刻斯场景记录 childId 不匹配');
  level=sceneEnemy?.level??level;
  const m=buildSceneMonster(ctx,sceneEnemy,sceneEnemy?.monsterId??childId,childId,level);
  for(const k of ['hp','atk','def','speed','stance'])if(!Number.isFinite(m[k]))throw new Error('玻吕刻斯缺少 '+k+' 数据');
  const hp=sceneEnemy?.hp??m.hp,def=sceneEnemy?.def??m.def,speed=sceneEnemy?.speed??m.speed,stance=sceneEnemy?.stance??m.stance;
  for(const [k,v] of Object.entries({hp,def,speed,stance}))if(!Number.isFinite(v)||v<=0)throw new Error('玻吕刻斯场景 '+k+' 无效');
  const provenance=sceneEnemy?{source:'stage_monster + stage_wave + stage_hp',mode:'anomaly',seasonId:sceneEnemy.seasonId,
    floorId:sceneEnemy.floorId,wave:sceneEnemy.wave,stats:sceneEnemy._provenance}:m._provenance;
  return {id,name:sceneEnemy?.name??m.name,monsterId:childId,childId,side:'enemy',level,element:'Quantum',
    panel:{hp,atk:m.atk,def,speed,critRate:0,critDmg:0,effectRes:sceneStatusRes(sceneEnemy,m.statusRes),energyRegen:1,elemDmg:{},baseStats:{hp,atk:m.atk,def}},
    baseSpeed:speed,energy:0,energyMax:0,toughnessMax:sceneToughness(sceneEnemy,stance),weaknesses:sceneEnemy?.weakness??m.weakness,
    res:sceneEnemy?.res??m.res,standardBreak:true,rank:'elite',
    enemyKit:{id:childId,revision:'4.6-pollux-partial-1',aiPath:'Config/ConfigAI/Monster_W4_Pollux_00_AI.json',
      skill01Id:401403001,skill01Params:[3,.15,.5,1],skill02Id:401403002,skill02Params:[8,.1,.5,2],
      skill03Id:401403003,skill03Params:[.3],skill04Id:401403004,skill04Params:[1,3],
      skill05Id:401403005,skill05Params:[.05,1,1.2,11,.5,.9],skill06Id:401403006,
      skill06Params:[.3,.15,.5,1,2,1],passive01Id:401403007,passive01Params:[1,.6,.45,1,1,5],
      passive02Id:401403008,passive02Params:[.65,.5,1,.12,.9]},
    actions:{basic:{name:'未使用的基础攻击',type:'Normal',element:'Quantum',target:'single',terms:[],hitEnergy:0},
      skill01:{name:'沦殁者攫手挽留',type:'Normal',element:'Quantum',target:'single',terms:[{scaling:'atk',multiplier:3}],hitEnergy:5},
      skill02:{name:'长眠者厚土安葬',type:'Normal',element:'Quantum',target:'all',terms:[{scaling:'atk',multiplier:8}],
        hitShares:[1],shareDamageAcrossTargets:true,hitEnergy:5},
      skill03:{name:'辞世者临别哀悼',type:'Normal',element:'Quantum',target:'all',randomTargets:3,terms:[],hitEnergy:5},
      skill04:{name:'苦涩送来迟到的死讯',type:'Normal',element:null,target:'self',terms:[],hitEnergy:5},
      skill05:{name:'于痛苦的芬芳中死去',type:'Normal',element:'Quantum',target:'all',terms:[],hitEnergy:5},
      skill06:{name:'死亡想要更多的死亡',type:'Normal',element:'Quantum',target:'all',terms:[],hitEnergy:5}},
    policy:{autoUltimate:false},unsupported:[],
    enemyMechanicNotes:['本地 AI 索引 skillSequence 为空；当前演示轮转固定使用已确认的 Skill01，未将这个占位行为标成已还原。',
      'Skill01 / Skill02 对高于 50% 生命值的目标会转为【衰亡伤害】；无法从本地数据映射其结算数值、护盾穿透与条件切换，目前仅实现来源攻击倍率。',
      'Skill03 的 30% 衰亡伤害、Skill05 的不致命伤害 / 长眠、Skill06 的额外衰亡伤害 / 延后 / 纠缠，以及两个被动的濒死梦泡和特殊持续伤害均未实现。',
      'Skill04 强化并提前【哀悯长臂】行动；该召唤物不在 stage_monster 名单内，召唤体与行动提前实现缺失。'],
    provenance:{version:ctx.data._meta.version,source:'HSR_4.6.db + enemy_ai_4.6.json',stats:m._provenance,scene:provenance,
      ai:'Config/ConfigAI/Monster_W4_Pollux_00_AI.json',skills:[401403001,401403002,401403003,401403004,401403005,401403006,401403007,401403008],
      databaseSource:{monster:'monsters + monster_stats + monster_childs',skills:'monster_skills',encounter:'peak.stage + stage_wave + stage_monster + stage_hp'}}};
}

const joyAscendantBlissTag='joyAscendantBliss';
function anomalySceneEnemy(ctx,sceneEnemy,{id,childId,name,element,aiPath,revision,enemyKit,actions,notes}){
  if(sceneEnemy?.childId!==childId)throw new Error(`${name} 场景记录 childId 不匹配`);
  const level=sceneEnemy.level??95,m=buildSceneMonster(ctx,sceneEnemy,sceneEnemy.monsterId??childId,childId,level);
  for(const k of ['hp','atk','def','speed','stance'])if(!Number.isFinite(m[k]))throw new Error(`${name} 缺少 ${k} 数据`);
  const hp=sceneEnemy.hp??m.hp,atk=sceneEnemy.atk??m.atk,def=sceneEnemy.def??m.def,speed=sceneEnemy.speed??m.speed,
    stance=sceneEnemy.stance??m.stance;
  for(const [k,v] of Object.entries({hp,atk,def,speed,stance}))if(!Number.isFinite(v)||v<=0)throw new Error(`${name} 场景 ${k} 无效`);
  return {id,name:sceneEnemy.name??name,monsterId:childId,childId,side:'enemy',level,element,
    panel:{hp,atk,def,speed,critRate:0,critDmg:0,effectRes:sceneStatusRes(sceneEnemy,m.statusRes),energyRegen:1,elemDmg:{},baseStats:{hp,atk,def}},
    baseSpeed:speed,energy:0,energyMax:0,toughnessMax:sceneToughness(sceneEnemy,stance),
    weaknesses:sceneEnemy.weakness??m.weakness,res:sceneEnemy.res??m.res,standardBreak:true,
    rank:/minion|normal/i.test(String(sceneEnemy.rank??m.rank??'elite'))?'normal':'elite',
    enemyKit:{id:childId,revision,aiPath,...enemyKit},actions,
    policy:{autoUltimate:false},enemyMechanicNotes:notes,
    provenance:{version:ctx.data._meta.version,source:'HSR_4.6.db + TurnBasedGameData@312b4597691e0a29cf9828a15b592757dba86949',
      stats:m._provenance,scene:{source:'peak.stage + stage_wave + stage_monster + stage_hp',mode:sceneEnemy.mode,
        seasonId:sceneEnemy.seasonId,floorId:sceneEnemy.floorId,wave:sceneEnemy.wave},ai:aiPath,
      databaseSource:{monster:'monsters + monster_stats + monster_childs',skills:'monster_skills',
        encounter:'peak.stage + stage_wave + stage_monster + stage_hp'}}};
}

function pfSceneEnemy(ctx,sceneEnemy,{id,childId,name,element,aiPath,revision,enemyKit,actions,notes,rank='elite'}){
  if(sceneEnemy?.childId!==childId)throw new Error(`${name} 场景记录 childId 不匹配`);
  const level=sceneEnemy.level??85,m=buildSceneMonster(ctx,sceneEnemy,sceneEnemy.monsterId??childId,childId,level);
  for(const key of ['hp','atk','def','speed','stance'])if(!Number.isFinite(m[key]))throw new Error(`${name} 缺少 ${key} 数据`);
  const hp=sceneEnemy.hp??m.hp,atk=sceneEnemy.atk??m.atk,def=sceneEnemy.def??m.def,speed=sceneEnemy.speed??m.speed,
    stance=sceneEnemy.stance??m.stance;
  for(const [key,value] of Object.entries({hp,atk,def,speed,stance}))
    if(!Number.isFinite(value)||value<=0)throw new Error(`${name} 场景 ${key} 无效`);
  const provenance=sceneEnemy?{source:'abyss_wave_monsters',mode:sceneEnemy.mode,seasonId:sceneEnemy.seasonId,
    floorId:sceneEnemy.floorId,wave:sceneEnemy.wave,infiniteWaveId:sceneEnemy.infiniteWaveId,stats:sceneEnemy._provenance}:m._provenance;
  return {id,name:sceneEnemy.name??name,monsterId:childId,childId,side:'enemy',level,element,
    panel:{hp,atk,def,speed,critRate:0,critDmg:0,effectRes:sceneStatusRes(sceneEnemy,m.statusRes),energyRegen:1,elemDmg:{},baseStats:{hp,atk,def}},
    baseSpeed:speed,energy:0,energyMax:0,toughnessMax:sceneToughness(sceneEnemy,stance),
    weaknesses:sceneEnemy.weakness??m.weakness,res:sceneEnemy.res??m.res,standardBreak:true,rank,
    enemyKit:{id:childId,revision,aiPath,...enemyKit},actions,policy:{autoUltimate:false},enemyMechanicNotes:notes,
    provenance:{version:ctx.data._meta.version,source:'HSR_4.6.db + data/enemy_ai_4.6.json + TurnBasedGameData@312b4597691e0a29cf9828a15b592757dba86949',
      stats:m._provenance,scene:provenance,ai:aiPath,
      databaseSource:{monster:'monsters + monster_stats + monster_childs',skills:'monster_skills',
        encounter:'abyss_wave_monsters + abyss_events'}}};
}

// PF 2027 Sweet Gorilla (300302007). AIFlag and the 4.6 ability/config
// distinguish its single hit, four independently selected hits, conditional
// shield backlash, summon gate, and charge action.
export function sweetGorilla(ctx,{sceneEnemy=null,level=85,id='sweet-gorilla-1'}={}){
  const childId=sceneEnemy?.childId??300302007;
  if(childId!==300302007)throw new Error('惊梦剧团的甜猿泰山场景记录 childId 不匹配');
  level=sceneEnemy?.level??level;
  const summonSource={childId:3002030,monsterId:3002030,level,
    hardLevelGroup:sceneEnemy?.hardLevelGroup,eliteGroup:sceneEnemy?.eliteGroup,
    mode:sceneEnemy?.mode,seasonId:sceneEnemy?.seasonId,floorId:sceneEnemy?.floorId,
    wave:sceneEnemy?.wave,infiniteWaveId:sceneEnemy?.infiniteWaveId};
  const summonBlueprint=bubbleHound(ctx,{sceneEnemy:summonSource,id:id+':bubble-hound-template'});
  return pfSceneEnemy(ctx,sceneEnemy,{id,childId,name:'惊梦剧团的甜猿泰山',element:'Ice',rank:'elite',
    aiPath:'Config/ConfigAI/Monster_W2_Beast02_01_AI.json',revision:'4.6-sweet-gorilla-partial-1',
    enemyKit:{aiFlagCount:6,skill01Id:300302001,skill01Params:[3.8,.08,1.5,.2,2],
      skill02Id:300302002,skill02Params:[3.6,.08,1.5,.2,2],skill03Id:300302003,skill03Params:[.25,.75],
      skill04Id:300302004,summonCount:2,summonDelayRatios:[.25,.75],summonBlueprint,
      backlashMaxHpRatio:.08,backlashDefShred:.2,backlashChance:1,backlashDuration:2,
      chargeTag:'sweetGorillaCharge',
      sourceRef:'DimbreathBot/TurnBasedGameData@312b4597691e0a29cf9828a15b592757dba86949',
      sourceHashes:{ai:'6c4024b9a4e878e0a5250c5b9746891fba69ec62',
        ability:'0ab050dd55fa958b79c2f43bb69cbe46d1e7dbe1',character:'d3cf21c3f495fd83afc478d597a7aaea3effc496'}},
    actions:{basic:{name:'未使用的基础攻击',type:'Normal',element:'Ice',target:'single',terms:[],hitEnergy:0},
      skill01:{name:'限量赠饮',type:'Normal',element:'Ice',target:'single',terms:[{scaling:'atk',multiplier:3.8}],hitEnergy:10},
      skill02:{name:'无限畅饮',type:'Normal',element:'Ice',target:'single',randomHitTargets:true,repeatCount:4,
        terms:[{scaling:'atk',multiplier:3.6}],hitEnergy:10,hitEnergyPerHit:true},
      skill03:{name:'苏乐达派对',type:'Normal',element:null,target:'self',terms:[],hitEnergy:0},
      skill04:{name:'酬宾喷泉',type:'Normal',element:null,target:'self',terms:[],hitEnergy:0}},
    notes:['目标带盾时的 8% 自身最大生命冰伤与 20% 减防已接入；效果抵抗 / 触发概率采用源参数映射。',
      'Skill03 按场上人数条件召唤至多两只气泡锂犬，分别沿用源配置 0.25 / 0.75 行动延迟。',
      '关卡中外部施加 OneMore 的来源以及气泡锂犬 Servant 标记的全部清理边界仍未对拍。']});
}

// PF Alloy Nanny (5012120): the original Ability file encodes five hit shares
// totaling exactly 3x / 2x, and the AI alternates the two actions by AIFlag.
export function alloyNanny(ctx,{sceneEnemy=null,level=85,id='alloy-nanny-1'}={}){
  const childId=sceneEnemy?.childId??5012120;
  return pfSceneEnemy(ctx,sceneEnemy,{id,childId,name:'「合金保姆」',element:'Quantum',rank:'normal',
    aiPath:'Config/ConfigAI/Monster_W5_PamPart_00_AI.json',revision:'4.6-alloy-nanny-partial-1',
    enemyKit:{skill01Id:501212001,skill01Params:[3],skill02Id:501212002,skill02Params:[2,.5,2],
      passiveSkillId:501212003,passiveParams:[5],aiFlagCount:2,deathLaughter:5,
      skill01HitShares:[.2,.2,.2,.2,.2],skill02HitShares:[.2,.1,.1,.1,.5],
      skill02DefShred:.5,skill02Duration:2,
      sourceRef:'DimbreathBot/TurnBasedGameData@312b4597691e0a29cf9828a15b592757dba86949',
      sourceHashes:{ai:'508dfe72d4e0ff90dd573ff0918dcdc3ca19465f',
        ability:'9dfb688c8c79c540686d8f3c54bb774038b26353',character:'d3180414e0a7496960dc69eb58e2653d8b394ccc'}},
    actions:{basic:{name:'未使用的基础攻击',type:'Normal',element:'Quantum',target:'single',terms:[],hitEnergy:0},
      skill01:{name:'扫除',type:'Normal',element:'Quantum',target:'single',terms:[{scaling:'atk',multiplier:3}],
        hitShares:[.2,.2,.2,.2,.2],hitEnergy:10,hitEnergyPerHit:true},
      skill02:{name:'泼脏水',type:'Normal',element:'Quantum',target:'single',terms:[{scaling:'atk',multiplier:2}],
        hitShares:[.2,.1,.1,.1,.5],hitEnergy:10,hitEnergyPerHit:true}},
    notes:['已还原源 AI 两步交替、五段总倍率及 Skill02 的两回合 50% 减防。',
      'PassiveSkill01 的 5 点笑点死亡奖励已接入；帕姆王召唤的不可选中合金保姆实体及其 20 点充能移层尚未模拟。']});
}

// PF 2027/S2 Magical Girl Troupe (5012100). Its common three-skill AI uses
// the 2.8x, seven-hit Thunder attack; the passive switches Rain to Sun on an
// Elation skill or Elation hit, then selects a weather-specific deathrattle.
export function magicalGirlTroupe(ctx,{sceneEnemy=null,level=85,id='magical-girl-troupe-1'}={}){
  const childId=sceneEnemy?.childId??5012100;
  return pfSceneEnemy(ctx,sceneEnemy,{id,childId,name:'魔法少女急袭剧团',element:'Thunder',rank:'normal',
    aiPath:'Config/ConfigAI/Monster_Common_SequenceThree_AI.json',revision:'4.6-magical-girl-troupe-1',
    enemyKit:{skill01Id:501210001,skill01Params:[2.8],skill02Id:501210002,skill02Params:[1,2,1,.5],
      skill03Id:501210003,skill03Params:[.25,2],passiveSkillId:501210004,passiveParams:[1,2,.25],
      aiSequence:[501210001],aiFlagCount:1,
      elationActionDelay:1,transitionLaughter:2,sunnyCritDmg:.25,sunnyCritDuration:2,
      rainDeathHits:5,rainDeathMultiplier:1,rainShockChance:1,rainShockDuration:2,rainShockMultiplier:.5,
      sourceRef:'DimbreathBot/TurnBasedGameData@312b4597691e0a29cf9828a15b592757dba86949'},
    actions:{basic:{name:'未使用的基础攻击',type:'Normal',element:'Thunder',target:'single',terms:[],hitEnergy:0},
      skill01:{name:'恋爱❤雷暴天',type:'Normal',element:'Thunder',target:'single',terms:[{scaling:'atk',multiplier:2.8}],
        hitShares:[.1,.1,.1,.1,.1,.1,.4],hitEnergy:10,hitEnergyPerHit:true},
      skill02:{name:'柔雨❤好想你',type:'Normal',element:'Thunder',target:'all',randomHitTargets:true,repeatCount:5,
        terms:[{scaling:'atk',multiplier:1}],hitEnergy:10,hitEnergyPerHit:true},
      skill03:{name:'初吻❤天气晴',type:'Normal',element:null,target:'all',terms:[],hitEnergy:0}},
    notes:['普通行动按来源 AI 使用恋爱❤雷暴天：总计 2.8 倍攻击力，六段 10% 加末段 40%。',
      '雨天阵亡触发五次随机雷击，每次尝试施加 2 回合、攻击力 50% 的触电；晴天阵亡使我方全体暴伤提高 25%，持续 2 回合。',
      '雨转晴按被动参数延后 1 个标准行动量并获得 2 点笑点；数据库/能力配置确认了状态与触发，场景外的虚构叙事计分规则仍需另行核对。']});
}

// PF 2027/S2 Ichor Memosprite: Pheasant (4062010). The local monster data
// describes Sinblood Resonance and its same-species assist effect. The linked
// Turkey AI sequence points at a different monster skill ID, so turn priority
// remains an explicit approximation while the sourced actions are executable.
export function ichorPheasant(ctx,{sceneEnemy=null,level=85,id='ichor-pheasant-1'}={}){
  const childId=sceneEnemy?.childId??4062010;
  return pfSceneEnemy(ctx,sceneEnemy,{id,childId,name:'金血忆灵•雉形',element:'Imaginary',rank:'normal',
    aiPath:'Config/ConfigAI/Monster_W4_Turkey_00_AI.json',revision:'4.6-ichor-pheasant-partial-1',
    enemyKit:{skill01Id:406201001,skill01Params:[2.8,1.2],skill02Id:406201002,skill02Params:[],
      resonanceEffectId:240620101,aiSequence:[405201001],aiFlagCount:1,
      sourceRef:'DimbreathBot/TurnBasedGameData@312b4597691e0a29cf9828a15b592757dba86949'},
    actions:{basic:{name:'未使用的基础攻击',type:'Normal',element:'Imaginary',target:'single',terms:[],hitEnergy:0},
      skill01:{name:'罪血啄食',type:'Normal',element:'Imaginary',target:'single',terms:[{scaling:'atk',multiplier:2.8}],
        toughness:1.2,hitEnergy:10},
      skill02:{name:'罪血共鸣',type:'Normal',element:null,target:'self',terms:[],hitEnergy:0}},
    notes:['【罪血共鸣】会标记施放者与场上其他雉形；已按本地技能效果实现同伴攻击后的协同啄食。',
      'AI 路径索引为单步 405201001，与本体技能目录 406201001 / 406201002 不匹配；当前用“未共鸣先施放 Skill02，否则 Skill01”的可见回退，真实先后顺序仍需对拍。']});
}

// The Silvermane Cannoneer's local AI/skill index names the support action and
// its triggered follow-up. Target-selection predicates are summarized without
// their source operands, so the fallback target policy remains disclosed.
export function silvermaneCannoneer(ctx,{sceneEnemy=null,level=85,id='silvermane-cannoneer-1'}={}){
  const childId=sceneEnemy?.childId??1002030;
  return pfSceneEnemy(ctx,sceneEnemy,{id,childId,name:'银鬃炮手',element:'Physical',rank:'normal',
    aiPath:'Config/ConfigAI/Monster_W1_Soldier04_00_AI.json',revision:'4.6-silvermane-cannoneer-partial-1',
    enemyKit:{skill01Id:100203001,skill01Params:[1.3,1],skill02Id:100203002,skill02Params:[],
      skillP01Id:100203003,skillP01Params:[2.2,1.5],
      sourceRef:'DimbreathBot/TurnBasedGameData@312b4597691e0a29cf9828a15b592757dba86949'},
    actions:{basic:{name:'未使用的基础攻击',type:'Normal',element:'Physical',target:'single',terms:[],hitEnergy:0},
      skill01:{name:'炮击',type:'Normal',element:'Physical',target:'blast',terms:[{scaling:'atk',multiplier:1.3}],
        toughness:1,hitEnergy:10},
      skill02:{name:'掩护支援',type:'Normal',element:null,target:'ally',terms:[],hitEnergy:0},
      skill03:{name:'掩护支援 · 追加攻击',type:'Normal',element:'Physical',target:'blast',
        terms:[{scaling:'atk',multiplier:2.2}],toughness:1.5,hitEnergy:12}},
    notes:['Skill01 炮击按 1.3 倍物理扩散伤害实现；Skill02 标记一名同阵营目标，其攻击命中我方后由炮手施放 SkillP01 追加攻击。',
      'AI 索引的目标选择谓词缺少源数值 / 修改器实参，当前在没有有效支援对象时选择场上首位可支援同伴；冷却和目标并列规则仍未对拍。']});
}

// PF 20272/S1's Illumination Dragonfish uses the shared SequenceThree loop.
// Its ordinary attack spreads fire damage and can mark at most two opponents;
// its source-configured deathrattle detonates from the fish's own max HP.
export function illuminationDragonfish(ctx,{sceneEnemy=null,level=85,id='illumination-dragonfish-1'}={}){
  const childId=sceneEnemy?.childId??2012010;
  return pfSceneEnemy(ctx,sceneEnemy,{id,childId,name:'入魔机巧 · 灯昼龙鱼',element:'Fire',rank:'normal',
    aiPath:'Config/ConfigAI/Monster_Common_SequenceThree_AI.json',revision:'4.6-illumination-dragonfish-1',
    enemyKit:{skill01Id:201201001,skill01Params:[1.5,.8,.3,2],skillP01Id:201201002,
      skillP01Params:[.4,1,.3,2,30],defDownChance:.8,defDownRatio:.3,defDownDuration:2,
      deathDamageMaxHpRatio:.4,deathToughness:30,sourceRef:'DimbreathBot/TurnBasedGameData@312b4597691e0a29cf9828a15b592757dba86949',
      sourceHashes:{ai:'26aab40120a49b8b467ac4535f80e4381d9df0c1',
        ability:'bf3f4640ad410e0879a55c1349d5f23c39488589',character:'fcfbfe5cd7a83302bd776eb212b4724843ed9bb3'}},
    actions:{basic:{name:'未使用的基础攻击',type:'Normal',element:'Fire',target:'single',terms:[],hitEnergy:0},
      skill01:{name:'宵明',type:'Normal',element:'Fire',target:'all',terms:[{scaling:'atk',multiplier:1.5}],
        hitEnergy:5},
      skill02:{name:'烛花 · 死亡反击',type:'Normal',element:'Fire',target:'all',
        terms:[{scaling:'hp',multiplier:.4}],toughness:30,hitEnergy:0}},
    notes:[]});
}

// Mr. Domescreen alternates between two channels. The pinned AI decides from
// FlopSide / AIFlag; the hit callback's dynamic inversion hash is retained as
// a documented gap while its normal two-channel transition is simulated.
export function dreamjoltMrDomescreen(ctx,{sceneEnemy=null,level=85,id='dreamjolt-mr-domescreen-1'}={}){
  const childId=sceneEnemy?.childId??3002010;
  return pfSceneEnemy(ctx,sceneEnemy,{id,childId,name:'惊梦剧团的圆幕先生',element:'Quantum',rank:'normal',
    aiPath:'Config/ConfigAI/Monster_W3_TV_00_AI.json',revision:'4.6-dreamjolt-mr-domescreen-partial-1',
    enemyKit:{aiFlagInitial:0,flopSideInitial:-1,skill01Id:300201001,skill01Params:[.5],
      skill02Id:300201002,skill02Params:[1.6,.2],skill03Id:300201003,skill03Params:[],
      surpriseEnergyRatio:.5,shockDamageRatio:1.6,shockEnergyLossRatio:.2,flopDynamicHash:1675480356,
      sourceRef:'DimbreathBot/TurnBasedGameData@312b4597691e0a29cf9828a15b592757dba86949',
      sourceHashes:{ai:'889a25cecd829ecb84e394a5c240197670aef174',
        ability:'aad81dabef4b59b7ce486010877ec3eba4acb550',character:'13c09aed05aef9976cabe14f2e2a8393447d411d'}},
    actions:{basic:{name:'未使用的基础攻击',type:'Normal',element:'Quantum',target:'single',terms:[],hitEnergy:0},
      skill01:{name:'惊喜综艺',type:'Normal',element:null,target:'single',terms:[],hitEnergy:0},
      skill02:{name:'惊吓播报',type:'Normal',element:'Quantum',target:'all',
        terms:[{scaling:'atk',multiplier:1.6}],hitEnergy:0},
      skill03:{name:'频道切换',type:'Normal',element:null,target:'self',terms:[],hitEnergy:0}},
    notes:['受击翻转使用常态频道互换；Ability 的 FlopSide 动态哈希 1675480356 未解码，受控 / 击破强制惊吓频道分支按显式谓词处理。',
      '惊喜综艺按 50% 能量上限恢复实现，单体对象暂选能量比例最低者；源配置的目标并列规则与惊吓播报的基础受击回能未由本地表完整给出。',
      'PuzzleGamePassive 的相邻电视同频道锁血、插入行动、成就与战斗计分属于额外场景系统，当前未接入 PF actor。']});
}

// The Rusher's common SequenceThree route is a single 2x Wind attack. Its AI
// parameter index records the sourced Wind Shear chance, duration, per-layer
// multiplier and cap; the extra status config is not in the SQLite snapshot.
export function assistantGraffitiRusher(ctx,{sceneEnemy=null,level=85,id='assistant-graffiti-rusher-1'}={}){
  const childId=sceneEnemy?.childId??5012050;
  return pfSceneEnemy(ctx,sceneEnemy,{id,childId,name:'助手涂鸦•赶稿',element:'Wind',rank:'normal',
    aiPath:'Config/ConfigAI/Monster_Common_SequenceThree_AI.json',revision:'4.6-assistant-graffiti-rusher-partial-1',
    enemyKit:{skill01Id:501205001,skill01Params:[2,1,2,.5,5],passiveSkillId:501205002,
      windShearChance:1,windShearDuration:2,windShearDamagePerLayer:.5,windShearMaxLayers:5,
      sourceRef:'DimbreathBot/TurnBasedGameData@312b4597691e0a29cf9828a15b592757dba86949',
      sourceHashes:{ai:'26aab40120a49b8b467ac4535f80e4381d9df0c1'}},
    actions:{basic:{name:'未使用的基础攻击',type:'Normal',element:'Wind',target:'single',terms:[],hitEnergy:0},
      skill01:{name:'快！再快点！',type:'Normal',element:'Wind',target:'single',
        terms:[{scaling:'atk',multiplier:2}],hitEnergy:10}},
    notes:['按 AI 索引参数实现 2 倍风伤、基础概率 100% 的风化（2 回合、每层 0.5 倍攻击力、上限 5 层）；本地快照缺少该风化 modifier 的结算时点与覆盖细节，当前采用持有者回合开始结算、同来源叠层刷新。']});
}

// PF 20274/S1 Golden Hound (2022040). The common SequenceThree AI indexes a
// single Wind attack; its lethal passive remains an explicit partial gap.
export function abundanceSpriteGoldenHound(ctx,{sceneEnemy=null,level=85,id='abundance-sprite-golden-hound-1'}={}){
  const childId=sceneEnemy?.childId??2022040;
  return pfSceneEnemy(ctx,sceneEnemy,{id,childId,name:'丰饶灵兽•娄金',element:'Wind',rank:'normal',
    aiPath:'Config/ConfigAI/Monster_Common_SequenceThree_AI.json',revision:'4.6-abundance-golden-hound-partial-1',
    enemyKit:{skill01Id:202204001,skill01Params:[2.5],passiveSkillId:202204002,
      sourceRef:'DimbreathBot/TurnBasedGameData@312b4597691e0a29cf9828a15b592757dba86949',
      sourceHashes:{ai:'26aab40120a49b8b467ac4535f80e4381d9df0c1'}},
    actions:{basic:{name:'未使用的基础攻击',type:'Normal',element:'Wind',target:'single',terms:[],hitEnergy:0},
      skill01:{name:'角牴',type:'Normal',element:'Wind',target:'single',terms:[{scaling:'atk',multiplier:2.5}],hitEnergy:10}},
    notes:['已接入 2.5 倍风属性单体攻击与 10 点受击回能；被动「嗥吠」的致命攻击触发、相邻目标识别和行动提前尚未实现。']});
}

// PF 20273/S2 uses child 300305007 of the Present Inebriated in Revelry;
// MoC 1036 5510/S1 uses the base child 3003050. Both share the pinned AI
// (`Monster_W3_Figure_01_AI_Solo.json`, sha 641dbe79…) and the same ParamList,
// but their Ability / Character files differ (300305007 is the XP_Elite02_00
// build), so provenance hashes are chosen per child. The pinned Ability adds
// UseSnapshotEntity on both DoTs and a break branch that writes AIFlag=7.
export function presentInebriatedInRevelry(ctx,{sceneEnemy=null,level=85,id='present-inebriated-revelry-1'}={}){
  const childId=sceneEnemy?.childId??300305007;
  if(![3003050,300305007].includes(childId))throw new Error('「醉于盛会的此刻」场景记录 childId 不匹配');
  const moC=childId===3003050;
  const sourceHashes=moC
    ?{ai:'641dbe791b7b4ec068154d5bde8bbac7f38875bb',ability:'645274ac487217b5c615d9a98535d9224e38ee8d',
      character:'b53aae93903c5ed65d8e07dfee83f7fb1aee6364'}
    :{ai:'641dbe791b7b4ec068154d5bde8bbac7f38875bb',ability:'47f6941665c8379360df69e805ec7fec8d5e7cfc',
      character:'f9dfac13f7ca57f4728531335096e2da9d3cfaec'};
  return pfSceneEnemy(ctx,sceneEnemy,{id,childId,name:'「醉于盛会的此刻」',element:'Wind',rank:'elite',
    aiPath:'Config/ConfigAI/Monster_W3_Figure_01_AI_Solo.json',
    revision:moC?'4.6-present-inebriated-3003050-1':'4.6-present-inebriated-partial-1',
    enemyKit:{skill01Id:300305001,skill01Params:[1,2,1.2,3,3],skill02Id:300305002,skill02Params:[1,2,1.2],
      skill03Id:300305003,skill03Params:[1,2,1.2],skill04Id:300305004,skill04Params:[1,2,1.2],
      skill05Id:300305005,skill05Params:[1.25],skill06Id:300305006,skill07Id:300305007,
      skill07Params:[1.2,2,1.2],windDotModifierId:23003051,thunderDotModifierId:23003052,
      dotChance:1,dotDuration:2,dotMultiplier:1.2,dotMaxStacks:{wind:3,thunder:3},
      burstMultiplier:1.25,aiFlagCount:7,aiSequence:[],
      dotSnapshot:moC,dotPerTargetRoll:moC,breakAiFlag:moC?7:null,
      sourceRef:'DimbreathBot/TurnBasedGameData@312b4597691e0a29cf9828a15b592757dba86949',
      sourceHashes},
    actions:{basic:{name:'未使用的基础攻击',type:'Normal',element:'Wind',target:'single',terms:[],hitEnergy:0},
      skill01:{name:'为你倾流宝血',type:'Normal',element:'Wind',target:'single',terms:[],hitEnergy:5},
      skill02:{name:'为你摆设筵席',type:'Normal',element:'Wind',target:'all',terms:[],hitEnergy:10},
      skill03:{name:'未索引的被动动作',type:'Normal',element:'Wind',target:'self',terms:[],hitEnergy:0},
      skill04:{name:'使你福杯满溢',type:'Normal',element:'Wind',target:'all',terms:[],hitEnergy:10},
      skill05:{name:'为你洗去一切罪',type:'Normal',element:'Wind',target:'all',terms:[],hitEnergy:15},
      skill07:{name:'未索引的额外动作',type:'Normal',element:'Wind',target:'all',terms:[],hitEnergy:15}},
    policy:{autoUltimate:false},
    notes:['已按固定 AI 配置实现 Flag 1→2、Flag 2 的 OneMore / DOT 条件分支、蓄力后引爆，以及 Flag 4 / 6 / 7 已索引的动作边；Flag 6 / 7 的外部进入条件尚未定位。',
      '技能参数按 [基础概率,持续回合,每层攻击倍率] 接入两种可叠加 DoT；Skill01 参数末尾的 3/3 暂作两种 DoT 的层数上限。状态配置没有公开说明这两个末尾参数的含义，叠层上限需要实战 / 更底层配置复核。',
      'Skill05 按 1.25 倍立即结算我方当前普通 DoT 并清除；弱点击破时按来源 AI 条件复位主 AIFlag。Edict01/02/03 的反击插入、成功 / 失败惩罚、HP≤35% 的第二 AIFlag 与 Skill07 外部触发尚未映射。',
      ...(moC?['3003050 本体（Monster_W3_Figure_01_*）的两种 DoT 带 UseSnapshotEntity，按施放时攻击力结算，且 Skill02 的 50/50 属性选择是逐目标独立掷骰；Skill01 参数末尾的 3/3 作为两种 DoT 的层数上限（修饰器自声明 Poison=5 / Electric=1，与 AddModifier 传入的 3/3 冲突，取值未定）。',
        '被动 OnBeingBreak 会把 AIFlag 置 7（→Skill02→6→Skill01）；DotMark / DotMarkListener 的「DoT 全部消失且施法者非当前行动者时置 7」依赖引擎没有的 ByIsTurnActionEntity 谓词，未实现。Electric 的 DamageValue 哈希 958446518 不在 Character Config 中，疑似固定伤害，未接入。Config 没有 Skill03 / Skill06，库中的 300305003 / 300305006 是空名残留行，AI 不使用，未为它们编造动作。']:[])]});
}

// MoC 1036 5510/S1 「身陷樊笼的往昔」(3003030): 【使者带锁链】locks one random
// ally (Monster_W3_Figure_02_AimTarget, AimTargetCount=1) and starts a 4-layer
// 【蓄力】(IsAiming); every attack from an unmarked ally while aiming adds a mark
// (max 4). 【笼中传福音】then deals 15 / 锁定人数 x ATK Physical to each marked ally
// (extra effect 401301001 平均分摊) and clears the marks. A weakness break writes
// AIFlag=7, delays the boss by 0.5 and clears everything.
export function cagePast(ctx,{sceneEnemy=null,level=90,id='cage-past-1'}={}){
  const childId=sceneEnemy?.childId??3003030;
  if(childId!==3003030)throw new Error('「身陷樊笼的往昔」场景记录 childId 不匹配');
  level=sceneEnemy?.level??level;
  return pfSceneEnemy(ctx,sceneEnemy,{id,childId,name:'「身陷樊笼的往昔」',element:'Physical',rank:'elite',
    aiPath:'Config/ConfigAI/Monster_W3_Figure_02_AI_Solo.json',revision:'4.6-cage-past-1',
    enemyKit:{skill01Id:300303001,skill01Params:[3.6,0],skill03Id:300303002,skill03Params:[3,0],
      skill04Id:300303003,skill04Params:[],skill05Id:300303004,skill05Params:[15],
      skill06Id:300303006,skill07Id:300303007,skill07Params:[3],
      aimTargetModifier:'Monster_W3_Figure_02_AimTarget',aimingModifier:'Monster_W3_Figure_02_IsAiming',
      maxAimTargets:4,aimInitialLayers:4,breakAiFlag:7,breakDelayRatio:.5,
      skill05HitEnergy:15,skill05Toughness:15,shareDamageExtraId:401301001,
      sourceHashes:{ai:'fcf713f8ff11f06572987ef20089a16aa6838241',ability:'b6f859072be5f1e6652f7ffd1e44d195d7557359',
        character:'f41951771fd06e843c3395433d759559a0f852ba'}},
    actions:{basic:{name:'未使用的基础攻击',type:'Normal',element:'Physical',target:'single',terms:[],hitEnergy:0},
      skill01:{name:'鞭伤除净恶',type:'Normal',element:'Physical',target:'single',
        terms:[{scaling:'atk',multiplier:3.6}],hitEnergy:10,toughness:10},
      skill03:{name:'责打入人心',type:'Normal',element:'Physical',target:'blast',
        terms:[{scaling:'atk',multiplier:3},{scaling:'atk',multiplier:3,target:'adjacent'}],
        hitEnergy:10,toughness:10,adjacentToughness:10},
      skill04:{name:'使者带锁链',type:'Normal',element:null,target:'self',terms:[],hitEnergy:0},
      skill05:{name:'笼中传福音',type:'Normal',element:'Physical',target:'all',terms:[],hitEnergy:15},
      skill07:{name:'未索引的群体动作',type:'Normal',element:'Physical',target:'all',
        terms:[{scaling:'atk',multiplier:3}],hitEnergy:15,toughness:15}},
    notes:['AI 纯 AIFlag 驱动、无技能 CD：1→鞭伤除净恶（置 2）、2→责打入人心（置 3）、3→责打入人心（置 4）、4→持有 OneMore 时继续责打入人心（保持 4）否则使者带锁链（置 5）、5→笼中传福音（置 6）、6→鞭伤除净恶（置 1）、7→责打入人心（置 6）、10→未索引群体动作（置 1）。',
      '使者带锁链不造成伤害：MarkCount 复位后随机锁定 1 名我方（Monster_W3_Figure_02_AimTarget，RemoveWhenCasterDead），写入 AimTargetCount=1，并给自身挂 4 层 IsAiming。',
      '蓄力期间（IsAiming）每次被未锁定的我方攻击，按 IsAiming.OnAfterBeingAttacked 追加锁定攻击者并 +1 层；上限 4 人，自身已破韧（韧性 0）时不再追加。',
      '笼中传福音按 Skill05[0]=15 除以当前锁定人数，对每个被锁目标各结算一次物理伤害（命中回能 15、削韧 15），随后移除 IsAiming、全部 AimTarget 与 ChainMark1..4，并把 AimTargetCount 写回 1；除法与「平均分摊」对应 extra effect 401301001。',
      '弱点击破时 IsAiming.OnBeingBreak 把 AIFlag 置 7、行动延后 0.5、清除自身与全部锁定；被锁目标阵亡时按 AimTarget.OnDestroy 让计数 −1，归零则重新随机锁定 1 名，否则施法者 +1 层蓄力。',
      '未还原：Skill05 分母使用的动态哈希 -320093813 未在 Character Config 中声明（按 AimTargetCount 实现）；OneMore 没有任何 AddModifier 挂载点；AIFlag=10 → Skill07 缺少写入方；BreakController 依赖「HP 共享子目标」谓词，5510 两名精英各有独立 HP 行，是否满足无法从已下载文件确认；Config 的 Skill02 在 Ability 中全空且 AI 不使用；ChainMark1..4、MDF_DangerLevel 与 FireInHead 只有表现。']});
}

// MoC 1036 5512/S1 蚕食者之影 (800304016 / 模板 8003040): AIFlag 轮转
// 1→流年金刺、3→流年谴罚、4→黄金年代的绸缪（蓄力 EnergyLayer=9）、5→层数为 0 清空否则
// 9 发黄金年代的解放、6→流年谴罚；受击 −1 层，击破延后并复位旗标。技能命中按 20% 施加
// MCommon_Confine（1 回合、行动延后 50%），被动常驻 10% 全伤害减免。
export function devourerShadow(ctx,{sceneEnemy=null,level=95,id='devourer-shadow-1'}={}){
  const childId=sceneEnemy?.childId??800304016;
  if(childId!==800304016)throw new Error('蚕食者之影场景记录 childId 不匹配');
  level=sceneEnemy?.level??level;
  return pfSceneEnemy(ctx,sceneEnemy,{id,childId,name:'蚕食者之影',element:'Imaginary',rank:'elite',
    aiPath:'Config/ConfigAI/Monster_XP_Elite02_01_AI.json',revision:'4.6-devourer-shadow-1',
    enemyKit:{skill01Id:800304001,skill01Params:[],skill02Id:800304002,skill02Params:[3],
      skill03Id:800304003,skill03Params:[5],skill04Id:800304005,skill04Params:[2.25],
      skill05Id:800304004,skill05Params:[],skill06Id:800304007,skill06Params:[],
      passiveSkillId:800304006,passiveParams:[.1,.2,.5],
      energyChargeLayers:9,volleyCount:9,volleyMultiplier:2.25,confineChance:.2,confineDelayRatio:.5,
      damageReduce:.1,breakDelayRatio:.25,
      sourceHashes:{ai:'6157cae731e7dbcf33457793e50623dc5bf135d8',ability:'4ba3e2c9259bca78b636da5c13ed3afc11aa51a9',
        character:'7ac1e675c407e894b8a82c624a167ef615b453d7'}},
    actions:{basic:{name:'未使用的基础攻击',type:'Normal',element:'Imaginary',target:'single',terms:[],hitEnergy:0},
      skill01:{name:'未使用的自身动作',type:'Normal',element:null,target:'self',terms:[],hitEnergy:0},
      skill02:{name:'流年金刺',type:'Normal',element:'Imaginary',target:'single',
        terms:[{scaling:'atk',multiplier:3}],hitEnergy:10,toughness:10},
      skill03:{name:'流年谴罚',type:'Normal',element:'Imaginary',target:'single',
        terms:[{scaling:'atk',multiplier:5}],hitShares:[.5,.5],hitEnergy:15,hitEnergyPerHit:true,toughness:7.5},
      skill04:{name:'黄金年代的解放',type:'Normal',element:'Imaginary',target:'all',randomHitTargets:true,repeatCount:9,
        terms:[{scaling:'atk',multiplier:2.25}],hitEnergy:5,toughness:5},
      skill05:{name:'黄金年代的绸缪',type:'Normal',element:null,target:'self',terms:[],hitEnergy:0},
      skill06:{name:'黄金年代的解放 · 清空',type:'Normal',element:null,target:'self',terms:[],hitEnergy:0}},
    notes:['AI 为纯 AIFlag 轮转：1→流年金刺（置 3）、2→流年金刺（置 3）、3→流年谴罚（置 4）、4→黄金年代的绸缪（置 5）、5→EnergyLayer==0 时黄金年代的解放·清空（置 6）否则黄金年代的解放（置 6）、6→流年谴罚（置 1）。AIFlag 0/2/7 的写入方不在已下载文件中（2 只由未挂载的 Exhausted 写入，7 整支决策不可达）。',
      '黄金年代的绸缪把 EnergyLayer 置 9；黄金年代的解放按 Skill04[0]=2.25 结算 9 发投射物，并在开场把 AccelerateLayer 写成当时的 EnergyLayer、再把 EnergyLayer 置 -1；清空动作把 EnergyLayer 循环减到 -1。',
      'EnergyLayer 会在自身每次受击时 -1（OnAfterBeingAttacked，<=0 时不动作），因此击破前的攻击可以削减蓄力。',
      '流年金刺 / 流年谴罚每次命中按 PassiveSkill01[1]=0.2 的基础概率施加 MCommon_Confine（1 回合、行动延后 PassiveSkill01[2]=0.5），命中判定各段独立；被动同时常驻 Defender_AllDamageReduce=PassiveSkill01[0]=0.1。',
      '弱点击破：自身行动延后 0.25、移除蓄力特效、AIFlag ≤1→1 / 2..5→4 / >5→1，并把 EnergyLayer 减到 -1（RemoveEnergyLayer 在回合结束时自毁）。',
      '未还原：Accelerate 修饰器只有定义、没有任何 AddModifier，速度增益未生效；Shield / Fragile / Battle / Battle_02 / Skill04_Mark 为空壳；SkillP02 与 EnterBattleRage→SkillP01 没有挂载点，EnergyLayer 初值按 0 处理；9 发投射物在没有 Accelerate 时按随机我方结算（源为「该序列分派的目标」，分派表未给出）；全技能回能按 5 点整体结算，逐发分配口径未在源中明确；削韧按 monster_skills.sp_hit_base 推断。']});
}

// 5023010 · SQLite supplies the exact source parameters; the pinned AI JSON
// supplies its OneMore-dependent eight-flag action graph. Split spawns and
// same-species assist remain visible gaps rather than invented behavior.
export function joyAscendant(ctx,{sceneEnemy=null,level=95,id='joy-ascendant-1'}={}){
  return anomalySceneEnemy(ctx,sceneEnemy,{id,childId:5023010,name:'乐变化天人',element:'Wind',
    aiPath:'Config/ConfigAI/Monster_XP_Elite02_03_AI.json',revision:'4.6-joy-ascendant-partial-1',
    enemyKit:{aiFlagCount:8,skill01Id:502301001,skill01Params:[3.5],skill02Id:502301002,
      skill02Params:[3,.5,.35,.7],skill03Id:502301003,skill04Id:502301004,skill04Params:[5,.3,1],
      deathrattleId:502301005,blissTag:joyAscendantBlissTag,blissChance:.35,blissBasicRewardChance:.7,
      skill01Damage:3.5,skill02HitCount:3,skill02DamagePerHit:.5,skill02AssistDamage:.7,
      skill04Damage:5,skill04ActionDelay:.3,skill04SpLoss:1,
      sourceRef:'DimbreathBot/TurnBasedGameData@312b4597691e0a29cf9828a15b592757dba86949'},
    actions:{basic:{name:'未使用的基础攻击',type:'Normal',element:'Wind',target:'single',terms:[],hitEnergy:0},
      skill01:{name:'狂喜吐息',type:'Normal',element:'Wind',target:'single',terms:[{scaling:'atk',multiplier:3.5}],hitEnergy:10},
      skill02:{name:'欢乐笑语',type:'Normal',element:'Wind',target:'single',randomHitTargets:true,repeatCount:3,
        terms:[{scaling:'atk',multiplier:.5}],hitEnergy:5,hitEnergyPerHit:true},
      skill03:{name:'笑蕾',type:'Normal',element:null,target:'self',terms:[],hitEnergy:0},
      skill04:{name:'极乐螺旋',type:'Normal',element:'Wind',target:'all',terms:[{scaling:'atk',multiplier:5}],hitEnergy:10}},
    notes:['【欢乐笑语】对同场其他乐变化天人的协同攻击未接入；本关初始名单没有同类单位。',
      '【邪愿裂变】死亡分裂生成两级小怪及笑点奖励尚未接入。',
      'AI 的 OneMore 条件分支已按源配置实现；OneMore 的外部施加条件与关卡笑点规则仍未模拟。']});
}

// 5014020 · five-hit / four-hit / eleven-hit patterns are read from the
// pinned ability config, not flattened into one guessed total multiplier.
export function kingPomPom(ctx,{sceneEnemy=null,level=95,id='king-pom-pom-1'}={}){
  return anomalySceneEnemy(ctx,sceneEnemy,{id,childId:5014020,name:'合金机铠•帕姆王',element:'Quantum',
    aiPath:'Config/ConfigAI/Monster_W5_Pam_00_AI.json',revision:'4.6-king-pom-pom-partial-1',
    enemyKit:{skill01Id:501402001,skill01Params:[3,0],skill02Id:501402002,skill02Params:[3,3],
      skill03Id:501402003,skill03Params:[.3,2,.3,.1,2,.45],skill04Id:501402004,
      skill04Params:[1.5,1,.02,5,2,1],skill05Id:501402005,skill06Id:501402006,
      skill06Params:[5,8],skill08Id:501402008,aiGroups:{1:'Monster_W5_Pam_00_AI_Phase1',2:'Monster_W5_Pam_00_AI_Phase2'},
      sourceRef:'DimbreathBot/TurnBasedGameData@312b4597691e0a29cf9828a15b592757dba86949'},
    actions:{basic:{name:'未使用的基础攻击',type:'Normal',element:'Quantum',target:'single',terms:[],hitEnergy:0},
      skill01:{name:'灵魂修正剪',type:'Normal',element:'Quantum',target:'single',terms:[{scaling:'atk',multiplier:3}],hitEnergy:10},
      skill02:{name:'无死角洗涤',type:'Normal',element:'Quantum',target:'all',
        terms:[{scaling:'atk',multiplier:3}],hitShares:[.18,.18,.18,.18,.28],hitEnergy:10,hitEnergyPerHit:true},
      skill03:{name:'高温消毒模式',type:'Normal',element:null,target:'self',terms:[],hitEnergy:0},
      skill04:{name:'强效肥皂泡',type:'Normal',element:'Quantum',target:'all',
        terms:[{scaling:'atk',multiplier:1.5}],hitShares:[.2,.2,.2,.4],hitEnergy:10,hitEnergyPerHit:true},
      skill05:{name:'值日准备中…',type:'Normal',element:null,target:'self',terms:[],hitEnergy:0},
      skill06:{name:'饱和式大扫除！',type:'Normal',element:'Quantum',target:'all',
        terms:[{scaling:'atk',multiplier:5}],hitShares:[...Array(10).fill(.05),.5],hitEnergy:15,hitEnergyPerHit:true}},
    notes:['【高温消毒模式】的长效抗菌层数、受击削层、耗尽后退场承伤与回到常规阶段尚未建模。',
      '【值日准备中…】的弱点免疫、强制下一次行动与阶段内行动标记尚未接入。',
      '【劳动最快乐！】普攻真实伤害 / 战技返还战技点效果、笑点和小怪召唤尚未接入。',
      'AI 的 OneMore 分支可读；阶段切换事件未确认前不推定 Phase1/Phase2 的切换时点。']});
}

// PF 2027 King Pom-Pom (5014023) is a distinct Fantastic Story template. The
// pinned one-phase AI has eight AIFlag states; hit shares preserve the source
// total coefficients instead of multiplying them by their visual hit count.
export function kingPomPomFantasticStory(ctx,{sceneEnemy=null,level=85,id='king-pom-pom-fantastic-story-1'}={}){
  const childId=sceneEnemy?.childId??5014023;
  return pfSceneEnemy(ctx,sceneEnemy,{id,childId,name:'合金机铠•帕姆王',element:'Quantum',rank:'elite',
    aiPath:'Config/ConfigAI/Monster_W5_Pam_00_AI_FantasticStory.json',revision:'4.6-king-pom-pom-pf-partial-1',
    enemyKit:{aiFlagCount:8,skill01Id:501402301,skill01Params:[3,0],skill02Id:501402302,skill02Params:[3,3],
      skill03Id:501402303,skill03Params:[.3,2,.3,.1,2,.3],skill04Id:501402304,skill04Params:[1.5,1,.01,5,2,1],
      skill05Id:501402305,skill06Id:501402306,skill06Params:[5,8],passive01Id:501402308,
      passive01Params:[20,.55,0,10,.6,.8],skill02HitShares:[.18,.18,.18,.18,.28],
      skill04HitShares:[.2,.2,.2,.4],skill06HitShares:[...Array(10).fill(.05),.5],
      antibacterialLayers:2,antibacterialDamageReductionPerLayer:.3,steamBreakTrueDamageRatio:.3,
      nannyChargeThreshold:20,steamDamageBoost:.3,
      sourceRef:'DimbreathBot/TurnBasedGameData@312b4597691e0a29cf9828a15b592757dba86949',
      sourceHashes:{ai:'c79ea7533ecf5932e012f2b8acef4e860df4389b',
        ability:'54ddce8e7a356200f99ca646fbeb5f3f35d57e99',character:'a75cc4c4c6b1d2dab4f01297088397665c79c2e4'}},
    actions:{basic:{name:'未使用的基础攻击',type:'Normal',element:'Quantum',target:'single',terms:[],hitEnergy:0},
      skill01:{name:'灵魂修正剪',type:'Normal',element:'Quantum',target:'single',terms:[{scaling:'atk',multiplier:3}],hitEnergy:10},
      skill02:{name:'无死角洗涤',type:'Normal',element:'Quantum',target:'all',terms:[{scaling:'atk',multiplier:3}],
        hitShares:[.18,.18,.18,.18,.28],hitEnergy:10,hitEnergyPerHit:true},
      skill03:{name:'高温消毒模式',type:'Normal',element:null,target:'self',terms:[],hitEnergy:0},
      skill04:{name:'强效肥皂泡',type:'Normal',element:'Quantum',target:'all',terms:[{scaling:'atk',multiplier:1.5}],
        hitShares:[.2,.2,.2,.4],hitEnergy:10,hitEnergyPerHit:true},
      skill05:{name:'值日准备中…',type:'Normal',element:null,target:'self',terms:[],hitEnergy:0},
      skill06:{name:'饱和式大扫除！',type:'Normal',element:'Quantum',target:'all',terms:[{scaling:'atk',multiplier:5}],
        hitShares:[...Array(10).fill(.05),.5],hitEnergy:15,hitEnergyPerHit:true}},
    notes:['PF 专属 AI 单阶段八旗标循环及 OneMore 分支、技能段数与总倍率已按固定版本实现。',
      '已实现隐藏合金保姆的关联充能状态：每 20 点笑点移除一层抗菌，按每层 30% 减伤，清空后造成 30% 最大生命值真实伤害；不可选中单位暂用帕姆王资源表示。',
      '强效肥皂泡的【劳动最快乐！】普攻真实伤害 / 战技点返还和欢愉点的准确归属仍未完成。']});
}

// Moonlit Pegasus (402302001). The pinned source AI is a five-flag loop;
// marks and the locked-target multi-hit resolution are intentionally exposed
// as gaps until their full modifier callbacks are represented by the engine.
export function moonlitPegasus(ctx,{sceneEnemy=null,level=95,id='moonlit-pegasus-1'}={}){
  return anomalySceneEnemy(ctx,sceneEnemy,{id,childId:402302001,name:'月夜天马',element:'Quantum',
    aiPath:'Config/ConfigAI/Monster_W4_Unicorn_00_AI.json',revision:'4.6-moonlit-pegasus-partial-1',
    enemyKit:{aiFlagCount:5,skill01Id:402302001,skill01Params:[3],skill02Id:402302002,skill02Params:[2.6],
      skill03Id:402302003,skill04Id:402302004,skill04Params:[4.5],passive01Id:402302005,
      passive01Params:[40,1.5,.25],passive02Id:402302006,passive02Params:[1.2,1,.4,1,1.5],
      sourceRef:'DimbreathBot/TurnBasedGameData@312b4597691e0a29cf9828a15b592757dba86949'},
    actions:{basic:{name:'未使用的基础攻击',type:'Normal',element:'Quantum',target:'single',terms:[],hitEnergy:0},
      skill01:{name:'创造月光',type:'Normal',element:'Quantum',target:'single',terms:[{scaling:'atk',multiplier:3}],hitEnergy:5},
      skill02:{name:'三倍下弦月',type:'Normal',element:'Quantum',target:'sweep',sweepDirection:'right',
        terms:[{scaling:'atk',multiplier:2.6}],hitEnergy:10},
      skill03:{name:'两倍上弦月',type:'Normal',element:null,target:'self',terms:[],hitEnergy:0},
      skill04:{name:'六倍满月',type:'Normal',element:'Quantum',target:'single',terms:[{scaling:'atk',multiplier:4.5}],hitEnergy:20}},
    notes:['【欧洛尼斯印记】双层爆发、与另一类印记组合时的生命上限真实伤害 / 能量削减 / 纠缠尚未接入。',
      '【两倍上弦月】选定两名目标、【六倍满月】对锁定目标逐个结算的目标列表目前简化为一次单体命中。',
      'AI 五步旗标循环已复现；被动印记互斥、击破与终结技清印分支尚未实现。']});
}

// Lighthouse (8033020). Its first AI branch summons allies when the enemy
// team has fewer than five members; those summoned forms and their callbacks
// are not rostered in stage_monster and are kept as an explicit gap.
export function lighthouse(ctx,{sceneEnemy=null,level=95,id='lighthouse-1'}={}){
  return anomalySceneEnemy(ctx,sceneEnemy,{id,childId:8033020,name:'「灯塔」',element:'Physical',
    aiPath:'Config/ConfigAI/Monster_W4_Claymore_04_AI.json',revision:'4.6-lighthouse-partial-1',
    enemyKit:{aiFlagCount:7,skill01Id:803302001,skill01Params:[2,1],skill02Id:803302002,
      skill02Params:[0,.2,.6,1],skill03Id:803302003,skill03Params:[12,1],
      skill04Id:803302004,skill04Params:[3.6,.2,.5],passive01Id:803302005,
      passive01Params:[.05,0,1,2,.5],summonCountBySource:4,
      sourceRef:'DimbreathBot/TurnBasedGameData@312b4597691e0a29cf9828a15b592757dba86949'},
    actions:{basic:{name:'未使用的基础攻击',type:'Normal',element:'Physical',target:'single',terms:[],hitEnergy:0},
      skill01:{name:'源 Skill01',type:'Normal',element:'Physical',target:'blast',
        terms:[{scaling:'atk',multiplier:2},{scaling:'atk',multiplier:1,target:'adjacent'}],hitEnergy:15,hitEnergyPerHit:true},
      skill02:{name:'召唤「灯塔」同伴',type:'Normal',element:null,target:'self',terms:[],hitEnergy:0},
      skill03:{name:'守护誓约',type:'Normal',element:null,target:'self',terms:[],hitEnergy:0},
      skill04:{name:'源 Skill04',type:'Normal',element:'Physical',target:'all',repeatCount:5,
        terms:[{scaling:'atk',multiplier:3.6}],hitEnergy:15,hitEnergyPerHit:true}},
    notes:['Skill02 源脚本会依我方队伍人数召唤多个同伴；子单位不在 stage_monster 名单中，召唤与其行动 / 标记回调尚未接入。',
      'Skill03 的弱点保护、充能与【誓约】状态尚未连接至击破 / 阶段逻辑。',
      'Skill04 的五次攻击调用按原 Ability 结构逐次结算；[0.2,0.5] 条件附加公式尚未解析。',
      'Skill01 / Skill02 / OneMore / Skill03 / Skill04 的源 AIFlag 分支已编码；关卡专属得分与隐藏阶段规则尚未实现。']});
}

// Dark Sun Gryphon (4033030). Its MoC 4.6 actor and sourced attacks are
// database-backed. The erode/renewal state machine and summoned bow follow-ups
// stay explicit gaps until their modifier callbacks are represented.
export function darkSunGryphon(ctx,{sceneEnemy=null,level=95,id='dark-sun-gryphon-1'}={}){
  return anomalySceneEnemy(ctx,sceneEnemy,{id,childId:4033030,name:'黑日狮鹫',element:'Wind',
    aiPath:'Config/ConfigAI/Monster_W4_Griffin_01_AI.json',revision:'4.6-dark-sun-gryphon-partial-1',
    enemyKit:{aiFlagCount:5,skill01Id:403303001,skill01Params:[3,.5,.2,0,.5],
      skill02Id:403303002,skill02Params:[.7,.8,.12],skill03Id:403303003,
      skill04Id:403303004,skill04Params:[4.5,1],bowSummonId:403205002,
      erosionModifierId:240320101,
      sourceRef:'DimbreathBot/TurnBasedGameData@312b4597691e0a29cf9828a15b592757dba86949'},
    actions:{basic:{name:'未使用的基础攻击',type:'Normal',element:'Wind',target:'single',terms:[],hitEnergy:0},
      skill01:{name:'黑光透射',type:'Normal',element:'Wind',target:'all',terms:[{scaling:'atk',multiplier:3}],hitEnergy:10},
      skill02:{name:'永夜颁示',type:'Normal',element:null,target:'self',terms:[],hitEnergy:0},
      skill03:{name:'日蚀预言',type:'Normal',element:null,target:'self',terms:[],hitEnergy:0},
      skill04:{name:'热寂颂歌',type:'Normal',element:'Wind',target:'all',terms:[{scaling:'atk',multiplier:4.5}],hitEnergy:10}},
    notes:['【侵蚀】和【焕新】的生命值转化、回复、移除及下次攻击强化尚未还原；Skill01 / Skill04 目前只结算数据库倍率。',
      '【永夜颁示】应召唤黑日弓手，并按场上队伍人数决定后续 AI 分支；弓手数量、生命值与被击杀后狮鹫损失生命值的精确关联尚未接入。',
      '黑日弓手在狮鹫攻击后施放【恶潮飞矢】且不会主动行动；此跟攻击与弓手自身【侵蚀】回调尚未接入。',
      'AI 的五旗标主循环已实现；OneMore 的来源状态及击破中断 / 复位回调仍缺少执行器映射。']});
}

// Fictional Ensemble (8003060) is a wave controller, not a selectable combat
// target. Its source character config applies AttachEntityUnselectable and a
// MuteSpeed behavior flag; the source wave list still includes it in the field
// cap and its destroy callback clears the remaining team.
export function fictionalEnsemble(ctx,{sceneEnemy=null,level=95,id='fictional-ensemble-1'}={}){
  const childId=sceneEnemy?.childId??8003060;
  if(childId!==8003060)throw new Error('虚构集合体场景记录 childId 不匹配');
  level=sceneEnemy?.level??level;
  const m=buildSceneMonster(ctx,sceneEnemy,sceneEnemy?.monsterId??childId,childId,level);
  const hp=sceneEnemy?.hp??m.hp,atk=sceneEnemy?.atk??m.atk,def=sceneEnemy?.def??m.def,
    speed=sceneEnemy?.speed??m.speed;
  for(const [k,v] of Object.entries({hp,atk,def,speed}))if(!Number.isFinite(v)||v<=0)throw new Error('虚构集合体场景 '+k+' 无效');
  return {id,name:sceneEnemy?.name??'虚构集合体',monsterId:childId,childId,side:'enemy',level,element:'Fire',
    panel:{hp,atk,def,speed,critRate:0,critDmg:0,effectRes:sceneStatusRes(sceneEnemy,m.statusRes),energyRegen:1,elemDmg:{},baseStats:{hp,atk,def}},
    baseSpeed:speed,energy:0,energyMax:0,toughnessMax:0,weaknesses:[],res:sceneEnemy?.res??m.res,
    standardBreak:false,rank:'elite',unselectable:true,noAction:true,
    enemyKit:{id:childId,revision:'4.6-fictional-ensemble-controller-1',aiPath:'Config/ConfigAI/Monster_Common_SequenceThree_AI.json',
      aiSequence:[800306001],monsterRank:'Elite',waveController:true,unselectable:true,noAction:true,
      sourceRef:'DimbreathBot/TurnBasedGameData@312b4597691e0a29cf9828a15b592757dba86949'},
    actions:{basic:{name:'无可选普攻',type:'Normal',element:'Fire',target:'self',terms:[],hitEnergy:0},
      skill01:{name:'姿态破坏响应',type:'Normal',element:'Fire',target:'self',terms:[],hitEnergy:10}},
    policy:{autoUltimate:false},enemyMechanicNotes:[
      '该实体由波次配置列入场上人数，但源配置将其设为不可选取且静音速度；引擎已按无行动波次控制体处理。',
      '源 MonsterGroup 的 HPParentChild 聚合显示、子单位销毁扣除组 HP 的动态比例，以及被高阶敌人击败时的计分 / 清场回调尚未完整映射。'],
    provenance:{version:ctx.data._meta.version,source:'HSR_4.6.db + TurnBasedGameData@312b4597691e0a29cf9828a15b592757dba86949',
      stats:m._provenance,scene:{source:'abyss_wave_monsters + abyss_events.waves_json',mode:sceneEnemy?.mode,
        seasonId:sceneEnemy?.seasonId,floorId:sceneEnemy?.floorId,wave:sceneEnemy?.wave},
      ai:'Config/ConfigAI/Monster_Common_SequenceThree_AI.json',
      ability:'Config/ConfigAbility/Monster/Monster_XP_MonsterGroup_00_Ability.json'}};
}

// Tide-Eroded Blade (4032010). The local AI index sources a one-skill common
// sequence and the SQLite skill row confirms the 3.5x / 2.4x blast attack.
export function blackTideBlade(ctx,{sceneEnemy=null,level=90,id='black-tide-blade-1'}={}){
  return anomalySceneEnemy(ctx,sceneEnemy,{id,childId:4032010,name:'黑潮蚀刃',element:'Physical',
    aiPath:'Config/ConfigAI/Monster_Common_SequenceThree_AI.json',revision:'4.6-black-tide-blade-partial-1',
    enemyKit:{skill01Id:403201001,skill01Params:[3.5,2.4],passiveSkillId:403201002,
      passiveParams:[.5,.2,0,.5],erosionModifierId:240320101,aiSequence:[403201001],
      sourceRef:'DimbreathBot/TurnBasedGameData@312b4597691e0a29cf9828a15b592757dba86949'},
    actions:{basic:{name:'未使用的基础攻击',type:'Normal',element:'Physical',target:'single',terms:[],hitEnergy:0},
      skill01:{name:'破灭的锋芒',type:'Normal',element:'Physical',target:'blast',
        terms:[{scaling:'atk',multiplier:3.5},{scaling:'atk',multiplier:2.4,target:'adjacent'}],hitEnergy:10}},
    notes:['被动【末路既定】会使攻击伤害对应的生命损失转为【侵蚀】；转换比例、延迟回复及【焕新】效果未从本地参数映射，未臆造结算。']});
}

// Black Tide's Corroded Axe (4032030). Monster_W2_Valkyrie01_02_AI / _Ability
// 给出两个决策：AIFlag=1 → Skill01，AIFlag=2 → 先置 1 再放 Skill02。Skill02 的
// DamagePercentage 是 Skill02[0] / TargetCount（TargetCount 由
// SetDynamicValueByCharacterCount 统计存活我方），即 14.0 倍伤害由全体平均分摊，
// ExtraEffectIDList 的 401301001 就是「平均分摊」说明。被动【仇隙】用
// Flag_RevengeTrigger 状态机实现：任一其他敌方单位被消灭时，最多随机选中 1 把
// Flag=0 且未被击破 / 控制 / 禁行动的黑潮蚀斧，置 Flag=1、AIFlag=2、行动延后 0，
// 其余蚀斧置 Flag=2；Skill02 结算后把所有蚀斧的 Flag 清回 0。
export function blackTideAxe(ctx,{sceneEnemy=null,level=85,id='black-tide-axe-1'}={}){
  const childId=sceneEnemy?.childId??4032030;
  if(![4032030,403203001,403203002].includes(childId))throw new Error('黑潮蚀斧场景记录 childId 不匹配');
  const baseChild=4032030;
  level=sceneEnemy?.level??level;
  const m=buildSceneMonster(ctx,sceneEnemy,sceneEnemy?.monsterId??4032030,childId,level);
  for(const k of ['hp','atk','def','speed','stance'])if(!Number.isFinite(m[k]))throw new Error('黑潮蚀斧缺少 '+k+' 数据');
  const hp=sceneEnemy?.hp??m.hp,def=sceneEnemy?.def??m.def,speed=sceneEnemy?.speed??m.speed,stance=sceneEnemy?.stance??m.stance;
  for(const [k,v] of Object.entries({hp,def,speed,stance}))if(!Number.isFinite(v)||v<=0)throw new Error('黑潮蚀斧场景 '+k+' 无效');
  return pfSceneEnemy(ctx,sceneEnemy,{id,childId,name:'黑潮蚀斧',element:'Fire',rank:'normal',
    aiPath:'Config/ConfigAI/Monster_W2_Valkyrie01_02_AI.json',revision:'4.6-black-tide-axe-1',
    enemyKit:{baseChildId:baseChild,skill01Id:403203001,skill01Params:[3],skill02Id:403203002,
      skill02Params:[14],passiveSkillId:403203003,averageShareExtraEffectId:401301001,
      revengeFlagKey:'Flag_RevengeTrigger',
      sourceRef:'DimbreathBot/TurnBasedGameData@312b4597691e0a29cf9828a15b592757dba86949',
      sourceHashes:{ai:'7e526de81bbc8790819047841f52e49fb8c401a1',
        ability:'6b28f5a2def147e64c2848fbf11a76da32126376'}},
    actions:{basic:{name:'未使用的基础攻击',type:'Normal',element:'Fire',target:'single',terms:[],hitEnergy:0},
      skill01:{name:'怒潮炽斧',type:'Normal',element:'Fire',target:'single',
        terms:[{scaling:'atk',multiplier:3}],hitEnergy:10},
      skill02:{name:'仇心忿火',type:'Normal',element:'Fire',target:'all',
        terms:[{scaling:'atk',multiplier:14}],shareDamageAcrossTargets:true,hitEnergy:10}},
    notes:['AI 只有 AIFlag=1 → 怒潮炽斧、AIFlag=2 → 仇心忿火两个决策；仇心忿火结算前把自身 AIFlag 写回 1。',
      '仇心忿火按 14.0 / 存活我方人数结算到每个目标（SetDynamicValueByCharacterCount 的 TargetCount），即全队平均分摊 14.0 倍攻击力的火伤。',
      '【仇隙】只在其他敌方单位（含召唤物）被消灭时触发：每次死亡事件最多随机选中 1 把处于 Flag=0、且未被击破 / 控制 / 禁行动的蚀斧，令其行动延后 0 并立即施放仇心忿火；未能行动的蚀斧置 Flag=2，仇心忿火结算后全部清回 0。创建时若已有蚀斧处于 Flag=1，则新蚀斧初始化为 Flag=2。',
      '本地 MonsterSkillConfig / Ability 没有给出技能削韧值，动作按 0 削韧处理；401301001 在 extra_json 中是「平均分摊」说明而非独立追加伤害，故仇心忿火没有额外段数。'],
    provenance:{version:ctx.data._meta.version,source:'HSR_4.6.db + data/enemy_ai_4.6.json + DimbreathBot/TurnBasedGameData@312b4597691e0a29cf9828a15b592757dba86949',
      stats:m._provenance,scene:{source:'abyss_wave_monsters',mode:sceneEnemy?.mode,seasonId:sceneEnemy?.seasonId,
        floorId:sceneEnemy?.floorId,wave:sceneEnemy?.wave,infiniteWaveId:sceneEnemy?.infiniteWaveId},
      ai:'Config/ConfigAI/Monster_W2_Valkyrie01_02_AI.json',
      ability:'Config/ConfigAbility/Monster/Monster_W2_Valkyrie01_02_Ability.json',
      sourceHashes:{ai:'7e526de81bbc8790819047841f52e49fb8c401a1',
        ability:'6b28f5a2def147e64c2848fbf11a76da32126376'}}});
}


// Furiae Praetor / 天谴先锋 (401301201, template 4013012, FantasticStory). AI:
// Monster_W4_Claymore_00_AI_FantasticStory（AIFlag 1→Skill01、2→Skill02、3→Skill01、
// 4→持 OneMore 时 Skill02 / 否则移除 OneMorePerTurn 并 Skill03、5→Skill04）。
// Ability 的 Skill01/02_Phase02 分别对「左侧起 / 右侧起」3 个连续目标各结算一次
// Skill01[0] = 2.8 倍虚数伤害；Skill04_Phase02 对 AllEnemy 结算
// (Skill04[0] + Skill04[2] × SummonCount) / TargetCount，再按
// Skill04[1] / TargetCount 施加 LifeTime = Skill04[3] 的易伤，并给自身补 OneMorePerTurn。
// FantasticStory 变体没有召唤技能，SummonCount 恒为 0。
// 被动 401301205 的 MMonster_Heaven_StoneShieldController 是【战甲】：6 层，每层
// 10% 全伤害减免；受到攻击 -1 层；1 层时被攻击触发破甲（5% 最大生命虚数自伤 +
// 行动延后 0.2 + 破坏者恢复 15% 能量上限），0 层期间受击追加 1.5% 最大生命虚数伤害，
// 自身回合结束恢复满层。
export function furiaePraetor(ctx,{sceneEnemy=null,level=85,id='furiae-praetor-1'}={}){
  const childId=sceneEnemy?.childId??401301201;
  if(![401301201,4013012].includes(childId))throw new Error('天谴先锋场景记录 childId 不匹配');
  level=sceneEnemy?.level??level;
  return pfSceneEnemy(ctx,sceneEnemy,{id,childId,name:'天谴先锋',element:'Imaginary',rank:'elite',
    aiPath:'Config/ConfigAI/Monster_W4_Claymore_00_AI_FantasticStory.json',
    revision:'4.6-furiae-praetor-fantastic-story-1',
    enemyKit:{baseChildId:401301201,templateId:4013012,skill01Id:401301201,skill01Params:[2.8],
      skill02Id:401301202,skill02Params:[2.8],skill03Id:401301203,skill03Params:[],
      skill04Id:401301204,skill04Params:[12,1.2,4,2],passiveSkillId:401301205,
      passiveParams:[6,.2,.1,.015,.15,.05],averageShareExtraEffectId:401301001,
      armorMaxLayers:6,armorDamageResistance:.1,armorCrackedDelay:.2,armorCrackedDamage:.05,
      armorCrackedDamageAfter:.015,armorBreakEnergyRatio:.15,summonCount:0,
      aiFlagKey:'AIFlag',oneMorePerTurnModifier:'OneMorePerTurn',
      sourceRef:'DimbreathBot/TurnBasedGameData@312b4597691e0a29cf9828a15b592757dba86949',
      sourceHashes:{ai:'f8ffacff194eea6f67d10d9ac60b720377af299d',
        ability:'6dd705d2b18d5a03b82395ec1063a708029befbb',
        character:'2326dcb65a9e7677506e965199527c14fe52464a',
        fantasticStoryCharacter:'a459c3b44d3c5d9c5599b8b4a3adf4acbb93dcbc'}},
    actions:{basic:{name:'未使用的基础攻击',type:'Normal',element:'Imaginary',target:'single',terms:[],hitEnergy:0},
      skill01:{name:'从天帷斩向黎明',type:'Normal',element:'Imaginary',target:'sweep',sweepDirection:'left',
        terms:[{scaling:'atk',multiplier:2.8}],hitEnergy:10},
      skill02:{name:'从黎明杀往天帷',type:'Normal',element:'Imaginary',target:'sweep',sweepDirection:'right',
        terms:[{scaling:'atk',multiplier:2.8}],hitEnergy:10},
      skill03:{name:'像威猛暴怒的雄狮',type:'Normal',element:null,target:'self',terms:[],hitEnergy:0},
      skill04:{name:'在滔滔血海中沉溺',type:'Normal',element:'Imaginary',target:'all',
        terms:[{scaling:'atk',multiplier:12}],shareDamageAcrossTargets:true,hitEnergy:20}},
    notes:['AI 按 AIFlag 轮转：1→从天帷斩向黎明(2)、2→从黎明杀往天帷(3)、3→从天帷斩向黎明(4)、4→持追加行动时继续从黎明杀往天帷（旗标不变）/ 否则置 5 并移除 OneMorePerTurn 后进入蓄力、5→在滔滔血海中沉溺(1)。被动在战斗开始时授予 OneMorePerTurn，Skill04 结算后重新授予。',
      '在滔滔血海中沉溺把 (Skill04[0] + Skill04[2] × SummonCount) / TargetCount 平均分摊给全体我方，并按 Skill04[1] / TargetCount 施加 2 回合易伤；FantasticStory 变体没有召唤技能，SummonCount 恒为 0，故为 12.0 / 人数。',
      '【战甲】初值 6 层，每层 10% 全伤害减免；受到攻击后 -1 层；1 层时被攻击触发破甲（自身承受 5% 最大生命虚数伤害、行动延后 0.2、破坏者恢复 15% 能量上限），0 层期间每次受击追加 1.5% 最大生命虚数伤害，自身回合结束恢复满层。',
      '明确未还原：MMonster_W4_Claymore_00_FantasticStory / MMonster_Common_MuteHitFly 的视觉与命中表现、W4_Claymore_00_BattleScore1~3 记事（虚构叙事计分）、MMonster_Heaven_ModelController_Claymore_FantasticStory 的模型切换，以及模板 4013013 的召唤分支（场景不使用）；战甲减伤按「层数 × 10%」线性接入，Ability 的 StackProperty 叠层细节未做逐帧复刻。']});
}

// Noontide Gryphon / 正阳狮鹫 (template 4023010; the scenes use 402301001 in
// 混沌回忆 and 402301002 in 虚构叙事). AI: flag 1 → Skill01 (2), 2 → Skill02
// (3), 3 → Skill01 (4), 4 → Skill03 (5), 5 → Skill04 (1). PassiveSkillInitiate
// grants OneMorePerTurn, so a natural turn normally resolves two flags; Skill03
// consumes it and only a weakness break restores it. Skill01 is a 3.0x Fire
// single hit; Skill02 sweeps three allies from the left for 2.6x each, kills the
// previous summons and calls four 4022010 流星铁鹰; Skill03 picks one random
// ally that already carries 【艾格勒印记】(or a random ally) and locks it for
// Skill04; Skill04 hits that ally for 4.0x and its neighbours for 3.0x three
// times. Skill02 / Skill04 then add one 【艾格勒印记】 layer. At two layers the
// mark detonates: 1.5x ATK Fire, -40 energy, and every mark is cleared. Killing
// any enemy removes one ally's mark, preferring the killer.
export function noontideGryphon(ctx,{sceneEnemy=null,level=90,id='noontide-gryphon-1'}={}){
  const childId=sceneEnemy?.childId??402301001;
  if(![402301001,402301002].includes(childId))throw new Error('正阳狮鹫场景记录 childId 不匹配');
  level=sceneEnemy?.level??level;
  // 召唤体沿用本场景的难度分组与星级缩放，保证与同场景 4022010 记表面板一致。
  const summonSource=sceneEnemy?{childId:4022010,monsterId:4022010,level,hardLevelGroup:sceneEnemy.hardLevelGroup,
    eliteGroup:sceneEnemy.eliteGroup,mode:sceneEnemy.mode,seasonId:sceneEnemy.seasonId,
    floorId:sceneEnemy.floorId,wave:sceneEnemy.wave,infiniteWaveId:sceneEnemy.infiniteWaveId}:null;
  const summonBlueprint=meteoricEagle(ctx,{sceneEnemy:summonSource,level,id:id+':meteoric-eagle-template'});
  return pfSceneEnemy(ctx,sceneEnemy,{id,childId,name:'正阳狮鹫',element:'Fire',rank:'elite',
    aiPath:'Config/ConfigAI/Monster_W4_Griffin_00_AI.json',revision:'4.6-noontide-gryphon-1',
    enemyKit:{baseChildId:402301001,templateId:4023010,skill01Id:402301001,skill01Params:[3],
      skill02Id:402301002,skill02Params:[2.6,.5,.8,1.1,1.5],skill03Id:402301003,skill03Params:[],
      skill04Id:402301004,skill04Params:[4,3],passiveSkillId:402301005,passiveParams:[40,1.5,.25],
      mixedPassiveSkillId:402301006,mixedParams:[1.2,1,.4,1,1.5],summonMonsterId:4022010,
      summonCount:4,summonDelayRatios:[.5,.8,1.1,1.5],summonBlueprint,markMaxLayers:2,
      markEnergyCost:40,markDamageMultiplier:1.5,mixedLoseHpRatio:.25,markResolveOnKill:true,
      mixedEntangle:{chance:1.2,lifetime:1,actionDelayRatio:.4,damagePercentage:1},
      aiFlagKey:'AIFlag',oneMorePerTurnModifier:'OneMorePerTurn',
      sourceRef:'DimbreathBot/TurnBasedGameData@312b4597691e0a29cf9828a15b592757dba86949',
      sourceHashes:{ai:'40607dc1dbf1a02ddcbb60d903b0dbbc327b3955',
        ability:'e0951a0b4af86e28cf291a9b1ff848c0e1e51acd',character:'360f2c1c733a68d262cb84309d44bbf4b40187da'}},
    actions:{basic:{name:'未使用的基础攻击',type:'Normal',element:'Fire',target:'single',terms:[],hitEnergy:0},
      skill01:{name:'穿透黑暗',type:'Normal',element:'Fire',target:'single',terms:[{scaling:'atk',multiplier:3}],hitEnergy:5},
      skill02:{name:'降示黎明',type:'Normal',element:'Fire',target:'sweep',sweepDirection:'left',
        terms:[{scaling:'atk',multiplier:2.6}],hitEnergy:10},
      skill03:{name:'点亮未来',type:'Normal',element:null,target:'self',terms:[],hitEnergy:0},
      skill04:{name:'赞美艾格勒',type:'Normal',element:'Fire',target:'blast',repeatCount:3,
        terms:[{scaling:'atk',multiplier:4},{scaling:'atk',multiplier:3,target:'adjacent'}],hitEnergy:20}},
    notes:['AI 按 AIFlag 轮转：1→穿透黑暗(2)、2→降示黎明(3)、3→穿透黑暗(4)、4→点亮未来(5)、5→赞美艾格勒(1)。PassiveSkillInitiate 在战斗开始授予 OneMorePerTurn，因此一个自然回合通常连续结算两个旗标；点亮未来会移除 OneMorePerTurn，只有弱点击破会按 MMonster_W4_Griffin_00_Status 重新授予（2→1、4→3、5→1，并清除 SignOnAvatar 与 UltraReady）。',
      '降示黎明对左侧起 3 个连续目标各结算 2.6 倍火伤，随后 ForceKill 自身旧召唤物并按 Skill02[1..4] = 0.5 / 0.8 / 1.1 / 1.5 的行动条延迟召唤 4 只 4022010 流星铁鹰；本次实现沿用 4022010 已登记的 AI 与技能。',
      '点亮未来优先锁定 1 名已持有【艾格勒印记】的我方（无印记时改为随机 1 名），写入 SignOnAvatar；赞美艾格勒对锁定目标结算 4.0 倍、相邻目标 3.0 倍，共 3 轮，随后为目标与相邻单位各叠加 1 层【艾格勒印记】并清除全部 SignOnAvatar。',
      '【艾格勒印记】叠加至 2 层时爆发：消耗 40 点能量（P01[0]）、造成 1.5 倍攻击力火伤（P01[1]），并清除全部印记。按 MMonster_W4_Griffin_00_Debuff_Avatar_Status 的 OnTriggerDeath，我方消灭任意敌方目标后解除 1 名我方的印记：优先解除造成致命伤害的目标，该目标无印记时随机解除 1 名持有印记的我方；解除次数写入 W4_Griffin_00_Debuff_Resolve（上限 3）。目标已持有【欧洛尼斯印记】时改为组合结算，且在叠加第 1 层时立即触发（层数 < 2 且持有【欧洛尼斯印记】即进入组合分支）：25% 最大生命真实伤害 + 40 点能量削减 + 纠缠（P02[0..4] = 1.2 / 1 / 0.4 / 1 / 1.5），并同时移除两种印记。',
      '明确未还原：AddModifier 前的 ByCheckCustomValueBool Key.Hash 64603667 门控（本地无法把该自定义布尔映射到具体关卡 / 变体，因此【灼烧】分支未接入）；Monster_W4_Griffin_00_NoSummon 同样没有本地取值，召唤分支按常态执行；【欧洛尼斯印记】的施加端仍未由月夜天马实现，组合印记分支当前不可达；召唤体沿用 4022010 的等级 / 难度分组数据库面板，波次表的 group 加成（spawnCount / infinite_param）未叠加；纠缠的每回合持续伤害结算、BattleScore 记事与所有视觉表现均未复刻。']});
}

// explicit mechanics gap until its original status callbacks are mapped.
export function godDevourerOffspring(ctx,{sceneEnemy=null,level=90,id='god-devourer-offspring-1'}={}){
  return anomalySceneEnemy(ctx,sceneEnemy,{id,childId:5023020,name:'吞神子嗣',element:'Fire',
    aiPath:'Config/ConfigAI/Monster_W5_Eater_00_AI.json',revision:'4.6-god-devourer-partial-1',
    enemyKit:{skill01Id:502302001,skill01Params:[2,.8,.2,1],skill02Id:502302002,
      skill02Params:[.5,1,1000,6,.5],skill03Id:502302003,skill03Params:[.5,3],
      skill04Id:502302004,skill04Params:[2.4],passiveSkillId:502302005,
      aiSequence:[],sourceRef:'DimbreathBot/TurnBasedGameData@312b4597691e0a29cf9828a15b592757dba86949'},
    actions:{basic:{name:'未使用的基础攻击',type:'Normal',element:'Fire',target:'single',terms:[],hitEnergy:0},
      skill01:{name:'暴食祭',type:'Normal',element:'Fire',target:'single',terms:[{scaling:'atk',multiplier:2}],hitEnergy:10},
      skill02:{name:'生贽的饱食',type:'Normal',element:null,target:'single',terms:[],hitEnergy:0},
      skill03:{name:'赎愆祭',type:'Normal',element:null,target:'self',terms:[],hitEnergy:0},
      skill04:{name:'群兽的飨宴',type:'Normal',element:'Fire',target:'all',terms:[{scaling:'atk',multiplier:2.4}],hitEnergy:5}},
    notes:['本地 AI 索引 skillSequence 为空；演示行动固定使用来源明确的 Skill01「暴食祭」，未声称该轮转已还原。',
      '「暴食祭」描述有高概率降低目标防御；本地参数没有给出足以确认减防数值、持续时间与抗性结算的映射，尚未施加该状态。',
      '「生贽的饱食」会施加【吞噬】、降低可回复生命上限并夺取目标攻击力；状态数值、叠加 / 替换和持续时机仍未实现。',
      '「神圣反刍」的受击计数、每次攻击返还攻击力与恢复上限、弱点击破解除【吞噬】及「赎愆祭」解除后加攻均未实现。']});
}

// Abundance Sprite: Wooden Lupus (202205004). Its common sequence and attack
// are indexed locally; the summon description is known, but the Shadow's
// lifetime / action kit is not part of the scene roster and remains explicit.
export function woodenLupus(ctx,{sceneEnemy=null,level=85,id='wooden-lupus-1'}={}){
  return anomalySceneEnemy(ctx,sceneEnemy,{id,childId:202205004,name:'丰饶灵兽•奎木',element:'Thunder',
    aiPath:'Config/ConfigAI/Monster_Common_SequenceThree_AI.json',revision:'4.6-wooden-lupus-partial-1',
    enemyKit:{skill01Id:202205001,skill01Params:[2,1.5,3],skill02Id:202205002,skill02Params:[.8],
      passiveSkillId:202205003,aiSequence:[202205001],sourceRef:'DimbreathBot/TurnBasedGameData@312b4597691e0a29cf9828a15b592757dba86949'},
    actions:{basic:{name:'未使用的基础攻击',type:'Normal',element:'Thunder',target:'single',terms:[],hitEnergy:0},
      skill01:{name:'狼餐',type:'Normal',element:'Thunder',target:'single',terms:[{scaling:'atk',multiplier:2}],hitEnergy:10},
      skill02:{name:'啸聚',type:'Normal',element:null,target:'self',terms:[],hitEnergy:0}},
    notes:['「狼餐」来源倍率为 2 倍雷伤；描述确认高概率触电，但本地 AI 参数没有足够字段可确认触电基础概率与结算，因此当前只接入伤害。',
      '「啸聚」来源描述为召唤与自身当前生命值相同的【狈影】；召唤体未列入场景名单，血量同步、行动规则与离场条件未实现。']});
}

// Yabuli (503401002). SQLite and the 4.6 AI index expose source ratios and
// status descriptions, but the original Ability file is absent at the pinned
// upstream path; phase/Barrier/embryo transitions therefore remain explicit.
export function yabuli(ctx,{sceneEnemy=null,level=95,id='yabuli-1'}={}){
  return anomalySceneEnemy(ctx,sceneEnemy,{id,childId:503401002,name:'堕神之血•亚婆离',element:'Quantum',
    aiPath:'Config/ConfigAI/Monster_W5_Fallen_00_AI.json',revision:'4.6-yabuli-partial-1',
    enemyKit:{skill01Id:503401001,skill01Params:[5],skill02Id:503401002,skill02Params:[1.8],
      skill03Id:503401003,skill03Params:[.1,2,.04,5],skill04Id:503401004,skill04Params:[5,.1],
      passive01Id:503401005,passive01Params:[.08,.7,.65,.75,.35,2,.3,.1,.05,66],
      passive02Id:503401006,passive02Params:[.7,.65,.75,.35,1,.5,.3,.05,.025,40],
      passive03Id:503401007,passive03Params:[3,2,3,.02],passive04Id:503401008,passive04Params:[.3,.2,.98,1],
      sourceRef:'HSR_4.6.db + enemy_ai_4.6.json'},
    actions:{basic:{name:'未使用的基础攻击',type:'Normal',element:'Quantum',target:'single',terms:[],hitEnergy:0},
      skill01:{name:'猎食标记',type:'Normal',element:'Quantum',target:'single',terms:[{scaling:'atk',multiplier:5}],hitEnergy:10},
      skill02:{name:'饥饿的鸣响',type:'Normal',element:'Quantum',target:'all',terms:[{scaling:'atk',multiplier:1.8}],hitEnergy:10},
      skill03:{name:'宏观生态系统',type:'Normal',element:null,target:'self',terms:[],hitEnergy:0},
      skill04:{name:'万物于我之中',type:'Normal',element:'Quantum',target:'all',terms:[{scaling:'atk',multiplier:5}],hitEnergy:20}},
    notes:['【堕神衰腐】叠层阈值 / 幻身离场替换、全队幻身失败条件与狂兽胚芽行动未实现。',
      '【血脑屏障】阈值、减伤 / 锁韧、稳态失衡充能和破盾反伤未实现。',
      'Skill04 仅接入 5 倍基础伤害；0.1 附加倍率与【源质吞噬】生命上限封锁未接入。',
      'AI skillSequence 为空且原 Ability JSON 在固定来源未找到；当前 Skill01 仅作可见占位，行为完整度保持 false。']});
}

// 3003040 -> Monster_W3_Figure_00. Its local scene row supplies the actual
// level-scaled panel; enemy_ai_4.6.json and monster_skills supply the six-step
// AI cycle and the dream status parameters.
export function cacoHarmony(ctx,{sceneEnemy=null,level=90,id='caco-harmony-1'}={}){
  const childId=sceneEnemy?.childId??3003040;
  if(childId!==3003040)throw new Error('同音共律的来日场景记录 childId 不匹配');
  level=sceneEnemy?.level??level;
  const m=buildSceneMonster(ctx,sceneEnemy,sceneEnemy?.monsterId??3003040,childId,level);
  for(const k of ['hp','atk','def','speed','stance'])if(!Number.isFinite(m[k]))throw new Error('同音共律的来日缺少 '+k+' 数据');
  const hp=sceneEnemy?.hp??m.hp,def=sceneEnemy?.def??m.def,speed=sceneEnemy?.speed??m.speed,stance=sceneEnemy?.stance??m.stance;
  for(const [k,v] of Object.entries({hp,def,speed,stance}))if(!Number.isFinite(v)||v<=0)throw new Error('同音共律的来日场景 '+k+' 无效');
  const provenance=sceneEnemy?{source:'abyss_wave_monsters',mode:sceneEnemy.mode,seasonId:sceneEnemy.seasonId,
    floorId:sceneEnemy.floorId,wave:sceneEnemy.wave,stats:sceneEnemy._provenance}:m._provenance;
  const dream=(chance)=>({type:'buff',name:'异梦',key:'vuln',value:.5,duration:2,chance,debuff:true,
    control:'sleep',healAtTurnStartRatio:.35,removeOnAttacked:true,tickAt:'end',tag:cacoHarmonyDreamTag,id:'cacoHarmony:异梦'});
  return {id,name:sceneEnemy?.name??m.name,monsterId:3003040,childId,side:'enemy',level,element:'Imaginary',
    panel:{hp,atk:m.atk,def,speed,critRate:0,critDmg:0,effectRes:sceneStatusRes(sceneEnemy,m.statusRes),energyRegen:1,elemDmg:{},baseStats:{hp,atk:m.atk,def}},
    baseSpeed:speed,energy:0,energyMax:0,toughnessMax:sceneToughness(sceneEnemy,stance),weaknesses:sceneEnemy?.weakness??m.weakness,
    res:sceneEnemy?.res??m.res,standardBreak:true,rank:'elite',
    enemyKit:{id:3003040,revision:'4.6-caco-harmony-1',aiPath:'Config/ConfigAI/Monster_W3_Figure_00_AI_Solo.json',
      skill01Id:300304001,skill01Params:[3],skill02Id:300304002,skill02Params:[1.2,2,.5,.35],
      skill03Id:300304003,skill03Params:[4.2],skill04Id:300304004,skill05Id:300304005,skill05Params:[.5,.5,2],
      dreamModifierId:23025011,dreamHealRatio:.35,dreamVulnerability:.5,dreamDuration:2,aiFlagCount:6,
      sourceHashes:{ai:'ecfac291aa9775495b32c0eda74dafc3b284c2a1',character:'13b183110614c8c431bfa6b6a6bed78b055ef64d',
        ability:'cdc854401fdfd00c1ffb784778503bead75446ae'}},
    actions:{basic:{name:'未使用的基础攻击',type:'Normal',element:'Imaginary',target:'single',terms:[],hitEnergy:0},
      skill01:{name:'光华射',type:'Normal',element:'Imaginary',target:'single',terms:[{scaling:'atk',multiplier:3}],hitEnergy:5,hitEnergyPerHit:true},
      skill02:{name:'万暗中',type:'Normal',element:null,target:'single',terms:[],hitEnergy:10,
        effects:[dream(1.2)]},
      skill03:{name:'救赎恩典',type:'Normal',element:'Imaginary',target:'single',terms:[{scaling:'atk',multiplier:4.2}],hitEnergy:15,hitEnergyPerHit:true},
      skill04:{name:'圣善夜',type:'Normal',element:null,target:'self',terms:[],hitEnergy:10,
        effects:[{type:'buff',name:'蓄力',key:'dmgBoost',value:0,duration:2,target:'self',tickAt:'end',removeOnBreak:true,tag:'cacoHarmonyCharge'}]},
      skill05:{name:'静享天赐安眠',type:'Normal',element:null,target:'all',terms:[],hitEnergy:15,
        effects:[dream(.5)]}},
    policy:{autoUltimate:false},unsupported:[],
    enemyMechanicNotes:['Skill07 在本地 AI 索引中没有阶段且不属于六步常规 AI 轮转；未知的外部触发未纳入常规场景。',
      '同一异梦状态筛选出多个或没有目标时，当前按编队首个匹配目标处理；数据库未记录并列顺序与空集回退。'],
    provenance:{version:ctx.data._meta.version,source:'HSR_4.6.db + enemy_ai_4.6.json',stats:m._provenance,scene:provenance,
      ai:'Config/ConfigAI/Monster_W3_Figure_00_AI_Solo.json',character:'Config/ConfigCharacter/Monster/Monster_W3_Figure_00_Config.json',
      ability:'Config/ConfigAbility/Monster/Monster_W3_Figure_00_Ability.json',sourceHashes:{
        ai:'ecfac291aa9775495b32c0eda74dafc3b284c2a1',character:'13b183110614c8c431bfa6b6a6bed78b055ef64d',
        ability:'cdc854401fdfd00c1ffb784778503bead75446ae'}}};
}
// 4053020 -> Monster_W4_Unicorn_01. The local skill table gives the attack
// descriptions and exact single/AoE ratios; the AI index has no normal
// skillSequence, so its multi-step rotation and the incubated summon timing
// remain explicitly approximate until the underlying AI script is available.
export function cyclonicSwarmMother(ctx,{sceneEnemy=null,level=90,id='cyclonic-swarm-mother-1'}={}){
  const childId=sceneEnemy?.childId??4053020;
  if(childId!==4053020)throw new Error('飓风大母场景记录 childId 不匹配');
  level=sceneEnemy?.level??level;
  const m=buildSceneMonster(ctx,sceneEnemy,sceneEnemy?.monsterId??4053020,childId,level);
  for(const k of ['hp','atk','def','speed','stance'])if(!Number.isFinite(m[k]))throw new Error('飓风大母缺少 '+k+' 数据');
  const hp=sceneEnemy?.hp??m.hp,def=sceneEnemy?.def??m.def,speed=sceneEnemy?.speed??m.speed,stance=sceneEnemy?.stance??m.stance;
  for(const [k,v] of Object.entries({hp,def,speed,stance}))if(!Number.isFinite(v)||v<=0)throw new Error('飓风大母场景 '+k+' 无效');
  const provenance=sceneEnemy?{source:'abyss_wave_monsters',mode:sceneEnemy.mode,seasonId:sceneEnemy.seasonId,
    floorId:sceneEnemy.floorId,wave:sceneEnemy.wave,stats:sceneEnemy._provenance}:m._provenance;
  return {id,name:sceneEnemy?.name??m.name,monsterId:4053020,childId,side:'enemy',level,element:'Quantum',
    panel:{hp,atk:m.atk,def,speed,critRate:0,critDmg:0,effectRes:sceneStatusRes(sceneEnemy,m.statusRes),energyRegen:1,elemDmg:{},baseStats:{hp,atk:m.atk,def}},
    baseSpeed:speed,energy:0,energyMax:0,toughnessMax:sceneToughness(sceneEnemy,stance),weaknesses:sceneEnemy?.weakness??m.weakness,
    res:sceneEnemy?.res??m.res,standardBreak:true,rank:'elite',
    enemyKit:{id:4053020,revision:'4.6-cyclonic-swarm-mother-partial-1',aiPath:'Config/ConfigAI/Monster_W4_Unicorn_01_AI.json',
      skill01Id:405302001,skill01Params:[3.5],skill02Id:405302002,skill02Params:[3],
      skill03Id:405302003,skill03Params:[.25,.5,.1,4,.05,.3,.3],skill04Id:405302004,skill04Params:[4.2],
      skill05Id:405302005,passiveSkillId:405302006,passiveParams:[4,2],broodlingMonsterId:4052020,nurseryDamageReduction:.25},
    actions:{basic:{name:'未使用的基础攻击',type:'Normal',element:'Quantum',target:'single',terms:[],hitEnergy:0},
      skill01:{name:'唾弃深渊的黑',type:'Normal',element:'Quantum',target:'single',terms:[{scaling:'atk',multiplier:3.5}],hitEnergy:10},
      skill02:{name:'啼哭落在岸上',type:'Normal',element:'Quantum',target:'blast',terms:[{scaling:'atk',multiplier:3}],hitEnergy:10},
      skill03:{name:'风雨雷的妊娠',type:'Normal',element:null,target:'self',terms:[],hitEnergy:0},
      skill04:{name:'雨自初生便落坠',type:'Normal',element:'Quantum',target:'all',terms:[{scaling:'atk',multiplier:4.2}],hitEnergy:10},
      skill05:{name:'洪潮浪的分娩',type:'Normal',element:null,target:'self',terms:[],hitEnergy:0}},
    policy:{autoUltimate:false},unsupported:[],
    enemyMechanicNotes:['本地 AI 索引的 skillSequence 为空；技能阶段顺序目前按本地技能描述近似驱动，不能视为已对拍。',
      '【洪潮浪的分娩】会召唤泡影稚子并附加【风眼巢】；泡影稚子的战斗 AI / 技能倍率及召唤行动条时机不在本地 AI 索引中，当前只保留技能条目，不生成虚构小怪。',
      '【请泊舟暂歇】按本地被动参数复现受击计数行动提前；孵育期间由提前触发的扣血、召唤与孵化行动延后尚未接入。'],
    provenance:{version:ctx.data._meta.version,source:'HSR_4.6.db + enemy_ai_4.6.json',stats:m._provenance,scene:provenance,
      ai:'Config/ConfigAI/Monster_W4_Unicorn_01_AI.json',skills:[405302001,405302002,405302003,405302004,405302005,405302006],
      databaseSource:{monster:'monsters + monster_stats + monster_childs',skills:'monster_skills',encounter:'abyss_wave_monsters'}}};
}
// The two Dawn Corps variants share an AI/status contract; only the element
// and resistance profile differ. Source params support their attack ratios,
// force-field immunity/stance lock, matching-element action advance, and
// breakaway vulnerability. AI skillSequence is empty, so rotation is partial.
export function dawnCorpsRanger(ctx,{sceneEnemy=null,level=90,id='dawn-corps-ranger-1'}={}){
  const childId=sceneEnemy?.childId??5013060;
  const baseId=sceneEnemy?.monsterId??([5013040,5013050,5013060,5013070].includes(childId)?childId:Math.floor(childId/100));
  if(![5013040,5013050,5013060,5013070].includes(baseId)||
    (childId!==baseId&&Math.floor(childId/100)!==baseId))throw new Error('破晓战队场景记录 monsterId / childId 不匹配');
  level=sceneEnemy?.level??level;
  const m=buildSceneMonster(ctx,sceneEnemy,baseId,childId,level);
  for(const k of ['hp','atk','def','speed','stance'])if(!Number.isFinite(m[k]))throw new Error('破晓战队缺少 '+k+' 数据');
  const hp=sceneEnemy?.hp??m.hp,def=sceneEnemy?.def??m.def,speed=sceneEnemy?.speed??m.speed,stance=sceneEnemy?.stance??m.stance;
  for(const [k,v] of Object.entries({hp,def,speed,stance}))if(!Number.isFinite(v)||v<=0)throw new Error('破晓战队场景 '+k+' 无效');
  const variant={5013040:{element:'Quantum',label:'苍翼'},5013050:{element:'Fire',label:'赤焰'},
    5013060:{element:'Imaginary',label:'曙光'},
    5013070:{element:'Physical',label:'灰烬'}}[baseId];
  const {element,label}=variant,skillId=n=>baseId*100+n;
  const provenance=sceneEnemy?{source:'abyss_wave_monsters',mode:sceneEnemy.mode,seasonId:sceneEnemy.seasonId,
    floorId:sceneEnemy.floorId,wave:sceneEnemy.wave,stats:sceneEnemy._provenance}:m._provenance;
  return {id,name:sceneEnemy?.name??m.name,monsterId:baseId,childId,side:'enemy',level,element,
    panel:{hp,atk:m.atk,def,speed,critRate:0,critDmg:0,effectRes:sceneStatusRes(sceneEnemy,m.statusRes),energyRegen:1,elemDmg:{},baseStats:{hp,atk:m.atk,def}},
    baseSpeed:speed,energy:0,energyMax:0,toughnessMax:sceneToughness(sceneEnemy,stance),weaknesses:sceneEnemy?.weakness??m.weakness,
    res:sceneEnemy?.res??m.res,standardBreak:true,rank:'elite',
    enemyKit:{id:baseId,revision:'4.6-dawn-corps-partial-1',aiPath:'Config/ConfigAI/Monster_W5_Ranger_00_AI.json',
      faction:'dawnCorps',variant:label,element,skill01Id:skillId(1),skill01Params:[4],
      skill02Id:skillId(2),skill02Params:[6,3,.15,60,1],
      skill03Id:skillId(3),skill03Params:[7,1],skill04Id:skillId(4),skill04Params:[8],
      skill05Id:skillId(5),skill05Params:[.3,.4,2],fieldAttackThreshold:7,
      fieldDamageTakenIncrease:.3,fieldElementResReduction:.4,fieldDebuffDuration:2,
      controlImmuneTag:'dawnCorpsForceField',toughnessImmuneTag:'dawnCorpsForceField',
      sourceParams:{skill02:[6,3,.15,60,1],skill03:[7,1],skill05:[.3,.4,2]}},
    actions:{basic:{name:'未使用的基础攻击',type:'Normal',element,target:'single',terms:[],hitEnergy:0},
      skill01:{name:'破晓战刃',type:'Normal',element,target:'single',terms:[{scaling:'atk',multiplier:4}],hitEnergy:10},
      skill02:{name:'破晓飞轮',type:'Normal',element,target:'blast',terms:[{scaling:'atk',multiplier:6},{scaling:'atk',multiplier:3,target:'adjacent'}],hitEnergy:5},
      skill03:{name:'破晓意志',type:'Normal',element:null,target:'self',terms:[],hitEnergy:0},
      skill04:{name:'破晓剑影舞',type:'Normal',element,target:'single',terms:[{scaling:'atk',multiplier:8}],hitEnergy:10},
      skill05:{name:'破晓退散',type:'Normal',element:null,target:'self',terms:[],hitEnergy:10}},
    policy:{autoUltimate:false},unsupported:[],
    enemyMechanicNotes:[`本地 AI 索引 skillSequence 为空；${label}的普通技能起手与循环目前按技能可用状态近似驱动。`,
      '将 Skill03 参数 [7,1] 的首值映射为力场受击阈值 7；本地描述确认存在阈值，但未说明该参数与计数的直接对应关系。',
      'Skill02 参数中倍率以外的 [0.15,60,1] 尚未能从本地说明映射到额外效果；未加入猜测效果。'],
    provenance:{version:ctx.data._meta.version,source:'HSR_4.6.db + enemy_ai_4.6.json',stats:m._provenance,scene:provenance,
      ai:'Config/ConfigAI/Monster_W5_Ranger_00_AI.json',skills:[1,2,3,4,5].map(skillId),
      databaseSource:{monster:'monsters + monster_stats + monster_childs',skills:'monster_skills',encounter:'abyss_wave_monsters'}}};
}
// 3024030 -> Monster_W3_Sam_01. The local SQLite snapshot has source panels,
// nine named skills, and AI decision candidates/parameter vectors, but no
// summon template for 3025030 and no predicate mappings. Keep the sourced
// attacks executable while leaving the reproduction state and AI incomplete.
export function swarmNightmare(ctx,{sceneEnemy=null,level=90,id='swarm-nightmare-1'}={}){
  const childId=sceneEnemy?.childId??3024030;
  if(childId!==3024030)throw new Error('示死祸源：深魇蝗灾场景记录 childId 不匹配');
  level=sceneEnemy?.level??level;
  const m=buildSceneMonster(ctx,sceneEnemy,sceneEnemy?.monsterId??3024030,childId,level);
  for(const k of ['hp','atk','def','speed','stance'])if(!Number.isFinite(m[k]))throw new Error('示死祸源：深魇蝗灾缺少 '+k+' 数据');
  const hp=sceneEnemy?.hp??m.hp,def=sceneEnemy?.def??m.def,speed=sceneEnemy?.speed??m.speed,stance=sceneEnemy?.stance??m.stance;
  for(const [k,v] of Object.entries({hp,def,speed,stance}))if(!Number.isFinite(v)||v<=0)throw new Error('示死祸源：深魇蝗灾场景 '+k+' 无效');
  const provenance=sceneEnemy?{source:'peak.stage_monster + monster formula',mode:sceneEnemy.mode,
    seasonId:sceneEnemy.seasonId,floorId:sceneEnemy.floorId,wave:sceneEnemy.wave,stats:sceneEnemy._provenance}:m._provenance;
  return {id,name:sceneEnemy?.name??m.name,monsterId:3024030,childId,side:'enemy',level,element:'Fire',
    panel:{hp,atk:m.atk,def,speed,critRate:0,critDmg:0,effectRes:sceneStatusRes(sceneEnemy,m.statusRes),energyRegen:1,elemDmg:{},baseStats:{hp,atk:m.atk,def}},
    baseSpeed:speed,energy:0,energyMax:0,toughnessMax:sceneToughness(sceneEnemy,stance),weaknesses:sceneEnemy?.weakness??m.weakness,
    res:sceneEnemy?.res??m.res,standardBreak:true,rank:'elite',
    enemyKit:{id:3024030,revision:'4.6-swarm-nightmare-partial-1',aiPath:'Config/ConfigAI/Monster_W3_Sam_01_AI.json',
      skill01Id:302403001,skill01Params:[2.4,.3],skill02Id:302403002,skill02Params:[2.4,1.8,.3],
      skill03Id:302403003,skill03Params:[3,.4],skill04Id:302403004,skill04Params:[.5,.5,2,2],
      skill05Id:302403005,skill05Params:[3,.5],skill06Id:302403006,skill06Params:[20,2],
      passiveSkill01Id:302403007,passiveSkill01Params:[.01,.1,.15],
      passiveSkill02Id:302403008,passiveSkill03Id:302403009,passiveSkill03Params:[1,5,.75,.25],
      broodlingChildId:3025030,sourceHashes:{ai:'399b9157393cc5c29be04fb61fa060382978d53d'}},
    actions:{basic:{name:'未使用的基础攻击',type:'Normal',element:'Fire',target:'single',terms:[],hitEnergy:0},
      skill01:{name:'恶变鞘翅',type:'Normal',element:'Fire',target:'single',terms:[{scaling:'atk',multiplier:2.4}],hitEnergy:10},
      skill02:{name:'饕虐外肢',type:'Normal',element:'Fire',target:'blast',terms:[
        {scaling:'atk',multiplier:2.4},{scaling:'atk',multiplier:1.8,target:'adjacent'}],hitEnergy:10},
      skill03:{name:'侵掠，撕碎，进食',type:'Normal',element:'Fire',target:'single',terms:[{scaling:'atk',multiplier:3}],hitEnergy:10},
      skill04:{name:'分裂，腐化，吞吃',type:'Normal',element:null,target:'self',terms:[],hitEnergy:0},
      skill05:{name:'荒潮到临，蝗灾示死',type:'Normal',element:'Fire',target:'all',terms:[{scaling:'atk',multiplier:3}],hitEnergy:10},
      skill06:{name:'原始饥饿',type:'Normal',element:null,target:'self',terms:[],hitEnergy:0}},
    policy:{autoUltimate:false},unsupported:[],
    enemyMechanicNotes:[
      'AI 源只有阶段决策候选、没有 skillSequence；动态条件的参数映射未提供，当前常规攻击循环只能近似。',
      '【基因复制】召唤的【幼蛰虫】3025030 不在本地模板 / 技能 / AI 数据库中，因此未伪造召唤单位、速效进化、天敌选择与击杀解除时序。',
      '【侵蚀】转化比例、群体攻击回复侵蚀、场地燃烧以及幼蛰虫叠加【死灭本能】的联动缺少可验证映射；参数向量只原样保存。',
      'Skill01/02/03/05 参数中除已确认的主段与扩散段倍率外，其余数值用途未确认，未加入附加伤害或状态。',
    ],
    provenance:{version:ctx.data._meta.version,source:'HSR_4.6.db + enemy_ai_4.6.json',stats:m._provenance,scene:provenance,
      ai:'Config/ConfigAI/Monster_W3_Sam_01_AI.json',skills:[302403001,302403002,302403003,302403004,302403005,
        302403006,302403007,302403008,302403009],
      databaseSource:{monster:'monsters + monster_stats + monster_childs',skills:'monster_skills',
        encounter:'peak.stage_wave + peak.stage_monster',ai:'enemy_ai_4.6.json'},
      sourceHashes:{ai:'399b9157393cc5c29be04fb61fa060382978d53d'}}};
}
// 403301002 -> Monster_XP_Elite01_02. SQLite supplies the scene panel,
// seven skill rows, and the AI parameter vector. The independently retargeted
// five-hit Skill02 is executable; Erosion/RallyHP value transfer and the
// charge threshold still block a strict, fully faithful actor.
export function blackTideDaemon(ctx,{sceneEnemy=null,level=90,id='black-tide-daemon-1'}={}){
  const childId=sceneEnemy?.childId??403301002;
  if(childId!==403301002)throw new Error('黑潮蚀魔场景记录 childId 不匹配');
  level=sceneEnemy?.level??level;
  const m=buildSceneMonster(ctx,sceneEnemy,sceneEnemy?.monsterId??4033010,childId,level);
  for(const k of ['hp','atk','def','speed','stance'])if(!Number.isFinite(m[k]))throw new Error('黑潮蚀魔缺少 '+k+' 数据');
  const hp=sceneEnemy?.hp??m.hp,def=sceneEnemy?.def??m.def,speed=sceneEnemy?.speed??m.speed,stance=sceneEnemy?.stance??m.stance;
  for(const [k,v] of Object.entries({hp,def,speed,stance}))if(!Number.isFinite(v)||v<=0)throw new Error('黑潮蚀魔场景 '+k+' 无效');
  const provenance=sceneEnemy?{source:'abyss_wave_monsters',mode:sceneEnemy.mode,seasonId:sceneEnemy.seasonId,floorId:sceneEnemy.floorId,
    wave:sceneEnemy.wave,stats:sceneEnemy._provenance}:m._provenance;
  const unsupported=[
    '【侵蚀】的受伤 / 生命消耗转化比例、侵蚀状态值、吸收治疗与【焕新】增伤尚未接入',
    '【浊染】叠层、3 层蓄力阈值、【厄堕】与后续【浑流奔涌】完整条件链尚未对拍',
    '【浑流奔涌】将目标最大生命值转为侵蚀的结算未接入；攻击削韧数值也不在可用数据库字段中',
  ];
  return {id,name:sceneEnemy?.name??m.name,monsterId:4033010,childId,side:'enemy',level,element:'Physical',
    panel:{hp,atk:m.atk,def,speed,critRate:0,critDmg:0,effectRes:sceneStatusRes(sceneEnemy,m.statusRes),energyRegen:1,elemDmg:{},baseStats:{hp,atk:m.atk,def}},
    baseSpeed:speed,energy:0,energyMax:0,toughnessMax:sceneToughness(sceneEnemy,stance),weaknesses:sceneEnemy?.weakness??m.weakness,
    res:sceneEnemy?.res??m.res,standardBreak:true,rank:'elite',
    enemyKit:{id:403301002,parentId:4033010,revision:'4.6-black-tide-partial-1',aiPath:'Config/ConfigAI/Monster_XP_Elite01_02_AI.json',
      skill01Id:403301001,skill01Params:[3],skill02Id:403301002,skill02Params:[2.4,4],skill02ProjectileCount:5,
      skill03Id:403301003,skill04Id:403301004,skill05Id:403301005,skill05Params:[4.5,.2],
      passiveSkillId:403301006,passiveParams:[3,.5,.2,0,.5],skill06Id:403301007,skill06Params:[.3,1],
      chargeCompleteThreshold:3,oneMorePerTurn:true,randomUniqueTargetsUntilExhausted:true,
      sourceHashes:{ai:'fdb626dc295e521e1ce53f194fc70ddd908dcc7b',character:'26dcb73144d453a52338e4cae6fe776ef88329fc',
        ability:'cef95ce0ed6f281b118d64d5406738b915e1c19f'}},
    actions:{basic:{name:'未使用的基础攻击',type:'Normal',element:'Physical',target:'single',terms:[],hitEnergy:0},
      skill01:{name:'凋敝岩流',type:'Normal',element:'Physical',target:'single',terms:[{scaling:'atk',multiplier:3}],hitEnergy:10,hitEnergyPerHit:true},
      skill02:{name:'腐败骤陨',type:'Normal',element:'Physical',target:'single',terms:[{scaling:'atk',multiplier:12}],
        hitShares:Array(5).fill(.2),hitEnergyShares:Array(5).fill(1),hitEnergy:10,hitEnergyPerHit:true,randomUniqueHitTargets:true},
      skill03:{name:'吞浊纳污',type:'Normal',element:'Physical',target:'self',terms:[],hitEnergy:0},
      skill04:{name:'堕化',type:'Normal',element:'Physical',target:'self',terms:[],hitEnergy:0,
        effects:[{type:'buff',name:'厄堕',key:'atkPct',value:0,duration:1,target:'self',tag:'blackTideEvilFall'}]},
      skill05:{name:'浑流奔涌',type:'Normal',element:'Physical',target:'all',terms:[{scaling:'atk',multiplier:4.5}],hitEnergy:15,hitEnergyPerHit:true},
      skill06:{name:'吞浊纳污失败',type:'Normal',element:'Physical',target:'all',terms:[],hitEnergy:0,
        effects:[{type:'buff',name:'防御降低',key:'defPct',value:-.3,duration:1,target:'self',debuff:true,tag:'blackTideFailedAbsorption'}]}},
    policy:{autoUltimate:false},unsupported,
    provenance:{version:ctx.data._meta.version,source:'DimbreathBot/TurnBasedGameData@312b4597691e0a29cf9828a15b592757dba86949',
      stats:m._provenance,scene:provenance,ai:'Config/ConfigAI/Monster_XP_Elite01_02_AI.json',
      character:'Config/ConfigCharacter/Monster/Monster_XP_Elite01_02_Config.json',
      ability:'Config/ConfigAbility/Monster/Monster_XP_Elite01_02_Ability.json',sourceHashes:{
        ai:'fdb626dc295e521e1ce53f194fc70ddd908dcc7b',character:'26dcb73144d453a52338e4cae6fe776ef88329fc',
        ability:'cef95ce0ed6f281b118d64d5406738b915e1c19f'}}};
}
// 8012010 -> MonsterTemplateConfig -> AML_Minion02_00, not Minion01.
// Ability, AI cooldowns and native SPHitRatio: pinned release source in docs/严格模式规则与验收.md.
export function reaver(ctx,{sceneEnemy=null,level=90,id='reaver-1'}={}){
  if(sceneEnemy?.childId!=null&&sceneEnemy.childId!==8012010)throw new Error('掠夺者场景记录 childId 不匹配');
  level=sceneEnemy?.level??level;
  const m=buildSceneMonster(ctx,sceneEnemy,sceneEnemy?.monsterId??8012010,sceneEnemy?.childId??8012010,level);
  for(const k of ['hp','atk','def','speed','stance'])if(!Number.isFinite(m[k]))throw new Error('掠夺者缺少 '+k+' 数据');
  const hp=sceneEnemy?.hp??m.hp,def=sceneEnemy?.def??m.def,speed=sceneEnemy?.speed??m.speed,stance=sceneEnemy?.stance??m.stance;
  for(const [k,v] of Object.entries({hp,def,speed,stance}))if(!Number.isFinite(v)||v<=0)throw new Error('掠夺者场景 '+k+' 无效');
  return {id,name:sceneEnemy?.name??m.name,monsterId:8012010,childId:8012010,side:'enemy',level,element:'Imaginary',panel:{hp,atk:m.atk,def,speed,critRate:0,critDmg:0,effectRes:sceneStatusRes(sceneEnemy,m.statusRes),energyRegen:1,elemDmg:{},baseStats:{atk:m.atk,hp,def}},
    baseSpeed:speed,energy:0,energyMax:0,toughnessMax:sceneToughness(sceneEnemy,stance),weaknesses:sceneEnemy?.weakness??m.weakness,res:sceneEnemy?.res??m.res,standardBreak:true,rank:'normal',
    enemyKit:{id:8012010,revision:'4.6-reaver-1',speedPerLayer:.35,speedDuration:2,speedLayers:3},
    actions:{basic:{name:'狩猎之刃',type:'Normal',element:'Imaginary',target:'single',terms:[{scaling:'atk',multiplier:2.5}],hitShares:[.25,.25,.5],hitEnergy:10,hitEnergyPerHit:true},
      skill:{name:'涡旋跃袭',type:'Normal',element:'Imaginary',target:'blast',terms:[{scaling:'atk',multiplier:1.5},{scaling:'atk',multiplier:1.5,target:'adjacent'}],hitShares:[.2,.2,.2,.4],hitEnergy:5,hitEnergyPerHit:true}},
    policy:{autoUltimate:false,rotation:['basic','skill']},unsupported:[],provenance:{version:ctx.data._meta.version,source:'DimbreathBot/TurnBasedGameData@312b4597691e0a29cf9828a15b592757dba86949',stats:sceneEnemy?{source:'abyss_wave_monsters',mode:sceneEnemy.mode,seasonId:sceneEnemy.seasonId,floorId:sceneEnemy.floorId,stats:sceneEnemy._provenance}:m._provenance}};
}

// 1012030 -> Monster_W1_Mecha01_01 -> Monster_Common_SequenceThree.
// The source skill is a single-target 3x ATK physical strike; it grants a
// one-attack BlockDamageExcludeDot modifier before the strike resolves.
export function automatonBeetle(ctx,{sceneEnemy=null,level=90,id='mecha-beetle-1'}={}){
  const childId=sceneEnemy?.childId??1012030;
  if(childId!==1012030)throw new Error('自动机兵·甲虫场景记录 childId 不匹配');
  level=sceneEnemy?.level??level;
  const m=buildSceneMonster(ctx,sceneEnemy,sceneEnemy?.monsterId??1012030,childId,level);
  for(const k of ['hp','atk','def','speed','stance'])if(!Number.isFinite(m[k]))throw new Error('自动机兵·甲虫缺少 '+k+' 数据');
  const hp=sceneEnemy?.hp??m.hp,def=sceneEnemy?.def??m.def,speed=sceneEnemy?.speed??m.speed,stance=sceneEnemy?.stance??m.stance;
  for(const [k,v] of Object.entries({hp,def,speed,stance}))if(!Number.isFinite(v)||v<=0)throw new Error('自动机兵·甲虫场景 '+k+' 无效');
  const provenance=sceneEnemy?{source:'abyss_wave_monsters',mode:sceneEnemy.mode,seasonId:sceneEnemy.seasonId,floorId:sceneEnemy.floorId,wave:sceneEnemy.wave,stats:sceneEnemy._provenance}:m._provenance;
  return {id,name:sceneEnemy?.name??m.name,monsterId:1012030,childId:1012030,side:'enemy',level,
    element:'Physical',panel:{hp,atk:m.atk,def,speed,critRate:0,critDmg:0,effectRes:sceneStatusRes(sceneEnemy,m.statusRes),energyRegen:1,elemDmg:{},baseStats:{atk:m.atk,hp,def}},
    baseSpeed:speed,energy:0,energyMax:0,toughnessMax:sceneToughness(sceneEnemy,stance),weaknesses:sceneEnemy?.weakness??m.weakness,
    res:sceneEnemy?.res??m.res,standardBreak:true,rank:'normal',
    enemyKit:{id:1012030,revision:'4.6-mecha-block-1',skillId:101203001,barrierHits:1,blockDot:false,muteBreak:true,
      aiPath:'Config/ConfigAI/Monster_Common_SequenceThree_AI.json',aiSequence:[101203001]},
    actions:{basic:{name:'未使用的基础攻击',type:'Normal',element:'Physical',target:'single',terms:[],hitEnergy:0},
      skill:{name:'不稳定力场',type:'Normal',element:'Physical',target:'single',terms:[{scaling:'atk',multiplier:3}],hitEnergy:15,hitEnergyPerHit:true}},
    policy:{autoUltimate:false,rotation:['skill']},unsupported:[],
    provenance:{version:ctx.data._meta.version,source:'DimbreathBot/TurnBasedGameData@312b4597691e0a29cf9828a15b592757dba86949',stats:m._provenance,scene:provenance,
      ability:'Config/ConfigAbility/Monster/Monster_W1_Mecha01_01_Ability.json',modifier:'Config/ConfigGlobalModifier/GlobalModifier_Monster.json',
      sourceHashes:{ability:'f97f1aae19119fbb76feb18c3cf903baec0e6779',modifier:'949b382738cbbf13dc22014792c73249215fe8bf',ai:'26aab40120a49b8b467ac4535f80e4381d9df0c1'}}};
}

// 8012030 -> Monster_AML_Minion04_00. Source Skill01 is three projectile hits
// totalling 4x ATK; it applies a two-turn, four-attack mark with 75% base chance,
// then Overheat forces Skill02 on the next turn to clear it.
export function obliterator(ctx,{sceneEnemy=null,level=90,id='aml-obliterator-1'}={}){
  const childId=sceneEnemy?.childId??8012030;
  if(childId!==8012030)throw new Error('虚卒·抹消者场景记录 childId 不匹配');
  level=sceneEnemy?.level??level;
  const m=buildSceneMonster(ctx,sceneEnemy,sceneEnemy?.monsterId??8012030,childId,level);
  for(const k of ['hp','atk','def','speed','stance'])if(!Number.isFinite(m[k]))throw new Error('虚卒·抹消者缺少 '+k+' 数据');
  const hp=sceneEnemy?.hp??m.hp,def=sceneEnemy?.def??m.def,speed=sceneEnemy?.speed??m.speed,stance=sceneEnemy?.stance??m.stance;
  for(const [k,v] of Object.entries({hp,def,speed,stance}))if(!Number.isFinite(v)||v<=0)throw new Error('虚卒·抹消者场景 '+k+' 无效');
  const provenance=sceneEnemy?{source:'abyss_wave_monsters',mode:sceneEnemy.mode,seasonId:sceneEnemy.seasonId,floorId:sceneEnemy.floorId,wave:sceneEnemy.wave,stats:sceneEnemy._provenance}:m._provenance;
  const skill01={name:'虚灼炮攻',type:'Normal',element:'Imaginary',target:'single',terms:[{scaling:'atk',multiplier:4}],
    hitShares:[.33,.33,.34],hitEnergy:15,hitEnergyPerHit:true};
  return {id,name:sceneEnemy?.name??m.name,monsterId:8012030,childId:8012030,side:'enemy',level,element:'Imaginary',
    panel:{hp,atk:m.atk,def,speed,critRate:0,critDmg:0,effectRes:sceneStatusRes(sceneEnemy,m.statusRes),energyRegen:1,elemDmg:{},baseStats:{atk:m.atk,hp,def}},
    baseSpeed:speed,energy:0,energyMax:0,toughnessMax:sceneToughness(sceneEnemy,stance),weaknesses:sceneEnemy?.weakness??m.weakness,
    res:sceneEnemy?.res??m.res,standardBreak:true,rank:'normal',
    enemyKit:{id:8012030,revision:'4.6-aml-obliterator-1',aiPath:'Config/ConfigAI/Monster_AML_Minion04_00_AI.json',
      aiSequence:[801203001,801203002],targetSelector:'MMonster_AML_Minion03_00_Target',skill01Multiplier:4,
      markChance:.75,markMultiplier:.4,markDuration:2,markAttackCount:4},
    actions:{basic:{name:'未使用的基础攻击',type:'Normal',element:'Imaginary',target:'single',terms:[],hitEnergy:0},
      skill:skill01,skill01,skill02:{name:'热障阻塞',type:'Normal',element:'Imaginary',target:'self',terms:[]}},
    policy:{autoUltimate:false},
    unsupported:['AI 目标选择器 MMonster_AML_Minion03_00_Target 的无标记者回退尚未对拍','【起爆】Count=4 与 OnAfterBeingAttacked 的计数边界、追击段重入尚需实战对拍'],
    provenance:{version:ctx.data._meta.version,source:'DimbreathBot/TurnBasedGameData@312b4597691e0a29cf9828a15b592757dba86949',stats:m._provenance,scene:provenance,
      ai:'Config/ConfigAI/Monster_AML_Minion04_00_AI.json',character:'Config/ConfigCharacter/Monster/Monster_AML_Minion04_00_Config.json',
      ability:'Config/ConfigAbility/Monster/Monster_AML_Minion04_00_Ability.json',targetModifier:'Config/ConfigAbility/Monster/Monster_AML_Minion03_00_Ability.json',
      sourceHashes:{ai:'a2fbee90023b61a01d66d7ac0d9fbe087bac0c77',character:'f7c8f30a62d3fba4f782d1e05366c5d5705cc660',
        ability:'b47877df83dd2d2a19a0602bf681036a070b2df7',targetModifier:'111488f79ae472fb70eb14df0f67c1bd3b746fb0'}}};
}

// 8012020 -> Monster_AML_Minion03_00. Skill01 marks a random ally and gives
// that target 10% all-damage vulnerability; Skill02 selects the marked target
// for a 5x Quantum hit, then removes the mark applied by this caster.
export function voidrangerTrampler(ctx,{sceneEnemy=null,level=90,id='aml-trampler-1'}={}){
  const childId=sceneEnemy?.childId??8012020;
  if(childId!==8012020)throw new Error('虚卒·篡改者场景记录 childId 不匹配');
  level=sceneEnemy?.level??level;
  const m=buildSceneMonster(ctx,sceneEnemy,sceneEnemy?.monsterId??8012020,childId,level);
  for(const k of ['hp','atk','def','speed','stance'])if(!Number.isFinite(m[k]))throw new Error('虚卒·篡改者缺少 '+k+' 数据');
  const hp=sceneEnemy?.hp??m.hp,def=sceneEnemy?.def??m.def,speed=sceneEnemy?.speed??m.speed,stance=sceneEnemy?.stance??m.stance;
  for(const [k,v] of Object.entries({hp,def,speed,stance}))if(!Number.isFinite(v)||v<=0)throw new Error('虚卒·篡改者场景 '+k+' 无效');
  const provenance=sceneEnemy?{source:'abyss_wave_monsters',mode:sceneEnemy.mode,seasonId:sceneEnemy.seasonId,floorId:sceneEnemy.floorId,wave:sceneEnemy.wave,stats:sceneEnemy._provenance}:m._provenance;
  const skill01={name:'虚无命意',type:'Normal',element:'Quantum',target:'single',terms:[],hitEnergy:0};
  return {id,name:sceneEnemy?.name??m.name,monsterId:8012020,childId:8012020,side:'enemy',level,element:'Quantum',
    panel:{hp,atk:m.atk,def,speed,critRate:0,critDmg:0,effectRes:sceneStatusRes(sceneEnemy,m.statusRes),energyRegen:1,elemDmg:{},baseStats:{atk:m.atk,hp,def}},
    baseSpeed:speed,energy:0,energyMax:0,toughnessMax:sceneToughness(sceneEnemy,stance),weaknesses:sceneEnemy?.weakness??m.weakness,
    res:sceneEnemy?.res??m.res,standardBreak:true,rank:'normal',
    enemyKit:{id:8012020,revision:'4.6-aml-trampler-1',aiPath:'Config/ConfigAI/Monster_AML_Minion03_00_AI.json',
      aiSequence:[801202001,801202002],targetSelector:'MMonster_AML_Minion03_00_Target',markVulnerability:.1,skill02Multiplier:5,skill01MinAliveTargets:2,skill01MinTeamSize:2},
    actions:{basic:skill01,skill:skill01,skill01,skill02:{name:'无影虚击',type:'Normal',element:'Quantum',target:'single',terms:[{scaling:'atk',multiplier:5}],hitEnergy:15},
      wait:{name:'无可锁定目标',type:'Normal',element:'Quantum',target:'self',terms:[]}},
    policy:{autoUltimate:false},unsupported:['多个篡改者同时持有可选标记时，ModifierNameSelector 的并列目标顺序尚未对拍',
      '无标记且同侧无队友或存活敌对目标不足 2 个时，源 AI 无可执行动作；用零伤害空过表示该分支'],
    provenance:{version:ctx.data._meta.version,source:'DimbreathBot/TurnBasedGameData@312b4597691e0a29cf9828a15b592757dba86949',stats:m._provenance,scene:provenance,
      ai:'Config/ConfigAI/Monster_AML_Minion03_00_AI.json',character:'Config/ConfigCharacter/Monster/Monster_AML_Minion03_00_Config.json',
      ability:'Config/ConfigAbility/Monster/Monster_AML_Minion03_00_Ability.json',
      sourceHashes:{ai:'357f6b6b18e3903c206741b316da3799a6a66968',character:'1f01a91b4ebc6dea10269913b3b9a1f0df1cf037',
        ability:'111488f79ae472fb70eb14df0f67c1bd3b746fb0'}}};
}

// 2032020 -> Monster_W2_Lycan_01 -> Monster_Common_SequenceThree. Its Skill02
// parameters feed the level-wide Lycan controller; the normal AI sequence only
// selects Skill01. `rageGroup` scopes the shared counter to the active wave.
export function eclipsedWolf(ctx,{sceneEnemy=null,level=90,id='lycan-01',rageGroup='lycan-wave-1'}={}){
  const childId=sceneEnemy?.childId??2032020;
  if(childId!==2032020)throw new Error('蚀月狼卒场景记录 childId 不匹配');
  level=sceneEnemy?.level??level;
  const m=buildSceneMonster(ctx,sceneEnemy,sceneEnemy?.monsterId??2032020,childId,level);
  for(const k of ['hp','atk','def','speed','stance'])if(!Number.isFinite(m[k]))throw new Error('蚀月狼卒缺少 '+k+' 数据');
  const hp=sceneEnemy?.hp??m.hp,def=sceneEnemy?.def??m.def,speed=sceneEnemy?.speed??m.speed,stance=sceneEnemy?.stance??m.stance;
  for(const [k,v] of Object.entries({hp,def,speed,stance}))if(!Number.isFinite(v)||v<=0)throw new Error('蚀月狼卒场景 '+k+' 无效');
  const provenance=sceneEnemy?{source:'abyss_wave_monsters',mode:sceneEnemy.mode,seasonId:sceneEnemy.seasonId,floorId:sceneEnemy.floorId,wave:sceneEnemy.wave,stats:sceneEnemy._provenance}:m._provenance;
  return {id,name:sceneEnemy?.name??m.name,monsterId:2032020,childId:2032020,side:'enemy',level,
    element:'Physical',panel:{hp,atk:m.atk,def,speed,critRate:0,critDmg:0,effectRes:sceneStatusRes(sceneEnemy,m.statusRes),energyRegen:1,elemDmg:{},baseStats:{atk:m.atk,hp,def}},
    baseSpeed:speed,energy:0,energyMax:0,toughnessMax:sceneToughness(sceneEnemy,stance),weaknesses:sceneEnemy?.weakness??m.weakness,
    res:sceneEnemy?.res??m.res,standardBreak:true,rank:'normal',
    enemyKit:{id:2032020,revision:'4.6-lycan-moonrage-1',skillId:203202001,aiPath:'Config/ConfigAI/Monster_Common_SequenceThree_AI.json',aiSequence:[203202001],
      lycanGroup:rageGroup,rageThreshold:6,rageSpeedRatio:.3,rageHealRatio:.4,rageCountdownSpeed:105},
    actions:{basic:{name:'未使用的基础攻击',type:'Normal',element:'Physical',target:'single',terms:[],hitEnergy:0},
      skill:{name:'啃噬',type:'Normal',element:'Physical',target:'single',terms:[{scaling:'atk',multiplier:2.8}],hitEnergy:10,hitEnergyPerHit:true},
      moonrageStart:{name:'进入月狂',type:'Normal',element:'Physical',target:'self',terms:[]},
      moonrageCountdown:{name:'月狂倒计时',type:'Normal',element:'Physical',target:'self',terms:[]},
      moonrageFinish:{name:'结束月狂',type:'Normal',element:'Physical',target:'self',terms:[]}},
    policy:{autoUltimate:false,rotation:['skill']},unsupported:[],
    provenance:{version:ctx.data._meta.version,source:'DimbreathBot/TurnBasedGameData@312b4597691e0a29cf9828a15b592757dba86949',stats:m._provenance,scene:provenance,
      ability:'Config/ConfigAbility/Monster/Monster_W2_Lycan_01_Ability.json',sharedAbility:'Config/ConfigAbility/Monster/Monster_W2_Lycan_00_Ability.json',
      character:'Config/ConfigCharacter/Monster/Monster_W2_Lycan_01_Config.json',battleEvent:'ExcelOutput/BattleEventConfig.json',
      sourceHashes:{ability:'a200fcf02094c4d4d363a832ed4b6328c1338352',sharedAbility:'3f48cc0a5211402c0bbc3fccb09758f964cdff74',
        character:'0a10be962ed875015cafdcf223c158f7e8f82e8c',battleEvent:'c6e1910cc152eb1d90fe24ddfbba986d93ad6c11'}}};
}

// 2032010 -> Monster_W2_Lycan_00 -> Common Sequence Three. Unlike 2032020,
// this wolf attacks the selected target and both adjacent enemies; its Moonrage
// strike applies the source physical Tear DoT (30% ATK, capped at 5% target MaxHP).
export function bloodclawWolf(ctx,{sceneEnemy=null,level=90,id='lycan-00',rageGroup='lycan-wave-1'}={}){
  const childId=sceneEnemy?.childId??2032010;
  if(childId!==2032010)throw new Error('玄爪狼卒场景记录 childId 不匹配');
  level=sceneEnemy?.level??level;
  const m=buildSceneMonster(ctx,sceneEnemy,sceneEnemy?.monsterId??2032010,childId,level);
  for(const k of ['hp','atk','def','speed','stance'])if(!Number.isFinite(m[k]))throw new Error('玄爪狼卒缺少 '+k+' 数据');
  const hp=sceneEnemy?.hp??m.hp,def=sceneEnemy?.def??m.def,speed=sceneEnemy?.speed??m.speed,stance=sceneEnemy?.stance??m.stance;
  for(const [k,v] of Object.entries({hp,def,speed,stance}))if(!Number.isFinite(v)||v<=0)throw new Error('玄爪狼卒场景 '+k+' 无效');
  const provenance=sceneEnemy?{source:'abyss_wave_monsters',mode:sceneEnemy.mode,seasonId:sceneEnemy.seasonId,floorId:sceneEnemy.floorId,wave:sceneEnemy.wave,stats:sceneEnemy._provenance}:m._provenance;
  return {id,name:sceneEnemy?.name??m.name,monsterId:2032010,childId:2032010,side:'enemy',level,
    element:'Physical',panel:{hp,atk:m.atk,def,speed,critRate:0,critDmg:0,effectRes:sceneStatusRes(sceneEnemy,m.statusRes),energyRegen:1,elemDmg:{},baseStats:{atk:m.atk,hp,def}},
    baseSpeed:speed,energy:0,energyMax:0,toughnessMax:sceneToughness(sceneEnemy,stance),weaknesses:sceneEnemy?.weakness??m.weakness,
    res:sceneEnemy?.res??m.res,standardBreak:true,rank:'normal',
    enemyKit:{id:2032010,revision:'4.6-lycan-bloodclaw-1',skillId:203201001,aiPath:'Config/ConfigAI/Monster_Common_SequenceThree_AI.json',aiSequence:[203201001],
      lycanGroup:rageGroup,rageThreshold:6,rageSpeedRatio:.3,rageHealRatio:0,rageCountdownSpeed:105,
      rageDotChance:1,rageDotDuration:2,rageDotAtkRatio:.3,rageDotMaxHpPercent:5},
    actions:{basic:{name:'未使用的基础攻击',type:'Normal',element:'Physical',target:'single',terms:[],hitEnergy:0},
      skill:{name:'厮杀',type:'Normal',element:'Physical',target:'blast',terms:[{scaling:'atk',multiplier:1.8},{scaling:'atk',multiplier:1.8,target:'adjacent'}],hitEnergy:10,hitEnergyPerHit:true},
      moonrageStart:{name:'进入月狂',type:'Normal',element:'Physical',target:'self',terms:[]},
      moonrageCountdown:{name:'月狂倒计时',type:'Normal',element:'Physical',target:'self',terms:[]},
      moonrageFinish:{name:'结束月狂',type:'Normal',element:'Physical',target:'self',terms:[]}},
    policy:{autoUltimate:false,rotation:['skill']},unsupported:[],
    provenance:{version:ctx.data._meta.version,source:'DimbreathBot/TurnBasedGameData@312b4597691e0a29cf9828a15b592757dba86949',stats:m._provenance,scene:provenance,
      ability:'Config/ConfigAbility/Monster/Monster_W2_Lycan_00_Ability.json',sharedAbility:'Config/ConfigAbility/Monster/Monster_W2_Lycan_00_Ability.json',
      character:'Config/ConfigCharacter/Monster/Monster_W2_Lycan_00_Config.json',tearModifier:'Config/ConfigGlobalModifier/GlobalModifier_Common_Specific.json',
      battleEvent:'ExcelOutput/BattleEventConfig.json',sourceHashes:{ability:'3f48cc0a5211402c0bbc3fccb09758f964cdff74',
        character:'b3d03f12bd478d58637cfc417b635d9fe03ec51c',tearModifier:'e043cdc0650741eb27049b0c1a0710bccb77618f',
        commonAI:'26aab40120a49b8b467ac4535f80e4381d9df0c1',battleEvent:'c6e1910cc152eb1d90fe24ddfbba986d93ad6c11'}}};
}

// 2033010 -> Monster_W2_LycanMecha_00. The source AI alternates Skill01 / 02
// before rage and Skill04 / 05 while the shared Lycan rage state is active.
// Skill04/05's fear-conditioned repeats and the rank-filtered BattleCry insert
// chain remain explicit approximation gaps (see unsupported below).
export function lycanMecha(ctx,{sceneEnemy=null,level=90,id='lycan-mecha-00',rageGroup='lycan-wave-1'}={}){
  const childId=sceneEnemy?.childId??2033010;
  if(childId!==2033010)throw new Error('咆哮灵柩场景记录 childId 不匹配');
  level=sceneEnemy?.level??level;
  const m=buildSceneMonster(ctx,sceneEnemy,sceneEnemy?.monsterId??2033010,childId,level);
  for(const k of ['hp','atk','def','speed','stance'])if(!Number.isFinite(m[k]))throw new Error('咆哮灵柩缺少 '+k+' 数据');
  const hp=sceneEnemy?.hp??m.hp,def=sceneEnemy?.def??m.def,speed=sceneEnemy?.speed??m.speed,stance=sceneEnemy?.stance??m.stance;
  for(const [k,v] of Object.entries({hp,def,speed,stance}))if(!Number.isFinite(v)||v<=0)throw new Error('咆哮灵柩场景 '+k+' 无效');
  const provenance=sceneEnemy?{source:'abyss_wave_monsters',mode:sceneEnemy.mode,seasonId:sceneEnemy.seasonId,floorId:sceneEnemy.floorId,wave:sceneEnemy.wave,stats:sceneEnemy._provenance}:m._provenance;
  const noHit={type:'Normal',element:'Physical',target:'self',terms:[]};
  return {id,name:sceneEnemy?.name??m.name,monsterId:2033010,childId:2033010,side:'enemy',level,
    element:'Physical',panel:{hp,atk:m.atk,def,speed,critRate:0,critDmg:0,effectRes:sceneStatusRes(sceneEnemy,m.statusRes),energyRegen:1,elemDmg:{},baseStats:{atk:m.atk,hp,def}},
    baseSpeed:speed,energy:0,energyMax:0,toughnessMax:sceneToughness(sceneEnemy,stance),weaknesses:sceneEnemy?.weakness??m.weakness,
    res:sceneEnemy?.res??m.res,standardBreak:true,rank:'elite',
    enemyKit:{id:2033010,revision:'4.6-lycan-mecha-1',aiPath:'Config/ConfigAI/Monster_W2_LycanMecha_00_AI.json',
      aiSequence:[203301001,203301002,203301004,203301005],lycanGroup:rageGroup,rageThreshold:6,rageSpeedRatio:.3,rageHealRatio:0,rageCountdownSpeed:105,
      fearResistanceModifier:'MMonster_W2_LycanMecha_00_Skill04_FearResistance'},
    actions:{basic:{name:'孤立动作占位',type:'Normal',element:'Physical',target:'single',terms:[],hitEnergy:0},
      skill01:{name:'仿生利爪',type:'Normal',element:'Physical',target:'single',terms:[{scaling:'atk',multiplier:3.2}],hitEnergy:10,hitEnergyPerHit:true},
      skill02:{name:'电震咆哮',type:'Normal',element:'Physical',target:'blast',terms:[{scaling:'atk',multiplier:2.6},{scaling:'atk',multiplier:1.8,target:'adjacent'}],hitEnergy:10,hitEnergyPerHit:true},
      skill03:{name:'拟态月狂',...noHit},skill06:{name:'步离本能',...noHit},
      skill04:{name:'合成狼毒',type:'Normal',element:'Physical',target:'all',terms:[{scaling:'atk',multiplier:1.2}],hitEnergy:20,hitEnergyPerHit:true},
      skill05:{name:'杀戮算法',type:'Normal',element:'Physical',target:'blast',terms:[{scaling:'atk',multiplier:3.2},{scaling:'atk',multiplier:1.8,target:'adjacent'}],hitEnergy:15,hitEnergyPerHit:true},
      moonrageStart:{name:'进入月狂',...noHit},moonrageCountdown:{name:'月狂倒计时',...noHit},moonrageFinish:{name:'结束月狂',...noHit}},
    policy:{autoUltimate:false,rotation:['skill01','skill02']},
    unsupported:['技能05恐惧条件追加段的多目标分支与重复命中尚未逐段复刻',
      'Skill06 战吼对不同阶级狼怪的插入行动、抗控/击破筛选和 UI/计分事件未完整模拟'],
    provenance:{version:ctx.data._meta.version,source:'DimbreathBot/TurnBasedGameData@312b4597691e0a29cf9828a15b592757dba86949',stats:sceneEnemy?{source:'abyss_wave_monsters',mode:sceneEnemy.mode,seasonId:sceneEnemy.seasonId,floorId:sceneEnemy.floorId,stats:sceneEnemy._provenance}:m._provenance,scene:provenance,
      ai:'Config/ConfigAI/Monster_W2_LycanMecha_00_AI.json',ability:'Config/ConfigAbility/Monster/Monster_W2_LycanMecha_00_Ability.json',
      sharedAbility:'Config/ConfigAbility/Monster/Monster_W2_Lycan_00_Ability.json',character:'Config/ConfigCharacter/Monster/Monster_W2_LycanMecha_00_Config.json',
      sourceHashes:{ai:'5d5bea857340ac29551354f27cb0800bb419b279',ability:'45fe589826a46af505eadc1efad7c94ba81797ce',
        sharedAbility:'3f48cc0a5211402c0bbc3fccb09758f964cdff74',character:'f1581d57f529f05d04b81e5e431abe26a657f99f'}}};
}

// 4022010 -> Monster_W4_Harpy_00. The AI opens with 划破夜空, then uses
// 如流星闪耀 on a same-side enemy without either FastAction modifier. The
// Windwalk effect grants an immediate action at that target's turn end and is
// removed on weakness break. See the fixed source links and documented AI
// selection/cooldown limits in docs/敌人机制还原目标-20261021.md.
export function meteoricEagle(ctx,{sceneEnemy=null,level=90,id='meteoric-eagle-1'}={}){
  const childId=sceneEnemy?.childId??4022010;
  if(childId!==4022010)throw new Error('流星铁鹰场景记录 childId 不匹配');
  level=sceneEnemy?.level??level;
  const m=buildSceneMonster(ctx,sceneEnemy,sceneEnemy?.monsterId??4022010,childId,level);
  for(const k of ['hp','atk','def','speed','stance'])if(!Number.isFinite(m[k]))throw new Error('流星铁鹰缺少 '+k+' 数据');
  const hp=sceneEnemy?.hp??m.hp,def=sceneEnemy?.def??m.def,speed=sceneEnemy?.speed??m.speed,stance=sceneEnemy?.stance??m.stance;
  for(const [k,v] of Object.entries({hp,def,speed,stance}))if(!Number.isFinite(v)||v<=0)throw new Error('流星铁鹰场景 '+k+' 无效');
  const provenance=sceneEnemy?{source:'abyss_wave_monsters',mode:sceneEnemy.mode,seasonId:sceneEnemy.seasonId,floorId:sceneEnemy.floorId,wave:sceneEnemy.wave,stats:sceneEnemy._provenance}:m._provenance;
  const monsterRank=ctx.monsterById.get(sceneEnemy?.monsterId??4022010)?.rank??'MinionLv2';
  return {id,name:sceneEnemy?.name??m.name,monsterId:4022010,childId:4022010,side:'enemy',level,element:'Wind',
    panel:{hp,atk:m.atk,def,speed,critRate:0,critDmg:0,effectRes:sceneStatusRes(sceneEnemy,m.statusRes),energyRegen:1,elemDmg:{},baseStats:{atk:m.atk,hp,def}},
    baseSpeed:speed,energy:0,energyMax:0,toughnessMax:sceneToughness(sceneEnemy,stance),weaknesses:sceneEnemy?.weakness??m.weakness,
    res:sceneEnemy?.res??m.res,standardBreak:true,rank:'normal',
    enemyKit:{id:4022010,revision:'4.6-meteoric-eagle-1',monsterRank,aiPath:'Config/ConfigAI/Monster_W4_Harpy_00_AI.json',
      aiSequence:[402201001,402201002],windwalkModifier:'MCommon_FastAction',windwalkRemovesOnBreak:true,
      skill02ActionDelay:12,listenAfterSkill:true},
    actions:{basic:{name:'未使用的基础攻击',type:'Normal',element:'Wind',target:'single',terms:[],hitEnergy:0},
      skill:{name:'划破夜空',type:'Normal',element:'Wind',target:'single',terms:[{scaling:'atk',multiplier:2}],hitEnergy:5,hitEnergyPerHit:true},
      skill02:{name:'如流星闪耀',type:'Normal',element:'Wind',target:'ally',terms:[]}},
    policy:{autoUltimate:false,rotation:['skill']},
    unsupported:['如流星闪耀的候选同阶敌人排序仍按编队顺序取首个，未还原 AI 默认目标并列规则'],
    provenance:{version:ctx.data._meta.version,source:'DimbreathBot/TurnBasedGameData@312b4597691e0a29cf9828a15b592757dba86949',
      stats:sceneEnemy?{source:'abyss_wave_monsters',mode:sceneEnemy.mode,seasonId:sceneEnemy.seasonId,floorId:sceneEnemy.floorId,wave:sceneEnemy.wave,stats:sceneEnemy._provenance}:m._provenance,scene:provenance,
      ai:'Config/ConfigAI/Monster_W4_Harpy_00_AI.json',character:'Config/ConfigCharacter/Monster/Monster_W4_Harpy_00_Config.json',
      ability:'Config/ConfigAbility/Monster/Monster_W4_Harpy_00_Ability.json',sharedModifier:'Config/ConfigGlobalModifier/GlobalModifier_Monster.json',
      sourceHashes:{ai:'6ef93db212cbc45b247f120fc208e115c54ed95c',character:'5aa6fff2bdec05c817eae31b9c81f9b82a3ca070',
        ability:'6c398c838683919a054fe8b8dab0d64420be6171',sharedModifier:'949b382738cbbf13dc22014792c73249215fe8bf'}}};
}

// 8003010 -> Monster_XP_Elite01_01. The fixed AI uses Skill01, then enters
// Icepoint with Skill02; in Icepoint it alternates the three-hit team attack
// and Skill01, which gains one extra hit against frozen targets. OneMorePerTurn
// grants exactly one continuation after each natural turn.
export function iceOutOfSpace(ctx,{sceneEnemy=null,level=90,id='ice-out-of-space-1'}={}){
  const childId=sceneEnemy?.childId??8003010;
  const monsterId=sceneEnemy?.monsterId??8003010;
  if(![8003010,800301020].includes(childId)||monsterId!==8003010)throw new Error('外宇宙之冰场景记录 childId 不匹配');
  level=sceneEnemy?.level??level;
  const m=buildSceneMonster(ctx,sceneEnemy,monsterId,childId,level);
  for(const k of ['hp','atk','def','speed','stance'])if(!Number.isFinite(m[k]))throw new Error('外宇宙之冰缺少 '+k+' 数据');
  const hp=sceneEnemy?.hp??m.hp,def=sceneEnemy?.def??m.def,speed=sceneEnemy?.speed??m.speed,stance=sceneEnemy?.stance??m.stance;
  for(const [k,v] of Object.entries({hp,def,speed,stance}))if(!Number.isFinite(v)||v<=0)throw new Error('外宇宙之冰场景 '+k+' 无效');
  const provenance=sceneEnemy?{source:'abyss_wave_monsters',mode:sceneEnemy.mode,seasonId:sceneEnemy.seasonId,floorId:sceneEnemy.floorId,wave:sceneEnemy.wave,stats:sceneEnemy._provenance}:m._provenance;
  const hitShares=[.3,.3,.4];
  return {id,name:sceneEnemy?.name??m.name,monsterId,childId,side:'enemy',level,element:'Ice',
    panel:{hp,atk:m.atk,def,speed,critRate:0,critDmg:0,effectRes:sceneStatusRes(sceneEnemy,m.statusRes),energyRegen:1,elemDmg:{},baseStats:{atk:m.atk,hp,def}},
    baseSpeed:speed,energy:0,energyMax:0,toughnessMax:sceneToughness(sceneEnemy,stance),weaknesses:sceneEnemy?.weakness??m.weakness,
    res:sceneEnemy?.res??m.res,standardBreak:true,rank:'elite',
    enemyKit:{id:8003010,revision:'4.6-ice-out-of-space-1',aiPath:'Config/ConfigAI/Monster_XP_Elite01_01_AI.json',
      aiSequence:[800301001,800301002,800301003,800301001],oneMorePerTurn:true,icepointToughnessAdded:120,
      skill03FreezeChance:.6,skill03FreezeDuration:1,skill03FreezeActionDelay:1.2,skill04FreezeChance:1,
      skill01FrozenBonusMultiplier:1},
    actions:{basic:{name:'未使用的基础攻击',type:'Normal',element:'Ice',target:'single',terms:[],hitEnergy:0},
      skill01:{name:'叹息之寒',type:'Normal',element:'Ice',target:'single',terms:[{scaling:'atk',multiplier:2.5}],hitEnergy:10,hitEnergyPerHit:true},
      skill02:{name:'汲取霜晶',type:'Normal',element:'Ice',target:'self',terms:[]},
      skill03:{name:'永冬之雨',type:'Normal',element:'Ice',target:'all',terms:[{scaling:'atk',multiplier:2}],
        hitShares,hitEnergy:15,hitEnergyShares:hitShares,hitEnergyPerHit:true},
      skill04:{name:'叹息之寒',type:'Normal',element:'Ice',target:'single',terms:[{scaling:'atk',multiplier:2.5}],hitEnergy:10,hitEnergyPerHit:true}},
    policy:{autoUltimate:false,rotation:['skill01','skill02']},
    unsupported:['【冻结】的通用追加冰伤与完整行动条结算尚未逐项复刻',
      'Skill01 在冰点下对冻结目标的 AI 选靶并列顺序及无冻结目标时的回退条件未对拍',
      'Skill04 是源文件中的备用招式，但当前 AI 轮转未选择它'],
    provenance:{version:ctx.data._meta.version,source:'DimbreathBot/TurnBasedGameData@312b4597691e0a29cf9828a15b592757dba86949',
      stats:sceneEnemy?{source:'abyss_wave_monsters',mode:sceneEnemy.mode,seasonId:sceneEnemy.seasonId,floorId:sceneEnemy.floorId,wave:sceneEnemy.wave,stats:sceneEnemy._provenance}:m._provenance,scene:provenance,
      ai:'Config/ConfigAI/Monster_XP_Elite01_01_AI.json',character:'Config/ConfigCharacter/Monster/Monster_XP_Elite01_01_Config.json',
      ability:'Config/ConfigAbility/Monster/Monster_XP_Elite01_01_Ability.json',globalModifier:'Config/ConfigGlobalModifier/GlobalModifier_Monster.json',
      commonModifier:'Config/ConfigGlobalModifier/GlobalModifier_Common_Specific.json',
      sourceHashes:{ai:'314f2b71b1edc8163038ce8c170d9ef6fb9a28c7',character:'874b1731599f2fe484086dc842beb8372fbce258',
        ability:'d166542fe3e277e0a0aba67b0ce6c3fb9fb1c54f',globalModifier:'949b382738cbbf13dc22014792c73249215fe8bf',
        commonModifier:'e043cdc0650741eb27049b0c1a0710bccb77618f'}}};
}

// 2013020 -> Monster_W2_Valkyrie02_00. Its four-step AI counter cycles
// 剖判 / 镇魂 / 镇魂 / 转阴阳. 震荡 becomes 强烈震荡 on the next hit;
// 拘魂令 then fixes the target of the next 天坠. Source hashes and mechanics
// notes live in docs/敌人机制还原目标-20261021.md.
export function goldenScourge(ctx,{sceneEnemy=null,level=90,id='golden-scourge-1'}={}){
  const childId=sceneEnemy?.childId??2013020;
  if(childId!==2013020)throw new Error('金人勾魂使场景记录 childId 不匹配');
  level=sceneEnemy?.level??level;
  const m=buildSceneMonster(ctx,sceneEnemy,sceneEnemy?.monsterId??2013020,childId,level);
  for(const k of ['hp','atk','def','speed','stance'])if(!Number.isFinite(m[k]))throw new Error('金人勾魂使缺少 '+k+' 数据');
  const hp=sceneEnemy?.hp??m.hp,def=sceneEnemy?.def??m.def,speed=sceneEnemy?.speed??m.speed,stance=sceneEnemy?.stance??m.stance;
  for(const [k,v] of Object.entries({hp,def,speed,stance}))if(!Number.isFinite(v)||v<=0)throw new Error('金人勾魂使场景 '+k+' 无效');
  const provenance=sceneEnemy?{source:'abyss_wave_monsters',mode:sceneEnemy.mode,seasonId:sceneEnemy.seasonId,floorId:sceneEnemy.floorId,stats:sceneEnemy._provenance}:m._provenance;
  const strike=(name,multiplier,count=1,hitEnergy=10,energyShares=null)=>({name,type:'Normal',element:'Physical',target:'single',terms:[{scaling:'atk',multiplier}],...(count>1?{hitShares:Array(count).fill(1/count),hitEnergyShares:energyShares??Array(count).fill(1/count)}:{}),hitEnergy,hitEnergyPerHit:count>1});
  const finisher=strike('天坠',4,4,20,[.5,.5,.5,.5]);
  return {id,name:sceneEnemy?.name??m.name,monsterId:2013020,childId:2013020,side:'enemy',level,element:'Physical',
    panel:{hp,atk:m.atk,def,speed,critRate:0,critDmg:0,effectRes:sceneStatusRes(sceneEnemy,m.statusRes),energyRegen:1,elemDmg:{},baseStats:{atk:m.atk,hp,def}},
    baseSpeed:speed,energy:0,energyMax:0,toughnessMax:sceneToughness(sceneEnemy,stance),weaknesses:sceneEnemy?.weakness??m.weakness,res:sceneEnemy?.res??m.res,standardBreak:true,rank:'elite',
    enemyKit:{id:2013020,revision:'4.6-golden-scourge-1',aiPath:'Config/ConfigAI/Monster_W2_Valkyrie02_00_AI.json',
      aiSequence:[201302001,201302002,201302002,201302003],skill04Multiplier:4,skill04Hits:4,skill04BonusMultiplier:2,
      unstableChance:.7,unstableDuration:2,shakeChance:1,shakeDuration:1,shakeDelayRatio:.7,shakeSkipTurns:1,
      skill03Chance:.35,skill03MaxTargets:2},
    actions:{basic:{name:'未使用的基础攻击',type:'Normal',element:'Physical',target:'single',terms:[],hitEnergy:0},
      skill:{...strike('剖判',3,2,10)},skill01:strike('剖判',3,2,10),skill02:strike('镇魂',3.6,1,10),
      skill03:{name:'转阴阳',type:'Normal',element:'Physical',target:'all',terms:[{scaling:'atk',multiplier:3}],hitShares:[.5,.5],hitEnergyShares:[.5,.5],hitEnergy:10,hitEnergyPerHit:true},
      skill04:finisher,skill06:strike('天坠',4,4,10,[.5,.5,.5,.5]),
      skill04Insert:{name:'拘魂令',type:'Normal',element:'Physical',target:'single',terms:[],hitEnergy:0}},
    policy:{autoUltimate:false},unsupported:['OneMorePerTurn 与 Skill04/Skill06 的额外行动时机尚未完全对拍'],
    provenance:{version:ctx.data._meta.version,source:'DimbreathBot/TurnBasedGameData@312b4597691e0a29cf9828a15b592757dba86949',stats:provenance,
      ai:'Config/ConfigAI/Monster_W2_Valkyrie02_00_AI.json',character:'Config/ConfigCharacter/Monster/Monster_W2_Valkyrie02_00_Config.json',
      ability:'Config/ConfigAbility/Monster/Monster_W2_Valkyrie02_00_Ability.json',sharedAbility:'Config/ConfigAbility/Monster/Monster_W2_Valkyrie01_00_Ability.json',
      sourceHashes:{ai:'5b7f5561ddc6cbb8e40b2ef01bb0fdb8c6cd0dbc',character:'eb2e95c5672f0ab7db568a333db4f8ebeee6e734',
        ability:'d149848a58bdcaef8f25c2be216c6164dcead749',sharedAbility:'8cd9339435bb6ced13be241a759c0e2851a6d4e6'}}};
}

// 2023020 -> Monster_W2_Beast02_00. Skill04 starts the monitor / 3-yuanqi
// cycle; Skill01/02 spend one stack for a 4.75x quantum attack, while Skill03
// adds the source 20% damage layer. The AI and OneMorePerTurn chain are kept in
// source order; remaining combat-alert and break/target edge cases are listed.
export function longRight(ctx,{sceneEnemy=null,level=90,id='long-right-1'}={}){
  const childId=sceneEnemy?.childId??2023020;
  if(childId!==2023020)throw new Error('丰饶灵兽·长右场景记录 childId 不匹配');
  level=sceneEnemy?.level??level;
  const m=buildSceneMonster(ctx,sceneEnemy,sceneEnemy?.monsterId??2023020,childId,level);
  for(const k of ['hp','atk','def','speed','stance'])if(!Number.isFinite(m[k]))throw new Error('丰饶灵兽·长右缺少 '+k+' 数据');
  const hp=sceneEnemy?.hp??m.hp,def=sceneEnemy?.def??m.def,speed=sceneEnemy?.speed??m.speed,stance=sceneEnemy?.stance??m.stance;
  for(const [k,v] of Object.entries({hp,def,speed,stance}))if(!Number.isFinite(v)||v<=0)throw new Error('丰饶灵兽·长右场景 '+k+' 无效');
  const provenance=sceneEnemy?{source:'abyss_wave_monsters',mode:sceneEnemy.mode,seasonId:sceneEnemy.seasonId,floorId:sceneEnemy.floorId,wave:sceneEnemy.wave,stats:sceneEnemy._provenance}:m._provenance;
  const strike={name:'猱击',type:'Normal',element:'Quantum',target:'single',terms:[{scaling:'atk',multiplier:4.75}],hitEnergy:15,hitEnergyPerHit:true};
  return {id,name:sceneEnemy?.name??m.name,monsterId:2023020,childId:2023020,side:'enemy',level,element:'Quantum',
    panel:{hp,atk:m.atk,def,speed,critRate:0,critDmg:0,effectRes:sceneStatusRes(sceneEnemy,m.statusRes),energyRegen:1,elemDmg:{},baseStats:{atk:m.atk,hp,def}},
    baseSpeed:speed,energy:0,energyMax:0,toughnessMax:sceneToughness(sceneEnemy,stance),weaknesses:sceneEnemy?.weakness??m.weakness,res:sceneEnemy?.res??m.res,standardBreak:true,rank:'elite',
    enemyKit:{id:2023020,revision:'4.6-long-right-1',aiPath:'Config/ConfigAI/Monster_W2_Beast02_00_AI.json',
      aiSequence:[202302004,202302003,202302001,202302003,202302001,202302003,202302002,202302005],
      skillMultiplier:4.75,bulletCount:3,damageUpPerLayer:.2,damageUpDuration:2,damageUpLayers:3,extraActionsPerTurn:1},
    actions:{basic:{name:'未使用的基础攻击',type:'Normal',element:'Quantum',target:'single',terms:[],hitEnergy:0},
      skill:strike,skill01:{...strike},skill02:{...strike},
      skill03:{name:'奋威',type:'Normal',element:'Quantum',target:'self',terms:[],hitEnergy:0},
      skill04:{name:'怒啸',type:'Normal',element:'Quantum',target:'single',terms:[],hitEnergy:0},
      skill05:{name:'收招 · 移除弱势',type:'Normal',element:'Quantum',target:'self',terms:[],hitEnergy:0}},
    policy:{autoUltimate:false},unsupported:['AI 选择器无可用标记时的失败分支、受限网格目标过滤和战斗警告按钮状态未完整对拍','弱点击破恰在 AIFlag=8 时的阶段切换尚未对拍'],
    provenance:{version:ctx.data._meta.version,source:'DimbreathBot/TurnBasedGameData@312b4597691e0a29cf9828a15b592757dba86949',stats:m._provenance,scene:provenance,
      ai:'Config/ConfigAI/Monster_W2_Beast02_00_AI.json',character:'Config/ConfigCharacter/Monster/Monster_W2_Beast02_00_Config.json',
      ability:'Config/ConfigAbility/Monster/Monster_W2_Beast02_00_Ability.json',sharedModifier:'Config/ConfigGlobalModifier/GlobalModifier_Common_Specific.json',
      sourceHashes:{ai:'30b080d31feca7bc8117ee3fdb47bc63829aafcf',character:'ccb3c2bae993496a8e539fdf8de498f9268e9c51',
        ability:'d2b1319b4801ad631b22cc8b0a55fcc96acb4ac9',sharedModifier:'e043cdc0650741eb27049b0c1a0710bccb77618f'}}};
}

// 3013010 -> Monster_W3_Dinosaur_01. The sourced AI uses a three-action flag
// loop, then OneMorePerTurn inserts 痛恶如刺剔骨. Its hit count is 3 plus the
// current 无明火 layer count; each hit is 2x ATK Quantum damage.
export function fadedRageShell(ctx,{sceneEnemy=null,level=90,id='faded-rage-shell-1'}={}){
  const childId=sceneEnemy?.childId??3013010;
  if(childId!==3013010)throw new Error('狂怒褪去之壳场景记录 childId 不匹配');
  level=sceneEnemy?.level??level;
  const m=buildSceneMonster(ctx,sceneEnemy,sceneEnemy?.monsterId??3013010,childId,level);
  for(const k of ['hp','atk','def','speed','stance'])if(!Number.isFinite(m[k]))throw new Error('狂怒褪去之壳缺少 '+k+' 数据');
  const hp=sceneEnemy?.hp??m.hp,def=sceneEnemy?.def??m.def,speed=sceneEnemy?.speed??m.speed,stance=sceneEnemy?.stance??m.stance;
  for(const [k,v] of Object.entries({hp,def,speed,stance}))if(!Number.isFinite(v)||v<=0)throw new Error('狂怒褪去之壳场景 '+k+' 无效');
  const provenance=sceneEnemy?{source:'abyss_wave_monsters',mode:sceneEnemy.mode,seasonId:sceneEnemy.seasonId,floorId:sceneEnemy.floorId,
    wave:sceneEnemy.wave,stats:sceneEnemy._provenance}:m._provenance;
  return {id,name:sceneEnemy?.name??m.name,monsterId:3013010,childId:3013010,side:'enemy',level,element:'Quantum',
    panel:{hp,atk:m.atk,def,speed,critRate:0,critDmg:0,effectRes:sceneStatusRes(sceneEnemy,m.statusRes),energyRegen:1,elemDmg:{},baseStats:{hp,atk:m.atk,def}},
    baseSpeed:speed,energy:0,energyMax:0,toughnessMax:sceneToughness(sceneEnemy,stance),weaknesses:sceneEnemy?.weakness??m.weakness,
    res:sceneEnemy?.res??m.res,standardBreak:true,rank:'elite',
    enemyKit:{id:3013010,revision:'4.6-faded-rage-shell-1',aiPath:'Config/ConfigAI/Monster_W3_Dinosaur_01_AI.json',
      aiSequence:[301301001,301301003,301301002,301301004],growthMax:5,skill07BaseHits:3,skill07DamageMultiplier:2,
      skill07HitEnergy:5,superArmorDamageReduction:.6,superArmorBreakDelay:.75,superArmorBreakDamageTaken:.5,oneMorePerTurn:true},
    actions:{basic:{name:'未使用的基础攻击',type:'Normal',element:'Quantum',target:'single',terms:[],hitEnergy:0},
      skill01:{name:'怀恨礼',type:'Normal',element:'Quantum',target:'single',terms:[{scaling:'atk',multiplier:3}],hitEnergy:10,hitEnergyPerHit:true},
      skill06:{name:'宿怨如浪翻涌',type:'Normal',element:'Quantum',target:'all',terms:[{scaling:'atk',multiplier:1.8}],hitEnergy:10,hitEnergyPerHit:true},
      skill04:{name:'怒叱如雷轰鸣',type:'Normal',element:'Quantum',target:'self',terms:[]},
      skill07:{name:'痛恶如刺剔骨',type:'Normal',element:'Quantum',target:'all',terms:[]}},
    policy:{autoUltimate:false},unsupported:[],
    provenance:{version:ctx.data._meta.version,source:'DimbreathBot/TurnBasedGameData@312b4597691e0a29cf9828a15b592757dba86949',
      stats:sceneEnemy?{source:'abyss_wave_monsters',mode:sceneEnemy.mode,seasonId:sceneEnemy.seasonId,floorId:sceneEnemy.floorId,stats:sceneEnemy._provenance}:m._provenance,
      scene:provenance,ai:'Config/ConfigAI/Monster_W3_Dinosaur_01_AI.json',character:'Config/ConfigCharacter/Monster/Monster_W3_Dinosaur_01_Config.json',
      ability:'Config/ConfigAbility/Monster/Monster_W3_Dinosaur_01_Ability.json',sharedModifier:'Config/ConfigGlobalModifier/GlobalModifier_Monster.json',
      sourceHashes:{ai:'12a4b0027b2eb1007b81d3065a369f4998a05219',character:'393f4f085b9ab6688474724210c1b277968c29a3',
        ability:'b5e92c7f3856fd3642d2c8b94eb8233766445d00',sharedModifier:'949b382738cbbf13dc22014792c73249215fe8bf'}}};
}

// 2004014 -> Kafka's IF03 boss variant. The scene supplies each child's real
// panel / 2-bar HP contract; only the sourced attack loop and immediate Charm
// action are executable here. Summons and the phase-2 reveal chain remain gaps.
export function soulhookSovereign(ctx,{sceneEnemy=null,level=90,id='soulhook-sovereign-1'}={}){
  const childId=sceneEnemy?.childId??200401401;
  if(![200401401,200401402,200401403,200401404].includes(childId))throw new Error('支配者场景记录 childId 不匹配');
  level=sceneEnemy?.level??level;
  const m=buildSceneMonster(ctx,sceneEnemy,sceneEnemy?.monsterId??2004014,childId,level);
  for(const k of ['hp','atk','def','speed','stance'])if(!Number.isFinite(m[k]))throw new Error('支配者缺少 '+k+' 数据');
  const hp=sceneEnemy?.hp??m.hp,def=sceneEnemy?.def??m.def,speed=sceneEnemy?.speed??m.speed,stance=sceneEnemy?.stance??m.stance;
  for(const [k,v] of Object.entries({hp,def,speed,stance}))if(!Number.isFinite(v)||v<=0)throw new Error('支配者场景 '+k+' 无效');
  const phaseRatios=sceneEnemy?.phaseRatios??m.phaseRatios??[1],hpCount=sceneEnemy?.hpCount??m.hpCount??phaseRatios.length;
  const unsupported=[
    '唤声灵形的精英召唤、共享生命、弱点传递与死亡转移未实现',
    '第二阶段【心理暗示 / 揭晓】和阶段助战未实现',
    '触电触发的【颤慄】【残酷】追加攻击未实现',
    'AI 队伍人数分支和 MCommon_MindControl 的多段伤害分摊细节未完全对拍',
    'Skill02相邻段时序 / Skill04六次0.1加末段0.4的七次命中与受击回能分段未完整对拍（总倍率已按来源复原）',
  ];
  const provenance=sceneEnemy?{source:'abyss_wave_monsters',mode:sceneEnemy.mode,seasonId:sceneEnemy.seasonId,floorId:sceneEnemy.floorId,
    wave:sceneEnemy.wave,stats:sceneEnemy._provenance}:m._provenance;
  return {id,name:sceneEnemy?.name??m.name,monsterId:2004014,childId,side:'enemy',level,element:'Thunder',
    panel:{hp,atk:m.atk,def,speed,critRate:0,critDmg:0,effectRes:sceneStatusRes(sceneEnemy,m.statusRes),energyRegen:1,elemDmg:{},baseStats:{hp,atk:m.atk,def}},
    baseSpeed:speed,energy:0,energyMax:0,toughnessMax:sceneToughness(sceneEnemy,stance),weaknesses:sceneEnemy?.weakness??m.weakness,
    res:sceneEnemy?.res??m.res,standardBreak:true,rank:'elite',hpCount,phaseRatios,
    enemyKit:{id:2004014,revision:'4.6-soulhook-sovereign-1',aiPath:'Config/ConfigAI/Monster_W2_Kafka_00_IF03_AI.json',
      aiSequenceByPhase:{1:['skill01','skill02','skill05'],2:['skill04','skill02','skill07','skill02']},resetToughnessOnHpBarChange:true,
      skill01Multiplier:2.5,skill02Multiplier:2.5,skill02AdjacentMultiplier:1.75,skill03Multiplier:3,
      skill04Multiplier:2.5,skill04ShockMultiplier:1.2,shockChance:1,shockDuration:3,shockDamageRatio:.5,
      charmChance:1.2,charmDuration:1,charmDamageMultiplier:2.5,charmMinRatio:.5,charmMaxRatio:1.5},
    actions:{basic:{name:'未使用的基础攻击',type:'Normal',element:'Thunder',target:'single',terms:[],hitEnergy:0},
      skill01:{name:'夜间喧嚣不止',type:'Normal',element:'Thunder',target:'single',terms:[{scaling:'atk',multiplier:2.5}],
        hitShares:[.5,.5],hitEnergyShares:[.5,.5],hitEnergy:10,hitEnergyPerHit:true},
      skill02:{name:'月光摩挲连绵',type:'Normal',element:'Thunder',target:'single',terms:[{scaling:'atk',multiplier:2.5}],
        hitShares:[.2,.3,.5],hitEnergyShares:[1,1,1],hitEnergy:10,hitEnergyPerHit:true},
      skill03:{name:'缄默厉声嘲笑',type:'Normal',element:'Thunder',target:'all',terms:[{scaling:'atk',multiplier:3}],hitEnergy:15,hitEnergyPerHit:true},
      skill04:{name:'亡者切齿呢喃',type:'Normal',element:'Thunder',target:'single',terms:[{scaling:'atk',multiplier:2.5}],hitEnergy:10,hitEnergyPerHit:true},
      skill05:{name:'言灵',type:'Normal',element:'Thunder',target:'single',terms:[],hitEnergy:0,
        effects:[{type:'buff',name:'支配',key:'dmgBoost',value:0,duration:1,chance:1.2,control:'charm',noUltimate:true,actionAdvance:true,
          charmDamagePercent:2.5,minDamageRatio:.5,maxDamageRatio:1.5,removeOnBreak:true,removeOnSourceBreak:true,removeOnSourceDeath:true}]},
      skill06:{name:'残酷',type:'Normal',element:'Thunder',target:'single',terms:[],hitEnergy:0},
      skill07:{name:'心理暗示',type:'Normal',element:'Thunder',target:'self',terms:[],hitEnergy:0},
      skillIF01:{name:'唤声灵形',type:'Normal',element:'Thunder',target:'self',terms:[],hitEnergy:0}},
    policy:{autoUltimate:false},unsupported,
    provenance:{version:ctx.data._meta.version,source:'DimbreathBot/TurnBasedGameData@312b4597691e0a29cf9828a15b592757dba86949',
      stats:sceneEnemy?{source:'abyss_wave_monsters',mode:sceneEnemy.mode,seasonId:sceneEnemy.seasonId,floorId:sceneEnemy.floorId,stats:sceneEnemy._provenance}:m._provenance,
      scene:provenance,ai:'Config/ConfigAI/Monster_W2_Kafka_00_IF03_AI.json',
      character:'Config/ConfigCharacter/Monster/Monster_W2_Kafka_00_IF03_Config.json',
      ability:['Config/ConfigAbility/Monster/Monster_W2_Kafka_00_Ability.json','Config/ConfigAbility/Monster/Monster_W2_Kafka_00_IF_Ability.json',
        'Config/ConfigAbility/Monster/Monster_W2_Kafka_00_IFEX_Ability.json','Config/ConfigGlobalModifier/GlobalModifier_Common_Specific.json'],
      sourceHashes:{ai:'7f13e2e45221e22daaa17abcd5116c6dd4df71a8',ability:'200c1acf064378621610ce83cfa41ccbf1169546',
        phaseAbility:'7b63f6f41825633cf1082f6172b42db2f5537cb8',ifexAbility:'3bf992b5cf8122a72bd120d6e249f48594ba450c',
        sharedModifier:'e043cdc0650741eb27049b0c1a0710bccb77618f'}}};
}

// 4064012 -> Arbiter of the Lost Abyss. The AS phase_json overrides the base
// split with five Golden Blood Memosprites and a second shared-HP split. This
// actor executes only the verified boss-panel, two-bar, AI-flag and attack
// subset; adds, stage tags and several target/state chains remain explicit gaps.
export function arbiterOfLostAbyss(ctx,{sceneEnemy=null,level=90,id='arbiter-of-lost-abyss-1'}={}){
  const childId=sceneEnemy?.childId??406401204;
  if(![406401201,406401202,406401203,406401204].includes(childId))throw new Error('裁定者场景记录 childId 不匹配');
  level=sceneEnemy?.level??level;
  const m=buildSceneMonster(ctx,sceneEnemy,sceneEnemy?.monsterId??4064012,childId,level);
  for(const k of ['hp','atk','def','speed','stance'])if(!Number.isFinite(m[k]))throw new Error('裁定者缺少 '+k+' 数据');
  const hp=sceneEnemy?.hp??m.hp,def=sceneEnemy?.def??m.def,speed=sceneEnemy?.speed??m.speed,stance=sceneEnemy?.stance??m.stance;
  for(const [k,v] of Object.entries({hp,def,speed,stance}))if(!Number.isFinite(v)||v<=0)throw new Error('裁定者场景 '+k+' 无效');
  const phaseRatios=sceneEnemy?.phaseRatios??m.phaseRatios??[1,1],hpCount=sceneEnemy?.hpCount??m.hpCount??phaseRatios.length;
  const unsupported=[
    'AS【化整为零】的5只忆灵、假死合体与第二次分裂尚未接入；基础技能文本的3种分裂不能代替场景阶段配置',
    '第二阶段忆灵共享生命、类型/子体分配和召唤物 AI 尚未实现；【规模效应】依赖五只忆灵登场后按存活数量实时结算',
    '【坚防守备】的弱点击破后行动延后与受伤提高未结算；基础减伤会按本场半场参数应用',
    '【执刑就位】召唤、【罪血眈视】锁定加速、【指名祸首】追加行动和【罪血腐蚀】尚未完整实现',
    '【壁垒反震】、【侵蚀】、【劣化残躯】及其韧性/真实伤害联动未实现',
    '【罪血枭首】被锁定目标差异倍率与攻击前承伤快照未对拍；其蓄力 / 追加打击条件尚未还原',
    'AI 主旗标人数 / OneMore 分支已按源配置执行；蓄力 AttackFlag、OneMore 实际刷新次数、锁定目标与插入行动链未对拍',
  ];
  const provenance=sceneEnemy?{source:'abyss_wave_monsters',mode:sceneEnemy.mode,seasonId:sceneEnemy.seasonId,floorId:sceneEnemy.floorId,
    wave:sceneEnemy.wave,stats:sceneEnemy._provenance}:m._provenance;
  const oneHit=(name,target,multiplier,hitEnergy)=>({name,type:'Normal',element:'Imaginary',target,
    terms:[{scaling:'atk',multiplier}],hitEnergy,hitEnergyPerHit:true});
  return {id,name:sceneEnemy?.name??m.name,monsterId:4064012,childId,side:'enemy',level,element:'Imaginary',
    panel:{hp,atk:m.atk,def,speed,critRate:0,critDmg:0,effectRes:sceneStatusRes(sceneEnemy,m.statusRes),energyRegen:1,elemDmg:{},baseStats:{hp,atk:m.atk,def}},
    baseSpeed:speed,energy:0,energyMax:0,toughnessMax:sceneToughness(sceneEnemy,stance),weaknesses:sceneEnemy?.weakness??m.weakness,
    res:sceneEnemy?.res??m.res,standardBreak:true,rank:'elite',hpCount,phaseRatios,
    enemyKit:{id:4064012,revision:'4.6-arbiter-partial-2',aiPath:'Config/ConfigAI/Monster_W4_Serpent_01_AI.json',
      stageTags:(sceneEnemy?.stageMechanics?.tags??[]).map(tag=>({name:tag.name,params:tag.param??[],skillId:tag.skill_id??null})),
      partiallyImplementedStageEffects:['坚防守备：基础伤害降低参数','规模效应：读取源配置的每只存活敌方单位增伤 / 减伤参数'],
      aiFlagRangeByPhase:{1:[1,2,3,4],2:[1,2,3,4,5,6,7,8]},
      skill01Multiplier:1.8,skill04Multiplier:1.8,skill04HitShares:[.1,.1,.1,.1,.1,.1,.4],
      skill05Multiplier:3.5,skill05HitShares:[.3,.3,.4],skill07MarkedMultiplier:12,skill07OtherMultiplier:4,
      resetToughnessOnHpBarChange:true},
    actions:{basic:{name:'未使用的基础攻击',type:'Normal',element:'Imaginary',target:'single',terms:[],hitEnergy:0},
      skill01:oneHit('罪血嚼齿','single',1.8,10),
      skill02:{name:'执刑就位',type:'Normal',element:'Imaginary',target:'self',terms:[],hitEnergy:0},
      skill03:{name:'罪血眈视',type:'Normal',element:'Imaginary',target:'self',terms:[],hitEnergy:0},
      skill04:{...oneHit('罪血锯刑','single',1.8,15),hitShares:[.1,.1,.1,.1,.1,.1,.4],hitEnergyShares:[1,1,1,1,1,1,1]},
      skill05:{...oneHit('罪血钳刑','all',3.5,10),hitShares:[.3,.3,.4],hitEnergyShares:[1,1,1]},
      skill06:{name:'指名祸首',type:'Normal',element:'Imaginary',target:'single',terms:[],hitEnergy:0},
      skill07:oneHit('罪血枭首','all',4,15)},
    policy:{autoUltimate:false},unsupported,
    provenance:{version:ctx.data._meta.version,source:'DimbreathBot/TurnBasedGameData@312b4597691e0a29cf9828a15b592757dba86949',
      stats:provenance,scene:provenance,ai:'Config/ConfigAI/Monster_W4_Serpent_01_AI.json',
      character:'Config/ConfigCharacter/Monster/Monster_W4_Serpent_01_Config.json',
      ability:'Config/ConfigAbility/Monster/Monster_W4_Serpent_01_Ability.json',
      sourceHashes:{ai:'cfbe4746a7930a2200c4a0bf5df8f7f7e8b69e9e',character:'dd1d84b02033d19780c2b44ccf601ff8653ca95e',
        ability:'c4b0918bf28ddb273aa140580f968787f9305204',phaseAbility:'7a34fc0c8a951b7c0d21bd4551148b8f158809f9',
        phaseCharacter:'ef962a3a2f020cdf9348f1aecc8f22af12000d2c'}}};
}

// 5013010 -> Monster_W4_Claymore_02. AIFlag 1 runs Skill01 + Skill02 in one
// turn; flag 3 charges unless OneMore / the level mark selects a sweep; flag 4
// uses Skill04; flag 2 runs Skill02 + Skill01; flag 5 uses Skill05 or Skill052.
// Aha interrupts charge with Skill042. Remaining OneMore timing/count and
// dynamic Skill052 hashes stay explicit until their callbacks are matched.
export function rockingRebel(ctx,{sceneEnemy=null,level=90,id='rocking-rebel-1'}={}){
  const childId=sceneEnemy?.childId??5013010;
  if(childId!==5013010)throw new Error('摇滚狂徒场景记录 childId 不匹配');
  level=sceneEnemy?.level??level;
  const m=buildSceneMonster(ctx,sceneEnemy,sceneEnemy?.monsterId??5013010,childId,level);
  for(const k of ['hp','atk','def','speed','stance'])if(!Number.isFinite(m[k]))throw new Error('摇滚狂徒缺少 '+k+' 数据');
  const hp=sceneEnemy?.hp??m.hp,def=sceneEnemy?.def??m.def,speed=sceneEnemy?.speed??m.speed,stance=sceneEnemy?.stance??m.stance;
  for(const [k,v] of Object.entries({hp,def,speed,stance}))if(!Number.isFinite(v)||v<=0)throw new Error('摇滚狂徒场景 '+k+' 无效');
  const provenance=sceneEnemy?{source:'abyss_wave_monsters',mode:sceneEnemy.mode,seasonId:sceneEnemy.seasonId,floorId:sceneEnemy.floorId,
    wave:sceneEnemy.wave,stats:sceneEnemy._provenance}:m._provenance;
  return {id,name:sceneEnemy?.name??m.name,monsterId:5013010,childId:5013010,side:'enemy',level,element:'Imaginary',
    panel:{hp,atk:m.atk,def,speed,critRate:0,critDmg:0,effectRes:sceneStatusRes(sceneEnemy,m.statusRes),energyRegen:1,elemDmg:{},baseStats:{hp,atk:m.atk,def}},
    baseSpeed:speed,energy:0,energyMax:0,toughnessMax:sceneToughness(sceneEnemy,stance),weaknesses:sceneEnemy?.weakness??m.weakness,
    res:sceneEnemy?.res??m.res,standardBreak:true,rank:'elite',
    enemyKit:{id:5013010,revision:'4.6-rocking-rebel-1',aiPath:'Config/ConfigAI/Monster_W4_Claymore_02_AI.json',
      abilityPath:'Config/ConfigAbility/Monster/Monster_W4_Claymore_02_Ability.json',
      aiSequence:[501301001,501301003,501301004,501301002,501301005],aiCombosByFlag:{1:['skill01','skill02'],2:['skill02','skill01']},
      skill01Multiplier:2.8,skill04Multiplier:5,
      chargeAhaLaughter:10,chargeAhaVulnerability:.4,chargeAhaVulnerabilityDuration:2,
      skill05SpeedRatio:.5,skill05SpeedDuration:2,skill052DamageMaxHpRatio:.1,skill052DizzyChance:.5,
      skill052DizzyDuration:2,skill052Laughter:10},
    actions:{basic:{name:'未使用的基础攻击',type:'Normal',element:'Imaginary',target:'single',terms:[],hitEnergy:0},
      skill01:{name:'左扫弦！',type:'Normal',element:'Imaginary',target:'sweep',sweepDirection:'left',terms:[{scaling:'atk',multiplier:2.8}],hitEnergy:10,hitEnergyPerHit:true},
      skill02:{name:'右扫弦！',type:'Normal',element:'Imaginary',target:'sweep',sweepDirection:'right',terms:[{scaling:'atk',multiplier:2.8}],hitEnergy:10,hitEnergyPerHit:true},
      skill03:{name:'演出彩排',type:'Normal',element:'Imaginary',target:'self',terms:[]},
      skill04:{name:'摇滚时刻！',type:'Normal',element:'Imaginary',target:'all',terms:[{scaling:'atk',multiplier:5}],hitEnergy:20,hitEnergyPerHit:true},
      skill05:{name:'燥起来吧！',type:'Normal',element:'Imaginary',target:'self',terms:[]},
      skill052:{name:'燥起来吧！·狂奏',type:'Normal',element:'Imaginary',target:'single',terms:[]},
      skill042:{name:'演出彩排 · 阿哈打断',type:'Normal',element:'Imaginary',target:'self',terms:[]}},
    policy:{autoUltimate:false},
    unsupported:['OneMore / OneMorePerTurn 的即时行动次数与控制中断条件、Skill03_Mark 关卡标记分支尚未完全对拍',
      'Skill052 的动态哈希到最大生命伤害、陶醉命中与笑点参数映射按 4.6 技能参数近似；源回调含未解码任务 JDOLDFECMPL'],
    provenance:{version:ctx.data._meta.version,source:'DimbreathBot/TurnBasedGameData@312b4597691e0a29cf9828a15b592757dba86949',
      stats:sceneEnemy?{source:'abyss_wave_monsters',mode:sceneEnemy.mode,seasonId:sceneEnemy.seasonId,floorId:sceneEnemy.floorId,stats:sceneEnemy._provenance}:m._provenance,
      scene:provenance,ai:'Config/ConfigAI/Monster_W4_Claymore_02_AI.json',ability:'Config/ConfigAbility/Monster/Monster_W4_Claymore_02_Ability.json',
      sourceHashes:{ai:'ccd74e200b11c67c8fdc741ce4acb04ccec870a6',ability:'7f2d46f03dfe73e72c9371253afc243a081acb94'}}};
}

// 4063010 金血忆灵·翼蛇形：the sixth AI flag chain and its five-layer
// charge/counter are source-backed. Skill04's damage expression and the shared
// Erosion/RallyHP effects remain explicitly partial until their formulas land.
export function wingedSerpent(ctx,{sceneEnemy=null,level=90,id='winged-serpent-1'}={}){
  const childId=sceneEnemy?.childId??4063010;
  if(![4063010,406301001].includes(childId))throw new Error('翼蛇形忆灵场景记录 childId 不匹配');
  level=sceneEnemy?.level??level;
  const m=buildSceneMonster(ctx,sceneEnemy,sceneEnemy?.monsterId??4063010,childId,level);
  for(const k of ['hp','atk','def','speed','stance'])if(!Number.isFinite(m[k]))throw new Error('翼蛇形忆灵缺少 '+k+' 数据');
  const hp=sceneEnemy?.hp??m.hp,def=sceneEnemy?.def??m.def,speed=sceneEnemy?.speed??m.speed,stance=sceneEnemy?.stance??m.stance;
  for(const [k,v] of Object.entries({hp,def,speed,stance}))if(!Number.isFinite(v)||v<=0)throw new Error('翼蛇形忆灵场景 '+k+' 无效');
  const provenance=sceneEnemy?{source:'abyss_wave_monsters',mode:sceneEnemy.mode,seasonId:sceneEnemy.seasonId,floorId:sceneEnemy.floorId,
    wave:sceneEnemy.wave,stats:sceneEnemy._provenance}:m._provenance;
  const hit=(name,target,multiplier,hitEnergy)=>({name,type:'Normal',element:'Imaginary',target,
    terms:[{scaling:'atk',multiplier}],hitEnergy,hitEnergyPerHit:true});
  return {id,name:sceneEnemy?.name??m.name,monsterId:4063010,childId,side:'enemy',level,element:'Imaginary',
    panel:{hp,atk:m.atk,def,speed,critRate:0,critDmg:0,effectRes:sceneStatusRes(sceneEnemy,m.statusRes),energyRegen:1,elemDmg:{},baseStats:{hp,atk:m.atk,def}},
    baseSpeed:speed,energy:0,energyMax:0,toughnessMax:sceneToughness(sceneEnemy,stance),weaknesses:sceneEnemy?.weakness??m.weakness,
    res:sceneEnemy?.res??m.res,standardBreak:true,rank:'elite',
    enemyKit:{id:4063010,revision:'4.6-winged-serpent-partial-1',aiPath:'Config/ConfigAI/Monster_W4_Serpent_00_AI.json',
      aiSequence:[406301002,406301001,406301003,406301004,406301001,406301002,406301003,406301004],
      skill01Multiplier:3.5,skill02Multiplier:3,skill02AdjacentMultiplier:2.5,chargeLayers:5,
      skill04BaseMultiplier:3.5,skill04HitCount:7,skill05Multiplier:1.5,skill05HitEnergy:5,
      oneMorePerTurn:true,counterOncePerTurn:true},
    actions:{basic:{name:'未使用的基础攻击',type:'Normal',element:'Imaginary',target:'single',terms:[],hitEnergy:0},
      skill01:hit('罪血鞭笞','single',3.5,10),
      skill02:{name:'罪血呛吐',type:'Normal',element:'Imaginary',target:'blast',
        terms:[{scaling:'atk',multiplier:3},{scaling:'atk',multiplier:2.5,target:'adjacent'}],hitEnergy:10,hitEnergyPerHit:true},
      skill03:{name:'威慑警戒',type:'Normal',element:'Imaginary',target:'self',terms:[],hitEnergy:0},
      skill04:{...hit('罪血涡旋','all',3.5,10),repeatCount:7},
      skill05:hit('扭矩反打','all',1.5,5),
      skill05ToStb:hit('扭矩反打','all',1.5,5)},
    policy:{autoUltimate:false},
    unsupported:[
      '罪血涡旋的动态倍率哈希（含【旋绕】层数缩放）尚未解析；回放暂按 3.5 倍攻击、7 段基础伤害近似',
      '罪血涡旋 / 扭矩反打的【侵蚀】与 RallyHP 生命转移、治疗、增伤联动尚未接入',
      '蓄力期间的特定终局关卡增伤 modifier 尚未接入',
    ],
    provenance:{version:ctx.data._meta.version,source:'DimbreathBot/TurnBasedGameData@312b4597691e0a29cf9828a15b592757dba86949',
      stats:provenance,scene:provenance,ai:'Config/ConfigAI/Monster_W4_Serpent_00_AI.json',
      character:'Config/ConfigCharacter/Monster/Monster_W4_Serpent_00_Config.json',
      ability:'Config/ConfigAbility/Monster/Monster_W4_Serpent_00_Ability.json',
      sourceHashes:{ai:'f19d9995589951b1b008b91d347e411c0d72c764',character:'268cbe02590e782c1f4754f2b602b77366a86eff',
        ability:'456289b2fe4e0e700744a9ceee5f5b722857c97f'}}};
}

function waveMaidBlueprint(ctx,sceneEnemy,id){
  const level=sceneEnemy.level??80,monsterId=4052010,childId=4052010;
  const m=buildSceneMonster(ctx,{...sceneEnemy,monsterId,childId,hp:null,stance:null,toughness:null,weakness:null},monsterId,childId,level);
  const hp=m.hp,def=m.def,speed=m.speed,atk=m.atk,stance=m.stance;
  return {id,name:'浪花侍女',monsterId,childId,side:'enemy',level,element:'Ice',
    panel:{hp,atk,def,speed,critRate:0,critDmg:0,effectRes:sceneStatusRes(sceneEnemy,m.statusRes),energyRegen:1,elemDmg:{},baseStats:{atk,hp,def}},
    baseSpeed:speed,energy:0,energyMax:0,toughnessMax:sceneEnemy?.toughness??stance/3,
    weaknesses:m.weakness,res:m.res,standardBreak:true,rank:'normal',wave:sceneEnemy.wave??1,
    enemyKit:{id:4052010,revision:'4.6-wave-maid-partial-1',aiPath:'Config/ConfigAI/Monster_Common_SequenceThree_AI.json',
      skill01Multiplier:1.8,skill01TransferRatio:.7,deathCounterMultiplier:.15,actionAdvanceHitCount:5,
      actionAdvanceDuringFrenzyHitCount:2,actionAdvanceDuringFrenzyRatio:.5},
    actions:{basic:{name:'未使用的基础攻击',type:'Normal',element:'Ice',target:'all',terms:[],hitEnergy:0},
      skill:{name:'海的裙摆飘荡',type:'Normal',element:'Ice',target:'all',terms:[{scaling:'atk',multiplier:1.8}],hitEnergy:10,hitEnergyPerHit:true}},
    policy:{autoUltimate:false,rotation:['skill']},
    unsupported:['【黑潮热】伤害转 DoT 与【在毁灭中狂欢】联动尚未接入','致命退场全体反击与【请泊舟暂歇】受击计数 / 行动提前尚未接入'],
    provenance:{version:ctx.data._meta.version,source:'DimbreathBot/TurnBasedGameData@312b4597691e0a29cf9828a15b592757dba86949',
      stats:m._provenance,scene:{source:'Monster_W4_Manta_00_Skill03 summoning template'},
      ai:'Config/ConfigAI/Monster_Common_SequenceThree_AI.json'}};
}
export function silvermaneGuard(ctx,{sceneEnemy=null,level=90,id='silvermane-guard-1'}={}){
  const childId=sceneEnemy?.childId??1002040;
  if(childId!==1002040)throw new Error('银鬃近卫场景记录 childId 不匹配');
  level=sceneEnemy?.level??level;
  const m=buildSceneMonster(ctx,sceneEnemy,sceneEnemy?.monsterId??1002040,childId,level);
  for(const key of ['hp','atk','def','speed','stance'])if(!Number.isFinite(m[key]))throw new Error('银鬃近卫缺少 '+key+' 数据');
  const hp=sceneEnemy?.hp??m.hp,def=sceneEnemy?.def??m.def,speed=sceneEnemy?.speed??m.speed,stance=sceneEnemy?.stance??m.stance;
  const provenance=sceneEnemy?{source:'abyss_wave_monsters',mode:sceneEnemy.mode,seasonId:sceneEnemy.seasonId,
    floorId:sceneEnemy.floorId,wave:sceneEnemy.wave,stats:sceneEnemy._provenance}:m._provenance;
  return {id,name:sceneEnemy?.name??m.name,monsterId:1002040,childId,side:'enemy',level,element:'Physical',
    panel:{hp,atk:m.atk,def,speed,critRate:0,critDmg:0,effectRes:sceneStatusRes(sceneEnemy,m.statusRes),energyRegen:1,elemDmg:{},baseStats:{atk:m.atk,hp,def}},
    baseSpeed:speed,energy:0,energyMax:0,toughnessMax:sceneToughness(sceneEnemy,stance),weaknesses:sceneEnemy?.weakness??m.weakness,
    res:sceneEnemy?.res??m.res,standardBreak:true,rank:'normal',
    enemyKit:{id:1002040,revision:'4.6-silvermane-guard-partial-1',skillId:100204001,skill01Multiplier:3,
      defenseDownChance:.5,defenseDownDuration:2,aiPath:'Config/ConfigAI/Monster_Common_SequenceThree_AI.json'},
    actions:{basic:{name:'未使用的基础攻击',type:'Normal',element:'Physical',target:'single',terms:[],hitEnergy:0},
      skill:{name:'奔袭',type:'Normal',element:'Physical',target:'single',terms:[{scaling:'atk',multiplier:3}],hitEnergy:10,hitEnergyPerHit:true}},
    policy:{autoUltimate:false,rotation:['skill']},
    unsupported:['「奔袭」命中后的防御降低幅度及其来源 modifier 未能从本地数据库参数确定'],
    provenance:{version:ctx.data._meta.version,source:'DimbreathBot/TurnBasedGameData@312b4597691e0a29cf9828a15b592757dba86949',
      stats:m._provenance,scene:provenance,ai:'Config/ConfigAI/Monster_Common_SequenceThree_AI.json'}};
}

// Automaton Hound (1012010): the 4.6 local AI alternates its 2.5x Physical
// single-target strike with Skill05. The character config binds Skill05's
// HealByHealerMaxHP percentage to SkillParam[0], which is 0.25 in the local DB.
export function automatonHound(ctx,{sceneEnemy=null,level=55,id='automaton-hound-1'}={}){
  const childId=sceneEnemy?.childId??1012010;
  if(childId!==1012010)throw new Error('自动机兵·战犬场景记录 childId 不匹配');
  level=sceneEnemy?.level??level;
  const monsterId=sceneEnemy?.monsterId??1012010;
  const m=buildSceneMonster(ctx,sceneEnemy,monsterId,childId,level);
  for(const key of ['hp','atk','def','speed','stance'])if(!Number.isFinite(m[key]))throw new Error('自动机兵·战犬缺少 '+key+' 数据');
  const hp=sceneEnemy?.hp??m.hp,def=sceneEnemy?.def??m.def,speed=sceneEnemy?.speed??m.speed,stance=sceneEnemy?.stance??m.stance;
  const provenance=sceneEnemy?{source:'abyss_wave_monsters',mode:sceneEnemy.mode,seasonId:sceneEnemy.seasonId,
    floorId:sceneEnemy.floorId,wave:sceneEnemy.wave,infiniteWaveId:sceneEnemy.infiniteWaveId,stats:sceneEnemy._provenance}:m._provenance;
  return {id,name:sceneEnemy?.name??m.name,monsterId:1012010,childId,side:'enemy',level,element:'Physical',
    panel:{hp,atk:m.atk,def,speed,critRate:0,critDmg:0,effectRes:sceneStatusRes(sceneEnemy,m.statusRes),energyRegen:1,elemDmg:{},baseStats:{atk:m.atk,hp,def}},
    baseSpeed:speed,energy:0,energyMax:0,toughnessMax:sceneToughness(sceneEnemy,stance),weaknesses:sceneEnemy?.weakness??m.weakness,
    res:sceneEnemy?.res??m.res,standardBreak:true,rank:'normal',
    enemyKit:{id:1012010,revision:'4.6-automaton-hound-1',skillId:101201001,skill01Params:[2.5],skill01Multiplier:2.5,
      healSkillId:101201002,skill05Params:[.25],healRatio:.25,healFormula:'HealByHealerMaxHP',
      aiPath:'Config/ConfigAI/Monster_Common_SequenceThree_AI.json',aiSequence:[101201001,101201002],
      commonPassiveSkills:['Monster_Common_PassiveSkill_StanceBreak_Action','Monster_Common_Fever_Action'],
      sourceHashes:{ability:'b258f0bfef781481e5bd323aa96343436e6807bd',character:'eb5bf3e8de957fdb93db9166873436e52aac0991'}},
    actions:{basic:{name:'未使用的基础攻击',type:'Normal',element:'Physical',target:'single',terms:[],hitEnergy:0},
      skill:{name:'垂直打击',type:'Normal',element:'Physical',target:'single',terms:[{scaling:'atk',multiplier:2.5}],hitEnergy:15,hitEnergyPerHit:true},
      skill05:{name:'自愈模块',type:'Normal',target:'allies',terms:[],hitEnergy:0,
        effects:[{type:'heal',target:'allies',scaling:'hp',multiplier:.25}]}},
    policy:{autoUltimate:false,rotation:['skill','skill05']},unsupported:[],
    provenance:{version:ctx.data._meta.version,source:'DimbreathBot/TurnBasedGameData@312b4597691e0a29cf9828a15b592757dba86949',
      stats:m._provenance,scene:provenance,ai:'Config/ConfigAI/Monster_Common_SequenceThree_AI.json',
      character:'Config/ConfigCharacter/Monster/Monster_W1_Mecha02_00_Config.json',
      ability:'Config/ConfigAbility/Monster/Monster_W1_Mecha02_00_Ability.json',
      sourceHashes:{ability:'b258f0bfef781481e5bd323aa96343436e6807bd',character:'eb5bf3e8de957fdb93db9166873436e52aac0991'}}};
}

// Everwinter Shadewalker (1022010): its sole sequenced action deals 3x Ice
// damage and then delays the selected target by 50% of an action distance.
export function everwinterShadewalker(ctx,{sceneEnemy=null,level=65,id='everwinter-shadewalker-1'}={}){
  const childId=sceneEnemy?.childId??1022010;
  if(childId!==1022010)throw new Error('永冬灾影场景记录 childId 不匹配');
  level=sceneEnemy?.level??level;
  const monsterId=sceneEnemy?.monsterId??1022010;
  const m=buildSceneMonster(ctx,sceneEnemy,monsterId,childId,level);
  for(const key of ['hp','atk','def','speed','stance'])if(!Number.isFinite(m[key]))throw new Error('永冬灾影缺少 '+key+' 数据');
  const hp=sceneEnemy?.hp??m.hp,def=sceneEnemy?.def??m.def,speed=sceneEnemy?.speed??m.speed,stance=sceneEnemy?.stance??m.stance;
  const provenance=sceneEnemy?{source:'abyss_wave_monsters',mode:sceneEnemy.mode,seasonId:sceneEnemy.seasonId,
    floorId:sceneEnemy.floorId,wave:sceneEnemy.wave,infiniteWaveId:sceneEnemy.infiniteWaveId,stats:sceneEnemy._provenance}:m._provenance;
  return {id,name:sceneEnemy?.name??m.name,monsterId:1022010,childId,side:'enemy',level,element:'Ice',
    panel:{hp,atk:m.atk,def,speed,critRate:0,critDmg:0,effectRes:sceneStatusRes(sceneEnemy,m.statusRes),energyRegen:1,elemDmg:{},baseStats:{atk:m.atk,hp,def}},
    baseSpeed:speed,energy:0,energyMax:0,toughnessMax:sceneToughness(sceneEnemy,stance),weaknesses:sceneEnemy?.weakness??m.weakness,
    res:sceneEnemy?.res??m.res,standardBreak:true,rank:'normal',
    enemyKit:{id:1022010,revision:'4.6-everwinter-shadewalker-1',skillId:102201001,skillParams:[3,.5],
      skill01Multiplier:3,actionDelayRatio:.5,aiPath:'Config/ConfigAI/Monster_Common_SequenceThree_AI.json',aiSequence:[102201001],
      sourceHashes:{ability:'b94ca20ab0413321e5ceca1ea315d05be63e1188',character:'0833e6025a054d63429a9af76ecf077785931281'}},
    actions:{basic:{name:'未使用的基础攻击',type:'Normal',element:'Ice',target:'single',terms:[],hitEnergy:0},
      skill:{name:'霜冻重击',type:'Normal',element:'Ice',target:'single',terms:[{scaling:'atk',multiplier:3}],hitEnergy:15,hitEnergyPerHit:true,
        effects:[{type:'delay',value:.5}]}},
    policy:{autoUltimate:false,rotation:['skill']},unsupported:[],
    provenance:{version:ctx.data._meta.version,source:'DimbreathBot/TurnBasedGameData@312b4597691e0a29cf9828a15b592757dba86949',
      stats:m._provenance,scene:provenance,ai:'Config/ConfigAI/Monster_Common_SequenceThree_AI.json',
      character:'Config/ConfigCharacter/Monster/Monster_W1_Soldier01_02_Config.json',
      ability:'Config/ConfigAbility/Monster/Monster_W1_Soldier01_02_Ability.json',
      sourceHashes:{ability:'b94ca20ab0413321e5ceca1ea315d05be63e1188',character:'0833e6025a054d63429a9af76ecf077785931281'}}};
}

// Blazing Shadewalker (1022020): Skill01 is a 3x Fire strike that always
// applies the local common Burn modifier for three target turns at 0.5x ATK.
export function flamingShadewalker(ctx,{sceneEnemy=null,level=65,id='flaming-shadewalker-1'}={}){
  const childId=sceneEnemy?.childId??1022020;
  if(childId!==1022020)throw new Error('火焚灾影场景记录 childId 不匹配');
  level=sceneEnemy?.level??level;
  const monsterId=sceneEnemy?.monsterId??1022020;
  const m=buildSceneMonster(ctx,sceneEnemy,monsterId,childId,level);
  for(const key of ['hp','atk','def','speed','stance'])if(!Number.isFinite(m[key]))throw new Error('火焚灾影缺少 '+key+' 数据');
  const hp=sceneEnemy?.hp??m.hp,def=sceneEnemy?.def??m.def,speed=sceneEnemy?.speed??m.speed,stance=sceneEnemy?.stance??m.stance;
  const provenance=sceneEnemy?{source:'abyss_wave_monsters',mode:sceneEnemy.mode,seasonId:sceneEnemy.seasonId,
    floorId:sceneEnemy.floorId,wave:sceneEnemy.wave,infiniteWaveId:sceneEnemy.infiniteWaveId,stats:sceneEnemy._provenance}:m._provenance;
  return {id,name:sceneEnemy?.name??m.name,monsterId:1022020,childId,side:'enemy',level,element:'Fire',
    panel:{hp,atk:m.atk,def,speed,critRate:0,critDmg:0,effectRes:sceneStatusRes(sceneEnemy,m.statusRes),energyRegen:1,elemDmg:{},baseStats:{atk:m.atk,hp,def}},
    baseSpeed:speed,energy:0,energyMax:0,toughnessMax:sceneToughness(sceneEnemy,stance),weaknesses:sceneEnemy?.weakness??m.weakness,
    res:sceneEnemy?.res??m.res,standardBreak:true,rank:'normal',
    enemyKit:{id:1022020,revision:'4.6-flaming-shadewalker-1',skillId:102202001,skillParams:[3,1,3,.5],
      skill01Multiplier:3,burnChance:1,burnDuration:3,burnAttackRatio:.5,
      aiPath:'Config/ConfigAI/Monster_Common_SequenceThree_AI.json',aiSequence:[102202001],
      sourceHashes:{ability:'960ddd6d84fbd02384072ab7e6a777de962a19f8',character:'eab85566eb96130a779e64c9bda770b5763e5576'}},
    actions:{basic:{name:'未使用的基础攻击',type:'Normal',element:'Fire',target:'single',terms:[],hitEnergy:0},
      skill:{name:'灼炎重击',type:'Normal',element:'Fire',target:'single',terms:[{scaling:'atk',multiplier:3}],hitEnergy:15,hitEnergyPerHit:true,
        effects:[{type:'dot',key:'burn',name:'灼烧',element:'Fire',debuff:true,duration:3,tickAt:'start',terms:[{scaling:'atk',multiplier:.5}]}]}},
    policy:{autoUltimate:false,rotation:['skill']},unsupported:[],
    provenance:{version:ctx.data._meta.version,source:'DimbreathBot/TurnBasedGameData@312b4597691e0a29cf9828a15b592757dba86949',
      stats:m._provenance,scene:provenance,ai:'Config/ConfigAI/Monster_Common_SequenceThree_AI.json',
      character:'Config/ConfigCharacter/Monster/Monster_W1_Soldier01_01_Config.json',
      ability:'Config/ConfigAbility/Monster/Monster_W1_Soldier01_01_Ability.json',
      sourceHashes:{ability:'960ddd6d84fbd02384072ab7e6a777de962a19f8',character:'eab85566eb96130a779e64c9bda770b5763e5576'}}};
}

// Yunqi Patrol Soldier (2002010): the local DB and AI index expose a 2.5x
// Wind single-target loop. Its skill text and remaining AI parameters indicate
// a damage-taken debuff, but this checkout has no raw Ability mapping for it.
export function yunqiPatrolSoldier(ctx,{sceneEnemy=null,level=75,id='yunqi-patrol-soldier-1'}={}){
  const childId=sceneEnemy?.childId??2002010;
  if(childId!==2002010)throw new Error('云骑巡防士卒场景记录 childId 不匹配');
  level=sceneEnemy?.level??level;
  const monsterId=sceneEnemy?.monsterId??2002010;
  const m=buildSceneMonster(ctx,sceneEnemy,monsterId,childId,level);
  for(const key of ['hp','atk','def','speed','stance'])if(!Number.isFinite(m[key]))throw new Error('云骑巡防士卒缺少 '+key+' 数据');
  const hp=sceneEnemy?.hp??m.hp,def=sceneEnemy?.def??m.def,speed=sceneEnemy?.speed??m.speed,stance=sceneEnemy?.stance??m.stance;
  const provenance=sceneEnemy?{source:'abyss_wave_monsters',mode:sceneEnemy.mode,seasonId:sceneEnemy.seasonId,
    floorId:sceneEnemy.floorId,wave:sceneEnemy.wave,infiniteWaveId:sceneEnemy.infiniteWaveId,stats:sceneEnemy._provenance}:m._provenance;
  return {id,name:sceneEnemy?.name??m.name,monsterId:2002010,childId,side:'enemy',level,element:'Wind',
    panel:{hp,atk:m.atk,def,speed,critRate:0,critDmg:0,effectRes:sceneStatusRes(sceneEnemy,m.statusRes),energyRegen:1,elemDmg:{},baseStats:{atk:m.atk,hp,def}},
    baseSpeed:speed,energy:0,energyMax:0,toughnessMax:sceneToughness(sceneEnemy,stance),weaknesses:sceneEnemy?.weakness??m.weakness,
    res:sceneEnemy?.res??m.res,standardBreak:true,rank:'normal',
    enemyKit:{id:2002010,revision:'4.6-yunqi-patrol-soldier-partial-1',skillId:200201001,
      skillParams:[2.5,1,2,.25],skill01Multiplier:2.5,aiPath:'Config/ConfigAI/Monster_Common_SequenceThree_AI.json',
      aiSequence:[200201001]},
    actions:{basic:{name:'未使用的基础攻击',type:'Normal',element:'Wind',target:'single',terms:[],hitEnergy:0},
      skill:{name:'云刃',type:'Normal',element:'Wind',target:'single',terms:[{scaling:'atk',multiplier:2.5}],hitEnergy:15,hitEnergyPerHit:true}},
    policy:{autoUltimate:false,rotation:['skill']},
    unsupported:['「云刃」附加的受到伤害提高状态（AI 参数 [1,2,0.25]）缺少本地 Ability 参数映射，未应用；Skill02 / PassiveSkill01 / Skill03 的触发条件也未还原'],
    provenance:{version:ctx.data._meta.version,source:'HSR_4.6.db + data/enemy_ai_4.6.json',stats:m._provenance,scene:provenance,
      ai:'Config/ConfigAI/Monster_Common_SequenceThree_AI.json'}};
}

// PF 2027 Bubble Hound (3002030): its local SkillConfig / AI data expose the
// 2.5 + 0.3 × current-layer Physical attack. The Ability callbacks map each
// attack or DoT hit to one layer (cap 4), then insert a max-HP strike on death
// against the fatal attacker's adjacent allies, with speed and Bleed modifiers.
export function bubbleHound(ctx,{sceneEnemy=null,level=75,id='bubble-hound-1'}={}){
  const childId=sceneEnemy?.childId??3002030;
  if(childId!==3002030)throw new Error('惊梦剧团的气泡锂犬场景记录 childId 不匹配');
  level=sceneEnemy?.level??level;
  const monsterId=sceneEnemy?.monsterId??3002030;
  const m=buildSceneMonster(ctx,sceneEnemy,monsterId,childId,level);
  for(const key of ['hp','atk','def','speed','stance'])if(!Number.isFinite(m[key]))throw new Error('惊梦剧团的气泡锂犬缺少 '+key+' 数据');
  const hp=sceneEnemy?.hp??m.hp,def=sceneEnemy?.def??m.def,speed=sceneEnemy?.speed??m.speed,stance=sceneEnemy?.stance??m.stance;
  const provenance=sceneEnemy?{source:'abyss_wave_monsters',mode:sceneEnemy.mode,seasonId:sceneEnemy.seasonId,
    floorId:sceneEnemy.floorId,wave:sceneEnemy.wave,infiniteWaveId:sceneEnemy.infiniteWaveId,stats:sceneEnemy._provenance}:m._provenance;
  return {id,name:sceneEnemy?.name??m.name,monsterId:3002030,childId,side:'enemy',level,element:'Physical',
    panel:{hp,atk:m.atk,def,speed,critRate:0,critDmg:0,effectRes:sceneStatusRes(sceneEnemy,m.statusRes),energyRegen:1,elemDmg:{},baseStats:{atk:m.atk,hp,def}},
    baseSpeed:speed,energy:0,energyMax:0,toughnessMax:sceneToughness(sceneEnemy,stance),weaknesses:sceneEnemy?.weakness??m.weakness,
    res:sceneEnemy?.res??m.res,standardBreak:true,rank:'normal',
    enemyKit:{id:3002030,revision:'4.6-bubble-hound-1',skill01Id:300203001,skill01Params:[2.5,.3],
      skill01BaseMultiplier:2.5,skill01LayerMultiplier:.3,skill02Id:300203002,skill02Params:[2,.3,2,.025,100,.01],
      passiveSkillId:300203003,passiveParams:[4],tipsinessMax:4,skill02SpeedDuration:2,skill02SpeedRatio:.3,
      skill02BleedDuration:2,skill02BleedRatio:.025,skill02BleedMaxHpCapRatio:1,skill02MaxHpDamageRatio:.01,
      skill02AdjacentToughness:30,aiPath:'Config/ConfigAI/Monster_Common_SequenceThree_AI.json',aiSequence:[300203001],
      sourceHashes:{ability:'052d5b4a9ed2d8575447e0ae446aa5050bfdd980',character:'481463ed50151bfef96d928712077855d34d20e6'}},
    actions:{basic:{name:'未使用的基础攻击',type:'Normal',element:'Physical',target:'single',terms:[],hitEnergy:0},
      skill:{name:'邀饮',type:'Normal',element:'Physical',target:'single',terms:[{scaling:'atk',multiplier:2.8}],hitEnergy:10,hitEnergyPerHit:true},
      skill02:{name:'泼洒甜蜜',type:'Normal',element:'Physical',target:'blast',terms:[{scaling:'hp',multiplier:.01,target:'adjacent'}],
        hitEnergy:0,toughness:0,adjacentToughness:30}},
    policy:{autoUltimate:false,rotation:['skill']},unsupported:[],
    provenance:{version:ctx.data._meta.version,source:'HSR_4.6.db + data/enemy_ai_4.6.json + DimbreathBot/TurnBasedGameData@312b4597691e0a29cf9828a15b592757dba86949',
      stats:m._provenance,scene:provenance,ai:'Config/ConfigAI/Monster_Common_SequenceThree_AI.json',
      character:'Config/ConfigCharacter/Monster/Monster_W2_Beast01_03_Config.json',
      ability:'Config/ConfigAbility/Monster/Monster_W2_Beast01_03_Ability.json',
      sourceHashes:{ability:'052d5b4a9ed2d8575447e0ae446aa5050bfdd980',character:'481463ed50151bfef96d928712077855d34d20e6'}}};
}

// 803301011 -> Senior Staff: Team Leader. Its selected Pingshu AI uses a
// deterministic eight-step loop. Skill05 exists in the Character config but
// this AI path never selects it; do not add an unsupported summon to PF scenes.
export function seniorStaffTeamLeader(ctx,{sceneEnemy=null,level=90,id='senior-staff-team-leader-1'}={}){
  const childId=sceneEnemy?.childId??803301011;
  if(childId!==803301011)throw new Error('资深员工·组长场景记录 childId 不匹配');
  level=sceneEnemy?.level??level;
  const monsterId=sceneEnemy?.monsterId??8033010,m=buildSceneMonster(ctx,sceneEnemy,monsterId,childId,level);
  for(const k of ['hp','atk','def','speed','stance'])if(!Number.isFinite(m[k]))throw new Error('资深员工·组长缺少 '+k+' 数据');
  const hp=sceneEnemy?.hp??m.hp,def=sceneEnemy?.def??m.def,speed=sceneEnemy?.speed??m.speed,stance=sceneEnemy?.stance??m.stance;
  for(const [k,v] of Object.entries({hp,def,speed,stance}))if(!Number.isFinite(v)||v<=0)throw new Error('资深员工·组长场景 '+k+' 无效');
  const provenance=sceneEnemy?{source:'abyss_wave_monsters',mode:sceneEnemy.mode,seasonId:sceneEnemy.seasonId,
    floorId:sceneEnemy.floorId,wave:sceneEnemy.wave,stats:sceneEnemy._provenance}:m._provenance;
  const skill01={name:'处分',type:'Normal',element:'Physical',target:'single',terms:[{scaling:'atk',multiplier:3.2}],hitEnergy:10,hitEnergyPerHit:true};
  const skill06={name:'降本增效',type:'Normal',element:'Physical',target:'single',terms:[{scaling:'atk',multiplier:3.8}],
    hitShares:[.3,.3,.4],hitEnergy:15,hitEnergyPerHit:true};
  const skill03={name:'企业文化冲击',type:'Normal',element:'Physical',target:'all',terms:[{scaling:'atk',multiplier:3.6}],
    hitShares:Array(8).fill(.125),hitEnergy:20,hitEnergyPerHit:true};
  return {id,name:sceneEnemy?.name??m.name,monsterId:8033010,childId,side:'enemy',level,element:'Physical',
    panel:{hp,atk:m.atk,def,speed,critRate:0,critDmg:0,effectRes:sceneStatusRes(sceneEnemy,m.statusRes),energyRegen:1,elemDmg:{},baseStats:{atk:m.atk,hp,def}},
    baseSpeed:speed,energy:0,energyMax:0,toughnessMax:sceneToughness(sceneEnemy,stance),weaknesses:sceneEnemy?.weakness??m.weakness,
    res:sceneEnemy?.res??m.res,standardBreak:true,rank:'elite',
    enemyKit:{id:8033010,revision:'4.6-team-leader-partial-2',aiPath:'Config/ConfigAI/Monster_W1_Mecha03_02_AI_Pingshu.json',
      aiSequence:[803301001,803301002,803301005,803301003,803301004,803301002,803301005,803301002],oneMorePerTurn:true,
      skill01Id:803301001,skill01Params:[3.2],skill06Id:803301002,skill06Params:[3.8],
      skill02Id:803301003,skill03Id:803301004,skill03Params:[3.6],skill04Id:803301005,
      skill05Id:803301006,skill05Params:[1,.5],passiveSkillId:803301007,passiveParams:[.5],
      chargeDamageRatio:3.6,performanceDamagePerPoint:.5,performanceMax:3,breakResetFlags:[9,10],
      sourceHashes:{ai:'eb69fb71aaa7f5704f1788db47752edbd9b5aff7',character:'4e42fa6e9ad6b7e0989631a862bd9de2acf11b1e',
        ability:'d96a9b7cdc6ed9b278b753619625d6a747e1965e',sharedModifier:'e043cdc0650741eb27049b0c1a0710bccb77618f'}},
    actions:{basic:{name:'未使用的基础攻击',type:'Normal',element:'Physical',target:'single',terms:[],hitEnergy:0},
      skill:skill01,skill01,skill02:{name:'培训中…',type:'Normal',element:'Physical',target:'self',terms:[],hitEnergy:0},
      skill03,skill04:{name:'720度考核',type:'Normal',element:'Physical',target:'self',terms:[],hitEnergy:0},
      skill05:{name:'团建',type:'Normal',element:'Physical',target:'self',terms:[],hitEnergy:0},skill06,
      wait:{name:'暂无可用目标',type:'Normal',element:'Physical',target:'self',terms:[],hitEnergy:0}},
    policy:{autoUltimate:false},
    unsupported:['720度考核的公司货币队友转移、绩效点受击 / 击破 / 死亡时转移尚未完整模拟'],
    provenance:{version:ctx.data._meta.version,source:'HSR_4.6.db + data/enemy_ai_4.6.json + DimbreathBot/TurnBasedGameData@312b4597691e0a29cf9828a15b592757dba86949',
      stats:m._provenance,scene:provenance,ai:'Config/ConfigAI/Monster_W1_Mecha03_02_AI_Pingshu.json',
      character:'Config/ConfigCharacter/Monster/Monster_W1_Mecha03_02_Config.json',
      ability:'Config/ConfigAbility/Monster/Monster_W1_Mecha03_02_Ability.json',
      sourceHashes:{ai:'eb69fb71aaa7f5704f1788db47752edbd9b5aff7',character:'4e42fa6e9ad6b7e0989631a862bd9de2acf11b1e',
        ability:'d96a9b7cdc6ed9b278b753619625d6a747e1965e',sharedModifier:'e043cdc0650741eb27049b0c1a0710bccb77618f'}}};
}

// 202303016 -> The Ascended (承露天人). Skill01/02/03 are Wind attacks that each
// apply MCommon_DOT_Poison (Wind, 0.7x snapshot ATK, 3 turns, 5 layers).
// Skill04 enters 持咒, Skill05 hits the whole team with 噬命 (DirtyHPRatio 0.3 /
// 2 turns / 50% cap). The AI is the sourced AIFlag 1..6 cycle plus the unused
// SpecialFlag recovery chain; OneMorePerTurn is emulated by the engine queue.
export function ascended(ctx,{sceneEnemy=null,level=90,id='ascended-1'}={}){
  const childId=sceneEnemy?.childId??202303016;
  if(childId!==202303016)throw new Error('承露天人场景记录 childId 不匹配');
  level=sceneEnemy?.level??level;
  const monsterId=sceneEnemy?.monsterId??2023030,m=buildSceneMonster(ctx,sceneEnemy,monsterId,childId,level);
  for(const k of ['hp','atk','def','speed','stance'])if(!Number.isFinite(m[k]))throw new Error('承露天人缺少 '+k+' 数据');
  const hp=sceneEnemy?.hp??m.hp,def=sceneEnemy?.def??m.def,speed=sceneEnemy?.speed??m.speed,stance=sceneEnemy?.stance??m.stance;
  for(const [k,v] of Object.entries({hp,def,speed,stance}))if(!Number.isFinite(v)||v<=0)throw new Error('承露天人场景 '+k+' 无效');
  const provenance=sceneEnemy?{source:'abyss_wave_monsters',mode:sceneEnemy.mode,seasonId:sceneEnemy.seasonId,
    floorId:sceneEnemy.floorId,wave:sceneEnemy.wave,infiniteWaveId:sceneEnemy.infiniteWaveId,stats:sceneEnemy._provenance}:m._provenance;
  const skill01={name:'若木化生仪祷',type:'Normal',element:'Wind',target:'single',
    terms:[{scaling:'atk',multiplier:1}],repeatCount:5,randomHitTargets:true,hitEnergy:5,hitEnergyPerHit:true};
  const skill02={name:'导引巽风',type:'Normal',element:'Wind',target:'blast',
    terms:[{scaling:'atk',multiplier:2,target:'primary'},{scaling:'atk',multiplier:1,target:'adjacent'}],
    hitEnergy:10,hitEnergyPerHit:true};
  const skill03={name:'若木棘',type:'Normal',element:'Wind',target:'single',
    terms:[{scaling:'atk',multiplier:3}],hitEnergy:15,hitEnergyPerHit:true};
  return {id,name:sceneEnemy?.name??m.name,monsterId:2023030,childId,side:'enemy',level,element:'Wind',
    panel:{hp,atk:m.atk,def,speed,critRate:0,critDmg:0,effectRes:sceneStatusRes(sceneEnemy,m.statusRes),energyRegen:1,elemDmg:{},baseStats:{atk:m.atk,hp,def}},
    baseSpeed:speed,energy:0,energyMax:0,toughnessMax:sceneToughness(sceneEnemy,stance),weaknesses:sceneEnemy?.weakness??m.weakness,
    res:sceneEnemy?.res??m.res,standardBreak:true,rank:'elite',
    enemyKit:{id:202303016,revision:'4.6-ascended-partial-1',aiPath:'Config/ConfigAI/Monster_XP_Elite02_02_AI.json',
      aiSequence:[202303001,202303002,202303003,202303004,202303005],oneMorePerTurn:true,
      skill01Id:202303001,skill01Params:[1,1,3,.7],skill02Id:202303002,skill02Params:[2,1,3,.7],
      skill03Id:202303003,skill03Params:[3,1,3,.7],skill04Id:202303004,skill04Params:[],skill05Id:202303005,skill05Params:[.3,2,1],
      poisonChance:1,poisonDuration:3,poisonRatio:.7,dirtyHpInitialRatio:.3,dirtyHpCap:.5,dirtyHpDuration:2,dirtyHpChance:1,
      sourceHashes:{ai:'7a063305006f4e5676aa7aaaedec6d2e09e41852',character:'b7b0de2cb349983944eaba9bee2784f6a8ffa22a',
        ability:'4059b25ad18f6d0c1f5b0a05accc42c3196d855e',sharedModifier:'e043cdc0650741eb27049b0c1a0710bccb77618f'}},
    actions:{basic:{name:'未使用的基础攻击',type:'Normal',element:'Wind',target:'single',terms:[],hitEnergy:0},
      skill01,skill02,skill03,
      skill04:{name:'玄气咒厌法',type:'Normal',element:'Wind',target:'self',terms:[],hitEnergy:10},
      skill05:{name:'玄气噬身',type:'Normal',element:'Wind',target:'all',terms:[],hitEnergy:15}},
    policy:{autoUltimate:false},
    enemyMechanicNotes:[
      '噬命按来源公开的 DirtyHPRatio 0.3 / 2 回合 / 50% 上限执行；DirtyHP 的三层内部叠加公式与 DirtyHPSpecial 的 1-HPRatio 读取属于战斗内核，未在 Ability 中公开，当前以「实际损失生命 / 白值生命」线性追加近似',
      'Skill01 首段为 TauntOrRandomEnemy、其余四段随机；当前统一使用引擎的均匀随机，嘲讽优先未建模',
      'MuteDirtyHP / InstantDirtyHP / BattlePerform_Insert 的剧情分支在 PF 中不触发，未接入；SpecialFlag 恢复链已按来源保留'],
    provenance:{version:ctx.data._meta.version,source:'HSR_4.6.db + data/enemy_ai_4.6.json + DimbreathBot/TurnBasedGameData@312b4597691e0a29cf9828a15b592757dba86949',
      stats:m._provenance,scene:provenance,ai:'Config/ConfigAI/Monster_XP_Elite02_02_AI.json',
      character:'Config/ConfigCharacter/Monster/Monster_XP_Elite02_02_Config.json',
      ability:'Config/ConfigAbility/Monster/Monster_XP_Elite02_02_Ability.json',
      sharedModifier:'Config/ConfigGlobalModifier/GlobalModifier_Common_Specific.json',
      sourceHashes:{ai:'7a063305006f4e5676aa7aaaedec6d2e09e41852',character:'b7b0de2cb349983944eaba9bee2784f6a8ffa22a',
        ability:'4059b25ad18f6d0c1f5b0a05accc42c3196d855e',sharedModifier:'e043cdc0650741eb27049b0c1a0710bccb77618f'}}};
}

// 1013020 / 101302032 -> Automaton Direwolf (自动机兵•齿狼). The 4.6 Ability,
// Character config and AI give the exact numeric bindings: Skill06 (砍伐指令)
// is 10 hits of 0.4x ATK with a 50% chance per hit to apply 裂伤 (Physical DoT,
// 5% of the target's Max HP per layer, 2 turns, 10 layers, tick at turn start);
// Skill09 (解体指令) / Skill11 (解体拆除) are 2.5x ATK plus one guaranteed layer.
// The AIFlag 1/2/3 cycle plus the OnActionEnd RemoveOneMore rule reproduce the
// sourced [Skill09, Skill09] -> [Skill07] -> [Skill06, Skill09] rotation.
export function direwolf(ctx,{sceneEnemy=null,level=90,id='direwolf-1'}={}){
  const childId=sceneEnemy?.childId??1013020;
  if(![1013020,101302032].includes(childId))throw new Error('自动机兵•齿狼场景记录 childId 不匹配');
  level=sceneEnemy?.level??level;
  const monsterId=sceneEnemy?.monsterId??1013020;
  const m=buildSceneMonster(ctx,sceneEnemy,monsterId,childId,level);
  for(const k of ['hp','atk','def','speed','stance'])if(!Number.isFinite(m[k]))throw new Error('自动机兵•齿狼缺少 '+k+' 数据');
  const hp=sceneEnemy?.hp??m.hp,def=sceneEnemy?.def??m.def,speed=sceneEnemy?.speed??m.speed,stance=sceneEnemy?.stance??m.stance;
  for(const [k,v] of Object.entries({hp,def,speed,stance}))if(!Number.isFinite(v)||v<=0)throw new Error('自动机兵•齿狼场景 '+k+' 无效');
  const provenance=sceneEnemy?{source:'abyss_wave_monsters',mode:sceneEnemy.mode,seasonId:sceneEnemy.seasonId,
    floorId:sceneEnemy.floorId,wave:sceneEnemy.wave,infiniteWaveId:sceneEnemy.infiniteWaveId,stats:sceneEnemy._provenance}:m._provenance;
  const skill01={name:'砍伐指令',type:'Normal',element:'Physical',target:'single',
    terms:[{scaling:'atk',multiplier:.4}],repeatCount:10,hitEnergy:2,hitEnergyPerHit:true,toughness:2};
  const skill03={name:'解体指令',type:'Normal',element:'Physical',target:'single',
    terms:[{scaling:'atk',multiplier:2.5}],hitEnergy:10,toughness:10};
  return {id,name:sceneEnemy?.name??m.name,monsterId,childId,side:'enemy',level,element:'Physical',
    panel:{hp,atk:m.atk,def,speed,critRate:0,critDmg:0,effectRes:sceneStatusRes(sceneEnemy,m.statusRes),energyRegen:1,elemDmg:{},baseStats:{hp,atk:m.atk,def}},
    baseSpeed:speed,energy:0,energyMax:0,toughnessMax:sceneToughness(sceneEnemy,stance),weaknesses:sceneEnemy?.weakness??m.weakness,
    res:sceneEnemy?.res??m.res,standardBreak:true,rank:'elite',
    enemyKit:{id:childId,revision:'4.6-direwolf-partial-1',aiPath:'Config/ConfigAI/Monster_W1_Mecha04_00_AI.json',
      skill01Id:101302001,skill01Params:[.5,.05,4,10],skill02Id:101302002,skill02Params:[],
      skill03Id:101302003,skill03Params:[2.5],skill04Id:101302004,skill04Params:[2.5],
      oneMorePerTurn:true,bleedChance:.5,bleedRatio:.05,bleedDuration:2,bleedMaxStacks:10,
      signModifier:'Sign_W1_Mecha02',dotModifier:'W1_Mecha02_ThunderDOT',
      sourceHashes:{ai:'7a0d3548bbef77ed7f426f5689145a174b2edd52',character:'20542b3095a4ec9ca9dd388df633354f25b25727',
        ability:'b24b234e209cfe17bbfdd5c24377b2f2a1a8d53e'}},
    actions:{basic:{name:'未使用的基础攻击',type:'Normal',element:'Physical',target:'single',terms:[],hitEnergy:0},
      skill01,
      skill02:{name:'目标锁定',type:'Normal',element:'Physical',target:'single',terms:[],hitEnergy:0},
      skill03,
      skill04:{name:'解体拆除',type:'Normal',element:'Physical',target:'single',
        terms:[{scaling:'atk',multiplier:2.5}],hitEnergy:10,toughness:10}},
    policy:{autoUltimate:false},
    enemyMechanicNotes:[
      '裂伤按来源 Owner_MaxHP × Layer × 5% 在持有者回合开始结算，属普通持续伤害乘区；UseSnapshotEntity 只影响 DoT 归属，不改变最大生命值百分比',
      'OneMorePerTurn 的回合内追加行动以引擎 continuation 模拟；RemoveOneMore 的 OnActionEnd 规则（AIFlag=3 或 InsertFlag=1 时移除，否则补回）已按来源实现',
      'Skill06 的护盾判定在施放开始时对原目标执行；无护盾时按来源 Retarget 到当前生命比例最高的我方单体（并列随机），并写入 Mecha04_BattleScore2_Flag（仅战斗评分，不影响伤害）',
      '弱点击破只把 InsertFlag 清零；恢复时若锁定标记仍在，来源仅添加动画用 ChainSawSpeedUp（SetEffectAnimSpeed -0.6），不影响伤害与行动，动画加速未实现',
      '1013021 / 1013022 / 1013023 / 1013024 变体的 InsertFlag / OneMore / Skill11 分支不在四个终局模式的关卡名单中；当前 actor 只覆盖 1013020 与 101302032',
      'Skill07 在来源 AI 中没有 SelectAISkillTarget，目标由技能自身 TargetType 决定，该字段不在本地快照中；当前沿用引擎默认加权选敌，并由 Skill06 优先命中被锁定目标'],
    provenance:{version:ctx.data._meta.version,source:'HSR_4.6.db + data/enemy_ai_4.6.json + DimbreathBot/TurnBasedGameData@312b4597691e0a29cf9828a15b592757dba86949',
      stats:m._provenance,scene:provenance,ai:'Config/ConfigAI/Monster_W1_Mecha04_00_AI.json',
      character:'Config/ConfigCharacter/Monster/Monster_W1_Mecha04_00_Config.json',
      ability:'Config/ConfigAbility/Monster/Monster_W1_Mecha04_00_Ability.json',
      sourceHashes:{ai:'7a0d3548bbef77ed7f426f5689145a174b2edd52',character:'20542b3095a4ec9ca9dd388df633354f25b25727',
        ability:'b24b234e209cfe17bbfdd5c24377b2f2a1a8d53e'}}};
}

// 1023010 -> 炽燃徘徊者 (Searing Prowler). The 4.6 Ability, Character config and
// AI give the exact bindings: Skill06 (赤红刀锋) is 3.0x ATK plus a 3-turn burn
// (0.5x ATK snapshot, max 1 layer, replaced by the same caster); Skill07
// (燃焰斩击) is two waves of 2.0x main / 1.25x adjacent and prefers a burning
// target; Skill02 (飞舞烬火) is two 1.5x AoE hits, then 2.0x extra damage to
// each burning ally and removes that burn (1023010; variant 1023011 re-applies
// it instead); Skill01 (高温运转) is a self buff of +20% ATK and +100 speed that
// is removed on weakness break. The AI counter 1..4 plus the Burning /
// Burning_CD predicates reproduce the sourced rotation
// Skill06 -> Skill07 -> Skill01 -> Skill02 -> (Skill06 / Skill02 loop).
export function searingProwler(ctx,{sceneEnemy=null,level=90,id='searing-prowler-1'}={}){
  const childId=sceneEnemy?.childId??1023010;
  // monster_childs 里 1023010 的 102301001..102301021 只改生命 / 攻击 / 速度 / 韧性的倍率，
  // 技能与 AI 完全共用 1023010；sceneEnemy.monsterId 指向父怪物。
  const monsterId=ctx.monsterChildByChildId?.get?.(childId)?.monsterId??sceneEnemy?.monsterId??1023010;
  if(monsterId!==1023010)throw new Error('炽燃徘徊者场景记录 childId 不匹配');
  level=sceneEnemy?.level??level;
  const m=buildSceneMonster(ctx,sceneEnemy,monsterId,childId,level);
  for(const k of ['hp','atk','def','speed','stance'])if(!Number.isFinite(m[k]))throw new Error('炽燃徘徊者缺少 '+k+' 数据');
  const hp=sceneEnemy?.hp??m.hp,def=sceneEnemy?.def??m.def,speed=sceneEnemy?.speed??m.speed,stance=sceneEnemy?.stance??m.stance;
  for(const [k,v] of Object.entries({hp,def,speed,stance}))if(!Number.isFinite(v)||v<=0)throw new Error('炽燃徘徊者场景 '+k+' 无效');
  // monster_stats.critical_damage_base = 0.2：熔解只提高暴击率，暴击伤害取白值。
  const stats=ctx.monsterStatsById?.get(monsterId),critDmg=Number.isFinite(stats?.critDmg)?stats.critDmg:0;
  const provenance=sceneEnemy?{source:'abyss_wave_monsters',mode:sceneEnemy.mode,seasonId:sceneEnemy.seasonId,
    floorId:sceneEnemy.floorId,wave:sceneEnemy.wave,infiniteWaveId:sceneEnemy.infiniteWaveId,stats:sceneEnemy._provenance}:m._provenance;
  const skill06={name:'赤红刀锋',type:'Normal',element:'Fire',target:'single',
    terms:[{scaling:'atk',multiplier:3}],hitEnergy:10,toughness:10};
  const skill07={name:'燃焰斩击',type:'Normal',element:'Fire',target:'blast',
    terms:[{scaling:'atk',multiplier:2},{scaling:'atk',multiplier:1.25,target:'adjacent'}],
    repeatCount:2,hitEnergy:7.5,hitEnergyPerHit:true,toughness:7.5,adjacentToughness:7.5};
  const skill02={name:'飞舞烬火',type:'Normal',element:'Fire',target:'all',
    terms:[{scaling:'atk',multiplier:1.5}],repeatCount:2,hitEnergy:5,hitEnergyPerHit:true,toughness:5};
  return {id,name:sceneEnemy?.name??m.name,monsterId,childId,side:'enemy',level,element:'Fire',
    panel:{hp,atk:m.atk,def,speed,critRate:0,critDmg,effectRes:sceneStatusRes(sceneEnemy,m.statusRes),energyRegen:1,elemDmg:{},baseStats:{hp,atk:m.atk,def}},
    baseSpeed:speed,energy:0,energyMax:0,toughnessMax:sceneToughness(sceneEnemy,stance),weaknesses:sceneEnemy?.weakness??m.weakness,
    res:sceneEnemy?.res??m.res,standardBreak:true,rank:'elite',
    enemyKit:{id:1023010,revision:'4.6-searing-prowler-partial-1',aiPath:'Config/ConfigAI/Monster_W1_Mecha04_01_AI.json',
      skill01Id:102301004,skill01Params:[.2,100],skill02Id:102301005,skill02Params:[3,2],
      skill06Id:102301001,skill06Params:[3,.5,3],skill07Id:102301002,skill07Params:[4,2.5],
      passiveId:102301003,passiveParams:[.06,3],
      burnModifier:'MCommon_DOT_Burn',burnRatio:.5,burnDuration:3,burnExtraRatio:2,
      attackBuff:.2,speedBuff:100,meltCritPerLayer:.06,meltMaxLayers:5,meltDuration:3,
      burningModifier:'Monster_W1_Mecha_Fire_Burning',meltModifier:'Monster_W1_Mecha_Fire_Passive',
      sourceHashes:{ai:'73c666d45ba11c87d642cf295b80b6ab3c2ab491',character:'8bdc0dfed2cb0a9efba3cff4b6a116bcad471810',
        ability:'9538d3777954950c18263a968362ff958b5550d4',sharedModifier:'e043cdc0650741eb27049b0c1a0710bccb77618f'}},
    actions:{basic:{name:'未使用的基础攻击',type:'Normal',element:'Fire',target:'single',terms:[],hitEnergy:0},
      skill01:{name:'高温运转',type:'Normal',element:null,target:'self',terms:[],hitEnergy:0},
      skill02,skill06,skill07},
    policy:{autoUltimate:false},
    enemyMechanicNotes:[
      '灼烧按来源 MCommon_DOT_Burn（UseSnapshotEntity=true）在持有者回合开始结算：0.5 × 施放时攻击力，持续 3 回合，MaxLayer 1、ReplaceByCaster；AddModifier 的 Chance 固定为 1，技能文本「大概率」与配置不一致，按配置实现',
      '熔解在任意一次攻击命中持有灼烧的目标后叠加 1 层（MaxLayer 5 / 3 回合），每层 +6% 暴击率；增伤属性 AllDamageTypeAddedRatio 的动态哈希在本地快照中为 Type None 且未被 AddModifier 传入，数值不可还原，当前只实现暴击率部分',
      '高温运转为自身 +20% 攻击力与 +100 速度；弱点被击破时移除并写入 Burning_CD，Burning_CD 在下一次攻击结束后移除',
      'Skill02 先结算 2 段 1.5 倍群体攻击，再对每名灼烧目标追加 2.0 倍火属性伤害并解除其灼烧；追加伤害为 Pursued，不计削韧与受击回能',
      '1023011 变体的「飞舞烬火重新施加灼烧」分支不在当前 actor 覆盖范围；actor 只实现 1023010',
      'AI 状态机按 AICounter 1→2→3→4 与 Burning / Burning_CD 判定复现：Skill06 → Skill07 → Skill01 → Skill02 →（Skill06 / Skill02 交替）；Skill07 的 AIModifierNameSelector 优先选中灼烧目标，无灼烧时退回引擎默认选敌',
      '韧性按 monster_skills.sp_hit_base × AttackData.SPHitRatio 逐段分配：Skill06 10、Skill07 每段 7.5、Skill02 每段 5；追加伤害不削韧'],
    provenance:{version:ctx.data._meta.version,source:'HSR_4.6.db + data/enemy_ai_4.6.json + DimbreathBot/TurnBasedGameData@312b4597691e0a29cf9828a15b592757dba86949',
      stats:m._provenance,scene:provenance,ai:'Config/ConfigAI/Monster_W1_Mecha04_01_AI.json',
      character:'Config/ConfigCharacter/Monster/Monster_W1_Mecha04_01_Config.json',
      ability:'Config/ConfigAbility/Monster/Monster_W1_Mecha04_01_Ability.json',
      sharedModifier:'Config/ConfigGlobalModifier/GlobalModifier_Common_Specific.json',
      sourceHashes:{ai:'73c666d45ba11c87d642cf295b80b6ab3c2ab491',character:'8bdc0dfed2cb0a9efba3cff4b6a116bcad471810',
        ability:'9538d3777954950c18263a968362ff958b5550d4',sharedModifier:'e043cdc0650741eb27049b0c1a0710bccb77618f'}}};
}

// PF 2027 流浪者：数据库与固定版本 AI 都给出「铲击」和「鼓舞」。鼓舞优先选
// 一名尚未获得该 modifier 的同侧单位，提供 30% 攻击力并令其行动条归零；
// AI 没有公开同分目标的次序，当前按编队顺序选首名并保留这一处近似。
export function roamingBandit(ctx,{sceneEnemy=null,level=55,id='roaming-bandit-1'}={}){
  const childId=sceneEnemy?.childId??1002020;
  if(childId!==1002020)throw new Error('流浪者场景记录 childId 不匹配');
  level=sceneEnemy?.level??level;
  const monsterId=sceneEnemy?.monsterId??1002020,m=buildSceneMonster(ctx,sceneEnemy,monsterId,childId,level);
  for(const key of ['hp','atk','def','speed','stance'])if(!Number.isFinite(m[key]))throw new Error('流浪者缺少 '+key+' 数据');
  const hp=sceneEnemy?.hp??m.hp,def=sceneEnemy?.def??m.def,speed=sceneEnemy?.speed??m.speed,stance=sceneEnemy?.stance??m.stance;
  const provenance=sceneEnemy?{source:'abyss_wave_monsters',mode:sceneEnemy.mode,seasonId:sceneEnemy.seasonId,
    floorId:sceneEnemy.floorId,wave:sceneEnemy.wave,infiniteWaveId:sceneEnemy.infiniteWaveId,stats:sceneEnemy._provenance}:m._provenance;
  const supportModifier='Monster_W1_Soldier01_03_Buff';
  return {id,name:sceneEnemy?.name??m.name,monsterId:1002020,childId,side:'enemy',level,element:'Physical',
    panel:{hp,atk:m.atk,def,speed,critRate:0,critDmg:0,effectRes:sceneStatusRes(sceneEnemy,m.statusRes),energyRegen:1,elemDmg:{},baseStats:{atk:m.atk,hp,def}},
    baseSpeed:speed,energy:0,energyMax:0,toughnessMax:sceneToughness(sceneEnemy,stance),weaknesses:sceneEnemy?.weakness??m.weakness,
    res:sceneEnemy?.res??m.res,standardBreak:true,rank:'normal',
    enemyKit:{id:1002020,revision:'4.6-roaming-bandit-partial-1',skill01Id:100202001,skill01Params:[2.5],
      skill02Id:100202002,skill02Params:[.3,0,2],skill02InitialCooldown:1,skill02Cooldown:2,supportModifier,
      aiPath:'Config/ConfigAI/Monster_W1_Soldier01_03_AI.json',sourceHashes:{ai:'4dcffeec011ea31b9e412227bc4a1d39c8b7175a',
        character:'741e748b3b136eb96fdf0a145810cf5a3a099861',ability:'fa94b970e1583d581f3b9779dd4b6d02ea93de36'}},
    actions:{basic:{name:'未使用的基础攻击',type:'Normal',element:'Physical',target:'single',terms:[],hitEnergy:0},
      skill:{name:'铲击',type:'Normal',element:'Physical',target:'single',terms:[{scaling:'atk',multiplier:2.5}],hitEnergy:10,hitEnergyPerHit:true},
      skill02:{name:'鼓舞',type:'Normal',element:'Physical',target:'ally',terms:[],hitEnergy:0,effects:[
        {type:'buff',key:'atkPct',value:.3,duration:2,tag:'roamingBanditInspiration',modifierName:supportModifier},
        {type:'advance',value:1},
      ]}},
    policy:{autoUltimate:false},unsupported:['AI 未给鼓舞同分目标规定稳定次序；回放以编队顺序选择首名未受鼓舞的同侧单位'],
    provenance:{version:ctx.data._meta.version,source:'HSR_4.6.db + data/enemy_ai_4.6.json + DimbreathBot/TurnBasedGameData@312b4597691e0a29cf9828a15b592757dba86949',
      stats:m._provenance,scene:provenance,ai:'Config/ConfigAI/Monster_W1_Soldier01_03_AI.json',
      character:'Config/ConfigCharacter/Monster/Monster_W1_Soldier01_03_Config.json',
      ability:'Config/ConfigAbility/Monster/Monster_W1_Soldier01_03_Ability.json',
      sourceHashes:{ai:'4dcffeec011ea31b9e412227bc4a1d39c8b7175a',character:'741e748b3b136eb96fdf0a145810cf5a3a099861',
        ability:'fa94b970e1583d581f3b9779dd4b6d02ea93de36'}}};
}

// PF 2027 魔阴身士卒：本地 4.6 DB 给出技能倍率参数，固定版本 Ability 将「梢杀」拆为
// 25% / 25% / 50% 三段，并在命中后施加可叠加的风化；韧性削减数值未包含在可用源数据中。
export function maraStruckSoldier(ctx,{sceneEnemy=null,level=55,id='mara-struck-soldier-1'}={}){
  const childId=sceneEnemy?.childId??2022010;
  if(childId!==2022010)throw new Error('魔阴身士卒场景记录 childId 不匹配');
  level=sceneEnemy?.level??level;
  const monsterId=sceneEnemy?.monsterId??2022010,m=buildSceneMonster(ctx,sceneEnemy,monsterId,childId,level);
  for(const key of ['hp','atk','def','speed','stance'])if(!Number.isFinite(m[key]))throw new Error('魔阴身士卒缺少 '+key+' 数据');
  const hp=sceneEnemy?.hp??m.hp,def=sceneEnemy?.def??m.def,speed=sceneEnemy?.speed??m.speed,stance=sceneEnemy?.stance??m.stance;
  const provenance=sceneEnemy?{source:'abyss_wave_monsters',mode:sceneEnemy.mode,seasonId:sceneEnemy.seasonId,
    floorId:sceneEnemy.floorId,wave:sceneEnemy.wave,infiniteWaveId:sceneEnemy.infiniteWaveId,stats:sceneEnemy._provenance}:m._provenance;
  return {id,name:sceneEnemy?.name??m.name,monsterId:2022010,childId,side:'enemy',level,element:'Wind',
    panel:{hp,atk:m.atk,def,speed,critRate:0,critDmg:0,effectRes:sceneStatusRes(sceneEnemy,m.statusRes),energyRegen:1,elemDmg:{},baseStats:{atk:m.atk,hp,def}},
    baseSpeed:speed,energy:0,energyMax:0,toughnessMax:sceneToughness(sceneEnemy,stance),weaknesses:sceneEnemy?.weakness??m.weakness,
    res:sceneEnemy?.res??m.res,standardBreak:true,rank:'normal',
    enemyKit:{id:2022010,revision:'4.6-mara-struck-soldier-partial-1',skill01Id:202201001,skill01Params:[2,2,3,.5,1],
      skill01HitShares:[.25,.25,.5],passiveSkillId:202201002,passiveParams:[.5,0,.5],reviveHpRatio:.5,reviveSpeedRatio:.5,
      windShearChance:1,windShearDuration:3,windShearLayerAdd:2,windShearDamagePerLayer:.5,windShearMaxLayers:5,
      aiPath:'Config/ConfigAI/Monster_W2_Abomi01_00_AI.json',aiSequence:[202201001],
      sourceRef:'312b4597691e0a29cf9828a15b592757dba86949',sourceHashes:{ai:'90752b8b9cb4e6b31f0cdfa1cedd9cd74bdfbaaf',
        character:'e55e8e09bd9f47dadb4dd3afce1ed7ddb21decea',ability:'466de69542423ceee1d0772459dc236a5f0fd794'}},
    actions:{basic:{name:'未使用的基础攻击',type:'Normal',element:'Wind',target:'single',terms:[],hitEnergy:0},
      skill:{name:'梢杀',type:'Normal',element:'Wind',target:'single',terms:[{scaling:'atk',multiplier:2}],
        hitShares:[.25,.25,.5],hitEnergy:15,hitEnergyPerHit:true,toughness:0}},
    policy:{autoUltimate:false,rotation:['skill']},
    unsupported:['「梢杀」削韧数值未在本地数据库或固定版本 Ability 的 AttackData 中提供；当前不猜测韧性削减'],
    provenance:{version:ctx.data._meta.version,source:'HSR_4.6.db + data/enemy_ai_4.6.json + DimbreathBot/TurnBasedGameData@312b4597691e0a29cf9828a15b592757dba86949',
      stats:m._provenance,scene:provenance,ai:'Config/ConfigAI/Monster_W2_Abomi01_00_AI.json',
      character:'Config/ConfigCharacter/Monster/Monster_W2_Abomi01_00_Config.json',
      ability:'Config/ConfigAbility/Monster/Monster_W2_Abomi01_00_Ability.json',sourceRef:'312b4597691e0a29cf9828a15b592757dba86949',
      sourceHashes:{ai:'90752b8b9cb4e6b31f0cdfa1cedd9cd74bdfbaaf',character:'e55e8e09bd9f47dadb4dd3afce1ed7ddb21decea',
        ability:'466de69542423ceee1d0772459dc236a5f0fd794'}}};
}

// Wraith Warden (2002030): its sourced loop is one Physical strike. The
// Ability's conditional Shake/Unstable modifier chain is retained explicitly
// because those shared modifier definitions are absent from the local cache.
export function wraithWarden(ctx,{sceneEnemy=null,level=65,id='wraith-warden-1'}={}){
  const childId=sceneEnemy?.childId??2002030;
  if(childId!==2002030)throw new Error('幽府武弁场景记录 childId 不匹配');
  level=sceneEnemy?.level??level;
  const monsterId=sceneEnemy?.monsterId??2002030;
  const m=buildSceneMonster(ctx,sceneEnemy,monsterId,childId,level);
  for(const key of ['hp','atk','def','speed','stance'])if(!Number.isFinite(m[key]))throw new Error('幽府武弁缺少 '+key+' 数据');
  const hp=sceneEnemy?.hp??m.hp,def=sceneEnemy?.def??m.def,speed=sceneEnemy?.speed??m.speed,stance=sceneEnemy?.stance??m.stance;
  const provenance=sceneEnemy?{source:'abyss_wave_monsters',mode:sceneEnemy.mode,seasonId:sceneEnemy.seasonId,
    floorId:sceneEnemy.floorId,wave:sceneEnemy.wave,infiniteWaveId:sceneEnemy.infiniteWaveId,stats:sceneEnemy._provenance}:m._provenance;
  return {id,name:sceneEnemy?.name??m.name,monsterId:2002030,childId,side:'enemy',level,element:'Physical',
    panel:{hp,atk:m.atk,def,speed,critRate:0,critDmg:0,effectRes:sceneStatusRes(sceneEnemy,m.statusRes),energyRegen:1,elemDmg:{},baseStats:{atk:m.atk,hp,def}},
    baseSpeed:speed,energy:0,energyMax:0,toughnessMax:sceneToughness(sceneEnemy,stance),weaknesses:sceneEnemy?.weakness??m.weakness,
    res:sceneEnemy?.res??m.res,standardBreak:true,rank:'normal',
    enemyKit:{id:2002030,revision:'4.6-wraith-warden-partial-1',skillId:200203001,skillParams:[2.5,.35,2],skill01Multiplier:2.5,
      conditionalDebuffChance:.35,conditionalActionDelayRatio:.7,conditionalModifier:'MCommon_Unstable',requiredTargetModifier:'MCommon_Shake',
      aiPath:'Config/ConfigAI/Monster_Common_SequenceThree_AI.json',aiSequence:[200203001],
      sourceHashes:{ability:'8cd9339435bb6ced13be241a759c0e2851a6d4e6',character:'c3d64aac042b7f6461623a9f72d5c73ba78a34f3'}},
    actions:{basic:{name:'未使用的基础攻击',type:'Normal',element:'Physical',target:'single',terms:[],hitEnergy:0},
      skill:{name:'锯恶',type:'Normal',element:'Physical',target:'single',terms:[{scaling:'atk',multiplier:2.5}],hitEnergy:15,hitEnergyPerHit:true}},
    policy:{autoUltimate:false,rotation:['skill']},
    unsupported:['命中目标同时持有 MCommon_Unstable 与 MCommon_Shake 时，按 35% 基础概率施加 MCommon_Unstable 并使行动延后 70%；共享状态来源及其期限 / 概率链未能由本地配置还原'],
    provenance:{version:ctx.data._meta.version,source:'DimbreathBot/TurnBasedGameData@312b4597691e0a29cf9828a15b592757dba86949',
      stats:m._provenance,scene:provenance,ai:'Config/ConfigAI/Monster_Common_SequenceThree_AI.json',
      character:'Config/ConfigCharacter/Monster/Monster_W2_Valkyrie01_00_Config.json',
      ability:'Config/ConfigAbility/Monster/Monster_W2_Valkyrie01_00_Ability.json',
      sourceHashes:{ability:'8cd9339435bb6ced13be241a759c0e2851a6d4e6',character:'c3d64aac042b7f6461623a9f72d5c73ba78a34f3'}}};
}

// PF 2027 天谴斗士 (4012010): the local SkillConfig / AI source gives a
// 3x Physical single-target Skill01. Armor parameters are retained raw because
// their value-to-effect mapping is not fully represented in the local DB.
export function strongman(ctx,{sceneEnemy=null,level=75,id='strongman-1'}={}){
  const childId=sceneEnemy?.childId??4012010;
  if(childId!==4012010)throw new Error('天谴斗士场景记录 childId 不匹配');
  level=sceneEnemy?.level??level;
  const m=buildSceneMonster(ctx,sceneEnemy,sceneEnemy?.monsterId??4012010,childId,level);
  for(const key of ['hp','atk','def','speed','stance'])if(!Number.isFinite(m[key]))throw new Error('天谴斗士缺少 '+key+' 数据');
  const hp=sceneEnemy?.hp??m.hp,def=sceneEnemy?.def??m.def,speed=sceneEnemy?.speed??m.speed,stance=sceneEnemy?.stance??m.stance;
  const provenance=sceneEnemy?{source:'abyss_wave_monsters',mode:sceneEnemy.mode,seasonId:sceneEnemy.seasonId,
    floorId:sceneEnemy.floorId,wave:sceneEnemy.wave,infiniteWaveId:sceneEnemy.infiniteWaveId,stats:sceneEnemy._provenance}:m._provenance;
  return {id,name:sceneEnemy?.name??m.name,monsterId:4012010,childId,side:'enemy',level,element:'Physical',
    panel:{hp,atk:m.atk,def,speed,critRate:0,critDmg:0,effectRes:sceneStatusRes(sceneEnemy,m.statusRes),energyRegen:1,elemDmg:{},baseStats:{atk:m.atk,hp,def}},
    baseSpeed:speed,energy:0,energyMax:0,toughnessMax:sceneToughness(sceneEnemy,stance),weaknesses:sceneEnemy?.weakness??m.weakness,
    res:sceneEnemy?.res??m.res,standardBreak:true,rank:'normal',
    enemyKit:{id:4012010,revision:'4.6-strongman-partial-1',skillId:401201001,skill01Multiplier:3,
      armorSkillId:401201002,armorParams:[3,.3,.1,.1,.06,.3],aiPath:'Config/ConfigAI/Monster_W4_Strongman_00_AI.json'},
    actions:{basic:{name:'未使用的基础攻击',type:'Normal',element:'Physical',target:'single',terms:[],hitEnergy:0},
      skill:{name:'第三轨道的冲撞',type:'Normal',element:'Physical',target:'single',terms:[{scaling:'atk',multiplier:3}],hitEnergy:15,hitEnergyPerHit:true}},
    policy:{autoUltimate:false,rotation:['skill']},
    unsupported:['【战甲】层数消耗与减伤结算、归零后的虚数反伤 / 行动延后 / 破甲者回能、回合结束重置尚未从本地参数完成映射'],
    provenance:{version:ctx.data._meta.version,source:'DimbreathBot/TurnBasedGameData@312b4597691e0a29cf9828a15b592757dba86949',
      stats:m._provenance,scene:provenance,ai:'Config/ConfigAI/Monster_W4_Strongman_00_AI.json',
      skill:'401201001',passive:'401201002'}};
}

// PF 2027 幼蛰虫 (8022010): the common-sequence AI repeats Skill01, whose
// first local parameter is the 2x Wind single-target multiplier. Spawn/death
// abilities are kept as raw source parameters until their callbacks are mapped.
export function swarmBroodling(ctx,{sceneEnemy=null,level=65,id='swarm-broodling-1'}={}){
  const childId=sceneEnemy?.childId??8022010;
  if(childId!==8022010)throw new Error('幼蛰虫场景记录 childId 不匹配');
  level=sceneEnemy?.level??level;
  const m=buildSceneMonster(ctx,sceneEnemy,sceneEnemy?.monsterId??8022010,childId,level);
  for(const key of ['hp','atk','def','speed','stance'])if(!Number.isFinite(m[key]))throw new Error('幼蛰虫缺少 '+key+' 数据');
  const hp=sceneEnemy?.hp??m.hp,def=sceneEnemy?.def??m.def,speed=sceneEnemy?.speed??m.speed,stance=sceneEnemy?.stance??m.stance;
  const provenance=sceneEnemy?{source:'abyss_wave_monsters',mode:sceneEnemy.mode,seasonId:sceneEnemy.seasonId,
    floorId:sceneEnemy.floorId,wave:sceneEnemy.wave,infiniteWaveId:sceneEnemy.infiniteWaveId,stats:sceneEnemy._provenance}:m._provenance;
  return {id,name:sceneEnemy?.name??m.name,monsterId:8022010,childId,side:'enemy',level,element:'Wind',
    panel:{hp,atk:m.atk,def,speed,critRate:0,critDmg:0,effectRes:sceneStatusRes(sceneEnemy,m.statusRes),energyRegen:1,elemDmg:{},baseStats:{atk:m.atk,hp,def}},
    baseSpeed:speed,energy:0,energyMax:0,toughnessMax:sceneToughness(sceneEnemy,stance),weaknesses:sceneEnemy?.weakness??m.weakness,
    res:sceneEnemy?.res??m.res,standardBreak:true,rank:'normal',
    enemyKit:{id:8022010,revision:'4.6-swarm-broodling-partial-1',skillId:802201001,skill01Multiplier:2,
      skill01Params:[2,1,.5,3,5],splitSkillId:802201002,splitParams:[],deathSkillId:802201003,deathParams:[2,1,.08],
      passiveSkillId:802201004,passiveParams:[.5,1,.1,3,10,30],aiPath:'Config/ConfigAI/Monster_Common_SequenceThree_AI.json',
      aiSequence:[802201001]},
    actions:{basic:{name:'未使用的基础攻击',type:'Normal',element:'Wind',target:'single',terms:[],hitEnergy:0},
      skill:{name:'振翅',type:'Normal',element:'Wind',target:'single',terms:[{scaling:'atk',multiplier:2}],hitEnergy:10,hitEnergyPerHit:true}},
    policy:{autoUltimate:false,rotation:['skill']},
    unsupported:['「次分裂」的召唤时机、冷却与繁衍体场景面板尚未接入','致命退场时的群体风伤 / 易伤及 Skill03 回调条件尚未对拍'],
    provenance:{version:ctx.data._meta.version,source:'DimbreathBot/TurnBasedGameData@312b4597691e0a29cf9828a15b592757dba86949',
      stats:m._provenance,scene:provenance,ai:'Config/ConfigAI/Monster_Common_SequenceThree_AI.json',
      skill:'802201001',split:'802201002',death:'802201003',passive:'802201004'}};
}

// PF 2027 reporter (501211002): the local AI index specifies the only
// sequenced action, a 2.8x Imaginary single hit with 10 hit energy. Its fatal
// photo / cheerfulness / shared Punchline passive lacks a scoring formula.
export function tanukiReporter(ctx,{sceneEnemy=null,level=55,id='tanuki-reporter-1'}={}){
  const childId=sceneEnemy?.childId??501211002;
  if(childId!==501211002)throw new Error('狸猫记者场景记录 childId 不匹配');
  level=sceneEnemy?.level??level;
  const monsterId=sceneEnemy?.monsterId??5012110;
  const m=buildSceneMonster(ctx,sceneEnemy,monsterId,childId,level);
  for(const key of ['hp','atk','def','speed','stance'])if(!Number.isFinite(m[key]))throw new Error('狸猫记者缺少 '+key+' 数据');
  const hp=sceneEnemy?.hp??m.hp,def=sceneEnemy?.def??m.def,speed=sceneEnemy?.speed??m.speed,stance=sceneEnemy?.stance??m.stance;
  const provenance=sceneEnemy?{source:'abyss_wave_monsters',mode:sceneEnemy.mode,seasonId:sceneEnemy.seasonId,
    floorId:sceneEnemy.floorId,wave:sceneEnemy.wave,infiniteWaveId:sceneEnemy.infiniteWaveId,stats:sceneEnemy._provenance}:m._provenance;
  const attack={name:'抓拍',type:'Normal',element:'Imaginary',target:'single',terms:[{scaling:'atk',multiplier:2.8}],hitEnergy:10};
  return {id,name:sceneEnemy?.name??m.name,monsterId:5012110,childId,side:'enemy',level,element:'Imaginary',
    panel:{hp,atk:m.atk,def,speed,critRate:0,critDmg:0,effectRes:sceneStatusRes(sceneEnemy,m.statusRes),energyRegen:1,elemDmg:{},baseStats:{atk:m.atk,hp,def}},
    baseSpeed:speed,energy:0,energyMax:0,toughnessMax:sceneToughness(sceneEnemy,stance),weaknesses:sceneEnemy?.weakness??m.weakness,
    res:sceneEnemy?.res??m.res,standardBreak:true,rank:'normal',
    enemyKit:{id:501211002,revision:'4.6-tanuki-reporter-partial-1',skillId:501211001,aiPath:'Config/ConfigAI/Monster_Common_SequenceThree_AI.json',
      aiSequence:[501211001],skill01Multiplier:2.8,passiveSkillId:501211002,
      passiveParams:[1,.5,10,5,3,.5,.2,.1,2],
      sourceHashes:{ai:'26aab40120a49b8b467ac4535f80e4381d9df0c1'}},
    actions:{basic:{name:'未使用的基础攻击',type:'Normal',element:'Imaginary',target:'single',terms:[],hitEnergy:0},skill:attack},
    policy:{autoUltimate:false,rotation:['skill']},
    unsupported:['【丑照特写】致命攻击评价分档、欢愉度奖励与共享笑点数量缺少可执行公式'],
    provenance:{version:ctx.data._meta.version,source:'DimbreathBot/TurnBasedGameData@312b4597691e0a29cf9828a15b592757dba86949',
      stats:m._provenance,scene:provenance,ai:'Config/ConfigAI/Monster_Common_SequenceThree_AI.json',
      skill:'501211001',passive:'501211002'}};
}

// PF 2027 天谴哲人 (4012020): 「斗争即正义」is a support action that marks one
// random teammate (the retarget uses AllTeammate + ByRandom 1) with 【宣教】:
// +30% SPD and +30% DMG from Skill01[0]/[1], kept until the caster dies or its
// 【战甲】breaks. 「战是万物父」is a 3.0x Physical single hit. 【城邦守护者】is
// the shared MMonster_Heaven_StoneShieldController (3 layers). 「永恒的活火」
// gives the killer +30% SPD / +30% DMG for 2 turns when the Scholar would die.
export function furiaePhilosopher(ctx,{sceneEnemy=null,level=55,id='furiae-philosopher-1'}={}){
  const childId=sceneEnemy?.childId??4012020;
  if(childId!==4012020)throw new Error('天谴哲人场景记录 childId 不匹配');
  level=sceneEnemy?.level??level;
  return pfSceneEnemy(ctx,sceneEnemy,{id,childId,name:'天谴哲人',element:'Physical',rank:'normal',
    aiPath:'Config/ConfigAI/Monster_W4_Scholar_00_AI.json',revision:'4.6-furiae-philosopher-1',
    enemyKit:{skill01Id:401202001,skill01Params:[.3,.3],skill02Id:401202002,skill02Params:[3],
      passive02Id:401202003,passive02Params:[.3,.3,2],passiveSkillId:401202004,passiveParams:[3,.3,.1,.1,.06,.3],
      armorMaxLayers:3,armorDamageResistance:.1,armorCrackedDelay:.3,armorCrackedDamage:.3,
      armorCrackedDamageAfter:.1,armorBreakEnergyRatio:.06,bookSpeedBonus:.3,bookDamageBonus:.3,
      bookKillerLifeTime:2,bookBlockedCustomValue:296710484,
      sourceHashes:{ai:'fc5465d5e7391f5e00f06fac75aa5e001d577331',ability:'f1faa8d8cf88ad45fdbb648694a788e214cf8d53',
        character:'e6e04448aab89d75460af0a66cbc0cbb87c8da6d'}},
    actions:{basic:{name:'未使用的基础攻击',type:'Normal',element:'Physical',target:'single',terms:[],hitEnergy:0},
      skill01:{name:'斗争即正义',type:'Normal',element:null,target:'self',terms:[],hitEnergy:0},
      skill02:{name:'战是万物父',type:'Normal',element:'Physical',target:'single',
        terms:[{scaling:'atk',multiplier:3}],hitEnergy:15}},
    notes:['AI 无旗标：Skill01 的 ConsiderAxis 要求 AllTeammate 中至少 1 名单位既没有 MModifier_Monster_W4_Scholar_00_BookTarget、CustomValue 296710484 也为假，则 Skill01（ByRandom 1，选目标含施法者本人），否则 Skill02；两个决策都带 InitialCD / CD = 1。',
      '斗争即正义不造成伤害，按 Skill01[0]=0.3 的速度与 Skill01[1]=0.3 的伤害增益施加 BookTarget，无持续时间；RemoveWhenCasterDead，并在施法者【战甲】被破坏（StoneShield 移除或层数归零）时由 BookController 一并清除。',
      '战是万物父为 3.0 倍物理单体、命中回能 15。PassiveSkillInitiate 以 [3,0.3,0.1,0.1,0.06,0.3] 施加 MMonster_Heaven_StoneShieldController：3 层、每层 10% 全伤害减免、受击 -1 层，1 层被击破时自身承受 30% 最大生命虚数伤害、行动延后 0.3、破甲者回复 6% 能量上限，0 层期间受击追加 10% 最大生命虚数伤害，自身回合结束回满。',
      '永恒的活火（PassiveSkill02 → BookKillerListener）：OnBeforeDying 时若致命一击来源为我方，按 PassiveSkill02[0..2]=[0.3,0.3,2] 授予攻击者 MModifier_Monster_W4_Scholar_00_BookKiller（速度 / 全伤害 +30%，2 回合）。',
      '未还原：MMonster_Heaven_ModelController_Scholar 与 MMonster_W4_Scholar_00_ConfineHit_Controller 的模型 / 命中表现、BookController 的书籍特效；CustomValue 296710484 的写入方不在已下载文件中，当前按「始终为假」处理，因此只要还有队友没有 BookTarget 就会继续宣教。']});
}

// PF 2027 虚数织叶者 (8002010): AIFlag 1 → Skill03 (set 2); 2 → (set 1) then
// Skill02 when the caster holds XP_Minion02_00_Attack, Skill01 otherwise.
// Skill01/02 are both 2.5x Imaginary single hits with 15 hit energy; Skill02 is
// authored as three hit splits (0.3/0.3/0.4) of a single hit. Skill03 hits the
// main and adjacent targets for 2.5x each (10 hit energy) and then grants the
// Attack modifier (+Skill03[1]=100% all damage) until it is spent or broken.
export function imaginaryWeaver(ctx,{sceneEnemy=null,level=55,id='imaginary-weaver-1'}={}){
  const childId=sceneEnemy?.childId??8002010;
  if(childId!==8002010)throw new Error('虚数织叶者场景记录 childId 不匹配');
  level=sceneEnemy?.level??level;
  return pfSceneEnemy(ctx,sceneEnemy,{id,childId,name:'虚数织叶者',element:'Imaginary',rank:'normal',
    aiPath:'Config/ConfigAI/Monster_XP_Minion02_00_AI.json',revision:'4.6-imaginary-weaver-1',
    enemyKit:{skill01Id:800201001,skill01Params:[2.5],skill02Id:800201002,skill02Params:[2.5],
      skill03Id:800201003,skill03Params:[2.5,1],passiveSkillId:800201004,passiveParams:[0],
      attackBuffDamageBonus:1,
      sourceHashes:{ai:'5e990af4de48425c98defc45b873b5e725269657',ability:'f296c0076837ca1d5131927e287cf4286a6d797c',
        character:'6077b22200e26b62b30c0ecaaf9accd558182b43'}},
    actions:{basic:{name:'未使用的基础攻击',type:'Normal',element:'Imaginary',target:'single',terms:[],hitEnergy:0},
      skill01:{name:'颂歌光束',type:'Normal',element:'Imaginary',target:'single',
        terms:[{scaling:'atk',multiplier:2.5}],hitEnergy:15},
      skill02:{name:'颂歌爆发',type:'Normal',element:'Imaginary',target:'single',
        terms:[{scaling:'atk',multiplier:2.5}],hitEnergy:15},
      skill03:{name:'颂歌震荡',type:'Normal',element:'Imaginary',target:'blast',
        terms:[{scaling:'atk',multiplier:2.5},{scaling:'atk',multiplier:2.5,target:'adjacent'}],hitEnergy:10}},
    notes:['AI 按 AIFlag 轮转：1→颂歌震荡并置 2；2→置 1，持有 XP_Minion02_00_Attack 时颂歌爆发，否则颂歌光束（例如【后手】在行动前被击破清除）。本地索引的线性 skillSequence（800201003 → 800201001 → 800201002）是压缩视图，与该旗标状态机不符，未采用。',
      '颂歌光束 / 颂歌爆发均为 2.5 倍虚数单体、命中回能 15；颂歌爆发在 Ability 中按 HitSplitRatio 0.3 / 0.3 / 0.4 拆成 3 段演出，合计仍是同一次命中（不额外削韧或回能）。',
      '颂歌震荡对主目标与相邻目标各 2.5 倍（命中回能 10），结算后按 Skill03[1]=1.0 施加 XP_Minion02_00_Attack（AllDamageTypeAddedRatio = +100%）；该增益在颂歌光束 / 颂歌爆发结算后（RemoveModifier）、自身被击破（OnBeingBreak）或濒死（OnBeforeDying）时移除。',
      '虚数护甲（800201004）：XP_Minion02_00_Armor 的 OnBeforeBeingHitAll 仅当本次攻击属性不属于自身弱点时才施加 Defender_AllDamageReduce，并在击破时移除；但已下载的 AI / Ability / Config 中没有任何 AddModifier 来源，本地索引该技能 params=[0]，减伤数值与挂载点均为缺口，当前未接入减伤结算。',
      'XP_Minion02_00_Effect 与 MMonster_XP_Minion02_00_PassiveArmor 只做视觉（破甲后重新挂载 Effect），未建立战斗效果。']});
}

// MoC 1036 5511/S2 外宇宙之炎 (8003020): the fixed AI runs a two-flag machine.
// Phase_Flag 1 alternates 咆哮之火 (Skill01) and 汲取炎华 (Skill03); 汲取炎华
// applies XP_Fire_Elite_Burning_Modifier_2【自燃】 (Phase_Flag 2) and writes
// StanceBreak_Sign=1, so phase 2 alternates 净炎之雨 (Skill05) and 熔聚
// (Skill07). A weakness break while the sign is set removes both 【自燃】 and
// 【熔聚】; the modifier's own OnDestroy writes Phase_Flag / AIFlag back to 1.
export function universeFireElite(ctx,{sceneEnemy=null,level=92,id='universe-fire-elite-1'}={}){
  const childId=sceneEnemy?.childId??8003020;
  if(childId!==8003020)throw new Error('外宇宙之炎场景记录 childId 不匹配');
  level=sceneEnemy?.level??level;
  return pfSceneEnemy(ctx,sceneEnemy,{id,childId,name:'外宇宙之炎',element:'Fire',rank:'elite',
    aiPath:'Config/ConfigAI/Monster_XP_Elite01_00_AI.json',revision:'4.6-universe-fire-elite-1',
    enemyKit:{skill01Id:800302001,skill01Params:[2.5,1,2,.5],
      skill03Id:800302002,skill03Params:[0,0,60,0],
      skill05Id:800302003,skill05Params:[1,1,2,.5,5,60],
      skill07Id:800302004,skill07Params:[.3],
      burnModifier:'MMonster_XP_Elite01_00_Burn',burnChance:1,burnDuration:2,burnDamagePerLayer:.5,
      burningModifier:'XP_Fire_Elite_Burning_Modifier_2',meltModifier:'XP_Elite_Fire_Skill07_AttackUp_Modifier',
      meltMaxLayers:3,meltAttackBonus:.3,
      sourceHashes:{ai:'afd74e8c56c626c9d7d2df4ee49da9fae4dee872',ability:'ae9d1e62cb1329843928bdd9f8dc6f3664d1d22c',
        character:'32b5d2227bb65252fcb71f77a0f74c407bd4c096'}},
    actions:{basic:{name:'未使用的基础攻击',type:'Normal',element:'Fire',target:'single',terms:[],hitEnergy:0},
      skill01:{name:'咆哮之火',type:'Normal',element:'Fire',target:'single',
        terms:[{scaling:'atk',multiplier:2.5}],hitEnergy:10,toughness:10},
      skill03:{name:'汲取炎华',type:'Normal',element:null,target:'self',terms:[],hitEnergy:0},
      skill05:{name:'净炎之雨',type:'Normal',element:'Fire',target:'all',randomHitTargets:true,repeatCount:5,
        terms:[{scaling:'atk',multiplier:1}],hitEnergy:10,hitEnergyPerHit:true,toughness:10},
      skill07:{name:'熔聚',type:'Normal',element:null,target:'self',terms:[],hitEnergy:0}},
    notes:['AI 用 Phase_Flag / AIFlag 双旗标：阶段 1 的 1→咆哮之火（置 2）、2→汲取炎华（置 1）、3→咆哮之火；阶段 2 的 1→净炎之雨（置 2）、2→熔聚（置 1）、3→净炎之雨。AIControl.OnAfterSkillUse 的 AIFlag+1（阶段 1 上限 4、阶段 2 上限 3 后回绕）只在两个不写旗标的 3 号备用分支上改变走向，按回绕到 1 处理。',
      '咆哮之火为 2.5 倍火属性单体、命中回能 10；命中后按 Skill01[1..3] 施加【焚烧】（基础概率 1、2 回合、每层每跳 0.5 倍施放时攻击力）。数据库文案写作「大概率」，固定版本配置的 Chance 为 1，按配置实现。MMonster_XP_Elite01_00_Burn 未声明 MaxLayer，LayerAddWhenStack 的 MDF 也未被 AddModifier 传入，当前按每次施加 +1 层且不设上限。',
      '净炎之雨按 Skill05[4]=5 段各自重新随机选敌，每段 1.0 倍火属性（Skill05[0]），命中后按 Skill05[1..3] 同样施加【焚烧】。Skill05[5]=60 在已下载的 AI / Ability / Config 中没有任何引用，未接入。',
      '汲取炎华不造成伤害：施加 XP_Fire_Elite_Burning_Modifier_2【自燃】把 Phase_Flag 置 2，并在结算末尾写入 StanceBreak_Sign=1；【自燃】被移除时按 OnDestroy 把 Phase_Flag 与 AIFlag 都复位为 1。',
      '熔聚按 Skill07[0]=0.3 逐层叠加攻击力（MaxLayer 3，ReplaceByCaster）。MMonster_XP_Elite01_00_ListenStanceBreakModifier 只在 StanceBreak_Sign==1（即施放过汲取炎华）的弱点击破中移除【自燃】与【熔聚】并清零 Sign；未进入阶段的击破不改动旗标，8003021 变体在该分支保留【熔聚】，当前 actor 只实现 8003020。',
      '削韧按 monster_skills.sp_hit_base 逐段计（咆哮之火 10、净炎之雨每段 10），与 1023010 的既有口径一致；固定版本 Ability 的 AttackData 没有单独的削韧字段，该口径仍是推断值。',
      '未还原：Skill08 / Skill09（点燃计数与引爆）不在 Config 的 SkillList 与 AI 决策中，也未在已下载文件中找到触发方；Burning_Modifier_2 收到的 Modifier_Stance = Skill03[2] = 60 与 Modifier_StanceWeakAddedRatio = Skill03[1] = 0 在该文件的回调中没有被引用；NoWeakAndResistance 只有 OnBeingBreak 移除 / OnEndBreak 恢复的挂载，没有可执行属性变化；全部特效、镜头与 UI。']});
}

export function waveMaid(ctx,{sceneEnemy=null,level=80,id='wave-maid-1'}={}){
  return waveMaidBlueprint(ctx,sceneEnemy??{level},id);
}

// 4053010 / 405301002: MoC 1036 and PF 2027 instances share the same manta AI.
// The source supports an exact opening pair, debuff parameters and servant
// creation; its dance / DoT, OneMore and hit-count passives remain explicit gaps.
export function waveLady(ctx,{sceneEnemy=null,level=90,id='wave-lady-1'}={}){
  const childId=sceneEnemy?.childId??4053010;
  if(![4053010,405301002].includes(childId))throw new Error('波涛夫人场景记录 childId 不匹配');
  level=sceneEnemy?.level??level;
  const m=buildSceneMonster(ctx,sceneEnemy,sceneEnemy?.monsterId??4053010,childId,level);
  for(const k of ['hp','atk','def','speed','stance'])if(!Number.isFinite(m[k]))throw new Error('波涛夫人缺少 '+k+' 数据');
  const hp=sceneEnemy?.hp??m.hp,def=sceneEnemy?.def??m.def,speed=sceneEnemy?.speed??m.speed,stance=sceneEnemy?.stance??m.stance;
  for(const [k,v] of Object.entries({hp,def,speed,stance}))if(!Number.isFinite(v)||v<=0)throw new Error('波涛夫人场景 '+k+' 无效');
  const servantSource={...(sceneEnemy??{}),monsterId:4052010,childId:4052010,level,hardLevelGroup:sceneEnemy?.hardLevelGroup,
    eliteGroup:sceneEnemy?.eliteGroup,toughness:undefined,hp:undefined,stance:undefined};
  const servantBlueprint=waveMaidBlueprint(ctx,servantSource,id+':servant-prototype');
  const provenance=sceneEnemy?{source:'abyss_wave_monsters',mode:sceneEnemy.mode,seasonId:sceneEnemy.seasonId,floorId:sceneEnemy.floorId,
    wave:sceneEnemy.wave,stats:sceneEnemy._provenance}:m._provenance;
  return {id,name:sceneEnemy?.name??m.name,monsterId:4053010,childId,side:'enemy',level,element:'Ice',
    panel:{hp,atk:m.atk,def,speed,critRate:0,critDmg:0,effectRes:sceneStatusRes(sceneEnemy,m.statusRes),energyRegen:1,elemDmg:{},baseStats:{atk:m.atk,hp,def}},
    baseSpeed:speed,energy:0,energyMax:0,toughnessMax:sceneToughness(sceneEnemy,stance),weaknesses:sceneEnemy?.weakness??m.weakness,
    res:sceneEnemy?.res??m.res,standardBreak:true,rank:'elite',
    enemyKit:{id:4053010,revision:'4.6-wave-lady-partial-1',aiPath:'Config/ConfigAI/Monster_W4_Manta_00_AI.json',
      aiSequence:[405301001,405301002,405301003,405301004,405301005],skill01Multiplier:2.5,skill01AdjacentMultiplier:1.5,
      skill02Multiplier:2,skill02Chance:1,skill02DefShred:.15,skill02ResReduction:.15,skill02Duration:2,
      summonMonsterId:4052010,summonCount:2,summonDelayRatio:.25,skill04MaxLayer:1,skill04TransferRatio:.7,
      skill05Multiplier:2.5,skill05TransferRatio:.5,passiveHitCount:5,passiveFrenzyHitCount:2,passiveFrenzyActionAdvance:.5,
      summonBlueprint:servantBlueprint,sourceHashes:{ai:'c7c8bfc77e9dd5fb8521a0acc337992356f2c9fe',
        ability:'80fe8c83be865fc5b336133658b7cdfd6e2679d4',character:'aca30badb2d3eac0b3bf003180f6bab007d00ead'}},
    actions:{basic:{name:'未使用的基础攻击',type:'Normal',element:'Ice',target:'single',terms:[],hitEnergy:0},
      skill:{name:'摆袖醉意袭人',type:'Normal',element:'Ice',target:'blast',terms:[{scaling:'atk',multiplier:2.5},{scaling:'atk',multiplier:1.5,target:'adjacent'}],hitEnergy:10,hitEnergyPerHit:true},
      skill01:{name:'摆袖醉意袭人',type:'Normal',element:'Ice',target:'blast',terms:[{scaling:'atk',multiplier:2.5},{scaling:'atk',multiplier:1.5,target:'adjacent'}],hitEnergy:10,hitEnergyPerHit:true},
      skill02:{name:'蜜酿泼洒如星',type:'Normal',element:'Ice',target:'all',terms:[{scaling:'atk',multiplier:2}],hitEnergy:10,hitEnergyPerHit:true},
      skill03:{name:'高歌邀客入席',type:'Normal',element:'Ice',target:'self',terms:[],hitEnergy:0},
      skill04:{name:'聆听海的礼赠',type:'Normal',element:'Ice',target:'self',terms:[],hitEnergy:0},
      skill05:{name:'波涛与你相拥',type:'Normal',element:'Ice',target:'all',terms:[{scaling:'atk',multiplier:2.5}],hitEnergy:10,hitEnergyPerHit:true},
      wait:{name:'没有可执行的源动作',type:'Normal',element:'Ice',target:'self',terms:[],hitEnergy:0}},
    policy:{autoUltimate:false},
    unsupported:['【聆听海的礼赠】的狂欢状态、场景倒计时与伤害转 DoT 尚未接入',
      '浪花侍女仅实现精确全体攻击；其致命反击、黑潮热 DoT、受击计数与行动提前尚未接入',
      '波涛夫人 OneMorePerTurn / OneMore 的插入行动及受击触发行动提前尚未对拍'],
    provenance:{version:ctx.data._meta.version,source:'DimbreathBot/TurnBasedGameData@312b4597691e0a29cf9828a15b592757dba86949',
      stats:m._provenance,scene:provenance,ai:'Config/ConfigAI/Monster_W4_Manta_00_AI.json',
      character:'Config/ConfigCharacter/Monster/Monster_W4_Manta_00_Config.json',
      ability:'Config/ConfigAbility/Monster/Monster_W4_Manta_00_Ability.json',sourceHashes:{
        ai:'c7c8bfc77e9dd5fb8521a0acc337992356f2c9fe',ability:'80fe8c83be865fc5b336133658b7cdfd6e2679d4',
        character:'aca30badb2d3eac0b3bf003180f6bab007d00ead'}}};
}

// 4034010 / 4034014 盗火行者（混沌回忆 1036 · 虚构叙事 2027 / 异相仲裁）。
// 固定提交 312b4597 的 Monster_W4_FireProwler_00_AI / _Ability / _Config 给出
// 完整的 AIFlag / Phase_Flag / SkillFlag 状态机、Skill01..Skill07 的伤害节点、
// 沉默的悲叹（Skill04）的 Charge 与 TimePower、幽冥的悼念（Skill06）的助战和
// 莫因舍弃而哭泣（Skill07）的逐层追击；召唤体 403202001/2/3 来自
// Monster_W4_FireProwler_01_*。门控的 !FantasticStory 分支表示 4034014 不召唤。
const fireProwlerVesselInfo={
  // hpCostRatio 取自 Monster_W4_FireProwler_01 的 PassiveSkillInitiate：
  // 只有 403202003 在 MonsterSkillConfig 里有 PassiveSkill01 行（[1,0.06]），
  // 403202001 / 403202002 没有该行，入场时不会让首领额外掉血。
  // passive01Params 是「幽冥的悼念最后一名助战」的结算参数：Skill01[0] 层灾难之力
  // 与 Skill01[1] 比例回血，同样只有 403202003 有行。
  403202001:{name:'残破容器 · 杀念',kind:'a',hpCostRatio:0,target:'blast',main:.5,adjacent:.25},
  403202002:{name:'残破容器 · 余烬',kind:'b',hpCostRatio:0,target:'all',main:.5,adjacent:0},
  403202003:{name:'残破容器 · 死灰',kind:'c',hpCostRatio:.06,target:null,main:0,adjacent:0,passive01Params:[1,.06]},
};
function fireProwlerVesselBlueprint(ctx,childId,level,hpScale){
  const info=fireProwlerVesselInfo[childId];
  if(!info)throw new Error('未知的盗火行者容器 '+childId);
  const vm=buildMonster(ctx,{monsterId:4032020,childId,level});
  for(const k of ['hp','atk','def'])if(!Number.isFinite(vm[k]))throw new Error('残破容器缺少 '+k+' 数据');
  // 召唤体不在 abyss_wave_monsters 里，按盗火行者场景血量 / 模板血量的比例放大；
  // speed_base 在 4.6 快照中为 null，容器本身不行动，用 1 兜底并在缺口里注明。
  const hp=Math.round(vm.hp*hpScale*10)/10,stance=Number.isFinite(vm.stance)&&vm.stance>0?vm.stance:180;
  return {id:'fire-prowler-vessel-'+childId,name:info.name,monsterId:4032020,childId,side:'enemy',level,element:'Physical',
    panel:{hp,atk:vm.atk,def:vm.def,speed:1,critRate:0,critDmg:0,effectRes:vm.statusRes??0,energyRegen:1,elemDmg:{},
      baseStats:{hp,atk:vm.atk,def:vm.def}},
    baseSpeed:1,energy:0,energyMax:0,toughnessMax:stance/3,weaknesses:vm.weakness,res:vm.res,
    standardBreak:true,rank:'normal',cannotAct:true,
    enemyKit:{id:4032020,revision:'4.6-fire-prowler-vessel-1',vesselKind:info.kind,hpCostRatio:info.hpCostRatio,
      passive01Params:info.passive01Params??null,
      assist:info.target?{target:info.target,main:info.main,adjacent:info.adjacent}:null},
    actions:{wait:{name:'残破容器 · 不主动行动',type:'Normal',element:'Physical',target:'self',terms:[],hitEnergy:0}},
    policy:{autoUltimate:false,rotation:['wait']},
    provenance:{version:ctx.data._meta.version,source:'DimbreathBot/TurnBasedGameData@312b4597691e0a29cf9828a15b592757dba86949',
      stats:vm._provenance,character:'Config/ConfigCharacter/Monster/Monster_W4_FireProwler_01_Config.json',
      ability:'Config/ConfigAbility/Monster/Monster_W4_FireProwler_01_Ability.json',
      note:'容器不进入 abyss_wave_monsters，血量按场景首领血量比例缩放'}};
}
export function fireProwler(ctx,{sceneEnemy=null,level=90,id='fire-prowler-1'}={}){
  const childId=sceneEnemy?.childId??4034010;
  if(![4034010,4034014].includes(childId))throw new Error('盗火行者场景记录 childId 不匹配');
  level=sceneEnemy?.level??level;
  const m=buildSceneMonster(ctx,sceneEnemy,childId,childId,level);
  for(const k of ['hp','atk','def','speed','stance'])if(!Number.isFinite(m[k]))throw new Error('盗火行者缺少 '+k+' 数据');
  const hp=sceneEnemy?.hp??m.hp,def=sceneEnemy?.def??m.def,speed=sceneEnemy?.speed??m.speed,stance=sceneEnemy?.stance??m.stance;
  for(const [k,v] of Object.entries({hp,def,speed,stance}))if(!Number.isFinite(v)||v<=0)throw new Error('盗火行者场景 '+k+' 无效');
  const fantastic=childId===4034014;
  const phaseRatios=sceneEnemy?.phaseRatios??m.phaseRatios??[1];
  const hpCount=sceneEnemy?.hpCount??m.hpCount??phaseRatios.length;
  const stats=ctx.monsterStatsById?.get(childId),critDmg=Number.isFinite(stats?.critDmg)?stats.critDmg:0;
  // 参数顺序与 MonsterSkillConfig 的 ParamList 一致。
  const p=fantastic
    ?{skill01:[4,2,0,8,.05],skill02:[3],skill03:[0],skill04:[8,0,1.5],skill05:[1,1,3],skill07:[1,.4,3],
      passive01:[100,16],passive02:[.6,.8,.3,1,.2]}
    :{skill01:[4,2,.05,8,.05],skill02:[3],skill03:[.5],skill04:[8,.05,2.5],skill05:[2,1,2],skill07:[1,1.6,3],
      passive01:[0,16],passive02:[.6,.8,.3,1,.2]};
  const hpScale=Number.isFinite(m.hp)&&m.hp>0?hp/m.hp:1;
  const vesselBlueprints=fantastic?null:{
    a:fireProwlerVesselBlueprint(ctx,403202001,level,hpScale),
    b:fireProwlerVesselBlueprint(ctx,403202002,level,hpScale),
    c:fireProwlerVesselBlueprint(ctx,403202003,level,hpScale)};
  const provenance=sceneEnemy?{source:'abyss_wave_monsters',mode:sceneEnemy.mode,seasonId:sceneEnemy.seasonId,
    floorId:sceneEnemy.floorId,wave:sceneEnemy.wave,infiniteWaveId:sceneEnemy.infiniteWaveId,stats:sceneEnemy._provenance}:m._provenance;
  return {id,name:sceneEnemy?.name??m.name,monsterId:childId,childId,side:'enemy',level,element:'Physical',
    panel:{hp,atk:m.atk,def,speed,critRate:0,critDmg,effectRes:sceneStatusRes(sceneEnemy,m.statusRes),energyRegen:1,elemDmg:{},baseStats:{hp,atk:m.atk,def}},
    baseSpeed:speed,energy:0,energyMax:0,toughnessMax:sceneToughness(sceneEnemy,stance),weaknesses:sceneEnemy?.weakness??m.weakness,
    res:sceneEnemy?.res??m.res,standardBreak:true,rank:'elite',hpCount,phaseRatios,
    enemyKit:{id:childId,revision:'4.6-fire-prowler-1',
      aiPath:fantastic?'Config/ConfigAI/Monster_W4_FireProwler_00_AI_FantasticStory.json':'Config/ConfigAI/Monster_W4_FireProwler_00_AI.json',
      fantasticStory:fantastic,resetToughnessOnHpBarChange:true,
      skill01Params:p.skill01,skill02Params:p.skill02,skill03Params:p.skill03,skill04Params:p.skill04,
      skill05Params:p.skill05,skill07Params:p.skill07,passive01Params:p.passive01,passive02Params:p.passive02,
      summonMonsterId:4032020,summonChildIds:[403202001,403202002,403202003],
      vesselBlueprints,phaseOneSummonCount:2,phaseTwoSummonCount:4,assistCountPhaseOne:2,assistCountPhaseTwo:4,
      allDamageReducePerLayer:.05,allDamageReduceLayers:8,timePowerInitial:8,
      sourceHashes:fantastic
        ?{ai:'3b77b3a6b8ed9e2c2a60092a2752c846e50a8748',character:'06b6117b5a8d3a42cafd31bd85b050f90c2b2c03',
          characterFantasticStory:'038aa245378b6c91496106444253a18829855e52',ability:'33c8e0bf1778b4b070d8bdab8403f525ea79a7fe',
          vesselAi:'362baa70f9c421a1d1f7e4e46e39f13e27ef78a8',vesselAbility:'12156c11809ece58893f4a5cbe50e7f8f7419c09',
          vesselCharacter:'c63e1f62054441ecc1afd18939b5b1d57be0963d'}
        :{ai:'67db9eee6eff3cacd6b7c3a5899f734071f0abf7',character:'06b6117b5a8d3a42cafd31bd85b050f90c2b2c03',
          characterFantasticStory:'038aa245378b6c91496106444253a18829855e52',ability:'33c8e0bf1778b4b070d8bdab8403f525ea79a7fe',
          vesselAi:'362baa70f9c421a1d1f7e4e46e39f13e27ef78a8',vesselAbility:'12156c11809ece58893f4a5cbe50e7f8f7419c09',
          vesselCharacter:'c63e1f62054441ecc1afd18939b5b1d57be0963d',vesselCharacterFantasticStory:'955742680b930b1ad1b4a82d4db396857335f383'}},
    actions:{basic:{name:'未使用的基础攻击',type:'Normal',element:'Physical',target:'single',terms:[],hitEnergy:0},
      skill01:{name:'亡死的黑云',type:'Normal',element:'Physical',target:'blast',
        terms:[{scaling:'atk',multiplier:p.skill01[0]},{scaling:'atk',multiplier:p.skill01[1],target:'adjacent'}],
        hitEnergy:10,toughness:10,adjacentToughness:10},
      skill02:{name:'将尽的命数',type:'Normal',element:'Physical',target:'all',
        terms:[{scaling:'atk',multiplier:p.skill02[0]}],hitEnergy:10,toughness:10},
      skill03:{name:'相混的道途',type:'Normal',element:null,target:'self',terms:[],hitEnergy:0},
      skill04:{name:'沉默的悲叹',type:'Normal',element:null,target:'self',terms:[],hitEnergy:0},
      skill05:{name:'却是必要的苦难',type:'Normal',element:'Physical',target:'all',terms:[],hitEnergy:0},
      skill06:{name:'幽冥的悼念',type:'Normal',element:'Physical',target:'blast',
        terms:[{scaling:'atk',multiplier:p.skill01[0]},{scaling:'atk',multiplier:p.skill01[1],target:'adjacent'}],
        hitEnergy:10,toughness:0},
      skill07:{name:'莫因舍弃而哭泣',type:'Normal',element:'Physical',target:'all',
        terms:[{scaling:'atk',multiplier:p.skill07[2]}],hitEnergy:15,toughness:15},
      wait:{name:'没有可执行的源动作',type:'Normal',element:'Physical',target:'self',terms:[],hitEnergy:0}},
    policy:{autoUltimate:false},
    enemyMechanicNotes:[
      'AI 状态机按 Phase_Flag / AIFlag / SkillFlag 复现：第一阶段 1/2→亡死的黑云或将尽的命数（SkillFlag 交替）、3→相混的道途（无召唤体时退回 2）、4/5→幽冥的悼念、6→却是必要的苦难；第二阶段 1→黑云/命数、2→相混的道途、3→幽冥的悼念（写入 Assist_Flag）、4→沉默的悲叹、5→莫因舍弃而哭泣。异相仲裁（FantasticStory）AI 只有 3 个决策：1→交替攻击并置 2、2→仍持有追加行动时继续交替攻击，否则移除追加行动后置 3 释放沉默的悲叹、3→置 1 释放莫因舍弃而哭泣；该形态不进入第二血条，也不召唤容器',
      '亡死的黑云对主目标 4.0 倍、相邻 2.0 倍物理伤害；第一阶段召唤 2 个、第二阶段召唤 4 个 403202001，且受 !FantasticStory 门控（4034014 不召唤）',
      '容器的入场结算（PassiveSkillInitiate）只有当首领没有 Charge 时才扣血并挂 RallyHP 印记：403202003 为 PassiveSkill01[1]=6% 最大生命，403202001 / 403202002 没有 PassiveSkill01 行故按 0 处理、LoseHPByRatio 的 Floor 1 使其固定扣 1 点；此外沉默的悲叹每召唤一个 403202003，首领自身再消耗 Skill04[1]=5% 最大生命并挂一条印记（此时首领已持有 Charge，入场结算被跳过）。300395742 在本地为 Type None，按 1 倍实现',
      '沉默的悲叹获得 Charge、召唤 4 个 403202003、写入 Skill04[0]=8 层灾难之力并把自身行动延后 Skill04[2]（混沌回忆 2.5 / 异相仲裁 1.5）',
      '却是必要的苦难按 AttackCount = 灾难之力 × Skill05[0] 分档（混沌回忆 8×2=16、异相仲裁 8×1=8）：2 / 4 / ≥6 分别结算 2 / 4 / 6 段 Skill05[1] 群体伤害，AttackCount 恰为 8 时再追加 1 段 2×Skill05[1]；其余取值（含灾难之力为 0 时的 AttackCount=0）走 Skill05_Attack 分支，只结算 1 段 Skill05[2] 群体伤害，因此 Skill05[2] 不是每次都会出现的收尾段。结算后灾难之力清零并获得 OneMorePerTurn',
      '莫因舍弃而哭泣造成 Skill07[2]=3.0 倍群体伤害（削韧 15），随后按 AttackCount = 灾难之力 × Skill07[0] 逐段追加 Skill07[1]=1.6 倍（异相仲裁 0.4 倍）的 0 削韧伤害，击杀全部容器、按印记记录的入场生命消耗回复生命并获得 OneMorePerTurn',
      '幽冥的悼念由 Skill06_Phase02 的一组并行技能共同结算：首领先按 Assist_Flag 打出 Skill01 阵型（4.0 主目标 / 2.0 相邻）或 Skill02 阵型（3.0 全体），每名助战容器再追加一次首领攻击力×自身 Skill01[0]/[1]（403202001：0.5 / 0.25）或 Skill02[0]（403202002：0.5）的伤害；助战数受阶段上限约束（2 / 4）。并行技能挂在 RetargetList 的任务列表内，找不到可助战容器时整组都不执行，本回合不造成伤害且 Assist_Flag 不会被改写；参与助战的容器各自移除自己的苦痛缠绕印记与死亡遗言、按 PassiveSkill01[0] 叠加灾难之力（A / B 无该行故为 0），最后一名另按 PassiveSkill01[1]×助战数回复首领生命，全部在结算后 ForceKill',
      '容器只有在持有死亡遗言（MMonster_W4_FireProwler_01_DeathRattle）或 HPBack 时阵亡才会触发首领侧结算：移除该容器对应的苦痛缠绕印记、永别的决绝减 1 层；死亡遗言另使首领承受 Skill01[4]=5% 最大生命的自伤。经 Skill06 / Skill07 助战后 ForceKill、或 ChargeBreak 清除的容器已先被移除 DeathRattle / HPBack，不产生任何结算。403202003 的 HPBack 在灾难之力>0 时消耗 1 层灾难之力与 Skill04[1]=5% 最大生命重新召唤一个 403202003（每批灾难之力至多触发一次）。每层减免 5% 属推断值：AllDamageReduce = Layer × dyn(2128130574)，该哈希在 Character Config 中为 Type None，按技能说明的 5% 接入',
      '战斗开始时 PassiveSkill01 以 Skill01[3]=8 层施加全伤害减免；切换生命阶段时静默驱散自身状态、把灾难之力清零、再次以 Skill01[3]=8 层重新施加全伤害减免、SetActionDelay 0（立即行动），并把 Phase_Flag 置 2、AIFlag 置 1、SkillFlag 置 2',
      '300395742（RallyHP 比例修正）、-241083080（Skill07 每名容器回复比例）、-1120180919（Skill07 回复计数）与助战写入灾难之力的 -1298197153 在本地为 Type None；当前分别按 1 倍、印记记录的入场生命消耗、场上容器数、PassiveSkill01[0] 实现。助战追加伤害的 1900621338 / 1349364430 / 1752801979 由 Monster_W4_FireProwler_01_DamageValue 的 MDF_Skill01 / MDF_Skill01_Adjoin / MDF_Skill02 复制容器自身的 SkillParam，0.5 / 0.25 / 0.5 与 MonsterSkillConfig 的 ParamList 一致；1913893140 / 1917372883 是各阶段的助战计数阈值而非倍率。「空 RetargetList 时整组并行技能不执行」是对 Ability 结构的静态推断，本地无法用战斗录像核对。玩家侧的 MCommon_RallyHP_Controller_V2【侵蚀】与【焕新】尚未接入；403202003 的五技能 AI 在被召唤形态下不可达',
    ],
    provenance:{version:ctx.data._meta.version,source:'HSR_4.6.db + data/enemy_ai_4.6.json + DimbreathBot/TurnBasedGameData@312b4597691e0a29cf9828a15b592757dba86949',
      stats:m._provenance,scene:provenance,
      ai:fantastic?'Config/ConfigAI/Monster_W4_FireProwler_00_AI_FantasticStory.json':'Config/ConfigAI/Monster_W4_FireProwler_00_AI.json',
      character:fantastic?'Config/ConfigCharacter/Monster/Monster_W4_FireProwler_00_Config_FantasticStory.json':'Config/ConfigCharacter/Monster/Monster_W4_FireProwler_00_Config.json',
      ability:'Config/ConfigAbility/Monster/Monster_W4_FireProwler_00_Ability.json',
      vesselAi:'Config/ConfigAI/Monster_W4_FireProwler_01_AI.json',
      vesselAbility:'Config/ConfigAbility/Monster/Monster_W4_FireProwler_01_Ability.json',
      vesselCharacter:'Config/ConfigCharacter/Monster/Monster_W4_FireProwler_01_Config.json',
      sourceHashes:fantastic
        ?{ai:'3b77b3a6b8ed9e2c2a60092a2752c846e50a8748',character:'06b6117b5a8d3a42cafd31bd85b050f90c2b2c03',
          ability:'33c8e0bf1778b4b070d8bdab8403f525ea79a7fe',vesselAi:'362baa70f9c421a1d1f7e4e46e39f13e27ef78a8',
          vesselAbility:'12156c11809ece58893f4a5cbe50e7f8f7419c09',vesselCharacter:'c63e1f62054441ecc1afd18939b5b1d57be0963d'}
        :{ai:'67db9eee6eff3cacd6b7c3a5899f734071f0abf7',character:'06b6117b5a8d3a42cafd31bd85b050f90c2b2c03',
          ability:'33c8e0bf1778b4b070d8bdab8403f525ea79a7fe',vesselAi:'362baa70f9c421a1d1f7e4e46e39f13e27ef78a8',
          vesselAbility:'12156c11809ece58893f4a5cbe50e7f8f7419c09',vesselCharacter:'c63e1f62054441ecc1afd18939b5b1d57be0963d'}}};
}
// 4032024 残破容器（虚构叙事 2027 第一波填充怪，spawn_count 20）。本地 AI 索引
// 把唯一有序技能指向 403202402（共祭•将尽的命数），其参数为 1.6 倍群体伤害与
// 侵蚀控制器的 0.6/0.3/0.2；技能表另有共祭•亡死的黑云 1.6/1.0 的震击分支。
export function brokenContainer(ctx,{sceneEnemy=null,level=85,id='broken-container-1'}={}){
  const childId=sceneEnemy?.childId??4032024;
  if(![4032024,403202401].includes(childId))throw new Error('残破容器场景记录 childId 不匹配');
  level=sceneEnemy?.level??level;
  const m=buildSceneMonster(ctx,sceneEnemy,4032024,childId,level);
  for(const k of ['hp','atk','def','speed','stance'])if(!Number.isFinite(m[k]))throw new Error('残破容器缺少 '+k+' 数据');
  const hp=sceneEnemy?.hp??m.hp,def=sceneEnemy?.def??m.def,speed=sceneEnemy?.speed??m.speed,stance=sceneEnemy?.stance??m.stance;
  for(const [k,v] of Object.entries({hp,def,speed,stance}))if(!Number.isFinite(v)||v<=0)throw new Error('残破容器场景 '+k+' 无效');
  const stats=ctx.monsterStatsById?.get(4032024),critDmg=Number.isFinite(stats?.critDmg)?stats.critDmg:0;
  const provenance=sceneEnemy?{source:'abyss_wave_monsters',mode:sceneEnemy.mode,seasonId:sceneEnemy.seasonId,
    floorId:sceneEnemy.floorId,wave:sceneEnemy.wave,infiniteWaveId:sceneEnemy.infiniteWaveId,stats:sceneEnemy._provenance}:m._provenance;
  return {id,name:sceneEnemy?.name??m.name,monsterId:4032024,childId,side:'enemy',level,element:'Physical',
    panel:{hp,atk:m.atk,def,speed,critRate:0,critDmg,effectRes:sceneStatusRes(sceneEnemy,m.statusRes),energyRegen:1,elemDmg:{},baseStats:{hp,atk:m.atk,def}},
    baseSpeed:speed,energy:0,energyMax:0,toughnessMax:sceneToughness(sceneEnemy,stance),weaknesses:sceneEnemy?.weakness??m.weakness,
    res:sceneEnemy?.res??m.res,standardBreak:true,rank:'normal',
    enemyKit:{id:4032024,revision:'4.6-broken-container-1',aiPath:'Config/ConfigAI/Monster_Common_SequenceThree_AI.json',
      aiSequence:[403202402],skill02Params:[1.6,.6,.3,.2],skill01Params:[1.6,1],
      erosionId:240320101,erosionTransferRatio:.6,sourceHashes:{ai:'26aab40120a49b8b467ac4535f80e4381d9df0c1'}},
    actions:{basic:{name:'未使用的基础攻击',type:'Normal',element:'Physical',target:'single',terms:[],hitEnergy:0},
      skill:{name:'共祭•将尽的命数',type:'Normal',element:'Physical',target:'all',
        terms:[{scaling:'atk',multiplier:1.6}],hitEnergy:5,toughness:5},
      skill01:{name:'共祭•亡死的黑云',type:'Normal',element:'Physical',target:'blast',
        terms:[{scaling:'atk',multiplier:1.6},{scaling:'atk',multiplier:1,target:'adjacent'}],hitEnergy:5,toughness:5,adjacentToughness:5}},
    policy:{autoUltimate:false,rotation:['skill']},
    unsupported:['【侵蚀 / 焕新】的 RallyHP 控制器（240320101）在本地只有说明文本，伤害转侵蚀与回复解除尚未接入',
      '共祭•亡死的黑云（403202401）只在技能表与 AI 索引中出现，虚构叙事 AI 实际使用 403202402，故仅保留为可选动作',
      '403202401 变体（速度 -40）与 4032024 共用同一套技能 / AI，当前按场景行传入的基础怪物 4032024 构建'],
    provenance:{version:ctx.data._meta.version,source:'HSR_4.6.db + data/enemy_ai_4.6.json + DimbreathBot/TurnBasedGameData@312b4597691e0a29cf9828a15b592757dba86949',
      stats:m._provenance,scene:provenance,ai:'Config/ConfigAI/Monster_Common_SequenceThree_AI.json',
      ability:'Config/ConfigAbility/Monster/Monster_AML_Minion02_01_Ability.json',
      note:'403202402 的 Ability 文件未随固定提交取回，倍率来自 MonsterSkillConfig 参数与本地 AI 索引',
      sourceHashes:{ai:'26aab40120a49b8b467ac4535f80e4381d9df0c1',ability:'Monster_AML_Minion02_01_Ability.json（未取回 403202402 的 Ability）'}}};
}
export function isEnemyMechanicRegistered(id){return id===4023010||id===402301001||id===402301002||id===4012020||id===8002010||id===8003020||id===2012010||id===8012010||id===8012020||id===8012030||id===1012030||id===2032010||id===2032020||id===2033010||id===2013020||id===2023020||id===4022010||id===8003010||id===3013010||id===5013010||id===2004014||id===4064012||id===4063010||id===4012010||id===8022010||id===8033010||id===4033010||id===3003040||id===3003050||id===3003030||id===800304016||id===4053020||id===3024030||id===4014030||id===5023010||id===5014020||id===5014023||id===5012120||id===300302007||id===8033020||id===402302001||id===503401002||id===4033030||id===8003060||id===4032010||id===4032030||id===401301201||id===4013012||id===5023020||id===202205004||id===202303016||id===3002010||id===5012050||id===2022040||[5013040,5013050,5013060,5013070,1002020,1002030,1012010,1022010,1022020,2002030,2002010,2022010,3002030,803301011,1002040,5012110,501211002,5012100,200401401,200401402,200401403,200401404,4052010,4053010,405301002,4062010,406401201,406401202,406401203,406401204,406301001,403301002,300305007,1013020,101302032,1023010,4034010,4034014,4032024,403202401,403202001,403202002,403202003].includes(id)||
  [5013040,5013050,5013060,5013070].some(baseId=>Math.floor(id/100)===baseId);}
export function withReavers(ctx,config,{level=90,count=3,waves=1}={}){
  if(!Number.isInteger(count)||count<1||count>5)throw new Error('敌人数量须为 1～5');
  if(!Number.isInteger(waves)||waves<1||waves>10)throw new Error('波次须为 1～10');
  const allies=structuredClone(config.units.filter(u=>u.side==='ally')),old=new Set(config.units.filter(u=>u.side==='enemy').map(u=>u.id));
  for(const u of allies)for(const a of Object.values(u.actions))if(old.has(a.targetId))delete a.targetId;
  const enemies=Array.from({length:waves},(_,w)=>Array.from({length:count},(_,i)=>({...reaver(ctx,{level,id:'reaver-'+(w*count+i+1)}),wave:w+1}))).flat();
  return {...structuredClone(config),waveMode:'moc',description:`真实普通敌人规则：${waves} 波，每波 ${count} 只 Lv.${level} 虚卒·掠夺者；基础 / 扩散攻击按 AI 冷却交替，每次攻击叠加速度。换波重置行动条，保留我方生命、能量、战技点与效果。无额外关卡加成；可手动修改面板。`,units:[...allies,...enemies]};
}
export function withAutomatonBeetle(ctx,config,{level=90,count=1,waves=1,sceneEnemy=null}={}){
  if(!Number.isInteger(count)||count<1||count>5)throw new Error('敌人数量须为 1～5');
  if(!Number.isInteger(waves)||waves<1||waves>10)throw new Error('波次须为 1～10');
  const allies=structuredClone(config.units.filter(u=>u.side==='ally')),old=new Set(config.units.filter(u=>u.side==='enemy').map(u=>u.id));
  for(const u of allies)for(const a of Object.values(u.actions))if(old.has(a.targetId))delete a.targetId;
  const enemies=Array.from({length:waves},(_,w)=>Array.from({length:count},(_,i)=>({...automatonBeetle(ctx,{level,id:'mecha-beetle-'+(w*count+i+1),sceneEnemy}),wave:w+1}))).flat();
  const stage=sceneEnemy?`使用 ${sceneEnemy.mode} ${sceneEnemy.seasonId}:${sceneEnemy.floorId} 源记录（Lv.${sceneEnemy.level}、HP ${sceneEnemy.hp}、速度 ${sceneEnemy.speed}）`:`自由沙盒 Lv.${level}`;
  return {...structuredClone(config),waveMode:'moc',description:`${stage}。真实普通敌人规则：${waves} 波，每波 ${count} 只自动机兵·甲虫；AI 每回合使用不稳定力场，造成 3 倍攻击力的物理单体伤害，并获得一次可抵挡非持续伤害的屏障。`,units:[...allies,...enemies]};
}
export function withMoonrageWolves(ctx,config,{level=90,count=1,sceneEnemy=null,childId=2032020}={}){
  if(!Number.isInteger(count)||count<1||count>5)throw new Error('敌人数量须为 1～5');
  const allies=structuredClone(config.units.filter(u=>u.side==='ally')),old=new Set(config.units.filter(u=>u.side==='enemy').map(u=>u.id));
  for(const u of allies)for(const a of Object.values(u.actions))if(old.has(a.targetId))delete a.targetId;
  const sourceId=sceneEnemy?.childId??childId;
  if(![2032010,2032020].includes(sourceId))throw new Error('月狂机制样本只支持狼卒 2032010 / 2032020');
  const factory=sourceId===2032010?bloodclawWolf:eclipsedWolf,group='lycan-wave-1';
  const enemies=Array.from({length:count},(_,i)=>({...factory(ctx,{level,id:'lycan-'+(i+1),rageGroup:group,sceneEnemy}),wave:1}));
  const stage=sceneEnemy?`使用 ${sceneEnemy.mode} ${sceneEnemy.seasonId}:${sceneEnemy.floorId} 源记录（Lv.${sceneEnemy.level}、HP ${sceneEnemy.hp}、速度 ${sceneEnemy.speed}）`:`自由沙盒 Lv.${level}`;
  const details=sourceId===2032010?'玄爪狼卒【厮杀】命中主目标与相邻目标；月狂时施加 2 回合裂伤（攻击力 30%，单次上限为目标最大生命的 5%）。':'蚀月狼卒【啃噬】为物理单体攻击，月狂时每次攻击回复自身最大生命值的 40%。';
  return {...structuredClone(config),waveMode:'moc',description:`${stage}。${count} 只同组狼卒共享 6 次敌方攻击计数；达阈值后速度提高 30%、生成速度 105 的倒计时行动。${details}`,units:[...allies,...enemies]};
}
export function validateEnemyActor(u){
  if(!u.monsterId&&!u.enemyKit)return [];
  const k=u.enemyKit,errors=[],fail=m=>errors.push(u.name+'：'+m),eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  if(u.monsterId===4012020&&k?.revision==='4.6-furiae-philosopher-1'){
    if(u.childId!==4012020||k.id!==4012020||u.element!=='Physical')fail('天谴哲人 childId 或物理属性不匹配');
    if(!eq([k.skill01Id,k.skill01Params,k.skill02Id,k.skill02Params,k.passive02Id,k.passive02Params,
      k.passiveSkillId,k.passiveParams],
      [401202001,[.3,.3],401202002,[3],401202003,[.3,.3,2],401202004,[3,.3,.1,.1,.06,.3]]))
      fail('宣教 / 战是万物父 / 永恒的活火 / 城邦守护者参数与 4.6 本地技能表不符');
    const book=u.actions?.skill01,hit=u.actions?.skill02;
    if(!book||book.name!=='斗争即正义'||book.target!=='self'||book.terms?.length||
      !hit||hit.name!=='战是万物父'||hit.element!=='Physical'||hit.target!=='single'||hit.hitEnergy!==15||
      !eq(hit.terms,[{scaling:'atk',multiplier:3}]))fail('天谴哲人的宣教或物理单体动作不完整');
    if(!Array.isArray(u.enemyMechanicNotes)||u.enemyMechanicNotes.length!==5||u.policy?.autoUltimate!==false)
      fail('天谴哲人宣教清除条件 / 战甲 / 致命一击者增益缺口未说明');
    return errors;
  }
  if(u.monsterId===8002010&&k?.revision==='4.6-imaginary-weaver-1'){
    if(u.childId!==8002010||k.id!==8002010||u.element!=='Imaginary')fail('虚数织叶者 childId 或虚数属性不匹配');
    if(!eq([k.skill01Id,k.skill01Params,k.skill02Id,k.skill02Params,k.skill03Id,k.skill03Params,
      k.passiveSkillId,k.passiveParams],
      [800201001,[2.5],800201002,[2.5],800201003,[2.5,1],800201004,[0]]))
      fail('颂歌光束 / 爆发 / 震荡 / 虚数护甲参数与 4.6 本地技能表不符');
    const beam=u.actions?.skill01,burst=u.actions?.skill02,shock=u.actions?.skill03;
    if(!beam||beam.name!=='颂歌光束'||beam.target!=='single'||beam.hitEnergy!==15||
      !eq(beam.terms,[{scaling:'atk',multiplier:2.5}])||
      !burst||burst.name!=='颂歌爆发'||burst.target!=='single'||burst.hitEnergy!==15||
      !eq(burst.terms,[{scaling:'atk',multiplier:2.5}])||
      !shock||shock.name!=='颂歌震荡'||shock.target!=='blast'||shock.hitEnergy!==10||
      !eq(shock.terms,[{scaling:'atk',multiplier:2.5},{scaling:'atk',multiplier:2.5,target:'adjacent'}]))
      fail('虚数织叶者的三种颂歌动作不完整');
    if(!Array.isArray(u.enemyMechanicNotes)||u.enemyMechanicNotes.length!==5||u.policy?.autoUltimate!==false)
      fail('虚数织叶者 AIFlag 轮转 / 后手增益 / 虚数护甲缺口未说明');
    return errors;
  }
  if(u.monsterId===8003020&&k?.revision==='4.6-universe-fire-elite-1'){
    if(u.childId!==8003020||k.id!==8003020||u.element!=='Fire')fail('外宇宙之炎 childId 或火属性不匹配');
    if(!eq([k.skill01Id,k.skill01Params,k.skill03Id,k.skill03Params,k.skill05Id,k.skill05Params,
      k.skill07Id,k.skill07Params],
      [800302001,[2.5,1,2,.5],800302002,[0,0,60,0],800302003,[1,1,2,.5,5,60],800302004,[.3]]))
      fail('咆哮之火 / 汲取炎华 / 净炎之雨 / 熔聚参数与 4.6 本地技能表不符');
    const roar=u.actions?.skill01,kindle=u.actions?.skill03,rain=u.actions?.skill05,melt=u.actions?.skill07;
    if(!roar||roar.name!=='咆哮之火'||roar.target!=='single'||roar.hitEnergy!==10||
      !eq(roar.terms,[{scaling:'atk',multiplier:2.5}])||
      !kindle||kindle.name!=='汲取炎华'||kindle.target!=='self'||kindle.terms?.length||
      !rain||rain.name!=='净炎之雨'||rain.randomHitTargets!==true||rain.repeatCount!==5||
      !eq(rain.terms,[{scaling:'atk',multiplier:1}])||
      !melt||melt.name!=='熔聚'||melt.target!=='self'||melt.terms?.length)
      fail('外宇宙之炎的四种动作不完整');
    if(!Array.isArray(u.enemyMechanicNotes)||u.enemyMechanicNotes.length!==7||u.policy?.autoUltimate!==false)
      fail('外宇宙之炎双阶段 / 焚烧 / 熔聚与未还原项未说明');
    return errors;
  }
  if(u.monsterId===800304016&&k?.revision==='4.6-devourer-shadow-1'){
    if(u.childId!==800304016||k.id!==800304016||u.element!=='Imaginary')fail('蚕食者之影 childId 或虚数属性不匹配');
    if(!eq([k.skill02Id,k.skill02Params,k.skill03Id,k.skill03Params,k.skill04Id,k.skill04Params,
      k.skill05Id,k.skill06Id,k.passiveSkillId,k.passiveParams],
      [800304002,[3],800304003,[5],800304005,[2.25],800304004,800304007,800304006,[.1,.2,.5]]))
      fail('流年金刺 / 流年谴罚 / 黄金年代的绸缪 / 解放参数与 4.6 本地技能表不符');
    if(u.actions?.skill02?.target!=='single'||!eq(u.actions.skill02.terms,[{scaling:'atk',multiplier:3}])||
      u.actions?.skill03?.target!=='single'||!eq(u.actions.skill03.terms,[{scaling:'atk',multiplier:5}])||
      !eq(u.actions.skill03.hitShares,[.5,.5])||
      u.actions?.skill04?.repeatCount!==9||u.actions.skill04.randomHitTargets!==true||
      !eq(u.actions.skill04.terms,[{scaling:'atk',multiplier:2.25}])||
      u.actions?.skill05?.target!=='self'||u.actions?.skill06?.target!=='self')
      fail('蚕食者之影的动作形状不完整');
    if(k.energyChargeLayers!==9||k.volleyCount!==9||k.volleyMultiplier!==2.25||k.confineChance!==.2||
      k.confineDelayRatio!==.5||k.damageReduce!==.1||k.breakDelayRatio!==.25)
      fail('蓄力 / 禁锢 / 减伤 / 击破参数缺失');
    if(!Array.isArray(u.enemyMechanicNotes)||u.enemyMechanicNotes.length!==6||u.policy?.autoUltimate!==false)
      fail('蓄力层数 / 禁锢 / 未挂载修饰器说明缺失');
    return errors;
  }
  if(u.monsterId===3003030&&k?.revision==='4.6-cage-past-1'){
    if(u.childId!==3003030||k.id!==3003030||u.element!=='Physical')fail('「身陷樊笼的往昔」childId 或物理属性不匹配');
    if(!eq([k.skill01Id,k.skill01Params,k.skill03Id,k.skill03Params,k.skill04Id,k.skill05Id,
      k.skill05Params,k.skill07Id,k.skill07Params],
      [300303001,[3.6,0],300303002,[3,0],300303003,300303004,[15],300303007,[3]]))
      fail('鞭伤除净恶 / 责打入人心 / 使者带锁链 / 笼中传福音参数与 4.6 本地技能表不符');
    if(u.actions?.skill01?.target!=='single'||!eq(u.actions.skill01.terms,[{scaling:'atk',multiplier:3.6}])||
      u.actions?.skill03?.target!=='blast'||
      !eq(u.actions.skill03.terms,[{scaling:'atk',multiplier:3},{scaling:'atk',multiplier:3,target:'adjacent'}])||
      u.actions?.skill04?.target!=='self'||u.actions.skill04.terms?.length||
      u.actions?.skill05?.terms?.length!==0||u.actions?.skill07?.target!=='all')
      fail('「身陷樊笼的往昔」的动作形状不完整');
    if(k.maxAimTargets!==4||k.aimInitialLayers!==4||k.breakAiFlag!==7||k.breakDelayRatio!==.5)
      fail('锁定 / 蓄力 / 击破参数缺失');
    if(!Array.isArray(u.enemyMechanicNotes)||u.enemyMechanicNotes.length!==6||u.policy?.autoUltimate!==false)
      fail('锁定转移 / 平均分摊 / 未还原项说明缺失');
    return errors;
  }
  if(u.monsterId===3002010&&k?.revision==='4.6-dreamjolt-mr-domescreen-partial-1'){
    if(u.childId!==3002010||k.id!==3002010||u.element!=='Quantum')fail('圆幕先生 childId 或量子属性不匹配');
    if(!eq([k.skill01Id,k.skill01Params,k.skill02Id,k.skill02Params,k.skill03Id,k.skill03Params,k.flopDynamicHash],
      [300201001,[.5],300201002,[1.6,.2],300201003,[],1675480356]))fail('惊喜 / 惊吓频道技能、参数或翻面来源与 4.6 数据不符');
    const surprise=u.actions?.skill01,shock=u.actions?.skill02,flip=u.actions?.skill03;
    if(!surprise||surprise.name!=='惊喜综艺'||surprise.target!=='single'||surprise.terms?.length||
      !shock||shock.name!=='惊吓播报'||shock.element!=='Quantum'||shock.target!=='all'||
      !eq(shock.terms,[{scaling:'atk',multiplier:1.6}])||!flip||flip.name!=='频道切换'||flip.target!=='self')
      fail('圆幕先生三种频道动作缺失或伤害倍率错误');
    if(!Array.isArray(u.enemyMechanicNotes)||u.enemyMechanicNotes.length!==3||u.policy?.autoUltimate!==false)
      fail('圆幕先生动态翻面哈希、目标规则或 PuzzleGamePassive 缺口未说明');
    return errors;
  }
  if(u.monsterId===5012050&&k?.revision==='4.6-assistant-graffiti-rusher-partial-1'){
    if(u.childId!==5012050||k.id!==5012050||u.element!=='Wind')fail('助手涂鸦•赶稿 childId 或风属性不匹配');
    if(!eq([k.skill01Id,k.skill01Params,k.passiveSkillId],
      [501205001,[2,1,2,.5,5],501205002]))fail('赶稿技能倍率 / 风化参数与本地 4.6 AI 索引不符');
    const attack=u.actions?.skill01;
    if(!attack||attack.name!=='快！再快点！'||attack.type!=='Normal'||attack.element!=='Wind'||
      attack.target!=='single'||attack.hitEnergy!==10||!eq(attack.terms,[{scaling:'atk',multiplier:2}]))
      fail('赶稿单体风伤动作不完整');
    if(!Array.isArray(u.enemyMechanicNotes)||u.enemyMechanicNotes.length!==1||u.policy?.autoUltimate!==false)
      fail('赶稿风化 modifier 结算时点 / 覆盖规则缺口未说明');
    return errors;
  }
  if(u.monsterId===2022040&&k?.revision==='4.6-abundance-golden-hound-partial-1'){
    if(u.childId!==2022040||k.id!==2022040||u.element!=='Wind')fail('丰饶灵兽•娄金 childId 或风属性不匹配');
    if(!eq([k.skill01Id,k.skill01Params,k.passiveSkillId],[202204001,[2.5],202204002]))
      fail('娄金攻击倍率或退场被动 ID 与本地 4.6 技能索引不符');
    const attack=u.actions?.skill01;
    if(!attack||attack.name!=='角牴'||attack.type!=='Normal'||attack.element!=='Wind'||attack.target!=='single'||
      attack.hitEnergy!==10||!eq(attack.terms,[{scaling:'atk',multiplier:2.5}]))fail('娄金单体风伤动作不完整');
    if(!Array.isArray(u.enemyMechanicNotes)||u.enemyMechanicNotes.length!==1||u.policy?.autoUltimate!==false)
      fail('娄金「嗥吠」退场机制缺口未说明');
    return errors;
  }
  if(u.monsterId===2012010&&k?.revision==='4.6-illumination-dragonfish-1'){
    if(u.childId!==2012010||k.id!==2012010||u.element!=='Fire')fail('灯昼龙鱼 childId 或火属性不匹配');
    if(!eq([k.skill01Id,k.skill01Params,k.skillP01Id,k.skillP01Params],
      [201201001,[1.5,.8,.3,2],201201002,[.4,1,.3,2,30]]))fail('宵明 / 烛花参数与本地 4.6 数据不符');
    const attack=u.actions?.skill01,death=u.actions?.skill02;
    if(!attack||attack.name!=='宵明'||attack.element!=='Fire'||attack.target!=='all'||attack.hitEnergy!==5||
      !eq(attack.terms,[{scaling:'atk',multiplier:1.5}])||!death||death.name!=='烛花 · 死亡反击'||
      death.element!=='Fire'||death.target!=='all'||death.toughness!==30||
      !eq(death.terms,[{scaling:'hp',multiplier:.4}]))fail('灯昼龙鱼普通攻击或最大生命值死亡反击动作不完整');
    if(k.defDownChance!==.8||k.defDownRatio!==.3||k.defDownDuration!==2||
      k.deathDamageMaxHpRatio!==.4||k.deathToughness!==30||u.enemyMechanicNotes?.length)
      fail('灯昼龙鱼防御降低 / 死亡反击参数或来源缺口说明不匹配');
    return errors;
  }
  if(u.monsterId===5012100&&k?.revision==='4.6-magical-girl-troupe-1'){
    if(u.childId!==5012100||k.id!==5012100||u.element!=='Thunder')fail('魔法少女 childId 或雷属性不匹配');
    if(!eq([k.skill01Id,k.skill01Params,k.skill02Id,k.skill02Params,k.skill03Id,k.skill03Params,
      k.passiveSkillId,k.passiveParams,k.aiSequence],
      [501210001,[2.8],501210002,[1,2,1,.5],501210003,[.25,2],501210004,[1,2,.25],[501210001]]))
      fail('普通攻击、雨天 / 晴天退场技或被动参数与 4.6 SQLite / AI 索引不符');
    const attack=u.actions?.skill01,rain=u.actions?.skill02,sun=u.actions?.skill03;
    if(!attack||attack.name!=='恋爱❤雷暴天'||attack.type!=='Normal'||attack.element!=='Thunder'||attack.target!=='single'||
      attack.hitEnergy!==10||attack.hitEnergyPerHit!==true||!eq(attack.terms,[{scaling:'atk',multiplier:2.8}])||
      !eq(attack.hitShares,[.1,.1,.1,.1,.1,.1,.4]))fail('雷暴天须保留源配置的七段命中比例和总倍率');
    if(!rain||rain.name!=='柔雨❤好想你'||rain.element!=='Thunder'||rain.repeatCount!==5||rain.randomHitTargets!==true||
      !eq(rain.terms,[{scaling:'atk',multiplier:1}])||!sun||sun.target!=='all')
      fail('雨天五次随机雷击或晴天全体退场行动缺失');
    if(!Array.isArray(u.enemyMechanicNotes)||u.enemyMechanicNotes.length!==3||u.policy?.autoUltimate!==false)
      fail('魔法少女来源或场景缺口说明缺失');
    return errors;
  }
  if(u.monsterId===4062010&&k?.revision==='4.6-ichor-pheasant-partial-1'){
    if(u.childId!==4062010||k.id!==4062010||u.element!=='Imaginary')fail('金血忆灵•雉形 childId 或虚数属性不匹配');
    if(!eq([k.skill01Id,k.skill01Params,k.skill02Id,k.skill02Params,k.resonanceEffectId,k.aiSequence],
      [406201001,[2.8,1.2],406201002,[],240620101,[405201001]]))
      fail('罪血啄食、罪血共鸣或 AI 序列与本地 4.6 数据不符');
    const attack=u.actions?.skill01,resonance=u.actions?.skill02;
    if(!attack||attack.name!=='罪血啄食'||attack.element!=='Imaginary'||attack.target!=='single'||attack.hitEnergy!==10||
      !eq(attack.terms,[{scaling:'atk',multiplier:2.8}])||attack.toughness!==1.2||
      !resonance||resonance.name!=='罪血共鸣'||resonance.terms.length!==0)
      fail('雉形来源攻击或共鸣动作缺失');
    if(!Array.isArray(u.enemyMechanicNotes)||u.enemyMechanicNotes.length!==2||u.policy?.autoUltimate!==false)
      fail('雉形 AI 顺序缺口说明缺失');
    return errors;
  }
  if(u.monsterId===1002030&&k?.revision==='4.6-silvermane-cannoneer-partial-1'){
    if(u.childId!==1002030||k.id!==1002030||u.element!=='Physical')fail('银鬃炮手 childId 或物理属性不匹配');
    if(!eq([k.skill01Id,k.skill01Params,k.skill02Id,k.skill02Params,k.skillP01Id,k.skillP01Params],
      [100203001,[1.3,1],100203002,[],100203003,[2.2,1.5]]))fail('炮击 / 掩护支援倍率与本地 4.6 AI 索引不符');
    const attack=u.actions?.skill01,support=u.actions?.skill02,followup=u.actions?.skill03;
    if(!attack||attack.name!=='炮击'||attack.target!=='blast'||attack.hitEnergy!==10||
      !eq(attack.terms,[{scaling:'atk',multiplier:1.3}])||
      !support||support.name!=='掩护支援'||support.target!=='ally'||support.terms.length!==0||
      !followup||followup.name!=='掩护支援 · 追加攻击'||followup.target!=='blast'||followup.hitEnergy!==12||
      !eq(followup.terms,[{scaling:'atk',multiplier:2.2}]))fail('炮手攻击 / 支援追击动作不完整');
    if(!Array.isArray(u.enemyMechanicNotes)||u.enemyMechanicNotes.length!==2||u.policy?.autoUltimate!==false)
      fail('炮手 AI 条件缺口说明缺失');
    return errors;
  }
  if(u.monsterId===300305007&&k?.revision==='4.6-present-inebriated-partial-1'){
    if(u.childId!==300305007||k.id!==300305007||u.element!=='Wind')fail('醉于盛会的此刻 childId 或风属性不匹配');
    if(!eq([k.skill01Id,k.skill01Params,k.skill02Id,k.skill02Params,k.skill04Id,k.skill04Params,
      k.skill05Id,k.skill05Params,k.skill07Id,k.skill07Params,k.windDotModifierId,k.thunderDotModifierId],
      [300305001,[1,2,1.2,3,3],300305002,[1,2,1.2],300305004,[1,2,1.2],300305005,[1.25],300305007,[1.2,2,1.2],23003051,23003052]))
      fail('宴饮技能 / 两种 DoT 参数与本地 4.6 SQLite / AI 索引不符');
    const expected={skill01:['为你倾流宝血','single',5],skill02:['为你摆设筵席','all',10],
      skill04:['使你福杯满溢','all',10],skill05:['为你洗去一切罪','all',15]};
    for(const [key,[name,target,hitEnergy]] of Object.entries(expected)){
      const action=u.actions?.[key];
      if(!action||action.name!==name||action.type!=='Normal'||action.element!=='Wind'||action.target!==target||
        action.hitEnergy!==hitEnergy||action.terms?.length)fail(key+' 应保留无直伤的来源 DoT / 引爆动作合同');
    }
    if(k.dotChance!==1||k.dotDuration!==2||k.dotMultiplier!==1.2||k.burstMultiplier!==1.25||
      !eq(k.dotMaxStacks,{wind:3,thunder:3}))fail('两种宴饮 DoT 或引爆参数缺失');
    if(!Array.isArray(u.enemyMechanicNotes)||u.enemyMechanicNotes.length!==3||u.policy?.autoUltimate!==false)
      fail('宴饮源 AI / DoT 层数与 Edict 缺口说明缺失');
    return errors;
  }
  if(u.monsterId===3003050&&k?.revision==='4.6-present-inebriated-3003050-1'){
    if(u.childId!==3003050||k.id!==3003050||u.element!=='Wind')fail('「醉于盛会的此刻」childId 或风属性不匹配');
    if(!eq([k.skill01Id,k.skill01Params,k.skill02Id,k.skill02Params,k.skill04Id,k.skill04Params,
      k.skill05Id,k.skill05Params,k.skill07Id,k.skill07Params],
      [300305001,[1,2,1.2,3,3],300305002,[1,2,1.2],300305004,[1,2,1.2],300305005,[1.25],300305007,[1.2,2,1.2]]))
      fail('宴饮技能参数与 4.6 本地技能表不符');
    if(!eq(k.sourceHashes,{ai:'641dbe791b7b4ec068154d5bde8bbac7f38875bb',
      ability:'645274ac487217b5c615d9a98535d9224e38ee8d',character:'b53aae93903c5ed65d8e07dfee83f7fb1aee6364'}))
      fail('3003050 的 Ability / Character 来源哈希应为 Monster_W3_Figure_01_*');
    const expected={skill01:['为你倾流宝血','single',5],skill02:['为你摆设筵席','all',10],
      skill04:['使你福杯满溢','all',10],skill05:['为你洗去一切罪','all',15]};
    for(const [key,[name,target,hitEnergy]] of Object.entries(expected)){
      const action=u.actions?.[key];
      if(!action||action.name!==name||action.type!=='Normal'||action.element!=='Wind'||action.target!==target||
        action.hitEnergy!==hitEnergy||action.terms?.length)fail(key+' 应保留无直伤的来源 DoT / 引爆动作合同');
    }
    if(k.dotSnapshot!==true||k.dotPerTargetRoll!==true||k.breakAiFlag!==7)
      fail('3003050 的 UseSnapshotEntity / 逐目标掷骰 / 击破置 7 标记缺失');
    if(!Array.isArray(u.enemyMechanicNotes)||u.enemyMechanicNotes.length!==5||u.policy?.autoUltimate!==false)
      fail('宴饮 DoT 快照 / 层数冲突 / DotMark 缺口说明缺失');
    return errors;
  }
  if(u.monsterId===8003060&&k?.revision==='4.6-fictional-ensemble-controller-1'){
    if(u.childId!==8003060||k.id!==8003060||u.unselectable!==true||u.noAction!==true||u.toughnessMax!==0)
      fail('虚构集合体必须保留来源 childId、不可选取、静音行动及零韧性');
    if(k.waveController!==true||k.aiPath!=='Config/ConfigAI/Monster_Common_SequenceThree_AI.json'||!eq(k.aiSequence,[800306001]))
      fail('虚构集合体控制体 / AI 序列与固定版本来源不符');
    if(!Array.isArray(u.enemyMechanicNotes)||u.enemyMechanicNotes.length!==2||u.policy?.autoUltimate!==false)
      fail('虚构集合体 HP 组与计分清场缺口或敌方终结技设置缺失');
    return errors;
  }
  if(u.monsterId===4033030&&k?.revision==='4.6-dark-sun-gryphon-partial-1'){
    if(u.childId!==4033030||k.id!==4033030||u.element!=='Wind')fail('黑日狮鹫 childId 或风属性不匹配');
    if(!eq([k.skill01Id,k.skill01Params,k.skill02Id,k.skill02Params,k.skill03Id,k.skill04Id,k.skill04Params,
      k.bowSummonId,k.erosionModifierId,k.aiFlagCount],
      [403303001,[3,.5,.2,0,.5],403303002,[.7,.8,.12],403303003,403303004,[4.5,1],403205002,240320101,5]))
      fail('黑日狮鹫技能参数 / 弓手 / 侵蚀来源 ID 与 4.6 SQLite 不符');
    const expected={skill01:['黑光透射','all',3,10],skill04:['热寂颂歌','all',4.5,10]};
    for(const [key,[name,target,multiplier,hitEnergy]] of Object.entries(expected)){
      const a=u.actions?.[key];if(!a||a.name!==name||a.type!=='Normal'||a.element!=='Wind'||a.target!==target||
        a.hitEnergy!==hitEnergy||!eq(a.terms,[{scaling:'atk',multiplier}]))
        fail(key+' 名称、倍率、全体目标、属性或受击回能与 4.6 数据不符');
    }
    if(u.actions?.skill02?.name!=='永夜颁示'||u.actions?.skill03?.name!=='日蚀预言'||
      !Array.isArray(u.enemyMechanicNotes)||u.enemyMechanicNotes.length!==4||u.policy?.autoUltimate!==false)
      fail('黑日狮鹫状态技能、侵蚀 / 召唤缺口或敌方终结技设置缺失');
    return errors;
  }
  if(u.monsterId===4032010&&k?.revision==='4.6-black-tide-blade-partial-1'){
    if(u.childId!==4032010||k.id!==4032010||u.element!=='Physical')fail('黑潮蚀刃 childId 或物理属性不匹配');
    if(!eq([k.skill01Id,k.skill01Params,k.passiveSkillId,k.passiveParams,k.erosionModifierId,k.aiSequence],
      [403201001,[3.5,2.4],403201002,[.5,.2,0,.5],240320101,[403201001]]))
      fail('黑潮蚀刃技能 / 被动参数与 4.6 SQLite 不符');
    const a=u.actions?.skill01;
    if(!a||a.name!=='破灭的锋芒'||a.type!=='Normal'||a.element!=='Physical'||a.target!=='blast'||a.hitEnergy!==10||
      !eq(a.terms,[{scaling:'atk',multiplier:3.5},{scaling:'atk',multiplier:2.4,target:'adjacent'}]))
      fail('黑潮蚀刃攻击名称、主段 / 邻接倍率、目标或受击回能与来源不符');
    if(!Array.isArray(u.enemyMechanicNotes)||u.enemyMechanicNotes.length!==1||u.policy?.autoUltimate!==false)
      fail('黑潮蚀刃侵蚀缺口或敌方终结技设置缺失');
    return errors;
  }
  if(u.monsterId===4032030&&k?.revision==='4.6-black-tide-axe-1'){
    if(u.childId!==4032030||k.id!==4032030||u.element!=='Fire')fail('黑潮蚀斧 childId 或火属性不匹配');
    if(!eq([k.skill01Id,k.skill01Params,k.skill02Id,k.skill02Params,k.passiveSkillId,k.baseChildId,k.averageShareExtraEffectId],
      [403203001,[3],403203002,[14],403203003,4032030,401301001]))
      fail('黑潮蚀斧技能 / 被动参数或平均分摊来源与 4.6 AI 索引不符');
    const a=u.actions?.skill01,b=u.actions?.skill02;
    if(!a||a.name!=='怒潮炽斧'||a.type!=='Normal'||a.element!=='Fire'||a.target!=='single'||a.hitEnergy!==10||
      !eq(a.terms,[{scaling:'atk',multiplier:3}]))
      fail('黑潮蚀斧怒潮炽斧倍率、目标、火属性或回能与来源不符');
    if(!b||b.name!=='仇心忿火'||b.type!=='Normal'||b.element!=='Fire'||b.target!=='all'||b.hitEnergy!==10||
      !eq(b.terms,[{scaling:'atk',multiplier:14}])||b.shareDamageAcrossTargets!==true)
      fail('黑潮蚀斧仇心忿火倍率、全体平均分摊或回能与来源不符');
    if(!Array.isArray(u.enemyMechanicNotes)||u.enemyMechanicNotes.length!==4||u.policy?.autoUltimate!==false)
      fail('黑潮蚀斧 AI / 仇隙 / 平均分摊缺口或敌方终结技设置缺失');
    return errors;
  }
  if(u.monsterId===401301201&&k?.revision==='4.6-furiae-praetor-fantastic-story-1'){
    if(u.childId!==401301201||k.id!==401301201||u.element!=='Imaginary')fail('天谴先锋 childId 或虚数属性不匹配');
    if(!eq([k.templateId,k.skill01Id,k.skill01Params,k.skill02Id,k.skill02Params,k.skill03Id,k.skill04Id,
      k.skill04Params,k.passiveSkillId,k.passiveParams,k.armorMaxLayers,k.armorDamageResistance,
      k.armorCrackedDelay,k.armorCrackedDamage,k.armorCrackedDamageAfter,k.armorBreakEnergyRatio,k.summonCount],
      [4013012,401301201,[2.8],401301202,[2.8],401301203,401301204,[12,1.2,4,2],401301205,[6,.2,.1,.015,.15,.05],
        6,.1,.2,.05,.015,.15,0]))
      fail('天谴先锋技能 / 被动 / 战甲参数与固定版本 Config 不符');
    const left=u.actions?.skill01,right=u.actions?.skill02,charge=u.actions?.skill03,all=u.actions?.skill04;
    if(!left||left.name!=='从天帷斩向黎明'||left.target!=='sweep'||left.sweepDirection!=='left'||
      left.element!=='Imaginary'||left.hitEnergy!==10||!eq(left.terms,[{scaling:'atk',multiplier:2.8}]))
      fail('从天帷斩向黎明的左侧三连、倍率、属性或回能与来源不符');
    if(!right||right.name!=='从黎明杀往天帷'||right.target!=='sweep'||right.sweepDirection!=='right'||
      right.element!=='Imaginary'||right.hitEnergy!==10||!eq(right.terms,[{scaling:'atk',multiplier:2.8}]))
      fail('从黎明杀往天帷的右侧三连、倍率、属性或回能与来源不符');
    if(!charge||charge.name!=='像威猛暴怒的雄狮'||charge.target!=='self'||charge.terms?.length||charge.hitEnergy!==0)
      fail('像威猛暴怒的雄狮应为无伤害自身蓄力动作');
    if(!all||all.name!=='在滔滔血海中沉溺'||all.target!=='all'||all.element!=='Imaginary'||
      all.hitEnergy!==20||!eq(all.terms,[{scaling:'atk',multiplier:12}])||all.shareDamageAcrossTargets!==true)
      fail('在滔滔血海中沉溺的全体分摊、倍率、属性或回能与来源不符');
    if(!Array.isArray(u.enemyMechanicNotes)||u.enemyMechanicNotes.length!==4||u.policy?.autoUltimate!==false)
      fail('天谴先锋 AI / 战甲 / 计分缺口或敌方终结技设置缺失');
    return errors;
  }
  if([402301001,402301002].includes(u.monsterId)&&k?.revision==='4.6-noontide-gryphon-1'){
    if(![402301001,402301002].includes(u.childId)||k.id!==u.childId||u.element!=='Fire')fail('正阳狮鹫 childId 或火属性不匹配');
    if(!eq([k.templateId,k.skill01Id,k.skill01Params,k.skill02Id,k.skill02Params,k.skill03Id,k.skill04Id,
      k.skill04Params,k.passiveSkillId,k.passiveParams,k.mixedPassiveSkillId,k.mixedParams,k.summonMonsterId,
      k.summonCount,k.summonDelayRatios,k.markMaxLayers,k.markEnergyCost,k.markDamageMultiplier,k.mixedLoseHpRatio],
      [4023010,402301001,[3],402301002,[2.6,.5,.8,1.1,1.5],402301003,402301004,[4,3],402301005,[40,1.5,.25],
        402301006,[1.2,1,.4,1,1.5],4022010,4,[.5,.8,1.1,1.5],2,40,1.5,.25]))
      fail('正阳狮鹫技能 / 被动 / 召唤 / 印记参数与固定版本 Config 不符');
    const single=u.actions?.skill01,sweep=u.actions?.skill02,lock=u.actions?.skill03,blast=u.actions?.skill04;
    if(!single||single.name!=='穿透黑暗'||single.element!=='Fire'||single.target!=='single'||
      single.hitEnergy!==5||!eq(single.terms,[{scaling:'atk',multiplier:3}]))
      fail('穿透黑暗的倍率、属性或回能与来源不符');
    if(!sweep||sweep.name!=='降示黎明'||sweep.target!=='sweep'||sweep.sweepDirection!=='left'||
      sweep.element!=='Fire'||sweep.hitEnergy!==10||!eq(sweep.terms,[{scaling:'atk',multiplier:2.6}]))
      fail('降示黎明的左侧三连、倍率、属性或回能与来源不符');
    if(!lock||lock.name!=='点亮未来'||lock.target!=='self'||lock.terms?.length||lock.hitEnergy!==0)
      fail('点亮未来应为无伤害自身锁定动作');
    if(!blast||blast.name!=='赞美艾格勒'||blast.target!=='blast'||blast.element!=='Fire'||blast.repeatCount!==3||
      blast.hitEnergy!==20||!eq(blast.terms,[{scaling:'atk',multiplier:4},{scaling:'atk',multiplier:3,target:'adjacent'}]))
      fail('赞美艾格勒的三轮主目标 / 相邻倍率、属性或回能与来源不符');
    if(!Array.isArray(u.enemyMechanicNotes)||u.enemyMechanicNotes.length!==5||u.policy?.autoUltimate!==false)
      fail('正阳狮鹫 AI / 印记 / 召唤缺口或敌方终结技设置缺失');
    return errors;
  }
  if(u.monsterId===5023020&&k?.revision==='4.6-god-devourer-partial-1'){
    if(u.childId!==5023020||k.id!==5023020||u.element!=='Fire')fail('吞神子嗣 childId 或火属性不匹配');
    if(!eq([k.skill01Id,k.skill01Params,k.skill02Id,k.skill02Params,k.skill03Id,k.skill03Params,
      k.skill04Id,k.skill04Params,k.passiveSkillId,k.aiSequence],
      [502302001,[2,.8,.2,1],502302002,[.5,1,1000,6,.5],502302003,[.5,3],502302004,[2.4],502302005,[]]))
      fail('吞神子嗣技能 / 被动参数与 4.6 SQLite 或本地 AI 索引不符');
    const single=u.actions?.skill01,all=u.actions?.skill04;
    if(!single||single.name!=='暴食祭'||single.type!=='Normal'||single.element!=='Fire'||single.target!=='single'||
      single.hitEnergy!==10||!eq(single.terms,[{scaling:'atk',multiplier:2}]))
      fail('吞神子嗣暴食祭倍率、目标、火属性或回能与本地数据不符');
    if(!all||all.name!=='群兽的飨宴'||all.type!=='Normal'||all.element!=='Fire'||all.target!=='all'||
      all.hitEnergy!==5||!eq(all.terms,[{scaling:'atk',multiplier:2.4}]))
      fail('吞神子嗣群兽的飨宴倍率、目标、火属性或回能与本地数据不符');
    if(!Array.isArray(u.enemyMechanicNotes)||u.enemyMechanicNotes.length!==4||u.policy?.autoUltimate!==false)
      fail('吞神子嗣 AI / 吞噬 / 反刍缺口或敌方终结技设置缺失');
    return errors;
  }
  if(u.monsterId===202205004&&k?.revision==='4.6-wooden-lupus-partial-1'){
    if(u.childId!==202205004||k.id!==202205004||u.element!=='Thunder')fail('丰饶灵兽•奎木 childId 或雷属性不匹配');
    if(!eq([k.skill01Id,k.skill01Params,k.skill02Id,k.skill02Params,k.passiveSkillId,k.aiSequence],
      [202205001,[2,1.5,3],202205002,[.8],202205003,[202205001]]))
      fail('丰饶灵兽•奎木技能参数 / 一步 AI 序列与本地 4.6 索引不符');
    const a=u.actions?.skill01;
    if(!a||a.name!=='狼餐'||a.type!=='Normal'||a.element!=='Thunder'||a.target!=='single'||a.hitEnergy!==10||
      !eq(a.terms,[{scaling:'atk',multiplier:2}]))
      fail('丰饶灵兽•奎木狼餐倍率、目标、属性或回能与本地数据不符');
    if(u.actions?.skill02?.name!=='啸聚'||!Array.isArray(u.enemyMechanicNotes)||u.enemyMechanicNotes.length!==2||
      u.policy?.autoUltimate!==false)
      fail('丰饶灵兽•奎木触电 / 狈影召唤缺口或敌方终结技设置缺失');
    return errors;
  }
  if(u.monsterId===4014030&&k?.revision==='4.6-pollux-partial-1'){
    if(u.childId!==4014030||k.id!==4014030||u.element!=='Quantum')fail('玻吕刻斯 childId 或量子属性不匹配');
    if(!eq([k.skill01Id,k.skill01Params,k.skill02Id,k.skill02Params,k.skill03Id,k.skill03Params,
      k.skill04Id,k.skill04Params,k.skill05Id,k.skill05Params,k.skill06Id,k.skill06Params,
      k.passive01Id,k.passive01Params,k.passive02Id,k.passive02Params],
      [401403001,[3,.15,.5,1],401403002,[8,.1,.5,2],401403003,[.3],401403004,[1,3],
        401403005,[.05,1,1.2,11,.5,.9],401403006,[.3,.15,.5,1,2,1],
        401403007,[1,.6,.45,1,1,5],401403008,[.65,.5,1,.12,.9]]))
      fail('玻吕刻斯技能 ID / 参数与本地 AI 索引不符');
    const a=u.actions?.skill01,b=u.actions?.skill02;
    if(!a||a.name!=='沦殁者攫手挽留'||a.element!=='Quantum'||a.target!=='single'||
      !eq(a.terms,[{scaling:'atk',multiplier:3}])||a.hitEnergy!==5)
      fail('玻吕刻斯 Skill01 名称、倍率、目标或受击回能与本地来源不符');
    if(!b||b.name!=='长眠者厚土安葬'||b.element!=='Quantum'||b.target!=='all'||
      !eq(b.terms,[{scaling:'atk',multiplier:8}])||b.shareDamageAcrossTargets!==true||b.hitEnergy!==5)
      fail('玻吕刻斯 Skill02 的倍率、群攻或平均分摊实现与本地来源不符');
    if(!Array.isArray(u.enemyMechanicNotes)||u.enemyMechanicNotes.length!==4||u.policy?.autoUltimate!==false)
      fail('玻吕刻斯 AI / 衰亡伤害 / 长眠缺口或敌人终结技设置缺失');
    return errors;
  }
  if(u.monsterId===5023010&&k?.revision==='4.6-joy-ascendant-partial-1'){
    if(u.childId!==5023010||k.id!==5023010||u.element!=='Wind')fail('乐变化天人 childId 或风属性不匹配');
    if(!eq([k.skill01Id,k.skill01Params,k.skill02Id,k.skill02Params,k.skill03Id,k.skill04Id,k.skill04Params,k.deathrattleId],
      [502301001,[3.5],502301002,[3,.5,.35,.7],502301003,502301004,[5,.3,1],502301005]))
      fail('乐变化天人技能 ID / 参数与 4.6 SQLite 不符');
    const expected={skill01:['狂喜吐息','single',3.5,10],skill02:['欢乐笑语','single',.5,5],skill04:['极乐螺旋','all',5,10]};
    for(const [key,[name,target,multiplier,hitEnergy]] of Object.entries(expected)){
      const a=u.actions?.[key],terms=[{scaling:'atk',multiplier}];
      if(!a||a.name!==name||a.type!=='Normal'||a.element!=='Wind'||a.target!==target||a.hitEnergy!==hitEnergy||!eq(a.terms,terms))
        fail(key+' 名称、倍率、目标、属性或回能与 4.6 来源不符');
    }
    if(u.actions?.skill02?.repeatCount!==3||u.actions.skill02.randomHitTargets!==true||u.actions.skill02.hitEnergyPerHit!==true)
      fail('欢乐笑语必须按三段各自重选随机目标结算');
    if(u.actions?.skill03?.name!=='笑蕾'||!Array.isArray(u.enemyMechanicNotes)||u.enemyMechanicNotes.length!==3||u.policy?.autoUltimate!==false)
      fail('笑蕾动作、未实现机制缺口或敌方终结技设置缺失');
    return errors;
  }
  if(u.monsterId===300302007&&k?.revision==='4.6-sweet-gorilla-partial-1'){
    if(u.childId!==300302007||k.id!==300302007||u.element!=='Ice')fail('甜猿泰山 childId 或冰属性不匹配');
    if(!eq([k.skill01Id,k.skill01Params,k.skill02Id,k.skill02Params,k.skill03Id,k.skill03Params,k.skill04Id,
      k.summonCount,k.summonDelayRatios,k.backlashMaxHpRatio,k.backlashDefShred,k.backlashDuration],
      [300302001,[3.8,.08,1.5,.2,2],300302002,[3.6,.08,1.5,.2,2],300302003,[.25,.75],300302004,2,[.25,.75],.08,.2,2]))
      fail('甜猿泰山技能 ID / 参数与 4.6 SQLite 不符');
    if(u.actions?.skill02?.repeatCount!==4||u.actions.skill02.randomHitTargets!==true||
      !eq(u.actions.skill01?.terms,[{scaling:'atk',multiplier:3.8}])||!k.summonBlueprint||k.summonBlueprint.childId!==3002030)
      fail('甜猿泰山攻击次数、倍率或气泡锂犬模板不符');
    if(!Array.isArray(u.enemyMechanicNotes)||u.enemyMechanicNotes.length!==3||u.policy?.autoUltimate!==false)
      fail('甜猿泰山机制缺口说明或敌方终结技设置缺失');
    return errors;
  }
  if(u.monsterId===5012120&&k?.revision==='4.6-alloy-nanny-partial-1'){
    if(u.childId!==5012120||k.id!==5012120||u.element!=='Quantum')fail('合金保姆 childId 或量子属性不匹配');
    if(!eq([k.skill01Id,k.skill01Params,k.skill02Id,k.skill02Params,k.passiveSkillId,k.passiveParams,
      k.skill01HitShares,k.skill02HitShares,k.skill02DefShred,k.skill02Duration,k.deathLaughter],
      [501212001,[3],501212002,[2,.5,2],501212003,[5],[.2,.2,.2,.2,.2],[.2,.1,.1,.1,.5],.5,2,5]))
      fail('合金保姆技能 ID / 参数与 4.6 SQLite 不符');
    if(!eq(u.actions?.skill01?.hitShares,k.skill01HitShares)||!eq(u.actions?.skill02?.hitShares,k.skill02HitShares)||
      !Array.isArray(u.enemyMechanicNotes)||u.enemyMechanicNotes.length!==2||u.policy?.autoUltimate!==false)
      fail('合金保姆五段攻击、死后笑点或机制缺口说明缺失');
    return errors;
  }
  if(u.monsterId===5014023&&k?.revision==='4.6-king-pom-pom-pf-partial-1'){
    if(u.childId!==5014023||k.id!==5014023||u.element!=='Quantum')fail('PF 帕姆王 childId 或量子属性不匹配');
    if(!eq([k.skill01Id,k.skill01Params,k.skill02Id,k.skill02Params,k.skill03Id,k.skill03Params,
      k.skill04Id,k.skill04Params,k.skill05Id,k.skill06Id,k.skill06Params,k.passive01Id,k.passive01Params],
      [501402301,[3,0],501402302,[3,3],501402303,[.3,2,.3,.1,2,.3],501402304,[1.5,1,.01,5,2,1],
        501402305,501402306,[5,8],501402308,[20,.55,0,10,.6,.8]]))fail('PF 帕姆王技能 ID / 参数与 4.6 SQLite 不符');
    for(const [key,shares,total] of [['skill02',[.18,.18,.18,.18,.28],3],['skill04',[.2,.2,.2,.4],1.5],
      ['skill06',[...Array(10).fill(.05),.5],5]]){
      const action=u.actions?.[key];
      if(!action||!eq(action.terms,[{scaling:'atk',multiplier:total}])||!eq(action.hitShares,shares)||action.repeatCount!=null)
        fail(key+' 的总倍率与 Ability 段占比不匹配');
    }
    if(!Array.isArray(u.enemyMechanicNotes)||u.enemyMechanicNotes.length!==3||u.policy?.autoUltimate!==false)
      fail('PF 帕姆王机制缺口说明或敌方终结技设置缺失');
    return errors;
  }
  if(u.monsterId===5014020&&k?.revision==='4.6-king-pom-pom-partial-1'){
    if(u.childId!==5014020||k.id!==5014020||u.element!=='Quantum')fail('帕姆王 childId 或量子属性不匹配');
    if(!eq([k.skill01Id,k.skill01Params,k.skill02Id,k.skill02Params,k.skill03Id,k.skill03Params,k.skill04Id,k.skill04Params,
      k.skill05Id,k.skill06Id,k.skill06Params,k.skill08Id],
      [501402001,[3,0],501402002,[3,3],501402003,[.3,2,.3,.1,2,.45],501402004,[1.5,1,.02,5,2,1],501402005,501402006,[5,8],501402008]))
      fail('帕姆王技能 ID / 参数与 4.6 SQLite 不符');
    const expected={skill01:['灵魂修正剪','single',1,3,10],skill02:['无死角洗涤','all',5,3,10],
      skill04:['强效肥皂泡','all',4,1.5,10],skill06:['饱和式大扫除！','all',11,5,15]};
    for(const [key,[name,target,repeats,multiplier,hitEnergy]] of Object.entries(expected)){
      const a=u.actions?.[key];if(!a||a.name!==name||a.type!=='Normal'||a.element!=='Quantum'||a.target!==target||
        (a.hitShares?.length??1)!==repeats||a.repeatCount!=null||a.hitEnergy!==hitEnergy||!eq(a.terms,[{scaling:'atk',multiplier}]))
        fail(key+' 的原名、逐段倍率、次数、目标、属性或回能不符');
    }
    if(!eq(u.actions?.skill02?.hitShares,[.18,.18,.18,.18,.28])||
      !eq(u.actions?.skill04?.hitShares,[.2,.2,.2,.4])||
      !eq(u.actions?.skill06?.hitShares,[...Array(10).fill(.05),.5]))
      fail('帕姆王的五段 / 四段 / 十一段伤害占比必须分别合计为 100%');
    if(u.actions?.skill03?.name!=='高温消毒模式'||u.actions?.skill05?.name!=='值日准备中…'||
      !Array.isArray(u.enemyMechanicNotes)||u.enemyMechanicNotes.length!==4||u.policy?.autoUltimate!==false)
      fail('帕姆王状态技能、阶段机制缺口或敌方终结技设置缺失');
    return errors;
  }
  if(u.monsterId===402302001&&k?.revision==='4.6-moonlit-pegasus-partial-1'){
    if(u.childId!==402302001||k.id!==402302001||u.element!=='Quantum')fail('月夜天马 childId 或量子属性不匹配');
    if(!eq([k.skill01Id,k.skill01Params,k.skill02Id,k.skill02Params,k.skill03Id,k.skill04Id,k.skill04Params,
      k.passive01Id,k.passive01Params,k.passive02Id,k.passive02Params,k.aiFlagCount],
      [402302001,[3],402302002,[2.6],402302003,402302004,[4.5],402302005,[40,1.5,.25],402302006,[1.2,1,.4,1,1.5],5]))
      fail('月夜天马技能 ID / 参数或 AI 循环长度与 4.6 数据不符');
    const expected={skill01:['创造月光','single','Quantum',3,5],skill02:['三倍下弦月','sweep','Quantum',2.6,10],
      skill04:['六倍满月','single','Quantum',4.5,20]};
    for(const [key,[name,target,element,multiplier,hitEnergy]] of Object.entries(expected)){
      const a=u.actions?.[key];if(!a||a.name!==name||a.type!=='Normal'||a.element!==element||a.target!==target||
        a.hitEnergy!==hitEnergy||!eq(a.terms,[{scaling:'atk',multiplier}]))fail(key+' 名称、目标、倍率、属性或回能与 4.6 数据不符');
    }
    if(u.actions?.skill02?.sweepDirection!=='right'||u.actions?.skill03?.name!=='两倍上弦月'||
      !Array.isArray(u.enemyMechanicNotes)||u.enemyMechanicNotes.length!==3||u.policy?.autoUltimate!==false)
      fail('右侧横扫、锁定动作、未实现机制说明或敌人终结技设置缺失');
    return errors;
  }
  if(u.monsterId===8033020&&k?.revision==='4.6-lighthouse-partial-1'){
    if(u.childId!==8033020||k.id!==8033020||u.element!=='Physical')fail('「灯塔」childId 或物理属性不匹配');
    if(!eq([k.skill01Id,k.skill01Params,k.skill02Id,k.skill02Params,k.skill03Id,k.skill03Params,k.skill04Id,k.skill04Params,
      k.passive01Id,k.passive01Params,k.summonCountBySource],
      [803302001,[2,1],803302002,[0,.2,.6,1],803302003,[12,1],803302004,[3.6,.2,.5],803302005,[.05,0,1,2,.5],4]))
      fail('「灯塔」技能 ID / 参数与固定版本来源不符');
    const one=u.actions?.skill01,ultimate=u.actions?.skill04;
    if(!one||one.name!=='源 Skill01'||one.type!=='Normal'||one.element!=='Physical'||one.target!=='blast'||
      !eq(one.terms,[{scaling:'atk',multiplier:2},{scaling:'atk',multiplier:1,target:'adjacent'}]))
      fail('「灯塔」Skill01 主 / 邻接倍率或扩散目标不符');
    if(!ultimate||ultimate.name!=='源 Skill04'||ultimate.type!=='Normal'||ultimate.element!=='Physical'||
      ultimate.target!=='all'||ultimate.repeatCount!==5||!eq(ultimate.terms,[{scaling:'atk',multiplier:3.6}]))
      fail('「灯塔」Skill04 必须保留五段全体攻击');
    if(!Array.isArray(u.enemyMechanicNotes)||u.enemyMechanicNotes.length!==4||u.policy?.autoUltimate!==false)
      fail('「灯塔」召唤 / 誓约 / 条件公式缺口或敌人终结技设置缺失');
    return errors;
  }
  if(u.monsterId===503401002&&k?.revision==='4.6-yabuli-partial-1'){
    if(u.childId!==503401002||k.id!==503401002||u.element!=='Quantum')fail('亚婆离 childId 或量子属性不匹配');
    if(!eq([k.skill01Id,k.skill01Params,k.skill02Id,k.skill02Params,k.skill03Id,k.skill03Params,k.skill04Id,k.skill04Params,
      k.passive01Id,k.passive01Params,k.passive02Id,k.passive02Params,k.passive03Id,k.passive03Params,k.passive04Id,k.passive04Params],
      [503401001,[5],503401002,[1.8],503401003,[.1,2,.04,5],503401004,[5,.1],
        503401005,[.08,.7,.65,.75,.35,2,.3,.1,.05,66],503401006,[.7,.65,.75,.35,1,.5,.3,.05,.025,40],
        503401007,[3,2,3,.02],503401008,[.3,.2,.98,1]]))fail('亚婆离技能 / 被动参数与本地 AI 索引不符');
    const expected={skill01:['猎食标记','single','Quantum',5],skill02:['饥饿的鸣响','all','Quantum',1.8],
      skill04:['万物于我之中','all','Quantum',5]};
    for(const [key,[name,target,element,multiplier]] of Object.entries(expected)){
      const a=u.actions?.[key];if(!a||a.name!==name||a.type!=='Normal'||a.element!==element||a.target!==target||
        !eq(a.terms,[{scaling:'atk',multiplier}]))fail(key+' 名称、目标、倍率或属性与本地索引不符');
    }
    if(!Array.isArray(u.enemyMechanicNotes)||u.enemyMechanicNotes.length!==4||u.policy?.autoUltimate!==false)
      fail('亚婆离阶段 / 幻身 / 屏障缺口说明或敌人终结技设置缺失');
    return errors;
  }
  if([5013040,5013050,5013060,5013070].includes(u.monsterId)&&k?.revision==='4.6-dawn-corps-partial-1'){
    const element={5013040:'Quantum',5013050:'Fire',5013060:'Imaginary',5013070:'Physical'}[u.monsterId],base=u.monsterId*100;
    if((u.childId!==u.monsterId&&Math.floor(u.childId/100)!==u.monsterId)||k.id!==u.monsterId||k.element!==element)
      fail('苍翼 / 赤焰 / 曙光 / 灰烬子模板或攻击属性不匹配');
    if(!eq([k.skill01Id,k.skill01Params,k.skill02Id,k.skill02Params,k.skill03Id,k.skill03Params,k.skill04Id,k.skill04Params,
      k.skill05Id,k.skill05Params,k.fieldAttackThreshold,k.fieldDamageTakenIncrease,k.fieldElementResReduction,k.fieldDebuffDuration],
      [base+1,[4],base+2,[6,3,.15,60,1],base+3,[7,1],base+4,[8],base+5,[.3,.4,2],7,.3,.4,2]))
      fail('破晓战队技能 ID、倍率或力场 / 失意参数与本地库不符');
    const expected={skill01:['破晓战刃','single',[{scaling:'atk',multiplier:4}],10],
      skill02:['破晓飞轮','blast',[{scaling:'atk',multiplier:6},{scaling:'atk',multiplier:3,target:'adjacent'}],5],
      skill04:['破晓剑影舞','single',[{scaling:'atk',multiplier:8}],10]};
    for(const [key,[name,target,terms,hitEnergy]] of Object.entries(expected)){
      const a=u.actions?.[key];if(!a||a.name!==name||a.type!=='Normal'||a.element!==element||a.target!==target||
        !eq(a.terms,terms)||a.hitEnergy!==hitEnergy)fail(key+' 名称、倍率、目标、属性或受击回能不符');
    }
    if(u.actions?.skill03?.name!=='破晓意志'||u.actions?.skill05?.name!=='破晓退散'||
      k.controlImmuneTag!=='dawnCorpsForceField'||k.toughnessImmuneTag!=='dawnCorpsForceField'||
      !Array.isArray(u.enemyMechanicNotes)||u.enemyMechanicNotes.length!==3)
      fail('力场免控 / 锁韧、退散动作或 AI 缺口说明缺失');
    if(u.policy?.autoUltimate!==false)fail('敌人不应自动施放我方终结技');
    return errors;
  }
  if(u.monsterId===4053020&&k?.id===4053020&&k?.revision==='4.6-cyclonic-swarm-mother-partial-1'){
    if(u.childId!==4053020)fail('场景 childId 不属于飓风大母');
    if(!eq([k.skill01Id,k.skill01Params,k.skill02Id,k.skill02Params,k.skill03Id,k.skill03Params,k.skill04Id,k.skill04Params,
      k.skill05Id,k.passiveSkillId,k.passiveParams,k.broodlingMonsterId,k.nurseryDamageReduction],
      [405302001,[3.5],405302002,[3],405302003,[.25,.5,.1,4,.05,.3,.3],405302004,[4.2],405302005,405302006,[4,2],4052020,.25]))
      fail('技能 ID、倍率或被动参数与 4.6 本地库不符');
    const expected={skill01:['唾弃深渊的黑','single','Quantum',3.5],skill02:['啼哭落在岸上','blast','Quantum',3],
      skill04:['雨自初生便落坠','all','Quantum',4.2]};
    for(const [key,[name,target,element,multiplier]] of Object.entries(expected)){
      const a=u.actions?.[key];if(!a||a.name!==name||a.type!=='Normal'||a.target!==target||a.element!==element||
        !eq(a.terms,[{scaling:'atk',multiplier}])||a.hitEnergy!==10)fail(key+' 的名称、目标、倍率、属性或受击回能不符');
    }
    if(u.actions?.skill03?.name!=='风雨雷的妊娠')fail('风雨雷的妊娠动作缺失');
    if(u.actions?.skill05?.name!=='洪潮浪的分娩'||u.actions?.skill05?.terms?.length!==0||
      !Array.isArray(u.enemyMechanicNotes)||u.enemyMechanicNotes.length!==3)
      fail('洪潮浪的分娩动作或未实现机制说明缺失');
    if(u.policy?.autoUltimate!==false)fail('敌人不应自动施放我方终结技');
    return errors;
  }
  if(u.monsterId===3003040&&k?.id===3003040&&k?.revision==='4.6-caco-harmony-1'){
    if(u.childId!==3003040)fail('场景 childId 不属于同音共律的来日');
    if(!eq([k.skill01Id,k.skill01Params,k.skill02Id,k.skill02Params,k.skill03Id,k.skill03Params,k.skill04Id,k.skill05Id,
      k.skill05Params,k.dreamModifierId,k.dreamHealRatio,k.dreamVulnerability,k.dreamDuration,k.aiFlagCount],
      [300304001,[3],300304002,[1.2,2,.5,.35],300304003,[4.2],300304004,300304005,[.5,.5,2],23025011,.35,.5,2,6]))
      fail('技能 ID、倍率、异梦参数或 AI 循环长度与本地 4.6 数据不符');
    const expected={skill01:['光华射','single','Imaginary',[{scaling:'atk',multiplier:3}],5],
      skill02:['万暗中','single',null,[],10],skill03:['救赎恩典','single','Imaginary',[{scaling:'atk',multiplier:4.2}],15],
      skill04:['圣善夜','self',null,[],10],skill05:['静享天赐安眠','all',null,[],15]};
    for(const [key,[name,target,element,terms,hitEnergy]] of Object.entries(expected)){
      const action=u.actions?.[key];
      if(!action||action.name!==name||action.type!=='Normal'||action.element!==element||action.target!==target||
        action.hitEnergy!==hitEnergy||!eq(action.terms,terms))fail(key+' 名称、倍率、目标、属性或受击回能与 SQLite 不符');
    }
    if(u.actions?.skill01?.hitEnergyPerHit!==true||u.actions?.skill03?.hitEnergyPerHit!==true)
      fail('光华射 / 救赎恩典的受击回能倍率未逐次命中结算');
    const dream02=u.actions?.skill02?.effects?.[0],dream05=u.actions?.skill05?.effects?.[0],charge=u.actions?.skill04?.effects?.[0];
    const dreamShape=e=>e&&[e.name,e.key,e.value,e.duration,e.chance,e.control,e.healAtTurnStartRatio,e.removeOnAttacked,e.tickAt,e.tag];
    if(!eq(dreamShape(dream02),['异梦','vuln',.5,2,1.2,'sleep',.35,true,'end',cacoHarmonyDreamTag])||
      !eq(dreamShape(dream05),['异梦','vuln',.5,2,.5,'sleep',.35,true,'end',cacoHarmonyDreamTag]))
      fail('单体 / 群体异梦的控制、易伤、回血、概率或持续时间不符');
    if(!charge||charge.name!=='蓄力'||charge.key!=='dmgBoost'||charge.value!==0||charge.target!=='self'||charge.duration!==2||charge.removeOnBreak!==true||
      charge.tag!=='cacoHarmonyCharge')fail('圣善夜蓄力标记或弱点击破清除条件不符');
    if(u.policy?.autoUltimate!==false||!Array.isArray(u.enemyMechanicNotes)||u.enemyMechanicNotes.length!==2)
      fail('自动终结技设置或 AI 选靶信息缺口说明缺失');
    if(!eq(k.sourceHashes,{ai:'ecfac291aa9775495b32c0eda74dafc3b284c2a1',character:'13b183110614c8c431bfa6b6a6bed78b055ef64d',
      ability:'cdc854401fdfd00c1ffb784778503bead75446ae'}))fail('原始 AI / Character / Ability 文件哈希与固定版本不符');
    return errors;
  }
  if(u.monsterId===4033010&&k?.id===403301002&&k?.revision==='4.6-black-tide-partial-1'){
    if(u.childId!==403301002)fail('场景 childId 不属于黑潮蚀魔');
    if(!eq([k.skill01Id,k.skill01Params,k.skill02Id,k.skill02Params,k.skill02ProjectileCount,k.skill05Id,k.skill05Params,
      k.passiveSkillId,k.passiveParams,k.skill06Id,k.skill06Params,k.chargeCompleteThreshold],
      [403301001,[3],403301002,[2.4,4],5,403301005,[4.5,.2],403301006,[3,.5,.2,0,.5],403301007,[.3,1],3]))
      fail('技能 ID、倍率 / 蓄力参数与 SQLite 4.6 数据不符');
    const one=u.actions?.skill01,torrent=u.actions?.skill02,aoe=u.actions?.skill05,failed=u.actions?.skill06;
    if(!one||one.name!=='凋敝岩流'||one.type!=='Normal'||one.element!=='Physical'||one.target!=='single'||one.hitEnergy!==10||
      one.hitEnergyPerHit!==true||!eq(one.terms,[{scaling:'atk',multiplier:3}]))fail('凋敝岩流倍率、属性、目标或受击回能不符');
    if(!torrent||torrent.name!=='腐败骤陨'||torrent.type!=='Normal'||torrent.element!=='Physical'||torrent.target!=='single'||
      torrent.hitEnergy!==10||torrent.hitEnergyPerHit!==true||torrent.randomUniqueHitTargets!==true||
      !eq(torrent.hitShares,Array(5).fill(.2))||!eq(torrent.hitEnergyShares,Array(5).fill(1))||!eq(torrent.terms,[{scaling:'atk',multiplier:12}]))
      fail('腐败骤陨必须是五次独立随机单体命中，每次 2.4 倍攻击力');
    if(!aoe||aoe.name!=='浑流奔涌'||aoe.type!=='Normal'||aoe.element!=='Physical'||aoe.target!=='all'||aoe.hitEnergy!==15||
      !eq(aoe.terms,[{scaling:'atk',multiplier:4.5}]))fail('浑流奔涌的已知伤害参数与 SQLite 不符');
    const failure=failed?.effects?.map(e=>[e.key,e.value,e.duration,e.target]);
    if(failed?.target!=='all'||!eq(failure,[['defPct',-.3,1,'self']]))fail('吸收失败的目标类型或自身防御下降与技能参数不符');
    if(u.policy?.autoUltimate!==false||!u.unsupported?.some(x=>x.includes('【侵蚀】'))||
      !u.unsupported?.some(x=>x.includes('蓄力阈值'))||!u.unsupported?.some(x=>x.includes('削韧数值')))
      fail('侵蚀、蓄力或削韧缺口未继续显式保留');
    if(!eq(k.sourceHashes,{ai:'fdb626dc295e521e1ce53f194fc70ddd908dcc7b',character:'26dcb73144d453a52338e4cae6fe776ef88329fc',
      ability:'cef95ce0ed6f281b118d64d5406738b915e1c19f'}))fail('原始 AI / Character / Ability 文件哈希与固定版本不符');
    return errors;
  }
  if(u.monsterId===1002020&&k?.id===1002020&&k?.revision==='4.6-roaming-bandit-partial-1'){
    if(u.childId!==1002020)fail('场景 childId 不属于流浪者');
    if(!eq([k.skill01Id,k.skill01Params,k.skill02Id,k.skill02Params,k.skill02InitialCooldown,k.skill02Cooldown,k.supportModifier],
      [100202001,[2.5],100202002,[.3,0,2],1,2,'Monster_W1_Soldier01_03_Buff']))
      fail('铲击 / 鼓舞参数、冷却或 modifier 名称与 4.6 源数据不符');
    const attack=u.actions?.skill,support=u.actions?.skill02;
    if(!attack||attack.name!=='铲击'||attack.type!=='Normal'||attack.element!=='Physical'||attack.target!=='single'||
      attack.hitEnergy!==10||attack.hitEnergyPerHit!==true||!eq(attack.terms,[{scaling:'atk',multiplier:2.5}]))
      fail('铲击倍率、属性、目标或受击回能与本地 AI 参数不符');
    const effectShape=(support?.effects??[]).map(e=>[e.type,e.key??null,e.value??null,e.duration??null,e.tag??null,e.modifierName??null]);
    if(!support||support.name!=='鼓舞'||support.type!=='Normal'||support.target!=='ally'||support.terms?.length||
      !eq(effectShape,[['buff','atkPct',.3,2,'roamingBanditInspiration','Monster_W1_Soldier01_03_Buff'],['advance',null,1,null,null,null]]))
      fail('鼓舞必须提供两回合 30% 攻击力并把目标行动条推进至 0');
    if(u.policy?.autoUltimate!==false||!u.unsupported?.some(x=>x.includes('同分目标')))
      fail('AI 目标并列次序缺口或自动终结技设置未显式保留');
    if(!eq(k.sourceHashes,{ai:'4dcffeec011ea31b9e412227bc4a1d39c8b7175a',
      character:'741e748b3b136eb96fdf0a145810cf5a3a099861',ability:'fa94b970e1583d581f3b9779dd4b6d02ea93de36'}))
      fail('原始 AI / Character / Ability 配置哈希与固定版本不符');
    return errors;
  }
  if(u.monsterId===2022010&&k?.id===2022010&&k?.revision==='4.6-mara-struck-soldier-partial-1'){
    if(u.childId!==2022010)fail('场景 childId 不属于魔阴身士卒');
    if(!eq([k.skill01Id,k.skill01Params,k.skill01HitShares,k.passiveSkillId,k.passiveParams,k.reviveHpRatio,k.reviveSpeedRatio,
      k.windShearChance,k.windShearDuration,k.windShearLayerAdd,k.windShearDamagePerLayer,k.windShearMaxLayers,k.aiSequence,k.sourceRef],
      [202201001,[2,2,3,.5,1],[.25,.25,.5],202201002,[.5,0,.5],.5,.5,1,3,2,.5,5,[202201001],
        '312b4597691e0a29cf9828a15b592757dba86949']))
      fail('梢杀三段倍率、风化 / 复起参数或 AI 轮转与固定版本源数据不符');
    const attack=u.actions?.skill;
    if(!attack||attack.name!=='梢杀'||attack.type!=='Normal'||attack.element!=='Wind'||attack.target!=='single'||attack.hitEnergy!==15||
      attack.hitEnergyPerHit!==true||attack.toughness!==0||!eq(attack.hitShares,[.25,.25,.5])||
      !eq(attack.terms,[{scaling:'atk',multiplier:2}]))fail('梢杀的属性、三段比例或总倍率与固定版本 Ability 不符');
    if(!eq(u.policy?.rotation,['skill'])||u.policy?.autoUltimate!==false||
      !u.unsupported?.some(x=>x.includes('削韧数值未在本地数据库')))
      fail('梢杀韧性数值缺口或敌方循环未显式保留');
    if(!eq(k.sourceHashes,{ai:'90752b8b9cb4e6b31f0cdfa1cedd9cd74bdfbaaf',
      character:'e55e8e09bd9f47dadb4dd3afce1ed7ddb21decea',ability:'466de69542423ceee1d0772459dc236a5f0fd794'}))
      fail('原始 AI / Character / Ability 配置哈希与固定版本不符');
    return errors;
  }
  if(u.monsterId===3002030&&k?.id===3002030&&k?.revision==='4.6-bubble-hound-1'){
    if(u.childId!==3002030)fail('场景 childId 不属于惊梦剧团的气泡锂犬');
    if(!eq([k.skill01Id,k.skill01Params,k.skill01BaseMultiplier,k.skill01LayerMultiplier,k.skill02Id,k.skill02Params,
      k.passiveSkillId,k.passiveParams,k.tipsinessMax,k.aiSequence],
      [300203001,[2.5,.3],2.5,.3,300203002,[2,.3,2,.025,100,.01],300203003,[4],4,[300203001]]))
      fail('邀饮动态倍率、苏乐达陶醉上限或死亡反击参数与 4.6 源数据不符');
    const strike=u.actions?.skill,death=u.actions?.skill02;
    if(!strike||strike.name!=='邀饮'||strike.type!=='Normal'||strike.element!=='Physical'||strike.target!=='single'||
      strike.hitEnergy!==10||strike.hitEnergyPerHit!==true||!eq(strike.terms,[{scaling:'atk',multiplier:2.8}]))
      fail('邀饮的初始层倍率、属性、目标或受击回能不符');
    if(!death||death.name!=='泼洒甜蜜'||death.type!=='Normal'||death.element!=='Physical'||death.target!=='blast'||
      death.hitEnergy!==0||death.adjacentToughness!==30||!eq(death.terms,[{scaling:'hp',multiplier:.01,target:'adjacent'}]))
      fail('泼洒甜蜜必须只对相邻目标造成自身最大生命 1% 的物理伤害并削韧 30');
    if(!eq([k.skill02SpeedRatio,k.skill02SpeedDuration,k.skill02BleedRatio,k.skill02BleedDuration,
      k.skill02BleedMaxHpCapRatio,k.skill02MaxHpDamageRatio], [.3,2,.025,2,1,.01]))
      fail('死亡插入攻击的加速、裂伤、目标最大生命上限或伤害比例不符');
    if(!eq(u.policy?.rotation,['skill'])||u.policy?.autoUltimate!==false||u.unsupported?.length)
      fail('普通 AI 循环或已登记机制完整度标记错误');
    if(!eq(k.sourceHashes,{ability:'052d5b4a9ed2d8575447e0ae446aa5050bfdd980',character:'481463ed50151bfef96d928712077855d34d20e6'}))
      fail('原始 Ability / Character 配置哈希与 4.6 源文件不符');
    return errors;
  }
  if(u.monsterId===8033010&&k?.id===8033010&&k?.revision==='4.6-team-leader-partial-2'){
    if(u.childId!==803301011)fail('场景 childId 不属于资深员工·组长');
    if(!eq([k.aiSequence,k.oneMorePerTurn,k.skill01Id,k.skill01Params,k.skill06Id,k.skill06Params,
      k.skill02Id,k.skill03Id,k.skill03Params,k.skill04Id,k.skill05Id,k.skill05Params,k.passiveSkillId,
      k.passiveParams,k.performanceMax,k.performanceDamagePerPoint,k.breakResetFlags],
      [[803301001,803301002,803301005,803301003,803301004,803301002,803301005,803301002],true,
        803301001,[3.2],803301002,[3.8],803301003,803301004,[3.6],803301005,803301006,[1,.5],803301007,[.5],3,.5,[9,10]]))
      fail('八段 AI 循环、OneMorePerTurn、技能倍率或绩效点参数与 4.6 源数据不符');
    const one=u.actions?.skill01,six=u.actions?.skill06,aoe=u.actions?.skill03;
    if(!one||one.type!=='Normal'||one.element!=='Physical'||one.target!=='single'||one.hitEnergy!==10||
      one.hitEnergyPerHit!==true||!eq(one.terms,[{scaling:'atk',multiplier:3.2}]))
      fail('Skill01「处分」的倍率、属性、目标或受击回能不符');
    if(!six||six.type!=='Normal'||six.element!=='Physical'||six.target!=='single'||six.hitEnergy!==15||
      six.hitEnergyPerHit!==true||!eq(six.terms,[{scaling:'atk',multiplier:3.8}])||!eq(six.hitShares,[.3,.3,.4]))
      fail('Skill06「降本增效」的三段倍率、属性、目标或受击回能不符');
    if(!aoe||aoe.type!=='Normal'||aoe.element!=='Physical'||aoe.target!=='all'||aoe.hitEnergy!==20||
      aoe.hitEnergyPerHit!==true||!eq(aoe.terms,[{scaling:'atk',multiplier:3.6}])||!eq(aoe.hitShares,Array(8).fill(.125)))
      fail('Skill03「企业文化冲击」的八段群伤比例、属性或受击回能不符');
    if(!u.actions?.skill02||u.actions.skill02.target!=='self'||u.actions.skill02.terms?.length||
      !u.actions?.skill04||u.actions.skill04.target!=='self'||u.actions.skill04.terms?.length)
      fail('蓄力与 720 度考核不得被错误建模为伤害攻击');
    if(u.policy?.autoUltimate!==false||!u.unsupported?.some(x=>x.includes('公司货币队友转移')))
      fail('自动终结技设置或尚未还原的团队公司货币转移缺口未明确登记');
    if(!eq(k.sourceHashes,{ai:'eb69fb71aaa7f5704f1788db47752edbd9b5aff7',character:'4e42fa6e9ad6b7e0989631a862bd9de2acf11b1e',
      ability:'d96a9b7cdc6ed9b278b753619625d6a747e1965e',sharedModifier:'e043cdc0650741eb27049b0c1a0710bccb77618f'}))
      fail('原始 AI / Character / Ability / OneMorePerTurn 公共 modifier 配置哈希与核对版本不符');
    return errors;
  }
  if(u.monsterId===1012010&&k?.id===1012010&&k?.revision==='4.6-automaton-hound-1'){
    if(u.childId!==1012010)fail('场景 childId 不属于自动机兵·战犬');
    if(!eq([k.skillId,k.skill01Params,k.skill01Multiplier,k.healSkillId,k.skill05Params,k.healRatio,k.healFormula,k.aiSequence],
      [101201001,[2.5],2.5,101201002,[.25],.25,'HealByHealerMaxHP',[101201001,101201002]]))
      fail('攻击倍率、自愈生命基数或 AI 顺序与本地源数据不符');
    const attack=u.actions?.skill,heal=u.actions?.skill05;
    if(!attack||attack.type!=='Normal'||attack.element!=='Physical'||attack.target!=='single'||attack.hitEnergy!==15||
      attack.hitEnergyPerHit!==true||!eq(attack.terms,[{scaling:'atk',multiplier:2.5}]))
      fail('垂直打击倍率、属性、目标或受击回能与本地 AI 不符');
    if(!heal||heal.target!=='allies'||heal.terms?.length||!eq(heal.effects,[{type:'heal',target:'allies',scaling:'hp',multiplier:.25}]))
      fail('自愈模块必须按施术者最大生命值的 25% 治疗敌方全队');
    if(!eq(u.policy?.rotation,['skill','skill05'])||u.policy?.autoUltimate!==false||u.unsupported?.length)
      fail('自动终结技设置、技能循环或共通被动处理错误');
    if(!eq(k.sourceHashes,{ability:'b258f0bfef781481e5bd323aa96343436e6807bd',character:'eb5bf3e8de957fdb93db9166873436e52aac0991'}))
      fail('原始 Ability / Character 配置哈希与已核对版本不符');
    return errors;
  }
  if(u.monsterId===1022010&&k?.id===1022010&&k?.revision==='4.6-everwinter-shadewalker-1'){
    if(u.childId!==1022010)fail('场景 childId 不属于永冬灾影');
    if(!eq([k.skillId,k.skillParams,k.skill01Multiplier,k.actionDelayRatio,k.aiSequence],
      [102201001,[3,.5],3,.5,[102201001]]))fail('霜冻重击倍率、延后幅度或 AI 序列与本地源数据不符');
    const a=u.actions?.skill;
    if(!a||a.type!=='Normal'||a.element!=='Ice'||a.target!=='single'||a.hitEnergy!==15||a.hitEnergyPerHit!==true||
      !eq(a.terms,[{scaling:'atk',multiplier:3}])||!eq(a.effects,[{type:'delay',value:.5}]))
      fail('霜冻重击倍率、行动延后、属性、目标或受击回能与本地配置不符');
    if(!eq(u.policy?.rotation,['skill'])||u.policy?.autoUltimate!==false||u.unsupported?.length)
      fail('普通 AI 循环或无缺口完整模型标记错误');
    if(!eq(k.sourceHashes,{ability:'b94ca20ab0413321e5ceca1ea315d05be63e1188',character:'0833e6025a054d63429a9af76ecf077785931281'}))
      fail('原始 Ability / Character 配置哈希与已核对版本不符');
    return errors;
  }
  if(u.monsterId===1022020&&k?.id===1022020&&k?.revision==='4.6-flaming-shadewalker-1'){
    if(u.childId!==1022020)fail('场景 childId 不属于火焚灾影');
    if(!eq([k.skillId,k.skillParams,k.skill01Multiplier,k.burnChance,k.burnDuration,k.burnAttackRatio,k.aiSequence],
      [102202001,[3,1,3,.5],3,1,3,.5,[102202001]]))fail('灼炎重击倍率、灼烧参数或 AI 序列与本地源数据不符');
    const a=u.actions?.skill;
    if(!a||a.type!=='Normal'||a.element!=='Fire'||a.target!=='single'||a.hitEnergy!==15||a.hitEnergyPerHit!==true||
      !eq(a.terms,[{scaling:'atk',multiplier:3}])||!eq(a.effects,[{type:'dot',key:'burn',name:'灼烧',element:'Fire',debuff:true,
        duration:3,tickAt:'start',terms:[{scaling:'atk',multiplier:.5}]}]))
      fail('灼炎重击倍率、目标或灼烧的概率 / 持续时间 / 跳伤倍率与本地 Ability 不符');
    if(!eq(u.policy?.rotation,['skill'])||u.policy?.autoUltimate!==false||u.unsupported?.length)
      fail('普通 AI 循环或无缺口完整模型标记错误');
    if(!eq(k.sourceHashes,{ability:'960ddd6d84fbd02384072ab7e6a777de962a19f8',character:'eab85566eb96130a779e64c9bda770b5763e5576'}))
      fail('原始 Ability / Character 配置哈希与已核对版本不符');
    return errors;
  }
  if(u.monsterId===2002010&&k?.id===2002010&&k?.revision==='4.6-yunqi-patrol-soldier-partial-1'){
    if(u.childId!==2002010)fail('场景 childId 不属于云骑巡防士卒');
    if(!eq([k.skillId,k.skillParams,k.skill01Multiplier,k.aiSequence],
      [200201001,[2.5,1,2,.25],2.5,[200201001]]))fail('云刃参数或普通 AI 序列与本地 DB / AI 索引不符');
    const a=u.actions?.skill;
    if(!a||a.type!=='Normal'||a.element!=='Wind'||a.target!=='single'||a.hitEnergy!==15||a.hitEnergyPerHit!==true||
      !eq(a.terms,[{scaling:'atk',multiplier:2.5}]))fail('云刃倍率、属性、目标或受击回能与本地数据不符');
    if(!eq(u.policy?.rotation,['skill'])||u.policy?.autoUltimate!==false||
      !u.unsupported?.some(x=>x.includes('Ability 参数映射'))||!u.unsupported?.some(x=>x.includes('Skill02')))
      fail('普通攻击循环或未还原状态链必须明确保留');
    return errors;
  }
  if(u.monsterId===2002030&&k?.id===2002030&&k?.revision==='4.6-wraith-warden-partial-1'){
    if(u.childId!==2002030)fail('场景 childId 不属于幽府武弁');
    if(!eq([k.skillId,k.skillParams,k.skill01Multiplier,k.conditionalDebuffChance,k.conditionalActionDelayRatio,
      k.conditionalModifier,k.requiredTargetModifier,k.aiSequence],
      [200203001,[2.5,.35,2],2.5,.35,.7,'MCommon_Unstable','MCommon_Shake',[200203001]]))
      fail('锯恶倍率、条件状态或 AI 序列与本地源数据不符');
    const a=u.actions?.skill;
    if(!a||a.type!=='Normal'||a.element!=='Physical'||a.target!=='single'||a.hitEnergy!==15||a.hitEnergyPerHit!==true||
      !eq(a.terms,[{scaling:'atk',multiplier:2.5}]))fail('锯恶倍率、属性、目标或受击回能与本地 AI 不符');
    if(!eq(u.policy?.rotation,['skill'])||u.policy?.autoUltimate!==false||
      !u.unsupported?.some(x=>x.includes('MCommon_Unstable'))||!u.unsupported?.some(x=>x.includes('MCommon_Shake')))
      fail('自动终结技、普通 AI 循环或共享 modifier 缺口标记错误');
    if(!eq(k.sourceHashes,{ability:'8cd9339435bb6ced13be241a759c0e2851a6d4e6',character:'c3d64aac042b7f6461623a9f72d5c73ba78a34f3'}))
      fail('原始 Ability / Character 配置哈希与已核对版本不符');
    return errors;
  }
  if(u.monsterId===4063010&&k?.id===4063010&&k?.revision==='4.6-winged-serpent-partial-1'){
    if(![4063010,406301001].includes(u.childId))fail('场景 childId 不属于翼蛇形忆灵模板或虚构叙事变体');
    if(!eq([k.aiSequence,k.skill01Multiplier,k.skill02Multiplier,k.skill02AdjacentMultiplier,k.chargeLayers,
      k.skill04BaseMultiplier,k.skill04HitCount,k.skill05Multiplier,k.skill05HitEnergy,k.oneMorePerTurn,k.counterOncePerTurn],
      [[406301002,406301001,406301003,406301004,406301001,406301002,406301003,406301004],3.5,3,2.5,5,3.5,7,1.5,5,true,true]))
      fail('六旗标 AI 循环、攻击倍率、五层蓄力或受击反击参数与 4.6 源配置不符');
    for(const [key,name,target,multiplier,hitEnergy] of [
      ['skill01','罪血鞭笞','single',3.5,10],['skill05','扭矩反打','all',1.5,5],['skill05ToStb','扭矩反打','all',1.5,5],
    ]){
      const a=u.actions?.[key];
      if(!a||a.name!==name||a.type!=='Normal'||a.element!=='Imaginary'||a.target!==target||a.hitEnergy!==hitEnergy||
        a.hitEnergyPerHit!==true||!eq(a.terms,[{scaling:'atk',multiplier}]))fail(key+' 倍率、目标、属性或受击回能与 4.6 源配置不符');
    }
    const adjacent=u.actions?.skill02,charge=u.actions?.skill03,whirl=u.actions?.skill04;
    if(adjacent?.target!=='blast'||!eq(adjacent.terms,[{scaling:'atk',multiplier:3},{scaling:'atk',multiplier:2.5,target:'adjacent'}])||
      charge?.name!=='威慑警戒'||charge.target!=='self'||charge.terms?.length||
      whirl?.name!=='罪血涡旋'||whirl.target!=='all'||whirl.repeatCount!==7||whirl.terms?.[0]?.multiplier!==3.5)
      fail('主目标 / 相邻倍率、蓄力动作或七段涡旋近似缺失');
    if(u.policy?.autoUltimate!==false||
      !u.unsupported?.some(x=>x.includes('动态倍率哈希'))||!u.unsupported?.some(x=>x.includes('侵蚀'))||
      !u.unsupported?.some(x=>x.includes('关卡增伤 modifier')))
      fail('自动终结技设置或动态倍率 / 侵蚀 / 关卡增伤缺口标记不正确');
    return errors;
  }
  if(u.monsterId===4064012&&k?.id===4064012&&k?.revision==='4.6-arbiter-partial-1'){
    if(![406401201,406401202,406401203,406401204].includes(u.childId))fail('场景 childId 不属于裁定者的四个终局难度变体');
    if(!Number.isInteger(u.hpCount)||u.hpCount!==2||!eq(u.phaseRatios,[1,1])||k.resetToughnessOnHpBarChange!==true)fail('双血条比例或阶段转场韧性设置与末日幻影场景源不符');
    if(!eq([k.skill01Multiplier,k.skill04Multiplier,k.skill04HitShares,k.skill05Multiplier,k.skill05HitShares],
      [1.8,1.8,[.1,.1,.1,.1,.1,.1,.4],3.5,[.3,.3,.4]]))fail('罪血嚼齿、七段罪血锯刑或三段罪血钳刑的已登记倍率与源数据不符');
    const saw=u.actions?.skill04;
    if(!saw||saw.name!=='罪血锯刑'||saw.element!=='Imaginary'||saw.target!=='single'||saw.hitEnergy!==15||saw.hitEnergyPerHit!==true||
      !eq(saw.hitShares,[.1,.1,.1,.1,.1,.1,.4])||!eq(saw.hitEnergyShares,[1,1,1,1,1,1,1]))fail('罪血锯刑必须保留六段 0.1 与末段 0.4 拆分以及每段完整受击回能');
    const pincers=u.actions?.skill05;
    if(!pincers||pincers.name!=='罪血钳刑'||pincers.target!=='all'||pincers.hitEnergy!==10||pincers.hitEnergyPerHit!==true||
      !eq(pincers.hitShares,[.3,.3,.4])||!eq(pincers.hitEnergyShares,[1,1,1]))fail('罪血钳刑必须是 30% / 30% / 40% 的三段全体攻击');
    if(!u.unsupported?.some(x=>x.includes('5只【金血忆灵】'))||!u.unsupported?.some(x=>x.includes('坚防守备'))||!u.unsupported?.some(x=>x.includes('壁垒反震')))fail('五只忆灵、场景标签或反震状态链的未实现缺口没有明确标记');
    if(u.policy?.autoUltimate!==false)fail('敌人不能自动施放玩家终结技');
    return errors;
  }
  if(u.monsterId===8012030&&k?.id===8012030&&k?.revision==='4.6-aml-obliterator-1'){
    if(!eq([k.aiSequence,k.targetSelector,k.skill01Multiplier,k.markChance,k.markMultiplier,k.markDuration,k.markAttackCount],
      [[801203001,801203002],'MMonster_AML_Minion03_00_Target',4,.75,.4,2,4]))fail('AI 顺序、目标选择器、攻击倍率或【起爆】参数与 4.6 源数据不符');
    const a=u.actions?.skill01;
    if(!a||a.name!=='虚灼炮攻'||a.type!=='Normal'||a.element!=='Imaginary'||a.target!=='single'||a.hitEnergy!==15||a.hitEnergyPerHit!==true||
      !eq(a.hitShares,[.33,.33,.34])||!eq(a.terms,[{scaling:'atk',multiplier:4}]))fail('虚灼炮攻倍率、三段命中、目标、属性或受击回能与源配置不符');
    if(!u.actions?.skill02||u.actions.skill02.name!=='热障阻塞'||u.actions.skill02.target!=='self'||u.actions.skill02.terms?.length)fail('热障阻塞解除行动缺失');
    if(!u.unsupported?.some(x=>x.includes('MMonster_AML_Minion03_00_Target'))||!u.unsupported?.some(x=>x.includes('Count=4')))fail('AI 目标选择或起爆计数的严格模式缺口标记缺失');
    if(u.policy?.autoUltimate!==false)fail('敌人不能自动施放玩家终结技');
    return errors;
  }
  if(u.monsterId===8012020&&k?.id===8012020&&k?.revision==='4.6-aml-trampler-1'){
    if(!eq([k.aiSequence,k.targetSelector,k.markVulnerability,k.skill02Multiplier,k.skill01MinAliveTargets,k.skill01MinTeamSize],[[801202001,801202002],'MMonster_AML_Minion03_00_Target',.1,5,2,2]))fail('AI 序列、目标标记、全伤害易伤、人数条件或无影虚击倍率与 4.6 源数据不符');
    const mark=u.actions?.skill01,hit=u.actions?.skill02;
    if(!mark||mark.name!=='虚无命意'||mark.type!=='Normal'||mark.target!=='single'||mark.terms?.length)fail('虚无命意必须是单体选靶、无直接伤害的标记行动');
    if(!hit||hit.name!=='无影虚击'||hit.type!=='Normal'||hit.element!=='Quantum'||hit.target!=='single'||hit.hitEnergy!==15||!eq(hit.terms,[{scaling:'atk',multiplier:5}]))fail('无影虚击倍率、属性、目标或受击回能与 4.6 源参数不符');
    if(!u.actions?.wait||u.actions.wait.terms?.length||u.policy?.autoUltimate!==false||!u.unsupported?.some(x=>x.includes('并列目标顺序'))||!u.unsupported?.some(x=>x.includes('空过')))fail('空过动作、自动终结技设置或 AI 边界缺口标记不正确');
    return errors;
  }
  if(u.monsterId===2013020&&k?.id===2013020&&k?.revision==='4.6-golden-scourge-1'){
    if(!eq([k.aiSequence,k.unstableChance,k.unstableDuration,k.shakeChance,k.shakeDuration,k.shakeDelayRatio,k.shakeSkipTurns,k.skill03Chance,k.skill03MaxTargets,k.skill04Multiplier,k.skill04Hits,k.skill04BonusMultiplier],
      [[201302001,201302002,201302002,201302003],.7,2,1,1,.7,1,.35,2,4,4,2]))fail('震荡概率、强烈震荡控制或 AI 序列与 4.6 源数据不符');
    const expected={skill01:['剖判',3,[.5,.5],[.5,.5],10,'single'],skill02:['镇魂',3.6,null,null,10,'single'],skill03:['转阴阳',3,[.5,.5],[.5,.5],10,'all'],skill04:['天坠',4,[.25,.25,.25,.25],[.5,.5,.5,.5],20,'single'],skill06:['天坠',4,[.25,.25,.25,.25],[.5,.5,.5,.5],10,'single']};
    for(const [key,[name,mult,shares,energyShares,hitEnergy,target]] of Object.entries(expected)){const a=u.actions?.[key];
      if(!a||a.name!==name||a.type!=='Normal'||a.element!=='Physical'||a.target!==target||a.hitEnergy!==hitEnergy||
        (shares!=null&&!eq(a.hitShares,shares))||(energyShares!=null&&!eq(a.hitEnergyShares,energyShares))||!eq(a.terms,[{scaling:'atk',multiplier:mult}]))fail(key+' 招式倍率、命中段数或目标与源配置不符');}
    const bonus=u.actions?.skill04Insert;
    if(!bonus||bonus.name!=='拘魂令'||bonus.terms?.length||bonus.target!=='single'||!eq(u.actions?.skill?.terms,u.actions?.skill01?.terms))fail('拘魂令插入或剖判默认动作缺失');
    if(u.policy?.autoUltimate!==false)fail('敌人不能自动施放玩家终结技');
    return errors;
  }
  if(u.monsterId===2023020&&k?.id===2023020&&k?.revision==='4.6-long-right-1'){
    if(!eq([k.aiSequence,k.skillMultiplier,k.bulletCount,k.damageUpPerLayer,k.damageUpDuration,k.damageUpLayers,k.extraActionsPerTurn],
      [[202302004,202302003,202302001,202302003,202302001,202302003,202302002,202302005],4.75,3,.2,2,3,1]))fail('AI 顺序、元气消耗、猱击倍率或奋威增伤参数与 4.6 源数据不符');
    for(const key of ['skill','skill01','skill02']){const a=u.actions?.[key];if(!a||a.name!=='猱击'||a.type!=='Normal'||a.element!=='Quantum'||a.target!=='single'||a.hitEnergy!==15||!eq(a.terms,[{scaling:'atk',multiplier:4.75}]))fail(key+' 猱击倍率、属性、目标或受击回能与源配置不符');}
    if(u.actions?.skill03?.name!=='奋威'||u.actions.skill03.target!=='self'||u.actions?.skill04?.name!=='怒啸'||u.actions.skill04.target!=='single'||u.actions?.skill05?.target!=='self')fail('奋威、怒啸或收招动作缺失');
    if(u.policy?.autoUltimate!==false||!u.unsupported?.some(x=>x.includes('AI 选择器'))||!u.unsupported?.some(x=>x.includes('AIFlag=8')))fail('AI 自动终结技或严格模式缺口标记不正确');
    return errors;
  }
  if(u.monsterId===1012030&&k?.id===1012030&&k?.revision==='4.6-mecha-block-1'){
    if(!eq([k.skillId,k.barrierHits,k.blockDot,k.muteBreak,k.aiSequence],[101203001,1,false,true,[101203001]]))fail('屏障层数、行动序列或伤害类型规则与正式服不符');
    const a=u.actions?.skill;
    if(!a||a.name!=='不稳定力场'||a.type!=='Normal'||a.element!=='Physical'||a.target!=='single'||a.hitEnergy!==15||a.hitEnergyPerHit!==true||!eq(a.terms,[{scaling:'atk',multiplier:3}]))fail('不稳定力场倍率、目标、属性或受击回能与正式服不符');
    if(!eq(u.policy?.rotation,['skill'])||u.policy?.autoUltimate!==false)fail('AI 应按单技能序列循环不稳定力场');
    return errors;
  }
  if(u.monsterId===2032020&&k?.id===2032020&&k?.revision==='4.6-lycan-moonrage-1'){
    if(!eq([k.skillId,k.aiSequence,k.rageThreshold,k.rageSpeedRatio,k.rageHealRatio,k.rageCountdownSpeed],[203202001,[203202001],6,.3,.4,105]))fail('共享嗜血阈值、月狂状态或倒计时参数与 4.6 源数据不符');
    const a=u.actions?.skill;
    if(!a||a.name!=='啃噬'||a.type!=='Normal'||a.element!=='Physical'||a.target!=='single'||a.hitEnergy!==10||a.hitEnergyPerHit!==true||!eq(a.terms,[{scaling:'atk',multiplier:2.8}]))fail('啃噬倍率、目标、属性或受击回能与正式服不符');
    if(!u.enemyKit.lycanGroup||!u.actions?.moonrageStart||u.actions.moonrageStart.target!=='self'||u.actions.moonrageStart.terms.length||!u.actions?.moonrageCountdown||u.actions.moonrageCountdown.target!=='self'||u.actions.moonrageCountdown.terms.length||!u.actions?.moonrageFinish||u.actions.moonrageFinish.target!=='self'||u.actions.moonrageFinish.terms.length)fail('月狂转换、结束或倒计时行动未登记');
    if(!eq(u.policy?.rotation,['skill'])||u.policy?.autoUltimate!==false)fail('蚀月狼卒 AI 应按单技能序列循环啃噬');
    return errors;
  }
  if(u.monsterId===2032010&&k?.id===2032010&&k?.revision==='4.6-lycan-bloodclaw-1'){
    if(!eq([k.skillId,k.aiSequence,k.rageThreshold,k.rageSpeedRatio,k.rageHealRatio,k.rageCountdownSpeed,k.rageDotChance,k.rageDotDuration,k.rageDotAtkRatio,k.rageDotMaxHpPercent],
      [203201001,[203201001],6,.3,0,105,1,2,.3,5]))fail('共享嗜血阈值、月狂速度或裂伤参数与 4.6 源数据不符');
    const a=u.actions?.skill;
    if(!a||a.name!=='厮杀'||a.type!=='Normal'||a.element!=='Physical'||a.target!=='blast'||a.hitEnergy!==10||a.hitEnergyPerHit!==true||!eq(a.terms,[{scaling:'atk',multiplier:1.8},{scaling:'atk',multiplier:1.8,target:'adjacent'}]))fail('厮杀倍率、主目标 / 相邻目标、属性或受击回能与正式服不符');
    if(!u.enemyKit.lycanGroup||!u.actions?.moonrageStart||u.actions.moonrageStart.target!=='self'||u.actions.moonrageStart.terms.length||!u.actions?.moonrageCountdown||u.actions.moonrageCountdown.target!=='self'||u.actions.moonrageCountdown.terms.length||!u.actions?.moonrageFinish||u.actions.moonrageFinish.target!=='self'||u.actions.moonrageFinish.terms.length)fail('月狂转换、结束或倒计时行动未登记');
    if(!eq(u.policy?.rotation,['skill'])||u.policy?.autoUltimate!==false)fail('玄爪狼卒 AI 应按单技能序列循环厮杀');
    return errors;
  }
  if(u.monsterId===2033010&&k?.id===2033010&&k?.revision==='4.6-lycan-mecha-1'){
    if(!eq([k.aiSequence,k.rageThreshold,k.rageSpeedRatio,k.rageCountdownSpeed],[[203301001,203301002,203301004,203301005],6,.3,105]))fail('两阶段 AI 顺序、共享狼群阈值或月狂速度 / 倒计时与 4.6 源数据不符');
    const expected={skill01:['仿生利爪','single',[{scaling:'atk',multiplier:3.2}],10],skill02:['电震咆哮','blast',[{scaling:'atk',multiplier:2.6},{scaling:'atk',multiplier:1.8,target:'adjacent'}],10],
      skill04:['合成狼毒','all',[{scaling:'atk',multiplier:1.2}],20],skill05:['杀戮算法','blast',[{scaling:'atk',multiplier:3.2},{scaling:'atk',multiplier:1.8,target:'adjacent'}],15]};
    for(const [key,[name,target,terms,hitEnergy]] of Object.entries(expected)){const a=u.actions?.[key];if(!a||a.name!==name||a.type!=='Normal'||a.element!=='Physical'||a.target!==target||a.hitEnergy!==hitEnergy||a.hitEnergyPerHit!==true||!eq(a.terms,terms))fail(key+' 倍率、命中目标、属性或受击回能与已登记源参数不符');}
    if(!u.enemyKit.lycanGroup||!u.actions?.moonrageStart||!u.actions?.moonrageCountdown||!u.actions?.moonrageFinish)fail('共享狼群月狂转换或倒计时事件未登记');
    if(!u.unsupported?.some(x=>x.includes('恐惧'))||!u.unsupported?.some(x=>x.includes('Skill06')))fail('恐惧条件伤害或 Skill06 阶级插入缺口未标记');
    if(!eq(u.policy?.rotation,['skill01','skill02'])||u.policy?.autoUltimate!==false)fail('常态 AI 初始轮转或自动终结技设置错误');
    return errors;
  }
  if(u.monsterId===4022010&&k?.id===4022010&&k?.revision==='4.6-meteoric-eagle-1'){
    if(!eq([k.aiSequence,k.windwalkModifier,k.windwalkRemovesOnBreak,k.skill02ActionDelay,k.listenAfterSkill],[[402201001,402201002],'MCommon_FastAction',true,12,true]))fail('AI 顺序、风行状态、弱点击破清除或 Skill02 延迟条件与 4.6 源配置不符');
    const strike=u.actions?.skill,windwalk=u.actions?.skill02;
    if(!strike||strike.name!=='划破夜空'||strike.type!=='Normal'||strike.element!=='Wind'||strike.target!=='single'||strike.hitEnergy!==5||strike.hitEnergyPerHit!==true||!eq(strike.terms,[{scaling:'atk',multiplier:2}]))fail('划破夜空倍率、目标、属性或受击回能与源配置不符');
    if(!windwalk||windwalk.name!=='如流星闪耀'||windwalk.type!=='Normal'||windwalk.element!=='Wind'||windwalk.target!=='ally'||windwalk.terms?.length)fail('如流星闪耀的同侧目标或无伤害行动缺失');
    if(!u.enemyKit.monsterRank||!u.unsupported?.some(x=>x.includes('并列规则')))fail('怪物阶级或 AI 候选目标并列规则的缺口标记缺失');
    if(!eq(u.policy?.rotation,['skill'])||u.policy?.autoUltimate!==false)fail('流星铁鹰初始 AI 行动或自动终结技设置错误');
    return errors;
  }
  if(u.monsterId===8003010&&k?.id===8003010&&k?.revision==='4.6-ice-out-of-space-1'){
    if(!eq([k.aiSequence,k.oneMorePerTurn,k.icepointToughnessAdded,k.skill03FreezeChance,k.skill03FreezeDuration,k.skill03FreezeActionDelay,k.skill01FrozenBonusMultiplier],
      [[800301001,800301002,800301003,800301001],true,120,.6,1,1.2,1]))fail('AI 序列、额外行动、冰点韧性或冻结参数与 4.6 源配置不符');
    const expected={skill01:['叹息之寒','single',2.5,10],skill03:['永冬之雨','all',2,15],skill04:['叹息之寒','single',2.5,10]};
    for(const [key,[name,target,multiplier,hitEnergy]] of Object.entries(expected)){const a=u.actions?.[key];
      if(!a||a.name!==name||a.type!=='Normal'||a.element!=='Ice'||a.target!==target||a.hitEnergy!==hitEnergy||!eq(a.terms,[{scaling:'atk',multiplier}]))fail(key+' 倍率、目标、属性或受击回能与 4.6 源参数不符');}
    const rain=u.actions?.skill03;
    if(!eq(rain?.hitShares,[.3,.3,.4])||!eq(rain?.hitEnergyShares,[.3,.3,.4])||rain?.hitEnergyPerHit!==true)fail('永冬之雨的三段伤害 / 受击回能比例不正确');
    if(u.actions?.skill02?.name!=='汲取霜晶'||u.actions.skill02.target!=='self'||u.actions.skill02.terms?.length)fail('汲取霜晶必须是无伤害自我状态行动');
    if(!u.unsupported?.some(x=>x.includes('通用追加冰伤'))||!u.unsupported?.some(x=>x.includes('并列顺序'))||!u.unsupported?.some(x=>x.includes('Skill04')))fail('冻结 / 选靶 / 备用技能缺口没有显式标注');
    if(u.policy?.autoUltimate!==false)fail('敌人不能自动施放玩家终结技');
    return errors;
  }
  if(u.monsterId===3013010&&k?.id===3013010&&k?.revision==='4.6-faded-rage-shell-1'){
    if(!eq([k.aiSequence,k.growthMax,k.skill07BaseHits,k.skill07DamageMultiplier,k.skill07HitEnergy,
      k.superArmorDamageReduction,k.superArmorBreakDelay,k.superArmorBreakDamageTaken,k.oneMorePerTurn],
      [[301301001,301301003,301301002,301301004],5,3,2,5,.6,.75,.5,true]))
      fail('AI 序列、无明火成长、额外攻击或癔症身壳参数与 4.6 源数据不符');
    const expected={skill01:['怀恨礼','single',3,10],skill06:['宿怨如浪翻涌','all',1.8,10]};
    for(const [key,[name,target,multiplier,hitEnergy]] of Object.entries(expected)){
      const a=u.actions?.[key];
      if(!a||a.name!==name||a.type!=='Normal'||a.element!=='Quantum'||a.target!==target||a.hitEnergy!==hitEnergy||
        a.hitEnergyPerHit!==true||!eq(a.terms,[{scaling:'atk',multiplier}]))
        fail(key+' 倍率、目标、属性或受击回能与 4.6 源参数不符');
    }
    if(u.actions?.skill04?.name!=='怒叱如雷轰鸣'||u.actions.skill04.target!=='self'||u.actions.skill04.terms?.length||
      u.actions?.skill07?.name!=='痛恶如刺剔骨'||u.actions.skill07.target!=='all'||u.actions.skill07.terms?.length)
      fail('无明火叠层或追击行动缺失');
    if(u.policy?.autoUltimate!==false||u.unsupported?.length)
      fail('敌人自动终结技设置或 AI 完整度标记不正确');
    return errors;
  }
  if(u.monsterId===2004014&&k?.id===2004014&&k?.revision==='4.6-soulhook-sovereign-1'){
    if(!eq([k.aiSequenceByPhase,k.skill01Multiplier,k.skill02Multiplier,k.skill02AdjacentMultiplier,k.skill03Multiplier,
      k.skill04Multiplier,k.skill04ShockMultiplier,k.shockChance,k.shockDuration,k.shockDamageRatio,
      k.charmChance,k.charmDuration,k.charmDamageMultiplier,k.charmMinRatio,k.charmMaxRatio],
      [{1:['skill01','skill02','skill05'],2:['skill04','skill02','skill07','skill02']},2.5,2.5,1.75,3,2.5,1.2,1,3,.5,1.2,1,2.5,.5,1.5]))
      fail('AIFlag 循环、雷伤倍率、触电或支配参数与 4.6 源数据不符');
    if(![200401401,200401402,200401403,200401404].includes(u.childId)||!Number.isInteger(u.hpCount)||
      !Array.isArray(u.phaseRatios)||u.phaseRatios.length!==u.hpCount)fail('场景变体或生命阶段参数与数据库行不一致');
    const a1=u.actions?.skill01,a2=u.actions?.skill02,a3=u.actions?.skill03,a4=u.actions?.skill04,effect=u.actions?.skill05?.effects?.[0];
    if(!a1||a1.name!=='夜间喧嚣不止'||a1.element!=='Thunder'||a1.target!=='single'||a1.terms?.[0]?.multiplier!==2.5||
      !eq(a1.hitShares,[.5,.5])||!eq(a1.hitEnergyShares,[.5,.5]))fail('夜间喧嚣不止的两段命中与倍率未按源配置实现');
    if(!a2||a2.name!=='月光摩挲连绵'||a2.terms?.[0]?.multiplier!==2.5||!eq(a2.hitShares,[.2,.3,.5]))fail('月光摩挲连绵主目标分段倍率与源配置不符');
    if(!a3||a3.name!=='缄默厉声嘲笑'||a3.target!=='all'||a3.terms?.[0]?.multiplier!==3||
      !a4||a4.name!=='亡者切齿呢喃'||a4.terms?.[0]?.multiplier!==2.5)fail('支配者全体攻击或第二阶段攻击动作缺失');
    if(!effect||effect.control!=='charm'||effect.actionAdvance!==true||effect.noUltimate!==true||effect.chance!==1.2||
      effect.charmDamagePercent!==2.5||effect.minDamageRatio!==.5||effect.maxDamageRatio!==1.5||
      effect.removeOnBreak!==true||effect.removeOnSourceBreak!==true||effect.removeOnSourceDeath!==true)
      fail('言灵的支配状态、强制同伴攻击或解除条件与共享 modifier 不符');
    if(u.policy?.autoUltimate!==false||!u.unsupported?.some(x=>x.includes('精英召唤'))||
      !u.unsupported?.some(x=>x.includes('心理暗示'))||!u.unsupported?.some(x=>x.includes('触电触发')))
      fail('支配者终结技设置或未还原的召唤 / 阶段 / 触电联动缺口标记缺失');
    return errors;
  }
  if(u.monsterId===5013010&&k?.id===5013010&&k?.revision==='4.6-rocking-rebel-1'){
    if(!eq([k.aiSequence,k.aiCombosByFlag,k.skill01Multiplier,k.skill04Multiplier,k.chargeAhaLaughter,k.chargeAhaVulnerability,
      k.chargeAhaVulnerabilityDuration,k.skill05SpeedRatio,k.skill05SpeedDuration,k.skill052DamageMaxHpRatio,
      k.skill052DizzyChance,k.skill052DizzyDuration,k.skill052Laughter],
      [[501301001,501301003,501301004,501301002,501301005],{1:['skill01','skill02'],2:['skill02','skill01']},2.8,5,10,.4,2,.5,2,.1,.5,2,10]))
      fail('AIFlag 主循环、倍率或阿哈 / 狂奏参数与 4.6 源数据不符');
    for(const [key,name,target,multiplier,hitEnergy] of [
      ['skill01','左扫弦！','sweep',2.8,10],['skill02','右扫弦！','sweep',2.8,10],['skill04','摇滚时刻！','all',5,20],
    ]){
      const a=u.actions?.[key];
      if(!a||a.name!==name||a.type!=='Normal'||a.element!=='Imaginary'||a.target!==target||a.hitEnergy!==hitEnergy||
        a.hitEnergyPerHit!==true||!eq(a.terms,[{scaling:'atk',multiplier}]))fail(key+' 倍率、目标、属性或受击回能与 4.6 源配置不符');
    }
    if(u.actions?.skill01?.sweepDirection!=='left'||u.actions?.skill02?.sweepDirection!=='right'||
      !u.actions?.skill03||u.actions.skill03.name!=='演出彩排'||u.actions.skill03.target!=='self'||
      !u.actions?.skill05||u.actions.skill05.name!=='燥起来吧！'||u.actions.skill05.target!=='self'||
      !u.actions?.skill052||!u.actions?.skill042)fail('左右扫弦、蓄力、狂奏分支或阿哈打断动作缺失');
    if(u.policy?.autoUltimate!==false||!u.unsupported?.some(x=>x.includes('OneMore / OneMorePerTurn'))||
      !u.unsupported?.some(x=>x.includes('Skill052 的动态哈希')))fail('敌方终结技配置或未对拍的额外行动 / 动态参数标记缺失');
    return errors;
  }
  if(u.monsterId===4053010&&k?.id===4053010&&k?.revision==='4.6-wave-lady-partial-1'){
    if(![4053010,405301002].includes(u.childId))fail('场景 childId 不属于波涛夫人模板或虚构叙事变体');
    if(!eq([k.aiSequence,k.skill01Multiplier,k.skill01AdjacentMultiplier,k.skill02Multiplier,k.skill02DefShred,
      k.skill02ResReduction,k.skill02Duration,k.summonMonsterId,k.summonCount,k.skill05Multiplier],
      [[405301001,405301002,405301003,405301004,405301005],2.5,1.5,2,.15,.15,2,4052010,2,2.5]))
      fail('AI 顺序、攻击倍率、蜜酿减益或双浪花侍女召唤参数与 4.6 源数据不符');
    const s1=u.actions?.skill01,s2=u.actions?.skill02,s3=u.actions?.skill03,s4=u.actions?.skill04,s5=u.actions?.skill05;
    if(!s1||s1.name!=='摆袖醉意袭人'||s1.type!=='Normal'||s1.element!=='Ice'||s1.target!=='blast'||
      !eq(s1.terms,[{scaling:'atk',multiplier:2.5},{scaling:'atk',multiplier:1.5,target:'adjacent'}])||
      s1.hitEnergy!==10||s1.hitEnergyPerHit!==true)fail('摆袖醉意袭人的目标、倍率或受击回能不符');
    if(!s2||s2.name!=='蜜酿泼洒如星'||s2.element!=='Ice'||s2.target!=='all'||s2.terms?.[0]?.multiplier!==2||
      s2.hitEnergy!==10||s2.hitEnergyPerHit!==true||!s3||s3.name!=='高歌邀客入席'||s3.target!=='self'||s3.terms?.length||
      !s4||s4.name!=='聆听海的礼赠'||s4.target!=='self'||s4.terms?.length||
      !s5||s5.name!=='波涛与你相拥'||s5.element!=='Ice'||s5.target!=='all'||s5.terms?.[0]?.multiplier!==2.5)
      fail('蜜酿、召唤、起舞或波涛攻击动作缺失 / 参数不符');
    if(!k.summonBlueprint||k.summonBlueprint.monsterId!==4052010||k.summonBlueprint.actions?.skill?.name!=='海的裙摆飘荡')
      fail('浪花侍女召唤模板未从本地敌人数据构建');
    if(u.policy?.autoUltimate!==false||!u.unsupported?.some(x=>x.includes('狂欢状态'))||
      !u.unsupported?.some(x=>x.includes('浪花侍女'))||!u.unsupported?.some(x=>x.includes('OneMorePerTurn')))
      fail('终结技设置或狂欢 / 侍女被动 / 插入行动的未实现缺口标记缺失');
    return errors;
  }
  if(u.monsterId===4052010&&k?.id===4052010&&k?.revision==='4.6-wave-maid-partial-1'){
    if(u.childId!==4052010)fail('场景 childId 不属于浪花侍女');
    if(!eq([k.skill01Multiplier,k.skill01TransferRatio,k.deathCounterMultiplier,k.actionAdvanceHitCount,
      k.actionAdvanceDuringFrenzyHitCount,k.actionAdvanceDuringFrenzyRatio],[1.8,.7,.15,5,2,.5]))
      fail('全体攻击 / 黑潮热 / 受击阈值参数与本地 4.6 AI 源索引不符');
    const a=u.actions?.skill;
    if(!a||a.name!=='海的裙摆飘荡'||a.type!=='Normal'||a.element!=='Ice'||a.target!=='all'||a.hitEnergy!==10||
      a.hitEnergyPerHit!==true||!eq(a.terms,[{scaling:'atk',multiplier:1.8}]))fail('海的裙摆飘荡攻击目标、倍率或受击回能不符');
    if(u.policy?.autoUltimate!==false||!u.unsupported?.some(x=>x.includes('黑潮热'))||
      !u.unsupported?.some(x=>x.includes('致命退场全体反击'))||!u.unsupported?.some(x=>x.includes('受击计数')))
      fail('终结技设置或 DoT / 退场反击 / 被动触发边界缺口标记缺失');
    return errors;
  }
  if(u.monsterId===1002040&&k?.id===1002040&&k?.revision==='4.6-silvermane-guard-partial-1'){
    if(u.childId!==1002040)fail('场景 childId 不属于银鬃近卫');
    if(!eq([k.skillId,k.skill01Multiplier,k.defenseDownChance,k.defenseDownDuration],[100204001,3,.5,2]))
      fail('奔袭攻击与本地 AI 参数不符');
    const a=u.actions?.skill;
    if(!a||a.name!=='奔袭'||a.type!=='Normal'||a.element!=='Physical'||a.target!=='single'||a.hitEnergy!==10||
      a.hitEnergyPerHit!==true||!eq(a.terms,[{scaling:'atk',multiplier:3}]))fail('奔袭倍率、属性、目标或受击回能不符');
    if(u.policy?.autoUltimate!==false||!u.unsupported?.some(x=>x.includes('防御降低幅度')))
      fail('终结技设置或防御降低幅度的明确缺口标记缺失');
    return errors;
  }
  if(u.monsterId===4012010&&k?.id===4012010&&k?.revision==='4.6-strongman-partial-1'){
    if(u.childId!==4012010)fail('场景 childId 不属于天谴斗士');
    if(!eq([k.skillId,k.skill01Multiplier,k.armorSkillId,k.armorParams],
      [401201001,3,401201002,[3,.3,.1,.1,.06,.3]]))fail('冲撞倍率或战甲原始参数与 4.6 本地技能表不符');
    const a=u.actions?.skill;
    if(!a||a.name!=='第三轨道的冲撞'||a.type!=='Normal'||a.element!=='Physical'||a.target!=='single'||a.hitEnergy!==15||
      a.hitEnergyPerHit!==true||!eq(a.terms,[{scaling:'atk',multiplier:3}]))fail('冲撞倍率、属性、目标或受击回能不符');
    if(u.policy?.autoUltimate!==false||!u.unsupported?.some(x=>x.includes('战甲')))
      fail('终结技设置或战甲被动缺口标记缺失');
    return errors;
  }
  if(u.monsterId===8022010&&k?.id===8022010&&k?.revision==='4.6-swarm-broodling-partial-1'){
    if(u.childId!==8022010)fail('场景 childId 不属于幼蛰虫');
    if(!eq([k.skillId,k.skill01Multiplier,k.skill01Params,k.splitSkillId,k.splitParams,k.deathSkillId,k.deathParams,k.passiveSkillId,k.passiveParams,k.aiSequence],
      [802201001,2,[2,1,.5,3,5],802201002,[],802201003,[2,1,.08],802201004,[.5,1,.1,3,10,30],[802201001]]))
      fail('振翅倍率、AI 序列或分裂 / 退场被动原始参数与 4.6 本地表不符');
    const a=u.actions?.skill;
    if(!a||a.name!=='振翅'||a.type!=='Normal'||a.element!=='Wind'||a.target!=='single'||a.hitEnergy!==10||
      a.hitEnergyPerHit!==true||!eq(a.terms,[{scaling:'atk',multiplier:2}]))fail('振翅倍率、属性、目标或受击回能不符');
    if(u.policy?.autoUltimate!==false||!u.unsupported?.some(x=>x.includes('次分裂'))||!u.unsupported?.some(x=>x.includes('致命退场')))
      fail('自动终结技设置或分裂 / 退场被动缺口标记缺失');
    return errors;
  }
  if(u.monsterId===5012110&&k?.id===501211002&&k?.revision==='4.6-tanuki-reporter-partial-1'){
    if(u.childId!==501211002)fail('场景 childId 不属于狸猫记者');
    if(!eq([k.skillId,k.aiSequence,k.skill01Multiplier,k.passiveSkillId,k.passiveParams],
      [501211001,[501211001],2.8,501211002,[1,.5,10,5,3,.5,.2,.1,2]]))fail('抓拍或丑照特写原始 AI 参数与本地 4.6 数据不符');
    const a=u.actions?.skill;
    if(!a||a.name!=='抓拍'||a.type!=='Normal'||a.element!=='Imaginary'||a.target!=='single'||a.hitEnergy!==10||
      !eq(a.terms,[{scaling:'atk',multiplier:2.8}]))fail('抓拍倍率、属性、目标或受击回能不符');
    if(u.policy?.autoUltimate!==false||!u.unsupported?.some(x=>x.includes('丑照特写')))
      fail('自动终结技设置或评价 / 欢愉度 / 笑点的缺口标记缺失');
    return errors;
  }
  if(u.monsterId===2023030&&k?.revision==='4.6-ascended-partial-1'){
    if(u.childId!==202303016||k.id!==202303016||u.element!=='Wind')fail('承露天人 childId 或风属性不匹配');
    if(!eq([k.skill01Id,k.skill01Params,k.skill02Id,k.skill02Params,k.skill03Id,k.skill03Params,
      k.skill04Id,k.skill05Id,k.skill05Params,k.oneMorePerTurn,k.poisonChance,k.poisonDuration,k.poisonRatio,
      k.dirtyHpInitialRatio,k.dirtyHpCap,k.dirtyHpDuration,k.dirtyHpChance],
      [202303001,[1,1,3,.7],202303002,[2,1,3,.7],202303003,[3,1,3,.7],202303004,202303005,[.3,2,1],true,1,3,.7,.3,.5,2,1]))
      fail('五段技能参数、OneMorePerTurn、风化或噬命参数与本地 4.6 数据不符');
    const a=u.actions?.skill01,b=u.actions?.skill02,c=u.actions?.skill03;
    if(!a||a.name!=='若木化生仪祷'||a.element!=='Wind'||a.target!=='single'||a.repeatCount!==5||a.randomHitTargets!==true||
      a.hitEnergy!==5||a.hitEnergyPerHit!==true||!eq(a.terms,[{scaling:'atk',multiplier:1}]))
      fail('Skill01 五段随机风属性攻击的倍率 / 目标 / 受击回能不符');
    if(!b||b.name!=='导引巽风'||b.target!=='blast'||b.hitEnergy!==10||b.hitEnergyPerHit!==true||
      !eq(b.terms,[{scaling:'atk',multiplier:2,target:'primary'},{scaling:'atk',multiplier:1,target:'adjacent'}]))
      fail('Skill02 主目标 2.0 / 相邻 1.0 的扩散攻击不符');
    if(!c||c.name!=='若木棘'||c.target!=='single'||c.hitEnergy!==15||!eq(c.terms,[{scaling:'atk',multiplier:3}]))
      fail('Skill03 单体 3.0 攻击不符');
    if(!u.actions?.skill04||u.actions.skill04.target!=='self'||u.actions.skill04.terms?.length||
      !u.actions?.skill05||u.actions.skill05.target!=='all'||u.actions.skill05.terms?.length)
      fail('持咒与噬命不得被错误建模为伤害攻击');
    if(!Array.isArray(u.enemyMechanicNotes)||u.enemyMechanicNotes.length!==3||u.policy?.autoUltimate!==false)
      fail('噬命内核公式、Skill01 嘲讽优先与剧情分支缺口说明缺失');
    if(!eq(k.sourceHashes,{ai:'7a063305006f4e5676aa7aaaedec6d2e09e41852',character:'b7b0de2cb349983944eaba9bee2784f6a8ffa22a',
      ability:'4059b25ad18f6d0c1f5b0a05accc42c3196d855e',sharedModifier:'e043cdc0650741eb27049b0c1a0710bccb77618f'}))
      fail('原始 AI / Character / Ability / 公共 modifier 配置哈希与核对版本不符');
    return errors;
  }
  if(u.monsterId===1013020&&k?.revision==='4.6-direwolf-partial-1'){
    if(![1013020,101302032].includes(u.childId)||k.id!==u.childId||u.element!=='Physical')
      fail('自动机兵•齿狼 childId 或物理属性不匹配');
    if(!eq([k.skill01Id,k.skill01Params,k.skill02Id,k.skill02Params,k.skill03Id,k.skill03Params,
      k.skill04Id,k.skill04Params,k.oneMorePerTurn,k.bleedChance,k.bleedRatio,k.bleedDuration,k.bleedMaxStacks],
      [101302001,[.5,.05,4,10],101302002,[],101302003,[2.5],101302004,[2.5],true,.5,.05,2,10]))
      fail('砍伐 / 目标锁定 / 解体指令 / 解体拆除参数或裂伤（50% / 5% / 2 回合 / 10 层）与 4.6 数据不符');
    const saw=u.actions?.skill01,lock=u.actions?.skill02,slash=u.actions?.skill03,insert=u.actions?.skill04;
    if(!saw||saw.name!=='砍伐指令'||saw.element!=='Physical'||saw.target!=='single'||saw.repeatCount!==10||
      saw.hitEnergy!==2||saw.hitEnergyPerHit!==true||saw.toughness!==2||!eq(saw.terms,[{scaling:'atk',multiplier:.4}]))
      fail('砍伐指令须为 10 段 × 0.4 倍物理单体攻击');
    if(!lock||lock.name!=='目标锁定'||lock.terms?.length||lock.target!=='single')
      fail('目标锁定不得被错误建模为伤害攻击');
    for(const [name,action] of [['解体指令',slash],['解体拆除',insert]])
      if(!action||action.name!==name||action.element!=='Physical'||action.target!=='single'||action.hitEnergy!==10||
        action.toughness!==10||!eq(action.terms,[{scaling:'atk',multiplier:2.5}]))fail(name+' 须为 2.5 倍物理单体攻击');
    if(!Array.isArray(u.enemyMechanicNotes)||u.enemyMechanicNotes.length!==6||u.policy?.autoUltimate!==false)
      fail('裂伤结算、OneMorePerTurn、护盾转火、击破 / 动画与变体缺口说明缺失');
    if(!eq(k.sourceHashes,{ai:'7a0d3548bbef77ed7f426f5689145a174b2edd52',character:'20542b3095a4ec9ca9dd388df633354f25b25727',
      ability:'b24b234e209cfe17bbfdd5c24377b2f2a1a8d53e'}))
      fail('原始 AI / Character / Ability 配置哈希与核对版本不符');
    return errors;
  }
  if(u.monsterId===1023010&&k?.revision==='4.6-searing-prowler-partial-1'){
    if(k.id!==1023010||u.element!=='Fire'||Math.abs((u.panel?.critDmg??0)-.2)>1e-9)
      fail('炽燃徘徊者 enemyKit / 火属性 / 暴击伤害白值不匹配');
    if(!eq([k.skill01Id,k.skill01Params,k.skill02Id,k.skill02Params,k.skill06Id,k.skill06Params,
      k.skill07Id,k.skill07Params,k.passiveId,k.passiveParams],
      [102301004,[.2,100],102301005,[3,2],102301001,[3,.5,3],102301002,[4,2.5],102301003,[.06,3]]))
      fail('高温运转 / 飞舞烬火 / 赤红刀锋 / 燃焰斩击 / 熔解参数与 4.6 数据不符');
    if(!eq([k.burnRatio,k.burnDuration,k.burnExtraRatio,k.attackBuff,k.speedBuff,k.meltCritPerLayer,k.meltMaxLayers,k.meltDuration,
      k.burnModifier,k.burningModifier,k.meltModifier],
      [.5,3,2,.2,100,.06,5,3,'MCommon_DOT_Burn','Monster_W1_Mecha_Fire_Burning','Monster_W1_Mecha_Fire_Passive']))
      fail('灼烧 / 熔解 / 高温运转的数值或 modifier 名称与来源不符');
    const buff=u.actions?.skill01,ash=u.actions?.skill02,blade=u.actions?.skill06,slash=u.actions?.skill07;
    if(!buff||buff.name!=='高温运转'||buff.target!=='self'||buff.terms?.length||buff.hitEnergy!==0)
      fail('高温运转不得被错误建模为伤害攻击');
    if(!blade||blade.name!=='赤红刀锋'||blade.element!=='Fire'||blade.target!=='single'||blade.hitEnergy!==10||
      blade.toughness!==10||!eq(blade.terms,[{scaling:'atk',multiplier:3}]))
      fail('赤红刀锋须为 3.0 倍火属性单体攻击');
    if(!slash||slash.name!=='燃焰斩击'||slash.element!=='Fire'||slash.target!=='blast'||slash.repeatCount!==2||
      slash.hitEnergy!==7.5||slash.hitEnergyPerHit!==true||slash.toughness!==7.5||slash.adjacentToughness!==7.5||
      !eq(slash.terms,[{scaling:'atk',multiplier:2},{scaling:'atk',multiplier:1.25,target:'adjacent'}]))
      fail('燃焰斩击须为 2 波 ×（2.0 主目标 / 1.25 相邻）');
    if(!ash||ash.name!=='飞舞烬火'||ash.element!=='Fire'||ash.target!=='all'||ash.repeatCount!==2||
      ash.hitEnergy!==5||ash.hitEnergyPerHit!==true||ash.toughness!==5||!eq(ash.terms,[{scaling:'atk',multiplier:1.5}]))
      fail('飞舞烬火须为 2 段 1.5 倍群体攻击');
    if(!Array.isArray(u.enemyMechanicNotes)||u.enemyMechanicNotes.length!==7||u.policy?.autoUltimate!==false)
      fail('灼烧口径、熔解未还原增伤、击破冷却、Pursued 追加、变体与 AI 状态机说明缺失');
    if(!eq(k.sourceHashes,{ai:'73c666d45ba11c87d642cf295b80b6ab3c2ab491',character:'8bdc0dfed2cb0a9efba3cff4b6a116bcad471810',
      ability:'9538d3777954950c18263a968362ff958b5550d4',sharedModifier:'e043cdc0650741eb27049b0c1a0710bccb77618f'}))
      fail('原始 AI / Character / Ability / 公共 modifier 配置哈希与核对版本不符');
    return errors;
  }
  if(u.monsterId===4034010||u.monsterId===4034014){
    const fantastic=u.monsterId===4034014;
    if(k?.id!==u.monsterId||k?.revision!=='4.6-fire-prowler-1')fail('盗火行者未登记或修订号不符');
    if(u.childId!==u.monsterId)fail('场景 childId 不属于盗火行者');
    if(!eq([k.skill01Params,k.skill02Params,k.skill03Params,k.skill04Params,k.skill05Params,k.skill07Params],
      fantastic?[[4,2,0,8,.05],[3],[0],[8,0,1.5],[1,1,3],[1,.4,3]]
        :[[4,2,.05,8,.05],[3],[.5],[8,.05,2.5],[2,1,2],[1,1.6,3]]))
      fail('Skill01..07 的 MonsterSkillConfig 参数与 4.6 源数据不符');
    if(k.fantasticStory!==fantastic||k.resetToughnessOnHpBarChange!==true||
      !eq([k.phaseOneSummonCount,k.phaseTwoSummonCount,k.assistCountPhaseOne,k.assistCountPhaseTwo,k.timePowerInitial],
        [2,4,2,4,8]))fail('FantasticStory 门控、双血条韧性重置或召唤 / 助战 / TimePower 常量不符');
    if(!Number.isInteger(u.hpCount)||u.hpCount<1||!Array.isArray(u.phaseRatios)||u.phaseRatios.length!==u.hpCount)
      fail('生命阶段数量与 phaseRatios 不一致');
    const s1=u.actions?.skill01,s2=u.actions?.skill02,s3=u.actions?.skill03,s4=u.actions?.skill04,
      s5=u.actions?.skill05,s6=u.actions?.skill06,s7=u.actions?.skill07;
    if(!s1||s1.name!=='亡死的黑云'||s1.element!=='Physical'||s1.target!=='blast'||s1.hitEnergy!==10||
      s1.toughness!==10||s1.adjacentToughness!==10||
      !eq(s1.terms,[{scaling:'atk',multiplier:4},{scaling:'atk',multiplier:2,target:'adjacent'}]))
      fail('亡死的黑云须为 4.0 主目标 / 2.0 相邻、每段削韧 10');
    if(!s2||s2.name!=='将尽的命数'||s2.target!=='all'||s2.hitEnergy!==10||s2.toughness!==10||
      !eq(s2.terms,[{scaling:'atk',multiplier:3}]))fail('将尽的命数须为 3.0 倍群体攻击、削韧 10');
    if(!s3||s3.name!=='相混的道途'||s3.target!=='self'||s3.terms?.length||
      !s4||s4.name!=='沉默的悲叹'||s4.target!=='self'||s4.terms?.length)
      fail('相混的道途 / 沉默的悲叹须为无伤害的自身动作');
    if(!s5||s5.name!=='却是必要的苦难'||s5.target!=='all'||s5.terms?.length)
      fail('却是必要的苦难的逐段伤害须在运行时按 TimePower / AttackCount 结算');
    if(!s6||s6.name!=='幽冥的悼念'||s6.target!=='blast'||s6.toughness!==0||
      !eq(s6.terms,[{scaling:'atk',multiplier:4},{scaling:'atk',multiplier:2,target:'adjacent'}]))
      fail('幽冥的悼念须以 4.0 / 2.0 倍助战且不削韧');
    if(!s7||s7.name!=='莫因舍弃而哭泣'||s7.target!=='all'||s7.toughness!==15||s7.hitEnergy!==15||
      !eq(s7.terms,[{scaling:'atk',multiplier:3}]))fail('莫因舍弃而哭泣须为 3.0 倍、削韧 15 的群体攻击');
    if(fantastic){
      if(k.vesselBlueprints!==null)fail('异相仲裁盗火行者受 !FantasticStory 门控，不应携带召唤模板');
    }else{
      const vb=k.vesselBlueprints;
      if(!vb?.a||!vb?.b||!vb?.c||vb.a.childId!==403202001||vb.b.childId!==403202002||vb.c.childId!==403202003)
        fail('三种残破容器的召唤模板缺失');
      // 只有 403202003 在 MonsterSkillConfig 里有 PassiveSkill01 行（[1,0.06]）；
      // 403202001 / 403202002 缺该行，PassiveSkillInitiate 的 LoseHPByRatio 取 0 → Floor 1。
      if(vb.a.enemyKit?.vesselKind!=='a'||vb.a.enemyKit?.hpCostRatio!==0||vb.b.enemyKit?.hpCostRatio!==0||
        vb.c.enemyKit?.hpCostRatio!==.06)fail('容器入场的生命消耗比例（403202001/403202002 无 PassiveSkill01 行 = 0、403202003 = 6%）与源数据不符');
      if(vb.a.cannotAct!==true||vb.b.cannotAct!==true||vb.c.cannotAct!==true)
        fail('残破容器不应自主行动');
      if(vb.a.enemyKit?.assist?.main!==.5||vb.a.enemyKit?.assist?.adjacent!==.25||vb.b.enemyKit?.assist?.main!==.5)
        fail('容器助战倍率与幽冥的悼念不符');
    }
    if(u.policy?.autoUltimate!==false||!Array.isArray(u.enemyMechanicNotes)||u.enemyMechanicNotes.length!==10)
      fail('终结技设置或盗火行者机制说明缺失');
    return errors;
  }
  if(u.monsterId===4032024){
    if(k?.id!==4032024||k?.revision!=='4.6-broken-container-1'||u.childId!==4032024)fail('残破容器未登记或 childId 不符');
    if(!eq([k.aiSequence,k.skill02Params,k.skill01Params],[ [403202402],[1.6,.6,.3,.2],[1.6,1] ]))
      fail('残破容器的 AI 序列或技能参数与 4.6 本地索引不符');
    const a=u.actions?.skill,s1=u.actions?.skill01;
    if(!a||a.name!=='共祭•将尽的命数'||a.element!=='Physical'||a.target!=='all'||a.hitEnergy!==5||a.toughness!==5||
      !eq(a.terms,[{scaling:'atk',multiplier:1.6}]))fail('共祭•将尽的命数须为 1.6 倍群体攻击');
    if(!s1||s1.name!=='共祭•亡死的黑云'||s1.target!=='blast'||
      !eq(s1.terms,[{scaling:'atk',multiplier:1.6},{scaling:'atk',multiplier:1,target:'adjacent'}]))
      fail('共祭•亡死的黑云须为 1.6 / 1.0 的震击');
    if(u.policy?.autoUltimate!==false||!u.unsupported?.some(x=>x.includes('侵蚀')))
      fail('终结技设置或侵蚀 / 焕新缺口标记缺失');
    return errors;
  }
  if(u.monsterId!==8012010||k?.id!==8012010||k?.revision!=='4.6-reaver-1')return [u.name+'：敌人行为尚未登记'];
  if(!eq([k.speedPerLayer,k.speedDuration,k.speedLayers],[.35,2,3]))fail('速度被动与正式服不符');
  for(const [key,mult,shares,hitEnergy,target] of [['basic',2.5,[.25,.25,.5],10,'single'],['skill',1.5,[.2,.2,.2,.4],5,'blast']]){const a=u.actions?.[key];
    if(!a||!eq(a.hitShares,shares)||a.hitEnergy!==hitEnergy||a.hitEnergyPerHit!==true||a.element!=='Imaginary'||a.target!==target||a.terms?.[0]?.multiplier!==mult||key==='skill'&&a.terms?.[1]?.multiplier!==mult)fail(key+' 攻击规则与正式服不符');
  }
  return errors;
}
