// 覆盖率报告。**纯 CLI，不开浏览器。**
//
// 回答一个问题：**我该去补哪些标注？**
//
//   node _scripts/coverage.mjs                 全部角色，按缺口从多到少排
//   node _scripts/coverage.mjs --char 1303     看单个角色的逐条明细
//   node _scripts/coverage.mjs --team          只看常用辅助（深做对象）
//   node _scripts/coverage.mjs --json          机器可读，供界面取角标
//
// ★ 覆盖率是「我们录了多少」的度量，**不是「对不对」的度量** ★
//   100% 覆盖也证明不了数值正确，只说明没有已知的遗漏项。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, characterDisplayName } from '../core/ctx.mjs';
import { coverageOf } from '../core/buffs.mjs';
import { loadAnnotations } from '../core/annotations.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 本项目的深做对象：常用辅助。人工保证这几个角色的增益覆盖率。 */
export const FOCUS = [1303, 1306, 1309, 1202, 1101, 1218];   // 阮•梅 花火 知更鸟 停云 布洛妮娅 椒丘

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => { const i = args.indexOf(n); return i === -1 ? null : args[i + 1]; };

function main() {
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, '_data_cache', 'hsr_core.json'), 'utf8'));
  const ctx = createContext(data);
  const annotations = loadAnnotations(path.join(ROOT, 'annotations'));

  if (annotations.errors.length) {
    console.error(`标注表有 ${annotations.errors.length} 行解析失败：`);
    for (const e of annotations.errors.slice(0, 5)) console.error(`  第 ${e.line} 行: ${e.msg}`);
  }

  const one = opt('--char');
  const chars = one
    ? (data.characters ?? []).filter((c) => String(c.id) === String(one))
    : flag('--team')
      ? (data.characters ?? []).filter((c) => FOCUS.includes(c.id))
      : (data.characters ?? []);

  // ★ 计算全在 core/buffs.mjs 的 coverageOf 里，和界面角标是同一份实现 ★
  const rows = chars.map((ch) => ({
    // ★ 用 characterDisplayName 而不是 ch.name ★
    //   ch.name 是原始值：银狼LV.999 带着 `<unbreak>`，10 个开拓者全是字面
    //   `{NICKNAME}`。直接用的话报表和界面里会出现一屏无法区分的选项。
    id: ch.id, name: characterDisplayName(ch, data.characters), path: ch.path, element: ch.element,
    ...coverageOf(ctx, ch.id, annotations),
  }));

  if (flag('--json')) {
    // 界面要的角标：全 / 部分 / 未收录
    const out = rows.map((r) => ({
      id: r.id, name: r.name, badge: r.badge,
      numericSources: r.numericSources, annotated: r.annotated, buffs: r.buffsActive,
    }));
    fs.mkdirSync(path.join(ROOT, '_data_cache'), { recursive: true });
    fs.writeFileSync(path.join(ROOT, '_data_cache', 'coverage_report.json'),
      JSON.stringify({ generatedNote: '由 coverage.mjs 生成；界面用 badge 画角色覆盖角标', characters: out }, null, 2), 'utf8');
    console.log(`已写 _data_cache/coverage_report.json（${out.length} 个角色）`);
    const tally = out.reduce((a, o) => (a[o.badge] = (a[o.badge] ?? 0) + 1, a), {});
    console.log('角标分布:', JSON.stringify(tally));
    return;
  }

  if (one) {
    const r = rows[0];
    if (!r) { console.error(`没有 id 为 ${one} 的角色`); process.exit(1); }
    console.log(`\n=== ${r.name}（${r.id}，${r.path}·${r.element}）===`);
    console.log(`有数值效果的来源 ${r.numericSources} 条，已标注 ${r.annotated} 条，`
      + `本次生效增益 ${r.buffsActive} 条\n`);
    if (!r.gaps.length) {
      console.log('  没有未收录的数值来源。');
    } else {
      console.log(`  未收录 ${r.gaps.length} 条 —— **这些不是「没有增益」，是我们还没录**：`);
      for (const g of r.gaps) {
        console.log(`    [${g.kind}] ${g.label}`);
        console.log(`        ${String(g.text ?? '(无描述)').slice(0, 96)}`);
      }
    }
    return;
  }

  rows.sort((a, b) => (b.gaps.length - a.gaps.length) || (a.id - b.id));
  const totalNum = rows.reduce((s, r) => s + r.numericSources, 0);
  const totalGap = rows.reduce((s, r) => s + r.gaps.length, 0);
  console.log(`\n共 ${rows.length} 个角色；有数值效果的来源 ${totalNum} 条，未收录 ${totalGap} 条`
    + `（${((1 - totalGap / Math.max(totalNum, 1)) * 100).toFixed(1)}%）\n`);
  console.log('缺口最多的 20 个角色：');
  for (const r of rows.slice(0, 20)) {
    const pct = r.numericSources ? (100 * r.annotated / r.numericSources).toFixed(0) : '—';
    console.log(`  ${String(r.name).padEnd(12)} ${String(r.id).padEnd(6)} `
      + `${String(r.gaps.length).padStart(3)} 缺口 / ${String(r.numericSources).padStart(3)} 有数值  ${pct}%`);
  }
  console.log('\n深做对象（人工保证覆盖）：');
  for (const r of rows.filter((x) => FOCUS.includes(x.id))) {
    const pct = r.numericSources ? (100 * r.annotated / r.numericSources).toFixed(0) : '—';
    console.log(`  ${String(r.name).padEnd(12)} ${String(r.id).padEnd(6)} `
      + `${String(r.gaps.length).padStart(3)} 缺口 / ${String(r.numericSources).padStart(3)} 有数值  ${pct}%`);
  }
  console.log('\n看单个角色的逐条明细: node _scripts/coverage.mjs --char <id>');
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
