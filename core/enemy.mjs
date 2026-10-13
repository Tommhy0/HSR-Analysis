// 敌人模型。两条路径，用途不同：
//
//   source:'abyss'   直接读 abyss_wave_monsters 预先算好的列。
//                    7806 行，hp/level/speed/stance/toughness **零 NULL**，
//                    血量公式已反算通过。三深渊走这条，**不需要自己算**。
//
//   source:'monster' 自由沙盒，现场按公式拼：
//                    HP   = monster_stats.hp_base × hp_modify_ratio × 精英组.HPRatio × 硬等级组.HPRatio
//                    ATK  = monster_stats.attack_base × attack_modify_ratio × ...
//                    DEF  = monster_stats.defence_base × hard_level_groups.defence_ratio × defence_modify_ratio
//                    这条路径没有对拍来源，但可以拿 abyss 路径对拍它（verify 第 8 节）。
//
// ★ 键的坑（搞反会静默丢 12% 的数据）★
//   abyss_wave_monsters.monster_id 是 **child_id**（7806/7806 全中）。
//   要拿抗性/弱点，得用 monster_childs.child_id = abyss.monster_id；
//   要拿基准白值，得用 monster_stats.monster_id = abyss.base_monster_id。
//   （monster_stats 按父 id 建键，只覆盖 6885/7806 —— 差的那 921 行正是子体。）
import { ELEMENTS } from './ctx.mjs';

/** 效果抵抗不是属性抗性。abyss_wave_monsters.status_res 那一列是**效果抵抗**
 *  （取值 10/20/30/27.2… 连续百分数），跟伤害公式没关系，别拿来当抗性用。 */

/** 星铁的抗性乘区为 1 - 有效抗性；负抗性不折半。 */
export function resMultiplier(res, pen = 0) {
  const d = (res ?? 0) - (pen ?? 0);
  return Math.max(0, 1 - d);
}

/**
 * 防御乘区。
 *   def 传的是**已含 defence_base 的最终防御值**，除以 10 换成社区的「(敌等级+20)」量纲 ——
 *   已验证 hlg=1 时 `210 × defence_ratio ≡ 200 + 10×等级`，所以 DEF/10 就是 等级+20。
 *   defence_base=315 的次元扑满系因此会得到 1.5 倍的防御项（L80 时 0.4 而非 0.5）。
 */
export function defMultiplier(atkLevel, def, { defShred = 0, defIgnore = 0 } = {}) {
  if (!(def >= 0)) throw new Error(`defMultiplier: 防御值无效 (${def})`);
  const atkTerm = atkLevel + 20;
  const defTerm = (def / 10) * Math.max(0, 1 - defShred - defIgnore);
  return atkTerm / (atkTerm + defTerm);
}

/** 我方等级 80 打等级 80 的常规怪，防御乘区应为 0.5。这是本项目最硬的一条自洽锚点。 */
export const DEF_ANCHOR = { atkLevel: 80, enemyLevel: 80, defenceBase: 210, expected: 0.5 };

// ---------------------------------------------------------------------------
// 硬等级组
// ---------------------------------------------------------------------------

/**
 * 取硬等级组的一行。
 * ⚠ hard_level_group=1401 的 defence_ratio 是 40/40 全 NULL —— 这里**显式抛错**，
 *   绝不让 NULL 变成 0 或 NaN 沿公式传播（NaN 会让整张表静默变成 NaN）。
 */
function hardLevelRow(ctx, group, level) {
  if (group == null) throw new Error('敌人缺少 hard_level_group');
  const row = ctx.hardLevel.get(`${group}:${level}`);
  if (!row) {
    const avail = ctx.data.hardLevels.filter((h) => h.group === group).map((h) => h.level);
    throw new Error(
      `硬等级组 ${group} 没有等级 ${level} 的行（该组只有 ${avail.length} 级：` +
      `${avail.slice(0, 5).join(',')}${avail.length > 5 ? '…' : ''}）`);
  }
  return row;
}

function requireNum(v, what) {
  if (v == null) throw new Error(`${what} 为 NULL（源数据缺失，不能当成 0 用）`);
  if (!Number.isFinite(v)) throw new Error(`${what} 不是有限数 (${v})`);
  return v;
}

