# 标注表规格

`annotations/` 是本项目**唯一需要人工维护**的目录。别的目录都是生成的：`core/` 是纯计算，
`_scripts/` 是流水线，`_data_cache/` 是导出物。所以要改行为，改这里的表；改格式，先改这份文档。

---

## 0. 三条铁律

**① 不存在的标注 ≠ 0。**
没标注的增益会被记成一条 `Gap` 并在界面上报出来，**不是静默当 0 算**。
"这条技能没有增益效果" 和 "我们还没录这条技能的效果" 是两件事，表里必须能区分：

- 该技能**确实没有**增益 → 什么都不用写（也写不出什么）
- 该技能**有增益但我们没录** → 靠覆盖度探测自动报缺口，不用人写
- 该技能有增益、我们录了**但算不准** → 写进去，`provenance` 标 `partial` / `unknown`

**② 表里永远不写数值，只写"数值从哪个数组的第几项取"。**
技能等级、星魂 R3/R5 的 +2/+1、光锥叠影、遗器件数，全都靠 `param.index` 自动联动。
写死数值这个出口只有一个（`param.literal`），且必须配 `provenance: partial|unknown`——
`verify.mjs` 有断言盯着这条。写死了数值又标 `known`，等级一变就是错的，还查不出来。

**③ 百分比键存的是分数，不是百分数。**
`0.6` 而不是 `60`。描述文本里的 `%` 只影响显示，不影响计算——
`core/damage.mjs` 那边就是 `1 - dmgReduction`，这儿给 60 会算成 `1-60 = -59`，整条公式反号。
**平值键（`*Flat`）存原值**：`速度提高12点` 就是 `12`。

---

## 1. 目录里都是什么

| 文件 | 谁写 | 说明 |
|---|---|---|
| `buffs.jsonl` | 人（含从提案整桶提升） | 增益标注主表。**核心工件** |
| `multipliers.jsonl` | 人 | 倍率人工覆盖。补 `desc` 为空的技能 |
| `sides.json` | 人 | 层标签（`abyss_tags`）的敌我归类种子表 |
| `_proposed.jsonl` | 机器 | 自动提取提案。**下划线开头 = 机器产物，勿手改** |
| `_rejected.jsonl` | 机器 | 复核否决记录，留档防重复提案 |
| `SCHEMA.md` | 人 | 本文件 |

改 `buffs.jsonl` / `multipliers.jsonl` 用 `_scripts/review_buffs.mjs` 的 CLI，别手搓行：

```
node _scripts/review_buffs.mjs --report                 # 按复核桶分组打印
node _scripts/review_buffs.mjs --reason SIDE_INFERRED   # 只看某一桶
node _scripts/review_buffs.mjs --show <id>              # 看单条完整记录
node _scripts/review_buffs.mjs --accept <id>            # 提升进 buffs.jsonl
node _scripts/review_buffs.mjs --reject <id> --why "…"  # 否决，进 _rejected.jsonl
node _scripts/review_buffs.mjs --accept-reason OK       # 整桶提升（仅白名单桶）
```

---

## 2. `buffs.jsonl`

一行一条，JSONL 而非 CSV：`condition` / `scope` 是嵌套结构，CSV 要拍平成 8 个空列，
而且坏行会污染全表的解析。JSONL 行级 diff、坏行只坏一行。

```jsonc
{
  "id": "1101.skill.110203.b0",          // 唯一键。见下方「id 约定」
  "source": { "kind": "skill", "charId": 1101, "skillId": 110203, "skillType": "BPSkill" },
  "param": { "index": 1 },               // 1-based，对应描述里的 #1
  "text": "使我方全体造成的伤害提高#1[i]%，持续2回合。",   // 原文切片，复核时照这个判
  "effect": {
    "key": "dmgBoost",                   // ★ 属性键，见第 4 节
    "op": "add",
    "side": "ally",                      // ally | enemy
    "target": "team",                    // ★ 作用对象，见下方「target 什么时候必须写」
    "unit": null,                        // 'flat' 表示这个数是平值，不是百分比
    "scope": { "element": null, "abilityType": null }
  },
  "direction": 1,                        // 文本极性：提高=1 / 降低=-1。**不进数值**，只供复核
  "condition": { "duration": { "turns": 2 }, "trigger": "on_skill" },  // 可为 null
  "provenance": "known",                 // known | partial | unknown
  "note": ""
}
```

### target 什么时候必须写

