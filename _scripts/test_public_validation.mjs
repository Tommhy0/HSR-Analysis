import fs from 'node:fs';
import {runPublicValidation} from '../simulator/public-validation.mjs';
const report=runPublicValidation();
for(const r of report.rows)console.log(`${r.ok?'PASS':'FAIL'} ${r.title}: ${r.actual} / ${r.expected} (±${r.tolerance})`);
if(process.argv.includes('--report')){fs.mkdirSync(new URL('../outputs/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('../outputs/公开实例对照.json',import.meta.url),JSON.stringify(report,null,2)+'\n');}
console.log(`Public validation: ${report.passed} passed, ${report.failed} failed.`);if(report.failed)process.exitCode=1;
