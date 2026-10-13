// 增益目录的构建期烘焙。
//
//   输入  _data_cache/hsr_core.json + annotations/buffs.jsonl
//   输出  core.buffCatalog / core.buffCatalogStats（由 build_data.mjs 烧进数据块）
//
//   node _scripts/build_catalog.mjs --audit     只出分桶报表，不写任何东西
//   node _scripts/build_catalog.mjs --dump NO_ATTR   把某个桶的全文逐条打出来
//
// ★ 为什么要有这个脚本 ★
// 界面要从「选队友角色」改成「选辅助技能条目」。条目从哪来？遍历**全部 6 类来源**
// （技能/忆灵技/行迹/星魂/光锥/遗器）的 desc，把每一条含数值的子句认出来。
//
// ★ 而「认不出来」必须看得见 ★
// 老的提取器里，`matchAttr` 返回 null 就等于那条子句**消失了** —— 没有计数、
// 没有告警、没有痕迹。所以这里对每一条含数值的子句强制分桶，
// verify 有一条守恒式盯着（各桶之和 === 含数值子句总数）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalize, buffClauseParts } from '../core/clauses.mjs';
import {
  classifyClause, BUCKET, BUCKET_ORDER, BUCKET_NOTE,
} from '../core/attr.mjs';
import { characterDisplayName, stripTags, SKILL_TYPE_CN } from '../core/ctx.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');

export { BUCKET, BUCKET_ORDER, BUCKET_NOTE };

// ---------------------------------------------------------------------------
// 来源枚举
// ---------------------------------------------------------------------------

/**
 * 全部 6 类来源，一条不落：
 *   skill / servantSkill（忆灵辅助技）/ trace / eidolon / lightcone / relicset。
 *
 * ★ 与 `core/buffs.mjs:sourcesOfCharacter` 的区别，两处都要知道 ★
 *   · sourcesOfCharacter 是**运行期**用的，只覆盖「这个角色身上现在有装配关系的」来源
 *     （光锥要装了才算、套装要够件数才算），而且**按 ATTACK_TYPES 过滤技能**，
 *     还**明确跳掉忆灵技**（`if (sk.servant) continue;`）。
 *   · 这个函数是**构建期**用的：要的是「游戏里存在哪些辅助技能」，
 *     所以光锥不挑装配、遗器不挑件数，技能也**包含秘技/协战**（秘技的增益同样生效）。
 *   两者的 id 前缀**故意保持一致**（`<charId>.skill.<id>` / `<charId>.servant.<id>` /
 *   `lc.<id>` / `relic.<id>.set2`…），这样人工表里的记录和目录条目能对上号，
 *   `baseIdOf()` 的匹配也才成立。
 *
 * ★ servantSkill 只在**这里**发，运行期一个来源都不发 ★
 *   界面上的自拐卡片与队友目录直接读烘焙好的 `core.buffCatalog`（见
 *   `ui/app.mjs` 的 selfEntries / teamEntries），不经过 sourcesOfCharacter ——
 *   所以忆灵技增益照常可选，而 `core/buffs.mjs` 的自动路径**一条都不会多收**，
 *   不会算两遍。代价是**不能给忆灵技写人工表**：`verify.mjs` 那节
 *   「人工表的记录运行期必须看得见」的断言只认 sourcesOfCharacter 那一份，
 *   写了会被判成孤儿。本次不需要写（13 首自动进目录）。
 */
