// 增益目录的运行期。零 IO、零 DOM，浏览器和 Node 都能直接 import。
//
// 目录本身（`core.buffCatalog`）是**构建期**烘出来的：全部 5 类来源（技能/行迹/星魂/
// 光锥/遗器）里认得出来的增益子句，一条一行，**不存数值**。
// 这个模块负责三件事：
//   ① 取值 —— 按全局开关（技能等级 / 星魂 / 叠影 / 件数）把某一条的数值现算出来；
//   ② 分组 —— 按作用对象（我方单体 / 我方全体 / 敌方负面）再按属性分组，给界面用；
//   ③ 选择 → BuffInstance —— 把勾中的条目变成 `aggregate` 认的那个形状。
//
// ★ 为什么数值不存进目录 ★
//   存了的话，用户一切换「满级+满星魂」，几百条条目就全部过期了 ——
//   而且是**静默**过期：界面上数字还在，只是全是旧的。
//
// ★ 符号约定（全库统一）★
//   `value` 恒为**正的量级**，符号由属性键承载（`1 + dmgBoost` / `1 - defShred`）。
//   所以这里不做任何「降低 → 取负」的转换，`direction` 只是文本极性记录。
import { resolveParam, effectiveSkillLevel } from './ctx.mjs';
import { baseLevelOf } from './abilities.mjs';
import { UNCOMPUTABLE_ABILITY } from './attr.mjs';

// ---------------------------------------------------------------------------
// 全局开关
// ---------------------------------------------------------------------------

/**
 * 全局开关的默认值。
 *
 *   tier        'base' = 基础满级（普攻 6 / 其余 10、星魂 0）
 *               'max'  = 满级 + 满星魂（普攻 10 / 其余 15、星魂 6）
 *   superimpose 光锥叠影 S1~S5（默认 S1）
 *   pieces      遗器件数 2 或 4（默认 4，够 4 才吃得到 4 件套）
 *   stacks      「每层/每点」类增益按几层算（默认 1）
 *
 * 星魂/技能等级也可以按角色单独覆盖（`eidolons` / `skillLevels`），
 * 用于「这个角色我只有 R1」这种情形。
 */
export const DEFAULT_OPTS = {
  tier: 'base',
  superimpose: 1,
  pieces: 4,
  stacks: 1,
  eidolons: {},
  skillLevels: {},
};

export function withDefaults(opts) {
  return { ...DEFAULT_OPTS, ...(opts ?? {}) };
}

/** 某角色的星魂数：显式指定的优先，否则按全局档位（基础档 = 0）。 */
export function eidolonOf(opts, charId) {
  const o = withDefaults(opts);
  const explicit = o.eidolons?.[charId];
  if (explicit != null) return explicit;
  return o.tier === 'max' ? 6 : 0;
}

// ---------------------------------------------------------------------------
// 取值
// ---------------------------------------------------------------------------

/**
 * 一条目录条目在当前开关下能不能选 / 为什么不能。
 * 返回 null 表示可选。
 *
 * ★ 这些必须**显式置灰**而不是静默算 0 ★
 *   「星魂 6 的增益在 R1 下算 0」和「这条增益就是没有」在界面上长得一模一样，
 *   用户没法分辨自己是选错了还是数据错了。
 *
 * ★★ 星魂不设门槛（`rank_locked` 已退役）★★
 *   这里原本有一条 `entry.kind === 'eidolon'` 的分支，把 `rankId > 已有星魂` 的条目
 *   锁死置灰。**已按用户要求删除**：任意星魂的增益都可以直接调用，不受初始档位限制。
 *   理由是这个门槛把「我抽到了 R2，想看看 R2 这条值多少」变成了做不到 ——
 *   而用户勾一条星魂增益时，本来就是在自己声明「这一条我要算进去」。
 *
 *   两条**不能连坐删掉**的东西，改这里时最容易误伤：
 *     · `eidolonOf` 的 `tier === 'max' ? 6 : 0` —— `catalogValue` 的 `case 'skill'`
 *       还在用它算 R3/R5 的「技能等级 +2/+1」。那个**仍然跟随全局档位**
 *       （用户裁定）：解锁只影响「星魂增益能不能勾」，不影响技能等级。
 *     · 下面 `piece_short` 这条分支 —— 它是本函数现在唯一还在生效的门槛。
 *
 *   于是 `displayValueOf` 的 `rank_locked` 分支与 `skipReasonCN` 的对应 case
 *   成了死代码。**留着不删**：将来若再引入别的锁定，那条通路是现成的。
 */
