// 杰帕德 1104：战技冻结（冻结期间按攻击力的冰属性附加伤害）、终结全体护盾、
// 天赋致命伤害拦截（行迹回满能量 / E6 立即行动）、行迹战意与刚正、E4 全队效果抵抗、E2 解冻减速。
export function gepard(api){const {allies,live,rank,trace,buff,resource,energy,heal,advance,combatPanel,barrier,dot}=api;
  const shieldAll=(b,u,name,m,flat,duration)=>{for(const to of allies(b,u))barrier(b,u,to,{name,value:combatPanel(u).def*m+flat,duration,group:'gepard'});};
  return {
    start(b,u){resource(b,u,'不屈已触发',0);},
    // 秘技「有情之证」：下一次战斗开始时为我方全体提供护盾。
    entry(b,u){const m=u.kit.params.Maze;shieldAll(b,u,'有情之证 · 护盾',m[0],m[2],m[1]);},
    after(b,u,actor,key,kind,a,selected,hits){const p=u.kit.params;if(actor!==u)return;
      if(key==='skill'){const chance=p.BPSkill[1]+(rank(u,1)?u.kit.ranks[1][0]:0);
        for(const to of hits.filter(live)){
          dot(b,u,to,{name:'震慑之击 · 冻结',element:'Ice',terms:[{scaling:'atk',multiplier:p.BPSkill[3]}],chance,duration:p.BPSkill[2],extra:{control:'freeze',id:u.id+':gepard-freeze'}});
          if(rank(u,2))resource(b,to,'杰帕德冻结',1);}}
      if(key==='ultimate')shieldAll(b,u,'永屹之壁 · 护盾',p.Ultra[0],p.Ultra[2],p.Ultra[1]);},
    // E2：冻结解除后，目标速度降低（冻结在解冻回合被移除，因此在其下一次回合开始时补上减速）。
    turnStart(b,u,actor){if(rank(u,2)&&actor.side!==u.side&&actor.resources['杰帕德冻结']&&!actor.dots.some(e=>e.control==='freeze')){
      resource(b,actor,'杰帕德冻结',0);
      buff(b,u,actor,'余寒 · 减速','speedPct',-u.kit.ranks[2][0],u.kit.ranks[2][1],{debuff:true});}},
    // 行迹「战意」按当前防御力提高攻击力；行迹「刚正」提高被攻击概率；E4 全队效果抵抗提高。
    panel(b,u,to,out,{excludeConverted}){if(to.side!==u.side)return;
      if(to===u&&trace(u,1))out.aggroRatio=(out.aggroRatio??1)*trace(u,1)[0];
      if(!excludeConverted&&to===u&&trace(u,3))out.atk+=(out.def??0)*trace(u,3)[0];
      if(rank(u,4))out.effectRes=(out.effectRes??0)+rank(u,4);},
    // 天赋「不屈之身」：受到致命攻击时不会倒下并回复生命；行迹「统领」回满能量；E6 立即行动并额外回复。
    beforeLethal(b,u,from,to){if(to!==u||(u.resources['不屈已触发']??0)>0)return false;
      resource(b,u,'不屈已触发',1);
      heal(b,u,u,combatPanel(u).hp*u.kit.params.Talent[0]+(rank(u,6)?combatPanel(u).hp*u.kit.ranks[6][0]:0));
      if(trace(u,2))energy(b,u,u.energyMax-u.energy,true);
      if(rank(u,6))advance(b,u.id,1);
      return true;},
    display(b,u,to){if(to!==u)return [];return [{type:'buff',id:u.id+':gepard-talent',source:u.id,name:'不屈之身已触发',key:'marker',value:u.resources['不屈已触发']??0,derived:true}];},
  };
}
