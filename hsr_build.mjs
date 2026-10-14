// 打包成单文件 HTML。**零依赖、双击即用。**
//
//   node hsr_build.mjs            产出 崩铁伤害计算器.html
//   node hsr_build.mjs --no-check 跳过自检（只为了快点看体积）
//
// 做三件事：
//   1. 把 ui/app.mjs 和它 import 的 core/*.mjs 打成一个包
//   2. 把 10 MB 的数据 gzip + base64 内嵌（浏览器用原生 DecompressionStream 解回）
//   3. **在 Node 里把打好的包跑一遍**（DOM 打桩），验证它能启动、能算出一个数
//
// ★ 为什么不用「剥掉 import/export 直接拼接」★
//   那是常见的做法，但它要求所有模块的顶层标识符全局唯一 —— 而
//   damage.mjs 和 abilities.mjs 都有 `SCALING_CN`。拼接会在浏览器里
//   抛 "Identifier has already been declared"，而**构建期完全看不出来**。
//   所以这里给每个模块套一层函数作用域，自己实现一个 30 行的模块注册表。
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const BATTLE=process.argv.includes('--battle');
const ENTRY = BATTLE?'ui/battle-app.mjs':'ui/app.mjs';
const OUT = path.join(ROOT, BATTLE?'战斗模拟器.html':'崩铁伤害计算器.html');
const TMP_BUNDLE = path.join(ROOT, '_data_cache', '_bundle_check.mjs');
const CHECK = !process.argv.includes('--no-check');

const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');

// ---------------------------------------------------------------------------
// 1. 解析 import 图
// ---------------------------------------------------------------------------

const RE_IMPORT = /^[ \t]*import\s+([\s\S]*?)\s*from\s*['"]([^'"]+)['"][ \t]*;?[ \t]*$/gm;
const RE_IMPORT_BARE = /^[ \t]*import\s*['"]([^'"]+)['"][ \t]*;?[ \t]*$/gm;
const RE_EXPORT_DECL = /^[ \t]*export\s+(async\s+)?(function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm;
const RE_EXPORT_LIST = /^[ \t]*export\s*\{([^}]*)\}[ \t]*;?[ \t]*$/gm;
const RE_EXPORT_FROM = /^[ \t]*export\s*\{[^}]*\}\s*from\s*['"][^'"]+['"][ \t]*;?[ \t]*$/gm;

function resolve(fromFile, spec) {
  if (!spec.startsWith('.')) {
    // 浏览器包里不该出现 node: / 裸模块 —— 那会在浏览器里直接炸
    throw new Error(`${rel(fromFile)} 引用了非相对模块 '${spec}'；core 和 ui 必须保持零外部依赖`);
  }
  return rel(path.resolve(path.dirname(fromFile), spec));
}

/** 读一个模块，剥出依赖、导出名和本体代码。 */
function load(file) {
  const abs = path.join(ROOT, file);
  if (!fs.existsSync(abs)) throw new Error(`找不到模块 ${file}`);
  let src = fs.readFileSync(abs, 'utf8');

  const deps = [];
  const exports = new Set();

  src = src.replace(RE_EXPORT_FROM, (m) => {
    throw new Error(`${file} 用了 \`export … from\`（${m.trim()}）；`
      + '那不会建立本地绑定，打包器不处理这种形式，请改成先 import 再 export');
  });

  src = src.replace(RE_IMPORT, (m, clause, spec) => {
    const id = resolve(abs, spec);
    deps.push(id);
    const c = clause.trim();
    const ns = /^\*\s+as\s+([A-Za-z_$][\w$]*)$/.exec(c);
    if (ns) return `const ${ns[1]} = __req(${JSON.stringify(id)});`;
    const named = /^\{([\s\S]*)\}$/.exec(c);
    if (named) {
      const binds = named[1].split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
        const as = /^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/.exec(s);
        return as ? `${as[1]}: ${as[2]}` : s;
      });
      return `const { ${binds.join(', ')} } = __req(${JSON.stringify(id)});`;
    }
    throw new Error(`${file}: 认不出的 import 写法「${c}」`);
  });
  src = src.replace(RE_IMPORT_BARE, (m, spec) => {
    deps.push(resolve(abs, spec));
    return '';
  });

  src = src.replace(RE_EXPORT_DECL, (m, asyncKw, kind, name) => {
    exports.add(name);
    return m.replace(/^[ \t]*export\s+/, '');
  });
  src = src.replace(RE_EXPORT_LIST, (m, names) => {
    for (const s of names.split(',').map((x) => x.trim()).filter(Boolean)) {
      const as = /^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/.exec(s);
      exports.add(as ? as[2] : s);
    }
    return '';
  });

  if (/^[ \t]*export\b/m.test(src)) {
    const bad = /^[ \t]*export\b.*$/m.exec(src)[0].trim();
    throw new Error(`${file} 还有没处理的 export：${bad}`);
  }
  if (/^[ \t]*import\b/m.test(src)) {
    const bad = /^[ \t]*import\b.*$/m.exec(src)[0].trim();
    throw new Error(`${file} 还有没处理的 import：${bad}`);
  }
  if (src.includes('import.meta')) throw new Error(`${file} 用了 import.meta，浏览器包里的模块没有这个`);

  return { file, deps, exports: [...exports], code: src };
}

const mods = new Map();
(function walk(file) {
  if (mods.has(file)) return;
  const m = load(file);
  mods.set(file, m);
  for (const d of m.deps) walk(d);
})(ENTRY);

// 拓扑序（依赖在前）
const order = [];
const seen = new Set();
(function topo(file) {
  if (seen.has(file)) return;
  seen.add(file);
  for (const d of mods.get(file).deps) topo(d);
  order.push(file);
})(ENTRY);

// 静态检查：每个 __req 的 id 都得有定义
for (const f of order) {
  for (const d of mods.get(f).deps) {
    if (!mods.has(d)) throw new Error(`${f} 依赖的 ${d} 没有被收进包`);
  }
}

