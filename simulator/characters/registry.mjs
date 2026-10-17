import {effectiveSkillLevel,promotionForLevel} from '../../core/ctx.mjs';
import {ROSTER_DATA} from '../roster-data.mjs';
import {ASTRAL_EXPRESS} from '../game-data.mjs';
import {compileGear,validateGear} from '../gear.mjs';
import {ACTION_BUILDERS,buildRosterActions} from './actions.mjs';
import {EXTRA_IDS,EXTRA_ACTIONS} from './extra/index.mjs';
export const REGISTERED_IDS=[1101,1105,1202,1313,1403,1009,1106,1215,1301,1002,1103,1013,1303,1309,1001,1104,1110,1203,1207,1211,1217,...EXTRA_IDS];
const clone=x=>JSON.parse(JSON.stringify(x));
const elementOf=s=>({物理:'Physical',火:'Fire',冰:'Ice',雷:'Thunder',风:'Wind',量子:'Quantum',虚数:'Imaginary'})[s]??s;
export function registeredActions(id,p,{eidolon=0,variant='base',variantSkills=null}={}){
  // 新增角色使用 actions.mjs 中按 4.6 说明索引逐一核对的动作表。
  if(ACTION_BUILDERS[id])return buildRosterActions(id,p,ROSTER_DATA[id]);
  // extra/batchNN.mjs 里各批次独立登记的动作表（自动加载，见 extra/index.mjs）。
  if(EXTRA_ACTIONS[id]){
    const actions=clone(EXTRA_ACTIONS[id](p,ROSTER_DATA[id],{eidolon}));
    if(id===1212&&variant==='enhanced'){
      const source=variantSkills?.skills;
      for(const [key,skillId] of Object.entries({basic:1121201,skill:1121202,ultimate:1121203,enhancedSkill:1121209})){
        const a=actions[key],s=source?.[skillId];if(!a||!s)continue;
        const sourceLevel=Object.keys(s.params??{}).find(level=>JSON.stringify(s.params[level]?.param_list)===JSON.stringify(p[s.type]));
        const values=s.params?.[sourceLevel??'10']?.param_list??s.params?.['10']?.param_list??[];
        a.name=s.name;a.energyGain=s.spBase??a.energyGain;a.spCost=Math.max(0,s.bpNeed??0);a.spGain=s.bpAdd??0;
        if(a.terms?.length)a.terms=a.terms.map(t=>({...t,scaling:'hp',multiplier:t.target==='adjacent'?(values[2]??values[0]):values[0]}));
      }
    }
    return actions;
  }
  const element=elementOf(ROSTER_DATA[id].element),atk=m=>[{scaling:'atk',multiplier:m}],hp=m=>[{scaling:'hp',multiplier:m}];
  const action=(type,name,target,terms,energyGain,spCost=0,spGain=0,toughness=0)=>({name,type,element,target,terms,energyGain,spCost,spGain,toughness,hitShares:[1]});
  const name=t=>Object.values(ROSTER_DATA[id].skills).find(s=>s.type===t).name;
  // 阮•梅 / 知更鸟：战技与终结技都是对自身 / 全队的纯辅助技能，没有伤害项。
  if(id===1303||id===1309){
    const basic=action('Normal',name('Normal'),'single',atk(p.Normal[0]),20,0,1,30);
    if(ROSTER_DATA[id].hits?.[id===1309?'Avatar_Robin_00_Skill01_Phase02':'Avatar_RuanMei_Skill01_Phase02'])basic.hitShares=clone(ROSTER_DATA[id].hits[id===1309?'Avatar_Robin_00_Skill01_Phase02':'Avatar_RuanMei_Skill01_Phase02']);
    const skill=action('BPSkill',name('BPSkill'),'self',[],30,1,0,0);
    const ultimate=action('Ultra',name('Ultra'),'allies',[],5,0,0,0);ultimate.energyCost=ROSTER_DATA[id].energyMax;
    return {basic,skill,ultimate};
  }
  const basic=action('Normal',name('Normal'),id===1403?'blast':'single',id===1403?[...hp(p.Normal[0]),{...hp(p.Normal[1])[0],target:'adjacent'}]:atk(p.Normal[0]),20,0,1,30);
  if(id===1403)basic.adjacentToughness=15;
  if(id===1202)basic.hitShares=[.3,.7];
  const skill=action('BPSkill',name('BPSkill'),id===1403?'self':[1009,1106,1215].includes(id)?'single':'ally',[1009,1106,1215].includes(id)?atk(p.BPSkill[0]):[],id===1009?6:30,1,0,[1009].includes(id)?30:[1106,1215].includes(id)?60:0);
  if(id===1009)Object.assign(skill,{bounceCount:eidolon>=1?5:4,bounceToughness:15,bounceEnergy:6});
  if([1002,1103,1013].includes(id)){Object.assign(skill,{target:id===1013?'all':id===1103?'blast':'single',terms:atk(p.BPSkill[0]),toughness:id===1013?30:60});if(id===1103){skill.terms.push({...atk(p.BPSkill[1])[0],target:'adjacent'});skill.adjacentToughness=30;}if(id===1002)skill.hitShares=[.3,.15,.15,.4];if(id===1013)skill.hitShares=[.3,.7];}
  if(id===1002)basic.hitShares=[.45,.55];
  if([1106,1301].includes(id))basic.hitShares=[.5,.5];
  const ultimate=action('Ultra',name('Ultra'),[1403,1106,1301].includes(id)?'all':[1101,1105,1009].includes(id)?'allies':'ally',id===1403?hp(p.Ultra[0]):id===1106?atk(p.Ultra[3]):id===1301?atk(p.Ultra[0]):[],5,0,0,[1403,1106,1301].includes(id)?60:0);ultimate.energyCost=ROSTER_DATA[id].energyMax;
  const out={basic,skill,ultimate};
  if([1002,1103,1013].includes(id))Object.assign(ultimate,{target:id===1002?'single':'all',terms:atk(p.Ultra[0]),toughness:id===1002?90:60});
  if(id===1101)out.followup=action('Talent','布洛妮娅 · 协同射击','single',atk(p.Normal[0]*ROSTER_DATA[id].ranks[4][0]),5,0,0,30);
  if(id===1403)out.followup=action('Talent',name('Talent'),'all',hp(p.Talent[0]),5,0,0,15);
  if(id===1301){out.enhancedBasic=action('Normal','酒花奔涌','single',atk(p.EnhancedNormal[0]),20,0,1,90);out.enhancedBasic.hitShares=[.25,.15,.6];}
  if(id===1013)out.followup=action('Talent',name('Talent'),'all',atk(p.Talent[1]),5,0,0,15);
  return out;
}
export function compileRegisteredKit({ctx,characterId,panel,level=80,eidolon=0,levels={},variant='base',technique=false,...equipment}){
  if(!REGISTERED_IDS.includes(characterId))return null;
  // 瓦尔特的 4.6 强化形态由原始 enhanced ability 子表驱动；其角色工厂已实现对应机制，
  // 但编译器此前把所有 extra 角色一概锁在 base，令该形态只能通过手工篡改 kit 启用。
  if(variant!=='base'&&!([1004,1212].includes(characterId)&&variant==='enhanced'))throw new Error('此角色尚无可用的强化形态');
  const data=ROSTER_DATA[characterId],params={},skillLevels={},variantData=variant==='enhanced'?ctx.charById.get(characterId)?.enhanced?.['1']:null;
  const variantTypes={1121201:'Normal',1121202:'BPSkill',1121203:'Ultra',1121204:'Talent',1121206:'Maze',1121209:'BPSkill'};
  const variantSkills=variantData?{skills:Object.fromEntries(Object.values(variantData.skills).map(s=>[s.id,{id:s.id,name:s.name,type:variantTypes[s.id]??s.type,spBase:s.sp_base,bpNeed:s.bp_need,bpAdd:s.bp_add,params:s.level}]))}:null;
  for(const type of ['Normal','BPSkill','Ultra','Talent','Maze']){
    const base=levels[type]??(type==='Normal'?6:type==='Maze'?1:10);
    if(!Number.isInteger(base)||base<1||base>(type==='Normal'?6:type==='Maze'?1:10))throw new Error('基础技能等级无效');
    const lv=effectiveSkillLevel(ctx,characterId,type,base,eidolon),s=Object.values(data.skills).find(s=>s.type===type),enhancedSkill=variantSkills&&Object.values(variantSkills.skills).find(x=>x.type===type),p=enhancedSkill?.params?.[lv]?.param_list??s?.params?.[lv]?.param_list;
    if(!p)throw new Error(data.name+'技能参数缺失');params[type]=clone(p);skillLevels[type]=lv;
  }
  if(characterId===1301){skillLevels.EnhancedNormal=skillLevels.Normal;params.EnhancedNormal=clone(data.skills[130108].params[skillLevels.Normal].param_list);}
  const promotion=promotionForLevel(ctx,level),trace={};for(const t of data.traces)if((t.promotionLimit??0)<=promotion)trace[String(t.id).slice(-1)]=clone(t.params);
  const {gear,unsupported}=compileGear(ctx,ctx.charById.get(characterId),equipment);
  const enhanced=[1004,1212].includes(characterId)&&variant==='enhanced';
  const ranks=variantData?Object.fromEntries(Object.entries(variantData.ranks).map(([k,r])=>[k,clone(r.param_list)])):clone(data.ranks);
  if(variantSkills)variantSkills.ranks=clone(ranks);
  return {id:'char-'+characterId,characterId,name:data.name+(enhanced?'（强化）':''),side:'ally',level,element:elementOf(data.element),path:data.path,astralExpress:ASTRAL_EXPRESS.includes(characterId),panel:clone(panel),baseSpeed:ctx.charStatsById.get(characterId)?.[0]?.spd??panel.speed,energyMax:data.energyMax,energy:data.energyMax/2,aggro:data.aggro,
    kit:{adapter:'roster-v1',revision:'4.6-party-1',characterId,variant,enhanced,eidolon,technique,params,skillLevels,trace,ranks,...(variantSkills?{variantSkills}:{})},actions:registeredActions(characterId,params,{eidolon,variant,variantSkills}),gear,unsupported,
    policy:{autoUltimate:true,...([1105,1301].includes(characterId)?{healBelow:.75}:{})},coverage:{revision:'4.6-roster-1',dataset:'4.6',scope:'已登记普通 / 战技 / 终结 / 天赋 / 行迹 / 星魂 / 秘技；规则测试，不代表完整录像验证',source:'data/combat/roster-evidence.json'}};
}
export function validateRegisteredKit(u){
  const d=ROSTER_DATA[u.characterId],k=u.kit,errors=[],equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b),fail=s=>errors.push(u.name+'：'+s);
  if(!REGISTERED_IDS.includes(u.characterId)||k?.adapter!=='roster-v1')return [u.name+'角色模块未登记'];
  if(k.variant!=='base'&&!([1004,1212].includes(u.characterId)&&k.variant==='enhanced'))fail('角色强化形态未登记');
  if(!!k.enhanced!==([1004,1212].includes(u.characterId)&&k.variant==='enhanced'))fail('强化形态标记与选择不一致');
  const promotion=[20,30,40,50,60,70,80].findIndex(n=>u.level<=n),trace={};for(const t of d.traces)if((t.promotionLimit??0)<=promotion)trace[String(t.id).slice(-1)]=t.params;
  if(!equal(k.trace,trace)||!equal(k.ranks,k.variant==='enhanced'&&k.variantSkills?.ranks?k.variantSkills.ranks:d.ranks))fail('行迹 / 星魂参数与正式服不符');
  if(u.energyMax!==d.energyMax||u.aggro!==d.aggro||u.element!==elementOf(d.element)||u.astralExpress!==ASTRAL_EXPRESS.includes(u.characterId))fail('角色基础规则与正式服不符');
  for(const type of ['Normal','BPSkill','Ultra','Talent','Maze']){const s=k.variant==='enhanced'?Object.values(k.variantSkills?.skills??{}).find(s=>s.type===type):null,base=Object.values(d.skills).find(s=>s.type===type);if(!equal(k.params?.[type],s?.params?.[k.skillLevels?.[type]]?.param_list??base.params?.[k.skillLevels?.[type]]?.param_list))fail(type+'技能参数与正式服不符');}
  if(u.characterId===1301&&!equal(k.params?.EnhancedNormal,d.skills[130108].params[k.skillLevels?.Normal]?.param_list))fail('强化普攻参数与正式服不符');
  if(!errors.length){const expected=registeredActions(u.characterId,k.params,k);for(const key of Object.keys(expected))for(const field of new Set([...Object.keys(expected[key]),...Object.keys(u.actions?.[key]??{})]))if(field!=='targetId'&&!equal(u.actions?.[key]?.[field],expected[key][field]))fail(key+'.'+field+' 与登记机制不符');for(const key of Object.keys(u.actions??{}))if(!expected[key])fail('未登记动作 '+key);}
  errors.push(...validateGear(u));return [...new Set(errors)];
}
