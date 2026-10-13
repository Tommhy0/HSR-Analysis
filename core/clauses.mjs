// 「技能描述的子句分析」—— 构建期（提取流水线）和运行期（增益采集）共用的一套判据。
//
// ★ 为什么要单独一个模块 ★
// `#1[i]%防御力` 这个占位符在**护盾**里、在**治疗**里、在**伤害**里长得一模一样：
//   三月七战技「…抵消等同于三月七#1[i]%防御力伤害的护盾」
//   娜塔莎战技「…回复等同于娜塔莎#1[f1]%生命上限的生命值」
//   停云普攻「…造成等同于停云#1[i]%攻击力的雷属性伤害」
// 区别只在**同一个子句里的谓语动词**。这个判据两处都要用：
//   · 提取器：别把护盾/治疗当成伤害倍率提出来
//   · 增益采集：别把「回复#1点能量」报成「有一处增益未收录」
// 两边各写一份的话，词表迟早会漂移，而漂移的表现是**静默算错**。
//
// ★ 归一化顺序 ★
// 原始 desc 里是 `<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>攻击力` 这种结构，
// 先剥标签再跑正则是必要的 —— 否则每条正则都要处理四种标签的任意嵌套，那是自找的复杂度。
import { stripTags } from './ctx.mjs';

/**
 * 剥标签 + 把源数据里的**字面** `\n` 换成真换行。
 *
 * ★ 那个 `\n` 是字面的反斜杠 + n，不是真换行 —— 全库有 145 条 desc 这样，
 *   而**真换行一条都没有**。不换的话，按 `\n` 切子句等于没切，
 *   「…不超过#4%。\n获得【赐福】的目标施放攻击后…」会被当成一个句子。
 */
export function normalize(desc) {
  if (desc == null) return '';
  return stripTags(desc).replace(/\\n/g, '\n');
}

/** 占位符本体。`[i]` 是整数、`[f1]`~`[f6]` 是几位小数，但取数只认 index。 */
export const TOK_G = /#(\d+)\[(?:i|f[1-6])\]%?/g;
export const TOK_ONE = /#(\d+)\[(?:i|f[1-6])\]%?/;

/** 一段文本里有没有占位符 —— 「有没有数值效果」的最粗判据。 */
export function hasPlaceholder(text) {
  TOK_ONE.lastIndex = 0;
  return TOK_ONE.test(String(text ?? ''));
}

/**
 * 按标点切子句并保留位置（start/end 是原文下标，供「动词在占位符前面多远处」用）。
 *
 * 切到**逗号一级**是必要的：虎克天赋「追加1次等同于虎克#1[i]%攻击力的火属性附加伤害，
 * 并额外恢复#2[i]点能量」里那个「恢复」是回能量，不切碎会误伤。
 */
export function clausesWithIndex(text) {
  const out = [];
  const s = String(text ?? '');
  let start = 0;
  const re = /[。；\n，,]/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    out.push({ text: s.slice(start, m.index), start, end: m.index });
    start = m.index + 1;
  }
  out.push({ text: s.slice(start), start, end: s.length });
  return out;
}

/**
 * 增益子句的切分 —— 与 `clausesWithIndex` **同一套切点**，但保留句尾标点。
 *
 * ★ 为什么单独一个函数 ★
 * 提取器的提案 id 用的是「这段文本里的第几个片段」，而下标**必须**只由文本决定、
 * 不能被「哪条规则匹配上了」影响。否则加一条规则、某条子句从不匹配变成匹配，
 * 后面所有片段的下标整体后移 —— 人工表里按 id 关联的记录会**静默指到别的子句上**，
 * 数值照样算得出来，只是算的是另一句话。本项目已经真踩过一次（花火/吉尔伽美什两条）。
 *
 * 保留句尾标点是为了不动已有记录里的 `text` 字段 —— 那个字段是比对基准，
 * 它一动，就没法再拿「提案 text === 人工 text」当回归闸门了。
 *
 * ★ 顿号「、」也要当切点 ★
 *   银狼天赋「攻击力降低#1%、防御力降低#2%、速度降低#3%3种【缺陷】」是**顿号并列**，
 *   不切的话整串是一个子句，于是「速度降低」那条规则（在表里排在「防御力降低」前面）
 *   抢先咬住整句，最近占位符取到 #3 —— 判成了速度，防御力那条静默消失。
 *   中文里顿号就是列举分隔符，跟逗号在这里没有区别。
 */
