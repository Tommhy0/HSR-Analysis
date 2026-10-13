// 从 HSR_现有_4.5.db 剪裁出计算器需要的静态数据。
//
// 产物:
//   _data_cache/hsr_core.json   纯数据，供 node 端脚本与 verify 读
//   _data_cache/data.inline.js  一行 `window.__HSR_DATA__ = {...}`，开发期给页面 <script> 用
//
// 为什么要有 data.inline.js：成品是**双击即用**的单文件 HTML，`file://` 下 fetch
// 本地 json 会被 CORS 拦。所以页面永远不 fetch，只读 window.__HSR_DATA__。
// 开发和成品于是只差「数据怎么塞进去」这一件事（成品是 gzip+base64 内嵌）。
//
// 用法: node _scripts/build_data.mjs
//
// 另外两样东西也在这里烧进数据块，因为它们同样是**运行期要读、但浏览器读不到文件**的：
//   annotations   标注表（core/annotations.mjs 用 fs 读，浏览器只能从数据块拿）
//   abilities     提取器的倍率提案（运行期要把它变成数值，见 core/abilities.mjs）
// 走到这一步之后，页面端就真的只依赖 window.__HSR_DATA__ 一个来源了。
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { loadAll } from '../core/annotations.mjs';
import { DAMAGE_TAGS } from '../core/ctx.mjs';
import { runExtract } from './extract_buffs.mjs';
import { buildCatalog } from './build_catalog.mjs';
import { abilitiesFromProposals } from '../core/abilities.mjs';
import { supplementData, buildDataReport } from './supplement_data.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const activePath = path.join(ROOT, 'data', 'active_database.json');
const active = fs.existsSync(activePath) ? JSON.parse(fs.readFileSync(activePath,'utf8')) : null;
const DB = process.env.HSR_DATABASE ?? (active ? path.resolve(ROOT, active.database) : path.join(ROOT, '..', '核心数据库', '基本数据', 'HSR_现有_4.5.db'));
const OUT_DIR = path.join(ROOT, '_data_cache');
const OUT_JSON = path.join(OUT_DIR, 'hsr_core.json');
const OUT_INLINE = path.join(OUT_DIR, 'data.inline.js');

const db = new DatabaseSync(DB, { readOnly: true });
const all = (sql) => db.prepare(sql).all();
const databaseVersion = db.prepare("SELECT value FROM meta WHERE key='version'").get()?.value ?? '4.5';

/** 把 '[...]' / '{...}' 文本列解析成对象；坏值返回 fallback 而不是抛。 */
const parse = (v, fallback = null) => {
  if (v == null || v === '') return fallback;
  try { return JSON.parse(v); } catch { return fallback; }
};
/** 数值列：NULL 保留为 null（**不要变成 0** —— 0 和「没有这个数」在伤害计算里意义完全不同） */
const num = (v) => (v == null ? null : Number(v));

const report = [];
const note = (label, n) => report.push([label, n]);

// --- 角色 -------------------------------------------------------------------
// sp_need 列名有误导性，**实为终结技能量上限**（已实测 23/25 吻合）。导出时改名，
// 免得下游有人当成「战技点需求」用。
// icon 要带上：10 个开拓者（8001~8010，五条命途 × 两性别）的 name 全是字面的
// "{NICKNAME}"，界面上十个选项长得一模一样。区分它们的唯一结构化字段就是 icon
// （playerboy=穹 / playergirl=星），没有别的。name 里的 {F#…}{M#…} 是渲染占位符，
// **不要**去解析它。
const characters = all(`
  SELECT id, name, rarity, path, element, sp_need, camp, release, icon,
         enhanced_json, memosprite_json, unique_json
  FROM characters ORDER BY id`).map((r) => ({
  id: r.id, name: r.name, rarity: r.rarity, path: r.path, element: r.element,
  energyMax: num(r.sp_need),      // ← 原名 sp_need，实为能量上限
  camp: r.camp, release: r.release, icon: r.icon,
  enhanced: parse(r.enhanced_json), memosprite: parse(r.memosprite_json),
  unique: parse(r.unique_json),
}));
note('characters', characters.length);

