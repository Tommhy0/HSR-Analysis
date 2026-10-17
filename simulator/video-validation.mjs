// A title claiming 0 cycles is a candidate, never an automatically passed test.
import {KIT_IDS} from './kits.mjs';
export function auditVideoCase(c,{datasetVersion='4.6',supportedSystems=[]}={}){
  const reasons=[...(c.missingInputs??[])],missingCharacters=(c.characters??[]).filter(id=>!KIT_IDS.includes(id));
  if(missingCharacters.length)reasons.push('未登记角色机制：'+missingCharacters.join('、'));
  const characterSystems={'tribbie-kit':1403,'silver-wolf-kit':1006};
  const missingSystems=(c.requiredSystems??[]).filter(s=>!supportedSystems.includes(s)&&!KIT_IDS.includes(characterSystems[s]));
  if(missingSystems.length)reasons.push('未登记关卡/操作机制：'+missingSystems.join('、'));
  if(c.gameVersion==null)reasons.push('录像游戏版本尚未确认');
  else if(c.gameVersion!==datasetVersion)reasons.push('录像 '+c.gameVersion+' 与当前数据库 '+datasetVersion+' 不同，须单独冻结历史数值与角色形态');
  if(!(c.observedCheckpoints?.length))reasons.push('尚无从录像抄录的独立数值检查点');
  return {id:c.id,title:c.title,url:c.url,mode:c.mode,status:reasons.length?'blocked':'ready',verified:false,reasons,missingCharacters,missingSystems};
}
export function compareVideoRun(c,result,options={}){
  const audit=auditVideoCase(c,options);if(audit.status!=='ready')return {...audit,rows:[]};
  const rows=(c.observedCheckpoints??[]).map(p=>{
    const events=result.log.filter(e=>e.type===p.type&&(p.actor==null||e.actor===p.actor)&&(p.target==null||e.target===p.target)&&(p.key==null||e.key===p.key)&&(p.kind==null||e.kind===p.kind)&&(p.wave==null||e.wave===p.wave)),e=events[(p.occurrence??1)-1];
    const actual=e?.[p.field],error=typeof actual==='number'&&typeof p.expected==='number'?Math.abs(actual-p.expected):actual===p.expected?0:Infinity;
    return {...p,actual:actual??null,error:Number.isFinite(error)?error:null,ok:error<=(p.tolerance??0)};
  });
  // MoC's first-cycle allowance resets for each wave; elapsed wall time and a
  // simulation cut short at 150 AV do not prove a zero-cycle clear.
  if(c.mode==='moc')rows.push({title:'混沌0T清场',actual:result.log.at(-1)?.cycle,expected:0,ok:result.outcome==='victory'&&result.log.at(-1)?.cycle===0});
  if(result.plan?.unused?.length)rows.push({title:'录像操作轴全部执行',actual:result.plan.unused,expected:[],ok:false});
  const config=result.config??{};
  if(JSON.stringify(config.units?.filter(u=>u.side==='ally'&&!u.memospriteOwner).map(u=>u.characterId))!==JSON.stringify(c.characters))rows.push({title:'录像四人队伍及站位一致',ok:false});
  const ok=rows.length>0&&rows.every(r=>r.ok);return {...audit,status:ok?'passed':'failed',verified:ok,rows,firstDivergence:rows.find(r=>!r.ok)??null};
}