export function buffClauseParts(text) {
  const s = String(text ?? '');
  const out = [];
  const sentRe = /[。；\n、]/g;
  let start = 0;
  let m;
  while ((m = sentRe.exec(s)) !== null) {
    for (const p of s.slice(start, m.index + 1).split(/[，,]/)) out.push(p);
    start = m.index + 1;
  }
  for (const p of s.slice(start).split(/[，,]/)) out.push(p);
  return out;
}

/** 这个位置落在哪个子句里。 */
export function clauseAt(clauses, pos) {
  for (const c of clauses) if (pos >= c.start && pos <= c.end) return c;
  return null;
}

/** 子句是不是在描述「打出伤害」。护盾/治疗不是伤害，别混进来。 */
export function isDamageClause(clause) {
  const t = clause ?? '';
  if (!/伤害/.test(t)) return false;
  if (/护盾|抵消|回复|治疗|护甲/.test(t)) return false;
  return true;
}

/** 会「打出伤害」的动词。 */
export const DMG_VERBS = ['造成', '受到', '追加', '附加', '发动', '触发', '施放'];

/** 不会打出伤害的动词 —— 回能量、回血、上盾、加数值都在这里。 */
export const NONDMG_VERBS = ['回复', '治疗', '抵消', '提供', '恢复', '提高', '提升',
  '降低', '消耗', '获得', '不超过'];

/**
 * 这个占位符前面的**最近一个动词**是什么。
 *
 * 为什么不能整句判断：刃天赋「…造成等同于刃#2[i]%攻击力+#4[i]%生命上限的风属性伤害
 * **并回复**等同于刃生命上限#3[i]%的生命值」——伤害和治疗挤在同一个子句里，
 * 整句看会被「回复」误杀，于是这条真伤害被静默丢掉。
 *
 * @returns {{at:number, verb:string|null, dmg:boolean|null}} dmg=null 表示前后都没有动词
 */
export function governingVerb(clauseText, posInClause) {
  const head = String(clauseText ?? '').slice(0, posInClause);
  let best = { at: -1, verb: null, dmg: null };
  const scan = (list, dmg) => {
    for (const v of list) {
      const at = head.lastIndexOf(v);
      if (at > best.at) best = { at, verb: v, dmg };
    }
  };
  scan(DMG_VERBS, true);
  scan(NONDMG_VERBS, false);
  return best;
}

/**
 * ★ 这个来源里**有没有会影响伤害的数值**？
 *
 * 用于「未收录」缺口探测。判据比「含数字」严格得多，因为后者会把
 * 「恢复#1[i]点能量」「回复#2[i]点生命值」全报成缺口 ——
 * 界面于是显示「有 5 处未收录，结果偏低」，而实际上那 5 处一点伤害都不影响。
 * **假警告会把真警告淹掉**，那比不报警还糟。
 *
 * 判据：存在一个子句，它含占位符，且
 *   ① 是伤害子句（含「伤害」且不含护盾/治疗词），或
 *   ② 子句里的谓语是增益/减益类动词（提高/提升/降低）且**不是**能量或生命回复。
 *
 * 故意保守：拿不准就返回 true（报缺口），漏报的代价是静默算 0，误报的代价只是多看一眼。
 */
export function affectsDamage(text) {
  const s = normalize(text);
  for (const c of clausesWithIndex(s)) {
    TOK_G.lastIndex = 0;
    if (!TOK_G.test(c.text)) continue;
    TOK_G.lastIndex = 0;
    if (isDamageClause(c.text)) return true;
    // 「恢复#1点能量」「回复#2点生命值」—— 数值对伤害无影响
    if (/能量|生命值|护盾|韧性/.test(c.text)) continue;
    // 增益/减益类：「造成的伤害提高#1%」「防御力降低#2%」
    if (/提高|提升|降低|增加|减少|穿透|无视|暴击|易伤|增伤|减伤/.test(c.text)) return true;
    // 倍率类：「造成等同于…#1%攻击力的…伤害」
    if (/等同于|基于/.test(c.text)) return true;
  }
  return false;
}
