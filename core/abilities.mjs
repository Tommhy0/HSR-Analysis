// 技能 → 可算的 ability。**运行期**的桥。
//
// ★ 为什么需要这个模块 ★
//   提取器（构建期）把倍率解析成 `{ scaling, multiplier:{paramIndex} }` 这种**引用**，
//   而不是数值 —— 因为倍率随技能等级变、技能等级又随星魂 R3/R5 变。
//   真正把引用变成数字必须等到「用户选好角色和星魂」的那一刻，也就是运行期。
//   这个模块就是做这件事的：**引用 → 数值**，且只在运行期做。
//
// ★ 两种数据来源，人工优先 ★
//   annotations/multipliers.jsonl   人填的覆盖（desc 为空的技能只能靠它）
//   data.abilities                  构建期由提取器烧进数据块的提案
//   人工覆盖赢。同一技能两边都有时用人工的 —— 提取器是启发式的，人是准的。
import {
  skillParamsAt, effectiveSkillLevel, DAMAGE_TAGS, ATTACK_TYPES, SKILL_TYPE_CN,
} from './ctx.mjs';
import { normalize } from './clauses.mjs';

/**
 * 非伤害 tag → 中文。**只用于那条 `non-damage` 的说明文案**。
 *
 * ★ 这些 tag 是「这个技能打不打伤害」的判据的另一半 ★
 *   `DAMAGE_TAGS`（core/ctx.mjs:50）列的是**打伤害**的四个；这里列的是剩下的、
 *   在库里确实出现过的非伤害 tag。取值路径一个字都不读它 —— 它只让用户在
 *   下拉框里看见「这是治疗技能」而不是一句「未收录倍率」。
 *   没收录的 tag 退回「辅助」，不抛。
 */
const TAG_CN = {
  Support: '增益', Enhance: '强化', Restore: '治疗',
  Defence: '护盾', Impair: '减益', Summon: '召唤', MazeAttack: '秘技',
};

/** 状态在技能下拉框里的先后。**能算的排最前，根本不打伤害的排最后。** */
const STATUS_RANK = { ok: 0, 'out-of-scope': 1, unresolved: 2, 'non-damage': 3 };

/**
 * 倍率基数名 → 中文。**全库唯一一份** —— damage.mjs 从这里 import。
 *
 * ★ 这四行原来在 core/damage.mjs 里另抄了一份 ★ 两份表一个键都不能少，而
 *   漏一个的表现是界面上冒出 `undefined：面板未填` 这种谁也不知道在说什么的文案。
 *   现在只有一份，verify 直接断言「damage.mjs 没有自己的副本」。
 *
 * `servantHp` 之外的三个忆灵基数**取不到值**（见 listAbilities 的守卫）：
 *   忆灵自己的攻击力/防御力库里没有（memosprite_json 只有 hp 和 speed），
 *   本场累计数值则根本不是面板项。它们照旧列进技能下拉框，但会被显式标成
 *   「算不了」—— 与本项目「绝不静默算 0」的口径一致。
 */
export const SCALING_CN = {
  atk: '攻击力', hp: '生命上限', def: '防御力', elation: '欢愉度',
  servantHp: '忆灵生命上限', servantAtk: '忆灵攻击力', servantBase: '忆灵自身面板',
  dynamicBase: '本场累计数值',
};

/**
 * 游戏里的基础技能等级（满晋阶、星魂 0 时）。
 * 普攻 6，其余 10 —— 这是**用户看到的那个数字**，星魂的 +1/+2 由
 * `effectiveSkillLevel` 自动叠上去。上限（普攻 7 / 其余 12）从星魂 desc 里解析。
 */
export function baseLevelOf(skillType) {
  return skillType === 'Normal' ? 6 : 10;
}