// ---------------------------------------------------------------------------
// 2. 拼包
// ---------------------------------------------------------------------------
const bundle = `/* 崩铁伤害计算器 —— 由 hsr_build.mjs 生成，勿手改。
   模块 ${order.length} 个：${order.join(', ')}
   每个模块包在一层函数作用域里，所以不同模块里的同名顶层变量（如两个 SCALING_CN）
   不会互相覆盖 —— 直接拼接会在浏览器里抛 "Identifier has already been declared"。 */
(function () {
  'use strict';
  var __mods = Object.create(null);
  var __cache = Object.create(null);
  function __def(id, fn) { __mods[id] = fn; }
  function __req(id) {
    if (__cache[id]) return __cache[id];
    var fn = __mods[id];
    if (!fn) throw new Error('模块没打进包里: ' + id);
    return (__cache[id] = fn(__req));
  }
${order.map((f) => `__def(${JSON.stringify(f)}, function (__req) {
${mods.get(f).code}
return { ${mods.get(f).exports.join(', ')} };
});`).join('\n')}
  if (typeof window !== 'undefined') window.__HSR_BOOT__ = function () { return __req(${JSON.stringify(ENTRY)}); };
})();
`;

// ---------------------------------------------------------------------------
// 3. 自检：在 Node 里把包跑起来（DOM 打桩），确认能启动并算出一个数
// ---------------------------------------------------------------------------
if (CHECK) {
  fs.mkdirSync(path.dirname(TMP_BUNDLE), { recursive: true });
  fs.writeFileSync(TMP_BUNDLE, bundle, 'utf8');

  const syntax = spawnSync(process.execPath, ['--check', TMP_BUNDLE], { encoding: 'utf8' });
  if (syntax.status !== 0) {
    console.error('打包语法检查未通过：\n' + String(syntax.error || syntax.stderr || '没有诊断输出').slice(0, 2000));
    process.exit(1);
  }

  const dataJson = fs.readFileSync(path.join(ROOT, '_data_cache', 'hsr_core.json'), 'utf8');
  const harness = BATTLE?battleHarness():`
import fs from 'node:fs';
import path from 'node:path';

// —— 最小 DOM 打桩：只要够让 ui/app.mjs 的启动路径跑完就行 ——
// 这不是渲染，是「把模块加载一遍并调一次 compute()」，用来抓
// 拼接错误、模块 id 写错、渲染函数里的 ReferenceError 这类事。
const nodes = new Map();
function node(id) {
  if (!nodes.has(id)) nodes.set(id, {
    id, innerHTML: '', className: '', value: '', textContent: '', style: {},
    dataset: {}, checked: false,
    // 桩**不解析 HTML**，所以 querySelector* 只能是「假装元素都在」。
    // 目的是让绑定代码路径跑一遍（抓 ReferenceError / 拼错的方法名），
    // 不是验证选择器对不对 —— 那要靠真页面，而本项目明确不用渲染做验证。
    querySelectorAll: () => [], querySelector: () => node('_sel'),
    addEventListener: () => {}, appendChild: () => {},
  });
  return nodes.get(id);
}
globalThis.document = {
  getElementById: (id) => node(id),
  createElement: () => node('_' + Math.random()),
  addEventListener: () => {},
  body: node('body'),
};
globalThis.window = globalThis;
globalThis.Blob = class {};
globalThis.DecompressionStream = class {};

globalThis.__HSR_DATA__ = JSON.parse(fs.readFileSync(${JSON.stringify(path.join(ROOT, '_data_cache', 'hsr_core.json'))}, 'utf8'));

await import(${JSON.stringify('file:///' + TMP_BUNDLE.replace(/\\\\/g, '/'))});
if (typeof window.__HSR_BOOT__ !== 'function') throw new Error('包没有挂上 window.__HSR_BOOT__');
window.__HSR_BOOT__();

const S = window.__HSR;
if (!S) throw new Error('启动后没拿到 window.__HSR');
console.log('  模块加载 + 界面启动: OK');

// 先算一遍基线
S.compute();
let base = S.st.result;
if (!base?.ok) throw new Error('算不出来: ' + (base?.error ?? '?'));

// ---------------------------------------------------------------------------
// ★ 根本不打伤害的技能：点它会**短路**，文案必须说「不造成伤害」★
// ---------------------------------------------------------------------------
//   不短路的话它会一路走到 core/damage.mjs 那句「该技能没有可用的倍率
//   （annotations/multipliers.jsonl 里还没补录）」—— 把「这技能本来就不打伤害」
//   说成「我们还没录」。这两句话在界面上长得一样，意思完全相反。
//
//   ★ 这一条是 ui/app.mjs 里**唯一**有自动覆盖的一处 ★
//     下拉框标记 / 徽标 / 头部计数那几处模板替换没覆盖：DOM 桩不解析 HTML，
//     数不出标记来。但「点下去有没有走短路」测得出来，而短路正是最关键的一处。
{
  let picked = null;
  for (const c of S.DATA.characters) {
    S.st.characterId = c.id; S.st.abilityId = null; S.st.eidolon = 0;
    S.st.picks.ids = {}; S.st.selfPicks = {}; S.syncSelfPicks();
    const nd = S.abilities().filter(function (a) { return a.status === 'non-damage'; });
    if (!nd.length) continue;
    picked = { ch: c, ab: nd[0] };
    break;
  }
  if (!picked) throw new Error('全库一条 non-damage 技能都没有 —— 那条分支可能被删掉了');
  S.st.abilityId = picked.ab.skillId;
  S.compute();
  const err = (S.st.result && S.st.result.error) || '';
  if (err.indexOf('不造成伤害') < 0) {
    throw new Error('选了「' + picked.ch.name + ' / ' + picked.ab.name + '」（'
      + picked.ab.skillId + '，tag=' + picked.ab.tag + '）之后，结果里没有说「不造成伤害」，'
      + '而是：' + (err || '(没有报错，居然算下去了)'));
  }
  // 反面：**能算**的技能点下去不许报这句话，否则上面那半是恒真的
  // （把 compute 写成永远报「不造成伤害」也能过上半条）。
  const okAb = S.abilities().filter(function (a) { return a.status === 'ok'; })[0];
  if (okAb) {
    S.st.abilityId = okAb.skillId;
    S.compute();
    const err2 = (S.st.result && S.st.result.error) || '';
    if (err2.indexOf('不造成伤害') >= 0) {
      throw new Error('可算的技能「' + okAb.name + '」也被说成「不造成伤害」了：' + err2);
    }
  }
  console.log('  不打伤害的技能: ' + picked.ch.name + ' / ' + picked.ab.name
    + '（tag=' + picked.ab.tag + '）→ 界面说「不造成伤害」，没掉进「还没补录」');
}

// 从**目录**里挑一条辅助条目勾上 —— 走的就是界面上那个复选框改的那份状态，
// 不是另开一条后门。
//
// ★ 挑法必须排除「仅显示」的属性键 ★ 目录里第一条恰好是丹恒战技的减速
//   （speedPct），勾了它伤害**本来就不该变** —— 拿它做「伤害要变大」的断言
//   会得到一个永远红的假警报，然后这行自检就会被当成噪声删掉。
//   同样排除 elation：它只在欢愉角色身上进公式。
const NO_DMG = new Set([...S.DISPLAY_ONLY_KEYS, 'elation']);
// 前面的非伤害技能检查切换过角色，比较前必须重新取同一配置的基线。
S.compute(); base = S.st.result;
const teamShown = new Set(S.teamEntries().map((t) => t.id));
const pick = S.CATALOG.find((e) => e.ownerId !== S.st.characterId
  && teamShown.has(e.id)
  && !NO_DMG.has(e.key)
  && e.key === 'dmgBoost' && !e.panel && !e.scope?.element);
if (!pick) throw new Error('目录里挑不出一条可勾的辅助条目');
S.st.picks.ids[pick.id] = true;
S.compute();
const r = S.st.result;
if (!r?.ok) throw new Error('勾了条目之后算不出来: ' + (r?.error ?? '?'));
if (!(r.hit.total > base.hit.total)) {
  throw new Error('勾了一条辅助增益，伤害没有变大：'
    + base.hit.total.toFixed(1) + ' → ' + r.hit.total.toFixed(1) + '（' + pick.id + '）');
}
console.log('  端到端: ' + S.ctx.charById.get(S.st.characterId).name
  + ' + 勾「' + pick.label + '」→ ' + Math.round(r.hit.total) + ' 伤害（基线 '
  + Math.round(base.hit.total) + '），'
  + '生效增益 ' + r.active.length + ' 条，'
  + '可信度 ' + r.hit.coverage.overall + '，'
  + r.gaps.length + ' 处角色缺口 / ' + r.teamGaps.length + ' 处辅助缺口');

// ---------------------------------------------------------------------------
// 目录控件的三条断言
// ---------------------------------------------------------------------------
// ★ 先装备一把光锥再验 ★
//   「两份目录不重叠」这条**不装光锥时是恒真的**：自拐卡片里全是 target==='self'
//   的条目，而辅助目录本来就滤掉了 target==='self' —— 于是把「排除重复」那行删掉
//   也照样全绿（反证跑过，确认它是哑的）。真正会重叠的只有一种：**装备的光锥**
//   里那些「使我方全体…」的条目 —— 它们同时属于自拐卡片（装备者是你）和辅助目录
//   （作用对象是团队）。所以这里必须挑一把**带非自身条目**的光锥装上，
//   否则下面 (3) 等于没跑。
const lcWithTeam = S.DATA.lightcones.find((l) => S.CATALOG.some(
  (e) => e.kind === 'lightcone' && e.ref && e.ref.lcId === l.id && e.target !== 'self'));
if (!lcWithTeam) throw new Error('库里没有任何「带非自身条目」的光锥，(3) 会退化成恒真');
S.st.lightconeId = lcWithTeam.id;
S.syncSelfPicks();
S.renderAll();
S.compute();

// ★ 这几条是**数 DOM 字符串**，不是「有没有抛错」★
//   桩不解析 HTML，但 innerHTML 是个普通字符串属性，所以能数 data-cat 出现了几次
//   —— 于是「渲染函数把一部分条目悄悄漏掉了」这种事**测得出来**。
//   只断言「没抛错」的话，一个只渲染第一个属性分组的 catGroups 照样全绿。
//
// ⚠ 这一段整个写在 build 的模板字符串里，所以**不许出现反引号**（会截断它），
//   也不许出现「美元花括号」那种插值（会在构建期求值）。一律用单引号 + 加号拼。
const rowsIn = (id) => ((document.getElementById(id).innerHTML.match(/data-cat="/g) || []).length);

// (1) 自己的增益：渲染出来的行数 === selfEntries 的条数（一条都不能漏）
const selfN = S.selfEntries().length;
const selfRows = rowsIn('sec-self');
if (selfRows !== selfN) {
  throw new Error('自拐卡片渲染了 ' + selfRows + ' 行，但有 ' + selfN + ' 条 —— 分组渲染漏了条目');
}

// (2) 辅助目录：同理，对着**当前页签**算期望值
const teamN = S.visibleTeamEntries().length;
const teamRows = rowsIn('sec-team');
if (teamRows !== teamN) {
  throw new Error('辅助目录渲染了 ' + teamRows + ' 行，当前页签应有 ' + teamN + ' 条 —— 分组渲染漏了条目');
}
if (teamN === 0) throw new Error('辅助目录当前页签是空的，上面的对拍等于没跑');

// (3) 两份目录**不许重叠** —— 重叠的条目会被勾两次，数值静默翻倍
const selfIds = new Set(S.selfEntries().map((e) => e.id));
const teamIds = new Set(S.teamEntries().map((e) => e.id));
const both = S.teamEntries().filter((e) => selfIds.has(e.id));
if (both.length) {
  throw new Error('有 ' + both.length + ' 条同时出现在自拐卡片和辅助目录里：'
    + both.slice(0, 3).map((e) => e.id).join(', '));
}
// ★ 非空反向 ★ 两份目录都得非空，且**自拐卡片里必须真的存在 target!=='self' 的条目**
//   —— 那才是唯一会落进两份目录的东西。少了这个前置，删掉排除逻辑也测不出来
//   （上面装光锥那一段保证它成立）。
const selfNonSelf = S.selfEntries().filter((e) => e.target !== 'self');
if (!selfN || !teamIds.size) throw new Error('自拐或辅助目录是空的，(3) 等于没跑');
if (!selfNonSelf.length) {
  throw new Error('自拐卡片里没有 target!=self 的条目，(3) 在空集合上恒真 —— 检查装的那把光锥');
}

// (4) **独立重数**：不看 app 的过滤函数，只按目录自己的字段（kind / target / ownerId /
//     lcId）重新分一遍，两边必须逐项对上。
//     ★ 不能写成「自拐 + 辅助 + 剩下的 === 总数」★那是个恒等式 —— 「剩下的」
//     会自动把漏掉的条目吸进去，于是筛选器少给了一批也照样绿。按字段独立数才有内容。
const me = S.st.characterId;
const equipped = S.st.lightconeId;
let accSelf = 0, accTeam = 0, accOtherSelf = 0, accUnequipped = 0, accRelic = 0;
for (const e of S.CATALOG) {
  const isEqLc = e.kind === 'lightcone' && e.ref && e.ref.lcId === equipped;
  if (isEqLc) accSelf += 1;
  else if (e.kind === 'lightcone') { if (e.target === 'self') accUnequipped += 1; else accTeam += 1; }
  else if (e.kind === 'relicset') { if (e.target === 'self') accRelic += 1; else accTeam += 1; }
  else if (e.target === 'self') { if (e.ownerId === me) accSelf += 1; else accOtherSelf += 1; }
  else accTeam += 1;
}
if (accSelf !== selfN) {
  throw new Error('按目录字段独立数出的自拐是 ' + accSelf + ' 条，界面给了 ' + selfN + ' 条');
}
if (accTeam !== teamIds.size) {
  throw new Error('按目录字段独立数出的辅助是 ' + accTeam + ' 条，界面给了 ' + teamIds.size + ' 条');
}
if (accSelf + accTeam + accOtherSelf + accUnequipped + accRelic !== S.CATALOG.length) {
  throw new Error('五类相加 ' + (accSelf + accTeam + accOtherSelf + accUnequipped + accRelic)
    + ' ≠ 全量 ' + S.CATALOG.length + ' —— 有条目不属于任何一类');
}
// 界面那句「未列出的三类」必须和这份独立重数**逐项**对上 —— 对不上就是界面在说假话
const hn = S.hiddenNote();
if (hn.otherSelf !== accOtherSelf || hn.unequipped !== accUnequipped || hn.relic !== accRelic) {
  throw new Error('界面报的未列出分类 [别家自拐 ' + hn.otherSelf + ' / 没装的光锥 '
    + hn.unequipped + ' / 遗器 ' + hn.relic + '] 和独立重数 ['
    + accOtherSelf + ' / ' + accUnequipped + ' / ' + accRelic + '] 对不上');
}
console.log('  目录控件: 自拐 ' + selfN + ' 行 / 辅助 ' + teamN + ' 行（当前页签），两份不重叠；'
  + '未列出 ' + (accOtherSelf + accUnequipped + accRelic) + ' 条（别家自拐 ' + accOtherSelf
  + ' + 没装的光锥 ' + accUnequipped + ' + 遗器 ' + accRelic + '），合计 ' + S.CATALOG.length + ' 条');

// ---------------------------------------------------------------------------
// 面板锚定条目：输入框那一路（界面状态 → 取值 → 伤害）
// ---------------------------------------------------------------------------
// ★ 这一段**非得是端到端**的 ★
//   「提高数值等同于布洛妮娅#2%暴击伤害」这条的数值中间隔着四层：
//   输入框 → st.supportPanels → catalogOpts().panels → catalogValue → 乘区。
//   任何一层接错，表现都是**伤害纹丝不动**，而不是抛错 ——
//   和「这条增益本来就不大」在界面上长得一模一样。分层单测能证明每层自己对，
//   证明不了它们接在一起。
//
// ★ 三段都要断言，缺一段都能被糊弄过去 ★
//   ① 勾了但没填面板 → 不许生效，且必须说得出「缺谁的面板」；
//   ② 填上 → 必须生效且伤害真的变大；
//   ③ 清空（不是填 0）→ 必须退回 ①。
//   只留②的话，一个「永远返回 0」的实现照样绿；只留①的话，
//   一个「填了也永远取不到」的实现照样绿。
//
// ⚠ 这一段也在 build 的模板字符串里，规则同上：不许反引号、不许花括号插值。
// ★ 挑「带平值项」的那一条，而且必须带 ★
//   平值项让「空」和「0」在数值上**真的不一样**：清空 → 取不到值 → 不生效；
//   填 0 → 值 = 0 × 系数 + 平值 = 平值 → **照样生效**，还多送一个平值增益。
//   不带平值的条目两者都算 0，③ 就只剩「理由」那半边拦得住它了 —— 能拦，
//   但那半边换成别的坏法也可以不红，不如让数值自己说话。
const panelPick = S.CATALOG.find((e) => e.panel && e.panel.flatParam != null
  && e.key === 'critDmg' && e.ownerId !== S.st.characterId);
if (!panelPick) throw new Error('目录里挑不出一条「带平值项的面板锚定条目」，这一段等于没跑');

// 输入框真的被渲染出来了吗 —— 数 innerHTML 里的 data-panelfor，和条目数对拍
S.st.picks.tab = 'ally_single';
S.st.picks.q = ''; S.st.picks.kind = '';
S.renderAll();
const panelVisible = S.visibleTeamEntries().filter((e) => e.panel);
if (!panelVisible.length) throw new Error('当前页签下一条面板锚定条目都没有，渲染对拍等于没跑');
const pfRows = ((document.getElementById('sec-team').innerHTML.match(/data-panelfor="/g) || []).length);
if (pfRows !== panelVisible.length) {
  throw new Error('当前页签渲染了 ' + pfRows + ' 个面板输入框，但有 '
    + panelVisible.length + ' 条面板锚定条目 —— 渲染漏了');
}

S.st.picks.ids = {};
S.st.supportPanels = {};
S.compute();
const pBase = S.st.result.hit.total;
const who = panelPick.panel.who;
const pattr = panelPick.panel.attr;

// ① 勾了、面板没填 → 不许生效
S.st.picks.ids[panelPick.id] = true;
S.compute();
const p1 = S.st.result;
if (p1.hit.total !== pBase) {
  throw new Error('面板还没填，伤害就变了：' + pBase.toFixed(1) + ' → ' + p1.hit.total.toFixed(1)
    + '（' + panelPick.id + '）');
}
const why1 = (p1.skipped.find((s) => s.id === panelPick.id) || {}).reason;
if (why1 !== 'panel_missing:' + who) {
  throw new Error('没填面板时那条的理由应当是 panel_missing:' + who + '，实际是 ' + why1);
}

// ② 填上那个人的那一项 → 必须生效、伤害必须变大
S.st.supportPanels = {};
S.st.supportPanels[who] = {};
S.st.supportPanels[who][pattr] = 2.0;
S.compute();
const p2 = S.st.result;
if (p2.skipped.some((s) => s.id === panelPick.id)) {
  throw new Error('填了面板还是没生效：' + JSON.stringify(p2.skipped.find((s) => s.id === panelPick.id)));
}
if (!(p2.hit.total > pBase)) {
  throw new Error('填了「' + who + '的' + pattr + '」，伤害没有变大：'
    + pBase.toFixed(1) + ' → ' + p2.hit.total.toFixed(1) + '（' + panelPick.id + '）');
}

// ③ 清空（而不是填 0）→ 必须退回 ①：条目重新「没生效」，伤害退回基线。
//    这一条盯的是「空串 = 没填」这个语义 —— 写成 0 的话条目会**生效**，
//    而且数值是个凭空来的 0，界面上看不出来。
S.st.supportPanels[who][pattr] = null;
S.compute();
const p3 = S.st.result;
if (p3.hit.total !== pBase) {
  throw new Error('把面板清空之后伤害没退回基线：' + p3.hit.total.toFixed(1) + ' vs ' + pBase.toFixed(1));
}
if ((p3.skipped.find((s) => s.id === panelPick.id) || {}).reason !== 'panel_missing:' + who) {
  throw new Error('清空面板应当退回「请先填面板」，实际没有');
}
S.st.picks.ids = {};
S.st.supportPanels = {};
S.compute();
console.log('  面板锚定条目: ' + panelVisible.length + ' 个输入框，勾「' + panelPick.label
  + '」填 ' + who + '的' + pattr + ' → ' + Math.round(pBase) + ' → '
  + Math.round(p2.hit.total) + ' 伤害；清空退回 ' + Math.round(p3.hit.total));

// ④「一键填充」：它靠显示名反查角色 id，**查不到就静默什么都不做** ——
//   那正是最该被钉住的一种失败。所以直接拿全库的 panel.who 问一遍认不认得。
const unknownWho = [];
for (const e of S.CATALOG) {
  // @ 开头的是伪归属者（@equipped = 当前计算角色 / @energy = 能量上限），
  // 它们本来就不是角色名，反查不到是**应该**的。这里原来只放行 @equipped，
  // 加了 @energy 之后不改就会把「今日亦是和平的一日」「片刻，留在眼底」
  // 判成「归属者名反查不到」并**当场抛** —— 报的还是一个错的原因。
  if (!e.panel || e.panel.who.startsWith('@')) continue;
  if (S.charIdByName(e.panel.who) == null) unknownWho.push(e.id + ' → ' + e.panel.who);
}
if (unknownWho.length) {
  throw new Error('有 ' + unknownWho.length + ' 条面板锚定条目的归属者名反查不到角色 id，'
    + '「一键填充」会静默失效：' + unknownWho.slice(0, 3).join(' / '));
}
// 反向也要有内容：一条都问不到的话上面那句是空集恒真
if (!S.CATALOG.some((e) => e.panel && !e.panel.who.startsWith('@'))) {
  throw new Error('目录里没有可反查的面板归属者，上一条是空集恒真');
}
// 而且「一键填充」真的填得进东西（不是认得出名字却给不出面板）
if (S.fillSupportPanel(who) !== true) throw new Error('一键填充对 ' + who + ' 失败了');
if (S.st.supportPanels[who] == null || S.st.supportPanels[who][pattr] == null) {
  throw new Error('一键填充跑完了，' + who + '的' + pattr + '还是空的');
}
S.st.supportPanels = {};
S.compute();

// 每个角色、每个技能都过一遍界面构造路径 —— 抓「某角色一选就抛」这类事
let n = 0, failed = [];
for (const c of S.DATA.characters) {
  S.st.characterId = c.id; S.st.abilityId = null; S.st.eidolon = 0;
  S.st.picks.ids = {}; S.st.selfPicks = {}; S.syncSelfPicks();
  try { S.compute(); n++; } catch (e) { failed.push(c.name + ': ' + e.message); }
}
console.log('  全角色遍历: ' + n + '/' + S.DATA.characters.length + ' 算通'
  + (failed.length ? '，失败: ' + failed.slice(0, 3).join(' | ') : ''));
if (failed.length) process.exit(2);

// ---------------------------------------------------------------------------
// 光锥下拉框的命途过滤（默认开）
// ---------------------------------------------------------------------------
// ★ 为什么这一段要问 S.lcList 而不是数渲染出来的 <option> ★
//   命途过滤的结果**只体现在 <option> 里**，而这个 DOM 桩不解析 HTML
//   （querySelectorAll: () => []），从渲染结果那侧一条都数不出来。
//   不问 lcList 的话这条规则是**零覆盖**：把过滤删掉（return LCS;）
//   或者把默认改成 false，整套自检照样全绿。
//
// ⚠ 在整个文件同一个模板字符串里：不许反引号、不许花括号插值。
{
  const LCS = S.LCS;
  const chars = S.DATA.characters;
  if (LCS.length !== S.DATA.lightcones.length) {
    throw new Error('S.LCS 与 DATA.lightcones 条数不一致：' + LCS.length + ' vs '
      + S.DATA.lightcones.length);
  }
  // 命途是**精确字符串比对**（两边同一套九个取值）。哪天某把光锥的 path 写成
  // 了别的字（多了空格、繁简混用），过滤会把它整个藏起来 —— 而界面上的表现是
  // 「这把光锥不存在」，不报错。所以先把「每把光锥的 path 都有人用」钉住。
  const charPaths = {};
  for (const c of chars) if (c.path) charPaths[c.path] = true;
  const orphanPath = LCS.filter((l) => !charPaths[l.path]);
  if (orphanPath.length) {
    throw new Error('有 ' + orphanPath.length + ' 把光锥的命途不在角色的命途集合里，'
      + '命途过滤会把它们永远藏起来：' + orphanPath.slice(0, 3).map((l) => l.id + ':' + l.path).join(' | '));
  }

  if (S.st.lcPathOnly !== true) {
    throw new Error('「只看本命途」的默认值不是 true（实际 ' + S.st.lcPathOnly + '）——'
      + '用户一选角色就得在 169 行里找十几把有效的');
  }

  // 挑一个有光锥的角色来验。必须挑到**命途内和命途外都有光锥**的那种，
  // 否则下面的「折叠掉了」和「本命途全在」会退化成同一条恒真式。
  const probe = chars.find((c) => c.path
    && LCS.some((l) => l.path === c.path) && LCS.some((l) => l.path !== c.path));
  if (!probe) throw new Error('找不出「命途内外都有光锥」的角色，这一段等于没跑');
  const mine = LCS.filter((l) => l.path === probe.path);
  const other = LCS.find((l) => l.path !== probe.path);

  S.st.characterId = probe.id;
  S.st.lightconeId = null;
  const filtered = S.lcList().map((l) => l.id);
  if (filtered.length !== mine.length || filtered.some((id) => !mine.some((l) => l.id === id))) {
    throw new Error('只看本命途时应当只剩 ' + mine.length + ' 把（' + probe.path + '），实际 '
      + filtered.length + ' 把');
  }

  // ★ 当前装备的那把**永远在列表里** ★
  //   换角色时 lightconeId 不会清空。过滤掉它的话下拉框里没有任何一项是
  //   selected，浏览器会默认显示第一项 —— 界面显示着一把、st 里是另一把，
  //   而这种不一致**没有任何地方会报错**。
  S.st.lightconeId = other.id;
  const withEquipped = S.lcList().map((l) => l.id);
  if (withEquipped.indexOf(other.id) < 0) {
    throw new Error('当前装备的光锥 ' + other.id + '（命途 ' + other.path + '）被过滤掉了 ——'
      + '下拉框会显示第一项，而 st.lightconeId 是它');
  }
  if (withEquipped.length !== mine.length + 1) {
    throw new Error('当前装备的那把应当**恰好**多列出一条，实际 '
      + withEquipped.length + ' 条（本命途 ' + mine.length + '）');
  }

  // 关掉开关 → 必须回到全部 169 把（过滤真的只是过滤，不是把列表改小了）
  S.st.lcPathOnly = false;
  if (S.lcList().length !== LCS.length) {
    throw new Error('关掉「只看本命途」后应当列出全部 ' + LCS.length + ' 把，实际 '
      + S.lcList().length + ' 把');
  }
  S.st.lcPathOnly = true;
  S.st.lightconeId = null;
  console.log('  光锥命途过滤: ' + probe.path + ' ' + mine.length + ' 把 / 全部 ' + LCS.length + ' 把；'
    + '当前装备的命途不符那把仍旧列出');
  S.compute();
}

// ---------------------------------------------------------------------------
// 忆灵技：必须真的出现在技能下拉框里，而且真的算得出一个数
// ---------------------------------------------------------------------------
// ★ 这一段守的是用户报的第一个问题：「遐蝶的忆灵技没了」★
//   忆灵的技能**不在 character_skills 表里**，而在 characters.memosprite_json
//   的 skills 字典中。构建期只读前者的话，界面上的表现是**下拉框里少几条** ——
//   不抛错、不告警、不置灰。所以这里端到端地问界面本身：那条 <option> 在不在。
//
// 这一段故意放在「全角色遍历」**之后** —— 它会把面板的生命上限改掉，
// 放在前面会影响那一次遍历的前提。
//
// ⚠ 也在模板字符串里：不许反引号、不许花括号插值。所以这一段全是字符串拼接；
//   连数 option 都是按 '<option value="' 切串而不是用正则 —— 模板字符串会把
//   \\d 这类转义吃掉，写出来变成 d，而这条线索很难查。
{
  const SS = S.DATA.servantSkills || [];
  if (!SS.length) throw new Error('数据里一条忆灵技都没有 —— build_data 又漏读了 memosprite_json');
  const byChar = {};
  const sids = {};
  for (const s of SS) {
    (byChar[s.charId] = byChar[s.charId] || []).push(s);
    sids[s.id] = true;
  }

  // ① 每一条入表的忆灵技都要在它所属角色的技能下拉框里出现；
  //    顺便按下拉框里的标记数一遍「可算 / 显式标注算不了」。
  const missing = [];
  let svOk = 0, svBad = 0, svChars = 0;
  for (const c of S.DATA.characters) {
    if (!byChar[c.id]) continue;
    svChars++;
    S.st.characterId = c.id; S.st.abilityId = null; S.st.eidolon = 0;
    S.st.picks.ids = {}; S.st.selfPicks = {}; S.syncSelfPicks();
    S.compute();
    S.renderAll();
    const html = document.getElementById('sec-ability').innerHTML;
    for (const s of byChar[c.id]) {
      if (html.indexOf('value="' + s.id + '"') < 0) missing.push(c.name + '/' + s.id);
    }
    const parts = html.split('<option value="').slice(1);
    for (const p of parts) {
      const id = Number(p.slice(0, p.indexOf('"')));
      if (!sids[id]) continue;
      // 「（未收录倍率）」是状态非 ok 时界面上打的标记
      if (p.indexOf('（未收录倍率）') >= 0) svBad++; else svOk++;
    }
  }
  if (missing.length) {
    throw new Error('忆灵技没出现在技能下拉框里（共 ' + missing.length + ' 条）：'
      + missing.slice(0, 5).join(' '));
  }
  if (svOk + svBad !== SS.length) {
    throw new Error('下拉框里数出 ' + (svOk + svBad) + ' 条忆灵技，数据里有 ' + SS.length + ' 条');
  }
  if (!svOk || !svBad) {
    throw new Error('忆灵技全都可算或全都算不了（' + svOk + ' / ' + svBad + '）—— 分类失灵了');
  }

  // ② 「忆灵生命上限」这条折算链路，端到端走一遍。
  //    挑长夜月那条：它的基数是**忆灵生命上限**，要拿召唤者的局内生命上限
  //    乘系数才出得来。面板不填的话这一条根本算不了，所以先给个生命上限。
  //    ★ 断言分三层，缺一层都能被糊弄 ★
  //      徽标里出现「忆灵生命上限」= 基数认对了；
  //      说明里出现「50.0%」       = 系数取自那条天赋、且写出来给用户看了；
  //      伤害 > 0                  = 整条链真的接通了（不是只渲染了个标签）。
  S.st.characterId = 1413; S.st.abilityId = 1141301; S.st.eidolon = 0;
  S.st.picks.ids = {}; S.st.selfPicks = {}; S.syncSelfPicks();
  S.st.panel.hp = 6000;
  S.st.panel.atk = 2000;
  S.compute();
  S.renderAll();
  const h2 = document.getElementById('sec-ability').innerHTML;
  if (h2.indexOf('忆灵生命上限') < 0) {
    throw new Error('长夜月忆灵技的倍率徽标里没有「忆灵生命上限」');
  }
  if (h2.indexOf('50.0%') < 0) {
    throw new Error('忆灵生命上限的折算说明没渲染出来（界面上用户看不到这个数是怎么来的）');
  }
  const svHit = S.st.result?.hit?.total;
  if (!(svHit > 0)) throw new Error('忆灵技算不出伤害：' + svHit);
  // 反面对照：把生命上限抽掉，基座必须跟着塌 —— 否则上面那个数是别处兜来的
  S.st.panel.hp = null;
  S.compute();
  const zb = S.st.result?.hit?.zones?.base;
  if (zb && zb.level === 'known') {
    throw new Error('生命上限清空后忆灵技的基座还是 known —— 基数是兜来的，不是真算的');
  }
  S.st.panel.hp = 6000;
  S.compute();

  console.log('  忆灵技: ' + SS.length + ' 条入表（' + svChars + ' 个角色），其中 '
    + svOk + ' 条可算、' + svBad + ' 条显式标注算不了；长夜月一条端到端 '
    + Math.round(svHit) + ' 伤害');
}
// 十项审查修复的界面接线检查，运行的就是将交付给用户的模块包。
{
  function close(actual, expected, label) {
    if (!Number.isFinite(actual) || Math.abs(actual - expected) > 1e-7) {
      throw new Error('审查界面回归 ' + label + ': ' + actual + ' != ' + expected);
    }
  }
  const zeros = Object.fromEntries(['Physical', 'Fire', 'Ice', 'Thunder', 'Wind', 'Quantum', 'Imaginary'].map(e => [e, 0]));
  Object.assign(S.st, {
    characterId: 1003, abilityId: 100302, level: 80, lightconeId: null, eidolon: 0,
    skillLevels: {}, hitsOverride: {}, targetRole: 'primary', includeConditional: false,
    panel: { atk: 2000, hp: 4000, def: 1000, speed: 100, critRate: 0, critDmg: 0.5, elemDmg: { ...zeros } },
    selfPicks: {}, picks: { ids: {}, tab: 'ally_team', kind: '', q: '' },
    scenario: { mode: null, seasonId: null, floorId: null }, enemyIndex: 0,
    broken: false, critMode: 'expected', metricTeam: false, metricHp: false,
  });
  S.compute(); close(S.st.result.hit.base, 4000, '姬子主目标');
  S.renderAll();
  const role = document.getElementById('f-target-role');
  role.value = 'adjacent'; role.onchange();
  S.compute(); close(S.st.result.hit.base, 1600, '姬子相邻目标');
  S.st.targetRole = 'primary'; S.st.abilityId = 100301;
  S.compute(); const noElem = S.st.result.hit.total;
  S.st.panel.elemDmg.Fire = 1; S.compute();
  close(S.st.result.hit.total, noElem * 2, '面板元素增伤生效且不重复计行迹');
  S.st.panel.elemDmg.Fire = 0;
  S.st.picks.ids = { '1208.skill.120804.b2': true };
  S.compute(); close(S.st.result.hit.total, noElem, '符玄我方减伤不影响输出');
  if (!S.st.result.skipped.some(e => e.reason === '我方减伤仅影响生存')) throw new Error('审查界面回归：我方减伤未给出未计入原因');

  S.st.characterId = 1102; S.st.abilityId = 110204; S.st.picks.ids = {};
  S.st.selfPicks = { '1102.skill.110204.b3': true };
  S.renderAll();
  const slv = document.getElementById('f-slv'); slv.value = '1'; slv.oninput();
  close(S.catalogOpts().skillLevels[110204], 1, '技能等级输入传入增益目录');
  S.st.abilityId = 110201; S.compute();
  close(S.st.result.active.find(e => e.id === '1102.skill.110204.b3').value, 0.4, '希儿Lv1天赋');
  S.st.skillLevels[110204] = 10; S.compute();
  close(S.st.result.active.find(e => e.id === '1102.skill.110204.b3').value, 0.8, '希儿Lv10天赋');

  S.st.characterId = 1003; S.st.abilityId = 100301; S.st.selfPicks = {}; S.st.skillLevels = {};
  S.st.scenario = { mode: 'as', seasonId: 3001, floorId: '30011' }; S.st.metricTeam = true;
  const candidates = S.CATALOG.filter(e => e.target !== 'self' && e.ownerId && e.key === 'dmgBoost' && !e.panel);
  const firstBuff = candidates[0], secondBuff = candidates.find(e => e.ownerId !== firstBuff.ownerId);
  S.st.picks.ids = { [firstBuff.id]: true, [secondBuff.id]: true };
  for (const broken of [false, true]) {
    S.st.broken = broken; S.compute();
    close(S.st.result.agg.dmgReduction, 0.6, '当前半场只有一份60%减伤');
    close(S.st.result.agg.vuln, broken ? 1.25 : 0, '击破条件');
    const all = S.st.result.compare.rows.find(r => r.label === '全部已勾选');
    close(all.total, S.st.result.hit.total, '主伤害与全部已勾选一致');
  }
  S.st.enemyIndex = S.st.result.enemies.findIndex(e => e.side === 1 && e.slot === 'monster1');
  S.compute(); close(S.st.result.agg.dmgReduction, 0, '切换召唤物不继承首领减伤');
  S.st.enemyIndex = S.st.result.enemies.findIndex(e => e.side === 2 && e.slot === 'monster0');
  S.compute(); close(S.st.result.agg.dmgReduction, 0.6, '切换下半首领');
  console.log('  审查界面回归: 目标切换 / 元素面板 / 我方减伤 / 技能等级 / 情境条件 / 配队对比全部通过');
}
{
  // 切换工作区只改变展示，保留所有配置与上次结果。
  S.renderAll();
  const actorBefore = S.st.characterId, resultBefore = S.st.result;
  document.getElementById('nav-data').onclick();
  if (S.st.view !== 'data' || !document.getElementById('view-setup').hidden
      || document.getElementById('view-data').hidden) throw new Error('新版导航没有切换到数据工作区');
  if (actorBefore !== S.st.characterId || resultBefore !== S.st.result) throw new Error('新版导航改变了计算配置');
  document.getElementById('nav-battle').onclick();
  S.st.scenario = { mode:'as',seasonId:3001,floorId:null }; S.st.scenarioPicks = {};
  S.renderAll();
  const floor = document.getElementById('f-floor'); floor.value = '30011';
  floor.onchange({target:floor});
  const sceneHtml = document.getElementById('sec-scene-effects').innerHTML;
  if (sceneHtml.indexOf('data-scene=') < 0 || sceneHtml.indexOf('终结之刻') < 0) throw new Error('切换层后情境增益没有刷新');
  S.st.scenarioPicks['abyss.as.3001.30011.buff1.b0'] = true;
  S.st.abilityId = 100303; S.st.enemyIndex = 0; S.compute();
  if (!S.st.result.active.some(e=>e.id==='abyss.as.3001.30011.buff1.b0')) throw new Error('已选的情境增益没有进入主结果');
  if (document.getElementById('result').innerHTML.indexOf('class="bignum"') < 0) throw new Error('新版结果视图没有输出主要数值');
  console.log('  新版工作台: 导航保留配置 / 情境效果刷新与生效 / 结果视图全部通过');
}
`;
  const hf = path.join(ROOT, '_data_cache', '_bundle_harness.mjs');
  fs.writeFileSync(hf, harness, 'utf8');
  const run = spawnSync(process.execPath, [hf], { encoding: 'utf8', cwd: ROOT });
  fs.rmSync(hf, { force: true });
  if (run.status !== 0) {
    console.error('自检失败：\n' + (run.stdout || '') + String(run.error || run.stderr || '').slice(0, 3000));
    process.exit(1);
  }
  console.log(run.stdout.trimEnd());
}

