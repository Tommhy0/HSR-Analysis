import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createContext} from '../core/ctx.mjs';
import {strictParty} from '../simulator/party.mjs';
import {prepareTeamImport} from '../simulator/config-import.mjs';
import {CHARACTER_ALIASES,SET_ALIASES,CONFIG_SCHEMA} from '../core/config-language.mjs';
import {KIT_IDS,SUPPORTED_CONES} from '../simulator/kits.mjs';
export function compile(input,{base,url='http://localhost:8781/战斗模拟器.html'}={}){
  const ctx=createContext(JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url),'utf8')));
  const result=prepareTeamImport(ctx,base??strictParty(ctx),input);
  const link=url.split('#')[0]+'#hsr-config='+encodeURIComponent(JSON.stringify(input));
  return {...result,link};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const args=process.argv.slice(2),get=key=>{const n=args.indexOf(key);return n<0?null:args[n+1];};
    if(args.includes('--catalog')){
      const d=JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url),'utf8'));console.log(JSON.stringify({schema:CONFIG_SCHEMA,version:d._meta.version,characters:d.characters.map(c=>({id:c.id,name:c.name,path:c.path,combatRegistered:KIT_IDS.includes(c.id)})),lightcones:d.lightcones.map(c=>({id:c.id,name:c.name,path:c.path,combatRegistered:SUPPORTED_CONES.includes(c.id)})),sets:d.relicsets.map(s=>({id:s.id,name:s.name})),characterAliases:CHARACTER_ALIASES,setAliases:SET_ALIASES},null,2));
    }else{
      if(!get('--input')||!get('--output'))throw new Error('用法：node _scripts/compile_team_config.mjs --input intent.json --output outputs/team.json [--base battle.json] [--url http://localhost:8781/战斗模拟器.html]');
      const input=JSON.parse(fs.readFileSync(get('--input'),'utf8').replace(/^\uFEFF/,'')),base=get('--base')?JSON.parse(fs.readFileSync(get('--base'),'utf8')):undefined;
      const result=compile(input,{base,...(get('--url')?{url:get('--url')}:{})}),out=path.resolve(get('--output'));fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(input,null,2)+'\n');fs.writeFileSync(out+'.preview.json',JSON.stringify({summary:result.summary,warnings:result.warnings,unchangedSlots:result.unchangedSlots,base:base?'用户指定战斗配置':'四人专武参考队（仅用于预检，网页会以当前配置重新校验）',link:result.link},null,2)+'\n');
      console.log(JSON.stringify({output:out,preview:out+'.preview.json',link:result.link,members:result.summary.map(s=>({slot:s.slot,character:s.character,changed:s.changed})),warnings:result.warnings},null,2));
    }
  }catch(e){console.error(e.message);process.exitCode=1;}
}
