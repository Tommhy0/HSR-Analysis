# 数据与第三方来源

本项目代码以 AGPL-3.0-only 发布。遗器主副词条数值表来自 [Mar-7th/StarRailRes](https://github.com/Mar-7th/StarRailRes)，其 AGPL-3.0 许可原文保留于 `data/relics/UPSTREAM_LICENSE`；来源树标识与文件 SHA-256 保留于 `data/relics/source.json`。

角色、光锥、技能、遗器套装和敌人快照来自 [nanoka 数据站](https://hsr.nanoka.cc/)，下载源为 `https://static.nanoka.cc/hsr/4.6`。已有赛期与异相仲裁中文资料来自 biligame 星铁 Wiki，原始 Wiki 缓存保留于 `data/wiki`。数据更新时间、缺口和校验结果见 `data/active_database.json` 及《升级与验证报告》。游戏文本和内容的权利属于其原权利人，代码许可不改变这些内容的权利归属。

`_scripts/vendor` 保留原项目的数据库构建器和更新器，并包含本次对异常处理、版本区分、完整性校验和第十期仲裁范围的修正。自研战斗引擎位于 `simulator/`。未复制第三方模拟器代码。