/**
 * 忆灵生命上限的折算系数：`忆灵HP = 召唤者生命上限 × pct + flat`。
 *
 * 公式的**出处**是 `memosprite_json` 的 `hp_inherit` / `hp_base`（形如 `"#5"` / `"#6"`，
 * 索引指进 `hp_skill` 那张参数表），已经逐条和技能 desc 原文对过（`verify.mjs` 的
 * `HP_WANT` 就是这张表，改这里必须同步改那里）：
 *   阿格莱雅/衣匠 ×66%+720 / 风堇 ×50% / 长夜月 ×50% / 昔涟 ×100% /
 *   知更鸟•晴歌 ×70% / 开拓者/迷迷 ×80%+640
 *
 * ★ 这里原来写的是另一组数（阿格莱雅 44%+180、开拓者 50%+400）—— 那是错的 ★
 *   写这份注释时凭印象记的，而**光看注释永远不会红**。真值来自 verify 的钳制，
 *   是拿 `hp_inherit` 去参数表里取出来的。
 *
 * 等级取的是**那条公式所属技能自己的等级**（通常是召唤者的天赋），不是忆灵技的等级。
 * 任何一项取不到都返回 **null** —— 调用方据此把基数判成「取不到」。
 *
 * 导出是为了**让 verify 直接钳住这 8 个系数**。只走 `listAbilities` 的话，
 * 阿格莱雅/开拓者那两条算不了（基数是忆灵攻击力），它们的 hp 公式
 * （66%+720 / 80%+640）就**永远不会被任何断言碰到** —— 而那正是写这份
 * 计划时记错的一组数。测不到的系数等于没写。
 */
export function servantHpFactor(ctx, sk, { eidolon = 0, levels = null } = {}) {
  const hp = sk?.servant?.hp;
  if (!hp) return null;
  // 先在本角色里找（正常情形），落空再按全局 id 找。开拓者的 8008 变体就属于
  // 后一种：它有自己的 memosprite_json，但 hp_skill 指的是 800704 那条，
  // 而 800704 挂在 8007 名下。技能 id 全库唯一，按 id 找是精确的。
  const ownerSkill = (ctx.skillsByChar.get(sk.charId) ?? []).find((s) => s.id === hp.skillId)
    ?? ctx.skillById?.get(hp.skillId);
  if (!ownerSkill) return null;
  const base = levels?.[ownerSkill.id] ?? baseLevelOf(ownerSkill.type);
  const eff = effectiveSkillLevel(ctx, sk.charId, ownerSkill.type, base, eidolon);
  const { params } = skillParamsAt(ownerSkill, eff);
  const pct = params?.[hp.inherit - 1];
  if (!Number.isFinite(pct)) return null;
  const flat = hp.base == null ? 0 : params?.[hp.base - 1];
  return { pct, flat: Number.isFinite(flat) ? flat : 0, level: eff };
}

/** 构建期用：把提取器的 multiplier 提案压成 skillId → 记录的映射。 */
export function abilitiesFromProposals(proposals) {
  const out = {};
  for (const p of proposals ?? []) {
    if (p.kind !== 'multiplier') continue;
    const all = p.terms ?? [];
    // ★ 击破伤害项在这里剔掉，但**记下剔了几条** —— 剔干净了要让界面说
    //   「这是击破伤害，v1 不算」，而不是变成一条没有倍率的空技能。
    //   两者的界面表现完全不同：前者是「我们有意不算」，后者看起来像「我们的数据缺了」。
    const usable = all.filter((t) => !t.break);
    out[String(p.skillId)] = {
      element: p.element ?? null,
      hit: p.hits ?? null,
      terms: usable.map((t) => ({
        scaling: t.scaling, multiplier: t.multiplier, flatAdd: t.flatAdd ?? null,
        target: t.target ?? 'primary', timing: t.timing ?? 'direct',
        conditional: t.conditional ?? false, text: t.text ?? '',
        repetition: t.repetition ?? null,
      })),
      breakTerms: all.length - usable.length,
      provenance: p.status === 'PROPOSED' ? 'extracted' : 'unknown',
      reviewReason: p.reviewReason ?? null,
    };
  }
  return out;
}

