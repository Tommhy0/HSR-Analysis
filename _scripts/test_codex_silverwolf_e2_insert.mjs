import assert from 'node:assert/strict';
import {ctx,dummy} from './codex_test_helpers.mjs';
import {newBattleBuild,buildBattleActor} from '../simulator/builds.mjs';
import {createBattle,stepBattle} from '../simulator/engine.mjs';

function makeBattle(eidolon=2){
  const wolf=buildBattleActor(ctx,{...newBattleBuild(),characterId:1506,eidolon,relicAuto:false});
  wolf.policy={...wolf.policy,autoUltimate:false,basicOnly:false};
  const a=dummy('ally-a'),b=dummy('ally-b'),foe=dummy('enemy','enemy');
  foe.panel={...foe.panel,hp:1e9,speed:1};foe.hp=1e9;
  const battle=createBattle({strict:false,maxAV:500,sp:3,maxSP:9,seed:23,critMode:'noncrit',units:[wolf,a,b,foe]});
  // 本用例只验证 E2 阈值；固定盲盒结果为【爆爆爆炸蛋】，避免随机笑点改写隐藏分累计。
  battle.random=()=>.5;
  const owner=battle.units.find(x=>x.characterId===1506);
  owner.energy=60;owner.resources['隐藏分']=180;owner.resources['笑点快照']=1;
  owner.policy={...owner.policy,turnPlan:[{turn:1,key:'ultimate'}]};
  for(const u of battle.units)u.distance=100000;owner.distance=0;
  battle.laughter.ally=1;
  return {battle,owner};
}

// Rank02 sums the initial hidden score when Ultra starts, then each upward score change.
const {battle,owner}=makeBattle();
assert.equal(stepBattle(battle),true,'E2 ultimate must resolve through the real action queue');
assert.ok(owner.buffs.some(x=>x.tag==='sw999Ult'),'E2 threshold is evaluated only inside 无敌玩家');
assert.equal(owner.resources['E2 累计'],20,'after paying 60 from 180 hidden score, the initial 120 plus trace gain 20 crosses one threshold and leaves 20');
assert.equal(owner.resources['强化普攻剩余'],3,'the threshold restores one use and its inserted enhanced-basic action consumes one use');
assert.equal(battle.log.filter(e=>e.type==='mechanic'&&e.actor===owner.id&&e.name==='银狼LV.999 E2 · 额外回合').length,1,'one 120-point threshold inserts exactly one extra action');

// Pre-Ultimate score must not trigger an extra turn or spend the E2 accumulator.
const {battle:outside,owner:outOwner}=makeBattle();
outOwner.policy={...outOwner.policy,turnPlan:[{turn:1,key:'basic'}]};
outside.units.forEach(u=>u.distance=100000);outOwner.distance=0;
outside.laughter.ally=121;outOwner.resources['笑点快照']=1;
assert.equal(stepBattle(outside),true,'pre-Ultimate basic must resolve');
assert.equal(outOwner.resources['E2 累计'],0,'pre-Ultimate hidden score is excluded from Rank02 SumScore');
assert.equal(outside.queue.filter(q=>q.actor===outOwner.id&&q.kind==='extra').length,0,'Rank02 cannot grant an extra turn outside the ultimate state');
console.log('PASS Silver Wolf LV.999 E2 starts from current score at Ultra, gates extra actions to Ultra, and restores exactly one enhanced-basic use per threshold');
