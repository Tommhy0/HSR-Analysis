import assert from 'node:assert/strict';
import {ctx,dummy} from './codex_test_helpers.mjs';
import {newBattleBuild,buildBattleActor} from '../simulator/builds.mjs';
import {createBattle,stepBattle,combatPanel} from '../simulator/engine.mjs';
import {BREAK_BASE} from '../simulator/game-data.mjs';
import {ROSTER_DATA} from '../simulator/roster-data.mjs';

const counted=20;
for(const eidolon of [0,4]){
  const owner=buildBattleActor(ctx,{...newBattleBuild(),characterId:1506,eidolon,relicAuto:false});
  owner.policy={...owner.policy,autoUltimate:false,basicOnly:true};
  const foe=dummy('foe','enemy');foe.panel={...foe.panel,hp:1e9,speed:1};foe.hp=1e9;
  const b=createBattle({strict:false,maxAV:500,sp:3,maxSP:9,seed:17,critMode:'noncrit',units:[owner,foe]});
  const u=b.units.find(x=>x.characterId===1506);b.laughter.ally=counted;
  // 150621「崩坏级伤害演示」是【无敌玩家】期间的强化欢愉技；常态欢愉技 150620 只回隐藏分。
  u.energy=u.energyMax;
  b.rules.before(b,u,'ultimate','ultimate',u.actions.ultimate,[u]);
  b.queue.push({actor:u.id,key:'elation',kind:'extra'});
  assert.equal(stepBattle(b),true,'queued Elation skill should resolve through stepBattle');
  const hit=b.log.find(e=>e.type==='damage'&&e.actor===u.id&&e.kind==='elation');
  assert.ok(hit,'Silver Wolf Elation skill must produce a real Elation damage event');
  const multiplier=ROSTER_DATA[1506].skills['150621'].params[String(eidolon>=3?11:10)].param_list[0];
  const points=counted*(eidolon>=4?6:1);
  const expected=BREAK_BASE[u.level]*2*multiplier*(1+(combatPanel(u).elation??0))*(1+5*points/(points+240));
  const actual=hit.formula.find(f=>f.zone==='base')?.value;
  assert.equal(u.actions.elation.punchlineMultiplier,eidolon>=4?6:1,'Rank04 adds five times the base Punchline count, yielding six times total');
  assert.ok(Math.abs(actual-expected)<1e-6,`E${eidolon} Elation skill base ${actual} != source formula ${expected}`);
}
console.log('PASS Silver Wolf LV.999 E4 adds five base Punchline counts to her Elation skill (6× total); E0 remains unchanged');
