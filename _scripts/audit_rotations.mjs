import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import assert from 'node:assert/strict';
import {simulateBattle} from '../simulator/engine.mjs';
import {battleStatistics} from '../simulator/stats.mjs';

// Reuse the original study's exact panels, encounters, mode and seed.
const source=process.argv[2];if(!source)throw Error('Usage: node _scripts/audit_rotations.mjs <study directory>');
const out=path.resolve('outputs/手法复核-20261021');fs.mkdirSync(out,{recursive:true});
const seed='20261021',runs=[];
for(const dir of ['replays','failure-inputs'])for(const name of fs.readdirSync(path.join(source,dir))){
  if(!name.includes('--'+seed+'.'))continue;
  runs.push({dir,name});
}
const results=[];
for(const run of runs){
  const raw=fs.readFileSync(path.join(source,run.dir,run.name));
  const stored=JSON.parse(run.name.endsWith('.gz')?zlib.gunzipSync(raw):raw);
  const config=run.dir==='replays'?stored.config:stored;
  try{
    const r=simulateBattle(config),stats=battleStatistics(r),sum=stats.reduce((n,e)=>n+e.damage,0);
    assert.ok(Math.abs(sum-r.damage)<Math.max(1e-5,r.damage*1e-12),'damage accounting mismatch');
    assert.ok(r.log.filter(e=>e.type==='damage').every(e=>Number.isFinite(e.damage)&&e.damage>=0),'invalid damage');
    const actions=r.log.filter(e=>e.type==='action');
    const policyCounts=config.units.filter(u=>u.side==='ally').map(u=>({name:u.name,id:u.characterId,
      normal:actions.filter(e=>e.actor===u.id&&e.kind==='normal').map(e=>e.key),
      ultimates:actions.filter(e=>e.actor===u.id&&e.key==='ultimate').length}));
    results.push({file:run.name,ok:true,accuracy:r.accuracy,outcome:r.outcome,av:r.av,damage:r.damage,policyCounts,stats});
    if(run.name.includes('--single--')){
      const team=run.name.split('--')[0];
      fs.writeFileSync(path.join(out,team+'.战斗配置.json'),JSON.stringify(config,null,2));
    }
  }catch(e){results.push({file:run.name,ok:false,error:e.stack});}
  if(results.length%12===0||!results.at(-1).ok)console.log(`${results.length}/${runs.length}`,results.at(-1).ok?'PASS':'FAIL',run.name);
  fs.writeFileSync(path.join(out,'队伍复跑结果.json'),JSON.stringify(results,null,2));
  global.gc?.();
}
const summary={runs:results.length,teams:new Set(results.map(e=>e.file.split('--')[0])).size,
  passed:results.filter(r=>r.ok).length,failed:results.filter(r=>!r.ok),
  outcomes:results.reduce((counts,r)=>(counts[r.outcome??'error']=(counts[r.outcome??'error']??0)+1,counts),{})};
fs.writeFileSync(path.join(out,'复跑摘要.json'),JSON.stringify(summary,null,2));
console.log(JSON.stringify(summary));if(summary.failed.length)process.exitCode=1;
