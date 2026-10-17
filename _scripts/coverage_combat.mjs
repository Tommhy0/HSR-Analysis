import fs from 'node:fs';
import {createContext} from '../core/ctx.mjs';
import {combatCoverageSummary} from '../simulator/coverage.mjs';
const ctx=createContext(JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url),'utf8'))),report=combatCoverageSummary(ctx);
fs.mkdirSync('outputs',{recursive:true});fs.writeFileSync('outputs/全角色机制覆盖.json',JSON.stringify(report,null,2)+'\n');
const md=['# 全角色战斗机制覆盖','',`数据库 ${report.dataset}：共 ${report.total} 名；规则已登记 ${report.implemented} 名；未接入 ${report.remaining} 名；已知缺口阻止严格验算 ${report.knownIncomplete} 名。完整实战录像验证通过 ${report.fullyVideoVerified} 名。`,'','数据已下载、倍率能计算和角色机制已实现分别统计，未接入的角色继续阻止严格模拟。','', '| ID | 角色 | 状态 | 原始脚本 | 待补机制 |','|---|---|---|---|---|',...report.characters.map(r=>`| ${r.id} | ${r.name} | ${r.implemented?(r.strictEligible?'已登记规则，待录像':'有限规则，仅近似试算'):'未接入'} | ${r.sourceAvailable?'已缓存':'待补来源'} | ${r.mechanisms.join('；').replaceAll('|','/')} |`)];
fs.writeFileSync('docs/全角色机制覆盖.md',md.join('\n')+'\n');console.log(JSON.stringify({total:report.total,implemented:report.implemented,remaining:report.remaining,registeredCones:report.registeredCones,fullyVideoVerified:report.fullyVideoVerified,registered:report.characters.filter(r=>r.implemented).map(r=>r.name)},null,2));
