// 属性关键词表 + 子句分桶。**构建期（提取器）和运行期（增益目录）共用同一份。**
//
// ★ 为什么要从 extract_buffs.mjs 里搬出来 ★
// 以前这张表只服务提取器：「这条子句是什么属性键」。现在运行期的目录也要问同一个问题
// （界面要按属性分组、要判侧别、要判作用对象）。两边各写一份的话，漂移的表现是
// 「提取时说它是增伤，界面把它归到攻击组」—— 数值照样算得出来，只是分错了组，
// **没有任何断言会红**。所以表只能有一份。
//
// ★ 分桶是「绝不静默」的总闸 ★
// 以前 matchAttr 返回 null 就等于这条子句消失了 —— 没有计数、没有告警、没有痕迹。
// 现在每一条含数值的子句都必须落进且只落进 BUCKET 里的一个桶，
// verify 有一条守恒式盯着（各桶之和 === 含数值子句总数）。
import { hasPlaceholder, affectsDamage } from './clauses.mjs';

// ---------------------------------------------------------------------------
// 属性关键词表
// ---------------------------------------------------------------------------

/**
 * ★ 「额外」是先按无语义词剥掉的 ★
 * 语料里大量「防御力**额外**提高#3%」「造成的伤害**额外**提高#3%」，
 * 老规则写的是 `防御力提高`，中间卡一个「额外」就整条失配 ——
 * 光这一个词就占了 NO_ATTR 桶的一大块。剥掉之后再匹配，语料和规则两头都干净。
 * 它也确实没有任何数值含义，不影响方向、不影响作用对象。
 */
const NOISE = /额外/g;

/** 匹配前把无语义词去掉。**只在 matchAttr 内部用**，原文另存。 */
export function canon(text) {
  return String(text ?? '').replace(NOISE, '');
}

/** 中文技能类型 → 库里 type 的英文枚举。`abilityDmg` 是按这个查表的。 */
const ABILITY_CN = {
  普攻: 'Normal', 战技: 'BPSkill', 终结技: 'Ultra', 天赋: 'Talent', 秘技: 'Maze',
};

/**
 * 倍率改动的目标技能。值是库里 type 的英文枚举；**库里没有对应 type 的用伪种类**。
 *
 * 「追加攻击 / 反击 / 忆灵技」在库里不是技能 type（它们是机制，不是键位）——
 * 所以这类条目收得进来，但**算不出来**，界面必须明说它作用于什么，
 * 而不是让它混进目录、勾了不动。
 */
const ABILITY_WORDS = [
  [/普攻/, 'Normal'], [/战技/, 'BPSkill'], [/终结技/, 'Ultra'], [/天赋/, 'Talent'],
  [/秘技/, 'Maze'], [/欢愉技/, 'ElationDamage'],
  [/追加攻击/, 'FollowUp'], [/反击/, 'Counter'], [/忆灵技/, 'Memosprite'],
];

/** 本计算器算不出这类技能（不是技能 type，是机制）。 */
export const UNCOMPUTABLE_ABILITY = new Set(['FollowUp', 'Counter', 'Memosprite']);

export const ABILITY_KIND_CN = {
  Normal: '普攻', BPSkill: '战技', Ultra: '终结技', Talent: '天赋', Maze: '秘技',
  ElationDamage: '欢愉技', FollowUp: '追加攻击', Counter: '反击', Memosprite: '忆灵技',
};

/**
 * 持续伤害的状态名。
 *
 * ★ 为什么要一张名字表，而不只认「持续伤害」四个字 ★
 *   卡芙卡 R6 写的是「…使敌方目标陷入的**触电**状态的伤害倍率提高#1[i]%」，
 *   通篇没有「持续伤害」四个字 —— 只认那四个字的话它会掉进倍率桶，
 *   然后被当成一条普通技能的倍率改动去算，而它改的是 DoT 的倍率。
 *   桑博 R6（风化）、椒丘 R2（烬煨）、黑天鹅（奥迹）同理。
 */
const DOT_STATUS = /持续伤害|触电|风化|灼烧|裂伤|纠缠|烬煨|奥迹|离神/;

/** 倍率改动类的键 —— 这几个键不表示「一个乘区」，表示「改基础伤害那一项」。 */
export const MULTIPLIER_KEYS = new Set([
  'multiplierAdd', 'multiplierAddDown', 'multiplierScale', 'multiplierScaleDown', 'multiplierSet',
]);

/** 从子句文本里推「这条倍率改动作用于哪个技能」。判不出来的返回 null（＝本次/该/此）。 */
export function deriveAbilityKind(text) {
  const t = String(text ?? '');
  for (const [re, kind] of ABILITY_WORDS) if (re.test(t)) return kind;
  return null;
}

/**
 * 顺序有意义：**先匹配长的**。
 * `subj` 是「句子里没写主体时，谓语本身锁死的那个主体」，不是「默认值」。
 */
