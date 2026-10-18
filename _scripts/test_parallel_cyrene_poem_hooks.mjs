// 昔涟三篇诗的目标角色钩子：门径（缇宝额外附加）、理性（那刻夏战技次数+3）、律法（刻律德菈奇袭结束+1充能）。
// 来源：4.6 技能文本 + 社区攻略（门径/理性/律法）。
import assert from 'node:assert/strict';
import {actor,dummy,force} from './codex_test_helpers.mjs';
import {createBattle} from '../simulator/engine.mjs';
const battle=units=>createBattle({strict:false,maxAV:800,maxEvents:30000,sp:3,maxSP:9,seed:17,critMode:'noncrit',units});
function poemFor(targetId){
  const c=actor(1415),t=actor(targetId),e=dummy('enemy','enemy');
  e.hp=1e9;e.panel={...e.panel,hp:1e9};
  const b=battle([c,t,e]);
  const cy=b.units[0],to=b.units[1];
  cy.energy=24;cy.policy.allyTargetId=to.id;
  force(b,cy,'ultimate');
  return {b,cy,to,en:b.units[2]};
}
let passed=0,failed=0;const test=(name,fn)=>{try{fn();passed++;console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+'\n'+e.stack);}};

test('门径诗：缇宝追加攻击触发结界时额外 1 次附加伤害',()=>{
  const {b,to,en}=poemFor(1403);
  assert.ok(to.buffs.some(e=>String(e.tag??'').startsWith('cyreneGatePoem:')),'应持有门径诗篇标记');
  to.buffs.push({id:'field-test',name:'缇宝结界',key:'marker',value:0,tag:'tribbieField'});
  b.activeAction={sequence:b.log.length,actor:to.id};
  const n0=b.log.filter(e=>e.type==='damage'&&e.actor===to.id&&e.kind==='additional').length;
  b.rules.after(b,to,'followup','followup',{name:'test',type:'Additional',terms:[],toughness:0},[en],[en]);
  const n1=b.log.filter(e=>e.type==='damage'&&e.actor===to.id&&e.kind==='additional').length;
  assert.equal(n1-n0,2,'1 次基础附加 + 门径额外 1 次');
});

test('理性诗：那刻夏下一次战技伤害次数 +3，并消耗次数',()=>{
  const skillHits=extra=>{
    const t=actor(1405),e=dummy('enemy','enemy');e.hp=1e9;e.panel={...e.panel,hp:1e9};
    const b=battle([t,e]);const u=b.units[0];
    // createBattle 会规范化单位对象，资源必须写到战斗内的同一单位上。
    u.resources['Cyrene理性诗篇次数']=extra;
    const n0=b.log.filter(x=>x.type==='damage'&&x.actor===u.id).length;
    force(b,u,'skill');
    return b.log.filter(x=>x.type==='damage'&&x.actor===u.id).length-n0;
  };
  // 同一随机种子、同一编队，只改变诗篇次数，隔离 +3。
  assert.equal(skillHits(3)-skillHits(0),3,'诗篇应比无诗篇多结算 3 次伤害');
  const {b,to}=poemFor(1405);
  assert.equal(to.resources['Cyrene理性诗篇次数'],3);
  force(b,to,'skill');
  assert.equal(to.resources['Cyrene理性诗篇次数'],0,'次数应被消耗');
});

test('律法诗：刻律德菈奇袭结束后获得 1 点充能',()=>{
  const {b,to}=poemFor(1412);
  assert.ok(Object.keys(to.resources).some(k=>k.startsWith('Cyrene律法诗篇:')),'应持有律法诗篇资源');
  to.resources['充能']=0;
  b.rules.consumeCopy(b,to,b.units[0]);
  assert.equal(to.resources['充能'],1,'奇袭结束应 +1 充能');
});

console.log(`Cyrene poem hooks: ${passed} passed, ${failed} failed.`);
if(failed)process.exitCode=1;
