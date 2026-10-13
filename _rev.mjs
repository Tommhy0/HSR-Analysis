// 反证跑批：故意把每个机制改坏，确认对应的断言**真的会变红**。
// 没做过反证的断言不算数 —— 本项目已经吃过一次「断言恒真」的教训。
//
// 用法: node _rev.mjs            # 依次跑全部反证
//       node _rev.mjs <id>       # 只跑一个
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const MUT = [
  {
    id: 'R1-倍率改动归属',
    file: 'core/attr.mjs',
    from: `    if (MULTIPLIER_KEYS.has(r.key)) {
      target = 'self';
      targetSource = 'ability_owner';
      side = 'ally';
      sideSource = 'ability_owner';
    }`,
    to: `    if (MULTIPLIER_KEYS.has(r.key) && target == null) {
      target = 'self';
      targetSource = 'ability_owner';
    }`,
    expect: ['倍率改动一律归「技能拥有者自己」', '含「对敌方目标」的倍率改动'],
  },
  {
    id: 'R2-加算被当成乘算',
    file: 'core/damage.mjs',
    from: `  if (mod.add) m += mod.add;`,
    to: `  if (mod.add) m *= (1 + mod.add);`,
    // 只断言「加算那条」变红就够了。
    // 「三种写法给出三个不同结果」**故意不列进来** —— 它拦的是「把三种写法合成一个键」，
    // 而这里只是把加算改成了乘算，三个数依然互不相同（2.2 / 1.2 / 1.5），
    // 它不该红。列进来会得到一个永远修不掉的假红。
    expect: ['加算：倍率 3.0 +1.2'],
  },
  {
    id: 'R3-不挑技能全加上',
    file: 'core/damage.mjs',
    from: `  const mod = mergeMultMod(multMods[ability?.type], multMods.all);`,
    to: `  const mod = mergeMultMod(Object.values(multMods).reduce(mergeMultMod, null), multMods.all);`,
    expect: ['同一改动算普攻时不生效'],
  },
  {
    id: 'R4-静默吞掉未计入',
    file: 'core/damage.mjs',
    from: `    if (hasMultMod(m)) multNotApplied.push({ abilityKind: k, mod: m });`,
    to: `    if (false) multNotApplied.push({ abilityKind: k, mod: m });`,
    expect: ['没算上的倍率改动出现在「未计入」清单里'],
  },
  {
    // 把 MULT 分支整个拆掉 —— 键既没进 multiplier，也没被算进任何乘区。
    // 这一条守的是「目录里的条目真的会进公式」：接线断了必须报红，不许静默变 0。
    id: 'R5-倍率分支整个失效',
    file: 'core/buffs.mjs',
    edits: [{ from: `    } else if (MULT_KEYS.includes(k)) {`, to: `    } else if (false) {` }],
    expect: ['倍率键落进了 agg.multiplier'],
  },
  {
    // 去掉「指向别处」的守卫 —— 于是「使其攻击力提高」「该目标的暴击伤害提高」
    // 这类**说的是技能打谁**的子句会被兜成「来源归属者」，也就是当成自己的增益。
    // 兜出 268 → 285 条，界面照常显示，算出来的伤害平白多一截。
    id: 'R7-兜底越界（把「使其…」当成自拐）',
    file: 'core/attr.mjs',
    edits: [{ from: `  if (side === 'ally' && !/该目标|此目标|其受到|使其|使目标|那个目标/.test(t)) {`,
              to: `  if (side === 'ally') {` }],
    expect: ['含「使其/该目标」的子句没有被兜成「来源归属者」'],
  },
  {
    // 把方向判断从「必须是 ally」放宽成「只要不是 enemy」——
    // mixed / 判不出侧别的那些会一起被兜成自己的增益。这是**方向性错误**，
    // 比漏收严重：一个敌方减益会被当成正的增益加上去。
    //
    // ★ 期望指向**合成的单测**，不是语料级那条 ★
    //   实测过：语料级那条（「兜出来的全是 ally」）放宽守卫后**一条都不红** ——
    //   因为全库没有一个 side 为 mixed/null 的子句能走到那一行。
    //   真正能红的是「deriveTarget(side=mixed) 必须保持判不出」那条单测，
    //   它不依赖语料里恰好有没有这种句子。
    id: 'R8-兜底不看方向',
    file: 'core/attr.mjs',
    edits: [{ from: `  if (side === 'ally' && !/该目标|此目标|其受到|使其|使目标|那个目标/.test(t)) {`,
              to: `  if (side !== 'enemy' && !/该目标|此目标|其受到|使其|使目标|那个目标/.test(t)) {` }],
    expect: ['deriveTarget(side=mixed)', 'deriveTarget(side=null)'],
  },
  {
    // 退回老写法：只认正则捕获到的**最后一个**技能类型。
    // 于是「普攻和战技造成的伤害提高」只记 BPSkill，普攻那一半静默消失。
    id: 'R9-多技能类型只记最后一个',
    file: 'core/attr.mjs',
    edits: [{ from: `      const types = [];
      for (const [re, kind] of ABILITY_WORDS) {
        if (re.test(text) && !types.includes(kind)) types.push(kind);
      }`,
              to: `      const types = [];
      if (mm[1] && ABILITY_CN[mm[1]]) types.push(ABILITY_CN[mm[1]]);` }],
    expect: ['同时提到多个技能类型的子句，每个类型都记上了'],
  },
  {
    // 退回老写法：damage.mjs 不读 agg.abilityDmg.all。
    // 于是「不限定技能类型的增伤」永远算 0 —— 条目进得来、界面显示得出来，不影响伤害。
    id: 'R10-不限定类型的增伤不生效',
    file: 'core/damage.mjs',
    edits: [{ from: `    ? (agg?.abilityDmg?.[ability.type] ?? 0) + (agg?.abilityDmg?.all ?? 0)`,
              to: `    ? (agg?.abilityDmg?.[ability.type] ?? 0)` }],
    expect: ['不限定技能类型（all）的增伤会被读到并生效'],
  },
  {
    // ★ 这一条才是「倍率被记成增伤」的真实坏法 ★
    //   把 /倍率提高/ 那条规则的 key 写成 dmgBoost —— 看起来完全是个手滑，
    //   改完不报错、目录照样有 31 条、伤害照样变大，只是大的那个数不对。
    id: 'R6-倍率被记成增伤键',
    file: 'core/attr.mjs',
    edits: [{ from: `  { re: /倍率提高/, key: 'multiplierAdd', subj: 'ally' },`,
              to: `  { re: /倍率提高/, key: 'dmgBoost', subj: 'ally' },` }],
    // 只列「记账键」那条。数数那条（31）**故意不列** —— multRows 是按文本里的
    // 「倍率」二字筛的，不是按键名筛的，所以把键换成 dmgBoost 它照样是 31，
    // 红不了。列进来就是个永远修不掉的假红。
    expect: ['含「倍率」的子句没有被记成增伤键'],
  },

  // ==========================================================================
  // 第 10 节（增益目录的运行期）的反证
  // ==========================================================================
  {
    // 目录 id 生成坏掉 —— id 全一样，条目之间互相覆盖，界面上「勾一条」
    // 等于勾了一堆，而且**没有任何报错**。这是最阴的一种。
    id: 'R11-目录 id 不唯一',
    file: '_scripts/build_catalog.mjs',
    edits: [{ from: `    case 'skill': return \`\${ref.charId}.skill.\${ref.skillId}.b\${ordinal}\`;`,
              to: `    case 'skill': return 'dup';` }],
    // ★ 断言在**现场重烘**那一份上，不在烘焙好的那一份上 ★
    //   烘焙进数据块的那份是在改坏之前烘的，id 当然还是唯一的 ——
    //   「目录 id 唯一」那条查的正是它，所以这条坏法它红不了。
    //   真正抓住这个坏法的是「烘焙 vs 现场重烘一致」：id 撞车会让两份对不上。
    //   这也说明了那条一致性断言为什么必要：构建期的坏法**只有它测得到**。
    expect: ['烘焙的目录与现场重烘的一致'],
  },
  {
    // 取不到值的分支坏掉：trace 一路永远返回 null。
    // 表现是「这条行迹增益界面上是空的」，看着像本来就没数值 —— 必须报红。
    id: 'R12-取值分支坏掉却不说原因',
    file: 'core/catalog.mjs',
    edits: [{ from: `    case 'trace':
      return resolveParam(ctx, { kind: 'trace', charId: ref.charId, pointId: ref.pointId, index });`,
              to: `    case 'trace':
      return null;` }],
    expect: ['满星魂档下没有「取不到又给不出原因」的条目',
      '遗器只给 2 件时，取不到的条目也全都带得出原因'],
  },
  {
    // 锁着的条目照样取到值 —— 「取不到」这条通路整个失效。
    //
    // ★ 锚点仍是 `catalogValue` 的守卫，但被卡的对象换过了 ★
    //   在星魂全解锁之前，这里卡的是「星魂 6 在基础档下取不到值」。
    //   解锁之后星魂不再是锁定来源，所以断言改跑 `pieces=2` 卡 4 件套
    //   （`blockedReason` 现在唯一还活着的通路）。锚点没动，靶子换了。
    id: 'R13-锁着的条目也能取值',
    file: 'core/catalog.mjs',
    edits: [{ from: `  if (blockedReason(entry, opts)) return null;`,
              to: `  if (false) return null;` }],
    // ★ 只列「锁着取不到值」这一条 ★
    //   本来还想列「取不到都要有原因」和「满星魂档确实变大」，但两条都**红不了**：
    //   前者说的是「null 必须配理由」，这个坏法干脆消灭了 null；
    //   后者靠技能条目的等级差就成立（遗器一栏坏掉不影响它）。
    //   列进去就是两个永远修不掉的假红。
    expect: ['锁着的条目取不到值（不是算成 0）'],
  },
  {
    // 星魂档位恒为 0：R3/R5 的「技能等级 +2/+1」没生效。
    // 「满星魂档 ≥ 基础档」这一条**照样绿**（全相等）—— 这正是它必须配一条
    // 「确实有条目变大」的原因，单写单调性等于在描述一个恒等式。
    //
    // ★ 锚点没动，但语义收窄了 ★
    //   `eidolonOf` 现在**只管技能等级**了（星魂条目解锁后不再问它），
    //   所以这条反证钉的是「技能等级随档位抬升」这半件事。
    //   原先还列了「满星魂档下同一条可选且有值」—— 那条断言已随解锁删除，
    //   列着会变成永远修不掉的假红。
    id: 'R14-星魂档位恒为 0',
    file: 'core/catalog.mjs',
    edits: [{ from: `  return o.tier === 'max' ? 6 : 0;`, to: `  return 0;` }],
    expect: ['满星魂档确实有条目变大'],
  },
  {
    // 把星魂门槛加回去：R2 的增益在「基础档」下又变成不可勾。
    // 这是**用户明确要求删掉的行为**，必须有人守着它不再长回来。
    id: 'R27-星魂门槛长回来',
    file: 'core/catalog.mjs',
    edits: [{ from: `  if (entry.kind === 'relicset' && ref.piece > o.pieces) return \`piece_short:\${ref.piece}\`;`,
              to: `  if (entry.kind === 'eidolon' && ref.rankId > eidolonOf(opts, ref.charId)) return 'rank_locked';
  if (entry.kind === 'relicset' && ref.piece > o.pieces) return \`piece_short:\${ref.piece}\`;` }],
    // ★ 断到「全部 N 条都可勾」那条，不能只断单条 ★
    //   分桶/取值都还有别的出口，光抽一条 r6 有可能正好绕开。
    // ★ 期望串**不含条数** ★ 原来写的是「全部 189 条…」，而星魂条目数会随
    //   数据与规则改动变（现在 210）—— 数字一过时，这条就报「期望变红的没红」，
    //   看起来像断言恒真，其实它红得好好的。`includes()` 截到「全部」即可。
    expect: ['条星魂在基础档（星魂 0）下都可勾选（星魂不再设门槛）',
      '全部星魂条目在基础档下都取得到值（「可勾但没数」和「锁着」一样没法用）',
      '星魂条目的取值在基础档/满星魂档下完全相同（它不看档位）'],
  },
  {
    // 分页签不看侧别：敌方的减益被塞进「我方」那一页。
    // 这是本项目最贵的错误方向 —— 用户照着「我方全体」勾，
    // 勾中的却是给敌人挂的减攻。
    id: 'R15-分页签不看侧别',
    file: 'core/catalog.mjs',
    edits: [{ from: `  if (entry.side === 'enemy') return 'enemy';
  if (entry.side !== 'ally') return null;
  if (entry.target === 'team') return 'ally_team';`,
              to: `  if (entry.target === 'team') return 'ally_team';` }],
    expect: ['页签「enemy」的条数与按 side/target 独立重数一致',
      '「敌方负面」页签非空，且里面没有 side 不是 enemy 的条目'],
  },
  {
    // 「自身」条目不做归属判断 —— 布洛妮娅给自己加的攻击力算到希儿头上。
    // 数字变大、不报错、看着还挺合理，是最容易被放过去的一种。
    id: 'R16-自身条目不看是谁',
    file: 'core/catalog.mjs',
    edits: [{ from: `    if (!isShared && e.target === 'self' && charId != null && e.ownerId !== charId) {`,
              to: `    if (false) {` }],
    expect: ['「自身」条目在算别人时不生效'],
  },
  {
    // 产出的 BuffInstance 字段名写歪 —— aggregate 会把它当未知键静静丢掉。
    // 界面上勾了、数值也显示了，伤害就是不动，且没有任何报错。
    id: 'R17-产出的键名对不上',
    file: 'core/catalog.mjs',
    edits: [{ from: `      id: e.id,
      key: e.key,`, to: `      id: e.id,
      key: 'notAKey',` }],
    expect: ['目录条目经 aggregate 后落在同名属性键上'],
  },
  {
    // 来源计数按条目数报 ——「已选来源 N/3」变成「勾了几条就是几」。
    id: 'R18-来源计数按条数报',
    file: 'core/catalog.mjs',
    edits: [{ from: `    if (e.ownerId != null) ids.add(e.ownerId);`,
              to: `    ids.add(e.id);` }],
    expect: ['勾 4 个不同角色的全部条目仍报 4（不是按条目数报）', '光锥/遗器不占「N/3」名额'],
  },
  {
    // 平值当成百分比渲染：「速度提高 12 点」显示成「+12.0%」。
    // 数值本身没错，错的是给人看的那个单位 —— 界面上就是这么骗人的。
    id: 'R19-平值当成百分比显示',
    file: 'core/catalog.mjs',
    edits: [{ from: `  const flat = entry.unit === 'flat' || /Flat$/.test(entry.key);`,
              to: `  const flat = false;` }],
    expect: ['平值显示不带百分号'],
  },
  {
    // 「仅显示」标记丢掉了：勾了速度/击破特攻，伤害不变，界面上也不说为什么。
    id: 'R20-丢掉仅显示标记',
    file: 'core/catalog.mjs',
    // 两处**都要**改坏：界面读 displayValueOf、计算读 BuffInstance，是两条路。
    // 只改一条的话另一条照样绿 —— 那正好说明两条断言都得留着。
    edits: [
      { from: `      displayOnly: isDisplayOnly(e),`, to: `      displayOnly: false,` },
      // 注意第二处的参数叫 `entry` 不叫 `e` —— 两个函数的形参名不同
      { from: `    displayOnly: isDisplayOnly(entry),`, to: `    displayOnly: false,` },
    ],
    expect: ['不影响伤害的键（速度/击破/效果命中）在显示层被标成「仅显示」',
      '产出的 BuffInstance 也带「仅显示」标记'],
  },
  {
    // 取值时顺手取了负 —— 符号归属性键管（`1 - defShred`），数值取了负就变成
    // 「减防 40%」反而让伤害变低。这条守的是全库的符号约定。
    id: 'R21-取值顺手取了负',
    file: 'core/ctx.mjs',
    edits: [{ from: `      return row?.param_list?.[ref.index - 1] ?? null;`,
              to: `      { const v = row?.param_list?.[ref.index - 1] ?? null; return v == null ? null : -v; }` }],
    expect: ['目录里的值都是有限的非负数'],
  },
  {
    // 少收整整一类来源（技能）。目录不会报错，只是**少了一大块** ——
    // 「本次伤害算不算技能增益」这件事就静默地少了一半。
    id: 'R22-少收一类来源',
    file: '_scripts/build_catalog.mjs',
    edits: [{ from: `  for (const sk of core.skills) {
    const ch = chById.get(sk.charId);
    if (!ch) continue;`,
              to: `  for (const sk of []) {
    const ch = chById.get(sk.charId);
    if (!ch) continue;` }],
    // 「目录规模 ≥ 700」这条**故意不列**：863 去掉技能类还剩 705，
    // 刚好压在阈值上面，红不了 —— 阈值定松了就是这个下场。
    // 真正抓住这个坏法的是「烘焙 vs 现场重烘一致」（少了一整类，两份必然对不上）。
    expect: ['烘焙的目录与现场重烘的一致', '重烘出的条目文本与烘焙的一致'],
  },

  // ==========================================================================
  // 防重复计数（自动路径 vs 目录路径）的反证
  // ==========================================================================
  {
    // 把「技能类跳过」去掉 —— 于是同一条技能增益既走自动路径又走目录，
    // **数值翻倍**，而且界面上完全看不出来：条目都勾着、伤害就是高了一截。
    id: 'R23-技能被两边各算一遍',
    file: 'core/buffs.mjs',
    edits: [{ from: `      if (src.kind === 'skill') continue;`, to: `      if (false) continue;` }],
    expect: ['自动路径一条技能增益都不收'],
  },
  {
    // 跳过条件写反了：非技能的也全跳过，自动路径变成一具空壳。
    // 「不抛错」和「技能没收」两条都照样绿 —— 只有那条合成标注测得出来。
    id: 'R24-自动路径整条被掐死',
    file: 'core/buffs.mjs',
    edits: [{ from: `      if (src.kind === 'skill') continue;`, to: `      continue;` }],
    expect: ['非技能来源（行迹/星魂/光锥/遗器）的标注仍然生效'],
  },
  {
    // 单位判定退回「只认明写的『点』」—— 于是 3 条裸数字（砂金•戏浪行迹、
    // 光锥 23036/23044 的「基础速度提高」）又挂回 speedPct，
    // 界面上 12 点速度显示成「+1200%」。数值没算错，标出来的数是错的。
    id: 'R25-单位只认明写的点',
    file: 'core/attr.mjs',
    // 这条只改**分类器**，而分类器只影响现场重烘 —— 烘焙的那份目录纹丝不动。
    // 所以两条断言里，单位那条要能红，前提是它把 `fresh` 也一起过一遍
    // （verify 10.5b 里是 `CATALOG.concat(fresh)`）。如果哪天有人图省事
    // 把它改回只查 CATALOG，这条反证会立刻掉成「没红」—— 好，那正是它该有的作用。
    edits: [{ from: `      if (!tail.endsWith('%')) unit = 'flat';`,
              to: `      if (!tail.endsWith('%') && text.startsWith('点', numTok.at + tail.length)) unit = 'flat';` }],
    expect: ['百分比键的句子里一定有 %', '重烘出的属性键与烘焙的一致'],
  },
  {
    // 把人工表挪回分桶**之后** —— 就是修之前那一版。
    // 修之前：`if (cls.bucket !== PICKABLE) return;` 挡在查人工表前面，于是
    // 「分类器判不出作用对象」的子句连人手写的那条记录一起消失，且毫无痕迹：
    // 记录还躺在 buffs.jsonl 里，界面上勾不到，也没有任何提示说它被吞了。
    // 真踩过两条：阮•梅「使除自身以外的队友速度提高」、翡翠「使其速度提高」。
    id: 'R26-人工表被分桶吃掉',
    file: '_scripts/build_catalog.mjs',
    edits: [{ from: '      if (h) {\n        stats.humanUsed++;',
              to: '      if (h && cls && cls.bucket === BUCKET.PICKABLE) {\n        stats.humanUsed++;' }],
    // ★ 必须断到「人工表全部在目录里」那条，不能只断 `humanUsed` ★
    //   `humanUsed` 是**烘焙的**计数 —— 改了代码不重烘，它照样是老数，
    //   只断它的话这条反证根本红不了。所以 verify 里那条比对查的是
    //   `CATALOG.concat(fresh)`（同一个坑 R25 踩过，见上面那条注释）。
    //
    // ★ 期望串**不含具体条数** ★ 标签里嵌了「57 条」这种会随表长大的数字，
    //   于是每次往 buffs.jsonl 里加标注，这条反证都要跟着改一次 ——
    //   而改它的动作看起来和「锚点过期」一模一样，很容易被顺手改成「反正就那样」。
    //   上面的 harness 用的是 `includes()`，所以截到数字**之前**就够准了。
    //   真踩过：表 50 → 57 之后这条报「期望变红的没红」，而其实红得好好的。
    expect: ['**全部**在【现场重烘】的目录里（人工记录不许被分桶吃掉）',
      '=== buffs.jsonl 条数('],
  },
  {
    // 把「使目标」从代词排除表里删掉 —— 就是修之前那一版。
    //
    // ★ 这一条守的是本项目**最危险**的坏法：静默错判 ★
    //   漏收是看得见的（条目不在界面上）；这个是 `target` 被兜成 `self`，
    //   也就是**把辅助的增益算到辅助自己头上**：停云终结技的 +50% 增伤
    //   会加在停云身上而不是输出者身上。数字变了、不报错、看着还挺合理。
    //
    // ★ 断的是**语料级**那条，不是目录级那条 ★
    //   人工表里这 7 条显式写了 `effect.target: 'single_ally'`，`target` 字段
    //   是人工表优先的 —— 所以哪怕分类器又兜回 self，**目录那一份仍然是对的**，
    //   「目录里 14 条『使目标』的 target 都与自己那一侧相符」照样绿。
    //   真正抓得住这个坏法的是那条直接问分类器的：遍历全部子句，
    //   看有没有哪条含「使目标」却被判成 self。
    //   我第一版就是只写了目录级那条 —— 反证时它纹丝不动，白写。
    id: 'R28-「使目标」被兜成自拐',
    file: 'core/attr.mjs',
    edits: [{ from: `  if (side === 'ally' && !/该目标|此目标|其受到|使其|使目标|那个目标/.test(t)) {`,
              to: `  if (side === 'ally' && !/该目标|此目标|其受到|使其|那个目标/.test(t)) {` }],
    expect: ['条含「使目标」的子句里，没有一条被兜成 target=self'],
  },
  {
    // 目录 id 的编法**错一位**（星魂的 ordinal 从 1 起）—— 一个纯粹的手滑。
    //
    // ★ 谁抓得住它：是**文本逐字比对**那条，不是「孤儿」那条 ★
    //   我原来以为抓到错位的是「id 全部能在语料里对应上（没有孤儿）」。**实测不是**：
    //   错位之后 `byId` 里仍然有 `…b1` 这个键 —— 只是它现在指向原本的 `b0`。
    //   也就是说「按 id 逐个查存在性」对「整体挪一位」这种坏法**天生是盲的**，
    //   每个 id 都查得到，只是查到的不是同一条子句。
    //   （这个盲点在老版本里更严重：那时 id 的 n 是「第几个匹配上的子句」，
    //     补一条 ATTR_RULES 就整体错位 —— verify 的注释里记着当年真有 2 条
    //     悄悄指到了别的句子上。所以后来才加了 `text 逐字相等` 这条闸门。）
    //   所以这条反证的期望指向 text 那条，并且**明确不列** orphan 那条 ——
    //   列了就是个永远修不掉的假红。
    id: 'R29-id 编法错一位',
    file: '_scripts/build_catalog.mjs',
    edits: [{ from: `    case 'eidolon': return \`\${ref.charId}.rank.\${ref.rankId}.b\${ordinal}\`;`,
              to: `    case 'eidolon': return \`\${ref.charId}.rank.\${ref.rankId}.b\${ordinal + 1}\`;` }],
    expect: ['条 id 与语料指向同一条子句（text 逐字相等）'],
  },
  {
    // 星魂这一路的取值整个返回 null —— 条目还在目录里、还勾得中，
    // 只是小字显示成「取不到数值」。这比「没收录」更像正常状态，
    // 用户会以为「这条本来就没数」而不会报告。
    //
    // ★ 这条专门给「人工标注全部取得到值」那个**全等**阈值做反证 ★
    //   它原来写的是 `reachable.length >= 48`（50 条里允许缺 2 条）。
    //   阈值松到那个程度，「丢了 2 条」根本不红 —— 也就是说那条断言当时
    //   对「星魂取值坏掉」是瞎的。现在改成 `=== human.length` 之后，
    //   丢 2 条就红，这条反证就是它非恒真的证据。
    //   顺带钉住旁边那条分流报错：「在目录里但取不到值」必须单独点出来。
    id: 'R30-星魂取值整路返回 null',
    file: 'core/catalog.mjs',
    edits: [{ from: `    case 'eidolon':
      return resolveParam(ctx, {
        kind: 'eidolon', charId: ref.charId, rankId: ref.rankId, index,
      });`,
              to: `    case 'eidolon':
      return null;` }],
    expect: ['**全部**在增益目录里取得到数值',
      '在目录里但取不到值'],
  },
  {
    // 「提高数值等同于<某人的面板>的#N%」这一家族的**豁免**被拿掉。
    //
    // ★ 反证的是「顺序」不是「这个分支在不在」★
    //   计划的验证清单原本写的是「去掉 NON_BUFF_RE 里的『等同于』」。**那个说法过时了**：
    //   实测的实现方式是「把面板检查**前置**在 `isNonBuffClause` 之前」，
    //   `NON_BUFF_RE` 一个字都没动 —— 也就是说，`attr.mjs` 里**只有一份**正则，
    //   顺序本身就是那条豁免。所以反证必须去改顺序，改正则改不出任何东西。
    //
    //   这里用 `&& !isNonBuffClause(t)` 表达「挪到它后面」：后面那个位置的语义
    //   恰好就是「先过 non-buff 闸门，过了才轮到面板检查」。多行块整体搬移
    //   在反证脚本里太脆（锚点动不动就过期），语义等价的单行改法更耐久。
    //
    // ★ 期望指向的是**重烘一致性**，不是「19 条」那条 ★
    //   这里是这个跑批的**能力边界**，写下来免得下次有人再困惑一遍：
    //   反证只改源码、**不重烘**，而 `verify` 第 10 节的 `CATALOG` 读的是
    //   `_data_cache/hsr_core.json`（烘焙产物）—— 所以「19 条」那条对源码改动
    //   **天生是盲的**，红的必然是「烘焙的目录与现场重烘的一致」。
    //   这是对的：那条断言本来就是「改了分类规则必须重烘」的闸门。
    //
    //   至于「19 条」本身有没有牙齿，用**一次性实测**钉过（不是靠这个跑批）：
    //   打上这个改动后 `buildCatalog(core, annotations.buffs)` 带 panel 的条目
    //   9 → 0，总条数 923 → 895。连人工表救回的那 10 条也一并丢掉 ——
    //   它们的面板信息取自分类器的 `hit`，分类器给不出 hit 就没有面板。
    //   19 → 0 显然会红的，只是要**重烘之后**才看得见。
    id: 'R32-面板锚定的「等同于」豁免被拿掉',
    file: 'core/attr.mjs',
    edits: [{ from: `  if (isPanelAnchored(t)) {`,
              to: `  if (isPanelAnchored(t) && !isNonBuffClause(t)) {` }],
    expect: ['烘焙的目录与现场重烘的一致'],
  },
  {
    // 面板没填时**兜成 0**，而不是返回 null。
    //
    // ★ 这是这一类里最像「正常」的坏法 ★
    //   条数对、字段对、归属者对、公式也对，只有「用户还没输入」这一个状态
    //   被伪装成了「这条增益就是 0」—— 界面上显示 `+0.0%`，勾了伤害纹丝不动，
    //   没有任何提示。用户只会觉得「这个辅助好像没什么用」。
    //   （兜成系数本身是另一种坏法，同一条断言也拦得住：
    //     值非 null 就不满足「取不到」。）
    id: 'R31-面板没填时兜成 0',
    file: 'core/catalog.mjs',
    edits: [{ from: `  if (!panel || panel[p.attr] == null) return null;`,
              to: `  if (!panel || panel[p.attr] == null) return 0;` }],
    expect: ['面板锚定条目一条都取不到值'],
  },
  {
    // 取值公式从「面板 × 系数」改成「面板 + 系数」—— 一个纯粹的运算符手滑。
    // 数值仍然是个有限的非负数、仍然随面板变化、仍然「有值」，
    // 所有**非关系型**的断言都对它瞎。只有把两条面板摆在一起比倍数才看得出。
    // ★ 这一条守的是**最容易被当成「反正也收进来了」而放行**的一类 ★
    //   阿格莱雅行迹「攻击力提高，提高数值等同于阿格莱雅速度的#1%+**衣匠**速度的#2%」
    //   长得和布洛妮娅战技一模一样，基数却混了一个**忆灵**的速度。
    //   把「衣匠」从排除词里删掉，它**立刻**以
    //   `{base: speed, who: 阿格莱雅, key: atkPct}` 的样子进目录（实测），
    //   数值看着完全正常 —— 只是那个 `#2` 该乘的是衣匠的速度，不是阿格莱雅的。
    //   少算一项，不报错，界面上没有任何痕迹。这是本项目最怕的那种错。
    id: 'R34-面板基数把忆灵也算进来',
    file: 'core/attr.mjs',
    edits: [{ from: `/之和|累计|消耗总量|原伤害|气氛值|衣匠/`,
              to: `/之和|累计|消耗总量|原伤害|气氛值/` }],
    expect: ['含「衣匠/削韧值/原伤害」这类不可用基数的'],
  },
  {
    id: 'R33-面板锚定公式的乘号写成加号',
    file: 'core/catalog.mjs',
    // ★ 锚点跟着源码换过一次 ★
    //   加入「最多计入 #N 点」的夹子之后，基数从 `panel[p.attr]` 变成了 `base`。
    //   锚点在这里过期是**静默**的：_rev 只会打一行「锚点出现 0 次」，
    //   很容易当成「这条本来就跑不了」跳过去 —— 实际是这条断言**从此没人反证**了。
    edits: [{ from: `  return base * pct + flat;`,
              to: `  return base + pct + flat;` }],
    expect: ['面板锚定条目的数值与面板项成正比'],
  },
  {
    // 忆灵生命上限的比例项取错下标 —— 拿第 1 项当比例。
    // 表现：忆灵技的伤害静默变成一个离谱的数（比例可能只有 0.3），
    // 而界面上**看不出任何异常**（照样是个百分数、照样算得出）。
    id: 'R34-忆灵生命上限比例取错参数项',
    file: 'core/abilities.mjs',
    edits: [{ from: `  const pct = params?.[hp.inherit - 1];`,
              to: `  const pct = params?.[0];` }],
    // ★ 期望里**故意没有**「desc 里写着 66%」那一条 ★
    //   原来有，反证时它没红 —— 因为 140204 的 desc 里另有一句
    //   「等同于阿格莱雅攻击力30%的雷属性附加伤害」，`params[0]` 恰好是 0.3，
    //   于是错的比例照样能在那段文字里找着。那条断言当时是恒真的，
    //   已经改成钉占位符（见 verify 7.7 的 near30）。
    expect: [
      '阿格莱雅/衣匠：忆灵生命上限 = 召唤者生命上限 × 66%',
      '长夜月/长夜：忆灵生命上限 = 召唤者生命上限 × 50%',
      '开拓者/迷迷：忆灵生命上限 = 召唤者生命上限 × 80%',
    ],
  },
  {
    // 把平值项整个抹掉 —— 阿格莱雅少 720、开拓者少 640。
    // ★ 这一条与 R34 是**两种不同的坏法** ★ R34 是「取错项」（比例不对），
    //   这一条是「项丢了」（`+720` 整个消失）。只测其中一个的话，
    //   `flat` 那条路（`hp.base` 为 null 时兜 0）永远没被验证过。
    id: 'R35-忆灵生命上限的平值项丢失',
    file: 'core/abilities.mjs',
    edits: [{ from: `  const flat = hp.base == null ? 0 : params?.[hp.base - 1];`,
              to: `  const flat = 0;` }],
    expect: [
      '阿格莱雅/衣匠：平值项 = 720',
      '开拓者/迷迷：平值项 = 640',
    ],
  },
  {
    // 去掉「算不了的基数必须拦下」这道守卫 —— 于是忆灵攻击力/本场累计
    // 会一路走到 damage.mjs 的 scalingValue，返回 null，被报成
    // 「面板未填」。而那个面板**用户根本填不了**（库里忆灵没有攻击力），
    // 文案会把人引到错的地方。技能还标着「可算」，实际一点就算不出。
    id: 'R36-忆灵攻击力基数没被拦下',
    file: 'core/abilities.mjs',
    edits: [{ from: `      if (bad) {`, to: `      if (false) {` }],
    expect: [
      '算不了的基数（忆灵攻击力/忆灵自身面板/本场累计）绝不出现在可算的技能里',
      '1402/1140201 被标成 unresolved（没有静默算 0）',
      '忆灵技里恰好 8 条可算（12 条入表 − 4 条算不了）',
    ],
  },
  {
    // 去掉「按全局技能 id 找 hp_skill」的兜底查找。
    // 守的是开拓者的 8008 变体：它有自己的 memosprite_json，但 hp_skill
    // 指向 800704，而那条技能挂在 8007 名下 —— 按角色找会落空，
    // 于是 8008 的忆灵生命上限静默算不出来。
    id: 'R37-忆灵生命上限按角色找技能（去掉全局兜底）',
    file: 'core/abilities.mjs',
    edits: [{ from: `    ?? ctx.skillById?.get(hp.skillId);`, to: `    ?? null;` }],
    expect: ['开拓者/迷迷（8008 变体，hp_skill 指向 8007 的技能） 的忆灵生命上限能算出来'],
  },
  {
    // 拿掉「面板待填」这条分支 —— 于是面板锚定条目在没填面板时
    // 会掉进最后那句「取不到数值」并被置灰。用户报的第二个问题
    // （「填了之后没反应」）修的就是这条路：待填 ⇒ 填了 ⇒ 数值，
    // 三态里少了中间那态，行内容就永远对不上。
    id: 'R38-面板待填状态丢失',
    file: 'core/catalog.mjs',
    edits: [{ from: `  const pending = d.panelPending === true;`,
              to: `  const pending = false;` }],
    // 「同一行的两种状态确实不同」那一条**故意不列进来** —— 反证时它没红：
    // pending 为假时正文变成 `待填「布洛妮娅」的暴击伤害`，和填了之后的
    // `+123.4%` 仍然不同，那条式子照样成立。它测的是「两态有别」，
    // 不是「待填这一态存在」，拦不住这个 bug。列进来会得到一条修不掉的假红。
    expect: [
      '没填面板：rowView 标了 pending',
      '没填面板：正文显示 ?（不是「取不到数值」那句）',
      '没填面板：标签里有「待填面板」',
      '没填面板：整行置灰（但 blocked 为假',
    ],
  },
  {
    // 把 hp_skill 的查找从「id 相等」改成「id 不等」—— 也就是**找错技能**。
    // 表现：忆灵生命上限的系数取的是别人技能参数表里的数，
    // 数值照样算得出、照样是个百分数，界面上一点异常都看不出来。
    // 守它的是 verify 7.7 里钉占位符那一组（near30）。
    //   ★ 这一条是从一次失败的尝试里长出来的 ★
    //     我先写的是 R39「找错所属技能」，期望 near30 变红 —— **红了 0 条**。
    //     查下来是两个原因：(a) verify 里的 near30 用 `ctx.skillById` 自己
    //     重查了一遍 owner，所以 abilities.mjs 里找错它根本看不见；
    //     (b) 随手挑的那条技能参数表不够长，`params[4]` 是 undefined，
    //     在更前面那一条「能算出来吗」就被拦下了，压根走不到 near30。
    //     (a) 说明 near30 守的是**烘焙进去的 hp_skill 字段与 desc 对不对得上**
    //     （build_data 的错），不是运行期查找的错；(b) 说明这个反证造不出来。
    //     于是换成下面这条 —— 它守的是**同一处代码里真正没有断言的另一半**：
    //     `baseOwnerOf` 那条「没写归谁就算忆灵」的规则。
    id: 'R39-忆灵基数一律当成召唤者的',
    file: '_scripts/extract_buffs.mjs',
    edits: [{ from: `  const iOwner = ownerName ? pre.lastIndexOf(ownerName) : -1;`,
              to: `  const iOwner = ownerName ? pre.lastIndexOf(ownerName) : -1;
  if (true) return 'owner';` }],
    expect: [
      '1141301「追忆，蹁跹，如雨」的基数是 servantHp',
      '1140201「刺纹之陷」的基数是 servantAtk',
      '忆灵技用到的基数恰好是 hp / servantHp / servantAtk 三种',
    ],
  },
  {
    // 去掉「召唤者生命上限没填就返回 null」那道守卫 —— 也就是**打包自检
    // 撞出来的那个真缺陷**。JS 里 `null * 0.5 === 0`，于是空面板下
    // 忆灵技的基座静默变成 0（或 +720 的平值），乘区却报 known。
    // 空面板是默认状态，用户一选忆灵技就撞上。
    id: 'R40-召唤者生命上限没填时兜成 0',
    file: 'core/damage.mjs',
    edits: [{ from: `      if (panel.hp == null) return null;
      return panel.hp * (f.pct ?? 0) + (f.flat ?? 0);`,
              to: `      return (panel.hp ?? 0) * (f.pct ?? 0) + (f.flat ?? 0);` }],
    expect: [
      '长夜月的忆灵技在空面板下不许报「已知」（生命上限是 null，不是 0）',
      '昔涟的忆灵技在空面板下不许报「已知」（生命上限是 null，不是 0）',
    ],
  },
  {
    // 把「根本不打伤害的技能」那条分支整个拆掉 —— 于是 126 条治疗/护盾/增益/减益
    // 重新掉回 `unresolved`，界面上又开始写着「未收录倍率，需要人工补录进
    // annotations/multipliers.jsonl」。那正是用户报的那个问题，也是这次改动的全部意义。
    //
    // ★ 这一条同时守住了「分支顺序」★
    //   新分支夹在 `auto?.breakTerms`（有意不算）与 `unresolved`（真缺口）之间。
    //   挪到 breakTerms 前面去的话，4 条击破技会被吸进 non-damage ——
    //   而那是**有意不算**，不是「不造成伤害」，两者在界面上说的不是一回事。
    //   击破技那半由 R42 单独守。
    id: 'R41-「不打伤害」分支被拆掉',
    file: 'core/abilities.mjs',
    edits: [{ from: `    } else if (!rawTerms.length && !manual && !DAMAGE_TAGS.has(sk.tag)) {`,
              to: `    } else if (false) {` }],
    expect: [
      '126 条技能被标成 non-damage',
      '真缺口只剩 25 条 unresolved',
    ],
  },
  {
    // 把「击破伤害」那条分支拆掉 —— 4 条击破技从「有意不算」掉进别的状态。
    // 守的是**分支顺序**：新加的 non-damage 分支必须夹在它**后面**。
    id: 'R42-「击破伤害」分支被拆掉',
    file: 'core/abilities.mjs',
    edits: [{ from: `    if (!rawTerms.length && auto?.breakTerms) {`,
              to: `    if (false) {` }],
    // ★ 该红的第二条不是「unresolved 变多」，是「non-damage 变多」★
    //   实测：这 4 条击破技的 tag **本来就不是伤害标签**，它们能待在对的桶里
    //   完全靠 breakTerms 那条分支**排在前面**。拆掉它，它们就直接掉进
    //   non-damage —— 界面上从「有意不算（击破伤害）」变成「不造成伤害」，
    //   而后者是错的：击破伤害是真伤害，只是 v1 不算。
    expect: [
      '击破技仍是 4 条 out-of-scope',
      '126 条技能被标成 non-damage',
    ],
  },
  {
    // 忆灵辅助技的取值路径**整条**拆掉（`skillByCharSkill` 与 `skillById` 两级）。
    // 它们不在 `skillsByChar` 里，靠的就是这两级兜底。
    // 取不到值的表现是条目**显示为空**，不报错 —— 很容易被当成「这条本来就没数值」。
    id: 'R43-忆灵辅助技取不到参数',
    file: 'core/ctx.mjs',
    edits: [{ from: `        ?? ctx.skillByCharSkill?.get(\`\${ref.charId}.\${ref.skillId}\`)
        ?? ctx.skillById?.get(ref.skillId);`,
              to: `        ;` }],
    expect: ['25 条忆灵辅助技条目**每条都取得到值**'],
  },
  {
    // 把忆灵辅助技也并进 `skillsByChar` —— 技能下拉框于是从 7 条撑成 24 条，
    // 其中 17 条写着「未收录倍率」，而它们**根本没有倍率这回事**。
    // 这就是用户报的「昔涟少技能而且有这种问题」的另一半成因。
    id: 'R44-忆灵辅助技漏进技能表',
    file: 'core/ctx.mjs',
    edits: [{ from: `    skillsByChar: groupBy([...data.skills, ...(data.servantSkills ?? [])], (s) => s.charId),`,
              to: `    skillsByChar: groupBy([...data.skills, ...(data.servantSkills ?? []), ...(data.servantSupport ?? [])], (s) => s.charId),` }],
    expect: ['辅助忆灵技没有漏进 ctx.skillsByChar'],
  },
  {
    // 目录不再遍历忆灵辅助技 —— 39 条辅助忆灵技整批退出增益目录，
    // 昔涟德谬歌那 12 首能自动收录的诗一条都进不来，用户报的「少技能」原样回来。
    id: 'R45-忆灵辅助技不再进增益目录',
    file: '_scripts/build_catalog.mjs',
    edits: [{ from: `  for (const sk of core.servantSupport ?? []) {`,
              to: `  for (const sk of []) {` }],
    // ★ 「六类来源都有条目」**故意不列进来** ★
    //   它读的是第 10 节的 `CATALOG`＝烘焙产物 `_data_cache/hsr_core.json`，
    //   而反证只改源码、**不重烘**（见 R32 那段说明）。所以那一条对源码改动
    //   天生是盲的，列进来会得到一条永远修不掉的假红。
    //   真正会红的必然是「现烘现比」的那两条。
    expect: [
      '含数值子句 3302 条',
      '增益目录 968 条',
    ],
  },
  {
    // ★ 唯一一条打向 ui/app.mjs 的反证，跑的是打包自检（`cmd: 'hsr_build'`）★
    //   verify 碰不到界面层：DOM 打桩不解析 HTML，模板替换那几处数不出标记来。
    //   但「点了不打伤害的技能会不会短路」测得到 —— 而短路正是最关键的一处：
    //   不短路的话它会撞上 core/damage.mjs 那句「还没补录」，
    //   把「这技能本来就不打伤害」说成「我们还没录」。
    id: 'R46-界面上的「不打伤害」短路被拆掉',
    file: 'ui/app.mjs',
    cmd: 'hsr_build',
    edits: [{ from: `  if (ab.status === 'non-damage') {
    st.result = { ok: false, error: ab.note || '这个技能不造成伤害，不参与计算' };
    renderOutput(); return;
  }`,
              to: `  if (false) {}` }],
    expect: ['结果里没有说「不造成伤害」'],
  },

  // ==========================================================================
  // ★ 深渊版本号反推（第 7.8 节）★
  // ==========================================================================
  {
    // 回到用户报的那个原始症状：界面上**每一期都写着同一个版本号**。
    // 把 `versionAt(s.begin)` 换回源库那一列 —— 那一列逐字等于 `meta.version`，
    // 是整库快照的标签（92 行一个值），于是从 1.0 的第一期到最新一期全是 v4.5。
    //
    // 期望列两条，是因为这一改动**同时**打穿两件事，而两条各守一半：
    //   · 「绝对钉死」盯的是「某一期反推错了」
    //   · 覆盖率计数盯的是「整段反推失效」—— 全库统一成一个值时，
    //     `versionAt` 那条路根本不被走到，只有计数会动
    id: 'R47-版本号读回源库那一列（快照标签）',
    file: 'core/scenario.mjs',
    edits: [{ from: `    const version = versionAt(s.begin);`,
              to: `    const version = s.snapshotVersion;` }],
    expect: ['绝对钉死', '92 期里反推出 73 期版本'],
  },
  {
    // 差一版：`versionAt` 返回**上一个**版本。日期表一个字没动、链照样自洽、
    // 覆盖率还是 73 期 —— 这一条专门证明那条钉死断言**不是**在验表自己。
    id: 'R48-版本反推差一版',
    file: 'core/scenario.mjs',
    edits: [{ from: `  return hit;
}`, to: `  const i = VERSION_STARTS.findIndex(([v]) => v === hit);
  return i > 0 ? VERSION_STARTS[i - 1][0] : hit;
}` }],
    expect: ['绝对钉死'],
  },

  // ==========================================================================
  // ★ 光锥的「最多计入 #N 点」夹子（第 10.12 节 ⑥）★
  // ==========================================================================
  {
    // 拆掉夹子。光锥「今日亦是和平的一日」在能量上限 480 的角色身上
    // 会算出 0.96 而不是 0.32 —— **静默偏高**（界面照常显示、伤害照常变大）。
    id: 'R49-「最多计入」的夹子被拆掉',
    file: 'core/catalog.mjs',
    edits: [{ from: `  let base = panel[p.attr];
  if (p.capParam != null) {
    const cap = resolveIndex(ctx, entry, o, p.capParam);
    if (cap != null) base = Math.min(base, cap);
  }`,
              to: `  const base = panel[p.attr];` }],
    expect: ['带「最多计入」的条目'],
  },
  {
    // 夹子还在，但夹法反了：不管基数多大都取上限（`base = cap`）。
    //
    // ★ 这一条与 R49 是**一对**，缺一个就有一个方向没人守 ★
    //   ⑥ 的两边（「基数超过上限 ⇒ 钉在上限」「基数低于上限 ⇒ 跟着基数」）
    //   汇进同一条 `ok()`，所以这两条反证**打红的是同一个标签**，光看标签分不出来。
    //   分开的是证据：R49 只会让 `above` 那一支失衡，R50 只会让 `below` 那一支失衡 ——
    //   跑的时候看 verify 打出的详情（`基数 3× 上限 → …` / `基数 ½ 上限 → …`）
    //   就知道红的是哪一半。要是当初只写了 where 那一半，
    //   `base = cap` 这种写法会全绿 —— 那正是能量上限低的角色被静默算高的坏法。
    id: 'R50-夹子只取上限不看基数',
    file: 'core/catalog.mjs',
    edits: [{ from: `    if (cap != null) base = Math.min(base, cap);`,
              to: `    if (cap != null) base = cap;` }],
    expect: ['带「最多计入」的条目'],
  },

  // ==========================================================================
  // ★ 光锥下拉框的命途过滤（打包自检）★
  //   verify 碰不到界面层 —— DOM 桩的 `querySelectorAll: () => []` 让它早退。
  //   而命途过滤**只体现在 `<option>` 里**，桩不解析 HTML，所以它是零覆盖的，
  //   除非把规则本身导出成 `S.lcList()`（自检问的是函数，不是渲染结果）。
  // ==========================================================================
  {
    // 整条过滤删掉（永远返回全部 169 把）—— 回到「选完角色在 169 行里找十几把」。
    id: 'R51-光锥命途过滤被删掉',
    file: 'ui/app.mjs',
    cmd: 'hsr_build',
    edits: [{ from: `  if (!st.lcPathOnly || !path) return LCS;`,
              to: `  if (true) return LCS;` }],
    expect: ['只看本命途时应当只剩'],
  },
  {
    // 过滤还在，但「当前装备的那把永远列出来」被去掉 —— 换角色后下拉框里
    // 没有任何一项是 selected，浏览器**默认显示第一项**：界面显示着一把光锥，
    // 而 `st.lightconeId` 是另一把。没有任何地方会报错。
    id: 'R52-当前装备的光锥被过滤掉',
    file: 'ui/app.mjs',
    cmd: 'hsr_build',
    edits: [{ from: `  return LCS.filter((l) => l.path === path || l.id === st.lightconeId);`,
              to: `  return LCS.filter((l) => l.path === path);` }],
    expect: ['被过滤掉了'],
  },
  {
    // 默认值 true → false。这条**只**靠默认值那一条断言守着：
    // 过滤逻辑本身好好的，其余全绿。
    id: 'R53-「只看本命途」默认关闭',
    file: 'ui/app.mjs',
    cmd: 'hsr_build',
    edits: [{ from: `  lcPathOnly: true,`, to: `  lcPathOnly: false,` }],
    expect: ['的默认值不是 true'],
  },

  // ==========================================================================
  // ★ 人工表的属性键与语料对不上 ★
  // ==========================================================================
  {
    // `lc.23048.b3` 是 PICKABLE（分类器判出 abilityDmg），把人工记录改成 dmgBoost，
    // 正好落在「两边都有键、但对不上」这个格子里 —— 算得出但算错。
    //
    // ★ 这条是配 keyBad 那条断言放宽之后补的 ★
    //   放宽成「分类器没判出键时不比」之后，剩下的那半截**必须仍然是活的**：
    //   不然这次放宽就等于把整条断言悄悄作废了，而台账看起来还是绿的。
    id: 'R54-人工表的属性键和语料对不上',
    file: 'annotations/buffs.jsonl',
    edits: [{ from: `"text":"使目标造成的战技伤害提高#4[f1]%","effect":{"key":"abilityDmg"`,
              to: `"text":"使目标造成的战技伤害提高#4[f1]%","effect":{"key":"dmgBoost"` }],
    expect: ['buffs.jsonl 里显式写了属性键'],
  },

  // ==========================================================================
  // ★ 面板锚定的量是平值，不是百分比 ★
  // ==========================================================================
  //
  // 这三条守的是 `core/attr.mjs` 的 `panelOf` 里那行
  // `if (key != null) key = FLAT_OF[key] ?? key;`。
  // 打掉它，10 条面板锚定条目会**静默**退回 Pct 键：
  //   刻律德菈「持有【军功】的角色攻击力提高，提高数值等同于刻律德菈攻击力的#2%」
  //   满级 #2=24%，她白值 418 → +100.4（平值攻击力）。
  //   当 atkPct 用 → `inCombatPanel` 算 `418 × (1 + 100.36)` = 42,387（×101）。
  //   同队知更鸟那条 #1 更大 → ×296；玲可 / 杰帕德 / 丹恒•腾荒再叠上去，
  //   战斗内攻击力能翻几百倍。而界面上每条都显示得好好的，**一条错都不报**。
  //
  // ★ 为什么必须三条、而不是一条 ★
  //   三条打的是三种不同的「修了一半」，而它们红的断言各不相同：
  //     R55 只转句内的 → 有 5 条走紧邻继承的没转上
  //     R56 丢了 `?? key` → 键变成 undefined，条目整条掉出目录（红的是计数）
  //     R57 整段删掉   → 全都没转上（红的是新加的 10.5c）
  {
    // 「只转句内的、紧邻继承的不转」—— `1208.skill`/`1215.skill`/`1309.skill`
    // 三条的 `via` 都是 `neighbour`，会留在 Pct 键上。
    id: 'R55-面板锚定的转换只做句内的、紧邻继承的不做',
    file: 'core/attr.mjs',
    edits: [{ from: `  if (key != null) key = FLAT_OF[key] ?? key;`,
              to: `  if (key != null && via === 'in_clause') key = FLAT_OF[key] ?? key;` }],
    expect: ['面板锚定条目的结果键不是 Pct 键'],
  },
  {
    // 忘了「没有平值对应项就原样保留」—— critDmg / dmgBoost / breakEffect /
    // abilityDmg 这四档没有 FLAT_OF 对应项，`key` 直接变 undefined。
    // 它们不是面板锚定条目的专属，`key == null` 会让这些条目**整条掉出目录**。
    id: 'R56-面板锚定的转换把「没有对应项就原样保留」丢了',
    file: 'core/attr.mjs',
    edits: [{ from: `  if (key != null) key = FLAT_OF[key] ?? key;`,
              to: `  if (key != null) key = FLAT_OF[key];` }],
    expect: ['增益目录 968 条'],
  },
  {
    id: 'R57-面板锚定一律转平值这一步被整段删掉',
    file: 'core/attr.mjs',
    edits: [{ from: `  if (key != null) key = FLAT_OF[key] ?? key;\n`, to: `` }],
    expect: ['面板锚定条目的结果键不是 Pct 键'],
  },

  // ==========================================================================
  // ★ 「模型里没有这一档」的显式置灰 ★
  // ==========================================================================
  {
    // 光锥「这就是我啦！」b2 的置灰失效 → 它又能取值了，`catalogValue` 算出
    // 防御力×0.6 = 900，`dmgBoost` 那一档当分数用 → 伤害 ×901，**一条都不报**。
    // 红的是 blocked 的条数等式（右边仍然记着 UNMODELLED 那一份）。
    id: 'R58-「模型里没有这一档」的置灰分支被删掉',
    file: 'core/catalog.mjs',
    edits: [{ from: `  if (UNMODELLED.has(entry.id)) return \`unmodelled:\${entry.id}\`;\n`, to: `` }],
    expect: ['blocked 的条数 ='],
  },
  {
    // 往 `UNMODELLED` 里塞一条**算得出来**的 —— 这是「静默少算」：
    // 界面上多一行「算不了」，用户以为是数据问题，实际是被自己人挡了。
    // 两条一起红：名单比对（钉死 lc.21030.b2）和「buffs.jsonl 条条取得到值」。
    id: 'R59-UNMODELLED 里多塞了一条算得出来的',
    file: 'core/catalog.mjs',
    edits: [{ from: `  ['lc.21030.b2', '「终结技的伤害值提高`,
              to: `  ['lc.23018.b3', '「终结技的伤害值提高` }],
    expect: ['UNMODELLED 名单正好是 lc.21030.b2'],
  },
  {
    id: 'R60-情境效果跨半场', file: 'core/buffs.mjs',
    from: `b.scope?.enemySide != null && b.scope.enemySide !== enemy?.side`, to: `false`,
    expect: ['审查01：两个半场各自仅有60%首领减伤', '审查01：不同半场的不同减伤值不会串用'],
  },
  {
    id: 'R61-百分比加成乘最终面板', file: 'core/damage.mjs',
    from: `out[key] = out[key] + (base ?? 0) * num(pctK) + num(flatK);`,
    to: `out[key] = out[key] * (1 + num(pctK)) + num(flatK);`,
    expect: ['审查02：百分比加成只乘白值'],
  },
  {
    id: 'R62-不同目标后续伤害混算', file: 'core/abilities.mjs',
    from: `return { terms: selected, excluded };`, to: `return { terms, excluded: [] };`,
    expect: ['审查03：姬子战技主目标200%', '审查03：三月七终结技不把冻结后续伤害'],
  },
  {
    id: 'R63-我方减伤降低输出', file: 'core/buffs.mjs',
    from: `b.key === 'dmgReduction' && b.side === 'ally'`, to: `false`,
    expect: ['审查04：符玄18%我方减伤不降低输出'],
  },
  {
    id: 'R64-面板元素增伤断线', file: 'core/damage.mjs',
    from: `(panel.elemDmg?.[element] ?? 0)`, to: `(0)`,
    expect: ['审查05：面板火伤100%'],
  },
  {
    id: 'R65-减防与无视相乘', file: 'core/enemy.mjs',
    from: `Math.max(0, 1 - defShred - defIgnore)`, to: `(1 - defShred) * (1 - defIgnore)`,
    expect: ['审查06：减防40%与无视20%加算'],
  },
  {
    id: 'R66-负抗性折半', file: 'core/enemy.mjs',
    from: `return Math.max(0, 1 - d);`, to: `return d > 0 ? 1 - d : 1 - d / 2;`,
    expect: ['审查07：负抗性不折半'],
  },
  {
    id: 'R67-击破条件被忽略', file: 'core/buffs.mjs',
    from: `b.condition?.trigger === 'after_weakness_break' && !state.broken`, to: `false`,
    expect: ['审查08：击破前不加易伤'],
  },
  {
    id: 'R68-技能等级没有传入目录', file: 'ui/app.mjs', cmd: 'hsr_build',
    from: `skillLevels: st.skillLevels,`, to: `skillLevels: {},`,
    expect: ['审查界面回归 技能等级输入传入增益目录'],
  },
  {
    id: 'R69-配队对比漏情境', file: 'core/scenario.mjs',
    from: `aggregateScenarioBuffs(lo.buffs, scenario, lo.enemy`,
    to: `aggregateScenarioBuffs(lo.buffs, null, lo.enemy`,
    expect: ['审查10：主结果与同配置对比共用情境'],
  },
];

