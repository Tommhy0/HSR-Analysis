import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createContext } from '../core/ctx.mjs';
import { buildEndgameEncounter } from '../simulator/endgame-battles.mjs';
import { alloyNanny, isEnemyMechanicRegistered, kingPomPom, kingPomPomFantasticStory, sweetGorilla, validateEnemyActor } from '../simulator/encounters.mjs';
import { createBattle, stepBattle, validateBattle } from '../simulator/engine.mjs';
import { inspectEndgameTarget } from '../simulator/endgame-scenes.mjs';
import { strictParty } from '../simulator/party.mjs';

const ctx = createContext(JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json', import.meta.url))));
const party = strictParty(ctx);
const target = inspectEndgameTarget(ctx, { mode: 'pf', seasonId: 2027, floorId: '20274', side: 2 });
const ids = new Set(target.enemies.map(enemy => enemy.childId));
for (const id of [202205004, 300302007, 5012120, 5014023]) assert.ok(ids.has(id), `PF 20274/S2 database roster includes ${id}`);
assert.equal(target.behaviorComplete, true, 'all database lineup templates now have an actor, though some actor mechanics remain partial');

const config = buildEndgameEncounter(ctx, party, { mode: 'pf', seasonId: 2027, floorId: '20274', side: 2 });
assert.equal(config.sceneReplay.enemyLineupComplete, true);
assert.equal(config.sceneReplay.enemyBehaviorRegistered, true);
assert.equal(config.sceneReplay.enemyBehaviorComplete, false, 'partial Pom-Pom / Wooden Lupus mechanics remain explicit');
assert.deepEqual(validateBattle(config), []);
for (const id of [300302007, 5012120, 5014023]) {
  assert.equal(isEnemyMechanicRegistered(id), true);
  const actor = [...config.units, ...(config.endgameSpawnPlan?.waves ?? []).flatMap(wave => wave.units ?? [])]
    .find(unit => unit.childId === id || unit.enemyKit?.id === id);
  assert.ok(actor, `scene actor ${id} is built from the local database row`);
  assert.deepEqual(validateEnemyActor(actor), []);
  assert.ok(actor.provenance.source.includes('HSR_4.6.db'));
}

const sources = new Map(target.enemies.map(enemy => [enemy.childId, enemy]));
const sceneActor = id => {
  const source = sources.get(id);
  if (id === 300302007) return sweetGorilla(ctx, { sceneEnemy: source });
  if (id === 5012120) return alloyNanny(ctx, { sceneEnemy: source });
  if (id === 5014023) return kingPomPomFantasticStory(ctx, { sceneEnemy: source });
  throw new Error(`Unexpected PF actor ${id}`);
};
const runEnemyAction = (actor, flagKey, flag, oneMore = false, shieldAll = false) => {
  const allies = structuredClone(party.units.filter(unit => unit.side === 'ally'));
  for (const ally of allies) {
    delete ally.kit; delete ally.characterId; delete ally.gear; delete ally.memospriteOwner;
    ally.panel = { hp: 1e9, atk: 0, def: 0, speed: 1, critRate: 0, critDmg: 0, effectRes: 0, elemDmg: {}, baseStats: { hp: 1e9, atk: 0, def: 0 } };
    ally.hp = 1e9; ally.energy = 0; ally.energyMax = 0; ally.buffs = []; ally.shields = []; ally.dots = []; ally.resources = {};
    ally.actions = { basic: { name: 'probe', type: 'Normal', element: 'Physical', target: 'single', terms: [] } };
    ally.policy = { autoUltimate: false, basicOnly: true }; ally.standardBreak = false;
  }
  const battle = createBattle({ strict: false, maxAV: 1000, sp: 3, maxSP: 9, seed: 29, critMode: 'noncrit', units: [...allies, actor] });
  const enemy = battle.units.find(unit => unit.side === 'enemy' && unit.enemyKit?.id === actor.enemyKit.id);
  for (const unit of battle.units) unit.distance = 10000;
  enemy.distance = 0;
  if (shieldAll) {
    enemy.panel.effectRes = 0;
    for (const unit of battle.units.filter(unit => unit.side === 'ally')) unit.shields.push({ id: 'test-shield', name: 'test', value: 1e9 });
  }
  enemy.resources[flagKey] = flag;
  if (oneMore) enemy.buffs.push({ id: 'test-one-more', source: enemy.id, name: 'OneMore', tag: 'OneMore', key: 'marker', type: 'buff', value: 0, remaining: null });
  assert.equal(stepBattle(battle), true);
  const action = battle.log.filter(event => event.type === 'action' && event.actor === enemy.id).at(-1);
  assert.ok(action, `${enemy.name} took an action`);
  return { battle, enemy, key: action.key };
};

const gorilla = sceneActor(300302007);
assert.deepEqual(validateEnemyActor(sweetGorilla(ctx, { sceneEnemy: target.enemies.find(enemy => enemy.childId === 300302007) })), []);
assert.equal(runEnemyAction(gorilla, '甜猿泰山AIFlag', 1).key, 'skill01');
assert.equal(runEnemyAction(gorilla, '甜猿泰山AIFlag', 2).key, 'skill03');
const summon = runEnemyAction(gorilla, '甜猿泰山AIFlag', 2);
assert.equal(summon.battle.units.filter(unit => unit.summonerId === summon.enemy.id && unit.active).length, 2);
const shieldBacklash = runEnemyAction(gorilla, '甜猿泰山AIFlag', 1, false, true);
assert.ok(shieldBacklash.battle.log.some(event => event.type === 'mechanic' && event.name === '目标有护盾 · 自身受伤并降低防御'));
assert.ok(shieldBacklash.enemy.buffs.some(buff => buff.key === 'defShred' && buff.value === .2));
assert.deepEqual(gorilla.actions.skill02.repeatCount, 4, 'Sweet Gorilla selects four separate hits while retaining its 3.6x total coefficient');
const charge = runEnemyAction(gorilla, '甜猿泰山AIFlag', 4);
assert.ok(charge.enemy.buffs.some(buff => buff.tag === charge.enemy.enemyKit.chargeTag));

const nanny = sceneActor(5012120);
assert.equal(runEnemyAction(nanny, '合金保姆AIFlag', 1).key, 'skill01');
const nannySecond = runEnemyAction(nanny, '合金保姆AIFlag', 2);
assert.equal(nannySecond.key, 'skill02');
assert.deepEqual(nanny.actions.skill01.hitShares, [.2, .2, .2, .2, .2]);
assert.deepEqual(nanny.actions.skill02.hitShares, [.2, .1, .1, .1, .5]);
assert.ok(Math.abs(nanny.actions.skill01.hitShares.reduce((sum, share) => sum + share, 0) - 1) < 1e-12);
assert.ok(Math.abs(nanny.actions.skill02.hitShares.reduce((sum, share) => sum + share, 0) - 1) < 1e-12);

const pom = sceneActor(5014023);
const expectedCycle = [[1, false, 'skill03'], [2, false, 'skill04'], [2, true, 'skill01'], [3, false, 'skill02'],
  [4, false, 'skill05'], [4, true, 'skill02'], [5, false, 'skill06'], [6, false, 'skill01'], [6, true, 'skill01'], [7, false, 'skill04'], [8, false, 'skill02']];
for (const [flag, oneMore, expected] of expectedCycle) assert.equal(runEnemyAction(pom, 'PF帕姆王AIFlag', flag, oneMore).key, expected, `PF Pom-Pom AIFlag ${flag}, OneMore=${oneMore}`);
assert.deepEqual(pom.actions.skill02.hitShares, [.18, .18, .18, .18, .28]);
assert.deepEqual(pom.actions.skill04.hitShares, [.2, .2, .2, .4]);
assert.deepEqual(pom.actions.skill06.hitShares, [...Array(10).fill(.05), .5]);
for (const key of ['skill02', 'skill04', 'skill06']) {
  assert.ok(Math.abs(pom.actions[key].hitShares.reduce((sum, share) => sum + share, 0) - 1) < 1e-12);
}
const steam = runEnemyAction(pom, 'PF帕姆王AIFlag', 1);
assert.equal(steam.enemy.resources['PF帕姆王长效抗菌层数'], 2);
assert.ok(steam.enemy.buffs.some(buff => buff.tag === 'pfPamSteam' && buff.key === 'dmgBoost' && buff.value === .3));
const antibacterial = steam.enemy.buffs.find(buff => buff.tag === 'pfPamAntibacterial');
assert.ok(antibacterial && antibacterial.key === 'dmgReduction' && antibacterial.stacks === 2 && antibacterial.value === .6,
  'source AllDamageReduce stacks 30% per antibacterial layer');
assert.ok(steam.battle.log.some(event => event.type === 'mechanic' && event.name === '战斗开始 · 召唤隐藏合金保姆' &&
  event.monsterId === 5012120 && event.selectable === false));

const laughterAction = runEnemyAction(pom, 'PF帕姆王AIFlag', 3);
assert.equal(laughterAction.key, 'skill02');
assert.equal(laughterAction.battle.laughter.ally, 3);
assert.equal(laughterAction.enemy.resources['PF帕姆王合金保姆充能'], 3,
  'PF hidden Alloy Nanny charges once for each laughter point awarded by King Pom-Pom');

const nannyCharge = amount => steam.battle.rules.laughterGained(steam.battle, 'ally', amount, null, 'PF hidden Nanny test');
const initialKingHp = steam.enemy.hp, maxKingHp = steam.enemy.panel.hp;
nannyCharge(19);
assert.equal(steam.enemy.resources['PF帕姆王合金保姆充能'], 19);
assert.equal(steam.enemy.resources['PF帕姆王长效抗菌层数'], 2);
nannyCharge(1);
assert.equal(steam.enemy.resources['PF帕姆王合金保姆充能'], 0);
assert.equal(steam.enemy.resources['PF帕姆王长效抗菌层数'], 1);
assert.equal(steam.enemy.buffs.find(buff => buff.tag === 'pfPamAntibacterial')?.value, .3);
nannyCharge(20);
assert.equal(steam.enemy.resources['PF帕姆王长效抗菌层数'], 0);
assert.equal(steam.enemy.resources['PF帕姆王合金保姆充能'], 0);
assert.ok(!steam.enemy.buffs.some(buff => ['pfPamAntibacterial', 'pfPamSteam'].includes(buff.tag)));
assert.ok(Math.abs((initialKingHp - steam.enemy.hp) - maxKingHp * .3) < 1e-6,
  'removing the last layer deals 30% max-HP true damage');
assert.ok(steam.battle.log.some(event => event.type === 'damage' && event.actor === steam.enemy.id && event.kind === 'true' &&
  event.name === '【蒸汽洗涤】解除 · 真实伤害'));
const labor = runEnemyAction(pom, 'PF帕姆王AIFlag', 2);
assert.ok(labor.battle.units.filter(unit => unit.side === 'ally').some(unit => unit.buffs.some(buff => buff.tag === 'pfPamLabor')));

const oldPom = kingPomPom(ctx, { sceneEnemy: { monsterId: 5014020, childId: 5014020, level: 85 } });
assert.deepEqual(validateEnemyActor(oldPom), []);
assert.deepEqual(oldPom.actions.skill02.hitShares, [.18, .18, .18, .18, .28]);
assert.deepEqual(oldPom.actions.skill04.hitShares, [.2, .2, .2, .4]);
assert.deepEqual(oldPom.actions.skill06.hitShares, [...Array(10).fill(.05), .5]);

console.log('PF 20274/S2 checks: DB lineup / panel actor coverage, buildable scene, sourced AI flag branches, Sweet Gorilla summons, five-hit ratios, both Pom-Pom templates, and remaining partial mechanics passed.');
