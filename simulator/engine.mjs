import {resistsStatus} from './status-resistance.mjs';
// Pure deterministic event simulation. No wall clock, DOM, or game-client automation.
// Distances are kept in the 10000-unit action gauge: changing speed preserves progress.
import { computeHit } from '../core/damage.mjs';
import { kitRuntime } from './kit-runtime.mjs';
import { KIT_IDS,KIT_REVISION,maximumSP,validateKitActor } from './kits.mjs';
import { breakRuntime,STANDARD_BREAK_ELEMENTS } from './breaks.mjs';
import {validateEnemyActor} from './encounters.mjs';
import {knownMechanicsGaps,battleMechanicsWarnings} from './mechanics-status.mjs';
import {actionEventRuntime} from './action-events.mjs';
import {BREAK_BASE} from './game-data.mjs';
export const ACTION_DISTANCE=10000;
const EPS=1e-8, clone=(o)=>JSON.parse(JSON.stringify(o));
// 4.6 Elation-skill participation order; separate from formation slots because traces compare it.
const ELATION_PARTICIPANT_IDS=Object.freeze({1503:104,1502:116,8009:120,8010:120,1501:144,1505:146,1513:156,1506:999});
const sameTimeOrder=(a,c)=>(a.distance<=EPS&&c.distance<=EPS?(c.advanceOrder??0)-(a.advanceOrder??0):0)||((a.side==='enemy'?1:0)-(c.side==='enemy'?1:0))||a.order-c.order;
const finite=(v,label,min=0)=>{if(!Number.isFinite(v)||v<min)throw new Error(label+'无效');return v;};
const object=v=>v!=null&&typeof v==='object'&&!Array.isArray(v);
const BUFF_KEYS=new Set(['atk','def','hp','speed','critRate','critDmg','breakEffect','breakEfficiency','effectHit','effectRes','dotRes','energyRegen','healingBoost','incomingHeal','shieldBoost','elation','speedPct','atkPct','hpPct','defPct','dmgBoost','defIgnore','defShred','vuln','dmgReduction','resPen',...['Physical','Fire','Ice','Thunder','Wind','Quantum','Imaginary'].map(e=>'elemDmg.'+e)]);
export function validateBattle(config) {
  if(!config||typeof config!=='object'||!Array.isArray(config.units))return ['战斗配置的 units 须为数组'];
  const errors=[]; const units=config?.units??[];
  const himeko=units.find(t=>t?.side==='ally'&&t.characterId===1510);
  const hasHimekoSupport=!!himeko;
  const hasAction=(u,key)=>!!u?.actions?.[key]||(key==='supportSkill'&&hasHimekoSupport&&u?.side==='ally'&&u.characterId!==1510);
  const himekoExtraTurnEligible=u=>!!himeko&&u?.side==='ally'&&u.characterId!==1510&&!!(u.astralExpress||[8009,8010].includes(u.characterId)||((himeko.kit?.eidolon??0)>=2));
  if(!units.length||units.length>54)errors.push('需要 1～54 个单位（每波最多五个敌人）');
  const waves=[...new Set(units.filter(u=>u?.side==='enemy').map(u=>u.wave??1))].sort((a,c)=>a-c);
  if(waves.some((w,i)=>!Number.isInteger(w)||w!==i+1||w>10))errors.push('敌方波次须从 1 开始连续编号，最多十波');
  for(const wave of waves)if(units.filter(u=>u?.side==='enemy'&&!u.mechanicReserve&&(u.wave??1)===wave).length>5)errors.push('每波最多五个敌人');
  if(config.waveMode!=null&&!['moc','continuous'].includes(config.waveMode))errors.push('波次行动条规则须为 moc 或 continuous');
  if(config.endgameSpawnPlan!=null){
    const plan=config.endgameSpawnPlan;
    if(!object(plan)||plan.type!=='orderedEnemyWaves'||!Array.isArray(plan.waves)||!plan.waves.length||
      !Number.isInteger(plan.initialEnemyCount)||plan.initialEnemyCount<1||config.waveMode!=='continuous'){
      errors.push('动态敌人波次配置无效');
    }else{
      const spawnIds=new Set();
      const configuredIds=new Set(units.map(u=>u?.id).filter(id=>typeof id==='string'));
      const initialEnemies=units.filter(u=>u?.side==='enemy');
      if(!plan.waves[0]||!Array.isArray(plan.waves[0].units)||plan.initialEnemyCount>plan.waves[0].units.length||
        initialEnemies.length!==plan.initialEnemyCount||
        plan.waves[0].units.slice(0,plan.initialEnemyCount).some((u,i)=>u?.id!==initialEnemies[i]?.id)||
        plan.initialEnemyCount>plan.waves[0].maxTeammateCount)
        errors.push('动态敌人首批名单须与初始敌方单位一致');
      for(const [waveIndex,wave] of plan.waves.entries()){
        if(!object(wave)||typeof wave.id!=='string'||!wave.id||!Array.isArray(wave.units)||
          !Number.isInteger(wave.maxTeammateCount)||wave.maxTeammateCount<1||wave.maxTeammateCount>5||
          wave.units.length===0||wave.units.some(u=>!object(u)||u.side!=='enemy'||typeof u.id!=='string'||!u.id)){
          errors.push('动态敌人第 '+(waveIndex+1)+' 波名单无效');continue;
        }
        if(waveIndex>0&&wave.units.length>100)errors.push('动态敌人单波名单不能超过 100 个单位');
        for(let unitIndex=0;unitIndex<wave.units.length;unitIndex++){
          const u=wave.units[unitIndex];
          if(spawnIds.has(u.id))errors.push('动态敌人单位 ID 必须唯一：'+u.id);
          spawnIds.add(u.id);
          const isInitial=waveIndex===0&&unitIndex<plan.initialEnemyCount&&initialEnemies[unitIndex]?.id===u.id;
          if(configuredIds.has(u.id)&&!isInitial)errors.push('动态敌人单位 ID 与初始单位冲突：'+u.id);
        }
        if(wave.gateUnitId!=null&&(!wave.units.some(u=>u.id===wave.gateUnitId)||typeof wave.gateUnitId!=='string'))
          errors.push('动态敌人波次门槛单位须属于本波名单');
      }
    }
  }
  if(config.endgameRules!=null&&!Array.isArray(config.endgameRules))errors.push('终局场景规则须为数组');
  for(const rule of config.endgameRules??[]){
    if(object(rule)&&rule.type==='mocAhaCycle'&&rule.mode==='moc'&&
      Number.isFinite(rule.laughterPerUltimate)&&rule.laughterPerUltimate>0&&
      Number.isFinite(rule.fixedPunchline)&&rule.fixedPunchline>0)continue;
    if(object(rule)&&rule.type==='enemyCountScaleEffect'&&rule.mode==='as'&&rule.teamSide==='enemy'&&
      Number.isSafeInteger(rule.excludedMonsterId)&&Number.isInteger(rule.maxStacks)&&rule.maxStacks>=1&&rule.maxStacks<=5&&
      Number.isFinite(rule.damageReductionPerEnemy)&&rule.damageReductionPerEnemy>=0&&rule.damageReductionPerEnemy<1&&
      Number.isFinite(rule.damageBoostPerEnemy)&&rule.damageBoostPerEnemy>=0&&Number.isSafeInteger(rule.sourceSkillId))continue;
    if(object(rule)&&rule.type==='enemyDamageOnShieldedTarget'&&rule.mode==='anomaly'&&
      ['ally','enemy'].includes(rule.attackerSide)&&['ally','enemy'].includes(rule.targetSide)&&
      Number.isFinite(rule.damageBoost)&&rule.damageBoost>=0&&typeof rule.sourceTag==='string'&&typeof rule.sourceText==='string')continue;
    errors.push('终局场景规则包含无效的机制配置');
  }
  if(config.encounterGroups!=null&&!Array.isArray(config.encounterGroups))errors.push('遭遇机制组须为数组');
  const unitById=new Map(units.filter(object).map(u=>[u.id,u]));
  const groupById=new Map();
  for(const group of config.encounterGroups??[]){
    if(!object(group)||typeof group.id!=='string'||!group.id||groupById.has(group.id)){
      errors.push('遭遇机制组须有唯一字符串 ID');continue;
    }
    groupById.set(group.id,group);
    if(!Array.isArray(group.memberIds)||!group.memberIds.length||new Set(group.memberIds).size!==group.memberIds.length)errors.push(group.id+'须列出不重复的假死成员');
    for(const id of group.memberIds??[]){
      const member=unitById.get(id);
      if(!member||member.side!=='enemy')errors.push(group.id+'假死成员不存在或不是敌人：'+id);
      else if(member.feignDeathGroup!==group.id)errors.push(id+'未绑定遭遇机制组 '+group.id);
    }
    if(!Array.isArray(group.activateOnClear)||!group.activateOnClear.length)errors.push(group.id+'须指定清空后的登场单位');
    for(const entry of group.activateOnClear??[]){
      const id=typeof entry==='string'?entry:entry?.unitId,target=unitById.get(id);
      if(!target||target.side!=='enemy')errors.push(group.id+'清空后登场单位不存在或不是敌人：'+id);
      else if(!target.mechanicReserve)errors.push(id+'须标记为 mechanicReserve 才能延后登场');
      if(entry&&typeof entry==='object'&&entry.hpRatio!=null&&(!Number.isFinite(entry.hpRatio)||entry.hpRatio<=0||entry.hpRatio>1))errors.push(group.id+'登场生命比例须为 (0, 1]');
      if(entry&&typeof entry==='object'&&entry.initialAdvance!=null&&(!Number.isFinite(entry.initialAdvance)||entry.initialAdvance<0||entry.initialAdvance>1))errors.push(group.id+'登场行动提前须为 0～1');
      if(entry&&typeof entry==='object'&&['resetToughness','resetTurns'].some(key=>entry[key]!=null&&typeof entry[key]!=='boolean'))errors.push(group.id+'登场重置选项须为布尔值');
    }
  }
  for(const u of units){
    if(u?.mechanicReserve&&u.side!=='enemy')errors.push(u.id+' mechanicReserve 仅适用于敌人');
    if(u?.feignDeathGroup!=null&&(!groupById.has(u.feignDeathGroup)||!groupById.get(u.feignDeathGroup).memberIds?.includes(u.id)))errors.push(u.id+'假死组引用无效');
  }
  if(!units.some(u=>u?.side==='ally')||!units.some(u=>u?.side==='enemy'))errors.push('需要我方与敌方单位');
  if(units.filter(u=>u?.side==='ally'&&!u.memospriteOwner).length>4)errors.push('我方最多四个角色');
  if(config.requiredAllies===4&&units.filter(u=>u?.side==='ally'&&!u.memospriteOwner).length!==4)errors.push('四人自动战斗必须配置四名队员');
  const ids=new Set(),characters=new Set();
  for(const u of units){
    if(!object(u)){errors.push('单位须为对象');continue;}
    if(typeof u.id!=='string'||!u.id||ids.has(u.id))errors.push('单位 ID 必须为唯一字符串');ids.add(u.id);
    if(u.side==='ally'&&u.characterId){if(characters.has(u.characterId))errors.push('同一角色不能重复加入队伍');characters.add(u.characterId);}
    if(!['ally','enemy'].includes(u.side))errors.push(u.id+'阵营无效');
    if(u.build!=null){
      if(typeof u.build!=='object'||Array.isArray(u.build))errors.push(u.id+'配装须为对象');
      else {
        for(const [key,min,max] of [['level',1,80],['lightconeLevel',1,80],['superimpose',1,5],['eidolon',0,6]])if(u.build[key]!=null&&(!Number.isInteger(u.build[key])||u.build[key]<min||u.build[key]>max))errors.push(u.id+'.build.'+key+' 无效');
        for(const key of ['characterId','lightconeId'])if(u.build[key]!=null&&(!Number.isInteger(u.build[key])||u.build[key]<=0))errors.push(u.id+'.build.'+key+' 无效');
      }
    }
    if(u.memospriteOwner&&!units.some(t=>t.id===u.memospriteOwner&&t.side===u.side&&!t.memospriteOwner&&t!==u))errors.push(u.id+'忆灵须绑定同阵营召唤者');
    if(u.memospriteOwner&&units.filter(t=>t.memospriteOwner===u.memospriteOwner).length>1)errors.push(u.id+'同一角色不能同时有多个忆灵');
    for(const k of ['hp','atk','def','speed'])if(!Number.isFinite(u.panel?.[k])||u.panel[k]<(k==='hp'||k==='speed'?EPS:0))errors.push(u.id+'面板 '+k+' 无效');
    if(u.hpCount!=null&&(!Number.isInteger(u.hpCount)||u.hpCount<1||u.hpCount>10))errors.push(u.id+'生命阶段数无效');
    if(u.phaseRatios!=null&&(!Array.isArray(u.phaseRatios)||u.phaseRatios.length!==(u.hpCount??1)||u.phaseRatios.some(r=>!Number.isFinite(r)||r<=0)))errors.push(u.id+'生命阶段比例须与阶段数一致且均大于零');
    if(!Number.isFinite(u.level)||u.level<1||u.level>100)errors.push(u.id+'等级无效');
    if(!u.actions?.basic)errors.push(u.id+'缺少基础动作');
    if(!Number.isFinite(u.energyMax??0)||(u.energyMax??0)<0)errors.push(u.id+'能量上限无效');
    if(!Number.isFinite(u.energy??0)||(u.energy??0)<0||(u.energy??0)>(u.energyMax??0))errors.push(u.id+'初始能量无效');
    for(const k of ['energyRegen','effectHit','effectRes','healingBoost'])if(u.panel?.[k]!=null&&(!Number.isFinite(u.panel[k])||u.panel[k]<0||(k==='effectRes'&&u.panel[k]>1)))errors.push(u.id+'面板 '+k+' 无效');
    for(const k of ['critRate','critDmg'])if(u.panel?.[k]!=null&&!Number.isFinite(u.panel[k]))errors.push(u.id+'面板 '+k+' 无效');
    for(const k of ['aggro','toughnessMax','onHitEnergy','killEnergy','controlRes'])if(u[k]!=null&&(!Number.isFinite(u[k])||u[k]<0||k==='controlRes'&&u[k]>1))errors.push(u.id+'.'+k+' 无效');
    if(u.standardBreak){if(!['normal','elite'].includes(u.rank))errors.push(u.name+'须指定普通或精英敌人类型');const elements=new Set(units.filter(t=>t?.side!==u.side).flatMap(t=>Object.values(t.actions??{}).map(a=>a?.element??t.element)));for(const element of u.weaknesses??[])if(elements.has(element)&&!STANDARD_BREAK_ELEMENTS.includes(element))errors.push(u.name+'标准击破尚未实现 '+element);}
    if(config.strict&&u.toughnessMax>0&&!u.standardBreak){const elements=new Set(units.filter(t=>t?.side!==u.side).map(t=>t?.element));for(const element of u.weaknesses??[])if(elements.has(element)&&!u.breakRule?.[element]&&!u.breakRule?.all)errors.push(u.name+'缺少 '+element+' 击破规则');}
    if(u.initialAdvance!=null&&(!Number.isFinite(u.initialAdvance)||u.initialAdvance<0||u.initialAdvance>1))errors.push(u.id+'初始行动提前须为 0～1');
    if(u.currentHp!=null&&(!Number.isFinite(u.currentHp)||u.currentHp<=0||u.currentHp>(u.panel?.hp??0)))errors.push(u.id+'初始生命值无效');
    if(u.unsupported!=null&&!Array.isArray(u.unsupported))errors.push(u.id+'机制缺口须为数组');
    if(config.strict && Array.isArray(u.unsupported) && u.unsupported.length)errors.push(u.name+'：'+u.unsupported.join('、'));
    if(config.strict&&knownMechanicsGaps(u).length)errors.push(u.name+'：严格验算暂不可用（'+knownMechanicsGaps(u).join('；')+'）。可明确选择近似试算查看有限模型结果。');
    if(config.strict&&u.side==='enemy')errors.push(...validateEnemyActor(u));
    if(config.strict&&u.characterId&&(!KIT_IDS.includes(u.characterId)||u.kit?.revision!==KIT_REVISION||u.kit.characterId!==u.characterId))errors.push(u.name+'：缺少已登记的可执行角色机制，请重新应用角色配装');
    if(u.kit){
      if(!KIT_IDS.includes(u.characterId)||u.kit.characterId!==u.characterId||u.kit.revision!==KIT_REVISION)errors.push(u.name+'角色机制版本无效');
      if(!Number.isInteger(u.kit.eidolon)||u.kit.eidolon<0||u.kit.eidolon>6)errors.push(u.name+'机制星魂无效');
      for(const key of ['Normal','BPSkill','Ultra','Talent','Maze'])if(!Array.isArray(u.kit.params?.[key])||u.kit.params[key].some(v=>!Number.isFinite(v)))errors.push(u.name+'机制参数缺失');
      if(u.policy?.allyTargetId&&!units.some(t=>t.id===u.policy.allyTargetId&&t.side===u.side))errors.push(u.name+'辅助目标不存在或阵营错误');
      if(u.policy?.skillLimit!=null&&(!Number.isInteger(u.policy.skillLimit)||u.policy.skillLimit<1||u.policy.skillLimit>5))errors.push(u.name+'连续战技上限须为 1～5');
      // 精度模式不改变已登记角色的数值合同；近似模式仅放行明确标注的机制缺口。
      errors.push(...validateKitActor(u));
    }
    if(!object(u.actions)){errors.push(u.id+'动作集合须为对象');continue;}
    const rotation=u.policy?.rotation;
    const himekoSupportAction=hasHimekoSupport&&u.side==='ally'&&u.characterId!==1510;
    if(u.policy?.turnPlan!=null){const plan=u.policy.turnPlan;
      if(!Array.isArray(plan)||plan.length>100)errors.push(u.name+' 逐回合操作须为最多 100 项的数组');
      else {const turns=new Set();for(const item of plan){
        const validKey=['basic','skill'].includes(item?.key)||(item?.key==='supportSkill'&&himekoSupportAction);
        const a=u.actions?.[item?.key]??(item?.key==='supportSkill'&&himekoSupportAction?{target:'single'}:null);
        if(!item||!Number.isInteger(item.turn)||item.turn<1||turns.has(item.turn)||!validKey||!a)errors.push(u.name+' 逐回合操作的回合或动作无效');turns.add(item?.turn);
        if(item?.targetId&&!units.some(t=>t.id===item.targetId&&t.side===(['self','ally','allies','lowestAlly'].includes(a?.target)?u.side:tSide(u))))errors.push(u.name+' 逐回合操作目标不存在或阵营错误');
      }}
    }
    if(u.policy?.ultimateTiming!=null&&!['auto','afterAction','afterTurn'].includes(u.policy.ultimateTiming))errors.push(u.name+'终结技时机须为角色默认、动作后或回合结束后');
    if(u.policy?.poemStrategy!=null&&!['auto','fixed'].includes(u.policy.poemStrategy))errors.push(u.name+'献诗策略须为 auto / fixed');
    if(rotation!=null&&(!Array.isArray(rotation)||!rotation.length||rotation.some(k=>typeof k!=='string'||(!object(u.actions[k])&&!(k==='supportSkill'&&himekoSupportAction))||k==='ultimate')))errors.push(u.id+'动作循环须引用已配置的普通动作');
    if(u.kit&&Array.isArray(rotation)&&rotation.some(k=>!['basic','skill'].includes(k)&&!(k==='supportSkill'&&himekoSupportAction)))errors.push(u.name+'普通动作循环只能使用 basic / skill / 队伍已启用的 supportSkill；追加攻击和召唤物须由机制触发');
    for(const [key,a] of Object.entries(u.actions)){
      if(!object(a)){errors.push(u.id+'动作须为对象');continue;}
      if(config.strict&&units.some(t=>t?.kit)&&u.side==='enemy'&&a.terms?.length&&!Number.isFinite(a.hitEnergy))errors.push(u.name+' '+key+' 缺少受击回能数值（每个受击目标、每次攻击）');
      if(a.target!=null&&!['self','ally','allies','lowestAlly','all','blast','single','sweep'].includes(a.target))errors.push(u.id+'动作目标无效');
      for(const k of ['energyCost','energyGain','spCost','spGain','hpCostRatio','toughness','adjacentToughness','bounceToughness','superBreak'])if(a[k]!=null&&(!Number.isFinite(a[k])||a[k]<0))errors.push(`${u.id}.${key}.${k} 无效`);
      if(u.kit&&a.superBreak!=null)errors.push(u.name+'没有已登记的超击破来源，不能直接添加系数');
      if(key==='ultimate'&&(!Number.isFinite(a.energyCost)||a.energyCost<=0||a.energyCost>(u.energyMax??0)))errors.push(u.id+'终结技必须指定有效的能量消耗');
      if(a.hpCostRatio>1)errors.push(u.id+'生命消耗比例不能超过 1');
      if(a.targetId!=null&&!units.some(t=>t?.id===a.targetId&&t.side===((['ally','allies','lowestAlly','self'].includes(a.target))?u.side:tSide(u))))errors.push(u.id+'动作目标不存在或阵营错误');
      if(a.terms!=null&&!Array.isArray(a.terms)){errors.push(u.id+'伤害项须为数组');continue;}
      for(const term of a.terms??[])if(!term||!['atk','hp','def'].includes(term.scaling)||!Number.isFinite(term.multiplier)||term.multiplier<0)errors.push(`${u.id}.${key} 倍率无效`);
      if(a.hitShares&&(!Array.isArray(a.hitShares)||a.hitShares.some(x=>!Number.isFinite(x)||x<=0)||Math.abs(a.hitShares.reduce((x,y)=>x+y,0)-1)>EPS))errors.push(u.id+'分段比例总和须为 1');
      if(a.hitEnergy!=null&&(!Number.isFinite(a.hitEnergy)||a.hitEnergy<0))errors.push(`${u.id}.${key} 受击回能无效`);
      if(a.hitEnergyShares!=null&&(!Array.isArray(a.hitEnergyShares)||a.hitEnergyShares.length!==(a.hitShares?.length??1)||a.hitEnergyShares.some(x=>!Number.isFinite(x)||x<0)))errors.push(`${u.id}.${key} 分段受击回能比例无效`);
      if(a.bounceCount!=null&&(!Number.isInteger(a.bounceCount)||a.bounceCount<0))errors.push(u.id+'弹射次数无效');
      if(a.bounceTerms!=null&&(!Array.isArray(a.bounceTerms)||a.bounceTerms.some(t=>!object(t)||!['atk','hp','def'].includes(t.scaling)||!Number.isFinite(t.multiplier)||t.multiplier<0)))errors.push(u.id+'弹射倍率无效');
      if(a.bounceGroups!=null&&(!Array.isArray(a.bounceGroups)||a.bounceGroups.some(g=>!object(g)||!Number.isInteger(g.count)||g.count<0||!Array.isArray(g.terms)||g.terms.some(t=>!object(t)||!['atk','hp','def'].includes(t.scaling)||!Number.isFinite(t.multiplier)||t.multiplier<0))))errors.push(u.id+'分组弹射无效');
      if(a.effects!=null&&!Array.isArray(a.effects)){errors.push(u.id+'动作效果须为数组');continue;}
      for(const e of a.effects??[]){
        if(!e||typeof e!=='object'){errors.push(u.id+'效果须为对象');continue;}
        if(!['heal','shield','buff','advance','delay','dot','cleanse','extra','followup','laughter','punchline','hpConsume'].includes(e.type))errors.push(u.id+'未知动作效果 '+e.type);
        if(e.type==='buff'&&!BUFF_KEYS.has(e.key))errors.push(u.id+'未知增益属性 '+e.key);
        if(e.tickAt!=null&&!['start','end'].includes(e.tickAt))errors.push(u.id+'回合计时方式无效');
        if(e.target!=null&&!['self','allies','enemies','lowestAlly'].includes(e.target))errors.push(u.id+'效果目标无效');
        for(const k of ['value','multiplier','flat'])if(e[k]!=null&&(!Number.isFinite(e[k])||(e.type!=='buff'&&e[k]<0)))errors.push(u.id+'效果 '+k+' 无效');
        if(['buff','shield','dot'].includes(e.type)&&(!Number.isInteger(e.duration)||e.duration<1))errors.push(u.id+'持续回合数须为正整数');
        if(e.type==='dot'&&e.terms!=null&&(!Array.isArray(e.terms)||e.terms.some(t=>!object(t)||!['atk','hp','def'].includes(t.scaling)||!Number.isFinite(t.multiplier)||t.multiplier<0)))errors.push(u.id+'持续伤害倍率无效');
        if(['extra','followup'].includes(e.type)){
          const recipients=e.target==='allies'?units.filter(t=>t?.side===u.side):e.target==='enemies'?units.filter(t=>t?.side===tSide(u)):e.target==='self'?[u]:[];
          if(!recipients.length||recipients.some(t=>!object(t.actions?.[e.action])))errors.push(u.id+'追加或额外动作必须指定有对应动作的阵营 / 自身目标');
        }
      }
    }
  }
  if(!Number.isFinite(config.maxAV)||config.maxAV<=0||config.maxAV>3000)errors.push('行动值范围须为 0～3000');
  if(config.worldLevel!=null&&(!Number.isInteger(config.worldLevel)||config.worldLevel<1||config.worldLevel>6))errors.push('均衡等级须为1～6');
  if(!Number.isInteger(config.sp??3)||(config.sp??3)<0||(config.sp??3)>maximumSP(config))errors.push('初始战技点无效');
  if(!Number.isInteger(config.maxSP??5)||(config.maxSP??5)<1)errors.push('战技点上限须为正整数');
  if(config.critMode!=null&&!['expected','random','crit','noncrit'].includes(config.critMode))errors.push('暴击模式无效');
  if(config.seed!=null&&!Number.isInteger(config.seed))errors.push('随机种子须为整数');
  if(config.actionPlan!=null){
    if(!Array.isArray(config.actionPlan)||config.actionPlan.length>200)errors.push('录像操作轴须为最多 200 项的数组');
    else for(const [i,cmd]of config.actionPlan.entries()){
      const u=units.find(u=>u.id===cmd?.actor),after=cmd?.after,action=u?.actions?.[cmd?.key];
      const himekoControl=!!u&&u.characterId===1510&&['beam','pulse'].includes(cmd.key)&&after?.actor===u.id&&after?.key==='ultimate'&&after?.kind==='ultimate';
      if(!u||u.side!=='ally'||!action||!['basic','skill','ultimate'].includes(cmd.key)&&!himekoControl)errors.push('操作轴 '+i+' 须指定我方普攻、战技、终结技或姬子拓星者动作');
      if(u&&cmd.key==='ultimate'&&u.policy?.autoUltimate!==false)errors.push('操作轴 '+i+' 的手动终结技角色须关闭自动终结技');
      if(!after||!units.some(u=>u.id===after.actor&&hasAction(u,after.key))||!Number.isInteger(after.occurrence)||after.occurrence<1)errors.push('操作轴 '+i+' 缺少有效的动作后触发点');
      if(after?.key==='supportSkill'&&!units.some(u=>u.id===after.actor&&himekoExtraTurnEligible(u)))errors.push('姬子助战技后的额外回合仅适用于开拓同行；非开拓同行须姬子达到 E2');
      if(!['normal','continuation','ultimate','followup','technique','summon'].includes(after?.kind))errors.push('操作轴 '+i+' 须明确触发动作类型（奇袭首段不单独开放插入）');
      if(cmd?.targetId&&!units.some(t=>t.id===cmd.targetId&&t.side===(['self','allies','ally','lowestAlly'].includes(action?.target)?u?.side:tSide(u??{}))))errors.push('操作轴 '+i+' 目标不存在或阵营错误');
    }
    if(Array.isArray(config.actionPlan)){
      const groups=new Map();
      for(const cmd of config.actionPlan){if(!['beam','pulse'].includes(cmd?.key))continue;const id=cmd.actor+':'+cmd.after?.occurrence;const g=groups.get(id)??[];g.push(cmd.key);groups.set(id,g);}
      for(const [id,keys]of groups){const pulses=keys.filter(k=>k==='pulse').length,beams=keys.filter(k=>k==='beam').length;
        if(pulses>1||pulses===0&&beams!==6||pulses===1&&beams>=6||pulses===1&&keys.lastIndexOf('pulse')<keys.lastIndexOf('beam'))errors.push('姬子拓星者操作轴须选择至多5次光束后发动一次脉冲，或选择完整6次光束；已分组 '+id);
      }
    }
  }
  return [...new Set(errors)];
}
export function seededRandom(seed=1){let n=seed>>>0;return ()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};}
const elationAlly=u=>u?.side==='ally'&&!!u.actions?.elation&&['欢愉','Elation'].includes(u.path);
function elationTeam(b){return b.units.filter(elationAlly);}
function currentAhaSpeed(b){
  const speeds=elationTeam(b).filter(alive).map(u=>combatPanel(u).speed).sort((a,c)=>c-a);
  // PointB2 的速度修正附着于阿哈并持续到当前阿哈时刻结束，不随发放者存活状态变化。
  const granted=b.ahaSpeedBonus??0;
  return 80+speeds.reduce((sum,speed,i)=>sum+speed/(5*2**i),0)+granted;
}
function certifiedBangerDuration(u,base=2){
  const id=u.kit?.characterId;
  if(id===1503)return null;
  if(base==null)return null;
  let extra=0;
  if(id===1502)extra+=u.kit.trace?.['3']?.[1]??0;
  if(id===1505&&(u.kit.eidolon??0)>=6)extra++;
  if(id===1513)extra++;
  return Math.max(1,base+extra);
}
const punchCapOf=u=>u?.kit?.characterId===1503?(u.kit.params?.Talent?.[2]??Infinity):Infinity;
function addCertifiedBanger(b,to,amount,reason='阿哈时刻结算',source='aha:ally'){
  if(!alive(to)||!(amount>0))return;
  // 150304 天赋：真珠的【好活当赏】持有上限为 #3（4.6 = 50 点）。自然阿哈结算与
  // 战斗开始的发放也必须走同一上限，超出部分既不进资源也不生成到期批次。
  const cap=punchCapOf(to),current=to.resources['好活当赏']??0,next=Math.min(cap,current+amount),stacks=next-current;
  if(!(stacks>0))return;
  const seq=(to.resources['好活当赏批次序号']??0)+1;to.resources['好活当赏批次序号']=seq;
  const id='punchline:'+to.id+':'+seq;
  to.resources['好活当赏']=next;
  to.buffs.push({type:'buff',id,name:'好活当赏',key:'marker',value:0,remaining:certifiedBangerDuration(to),
    tickOwner:to.id,tickAt:'end',appliedTurn:to.turns,source,tag:'punchline',stacks});
  record(b,'resource',to,{name:'好活当赏',value:next,reason,added:stacks});
}
function startElationBattle(b){
  const team=elationTeam(b);b.aha={id:'aha:ally',name:'阿哈',side:'ally',kind:'aha_actor',order:-1,distance:ACTION_DISTANCE,speed:80,active:team.length>0};
  if(!team.length)return;
  b.laughter.ally+=team.length;
  b.rules?.laughterGained?.(b,'ally',team.length,null,'战斗开始 · 初始笑点');
  // 战斗开始的 20 点好活当赏同样经过绯英【瞰众乐】转化：参演编号低于 1505 的队友，
  // 其获得量的 50%（E2 再 +50%）转给绯英（EVA:3587-3869）。
  const ev=team.find(u=>u.kit?.characterId===1505);
  for(const u of team){
    let converted=0;
    if(ev&&u!==ev){
      const p06=ev.kit.trace?.['1']?.[4]??0;
      const ri=u.participantId??ELATION_PARTICIPANT_IDS[u.kit?.characterId];
      const ei=ev.participantId??ELATION_PARTICIPANT_IDS[1505];
      if(p06>0&&Number.isFinite(ri)&&Number.isFinite(ei)&&ri<ei){
        const e2=ev.kit.eidolon>=2?(ev.kit.ranks?.[2]?.[1]??0):0;
        converted=Math.min(20,20*p06*(1+e2));
      }
    }
    addCertifiedBanger(b,u,20-converted,converted>0?'战斗开始 · 瞰众乐转出':'战斗开始','battle:start');
    if(converted>0)addCertifiedBanger(b,ev,converted,'瞰众乐 · 战斗开始转化','battle:start');
  }
  b.aha.speed=currentAhaSpeed(b);
}
function instantiateUnit(source,index,activeOverride=undefined){
  const u={...clone(source),active:activeOverride??(source.side==='ally'||((source.wave??1)===1&&source.active!==false&&!source.mechanicReserve)),
    order:index,participantId:source.participantId??ELATION_PARTICIPANT_IDS[source.kit?.characterId],hpPhase:1,hpCount:source.hpCount??1,
    phaseRatios:source.phaseRatios??Array.from({length:source.hpCount??1},()=>1),
    hp:source.currentHp??source.panel.hp*(source.phaseRatios?.[0]??1),energy:source.energy??0,
    distance:ACTION_DISTANCE*(1-Math.max(0,Math.min(1,source.initialAdvance??0))),
    toughness:source.toughnessMax??0,broken:false,resources:{},shields:[],buffs:[],dots:[],turns:0};
  return u;
}
function attachUnitToBattle(b,u){Object.defineProperty(u,'battle',{value:b});b.units.push(u);return u;}