export function catalogSources(core) {
  const out = [];
  const chById = new Map(core.characters.map((c) => [c.id, c]));

  const push = (kind, ownerId, ownerBase, owner, label, text, source) => {
    if (!text) return;
    out.push({ kind, ownerId, ownerBase, owner, label, text: normalize(text), source });
  };

  for (const sk of core.skills) {
    const ch = chById.get(sk.charId);
    if (!ch) continue;
    const who = characterDisplayName(ch, core.characters);
    const base = String(stripTags(ch.name) ?? '');
    const typeCn = sk.typeName || SKILL_TYPE_CN[sk.type] || sk.type || '技能';
    push('skill', sk.charId, base, who,
      `${who} · ${typeCn}「${sk.name}」`, sk.desc,
      { kind: 'skill', charId: sk.charId, skillId: sk.id, skillType: sk.type });
  }

  // ★ 忆灵的**辅助**技（昔涟德谬歌那 17 首诗、迷迷的辅助技…）★
  //
  //   它们不在 character_skills 表里，在 characters.memosprite_json.skills —— 见
  //   build_data.mjs 的 servantSkills / servantSupport 两段。这里遍历的是
  //   `servantSupport`（纯辅助的那些）；打伤害的忆灵技走 skills / abilities，
  //   它们的倍率子句落进 DAMAGE_TERM 桶，本来就不该进增益目录。
  //
  //   ★ 归属者是**召唤者**，不是忆灵 ★ 目录的「来源角色」模型里没有「忆灵」这一格，
  //     而忆灵技只在召唤者在场时存在，所以记在召唤者名下。这意味着
  //     `target === 'self'` 的那些（实测 24 条里 23 条）会进**召唤者自己的自拐卡片**，
  //     只在「算召唤者本人」时可选。这是一个**近似**，README 里写明了。
  //
  //   ★ 循环必须**另起一段**，不能写成 `[...core.skills, ...core.servantSupport]` ★
  //     `_rev.mjs` 的 R22 反证锚点就是上面那行 `for (const sk of core.skills) {`，
  //     合并遍历会让那条反证**静默失效**（改坏也不再变红）。
  for (const sk of core.servantSupport ?? []) {
    const ch = chById.get(sk.charId);
    if (!ch) continue;
    const who = characterDisplayName(ch, core.characters);
    const base = String(stripTags(ch.name) ?? '');
    // `SKILL_TYPE_CN` 里**没有** Servant / ServantTalent 两个键，靠库里的 type_name
    // （「忆灵技」/「忆灵天赋」）。两个都缺时退回「忆灵技」，别把英文 type 露到界面上。
    const typeCn = sk.typeName || SKILL_TYPE_CN[sk.type] || '忆灵技';
    push('servantSkill', sk.charId, base, who,
      `${who} · 忆灵「${sk.servant?.name ?? '?'}」${typeCn}「${sk.name}」`, sk.desc,
      { kind: 'servantSkill', charId: sk.charId, skillId: sk.id, skillType: sk.type });
  }

  for (const t of core.traces) {
    const ch = chById.get(t.charId);
    if (!ch) continue;
    // 属性节点是结构化的，走 builtinBuffs，不需要标注 —— 跳过，避免刷出一堆假缺口
    if (t.statusAdd?.length) continue;
    const who = characterDisplayName(ch, core.characters);
    push('trace', t.charId, String(stripTags(ch.name) ?? ''), who,
      `${who} · 行迹「${t.name}」`, t.desc,
      { kind: 'trace', charId: t.charId, pointId: t.id });
  }

  for (const r of core.ranks) {
    const ch = chById.get(r.charId);
    if (!ch) continue;
    const who = characterDisplayName(ch, core.characters);
    push('eidolon', r.charId, String(stripTags(ch.name) ?? ''), who,
      `${who} · 星魂${r.rank}「${r.name}」`, r.desc,
      { kind: 'eidolon', charId: r.charId, rankId: r.rank });
  }

  for (const lc of core.lightcones) {
    push('lightcone', null, null, `光锥「${lc.name}」`,
      `光锥「${lc.name}」 · ${lc.skillName ?? ''}`.trim(), lc.skillDesc,
      { kind: 'lightcone', lcId: lc.id });
  }

  for (const rs of core.relicsets) {
    push('relicset', null, null, `遗器「${rs.name}」`,
      `遗器「${rs.name}」 2件`, rs.set2Desc, { kind: 'relicset', setId: rs.id, piece: 2 });
    push('relicset', null, null, `遗器「${rs.name}」`,
      `遗器「${rs.name}」 4件`, rs.set4Desc, { kind: 'relicset', setId: rs.id, piece: 4 });
  }

  return out;
}

// ---------------------------------------------------------------------------
// 烘焙目录
// ---------------------------------------------------------------------------

/**
 * 来源 → 目录条目的 id。与 extract_buffs 的提案 id、buffs.jsonl 的 id 同一套编法。
 *
 * ★ 导出，是因为这套编法被抄到了太多地方 ★
 *   verify 的语料索引、一次性探针、人工表补录脚本 —— 每个都自己手写一遍 `entryId`。
 *   抄错一位（`.b` 写成 `.c`、ordinal 从 1 起）的表现不是报错，而是
 *   **人工表整表变成孤儿**：条目还在、界面看着正常，只是一个人的标注全部套不上。
 *   而「抄错」和「规则改了」在报错里长得一模一样，很难分。留一份在此，其余地方 import。
 */
