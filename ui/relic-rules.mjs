const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function setDescription(text,params=[]){
  return String(text??'').replace(/<[^>]*>/g,'').replace(/#(\d+)\[(?:i|f\d+)\](%?)/g,(_,n,percent)=>{
    const value=params[Number(n)-1];return Number.isFinite(value)?Number((value*(percent?100:1)).toFixed(4))+percent:'待核参数';
  });
}
export function renderSetRules(catalog,selected){
  const row=(s,count)=>`<article class="relic-rule"><b>${esc(s.name)}${count?' · '+count+' 件':''}</b><p>二件：${esc(setDescription(s.set2Desc,s.set2Params))}</p>${s.set4Desc?`<p${count===2?' class="faint"':''}>四件${count===2?'（未装备）':''}：${esc(setDescription(s.set4Desc,s.set4Params))}</p>`:''}${[133,134].includes(s.id)?'<small class="faint">按数据库技能文案实现；本次固定版本未找到对应触发脚本，时序尚待交叉核验。</small>':''}</article>`;
  return `<section class="equipped-relic-rules" aria-label="所选套装效果">${selected.map(v=>{const s=catalog.find(s=>s.id===v.id);return s?row(s,v.count):'';}).join('')}</section><details class="relic-rule-catalog"><summary>全部 ${catalog.length} 套遗器效果 · ${catalog.filter(s=>s.id<300).length} 外圈 / ${catalog.filter(s=>s.id>=300).length} 内圈</summary><p class="faint">战斗引擎按实际触发事件结算。忆灵、欢愉技、笑点、好活当赏等条件需要对应角色机制提供；装备套装本身不会生成这些资源。</p><div class="relic-rule-list">${catalog.map(s=>row(s)).join('')}</div></details>`;
}
