import assert from 'node:assert/strict';
import {actor,dummy,ctx} from './codex_test_helpers.mjs';
import {buildBattleActor,newBattleBuild} from '../simulator/builds.mjs';
import {createBattle,combatPanel} from '../simulator/engine.mjs';
import {ROSTER_DATA} from '../simulator/roster-data.mjs';
for(const eidolon of [0,2]){
  const template=actor(1413),u=eidolon?buildBattleActor(ctx,{...newBattleBuild(),characterId:1413,eidolon,relicAuto:false,panel:template.panel}):template;
  u.policy={...u.policy,autoUltimate:false,basicOnly:true};
  const mate=dummy('mate'),foe=dummy('foe','enemy');foe.panel={...foe.panel,hp:1e9};foe.hp=1e9;
  const b=createBattle({strict:false,maxAV:500,sp:3,maxSP:9,seed:11,critMode:'noncrit',units:[u,mate,foe]});
  const owner=b.units.find(x=>x.characterId===1413),night=b.units.find(x=>x.memospriteOwner===owner.id);assert.ok(night);
  const rawOwner=owner.panel.critDmg,rawNight=night.panel.critDmg;
  assert.ok(Math.abs(combatPanel(owner).critDmg-rawOwner-(eidolon===2?.4:0))<1e-8,'E2 40% 暴伤应常驻于长夜月');
  assert.ok(Math.abs(combatPanel(night).critDmg-rawNight-(eidolon===2?.4:0))<1e-8,'E2 40% 暴伤应常驻于忆灵长夜');
  const ownerBeforeSkill=combatPanel(owner).critDmg;
  b.rules.before(b,owner,'skill','normal',owner.actions.skill,[owner],[]);
  const transferred=night.buffs.find(x=>x.id===owner.id+':skill-cd');assert.ok(transferred);
  const ratio=ROSTER_DATA[1413].skills['141302'].params['10'].param_list[0];
  assert.ok(Math.abs(transferred.value-ownerBeforeSkill*ratio)<1e-8,
    '战技分享给忆灵的暴伤必须只按战技原始倍率计算');
}
console.log('PASS Evernight E2 owner/servant +40% CRIT DMG and source-defined skill transfer ratio');