/** 只有参与伤害计算的量才强制要求存在；速度/攻击/韧性缺失时保留 null。 */
function optMul(v, dflt = 1) {
  return Number.isFinite(v) ? v : dflt;
}

/** 若干因子相乘；**任一因子为 null/NaN 就整体返回 null**（不要用 1 顶替，那会造出假数字）。 */
function prod(...xs) {
  if (xs.some((x) => x == null || !Number.isFinite(x))) return null;
  return xs.reduce((a, b) => a * b, 1);
}

// ---------------------------------------------------------------------------
// 血量公式（★ 已在全部 7806 行上验证通过）
// ---------------------------------------------------------------------------

/**
 * 三深渊怪物的血量公式。**这是本项目唯一一条 100% 对拍通过的公式。**
 *
 *   hp = hp_base × hp_modify_ratio × eg_hp_ratio × hlg_hp_ratio × (1 + infinite_param)
 *   最后取 1 位小数。
 *
 * `infinite_param` 是**无限波的 HP 成长参数**，最容易漏 —— 漏了会让 484+256+252…
 * 这些行的血量偏低 2~5 倍，而且低于 5846 行 null 的行完全正常，所以不看分组根本发现不了。
 * 加回 (1+infinite_param) 再按 1 位小数取整后，7806/7806 全部吻合。
 *
 * 注意 `elite_group` 用的是 operands 里记的那个，**不一定等于 monster_childs 自带的** ——
 * 异相/虚构会给同一只怪套一个场景专用的精英组（如 623 的 hp_ratio 是 0.25），
 * 那个覆盖值只存在于这一行的 operands 里，monster_childs 是查不到的。
 */
export function abyssHpFromOperands(operands) {
  if (!operands) return null;
  const v = operands.hp_base * operands.hp_modify_ratio
    * (operands.eg_hp_ratio ?? 1) * (operands.hlg_hp_ratio ?? 1)
    * (1 + (operands.infinite_param ?? 0));
  return Math.round(v * 10) / 10;
}

// ---------------------------------------------------------------------------
// 抗性 / 弱点
// ---------------------------------------------------------------------------

/** 把稀疏抗性表补全成 7 属性全表。**表里没列的就是 0，不要从弱点反推** ——
 *  1731 行里有 107 行「弱点的补集」并不等于抗性列出集（有的怪既是弱点又有抗性）。 */
export function fullResistance(list) {
  const out = Object.fromEntries(ELEMENTS.map((e) => [e, 0]));
  for (const it of list ?? []) {
    if (it?.damage_type && Number.isFinite(it.value)) out[it.damage_type] = it.value;
  }
  return out;
}

/** 取某子体的抗性/弱点。childId 是 monster_childs.child_id。 */
export function childTraits(ctx, childId) {
  return ctx.monsterChildByChildId.get(childId) ?? null;
}

/**
 * 某只怪在某等级的防御值。`DEF = defence_base × hard_level.defence_ratio × defence_modify_ratio`。
 *
 * ★ monster_stats 要回退到 baseMonsterId ★
 *   7806 行深渊怪物里有 **921 行**的 monster_id 在 monster_stats 里查不到
 *   （那些是「同一只怪的变体子体」，如 100401401 / 100401402，白值挂在父体 1004014 上）。
 *   只查自身的话这 921 行的防御取不到 —— 而「取不到」在 damage.mjs 里表现为
 *   **防御乘区静默变成 1.0**，伤害凭空偏高 1.5 倍左右，界面上还显示一切正常。
 *   回退到 baseMonsterId 之后 7806/7806 行全覆盖，且 DEF/10 ≡ 等级+20 依然成立。
 *
 * @returns {number|null} null 表示取不到（调用方必须报 unknown，**不要当 1 用**）
 */
export function enemyDefence(ctx, { monsterId, baseMonsterId = null, level, child = null }) {
  const st = ctx.monsterStatsById.get(monsterId)
    ?? (baseMonsterId != null ? ctx.monsterStatsById.get(baseMonsterId) : null);
  if (!st || !Number.isFinite(st.def)) return null;
  const c = child ?? childTraits(ctx, monsterId);
  if (!c) return null;
  const hl = ctx.hardLevel.get(`${c.hardLevelGroup}:${level}`);
  if (!hl || !Number.isFinite(hl.def)) return null;
  return st.def * hl.def * (c.defMod ?? 1);
}