// --- 角色白值 ---------------------------------------------------------------
// 两键（character_id, promotion），**没有 level 列**。成长是线性的:
//   白值 = base + add × (等级-1)
// critical_chance / critical_damage 是**恒定死列** 0.05 / 0.5，不是面板总值，
// 这里直接丢掉 —— 免得下游有人当总值读。要用就用量 BASE_CRIT_RATE 常量。
const charStats = all(`
  SELECT character_id, promotion, hp_base, hp_add, attack_base, attack_add,
         defence_base, defence_add, speed_base
  FROM character_stats ORDER BY character_id, promotion`).map((r) => ({
  id: r.character_id, promotion: r.promotion,
  hp: [r.hp_base, r.hp_add], atk: [r.attack_base, r.attack_add],
  def: [r.defence_base, r.defence_add], spd: r.speed_base,
}));
note('character_stats', charStats.length);

// --- 行迹 -------------------------------------------------------------------
// 970 个属性节点带机器可读的 status_add_list_json（17 种 property_type）。
// 过滤器陷阱: 按 point_type=4 只有 23 行；正确的口径是 status_add_list_json 非空。
const traces = all(`
  SELECT character_id, point_key, point_id, point_type, point_type_name,
         point_name, point_desc, status_add_list_json, param_list_json,
         avatar_promotion_limit
  FROM character_traces ORDER BY character_id, point_id`).map((r) => ({
  charId: r.character_id, key: r.point_key, id: r.point_id,
  type: r.point_type, typeName: r.point_type_name,
  name: r.point_name, desc: r.point_desc,
  statusAdd: parse(r.status_add_list_json, []),
  params: parse(r.param_list_json, []),
  promotionLimit: r.avatar_promotion_limit,
}));
note('character_traces', traces.length);

// --- 星魂 -------------------------------------------------------------------
// 注意 R3/R5 的 param_list_json 是 97/97 全空 —— 「技能等级+2/+1」只存在于 desc。
const ranks = all(`
  SELECT character_id, rank_id, name, desc, param_list_json
  FROM character_ranks ORDER BY character_id, rank_id`).map((r) => ({
  charId: r.character_id, rank: r.rank_id, name: r.name,
  desc: r.desc, params: parse(r.param_list_json, []),
}));
note('character_ranks', ranks.length);

// --- 技能 -------------------------------------------------------------------
// 主键是 skill_id（不是 id）。type 为 NULL 即「天赋」。
const skills = all(`
  SELECT character_id, skill_id, name, type, type_name, tag, desc, simple_desc,
         sp_base, bp_need, bp_add, show_stance_list_json, params_json, extra_json
  FROM character_skills ORDER BY character_id, skill_id`).map((r) => ({
  charId: r.character_id, id: r.skill_id, name: r.name,
  type: r.type ?? 'Talent',        // ← 库里的 NULL 就是天赋，统一成 'Talent'
  typeName: r.type_name, tag: r.tag,
  desc: r.desc, simpleDesc: r.simple_desc,
  spBase: r.sp_base, bpNeed: r.bp_need, bpAdd: r.bp_add,
  stance: parse(r.show_stance_list_json),
  params: parse(r.params_json, {}), extra: parse(r.extra_json),
}));
note('character_skills', skills.length);