/**
 * ★ 模型里**没有这一档**的条目：显式置灰 + 说清为什么，绝不静默算一个错数 ★
 *
 * 和 `blockedReason` 里那条 `piece_short` 是同一个药方，但病不同：
 * 件数不够是「现在还不能选，凑齐就行」，这里是「选上了也没有正确的算法」。
 * 两者都**必须置灰**——因为「算错」远坏于「算不了」：
 * 算不了看得见（值是「—」，有说明），算错了和「这条增益就是这么强」在界面上分不出来。
 *
 * ★ 现在的唯一一条：光锥「这就是我啦！」★
 *   「使装备者施放终结技时造成的伤害值提高，提高数值等同于装备者防御力的#2%」
 *   #2 满叠影 0.6（=60%）。关键在于「伤害**值**提高」——它加的是**伤害的点数**
 *   （平值），不是伤害的百分比。模型里没有「平值伤害」这一档
 *   （v1 的乘区只有倍率/增伤/暴击/防御/抗性/易伤/韧性）。
 *   而 `catalogValue` 算出来的是 `防御力 × 0.6` —— 存护角色防御力 ~1500，
 *   得到 900。这个数**量纲是「点」**，但 `dmgBoost` 那一档要的是**分数**
 *   （0.55 表示 55%），于是 900 被当成 +90000% 增伤 → 伤害 ×901。
 *   和这次修的「面板锚定被当成百分比」是同一族病（平值与百分比混用），
 *   只是这一条的基数（防御力）本身就是个大数、又落在增伤键上，所以更隐蔽。
 *
 *   要注意「今日亦是和平的一日」那两条**不受影响**：它们写的是
 *   「造成的伤害提高：每点能量提高 #1%」，那是**百分比**，而且 `[f2]` 的
 *   0.002 本来就是「每点 0.2%」，`能量上限 × 0.002` 得到的正是分数。
 *   两条的差别就在「伤害**值**」那两个字上。
 */
export const UNMODELLED = new Map([
  ['lc.21030.b2', '「终结技的伤害值提高，提高数值等同于装备者防御力的#2%」'
    + '——加的是**平值伤害点数**，模型里没有这一档。'
    + '按增伤算会把它当成百分比，伤害会放大几百倍（存护角色防御力约 1500，'
    + '#2 满叠影 60%，得 900，被当成 +90000%）。'],
]);

export function blockedReason(entry, opts) {
  if (!entry) return 'no_entry';
  const o = withDefaults(opts);
  const ref = entry.ref ?? {};
  if (entry.kind === 'relicset' && ref.piece > o.pieces) return `piece_short:${ref.piece}`;
  if ([...(entry.scope?.abilityTypes??[]),entry.scope?.abilityKind].some(t=>UNCOMPUTABLE_ABILITY.has(t))) return 'unmodelled_ability';
  if (UNMODELLED.has(entry.id)) return `unmodelled:${entry.id}`;
  return null;
}

/**
 * 取一条目录条目的数值。取不到返回 null —— **null 就是取不到，不是 0**。
 *
 * 返回值与 `buffs.mjs:valueOf` 同一个量纲（分数：0.55 表示 55%），
 * 因为走的本来就是同一个 `resolveParam`。
 */
