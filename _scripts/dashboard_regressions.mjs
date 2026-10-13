import assert from 'node:assert/strict';
import { createContext } from '../core/ctx.mjs';
import { loadScenario, aggregateScenarioBuffs } from '../core/scenario.mjs';
import { computeHit } from '../core/damage.mjs';
import { rowView, catalogValue, buffsFromSelections } from '../core/catalog.mjs';
import { warnings } from '../core/provenance.mjs';
import { renderResults } from '../ui/results.mjs';
import { renderDataView } from '../ui/data-view.mjs';

export function dashboardRegressions(data) {
  const ctx = createContext(data), tests = [];
  const test = (label, fn) => { try { fn(); tests.push({label, pass:true}); } catch(e) { tests.push({label, pass:false, detail:e.message}); } };
  const near = (a,b) => assert.ok(Number.isFinite(a) && Math.abs(a-b)<1e-8, `${a} != ${b}`);
  const panel = { atk:2000,critRate:0,critDmg:.5 }, enemy = { def:1000,res:{Fire:0} };
  const run = (agg,type) => computeHit({ panel,enemy,agg,ability:{type,element:'Fire',terms:[{scaling:'atk',multiplier:1}]} });
  test('新版：情境增益未勾选不自动生效，也不再误报为未收录',()=>{
    const s=loadScenario(ctx,{mode:'as',seasonId:3001,floorId:'30011',annotations:data.annotations,sides:data.annotations.sides});
    assert.ok(s.availableBuffs.length>0);
    assert.ok(!s.buffs.some(e=>e.id==='abyss.as.3001.30011.buff1.b0'));
    assert.ok(!s.gaps.some(e=>e.id==='abyss.as.3001.30011.buff1'));
  });
  test('新版：选中50%终结技增伤只作用于终结技',()=>{
    const id='abyss.as.3001.30011.buff1.b0';
    const s=loadScenario(ctx,{mode:'as',seasonId:3001,floorId:'30011',annotations:data.annotations,sides:data.annotations.sides,selections:{[id]:true}});
    const buff=s.buffs.find(e=>e.id===id);assert.ok(buff);
    near(run(aggregateScenarioBuffs([buff],null,enemy,{}, {type:'Ultra',element:'Fire'}),'Ultra').total,1350);
    near(run(aggregateScenarioBuffs([buff],null,enemy,{}, {type:'Normal',element:'Fire'}),'Normal').total,900);
  });
  test('新版：情境中顿号并列的普攻与战技增伤均保留',()=>{
    const e=data.scenarioEffects['abyss.as.3001.30011.buff4'].effects[0];
    assert.ok(e.scope.abilityTypes.includes('Normal'));assert.ok(e.scope.abilityTypes.includes('BPSkill'));
    for(const type of ['Normal','BPSkill'])near(run(aggregateScenarioBuffs([e],null,enemy,{}, {type,element:'Fire'}),type).total,1350);
  });
  test('新版：受到战技与终结技伤害提高继承敌方易伤语义',()=>{
    const es=data.scenarioEffects['abyss.as.3006.season'].effects;
    for(const b of es){assert.equal(b.key,'vuln');assert.equal(b.side,'enemy');}
    const skill=aggregateScenarioBuffs(es,null,enemy,{}, {type:'BPSkill',element:'Fire'});
    const ultra=aggregateScenarioBuffs(es,null,enemy,{}, {type:'Ultra',element:'Fire'});
    near(skill.vuln,.25);near(ultra.vuln,.15);
  });
  test('新版：数据库补回的彦卿增益跟随等级与属性',()=>{
    const ult=data.buffCatalog.find(e=>e.id==='1209.skill.120903.b0');near(catalogValue(ctx,ult,{}),.6);
    const pen=data.buffCatalog.find(e=>e.id==='1209.rank.4.b1');assert.equal(pen.scope.element,'Ice');
    near(catalogValue(ctx,pen,{}),.12);
    const clara=data.buffCatalog.find(e=>e.id==='1107.skill.110704.b0');assert.ok(rowView(ctx,clara,{}).tags.some(t=>t.label==='仅显示'));
  });
  test('新版：缺口清单剔除已经补回的条目，特殊机制保留原文',()=>{
    const ids=new Set(data.buffCatalog.map(e=>e.id));
    assert.ok(data.dataReport.gaps.every(g=>!ids.has(g.id)));
    assert.ok(data.dataReport.gaps.some(g=>g.category==='mechanics'));
    assert.equal(data.dataReport.missingSkills.length,15);
  });
  test('新版：补回素裳、寒鸦、藿藿加攻，藿藿增益排除自身',()=>{
    const s=data.buffCatalog.find(e=>e.id==='1206.skill.120603.b2');near(catalogValue(ctx,s,{}),.3);
    const h=data.buffCatalog.find(e=>e.id==='1215.skill.121503.b2');near(catalogValue(ctx,h,{}),.6);
    const hh=data.buffCatalog.find(e=>e.id==='1217.skill.121703.b1');near(catalogValue(ctx,hh,{}),.4);
    const ids=new Set([hh.id]);
    assert.equal(buffsFromSelections(ctx,data.buffCatalog,ids,{}, {characterId:1217}).active.length,0);
    near(buffsFromSelections(ctx,data.buffCatalog,ids,{}, {characterId:1003}).active[0].value,.4);
  });
  test('新版：异相资料完整接入且第9期首领血量标为不可用',()=>{
    const upgraded=data._meta.version==='4.6';
    assert.equal(data.peak.seasons.length,upgraded?10:9);assert.equal(data.peak.stages.length,upgraded?40:36);assert.equal(data.peak.monsters.length,upgraded?179:167);
    assert.ok(data.peak.hpNotes.some(h=>h.seasonId===9&&!h.valid));
    assert.ok(data.peak.hpNotes.every(h=>h.verified===false));
  });
  test('新版：自动解析不会报告0条增益未收录',()=>{
    assert.ok(!warnings({zones:{dmgBoost:{level:'partial',missing:[]}}})[0].text.includes('0'));
    near(run(null,'Normal').total,900);
    assert.equal(run(null,'Normal').zones.vuln.level,'known');
  });
  test('新版：结果中主要数值独立展示，详细说明折叠且输入转义',()=>{
    const h=run(null,'Normal');
    const html=renderResults({result:{ok:true,hit:h,ab:{name:'<img>'},active:[],gaps:[]},character:'<script>',critMode:'expected'});
    assert.ok(html.includes('class="bignum">900'));
    assert.ok(html.includes('&lt;script&gt;'));
    assert.ok(html.includes('<details class="result-section">'));
    assert.ok(!html.includes('整体可信度 未知'));
    const page=renderDataView(data,'彦卿');assert.ok(page.includes(String(data.buffCatalog.length)));
  });
  return tests;
}
