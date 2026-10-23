// Canonical scene inventory for the four endgame modes.
// This module exposes sourced stage data without pretending that enemy AI is complete.
import { listScenarios, scenarioSources } from '../core/scenario.mjs';
import { buildMonster, listAbyssEnemies } from '../core/enemy.mjs';
import { isEnemyMechanicRegistered } from './encounters.mjs';

export const ENDGAME_MODES = Object.freeze([
  { id: 'moc', label: '混沌回忆', source: 'abyss' },
  { id: 'pf', label: '虚构叙事', source: 'abyss' },
  { id: 'as', label: '末日幻影', source: 'abyss' },
  { id: 'anomaly', label: '异相仲裁', source: 'peak' },
]);

const latest = (rows, key) => rows.reduce((hit, row) =>
  hit == null || row[key] > hit[key] ? row : hit, null);

/** Latest available scene list for each mode; regular rotations and Arbitration
 * have different schedules, so the UI must not describe all four as one timer. */
export function listEndgameTargets(ctx) {
  const regular = listScenarios(ctx);
  const out = ENDGAME_MODES.map((mode) => {
    if (mode.source === 'abyss') {
      const seasons = regular.filter((s) => s.mode === mode.id);
      const season = latest(seasons, 'seasonId');
      // Source tables retain empty future floor slots (null floor name, no
      // enemies, no level group). They are not playable stages and otherwise
      // appear as selectable rows that fail when inspected.
      const targets = (season?.floors ?? []).filter((floor) => {
        const row = ctx.floorByKey.get(`${mode.id}:${season.seasonId}:${floor.floorId}`);
        const npcIds = Array.isArray(row?.npcMonsterIds) ? row.npcMonsterIds.flat(2) : [];
        return row && (row.bossMonsterId != null || npcIds.some((id) => id != null));
      });
      return {
        ...mode,
        seasonId: season?.seasonId ?? null,
        seasonName: season?.name ?? null,
        version: ctx.data._meta?.version ?? null,
        targets,
        records: season ? season.floors.flatMap((floor) =>
          ctx.abyssEventByKey.get(`${mode.id}:${season.seasonId}:${floor.floorId}`) ?? []) : [],
      };
    }
    const season = latest(ctx.data.peak?.seasons ?? [], 'id');
    const stages = (ctx.data.peak?.stages ?? []).filter((s) => s.seasonId === season?.id)
      .sort((a, b) => a.slot === b.slot ? a.seq - b.seq : a.slot === 'pre' ? -1 : 1);
    return {
      ...mode,
      seasonId: season?.id ?? null,
      seasonName: season?.name ?? null,
      version: season?.version ?? ctx.data._meta?.version ?? null,
      targets: stages.map((s) => ({
        id: s.id, floorId: s.id, name: s.name, label: `${s.name} · Lv.${s.level}`,
        isBoss: s.slot === 'boss',
      })),
      records: [],
    };
  });
  return out;
}

function skillInventory(ctx, enemy) {
  return ctx.monsterSkillsByChildId.get(enemy.childId) ?? [];
}

function annotateEnemy(ctx, enemy) {
  const registered = isEnemyMechanicRegistered(enemy.childId) || isEnemyMechanicRegistered(enemy.monsterId);
  const aiRef = ctx.enemyAIByChildId.get(enemy.childId);
  const aiFile = aiRef ? ctx.enemyAIFileByPath.get(aiRef.aiPath) : null;
  return {
    ...enemy,
    rank: ctx.monsterById.get(enemy.monsterId)?.rank ?? ctx.monsterById.get(enemy.childId)?.rank ?? null,
    skills: skillInventory(ctx, enemy),
    aiSource: aiRef ? { ...aiRef, aiFile: aiFile ?? null, sourceRef: ctx.data.enemyAI?.source?.ref ?? null } : null,
    behaviorStatus: registered ? 'registered' : 'missing',
    behaviorGap: registered ? null : '尚未将敌方 AI、动作倍率 / 命中和阶段机制转为可执行规则',
  };
}