export const ATTR_RULES = [
  // ---- 倍率改动：改的是**基础伤害那一项**，不是任何一个乘区 ----
  //
  // ★ 三种写法语义不同，绝不能合成一个键 ★ 判据是**语言本身给的**：
  //   ① 提高**为**原倍率的 X      → 设定：倍率 ×X        （千冶•刃 R6）
  //   ② 提高/减少**原倍率的** X   → 乘算：倍率 ×(1±X)     （白厄、爻光、知更鸟•晴歌）
  //   ③ 提高 X%（不带「原倍率的」）→ 加算：倍率 +X 个百分点（丹恒、克拉拉、飞霄…）
  //   ②③ 的区别不是猜的：「原倍率的」这个限定词存在，就说明**不带它的写法是另一个意思** ——
  //   否则作者不会特意多写这四个字。合成一个键的话，丹恒的 +120% 会被算成 ×2.2 而不是 +120%。
  //
  // 排在 ATTR_RULES 最前：这些子句里也可能出现「伤害提高」以外的属性词，
  // 而它们**不是**乘区，被后面任何一条咬住都是错的。
  { re: /提高为原倍率的/, key: 'multiplierSet', subj: 'ally' },
  { re: /(提高|增加|提升)原倍率的/, key: 'multiplierScale', subj: 'ally' },
  { re: /(减少|降低)原倍率的/, key: 'multiplierScaleDown', subj: 'ally' },
  { re: /倍率提高/, key: 'multiplierAdd', subj: 'ally' },
  { re: /倍率(降低|减少)/, key: 'multiplierAddDown', subj: 'ally' },

  // ---- 敌方负面：必须排在最前，否则会被后面的「伤害提高」抢先咬住 ----
  { re: /受到的火属性伤害提高/, key: 'vuln', scope: { element: 'Fire' }, subj: 'enemy' },
  { re: /(受到|承受)的?伤害提高/, key: 'vuln', subj: 'enemy' },
  { re: /(受到|承受)的?伤害降低/, key: 'dmgReduction', subj: 'enemy' },
  { re: /速度降低/, key: 'speedPct', subj: 'enemy' },
  { re: /攻击力降低/, key: 'atkPct', subj: 'enemy' },
  { re: /防御力降低/, key: 'defShred', subj: 'enemy' },
  { re: /抗性降低/, key: 'resPen', subj: 'enemy' },

  // ---- 元素增伤 ----
  // 技能里几乎没有（全库 1 处），但**遗器 2 件套整类都是这个** ——
  // 不加这条，「密林卧雪的猎人 2 件：冰属性伤害提高」这类会整类进 NO_ATTR。
  { re: /(火|冰|雷|风|量子|虚数|物理)属性伤害提高/, key: 'elemDmg', subj: 'ally' },

  // ---- 技能类型增伤 ----
  // 捕获组就是中文类型名，scope.abilityType 由下面的 ABILITY_CN 填
  //
  // ★ `(?!效果)` 这个前瞻是必须的 ★
  //   花火 1306「持有【谜诡】的我方目标触发花火天赋造成的伤害提高效果每层额外提高#3[f1]%」
  //   里的「天赋」说的是**那个效果来源于天赋**，不是在给天赋伤害加百分比。
  //   没有前瞻它会被提成 `abilityDmg/Talent`，而正确读法是 `dmgBoost`
  //   —— 它是把一条已有的增伤再放大，跟伤害挂在哪个键位上无关。
  { re: /(普攻|战技|终结技|天赋|秘技)造成的伤害提高(?!效果)/, key: 'abilityDmg', subj: 'ally' },
  { re: /(普攻|战技|终结技|天赋|秘技)伤害提高(?!效果)/, key: 'abilityDmg', subj: 'ally' },

  // ---- 我方增益 ----
  { re: /抗性穿透提高/, key: 'resPen', subj: 'ally' },
  //
  // ★ 原来的 `无视.{0,4}防御` 一行都咬不住 ★
  //   真形式是「无视<对象>#N%的防御力」，占位符和 `%` 夹在中间 ——
  //   「无视**目标#1[i]%的**防御力」中间隔了 9 个字符，`.{0,4}` 够不着。
  //   实测全库 46 条「无视…防御…占位符」的子句，旧式**命中 0 条**，
  //   全部落到 `NO_ATTR`（而更早一步还会被 `isDamageTermClause` 抢成 `DAMAGE_TERM`）。
  //   放宽到 `[^，。；]{0,14}` 后命中 44 条。
  //
  //   为什么用 `[^，。；]` 而不是 `.`：`.` 会跨过子句边界把两句连起来读，
  //   「A 无视了 B。该目标防御力降低」这种拼出来的假命中正是要避免的。
  //   上面那批子句切开后本来就只剩一段，所以子句内用 `[^，。；]` 是安全的。
  { re: /无视[^，。；]{0,14}防御/, key: 'defIgnore', subj: 'ally' },
  { re: /暴击伤害提高/, key: 'critDmg', subj: 'ally' },
  { re: /暴击率提高/, key: 'critRate', subj: 'ally' },
  // 「提高自身#1[i]%暴击率」是反过来的语序，上面两条咬不住
  { re: /提高.{0,6}暴击伤害/, key: 'critDmg', subj: 'ally' },
  { re: /提高.{0,6}暴击率/, key: 'critRate', subj: 'ally' },
  { re: /击破特攻提高/, key: 'breakEffect', subj: 'ally' },
  { re: /效果命中提高/, key: 'effectHit', subj: 'ally' },
  { re: /效果抵抗提高/, key: 'effectRes', subj: 'ally' },
  { re: /攻击力提高/, key: 'atkPct', subj: 'ally' },
  { re: /生命上限提高|生命值上限提高/, key: 'hpPct', subj: 'ally' },
  { re: /防御力提高/, key: 'defPct', subj: 'ally' },
  { re: /速度提高/, key: 'speedPct', subj: 'ally' },
  // 欢愉度：**库里没有基值**，它会一路传成 unknown 并在界面上明示算不了 —— 但条目要收，
  // 收进来才知道「这条我们收录了、只是算不了」，比让它从目录里消失强。
  { re: /欢愉度提高/, key: 'elation', subj: 'ally' },
  // 通用增伤兜底。放在最后：阮•梅战技「我方全体伤害提高#1%」不带「造成」二字，
  // 老规则 `造成的?伤害提高` 咬不住 —— 而阮•梅正是最常用的辅助之一。
  { re: /造成的?伤害提高/, key: 'dmgBoost', subj: 'ally' },
  { re: /伤害提高/, key: 'dmgBoost', subj: 'ally' },
];

/**
 * 含数值、但**根本不是增益**的子句。单独立桶，不混进 NO_ATTR。
 *
 * ★ 为什么必须分开 ★
 * 「治疗量提高#1%」「增加#2[i]段」「蓄能层数减少#3[i]层」这些有数字、也让
 * `affectsDamage` 为真（它的策略是拿不准就报），但它们是**治疗/段数/层数**，
 * 不是能被勾选的增益。混进 NO_ATTR 会把「该补规则的清单」淹掉 ——
 * 这正是本项目反复吃过的亏：**假警报会把真警报淹掉**。
 *
 * 「等同于」那类（「提高数值等同于符玄生命上限的#4[f1]%」）也归这里：
 * 它的数值锚在另一个属性上，不是能直接加进乘区的常量。
 */
const NON_BUFF_RE = /治疗|削韧|韧性|移动速度|段数|战技点|蓄能|行动次数|层数|增加#\d+\[|大于等于|小于等于|等同于|原伤害|立即产生|能量上限|点能量/;

export function isNonBuffClause(text) {
  return NON_BUFF_RE.test(String(text ?? ''));
}

/**
 * 「点」单位 → 平值键。只有 Pct→Flat 这一个方向：ATTR_RULES 里没有哪条规则凭空
 * 产生 Flat 键，所以反向不会发生，不需要对称表。
 */
export const FLAT_OF = {
  atkPct: 'atkFlat', hpPct: 'hpFlat', defPct: 'defFlat', speedPct: 'speedFlat',
};

const ALLY_SUBJ = /我方|队友|自身|队伍/;
const ENEMY_SUBJ = /敌方|敌人|首领幻影/;

/** 七种属性。与 core/ctx.mjs 的 ELEMENTS 一致，这里只做中文→英文。 */
const ELEMENT_EN = {
  物理: 'Physical', 火: 'Fire', 冰: 'Ice', 雷: 'Thunder',
  风: 'Wind', 量子: 'Quantum', 虚数: 'Imaginary',
};

/** 占位符本体（与 clauses.mjs 的 TOK_* 同源，这里要单独用所以复制了形状）。 */
const TOK_G = /#(\d+)\[(?:i|f[1-6])\]%?/g;
const TOK_ONE = /#(\d+)\[(?:i|f[1-6])\]%?/;

// ---------------------------------------------------------------------------
// 作用对象（target）
// ---------------------------------------------------------------------------

/**
 * ★ 这一栏是本次新增的 ★
 * buffs.jsonl 里的 50 条记录**一条都没有** `effect.target` —— 以前没人问过这个问题。
 * 但「先按作用对象分组，列表内再按属性分组」这个交互要求它是**必填**的，
 * 所以只能从句子里推。
 *
 * 顺序敏感：`自身` 要在 `我方全体` 之前判 —— 「使自身**以外**的我方全体」这种句子
 * 两种都命中，先判自身会归错组（虽然罕见，但归错组是静默的）。
 *
 * 判不出返回 null，由 classifyClause 落进 SIDE_UNKNOWN 桶，**绝不猜**。
 * 猜错的代价是「这条增益到底加在谁身上」错了，而界面上看不出错。
 */