export function entryId(ref, ordinal) {
  switch (ref.kind) {
    case 'skill': return `${ref.charId}.skill.${ref.skillId}.b${ordinal}`;
    // `.servant.` 与 extract_buffs.mjs 给忆灵技发倍率提案时用的
    // `${charId}.servant.${skillId}` 是同一套编法，且**两边技能集合不相交**
    // （那边只遍历打伤害的 servantSkills，这边只遍历辅助的 servantSupport），不会撞号。
    case 'servantSkill': return `${ref.charId}.servant.${ref.skillId}.b${ordinal}`;
    case 'trace': return `${ref.charId}.trace.${ref.pointId}.b${ordinal}`;
    case 'eidolon': return `${ref.charId}.rank.${ref.rankId}.b${ordinal}`;
    case 'lightcone': return `lc.${ref.lcId}.b${ordinal}`;
    case 'relicset': return `relic.${ref.setId}.set${ref.piece}.b${ordinal}`;
    default: return null;
  }
}

/** 星光锥/遗器的「归属者」是装它的人，不是某个固定角色。 */
const SHARED_KIND = new Set(['lightcone', 'relicset']);

/**
 * 分类器判成这几个桶的子句，**不需要人工表**就能进目录。
 *
 * ★ 加新桶进来之前先看这条不变式 ★
 *   `CATALOG.length === PICKABLE + PANEL_ANCHORED + humanRescued`
 *   （verify 有断言盯着）。往这里加一个桶，就必须同时确认「该桶的每一条都真的进得来」——
 *   而进不来是**逐条**的（比如 `PANEL_ANCHORED` 要求基数/结果键/作用对象三样齐全，
 *   但桶只按「分类器判成了哪一桶」记）。两边一旦不严格相等，差值就是 1 或 2，
 *   报错长得和「人工表过期」一模一样，最难查。
 */
const AUTO_COLLECTED = new Set([BUCKET.PICKABLE, BUCKET.PANEL_ANCHORED]);

/** 全库角色**显示名** —— `classifyClause` 找「句子里点名的另一个角色」时用的那份名单。 */
export function charDisplayNames(core) {
  return (core.characters ?? []).map((c) => characterDisplayName(c, core.characters)).filter(Boolean);
}

/**
 * 一次把 `classifyClause` 要的**全部**上下文算齐：来源归属者 / 全库角色名 / 紧邻回看用的前文。
 *
 * ★ 为什么必须收成一个函数 ★
 *   分桶审计（`auditCatalog`）和烘焙（`buildCatalog`）是**两条各自独立遍历**的路径，
 *   但它们数的是同一批桶，verify 拿守恒式把两边对拍。凡是喂给分类器的上下文，
 *   两边差一样东西，桶计数就会分叉 —— 而分叉的形状是「两个数不一样」，
 *   看不出是谁少了哪一样。所以上下文只在这里算一次，两边都从这里拿。
 *
 * ★ `prev` 是**整份来源文本**里该子句之前的那些片段，不是「之前若干条」★
 *   面板锚定那一路只取它的最后一条非空项（理由见 `core/attr.mjs:panelOf`），
 *   多传不会改变结果；少传则会让一批条目静默消失。
 */
export function classifyOptsFor(source, core, names = null, prev = []) {
  return { ownerName: source.ownerBase, names: names ?? charDisplayNames(core), prev };
}

/**
 * 把全部 5 类来源的**可收录子句**烘成目录。
 *
 * ★ 刻意不存数值 ★
 *   条目只记「从哪个数组的第几项取」（`ref`），等级/叠影/星魂由全局开关在**取值时**注入。
 *   存了数值的话，用户一切换等级开关，几百条条目就全部过期了 —— 而且过期是静默的。
 *
 * ★ 人工表优先，但不是覆盖 ★
 *   `annotations/buffs.jsonl` 里若有同 id 记录，用它那条（provenance: 'known'）；
 *   否则用自动提案（'partial'）。两边的 `text` 必须一致 —— 对不上说明 id 指错了子句，
 *   这时**不静默采信**，而是把两边都记下来报出去（verify 有断言盯着）。
 *
 * @param core  hsr_core.json
 * @param human annotations/buffs.jsonl 的行（可省）
 */