export function catalogValue(ctx, entry, opts) {
  if (!entry || entry.paramIndex == null) return null;
  if (blockedReason(entry, opts)) return null;
  const o = withDefaults(opts);

  // ① 先把「第 paramIndex 项」按条目类型解析出来。
  //    普通条目到此为止；面板锚定条目这一步拿到的是**百分比系数**，不是数值本身。
  const pct = resolveIndex(ctx, entry, o, entry.paramIndex);
  if (pct == null) return null;

  // ② 面板锚定条目：数值 = 来源角色面板的某一项 × 上面那个系数 + 平值项。
  const p = entry.panel;
  if (!p) return pct;

  const panel = o.panels?.[p.who] ?? null;
  // 用户没填那个人的面板 → **返回 null，不是 0**。
  // 返回 0 的话这条会以「勾了、显示 0、伤害纹丝不动」的样子站在目录里，
  // 而那和「这条增益本来就没有」在界面上分不出来。null 会走到「取不到值」那一路，
  // 界面上写明白「请先填 XX 的面板」。
  if (!panel || panel[p.attr] == null) return null;
  // ★ 「最多计入 #N 点」——基数先被**同一个来源里的另一项**夹住 ★
  //   光锥「今日亦是和平的一日」/「片刻，留在眼底」是
  //   「根据装备者的能量上限，每点能量提高 #1%，最多计入 #2 点」——
  //   数值 = min(能量上限, #2) × #1。少了这个夹子，能量上限高的角色会**静默偏高**，
  //   而那两个上限（160 / 180）不是装饰：库内能量上限最大到 480。
  //   `capParam` 取不到时**不夹**（沿用基数），因为取不到的是上限而不是数值本身。
  let base = panel[p.attr];
  if (p.capParam != null) {
    const cap = resolveIndex(ctx, entry, o, p.capParam);
    if (cap != null) base = Math.min(base, cap);
  }
  const flat = p.flatParam != null ? (resolveIndex(ctx, entry, o, p.flatParam) ?? 0) : 0;
  return base * pct + flat;
}

/**
 * 按条目类型把第 `index` 项参数解析成分数。
 *
 * ★ 从 `catalogValue` 里抽出来的，只有这一个理由 ★
 *   面板锚定条目要取**两项**（系数一项、平值一项），而这两项走的是
 *   **完全同一套**按类型的解析逻辑。抄一份 switch 出来是这里最省事的写法，
 *   也是唯一会让你在「技能等级 / 叠影 / 件数」任何一个开关上加一处、漏一处的地方。
 */
function resolveIndex(ctx, entry, o, index) {
  const ref = entry.ref ?? {};
  switch (entry.kind) {
    case 'skill':
    // ★ 忆灵辅助技与普通技能**取值路径完全相同** ★
    //   差别只有两处，都不在这条路径上：
    //     · 技能本身不在 `ctx.skillsByChar` 里（在 `data.servantSupport`），
    //       由 `resolveParam` 的 `skillById` 兜底接住 —— 所以这里照旧发
    //       `kind: 'skill'`，**不要**另发明细。
    //     · 等级不吃星魂 R3/R5 的 +1/+2（`effectiveSkillLevel` 按 SKILL_TYPE_CN
    //       查表，Servant 查不到就原样返回基准等级）。
    //   漏掉这一支的话走 `default: return null` → 24 条全部取不到值，
    //   界面上是「一条条显示为空」，不报错。
    case 'servantSkill': {
      const explicit = o.skillLevels?.[ref.skillId];
      const level = explicit != null ? explicit
        : effectiveSkillLevel(ctx, ref.charId, ref.skillType,
          baseLevelOf(ref.skillType), eidolonOf(o, ref.charId));
      return resolveParam(ctx, {
        kind: 'skill', charId: ref.charId, skillId: ref.skillId, level, index,
      });
    }
    case 'trace':
      return resolveParam(ctx, { kind: 'trace', charId: ref.charId, pointId: ref.pointId, index });
    case 'eidolon':
      return resolveParam(ctx, {
        kind: 'eidolon', charId: ref.charId, rankId: ref.rankId, index,
      });
    case 'lightcone':
      return resolveParam(ctx, {
        kind: 'lightcone', lcId: ref.lcId, superimpose: o.superimpose, index,
      });
    case 'relicset':
      return resolveParam(ctx, {
        kind: 'relicset', setId: ref.setId, piece: ref.piece, index,
      });
    default:
      return null;
  }
}

/** 仅用于显示：把目录原文的占位符还原成当前等级、叠影对应的数值。 */
export function catalogText(ctx, entry, opts) {
  const o = withDefaults(opts);
  return String(entry.text ?? '').replace(/#(\d+)\[(i|f[1-6])\](%)?/g, (token, index, fmt, percent) => {
    const raw = resolveIndex(ctx, entry, o, Number(index));
    if (!Number.isFinite(raw)) return token;
    const value = percent ? raw * 100 : raw;
    const digits = fmt === 'i' ? 0 : Number(fmt.slice(1));
    return value.toFixed(digits) + (percent ?? '');
  });
}

// ---------------------------------------------------------------------------
// 分组（界面用）
// ---------------------------------------------------------------------------

