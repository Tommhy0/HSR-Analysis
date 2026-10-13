// 生成一条「实测锚点」的骨架，填进 _data_cache/anchors.json 用。
//
//   node _scripts/make_anchor.mjs 1101                    列出这个角色哪些技能能算
//   node _scripts/make_anchor.mjs 1101 110103             生成骨架（打到 stdout）
//   node _scripts/make_anchor.mjs 1101 110103 --append    直接追加进 anchors.json
//
// 可选覆盖：
//   --level 10        技能等级（默认游戏内基础等级：普攻 6、其余 10）
//   --eidolon 2       星魂数（会把 R3/R5 的 +2/+1 叠上去）
//   --hits 3          段数
//   --atk 2400 --crit 0.85 --cd 1.7 --hp 4000 --def 1200
//   --enemy def=1000,res=0.2        res 是该技能属性的抗性
//   --agg dmgBoost=0.5,vuln=0.1,defShred=0.2 ...
//   --observed 123456  游戏里实际打出的那个数
//
// ★ 为什么要有这个脚本 ★
//   anchors.json 是**唯一**能证明「最终伤害数字是对的」的东西（库里没有任何一列
//   是游戏内实际打出的伤害）。但如果让人手抄 ability.terms 数组，抄错一个 paramIndex
//   就会让锚点失败，而失败看起来像「公式算错了」—— 于是人开始怀疑公式，实际是自己
//   抄错了。骨架由代码生成，把「抄」这一步整个删掉。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, characterDisplayName, SKILL_TYPE_CN, ELEMENTS } from '../core/ctx.mjs';
import { suggestPanel, emptyPanel } from '../core/panel.mjs';
import { listAbilities, toHitAbility } from '../core/abilities.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, '_data_cache', 'hsr_core.json');
const ANCHORS = path.join(ROOT, '_data_cache', 'anchors.json');

// --- 参数 ----------------------------------------------------------------
const argv = process.argv.slice(2);
const flags = {};
const positional = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) {
    const k = a.slice(2);
    if (k === 'append') { flags.append = true; continue; }
    flags[k] = argv[++i];
  } else positional.push(a);
}
const [charArg, skillArg] = positional;

if (!charArg) {
  console.error('用法: node _scripts/make_anchor.mjs <角色ID> [技能ID] [--append] [--level N] ...');
  console.error('例:   node _scripts/make_anchor.mjs 1101');
  process.exit(1);
}

// --- 数据 ----------------------------------------------------------------
if (!fs.existsSync(DATA)) {
  console.error('缺少 _data_cache/hsr_core.json，先跑 node _scripts/build_data.mjs');
  process.exit(1);
}
const data = JSON.parse(fs.readFileSync(DATA, 'utf8'));
const ctx = createContext(data);

const characterId = /^\d+$/.test(charArg) ? Number(charArg) : null;
const ch = characterId == null
  ? [...data.characters].find((c) => c.name === charArg)
  : ctx.charById.get(characterId);
if (!ch) {
  console.error(`找不到角色「${charArg}」。传角色 ID（数字）或者完整的角色名。`);
  process.exit(1);
}

const eidolon = Number(flags.eidolon ?? 0);
const abilities = listAbilities(ctx, ch.id, { eidolon, baked: data.abilities });