// --- 忆灵技能（忆灵技 / 忆灵天赋）--------------------------------------------
// ★ 它们**不在 character_skills 表里** ★ 全部躺在 characters.memosprite_json.skills
//   这一个小字典里，键是 "1140701" 这种 id。不读它，「遐蝶的忆灵技」在界面上
//   就是查无此技 —— 而列表里看起来只是「她只有 5 个技能」，没有一处报错。
//
// ★ 为什么按「打不打伤害」拆成两张表、不并进 `skills` ★
//   `build_catalog.mjs` 遍历 `core.skills` 收增益子句。**伤害**忆灵技一旦混进去，
//   会撞掉 extract_buffs 那边的划分不变量；**辅助**忆灵技则相反 —— 它们本来就该
//   进增益目录，留在 `servantSkills` 里会被 `hsr_build.mjs` 要求「每条都出现在
//   伤害下拉框里」，而那是不可能的。所以：
//     servantSkills   伤害技 → 伤害侧（进 skillsByChar / 技能下拉框）
//     servantSupport  辅助技 → 增益侧（只进目录，不进下拉框）
//   下方两处消费者都按这两张表分流，`servantStats` 把条数报出来，不静默。
//
// ★ 忆灵的生命上限是算得出来的 ★ memosprite_json 直接给了机器可读的公式：
//     hp_inherit: "#5" / hp_base: "#6"  +  hp_skill: 140204（拥有者的那条天赋）
//     ⇒  忆灵HP = 拥有者（局内）生命上限 × params[5] + params[6]
//   真值由 `verify.mjs` 的 `HP_WANT` 钳住（阿格莱雅/衣匠 ×66%+720、风堇 ×50%、
//   长夜月 ×50%、昔涟 ×100%、知更鸟•晴歌 ×70%、开拓者/迷迷 ×80%+640）。
//   ★ 这里原来写的是另一组数（44%+180 / 50%+400）—— 那是错的，凭印象记的 ★
//   系数**不在这里解**（要按技能等级现取），只存引用，运行期由 listAbilities 取。
//
// ★ 忆灵自己的攻击力库里没有 ★ memosprite_json 只有 hp 和 speed。用到的
//   （衣匠、迷迷）标成算不了，**不拿召唤者的攻击力顶替**。

/** `"#6"` → 6；`"0"` / `null` / 其它 → null（表示「没有这一项」）。 */
const paramRef = (v) => {
  const m = /^#(\d+)$/.exec(String(v ?? '').trim());
  return m ? Number(m[1]) : null;
};

// ★ 忆灵技按「打不打伤害」拆成**两张表** ★
//
//   servantSkills   打伤害的（tag ∈ DAMAGE_TAGS）
//                   → 伤害侧：进 `ctx.skillsByChar`，出现在技能下拉框里。
//   servantSupport  纯辅助的（Support / Enhance / Restore …）
//                   → 增益侧：只进**增益目录**，不进技能下拉框。
//
// ★ 为什么必须是两张表，不能合成一张加个 flag ★
//   合起来的话得在三个地方各加一次过滤，漏一处就是静默错：
//     ① `ctx.skillsByChar` → `listAbilities` 把昔涟的下拉框从 7 条撑成 24 条，
//        其中 17 条写着「未收录倍率」—— 而它们**根本没有倍率这回事**，标注是错的；
//     ② `extract_buffs.mjs` 的 servant 第二遍会给辅助技也发**倍率提案**，
//        撞掉 `attack_tag_unparsed === empty_desc` 这条划分不变量；
//     ③ `hsr_build.mjs` 的打包自检要求 `servantSkills` 每条都出现在伤害下拉框里。
//   拆开之后这三处**一行都不用改**。
//
// ★ desc 为空的两条两边都不收 ★
//   它们是内部重复变体（名字与同角色的另一条完全相同），收进来只会多出同名条目。
//   跳过并计数，verify 守住这个数 —— 静默丢弃和「本来就没有」在界面上长得一样。
const servantSkills = [];
const servantSupport = [];
let servantEmptyDesc = 0;
for (const ch of characters) {
  const m = ch.memosprite;
  if (!m?.skills) continue;
  const inherit = paramRef(m.hp_inherit);
  const hp = m.hp_skill != null && inherit != null
    ? { skillId: m.hp_skill, inherit, base: paramRef(m.hp_base) }
    : null;
  for (const [sid, s] of Object.entries(m.skills)) {
    if (!s.desc) { servantEmptyDesc++; continue; }
    const rec = {
      charId: ch.id, id: Number(sid), name: s.name,
      type: s.type ?? 'ServantTalent',   // 库里的 NULL 就是忆灵天赋（与 skills 同一约定）
      typeName: s.type_name, tag: s.tag,
      desc: s.desc, simpleDesc: s.simple_desc,
      spBase: s.sp_base, bpNeed: s.bp_need, bpAdd: s.bp_add,
      stance: s.show_stance_list,
      params: s.level ?? {},             // ← 已经是 {"1":{param_list:[…]},…}，和 skills 同形
      extra: s.extra,
      // `hp` 对辅助技没有意义，但**形状保持一致**：`sourcesOfCharacter` 里那句
      // `if (sk.servant) continue;` 靠这个字段认忆灵技，形状不齐会让它漏判。
      servant: { name: m.name, hp },
    };
    (DAMAGE_TAGS.has(s.tag) ? servantSkills : servantSupport).push(rec);
  }
}
const servantStats = {
  charactersWithMemosprite: characters.filter((c) => c.memosprite?.skills).length,
  inMemospriteJson: servantSkills.length + servantSupport.length + servantEmptyDesc,
  listed: servantSkills.length,           // 有 desc 的伤害技 → 技能下拉框
  support: servantSupport.length,         // 有 desc 的辅助技 → 增益目录
  skippedEmptyDesc: servantEmptyDesc,     // desc 空的内部重复变体（两边都不收）
  // ★ 保留旧键名 ★ verify 与 README 都在读它；语义从「丢掉的」改成
  //   「转入 servantSupport 的」，数量不变 —— 但没有一处会静默变。
  skippedNonDamage: servantSupport.length,
  withHpFormula: servantSkills.filter((s) => s.servant.hp).length,
};
note('忆灵技能（memosprite_json）', `${servantStats.listed} 条伤害技入表、`
  + `${servantStats.support} 条辅助技转入增益目录`
  + `（另有 ${servantStats.skippedEmptyDesc} 条 desc 空，两边都不收；`
  + `${servantStats.charactersWithMemosprite} 个角色有忆灵）`);

