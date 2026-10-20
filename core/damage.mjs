// 伤害公式链。
//
//   DMG = 基础伤害 × 增伤 × 暴击 × 防御 × 抗性 × 易伤 × 击破 × 减伤 × 段数
//
// ★ 可信度声明（README 里也要写一遍）★
//   整个库里**没有任何一列是游戏内实际打出的伤害** —— 没有伤害日志、没有训练场记录。
//   所以这个模块的正确性只能证明到「输入正确 + 面板正确 + 乘区自洽」，
//   **证明不了最终数字正确**。要真正验证必须靠 _data_cache/anchors.json 里
//   用户回填的实测锚点。每个乘区都单独出值就是为了让单个锚点能二分定位到出错的那个区。
//
// 击破伤害 / 超击破伤害不在 v1 范围内（另一条公式链，用等级基准值而非攻击力倍率）。
import { defMultiplier, resMultiplier } from './enemy.mjs';
import { C, zone, rollupZones, worst } from './provenance.mjs';
// 基数名 → 中文。**只有 abilities.mjs 那一份** —— 这里原先另抄了一份一模一样的，
// 两份表漏掉一个键的表现是界面上冒出 `undefined：面板未填`。
import { SCALING_CN, selectDamageTerms } from './abilities.mjs';

export const ZONE_ORDER = ['base', 'dmgBoost', 'crit', 'def', 'res', 'vuln', 'broken', 'mitigation'];

/** 期望暴击乘区 = 1 + clamp(暴击率,0,1) × 暴击伤害。 */
export function expectedCritMult(critRate, critDmg) {
  return 1 + Math.min(Math.max(critRate ?? 0, 0), 1) * (critDmg ?? 0);
}

/**
 * 缩放基数：把 terms 里的 scaling 名换成面板上的数。
 *
 * `servantHp` 是**忆灵的生命上限**。它本身不是面板项，而是召唤者面板的折算：
 *     忆灵HP = 召唤者（**局内**）生命上限 × pct + flat
 * `panel` 到这里之前已经过 `inCombatPanel()`，所以召唤者的生命上限增益会正确地
 * 传导到忆灵身上。系数（pct/flat）由 listAbilities 按当前技能等级取好挂在 term 上；
 * 取不到就返回 **null**（不兜 0），与全局约定一致。
 */
function scalingValue(panel, scaling, term = null) {
  switch (scaling) {
    case 'atk': return panel.atk;
    case 'hp': return panel.hp;
    case 'def': return panel.def;
    case 'elation': return panel.elation;   // 库内无基值，恒 null
    case 'elationBase': return panel.elationBase;
    case 'servantHp': {
      const f = term?.servantHp;
      if (f == null) return null;
      // ★ 召唤者生命上限没填 ⇒ 取不到，**不是 0** ★
      //   少了这一行的话 `null * 0.5` 在 JS 里等于 **0**，于是：
      //     长夜月（flat 0）   → 基座 = 0，乘区却报 known，伤害静默变 0；
      //     阿格莱雅（flat 720）→ 基座 = 720，凭空冒出一个和面板无关的数。
      //   两种都算得出、都不报错、界面上都写着「已知」。
      //   而 `emptyPanel()` 的 hp 本来就是 null —— 空面板是**默认状态**，
      //   不是边角情形：用户一选忆灵技就会撞上。
      //   打包自检里那条「把生命上限抽掉，基座必须跟着塌」就是撞出来的。
      if (panel.hp == null) return null;
      return panel.hp * (f.pct ?? 0) + (f.flat ?? 0);
    }
    default: return null;
  }
}

/**
 * 倍率改动的合并与应用。语义见 `core/attr.mjs` 的 `MULTIPLIER_KEYS`。
 *
 * 应用顺序 **set → scale → add**：
 *   · `set`（「提高为原倍率的 X」）先定基准；
 *   · `scale`（「提高原倍率的 Y%」）在基准上按比例；
 *   · `add`（「提高 Z%」）最后加百分点 —— 加算本来就是加在最终倍率上的。
 * 这三种写法在实际语料里没有同时出现在同一个技能上的情形（已逐条看过 31 条），
 * 所以顺序只是把规则写死，不是在调参。
 *
 * ⚠️ 多个 term（一个技能有几段不同倍率）时，整体倍数会**平摊到每一段**。
 *    语料里带倍率改动的技能目前都是单段；真出现多段时这条注释就是待办。
 */
