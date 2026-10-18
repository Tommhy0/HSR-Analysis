// Runtime capability gates, independent of mutable actor.unsupported or progress reports.
// Remove a blocker only after its implementation and independent regression are accepted.
export const KNOWN_MECHANICS_GAPS=Object.freeze({
  1407:['新蕊溢出、资源型终结技、死龙后援、焰息低血时点、E2秘技/终结召唤、E4受疗与E6实际弱点削韧/击破奖励、焰息阶数跨动作与重召清零、死龙被击倒/反噬/到期结算晦翼、天赋扩散至死龙与生命消耗触发、E2炽意2层、重召清理时限状态已接入；治疗转化边界、其余星魂与完整调度、录像对拍仍未完成'],
  1413:['开场常驻忆灵、E2本体与忆灵暴伤、至暗充能、控制免疫、E4削韧、战技10%生命消耗先于暴伤共享、忆质≥16解除并免疫控制、E1覆盖所有我方忆灵已接入；完整生命周期、剩余忆灵专属脚本与星魂仍未完成'],
  1415:['追忆27存储、24/12门槛、未来交互、创世/岁月/生死/负世/浪漫/诡计/海洋诗篇、真我故事、E4舞曲、门径/理性/天空/律法四篇、律法诗篇随军功迁移、岁月诗篇暴伤16.8%、门径追加攻击额外附加、理性战技次数+3、律法奇袭结束+1充能已接入；赠礼舞曲与星魂后续仍未完成'],
  1501:['自然阿哈行动条、速度、开局笑点/好活、跨波参演与固定额外回合、E6弹射/Point07分档、E6抗穿范围、E2全灭暂存、欢愉技+4爆点已接入；角色其余完整分支尚未完整验收'],
  1506:['银狼LV.999 E2隐藏分阈值只在无敌玩家期间计入并逐次恢复1次强化普攻；E4欢愉技计入基础+5倍笑点；E6全属性弱点；常态/强化欢愉技按150620/150621拆分；盲盒成功后降至当前20%、失败不变并由150621重置；E1结界易伤全队生效；强化普攻每60隐藏分+15%最多2层、持好活当赏时技能伤害转欢愉、控制免疫、E6增笑限定强化普攻；150607波次盲盒固定99好活、150608全灭中断保留段数与盲盒次数并跨波续放、盲盒击杀最后敌人后立即停止、Rank02/续放只延长增益、超超超大剑按本次实际总伤害比例、战技顺风局追加虚数欢愉已接入。150608盲盒触发段位动态哈希仍未映射、专武与跨波细节仍未完成'],
});
export function knownMechanicsGaps(unit){
  return unit?.side==='ally'?[...(KNOWN_MECHANICS_GAPS[unit.characterId]??[])]:[];
}
export function unitMechanicsWarnings(unit){
  return [...new Set([...(unit.unsupported??[]),...knownMechanicsGaps(unit)])];
}
export function battleMechanicsWarnings(config){
  return [...new Set((config.units??[]).flatMap(u=>unitMechanicsWarnings(u).map(w=>u.name+'：'+w)))];
}