export function buildCatalog(core, human = []) {
  const humanById = new Map();
  for (const h of human) if (h?.id) humanById.set(h.id, h);

  const rows = [];
  const stats = {
    byKind: {}, byBucket: {}, humanUsed: 0, humanRescued: 0, humanMismatch: 0, noValue: 0,
  };
  const mismatches = [];

  const names = charDisplayNames(core);
  for (const s of catalogSources(core)) {
    // （属性节点类的行迹已经在 catalogSources 里就被跳过了：它们走 builtinBuffs，
    //   是结构化直给的，进目录会被**算两遍**。）
    const parts = buffClauseParts(s.text);
    parts.forEach((part, ordinal) => {
      const id = entryId(s.source, ordinal);
      const cls = classifyClause(part, classifyOptsFor(s, core, names, parts.slice(0, ordinal)));
      const h = humanById.get(id);

      // 分桶计数照旧按**分类器**的判定记。守恒式（各桶之和 === 子句总数）问的是
      // 「分类器把每条子句分到了哪」，和下面谁最终进目录是两件事。
      if (cls) stats.byBucket[cls.bucket] = (stats.byBucket[cls.bucket] ?? 0) + 1;

      // ★★ 人工表是**越过分桶**的优先，不只是「同 id 时优先」★★
      //   人工表里已有的记录，是人对这条子句下的判断。分类器判不出来
      //   （TARGET_UNKNOWN / NO_ATTR / …）只说明规则还不够 ——
      //   **不能因此把人手写的那条扔掉**。而扔掉是静默的：记录还躺在
      //   buffs.jsonl 里，用户在界面上却勾不到，也没有任何提示说它被吞了。
      //
      //   真踩过：阮•梅「使除自身以外的队友速度提高」和翡翠「使其速度提高」两条
      //   都落进 TARGET_UNKNOWN —— 分类器认得出属性键和侧别，只是判不出作用于谁，
      //   于是连人手写的那条一起消失了。这正是本项目反复吃过的那个亏。
      //
      //   代价是 `PICKABLE` 桶计数会**小于**目录条数，差值就是这里救回来的。
      //   它单独记在 `humanRescued` 里，verify 断言
      //   `CATALOG.length === PICKABLE + humanRescued` —— 不记的话这个差值
      //   会被下一个人当成「目录比桶还多，肯定哪里算错了」。
      if (h) {
        stats.humanUsed++;
        // 人工表的 text 是回归闸门。对不上说明 id 指到了别的子句 —— 报出来，不采信。
        if (h.text !== part.trim()) {
          stats.humanMismatch++;
          mismatches.push({ id, human: h.text, auto: part.trim() });
          return;
        }
        if (!cls || cls.bucket !== BUCKET.PICKABLE) stats.humanRescued++;
      } else if (!cls || !AUTO_COLLECTED.has(cls.bucket)) {
        return;
      }
      const ref = { ...s.source };
      rows.push({
        id,
        kind: s.kind,
        ownerId: s.ownerId ?? null,
        owner: s.owner,
        label: s.label,
        text: part.trim(),
        // ★ 分类器把这条子句分到了哪个桶 ★
        //   正常情况下这里恒为 `PICKABLE`（不是 PICKABLE 的根本进不来）。
        //   唯一例外就是**人工表救回来的**那些 —— 看到 `bucket: 'TARGET_UNKNOWN'`
        //   而条目又确实在目录里，说明分类器没判出来、是人工表把它捞回来的。
        //   记下来是为了让「救回了几条」可核对：`humanRescued === 非 PICKABLE 的条数`。
        bucket: cls?.bucket ?? null,
        // ★ 取哪个占位符 ★ 不带这个就取不出数 —— 而取不出数的表现是「显示为空」，
        //   不是报错，很容易被当成「这条本来就没数值」。
        //   人工表里叫 `param.index`，这里沿用同一个说法。
        // ⚠ 下面全部用 `cls?.hit?.…`：被人工表**救回来**的那条，`cls` 可能是
        //   `hit: null` 的桶（倍率 / DoT / 非增益），也可能是 `cls` 本身为 null。
        //   写成 `cls.hit.x` 会当场抛，而不是「退回用人工表的值」。
        paramIndex: h?.param?.index ?? cls?.hit?.paramIndex ?? null,
        // 一条子句里除了这个数值还有别的数值 → 机器分不清是「多基数相加」还是
        // 「一句话列了多个效果」，标出来让人复核（沿用提取器那套 reasons）。
        reasons: cls?.hit?.reasons ?? [],
        key: h?.effect?.key ?? cls?.hit?.key,
        side: h?.effect?.side ?? cls?.hit?.side,
        // ★ 作用对象：人工表可以（也应该）显式给 ★
        //   分类器判不出的那一桶，缺的**只有这一项** —— 其余字段它都认得出。
        //   所以人工记录里补一个 `effect.target` 就能把条目接回页签。
        target: h?.effect?.target ?? cls?.hit?.target,
        targetSource: cls?.hit?.targetSource ?? (h ? 'human' : null),
        scope: h?.effect?.scope ?? cls?.hit?.scope ?? {},
        unit: h?.effect?.unit ?? cls?.hit?.unit ?? null,
        condition: h?.condition ?? cls?.hit?.condition ?? null,
        // ★ 面板锚定条目：数值不是句里那个百分比，而是「某人面板的某几成」★
        //   有这个字段，`catalogValue` 才走「面板 × 百分比」那条路；没有就是普通条目。
        //   人工表可以用 `effect.panel` 整项覆盖（比如分类器把基数认错了）。
        panel: h?.effect?.panel ?? panelRefOf(s, cls),
        // ★ 只有光锥/遗器是「共享」的：它的归属者是**装它的那个人** ★
        //   skill/trace/eidolon 的归属者在 ref 里（charId）。
        shared: SHARED_KIND.has(s.kind),
        ref,
        provenance: h ? 'known' : 'partial',
        reviewReason: h ? null : (cls?.hit?.reasons?.[0] ?? (cls?.hit?.targetSource === 'source_owner' ? 'TARGET_INFERRED' : null)),
        // 供界面显示：这条的数值从哪来
        valueFrom: valueSourceOf(s.kind),
      });
      stats.byKind[s.kind] = (stats.byKind[s.kind] ?? 0) + 1;
    });
  }
  return { entries: rows, stats, mismatches };
}