/** Preserve Fiction: Crossover's source-defined infinite-wave roster. The
 * database stores a template row per monster ID, while waves_json stores the
 * actual ordered spawn list; both must agree before the roster is trusted. */
function compileInfiniteWavePlans(event, enemies) {
  const rawWaves = event?.waves;
  if (!rawWaves || Array.isArray(rawWaves) || typeof rawWaves !== 'object') return [];
  return Object.entries(rawWaves).map(([key, source], index) => {
    const id = String(source?.infinite_wave_id ?? key);
    const sourceList = Array.isArray(source?.monster_group_id_list) ? source.monster_group_id_list : [];
    const templates = enemies.filter((enemy) => String(enemy.infiniteWaveId ?? '') === id);
    const sourceCounts = new Map();
    for (const childId of sourceList) sourceCounts.set(Number(childId), (sourceCounts.get(Number(childId)) ?? 0) + 1);
    const rowCounts = new Map(templates.map((enemy) => [Number(enemy.childId), Number(enemy.spawnCount ?? 1)]));
    const sameCounts = sourceCounts.size === rowCounts.size && [...sourceCounts].every(([childId, count]) => rowCounts.get(childId) === count);
    const params = Array.isArray(source?.param_list) ? [...source.param_list] : [];
    const hpScalingConsistent = templates.length > 0 && Number.isFinite(params[1]) && templates.every((enemy) =>
      enemy.hpFormula?.operands?.infinite_param === params[1]);
    const gateTemplates = templates.filter((enemy) => enemy.childId!==8003060&&['Elite','LittleBoss','Boss'].includes(enemy.rank));
    const gateCandidate = gateTemplates.length === 1 && sourceList.filter(childId => Number(childId) === Number(gateTemplates[0].childId)).length === 1
      ? Number(gateTemplates[0].childId) : null;
    const waveController = templates.some(enemy=>Number(enemy.childId)===8003060)?8003060:null;
    return {
      index: index + 1,
      id,
      monsterGroupIds: [...sourceList],
      sourceCount: sourceList.length,
      maxMonsterCount: source?.max_monster_count ?? null,
      maxTeammateCount: source?.max_teammate_count ?? null,
      fieldCapSupported: Number.isInteger(source?.max_teammate_count) && source.max_teammate_count >= 1 && source.max_teammate_count <= 5,
      waveControllerChildId:waveController,
      gateCandidateChildId: gateCandidate,
      gateCandidateSource: gateCandidate == null ? null : '本波名单唯一 Elite/LittleBoss/Boss rank 模板，已排除不可选取的 8003060 波次控制体',
      ability: source?.ability ?? '',
      params,
      attackAddedRatio: Number.isFinite(params[0]) ? params[0] : null,
      hpAddedRatio: Number.isFinite(params[1]) ? params[1] : null,
      clearPreviousAbility: source?.clear_previous_ability === true,
      eliteGroup: source?.elite_group ?? null,
      templates: templates.map((enemy) => ({ childId: enemy.childId, name: enemy.name, rank:enemy.rank, count: enemy.spawnCount ?? 1 })),
      templateCountsConsistent: sameCounts,
      hpScalingConsistent,
      lineupConsistent: sameCounts && hpScalingConsistent,
    };
  });
}

/** Resolve one selectable stage into sourced enemy rows and behavior coverage.
 * `side` is the player's half (1/2) in MoC, PF and AS; Arbitration uses its
 * four separate stages and keeps both scripted waves together. */
