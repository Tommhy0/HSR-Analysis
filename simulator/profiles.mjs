import { listAbilities } from '../core/abilities.mjs';
import { characterDisplayName } from '../core/ctx.mjs';
export function referenceBattle(){
  // Hand-checkable fixture, intentionally named test units rather than claiming a real kit.
  const panel=(hp,atk,def,speed)=>({hp,atk,def,speed,critRate:0.5,critDmg:1,energyRegen:1,baseStats:{hp,atk,def},elemDmg:{}});
  return {strict:true,seed:20261013,maxAV:350,sp:3,maxSP:5,critMode:'expected',description:'规则基准：自定义输出 / 治疗 / 敌人；用于验证行动轴与双向伤害，非完整角色复刻。',units:[
    {id:'dps',name:'基准输出',side:'ally',level:80,element:'Fire',panel:panel(3400,2200,900,134),energyMax:120,energy:60,onHitEnergy:5,
      actions:{basic:{name:'基准普攻',terms:[{scaling:'atk',multiplier:1}],spGain:1,energyGain:20,toughness:0},skill:{name:'基准战技',terms:[{scaling:'atk',multiplier:2}],spCost:1,energyGain:30,hitShares:[0.3,0.3,0.4]},ultimate:{name:'基准终结技',terms:[{scaling:'atk',multiplier:3}],energyCost:120,energyGain:5}},policy:{autoUltimate:true}},
    {id:'healer',name:'基准治疗',side:'ally',level:80,element:'Physical',panel:panel(5400,1100,1200,120),energyMax:100,energy:50,onHitEnergy:5,
      actions:{basic:{name:'治疗者普攻',terms:[{scaling:'atk',multiplier:1}],spGain:1,energyGain:20},skill:{name:'单体治疗',terms:[],spCost:1,energyGain:30,target:'lowestAlly',effects:[{type:'heal',target:'lowestAlly',scaling:'hp',multiplier:0.1,flat:500}]},ultimate:{name:'全队治疗',terms:[],energyCost:100,energyGain:5,target:'allies',effects:[{type:'heal',target:'allies',scaling:'hp',multiplier:0.15,flat:700}]}},policy:{healBelow:0.65,autoUltimate:true}},
    {id:'enemy',name:'基准敌人',side:'enemy',level:90,element:'Physical',panel:panel(90000,1900,1100,100),res:{Fire:0.2,Physical:0},energyMax:0,energy:0,toughnessMax:0,
      actions:{basic:{name:'敌人攻击',terms:[{scaling:'atk',multiplier:1.8}],target:'single'}},policy:{basicOnly:true,autoUltimate:false}},
  ]};
}
export function actorFromCalculator({ctx,characterId,panel,level=80,eidolon=0,levels={},baked,overrides=[]}){
  const ch=ctx.charById.get(characterId);if(!ch)throw new Error('角色不存在');
  const abs=listAbilities(ctx,characterId,{eidolon,levels,baked,overrides,element:ch.element});
  const action=(type)=>{
    const ab=abs.find(a=>a.type===type&&a.status==='ok');if(!ab)return null;
    const s=ab.skill;
    return {name:ab.name,type,element:ab.element,target:ab.tag==='AoEAttack'?'all':ab.tag==='Blast'?'blast':'single',
      terms:ab.terms.filter(t=>t.timing==='direct'&&!t.conditional&&t.target!=='random').map(t=>({...t,count:1})),
      bounceCount:ab.randomHitsTotal,bounceTerms:ab.terms.filter(t=>t.target==='random').map(t=>({...t,target:'primary',count:1})),
      energyGain:s.spBase??0,spCost:Math.max(0,s.bpNeed??0),spGain:Math.max(0,s.bpAdd??0),energyCost:type==='Ultra'?ch.energyMax:0,
      toughness:s.stance?.[0]??0,adjacentToughness:s.stance?.[2]??0};
  };
  const basic=action('Normal');if(!basic)throw new Error('此角色基础动作尚未解析，不能自动生成战斗配置');
  return {id:'char-'+characterId,name:characterDisplayName(ch,ctx.data.characters),characterId,side:'ally',level,element:basic.element,panel:JSON.parse(JSON.stringify(panel)),energyMax:ch.energyMax,energy:ch.energyMax/2,
    actions:{basic,...(action('BPSkill')?{skill:action('BPSkill')}:{}),...(action('Ultra')?{ultimate:action('Ultra')}: {})},policy:{autoUltimate:true},
    unsupported:['角色完整天赋/行迹/星魂触发未逐条实现','辅助/强化技能与光锥/套装条件尚未全部接入','游戏动画逐段权重尚未收录','受击回能/仇恨参数未逐条实测']};
}
