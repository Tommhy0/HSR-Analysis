// 结果视图与计算核心分离：只展示传入的结果，不重新计算乘区。
import {HIT_SHARES} from '../core/hit-splits.mjs';
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const num = (v, digits = 0) => Number.isFinite(v) ? v.toLocaleString('zh-CN', { maximumFractionDigits: digits }) : '—';
const ZONES = { base:'基础伤害',dmgBoost:'增伤',crit:'暴击',def:'防御',res:'抗性',vuln:'易伤',broken:'韧性',mitigation:'减伤' };
const status = (level) => `<span class="badge ${esc(level)}">${({known:'来源明确',partial:'自动解析',unknown:'待输入'})[level] ?? esc(level)}</span>`;

export function renderResults({ result:r, stale, critMode, character, vsHp = '', compare = '', skipReason = (reason) => reason }) {
  if (!r) return `<div class="result-label">CALCULATION RESULT <span>READY</span></div><div class="empty-state"><span class="empty-orbit">✦</span><strong>下一击，从这里开始。</strong><p>完成角色与面板配置，点击「计算伤害」查看输出和每个乘区。</p></div><div class="result-meta"><span>单次技能伤害</span><span>本地运算</span></div>`;
  if (!r.ok || !r.hit?.ok) return `<div class="result-label">CALCULATION RESULT</div>${stale?'<div class="notice">输入已修改，请重新计算。下方为上次检查结果。</div>':''}<div class="notice bad">${esc(r.error ?? r.hit?.error ?? '当前输入无法计算')}</div>`;
  const h = r.hit;
  const shares=HIT_SHARES[r.ab?.skillId]??r.ab?.hitShares;
  const segments=Array.isArray(shares)&&shares.length>1&&Math.abs(shares.reduce((n,v)=>n+v,0)-1)<1e-8?shares.map((s,i)=>`<span>第 ${i+1} 段 <b>${num(h.total*s,2)}</b></span>`).join(''):'';
  const gaps = [...(r.gaps ?? []), ...(r.teamGaps ?? []), ...(r.scn?.gaps ?? [])];
  const omitted = [...(r.skipped ?? []), ...(r.scn?.excluded ?? [])];
  const labels = { expected:'期望伤害',crit:'暴击伤害',noncrit:'非暴击伤害' };
  const zoneRows = (h.trace ?? []).map((t) => {
    const z = h.zones[t.zone] ?? {};
    const note = z.detail ?? t.expr;
    const tag = t.zone === 'broken' ? '<span class="badge out">公式假定</span>' : status(z.level);
    return `<tr><td>${ZONES[t.zone] ?? esc(t.zone)}<div class="faint">${tag}</div></td><td class="num">${t.zone === 'base' ? num(t.value,1) : '×'+num(t.value,4)}</td><td class="faint">${esc(note)}${t.zone !== 'broken' && z.why ? `<div>${esc(z.why)}</div>`:''}</td></tr>`;
  }).join('');
  const contributions = (r.active ?? []).map((b) => `<tr><td>${esc(b.label)}<div class="faint">${esc(b.key)}</div></td><td class="num">${/Flat$/.test(b.key) ? num(b.value,1) : num(b.value*100,1)+'%'}</td></tr>`).join('');
  const inputGaps = Object.entries(h.zones).filter(([k,z]) => k !== 'broken' && z.level === 'unknown');
  return `<div class="result-label">CALCULATION RESULT <span>${stale ? '<span class="badge partial">待重新计算</span>' : '<span class="badge out">按公式估算</span>'}</span></div>
    <div class="result-context">${esc(character)} <span class="faint">/ ${esc(r.ab?.name)}</span></div>
    <div class="skill-damage-summary"><div><div class="bignum">${num(h.total)}</div><div class="result-unit">${labels[critMode] ?? '期望伤害'} · 本次技能合计${r.ab?.tag === 'AoEAttack' ? ' · 单个敌人' : ''}</div></div>${segments?`<div class="skill-damage-segments" aria-label="各段伤害">${segments}<small>按动画权重拆分 · 使用当前同一面板</small></div>`:''}</div>
    <div class="subnums"><span>期望<b>${num(h.expected)}</b></span><span>必暴<b>${num(h.onCrit)}</b></span><span>不暴击<b>${num(h.nonCrit)}</b></span></div>
    <div class="result-enemy">${r.enemy ? esc(r.enemy.name) : '沙盒计算 · 尚未指定敌人'}<small>${r.enemy ? `Lv.${r.enemy.level} · ${r.enemy.side != null ? '第'+r.enemy.side+'路 · ' : ''}${r.scn ? esc(r.scn.seasonName) : ''}` : '当前防御与抗性乘区按 ×1 计算。可在「战斗情境」选定目标。'}</small></div>
    <div class="result-meta"><span>${r.active?.length ?? 0} 项已计入增益</span><span>${gaps.length} 项规则待补充</span></div>
    ${inputGaps.length && r.enemy ? `<div class="notice bad">有 ${inputGaps.length} 个乘区缺输入，请查看计算明细。</div>`:''}
    <details class="result-section"><summary>伤害乘区明细 <span class="faint">8 个乘区</span></summary><div class="table-scroll"><table><thead><tr><th>乘区</th><th class="num">数值</th><th>依据</th></tr></thead><tbody>${zoneRows}</tbody></table></div></details>
    <details class="result-section"><summary>已计入的增益 <span class="faint">${r.active?.length ?? 0} 项</span></summary>${contributions ? `<table><tbody>${contributions}</tbody></table>` : '<p class="faint">未选择额外增益。</p>'}</details>
    ${gaps.length || omitted.length || h._assumptions?.length ? `<details class="result-section"><summary>数据与计算说明 <span class="faint">${gaps.length} 项规则待补充 · ${omitted.length} 项未计入</span></summary>
      ${h._assumptions?.length ? `<p class="faint">${h._assumptions.map(esc).join('<br>')}</p>`:''}
      ${gaps.length ? `<p class="faint">下列来源仍有未解析的效果，可能影响当前结果。</p><ul>${gaps.slice(0,40).map(g=>`<li>${esc(g.label)}<div class="faint">${esc(g.note ?? g.text)}</div></li>`).join('')}</ul>`:''}
      ${omitted.length ? `<ul>${omitted.slice(0,40).map(g=>`<li>${esc(g.label ?? g.id)}<div class="faint">${esc(g.note ?? skipReason(g.reason))}</div></li>`).join('')}</ul>`:''}
    </details>`:''}
    ${vsHp ? `<div class="result-section table-scroll">${vsHp}</div>`:''}${compare ? `<div class="result-section table-scroll">${compare}</div>`:''}
    <div class="faint" style="margin-top:18px">计算规则与数据来源可追溯；当前没有游戏实测伤害锚点。</div>`;
}
