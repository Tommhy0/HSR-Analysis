import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createContext} from '../core/ctx.mjs';
import {createBattle,stepBattle,validateBattle} from '../simulator/engine.mjs';
import {godDevourerOffspring,validateEnemyActor} from '../simulator/encounters.mjs';
import {buildEndgameEncounter} from '../simulator/endgame-battles.mjs';
import {inspectEndgameTarget} from '../simulator/endgame-scenes.mjs';
import {strictParty} from '../simulator/party.mjs';

const ctx=createContext(JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url))));
const expected=[
  {floorId:'5505',level:78,hp:230889.4,speed:144,toughness:180,wave:1},
  {floorId:'5511',level:92,hp:957065.7,speed:158.4,toughness:180,wave:0},
];
for(const entry of expected){
  const source=inspectEndgameTarget(ctx,{mode:'moc',seasonId:1036,floorId:entry.floorId,side:2});
  const enemy=source.enemies.find(row=>row.childId===5023020);
  assert.ok(enemy,`${entry.floorId}/S2 source lineup contains God-Devourer Offspring`);
  assert.deepEqual([enemy.level,enemy.hp,enemy.speed,enemy.toughness,enemy.wave],
    [entry.level,entry.hp,entry.speed,entry.toughness,entry.wave]);
  const actor=godDevourerOffspring(ctx,{sceneEnemy:enemy,id:'devourer'});
  assert.deepEqual(validateEnemyActor(actor),[]);
  assert.deepEqual(actor.actions.skill01.terms,[{scaling:'atk',multiplier:2}]);
  assert.deepEqual(actor.actions.skill04.terms,[{scaling:'atk',multiplier:2.4}]);
  assert.equal(actor.enemyMechanicNotes.length,4,'unknown AI and Devouring callbacks remain explicit');

  if(entry.floorId==='5511'){
    assert.deepEqual(source.behaviorGaps,['虫群•真蛰虫'],
      'registering 外宇宙之炎 leaves only the swarm mother as a 5511/S2 blocker');
    continue;
  }

  const config=buildEndgameEncounter(ctx,strictParty(ctx),{mode:'moc',seasonId:1036,floorId:entry.floorId,side:2});
  assert.equal(config.sceneReplay.enemyLineupComplete,true);
  assert.equal(config.sceneReplay.enemyBehaviorRegistered,true);
  assert.equal(config.sceneReplay.enemyBehaviorComplete,false,'Devouring and its reaction callbacks are not complete');
  const runtimeEnemy=config.units.find(unit=>unit.childId===5023020);
  assert.ok(runtimeEnemy);
  assert.deepEqual(validateBattle(config),[]);

  const battle=createBattle(config),boss=battle.units.find(unit=>unit.childId===5023020);
  for(const unit of battle.units){unit.distance=10000;if(unit.side==='enemy'&&unit!==boss){unit.active=false;unit.hp=0;}}
  boss.active=true;boss.hp=boss.panel.hp;boss.wave=1;
  boss.distance=0;
  assert.equal(stepBattle(battle),true);
  assert.ok(battle.log.some(event=>event.type==='action'&&event.actor===boss.id&&event.key==='skill01'),
    'fallback turn uses the explicitly disclosed source-backed single-target attack');
}
console.log('MoC God-Devourer checks: local SQLite appearances and panels, sourced Fire attack ratios, 5505/S2 builds, 5511/S2 reports only the swarm mother as its remaining enemy blocker, and unknown Devouring mechanics stay explicitly incomplete.');
