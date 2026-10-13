// 可追溯的数据覆盖与缺口面板。
const esc = (v) => String(v ?? '').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const CATEGORIES = { needs_rule:'待完善解析', mechanics:'段数 / 概率 / 战斗机制', survival_or_break:'生存 / 击破机制', special_formula:'特殊伤害公式' };

export function renderDataView(data, search = '') {
  const d = data.dataReport ?? { sources:[],gaps:[],missingSkills:[],unavailable:[] };
  const q = search.trim().toLowerCase();
  const rows = d.gaps.filter(g=>!q||`${g.label} ${g.text}`.toLowerCase().includes(q));
  const sourceRows = d.sources.map(s=>`<div class="dataset-source"><div>${esc(s.name)}<div class="faint">${esc(s.note)}</div></div><span>${esc(s.status)}</span></div>`).join('');
  const skills = d.missingSkills.map(s=>`<tr><td>${esc(s.name)}<div class="faint">技能 ${s.id}</div></td><td>${s.hasParameters?'有参数，缺完整语义':'缺有效参数'}<div class="faint">${esc(s.text||'原库未提供完整描述')}</div></td></tr>`).join('');
  const counts = Object.entries(CATEGORIES).map(([k,v])=>`${v} ${d.gaps.filter(g=>g.category===k).length}`).join(' · ');
  const peak=data.peak??{seasons:[],stages:[],quadrants:[],tags:[]};
  const stageInfo = (s) => peak.stages.filter(t=>t.seasonId===s.id).map(t=>{
    const names=[...new Set((peak.monsters??[]).filter(m=>m.seasonId===s.id&&m.stageId===t.id).map(m=>m.name))];
    const tags=peak.tags.filter(g=>g.seasonId===s.id&&g.stageId===t.id);
    return `<details><summary>${esc(t.name)} <span class="faint">Lv.${t.level} · ${t.waves} 波</span></summary><p class="faint">敌人名册：${names.map(esc).join('、')}</p>${tags.map(g=>`<p class="faint"><b>${esc(g.name)}</b> · ${esc(g.text)}</p>`).join('')}</details>`;
  }).join('');
  return `<h2>数据覆盖 <span class="hint">LOCAL DATA SOURCES</span></h2><div class="data-kpis"><div class="data-kpi"><b>${data.characters.length}</b><span>角色档案</span></div><div class="data-kpi"><b>${data.buffCatalog.length}</b><span>可选增益条目</span></div><div class="data-kpi"><b>${d.scenarioEffects??0}</b><span>已解析情境效果</span></div></div>
    <div class="notice">已补回 ${d.reviewedAdditions??0} 条明确增益；新增 ${d.scenarioSources??0} 个情境来源的效果解析。目录中的“自动解析”表示提取方式，不等于数据库缺数值。</div>
    <details class="result-section" open><summary>已检查的数据库</summary>${sourceRows}</details>
    <details class="result-section"><summary>仍需要补齐的内容</summary>${d.unavailable.map(x=>`<div class="dataset-source"><div>${esc(x.name)}<div class="faint">${esc(x.reason)}</div></div></div>`).join('')}<div class="table-scroll"><table><thead><tr><th>技能</th><th>原库情况</th></tr></thead><tbody>${skills}</tbody></table></div></details>
    <details class="result-section" open><summary>未解析效果 <span class="faint">${d.gaps.length} 条</span></summary><p class="faint">${counts}</p><div class="catbar"><input id="data-search" type="text" placeholder="搜索角色、来源或原文" value="${esc(search)}"></div><div class="data-table table-scroll"><table><thead><tr><th>来源</th><th>原文与原因</th></tr></thead><tbody>${rows.slice(0,100).map(g=>`<tr><td>${esc(g.label)}</td><td>${esc(g.text)}<div class="faint">${CATEGORIES[g.category]} · ${esc(g.reason)}</div></td></tr>`).join('')}</tbody></table></div><p class="faint">显示 ${Math.min(rows.length,100)} / ${rows.length} 条。所有原文保留在构建数据中。</p></details>
    <details class="result-section"><summary>异相仲裁资料 <span class="faint">${peak.seasons.length} 期 · ${peak.stages.length} 关</span></summary><p class="faint">来源：已有 peak.db 与 4.6 原始 JSON。关卡等级、敌人和机制已接入；血量估计尚未核实。</p>${peak.seasons.map(s=>`<details><summary>${esc(s.name)} · ${esc(s.begin??'日期未记录')}</summary>${stageInfo(s)}${peak.quadrants.filter(q=>q.seasonId===s.id).map(q=>`<p class="faint">${esc(q.name)}：${esc(q.text)}</p>`).join('')}</details>`).join('')}</details>`;
}