// 不给技能 ID 时：把能算的技能列出来，人挑一个
if (!skillArg) {
  console.log(`${characterDisplayName(ch, data.characters)}（ID ${ch.id}）能算的技能：\n`);
  const usable = abilities.filter((a) => a.status === 'ok');
  for (const a of usable) {
    const terms = a.terms.map((t) => `${t.scaling}×${t.multiplier}`).join(' + ')
      || '(无倍率项)';
    console.log(`  ${a.skillId}  ${(SKILL_TYPE_CN[a.type] ?? a.type ?? '?').padEnd(4)} ${a.name}`);
    console.log(`      ${a.element ?? '无属性'}  ${terms}${a.hits !== 1 ? `  ${a.hits} 段` : ''}`);
  }
  // ★ 不能算的**分三桶**打，别混成一句「不能算的」★
  //   三者的语义完全不同，混在一起会让人以为「不造成伤害」也是一种缺口：
  //     unresolved   真缺口 —— 描述里没解析出倍率，**只有这桶值得人去补**
  //     out-of-scope 击破伤害 —— 有意不算，v1 的范围外
  //     non-damage   治疗/护盾/增益 —— 本来就没有倍率这回事
  //   三桶都当不了锚点（下面那道 status==='ok' 的闸拦着），但值得分开说。
  const BUCKETS = [
    ['unresolved', '还没解析出倍率的'],
    ['out-of-scope', '有意不算的（击破伤害）'],
    ['non-damage', '本来就不造成伤害的'],
  ];
  let shown = 0;
  for (const [status, label] of BUCKETS) {
    const rows = abilities.filter((a) => a.status === status);
    shown += rows.length;
    if (!rows.length) continue;
    console.log(`\n  ${label} ${rows.length} 个（都当不了锚点）：`);
    for (const a of rows) console.log(`  ${a.skillId}  ${a.name} —— ${a.note}`);
  }
  // ★ 状态表是**别人的**（core/abilities.mjs），这里只是一个展示分桶 ★
  //   上面那份 BUCKETS 是硬编码的，那边将来加第四个 status，这里会**静默**
  //   少打几条 —— 而「少打几条」正是这个项目最不能犯的错。所以对一下总数，
  //   对不上就把剩下的原样倒出来，宁可难看也不吞掉。
  if (shown !== abilities.length - usable.length) {
    const known = new Set(BUCKETS.map(([s]) => s));
    const rest = abilities.filter((a) => a.status !== 'ok' && !known.has(a.status));
    console.log(`\n  ⚠ 还有 ${rest.length} 条的状态不在上面三桶里`
      + `（${[...new Set(rest.map((a) => a.status))].join(', ')}）—— 这份分桶表该更新了：`);
    for (const a of rest) console.log(`  ${a.skillId}  [${a.status}]  ${a.name} —— ${a.note}`);
  }
  console.log(`\n挑一个再跑: node _scripts/make_anchor.mjs ${ch.id} <技能ID>`);
  process.exit(0);
}

const ab = abilities.find((a) => String(a.skillId) === String(skillArg));
if (!ab) {
  console.error(`角色 ${ch.id} 身上没有技能 ${skillArg}`);
  process.exit(1);
}
// ★ 只有 status==='ok' 的技能能当锚点 ★
//   倍率没解析出来的技能算出来的是 null，拿它去对实测数字，失败原因永远是
//   「倍率取不到」，跟公式对不对毫无关系 —— 那是白跑一趟。
if (ab.status !== 'ok') {
  console.error(`技能 ${ab.skillId}（${ab.name}）现在算不了，不能当锚点：`);
  console.error(`  ${ab.note}`);
  process.exit(1);
}

if (flags.hits != null) ab.hits = Math.max(1, Number(flags.hits));
if (flags.level != null) {
  // 显式指定等级时按参数表重取一遍倍率，绕开「基础等级是 6/10」那个假设。
  // ★ 锚点里的倍率和等级必须自洽 —— 等级写 10 而倍率还是 12 级的值，
  //   锚点怎么调都对不上，而且看起来像公式错。
  const lv = Number(flags.level);
  const sk = (ctx.skillsByChar.get(ch.id) ?? []).find((s) => String(s.id) === String(ab.skillId));
  const row = sk?.params?.[String(lv)]?.param_list;
  if (!row) {
    console.error(`技能 ${ab.skillId} 没有等级 ${lv} 的参数行`);
    process.exit(1);
  }
  // 人工覆盖表优先：它可能整个换掉了 terms（desc 解析不出来的技能走这条路）
  const ov = (data.annotations?.multipliers ?? [])
    .find((m) => String(m.skillId) === String(ab.skillId));
  const raw = ov?.terms?.length ? ov.terms : (data.abilities[String(ab.skillId)]?.terms ?? []);
  const terms = [];
  for (let i = 0; i < ab.terms.length; i++) {
    const t = ab.terms[i];
    // ★ 按**下标**对齐，不按 scaling 找 ★ 卡芙卡战技那种 MULTI_TERM 的
    //   多项 scaling 都是 'atk'，按 scaling 找会全部取到第一项的 paramIndex。
    const src = raw[i] ?? {};
    const m = src.literal ?? (src.multiplier?.paramIndex != null
      ? row[src.multiplier.paramIndex - 1] : t.multiplier);
    terms.push({ scaling: t.scaling, multiplier: Number.isFinite(m) ? m : t.multiplier,
      flatAdd: src.flatAdd == null ? 0
        : (src.flatAdd.literal ?? (src.flatAdd.paramIndex != null
          ? row[src.flatAdd.paramIndex - 1] : 0)) });
  }
  ab.terms = terms;
  ab.level = lv;
}

