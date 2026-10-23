// 数据仓库。**唯一碰原始数据的模块** —— 别的模块都通过它取值。
//
// 两条不许违反的规则：
//   1. 取不到就返回 null，**绝不返回 0**。0 和「没有这个数」在伤害计算里
//      是完全不同的两件事，把缺失悄悄变成 0 正是本项目要防的头号错误。
//   2. 不在这里做任何语义判断（「这条增益给谁」「什么条件」）。
//      那是 annotations/buffs.jsonl 的职责。这里只负责「第几项是什么数」。

/** 面板暴击的基值。character_stats.critical_chance/damage 是恒定死列（0.05/0.5），
 *  只能当基值常量用，**不能当面板总值读** —— 在这里写成具名常量就是为了堵死那条路。 */
export const BASE_CRIT_RATE = 0.05;
export const BASE_CRIT_DAMAGE = 0.5;

/** 七种属性。全库的元素枚举就是这七个（英文），中文名另有映射。 */
export const ELEMENTS = ['Physical', 'Fire', 'Ice', 'Thunder', 'Wind', 'Quantum', 'Imaginary'];

export const ELEMENT_CN = {
  Physical: '物理', Fire: '火', Ice: '冰', Thunder: '雷',
  Wind: '风', Quantum: '量子', Imaginary: '虚数',
};

/** 技能 type → 中文名。用于跟星魂 desc 的散文对齐。
 *  库里 type 为 NULL 的天赋在 build_data 阶段已归一成 'Talent'。 */
export const SKILL_TYPE_CN = {
  Normal: '普攻', BPSkill: '战技', Ultra: '终结技',
  Talent: '天赋', ElationDamage: '欢愉技', Assist: '协战技', Maze: '秘技',
};

/**
 * 攻击类技能 —— 只有这些能算伤害。秘技/协战不在内。
 *
 * ★ Servant / ServantTalent 是**忆灵**的技能 ★（`type_name` 分别是忆灵技 / 忆灵天赋）。
 *   它们不在 character_skills 表里，见 build_data.mjs 的 servantSkills 段。
 *   那一张表**只收 tag ∈ DAMAGE_TAGS 的**（纯辅助的忆灵技在构建期就跳过了，
 *   它们属于增益侧，本次不做），所以这里列进来不会把昔涟的技能下拉框撑成 23 条。
 */
export const ATTACK_TYPES = [
  'Normal', 'BPSkill', 'Ultra', 'Talent', 'ElationDamage', 'Servant', 'ServantTalent',
];

/**
 * 「这个技能打不打伤害」的正确判据是 `tag`，不是 `type`。
 *   type 只说它挂在哪个键位（普攻/战技/终结技/天赋），纯 buff 大招（贝洛伯格进行曲、
 *   星空祝言）的 type 一样是 Ultra。用 type 筛会把 156 条纯辅助技算进来。
 *
 * ★ 定义放在 core 而不是提取器里 ★ 提取器（构建期判要不要提案）和运行期
 *   （界面判要不要列进技能下拉框）用的必须是同一份 —— 各写一份迟早漂移，
 *   而漂移的表现是「界面能选但算不出」这种静默不一致。
 */
export const DAMAGE_TAGS = new Set(['SingleAttack', 'AoEAttack', 'Blast', 'Bounce']);

// ---------------------------------------------------------------------------
// 占位符还原
// ---------------------------------------------------------------------------

/**
 * 逐字移植自 货币战争/build.mjs 的 renderParams，保证与站点显示一致。
 *   <unbreak>#N[i]</unbreak>   后跟 % 时把分数乘 100
 *   <unbreak>#N[fK]</unbreak>  保留 K 位小数，同样受 % 影响
 *   #N                         裸占位符，四舍五入取整，**不乘 100**
 * 注意 % 可能在 </unbreak> 外面（正则里用 [^<]* 吞掉中间内容）。
 */
