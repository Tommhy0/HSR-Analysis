import assert from 'node:assert/strict';
import {ctx,dummy} from './codex_test_helpers.mjs';
import {newBattleBuild,buildBattleActor} from '../simulator/builds.mjs';
import {createBattle,stepBattle} from '../simulator/engine.mjs';

const owner=buildBattleActor(ctx,{...newBattleBuild(),characterId:1407,eidolon:2,technique:true,relicAuto:false});
owner.energy=0;owner.policy={...owner.policy,autoUltimate:false,basicOnly:true};
const a=dummy('ally-a'),b=dummy('ally-b'),c=dummy('ally-c'),foe=dummy('enemy','enemy');
foe.panel={...foe.panel,hp:1e9,speed:1};foe.hp=1e9;
const battle=createBattle({strict:false,maxAV:500,sp:3,maxSP:9,seed:29,critMode:'noncrit',units:[owner,a,b,c,foe]});
const castorice=battle.units.find(x=>x.characterId===1407),dragon=battle.units.find(x=>x.memospriteOwner===castorice.id);
assert.ok(dragon?.active,'4.6 technique SkillMaze path creates the dragon at battle entry');
assert.equal(castorice.resources['炽意'],2,'Rank02 grants its two charges when the technique creates the dragon');
assert.equal(castorice.resources['E2新蕊返还'],0.3,'the technique summon arms the next enhanced-skill Newbud refund');
assert.equal(castorice.distance,0,'Rank02 advances Castorice by 100% when any source summons the dragon');

// Force the dragon's real multi-breath skill: two E2 charges prevent the first two 25% HP payments.
for(const u of battle.units)u.distance=100000;
dragon.distance=0;
const hpBefore=dragon.hp;
assert.equal(stepBattle(battle),true,'dragon breath must resolve through stepBattle');
assert.equal(castorice.resources['炽意'],0,'one charge is spent per breath until depleted');
assert.ok(Math.abs(dragon.hp-(hpBefore-dragon.panel.hp*0.25))<1e-6,'with two charges the third breath, and only the third, pays 25% dragon HP');
console.log('PASS Castorice E2 applies on the technique summon, advances her, arms the refund, and spends charges one breath at a time');
