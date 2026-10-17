// Expected observations are transcribed from the linked authors, never from our output.
import {computeHit} from '../core/damage.mjs';
import {simulateBattle} from './engine.mjs';
export const PUBLIC_SOURCES={
  damage:{title:'arkkus · Star Rail Damage Calculation（原始截图实验）',url:'https://docs.google.com/document/d/e/2PACX-1vQ9M7q5jLz9DKkTRlsGiB8RGYyPQyhShbuTbrVPQ7-Ke4_U787MfWzr2NjY-KrQo5Ota4Lj3JrFyge9/pub',scope:'早期版本基础伤害实验；面板有显示取整，非四人队伍录像'},
  shielding:{title:'bobrokrot · 减伤与护盾实测（2023-05-16）',url:'https://srl.keqingmains.com/evidence/combat-mechanics/damage/Shielding',video:'https://www.youtube.com/watch?v=PiI0gn1wOIo',scope:'公开实验记录可读；原录像在当前浏览器要求登录，未声称逐帧复核'},
  speed:{title:'KQM · Speed and Turn Order',url:'https://hsr.keqingmains.com/misc/speed-guide/',scope:'作者规则与计算实例，非独立伤害录像'},
  order:{title:'KQM SRL · Turn Order Mechanics',url:'https://srl.keqingmains.com/combat-mechanics/turn-order/turn-order-mechanics',scope:'同速排序与行动值规则'},
};
// [name, element, level, ATK, elemental bonus, other bonus, MV, RES, broken, observed]
const DAMAGE_CASES=[
 ['停云 · 非雷弱未击破','Thunder',50,1062,.258,.10,.6,.2,false,312],
 ['停云 · 非雷弱已击破','Thunder',50,1062,.258,.10,.6,.2,true,346],
 ['停云 · 雷弱未击破','Thunder',50,1062,.258,.10,.6,0,false,390],
 ['停云 · 雷弱已击破及攻击增益','Thunder',50,1352,.258,.10,.6,0,true,551],
 ['青雀 · 非量子弱未击破','Quantum',50,1432,.186,.25,.7,.2,false,518],
 ['青雀 · 量子弱未击破','Quantum',50,1432,.186,.25,.7,0,false,648],
 ['青雀 · 量子弱已击破及攻击增益','Quantum',50,1776,.186,.25,.7,0,true,893],
 ['杰帕德 · 冰弱已击破','Ice',50,713,.032,0,.6,0,true,221],
 ['三月七 · 冰弱未击破（剔除击破部分）','Ice',16,130,0,0,.5,0,false,29],
];
const panel=(speed=100)=>({hp:100000,atk:100,def:0,speed,critRate:0,critDmg:0,energyRegen:1,baseStats:{hp:100000,atk:100,def:0},elemDmg:{}});
const unit=(id,side,speed)=>({id,name:id,side,level:80,element:'Physical',panel:panel(speed),energyMax:0,actions:{basic:{name:'普通动作',type:'Normal',terms:[]}},policy:{basicOnly:true}});
const setup=(units,maxAV)=>({strict:true,seed:1,critMode:'noncrit',sp:3,maxSP:5,maxAV,units});
export function runPublicValidation(){
 const rows=[],add=(id,title,source,kind,actual,expected,tolerance=1e-6,note='')=>{const error=typeof actual==='number'&&typeof expected==='number'?Math.abs(actual-expected):actual===expected?0:1;rows.push({id,title,source,kind,actual,expected,error,tolerance,ok:error<=tolerance,note});};
 for(const [i,[title,element,level,atk,elementDmg,other,mv,res,broken,observed]]of DAMAGE_CASES.entries()){
  const r=computeHit({panel:{...panel(),atk,elemDmg:{[element]:elementDmg}},ability:{type:'Normal',element,terms:[{scaling:'atk',multiplier:mv,count:1}],hits:1,multiplierBasis:'per-term'},agg:{dmgBoost:other},enemy:{def:200+10*level,res:{[element]:res}},state:{broken},options:{critMode:'noncrit'},attackerLevel:level});
  add('damage-'+i,title,'damage','published_observation',r.ok?r.total:NaN,observed,1,'作者显示面板已取整；绝对容差 1 点。记录原始差值，不拟合倍率。');
 }
 const fast=unit('125 速度','ally',125),slow=unit('100 速度','ally',100),e=unit('敌人','enemy',1),r=simulateBattle(setup([fast,slow,e],400));
 for(const [id,n]of [[fast.id,5],[slow.id,4]])add('speed-'+n,id+' · 400 AV 内动作数','speed','published_calculation',r.log.filter(x=>x.type==='action'&&x.actor===id).length,n,0);
 const q=unit('134 速度','ally',134),v=simulateBattle(setup([q,unit('敌人','enemy',1)],150));
 add('speed-134','134 速度首轮两动','speed','published_calculation',v.log.filter(x=>x.type==='action'&&x.actor===q.id).length,2,0);
 const tied=simulateBattle(setup([unit('敌人','enemy',100),unit('我方','ally',100)],100));
 add('tie','相同速度时我方优先','order','source_rule',tied.log.find(x=>x.type==='action')?.actor,'我方',0);
 // Recreate the recorded 171 -> 154 ratio. 171 is the measured baseline input,
 // not a claim that the tester's unreported complete character build is reproduced.
 for(const shield of [false,true]){
  const a=unit('受击者','ally',200),b=unit('攻击者','enemy',100);b.panel.atk=171;b.actions.basic.terms=[{scaling:'atk',multiplier:1}];
  a.actions.basic.effects=[{type:'buff',target:'self',key:'dmgReduction',value:.1,duration:5},...(shield?[{type:'shield',target:'self',value:1000,duration:5}]:[])];
  const result=simulateBattle(setup([a,b],100)),hit=result.log.find(x=>x.type==='damage');
  add('shield-'+shield,'10% 减伤'+(shield?'有盾':'无盾')+'（基线 171）','shielding','published_ratio',hit.damage,154,.5,'核对作者公开记录的减伤比例及盾前结算，不验证该实验完整配装。');
  if(shield)add('shield-deduction','护盾扣除与减伤后的伤害一致','shielding','source_rule',hit.absorbed,hit.damage,1e-8);
 }
 const a=unit('输出','ally',100),b=unit('辅助','ally',200);a.energyMax=100;a.energy=70;a.policy={autoUltimate:true};a.actions.basic.energyGain=30;a.actions.ultimate={name:'终结技',type:'Ultra',target:'single',energyCost:100,terms:[{scaling:'atk',multiplier:1}]};
 b.actions.basic.effects=[{type:'buff',target:'allies',key:'dmgBoost',value:1,duration:1}];
 const ult=simulateBattle(setup([a,b,unit('敌人','enemy',1)],100)),hit=ult.log.find(x=>x.type==='damage');
 add('ultimate-window','普通技能后终结技保留本回合增益','speed','source_rule',hit?.damage,180,1e-8,'该用例使用通用动作表达同回合插入窗口，不宣称已实现布洛妮娅角色。');
 const target=unit('受击者','ally',200),attacker=unit('攻击者','enemy',100);attacker.panel.atk=1000;attacker.actions.basic.terms=[{scaling:'atk',multiplier:1}];target.actions.basic.effects=[.2,.08].map((value,i)=>({type:'buff',id:'减伤'+i,key:'dmgReduction',value,duration:5,target:'self'}));
 const reduced=simulateBattle(setup([target,attacker],100));add('mitigation-product','独立 20% 与 8% 减伤相乘','damage','source_rule',reduced.log.find(e=>e.type==='damage').damage,736,1e-8);
 return {checkedAt:'2026-10-16',rows,passed:rows.filter(r=>r.ok).length,failed:rows.filter(r=>!r.ok).length,sources:PUBLIC_SOURCES};
}
