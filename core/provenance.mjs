// 三态可信度标注。
//
// 这个模块存在的唯一理由：**不许静默算 0**。
// 增益覆盖不全时，如果只是「没找到就当没有」，结果会偏低，而偏低的结果看起来
// 和正确的结果一模一样 —— 用户没有任何办法察觉。所以每个乘区都要带上自己的
// 可信度，界面必须在数字旁边把它显示出来。

export const C = Object.freeze({ KNOWN: 'known', PARTIAL: 'partial', UNKNOWN: 'unknown' });

const RANK = { known: 0, partial: 1, unknown: 2 };

/** 取最差的一个。任一 unknown 就是 unknown。 */
export function worst(...levels) {
  let out = 'known';
  for (const l of levels) {
    if (l == null) continue;
    if (RANK[l] > RANK[out]) out = l;
  }
  return out;
}

/**
 * 一个乘区的可信度。
 * @param {string} level   known / partial / unknown
 * @param {string[]} missing 缺了哪些条 —— 存**原文**，不存「未知错误」这种废话
 * @param {string} why    unknown 时的原因
 */
export function zone(level, { missing = [], why = null, detail = null } = {}) {
  return { level, missing, why, detail };
}

/** 把逐乘区的标注汇总成整体。 */
export function rollupZones(zones) {
  const levels = Object.values(zones).map((z) => z?.level);
  const missing = Object.values(zones).flatMap((z) => z?.missing ?? []);
  return { overall: worst(...levels), zones, missing };
}

/** 全局缺口的计数器（verify 结尾要用它下断言）。 */
export function makeFlag() {
  let n = 0;
  return {
    bump: (k = 1) => { n += k; },
    get count() { return n; },
  };
}

/** 把缺口列表变成给用户看的告警文案。 */
export function warnings(coverage) {
  const out = [];
  const z = coverage?.zones ?? {};
  for (const [name, info] of Object.entries(z)) {
    if (!info || info.level === C.KNOWN) continue;
    if (info.level === C.UNKNOWN) {
      out.push({ zone: name, level: 'unknown', text: `${name}：${info.why ?? '缺少数据'}`, missing: info.missing ?? [] });
    } else {
      out.push({
        zone: name, level: 'partial',
        text: info.missing.length ? `${name}：有 ${info.missing.length} 处数据待补充`
          : `${name}：使用自动解析的增益，尚未经人工逐项核对`,
        missing: info.missing,
      });
    }
  }
  return out;
}

/** 给结果数字加星号用。 */
export function isTrustworthy(coverage) {
  return coverage?.overall === C.KNOWN;
}
