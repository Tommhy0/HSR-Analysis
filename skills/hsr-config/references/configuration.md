# 配置格式

```json
{
  "schema": "hsr-analysis/team-v1",
  "datasetVersion": "4.6",
  "members": [
    {"character":"花火","sets":"风翁","statsBasis":"out-of-combat","stats":{"speed":160},"policy":{"allyTargetSlot":3}},
    {"character":"红A","eidolon":0,"lightcone":"专武","superimpose":1},
    {"character":"盾丹","eidolon":0,"lightcone":"专武","superimpose":1},
    {"character":"刻律","eidolon":0,"lightcone":"专武","superimpose":1}
  ],
  "notes": ["示例：未提及的面板、秘技与技能等级沿用当前配置"]
}
```

这份示例是局部补丁，不是完整实战配装，不要替用户直接套用。`slot` 为 1～4；缺省时按当前队伍中该角色定位。可填写数据库全名、ID 或已登记简称。编译器 `--catalog` 返回全量角色、光锥、62 套遗器与已登记简称。

队员字段：`slot, character, level, eidolon, lightcone, lightconeLevel, superimpose, variant, technique, levels, sets, relics, stats, statsBasis, policy, energy`。不接受其他字段，尤其不允许 AI 生成任意技能倍率、buff 或伤害。

- `eidolon` 0～6，`superimpose` 1～5；`lightcone: null` 才是明确不装备。四名已登记角色可用 `专武`。
- `variant: base / enhanced`；强化版目前仅花火。历史录像不能自动套强化花火。
- `levels: {Normal:6,BPSkill:10,Ultra:10,Talent:10}` 填基础技能等级，星魂提升另算。
- `sets` 数组：`[{name:"风套",count:4},{name:"翁瓦克",count:2}]`。允许 `id` 代替 `name`；外圈合计≤4、内圈≤2。`风翁` 与 `风露` 可直接作为字符串。
- `stats`：`hp, atk, def, speed, critRate, critDmg, breakEffect, effectHit, effectRes, energyRegen, healingBoost, elementDmg`。速度为实际数值；双暴、击破、命中、抵抗、治疗和本属性增伤可写百分号。`energyRegen` 是总倍率，不能填 19.44 表示充能绳。
- 局外数值会自动扣除登记的光锥、套装常驻属性，运行时重新加入；不扣战斗中才生效的攻击与光环。诗人四件速度分档及未登记光锥不反推局外面板，改用六件遗器或明确的引擎输入。面板和六件遗器不能同时作为属性来源。
- 新角色完整面板至少包含 `hp,atk,def,speed,critRate,critDmg,energyRegen`。现有角色可只修改部分数值。更换白值来源（等级或光锥）时应给出更新面板或六件遗器。
- `relics` 使用项目 `core/relics.mjs` 的六部位格式，部位 0～5。每件包含 `slot,enabled,rarity,level,initial,main,subs`，副词条 `{property,rolls:[低档次数,中档次数,高档次数]}`；实际属性名、主词条部位、次数规则查项目表。仅给“30词条”不能虚构逐件分布。
- `policy`：`allyTargetSlot,autoUltimate,basicOnly,skillLimit,rotation,turnPlan,maintainBond,ultimateTiming`。录像操作轴可用根 `actionPlan`，格式查项目 `docs/0T录像对照与操作轴.md`。不凭未给的录像时间点编操作轴。
- 根 `unresolved` 必须为空或不填才可应用；`notes` 文本数组展示解释，不能用备注掩盖未解决的配置。

# 黑话的含义与歧义

| 表述 | 解释 |
|---|---|
| 红A / 卫宫 / Archer | Archer 1015 |
| 花 / 花火 | 花火 1306，保留当前形态；原花 / 原版＝base，加强 / 强化＝enhanced |
| 刻律 / 凯撒 | 刻律德菈 1412；“刻”只有阵容上下文明晰才展开 |
| 盾丹 / 腾荒 | 丹恒•腾荒 1414 |
| 饮月 / 龙丹 | 丹恒•饮月 1213，当前严格引擎未完整接入 |
| 红花刻龙 | 本项目四人上下文中是 Archer / 花火 / 刻律德菈 / 丹恒•腾荒；单独“龙”不自动解析 |
| 01 / 0+1 / E0S1 | 零魂专武一叠；角色已确定后才能解释 |
| 00 / 0+0 | 零魂不带专武，仍可能有其他光锥；需具体光锥，不能设为 null |
| 全专 / 都专武 | 各角色对应专武；未指定叠影时保留已有叠影，新增角色才按明确 S1 或询问 |
| 满命 / 满魂 / 六魂 | E6；满叠＝当前光锥 S5，不代表满星魂 |
| 双暴70/180 | 暴击率70%、暴伤180%；满暴面板不应把“有效暴击率”误当局外数值 |
| 风翁 / 风露 | 四风套 + 二翁瓦克 / 二露莎卡 |
| 量子 / 司铎 / 船长 / 隐士 / 都蓝 | 根据 --catalog 查完整套装名和 ID |
| 2速2速 / 2攻2攻 / 散件 | 并不唯一；需指定是哪两套，散件不自动赋套装效果 |
| 充能绳 / 攻击绳 / 速度鞋 | 仅代表一件主词条；未给全套时不能据此推算最终面板 |
| 自拉 / 拉条 / 舞舞舞 / DDD | 机制或光锥简称，不等价于直接把速度面板调高 |
| 0T / 0轮 / 首轮 | 需区分混沌与仲裁；末日分数不是混沌轮数，每波首轮150AV，不等于总战斗150AV |

黑话会随版本变化；未登记词汇用上下文和项目数据库判断，不猜热门新角色。以 `--catalog` 输出的 `combatRegistered` 为当前严格模式角色和光锥名单，不在技能里维护固定名单。数据库能查到名称和倍率不意味着机制已实现；详细进度见项目 `docs/全角色机制覆盖.md`。未登记角色不可通过清空 `unsupported` 绕过校验。

# 直接导入

脚本输出 JSON 文件、`.preview.json` 和导入链接。优先使用当前页面的 URL；`http://localhost:8781/战斗模拟器.html` 是默认预检地址，不保证服务正在运行。链接不会自动应用，网页先展示校验预览；AI 可按用户配置请求点击应用，用户也可以自行查看后点击。

若要沿用当前网页中与参考队不同的配置，网页重新校验是最终依据；不要为了通过 CLI 预检覆盖队伍。可从现有“规则 JSON / 导出配置”取得完整战斗配置，用 `--base battle.json` 预检。顶栏“导出当前队伍供 AI 修改”导出的是可再次导入的成员补丁，不能当作 `--base` 的战斗结构。
