// 审查回归：固定预期值来自手算、技能原文与原始半场数据，不从被测实现生成。
import assert from 'node:assert/strict';
import { createContext } from '../core/ctx.mjs';
import { suggestPanel } from '../core/panel.mjs';
import { computeHit, inCombatPanel } from '../core/damage.mjs';
import { defMultiplier, resMultiplier } from '../core/enemy.mjs';
import { aggregate } from '../core/buffs.mjs';
import { buffsFromSelections, rowView, catalogValue } from '../core/catalog.mjs';
import { listAbilities, toHitAbility } from '../core/abilities.mjs';
import { loadScenario, aggregateScenarioBuffs, buildComparison } from '../core/scenario.mjs';

export function reviewRegressions(data) {
  const ctx = createContext(data);
  const results = [];
  const test = (label, fn) => {
    try { fn(); results.push({ label, pass: true }); }
    catch (e) { results.push({ label, pass: false, detail: e.message }); }
  };
  const near = (actual, expected) => assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) < 1e-8,
    `实际 ${actual}，期望 ${expected}`);
  const panel = { atk: 2000, hp: 4000, def: 1000, critRate: 0, critDmg: 0.5,
    baseStats: { atk: 1000, hp: 2000, def: 500 } };
  const enemy = { def: 1000, res: { Fire: 0, Ice: 0, Physical: 0 } };
  const ability = { type: 'Normal', element: 'Fire', terms: [{ scaling: 'atk', multiplier: 1 }] };
  const hit = (extra = {}) => computeHit({ panel, enemy, ability, ...extra });
  const abilityOf = (charId, skillId) => listAbilities(ctx, charId, {
    baked: data.abilities, element: ctx.charById.get(charId).element,
  }).find((a) => a.skillId === skillId);
  const scenario = loadScenario(ctx, { mode: 'as', seasonId: 3001, floorId: '30011',
    annotations: data.annotations, sides: data.annotations.sides });

  test('审查02：百分比加成只乘白值，三个属性均保留局外平值', () => {
    const p = inCombatPanel(panel, { atkPct: 0.5, atkFlat: 100, hpPct: 0.5, defPct: 0.5 });
    near(p.atk, 2600); near(p.hp, 5000); near(p.def, 1250);
  });
  test('审查02：缺白值时不能用最终面板冒充白值', () => {
    assert.equal(hit({ panel: { ...panel, baseStats: null }, agg: aggregate([{ key: 'atkPct', value: 0.5 }]) }).ok, false);
    near(hit({ panel: { ...panel, baseStats: null }, agg: aggregate([{ key: 'atkFlat', value: 100 }]) }).base, 2100);
  });
  test('审查02：建议面板携带角色和光锥白值', () => {
    const p = suggestPanel(ctx, { characterId: 1001, lightconeId: 20000 }).panel;
    near(p.baseStats.atk, 511.56 + 317.52);
    const lower = suggestPanel(ctx, { characterId: 1001, level: 20, lightconeId: 20000, lightconeLevel: 80 });
    near(lower.sources[1].atk, 317.52);
  });
  test('审查03：姬子战技主目标200%，相邻目标80%，不相加', () => {
    const a = abilityOf(1003, 100302);
    near(hit({ ability: toHitAbility(a) }).base, 4000);
    near(hit({ ability: toHitAbility(a, { targetRole: 'adjacent' }) }).base, 1600);
    assert.equal(hit({ ability: toHitAbility(a) })._assumptions.length > 0, true);
  });
  test('审查03：群攻每只目标使用同一倍率，不乘敌人数', () => {
    const a = abilityOf(1003, 100303);
    near(hit({ ability: toHitAbility(a) }).base, 4600);
    near(hit({ ability: toHitAbility(a, { targetRole: 'adjacent' }) }).base, 4600);
  });
  test('审查03：三月七终结技不把冻结后续伤害并入即时150%', () => {
    near(hit({ ability: toHitAbility(abilityOf(1001, 100103)) }).base, 3000);
  });
  test('审查03：克拉拉反击标记额外伤害必须显式启用', () => {
    const a = abilityOf(1107, 110702);
    near(hit({ ability: toHitAbility(a) }).base, 2400);
    near(hit({ ability: toHitAbility(a, { includeConditional: true }) }).base, 4800);
  });
  test('审查04：符玄18%我方减伤不降低输出，目录标为仅显示', () => {
    const e = data.buffCatalog.find((e) => e.id === '1208.skill.120804.b2');
    const s = buffsFromSelections(ctx, data.buffCatalog, new Set([e.id]), {}, { characterId: 1003 });
    near(s.active[0].value, 0.18);
    near(hit({ agg: aggregate(s.active) }).total, 900);
    assert.ok(rowView(ctx, e, {}).tags.some((t) => t.label === '仅显示'));
    near(hit({ agg: aggregate([{ key: 'dmgReduction', value: 0.18, side: 'enemy' }]) }).total, 738);
  });
  test('审查05：面板火伤100%使无其它增伤的伤害900变1800', () => {
    near(hit({ panel: { ...panel, elemDmg: { Fire: 1 } } }).total, 1800);
    near(hit({ panel: { ...panel, elemDmg: { Ice: 1 } } }).total, 900);
    near(hit({ panel: { ...panel, elemDmg: { Fire: 1 } }, agg: aggregate([{ key: 'dmgBoost', value: 0.5 }]) }).total, 2250);
  });
  test('审查06：减防40%与无视20%加算，防御乘区5/7', () => {
    near(defMultiplier(80, 1000, { defShred: 0.4, defIgnore: 0.2 }), 5 / 7);
    near(defMultiplier(80, 1000, { defShred: 0.7, defIgnore: 0.3 }), 1);
    near(defMultiplier(80, 1000, { defShred: 1.2 }), 1);
  });
  test('审查07：负抗性不折半，正抗性与零抗性连续', () => {
    near(resMultiplier(0, 0.2), 1.2); near(resMultiplier(0.2, 0.2), 1);
    near(resMultiplier(0.2, 0), 0.8); near(resMultiplier(-0.2, 0.2), 1.4);
  });
  test('审查01：两个半场各自仅有60%首领减伤，召唤物不继承', () => {
    for (const side of [1, 2]) {
      const boss = scenario.enemies.find((e) => e.side === side && e.slot === 'monster0');
      const a = aggregateScenarioBuffs([], scenario, boss, { broken: false });
      near(a.dmgReduction, 0.6); near(a.vuln, 0);
      assert.ok(hit({ enemy: boss, agg: a }).total > 0);
    }
    const add = scenario.enemies.find((e) => e.side === 1 && e.slot === 'monster1');
    near(aggregateScenarioBuffs([], scenario, add, {}).dmgReduction, 0);
  });
  test('审查01：不同半场的不同减伤值不会串用', () => {
    const s = { buffs: [
      { key: 'dmgReduction', value: 0.6, side: 'enemy', scope: { enemySide: 1 } },
      { key: 'dmgReduction', value: 0.3, side: 'enemy', scope: { enemySide: 2 } },
    ] };
    near(aggregateScenarioBuffs([], s, { side: 1 }, {}).dmgReduction, 0.6);
    near(aggregateScenarioBuffs([], s, { side: 2 }, {}).dmgReduction, 0.3);
    near(aggregateScenarioBuffs([], s, null, {}).dmgReduction, 0);
  });
  test('审查01：独立减伤相乘，未建模状态不默认触发', () => {
    near(aggregate([{ key: 'dmgReduction', value: 0.5, side: 'enemy' },
      { key: 'dmgReduction', value: 0.6, side: 'enemy' }]).dmgReduction, 0.8);
    const s = loadScenario(ctx, { mode: 'as', seasonId: 3008, floorId: '30081',
      annotations: data.annotations, sides: data.annotations.sides });
    assert.ok(s.gaps.some((g) => g.reason === 'unmodelled_condition'));
    assert.ok(!s.buffs.some((b) => b.label === '层标签「至死方休」'));
  });
  test('审查08：击破前不加易伤，击破后仅加本半场125%', () => {
    const boss = scenario.enemies[0];
    const before = aggregateScenarioBuffs([], scenario, boss, { broken: false });
    const after = aggregateScenarioBuffs([], scenario, boss, { broken: true });
    near(before.vuln, 0); near(after.vuln, 1.25);
    near(after.dmgReduction, 0.6);
    assert.ok(before._skipped.some((b) => b.reason === '需要先击破当前敌人'));
  });
  test('审查01：全库按敌人聚合，减伤不超过100%，不产生负伤害', () => {
    for (const f of data.abyssFloors) {
      const s = loadScenario(ctx, { ...f, annotations: data.annotations, sides: data.annotations.sides });
      for (const e of s.enemies) {
        const a = aggregateScenarioBuffs([], s, e, { broken: false });
        assert.ok(a.dmgReduction >= 0 && a.dmgReduction <= 1, `${s.id}/${e.side}/${e.slot}: ${a.dmgReduction}`);
        const h = hit({ enemy: e, agg: a });
        assert.ok(h.ok && Number.isFinite(h.total) && h.total >= 0, s.id);
      }
    }
  });
  test('审查09：希儿天赋Lv1增伤40%、Lv10增伤80%', () => {
    const e = data.buffCatalog.find((e) => e.id === '1102.skill.110204.b3');
    near(catalogValue(ctx, e, { skillLevels: { 110204: 1 } }), 0.4);
    near(catalogValue(ctx, e, { skillLevels: { 110204: 10 } }), 0.8);
  });
  test('审查10：主结果与同配置对比共用情境，击破前后均一致', () => {
    for (const broken of [false, true]) {
      const e = scenario.enemies[0], state = { broken };
      const buffs = [{ key: 'dmgBoost', value: 0.5 }];
      const main = hit({ enemy: e, state, agg: aggregateScenarioBuffs(buffs, scenario, e, state) });
      const comp = buildComparison(ctx, { scenario, loadouts: [{ label: '全部已勾选', panel, ability, buffs, enemy: e, state }] });
      near(comp.rows[0].total, main.total);
    }
  });
  return results;
}