/** 属性键 → 界面上的属性分组名。顺序即界面里的显示顺序。 */
export const KEY_GROUP = [
  ['伤害倍率', ['multiplierAdd', 'multiplierAddDown', 'multiplierScale', 'multiplierScaleDown', 'multiplierSet']],
  ['增伤', ['dmgBoost', 'elemDmg', 'abilityDmg']],
  ['攻击力', ['atkPct', 'atkFlat']],
  ['暴击', ['critRate', 'critDmg']],
  ['防御', ['defPct', 'defFlat', 'defShred', 'defIgnore']],
  ['生命上限', ['hpPct', 'hpFlat']],
  ['抗性穿透', ['resPen']],
  ['属性抗性', ['elemRes']],
  ['易伤', ['vuln']],
  ['减伤', ['dmgReduction']],
  ['速度', ['speedPct', 'speedFlat']],
  ['击破', ['breakEffect']],
  ['效果命中/抵抗', ['effectHit', 'effectRes']],
  ['欢愉度', ['elation']],
];
const KEY_TO_GROUP = new Map();
for (const [g, keys] of KEY_GROUP) for (const k of keys) KEY_TO_GROUP.set(k, g);

/**
 * 不影响本次伤害的键。
 *
 * ★ 必须标出来，不能让一个「勾了但数字不动」的框冒充生效 ★
 *   v1 不算击破伤害，速度也不进任何乘区（它只影响行动顺序，而 v1 不做排轴）。
 *   界面上这些条目照常可选、照常显示数值，但要标成「仅显示」。
 */
export const DISPLAY_ONLY_KEYS = new Set([
  'speedPct', 'speedFlat', 'breakEffect', 'effectHit', 'effectRes',
  // 「我方全体的全属性抗性提高」（光锥「余生的第一天」）—— 这是**挨打**那一侧的减伤，
  // 我方打出的伤害一点不变。录它是为了让这条子句有归属，不是因为它进公式。
  'elemRes',
]);

/** 我方受到的减伤只影响生存，不影响我方输出。 */
export function isDisplayOnly(entry) {
  return entry.side === 'enemy' && /^(atk|hp|def|speed)(Pct|Flat)$/.test(entry.key) || DISPLAY_ONLY_KEYS.has(entry.key) || (entry.key === 'dmgReduction' && entry.side === 'ally');
}

/** 三个页签。由 side + target 决定，与「作用对象」这一级完全对应。 */
export const TABS = [
  { id: 'ally_single', name: '我方单体', hint: '只作用于一个人（自身 / 指定我方单体）' },
  { id: 'ally_team', name: '我方全体', hint: '我方全体 / 全队' },
  { id: 'enemy', name: '敌方负面', hint: '给敌人挂的减益' },
];

/** 一条条目归哪个页签。判不出的返回 null（不硬塞）。 */
export function tabOf(entry) {
  if (!entry) return null;
  if (entry.side === 'enemy') return 'enemy';
  if (entry.side !== 'ally') return null;
  if (entry.target === 'team') return 'ally_team';
  if (entry.target === 'self' || entry.target === 'single_ally') return 'ally_single';
  return null;
}

/**
 * 分组：页签 → 属性分组 → 条目数组。
 *
 * 归不了页签的条目**单独放在 `unplaced` 里带出去**，不混进任何一个页签 ——
 * 混进去就是「我们替用户猜了一个作用对象」，而这个猜错是静默的。
 */
export function groupCatalog(entries) {
  const out = { tabs: {}, unplaced: [] };
  for (const t of TABS) out.tabs[t.id] = {};
  for (const e of entries ?? []) {
    const tab = tabOf(e);
    if (!tab) { out.unplaced.push(e); continue; }
    const g = KEY_TO_GROUP.get(e.key) ?? '其它';
    (out.tabs[tab][g] ??= []).push(e);
  }
  // 按 KEY_GROUP 的顺序重排，免得界面上属性分组忽上忽下
  const order = KEY_GROUP.map(([g]) => g).concat(['其它']);
  for (const t of TABS) {
    const src = out.tabs[t.id];
    out.tabs[t.id] = Object.fromEntries(
      order.filter((g) => src[g]?.length).map((g) => [g, src[g]]));
  }
  return out;
}