// --- 光锥 -------------------------------------------------------------------
const lightcones = all(`
  SELECT id, name, rarity, path, skill_name, skill_desc, skill_params_json
  FROM lightcones ORDER BY id`).map((r) => ({
  id: r.id, name: r.name, rarity: r.rarity, path: r.path,
  skillName: r.skill_name, skillDesc: r.skill_desc,
  skillParams: parse(r.skill_params_json, {}),
}));
note('lightcones', lightcones.length);

// 光锥白值 —— 这里**有** max_level 列（角色表没有），所以等级上限从这取。
const lcStats = all(`
  SELECT lightcone_id, promotion, max_level, base_hp, base_attack, base_defence,
         base_hp_add, base_attack_add, base_defence_add
  FROM lightcone_stats ORDER BY lightcone_id, promotion`).map((r) => ({
  id: r.lightcone_id, promotion: r.promotion, maxLevel: r.max_level,
  hp: [r.base_hp, r.base_hp_add],
  atk: [r.base_attack, r.base_attack_add],
  def: [r.base_defence, r.base_defence_add],
}));
note('lightcone_stats', lcStats.length);
// 晋阶等级上限表：库里的 max_level 每段都一样，只取一份。角色表没有 max_level，
// 但两者共用同一套段位（verified: 20/30/40/50/60/70/80），所以这张表两边都用。
const levelCaps = [...new Set(lcStats.map((s) => s.maxLevel))].sort((a, b) => a - b);
note('晋阶等级上限', levelCaps.join('/'));

// --- 遗器套装 ---------------------------------------------------------------
// 只取值，不管件数逻辑 —— 面板由用户直接填，套装在这里是给「配队对比」用的。
const relicsets = all(`
  SELECT id, name, set2_desc, set2_params_json, set4_desc, set4_params_json
  FROM relicsets ORDER BY id`).map((r) => ({
  id: r.id, name: r.name,
  set2Desc: r.set2_desc, set2Params: parse(r.set2_params_json, []),
  set4Desc: r.set4_desc, set4Params: parse(r.set4_params_json, []),
}));
note('relicsets', relicsets.length);

// --- 敌人：等级/防御/血量系数 ----------------------------------------------
const hardLevels = all(`
  SELECT hard_level_group, level, hp_ratio, attack_ratio, defence_ratio,
         speed_ratio, stance_ratio
  FROM hard_level_groups ORDER BY hard_level_group, level`).map((r) => ({
  group: r.hard_level_group, level: r.level,
  hp: num(r.hp_ratio), atk: num(r.attack_ratio), def: num(r.defence_ratio),
  spd: num(r.speed_ratio), stance: num(r.stance_ratio),
}));
note('hard_level_groups', hardLevels.length);

