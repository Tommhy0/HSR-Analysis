// Game kit hooks operate on battle state only. No DOM and no hidden external state.
import {relicRuntime} from './relic-runtime.mjs';
import {rosterRuntime} from './characters/runtime.mjs';
import {equipmentRuntime} from './equipment-runtime.mjs';
const live=u=>u&&u.active!==false&&u.hp>1e-8;
const allies=(b,u)=>b.units.filter(t=>live(t)&&t.side===u.side);
const enemies=(b,u)=>b.units.filter(t=>live(t)&&t.side!==u.side);
const is=(u,id)=>u.kit?.characterId===id;
const rank=(u,n,i=0)=>u.kit.eidolon>=n?u.kit.ranks[n]?.[i]??0:0;
const trace=(u,n)=>u.kit?.trace?.[n];
const set=(u,id)=>u.gear?.sets?.find(s=>s.id===id);
const rolePath=u=>({1306:'Harmony',1412:'Harmony',1015:'Hunt',1414:'Preservation'})[u.characterId]??({同谐:'Harmony',巡猎:'Hunt',存护:'Preservation',丰饶:'Abundance',虚无:'Nihility',毁灭:'Destruction',智识:'Erudition',记忆:'Remembrance',欢愉:'Elation'})[u.path]??u.path;
const cone=(u,id)=>u.gear?.cone?.id===id?u.gear.cone.p:null;
const get=(b,id)=>b.units.find(u=>u.id===id);
const tag=(u,name)=>u.buffs.find(e=>e.tag===name);

