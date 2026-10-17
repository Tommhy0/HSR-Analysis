// Configure the first Himeko Nova ultimate's controllable Starblazer sequence.
export function withHimekoBeamCount(config,actorId,count){
  if(!Number.isInteger(count)||count<0||count>6)throw new RangeError('姬子光束次数须为 0～6');
  const isExisting=c=>c.actor===actorId&&c.after?.actor===actorId&&c.after?.key==='ultimate'&&c.after?.kind==='ultimate'&&c.after?.occurrence===1&&['beam','pulse'].includes(c.key);
  const other=(config.actionPlan??[]).filter(c=>!isExisting(c));
  const after={actor:actorId,key:'ultimate',kind:'ultimate',occurrence:1};
  const selected=Array.from({length:count},()=>({actor:actorId,key:'beam',after:{...after}}));
  if(count<6)selected.push({actor:actorId,key:'pulse',after:{...after}});
  return {...config,actionPlan:[...other,...selected]};
}