export function createBattle(config) {
  const errs=validateBattle(config);if(errs.length)throw new Error(errs.join('；'));
  const b={config:clone(config),planUsed:[],planQueued:[],av:0,wave:1,waveStartAV:0,cyclesSpent:0,laughter:{ally:0,enemy:0},ahaSpeedBonus:0,sp:config.sp??3,maxSP:maximumSP(config),turns:0,eventCount:0,queue:[],pendingActions:[],summons:[],actionEvents:[],log:[],random:seededRandom(config.seed??1),
    encounterGroups:new Map((config.encounterGroups??[]).map(g=>[g.id,{...clone(g),completed:false}])),
    units:config.units.map((u,i)=>instantiateUnit(u,i)),
    endgameSpawnPlan:config.endgameSpawnPlan?{source:clone(config.endgameSpawnPlan),waveIndex:0,cursor:config.endgameSpawnPlan.initialEnemyCount}:null};
  for(const u of b.units)Object.defineProperty(u,'battle',{value:b});
  b.eventActions=actionEventRuntime({record,execute:(b,u,e)=>useAction(b,u,e.key,'extra',e.targetId),live:alive,isFrozen:frozen});
  b.rules=kitRuntime({record,energy,advance,delay,damageTo,combatPanel,useAction,scheduleActionEvents,cancelActionEvents,updateActionEventSpeed,trueDamage:(b,u,to,amount,name)=>receiveDamage(b,u,to,amount,'true',{name})});b.breaks=breakRuntime({record,receiveDamage,delay,combatPanel});b.rules.onStart(b);startElationBattle(b);
  // 第 1 波次同样走 wave_start 事件（秘技 / 逐波次光锥与角色回能在此结算）。
  b.rules.onWaveStart(b);return b;
}
const alive=(u)=>u.active!==false&&u.hp>EPS;
function enterFeignedDeath(b,from,to){
  const group=b.encounterGroups?.get(to.feignDeathGroup);
  if(!group||group.completed)throw new Error(to.name+'假死组缺少有效的遭遇控制器');
  to.hp=0;to.active=false;to.feignedDead=true;
  record(b,'mechanic',from??to,{name:'【假死】',target:to.id,groupId:group.id});
  const members=group.memberIds.map(id=>b.units.find(u=>u.id===id));
  if(members.every(u=>u?.feignedDead)){
    group.completed=true;
    for(const entry of group.activateOnClear){
      const spec=typeof entry==='string'?{unitId:entry}:entry,target=b.units.find(u=>u.id===spec.unitId);
      if(!target)continue;
      target.active=true;target.mechanicReserve=false;target.feignedDead=false;
      if(spec.hpRatio!=null)target.hp=combatPanel(target).hp*spec.hpRatio;
      if(spec.initialAdvance!=null)target.distance=ACTION_DISTANCE*(1-Math.max(0,Math.min(1,spec.initialAdvance)));
      if(spec.resetToughness===true){target.toughness=target.toughnessMax??0;target.broken=false;}
      if(spec.resetTurns===true)target.turns=0;
      record(b,'mechanic',target,{name:'合而为一 · 重新登场',groupId:group.id,hp:target.hp});
    }
    record(b,'mechanic',from??members[0],{name:'假死成员全部集齐 · 触发合体',groupId:group.id,members:group.memberIds});
  }
}
const waveCycle=av=>av<150-EPS?0:1+Math.floor(Math.max(0,av-150)/100);
function nextMocCycleBoundary(b){
  if(!(b.config.endgameRules??[]).some(rule=>rule.type==='mocAhaCycle'))return null;
  const localAV=Math.max(0,b.av-b.waveStartAV),nextLocal=localAV<150-EPS?150:150+100*waveCycle(localAV);
  return b.waveStartAV+nextLocal;
}
function advanceCombatTime(b,wait){
  for(const unit of b.units.filter(u=>alive(u)&&!b.eventActions.suspended(b,u)))unit.distance=Math.max(0,unit.distance-combatPanel(unit).speed*wait);
  for(const summon of b.summons.filter(s=>s.active))summon.distance=Math.max(0,summon.distance-summon.speed*wait);
  for(const event of b.eventActions.active(b))event.distance=Math.max(0,event.distance-event.speed*wait);
  if(b.aha?.active)b.aha.distance=Math.max(0,b.aha.distance-b.aha.speed*wait);
}
function beginFixedAha(b,punchline,cycle){
  const actors=elationTeam(b).filter(u=>alive(u)&&u.actions?.elation)
    .sort((a,c)=>(a.participantId??a.order)-(c.participantId??c.order));
  const id=(b.ahaInstantSequence??0)+1;b.ahaInstantSequence=id;
  b.ahaInstant={id,natural:false,fixedPunchline:punchline,ending:false,participants:actors.map(u=>u.id),completed:[],deferred:[]};
  b.ahaCount=(b.ahaCount??0)+1;b.ahaCounted=punchline;
  for(const actor of actors){actor.buffs=actor.buffs.filter(e=>!e.control);actor.dots=actor.dots.filter(e=>!e.control);}
  record(b,'mechanic',null,{name:'混沌回忆·物竞天择轮开始',cycle,punchline,participants:actors.map(u=>u.id)});
  const reactions=b.rules.ahaStart?.(b,{natural:false,punchline,cycle})??[];
  b.queue.unshift(...reactions,...actors.map(actor=>({actor:actor.id,key:'elation',kind:'aha',ahaInstantId:id})));
  if(!b.queue.length)finishAhaInstant(b);else flush(b);
}
function fireMocCycleStart(b){
  const rule=(b.config.endgameRules??[]).find(entry=>entry.type==='mocAhaCycle');
  if(!rule)return;
  const cycle=b.cyclesSpent+waveCycle(b.av-b.waveStartAV);
  if(b.mocAhaCycleCursor==null)b.mocAhaCycleCursor=-1;
  while(b.mocAhaCycleCursor<cycle){
    const next=++b.mocAhaCycleCursor;
    beginFixedAha(b,rule.fixedPunchline,next);
  }
}
export function combatPanel(u,{excludeConverted=false,skipAuras=false,action=null}={}){
  const out={...u.panel,baseStats:{...u.panel.baseStats},elemDmg:{...u.panel.elemDmg}};
  for(const b of u.buffs){if(excludeConverted&&(b.convert||b.converted)||b.abilityType&&b.abilityType!==action?.type)continue;
    if(b.removeOnSourceDeath&&!alive(u.battle.units.find(t=>t.id===b.source)))continue;
    if(b.requiresTag&&!u.battle.units.find(t=>t.id===b.requiresTag.unit)?.buffs.some(e=>e.tag===b.requiresTag.tag))continue;
    const key=b.key, v=b.convert?combatPanel(u.battle.units.find(t=>t.id===b.convert.source),{excludeConverted:true})[b.convert.stat]*b.convert.ratio:b.value;
    if(key==='speedPct')out.speed+=(u.baseSpeed??u.panel.speed)*v;
    else if(['atkPct','hpPct','defPct'].includes(key)){const k=key.slice(0,-3);if(!Number.isFinite(u.panel.baseStats?.[k]))throw new Error(u.name+'缺少 '+k+'白值');out[k]+=u.panel.baseStats[k]*v;}
    else if(key.startsWith('elemDmg.'))out.elemDmg[key.slice(8)]=(out.elemDmg[key.slice(8)]??0)+v;
    else if(['atk','def','hp','speed','critRate','critDmg','breakEffect','breakEfficiency','effectHit','effectRes','dotRes','energyRegen','healingBoost','incomingHeal','shieldBoost','elation'].includes(key))out[key]=(out[key]??0)+v;
    // 噬命（Monster_XP_Elite02_02 / MCommon_BlackBlood）：按可回复生命上限的比例扣减上限。
    // 配置只公开 StackProperty DirtyHPRatio 与上限 50% 的说明；伤害转化为额外比例的公式
    // 属于战斗内核，不在 Ability 中，故由 kit-runtime 明确按「实际损失生命 / 白值生命」追加。
    else if(key==='dirtyHpRatio')out.dirtyHpRatio=Math.min(b.dirtyCap??.99,(out.dirtyHpRatio??0)+v);
  }
  if(out.dirtyHpRatio>0)out.hp*=Math.max(0,1-out.dirtyHpRatio);
  if(u.battle){
    for(const s of u.gear?.sets??[]){
      if(s.id===301&&out.speed>=s.p2[1])out.atk+=(u.panel.baseStats?.atk??0)*s.p2[2];
      if(s.id===303&&!excludeConverted)out.atk+=(u.panel.baseStats?.atk??0)*Math.min(s.p2[2],(out.effectHit??0)*s.p2[1]);
      if(s.id===304&&(out.effectHit??0)>=s.p2[1])out.def+=(u.panel.baseStats?.def??0)*s.p2[2];
      if(s.id===307&&out.speed>=s.p2[1])out.breakEffect=(out.breakEffect??0)+s.p2[2];
      if(s.id===319&&out.hp>=s.p2[1])out.critDmg=(out.critDmg??0)+s.p2[2];
      if(s.id===320&&out.speed>=s.p2[1])out.healingBoost=(out.healingBoost??0)+(out.speed>=s.p2[2]?s.p2[4]:s.p2[3]);
    }
    if(u.gear?.cone?.id===21003&&u.battle.units.filter(t=>alive(t)&&t.side!==u.side).length<=2)out.critRate+=u.gear.cone.p[1];
    for(const s of u.gear?.sets??[])if(s.id===318&&[...u.battle.summons,...u.battle.units].some(s=>s.active!==false&&s.hp!==0&&(s.owner??s.memospriteOwner)===u.id))out.critDmg+=s.p2[1];
    if(!skipAuras)for(const source of u.battle.units.filter(t=>alive(t)&&t.side===u.side))for(const s of source.gear?.sets??[]){const raw=combatPanel(source,{excludeConverted:true,skipAuras:true});
      if(s.id===302&&raw.speed>=s.p2[1])out.atk+=(u.panel.baseStats?.atk??0)*s.p2[2];
      if(s.id===310&&raw.effectRes>=s.p2[1])out.critDmg+=s.p2[2];
      if(s.id===128&&s.count>=4&&u.shields.some(sh=>sh.source===source.id&&sh.value>EPS))out.critDmg+=s.p4[1];
    }
    u.battle.rules?.relics.panel(u.battle,u,out,{skipAuras});
    if(u.kit?.characterId===1412){const t=u.kit.trace;
      // 4.6 数据库中「见者」的暴击率参数以百分数整数存储（1 = 1%），其余行迹均为小数。
      if(t[2])out.critRate=(out.critRate??0)+t[2][0]/100;
      if(t[1]&&!excludeConverted)out.critDmg=(out.critDmg??0)+Math.min(t[1][3],Math.max(0,out.atk-t[1][0])/t[1][1]*t[1][2]);}
  }
  u.battle?.rules?.panel?.(u.battle,u,out,{excludeConverted,skipAuras,action});
  if(out.speed<=0)throw new Error(u.name+'速度必须大于0'); return out;
}
const hpPhaseMax=u=>combatPanel(u).hp*(u.phaseRatios?.[(u.hpPhase??1)-1]??1);
const snapshot=(b)=>b.units.map(u=>({id:u.id,name:u.name,side:u.side,owner:u.owner??u.memospriteOwner??null,hp:u.hp,hpPhase:u.hpPhase??1,hpCount:u.hpCount??1,energy:u.energy,toughness:u.toughness,distance:u.distance,alive:alive(u)}));
export function battleFrame(b){
  const units=b.units.map(u=>{const p=combatPanel(u);return {
    id:u.id,name:u.name,side:u.side,level:u.level,owner:u.owner??u.memospriteOwner??null,active:u.active,hp:u.hp,maxHp:hpPhaseMax(u),hpPhase:u.hpPhase??1,hpCount:u.hpCount??1,energy:u.energy,energyMax:u.energyMax??0,toughness:u.toughness,toughnessMax:u.toughnessMax??0,
    distance:u.distance,speed:p.speed,alive:alive(u),broken:u.broken,skipTurns:u.skipTurns??0,turns:u.turns,cannotAct:!!u.cannotAct,normalGaugeSuspended:!!b.eventActions?.suspended(b,u),
    panel:clone(p),resources:clone(u.resources??{}),buffs:[...u.buffs.map(e=>clone(e.convert?{...e,value:combatPanel(b.units.find(t=>t.id===e.convert.source),{excludeConverted:true})[e.convert.stat]*e.convert.ratio}:e)),...clone(b.rules?.displayEffects(b,u)??[])],shields:clone(u.shields),dots:clone(u.dots),
  };});
  const order=[...b.units.filter(u=>alive(u)&&!u.cannotAct&&!b.eventActions?.suspended(b,u)).map(u=>({...u,speed:combatPanel(u).speed})),...(b.summons??[]).filter(s=>s.active),...(b.eventActions?.active(b)??[])];
  if(b.aha?.active&&(b.laughter.ally??0)>0)order.push({...b.aha,speed:currentAhaSpeed(b)});
  const normalOrder=order.sort((a,c)=>{
    const aw=a.distance/(a.speed??currentAhaSpeed(b)),cw=c.distance/(c.speed??currentAhaSpeed(b));
    return Math.abs(aw-cw)>EPS?aw-cw:(a.id==='aha:ally'?-1:c.id==='aha:ally'?1:sameTimeOrder(a,c));
  }).map(u=>({id:u.id,...(u.name==null?{}:{name:u.name}),kind:u.kind??null,wait:u.distance/(u.speed??currentAhaSpeed(b)),av:b.av+u.distance/(u.speed??currentAhaSpeed(b))}));
  return {version:1,av:b.av,wave:b.wave,waveAV:b.av-b.waveStartAV,cycles:b.cyclesSpent+waveCycle(b.av-b.waveStartAV),sp:b.sp,maxSP:b.maxSP,turnActor:b.turnActor??null,action:b.activeAction?clone(b.activeAction):null,
    units,summons:clone(b.summons??[]),aha:b.aha?.active?{...clone(b.aha),speed:currentAhaSpeed(b),punchline:b.laughter.ally??0}:null,
    actionEvents:clone(b.eventActions?.active(b)??[]),queue:clone([...b.pendingActions,...b.queue]),readyContinuations:b.units.filter(u=>alive(u)&&u.kit?.characterId===1015&&b.turnActor===u.id&&u.buffs.some(e=>e.tag==='circuit')&&b.sp>=u.actions.skill.spCost&&(u.resources['连续战技次数']??0)<(u.policy?.skillLimit??5)).map(u=>u.id),readyUltimates:b.units.filter(u=>alive(u)&&u.policy?.autoUltimate!==false&&u.actions.ultimate&&!frozen(u)&&!sleeping(u)&&!u.buffs.some(e=>e.noUltimate)&&u.energy>=(u.actions.ultimate.energyCost??u.energyMax)&&!b.queue.some(q=>q.actor===u.id&&q.kind==='ultimate')).map(u=>({actor:u.id,key:'ultimate',kind:'ultimate'})),normalOrder};
}
function record(b,type,actor,extra={}){
  b.rules?.relics.refresh(b);
  if(++b.eventCount>(b.config.maxEvents??10000))throw new Error('事件数量超限，可能存在无限触发循环');
  b.log.push({index:b.log.length,av:b.av,wave:b.wave,waveAV:b.av-b.waveStartAV,cycle:b.cyclesSpent+waveCycle(b.av-b.waveStartAV),type,actor:actor?.id??null,sp:b.sp,...clone(extra),frame:battleFrame(b)});
}
const targets=(b,u,side)=>b.units.filter(t=>alive(t)&&t.unselectable!==true&&t.side===(side==='ally'?u.side:tSide(u)));
const tSide=(u)=>u.side==='ally'?'enemy':'ally';
const frozen=u=>[...u.buffs,...u.dots].some(e=>e.control==='freeze');
const sleeping=u=>[...u.buffs,...u.dots].some(e=>e.control==='sleep');
function weightedTarget(b,units){const weights=units.map(u=>(u.aggro??1)*(combatPanel(u).aggroRatio??1));const total=weights.reduce((a,c)=>a+c,0);if(!Number.isFinite(total)||total<=0)throw new Error('仇恨权重无效');let n=b.random()*total;return units.find((u,i)=>(n-=weights[i])<0)??units.at(-1);}
function selectedTargets(b,u,action){
  if(action.target==='self')return [u];
  const pool=targets(b,u,['ally','allies','lowestAlly'].includes(action.target)?'ally':'enemy');if(!pool.length)return [];
  if(Number.isInteger(action.randomTargets)&&action.randomTargets>0){
    const shuffled=[...pool];for(let i=shuffled.length-1;i>0;i--){const j=Math.floor(b.random()*(i+1));[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];}
    return shuffled.slice(0,Math.min(action.randomTargets,shuffled.length));
  }
  if(action.target==='all'||action.target==='allies')return pool;
  if(action.target==='sweep'){
    const count=Math.min(3,pool.length);
    return action.sweepDirection==='right'?pool.slice(-count):pool.slice(0,count);
  }
  if(action.target==='lowestAlly')return [pool.reduce((a,c)=>a.hp/a.panel.hp<c.hp/c.panel.hp?a:c)];
  if(action.targetId){const target=pool.find(t=>t.id===action.targetId);if(target)return [target];}
  // 强制嘲讽：敌方单位身上的 control:'taunt' 由施加者 source 指定唯一目标（云璃 / 波提欧 / 万敌 / 存护开拓者）。
  if(u.side==='enemy'){const t=u.buffs.find(e=>e.control==='taunt');const forced=t&&pool.find(p=>p.id===t.source);if(forced)return [forced];}
  return [u.side==='enemy'?weightedTarget(b,pool):pool[0]];
}
const notifiedRemovedEffects=new WeakSet();
function notifyEffectRemoved(b,owner,effect,reason){
  if(!effect||notifiedRemovedEffects.has(effect))return;
  notifiedRemovedEffects.add(effect);
  b.rules?.onEffectRemove?.(b,owner,effect,reason);
}
function notifyUnitEffectsRemoved(b,owner,reason){
  for(const effect of [...(owner.buffs??[])])notifyEffectRemoved(b,owner,effect,reason);
}
function removeEffects(b,owner,predicate,reason){
  const removed=[];
  for(const list of [owner.buffs,owner.dots])for(let i=list.length-1;i>=0;i--){
    const effect=list[i];if(!predicate(effect))continue;
    list.splice(i,1);notifyEffectRemoved(b,owner,effect,reason);removed.push(effect);
    record(b,'mechanic',owner,{name:'控制状态解除',reason,source:effect.source??null,key:effect.key??null});
  }
  return removed;
}
function removeEffectsBySourceFlag(b,sourceId,flag,reason){
  for(const owner of b.units)removeEffects(b,owner,e=>e.source===sourceId&&e[flag]===true,reason);
}
function expiredTick(b,owner,at){
  for(const u of b.units) {
    for(const list of [u.buffs,u.shields,u.dots])for(const effect of list)if(effect.remaining!=null&&effect.tickOwner===owner.id&&(effect.tickAt??'end')===at){
      // 入场阶段施加的「回合开始递减」效果：持有者第 1 个回合开始不递减（它们还没消耗过任何回合）。
      if(effect.skipFirstTick){effect.skipFirstTick=false;continue;}
      if(effect.countApplyTurn||effect.appliedTurn!==owner.turns)effect.remaining--;
    }
    // 到期回调：在某效果因 remaining 归零被移除之前通知角色模块（1505 绯英「好活当赏」结束时、
    // 任何「状态结束时」触发都用这一处）。可选链：没有模块声明该钩子时行为与旧实现完全一致。
    for(const list of [u.buffs,u.dots])for(const effect of list)
      if(effect.remaining!=null&&effect.remaining<=0&&!effect.expireNotified&&effect.tickOwner===owner.id&&(effect.tickAt??'end')===at){
        effect.expireNotified=true;b.rules?.onEffectExpire?.(b,u,effect);
        notifyEffectRemoved(b,u,effect,'expire');
        // Elation helpers mirror Punchline stacks into resources['好活当赏'] for formulas and UI.
        // Clear that mirror with its timed marker so the resource cannot become permanent.
        if(list===u.buffs&&effect.tag==='punchline'){
          const remaining=u.buffs.filter(e=>e!==effect&&e.tag==='punchline'&&(e.remaining==null||e.remaining>0))
            .reduce((n,e)=>n+(e.stacks??0),0);
          u.resources['好活当赏']=remaining;
          record(b,'resource',u,{name:'好活当赏',value:remaining,reason:'独立持续时间结束',expired:effect.stacks??0});
        }
      }
    u.buffs=u.buffs.filter(e=>e.remaining==null||e.remaining>0);u.shields=u.shields.filter(e=>(e.remaining==null||e.remaining>0)&&e.value>0);u.dots=u.dots.filter(e=>e.remaining==null||e.remaining>0);
  }
}
function energy(b,u,amount,fixed=false){const old=u.energy,gain=amount*(fixed?1:combatPanel(u).energyRegen??1),cap=u.energyMax??0;
  // 1014 / 1507「溢出能量」：达到上限后仍未计入的部分记入 u.energyOverflow，施放终结技后由角色模块取回。
  // 不读取该字段的角色行为完全不变（仅在真正溢出且为正收益时累积）。
  if(gain>0&&old+gain>cap+EPS)u.energyOverflow=(u.energyOverflow??0)+(old+gain-cap);
  u.energy=Math.max(0,Math.min(cap,old+gain));if(old!==u.energy)record(b,'energy',u,{amount:u.energy-old});}
