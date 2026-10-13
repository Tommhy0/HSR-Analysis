// 增益/倍率自动提取流水线。
//
//   输入  _data_cache/hsr_core.json
//   输出  annotations/_proposed.jsonl      逐条提案（机器产物，勿手改）
//         _data_cache/extract_golden.json  本次各桶计数，供 verify 做回归基线
//
// ★ 设计要点：先把 desc 归一化成**没有标签的干净文本**，再跑正则。
//   原始 desc 里 `<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>攻击力` 这种结构
//   会让每条正则都要处理四种标签的任意嵌套 —— 那是自找的复杂度。
//   normalize() 之后就是 `#1[i]%攻击力`，正则一眼能读懂。
//
// ★ 提取器**只提案，不决定**。侧别/作用域这类语义判断一律带 confidence，
//   低的进 needsReview 桶等人工过。宁可多提一条让人删，也不要漏一条静默算 0。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');

export const ATTACK_TYPES = ['Normal', 'BPSkill', 'Ultra', 'Talent', 'ElationDamage'];

/**
 * 「这个技能打不打伤害」的正确判据是 `tag`，不是 `type`。
 *   type 只说它挂在哪个键位（普攻/战技/终结技/天赋），纯 buff 大招（贝洛伯格进行曲、
 *   星空祝言）的 type 一样是 Ultra。用 type 筛会把 156 条纯辅助技算进来。
 *   tag 的分布：SingleAttack 155 / AoEAttack 88 / Blast 52 / Bounce 15 —— 共 310 条真伤害技。
 *
 * 有 7 条 tag 非攻击但描述里确实造成伤害（如花火天赋「幕后花手」施放强化普攻造成伤害），
 * 所以最终名单取**并集**：攻击 tag ∪ 描述解析出伤害项。这类会被标 EXTRA 让人复核。
 */
export const ATTACK_TAGS = DAMAGE_TAGS;

// ---------------------------------------------------------------------------
// 归一化
// ---------------------------------------------------------------------------

// 子句分析（归一化 / 切句 / 动词判定）住在 core/clauses.mjs ——
// 运行期的「未收录」探测要用同一套判据，各写一份迟早漂移。
// 注意必须先 import 再 export：`export … from` 只再导出，**不建立本地绑定**，
// 那样本文件里的 normalize/governingVerb 会变成未定义。
import {
  normalize, clausesWithIndex, clauseAt, isDamageClause, governingVerb,
  affectsDamage, hasPlaceholder, buffClauseParts, TOK_G, TOK_ONE,
} from '../core/clauses.mjs';
export {
  normalize, clausesWithIndex, clauseAt, isDamageClause, governingVerb,
  affectsDamage, hasPlaceholder, buffClauseParts,
};
// 攻击 tag 表也从 core 取 —— 运行期界面判「列不列进技能下拉框」用的是同一份。
import { DAMAGE_TAGS } from '../core/ctx.mjs';

// 属性关键词表 + 分桶也搬进 core 了 —— 运行期的增益目录要问同样的问题
// （什么属性键 / 给谁 / 作用于谁），各写一份迟早漂移。
import {
  matchAttr, extractCondition, classifyClause, BUCKET, BUCKET_ORDER, BUCKET_NOTE,
} from '../core/attr.mjs';
export { matchAttr, extractCondition, classifyClause, BUCKET, BUCKET_NOTE };

// ---------------------------------------------------------------------------
// R1 / R2 / R6 / R7  伤害项
// ---------------------------------------------------------------------------

const SCALE_KW = [
  ['攻击力', 'atk'],
  ['生命值上限', 'hp'],
  ['生命上限', 'hp'],
  ['防御力', 'def'],
];
/**
 * 忆灵技的基数归谁 —— 见 `baseOwnerOf`。
 *
 * ★ 为什么非要单独判这一件事 ★ 提取器判 `scaling` 只看「`#N%` 后面紧跟着什么
 *   属性词」，**不看这个基数是谁的**。对普通技能没问题（技能永远是施法者打的）。
 *   忆灵技不是：同一句里「造成等同于**遐蝶**#1%生命上限」吃的是召唤者，
 *   「造成等同于**「长夜」**#1%生命上限」吃的是忆灵自己。
 *   两个都长成 `#1[i]%生命上限`，提取器给的都是 `hp`。
 *   不做这一步，长夜月的忆灵技会拿**长夜月的**生命上限去算，而正确答案是
 *   长夜月生命上限的 50% —— 数字看着完全合理，错得悄无声息。
 */