export function deriveTarget(text, side, ownerName = null) {
  const t = String(text ?? '');
  // 敌方负面：目标就是敌人
  if (side === 'enemy') return { target: 'enemy', targetSource: 'side' };

  if (/自身以外|自己以外/.test(t)) return { target: null, targetSource: 'none' };

  // ★ 顺序要紧：**「我方全体」要排在角色名前面** ★
  //   卡芙卡 R2「卡芙卡在场时，我方全体造成的持续伤害提高25%」两种都命中。
  //   先判角色名会归成 self —— 而它其实是给全队的，归错组是静默的。
  if (/我方全体|我方所有|我方目标全体|全队|队伍中所有|我方全体目标/.test(t)) {
    return { target: 'team', targetSource: 'explicit' };
  }
  if (/指定我方单体|一名我方|我方单体|单个我方目标/.test(t)) {
    return { target: 'single_ally', targetSource: 'explicit' };
  }
  if (/自身|自己|装备者/.test(t)) return { target: 'self', targetSource: 'explicit' };

  // ★ 描述里直接点名角色（「使希儿的速度提高#2%」「最多使阿兰造成的伤害提高#1%」）★
  //   这类没有「自身」二字，但主体明确就是他自己。不认这个信号的话，
  //   315 条里绝大多数会掉进「作用对象判不出」—— 实测里**真是侧别判不出的只有 4 条**。
  //   注意传进来的是**底名**（「三月七」而不是「三月七（存护）」），desc 里只会写底名。
  if (ownerName && ownerName.length >= 2 && t.includes(ownerName)) {
    return { target: 'self', targetSource: 'owner_name' };
  }

  // 「我方目标」既可指单体也可指全体，只有带「指定/一名/单体」才敢判单体
  if (/我方目标|我方角色|队友/.test(t)) return { target: 'single_ally', targetSource: 'weak' };

  // ★ 整句谁都没点名 → 归**来源的归属者**（装这把光锥的人 / 点这个行迹的人）★
  //
  //   走到这里说明：这半句里没有「我方/敌方/自身/自己/装备者/队友」，也没有
  //   点名角色，而且**不是敌方负面**（敌方那一支在最上面就返回了）。
  //   这类一共 247 条，长这样：
  //     光锥「攻击力提高#1%」「每层使造成的伤害提高#1%」
  //     遗器「暴击率提高#2%」
  //     行迹「普攻造成的伤害提高#1%」「终结技造成的伤害提高#1%」
  //     星魂「则其下回合的暴击伤害提高#2%」
  //     技能「变身期间攻击力提高#4%」
  //   它们的共同点是**来源本身就是受益者**：光锥/遗器的「攻击力提高」不可能指别人，
  //   行迹/星魂/技能的「暴击伤害提高」也只能是这个角色自己。这不是猜，是这类
  //   文本的写法 —— 游戏不会在一把光锥的描述里提升别人的属性。
  //
  //   ★ 为什么不干脆留 null ★
  //   留着的话这 247 条全部落进 TARGET_UNKNOWN，而目录里「作用对象」是**分组的第一级**
  //   （我方单体 / 我方全体 / 敌方负面）。归不了组就等于**选不到** ——
  //   一把光锥最常见的「攻击力提高」会从目录里消失，用户只会觉得「怎么少了一大块」。
  //
  //   ★ 排除「指向别处」的指代词 ★
  //   「该目标」「其受到」「使其」指的是**技能打的那个对象**，不是来源归属者。
  //   这类本该由上面的敌方分支接走；万一侧别没判出来又在这里被兜成 self，
  //   就是把一个敌方减益当成自己的增益 —— 方向性错误，比漏收严重得多。所以显式排除。
  //
  //   ★ 「使目标」必须一并排除（2026-09 补）★
  //   原先这张表列了「使其」却漏了**光杆的「使目标」**，而两者是同一个语法位置。
  //   漏掉的代价不是「少收一条」，是**静默算错**：
  //     停云 终结技「同时使目标造成的伤害提高#3[i]%」
  //     → 兜成 `self/source_owner` → 这条**给队友的**增益出现在**停云自己的自拐卡片**里。
  //   用户算停云的时候它生效（数字偏大、不报错、看着还挺合理）。
  //   星期日 天赋/秘技、藿藿 星魂6、光锥「金血铭刻的时代」「欢愉满溢祝福」同病，共 6 条。
  //
  //   排除之后它们落 `TARGET_UNKNOWN`（可见、可数、带得出原文），
  //   再由人工表补 `effect.target` 接回目录 —— 阮•梅/翡翠那两条已经走通的通路。
  if (side === 'ally' && !/该目标|此目标|其受到|使其|使目标|那个目标/.test(t)) {
    return { target: 'self', targetSource: 'source_owner' };
  }
  return { target: null, targetSource: 'none' };
}

// ---------------------------------------------------------------------------
// 条件抽取（R5）
// ---------------------------------------------------------------------------

/** R5 条件抽取。抽不到就返回 null，不要编。 */
export function extractCondition(text) {
  const c = {};
  const turn = /持续#(\d+)\[i\]回合/.exec(text);
  if (turn) c.duration = { turns: Number(turn[1]) };
  const when = /(施放|使用)(普攻|战技|终结技)时/.exec(text);
  if (when) c.trigger = `on_${when[2]}`;
  if (/弱点击破后/.test(text)) c.trigger = 'after_weakness_break';
  if (/每层/.test(text)) c.stacks = true;
  return Object.keys(c).length ? c : null;
}

// ---------------------------------------------------------------------------
// 匹配
// ---------------------------------------------------------------------------

/** 找离 `at` 最近的占位符，返回 {num, at, d} 或 null。num 就是 #N 里的 N。 */
function nearestToken(text, at) {
  let best = null;
  for (const m of text.matchAll(TOK_G)) {
    const d = Math.abs(m.index - at);
    if (!best || d < best.d) best = { d, num: Number(m[1]), at: m.index };
  }
  return best;
}

/**
 * 在一段文字里找属性关键词，并判断侧别、方向、作用对象。
 *
 * 行为与搬过来之前**逐字一致**（除了新增的 target）—— buffs.jsonl 里 50 条记录的
 * id 是按子句序号编的，这里任何一条匹配顺序变了都会让 id 整体错位。
 */