`target` 决定这条增益出现在界面的哪个页签下（我方单体 / 我方全体 / 敌方负面）。
平时它由构建期的分类器从原文推出来，**人工记录里可以不写**；但有一种情况**必须写**：

> **分类器判不出作用对象时（`TARGET_UNKNOWN` 桶），人工记录里补一个 `target`，
> 是这条子句回到目录的**唯一**办法。**

被分类器判不出时，它认得属性键、侧别、数值位置 —— **唯独判不出作用于谁**。
而这一项判不出，条目就归不了页签、进不了目录。人工表里写上就是补齐这个缺口。

**⚠ 人工记录是「越过分桶」的，不只是「同 id 时优先」。**
分类器把子句分到哪个桶（DoT / 倍率 / 认不出属性键…）**不构成丢弃人工记录的理由**：
那条记录是人对这条子句下的判断，规则判不出来只说明规则还不够。
所以人工表里有的，一定进目录（verify 有一条断言盯着：`buffs.jsonl` 里每条都必须在目录里）。

代价是分桶报表里 `PICKABLE` 的计数会**小于**目录条数，差值记在 `stats.humanRescued` 里
（verify 断言 `目录条数 === PICKABLE + humanRescued`）。看到这两个数不相等是**正常的**，
不要把它当成算错。

### 已经裁定过的 `TARGET_UNKNOWN` 家族：「使目标」

分类器只认可**零距离**的先行词，判不出跨子句的指代。所以下面这一族永远落
`TARGET_UNKNOWN`，**必须**靠人工表补 `target` —— 它们不是待修的 bug，是已知边界：

| 条数 | 来源 | 原文 |
|---:|---|---|
| 1 | 停云 · 终结技 | 同时使目标造成的伤害提高`#3[i]`% |
| 2 | 星期日 · 天赋 / 秘技 | 使目标的暴击率提高`#1[f1]`% ／ 使目标造成的伤害提高`#1[i]`% |
| 1 | 藿藿 · 星魂6 | 使目标造成的伤害提高`#1[i]`% |
| 1 | 星期日 · 星魂1 | 使目标角色造成伤害时无视目标`#2[i]`%的防御力 |
| 2 | 光锥「金血铭刻的时代」/「欢愉满溢祝福」 | 使目标造成的战技伤害提高`#4[f1]`% ／ 使目标欢愉度提高`#2[i]`% |

一律 `"target": "single_ally"`：句中的「目标」是**我方**被施加增益的那一个，
依据是各自前文（「为指定我方单体恢复…」「…对我方目标施放技能时」「装备者对我方单体角色施放战技后」…）。

> **⚠ 「使目标」有两个正当含义，别一律当成己方。**
> `side` 是 `ally` 时「目标」= 被 buff 的我方单体（上表）；
> `side` 是 `enemy` 时「目标」= 被打的敌人（「使目标防御力降低」这类减益）。
> verify 那条断言是**分侧**判的：`side=ally → single_ally/team`，`side=enemy → enemy`。

**⚠ 这 7 条曾经是 `target: "self"`，那是最危险的一种错。**
分类器的代词排除表漏了光杆「使目标」，于是辅助的增益被算到**辅助自己**头上：
停云终结技的 +50% 增伤加在停云身上、而不是被 buff 的输出者身上。数字变了、不报错、
看着还挺合理。修它时对账发现 `PICKABLE` 从 902 **掉到 895**（正好 −7）、
`humanRescued` 从 2 **涨到 9**（正好 +7），目录总数纹丝不动 ——
「总数不变、只是换了个桶」这个形状就是「它们原先确实在目录里、只是算到了错的人头上」的铁证。
verify 有一条反向闸门盯着它不许长回来（含「使目标」的子句里不许有一条被判成 `self`）。

### 人工记录里**只写人真正判断的那一项**

其余字段跟着分类器走，**不要照抄一遍**。照抄的害处是它会被**冻结**：
分类器以后改好了（比如认出了 `scope`、换了更准的属性键），人工表里那份旧值会把它盖回去，
而界面上看不出任何异常。

具体两条：

- **`effect.scope` 宁可整项省略。** `build_catalog` 读的是
  `h?.effect?.scope ?? cls?.hit?.scope ?? {}` —— 省略时用分类器判出来的（比如
  「使目标造成的**战技**伤害提高」自动带上 `abilityTypes: ["BPSkill"]`）；
  写个 `{}` 是**非空值**，`??` 不会穿透，于是把分类器的结果**覆盖成空**。
  要写就写对、写全，否则别写。
