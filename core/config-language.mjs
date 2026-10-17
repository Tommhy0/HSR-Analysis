// Shared by the offline web importer and the personal AI skill's compiler.
export const CONFIG_SCHEMA='hsr-analysis/team-v1';
export const CHARACTER_ALIASES={
  '红a':1015,'红A':1015,'卫宫':1015,'emiya':1015,'花':1306,'原版花火':1306,'强化花火':1306,'加强花火':1306,
  '刻律':1412,'刻律德拉':1412,'凯撒':1412,'盾丹':1414,'腾荒':1414,'丹恒腾荒':1414,
  '饮月':1213,'龙丹':1213,'丹恒饮月':1213,'四星丹恒':1002,
  '阮':1303,'阮梅':1303,'鸟':1309,'知更鸟':1309,'日':1313,'周日':1313,'星期日':1313,
  '鸭':1101,'布洛妮娅':1101,'狼':1006,'银狼':1006,'缇':1403,'缇缇':1403,'缇宝':1403,
};
export const SET_ALIASES={风套:110,风:110,量子套:108,量子:108,信使:114,司铎:121,学者:122,大公:115,勇烈:120,船长:126,隐士:128,诗人:124,铁骑:119,钟表匠:118,莳者:113,快枪手:102,死水:117,
  翁:308,翁瓦克:308,露:317,露莎卡:317,龙骨:310,都蓝:315,萨尔索图:306,停转:306,繁星:309,竞技场:309,仙舟:302,太空:301,蕉乐园:318};
export const SIGNATURES={1306:23021,1414:23051,1015:23046,1412:23048,1101:23003,1313:23034,1403:23038};
const norm=s=>String(s).normalize('NFKC').toLowerCase().replace(/[\s·•・]/g,'');
export function resolveName(ctx,kind,value){
  const rows=kind==='character'?ctx.data.characters:kind==='lightcone'?ctx.data.lightcones:ctx.data.relicsets;
  if(kind==='character'&&['龙','丹恒','主角','开拓者','三月七','记','停'].includes(String(value)))throw new Error('「'+value+'」有多个含义，请注明角色全名与形态');
  const aliases=kind==='character'?CHARACTER_ALIASES:kind==='set'?SET_ALIASES:{};
  const key=norm(value),id=Object.entries(aliases).find(([a])=>norm(a)===key)?.[1];
  const found=rows.filter(r=>r.id===value||String(r.id)===String(value)||norm(r.name)===key||r.id===id);
  if(found.length!==1)throw new Error('无法唯一识别'+{character:'角色',lightcone:'光锥',set:'套装'}[kind]+'「'+value+'」，请使用数据库全名或 ID');
  return found[0];
}
export function resolveSets(ctx,value){
  if(value==='风翁')value=[{name:'风套',count:4},{name:'翁瓦克',count:2}];
  if(value==='风露')value=[{name:'风套',count:4},{name:'露莎卡',count:2}];
  if(!Array.isArray(value))throw new Error('sets 须为套装数组，或“风翁 / 风露”');
  const out=value.map(s=>{checkKeys(s,['id','name','count'],'套装');return {id:resolveName(ctx,'set',s.id??s.name).id,count:s.count};});
  if(out.some(s=>![2,4].includes(s.count)||s.id>=300&&s.count!==2)||new Set(out.map(s=>s.id)).size!==out.length||out.filter(s=>s.id<300).reduce((a,s)=>a+s.count,0)>4||out.filter(s=>s.id>=300).reduce((a,s)=>a+s.count,0)>2)throw new Error('套装须为外圈四件 / 二加二、内圈两件，不可重复');
  return out;
}
export function checkKeys(o,keys,label){
  if(!o||typeof o!=='object'||Array.isArray(o))throw new Error(label+'须为对象');
  for(const k of Object.keys(o))if(!keys.includes(k))throw new Error(label+'不支持字段 '+k);
}
export function parseStat(value,key){
  const percent=['critRate','critDmg','breakEffect','effectHit','effectRes','healingBoost','elementDmg'].includes(key);
  if(typeof value==='string'){
    const match=value.trim().match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*([%％]?)$/);
    if(!match)throw new Error(key+' 数值格式无效');
    if(match[2]&&!percent&&key!=='energyRegen')throw new Error(key+' 不接受百分号');
    value=Number(match[1])/(match[2]?100:1);
  }
  if(typeof value!=='number'||!Number.isFinite(value)||value<0)throw new Error(key+' 须为非负有限数');
  if(percent&&value>10)throw new Error(key+' 请用百分号，例如“65%”，或小数 0.65');
  if(key==='energyRegen'&&(value<1||value>5))throw new Error('回能须为总倍率，例如 1.1944 或“119.44%”');
  return value;
}
