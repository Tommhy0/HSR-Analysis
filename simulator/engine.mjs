// Pure deterministic event simulation. No wall clock, DOM, or game-client automation.
// Distances are kept in the 10000-unit action gauge: changing speed preserves progress.
import { computeHit } from '../core/damage.mjs';
export const ACTION_DISTANCE=10000;
const EPS=1e-8, clone=(o)=>JSON.parse(JSON.stringify(o));
const finite=(v,label,min=0)=>{if(!Number.isFinite(v)||v<min)throw new Error(label+'无效');return v;};
const object=v=>v!=null&&typeof v==='object'&&!Array.isArray(v);
const BUFF_KEYS=new Set(['atk','def','hp','speed','critRate','critDmg','breakEffect','effectHit','effectRes','energyRegen','healingBoost','incomingHeal','speedPct','atkPct','hpPct','defPct','dmgBoost','defIgnore','defShred','vuln','dmgReduction','resPen',...['Physical','Fire','Ice','Thunder','Wind','Quantum','Imaginary'].map(e=>'elemDmg.'+e)]);
export function validateBattle(config) {
  if(!config||typeof config!=='object'||!Array.isArray(config.units))return ['战斗配置的 units 须为数组'];
  const errors=[]; const units=config?.units??[];
  if(!units.length||units.length>12)errors.push('需要 1～12 个单位');
  if(!units.some(u=>u?.side==='ally')||!units.some(u=>u?.side==='enemy'))errors.push('需要我方与敌方单位');
  if(units.filter(u=>u?.side==='ally').length>4)errors.push('我方最多四个角色');
  const ids=new Set();
  for(const u of units){
    if(!object(u)){errors.push('单位须为对象');continue;}
    if(typeof u.id!=='string'||!u.id||ids.has(u.id))errors.push('单位 ID 必须为唯一字符串');ids.add(u.id);
    if(!['ally','enemy'].includes(u.side))errors.push(u.id+'阵营无效');
    for(const k of ['hp','atk','def','speed'])if(!Number.isFinite(u.panel?.[k])||u.panel[k]<(k==='hp'||k==='speed'?EPS:0))errors.push(u.id+'面板 '+k+' 无效');
    if(!Number.isFinite(u.level)||u.level<1||u.level>100)errors.push(u.id+'等级无效');
    if(!u.actions?.basic)errors.push(u.id+'缺少基础动作');
    if(!Number.isFinite(u.energyMax??0)||(u.energyMax??0)<0)errors.push(u.id+'能量上限无效');
    if(!Number.isFinite(u.energy??0)||(u.energy??0)<0||(u.energy??0)>(u.energyMax??0))errors.push(u.id+'初始能量无效');
    for(const k of ['energyRegen','effectHit','effectRes','healingBoost'])if(u.panel?.[k]!=null&&(!Number.isFinite(u.panel[k])||u.panel[k]<0||(k==='effectRes'&&u.panel[k]>1)))errors.push(u.id+'面板 '+k+' 无效');
    for(const k of ['critRate','critDmg'])if(u.panel?.[k]!=null&&!Number.isFinite(u.panel[k]))errors.push(u.id+'面板 '+k+' 无效');
    for(const k of ['aggro','toughnessMax','onHitEnergy','killEnergy'])if(u[k]!=null&&(!Number.isFinite(u[k])||u[k]<0))errors.push(u.id+'.'+k+' 无效');
    if(u.initialAdvance!=null&&(!Number.isFinite(u.initialAdvance)||u.initialAdvance<0||u.initialAdvance>1))errors.push(u.id+'初始行动提前须为 0～1');
    if(u.currentHp!=null&&(!Number.isFinite(u.currentHp)||u.currentHp<=0||u.currentHp>(u.panel?.hp??0)))errors.push(u.id+'初始生命值无效');
    if(u.unsupported!=null&&!Array.isArray(u.unsupported))errors.push(u.id+'机制缺口须为数组');
    if(config.strict && Array.isArray(u.unsupported) && u.unsupported.length)errors.push(u.name+'：'+u.unsupported.join('、'));
    if(!object(u.actions)){errors.push(u.id+'动作集合须为对象');continue;}
    const rotation=u.policy?.rotation;
    if(rotation!=null&&(!Array.isArray(rotation)||!rotation.length||rotation.some(k=>typeof k!=='string'||!object(u.actions[k])||k==='ultimate')))errors.push(u.id+'动作循环须引用已配置的普通动作');
    for(const [key,a] of Object.entries(u.actions)){
      if(!object(a)){errors.push(u.id+'动作须为对象');continue;}
      if(a.target!=null&&!['self','allies','lowestAlly','all','blast','single'].includes(a.target))errors.push(u.id+'动作目标无效');
      for(const k of ['energyCost','energyGain','spCost','spGain','hpCostRatio','toughness','adjacentToughness','bounceToughness'])if(a[k]!=null&&(!Number.isFinite(a[k])||a[k]<0))errors.push(`${u.id}.${key}.${k} 无效`);
      if(key==='ultimate'&&(!Number.isFinite(a.energyCost)||a.energyCost<=0||a.energyCost>(u.energyMax??0)))errors.push(u.id+'终结技必须指定有效的能量消耗');
      if(a.hpCostRatio>1)errors.push(u.id+'生命消耗比例不能超过 1');
      if(a.targetId!=null&&!units.some(t=>t?.id===a.targetId&&t.side===((a.target==='allies'||a.target==='lowestAlly'||a.target==='self')?u.side:tSide(u))))errors.push(u.id+'动作目标不存在或阵营错误');
      if(a.terms!=null&&!Array.isArray(a.terms)){errors.push(u.id+'伤害项须为数组');continue;}
      for(const term of a.terms??[])if(!term||!['atk','hp','def'].includes(term.scaling)||!Number.isFinite(term.multiplier)||term.multiplier<0)errors.push(`${u.id}.${key} 倍率无效`);
      if(a.hitShares&&(!Array.isArray(a.hitShares)||a.hitShares.some(x=>!Number.isFinite(x)||x<=0)||Math.abs(a.hitShares.reduce((x,y)=>x+y,0)-1)>EPS))errors.push(u.id+'分段比例总和须为 1');
      if(a.bounceCount!=null&&(!Number.isInteger(a.bounceCount)||a.bounceCount<0))errors.push(u.id+'弹射次数无效');
      if(a.bounceTerms!=null&&(!Array.isArray(a.bounceTerms)||a.bounceTerms.some(t=>!object(t)||!['atk','hp','def'].includes(t.scaling)||!Number.isFinite(t.multiplier)||t.multiplier<0)))errors.push(u.id+'弹射倍率无效');
      if(a.effects!=null&&!Array.isArray(a.effects)){errors.push(u.id+'动作效果须为数组');continue;}
      for(const e of a.effects??[]){
        if(!e||typeof e!=='object'){errors.push(u.id+'效果须为对象');continue;}
        if(!['heal','shield','buff','advance','delay','dot','cleanse','extra','followup'].includes(e.type))errors.push(u.id+'未知动作效果 '+e.type);
        if(e.type==='buff'&&!BUFF_KEYS.has(e.key))errors.push(u.id+'未知增益属性 '+e.key);
        if(e.tickAt!=null&&!['start','end'].includes(e.tickAt))errors.push(u.id+'回合计时方式无效');
        if(e.target!=null&&!['self','allies','enemies','lowestAlly'].includes(e.target))errors.push(u.id+'效果目标无效');
        for(const k of ['value','multiplier','flat'])if(e[k]!=null&&(!Number.isFinite(e[k])||(e.type!=='buff'&&e[k]<0)))errors.push(u.id+'效果 '+k+' 无效');
        if(['buff','shield','dot'].includes(e.type)&&(!Number.isInteger(e.duration)||e.duration<1))errors.push(u.id+'持续回合数须为正整数');
        if(e.type==='dot'&&e.terms!=null&&(!Array.isArray(e.terms)||e.terms.some(t=>!object(t)||!['atk','hp','def'].includes(t.scaling)||!Number.isFinite(t.multiplier)||t.multiplier<0)))errors.push(u.id+'持续伤害倍率无效');
        if(['extra','followup'].includes(e.type)){
          const recipients=e.target==='allies'?units.filter(t=>t?.side===u.side):e.target==='enemies'?units.filter(t=>t?.side===tSide(u)):e.target==='self'?[u]:[];
          if(!recipients.length||recipients.some(t=>!object(t.actions?.[e.action])))errors.push(u.id+'追加或额外动作必须指定有对应动作的阵营 / 自身目标');
        }
      }
    }
  }
  if(!Number.isFinite(config.maxAV)||config.maxAV<=0||config.maxAV>3000)errors.push('行动值范围须为 0～3000');
  if(!Number.isInteger(config.sp??3)||(config.sp??3)<0||(config.sp??3)>(config.maxSP??5))errors.push('初始战技点无效');
  if(!Number.isInteger(config.maxSP??5)||(config.maxSP??5)<1)errors.push('战技点上限须为正整数');
  if(config.critMode!=null&&!['expected','random','crit','noncrit'].includes(config.critMode))errors.push('暴击模式无效');
  if(config.seed!=null&&!Number.isInteger(config.seed))errors.push('随机种子须为整数');
  return [...new Set(errors)];
}
export function seededRandom(seed=1){let n=seed>>>0;return ()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};}
export function createBattle(config) {
  const errs=validateBattle(config);if(errs.length)throw new Error(errs.join('；'));
  return {config:clone(config),av:0,sp:config.sp??3,maxSP:config.maxSP??5,turns:0,eventCount:0,queue:[],log:[],random:seededRandom(config.seed??1),
    units:config.units.map((u,i)=>({...clone(u),order:i,hp:u.currentHp??u.panel.hp,energy:u.energy??0,distance:ACTION_DISTANCE*(1-Math.max(0,Math.min(1,u.initialAdvance??0))),
      toughness:u.toughnessMax??0,broken:false,shields:[],buffs:[],dots:[],turns:0}))};
}
const alive=(u)=>u.hp>EPS;
export function combatPanel(u){
  const out={...u.panel,baseStats:{...u.panel.baseStats},elemDmg:{...u.panel.elemDmg}};
  for(const b of u.buffs){const key=b.key, v=b.value;
    if(key==='speedPct')out.speed+=(u.baseSpeed??u.panel.speed)*v;
    else if(['atkPct','hpPct','defPct'].includes(key)){const k=key.slice(0,-3);if(!Number.isFinite(u.panel.baseStats?.[k]))throw new Error(u.name+'缺少 '+k+'白值');out[k]+=u.panel.baseStats[k]*v;}
    else if(key.startsWith('elemDmg.'))out.elemDmg[key.slice(8)]=(out.elemDmg[key.slice(8)]??0)+v;
    else if(['atk','def','hp','speed','critRate','critDmg','breakEffect','effectHit','effectRes','energyRegen','healingBoost','incomingHeal'].includes(key))out[key]=(out[key]??0)+v;
  }
  if(out.speed<=0)throw new Error(u.name+'速度必须大于0'); return out;
}
const snapshot=(b)=>b.units.map(u=>({id:u.id,hp:u.hp,energy:u.energy,toughness:u.toughness,distance:u.distance,alive:alive(u)}));
function record(b,type,actor,extra={}){
  if(++b.eventCount>(b.config.maxEvents??10000))throw new Error('事件数量超限，可能存在无限触发循环');
  b.log.push({index:b.log.length,av:b.av,cycle:b.av<150?0:1+Math.floor((b.av-150)/100),type,actor:actor?.id??null,sp:b.sp,...extra});
}
const targets=(b,u,side)=>b.units.filter(t=>alive(t)&&t.side===(side==='ally'?u.side:tSide(u)));
const tSide=(u)=>u.side==='ally'?'enemy':'ally';
function weightedTarget(b,units){const weights=units.map(u=>u.aggro??1);const total=weights.reduce((a,c)=>a+c,0);if(!Number.isFinite(total)||total<=0)throw new Error('仇恨权重无效');let n=b.random()*total;return units.find((u,i)=>(n-=weights[i])<0)??units.at(-1);}
function selectedTargets(b,u,action){
  if(action.target==='self')return [u];
  const pool=targets(b,u,action.target==='allies'||action.target==='lowestAlly'?'ally':'enemy');if(!pool.length)return [];
  if(action.target==='all'||action.target==='allies')return pool;
  if(action.target==='lowestAlly')return [pool.reduce((a,c)=>a.hp/a.panel.hp<c.hp/c.panel.hp?a:c)];
  if(action.targetId){const target=pool.find(t=>t.id===action.targetId);if(target)return [target];}
  return [u.side==='enemy'?weightedTarget(b,pool):pool[0]];
}
function expiredTick(b,owner,at){
  for(const u of b.units) {
    for(const list of [u.buffs,u.shields,u.dots])for(const effect of list)if(effect.tickOwner===owner.id&&(effect.tickAt??'end')===at&&(effect.countApplyTurn||effect.appliedTurn!==owner.turns))effect.remaining--;
    u.buffs=u.buffs.filter(e=>e.remaining>0);u.shields=u.shields.filter(e=>e.remaining>0&&e.value>0);u.dots=u.dots.filter(e=>e.remaining>0);
  }
}
function energy(b,u,amount,fixed=false){const old=u.energy;u.energy=Math.max(0,Math.min(u.energyMax??0,u.energy+amount*(fixed?1:combatPanel(u).energyRegen??1)));if(old!==u.energy)record(b,'energy',u,{amount:u.energy-old});}
export function advance(b,id,ratio){const u=b.units.find(x=>x.id===id);if(!u)throw new Error('未知单位');u.distance=Math.max(0,u.distance-ACTION_DISTANCE*finite(ratio,'行动提前'));record(b,'advance',u,{ratio,distance:u.distance});}
export function delay(b,id,ratio){const u=b.units.find(x=>x.id===id);if(!u)throw new Error('未知单位');u.distance+=ACTION_DISTANCE*finite(ratio,'行动延后');record(b,'delay',u,{ratio,distance:u.distance});}
function receiveDamage(b,from,to,amount,kind){
  finite(amount,'伤害');const best=Math.max(0,...to.shields.map(s=>s.value));for(const s of to.shields)s.value=Math.max(0,s.value-amount);
  const absorbed=Math.min(best,amount), lost=Math.min(to.hp,Math.max(0,amount-absorbed));to.hp-=lost;
  record(b,'damage',from,{target:to.id,damage:amount,hpDamage:lost,absorbed,kind,hp:to.hp});
  if(kind!=='dot'&&alive(to))energy(b,to,to.onHitEnergy??0,to.onHitEnergyFixed??false);
  if(!alive(to)){record(b,'death',to);if(from)energy(b,from,from.killEnergy??10,from.killEnergyFixed??false);}
  if(kind!=='dot'&&alive(to)&&to.reactions?.onAttacked&&!b.queue.some(q=>q.actor===to.id&&q.key===to.reactions.onAttacked))b.queue.push({actor:to.id,key:to.reactions.onAttacked,kind:'followup',targetId:from?.id});
}
function breakTarget(b,from,to,element=from.element){
  to.broken=true;record(b,'break',from,{target:to.id});
  const rule=to.breakRule?.[element]??to.breakRule?.all;
  if(!rule){if(b.config.strict)throw new Error(to.name+'缺少 '+element+' 击破规则');record(b,'assumption',from,{message:'未实现该敌人的元素击破附加效果'});return;}
  if(rule.damage!=null)receiveDamage(b,from,to,rule.damage,'break');
  delay(b,to.id,rule.delay??0.25);
  if(rule.skipTurn)to.skipTurns=(to.skipTurns??0)+rule.skipTurn;
  for(const ally of b.units.filter(t=>alive(t)&&t.side===from.side))if(ally.reactions?.onEnemyBroken)b.queue.push({actor:ally.id,key:ally.reactions.onEnemyBroken,kind:'followup',targetId:to.id});
}
function applyEffects(b,u,action,chosen){
  for(const e of action.effects??[]){
    const recipients=e.target==='self'?[u]:e.target==='allies'?targets(b,u,'ally'):e.target==='enemies'?targets(b,u,'enemy'):e.target==='lowestAlly'?selectedTargets(b,u,{target:'lowestAlly'}):chosen;
    for(const to of recipients){
      const p=combatPanel(u);const value=e.value??((p[e.scaling??'hp']??0)*(e.multiplier??0)+(e.flat??0));finite(value,'效果值',e.type==='buff'?-Infinity:0);
      if(e.type==='heal'){const healed=Math.min(Math.max(0,combatPanel(to).hp-to.hp),value*(1+(p.healingBoost??0))*(1+(combatPanel(to).incomingHeal??0)));to.hp+=healed;record(b,'heal',u,{target:to.id,amount:healed,hp:to.hp});}
      else if(e.type==='advance')advance(b,to.id,value);
      else if(e.type==='delay')delay(b,to.id,value);
      else if(e.type==='cleanse'){to.dots=[];to.buffs=to.buffs.filter(x=>!x.debuff);record(b,'cleanse',u,{target:to.id});}
      else if(e.type==='extra'||e.type==='followup')b.queue.push({actor:to.id,key:e.action,kind:e.type,targetId:e.targetId});
      else {
        if(!Number.isInteger(e.duration)||e.duration<1)throw new Error('持续回合数须为正整数');
        const tickOwner=e.tickOwner==='caster'?u:to;
        const data={...e,value,source:u.id,id:e.id??u.id+':'+e.type+':'+(e.key??action.name),remaining:e.duration,tickOwner:tickOwner.id,tickAt:e.tickAt??'end',appliedTurn:tickOwner.turns};
        const list=e.type==='shield'?to.shields:e.type==='dot'?to.dots:to.buffs;
        const index=list.findIndex(x=>x.id===data.id);if(index>=0)list[index]=data;else list.push(data);
        record(b,e.type,u,{target:to.id,value,key:e.key,duration:e.duration});
      }
    }
  }
}
function damageTo(b,u,to,action,share=1,role='primary',kind='direct'){
  const terms=(action.terms??[]).filter(t=>(t.target??'primary')==='all'||(t.target??'primary')===role).map(t=>({...t,multiplier:t.multiplier*share,flatAdd:(t.flatAdd??0)*share,count:1}));
  if(!terms.length)return;
  const p=combatPanel(u), targetPanel=combatPanel(to);
  const agg={dmgBoost:0,defShred:0,defIgnore:0,resPen:{},vuln:0,dmgReduction:0,abilityDmg:{},elemDmg:{}};
  for(const effect of u.buffs){
    if(effect.sourceSide&&effect.sourceSide!==u.side)continue;
    if(['dmgBoost','defIgnore'].includes(effect.key))agg[effect.key]+=effect.value;
    else if(effect.key==='resPen'){const element=action.element??u.element;agg.resPen[element]=(agg.resPen[element]??0)+effect.value;}
  }
  for(const effect of to.buffs)if(['defShred','vuln','dmgReduction'].includes(effect.key))agg[effect.key]+=effect.value;
  const skill={terms,hits:1,type:action.type??'Normal',element:action.element??u.element,targetRole:role,includeConditional:true,multiplierBasis:'per-term'};
  let critMode=kind==='dot'?'noncrit':b.config.critMode??'expected';if(critMode==='random')critMode=b.random()<Math.max(0,Math.min(1,p.critRate??0))?'crit':'noncrit';
  const hit=computeHit({panel:p,ability:skill,agg,enemy:{def:targetPanel.def,res:to.res??{}},state:{broken:to.side==='ally'?true:to.broken},options:{critMode},attackerLevel:u.level});
  if(!hit.ok)throw new Error(hit.error);
  receiveDamage(b,u,to,hit.total,kind);
  if(kind!=='dot'&&alive(to)&&!to.broken&&(to.toughnessMax??0)>0&&(to.weaknesses??[]).includes(skill.element)){
    const reduction=(role==='adjacent'?action.adjacentToughness??action.toughness:action.toughness)??0;
    to.toughness=Math.max(0,to.toughness-reduction*share);
    record(b,'toughness',u,{target:to.id,value:to.toughness});if(to.toughness<=EPS)breakTarget(b,u,to,skill.element);
  }
}
function useAction(b,u,key,kind='normal',targetId=null){
  const original=u.actions[key];if(!original)throw new Error(u.name+'缺少动作 '+key);const action=targetId?{...original,targetId}:original;
  if(u.side==='ally'&&(action.spCost??0)>b.sp)throw new Error('战技点不足');
  if((action.energyCost??0)>u.energy+EPS)throw new Error('能量不足');
  const selected=selectedTargets(b,u,action);if(!selected.length)return;
  u.energy=Math.max(0,u.energy-(action.energyCost??0));
  if(u.side==='ally')b.sp=Math.min(b.maxSP,b.sp-(action.spCost??0)+(action.spGain??0));
  if(action.hpCostRatio)u.hp=Math.max(action.hpCostCanKill?0:1,u.hp-u.panel.hp*action.hpCostRatio);
  record(b,'action',u,{name:action.name??key,key,kind,targets:selected.map(t=>t.id),energy:u.energy});
  for(const share of action.hitShares??[1]){
    for(const to of selected)if(alive(to))damageTo(b,u,to,action,share,'primary');
    if(action.target==='blast'){
      const pool=b.units.filter(t=>t.side===tSide(u)), at=pool.findIndex(t=>t.id===selected[0].id);
      for(const to of [pool[at-1],pool[at+1]].filter(t=>t&&alive(t)))damageTo(b,u,to,action,share,'adjacent');
    }
  }
  for(let n=0;n<(action.bounceCount??0);n++){
    const pool=targets(b,u,'enemy');if(!pool.length)break;
    const to=pool[Math.floor(b.random()*pool.length)];damageTo(b,u,to,{...action,terms:action.bounceTerms??action.terms,toughness:action.bounceToughness??action.toughness});
  }
  applyEffects(b,u,action,selected);energy(b,u,action.energyGain??0,action.fixedEnergy??false);
  record(b,'action_end',u,{kind,state:snapshot(b)});
}
function enqueueUltimates(b){
  if(!b.units.some(u=>alive(u)&&u.side==='ally')||!b.units.some(u=>alive(u)&&u.side==='enemy'))return;
  const queued=new Set(b.queue.filter(q=>q.kind==='ultimate').map(q=>q.actor));
  for(const u of b.units)if(alive(u)&&u.policy?.autoUltimate!==false&&u.actions.ultimate&&!queued.has(u.id)&&(u.actions.ultimate.energyCost??u.energyMax)>0&&u.energy+EPS>=(u.actions.ultimate.energyCost??u.energyMax))b.queue.push({actor:u.id,key:'ultimate',kind:'ultimate'});
}
function flush(b){
  while(b.queue.length){
    if(!b.units.some(u=>alive(u)&&u.side==='ally')||!b.units.some(u=>alive(u)&&u.side==='enemy')){b.queue=[];break;}
    const q=b.queue.shift(),u=b.units.find(u=>u.id===q.actor);if(!u||!alive(u))continue;
    if(q.kind==='ultimate'&&u.energy+EPS<(u.actions[q.key].energyCost??0))continue;
    // Extra turns/ultimates/follow-ups do not reset the normal action gauge.
    useAction(b,u,q.key,q.kind,q.targetId);enqueueUltimates(b);
  }
}
export function stepBattle(b){
  if(!b.units.some(u=>alive(u)&&u.side==='ally')||!b.units.some(u=>alive(u)&&u.side==='enemy'))return false;
  enqueueUltimates(b);flush(b);
  if(!b.units.some(u=>alive(u)&&u.side==='ally')||!b.units.some(u=>alive(u)&&u.side==='enemy'))return false;
  const order=b.units.filter(alive).map(u=>({u,wait:u.distance/combatPanel(u).speed})).sort((a,c)=>Math.abs(a.wait-c.wait)>EPS?a.wait-c.wait:a.u.order-c.u.order);
  const {u,wait}=order[0];if(b.av+wait>b.config.maxAV+EPS)return false;
  for(const unit of b.units.filter(alive))unit.distance=Math.max(0,unit.distance-combatPanel(unit).speed*wait);
  b.av+=wait;u.distance=ACTION_DISTANCE;u.turns++;b.turns++;
  record(b,'turn_start',u);
  for(const dot of [...u.dots]){const source=b.units.find(x=>x.id===dot.source);if(dot.terms)damageTo(b,source,u,{...dot,type:'DoT',toughness:0},1,'primary','dot');else receiveDamage(b,source,u,dot.value,'dot');}
  expiredTick(b,u,'start');if(!alive(u)){flush(b);return true;}
  if(u.skipTurns>0){u.skipTurns--;record(b,'skip',u);}
  else {
    if(u.broken){u.broken=false;u.toughness=u.toughnessMax;record(b,'recover',u);}
    const healing=u.policy?.healBelow!=null&&targets(b,u,'ally').some(t=>t.hp/t.panel.hp<u.policy.healBelow);
    const skill=u.actions.skill;
    const useSkill=skill&&u.policy?.basicOnly!==true&&(u.side==='enemy'||b.sp>=(skill.spCost??0))&&(u.policy?.healBelow==null||healing);
    const rotation=u.policy?.rotation;
    let key=rotation?rotation[(u.turns-1)%rotation.length]:useSkill?'skill':'basic';
    const chosen=u.actions[key];
    if((u.side==='ally'&&(chosen.spCost??0)>b.sp)||(chosen.energyCost??0)>u.energy+EPS)key='basic';
    useAction(b,u,key);
  }
  expiredTick(b,u,'end');record(b,'turn_end',u);enqueueUltimates(b);flush(b);return true;
}
export function simulateBattle(config){
  const battle=createBattle(config);record(battle,'battle_start',null,{state:snapshot(battle)});
  while(stepBattle(battle)){}
  const allyAlive=battle.units.some(u=>alive(u)&&u.side==='ally'),enemyAlive=battle.units.some(u=>alive(u)&&u.side==='enemy');
  return {config:clone(config),av:battle.av,sp:battle.sp,turns:battle.turns,outcome:!allyAlive?'defeat':!enemyAlive?'victory':'time_limit',
    units:snapshot(battle),log:battle.log,unsupported:config.units.flatMap(u=>u.unsupported??[]),
    damage:battle.log.filter(x=>x.type==='damage'&&config.units.find(u=>u.id===x.actor)?.side==='ally').reduce((s,x)=>s+x.damage,0),
    healing:battle.log.filter(x=>x.type==='heal').reduce((s,x)=>s+x.amount,0)};
}
export function compareReplay(result,anchors,{avTolerance=0.01,damageTolerance=0.01}={}){
  return anchors.map(a=>{const e=result.log.filter(e=>e.type===a.type&&e.actor===a.actor&&(a.target==null||e.target===a.target))[a.occurrence??0];
    return {anchor:a,actual:e??null,ok:!!e&&Math.abs(e.av-a.av)<=avTolerance&&(a.damage==null||Math.abs(e.damage-a.damage)<=damageTolerance),reason:e?'数值或行动值不匹配':'日志中没有对应事件'};});
}
