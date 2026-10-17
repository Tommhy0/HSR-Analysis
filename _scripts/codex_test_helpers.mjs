import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createContext} from '../core/ctx.mjs';
import {newBattleBuild,buildBattleActor} from '../simulator/builds.mjs';
import {createBattle,stepBattle} from '../simulator/engine.mjs';
const raw=JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url)));
const ctx=createContext(raw);
const panel=(atk=1000,speed=100)=>({hp:10000,atk,def:1000,speed,critRate:0,critDmg:1,energyRegen:1,effectHit:0,effectRes:0,breakEffect:0,baseStats:{hp:1000,atk,def:1000},elemDmg:{}});
const actor=id=>{const a=buildBattleActor(ctx,{...newBattleBuild(),characterId:id,relicAuto:false,panel:panel()});a.energy=0;a.policy={...a.policy,autoUltimate:false,basicOnly:true};return a;};
const dummy=(id,side='ally',atk=1000)=>({id,name:id,side,level:80,element:'Physical',panel:panel(atk,1),energy:0,energyMax:100,res:{},actions:{basic:{name:'probe',type:'Normal',terms:[{scaling:'atk',multiplier:1}],toughness:0,hitEnergy:10,spGain:0,energyGain:0},followup:{name:'probe followup',type:'Talent',terms:[{scaling:'atk',multiplier:1}],toughness:0,hitEnergy:10}},policy:{autoUltimate:false,basicOnly:true}});
const battle=(id)=>createBattle({strict:true,maxAV:500,sp:3,maxSP:9,seed:42,critMode:'noncrit',units:[actor(id),dummy('mate'),{...dummy('enemy','enemy'),panel:panel(1000,1),hp:1e9}]});
const force=(b,u,key,kind='normal')=>{b.units.forEach(t=>t.distance=10000);b.summons.forEach(t=>t.distance=10000);u.distance=0;if(kind==='normal'){u.policy={...u.policy,turnPlan:[{turn:u.turns+1,key}]};}else b.queue.push({actor:u.id,key,kind,targetId:b.units.at(-1).id});stepBattle(b);};

export {ctx,actor,dummy,battle,force};
