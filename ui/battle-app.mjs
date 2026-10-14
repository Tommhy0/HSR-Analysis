import { createContext, listCharacters, characterDisplayName } from '../core/ctx.mjs';
import { initTheme } from './theme.mjs';
import { renderSimulator } from './simulator-view.mjs';
import { renderRelics } from './relic-view.mjs';
import { fourMemberBattle } from '../simulator/profiles.mjs';
import { putAlly } from '../simulator/roster.mjs';
import { newBattleBuild, buildBattleActor } from '../simulator/builds.mjs';
import { suggestPanel } from '../core/panel.mjs';
import { applyRelics, relicContributions } from '../core/relics.mjs';
import { validateBattle } from '../simulator/engine.mjs';
const data=window.__HSR_DATA__,ctx=createContext(data),characters=listCharacters(ctx),get=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state={config:fourMemberBattle()},drafts=new Map();let selected=state.config.units[0].id,error=null;
const storageKey='hsr-four-member-battle-v1';
const panelFields=[['hp','生命'],['atk','攻击'],['def','防御'],['speed','速度'],['critRate','暴击率 %'],['critDmg','暴伤 %'],['breakEffect','击破 %'],['effectHit','命中 %'],['effectRes','抵抗 %'],['energyRegen','回能倍率'],['healingBoost','治疗加成 %']];
const percentages=new Set(['critRate','critDmg','breakEffect','effectHit','effectRes','healingBoost']);
function currentUnit(){const allies=state.config.units.filter(u=>u.side==='ally');return allies.find(u=>u.id===selected)??allies[0];}
function currentBuild(u){if(!drafts.has(u.id))drafts.set(u.id,JSON.parse(JSON.stringify(u.build??{...newBattleBuild(),characterId:u.characterId??null,panel:u.panel})));return drafts.get(u.id);}
function preview(build){const base=suggestPanel(ctx,build).panel;return build.relicAuto?applyRelics(base,relicContributions(data.relicTables,build.relics)):build.panel??base;}
function renderBuilder(){
  const u=currentUnit();selected=u.id;const build=currentBuild(u),allies=state.config.units.filter(u=>u.side==='ally');let panel=build.panel??u.panel;
  build.relicDetailsOpen=get('battle-relics')?.closest?.('details')?.open??build.relicDetailsOpen??false;
  try{if(build.characterId)panel=preview(build);}catch(e){error=e.message;}
  get('battle-builder').innerHTML=`<h2>四个独立队员 <span class="hint">配置只应用到当前选中的位置</span></h2><div class="party-tabs">${allies.map((a,i)=>`<button class="party-tab${a.id===selected?' on':''}" data-party="${esc(a.id)}" aria-pressed="${a.id===selected}"><small>队员 ${i+1}</small><strong>${esc(a.name)}</strong></button>`).join('')}</div><div class="row"><label>当前角色</label><select id="battle-character" aria-label="当前位置角色"><option value="">自定义测试单位（在规则 JSON 中编辑动作）</option>${characters.map(ch=>`<option value="${ch.id}"${build.characterId===ch.id?' selected':''}>${esc(characterDisplayName(ch,data.characters))}</option>`).join('')}</select></div>
  <div class="row"><label>等级</label><input id="battle-level" aria-label="当前队员等级" type="number" min="1" max="80" value="${build.level}"><label>星魂</label><select id="battle-eidolon" aria-label="当前队员星魂">${[0,1,2,3,4,5,6].map(e=>`<option value="${e}"${build.eidolon===e?' selected':''}>E${e}</option>`).join('')}</select><label>光锥</label><select id="battle-lc" aria-label="当前队员光锥"><option value="">不装备</option>${data.lightcones.map(l=>`<option value="${l.id}"${build.lightconeId===l.id?' selected':''}>${esc(l.name)}</option>`).join('')}</select><label>光锥等级</label><input id="battle-lc-level" aria-label="当前队员光锥等级" type="number" min="1" max="80" value="${build.lightconeLevel}"><label>叠影</label><select id="battle-super" aria-label="当前队员光锥叠影">${[1,2,3,4,5].map(s=>`<option value="${s}"${build.superimpose===s?' selected':''}>S${s}</option>`).join('')}</select></div>
  <div class="grid">${panelFields.map(([k,label])=>`<label class="field"><span>${label}</span><input aria-label="当前队员${label}" type="number" step="any" data-build-panel="${k}" value="${(panel[k]??0)*(percentages.has(k)?100:1)}"></label>`).join('')}<label class="field"><span>本属性增伤 %</span><input id="battle-element-dmg" aria-label="当前队员本属性增伤" type="number" step="any" value="${(panel.elemDmg?.[ctx.charById.get(build.characterId)?.element??u.element]??0)*100}"></label></div>
  <div class="row"><button class="primary" id="battle-build-apply">应用到这名队员</button><button id="battle-build-base">按白值与遗器重算</button><span class="faint" id="battle-build-note">编辑后需应用；其他三人的配装保持各自独立。</span></div>${error?`<div class="notice bad">${esc(error)}</div>`:''}<p class="faint">角色导入仅接入已解析的基础伤害动作。辅助技能、被动与光锥条件仍有缺口，应用后会列出，严格模式会拒绝未完成的机制。</p><details${build.relicDetailsOpen?' open':''}><summary>当前队员的六件遗器</summary><div id="battle-relics"></div></details>`;
  get('battle-builder').querySelectorAll('[data-party]').forEach(el=>el.onclick=()=>{selected=el.dataset.party;error=null;renderBuilder();});
  get('battle-character').onchange=e=>{build.characterId=e.target.value?Number(e.target.value):null;build.relicAuto=!!build.characterId;build.levels={};error=null;renderBuilder();};
  for(const [id,key] of [['battle-level','level'],['battle-eidolon','eidolon'],['battle-lc','lightconeId'],['battle-lc-level','lightconeLevel'],['battle-super','superimpose']])get(id).onchange=e=>{build[key]=e.target.value?Number(e.target.value):null;error=null;renderBuilder();};
  const manual=()=>{if(build.relicAuto){build.panel=JSON.parse(JSON.stringify(panel));build.relicAuto=false;}get('battle-build-note').textContent='当前为手动面板；应用后只修改当前队员。';};
  get('battle-builder').querySelectorAll('[data-build-panel]').forEach(el=>el.oninput=()=>{manual();const k=el.dataset.buildPanel;build.panel[k]=Number(el.value)/(percentages.has(k)?100:1);});
  get('battle-element-dmg').oninput=e=>{manual();build.panel.elemDmg??={};build.panel.elemDmg[ctx.charById.get(build.characterId)?.element??u.element]=Number(e.target.value)/100;};
  get('battle-build-base').onclick=()=>{build.relicAuto=true;error=null;renderBuilder();};
  get('battle-build-apply').onclick=()=>{try{
    let actor;if(build.characterId)actor=buildBattleActor(ctx,build);else actor={...JSON.parse(JSON.stringify(u)),panel:JSON.parse(JSON.stringify(build.panel??u.panel)),build:JSON.parse(JSON.stringify(build))};
    if(actor.characterId===u.characterId){actor.policy=JSON.parse(JSON.stringify(u.policy??{}));actor.energy=Math.min(u.energy??0,actor.energyMax??0);if(u.currentHp!=null)actor.currentHp=u.currentHp===u.panel.hp?actor.panel.hp:Math.min(u.currentHp,actor.panel.hp);for(const [key,a] of Object.entries(u.actions))if(actor.actions[key]&&a.targetId)actor.actions[key].targetId=a.targetId;}
    const candidate=putAlly(state.config,actor,u.id),problems=validateBattle({...candidate,strict:false});if(problems.length)throw new Error(problems.join('；'));
    state.config=candidate;state.stale=!!state.result;state.error=null;state.draft=null;drafts.set(u.id,JSON.parse(JSON.stringify(actor.build)));error=null;renderRuntime();renderBuilder();
  }catch(e){error=e.message;renderBuilder();}};
  renderRelics({host:get('battle-relics'),tables:data.relicTables,state:build,onChange:()=>{error=null;renderBuilder();},onDraftChange:()=>{get('battle-build-note').textContent='遗器草稿已变化，应用前会检查词条规则。';}});
}
function renderRuntime(){renderSimulator({host:get('battle-runtime'),state,requireFour:true,onActorPanelChange:id=>{drafts.delete(id);renderBuilder();},onConfigReplace:()=>{drafts.clear();error=null;renderBuilder();},onEditActor:id=>{selected=id;error=null;renderBuilder();get('battle-builder').scrollIntoView?.({behavior:'smooth'});}});}
initTheme();get('battle-version').textContent=`数据 ${data._meta.version} · 四人队伍`;
get('battle-save').onclick=()=>{try{localStorage.setItem(storageKey,JSON.stringify(state.config));get('battle-storage-note').textContent='已保存当前已应用的四人战斗配置。';}catch(e){get('battle-storage-note').textContent=e.message;}};
get('battle-load').onclick=()=>{try{const raw=localStorage.getItem(storageKey);if(!raw)throw new Error('尚无已保存的战斗配置');const c=JSON.parse(raw);c.requiredAllies=4;const problems=validateBattle({...c,strict:false});if(problems.length)throw new Error(problems.join('；'));state.config=c;state.result=null;state.error=null;state.draft=null;state.stale=false;drafts.clear();error=null;renderBuilder();renderRuntime();get('battle-storage-note').textContent='已读取独立的四人战斗配置。';}catch(e){get('battle-storage-note').textContent=e.message;}};
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target?.tagName==='INPUT'&&get('battle-runtime').contains?.(e.target)){e.preventDefault();e.target.onchange?.(e);get('sim-run').onclick();}});
renderBuilder();renderRuntime();
window.__HSR_BATTLE__={state,ctx,renderBuilder,renderRuntime};
