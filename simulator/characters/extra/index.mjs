// 独立角色模块注册表。
//
// 约定：每个 extra/batchNN.mjs 导出
//   export const IDS=[...]            // 该批仅本文件负责的角色 ID
//   export const factories={id: api=>handlers}
//   export const actions={id: (p,data,{eidolon})=>actions}
// 三者在提交前整体校验；任何一个批次文件出错只记录到 EXTRA_ERRORS，不阻断其它批次。
//
// ★ 为什么是静态 import ★
//   浏览器打包器（hsr_build.mjs）要能解析依赖图，且 core / ui / simulator 不得出现 node: 内置模块。
//   早期版本用 `fs.readdirSync` 在 Node 里自动发现 extra/*.mjs，`node hsr_build.mjs --battle` 会因此
//   引用 `node:fs` 而无法生成战斗包（只在 Node 测试里工作）。改为静态列出后，Node 与浏览器走同一份注册表。
//   新增批次时在下面补一行 import 与一项 MODULES（共享注册表由集成方维护）。
import * as batch04 from './batch04.mjs';
import * as batch05 from './batch05.mjs';
import * as batch06 from './batch06.mjs';
import * as batch07 from './batch07.mjs';
import * as batch08 from './batch08.mjs';
import * as batch09 from './batch09.mjs';
import * as batch10 from './batch10.mjs';
import * as batch11 from './batch11.mjs';
import * as batch12 from './batch12.mjs';
import * as batch13 from './batch13.mjs';
import * as batch14 from './batch14.mjs';
import * as batch15 from './batch15.mjs';
import * as batch16 from './batch16.mjs';
import * as batch17 from './batch17.mjs';

// The standalone bundler collects one declaration per export statement.
// Keep every registry explicit so the HTML exports the action and runtime tables too.
export const EXTRA_IDS=[];
export const EXTRA_FACTORIES={};
export const EXTRA_ACTIONS={};
export const EXTRA_ERRORS=[];
const MODULES=[
  ['batch04.mjs',batch04],['batch05.mjs',batch05],['batch06.mjs',batch06],['batch07.mjs',batch07],
  ['batch08.mjs',batch08],['batch09.mjs',batch09],['batch10.mjs',batch10],['batch11.mjs',batch11],
  ['batch12.mjs',batch12],['batch13.mjs',batch13],['batch14.mjs',batch14],['batch15.mjs',batch15],
  ['batch16.mjs',batch16],['batch17.mjs',batch17],
];
const commit=(file,mod)=>{
  const ids=mod.IDS,fac=mod.factories,act=mod.actions;
  if(!Array.isArray(ids)||!ids.length)throw new Error('缺少非空 IDS');
  if(!fac||typeof fac!=='object')throw new Error('缺少 factories');
  if(!act||typeof act!=='object')throw new Error('缺少 actions');
  for(const id of ids){
    if(!Number.isInteger(id))throw new Error('ID 必须是整数：'+id);
    if(EXTRA_IDS.includes(id))throw new Error('角色 '+id+' 被重复登记');
    if(typeof fac[id]!=='function')throw new Error('角色 '+id+' 缺少工厂函数');
    if(typeof act[id]!=='function')throw new Error('角色 '+id+' 缺少动作表构造器');
  }
  for(const id of ids){EXTRA_IDS.push(id);EXTRA_FACTORIES[id]=fac[id];EXTRA_ACTIONS[id]=act[id];}
};
for(const [file,mod] of MODULES){
  try{commit(file,mod);}
  catch(e){EXTRA_ERRORS.push({file,error:String(e?.message??e)});}
}