// ---------------------------------------------------------------------------
// 构建敌人
// ---------------------------------------------------------------------------

function makeEnemy(fields) {
  return {
    _provenance: {},
    ...fields,
  };
}

/**
 * 三深渊路径。spec: {mode, seasonId, floorId, side?, wave?, slot?, event?}
 * 不给 side/wave 时返回该层所有波次的全部怪物。
 */
export function listAbyssEnemies(ctx, spec) {
  const key = `${spec.mode}:${spec.seasonId}:${spec.floorId}`;
  let rows = ctx.waveByKey.get(key) ?? [];
  if (rows.length === 0) return [];
  if (spec.side != null) rows = rows.filter((r) => r.side === spec.side);
  if (spec.event != null) rows = rows.filter((r) => r.event === spec.event);
  if (spec.wave != null) rows = rows.filter((r) => r.wave === spec.wave);

  return rows.map((r) => {
    const child = childTraits(ctx, r.monsterId);   // ← monster_id 是 child_id
    const res = fullResistance(child?.res);
    const def = enemyDefence(ctx, {
      monsterId: r.monsterId, baseMonsterId: r.baseMonsterId, level: r.level, child,
    });
    return makeEnemy({
      source: 'abyss',
      def,                         // ★ 少了这一行，防御乘区会静默变成 1.0
      mode: r.mode, seasonId: r.seasonId, floorId: r.floorId,
      side: r.side, wave: r.wave, slot: r.slot, event: r.event,
      childId: r.monsterId,
      monsterId: r.baseMonsterId,
      name: r.name,
      level: r.level,
      hp: r.hp,
      speed: r.spd,
      stance: r.stance,            // 韧性
      toughness: r.toughness,
      weakness: r.weak ?? [],
      res,
      statusRes: r.statusRes,      // ← 效果抵抗，**不是**属性抗性
      spawnCount: r.spawnCount ?? 1,
      hpCount: r.hpCount ?? 1,
      phaseRatios: r.phaseRatios,
      isInfinite: r.isInfinite,
      _provenance: {
        hp: 'known', level: 'known', res: 'known',
        def: def == null ? 'unknown' : 'known',
        note: '取自 abyss_wave_monsters 预算列；防御按 defence_base × defence_ratio × defence_modify_ratio 补算',
      },
    });
  });
}

/**
 * 自由沙盒路径。spec: {monsterId, childId?, level, eliteGroup?, hardLevelGroup?, infiniteParam?}
 *
 * 走公式；hp/atk/def 都用 monster_stats × 修正 × 精英组 × 硬等级组。
 *
 * ⚠ 三深渊**不用**这条路径 —— 它会给同一只怪套场景专用的精英组和硬等级组
 *   （只存在于 abyss_wave_monsters.hp_formula_json.operands 里，monster_childs 查不到）。
 *   所以如果不显式传 eliteGroup / hardLevelGroup，结果会和深渊表里的血量对不上，
 *   这是**预期行为**，不是 bug。要复现深渊的数值就把这两项传进来。
 */
