// 增益采集与聚合。
//
// ★ 这个项目的核心难点在这里，不在公式 ★
//
// 数值基本都取得到（abyss_buffs 的 params 100% 齐全，技能倍率映射也验证过），
// 真正缺的是**语义层**：「这条影响谁、什么条件、给我方还是给敌方」。
// 那层没有任何机器可读标注，只能人工建表（annotations/buffs.jsonl）。
//
// 所以本模块的全部设计都围绕一件事：**让「没收录」变得可见**。
//   · 结构化来源（行迹的属性节点）自动生效，不需要标注
//   · 需要标注的来源，找不到标注就产出一条 Gap，而不是当成 0
//   · 每一条产出都带 _contributions，界面能展开「这个数是哪些来源加起来的」
import {
  ELEMENTS, resolveParam, SKILL_TYPE_CN, ATTACK_TYPES, promotionForLevel,
  effectiveSkillLevel,
} from './ctx.mjs';
import { C } from './provenance.mjs';
import { normalize, affectsDamage, hasPlaceholder } from './clauses.mjs';
// 技能等级基值的唯一出处。放在 abilities.mjs 而不是这儿，是因为**输出者自己的倍率**
// 也用它 —— 两处各写一份「普攻 6、其余 10」，迟早会漂。
import { baseLevelOf } from './abilities.mjs';

/** 探测一段描述里是否含数值效果。有数值却没标注 = 缺口。 */
export const RE_HAS_NUMERIC = /#\d+\[(?:i|f\d)\]/;

/**
 * 判断一段文本有没有（可提取的）数字效果 —— 含 <unbreak> 里的纯数字也算。
 *
 * ★ 判「有没有数字」和判「这个数字影不影响伤害」是两件事，
 *   缺口探测要用后者（`affectsDamage`）。用这个粗判据的话，
 *   「恢复#1[i]点能量」也会被报成缺口，界面显示出「有 5 处未收录，结果偏低」，
 *   而实际上那 5 处一点伤害都不影响 —— **假警告会把真警告淹掉**。
 *   这个函数保留给「这段文本里有没有数字」这种更弱的用途。
 */
export function hasNumericEffect(desc) {
  if (!desc) return false;
  if (hasPlaceholder(desc)) return true;
  return /<unbreak>\d/.test(desc);
}

// ---------------------------------------------------------------------------
// 取值
// ---------------------------------------------------------------------------
//
// 标注表怎么读出来的（readJsonl / loadAnnotations）住在 core/annotations.mjs ——
// 那边要碰 fs，node 专用；这个文件要保持**浏览器可 import**。

/**
 * 技能类标注该按几级取值。
 *
 * ★ 这个函数存在的理由是一个真踩过的坑 ★
 *   老代码直接 `?? 1`：`buffs.jsonl` 的 50 条记录里带 `source.level` 的是 **0 条**，
 *   而调用方 collectBuffs 又把 skillLevels 显式置成 undefined，于是**全部按 1 级取**。
 *   1 级和基础满级（普攻 6 / 其余 10）差得很远：布洛妮娅「贝洛伯格进行曲」的
 *   攻击力加成按 1 级是 +33%、按满级是 +55% —— 每条技能增益都偏低四成，
 *   而 verify 里没有一条断言 pin 住过任何增益数值，所以一直全绿。
 *   现在按角色自己的等级/星魂现算，跟输出者面板走的是同一套（abilities.mjs 的 baseLevelOf
 *   + ctx.mjs 的 effectiveSkillLevel，含 R3/R5 的「等级+2，最多不超过15级」）。
 */
export function skillLevelOf(ctx, rec, ctxVars = {}) {
  const s = rec.source ?? {};
  const explicit = ctxVars.skillLevels?.[s.skillId] ?? s.level;
  if (explicit != null) return explicit;      // 调用方指定 / 记录里写死，优先
  const base = baseLevelOf(s.skillType);
  const eidolon = ctxVars.eidolons?.[s.charId] ?? 0;
  return effectiveSkillLevel(ctx, s.charId, s.skillType, base, eidolon);
}

