import {CONFIG_SCHEMA,resolveName,resolveSets,SIGNATURES,checkKeys,parseStat} from '../core/config-language.mjs';
import {newBattleBuild,buildBattleActor} from './builds.mjs';
import {validateBattle} from './engine.mjs';
import {suggestPanel} from '../core/panel.mjs';
import {relicContributions,applyRelics} from '../core/relics.mjs';
const clone=x=>JSON.parse(JSON.stringify(x));
const fields=['hp','atk','def','speed','critRate','critDmg','breakEffect','effectHit','effectRes','energyRegen','healingBoost','elementDmg'];
// Only the unconditional two-piece properties shown outside combat. Battle-only
// bonuses (e.g. Lushaka's first-slot ATK and Archer cone entry ATK) stay in runtime.
const permanentSets={101:'healingBoost',102:'atkPct',103:'defPct',104:'elemDmg.Ice',105:'elemDmg.Physical',107:'elemDmg.Fire',108:'elemDmg.Quantum',109:'elemDmg.Thunder',110:'elemDmg.Wind',111:'breakEffect',112:'elemDmg.Imaginary',113:'hpPct',114:'speedPct',116:'atkPct',118:'breakEffect',119:'breakEffect',120:'atkPct',121:'speedPct',122:'critRate',123:'atkPct',124:'elemDmg.Quantum',125:'speedPct',126:'critDmg',127:'critRate',129:'critDmg',130:'speedPct',131:'atkPct',132:'hpPct',133:'speedPct',134:'critDmg',301:'atkPct',302:'hpPct',303:'effectHit',304:'defPct',305:'critDmg',306:'critRate',307:'breakEffect',308:'energyRegen',309:'critRate',310:'effectRes',311:'atkPct',312:'energyRegen',314:'atkPct',316:'speedPct',317:'energyRegen',318:'critDmg',319:'hpPct',320:'speedPct',322:'atkPct',323:'critRate',324:'critDmg',327:'critRate'};
export function outsideBonuses(ctx,build){
  const values={},notes=[],add=(key,v,name)=>{values[key]=(values[key]??0)+v;notes.push(`${name}：${key} ${v}`);};
  for(const s of build.relicSets??[]){const t=ctx.relicsetById.get(s.id),p=t.set2Params,p4=t.set4Params;if(permanentSets[s.id])add(permanentSets[s.id],p[0],t.name);if(s.id===313)add('critRate',p[2],t.name);
    if(s.count===4){if(s.id===102)add('speedPct',p4[0],t.name);if(s.id===111)add('breakEffect',p4[0],t.name);if(s.id===120)add('critRate',p4[0],t.name);}
    if(s.count===4&&s.id===124)throw new Error('诗人四件套的速度分档须以引擎输入面板或六件遗器导入，暂不反推局外面板');
  }
  const cone=ctx.lcById.get(build.lightconeId),p=cone?.skillParams?.[build.superimpose]?.param_list;
  const property={23019:'breakEffect',23063:'hpPct',23021:'critDmg',23051:'atkPct',23046:'critRate',23048:'atkPct',21004:'breakEffect',22005:'atkPct',21003:'atkPct',23003:'energyRegen',23038:'critDmg',21000:'energyRegen'}[build.lightconeId];
  if(build.lightconeId&&!property&&![21018,21011,23034,20012,21021,21025,23026].includes(build.lightconeId))throw new Error('此光锥的局外常驻属性尚未登记；请用六件遗器或注明引擎输入面板');
  if(property)add(property,p[0],cone.name);
  return {values,notes};
}
function delta(bonuses,key,panel,baseSpeed){if(key==='elementDmg')return 0;return (bonuses[key]??0)+(['hp','atk','def'].includes(key)?(bonuses[key+'Pct']??0)*panel.baseStats[key]:key==='speed'?(bonuses.speedPct??0)*baseSpeed:0);}
export function prepareTeamImport(ctx,current,input){
  checkKeys(input,['schema','datasetVersion','members','unresolved','notes','actionPlan'],'导入配置');
  if(input.schema!==CONFIG_SCHEMA)throw new Error('配置格式须为 '+CONFIG_SCHEMA);
  if(input.datasetVersion!==ctx.data._meta.version)throw new Error('配置数据库版本须为 '+ctx.data._meta.version+'，不可静默套用历史版本');
  if(!Array.isArray(input.members)||input.members.length<1||input.members.length>4)throw new Error('每次导入须含 1～4 名队员');
  if(input.unresolved!=null&&(!Array.isArray(input.unresolved)||input.unresolved.length))throw new Error('配置仍有未解决项：'+JSON.stringify(input.unresolved));
  if(input.notes!=null&&(!Array.isArray(input.notes)||input.notes.some(n=>typeof n!=='string')))throw new Error('notes 须为文本数组');
  const config=clone(current),allies=config.units.filter(u=>u.side==='ally'),used=new Set(),summary=[],warnings=[...(input.notes??[])];
  for(const m of input.members){
    checkKeys(m,['slot','character','level','eidolon','lightcone','lightconeLevel','superimpose','variant','technique','levels','sets','relics','stats','statsBasis','policy','energy'],'队员');
    const ch=resolveName(ctx,'character',m.character),slot=m.slot??allies.findIndex(u=>u.characterId===ch.id)+1;
    if(!Number.isInteger(slot)||slot<1||slot>4||!allies[slot-1])throw new Error(ch.name+' 请指定现有位置 slot（1～4）');
    if(used.has(slot))throw new Error('同一位置不可重复导入');used.add(slot);
    const old=allies[slot-1],same=old.characterId===ch.id,build=clone(same&&old.build?old.build:newBattleBuild());build.characterId=ch.id;
    if(!same&&!m.relics&&!m.stats)throw new Error(ch.name+' 更换角色须提供完整面板或六件遗器，不能沿用上一名角色的数值');
    for(const k of ['level','eidolon','lightconeLevel','superimpose','variant','technique'])if(m[k]!==undefined)build[k]=m[k];
    if(typeof build.technique!=='boolean')throw new Error('technique 须为布尔值');
    if(m.lightcone!==undefined)build.lightconeId=m.lightcone===null?null:['专武','专属','signature'].includes(m.lightcone)?SIGNATURES[ch.id]:resolveName(ctx,'lightcone',m.lightcone).id;
    if(m.lightcone!=null&&build.lightconeId==null)throw new Error(ch.name+'的专武映射尚未登记，请填全名');
    if(build.lightconeId&&ctx.lcById.get(build.lightconeId)?.path!==ch.path)throw new Error(ch.name+'与光锥命途不符');
    if(m.variant===undefined&&['强化花火','加强花火'].includes(m.character))build.variant='enhanced';
    if(m.variant===undefined&&m.character==='原版花火')build.variant='base';
    if(m.levels){checkKeys(m.levels,['Normal','BPSkill','Ultra','Talent'],'技能等级');build.levels={...build.levels,...m.levels};}
    if(m.sets!==undefined)build.relicSets=resolveSets(ctx,m.sets);
    if(m.relics!==undefined){if(!Array.isArray(m.relics)||m.relics.length!==6||new Set(m.relics.map(r=>r.slot)).size!==6||m.relics.some(r=>!Number.isInteger(r.slot)||r.slot<0||r.slot>5))throw new Error('relics 须含六个不重复部位');if(!same&&m.relics.some(r=>!r.enabled))throw new Error('新角色须提供六件启用的遗器，或完整面板');build.relics=clone(m.relics);build.relicAuto=true;}
    if(same&&!build.relicAuto&&!m.relics&&['level','lightconeLevel','lightconeId'].some(k=>build[k]!==old.build[k])&&['hp','atk','def'].some(k=>m.stats?.[k]==null))throw new Error(ch.name+'：更换白值来源须同时提供新生命、攻击、防御面板或六件遗器，避免沿用旧白值');
    const suggestion=suggestPanel(ctx,build).panel,contrib=relicContributions(ctx.data.relicTables,build.relics);
    let panel=build.relicAuto?applyRelics(suggestion,contrib):{...suggestion,...clone(build.panel),baseStats:suggestion.baseStats};
    if(m.stats){
      checkKeys(m.stats,fields,'面板');if(!['engine-input','out-of-combat'].includes(m.statsBasis))throw new Error('面板须明确 statsBasis：out-of-combat（局外详情）或 engine-input（排除光锥套装属性）');
      if(m.relics)throw new Error('面板与六件遗器不可同时作为属性来源');
      if(!same&&['hp','atk','def','speed','critRate','critDmg','energyRegen'].some(k=>m.stats[k]==null))throw new Error('新角色完整面板须含生命、攻击、防御、速度、双暴和回能倍率');
      const outside=m.statsBasis==='out-of-combat'?outsideBonuses(ctx,build):{values:{},notes:[]},element=({量子:'Quantum',物理:'Physical',风:'Wind',火:'Fire',冰:'Ice',雷:'Thunder',虚数:'Imaginary'})[ch.element]??ch.element;
      for(const [key,value]of Object.entries(m.stats)){const v=parseStat(value,key);if(key==='elementDmg'){panel.elemDmg??={};panel.elemDmg[element]=v-(outside.values['elemDmg.'+element]??0);}else panel[key]=v-delta(outside.values,key,panel,ctx.charStatsById.get(ch.id)?.[0]?.spd??0);}
      build.relicAuto=false;build.panel=panel;
      if(outside.notes.length)warnings.push(ch.name+'：已扣除局外常驻属性，运行时由光锥 / 套装重新加入；'+outside.notes.join('；'));
    }else if(!build.relicAuto)build.panel=panel;
    const actor=buildBattleActor(ctx,build);actor.id=old.id;
    actor.policy=same?clone(old.policy??{}):clone(actor.policy??{});
    if(m.policy){checkKeys(m.policy,['allyTargetSlot','autoUltimate','basicOnly','skillLimit','rotation','turnPlan','maintainBond','ultimateTiming','poemStrategy'],'行动策略');for(const k of ['autoUltimate','basicOnly','maintainBond'])if(m.policy[k]!==undefined&&typeof m.policy[k]!=='boolean')throw new Error(k+' 须为布尔值');const {allyTargetSlot,...rest}=m.policy;Object.assign(actor.policy,rest);if(allyTargetSlot!==undefined){if(!Number.isInteger(allyTargetSlot)||!allies[allyTargetSlot-1])throw new Error('辅助目标位置无效');actor.policy.allyTargetId=allies[allyTargetSlot-1].id;}}
    if(m.energy!==undefined){if(!Number.isFinite(m.energy)||m.energy<0||m.energy>actor.energyMax)throw new Error('初始能量超出上限');actor.energy=m.energy;}else if(same)actor.energy=Math.min(old.energy??0,actor.energyMax);
    if(same&&old.currentHp!=null)actor.currentHp=Math.min(old.currentHp,actor.panel.hp);
    config.units[config.units.findIndex(u=>u.id===old.id)]=actor;
    const changed=['level','eidolon','lightcone','lightconeLevel','superimpose','variant','technique','levels','sets','relics','stats','policy','energy'].filter(k=>m[k]!==undefined);
    summary.push({slot,id:actor.id,character:actor.name,eidolon:build.eidolon,lightcone:ctx.lcById.get(build.lightconeId)?.name??'无',superimpose:build.superimpose,sets:build.relicSets.map(s=>(ctx.relicsetById.get(s.id)?.name??s.id)+' ×'+s.count),changed,inherited:same?'其余设置沿用当前队员':'未提供的选项使用编辑器默认值',panel:clone(actor.panel)});
  }
  const ids=config.units.filter(u=>u.side==='ally').map(u=>u.characterId);if(new Set(ids).size!==ids.length)throw new Error('四人队伍不可重复角色');
  if(input.actionPlan!==undefined)config.actionPlan=clone(input.actionPlan);
  const problems=validateBattle(config);if(problems.length)throw new Error(problems.join('；'));
  return {config,summary:summary.sort((a,b)=>a.slot-b.slot),warnings,unchangedSlots:[1,2,3,4].filter(i=>!used.has(i))};
}