export function buildMonster(ctx, spec) {
  const childArr = ctx.monsterChildsById.get(spec.monsterId) ?? [];
  const child = spec.childId != null
    ? childArr.find((c) => c.childId === spec.childId)
    : childArr[0];
  if (!child) throw new Error(`怪物 ${spec.monsterId} 没有对应的 child 行`);

  // 和 enemyDefence 一样回退父体：变体子体的白值挂在 base 上（921 行属于这种）
  const baseId = spec.baseMonsterId ?? child.monsterId;
  const st = ctx.monsterStatsById.get(spec.monsterId)
    ?? ctx.monsterStatsById.get(baseId);
  if (!st) throw new Error(`怪物 ${spec.monsterId} 没有 monster_stats 行（父体 ${baseId} 也没有）`);

  const hlgId = spec.hardLevelGroup ?? child.hardLevelGroup;
  const hl = hardLevelRow(ctx, hlgId, spec.level);
  const egId = spec.eliteGroup ?? child.eliteGroup;
  const eg = ctx.eliteGroupById.get(egId);
  if (!eg) throw new Error(`精英组 ${egId} 不存在`);

  // hp 与 def 参与伤害计算，缺失就报错；atk/spd/stance 缺失时保留 null。
  // 血量取 1 位小数 —— 建库时就是这么存的，不取整会让对拍出现 850.81 vs 850.8 的假不符。
  // (1 + infiniteParam) 是无限波的 HP 成长项。深渊表里 1960 行有值，漏了会让血量偏低 1.4~5.2 倍。
  const hpRaw = requireNum(st.hp, 'hp_base')
    * optMul(child.hpMod) * optMul(eg.hpRatio) * requireNum(hl.hp, 'hard_level.hp_ratio')
    * (1 + (spec.infiniteParam ?? 0));
  const hp = Math.round(hpRaw * 10) / 10;
  const def = requireNum(st.def, 'defence_base')
    * requireNum(hl.def, `hard_level.defence_ratio(组 ${hlgId} 等级 ${spec.level})`)
    * optMul(child.defMod);
  // 这些不参与伤害计算，缺一个因子就整体给 null —— 不要用 1 顶替，那会造出一个假数字。
  const atk = prod(st.atk, child.atkMod, eg.atkRatio, hl.atk);
  const spd = prod(st.spd, child.spdMod, eg.spdRatio, hl.spd) == null
    ? null : prod(st.spd, child.spdMod, eg.spdRatio, hl.spd) + (child.spdVal ?? 0);

  const m = ctx.monsterById.get(spec.monsterId);
  return makeEnemy({
    source: 'monster',
    monsterId: spec.monsterId, childId: child.childId,
    name: m?.name ?? String(spec.monsterId),
    level: spec.level,
    hp, atk, def, speed: spd,
    stance: st.stance == null ? null
      : st.stance * optMul(child.stanceMod) * optMul(eg.stanceRatio) + (child.stanceVal ?? 0),
    toughness: null,
    // 弱点与抗性都用子体的（同一只怪的不同子体弱点是不同的）
    weakness: child.weak ?? m?.weak ?? [],
    res: fullResistance(child.res),
    statusRes: st.statusRes,
    spawnCount: 1, hpCount: 1, phaseRatios: [1],
    isInfinite: false,
    _provenance: { hp: 'known', level: 'known', def: 'known', res: 'known', atk: 'known' },
  });
}

/** 统一入口。source 省略时按有没有 mode 判断。 */
export function buildEnemy(ctx, spec) {
  if (spec.source === 'monster' || (!spec.source && spec.monsterId != null && spec.mode == null)) {
    return buildMonster(ctx, spec);
  }
  const all = listAbyssEnemies(ctx, spec);
  if (!all.length) throw new Error(`深渊 ${spec.mode}:${spec.seasonId}:${spec.floorId} 没有怪物行`);
  if (all.length === 1) return all[0];
  // 多只时把整队总和也带上，方便「这一层要打多少血」
  return {
    ...makeEnemy({
      source: 'abyss', group: true,
      name: `${spec.mode} 期 ${spec.seasonId} 层 ${spec.floorId}`,
      members: all,
      hp: all.reduce((s, e) => s + e.hp * (e.spawnCount ?? 1), 0),
      _provenance: { hp: 'known', level: 'known', res: 'known' },
    }),
  };
}

/** 该层该侧的总血量（含 spawn_count 复制体）。判据①要用。 */
export function waveTotalHp(enemies) {
  return (enemies ?? []).reduce((s, e) => s + (e.hp ?? 0) * (e.spawnCount ?? 1), 0);
}

/** 列出所有可选的深渊层，给界面下拉框。 */
export function listAbyssFloors(ctx) {
  const seen = new Map();
  for (const f of ctx.data.abyssFloors) {
    const key = `${f.mode}:${f.seasonId}`;
    if (!seen.has(key)) {
      const s = ctx.seasonByKey.get(key);
      seen.set(key, { key, mode: f.mode, seasonId: f.seasonId, name: s?.name ?? key, floors: [] });
    }
    const g = seen.get(key);
    const wave = ctx.waveByKey.get(`${f.mode}:${f.seasonId}:${f.floorId}`) ?? [];
    g.floors.push({
      floorId: f.floorId, name: f.floorName, isBoss: f.isBoss,
      hardName: f.hardName, enemyCount: wave.length,
      levelRange: wave.length ? [Math.min(...wave.map((w) => w.level)), Math.max(...wave.map((w) => w.level))] : null,
    });
  }
  return [...seen.values()];
}