/** 按标注记录取数值。param.index 为 null 时退回 literal。 */
export function valueOf(ctx, rec, ctxVars = {}) {
  const ref = { ...rec.source, ...(rec.param ?? {}) };
  if (ref.index == null) return rec.param?.literal ?? null;
  switch (rec.source?.kind) {
    case 'skill':
      return resolveParam(ctx, {
        kind: 'skill', charId: rec.source.charId, skillId: rec.source.skillId,
        level: skillLevelOf(ctx, rec, ctxVars),
        index: ref.index,
      });
    case 'lightcone':
      return resolveParam(ctx, {
        kind: 'lightcone', lcId: rec.source.lcId,
        superimpose: ctxVars.superimpose?.[rec.source.lcId] ?? rec.source.superimpose ?? 1,
        index: ref.index,
      });
    case 'eidolon':
      return resolveParam(ctx, {
        kind: 'eidolon', charId: rec.source.charId,
        rankId: rec.source.rankId, index: ref.index,
      });
    default:
      return resolveParam(ctx, ref);
  }
}

/** 一条标注能不能生效：星魂要够、光锥要装、遗器要够件数。 */
export function isActive(rec, ctxVars) {
  const s = rec.source ?? {};
  if (s.kind === 'eidolon') return (ctxVars.eidolons?.[s.charId] ?? 0) >= s.rankId;
  if (s.kind === 'lightcone') {
    return ctxVars.lightconeId === s.lcId
      && (ctxVars.superimpose?.[s.lcId] ?? 0) >= (s.superimpose ?? 1);
  }
  if (s.kind === 'relicset') return (ctxVars.relicSets?.[s.setId] ?? 0) >= (s.piece ?? 2);
  return true;
}

// ---------------------------------------------------------------------------
// 来源枚举：给每个「应该有标注」的地方造一个 id
// ---------------------------------------------------------------------------

/**
 * 收集某个角色身上所有可能带增益的来源。
 * 返回 [{ kind, id, owner, text, params, charId, ... }]
 */
