import { suggestPanel,validatePanel } from '../core/panel.mjs';
import { defaultRelics, relicContributions, applyRelics } from '../core/relics.mjs';
import { actorFromCalculator } from './profiles.mjs';
export function newBattleBuild(){return {characterId:null,level:80,eidolon:0,lightconeId:null,lightconeLevel:80,superimpose:1,levels:{},variant:'base',technique:false,relicSets:[],relicAuto:true,relics:defaultRelics()};}
export function buildBattleActor(ctx,build){
  if(!build.characterId)throw new Error('请先选择该位置的角色');
  for(const key of ['level','lightconeLevel'])if(!Number.isInteger(build[key])||build[key]<1||build[key]>80)throw new Error('角色与光锥等级须为 1～80 的整数');
  if(!Number.isInteger(build.eidolon)||build.eidolon<0||build.eidolon>6)throw new Error('星魂须为 0～6');
  if(!Number.isInteger(build.superimpose)||build.superimpose<1||build.superimpose>5)throw new Error('光锥叠影须为 1～5');
  const suggestion=suggestPanel(ctx,build);if(suggestion.sources.some(s=>s.warn))throw new Error('配装白值不完整');
  const contributions=relicContributions(ctx.data.relicTables,build.relics);
  if(!contributions.ok)throw new Error(contributions.errors.join('；'));
  const panel=build.relicAuto?applyRelics(suggestion.panel,contributions):JSON.parse(JSON.stringify(build.panel??suggestion.panel));
  const panelErrors=validatePanel(panel);if(panelErrors.length)throw new Error(panelErrors.map(e=>e.msg).join('；'));
  const actor=actorFromCalculator({ctx,...build,panel,baked:ctx.data.abilities,overrides:ctx.data.annotations?.multipliers});
  actor.build=JSON.parse(JSON.stringify({...build,panel}));return actor;
}
