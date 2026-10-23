// Event-driven 4.6 relic rules. A battle event summon is not a targetable memosprite.
// Special-character events remain explicit: never infer a memosprite from a dragon,
// or grant laughter / Punchline just because an Elation relic is equipped.
const live=u=>u&&u.active!==false&&u.hp>1e-8;
const gear=(u,id)=>u?.gear?.sets?.find(s=>s.id===id);
const four=(u,id)=>{const s=gear(u,id);return s?.count>=4?s:null;};
const team=(b,u)=>b.units.filter(t=>live(t)&&t.side===u.side);
const owner=(b,u)=>u.memospriteOwner?b.units.find(t=>t.id===u.memospriteOwner):u;
const spirit=(b,u)=>b.units.find(t=>live(t)&&t.memospriteOwner===u.id);
const isFollow=(a,kind,key)=>kind==='followup'||a.countAsFollowup===true||a.type==='FollowUp'||key==='dragon';
// Input panels exclude equipped set passives. Entry checks use permanent equipment
// speed only; combat-only character traces and teammate buffs cannot change Poet.
export function relicOutsideSpeed(u){
  let ratio=0;
  for(const s of u.gear?.sets??[]){
    if([114,121,125,130,133,320].includes(s.id))ratio+=s.p2[0];
    if(s.count>=4&&s.id===102)ratio+=s.p4[0];
    if(s.count>=4&&s.id===124)ratio-=s.p4[5];
  }
  return u.panel.speed+(u.baseSpeed??u.panel.speed)*ratio;
}
export const debuffCount=to=>new Set([...to.buffs.filter(e=>e.debuff),...to.dots].map(e=>e.group??e.id)).size+(to.battle?.units.filter(u=>live(u)&&u.side!==to.side&&u.kit?.characterId===1306&&u.kit.enhanced&&u.buffs.some(e=>e.tag==='illusion')).length??0);
const imprisoned=to=>[...to.buffs,...to.dots].some(e=>e.control==='imprisonment');
const defenseDown=to=>to.buffs.some(e=>e.key==='defShred'&&e.value>0||e.key==='defPct'&&e.value<0)||(to.battle?.units.some(u=>live(u)&&u.side!==to.side&&u.kit?.characterId===1306&&u.kit.enhanced&&u.kit.eidolon>=2&&u.buffs.some(e=>e.tag==='illusion'))??false);