export function sourcesOfCharacter(ctx, characterId, { lightconeId = null, relicSets = {} } = {}) {
  const out = [];
  const ch = ctx.charById.get(characterId);
  const who = ch?.name ?? String(characterId);

  for (const sk of ctx.skillsByChar.get(characterId) ?? []) {
    if (!ATTACK_TYPES.includes(sk.type)) continue;
    // ★ 忆灵技能（sk.servant）不算来源 ★
    //   `skillsByChar` 现在并了 data.servantSkills，这个循环会看到它们。但忆灵技能
    //   的增益**本次明确不做** —— 目录的「来源角色」模型里没有忆灵这一格
    //   （见 build_data.mjs 的 servantSkills 段）。放进来只会让「未收录的增益」
    //   多出一整类永远不会被收录的东西，把真实缺口淹掉。
    if (sk.servant) continue;
    out.push({
      kind: 'skill', id: `${characterId}.skill.${sk.id}`, owner: who, charId: characterId,
      label: `${who} ${sk.typeName || SKILL_TYPE_CN[sk.type] || sk.type}「${sk.name}」`,
      text: normalize(sk.desc), params: sk.params, skillType: sk.type,
    });
  }
  for (const t of ctx.tracesByChar.get(characterId) ?? []) {
    // 属性节点是结构化的，不需要标注 —— 跳过，避免刷出一堆假缺口
    if (t.statusAdd?.length) continue;
    if (!t.desc && !t.params?.length) continue;
    out.push({
      kind: 'trace', id: `${characterId}.trace.${t.id}`, owner: who, charId: characterId,
      label: `${who} 行迹「${t.name}」`, text: normalize(t.desc), params: t.params,
    });
  }
  for (const r of ctx.ranksByChar.get(characterId) ?? []) {
    out.push({
      kind: 'eidolon', id: `${characterId}.rank.${r.rank}`, owner: who, charId: characterId,
      rankId: r.rank, label: `${who} 星魂${r.rank}「${r.name}」`,
      text: normalize(r.desc), params: r.params,
    });
  }
  if (lightconeId != null) {
    const lc = ctx.lcById.get(lightconeId);
    if (lc) {
      out.push({
        kind: 'lightcone', id: `lc.${lightconeId}`, owner: who, charId: characterId,
        lcId: lightconeId, label: `光锥「${lc.name}」`,
        text: normalize(lc.skillDesc), params: lc.skillParams,
      });
    }
  }
  for (const [id, piece] of Object.entries(relicSets ?? {})) {
    const rs = ctx.relicsetById.get(Number(id));
    if (!rs) continue;
    out.push({
      kind: 'relicset', id: `relic.${id}.set2`, owner: who, charId: characterId,
      setId: Number(id), piece: 2, label: `遗器「${rs.name}」2件`,
      text: normalize(rs.set2Desc), params: rs.set2Params,
    });
    if (piece >= 4) {
      out.push({
        kind: 'relicset', id: `relic.${id}.set4`, owner: who, charId: characterId,
        setId: Number(id), piece: 4, label: `遗器「${rs.name}」4件`,
        text: normalize(rs.set4Desc), params: rs.set4Params,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 采集
// ---------------------------------------------------------------------------

/**
 * @param {object} query
 *   characterId  主角色
 *   team         [{characterId, eidolon, lightconeId, relicSets}] 至多 3 名队友
 *   scenarioId   'mode:seasonId:floorId'，可空
 *   annotations  loadAnnotations() 的结果
 */
/**
 * 标注 id → 它挂在哪条「来源」上。
 *
 * 一个来源可以带**多条**标注：银狼「能够制造：攻击力降低#1%、防御力降低#2%、
 * 速度降低#3%」一句话里三个效果，就是三条记录共用一个来源 id，用 `.b0/.b1/.b2` 区分。
 * 所以这儿建的是 id → 数组 的索引，不是一对一。
 * 没有 `.b<n>` 后缀的记录（手工写的星魂/光锥那类）按原样作自己的来源 id。
 */
function baseIdOf(id) {
  return String(id).replace(/\.b\d+$/, '');
}

export function collectBuffs(ctx, query) {
  const { annotations } = query;
  const ann = annotations?.buffs ?? [];
  const byBase = new Map();
  for (const a of ann) {
    const b = baseIdOf(a.id);
    const list = byBase.get(b);
    if (list) list.push(a); else byBase.set(b, [a]);
  }

  const active = [];
  const gaps = [];

  const everyActor = [
    {
      characterId: query.characterId, isSelf: true,
      eidolon: query.eidolon ?? 0,
      lightconeId: query.lightconeId ?? null,
      relicSets: query.relicSets ?? {},
      superimpose: query.superimpose ?? {},
    },
    ...(query.team ?? []),
  ];

  for (const actor of everyActor) {
    const vars = {
      eidolons: { [actor.characterId]: actor.eidolon ?? 0 },
      lightconeId: actor.lightconeId ?? null,
      superimpose: actor.superimpose ?? {},
      relicSets: actor.relicSets ?? {},
    };
    for (const src of sourcesOfCharacter(ctx, actor.characterId, vars)) {
      // ★ 技能类来源在这里**整个跳过** —— 它们改走增益目录 ★
      //
      //  技能增益现在由目录（自拐页签 + 队友目录）供给，数值走 core/catalog.mjs。
      //  这里再收一遍就是**同一条被算两次** —— 而且是静默翻倍：界面正常、
      //  条目都勾着、伤害就是高了一截，没有任何地方报错。
      //
      //  两边的分工写死为：
      //    · 自动路径（这里）：行迹 / 星魂 / 光锥 / 遗器套装 —— 有装配关系才算得出来的那些。
      //    · 目录路径：**技能**，以及用户手动勾的任何一条。
      //    · builtinBuffs（结构化行迹属性节点）：保持自动，不进目录（进了会被算两遍）。
      //
      //  ⚠️ 那些「含数值但目录没收录」的技能子句**不会**再出现在 gaps 里 ⚠️
      //   它们由目录的分桶报表接手（NO_ATTR / TARGET_UNKNOWN / SIDE_UNKNOWN /
      //   DOT_EXCLUDED 各自的计数与原文，界面上的「另有 N 条未识别、M 条有意不计」）。
      //   所以这不是「不报了」，是**换了报法**：以前按角色报「这 3 条没标注」，
      //   现在按子句报「这 146 条认不出属性键」。后者更准，因为它不依赖有没有人标注。
      //   真要查一条技能为什么没进目录，去 build_catalog.mjs --dump <桶名> 看原文。
      if (src.kind === 'skill') continue;
      const recs = byBase.get(src.id);
      if (!recs?.length) {
        // 有数值效果却没标注 —— 这是缺口，不是「没有增益」。
        //
        // ★ 判据是 `affectsDamage` 不是 `hasNumericEffect` ★
        //   后者会把「恢复#1[i]点能量」也算进来（停云一个角色就有 4 条这样的），
        //   界面于是显示「有 5 处未收录，结果偏低」—— 全是假的。
        //   假警告会把真警告淹掉，那比不报警还糟。
        //   顺带：「等级+N」是技能等级不是增益，同样排除。
        if (affectsDamage(src.text)) {
          gaps.push({
            id: src.id, kind: src.kind, owner: src.owner, label: src.label,
            text: src.text, reason: 'no_annotation',
          });
        }
        continue;
      }
      // 一个来源可能有多条标注（一句话里好几个效果），逐条都要算
      for (const rec of recs) {
        const varsFor = { ...vars, skillLevels: undefined };
        if (!isActive(rec, varsFor)) continue;
        const value = valueOf(ctx, rec, varsFor);
        if (value == null) {
          gaps.push({
            id: rec.id, kind: src.kind, owner: src.owner, label: src.label,
            text: src.text, reason: 'param_missing',
            note: `标注存在但取不到数值（param.index=${rec.param?.index}）`,
          });
          continue;
        }
        active.push({
          id: rec.id, key: rec.effect.key, op: rec.effect.op ?? 'add',
          value: value * (rec.effect.scale ?? 1),
          side: rec.effect.side, target: rec.effect.target,
          scope: rec.effect.scope ?? {},
          condition: rec.condition ?? null,
          owner: src.owner, label: src.label,
          provenance: rec.provenance ?? 'known',
          text: rec.text,
        });
      }
    }
  }

  return { active, gaps };
}

/**
 * 某个角色**自动路径**上的增益覆盖率。
 *
 * ★ 命令行（coverage.mjs）和界面角标**必须用同一个函数** ★
 *   各算一份的话，一边说 80% 另一边说 60%，这个数就再也没有人信了 ——
 *   而它恰恰是「我该去补哪些标注」的唯一指引。
 *
 * ★ 分母是「**影响伤害**的数值来源」，不是「含数字的来源」★
 *   后者会把「恢复#1点能量」算进去，分母虚高、覆盖率虚低，
 *   和缺口列表对不上号（缺口用的是 affectsDamage）。
 *
 * ★ 覆盖率是「我们录了多少」，**不是「对不对」** ★
 *   100% 也证明不了数值正确，只说明没有已知的遗漏项。
 *
 * ★★ 只统计**非技能**来源 ★★
 *   技能增益已经全部改走增益目录（`collectBuffs` 里那条 `src.kind === 'skill'`
 *   的跳过），标注表再也喂不到它们。此处要是还把技能算进分子分母，就会出现
 *   「分母 10 条、分子 1 条、缺口列表 0 条」这种自相矛盾的数 ——
 *   而这个函数存在的全部意义就是**指引还要补哪里**，自相矛盾就等于没有指引。
 *   技能那边的口径换成目录的分桶报表（`core.buffCatalogStats`）：
 *   认不出的、有意不算的，各自带计数和原文。
 */
export function coverageOf(ctx, characterId, annotations) {
  const srcs = sourcesOfCharacter(ctx, characterId, {})
    .filter((s) => s.kind !== 'skill');
  const numeric = srcs.filter((s) => affectsDamage(s.text));
  const annIds = new Set((annotations?.buffs ?? []).map((a) => baseIdOf(a.id)));
  const annotated = numeric.filter((s) => annIds.has(s.id)).length;
  const { active, gaps } = collectBuffs(ctx, { characterId, annotations, eidolon: 0 });
  return {
    numericSources: numeric.length,
    annotated,
    buffsActive: active.length,
    gaps: gaps.filter((g) => g.reason === 'no_annotation'),
    badge: numeric.length === 0 || annotated === 0 ? 'none'
      : annotated >= numeric.length ? 'full' : 'partial',
  };
}

// ---------------------------------------------------------------------------
// 聚合
// ---------------------------------------------------------------------------

/** 直接相加的属性键。elemDmg / abilityDmg / resPen 另走分属性分支。 */
const SUM_KEYS = ['atkPct', 'atkFlat', 'hpPct', 'hpFlat', 'defPct', 'defFlat',
  'speedPct', 'speedFlat', 'critRate', 'critDmg', 'dmgBoost',
  'defShred', 'defIgnore', 'vuln', 'dmgReduction', 'breakEffect', 'elation'];

/** 属性键 → 它落在哪个乘区，决定 _zones 里记哪一格。 */
const KEY_ZONE = {
  dmgBoost: 'dmgBoost', elemDmg: 'dmgBoost', abilityDmg: 'dmgBoost',
  vuln: 'vuln', dmgReduction: 'mitigation',
  resPen: 'res', defShred: 'def', defIgnore: 'def',
  // 不进任何乘区，但也不能掉进「未知属性键」那一支 —— 见 MULT_KEYS 注释
  speedPct: 'speed', speedFlat: 'speed', breakEffect: 'break', effectHit: 'effectHit',
  effectRes: 'effectRes',
  multiplierAdd: 'base', multiplierAddDown: 'base',
  multiplierScale: 'base', multiplierScaleDown: 'base', multiplierSet: 'base',
};

/**
 * 倍率改动类的键 —— 它们**改的是基础伤害那一项**，不是任何一个伤害乘区。
 *
 * ★ 不能塞进 SUM_KEYS ★ 那会变成 `agg.multiplierAdd += 0.3` 然后把 0.3 当成
 *   「+30% 增伤」用 —— 数值取到了、不报错、结果看起来完全合理，但是错的。
 *   它们按**作用技能**分别记账，由 computeHit 在算基础伤害时用。
 */
const MULT_KEYS = ['multiplierAdd', 'multiplierAddDown',
  'multiplierScale', 'multiplierScaleDown', 'multiplierSet'];

/**
 * 把增益实例加总成乘区需要的几个桶。
 * 返回的对象带 `_contributions`（谁给了多少）和 `_zones`（每个桶的可信度）。
 */
export function aggregate(buffs, { state = {}, enemy = null, ability = null } = {}) {
  const agg = {
    atkPct: 0, atkFlat: 0, hpPct: 0, hpFlat: 0, defPct: 0, defFlat: 0,
    speedPct: 0, speedFlat: 0, critRate: 0, critDmg: 0,
    // 按作用技能分档的倍率改动，见 MULT_KEYS
    multiplier: {},
    dmgBoost: 0, defShred: 0, defIgnore: 0,
    vuln: 0, dmgReduction: 0, breakEffect: 0, elation: 0,
    elemDmg: Object.fromEntries(ELEMENTS.map((e) => [e, 0])),
    resPen: Object.fromEntries(ELEMENTS.map((e) => [e, 0])),
    abilityDmg: {},
    _contributions: [],
    _zones: {},
    _skipped: [],
  };

  const bump = (bucket, b) => {
    const z = agg._zones[bucket] ??= { level: C.KNOWN, missing: [] };
    if (b.provenance && b.provenance !== 'known') z.level = C.PARTIAL;
    if (b.provenance === 'unknown') { z.level = C.UNKNOWN; z.missing.push(b.text ?? b.label); }
  };

  for (const b of buffs) {
    const k = b.key;
    let reason = null;
    if (b.key === 'dmgReduction' && b.side === 'ally') reason = '我方减伤仅影响生存';
    else if (b.scope?.enemySide != null && b.scope.enemySide !== enemy?.side) reason = '不属于当前半场';
    else if (b.scope?.enemySlot != null && b.scope.enemySlot !== enemy?.slot) reason = '不作用于当前敌人';
    else if (b.scope?.unresolvedTarget) reason = '情境效果目标未解析';
    else if (b.condition?.trigger === 'after_weakness_break' && !state.broken) reason = '需要先击破当前敌人';
    else if (b.scope?.abilityTypes?.length && k !== 'abilityDmg' && !MULT_KEYS.includes(k)
      && !b.scope.abilityTypes.includes(ability?.type)) reason = '不适用于当前技能类型';
    else if (b.scope?.element && !['elemDmg','resPen'].includes(k) && ability
      && b.scope.element !== ability.element) reason = '不适用于当前伤害属性';
    if (reason) { agg._skipped.push({ ...b, reason }); continue; }
    if (k === 'elemDmg') {
      const el = b.scope?.element;
      if (el && el in agg.elemDmg) agg.elemDmg[el] += b.value; else for (const e of ELEMENTS) agg.elemDmg[e] += b.value;
      bump('elemDmg', b);
    } else if (k === 'abilityDmg') {
      // 一句话可能限定**多个**技能类型（「普攻和战技造成的伤害提高」），逐个记。
      // `abilityType`（单数）是老写法，人工表里可能还有，一并认。
      const ts = b.scope?.abilityTypes?.length ? b.scope.abilityTypes
        : b.scope?.abilityType ? [b.scope.abilityType] : ['all'];
      for (const t of ts) agg.abilityDmg[t] = (agg.abilityDmg[t] ?? 0) + b.value;
      bump('abilityDmg', b);
    } else if (k === 'resPen') {
      // 抗性穿透是**分属性**的，不能并成一个标量
      const el = b.scope?.element;
      if (el && el in agg.resPen) agg.resPen[el] += b.value;
      else for (const e of ELEMENTS) agg.resPen[e] += b.value;
      bump('res', b);
    } else if (MULT_KEYS.includes(k)) {
      // 按作用技能分别记账：key = 技能种类（库里 type 的英文枚举），
      // 判不出种类的用 'all'（＝「本次/该/此」那一类，作用于正在算的这个技能）。
      const kind = b.scope?.abilityKind ?? 'all';
      const slot = agg.multiplier[kind] ??= { add: 0, scale: 1, set: null };
      const perStack = b.scope?.perStack ? (b.stacks ?? 1) : 1;
      const v = b.value * perStack;
      if (k === 'multiplierAdd') slot.add += v;
      else if (k === 'multiplierAddDown') slot.add -= v;
      else if (k === 'multiplierScale') slot.scale *= (1 + v);
      else if (k === 'multiplierScaleDown') slot.scale *= (1 - v);
      else if (k === 'multiplierSet') slot.set = v;      // 「提高为原倍率的 X」= 直接设成 ×X
      bump('base', b);
    } else if (k === 'dmgReduction') {
      // 独立减伤效果逐项相乘；50% 与 60% 减伤合成 80%，不能加成110%。
      agg.dmgReduction = 1 - (1 - agg.dmgReduction) * (1 - Math.min(1, Math.max(0, b.value)));
      bump('mitigation', b);
    } else if (SUM_KEYS.includes(k)) {
      agg[k] += b.value;
      bump(KEY_ZONE[k] ?? k, b);
    } else {
      // 未知属性键 —— 也要报出来，不能吞掉
      bump('dmgBoost', { ...b, provenance: 'unknown', text: `未知属性键 ${k}：${b.label}` });
    }
    agg._contributions.push({ key: k, value: b.value, from: b.label, owner: b.owner, provenance: b.provenance,
      // 「每层/每点」类：层数只有界面知道，这里按 1 层算 —— 标记出来让界面能说明
      perStack: b.scope?.perStack === true, abilityKind: b.scope?.abilityKind ?? null });
  }

  return agg;
}

/**
 * 把行迹里**元素增伤**类节点直接转成常驻增益。
 * 这些是结构化的、不由人工标注决定，所以标 known —— 与人工标注的条目区分开。
 */
export function builtinBuffs(ctx, characterId, { level = 80 } = {}) {
  const out = [];
  const promotion = promotionForLevel(ctx, level);
  for (const t of ctx.tracesByChar.get(characterId) ?? []) {
    for (const s of t.statusAdd ?? []) {
      const m = /^(Physical|Fire|Ice|Thunder|Wind|Quantum|Imaginary)AddedRatio$/.exec(s.property_type ?? '');
      if (!m) continue;
      if (t.promotionLimit != null && t.promotionLimit > promotion) continue;
      out.push({
        id: `${characterId}.trace.${t.id}.elem`,
        key: 'elemDmg', op: 'add', value: s.value ?? 0,
        side: 'ally', target: 'self', scope: { element: m[1] },
        owner: ctx.charById.get(characterId)?.name, label: `行迹「${t.name}」`,
        provenance: 'known', text: t.name,
      });
    }
  }
  return out;
}