/** 取这一项的数值。`{paramIndex}` 走技能参数，`{value}` 是写死的（只允许人工表用）。 */
function termValue(term, params) {
  const m = term?.multiplier;
  if (m == null) return null;
  if (typeof m === 'number') return m;
  if (m.value != null) return m.value;
  if (m.paramIndex == null) return null;
  const v = params?.[m.paramIndex - 1];
  return Number.isFinite(v) ? v : null;
}

/**
 * 列出某角色全部可算的技能。
 *
 * @param opts.eidolon    星魂数，决定技能等级加成
 * @param opts.element    角色属性 —— 技能行本身**没有** element 字段，只能从角色取
 * @param opts.overrides  annotations.multipliers.jsonl 的解析结果（人工覆盖）
 * @param opts.baked      data.abilities（构建期烧进来的提取器提案）
 * @param opts.levels     { [skillId]: 用户改过的基础等级 }
 */
export function listAbilities(ctx, characterId, {
  eidolon = 0, element = null, overrides = null, baked = null, levels = null,
} = {}) {
  const ovBySkill = new Map();
  for (const r of overrides ?? []) ovBySkill.set(String(r.skillId), r);

  const out = [];
  for (const sk of ctx.skillsByChar.get(characterId) ?? []) {
    if (!ATTACK_TYPES.includes(sk.type)) continue;

    const manual = ovBySkill.get(String(sk.id));
    const auto = baked?.[String(sk.id)] ?? null;
    const rec = manual ?? auto;

    const base = levels?.[sk.id] ?? baseLevelOf(sk.type);
    const effLevel = effectiveSkillLevel(ctx, characterId, sk.type, base, eidolon);
    const { params, level: usedLevel, clamped } = skillParamsAt(sk, effLevel);

    const rawTerms = manual?.terms?.length ? manual.terms : (auto?.terms ?? []);
    const terms = [];
    let unresolved = null;
    for (const t of rawTerms) {
      const multiplier = termValue(t, params);
      if (multiplier == null) {
        unresolved = unresolved ?? `倍率取不到（占位符 #${t.multiplier?.paramIndex ?? '?'}，`
          + `技能等级 ${usedLevel ?? '?'}）`;
        continue;
      }
      const flatAdd = t.flatAdd == null ? 0 : (termValue({ multiplier: t.flatAdd }, params) ?? 0);
      const term = { scaling: t.scaling, multiplier, flatAdd,
        target: t.target ?? 'primary', timing: t.timing ?? 'direct',
        conditional: t.conditional ?? false, text: t.text ?? '',
        count: t.repetition ? (t.repetition.literal ?? params?.[t.repetition.paramIndex - 1] ?? null) : 1 };
      if (t.scaling === 'servantHp') {
        // 忆灵生命上限 = 召唤者生命上限 × pct + flat，系数在召唤者那条生命上限
        // 公式（memosprite_json 的 hp_skill）的参数表里，按**它自己**的等级取。
        // 取不到就整项置 null，由 damage.mjs 报「算不了」——不兜 0。
        const f = servantHpFactor(ctx, sk, { eidolon, levels });
        if (f) term.servantHp = f;
      }
      terms.push(term);
    }

    // 段数：提取器给的是占位符引用；人工表可以直接写数字
    let hits = 1;
    let hitsAssumed = true;
    const h = manual?.hits ?? auto?.hit;
    if (typeof h === 'number') { hits = Math.max(1, h); hitsAssumed = false; }
    else if (h?.literal != null) { hits = Math.max(1, h.literal); hitsAssumed = false; }
    else if (h?.paramIndex != null) {
      const v = params?.[h.paramIndex - 1];
      if (Number.isFinite(v)) { hits = Math.max(1, v); hitsAssumed = false; }
    }

    let status = 'ok';
    let note = '';
    if (!rawTerms.length && auto?.breakTerms) {
      // 有倍率，但全是击破伤害 —— 这是**有意不算**，不是数据缺失
      status = 'out-of-scope';
      note = `这个技能打的是击破伤害（${auto.breakTerms} 项），v1 只算普通伤害，不参与计算`;
    } else if (!rawTerms.length && !manual && !DAMAGE_TAGS.has(sk.tag)) {
      // ★ 根本不打伤害的技能 ★ —— 治疗 / 护盾 / 增益 / 减益。
      //
      //   这一支必须夹在**上面那支之后**（有击破伤害的照旧是「有意不算」），
      //   且在**下面那支之前**（否则会被判成「描述里没解析出倍率」）。
      //
      //   为什么非分出来不可：全库 151 条 unresolved 里 **127 条**是这一类。
      //   它们**本来就没有倍率这回事**，而旧文案写着「需要人工补录进
      //   annotations/multipliers.jsonl」—— 那不是「我们还没录」，是让人去补录
      //   一个不存在的东西。只有 24 条是真缺口。
      //
      //   判据用 `tag`（`DAMAGE_TAGS`，与 extract_buffs 同一个真相），不用 `type`。
      //   只在 `!rawTerms.length` 时判：**tag 非伤害但确实提出了倍率的技能
      //   照旧留在 `ok`**（阮•梅战技那种），不误伤。
      //   `manual` 时不降级 —— 人写下的判断不该被一条规则否掉。
      status = 'non-damage';
      note = `这是${TAG_CN[sk.tag] ?? '辅助'}技能（${sk.typeName || SKILL_TYPE_CN[sk.type] || sk.type}），`
        + '不造成伤害，不参与计算';
    } else if (!rawTerms.length) {
      status = 'unresolved';
      note = manual
        ? '人工表里的这一条还没填 terms'
        : auto?.reviewReason === 'DYNAMIC_BASE'
          // 忆灵/角色技能里基数是「本场累计」的那种。它**补录不了** —— 那个数
          // 不在任何面板上，得先有人把这场战斗的累计值喂进来。别写成
          // 「需要人工补录进 multipliers.jsonl」，那会把人引去做一件做不到的事。
          ? '倍率吃的是本场累计数值（累计治疗这类），不是面板项，算不了'
          : (sk.desc ? '描述里没解析出倍率，需要人工补录进 annotations/multipliers.jsonl'
            : '这个技能的描述是空的，倍率只能人工补录');
    } else if (!terms.length) {
      status = 'unresolved';
      note = unresolved ?? '倍率全部取不到';
    }
    if (status === 'ok' && terms.some((t) => t.scaling === 'elation')) {
      // 欢愉度基值库里不存在 —— 不是 0，是「算不了」。标出来，让 damage.mjs 报 unknown。
      note = '含欢愉度基值，库里没有这个数，会算不出来';
    }
    if (status === 'ok' && terms.some((t) => !t.scaling)) {
      // 描述里没写吃哪个属性（既没「攻击力」也没「生命上限」）。取不到基数 = 算不了，
      // 不能拿 0 顶替。人工表里偶尔会漏写 scaling，这里也要挡住。
      status = 'unresolved';
      note = '倍率项没写明吃哪个属性（攻击力/生命上限/防御力），需要人工补录';
    }
    if (status === 'ok') {
      // ★ 忆灵技里基数取不到的两种，**必须**在这里拦下来 ★
      //   它们在 damage.mjs 里会走 scalingValue 的 default 分支返回 null，
      //   然后被报成「面板未填」—— 而那个面板根本不是用户能填的（忆灵的
      //   攻击力在 memosprite_json 里压根没有），文案会把人引到错的地方。
      //   拦在这里的同时**照旧把技能列进下拉框**（带「未收录倍率」标记）：
      //   本项目的口径是显式标注，不是让技能凭空消失。
      const bad = terms.find((t) => t.scaling === 'servantAtk' || t.scaling === 'servantBase');
      if (bad) {
        status = 'unresolved';
        const what = bad.scaling === 'servantAtk' ? '攻击力' : '防御力等其它属性';
        note = `倍率吃的是忆灵自己的${what}，而库里忆灵只有生命上限，算不了`;
      } else if (terms.some((t) => t.scaling === 'dynamicBase')) {
        status = 'unresolved';
        note = '倍率吃的是本场累计数值（累计治疗/已损失生命值这类），不是面板项，算不了';
      } else if (terms.some((t) => t.scaling === 'servantHp' && !t.servantHp)) {
        status = 'unresolved';
        note = '取不到忆灵生命上限的折算公式（召唤者的 hp_skill 参数），需要人工补录';
      }
    }
    if (status === 'ok' && !note) {
      // 忆灵技算得出来时把折算**写出来** —— 界面上那一栏叫「忆灵生命上限」，
      // 而用户手上只有自己的面板，不写明白就等于让他自己猜这个数是怎么来的。
      const sh = terms.find((t) => t.servantHp)?.servantHp;
      if (sh) {
        note = `${sk.servant?.name ?? '忆灵'}的生命上限 = 当前角色（局内）生命上限`
          + ` × ${(sh.pct * 100).toFixed(1)}%`
          + (sh.flat ? ` + ${sh.flat}` : '')
          + `（系数取自 Lv.${sh.level} 的那条天赋参数表）`;
      }
    }
    if (clamped) note = `${note ? note + '；' : ''}技能等级 ${effLevel} 超出参数表范围，已取到 ${usedLevel}`;

    out.push({
      skillId: sk.id, name: sk.name,
      type: sk.type, typeName: sk.typeName,
      tag: sk.tag, tagIsDamage: DAMAGE_TAGS.has(sk.tag),
      element: manual?.element ?? auto?.element ?? element,
      baseLevel: base, level: usedLevel ?? effLevel, eidolonBonus: effLevel - base,
      terms, hits, hitsAssumed,
      randomHitsTotal: Math.max(0,...terms.filter(t=>t.target==='random').map(t=>t.count??0)),
      multiplierBasis: 'per-term',
      status, note,
      provenance: manual ? (manual.provenance ?? 'manual') : (auto?.provenance ?? 'unknown'),
      text: normalize(sk.desc),
      skill: sk,
    });
  }
  // 能算的排前面，同组按技能 id（普攻→战技→终结技→天赋 基本就是这个序）。
  //
  // ★ 换成显式 rank 表，不再用原来的三元 ★
  //   原来那句是「ok 排前、其余排后」，在**两个**非 ok 值之间**已经不自洽**：
  //   `cmp(a,b)` 与 `cmp(b,a)` 都返回 1，违反反对称，混排顺序由 V8 的实现细节决定。
  //   再加第三个非 ok 值只会让这种不确定性更难察觉。显式 rank 一眼能看出全部次序。
  return out.sort((a, b) => {
    const ra = STATUS_RANK[a.status] ?? 9;
    const rb = STATUS_RANK[b.status] ?? 9;
    return ra === rb ? a.skillId - b.skillId : ra - rb;
  });
}

