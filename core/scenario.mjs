// 场景：三深渊 / 异相 + 配队横向对比。
//
// 承担需求里「可选的判断伤害好坏」这两条：
//   ① 对比该深渊层怪物的实际血量  (judgeAgainstHp)  —— 靠 abyss_wave_monsters 的预算 hp，可信
//   ② 对比同角色在若干套配队下的伤害 (buildComparison) —— 不写新公式，就是把 computeHit 跑 N 遍
import { listAbyssEnemies, waveTotalHp } from './enemy.mjs';
import { computeHit } from './damage.mjs';
import { hasNumericEffect, aggregate } from './buffs.mjs';
import { C, rollupZones } from './provenance.mjs';

const MODE_CN = { moc: '混沌回忆', pf: '虚构叙事', as: '末日幻影' };

// ---------------------------------------------------------------------------
// 版本号：**不能信源库那一列**
// ---------------------------------------------------------------------------

/**
 * 游戏版本的上线日期表（国服，2023-04-26 ~ 2026-08-26）。
 *
 * ★ 为什么要在代码里手写一张表 ★
 *   `abyss_seasons.version` 那一列**不是每期数据**，是**整库快照的标签** ——
 *   92 行全是同一个值。证据是三个库一起看：
 *     `HSR_现有_4.4.db`  → 90 行全是 "4.4"
 *     `HSR_现有_4.5.db`  → 92 行全是 "4.5"
 *     `HSR_测试服_4.4.55.db` → 92 行全是 "4.4.55"，且与 `meta.version` 逐字相同
 *   也就是说它等于 `meta.version`，跟「这一期是哪个版本开的」毫无关系。
 *   照搬它显示的话，**从 1.0 的第一期到最新一期全部写着「v4.5」**。
 *
 * ★ 这张表是怎么来的、凭什么信它 ★
 *   1.0~3.8 逐条与公开的版本历史核对过；4.x 用**两条独立的约束**夹出来：
 *     ① 星铁的版本更新日固定落在**星期三**；
 *     ② 从 2.1 起更新节奏是**严格的 42 天**。
 *   把 4.2/4.4/4.5 这三个有明确出处的日期拿去验，它们**同时**满足这两条，
 *   而且互相等差 42 天 —— 于是整条 4.x 链被唯一确定下来，
 *   剩下那几个（4.0/4.1/4.3）就是这条链上的点，不是另查的。
 *   反过来说：**这张表能被证伪**。verify 里有三条断言盯着它 ——
 *   严格递增、两两间隔在 35~50 天之间、除 2.0 外全部落在星期三。
 *   哪天发现某个日期错了，改这里，断言会立刻告诉你会不会破坏链。
 *
 * ★ 已知的两个「不规则」版本，别当成写错了 ★
 *   1.4 → 1.5 只有 **35 天**（1.5 提前一周）；1.6 → 2.0 只有 **41 天**，
 *   且 2.0 是**星期二**（2024-02-06，春节前）。2.1 之后才变成干净的 42 天。
 */
export const VERSION_STARTS = [
  ['1.0', '2023-04-26'], ['1.1', '2023-06-07'], ['1.2', '2023-07-19'],
  ['1.3', '2023-08-30'], ['1.4', '2023-10-11'], ['1.5', '2023-11-15'],
  ['1.6', '2023-12-27'], ['2.0', '2024-02-06'], ['2.1', '2024-03-27'],
  ['2.2', '2024-05-08'], ['2.3', '2024-06-19'], ['2.4', '2024-07-31'],
  ['2.5', '2024-09-11'], ['2.6', '2024-10-23'], ['2.7', '2024-12-04'],
  ['3.0', '2025-01-15'], ['3.1', '2025-02-26'], ['3.2', '2025-04-09'],
  ['3.3', '2025-05-21'], ['3.4', '2025-07-02'], ['3.5', '2025-08-13'],
  ['3.6', '2025-09-24'], ['3.7', '2025-11-05'], ['3.8', '2025-12-17'],
  ['4.0', '2026-01-28'], ['4.1', '2026-03-11'], ['4.2', '2026-04-22'],
  ['4.3', '2026-06-03'], ['4.4', '2026-07-15'], ['4.5', '2026-08-26'],
];

/** `2026/08/17 04:00` / `2026-08-17` → `2026-08-17`。取不到返回 null。 */
export function dateOnly(text) {
  const m = /(\d{4})[/-](\d{1,2})[/-](\d{1,2})/.exec(String(text ?? ''));
  if (!m) return null;
  return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
}