/**
 * 面板锚定条目的「吃谁的面板」—— 把分类器推出来的 `who` 换成**界面上找得到的名字**。
 *
 * ★ 光锥/遗器一律 `'@equipped'` ★
 *   它们的归属者不是某个固定角色，而是「装它的那个人」，而 v1 的口径是
 *   「勾了就当成当前计算的角色装的」（见 `core/catalog.mjs:SHARED` 那段注释）。
 *   所以这里不写人名 —— 写人名等于替用户指定了一个装备者，而那是猜的。
 *
 * ★ `{NICKNAME}` 要换成显示名 ★
 *   开拓者在数据里的名字字面量就是 `{NICKNAME}`，而界面上、面板输入框里
 *   显示的名字是「开拓者·同谐（穹）」。照搬 `{NICKNAME}` 的后果是
 *   **同一个人存成两份面板**：填了一次，另一条还是空的，看起来像「这条没生效」。
 *   所以凡是带 `{` `}` 的（占位名），一律回退到来源的显示名。
 */
function panelRefOf(s, cls) {
  const p = cls?.hit?.panel;
  if (!p) return null;
  if (SHARED_KIND.has(s.kind)) return { ...p, who: '@equipped' };
  const who = (p.who && !/[{}]/.test(p.who)) ? p.who : (s.owner ?? null);
  return { ...p, who };
}

/** 数值随哪个全局开关变 —— 界面要按这个分组显示「等级/叠影/件数」提示。 */
function valueSourceOf(kind) {
  switch (kind) {
    case 'skill': return 'skillLevel';
    // 忆灵技的等级也走「技能等级」那一档开关 —— 只是忆灵技**不受星魂 R3/R5 的
    // +1/+2 影响**（`effectiveSkillLevel` 按 SKILL_TYPE_CN 查表，Servant 查不到
    // 就原样返回基准等级）。这一点 README 写明了。
    case 'servantSkill': return 'skillLevel';
    case 'trace': return 'none';         // 行迹属性节点是结构化直给，不存在等级
    case 'eidolon': return 'eidolon';
    case 'lightcone': return 'superimpose';
    case 'relicset': return 'pieces';
    default: return 'none';
  }
}

// ---------------------------------------------------------------------------
// 分桶审计
// ---------------------------------------------------------------------------

/**
 * 遍历全部来源的全部含数值子句，逐条分桶。
 * 返回的 `tally` 各桶之和**必须**等于 `clauseTotal` —— verify 拿这条守恒式当总闸。
 */
