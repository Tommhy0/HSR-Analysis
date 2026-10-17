import assert from 'node:assert/strict';
import {actor,dummy,force} from './codex_test_helpers.mjs';
import {createBattle} from '../simulator/engine.mjs';
const mk=(yaoguangElation,attackerElation,spCost)=>{
  const y=actor(1502);y.panel={...y.panel,elation:yaoguangElation};y.policy={...y.policy,autoUltimate:false,basicOnly:true};
  const a=dummy('attacker');a.element='Fire';a.panel={...a.panel,elation:attackerElation};a.actions.basic={...a.actions.basic,target:'all',spCost,element:'Fire',toughness:0};a.policy={...a.policy,autoUltimate:false,basicOnly:true};
  const e1=dummy('ice-a','enemy');e1.element='Ice';e1.panel={...e1.panel,hp:1e9,speed:1};e1.hp=1e9;
  const e2=dummy('ice-b','enemy');e2.element='Ice';e2.panel={...e2.panel,hp:1e9,speed:1};e2.hp=1e9;
  const b=createBattle({strict:false,maxAV:500,sp:3,maxSP:9,seed:23,critMode:'noncrit',units:[y,a,e1,e2]});
  const owner=b.units.find(x=>x.characterId===1502),source=b.units.find(x=>x.id==='attacker');
  owner.resources['好活当赏']=100;
  return {b,owner,source,enemies:b.units.filter(x=>x.side==='enemy')};
};
for(const [ownerElation,sourceElation,expectedSource] of [[.2,.8,'attacker'],[.8,.2,'char-1502']]){
  const {b,owner,source,enemies}=mk(ownerElation,sourceElation,1);
  for(const u of b.units)u.distance=100000;source.distance=0;
  force(b,source,'basic');
  const hits=b.log.filter(e=>e.type==='damage'&&e.kind==='elation');
  const actualTargets=b.log.filter(e=>e.type==='damage'&&e.actor===source.id&&e.kind==='direct').map(e=>e.target);
  assert.equal(actualTargets.length,2,'构造动作须实际命中两名敌人');
  assert.equal(hits.length,2,'每次消耗战技点应触发两次额外欢愉伤害');
  assert.ok(hits.every(e=>e.actor===expectedSource),'欢愉度较高的一方应提供额外伤害面板');
  assert.ok(hits.every(e=>actualTargets.includes(e.target)),'目标必须是本动作实际命中的敌人之一');
  assert.ok(hits.every(e=>e.element==='Fire'),'欢愉伤害属性应跟随触发攻击，而不是目标属性');
  assert.equal(new Set(hits.map(e=>e.target)).size,1,'同一动作的重复触发应命中同一随机目标');
}
{
 const {b,owner}=mk(.5,.1,0);for(const u of b.units)u.distance=100000;owner.distance=0;
 force(b,owner,'elation','elation');assert.ok(b.log.some(e=>e.type==='sp'&&e.actor===owner.id&&e.reason==='爻光行迹 · 施放欢愉技'&&e.requested===1),'point07 必须在欢愉技结算时单独请求恢复1点战技点');
}
console.log('PASS Yaoguang: random actual hit target, SP-cost double proc, element, higher Elation source, and Elation-skill SP refund');