/**
 * 一个日期落在哪个版本窗口里 → 版本号。早于表头或取不到日期都返回 **null**。
 *
 * 返回 null 是**有意**的，调用方必须显示成「没有版本号」而不是「v?」：
 * `abyss_seasons` 有 18 期 `begin_time` 是空串（都是最早那批，`moc 100~1006`、
 * `900`、`1035`），硬凑一个版本号就是**为了一句好看的文案编数据**。
 */
export function versionAt(dateText) {
  const d = dateOnly(dateText);
  if (!d) return null;
  let hit = null;
  for (const [ver, start] of VERSION_STARTS) {
    if (start <= d) hit = ver; else break;
  }
  return hit;
}

/**
 * 显示用名字：剥掉 `<unbreak>` 这类富文本标签，并在为空时退回 id。
 *
 * ★ 只在**显示**这一层剥，原始值一个字节都不动 ★
 *   源库里 80 条 `abyss_floors.floor_name` 是 `冽风骑士·难度<unbreak>01</unbreak>`
 *   这种带标签的文本，21 条层名和 1 条期名根本是空的。要不要回写数据库是另一件事
 *   （需要用户裁定）；界面直接显示 `01` 而不是 `<unbreak>01</unbreak>` 是纯显示问题。
 */
export function displayName(raw, fallback) {
  const s = String(raw ?? '').replace(/<[^>]*>/g, '').trim();
  return s || String(fallback ?? '');
}

// ---------------------------------------------------------------------------
// 场景列表与加载
// ---------------------------------------------------------------------------

export function listScenarios(ctx) {
  const out = [];
  for (const s of ctx.data.abyssSeasons) {
    const floors = (ctx.data.abyssFloors ?? []).filter(
      (f) => f.mode === s.mode && f.seasonId === s.seasonId);
    // ★ 版本号**由开始日期反推**，不读 `s.version` ★
    //   后者是整库快照的标签（92 行一个值），见 VERSION_STARTS 上面那段。
    //   源数据里那个字段仍在（`snapshotVersion`），但**界面一处都不许用它**。
    const begin = dateOnly(s.begin);
    const end = dateOnly(s.end);
    const version = versionAt(s.begin);
    out.push({
      id: `${s.mode}:${s.seasonId}`,
      mode: s.mode, seasonId: s.seasonId,
      name: displayName(s.name, `${s.seasonId} 期`),
      label: `${MODE_CN[s.mode] ?? s.mode} · ${displayName(s.name, `${s.seasonId} 期`)}`,
      version, begin, end,
      // 没有日期就连区间都不显示 —— 宁可少一句，不要编一句。
      period: begin ? `${begin}${end ? ` ~ ${end}` : ' 起'}` : null,
      floors: floors.map((f) => ({
        floorId: f.floorId,
        name: displayName(f.floorName, `第 ${f.floorId} 层`),
        label: `${displayName(f.floorName, `第 ${f.floorId} 层`)}${f.isBoss ? '（首领）' : ''}`,
        isBoss: f.isBoss, hardName: f.hardName,
      })).sort((a, b) => String(a.floorId).localeCompare(String(b.floorId), undefined, { numeric: true })),
    });
  }
  const rank = { moc: 0, pf: 1, as: 2 };
  return out.sort((a, b) => (rank[a.mode] - rank[b.mode]) || (b.seasonId - a.seasonId));
}