// defence_base 在**这张表**（不是 hard_level_groups，那里只有 ratio）。
// 取值 210（常规）/ 315（28 只次元扑满系）。
const monsterStats = all(`
  SELECT monster_id, attack_base, defence_base, hp_base, speed_base,
         stance_base, status_resistance_base, critical_damage_base, stance_count
  FROM monster_stats`).map((r) => ({
  id: r.monster_id, atk: r.attack_base, def: r.defence_base, hp: r.hp_base,
  spd: r.speed_base, stance: r.stance_base, statusRes: r.status_resistance_base,
  critDmg: r.critical_damage_base, stanceCount: r.stance_count,
}));
note('monster_stats', monsterStats.length);

const monsterChilds = all(`
  SELECT monster_id, child_id, elite_group, hard_level_group, hp_modify_ratio,
         attack_modify_ratio, defence_modify_ratio, speed_modify_ratio,
         speed_modify_value, stance_modify_ratio, stance_modify_value,
         stance_weak_json, damage_type_resistance_json
  FROM monster_childs`).map((r) => ({
  monsterId: r.monster_id, childId: r.child_id, eliteGroup: r.elite_group,
  hardLevelGroup: r.hard_level_group,
  hpMod: num(r.hp_modify_ratio), atkMod: num(r.attack_modify_ratio),
  defMod: num(r.defence_modify_ratio), spdMod: num(r.speed_modify_ratio),
  spdVal: num(r.speed_modify_value),
  stanceMod: num(r.stance_modify_ratio), stanceVal: num(r.stance_modify_value),
  weak: parse(r.stance_weak_json, []),
  res: parse(r.damage_type_resistance_json, {}),
}));
note('monster_childs', monsterChilds.length);

const monsters = all(`SELECT id, name, rank, camp, camp_name, weak_json, desc FROM monsters`).map((r) => ({
  id: r.id, name: r.name, rank: r.rank, camp: r.camp, campName: r.camp_name,
  weak: parse(r.weak_json, []), desc: r.desc,
}));
note('monsters', monsters.length);

// 精英组倍率。两张表结构相同、命名空间不重叠（345+ 是无限波用的），合并导出。
// 没有 name 列 —— 只有倍率。abyss_wave_monsters 的 hp_formula_json 已经
// 把 eg_hp_ratio 预先算好了，所以这张表只有「自由沙盒走公式路径」时才用得上。
const EG_COLS = `elite_group, hp_ratio, attack_ratio, defence_ratio, speed_ratio, stance_ratio`;
const egRow = (r) => ({
  id: r.elite_group, hpRatio: num(r.hp_ratio), atkRatio: num(r.attack_ratio),
  defRatio: num(r.defence_ratio), spdRatio: num(r.speed_ratio),
  stanceRatio: num(r.stance_ratio),
});
const eliteGroups = [
  ...all(`SELECT ${EG_COLS} FROM elite_groups`),
  ...all(`SELECT ${EG_COLS} FROM infinite_elite_groups`),
].map(egRow);
note('elite_groups(+infinite)', eliteGroups.length);

// --- 三深渊 -----------------------------------------------------------------
const abyssSeasons = all(`
  SELECT mode, season_id, name, buff_name, buff_desc, buff_params_json, version,
         begin_time, end_time
  FROM abyss_seasons ORDER BY mode, season_id`).map((r) => ({
  mode: r.mode, seasonId: r.season_id, name: r.name,
  buffName: r.buff_name, buffDesc: r.buff_desc,
  buffParams: parse(r.buff_params_json, []),
  // ★ 字段名**故意**不叫 `version` ★
  //   库里那一列是**整库快照的标签**，不是「这一期是哪个版本开的」——
  //   4.4 的库 90 行全 "4.4"，4.5 的库 92 行全 "4.5"，测试服库全 "4.4.55"，
  //   且逐字等于 `meta.version`。叫 `version` 的话下一个人一定会拿它去显示，
  //   界面上就会出现「从 1.0 第一期到最新一期全是 v4.5」。
  //   真正的版本号由 `core/scenario.mjs` 的 `versionAt(begin_time)` 反推。
  snapshotVersion: r.version, begin: r.begin_time, end: r.end_time,
}));
note('abyss_seasons', abyssSeasons.length);