export function kitRuntime(api) {
  const {record,energy,advance,damageTo,combatPanel,useAction}=api;
  function remove(b,to,id){to.buffs=to.buffs.filter(e=>e.id!==id);}
  function buff(b,from,to,name,key,value,duration=null,extra={}){
    const owner=extra.tickOwner?get(b,extra.tickOwner):to,id=extra.id??from.id+':'+name+':'+key;
    // 入场 / 秘技阶段施加、且在持有者回合开始递减的效果：持有者的第 1 个回合不应消耗持续时间，
    // 否则与「N 回合」的说明相比会少 1 回合（例如缇宝秘技的【神启】）。
    const preBattle=(extra.tickAt??'end')==='start'&&b.turnActor==null&&owner.turns===0;
    const item={type:'buff',id,name,key,value,remaining:duration,tickOwner:owner.id,tickAt:'end',appliedTurn:owner.turns,source:from.id,removeOnSourceDeath:!!(extra.merit||extra.bond),...extra,...(preBattle?{skipFirstTick:true}:{})};
    const at=to.buffs.findIndex(x=>x.id===id);if(at<0)to.buffs.push(item);else to.buffs[at]=item;
    record(b,'buff',from,{target:to.id,name,key,value,duration});if(item.debuff)relics.debuff(b,from,to,item);return item;
  }
  function stacks(b,from,to,name,key,per,max,duration,extra={}){
    const id=extra.id??from.id+':'+name+':'+key,old=to.buffs.find(e=>e.id===id),n=Math.min(max,(old?.stacks??0)+1);
    return buff(b,from,to,name,key,per*n,duration,{...extra,id,stacks:n});
  }
  function resource(b,u,key,value){u.resources??={};u.resources[key]=value;record(b,'resource',u,{name:key,value});}
  function sp(b,from,amount,reason,{bank=false}={}){
    if(!amount)return;const old=b.sp,requested=amount;b.sp=Math.max(0,Math.min(b.maxSP,b.sp+amount));
    if(bank&&is(from,1306)&&from.kit.enhanced){const cap=from.kit.params.Ultra[4];resource(b,from,'溢出战技点',Math.min(cap,(from.resources['溢出战技点']??0)+Math.max(0,old+amount-b.maxSP)));}
    record(b,'sp',from,{amount:b.sp-old,requested,reason});
    if(amount>0){
      for(const a of b.units.filter(a=>live(a)&&is(a,1015)&&trace(a,3)))if(b.sp>=trace(a,3)[2])buff(b,a,a,'守护者','critDmg',trace(a,3)[0],trace(a,3)[1]);
      const p=cone(from,23021);if(p){let n=(from.resources['彩焰']??0)+amount;if(n>=p[3]){n=0;mask(b,from,p[2]);}resource(b,from,'彩焰',n);}
    }
  }
  function mask(b,u,duration){const p=cone(u,23021);buff(b,u,u,'假面','marker',0,duration,{tag:'mask',removeOnSourceDeath:true});for(const t of allies(b,u).filter(t=>t!==u)){
    buff(b,u,t,'假面 · 暴击率','critRate',p[4],duration,{tickOwner:u.id,requiresTag:{unit:u.id,tag:'mask'}});
    buff(b,u,t,'假面 · 暴伤','critDmg',p[1],duration,{tickOwner:u.id,requiresTag:{unit:u.id,tag:'mask'}});
  }}
  function spend(b,u,amount){
    if(!amount)return;sp(b,u,-amount,'技能消耗');u.spentThisTurn=(u.spentThisTurn??0)+amount;
    relics.spSpent(b,u);
    // 通用「消耗战技点」广播：模块可用它统计实际消耗（含 1306 免费战技等绕过路径由各自处理）。
    roster.spSpent?.(b,u,amount);
    for(const s of b.units.filter(t=>live(t)&&t.side===u.side&&is(t,1306))){const p=s.kit.params.Talent;
      // 强化花火的 E4 只提高「战技点上限增加效果」（由 maximumSP 结算），不提高【幻相】层数上限。
      const max=p[3];
      const recipients=s.kit.enhanced?[s]:allies(b,s),tagName=s.kit.enhanced?'illusion':'sparkleTalent:'+s.id;
      for(const to of recipients)buff(b,s,to,s.kit.enhanced?'幻相':'叙述性诡计','marker',0,p[0],{tag:tagName,stacks:Math.min(max,(tag(to,tagName)?.stacks??0)+amount)});
      if(s.kit.enhanced&&trace(s,1)&&u.buffs.some(e=>e.source===s.id&&e.tag==='sparkleSkill'))energy(b,s,trace(s,1)[1]*amount);
      if(s.kit.enhanced&&trace(s,2)&&u.spentThisTurn>=trace(s,2)[0])resource(b,s,'免费战技',1);
    }
  }
  function shield(b,u,to,mult,flat,{factor=1}={}){
    const p=combatPanel(u),boost=p.shieldBoost??0,value=(p.atk*mult+flat)*(1+boost)*factor;
    const cap=(p.atk*u.kit.params.BPSkill[0]+u.kit.params.BPSkill[1])*u.kit.params.BPSkill[3]*(1+boost),id=u.id+':dragon-shield',old=to.shields.find(s=>s.id===id),previous=old?.value??0,total=Math.min(cap,previous+value);
    const e={type:'shield',id,name:'腾荒 · 叠加护盾',value:total,source:u.id,remaining:u.kit.params.BPSkill[2],tickOwner:to.id,tickAt:'end',appliedTurn:to.turns};
    if(old)Object.assign(old,e);else to.shields.push(e);record(b,'shield',u,{target:to.id,name:e.name,value:total-previous,total,duration:e.remaining});
  }
  // 通用护盾：同类来源不叠加，取更强的一次并刷新持续时间（三月七 / 杰帕德 / 罗刹 E2 等）。
  function barrier(b,u,to,{name='护盾',value,duration,id=null,group='shield'}){
    const p=combatPanel(u),boost=p.shieldBoost??0,w=value*(1+boost),eid=id??u.id+':'+group,old=to.shields.find(s=>s.id===eid);
    const previous=old?.value??0,total=Math.max(previous,w);
    const e={type:'shield',id:eid,name,value:total,source:u.id,remaining:duration,tickOwner:to.id,tickAt:'end',appliedTurn:to.turns};
    if(old)Object.assign(old,e);else to.shields.push(e);
    record(b,'shield',u,{target:to.id,name,value:total-previous,total,duration});
    return total;
  }
  // 通用持续伤害：按基础概率命中，命中后按 id 覆盖刷新层数 / 持续时间。
  function dot(b,u,to,{name,element,value=0,terms=null,chance=1,duration=2,stacks=1,extra={}}){
    // dotRes：1008 阿兰行迹「抵抗持续伤害类负面状态的概率提高 50%」。dotRes=0 时表达式与旧实现完全一致
    // （保留 chance>=1 短路，不额外消耗随机数）。
    const dotRes=combatPanel(to).dotRes??0;
    const base=chance*(1+(combatPanel(u).effectHit??0))*(1-(combatPanel(to).effectRes??0));
    // 「基础概率」在游戏中仍需乘以 (1+效果命中)(1-效果抵抗)。chance>=1 时只有目标效果抵抗为 0
    // 才短路（此时 base>=1，结果一定是命中，且保持不消耗随机数）；目标有 effectRes 时必须按 base
    // 判定，否则 100% 基础概率的 DoT 会无视效果抵抗，与 dotRes>0 分支自相矛盾。
    const res=1-(combatPanel(to).effectRes??0);
    const hit=dotRes>0?b.random()<base*(1-Math.min(1,dotRes)):(chance>=1&&res>=1)||b.random()<base;
    if(!hit){record(b,'resist',to,{name:name+' 被抵抗',element});return null;}
    const {snapshotAtk:wantSnapshotAtk,...dotExtra}=extra;
    const data={type:'dot',id:u.id+':'+name,name,source:u.id,remaining:duration,tickOwner:to.id,tickAt:'end',appliedTurn:to.turns,element,value,terms,stacks,debuff:true,...dotExtra,
      ...(wantSnapshotAtk?{snapshotAtk:combatPanel(u).atk}: {})};
    to.dots=to.dots.filter(e=>e.id!==data.id);to.dots.push(data);
    record(b,'dot',u,{target:to.id,name,duration,stacks});relics.debuff(b,u,to,data);return data;
  }
  // 全属性抗性降低：引擎按元素分别读取 resReduction，需要逐个元素登记。
  function allResDown(b,u,to,value,duration,name='全属性抗性降低'){
    for(const element of ['Physical','Fire','Ice','Thunder','Wind','Quantum','Imaginary'])
      buff(b,u,to,name+' · '+element,'resPen',value,duration,{id:u.id+':resdown:'+element,debuff:true,element,resReduction:true});
  }
  // 通用持续治疗：模块在目标回合开始时调用 tickRegen 结算（数值以施法者面板为基准）。
  function regen(b,u,to,name,multiplier,flat,duration,extra={}){
    const {snapshotHp:wantSnapshotHp,...regenExtra}=extra;
    return buff(b,u,to,name,'marker',0,duration,{id:regenExtra.id??u.id+':regen:'+name,
      regen:{multiplier,flat,...(wantSnapshotHp?{snapshotHp:combatPanel(u).hp}:{})},removeOnSourceDeath:false,...regenExtra});
  }
  function tickRegen(b,u,actor,bonus=null){
    for(const e of actor.buffs.filter(e=>e.regen&&e.source===u.id))heal(b,u,actor,(e.regen.snapshotHp??combatPanel(u).hp)*e.regen.multiplier+e.regen.flat+(bonus?bonus(e):0));
  }
  function cleanseOne(b,u,to){const negative=[...to.buffs.filter(e=>e.debuff),...to.dots];const first=negative.find(e=>e.control)??negative[0];if(!first)return;to.buffs=to.buffs.filter(e=>e!==first);to.dots=to.dots.filter(e=>e!==first);record(b,'cleanse',u,{target:to.id,name:first.name});}
  function supportTarget(b,u){const id=u.policy?.allyTargetId??u.actions.skill?.targetId;return get(b,id)??allies(b,u).find(t=>is(t,1015))??allies(b,u).find(t=>t!==u)??u;}
  function merit(b,u,to){const old=u.resources['军功目标'];if(old!==to.id){resource(b,u,'充能',0);resource(b,u,'军功目标',to.id);for(const t of b.units)t.buffs=t.buffs.filter(e=>!(e.source===u.id&&e.merit));}
    buff(b,u,to,'军功','atk',0,null,{tag:'merit',merit:true,convert:{source:u.id,stat:'atk',ratio:u.kit.params.Talent[1]}});
    if(rank(u,1))buff(b,u,to,'军功 · 无视防御','defIgnore',rank(u,1),null,{merit:true});
    if(rank(u,2))buff(b,u,to,'军功 · 增伤','dmgBoost',rank(u,2),null,{merit:true});
    if(rank(u,6))buff(b,u,to,'军功 · 抗穿','resPen',rank(u,6),null,{merit:true});
  }
  function ceryCharge(b,u,n){const max=u.kit.params.BPSkill[2];resource(b,u,'充能',Math.min(max,(u.resources['充能']??0)+n));u.pendingPromotion=u.resources['充能']>=u.kit.params.BPSkill[3];}
  function promotions(b){for(const u of b.units.filter(t=>live(t)&&is(t,1412)&&t.pendingPromotion)){u.pendingPromotion=false;
    const to=get(b,u.resources['军功目标']);if(to&&!tag(to,'peerage')){buff(b,u,to,'爵位 · 战技暴伤','critDmg',u.kit.params.BPSkill[0],null,{tag:'peerage',merit:true,abilityType:'BPSkill'});
      buff(b,u,to,'爵位 · 战技抗穿','resPen',u.kit.params.BPSkill[4],null,{merit:true,peerage:true,abilityType:'BPSkill'});
      if(rank(u,1,1))buff(b,u,to,'爵位 · 战技无视防御','defIgnore',rank(u,1,1),null,{merit:true,peerage:true,abilityType:'BPSkill'});
      to.buffs=to.buffs.filter(e=>!e.control);record(b,'mechanic',u,{name:'军功升级为爵位',target:to.id});
    }
  }}
  function bond(b,u,to){if(u.resources['同袍目标']!==to.id){for(const t of b.units)t.buffs=t.buffs.filter(e=>!(e.source===u.id&&e.bond));resource(b,u,'同袍目标',to.id);}
    if(trace(u,1))buff(b,u,to,'同袍 · 神秀','atk',0,null,{tag:'bondmate',bond:true,removeOnSourceDeath:true,convert:{source:u.id,stat:'atk',ratio:trace(u,1)[0]}});
    else buff(b,u,to,'同袍','marker',0,null,{tag:'bondmate',bond:true});
    if(rank(u,4))buff(b,u,to,'同袍 · 减伤','dmgReduction',rank(u,4),null,{bond:true});
    if(rank(u,6,2))buff(b,u,to,'同袍 · 无视防御','defIgnore',rank(u,6,2),null,{bond:true});
    let summon=b.summons.find(s=>s.owner===u.id);if(summon){summon.bondmate=to.id;summon.active=true;}
    else {summon={id:u.id+':dragon',name:'龙灵（'+u.name+'）',owner:u.id,bondmate:to.id,speed:u.kit.params.Talent[4],distance:10000,enhanced:0,active:true,order:b.units.length+b.summons.length};b.summons.push(summon);record(b,'summon',u,{name:'召唤龙灵',target:to.id});}
    return summon;
  }
  function heal(b,u,to,value,extraBoost=0){const action=b.activeAction?.actor===u.id?u.actions[b.activeAction.key]:null,p=combatPanel(u,{action}),amount=Math.max(0,Math.min(combatPanel(to).hp-to.hp,value*(1+(p.healingBoost??0)+extraBoost)*(1+(combatPanel(to).incomingHeal??0))));to.hp+=amount;record(b,'heal',u,{target:to.id,amount,hp:to.hp});if(amount>0)roster.hpChanged(b,to,'heal',amount,u);relics.healed(b,u,to);}
  const relics=relicRuntime({buff,stacks,record,energy,combatPanel});
  const shared={...api,live,allies,enemies,get,tag,rank,trace,buff,stacks,resource,sp,heal,cleanseOne,barrier,dot,allResDown,regen,tickRegen};
  const roster=rosterRuntime(shared),equipment=equipmentRuntime(shared);
  function onStart(b){
    for(const u of b.units){u.resources={};if(!u.kit)continue;
      if(is(u,1015)){resource(b,u,'充能',trace(u,2)?.[0]??0);}
      if(is(u,1306)){resource(b,u,'溢出战技点',0);resource(b,u,'免费战技',0);}
      if(is(u,1412)){resource(b,u,'充能',0);resource(b,u,'附加伤害次数',u.kit.params.Talent[3]);}
      if(is(u,1414)&&trace(u,2))advance(b,u.id,trace(u,2)[0]);
      if(is(u,1306)&&u.kit.enhanced&&rank(u,1,1))buff(b,u,u,'花火 E1 · 速度','speedPct',rank(u,1,1),u.kit.ranks[1][2]);
    }
    for(const u of b.units.filter(live)){
      const p=u.gear?.cone?.p,id=u.gear?.cone?.id;
      if(p){if([23051,23048,22005,21003].includes(id))buff(b,u,u,'光锥 · 攻击','atkPct',p[0]);
        if(id===23021){buff(b,u,u,'游戏尘寰 · 暴伤','critDmg',p[0]);mask(b,u,p[5]);}
        if(id===23046){buff(b,u,u,'理想燃烧的地狱 · 暴击','critRate',p[0]);if(b.maxSP>=p[1])buff(b,u,u,'理想燃烧的地狱 · 入场攻击','atkPct',p[2]);}
        if(id===21004)buff(b,u,u,'记忆中的模样 · 击破','breakEffect',p[0]);
      }
      for(const s of u.gear?.sets??[])setStart(b,u,s);
      if(is(u,1306)&&trace(u,3)){const p=trace(u,3),q=allies(b,u).filter(t=>t.element==='Quantum').length;for(const to of allies(b,u))buff(b,u,to,'夜想曲','atkPct',u.kit.enhanced?p[0]:p[3]+(to.element==='Quantum'?p[Math.min(3,q)-1]??0:0),null,{removeOnSourceDeath:true});}
    }
    equipment.start(b);roster.start(b);relics.ready(b);
    // Permanent HP set bonuses are present before the first hit, including Techniques.
    for(const u of b.units)u.hp=u.currentHp??combatPanel(u).hp;
    const entryPriority=u=>is(u,1306)?-80:is(u,1015)?-60:-55;
    for(const u of b.units.filter(t=>live(t)&&t.kit?.technique).sort((a,c)=>entryPriority(a)-entryPriority(c)||a.order-c.order)){
      if(is(u,1306)){sp(b,u,u.kit.params.Maze[0],'不可靠叙事者');if(u.kit.enhanced)energy(b,u,u.kit.params.Maze[1]);}
      if(is(u,1015)){resource(b,u,'充能',Math.min(u.kit.params.Ultra[2],u.resources['充能']+u.kit.params.Maze[1]));const a={name:'千里眼',type:'Maze',element:u.element,terms:[{scaling:'atk',multiplier:u.kit.params.Maze[0]}],toughness:60};for(const to of enemies(b,u))damageTo(b,u,to,a,1,'primary','technique');}
      if(is(u,1412)||is(u,1414))useAction(b,u,'skill','technique',supportTarget(b,u).id);
    }
    roster.entry(b);
  }
  function setStart(b,u,s){const p=s.p2;
    relics.start(b,u,s);
    const simple={101:['healingBoost',p[0]],102:['atkPct',p[0]],103:['defPct',p[0]],106:['dmgReduction',p[0]],108:['elemDmg.Quantum',p[0]],110:['elemDmg.Wind',p[0]],114:['speedPct',p[0]],120:['atkPct',p[0]],121:['speedPct',p[0]],122:['critRate',p[0]],124:['elemDmg.Quantum',p[0]],128:['shieldBoost',p[0]],301:['atkPct',p[0]],302:['hpPct',p[0]],303:['effectHit',p[0]],304:['defPct',p[0]],306:['critRate',p[0]],307:['breakEffect',p[0]],308:['energyRegen',p[0]],309:['critRate',p[0]],310:['effectRes',p[0]],311:['atkPct',p[0]],312:['energyRegen',p[0]],314:['atkPct',p[0]],317:['energyRegen',p[0]],318:['critDmg',p[0]],319:['hpPct',p[0]],320:['speedPct',p[0]]};
    if(simple[s.id])buff(b,u,u,s.name+' · 两件',...simple[s.id]);
    if(s.id===314&&rolePath(u)&&allies(b,u).some(t=>t!==u&&rolePath(t)===rolePath(u)))buff(b,u,u,s.name+' · 同命途','critRate',p[1]);
    if(s.id===128&&s.count>=4)buff(b,u,u,s.name+' · 四件盾量','shieldBoost',s.p4[0]);
    if(s.id===103&&s.count>=4)buff(b,u,u,s.name+' · 四件盾量','shieldBoost',s.p4[0]);
    if(s.id===317){const first=allies(b,u)[0];if(first!==u)buff(b,u,first,s.name,'atkPct',p[1],null,{removeOnSourceDeath:true});}
    if(s.id===308&&combatPanel(u).speed>=p[1])advance(b,u.id,p[2]);
    if(s.count>=4){if(s.id===101)sp(b,u,1,s.name);if(s.id===102)buff(b,u,u,s.name+' · 速度','speedPct',s.p4[0]);if(s.id===120)buff(b,u,u,s.name+' · 暴击','critRate',s.p4[0]);if(s.id===124){buff(b,u,u,s.name+' · 速度','speedPct',-s.p4[5]);const speed=combatPanel(u).speed;if(speed<s.p4[2])buff(b,u,u,s.name+' · 暴击','critRate',s.p4[4]);else if(speed<s.p4[1])buff(b,u,u,s.name+' · 暴击','critRate',s.p4[3]);}}
  }
  function prepare(b,u,key,kind,action){
    const a={...roster.prepare(b,u,key,kind,action)};if(kind==='copy'||kind==='technique'){a.spCost=0;a.spGain=0;}
    if(key==='skill'&&is(u,1306)&&u.kit.enhanced&&u.resources['免费战技'])a.spCost=0;
    if(a.target==='ally')a.targetId=a.targetId??u.policy?.allyTargetId??([1105,1301].includes(u.characterId)?allies(b,u).sort((a,c)=>a.hp/combatPanel(a).hp-c.hp/combatPanel(c).hp)[0]?.id:supportTarget(b,u).id);
    return a;
  }
  function before(b,u,key,kind,a,selected){
    equipment.before(b,u,key,kind);roster.before(b,u,key,kind,a,selected);
    relics.before(b,u,key,kind,a,selected);
    if(is(u,1414)&&kind==='summon'){
      const p=u.kit.params,factor=key==='dragon'&&u.kit.eidolon>=2?u.kit.ranks[2][2]:1;
      const team=allies(b,u),lowest=team.reduce((a,c)=>Math.max(0,...a.shields.map(s=>s.value))<=Math.max(0,...c.shields.map(s=>s.value))?a:c);
      for(const to of team){for(let i=0;i<p.Talent[5];i++)cleanseOne(b,u,to);shield(b,u,to,p.Talent[0],p.Talent[1],{factor});}
      if(trace(u,3))shield(b,u,lowest,trace(u,3)[1],trace(u,3)[2],{factor});
    }
    if(key==='skill'&&is(u,1306)&&u.resources['免费战技'])resource(b,u,'免费战技',0);
    if(is(u,1015)&&key==='ultimate'&&rank(u,2)){for(const to of selected){buff(b,u,to,'Archer E2 · 量子抗性降低','resPen',rank(u,2),u.kit.ranks[2][1],{debuff:true,element:'Quantum',resReduction:true});buff(b,u,to,'Archer E2 · 量子弱点','marker',0,u.kit.ranks[2][1],{weakness:'Quantum'});}}
    if(is(u,1412)&&key==='ultimate'){if(!live(get(b,u.resources['军功目标'])))merit(b,u,allies(b,u)[0]);ceryCharge(b,u,u.kit.params.Ultra[1]);resource(b,u,'附加伤害次数',u.kit.params.Talent[3]);}
    if(is(u,1414)&&key==='ultimate'){
      const summon=b.summons.find(s=>s.owner===u.id&&s.active);if(summon){summon.enhanced=u.kit.params.Ultra[2]+rank(u,2);record(b,'resource',u,{name:'强化龙灵行动',value:summon.enhanced});}
      if(rank(u,1)){sp(b,u,rank(u,1),'腾荒 E1');const to=get(b,u.resources['同袍目标']);if(live(to))buff(b,u,to,'同袍 · 终结技抗穿','resPen',u.kit.ranks[1][1],u.kit.ranks[1][2],{bond:true});}
      if(summon&&rank(u,2)){summon.distance=0;record(b,'advance',u,{name:'龙灵立即行动',ratio:1});}
    }
    for(const c of b.units.filter(c=>live(c)&&is(c,1412)&&c.resources['军功目标']===u.id)){
      if(['basic','skill'].includes(key)){if(!u.coupActive)ceryCharge(b,c,c.kit.params.Talent[0]);if(trace(c,3))energy(b,c,trace(c,3)[0]);}
      if(key==='ultimate'&&trace(c,2)&&!c.resources['终结技充能已触发']&&c.resources['充能']<c.kit.params.BPSkill[2]){resource(b,c,'终结技充能已触发',1);ceryCharge(b,c,trace(c,2)[1]);}
    }
  }
  function copyOwner(b,u,key,kind,a){if(key!=='skill'||kind==='copy'||kind==='technique'||!(a.terms?.length))return null;return b.units.find(c=>live(c)&&is(c,1412)&&c.resources['军功目标']===u.id&&tag(u,'peerage'));}
  function consumeCopy(b,c,u){resource(b,c,'充能',Math.max(0,c.resources['充能']-c.kit.params.BPSkill[3]));u.buffs=u.buffs.filter(e=>!(e.source===c.id&&(e.peerage||e.tag==='peerage')));record(b,'mechanic',c,{name:'奇袭结束 · 爵位降为军功',target:u.id});}
  function after(b,u,key,kind,a,selected,hitTargets,bounceTargets){
    if(u.enemyKit?.id===8012010&&hitTargets.length){const p=u.enemyKit;stacks(b,u,u,'掠夺者 · 速度叠层','speedPct',p.speedPerLayer,p.speedLayers,p.speedDuration,{tickAt:'start'});}
    if(is(u,1306)){
      const p=u.kit.params;
      if(key==='basic'&&trace(u,1))energy(b,u,trace(u,1)[0]);
      if(key==='skill'){
        const to=selected[0],ratio=p.BPSkill[0]+rank(u,6),value=combatPanel(u,{excludeConverted:true}).critDmg*ratio+p.BPSkill[1];
        const extra={tag:'sparkleSkill',converted:true};
        if(!u.kit.enhanced&&trace(u,2))Object.assign(extra,{tickAt:'start',countApplyTurn:true});
        const duration=!u.kit.enhanced&&trace(u,2)?2:p.BPSkill[2];
        const recipients=u.kit.eidolon>=6?allies(b,u).filter(t=>t===to||t!==u&&tag(t,'cipher')):[to];
        for(const t of recipients){buff(b,u,t,'梦游鱼','critDmg',value,duration,extra);if(u.kit.enhanced&&trace(u,3))buff(b,u,t,'梦游鱼 · 抗穿','resPen',trace(u,3)[1],duration,{...extra,tag:'sparklePen'});}
        if(to!==u)advance(b,to.id,p.BPSkill[3]);
        if(u.kit.enhanced&&rank(u,1,1))buff(b,u,u,'花火 E1 · 速度','speedPct',rank(u,1,1),u.kit.ranks[1][2]);
      }
      if(key==='ultimate'){
        sp(b,u,p.Ultra[1]+(u.kit.eidolon>=4?1:0),'一人千役',{bank:true});
        for(const to of allies(b,u)){const duration=p.Ultra[3]+(u.kit.eidolon>=1?1:0);buff(b,u,to,'谜诡','marker',0,duration,{tag:'cipher'});if(rank(u,1))buff(b,u,to,'谜诡 · 攻击','atkPct',rank(u,1),duration);}
        if(u.kit.eidolon>=6){const old=b.units.flatMap(t=>t.buffs).find(e=>e.source===u.id&&e.tag==='sparkleSkill');if(old)for(const to of allies(b,u).filter(t=>t!==u)){buff(b,u,to,'梦游鱼','critDmg',old.value,old.remaining,{tag:'sparkleSkill',converted:true,tickAt:old.tickAt,countApplyTurn:old.countApplyTurn});if(u.kit.enhanced&&trace(u,3))buff(b,u,to,'梦游鱼 · 抗穿','resPen',trace(u,3)[1],old.remaining,{tag:'sparklePen',tickAt:old.tickAt,countApplyTurn:old.countApplyTurn});}}
      }
    }
    if(is(u,1015)){
      if(key==='skill'){resource(b,u,'连续战技次数',(u.resources['连续战技次数']??0)+(kind==='copy'?0:1));resource(b,u,'战技施放次数',(u.resources['战技施放次数']??0)+1);
        stacks(b,u,u,'回路连接','dmgBoost',u.kit.params.BPSkill[1],u.kit.params.BPSkill[2]+rank(u,6),null,{abilityType:'BPSkill',tag:'circuit'});
        if(rank(u,1)&&u.resources['战技施放次数']===u.kit.ranks[1][0])sp(b,u,u.kit.ranks[1][1],'Archer E1');
      }
      if(key==='ultimate')resource(b,u,'充能',Math.min(u.kit.params.Ultra[2],(u.resources['充能']??0)+u.kit.params.Ultra[1]));
    }
    if(is(u,1412)&&key==='skill'){
      const to=selected[0];merit(b,u,to);ceryCharge(b,u,u.kit.params.BPSkill[1]);
      if(trace(u,3))for(const t of new Set([u,to]))buff(b,u,t,'征服者 · 速度','speed',trace(u,3)[1],trace(u,3)[2]);
      if(rank(u,1,2))energy(b,to,rank(u,1,2));
    }
    if(is(u,1414)){
      const p=u.kit.params;
      if(key==='skill'){bond(b,u,selected[0]);for(const to of allies(b,u))shield(b,u,to,p.BPSkill[0],p.BPSkill[1]);}
      if(key==='ultimate'){for(const to of allies(b,u))shield(b,u,to,p.Ultra[3],p.Ultra[4]);const mate=get(b,u.resources['同袍目标']);if(live(mate)&&rank(u,6,1))for(const to of enemies(b,u))additional(b,mate,to,rank(u,6,1),'同袍 · E6 附加伤害');}
      if(key==='dragon'&&kind==='summon'){
        const s=b.summons.find(s=>s.owner===u.id&&s.active),mate=get(b,s?.bondmate),n=u.kit.eidolon>=2?u.kit.ranks[2][1]:1;
        if(live(mate)){for(const to of enemies(b,u))additional(b,mate,to,p.Ultra[7]*n,'龙灵 · 同袍附加伤害');const enemy=enemies(b,u).sort((a,c)=>c.hp-a.hp||a.order-c.order)[0];if(enemy&&trace(u,3))additional(b,mate,enemy,trace(u,3)[0]*n,'峥嵘 · 附加伤害');}
        if(s){s.enhanced--;record(b,'resource',u,{name:'强化龙灵行动',value:s.enhanced});}
      }
    }
    equipmentAfter(b,u,key,kind,a,selected,hitTargets);
    if(hitTargets.length){
      for(const c of b.units.filter(c=>live(c)&&is(c,1412)&&c.resources['军功目标']===u.id&&c.resources['附加伤害次数']>0)){
        const pool=hitTargets.filter(live);if(pool.length){resource(b,c,'附加伤害次数',c.resources['附加伤害次数']-1);additional(b,c,pool[Math.floor(b.random()*pool.length)],c.kit.params.Talent[2]+rank(c,6,1),'军功 · 附加伤害');}
      }
      for(const d of b.units.filter(d=>live(d)&&is(d,1414)&&d.resources['同袍目标']===u.id&&trace(d,2))){energy(b,d,trace(d,2)[1]);const s=b.summons.find(s=>s.owner===d.id&&s.active);if(s){s.distance=Math.max(0,s.distance-10000*trace(d,2)[2]);record(b,'advance',d,{name:'龙灵行动提前',target:s.id,ratio:trace(d,2)[2]});}}
      for(const ar of b.units.filter(ar=>live(ar)&&ar!==u&&ar.side===u.side&&is(ar,1015)&&ar.resources['充能']>0)){
        let to=selected[0];if(!live(to)){const pool=enemies(b,ar);to=pool[Math.floor(b.random()*pool.length)];}if(to){resource(b,ar,'充能',ar.resources['充能']-1);b.queue.push({actor:ar.id,key:'followup',kind:'followup',targetId:to.id});}
      }
    }
    roster.after(b,u,key,kind,a,selected,hitTargets,bounceTargets);promotions(b);
  }
  function additional(b,u,to,mult,name){if(!live(to))return;damageTo(b,u,to,{name,type:'Additional',element:u.element,terms:[{scaling:'atk',multiplier:mult}],toughness:0},1,'primary','additional');}
  function equipmentAfter(b,u,key,kind,a,selected,hitTargets){
    relics.after(b,u,key,kind,a,selected,hitTargets);
    equipment.after(b,u,key,kind,a,selected,hitTargets);
    const p=u.gear?.cone?.p,id=u.gear?.cone?.id;
    if(p){
      if(id===23046&&key==='skill')stacks(b,u,u,'理想燃烧的地狱 · 战技攻击','atkPct',p[3],p[4],null);
      if(id===23048){if(key==='ultimate'&&hitTargets.length)sp(b,u,p[2],'金血铭刻的时代');if(key==='skill'&&a.target==='ally')buff(b,u,selected[0],'金血铭刻的时代 · 战技增伤','dmgBoost',p[3],p[4],{abilityType:'BPSkill'});}
      if(id===23051&&key==='ultimate'){const team=allies(b,u),atk=combatPanel(u).atk,lowest=team.reduce((a,c)=>a.hp<c.hp?a:c);for(const to of team){heal(b,u,to,atk*p[4]);buff(b,u,to,'卫戍','dmgBoost',p[1],p[3],{tag:'garrison'});}heal(b,u,lowest,atk*p[5]);}
      if(id===21018&&key==='ultimate')for(const to of allies(b,u))advance(b,to.id,p[0]);
      if(id===21004&&hitTargets.length&&u.resources['模样触发回合']!==u.turns){resource(b,u,'模样触发回合',u.turns);energy(b,u,p[1]);}
      if(id===22005&&key==='skill')stacks(b,u,u,'迷境饭 · 战技攻击','atkPct',p[1],p[2],null);
    }
    for(const s of u.gear?.sets??[])if(s.count>=4){
      if(s.id===110&&key==='ultimate')advance(b,u.id,s.p4[0]);
      if(s.id===114&&key==='ultimate'&&['ally','allies','self','lowestAlly'].includes(a.target))for(const to of allies(b,u))buff(b,u,to,s.name,'speedPct',s.p4[0],s.p4[1],{id:'messenger-speed'});
      if(s.id===121&&['skill','ultimate'].includes(key)&&a.target==='ally')stacks(b,u,selected[0],s.name,'critDmg',s.p4[0],s.p4[2],s.p4[1]);
      if(s.id===122&&key==='ultimate')buff(b,u,u,s.name+' · 下次战技','dmgBoost',s.p4[1],null,{tag:'scholar',abilityType:'BPSkill'});
      else if(s.id===122&&key==='skill'&&kind!=='copy')u.buffs=u.buffs.filter(e=>e.tag!=='scholar');
      if(s.id===120&&(kind==='followup'||key==='dragon'))buff(b,u,u,s.name+' · 终结增伤','dmgBoost',s.p4[1],s.p4[2],{abilityType:'Ultra'});
    }
  }
  function onWaveStart(b){equipment.waveStart(b);roster.waveStart(b);}
  // 敌方尝试从弱点击破恢复；返回 true 表示本次恢复被延长（残梅绽等）。
  function beforeRecover(b,u){return roster.beforeRecover(b,u);}
  // 致命伤害拦截；返回 true 表示保留 1 点生命（免于无法战斗）。
  function beforeLethal(b,from,to,amount){return roster.beforeLethal(b,from,to,amount);}
  function onTurnStart(b,u){u.spentThisTurn=0;
    for(const t of b.units)t.hp=Math.min(t.hp,combatPanel(t).hp);
    roster.turnStart(b,u);equipment.turnStart(b,u);
    relics.turnStart(b,u);
    if(is(u,1015)){resource(b,u,'连续战技次数',0);resource(b,u,'战技施放次数',0);u.buffs=u.buffs.filter(e=>e.tag!=='circuit');if(u.kit.eidolon>=6)sp(b,u,1,'Archer E6');}
    const s=set(u,106);if(s?.count>=4&&u.hp/combatPanel(u).hp<=s.p4[0]){heal(b,u,u,combatPanel(u).hp*s.p4[1]);energy(b,u,s.p4[2]);}
  }
  function onTurnEnd(b,u){
    roster.turnEnd(b,u);
    if(is(u,1015)){u.buffs=u.buffs.filter(e=>e.tag!=='circuit');resource(b,u,'连续战技次数',0);}
    if(u.side==='ally')for(const s of b.units.filter(s=>live(s)&&is(s,1306)&&s.kit.enhanced)){const bank=s.resources['溢出战技点']??0,n=Math.min(bank,b.maxSP-b.sp);for(let i=0;i<n;i++){resource(b,s,'溢出战技点',bank-i-1);sp(b,s,1,'花火 · 溢出回补');}}
    sync(b);
  }
  function sync(b){
    // bondmate 可空（例如知更鸟的协奏倒计时只绑定施法者本人）。
    for(const s of b.summons)if(!live(get(b,s.owner))||(s.bondmate!=null&&!live(get(b,s.bondmate))))s.active=false;
    for(const u of b.units)u.buffs=u.buffs.filter(e=>(!e.removeOnSourceDeath||live(get(b,e.source)))&&(!e.requiresTag||tag(get(b,e.requiresTag.unit),e.requiresTag.tag)));
  }
  function modifiers(b,u,to,a,kind){
    const out={dmgBoost:0,defIgnore:0,vuln:0,resPen:0,critRate:0,critDmg:0};
    const rosterMod=roster.modifiers(b,u,to,a,kind);
    for(const [key,value]of Object.entries(rosterMod))out[key]=(out[key]??0)+value;
    if(a.countAsFollowup&&kind!=='followup'){
      // Preserve category-specific modifiers (e.g. Elation DMG) while replacing only
      // the ordinary hit classification with Follow-Up Attack classification.
      const direct=roster.modifiers(b,u,to,a,'direct'),followup=roster.modifiers(b,u,to,a,'followup');
      for(const key of new Set([...Object.keys(direct),...Object.keys(followup)]))out[key]=(out[key]??0)+(followup[key]??0)-(direct[key]??0);
    }
    if(is(u,1412)){if(live(get(b,u.resources['军功目标']))&&u.resources['军功目标']!==u.id){out.dmgBoost+=rank(u,2,1);out.resPen+=rank(u,6);}}
    if(is(u,1015)){if(a.type==='Ultra')out.dmgBoost+=rank(u,4);if(a.type==='BPSkill')out.defIgnore+=rank(u,6,1);}
    for(const s of b.units.filter(s=>live(s)&&s.side===u.side&&is(s,1306))){const n=(s.kit.enhanced?tag(s,'illusion'):tag(u,'sparkleTalent:'+s.id))?.stacks??0,p=s.kit.params;
      if(s.kit.enhanced)out.vuln+=n*(p.Talent[1]+(tag(u,'cipher')?p.Ultra[2]:0));else out.dmgBoost+=n*(p.Talent[1]+(tag(u,'cipher')?p.Ultra[2]:0));
      out.defIgnore+=n*rank(s,2);
    }
    for(const d of b.units.filter(d=>live(d)&&d.side===u.side&&is(d,1414)&&live(get(b,d.resources['同袍目标']))))out.vuln+=rank(d,6);
    for(const s of b.units.filter(t=>live(t)&&t.side===u.side)){
      const p=cone(s,21011);if(p&&a.element===s.element)out.dmgBoost+=p[0];
      for(const rs of s.gear?.sets??[]){if(rs.id===302&&combatPanel(s).speed>=rs.p2[1]){/* attack aura is applied in panel hook */}
        if(rs.id===312&&s!==u&&a.element===s.element)out.dmgBoost+=rs.p2[1];}
    }
    const g=cone(u,23051);if(g&&tag(u,'garrison')&&b.summons.some(s=>s.active&&s.bondmate===u.id))out.dmgBoost+=g[2];
    // Garrison's conditional portion belongs to the wearer of the cone, not the recipient.
    if(!g&&tag(u,'garrison')){const from=get(b,tag(u,'garrison').source),p=cone(from??{},23051);if(p&&b.summons.some(s=>s.active&&s.bondmate===u.id))out.dmgBoost+=p[2];}
    for(const s of u.gear?.sets??[]){if(s.id===108&&s.count>=4)out.defIgnore+=s.p4[0]+((to.weaknesses??[]).includes('Quantum')||to.buffs.some(e=>e.weakness==='Quantum')?s.p4[1]:0);
      if(s.id===306&&combatPanel(u).critRate>=s.p2[1]&&(a.type==='Ultra'||kind==='followup'||a.countAsFollowup))out.dmgBoost+=s.p2[2];
      if(s.id===311){const speed=combatPanel(u).speed;if(speed>=s.p2[1])out.dmgBoost+=speed>=s.p2[2]?s.p2[4]:s.p2[3];}
      if(s.id===102&&s.count>=4&&a.type==='Normal')out.dmgBoost+=s.p4[1];
      if(s.id===122&&s.count>=4&&['BPSkill','Ultra'].includes(a.type))out.dmgBoost+=s.p4[0];
      if(s.id===309&&combatPanel(u).critRate>=s.p2[1]&&['Normal','BPSkill'].includes(a.type))out.dmgBoost+=s.p2[2];
    }
    const relicMod=relics.modifiers(b,u,to,a,kind);for(const [k,v] of Object.entries(relicMod))out[k]+=v;
    return out;
  }
  function dragon(b,s){const u=get(b,s.owner);if(!live(u)){s.active=false;return;}
    // 通用倒计时 / 召唤物：由角色模块自己的 summonTurn 结算。
    if(s.kind==='countdown'){roster.summonTurn(b,u,s);return;}
    // 非倒计时召唤物：拥有者模块声明了 summonTurn（1510 拓星者等）就交给模块，否则维持 1414 龙灵分支。
    if(roster.hasSummonTurn(u)){roster.summonTurn(b,u,s);return;}
    const mate=get(b,s.bondmate);if(!live(mate)){s.active=false;return;}
    useAction(b,u,s.enhanced>0?'dragon':'dragonShield','summon');
  }
  function displayEffects(b,u){
    const out=[],add=(from,name,key,value,extra={})=>out.push({type:'buff',id:'derived:'+from.id+':'+name,source:from.id,name,key,value,remaining:null,tickOwner:from.id,tickAt:'end',derived:true,...extra});
    for(const s of b.units.filter(s=>live(s)&&is(s,1306))){const p=s.kit.params,illusion=tag(s,'illusion');
      if(s.kit.enhanced&&s.side!==u.side&&illusion){add(s,'幻相 · 易伤','vuln',illusion.stacks*p.Talent[1],{debuff:true,stacks:illusion.stacks,remaining:illusion.remaining,note:'持有谜诡的攻击者额外增加 '+Math.round(illusion.stacks*p.Ultra[2]*100)+'% 易伤'});if(rank(s,2))add(s,'幻相 · 减防','defShred',illusion.stacks*rank(s,2),{debuff:true,remaining:illusion.remaining});}
      if(!s.kit.enhanced&&s.side===u.side){const t=tag(u,'sparkleTalent:'+s.id);if(t){add(s,'叙述性诡计 · 增伤','dmgBoost',t.stacks*(p.Talent[1]+(tag(u,'cipher')?p.Ultra[2]:0)),{stacks:t.stacks,remaining:t.remaining,tickOwner:u.id});if(rank(s,2))add(s,'叙述性诡计 · 无视防御','defIgnore',t.stacks*rank(s,2),{remaining:t.remaining,tickOwner:u.id});}}
    }
    for(const d of b.units.filter(d=>live(d)&&is(d,1414)&&d.side!==u.side&&live(get(b,d.resources['同袍目标']))))if(rank(d,6))add(d,'腾荒 E6 · 易伤','vuln',rank(d,6),{debuff:true});
    if(is(u,1412)){if(trace(u,2))add(u,'见者 · 暴击率','critRate',trace(u,2)[0]);if(trace(u,1)){const p=trace(u,1);add(u,'来者 · 攻击转暴伤','critDmg',Math.min(p[3],Math.max(0,combatPanel(u).atk-p[0])/p[1]*p[2]));}if(live(get(b,u.resources['军功目标']))&&u.resources['军功目标']!==u.id){if(rank(u,2,1))add(u,'刻律德菈 E2 · 增伤','dmgBoost',rank(u,2,1));if(rank(u,6))add(u,'刻律德菈 E6 · 抗穿','resPen',rank(u,6));}}
    if(is(u,1015)){if(rank(u,4))add(u,'Archer E4 · 终结增伤','dmgBoost',rank(u,4),{abilityType:'Ultra'});if(rank(u,6,1))add(u,'Archer E6 · 战技无视防御','defIgnore',rank(u,6,1),{abilityType:'BPSkill'});}
    for(const source of b.units.filter(s=>live(s)&&s.side===u.side)){
      const p=cone(source,21011);if(p&&u.element===source.element)add(source,'与行星相会','dmgBoost',p[0],{note:'仅 '+source.element+' 属性伤害'});
      for(const s of source.gear?.sets??[]){if(s.id===302&&combatPanel(source).speed>=s.p2[1])add(source,s.name+' · 全队攻击','atkPct',s.p2[2]);if(s.id===310&&combatPanel(source).effectRes>=s.p2[1])add(source,s.name+' · 全队暴伤','critDmg',s.p2[2]);if(s.id===312&&source!==u&&source.element===u.element)add(source,s.name+' · 同属性增伤','dmgBoost',s.p2[1]);}
      const hermit=set(source,128);if(hermit?.count>=4&&u.shields.some(sh=>sh.source===source.id&&sh.value>0))add(source,hermit.name+' · 持有来源护盾','critDmg',hermit.p4[1]);
    }
    const g=tag(u,'garrison'),from=g?get(b,g.source):null,p=from?cone(from,23051):null;if(p&&b.summons.some(s=>s.active&&s.bondmate===u.id))add(from,'卫戍 · 持有召唤物','dmgBoost',p[2],{remaining:g.remaining,tickOwner:u.id});
    const silent=cone(u,21003);if(silent&&enemies(b,u).length<=2)add(u,'唯有沉默 · 暴击率','critRate',silent[1]);
    for(const s of u.gear?.sets??[]){if(s.id===108&&s.count>=4)add(u,s.name+' · 无视防御','defIgnore',s.p4[0],{note:'目标有量子弱点时额外 '+Math.round(s.p4[1]*100)+'%'});
      if(s.id===301&&combatPanel(u).speed>=s.p2[1])add(u,s.name+' · 速度达标','atkPct',s.p2[2]);
      if(s.id===303)add(u,s.name+' · 命中转攻击','atkPct',Math.min(s.p2[2],(combatPanel(u).effectHit??0)*s.p2[1]));
      if(s.id===304&&combatPanel(u).effectHit>=s.p2[1])add(u,s.name+' · 命中达标','defPct',s.p2[2]);
      if(s.id===307&&combatPanel(u).speed>=s.p2[1])add(u,s.name+' · 速度达标','breakEffect',s.p2[2]);
      if(s.id===306&&combatPanel(u).critRate>=s.p2[1])add(u,s.name+' · 终结与追击','dmgBoost',s.p2[2],{note:'仅终结技与追加攻击'});
      if(s.id===311&&combatPanel(u).speed>=s.p2[1])add(u,s.name+' · 速度达标','dmgBoost',combatPanel(u).speed>=s.p2[2]?s.p2[4]:s.p2[3]);
      if(s.id===319&&combatPanel(u).hp>=s.p2[1])add(u,s.name+' · 生命达标','critDmg',s.p2[2]);
      if(s.id===320&&combatPanel(u).speed>=s.p2[1])add(u,s.name+' · 速度达标','healingBoost',combatPanel(u).speed>=s.p2[2]?s.p2[4]:s.p2[3]);
      if(s.id===309&&combatPanel(u).critRate>=s.p2[1])for(const type of ['Normal','BPSkill'])add(u,s.name+' · '+type,'dmgBoost',s.p2[2],{abilityType:type});
      if(s.id===318&&b.summons.some(s=>s.active&&s.bondmate===u.id))add(u,s.name+' · 持有召唤物','critDmg',s.p2[1]);
      if(s.id===122&&s.count>=4)for(const type of ['BPSkill','Ultra'])add(u,s.name+' · '+type,'dmgBoost',s.p4[0],{abilityType:type});
      if(s.id===102&&s.count>=4)add(u,s.name+' · 普攻增伤','dmgBoost',s.p4[1],{abilityType:'Normal'});
    }
    out.push(...relics.display(b,u),...roster.display(b,u));return out;
  }
  return {unitCreated:roster.unitCreated,actionEventStart:roster.actionEventStart,actionEventEnd:roster.actionEventEnd,onStart,onWaveStart,beforeRecover,weaknessBreak:roster.weaknessBreak,beforeLethal,redirectDamage:roster.redirectDamage,energy,dot,prepare,before,after,copyOwner,consumeCopy,onTurnStart,onTurnEnd,modifiers,dragon,summonTurn:roster.summonTurn,hasSummonTurn:roster.hasSummonTurn,onEffectExpire:roster.onEffectExpire,onEffectRemove:roster.onEffectRemove,spSpent:roster.spSpent,sp,spend,sync,supportTarget,displayEffects,relics,panel:roster.panel,repeatStart:roster.repeatStart,hit:roster.hit,afterHit:roster.afterHit,afterDamage:roster.afterDamage,hpChanged:roster.hpChanged,shouldUseSkill:roster.shouldUseSkill,attacked(b,to,from){roster.attacked(b,to,from);equipment.attacked(b,to);},death:roster.death};
}
