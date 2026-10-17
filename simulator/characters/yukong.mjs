// 驭空 1207：【鸣弦号令】叠层（我方全体加攻、每次我方回合结束减 1 层）、
// 普攻额外伤害与提高削韧、终结按号令追加全队双暴、行迹虚数增伤与号令回能、E4 增伤、E6 先叠一层。
export function yukong(api){const {allies,live,rank,trace,buff,resource,energy,combatPanel,damageTo}=api;
  const stacks=u=>u.resources['鸣弦号令']??0;
  const setStacks=(b,u,n)=>{resource(b,u,'鸣弦号令',Math.max(0,Math.min(2,n)));
    if(stacks(u)>0)for(const to of allies(b,u))buff(b,u,to,'鸣弦号令 · 攻击','atkPct',u.kit.params.BPSkill[1],null,{id:'yukongAtk:'+to.id,tickOwner:u.id,removeOnSourceDeath:true});
    else for(const to of allies(b,u))to.buffs=to.buffs.filter(e=>e.id!=='yukongAtk:'+to.id);};
  return {
    shouldUseSkill(b,u){return stacks(u)===0||u.resources['号令施放回合']!==u.turns&&stacks(u)<2;},
    start(b,u){resource(b,u,'鸣弦号令',0);resource(b,u,'天赋冷却',0);resource(b,u,'E2已触发',[]);
      if(rank(u,1))for(const to of allies(b,u))buff(b,u,to,'天舶飞将，枕弧待战','speedPct',u.kit.ranks[1][0],u.kit.ranks[1][1],{id:'yukongE1:'+to.id});},
    // 秘技「云鸢逐风」：主动攻击进入战斗时获得 2 层【鸣弦号令】。
    entry(b,u){setStacks(b,u,u.kit.params.Maze[2]);},
    // 天赋「箭彻七札」：普攻额外伤害（独立附加伤害）并使本次削韧提高 100%，1 回合冷却。
    prepare(b,u,key,kind,a){if(key==='basic'&&kind==='normal'&&(u.resources['天赋冷却']??0)<=u.turns)return {...a,toughness:(a.toughness??0)*(1+u.kit.params.Talent[1])};return a;},
    after(b,u,actor,key,kind,a,selected,hits){const p=u.kit.params;
      if(actor===u){
        if(key==='basic'&&kind==='normal'&&(u.resources['天赋冷却']??0)<=u.turns){
          resource(b,u,'天赋冷却',u.turns+p.Talent[2]);
          const to=hits.find(live);if(to)damageTo(b,u,to,{name:'箭彻七札 · 附加伤害',type:'Additional',element:u.element,terms:[{scaling:'atk',multiplier:p.Talent[0]}],toughness:0},1,'primary','additional');}
        if(key==='skill'){resource(b,u,'号令施放回合',u.turns);setStacks(b,u,stacks(u)+p.BPSkill[0]);}
        if(key==='ultimate'){
          if(rank(u,6))setStacks(b,u,stacks(u)+u.kit.ranks[6][0]);
          if(stacks(u)>0)for(const to of allies(b,u)){
            buff(b,u,to,'贯云饮羽 · 暴击率','critRate',p.Ultra[1],1,{id:'yukongUltC:'+to.id});
            buff(b,u,to,'贯云饮羽 · 暴击伤害','critDmg',p.Ultra[2],1,{id:'yukongUltD:'+to.id});}
          if(rank(u,2))resource(b,u,'E2已触发',[]);}
      }
      // 每次我方目标回合结束时移除 1 层；施放战技的回合不移除；行迹「气壮」在持有号令时我方行动后回能。
      if(actor!==u&&actor.side===u.side&&stacks(u)>0&&trace(u,3))energy(b,u,trace(u,3)[0],true);},
    turnEnd(b,u,actor){if(actor.side!==u.side||stacks(u)<=0)return;
      if(actor===u&&u.resources['号令施放回合']===u.turns)return;
      setStacks(b,u,stacks(u)-1);},
    // E2：我方任意单体能量满时驭空回能，每个单体一次，施放终结技后重置。
    before(b,u,actor,key,kind,a){if(!rank(u,2))return;const used=u.resources['E2已触发']??[];
      for(const to of allies(b,u))if(!used.includes(to.id)&&to.energyMax>0&&to.energy>=to.energyMax-1e-8){resource(b,u,'E2已触发',[...used,to.id]);energy(b,u,u.kit.ranks[2][0],true);break;}},
    // 行迹「迟彝」：驭空在场时我方全体虚数属性伤害提高；E4：持有号令时驭空造成伤害提高。
    modifiers(b,u,actor,to,a,kind){const out={};if(actor.side!==u.side)return out;
      if(trace(u,2)&&a.element==='Imaginary')out.dmgBoost=trace(u,2)[0];
      if(rank(u,4)&&stacks(u)>0&&actor===u)out.dmgBoost=(out.dmgBoost??0)+rank(u,4);
      return out;},
    display(b,u,to){if(to!==u)return [];return [{type:'buff',id:u.id+':orders',source:u.id,name:'鸣弦号令',key:'atkPct',value:stacks(u)*u.kit.params.BPSkill[1],stacks:stacks(u),derived:true}];},
  };
}
