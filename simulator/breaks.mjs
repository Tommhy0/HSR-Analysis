import { computeHit } from '../core/damage.mjs';
import { BREAK_BASE } from './game-data.mjs';
// Internal toughness units: a standard Basic ATK removes 30 (10 on the game UI).
export const STANDARD_BREAK_ELEMENTS=['Physical','Fire','Ice','Thunder','Wind','Quantum','Imaginary'];
export function breakRuntime({record,receiveDamage,delay,combatPanel}){
  function damage(b,from,to,base,element,initial=false,kind=initial?'break':'break_dot',superBreakSource=null){
    // 击破持续伤害（break_dot）本身就是「持续伤害」：角色模块的「受到的持续伤害提高 /
    // 造成的持续伤害提高」（卡芙卡 E1/E2、桑博终结、海瑟音 E1、遗器套装 322 等）是按
    // kind==='dot' 登记的，因此乘区查询把 break_dot 归一为 dot。记录/事件里的 kind 仍保留
    // 'break_dot'，不影响「击破时触发」类机制（它们只认 'break'）。
    const modKind=kind==='break_dot'?'dot':kind;
    const action={type:kind==='superbreak'?'SuperBreak':'Break',element,breakDamage:true,breakKind:kind,superBreakSource},mod=b.rules.modifiers(b,from,to,action,modKind);
    // 击破仅接收显式的击破增伤，通用/元素增伤仍不进入此乘区。
    const agg={dmgBoost:mod.breakDmgBoost??0,defShred:0,defIgnore:mod.defIgnore??0,resPen:{[element]:mod.resPen??0},vuln:mod.vuln??0,dmgReduction:0,abilityDmg:{},elemDmg:{}};
    for(const e of from.buffs){if(e.abilityType&&e.abilityType!=='Break')continue;if(e.key==='defIgnore')agg.defIgnore+=e.value;if(e.key==='resPen')agg.resPen[element]+=e.value;}
    for(const e of to.buffs){if(['defShred','vuln'].includes(e.key))agg[e.key]+=e.value;else if(e.key==='dmgReduction')agg.dmgReduction=1-(1-agg.dmgReduction)*Math.max(0,1-e.value);if(e.resReduction&&e.element===element)agg.resPen[element]+=e.value;}
    // Source-specific superbreak scaling is separate from the break damage bonus zone.
    const ability={type:'Break',element,terms:[{scaling:'atk',multiplier:0,flatAdd:base*(1+(mod.superBreakDmgBoost??0)),count:1}],hits:1,multiplierBasis:'per-term'};
    const hit=computeHit({panel:{...combatPanel(from),critRate:0},ability,agg,enemy:{def:combatPanel(to).def,res:to.res??{}},state:{broken:initial?false:to.broken},options:{critMode:'noncrit'},attackerLevel:from.level});
    if(!hit.ok)throw new Error(hit.error);receiveDamage(b,from,to,hit.total,kind,{element,critMode:'noncrit',formula:hit.trace});
  }
  function apply(b,from,to,element){
    if(!STANDARD_BREAK_ELEMENTS.includes(element))throw new Error('标准击破尚未登记属性 '+element);
    const level=BREAK_BASE[from.level];if(!Number.isFinite(level))throw new Error('缺少等级击破基数');
    const be=1+(combatPanel(from).breakEffect??0),tough=.5+to.toughnessMax/120,base=level*be;
    damage(b,from,to,base*tough*({Physical:2,Fire:2,Ice:1,Thunder:1,Wind:1.5,Quantum:.5,Imaginary:.5})[element],element,true);if(to.hp<=0)return;delay(b,to.id,.25);
    // 1008 阿兰行迹「坚忍」dotRes：抵抗持续伤害类负面状态的概率同样覆盖击破附加的持续伤害
    // （击破 · 灼烧 / 风化 / 触电…）。dotRes=0 时表达式与旧实现逐位一致，不额外消耗随机数。
    const chance=Math.min(1,1.5*(1+(combatPanel(from).effectHit??0))*(1-(combatPanel(to).effectRes??0))*(1-Math.min(1,combatPanel(to).dotRes??0))*(['Ice','Quantum','Imaginary'].includes(element)?1-(combatPanel(to).controlRes??to.controlRes??0):1));
    if(chance<1&&b.random()>=chance){record(b,'resist',to,{name:'击破附加状态被抵抗',element});return;}
    if(element==='Imaginary'){const data={type:'buff',id:from.id+':standard-break:Imaginary',name:'击破 · 禁锢',source:from.id,key:'speedPct',value:-.1,remaining:1,tickOwner:to.id,tickAt:'end',appliedTurn:to.turns,control:'imprisonment',debuff:true};to.buffs=to.buffs.filter(e=>e.id!==data.id);to.buffs.push(data);delay(b,to.id,.3*be);record(b,'buff',from,{target:to.id,name:data.name,key:data.key,value:data.value,duration:1});b.rules.relics.debuff(b,from,to,data);return;}
    const data={type:'dot',id:from.id+':standard-break:'+element,name:'击破 · '+({Physical:'裂伤',Fire:'灼烧',Ice:'冻结',Thunder:'触电',Wind:'风化',Quantum:'纠缠'})[element],source:from.id,remaining:['Ice','Quantum'].includes(element)?1:2,tickOwner:to.id,tickAt:'end',appliedTurn:to.turns,element,base,stacks:1,breakData:true,debuff:true};
    if(element==='Ice'){data.value=base;data.control='freeze';}
    if(element==='Fire')data.value=base;
    if(element==='Thunder')data.value=base*2;
    if(element==='Quantum'){data.value=base*tough*.6;data.control='entangle';data.appliedSequence=b.activeAction?.sequence;delay(b,to.id,.2*be);}
    if(element==='Physical')data.value=Math.min(combatPanel(to).hp*(to.rank==='elite'? .07:.16),level*tough*2)*be;
    if(element==='Wind'){const old=to.dots.find(e=>e.breakData&&e.element==='Wind'&&e.source===from.id);data.stacks=Math.min(5,(old?.stacks??0)+(to.rank==='elite'?3:1));data.value=base;}
    to.dots=to.dots.filter(e=>e.id!==data.id);to.dots.push(data);record(b,'dot',from,{name:data.name,target:to.id,value:data.value,duration:data.remaining,stacks:data.stacks});b.rules.relics.debuff(b,from,to,data);
  }
  function afterAttack(b,targets){for(const to of targets)for(const dot of to.dots.filter(d=>d.breakData&&d.element==='Quantum'))if(dot.appliedSequence!==b.activeAction?.sequence){dot.stacks=Math.min(5,dot.stacks+1);record(b,'resource',to,{name:'纠缠层数',value:dot.stacks});}}
  // 冻结（冰击破）的持续伤害与其它属性一样属于「击破持续伤害」；
  // kind='break' 只保留给真正的弱点击破伤害，否则「击破时触发」的角色机制（阮•梅天赋等）
  // 会在解冻回合的持续伤害上被错误地再次触发。
  function tick(b,to,dot){const from=b.units.find(u=>u.id===dot.source);if(from)damage(b,from,to,dot.value*(dot.element==='Physical'?1:dot.stacks),dot.element,false,'break_dot');if(['Ice','Quantum'].includes(dot.element))to.dots=to.dots.filter(e=>e!==dot);}
  function superBreak(b,from,to,toughness,ratio=1,element=from.element,{source=null,breakEfficiency=null}={}){if(!to.broken||to.hp<=0)return;const level=BREAK_BASE[from.level];if(!Number.isFinite(level))throw new Error('缺少等级击破基数');const p=combatPanel(from);damage(b,from,to,level*toughness/30*Math.max(0,1+(breakEfficiency??p.breakEfficiency??0))*(1+(p.breakEffect??0))*ratio,element,false,'superbreak',source);}
  return {apply,afterAttack,tick,superBreak,damage};
}