// ---------------------------------------------------------------------------
// 选择 → BuffInstance
// ---------------------------------------------------------------------------

/** 光锥和遗器是**共享**的：它们的「装备者」不是某个固定角色。 */
const SHARED = new Set(['lightcone', 'relicset']);

/**
 * 把勾中的目录条目转成 `aggregate` 认的形状。
 *
 * 产出的对象与 `buffs.mjs:collectBuffs` 的 active 项**同形** ——
 * `aggregate` 原样复用，一行都不用改。
 *
 * ★ 作用对象怎么落地 ★
 *   · `team`            → 谁都吃得到，直接加
 *   · `self`（角色来源） → 只有**当前计算的角色就是来源角色**时才算
 *                          （「布洛妮娅给自己加攻」不能算到希儿头上）
 *   · `self`（光锥/遗器）→ 视作当前计算角色的装备，直接加（见下方 `shared` 注释）
 *   · `enemy`           → 减益挂在被打的敌人身上，直接加
 *
 * ★ 光锥/遗器的「装备者」是一个 v1 没建模的环节 ★
 *   「使装备者的攻击力提高」到底加在谁身上，取决于谁装了它。v1 的口径是：
 *   **勾了就当成当前计算的角色装的**。理由是这类条目几乎只在「算你自己带的光锥」
 *   时才有意义 —— 辅助带的光锥加的是辅助自己的攻击力，本来就不进输出者的公式。
 *   真要做「辅助带某光锥 → 再转成对输出者的增益」需要建装配关系，v1 不做，
 *   所以界面上这类条目要写清楚「装备者 = 当前计算角色」。
 *
 * @returns { active, skipped }  skipped 里每条带 `reason`，**不许静默丢**
 */
export function buffsFromSelections(ctx, entries, pickedIds, opts, ctxVars = {}) {
  const pick = pickedIds instanceof Set ? pickedIds : new Set(pickedIds ?? []);
  const byId = new Map((entries ?? []).map((e) => [e.id, e]));
  const o = withDefaults(opts);
  const charId = ctxVars.characterId ?? null;
  const active = [];
  const skipped = [];

  for (const id of pick) {
    const e = byId.get(id);
    if (!e) { skipped.push({ id, reason: 'not_in_catalog' }); continue; }

    if(e.kind==='lightcone'&&ctxVars.lightconeId===e.ref?.lcId&&ctx.lcById.get(e.ref.lcId)?.path!==ctx.charById.get(charId)?.path){skipped.push({id,reason:'path_mismatch',label:e.label,text:e.text});continue;}
    const blocked = blockedReason(e, opts);
    if (blocked) { skipped.push({ id, reason: blocked, label: e.label, text: e.text }); continue; }

    const value = catalogValue(ctx, e, opts);
    if (value == null) {
      // ★ 面板锚定条目取不到数，**几乎总是「用户还没填那个面板」**，不是数据问题 ★
      //   和普通的「取不到值」混在一个 reason 里，用户会去找数据错误，
      //   而真正要做的事只是往旁边的输入框里填一个数。
      skipped.push({
        id, label: e.label, text: e.text,
        reason: e.panel ? `panel_missing:${e.panel.who ?? '?'}` : 'no_value',
      });
      continue;
    }

    // 「自己」这一档：角色来源的必须**算的就是他自己**才算得上
    const isShared = SHARED.has(e.kind);
    if (e.scope?.excludesOwner && e.ownerId === charId) {
      skipped.push({ id, reason: 'excluded_self', label: e.label, text: e.text, note: '这条增益明确排除来源角色自身' });
      continue;
    }
    if (!isShared && e.target === 'self' && charId != null && e.ownerId !== charId) {
      skipped.push({
        id, reason: 'not_self', label: e.label, text: e.text,
        note: `这条是「${e.owner}」自己的增益，本次算的是别人`,
      });
      continue;
    }

    const perStack = e.scope?.perStack === true;
    active.push({
      id: e.id,
      key: e.key,
      op: 'add',
      value,
      side: e.side,
      target: e.target,
      scope: e.scope ?? {},
      condition: e.condition ?? null,
      owner: e.owner,
      label: e.label,
      provenance: e.provenance ?? 'partial',
      text: e.text,
      // 供 computeHit 的「未计入清单」用
      source: e.ref,
      kind: e.kind,
      shared: isShared,
      stacks: perStack || e.condition?.stacks ? o.stacks : 1,
      displayOnly: isDisplayOnly(e),
    });
  }
  return { active, skipped };
}

