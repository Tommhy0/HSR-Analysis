import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const d=JSON.parse(fs.readFileSync(path.join(root,'_data_cache/hsr_core.json'),'utf8'));
const inv=JSON.parse(fs.readFileSync(path.join(root,'_data_cache/database_inventory.json'),'utf8'));
const a=d.dataReport;
const lines=[
  '# 深色工作台重设计与数据库检查','',
  '原有伤害公式、面板输入、自身/辅助增益逐条选择、敌人情境、暴击口径、血量与配队对比保持。新版仍是零外部依赖的离线单文件 HTML。','',
  '## 新界面','',
  '- 左侧四个工作区：角色与输出、增益管理、战斗情境、数据与来源。',
  '- 右侧结果独立显示期望、必暴、非暴击与目标；乘区、来源与缺口默认折叠。',
  '- 切换工作区保留配置；输入改变后标记待重新计算。',
  '- 数据缺失、自动解析、未建模的机制与缺少实测分别说明。','',
  '## 本地数据库检查','',
  '| 数据库 | 表数（含系统表） | 结论 |','|---|---:|---|',
];
for(const [i,x] of inv.entries()){
  const note=i<2?'角色、技能、三深渊关键表与另一个4.5副本一致':i<4?'15条伤害技能的完整描述同样缺失':i===4?'接入9期、36关、敌人与机制资料；血量估计未经验证':'属于独立规则环境，不混入常规伤害';
  lines.push(`| ${x.path.replace('D:/HSR Analysis/','')} | ${Object.keys(x.tables).length} | ${note} |`);
}
lines.push('','## 已补齐的部分','',
  `- 角色增益目录：958 → ${d.buffCatalog.length}，新增${a.reviewedAdditions}条经原文与参数表核对的记录。`,
  `- 情境效果：新增${a.scenarioEffects}条，覆盖${a.scenarioSources}个来源。界面逐条勾选，表示本次触发条件成立。`,
  '- 新效果区分我方增伤与敌方易伤，按本次技能类型和伤害属性过滤；普攻、战技并列描述保留所有类型。',
  `- 异相仲裁：${d.peak.seasons.length}期、${d.peak.stages.length}关、${d.peak.monsters.length}条敌人记录以及裁决象限资料。`,
  '- 缺口报表剔除已经补回目录的条目，避免重复报缺。','',
  '## 剩余内容','',`目录中仍保留${a.gaps.length}条未解析原文：`,'',
  '| 类别 | 条数 | 含义 |','|---|---:|---|');
const categories={
  needs_rule:['待完善解析','需要解释作用对象、条件、多效果或上下文'],
  mechanics:['段数/概率/战斗机制','有数据，不能直接等同于可相加的增益'],
  survival_or_break:['生存/击破机制','当前即时普通伤害公式不使用这些量'],
  special_formula:['特殊伤害公式','需要额外基数、累计量或独立模型'],
};
for(const [k,[name,note]] of Object.entries(categories))lines.push(`| ${name} | ${a.gaps.filter(g=>g.category===k).length} | ${note} |`);
lines.push('','目前数据库不足以安全补全的内容：','');
for(const x of a.unavailable)lines.push(`- **${x.name}**：${x.reason}。`);
lines.push('','### 缺完整描述的技能','','| ID | 名称 | 参数情况 |','|---|---|---|');
for(const s of a.missingSkills)lines.push(`| ${s.id} | ${s.name} | ${s.hasParameters?'有参数，缺完整语义':'缺有效倍率参数'} |`);
lines.push('','只有参数数组并不等于知道每项是倍率、次数、阈值或状态加成。未用测试服或货币战争参数替代常规正式服缺项。','',
  '## 验证与备份','',
  '修改前源码、数据和成品位于 `_backups/dashboard-redesign-20261013/`。外部数据库通过只读连接打开，未修改。','',
  '```powershell','node _scripts/build_data.mjs','node _scripts/verify.mjs','node _rev.mjs','node hsr_build.mjs','```','',
  '真实浏览器检查了工作区切换、输出计算和情境增益。数值继续通过Node纯函数与打包接线验证；游戏实测锚点为空，该项仍跳过。');
for(const name of ['dashboard_verify.log','dashboard_mutations.log']){
  const file=path.join(root,'_data_cache',name);
  if(fs.existsSync(file)){
    const output=fs.readFileSync(file,'utf8');
    const result=name.includes('mutations')?output.match(/反证 \d+ 个，通过 \d+ 个，失败 \d+ 个/)?.[0]
      :output.match(/断言 \d+ 条，通过 \d+ 条，失败 \d+ 条，跳过 \d+ 条/)?.[0];
    if(result)lines.push('',result+'。');
  }
}
fs.writeFileSync(path.join(root,'数据库检查与新版说明.md'),lines.join('\n'),'utf8');
console.log('数据库检查与新版说明.md');
