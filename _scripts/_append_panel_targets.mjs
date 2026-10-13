// 补录：把 10 条「面板锚定」子句的作用对象写进 annotations/buffs.jsonl。
//
// ★ 已经跑过了（2026-09），这 10 条现在就在 buffs.jsonl 里 ★
//   留着这个文件是因为 `buffs.jsonl` 有可能被 `review_buffs.mjs` 整份重生成 ——
//   那时候这 10 条得能重新补回来（`note` 里的理由也一并回来）。
//   重跑不会重复写：下面会先查一遍 id 在不在，在就整条退出（见 `already`）。
//
// ★ 为什么要人工写，而不是让分类器再宽一点 ★
//   这 10 条的**数值**分类器全推出来了（基数 / 结果键 / 吃谁的 / 百分比 / 平值），
//   差的**只有作用对象**。差的原因是紧邻的上一条子句把作用对象兜给了「来源归属者」
//   （`targetSource: 'source_owner'`）—— 而那半句根本不是自足句，它描述的是
//   【蒙福者】/【军功】/【同袍】/【求生反应】这类**状态或指定的别人**。
//   示例：星期日终结技紧随「【蒙福者】的暴击伤害提高」，兜成 self 的话，
//   这条**给指定我方单体**的增益就只在「算星期日本人」时才生效 —— 数字偏小、不报错。
//
//   让规则去猜也行，但猜错的代价是「算到错的人头上」且看不出来。
//   走人工表是既有的通路（阮•梅 / 翡翠 / 「使目标」那 7 条都走的这条），
//   而且漏在 TARGET_UNKNOWN 桶里**看得见、数得出来**。
//
// ★ 脚本生成而不是手抄 text ★
//   `text` 必须与语料**逐字节相等**（verify 拿它当闸门）。手抄一个字就整条变孤儿，
//   而孤儿的报错长得像「规则改了」。所以这里从语料现取。
//
// 用法：node _scripts/_append_panel_targets.mjs         只打印，不写
//       node _scripts/_append_panel_targets.mjs --write 追加到 buffs.jsonl
import fs from 'node:fs';
import path from 'node:path';
import { buffClauseParts } from '../core/clauses.mjs';
import { catalogSources } from './build_catalog.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const core = JSON.parse(fs.readFileSync(path.join(ROOT, '_data_cache', 'hsr_core.json'), 'utf8'));

// id → { target, note }
const SPEC = [
  ['1313.skill.131303.b3', 'single_ally',
    '作用对象取自前文 b1「并使目标及其召唤物成为【蒙福者】」+ b0「为指定我方单体角色恢复…#1[f1]%能量上限的能量」——原文写明了是**指定我方单体**。分类器把紧邻的 b2「【蒙福者】的暴击伤害提高」兜成了 self（整句没点名任何人），那是错的：【蒙福者】是一个指定的队友，不是星期日自己。'],
  ['1412.skill.141204.b1', 'single_ally',
    '【军功】由战技 141202 施加给「指定我方单体角色」（见该技能原文），所以「持有【军功】的角色攻击力提高」里的受益者是那个队友，不是刻律德菈自己。紧邻的 b0 整句没点名任何人，分类器兜成 self。'],
  ['1321.trace.1321101.b2', 'team',
    '作用对象取自紧邻的 b1「使**其他角色**的击破特攻提高」——V1 没有「除自身以外的队友」这个取值，按「我方全体」归页签。注意 side 仍是 ally，数值进的是队伍侧的击破特攻。'],
  ['1414.trace.1414101.b2', 'single_ally',
    '作用对象取自紧邻的 b1「使成为【同袍】的目标攻击力提高」——【同袍】是丹恒•腾荒指定的**另一个**队友，不是他自己。分类器把没有主体的 b1 兜成了 self，那会把这条给队友的增益变成丹恒•腾荒的自拐。'],
  ['1110.rank.4.b2', 'single_ally',
    '作用对象取自紧邻的 b1「使**该目标**攻击力提高」——「该目标」是 b0「获得【求生反应】时」里那个被施加【求生反应】的我方单体。分类器对「该目标」这类指代词一律不判（判不出算给谁），这里由人补。'],
  ['1110.rank.6.b1', 'single_ally',
    '作用对象是【求生反应】的持有者（见 b0「【求生反应】的生命上限提高效果额外提高」），即被施加【求生反应】的那个我方单体。'],
  ['1205.rank.6.b2', 'self',
    '作用对象是刃自己：紧邻的 b1 说的是「**天赋触发追加攻击**造成的伤害额外提高」，那是刃自己的天赋伤害。★ 这条是 self 里**数值上真要命**的一条 —— 写成非 self 会让「算别人」时也算上刃的这条自拐。'],
  ['1306.rank.6.b1', 'single_ally',
    '作用对象是花火战技的受益者。b0「战技的暴击伤害提高效果额外提高」说的是**她那发给队友的暴伤增益**被加量，不是花火自己的暴伤；b3/b5「使战技的暴击伤害提高效果对持有【谜诡】的队友都会生效」进一步说明受益方是队友。'],
  ['8005.rank.4.b2', 'team',
    '作用对象取自紧邻的 b1「使除自身以外的队友击破特攻提高」。V1 没有「除自身以外的队友」这个取值，按「我方全体」归页签。'],
  ['8006.rank.4.b2', 'team',
    '同 8005（星穹／星穹两个开拓者变体共用同一段星魂描述，代码里是两条独立来源，两条都要补）。'],
];

