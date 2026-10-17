import { buildMonster } from '../core/enemy.mjs';
// 8012010 -> MonsterTemplateConfig -> AML_Minion02_00, not Minion01.
// Ability, AI cooldowns and native SPHitRatio: pinned release source in docs/严格模式规则与验收.md.
export function reaver(ctx,{level=90,id='reaver-1'}={}){
  const m=buildMonster(ctx,{monsterId:8012010,childId:8012010,level});
  for(const k of ['hp','atk','def','speed','stance'])if(!Number.isFinite(m[k]))throw new Error('掠夺者缺少 '+k+' 数据');
  return {id,name:m.name,monsterId:8012010,side:'enemy',level,element:'Imaginary',panel:{hp:m.hp,atk:m.atk,def:m.def,speed:m.speed,critRate:0,critDmg:0,effectRes:m.statusRes,energyRegen:1,elemDmg:{},baseStats:{atk:m.atk,hp:m.hp,def:m.def}},
    baseSpeed:m.speed,energy:0,energyMax:0,toughnessMax:m.stance,weaknesses:m.weakness,res:m.res,standardBreak:true,rank:'normal',
    enemyKit:{id:8012010,revision:'4.6-reaver-1',speedPerLayer:.35,speedDuration:2,speedLayers:3},
    actions:{basic:{name:'狩猎之刃',type:'Normal',element:'Imaginary',target:'single',terms:[{scaling:'atk',multiplier:2.5}],hitShares:[.25,.25,.5],hitEnergy:10,hitEnergyPerHit:true},
      skill:{name:'涡旋跃袭',type:'Normal',element:'Imaginary',target:'blast',terms:[{scaling:'atk',multiplier:1.5},{scaling:'atk',multiplier:1.5,target:'adjacent'}],hitShares:[.2,.2,.2,.4],hitEnergy:5,hitEnergyPerHit:true}},
    policy:{autoUltimate:false,rotation:['basic','skill']},unsupported:[],provenance:{version:ctx.data._meta.version,source:'DimbreathBot/TurnBasedGameData@312b4597691e0a29cf9828a15b592757dba86949',stats:m._provenance}};
}
export function withReavers(ctx,config,{level=90,count=3,waves=1}={}){
  if(!Number.isInteger(count)||count<1||count>5)throw new Error('敌人数量须为 1～5');
  if(!Number.isInteger(waves)||waves<1||waves>10)throw new Error('波次须为 1～10');
  const allies=structuredClone(config.units.filter(u=>u.side==='ally')),old=new Set(config.units.filter(u=>u.side==='enemy').map(u=>u.id));
  for(const u of allies)for(const a of Object.values(u.actions))if(old.has(a.targetId))delete a.targetId;
  const enemies=Array.from({length:waves},(_,w)=>Array.from({length:count},(_,i)=>({...reaver(ctx,{level,id:'reaver-'+(w*count+i+1)}),wave:w+1}))).flat();
  return {...structuredClone(config),waveMode:'moc',description:`真实普通敌人规则：${waves} 波，每波 ${count} 只 Lv.${level} 虚卒·掠夺者；基础 / 扩散攻击按 AI 冷却交替，每次攻击叠加速度。换波重置行动条，保留我方生命、能量、战技点与效果。无额外关卡加成；可手动修改面板。`,units:[...allies,...enemies]};
}
export function validateEnemyActor(u){
  if(!u.monsterId&&!u.enemyKit)return [];
  const k=u.enemyKit,errors=[],fail=m=>errors.push(u.name+'：'+m),eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  if(u.monsterId!==8012010||k?.id!==8012010||k?.revision!=='4.6-reaver-1')return [u.name+'：敌人行为尚未登记'];
  if(!eq([k.speedPerLayer,k.speedDuration,k.speedLayers],[.35,2,3]))fail('速度被动与正式服不符');
  for(const [key,mult,shares,hitEnergy,target] of [['basic',2.5,[.25,.25,.5],10,'single'],['skill',1.5,[.2,.2,.2,.4],5,'blast']]){const a=u.actions?.[key];
    if(!a||!eq(a.hitShares,shares)||a.hitEnergy!==hitEnergy||a.hitEnergyPerHit!==true||a.element!=='Imaginary'||a.target!==target||a.terms?.[0]?.multiplier!==mult||key==='skill'&&a.terms?.[1]?.multiplier!==mult)fail(key+' 攻击规则与正式服不符');
  }
  return errors;
}