function mergeMultMod(a, b) {
  if (!a) return b ?? null;
  if (!b) return a;
  return {
    add: (a.add ?? 0) + (b.add ?? 0),
    scale: (a.scale ?? 1) * (b.scale ?? 1),
    set: b.set ?? a.set,
  };
}

function hasMultMod(m) {
  return !!m && ((m.add ?? 0) !== 0 || (m.scale ?? 1) !== 1 || m.set != null);
}

function applyMultMod(mult, mod) {
  let m = mult;
  if (mod.set != null) m *= mod.set;
  if (mod.scale != null && mod.scale !== 1) m *= mod.scale;
  if (mod.add) m += mod.add;
  return m;
}

/**
 * 局外面板 → **战斗面板**。
 *
 * ★ 这一步曾经整个缺失，后果是「布洛妮娅 +55% 攻击力」加了个寂寞 ★
 *   用户填的 `panel` 是**局外**面板（本项目的既定口径：遗器词条由用户直接填最终面板）。
 *   而队友给的是**局内**加成 —— `aggregate` 把它们规规矩矩加进了 `agg.atkPct`，
 *   然后 `scalingValue` 直接读 `panel.atk`，`agg` 那一栏**没有任何人读过**。
 *   实测：给 2000 攻击的面板挂一条 +55% 攻击力，伤害 922.5 → 922.5，**+0.0%**；
 *   暴击伤害 +50% 同样是 +0.0%。而增伤/减防是好的（+50% / +25%）。
 *   也就是说「选哪个辅助」这件事，在攻击力系和暴击系的辅助上完全不起作用 ——
 *   这正是本计算器要回答的问题本身。
 *
 * 只处理**真的进伤害公式**的键。速度/击破特攻/效果命中/效果抵抗不进公式
 * （v1 不算击破伤害，速度也不影响伤害），它们留在 `agg` 里仅供显示 ——
 * 但界面上必须标成「仅显示」，不能让一个勾了数字不动的框冒充生效。
 */
const PANEL_KEYS = [
  ['atkPct', 'atkFlat', 'atk'],
  ['hpPct', 'hpFlat', 'hp'],
  ['defPct', 'defFlat', 'def'],
];

export function inCombatPanel(panel, agg) {
  if (!panel) return panel;
  const out = { ...panel };
  const num = (k) => (typeof agg?.[k] === 'number' ? agg[k] : 0);
  if (agg) {
    for (const [pctK, flatK, key] of PANEL_KEYS) {
      // 面板没填这一项就别硬造一个 —— null 和 0 在这里是两回事
      if (out[key] == null) continue;
      const base = panel.baseStats?.[key];
      // 局内百分比加成只乘角色与光锥白值；不能把遗器平值和已有加成再乘一次。
      if (num(pctK) !== 0 && !Number.isFinite(base)) { out[key] = null; continue; }
      out[key] = out[key] + (base ?? 0) * num(pctK) + num(flatK);
    }
    if (out.critRate != null) out.critRate = out.critRate + num('critRate');
    if (out.critDmg != null) out.critDmg = out.critDmg + num('critDmg');
  }
  return out;
}

/**
 * 算一次伤害。
 *
 * @param {object} input
 *   panel    用户填的局外面板
 *   ability  { terms:[{scaling, multiplier, flatAdd}], hits, element, type, tag, name }
 *   agg      增益聚合结果（buffs.mjs），null 表示没有任何增益
 *   enemy    敌人模型（enemy.mjs）
 *   state    { broken:false }
 *   options  { critMode:'expected'|'crit'|'noncrit' }
 */