export function auditCatalog(core, { sampleLimit = 500 } = {}) {
  const sources = catalogSources(core);
  const tally = Object.fromEntries(BUCKET_ORDER.map((b) => [b, 0]));
  const samples = Object.fromEntries(BUCKET_ORDER.map((b) => [b, []]));
  const byKind = {};
  const names = charDisplayNames(core);
  let clauseTotal = 0;
  let sourcesWithClause = 0;

  for (const s of sources) {
    let any = false;
    // ★ 切分用 `buffClauseParts` 而不是 `clausesWithIndex` ★
    //   两者切点不同：前者多切一个顿号「、」，且保留句尾标点。
    //   这不是无关紧要的差别 —— 目录条目的 id 是「第几个片段」，
    //   而人工表 buffs.jsonl 的 id 是**按 buffClauseParts 编的**。
    //   审计要是按另一套切分来数，就会得到「目录里 482 条」而人工表一条都对不上，
    //   看起来像人工表过期了，实际是两把尺子。所以这里和目录、和人工表**对齐**。
    const parts = buffClauseParts(s.text);
    parts.forEach((part, ordinal) => {
      const c = { text: part };
      const cls = classifyClause(c.text, classifyOptsFor(s, core, names, parts.slice(0, ordinal)));
      if (!cls) return;
      any = true;
      clauseTotal++;
      tally[cls.bucket]++;
      (byKind[s.kind] ??= {})[cls.bucket] = (byKind[s.kind][cls.bucket] ?? 0) + 1;
      if (cls.bucket !== BUCKET.PICKABLE && samples[cls.bucket].length < sampleLimit) {
        samples[cls.bucket].push({
          // 这条链和 `entryId()` 是**同一套编法的手抄第二份**。抄漏一个 kind 不会
          // 报错 —— 只会让 `--dump` 出来的 id 变成 `relic.undefined.setundefined`，
          // 看着像数据坏了。加来源时**两处一起加**。
          id: s.source.kind === 'skill' ? `${s.ownerId}.skill.${s.source.skillId}`
            : s.source.kind === 'servantSkill' ? `${s.ownerId}.servant.${s.source.skillId}`
              : s.source.kind === 'trace' ? `${s.ownerId}.trace.${s.source.pointId}`
                : s.source.kind === 'eidolon' ? `${s.ownerId}.rank.${s.source.rankId}`
                  : s.source.kind === 'lightcone' ? `lc.${s.source.lcId}`
                    : `relic.${s.source.setId}.set${s.source.piece}`,
          kind: s.kind, owner: s.owner, label: s.label,
          text: c.text.trim(), hit: cls.hit,
        });
      }
    });
    if (any) sourcesWithClause++;
  }

  return { sources, tally, samples, byKind, clauseTotal, sourcesWithClause };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);
  const core = JSON.parse(fs.readFileSync(path.join(ROOT, '_data_cache', 'hsr_core.json'), 'utf8'));
  const audit = auditCatalog(core);

  if (args.includes('--dump')) {
    const want = args[args.indexOf('--dump') + 1];
    const list = audit.samples[want];
    if (!list) { console.error(`没有这个桶：${want}（可选 ${BUCKET_ORDER.join(' / ')}）`); process.exit(1); }
    console.log(`=== ${want}（共 ${audit.tally[want]} 条，下面列出 ${list.length} 条）===`);
    for (const s of list) console.log(`[${s.kind}] ${s.label}\n    ${s.text}`);
    return;
  }

  console.log(`来源主体 ${audit.sources.length} 条，其中含数值子句的 ${audit.sourcesWithClause} 条`);
  console.log(`含数值子句共 ${audit.clauseTotal} 条\n`);
  console.log('桶                      条数    占比');
  for (const b of BUCKET_ORDER) {
    console.log(`  ${b.padEnd(16)} ${String(audit.tally[b]).padStart(6)}  `
      + `${(100 * audit.tally[b] / Math.max(audit.clauseTotal, 1)).toFixed(1)}%   ${BUCKET_NOTE[b]}`);
  }
  console.log(`  ${'合计'.padEnd(15)} ${String(audit.clauseTotal).padStart(6)}`);
  const sum = BUCKET_ORDER.reduce((n, b) => n + audit.tally[b], 0);
  console.log(`\n守恒检查: 各桶之和 ${sum} ${sum === audit.clauseTotal ? '== 子句总数 ✓' : '≠ 子句总数 ✗ 有子句没被分桶'}`);

  console.log('\n按来源类别:');
  for (const k of Object.keys(audit.byKind)) console.log(`  ${k.padEnd(11)}`, JSON.stringify(audit.byKind[k]));

  console.log('\n看某个桶的全文: node _scripts/build_catalog.mjs --dump <桶名>');
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
