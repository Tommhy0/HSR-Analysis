// 界面主模块。
//
// ★ 三条硬约束，改代码时别破坏 ★
//   1. **从不 fetch** —— 数据只从 window.__HSR_DATA__ 拿。成品是双击打开的
//      单文件 HTML，file:// 下 fetch 会被 CORS 拦。开发和成品于是只差数据怎么塞进去。
//   2. **走 core/ 的纯函数，界面里不写公式** —— 界面只负责收集输入、展示输出。
//      一旦界面自己算了一遍，它就和 verify.mjs 验的那份不是同一个东西了。
//   3. **「没收录」必须显示出来** —— 见 renderBanner / renderOutput 的缺口段。
//      静默算 0 是这个项目最不能犯的错。
//
// ★ 这一版把「队友」从角色槽换成了增益目录 ★
//   原来是「选停云 = 一次性接受停云身上所有已标注的增益」，人没法只取其中一条，
//   而且没被标注的辅助技能会**静默消失**。现在改成逐条勾选：**「这条算不算」
//   是用户自己的决定**，界面也不再需要假装「我们已经录全了」。
//   分工（core/buffs.mjs 的 collectBuffs 里有对应的一半）：
//     · 自动路径 = 结构化的行迹属性节点（builtinBuffs）+ 人工表里**非技能**的记录
//     · 目录路径 = 技能 / 行迹 / 星魂 / 光锥 的增益子句，逐条勾选
//   技能增益**只能**经由目录进来 —— 否则同一条会被两边各算一遍，数值静默翻倍。
import {
  createContext, listCharacters, characterDisplayName, SKILL_TYPE_CN, ELEMENT_CN,
  ELEMENTS, promotionForLevel,
} from '../core/ctx.mjs';
import { emptyPanel, suggestPanel } from '../core/panel.mjs';
import { defaultRelics, relicContributions, applyRelics } from '../core/relics.mjs';
import { renderRelics } from './relic-view.mjs';
import { initTheme } from './theme.mjs';
import { renderDashboard } from './dashboard.mjs';
import { renderResults } from './results.mjs';
import { renderDataView } from './data-view.mjs';
import { listAbilities, toHitAbility, selectDamageTerms, SCALING_CN } from '../core/abilities.mjs';
import { collectBuffs, aggregate, builtinBuffs } from '../core/buffs.mjs';
import { computeHit } from '../core/damage.mjs';
import { listScenarios, loadScenario, judgeAgainstHp, buildComparison, aggregateScenarioBuffs } from '../core/scenario.mjs';
import { C, warnings } from '../core/provenance.mjs';
import {
  TABS, KEY_GROUP, groupCatalog, blockedReason, rowView, PANEL_FIELD_CN,
  buffsFromSelections, sourceCharactersOf, uncoveredGaps, withDefaults,
  DISPLAY_ONLY_KEYS, panelWhoCN, catalogText,
} from '../core/catalog.mjs';

const DATA = window.__HSR_DATA__;
if (!DATA) {
  document.body.innerHTML = '<div class="card">没有读到数据（window.__HSR_DATA__ 是空的）。'
    + '开发时请用「开发服务器.bat」打开，不要直接双击 ui/template.html。</div>';
  throw new Error('no data');
}

const ctx = createContext(DATA);
const ANN = DATA.annotations ?? { buffs: [], multipliers: [], sides: { rules: [] } };
const CHARS = listCharacters(ctx);
/** 显示名 → 角色 id。面板锚定条目里的 `panel.who` 存的是显示名，得能反查回来。 */
const CHAR_BY_NAME = new Map(CHARS.map((c) => [characterDisplayName(c, DATA.characters), c.id]));
const SCENARIOS = listScenarios(ctx);
const LCS = [...DATA.lightcones].sort((a, b) => a.name.localeCompare(b.name, 'zh'));

/** 全量目录（863 条）。界面只渲染其中一部分，但 id 解析一律拿全量。 */
const CATALOG = DATA.buffCatalog ?? [];
const CAT_BY_ID = new Map(CATALOG.map((e) => [e.id, e]));
const STATS = DATA.buffCatalogStats ?? null;
/** 队友人数上限（软限制：超了只警告，不拦）。 */
const MAX_TEAM = 3;

