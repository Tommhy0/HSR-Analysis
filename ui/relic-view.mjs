import { RELIC_SLOTS, RELIC_STATS, mainAffixes, subAffixes, mainValue, subValue, maxRelicLevel, validateRelic, relicContributions } from '../core/relics.mjs';
const esc=(s)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const name=(p)=>RELIC_STATS[p]?.[0]??p;
const val=(p,v)=>RELIC_STATS[p]?.[2]?(v*100).toFixed(3)+'%':v.toFixed(3);
const opts=(list,selected)=>list.map(a=>`<option value="${esc(a.property)}"${a.property===selected?' selected':''}>${esc(name(a.property))}</option>`).join('');
export function fillLegalSubs(tables,r) {
  const props=subAffixes(tables,r.rarity).filter(a=>a.property!==r.main);
  const count=Math.min(4,r.initial+Math.floor(r.level/3)), total=r.initial+Math.floor(r.level/3);
  r.subs=props.slice(0,count).map((a,i)=>({property:a.property,rolls:[0,i?1:total-count+1,0]}));
}
export function renderRelics({host,tables,state,onChange,onDraftChange}) {
  if(!tables) {host.innerHTML='<h2>遗器配装</h2><div class="notice">未加载词条表，请重新构建数据。</div>';return;}
  const totals=relicContributions(tables,state.relics);
  host.innerHTML=`<h2>遗器配装 <span class="hint">主副词条 → 局外面板</span></h2>
    <div class="row"><label class="chk"><input id="relic-auto" type="checkbox"${state.relicAuto?' checked':''}>按配装自动计算面板</label><button class="mini" id="relic-apply">重新应用配装</button></div>
    <p class="faint">六个部位分别编辑。副词条以低 / 中 / 高档出现次数输入，包含初始词条与强化；不能与主词条重复，总次数须符合当前等级。自动模式每次从白值重新计算，避免重复叠加。套装效果在增益管理中选择。</p>
    <div class="relic-grid">${state.relics.map((r,i)=>{
      const mains=mainAffixes(tables,r.rarity,r.slot), subs=subAffixes(tables,r.rarity).filter(a=>a.property!==r.main), errors=validateRelic(tables,r);
      return `<section class="relic-piece"><h3>${RELIC_SLOTS[i]}<label class="chk"><input data-relic="${i}" data-key="enabled" type="checkbox"${r.enabled?' checked':''}>装备</label></h3>
      <div class="row"><select aria-label="${RELIC_SLOTS[i]}星级" data-relic="${i}" data-key="rarity">${[5,4,3,2].map(n=>`<option value="${n}"${r.rarity===n?' selected':''}>${n} 星</option>`).join('')}</select><label>强化</label><input aria-label="${RELIC_SLOTS[i]}强化等级" data-relic="${i}" data-key="level" type="number" min="0" max="${maxRelicLevel(r.rarity)}" value="${r.level}"><select aria-label="${RELIC_SLOTS[i]}初始词条" data-relic="${i}" data-key="initial">${[r.rarity-2,r.rarity-1].map(n=>`<option value="${n}"${r.initial===n?' selected':''}>初始 ${n} 词条</option>`).join('')}</select></div>
      <div class="row"><label>主词条</label><select aria-label="${RELIC_SLOTS[i]}主词条" data-relic="${i}" data-key="main">${opts(mains,r.main)}</select><span class="faint">${r.main?val(r.main,mainValue(mains.find(a=>a.property===r.main)??mains[0],r.level)):''}</span></div>
      <div class="relic-sub faint"><span>副词条</span><span>低</span><span>中</span><span>高</span></div>
      ${r.subs.map((s,j)=>`<div class="relic-sub"><select aria-label="${RELIC_SLOTS[i]}副词条${j+1}" data-relic="${i}" data-sub="${j}" data-key="property">${opts(subs,s.property)}</select>${s.rolls.map((n,t)=>`<input aria-label="${RELIC_SLOTS[i]}副词条${j+1}${['低','中','高'][t]}档次数" data-relic="${i}" data-sub="${j}" data-tier="${t}" type="number" min="0" max="6" value="${n}">`).join('')}</div>`).join('')}
      <button class="mini" data-repair="${i}" style="margin-top:10px">按当前等级重置为合法词条</button>
      ${errors.length?`<div class="notice bad">${errors.map(esc).join('；')}</div>`:''}</section>`;
    }).join('')}</div>
    <div class="relic-summary">${totals.ok?`<div class="faint">已装备 ${state.relics.filter(r=>r.enabled).length} 件：${Object.entries(totals.values).map(([p,v])=>esc(name(p))+' '+val(p,v)).join(' · ')||'尚未装备'}</div>`:`<div class="notice bad">${totals.errors.map(esc).join('；')}。修正后才会应用到面板。</div>`}</div>
    <details><summary>查看主词条与副词条数值表 · 来源 StarRailRes</summary><div class="relic-table"><table><thead><tr><th>星级 / 部位</th><th>主词条</th><th>初始</th><th>满级</th></tr></thead><tbody>${[2,3,4,5].flatMap(rarity=>RELIC_SLOTS.flatMap((slot,i)=>mainAffixes(tables,rarity,i).map(a=>`<tr><td>${rarity}★ ${slot}</td><td>${name(a.property)}</td><td>${val(a.property,a.base)}</td><td>${val(a.property,mainValue(a,maxRelicLevel(rarity)))}</td></tr>`))).join('')}</tbody></table><table><thead><tr><th>星级 / 副词条</th><th>低档</th><th>中档</th><th>高档</th></tr></thead><tbody>${[2,3,4,5].flatMap(rarity=>subAffixes(tables,rarity).map(a=>`<tr><td>${rarity}★ ${name(a.property)}</td>${[0,1,2].map(t=>`<td>${val(a.property,subValue(a,[0,1,2].map(x=>x===t?1:0)))}</td>`).join('')}</tr>`)).join('')}</tbody></table></div></details>`;
  host.querySelectorAll('[data-relic]').forEach(el=>el.onchange=()=>{
    const r=state.relics[Number(el.dataset.relic)];
    if(el.dataset.tier!=null) r.subs[Number(el.dataset.sub)].rolls[Number(el.dataset.tier)]=Number(el.value);
    else if(el.dataset.sub!=null) r.subs[Number(el.dataset.sub)].property=el.value;
    else {const k=el.dataset.key;r[k]=k==='enabled'?el.checked:k==='main'?el.value:Number(el.value);
      if(['rarity','level','initial'].includes(k)) {r.level=Math.min(r.level,maxRelicLevel(r.rarity));r.initial=Math.max(r.rarity-2,Math.min(r.rarity-1,r.initial));}
      if(k==='rarity'||k==='enabled'||!r.main){r.main=mainAffixes(tables,r.rarity,r.slot).find(a=>a.property===r.main)?.property??mainAffixes(tables,r.rarity,r.slot)[0].property;if(!r.subs.length||k==='rarity')fillLegalSubs(tables,r);}
    }
    onChange();
  });
  host.querySelectorAll('[data-repair]').forEach(el=>el.onclick=()=>{fillLegalSubs(tables,state.relics[Number(el.dataset.repair)]);onChange();});
  host.querySelectorAll('input[type="number"][data-relic]').forEach(el=>el.oninput=()=>{
    const r=state.relics[Number(el.dataset.relic)];
    if(el.dataset.tier!=null)r.subs[Number(el.dataset.sub)].rolls[Number(el.dataset.tier)]=Number(el.value);
    else r[el.dataset.key]=Number(el.value);
    onDraftChange?.();
  });
  host.querySelector('#relic-auto').onchange=(e)=>{state.relicAuto=e.target.checked;onChange();};
  host.querySelector('#relic-apply').onclick=()=>{state.relicAuto=true;onChange();};
}
