// 新增角色的动作表。数值索引严格按 4.6 技能说明的 #n 顺序对应 param_list，
// 命中分段取自固定提交的原始 Ability 脚本（经人工核对，剔除了相邻目标 /
// 追加攻击等非主目标 AttackData）。
// 已登记的 14 名角色仍走 registry.mjs 内的原有分支，避免改动既有合同。
const clone=x=>JSON.parse(JSON.stringify(x));const ELEMENT={物理:'Physical',火:'Fire',冰:'Ice',雷:'Thunder',风:'Wind',量子:'Quantum',虚数:'Imaginary'};
export const elementOf=s=>ELEMENT[s]??s;
export const atk=m=>[{scaling:'atk',multiplier:m}];
export const hp=m=>[{scaling:'hp',multiplier:m}];
export const def=m=>[{scaling:'def',multiplier:m}];
const nameOf=(d,type)=>Object.values(d.skills??{}).find(s=>s.type===type)?.name??type;
// mk：统一的动作外壳，字段与既有 registeredActions 保持同一口径。
const mk=(element,type,name,o={})=>Object.assign({name,type,element,target:'single',terms:[],energyGain:20,spCost:0,spGain:0,toughness:0,hitShares:[1]},o);
export function basic(p,d,o={}){return mk(elementOf(d.element),'Normal',nameOf(d,'Normal'),Object.assign({terms:atk(p.Normal[0]),toughness:30,spGain:1,energyGain:20},o));}
export function skill(p,d,o={}){return mk(elementOf(d.element),'BPSkill',nameOf(d,'BPSkill'),Object.assign({energyGain:30,spCost:1},o));}
export function ultimate(p,d,o={}){return mk(elementOf(d.element),'Ultra',nameOf(d,'Ultra'),Object.assign({energyGain:5,energyCost:d.energyMax},o));}
export function talentAction(p,d,o={}){return mk(elementOf(d.element),'Talent',nameOf(d,'Talent'),Object.assign({energyGain:10},o));}

// 每个角色的完整动作集合（含追加动作 / 强化动作）。
export const ACTION_BUILDERS={
  // ── 1203 罗刹：普攻 3 段；战技纯治疗；终结为全体驱散 + 伤害 ──
  1203:(p,d)=>({
    basic:basic(p,d,{terms:atk(p.Normal[0]),hitShares:[.3,.3,.4]}),
    skill:skill(p,d,{target:'ally',terms:[],hitShares:[1]}),
    ultimate:ultimate(p,d,{target:'all',terms:atk(p.Ultra[0]),toughness:60,hitShares:[1]}),
  }),
  // ── 1211 白露：普攻单体；战技 / 终结纯治疗 ──
  1211:(p,d)=>({
    basic:basic(p,d,{terms:atk(p.Normal[0])}),
    skill:skill(p,d,{target:'ally',terms:[]}),
    ultimate:ultimate(p,d,{target:'allies',terms:[]}),
  }),
  // ── 1104 杰帕德：普攻单体；战技单体冰伤 + 冻结；终结全体护盾 ──
  1104:(p,d)=>({
    basic:basic(p,d,{terms:atk(p.Normal[0])}),
    skill:skill(p,d,{terms:atk(p.BPSkill[0]),toughness:60}),
    ultimate:ultimate(p,d,{target:'allies',terms:[]}),
  }),
  // ── 1217 藿藿：普攻 4 段且按生命上限结算；战技 / 终结为治疗与辅助 ──
  1217:(p,d)=>({
    basic:basic(p,d,{terms:hp(p.Normal[0]),hitShares:[.2,.2,.2,.4]}),
    skill:skill(p,d,{target:'ally',terms:[]}),
    ultimate:ultimate(p,d,{target:'allies',terms:[]}),
  }),
  // ── 1110 玲可：普攻按生命上限；战技 / 终结为治疗与增益 ──
  1110:(p,d)=>({
    basic:basic(p,d,{terms:hp(p.Normal[0])}),
    skill:skill(p,d,{target:'ally',terms:[]}),
    ultimate:ultimate(p,d,{target:'allies',terms:[]}),
  }),
  // ── 1207 驭空：普攻单体；战技自身获得鸣弦号令；终结单体虚数伤害 ──
  1207:(p,d)=>({
    basic:basic(p,d,{terms:atk(p.Normal[0])}),
    skill:skill(p,d,{target:'self',terms:[]}),
    ultimate:ultimate(p,d,{terms:atk(p.Ultra[0]),toughness:90}),
  }),
  // ── 1001 三月七：普攻单体；战技单体护盾；终结全体 4 段冰伤 + 冻结；天赋反击 ──
  1001:(p,d)=>({
    basic:basic(p,d,{terms:atk(p.Normal[0])}),
    skill:skill(p,d,{target:'ally',terms:[]}),
    ultimate:ultimate(p,d,{target:'all',terms:atk(p.Ultra[0]),toughness:60,hitShares:[.25,.25,.25,.25]}),
    counter:talentAction(p,d,{terms:atk(p.Talent[0]),toughness:30}),
  }),
};
export function buildRosterActions(id,p,data){const f=ACTION_BUILDERS[id];return f?clone(f(p,data)):null;}