export function computeHit(input) {
  const {
    panel: outOfCombat, ability, agg = null, enemy = null, state = {}, options = {},
  } = input;
  // 局外 → 局内。下面全部照旧读 `panel`，免得四处改漏一处。
  const panel = inCombatPanel(outOfCombat, agg);
  const critMode = options.critMode ?? 'expected';
  const trace = [];
  const zones = {};

  // --- 1. 基础伤害 ---------------------------------------------------------
  const { terms, excluded: excludedTerms } = selectDamageTerms(ability?.terms ?? [], ability);
  if (!terms.length) {
    return fail(excludedTerms.length ? '当前目标没有即时伤害项；后续伤害或有条件的伤害未计入'
      : '该技能没有可用的倍率（annotations/multipliers.jsonl 里还没补录）', 'base');
  }
  // --- 1b. 倍率改动（「…伤害倍率提高#N%」）----------------------------------
  //
  // ★ 它改的是**基础伤害那一项**，不是任何乘区 ★ 所以必须在这里、按项地动
  //   `t.multiplier`，而不是算完 base 再乘一个系数 —— 加算（+X 个百分点）
  //   本来就只能落在倍率上。
  //
  // ★ 而且它**挑技能** ★ 「丹恒终结技造成的伤害倍率提高」只能在算丹恒终结技时生效；
  //   算他的普攻时把它算进去就是静默算高。所以按 scope.abilityKind 分档，
  //   只取「本次计算的技能」那一档 + 不挑技能的那一档。
  //   剩下没用上的**全部报出来**，不许静默丢 —— 界面要能说
  //   「有 2 条倍率改动作用于终结技，本次算的是普攻，未计入」。
  const multMods = agg?.multiplier ?? {};
  const mod = mergeMultMod(multMods[ability?.type], multMods.all);
  const multNotApplied = [];
  for (const [k, m] of Object.entries(multMods)) {
    if (k === 'all' || k === ability?.type) continue;
    if (hasMultMod(m)) multNotApplied.push({ abilityKind: k, mod: m });
  }
  const multPerStack = [];
  for (const b of agg?._contributions ?? []) {
    if (b.perStack) multPerStack.push({ from: b.from, owner: b.owner, stacks: b.stacks??1 });
  }

  let base = 0;
  const baseParts = [];
  let baseMissing = [];
  for (const t of terms) {
    const v = scalingValue(panel, t.scaling, t);
    if (v == null) {
      if (t.scaling === 'elation') {
        baseMissing.push('欢愉度：库里没有角色的欢愉度基值，需要手工填');
      } else if (t.scaling === 'elationBase') {
        baseMissing.push('欢愉伤害基础值：需要提供角色等级基值');
      } else if (t.scaling === 'servantHp') {
        baseMissing.push('忆灵生命上限：取不到召唤者的那条生命上限公式，需要人工补录');
      } else if (t.scaling === 'servantAtk' || t.scaling === 'servantBase') {
        baseMissing.push(`${SCALING_CN[t.scaling]}：库里没有忆灵自己的面板（只有生命上限），算不了`);
      } else if (t.scaling === 'dynamicBase') {
        baseMissing.push('本场累计数值：不是面板项，算不了');
      } else if (t.scaling == null) {
        // 别写成 `${t.scaling}：面板未填` —— 那样文案是「undefined：面板未填」，
        // 看起来像用户没填面板，实际是描述里就没写吃哪个属性。
        baseMissing.push('有一项倍率没写明吃哪个属性（攻击力/生命上限/防御力）');
      } else {
        baseMissing.push(`${SCALING_CN[t.scaling] ?? t.scaling}：面板或局内加成所需白值未填`);
      }
      continue;
    }
    const mult0 = t.multiplier ?? 0;
    const mult1 = mod ? applyMultMod(mult0, mod) : mult0;
    const part = v * mult1;
    const count = ability.multiplierBasis === 'per-term' ? t.count : 1;
    if(!Number.isInteger(count)||count<0) {baseMissing.push('伤害次数缺失或无效，需要已核实的逐项次数');continue;}
    base += (part + (t.flatAdd ?? 0)) * count;
    baseParts.push(mod && mult1 !== mult0
      ? `${v.toFixed(1)}×${mult0}→${mult1.toFixed(3)}`
      : `${v.toFixed(1)}×${mult0}`);
    if(count!==1)baseParts[baseParts.length-1]+=` × ${count} 次`;
  }
  if (baseMissing.length) {
    zones.base = zone(C.UNKNOWN, { why: '基础伤害缺输入：' + baseMissing.join('；'), missing: baseMissing });
    return { ok: false, error: zones.base.why, zones, coverage: rollupZones(zones) };
  }
  zones.base = zone(C.KNOWN, { detail: baseParts.join(' + ') });
  trace.push({ zone: 'base', expr: baseParts.join(' + '), value: base });

  // --- 2. 增伤 -------------------------------------------------------------
  const element = ability.element;
  const elemBonus = element ? (panel.elemDmg?.[element] ?? 0) + (agg?.elemDmg?.[element] ?? 0) : 0;
  const allBonus = agg?.dmgBoost ?? 0;
  // ★ 必须把 `all` 一起读上 ★
  //   「不限定技能类型」的增伤是记在 `agg.abilityDmg.all` 里的（elemDmg 的
  //   「不限属性」也同样是加到每个属性上，同一套约定）。这里曾经只读
  //   `agg.abilityDmg[ability.type]` —— 于是**不限定类型的那一档永远算 0**：
  //   数值进得来、aggregate 里看得见、界面上也显示，就是不影响伤害。
  //   今天语料里恰好 0 条走这条路（所以没爆出来），但这是个哑雷。
  const abilityBonus = ability.type
    ? (agg?.abilityDmg?.[ability.type] ?? 0) + (agg?.abilityDmg?.all ?? 0)
    : 0;
  const dmgBoost = 1 + elemBonus + allBonus + abilityBonus;
  zones.dmgBoost = zone(worst(agg?._zones?.dmgBoost?.level, agg?._zones?.elemDmg?.level, agg?._zones?.abilityDmg?.level),
    { missing: agg?._zones?.dmgBoost?.missing ?? [] });
  trace.push({
    zone: 'dmgBoost', value: dmgBoost,
    expr: `1 + 元素${(elemBonus * 100).toFixed(1)}% + 全局${(allBonus * 100).toFixed(1)}% + 技能类型${(abilityBonus * 100).toFixed(1)}%`,
  });

  // --- 3. 暴击 -------------------------------------------------------------
  const cr = panel.critRate ?? 0;
  const cd = panel.critDmg ?? 0;
  const crit = critMode === 'crit' ? 1 + cd : critMode === 'noncrit' ? 1 : expectedCritMult(cr, cd);
  zones.crit = zone(C.KNOWN, { detail: `${critMode}: 暴击率 ${(cr * 100).toFixed(1)}% 暴伤 ${(cd * 100).toFixed(1)}%` });
  trace.push({ zone: 'crit', value: crit, expr: critMode === 'expected' ? `1 + ${cr.toFixed(3)}×${cd.toFixed(3)}` : critMode });

  // --- 4. 防御 -------------------------------------------------------------
  let def = null;
  if (enemy) {
    const enemyDef = enemyDefence(input);
    if (enemyDef == null) {
      zones.def = zone(C.UNKNOWN, { why: '敌人的防御值取不到（缺 defence_base 或 hard_level_group）' });
      def = 1;
    } else {
      def = defMultiplier(input.attackerLevel ?? 80, enemyDef, {
        defShred: agg?.defShred ?? 0, defIgnore: agg?.defIgnore ?? 0,
      });
      zones.def = zone(C.KNOWN, { detail: `敌防御 ${enemyDef.toFixed(2)} → ${def.toFixed(4)}` });
    }
  } else {
    zones.def = zone(C.UNKNOWN, { why: '没有指定敌人' });
    def = 1;
  }
  trace.push({ zone: 'def', value: def, expr: `敌防 ${enemyDefence(input)?.toFixed(1) ?? '?'}` });

  // --- 5. 抗性 -------------------------------------------------------------
  let res = 1;
  let resLevel = C.KNOWN;
  if (enemy?.res && element) {
    const pen = agg?.resPen?.[element] ?? 0;
    res = resMultiplier(enemy.res[element] ?? 0, pen);
    zones.res = zone(C.KNOWN, { detail: `敌抗 ${(enemy.res[element] * 100).toFixed(0)}% 穿透 ${(pen * 100).toFixed(0)}%` });
  } else {
    zones.res = zone(C.UNKNOWN, { why: enemy ? '该技能没有属性（无法查抗性）' : '没有指定敌人' });
  }
  trace.push({ zone: 'res', value: res, expr: `敌抗 ${((enemy?.res?.[element] ?? 0) * 100).toFixed(0)}%` });

  // --- 6. 易伤 -------------------------------------------------------------
  const vuln = 1 + (agg?.vuln ?? 0);
  zones.vuln = zone(agg?._zones?.vuln?.level ?? C.KNOWN, { missing: agg?._zones?.vuln?.missing ?? [] });
  trace.push({ zone: 'vuln', value: vuln, expr: `1 + ${((agg?.vuln ?? 0) * 100).toFixed(1)}%` });

  // --- 7. 击破 -------------------------------------------------------------
  // 🔴 纯社区公式，本项目**无法对拍**（库里没有韧性削减的结算记录）。
  const broken = state.broken ? 1.0 : 0.9;
  zones.broken = zone(C.UNKNOWN, {
    why: '击破乘区用的是社区公式（未击破 ×0.9），库里没有可对拍的结算记录',
    detail: state.broken ? '已击破 ×1.0' : '未击破 ×0.9',
  });
  trace.push({ zone: 'broken', value: broken, expr: state.broken ? '已击破' : '未击破' });

  // --- 8. 减伤 -------------------------------------------------------------
  const mitig = Math.max(0, 1 - (agg?.dmgReduction ?? 0));
  zones.mitigation = zone(agg?._zones?.mitigation?.level ?? C.KNOWN,
    { missing: agg?._zones?.mitigation?.missing ?? [] });
  trace.push({ zone: 'mitigation', value: mitig, expr: `1 - ${((agg?.dmgReduction ?? 0) * 100).toFixed(1)}%` });

  // --- 合计 ----------------------------------------------------------------
  const hits = Math.max(1, ability.hits ?? 1);
  const single = base * dmgBoost * crit * def * res * vuln * broken * mitig;
  const repeatFactor = ability.multiplierBasis === 'per-term' ? 1 : hits;
  const total = single * repeatFactor;

  const coverage = rollupZones(zones);
  return {
    ok: true,
    base, zones,
    _element: element ?? null,     // 判据①要用它查弱点
    _enemy: enemy?.childId ?? enemy?.monsterId ?? null,
    single,
    total,
    hits,
    // 分列三种暴击情形 —— 期望值容易掩盖问题，判据①②都要看具体值
    expected: base * dmgBoost * expectedCritMult(cr, cd) * def * res * vuln * broken * mitig * repeatFactor,
    onCrit: base * dmgBoost * (1 + cd) * def * res * vuln * broken * mitig * repeatFactor,
    nonCrit: base * dmgBoost * def * res * vuln * broken * mitig * repeatFactor,
    trace,
    coverage,
    // ★ 倍率改动的「没算上」清单 ★ 空数组表示全都算上了。
    //   这两项存在的唯一理由是**不许静默**：
    //   ① multNotApplied —— 作用于别的技能的倍率改动，本次没计入；
    //   ② multPerStack  —— 「每层/每点」类的，按 1 层算的。
    //   界面要能把它们显示出来，否则用户会以为「我都勾了，怎么没变」。
    multNotApplied,
    multPerStack,
    _assumptions: [
      ...(excludedTerms.length ? [`未计入 ${excludedTerms.length} 项：相邻目标、后续伤害或未启用的条件伤害（详见技能卡）`] : []),
      ...(ability.multiplierBasis==='per-term' ? ['按每个伤害项的总倍率 / 重复次数独立结算；动画分段不会再次乘总倍率'] : hits !== 1 ? [`每次命中倍率 × ${hits} 次`] : []),
      ...(multPerStack.length ? [`「每层/每点」类增益按所选层数计：${multPerStack.map(b=>b.from+' ×'+b.stacks+'层').join('；')}`] : []),
    ],
  };
}

/** 从敌人模型取防御值。abyss 路径已经带了 def 字段；monster 路径要按公式补。 */
function enemyDefence(input) {
  const { enemy } = input;
  if (!enemy) return null;
  if (Number.isFinite(enemy.def)) return enemy.def;
  if (enemy.source === 'abyss' && enemy.group) return null;
  return null;
}

function fail(msg, which) {
  const zones = { [which]: zone(C.UNKNOWN, { why: msg }) };
  return { ok: false, error: msg, zones, coverage: rollupZones(zones) };
}

/**
 * 多次技能的合计（一个回合内的输出序列）。
 * rotation = [{ ability, hits, weight }]
 * v1 只做线性叠加，不做行动值排轴。
 */
export function computeRotation(input, rotation) {
  const parts = rotation.map((r) => computeHit({ ...input, ability: { ...r.ability, hits: r.hits ?? r.ability.hits } }));
  const ok = parts.filter((p) => p.ok);
  return {
    parts,
    total: ok.reduce((s, p) => s + p.total, 0),
    coverage: rollupZones(Object.assign({}, ...ok.map((p) => p.zones))),
    anyFailed: parts.some((p) => !p.ok),
  };
}
