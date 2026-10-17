import assert from 'node:assert/strict';
import {actor,dummy,force,ctx} from './codex_test_helpers.mjs';
import {buildBattleActor,newBattleBuild} from '../simulator/builds.mjs';
import {createBattle,combatPanel} from '../simulator/engine.mjs';
const run=eidolon=>{
  const base=actor(1415),cyrene=eidolon?buildBattleActor(ctx,{...newBattleBuild(),characterId:1415,eidolon,relicAuto:false,panel:base.panel}):base;
  cyrene.policy={...cyrene.policy,autoUltimate:false,basicOnly:true};
  const mate=dummy('mate'),foe=dummy('foe','enemy');foe.panel={...foe.panel,hp:1e9};foe.hp=1e9;
  const b=createBattle({strict:false,maxAV:1000,sp:3,maxSP:9,seed:33,critMode:'noncrit',units:[cyrene,mate,foe]});
  const u=b.units.find(x=>x.characterId===1415);u.resources['追忆']=24;u.energy=24;
  force(b,u,'ultimate');
  const demo=b.units.find(x=>x.memospriteOwner===u.id);assert.ok(demo,'首次终结必须召唤德谬歌');
  demo.resources['舞曲次数']=0;u.resources['真我诗篇待结算']=0;u.resources['额外弹射']=0;
  b.rules.after(b,demo,'basic','extra',demo.actions.basic,[foe],[foe]);
  assert.equal(demo.resources['舞曲次数'],1,'首次舞曲应记录一层前置次数');
  u.resources['真我诗篇待结算']=1;u.resources['额外弹射']=1;
  const before=b.log.filter(e=>e.type==='damage'&&e.actor===demo.id&&e.kind==='additional').length;
  b.rules.after(b,demo,'basic','extra',demo.actions.basic,[foe],[foe]);
  const bounce=b.log.filter(e=>e.type==='damage'&&e.actor===demo.id&&e.kind==='additional').slice(before);
  assert.ok(bounce.length>0,'真我诗篇应结算弹射');
  return {bounce,demo};
};
for(const eidolon of [0,4]){
  const {bounce,demo}=run(eidolon),expected=combatPanel(demo).hp*.84*(eidolon===4?1.06:1);
  for(const damage of bounce){
    assert.ok(Number.isFinite(damage.damage),'弹射伤害必须为有限数');
    assert.ok(Math.abs(damage.formula.find(x=>x.zone==='base').value-expected)<1e-6,
      `E${eidolon} 真我诗篇弹射倍率：期望 ${expected}，实际 ${damage.formula.find(x=>x.zone==='base').value}`);
  }
}
console.log('PASS Cyrene E4 prior-dance stack increases True Self poem bounce by 6%');
