// 知更鸟 1309：协奏状态（全队攻击 / 附加伤害 / 免控）、行动序列倒计时、调性合颂回能、E0～E6。
// 倒计时用固定 90 速的召唤物实现，倒计时回合开始时退出协奏并立即行动。
const ACTION_DISTANCE=10000;
export function robin(api){const {allies,live,rank,trace,buff,energy,resource,advance,combatPanel,damageTo}=api;
  const concerto=u=>u.buffs.some(e=>e.tag==='robinConcerto');
  const clearConcerto=(b,u)=>{u.buffs=u.buffs.filter(e=>e.tag!=='robinConcerto');
    for(const t of b.units)t.buffs=t.buffs.filter(e=>!(e.source===u.id&&e.tag==='robinConcertoBuff'));};
  // 协奏附加伤害：倍率 Ultra[3]，暴击率固定 100%、暴伤固定 150%；E6 前 8 次额外 +450% 暴伤。
  const concertoDamage=(b,u,hits)=>{const p=u.kit.params,to=hits.find(live);if(!to)return;
    const n=u.resources['协奏触发次数']??0;resource(b,u,'协奏触发次数',n+1);
    const e6=rank(u,6)&&n<rank(u,6,0)?rank(u,6,1):0;
    damageTo(b,u,to,{name:'协奏 · 附加伤害',type:'Additional',element:'Physical',terms:[{scaling:'atk',multiplier:p.Ultra[3]}],toughness:0,hitShares:[1],fixedCrit:{rate:p.Ultra[4],critDmg:p.Ultra[5]+e6}},1,'primary','additional');};
  const startConcerto=(b,u)=>{const p=u.kit.params;
    resource(b,u,'协奏触发次数',0);resource(b,u,'协奏前自动终结',u.policy?.autoUltimate===false?0:1);
    if(u.policy)u.policy.autoUltimate=false;u.cannotAct=true;
    buff(b,u,u,'协奏','marker',0,null,{tag:'robinConcerto'});
    // 全队攻击力提高 = 知更鸟攻击力的 Ultra[0]% + Ultra[2] 点（施放瞬间快照，避免自我循环）。
    const value=combatPanel(u,{excludeConverted:true}).atk*p.Ultra[0]+p.Ultra[2];
    for(const to of allies(b,u)){
      buff(b,u,to,'协奏 · 攻击','atk',value,null,{id:u.id+':concertoAtk',tag:'robinConcertoBuff',converted:true,removeOnSourceDeath:true});
      if(rank(u,2))buff(b,u,to,'协奏 · 速度','speedPct',rank(u,2),null,{tag:'robinConcertoBuff',removeOnSourceDeath:true});
      if(rank(u,4))buff(b,u,to,'协奏 · 效果抵抗','effectRes',rank(u,4),null,{tag:'robinConcertoBuff',removeOnSourceDeath:true});
    }
    // E4：施放终结技时解除我方全体控制类负面状态。
    if(rank(u,4))for(const to of allies(b,u))to.buffs=to.buffs.filter(e=>!e.control);
    // 除自身以外的队友立即行动（后推进者先结算，保持队伍顺序）。
    for(const to of allies(b,u).filter(t=>t!==u).reverse())advance(b,to.id,1);
    b.summons.push({id:u.id+':concerto',name:'协奏倒计时',owner:u.id,kind:'countdown',speed:p.Ultra[1],distance:ACTION_DISTANCE,active:true,order:b.units.length+b.summons.length});
  };
  return {
    shouldUseSkill(b,u){return !allies(b,u).some(t=>t.buffs.some(e=>e.source===u.id&&e.tag==='robinSkill'));},
    start(b,u){if(trace(u,1))advance(b,u.id,trace(u,1)[0]);
      for(const to of allies(b,u))buff(b,u,to,'调性合颂','critDmg',u.kit.params.Talent[0],null,{tag:'robinTalent',removeOnSourceDeath:true});},
    // 秘技「酣醉序曲」：领域展开期间进入战斗后，每个波次开始时知更鸟恢复 5 点能量（含第 1 波）。
    waveStart(b,u){if(u.kit?.technique)energy(b,u,u.kit.params.Maze[1]);},
    after(b,u,actor,key,kind,a,selected,hits){const p=u.kit.params;
      if(actor===u){
        if(key==='skill'){for(const to of allies(b,u))buff(b,u,to,'翎之咏叹调','dmgBoost',p.BPSkill[0],p.BPSkill[1],{tag:'robinSkill',tickOwner:u.id,tickAt:'start'});
          if(trace(u,3))energy(b,u,trace(u,3)[0]);}
        if(key==='ultimate')startConcerto(b,u);
      }
      if(actor.side===u.side&&hits.length){
        energy(b,u,p.Talent[1]+rank(u,2,1));           // 天赋：我方攻击后知更鸟回能，E2 +1
        if(concerto(u))concertoDamage(b,u,hits);       // 协奏：每次施放攻击后附加伤害
      }
    },
    // 倒计时回合：退出协奏、清掉协奏增益、解除无法行动并立即行动。
    summonTurn(b,u,s){if(s.kind!=='countdown'||s.owner!==u.id)return;
      s.active=false;if(!live(u))return;
      clearConcerto(b,u);u.cannotAct=false;
      if(u.resources['协奏前自动终结']!=null&&u.policy)u.policy.autoUltimate=!!u.resources['协奏前自动终结'];
      resource(b,u,'协奏倒计时',0);advance(b,u.id,1);},
    panel(b,u,to,out,{excludeConverted}){if(to!==u)return;if(concerto(u))out.controlRes=1;},
    modifiers(b,u,actor,to,a,kind){const out={};if(actor.side!==u.side||to.side===u.side||!concerto(u))return out;
      if(rank(u,1))out.resPen=rank(u,1);                              // E1：协奏中全属性抗性穿透 +24%
      if(trace(u,2)&&kind==='followup')out.critDmg=trace(u,2)[0];     // 行迹「即兴装饰」：追加攻击暴伤 +25%
      return out;},
    display(b,u,to){if(!concerto(u))return [];
      const s=b.summons.find(s=>s.owner===u.id&&s.active&&s.kind==='countdown'),out=[];
      if(to.side!==u.side)return out;
      out.push({type:'buff',id:u.id+':concertoAtk',source:u.id,name:'协奏 · 攻击力提高',key:'atk',value:combatPanel(u,{excludeConverted:true}).atk*u.kit.params.Ultra[0]+u.kit.params.Ultra[2],derived:true});
      if(rank(u,1))out.push({type:'buff',id:u.id+':concertoPen',source:u.id,name:'微笑的国度 · 抗性穿透',key:'resPen',value:rank(u,1),derived:true});
      if(s)out.push({type:'buff',id:u.id+':concertoTimer',source:u.id,name:'协奏倒计时',key:'speed',value:s.speed,remaining:Math.round(s.distance/s.speed*100)/100,derived:true,note:'剩余行动值'});
      return out;},
  };
}