export function inspectEndgameTarget(ctx, { mode, seasonId = null, floorId, side = null }) {
  if (!ENDGAME_MODES.some((m) => m.id === mode)) throw new Error(`未知终局模式：${mode}`);
  if (mode !== 'anomaly') {
    const season = seasonId ?? latest(ctx.data.abyssSeasons.filter((s) => s.mode === mode), 'seasonId')?.seasonId;
    const all = listAbyssEnemies(ctx, { mode, seasonId: season, floorId });
    if (!all.length) throw new Error(`${mode}:${season}:${floorId} 没有敌人数据`);
    const sourceEnemies = all.filter((e) => side == null || e.side === side).map((e) => annotateEnemy(ctx, e));
    const events = (ctx.abyssEventByKey.get(`${mode}:${season}:${floorId}`) ?? [])
      .filter((e) => side == null || e.side === side);
    const infiniteWavePlans = mode === 'pf' ? events.flatMap((event) =>
      compileInfiniteWavePlans(event, sourceEnemies.filter((enemy) => enemy.side === event.side && enemy.event === event.event))
        .map((wave) => ({ ...wave, side: event.side, event: event.event }))) : [];
    const expectedInfinitePlanCount = events.reduce((count, event) => count + Object.keys(event.waves ?? {}).length, 0);
    const infiniteWavePlanComplete = mode !== 'pf' || (infiniteWavePlans.length > 0 && infiniteWavePlans.length === expectedInfinitePlanCount &&
      infiniteWavePlans.every((wave) => wave.monsterGroupIds.length > 0 && wave.lineupConsistent &&
        Number.isInteger(wave.maxMonsterCount) && Number.isInteger(wave.maxTeammateCount)));
    const planIndex = new Map(infiniteWavePlans.map((wave, index) => [`${wave.side}:${wave.event}:${wave.id}`, index]));
    const enemies = mode === 'pf' && infiniteWavePlans.length
      ? sourceEnemies.map((enemy) => {
        const index = planIndex.get(`${enemy.side}:${enemy.event}:${enemy.infiniteWaveId}`) ?? -1;
        const wave = infiniteWavePlans[index];
        return { ...enemy, templateGroupIndex: enemy.wave, wave: index >= 0 ? index : null,
          sourceOrder: wave?.monsterGroupIds.findIndex(id => Number(id) === Number(enemy.childId)) ?? -1 };
      }).sort((a, b) => (a.wave ?? Number.MAX_SAFE_INTEGER) - (b.wave ?? Number.MAX_SAFE_INTEGER) || a.sourceOrder - b.sourceOrder)
      : sourceEnemies;
    const floor = ctx.floorByKey.get(`${mode}:${season}:${floorId}`) ?? null;
    const phase = Number.isInteger(side) && Array.isArray(floor?.phase) ? floor.phase[side - 1] ?? null : null;
    const phaseConfig = phase?.boss_monster_config ?? null;
    const stageMechanics = phaseConfig ? {
      source: 'abyss_floors.phase_json', enemySide: side,
      difficulty: phaseConfig.difficulty ?? null,
      difficultyList: phaseConfig.difficulty_list ?? [],
      tags: phaseConfig.tag_list ?? [], phases: phaseConfig.phase_list ?? [],
      difficultyGuides: phaseConfig.difficulty_guide_list ?? [],
      textGuides: phaseConfig.text_guide_list ?? [],
    } : null;
    const rules = scenarioSources(ctx, { mode, seasonId: season, floorId })
      .filter((rule) => rule.kind !== 'abyss_tag' || side == null || rule.scope?.enemySide == null || rule.scope.enemySide === side);
    const unitCoverage = enemies.map((e) => ({ id: e.childId, name: e.name, status: e.behaviorStatus }));
    return {
      mode, seasonId: season, floorId, side, enemies, events, infiniteWavePlans,
      infiniteWavePlanComplete, rules, stageMechanics,
      behaviorComplete: unitCoverage.every((e) => e.status === 'registered'),
      behaviorGaps: [...new Set(unitCoverage.filter((e) => e.status !== 'registered').map((e) => e.name))],
      hpProvenance: 'abyss_wave_monsters',
      _provenance: { lineup: infiniteWavePlanComplete ? 'known' : 'inconsistent', stats: 'known', enemyBehavior: unitCoverage.every((e) => e.status === 'registered') ? 'known' : 'missing' },
    };
  }

  const season = seasonId ?? latest(ctx.data.peak?.seasons ?? [], 'id')?.id;
  const stageKey = `${season}:${floorId}`;
  const stage = ctx.peakStageByKey.get(stageKey);
  if (!stage) throw new Error(`异相仲裁 ${season}:${floorId} 没有场景数据`);
  const stageHp = (ctx.data.peak?.hpNotes ?? []).find((row) => row.seasonId === season && String(row.stageId) === String(floorId)) ?? null;
  const sourceWaves = [...(ctx.peakWaveByStageKey.get(stageKey) ?? [])].sort((a, b) => a.id - b.id);
  const waves = sourceWaves.map((wave) => ({ ...wave, sourceHpEstimate: wave.estimatedHp ?? null }));
  const all = waves.flatMap((wave, waveIndex) => Object.values(wave.monsters ?? {}).map((childId, slot) => {
    const source = (ctx.peakMonsterByStageKey.get(stageKey) ?? []).find((m) => m.waveId === wave.id && m.childId === childId);
    const monsterId = ctx.monsterChildByChildId.get(childId)?.monsterId ?? childId;
    let panel = null;
    try {
      panel = buildMonster(ctx, { monsterId, childId, level: stage.level,
        hardLevelGroup: stageHp?.hardLevelGroup, eliteGroup: wave.eliteGroup });
    } catch {
      // Keep the encounter roster inspectable even when this snapshot lacks a
      // formula input; do not substitute a guessed panel.
    }
    const enemy = {
      side: 1, event: 0, wave: waveIndex + 1, waveId: wave.id, slot,
      monsterId,
      childId, name: source?.name ?? ctx.monsterById.get(childId)?.name ?? `敌人 ${childId}`,
      mode, seasonId: season, floorId, level: stage.level,
      hardLevelGroup: stageHp?.hardLevelGroup ?? null, eliteGroup: wave.eliteGroup ?? null,
      hp: panel?.hp ?? null, atk: panel?.atk ?? null, def: panel?.def ?? null,
      speed: panel?.speed ?? null, stance: panel?.stance ?? null,
      statusRes: Number.isFinite(panel?.statusRes) ? panel.statusRes * 100 : null,
      res: panel?.res ?? null,
      // Stage damage types and individual enemy weaknesses are different
      // source fields; prefer the concrete enemy row when available.
      weakness: source?.weakness ?? stage.weakness ?? [],
      estimatedHp: wave.estimatedHp ?? null,
      _provenance: panel ? { hp: 'formula-derived', level: 'known', atk: 'formula-derived',
        def: 'formula-derived', speed: 'formula-derived', eliteGroup: 'peak.stage_wave',
        hardLevelGroup: 'peak.stage_hp' } : { hp: 'unavailable', level: 'known' },
    };
    return annotateEnemy(ctx, enemy);
  }));
  const wavesWithTotals = waves.map((wave) => ({ ...wave,
    calculatedHpTotal: all.filter((enemy) => enemy.waveId === wave.id && Number.isFinite(enemy.hp))
      .reduce((sum, enemy) => sum + enemy.hp, 0),
  }));
  const unitCoverage = all.map((e) => ({ id: e.childId, name: e.name, status: e.behaviorStatus }));
  const campaignRules = {
    season: ctx.peakSeasonById.get(season) ?? null,
    bossConfig: (ctx.data.peak?.bossConfigs ?? []).find((rule) => rule.seasonId === season) ?? null,
  };
  return {
    mode, seasonId: season, floorId, stage, waves: wavesWithTotals, stageHp, enemies: all, campaignRules,
    tags: ctx.peakTagByStageKey.get(stageKey) ?? [],
    behaviorComplete: unitCoverage.every((e) => e.status === 'registered'),
    behaviorGaps: [...new Set(unitCoverage.filter((e) => e.status !== 'registered').map((e) => e.name))],
    hpProvenance: all.every((enemy) => Number.isFinite(enemy.hp))
      ? 'HSR monster formula using peak battle level, hard-level group, and each wave elite group'
      : 'formula inputs incomplete',
    _provenance: { lineup: 'known', stats: all.every((enemy) => Number.isFinite(enemy.hp)) ? 'formula-derived' : 'partial',
      enemyBehavior: unitCoverage.every((e) => e.status === 'registered') ? 'known' : 'missing' },
  };
}
