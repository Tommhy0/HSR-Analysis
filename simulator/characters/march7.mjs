// 三月七 1001：战技护盾（高血目标加仇恨 / 净化）、终结全体冰伤与冻结（冻结期间冰属性附加伤害）、
// 天赋护盾持有者被攻击时反击、E1 冻结回能、E2 开场护盾、E4 反击次数与防御转化、E6 护盾目标回合治疗。
export function march7(api){const {allies,enemies,live,rank,trace,buff,resource,energy,heal,cleanseOne,combatPanel,barrier,dot,damageTo}=api;
  const shieldedBy=(u,to)=>to.shields.some(s=>s.source===u.id&&s.value>0);
  const freeze=(b,u,to,mult,chance,duration)=>dot(b,u,to,{name:'冰刻箭雨之时 · 冻结',element:'Ice',terms:[{scaling:'atk',multiplier:mult}],chance,duration,extra:{control:'freeze',id:u.id+':march-freeze'}});
  return {
    shouldUseSkill(b,u){return !allies(b,u).some(t=>shieldedBy(u,t));},
    start(b,u){resource(b,u,'本回合反击次数',0);},
    // 秘技「冻人的瞬间」：进入战斗后立即攻击并有概率冻结随机敌方单体。
    entry(b,u){const m=u.kit.params.Maze,pool=enemies(b,u);
      for(const to of pool)damageTo(b,u,to,{name:'冻人的瞬间',type:'Maze',element:'Ice',terms:[{scaling:'atk',multiplier:m[0]}],toughness:60},1,'primary','technique');
      const to=pool.length?pool[Math.floor(b.random()*pool.length)]:null;if(to)freeze(b,u,to,m[2],m[0],m[1]);},
    // E2：进入战斗时为当前生命值百分比最低的我方目标提供护盾。
    waveStart(b,u){if(!rank(u,2)||u.resources['E2已触发'])return;resource(b,u,'E2已触发',1);
      const pool=allies(b,u);if(!pool.length)return;
      const lowest=pool.reduce((a,c)=>a.hp/combatPanel(a).hp<=c.hp/combatPanel(c).hp?a:c);
      barrier(b,u,lowest,{name:'记忆中的它 · 护盾',value:combatPanel(u).def*u.kit.ranks[2][0]+u.kit.ranks[2][2],duration:u.kit.ranks[2][1],group:'marchE2'});},
    after(b,u,actor,key,kind,a,selected,hits){const p=u.kit.params;if(actor!==u)return;
      if(key==='skill'){const to=selected[0];
        if(trace(u,1))cleanseOne(b,u,to);
        barrier(b,u,to,{name:'可爱即是正义 · 护盾',value:combatPanel(u).def*p.BPSkill[0]+p.BPSkill[3],duration:p.BPSkill[1]+(trace(u,2)?.[0]??0),group:'marchSkill'});}
      if(key==='ultimate'){const chance=p.Ultra[1]+(trace(u,3)?.[0]??0);let frozen=0;
        for(const to of hits.filter(live))if(freeze(b,u,to,p.Ultra[3],chance,p.Ultra[2]))frozen++;
        if(rank(u,1)&&frozen)energy(b,u,u.kit.ranks[1][0]*frozen,true);}},
    // 天赋「少女的特权」：持有护盾的我方目标被敌方攻击后，三月七立即反击攻击者。
    attacked(b,u,to,from){if(to.side!==u.side||!from||from.side===u.side)return;
      if(!to.shields.some(s=>s.value>0))return;
      const max=u.kit.params.Talent[1]+(rank(u,4)?1:0);
      if((u.resources['本回合反击次数']??0)>=max)return;
      if(!live(from))return;
      resource(b,u,'本回合反击次数',(u.resources['本回合反击次数']??0)+1);
      b.queue.push({actor:u.id,key:'counter',kind:'followup',targetId:from.id});},
    // E4：反击伤害额外提高等同于防御力的部分。
    prepare(b,u,key,kind,a){if(key!=='counter'||!rank(u,4))return a;
      return {...a,terms:[...a.terms,{scaling:'def',multiplier:u.kit.ranks[4][0]}]};},
    turnStart(b,u,actor){if(actor===u){resource(b,u,'本回合反击次数',0);return;}
      // E6：战技护盾保护下的我方目标每回合开始时回复生命。
      if(rank(u,6)&&actor.side===u.side&&actor.shields.some(s=>s.source===u.id))heal(b,u,actor,combatPanel(actor).hp*u.kit.ranks[6][0]+u.kit.ranks[6][1]);},
    // 战技护盾：目标生命值百分比 ≥ 阈值时提高被攻击概率。
    panel(b,u,to,out){if(to.side!==u.side)return;
      if(shieldedBy(u,to)&&to.hp/out.hp>=u.kit.params.BPSkill[2])out.aggroRatio=(out.aggroRatio??1)*3;},
    display(b,u,to){if(to!==u)return [];return [{type:'buff',id:u.id+':march-counter',source:u.id,name:'本回合反击次数',key:'marker',value:u.resources['本回合反击次数']??0,derived:true}];},
  };
}
