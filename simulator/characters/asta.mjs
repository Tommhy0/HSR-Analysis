// Unique targets are counted after the whole attack, including random bounces.
export function asta(api){const {allies,enemies,rank,trace,buff,energy,resource,combatPanel,damageTo,record}=api;
  const count=u=>u.resources['蓄能']??0;
  const charge=(b,u,hits)=>resource(b,u,'蓄能',Math.min(u.kit.params.Talent[1],count(u)+hits.reduce((n,t)=>n+((t.weaknesses??[]).includes('Fire')||t.buffs.some(e=>e.weakness==='Fire')?2:1),0)));
  return {
    entry(b,u){const hits=enemies(b,u);for(const to of hits)damageTo(b,u,to,{name:'灵光一现',type:'Maze',element:'Fire',terms:[{scaling:'atk',multiplier:u.kit.params.Maze[0]}],toughness:60},1,'primary','technique');charge(b,u,hits);},
    turnStart(b,u,actor){if(actor!==u)return;const keep=u.resources['下一回合保留蓄能'];if(keep)resource(b,u,'下一回合保留蓄能',false);if(u.turns>1&&!keep)resource(b,u,'蓄能',Math.max(0,count(u)-u.kit.params.Talent[2]+rank(u,6)));},
    after(b,u,actor,key,kind,a,selected,hits){if(actor!==u)return;
      if(hits.length)charge(b,u,hits);
      if(key==='ultimate'){for(const to of allies(b,u))buff(b,u,to,'星空祝言','speed',u.kit.params.Ultra[0],u.kit.params.Ultra[1]);if(u.kit.eidolon>=2)resource(b,u,'下一回合保留蓄能',true);}
      if(key==='basic'&&trace(u,1)){const p=trace(u,1);for(const to of hits){const chance=p[0]*(1+(combatPanel(u).effectHit??0))*(1-(combatPanel(to).effectRes??0));if(chance<1&&b.random()>=chance){record(b,'resist',to,{name:'火花 · 灼烧被抵抗'});continue;}const dot={type:'dot',id:u.id+':asta-burn',name:'火花 · 灼烧',source:u.id,remaining:p[1],tickOwner:to.id,tickAt:'end',appliedTurn:to.turns,element:'Fire',terms:[{scaling:'atk',multiplier:u.kit.params.Normal[0]*p[2]}],debuff:true};to.dots=to.dots.filter(e=>e.id!==dot.id);to.dots.push(dot);record(b,'dot',u,{target:to.id,name:dot.name,duration:dot.remaining});b.rules.relics.debuff(b,u,to,dot);}}
    },
    panel(b,u,to,out){if(to.side!==u.side)return;out.atk+=(to.panel.baseStats?.atk??0)*count(u)*u.kit.params.Talent[0];if(to===u){if(trace(u,3))out.def+=(to.panel.baseStats?.def??0)*count(u)*trace(u,3)[0];if(u.kit.eidolon>=4&&count(u)>=u.kit.ranks[4][0])out.energyRegen+=u.kit.ranks[4][1];}},
    modifiers(b,u,actor,to,a){return actor.side===u.side&&(a.element??actor.element)==='Fire'&&trace(u,2)?{dmgBoost:trace(u,2)[0]}:{};},
    display(b,u,to){if(to.side!==u.side)return [];const out=[{type:'buff',id:u.id+':asta-charge',source:u.id,name:'天象学 · 蓄能',key:'atkPct',value:count(u)*u.kit.params.Talent[0],stacks:count(u),derived:true}];if(trace(u,2))out.push({type:'buff',id:u.id+':asta-fire',source:u.id,name:'点燃 · 火属性伤害',key:'dmgBoost',value:trace(u,2)[0],derived:true,note:'仅火属性'});return out;},
  };
}