export function relicRuntime({buff,stacks,record,energy,combatPanel}){
  const add=(b,u,s,key,value,duration=null,extra={})=>buff(b,u,u,s.name,key,value,duration,{id:u.id+':relic:'+s.id+':'+key,...extra});
  const stack=(b,u,s,key,value,max,duration=null,extra={})=>stacks(b,u,u,s.name,key,value,max,duration,{id:u.id+':relic:'+s.id+':'+key,...extra});
  const marker=(u,id)=>u.buffs.find(e=>e.id===u.id+':relic:'+id+':marker');
  function start(b,u,s){const p=s.p2;
    const simple={104:'elemDmg.Ice',105:'elemDmg.Physical',107:'elemDmg.Fire',109:'elemDmg.Thunder',111:'breakEffect',112:'elemDmg.Imaginary',113:'hpPct',116:'atkPct',118:'breakEffect',119:'breakEffect',123:'atkPct',125:'speedPct',126:'critDmg',127:'critRate',129:'critDmg',130:'speedPct',131:'atkPct',132:'hpPct',133:'speedPct',134:'critDmg',305:'critDmg',313:null,316:'speedPct',322:'atkPct',323:'critRate',324:'critDmg',325:'elation',327:'critRate'};
    if(simple[s.id])add(b,u,s,simple[s.id],p[0],null,{id:u.id+':relic:'+s.id+':base:'+simple[s.id]});
    if(s.id===313)add(b,u,s,'critRate',p[2]);
    if(s.id===117&&s.count>=4)add(b,u,s,'critRate',s.p4[0]);
    if(s.id===111&&s.count>=4)add(b,u,s,'breakEffect',s.p4[0]);
    if(s.id===131&&s.count>=4)stack(b,u,s,'marker',0,s.p4[1]);
  }
  function ready(b){for(const u of b.units.filter(live))for(const s of u.gear?.sets??[]){
    if(s.id===124&&s.count>=4){const speed=relicOutsideSpeed(u),value=speed<s.p4[2]?s.p4[4]:speed<s.p4[1]?s.p4[3]:0;
      if(value)buff(b,u,u,s.name+' · 暴击','critRate',value,null,{id:u.id+':relic:124:entry-crit'});
    }
    if(s.id===305&&combatPanel(u).critDmg>=s.p2[1])add(b,u,s,'critRate',s.p2[2],null,{tag:'firstAttackCrit'});
    if(s.id===328)add(b,u,s,'dmgBoost',Math.min(s.p2[2],Math.max(0,u.energyMax-s.p2[0])*s.p2[1]));
    if(s.id===327&&u.astralExpress&&team(b,u).some(t=>t!==u&&!t.memospriteOwner&&t.astralExpress))add(b,u,s,'critDmg',s.p2[1]);
    if(s.id===130&&s.count>=4){const speed=combatPanel(u).speed,p=s.p4;if(speed>=p[0])add(b,u,s,'critRate',speed>=p[1]?p[3]:p[2]);}
  }refresh(b);}
  function before(b,u,key,kind,a,selected){
    const fua=isFollow(a,kind,key),attack=(a.terms?.length??0)>0;
    if(attack&&fua){
      for(const t of team(b,u)){const s=gear(t,315);if(s){const e=stack(b,t,s,'marker',0,s.p2[0]);if(e.stacks===s.p2[0])add(b,t,s,'critDmg',s.p2[2]);}}
      const s=four(u,115);if(s)u.buffs=u.buffs.filter(e=>e.id!==u.id+':relic:115:atkPct');
      const city=gear(u,326);if(city)add(b,u,city,'atkPct',city.p2[0],city.p2[1]);
    }
    for(const s of u.gear?.sets??[]){if(s.count<4)continue;const p=s.p4;
      if(s.id===104&&key==='ultimate')add(b,u,s,'critDmg',p[0],p[1]);
      if(s.id===109&&key==='skill')add(b,u,s,'atkPct',p[0],p[1]);
      if(s.id===134&&key==='basic')add(b,u,s,'atkPct',p[1],p[2]);
      if(s.id===131&&key==='skill')stack(b,u,s,'marker',0,p[1]);
      if(s.id===126&&key==='ultimate'&&(marker(u,126)?.stacks??0)>=p[0]){u.buffs=u.buffs.filter(e=>e!==marker(u,126));add(b,u,s,'atkPct',p[1],p[2]);}
      if(s.id===130&&a.type==='ElationDamage'&&!u.relicElationUsed){u.relicElationUsed=true;for(const to of team(b,u))buff(b,u,to,s.name,'elation',p[4],null,{id:'relic:130:elation'});}
    }
    if(['ally','allies','self','lowestAlly'].includes(a.target))for(const to of selected){const s=four(to,126);if(s&&to!==u)stack(b,to,s,'marker',0,s.p4[0]);}
    if(u.memospriteOwner&&attack){const from=owner(b,u),s=four(from,123);if(s)for(const to of [from,u])buff(b,from,to,s.name,'critDmg',s.p4[1],s.p4[2],{id:from.id+':relic:123:critDmg',tickOwner:from.id});}
  }
  function hit(b,u,to,a,kind){
    const s=four(u,115);if(s&&isFollow(a,kind))stack(b,u,s,'atkPct',s.p4[0],s.p4[1],s.p4[2]);
    const forge=gear(u,316);if(forge&&((to.weaknesses??[]).includes('Fire')||to.buffs.some(e=>e.weakness==='Fire')))add(b,u,forge,'breakEffect',forge.p2[1],forge.p2[2]);
  }
  function after(b,u,key,kind,a,selected,hitTargets){
    const attack=hitTargets.length>0;
    if(attack){const boxing=four(u,105);if(boxing)stack(b,u,boxing,'atkPct',boxing.p4[0],boxing.p4[1]);u.buffs=u.buffs.filter(e=>e.tag!=='firstAttackCrit');u.relicForgeUsed=false;
      // Fire boost survives non-attacking skills and is consumed by the next attack.
      if(key!=='ultimate')u.buffs=u.buffs.filter(e=>e.tag!=='firesmithNext');
    }
    for(const s of u.gear?.sets??[]){if(s.count<4)continue;const p=s.p4;
      if(s.id===107&&key==='ultimate')add(b,u,s,'elemDmg.Fire',p[1],null,{tag:'firesmithNext'});
      if(s.id===118&&key==='ultimate'&&['ally','allies','self','lowestAlly'].includes(a.target))for(const to of team(b,u))buff(b,u,to,s.name,'breakEffect',p[0],p[1],{id:'relic:118:breakEffect'});
      if(s.id===131&&key==='ultimate')decrement(u,131,p[2]);
      if(s.id===127&&['basic','skill'].includes(key)){
        for(const to of b.units)to.buffs=to.buffs.filter(e=>e.relicSavior!==u.id);
        if(spirit(b,u)){for(const to of [u,spirit(b,u)])buff(b,u,to,s.name,'hpPct',p[0],null,{relicSavior:u.id});for(const to of team(b,u))buff(b,u,to,s.name,'dmgBoost',p[1],null,{relicSavior:u.id});}
      }
      if(s.id===133&&['skill','ultimate'].includes(key)&&a.target==='ally'&&selected[0]!==u){buff(b,u,selected[0],s.name,'elation',p[0],p[1]);if((u.resources['好活当赏']??0)>=p[2])for(const to of team(b,u))buff(b,u,to,s.name,'critDmg',p[3],p[4]);}
    }
  }
  function decrement(u,id,n){const m=marker(u,id);if(m){m.stacks=Math.max(0,m.stacks-n);if(!m.stacks)u.buffs=u.buffs.filter(e=>e!==m);}}
  function attacked(b,to){const boxing=four(to,105);if(boxing)stack(b,to,boxing,'atkPct',boxing.p4[0],boxing.p4[1]);healthConsumed(b,to);}
  function healthConsumed(b,to){const s=four(to,113);if(s)stack(b,to,s,'critRate',s.p4[0],s.p4[2],s.p4[1]);}
  function healed(b,u,to){const from=owner(b,u),s=four(from,125);if(!s||to===from||to.memospriteOwner===from.id||from.relicRainTurn===from.turns)return;from.relicRainTurn=from.turns;add(b,from,s,'speedPct',s.p4[0],s.p4[2],{tag:'relicRain'});}
  function debuff(b,u,to,e){if(u.side===to.side)return;
    const s=four(u,117);if(s)add(b,u,s,'marker',0,s.p4[5],{tag:'pioneerDouble'});
    const forge=four(u,132);if(forge&&(e.key==='defShred'&&e.value>0||e.key==='defPct'&&e.value<0)&&!u.relicForgeUsed){u.relicForgeUsed=true;for(const t of team(b,u))buff(b,u,t,forge.name,'dmgBoost',forge.p4[2],forge.p4[1],{id:'relic:132:dmgBoost'});}
  }
  function broken(b,u){const s=four(u,111);if(s)energy(b,u,s.p4[1]);}
  function death(b,to){for(const u of b.units.filter(t=>live(t)&&t.side!==to.side)){
    const s=gear(u,313);if(s)stack(b,u,s,'critDmg',s.p2[0],s.p2[1]);
    const city=gear(u,326);if(city)for(const t of team(b,u))buff(b,u,t,city.name,'critDmg',city.p2[2],null,{id:'relic:326:critDmg'});
  }}
  function spSpent(b,u){const s=gear(u,324);if(s&&u.spentThisTurn>=s.p2[1]&&b.turnActor===u.id)add(b,u,s,'critDmg',s.p2[2],s.p2[3]);}
  function turnStart(b,u){const s=four(u,131);if(s)decrement(u,131,s.p4[2]);}
  function refresh(b){if(b.relicRefreshing)return;b.relicRefreshing=true;try{for(const u of b.units.filter(live)){
    const s=gear(u,325);if(!s)continue;const p=s.p2,v=combatPanel(u).elation??0,tier=v+1e-8>=p[2]?2:v+1e-8>=p[1]?1:0;
    if(tier>(u.relicElationTier??0)){u.relicElationTier=tier;add(b,u,s,'critDmg',p[tier+2]);}
  }}finally{b.relicRefreshing=false;}}
  function panel(b,u,out,{skipAuras=false}={}){
    const from=owner(b,u);if(from!==u)for(const s of from.gear?.sets??[]){
      // Only HP/speed thresholds need an owner panel. Exclude stat conversions:
      // the owner's conversion may itself read this servant (RMC / Aglaea).
      if(s.id===319||s.id===320){const p=combatPanel(from,{excludeConverted:true,skipAuras:true});
        if(s.id===319&&p.hp>=s.p2[1])out.critDmg=(out.critDmg??0)+s.p2[2];
        if(s.id===320&&p.speed>=s.p2[1])out.healingBoost=(out.healingBoost??0)+(p.speed>=s.p2[2]?s.p2[4]:s.p2[3]);
      }
      if(s.id===124&&s.count>=4)out.critRate=(out.critRate??0)+from.buffs.filter(e=>e.name===s.name+' · 暴击').reduce((n,e)=>n+e.value,0);
    }
    const hero=four(u,123);if(hero&&spirit(b,u))out.speed+=(u.baseSpeed??u.panel.speed)*hero.p4[0];
    if(!skipAuras){let rain=0,amphoreus=0;for(const source of team(b,u)){
      const s=four(source,125);if(s&&source.buffs.some(e=>e.tag==='relicRain'))rain=Math.max(rain,s.p4[1]);
      const a=gear(source,323);if(a&&spirit(b,source))amphoreus=Math.max(amphoreus,a.p2[1]);
    }out.critDmg=(out.critDmg??0)+rain;out.speed+=(u.baseSpeed??u.panel.speed)*amphoreus;}
  }
  function servantPanel(b,u,base){
    const out={...base};
    // These bonuses are applied live by panel() to the servant. Remove them from
    // its inherited snapshot so a summon never receives the same set bonus twice.
    for(const s of u.gear?.sets??[]){
      if(s.id===124&&s.count>=4)out.critRate-=u.buffs.filter(e=>e.name===s.name+' · 暴击').reduce((n,e)=>n+e.value,0);
      if(s.id===319&&base.hp>=s.p2[1])out.critDmg-=s.p2[2];
      if(s.id===320&&base.speed>=s.p2[1])out.healingBoost=(out.healingBoost??0)-(base.speed>=s.p2[2]?s.p2[4]:s.p2[3]);
    }
    return out;
  }
  function modifiers(b,u,to,a,kind){const out={dmgBoost:0,critRate:0,critDmg:0,defIgnore:0},n=debuffCount(to),p=combatPanel(u),from=owner(b,u);
    for(const s of u.gear?.sets??[]){const q=s.p4;
      if(s.id===115&&isFollow(a,kind))out.dmgBoost+=s.p2[0];
      if(s.id===315&&isFollow(a,kind))out.dmgBoost+=(marker(u,315)?.stacks??0)*s.p2[1];
      if(s.id===322&&kind==='dot'&&p.atk>=s.p2[1])out.dmgBoost+=p.atk>=s.p2[2]?s.p2[4]:s.p2[3];
      if(s.count<4)continue;
      if(s.id===107&&a.type==='BPSkill')out.dmgBoost+=q[0];
      if(s.id===112){if(n)out.critRate+=q[0];if(imprisoned(to))out.critDmg+=q[1];}
      if(s.id===116)out.defIgnore+=Math.min(q[1],to.dots.filter(e=>!e.control).length)*q[0];
      if(s.id===117){const double=u.buffs.some(e=>e.tag==='pioneerDouble')?2:1;out.critRate+=q[0]*(double-1);out.critDmg+=(n>=q[4]?q[2]:n>=q[3]?q[1]:0)*double;}
      if(s.id===119&&(a.breakDamage||['break','break_dot','superbreak'].includes(kind))&&p.breakEffect>=q[0]){out.defIgnore+=q[2];if(kind==='superbreak'&&p.breakEffect>=q[1])out.defIgnore+=q[3];}
      if(s.id===131&&['BPSkill','Ultra'].includes(a.type))out.dmgBoost+=(marker(u,131)?.stacks??0)*q[0];
      if(s.id===132&&defenseDown(to))out.critDmg+=q[0];
      if(s.id===134&&a.type==='Normal')out.dmgBoost+=q[0];
    }
    for(const s of from.gear?.sets??[]){
    if(s.id===117&&n)out.dmgBoost+=s.p2[0];
      if(s.id===321){const count=team(b,u).length,delta=count-4;out.dmgBoost+=delta>0?Math.min(delta,s.p2[2])*s.p2[0]:Math.min(-delta,s.p2[3])*s.p2[1];}
      if(s.id===129&&s.count>=4&&(kind==='elation'||a.type==='ElationDamage'))out.defIgnore+=s.p4[0]+Math.min(s.p4[3],Math.floor((b.laughter?.[u.side]??0)/s.p4[1]))*s.p4[2];
    }
    return out;
  }
  function display(b,u){const out=[],derived=(from,s,key,value,note)=>out.push({type:'buff',id:'relic-derived:'+from.id+':'+s.id+':'+key,source:from.id,name:s.name,key,value,remaining:null,tickOwner:from.id,derived:true,note});
    for(const s of u.gear?.sets??[]){if(s.id===115)derived(u,s,'dmgBoost',s.p2[0],'仅追加攻击');if(s.id===315)derived(u,s,'dmgBoost',(marker(u,315)?.stacks??0)*s.p2[1],'仅追加攻击');if(s.id===123&&s.count>=4&&spirit(b,u))derived(u,s,'speedPct',s.p4[0],'本人的忆灵在场');if(s.id===321){const delta=team(b,u).length-4;derived(u,s,'dmgBoost',delta>0?Math.min(delta,s.p2[2])*s.p2[0]:Math.min(-delta,s.p2[3])*s.p2[1],'按当前在场目标数量实时计算');}}
    for(const from of team(b,u)){const s=four(from,125);if(s&&from.buffs.some(e=>e.tag==='relicRain'))derived(from,s,'critDmg',s.p4[1],'甘霖存在；同类光环不叠加');const a=gear(from,323);if(a&&spirit(b,from))derived(from,a,'speedPct',a.p2[1],'忆灵在场；同类光环不叠加');}
    return out;
  }
  return {start,ready,before,hit,after,attacked,healthConsumed,healed,debuff,broken,death,spSpent,turnStart,refresh,panel,servantPanel,modifiers,display};
}