// id → { source, text }，从语料现取，保证 text 逐字节相等
const want = new Map(SPEC.map(([id]) => [id, null]));
for (const s of catalogSources(core)) {
  buffClauseParts(s.text).forEach((part, ordinal) => {
    const id = s.source.kind === 'skill' ? `${s.ownerId}.skill.${s.source.skillId}.b${ordinal}`
      : s.source.kind === 'trace' ? `${s.ownerId}.trace.${s.source.pointId}.b${ordinal}`
        : s.source.kind === 'eidolon' ? `${s.ownerId}.rank.${s.source.rankId}.b${ordinal}`
          : s.source.kind === 'lightcone' ? `lc.${s.source.lcId}.b${ordinal}`
            : `relic.${s.source.setId}.set${s.source.piece}.b${ordinal}`;
    if (want.has(id) && want.get(id) === null) {
      want.set(id, { source: s.source, text: part.trim(), owner: s.owner, label: s.label });
    }
  });
}

// ★ 已经补过的 id 要拦下来 ★ 这个脚本写的是**追加**，跑第二遍就是 10 条重复行 ——
//   而重复不会让 verify 红（按 id 建 Map，后来的覆盖前面的），只会让表悄悄变脏。
const BUFFS = path.join(ROOT, 'annotations', 'buffs.jsonl');
const already = new Set(fs.readFileSync(BUFFS, 'utf8')
  .split('\n').filter(Boolean)
  .map((l) => { try { return JSON.parse(l).id; } catch { return null; } })
  .filter(Boolean));
const dup = SPEC.map(([id]) => id).filter((id) => already.has(id));
if (dup.length) {
  console.error(`✗ 这 ${dup.length} 条已经在 annotations/buffs.jsonl 里了，不重复追加：\n   ${dup.join('\n   ')}`);
  console.error('  （如果只想看看它们长什么样，把 --write 去掉；要重新补请先从表里删掉这几行。）');
  process.exit(1);
}

const missing = [...want].filter(([, v]) => v === null).map(([k]) => k);
if (missing.length) {
  console.error(`✗ 这些 id 在语料里没找到，补录中止（一个都不写）：\n   ${missing.join('\n   ')}`);
  process.exit(1);
}

const lines = SPEC.map(([id, target, note]) => {
  const w = want.get(id);
  return JSON.stringify({
    id,
    source: w.source,
    text: w.text,
    effect: { target },
    direction: 1,
    condition: null,
    provenance: 'known',
    note,
  });
});

for (const [i, l] of lines.entries()) {
  const [id] = SPEC[i];
  console.log(`${id}   ${want.get(id).owner} · ${want.get(id).label}`);
  console.log(`   text   ${want.get(id).text}`);
  console.log(`   target ${JSON.parse(l).effect.target}`);
}

if (process.argv.includes('--write')) {
  const file = path.join(ROOT, 'annotations', 'buffs.jsonl');
  const cur = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, (cur.endsWith('\n') ? cur : cur + '\n') + lines.join('\n') + '\n');
  console.log(`\n✓ 已追加 ${lines.length} 条到 annotations/buffs.jsonl`);
} else {
  console.log(`\n（只打印，未写盘。加 --write 追加 ${lines.length} 条）`);
}