/** 该层的增益文本来源（层祝福 + 层标签 + 期祝福）。这些要人工标注才有语义。 */
export function scenarioSources(ctx, { mode, seasonId, floorId }) {
  const out = [];
  const floor = ctx.data.abyssFloors.find((f) => f.mode === mode && f.seasonId === seasonId && String(f.floorId) === String(floorId));
  // phase 中各半场的 tag_list 是归属证据；扁平表本身不含 side。
  const phaseTags = (Array.isArray(floor?.phase) ? floor.phase : []).flatMap((p, i) =>
    (p.boss_monster_config?.tag_list ?? []).map((t) => ({ ...t, enemySide: i + 1 })));
  const season = ctx.seasonByKey.get(`${mode}:${seasonId}`);
  if (season) {
    out.push({
      kind: 'abyss_season', id: `abyss.${mode}.${seasonId}.season`,
      label: `期祝福「${season.buffName ?? season.name}」`,
      text: season.buffDesc, params: season.buffParams,
    });
  }
  for (const b of ctx.abyssBuffByKey.get(`${mode}:${seasonId}:${floorId}`) ?? []) {
    out.push({
      kind: 'abyss_buff', id: `abyss.${mode}.${seasonId}.${floorId}.buff${b.idx}`,
      label: `层祝福「${b.name}」`, text: b.desc, params: b.params,
      ref: { kind: 'abyss_buff', mode, seasonId, floorId, buffIndex: b.idx },
    });
  }
  // ⚠ 层标签绝大多数是「首领幻影受到的伤害降低 60%」—— 那是**敌方减伤**，
  //   不是队伍增益。当成增益用会把方向算反。所以这里全部标 side 待定，
  //   由 annotations/sides.json 决定归属；没有记录的**一律排除并告警**。
  for (const t of ctx.abyssTagByKey.get(`${mode}:${seasonId}:${floorId}`) ?? []) {
    const original = phaseTags[t.idx];
    const matched = original && original.desc === t.desc && JSON.stringify(original.param ?? []) === JSON.stringify(t.params ?? []);
    const scope = mode === 'as'
      ? matched ? { enemySide: original.enemySide,
        ...(/首领幻影[^。]*受到/.test(tagClean(t.desc)) ? { enemySlot: 'monster0' } : {}) }
        : { unresolvedTarget: true }
      : {};
    out.push({
      kind: 'abyss_tag', id: `abyss.${mode}.${seasonId}.${floorId}.tag${t.idx}`,
      label: `层标签${t.name ? `「${t.name}」` : ''}`, text: t.desc, params: t.params,
      ref: { kind: 'abyss_tag', mode, seasonId, floorId, tagIndex: t.idx },
      scope,
    });
  }
  return out;
}

/**
 * 加载一个深渊层的完整情境。
 * 增益侧只返回**来源**，不做解释 —— 解释来自 annotations。
 */
export function loadScenario(ctx, { mode, seasonId, floorId, annotations, sides, selections = {} }) {
  const key = `${mode}:${seasonId}:${floorId}`;
  const enemies = listAbyssEnemies(ctx, { mode, seasonId, floorId });
  const sources = scenarioSources(ctx, { mode, seasonId, floorId });
  const byId = new Map((annotations?.buffs ?? []).map((a) => [a.id, a]));

  const activeBuffs = [];
  const gaps = [];
  const excluded = [];
  const availableBuffs = [];
  const seenTags = new Set();

  for (const src of sources) {
    // --- 层标签走 sides.json 的**规则表**，不走逐条标注 ---
    if (src.kind === 'abyss_tag') {
      const signature = JSON.stringify([src.scope, src.text, src.params]);
      if (seenTags.has(signature)) continue;
      seenTags.add(signature);
      const cls = classifyTag(src.text, src.params, sides);
      if (/进入【|进入第|处于【|期间/.test(tagClean(src.text)) && cls.effects.length) {
        gaps.push({ ...src, reason: 'unmodelled_condition', note: '需要额外战斗状态，未作为常驻效果计入' });
        continue;
      }
      if (!cls.matched) {
        // 没规则认领 → 排除并告警。这一条是「把减伤算成增伤」的唯一防线。
        excluded.push({
          ...src, reason: 'unclassified_tag',
          note: '层标签没匹配到 sides.json 任何规则，已排除（宁可漏算，不可把敌方减伤当己方增伤）',
        });
        continue;
      }
      if (src.scope?.unresolvedTarget) {
        excluded.push({ ...src, reason: 'unknown_target', note: '无法从半场原始标签确定作用目标，未计入' });
        continue;
      }
      activeBuffs.push(...cls.effects.map((e) => ({ ...e, id: `${src.id}:${e.id}`,
        scope: { ...e.scope, ...src.scope }, label: src.label, text: src.text })));
      for (const u of cls.unknownEffects) {
        gaps.push({ id: u.id ?? src.id, label: src.label, text: src.text, reason: 'tag_effect_unknown', note: u.note ?? u.why });
      }
      continue;
    }

    if (!hasNumericEffect(src.text)) continue;   // 没数字的条目对伤害没影响
    const rec = byId.get(src.id);
    if (!rec) {
      const parsed = ctx.data.scenarioEffects?.[src.id];
      if (parsed) {
        for (const e of parsed.effects) {
          const item = { ...e, label: src.label, selected: selections[e.id] === true };
          availableBuffs.push(item);
          if (item.selected) activeBuffs.push(item);
        }
        for (const g of parsed.gaps) gaps.push({ id: src.id, label: src.label, text: g.text,
          reason: g.reason, note: '现有描述的作用对象或计算规则尚未解析' });
        continue;
      }
      gaps.push({ id: src.id, label: src.label, text: src.text, reason: 'no_annotation' });
      continue;
    }
    activeBuffs.push({ ...rec, label: src.label });
  }

  return {
    id: key, mode, seasonId, floorId,
    seasonName: ctx.seasonByKey.get(`${mode}:${seasonId}`)?.name,
    enemies,
    totalHp: waveTotalHp(enemies),
    buffs: activeBuffs,
    availableBuffs,
    gaps, excluded,
    _provenance: {
      enemies: 'known',
      scenarioBuffs: gaps.length ? 'partial' : 'known',
    },
  };
}

