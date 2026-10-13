// 面板。
//
// ★ 关键区分（弄错会双重计算，而且数字看起来完全合理）★
//
//   面板里**已经含**一切直接改写六维属性的常驻效果：
//     角色白值、光锥白值、行迹的攻击/生命/防御/速度/暴击/暴伤/击破特攻/
//     效果命中/效果抵抗节点、遗器、光锥的常驻属性被动。
//     —— 因为这些都体现在游戏「角色详情」页显示的数字上，用户填的就是那个数。
//
//   走增益管线的是**不进面板**的那一类：
//     造成的伤害提高、技能类型增伤、抗性穿透、
//     减防/无视防御、易伤，以及一切只在战斗中生效的效果。
//     局外元素增伤在 panel.elemDmg 中填写总值，含行迹与属性球。
//     运行期仅在相应元素面板缺省时补入 builtinBuffs，避免行迹算两次。
//
// suggestPanel 提供白值、含行迹的六维，以及含行迹的元素增伤初值。
import { BASE_CRIT_RATE, BASE_CRIT_DAMAGE, ELEMENTS, promotionForLevel, baseStat } from './ctx.mjs';

/** property_type → 面板字段。只列**进面板**的那些（元素增伤不在此，走 buffs.mjs）。 */
const PANEL_STAT = {
  AttackAddedRatio: 'atkPct',
  HPAddedRatio: 'hpPct',
  DefenceAddedRatio: 'defPct',
  SpeedDelta: 'speedFlat',
  CriticalChanceBase: 'critRate',
  CriticalDamageBase: 'critDmg',
  BreakDamageAddedRatioBase: 'breakEffect',
  StatusProbabilityBase: 'effectHit',
  StatusResistanceBase: 'effectRes',
  HealRatioBase: 'healingBoost',
};

/** property_type → 元素增伤。这些**不进面板**，由 buffs.mjs 当常驻增益处理。 */
const ELEM_STAT = {
  PhysicalAddedRatio: 'Physical', FireAddedRatio: 'Fire', IceAddedRatio: 'Ice',
  ThunderAddedRatio: 'Thunder', WindAddedRatio: 'Wind',
  QuantumAddedRatio: 'Quantum', ImaginaryAddedRatio: 'Imaginary',
};

/** 空面板。数字用 0 之外还要保留 undefined 语义 —— null 表示「没填」。 */
export function emptyPanel() {
  return {
    atk: null, hp: null, def: null, speed: null,
    critRate: BASE_CRIT_RATE, critDmg: BASE_CRIT_DAMAGE,
    breakEffect: 0, energyRegen: 1.0, effectHit: 0, effectRes: 0,
    healingBoost: 0,
    elation: null,        // 欢愉度 —— 库内没有基值，恒为 null，见 damage.mjs
  };
}

/**
 * 某个等级的晋阶门槛是否已达成。
 * avatar_promotion_limit 为 null 表示开局就有（97 角色 × 3 个 = 291 个节点）。
 */
function traceUnlocked(limit, promotion) {
  return limit == null || limit <= promotion;
}

/**
 * 取出该角色在给定晋阶下已解锁的**面板类**行迹加成，以及**元素增伤**两桶。
 * 分开返回是刻意的：前者并进面板，后者交给增益管线。
 */
export function traceContributions(ctx, characterId, { level = 80 } = {}) {
  const promotion = promotionForLevel(ctx, level);
  const panel = { atkPct: 0, hpPct: 0, defPct: 0, speedFlat: 0, critRate: 0, critDmg: 0,
                  breakEffect: 0, effectHit: 0, effectRes: 0, elationDmg: 0, healingBoost: 0 };
  const elemDmg = Object.fromEntries(ELEMENTS.map((e) => [e, 0]));
  const nodes = [];

  for (const t of ctx.tracesByChar.get(characterId) ?? []) {
    if (!t.statusAdd?.length) continue;
    if (!traceUnlocked(t.promotionLimit, promotion)) continue;
    for (const s of t.statusAdd) {
      const pt = s.property_type;
      const v = s.value ?? 0;
      if (PANEL_STAT[pt]) {
        panel[PANEL_STAT[pt]] += v;
        nodes.push({ name: t.name, prop: pt, value: v, into: PANEL_STAT[pt] });
      } else if (ELEM_STAT[pt]) {
        elemDmg[ELEM_STAT[pt]] += v;
        nodes.push({ name: t.name, prop: pt, value: v, into: `elemDmg.${ELEM_STAT[pt]}` });
      } else if (pt === 'ElationDamageAddedRatioBase') {
        panel.elationDmg += v;
        nodes.push({ name: t.name, prop: pt, value: v, into: 'elationDmg' });
      }
    }
  }
  return { panel, elemDmg, nodes, promotion };
}

