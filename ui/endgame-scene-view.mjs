import { listEndgameTargets, inspectEndgameTarget } from '../simulator/endgame-scenes.mjs';
import { renderText } from '../core/ctx.mjs';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));
const n = (v) => Number.isFinite(v) ? v.toLocaleString('zh-CN', { maximumFractionDigits: 1 }) : '—';
const ELEMENT_CN = { Physical: '物理', Fire: '火', Ice: '冰', Thunder: '雷', Wind: '风', Quantum: '量子', Imaginary: '虚数' };
const modeLabel = { moc: '混沌回忆', pf: '虚构叙事', as: '末日幻影', anomaly: '异相仲裁' };

function stat(label, value) {
  return `<span class="scene-stat"><b>${esc(value)}</b><small>${label}</small></span>`;
}

function enemyCard(enemy) {
  const weakness = (enemy.weakness ?? enemy.weak ?? []).map((x) => ELEMENT_CN[x] ?? x).join('、') || '无弱点资料';
  const provenance = enemy._provenance ?? {};
  const skills = enemy.skills?.length
    ? `<details class="scene-skills"><summary>技能资料（${enemy.skills.length} 条描述）</summary><ul>${enemy.skills.map((s) =>
      `<li><b>${esc(s.name || `技能 ${s.id}`)}</b> <small>ID ${esc(s.id)}</small>${s.desc ? `<p>${esc(s.desc)}</p>` : '<p class="faint">源库没有招式描述</p>'}</li>`).join('')}</ul><p class="faint">源库描述用于识别招式，不含完整倍率、目标选择、冷却、状态变化或行动 AI。</p></details>`
    : '<span class="faint">没有已导入的技能描述</span>';
  const aiRef = enemy.aiSource;
  const aiFile = aiRef?.aiFile;
  const skillSpecs = aiRef?.skillSpecs ?? [];
  const sourcedSkills = skillSpecs.length ? `<details class="scene-skills"><summary>技能源参数（${skillSpecs.length} 条）</summary><div class="table-scroll"><table><thead><tr><th>技能</th><th>攻击类型 / 属性</th><th>受击回能</th><th>AI 初始冷却 / 冷却</th><th>参数（原始顺序）</th></tr></thead><tbody>${skillSpecs.map((spec) => {
    const skill = enemy.skills?.find((s) => s.id === spec.id);
    return `<tr><td>${esc(skill?.name ?? spec.trigger ?? spec.id)}<small>ID ${esc(spec.id)}</small></td><td>${esc(spec.attackType ?? '—')} / ${esc(ELEMENT_CN[spec.element] ?? spec.element ?? '—')}</td><td>${esc(spec.hitEnergy ?? '—')}</td><td>${esc(spec.initialCooldown ?? '—')} / ${esc(spec.cooldown ?? '—')}</td><td>${esc(JSON.stringify(spec.params ?? []))}</td></tr>`;
  }).join('')}</tbody></table></div><p class="faint">参数是游戏源表的原始技能参数，不保证每项都代表伤害倍率；部分技能用能力脚本动态计算。</p></details>` : '';
  const aiDecisions = (aiFile?.groups ?? []).flatMap((group) => (group.decisions ?? []).map((decision) => ({ ...decision, phase: group.phase })));
  const aiDetails = !aiRef ? '<p class="faint">尚未找到此敌人的 AI 源路径。</p>'
    : aiRef.aiFile?.sourceAvailable === false ? `<p class="faint">AI 路径：${esc(aiRef.aiPath)}；该文件在固定来源版本中不可用。</p>`
      : `<details class="scene-ai"><summary>AI 源路径已定位 · ${aiDecisions.length} 条决策</summary>
        <p>源 AI 名称：${esc(aiFile?.aiName ?? '—')}<br>路径：<code>${esc(aiRef.aiPath)}</code><br>模板 ID：${esc(aiRef.templateId)}<br>序列技能：${(aiRef.skillSequence ?? []).map((x) => esc(Object.values(x)[0])).join('、') || '无序列'}<br>技能 ID：${(aiRef.skillList ?? []).map(esc).join('、') || '—'}</p>
        <ul>${aiDecisions.map((d) => `<li>${d.phase ? `<b>${esc(d.phase)} · </b>` : ''}<b>${esc(d.name ?? '未命名决策')}</b>${d.skills?.length ? ` · 技能：${d.skills.map(esc).join('、')}` : ''}${d.selectors?.length ? ` · 目标选择：${d.selectors.map(esc).join('、')}` : ''}${d.taskTypes?.length ? `<small> · 动作节点：${d.taskTypes.map(esc).join(' / ')}</small>` : ''}${d.axes?.length ? `<small> · 条件：${d.axes.map((a) => `${esc(a.type)}${a.skill ? `(${esc(a.skill)})` : ''}${a.cd != null ? ` CD ${esc(a.initialCD ?? '—')}/${esc(a.cd)}` : ''}${a.predicates?.length ? ` ${a.predicates.map(esc).join(',')}` : ''}`).join('；')}</small>` : ''}</li>`).join('')}</ul>
        <a href="https://github.com/DimbreathBot/TurnBasedGameData/blob/${esc(aiRef.sourceRef ?? '')}/${esc(aiRef.aiPath)}" target="_blank" rel="noopener noreferrer">查看固定版本的上游 AI 配置</a>
      </details>`;
  return `<article class="scene-enemy">
    <div class="scene-enemy-head"><div><b>${esc(enemy.name)}</b><small>${esc(enemy.rank ?? '敌人')} · ID ${esc(enemy.childId ?? enemy.monsterId)}</small></div><span class="scene-coverage ${enemy.behaviorStatus === 'registered' ? 'known' : 'missing'}">${enemy.behaviorStatus === 'registered' ? '简化行为已登记' : '行为未实现'}</span></div>
    <div class="scene-stats">${stat('等级', enemy.level ?? '—')}${stat('生命', enemy.hp == null ? (provenance.hp === 'known' ? '—' : '未核实') : n(enemy.hp))}${stat('速度', enemy.speed == null ? '—' : n(enemy.speed))}${stat('韧性', enemy.toughness ?? enemy.stance ?? '—')}${stat('效果抵抗', enemy.statusRes == null ? '—' : `${n(enemy.statusRes)}%`)}${enemy.isInfinite ? stat('本波名单次数', enemy.spawnCount ?? 1) : ''}${stat('弱点', weakness)}</div>
    ${aiDetails}${sourcedSkills}${skills}
  </article>`;
}

