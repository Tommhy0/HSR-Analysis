import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createContext} from '../core/ctx.mjs';
import {createBattle,stepBattle,battleFrame} from '../simulator/engine.mjs';
import {iceOutOfSpace} from '../simulator/encounters.mjs';
import {inspectEndgameTarget} from '../simulator/endgame-scenes.mjs';
import {battleStatistics} from '../simulator/stats.mjs';
import {replayAt} from '../simulator/replay.mjs';
import {registerFrameDefinitions} from '../ui/battle-replay.mjs';
import {renderBattleResult} from '../ui/simulator-view.mjs';

const ctx=createContext(JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url),'utf8')));
const iceSource=inspectEndgameTarget(ctx,{mode:'moc',seasonId:1036,floorId:'5504',side:1}).enemies.find(unit=>unit.childId===8003010);
const unit=(id,side,controlRes=0)=>({id,name:id,side,level:80,element:'Physical',energyMax:100,energy:0,
  panel:{hp:1e7,atk:0,def:0,speed:100,energyRegen:1,effectRes:0,controlRes,critRate:0,critDmg:0,elemDmg:{},baseStats:{hp:1e7,atk:0,def:0}},
  actions:{basic:{name:'probe',type:'Normal',target:'single',terms:[]}},policy:{autoUltimate:false,basicOnly:true}});
const config=units=>({strict:false,maxAV:100,sp:3,maxSP:5,critMode:'noncrit',seed:1,units});
const iceBattle=(controlRes=0)=>createBattle(config([unit('ally','ally',controlRes),iceOutOfSpace(ctx,{sceneEnemy:iceSource,id:'ice'})]));

{
  const battle=iceBattle(.5),[target,ice]=battle.units;
  let draws=0;battle.random=()=>{draws++;return .1;};
  battle.rules.after(battle,ice,'skill03','normal',ice.actions.skill03,[target],[]);
  assert.ok(target.buffs.some(effect=>effect.control==='freeze'));
  assert.equal(draws,1,'the sourced freeze helper checks combined control probability only once');
}
{
  const battle=iceBattle(),[target,ice]=battle.units;
  const ward={id:'one-debuff-ward',key:'marker',value:0,tag:'debuffWard',stacks:1};target.buffs.push(ward);
  battle.random=()=>0;
  const before=target.distance;
  battle.rules.after(battle,ice,'skill03','normal',ice.actions.skill03,[target],[]);
  assert.equal(ward.stacks,0);
  assert.ok(!target.buffs.some(effect=>effect.control==='freeze'));
  assert.equal(target.distance,before,'a warded freeze must not retain its action delay');
}
{
  const enemy=unit('caster','enemy');
  enemy.actions.basic={name:'source effect probe',type:'Normal',target:'single',targetId:'ally',terms:[],
    effects:[{type:'buff',key:'speedPct',value:0,duration:1,control:'freeze',debuff:true,chance:1}]};
  const battle=createBattle(config([unit('ally','ally',.5),enemy]));
  let draws=0;battle.random=()=>{draws++;return .1;};
  battle.units[0].distance=10000;battle.units[1].distance=0;
  assert.equal(stepBattle(battle),true);
  assert.ok(battle.units[0].buffs.some(effect=>effect.control==='freeze'));
  assert.equal(draws,1,'generic effects share immunity checks without a second control-resistance roll');
  assert.equal(battleFrame(battle).units[1].side,'enemy');
}
{
  const ally={id:'ally',name:'队员',side:'ally'},seed={id:'initial-enemy',name:'首批敌人',side:'enemy'};
  const enemy={id:'spawned-enemy',name:'补入敌人',side:'enemy',alive:true,hp:100,energy:0};
  const servant={id:'runtime-servant',name:'运行时召唤物',side:'ally',owner:ally.id};
  const frame={units:[ally,enemy,servant],summons:[]};
  const result={config:{units:[ally,seed],maxAV:100},units:[enemy],log:[{index:0,av:0,type:'damage',actor:servant.id,target:enemy.id,damage:100,hpDamage:100,frame}],
    outcome:'time_limit',av:100,damage:100,accuracy:'approximate',unsupported:[]};
  const definitions=registerFrameDefinitions(frame,new Map([[ally.id,ally]]));
  assert.equal(definitions.get(enemy.id).side,'enemy','spawned enemies retain their recorded side');
  assert.equal(definitions.get(enemy.id).name,'补入敌人');
  assert.equal(battleStatistics(result)[0].damage,100,'legacy snapshot ownership attributes servant damage to its owner');
  assert.equal(replayAt(result,0).totals.ally,100);
  const html=renderBattleResult(result,result.config);
  assert.ok(html.includes('补入敌人'));
  assert.ok(html.includes('id="sim-extend"'),'live dynamic enemies still offer AV extension');
}
console.log('Upload review regressions: single control roll, warded control has no delay, runtime enemy sides, legacy ownership, and dynamic-enemy result rendering passed.');
