import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createContext} from '../core/ctx.mjs';
import {inspectEndgameTarget} from '../simulator/endgame-scenes.mjs';
import {abundanceSpriteGoldenHound,isEnemyMechanicRegistered,validateEnemyActor} from '../simulator/encounters.mjs';
import {createBattle,stepBattle} from '../simulator/engine.mjs';
import {strictParty} from '../simulator/party.mjs';

const ctx=createContext(JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url))));
const inspected=inspectEndgameTarget(ctx,{mode:'pf',seasonId:2027,floorId:'20274',side:1});
const source=inspected.enemies.find(enemy=>enemy.childId===2022040);
assert.ok(source,'PF 20274/S1 source waves include Abundance Sprite: Golden Hound');

const actor=abundanceSpriteGoldenHound(ctx,{sceneEnemy:source,id:'golden-hound'});
assert.deepEqual(validateEnemyActor(actor),[]);
assert.equal(isEnemyMechanicRegistered(2022040),true);
assert.equal(actor.panel.hp,source.hp);
assert.equal(actor.panel.speed,source.speed);
assert.equal(actor.toughnessMax,source.toughness??source.stance);
assert.deepEqual(actor.enemyKit.skill01Params,[2.5]);
assert.equal(actor.enemyMechanicNotes.length,1,'the death passive remains an explicit gap');

const party=structuredClone(strictParty(ctx).units.filter(unit=>unit.side==='ally'));
for(const unit of party){
  delete unit.kit;delete unit.characterId;delete unit.gear;delete unit.memospriteOwner;
  unit.panel={hp:1e9,atk:0,def:0,speed:1,critRate:0,critDmg:0,effectRes:0,energyRegen:1,elemDmg:{},baseStats:{hp:1e9,atk:0,def:0}};
  unit.hp=1e9;unit.energy=0;unit.energyMax=100;unit.buffs=[];unit.shields=[];unit.dots=[];unit.resources={};
  unit.actions={basic:{name:'probe',type:'Normal',element:'Physical',target:'single',terms:[]}};
  unit.policy={autoUltimate:false,basicOnly:true};unit.standardBreak=false;
}
const battle=createBattle({strict:false,maxAV:1000,sp:3,maxSP:9,seed:47,critMode:'noncrit',units:[...party,actor]});
for(const unit of battle.units)unit.distance=10000;
const liveActor=battle.units.find(unit=>unit.id==='golden-hound');liveActor.distance=0;
assert.equal(stepBattle(battle),true);
const action=battle.log.find(event=>event.type==='action'&&event.actor===liveActor.id);
assert.equal(action.key,'skill01');
assert.equal(action.name,'角牴');
const damage=battle.log.find(event=>event.type==='damage'&&event.actor===liveActor.id&&event.kind==='direct');
assert.ok(damage,'the common SequenceThree route produces an executable direct hit');
assert.equal(damage.hitEnergy,10);
assert.equal(damage.target,action.targets[0]);

console.log('PF 20274/S1 Golden Hound checks: source wave record / panel, 2.5x Wind attack, hit energy, and explicit unimplemented death passive passed.');