// ---------------------------------------------------------------------------
// 4. 出成品
// ---------------------------------------------------------------------------
const tpl = fs.readFileSync(path.join(ROOT, 'ui', BATTLE?'battle-template.html':'template.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'ui', 'style.css'), 'utf8') + '\n' + fs.readFileSync(path.join(ROOT, 'ui', 'theme-light.css'), 'utf8');
const core = fs.readFileSync(path.join(ROOT, '_data_cache', 'hsr_core.json'), 'utf8');

const gz = zlib.gzipSync(Buffer.from(core, 'utf8'), { level: 9 });
const b64 = gz.toString('base64');
if (b64.includes('</script')) throw new Error('base64 里出现了 </script —— 不可能，但真出现会截断页面');

// 和 hsr_server.mjs 同款的「恰好一次」断言 —— 原因见那边的注释。
function inject(t, marker, payload, what) {
  const n = t.split(marker).length - 1;
  if (n !== 1) throw new Error(`模板里 ${what} 占位符 ${marker} 出现了 ${n} 次，应该恰好 1 次`);
  return t.replace(marker, () => payload);
}

let html = inject(tpl, '/*__CSS__*/', css, '样式');
html = inject(html, '<!--__DATA__-->',
  `<script id="hsr-data" type="application/gzip-base64">${b64}</script>`, '数据');
html = inject(html, '<!--__BOOT__-->', `<script>${bundle}
/* 数据是 gzip+base64 内嵌的 —— 双击打开是 file://，fetch 本地文件会被 CORS 拦，
   所以只能这么塞。DecompressionStream 是浏览器原生的，不需要任何依赖。 */
(async function boot() {
  try {
    const el = document.getElementById('hsr-data');
    const bin = Uint8Array.from(atob(el.textContent.trim()), (c) => c.charCodeAt(0));
    const stream = new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip'));
    window.__HSR_DATA__ = JSON.parse(await new Response(stream).text());
    window.__HSR_BOOT__();
  } catch (e) {
    document.body.innerHTML = '<div class="card" style="margin:20px">'
      + '<h2>数据解压失败</h2><div class="mono">' + String(e && e.message || e) + '</div>'
      + '<div class="faint">浏览器需要支持 DecompressionStream（Chrome 80+ / Edge 80+ / Firefox 113+）。</div></div>';
  }
})();</script>`);

fs.writeFileSync(OUT, html, 'utf8');
if(!BATTLE)fs.writeFileSync(path.join(ROOT,'崩铁伤害计算器_浅色.html'),html.replace('<html lang="zh-CN">','<html lang="zh-CN" data-default-theme="light" data-theme="light">'),'utf8');
fs.writeFileSync(path.join(ROOT,'模式选择.html'),inject(fs.readFileSync(path.join(ROOT,'ui','mode-template.html'),'utf8'),'/*__CSS__*/',css,'样式'),'utf8');

const mb = (n) => (n / 1024 / 1024).toFixed(2) + ' MB';
console.log(`\n打包完成: ${OUT}`);
console.log(`  HTML 总计  ${mb(Buffer.byteLength(html))}`);
console.log(`    ├ 数据    ${mb(core.length)} → gzip ${mb(gz.length)} → base64 ${mb(b64.length)}`);
console.log(`    ├ 代码    ${mb(Buffer.byteLength(bundle))}（${order.length} 个模块）`);
console.log(`    └ 样式+骨架 ${mb(Buffer.byteLength(css) + 900)}`);
console.log('\n双击它就能用 —— 没有服务器、没有依赖、没有构建。');
function battleHarness(){return `
import fs from 'node:fs';
const nodes=new Map();function node(id){if(!nodes.has(id))nodes.set(id,{id,innerHTML:'',value:'',textContent:'',style:{},dataset:{},querySelectorAll:()=>[],querySelector:()=>node('_selector'),setAttribute:()=>{},contains:()=>false});return nodes.get(id);}
globalThis.document={getElementById:node,addEventListener:()=>{},documentElement:node('root')};globalThis.window=globalThis;
globalThis.__HSR_DATA__=JSON.parse(fs.readFileSync(${JSON.stringify(path.join(ROOT,'_data_cache','hsr_core.json'))},'utf8'));
await import(${JSON.stringify('file:///'+TMP_BUNDLE.replace(/\\/g,'/'))});window.__HSR_BOOT__();
const S=window.__HSR_BATTLE__;if(!S||S.state.config.units.filter(u=>u.side==='ally').length!==4)throw new Error('独立战斗入口不是四人队伍');
node('sim-run').onclick();if(S.state.error)throw new Error(S.state.error);if(!(S.state.result.damage>0))throw new Error('四人输出为空');
if(!node('battle-runtime').innerHTML.includes('sim-contributions'))throw new Error('缺少各队员贡献统计');
if(window.__HSR)throw new Error('独立战斗入口意外启动单次伤害计算器');
console.log('  独立四人战斗：启动 / 四人行动 / 全队伤害 / 独立贡献统计通过');
`;}
