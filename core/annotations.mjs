// 标注表的**读取**侧（node 专用，因为要碰 fs）。
//
// ★ 为什么和 core/buffs.mjs 分开 ★
//   core/ 下面所有模块都要能被浏览器直接 import（开发期页面走 http://，
//   成品是单文件 HTML）—— 顶层出现 `import fs from 'node:fs'` 会让整个模块
//   在浏览器里加载失败。所以 IO 全部集中到这里，buffs.mjs 只留纯函数。
//
//   浏览器那边读的是构建期烧进数据块的 `window.__HSR_DATA__.annotations`，
//   内容和这里 loadAnnotations() 读出来的一模一样（同一个函数，见 build_data.mjs）。
import fs from 'node:fs';
import path from 'node:path';

/** 读 JSONL。容忍空行和 `//` 注释行；坏行**报出来**而不是静默跳过。 */
export function readJsonl(file) {
  if (!fs.existsSync(file)) return { rows: [], errors: [] };
  const rows = [];
  const errors = [];
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((ln, i) => {
    const s = ln.trim();
    if (!s || s.startsWith('//')) return;
    try { rows.push(JSON.parse(s)); }
    catch (e) { errors.push({ line: i + 1, msg: e.message, text: s.slice(0, 120) }); }
  });
  return { rows, errors };
}

export function loadAnnotations(dir) {
  const main = readJsonl(path.join(dir, 'buffs.jsonl'));
  const mult = readJsonl(path.join(dir, 'multipliers.jsonl'));
  return { buffs: main.rows, multipliers: mult.rows, errors: [...main.errors, ...mult.errors] };
}

/**
 * 读敌我侧归类种子表。
 * 缺文件 / 坏文件时返回**空规则表** —— 那样所有层标签都会被排除并告警。
 * 这是刻意的安全默认：宁可漏算一个增益，也不能把「敌方减伤 60%」当成「我方增伤 60%」。
 */
export function loadSides(dir) {
  const fallback = {
    rules: [],
    default: { side: 'unknown', action: 'exclude', warn: true },
    _loaded: false,
  };
  const p = path.join(dir, 'sides.json');
  if (!fs.existsSync(p)) return fallback;
  try {
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    return { ...fallback, ...j, _loaded: true };
  } catch (e) {
    return { ...fallback, _error: e.message };
  }
}

/** 一次性读全 —— 构建期就调这一个，把结果烧进数据块。 */
export function loadAll(dir) {
  return { ...loadAnnotations(dir), sides: loadSides(dir) };
}
