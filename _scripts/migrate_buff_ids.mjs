// 一次性迁移：把 annotations/buffs.jsonl 的 `.b<n>` 从「匹配计数」换成「子句位置」。
//
//   node _scripts/migrate_buff_ids.mjs            → 打印将要做的改动，不写文件
//   node _scripts/migrate_buff_ids.mjs --write    → 先备份成 .bak，再原地改
//
// ★ 为什么必须靠 text 反查、不能靠序号推算 ★
// 老 id 的 n 是「第几个匹配上的子句」，而匹配集合本身变了 —— 拿老 n 直接当新 n 用，
// 正好会把记录指到别的子句上，而且改完看不出来（数值照样算得出来）。
// 所以每一条都按 **text 全文相等** 在原技能描述里找位置；找不到或找到两条就报错退出，
// 一条都不改。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalize, buffClauseParts } from '../core/clauses.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const BUFFS = path.join(ROOT, 'annotations', 'buffs.jsonl');
const CORE = path.join(ROOT, '_data_cache', 'hsr_core.json');

const core = JSON.parse(fs.readFileSync(CORE, 'utf8'));
const skillById = new Map(core.skills.map((s) => [`${s.charId}.${s.id}`, s]));

/** 这个技能描述里，每个片段文本 → 它在 buffClauseParts 里的位置（可能有多个）。 */
function ordinalsOf(charId, skillId) {
  const sk = skillById.get(`${charId}.${skillId}`);
  if (!sk) return null;
  const m = new Map();
  buffClauseParts(normalize(sk.desc)).forEach((p, i) => {
    const t = p.trim();
    if (!m.has(t)) m.set(t, []);
    m.get(t).push(i);
  });
  return m;
}

const lines = fs.readFileSync(BUFFS, 'utf8').split('\n').filter((l) => l.trim());
const out = [];
const problems = [];
let changed = 0;

for (const line of lines) {
  const rec = JSON.parse(line);
  const src = rec.source ?? {};
  if (src.kind !== 'skill') { problems.push([rec.id, '非 skill 来源，本脚本不管']); out.push(rec); continue; }

  const table = ordinalsOf(src.charId, src.skillId);
  if (!table) { problems.push([rec.id, '找不到对应技能']); out.push(rec); continue; }

  const hits = table.get(rec.text);
  if (!hits || hits.length === 0) { problems.push([rec.id, 'text 在该技能描述里逐字找不到']); out.push(rec); continue; }
  if (hits.length > 1) { problems.push([rec.id, `text 重复出现 ${hits.length} 次，位置不唯一`]); out.push(rec); continue; }

  const oldId = rec.id;
  const newId = oldId.replace(/\.b\d+$/, `.b${hits[0]}`);
  if (newId !== oldId) {
    changed++;
    console.log(`${oldId}  →  ${newId}    ${rec.text.slice(0, 46)}`);
  }
  rec.id = newId;
  out.push(rec);
}

if (problems.length) {
  console.error('\n★ 有记录迁移不了，一条都没写 ★');
  for (const [id, why] of problems) console.error(`  ${id}: ${why}`);
  process.exit(1);
}

console.log(`\n共 ${out.length} 条，其中 id 变化 ${changed} 条。`);

if (process.argv.includes('--write')) {
  fs.copyFileSync(BUFFS, `${BUFFS}.bak`);
  fs.writeFileSync(BUFFS, out.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
  console.log(`已写入 ${BUFFS}（原件备份在 ${path.basename(BUFFS)}.bak）`);
} else {
  console.log('（预览模式，没写文件。加 --write 才落盘）');
}