// ---------------------------------------------------------------------------
// 判据① 对比该层怪物的实际血量
// ---------------------------------------------------------------------------

/**
 * @param hit  computeHit 的结果
 * @param enemies  该层的怪物数组
 * @param opts  { targetIndex } 指定打哪一只；不给就按「这一个技能打全体」理解
 */
export function judgeAgainstHp(hit, enemies, opts = {}) {
  if (!hit?.ok) return { ok: false, error: '伤害没算出来，无法对比血量' };
  if (!enemies?.length) return { ok: false, error: '这个情境没有敌人数据' };

  const perEnemy = enemies.map((e) => {
    const effHp = (e.hp ?? 0) * (e.spawnCount ?? 1);
    const dmg = hit.total;
    return {
      childId: e.childId, name: e.name, level: e.level,
      hp: e.hp, spawnCount: e.spawnCount ?? 1, totalHp: effHp,
      // 弱点命中与否 —— 是判断「这个配队打这层合不合适」的关键信息
      hitsWeakness: hit._element ? (e.weakness ?? []).includes(hit._element) : null,
      dmgPct: effHp > 0 ? dmg / effHp : null,
      kills: dmg > 0 && effHp > 0 ? Math.ceil(effHp / dmg) : null,
      res: hit._element ? (e.res?.[hit._element] ?? 0) : null,
    };
  });

  const total = enemies.reduce((s, e) => s + (e.hp ?? 0) * (e.spawnCount ?? 1), 0);
  return {
    ok: true,
    perEnemy,
    waveTotalHp: total,
    wavePct: total > 0 ? hit.total / total : null,
    // 「几段能清场」按单体伤害乘怪物数粗略估 —— 群体技能会低估，只作参考
    waveHits: hit.total > 0 && total > 0 ? Math.ceil(total / hit.total) : null,
    _note: '清场段数是粗略估计：按单体伤害平均到全队，群体技能会低估。',
  };
}

// ---------------------------------------------------------------------------
// 判据② 同角色在若干套配队下的伤害对比
// ---------------------------------------------------------------------------

/**
 * loadouts = [{ label, panel, eidolon, lightconeId, relicSets, team, ability, state }]
 * 每套自带完整输入，跑同一套公式 —— **不写第二份公式**。
 */
/** 主结果与配队对比共用的情境聚合入口。 */
export function aggregateScenarioBuffs(buffs, scenario, enemy, state = {}, ability = null) {
  return aggregate([...(buffs ?? []), ...(scenario?.buffs ?? [])], { enemy, state, ability });
}

export function buildComparison(ctx, { loadouts, scenario, annotations, options = {} }) {
  const rows = loadouts.map((lo) => {
    let hit;
    try {
      hit = computeHit({
        panel: lo.panel,
        ability: lo.ability,
        agg: lo.buffs ? aggregateScenarioBuffs(lo.buffs, scenario, lo.enemy ?? scenario?.enemies?.[0], lo.state, lo.ability)
          : lo.agg ?? null,
        enemy: lo.enemy ?? scenario?.enemies?.[0] ?? null,
        state: lo.state ?? {},
        options,
        attackerLevel: lo.attackerLevel ?? 80,
      });
    } catch (e) {
      return { label: lo.label, ok: false, error: e.message, coverage: { overall: C.UNKNOWN, zones: {} } };
    }
    return {
      label: lo.label, ok: hit.ok, error: hit.error,
      total: hit.total, onCrit: hit.onCrit, nonCrit: hit.nonCrit,
      perZone: hit.zones, coverage: hit.coverage,
    };
  });

  const ok = rows.filter((r) => r.ok);
  const best = ok.length ? ok.reduce((a, b) => (b.total > a.total ? b : a)) : null;
  for (const r of rows) {
    if (!r.ok) continue;
    r.vsBest = best && best.total > 0 ? r.total / best.total : null;
    r.vsBaseline = ok.length && ok[0].total > 0 ? r.total / ok[0].total : null;
  }
  return {
    rows,
    best: best?.label ?? null,
    baseline: ok[0]?.label ?? null,
    // 配队对比的可信度 = 各套里最差的那个
    coverage: rollupZones(Object.assign({}, ...rows.flatMap((r) => Object.entries(r.coverage?.zones ?? {})))),
    warnings: rows.filter((r) => !r.ok).map((r) => `「${r.label}」算不出来：${r.error}`),
  };
}

