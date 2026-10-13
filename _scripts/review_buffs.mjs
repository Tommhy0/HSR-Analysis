// 增益标注复核工具。**纯 CLI，不开浏览器**（用户明确否决过用渲染页面做验证）。
//
//   node _scripts/review_buffs.mjs --report              分组统计 + 每桶样例
//   node _scripts/review_buffs.mjs --reason NO_SIDE      只看某一桶
//   node _scripts/review_buffs.mjs --show <id>           看一条的全文与上下文
//   node _scripts/review_buffs.mjs --accept <id>         提升进 buffs.jsonl
//   node _scripts/review_buffs.mjs --reject <id> --why "……"
//   node _scripts/review_buffs.mjs --accept-reason OK    整桶提升（只许用于 OK / EXTRA_DAMAGE）
//
// 为什么要有「整桶提升」：115 条增益里 65 条是 SIDE_INFERRED（主体靠谓语语义推的），
// 一条条过不现实。但**只有 OK 和 EXTRA_DAMAGE 允许整桶过** ——
// NO_SIDE 恰恰是把增益算反的那一类，必须逐条看。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonl } from '../core/annotations.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const ANN = path.join(ROOT, 'annotations');
const PROPOSED = path.join(ANN, '_proposed.jsonl');
const MAIN = path.join(ANN, 'buffs.jsonl');
const REJECTED = path.join(ANN, '_rejected.jsonl');

/**
 * 允许整桶提升的桶。
 *  NO_SIDE    不在内 —— 那是把增益算反的唯一入口，必须逐条看。
 *  MULTI_TERM 也不在内 —— 一个子句里有多个数值时只提取一条，会静默丢掉其余，
 *             到底该拆成几条只有人看得出（见 extract_buffs.mjs 里那段注释）。
 *  FLAT_UNIT  在内：它是**确定性**的单位改键规则（占位符后面紧跟「点」= 平值，
 *             不是百分比），不是判断题；且被 verify 的断言兜住 —— 凡 key 以 Flat
 *             结尾的记录，原文必须真的出现「点」。所以整桶提升安全。
 */
const BULK_OK = new Set(['OK', 'EXTRA_DAMAGE', 'FLAT_UNIT']);

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : (args[i + 1] ?? true);
};

function load() {
  if (!fs.existsSync(PROPOSED)) {
    console.error(`找不到 ${PROPOSED} —— 先跑 node _scripts/extract_buffs.mjs`);
    process.exit(1);
  }
  const { rows, errors } = readJsonl(PROPOSED);
  if (errors.length) {
    console.error(`_proposed.jsonl 有 ${errors.length} 行解析失败：`);
    for (const e of errors.slice(0, 5)) console.error(`  第 ${e.line} 行: ${e.msg}`);
    process.exit(1);
  }
  return rows;
}

/** 提案 → buffs.jsonl 的记录。提案里的 reviewReason/sideSource 是复核用的，不带走。 */
function toAnnotation(p) {
  return {
    id: p.id,
    source: {
      kind: 'skill',
      charId: p.characterId,
      skillId: p.skillId,
      skillType: p.skillType,
    },
    param: p.param,
    text: p.text,
    effect: p.effect,
    direction: p.direction,
    condition: p.condition ?? null,
    provenance: 'known',
    note: '由 extract_buffs.mjs 提案 + 人工复核',
  };
}

function append(file, rows) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
}

function main() {
  const rows = load();

  // ---- 报告 ---------------------------------------------------------------
  if (args.includes('--report') || args.length === 0) {
    const buffs = rows.filter((r) => r.kind === 'buff');
    const byReason = new Map();
    for (const b of buffs) {
      if (!byReason.has(b.reviewReason)) byReason.set(b.reviewReason, []);
      byReason.get(b.reviewReason).push(b);
    }
    console.log(`增益提案 ${buffs.length} 条，按复核桶：\n`);
    for (const [k, v] of [...byReason.entries()].sort((a, b) => b[1].length - a[1].length)) {
      const bulk = BULK_OK.has(k) ? '（可整桶提升）' : '（**必须逐条看**）';
      console.log(`${k.padEnd(16)} ${String(v.length).padStart(4)}  ${BULK_OK.has(k) ? '' : bulk}`);
      for (const b of v.slice(0, 3)) {
        console.log(`      ${b.effect.side}/${String(b.effect.key).padEnd(12)} #${b.param?.index}  ${b.text.slice(0, 56)}`);
      }
      if (v.length > 3) console.log(`      …还有 ${v.length - 3} 条`);
      console.log();
    }
    const mult = rows.filter((r) => r.kind === 'multiplier');
    const mr = new Map();
    for (const m of mult) mr.set(m.reviewReason, (mr.get(m.reviewReason) ?? 0) + 1);
    console.log(`倍率提案 ${mult.length} 条：`);
    for (const [k, v] of [...mr.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(16)} ${v}`);
    console.log('\n用法见本文件头部注释。');
    return;
  }

  // ---- 过滤查看 -----------------------------------------------------------
  const reason = flag('--reason');
  if (reason) {
    const v = rows.filter((r) => r.reviewReason === reason);
    console.log(`复核桶 ${reason} 共 ${v.length} 条：\n`);
    for (const b of v) console.log(`${b.id}\n   ${b.effect.side}/${b.effect.key}  #${b.param?.index}\n   ${b.text}\n`);
    return;
  }

  const showId = flag('--show');
  if (showId) {
    const p = rows.find((r) => r.id === showId);
    if (!p) { console.error(`找不到 ${showId}`); process.exit(1); }
    console.log(JSON.stringify(p, null, 2));
    return;
  }

  // ---- 单条裁决 -----------------------------------------------------------
  const accept = flag('--accept');
  if (accept) {
    const p = rows.find((r) => r.id === accept);
    if (!p) { console.error(`找不到 ${accept}`); process.exit(1); }
    append(MAIN, [toAnnotation(p)]);
    console.log(`已提升 ${accept} → annotations/buffs.jsonl`);
    return;
  }

  const reject = flag('--reject');
  if (reject) {
    const p = rows.find((r) => r.id === reject);
    if (!p) { console.error(`找不到 ${reject}`); process.exit(1); }
    append(REJECTED, [{ ...p, why: flag('--why') || '(未填理由)' }]);
    console.log(`已否决 ${reject} → annotations/_rejected.jsonl`);
    console.log('注意：否决记录会被 verify 读到，用来算「未收录」的可见度，别把它当成「不存在」。');
    return;
  }

  // ---- 整桶提升 -----------------------------------------------------------
  const bulk = flag('--accept-reason');
  if (bulk) {
    if (!BULK_OK.has(bulk)) {
      console.error(`拒绝整桶提升 ${bulk}：只有 ${[...BULK_OK].join(' / ')} 允许。`);
      console.error('NO_SIDE 这类必须逐条看 —— 它是把增益算反的唯一入口。');
      process.exit(2);
    }
    const exist = new Set(readJsonl(MAIN).rows.map((r) => r.id));
    const v = rows.filter((r) => r.kind === 'buff' && r.reviewReason === bulk && !exist.has(r.id));
    if (!v.length) { console.log('没有可提升的条目（可能已提升过）'); return; }
    append(MAIN, v.map(toAnnotation));
    console.log(`已整桶提升 ${v.length} 条（${bulk}）→ annotations/buffs.jsonl`);
    return;
  }

  console.error('用法见 _scripts/review_buffs.mjs 头部注释。');
  process.exit(2);
}

main();
