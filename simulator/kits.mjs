import { effectiveSkillLevel, promotionForLevel, skillParamsAt } from '../core/ctx.mjs';
import { KIT_TABLES,KIT_METADATA,CONE_TABLES,SET_TABLES,ASTRAL_EXPRESS } from './game-data.mjs';
import {REGISTERED_IDS,compileRegisteredKit,validateRegisteredKit} from './characters/registry.mjs';
import {SUPPORTED_CONES,SUPPORTED_SETS,compileGear} from './gear.mjs';
export {SUPPORTED_CONES,SUPPORTED_SETS};

// Versioned, executable kits. Numeric parameters come from the selected 4.6 dataset;
// hit splits are from the pinned release ability scripts (see docs/严格模式规则与验收.md).
export const KIT_IDS = [1306, 1414, 1015, 1412,...REGISTERED_IDS];
export const KIT_REVISION = '4.6-party-1';
const copy=x=>JSON.parse(JSON.stringify(x));
export function maximumSP(config){
  if(!config.units.some(u=>u?.kit))return config.maxSP??5;
  return 5+config.units.reduce((n,u)=>n+(u?.kit?.characterId===1306?(u.kit.params?.Talent?.[2]??0)+(u.kit.eidolon>=4?1:0):u?.kit?.characterId===1015?u.kit.trace?.[1]?.[0]??0:0),0);
}
export function validateKitActor(u){
  if(REGISTERED_IDS.includes(u.characterId))return validateRegisteredKit(u);
  const k=u.kit,errors=[],fail=m=>errors.push(u.name+'：'+m),equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  if(!k||!KIT_IDS.includes(u.characterId))return ['缺少角色机制'];
  const table=KIT_TABLES[u.characterId]?.[k.variant];if(!table)return [u.name+'角色形态未登记'];
  const metadata=KIT_METADATA[u.characterId][k.variant],promotion=[20,30,40,50,60,70,80].findIndex(n=>u.level<=n),traces={};
  for(const t of metadata.traces)if((t.promotionLimit??0)<=promotion)traces[String(t.id).slice(-1)]=t.params;
  if(!equal(k.ranks,metadata.ranks)||!equal(k.trace,traces))fail('行迹 / 星魂参数与正式服不符');
  for(const type of ['Normal','BPSkill','Ultra','Talent','Maze'])if(!equal(k.params?.[type],table[type]?.[k.skillLevels?.[type]]?.param_list))fail(type+' 参数与 4.6 正式服技能等级不符，请重新应用配装');
  const expectedMax={1306:110,1015:220,1412:130,1414:135}[u.characterId];if(u.energyMax!==expectedMax)fail('角色能量上限与正式服不符');
  if(u.astralExpress!==ASTRAL_EXPRESS.includes(u.characterId))fail('开拓同行分组与正式服不符，请重新应用配装');
  const p=k.params;if(!p||errors.length)return errors;
  const a=u.actions??{},check=(key,property,expected)=>{if(!equal(a[key]?.[property],expected))fail(key+'.'+property+' 与登记机制不符');};
  for(const key of ['basic','skill','ultimate'])if(!a[key])fail('缺少 '+key);
  const element={1306:'Quantum',1015:'Quantum',1412:'Wind',1414:'Physical'}[u.characterId];if(u.element!==element)fail('角色属性不符');
  check('basic','spGain',1);check('skill','spCost',u.characterId===1015?2:1);check('ultimate','energyCost',expectedMax);
  for(const [key,type,gain] of [['basic','Normal',20],['skill','BPSkill',30],['ultimate','Ultra',5]]){check(key,'type',type);check(key,'energyGain',gain);check(key,'element',element);check(key,'effects',undefined);}
  check('skill','target',u.characterId===1015?'single':'ally');
  check('basic','terms',[{scaling:'atk',multiplier:p.Normal[0]}]);
  check('skill','terms',u.characterId===1015?[{scaling:'atk',multiplier:p.BPSkill[0]}]:[]);
  check('ultimate','terms',u.characterId===1306?[]:[{scaling:'atk',multiplier:p.Ultra[0]+(u.characterId===1412&&k.eidolon>=4?k.ranks[4][0]:0)}]);
  check('ultimate','target',u.characterId===1306?'allies':u.characterId===1015?'single':'all');
  check('basic','toughness',30);check('skill','toughness',u.characterId===1015?60:0);check('ultimate','toughness',u.characterId===1306?0:u.characterId===1015?90:60);
  check('basic','hitShares',u.characterId===1015?[.3,.35,.35]:u.characterId===1414?[.3,.7]:[1]);
  check('skill','hitShares',[1]);check('ultimate','hitShares',u.characterId===1015?[...Array(14).fill(.04),.44]:[1]);
  if(u.characterId===1015){check('followup','terms',[{scaling:'atk',multiplier:p.Talent[0]}]);check('followup','spGain',1);}
  if(u.gear?.cone){const cone=u.gear.cone,table=CONE_TABLES[cone.id];if(!table)fail('光锥被动未登记');else if(!equal(cone.p,table.params[cone.superimpose]?.param_list))fail('光锥叠影参数与正式服不符');}
  for(const s of u.gear?.sets??[]){const table=SET_TABLES[s.id];if(!table)fail('套装效果未登记');else if(!equal(s.p2,table.p2)||!equal(s.p4,table.p4))fail('套装参数与正式服不符');}
  return [...new Set(errors)];
}
export function characterKit({ctx,characterId,panel,level=80,eidolon=0,levels={},variant='base',technique=false,lightconeId=null,superimpose=1,relicSets=[]}) {
  if(!KIT_IDS.includes(characterId))return null;
  if(REGISTERED_IDS.includes(characterId))return compileRegisteredKit({ctx,characterId,panel,level,eidolon,levels,variant,technique,lightconeId,superimpose,relicSets});
  const ch=ctx.charById.get(characterId), enhanced=characterId===1306&&variant==='enhanced';
  const element=({量子:'Quantum',物理:'Physical',风:'Wind'})[ch.element]??ch.element;
  if(!['base','enhanced'].includes(variant)||variant==='enhanced'&&characterId!==1306)throw new Error('角色形态无效');
  const extra=enhanced?ch.enhanced?.['1']:null;
  if(enhanced&&!extra)throw new Error('数据源缺少强化花火');
  const rows=extra?Object.values(extra.skills).map(s=>({...s,type:s.type??(s.type_name==='天赋'?'Talent':s.type),params:s.level,spBase:s.sp_base,bpNeed:s.bp_need,bpAdd:s.bp_add,stance:s.show_stance_list})):ctx.skillsByChar.get(characterId);
  const read=type=>{
    const s=rows.find(s=>s.type===type);if(!s)throw new Error(ch.name+'缺少 '+type+' 数据');
    const base=levels[type]??(type==='Normal'?6:type==='Maze'?1:10);
    if(!Number.isInteger(base)||base<1||base>(type==='Normal'?6:type==='Maze'?1:10))throw new Error('基础技能等级无效');
    const lv=effectiveSkillLevel(ctx,characterId,type,base,eidolon),p=skillParamsAt(s,lv);
    if(!p.params||p.clamped)throw new Error(ch.name+'技能参数缺失');
    return {...s,p:p.params,level:lv};
  };
  const skills=Object.fromEntries(['Normal','BPSkill','Ultra','Talent','Maze'].map(t=>[t,read(t)]));
  const ranks=extra?Object.entries(extra.ranks).map(([r,v])=>({rank:Number(r),params:v.param_list})):ctx.ranksByChar.get(characterId);
  const traces=extra?Object.values(extra.skill_trees).map(t=>t['1']).filter(t=>t.point_type===3).map(t=>({id:t.point_id,promotionLimit:t.avatar_promotion_limit,params:t.param_list})):ctx.tracesByChar.get(characterId).filter(t=>t.type===3);
  const promotion=promotionForLevel(ctx,level), trace={};
  for(const t of traces)if((t.promotionLimit??0)<=promotion)trace[String(t.id).slice(-1)]=copy(t.params);
  const params=Object.fromEntries(Object.entries(skills).map(([k,s])=>[k,copy(s.p)]));
  const kit={revision:KIT_REVISION,characterId,variant,enhanced,eidolon,params,skillLevels:Object.fromEntries(Object.entries(skills).map(([k,s])=>[k,s.level])),trace:copy(trace),ranks:copy(Object.fromEntries(ranks.map(r=>[r.rank,r.params]))),technique:!!technique};
  const act=(type,{terms=[],target='single',hitShares=[1],...rest}={})=>{
    const s=skills[type];return {name:s.name,type,element,target,terms,hitShares,
      spCost:Math.max(0,s.bpNeed??0),spGain:Math.max(0,s.bpAdd??0),energyGain:s.spBase??0,
      toughness:target==='all'?s.stance?.[1]??0:s.stance?.[0]??0,...rest};
  };
  const atk=m=>[{scaling:'atk',multiplier:m}];
  const basic=act('Normal',{terms:atk(params.Normal[0]),hitShares:characterId===1015?[.3,.35,.35]:characterId===1414?[.3,.7]:[1]});
  const skill=act('BPSkill',{target:characterId===1015?'single':'ally',terms:characterId===1015?atk(params.BPSkill[0]):[]});
  const ultimate=act('Ultra',{target:characterId===1306?'allies':characterId===1015?'single':'all',terms:characterId===1306?[]:atk(params.Ultra[0]+(characterId===1412&&eidolon>=4?kit.ranks[4][0]:0)),energyCost:ch.energyMax,hitShares:characterId===1015?[...Array(14).fill(.04),.44]:[1]});
  const actions={basic,skill,ultimate};
  if(characterId===1015)actions.followup=act('Talent',{terms:atk(params.Talent[0]),spGain:1});
  if(characterId===1414){
    actions.dragon={name:'龙灵 · 强化攻击',type:'Talent',element:'Physical',target:'all',terms:atk(params.Ultra[1]),toughness:skills.Talent.stance?.[1]??0,hitShares:[.25,.25,.25,.25],energyGain:0};
    actions.dragonShield={name:'龙灵 · 护佑',type:'Support',target:'self',terms:[],energyGain:0};
  }
  const {gear,unsupported}=compileGear(ctx,ch,{lightconeId,superimpose,relicSets});
  return {id:'char-'+characterId,name:ch.name+(enhanced?'（强化）':''),characterId,astralExpress:ASTRAL_EXPRESS.includes(characterId),path:ch.path,side:'ally',level,element,panel:copy(panel),baseSpeed:ctx.charStatsById.get(characterId)?.[0]?.spd??panel.speed,
    energyMax:ch.energyMax,energy:ch.energyMax/2,aggro:characterId===1015?75:characterId===1414?150:100,
    actions,kit,gear:copy(gear),policy:{autoUltimate:true,...(characterId===1414?{maintainBond:true}:{})},unsupported,
    coverage:{revision:KIT_REVISION,dataset:ctx.data._meta.version,scope:'单 / 多波次 · 四人角色机制 / 已登记光锥与套装',source:'DimbreathBot/TurnBasedGameData@312b4597691e0a29cf9828a15b592757dba86949'}};
}