// 读敌我侧种子表的 loadSides 搬去了 core/annotations.mjs（那儿要碰 fs）。
// 浏览器从 window.__HSR_DATA__.annotations.sides 拿同一份内容。

/** 去掉会插在「短语」和「占位符」之间的标签，保留 #N[i]% 本身。 */
function tagClean(desc) {
  return String(desc ?? '')
    .replace(/<color=[^>]*>|<\/color>/g, '')
    .replace(/<unbreak>|<\/unbreak>/g, '')
    .replace(/<\/?[ubis]>/g, '');
}

/**
 * 把一条层标签按种子表归类。
 *
 * 返回 { matched, ruleId, effects:[...], unknownEffects:[...] }
 *   matched=false        → 没规则认领，调用方应**排除并告警**
 *   effects 为空数组      → 已确认不影响伤害（韧性/召唤物血量之类），静默略过
 *   effects 里 provenance=unknown 的 → 认得出但算不准，照样要告警
 *
 * 一条标签里可能有多个效果（「受到的伤害降低#1%」+「弱点击破后受到的伤害提高#2%」），
 * 所以是对**每条规则**都试一遍再合并，不是命中一条就返回。
 */
export function classifyTag(desc, params, sides) {
  const clean = tagClean(desc);
  const effects = [];
  const unknownEffects = [];
  const hitRules = [];

  for (const rule of sides?.rules ?? []) {
    // contains 可以是字符串或字符串数组（同一语义在数据里有多种写法：
    // 「受到的伤害降低」/「受到的伤害额外降低」）
    const phrases = [].concat(rule.contains ?? []);
    let phrase = null;
    let at = -1;
    for (const p of phrases) {
      const i = clean.indexOf(p);
      if (i !== -1 && (at === -1 || i < at)) { at = i; phrase = p; }
    }
    if (at === -1) continue;
    hitRules.push(rule.id);

    // 取匹配片段**之后最近**的占位符（「受到的伤害降低#1%…受到的伤害提高#2%」各取各的）
    const m = /#(\d+)\[(?:i|f[1-6])\]/.exec(clean.slice(at + phrase.length));
    if (!m) continue;
    const raw = params?.[Number(m[1]) - 1];
    const item = { ruleId: rule.id, paramIndex: Number(m[1]), raw };
    if (!Number.isFinite(raw)) { unknownEffects.push({ ...item, why: '参数缺失' }); continue; }

    for (const e of rule.effects ?? []) {
      const rec = {
        id: `${rule.id}#${item.paramIndex}`,
        key: e.key, op: e.op ?? 'add',
        // ★ 参数里存的就是**分数**（0.6），不是百分数（60）。desc 里那个 `%`
        //   只影响显示，不影响计算 —— damage.mjs 那边是 `1 - dmgReduction`。
        //   这儿曾经多乘了一次 100，减伤会变成 1-60 = -59，整条公式反号。
        //
        // ★ value 恒为**正的量级**，符号由**属性键**在 damage.mjs 里承载：
        //     增伤 1 + dmgBoost / 易伤 1 + vuln / 减伤 1 - dmgReduction / 减防 1 - defShred
        //   所以这里**不能乘 direction**。句子的极性和"对伤害是正是负"不是一回事：
        //   「防御力降低」和「受到的伤害降低」都是「降低」，一个增伤一个减伤，
        //   按句子极性定符号必然搞反一个。`direction` 只作复核时的文本极性记录。
        //   （core/buffs.mjs 的 valueOf 也不乘 direction，两边必须一致。）
        value: raw,
        side: e.side, target: 'enemy',
        scope: e.scope ?? {},
        condition: e.condition ?? null,
        provenance: e.provenance ?? 'known',
        label: e.label ?? rule.id,
        text: rule.contains,
      };
      if (rec.provenance === 'unknown') unknownEffects.push(rec); else effects.push(rec);
    }
  }

  return { matched: hitRules.length > 0, ruleId: hitRules[0] ?? null, hitRules, effects, unknownEffects };
}
