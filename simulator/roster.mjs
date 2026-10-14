// Roster edits preserve encounter settings and stable slot IDs used by targeting rules.
const clone=value=>JSON.parse(JSON.stringify(value));
export function putAlly(config,actor,slotId=null){
  const out=clone(config),allies=out.units.filter(u=>u.side==='ally');
  if(actor.side!=='ally')throw new Error('只能向队伍添加我方角色');
  if(slotId!=null&&!allies.some(u=>u.id===slotId))throw new Error('替换位置不存在');
  if(actor.characterId!=null&&allies.some(u=>u.id!==slotId&&u.characterId===actor.characterId))throw new Error('同一角色不能重复加入队伍');
  if(slotId==null&&allies.length>=4)throw new Error('队伍已满：最多四名角色，请选择替换位置');
  const next=clone(actor);
  if(slotId!=null){next.id=slotId;out.units[out.units.findIndex(u=>u.id===slotId)]=next;}
  else {
    if(out.units.some(u=>u.id===next.id))throw new Error('单位 ID 重复');
    const at=out.units.findIndex(u=>u.side==='enemy');out.units.splice(at<0?out.units.length:at,0,next);
  }
  return out;
}
export function removeUnit(config,id){
  const out=clone(config),unit=out.units.find(u=>u.id===id);
  if(!unit)throw new Error('单位不存在');
  if(out.units.filter(u=>u.side===unit.side).length<=1)throw new Error('每个阵营至少保留一个单位');
  for(const u of out.units.filter(u=>u.id!==id))for(const a of Object.values(u.actions)){
    if(a.targetId===id||(a.effects??[]).some(e=>e.targetId===id))throw new Error('其他动作仍引用该单位，请先修改目标');
  }
  out.units=out.units.filter(u=>u.id!==id);return out;
}
export function moveUnit(config,id,direction){
  const out=clone(config),at=out.units.findIndex(u=>u.id===id);
  if(at<0||![-1,1].includes(direction))throw new Error('站位移动无效');
  const side=out.units[at].side,slots=out.units.map((u,i)=>u.side===side?i:-1).filter(i=>i>=0),next=slots[slots.indexOf(at)+direction];
  if(next!=null)[out.units[at],out.units[next]]=[out.units[next],out.units[at]];
  return out;
}