function effectList(title, rows, { textKey = 'desc', nameKey = 'name' } = {}) {
  if (!rows?.length) return '';
  return `<details class="scene-effects"><summary>${esc(title)}（${rows.length}）</summary><ul>${rows.map((row) => {
    const text = row[textKey] ?? row.text ?? '';
    const name = row[nameKey] ?? row.label ?? '';
    const params = row.params ?? row.param ?? [];
    return `<li>${name ? `<b>${esc(name)}</b> · ` : ''}${esc(renderText(text, params) ?? text)}</li>`;
  }).join('')}</ul></details>`;
}

function regularWaves(scene) {
  const records = scene.events ?? [];
  if (!records.length) return '<p class="notice">关卡敌人行存在，但没有可对齐的场景事件记录。</p>';
  return records.map((record) => {
    const enemies = scene.enemies.filter((e) => e.side === record.side && e.event === record.event);
    const declaredCount = Array.isArray(record.waves) ? record.waves.length : 0;
    const inferredCount = enemies.length ? Math.max(...enemies.map((e) => Number(e.wave ?? 0) + 1)) : 0;
    const waveCount = Math.max(declaredCount, inferredCount);
    const infinitePlans = scene.mode === 'pf' ? (scene.infiniteWavePlans ?? [])
      .filter((wave) => wave.side === record.side && wave.event === record.event) : [];
    const infinitePlanMarkup = infinitePlans.map((wave) => {
      const names = new Map(scene.enemies.filter((enemy) => enemy.side === wave.side && enemy.event === wave.event && enemy.infiniteWaveId === wave.id)
        .map((enemy) => [Number(enemy.childId), enemy.name]));
      const gate = wave.gateCandidateChildId == null ? '未能唯一识别' : `${names.get(Number(wave.gateCandidateChildId)) ?? '敌人'} · ${wave.gateCandidateChildId}`;
      return `<details class="scene-effects"><summary>无限波次 ${wave.index} · 顺序名单 ${wave.sourceCount} 个 · 波次 ID ${esc(wave.id)}</summary>
        <p>源字段：max_monster_count=${esc(wave.maxMonsterCount)}，max_teammate_count=${esc(wave.maxTeammateCount)}；能力 ${esc(wave.ability || '无')}；param_list=${esc(JSON.stringify(wave.params))}。运行时按 monster_group_id_list 保持生成顺序，并用 max_teammate_count 补充空位；max_monster_count 原样保留，不用它截断名单（4.6 的该值与名单长度并不总相同）。本波唯一的特殊阶级门槛候选：${esc(gate)}（根据 rank 推断，来源没有显式标注 boss ID）。</p>
        <ol>${wave.monsterGroupIds.map((id) => `<li>${esc(names.get(Number(id)) ?? `敌人 ${id}`)} <small>ID ${esc(id)}</small></li>`).join('')}</ol>
      </details>`;
    }).join('');
    return `<section class="scene-event"><header><b>${record.side} 侧 · 敌方事件 ${record.event + 1}</b><span>Lv.${record.level} · 硬等级组 ${esc(record.hardLevelGroup ?? '—')} · 精英组 ${esc(record.eliteGroup ?? '—')}</span></header>
      ${infinitePlanMarkup}
      ${Array.from({ length: waveCount }, (_, i) => {
        const waveEnemies = enemies.filter((e) => Number(e.wave ?? 0) === i);
        return `<div class="scene-wave"><h4>第 ${i + 1} 波</h4><div class="scene-enemy-grid">${waveEnemies.map(enemyCard).join('') || '<p class="faint">没有对应的敌人行</p>'}</div></div>`;
      }).join('') || '<p class="faint">场景事件没有波次内容。</p>'}</section>`;
  }).join('');
}