- **`key` / `side` / `param.index` 分类器已经判对时不必写。** 写了不报错，
  但会被那条「显式写了属性键的记录，键与语料一致」的断言盯着 —— 分类器一改，
  人工表就得跟着改，白白多一处维护点。**只补它判不出的那一项**（绝大多数时候就是 `target`）。

---

### id 约定

`<charId>.skill.<skillId>.b<n>` —— **n 是该技能内的子句序号**，不是全局计数器。
（早先用过全局计数器，结果提取器一改动，已提升记录的 id 就整体错位，
而两张表是按 id 关联的，等于表烂了还看不出来。`verify.mjs` 有"没有孤儿 id"的断言盯着。）

**基础 id 由 `core/buffs.mjs` 的 `sourcesOfCharacter()` 生成，标注的 id 必须能在它产出的集合里找到。**
一个来源可以带多条标注 —— 所以是「基础 id」加 `.b<n>` 子句后缀，取用时按基础 id 归组：

```
<charId>.skill.<skillId>           技能（基础 id）
<charId>.skill.<skillId>.b<n>      技能描述里的第 n 个增益子句  ← 提取器产出这种
<charId>.trace.<pointId>           行迹（属性节点）
<charId>.rank.<rankId>             星魂
lc.<lcId>                          光锥
relic.<setId>.set2 / .set4         遗器套装
abyss.<mode>.<seasonId>.<floorId>… 三深渊（见第 6 节）
```

看某个角色有哪些基础 id：

```js
import { sourcesOfCharacter } from './core/buffs.mjs';
sourcesOfCharacter(ctx, 1314, {}).map(s => s.id)
```

> **踩过的坑**：`sourcesOfCharacter` 发的是 `1101.skill.110203`（不带子句后缀），
> 而提取器写的是 `1101.skill.110203.b0`。两边对不上时，`collectBuffs` 一条标注都取不到，
> 但界面上只会显示「没有增益」——**看起来像这个角色本来就没增益**。
> `verify.mjs` 第 5.5 节有两断言盯着：标注 id 的**基础部分**必须在全部来源 id 集合里，
> 且「至少有一个角色因为标注表而多出增益」。

### id 必须**含角色/来源标识**，不能只写 `rank.2`

因为要把同一条标注在多个角色间比对。`1101.rank.2` 一眼看出是布洛妮娅二魂。

---

## 3. `source` 与取值路径

`valueOf()` 按 `source.kind` 走不同的取值路径。**这是整套表能自动联动的关键。**

| `source.kind` | 附加字段 | 取值路径 | 自动联动 |
|---|---|---|---|
| `skill` | `charId` `skillId` `skillType` | `params_json[effLevel].param_list[index-1]` | 技能等级 + 星魂 R3/R5 的 +2/+1 |
| `trace` | `charId` `pointId`（可选 `propertyType`） | 优先按 `property_type` 匹配 `status_add_list_json`，否则 `params[index-1]` | 星魂解锁 |
| `eidolon` | `charId` `rankId` | `character_ranks.param_list_json[index-1]` | 星魂数 |
| `lightcone` | `lcId` | `skill_params_json[叠影].param_list[index-1]` | 叠影 1~5 |
| `relicset` | `setId` `piece`(2\|4) | `set2/set4_params_json[index-1]` | 件数 |
| `literal` | `value` | 直接用 `source.value` | 无。**必须配 `provenance: partial\|unknown`** |

`skill` 类**必须**带 `skillType`（`Normal` / `BPSkill` / `Ultra` / `Talent` / `ElationDamage`），
否则 `effectiveSkillLevel` 不知道该被星魂 R3 的那半句加成。
数据库里 `type` 为 NULL 表示天赋，表里统一写 `"Talent"`，由 `ctx` 做别名映射。

> **R3/R5 的坑**：星魂"技能等级+2 / +1"的 `param_list_json` 是 97/97 全空，
> 那句话只存在于 `desc` 散文里，必须正则解析。漏掉的话倍率系统性偏低 6~12%，
> **且所有角色一致偏低**，看起来像校准问题而不是 bug。

---

## 4. 属性键枚举

写错的键**不会被吞掉**——`aggregate()` 会把未知键报成一条 `unknown` 缺口。
但也别写错，因为那会平白多一条噪声。

**百分比类**（存分数）：