export function renderPlaceholder(desc, params) {
  if (!desc) return desc;
  let out = String(desc);

  const wrapped = out.match(/<unbreak>#[0-9]+\[(i|f[1-6])\][^<]*<\/unbreak>/g);
  if (wrapped) {
    [...wrapped].sort().forEach((token) => {
      const parts = token
        .replace('<unbreak>', '')
        .replace('</unbreak>', '')
        .match(/^#([0-9]+)\[(i|f[1-6])\](.*)$/);
      if (!parts) return;
      const idx = Number.parseInt(parts[1], 10);
      const fmt = parts[2];
      const suffix = parts[3];
      const raw = Number(params?.[idx - 1] ?? 0);
      const val = suffix === '%' ? raw * 100 : raw;
      let shown;
      if (fmt === 'i') {
        shown = Math.round(val);
      } else {
        const f = 10 ** Number.parseInt(fmt.slice(1), 10);
        shown = Math.round(val * f) / f;
      }
      out = out.replace(token, `${shown}${suffix}`);
    });
  }

  const bare = out.match(/#[0-9]+/g);
  if (bare) {
    [...bare]
      .sort((a, b) => b.length - a.length)
      .forEach((token) => {
        const idx = Number.parseInt(token.replace('#', ''), 10) - 1;
        out = out.replace(token, String(Math.round(Number(params?.[idx] ?? 0))));
      });
  }

  return out;
}

/** 剥掉富文本标签。用于显示，以及给正则做匹配前的预处理。 */
export function stripTags(s) {
  if (s == null) return null;
  return String(s)
    .replace(/<\/?(?:unbreak|u|s|b|i)>/g, '')
    .replace(/<color=[^>]*>/g, '')
    .replace(/<\/color>/g, '')
    .replace(/<[^>]+>/g, '');
}

/** 还原 + 剥标签，一步到位给界面用。 */
export function renderText(desc, params) {
  return stripTags(renderPlaceholder(desc, params));
}

// ---------------------------------------------------------------------------
// 上下文
// ---------------------------------------------------------------------------

function groupBy(arr, keyFn) {
  const m = new Map();
  for (const x of arr) {
    const k = keyFn(x);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
}

export function createContext(data) {
  const ctx = {
    data,
    charById: new Map(data.characters.map((c) => [c.id, c])),
    charStatsById: groupBy(data.charStats, (s) => s.id),
    tracesByChar: groupBy(data.traces, (t) => t.charId),
    ranksByChar: groupBy(data.ranks, (r) => r.charId),
    // ★ 忆灵技住在 data.servantSkills 这张**独立的**表里 ★
    //   数据层分开是为了不让它们混进增益目录（build_catalog 遍历的只有 data.skills），
    //   但「这个角色有哪些技能」必须把两张表合起来答 —— 遐蝶的忆灵技也是遐蝶的技能。
    //   索引在这里并，调用方（listAbilities / attackSkills / resolveParam）看到的是同一张并表。
    //
    // ★ `data.servantSupport` **故意不并进来** ★
    //   那是忆灵的**辅助**技（昔涟德谬歌那 17 首诗）—— 它们归增益目录管，不归技能下拉框。
    //   并进来的话 `listAbilities` 会把昔涟的下拉框从 7 条撑成 24 条、其中 17 条写着
    //   「未收录倍率」，而它们根本没有倍率这回事。它们只从 `skillById` 走
    //   （目录条目要取参数），见下面那条注释。
    skillsByChar: groupBy([...data.skills, ...(data.servantSkills ?? [])], (s) => s.charId),
    // ★ 纯 id 键**只对主表成立**，忆灵技会撞号 ★
    //   `character_skills` 那 664 条确实 0 重复，但**忆灵技不在那张表里**：
    //   开拓者的两个性别（8007 穹 / 8008 星）各有一份 memosprite_json，里面
    //   5 个 id（1800701/03/05/06/07）**两边一模一样**（已实测）。
    //   所以这张是**兜底**表，不是精确路径 —— 精确路径是下面那张复合键表。
    //   兜底场景只有一个，而且成立：忆灵的 hp_skill 指的是**主表**的全局技能 id，
    //   8008 的变体指向挂在 8007 名下的 800704，按复合键会落空、按 id 才找得到。
    //   ★ 别再往这张表里加「本该按 id 精确找」的东西 ★ —— 撞号时它静默返回
    //   **另一个性别**的那条，而两个性别的忆灵参数**目前**恰好相同，看不出差别。
    //
    // ★ servantSupport 只进这两张 id 表 ★
    //   增益目录的条目走 `resolveParam({kind:'skill'})`，而那个函数按 charId 查
    //   `skillsByChar`。辅助忆灵技不在那里，所以必须让它在 id 索引里有落脚点，
    //   由 `resolveParam` 的兜底分支接住。这是**唯一**一条它会走的取值路径 ——
    //   并进 skillsByChar 会让下拉框膨胀，见上面。
    skillById: new Map([...data.skills, ...(data.servantSkills ?? []), ...(data.servantSupport ?? [])]
      .map((s) => [s.id, s])),
    // ★ 复合键：`${charId}.${skillId}` ★
    //   忆灵技 id 跨角色会重复（见上），所以「谁的技能」必须带 charId 才问得准。
    //   主表技能本来就不会撞，带上 charId 也无害 —— 一张表同时管两边。
    //   编法与 `_scripts/migrate_buff_ids.mjs:21` 一致。
    skillByCharSkill: new Map(
      [...data.skills, ...(data.servantSkills ?? []), ...(data.servantSupport ?? [])]
        .map((s) => [`${s.charId}.${s.id}`, s]),
    ),
    lcById: new Map(data.lightcones.map((l) => [l.id, l])),
    lcStatsById: groupBy(data.lcStats, (s) => s.id),
    relicsetById: new Map(data.relicsets.map((r) => [r.id, r])),
    monsterById: new Map(data.monsters.map((m) => [m.id, m])),
    monsterStatsById: new Map(data.monsterStats.map((m) => [m.id, m])),
    monsterChildsById: groupBy(data.monsterChilds, (m) => m.monsterId),
    // Enemy skill descriptions are keyed by the actual child/variant, not only its base monster.
    monsterSkillsByChildId: groupBy(data.monsterSkills ?? [], (s) => s.childId),
    enemyAIByChildId: new Map((data.enemyAI?.enemies ?? []).map((e) => [e.childId, e])),
    enemyAIFileByPath: new Map((data.enemyAI?.aiFiles ?? []).map((f) => [f.path, f])),
    // ★ abyss_wave_monsters.monster_id 是 child_id，所以要按 childId 建一张索引。
    //   按父 monster_id 查会漏掉 921/7806 行。
    monsterChildByChildId: new Map(data.monsterChilds.map((m) => [m.childId, m])),
    eliteGroupById: new Map(data.eliteGroups.map((e) => [e.id, e])),
    // hard_level_groups 是 (组, 等级) 两键
    hardLevel: new Map(data.hardLevels.map((h) => [`${h.group}:${h.level}`, h])),
    seasonByKey: new Map(data.abyssSeasons.map((s) => [`${s.mode}:${s.seasonId}`, s])),
    floorByKey: new Map(data.abyssFloors.map((f) => [`${f.mode}:${f.seasonId}:${f.floorId}`, f])),
    abyssBuffByKey: groupBy(data.abyssBuffs, (b) => `${b.mode}:${b.seasonId}:${b.floorId}`),
    abyssTagByKey: groupBy(data.abyssTags, (t) => `${t.mode}:${t.seasonId}:${t.floorId}`),
    abyssEventByKey: groupBy(data.abyssEvents ?? [], (e) => `${e.mode}:${e.seasonId}:${e.floorId}`),
    waveByKey: groupBy(data.abyssWave, (w) => `${w.mode}:${w.seasonId}:${w.floorId}`),
    peakSeasonById: new Map((data.peak?.seasons ?? []).map((s) => [s.id, s])),
    peakStageByKey: new Map((data.peak?.stages ?? []).map((s) => [`${s.seasonId}:${s.id}`, s])),
    peakWaveByStageKey: groupBy(data.peak?.waves ?? [], (w) => `${w.seasonId}:${w.stageId}`),
    peakMonsterByStageKey: groupBy(data.peak?.monsters ?? [], (m) => `${m.seasonId}:${m.stageId}`),
    peakTagByStageKey: groupBy(data.peak?.tags ?? [], (t) => `${t.seasonId}:${t.stageId}`),
    levelCaps: data.levelCaps,   // [20,30,40,50,60,70,80]
  };
  return ctx;
}

// ---------------------------------------------------------------------------
// 等级
// ---------------------------------------------------------------------------

/** 晋阶段索引。等级 80 → 6（第 7 段）。用于取 character_stats 的行。 */
export function promotionForLevel(ctx, level) {
  const caps = ctx.levelCaps;
  for (let i = 0; i < caps.length; i++) if (level <= caps[i]) return i;
  return caps.length - 1;
}

/** 线性成长：白值 = base + add × (等级-1)。已实测吻合（三月七 L80 攻击 = 511.56）。 */
export function baseStat(pair, level) {
  if (!pair || pair[0] == null) return null;
  const [base, add] = pair;
  return base + (add ?? 0) * (level - 1);
}

// ---------------------------------------------------------------------------
// 技能等级联动（★ 不做这一步，所有角色的倍率会一致偏低，且看起来像校准问题）
// ---------------------------------------------------------------------------

/**
 * 解析星魂 desc 里的「XX等级+N，最多不超过M级」。
 * 返回 `{ 技能中文名: { bonus, cap } }`。
 *
 * 为什么必须解析散文：character_ranks.param_list_json 在 R3/R5 上是 **97/97 全空**，
 * 「+2/+1」没有任何结构化字段，只存在于 desc。
 */
export function rankLevelBonuses(ctx, characterId, eidolon) {
  const out = {};
  if (!eidolon) return out;
  const ranks = ctx.ranksByChar.get(characterId) ?? [];
  for (const r of ranks) {
    if (r.rank > eidolon) continue;
    const text = stripTags(r.desc) ?? '';
    const re = /([一-龥]{2,6})等级\+(\d+)，?最多不超过(\d+)级/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      const name = m[1];
      out[name] = { bonus: Number(m[2]), cap: Number(m[3]) };
    }
  }
  return out;
}

/**
 * 生效技能等级 = min(基础等级 + 星魂加成, 上限)。
 *
 * 基础等级是**游戏内显示的基础等级**（满晋阶 E0 时 普攻 6、其余 10），
 * 由用户给；星魂的 +2/+1 自动叠上去。上限从 desc 里解析，不写死。
 */
export function effectiveSkillLevel(ctx, characterId, skillType, baseLevel, eidolon = 0) {
  const cn = SKILL_TYPE_CN[skillType] ?? skillType;
  const b = rankLevelBonuses(ctx, characterId, eidolon)[cn];
  if (!b) return baseLevel;
  return Math.min(baseLevel + b.bonus, b.cap);
}

/** 取某技能在某等级下的 param_list。等级超出范围时取最接近的有效等级并告警。 */
export function skillParamsAt(skill, level) {
  const p = skill?.params;
  if (!p) return { params: null, level: null, clamped: false };
  const avail = Object.keys(p).map(Number).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!avail.length) return { params: null, level: null, clamped: false };
  const lo = avail[0];
  const hi = avail[avail.length - 1];
  const lv = Math.min(Math.max(level, lo), hi);
  return { params: p[String(lv)]?.param_list ?? null, level: lv, clamped: lv !== level };
}

// ---------------------------------------------------------------------------
// 参数引用（annotations 里的数值都走这里 —— 表里永远不写死数字）
// ---------------------------------------------------------------------------

/**
 * ref 形如:
 *   { kind:'skill',     charId, skillId, skillType, level, index }
 *   { kind:'trace',     charId, pointId, index }        或 { propertyType }
 *   { kind:'eidolon',   charId, rankId, index }
 *   { kind:'lightcone', lcId, superimpose, index }
 *   { kind:'relicset',  setId, piece:2|4, index }
 *   { kind:'abyss_buff',mode, seasonId, floorId, buffIndex, index }
 *   { kind:'literal',   value }        ← 唯一的写死出口，必须配 provenance!=known
 *
 * 全部返回 **null 表示取不到**，不是 0。
 */
export function resolveParam(ctx, ref) {
  if (!ref) return null;
  switch (ref.kind) {
    case 'literal':
      return ref.value ?? null;

    case 'skill': {
      // ★ 三级查，**精度从高到低**，哪一级为什么存在都写清楚了 ★
      //   ① `skillsByChar` —— 角色技能 + 打伤害的忆灵技。带 charId，精确。
      //   ② `skillByCharSkill` —— **辅助忆灵技**（data.servantSupport，昔涟德谬歌
      //      那 17 首诗）唯一一条取值路径。它不在 ① 里（进了会让技能下拉框膨胀），
      //      所以必须在这里接住。带 charId，精确。
      //   ③ `skillById` —— 跨角色的纯 id 兜底。**只有**忆灵的 hp_skill 会用到
      //      （8008 的变体指向挂在 8007 名下的 800704）。它**不精确**：
      //      忆灵技 id 在两个开拓者性别之间是重复的，撞号时会拿到另一个性别的记录。
      //      所以它排在最后，前面两级能答上就不走它。
      //
      //   少了 ② 的话，昔涟那 13 首能自动进目录的诗会**取不到值** —— 而取不到值
      //   的表现是条目「显示为空」，不是报错，很容易被当成「这条本来就没数值」。
      const skill = (ctx.skillsByChar.get(ref.charId) ?? []).find((s) => s.id === ref.skillId)
        ?? ctx.skillByCharSkill?.get(`${ref.charId}.${ref.skillId}`)
        ?? ctx.skillById?.get(ref.skillId);
      if (!skill) return null;
      const lv = ref.level ?? 1;
      const { params } = skillParamsAt(skill, lv);
      return params?.[ref.index - 1] ?? null;
    }

    case 'trace': {
      const traces = ctx.tracesByChar.get(ref.charId) ?? [];
      const t = traces.find((x) => x.id === ref.pointId);
      if (!t) return null;
      // 属性节点直接把值和属性类型捆在一起，优先按 propertyType 取
      if (ref.propertyType) {
        const hit = (t.statusAdd ?? []).find((s) => s.property_type === ref.propertyType);
        return hit?.value ?? null;
      }
      return t.params?.[ref.index - 1] ?? null;
    }

    case 'eidolon': {
      const r = (ctx.ranksByChar.get(ref.charId) ?? []).find((x) => x.rank === ref.rankId);
      if (!r) return null;
      return r.params?.[ref.index - 1] ?? null;
    }

    case 'lightcone': {
      const lc = ctx.lcById.get(ref.lcId);
      if (!lc) return null;
      const row = lc.skillParams?.[String(ref.superimpose)];
      return row?.param_list?.[ref.index - 1] ?? null;
    }

    case 'relicset': {
      const rs = ctx.relicsetById.get(ref.setId);
      if (!rs) return null;
      const arr = ref.piece === 4 ? rs.set4Params : rs.set2Params;
      return arr?.[ref.index - 1] ?? null;
    }

    case 'abyss_season': {
      return ctx.seasonByKey.get(`${ref.mode}:${ref.seasonId}`)?.buffParams?.[ref.index - 1] ?? null;
    }
    case 'abyss_buff': {
      const key = `${ref.mode}:${ref.seasonId}:${ref.floorId}`;
      const list = ctx.abyssBuffByKey.get(key) ?? [];
      const b = list.find((x) => x.idx === ref.buffIndex) ?? list[0];
      if (b?.params?.length) return b.params[ref.index - 1] ?? null;
      // 回退：abyss_buffs 的 pf 有 12/321 条 params 为空，层表的 buffs_json 里还有一份
      const floor = ctx.floorByKey.get(key);
      const fb = (floor?.buffs ?? [])[ref.buffIndex] ?? (floor?.buffs ?? [])[0];
      return fb?.params?.[ref.index - 1] ?? fb?.param_list?.[ref.index - 1] ?? null;
    }

    default:
      return null;
  }
}

/**
 * 库里哪些「底名」是重复的。重复的底名必须在显示时补上命途才能区分。
 *
 * 现在只有一组：**三月七** 有两个（1001 存护 / 1224 巡猎），name 都是「三月七」。
 * 按数组身份缓存 —— 同一次会话里 roster 是同一个数组对象，只在第一次算一遍。
 */
const _dupCache = new WeakMap();
function duplicatedBaseNames(roster) {
  if (!roster) return null;
  let s = _dupCache.get(roster);
  if (s) return s;
  const n = new Map();
  for (const ch of roster) {
    const b = String(stripTags(ch?.name ?? ch?.id) ?? '');
    n.set(b, (n.get(b) ?? 0) + 1);
  }
  s = new Set([...n].filter(([, c]) => c > 1).map(([b]) => b));
  _dupCache.set(roster, s);
  return s;
}

/**
 * 角色的**显示名**。
 *
 * 这个函数存在的唯一理由是：库里的 `name` 直接拿来显示会出现**挑不了**的选项。
 * 三种情况都要处理，少一种选择器里就有一屏一样的选项：
 *
 *   ① 10 个开拓者（8001~8010）的 name 是字面的 `{NICKNAME}`。库里能区分它们的
 *      只有 `icon`（playerboy / playergirl，后面**带序号**：8003 是 playerboy2）。
 *      所以匹配要带可选数字后缀 —— 只匹配裸 `playerboy` 会让 8003~8010 全部落空，
 *      于是「开拓者·存护」出现两次。`{F#…}{M#…}` 是**渲染占位符**，不要解析它。
 *   ② 银狼LV.999（1506）的 name 带 `<unbreak>` 标签，必须先剥。
 *   ③ 三月七有两个（存护/巡猎），底名一样 —— 只有当 roster 里确实有重名时才补
 *      命途，否则会给全部 97 个角色都挂一个多余的括号。roster 可不传，
 *      不传就退化成「不消歧」，所以调用方**应该**把角色数组传进来。
 */
export function characterDisplayName(ch, roster = null) {
  if (!ch) return '—';
  // stripTags 对 null 返回 null，所以兜一层空串 —— 否则 .test(null) 会把
  // 字面量 "null" 当成名字，最后返回一个非字符串给排序函数。
  const raw = String(stripTags(ch.name ?? ch.id) ?? '');
  const id = String(ch.id ?? '');

  if (/\{NICKNAME\}/.test(raw)) {
    const icon = String(ch.icon ?? '').toLowerCase();
    const who = /^playerboy\d*$/.test(icon) ? '穹'
      : /^playergirl\d*$/.test(icon) ? '星' : null;
    const path = ch.path ?? '';
    // 命途和 icon 都缺时才退回 id —— 光靠命途也分不出穹/星（两人同命途）。
    const tag = `${path}${who ? `（${who}）` : ''}`;
    return tag ? `开拓者·${tag}` : `开拓者${id ? `#${id}` : ''}`;
  }

  if (!raw) return id ? `#${id}` : '—';
  if (duplicatedBaseNames(roster)?.has(raw)) return `${raw}（${ch.path ?? '未知命途'}）`;
  return raw;
}

/** 全部角色（按显示名排序），给选择器用。 */
export function listCharacters(ctx) {
  const roster = ctx.data.characters;
  const name = (c) => characterDisplayName(c, roster);
  return [...roster].sort((a, b) => name(a).localeCompare(name(b), 'zh'));
}

/** 某角色所有能算伤害的技能。 */
export function attackSkills(ctx, characterId) {
  return (ctx.skillsByChar.get(characterId) ?? []).filter((s) => ATTACK_TYPES.includes(s.type));
}
