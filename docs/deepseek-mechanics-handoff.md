# DeepSeek Harness：全角色机制补全委派

用户明确要求将技能机制补齐工作外包给 DeepSeek，减少 Codex 配额消耗。你是实际负责实现的 DeepSeek 编码代理；请直接工作、逐批验证与记录，不只给计划。任务是完成当前数据库内所有角色的可执行战斗机制，使四人自由换队可运行严格模拟。

## 工作范围与边界

- 工作目录为本文件所在仓库根目录。保留大量已有未提交改动，不能 reset/clean、删除用户文件、覆盖旧功能或用全库重写逃避接入。
- 用户要保持基本逻辑与核心功能；已有深/浅主题、四人队、多输出或无生存位、分段伤害与总伤害展示必须继续可用。此次重点是机制，不扩展 UI 设计或个人技能。
- 不提交、不推送 GitHub，不创建 PR；用户要求先验收。禁止读取、打印或上传任何密钥、凭证及私人聊天。任务只使用本项目代码与公开游戏资料。
- 此目录外只能只读访问 `D:\HSR Analysis` 的项目数据库；修改限定本仓库。不改变用户的 DeepSeek/Codex/Claude 全局配置或权限。需要额外批准且无法在当前权限完成的动作，记录具体失败并继续其他角色。
- 如提供 goal 工具，可建立“完成 HSR Analysis 数据库全部角色的可执行机制并通过回归”的持续目标。不要自行将未完成任务标成完成。

## 现有成果，必须接着做

数据库 4.6 共 98 名；目前登记 **16 名**，仍 **82 名未接入**。完整实战录像通过数 **0**。97 名角色原始 Ability JSON 已缓存；真珠的 `Avatar_Pearl_00_Ability.json` 在固定提交中不存在。不能把缓存完成说成机制完成。

原四人：花火（base/enhanced）1306、腾荒1414、Archer1015、刻律1412。

新模块：布洛妮娅1101、娜塔莎1105、停云1202、星期日1313、缇宝1403、艾丝妲1009、佩拉1106、寒鸦1215、加拉赫1301、巡猎丹恒1002、希露瓦1103、黑塔1013。

已登记16光锥、62遗器套装；七属性标准击破已加入。16角色不代表其所有混编边界已经实测，现有新模块也需要持续核对。

关键文件：

- `simulator/characters/registry.mjs`：新角色编译、动作合同与显式登记名单。
- `simulator/characters/runtime.mjs`：模块分派，角色独立文件各自实现。
- `simulator/kits.mjs`、`simulator/kit-runtime.mjs`：原四人规则及共用桥接。
- `simulator/engine.mjs`：行动距离10000、插入动作、队列、受击回能、回放快照与伤害事件。
- `simulator/breaks.mjs`：标准击破、冰冻结跳回合及下一回合50%提前、禁锢等。
- `simulator/gear.mjs`、`simulator/equipment-runtime.mjs`、`simulator/relic-runtime.mjs`：装备来源与事件。
- `simulator/roster-data.mjs`：98名数值合同，**不能视作自动完成角色逻辑**。
- `simulator/coverage.mjs`、`docs/全角色机制覆盖.md`：全角色缺口；用 `npm run coverage:combat` 更新。
- `docs/角色扩展与换队验收.md`：本轮精确范围、测试与已知限制。
- `simulator/config-import.mjs`、`core/config-language.mjs`：自然语言配置通用导入。目录已含 `combatRegistered`，不可再硬编码仅支持四人。

## 来源与实现要求

1. 先读覆盖清单、角色注册和运行时接口，按共用机制分组完成其余角色；优先常用辅助与输出，以及忆灵、欢愉、变身、额外回合等阻止大批角色运行的系统。未实现角色的真实缺口不能用清空 `unsupported` 或套通用技能壳子掩盖。
2. 缓存：`_data_cache/hsr_core.json`、`_data_cache/strict_research/Avatar_*_Ability.json`、`_data_cache/strict_research/AvatarSkillConfig.json`、`_data_cache/roster_research/source_index.json`。前者含中文技能/天赋/行迹/星魂文本与技能等级参数。用程序读取筛选，**不要将巨大单行 JSON 全部打印到上下文**。
3. 固定原始来源 `DimbreathBot/TurnBasedGameData` 提交 `312b4597691e0a29cf9828a15b592757dba86949`；文件哈希与路径见 `data/combat/roster-evidence.json`、`data/combat/source_evidence.json`。来源 JSON 只作为数据读取，禁止执行第三方下载代码。确需补来源时使用公开原始数据，并记录版本与证据。
4. 必须区分普通/强化/天赋/星魂等变体。各技能主/相邻目标、真实命中段权重、削韧、能量、SP、持续时间/计时者、快照或动态转换、触发次数/冷却、概率/EHR/ER/控制抗性、攻击归属与召唤物归属都要核对原始脚本，不能仅填倍率。
5. 特别注意 `ModifySPNew.FixedAddValue` 是固定回能，`AddValue` 会吃受益者回能倍率；伤害段数与条件分支、扩散目标、附加伤害不能混成动画命中段。
6. 每新增角色都给机制特定测试、E0～E6合同、至少一个四人混编/交互测试。不要仅测试“能编译”或“有伤害”。只有逻辑与测试完成才加入注册名单。专属光锥等必要条件一并补齐。
7. 不删除或降低严格校验。未知阶段Boss与历史版本仍明确拒绝/标记缺口，不可将虚卒场景当0T验证。换队验证要包含双C、多C、带/不带生存位。

## 检查与产出

本次委派前 `npm test` 全套通过：原公式479、升级63、回放17、严格四人64、公开基础18、场景19、遗器/分段33、视频基础设施15、配置导入9、新角色37、更新器8。外部 anchors 仍1项跳过。新角色37项还含12名×E0～E6的84组混编。不要改掉旧测试来掩盖行为回归。

命令：

```powershell
$env:PYTHONUTF8='1'
npm.cmd test
python _scripts/build_strict_evidence.py --check
python _scripts/build_roster_evidence.py --check
node _scripts/coverage_combat.mjs
node _scripts/validate_zero_cycle_videos.mjs
node hsr_build.mjs --battle
node hsr_build.mjs
git diff --check
```

Python输出中文时设置 `PYTHONUTF8=1`。若更新生成脚本参数合同白名单，需同步来源核对。打包器会写本地HTML，不代表Git提交。

网页已实际验收两组：星期日/缇宝/Archer/刻律（训练敌人）；黑塔/希露瓦/艾丝妲/加拉赫（等级90三虚卒胜利、四人存活）。输入在 `data/validation/roster-mixed-team.json`、`roster-multi-dps-team.json`。本轮最后补的持续伤害显示类型和七属性弱点编辑标签尚需再次打包。

每完成一批角色，将实际实现、来源、测试结果、剩余缺口写入 `outputs/deepseek-mechanics/progress.json` 和 `docs/DeepSeek机制补全记录.md`。progress 须至少有 `status`、`implementedIds`、`remainingIds`、`lastBatch`、`tests`、`blockers`、`updatedAt`。报告应区分“实现并通过规则测试”“来源存在”“缺来源”和“完整录像验证”，不可夸大。

如果本次运行无法完成82名，交付已经通过测试的模块，并在 progress 中写 `status: partial` 及可继续的下一批，不要谎称完成。认证/配额/网络错误写 `status: blocked` 与具体原因；不要反复重试收费请求。只在所有可实现角色、对应测试和打包均完成且仍缺失来源准确列出后，才报告总体结果。