const abyssFloors = all(`
  SELECT mode, season_id, floor_id, floor_name, is_boss, hard_name,
         damage_types_json, boss_monster_id, tags_json, buffs_json, phase_json
  FROM abyss_floors ORDER BY mode, season_id, floor_id`).map((r) => ({
  mode: r.mode, seasonId: r.season_id, floorId: r.floor_id,
  floorName: r.floor_name, isBoss: r.is_boss, hardName: r.hard_name,
  damageTypes: parse(r.damage_types_json),
  bossMonsterId: r.boss_monster_id,
  tags: parse(r.tags_json), buffs: parse(r.buffs_json), phase: parse(r.phase_json),
}));
note('abyss_floors', abyssFloors.length);

const abyssBuffs = all(`
  SELECT mode, season_id, floor_id, buff_index, name, desc, params_json
  FROM abyss_buffs ORDER BY mode, season_id, floor_id, buff_index`).map((r) => ({
  mode: r.mode, seasonId: r.season_id, floorId: r.floor_id, idx: r.buff_index,
  name: r.name, desc: r.desc, params: parse(r.params_json, []),
}));
note('abyss_buffs', abyssBuffs.length);

// ⚠ abyss_tags 里 55% 的文本全库找不到任何数字，且绝大多数是
// 「首领幻影受到的伤害降低 60%」这类**敌方减伤**。当队伍增益用会算反方向。
// 所以这里照原样导出，但下游一律默认 side='unknown' 并排除 + 告警。
const abyssTags = all(`
  SELECT mode, season_id, floor_id, tag_index, name, desc, params_json, child_json
  FROM abyss_tags ORDER BY mode, season_id, floor_id, tag_index`).map((r) => ({
  mode: r.mode, seasonId: r.season_id, floorId: r.floor_id, idx: r.tag_index,
  name: r.name, desc: r.desc, params: parse(r.params_json, []),
  child: parse(r.child_json),
}));
note('abyss_tags', abyssTags.length);

// --- 深渊波次怪物（本项目的最大资产）---------------------------------------
// 7806 行，hp/level/speed/stance/status_res/toughness **六个列零 NULL**，
// 血量公式已反算通过。三深渊的敌人模型直接取这张表，不走公式。
// hp_formula_json 一并留着 —— verify 要用它反算对拍。
const abyssWave = all(`
  SELECT mode, season_id, floor_id, side, event_index, wave_index, slot,
         monster_id, base_monster_id, monster_name, level, hp, speed, stance,
         status_res, toughness, weaknesses_json, spawn_count, hp_count,
         phase_ratios_json, is_infinite, hp_formula_json
  FROM abyss_wave_monsters ORDER BY mode, season_id, floor_id, side, wave_index, slot`
).map((r) => ({
  mode: r.mode, seasonId: r.season_id, floorId: r.floor_id, side: r.side,
  event: r.event_index, wave: r.wave_index, slot: r.slot,
  monsterId: r.monster_id, baseMonsterId: r.base_monster_id, name: r.monster_name,
  level: r.level, hp: r.hp, spd: r.speed, stance: r.stance,
  statusRes: r.status_res, toughness: r.toughness,
  weak: parse(r.weaknesses_json, []),
  spawnCount: r.spawn_count, hpCount: r.hp_count,
  phaseRatios: parse(r.phase_ratios_json),
  isInfinite: r.is_infinite, hpFormula: parse(r.hp_formula_json),
}));
note('abyss_wave_monsters', abyssWave.length);

// --- 标注表与倍率（构建期烧入）---------------------------------------------
// annotations 是**唯一人工维护**的那份表，原样带过去；页面端不再自己读文件。
const annotations = loadAll(path.join(ROOT, 'annotations'));
note('annotations.buffs', annotations.buffs.length);
note('annotations.multipliers', annotations.multipliers.length);
note('annotations.sides.rules', annotations.sides?.rules?.length ?? 0);
if (annotations.errors.length) {
  // 坏行**报出来** —— 静默跳过等于让人以为自己填的那条生效了
  console.error(`\n⚠ 标注表有 ${annotations.errors.length} 行解析失败：`);
  for (const e of annotations.errors.slice(0, 5)) console.error(`  第 ${e.line} 行: ${e.msg}`);
}