export function scheduleActionEvents(b,ownerId,specs,options){return b.eventActions.schedule(b,ownerId,specs,options);}
export function cancelActionEvents(b,ownerId,group){return b.eventActions.cancel(b,ownerId,group);}
export function updateActionEventSpeed(b,ownerId,speed,group){return b.eventActions.updateSpeed(b,ownerId,speed,group);}
export function advance(b,id,ratio){
  const owner=b.units.find(x=>x.id===id);if(!owner)throw new Error('未知单位');
  // 通用白名单标记：持有该标记的单位（或其忆灵）不能使**其他友方**获得行动提前。
  // 例：知更鸟•晴歌【特邀嘉宾】151203。标记由角色模块写入 buff，引擎不识别具体角色。
  const from=b.activeAction?b.units.find(x=>x.id===b.activeAction.actor):null;
  const fromOwner=from?.memospriteOwner?b.units.find(x=>x.id===from.memospriteOwner):from;
  if(from&&from.id!==id&&fromOwner&&owner.side===fromOwner.side&&fromOwner.buffs?.some(e=>e.blockAllyAdvance)){
    record(b,'mechanic',fromOwner,{name:'阻止友方行动提前',target:id,ratio});
    return;
  }
  const u=b.eventActions?.redirect(b,id)??owner;u.distance=Math.max(0,u.distance-ACTION_DISTANCE*finite(ratio,'行动提前'));if(u.distance<=EPS&&ratio>0)u.advanceOrder=b.advanceSequence=(b.advanceSequence??0)+1;record(b,'advance',owner,{ratio,distance:u.distance,...(u!==owner?{eventId:u.id}:{} )});}