const CLAUSE_BREAK_RE = /[，。；\n]/g;

/** 占位符所在子句里、它**紧前面**的那段文本（截到最近一个子句分隔符为止）。 */
function prefixBefore(norm, at) {
  const head = norm.slice(0, at);
  let cut = -1;
  for (const m of head.matchAll(CLAUSE_BREAK_RE)) cut = m.index;
  return head.slice(cut + 1);
}

/**
 * 这个占位符吃谁的面板。
 *   'dynamic' —— 本场累计数值（累计治疗/消耗总量这类），根本不是面板项
 *   'owner'   —— 召唤者（子句里点名的那个角色）
 *   'servant' —— 忆灵自己（点名了忆灵，或者**谁都没点名**）
 *
 * 「谁都没点名就算忆灵」是 HSR 的通用语义：忆灵技不写召唤者就吃忆灵自己的面板。
 * 这条默认**也是**最需要复核的一条 —— 写成「没点名就算召唤者」的话，
 * 阿格莱雅那条「造成#1[i]%攻击力」会静默变成她的攻击力。14 条逐条对过原文。
 */
/** 「本场累计」这类非面板基数。判据同源：`baseOwnerOf` 与 servant 段的复核都用它。 */
const DYNAMIC_BASE_RE = /累计治疗数值|消耗总量|已损失生命值|生命值之和/;

function baseOwnerOf(pre, { ownerName, servantName }) {
  if (DYNAMIC_BASE_RE.test(pre)) return 'dynamic';
  const iOwner = ownerName ? pre.lastIndexOf(ownerName) : -1;
  const iServant = servantName ? pre.lastIndexOf(servantName) : -1;
  return iOwner > iServant ? 'owner' : 'servant';
}

const ELEMENT_RE = '(火|冰|雷|风|量子|虚数|物理)';
const ELEMENT_EN = {
  物理: 'Physical', 火: 'Fire', 冰: 'Ice', 雷: 'Thunder',
  风: 'Wind', 量子: 'Quantum', 虚数: 'Imaginary',
};

/** 取窗口里第一个「元素+属性」。返回 {cn,en,at} 或 null。 */
function elementIn(text) {
  const m = new RegExp(`${ELEMENT_RE}属性`).exec(text);
  if (!m) return null;
  return { cn: m[1], en: ELEMENT_EN[m[1]], at: m.index };
}

/**
 * R1 伤害倍率 + R2 欢愉倍率 + R6 多伤害项 + R7 多基数相加。
 *
 * 做法：对每个 `#N[i]%` 占位符，看它**紧后面**是什么。
 *   紧后面是「攻击力/生命上限/防御力」  → 缩放基数项（R1）
 *   紧后面是「X属性…伤害」             → 元素项；若含「欢愉伤害」则缩放基数是欢愉度（R2，无基值）
 * 同一条 desc 里出现 ≥2 个缩放项 → 标 MULTI_TERM 强制人工看（卡芙卡战技就是这种）。
 */
