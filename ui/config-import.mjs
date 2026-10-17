import {prepareTeamImport} from '../simulator/config-import.mjs';
import {CONFIG_SCHEMA} from '../core/config-language.mjs';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={level:'等级',eidolon:'星魂',lightcone:'光锥',lightconeLevel:'光锥等级',superimpose:'叠影',variant:'角色形态',technique:'秘技',levels:'技能等级',sets:'套装',relics:'六件遗器',stats:'面板',policy:'行动策略',energy:'初始能量'};
export function mountTeamImport({host,ctx,getConfig,onApply}){
  if(!host)return;
  let prepared=null,undo=null;
  host.innerHTML=`<summary>AI 配置导入 · 自然语言配装</summary><p>向 AI 描述角色、专武、遗器与面板，让它使用 hsr-config 技能生成配置；可通过导入链接直接带入，也可粘贴或选择 JSON。这里离线校验配置，不联网调用 AI。</p><div class="row"><button id="ai-import-file">选择配置文件</button><input id="ai-import-file-input" type="file" accept=".json,application/json" hidden><button id="ai-import-export">导出当前队伍供 AI 修改</button><button id="ai-import-undo" disabled>撤销上次导入</button></div><details><summary>查看或粘贴配置 JSON</summary><label class="field"><span>AI 生成的队伍配置 JSON</span><textarea id="ai-import-text" aria-label="AI 队伍配置 JSON" rows="7" spellcheck="false" placeholder='{"schema":"hsr-analysis/team-v1","datasetVersion":"4.6","members":[...]}'></textarea></label></details><div class="row"><button id="ai-import-preview">检查并预览配置</button><button id="ai-import-apply" class="primary" disabled>应用导入配置</button></div><div id="ai-import-message" role="status" aria-live="polite"></div><div id="ai-import-summary"></div>`;
  const get=id=>host.querySelector('#'+id),message=(s,bad=false)=>{get('ai-import-message').className='notice '+(bad?'bad':'');get('ai-import-message').textContent=s;};
  const invalidate=()=>{prepared=null;get('ai-import-apply').disabled=true;get('ai-import-summary').innerHTML='';};
  function preview(){invalidate();try{
    let raw=get('ai-import-text').value.trim();if(raw.length>200000)throw new Error('配置文件过大（上限 200 KB）');raw=raw.replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'');
    prepared=prepareTeamImport(ctx,getConfig(),JSON.parse(raw));
    get('ai-import-summary').innerHTML=`<div class="grid config-preview-grid">${prepared.summary.map(s=>`<article class="card"><b>位置 ${s.slot} · ${esc(s.character)} · E${s.eidolon}</b><p>${esc(s.lightcone)} · S${s.superimpose}</p><p>${s.sets.map(esc).join(' / ')||'未选套装'}</p><small>修改：${esc(s.changed.map(k=>labels[k]??k).join('、'))}<br>${esc(s.inherited)}</small><p>生命 ${s.panel.hp.toFixed(0)} · 攻击 ${s.panel.atk.toFixed(1)} · 防御 ${s.panel.def.toFixed(1)} · 速度 ${s.panel.speed.toFixed(3)}<br>输入双暴 ${(s.panel.critRate*100).toFixed(2)}% / ${(s.panel.critDmg*100).toFixed(2)}% · 回能 ${(s.panel.energyRegen*100).toFixed(3)}%</p></article>`).join('')}</div>${prepared.warnings.map(s=>`<p class="notice">${esc(s)}</p>`).join('')}`;
    get('ai-import-apply').disabled=false;message(`校验通过：将修改 ${prepared.summary.length} 名队员。${prepared.unchangedSlots.length?'位置 '+prepared.unchangedSlots.join('、')+' 保持当前配置。':''}预览数值为引擎输入，已排除另行计算的常驻加成。`);
  }catch(e){message('未应用：'+e.message,true);}}
  get('ai-import-text').oninput=invalidate;get('ai-import-preview').onclick=preview;
  get('ai-import-file').onclick=()=>get('ai-import-file-input').click();
  get('ai-import-file-input').onchange=async e=>{invalidate();try{const file=e.target.files[0];if(!file)return;if(file.size>200000)throw new Error('配置文件过大');get('ai-import-text').value=await file.text();preview();}catch(err){message(err.message,true);}finally{e.target.value='';}};
  get('ai-import-apply').onclick=()=>{if(!prepared)return;try{
    // Rebase the same patch on the current state in case the builder changed
    // after the preview. Never apply a stale snapshot over unrelated edits.
    const raw=get('ai-import-text').value.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'');const fresh=prepareTeamImport(ctx,getConfig(),JSON.parse(raw));
    undo=JSON.parse(JSON.stringify(getConfig()));onApply(fresh.config);invalidate();get('ai-import-undo').disabled=false;message('已导入 '+fresh.summary.map(s=>s.character).join('、')+'。可直接运行战斗，也可撤销此次导入。');
  }catch(e){invalidate();message('未应用：'+e.message,true);}};
  get('ai-import-undo').onclick=()=>{if(undo){onApply(undo);undo=null;get('ai-import-undo').disabled=true;invalidate();message('已恢复导入前的战斗配置。');}};
  get('ai-import-export').onclick=()=>{try{
    const members=getConfig().units.filter(u=>u.side==='ally').map((u,i)=>{const b=u.build;if(!b)throw new Error('自定义动作单位尚无可导出的角色配装');return {slot:i+1,character:u.characterId,level:b.level,eidolon:b.eidolon,lightcone:b.lightconeId,lightconeLevel:b.lightconeLevel,superimpose:b.superimpose,variant:b.variant,technique:b.technique,levels:b.levels,sets:b.relicSets,statsBasis:'engine-input',stats:{...Object.fromEntries(['hp','atk','def','speed','critRate','critDmg','breakEffect','effectHit','effectRes','energyRegen','healingBoost'].map(k=>[k,u.panel[k]??0])),elementDmg:u.panel.elemDmg?.[u.element]??0}};});
    const out={schema:CONFIG_SCHEMA,datasetVersion:ctx.data._meta.version,members,notes:['从当前队伍导出；仅包含队员配装，不改变当前敌人及关卡。']},blob=new Blob([JSON.stringify(out,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='hsr-team.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(e){message('导出失败：'+e.message,true);}};
  function fromHash(){if(!location.hash.startsWith('#hsr-config='))return;host.open=true;invalidate();try{if(location.hash.length>600000)throw new Error('导入链接过长');get('ai-import-text').value=decodeURIComponent(location.hash.slice(12));preview();host.scrollIntoView?.({behavior:'smooth'});}catch(e){message(e.message,true);}}
  window.addEventListener('hashchange',fromHash);fromHash();
}