export function delay(b,id,ratio){const u=b.units.find(x=>x.id===id);if(!u)throw new Error('未知单位');u.distance+=ACTION_DISTANCE*finite(ratio,'行动延后');record(b,'delay',u,{ratio,distance:u.distance});}
export function receiveDamage(b,from,to,amount,kind,detail={}){
  finite(amount,'伤害');
  let mechanicAbsorbed=0,muteBreak=false;
  // 1208 符玄【穷观阵】：在护盾 / 生命结算之前，按比例把「未受护盾抵挡之前的伤害」改道给分摊者。
  // 改道后的份额重新进入本函数，因此仍按接收者自己的护盾 / 减伤结算；带 redirected 标记防止二次改道。
  if(!detail.redirected&&amount>EPS&&b.rules?.redirectDamage){
    const redirects=b.rules.redirectDamage(b,from,to,amount,kind);
    if(redirects?.length)for(const r of redirects){
      const share=Math.min(amount,Math.max(0,r.amount??0));if(share<=EPS)continue;
      if(r.absorb===true){
        amount-=share;mechanicAbsorbed+=share;
        if(r.muteBreak===true)muteBreak=true;
        record(b,'mechanic',from??to,{name:r.reason??'机制抵御伤害',target:to.id,amount:share});
        continue;
      }
      const target=b.units.find(x=>x.id===r.to);if(!target||!alive(target)||target===to)continue;
      amount-=share;
      if(r.directHpLoss!=null){
        const paid=Math.max(0,r.directHpLoss),actual=Math.min(target.hp,paid);target.hp-=actual;
        if(actual>0){record(b,'hp_consume',from??target,{target:target.id,amount:actual,hp:target.hp,reason:r.reason??'伤害改道生命支付'});b.rules?.hpChanged?.(b,target,'consume',actual,from);}
        if(!alive(target)){removeEffectsBySourceFlag(b,target.id,'removeOnSourceDeath','source_death');notifyUnitEffectsRemoved(b,target,'death');b.rules?.sync(b);record(b,'death',target);b.rules.relics.death(b,target);b.rules.death(b,from,target);markEndgameGateDefeated(b,target);refillEndgameSpawnWave(b);}
      }else receiveDamage(b,from,target,share,kind,{...detail,redirected:true});
    }
  }
  const best=Math.max(0,...to.shields.map(s=>s.value));for(const s of to.shields)s.value=Math.max(0,s.value-amount);
  const absorbed=Math.min(best,amount), lost=Math.min(to.hp,Math.max(0,amount-absorbed));
  // 免于无法战斗（杰帕德 / 白露 / 三月七等）：在生命值降为 0 之前询问角色模块，
  // 返回 true 表示本次致命伤害被拦截，保留 1 点生命，后续治疗由模块结算。
  const lethal=to.hp>EPS&&lost>=to.hp-EPS;
  const saved=lethal&&(b.rules?.beforeLethal?.(b,from,to,amount)??false);
  const feigned=lethal&&!saved&&to.side==='enemy'&&typeof to.feignDeathGroup==='string';
  const phaseTransition=lethal&&!saved&&!feigned&&to.side==='enemy'&&(to.hpPhase??1)<(to.hpCount??1);
  // 拦截成功时：保留拦截时点已恢复的治疗量减去本次仍被扣除的生命值，至少保留 1 点。
  if(feigned)enterFeignedDeath(b,from,to);
  else if(phaseTransition){
    const previousPhase=to.hpPhase??1;to.hpPhase=previousPhase+1;to.hp=hpPhaseMax(to);
    if(to.enemyKit?.resetToughnessOnHpBarChange===true){to.toughness=to.toughnessMax??0;to.broken=false;}
    record(b,'mechanic',from??to,{name:'切换生命阶段',target:to.id,fromPhase:previousPhase,toPhase:to.hpPhase,hp:to.hp,maxHp:hpPhaseMax(to)});
    b.rules?.hpBarTransition?.(b,from,to,previousPhase,to.hpPhase);
  }else to.hp=saved?Math.max(1,to.hp-lost):to.hp-lost;
  record(b,'damage',from,{target:to.id,damage:amount,hpDamage:lost,absorbed,mechanicAbsorbed,kind,hp:to.hp,...detail});
  if(lost>0)b.rules?.hpChanged?.(b,to,'damage',lost,from);
  b.rules?.afterDamage(b,from,to,detail.triggerKind??kind,lost);
  if(!['dot','additional','break','break_dot','break_additional','superbreak','true'].includes(kind)&&alive(to)&&(detail.hitEnergyPerHit||!b.hitEnergyTargets?.has(to.id))){energy(b,to,detail.hitEnergy??to.onHitEnergy??0,to.onHitEnergyFixed??false);b.hitEnergyTargets?.add(to.id);}
  if(!['dot','additional','break','break_dot','break_additional','superbreak','true'].includes(kind)&&alive(to)&&!b.attackedTargets?.has(to.id)){b.attackedTargets?.add(to.id);b.rules.relics.attacked(b,to);b.rules.attacked(b,to,from);}
  if(!alive(to)&&!feigned){removeEffectsBySourceFlag(b,to.id,'removeOnSourceDeath','source_death');notifyUnitEffectsRemoved(b,to,'death');b.rules?.sync(b);record(b,'death',to);b.rules.relics.death(b,to);b.rules.death(b,from,to);if(from)energy(b,from,from.killEnergy??10,from.killEnergyFixed??false);markEndgameGateDefeated(b,to);refillEndgameSpawnWave(b);}
  if(!['dot','additional','break','break_dot','break_additional','superbreak','true'].includes(kind)&&alive(to)&&to.reactions?.onAttacked&&!b.queue.some(q=>q.actor===to.id&&q.key===to.reactions.onAttacked))b.queue.push({actor:to.id,key:to.reactions.onAttacked,kind:'followup',targetId:from?.id});
  return {muteBreak};
}
function breakTarget(b,from,to,element=from.element,action=null){
  to.broken=true;record(b,'break',from,{target:to.id});
  removeEffects(b,to,e=>e.removeOnBreak===true,'owner_break');
  removeEffectsBySourceFlag(b,to.id,'removeOnSourceBreak','source_break');
  b.rules.relics.broken(b,from,to);
  b.rules.weaknessBreak(b,from,to,action,element);
  if(to.standardBreak){b.breaks.apply(b,from,to,element);return;}
  const rule=to.breakRule?.[element]??to.breakRule?.all;
  if(!rule){if(b.config.strict)throw new Error(to.name+'缺少 '+element+' 击破规则');record(b,'assumption',from,{message:'未实现该敌人的元素击破附加效果'});return;}
  if(rule.damage!=null)receiveDamage(b,from,to,rule.damage,'break');
  delay(b,to.id,rule.delay??0.25);
  if(rule.skipTurn)to.skipTurns=(to.skipTurns??0)+rule.skipTurn;
  for(const ally of b.units.filter(t=>alive(t)&&t.side===from.side))if(ally.reactions?.onEnemyBroken)b.queue.push({actor:ally.id,key:ally.reactions.onEnemyBroken,kind:'followup',targetId:to.id});
}
function applyEffects(b,u,action,chosen){
  for(const e of action.effects??[]){
    const recipients=e.target==='self'?[u]:e.target==='allies'?targets(b,u,'ally'):e.target==='enemies'?targets(b,u,'enemy'):e.target==='lowestAlly'?selectedTargets(b,u,{target:'lowestAlly'}):chosen;
    for(const to of recipients){
      const p=combatPanel(u);const value=e.value??((p[e.scaling??'hp']??0)*(e.multiplier??0)+(e.flat??0));finite(value,'效果值',e.type==='buff'?-Infinity:0);
      if(e.type==='heal'){const healed=Math.min(Math.max(0,combatPanel(to).hp-to.hp),value*(1+(p.healingBoost??0))*(1+(combatPanel(to).incomingHeal??0)));to.hp+=healed;record(b,'heal',u,{target:to.id,amount:healed,hp:to.hp});if(healed>0)b.rules.hpChanged(b,to,'heal',healed,u);b.rules.relics.healed(b,u,to);}
      else if(e.type==='laughter'){b.laughter[u.side]+=value;record(b,'resource',u,{name:'累计获得笑点',value:b.laughter[u.side]});b.rules?.laughterGained?.(b,u.side,value,u,'行动效果');break;}
      else if(e.type==='punchline'){to.resources['好活当赏']=(to.resources['好活当赏']??0)+value;record(b,'resource',u,{target:to.id,name:'好活当赏',value:to.resources['好活当赏']});}
      else if(e.type==='hpConsume'){const lost=Math.min(Math.max(0,to.hp-1),value);to.hp-=lost;if(lost){b.rules.hpChanged(b,to,'consume',lost,u);b.rules.relics.healthConsumed(b,to);}record(b,'hp_consume',u,{target:to.id,amount:lost,hp:to.hp});}
      else if(e.type==='advance')advance(b,to.id,value);
      else if(e.type==='delay')delay(b,to.id,value);
      else if(e.type==='cleanse'){to.dots=[];to.buffs=to.buffs.filter(x=>!x.debuff);record(b,'cleanse',u,{target:to.id});}
      else if(e.type==='extra'||e.type==='followup')b.queue.push({actor:to.id,key:e.action,kind:e.type,targetId:e.targetId});
      else {
        if(!Number.isInteger(e.duration)||e.duration<1)throw new Error('持续回合数须为正整数');
        // A sourced enemy control skill can have SPHitBase without a damage
        // term (for example 300304002 / 300304005). Resolve that per-target
        // hit energy once from its control application instead of silently
        // dropping it because damageTo had no term to process.
        if(e.control&&u.side==='enemy'&&!(action.terms??[]).length&&(action.hitEnergy??0)>0)energy(b,to,action.hitEnergy,false);
        if(resistsStatus(b,u,to,e,{combatPanel,record,skipControlResistance:true}))continue;
        // 控制类负面状态沿用游戏命中链：基础概率 × 效果命中 × 效果抵抗 × 控制抵抗。
        // 100% 命中且没有对应抵抗时短路，不额外消耗随机数。
        const ctrlRes=combatPanel(to).controlRes??to.controlRes??0;
        if(e.control){
          if(to.enemyKit?.controlImmuneTag&&to.buffs.some(effect=>effect.tag===to.enemyKit.controlImmuneTag)){
            record(b,'resist',to,{name:'免疫控制类负面状态',key:e.key,reason:'敌方来源力场'});continue;
          }
          const targetPanel=combatPanel(to),chance=Math.max(0,Math.min(1,(e.chance??1)*(1+(p.effectHit??0))*(1-(targetPanel.effectRes??0))*(1-ctrlRes)));
          if(ctrlRes>=1||chance<1&&b.random()>=chance){record(b,'resist',to,{name:ctrlRes>=1?'免疫控制类负面状态':'抵抗控制类负面状态',key:e.key,chance});continue;}
        }
        const tickOwner=e.tickOwner==='caster'?u:to;
        const data={...e,value:e.type==='shield'?value*(1+(p.shieldBoost??0)):value,source:u.id,id:e.id??u.id+':'+e.type+':'+(e.key??action.name),remaining:e.duration,tickOwner:tickOwner.id,tickAt:e.tickAt??'end',appliedTurn:tickOwner.turns};
        const list=e.type==='shield'?to.shields:e.type==='dot'?to.dots:to.buffs;
        const index=list.findIndex(x=>x.id===data.id);if(index>=0)list[index]=data;else list.push(data);
        record(b,e.type,u,{target:to.id,value:data.value,key:e.key,duration:e.duration});
        // Kafka's sourced 支配 modifier is followed by ModifyActionDelay on
        // the selected character, which brings the controlled attack forward.
        if(e.control==='charm'&&e.actionAdvance===true)advance(b,to.id,1);
        if(e.debuff||e.type==='dot')b.rules.relics.debuff(b,u,to,data);
      }
    }
  }
}
function damageTo(b,u,to,action,share=1,role='primary',kind='direct'){
  const elation=action.type==='ElationDamage',damageKind=elation?'elation':kind;
  // Some effects change a damage instance's attack classification without changing its
  // damage formula/category (for example Aventurine's solo-Elation trace).
  const triggerKind=action.countAsFollowup?'followup':damageKind;
  const instantElationMultiplier=elation&&b.activeAction?.key==='elation'&&b.activeAction?.kind==='aha'
    ?(b.ahaInstant?.elationMultiplier??1):1;
  const actionElationMultiplier=elation&&b.activeAction?.key==='elation'?(action.elationMultiplier??1):1;
  const elationMultiplier=instantElationMultiplier*actionElationMultiplier;
  const terms=(action.terms??[]).filter(t=>(t.target??'primary')==='all'||(t.target??'primary')===role).map(t=>({...t,multiplier:t.multiplier*share*elationMultiplier,flatAdd:(t.flatAdd??0)*share*elationMultiplier,count:1}));
  if(!terms.length)return;
  b.rules.relics.hit(b,u,to,action,triggerKind);
  b.rules.hit(b,u,to,action,triggerKind);
  const wasBroken=to.broken,p=combatPanel(u,{action}), targetPanel=combatPanel(to),mod=b.rules?.modifiers(b,u,to,action,damageKind)??{};
  const sceneMechanics=[];
  for(const rule of b.config.endgameRules??[])if(rule.type==='enemyCountScaleEffect'){
    const layers=Math.min(rule.maxStacks,b.units.filter(unit=>alive(unit)&&unit.side===rule.teamSide&&unit.enemyKit?.id!==rule.excludedMonsterId).length);
    if(layers<=0)continue;
    if(u.side===rule.teamSide)mod.dmgBoost=(mod.dmgBoost??0)+layers*rule.damageBoostPerEnemy;
    if(to.side===rule.teamSide){const reduction=layers*rule.damageReductionPerEnemy;mod.dmgReduction=1-(1-(mod.dmgReduction??0))*Math.max(0,1-reduction);}
    sceneMechanics.push({ruleId:rule.id,layers,damageReduction:layers*rule.damageReductionPerEnemy,damageBoost:layers*rule.damageBoostPerEnemy});
  }
  for(const rule of b.config.endgameRules??[])if(rule.type==='enemyDamageOnShieldedTarget'&&u.side===rule.attackerSide&&
    to.side===rule.targetSide&&to.shields.some(shield=>shield.value>EPS)){
    mod.dmgBoost=(mod.dmgBoost??0)+rule.damageBoost;
    sceneMechanics.push({ruleId:rule.id,targetShielded:true,damageBoost:rule.damageBoost});
  }
  // These 4.6 DoT modifiers declare UseSnapshotEntity=true. Store only the
  // source attack stat they explicitly read; target defense/resistance remain live.
  if(damageKind==='dot'&&Number.isFinite(action.snapshotAtk))p.atk=action.snapshotAtk;
  const agg={dmgBoost:0,defShred:0,defIgnore:0,resPen:{},vuln:0,dmgReduction:0,abilityDmg:{},elemDmg:{}};
  for(const effect of u.buffs){
    if(effect.sourceSide&&effect.sourceSide!==u.side)continue;
    if(effect.abilityType&&effect.abilityType!==action.type)continue;
    if(effect.requiresTag&&!b.units.find(u=>u.id===effect.requiresTag.unit)?.buffs.some(e=>e.tag===effect.requiresTag.tag))continue;
    if(['dmgBoost','defIgnore'].includes(effect.key))agg[effect.key]+=effect.value;
    else if(effect.key==='resPen'){const element=action.element??u.element;agg.resPen[element]=(agg.resPen[element]??0)+effect.value;}
  }
  for(const effect of to.buffs)if(['defShred','vuln'].includes(effect.key))agg[effect.key]+=effect.value;else if(effect.key==='dmgReduction')agg.dmgReduction=1-(1-agg.dmgReduction)*Math.max(0,1-effect.value);
  const element=action.element??u.element;
  for(const k of ['dmgBoost','defIgnore','vuln'])agg[k]+=mod[k]??0;
  // 角色模块按乘区声明的减伤（如 1315 波提欧「蛇之上行」受到非对峙目标伤害降低）：
  // 与 buff 循环中的 dmgReduction 同口径做乘法聚合；未声明该字段的模块行为完全不变。
  if(mod.dmgReduction)agg.dmgReduction=1-(1-agg.dmgReduction)*Math.max(0,1-mod.dmgReduction);
  agg.resPen[element]=(agg.resPen[element]??0)+(mod.resPen??0)+to.buffs.filter(e=>e.resReduction&&(!e.element||e.element===element)).reduce((n,e)=>n+e.value,0);
  p.critRate=(p.critRate??0)+(mod.critRate??0);p.critDmg=(p.critDmg??0)+(mod.critDmg??0);
  if(elation){
    const levelBase=BREAK_BASE[u.level];
    if(!Number.isFinite(levelBase))throw new Error(u.name+'缺少欢愉伤害等级基值');
    const inAha=b.ahaInstant&&b.activeAction?.kind==='aha';
    const fixedAha=inAha&&!b.ahaInstant.natural;
    const source=action.punchlineSource??(inAha?'punchline':'certifiedBanger');
    // 角色专属的固定计入（如砂金•戏浪热意阈值触发的【举杯】固定 20 点）可显式覆盖。
    // `punchlineFrom`：伤害归属者与笑点基数来源不同的情况（爻光大吉大利固定读爻光的 ElationEchoPoint）。
    const punchlineUnit=action.punchlineFrom?b.units.find(t=>t.id===action.punchlineFrom)??u:u;
    const counted=action.punchlineOverride!=null?Math.max(0,action.punchlineOverride):inAha
      ?fixedAha?(b.ahaInstant.fixedPunchline??0):(b.laughter?.[u.side]??0)
      :source==='laughter'||source==='punchline'
        ?(b.laughter?.[u.side]??0):(punchlineUnit.resources?.['好活当赏']??0);
    const punchlinePoints=Math.max(counted*Math.max(0,action.punchlineMultiplier??1),Math.max(0,action.punchlineFloor??0));
    const punchline=1+5*punchlinePoints/(punchlinePoints+240);
    const elationPct=Math.max(-1,p.elation??0),increase=Math.max(-1,mod.elationBoost??0);
    p.elationBase=2*levelBase*(1+elationPct)*punchline*(1+increase);
    p.elemDmg={};
    for(const t of terms)t.scaling='elationBase';
    // 欢愉伤害不吃攻击/属性/常规增伤；保留减防、抗穿、易伤、双暴、减伤与增笑。
    agg.dmgBoost=0;agg.elemDmg={};agg.abilityDmg={};
  }
  // 条件性百分比面板增益（如「对处于击破状态的敌人攻击力提高」）：只作用于本次伤害，不写回单位面板。
  if(mod.atkPct)p.atk+=(p.baseStats?.atk??0)*mod.atkPct;
  const skill={terms,hits:1,type:action.type??'Normal',element:action.element??u.element,targetRole:role,includeConditional:true,multiplierBasis:'per-term'};
  let critMode=kind==='dot'?'noncrit':b.config.critMode??'expected';if(critMode==='random')critMode=b.random()<Math.max(0,Math.min(1,p.critRate??0))?'crit':'noncrit';
  // 固定暴击（知更鸟协奏附加伤害等）：暴击率 / 暴伤由机制给定，不读单位面板，也不受录像暴击模式影响。
  if(action.fixedCrit){p.critRate=action.fixedCrit.rate??1;p.critDmg=action.fixedCrit.critDmg??0;critMode='crit';}
  const hit=computeHit({panel:p,ability:skill,agg,enemy:{def:targetPanel.def,res:to.res??{}},state:{broken:to.side==='ally'?true:to.broken},options:{critMode},attackerLevel:u.level});
  if(!hit.ok)throw new Error(hit.error);
  const hitEnergyShare=Array.isArray(action.hitEnergyShares)?(action.hitEnergyShares[(action.segment??1)-1]??1):(action.hitEnergyPerHit?share:1);
  const receipt=receiveDamage(b,u,to,hit.total,damageKind,{attackType:action.type??'Normal',triggerKind,element:skill.element,critMode,share,role,segment:action.segment,hitEnergy:action.hitEnergy==null?undefined:action.hitEnergy*hitEnergyShare,hitEnergyPerHit:action.hitEnergyPerHit,formula:hit.trace.map(t=>({zone:t.zone,value:t.value,expr:t.expr})),...(sceneMechanics.length?{sceneMechanics}:{})});
  b.rules.afterHit(b,u,to,action,triggerKind,{critMode,critRate:p.critRate});
  if(b.hitTargets&&!b.hitTargets.includes(to))b.hitTargets.push(to);
  if(wasBroken&&action.superBreak&&alive(to))b.breaks.superBreak(b,u,to,((role==='adjacent'?action.adjacentToughness:action.toughness)??0)*share,action.superBreak,skill.element);
  // 欢愉伤害同样按动作 stance 削韧（150120 等技能的 ShowStanceList 已提供主段/弹射段削韧）。
  const toughnessLocked=to.enemyKit?.toughnessImmuneTag&&to.buffs.some(effect=>effect.tag===to.enemyKit.toughnessImmuneTag);
  if(!receipt?.muteBreak&&!toughnessLocked&&!['dot','additional'].includes(damageKind)&&alive(to)&&!to.broken&&(to.toughnessMax??0)>0&&(action.ignoreWeaknessToughness||(to.weaknesses??[]).includes(skill.element)||to.buffs.some(e=>e.weakness===skill.element))){
    const reduction=(role==='adjacent'?action.adjacentToughness??action.toughness:action.toughness)??0;
    const amount=reduction*share*(1+(combatPanel(u).breakEfficiency??0));
    // 0 削韧的附加/欢愉伤害不应产生空的 toughness 事件（否则会污染逐段削韧断言）。
    if(amount>0){
      to.toughness=Math.max(0,to.toughness-amount);
      record(b,'toughness',u,{target:to.id,value:to.toughness});if(to.toughness<=EPS)breakTarget(b,u,to,skill.element,action);
    }
  }
}
function resolveCharmedAction(b,u,effect){
  const excluded=new Set([u.id,...(effect.excludeTargetIds??[])]);
  if(effect.excludeTargetId)excluded.add(effect.excludeTargetId);
  const pool=targets(b,u,'ally').filter(t=>!excluded.has(t.id));
  if(!pool.length){record(b,'skip',u,{name:'支配 · 没有可攻击的同伴'});return null;}
  const target=pool[Math.floor(b.random()*pool.length)];
  // CharmUseSkill selects a same-team target and routes the controlled unit's
  // normal skill through the inserted-action path. The verified shared modifier
  // supplies its attack-ratio clamp; an explicit action key can override the
  // default basic attack for source records that name another skill. The
  // source's MDF_SkillMaxHit split factor is not represented by the current
  // actor schema, so a boss using this helper must remain marked incomplete.
  const actionKey=effect.charmActionKey??'basic';
  if(!u.actions?.[actionKey])throw new Error(u.name+'缺少支配插入动作 '+actionKey);
  const panel=combatPanel(u),team=targets(b,u,'ally');
  const averageAttack=team.reduce((sum,ally)=>sum+combatPanel(ally).atk,0)/Math.max(1,team.length);
  const attackRatio=averageAttack/Math.max(EPS,panel.atk);
  const clampedRatio=Math.max(effect.minDamageRatio??.5,Math.min(effect.maxDamageRatio??1.5,attackRatio));
  const multiplier=(effect.charmDamagePercent??1)*clampedRatio;
  finite(multiplier,'支配攻击倍率');
  useAction(b,u,actionKey,'followup',target.id,{
    name:effect.charmActionName??'支配 · 强制攻击同伴',target:'ally',targetId:target.id,
    terms:[{scaling:'atk',multiplier}],hitShares:[1],hitEnergy:0,toughness:0,
    repeatCount:1,bounceGroups:[],spCost:0,spGain:0,energyCost:0,energyGain:0,
    hpCostRatio:0,hpCostCanKill:false,effects:[],
  });
  record(b,'mechanic',u,{name:'CharmUseSkill · 同伴攻击',target:target.id,source:effect.source??null,attackRatio,clampedRatio,multiplier});
  return target;
}
function useAction(b,u,key,kind='normal',targetId=null,overrides=null){
  if(key==='ultimate'&&kind!=='copy'&&u.buffs.some(e=>e.noUltimate))return;
  const original=u.actions[key];if(!original)throw new Error(u.name+'缺少动作 '+key);
  // 队列条目可以携带「仅作用于本次行动」的覆盖（例如开拓者终结技让目标立即施放 1 次
  // 固定计入 20 笑点的欢愉技）。覆盖在角色 prepare 之后合并，因此不改变角色自身的动作合同，
  // 也不会写入动作表或影响同一角色之后的行动。
  const prepared=()=>{const a=b.rules.prepare(b,u,key,kind,targetId?{...original,targetId}:original);return {...a,...(overrides??{}),...(targetId?{targetId}:{})};};
  let action=prepared();
  // 火花【爆点】：可抵扣战技点消耗。只对「引擎已扣款」的部分要求 SP，抵扣部分由角色 before 结算。
  const substitute=u.side==='ally'&&u.resources?Math.min(action.spCost??0,u.resources['爆点']??0):0;
  const uncovered=(action.spCost??0)-substitute;
  if(u.side==='ally'&&uncovered>b.sp)throw new Error('战技点不足');
  if(substitute>0)action={...action,spSubstituteUsed:substitute};
  if((action.energyCost??0)>u.energy+EPS)throw new Error('能量不足');
  let selected=selectedTargets(b,u,action);if(!selected.length)return;
  const copy=b.rules.copyOwner(b,u,key,kind,action);
  if(copy){u.coupActive=true;const pending={actor:u.id,key,kind:'coupOriginal'};b.pendingActions.push(pending);useAction(b,u,key,'copy',selected[0].id,overrides);flush(b,{abilitiesOnly:true});b.pendingActions=b.pendingActions.filter(q=>q!==pending);action=prepared();selected=selectedTargets(b,u,action);if(!selected.length){b.rules.consumeCopy(b,copy,u);u.coupActive=false;return;}}
  const savedAction=b.activeAction,savedHits=b.hitTargets,savedBounceHits=b.hitBounceTargets,savedEnergy=b.hitEnergyTargets,savedAttacked=b.attackedTargets;b.hitTargets=[];b.hitBounceTargets=[];b.hitEnergyTargets=new Set();b.attackedTargets=new Set();
  u.energy=Math.max(0,u.energy-(action.energyCost??0));
  if(u.side==='ally')b.rules.spend(b,u,uncovered);
  if(substitute>0){
    u.resources['爆点']=Math.max(0,(u.resources['爆点']??0)-substitute);
    record(b,'resource',u,{name:'爆点',value:u.resources['爆点'],reason:'抵扣战技点'});
  }
  if(action.hpCostRatio){const old=u.hp;u.hp=Math.max(action.hpCostCanKill?0:1,u.hp-combatPanel(u).hp*action.hpCostRatio);if(u.hp<old){b.rules.relics.healthConsumed(b,u);b.rules.hpChanged(b,u,'consume',old-u.hp,u);}}
  b.activeAction={sequence:b.log.length,actor:u.id,name:action.name??key,key,kind,targets:selected.map(t=>t.id)};
  record(b,'action',u,{name:action.name??key,key,kind,targets:selected.map(t=>t.id),energy:u.energy});
  b.rules.before(b,u,key,kind,action,selected);
  let segment=0;
  const randomUniqueHitIds=new Set();
  for(let repeat=0;repeat<(action.repeatCount??1);repeat++){
  b.rules.repeatStart(b,u,key,kind,action,repeat);
  for(const share of action.hitShares??[1]){
    const packet={...action,segment:++segment};
    let packetTargets=selected;
    if(action.randomHitTargets){
      const pool=targets(b,u,'enemy');if(!pool.length)break;
      packetTargets=[pool[Math.floor(b.random()*pool.length)]];
    }
    if(action.randomUniqueHitTargets){
      const pool=targets(b,u,'enemy');if(!pool.length)break;
      let available=pool.filter(to=>!randomUniqueHitIds.has(to.id));
      if(!available.length){randomUniqueHitIds.clear();available=pool;}
      const first=segment===1?selected.find(to=>available.some(candidate=>candidate.id===to.id)):null;
      const to=first??available[Math.floor(b.random()*available.length)];
      randomUniqueHitIds.add(to.id);packetTargets=[to];
    }
    const packetShare=action.shareDamageAcrossTargets===true?share/Math.max(1,selected.length):share;
    for(const to of packetTargets)if(alive(to))damageTo(b,u,to,packet,packetShare,'primary',kind==='followup'||key==='dragon'?'followup':'direct');
    if(action.target==='blast'){
      const pool=b.units.filter(t=>t.side===tSide(u)), at=pool.findIndex(t=>t.id===selected[0].id);
      for(const to of [pool[at-1],pool[at+1]].filter(t=>t&&alive(t)))damageTo(b,u,to,packet,packetShare,'adjacent',kind==='followup'?'followup':'direct');
    }
  }
  }
  const bounceGroups=action.bounceGroups??(action.bounceCount!=null?[{count:action.bounceCount,terms:action.bounceTerms??action.terms,toughness:action.bounceToughness}]:[]);
  for(const group of bounceGroups)for(let n=0;n<group.count;n++){
    const pool=targets(b,u,'enemy');if(!pool.length)break;
    const to=pool[Math.floor(b.random()*pool.length)];b.hitBounceTargets.push(to);
    const packet={...action,segment:++segment,terms:group.terms,toughness:group.toughness??action.bounceToughness??action.toughness};damageTo(b,u,to,packet,1,'primary',kind==='followup'?'followup':'direct');energy(b,u,group.energy??action.bounceEnergy??0);
  }
  applyEffects(b,u,action,selected);energy(b,u,action.energyGain??0,action.fixedEnergy??false);
  if(u.side==='ally')b.rules.sp(b,u,action.spGain??0,'动作恢复');
  // Native after hooks may remove attack-only efficiency before team reactors run.
  // Retain that value on this action so deferred superbreak uses the attack's value.
  const afterAction={...action,superBreakEfficiency:combatPanel(u).breakEfficiency??0};
  const hitTargets=[...b.hitTargets],bounceTargets=[...b.hitBounceTargets];b.rules.after(b,u,key,kind,afterAction,selected,hitTargets,bounceTargets);
  if(u.side==='ally'&&key==='ultimate'&&kind!=='copy')for(const rule of b.config.endgameRules??[]){
    if(rule.type!=='mocAhaCycle')continue;
    b.laughter.ally+=rule.laughterPerUltimate;
    record(b,'resource',u,{name:'累计获得笑点',value:b.laughter.ally,added:rule.laughterPerUltimate,
      reason:'混沌回忆·物竞天择：施放终结技'});
    b.rules?.laughterGained?.(b,'ally',rule.laughterPerUltimate,u,'混沌回忆·物竞天择：施放终结技');
  }
  b.rules.sync(b);
  if(hitTargets.length)b.breaks.afterAttack(b,hitTargets);
  if(copy){b.rules.consumeCopy(b,copy,u);u.coupActive=false;}
  record(b,'action_end',u,{kind,state:snapshot(b)});
  queuePlannedActions(b,u,key,kind);
  b.activeAction=savedAction??null;b.hitTargets=savedHits;b.hitBounceTargets=savedBounceHits;b.hitEnergyTargets=savedEnergy;b.attackedTargets=savedAttacked;
  applyPendingEndgameWaveTransition(b);
  refillEndgameSpawnWave(b);
}
function queuePlannedActions(b,from,key,kind){
  for(const [i,cmd]of (b.config.actionPlan??[]).entries()){
    if(b.planUsed.includes(i)||b.planQueued.includes(i))continue;const trigger=cmd.after;
    if(trigger.actor!==from.id||trigger.key!==key||trigger.kind!=null&&trigger.kind!==kind)continue;
    const count=b.log.filter(e=>e.type==='action'&&e.actor===from.id&&e.key===key&&(trigger.kind==null||trigger.kind===e.kind)).length;
    if(count!==trigger.occurrence)continue;
    const u=b.units.find(u=>u.id===cmd.actor);
    const action=u?.actions?.[cmd.key];
    if(!alive(u)||!action)throw new Error('录像操作轴第 '+(i+1)+' 项无法执行：'+(u?.name??cmd.actor)+' 阵亡或动作无效');
    if(u.energy+EPS<(action.energyCost??0))throw new Error('录像操作轴第 '+(i+1)+' 项无法执行：'+u.name+' 阵亡或能量不足');
    if(u.side==='ally'&&(action.spCost??0)>b.sp)throw new Error('录像操作轴第 '+(i+1)+' 项无法执行：'+u.name+' 战技点不足');
    if(cmd.key==='ultimate'&&b.queue.some(q=>q.actor===u.id&&q.key==='ultimate'))throw new Error('录像操作轴重复安排了 '+u.name+' 的终结技');
    const queuedKind=cmd.key==='ultimate'?'ultimate':'extra';
    b.planQueued.push(i);b.queue.push({actor:u.id,key:cmd.key,kind:queuedKind,targetId:cmd.targetId,planIndex:i,persistWave:cmd.persistWave===true||action.persistWave===true});
    record(b,'planned_action',u,{name:queuedKind==='ultimate'?'录像操作轴 · 待插入终结技':'录像操作轴 · 待执行额外行动',key:cmd.key,planIndex:i,trigger:cmd.after});
  }
}
function enqueueUltimates(b,{beforeEnd=false}={}){
  if(!b.units.some(u=>alive(u)&&u.side==='ally')||!b.units.some(u=>alive(u)&&u.side==='enemy'))return;
  const queued=new Set(b.queue.filter(q=>q.kind==='ultimate').map(q=>q.actor));
  for(const u of b.units)if(alive(u)&&!frozen(u)&&!sleeping(u)&&u.policy?.autoUltimate!==false&&!(beforeEnd&&u.id===b.turnActor&&u.policy?.ultimateTiming==='afterTurn')&&u.actions.ultimate&&b.rules.shouldUseUltimate(b,u)!==false&&!queued.has(u.id)&&!u.buffs.some(e=>e.noUltimate)&&(u.actions.ultimate.energyCost??u.energyMax)>0&&u.energy+EPS>=(u.actions.ultimate.energyCost??u.energyMax))b.queue.push({actor:u.id,key:'ultimate',kind:'ultimate'});
}
function finishAhaInstant(b,actor=null){
  const instant=b.ahaInstant;if(!instant||instant.finished)return;
  instant.finished=true;
  const counted=instant.natural?(b.laughter.ally??0):(instant.fixedPunchline??0);
  b.ahaCounted=counted;
  if(instant.natural){
    const team=elationTeam(b).filter(alive),evanescia=team.find(u=>u.kit?.characterId===1505);
    for(const u of team){
      // 150304 #3=50：先把本名角色实际能接收的份额按持有上限截断，再参与瞰众乐转化。
      const accepted=Math.min(counted,Math.max(0,punchCapOf(u)-(u.resources['好活当赏']??0)));
      // 瞰众乐：参演编号小于绯英的队友取得好活当赏时，其中50%转为绯英的好活当赏。
      // E2 再额外增加本次转换量的50%；高于/等于绯英编号的队友不触发。
      const recipientIndex=u.participantId??ELATION_PARTICIPANT_IDS[u.kit?.characterId];
      const evanesciaIndex=evanescia?.participantId??ELATION_PARTICIPANT_IDS[1505];
      const lowerThanEvanescia=!!evanescia&&u!==evanescia&&Number.isFinite(recipientIndex)&&
        Number.isFinite(evanesciaIndex)&&recipientIndex<evanesciaIndex;
      if(!lowerThanEvanescia){addCertifiedBanger(b,u,accepted,'阿哈自然行动');continue;}
      const point06=evanescia.kit.trace?.['1']?.[4]??0;
      if(!(point06>0)){addCertifiedBanger(b,u,accepted,'阿哈自然行动');continue;}
      const e2Bonus=evanescia.kit.eidolon>=2?(evanescia.kit.ranks?.[2]?.[1]??0):0;
      const converted=accepted*point06*(1+e2Bonus);
      addCertifiedBanger(b,u,accepted-converted,'阿哈自然行动 · 瞰众乐转出');
      addCertifiedBanger(b,evanescia,converted,'瞰众乐 · 参演编号转化','trace:1505101');
    }
  }
  record(b,'mechanic',actor,{name:'阿哈额外回合结束',counted,participants:instant.completed??[],consumesSharedPunchline:!!instant.natural});
  if((b.ahaSpeedBonus??0)!==0){b.ahaSpeedBonus=0;record(b,'resource',null,{name:'阿哈速度加成',value:0,reason:'阿哈时刻结束'});}
  const deferred=instant.deferred??[];
  b.ahaInstant=null;
  if(instant.natural){
    b.laughter.ally=0;
    record(b,'resource',null,{name:'累计获得笑点',value:0,reason:'阿哈自然行动结算'});
    const next=elationTeam(b).length;b.laughter.ally=next;
    if(next)b.rules?.laughterGained?.(b,'ally',next,null,'阿哈自然行动后队伍基础笑点');
    if(next)record(b,'resource',null,{name:'累计获得笑点',value:next,reason:'阿哈自然行动后队伍基础笑点'});
  }
  for(const fn of deferred)fn();
}
function beginNaturalAha(b){
  const actors=elationTeam(b).filter(u=>alive(u)&&u.actions?.elation)
    .sort((a,c)=>(a.participantId??a.order)-(c.participantId??c.order));
  const id=(b.ahaInstantSequence??0)+1;b.ahaInstantSequence=id;
  b.ahaInstant={id,natural:true,fixedPunchline:null,ending:false,participants:actors.map(u=>u.id),completed:[],deferred:[]};
  b.ahaCount=(b.ahaCount??0)+1;b.ahaCounted=b.laughter.ally??0;
  for(const u of actors){u.buffs=u.buffs.filter(e=>!e.control);u.dots=u.dots.filter(e=>!e.control);}
  record(b,'mechanic',null,{name:'阿哈自然行动',counted:b.ahaCounted,participants:actors.map(u=>u.id),speed:currentAhaSpeed(b)});
  const reactions=b.rules.ahaStart?.(b,{natural:true,punchline:b.ahaCounted})??[];
  b.queue.unshift(...reactions,...actors.map(u=>({actor:u.id,key:'elation',kind:'aha',ahaInstantId:id})));
  if(!b.queue.length){record(b,'mechanic',null,{name:'阿哈欢笑兜底分支待实现',counted:b.ahaCounted});finishAhaInstant(b);}
}
function flush(b,{abilitiesOnly=false}={}){
  while(b.queue.length){
    applyPendingEndgameWaveTransition(b);
    if(!b.units.some(u=>alive(u)&&u.side==='ally')){b.queue=[];finishAhaInstant(b);break;}
    if(!b.units.some(u=>alive(u)&&u.side==='enemy')){
      nextWave(b);
      if(!b.units.some(u=>alive(u)&&u.side==='enemy')){b.queue=[];finishAhaInstant(b);break;}
      if(!b.queue.length){finishAhaInstant(b);break;}
    }
    const at=abilitiesOnly?b.queue.findIndex(q=>q.kind==='followup'):0;if(at<0)break;
    const beforeQueue=b.queue.map((item,index)=>item&&typeof item==='object'?item:'<empty@'+index+'>');
    const [q]=b.queue.splice(at,1);
    if(!q||typeof q!=='object')throw new Error('插入动作队列出现空事件（wave '+b.wave+', AV '+b.av+'; actor '+b.turnActor+'; queue '+JSON.stringify(beforeQueue)+'）');
    if(q.planIndex!=null)b.planQueued=b.planQueued.filter(i=>i!==q.planIndex);
    const u=b.units.find(u=>u.id===q.actor);
    if(q.kind==='aha'&&b.ahaInstant?.id===q.ahaInstantId)b.ahaInstant.ending=!b.queue.some(x=>x.kind==='aha'&&x.ahaInstantId===q.ahaInstantId);
    if(!u||!alive(u)){if(q.kind==='aha'&&b.ahaInstant?.id===q.ahaInstantId&&b.ahaInstant.ending)finishAhaInstant(b);continue;}
    if(frozen(u)||sleeping(u)){if(q.planIndex!=null)throw new Error(sleeping(u)?'录像操作轴角色陷入【异梦】，不能执行插入动作':'录像操作轴角色被冻结，不能执行插入动作');record(b,'skip',u,{name:sleeping(u)?'异梦 · 无法执行插入动作':'冻结 · 无法执行插入动作',kind:q.kind});if(q.kind==='aha'&&b.ahaInstant?.ending)finishAhaInstant(b);continue;}
    if(q.planIndex!=null&&q.targetId&&!b.units.some(t=>t.id===q.targetId&&alive(t)))throw new Error('录像操作轴目标已阵亡或尚未入场，不能自动换靶');
    if(q.key==='ultimate'&&u.buffs.some(e=>e.noUltimate)){
      if(q.planIndex!=null)throw new Error('录像操作轴角色当前状态禁止施放终结技');
      record(b,'skip',u,{name:'当前状态禁止施放终结技',kind:q.kind});continue;
    }
    if(q.kind==='ultimate'&&u.energy+EPS<(u.actions[q.key].energyCost??0))continue;
    // Extra turns/ultimates/follow-ups do not reset the normal action gauge.
    const actionLogStart=b.log.length;
    useAction(b,u,q.key,q.kind,q.targetId,q.overrides??null);
    if(q.planIndex!=null&&b.log.slice(actionLogStart).some(e=>e.type==='action'&&e.actor===u.id&&e.key===q.key))b.planUsed.push(q.planIndex);
    if(q.kind==='aha'&&b.ahaInstant?.id===q.ahaInstantId)b.ahaInstant.completed.push(u.id);
    if(q.kind==='aha'&&b.ahaInstant?.id===q.ahaInstantId&&b.ahaInstant.ending){
      finishAhaInstant(b,u);
    }
    if(!abilitiesOnly)enqueueUltimates(b,{beforeEnd:!!b.turnActor});
  }
}
function refillEndgameSpawnWave(b){
  const runtime=b.endgameSpawnPlan;if(!runtime)return 0;
  if(runtime.pendingGateTransition||runtime.completed)return 0;
  const wave=runtime.source.waves[runtime.waveIndex];if(!wave)return 0;
  let active=b.units.filter(u=>alive(u)&&u.side==='enemy').length,spawned=0;
  while(active<wave.maxTeammateCount&&runtime.cursor<wave.units.length){
    const blueprint=wave.units[runtime.cursor++],unit=instantiateUnit(blueprint,b.units.length,true);
    unit.wave=b.wave;unit.distance=ACTION_DISTANCE;unit.advanceOrder=0;
    attachUnitToBattle(b,unit);active++;spawned++;
    record(b,'enemy_spawn',unit,{name:'虚构叙事 · 按来源顺序补入敌人',spawnIndex:runtime.cursor,
      sourceWaveIndex:runtime.waveIndex+1,sourceWaveId:wave.id,activeEnemyCount:active,maxTeammateCount:wave.maxTeammateCount});
  }
  return spawned;
}
function markEndgameGateDefeated(b,unit){
  const runtime=b.endgameSpawnPlan;
  const wave=runtime?.source.waves[runtime.waveIndex];
  if(!wave?.gateUnitId||wave.gateUnitId!==unit.id)return false;
  runtime.pendingGateTransition=true;
  record(b,'mechanic',unit,{name:'虚构叙事 · 首领门槛已击败',sourceWaveId:wave.id,
    transition:'本次攻击结算后进入下一波'});
  return true;
}
function enterWave(b,activate){
  record(b,'wave_end',null,{name:'第 '+b.wave+' 波结束'});b.cyclesSpent+=waveCycle(b.av-b.waveStartAV);
  const continuingAha=b.ahaInstant?b.queue.filter(q=>q?.kind==='aha'&&q.ahaInstantId===b.ahaInstant.id):[];
  // Character-granted extra turns/follow-ups are actions already earned by the
  // preceding hit. Keep only explicitly marked actions across wave transitions;
  // ordinary reactions and queued actions tied to the cleared wave still expire.
  const continuingWaveActions=b.queue.filter(q=>q?.persistWave===true);
  for(const u of b.units.filter(u=>u.side==='enemy'&&u.active))u.active=false;
  b.wave++;b.waveStartAV=b.av;b.queue=[...continuingAha,...continuingWaveActions.filter(q=>!continuingAha.includes(q))];b.pendingActions=[];
  activate();
  if(b.config.waveMode!=='continuous'){
    // 非连续模式（混沌回忆）：换波时行动值全部重置为满条，倒计时召唤物同样重置。
    // 连续模式（虚构叙事 / 末日幻影）：保留行动值与倒计时进度。
    for(const u of b.units.filter(alive)){u.distance=ACTION_DISTANCE;u.advanceOrder=0;}
    for(const s of b.summons.filter(s=>s.active&&!s.noWaveReset))s.distance=ACTION_DISTANCE;
    for(const e of b.eventActions.active(b))if(!e.noWaveReset)e.distance=e.initialDistance;
  }
  record(b,'wave_start',null,{name:'第 '+b.wave+' 波开始'});
  // 逐波次事件：秘技「酣醉序曲」、镜中故我等每次波次开始的效果在此结算。
  b.rules.onWaveStart(b);
}
function applyPendingEndgameWaveTransition(b){
  const runtime=b.endgameSpawnPlan;
  if(!runtime?.pendingGateTransition)return false;
  runtime.pendingGateTransition=false;
  const nextIndex=runtime.waveIndex+1;
  const wave=runtime.source.waves[runtime.waveIndex];
  for(const unit of b.units.filter(u=>u.side==='enemy'&&u.active&&alive(u))){
    record(b,'enemy_despawn',unit,{name:'虚构叙事 · 首领门槛推进',sourceWaveId:wave?.id,
      reason:'本波门槛敌人被击败'});
  }
  if(nextIndex>=runtime.source.waves.length){
    record(b,'wave_end',null,{name:'第 '+b.wave+' 波结束'});b.cyclesSpent+=waveCycle(b.av-b.waveStartAV);
    for(const unit of b.units.filter(u=>u.side==='enemy'&&u.active))unit.active=false;
    runtime.completed=true;
    return true;
  }
  runtime.waveIndex=nextIndex;runtime.cursor=0;
  enterWave(b,()=>{refillEndgameSpawnWave(b);});
  return true;
}
function removeDrainedFictionalControllers(b){
  const runtime=b.endgameSpawnPlan,wave=runtime?.source.waves[runtime.waveIndex];
  if(!wave||runtime.cursor<wave.units.length)return false;
  const active=b.units.filter(u=>alive(u)&&u.side==='enemy');
  if(!active.length||active.some(u=>u.enemyKit?.waveController!==true))return false;
  for(const unit of active){
    unit.active=false;
    record(b,'mechanic',unit,{name:'虚构叙事 · 来源名单耗尽后移除波次控制体',sourceWaveId:wave.id,
      source:'Monster_XP_MonsterGroup_00_PassiveSkillInitiate OnDestroy'});
    record(b,'enemy_despawn',unit,{name:'虚构叙事 · 波次控制体清场',sourceWaveId:wave.id,
      reason:'该波全部来源敌人已生成并被击败'});
  }
  return true;
}
function nextWave(b){
  if(!b.units.some(u=>alive(u)&&u.side==='ally'))return;
  const dynamic=b.endgameSpawnPlan;
  if(dynamic){
    if(applyPendingEndgameWaveTransition(b))return;
    removeDrainedFictionalControllers(b);
    if(b.units.some(u=>alive(u)&&u.side==='enemy'))return;
    if(refillEndgameSpawnWave(b)>0)return;
    const nextIndex=dynamic.waveIndex+1;
    if(nextIndex>=dynamic.source.waves.length)return;
    dynamic.waveIndex=nextIndex;dynamic.cursor=0;
    enterWave(b,()=>{refillEndgameSpawnWave(b);});
    return;
  }
  if(b.units.some(u=>alive(u)&&u.side==='enemy'))return;
  const next=b.units.filter(u=>u.side==='enemy'&&(u.wave??1)===b.wave+1);if(!next.length)return;
  enterWave(b,()=>{for(const u of next){u.active=true;u.distance=ACTION_DISTANCE;u.advanceOrder=0;}});
}
export function stepBattle(b){
  b.eventActions.cleanup(b);
  nextWave(b);
  if(!b.units.some(u=>alive(u)&&u.side==='ally')||!b.units.some(u=>alive(u)&&u.side==='enemy'))return false;
  fireMocCycleStart(b);
  nextWave(b);
  if(!b.units.some(u=>alive(u)&&u.side==='ally')||!b.units.some(u=>alive(u)&&u.side==='enemy'))return false;
  enqueueUltimates(b);flush(b);
  nextWave(b);
  if(!b.units.some(u=>alive(u)&&u.side==='ally')||!b.units.some(u=>alive(u)&&u.side==='enemy'))return false;
  b.rules.sync(b);
  if(b.aha?.active)b.aha.speed=currentAhaSpeed(b);
  const order=[...b.units.filter(u=>alive(u)&&!u.cannotAct&&!u.noAction&&!b.eventActions.suspended(b,u)).map(u=>({u,wait:u.distance/combatPanel(u).speed})),...b.summons.filter(s=>s.active).map(u=>({u,wait:u.distance/u.speed})),...b.eventActions.active(b).map(u=>({u,wait:u.distance/u.speed})),...(b.aha?.active&&(b.laughter.ally??0)>0?[{u:b.aha,wait:b.aha.distance/b.aha.speed}]:[])].sort((a,c)=>Math.abs(a.wait-c.wait)>EPS?a.wait-c.wait:sameTimeOrder(a.u,c.u));
  if(!order.length)return false;
  const {u,wait}=order[0],cycleBoundary=nextMocCycleBoundary(b);
  if(cycleBoundary!=null&&cycleBoundary<=b.av+wait+EPS){
    const cycleWait=Math.max(0,cycleBoundary-b.av);
    if(b.av+cycleWait>b.config.maxAV+EPS)return false;
    advanceCombatTime(b,cycleWait);b.av+=cycleWait;fireMocCycleStart(b);return true;
  }
  if(b.av+wait>b.config.maxAV+EPS)return false;
  advanceCombatTime(b,wait);
  if(u===b.aha){b.av+=wait;b.aha.distance=ACTION_DISTANCE;b.aha.speed=currentAhaSpeed(b);beginNaturalAha(b);flush(b);return true;}
  if(u.kind==='action_event'){b.av+=wait;b.eventActions.dispatch(b,u);enqueueUltimates(b);flush(b);return true;}
  b.av+=wait;
  // Counter ultimates wait until the enemy's actual turn is about to begin.
  // Explicit action plans still bypass this automatic timing decision.
  if(u.side==='enemy'&&!frozen(u)&&!sleeping(u)&&!(u.skipTurns>0)){
    b.ultimateWindowActor=u.id;enqueueUltimates(b);flush(b);delete b.ultimateWindowActor;
    if(!alive(u))return true;
  }
  u.distance=ACTION_DISTANCE;u.advanceOrder=0;
  if(u.owner){b.turnActor=u.id;record(b,'summon_turn',b.units.find(t=>t.id===u.owner),{name:u.name,summon:u.id});b.activeSummon=u;try{b.rules.dragon(b,u);}finally{b.activeSummon=null;}b.turnActor=null;enqueueUltimates(b);flush(b);return true;}
  u.turns++;b.turns++;
  b.turnActor=u.id;record(b,'turn_start',u);
  const thaw=frozen(u);
  for(const dot of [...u.dots]){const source=b.units.find(x=>x.id===dot.source);if(dot.breakData)b.breaks.tick(b,u,dot);else if(dot.terms)damageTo(b,source,u,{...dot,type:'DoT',toughness:0},1,'primary','dot');
    else if(Number.isFinite(dot.bleedAtkRatio)&&Number.isFinite(dot.maxHpCapRatio)){
      const raw=Math.min((dot.snapshotAtk??combatPanel(source).atk)*dot.bleedAtkRatio,combatPanel(u).hp*dot.maxHpCapRatio);
      damageTo(b,source,u,{name:dot.name??'裂伤',type:'DoT',element:dot.element,
        terms:[{scaling:'atk',multiplier:0,flatAdd:raw}],snapshotAtk:dot.snapshotAtk,toughness:0},1,'primary','dot');
    }
    // 以目标最大生命百分比结算的持续伤害（1013020 自动机兵•齿狼裂伤：
    // Owner_MaxHP × Layer × 5%）。每层独立乘算，走普通持续伤害乘区。
    else if(Number.isFinite(dot.maxHpRatio)){
      const raw=combatPanel(u).hp*dot.maxHpRatio*(dot.stacks??1);
      damageTo(b,source,u,{name:dot.name??'裂伤',type:'DoT',element:dot.element,
        terms:[{scaling:'atk',multiplier:0,flatAdd:raw}],toughness:0},1,'primary','dot');
    }
    // 只有固定值（无 terms）的持续伤害（如海瑟音天赋的物理裂伤）同样属于普通持续伤害：
    // 必须经过防御 / 抗性 / 易伤 / 增伤乘区并产出公式溯源，不能再把快照值当最终伤害直接扣除。
    // 用 multiplier:0 + flatAdd 的等价伤害项，与 breaks.damage 的固定值口径一致；非物理击破 DoT
    // 的层数语义与 breaks.tick 相同（物理裂伤不按层数放缩）。
    else damageTo(b,source,u,{name:dot.name??'持续伤害',type:'DoT',element:dot.element,
      terms:[{scaling:'atk',multiplier:0,flatAdd:(dot.value??0)*(dot.element==='Physical'?1:(dot.stacks??1))}],toughness:0},1,'primary','dot');
    if(!alive(u))break;}
  expiredTick(b,u,'start');if(!alive(u)){b.turnActor=null;flush(b);return true;}
  b.rules.onTurnStart(b,u);
  if(thaw){u.buffs=u.buffs.filter(e=>e.control!=='freeze');u.dots=u.dots.filter(e=>e.control!=='freeze');record(b,'skip',u,{name:'冻结 · 解冻回合'});advance(b,u.id,.5);}
  else if(u.skipTurns>0){u.skipTurns--;record(b,'skip',u);}
  else if(sleeping(u))record(b,'skip',u,{name:'【异梦】无法行动'});
  else {
    if(u.broken){
      // 「尝试从弱点击破状态恢复」是残梅绽等延长击破效果的唯一触发点。
      if(b.rules.beforeRecover(b,u))record(b,'resource',u,{name:'弱点击破恢复被延长'});
      else {u.broken=false;u.toughness=u.toughnessMax;record(b,'recover',u);}
    }
    const charm=u.side==='ally'?u.buffs.find(e=>e.control==='charm'):null;
    let key;
    if(charm){key=charm.charmActionKey??'basic';resolveCharmedAction(b,u,charm);}
    else {
      const healing=u.policy?.healBelow!=null&&targets(b,u,'ally').some(t=>t.hp/combatPanel(t).hp<u.policy.healBelow);
      const skill=u.actions.skill;
      const effectiveSkill=skill?b.rules.prepare(b,u,'skill','normal',skill):null;
      const maintain=u.policy?.maintainBond&&u.resources?.['同袍目标']&&b.units.some(t=>alive(t)&&t.id===u.resources['同袍目标']);
      const useSkill=skill&&!maintain&&b.rules.shouldUseSkill(b,u)!==false&&u.policy?.basicOnly!==true&&(u.side==='enemy'||b.sp>=(effectiveSkill.spCost??0))&&(u.policy?.healBelow==null||healing);
      const rotation=u.policy?.rotation;
      const enemyDecision=u.side==='enemy'?b.rules.enemyAction?.(b,u):null;
      key=enemyDecision?.key??(rotation?rotation[(u.turns-1)%rotation.length]:useSkill?'skill':'basic');
      const scripted=u.policy?.turnPlan?.find(p=>p.turn===u.turns);if(scripted)key=scripted.key;
      if(scripted?.targetId&&!b.units.some(t=>t.id===scripted.targetId&&alive(t)))throw new Error(u.name+' 录像操作轴目标已阵亡或尚未入场，不能自动换靶');
      const chosen=b.rules.prepare(b,u,key,'normal',u.actions[key]);
      if(scripted&&(u.side==='ally'&&(chosen.spCost??0)>b.sp||(chosen.energyCost??0)>u.energy+EPS))throw new Error(u.name+' 录像操作轴第 '+u.turns+' 回合资源不足');
      if((u.side==='ally'&&(chosen.spCost??0)>b.sp)||(chosen.energyCost??0)>u.energy+EPS)key='basic';
      useAction(b,u,key,'normal',scripted?.targetId??enemyDecision?.targetId);
    }
    // A continuation belongs to the same turn: no AV, duration tick or ultimate
    // insertion between breaths. Each activation still resolves its own attack hooks.
    let continued=key;
    while(!charm&&alive(u)&&b.units.some(t=>alive(t)&&t.side!==u.side)){
      const next=b.rules.continueAction(b,u,continued);if(!next)break;
      const nextKey=typeof next==='string'?next:next.key;
      if(typeof nextKey!=='string'||!u.actions[nextKey])throw new Error(u.name+' 连续行动钩子返回了无效动作');
      useAction(b,u,nextKey,'continuation',typeof next==='string'?null:next.targetId);continued=nextKey;
    }
    if(!charm&&u.kit?.characterId===1015&&key==='skill'){
      // All active shots share one normal turn. Insertions settle between shots;
      // they neither spend AV nor tick recipient-turn durations.
      enqueueUltimates(b,{beforeEnd:true});flush(b);
      while(alive(u)&&b.units.some(t=>alive(t)&&t.side!==u.side)&&b.sp>=u.actions.skill.spCost&&u.resources['连续战技次数']<Math.min(u.policy?.skillLimit??5,u.kit.params.BPSkill[4])){
        useAction(b,u,'skill','continuation');enqueueUltimates(b,{beforeEnd:true});flush(b);
      }
    }
  }
  enqueueUltimates(b,{beforeEnd:true});flush(b);
  expiredTick(b,u,'end');b.rules.onTurnEnd(b,u);record(b,'turn_end',u);b.turnActor=null;enqueueUltimates(b);flush(b);return true;
}
export function simulateBattle(config){
  const battle=createBattle(config);record(battle,'battle_start',null,{state:snapshot(battle)});
  while(stepBattle(battle)){}
  const allyAlive=battle.units.some(u=>alive(u)&&u.side==='ally'),enemyAlive=battle.units.some(u=>alive(u)&&u.side==='enemy');
  const outcome=!allyAlive?'defeat':!enemyAlive?'victory':'time_limit';record(battle,'battle_end',null,{outcome});
  return {replayVersion:1,config:clone(config),av:battle.av,sp:battle.sp,turns:battle.turns,outcome,plan:{used:battle.planUsed,unused:(config.actionPlan??[]).map((_,i)=>i).filter(i=>!battle.planUsed.includes(i))},
    units:snapshot(battle),actors:battle.units.map(u=>({id:u.id,side:u.side,memospriteOwner:u.memospriteOwner??null})),log:battle.log,accuracy:config.strict?'strict':'approximate',unsupported:battleMechanicsWarnings(config),
    damage:battle.log.filter(x=>x.type==='damage'&&battle.units.find(u=>u.id===x.actor)?.side==='ally'&&battle.units.find(u=>u.id===x.target)?.side==='enemy').reduce((s,x)=>s+x.damage,0),
    healing:battle.log.filter(x=>x.type==='heal').reduce((s,x)=>s+x.amount,0)};
}
export function compareReplay(result,anchors,{avTolerance=0.01,damageTolerance=0.01}={}){
  return anchors.map(a=>{const e=result.log.filter(e=>e.type===a.type&&e.actor===a.actor&&(a.target==null||e.target===a.target))[a.occurrence??0];
    return {anchor:a,actual:e??null,ok:!!e&&Math.abs(e.av-a.av)<=avTolerance&&(a.damage==null||Math.abs(e.damage-a.damage)<=damageTolerance),reason:e?'数值或行动值不匹配':'日志中没有对应事件'};});
}
