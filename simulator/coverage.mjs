import {knownMechanicsGaps} from './mechanics-status.mjs';
import {KIT_IDS,SUPPORTED_CONES} from './kits.mjs';
import {ROSTER_DATA} from './roster-data.mjs';
import {characterDisplayName} from '../core/ctx.mjs';
export function rosterCoverage(ctx){return ctx.data.characters.map(c=>{
  const implemented=KIT_IDS.includes(c.id),d=ROSTER_DATA[c.id],gaps=knownMechanicsGaps({characterId:c.id,side:'ally'});
  return {id:c.id,name:characterDisplayName(c,ctx.data.characters),implemented,strictEligible:implemented&&!gaps.length,verification:implemented?(gaps.length?'partial-rule-tests; strict-blocked':'rule-tests; full-video-pending'):'not-implemented',sourceAvailable:!!d?.hits||[1015,1306,1412,1414].includes(c.id),
    skills:ctx.data.skills.filter(s=>s.charId===c.id&&['Normal','BPSkill','Ultra','Talent','Maze','ElationDamage','Servant','ServantTalent'].includes(s.type)).map(s=>({id:s.id,name:s.name,type:s.type})),
    mechanisms:implemented?gaps:[...ctx.data.skills.filter(s=>s.charId===c.id&&['Talent','ElationDamage','Servant','ServantTalent'].includes(s.type)).map(s=>s.name),...ctx.data.traces.filter(t=>t.charId===c.id&&t.type===3).map(t=>t.name),'星魂触发与强化动作','秘技 / 专属资源 / 动作时序'],
    equipmentScope:implemented?'仅已登记光锥；全部62套遗器已登记，特殊忆灵 / 欢愉条件依赖对应角色系统':'角色未接入，不能用数据库倍率当完整战斗规则'};
});}
export function combatCoverageSummary(ctx){const rows=rosterCoverage(ctx);return {dataset:ctx.data._meta.version,total:rows.length,implemented:rows.filter(r=>r.implemented).length,remaining:rows.filter(r=>!r.implemented).length,knownIncomplete:rows.filter(r=>r.implemented&&!r.strictEligible).length,fullyVideoVerified:0,registeredCones:SUPPORTED_CONES.length,characters:rows};}
