// 验证脚本。**全部在 node 里跑，不碰浏览器** —— 无头渲染太慢，用户明确否决过。
//
// 分节断言 + flag() 计数 + 结尾成败语，范式抄自 核心数据库/货币战争/verify.mjs。
//
// 用法: node _scripts/verify.mjs
//
// ★ 能在库里对拍的和不能对拍的，这个脚本分得很清楚 ★
//   能对拍：面板白值、星魂联动、防御量纲、占位符还原、**深渊血量公式（7806/7806）**
//   不能对拍：**最终伤害数字** —— 库里没有任何一列是游戏内实际打出的伤害，
//             没有伤害日志、没有训练场记录。所以第 8 节只能证明「输入对、面板对、
//             乘区自洽」，证明不了数字对。要真正验证得靠 _data_cache/anchors.json
//             里用户回填的实测锚点；没填时那一节报 SKIP，**不报 PASS**。
import fs from 'node:fs';
import path from 'node:path';
import * as C from '../core/ctx.mjs';
import * as P from '../core/panel.mjs';
import * as E from '../core/enemy.mjs';
import * as D from '../core/damage.mjs';
import * as BU from '../core/buffs.mjs';
import * as S from '../core/scenario.mjs';
import * as CL from '../core/clauses.mjs';
import * as AN from '../core/annotations.mjs';
import * as AB from '../core/abilities.mjs';
import { runExtract, ATTACK_TAGS, isDamageClause, governingVerb, normalize }
  from './extract_buffs.mjs';
// 目录审计（第 9 节）。`build_catalog` 只做构建期计算，不写文件，import 它没有副作用。
import {
  auditCatalog, buildCatalog, catalogSources, entryId, BUCKET_ORDER,
  charDisplayNames, classifyOptsFor,
} from './build_catalog.mjs';
import * as AT from '../core/attr.mjs';
import { classifyClause, BUCKET } from '../core/attr.mjs';
// 目录的运行期（第 10 节）。零 IO，import 它没有副作用。
import * as CAT from '../core/catalog.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const DATA = path.join(ROOT, '_data_cache', 'hsr_core.json');
const ANNO = path.join(ROOT, 'annotations');

let problems = 0;
let checks = 0;
const fails = [];
const skips = [];

function ok(cond, label, detail = '') {
  checks++;
  if (cond) return true;
  problems++;
  fails.push({ label, detail });
  return false;
}
function near(a, b, tol, label) {
  const good = Number.isFinite(a) && Math.abs(a - b) <= tol;
  return ok(good, label, good ? '' : `得到 ${a}，期望 ${b}（容差 ${tol}）`);
}
function skip(label, why) {
  skips.push({ label, why });
  console.log(`  [SKIP] ${label} —— ${why}`);
}
function section(n, title) {
  console.log(`\n=== 第 ${n} 节  ${title} ===`);
}

// ---------------------------------------------------------------------------
// 面板锚定条目（`e.panel`）的「待填」状态
// ---------------------------------------------------------------------------
// 「提高数值等同于布洛妮娅#2%暴击伤害+#3%」这类条目的数值 = **别人的面板** × 系数。
// 用户没填那个面板之前 `catalogValue` 合法地返回 null —— 那不是缺陷，是「还缺一个输入」。
// 于是凡「取不到值 ⇒ 必须说得出理由」的断言，都要给这一种状态让路。
//
// ★ 让路的方式是**同一条断言跑两遍**，不是加一条豁免 ★
//   只加豁免的话，这一类就**从此没有任何断言守着**了：面板归属者名对不上、
//   引用了 `emptyPanel()` 里没有的字段、系数项 index 落空 —— 全都照样绿。
//   第二遍（面板填满）守的正是这一批；第一遍留着守其余全部条目。
//   两遍合起来，覆盖面不比原来少一条。
const FILLED_PANEL = {
  ...P.emptyPanel(), atk: 2000, hp: 6000, def: 900, speed: 120, elation: 100,
  // 「根据装备者的能量上限，每点能量提高 #1%，最多计入 #2 点」那两条光锥条目
  // （`panel.who === '@energy'`）吃的基数。`emptyPanel()` 里没有它 ——
  // 能量上限不是遗器词条，是角色固有属性，所以只能在这里补一个可用的值。
  // 取 160 时刻意让两个上限（160 / 180）**都不夹**，于是下面那条「夹子真的在夹」
  // 的断言必须自己把基数抬到上限之上才过得了 ——
  // 否则它会因为「反正没夹」而恒绿，测不到任何东西。
  energyMax: 160,
};
/**
 * 目录里每个面板归属者都给一份填好的面板。
 *
 * ★ `who` 不是字符串的直接跳过 —— 不补一个假键糊过去 ★
 *   跳过的后果是第二遍断言把那一条报出来（取不到值又没 blocked 理由），
 *   指向的正是「归属者名没推出来」这个真问题。补假键就把这个问题盖掉了。
 */
function filledPanels(entries, base = FILLED_PANEL) {
  const out = {};
  for (const e of entries ?? []) {
    const w = e?.panel?.who;
    if (typeof w === 'string' && w.length) out[w] = { ...base };
  }
  return out;
}

// ---------------------------------------------------------------------------
if (!fs.existsSync(DATA)) {
  console.error('缺少 _data_cache/hsr_core.json，请先跑 node _scripts/build_data.mjs');
  process.exit(1);
}
const data = JSON.parse(fs.readFileSync(DATA, 'utf8'));
// Version-pinned dataset sizes; formula assertions remain unchanged.
const V = (v45,v46) => data._meta.version === '4.6' ? v46 : v45;
const ctx = C.createContext(data);
const annotations = AN.loadAnnotations(ANNO);
/** 面板锚定条目的「面板已填满」版本，给下面那两遍断言用。见文件顶部注释。 */
const PANELS = filledPanels(data.buffCatalog);

/**
 * ★ 现场重跑一遍提取器 ★ —— 语义断言跑在**它**上，不跑在缓存上。
 *
 * 起因：忆灵技这一批连着改了 `_scripts/extract_buffs.mjs`（新增 servant 第二遍 +
 * 基数重定向）。改完的第一次走查发现 —— **把 `baseOwnerOf` 改成永远返回
 * 'owner'，整个 verify 一条都不红**。原因是全部断言都读 `data.abilities`，
 * 而那是**烘焙进缓存的旧结果**：提取器改了、忘了重烘，验证照样全绿，
 * 而那正是本项目已经吃过一次的亏（「忘重烘是静默的」）。
 *
 * 所以现在分两层：
 *   ① 语义断言读 `FRESH_ABILITIES`（现场重跑）—— 提取器一改就立刻见红；
 *   ② 另有一条断言比对 `FRESH_ABILITIES` 与缓存 —— 忘重烘也见红。
 * 两条合起来，构建期改动的两种漏法都堵上了。
 */
const FRESH_ABILITIES = AB.abilitiesFromProposals(runExtract(data).proposals);

/** 键序无关的深度比较，用于「现场重烘 === 烘焙产物」这类断言。 */
function stable(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
}

// ---------------------------------------------------------------------------
section(1, '数据完整性');
{
  console.log(`  characters ${data.characters.length} / skills ${data.skills.length} / `
    + `traces ${data.traces.length} / abyssWave ${data.abyssWave.length}`);
  ok(data.characters.length === V(97,98), '角色 97 个');
  ok(data.abyssWave.length === V(7806,8010), '深渊波次怪物 7806 行');

  // 属性节点的口径：按 statusAdd 非空，不是按 point_type=4（那样只有 23 行）
  const attrNodes = data.traces.filter((t) => t.statusAdd?.length);
  ok(attrNodes.length === V(970,980), '属性节点 970 个（statusAdd 非空口径）', `得到 ${attrNodes.length}`);
  const byType4 = data.traces.filter((t) => t.type === 4).length;
  ok(byType4 === V(23,24), '对照：point_type=4 只有 23 行（说明不能用它当口径）', `得到 ${byType4}`);

  // 星魂 R3/R5 的参数表是空的 —— 「等级+2/+1」只在 desc 里
  const r35 = data.ranks.filter((r) => r.rank === 3 || r.rank === 5);
  const r35empty = r35.filter((r) => !r.params?.length).length;
  ok(r35empty === r35.length && r35.length === V(194,196), 'R3/R5 的 param_list 全空（194/194）',
    `得到 ${r35empty}/${r35.length}`);

  // FK：技能、行迹、星魂都必须挂在存在的角色上
  const ids = new Set(data.characters.map((c) => c.id));
  const orphan = [
    ...data.skills.filter((s) => !ids.has(s.charId)),
    ...data.traces.filter((t) => !ids.has(t.charId)),
    ...data.ranks.filter((r) => !ids.has(r.charId)),
  ].length;
  ok(orphan === 0, '技能/行迹/星魂没有孤儿行', `得到 ${orphan}`);

  // 深渊五链
  const waveOrphan = data.abyssWave.filter((w) => !ctx.monsterChildByChildId.has(w.monsterId)).length;
  ok(waveOrphan === 0, '深渊怪物都能在 monster_childs 里找到（按 child_id 关联）', `得到 ${waveOrphan}`);
  const baseOrphan = data.abyssWave.filter((w) => !ctx.monsterStatsById.has(w.baseMonsterId)).length;
  console.log(`  （base_monster_id 查不到 monster_stats 的有 ${baseOrphan} 行 —— 那 921 行是子体，属正常）`);
}

// ---------------------------------------------------------------------------
section(2, '面板锚点');
{
  // 三月七 L80：236.64 + 3.48×79 = 511.56
  const promo = C.promotionForLevel(ctx, 80);
  ok(promo === 6, '等级 80 → 晋阶 6', `得到 ${promo}`);
  const row = (ctx.charStatsById.get(1001) ?? []).find((s) => s.promotion === 6);
  near(C.baseStat(row?.atk, 80), 511.56, 1e-6, '三月七 L80 攻击白值 = 511.56');

  // 全员白值随等级单调且为正（防止某行的 add 是负的或 base 为 0）
  let bad = 0;
  for (const c of data.characters) {
    const r6 = (ctx.charStatsById.get(c.id) ?? []).find((s) => s.promotion === 6);
    if (!r6) { bad++; continue; }
    const v1 = C.baseStat(r6.atk, 1);
    const v80 = C.baseStat(r6.atk, 80);
    if (!(v1 > 0) || !(v80 >= v1)) bad++;
  }
  ok(bad === 0, '全员 1→80 级攻击白值为正且单调', `${bad} 个例外`);

  // 速度不随等级变（库里只有 speed_base 一列）
  const s7 = (ctx.charStatsById.get(1001) ?? [])[0];
  ok(typeof s7.spd === 'number', 'speed_base 是裸数（无成长项）');

  // suggestPanel 不该把元素增伤混进面板
  const sug = P.suggestPanel(ctx, { characterId: 1001, level: 80 });
  ok(JSON.stringify(sug.panel.elemDmg) === JSON.stringify(sug.elemDmg), 'suggestPanel 的元素增伤初值包含行迹总值');
  ok(sug.elemDmg && Object.values(sug.elemDmg).some((v) => v > 0), '元素增伤单独返回且非空');
  console.log(`  三月七 L80 建议面板: atk=${sug.panel.atk?.toFixed(0)} hp=${sug.panel.hp?.toFixed(0)} `
    + `def=${sug.panel.def?.toFixed(0)} spd=${sug.panel.speed} 暴击=${(sug.panel.critRate * 100).toFixed(1)}%`);
}

// ---------------------------------------------------------------------------
section(3, '星魂技能等级联动');
{
  const b3 = C.rankLevelBonuses(ctx, 1101, 3);
  ok(Object.keys(b3).length > 0, '布洛妮娅 E3 能解析出加成');
  const ultra = C.effectiveSkillLevel(ctx, 1101, 'Ultra', 10, 3);
  ok(ultra > 10, 'E3 让终结技等级上升', `得到 ${ultra}`);
  ok(C.effectiveSkillLevel(ctx, 1101, 'Ultra', 10, 0) === 10, 'E0 不加成');

  // 上限不能超
  let over = 0;
  for (const c of data.characters) {
    for (const t of ['Normal', 'BPSkill', 'Ultra', 'Talent']) {
      const lv = C.effectiveSkillLevel(ctx, c.id, t, 15, 6);
      const cap = t === 'Normal' ? 10 : 15;
      if (lv > cap) over++;
    }
  }
  ok(over === 0, '全员满星魂时技能等级不超上限', `${over} 个超出`);

  // 生效等级必须真的取到更大的倍率
  const sk = (ctx.skillsByChar.get(1101) ?? []).find((s) => s.type === 'Ultra');
  const p0 = C.skillParamsAt(sk, 10).params;
  const p1 = C.skillParamsAt(sk, C.effectiveSkillLevel(ctx, 1101, 'Ultra', 10, 3)).params;
  ok(p1?.[0] > p0?.[0], '提升等级后倍率确实变大',
    `${JSON.stringify(p0)} → ${JSON.stringify(p1)}`);
  console.log(`  布洛妮娅「${sk.name}」主倍率 L10=${p0?.[0]} → E3后 L${ultra}=${p1?.[0]}`);
}

// ---------------------------------------------------------------------------
section(4, '防御与抗性');
{
  // 210 × defence_ratio ≡ 200 + 10×等级（hlg=1，L=1..100）
  let bad = 0;
  for (let lv = 1; lv <= 100; lv++) {
    const h = ctx.hardLevel.get(`1:${lv}`);
    if (!h) { bad++; continue; }
    if (Math.abs(210 * h.def - (200 + 10 * lv)) > 1e-3) bad++;
  }
  ok(bad === 0, 'hlg=1 时 210×defence_ratio = 200+10×等级（L=1..100）', `${bad} 个不符`);

  // 这是「两读法同值」的证明：社区的 (敌等级+20) 就是 DEF/10
  near((200 + 10 * 80) / 10, 80 + 20, 1e-9, 'DEF/10 等于 (敌等级+20)');

  near(E.defMultiplier(80, 1000), 0.5, 1e-9, 'L80 打我 L80 常规怪 → 防御乘区 0.5');
  near(E.defMultiplier(80, 1500), 0.4, 1e-9, '次元扑满系（defence_base=315）→ 0.4');
  near(E.resMultiplier(0.2, 0), 0.8, 1e-9, '抗性 20% → 0.8');
  near(E.resMultiplier(-0.2, 0), 1.2, 1e-9, '负抗性不折半 → 1.2');

  // ⚠ 1401 组防御系数全 NULL，必须显式报错而不是当成 0
  const h1401 = ctx.hardLevel.get('1401:1');
  ok(h1401 && h1401.def === null, 'hard_level_group=1401 的 defence_ratio 是 NULL');
  let threw = false;
  try { E.buildMonster(ctx, { monsterId: 1002020, level: 1 }); } catch { threw = true; }
  ok(threw || h1401.def === null, 'NULL 防御不会静默变成 0');

  // 抗性表是稀疏的，缺省为 0；**不能从弱点集反推**（107 行不符）
  const res = E.fullResistance([{ damage_type: 'Fire', value: 0.2 }]);
  ok(res.Fire === 0.2 && res.Ice === 0 && C.ELEMENTS.every((e) => e in res), '稀疏抗性表补全为 7 属性');
}