const KIND_CN = {
  skill: '技能', servantSkill: '忆灵技', trace: '行迹',
  eidolon: '星魂', lightcone: '光锥', relicset: '遗器',
};

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pct = (v) => (v == null ? '—' : (v * 100).toFixed(1) + '%');
const num = (v, d = 1) => (Number.isFinite(v) ? v.toLocaleString('zh-CN',
  { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');

// ---------------------------------------------------------------------------
// 状态
// ---------------------------------------------------------------------------
const first = CHARS[0];

const st = {
  view: 'setup',
  characterId: first.id,
  eidolon: 0,
  level: 80,
  lightconeId: null,
  // ★ 光锥下拉框默认**只列本命途** ★
  //   169 把光锥里，输出角色能装的只有同命途那十几把 —— 不分命途的话，
  //   用户要在 169 行里找一个名字，而其中 150 多行**装上去是无效的**
  //   （游戏里光锥的命途必须与角色一致）。默认开，可以关掉看全部。
  //   判据是 `characters.path === lightcones.path`，九个取值完全对齐，是精确匹配。
  lcPathOnly: true,
  superimpose: 1,        // ★ 全局唯一的一份叠影：① 里选的，目录里的光锥条目也用这一档
  abilityId: null,
  skillLevels: {},       // skillId → 用户改过的**基础**等级（卡在技能卡上的那个）
  hitsOverride: {},      // skillId → 用户改过的段数
  targetRole: 'primary',
  includeConditional: false,
  broken: false,
  critMode: 'expected',
  panel: emptyPanel(),
  relics: defaultRelics(),
  relicAuto: true,
  relicDraftDirty: false,
  panelNote: '',
  // 面板锚定条目要吃的**别人的**面板：显示名 → 部分面板对象。
  // ★ 只存用户填过的那几项，不存整份 ★
  //   存整份的话界面就得替用户编一堆他没填过的数（每人一份默认白值），
  //   而那是**静默编造面板** —— 比「缺输入」糟得多，且完全看不出来。
  supportPanels: {},
  tier: 'base',          // 全局技能等级：'base' 基础满级 / 'max' 满级+满星魂（星魂类条目不受它影响）
  picks: { ids: {}, tab: 'ally_team', kind: '', q: '' },   // 队友目录的勾选
  selfPicks: {},         // 自拐卡片的勾选（id → bool，由 syncSelfPicks 物化）
  scenario: { mode: null, seasonId: null, floorId: null },
  scenarioPicks: {},
  enemyIndex: 0,
  metricHp: false,       // 判据①：默认关闭
  metricTeam: false,     // 判据②：默认关闭
  result: null,
  stale: false,
};

// 选了角色之后，面板初值建议也跟着换 —— 否则换个角色还在用上一个人的面板，
// 算出来的数看着正常其实全错。
function autoFillPanel() {
  const sug = suggestPanel(ctx, {
    characterId: st.characterId, level: st.level, lightconeId: st.lightconeId,
  });
  st.panel = { ...sug.panel };
  st.panelNote = sug.warning ?? '';
  const relic = relicContributions(DATA.relicTables, st.relics);
  if(st.relicAuto && relic.ok) {
    st.panel = applyRelics(st.panel,relic);
    st.panelNote = `已从白值计算行迹、光锥和 ${st.relics.filter(r=>r.enabled).length} 件遗器词条；套装与光锥属性被动须在增益管理核对。`;
  } else if(st.relicAuto) st.panelNote = '配装不合法，未应用：'+relic.errors.join('；');
}

function renderRelicPanel() {
  renderRelics({host:$('sec-relics'),tables:DATA.relicTables,state:st,onDraftChange:()=>{st.relicDraftDirty=true;markStale();},onChange:()=>{
    if(st.relicAuto) autoFillPanel();
    st.relicDraftDirty=false;
    renderPanel(); renderRelicPanel(); markStale();
  }});
}

function character(id) { return ctx.charById.get(id) ?? null; }
// ★ 一律走 characterDisplayName，不要读 ch.name ★
//   10 个开拓者在库里都叫 `{NICKNAME}`，读 .name 会得到十个分不清的选项；
//   银狼LV.999 的 name 还带 `<unbreak>`；三月七有两个（存护/巡猎）同底名。
//   **必须把 roster 传进去** —— 不传就没有重名信息，三月七那两条会长得一样。
function charName(id) {
  const c = character(id);
  return c ? characterDisplayName(c, DATA.characters) : String(id ?? '—');
}

/** 当前角色的技能表（带倍率解析结果）。 */
function abilities() {
  return listAbilities(ctx, st.characterId, {
    eidolon: st.eidolon,
    element: character(st.characterId)?.element ?? null,
    overrides: ANN.multipliers,
    baked: DATA.abilities,
    levels: st.skillLevels,
  });
}

function currentAbility() {
  const list = abilities();
  return list.find((a) => a.skillId === st.abilityId) ?? list.find((a) => a.status === 'ok') ?? list[0] ?? null;
}

// ---------------------------------------------------------------------------
// 目录的分区与勾选
// ---------------------------------------------------------------------------

/** 交给 core/catalog.mjs 的全局开关。 */
function catalogOpts() {
  return withDefaults({
    tier: st.tier,
    superimpose: st.superimpose,
    pieces: 4,
    // 当前角色的星魂数用 ① 里那一档，其余按全局档位。
    // ★ 它现在只影响**技能等级**（星魂 R3/R5 的「+2/+1」），不再决定星魂条目能否勾选。
    eidolons: { [st.characterId]: st.eidolon },
    skillLevels: st.skillLevels,
    // 面板锚定条目（「提高数值等同于布洛妮娅#2%暴击伤害」）吃的面板。
    // `@equipped`（光锥/遗器那种「使装备者…」）就是**当前计算角色**，
    // 也就是 ③ 里那份，不另存。
    //
    // `@energy` 同样是当前计算角色，但取的是**数据给定的能量上限**，不是用户填的面板 ——
    // 光锥「今日亦是和平的一日」/「片刻，留在眼底」是「根据装备者的能量上限，
    // 每点能量提高 #1%，最多计入 #2 点」。**能量上限不是遗器词条**，
    // 它是角色的固有属性，让用户手填只会填错。这一个角色没有能量上限时给 null，
    // 于是那条走「待填」那一路报出来 —— 不是静默按 0 算。
    panels: {
      ...st.supportPanels,
      '@equipped': st.panel,
      '@energy': { energyMax: character(st.characterId)?.energyMax ?? null },
    },
  });
}

// --- 面板锚定条目的输入框 ---------------------------------------------------
//
// 这一类条目的数值 = **别人的面板** × 系数。别人的面板界面上拿不到，
// 只能让用户填 —— 这是「填来源队友的那一项面板」这个决定落到代码里的地方。
//
// ★ 同一个人的同**一项**共用一份 ★
//   花火有两条吃「花火的暴击伤害」（战技 + R6），填一次两条都该变。
//   所以状态按 (who, attr) 存，同一 key 的所有输入框共用，改一个同步另一个。
//   只按 who 存整份面板是另一种写法，但那要求界面把这个人**所有**面板项都问一遍，
//   而其中绝大部分条目根本不读。

/** 一个面板字段在界面上怎么显示（百分比字段要 ×100，其余原样）。 */
function panelShown(who, attr, v) {
  if (v == null) return '';
  return PCT_FIELDS.has(attr) ? (v * 100).toFixed(1) : String(v);
}

function supportPanelValue(who, attr) {
  if (who === '@equipped') return st.panel?.[attr] ?? null;
  if (who === '@energy') return character(st.characterId)?.energyMax ?? null;
  return st.supportPanels?.[who]?.[attr] ?? null;
}

/** 把输入框里的字符串写回状态。空串 = 没填（null），不是 0。 */
function applySupportPanel(who, attr, raw) {
  // `@equipped` 在 ③ 里改、`@energy` 直接来自数据 —— 两份都不从这里写回。
  if (who === '@equipped' || who === '@energy') return;
  const s = String(raw ?? '').trim();
  const n = s === '' ? null : Number(s);
  const v = n == null || !Number.isFinite(n) ? null : (PCT_FIELDS.has(attr) ? n / 100 : n);
  st.supportPanels = {
    ...st.supportPanels,
    [who]: { ...(st.supportPanels[who] ?? {}), [attr]: v },
  };
}

const panelKeyOf = (who, attr) => `${who}|${attr}`;

/** 同一个 (who, attr) 的**其它**输入框跟着更新 —— 不然两行会显示两个不同的数。 */
function syncPanelBoxes(src, who, attr) {
  const k = panelKeyOf(who, attr);
  const shown = panelShown(who, attr, supportPanelValue(who, attr));
  // 属性选择器的值用 JSON.stringify 包：`who` 里有 `•`、`（`，裸写不是合法的 CSS。
  document.querySelectorAll(`[data-panelfor=${JSON.stringify(k)}]`).forEach((el) => {
    if (el === src) return;          // 正在打字的那个不许动，否则光标会被顶走
    if (el.value !== shown) el.value = shown;
  });
}

/** 「一键填充」：拿库里的白值 + 行迹给这个队友算一份建议面板。 */
function fillSupportPanel(who) {
  const id = charIdByName(who);
  if (id == null) return false;
  const sug = suggestPanel(ctx, { characterId: id, level: st.level });
  st.supportPanels = {
    ...st.supportPanels,
    [who]: { ...(st.supportPanels[who] ?? {}), ...sug.panel },
  };
  return true;
}

/** 显示名 → 角色 id。名字在库里是唯一的（重名的已由 characterDisplayName 区分开）。 */
const charIdByName = (name) => CHAR_BY_NAME.get(name) ?? null;

/** 条目 id → 条目。面板框要反查自己那一行读的是哪条，好就地重画。 */
const ENTRY_BY_ID = new Map((DATA.buffCatalog ?? []).map((e) => [e.id, e]));

/**
 * 把某个 `who` 的面板改动**就地**反映到界面上。
 *
 * ★ 为什么不能省这一步 ★ 数值其实**早就生效了**（`st.supportPanels` 一改，
 *   再点「计算」结果就会变）。但用户看到的是那一行的小字：填之前是「?」+「待填面板」，
 *   填完之后**一直还是**「?」+「待填面板」 —— 因为 `markStale()` 只重画横幅，
 *   不碰目录行。于是「填了没反应」。
 *
 * ★ 为什么不能整块重渲染 ★ `renderSelf()` 会把整个 ⑤ 卡片重建，
 *   光标、`<details>` 的展开态、滚动位置全丢 —— 在输入框里每敲一个字就丢一次，
 *   那是不可用的。所以只补两个地方：那一行的数值 span 与标签 span。
 */
function refreshPanelRows(who) {
  const opts = catalogOpts();
  const seenRow = new Set();
  // 用 document 而不是某一节的宿主：同一个 `who` 的条目可能同时出现在
  // 「自己的增益」和队友目录两处（`syncPanelBoxes` 也是这么找的）。
  document.querySelectorAll('[data-panelfor]').forEach((box) => {
    const [w, attr] = String(box.dataset.panelfor ?? '').split('|');
    if (w !== who || !attr) return;
    // 同一个人可能有多行吃同一项 —— 每行只补一次（同一个 box 只属于一行，
    // 但同一行里可能有多个 box，比如左括号那条同时读两个人的面板）
    const row = box.closest('.catrow');
    if (!row || seenRow.has(row)) return;
    seenRow.add(row);
    const cb = row.querySelector('[data-cat]');
    const e = cb ? ENTRY_BY_ID.get(cb.dataset.cat) : null;
    if (!e) return;
    const v = rowView(ctx, e, opts);
    const val = row.querySelector('.catval');
    if (val) {
      val.textContent = v.text;
      val.classList.toggle('dim', v.dim);
    }
    const tags = row.querySelector('.cattags');
    if (tags) tags.innerHTML = catTagsHtml(v.tags);
  });
}

/** 「一键填充」之后：这个人**所有**面板框的值都要同步，所有行都要重画。 */
function refillPanelUI(who) {
  document.querySelectorAll('[data-panelfor]').forEach((box) => {
    const [w, attr] = String(box.dataset.panelfor ?? '').split('|');
    if (w !== who || !attr || box.disabled) return;
    const shown = panelShown(who, attr, supportPanelValue(who, attr));
    if (box.value !== shown) box.value = shown;
  });
  refreshPanelRows(who);
}

function bindPanelBoxes(host) {
  host.querySelectorAll('[data-panelfor]').forEach((el) => {
    el.oninput = () => {
      const [who, attr] = String(el.dataset.panelfor ?? '').split('|');
      if (!who || !attr) return;
      applySupportPanel(who, attr, el.value);
      syncPanelBoxes(el, who, attr);   // 同一个 (who, attr) 的**其它**输入框
      refreshPanelRows(who);           // 吃这个人面板的**每一行**就地重画
      markStale();
    };
  });
  host.querySelectorAll('[data-panelfill]').forEach((el) => {
    el.onclick = () => {
      const who = el.dataset.panelfill;
      if (!fillSupportPanel(who)) return;
      // 原来这里是 renderSelf(); renderTeam(); —— 整块重建。要改的是这个人
      // 名下的所有面板框和所有行，`refillPanelUI` 干的就是这件事，且不动别的。
      refillPanelUI(who);
      markStale();
    };
  });
}

/** 一条条目在当前开关下可不可选；不可选则返回原因串（现在只剩 'piece_short:4' 这类）。 */
function blockedOf(e) { return blockedReason(e, catalogOpts()); }

/**
 * 自拐卡片装哪些条目。
 *
 *   · `target === 'self'` 且**就是这个角色**的：他自己的技能 / 行迹 / 星魂
 *   · **他当前装备的那把光锥**的条目（装备者 = 他，所以任何 target 都算他的）
 *
 * ★ 别人的「自身」条目为什么不在这里 ★
 *   停云的行迹「施放战技时自身速度提高」加的是**停云自己的速度** ——
 *   它不进输出角色的任何乘区。列出来只会让人勾了发现数字不动。
 *
 * ★ 遗器套装条目为什么不在这里 ★
 *   本项目不做遗器推算（面板由用户直接填）。遗器 2 件套的「攻击力提高 12%」
 *   **已经在面板里了**，再收一遍就是重复计算。4 件套的增伤没进面板，
 *   但拆一半收更糟 —— 统一不收，界面上写清楚去哪儿补。
 */
function selfEntries() {
  return CATALOG.filter((e) => (
    e.kind === 'lightcone'
      ? e.ref?.lcId === st.lightconeId
      : e.target === 'self' && e.ownerId === st.characterId
  ));
}

/**
 * 队友目录装哪些条目：**除了自拐卡片那一份之外的、作用对象不是「自身」的**。
 *
 * ★ 两处排除各自都有理由 ★
 *   · 自拐卡片里已经有的（他装备的那把光锥）→ 再列一遍会被勾两次，数值翻倍
 *   · `target === 'self'` 的其余条目：要么是**别的角色**的自拐（见 selfEntries
 *     的注释：不进输出者的公式），要么是**别人身上的**光锥/遗器（v1 不建模
 *     装配关系，不知道谁带着它）。两者列出来都不能用，所以不列 —— 但**要报数**，
 *     见 hiddenNote()。
 */
function teamEntries() {
  const taken = new Set(selfEntries().map((e) => e.id));
  return CATALOG.filter((e) => !taken.has(e.id) && e.target !== 'self');
}

/**
 * 被上面两条规则挡在目录外、因而不列出来的条目，按**原因**分三类。
 *
 * ★ 三类分开数，不能合成一句「N 条未列出」★
 *   用户看到「有 637 条没列出来」只会以为数据缺了；分成三类才能说清每一条
 *   **为什么**不该出现 —— 而且这三类的处理方式将来各不相同（别家自拐永远不看，
 *   没装的光锥换个装备就有了）。
 *
 * ★ 这三类的判据必须和 selfEntries / teamEntries 严格互补 ★
 *   所以打包自检里拿一份**独立的字段重数**跟这三个数逐项对拍 —— 见
 *   hsr_build.mjs 的「按目录字段独立数出…」那几条。分错了界面上就是一句假话。
 */
function hiddenNote() {
  const equipped = st.lightconeId;
  let otherSelf = 0;      // 别家角色的「自身」增益
  let unequipped = 0;     // 没装的那些光锥的「装备者」条目
  let relic = 0;          // 遗器套装 —— 本项目不做遗器推算，一条都不列
  for (const e of CATALOG) {
    if (e.kind === 'lightcone') {
      if (e.ref?.lcId !== equipped && e.target === 'self') unequipped += 1;
    } else if (e.kind === 'relicset') {
      if (e.target === 'self') relic += 1;
    } else if (e.target === 'self' && e.ownerId !== st.characterId) {
      otherSelf += 1;
    }
  }
  return { otherSelf, unequipped, relic };
}

/**
 * 把自拐卡片的勾选状态物化。
 *
 * 默认**全勾**（保持改造之前的行为：行迹/星魂/光锥本来就算自动生效的），
 * 但当前开关下不可用的（现在只剩「遗器件数不够」这一类）默认不勾，并且**显示成置灰**。
 * 用户手动取消过的（值为 false）不会被重新勾上。
 *
 * 星魂**不再**进「不可用」那一支 —— `blockedReason` 里的 `rank_locked` 已退役，
 * 189 条星魂条目现在默认就是勾上的。
 */
function syncSelfPicks() {
  const live = selfEntries();
  const next = {};
  for (const e of live) {
    next[e.id] = st.selfPicks[e.id] === false ? false : !blockedOf(e);
  }
  st.selfPicks = next;   // 顺带丢掉上一把光锥/上一个角色留下的陈旧 id
}

/** 队友目录里勾中的 id。 */
function teamPickedIds() {
  return new Set(Object.keys(st.picks.ids).filter((k) => st.picks.ids[k]));
}

/**
 * 队友目录当前页签下、按当前搜索/类别过滤后**真正会渲染出来**的条目。
 *
 * ★ 抽出来是为了让渲染和自检走同一条路 ★ 自检没法真渲染（DOM 是桩），
 *   但它能数 innerHTML 里 `data-cat="` 出现了几次。两份筛选逻辑要是各写一遍，
 *   自检就会对着一个「和界面不一样的」筛选器做断言 —— 那种断言全绿也没意义。
 */
function visibleTeamGroups() {
  const needle = st.picks.q.trim().toLowerCase();
  return groupCatalog(teamEntries().filter((e) => {
    if (st.picks.kind && e.kind !== st.picks.kind) return false;
    if (!needle) return true;
    return `${e.label}\n${e.text}\n${e.owner}`.toLowerCase().includes(needle);
  }));
}

function visibleTeamEntries() {
  return Object.values(visibleTeamGroups().tabs[st.picks.tab] ?? {}).flat();
}

/** 这次计算实际要用到的全部 id：自拐 ∪ 队友。 */
function allPickedIds() {
  const ids = new Set(Object.keys(st.selfPicks).filter((k) => st.selfPicks[k]));
  for (const id of teamPickedIds()) ids.add(id);
  return ids;
}

// ---------------------------------------------------------------------------
// 计算（全部逻辑都在这一个函数里，它只调 core/）
// ---------------------------------------------------------------------------

function selfQuery() {
  return {
    characterId: st.characterId,
    eidolon: st.eidolon,
    lightconeId: st.lightconeId,
    superimpose: st.lightconeId ? { [st.lightconeId]: st.superimpose } : {},
    relicSets: {},
  };
}

/**
 * 一次「采集 → 聚合」。
 *
 * 三路来源在这里汇合，**互不重叠**：
 *   ① builtinBuffs   —— 结构化的行迹属性节点（元素增伤），永远生效
 *   ② collectBuffs   —— 自动路径：人工表里**非技能**的记录（目前是空的，
 *                       技能记录全被 collectBuffs 自己跳过，改走目录）
 *   ③ 目录勾选       —— 技能 / 行迹 / 星魂 / 光锥，逐条
 *
 * `pickOverride` 给判据②的配队对比用：同一套公式换一组勾选再跑。
 */
function gather(pickOverride) {
  const opts = catalogOpts();
  const ids = pickOverride ?? allPickedIds();
  const sel = buffsFromSelections(ctx, CATALOG, ids, opts, { characterId: st.characterId });
  const auto = collectBuffs(ctx, { ...selfQuery(), team: [], annotations: ANN });
  const builtin = builtinBuffs(ctx, st.characterId, { level: st.level })
    .filter((b) => st.panel.elemDmg?.[b.scope?.element] == null);
  const active = [...builtin, ...auto.active, ...sel.active];
  return {
    active,
    skipped: sel.skipped,
    autoActive: auto.active.length,
    gaps: auto.gaps,
    agg: aggregate(active),
  };
}

function currentScenario() {
  const s = st.scenario;
  if (!s.mode || s.seasonId == null || !s.floorId) return null;
  return loadScenario(ctx, {
    mode: s.mode, seasonId: s.seasonId, floorId: s.floorId,
    annotations: ANN, sides: ANN.sides,
    selections: st.scenarioPicks,
  });
}

/** 判据②：把已勾选的条目按**来源角色**分组，用来做「某个辅助给我加了多少」。 */
function comboGroups() {
  const byOwner = new Map();
  for (const id of teamPickedIds()) {
    const e = CAT_BY_ID.get(id);
    if (!e || e.ownerId == null) continue;
    if (!byOwner.has(e.ownerId)) byOwner.set(e.ownerId, new Set());
    byOwner.get(e.ownerId).add(id);
  }
  const selfIds = new Set(Object.keys(st.selfPicks).filter((k) => st.selfPicks[k]));
  return { byOwner, selfIds };
}

function compute() {
  const relicCheck=relicContributions(DATA.relicTables,st.relics);
  if(st.relicAuto && !relicCheck.ok) {st.result={ok:false,error:'请修正遗器配装：'+relicCheck.errors.join('；')};renderOutput();return;}
  if(st.relicAuto&&st.relicDraftDirty){autoFillPanel();renderPanel();st.relicDraftDirty=false;}
  const ab = currentAbility();
  if (!ab) { st.result = { ok: false, error: '这个角色没有可算的技能' }; renderOutput(); return; }

  // ★ 根本不打伤害的技能在这里就拦住 ★
  //   `toHitAbility` **不透传 status**，所以不拦的话它会一路走到
  //   `core/damage.mjs` 那句「该技能没有可用的倍率（annotations/multipliers.jsonl
  //   里还没补录）」—— 把「这技能本来就不打伤害」说成「我们还没录」，
  //   正是这次要消灭的那种错标注。文案必须在这里给。
  if (ab.status === 'non-damage') {
    st.result = { ok: false, error: ab.note || '这个技能不造成伤害，不参与计算' };
    renderOutput(); return;
  }

  const { active, skipped, gaps, agg } = gather();
  const scn = currentScenario();
  // 情境增益和角色增益一起聚合 —— 它们本来就该在同一个乘区里相加

  const enemies = scn?.enemies ?? [];
  const enemy = enemies[Math.min(st.enemyIndex, Math.max(0, enemies.length - 1))] ?? null;
  const state = { broken: st.broken };
  const panel = { ...st.panel, baseStats: suggestPanel(ctx, {
    characterId: st.characterId, level: st.level, lightconeId: st.lightconeId,
  }).panel.baseStats };

  const hits = st.hitsOverride[ab.skillId] ?? (enemies.length <= 1 ? ab.randomHitsTotal : 0);
  const hitAbility = toHitAbility(ab, { randomHits: hits, targetRole: st.targetRole, includeConditional: st.includeConditional });
  const aggAll = aggregateScenarioBuffs(active, scn, enemy, state, hitAbility);
  const hit = computeHit({
    panel,
    ability: hitAbility,
    agg: aggAll, enemy, state,
    options: { critMode: st.critMode }, attackerLevel: st.level,
  });

  // 判据①：对比该层怪物血量
  const vsHp = st.metricHp && scn ? judgeAgainstHp(hit, enemies) : null;

  // 判据②：配队横向对比。**不写第二份公式** —— 就是把 computeHit 换组输入再跑。
  // 对比的几套按「来源角色」自动拼：只算自身 / 自身+某个辅助勾中的部分 / 全部勾选。
  // 这样「某个辅助给我加了多少」一眼能看出来，不需要用户另填一遍配队。
  let compare = null;
  if (st.metricTeam) {
    const { byOwner, selfIds } = comboGroups();
    const all = new Set([...selfIds, ...teamPickedIds()]);
    const combos = [{ label: '只算自身', ids: selfIds }];
    for (const [cid, ids] of byOwner) {
      combos.push({ label: `+ ${charName(cid)}`, ids: new Set([...selfIds, ...ids]) });
    }
    if (byOwner.size > 1) combos.push({ label: '全部已勾选', ids: all });
    compare = buildComparison(ctx, {
      loadouts: combos.map((c) => ({
        label: c.label, panel, ability: hitAbility,
        buffs: gather(c.ids).active, enemy, state,
        attackerLevel: st.level,
      })),
      scenario: scn, annotations: ANN, options: { critMode: st.critMode },
    });
  }

  // 队友那边的缺口：只报**勾了来源的那些角色**，且剔掉「目录里其实有」的部分
  const ownerIds = new Set([...comboGroups().byOwner.keys()]);
  const teamGaps = [];
  for (const cid of ownerIds) {
    if (cid === st.characterId) continue;
    const q = { characterId: cid, eidolon: 0, lightconeId: null, superimpose: {}, relicSets: {} };
    const g = uncoveredGaps(collectBuffs(ctx, { ...q, annotations: ANN }).gaps, CATALOG);
    for (const x of g) teamGaps.push({ ...x, owner: charName(cid) });
  }

  st.result = {
    ok: true, ab, hit, scn, enemies, enemy, agg: aggAll, characterName: charName(st.characterId), critMode: st.critMode,
    active: [...active, ...(scn?.buffs ?? [])].filter((b) => !aggAll._skipped.some((s) => s.id === b.id)),
    skipped: [...skipped, ...aggAll._skipped], vsHp, compare,
    gaps: uncoveredGaps(gaps, CATALOG),
    gapsHidden: gaps.length - uncoveredGaps(gaps, CATALOG).length,
    teamGaps,
  };
  st.stale = false;
  renderOutput();
}

// ---------------------------------------------------------------------------
// 渲染
// ---------------------------------------------------------------------------

function badge(level) {
  const cn = { known: '来源明确', partial: '自动解析', unknown: '待确认' }[level] ?? level;
  return `<span class="badge ${esc(level)}">${esc(cn)}</span>`;
}

function options(list, sel, labelOf) {
  return list.map((o) => `<option value="${esc(o.v)}"${String(o.v) === String(sel) ? ' selected' : ''}>`
    + `${esc(labelOf(o))}</option>`).join('');
}

function charOptions(sel, allowEmpty) {
  const head = allowEmpty ? `<option value=""${sel ? '' : ' selected'}>— 空 —</option>` : '';
  return head + CHARS.map((c) => `<option value="${c.id}"${String(c.id) === String(sel) ? ' selected' : ''}>`
    + `${esc(characterDisplayName(c, CHARS))}  ·  ${esc(c.element)} ${esc(c.path ?? '')}</option>`).join('');
}

/**
 * 当前该列出哪些光锥。**判据是命途相等，不是「名字里有没有」那种模糊匹配** ——
 * `characters.path` 与 `lightcones.path` 用的是同一套九个取值
 * （存护/巡猎/智识/虚无/毁灭/同谐/丰饶/记忆/欢愉），一个字都不差。
 *
 * ★ 当前装备的那把**永远列出来**，哪怕命途对不上 ★
 *   换角色时 `lightconeId` 不会自动清空。过滤掉它的话，下拉框里就没有任何
 *   一项是 selected，浏览器会**默认显示第一项** —— 界面于是显示着一把光锥，
 *   而 `st.lightconeId` 是另一把。那种不一致没有任何地方会报错。
 *   顺带把「这把装错了」标出来，比默默藏掉有用。
 */
function lcList() {
  const path = character(st.characterId)?.path ?? null;
  if (!st.lcPathOnly || !path) return LCS;
  return LCS.filter((l) => l.path === path || l.id === st.lightconeId);
}

function lcOptions(sel) {
  const list = lcList();
  return `<option value=""${sel ? '' : ' selected'}>— 不装备 —</option>`
    + list.map((l) => `<option value="${l.id}"${String(l.id) === String(sel) ? ' selected' : ''}>`
      + `${esc(l.name)}  ·  ${esc(l.path ?? '')} ★${l.rarity}`
      + `${st.lcPathOnly && l.path !== (character(st.characterId)?.path ?? null) ? '（命途不符）' : ''}`
      + '</option>').join('');
}

/**
 * 下拉框下面那句说明：同命途几把 / 折叠掉几把。
 *
 * ★ 折叠**必须说出来** ★
 *   不说的话，用户会以为「这个角色只能装这 12 把」—— 而事实是另外 157 把
 *   在数据库里躺着，只是游戏规则不让装。项目的口径是「没收录要看得见」，
 *   这里同理：**没列出来也要看得见**。
 */
function lcFilterNote() {
  const path = character(st.characterId)?.path ?? null;
  if (!path) return '';
  const mine = LCS.filter((l) => l.path === path).length;
  if (!st.lcPathOnly) return `已列出全部 <b>${LCS.length}</b> 把光锥（含命途不符的）。`;
  const hidden = LCS.length - mine;
  return `只列当前角色命途（<b>${esc(path)}</b>）的 <b>${mine}</b> 把；`
    + `另有 <b>${hidden}</b> 把别的命途已折叠（装上去游戏里也不生效）。`;
}

// --- ① 角色 -----------------------------------------------------------------
function renderActor() {
  const c = character(st.characterId);
  $('sec-actor').innerHTML = `
    <h2>角色配置 <span class="hint">CHARACTER</span></h2>
    <div class="row"><label>出场角色</label>
      <select id="f-char" style="flex:1;min-width:200px">${charOptions(st.characterId, false)}</select></div>
    <div class="row"><label>星魂</label>
      <select id="f-eid">${options([0, 1, 2, 3, 4, 5, 6].map((v) => ({ v })), st.eidolon, (o) => (o.v === 0 ? '0（无）' : `E${o.v}`))}</select>
      <label>等级</label>
      <select id="f-level">${options([80, 79, 70, 60, 50, 40, 30, 20].map((v) => ({ v })), st.level, (o) => o.v)}</select>
      <span class="faint">${esc(c?.element ?? '')} · ${esc(c?.path ?? '')} · ★${c?.rarity ?? '?'}</span></div>
    <div class="row"><label>光锥</label>
      <select id="f-lc" style="flex:1;min-width:180px">${lcOptions(st.lightconeId)}</select>
      <label>叠影</label>
      <select id="f-sup"${st.lightconeId ? '' : ' disabled'}>${options([1, 2, 3, 4, 5].map((v) => ({ v })), st.superimpose, (o) => 'S' + o.v)}</select>
      <label class="chk" title="光锥的命途必须和角色一致，别的装了也不生效">
        <input type="checkbox" id="f-lcpath"${st.lcPathOnly ? ' checked' : ''}> 只看本命途</label></div>
    <div class="faint">${lcFilterNote()}</div>
    <div class="faint">录入局外最终面板。光锥叠影同时用于增益目录。</div>`;
  bind('f-char', (v) => {
    st.characterId = Number(v); st.abilityId = null;
    st.skillLevels = {}; st.hitsOverride = {}; st.targetRole = 'primary'; st.includeConditional = false;
    st.selfPicks = {}; autoFillPanel(); syncSelfPicks();
  }, true);
  bind('f-eid', (v) => { st.eidolon = Number(v); syncSelfPicks(); }, true);
  bind('f-level', (v) => { st.level = Number(v); autoFillPanel(); }, true);
  bind('f-lc', (v) => { st.lightconeId = v ? Number(v) : null; autoFillPanel(); syncSelfPicks(); }, true);
  bind('f-sup', (v) => { st.superimpose = Number(v); }, true);
  // 复选框要看 `checked`，不能走 bind（它读的是 `value`，复选框恒为 "on"）。
  bindCheck('f-lcpath', (on) => { st.lcPathOnly = on; }, true);
}

// --- ② 技能 -----------------------------------------------------------------
function renderAbility() {
  const list = abilities();
  const ab = currentAbility();
  const selected = selectDamageTerms(ab?.terms ?? [], st);
  const okCount = list.filter((a) => a.status === 'ok').length;
  // ★ 下拉框里混着三种东西，计数得分开说 ★
  //   `non-damage` 是**根本不打伤害**的技能（治疗/护盾/增益/减益），它们留在
  //   列表里是为了不让技能凭空消失，但算进「有伤害的技能」是错的 —— 那会让人
  //   以为我们漏了它们的倍率。击破技（`out-of-scope`）是**伤害**，只是 v1 不算，
  //   所以算术上仍归在伤害那一侧。
  const ndCount = list.filter((a) => a.status === 'non-damage').length;
  const dmgCount = list.length - ndCount;

  const opt = list.map((a) => {
    // 三档标记，与下面 badge、`bad` 用的是同一套判据。顺序即优先级。
    const mark = a.status === 'ok' ? ''
      : a.status === 'out-of-scope' ? '（v1 不算：击破伤害）'
        : a.status === 'non-damage' ? '（不造成伤害）'
          : '（未收录倍率）';
    const sel = a.skillId === st.abilityId ? ' selected' : '';
    return `<option value="${a.skillId}"${sel}>${esc(a.typeName ?? '')}「${esc(a.name)}」${esc(mark)}</option>`;
  }).join('');

  // ★ `non-damage` 不走红框 ★
  //   红框（`.notice.bad`）的含义是「这条我们没弄好，是缺口」。而「治疗技能没有
  //   倍率」不是缺口，是事实。给它挂红框就等于把这次要消灭的假标注换了个地方
  //   接着显示。它照旧用默认的黄边 notice —— 是说明，不是告警。
  const bad = ab && ab.status !== 'ok' && ab.status !== 'non-damage';
  $('sec-ability').innerHTML = `
    <h2>输出技能 <span class="hint">${dmgCount} 个伤害技能 · ${okCount} 个已解析${
  ndCount ? ` · ${ndCount} 个辅助技能` : ''}</span></h2>
    <div class="row"><label>技能</label>
      <select id="f-skill" style="flex:1;min-width:200px">${opt}</select></div>
    ${ab ? `
    <div class="row">
      <label>技能等级</label>
      <input type="number" id="f-slv" min="1" max="15" value="${ab.baseLevel}">
      <span class="faint">${ab.skill?.servant
        // 忆灵技的档位规则本项目**没有核实过**：库里给的是 1–10 档的参数表，
        // 这里按和其它攻击技一样的满档默认 10。说清楚，别让它看起来像查证过的。
        ? `忆灵技：库里是 1–10 档，这里按满档 <b>10</b> 默认 —— <b>游戏内实际档位请自行核对</b> → 生效 <b>Lv.${ab.level}</b>`
        : `星魂技能加成已计入 · 生效 <b>Lv.${ab.level}</b>`}</span>
    </div>
    <div class="row">
      <label>${ab.randomHitsTotal ? '随机命中' : '倍率口径'}</label>
      ${ab.randomHitsTotal ? `<input type="number" id="f-hits" aria-label="随机伤害命中当前目标次数" min="0" max="${ab.randomHitsTotal}" value="${st.hitsOverride[ab.skillId] ?? ((currentScenario()?.enemies?.length ?? 0) <= 1 ? ab.randomHitsTotal : 0)}"><span class="faint">额外 ${ab.randomHitsTotal} 次随机伤害中，命中当前目标的次数；首次 / 全体伤害分别计算。</span>` : '<span class="faint">描述给出的总倍率已包含本次伤害。动画有多段时，也不会将总倍率再次乘段数。</span>'}
    </div>
    <div class="row"><label>伤害目标</label><select id="f-target-role">
      <option value="primary"${st.targetRole === 'primary' ? ' selected' : ''}>主目标（单只）</option>
      <option value="adjacent"${st.targetRole === 'adjacent' ? ' selected' : ''}>相邻目标（单只）</option>
    </select><label class="chk"><input id="f-conditional" type="checkbox"${st.includeConditional ? ' checked' : ''}>计入条件伤害（请确认标记等条件已满足）</label></div>
    ${selected.excluded.length ? `<details><summary>未计入的伤害项 ${selected.excluded.length} 条</summary><ul>${selected.excluded.map((t) => `<li>${esc(t.reason)}：${esc(t.text || SCALING_CN[t.scaling])}</li>`).join('')}</ul></details>` : ''}
    <div class="row">
      <label>状态</label>
      ${ab.status === 'ok' ? '' : `<span class="badge ${
    ab.status === 'out-of-scope' ? 'out'
      : ab.status === 'non-damage' ? 'out'
        : 'unknown'}">${
    ab.status === 'out-of-scope' ? '有意不算'
      : ab.status === 'non-damage' ? '不造成伤害'
        : '未收录'}</span>`}
      ${ab.status === 'ok' ? `<span class="badge plain">本次倍率 ${selected.terms.map((t) => `${SCALING_CN[t.scaling] ?? '?'} ${(t.multiplier * 100).toFixed(1)}%${t.flatAdd ? `+${t.flatAdd}` : ''}`).join(' + ') || '无即时伤害项'}</span>` : ''}
      <span class="faint">${esc(ELEMENT_CN[ab.element] ?? ab.element ?? '无属性')} · ${esc(({SingleAttack:'单体',AoEAttack:'群攻',Blast:'扩散',Bounce:'弹射'})[ab.tag] ?? ab.typeName ?? '')}</span>
    </div>
    ${ab.note ? `<div class="notice${bad ? ' bad' : ''}">${esc(ab.note)}</div>` : ''}
    ${ab.text ? `<details><summary>技能原文</summary><div class="mono" style="white-space:pre-wrap">${esc(ab.text)}</div></details>` : ''}
    ` : '<div class="empty">没有可选技能</div>'}`;

  bind('f-skill', (v) => { st.abilityId = Number(v); st.targetRole = 'primary'; st.includeConditional = false; }, true);
  bind('f-target-role', (v) => { st.targetRole = v; }, true);
  bindCheck('f-conditional', (on) => { st.includeConditional = on; }, true);
  const slv = $('f-slv');
  if (slv) {
    slv.oninput = () => { st.skillLevels[ab.skillId] = Math.max(1, Math.min(15, Number(slv.value) || 1)); markStale(); };
    slv.onchange = () => { slv.oninput(); renderAbility(); renderSelf(); renderTeam(); };
  }
  const hits = $('f-hits');
  if (hits) hits.oninput = () => { st.hitsOverride[ab.skillId] = Math.max(0,Math.min(ab.randomHitsTotal,Math.floor(Number(hits.value)||0))); markStale(); };
}

// --- ③ 面板 -----------------------------------------------------------------
const PANEL_FIELDS = [
  ['atk', '攻击力'], ['hp', '生命上限'], ['def', '防御力'], ['speed', '速度'],
  ['critRate', '暴击率'], ['critDmg', '暴击伤害'], ['breakEffect', '击破特攻'],
  ['effectHit', '效果命中'], ['effectRes', '效果抵抗'], ['energyRegen', '能量恢复倍率'], ['healingBoost', '治疗量加成'],
];
const PCT_FIELDS = new Set(['critRate', 'critDmg', 'breakEffect', 'effectHit', 'effectRes','healingBoost']);

function renderPanel() {
  const f = (k, label) => {
    const v = st.panel[k];
    const shown = PCT_FIELDS.has(k)
      ? (v == null ? '' : (v * 100).toFixed(1))
      : (v == null ? '' : Number(v).toFixed(2));
    const step = PCT_FIELDS.has(k) ? '0.1' : '1';
    return `<div class="field"><span>${esc(label)}${PCT_FIELDS.has(k) ? '（%）' : ''}</span>
      <input type="number" aria-label="${esc(label)}" step="${step}" data-panel="${k}" value="${esc(shown)}"></div>`;
  };
  $('sec-panel').innerHTML = `
    <h2>局外面板 <span class="hint">CHARACTER STATS</span></h2>
    <div class="row"><button class="mini" id="f-fill">按配装重新计算面板</button>
      <span class="faint">${st.relicAuto?'自动配装模式：修改遗器后重新计算。':'手动面板模式：保留你的输入，配装未自动应用。'}</span></div>
    <div class="grid">${PANEL_FIELDS.map(([k, l]) => f(k, l)).join('')}
      ${ELEMENTS.map((e) => `<div class="field"><span>${esc(ELEMENT_CN[e] ?? e)}增伤（%）</span>
        <input type="number" aria-label="${esc(ELEMENT_CN[e])}增伤" step="0.1" data-elem="${e}" value="${((st.panel.elemDmg?.[e] ?? 0) * 100).toFixed(1)}"></div>`).join('')}
    </div>
    <div class="faint">元素增伤填写局外总值（含行迹和属性球）；行迹部分已在初值中计入一次。百分比加攻、加生命、加防御按角色与光锥白值计算，光锥按 80 级。</div>
    ${st.panelNote ? `<div class="faint" style="margin-top:6px">${esc(st.panelNote)}</div>` : ''}`;

  $('sec-panel').querySelectorAll('[data-panel]').forEach((el) => {
    el.oninput = () => {
      const k = el.dataset.panel;
      const raw = el.value === '' ? null : Number(el.value);
      st.panel = { ...st.panel, [k]: raw == null ? null : (PCT_FIELDS.has(k) ? raw / 100 : raw) };
      st.relicAuto = false; renderRelicPanel();
      markStale();
    };
  });
  $('sec-panel').querySelectorAll('[data-elem]').forEach((el) => {
    el.oninput = () => {
      const e = el.dataset.elem;
      st.panel = { ...st.panel, elemDmg: { ...(st.panel.elemDmg ?? {}), [e]: (Number(el.value) || 0) / 100 } };
      st.relicAuto = false; renderRelicPanel();
      markStale();
    };
  });
  $('f-fill').onclick = () => { st.relicAuto=true; autoFillPanel(); renderPanel(); renderRelicPanel(); markStale(); renderOutput(); };
}

// --- ④ 全局档位 -------------------------------------------------------------
function renderGlobals() {
  $('sec-globals').innerHTML = `
    <h2>增益参数 <span class="hint">CATALOG SETTINGS</span></h2>
    <div class="row"><label>技能等级</label>
      <select id="g-tier" style="flex:1;min-width:220px">${options([
    // ★ 这两句只说**技能等级**，不提「星魂解锁」★
    //   星魂全解锁之后，「基础档」这个名字很容易被读成「星魂增益不算」——
    //   而它早就不管那件事了（见下面那段说明）。星魂数在这里的唯一作用是
    //   R3/R5 的「技能等级 +2/+1」，所以括号里说的是**技能等级**。
    { v: 'base', label: '基础满级 —— 技能等级：普攻 6 / 其余 10（R3/R5 的 +2/+1 按 ① 的星魂数，队友按 0）' },
    { v: 'max', label: '满级 —— 技能等级：普攻 10 / 其余 15（R3/R5 按满星魂，队友也按满星魂）' },
  ], st.tier, (o) => o.label)}</select></div>
    <div class="faint">技能等级决定目录里<b>技能</b>类条目的数值（含星魂 R3/R5 的「技能等级 +2/+1」）。
      <b>星魂类条目一律可勾，不受这里影响</b> —— 勾了就是「这一条算进去」，
      数值取该星魂自己的参数，与有没有解锁无关。</div>`;

  bind('g-tier', (v) => { st.tier = v; syncSelfPicks(); }, true);
}

// --- 目录行（自拐卡片和队友目录共用） ---------------------------------------

/**
 * 面板锚定条目行末的那个输入框（+「一键填充」）。
 *
 * ★ 输入框嵌在 `<label>` 里是**安全的**，但只是碰巧 ★
 *   HTML 规定：点击事件的目标本身是交互内容（比如 `<input>`）时，
 *   label 不触发它关联的那个控件。所以点输入框不会顺手把复选框翻过去。
 *   依赖的是这条，不是「看起来没问题」—— 换成一个 `<span>` 假装输入框就翻车了。
 */
function panelBox(e) {
  const { who, attr } = e.panel;
  // `@` 开头的两个（`@equipped` / `@energy`）都是「当前计算角色」，都不给用户编辑：
  // 前者在 ③ 里填了、后者直接来自数据。两者都显示成只读输入框，
  // **不是**「这一格你不用管」地把数字藏起来 —— 藏起来会让人以为这条没有数值。
  const shared = who.startsWith('@');
  const label = panelWhoCN(who);
  const shown = panelShown(who, attr, supportPanelValue(who, attr));
  const k = panelKeyOf(who, attr);
  const isPct = PCT_FIELDS.has(attr);
  // 「最多计入 #N 点」是**另一个占位符**夹出来的上限，光看这一行是看不出来的
  // （界面上没有别处写它）。所以写进 tooltip，不然这个数看起来像凭空小了。
  const capNote = e.panel.capParam != null ? `，并且先被同一句里的「最多计入」夹住` : '';
  return `<span class="catpanel" title="这条的数值 = ${esc(label)}的${esc(PANEL_FIELD_CN[attr] ?? attr)}${
    capNote} × 这条自己的百分比系数${
    e.panel.flatParam != null ? ' + 一个平值项' : ''}">
    <span class="faint">${esc(label)}的${esc(PANEL_FIELD_CN[attr] ?? attr)}${e.panel.capParam != null ? '（含上限）' : ''}</span>
    <input type="text" inputmode="decimal" data-panelfor="${esc(k)}" value="${esc(shown)}"${
  shared ? ' disabled' : ''} placeholder="?">
    ${isPct ? '<span class="faint">%</span>' : ''}
    ${shared ? '' : `<button type="button" class="mini" data-panelfill="${esc(who)}">一键填充</button>`}
  </span>`;
}

/** 把 `rowView` 的标签拼成 HTML —— 渲染的唯一出处，`refreshPanelRows` 也用这一份。 */
function catTagsHtml(tags) {
  return tags.map((t) => `<span class="tag${t.kind ? ' ' + t.kind : ''}"${
    t.title ? ` title="${esc(t.title)}"` : ''}>${esc(t.label)}</span>`).join('');
}

function catRow(e, store, opts) {
  const v = rowView(ctx, e, opts);
  const checked = !v.blocked && store[e.id] === true;
  return `<label class="catrow${v.blocked ? ' blocked' : ''}${e.panel ? ' haspanel' : ''}">
    <input type="checkbox" data-cat="${esc(e.id)}"${checked ? ' checked' : ''}${v.blocked ? ' disabled' : ''}>
    <span class="catval${v.dim ? ' dim' : ''}">${esc(v.text)}</span>
    <span class="catmain">
      <span class="catlabel" title="${esc(e.label)}">${esc(e.label)}</span>
      <span class="cattext" title="${esc(e.text)}">${esc(catalogText(ctx, e, opts))}</span>
    </span>
    <span class="cattags">${catTagsHtml(v.tags)}</span>${e.panel ? panelBox(e) : ''}
  </label>`;
}

/**
 * 按属性分组渲染一组条目（**不分页签**）。空组不出现。
 *
 * ★ 必须把三个页签合起来看 ★ 自拐卡片里既有角色自身的条目（→ 我方单体），
 *   也可能有他装备的光锥里「使我方全体」的条目（→ 我方全体）。只看其中一个
 *   页签会把另一边的条目**悄悄丢掉** —— 而它看起来就像「这些条目不存在」。
 *   合并后仍按 KEY_GROUP 的顺序排，免得分组忽上忽下。
 */
function catGroups(entries, store, opts, openAll) {
  const g = groupCatalog(entries);
  const merged = new Map();
  for (const t of Object.values(g.tabs)) {
    for (const [name, list] of Object.entries(t)) {
      merged.set(name, (merged.get(name) ?? []).concat(list));
    }
  }
  const blocks = [];
  // 「其它」分组是兜底：属性键不在 KEY_GROUP 里。有就报出来，别悄悄藏掉
  if (g.unplaced.length) blocks.push(`<div class="notice bad">有 ${g.unplaced.length} 条判不出作用对象，没有列进来。</div>`);
  const order = KEY_GROUP.map(([name]) => name).concat(['其它']);
  for (const name of order) {
    const list = merged.get(name);
    if (!list?.length) continue;
    blocks.push(`<details class="catgroup"${openAll ? ' open' : ''}><summary>${esc(name)} <b>${list.length}</b></summary>
      ${list.map((e) => catRow(e, store, opts)).join('')}</details>`);
  }
  return blocks.join('');
}

// --- ⑤ 自拐 -----------------------------------------------------------------
function renderSelf() {
  const opts = catalogOpts();
  syncSelfPicks();
  const es = selfEntries();
  const blockedN = es.filter((e) => blockedOf(e)).length;
  const pickedN = es.filter((e) => st.selfPicks[e.id]).length;

  const byKind = {};
  for (const e of es) byKind[e.kind] = (byKind[e.kind] ?? 0) + 1;
  const kindTxt = Object.entries(byKind).map(([k, n]) => `${KIND_CN[k] ?? k} ${n}`).join(' · ');

  $('sec-self').innerHTML = `
    <h2>自身增益 <span class="hint">${esc(charName(st.characterId))} · 默认启用</span></h2>
    <div class="faint" style="margin-bottom:6px">${esc(kindTxt)}${blockedN ? ` · 另有 ${blockedN} 条当前档位下不可用` : ''}
      · 已勾 <b>${pickedN}</b> / ${es.length}</div>
    <div class="row"><label style="min-width:auto"><input type="checkbox" id="s-all"${pickedN === es.length - blockedN ? ' checked' : ''}> 全选 / 全不选</label>
      <span class="faint">这里的条目<b>不会</b>出现在下面的队友目录里</span></div>
    <div class="catwrap">${es.length ? catGroups(es, st.selfPicks, opts, true) : '<div class="empty">这个角色（含当前光锥）没有已收录的自拐条目。</div>'}</div>
    <div class="faint" style="margin-top:6px">遗器套装的效果不在这里 —— 本项目不做遗器推算，
      2 件套的属性已经在面板 ③ 里了，再收一遍就是重复计算。</div>`;

  $('sec-self').querySelectorAll('[data-cat]').forEach((el) => {
    el.onchange = () => { st.selfPicks[el.dataset.cat] = el.checked; markStale(); };
  });
  bindPanelBoxes($('sec-self'));
  const all = $('s-all');
  if (all) all.onchange = () => {
    const on = all.checked;
    for (const e of selfEntries()) if (!blockedOf(e)) st.selfPicks[e.id] = on;
    renderSelf(); markStale();
  };
}

// --- ⑥ 辅助技能目录 ---------------------------------------------------------
function renderTeam() {
  const all = teamEntries();
  const { q, kind, tab } = st.picks;

  // 页签上的数字要**不带搜索条件**地数（搜索是过滤，不是「这些条目不存在」），
  // 所以这里单独按类别过一遍，不走 visibleTeamEntries
  const byKind = groupCatalog(kind ? all.filter((e) => e.kind === kind) : all);
  const nOf = (t) => Object.values(byKind.tabs[t] ?? {}).reduce((s, a) => s + a.length, 0);
  const picked = teamPickedIds();
  const srcs = sourceCharactersOf(CATALOG, picked);
  const srcN = srcs.size;
  const over = srcN > MAX_TEAM;

  const kinds = Object.entries(KIND_CN).map(([k, cn]) => ({ v: k, cn }));
  const kindCount = (k) => all.filter((e) => e.kind === k).length;

  const hn = hiddenNote();

  $('sec-team').innerHTML = `
    <h2>辅助增益目录 <span class="hint">逐条选择 · 按作用对象分组</span></h2>
    <div class="row">
      <span class="count${over ? ' over' : ''}" data-picked-count>已选来源 ${srcN}/${MAX_TEAM} 个角色 · 勾中 ${picked.size} 条</span>
      ${over ? `<span class="tag lock">超过 ${MAX_TEAM} 个辅助，不拦但请确认是有意的</span>` : ''}
    </div>
    <div class="catbar">
      <input type="text" id="t-q" placeholder="搜索技能名 / 原文 / 角色…" value="${esc(q)}">
      <select id="t-kind"><option value="">全部类别（${all.length}）</option>
        ${options(kinds.map((k) => ({ v: k.v })), kind, (o) => `${KIND_CN[o.v]}（${kindCount(o.v)}）`)}</select>
    </div>
    <div class="tabs">
      ${TABS.map((t) => `<span class="tab${t.id === tab ? ' on' : ''}" data-tab="${esc(t.id)}" title="${esc(t.hint)}">${esc(t.name)} <span class="n">${nOf(t.id)}</span></span>`).join('')}
    </div>
    <div class="catwrap">${renderTeamBody()}</div>
    <div class="faint" style="margin-top:6px">
      未列出的三类：<b>${hn.otherSelf}</b> 条是各角色<b>自己</b>的增益（速度/攻击力…），不进输出角色的公式；
      <b>${hn.unequipped}</b> 条是<b>你没装的那些光锥</b>的「装备者」条目，换装上就有了；
      <b>${hn.relic}</b> 条是遗器套装 —— 本项目不做遗器推算，属性请直接填进面板 ③。
    </div>`;

  bindPicks($('sec-team'));
  $('sec-team').querySelectorAll('[data-tab]').forEach((el) => {
    el.onclick = () => { st.picks.tab = el.dataset.tab; renderTeam(); };
  });
  // ★ 搜索框用 oninput 就地过滤，不整块重渲染 —— 重渲染会把光标顶掉 ★
  //   代价是**换完 innerHTML 必须重新绑一次**，否则新长出来的复选框全是死的
  //   （看起来勾得上，其实没进 st）—— 所以走 bindPicks 而不是再抄一遍绑定。
  const qEl = $('t-q');
  if (qEl) {
    qEl.oninput = () => {
      st.picks.q = qEl.value;
      // stub 下 querySelector 给的是同一个占位节点，赋值无害
      const box = $('sec-team').querySelector('.catwrap');
      if (box) { box.innerHTML = renderTeamBody(); bindPicks(box); }
    };
  }
  const kEl = $('t-kind');
  if (kEl) kEl.onchange = () => { st.picks.kind = kEl.value; renderTeam(); };
}

/** 在一棵子树里绑复选框。目录重渲染之后要再调一次，见 renderTeam 的搜索框注释。 */
function bindPicks(host) {
  host.querySelectorAll('[data-cat]').forEach((el) => {
    el.onchange = () => {
      st.picks.ids[el.dataset.cat] = el.checked;
      updatePickedCount();
      markStale();
    };
  });
  // 队友目录里也有面板锚定条目（辅助的招牌技能多半在这一侧），
  // 搜索时只重画正文（`renderTeamBody` + `bindPicks`），所以输入框要在这儿一起绑。
  bindPanelBoxes(host);
}

/** 只重画目录正文（搜索时用，避免整块重渲染把输入框的光标顶掉）。 */
function renderTeamBody() {
  const opts = catalogOpts();
  const tabList = visibleTeamGroups().tabs[st.picks.tab] ?? {};
  const rows = Object.entries(tabList).map(([name, arr]) => `<details class="catgroup" open>
      <summary>${esc(name)} <b>${arr.length}</b></summary>
      ${arr.map((e) => catRow(e, st.picks.ids, opts)).join('')}</details>`).join('');
  return rows || '<div class="empty">这个页签下没有匹配的条目。</div>';
}

/** 勾选后只更新那一行计数，不重渲染整个目录（会丢滚动位置）。 */
function updatePickedCount() {
  const el = $('sec-team').querySelector('[data-picked-count]');
  if (!el) return;
  const picked = teamPickedIds();
  const srcN = sourceCharactersOf(CATALOG, picked).size;
  const over = srcN > MAX_TEAM;
  el.innerHTML = `已选来源 ${srcN}/${MAX_TEAM} 个角色 · 勾中 ${picked.size} 条`
    + (over ? ` <span class="tag lock">超过 ${MAX_TEAM} 个</span>` : '');
}

// --- ⑦ 情境 -----------------------------------------------------------------
/**
 * 期次下拉框的一行文案：`冽风骑士（v4.5 · 2026/08/17 ~ 2026/09/28）`。
 *
 * ★ 版本号是**反推**的，日期是**源数据里的真值**，两样都写出来 ★
 *   写版本号是为了好认「哪个是当前版本」，写日期是为了**能核对** ——
 *   反推表在 `core/scenario.mjs` 的 `VERSION_STARTS`，用户扫一眼日期就知道对不对。
 *   没有 `begin_time` 的 18 期（最早那批）**两样都不写**，只留期名：
 *   宁可少一句，也不要为了一句好看的文案编一个版本号。
 */
function seasonLabel(x) {
  const tail = [x.version ? `v${x.version}` : null, x.period].filter(Boolean).join(' · ');
  return tail ? `${x.name}（${tail}）` : x.name;
}

function renderScenario() {
  const s = st.scenario;
  const scn = SCENARIOS.find((x) => x.mode === s.mode && x.seasonId === s.seasonId);
  const MODE_CN = { moc: '混沌回忆', pf: '虚构叙事', as: '末日幻影' };
  const modes = ['moc', 'pf', 'as'].map((m) => ({ v: m, label: MODE_CN[m] }));
  const seasons = SCENARIOS.filter((x) => x.mode === s.mode);

  $('sec-scenario').innerHTML = `
    <h2>战斗情境 <span class="hint">三深渊 · 可选</span></h2>
    <div class="row"><label>模式</label>
      <select id="f-mode"><option value=""${s.mode ? '' : ' selected'}>— 不指定（自由计算）—</option>
        ${options(modes, s.mode, (o) => o.label)}</select>
      <label>期</label>
      <select id="f-season"${s.mode ? '' : ' disabled'}>
        <option value=""${s.seasonId == null ? ' selected' : ''}>— 选一期 —</option>
        ${options(seasons.map((x) => ({ v: x.seasonId, x })), s.seasonId, (o) => seasonLabel(o.x))}</select>
      <label>层</label>
      <select id="f-floor"${scn ? '' : ' disabled'}>
        <option value=""${s.floorId == null ? ' selected' : ''}>— 选一层 —</option>
        ${options((scn?.floors ?? []).map((x) => ({ v: x.floorId, x })), s.floorId, (o) => o.x.label)}</select></div>
    ${scn && s.floorId ? renderEnemyPick() : '<div class="faint">自由计算时，防御与抗性乘区按 ×1 处理。选择情境后会使用当前目标的实际属性。</div>'}`;

  $('f-mode').onchange = (e) => {
    st.scenario = { mode: e.target.value || null, seasonId: null, floorId: null };
    st.enemyIndex = 0; st.scenarioPicks = {}; renderScenario(); renderSceneEffects(); markStale();
  };
  const se = $('f-season');
  if (se && s.mode) se.onchange = (e) => {
    st.scenario = { ...s, seasonId: e.target.value ? Number(e.target.value) : null, floorId: null };
    st.enemyIndex = 0; st.scenarioPicks = {}; renderScenario(); renderSceneEffects(); markStale();
  };
  const fl = $('f-floor');
  if (fl && scn) fl.onchange = (e) => {
    st.scenario = { ...s, floorId: e.target.value || null };
    st.enemyIndex = 0; st.scenarioPicks = {}; renderScenario(); renderSceneEffects(); markStale();
  };
  const en = $('f-enemy');
  if (en) en.onchange = (e) => { st.enemyIndex = Number(e.target.value); markStale(); };
}

/**
 * 选中「期」之后在下方把它的版本与档期写清楚 —— 下拉框里那一行会被截断，
 * 而「这一期是什么时候的」是判断「该不该拿它当参考」的关键信息。
 */
function seasonPeriodLine(scn) {
  const bits = [];
  if (scn.version) bits.push(`该期属于 <b>v${esc(scn.version)}</b>`);
  if (scn.period) bits.push(`档期 ${esc(scn.period)}`);
  if (!bits.length) {
    return '该期在源库里没有起止时间，所以既没有版本号也没有档期 —— 不反推、不编。';
  }
  return `${bits.join(' · ')}（版本号由开始日期反推，非源数据原值）`;
}

function renderEnemyPick() {
  const scn = currentScenario();
  if (!scn) return '';
  const list = scn.enemies;
  return `<div class="row"><label>打哪只</label>
      <select id="f-enemy" style="flex:1;min-width:180px">${list.map((e, i) => {
    const weak = (e.weakness ?? []).map((w) => ELEMENT_CN[w] ?? w).join('/');
    return `<option value="${i}"${i === st.enemyIndex ? ' selected' : ''}>`
      + `${e.side != null ? '第' + e.side + '路 · ' : ''}${esc(e.name)} Lv${e.level} · ${num(e.hp, 0)} 血 ×${e.spawnCount ?? 1}`
      + ` · 弱[${esc(weak)}]</option>`;
  }).join('')}</select></div>
    <div class="faint">该层共 ${list.length} 只，总血 ${num(scn.totalHp, 0)}
      ${scn.gaps.length ? ` · <b>${scn.gaps.length} 处情境增益未收录</b>` : ''}
      ${scn.excluded.length ? ` · ${scn.excluded.length} 条机制未计入` : ''}</div>
    <div class="faint">${seasonPeriodLine(SCENARIOS.find(x => x.mode === scn.mode && x.seasonId === scn.seasonId) ?? scn)}</div>`;
}

// --- ⑧ 判据开关 -------------------------------------------------------------
function renderMetrics() {
  $('sec-metrics').innerHTML = `
    <h2>计算与对比 <span class="hint">ANALYSIS</span></h2>
    <div class="row">
      <label><input type="checkbox" id="f-mhp"${st.metricHp ? ' checked' : ''}> ① 对比该层怪物实际血量</label>
      <label><input type="checkbox" id="f-mteam"${st.metricTeam ? ' checked' : ''}> ② 配队横向对比</label>
    </div>
    <div class="row"><label>暴击口径</label>
      <select id="f-crit">${options(
    [{ v: 'expected', label: '期望值（暴击率×暴伤）' }, { v: 'crit', label: '必暴' }, { v: 'noncrit', label: '不暴击' }],
    st.critMode, (o) => o.label)}</select>
      <label>敌人</label>
      <select id="f-broken">${options(
    [{ v: '0', label: '未击破' }, { v: '1', label: '已击破' }], st.broken ? '1' : '0', (o) => o.label)}</select>
    </div>
    <div class="faint">按标准伤害公式计算：未击破 ×0.9，已击破 ×1.0。结果尚未与游戏实测对拍。</div>`;
  $('f-mhp').onchange = (e) => { st.metricHp = e.target.checked; compute(); };
  $('f-mteam').onchange = (e) => { st.metricTeam = e.target.checked; compute(); };
  $('f-crit').onchange = (e) => { st.critMode = e.target.value; markStale(); };
  $('f-broken').onchange = (e) => { st.broken = e.target.value === '1'; markStale(); };
}

function renderSceneEffects() {
  const scn = currentScenario();
  const items = scn?.availableBuffs ?? [];
  $('sec-scene-effects').innerHTML = `<h2>情境增益 <span class="hint">${items.length} 项已解析</span></h2>
    <p class="faint">选择本次实际生效的祝福与增益。勾选即表示原文中的触发条件已满足。</p>
    ${items.length ? `<div class="catwrap">${items.map(e=>`<label class="catrow"><input type="checkbox" data-scene="${esc(e.id)}"${st.scenarioPicks[e.id]?' checked':''}><span class="catval">+${(e.value*100).toFixed(1)}%</span><span class="catmain"><span class="catlabel">${esc(e.label)}</span><span class="cattext">${esc(e.sourceText)}</span></span></label>`).join('')}</div>` : `<div class="empty">${scn?'此层没有可直接选择的额外增益。敌人的已知机制由计算自动计入。':'先选择战斗情境，再查看该层的增益。'}</div>`}`;
  $('sec-scene-effects').querySelectorAll('[data-scene]').forEach(el=>{
    el.onchange=()=>{st.scenarioPicks[el.dataset.scene]=el.checked;markStale();};
  });
}

let dataSearch = '';
function renderDataPanel() {
  $('sec-data').innerHTML = renderDataView(DATA, dataSearch);
  const box = $('data-search');
  if (box) box.onchange = () => { dataSearch = box.value; renderDataPanel(); };
}

// --- 横幅 -------------------------------------------------------------------
function renderBanner() {
  const selected = allPickedIds().size;
  const r = st.result;
  const missing = (r?.gaps?.length ?? 0) + (r?.teamGaps?.length ?? 0) + (r?.scn?.gaps?.length ?? 0);
  const chips = ['<span class="chip">已选增益 <b>' + selected + '</b></span>',
    '<span class="chip">当前技能 <b>' + esc(currentAbility()?.name ?? '未选择') + '</b></span>'];
  if (r?.ok && missing) chips.push('<span class="chip">当前配置 ' + missing + ' 项规则待补充</span>');
  else chips.push('<span class="chip">常规环境 · 单个目标 · 即时伤害</span>');
  $('banner').className = 'banner' + (missing ? ' warn' : '');
  $('banner-chips').innerHTML = chips.join('');
  renderDashboard({ st, character: charName(st.characterId), ability: currentAbility(), picked: selected, data: DATA });
}

// --- 结果 -------------------------------------------------------------------
function markStale() {
  if (st.result) st.stale = true;
  renderOutput();
}

function renderOutput() {
  renderBanner();
  $('result').innerHTML = renderResults({ result: st.result, stale: st.stale,
    critMode: st.result?.critMode ?? st.critMode, character: st.result?.characterName ?? charName(st.characterId),
    vsHp: st.result?.ok ? renderVsHp(st.result) : '',
    compare: st.result?.ok ? renderCompare(st.result) : '', skipReason: skipReasonCN });
}

function skipReasonCN(reason) {
  if (!reason) return '原因未知';
  if (reason.startsWith('rank_locked')) {
    const [, need, have] = reason.split(':');
    return `需要星魂 R${need}，当前只有 R${have}`;
  }
  if (reason.startsWith('piece_short')) return `需要 ${reason.split(':')[1]} 件套`;
  if (reason.startsWith('unmodelled')) {
    // 长说明在 `UNMODELLED` 里（`core/catalog.mjs`），目录行的悬停提示也是它。
    // 这里只说「不是数据缺了、是模型没有这一档」——不写这句的话，
    // 用户会当成又一个没录完的坑，去补录一个**本来就补不进去**的东西。
    return '模型里没有这一档（平值伤害），算不了';
  }
  if (reason.startsWith('panel_missing')) {
    const who = reason.split(':')[1];
    // `@energy`（能量上限）走的是同一条 —— 它也不是「用户没填」，
    // 而是数据里这个角色就没有能量上限。文案对它略宽，但方向是对的：
    // 这一条现在取不到值，得先补上那个基数。
    return who.startsWith('@') ? '请先填「当前计算角色」的面板' : `请先填「${who}」的面板`;
  }
  if (reason === 'no_value') return '这条在当前档位下取不到数值';
  if (reason === 'not_self') return '这是那个角色自己的增益，本次算的是别人';
  if (reason === 'not_in_catalog') return '目录里没有这个 id（多半是换了角色/光锥留下的旧勾选）';
  return reason;
}

function renderVsHp(r) {
  if (!st.metricHp) return '';
  if (!r.scn) return `<h2 style="margin-top:16px">判据① 对比怪物血量</h2>
    <div class="empty">没选情境，没有血量可比。</div>`;
  const j = r.vsHp;
  if (!j?.ok) return `<h2 style="margin-top:16px">判据① 对比怪物血量</h2>
    <div class="notice">${esc(j?.error ?? '算不出来')}</div>`;
  return `
    <h2 style="margin-top:16px">判据① 对比怪物血量</h2>
    <table><thead><tr><th>敌人</th><th class="num">等级</th><th class="num">总血</th>
      <th class="num">这一击占</th><th class="num">几段能杀</th><th>弱点</th></tr></thead><tbody>
      ${j.perEnemy.map((e) => `<tr>
        <td>${esc(e.name)}</td><td class="num">${e.level}</td>
        <td class="num">${num(e.totalHp, 0)}</td>
        <td class="num">${e.dmgPct == null ? '—' : (e.dmgPct * 100).toFixed(2) + '%'}</td>
        <td class="num">${e.kills ?? '—'}</td>
        <td>${e.hitsWeakness === null ? '—' : e.hitsWeakness
    ? '<span class="badge known">命中</span>' : '<span class="badge partial">未命中</span>'}</td></tr>`).join('')}
    </tbody></table>
    <div class="faint">整波总血 ${num(j.waveTotalHp, 0)}，这一击占 ${pct(j.wavePct)}。
      ${esc(j._note)}</div>`;
}

function renderCompare(r) {
  if (!st.metricTeam) return '';
  const c = r.compare;
  if (!c) return '';
  const best = c.rows.find((x) => x.label === c.best);
  return `
    <h2 style="margin-top:16px">判据② 配队横向对比</h2>
    <table><thead><tr><th>配队</th><th class="num">总伤害</th><th class="num">相对最优</th><th class="num">相对基线</th><th>可信度</th></tr></thead><tbody>
      ${c.rows.map((row) => `<tr>
        <td>${esc(row.label)}</td>
        <td class="num">${row.ok ? num(row.total, 0) : '—'}</td>
        <td class="num">${row.vsBest == null ? '—' : (row.vsBest * 100).toFixed(1) + '%'}</td>
        <td class="num">${row.vsBaseline == null ? '—' : (row.vsBaseline * 100).toFixed(1) + '%'}</td>
        <td>${badge(row.coverage?.overall ?? 'unknown')}${row.ok ? '' : ` <span class="faint">${esc(row.error ?? '')}</span>`}</td></tr>`).join('')}
    </tbody></table>
    <div class="faint">最优：<b>${esc(c.best ?? '—')}</b>${best ? `（${num(best.total, 0)}）` : ''}。
      对比只换了增益输入，公式是同一个 —— 所以这里读的是<b>相对关系</b>，不是绝对值。
      每行的「+ 某人」= 你自己的增益 + <b>那个人</b>被勾中的条目。</div>`;
}

// ---------------------------------------------------------------------------
// 绑定与启动
// ---------------------------------------------------------------------------
function bind(id, fn, rerender) {
  const el = $(id);
  if (!el) return;
  el.onchange = () => { fn(el.value); if (rerender) { renderAll(); } markStale(); };
}

/**
 * 复选框专用。**不能复用 `bind`** —— 它读的是 `el.value`，
 * 而复选框的 `value` 恒为 `"on"`，跟勾没勾一点关系都没有。
 * 用 `bind` 绑定复选框的表现是：点一下就把状态设成 `"on"`（真值），
 * **再也取消不掉**，而且不报错。
 */
function bindCheck(id, fn, rerender) {
  const el = $(id);
  if (!el) return;
  el.onchange = () => { fn(!!el.checked); if (rerender) { renderAll(); } markStale(); };
}

function renderAll() {
  renderActor();
  renderAbility();
  renderPanel();
  renderGlobals();
  renderSelf();
  renderTeam();
  renderScenario();
  renderMetrics();
  renderSceneEffects();
  renderDataPanel();
  renderRelicPanel();
  renderBanner();
}

autoFillPanel();
initTheme();
syncSelfPicks();
renderAll();
renderOutput();
$('calc').onclick = compute;

// 回车直接算 —— 面板里连着填十个数的时候省事
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target && e.target.tagName === 'INPUT') {
    e.preventDefault();
    e.target.onchange?.(e);
    compute();
  }
});