function run(cmd) {
  const script = cmd === 'hsr_build' ? 'hsr_build.mjs' : '_scripts/verify.mjs';
  try {
    const out = execFileSync('node', [script], { encoding: 'utf8' });
    return out;
  } catch (e) {
    return (e.stdout ?? '') + (e.stderr ?? '');
  }
}

const only = process.argv[2];
let pass = 0;
let fail = 0;
for (const m of MUT) {
  if (only && m.id !== only) continue;
  const src = fs.readFileSync(m.file, 'utf8');
  const edits = m.edits ?? [{ from: m.from, to: m.to }];
  let broken = src;
  let bad = null;
  for (const e of edits) {
    const n = broken.split(e.from).length - 1;
    if (n !== 1) { bad = `锚点出现 ${n} 次（应为 1）`; break; }
    broken = broken.replace(e.from, e.to);
  }
  if (bad) {
    console.log(`✗ ${m.id}：${bad} —— 反证没跑成，锚点过期了`);
    fail++;
    continue;
  }
  fs.writeFileSync(m.file, broken);
  let out;
  try {
    out = run(m.cmd);
  } finally {
    fs.writeFileSync(m.file, src);   // 无论成败都还原
  }
  // ★ 这里曾经是 `l.slice(4, -4)` ★
  //   匹配到的是 `  ✗ 标签 ——`（结尾的 `——` **不带**后面那个空格），
  //   而 `slice(4, -4)` 按 4 个字符切，于是每次都在**标签末尾多啃掉一个字**。
  //   因为比对用的是 `includes()`（前缀容忍），短一个字的标签照样能匹配上，
  //   所以这个 bug 一直没露头 —— 直到有断言的期望值正好以被啃掉的那个字结尾。
  //   表现是「该红未红，实际红了 …的条」（少一个「目」），看着像断言恒真，
  //   其实是台账在骗人。改成精确剥前缀后缀。
  //
  // ★ 于是有个约定：**断言标签里不许出现 ` ——`** ★
  //   上面那个 `(.+?)` 是**懒惰**的，抓的是**第一个** ` ——`。
  //   标签内部再带一个的话，抓出来的是截断标签，`expect` 写全串就永远匹配不上,
  //   表现成「期望变红的没红，这条断言是恒真的」—— 而断言其实好好的。
  //   真踩过：`…都可勾选 —— 星魂不再设门槛` 被截成 `…都可勾选`。
  //   要分隔就用全角括号或冒号。
  //
  // ★ `cmd: 'hsr_build'` 的反证要换个剥法 ★
  //   它的失败是 `throw new Error(...)`，输出里是
  //     `Error: 选了「三月七 / 可爱即是正义」…结果里没有说「不造成伤害」，而是：…`
  //   根本没有 verify 那种 `  ✗ 标签 —— 详情` 的行。拿同一个正则去剥，
  //   会得到「一条都没红」—— 看着像反证没跑成，其实是台账读错了脚本。
  const red = m.cmd === 'hsr_build'
    ? (out.match(/^Error: .+$/gm) ?? []).map((l) => l.slice(7).trim())
    : (out.match(/^  ✗ (.+?) ——/gm) ?? [])
      .map((l) => l.replace(/^  ✗ /, '').replace(/ ——$/, '').trim());
  const hit = m.expect.filter((e) => red.some((r) => r.includes(e)));
  const allRed = [...new Set(red)];
  if (hit.length === m.expect.length) {
    console.log(`✓ ${m.id}：${hit.length} 条对应断言全部变红`);
    for (const h of hit) console.log(`     ✗ ${h}`);
    if (allRed.length > hit.length) {
      console.log(`     （另有 ${allRed.length - hit.length} 条连带变红：`
        + allRed.filter((r) => !hit.some((h) => r.includes(h))).slice(0, 3).join(' / ') + '）');
    }
    pass++;
  } else {
    console.log(`✗ ${m.id}：期望变红的没红 —— 这条断言是恒真的，不算数`);
    console.log(`     该红未红：${m.expect.filter((e) => !hit.includes(e)).join(' / ')}`);
    console.log(`     实际红了 ${allRed.length} 条：${allRed.slice(0, 5).join(' / ') || '（一条都没红）'}`);
    fail++;
  }
}
console.log(`\n反证 ${pass + fail} 个，通过 ${pass} 个，失败 ${fail} 个`);
process.exit(fail ? 1 : 0);
