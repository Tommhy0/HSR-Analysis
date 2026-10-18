import {CONE_TABLES,SET_TABLES} from './game-data.mjs';
export const SUPPORTED_CONES=[23021,23051,23046,23048,21018,21004,21011,21003,22005,23003,23034,23038,20012,21000,21021,21025,23019,23026,23063];
export const SUPPORTED_SETS=Object.keys(SET_TABLES).map(Number);
export function compileGear(ctx,ch,{lightconeId=null,superimpose=1,relicSets=[]}={}){
  const gear={cone:null,sets:[]},unsupported=[];
  if(ctx.data._meta.version!=='4.6')unsupported.push('角色机制尚未核对数据库版本 '+ctx.data._meta.version);
  if(lightconeId){const cone=ctx.lcById.get(lightconeId);if(!cone)throw new Error('光锥不存在');
    if(cone.path===ch.path){const p=cone.skillParams?.[superimpose]?.param_list;if(!p)throw new Error('光锥叠影参数缺失');
      if(SUPPORTED_CONES.includes(lightconeId))gear.cone={id:cone.id,name:cone.name,p,superimpose};else unsupported.push('光锥「'+cone.name+'」的战斗被动未实现');}
  }
  const seen=new Set();let cavern=0,planar=0;
  for(const s of relicSets??[]){if(!s.id||!s.count)continue;const data=ctx.relicsetById.get(Number(s.id));
    if(!data||seen.has(data.id)||![2,4].includes(s.count)||data.id>=300&&s.count!==2)throw new Error('套装配置无效');seen.add(data.id);
    if(data.id<300)cavern+=s.count;else planar+=s.count;
    if(SUPPORTED_SETS.includes(data.id))gear.sets.push({id:data.id,name:data.name,count:s.count,p2:data.set2Params,p4:data.set4Params});else unsupported.push('套装「'+data.name+'」的战斗效果未实现');
  }
  if(cavern>4||planar>2)throw new Error('外圈最多四件，内圈最多两件');return {gear,unsupported};
}
export function validateGear(u){const errors=[];
  if(u.gear?.cone){const c=u.gear.cone,table=CONE_TABLES[c.id];if(!table||JSON.stringify(c.p)!==JSON.stringify(table.params[c.superimpose]?.param_list))errors.push(u.name+'光锥参数与正式服不符');}
  for(const s of u.gear?.sets??[]){const t=SET_TABLES[s.id];if(!t||JSON.stringify(s.p2)!==JSON.stringify(t.p2)||JSON.stringify(s.p4)!==JSON.stringify(t.p4))errors.push(u.name+'套装参数与正式服不符');}
  return errors;
}