| 键 | 含义 | 落哪个乘区 |
|---|---|---|
| `atkPct` `hpPct` `defPct` `speedPct` | 攻/生/防/速 百分比 | 面板 |
| `critRate` `critDmg` | 暴击率 / 暴击伤害 | 暴击 |
| `dmgBoost` | 造成的伤害提高（全局增伤） | 增伤 |
| `elemDmg` | 元素增伤，须配 `scope.element` | 增伤 |
| `abilityDmg` | 技能类型增伤，须配 `scope.abilityType` | 增伤 |
| `resPen` | 抗性穿透，须配 `scope.element`（缺则全属性） | 抗性 |
| `defShred` | 敌方防御力降低 | 防御 |
| `defIgnore` | 无视防御力 | 防御 |
| `vuln` | 敌方受到的伤害提高 | 易伤 |
| `dmgReduction` | 敌方受到的伤害降低 | 减伤 |
| `breakEffect` | 击破特攻 | （v1 不算击破伤害，只记录） |
| `elation` `elationDmg` | 欢愉度相关 | v1 标 unknown |

**平值类**（存原值）：`atkFlat` `hpFlat` `defFlat` `speedFlat`

**其他**：`energyRegen` `effectHit` `effectRes` `abilityMultiplier`
（这几个不进伤害公式，但录下来供界面显示）

> **单位怎么判**：看描述里占位符后面跟的是不是「点」。
> `速度提高#1[i]点` → `speedFlat`；`速度提高#1[i]%` → `speedPct`。
> 这是**确定性**规则，`extract_buffs.mjs` 自动判，`verify.mjs` 有断言兜住
> （凡 key 以 `Flat` 结尾的记录，原文必须真的出现「点」）。判错了量级差十倍还看不出来。

---

## 5. `side` 与方向

`side` 只有 `ally` / `enemy` 两个值，**没有默认值**。判不出就留 `null` 并进 `NO_SIDE` 桶。

```
node _scripts/review_buffs.mjs --reason NO_SIDE     # 这一桶必须逐条看
```

`NO_SIDE` 是把增益算反的唯一入口，`review_buffs.mjs` 拒绝整桶提升它。

**方向由属性键承载，不由 `direction` 承载。** `value` 恒为**正的量级**：

```
增伤  1 + dmgBoost      易伤  1 + vuln
减防  1 - defShred      减伤  1 - dmgReduction
```

`direction` 只记录句子的文本极性（提高=1 / 降低=−1），**不参与计算**。
因为文本极性和"对伤害是正是负"不是一回事：「防御力降低」和「受到的伤害降低」
都叫「降低」，一个增伤一个减伤，按句子极性定符号必然搞反一个。

---

## 6. `sides.json`（三深渊层标签）

**为什么单独一个文件、单独一套机制**：层标签里出现最多的一句是
「首领幻影受到的伤害降低#1[i]%」（152 次）。那是**敌方减伤**，
当成队伍增益用会把 −60% 算成 +60%，方向直接反掉。

层标签按 (期, 层) 各有一份，id 有 640 个，但含数字的**文本形态只有 12 种**——
所以这个文件**按文本片段匹配，不按 id**，才能覆盖到未来新期。

```jsonc
{
  "rules": [
    {
      "id": "abyss.enemy.dmgReduction",
      "contains": ["受到的伤害降低", "受到的伤害额外降低"],   // 字符串或数组
      "effects": [
        { "key": "dmgReduction", "side": "enemy", "op": "add",
          "direction": 1, "provenance": "known", "label": "敌方受到的伤害降低" }
      ]
    },
    { "id": "abyss.ignored.toughness", "contains": "韧性提高", "effects": [] }
  ]
}
```

四条约定：

1. **没匹配到规则的 = 排除并告警**（`default.action: "exclude"`）。宁可漏算，不可算反。
2. **`effects: []` ≠ 没匹配到。** 空数组是"已确认这条标签不影响伤害"（韧性、召唤物血量），
   静默略过、不告警；没匹配到才告警。
3. **`contains` 支持数组**，因为同一语义在数据里有多种写法
   （「受到的伤害降低」/「受到的伤害额外降低」）。
4. **`paramPick: nearest-after`** —— 取匹配片段结束位置**之后最近**的占位符。
   一条标签里可能有多个效果（降低 #1 / 提高 #2），按片段位置各取各的。

`provenance: "unknown"` 的效果**进 `unknownEffects` 而不是 `effects`**，由调用方报缺口。
典型例子：「非对应弱点的属性抗性提高」只对非弱点属性生效，要拿当前攻击属性和敌人弱点比对
才算得准，v1 不静默近似。

---

## 7. `multipliers.jsonl`（倍率人工覆盖）