// --- 组装 -------------------------------------------------------------------
const core = {
  _meta: {
    builtAt: new Date().toISOString(),
    version: databaseVersion,
    source: path.basename(DB),
    note: '由 _scripts/build_data.mjs 生成，勿手改。改数据请改源库重跑。',
  },
  characters, charStats, traces, ranks, skills,
  servantSkills, servantSupport, servantStats,
  lightcones, lcStats, levelCaps, relicsets,
  hardLevels, monsterStats, monsterChilds, monsters, eliteGroups,
  abyssSeasons, abyssFloors, abyssBuffs, abyssTags, abyssWave,
  annotations,
};

// 倍率提案必须在 core 组装完之后算 —— runExtract 要吃 core.skills。
supplementData(core, ROOT);
core._meta.version = databaseVersion;
core.relicTables = {
  main: JSON.parse(fs.readFileSync(path.join(ROOT,'data/relics/relic_main_affixes.json'),'utf8')),
  sub: JSON.parse(fs.readFileSync(path.join(ROOT,'data/relics/relic_sub_affixes.json'),'utf8')),
  source: JSON.parse(fs.readFileSync(path.join(ROOT,'data/relics/source.json'),'utf8')),
};
// 放在这里而不是让页面自己跑一遍：提取器是构建期的东西，跑到浏览器里
// 既慢又要带上整套正则。页面只需要「技能 id → 倍率引用」这张表。
const { proposals } = runExtract(core);
core.abilities = abilitiesFromProposals(proposals);
note('abilities（可算倍率的技能）', Object.values(core.abilities)
  .filter((a) => a.provenance === 'extracted' && a.terms.length).length);

// 增益目录（全部 5 类来源的可收录子句）。
// 界面从「选队友角色」改成「勾辅助技能条目」，条目就是这里烘出来的。
// **不存数值** —— 等级/叠影/星魂/件数由运行期的全局开关注入，见 core/catalog.mjs。
{
  const { entries, stats, mismatches } = buildCatalog(core, annotations.buffs);
  core.buffCatalog = entries;
  // 各桶计数也烧进去：界面要能显示「另有 N 条没认出来」，
  // 而不是假装「目录里没有的就是不存在」。
  core.buffCatalogStats = { ...stats, total: entries.length, mismatches };
  note('增益目录', `${entries.length} 条（` + Object.entries(stats.byKind)
    .sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' / ') + '）');
  if (mismatches.length) {
    note('★ 目录 id 冲突（人工表与自动提案对不上，未采信人工那条）',
      `${mismatches.length} 条：${mismatches.slice(0, 3).map((m) => m.id).join(', ')}`);
  }
}

// ★ 这里原来烘过一份 `core.coverage`（97 个角色的覆盖率角标）★
//   界面改成「辅助技能目录」之后它就没用了 —— 那一版是按**角色**发角标，
//   现在用户勾的是**条目**，界面上已经没有一处显示角色级覆盖率。
//   留着它比删掉更坏：没人读的死数据会诱导下一个人把「角色角标」这个口径
//   再搬回来，而搬回来正是这次改掉的东西。
//
//   覆盖率这份数**没有消失**，是换了口径：
//     · 技能侧 → 目录的分桶报表（verify 第 9 节打印，`core.buffCatalogStats`）
//     · 其余来源 → `node _scripts/coverage.mjs`（自己现算，不读烘好的数据）
//
//   ⚠ 删掉它会让 `createContext` / `coverageOf` 在本文件里变成没人用的 import，
//     所以上面两行也一并删了 —— 留着未使用的 import 会让「谁在用 coverageOf」
//     这个问题永远答不准。

core.dataReport = buildDataReport(core);
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_JSON, JSON.stringify(core), 'utf8');
fs.writeFileSync(OUT_INLINE, `window.__HSR_DATA__ = ${JSON.stringify(core)};\n`, 'utf8');

const mb = (p) => (fs.statSync(p).size / 1024 / 1024).toFixed(2) + ' MB';
console.log('数据导出完成:');
for (const [k, v] of report) console.log(`  ${String(k).padEnd(22)} ${v}`);
console.log(`\n  ${OUT_JSON}`);
console.log(`    ${mb(OUT_JSON)}`);
console.log(`  ${OUT_INLINE}`);
console.log(`    ${mb(OUT_INLINE)}`);
