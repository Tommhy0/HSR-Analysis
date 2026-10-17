# 数据与第三方来源

本项目代码以 AGPL-3.0-only 发布。遗器主副词条数值表来自 [Mar-7th/StarRailRes](https://github.com/Mar-7th/StarRailRes)，其 AGPL-3.0 许可原文保留于 `data/relics/UPSTREAM_LICENSE`；来源树标识与文件 SHA-256 保留于 `data/relics/source.json`。

角色、光锥、技能、遗器套装和敌人快照来自 [nanoka 数据站](https://hsr.nanoka.cc/)，下载源为 `https://static.nanoka.cc/hsr/4.6`。已有赛期与异相仲裁中文资料来自 biligame 星铁 Wiki，原始 Wiki 缓存保留于 `data/wiki`。数据更新时间、缺口和校验结果见 `data/active_database.json` 及《升级与验证报告》。游戏文本和内容的权利属于其原权利人，代码许可不改变这些内容的权利归属。

`_scripts/vendor` 保留原项目的数据库构建器和更新器，并包含本次对异常处理、版本区分、完整性校验和第十期仲裁范围的修正。自研战斗引擎位于 `simulator/`。未复制第三方模拟器代码。

四人严格模式的动作配置事实还参考 [DimbreathBot/TurnBasedGameData](https://github.com/DimbreathBot/TurnBasedGameData/tree/312b4597691e0a29cf9828a15b592757dba86949)，固定于正式版本 `OSPRODWin4.6.0_D16728363_A16704710_L16700845`，提交 `312b4597691e0a29cf9828a15b592757dba86949`。原始 JSON 仅作为数据读取，未执行；文件出处、SHA-256 和提取事实保存在 `data/combat/source_evidence.json`。角色、专武、套装数值表由 `_scripts/build_strict_evidence.py` 从已有数据生成至 `simulator/game-data.mjs`。上述游戏数据仍属于原权利人；本项目代码许可不构成对这些数据的重新授权。规则覆盖及尚未进行游戏实测对拍的边界见 [严格模式规则与验收](docs/严格模式规则与验收.md)。

公开数值验证参考 arkkus 的原始伤害计算实验、bobrokrot 的护盾实验与 KQM / SRL 的行动规则；出处链接、验证类型和范围保存在 `simulator/public-validation.mjs`，说明见 [公开实例验证报告](docs/公开实例验证报告.md)。只转录必要的数值事实并编写本项目的验证逻辑，未复制攻略正文或第三方模拟器实现。基础公式、比例与规则对照不能视作完整四人队伍实战通过。