/**
 * 勾中的条目涉及**几个不同角色** —— 给「已选来源 N/3」那个角标用。
 *
 * ★ 光锥/遗器不占名额 ★ 它们是共享的，同一把光锥人人可带。
 *   否则「选了 3 个角色 + 一把光锥」会显示成 4/3，把用户吓一跳。
 */
export function sourceCharactersOf(entries, pickedIds) {
  const pick = pickedIds instanceof Set ? pickedIds : new Set(pickedIds ?? []);
  const ids = new Set();
  for (const e of entries ?? []) {
    if (!pick.has(e.id)) continue;
    if (SHARED.has(e.kind)) continue;
    if (e.ownerId != null) ids.add(e.ownerId);
  }
  return ids;
}

/**
 * 把 `collectBuffs` 报出来的「来源级缺口」分成两类：
 *   · 目录里**其实有**这条来源，只是用户没勾 → 不该再报成「我们没录」
 *   · 目录里也没有 → 这才是真正的缺口
 *
 * ★ 为什么必须分 ★
 *   缺口是**来源级**的（`1002.trace.1002102`），目录条目是**子句级**的
 *   （`1002.trace.1002102.b0`）。目录建起来之后，原来那份缺口列表里绝大多数
 *   已经可以勾了 —— 结果页却还在说「我们没有录」，而用户往上看一眼目录就能
 *   看见那一条。**自相矛盾的提示等于没有提示**，这正是 coverageOf 那次踩过的坑。
 *
 * ★ 只说「这条来源目录里有」，不说「这条子句目录里有」★
 *   缺口本身不带子句信息，所以一个来源只要有一条进了目录，整条缺口就归为
 *   「可以勾」。代价是**同一段里没进目录的子句会被一起藏掉** —— 所以界面上
 *   必须同时给出「另有 N 条未识别」的桶计数（`core.buffCatalogStats`），
 *   那句话才是覆盖不到的部分的真正出口。
 *
 * 判据只看 id 前缀，不比对文本：文本在两边可能各自截断，比文本会漏。
 */
export function uncoveredGaps(gaps, entries) {
  const prefixes = new Set();
  for (const e of entries ?? []) {
    const i = String(e.id ?? '').lastIndexOf('.b');
    if (i > 0) prefixes.add(String(e.id).slice(0, i));
  }
  return (gaps ?? []).filter((g) => !prefixes.has(String(g.id)));
}

/** 面板字段的中文名。只给界面用，取值路径一个字都不读它。 */
export const PANEL_FIELD_CN = {
  atk: '攻击力', hp: '生命上限', def: '防御力', speed: '速度',
  critRate: '暴击率', critDmg: '暴击伤害', breakEffect: '击破特攻',
  effectHit: '效果命中', effectRes: '效果抵抗', elation: '欢愉度',
  // 能量上限：**不是** ③ 里那个「遗器词条填出来的局外面板」，
  // 而是角色的固有属性，由数据直接给定。见 `panel.who === '@energy'`。
  energyMax: '能量上限',
};

/**
 * 面板锚定条目的 `who` 在界面上叫什么。
 *
 * `@` 开头的都是**伪归属者**：它们不是某个队友的名字，而是「当前计算角色」身上
 * 某一份数据。目前两个：
 *   `@equipped` 装这把光锥/这套遗器的人 → ③ 里那份**用户填的**面板
 *   `@energy`   同上，但取的是**数据直接给定**的能量上限（不是用户填的）
 * 两者在界面上都显示成「当前计算角色」，也都**不给输入框**。
 */
export function panelWhoCN(who) {
  if (who === '@equipped' || who === '@energy') return '当前计算角色';
  return who;
}