// --- 面板 ----------------------------------------------------------------
const suggested = suggestPanel(ctx, {
  characterId: ch.id, level: Number(flags.charLevel ?? 80), lightconeId: null,
}).panel;
const panel = { ...emptyPanel(), ...suggested };
const setNum = (k, v) => { if (v != null && Number.isFinite(Number(v))) panel[k] = Number(v); };
setNum('atk', flags.atk); setNum('hp', flags.hp); setNum('def', flags.def);
setNum('critRate', flags.crit); setNum('critDmg', flags.cd);
setNum('speed', flags.spd);
panel.elation = null;   // 库里没有欢愉度基值，永远留 null

// --- 敌人 ----------------------------------------------------------------
function kv(spec) {
  const out = {};
  for (const part of String(spec ?? '').split(',')) {
    const [k, v] = part.split('=');
    if (k && v !== undefined && Number.isFinite(Number(v))) out[k.trim()] = Number(v);
  }
  return out;
}
const e = kv(flags.enemy);
const enemy = {
  source: 'manual',
  def: e.def ?? null,
  // 抗性表按七属性全给，只填该技能的那一个也行
  res: Object.fromEntries(ELEMENTS.map((el) => [el, el === ab.element ? (e.res ?? 0) : 0])),
  hp: e.hp ?? null,
  label: flags.enemyLabel ?? '手动填的敌人',
};

// --- 增益 ----------------------------------------------------------------
// ★ 这一块是最容易漏的 ★ 游戏里打出锚点那个数的瞬间，身上通常带着一堆增益。
//   不把它们喂进来，锚点**必然对不上**，而失败看起来像公式错了。
const aggIn = kv(flags.agg);
const agg = {
  atkPct: aggIn.atkPct ?? 0, atkFlat: aggIn.atkFlat ?? 0,
  hpPct: aggIn.hpPct ?? 0, defPct: aggIn.defPct ?? 0,
  critRate: aggIn.critRate ?? 0, critDmg: aggIn.critDmg ?? 0,
  dmgBoost: aggIn.dmgBoost ?? 0,
  elemDmg: { [ab.element]: aggIn.elemDmg ?? 0 },
  abilityDmg: {},
  resPen: { [ab.element]: aggIn.resPen ?? 0 },
  defShred: aggIn.defShred ?? 0, defIgnore: aggIn.defIgnore ?? 0,
  vuln: aggIn.vuln ?? 0, dmgReduction: aggIn.dmgReduction ?? 0,
  _contributions: [],
};

const anchor = {
  id: flags.id ?? `${ch.id}.${ab.skillId}.${Date.now().toString(36)}`,
  _说明: `${characterDisplayName(ch, data.characters)} · ${ab.name} · ${ab.element ?? '无属性'} · `
    + `技能等级 ${ab.level} · 星魂 ${eidolon} · 段数 ${ab.hits}`,
  critMode: flags.critMode ?? 'noncrit',
  attackerLevel: 80,
  panel,
  ability: toHitAbility(ab),
  enemy,
  agg,
  state: { broken: false },
  observed: flags.observed != null ? Number(flags.observed) : null,
  tolerance: flags.tolerance != null ? Number(flags.tolerance) : 0.02,
};

if (anchor.observed == null) {
  console.error('⚠ observed 还是 null —— 把游戏里实际打出的那个数用 --observed 填上，');
  console.error('  或者手工补进生成的结果里。没填 observed 的锚点在 verify 里会被判 FAIL。\n');
}

const text = JSON.stringify(anchor, null, 2);

if (flags.append) {
  let doc = { anchors: [] };
  if (fs.existsSync(ANCHORS)) {
    doc = JSON.parse(fs.readFileSync(ANCHORS, 'utf8'));
    doc.anchors = doc.anchors ?? [];
  }
  doc.anchors.push(anchor);
  fs.writeFileSync(ANCHORS, JSON.stringify(doc, null, 2) + '\n', 'utf8');
  console.log(`已追加进 ${path.relative(ROOT, ANCHORS)}（现在 ${doc.anchors.length} 条）`);
  console.log(`跑 node _scripts/verify.mjs 看第 8 节。`);
} else {
  console.log(text);
  console.error(`\n（粘进 ${path.relative(ROOT, ANCHORS)} 的 anchors 数组里，或者加 --append 让它自己写）`);
}
