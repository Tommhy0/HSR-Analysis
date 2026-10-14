import { referenceBattle } from '../simulator/profiles.mjs';
import { simulateBattle, compareReplay, validateBattle } from '../simulator/engine.mjs';
import { putAlly, removeUnit, moveUnit } from '../simulator/roster.mjs';
const esc=(s)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n=(v)=>Number.isFinite(v)?v.toLocaleString('zh-CN',{maximumFractionDigits:2}):'—';
const TYPES={battle_start:'开场',turn_start:'回合开始',turn_end:'回合结束',action:'施放',action_end:'动作完成',energy:'能量',damage:'伤害',heal:'治疗',shield:'护盾',buff:'增益',dot:'持续伤害',advance:'行动提前',delay:'行动延后',toughness:'削韧',break:'击破',recover:'恢复韧性',death:'阵亡',skip:'跳过行动',assumption:'未实现规则',cleanse:'净化'};
const download=(name,object)=>{const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(object,null,2)],{type:'application/json'}));a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);};
export function renderSimulator({host,state,importActor}) {
  state.config??=referenceBattle();const c=state.config;
  const paint=()=>renderSimulator({host,state,importActor});
  host.innerHTML=`<h2>战斗模拟试验台 <span class="hint">行动值 / 资源 / 双向交互</span></h2>
    <div class="notice">行动轴按 10000 / 速度计算，终结技和追加攻击插入动作完成后的事件队列；速度变化保留行动进度。严格模式拒绝有未实现机制的配置。基准场景是自定义规则测试，不是已验证的全角色游戏复刻。</div>
    <div class="sim-toolbar"><button class="mini" id="sim-reference">载入规则基准</button><select id="sim-slot" aria-label="要替换的队伍位置">${c.units.filter(u=>u.side==='ally').map(u=>`<option value="${esc(u.id)}"${state.slot===u.id?' selected':''}>替换：${esc(u.name)}</option>`).join('')}</select><button class="mini" id="sim-import">用当前角色替换</button><button class="mini" id="sim-add">当前角色加入队伍</button><button class="mini" id="sim-export">导出配置</button><button class="mini" id="sim-log-export">导出战斗日志</button></div>
    <div class="row"><label class="chk"><input id="sim-strict" type="checkbox"${c.strict?' checked':''}>严格模式：不允许未实现机制</label><label>总行动值</label><input aria-label="模拟总行动值" id="sim-maxav" type="number" min="1" max="3000" value="${c.maxAV}"><label>随机种子</label><input aria-label="模拟随机种子" id="sim-seed" type="number" value="${c.seed}"><select aria-label="模拟暴击方式" id="sim-crit">${[['expected','期望暴击'],['random','逐段随机暴击'],['crit','必定暴击'],['noncrit','不暴击']].map(([k,t])=>`<option value="${k}"${c.critMode===k?' selected':''}>${t}</option>`).join('')}</select></div>
    <p class="faint">${esc(c.description??'配置来自用户输入，需用游戏记录验证。')} · 共享战技点 ${c.sp}/${c.maxSP}</p>
    <div class="row"><label>初始战技点</label><input id="sim-sp" type="number" min="0" max="${c.maxSP}" value="${c.sp}" aria-label="初始战技点"><label>上限</label><input id="sim-maxsp" type="number" min="1" value="${c.maxSP}" aria-label="战技点上限"></div>
    <div class="relic-grid">${c.units.map((u,i)=>renderUnit(u,i,c)).join('')}</div>
    <div class="row"><button class="primary" id="sim-run">运行自动战斗</button><span class="faint">规则改变后重新运行；日志保留每个动作和分段伤害。</span></div>
    <details${state.draft!=null?' open':''}><summary>队伍 / 敌人动作规则编辑与导入（JSON）</summary><p class="faint">最多四名我方。支持 basic / skill / ultimate、分段比例、弹射、治疗、护盾、持续效果、拉条、额外回合与反击。按现有模板修改，点“应用规则”校验。</p><textarea class="sim-config" id="sim-config" aria-label="战斗规则 JSON">${esc(state.draft??JSON.stringify(c,null,2))}</textarea><button class="mini" id="sim-config-apply">应用规则</button></details>
    <details><summary>游戏实测对照</summary><p class="faint">粘贴实测锚点数组，例如 [{"type":"action","actor":"dps","av":74.6269,"occurrence":0}]；伤害事件可加 target 与 damage。它用于校验模拟结果，不会把模拟值冒充实测值。</p><textarea class="sim-config" id="sim-anchors" aria-label="实测锚点 JSON" style="min-height:90px">${esc(JSON.stringify(state.anchors??[],null,2))}</textarea><button class="mini" id="sim-compare">对照当前日志</button><div id="sim-anchor-result"></div></details>
    <div id="sim-stale" class="notice"${state.stale?'':' hidden'}>配置已变化，下方为上次运行结果。请重新运行。</div><div id="sim-output">${state.error?`<div class="notice bad">${esc(state.error)}</div>`:''}${state.result?renderBattleResult(state.result,state.result.config??c):'<div class="empty">运行后查看行动轴、伤害和生存结果。</div>'}</div>`;
  const get=id=>document.getElementById(id);
  const changed=()=>{state.stale=!!state.result;get('sim-stale').hidden=!state.stale;if(state.draft==null)get('sim-config').value=JSON.stringify(c,null,2);};
  get('sim-reference').onclick=()=>{state.config=referenceBattle();state.result=null;state.error=null;state.draft=null;state.stale=false;paint();};
  const editRoster=fn=>{try {state.config=fn();state.stale=!!state.result;state.error=null;state.draft=null;}catch(e){state.error=e.message;}paint();};
  get('sim-slot').onchange=e=>{state.slot=e.target.value;};
  get('sim-import').onclick=()=>editRoster(()=>putAlly(c,importActor(),get('sim-slot').value));
  get('sim-add').onclick=()=>editRoster(()=>putAlly(c,importActor()));
  host.querySelectorAll('[data-remove]').forEach(el=>el.onclick=()=>editRoster(()=>removeUnit(c,c.units[Number(el.dataset.remove)].id)));
  host.querySelectorAll('[data-move]').forEach(el=>el.onclick=()=>editRoster(()=>moveUnit(c,c.units[Number(el.dataset.move)].id,Number(el.dataset.direction))));
  get('sim-export').onclick=()=>download('hsr-battle-config.json',state.config);
  get('sim-log-export').onclick=()=>{if(state.result)download('hsr-battle-log.json',state.result);};
  get('sim-strict').onchange=e=>{c.strict=e.target.checked;changed();};
  get('sim-maxav').onchange=e=>{c.maxAV=Number(e.target.value);changed();};get('sim-seed').onchange=e=>{c.seed=Number(e.target.value);changed();};get('sim-crit').onchange=e=>{c.critMode=e.target.value;changed();};
  get('sim-maxav').oninput=get('sim-maxav').onchange;get('sim-seed').oninput=get('sim-seed').onchange;
  for(const [id,key] of [['sim-sp','sp'],['sim-maxsp','maxSP']]){get(id).oninput=get(id).onchange=e=>{c[key]=Number(e.target.value);changed();};}
  host.querySelectorAll('[data-unit]').forEach(el=>el.onchange=()=>{const u=c.units[Number(el.dataset.unit)],key=el.dataset.key;if(['energy','energyMax','currentHp'].includes(key))u[key]=Number(el.value);else u.panel[key]=Number(el.value);changed();});
  host.querySelectorAll('[data-unit]').forEach(el=>el.oninput=el.onchange);
  host.querySelectorAll('[data-rotation]').forEach(el=>el.oninput=el.onchange=()=>{const u=c.units[Number(el.dataset.rotation)];u.policy??={};const keys=el.value.split(/[,，]/).map(s=>s.trim()).filter(Boolean);if(keys.length)u.policy.rotation=keys;else delete u.policy.rotation;changed();});
  host.querySelectorAll('[data-policy]').forEach(el=>el.onchange=()=>{const u=c.units[Number(el.dataset.policy)];u.policy??={};u.policy.basicOnly=el.value==='basic';if(u.policy.basicOnly)delete u.policy.rotation;changed();paint();});
  host.querySelectorAll('[data-auto-ult]').forEach(el=>el.onchange=()=>{const u=c.units[Number(el.dataset.autoUlt)];u.policy??={};u.policy.autoUltimate=el.checked;changed();});
  host.querySelectorAll('[data-target]').forEach(el=>el.onchange=()=>{const u=c.units[Number(el.dataset.target)];for(const a of Object.values(u.actions))if(!['all','allies','lowestAlly','self'].includes(a.target)){if(el.value)a.targetId=el.value;else delete a.targetId;}changed();});
  get('sim-config').oninput=e=>{state.draft=e.target.value;};
  get('sim-run').onclick=()=>{try {if(state.draft!=null)throw new Error('规则 JSON 尚未应用，请先点击“应用规则”');state.result=simulateBattle(c);state.error=null;}catch(e){state.result=null;state.error=e.message;}state.stale=false;paint();};
  get('sim-config-apply').onclick=()=>{const draft=get('sim-config').value;try{const candidate=JSON.parse(draft),errors=validateBattle(candidate);if(errors.length)throw new Error(errors.join('；'));state.config=candidate;state.result=null;state.error=null;state.draft=null;state.stale=false;paint();}catch(e){state.error=e.message;state.draft=draft;paint();}};
  get('sim-compare').onclick=()=>{try{state.anchors=JSON.parse(get('sim-anchors').value);if(!state.result)throw new Error('请先运行');const rows=compareReplay(state.result,state.anchors);get('sim-anchor-result').innerHTML=rows.map(r=>`<div class="notice${r.ok?'':' bad'}">${esc(r.anchor.actor)} / ${esc(r.anchor.type)}：${r.ok?'通过':esc(r.reason)}；实测 AV ${n(r.anchor.av)} / 模拟 ${n(r.actual?.av)}</div>`).join('')||'<div class="faint">尚无实测锚点。</div>';}catch(e){get('sim-anchor-result').textContent=e.message;}};
}
function renderUnit(u,i,c){
  const same=c.units.filter(t=>t.side===u.side),at=same.findIndex(t=>t.id===u.id),opponents=c.units.filter(t=>t.side!==u.side),target=Object.values(u.actions).find(a=>a.targetId)?.targetId;
  return `<section class="relic-piece"><h3>${esc(u.name)}<span class="hint">${u.side==='ally'?'我方':'敌方'} · 位置 ${at+1}</span></h3><div class="row"><button class="mini" data-move="${i}" data-direction="-1"${at===0?' disabled':''} aria-label="${esc(u.name)}前移">←</button><button class="mini" data-move="${i}" data-direction="1"${at===same.length-1?' disabled':''} aria-label="${esc(u.name)}后移">→</button><button class="mini" data-remove="${i}"${same.length===1?' disabled':''}>移除</button></div>
  <div class="sim-form-grid">${[['hp','生命上限'],['atk','攻击力'],['def','防御力'],['speed','速度']].map(([key,label])=>`<label class="field"><span>${label}</span><input data-unit="${i}" data-key="${key}" type="number" min="${key==='hp'||key==='speed'?1:0}" value="${u.panel[key]}" aria-label="${esc(u.name)}${label}"></label>`).join('')}${[['currentHp','初始生命',u.currentHp??u.panel.hp,u.panel.hp],['energy','初始能量',u.energy??0,u.energyMax??0],['energyMax','能量上限',u.energyMax??0,'']].map(([key,label,value,max])=>`<label class="field"><span>${label}</span><input data-unit="${i}" data-key="${key}" type="number" min="${key==='currentHp'?1:0}"${max!==''?` max="${max}"`:''} value="${value}" aria-label="${esc(u.name)}${label}"></label>`).join('')}</div>
  <div class="row"><label>策略</label><select data-policy="${i}" aria-label="${esc(u.name)}行动策略"><option value="auto"${!u.policy?.basicOnly?' selected':''}>满足资源时使用战技</option><option value="basic"${u.policy?.basicOnly?' selected':''}>仅普攻</option></select>${u.actions.ultimate?`<label class="chk"><input type="checkbox" data-auto-ult="${i}"${u.policy?.autoUltimate!==false?' checked':''}>自动终结技</label>`:''}</div>
  <label class="field"><span>动作循环（留空使用策略）</span><input data-rotation="${i}" value="${esc(u.policy?.rotation?.join(', ')??'')}" placeholder="${u.actions.skill?'skill, basic, basic':'basic'}" aria-label="${esc(u.name)}动作循环"></label><div class="faint">动作键：${Object.keys(u.actions).filter(k=>k!=='ultimate').map(esc).join(' / ')}；资源不足回退至普攻。</div>
  <div class="row"><label>攻击目标</label><select data-target="${i}" aria-label="${esc(u.name)}攻击目标"><option value="">${u.side==='ally'?'第一个存活敌人':'按仇恨随机选择'}</option>${opponents.map(t=>`<option value="${esc(t.id)}"${target===t.id?' selected':''}>${esc(t.name)}</option>`).join('')}</select></div>
  ${u.unsupported?.length?`<div class="notice">待实现：${u.unsupported.map(esc).join('；')}</div>`:''}</section>`;
}
function renderBattleResult(r,c){
  const names=new Map(c.units.map(u=>[u.id,u.name]));
  return `<h3>战斗结果 · ${({victory:'胜利',defeat:'失败',time_limit:'达到行动值上限'})[r.outcome]}</h3><div class="data-kpis"><div class="data-kpi"><b>${n(r.damage)}</b><span>我方总伤害</span></div><div class="data-kpi"><b>${n(r.av)}</b><span>已结算行动值</span></div><div class="data-kpi"><b>${r.units.filter(u=>u.alive&&c.units.find(x=>x.id===u.id).side==='ally').length}</b><span>存活队员</span></div></div>
    ${r.unsupported.length?`<div class="notice">当前为有限机制模型：${r.unsupported.map(esc).join('；')}。不能据此声称与游戏完全一致。</div>`:''}
    <table><thead><tr><th>单位</th><th>剩余生命</th><th>能量</th><th>状态</th></tr></thead><tbody>${r.units.map(u=>`<tr><td>${esc(names.get(u.id))}</td><td>${n(u.hp)}</td><td>${n(u.energy)}</td><td>${u.alive?'存活':'阵亡'}</td></tr>`).join('')}</tbody></table>
    <h3>行动轴 / 结算日志 <span class="hint">${r.log.length} 个事件</span></h3><div class="sim-log"><table><thead><tr><th>AV</th><th>单位</th><th>事件</th><th>目标 / 数值</th><th>战技点</th></tr></thead><tbody>${r.log.map(e=>`<tr><td>${n(e.av)}</td><td>${esc(names.get(e.actor)??'系统')}</td><td>${esc(e.name??TYPES[e.type]??e.type)}${e.kind?`<div class="faint">${esc(e.kind)}</div>`:''}</td><td>${esc(names.get(e.target)??'')}${e.damage!=null?' '+n(e.damage):e.amount!=null?' '+n(e.amount):e.message?' '+esc(e.message):''}${e.absorbed?`<div class="faint">护盾吸收 ${n(e.absorbed)}</div>`:''}</td><td>${e.sp}</td></tr>`).join('')}</tbody></table></div>`;
}