// 供控制台和打包自检用：自检**不跑真 DOM**，所以它直接改 st 再调 compute()
window.__HSR = {
  ctx, st, DATA, compute, CATALOG, CAT_BY_ID,
  // ★ 打包自检要按状态挑技能（挑一条 `non-damage` 的点一下，确认文案短路了）★
  //   不给它这个口子的话，自检只能在源码里写死一个技能 id —— 那种硬编码
  //   在技能表变动时会静默失效（挑到一条已经不是 non-damage 的，断言照样绿）。
  abilities,
  selfEntries, teamEntries, visibleTeamEntries, allPickedIds, catalogOpts,
  syncSelfPicks, renderAll, hiddenNote, DISPLAY_ONLY_KEYS,
  // ★ 光锥下拉框的内容 ★
  //   命途过滤的结果**只出现在 `<option>` 里**，而自检的 DOM 桩不解析 HTML
  //   （`querySelectorAll: () => []`），从渲染结果那侧一条都数不出来。
  //   所以把「过滤后剩哪几把」直接交出去让自检问 —— 否则这条规则是**零覆盖**：
  //   把过滤整条删掉（`return LCS;`）自检照样全绿。
  //   同理交出 `LCS`，好让自检把「全部 169 把」这个数当着它自己验一遍。
  lcList, LCS,
  // 「一键填充」靠它把条目里的显示名换回角色 id —— 查不到就**静默什么都不做**，
  // 所以自检要能直接问它「这个名字你认不认得」。
  charIdByName, fillSupportPanel,
};