/** 界面上每条要显示的小字：数值 + 单位 + 「仅显示」标记。 */
export function displayValueOf(ctx, entry, opts) {
  const v = catalogValue(ctx, entry, opts);
  if (v == null) {
    const why = blockedReason(entry, opts);
    if (why?.startsWith('rank_locked')) {
      const [, need, have] = why.split(':');
      return { text: `需要 R${need}（当前 R${have}）`, value: null, blocked: true };
    }
    if (why?.startsWith('piece_short')) {
      const [, need] = why.split(':');
      return { text: `需要 ${need} 件套`, value: null, blocked: true };
    }
    // ★ 「算不了」和「凑齐就行」要分得开 ★
    //   值都是「—」，但补救动作完全不同：一个去凑件数，一个**根本没有补救动作**。
    //   所以 `title` 带上长说明（悬停可见），`text` 用短标签。
    if (why?.startsWith('unmodelled')) {
      return {
        text: '算不了',
        title: why === 'unmodelled_ability' ? '此类攻击需要战斗机制判定，单次伤害计算器尚不支持；可在战斗模拟器使用。' : UNMODELLED.get(why.slice('unmodelled:'.length)) ?? '',
        value: null,
        blocked: true,
      };
    }
    // ★ 面板锚定条目：取不到值 ≠ 坏掉了，而是**还缺一个输入** ★
    //   和「需要 4 件套」是同一类状态：有明确的补救动作，说得出要做什么。
    //   所以这里**不置灰**（`blocked: false`）—— 条目照样勾得上，
    //   只是小字写着待填。置灰的话用户会以为「这条不能选」，
    //   而输入框就在同一行上，看起来自相矛盾。
    //   `panelPending` 是给渲染用的标记：要不要画那个输入框。
    if (entry?.panel) {
      const who = panelWhoCN(entry.panel.who);
      const cn = PANEL_FIELD_CN[entry.panel.attr] ?? entry.panel.attr;
      return {
        text: `待填「${who}」的${cn}`, value: null, blocked: false, panelPending: true,
      };
    }
    return { text: '取不到数值', value: null, blocked: true };
  }
  // 平值（「速度提高 12 点」）不加百分号
  const flat = entry.unit === 'flat' || /Flat$/.test(entry.key);
  return {
    text: flat ? `+${v}` : `+${(v * 100).toFixed(1)}%`,
    value: v,
    blocked: false,
    displayOnly: isDisplayOnly(entry),
  };
}

/**
 * 目录里**一行**要显示什么 —— 值、灰度、标签，一次算齐。**纯函数**。
 *
 * ★ 为什么必须抽出来 ★ 这一行的内容原来是在 ui/app.mjs 的 `catRow` 里现算的。
 *   现在多了一个调用点：用户在面板框里打了字之后，那一行要**就地重画**
 *   （见 ui/app.mjs 的 `refreshPanelRows`）—— 它不能把整块目录重渲染一遍，
 *   那会把光标和 `<details>` 的展开态一起冲掉。
 *   而两份代码画同一行，迟早会长出不一样的两行：一份显示「待填面板」、另一份不显示，
 *   两边看起来都「正常工作」。所以判据只有这一份，界面只负责把它拼成 HTML。
 *
 * 三种状态各自的意义：
 *   · `blocked` —— 这条现在**不能选**（件数不够之类），值是「—」
 *   · `pending` —— 面板待填，值是「?」，**但可以勾**（补救动作就是填那一栏）
 *   · 正常      —— 值是 `+12.0%` 这样
 */
export function rowView(ctx, entry, opts) {
  const d = displayValueOf(ctx, entry, opts);
  const pending = d.panelPending === true;
  const tags = [];
  if (entry.scope?.excludesOwner) tags.push({ kind: 'dim', label: '不作用于自身', title: '原文明确排除来源角色自身' });
  if (d.displayOnly) {
    tags.push({
      kind: 'dim',
      title: '这个属性不进本次伤害公式（v1 不算击破伤害，也不做排轴）',
      label: '仅显示',
    });
  }
  if (pending) tags.push({ kind: 'lock', title: d.text, label: '待填面板' });
  // `title` 只有「算不了」那一档带（`displayValueOf` 的 unmodelled 分支）——
  // 悬停能看到为什么算不了，而不是只看到一个「—」。
  if (d.blocked) tags.push({ kind: 'lock', title: d.title ?? '', label: d.text });
  else if (entry.provenance !== 'known') {
    tags.push({ kind: '', title: '自动提取的，数值对过但没有人工核对', label: '未核对' });
  }
  return {
    text: d.blocked ? '—' : (pending ? '?' : d.text),
    value: d.value,
    dim: d.blocked || pending,
    blocked: d.blocked,
    pending,
    tags,
  };
}