/**
 * 一键填充初值：角色白值 + 光锥白值 + 行迹属性节点。
 *
 * **这是便利功能，不是数据源。** 用户填的最终面板以用户为准 —— 尤其因为
 * 遗器词条这里根本没算（本项目不做遗器模块），所以填出来的数一定偏低，
 * 用户必须自己补上遗器那部分。
 */
export function suggestPanel(ctx, {
  characterId, level = 80, lightconeId = null, lightconeLevel = 80,
} = {}) {
  const ch = ctx.charById.get(characterId);
  if (!ch) return { panel: emptyPanel(), sources: [], warning: '找不到该角色' };

  const promotion = promotionForLevel(ctx, level);
  const row = (ctx.charStatsById.get(characterId) ?? []).find((s) => s.promotion === promotion);
  if (!row) return { panel: emptyPanel(), sources: [], warning: `没有 ${characterId} 在晋阶 ${promotion} 的白值行` };

  const { panel: tr, elemDmg, nodes } = traceContributions(ctx, characterId, { level });

  // 角色白值
  let hpBase = baseStat(row.hp, level);
  let atkBase = baseStat(row.atk, level);
  let defBase = baseStat(row.def, level);
  let speed = row.spd;

  const sources = [
    { label: `${ch.name} 白值`, hp: hpBase, atk: atkBase, def: defBase, spd: speed },
  ];

  // 光锥白值。行迹没给百分比时，这个值直接加到基础部分。
  if (lightconeId != null) {
    const lc = ctx.lcById.get(lightconeId);
    const lcRow = (ctx.lcStatsById.get(lightconeId) ?? [])
      .find((s) => lightconeLevel <= (s.maxLevel ?? 80));
    if (lcRow) {
      const lhp = baseStat(lcRow.hp, lightconeLevel);
      const latk = baseStat(lcRow.atk, lightconeLevel);
      const ldef = baseStat(lcRow.def, lightconeLevel);
      hpBase += lhp ?? 0; atkBase += latk ?? 0; defBase += ldef ?? 0;
      sources.push({ label: `${lc?.name ?? lightconeId} 白值`, hp: lhp, atk: latk, def: ldef });
    } else {
      sources.push({ label: `光锥 ${lightconeId} 没有白值行`, warn: true });
    }
  }

  // 百分比与固定值加成只作用在（角色+光锥）的白值上 —— 这是游戏的实际规则：
  // 攻击力% 乘的是「角色基础攻击 + 光锥基础攻击」，遗器给的固定攻击力不参与。
  const panel = {
    baseStats: { atk: atkBase, hp: hpBase, def: defBase },
    elemDmg: { ...elemDmg },
    atk: atkBase * (1 + tr.atkPct),
    hp: hpBase * (1 + tr.hpPct),
    def: defBase * (1 + tr.defPct),
    speed: speed + tr.speedFlat,
    critRate: BASE_CRIT_RATE + tr.critRate,
    critDmg: BASE_CRIT_DAMAGE + tr.critDmg,
    breakEffect: tr.breakEffect,
    energyRegen: 1.0,
    effectHit: tr.effectHit,
    effectRes: tr.effectRes,
    healingBoost: tr.healingBoost,
    elation: null,
  };

  return {
    panel,
    elemDmg,          // 行迹明细；panel.elemDmg 已含同一份，调用方不能再次叠加。
    promotion,
    sources,
    traceNodes: nodes,
    warning: '未计入遗器，请自行补上。填完请复核。',
  };
}

/** 面板校验。返回问题列表；空数组表示可以用。 */
export function validatePanel(panel) {
  const errs = [];
  for (const k of ['atk', 'hp', 'def', 'speed']) {
    const v = panel[k];
    if (v == null) errs.push({ field: k, level: 'unknown', msg: `${k} 未填` });
    else if (!Number.isFinite(v) || v <= 0) errs.push({ field: k, level: 'unknown', msg: `${k} 必须是正数` });
  }
  if (!Number.isFinite(panel.critRate) || panel.critRate < 0 || panel.critRate > 1) {
    errs.push({ field: 'critRate', level: 'unknown', msg: '暴击率要在 0~1 之间' });
  }
  if (!(panel.critDmg >= 0)) errs.push({ field: 'critDmg', level: 'unknown', msg: '暴击伤害不能为负' });
  return errs;
}

export { PANEL_STAT, ELEM_STAT };
