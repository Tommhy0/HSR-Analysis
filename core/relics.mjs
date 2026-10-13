// Numerical affix tables: Mar-7th/StarRailRes, retained with AGPL-3.0 notice.
export const RELIC_SLOTS = ['头部', '手部', '躯干', '脚部', '位面球', '连结绳'];
export const RELIC_STATS = {
  HPDelta:['生命值','hp',false], AttackDelta:['攻击力','atk',false], DefenceDelta:['防御力','def',false],
  HPAddedRatio:['生命值%','hpPct',true], AttackAddedRatio:['攻击力%','atkPct',true], DefenceAddedRatio:['防御力%','defPct',true],
  SpeedDelta:['速度','speed',false], CriticalChanceBase:['暴击率','critRate',true], CriticalDamageBase:['暴击伤害','critDmg',true],
  StatusProbabilityBase:['效果命中','effectHit',true], StatusResistanceBase:['效果抵抗','effectRes',true],
  BreakDamageAddedRatioBase:['击破特攻','breakEffect',true], SPRatioBase:['能量恢复效率','energyRegen',true], HealRatioBase:['治疗量加成','healingBoost',true],
  ...Object.fromEntries(['Physical','Fire','Ice','Thunder','Wind','Quantum','Imaginary'].map((e,i)=>[e+'AddedRatio',[[ '物理','火','冰','雷','风','量子','虚数'][i]+'属性伤害','elemDmg.'+e,true]])),
};
export const maxRelicLevel = (rarity) => 3 * (rarity - 0);
export function mainAffixes(tables, rarity, slot) {
  return Object.values(tables?.main?.[`${rarity}${slot+1}`]?.affixes ?? {});
}
export function subAffixes(tables, rarity) { return Object.values(tables?.sub?.[String(rarity)]?.affixes ?? {}); }
export function defaultRelics() {
  return RELIC_SLOTS.map((_,slot)=>({slot,enabled:false,rarity:5,level:15,initial:4,main:null,subs:[]}));
}
export function mainValue(affix,level) { return affix.base + affix.step * level; }
export function subValue(affix,rolls) { return rolls.reduce((sum,count,tier)=>sum+count*(affix.base+affix.step*tier),0); }
export function validateRelic(tables,relic) {
  if (!relic.enabled) return [];
  const errors=[], {rarity,level,slot,initial}=relic;
  if (![2,3,4,5].includes(rarity)) errors.push('编辑器支持二至五星常规遗器');
  if (!Number.isInteger(slot)||slot<0||slot>5) errors.push('部位无效');
  if (!Number.isInteger(level)||level<0||level>maxRelicLevel(rarity)) errors.push('强化等级超出范围');
  if (![rarity-2,rarity-1].includes(initial)) errors.push('初始副词条数量不合法');
  const main=mainAffixes(tables,rarity,slot).find(a=>a.property===relic.main);
  if (!main) errors.push('此部位没有该主词条');
  const subs=relic.subs ?? [], expected=Math.min(4,initial+Math.floor(level/3));
  if(subs.length!==expected) errors.push(`当前等级须有 ${expected} 种副词条`);
  const seen=new Set(); let total=0;
  const maximum=1+Math.max(0,Math.floor(level/3)-(4-initial));
  for(const sub of subs) {
    const a=subAffixes(tables,rarity).find(a=>a.property===sub.property);
    if(!a) errors.push('副词条不在属性表中');
    if(sub.property===relic.main) errors.push('副词条不可与主词条相同');
    if(seen.has(sub.property)) errors.push('副词条不可重复'); seen.add(sub.property);
    const rolls=sub.rolls;
    if(!Array.isArray(rolls)||rolls.length!==3||rolls.some(n=>!Number.isInteger(n)||n<0)) {errors.push('低/中/高档次数必须为非负整数');continue;}
    const count=rolls.reduce((a,b)=>a+b,0); total+=count;
    if(count<1||count>maximum) errors.push(`单项副词条须为 1～${maximum} 次`);
  }
  if(total!==initial+Math.floor(level/3)) errors.push(`总次数须为 ${initial+Math.floor(level/3)}（初始 ${initial} + 强化 ${Math.floor(level/3)}）`);
  return [...new Set(errors)];
}
export function relicContributions(tables,relics) {
  const errors=[], values={}, parts=[];
  for(const r of relics ?? []) {
    if(!r.enabled) continue;
    const invalid=validateRelic(tables,r);
    if(invalid.length) {errors.push(...invalid.map(e=>RELIC_SLOTS[r.slot]+'：'+e));continue;}
    const add=(property,value,kind)=>{values[property]=(values[property]??0)+value;parts.push({slot:r.slot,property,value,kind});};
    const main=mainAffixes(tables,r.rarity,r.slot).find(a=>a.property===r.main); add(main.property,mainValue(main,r.level),'主词条');
    for(const s of r.subs) {const a=subAffixes(tables,r.rarity).find(a=>a.property===s.property);add(a.property,subValue(a,s.rolls),'副词条');}
  }
  return {ok:!errors.length,errors,values,parts};
}
export function applyRelics(basePanel,contributions) {
  if(!contributions.ok) throw new Error(contributions.errors.join('；'));
  const out={...basePanel,elemDmg:{...basePanel.elemDmg}};
  for(const [property,value] of Object.entries(contributions.values)) {
    const field=RELIC_STATS[property]?.[1]; if(!field) throw new Error('Unknown property '+property);
    if(field.endsWith('Pct')) {const k=field.slice(0,-3);if(!Number.isFinite(out.baseStats?.[k])) throw new Error('Missing base '+k);out[k]+=out.baseStats[k]*value;}
    else if(field.startsWith('elemDmg.')) {const e=field.slice(8);out.elemDmg[e]=(out.elemDmg[e]??0)+value;}
    else out[field]=(out[field]??0)+value;
  }
  return out;
}