`desc` 为空的伤害技能（凿破大荒、啼泽雨斩、忍具•降魔花弁…）提取不出倍率。
**绝不猜**——落进 `EMPTY_DESC` 桶，生成空模板待人工补录，界面上**禁用而非归零**
（下拉框里可见但置灰，强选则显示"无法计算"而不是 `0`）。

```jsonc
{
  "id": "1204.skill.120410",
  "charId": 1204, "skillId": 120410, "skillType": "Ultra",
  "terms": [ { "scaling": "atk", "value": 3.0 } ],   // 注意这里 value 是写死的
  "hits": 3,
  "provenance": "manual",
  "note": "从 wiki 补录；分段数为 3"
}
```

这个文件是**唯一允许写死倍率数值**的地方，因此 `provenance` 只能是 `manual` / `unknown`。

`verify.mjs` 断言：`EMPTY_DESC` 桶的条数 === 这个文件里记录数。
**所以这批技能不可能被遗忘**——补录一条，桶里少一条，数字对不上就报错。

### 段数

段数无结构化来源，只在散文里（466 条里仅 21 条提到"额外造成 N 次伤害"）。
多段技能漏算会差 2~8 倍，比倍率错还严重。所以：

- 段数做成**界面上显式可改的字段**，默认 1
- 对那 21 条正则提案，人工确认后写进 `terms[].hits`
- `_trace` 里标 `hits: 'assumed'`（用了默认值）还是 `'parsed'`

---

## 8. 复核桶

`reviewReason` 由 `extract_buffs.mjs` 生成，决定复核优先级。

| 桶 | 含义 | 可否整桶提升 |
|---|---|---|
| `OK` | 主体明确、属性键明确 | ✅ |
| `EXTRA_DAMAGE` | tag 非攻击但描述里确实造成伤害（如花火天赋） | ✅ |
| `FLAT_UNIT` | 占位符后面跟「点」→ 平值键。**确定性改键规则**，非判断题 | ✅ |
| `SIDE_INFERRED` | 主体靠谓语语义推的（句子里没写谁），如「受到的伤害提高」 | ❌ 抽检 |
| `MULTI_TERM` | 一个子句里有多个数值，只提取一条会静默丢掉其余 | ❌ 必看 |
| `DURATION_ONLY` | 多半是「持续#1回合」这类时长，不是属性值 | ❌ 必看 |
| `NO_ATTR` | 找得到数值但认不出属性 | ❌ 必看 |
| `NO_SIDE` | 分不出敌我 | ❌ **必看**，方向性错误的唯一入口 |
| `EMPTY_DESC` | desc 为空，倍率无从提取 → 进 `multipliers.jsonl` | ❌ 逐条补录 |

---

## 9. 覆盖率与三态

`provenance` 三态贯穿到界面：

- `known` —— 有明确出处
- `partial` —— 计入了一部分，还有 N 处未收录，**结果偏低**
- `unknown` —— 没实现或完全没数据，**结果不可信**

每个乘区单独出三态（`_zones`），`overall = worst(...)`。界面上：

- 每区一个色块徽章：绿 `已知` / 黄 `部分（缺 3 处）` / 红 `未知`
- 黄红徽章可点开，列出**缺失条的原文**（不是"未知错误"这种废话）
- 页顶常驻横幅：`⚠ 本次计算有 3 处数值未收录，结果偏低`
- `overall !== known` 时结果数字后加 `*`

**注意**：覆盖率是"我们录了多少"的度量，**不是"对不对"的度量**。
100% 覆盖也不代表数值正确，只代表没有已知的遗漏项。

---

## 10. 验证

改完标注表跑：

```
node _scripts/verify.mjs
```

和标注直接相关的断言：

- 第 5.5 节：`buffs.jsonl` 的 id 全部能回溯到提案（没有孤儿）；
  凡 `Flat` 键的记录原文必须真的出现「点」；没有"占位符后紧跟『点』却标 `Pct`"的记录
- 第 5.6 节：全部含数值的层标签都被 `sides.json` 认领，且**没有一条产出 `side: "ally"`**；
  缺文件时返回空规则表而不是抛错；`value` 恒为正
- 写死数值的条目必须配 `provenance: partial|unknown`
- `EMPTY_DESC` 桶条数 === `multipliers.jsonl` 记录数

新增标注时，顺手在 `verify.mjs` 里加一条对应的断言——
**表是人工的，断言是机器的，只有断言能防止它悄悄变坏。**