function arbitrationWaves(scene) {
  const waveMarkup = (scene.waves ?? []).map((wave, index) => {
    const enemies = scene.enemies.filter((e) => e.wave === index + 1);
    const hpLabel = Number.isFinite(wave.calculatedHpTotal)
      ? `公式计算血量合计 ${n(wave.calculatedHpTotal)}`
      : wave.sourceHpEstimate != null ? `源表基础血量估值 ${n(wave.sourceHpEstimate)}（未含关卡等级组）` : '缺少血量公式输入';
    return `<section class="scene-event"><header><b>第 ${index + 1} 波</b><span>波次 ID ${esc(wave.id)} · 敌方组 ${esc(wave.eliteGroup ?? '—')} · ${hpLabel}</span></header>
      <div class="scene-enemy-grid">${enemies.map(enemyCard).join('') || '<p class="faint">没有匹配到敌人条目；保留源波次数据供审计。</p>'}</div>
      ${wave.sourceHpEstimate != null && Number.isFinite(wave.calculatedHpTotal) ? `<p class="faint">源表逐波估值 ${n(wave.sourceHpEstimate)} 没有乘关卡等级组；上方合计按敌人等级、HLG 与精英组公式分别计算。</p>` : ''}
    </section>`;
  }).join('');
  const formulaTotal=scene.enemies.reduce((sum,enemy)=>sum+(Number.isFinite(enemy.hp)?enemy.hp:0),0);
  const stageEstimate=scene.stageHp?.estimatedHp;
  const aggregate=Number.isFinite(stageEstimate)
    ? `<p class="faint">按敌人公式计算的全阶段血量 ${n(formulaTotal)}；阶段汇总估值 ${n(stageEstimate)}；差值 ${n(formulaTotal-stageEstimate)}（逐敌 HP 取一位小数造成的舍入差）。</p>` : '';
  return waveMarkup+aggregate;
}

