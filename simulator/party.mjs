import { buildBattleActor,newBattleBuild } from './builds.mjs';
import { fourMemberBattle } from './profiles.mjs';
export function strictParty(ctx,{variant='enhanced'}={}){
  const c=fourMemberBattle(),ids=[1306,1414,1015,1412],cones=[23021,23051,23046,23048];
  const sample=[{hp:4200,atk:1500,def:1100,speed:160,critRate:.1,critDmg:2,energyRegen:1.194394},
    {hp:4000,atk:3000,def:1100,speed:134,critRate:.1,critDmg:.6,energyRegen:1.194394},
    {hp:3400,atk:2700,def:950,speed:105,critRate:.65,critDmg:1.6,energyRegen:1},
    {hp:4100,atk:2700,def:1000,speed:145,critRate:.1,critDmg:.6,energyRegen:1.194394}];
  c.units=ids.map((id,i)=>{
    const build={...newBattleBuild(),characterId:id,lightconeId:cones[i],variant:id===1306?variant:'base',technique:true};
    const auto=buildBattleActor(ctx,build);build.relicAuto=false;build.panel={...auto.panel,...sample[i]};
    const u=buildBattleActor(ctx,build);u.id='slot-'+(i+1);if(id!==1015)u.policy.allyTargetId='slot-3';return u;
  }).concat(c.units.at(-1));
  c.units.at(-1).name='自定义训练敌人';c.units.at(-1).panel.hp=5000000;c.units.at(-1).actions.basic.hitEnergy=10;
  c.units.at(-1).panel.critRate=0;c.units.at(-1).panel.critDmg=0;
  Object.assign(c.units.at(-1),{toughnessMax:360,weaknesses:['Quantum','Physical','Wind'],standardBreak:true,rank:'elite',res:{Quantum:0,Physical:0,Wind:0}});
  c.sp=3;c.maxSP=9;c.strict=true;c.description='四人机制验收：E0S1，参考面板（可改），三名辅助指向 Archer，四人秘技启用。敌人为可编辑的单波次训练规则，非实际关卡 Boss。';
  return c;
}