export function matchAttr(rawText, { ownerName = null } = {}) {
  // ★ 一律在剥掉「额外」之后的文本上匹配 ★（见 canon 的注释）
  const text = canon(rawText);
  for (const r of ATTR_RULES) {
    const mm = r.re.exec(text);
    if (!mm) continue;
    const kwAt = mm.index;

    // 方向：语料里「降低/减少/下降/降低至」为负
    const dir = /降低|减少|下降|削弱/.test(text) ? -1 : 1;

    // 侧别判定分三档，**每一档都记下来源**，因为这是「把增益算反」的唯一入口：
    //   explicit —— 句子里明写了我方/敌方，可信
    //   phrase   —— 句子里没写主体，但谓语本身锁死了主体
    //                （「受到的伤害提高」只可能指被打的那一方 = 敌方）
    //   none     —— 两样都判不出 → unknown，绝不猜
    let side = null;
    let sideSource = 'none';
    //
    // ★ 判侧别时先把「本条规则自己咬中的那段」挖掉 ★
    //   要定义属性的那句话，不该同时给侧别投票 —— 它说的往往是属性的**作用对象**，
    //   不是属性的**归属方**。不挖的话两件事会撞成 `mixed`，而 `mixed` 等于判不出。
    //
    //   真踩过：砂金•戏浪 星魂4「使我方全体造成的伤害**无视敌方目标**#1[i]%的防御力」
    //   命中规则 `/无视[^，。；]{0,14}防御/`，而咬中的那段里带「敌方」，
    //   于是 ALLY(我方) 和 ENEMY(敌方) 双双命中 → `mixed` → `SIDE_UNKNOWN`
    //   → 这条**实打实的 defIgnore 增益**进不了目录。
    //   挖掉之后只剩「使我方全体造成的伤害」→ 干净地判成 ally。
    //   同理「使装备者造成的伤害无视敌方目标#1%的防御力」也从 enemy 翻回 ally。
    //
    //   安全性：ATTR_RULES 里**没有任何一条正则字面量**含「我方/敌方/敌人」
    //   （那些词只出现在规则上方的注释里），所以挖掉命中段不会把规则
    //   自己赖以定侧的线索一起挖走。改完实测全库分桶只动了预期的那几条。
    const span = text.slice(0, mm.index) + text.slice(mm.index + mm[0].length);
    const allyHit = ALLY_SUBJ.test(span);
    const enemyHit = ENEMY_SUBJ.test(span);
    if (allyHit && !enemyHit) { side = 'ally'; sideSource = 'explicit'; }
    else if (enemyHit && !allyHit) { side = 'enemy'; sideSource = 'explicit'; }
    else if (allyHit && enemyHit) { side = 'mixed'; sideSource = 'explicit'; }
    else { side = r.subj; sideSource = 'phrase'; }   // r.subj 来自谓语语义，不是「默认 ally」

    // 元素限定（如「火属性伤害提高」）
    const scope = { ...(r.scope ?? {}) };
    const em = /(火|冰|雷|风|量子|虚数|物理)属性/.exec(text);
    if (em && !scope.element) scope.element = ELEMENT_EN[em[1]];
    // ★ 技能类型限定：捕获组就是中文类型名（「终结技造成的伤害提高」）★
    //   damage.mjs 是按 `agg.abilityDmg[ability.type]` 查表的，所以这里必须转成
    //   库里那套英文枚举，不能把中文直接塞进去 —— 塞进去不会报错，
    //   只是永远查不到、静默算 0。
    //
    // ★ 一句话里可能提到**不止一个**技能类型 ★
    //   「使装备者普攻和战技造成的伤害提高#1%」里，正则只会捕获到**最后**那个
    //   （战技），普攻那一半就被静默丢掉了 —— 数值对、不报错，只是少算一半技能。
    //   实测全库有 9 条这种双类型子句。所以这里扫**全部**提到的类型，而不是只认捕获组。
    if (r.key === 'abilityDmg') {
      const types = [];
      for (const [re, kind] of ABILITY_WORDS) {
        if (re.test(text) && !types.includes(kind)) types.push(kind);
      }
      // 兜底：捕获组认得出但 ABILITY_WORDS 里没列的类型（不该发生，发生了也不能丢）
      if (!types.length && mm[1] && ABILITY_CN[mm[1]]) types.push(ABILITY_CN[mm[1]]);
      if (types.length) scope.abilityTypes = types;
    }
    // ★ 倍率改动：得记住它作用于**哪个技能** ★
    //   丹恒的「终结技造成的伤害倍率提高」只能加在终结技上；
    //   算他的普攻时把它算进去就是静默算高。判不出类型的（「该伤害」「此伤害」）
    //   留 null，表示「就是当前正在算的这个技能」。
    if (MULTIPLIER_KEYS.has(r.key)) {
      scope.abilityKind = deriveAbilityKind(text);
      // 「每层/每点」是**按层数缩放**的，层数只有界面知道 —— 标出来，
      // 否则会按 1 层算然后看着像「这条怎么这么弱」。
      if (/每层|每点|每有1点|每1点|每超过/.test(text)) scope.perStack = true;
    }

    // ★ 取**离关键词最近**的占位符，不是子句里第一个。
    //   银狼天赋「攻击力降低#1[f1]%、防御力降低#2[f1]、速度降低#3[f1]%3种【缺陷】」里，
    //   防御力降低 该配 #2，取第一个会静默算成 #1 —— 数值错了但看不出错。
    const numTok = nearestToken(text, kwAt);
    const isTurn = /回合|层|次|点能量|个/.test(text) && !/%/.test(text);

    // ★ 单位判定：占位符后面没有 % 就是平值 ★
    //   「使我方全体速度提高#1[i]点」曾一律标成 speedPct —— 数值没错（平值就是 12 这种），
    //   但**加到了错误的键上**，面板里乘算变加算，静默偏高。
    //
    //   ★ 判据从「后面紧跟『点』」放宽成「后面没有 %」★
    //     游戏只在真的是百分比时才写 %（渲染器也是看到 % 才把 0.32 显示成 32.0%），
    //     所以「没有 %」本身就是平值的充分条件，「点」只是明写出来的那一种写法。
    //     实测有 3 条是**裸数字**，占位符后面直接跟「，」——
    //       砂金•戏浪 行迹「并使阿哈速度提高#3[i]，速度提高效果持续到阿哈时刻结束」
    //       光锥 23036/23044「使装备者的基础速度提高#1[i]，…」
    //     全都取到了平值 25 / 12，却挂在 speedPct 上，界面上会显示成「+2500%」。
    //
    //   ★ 影响面被 FLAT_OF 卡死 ★ 只有 atk/hp/def/speed 这 4 个键有平值对应，
    //     其余键 `FLAT_OF[key] ?? key` 原样保留。所以放宽这条不会碰到增伤/暴击/易伤。
    //     而且真出意外时的方向也是安全的：把一个百分比误判成平值只是少加一点，
    //     反过来（把平值当百分比）是放大 100 倍。
    let key = r.key;
    let unit = null;
    if (numTok) {
      const tail = /^#\d+\[(?:i|f[1-6])\]%?/.exec(text.slice(numTok.at))?.[0] ?? '';
      if (!tail.endsWith('%')) unit = 'flat';
    }
    if (unit === 'flat') key = FLAT_OF[key] ?? key;

    // ★ 这一子句里除了最近的那个占位符，后面还有别的数值 → 强制人工复核。
    //   实际有两种情况，肉眼一分就清楚，但机器分不清，所以都拦下来：
    //     ① 真·多基数相加：「生命上限提高#3%+#4点」→ 只取最近的会**静默丢掉后半**；
    //     ② 一句话列了多个效果：「攻击力降低#1%、防御力降低#2%、速度降低#3%」
    //        → 最近的那条取对了，但整句只出一条记录，另外两个属性键没被提出。
    const reasons = [];
    if (unit === 'flat') reasons.push('FLAT_UNIT');
    if (numTok) {
      const rest = text.slice(numTok.at);
      const first = TOK_ONE.exec(rest)?.[0] ?? '';
      // 用非全局的 TOK_ONE，避免 `.test()` 在 /g 正则上推进 lastIndex
      if (TOK_ONE.test(rest.slice(first.length))) reasons.push('MULTI_TERM');
    }

    let { target, targetSource } = deriveTarget(text, side, ownerName);
    // ★ 倍率改动**没有「给谁」这一层**，所以 side 和 target 都不是「推导」出来的，
    //   而是**这一类句子的定义** —— 一律强制成「拥有这个技能的这个人自己」★
    //
    //   为什么不能靠推导：
    //     · 丹恒「终结技造成的伤害倍率提高」整句不含自身/我方/敌方任何一个词，
    //       deriveTarget 返回 null → 27 条齐刷刷掉进 TARGET_UNKNOWN，
    //       看起来像「判不出作用对象」，其实是**这类句子根本不问这个问题**；
    //     · 克拉拉「**对敌方目标**造成的伤害倍率提高」含「敌方」，
    //       推导会给出 side=enemy、target=enemy —— 这是个**看着很合理**的答案：
    //       ENEMY_SUBJ 命中了、字段填满了、没有任何报错。但「对敌方目标」说的是
    //       **这个技能打谁**，不是**这个增益给谁**，而它描述的完全是克拉拉自己的
    //       终结技倍率。照推导走会把它摆进界面的「敌方负面」页签，
    //       并且在算伤害时当成敌方的减益 —— 两层都是错的，且都不报错。
    //   语料里 31 条倍率改动**全部**是技能拥有者自拐（已逐条看过），
    //   没有一条是「辅助提高别人技能的倍率」，所以强制成 self/ally 不是权宜，
    //   就是这类句子的真实语义。
    if (MULTIPLIER_KEYS.has(r.key)) {
      target = 'self';
      targetSource = 'ability_owner';
      side = 'ally';
      sideSource = 'ability_owner';
    }

    return {
      key,
      unit,
      op: 'add',
      rawDir: dir,
      side,
      sideSource,
      target,
      targetSource,
      attrSubj: r.subj,
      scope,
      paramIndex: numTok ? numTok.num : null,
      likelyDuration: isTurn,
      reasons,
      condition: extractCondition(text),
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// 分桶（★ 绝不静默的总闸 ★）
// ---------------------------------------------------------------------------

export const BUCKET = {
  /** 能进目录：认得出属性键、侧别、作用对象 */
  PICKABLE: 'PICKABLE',
  /** 属性键和侧别都认得，但判不出「作用于谁」 */
  TARGET_UNKNOWN: 'TARGET_UNKNOWN',
  /** 认得出属性键但判不出给我方还是敌方 —— 绝不默认 ally */
  SIDE_UNKNOWN: 'SIDE_UNKNOWN',
  /** 影响伤害、有数值，但认不出是哪个属性键 —— **以前这类直接消失** */
  NO_ATTR: 'NO_ATTR',
  /** 含「持续伤害」—— v1 有意不算 */
  DOT_EXCLUDED: 'DOT_EXCLUDED',
  /** 有数值但不影响伤害（「持续#1回合」「恢复#1点能量」） */
  DURATION_ONLY: 'DURATION_ONLY',
  /**
   * 有数值、也不是时长，但**根本不是增益**：治疗量 / 段数 / 层数 / 战技点 /
   * 削韧 / 移动速度 / 条件阈值（「暴击率大于等于#2%时」）。
   * 单独立桶的理由见 isNonBuffClause 的注释。
   */
  NON_BUFF: 'NON_BUFF',
  /**
   * 伤害倍率子句 —— **归倍率流水线管，不进增益目录**。
   *
   * ★ 这一桶是审计跑出来的 ★ 第一版没有它，「造成等同于三月七#1[i]%攻击力的冰属性伤害」
   * 因为 `affectsDamage` 为真而全掉进 NO_ATTR，1043 条里绝大多数是它 ——
   * 于是 NO_ATTR 看起来像「有 1043 条增益没认出来」，**把一个假警报堆成了真警报的规模**。
   * 单独立桶之后，NO_ATTR 剩下的才是真正需要补规则的增益子句。
   */
  DAMAGE_TERM: 'DAMAGE_TERM',
  /** 含「击破伤害」—— v1 只算普通伤害，有意不算（与 DoT 同待遇） */
  BREAK_EXCLUDED: 'BREAK_EXCLUDED',
  /**
   * 「附加伤害 = 某倍率的 X%」「真实伤害倍率」—— **另起一段伤害**，不是改既有倍率。
   * v1 不算这类额外伤害段。
   */
  EXTRA_INSTANCE: 'EXTRA_INSTANCE',
  /**
   * 「提高（数值）等同于<某人>面板的#N%」—— 可收录，但**取值方式与别的条目不同**：
   * 它不是「从技能表里查一个数」，而是「来源角色的某一项**面板** × 句中的百分比」。
   *
   * ★ 为什么必须单独立桶，而不是塞进 PICKABLE ★
   *   两者的取值代码路径**完全不同**：PICKABLE 的条目 `catalogValue` 直接 `resolveParam`
   *   就出数；这一类的数**依赖用户填的来源面板**。混在一起的话，「没填面板」和
   *   「面板填了但取了 0」在界面上长得一模一样 —— 又是一次静默。
   *   单独立桶才能让 verify 分开盯：这一桶的每条都要么取得出数、要么带得出「面板没填」。
   *
   * ★ 它的识别规则**不是** `ATTR_RULES` 里的一条 ★
   *   实测这些子句 `matchAttr` 一个都认不出（全落 NO_ATTR）：
   *   句子里那个百分比根本不是增益的数值，而是「面板的几成」。硬写成属性规则
   *   只会得到一条数值看起来合理、实际量纲完全错的记录。
   */
  PANEL_ANCHORED: 'PANEL_ANCHORED',
};

export const BUCKET_ORDER = [
  BUCKET.PICKABLE, BUCKET.PANEL_ANCHORED, BUCKET.TARGET_UNKNOWN, BUCKET.SIDE_UNKNOWN,
  BUCKET.NO_ATTR, BUCKET.DOT_EXCLUDED, BUCKET.BREAK_EXCLUDED, BUCKET.EXTRA_INSTANCE,
  BUCKET.NON_BUFF, BUCKET.DURATION_ONLY, BUCKET.DAMAGE_TERM,
];

export const BUCKET_NOTE = {
  PICKABLE: '可收录',
  TARGET_UNKNOWN: '认得出属性和侧别，但判不出作用于谁',
  SIDE_UNKNOWN: '侧别判不出（绝不默认我方）',
  NO_ATTR: '影响伤害、有数值，但认不出属性键 —— 该补规则的就是这一桶',
  DOT_EXCLUDED: '有意不算：持续伤害不在 v1 范围内',
  NON_BUFF: '有数值但不是增益（治疗/段数/层数/条件阈值）',
  DURATION_ONLY: '纯时长/次数/回能，不影响伤害',
  DAMAGE_TERM: '伤害倍率，归倍率流水线（不进增益目录）',
  BREAK_EXCLUDED: '有意不算：击破伤害不在 v1 范围内',
  EXTRA_INSTANCE: '有意不算：附加伤害/真实伤害是另一段伤害',
  PANEL_ANCHORED: '可收录：数值 = 来源角色的某面板项 × 句中百分比（需用户填该面板）',
};

/** 倍率子句的缩放基数关键词。与 extract_buffs.mjs 的 SCALE_KW 同源。 */
const SCALE_KW = ['攻击力', '生命值上限', '生命上限', '防御力'];
/** 「X属性…伤害」——中间允许几个字（「冰属性附加伤害」）。 */
const ELEM_DMG = /(火|冰|雷|风|量子|虚数|物理)属性[^，。；]{0,6}伤害/;

/**
 * 这条子句是不是在描述**伤害倍率**（「造成等同于X#1[i]%攻击力的冰属性伤害」）。
 *
 * 判据是「占位符**紧后面**跟的是缩放基数或元素伤害」—— 不是「句子里有『伤害』」。
 * 后者会把「造成的伤害提高#1%」也吞掉，而那是增益，正是目录要的东西。
 */
export function isDamageTermClause(text) {
  const t = String(text ?? '');
  for (const m of t.matchAll(TOK_G)) {
    // ★ 占位符**之前**是增益/减防动词的，一律不是倍率句 ★
    //   只看「后面跟基数」会把语序反过来的那半类全部误判：
    //     · 「**提高**等同于玲可#1%生命上限+#2的生命上限」—— 这是生命上限增益
    //     · 「**无视**目标#1%的防御力」—— 这是无视防御增益
    //     · 「**提高**数值等同于符玄生命上限的#4%」
    //   `的?` 那个剥离也让「#1%**的**防御力」看起来像「#1%防御力（倍率）」，
    //   两件事叠在一起，就成了「无视防御 46 条命中 0 条」的直接原因。
    //
    //   实测这一道守卫把 50 条子句从 DAMAGE_TERM 里放出来（42 无视 + 8 提高），
    //   分桶守恒式仍成立。放出来之后它们大多落 `NO_ATTR` —— 那是**更诚实**的落点：
    //   「归倍率流水线管」是错的，「认不出这个属性键」是对的。
    const before = t.slice(0, m.index);
    if (/(提高|提升|增加|无视)/.test(before)) continue;
    const after = t.slice(m.index + m[0].length).replace(/^\s*的?\s*/, '');
    if (SCALE_KW.some((k) => after.startsWith(k))) return true;
    if (ELEM_DMG.test(after.slice(0, 14))) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// 面板锚定（「提高数值等同于<某人>面板的#N%」）
// ---------------------------------------------------------------------------

/** 面板词 → `emptyPanel()` 的字段。**长词在前**，免得「生命值上限」被「生命上限」抢掉。 */
const PANEL_WORDS = [
  ['生命值上限', 'hp'], ['生命上限', 'hp'],
  ['暴击伤害', 'critDmg'], ['暴击率', 'critRate'],
  ['击破特攻', 'breakEffect'],
  ['效果命中', 'effectHit'], ['效果抵抗', 'effectRes'],
  ['攻击力', 'atk'], ['防御力', 'def'], ['速度', 'speed'], ['欢愉度', 'elation'],
];

/** 结果侧：面板词 → 目录里的属性键。 */
const RESULT_KEYS = [
  ['生命值上限', 'hpPct'], ['生命上限', 'hpPct'],
  ['暴击伤害', 'critDmg'], ['暴击率', 'critRate'],
  ['击破特攻', 'breakEffect'],
  ['效果命中', 'effectHit'], ['效果抵抗', 'effectRes'],
  ['攻击力', 'atkPct'], ['防御力', 'defPct'], ['速度', 'speedPct'], ['欢愉度', 'elation'],
];

/**
 * 「基数不可用」的写法 —— 分母在库里根本不存在。
 *
 * ★ 宁可**不收**，也绝不静默算一个错的数 ★
 *   这些句子里的百分比是「某个累计量/总量/原伤害的几成」，而那个量
 *   v1 的模型里没有。收进来的话，`catalogValue` 要么返回 null（界面上是一行空数字），
 *   要么有人图省事拿 0 兜底 —— 那就成了「勾了但永远算 0」的假增益。
 */
const PANEL_BASE_UNUSABLE = /之和|累计|消耗总量|原伤害|气氛值|衣匠/;

/**
 * 句中是不是「两个结果并列」—— `#1[i]%/#3[i]%` 这种斜杠写法。
 * 例：波提欧行迹「使自身暴击率/暴击伤害提高，提高数值等同于击破特攻的#1[i]%/#3[i]%」
 * 是**暴击率取#1、暴击伤害取#3**两个独立结果，不是一个数的「百分比+平值」。
 * 按后者算会得到「暴击伤害 += 击破特攻×(#1%+#3)」—— 数值量级看着还挺合理。
 */
const TWO_RESULTS = /#\d+\[[^\]]+\]%\s*\/\s*#\d+\[/;

/**
 * 可以**继承**来的 `targetSource` —— 这些是「句子里真的写了」的档，不是兜底兜出来的。
 *
 * ★ 为什么要把兜底的 `source_owner` 挡在外面 ★
 *   `deriveTarget` 的兜底规则（`如果整句没点名任何人 → 归来源归属者`）是为**自足的子句**
 *   写的，它的注释里举的例子是「攻击力提高#1%」「普攻造成的伤害提高#1%」——
 *   这类句子不写主体是因为主体不言自明。
 *
 *   但面板锚定句的**紧邻上一条**恰恰不是自足句，而是「被补充说明的那个效果」：
 *     【蒙福者】的暴击伤害提高 / 持有【军功】的角色攻击力提高 / 使成为【同袍】的目标攻击力提高
 *     / 【求生反应】的生命上限提高效果额外提高 / 战技的暴击伤害提高效果额外提高
 *   这些句子里的【…】是一个**状态或指定的别人**，兜给归属者全错。
 *   它们以前从没被问过「作用对象是谁」（多半没有占位符，`classifyClause` 直接返回 null），
 *   是这次的回看第一次去问 —— 所以这个坑是新踩出来的，不是既有的。
 *
 *   代价：这 10 条落 `TARGET_UNKNOWN`，要人工表补 `effect.target`。
 *   换来的是**一条都不会算到错的人头上**，且漏收在分桶报表里点得出来。
 */
const INHERIT_TARGET = new Set(['explicit', 'side', 'weak', 'owner_name', 'ability_owner']);

function firstWordIn(seg, words) {
  let best = null;
  for (const [w, f] of words) {
    const i = seg.indexOf(w);
    if (i >= 0 && (best == null || i < best.i)) best = { i, w, f };
  }
  return best;
}
function lastWordIn(seg, words) {
  let best = null;
  for (const [w, f] of words) {
    const i = seg.lastIndexOf(w);
    if (i >= 0 && i + w.length > (best ? best.i + best.w.length : -1)) best = { i, w, f };
  }
  return best;
}

/** 面板锚定子句的形态。**只看结构，不看语义**（语义交给 panelOf）。 */
export function isPanelAnchored(text) {
  return /(提高|提升|增加)(数值)?等同于/.test(String(text ?? ''));
}

/**
 * 从一条面板锚定子句里把「基数 / 吃谁的 / 结果键 / 作用对象 / 参数位」抽出来。
 *
 * 产出直接按 `classifyClause` 的 `hit` 形状给（`key`/`side`/`target`/`paramIndex`），
 * 烘焙脚本那边一行 `cls?.hit?.…` 就能抄走。面板特有的两样（`panel.attr` 吃哪项
 * 面板、`panel.flatParam` 那个平值位）另放在 `panel` 里。
 *
 * ★ 三条规则，每条都是实测逼出来的，改之前先看反例 ★
 *
 * **① 基数 = 第一个占位符**之前**的面板词；没有才取它**之后**的第一个。**
 *   形态 B「等同于**寒鸦速度**的#3%」基数在占位符前；形态 A「等同于符玄**生命上限**的#4%」在后。
 *   关键是「之前优先」—— 杰帕德行迹写的是
 *   「杰帕德提高等同于**自身当前防御力**#1[i]%的**攻击力**」，
 *   只取「占位符之后」会得到 `atk` 而当基数用，正确基数是 `def`。
 *
 * **② 结果键 = 最后一个占位符之后**最后**出现的面板词；没有才**回看紧邻的上一条**。**
 *   「最后」是必须的：玲可 R4「等同于玲可#1%**生命上限**的**攻击力**」里
 *   占位符之后有两个面板词，取第一个会得到 `hpPct`（错），取最后一个才是 `atkPct`。
 *
 *   ⚠ **回看只认紧邻的那一条，不往前搜。** 这是本函数里最容易改错的地方，反例现成：
 *     光锥「这就是我啦！」b2「提高数值等同于装备者防御力的#2[i]%」，
 *     它的结果句是紧邻的 b1「使装备者施放终结技时造成的伤害值提高」（`matchAttr` 读不出 →
 *     看着像「没结果键」）。要是允许往前搜，就会跳过 b1 抓到 b0「使装备者防御力提高#1%」，
 *     得出 `key = defPct` —— 「防御力提高 等同于 防御力的#2%」，循环自指，
 *     数值看着完全合理，实际语义是**伤害值提高**。
 *     光锥「此时恰好」同理（真结果是「治疗量提高」，压根不该收，往前搜会得出 `effectRes`）。
 *     紧邻一条横竖都更对：面板句本来就是**对它上一句的补充说明**，隔一句就不是补充了。
 *
 * **③ 作用对象（side/target）从紧邻上一条继承；句内自己认得出就用自己的。**
 *   收不收取决于这条 —— 判不出来就落 `TARGET_UNKNOWN`，**不是**默默收进来
 *   再在界面上因为 `tabOf` 返回 null 而消失（那是「勾不到也没提示」）。
 *   · 「除自身以外的队友」（大丽花行迹、开拓者 R4）在 v1 里没有对应取值，
 *     判成 `team` 是**替用户猜**，会多算；落 TARGET_UNKNOWN 等人工表裁定才对。
 *   · 星期日终结技从紧邻的【蒙福者】句继承到 `self` —— 那也是错的（实为指定我方单体），
 *     但它错在**被继承的那条**上，是另一个既有问题，不在这里悄悄改。
 *
 * ★ 回看为什么放在**这里**，而不是烘焙脚本里 ★
 *   分桶的守恒式是「每条含数值的子句恰好落一个桶」，而目录的账是
 *   `目录条数 === PICKABLE + PANEL_ANCHORED + humanRescued`。
 *   要是「基数推出来了」判在分类器、而「回看看不看得到结果键」判在烘焙脚本，
 *   两个判据就会分叉：一条子句桶是 PANEL_ANCHORED、却因为回看没找到而没进目录，
 *   账面差 1，而且**只差 1**，最难查。所以判「收不收」的东西全放在这里，
 *   烘焙脚本只负责把已经定下来的东西抄进目录。
 *
 * ★ 还有两个护栏 ★
 *   · 忆灵：依据里含**忆灵**就整条不收。v1 没有忆灵这个概念，分类器会把
 *     「使我方全体忆灵的暴击伤害提高」判成 `target: 'team'` ——
 *     那是把忆灵的增益加到**角色**身上，静默错算。见长夜月战技。
 *   · 基数不可用（`PANEL_BASE_UNUSABLE`）：分母在库里根本不存在，宁可漏收。
 *
 * @param text 子句原文
 * @param ownerBase 来源角色的名字（用于判「吃谁的面板」）
 * @param names 全库角色**显示名**（找「句子里点名的另一个角色」；attr.mjs 不反向依赖 ctx）
 * @param prev 同来源里**前面**的子句原文数组（只用最后一条非空的）
 * @returns {{ok:true, base, who, key, side, target, paramIndex, flatParam, lookedBack, via}
 *          | {ok:false, reason, needTarget?, ...}}  reason 是给人看的，会进分桶报表
 */
export function panelOf(text, { ownerBase = null, names = null, prev = null } = {}) {
  const t = String(text ?? '');
  const m = t.match(/(提高|提升|增加)(数值)?等同于/);
  if (!m) return { ok: false, reason: 'not_panel_anchored' };
  if (TWO_RESULTS.test(t)) return { ok: false, reason: '两个结果并列（#a%/#b%），v1 表达不了' };

  const toks = [...t.matchAll(TOK_G)];
  if (!toks.length) return { ok: false, reason: '无占位符' };
  const first = toks[0];
  const last = toks[toks.length - 1];

  const beforeFirst = t.slice(m.index + m[0].length, first.index);
  const afterFirst = t.slice(first.index + first[0].length);
  const afterLast = t.slice(last.index + last[0].length);

  // ① 基数
  const base = lastWordIn(beforeFirst, PANEL_WORDS) ?? firstWordIn(afterFirst, PANEL_WORDS);
  if (!base) return { ok: false, reason: '认不出基数（等同于后面没有面板词）' };
  if (PANEL_BASE_UNUSABLE.test(t)) return { ok: false, reason: `基数不在库里：${base.w}` };
  // 欢愉度在 emptyPanel() 里恒为 null（库内没有基值），拿它当基数必然取不到数
  if (base.f === 'elation') return { ok: false, reason: '基数是欢愉度，但面板里它恒为 null' };

  // 吃谁的面板：默认是来源角色自己，句子里**点名了别人**才换人。
  // ★ 比的是「最长匹配」而不是逐个 `includes` ★
  //   丹恒•腾荒 的句子里含「丹恒•腾荒」，而库里另有一个角色就叫「丹恒」——
  //   按名单顺序试会先撞上短的那个，把面板来源判成**另一个角色**。
  //   （开拓者这类库里名字是 `{NICKNAME}` 的，会走下面的 fallback 由调用方换成显示名。）
  let who = null;
  if (names?.length) {
    who = names.filter((n) => n && t.includes(n))
      .sort((a, b) => b.length - a.length)[0] ?? null;
  }
  if (ownerBase && t.includes(ownerBase)) who = ownerBase;   // 来源角色自己优先
  if (who == null) who = ownerBase;                          // 光锥/遗器 → 装备者（由调用方换名）

  // ② 结果键：句内优先，其次紧邻上一条
  const paramIndex = Number(first[0].match(/#(\d+)/)[1]);
  const flatParam = last === first ? null : Number(last[0].match(/#(\d+)/)[1]);

  let key = lastWordIn(afterLast, RESULT_KEYS)?.f ?? null;
  let via = key ? 'in_clause' : null;
  let lookedBack = null;

  // 紧邻的上一条**非空**子句 —— 只此一条，理由见函数头 ②
  const neigh = [...(prev ?? [])].reverse().map((p) => String(p ?? '').trim())
    .find((s) => s.length > 0) ?? null;

  let nh = null;
  if (neigh && !isPanelAnchored(neigh)) {
    if (/忆灵/.test(neigh)) {
      return { ok: false, reason: '依据是忆灵（v1 没有忆灵，会被算到角色身上）' };
    }
    nh = matchAttr(neigh, { ownerName: ownerBase });
    if (key == null && nh?.key) { key = nh.key; via = 'neighbour'; lookedBack = neigh; }
  }

  // ③ 侧别：紧邻的 → 本子句的 → 默认我方。
  //   面板锚定句实测 35 条全是增益，一条敌方减益都没有；真冒出带「敌方」的，
  //   宁可判不出也别把方向算反（那是「给敌人的减益」被当成「自己的增益」）。
  let side = nh?.side ?? null;
  if (side == null && !/敌方|敌人/.test(t)) side = 'ally';

  // ③ 作用对象：紧邻那条**说了算**的优先，其次本子句自己。两边都要过 `targetSource` 闸。
  let target = null;
  let targetSource = null;
  if (neigh) {
    const n = deriveTarget(neigh, side, ownerBase);
    if (INHERIT_TARGET.has(n.targetSource)) { target = n.target; targetSource = n.targetSource; }
  }
  if (target == null) {
    const s = deriveTarget(t, side, ownerBase);
    // ★ 本子句这边**多排一个 `owner_name`** ★
    //   两条规则看的是同一个「句中出现角色名」，但角色完全不同：
    //     · 在**紧邻那条**里点名 = 「这增益给谁」（主体）
    //     · 在**本子句**里点名 = 「吃谁的面板」（基数来源）—— 见「等同于刃#1%的生命上限」
    //   所以本子句的 owner_name 推出来的 self 是**基数那人**，不是受益人。
    if (INHERIT_TARGET.has(s.targetSource) && s.targetSource !== 'owner_name') {
      target = s.target; targetSource = s.targetSource;
    }
  }

  // ★ 面板锚定的量**永远是平值**，哪怕结果键那边写着 `%` ★
  //   句子形态是「<某面板项>提高，**提高数值等同于**<某人><另一面板项>的#N%」——
  //   「提高数值等同于」说的就是**增加量**等于 N% 的那一面板项，所以量纲跟着**基数**走，
  //   是一个**绝对值**，不是百分比。
  //   `catalogValue` 那边也正是这么算的：`panel[基数额] × pct + flat`
  //   （见 `core/catalog.mjs:130`）—— 两个端口的量纲是同一套约定。
  //   结果键却常常是 `atkPct` 这一档（句尾写「的攻击力」、或紧邻那条写「攻击力提高」），
  //   于是这个绝对值被当成**百分比**喂进 `inCombatPanel` 的 `out.atk * (1 + atkPct)`：
  //     刻律德菈天赋「持有【军功】的角色攻击力提高，提高数值等同于刻律德菈攻击力的#2%」
  //     满级 #2=24%，她白值 418 → 100.4（**平值**）。当 atkPct 用 → 攻击力 ×101。
  //     同队的知更鸟 #1 更大，×296；再叠玲可/杰帕德/丹恒•腾荒，攻击力能翻几百倍。
  //   `FLAT_OF` 那一支（`unit === 'flat'`，见上）**只认占位符后面没写 `%`** 的形态，
  //   而这一类的占位符后面恰好都带 `%` —— 于是整类漏掉了转换。这里补的就是这个缺口。
  if (key != null) key = FLAT_OF[key] ?? key;

  // `panel` 是这一类**独有**的取值依据：数值 = 来源角色面板的 `attr` 项 × `params[paramIndex]`
  // （`flatParam` 非空时再加它那一项）。`paramIndex` 照旧走通用字段，不另立一份。
  const panel = { attr: base.f, who, flatParam };
  const partial = { base: base.f, baseWord: base.w, who, key, side, target, paramIndex, flatParam, panel };
  if (key == null) return { ok: false, reason: '结果键句内没有、紧邻上一条也认不出', ...partial };
  // ★ 差作用对象 → `TARGET_UNKNOWN`，不是随便兜一个 ★
  //   这一档实测有 10 条，共同点是紧邻那条把作用对象**兜给了来源归属者**
  //   （`targetSource: 'source_owner'`）—— 而那半句根本是个片段，描述的是
  //   【蒙福者】/【军功】/【同袍】这类**状态或指定的别人**，不是归属者自己。
  //   反例现成：星期日终结技紧随「【蒙福者】的暴击伤害提高」，兜成 self 的话
  //   这条**给指定我方单体**的增益就只在「算星期日本人」时才生效 —— 数字偏小、不报错。
  //   落 TARGET_UNKNOWN 可见可数，人工表补一个 `effect.target` 就接回目录。
  if (target == null) {
    return { ok: false, reason: '作用对象只能兜给来源归属者，不可信', needTarget: true, ...partial };
  }
  return { ok: true, ...partial, targetSource, lookedBack, via };
}

/**
 * 把一条子句分到一个桶里。**含数值的子句一条都不能漏。**
 *
 * @returns {{bucket:string, hit:object|null}} 不含数值的子句返回 null（不进守恒式）
 */
export function classifyClause(clauseText, { ownerName = null, names = null, prev = null } = {}) {
  const t = String(clauseText ?? '');
  if (!hasPlaceholder(t)) return null;

  // ★ 倍率子句要先挑出去 ★ 它们归倍率流水线管，不是增益。
  //   判在属性匹配**之前**：倍率子句里「冰属性伤害」也会被 ELEMENT 相关的规则咬住。
  if (isDamageTermClause(t)) return { bucket: BUCKET.DAMAGE_TERM, hit: null };

  // ★ 持续伤害**按子句**排除，不按整段 ★
  //   卡芙卡战技同时有直伤子句和 DoT 子句，按整段排除会把 15 个技能整个丢掉。
  //   要排在倍率之前：DoT 的倍率改动同样不该进目录，而卡芙卡 R6 / 桑博 R6
  //   通篇不写「持续伤害」四个字，只写状态名（触电/风化），所以用 DOT_STATUS。
  if (DOT_STATUS.test(t)) return { bucket: BUCKET.DOT_EXCLUDED, hit: null };

  // 击破伤害 —— v1 明确只算普通伤害，单独立桶（与 DoT 同待遇：有意不算，不是缺数据）
  if (/击破伤害/.test(t)) return { bucket: BUCKET.BREAK_EXCLUDED, hit: null };

  // ★ 「附加伤害 = 某倍率的 X%」「真实伤害倍率」——**不是**倍率改动，是另起一段伤害 ★
  //   瓦尔特 R1「施放普攻造成的附加伤害等同于普攻伤害倍率的#1[i]%」、
  //   景元 R1「提高数值等同于对主目标伤害倍率的#1[i]%」、
  //   昔涟 R2「真实伤害倍率提高#3[i]%」。
  //   这三条都含「倍率」，拿倍率规则去接会得到一条**看起来完全合理**的记录 ——
  //   数值取到了、键也对得上 —— 但算出来的是「把既有技能的倍率改了」，
  //   而实际语义是「多打一段伤害」。错得毫无痕迹，所以必须在倍率之前挑出来。
  //   景元 R1 写的是「提高数值**等同于**对主目标伤害倍率的#1[i]%」，连「附加伤害」
  //   四个字都没有 —— 判据得是「等同于…倍率的」这个结构本身。
  if (/倍率/.test(t) && (/附加伤害|真实伤害/.test(t) || /等同于[^，。；]{0,14}倍率的/.test(t))) {
    return { bucket: BUCKET.EXTRA_INSTANCE, hit: null };
  }

  // ★ 面板锚定：「提高（数值）等同于<某人>面板的#N%」★
  //
  //  ★ 位置讲究 ★
  //    · 在**倍率**之后 —— 景元 R1「提高数值等同于对主目标伤害**倍率**的#1[i]%」
  //      也含「提高数值等同于」，但它归倍率流水线（上面那条 EXTRA_INSTANCE）。
  //      放到前面会把一条「另起一段伤害」记成增益。顺序反过来就对了。
  //    · 在 `isNonBuffClause` **之前** —— 那个函数的 `NON_BUFF_RE` 里就含「等同于」，
  //      当初整个家族（布洛妮娅/花火/星期日的招牌战技）被它一口吞掉，就是这么来的。
  //      放在它前面即是那条豁免：**这里不写第二份正则，顺序就是豁免本身。**
  //      （改 `NON_BUFF_RE` 去开洞是另一条路，但那样洞的宽度得靠新正则把关，
  //       不如直接把整族挑走干净 —— 这一族有自己的推导器，本来也不该走通用非增益判据。）
  //    · 在 `matchAttr` 之前 —— 这是刻意把两条路分开。这些子句 `matchAttr`
  //      一个都认不出（实测全落 NO_ATTR），而**认不出是对的**：
  //      句子里那个百分比不是增益的数值，是「面板的几成」，量纲根本不同。
  //      靠补 ATTR_RULES 去救，只会得到一条数值看着合理、实际全错的记录。
  //
  //  ⚠ 判不出基数/结果键的仍然落 NON_BUFF（和修之前一样），**不是**静默丢弃：
  //    `hit` 带上 reason，分桶报表里点得出来是哪一条、为什么没收。
  //
  //  ⚠ `names`/`prev` 必须由调用方喂全 ★
  //    它们是「吃谁的面板」和「回看结果键」的唯一依据，缺了就退化成 who=来源角色、
  //    结果键找不到 —— 不报错，只是条目静默变少。`build_catalog.mjs` 与
  //    `verify.mjs` 的语料索引是仅有的两个调用点，两边都要传。
  if (isPanelAnchored(t)) {
    const p = panelOf(t, { ownerBase: ownerName, names, prev });
    if (p.ok) return { bucket: BUCKET.PANEL_ANCHORED, hit: p };
    // 只差作用对象的 → TARGET_UNKNOWN：分类器认得值、认得键、认得侧别，只是判不出算给谁。
    // 这一桶**不进目录但看得见**，人工表补一个 `effect.target` 就接回来了 ——
    // 和阮•梅/翡翠那两条走的是同一条通路。悄悄按 self 收进来的话，
    // 表现是「勾了、有数字、伤害不对」，比漏收难查得多。
    if (p.needTarget) return { bucket: BUCKET.TARGET_UNKNOWN, hit: p };
    return { bucket: BUCKET.NON_BUFF, hit: { ...p, panelDrop: true } };
  }

  // 治疗/段数/层数/条件阈值 —— 有数字，但不是能勾选的增益
  if (isNonBuffClause(t)) return { bucket: BUCKET.NON_BUFF, hit: null };

  const hit = matchAttr(t, { ownerName });
  if (!hit) {
    // 认不出属性键时，唯一能再分一刀的判据是「它影不影响伤害」——
    // 这个判据在 clauses.mjs 里是构建期和运行期共用的那一个，不要另写。
    return { bucket: affectsDamage(t) ? BUCKET.NO_ATTR : BUCKET.DURATION_ONLY, hit: null };
  }
  if (hit.likelyDuration) return { bucket: BUCKET.DURATION_ONLY, hit };
  if (hit.side == null || hit.side === 'mixed') return { bucket: BUCKET.SIDE_UNKNOWN, hit };
  // ★ 作用对象判不出**不再等于丢弃** ★
  //   实测 319 条里只有 4 条真是侧别判不出；剩下的只是没写「作用于谁」。
  //   判错的代价是分错页签（看得见），和「把 −60% 算成 +60%」不是一个量级 ——
  //   所以这两件事必须分桶、分待遇。
  if (hit.target == null) return { bucket: BUCKET.TARGET_UNKNOWN, hit };
  return { bucket: BUCKET.PICKABLE, hit };
}
