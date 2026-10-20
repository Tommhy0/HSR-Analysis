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
import { strictParty } from '../simulator/party.mjs';
import { KIT_IDS,SUPPORTED_SETS } from '../simulator/kits.mjs';
import {renderSetRules} from './relic-rules.mjs';
import {withReavers} from '../simulator/encounters.mjs';
import {withHimekoBeamCount} from '../simulator/himeko-plan.mjs';
import {mountTeamImport} from './config-import.mjs';
const data=window.__HSR_DATA__,ctx=createContext(data),characters=listCharacters(ctx),get=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const defaultParty=()=>({...strictParty(ctx),strict:document.documentElement?.dataset?.strictReview==='true'});
const state={config:defaultParty()},drafts=new Map();let selected=state.config.units[0].id,error=null;
const storageKey='hsr-four-member-battle-v1';
const panelFields=[['hp','生命'],['atk','攻击'],['def','防御'],['speed','速度'],['critRate','暴击率 %'],['critDmg','暴伤 %'],['breakEffect','击破 %'],['effectHit','命中 %'],['effectRes','抵抗 %'],['energyRegen','回能倍率'],['healingBoost','治疗加成 %']];
const percentages=new Set(['critRate','critDmg','breakEffect','effectHit','effectRes','healingBoost']);
const elementOf=build=>({量子:'Quantum',物理:'Physical',风:'Wind',火:'Fire',冰:'Ice',雷:'Thunder',虚数:'Imaginary'})[ctx.charById.get(build.characterId)?.element]??ctx.charById.get(build.characterId)?.element??currentUnit().element;
function currentUnit(){const allies=state.config.units.filter(u=>u.side==='ally');return allies.find(u=>u.id===selected)??allies[0];}
function currentBuild(u){if(!drafts.has(u.id))drafts.set(u.id,JSON.parse(JSON.stringify(u.build??{...newBattleBuild(),characterId:u.characterId??null,panel:u.panel})));return drafts.get(u.id);}
function preview(build){const base=suggestPanel(ctx,build).panel;return build.relicAuto?applyRelics(base,relicContributions(data.relicTables,build.relics)):build.panel??base;}
function renderBuilder(){
  const u=currentUnit();selected=u.id;const build=currentBuild(u),allies=state.config.units.filter(u=>u.side==='ally');let panel=build.panel??u.panel;
  build.relicDetailsOpen=get('battle-relics')?.closest?.('details')?.open??build.relicDetailsOpen??false;
  try{if(build.characterId)panel=preview(build);}catch(e){error=e.message;}
  const sets=build.relicSets??[],outer=sets.filter(s=>s.id<300),inner=sets.find(s=>s.id>=300),setOptions=(planar,value)=>`<option value="">无套装效果</option>${data.relicsets.filter(s=>(s.id>=300)===planar).map(s=>`<option value="${esc(s.id)}"${s.id===value?' selected':''}>${esc(s.name)}${SUPPORTED_SETS.includes(s.id)?'':'（待接入）'}</option>`).join('')}`;
  get('battle-builder').innerHTML=`<h2>四个独立队员 <span class="hint">配置只应用到当前选中的位置</span></h2><div class="party-tabs">${allies.map((a,i)=>`<button class="party-tab${a.id===selected?' on':''}" data-party="${esc(a.id)}" aria-pressed="${a.id===selected}"><small>队员 ${i+1}</small><strong>${esc(a.name)}</strong></button>`).join('')}</div><div class="row"><label>当前角色</label><select id="battle-character" aria-label="当前位置角色"><option value="">自定义测试单位（在规则 JSON 中编辑动作）</option>${characters.map(ch=>`<option value="${esc(ch.id)}"${build.characterId===ch.id?' selected':''}>${esc(characterDisplayName(ch,data.characters))}</option>`).join('')}</select></div>
  <div class="row"><label>等级</label><input id="battle-level" aria-label="当前队员等级" type="number" min="1" max="80" value="${esc(build.level)}"><label>星魂</label><select id="battle-eidolon" aria-label="当前队员星魂">${[0,1,2,3,4,5,6].map(e=>`<option value="${esc(e)}"${build.eidolon===e?' selected':''}>E${e}</option>`).join('')}</select><label>光锥</label><select id="battle-lc" aria-label="当前队员光锥"><option value="">不装备</option>${data.lightcones.map(l=>`<option value="${esc(l.id)}"${build.lightconeId===l.id?' selected':''}>${esc(l.name)}</option>`).join('')}</select><label>光锥等级</label><input id="battle-lc-level" aria-label="当前队员光锥等级" type="number" min="1" max="80" value="${esc(build.lightconeLevel)}"><label>叠影</label><select id="battle-super" aria-label="当前队员光锥叠影">${[1,2,3,4,5].map(s=>`<option value="${esc(s)}"${build.superimpose===s?' selected':''}>S${s}</option>`).join('')}</select></div>
  <div class="row">${build.characterId===1306?`<label>花火版本</label><select id="battle-variant" aria-label="花火版本"><option value="base"${build.variant!=='enhanced'?' selected':''}>原版花火</option><option value="enhanced"${build.variant==='enhanced'?' selected':''}>强化花火</option></select>`:''}<label class="chk"><input id="battle-technique" type="checkbox"${build.technique?' checked':''}>使用入场秘技</label>${[['Normal','普攻',6],['BPSkill','战技',10],['Ultra','终结技',10],['Talent','天赋',10]].map(([type,name,max])=>`<label>${name}基础等级</label><input data-skill-level="${type}" aria-label="${name}基础等级" type="number" min="1" max="${esc(max)}" value="${esc(build.levels?.[type]??max)}">`).join('')}</div>
  <p class="faint">面板输入包含白值、行迹属性和遗器词条；选定光锥的被动、套装效果和战斗增益由引擎另行添加，输入时请勿重复计入。星魂增加的技能等级自动生效。</p>
  <div class="grid">${panelFields.map(([k,label])=>`<label class="field"><span>${label}</span><input aria-label="当前队员${label}" type="number" step="any" data-build-panel="${k}" value="${esc((panel[k]??0)*(percentages.has(k)?100:1))}"></label>`).join('')}<label class="field"><span>本属性增伤 %</span><input id="battle-element-dmg" aria-label="当前队员本属性增伤" type="number" step="any" value="${esc((panel.elemDmg?.[elementOf(build)]??0)*100)}"></label></div>
  <div class="row"><label>外圈套装</label><select id="battle-set-a" aria-label="第一套外圈遗器">${setOptions(false,outer[0]?.id)}</select><select id="battle-set-count" aria-label="第一套外圈件数"><option value="4"${outer[0]?.count!==2?' selected':''}>四件套</option><option value="2"${outer[0]?.count===2?' selected':''}>二加二</option></select>${outer[0]?.count===2?`<select id="battle-set-b" aria-label="第二套外圈遗器">${setOptions(false,outer[1]?.id)}</select>`:''}<label>内圈套装</label><select id="battle-set-planar" aria-label="内圈遗器套装">${setOptions(true,inner?.id)}</select></div>
  ${renderSetRules(data.relicsets,sets)}<div class="row"><button class="primary" id="battle-build-apply">应用到这名队员</button><button id="battle-build-base">按白值与遗器重算</button><span class="faint" id="battle-build-note">编辑后需应用；其他三人的配装保持各自独立。</span></div>${build.lightconeId&&ctx.lcById.get(build.lightconeId)?.path!==ctx.charById.get(build.characterId)?.path?'<div class="notice">光锥命途不符：仅保留白值，被动不生效。</div>':''}${error?`<div class="notice bad">${esc(error)}</div>`:''}<p class="faint">${KIT_IDS.includes(build.characterId)?'此角色已登记可执行规则。已知问题见队员卡片；近似试算允许带缺口运行，严格验算会检查当前角色与装备。完整实战验证仍待完成。':'此角色尚未建立完整战斗机制，严格模式会明确拒绝。'}</p><details${build.relicDetailsOpen?' open':''}><summary>当前队员的六件遗器</summary><div id="battle-relics"></div></details>`;
  get('battle-builder').querySelectorAll('[data-party]').forEach(el=>el.onclick=()=>{selected=el.dataset.party;error=null;renderBuilder();});
  get('battle-character').onchange=e=>{build.characterId=e.target.value?Number(e.target.value):null;build.variant='base';build.relicAuto=!!build.characterId;build.levels={};error=null;renderBuilder();};
  if(build.characterId===1306)get('battle-variant').onchange=e=>{build.variant=e.target.value;renderBuilder();};
  get('battle-technique').onchange=e=>{build.technique=e.target.checked;};
  get('battle-builder').querySelectorAll('[data-skill-level]').forEach(el=>el.onchange=()=>{build.levels??={};build.levels[el.dataset.skillLevel]=Number(el.value);});
  const updateSets=()=>{const a=Number(get('battle-set-a').value),count=Number(get('battle-set-count').value),b=Number(get('battle-set-b')?.value),p=Number(get('battle-set-planar').value);build.relicSets=[...(a?[{id:a,count}]:[]),...(count===2&&b?[{id:b,count:2}]:[]),...(p?[{id:p,count:2}]:[])];renderBuilder();};
  for(const id of ['battle-set-a','battle-set-count','battle-set-planar',...(outer[0]?.count===2?['battle-set-b']:[])])get(id).onchange=updateSets;
  for(const [id,key] of [['battle-level','level'],['battle-eidolon','eidolon'],['battle-lc','lightconeId'],['battle-lc-level','lightconeLevel'],['battle-super','superimpose']])get(id).onchange=e=>{build[key]=e.target.value?Number(e.target.value):null;error=null;renderBuilder();};
  const manual=()=>{if(build.relicAuto){build.panel=JSON.parse(JSON.stringify(panel));build.relicAuto=false;}get('battle-build-note').textContent='当前为手动面板；应用后只修改当前队员。';};
  get('battle-builder').querySelectorAll('[data-build-panel]').forEach(el=>el.oninput=()=>{manual();const k=el.dataset.buildPanel;build.panel[k]=Number(el.value)/(percentages.has(k)?100:1);});
  get('battle-element-dmg').oninput=e=>{manual();build.panel.elemDmg??={};build.panel.elemDmg[elementOf(build)]=Number(e.target.value)/100;};
  get('battle-build-base').onclick=()=>{build.relicAuto=true;error=null;renderBuilder();};
  get('battle-build-apply').onclick=()=>{try{
    let actor;if(build.characterId)actor=buildBattleActor(ctx,build);else actor={id:u.id,name:'自定义测试单位',side:'ally',level:build.level??80,element:u.element,energy:0,energyMax:0,panel:JSON.parse(JSON.stringify(build.panel??u.panel)),actions:{basic:{name:'普通攻击',type:'Normal',element:u.element,target:'single',terms:[{scaling:'atk',multiplier:1}],hitShares:[1],spGain:1,toughness:30}},build:JSON.parse(JSON.stringify(build)),unsupported:[]};
    if(actor.characterId===u.characterId){actor.policy=JSON.parse(JSON.stringify(u.policy??{}));actor.energy=Math.min(u.energy??0,actor.energyMax??0);if(u.currentHp!=null)actor.currentHp=u.currentHp===u.panel.hp?actor.panel.hp:Math.min(u.currentHp,actor.panel.hp);for(const [key,a] of Object.entries(u.actions))if(actor.actions[key]&&a.targetId)actor.actions[key].targetId=a.targetId;}
    const candidate=putAlly(state.config,actor,u.id),problems=validateBattle({...candidate,strict:false});if(problems.length)throw new Error(problems.join('；'));
    state.config=candidate;state.stale=!!state.result;state.error=null;state.draft=null;drafts.set(u.id,JSON.parse(JSON.stringify(actor.build)));error=null;renderRuntime();renderBuilder();
  }catch(e){error=e.message;renderBuilder();}};
  renderRelics({host:get('battle-relics'),tables:data.relicTables,state:build,onChange:()=>{error=null;renderBuilder();},onDraftChange:()=>{get('battle-build-note').textContent='遗器草稿已变化，应用前会检查词条规则。';}});
}
function renderHimekoControl(){
  const host=get('battle-himeko-control'),h=state.config.units.find(u=>u.side==='ally'&&u.characterId===1510);
  if(!h){host.hidden=true;host.innerHTML='';return;}
  host.hidden=false;
  const seq=(state.config.actionPlan??[]).filter(c=>c.actor===h.id&&c.after?.actor===h.id&&c.after?.key==='ultimate'&&c.after?.kind==='ultimate'&&c.after?.occurrence===1&&['beam','pulse'].includes(c.key));
  const count=seq.length?seq.filter(c=>c.key==='beam').length:6;
  host.innerHTML=`<h2>姬子·启行：拓星者终结技</h2><p>设置第一次终结技后的超频光束次数。少于六束时，剩余源能会立即发动轨道歼灭脉冲；六束耗尽后脉冲自动发动，最后接三段随机终击。</p><div class="row"><label for="himeko-beam-count">先发动光束</label><select id="himeko-beam-count" aria-label="姬子终结技光束次数">${Array.from({length:7},(_,n)=>`<option value="${esc(n)}"${count===n?' selected':''}>${n} 次</option>`).join('')}</select><span class="faint">E6 每束额外获得 1 点源能；脉冲和最后一击按角色机制逐段结算。</span><button class="primary" id="himeko-plan-apply">应用行动选择</button></div><p class="faint">本控制只设定首个终结技的拓星者分支；队伍其他录像操作轴会保留。</p>`;
  get('himeko-plan-apply').onclick=()=>{
    const beams=Number(get('himeko-beam-count').value),next=withHimekoBeamCount(state.config,h.id,beams),actionPlan=next.actionPlan,problems=validateBattle({...next,strict:false});
    if(problems.length){get('battle-storage-note').textContent=problems.join('；');return;}
    state.config={...state.config,actionPlan};state.stale=!!state.result;state.result=null;state.error=null;renderRuntime();
    get('battle-storage-note').textContent=`已应用姬子拓星者行动：${beams} 次光束${beams<6?'后接脉冲':'，六束后自动脉冲'}，最后发动三段终击。`;
  };
}
function renderRuntime(){renderSimulator({host:get('battle-runtime'),state,requireFour:true,onActorPanelChange:(id,key,value)=>{if(drafts.has(id)){const draft=drafts.get(id);draft.panel??=JSON.parse(JSON.stringify(state.config.units.find(u=>u.id===id).panel));draft.panel[key]=value;draft.relicAuto=false;}renderBuilder();},onConfigReplace:()=>{drafts.clear();error=null;renderBuilder();},onEditActor:id=>{selected=id;error=null;renderBuilder();get('battle-builder-wrap').open=true;get('battle-builder').scrollIntoView?.({behavior:'smooth'});}});renderHimekoControl();}
document.querySelectorAll?.('a[href="#battle-builder"]').forEach(el=>el.onclick=()=>{get('battle-builder-wrap').open=true;});
initTheme();get('battle-version').textContent=`数据 ${data._meta.version} · 四人队伍`;
get('battle-preset').onclick=()=>{state.config=defaultParty();state.result=null;state.error=null;state.draft=null;state.stale=false;state.playback={};drafts.clear();error=null;selected=state.config.units[0].id;renderBuilder();renderRuntime();get('battle-storage-note').textContent='已载入 E0S1 四人专武参考队。星魂、面板、秘技与花火版本均可编辑；可读取先前保存的配置。';};
get('battle-reavers').onclick=()=>{state.config=withReavers(ctx,state.config);state.result=null;state.error=null;state.draft=null;state.stale=false;state.playback={};renderRuntime();get('battle-storage-note').textContent='已保留四名队员，换为三只 Lv.90 虚卒·掠夺者。行动、分段回能与叠速按 4.6 源脚本建模。';};
get('battle-two-waves').onclick=()=>{state.config=withReavers(ctx,state.config,{waves:2});state.result=null;state.error=null;state.draft=null;state.stale=false;state.playback={};renderRuntime();get('battle-storage-note').textContent='已保留四人配装，载入两波基础虚卒。换波保留生命、能量与效果，秘技不会再次施放。';};
get('battle-save').onclick=()=>{try{localStorage.setItem(storageKey,JSON.stringify(state.config));get('battle-storage-note').textContent='已保存当前已应用的四人战斗配置。';}catch(e){get('battle-storage-note').textContent=e.message;}};
get('battle-load').onclick=()=>{try{const raw=localStorage.getItem(storageKey);if(!raw)throw new Error('尚无已保存的战斗配置');const c=JSON.parse(raw);c.requiredAllies=4;const problems=validateBattle({...c,strict:false});if(problems.length)throw new Error(problems.join('；'));state.config=c;state.result=null;state.error=null;state.draft=null;state.stale=false;drafts.clear();error=null;renderBuilder();renderRuntime();get('battle-storage-note').textContent='已读取独立的四人战斗配置。';}catch(e){get('battle-storage-note').textContent=e.message;}};
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target?.tagName==='INPUT'&&e.target.type==='number'&&get('battle-runtime').contains?.(e.target)){e.preventDefault();e.target.onchange?.(e);get('sim-run').onclick();}});
renderBuilder();renderRuntime();
mountTeamImport({host:get('battle-ai-import'),ctx,getConfig:()=>state.config,onApply:config=>{state.config=config;state.result=null;state.error=null;state.draft=null;state.stale=false;state.playback={};drafts.clear();error=null;renderBuilder();renderRuntime();}});
if(document.documentElement?.dataset?.reviewDemo==='true'){
  get('battle-version').textContent+=' · 本地验收';get('sim-visual-reference').onclick();
  const enemy=state.config.units.find(u=>u.side==='enemy'),index=state.result.log.findIndex(e=>e.type==='action_end'&&e.actor===enemy.id);
  state.playback.selected=enemy.id;state.replayController.seek(Math.max(0,index));get('sim-replay').scrollIntoView?.();
}
if(document.documentElement?.dataset?.strictReview==='true'){
  get('battle-version').textContent+=' · 严格模式本地验收';get('sim-run').onclick();
  if(state.result){const index=state.result.log.findIndex(e=>e.type==='action_end'&&e.actor==='slot-3'&&e.frame?.action?.key==='ultimate');state.playback.selected='slot-3';state.replayController.seek(Math.max(0,index));get('sim-replay').scrollIntoView?.();}
}
window.__HSR_BATTLE__={state,ctx,renderBuilder,renderRuntime,buildBattleActor,newBattleBuild,KIT_IDS};