/**
 * 把一条 ability 转成 computeHit 的输入形状。
 * 分开是为了让界面能把「段数」这种用户可改的字段覆盖掉再算。
 */
export function selectDamageTerms(terms, { targetRole = 'primary', includeConditional = false } = {}) {
  const selected = [], excluded = [];
  for (const t of terms) {
    let reason = null;
    if (t.timing === 'delayed') reason = '后续伤害，另行结算';
    else if (t.conditional && !includeConditional) reason = '条件未启用';
    else if (!['all','random',targetRole].includes(t.target ?? 'primary')) reason = '作用于其它目标';
    if (reason) excluded.push({ ...t, reason }); else selected.push(t);
  }
  return { terms: selected, excluded };
}

export function toHitAbility(ab, { hits = null, randomHits = null, targetRole = 'primary', includeConditional = false } = {}) {
  return {
    targetRole, includeConditional,
    terms: ab.terms.map(t=>({...t,count:t.target==='random' ? (randomHits ?? hits ?? t.count) : (t.count ?? 1)})),
    hits: ab.randomHitsTotal ? (randomHits ?? hits ?? ab.randomHitsTotal) : 1,
    multiplierBasis: ab.multiplierBasis ?? 'per-term',
    element: ab.element,
    type: ab.type,
    tag: ab.tag,
    name: ab.name,
  };
}