export function mountEndgameSceneView({ host, ctx, onRunScene=()=>{} }) {
  const modes = listEndgameTargets(ctx);
  const state = { mode: 'moc', target: '', side: 'all' };
  const render = () => {
    const mode = modes.find((m) => m.id === state.mode) ?? modes[0];
    state.mode = mode.id;
    if (!mode.targets.some((t) => String(t.floorId ?? t.id) === String(state.target))) {
      state.target = String(mode.targets[0]?.floorId ?? mode.targets[0]?.id ?? '');
    }
    let scene = null, failure = null;
    try {
      scene = inspectEndgameTarget(ctx, {
        mode: mode.id, seasonId: mode.seasonId, floorId: state.target,
        side: mode.id === 'anomaly' || state.side === 'all' ? null : Number(state.side),
      });
    } catch (e) { failure = e.message; }

    const options = mode.targets.map((t) => {
      const id = String(t.floorId ?? t.id);
      return `<option value="${esc(id)}"${id === state.target ? ' selected' : ''}>${esc(t.label ?? t.name ?? id)}</option>`;
    }).join('');
    const regular = mode.id !== 'anomaly';
    const floor = regular ? ctx.floorByKey.get(`${mode.id}:${mode.seasonId}:${state.target}`) : null;
    const floorBuffs = floor?.buffs ?? [];
    const regularTags = regular ? ctx.abyssTagByKey.get(`${mode.id}:${mode.seasonId}:${state.target}`) ?? [] : [];
    const peakSeason = (ctx.data.peak?.seasons ?? []).find((s) => s.id === mode.seasonId);
    const bossConfigs = (ctx.data.peak?.bossConfigs ?? []).filter((c) => c.seasonId === mode.seasonId);
    const peakTags = !regular ? scene?.tags ?? [] : [];
    const covered = scene?.enemies?.filter((e) => e.behaviorStatus === 'registered').length ?? 0;
    const aiLocated = scene?.enemies?.filter((e) => e.aiSource?.aiFile?.sourceAvailable !== false && e.aiSource?.aiFile).length ?? 0;
    const total = scene?.enemies?.length ?? 0;
    const eventMarkup = scene ? (regular ? regularWaves(scene) : arbitrationWaves(scene)) : '';

    host.innerHTML = `<h2>四深渊真实场景 <span class="hint">按游戏场景清单检查敌人、波次、关卡词条与行为覆盖</span></h2>
      <p class="notice">已载入数据快照 ${esc(regular ? mode.version ?? ctx.data._meta.version : peakSeason?.version ?? ctx.data._meta.version)}。这里展示游戏关卡来源数据与逐敌行为覆盖；选择场景不会启动战斗。未登记敌方 AI、招式执行、首领阶段与模式计分规则前，不会把模拟结果标成真实关卡复刻。</p>
      <div class="scene-picker"><label>终局模式<select id="scene-mode" aria-label="终局模式">${modes.map((m) => `<option value="${m.id}"${m.id === state.mode ? ' selected' : ''}>${esc(m.label)}</option>`).join('')}</select></label>
      <label>轮次 / 关卡<select id="scene-target" aria-label="轮次或关卡">${options}</select></label>
      ${regular ? `<label>挑战侧<select id="scene-side" aria-label="挑战侧"><option value="all"${state.side === 'all' ? ' selected' : ''}>两侧都看</option><option value="1"${state.side === '1' ? ' selected' : ''}>第 1 侧</option><option value="2"${state.side === '2' ? ' selected' : ''}>第 2 侧</option></select></label>` : ''}</div>
      ${failure ? `<div class="notice bad">${esc(failure)}</div>` : scene ? `<div class="scene-summary"><b>${esc(mode.label)} · ${esc(mode.seasonName ?? peakSeason?.name ?? `第 ${mode.seasonId} 期`)}</b><span>${esc(String(state.target))} · 敌人记录 ${total} 条 · AI 源摘要 ${aiLocated} 条 · 可执行行为 ${covered} 条</span></div>
        <div class="scene-events">${eventMarkup}</div>
        ${regular ? effectList('关卡祝福', floorBuffs, { textKey: 'desc', nameKey: 'name' }) : ''}
        ${effectList(regular ? '敌方 / 场景词条' : '异相仲裁词条', regular ? regularTags : peakTags, { textKey: regular ? 'desc' : 'text' })}
        ${!regular && bossConfigs.length ? `<details class="scene-effects"><summary>异相仲裁首领配置源数据（${bossConfigs.length} 条）</summary>${bossConfigs.map((config) => `<p><b>${esc(config.hardName || '未命名配置')}</b></p><pre>${esc(JSON.stringify({ buffs: config.buffs, events: config.events, tags: config.tags, waves: config.waves }, null, 2))}</pre>`).join('')}</details>` : ''}
        ${floor?.phase || floor?.bossSkill || floor?.npcMonsterIds ? `<details class="scene-effects"><summary>场景阶段与辅助单位源字段</summary><pre>${esc(JSON.stringify({ phase: floor.phase, bossSkill: floor.bossSkill, npcMonsterIds: floor.npcMonsterIds }, null, 2))}</pre></details>` : ''}
        ${regular&&mode.id!=='pf'&&state.side!=='all'&&scene.behaviorComplete&&scene.events?.length===1?`<div class="scene-run"><button class="primary" id="scene-run-button">运行此侧真实敌方编队</button><p class="notice">会按源表加载每波敌人和面板。当前试跑不含关卡祝福、场景词条或模式计分，结果只验证敌方编队与已登记行为。</p></div>`:''}
        ${!regular&&scene.behaviorComplete?`<div class="scene-run"><button class="primary" id="scene-run-button">运行此异相仲裁场景</button><p class="notice">会按异相仲裁源波次顺序运行，并由等级组与精英组公式计算敌人面板。当前敌方 AI、专属状态、关卡词条与挑战评价仍有缺口，回放会标明尚未还原的部分。</p></div>`:''}
        ${mode.id==='pf'?'<p class="notice">模拟器已接入按死亡补位、按名单顺序生成、max_teammate_count 场上上限和门槛敌人切波。当前数据库每个波段均可由唯一 Elite / LittleBoss rank 找到候选门槛，但这是推断，源表没有显式 boss ID；PF 击杀计分、普通怪对首领的伤害和敌人 AI 仍不完整，因此目前不开放整场运行。</p>':''}
        ${scene.behaviorGaps?.length ? `<p class="notice">行为缺口：${scene.behaviorGaps.map(esc).join('、')}。技能描述不是完整 AI 或招式执行脚本。</p>` : '<p class="notice">本场列出的敌人均有简化行为登记；这仍不等于关卡机制、敌方状态机或模式规则已通过实战对拍。</p>'}` : '<p class="empty">当前数据快照没有该模式的场景记录。</p>'}`;

    host.querySelector('#scene-mode').onchange = (e) => { state.mode = e.target.value; state.target = ''; render(); };
    host.querySelector('#scene-target').onchange = (e) => { state.target = e.target.value; render(); };
    const sideSelect=host.querySelector('#scene-side');if(sideSelect)sideSelect.onchange=(e)=>{state.side=e.target.value;render();};
    const runButton=host.querySelector('#scene-run-button');if(runButton)runButton.onclick=()=>onRunScene({mode:mode.id,seasonId:mode.seasonId,floorId:state.target,
      ...(regular?{side:Number(state.side)}:{})});
  };
  render();
}