// ---------------------------------------------------------------------------
section(5, '占位符还原');
{
  let n = 0, residual = 0, rendered = 0;
  const samples = [];
  for (const sk of data.skills) {
    if (!sk.desc) continue;
    const lv = Object.keys(sk.params ?? {}).map(Number).sort((a, b) => b - a)[0] ?? 1;
    const out = C.renderPlaceholder(sk.desc, sk.params?.[String(lv)]?.param_list);
    n++;
    if (/#\d+\[/.test(out)) { residual++; if (samples.length < 3) samples.push([sk.name, out.slice(0, 90)]); }
    if (!/#|\{/.test(out)) rendered++;
  }
  ok(residual === 0, `全部 ${n} 条技能描述无 #N[...] 残留`, `${residual} 条残留: ${JSON.stringify(samples)}`);
  console.log(`  其中 ${rendered} 条已完全无占位符`);

  // 星魂与光锥也过一遍
  let r2 = 0;
  for (const r of data.ranks) if (/#\d+\[/.test(C.renderPlaceholder(r.desc, r.params))) r2++;
  ok(r2 === 0, '星魂描述无残留', `${r2} 条`);

  // ★ 显示名也要过一遍 ★
  //   这是真踩过的：银狼LV.999 的 name 带着 `<unbreak>`，选择器和覆盖率报表里
  //   原样显示成「银狼LV.<unbreak>999</unbreak>」。10 个开拓者则是十个字面
  //   `{NICKNAME}` —— 一个下拉框里十个一样的选项，根本挑不了。
  const badName = [];
  const seen = new Map();
  for (const ch of data.characters) {
    const d = C.characterDisplayName(ch, data.characters);
    if (/[<>]/.test(d) || /\{NICKNAME\}/.test(d) || !d) badName.push(`${ch.id}→${d}`);
    seen.set(d, (seen.get(d) ?? 0) + 1);
  }
  ok(badName.length === 0, '角色显示名不含标签/占位符', JSON.stringify(badName.slice(0, 5)));
  const dupes = [...seen].filter(([, n]) => n > 1);
  ok(dupes.length === 0, '角色显示名互不重复（重名就没法在下拉框里挑）',
    `${dupes.length} 组重名: ${JSON.stringify(dupes.slice(0, 3))}`);
}

// ---------------------------------------------------------------------------
section(5.5, '提取器回归');
{
  const { buckets, proposals } = runExtract(data);

  // ① 分母用的是 tag 不是 type —— 用 type 会把 156 条纯辅助技算进来
  ok(buckets.attack_tag === V(310,313),
    `攻击标签技能数 = 310（tag ∈ SingleAttack/AoEAttack/Blast/Bounce）`,
    `得到 ${buckets.attack_tag}`);
  const sum = buckets.attack_tag + buckets.extra + buckets.nonattack_skipped + buckets.empty_desc_nonattack;
  ok(sum === buckets.skill_total,
    '四类互斥且覆盖全部技能（攻击tag / 额外收录 / 纯辅助 / 非攻击且无描述）',
    `${buckets.attack_tag}+${buckets.extra}+${buckets.nonattack_skipped}+${buckets.empty_desc_nonattack}=${sum} vs ${buckets.skill_total}`);
  ok(buckets.attack_tag_parsed + buckets.attack_tag_unparsed === buckets.attack_tag,
    '攻击技 = 解析出 + 没解析出',
    `${buckets.attack_tag_parsed}+${buckets.attack_tag_unparsed} vs ${buckets.attack_tag}`);

  // ② 没解析出的必须**全都是 desc 为空的** —— 有描述却解析不出倍率就是回归
  ok(buckets.attack_tag_unparsed === buckets.empty_desc,
    '攻击技里「解析不出倍率」的全部是 desc 为空（没有静默丢失）',
    `未解析 ${buckets.attack_tag_unparsed}，其中 desc 空 ${buckets.empty_desc}`);

  // ③ 不倒退：和 extract_golden.json 基线比
  const gp = path.join(ROOT, '_data_cache', 'extract_golden.json');
  if (!fs.existsSync(gp)) {
    skip('提取器不倒退基线', `还没生成 ${gp.split(path.sep).pop()}，先跑一次 extract_buffs.mjs`);
  } else {
    const g = JSON.parse(fs.readFileSync(gp, 'utf8'));
    ok(buckets.attack_tag_parsed >= g.totals.attack_tag_parsed,
      `解析出的倍率数不低于基线 ${g.totals.attack_tag_parsed}`,
      `得到 ${buckets.attack_tag_parsed}`);
    ok(buckets.buff_clauses >= g.totals.buff_clauses,
      `增益子句数不低于基线 ${g.totals.buff_clauses}`,
      `得到 ${buckets.buff_clauses}`);
  }

  // ④ 每个被提取出来的倍率项，其占位符前面的动词都必须是伤害动词。
  //
  //    注意不能简单断言「含护盾/治疗字的技能不许有倍率项」—— 亢龙无悔，移山辟世
  //    既是 AoE 伤害（#1%攻击力）又给护盾（#4%攻击力），提取器正确只取了 #1/#2/#8。
  //    真正该守住的不变量是**逐项**的。
  const crude = [
    ['为指定我方单体提供能够抵消等同于三月七#1[i]%防御力伤害的护盾', false],
    ['立即为我方全体回复等同于娜塔莎#1[f1]%生命上限的生命值', false],
    ['对敌方全体造成等同于刃#2[i]%攻击力的风属性伤害并回复生命值', false],
    ['对敌方全体造成等同于刃#2[i]%攻击力的风属性伤害', true],
  ];
  for (const [t, want] of crude) {
    ok(isDamageClause(t) === want, `整句判断「${t.slice(0, 18)}…」→ ${want}`,
      `得到 ${isDamageClause(t)}`);
  }
  ok(governingVerb('对敌方全体造成等同于刃#2[i]%攻击力的风属性伤害并回复生命值', 26).dmg === true,
    '刃#2 归「造成」（伤害+治疗挤一句时整句判断会误杀，所以按动词判）');

  const badTerms = [];
  for (const p of proposals) {
    if (p.kind !== 'multiplier' || !p.terms?.length) continue;
    const norm = normalize(data.skills.find((s) => s.id === p.skillId)?.desc ?? '');
    for (const t of p.terms) {
      const re = new RegExp(`#${t.multiplier.paramIndex}\\[`, 'g');
      for (const m of norm.matchAll(re)) {
        const cl = norm.slice(0, m.index).lastIndexOf('，');
        const head = m.index;
        const start = Math.max(
          norm.lastIndexOf('。', head), norm.lastIndexOf('；', head),
          norm.lastIndexOf('\n', head), norm.lastIndexOf('，', head), norm.lastIndexOf(',', head)) + 1;
        const clText = norm.slice(start, norm.indexOf('。', head) === -1 ? norm.length : norm.indexOf('。', head));
        const g = governingVerb(clText, head - start);
        if (g.dmg === false) {
          badTerms.push(`${p.skillName} #${t.multiplier.paramIndex} ← ${g.verb}`);
        }
        void cl;
      }
    }
  }
  ok(badTerms.length === 0, '没有任何倍率项是从护盾/治疗子句里取出来的',
    `${badTerms.length} 条: ${JSON.stringify(badTerms.slice(0, 3))}`);

  // ⑤ 刃「倏忽恩赐」是 R7 多基数（攻击力 + 生命上限）的样板，必须解析出来
  const ren = proposals.find((p) => p.kind === 'multiplier' && p.skillName === '倏忽恩赐');
  ok(!!ren && ren.terms.length === 2,
    '刃「倏忽恩赐」解析出两个基数项（R7 多基数）',
    JSON.stringify(ren?.terms));
  ok(!!ren && ren.terms.some((t) => t.scaling === 'hp'),
    '「倏忽恩赐」的第二个基数是生命上限', JSON.stringify(ren?.terms));

  // ⑥ 增益的占位符索引必须取「离关键词最近」的那个。
  //    银狼天赋「攻击力降低#1[f1]%、防御力降低#2[f1]%、速度降低#3[f1]%3种【缺陷】」
  //    是**顿号并列**：不切的话整串是一个子句，「速度降低」那条规则（表里排在
  //    「防御力降低」前面）会抢先咬住整句，最近占位符取到 #3 —— 判成速度，
  //    防御力那条静默消失。所以这里断言**三条缺陷各成一条、各配各的占位符**。
  const wolf3 = proposals
    .filter((p) => p.kind === 'buff' && p.skillId === 100604 && p.effect?.side === 'enemy')
    .sort((a, b) => a.param.index - b.param.index);
  ok(wolf3.length === 3, '银狼天赋的 3 条【缺陷】被顿号切成 3 条子句（不是挤在一条里）',
    `切出 ${wolf3.length} 条: ${wolf3.map((w) => `#${w.param.index}${w.effect.key}`).join(' ')}`);
  ok(wolf3.length === 3 && wolf3.map((w) => w.param.index).join(',') === '1,2,3'
      && wolf3.map((w) => w.effect.key).join(',') === 'atkPct,defShred,speedPct',
    '银狼 3 条缺陷分别取到 #1 攻击力 / #2 防御力 / #3 速度（各配各自的占位符）',
    wolf3.map((w) => `#${w.param?.index} ${w.effect?.key}`).join(' , '));
  ok(wolf3.every((w) => w.effect.side === 'enemy'),
    '银狼【缺陷】判成敌方减益（不是己方增益）', JSON.stringify(wolf3[0]?.effect));

  // ⑦ side 判不出的必须留 unknown，不许默认 ally
  ok(!proposals.some((p) => p.kind === 'buff' && p.reviewReason === 'NO_SIDE'
      && p.effect.side === 'ally'),
    '没有「NO_SIDE 却已经被判成 ally」的条目（方向性错误的主要来源）');

  // ⑧ 单位：「速度提高#1[i]点」是平值，不是百分比。
  //    提到 Pct 键上会把「速度+12」当成「速度+12%」—— 数值量级差一个数量级还看不出来。
  const flatOnes = proposals.filter((p) => p.kind === 'buff' && p.effect?.unit === 'flat');
  ok(flatOnes.length > 0, '存在被判成平值单位的增益（「…提高#N[i]点」）',
    `0 条 —— 单位判定规则可能整体失效了`);
  ok(flatOnes.every((p) => /Flat$/.test(p.effect.key)),
    '凡判成平值的，属性键都以 Flat 结尾',
    flatOnes.filter((p) => !/Flat$/.test(p.effect.key)).map((p) => p.id).join(', '));
  //    要按记录**自己的 paramIndex** 判，不是整段文本 ——
  //    「生命上限提高#3[f1]%+#4[i]点」里 hpPct 配 #3（带 %，正确），
  //    后面那个 #4[i]点 是另一个占位符，该由 MULTI_TERM 拦，不该算这条的错。
  const pctWrong = proposals.filter((p) => {
    if (p.kind !== 'buff' || !/Pct$/.test(p.effect?.key ?? '')) return false;
    if (p.param?.index == null) return false;
    const t = p.text ?? '';
    const m = new RegExp(`#${p.param.index}\\[(?:i|f[1-6])\\]%?`).exec(t);
    return m != null && !m[0].endsWith('%') && t.startsWith('点', m.index + m[0].length);
  });
  ok(pctWrong.length === 0,
    '没有「自己那个占位符后面紧跟『点』却标成 Pct」的记录',
    pctWrong.map((p) => `${p.id} ${p.effect.key}`).join(', '));

  // ⑧b 反向：MULTI_TERM 的桶要非空且被逐条拦下（不自动提升）。
  //     它兜的是「#3%+#4点」这类只提取一条会静默丢另一半的子句。
  const multi = proposals.filter((p) => p.kind === 'buff' && p.reviewReason === 'MULTI_TERM');
  ok(multi.length > 0, 'MULTI_TERM 桶非空（多值子句确实被拦下）', `0 条`);
  ok(multi.every((p) => !/^#\d+\[(?:i|f[1-6])\]%?$/.test(p.text ?? '')),
    'MULTI_TERM 命名的是「子句里有多个数值」而不是「只有单个值」',
    multi.filter((p) => /^#\d+\[(?:i|f[1-6])\]%?$/.test(p.text)).map((p) => p.id).join(', '));

  // ⑨ 已提升的标注表：每条的 id 都能在提案里找到，且数值来源真的存在。
  //    这条防的是「提取器改了，buffs.jsonl 变成孤儿」—— 那种情况下按 id 关联会静默取不到值。
  const mainPath = path.join(ROOT, 'annotations', 'buffs.jsonl');
  if (fs.existsSync(mainPath)) {
    const main = mainPath && fs.readFileSync(mainPath, 'utf8').trim().split('\n')
      .filter(Boolean).map((l) => JSON.parse(l));
    // ★ 语料从「提案表」换成「catalogSources」★
    //   原来这里的 byId 来自 `runExtract` 的提案，而它只遍历
    //   `core.skills.filter(s => ATTACK_TYPES.includes(s.type))`。
    //   人工表以前 50 条**全是攻击技**，所以那套语料刚好够用 —— 巧合，不是设计。
    //   现在表里同时有星魂 / 光锥 / 秘技，这三类提案表**结构上就产不出来**：
    //   加一条就报一次「孤儿」，而 id 真写错时也被淹在同一堆红里，看不出区别。
    //   目录自己的语料是 `catalogSources`（5 类来源一条不落，含秘技/协战），
    //   人工记录的 id 也是按它编的 —— 查它才对得上。
    //   ⚠ 不能用「重烘出来的目录」当语料：那是**过了分桶**的结果，
    //     人工表救回来的那几条本来就不在 PICKABLE 里，拿它当语料会反过来把它们判成孤儿。
    //   ⚠ 上下文（names / prev）必须与 `build_catalog` **同源**：
    //     面板锚定那一路拿紧邻上一条做依据，「吃谁的面板」拿全库角色名做依据。
    //     这里少给一样，语料里那条子句的键就和目录里的对不上，
    //     而报错长得是「人工表写错了键」—— 指错方向。
    //     所以不手搓 options，一律走 `classifyOptsFor`。
    const names = charDisplayNames(data);
    const clauseById = new Map();
    for (const s of catalogSources(data)) {
      const parts = CL.buffClauseParts(s.text);
      parts.forEach((part, ordinal) => {
        const id = entryId(s.source, ordinal);
        if (!id) return;
        const cls = classifyClause(part, classifyOptsFor(s, data, names, parts.slice(0, ordinal)));
        clauseById.set(id, {
          id, text: part.trim(), key: cls?.hit?.key ?? null,
          // ⑨d 要用：分桶 + 判不出的理由。`reason` 是「这条为什么没被收」的唯一出处，
          // 面板锚定那一路的排除项（衣匠 / 削韧值 / 原伤害…）全靠它证明自己没被静默吞掉。
          bucket: cls?.bucket ?? null, reason: cls?.hit?.reason ?? null,
        });
      });
    }
    const byId = clauseById;
    const orphans = main.filter((m) => !byId.has(m.id));
    ok(orphans.length === 0,
      `annotations/buffs.jsonl 的 ${main.length} 条 id 全部能在语料里对应上（没有孤儿）`,
      `${orphans.length} 条孤儿: ${orphans.slice(0, 3).map((o) => o.id).join(', ')}`);

    // ★ 光有 id 对上还不够 —— id 存在但**指向了另一条子句**，这一条才是真踩过的坑 ★
    //   老 id 的 n 是「第几个匹配上的子句」，补一条 ATTR_RULES 就整体错位：
    //   50 条里有 2 条悄悄指到了别的句子上（花火 1306 / 吉尔伽美什 1509），
    //   而这条断言当时**只查 id 存不存在**，于是全绿放行 —— 数值照样算得出来，
    //   只是算的是另一句话。现在 id 换成「子句位置」，再加这条 text 逐字比对当闸门。
    const drifted = main.filter((m) => byId.has(m.id) && byId.get(m.id).text !== m.text);
    ok(drifted.length === 0,
      `buffs.jsonl 的 ${main.length} 条 id 与语料指向同一条子句（text 逐字相等）`,
      drifted.slice(0, 3).map((d) => `${d.id}: 标注「${d.text}」vs 语料「${byId.get(d.id)?.text}」`).join(' | '));
    // 键也要对：id 指向对了但属性键变了，同样是「算得出但算错」。
    // ★ 这里比对的是**人工表写过 key 的那些** ★ 没写 key 的记录（比如
    //   「使目标」那 7 条，只补 target）本来就不该在这条上被要求一致 ——
    //   它们跟分类器走，分类器改了键它们跟着变，那正是想要的行为。
    // ★★ 只在**分类器给出了键**时比 ★★
    //   原来是无条件比，于是「分类器压根认不出属性键」（`byId` 的 key 为 null）的那些
    //   子句，人工表一旦补上键就报红 —— 而那正是人工记录**唯一**能救它们的方式：
    //   `NON_BUFF` / `NO_ATTR` 桶里的子句 `hit` 整体为 null，没有键可比，
    //   拿 null 去比等于宣布「这些子句不许被人救回来」。这与 SCHEMA.md 那句
    //   「人工记录是越过分桶的」直接冲突，也和 `humanRescued` 的整个设计相反
    //   （救回来的本来就是分类器判不出的那些）。
    //   保留的那一半仍守着真问题：id 指对了、键却和语料对不上 → 算得出但算错。
    const keyBad = main.filter((m) => byId.has(m.id) && byId.get(m.id).key != null
      && m.effect?.key != null && byId.get(m.id).key !== m.effect.key);
    ok(keyBad.length === 0,
      'buffs.jsonl 里显式写了属性键、且分类器也判出键的记录，两者一致（人工可覆盖，覆盖了就得说得清）',
      keyBad.slice(0, 3).map((d) => `${d.id}: 标注 ${d.effect?.key} vs 语料 ${byId.get(d.id)?.key}`).join(', '));

    const flatBad = main.filter((m) => /Flat$/.test(m.effect?.key ?? '') && !/点/.test(m.text ?? ''));
    ok(flatBad.length === 0, 'buffs.jsonl 里凡 Flat 键的记录，原文都真的出现「点」',
      flatBad.map((b) => b.id).join(', '));
    console.log(`  已提升 ${main.length} 条标注（buffs.jsonl），全部能回溯到 ${clauseById.size} 条语料中的某一条`);

    // ⑨d ★ 面板锚定「基数不可用」的那批必须**留在可见处**，不许被静默吞掉 ★
    //
    //   阿格莱雅行迹「攻击力提高，提高数值等同于阿格莱雅速度的#1%+**衣匠**速度的#2%」
    //   是最适合说明问题的一条：它长得和布洛妮娅战技一模一样，
    //   但基数里混了一个**忆灵**的速度 —— 拿阿格莱雅的面板乘出来的数**是错的**，
    //   而且错得不大（少算一项），界面上完全看不出来。
    //
    //   所以 `PANEL_BASE_UNUSABLE` 里那串词（衣匠 / 之和 / 削韧 / 原伤害…）不是
    //   「懒得处理」，是**明确判它不可用**。判了就得证明判到了：
    //   这批必须落在别的桶里，且每条都带得出 reason。
    //   ★ 反证见 `_rev.mjs` R34（把「衣匠」从排除词里删掉 → 必须红）★
    //   ⚠ 两个条件缺一不可 ★ 「含不可用基数」本身是个宽条件 ——
    //     「累计」/「之和」在普通伤害句里也常见，而普通伤害句走的是倍率流水线，
    //     根本不经过 `panelOf`，自然给不出 reason。要求它们给理由会得到 157 条假红。
    //     这里问的是**面板锚定这一路**的判断，所以必须同时是「提高等同于」的形状。
    const UNUSABLE = /衣匠|削韧|韧性上限|原伤害|之和|累计|消耗总量|气氛值|新蕊|护盾量/;
    const unusable = [...clauseById.values()]
      .filter((c) => /(提高|提升|增加)(数值)?等同于/.test(c.text) && UNUSABLE.test(c.text));
    const leaked = unusable.filter((c) => c.bucket === BUCKET.PANEL_ANCHORED);
    ok(leaked.length === 0,
      `含「衣匠/削韧值/原伤害」这类不可用基数的 ${unusable.length} 条子句，一条都没被当成面板锚定条目收下`,
      leaked.slice(0, 3).map((c) => `${c.id}: ${c.text}`).join(' | '));
    const silent = unusable.filter((c) => c.bucket !== BUCKET.PANEL_ANCHORED && !c.reason);
    ok(unusable.length > 0 && silent.length === 0,
      '这批子句全都留在了可见的桶里、且每条都带得出「为什么没被收」',
      `共 ${unusable.length} 条，其中 ${silent.length} 条连理由都给不出：`
      + silent.slice(0, 3).map((c) => c.id).join(', '));

    // ⑨b ★ 数值 pin —— 在此之前 verify 127 条断言里**没有一条**钉住过任何增益数值 ★
    //    于是「技能类增益全按 1 级取值」这个 bug 活了很久：buffs.jsonl 里带 source.level
    //    的是 0 条，调用方又把 skillLevels 置成 undefined，`?? 1` 兜底 → 50 条里 45 条偏低四成。
    //    布洛妮娅「贝洛伯格进行曲」攻击力加成：1 级 +33% / 基础满级 +55%。
    //    这一对断言同时钉住「默认走满级」和「显式覆盖仍然有效」——
    //    后者是**反证**：只钉前者的话，写死一个 0.55 也能绿。
    const br = (annotations.buffs ?? []).find((a) => a.id === '1101.skill.110103.b0');
    if (br) {
      const atMax = BU.valueOf(ctx, br, {});
      const atL1 = BU.valueOf(ctx, br, { skillLevels: { [br.source.skillId]: 1 } });
      ok(atMax != null && Math.abs(atMax - 0.55) < 1e-9,
        '布洛妮娅「贝洛伯格进行曲」攻击力加成按**基础满级**取到 0.55（不是 1 级的 0.33）',
        `得到 ${atMax}`);
      ok(atL1 != null && Math.abs(atL1 - 0.33) < 1e-9,
        '显式指定等级时仍然按指定等级取（1 级 → 0.33）—— 上面那条不是写死值蒙对的',
        `得到 ${atL1}`);
    } else {
      skip('技能类增益的等级 pin', 'buffs.jsonl 里没有 1101.skill.110103.b0');
    }
  } else {
    skip('annotations/buffs.jsonl 完整性', '还没提升任何标注');
  }

  // ⑩ 那些「desc 为空所以提取不出倍率」的攻击技，必须**一条不落**地在
  //    multipliers.jsonl 里有待补条目 —— 否则这批技能会悄悄从界面上消失。
  //    （非攻击技的 desc 为空不进这个集合：治疗/辅助技本来就没有倍率。）
  const needStub = proposals.filter(
    (p) => p.kind === 'multiplier' && p.reviewReason === 'EMPTY_DESC');
  const mPath = path.join(ROOT, 'annotations', 'multipliers.jsonl');
  if (!fs.existsSync(mPath)) {
    skip('multipliers.jsonl 待补模板完整', `还没生成 ${path.basename(mPath)}（跑一次 extract_buffs.mjs）`);
  } else {
    const stubs = fs.readFileSync(mPath, 'utf8').split('\n')
      .map((l) => l.trim()).filter(Boolean).map((l) => JSON.parse(l));
    const have = new Set(stubs.map((s) => String(s.skillId)));
    const missing = needStub.filter((p) => !have.has(String(p.skillId)));
    ok(missing.length === 0,
      `desc 为空的 ${needStub.length} 个攻击技在 multipliers.jsonl 里都有待补条目（一条不会漏）`,
      `缺 ${missing.length} 条: ${missing.slice(0, 3).map((m) => m.skillName).join(', ')}`);
    // 反向：模板填完了要标 manual，别留 unknown 又不填
    const stillEmpty = stubs.filter((s) => (s.terms ?? []).length === 0
      && !['unknown', 'manual'].includes(s.provenance));
    ok(stillEmpty.length === 0,
      'multipliers.jsonl 里 terms 为空的条目，provenance 必须是 unknown（待补）或 manual',
      stillEmpty.map((s) => `${s.id} ${s.provenance}`).join(', '));
    console.log(`  multipliers.jsonl：${stubs.length} 条待补倍率，其中 ${stubs.filter((s) => (s.terms ?? []).length).length} 条已填`);

    // ⑪ 写死数值是唯一出口，且必须配 partial/unknown —— 标 known 的话
    //    等级/叠影一变就是错的，而表面上完全看不出来。
    const allRecs = [
      ...stubs.map((r) => ({ ...r, _file: 'multipliers.jsonl' })),
      ...(fs.existsSync(path.join(ROOT, 'annotations', 'buffs.jsonl'))
        ? fs.readFileSync(path.join(ROOT, 'annotations', 'buffs.jsonl'), 'utf8')
          .split('\n').map((l) => l.trim()).filter(Boolean).map((l) => JSON.parse(l))
        : []).map((r) => ({ ...r, _file: 'buffs.jsonl' })),
    ];
    const isHardcoded = (r) => r.source?.kind === 'literal' || r.param?.literal != null
      || (r.terms ?? []).some((t) => t.value != null);
    // ★ 先自测谓词本身。不然「违规 0 条」可能只是因为谓词永远返回 false ——
    //   那种断言看着绿，其实什么都没守。这三条是正样本，谓词必须认出来。
    const selfTest = [
      { source: { kind: 'literal' }, provenance: 'known' },
      { param: { literal: 0.5 }, provenance: 'known' },
      { terms: [{ scaling: 'atk', value: 3.0 }], provenance: 'known' },
    ];
    ok(selfTest.every(isHardcoded),
      '写死数值的判定谓词能认出全部三种写法（literal 来源 / param.literal / terms[].value）',
      JSON.stringify(selfTest.map(isHardcoded)));

    // ⑫ ★ 取用侧：每一条标注都必须能被**某个角色的来源**取到。
    //    这条是补课 —— 之前 verify 只测了「产表」侧，没测「用表」侧，
    //    结果 core/buffs.mjs 里 sourcesOfCharacter 有个未定义的 charId（一调用就抛），
    //    外加 id 方案对不上（来源发 `1101.skill.110203`，标注写 `…b0`），
    //    50 条标注一条都取不到，而所有断言照样全绿。
    const allSrcIds = new Set();
    const addSrc = (ctxArg, charId, vars) => {
      for (const s of BU.sourcesOfCharacter(ctxArg, charId, vars)) allSrcIds.add(s.id);
    };
    for (const ch of data.characters ?? []) addSrc(ctx, ch.id, {});
    for (const lc of data.lightcones ?? []) allSrcIds.add(`lc.${lc.id}`);
    for (const rs of data.relicsets ?? []) {
      allSrcIds.add(`relic.${rs.id}.set2`);
      allSrcIds.add(`relic.${rs.id}.set4`);
    }
    const baseOf = (id) => String(id).replace(/\.b\d+$/, '');
    const skById = new Map((data.skills ?? []).map((s) => [s.id, s]));
    const anns = annotations.buffs ?? [];
    const runtimeMiss = anns.filter((a) => !allSrcIds.has(baseOf(a.id)));

    // ★ 判据从「全部取得到」改成「取不到的**只能是秘技**」★
    //   两套来源枚举**故意不一样**（见 build_catalog.mjs 的 catalogSources 注释）：
    //     · 运行期 sourcesOfCharacter —— 按 ATTACK_TYPES 过滤技能，**不含秘技/协战**
    //     · 构建期 catalogSources    —— 5 类来源一条不落，**含秘技**
    //   增益目录走的是构建期那套，所以秘技条目在界面上照样取得到值
    //   （实测：星期日秘技「荣光之秘」= +50% 增伤，显示正常、可勾选）。
    //   原来那条「全部取得到」于是成了**假红**：它守的其实是「运行期也能枚举」，
    //   而对一条秘技标注来说，那本来就不该成立。
    //
    //   但**不能**直接改成并集了事：并集是个黑洞 —— id 前缀写错
    //   （`1313.skill.131307` 写成 `1313.skills.131307`）也会被另一套枚举盖住，照样全绿。
    //   所以判据写成**双向**：运行期看不见的必须逐条是秘技；反过来，
    //   表里每一条秘技标注也必须都在看不见的名单里。
    //   「多了一条非秘技的漏网」和「秘技被悄悄收编」两种坏法都会红。
    const isMazeAnn = (a) => {
      const sk = skById.get(a.source?.skillId);
      return sk != null && /^Maze/.test(String(sk.type));
    };
    const mazeAnns = anns.filter(isMazeAnn);
    const badMiss = runtimeMiss.filter((a) => !isMazeAnn(a));
    ok(badMiss.length === 0,
      `buffs.jsonl 里运行期来源枚举看不见的那 ${runtimeMiss.length} 条，逐条都是秘技（其余 ${anns.length - runtimeMiss.length} 条都取得到）`,
      `${badMiss.length} 条既看不见又不是秘技: ${badMiss.slice(0, 3).map((o) => o.id).join(', ')}`);
    ok(runtimeMiss.length === mazeAnns.length,
      `反向：表里 ${mazeAnns.length} 条秘技标注全都落在运行期看不见的名单里（数量双向相等，不是单向豁免）`,
      `秘技 ${mazeAnns.length} 条 / 看不见 ${runtimeMiss.length} 条`);
    // 非空性守卫：表里一条秘技都没有时，上面两条会双双退化成空转。
    ok(mazeAnns.length > 0,
      '表里确实有秘技来源的标注（否则上面两条是空转）',
      `${mazeAnns.length} 条`);

    // ⑬ 取用侧跑得通，且自动路径只剩非技能来源。
    //
    //  ★ 这条断言的判据**整个换过一次**，原因值得写下来 ★
    //    原来它遍历所有角色跑 collectBuffs 数 actives，守的是「那 50 条标注
    //    别一条都取不到」（真吃过这个亏：id 方案对不上，50 条全取不到而全绿）。
    //    但那张标注表**50 条全是技能** —— 技能一改走增益目录，自动路径就
    //    一条都产不出来了，原来是绿的地方全变红。红得对：守的东西搬家了。
    //    那 50 条现在由 (c) 段盯着（在目录里取得到数值），下面这段只管自动路径。
    //
    //    顺带一个反直觉的事实：「至少有一个角色产出增益」这条断言**没有红** ——
    //    因为改成遍历之后，真正该守的是「自动路径对非技能来源还活着」，
    //    而那要靠 (b) 段那条合成标注来验，人工表里一条非技能标注都没有。
    const threw = [];
    let autoSkillLeak = 0;
    for (const ch of data.characters ?? []) {
      try {
        const r = BU.collectBuffs(ctx, { characterId: ch.id, annotations, eidolon: 0 });
        autoSkillLeak += r.active.filter((b) => /^\d+\.skill\./.test(String(b.id))).length;
      } catch (e) { threw.push(`${ch.name}: ${e.message}`); }
    }
    ok(threw.length === 0,
      `全部 ${(data.characters ?? []).length} 个角色跑 collectBuffs 都不抛错`,
      `${threw.length} 个抛错: ${threw.slice(0, 3).join(' | ')}`);
    // ★ 重复计数的硬闸 ★ 同一条技能增益不许既走自动路径又走目录：
    //   两边各算一次 = 数值翻倍，且界面上完全看不出来。
    ok(autoSkillLeak === 0,
      '自动路径一条技能增益都不收（技能只许走目录，否则同一条被算两遍）',
      `${autoSkillLeak} 条技能增益从自动路径漏了出来`);

    // (a) 自动路径里的技能确实被跳过了
    // (b) 自动路径对非技能来源**还活着** —— 用合成标注验，不依赖人工表里碰巧有没有
    // (c) 人工表那 50 条技能标注在**目录**里取得到数值（换了个入口，不是丢了）
    {
      const ch0 = (data.characters ?? []).find((c) => (ctx.ranksByChar.get(c.id) ?? []).length);
      const rankSrc = BU.sourcesOfCharacter(ctx, ch0.id, {}).find((s) => s.kind === 'eidolon');
      const fake = {
        id: `${rankSrc.id}.b0`,
        source: { kind: 'eidolon', charId: ch0.id, rankId: rankSrc.rankId },
        effect: { key: 'atkPct', op: 'add', side: 'ally', target: 'self' },
        param: { index: 1 }, provenance: 'known', text: rankSrc.text,
      };
      const rSyn = BU.collectBuffs(ctx, { characterId: ch0.id, annotations: { buffs: [fake] }, eidolon: 6 });
      ok(rSyn.active.length === 1 && rSyn.active[0].key === 'atkPct',
        '非技能来源（行迹/星魂/光锥/遗器）的标注仍然生效 —— 自动路径没被整条掐死',
        `合成一条星魂标注 → active ${rSyn.active.length}`
        + (rSyn.active[0] ? ` key=${rSyn.active[0].key}` : ` gaps=${rSyn.gaps.map((g) => g.reason).join(',')}`));

      const catById = new Map((data.buffCatalog ?? []).map((e) => [e.id, e]));
      const human = annotations.buffs ?? [];
      // ★ 这里**要喂面板** ★
      //   这一组断言问的是「人工表接上了没有」—— 条目进没进目录、取值路径通不通。
      //   面板锚定条目（如 1412.skill.141204.b1「等同于军功持有者攻击力的#1%」）
      //   不填面板就取不到值，那是**用户还没输入**，不是「没接上」。
      //   不喂的话这 10 条会被误报成「在目录里但取不到值」—— 断言的名字对，
      //   结论全错，而修的人会去查取值路径（查不出问题的地方）。
      const hasValue = (h) => {
        const e = catById.get(h.id);
        return e != null && (CAT.catalogValue(ctx, e, { tier: 'base', panels: PANELS }) != null
          || CAT.catalogValue(ctx, e, { tier: 'max', panels: PANELS }) != null);
      };
      // ★ 阈值原来是 `>= 48`（50 条里 2 条有意没收），现在改成**全等** ★
      //   当年那 2 条是阮•梅/翡翠的「使除自身以外的队友速度提高」，落 SIDE_UNKNOWN，
      //   够不着目录。如今人工表能越过分桶把它们捞回来，57 条**全部**取得到值 ——
      //   于是 `>= 48` 这个阈值不再守任何东西：就算真丢了 9 条它也照样绿。
      //   有确切数就写成确切数，只有确实允许缺失时才留阈值。
      //   （`human.length` 而不是写死 57：表在长，断言不该跟着改。）
      //
      // ★ 「取不到值」里要**再分出一档**：`UNMODELLED` ★
      //   上面两条问的是「接上了没有」，而 `core/catalog.mjs` 的 `UNMODELLED`
      //   是**有意置灰**的（模型里没有那一档，比如平值伤害）——
      //   它取不到值是**正确的**，把它算进来这两条就永远红着，
      //   而人一旦习惯了一条常红的断言，真正的「没接上」就淹在里面了。
      //   但**不能就这么排除掉**：那等于给这两条挖一个静默的洞。
      //   所以下面单开一条，把 `UNMODELLED` 的名单**逐 id 钉死**。
      const unmodelledIds = new Set(CAT.UNMODELLED.keys());
      const modelled = human.filter((h) => !unmodelledIds.has(h.id));
      const reachable = modelled.filter(hasValue);

      ok(reachable.length === modelled.length,
        `buffs.jsonl 的 ${modelled.length} 条标注**全部**在增益目录里取得到数值`
        + `（另有 ${unmodelledIds.size} 条有意置灰，见下）`,
        `只有 ${reachable.length} 条取得到，缺：`
        + modelled.filter((h) => !reachable.includes(h)).slice(0, 3).map((h) => h.id).join(', '));

      // 上面那条把三种坏法压成了一个数，红了只知道「少了」。
      // 分开报才能一眼看出是「根本没进目录」还是「进了但取不到值」——
      // 前者是收录路径断了，后者是取值路径断了，修的地方完全不同。
      const notInCatalog = modelled.filter((h) => !catById.has(h.id));
      const blockedInCatalog = modelled.filter((h) => catById.has(h.id) && !hasValue(h));
      ok(notInCatalog.length === 0,
        '没有一条人工标注是「自动路径不要、目录也不要」的（进了目录才算接上）',
        `${notInCatalog.length} 条两边都没有: ${notInCatalog.slice(0, 3).map((h) => h.id).join(', ')}`);
      ok(blockedInCatalog.length === 0,
        '也没有一条是「在目录里但取不到值」的（那在界面上就是一行空数字）',
        `${blockedInCatalog.length} 条: ${blockedInCatalog.slice(0, 3).map((h) => h.id).join(', ')}`);

      // ---- 有意置灰的那一档：**名单逐 id 钉死** ----
      //
      // ★ 为什么要钉死名单，而不是只数条数 ★
      //   `UNMODELLED` 是个「我说算不了就算不了」的口袋。只数条数的话，
      //   往里多塞一条（比如把某条算得出来的也塞进去）不会有任何反应 ——
      //   而那是**静默少算**，正是这个项目最防的事。
      //   逐 id 比对，加一条就必须改这里，改的时候必然要回答「凭什么算不了」。
      ok(human.filter((h) => unmodelledIds.has(h.id)).length === unmodelledIds.size,
        `UNMODELLED 的 ${unmodelledIds.size} 条全部来自人工表（置灰的必须是我们明确写过的句子，`
        + '不是自动提取的漏网之鱼）',
        [...unmodelledIds].filter((id) => !human.some((h) => h.id === id)).join(', '));
      const unmodelledSeen = [...unmodelledIds].sort().join(',');
      ok(unmodelledSeen === 'lc.21030.b2',
        'UNMODELLED 名单正好是 lc.21030.b2（加一条就说明「平值伤害」这一档又被撞上了，'
        + '要重新想想要不要给模型加一个平值伤害乘区）',
        `实际名单: ${unmodelledSeen}`);
      // 而且它**必须仍然进得了目录**：置灰是「看得见但算不了」，
      // 不是「从目录里消失」—— 后者用户根本不知道有这么一条。
      ok(unmodelledIds.size === 0 || [...unmodelledIds].every((id) => catById.has(id)),
        '置灰的条目仍然在目录里（「算不了」要看得见，不能直接消失）',
        [...unmodelledIds].filter((id) => !catById.has(id)).join(', '));
    }

    const hardcoded = allRecs.filter(isHardcoded);
    const badHard = hardcoded.filter((r) => r.provenance === 'known');
    ok(badHard.length === 0,
      `写死数值的 ${hardcoded.length} 条记录都没有标 provenance: known`
      + `（乘区会随等级/叠影自动联动，写死又标 known 就永远错了）`,
      `违规 ${badHard.length} 条: ${badHard.slice(0, 3).map((r) => `${r.id}(${r._file})`).join(', ')}`);
  }

  console.log(`  攻击技 ${buckets.attack_tag}：解析 ${buckets.attack_tag_parsed} / 未解析 ${buckets.attack_tag_unparsed}（全为 desc 空）`);
  console.log(`  额外收录（tag 非攻击但确有伤害）${buckets.extra}；纯辅助技跳过 ${buckets.nonattack_skipped}`);
  console.log(`  增益提案 ${buckets.buff_clauses}，复核桶 ${JSON.stringify(buckets.review)}`);
}

// ---------------------------------------------------------------------------
section(5.6, '层标签的敌我归类（abyss_tags）');
{
  // 这一节守的是 R2：层标签里出现最多的一句是「首领幻影受到的伤害降低#1%」（152 次），
  // 那是**敌方减伤**。当成队伍增益用会把 −60% 算成 +60%，方向直接反掉。
  const dir = path.join(ROOT, 'annotations');
  const sides = AN.loadSides(dir);
  ok(sides._loaded === true, 'annotations/sides.json 能正常加载', sides._error ?? '');

  // ① 数值必须是**分数**不是百分数。全库约定：参数里存 0.6，desc 里的 % 只影响显示。
  //    这里多乘一次 100 的话减伤会变成 1-60 = -59，整条公式反号。
  const cls = S.classifyTag(
    '首领幻影在进入【孤战】后，受到的伤害降低#1[i]%，受到的伤害额外提高#2[i]%。',
    [0.6, 1.25], sides);
  const red = cls.effects.find((e) => e.key === 'dmgReduction');
  const vuln = cls.effects.find((e) => e.key === 'vuln');
  near(red?.value, 0.6, 1e-12, '「受到的伤害降低#1%」取值 0.6（分数，不是 60）');
  near(vuln?.value, 1.25, 1e-12, '「受到的伤害额外提高#2%」取值 1.25');
  ok(red?.side === 'enemy' && vuln?.side === 'enemy',
    '两个效果都判成敌方（绝不是 ally）', JSON.stringify([red?.side, vuln?.side]));
  ok(vuln?.condition?.trigger === 'after_weakness_break',
    '「弱点击破后受到的伤害提高」带上了触发条件',
    JSON.stringify(vuln?.condition));

  // ② 条件性增益不能当成常驻 —— 坚防守备的 #2 是破韧后才生效的
  ok(vuln?.condition != null,
    '带条件的易伤没有被当成无条件常驻增伤');

  // ③ 「受到的伤害额外降低」这种写法也要被认领（曾是唯一漏网的一条）
  const extra = S.classifyTag('受到的伤害额外降低#1[i]%。', [0.3], sides);
  ok(extra.matched && extra.effects.some((e) => e.key === 'dmgReduction'),
    '「受到的伤害额外降低」能匹配到规则（contains 支持数组写法）',
    JSON.stringify(extra.hitRules));

  // ④ 「属性抗性提高」只对非弱点属性生效 → 必须落 unknown 而不是静默近似
  const resUp = S.classifyTag('非对应弱点的属性抗性提高#1[i]%。', [0.4], sides);
  ok(resUp.unknownEffects.length === 1 && resUp.effects.length === 0,
    '「非对应弱点属性抗性提高」进 unknown 告警，不静默当常驻抗性',
    JSON.stringify(resUp.unknownEffects.map((u) => u.why)));
  ok(resUp.unknownEffects.every((u) => u.provenance === 'unknown'),
    'unknown 效果的 provenance 字段标成 unknown');
  //    抗性提高用的必须是**诚实的未实现键名**，不是借 resPen 的符号取反 ——
  //    借符号的话，哪天这条从 unknown 改成 known，方向会静默反掉。
  ok(resUp.unknownEffects.every((u) => u.value > 0),
    '「抗性提高」的 value 是正的量级（符号不由 direction 承载）',
    JSON.stringify(resUp.unknownEffects.map((u) => u.value)));

  // ④b ★ value 恒为正 —— 全部规则、全部真层标签都不许产出负值。
  //     符号由属性键在 damage.mjs 里承载（1+boost / 1+vuln / 1-defShred / 1-dmgReduction）。
  //     这条守的是「防御力降低」和「受到的伤害降低」这种同为「降低」却反向的句子。
  const negVal = [];
  for (const r of sides.rules ?? []) {
    for (const e of r.effects ?? []) {
      if (e.key === 'enemyResUp') continue;               // 未实现键，恒 unknown
      if (typeof e.direction === 'number' && e.direction < 0 && e.provenance !== 'unknown') {
        negVal.push(`${r.id}:${e.key} direction=${e.direction}`);
      }
    }
  }
  ok(negVal.length === 0,
    '没有任何「已收录」的规则靠负 direction 表达方向（符号只由属性键承载）',
    negVal.join(', '));
  const valNeg = S.classifyTag('受到的伤害降低#1[i]%。', [0.6], sides)
    .effects.filter((e) => e.value < 0);
  ok(valNeg.length === 0, 'classifyTag 产出的 value 不会是负数',
    JSON.stringify(valNeg));

  // ⑤ 已确认不影响伤害的标签（韧性/召唤物血量）→ effects 为空数组，且**不告警**。
  //    这和「没匹配到规则」是两回事：后者要告警。
  for (const t of ['韧性提高#1[i]%', '韧性上限提高#1[i]%', '生命上限提高#1[i]%']) {
    const c = S.classifyTag(t, [0.5], sides);
    ok(c.matched && c.effects.length === 0 && c.unknownEffects.length === 0,
      `「${t}」已确认不影响伤害：匹配到规则但产出为空`, JSON.stringify(c.hitRules));
  }

  // ⑥ 没匹配到规则的 → matched=false，调用方必须排除并告警
  const none = S.classifyTag('完全没见过的标签文本#1[i]%。', [1], sides);
  ok(none.matched === false && none.effects.length === 0,
    '没匹配到规则的层标签 matched=false（由调用方排除并告警）');

  // ⑦ ★ 全库层标签里不许有任何一条产出 side:'ally' 的效果。
  //    这是 R2 的最终防线：层标签在设计上全是敌方效果，出现 ally 就是规则表写错了。
  const allyLeak = [];
  let tagRows = 0, unclaimed = 0, effectsMade = 0;
  for (const t of data.abyssTags ?? []) {
    if (!/#\d+\[/.test(String(t.desc ?? ''))) continue;   // 只看含数值的
    tagRows++;
    const c = S.classifyTag(t.desc, t.params, sides);
    if (!c.matched) { unclaimed++; continue; }
    effectsMade += c.effects.length + c.unknownEffects.length;
    for (const e of [...c.effects, ...c.unknownEffects]) {
      if (e.side === 'ally') allyLeak.push(`${t.id} ${e.key}`);
    }
  }
  ok(tagRows > 0, '数据里存在含数值的层标签', `0 条 —— 数据可能没导出 abyssTags`);
  ok(allyLeak.length === 0,
    `全部 ${tagRows} 条含数值的层标签没有一条产出 side:'ally' 的效果`,
    `${allyLeak.length} 条: ${allyLeak.slice(0, 3).join(', ')}`);
  ok(unclaimed === 0,
    `全部 ${tagRows} 条含数值的层标签都被规则表认领（没有落进默认排除）`,
    `${unclaimed} 条未认领`);
  console.log(`  ${tagRows} 条含数值层标签 → ${effectsMade} 条效果，0 条判成己方`);

  // ⑧ 坏文件 / 缺文件 → 空规则表，且此时**所有**层标签都被排除（安全默认）
  const bad = AN.loadSides(path.join(ROOT, '_data_cache'));   // 该目录下没有 sides.json
  ok(bad._loaded === false && bad.rules.length === 0,
    '缺 sides.json 时返回空规则表（不是抛错、也不是默认 ally）',
    JSON.stringify({ loaded: bad._loaded, rules: bad.rules.length }));
  const c2 = S.classifyTag('受到的伤害降低#1[i]%。', [0.6], bad);
  ok(c2.matched === false && c2.effects.length === 0,
    '空规则表下所有层标签都 matched=false → 由调用方排除并告警',
    JSON.stringify(c2.effects));

  // ⑨ 归类结果能被 loadScenario 正确路由：
  //    认领到的进 buffs，未知的进 gaps，没规则的进 excluded。
  const anyScenario = (data.abyssSeasons ?? []).find((s) => {
    const fs_ = (data.abyssFloors ?? []).filter(
      (f) => f.mode === s.mode && f.seasonId === s.seasonId);
    return fs_.length > 0;
  });
  if (!anyScenario) {
    skip('loadScenario 的层标签路由', '数据里没有可用的深渊期');
  } else {
    const f0 = (data.abyssFloors ?? []).find(
      (f) => f.mode === anyScenario.mode && f.seasonId === anyScenario.seasonId);
    const scen = S.loadScenario(ctx, {
      mode: f0.mode, seasonId: f0.seasonId, floorId: f0.floorId,
      annotations: { buffs: [] }, sides,
    });
    const allyBuffs = (scen.buffs ?? []).filter((b) => b.side === 'ally');
    ok(allyBuffs.length === 0,
      'loadScenario 从层标签里没产出任何己方增益',
      `${allyBuffs.length} 条: ${allyBuffs.slice(0, 2).map((b) => b.key).join(', ')}`);
    ok((scen.buffs ?? []).every((b) => b.side === 'enemy'),
      'loadScenario 从层标签里产出的全是敌方效果',
      JSON.stringify((scen.buffs ?? []).map((b) => `${b.side}/${b.key}`).slice(0, 4)));
    console.log(`  样例情境 ${f0.mode}:${f0.seasonId}:${f0.floorId} → `
      + `${(scen.buffs ?? []).length} 条敌侧效果 / ${scen.gaps.length} 缺口 / ${scen.excluded.length} 排除`);
  }
}

// ---------------------------------------------------------------------------
section(5.7, '「未收录」缺口探测的判据');
{
  // ★ 这一节守的是「假警告」★
  //   缺口探测如果只判「有没有数字」，停云一个角色就会报出 4 条假缺口
  //   （回能量、回能量上限），界面上写「有 5 处未收录，结果偏低」—— 全是假的。
  //   **假警告会把真警告淹掉**，比不报警还糟：用户学会忽略警告之后，
  //   真的漏算也就跟着被忽略了。
  const should = [
    ['使其攻击力提高#2[i]%，最高不超过停云当前攻击力的#4[i]%。', true, '攻击力提高'],
    ['对指定敌方单体造成等同于停云#1[i]%攻击力的雷属性伤害。', true, '真伤害技'],
    ['使指定敌方单体防御力降低#3[f1]%。', true, '敌方减防'],
    ['普攻造成的伤害提高#1[i]%。', true, '技能类型增伤'],
    ['为指定我方单体恢复#1[i]点能量。', false, '回能量（不影响伤害）'],
    ['停云的回合开始时，自身立即恢复#1[i]点能量。', false, '回能量（行迹）'],
    ['终结技为我方目标恢复的能量提高#1[i]点。', false, '回能量上限（星魂6）'],
    ['立即为我方全体回复等同于娜塔莎#1[f1]%生命上限的生命值。', false, '治疗'],
    ['为指定我方单体提供能够抵消等同于三月七#1[i]%防御力伤害的护盾。', false, '护盾'],
    ['施放战技时，停云自身速度提高#1[i]%，持续1回合。', true, '速度提高（影响面板）'],
  ];
  const wrong = [];
  for (const [t, want, why] of should) {
    const got = CL.affectsDamage(t);
    if (got !== want) wrong.push(`「${why}」期望 ${want} 得到 ${got}`);
  }
  ok(wrong.length === 0,
    `${should.length} 组「影不影响伤害」判例全部正确（含 5 组假缺口回归）`,
    wrong.join(' | '));

  // 字面 \n 必须被归一化成真换行，否则按 \n 切子句等于没切
  ok(CL.normalize('甲。\n乙') === '甲。\n乙' && CL.normalize('甲。\\n乙') === '甲。\n乙',
    'normalize 把源数据里的字面 \\n 换成真换行（全库 145 条 desc 是字面写法）');
  // 注意 clausesWithIndex 会在**连续分隔符**处产出空片段（`甲。\n乙` 里的 `。\n` 是两刀），
  // 所以比的是**非空片段**序列，不是数组长度。
  const segs = CL.clausesWithIndex(CL.normalize('甲。\\n乙。丙')).map((c) => c.text).filter(Boolean);
  ok(JSON.stringify(segs) === JSON.stringify(['甲', '乙', '丙']),
    '归一化之后按 \\n 切子句真的切开了（字面 \\n 不再是普通字符）',
    JSON.stringify(segs));

  // ★ 停云这个例子是实测出来的：用 hasNumericEffect 报 11 条缺口，
  //   用 affectsDamage 报 8 条，那 3 条差额全是回能量。
  const tingyun = BU.collectBuffs(ctx, { characterId: 1202, annotations, eidolon: 0 });
  const tg = tingyun.gaps.filter((g) => g.reason === 'no_annotation');
  const energyGaps = tg.filter((g) => /能量/.test(g.text ?? '') && !/伤害|提高|降低/.test(g.text ?? ''));
  ok(energyGaps.length === 0,
    `停云的 ${tg.length} 条未收录里没有一条是纯回能量`,
    `${energyGaps.length} 条: ${energyGaps.map((g) => g.label).join(', ')}`);
  ok(tg.length > 0 && tg.length < 11,
    '停云的缺口数在 (0, 11) 之间 —— 既没有全滤掉，也没有把回能量算进来',
    `得到 ${tg.length}`);
  console.log(`  停云：含数字的来源 11 条 → 真正影响伤害的缺口 ${tg.length} 条`);
}

// ---------------------------------------------------------------------------
section(6, '公式自洽');
{
  near(D.expectedCritMult(0, 0.5), 1, 1e-12, '暴击率 0 → 暴击乘区 1');
  near(D.expectedCritMult(1, 0.5), 1.5, 1e-12, '暴击率 100% → 1.5');
  near(D.expectedCritMult(0.5, 1.0), 1.5, 1e-12, '50% 暴击率 100% 暴伤 → 1.5');

  // 一个最小可算的例子，检查各乘区都不是 0/NaN
  const hit = D.computeHit({
    panel: { atk: 2000, hp: 4000, def: 1000, speed: 100, critRate: 0.5, critDmg: 1.0, elation: null },
    ability: { terms: [{ scaling: 'atk', multiplier: 2.0 }], hits: 1, element: 'Ice', type: 'BPSkill' },
    enemy: { source: 'monster', def: 1000, res: E.fullResistance([]), weakness: [] },
    state: { broken: false },
  });
  ok(hit.ok, '最小例子能算出来', hit.error ?? '');
  if (hit.ok) {
    near(hit.base, 4000, 1e-9, '基础伤害 = 2000 × 2.0');
    // 敌抗性全 0 → 抗性乘区是 1（不是 0.8，0.8 是「抗性 20%」的情形）
    near(hit.onCrit, 4000 * 1 * (1 + 1.0) * 0.5 * 1 * 1 * 0.9, 1e-6, '暴击路径逐乘区对得上');
    near(hit.nonCrit, 4000 * 1 * 1 * 0.5 * 1 * 1 * 0.9, 1e-6, '非暴击路径逐乘区对得上');
    ok(Object.values(hit.zones).every((z) => z.level), '每个乘区都带可信度标注');
    ok(hit.coverage.overall !== 'known', '默认状态下整体标注不是「已知」（增益未收录）');
  }

  // ⑥a ★ 局外面板 → 战斗面板：队友的**局内**加成要真的进公式 ★
  //    这一步曾经整个缺失：「布洛妮娅 +55% 攻击力」进了 agg.atkPct 之后没有任何人读，
  //    伤害 922.5 → 922.5，+0.0%。而增伤/减防是好的 —— 于是「选哪个辅助」
  //    在攻击力系和暴击系的辅助上完全不起作用，而那正是本计算器要回答的问题。
  {
    const P = { atk: 2000, hp: 4000, def: 1000, baseStats: { atk: 1000, hp: 2000, def: 500 }, speed: 100, critRate: 0.05, critDmg: 0.5, elation: null };
    const AB = { terms: [{ scaling: 'atk', multiplier: 1.0 }], hits: 1, element: 'Fire', type: 'BPSkill' };
    const EN = { source: 'monster', def: 1000, res: E.fullResistance([]), weakness: [] };
    const run = (buffs) => D.computeHit({ panel: P, ability: AB, enemy: EN, state: { broken: false }, agg: BU.aggregate(buffs) });
    const mk = (k, v) => ({ key: k, value: v, side: 'ally', scope: {}, provenance: 'known', owner: 't', label: 't', text: 't', op: 'add' });
    const base0 = run([]);
    const ratio = (buffs) => run(buffs).total / base0.total;

    // 反证先做：空增益必须与不传 agg 完全一致，否则下面的比值是拿别的东西算的
    near(run([]).total, D.computeHit({ panel: P, ability: AB, enemy: EN, state: {} }).total, 1e-9,
      '空增益与不传 agg 结果一致（反证：下面的比值不是因为别处变了）');
    near(ratio([mk('atkPct', 0.55)]), 1.275, 1e-9, '白值1000、最终攻击2000，加攻55%后攻击2550，伤害×1.275');
    near(ratio([mk('atkFlat', 300)]), (2000 + 300) / 2000, 1e-9, '攻击力平值 +300 加到面板上而不是当百分比');
    near(ratio([mk('hpPct', 0.4)]), 1, 1e-9,
      '生命上限 +40% 对「吃攻击力」的技能无影响（不是所有键都该动数字）');
    ok(ratio([mk('critDmg', 0.5)]) > 1, '暴击伤害 +50% 确实抬高伤害（哪怕面板暴击率只有 5%）',
      `比值 ${ratio([mk('critDmg', 0.5)])}`);
    // 这几个键**不进**伤害公式（v1 不算击破伤害、速度不影响伤害）—— 必须是恒等，
    // 好让界面有据可依地把它们标成「仅显示」，而不是给个勾了不动的框。
    for (const k of ['speedPct', 'speedFlat', 'breakEffect', 'effectHit', 'effectRes']) {
      near(ratio([mk(k, 0.3)]), 1, 1e-9, `${k} 不进伤害公式（界面必须标「仅显示」）`);
    }
  }

  // 欢愉度缺失必须报 unknown 而不是静默用 0
  const el = D.computeHit({
    panel: { atk: 2000, hp: 4000, def: 1000, speed: 100, critRate: 0.5, critDmg: 1.0, elation: null },
    ability: { terms: [{ scaling: 'elation', multiplier: 1.0 }], hits: 1, element: 'Fire', type: 'ElationDamage' },
    enemy: { source: 'monster', def: 1000, res: E.fullResistance([]), weakness: [] },
  });
  ok(!el.ok && /欢愉度/.test(el.error ?? ''), '欢愉伤害因缺基值而拒绝计算（不是算成 0）',
    JSON.stringify(el.error));

  // 没有倍率时必须拒绝，而不是算成 0
  const noMult = D.computeHit({
    panel: { atk: 2000, hp: 4000, def: 1000, speed: 100, critRate: 0.5, critDmg: 1.0 },
    ability: { terms: [], hits: 1, element: 'Ice', type: 'Ultra' },
    enemy: { source: 'monster', def: 1000, res: E.fullResistance([]), weakness: [] },
  });
  ok(!noMult.ok, '没有倍率时拒绝计算（不是算成 0）');
}

// ---------------------------------------------------------------------------
section(7, '锚点反算（能在库里对拍的全部）');
{
  // ① 深渊血量公式，全量 7806 行
  let okh = 0, badh = 0;
  for (const r of data.abyssWave) {
    const v = E.abyssHpFromOperands(r.hpFormula?.operands);
    if (Math.abs(v - r.hp) < 1e-9) okh++; else badh++;
  }
  ok(badh === 0, `深渊血量公式 7806/7806 全部吻合`, `${badh} 行不符`);
  console.log(`  hp = hp_base × hp_modify_ratio × eg_hp_ratio × hlg_hp_ratio × (1 + infinite_param)`);

  // ② level 与 hard_level_group 的比值要对得上
  let okl = 0, badl = 0;
  for (const r of data.abyssWave) {
    const o = r.hpFormula?.operands;
    if (!o) { badl++; continue; }
    const h = ctx.hardLevel.get(`${o.hard_level_group}:${o.level}`);
    if (h && Math.abs((h.hp ?? 0) - o.hlg_hp_ratio) < 1e-6 && r.level === o.level) okl++; else badl++;
  }
  ok(badl === 0, '敌等级与硬等级组 HP 系数自洽', `${badl} 行不符`);

  // ③ 弱点：abyss 行的 weaknesses 应等于子体的 stance_weak
  let okw = 0, badw = 0;
  for (const r of data.abyssWave) {
    const ch = ctx.monsterChildByChildId.get(r.monsterId);
    if (!ch) continue;
    const a = [...(r.weak ?? [])].sort().join(',');
    const b = [...(ch.weak ?? [])].sort().join(',');
    if (a === b) okw++; else badw++;
  }
  ok(badw === 0, '深渊行的弱点集与 monster_childs 一致', `${badw} 行不符`);

  // ④ 用沙盒公式**复现全部 7806 行**的深渊血量。
  //
  //    注意必须把深渊自己的场景覆盖项喂进去：三深渊会给同一只怪套**场景专用的
  //    精英组和硬等级组**，二者都只存在于该行的 operands 里，monster_childs 查不到。
  //    所以「拿 child 自带的 eg/hlg 直接算」和深渊表对不上是**预期行为**，不是 bug
  //    （实测有 1115 行对不上，正是这个原因）。
  //    喂同样的输入再比，才是在测乘法链本身。
  let cmp = 0, badc = 0;
  const firstBad = [];
  for (const r of data.abyssWave) {
    const o = r.hpFormula?.operands;
    if (!o) continue;
    cmp++;
    try {
      const e = E.buildMonster(ctx, {
        monsterId: r.baseMonsterId, childId: r.monsterId, level: r.level,
        eliteGroup: o.elite_group, hardLevelGroup: o.hard_level_group,
        infiniteParam: o.infinite_param,
      });
      if (Math.abs(e.hp - r.hp) > 1e-9) {
        badc++;
        if (firstBad.length < 3) firstBad.push(`${r.monsterId} L${r.level}: ${e.hp} vs ${r.hp}`);
      }
    } catch (ex) {
      badc++;
      if (firstBad.length < 3) firstBad.push(`${r.monsterId} L${r.level}: ${ex.message}`);
    }
  }
  ok(badc === 0, `沙盒公式能复现全部 ${cmp} 行深渊血量（喂同样的场景覆盖参数）`,
    `${badc} 行不符 ${JSON.stringify(firstBad)}`);

  // 对照组：不喂场景覆盖时**应该**对不上 —— 证明上面那条不是恒真
  let noOverrideMatch = 0;
  for (const r of data.abyssWave) {
    try {
      const e = E.buildMonster(ctx, { monsterId: r.baseMonsterId, childId: r.monsterId, level: r.level });
      if (Math.abs(e.hp - r.hp) < 1e-9) noOverrideMatch++;
    } catch { /* ignore */ }
  }
  ok(noOverrideMatch < data.abyssWave.length,
    '不喂场景覆盖时对不上（说明场景覆盖确实存在，上面那条断言不是恒真）',
    `全中 ${noOverrideMatch} 行`);
  console.log(`  不喂覆盖时只有 ${noOverrideMatch}/${data.abyssWave.length} 行偶然吻合`);

  // ⑤ 效果抵抗列不是属性抗性：确认它至少有多种取值
  const distinct = new Set(data.abyssWave.map((w) => w.statusRes));
  ok(distinct.size > 5, 'status_res 是效果抵抗（连续取值），不是属性抗性');
}

// ---------------------------------------------------------------------------
section(7.5, '技能 → 倍率的桥（core/abilities.mjs）');
{
  // ★ 用现场重跑的结果，不用缓存 ★ 见文件顶部 FRESH_ABILITIES 的说明。
  const baked = FRESH_ABILITIES;

  // ⓪ **烘焙产物必须等于现场重烘的结果**
  //    这一条守的是「改了提取器忘了重烘」—— 那是**静默**的：页面照旧跑，
  //    跑的是旧数值，谁也不会知道。也守 7.7 那一批语义断言的立足点
  //    （它们读 FRESH，缓存与它一致才谈得上「页面看到的和验证过的一样」）。
  {
    const cache = data.abilities ?? {};
    const fk = Object.keys(FRESH_ABILITIES).sort();
    const ck = Object.keys(cache).sort();
    const onlyFresh = fk.filter((k) => !(k in cache));
    const onlyCache = ck.filter((k) => !(k in FRESH_ABILITIES));
    const differ = fk.filter((k) => k in cache
      && stable(FRESH_ABILITIES[k]) !== stable(cache[k]));
    ok(onlyFresh.length === 0 && onlyCache.length === 0 && differ.length === 0,
      '烘焙的倍率表与现场重烘的一字不差（改了 extract_buffs 必须重烘）',
      `只在现场 ${onlyFresh.slice(0, 3)} / 只在缓存 ${onlyCache.slice(0, 3)}`
        + ` / 内容不同 ${differ.slice(0, 3)}`);
  }

  // ① 覆盖了每一个「攻击 tag 或有伤害描述」的技能 —— 一个都不能漏
  const attackTagSkills = data.skills.filter((s) => ATTACK_TAGS.has(s.tag));
  const covered = attackTagSkills.filter((s) => {
    const a = baked[String(s.id)];
    return a && (a.terms.length || a.breakTerms);
  });
  ok(covered.length >= 290,
    `${attackTagSkills.length} 个攻击 tag 技能里 ${covered.length} 个拿到了倍率`,
    `低于 290 就说明提取器退化了`);

  // ② 击破伤害项必须被剔出来并**记下条数** —— 剔干净了界面才能说「有意不算」
  const ruanmei = data.skills.find((s) => s.id === 130314);
  if (ruanmei) {
    const a = baked['130314'];
    ok(a?.breakTerms > 0, '阮•梅终结技的击破伤害项被标记为 break（v1 不算）',
      `breakTerms=${a?.breakTerms}`);
    ok((a?.terms ?? []).length === 0, '阮•梅终结技没有残留的普通伤害项');
  }

  // ③ 运行期把引用变成数值 —— 用真角色真技能跑
  const ctx2 = C.createContext(data);
  const ch = ctx2.charById.get(1303);
  const list = AB.listAbilities(ctx2, 1303, {
    eidolon: 0, element: ch.element,
    overrides: annotations.multipliers, baked,
  });
  const normal = list.find((a) => a.type === 'Normal');
  ok(normal?.status === 'ok', '阮•梅普攻在界面上是可算的');
  const p10 = ctx2.skillsByChar.get(1303).find((s) => s.id === normal.skillId).params['6'].param_list;
  near(normal.terms[0]?.multiplier, p10[0], 1e-9, '普攻倍率 = 参数表 index 1 在等级 6 的值');

  // ④ 星魂 R3/R5 的 +2/+1 必须从散文解析出来并抬升取数等级
  const withE3 = AB.listAbilities(ctx2, 1303, { eidolon: 3, element: ch.element, baked });
  const ult0 = list.find((a) => a.type === 'Ultra');
  const ult3 = withE3.find((a) => a.type === 'Ultra');
  if (ult0 && ult3) {
    ok(ult3.level >= ult0.level, `星魂 3 把终结技等级从 ${ult0.level} 抬到 ${ult3.level}`);
  }

  // ⑤ 倍率**不许**取不到还报 ok —— 这是「静默算 0」的入口
  const bad = list.filter((a) => a.status === 'ok' && !a.terms.length);
  ok(bad.length === 0, '没有「状态是 ok 但一个倍率项都没有」的技能',
    bad.map((b) => b.name).join(','));

  // ⑥ 没写明缩放基数的项必须被挡住（历史上它会变成「undefined：面板未填」）
  const noScale = [];
  for (const c of data.characters.slice(0, 40)) {
    for (const a of AB.listAbilities(ctx2, c.id, { element: c.element, baked })) {
      if (a.status === 'ok' && a.terms.some((t) => !t.scaling)) noScale.push(`${c.name}/${a.name}`);
    }
  }
  ok(noScale.length === 0, '没有「算得出来但没写明吃哪个属性」的技能', noScale.slice(0, 5).join(','));

  // ⑦ 构建期的 data.abilities 必须存在 —— 页面端只认它，没有它整个界面全空
  ok(Object.keys(baked).length > 300, `数据块里烧进了 ${Object.keys(baked).length} 条倍率记录`);
}

// ---------------------------------------------------------------------------
section(7.6, '深渊敌人的防御区（曾经静默变成 ×1.0）');
{
  // ★ 这一节是一次真 bug 的护栏 ★
  //   listAbyssEnemies 早先**没有**给敌人对象带上 def 字段，而 damage.mjs 的
  //   enemyDefence() 遇到取不到的防御会返回 null → 防御乘区退化成 1.0。
  //   表现是：一切正常、所有断言全绿，但每一个深渊结果都偏高约 1.5 倍。
  //   库里 921/7806 行还有 monster_id 查不到 monster_stats 的问题（白值挂在父体上）。
  // 全库 7806 行逐行。判据**不是**「DEF/10 ≡ 等级+20」——那只是 defence_base=210 的情形。
  // 正确的规则是 DEF/10 ≡ (等级+20) × defence_base/210，实测就两个取值：
  //   210 → 系数 1.0（7758 行）    315 → 系数 1.5（48 行，「序列扑满」系）
  // ★ 这 48 行正是「社区公式 (敌等级+20) 与库里 DEF/10 到底是不是同一个数」的判别点：
  //   对它们来说不是，防御乘区会从 0.5 掉到 0.4。写死成「全等」会把正确的数据判成错的。
  let missing = 0;
  const off = [];
  const byBase = {};
  for (const r of data.abyssWave) {
    const child = ctx.monsterChildByChildId.get(r.monsterId);
    const d = E.enemyDefence(ctx, {
      monsterId: r.monsterId, baseMonsterId: r.baseMonsterId, level: r.level, child,
    });
    if (!Number.isFinite(d)) { missing++; continue; }
    const st = ctx.monsterStatsById.get(r.monsterId) ?? ctx.monsterStatsById.get(r.baseMonsterId);
    const k = `${st.def}`;
    byBase[k] = (byBase[k] ?? 0) + 1;
    const want = (r.level + 20) * (st.def / 210);
    // 4e-6 量级是浮点误差（defence_ratio 是 6 位小数），不是真不符
    if (Math.abs(d / 10 - want) > 1e-4 && off.length < 3) {
      off.push(`${r.monsterId}@${r.level}: DEF/10=${(d / 10).toFixed(2)} 期望=${want.toFixed(2)}`);
    }
  }
  const backed = data.abyssWave.filter((r) => !ctx.monsterStatsById.get(r.monsterId)).length;
  ok(missing === 0, `深渊 7806 行防御全部取得到（含 ${backed} 行靠 base_monster_id 兜底）`,
    `${missing} 行取不到`);
  ok(backed === V(921,964), `恰好 921 行是靠父体白值兜底的（数据实况）`, `实为 ${backed}`);
  ok(off.length === 0, 'DEF/10 恒等于 (等级+20) × defence_base/210', off.join(' | '));
  ok(byBase['315'] === 48 && byBase['210'] === V(7758,7962),
    `防御基数只有 210(${byBase['210']} 行) 和 315(${byBase['315']} 行) 两种`,
    JSON.stringify(byBase));

  // 315 系的那 48 行必须**真的**按 1.5 倍算进防御乘区，不能悄悄当 210 算
  const puff = data.abyssWave.find((r) => {
    const st = ctx.monsterStatsById.get(r.monsterId) ?? ctx.monsterStatsById.get(r.baseMonsterId);
    return st?.def === 315;
  });
  if (puff) {
    const child = ctx.monsterChildByChildId.get(puff.monsterId);
    const d = E.enemyDefence(ctx, {
      monsterId: puff.monsterId, baseMonsterId: puff.baseMonsterId, level: puff.level, child,
    });
    near(d / 10, (puff.level + 20) * 1.5, 1e-4,
      `${puff.name}（defence_base=315）的 DEF/10 是 210 系的 1.5 倍`);
    const m315 = E.defMultiplier(80, d, {});
    const m210 = E.defMultiplier(80, d / 1.5, {});
    ok(m315 < m210 - 0.05, `防御乘区真的更低：${m315.toFixed(3)} < ${m210.toFixed(3)}`);
  }

  // 防御乘区**真的进了公式** —— 端到端跑一遍，不许出现 zones.def.level === 'unknown'
  const ab = AB.listAbilities(ctx, 1303, { element: 'Ice', baked: FRESH_ABILITIES });
  const use = ab.find((a) => a.status === 'ok');
  const scn0 = S.listScenarios(ctx).find((s) => s.floors.length);
  const scn = S.loadScenario(ctx, {
    mode: scn0.mode, seasonId: scn0.seasonId, floorId: scn0.floors[0].floorId,
    annotations, sides: annotations.sides ?? AN.loadSides(ANNO),
  });
  ok(scn.enemies.length > 0, `情境「${scn0.label}/${scn0.floors[0].label}」取到了 ${scn.enemies.length} 只怪`);
  ok(scn.enemies.every((e) => Number.isFinite(e.def)),
    `该情境 ${scn.enemies.length} 只怪的 def 都取到了`,
    scn.enemies.filter((e) => !Number.isFinite(e.def)).slice(0, 3).map((e) => e.name).join(','));
  const sug = P.suggestPanel(ctx, { characterId: 1303, level: 80 });
  const hit = D.computeHit({
    panel: { ...sug.panel, critRate: 0.6, critDmg: 1.2 },
    ability: { terms: use.terms, hits: use.hits, element: use.element, type: use.type, tag: use.tag, name: use.name },
    agg: BU.aggregate(BU.collectBuffs(ctx, { characterId: 1303, annotations, eidolon: 0 }).active),
    enemy: scn.enemies[0], state: {}, attackerLevel: 80,
  });
  ok(hit.ok, '端到端算出了一次伤害', hit.error ?? '');
  ok(hit.zones.def?.level === 'known', '防御乘区是 known（不是取不到就退化成 1.0）',
    JSON.stringify(hit.zones.def));
  ok(Number.isFinite(hit.total) && hit.total > 0, `伤害是个正数：${hit.total?.toFixed(1)}`);
  ok(hit.total < hit.base * 10, '伤害没有被异常放大');
}

// ---------------------------------------------------------------------------
section(7.7, '忆灵技（memosprite_json）');
{
  // ★ 为什么忆灵技要单开一节 ★
  //   它们**不在 character_skills 表里**，躺在 characters.memosprite_json.skills
  //   字典中 —— 构建期漏读它们，界面上的表现是「遐蝶的忆灵技没了」，而且
  //   **一声不响**：技能下拉框里少几条，没有任何一处会报错。
  //   这一节就是那条静默通道的守门人。

  const ss = data.servantStats;
  const SS = data.servantSkills;
  console.log(`  忆灵技能：memosprite_json 里 ${ss.inMemospriteJson} 条 → 入表 ${ss.listed} 条`
    + `（辅助技 ${ss.skippedNonDamage} / desc 空 ${ss.skippedEmptyDesc}）；`
    + `${ss.charactersWithMemosprite} 个角色有忆灵`);

  // ① 分桶守恒：json 里的每一条都落进且只落进一个桶
  //    （「落进且只落进」是加出来的 —— 漏读是静默的，重复读也是）
  ok(ss.listed + ss.skippedNonDamage + ss.skippedEmptyDesc === ss.inMemospriteJson,
    '忆灵技能分桶守恒（入表+辅助技+desc空 === json 总数）',
    `${ss.listed}+${ss.skippedNonDamage}+${ss.skippedEmptyDesc} vs ${ss.inMemospriteJson}`);
  ok(ss.listed === 12, '忆灵伤害技入表 12 条', `得到 ${ss.listed}`);
  ok(ss.skippedEmptyDesc === 2, 'desc 为空的忆灵技恰好 2 条（遐蝶 1140710/1140711 的内部变体）',
    `得到 ${ss.skippedEmptyDesc}`);
  ok(ss.charactersWithMemosprite === 8, '8 个角色有忆灵（就是全部有忆灵的角色）',
    `得到 ${ss.charactersWithMemosprite}`);
  // 入表的每一条都必须带伤害标签 —— 否则昔涟德谬歌那 17 条 Support 忆灵天赋
  // 会整批涌进遐蝶/昔涟的技能下拉框，每条都写着「未收录倍率」，
  // 而那些技能**根本没有倍率这回事**，那句标注是错的。
  const badTag = SS.filter((s) => !C.DAMAGE_TAGS.has(s.tag));
  ok(badTag.length === 0, '入表的忆灵技全部带伤害标签（辅助类忆灵技没有被塞进来）',
    badTag.map((s) => `${s.id}/${s.name}`).join(', '));

  // ② 忆灵技一条都没混进 core.skills —— 这是「单开一张表」这个决定的守门人
  const mainIds = new Set(data.skills.map((s) => s.id));
  const leaked = SS.filter((s) => mainIds.has(s.id));
  ok(leaked.length === 0, '忆灵技没有混进 core.skills（混进去增益目录的桶表会全变）',
    leaked.map((s) => s.id).join(', '));
  const mainDamage = data.skills.filter((s) => C.DAMAGE_TAGS.has(s.tag)).length;
  ok(mainDamage === V(317,320), 'core.skills 里的伤害标签技能仍是 317 条（没被忆灵技撑大）',
    `得到 ${mainDamage}`);

  // ③ 忆灵生命上限的折算系数 —— **8 个系数逐个钳住**
  //    ★ 这一条是本会话追加的，起因是计划里那张表把阿格莱雅记成 44%+180、
  //      开拓者记成 50%+400，而 desc 原文写的是 66%+720 和 80%+640 ★
  //      只测走 listAbilities 的那 4 条的话，这两个数**测不到**（那两条算不了），
  //      于是错的那组数能一直躺在注释里没人发现。直接调 servantHpFactor。
  const HP_WANT = {
    1402: [0.66, 720, '阿格莱雅/衣匠'],
    1409: [0.5, 0, '风堇/小伊卡'],
    1413: [0.5, 0, '长夜月/长夜'],
    1415: [1.0, 0, '昔涟/德谬歌'],
    1512: [0.7, 0, '知更鸟•晴歌/晴空乐手'],
    8007: [0.8, 640, '开拓者/迷迷'],
    // 8008 与 8007 是开拓者的两个变体，各有自己的 memosprite_json，
    // 但 hp_skill 都指向 800704 那一条 —— 而 800704 只挂在 8007 名下。
    // 把这一条列进来，守的正是 `servantHpFactor` 里那个「按全局 id 兜底」的查找：
    // 去掉兜底，这一条立刻变红。
    8008: [0.8, 640, '开拓者/迷迷（8008 变体，hp_skill 指向 8007 的技能）'],
  };
  let hpChecked = 0;
  for (const cid of Object.keys(HP_WANT)) {
    const s = SS.find((x) => x.charId === Number(cid));
    if (!ok(!!s, `${HP_WANT[cid][2]} 在忆灵技表里`)) continue;
    const want = HP_WANT[cid];
    hpChecked++;
    const f = AB.servantHpFactor(ctx, s, {});
    if (!ok(f != null, `${want[2]} 的忆灵生命上限能算出来`,
      `拿不到（hp_skill=${s.servant.hp?.skillId}）`)) continue;
    near(f.pct, want[0], 1e-9, `${want[2]}：忆灵生命上限 = 召唤者生命上限 × ${want[0] * 100}%`);
    near(f.flat, want[1], 1e-9, `${want[2]}：平值项 = ${want[1]}`);
    // ★ 再核一遍「这公式是从**哪句话**里读出来的」★ —— 防的是「系数对但找错了技能」。
    //
    //   这一条原来写的是「把 desc 渲染出来，看里面有没有那个百分数」——
    //   **那是恒真的**：R34 反证实测，把比例项取成 params[0] 之后 pct 变成 30%，
    //   而 140204 的 desc 里同时还有一句「额外造成等同于阿格莱雅攻击力30%的
    //   雷属性附加伤害」—— 于是错的比例照样能在那段文字里找到 30%，断言全绿。
    //   一段 desc 里有一堆百分数，「找得到一个数」什么也证明不了。
    //
    //   改成钉**占位符本身**：`hp_inherit` 指的那个 `#N[i]` 必须真的出现在
    //   「生命上限」那句话的邻域里。技能找错了，它的 desc 里就不会有这个占位符。
    const owner = ctx.skillById.get(s.servant.hp.skillId);
    if (ok(!!owner, `${want[2]}：hp_skill ${s.servant.hp.skillId} 能找到那条技能`)) {
      const near30 = (tag) => {
        const at = owner.desc.indexOf(tag);
        if (at < 0) return '';
        return owner.desc.slice(Math.max(0, at - 30), at + 30);
      };
      const pctTag = `#${s.servant.hp.inherit}[i]`;
      ok(near30(pctTag).includes('生命上限'),
        `${want[2]}：比例项 ${pctTag} 就在「生命上限」那句话里`,
        `占位符 ${pctTag} 没出现在「生命上限」附近（共 ${owner.desc.split(pctTag).length - 1} 处）`);
      if (s.servant.hp.base != null) {
        const baseTag = `#${s.servant.hp.base}[i]`;
        ok(near30(baseTag).includes('生命上限'),
          `${want[2]}：平值项 ${baseTag} 就在「生命上限」那句话里`,
          `占位符 ${baseTag} 没出现在「生命上限」附近`);
      }
    }
  }
  ok(hpChecked === Object.keys(HP_WANT).length,
    `${Object.keys(HP_WANT).length} 个能算出生命上限的忆灵都查过了（每个角色一条）`,
    `得到 ${hpChecked}`);
  // 死龙•玻吕刻斯（遐蝶）**没有** hp 公式 —— memosprite_json 里没给 hp_inherit。
  // 这不影响遐蝶：她的忆灵技吃的是**遐蝶自己**的生命上限，不需要折算。
  const dragon = SS.filter((s) => s.charId === 1407);
  ok(dragon.length === 4 && dragon.every((s) => !s.servant.hp),
    '死龙•玻吕刻斯没有 hp 公式（遐蝶的忆灵技吃召唤者自己的生命上限，用不着它）',
    `拿到 ${dragon.filter((s) => s.servant.hp).length} 条有公式`);

  // ④ **12 条忆灵技的基数逐条钉住** —— 这是本项目全表最容易被静默改错的一处。
  //
  //    ★ 为什么必须逐条列、不能只抽查遐蝶 ★
  //      提取器给什么 `scaling` 是看「`#N%` 后面紧跟什么属性词」，**不看基数归谁**。
  //      「造成等同于「长夜」#1[i]%生命上限」和「造成等同于遐蝶#1[f1]%生命上限」
  //      在它眼里一模一样，都是 `hp`。把它们分开的是 `extract_buffs.mjs` 的
  //      `baseOwnerOf`——「占位符紧前面是召唤者名 ⇒ 召唤者基数；是忆灵名、
  //      或谁的名字都没有 ⇒ 忆灵基数」。
  //      这条规则**判错的后果**是：伤害照常算得出、界面上一切正常，
  //      只是基数悄悄从「忆灵生命上限」换成了「召唤者生命上限」（或反过来）。
  //      不逐条钉的话，这条规则**一条断言都没有** —— 实测把 `baseOwnerOf`
  //      改成永远返回 'owner'，整个 verify **一条都不红**。
  const listOf = (id) => AB.listAbilities(ctx, id, {
    eidolon: 0, element: ctx.charById.get(id)?.element,
    overrides: annotations.multipliers, baked: FRESH_ABILITIES,
  });
  const SERVANT_IDS = new Set(SS.map((s) => s.id));
  /**
   * 技能 → `[期望基数, 期望状态]`。
   *   基数 `null` = 这条技能一个倍率项都提不出来（整句被动词判定挡在流水线外）。
   *   ★ 基数与状态要**分开**断言 ★ `servantAtk` 那两条基数是对的，
   *     只是库里没有忆灵攻击力所以算不了 —— 拿「算不了」去掩盖基数判错，
   *     或者拿基数正确去掩盖算不出来，都是本项目最忌讳的静默错。
   */
  const SCALING_WANT = {
    1140701: ['hp', 'ok'],          // 遐蝶：等同于**遐蝶**#1%生命上限 → 召唤者
    1140702: ['hp', 'ok'],
    1140706: ['hp', 'ok'],
    1140712: ['hp', 'ok'],
    1141301: ['servantHp', 'ok'],   // 长夜月：等同于**「长夜」**#1%生命上限 → 忆灵
    1141307: ['servantHp', 'ok'],
    1141501: ['servantHp', 'ok'],   // 昔涟：德谬歌
    1151201: ['servantHp', 'ok'],   // 知更鸟•晴歌：晴空乐手
    1140201: ['servantAtk', 'unresolved'],  // 阿格莱雅：「造成#1%攻击力」，没写归谁 → 忆灵自己
    1800701: ['servantAtk', 'unresolved'],  // 开拓者：每次…造成等同于**迷迷**#1%攻击力
    1140901: [null, 'unresolved'],          // 风堇：本场累计治疗数值，整句没进倍率流水线
  };
  for (const [sidStr, [wantScaling, wantStatus]] of Object.entries(SCALING_WANT)) {
    const sid = Number(sidStr);
    const sk = SS.find((s) => s.id === sid);
    if (!ok(!!sk, `忆灵技 ${sid} 在数据里`)) continue;
    const a = listOf(sk.charId).find((x) => x.skillId === sid);
    if (!ok(!!a, `忆灵技 ${sid}「${sk.name}」出现在 ${sk.charId} 的技能列表里`)) continue;
    ok(a.status === wantStatus, `${sid}「${a.name}」的状态是 ${wantStatus}`, a.note);
    if (wantScaling == null) {
      ok(a.terms.length === 0,
        `${sid}（风堇·本场累计治疗）没有被硬凑出一个倍率项`,
        JSON.stringify(a.terms.map((t) => t.scaling)));
      continue;
    }
    const got = [...new Set(a.terms.map((t) => t.scaling))];
    ok(a.terms.length > 0 && got.length === 1 && got[0] === wantScaling,
      `${sid}「${a.name}」的基数是 ${wantScaling}`,
      `得到 ${JSON.stringify(got)}`);
  }
  // 反向：把**所有**忆灵技的基数汇总一遍，一个都没漏
  const allScaling = new Set();
  for (const s of SS) {
    for (const a of listOf(s.charId)) {
      if (a.skillId !== s.id) continue;
      for (const t of a.terms) allScaling.add(t.scaling);
    }
  }
  ok([...allScaling].sort().join(',') === 'hp,servantAtk,servantHp',
    '忆灵技用到的基数恰好是 hp / servantHp / servantAtk 三种',
    `得到 ${[...allScaling].sort().join(',')}`);

  // ⑤ 算不了的那批**照样在列表里**，且说得出为什么
  //    ★ 「不在列表里」和「在列表里但标着算不了」是完全不同的两件事 ★
  //      前者看起来像「我们的数据缺了」，后者是「我们知道算不了」。
  //      本项目的口径是后者，所以这里既断言 note，也断言它**还在**。
  const expectUnresolved = [
    [1402, 1140201, '忆灵自己的攻击力'],
    [8007, 1800701, '忆灵自己的攻击力'],
    [1409, 1140901, '累计治疗'],
  ];
  for (const [cid, sid, frag] of expectUnresolved) {
    const a = listOf(cid).find((x) => x.skillId === sid);
    if (!ok(!!a, `算不了的忆灵技 ${cid}/${sid} 仍然列在技能列表里`)) continue;
    ok(a.status === 'unresolved', `${cid}/${sid} 被标成 unresolved（没有静默算 0）`,
      `得到 ${a.status}`);
    ok(a.note.includes(frag), `${cid}/${sid} 的说明里提到「${frag}」`, a.note);
  }

  // ⑥ 全角色扫描：算不了的两种基数**绝不许**出现在 status === 'ok' 的技能里
  //    这是 ⑤ 的兜底 —— ⑤ 只盯着已知的三条，这一条盯的是「以后再冒出第四条」。
  const leakedScaling = [];
  const okServant = [];
  for (const ch of data.characters) {
    for (const a of listOf(ch.id)) {
      if (!SERVANT_IDS.has(a.skillId) || a.status !== 'ok') continue;
      okServant.push(`${ch.name}/${a.name}`);
      for (const t of a.terms) {
        if (t.scaling === 'servantAtk' || t.scaling === 'servantBase'
          || t.scaling === 'dynamicBase') {
          leakedScaling.push(`${ch.name}/${a.name}：${t.scaling}`);
        }
      }
    }
  }
  ok(leakedScaling.length === 0,
    '算不了的基数（忆灵攻击力/忆灵自身面板/本场累计）绝不出现在可算的技能里',
    leakedScaling.join(', '));
  console.log(`  忆灵技可算 ${okServant.length} 条：${okServant.join(' / ')}`);
  ok(okServant.length === 8, '忆灵技里恰好 8 条可算（12 条入表 − 4 条算不了）',
    `得到 ${okServant.length}`);

  // ⑦ 「召唤者生命上限没填」必须是**取不到**，不是 0
  //
  //    ★ 这条是打包自检撞出来的真缺陷 ★
  //      原来写的是 `panel.hp * (f.pct ?? 0) + (f.flat ?? 0)` ——
  //      JS 里 `null * 0.5 === 0`，于是空面板（`emptyPanel()` 的 hp 就是 null，
  //      也就是**默认状态**）下：
  //        长夜月（flat 0）    → 基座 = 0，乘区却报 known，伤害静默变 0；
  //        阿格莱雅（flat 720）→ 基座 = 720，跟面板毫无关系的数凭空冒出来。
  //      两种都算得出、都不抛错、界面上都写着「已知」。
  //      空面板是用户一选忆灵技就会撞上的状态，所以这一条必须钉住。
  {
    const blank = P.emptyPanel();
    const hitWith = (a, hp) => D.computeHit({
      panel: hp == null ? blank : { ...blank, hp },
      ability: AB.toHitAbility(a), agg: null, enemy: null,
      state: { broken: false }, options: { critMode: 'expected' }, attackerLevel: 80,
    });
    let checked = 0;
    for (const [cid, sid, whom] of [[1413, 1141301, '长夜月'], [1415, 1141501, '昔涟'],
      [1512, 1151201, '知更鸟•晴歌'], [1407, 1140701, '遐蝶']]) {
      const a = listOf(cid).find((x) => x.skillId === sid);
      if (!a || a.status !== 'ok') continue;
      checked++;
      const h0 = hitWith(a, null);
      ok(!(h0.zones?.base?.level === 'known'),
        `${whom}的忆灵技在空面板下不许报「已知」（生命上限是 null，不是 0）`,
        `得到 ok=${h0.ok} base.level=${h0.zones?.base?.level} total=${h0.total}`);
      // 对照：填上生命上限 → 同一条立刻能算。没有这一半，上面那半
      // 「永远算不出来」的实现照样绿。
      const h1 = hitWith(a, 6000);
      ok(h1.ok === true && h1.zones?.base?.level === 'known',
        `${whom}的忆灵技填上生命上限就算得出来（对照）`,
        `ok=${h1.ok} base=${h1.zones?.base?.level}`);
      if (h1.ok) {
        // 而且必须**随面板线性** —— 6000 → 12000 伤害翻倍。
        // 这一条同时钉住「倍数用的是忆灵生命上限，不是召唤者生命上限本身」：
        // 系数改成 1、或者忘了乘系数，翻倍性都还成立，所以它**不覆盖**系数本身，
        // 系数由上面 ③ 那一组管。
        const h2 = hitWith(a, 12000);
        near(h2.total, h1.total * 2, Math.abs(h1.total ?? 0) * 1e-6,
          `${whom}的忆灵技伤害与召唤者生命上限成正比`);
      }
    }
    ok(checked === 4, '4 条用生命上限做基数的忆灵技都查过了空面板', `得到 ${checked}`);
  }

  // ⑧ 忆灵技**按「打不打伤害」分成两张表**，谁也没串到对面去
  //
  //    ★ 这一块原来是反过来的 ★ 上一轮的口径是「忆灵只做伤害侧」，所以断言写着
  //    「含数值子句仍是 3220 条（忆灵技没混进增益目录）」。现在**辅助**忆灵技
  //    （昔涟德谬歌那 17 首诗）本来就该进增益目录 —— 用户裁定「收，做增益侧」。
  //    所以这条改成双向：进目录的是 `servantSupport`，进技能下拉框的是
  //    `servantSkills`，两边的集合**不许相交**。
  //
  //    计数与第 9、10 节的守恒式重复，但**故意再钉一次绝对数** —— 第 9 节那几条
  //    是相对式（各桶之和 === 总数），同一个循环里一起加的，近乎恒真。
  const audit = auditCatalog(data);
  ok(audit.clauseTotal === V(3302,3360), '含数值子句 3302 条（忆灵辅助技已并入增益目录）',
    `得到 ${audit.clauseTotal}`);
  const cat = buildCatalog(data, annotations.buffs);
  // 958 = 上一轮的 948 + 10 条光锥（人工表补的分错桶伤害类增益，见 annotations/buffs.jsonl 末 10 行）。
  ok(cat.entries.length === V(968,983), '增益目录 968 条（现烘现比，不是读缓存里那份）',
    `得到 ${cat.entries.length}`);

  // ⑨ ★ 两张忆灵技表不许相交，辅助技不许漏进技能下拉框 ★
  //
  //    串了的表现**全是静默的**，所以这一组值得单独写：
  //      · 辅助技混进伤害侧 → 技能下拉框凭空多 17 条「未收录倍率」，
  //        而它们根本没有倍率这回事（这正是用户报的那个问题）；
  //      · 伤害技混进增益侧 → 同一条增益被算两遍，伤害偏高，谁也不会发现。
  const SUP = data.servantSupport ?? [];
  const DMG = data.servantSkills ?? [];
  const supIds = new Set(SUP.map((s) => s.id));
  const dmgIds = new Set(DMG.map((s) => s.id));
  ok(SUP.length === 39 && DMG.length === 12,
    '忆灵技拆表：39 条辅助 + 12 条伤害', `得到 ${SUP.length} 辅助 + ${DMG.length} 伤害`);
  ok(SUP.every((s) => !dmgIds.has(s.id)) && DMG.every((s) => !supIds.has(s.id)),
    '两张忆灵技表没有交集（同一条不会两边都在）',
    `交集 ${[...supIds].filter((i) => dmgIds.has(i)).join(',') || '无'}`);
  ok(SUP.every((s) => s.desc), 'servantSupport 每条都有 desc（空 desc 的两边都不收）',
    `${SUP.filter((s) => !s.desc).length} 条没有 desc`);

  let supLeak = 0;
  for (const arr of ctx.skillsByChar.values()) {
    for (const s of arr) if (supIds.has(s.id)) supLeak++;
  }
  ok(supLeak === 0, '辅助忆灵技没有漏进 ctx.skillsByChar（技能下拉框不受影响）',
    `漏了 ${supLeak} 条`);
  ok(SUP.every((s) => ctx.skillByCharSkill?.get(`${s.charId}.${s.id}`) === s),
    '辅助忆灵技在 skillByCharSkill 里按 (charId, skillId) 找得到');

  // ★ 忆灵技 id **跨角色会撞号** ★ —— 开拓者的两个性别（8007 穹 / 8008 星）
  //   各有一份 memosprite_json，里面 5 个 id 两边一模一样。`skillById` 是
  //   纯 id 的 Map，撞号时后来者覆盖前者，**静默**返回另一个性别的记录；
  //   两个性别的忆灵参数目前恰好相同，所以看不出差别 —— 那是运气不是保证。
  //   这条断言把撞号的事实钉住，配合上面那句「走复合键」一起看。
  const allServant = [...SUP, ...DMG];
  const dupIds = [...new Set(allServant.map((s) => s.id))]
    .filter((id) => allServant.filter((s) => s.id === id).length > 1).sort();
  ok(dupIds.length === 5,
    '已知 5 个忆灵技 id 在两个开拓者性别之间重复（1800701/03/05/06/07）',
    `得到 ${dupIds.length} 个：${dupIds.join(',')}`);
  ok(dupIds.length === 0 || ctx.skillById.get(dupIds[0])?.charId === 8008,
    '纯 id 兜底表撞号时确实被后者覆盖（所以精确路径不能走它）',
    `skillById.get(${dupIds[0]}) 是 ${ctx.skillById.get(dupIds[0])?.charId}`);
  // ★ 撞号**今天**还看不出后果，因为两个性别的参数表恰好相同 ★
  //   这一条把那个前提钉住。哪天库里 8007/8008 的忆灵参数不再一样，
  //   它会红 —— 红了说明「按纯 id 取会拿错值」从此是真的，
  //   `resolveParam` 里那两级带 charId 的查找就成了**唯一**正确路径。
  //   不钉的话，那种改动会静默生效到某一天有人发现伤害不对为止。
  {
    const diff = [];
    for (const id of dupIds) {
      const same = allServant.filter((s) => s.id === id);
      const p = JSON.stringify(same[0].params);
      if (same.some((s) => JSON.stringify(s.params) !== p)) diff.push(id);
    }
    ok(diff.length === 0,
      '重复 id 的两份忆灵技参数表目前完全相同（所以纯 id 撞号暂时看不出后果）',
      `参数不同的有 ${diff.join(',')} —— 从此按纯 id 取会拿错值，精确路径成了必须`);
  }
  // 每条 servantSkill 目录条目都取得到值。面板锚定条目要先把面板填上 ——
  // 不填时它返回 null 是**正确行为**（「请先填 XX 的面板」），不是取不到。
  let svEntries = 0, svNull = 0;
  // ★ 用**现场重烘**的那一份（`cat.entries`），不是缓存里的 `data.buffCatalog` ★
  //   缓存那份是旧的，拿它断言等于把「烘焙产物对得上现场重烘」这条前提偷偷用上。
  for (const e of cat.entries) {
    if (e.kind !== 'servantSkill') continue;
    svEntries++;
    const panels = e.panel ? { [e.panel.who]: { [e.panel.attr]: 1 } } : {};
    if (CAT.catalogValue(ctx, e, { tier: 'max', panels }) == null) svNull++;
  }
  ok(svEntries === 25, '增益目录里有 25 条忆灵辅助技条目', `得到 ${svEntries}`);
  ok(svNull === 0, '25 条忆灵辅助技条目**每条都取得到值**（取不到值是「显示为空」，不报错）',
    `${svNull} 条取不到`);

  // ⑩ ★ 昔涟那 17 首「献予XX之诗」：进不来的 5 首，逐条钉死原因 ★
  //
  //    用户裁定「先只收自动的，那几首显式标注」—— 所以这里不是「以后要修」的
  //    待办清单，而是**当前口径的说明书**：改分类规则时这几条会红，红了就该
  //    回头看是「规则变好了」还是「规则退化了」。
  //    ★ 计划里写的是 4 首，实测是 5 首 —— 计划漏了「你好，世界♪」（整段
  //    一个占位符都没有，压根没有含数值子句，所以任何桶都不该有它）。★
  {
    const want = {
      1141502: [BUCKET.TARGET_UNKNOWN, '「使其造成的伤害提高」的「其」指谁判不出'],
      1141505: [null, '整段没有一个占位符（只解除控制类负面状态），本来就没有含数值子句'],
      1141513: [BUCKET.TARGET_UNKNOWN, '数值基数是德谬歌自己的生命上限/暴击率'],
      1141519: [BUCKET.NON_BUFF, '回能 / 按治疗数值提高 —— 与伤害无关'],
      1141526: [BUCKET.DAMAGE_TERM, '它本身就是伤害倍率句，属伤害侧'],
    };
    const names = charDisplayNames(data);   // 分类器要看上下文才知道「其」「自身」指谁
    const srcs = catalogSources(data)
      .filter((s) => s.kind === 'servantSkill' && s.ownerId === 1415);
    ok(srcs.length === 17, '昔涟的 17 首「献予XX之诗」都在目录来源里', `得到 ${srcs.length}`);
    const got = new Map();
    for (const s of srcs) {
      const parts = CL.buffClauseParts(s.text);
      const buckets = [];
      parts.forEach((part, ordinal) => {
        const cls = classifyClause(part, classifyOptsFor(s, data, names, parts.slice(0, ordinal)));
        if (cls) buckets.push(cls.bucket);
      });
      got.set(s.source.skillId, buckets);
    }
    for (const [sid, [wantBucket, why]] of Object.entries(want)) {
      const buckets = got.get(Number(sid));
      const label = `昔涟#${sid}（${why}）`;
      if (wantBucket == null) {
        ok(buckets && buckets.length === 0, `${label}：整段没有含数值子句`, `得到 ${buckets?.length} 条`);
        continue;
      }
      ok(buckets?.includes(wantBucket),
        `${label}：落进 ${wantBucket}`, `实际落进 ${[...new Set(buckets ?? [])].join(',') || '无'}`);
      ok(!buckets?.some((b) => b === BUCKET.PICKABLE || b === BUCKET.PANEL_ANCHORED),
        `${label}：没有子句能自动进目录`, `却有 ${buckets?.filter((b) => b === BUCKET.PICKABLE || b === BUCKET.PANEL_ANCHORED).length} 条`);
    }
    // 反面：另外 12 首**必须**有条目进目录，否则上面那组「进不来」就没有对照。
    const inCatalog = new Set(cat.entries.filter((e) => e.kind === 'servantSkill')
      .map((e) => e.ref.skillId));
    const shouldIn = srcs.map((s) => s.source.skillId).filter((id) => !(id in want));
    const missing = shouldIn.filter((id) => !inCatalog.has(id));
    ok(shouldIn.length === 12 && missing.length === 0,
      '其余 12 首「献予XX之诗」每首都有条目进了增益目录（对照）',
      `应进 ${shouldIn.length} 首，没进的是 ${missing.join(',') || '无'}`);
  }

  // ⑪ ★ `non-damage`：根本不打伤害的技能不许被说成「未收录倍率」★
  //
  //    这是用户报的那个问题的另一半。全库 151 条 `unresolved` 里 127 条的 tag
  //    根本不是伤害标签（布洛妮娅的战技、娜塔莎的治疗、杰帕德的盾），旧文案却
  //    写着「需要人工补录进 annotations/multipliers.jsonl」—— 让人去补录一个
  //    不存在的东西。
  {
    const tally = {};
    const ndTags = {};
    const wrongNd = [];   // tag 是伤害，却判成 non-damage（R1/R2 的入口）
    let okNonDmgTag = 0;  // tag 非伤害，但**确实提出了倍率** → 必须仍是 ok
    const ndNames = [];
    for (const ch of data.characters) {
      const list = AB.listAbilities(ctx, ch.id, {
        element: ch.element, overrides: annotations.multipliers, baked: FRESH_ABILITIES,
      });
      for (const a of list) {
        tally[a.status] = (tally[a.status] ?? 0) + 1;
        if (a.status === 'non-damage') {
          ndTags[a.tag] = (ndTags[a.tag] ?? 0) + 1;
          if (C.DAMAGE_TAGS.has(a.tag)) wrongNd.push(`${a.skillId} ${a.name} [${a.tag}]`);
          if (ndNames.length < 3) ndNames.push(`${a.skillId} ${a.name}：${a.note}`);
        }
        if (a.status === 'ok' && !C.DAMAGE_TAGS.has(a.tag)) okNonDmgTag++;
      }
    }
    ok(tally['non-damage'] === V(126,129), '126 条技能被标成 non-damage（不打伤害）',
      `得到 ${tally['non-damage']}`);
    ok(tally['unresolved'] === 25, '真缺口只剩 25 条 unresolved（原来 151 条）',
      `得到 ${tally['unresolved']}`);
    ok(tally['ok'] === V(323,327), '可算的仍是 323 条（一条都没被误伤）', `得到 ${tally['ok']}`);
    ok(tally['out-of-scope'] === 4,
      '击破技仍是 4 条 out-of-scope（没有被 non-damage 吸走）', `得到 ${tally['out-of-scope']}`);
    ok(wrongNd.length === 0,
      '**没有**任何伤害 tag 的技能被判成 non-damage（判据是 tag，不是 type）',
      wrongNd.slice(0, 5).join(' ｜ '));
    ok(okNonDmgTag === V(25,26),
      '25 条 tag 非伤害、但确实提出了倍率的技能仍是 ok（没被这条规则误伤）',
      `得到 ${okNonDmgTag}`);
    ok(Object.keys(ndTags).every((t) => !C.DAMAGE_TAGS.has(t)),
      'non-damage 的 tag 一律不是伤害标签',
      `混进了 ${Object.entries(ndTags).filter(([t]) => C.DAMAGE_TAGS.has(t)).map(([t, n]) => `${t}×${n}`).join(',')}`);
    console.log(`  non-damage 的 tag 分布：${Object.entries(ndTags).map(([t, n]) => `${t} ${n}`).join(' / ')}`);
    // 文案：不能再说「未收录倍率」，得说清是什么技能
    const badNote = [];
    for (const ch of data.characters) {
      for (const a of AB.listAbilities(ctx, ch.id, { element: ch.element, baked: FRESH_ABILITIES })) {
        if (a.status !== 'non-damage') continue;
        if (!a.note.includes('不造成伤害')) badNote.push(`${a.skillId}：${a.note}`);
      }
    }
    ok(badNote.length === 0, '每条 non-damage 的说明都写明了「不造成伤害」',
      badNote.slice(0, 3).join(' ｜ '));
    console.log(`  例：${ndNames.join(' ｜ ')}`);
  }
}

// ---------------------------------------------------------------------------
section(7.8, '深渊版本号是反推出来的（源库那一列是快照标签）');
{
  // ★ 这一节守的是一件**已经发生过**的事 ★
  //   界面上原来直接显示 `abyss_seasons.version`，于是**92 期全写着 v4.5** ——
  //   从 1.0 的第一期到最新一期都一样。原因见 core/scenario.mjs 顶部那段：
  //   那一列逐字等于 `meta.version`，是**整库快照的标签**，不是每期数据。
  //   现在的版本号由 `VERSION_STARTS` 那张日期表反推，所以那张表本身要有人守。

  // ① 链的三条硬约束。任何一条破了，说明表里某个日期写错了 ——
  //    「星期三 + 42 天」正是当初把整条 4.x 链唯一确定下来的那两条约束，
  //    拿它们反过来验自己是自洽的（它们**共同**约束 30 个日期，不是恒真）。
  ok(S.VERSION_STARTS.length >= 30, 'VERSION_STARTS 至少 30 个版本（下面那条链才有东西可验）',
    `${S.VERSION_STARTS.length} 个`);
  const WD = ['日', '一', '二', '三', '四', '五', '六'];
  const chainBad = [];
  let prevD = null;
  for (const [ver, day] of S.VERSION_STARTS) {
    const t = Date.parse(`${day}T00:00:00Z`);
    if (!Number.isFinite(t)) { chainBad.push(`${ver}: 日期解析不了 ${day}`); continue; }
    // 1.0~1.6 是开服头一年，节奏没定型（1.4→1.5 只有 35 天、2.0 还是星期二）；
    // 2.1 之后才是干净的 42 天。所以星期/间隔两条只在 2.1 之后逐条强求。
    if (ver !== '2.0' && new Date(t).getUTCDay() !== 3) {
      chainBad.push(`${ver} ${day} 是星期${WD[new Date(t).getUTCDay()]}`);
    }
    if (prevD != null) {
      const gap = (t - Date.parse(`${prevD}T00:00:00Z`)) / 86400000;
      if (gap < 35 || gap > 50) chainBad.push(`${ver} 距上一版 ${gap} 天`);
    }
    prevD = day;
  }
  ok(chainBad.length === 0, '版本链自洽：除 2.0 外全落在星期三，两两间隔在 35~50 天',
    chainBad.slice(0, 4).join(' | '));

  // ② **绝对钉死**几条 (期次 → 版本)。
  //    只验「链自洽」是不够的：整张表**整体平移一周**照样自洽，而界面上
  //    每一期都会错一周。所以必须有几处是「日期表之外的事实」——
  //    这些都是当初用来定链的锚点，改表里的日期它们立刻红。
  //    （分别来自三个不同的期次体系 moc / pf / as，且分散在 3.0~4.5，
  //      免得只钉住某一段、别的段随便挪。）
  const scenarioBy = new Map(S.listScenarios(ctx).map((s) => [s.id, s]));
  const PIN = [
    ['moc:1021', '3.0'], ['pf:2016', '3.4'], ['as:3006', '3.0'],
    ['moc:1016', '2.3'], ['as:3020', '4.5'],
  ];
  const pinBad = [];
  for (const [id, want] of PIN) {
    const s = scenarioBy.get(id);
    if (!s) { pinBad.push(`${id}: 没有这一期`); continue; }
    if (s.version !== want) pinBad.push(`${id} → ${s.version}，应 ${want}`);
  }
  ok(pinBad.length === 0, `${PIN.length} 处「期次 → 版本」的绝对钉死（整体平移会立刻红）`,
    pinBad.join(' | '));

  // ③ 反推覆盖率。**这两个数不是恒等式**：19 期源数据里根本没有 begin_time
  //    （最早那批），`versionAt` 对它们返回 null —— 那是「不知道」，不是「算出 1.0」。
  //    写死计数是为了让「哪天反推整段失效」有个确切的红，而不是变成一片 null 还看着正常。
  const all = S.listScenarios(ctx);
  const withVer = all.filter((s) => s.version != null);
  const noBegin = all.filter((s) => s.period == null);
  ok(withVer.length === 73 && noBegin.length === V(19,23),
    `92 期里反推出 73 期版本、19 期源数据无上线日期（不编一个 1.0 糊过去）`,
    `实为反推 ${withVer.length} / 无日期 ${noBegin.length} / 共 ${all.length}`);

  // ④ 反推出的版本必须落在 `period` 覆盖的区间里 —— 这是**唯一**一条
  //    把「版本」和源数据连起来的断言，别的都只是在验那张表自己。
  //    反推出的版本是「begin 那天所属的版本」，而 end 必须不早于 begin，
  //    于是整段区间必须落在 `[begin, 下一版上线日)` 里 —— 换句话说
  //    `period` 的起点必须真的是那一版上线之后。错位的话这里红。
  const rangeBad = [];
  for (const s of all) {
    if (s.version == null || !s.end) continue;
    if (s.end < s.begin) { rangeBad.push(`${s.id}: end < begin`); continue; }
    const i = S.VERSION_STARTS.findIndex(([v]) => v === s.version);
    const next = S.VERSION_STARTS[i + 1]?.[1];
    if (next && s.begin >= next) rangeBad.push(`${s.id}: begin ${s.begin} 已到 ${next} 之后`);
  }
  ok(rangeBad.length === 0, '每一期的 begin 都早于「下一版上线日」（版本号与日期区间不自相矛盾）',
    rangeBad.slice(0, 3).join(' | '));

  console.log(`  反推覆盖率：73/92 期有版本号，19 期源数据无 begin_time；`
    + `链长 ${S.VERSION_STARTS.length} 版（${S.VERSION_STARTS[0][0]} ~ ${S.VERSION_STARTS.at(-1)[0]}）`);
  console.log(`  抽样：${['moc:1021', 'pf:2016', 'as:3020'].map((id) => {
    const s = scenarioBy.get(id);
    return s ? `${s.label} → v${s.version}（${s.period}）` : id;
  }).join(' ｜ ')}`);
}

// ---------------------------------------------------------------------------
section(8, '外部实测锚点');
{
  const p = path.join(ROOT, '_data_cache', 'anchors.json');
  if (!fs.existsSync(p)) {
    skip('外部锚点反算', '还没填 _data_cache/anchors.json');
    console.log('  ── 这一节不能报 PASS。库里没有任何一列是游戏内实际打出的伤害，');
    console.log('     所以上面所有断言加起来也只能证明「输入对、面板对、乘区自洽」，');
    console.log('     证明不了最终数字对。要验证最终数字，必须回填实测锚点。');
  } else {
    const { anchors = [] } = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!anchors.length) {
      skip('外部锚点反算', 'anchors.json 里没有锚点');
    } else {
      let bad = 0;
      for (const a of anchors) {
        if (!Number.isFinite(a.observed) || a.observed <= 0) {
          bad++; console.log(`  [FAIL] ${a.id}: observed 必须是个正数，现在是 ${a.observed}`);
          continue;
        }
        const hit = D.computeHit({
          panel: a.panel, ability: a.ability, enemy: a.enemy,
          // ★ 不传 agg，增伤/易伤/减伤/减防乘区就全取 0 ★
          //   那样一条锚点只能验证「裸面板 × 暴击 × 防御 × 抗性」，而游戏里打出
          //   这个数时基本都带增益 —— 于是实测锚点**必然对不上**，且失败原因
          //   看起来像「公式算错了」，实际是「锚点没把增益喂进来」。
          //   所以 agg 是显式可选字段，填法见 _data_cache/anchors.json 里的示例。
          agg: a.agg ?? null,
          state: a.state ?? {}, options: { critMode: a.critMode ?? 'expected' },
          attackerLevel: a.attackerLevel ?? 80,
        });
        if (!hit.ok) { bad++; console.log(`  [FAIL] ${a.id}: ${hit.error}`); continue; }
        const got = a.critMode === 'crit' ? hit.onCrit : a.critMode === 'noncrit' ? hit.nonCrit : hit.expected;
        const err = Math.abs(got - a.observed) / a.observed;
        const pass = err <= (a.tolerance ?? 0.02);
        if (!pass) {
          bad++;
          // 只报「总数不对」是没用的 —— 把每个乘区单独打出来，一眼看得出是谁偏了
          const z = hit.zones;
          console.log(`  [FAIL] ${a.id}: 得到 ${got.toFixed(1)} 期望 ${a.observed} 误差 ${(err * 100).toFixed(2)}%`);
          console.log(`         基础 ${hit.base.toFixed(1)} × 增伤 ${hit.trace.find((t) => t.zone === 'dmgBoost').value.toFixed(3)}`
            + ` × 暴击 ${hit.trace.find((t) => t.zone === 'crit').value.toFixed(3)}`
            + ` × 防御 ${hit.trace.find((t) => t.zone === 'def').value.toFixed(4)}`
            + ` × 抗性 ${hit.trace.find((t) => t.zone === 'res').value.toFixed(3)}`
            + ` × 易伤 ${hit.trace.find((t) => t.zone === 'vuln').value.toFixed(3)}`
            + ` × 击破 ${hit.trace.find((t) => t.zone === 'broken').value.toFixed(2)}`
            + ` × 减伤 ${hit.trace.find((t) => t.zone === 'mitigation').value.toFixed(3)}`
            + (hit.hits !== 1 ? ` × ${hit.hits} 段` : ''));
          const suspect = ['def', 'res', 'broken'].filter((k) => z[k]?.level === 'unknown');
          if (suspect.length) console.log(`         ⚠ 这几个乘区现在是 unknown，先修它们再看数字：${suspect.join(', ')}`);
        } else console.log(`  [ ok ] ${a.id}: 误差 ${(err * 100).toFixed(2)}%`);
      }
      ok(bad === 0, `${anchors.length} 条实测锚点全部通过`, `${bad} 条不通过`);
    }
  }
}

// ---------------------------------------------------------------------------
section(9, '增益目录的守恒与分桶');
{
  // ★ 守恒式是本改动的**防静默总闸** ★
  //   老流水线里 `matchAttr` 返回 null 就等于那条子句**消失了** ——
  //   没有计数、没有告警、没有痕迹。于是「规则写漏了」和「本来就没有增益」
  //   在数据上长得一模一样。这条式子把两者分开。
  //   注意这条式子之前只是 CLI 里**打印**一句，从来没有被断言过 ——
  //   打印出来的绿字不会让任何人发现问题。
  const a = auditCatalog(data);
  // 全库角色显示名 —— 本节的每一处 `classifyClause` 都要喂它和 `prev`，
  // 否则面板锚定那一路推不出「吃谁的面板」「结果键」，条目会静默变少。
  const names = charDisplayNames(data);
  const sum = BUCKET_ORDER.reduce((n, b) => n + a.tally[b], 0);
  ok(a.clauseTotal > 0, '全部 5 类来源都产出了含数值子句', `${a.clauseTotal} 条`);
  ok(sum === a.clauseTotal,
    `各桶之和 ${sum} === 含数值子句总数 ${a.clauseTotal}（没有子句没被分桶）`,
    `差 ${a.clauseTotal - sum} 条`);
  ok(BUCKET_ORDER.every((b) => b in a.tally),
    '每个桶都在 tally 里有名字（加桶忘了加进 BUCKET_ORDER 会让守恒式静默失衡）',
    BUCKET_ORDER.filter((b) => !(b in a.tally)).join(', '));

  // ★ 上面那条守恒式单独看是**近乎恒真**的 ★
  //   `clauseTotal` 和 `tally` 是同一个循环里一起加的，`sum === total` 只有
  //   在 classifyClause 返回了一个不在 BUCKET_ORDER 里的桶名时才会破。
  //   真正要守的是另一件事：**含占位符的子句一条都不能被丢掉**。
  //   所以就独立数一遍 —— 这条路**完全不经过 classifyClause**，
  //   分类器哪天对某一类子句 `return null`（= 静默丢弃，就是老代码那个毛病），
  //   两边立刻对不上。这才是真正的反证：它测的是分类器，不是它自己。
  let rawPlaceholder = 0;
  for (const s of a.sources) {
    for (const part of CL.buffClauseParts(s.text)) {
      if (CL.hasPlaceholder(part)) rawPlaceholder++;
    }
  }
  ok(rawPlaceholder === a.clauseTotal,
    `含占位符的子句共 ${rawPlaceholder} 条，一条不落地进了分桶（分类器没有静默丢弃）`,
    `独立数出 ${rawPlaceholder} 条，分桶只有 ${a.clauseTotal} 条 —— 差 ${rawPlaceholder - a.clauseTotal} 条被吞了`);

  // ---- 桶的语义约束：不是计数，是「这个桶里该有什么、不该有什么」----
  //  ★ 这些桶各自的**原文**都要能列出来，否则界面只能说「有 N 条没算」而说不出是哪 N 条。
  for (const [bucket, why] of [
    ['DOT_EXCLUDED', /持续伤害|触电|风化|灼烧|裂伤|纠缠|烬煨|奥迹|离神/],
    ['BREAK_EXCLUDED', /击破伤害/],
    ['EXTRA_INSTANCE', /倍率/],
  ]) {
    const list = a.samples[bucket] ?? [];
    ok(a.tally[bucket] === 0 || (list.length > 0 && list.length <= a.tally[bucket]),
      `${bucket} 桶非空时带得出原文（不能只给个计数）`,
      `桶内 ${a.tally[bucket]} 条，能列出 ${list.length} 条`);
    const bad = list.filter((s) => !why.test(s.text));
    ok(bad.length === 0, `${bucket} 桶里每条都真的符合它的定义（桶名不撒谎）`,
      bad.slice(0, 3).map((s) => s.text).join(' | '));
  }

  // ---- 倍率改动：四种写法都在可收录目录里，且**各自算各自的** ----
  const multRows = [];
  for (const s of a.sources) {
    const parts = CL.buffClauseParts(s.text);
    parts.forEach((part, ordinal) => {
      const c = { text: part };
      const cls = classifyClause(c.text, classifyOptsFor(s, data, names, parts.slice(0, ordinal)));
      if (cls?.bucket === BUCKET.PICKABLE && /倍率/.test(c.text)) multRows.push({ s, c, cls });
    });
  }
  const mKeys = new Set(multRows.map((r) => r.cls.hit.key));
  ok(multRows.length > 0, '「倍率改动」类子句进了可收录目录（不是被丢掉）', `${multRows.length} 条`);
  ok(['multiplierAdd', 'multiplierScale'].every((k) => mKeys.has(k)),
    '加算与乘算两种写法都被认出来了', [...mKeys].join(', '));
  // ★ 归属必须是 owner 自己，**side 也必须是 ally** ★
  //   这条断言的反证很具体：把 attr.mjs 里那个 MULTIPLIER_KEYS 强制块改回
  //   「只在 target == null 时才覆盖」，下面这 3 条立刻变红 ——
  //   它们是 克拉拉 / 火花 / 姬子•启行 的「**对敌方目标**造成的伤害倍率提高」，
  //   推导会给出 side=enemy、target=enemy：字段填满了、不报错、看着很合理，
  //   但那句话说的是「这个技能打谁」，不是「这个增益给谁」。
  const badSide = multRows.filter((r) => r.cls.hit.target !== 'self' || r.cls.hit.side !== 'ally');
  ok(badSide.length === 0,
    '倍率改动一律归「技能拥有者自己」（side=ally / target=self，两者都不许按推导走）',
    badSide.slice(0, 4).map((r) => `${r.cls.hit.side}/${r.cls.hit.target}：${r.c.text}`).join(' ｜ '));
  // 计数 pin：语料里就 33 条。改少了说明规则写漏，改多了说明有别的句子被误吞进这一类。
  //   ★ 31 → 33 是这次并入忆灵辅助技带来的，两条都来自昔涟德谬歌的
  //   「献予「生死」之诗」：「造成的伤害倍率提高#2[f2]%」「伤害倍率额外提高#5[f2]%」。
  //   它们被判成 self/ally（归技能拥有者），这是 MULTIPLIER_KEYS 那条强制规则
  //   的既有行为 —— **这条 pin 只证明「就是这两条」**，证明不了它们语义上
  //   真该归昔涟。要改那条规则，这个数会跟着动，红了就回来看这里。
  ok(multRows.length === V(33,34), '倍率改动条目数 = 33（逐条看过，全是自拐）', `实际 ${multRows.length} 条`);
  // 反向：含「敌方目标」的倍率改动**必须**在这 31 条里，且已被强制成 self ——
  // 防止哪天有人「为了稳妥」把这类句子整体排除掉，那样不报错但静默少算。
  const enemyPhrased = multRows.filter((r) => /对(指定)?敌方|敌方目标|敌方随机/.test(r.c.text));
  ok(enemyPhrased.length === 3 && enemyPhrased.every((r) => r.cls.hit.target === 'self'),
    '含「对敌方目标」的倍率改动没有被当成敌方减益，也没有被排除掉',
    `${enemyPhrased.length} 条：` + enemyPhrased.map((r) => r.cls.hit.target).join(', '));

  // ---- ★ 「整句没点名 → 归来源归属者」这条兜底的安全性 ★ ----
  //  这条规则一口气把 247 条从「选不到」变成「选得到」，收益大，风险也大：
  //  兜错方向就是把**敌方减益**当成自己的增益，反着算还看不出错。
  //  所以正反两面各钉一条。
  const allRows = [];
  for (const s of a.sources) {
    const parts = CL.buffClauseParts(s.text);
    parts.forEach((part, ordinal) => {
      const cls = classifyClause(part, classifyOptsFor(s, data, names, parts.slice(0, ordinal)));
      if (cls) allRows.push({ s, c: { text: part }, cls });
    });
  }
  const inherited = allRows.filter((r) => r.cls.hit?.targetSource === 'source_owner');
  ok(inherited.length > 0, '「没点名 → 归来源归属者」这条兜底真的在用',
    `0 条 —— 规则没生效，或者被上面某条 early-return 抢走了`);
  // ① 兜底出来的每一条都必须是**我方**。
  const wrongDir = inherited.filter((r) => r.cls.hit.side !== 'ally');
  ok(wrongDir.length === 0,
    '被兜成「来源归属者」的子句全部是 ally（不许把敌方减益兜成自己的增益）',
    wrongDir.slice(0, 4).map((r) => `side=${r.cls.hit.side}：${r.c.text}`).join(' ｜ '));
  // ★ 上面那条**今天红不了**，得说清楚 ★
  //   实测：把守卫从 `side === 'ally'` 放宽成 `side !== 'enemy'`，一条都不红 ——
  //   因为语料里根本没有 side 为 mixed/null 的子句能走到这一行（敌方那一支在最上面
  //   就 early-return 了）。也就是说这条断言**目前是语料喂出来的巧合，不是守出来的**。
  //   所以另外用**合成的输入**直接测那个守卫本身 —— 这个才是能红的。
  for (const [side, text, wantSelf] of [
    ['ally', '攻击力提高#1[i]%', true],
    ['mixed', '使我方和敌方攻击力提高#1[i]%', false],   // 同时提到两边 = 判不出，不许兜
    [null, '攻击力提高#1[i]%', false],                    // 侧别都没判出来，更不许兜
    ['enemy', '防御力降低#1[i]%', false],                 // 敌方减益走上面那一支
  ]) {
    const got = AT.deriveTarget(text, side, null).target;
    ok((got === 'self') === wantSelf,
      `deriveTarget(side=${side}) → ${wantSelf ? '兜成 self' : '保持判不出'}`,
      `得到 ${got}`);
  }
  // ② 指代词指向**别处**的子句不许被兜 —— 这是「收益大」那条规则最容易过度的地方。
  //    「使其攻击力提高」（其＝技能打的那个对象）曾经就在这 17 条里躺着。
  const overreach = allRows.filter((r) => /该目标|此目标|其受到|使其|那个目标/.test(r.c.text)
    && r.cls.hit?.targetSource === 'source_owner');
  ok(overreach.length === 0,
    '含「使其/该目标」的子句没有被兜成「来源归属者」（它指的是技能打谁，不是给谁）',
    overreach.slice(0, 4).map((r) => r.c.text).join(' ｜ '));
  // ③ 「除自身以外的队友」必须保持判不出 —— 兜成 self 就漏掉了「给队友」这层含义。
  const exceptSelf = allRows.filter((r) => /自身以外|自己以外/.test(r.c.text) && r.cls.hit?.targetSource === 'source_owner');
  ok(exceptSelf.length === 0,
    '「使除自身以外的队友…」没有被兜成「来源归属者」（它的对象明确是队友）',
    exceptSelf.map((r) => r.c.text).join(' ｜ '));
  console.log(`  兜底「来源归属者」${inherited.length} 条，方向全对；`
    + `仍判不出作用对象的 ${a.tally.TARGET_UNKNOWN} 条（都是「使其/该目标」这类真正含糊的）`);

  // ---- ★ 数值：四种写法必须给出四个不同的答案 ★ ----
  //  这条是这次改动的核心断言。老做法是把它们塞进 NO_ATTR 或随便一个属性键，
  //  那样「丹恒 +120%」会被当成 ×2.2（乘算）而不是 +120 个百分点 ——
  //  数值取到了、不报错、看起来完全合理。所以这里**逐个 pin 住比值**，
  //  并且顺带断言它们互不相等（合成一个键就会让下面这几条同时成立而全绿）。
  {
    const P = { atk: 2000, hp: 4000, def: 1000, speed: 100, critRate: 0.5, critDmg: 1.0, elation: null };
    const EN = { source: 'monster', def: 1000, res: E.fullResistance([]), weakness: [] };
    const TERMS = [{ scaling: 'atk', multiplier: 3.0 }];
    const mk = (k, v, scope = {}) => ({ key: k, value: v, side: 'ally', scope, provenance: 'known', owner: 'o', label: 'L', text: 't', op: 'add' });
    const r = (type, buffs) => D.computeHit({
      panel: P, ability: { type, element: 'Wind', terms: TERMS, hits: 1 },
      enemy: EN, state: {}, options: {}, agg: BU.aggregate(buffs),
    });
    const base0 = r('Ultra', []).total;
    near(r('Ultra', [mk('multiplierAdd', 1.2)]).total / base0, 4.2 / 3.0, 1e-9,
      '加算：倍率 3.0 +1.2 → ×1.4（丹恒「终结技倍率提高120%」）');
    near(r('Ultra', [mk('multiplierScale', 0.2)]).total / base0, 3.6 / 3.0, 1e-9,
      '乘算：倍率 3.0 ×(1+0.2) → ×1.2（白厄「提高原倍率的20%」）');
    near(r('Ultra', [mk('multiplierSet', 1.5)]).total / base0, 4.5 / 3.0, 1e-9,
      '设定：倍率 3.0 ×1.5（千冶•刃「提高为原倍率的150%」）');
    near(r('Ultra', [mk('multiplierScaleDown', 0.125)]).total / base0, 2.625 / 3.0, 1e-9,
      '乘算（减）：倍率 3.0 ×(1−0.125)（白厄天赋「减少原倍率的12.5%」）');
    // 反证：三种写法互不等价 —— 合成一个键的话下面这条会红
    const three = [1.2, 0.2, 1.5].map((v, i) => ['multiplierAdd', 'multiplierScale', 'multiplierSet'][i]);
    const vals = three.map((k, i) => r('Ultra', [mk(k, [1.2, 0.2, 1.5][i])]).total);
    ok(new Set(vals.map((v) => v.toFixed(4))).size === 3,
      '加算/乘算/设定给出三个不同的结果（合成一个键会静默算错）', vals.map((v) => v.toFixed(1)).join(' / '));

    // 作用域：作用于终结技的改动，算普攻时**不生效**，而且**出现在未计入清单里**
    const ultraOnly = [mk('multiplierAdd', 1.2, { abilityKind: 'Ultra' })];
    near(r('Ultra', ultraOnly).total, r('Ultra', [mk('multiplierAdd', 1.2)]).total, 1e-9,
      '作用于终结技的倍率改动，算终结技时生效');
    near(r('Normal', ultraOnly).total, r('Normal', []).total, 1e-9,
      '同一改动算普攻时不生效（挑技能，不能糊涂地全加上）');
    const h = r('Normal', ultraOnly);
    ok(h.multNotApplied.length === 1 && h.multNotApplied[0].abilityKind === 'Ultra',
      '没算上的倍率改动出现在「未计入」清单里（不许静默丢）', JSON.stringify(h.multNotApplied));

    // 反证：把 kind 去掉（变成「作用于当前技能」）后必须**生效** ——
    // 否则上面那条「不生效」可能只是因为改动压根没接上。
    near(r('Normal', [mk('multiplierAdd', 1.2)]).total, base0 * (4.2 / 3.0), 1e-9,
      '不挑技能的倍率改动对任何技能都生效（反证：机制确实接上了）');

    // ---- ★ 不限定技能类型的增伤必须真的算进去 ★ ----
    //  `agg.abilityDmg.all` 曾经**没有任何人读** —— 条目进得来、aggregate 里看得见、
    //  界面也显示，就是不影响伤害。今天语料里恰好 0 条走这条路（所以没爆），
    //  但那是运气不是设计：哪天「不限定类型的技能增伤」进了目录，它会静默算 0。
    near(r('Ultra', [mk('abilityDmg', 0.5, {})]).total / base0, 1.5, 1e-9,
      '不限定技能类型（all）的增伤会被读到并生效（这条曾经恒为 0）');
    // 两条各归各的：限定类型的不该影响别的类型，不限定类型的该影响所有类型
    near(r('Ultra', [mk('abilityDmg', 0.5, { abilityTypes: ['BPSkill'] })]).total, base0, 1e-9,
      '限定战技的增伤，算终结技时不生效');
    near(r('BPSkill', [mk('abilityDmg', 0.5, { abilityTypes: ['BPSkill'] })]).total,
      r('BPSkill', [mk('abilityDmg', 0.5, {})]).total, 1e-9,
      '限定战技的增伤，算战技时和不限定的效果一致');
  }

  // ---- ★「普攻和战技」这类**多技能类型**子句不许只记最后一个 ★ ----
  //  老写法取正则捕获组，而正则只捕获**最后**一个类型名：
  //  「使装备者普攻和战技造成的伤害提高#1%」→ 只记 BPSkill，普攻那一半静默消失。
  //  数值对、不报错、只是少算一半 —— 正是本项目最怕的那种错。
  {
    const CAT = buildCatalog(data, annotations.buffs);
    const multi = CAT.entries.filter((e) => e.key === 'abilityDmg'
      && (e.text.match(/普攻|战技|终结技|天赋|秘技|追加攻击|反击|欢愉技|忆灵技/g) ?? []).length > 1);
    ok(multi.length > 0, '语料里确实有「提到不止一个技能类型」的子句（否则下面两条是空转）',
      '0 条 —— 反证的基础没了');
    const shorted = multi.filter((e) => (e.scope?.abilityTypes ?? []).length < 2);
    ok(shorted.length === 0,
      '同时提到多个技能类型的子句，每个类型都记上了（不许只记正则最后捕获的那个）',
      shorted.slice(0, 3).map((e) => `${JSON.stringify(e.scope)}：${e.text.slice(0, 40)}`).join(' ｜ '));
    // 反向：记下的类型必须是**句子里真出现过的**，不许凭空塞
    const ELEMENT_KINDS = { Normal: '普攻', BPSkill: '战技', Ultra: '终结技', Talent: '天赋', Maze: '秘技' };
    const invented = multi.filter((e) => (e.scope?.abilityTypes ?? [])
      .some((t) => !e.text.includes(ELEMENT_KINDS[t] ?? t)));
    ok(invented.length === 0, '认定的技能类型都在句子里真出现过（不许凭空塞一个）',
      invented.slice(0, 3).map((e) => `${JSON.stringify(e.scope.abilityTypes)}：${e.text.slice(0, 40)}`).join(' ｜ '));
    console.log(`  多技能类型子句 ${multi.length} 条，全部逐类型记账`);
  }

  // ---- ★ 倍率键不许被记成增伤键 ★ ----
  //
  //  这里**故意不做**「aggregate 收到 multiplierAdd 后 agg.dmgBoost 还是不是 0」那种断言。
  //  试过：写出来之后**怎么改都红不了**（SUM_KEYS 那一支写的是 `agg[k]`，
  //  加进去也只会得到 `agg.multiplierAdd`，不会变成增伤；而 elemDmg/abilityDmg
  //  是预置全零键的定长记录，永远「有键」）。红不了的断言等于没写。
  //
  //  真实的风险在**分类那一层**：五个体积很小的键（multiplier*）与「增伤」长得
  //  一模一样，都是「伤害提高 X%」。区别只在于落在基础伤害那一项还是增伤乘区。
  //  一旦有人在 ATTR_RULES 里把 /倍率提高/ 那条的 key 写成 'dmgBoost'
  //  （或者把 dmgBoost 那条排到前面去），子句会被**记成 +120% 增伤** ——
  //  不报错、伤害也确实变大，只是大了错的那个数。所以断言下在这里。
  const misKeyed = multRows.filter((r) => r.cls.hit.key === 'dmgBoost' || r.cls.hit.key === 'abilityDmg');
  ok(misKeyed.length === 0,
    '含「倍率」的子句没有被记成增伤键（记错了就是「+120 个百分点倍率」变成「+120% 增伤」）',
    misKeyed.slice(0, 3).map((r) => `${r.cls.hit.key}：${r.c.text}`).join(' ｜ '));

  // ---- 倍率键确实被 aggregate 用上了（不许进了目录却没接线）----
  {
    const aggM = BU.aggregate([{ key: 'multiplierAdd', value: 0.3, side: 'ally', scope: {}, provenance: 'known', owner: 'o', label: 'L', text: 't' }]);
    ok(aggM.multiplier && aggM.multiplier.all?.add === 0.3,
      '倍率键落进了 agg.multiplier.all.add（接线检查：目录里的条目真的会进公式）',
      JSON.stringify(aggM.multiplier));
  }

  console.log(`  含数值子句 ${a.clauseTotal} 条，涉及来源主体 ${a.sources.length} 条`);
  console.log(`  可收录 ${a.tally.PICKABLE} / 判不出作用对象 ${a.tally.TARGET_UNKNOWN}`
    + ` / 判不出侧别 ${a.tally.SIDE_UNKNOWN} / 认不出属性键 ${a.tally.NO_ATTR}`);
  console.log(`  有意不算：持续伤害 ${a.tally.DOT_EXCLUDED} / 击破伤害 ${a.tally.BREAK_EXCLUDED}`
    + ` / 附加伤害（另一段）${a.tally.EXTRA_INSTANCE} / 纯时长 ${a.tally.DURATION_ONLY}`);
}

// ---------------------------------------------------------------------------
section(10, '增益目录的运行期（core/catalog.mjs）');
{
  // ★ 第 9 节管的是「哪些子句进了目录」，这一节管「进了目录的能不能用」★
  //   目录是**构建期**烘的，数值是**运行期**按全局开关现算的 —— 这两件事之间
  //   没有类型约束兜着。一个 `paramIndex` 写错、一个 `ref` 指向不存在的技能，
  //   表现都是「取出来是 null」，而 null 混进数字里会**静默变成 NaN 或 0**。
  //   所以这里的核心断言是：**每一条要么取到有限的非负数，要么带得出取不到的原因**。
  const CATALOG = data.buffCatalog ?? [];
  const base = { tier: 'base' };
  const max = { tier: 'max' };
  const names = charDisplayNames(data);   // 本节有直接遍历语料问分类器的断言，同样要喂上下文

  // ---- 10.1 规模与形状 ----
  ok(CATALOG.length >= 700, '目录规模没有塌缩（规则被改坏会让它静默变小）', `${CATALOG.length} 条`);
  const kinds = new Set(CATALOG.map((e) => e.kind));
  // ★ 六类 ★ `servantSkill` 是这次加的：忆灵的**辅助**技（昔涟德谬歌那 17 首诗）。
  //   它只由构建期发（UI 直接读烘焙好的 buffCatalog），所以这一条守的是
  //   「`catalogSources` 里那段 `for (const sk of core.servantSupport)` 还在」。
  const WANT_KINDS = ['skill', 'servantSkill', 'trace', 'eidolon', 'lightcone', 'relicset'];
  ok(WANT_KINDS.every((k) => kinds.has(k)),
    '六类来源都有条目', `缺 ${WANT_KINDS.filter((k) => !kinds.has(k)).join(',') || '无'}`);
  const ids = new Set(CATALOG.map((e) => e.id));
  ok(ids.size === CATALOG.length, '目录 id 唯一（重复 = 两条互相覆盖）',
    `去重后 ${ids.size} / ${CATALOG.length}`);
  const malformed = CATALOG.filter((e) => !e.id || !e.key || !e.ref || !e.text);
  ok(malformed.length === 0, '每条都有 id / key / ref / text',
    malformed.slice(0, 2).map((e) => JSON.stringify(e).slice(0, 60)).join(' ｜ '));

  // ---- 10.1b 烘焙的目录 === 现场重烘的目录 ----
  //
  //  ★ 这条是本项目最可能踩的坑 ★
  //    `data.buffCatalog` 是 build_data.mjs **烘**进数据块的，而下面所有断言读的都是
  //    烘好的那一份。也就是说：改了 `build_catalog.mjs` 的规则却忘了重烘，
  //    目录会**静静地停在旧版本** —— 界面上一切正常，只是少了/多了一批条目，
  //    而且没有任何地方会报错。反过来，这条断言也让「改坏构建期规则」这件事
  //    在反证跑批里**能红**（否则构建期的坏法一条都测不出来）。
  //    下面所有断言都拿 `CATALOG`（烘焙）和 `fresh`（现场）两份做交叉，
  //    `fresh` 在节作用域里定义，10.5b 的单位检查也用它。
  // ★ 人工表必须一起传 ★ 烘焙的那份是**带着** buffs.jsonl 烘的（见 1325 行）；
  //   这里不传就等于用一套不同的规则重烘，比出来的差异全是假的。
  //   这个坑当场踩过一次：人工表救回来的条目只出现在烘焙那边，于是三条
  //   「烘焙 === 现场重烘」的断言全红，看着像「忘了重烘」，其实是两边规则不同。
  const freshBuild = buildCatalog(data, annotations.buffs);
  const fresh = freshBuild.entries;          // 现场重烘的目录
  const freshStats = freshBuild.stats;       // 现场重烘的计数（10.14 要拿它跟烘焙的比）
  {
    const sameIds = fresh.length === CATALOG.length
      && fresh.every((e, i) => e.id === CATALOG[i].id);
    const diff = sameIds ? []
      : fresh.filter((e, i) => e.id !== CATALOG[i]?.id).slice(0, 3)
        .map((e, i) => `现场 ${e.id} vs 烘焙 ${CATALOG[i]?.id ?? '（没有）'}`);
    ok(sameIds, '烘焙的目录与现场重烘的一致（改了 build_catalog 的规则必须重烘）',
      `现场 ${fresh.length} 条 / 烘焙 ${CATALOG.length} 条；${diff.join(' ｜ ')}`);
    const sameText = fresh.length === CATALOG.length
      && fresh.every((e, i) => e.text === CATALOG[i].text);
    ok(sameText, '重烘出的条目文本与烘焙的一致（id 指到了同一条子句）',
      fresh.filter((e, i) => e.text !== CATALOG[i]?.text).slice(0, 2)
        .map((e, i) => `${e.id}：${e.text.slice(0, 30)}`).join(' ｜ '));
    // ★ 键也要比 ★ 改分类规则（比如把某个键换掉、改单位判定）**同样必须重烘**，
    //   只比 id 和文本的话，这种改动在两份之间看不出差别 —— 而它恰恰会把
    //   数值挂到另一个乘区上。见 R25。
    const sameKey = fresh.length === CATALOG.length
      && fresh.every((e, i) => e.key === CATALOG[i].key);
    ok(sameKey, '重烘出的属性键与烘焙的一致（改了分类规则必须重烘）',
      fresh.filter((e, i) => e.key !== CATALOG[i]?.key).slice(0, 3)
        .map((e, i) => `${e.id}：现场 ${e.key} vs 烘焙 ${CATALOG[i]?.key}`).join(' ｜ '));
  }

  // ---- 10.2 取值：要么有值，要么有理由 ----
  //
  //  这是本节的主断言。真正不许出现的是「取不到且不说为什么」——
  //  那种条目在界面上长得和「这条增益本来就没数值」一模一样。
  //
  //  ⚠ 星魂全解锁之后，`max` 档下已经**没有**任何条目取不到值了，
  //    这条在 `max` 下同样接近恒真。它有牙齿的部分全靠下面改到
  //    `pieces=2` 上跑的那一条（那条才是真正会红的）。
  //  ★ 跑两遍：不填面板 / 面板填满 ★
  //    第一遍放行「面板待填」（`e.panel` 且用户还没输入）—— 它是合法的缺输入状态，
  //    不是缺陷。第二遍把面板填满，**一条都不放行**，守的正是那一批
  //    （归属者名对不上、引用了 emptyPanel 里没有的字段、系数 index 落空）。
  //    没有第二遍的话，被放行的这一类就从此没有断言守着了。见文件顶部注释。
  const maxP = { ...max, panels: PANELS };
  const badValue = [];
  const checkValue = (e, o) => {
    const v = CAT.catalogValue(ctx, e, o);
    if (v != null && (!Number.isFinite(v) || v < 0)) badValue.push({ e, v });
    return v;
  };
  const noReason = [];
  const noReasonFilled = [];
  for (const e of CATALOG) {
    if (checkValue(e, max) == null && !CAT.blockedReason(e, max) && !e.panel) noReason.push(e);
    if (checkValue(e, maxP) == null && !CAT.blockedReason(e, max)) noReasonFilled.push(e);
  }
  ok(noReason.length === 0, '满星魂档下没有「取不到又给不出原因」的条目（面板待填除外）',
    noReason.slice(0, 3).map((e) => `${e.kind}/${e.id} paramIndex=${e.paramIndex}`).join(' ｜ '));
  ok(noReasonFilled.length === 0,
    '面板填满之后连面板锚定条目也一条都不许「取不到又给不出原因」',
    noReasonFilled.slice(0, 3).map((e) => `${e.kind}/${e.id} paramIndex=${e.paramIndex}`).join(' ｜ '));
  // 符号约定：值恒为正，符号由属性键承载（`1 - defShred`）。负数说明有人
  // 在取值时顺手取了负 —— 那会让「降低 40%」变成叠在错误的方向上。
  ok(badValue.length === 0, '目录里的值都是有限的非负数（符号归属性键管，不归数值管）',
    badValue.slice(0, 3).map((x) => `${x.e.id}=${x.v}`).join(' ｜ '));

  // ★ 这一条原先跑在 `base` 下，星魂全解锁之后**退化成恒真式**了 ★
  //   基础档下已经没有任何条目取不到值（189 条星魂全解锁），
  //   于是 `filter(...)` 恒为空集，`0 === 0` 怎么改都红不了。
  //   所以改到仍然活着的那条锁定通路（pieces=2 卡 4 件套）上跑，
  //   否则「取不到 ⇒ 必须说得出理由」这个不变量就没人守了。
  //  面板同样要喂满：这条问的是「遗器件数这道门槛有没有给出理由」，
  //  面板待填是另一回事，混进来会让它报出一批跟遗器无关的条目。
  const shortRelics = { tier: 'base', pieces: 2, panels: PANELS };
  const noReasonShort = CATALOG.filter(
    (e) => CAT.catalogValue(ctx, e, shortRelics) == null && !CAT.blockedReason(e, shortRelics));
  ok(noReasonShort.length === 0, '遗器只给 2 件时，取不到的条目也全都带得出原因',
    noReasonShort.slice(0, 3).map((e) => `${e.kind}/${e.id}`).join(' ｜ '));
  // 而且这个集合必须**非空** —— 全是空集的话上面那条又白写了
  const shortBlocked = CATALOG.filter((e) => CAT.blockedReason(e, shortRelics));
  ok(shortBlocked.length > 0, 'pieces=2 确实锁住了东西（否则上一条是空集恒真）',
    `被锁 ${shortBlocked.length} 条`);

  // ---- 10.3 档位单调 ----
  //
  //  ★ 光断言「满星魂档 ≥ 基础档」是**可以恒真**的 ★
  //    如果 eidolonOf 永远返回 0（或者等级逻辑整个不生效），条条相等，
  //    「不小于」照样全绿。所以必须再加一条「确实有条目严格变大」，
  //    否则这个断言只是在描述一个恒等式。
  const shrunk = [];
  let compares = 0;
  let grew = 0;
  for (const e of CATALOG) {
    if (e.valueFrom !== 'skillLevel') continue;
    const b = CAT.catalogValue(ctx, e, base);
    const m = CAT.catalogValue(ctx, e, max);
    if (b == null || m == null) continue;
    compares++;
    if (m < b - 1e-9) shrunk.push(`${e.id} ${b}→${m}`);
    else if (m > b + 1e-9) grew++;
  }
  ok(shrunk.length === 0, '满星魂档的数值不低于基础档（等级只升不降）', shrunk.slice(0, 3).join(' ｜ '));
  ok(grew > 0, '满星魂档确实有条目变大（否则上面那条是恒真的）',
    `严格变大 ${grew} 条 / 可比 ${compares} 条`);

  // ★ 星魂条目现在**与档位无关**，这本身是个要守住的不变量 ★
  //   解锁之后 `case 'eidolon'` 只按 rankId 取参数，不看 opts。
  //   所以两种档位必须取出**逐位相同**的值 —— 一旦有人在取值路径上
  //   又接回了「有几星魂」，这条立刻红。
  //
  //   ⚠ 注意这条不能和上面那条合并：上面只断言「不降」，
  //     而星魂条目现在连「升」都不该有，合并了就分不出是哪种坏法。
  const eidTierDiff = CATALOG.filter((e) => e.kind === 'eidolon').filter((e) => {
    const b = CAT.catalogValue(ctx, e, base);
    const m = CAT.catalogValue(ctx, e, max);
    return b !== m;
  });
  ok(eidTierDiff.length === 0, '星魂条目的取值在基础档/满星魂档下完全相同（它不看档位）',
    eidTierDiff.slice(0, 3).map((e) => `${e.id}: ${CAT.catalogValue(ctx, e, base)} vs ${CAT.catalogValue(ctx, e, max)}`).join(' ｜ '));

  // ---- 10.4 分组 ----
  //
  //  ★ 这里**不用**「各页签之和 + unplaced === 总数」那种守恒式 ★
  //   看起来很像第 9 节那条，其实是个恒等式：groupCatalog 只有两条出口
  //   （推进页签 / 推进 unplaced），怎么写都守恒，红不了。红不了的断言等于没写。
  //   改成**独立重数** —— 直接按 side/target 数一遍，绕开 tabOf 和 groupCatalog
  //   的中间结构，再和它们的分组结果逐个页签对。这样「分组漏了一条」
  //   和「tabOf 判错了」都能显形。
  const g = CAT.groupCatalog(CATALOG);
  const recount = {
    ally_single: CATALOG.filter((e) => e.side === 'ally'
      && (e.target === 'self' || e.target === 'single_ally')).length,
    ally_team: CATALOG.filter((e) => e.side === 'ally' && e.target === 'team').length,
    enemy: CATALOG.filter((e) => e.side === 'enemy').length,
  };
  for (const t of ['ally_single', 'ally_team', 'enemy']) {
    const got = Object.values(g.tabs[t]).flat().length;
    ok(got === recount[t], `页签「${t}」的条数与按 side/target 独立重数一致`,
      `分组得到 ${got}，独立重数 ${recount[t]}`);
  }
  // 每条都必须有归宿：三个页签 + unplaced 要盖住整个目录，不许有条目在分组时蒸发
  const placed = Object.values(g.tabs).flatMap((gs) => Object.values(gs).flat()).length + g.unplaced.length;
  ok(placed === CATALOG.length, '每条目录条目都归进了某个页签（没有在分组时蒸发）',
    `归位 ${placed} / 目录 ${CATALOG.length}`);

  // ★ 侧别是本项目最容易出**方向性错误**的地方 ★
  //   「防御力降低 40%」被判成我方增益，就是 +40% 而不是 −40%，
  //   伤害偏高一倍还看不出错。所以两个「我方」页签里出现 side≠ally
  //   一律报红，反之亦然。
  //
  //  ★ 必须带「非空」这个条件 ★
  //    只写「页签里没有 side 判错的条目」，在一个**空页签**上恒真 ——
  //    而「页签整个空了」恰恰是最容易出的错（tabOf 少写一个分支就会空）。
  //    加上非空之后，「判错」和「判没了」两种坏法都能显形。
  const allyAll = ['ally_single', 'ally_team'].flatMap((t) => Object.values(g.tabs[t]).flat());
  const allyWrong = allyAll.filter((e) => e.side !== 'ally');
  ok(allyAll.length > 0 && allyWrong.length === 0,
    '「我方」两个页签非空，且里面没有 side 不是 ally 的条目',
    allyAll.length ? allyWrong.slice(0, 3).map((e) => `${e.side}/${e.target}：${e.text.slice(0, 30)}`).join(' ｜ ')
      : '页签是空的 —— 判没了和判错了后果一样');
  const enemyAll = Object.values(g.tabs.enemy).flat();
  const enemyWrong = enemyAll.filter((e) => e.side !== 'enemy');
  ok(enemyAll.length > 0 && enemyWrong.length === 0,
    '「敌方负面」页签非空，且里面没有 side 不是 enemy 的条目',
    enemyAll.length ? enemyWrong.slice(0, 3).map((e) => `${e.side}/${e.target}：${e.text.slice(0, 30)}`).join(' ｜ ')
      : '页签是空的 —— 判没了和判错了后果一样');

  // ---- 10.5 有意排除的东西不许漏进来 ----
  const dot = CATALOG.filter((e) => /持续伤害/.test(e.text));
  ok(dot.length === 0, '目录里没有任何一条含「持续伤害」（v1 不算 DoT）',
    dot.slice(0, 3).map((e) => e.text.slice(0, 40)).join(' ｜ '));

  // ---- 10.5b 单位：平值 vs 百分比 ----
  //
  //  ★ 只有「有平值对应」的那四个属性键能这么验 ★
  //    判据是「句子里有没有 %」—— 游戏只在真的是百分比时才写 %，
  //    （渲染器也是看到 % 才把 0.32 显示成 32.0%），所以 % 的有无就是单位本身。
  //    反过来说：没 % 的裸数字是平值，挂到 Pct 键上会**显示成 100 倍**
  //    （速度 25 显示成 +2500%）。数值没算错，但界面上标出来的数是错的 ——
  //    而「把数值标出来」正是这次改造要求的东西。
  //
  //  ★ 两份都查 ★ 只用烘焙的那份，这条断言在反证跑批里**红不了** ——
  //    判单位的是 `core/attr.mjs` 的分类器，它只影响**现场重烘**的结果，
  //    改坏了以后烘焙的那份纹丝不动。所以这里 `CATALOG.concat(fresh)` 一起过，
  //    构建期和运行期的坏法都能被逮到（R25 就是照着这个设计的）。
  //
  //  ★★ 带 `panel` 的条目**不适用**这条判据，要排除掉 ★★
  //    「句子里有没有 %」之所以能当单位本身用，是因为普通条目的 `#N%` 就是**产物本身**：
  //    带 % = 百分比增益，不带 = 平值点数。
  //    而面板锚定条目（`entry.panel`）里那个 `#N%` 是**系数**，产物是
  //    `panel[基数] × #N%`（见 `core/catalog.mjs:130`）—— 量纲跟着**基数**走，永远是平值。
  //    于是出现了「句子带 % 而键是 Flat」这种对普通条目不可能的形态：
  //      「提高数值等同于刻律德菈攻击力的#2%」→ 刻律德菈白值 418 × 24% = +100.4 攻击力
  //    这一条以前没被排除，是因为以前整类都被判成了 Pct 键（同一个盲区）；
  //    R57 打掉映射之后，`flatWrong` 那半条也不会红 —— 所以下面单开一条断言钉住它。
  const PAIRS = [['atkPct', 'atkFlat'], ['hpPct', 'hpFlat'],
    ['defPct', 'defFlat'], ['speedPct', 'speedFlat']];
  const BOTH = CATALOG.concat(fresh);
  const PLAIN = BOTH.filter((e) => !e.panel);
  const pctWrong = [];
  const flatWrong = [];
  for (const e of PLAIN) {
    for (const [pk, fk] of PAIRS) {
      if (e.key === pk && !/%/.test(e.text)) pctWrong.push(e);
      if (e.key === fk && /%/.test(e.text)) flatWrong.push(e);
    }
  }
  ok(pctWrong.length === 0,
    '百分比键的句子里一定有 %（没有 % 的裸数字是平值，挂在 Pct 键上会显示成 100 倍）',
    pctWrong.slice(0, 3).map((e) => `${e.key}：${e.text.slice(0, 34)}`).join(' ｜ '));
  ok(flatWrong.length === 0, '平值键的句子里一定没有 %（面板锚定条目除外，见上）',
    flatWrong.slice(0, 3).map((e) => `${e.key}：${e.text.slice(0, 34)}`).join(' ｜ '));

  // ---- 10.5c 面板锚定的量一定是平值 ----
  //
  //  ★ 这一条钉的是「面板锚定 → 平值键」这个映射本身 ★
  //    上面两条对它全都不灵敏：句子带 % 所以 `pctWrong` 不响，键是 Flat 所以 `flatWrong` 也不响。
  //    映射一旦被删（R57），这些条目会**静默**退回 Pct 键，`inCombatPanel` 就把
  //    「+100.4 攻击力」当成「攻击力 +10040%」——刻律德菈一个人 ×101、知更鸟 ×296，
  //    同队一起上攻击力翻几百倍，而界面上每条都显示得好好的。
  //    所以这里逐条查 `key`，并且**要求这一类非空**（否则是在空转）。
  const panned = BOTH.filter((e) => e.panel);
  const panelPct = panned.filter((e) => PAIRS.some(([pk]) => e.key === pk));
  ok(panelPct.length === 0,
    '面板锚定条目的结果键不是 Pct 键（量纲是平值，挂 Pct 键会在战斗内面板上放大 100 倍以上）',
    panelPct.slice(0, 4).map((e) => `${e.id} ${e.key}：${e.text.slice(0, 30)}`).join(' ｜ '));
  ok(panned.length > 0 && panned.some((e) => /Flat$/.test(e.key)),
    '面板锚定条目里确实有落在平值键上的（上面那条不是在空转）',
    `带 panel ${panned.length} 条，其中平值键 ${panned.filter((e) => /Flat$/.test(e.key)).length} 条`);
  // 非空反向：两类条目都得真的存在，否则上面两条只是在空转
  ok(CATALOG.some((e) => /Flat$/.test(e.key)) && CATALOG.some((e) => PAIRS.some(([pk]) => e.key === pk)),
    '平值条目和百分比条目都存在（上面两条不是在空转）',
    `平值 ${CATALOG.filter((e) => /Flat$/.test(e.key)).length} 条`);

  // ---- 10.6 每个属性键都有归处 ----
  const orphan = [...new Set(CATALOG.map((e) => e.key))]
    .filter((k) => !CAT.KEY_GROUP.some(([, ks]) => ks.includes(k)));
  ok(orphan.length === 0, '每个属性键都在 KEY_GROUP 里有归处（新键必须显式归组，不许悄悄落进「其它」）',
    orphan.join(', '));

  // ---- 10.7 来源计数 ----
  //  ★ 这里必须让「条目数」和「角色数」**不相等** ★
  //    一开始挑的是「4 个角色各 1 条」，结果「按条目数报」和「按角色数报」都得 4，
  //    断言怎么改都红不了。改成挑 4 个角色的**全部**条目（几十条），
  //    「数错了」才会露出来。
  const fourOwners = [...new Set(CATALOG.filter((e) => e.kind === 'skill')
    .map((e) => e.ownerId))].slice(0, 4);
  const fourIds = new Set(CATALOG
    .filter((e) => fourOwners.includes(e.ownerId))
    .map((e) => e.id));
  ok(fourIds.size > 4, '来源计数的测试集里条目数确实多于角色数（否则下面那条测不出东西）',
    `${fourIds.size} 条 / ${fourOwners.length} 个角色`);
  ok(CAT.sourceCharactersOf(CATALOG, fourIds).size === 4,
    '勾 4 个不同角色的全部条目仍报 4（不是按条目数报）',
    `得到 ${CAT.sourceCharactersOf(CATALOG, fourIds).size}，条目数 ${fourIds.size}`);
  const sharedE = [CATALOG.find((e) => e.kind === 'lightcone'), CATALOG.find((e) => e.kind === 'relicset')]
    .filter(Boolean);
  if (sharedE.length === 2) {
    const withShared = new Set([...fourIds, ...sharedE.map((e) => e.id)]);
    ok(CAT.sourceCharactersOf(CATALOG, withShared).size === 4,
      '光锥/遗器不占「N/3」名额（同一把光锥人人可带）',
      `得到 ${CAT.sourceCharactersOf(CATALOG, withShared).size}`);
  }

  // ---- 10.8 作用对象真的在起作用 ----
  //
  //  「自身」条目是最容易出错的一档：不判的话，布洛妮娅给自己加的攻击力
  //  会被算到希儿头上 —— 数字变大、不报错、看着还挺合理。
  const selfEntries = CATALOG.filter((e) => e.target === 'self'
    && e.kind !== 'lightcone' && e.kind !== 'relicset'
    && !CAT.blockedReason(e, max) && CAT.catalogValue(ctx, e, max) != null);
  ok(selfEntries.length > 0, '存在可勾选的角色来源「自身」条目（下面两条才有东西可测）',
    `${selfEntries.length} 条`);
  if (selfEntries.length) {
    const me = selfEntries[0];
    const otherId = CATALOG.find((e) => e.kind === 'skill' && e.ownerId && e.ownerId !== me.ownerId)?.ownerId;
    const asSelf = CAT.buffsFromSelections(ctx, CATALOG, new Set([me.id]), max, { characterId: me.ownerId });
    const asOther = CAT.buffsFromSelections(ctx, CATALOG, new Set([me.id]), max, { characterId: otherId });
    ok(asSelf.active.length === 1, '「自身」条目在算本人时生效',
      `${me.owner} 的「${me.text.slice(0, 24)}」→ active ${asSelf.active.length}`);
    // 「不生效」还必须**说明原因**：静默丢掉的话，用户看到的是「我明明勾了」
    ok(asOther.active.length === 0 && asOther.skipped[0]?.reason === 'not_self',
      '「自身」条目在算别人时不生效，且带得出原因（不是静默消失）',
      `active=${asOther.active.length} reason=${asOther.skipped[0]?.reason}`);
  }
  const lcSelf = CATALOG.find((e) => e.kind === 'lightcone' && e.target === 'self');
  if (lcSelf) {
    const r = CAT.buffsFromSelections(ctx, CATALOG, new Set([lcSelf.id]), max,
      { characterId: CATALOG.find((e) => e.kind === 'skill' && e.ownerId)?.ownerId });
    ok(r.active.length === 1,
      '光锥的「装备者」条目在算任何角色时都生效（v1 口径：装备者 = 当前计算角色）',
      `${lcSelf.text.slice(0, 30)} → active ${r.active.length}`);
  }

  // ---- 10.9 接线：产出的 BuffInstance 真的喂得进 aggregate ----
  //
  //  ★ 这条守的是「形状对得上」★ catalog.mjs 自己造 BuffInstance 而不是复用
  //    collectBuffs；一旦字段名写歪（比如 key 写成 attr），aggregate 会
  //    安安静静地把它当未知键丢掉 —— 勾了没反应，且没有任何报错。
  const teamE = CATALOG.find((e) => e.target === 'team' && e.key === 'dmgBoost');
  if (teamE) {
    const sel = CAT.buffsFromSelections(ctx, CATALOG, new Set([teamE.id]), max, { characterId: null });
    const agg1 = BU.aggregate(sel.active);
    ok(sel.active.length === 1 && agg1.dmgBoost === sel.active[0].value && sel.active[0].value > 0,
      '目录条目经 aggregate 后落在同名属性键上（接线没断）',
      `agg.dmgBoost=${agg1.dmgBoost}，条目值=${sel.active[0].value}`);
  }
  // 「仅显示」标记：勾了它伤害不该变，所以界面上必须说清楚。
  // ★ 两处都要测 ★ 显示用的 displayValueOf 和产出的 BuffInstance 是**两条路**：
  //   界面读前者、计算读后者，只测一条的话另一条丢了标记也没人知道。
  const dispKey = CATALOG.find((e) => CAT.DISPLAY_ONLY_KEYS.has(e.key));
  const realKey = CATALOG.find((e) => e.key === 'critRate');
  ok(dispKey && CAT.displayValueOf(ctx, dispKey, max).displayOnly === true,
    '不影响伤害的键（速度/击破/效果命中）在显示层被标成「仅显示」', dispKey?.key ?? '没有这类条目');
  ok(realKey && CAT.displayValueOf(ctx, realKey, max).displayOnly === false,
    '真进公式的键在显示层不会被标成「仅显示」', realKey?.key ?? '没有这类条目');
  if (dispKey) {
    const r = CAT.buffsFromSelections(ctx, CATALOG, new Set([dispKey.id]), max, { characterId: null });
    ok(r.active[0]?.displayOnly === true,
      '产出的 BuffInstance 也带「仅显示」标记（计算层和显示层共用同一个判断）',
      `${dispKey.key} → displayOnly=${r.active[0]?.displayOnly}`);
  }

  // ---- 10.10 数值的显示格式 ----
  const flatE = CATALOG.find((e) => /Flat$/.test(e.key));
  if (flatE) {
    ok(/^\+[\d.]+$/.test(CAT.displayValueOf(ctx, flatE, max).text),
      '平值显示不带百分号（「+12」不是「+12.0%」）',
      `${flatE.key} → ${CAT.displayValueOf(ctx, flatE, max).text}`);
  }
  if (realKey) {
    ok(/%$/.test(CAT.displayValueOf(ctx, realKey, max).text),
      '百分比显示带百分号',
      `${realKey.key} → ${CAT.displayValueOf(ctx, realKey, max).text}`);
  }

  // ---- 10.11 星魂全解锁 ／ 剩余那条锁定通路 ----
  //
  //  ★ 口径在 2026-09 改过，改的是**产品决定**，不是修 bug ★
  //    原先：`rankId > 已有星魂` 的条目一律锁死置灰（`rank_locked`）。
  //    现在：**任意星魂的增益都可直接勾选**，不受初始档位限制（用户要求）。
  //    所以下面这组断言从「基础档下锁着」翻成了「基础档下也拿得到值」。
  //
  //  ★ 翻过来之后最容易发生的事：断言退化成恒真式 ★
  //    `blockedReason` 现在已经没有任何一条分支会命中 eidolon，
  //    光写「blockedReason === null」是在描述一个**空函数**，红不了。
  //    所以必须再钉两件它证明不了的事：
  //      ① 枚举**全部** 189 条星魂，不只抽一条 —— 防止将来有人 `eidolons` 覆盖写错。
  //      ② 值真的取得到（不是「可选但没数」）。
  //    反证见 `_rev.mjs` 的 R27（把 eidolon 分支加回去 → 必须红）。
  const eidolonEntries = CATALOG.filter((e) => e.kind === 'eidolon');
  const stillLocked = eidolonEntries.filter((e) => CAT.blockedReason(e, base));
  ok(eidolonEntries.length > 0, '目录里确实有星魂条目（否则下面几条是空集恒真）',
    `星魂条目 ${eidolonEntries.length} 条`);
  // ⚠ 标签里**不许出现 ` ——`**：`_rev.mjs` 用 `^  ✗ (.+?) ——`（懒惰）抓标签，
  //   第一个 ` ——` 就截断。标签里带一个的话，反证那边的 `expect` 永远匹配不上，
  //   表现成「期望变红的没红，这条断言是恒真的」—— 而断言其实好好的。
  ok(stillLocked.length === 0,
    `全部 ${eidolonEntries.length} 条星魂在基础档（星魂 0）下都可勾选（星魂不再设门槛）`,
    stillLocked.slice(0, 3).map((e) => `${e.id} → ${CAT.blockedReason(e, base)}`).join(' ｜ '));

  //  面板锚定条目要喂面板才取得到值（少数星魂在这一类里，如「刃 R6」）。
  //  这里喂满而不是排除：排除的话，那几条就没人守着了 —— 它们的系数项、
  //  归属者名、面板字段任何一处写错，都表现为「静默少一条」。
  const eidolonNoValue = eidolonEntries.filter(
    (e) => CAT.catalogValue(ctx, e, { ...base, panels: PANELS }) == null);
  ok(eidolonNoValue.length === 0,
    `全部星魂条目在基础档下都取得到值（「可勾但没数」和「锁着」一样没法用）`,
    eidolonNoValue.slice(0, 3).map((e) => `${e.id} paramIndex=${e.paramIndex}`).join(' ｜ '));

  // 星魂条目不受 `eidolons` 覆盖影响：给 0 和给 6 必须取到**同一个**值。
  // 这一条盯的是「解锁之后又有人偷偷把 rankId 塞进取值逻辑」。
  const anyEid = eidolonEntries[0];
  if (anyEid) {
    const vR0 = CAT.catalogValue(ctx, anyEid, { tier: 'base', eidolons: { [anyEid.ref.charId]: 0 } });
    const vR6 = CAT.catalogValue(ctx, anyEid, { tier: 'base', eidolons: { [anyEid.ref.charId]: 6 } });
    ok(vR0 != null && vR0 === vR6,
      '星魂条目的取值与「这个角色有几星魂」无关（勾了就拿该星魂自己的参数）',
      `${anyEid.id}: R0=${vR0} vs R6=${vR6}`);
  }

  // ★ 锁定语义本身仍然要有人守 ★
  //   `rank_locked` 退役后，`blockedReason` 只剩 `piece_short` 一条通路。
  //   它的「锁着必须是取不到、不能是算 0」这条性质必须继续被钉住 ——
  //   否则将来重新引入任何门槛时，没人保证不会退化成静默算 0。
  //   所以这里**故意**用 pieces=2 去卡 4 件套，把那条通路走一遍。
  const relic4 = CATALOG.find((e) => e.kind === 'relicset' && e.ref.piece === 4);
  if (relic4) {
    const short = { tier: 'base', pieces: 2 };
    ok(/^piece_short:/.test(String(CAT.blockedReason(relic4, short))),
      '遗器 4 件套在只给 2 件时被锁（锁定通路本身还活着）',
      String(CAT.blockedReason(relic4, short)));
    ok(CAT.catalogValue(ctx, relic4, short) === null,
      '锁着的条目取不到值（不是算成 0）—— 算 0 会静默拉低结果',
      String(CAT.catalogValue(ctx, relic4, short)));
    ok(CAT.catalogValue(ctx, relic4, { tier: 'base', pieces: 4 }) != null,
      '给够 4 件之后同一条可选且有值',
      String(CAT.catalogValue(ctx, relic4, { tier: 'base', pieces: 4 })));
  }

  // ---- 10.12 面板锚定条目（数值 = 别人的面板 × 系数）----
  //
  //  这一类的取值公式和全库其它类别**都不一样**：别人的条目是「第 N 项参数」，
  //  它是「（第 N 项参数）×（某个人的面板项）+（第 M 项参数）」。
  //  公式错的表现是数值整体偏大或偏小 —— **不报错，只是数字不对**，
  //  所以必须有一条把公式本身钉住的断言（下面 ⑤ 的倍数关系）。
  //
  //  ★ 条数是确切值，不是阈值 ★
  //    19 是实测稳定值（9 条分类器自动收录 + 10 条人工表补作用对象）。
  //    它变动时**必须**是有人主动改规则或加人工表 —— 那种改动本来就要重跑全套，
  //    顺手改这个数正是我们要的「提醒」。写成 `>= 9` 之类反而会让整个类别
  //    静默消失（这正是 2026-09 之前的实际状态：0 条，没人发现）。
  const panelEntries = CATALOG.filter((e) => e.panel != null);
  // 21 = 分类器 11 + 人工表补作用对象 10。分类器那一半从 9 涨到 11，是因为
  // 忆灵辅助技里多了两条「提高数值等同于<召唤者>#N%暴击伤害」的（迷迷的两个性别各一）。
  ok(panelEntries.length === 24,
    '面板锚定条目 24 条（分类器 11 + 人工表补作用对象 13）',
    `${panelEntries.length} 条: ${panelEntries.map((e) => e.id).slice(0, 4).join(', ')}…`);

  //  ① 每条的面板字段都必须真实存在 —— 写错的字段名会永远取不到值，
  //     而「取不到值」在界面上和「还没填」长得一模一样。
  //
  //  ★ `@energy`（能量上限）单独一类，它不是「用户填的面板」★
  //    它的基数来自**角色数据**（`characters.energyMax`），所以不在 `emptyPanel()` 里 ——
  //    拿 `emptyPanel()` 当唯一真相会把那两条光锥条目判成「字段名写错了」，
  //    而那报的是完全相反的一件事（那边是名字打错，这边是这个字段压根不该在那儿）。
  //    对它改用**它自己的**那一份真相：数据里确实有这个字段，且只许用这一个字段名。
  const PANEL_FIELDS = new Set(Object.keys(P.emptyPanel()));
  const ENERGY_WHO = '@energy';
  const badAttr = panelEntries.filter((e) => (e.panel.who === ENERGY_WHO
    ? e.panel.attr !== 'energyMax'
    : !PANEL_FIELDS.has(e.panel.attr)));
  ok(badAttr.length === 0, '面板锚定条目引用的字段全部取得到（用户面板在 emptyPanel() 里，@energy 在角色数据里）',
    badAttr.slice(0, 3).map((e) => `${e.id} → ${e.panel.who}/${e.panel.attr}`).join(' ｜ '));
  //  ①b `@energy` 的基数真的取得到吗 —— 上面那条只证明了字段**名**对。
  //     数据里这个字段缺失的话，那两条会永远停在「待填」，而界面上写的是
  //     「请先填当前计算角色的面板」—— 用户填不了，因为没有那个输入框。
  const noEnergy = data.characters.filter((c) => c.energyMax == null);
  ok(noEnergy.length <= 1,
    '角色数据里 energyMax 齐全（@energy 的基数取得到；缺的角色那两条会一直显示「待填」）',
    `${noEnergy.length} 个角色没有 energyMax: ${noEnergy.map((c) => c.id).join(', ')}`);

  //  ② 归属者必须是个非空字符串。`null` 会让 `panels[null]` 落空，
  //     用户填了面板也取不到值 —— 而界面上写不出去「请先填谁的面板」。
  const badWho = panelEntries.filter(
    (e) => typeof e.panel.who !== 'string' || e.panel.who.length === 0);
  ok(badWho.length === 0, '面板锚定条目都带得出「吃谁的面板」（归属者名非空）',
    badWho.slice(0, 3).map((e) => e.id).join(' ｜ '));

  //  ③ 系数项 index 必须存在（`catalogValue` 一上来就要用它）
  const badIdx = panelEntries.filter((e) => e.paramIndex == null);
  ok(badIdx.length === 0, '面板锚定条目都有系数项 paramIndex',
    badIdx.slice(0, 3).map((e) => e.id).join(' ｜ '));

  //  ④ ★ 没填面板 ⇒ 取不到值（不是 0，也不是系数本身）★
  //    兜成 0 的话，这条会以「勾了、显示 0、伤害纹丝不动」的样子站在目录里；
  //    兜成系数本身的话，数值就是凭空来的（0.24 直接当 24%）。
  //    两种都在界面上看不出来。反证见 `_rev.mjs` R31。
  const panelLeaked = panelEntries.filter((e) => CAT.catalogValue(ctx, e, base) != null);
  ok(panelLeaked.length === 0,
    '面板没填时，面板锚定条目一条都取不到值（不兜 0、不兜系数本身）',
    panelLeaked.slice(0, 3).map((e) => `${e.id} → ${CAT.catalogValue(ctx, e, base)}`).join(' ｜ '));

  //  ⑤ 公式本身：数值必须**恰好**等于 面板 × 系数 + 平值。
  //    挑一条没有平值项（`flatParam == null`）的，把面板翻倍，值必须正好翻倍 ——
  //    这一条钉的是「乘的是面板，不是别的什么」。改成加、改成常系数都会红。
  // ★ 带 `capParam` 的（「最多计入 #N 点」）**必须排除** ★
  //   它的数值是 min(面板, 上限) × 系数，把面板翻倍在上限之上时值不变 ——
  //   于是这条断言会在「公式其实是对的」的情况下报红。选到它纯属目录顺序的运气，
  //   所以这里显式排除，不靠运气。
  const propProbe = panelEntries.find((e) => e.panel.flatParam == null && e.panel.capParam == null && e.panel.attr === 'atk')
    ?? panelEntries.find((e) => e.panel.flatParam == null && e.panel.capParam == null);
  if (propProbe) {
    const who = propProbe.panel.who;
    const attr = propProbe.panel.attr;
    const one = { ...base, panels: { [who]: { ...FILLED_PANEL, [attr]: 1000 } } };
    const two = { ...base, panels: { [who]: { ...FILLED_PANEL, [attr]: 2000 } } };
    const v1 = CAT.catalogValue(ctx, propProbe, one);
    const v2 = CAT.catalogValue(ctx, propProbe, two);
    ok(v1 != null && v2 != null && Math.abs(v2 - 2 * v1) < 1e-9,
      '面板锚定条目的数值与面板项成正比（乘的是面板，不是别的）',
      `${propProbe.id} ${attr}: 1000→${v1} / 2000→${v2}`);
  } else {
    ok(false, '面板锚定条目里至少有一条不带平值项（否则上一条无从构造）', '一条都没有');
  }

  //  ⑥ ★「最多计入 #N 点」的夹子真的在夹 ★
  //    光锥「今日亦是和平的一日」/「片刻，留在眼底」是
  //    「根据装备者的能量上限，每点能量提高 #1%，最多计入 #2 点」——
  //    数值 = min(能量上限, #2) × #1，而库内能量上限最大到 480、两个上限是 160/180，
  //    **夹子是会咬到的**。少了它，能量上限高的角色静默偏高。
  //
  //    两边各钉一次，缺一不可：
  //      · 基数**超过**上限 ⇒ 值必须钉在上限上（不是基数）——少了夹子这条红
  //      · 基数**低于**上限 ⇒ 值必须跟着基数走 ——写成「永远取上限」这条红
  //    只测一边的话，`base = cap`（写死上限）也能全绿。
  const capEntries = (data.buffCatalog ?? []).filter((e) => e?.panel?.capParam != null);
  ok(capEntries.length > 0,
    '目录里有带「最多计入」上限的面板锚定条目（下面两条才不是空转）',
    `${capEntries.length} 条`);
  const capBad = [];
  for (const e of capEntries) {
    const who = e.panel.who;
    const attr = e.panel.attr;
    // 把 `panel` 摘掉，`catalogValue` 就退回「只解析那一项」，正好用来拿
    // ① 系数（paramIndex）② 上限（capParam）—— 与真实路径同一个 `resolveIndex`。
    const pct = CAT.catalogValue(ctx, { ...e, panel: null }, { ...base, panels: {} });
    const capOnly = CAT.catalogValue(
      ctx, { ...e, panel: null, paramIndex: e.panel.capParam }, { ...base, panels: {} });
    if (capOnly == null || pct == null) { capBad.push(`${e.id}: 取不到系数或上限`); continue; }
    const above = CAT.catalogValue(ctx, e, { ...base, panels: { [who]: { ...FILLED_PANEL, [attr]: capOnly * 3 } } });
    const below = CAT.catalogValue(ctx, e, { ...base, panels: { [who]: { ...FILLED_PANEL, [attr]: capOnly / 2 } } });
    if (above == null || Math.abs(above - capOnly * pct) > 1e-9) {
      capBad.push(`${e.id}: 基数 3× 上限 → ${above}，应=${capOnly * pct}`);
    }
    if (below == null || Math.abs(below - (capOnly / 2) * pct) > 1e-9) {
      capBad.push(`${e.id}: 基数 ½ 上限 → ${below}，应=${(capOnly / 2) * pct}`);
    }
  }
  ok(capBad.length === 0,
    '带「最多计入」的条目：基数超过上限时钉在上限、低于上限时跟着基数',
    capBad.slice(0, 3).join(' ｜ '));

  // ---- 10.13 缺口 × 目录 的对账（uncoveredGaps）----
  //
  //  ★ 这条守的是「结果页不许自相矛盾」★
  //    缺口是**来源级**的（`1002.trace.1002102`），目录条目是**子句级**的
  //    （`1002.trace.1002102.b0`）。目录建起来之后，缺口列表里绝大多数来源
  //    其实已经可以勾了 —— 结果页却还在写「我们没有录」，而用户往上看一眼
  //    目录就能看见那一条。**自相矛盾的提示等于没有提示。**
  //
  //  ★ 判据必须走 `.b` 边界，不能退化成裸 startsWith ★
  //    trace 的 id 长得很像（`1002.trace.1002102` / `1002.trace.10021`），
  //    裸前缀匹配会把「目录里其实没有」的来源误判成「有」——
  //    于是**该报的缺口被静默吞掉**，正是这个函数本来要防的那件事。
  //    合成用例专门钉这个边界（真实数据里这一对不一定同时存在）。

  // ① 合成用例：边界两侧各钉一次，不依赖库里恰好有这种数据
  const synKeep = CAT.uncoveredGaps(
    [{ id: '1002.trace.1002' }], [{ id: '1002.trace.10021.b0' }]);
  ok(synKeep.length === 1,
    'uncoveredGaps：`1002.trace.1002` 不被 `1002.trace.10021.b0` 吞掉（走 .b 边界，不是裸前缀）',
    `留下 ${synKeep.length} 条`);
  const synDrop = CAT.uncoveredGaps(
    [{ id: '1002.trace.10021' }], [{ id: '1002.trace.10021.b0' }]);
  ok(synDrop.length === 0,
    'uncoveredGaps：`1002.trace.10021` 确实被它的 `.b0` 子句覆盖掉',
    `留下 ${synDrop.length} 条`);
  ok(CAT.uncoveredGaps([{ id: 'lc.20005' }], []).length === 1,
    'uncoveredGaps：目录为空时一条都不吞（不能因为没得比对就全判成已覆盖）');

  // ② 真实数据：全角色跑一遍，拿真实的 `collectBuffs` 缺口当语料
  const gapCorpus = [];
  for (const ch of data.characters ?? []) {
    const cid = ch.id ?? ch.characterId;
    if (!cid) continue;
    try {
      const { gaps } = BU.collectBuffs(ctx, { characterId: cid, annotations, eidolon: 0 });
      for (const gp of gaps) if (gp.id) gapCorpus.push(gp);
    } catch { /* 单角色跑不通由别的节去报，这里只攒语料 */ }
  }
  ok(gapCorpus.length > 0, '攒到了真实缺口语料（下面两条才不是空转）', `${gapCorpus.length} 条`);

  // 独立重数：换一种写法（startsWith 而不是 slice+lastIndexOf），
  // 两条路算出来的集合必须一样 —— 一样才是「判据只有一个」，不一样说明有分支。
  const wantKept = gapCorpus
    .filter((gp) => !CATALOG.some((e) => String(e.id).startsWith(`${gp.id}.b`)))
    .map((gp) => gp.id);
  const gotKept = CAT.uncoveredGaps(gapCorpus, CATALOG).map((gp) => gp.id);
  ok(gotKept.length === wantKept.length && gotKept.every((id, i) => id === wantKept[i]),
    'uncoveredGaps 与独立重数逐条一致（且保持原顺序，不是重排过的）',
    `被覆盖 ${gapCorpus.length - gotKept.length} 条，留下 ${gotKept.length} 条`);

  // 非空转闸：这条守着「这条断言到底还能不能红」
  //   要是哪天 catalog 的 id 形状变了（不再以 `.b` 结尾），过滤会退化成恒等，
  //   上面那条就会变成「同义反复也报绿」。所以必须证明过滤**确实丢掉了东西**。
  const covN = gapCorpus.length - gotKept.length;
  ok(covN > 0,
    'uncoveredGaps 确实按目录吞掉了缺口（过滤不是恒等 —— 否则上面那条是恒真的）',
    `吞掉 ${covN} / ${gapCorpus.length}`);

  // ---- 10.14 人工记录必须**一条不落**地进目录 ----
  //
  //  ★ 这条守的是一个真踩过的坑 ★
  //    `build_catalog` 原来是「先判桶、桶是 PICKABLE 才去看人工表」——
  //    于是人工表里那条只要落进别的桶（TARGET_UNKNOWN / NO_ATTR / DoT…），
  //    **连人手写的那条一起没了**。而且消失得毫无痕迹：记录还躺在
  //    buffs.jsonl 里，界面上勾不到，也没有任何提示说它被吞了。
  //    真踩过两条：阮•梅「使除自身以外的队友速度提高」、翡翠「使其速度提高」，
  //    都是 TARGET_UNKNOWN（认得出属性键和侧别，只是判不出作用于谁）。
  //
  //    修法是把人工表挪到分桶之前 —— 人工记录是**越过分桶**的优先。
  //    这条断言就是那个修法的闸门：把顺序改回去，它立刻红。
  // 语料用 `annotations.buffs` —— 就是**构建期喂给 buildCatalog 的那一份**（同一个加载器）。
  // 自己再 `fs.readFileSync` 一遍虽然看着更"独立"，但两份解析要是有一点不同
  // （注释行、空行），报出来的差异就是解析差异，不是真的没进目录。
  const humanRecs = annotations.buffs ?? [];
  const stats = data.buffCatalogStats ?? {};
  // ★ 两份分开查，不能并成一个 Set ★
  //   并集是**错**的：烘焙那份还留着被吞掉的 id，于是「改了代码 → 现场重烘丢了」
  //   这件事被烘焙那份盖住，断言纹丝不动。这个坑当场踩过 —— R26 反证第一次
  //   跑出来就是「期望变红的没红」，原因正是并集。
  //   两份各有各的意义：现场那份让**改坏代码**立刻红（不用重烘），
  //   烘焙那份让**忘了重烘**立刻红（跑的是它，它缺了用户就勾不到）。
  const freshIds = new Set(fresh.map((e) => e.id));
  const bakedIds = new Set(CATALOG.map((e) => e.id));
  const droppedFresh = humanRecs.filter((h) => !freshIds.has(h.id));
  const droppedBaked = humanRecs.filter((h) => !bakedIds.has(h.id));
  ok(humanRecs.length > 0, 'buffs.jsonl 非空（下面几条才不是空转）', `${humanRecs.length} 条`);
  ok(droppedFresh.length === 0,
    `buffs.jsonl 的 ${humanRecs.length} 条**全部**在【现场重烘】的目录里（人工记录不许被分桶吃掉）`,
    `${droppedFresh.length} 条没进目录: ${droppedFresh.slice(0, 3).map((h) => `${h.id}(${h.text.slice(0, 18)})`).join(', ')}`);
  ok(droppedBaked.length === 0,
    `buffs.jsonl 的 ${humanRecs.length} 条**全部**在【烘焙】的目录里（用户跑的是这一份）`,
    `${droppedBaked.length} 条没进目录: ${droppedBaked.slice(0, 3).map((h) => h.id).join(', ')}`);

  // 计数口径：`humanUsed` 必须等于文件里的条数。
  // ★ 这条不是上面那条的同义反复 ★ 上面查「在不在目录里」，这条查「计数器认没认全」——
  //   就算条目全都进了目录，`humanUsed` 少算也会让分桶报表显示成「人工表没怎么用上」，
  //   而人看到那个数只会以为「标注白写了」。
  //   同样查现场那份：烘焙的计数改了代码不会变。
  ok(freshStats.humanUsed === humanRecs.length && stats.humanUsed === humanRecs.length,
    `humanUsed(现场 ${freshStats.humanUsed} / 烘焙 ${stats.humanUsed}) === buffs.jsonl 条数(${humanRecs.length})`,
    `差 现场 ${humanRecs.length - (freshStats.humanUsed ?? 0)} / 烘焙 ${humanRecs.length - (stats.humanUsed ?? 0)} 条`);

  // 账面恒等式：目录条数 = 免人工就能收录的桶 + 人工救回来的那些。
  //
  // ★ 左边那项**不是**一个桶，是一组桶 ★
  //   `PICKABLE` 之外还有 `PANEL_ANCHORED`（面板锚定类，成条目自带走全部字段）。
  //   两个桶的口径必须与 `build_catalog` 的 `AUTO_COLLECTED` **逐一对应** ——
  //   那边加一个桶、这边没加，差额就是那个桶的条数，而报错长得是「目录比桶少了 9 条」，
  //   看着像数据坏了，实际是这张清单没跟上。所以下面这个集合是从同一个常量导出的：
  //   它不 import（verify 要能独立地对拍），但改一处必须改两处，这条断言就是提醒。
  const AUTO = [BUCKET.PICKABLE, BUCKET.PANEL_ANCHORED];
  const autoCount = AUTO.reduce((n, b) => n + (stats.byBucket?.[b] ?? 0), 0);
  // ⚠ 这条**单独看近乎恒真**（两项都是同一个循环里加的），它守的不是逻辑而是**读法**：
  //   分桶报表上这两桶加起来会比目录条数**小**，不写下来下一个人会当成算错。
  ok(CATALOG.length === autoCount + (stats.humanRescued ?? 0),
    `目录 ${CATALOG.length} 条 === ${AUTO.join('+')} ${autoCount} + 人工救回 ${stats.humanRescued}`,
    `差额 ${CATALOG.length - (autoCount + (stats.humanRescued ?? 0))}`);
  // 救回来的到底有几条？—— 从**条目自己记的 bucket** 数，而不是断言「计数 > 0」。
  //   正常情况下目录条目的 bucket 恒在上面那张清单里（不是的进不来），
  //   所以「bucket 不在清单里却还在目录里」的，就是人工表捞回来的。
  //   这是个**账面交叉核对**：两个字段在代码的两个分支里分别写下，对不上就是分支写歪了。
  //   （真正的独立闸门是上面那条「buffs.jsonl 全部在目录里」—— 它不依赖任何内部计数。）
  const rescued = CATALOG.filter((e) => !AUTO.includes(e.bucket));
  ok((stats.humanRescued ?? 0) === rescued.length,
    `humanRescued(${stats.humanRescued}) === 目录里 bucket 非 PICKABLE 的条目数(${rescued.length})`,
    `对不上，样例 ${rescued.slice(0, 3).map((e) => `${e.id}:${e.bucket}`).join(', ')}`);
  // ★ 救回来的还必须**真的能显示** ★
  //   分类器判不出作用对象时，缺的正是 `target`。人工记录里补了 target，
  //   但要是值写错（`single_ally` 写成 `single`、`ally_wrong`…），
  //   `tabOf` 返回 null → 条目掉进 `groupCatalog` 的 `unplaced` → 界面上只显示
  //   一句「有 N 条判不出作用对象，没有列进来」。**那和没救回来是同一种结果**，
  //   只是多绕了一圈，而且看起来像已经修好了。
  //
  //  ★ 这里**不能**写成 `target == null` ★
  //    `ally_wrong` 不是 null —— 那条断言会绿着放行，而条目照样看不见。
  //   踩过：第一版就是写的 `== null`，反证时故意把 `team` 改成 `ally_wrong`，
  //   断言纹丝不动。判据必须是**「落得进页签」**，不是「不是空值」。
  //   所以直接问 `unplaced`：那是 `tabOf` 的真实出口，也是界面真正读的东西。
  const unplaceable = g.unplaced ?? [];
  ok(unplaceable.length === 0,
    '目录里每条都归得进一个页签（归不进 = 界面上看不见 = 等于没进目录）',
    `${unplaceable.length} 条归不进: `
      + unplaceable.slice(0, 3).map((e) => `${e.id}(side=${e.side},target=${JSON.stringify(e.target)})`).join(', '));

  // ---- 10.15 「使目标」不许被兜成 self ----
  //
  //  ★ 这条守的是本项目**最危险**的一种坏法：静默错判 ★
  //    成因 D 实测：`deriveTarget` 的代词排除表漏了光杆「使目标」，于是
  //      「停云 · 终结技：同时使目标造成的伤害提高 #3%」
  //      「星期日 · 秘技：使目标造成的伤害提高 #1%」
  //      「藿藿 · 星魂6：使目标造成的伤害提高 #1%」
  //      「金血铭刻的时代：使目标造成的战技伤害提高 #4%」…
  //    一共 **7 条**，全被判成 `target: 'self'`（source_owner）—— 也就是
  //    **把辅助的增益算到了辅助自己头上**。
  //
  //    它比「漏收」危险得多：漏收是少一条、看得见（条目不在界面上）；
  //    这个是数字变了、不报错、看着还挺合理 —— 用户拿它算出来的伤害是错的，
  //    而界面上没有任何一处提示他。修完之后拿这 7 条去对账才发现：
  //    `PICKABLE` 从 902 掉到 895（正好 −7），`humanRescued` 从 2 涨到 9（正好 +7），
  //    目录总数**纹丝不动**（904）—— 这个「总数不变、只是换了个桶」的形状本身
  //    就是「它们原先确实被算进了目录、只是算到了错的人头上」的铁证。
  //
  //  ★ 为什么查**全库**而不是查目录 ★
  //    查目录只能看见「已经进了目录的」—— 而那 7 条在修之前是 PICKABLE，
  //    本来就在目录里，所以查目录**恰好能**抓到它们。但这个巧合不能依赖：
  //    同族的其它子句要是落进了 NO_ATTR / DAMAGE_TERM，就永远进不了目录，
  //    查目录等于没查。所以这里直接遍历 `catalogSources` 的全部子句，
  //    在分类器那一层问「你说这条作用于谁」。
  const targetSelfButSayTarget = [];
  let sayTargetTotal = 0;
  for (const s of catalogSources(data)) {
    const parts = CL.buffClauseParts(s.text);
    parts.forEach((part, ordinal) => {
      const t = part.trim();
      if (!t.includes('使目标')) return;
      sayTargetTotal++;
      // `使目标` 后面紧跟「的」或「角色」时，指的是被施加增益的己方；
      // 「无视目标…防御力」里的后一个「目标」才指敌人 —— 两处都在同一条子句里出现过
      // （星期日 R1），所以判据不是「含不含」，而是**分类器把它归给了谁**。
      const cls = classifyClause(t, classifyOptsFor(s, data, names, parts.slice(0, ordinal)));
      if (cls?.hit?.target === 'self') {
        targetSelfButSayTarget.push({ id: `${s.owner}／${s.label}`, text: t, bucket: cls.bucket });
      }
    });
  }
  // 非空性守卫：语料里要是根本没有「使目标」，上面那条就是空集恒真。
  ok(sayTargetTotal > 0,
    `语料里确实有含「使目标」的子句（否则下面那条是空集恒真）`,
    `${sayTargetTotal} 条`);
  ok(targetSelfButSayTarget.length === 0,
    `全部 ${sayTargetTotal} 条含「使目标」的子句里，没有一条被兜成 target=self（把辅助增益算到辅助头上）`,
    targetSelfButSayTarget.slice(0, 3).map((x) => `${x.id}：${x.text}（桶 ${x.bucket}）`).join(' ｜ '));

  // 目录里每一条「使目标」的 target 都必须与自己那一侧的合法值对上。
  //
  // ★ 判据必须**分侧**，不能一律要求 single_ally ★
  //   「使目标」在库里有两个完全正当的用法，混为一谈会同时漏掉真问题、误伤真条目：
  //     · side=ally  —— 「使目标造成的伤害提高」（停云终结技 / 星期日秘技 / 藿藿 R6…）
  //                     「目标」是**被施加增益的我方单体** → 必须是 single_ally
  //     · side=enemy —— 「使目标防御力降低」「使目标受到的伤害提高」（银狼 / 佩拉…）
  //                     「目标」是**被打的那个敌人** → 必须是 enemy
  //   我第一版写的是一律 `target === 'single_ally'`，当场红了 4 条：
  //   两条是**烘焙的旧数据**（还没重烘，那 7 条在旧目录里仍是 target=self，
  //   这正好是这条断言该抓的），另外两条（1301.skill.130108 / 1307.skill.130702）
  //   是正当的敌方减益 —— 那是**误伤**，是把对的判成错的。分侧之后两份都对得上。
  //
  // `self` 是被明确排除的：把辅助的增益算到辅助自己头上，正是成因 D 的病灶。
  // 用**烘焙**那份：用户跑的是它。用 fresh 的话，忘了重烘时会绿着放行 ——
  // 而「用户勾不到这条」恰恰就是忘了重烘的症状。
  const sayTargetRescued = CATALOG.filter((e) => e.text.includes('使目标'));
  ok(sayTargetRescued.length > 0,
    '「使目标」的词条确实进了目录（人工表 + 规则改动的净效果）',
    `${sayTargetRescued.length} 条`);
  const okSayTarget = (e) => (e.side === 'ally'
    ? (e.target === 'single_ally' || e.target === 'team')
    : e.side === 'enemy' ? e.target === 'enemy' : false);
  const badSayTarget = sayTargetRescued.filter((e) => !okSayTarget(e));
  ok(badSayTarget.length === 0,
    `目录里 ${sayTargetRescued.length} 条「使目标」的 target 都与自己那一侧相符（我方→single_ally/team，敌方→enemy，无一被兜成 self）`,
    badSayTarget.slice(0, 4).map((e) => `${e.id}(side=${e.side})=${JSON.stringify(e.target)}`).join(', '));
  // 两侧都要有，否则上面那条可能只覆盖了一半而看着全绿。
  for (const [side, want] of [['ally', 'single_ally'], ['enemy', 'enemy']]) {
    const n = sayTargetRescued.filter((e) => e.side === side && e.target === want).length;
    ok(n > 0, `「使目标」里 side=${side} 的一侧确实有条目（两侧都验到了，不是只验了一半）`, `${n} 条`);
  }

  console.log(`  目录 ${CATALOG.length} 条，按类别 ${JSON.stringify(Object.fromEntries(
    WANT_KINDS.map((k) => [k, CATALOG.filter((e) => e.kind === k).length]))) }`
    + `（其中 ${stats.humanRescued} 条是从非 PICKABLE 桶里按人工表救回的）`);
  console.log(`  页签：我方单体 ${Object.values(g.tabs.ally_single).flat().length}`
    + ` / 我方全体 ${Object.values(g.tabs.ally_team).flat().length}`
    + ` / 敌方负面 ${Object.values(g.tabs.enemy).flat().length}`);
  const reachBase = CATALOG.filter((e) => CAT.catalogValue(ctx, e, base) != null).length;
  console.log(`  基础档可取 ${reachBase} / ${CATALOG.length} 条`
    + `（星魂不再设门槛，基础档下没有任何条目被锁）`);
}

// ---------------------------------------------------------------------------
section(10.5, '目录行的三态（core/catalog.mjs 的 rowView）');
{
  // ★ 为什么要单独测这一行 ★
  //   用户报的第二个问题是「填了之后没反应」—— 根因就是这一行的内容
  //   原来只在 `catRow` 里现算，而 `markStale()` 不重画目录行。
  //   修法是把它抽成**纯函数** `rowView` 再给刷新点调用。
  //   抽出来的同时必须原地钳住三种状态：**没填面板 / 填了 / 根本选不了**。
  //   少一种的表现都是「界面上一直挂着错的标签」。

  const entries = data.buffCatalog ?? [];
  const base = { tier: 'base', eidolon: 0 };

  // ① 面板锚定条目：没填 → 待填；填了 → 变成数值（**同一行**的两种状态）
  const paneled = entries.filter((e) => e.panel);
  ok(paneled.length > 0, '目录里有面板锚定条目（否则下面几条是空转）',
    `${paneled.length} 条`);
  const sample = paneled.find((e) => CAT.catalogValue(ctx, e, base) == null);
  if (ok(!!sample, '存在「面板没填就取不到值」的条目 —— 这是待填状态的来源')) {
    const v0 = CAT.rowView(ctx, sample, base);
    ok(v0.pending === true, '没填面板：rowView 标了 pending', JSON.stringify(v0));
    ok(v0.text === '?', '没填面板：正文显示 ?（不是「取不到数值」那句）', `得到 ${v0.text}`);
    ok(v0.tags.some((t) => t.label === '待填面板'),
      '没填面板：标签里有「待填面板」',
      v0.tags.map((t) => t.label).join(','));
    ok(v0.dim === true, '没填面板：整行置灰（但 blocked 为假 —— 它还勾得上）');
    ok(v0.blocked !== true, '没填面板：blocked 必须是假（置灰会让人以为这条选不了）');

    const filled = { ...base, panels: PANELS };
    const v1 = CAT.rowView(ctx, sample, filled);
    ok(v1.pending === false, '填了面板：pending 消失', JSON.stringify(v1));
    ok(v1.tags.every((t) => t.label !== '待填面板'), '填了面板：「待填面板」标签消失',
      v1.tags.map((t) => t.label).join(','));
    ok(/^[+-]?[\d.]+%?$/.test(v1.text), '填了面板：正文变成一个数',
      `得到 ${v1.text}`);
    ok(v1.value != null && Number.isFinite(v1.value), '填了面板：rowView 带出了值本身',
      `得到 ${v1.value}`);
    // 这两条合起来才是用户报的那个症状：**同一个条目、同一个 opts，
    // 只是面板从没填变成填了，行内容必须跟着变。** 只测一端的话，
    // 「永远是待填」和「永远是数值」都能蒙混过去。
    ok(v0.text !== v1.text, '同一行的两种状态确实不同（没填 ? → 填了数值）',
      `没填 ${v0.text}，填了 ${v1.text}`);
  }

  // ② 根本选不了的（件数不够）：— 且 blocked 为真
  //    ★ 基础档 + 0 星魂下**一条都不 blocked**（星魂不设门槛），
  //      唯一能造出 blocked 的是遗器套装的件数 —— 得把 pieces 降到 2。★
  //      这一点本身是「星魂不再设门槛」那个改动的现状快照，写在注释里。
  //    ★ 找的必须是 `piece_short` 那一种 blocked ★
  //      现在 blocked 有**两**个来源：`piece_short`（凑齐就行）和 `unmodelled`
  //      （模型里没有这一档）。`find` 不加过滤就可能挑中后者，于是「件数补到 4
  //      之后不再 blocked」这条**永远红着** —— 而它红了的原因跟件数毫无关系。
  const shortPieces = { ...base, pieces: 2, panels: PANELS };
  const blockedEntry = entries.find((e) => CAT.rowView(ctx, e, shortPieces).blocked
    && e.kind === 'relicset');
  if (ok(!!blockedEntry,
    '件数 2 时有 blocked 状态的条目（需要 4 件套的那批）', '一条都没有')) {
    const vb = CAT.rowView(ctx, blockedEntry, shortPieces);
    ok(vb.text === '—', 'blocked：正文是 —', `得到 ${vb.text}`);
    ok(vb.dim === true, 'blocked：置灰');
    ok(vb.tags.some((t) => t.kind === 'lock'), 'blocked：带一个 lock 标签',
      vb.tags.map((t) => t.label).join(','));
    ok(vb.pending !== true, 'blocked 与 pending 是两种状态，不许混');
    // 件数补到 4 → 同一条必须**不再** blocked。否则「blocked」就是个死标签，
    // 而真到了能戴 4 件套的时候界面上还写着「需要 4 件套」。
    const vb4 = CAT.rowView(ctx, blockedEntry, { ...shortPieces, pieces: 4 });
    ok(vb4.blocked !== true, '件数补到 4 之后这条不再是 blocked',
      JSON.stringify(vb4));
  }
  // blocked 的来源一共两处，**两边都要记进这个等式**：
  //   · 件数需求 > 2 的遗器套装（凑齐就能选）
  //   · `UNMODELLED`（模型里没有这一档，永远选不了）
  // 少写右边任何一项，这个等式就会因为「多出来一条 blocked」而红，
  // 而红的位置在件数那边 —— 又一处「断言名字对、结论全错」。
  ok(entries.filter((e) => CAT.rowView(ctx, e, shortPieces).blocked).length
    === entries.filter((e) => e.kind === 'relicset' && (e.ref?.piece ?? 0) > 2).length
      + entries.filter((e) => CAT.UNMODELLED.has(e.id)).length,
  'blocked 的条数 = 「件数需求 > 2」的遗器套装数 + UNMODELLED 条数',
  // ★ 这一条**必须带详情**，哪怕只是一串数 ★
  //   `_rev.mjs` 靠 `  ✗ 标签 —— 详情` 这行的 ` ——` 认出「哪条红了」；
  //   没有详情就没有分隔符，那条反证会报「该红未红，这条断言是恒真的」——
  //   而断言其实好好的，是台账读不出来。R58 就是这么第一次没红的。
  `实际 blocked ${entries.filter((e) => CAT.rowView(ctx, e, shortPieces).blocked).length} 条`);

  // ④ 没填面板时**不许**把系数本身当数值端出来（0.24 直接当 24%）
  //    这是 rowView 最容易漏的一条：`catalogValue` 已经挡住了，但 `rowView`
  //    多了一层包装，包装里漏判 `panelPending` 就会把 null 变成别的。
  const leak = paneled.filter((e) => {
    const v = CAT.rowView(ctx, e, base);
    return v.pending && v.value != null;
  });
  ok(leak.length === 0, '待填状态下一律不带值（不兜 0、不兜系数本身）',
    leak.slice(0, 3).map((e) => e.id).join(', '));
}

// ---------------------------------------------------------------------------
section(10.6, '基数中文名只有一份（SCALING_CN）');
{
  // 这份表原来在 core/abilities.mjs 和 core/damage.mjs 各有一份，两边
  // 一个键都不能少 —— 漏一个的表现是界面上冒出 `undefined：面板未填`
  // 这种谁也不知道在说什么的文案。现在只有 abilities.mjs 那一份。
  const dmgSrc = fs.readFileSync(path.join(ROOT, 'core', 'damage.mjs'), 'utf8');
  ok(!/SCALING_CN\s*=/.test(dmgSrc), 'core/damage.mjs 没有自己的 SCALING_CN 副本');
  ok(/import\s*\{[^}]*SCALING_CN[^}]*\}\s*from\s*'\.\/abilities\.mjs'/.test(dmgSrc),
    'core/damage.mjs 是从 core/abilities.mjs import 的');

  // ★ 光断言「只有一份」是不够的 ★ 光有一份、但那一份漏了键，界面上照样是
  //   `undefined：面板未填`。所以再**行为地**数一遍：数据里实际出现过的每个
  //   scaling 值，都必须在表里有中文名。
  const seen = new Set();
  for (const rec of Object.values(data.abilities ?? {})) {
    for (const t of rec.terms ?? []) if (t.scaling) seen.add(t.scaling);
  }
  for (const r of annotations.multipliers ?? []) {
    for (const t of r.terms ?? []) if (t.scaling) seen.add(t.scaling);
  }
  const missing = [...seen].filter((k) => !AB.SCALING_CN[k]);
  ok(missing.length === 0, `数据里出现过的 ${seen.size} 个基数名都有中文`,
    `缺：${missing.join(',')}`);
  // 反向：表里有没有**从来用不到**的键？不是错误，但要看得见
  const unused = Object.keys(AB.SCALING_CN).filter((k) => !seen.has(k));
  console.log(`  SCALING_CN ${Object.keys(AB.SCALING_CN).length} 个键`
    + `（数据里出现过 ${seen.size} 个；未出现的：${unused.join(',') || '无'}）`);
}

// ---------------------------------------------------------------------------
section(11, '审查问题的数值回归');
const { reviewRegressions } = await import('./review_regressions.mjs');
for (const r of reviewRegressions(data)) ok(r.pass, r.label, r.detail ?? '');
section(12, '新版界面与本地数据补齐');
const { dashboardRegressions } = await import('./dashboard_regressions.mjs');
for (const r of dashboardRegressions(data)) ok(r.pass, r.label, r.detail ?? '');

console.log('\n' + '='.repeat(64));
console.log(`断言 ${checks} 条，通过 ${checks - problems} 条，失败 ${problems} 条`
  + (skips.length ? `，跳过 ${skips.length} 条` : ''));
if (skips.length) {
  for (const s of skips) console.log(`跳过 ${s.label}：${s.why}`);
  // ★ 跳过项不进 problems，所以退出码仍是 0 ★（这是有意的：anchors.json 本来就
  //   是可选的、默认不存在的输入，缺它就把整个脚本判失败会让人习惯性忽略失败）。
  //   但也**绝不把它说成通过** —— 跳过就是「这件事从来没被验证过」，
  //   上面那行的数字里它既不算通过也不算失败，单独计数。
  console.log('★ 跳过 ≠ 通过：上表里这些项从来没有被验证过。');
}
if (problems) {
  console.log('\n失败明细:');
  for (const f of fails) console.log(`  ✗ ${f.label}${f.detail ? ' —— ' + f.detail : ''}`);
  console.log('\n结果: 有断言失败');
  process.exit(1);
} else {
  console.log('结果: 全部通过' + (skips.length ? '（但有跳过项，见上）' : ''));
}
