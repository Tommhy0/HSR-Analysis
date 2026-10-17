import assert from 'node:assert/strict';
import {createBattle,simulateBattle,validateBattle} from '../simulator/engine.mjs';
import {auditVideoCase,compareVideoRun} from '../simulator/video-validation.mjs';
import {sixShotCheckpoint,videoFollowupCheckpoint,videoAuditReport,videoHPCheckpoint} from './validate_zero_cycle_videos.mjs';
import {KIT_IDS} from '../simulator/kits.mjs';
import {ROSTER_DATA} from '../simulator/roster-data.mjs';
// 98 名角色均已登记，已不存在「尚未登记角色」；用未登记 ID 代表尚未实现机制的角色。
const unregisteredId=9999999;
const panel={hp:10000,atk:100,def:0,speed:100,critRate:0,critDmg:0,energyRegen:1,baseStats:{hp:10000,atk:100,def:0},elemDmg:{}};
const u=(id,side='ally')=>({id,name:id,side,level:80,element:'Physical',panel:structuredClone(panel),energy:100,energyMax:100,policy:{autoUltimate:false,basicOnly:true},actions:{basic:{name:'普攻',type:'Normal',terms:[{scaling:'atk',multiplier:1}]},skill:{name:'战技',type:'BPSkill',spCost:1,terms:[{scaling:'atk',multiplier:2}]},ultimate:{name:'大招',type:'Ultra',energyCost:100,terms:[{scaling:'atk',multiplier:3}]}}});
const config=()=>{const a=u('a'),b=u('b'),e=u('e','enemy');a.panel.speed=200;e.panel.speed=1;return {strict:true,sp:3,maxSP:5,maxAV:101,units:[a,b,e],actionPlan:[{after:{actor:'a',key:'basic',kind:'normal',occurrence:1},actor:'b',key:'ultimate',targetId:'e'}]};};
let passed=0;const test=(name,fn)=>{fn();passed++;console.log('PASS '+name);};
test('手动操作轴在指定第几次动作后插入，关闭自动后不会提前满能开大',()=>{const c=config(),r=simulateBattle(c),a=r.log.filter(e=>e.type==='action');assert.equal(a[0].actor,'a');assert.equal(a[0].key,'basic');assert.equal(a[1].actor,'b');assert.equal(a[1].kind,'ultimate');assert.equal(a[1].av,a[0].av);assert.deepEqual(r.plan,{used:[0],unused:[]});});
test('同一窗口的多个手动大招保留录像顺序，不能按站位重排',()=>{const c=config();c.actionPlan.push({after:{actor:'a',key:'basic',kind:'normal',occurrence:1},actor:'a',key:'ultimate'});const a=simulateBattle(c).log.filter(e=>e.type==='action');assert.deepEqual(a.slice(0,3).map(e=>[e.actor,e.key]),[['a','basic'],['b','ultimate'],['a','ultimate']]);});
test('留大到第二次指定动作才插入，未触发计划明确列为未执行',()=>{const c=config();c.actionPlan[0].after.occurrence=3;const r=simulateBattle(c);assert.ok(!r.log.some(e=>e.type==='action'&&e.kind==='ultimate'));assert.deepEqual(r.plan.unused,[0]);});
test('能量不足的录像指令报错，不偷偷换成其他技能或继续声称复现',()=>{const c=config();c.units[1].energy=0;assert.throws(()=>simulateBattle(c),/录像操作轴.*能量不足/);});
test('明确目标已死时拒绝自动换靶',()=>{const c=config();c.units[2].panel.hp=50;const other=u('other','enemy');other.panel.speed=1;c.units.push(other);assert.throws(()=>simulateBattle(c),/不能自动换靶/);});
test('逐回合可指定普攻/战技与目标，重复回合与资源不足明确拒绝',()=>{const c=config();c.actionPlan=[];c.units[0].policy.turnPlan=[{turn:1,key:'skill',targetId:'e'},{turn:2,key:'basic',targetId:'e'}];const a=simulateBattle(c).log.filter(e=>e.type==='action'&&e.actor==='a');assert.deepEqual(a.slice(0,2).map(e=>e.key),['skill','basic']);c.sp=0;assert.throws(()=>simulateBattle(c),/资源不足/);c.units[0].policy.turnPlan.push({turn:2,key:'basic'});assert.ok(validateBattle(c).some(s=>s.includes('逐回合')));});
test('操作轴与自动大招不能混用，奇袭首段不伪造独立插入窗口',()=>{const c=config();c.units[1].policy.autoUltimate=true;assert.ok(validateBattle(c).some(s=>s.includes('关闭自动')));c.units[1].policy.autoUltimate=false;c.actionPlan[0].after.kind='copy';assert.ok(validateBattle(c).some(s=>s.includes('奇袭首段')));});
const specimen={id:'unit-test-only',characters:[1306,1414,1015,1412],mode:'moc',gameVersion:'4.6',missingInputs:[],requiredSystems:[],observedCheckpoints:[{title:'独立给定的测试值',type:'damage',actor:'a',field:'damage',expected:100,tolerance:1}]};
const fake=()=>({config:{units:specimen.characters.map(characterId=>({side:'ally',characterId}))},outcome:'victory',plan:{unused:[]},log:[{type:'damage',actor:'a',damage:100,av:20,cycle:0},{type:'battle_end',cycle:0}]});
test('对照器按独立期望值检查，数值不符给出首次偏差',()=>{const r=fake();assert.equal(compareVideoRun(specimen,r).status,'passed');r.log[0].damage=105;const result=compareVideoRun(specimen,r);assert.equal(result.status,'failed');assert.equal(result.firstDivergence.error,5);});
test('0T必须清场且每波未耗轮，150AV截断不等于0T，操作轴漏项不通过',()=>{const r=fake();r.outcome='time_limit';assert.equal(compareVideoRun(specimen,r).verified,false);r.outcome='victory';r.log.at(-1).cycle=1;assert.equal(compareVideoRun(specimen,r).verified,false);r.log.at(-1).cycle=0;r.plan.unused=[1];assert.equal(compareVideoRun(specimen,r).verified,false);});
test('缺录像实测点、跨版本或未实现队友时阻止给出通过',()=>{assert.equal(auditVideoCase({...specimen,observedCheckpoints:[]}).status,'blocked');assert.equal(auditVideoCase({...specimen,gameVersion:'3.5'}).status,'blocked');assert.equal(auditVideoCase({...specimen,characters:[1015,1306,unregisteredId,1412]}).status,'blocked');});
test('原作者6箭纸面循环可复算，不能将此计成完整视频0T通过',()=>{const p=sixShotCheckpoint();assert.equal(p.ok,true);assert.equal(p.actual.shots,6);assert.equal(p.actual.energy,220);const r=videoAuditReport();assert.equal(r.fullVideoPasses,0);assert.equal(r.rows.length,5);assert.ok(r.rows.every(r=>r.status==='blocked'&&!r.verified));});
test('新操作轴不改变未配置操作轴的原有行为',()=>{const c=config();delete c.actionPlan;assert.doesNotThrow(()=>createBattle(c));const a=simulateBattle(c),b=simulateBattle({...c,actionPlan:[]});delete a.config;delete b.config;assert.deepEqual(a,b);});


test('公开视频独立抄录的2→3战技点与追击退款一致，仍不计整场0T通过',()=>{const p=videoFollowupCheckpoint();assert.equal(p.ok,true);assert.equal(p.kind,'observed_video_resource_checkpoint');assert.equal(p.actual.after,3);assert.equal(p.actual.refund,1);});
test('已实现缇宝不再误报为缺失角色系统，历史版本和Boss仍阻止完整对拍',()=>{const r=auditVideoCase({...specimen,characters:[1015,1306,1403,1412],gameVersion:'3.6',requiredSystems:['tribbie-kit','moc-3.6-lygos-stage']});assert.deepEqual(r.missingCharacters,[]);assert.deepEqual(r.missingSystems,['moc-3.6-lygos-stage']);assert.equal(r.status,'blocked');});
test('公开视频独立抄录的4250→5643生命转换相符，不计整场0T通过',()=>{const p=videoHPCheckpoint();assert.equal(p.ok,true);assert.equal(p.actual.display,5643);assert.equal(videoAuditReport().fullVideoPasses,0);});

console.log(`Video validation infrastructure checks: ${passed} passed.`);
