export function bronya(api){const {allies,live,get,tag,rank,trace,buff,energy,advance,resource,combatPanel,cleanseOne}=api;return {
  start(b,u){if(trace(u,2))for(const t of allies(b,u))buff(b,u,t,'阵地','defPct',trace(u,2)[1],trace(u,2)[0],{removeOnSourceDeath:false});},
  entry(b,u){for(const t of allies(b,u))buff(b,u,t,'在旗帜下','atkPct',u.kit.params.Maze[0],u.kit.params.Maze[1]);},
  after(b,u,actor,key,kind,a,selected,hits){
    if(actor===u){const p=u.kit.params;
      if(key==='basic')advance(b,u.id,p.Talent[0]);
      if(key==='skill'){const to=selected[0];cleanseOne(b,u,to);buff(b,u,to,'作战再部署','dmgBoost',p.BPSkill[0],p.BPSkill[2]+rank(u,6));if(to!==u)advance(b,to.id,p.BPSkill[3]);
        if(rank(u,1)&&u.turns>(u.resources['战技返点回合']??-2)+1&&b.random()<rank(u,1)){api.sp(b,u,1,'布洛妮娅 E1');resource(b,u,'战技返点回合',u.turns);}
        if(rank(u,2))buff(b,u,to,'再部署 · 待行动后加速','marker',0,null,{tag:'bronyaSpeedPending'});
      }
      if(key==='ultimate')for(const to of allies(b,u)){buff(b,u,to,'贝洛伯格进行曲 · 攻击','atkPct',p.Ultra[0],p.Ultra[3]);buff(b,u,to,'贝洛伯格进行曲 · 暴伤','critDmg',combatPanel(u,{excludeConverted:true}).critDmg*p.Ultra[1]+p.Ultra[2],p.Ultra[3],{converted:true});}
    }
    if(actor!==u&&actor.side===u.side&&key==='basic'&&rank(u,4)&&u.resources['协同射击回合']!==u.turns){const to=hits.find(t=>live(t)&&((t.weaknesses??[]).includes('Wind')||t.buffs.some(e=>e.weakness==='Wind')));if(to){resource(b,u,'协同射击回合',u.turns);b.queue.push({actor:u.id,key:'followup',kind:'followup',targetId:to.id});}}
  },
  turnEnd(b,u,actor){const pending=actor.buffs.find(e=>e.source===u.id&&e.tag==='bronyaSpeedPending');if(pending){actor.buffs=actor.buffs.filter(e=>e!==pending);buff(b,u,actor,'布洛妮娅 E2 · 速度','speedPct',rank(u,2),1);}},
  modifiers(b,u,actor,to,a){const out={};if(actor.side===u.side&&trace(u,3))out.dmgBoost=trace(u,3)[0];if(actor===u&&a.type==='Normal'&&trace(u,1))out.critRate=1-combatPanel(u).critRate;return out;},
};}
