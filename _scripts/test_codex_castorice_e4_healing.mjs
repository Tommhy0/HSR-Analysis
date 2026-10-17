import assert from 'node:assert/strict';
import {ctx,dummy} from './codex_test_helpers.mjs';
import {newBattleBuild,buildBattleActor} from '../simulator/builds.mjs';
import {createBattle,stepBattle,combatPanel} from '../simulator/engine.mjs';
const panel=(hp,atk=1000,speed=100)=>({hp,atk,def:1000,speed,baseStats:{hp,atk,def:1000},critRate:0,critDmg:1,energyRegen:1,effectHit:0,effectRes:0,breakEffect:0,elemDmg:{}});
for(const eidolon of [0,4]){
  const c=buildBattleActor(ctx,{...newBattleBuild(),characterId:1407,eidolon,level:80,technique:false,relicAuto:false,panel:panel(10000)});c.energy=0;c.policy={...c.policy,autoUltimate:false,basicOnly:true};
  const healer=dummy('healer'),wounded=dummy('wounded'),foe=dummy('foe','enemy');
  healer.panel=panel(10000,1000,200);healer.hp=10000;healer.actions.basic.effects=[{type:'heal',target:'allies',scaling:'atk',multiplier:1}];healer.policy={...healer.policy,autoUltimate:false,basicOnly:true};
  wounded.panel=panel(10000,1000,1);wounded.hp=5000;wounded.policy={...wounded.policy,autoUltimate:false,basicOnly:true};
  foe.panel=panel(1e9,1000,1);foe.hp=1e9;foe.rank='normal';foe.policy={...foe.policy,autoUltimate:false,basicOnly:true};
  const b=createBattle({strict:false,maxAV:500,sp:3,maxSP:9,seed:7,critMode:'noncrit',units:[c,healer,wounded,foe]});
  const ally=b.units.find(x=>x.id==='wounded');ally.hp=5000;assert.equal(combatPanel(ally).incomingHeal??0,eidolon===4?.2:0);
  for(const u of b.units)u.distance=100000;b.units.find(x=>x.id==='healer').distance=0;
  assert.equal(stepBattle(b),true);
  const healed=b.log.find(e=>e.type==='heal'&&e.actor==='healer'&&e.target==='wounded');assert.ok(healed,'真实治疗动作必须结算到受伤队友');
  assert.equal(healed.amount,eidolon===4?1200:1000,`E${eidolon} 实际治疗倍率不符`);
}
console.log('PASS Castorice E4 received-healing bonus in actual allied healing');