export function extractDamage(norm, servantCtx = null) {
  const terms = [];
  const reasons = new Set();
  const clauses = clausesWithIndex(norm);
  let skippedNonDamage = 0;

  for (const m of norm.matchAll(TOK_G)) {
    const idx = m.index + m[0].length;
    // 忆灵技才需要判基数归谁（普通技能不传 servantCtx，这一栏恒为 null）
    const base = servantCtx ? baseOwnerOf(prefixBefore(norm, m.index), servantCtx) : null;
    // 窗口取到下一个占位符为止，避免跨项串味
    const nextTok = norm.indexOf('#', idx);
    const win = norm.slice(idx, nextTok === -1 ? idx + 60 : Math.min(nextTok, idx + 60));

    // 去掉紧跟的「的」
    const body = win.replace(/^\s*的?\s*/, '');

    // ★ 护盾/治疗里的「X%防御力」和伤害里的长得一样，只能靠**占位符前面的动词**区分：
    //     造成/受到/追加 → 伤害     回复/治疗/抵消/提供 → 不是伤害
    //   动词找不到时（如「最高不超过停云当前攻击力的#4[i]%」）退回整句判断。
    const cl = clauseAt(clauses, m.index);
    // 同一句中的伤害也可能打向不同目标，或在后续回合结算。
    // 保存语义而不是把全部百分比压成一个可相加的数组。
    const sentenceStart = Math.max(norm.lastIndexOf('。', m.index), norm.lastIndexOf('；', m.index), norm.lastIndexOf('\n', m.index)) + 1;
    const sentenceTail = norm.slice(sentenceStart).split(/[。；\n]/)[0];
    const clauseText = cl?.text ?? '';
    const damageScope = {
      repetition: /每次(?:伤害)?对|每次伤害/.test(clauseText) ? extractHits(norm) : null,
      target: /随机.*单体/.test(clauseText) ? 'random' : /相邻/.test(clauseText) ? 'adjacent'
        : /敌方全体|所有.*敌方目标/.test(clauseText)
          || (!/敌方单体|主目标/.test(clauseText) && /敌方全体/.test(sentenceTail)) ? 'all' : 'primary',
      timing: /每回合开始|回合开始时|回合结束时|持续伤害/.test(sentenceTail) ? 'delayed' : 'direct',
      conditional: /反击标记|概率|若|如果|对[^，。]*(?:处于|陷入|持有|拥有)/.test(norm.slice(sentenceStart, m.index)),
      text: clauseText,
    };
    const gov = governingVerb(cl?.text ?? '', m.index - (cl?.start ?? 0));
    const okDamage = gov.dmg === true || (gov.dmg === null && isDamageClause(cl?.text));
    if (!okDamage) { skippedNonDamage++; continue; }

    // ★ 击破伤害 / 超击破伤害是**另一条公式链**（用等级基准值，不吃攻击力倍率），
    //   v1 明确不算。但它长得和普通伤害项极像 —— 阮•梅终结技那句
    //   「造成等同于阮•梅#5[i]%冰属性击破伤害的击破伤害」会走 R1e 分支被当成
    //   一条普通伤害项提出来，而它的 scaling 是 null，于是界面上是一条
    //   「倍率 0.5 但不知道吃什么属性」的幽灵技能。
    //   标出来，交给 abilities.mjs 剔除并明示原因，**不要静默当成普通伤害**。
    const isBreak = /击破伤害/.test(cl?.text ?? '');

    let scale = null;
    for (const [kw, key] of SCALE_KW) {
      if (body.startsWith(kw)) { scale = { kw, key }; break; }
    }

    if (scale) {
      const el = elementIn(body);
      terms.push({
        paramIndex: Number(m[1]),
        scaling: scale.key,
        keyword: scale.kw,
        element: el?.en ?? null,
        elementCn: el?.cn ?? null,
        break: isBreak,
        base,
        rule: 'R1',
        ...damageScope,
      });
      continue;
    }

    // 元素项：`的?火属性…伤害`（欢愉技措辞不同，单独归 R2 —— 不加这条整类丢失）
    const el = elementIn(body);
    if (el) {
      const isElation = /欢愉伤害/.test(body);
      terms.push({
        paramIndex: Number(m[1]),
        scaling: isElation ? 'elation' : null,   // 欢愉度基值库里不存在 → 计算时显式报 unknown
        keyword: isElation ? '欢愉度' : null,
        element: el.en,
        elementCn: el.cn,
        break: isBreak,
        base,
        rule: isElation ? 'R2' : 'R1e',
        ...damageScope,
      });
    }
  }

  // 去重：同一 index 出现多次只留一条（有的 desc 里同一占位符被引用两次）
  const seen = new Set();
  const uniq = [];
  for (const t of terms) {
    const k = `${t.paramIndex}:${t.scaling}:${t.element}:${t.target}:${t.timing}:${t.conditional}:${JSON.stringify(t.repetition)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(t);
  }

  const scaleTerms = uniq.filter((t) => t.scaling && t.scaling !== 'elation');
  if (uniq.length > 1) reasons.add('MULTI_TERM');               // R6：卡芙卡战技那种多段 #1/#2/#3
  const distinctScale = new Set(scaleTerms.map((t) => t.scaling));
  if (distinctScale.size > 1) reasons.add('MULTI_SCALING');     // R7：一个技能吃两种基数（刃天赋）

  return { terms: uniq, reasons: [...reasons], skippedNonDamage };
}

/** 段数：`额外造成#N[i]次伤害` / `造成#N[i]次伤害`。R5 的一部分。 */
export function extractHits(norm) {
  const m = /(?:造成|发动)(?:#(\d+)\[(?:i|f\d+)\]|(\d+))次(?:伤害|攻击)/.exec(norm);
  if (!m) return null;
  return { paramIndex: m[1] ? Number(m[1]) : null, literal: m[2] ? Number(m[2]) : null };
}

// ---------------------------------------------------------------------------
// R3 / R4 / R5  增益子句
// ---------------------------------------------------------------------------

/**
 * R3 增益子句 + R4 侧别 + R5 条件。
 * 切句：先按 。；\n 切，再在句内按 ，切分找带占位符的片段。
 *
 * ★ `ordinal` 是**片段在全文里的位置**，不是「第几个匹配上的」★
 *   提案 id 用 ordinal 拼（`…b<ordinal>`）。老写法是「匹配计数」，后果是
 *   **加一条规则就可能把人工表里的记录静默指到别的子句上** —— 数值照样算得出来，
 *   只是算的是另一句话。本项目真踩过：补了规则之后，花火/吉尔伽美什两条记录的 id
 *   各挪了一位，1306 那条从「每层额外提高」跳到了另一句上。
 *   换成位置之后，**只有文本变了才会挪**，而文本变了是看得见的（verify 会逐条比对 text）。
 */
export function extractBuffClauses(norm, skillMeta = {}) {
  const out = [];
  buffClauseParts(norm).forEach((part, ordinal) => {
    if (!/#\d+\[/.test(part)) return;      // 没数值的不是增益
    const hit = matchAttr(part);
    if (!hit) return;
    out.push({ raw: part.trim(), ordinal, ...hit });
  });
  return out;
}

// ---------------------------------------------------------------------------
// 复核分级
// ---------------------------------------------------------------------------

/** 决定复核优先级。NO_SIDE 必看 —— 那是把增益算反的唯一来源。 */
function reviewReasonOf(rec) {
  if (rec.side === 'mixed' || rec.sideSource === 'none') return 'NO_SIDE';
  if (rec.key == null) return 'NO_ATTR';
  // MULTI_TERM 排在 DURATION_ONLY 前：多基数（「#3%+#4点」）会**静默丢掉一半数值**，
  // 比「把回合数当属性值」更该先看 —— 后者一眼就能看出来，前者看不出来。
  if ((rec.reasons ?? []).includes('MULTI_TERM')) return 'MULTI_TERM';
  if (rec.likelyDuration) return 'DURATION_ONLY';
  if ((rec.reasons ?? []).includes('FLAT_UNIT')) return 'FLAT_UNIT';
  // 主体是靠谓语语义推的（句子里没写谁），可以用但得抽检
  if (rec.sideSource === 'phrase') return 'SIDE_INFERRED';
  return 'OK';
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

export function runExtract(core) {
  const all = core.skills.filter((s) => ATTACK_TYPES.includes(s.type));
  const proposals = [];
  const buckets = {
    skill_total: all.length,
    attack_tag: 0,          // tag 说是攻击技 —— 这才是「应该算得出伤害」的真实分母
    attack_tag_parsed: 0,
    attack_tag_unparsed: 0,
    empty_desc: 0,          // 攻击技里 desc 为空的
    empty_desc_nonattack: 0,// 非攻击技里 desc 为空的（凑齐划分用）
    extra: 0,               // tag 非攻击但描述里确实造成伤害（如花火天赋）
    nonattack_skipped: 0,   // 纯辅助技，不算伤害，不进提案
    buff_clauses: 0,
    review: {},
  };

  for (const sk of all) {
    const isAttackTag = ATTACK_TAGS.has(sk.tag);
    if (isAttackTag) buckets.attack_tag++;

    if (!sk.desc) {
      // 攻击 tag 但没描述 —— 归到「未命中」，因为它本该有倍率
      if (isAttackTag) { buckets.empty_desc++; buckets.attack_tag_unparsed++; }
      else buckets.empty_desc_nonattack++;
      // ★ 两类要分开：攻击技缺描述 = **缺倍率**，要给 multipliers.jsonl 生成待补模板；
      //   治疗/辅助技缺描述 = 这技能本来就没有倍率，只是描述数据缺失，报一句就够了。
      //   混在同一个桶里会让「EMPTY_DESC 桶条数 === multipliers.jsonl 条数」这条断言失真。
      proposals.push({
        id: `${sk.charId}.skill.${sk.id}.EMPTY`,
        kind: 'multiplier',
        characterId: sk.charId, skillId: sk.id, skillType: sk.type, skillTag: sk.tag,
        skillName: sk.name,
        status: 'EMPTY_DESC',
        note: isAttackTag
          ? 'desc 为空，倍率只能人工补录进 multipliers.jsonl'
          : 'desc 为空但 tag 非攻击（治疗/辅助），本来就没有倍率，无需补录',
        reviewReason: isAttackTag ? 'EMPTY_DESC' : 'EMPTY_DESC_NONATTACK',
      });
      continue;
    }

    const norm = normalize(sk.desc);
    const dm = extractDamage(norm);
    const parsed = dm.terms.length > 0;

    // 倍率只对「打伤害的」提案；但**增益子句要扫全部技能** ——
    // 纯辅助技（布洛妮娅大招「使我方全体攻击力提高#1[i]%」）正是增益的主要来源，
    // 按伤害技筛掉它们会让增益覆盖率崩掉。这两件事的筛选条件必须分开。
    if (isAttackTag) {
      if (parsed) buckets.attack_tag_parsed++; else buckets.attack_tag_unparsed++;
    } else if (parsed) {
      buckets.extra++;         // 误报风险最高的一类，标出来让人复核
    } else {
      buckets.nonattack_skipped++;
    }

    if (isAttackTag || parsed) {
      proposals.push({
        id: `${sk.charId}.skill.${sk.id}`,
        kind: 'multiplier',
        characterId: sk.charId, skillId: sk.id, skillType: sk.type, skillTag: sk.tag,
        skillName: sk.name,
        element: dm.terms.find((t) => t.element)?.element ?? null,
        terms: dm.terms.map((t) => ({
          scaling: t.scaling, multiplier: { paramIndex: t.paramIndex },
          break: t.break === true, rule: t.rule,
          target: t.target, timing: t.timing, conditional: t.conditional, repetition: t.repetition, text: t.text,
        })),
        hits: extractHits(norm),
        rules: dm.reasons,
        status: parsed ? 'PROPOSED' : 'UNPARSED',
        text: norm.slice(0, 200),
        reviewReason: parsed
          ? (dm.reasons.length ? dm.reasons.join('+') : (isAttackTag ? 'OK' : 'EXTRA_DAMAGE'))
          : 'UNPARSED',
      });
    }

    // ★ id 用**子句在技能描述里的位置**，不用 proposals.length（全局计数器），
    //   也不用「第几个匹配上的」（clauseIdx，老写法）。
    //   前者的毛病是提取器一改全表错位；后者的毛病更隐蔽 —— **规则一改，匹配计数就变**，
    //   人工表里按 id 关联的记录会悄悄指到别的子句上，数值照样算得出来。
    for (const cl of extractBuffClauses(norm)) {
      buckets.buff_clauses++;
      const rec = {
        id: `${sk.charId}.skill.${sk.id}.b${cl.ordinal}`,
        kind: 'buff',
        characterId: sk.charId, skillId: sk.id, skillType: sk.type,
        skillTag: sk.tag, skillName: sk.name,
        text: cl.raw,
        // unit: 'flat' 表示这个数是平值（「速度提高12点」），不是百分比。下游按键名区分，
        // 这一栏只作复核时的提示。
        effect: { key: cl.key, op: cl.op, side: cl.side, scope: cl.scope, unit: cl.unit ?? null },
        param: { index: cl.paramIndex },
        direction: cl.rawDir,
        sideSource: cl.sideSource,
        condition: cl.condition,
        reasons: cl.reasons,
        provenance: 'partial',
      };
      // ★ 传的是**子句** cl 而不是 rec：reviewReasonOf 读的是 cl.key / cl.side /
      //   cl.likelyDuration，rec 上这几个字段在 effect 里。
      //   也**别把 cl.reasons 清掉** —— 这儿曾经写死 `{...cl, reasons: []}`，
      //   于是 MULTI_TERM 分支对增益永远是死代码。
      rec.reviewReason = reviewReasonOf(cl);
      buckets.review[rec.reviewReason] = (buckets.review[rec.reviewReason] ?? 0) + 1;
      proposals.push(rec);
    }
  }

  // -------------------------------------------------------------------------
  // 忆灵技（core.servantSkills，**另一张表**）
  //
  // 为什么是独立一遍而不是并进上面那个循环：
  //   · 上面的三个划分不变量（attack_tag===310、unparsed===empty_desc、
  //     三项之和===skill_total）是 verify 的回归基线。忆灵技里有一条
  //     「有描述但解析不出倍率」（风堇那条，基数是累计治疗数值），
  //     混进去会把 unparsed===empty_desc 直接打破 —— 而那条不变量是对的，
  //     不该为了塞新数据把它改松。
  //   · 忆灵技能**不提增益提案**：它们的纯辅助技能在 build_data 就没收（见那儿
  //     的注释），而目录的「来源角色」模型里也没有忆灵这一格。
  // 所以：独立的桶、独立的 id 前缀、独立的 proposals，与上面互不干扰。
  // -------------------------------------------------------------------------
  const servantSkills = core.servantSkills ?? [];
  const servantBuckets = {
    total: servantSkills.length,
    parsed: 0, unparsed: 0,
    base_owner: 0, base_servant: 0, base_dynamic: 0,
    scaling: {},          // servantHp / servantAtk / servantBase 各多少条
  };
  for (const sk of servantSkills) {
    const ownerName = (core.characters.find((c) => c.id === sk.charId) ?? {}).name ?? null;
    const norm = normalize(sk.desc);
    const dm = extractDamage(norm, { ownerName, servantName: sk.servant?.name ?? null });
    const parsed = dm.terms.length > 0;
    if (parsed) servantBuckets.parsed++; else servantBuckets.unparsed++;

    // 一条倍率都没提出来，但描述里明摆着有伤害 —— 风堇那条
    // 「造成等同于本场战斗风堇与小伊卡累计治疗数值#1[i]%的风属性伤害」就是这种：
    // 它的基数**不是面板项**（是本场累计治疗），动词判定把整句挡在了倍率流水线外。
    // 这种要单独标出来 —— 否则界面会说「需要人工补录进 multipliers.jsonl」，
    // 而人工也补不了：那个数根本不在任何面板上。
    if (!parsed && DYNAMIC_BASE_RE.test(norm)) {
      servantBuckets.dynamicBase = (servantBuckets.dynamicBase ?? 0) + 1;
    }

    const terms = dm.terms.map((t) => {
      if (t.base) servantBuckets[`base_${t.base}`]++;
      // 基数归忆灵自己时的三种出路 —— 见 core/abilities.mjs 的 listAbilities，
      // 取不到的两种会被显式标成「算不了」，不走伤害公式。
      let scaling = t.scaling;
      if (t.base === 'dynamic') scaling = 'dynamicBase';
      else if (t.base === 'servant') {
        if (t.scaling === 'hp' && sk.servant?.hp) scaling = 'servantHp';
        else if (t.scaling === 'atk') scaling = 'servantAtk';
        else scaling = 'servantBase';
      }
      if (scaling !== t.scaling) {
        servantBuckets.scaling[scaling] = (servantBuckets.scaling[scaling] ?? 0) + 1;
      }
      return {
        scaling, multiplier: { paramIndex: t.paramIndex },
        break: t.break === true, rule: t.rule, base: t.base,
        target: t.target, timing: t.timing, conditional: t.conditional, text: t.text,
      };
    });

    proposals.push({
      id: `${sk.charId}.servant.${sk.id}`,
      kind: 'multiplier',
      characterId: sk.charId, skillId: sk.id, skillType: sk.type, skillTag: sk.tag,
      skillName: sk.name, servantName: sk.servant?.name ?? null,
      element: dm.terms.find((t) => t.element)?.element ?? null,
      terms,
      hits: extractHits(norm),
      rules: dm.reasons,
      status: parsed ? 'PROPOSED' : 'UNPARSED',
      text: norm.slice(0, 200),
      reviewReason: parsed ? (dm.reasons.length ? dm.reasons.join('+') : 'OK')
        : (DYNAMIC_BASE_RE.test(norm) ? 'DYNAMIC_BASE' : 'UNPARSED'),
    });
  }

  return { proposals, buckets, servantBuckets };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main() {
  const corePath = path.join(ROOT, '_data_cache', 'hsr_core.json');
  const core = JSON.parse(fs.readFileSync(corePath, 'utf8'));
  const { proposals, buckets } = runExtract(core);

  const outDir = path.join(ROOT, 'annotations');
  fs.mkdirSync(outDir, { recursive: true });
  const jsonl = proposals.map((p) => JSON.stringify(p)).join('\n') + '\n';
  fs.writeFileSync(path.join(outDir, '_proposed.jsonl'), jsonl, 'utf8');

  const golden = {
    generatedAtNote: '由 extract_buffs.mjs 生成；verify 第 5 节用它做「不倒退」基线',
    totals: { ...buckets, review: undefined },
    review: buckets.review,
    proposed: proposals.length,
  };
  fs.writeFileSync(path.join(ROOT, '_data_cache', 'extract_golden.json'),
    JSON.stringify(golden, null, 2), 'utf8');

  // multipliers.jsonl：给「攻击技但 desc 为空」的技能生成**待补模板**。
  //
  // ★ 只补不改 ★ —— 已有条目一律原样保留。这个文件是人填的，每次跑提取器就把它
  //   冲掉等于让人白干。所以是「缺哪条补哪条」，不是「重新生成」。
  //   已有条目的 skillId 集合；新条目一律 terms: [] + provenance: 'unknown'，
  //   人填完把 provenance 改成 'manual'。
  const mPath = path.join(outDir, 'multipliers.jsonl');
  const needStub = proposals.filter(
    (p) => p.kind === 'multiplier' && p.reviewReason === 'EMPTY_DESC');
  const had = new Set();
  let kept = 0;
  if (fs.existsSync(mPath)) {
    for (const line of fs.readFileSync(mPath, 'utf8').split('\n')) {
      const s = line.trim();
      if (!s) continue;
      try { const r = JSON.parse(s); had.add(String(r.skillId)); kept++; } catch { /* 坏行不阻塞补录 */ }
    }
  }
  const added = [];
  for (const p of needStub) {
    if (had.has(String(p.skillId))) continue;
    added.push({
      id: `${p.characterId}.skill.${p.skillId}`,
      charId: p.characterId, skillId: p.skillId, skillType: p.skillType,
      skillName: p.skillName, skillTag: p.skillTag,
      terms: [], hits: null,
      provenance: 'unknown',
      note: '待补录：desc 为空，提取不出倍率。填 terms/hits 后把 provenance 改成 manual。',
    });
  }
  if (added.length) {
    const body = [...(fs.existsSync(mPath) ? [fs.readFileSync(mPath, 'utf8').replace(/\n+$/, '')] : []),
      ...added.map((a) => JSON.stringify(a))].join('\n') + '\n';
    fs.writeFileSync(mPath, body, 'utf8');
  }
  if (needStub.length || kept) {
    console.log(`\nmultipliers.jsonl: 待补 ${needStub.length} 条，已有 ${kept} 条，本次新增模板 ${added.length} 条`);
  }

  const b = buckets;
  console.log('=== 提取结果 ===');
  console.log(`type 属攻击类的技能     ${b.skill_total}`);
  console.log(`其中 tag 确认为攻击技    ${b.attack_tag}   ← 「应该算得出伤害」的真实分母`);
  console.log(`  解析出倍率            ${b.attack_tag_parsed}`);
  console.log(`  没解析出              ${b.attack_tag_unparsed}（其中 desc 为空 ${b.empty_desc}）`);
  console.log(`tag 非攻击但确有伤害     ${b.extra}   ← 已收录，标 EXTRA_DAMAGE 待复核`);
  console.log(`纯辅助技（不参与）       ${b.nonattack_skipped}`);
  console.log(`\n增益子句提案            ${b.buff_clauses}`);
  console.log('复核桶:');
  for (const [k, v] of Object.entries(b.review).sort((a, b2) => b2[1] - a[1])) {
    console.log(`  ${k.padEnd(15)} ${v}`);
  }
  console.log(`\n提案总条数 ${proposals.length} → annotations/_proposed.jsonl`);

  const miss = proposals.filter((p) => p.kind === 'multiplier' && p.status === 'UNPARSED');
  if (miss.length) {
    console.log(`\n没解析出倍率的 ${miss.length} 条（全部列出 —— 每一条都是「算不出伤害」）:`);
    for (const m of miss) console.log(`  [${m.skillTag ?? 'EMPTY'}] ${m.skillName}: ${(m.text ?? '').slice(0, 78)}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
