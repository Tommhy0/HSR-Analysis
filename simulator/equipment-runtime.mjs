// Additional cones share the same battle events as character modules.
export function equipmentRuntime(api){const {allies,live,buff,stacks,energy,sp,resource,combatPanel,record}=api;
  const oracle=(b,u,d)=>{const p=u.gear.cone.p;buff(b,u,u,'谕示','marker',0,d,{tag:'flowerOracle'});for(const t of allies(b,u))buff(b,u,t,'谕示 · 全队暴伤','critDmg',p[3],d,{tickOwner:u.id,requiresTag:{unit:u.id,tag:'flowerOracle'},removeOnSourceDeath:true});};
  const cogs=(b,u)=>{if(u.gear?.cone?.id===20012&&u.resources['轮契触发回合']!==u.turns){resource(b,u,'轮契触发回合',u.turns);energy(b,u,u.gear.cone.p[0]);}};
  const mirror=(b,u)=>{const p=u.gear?.cone?.p;if(!p)return;
    // 镜中故我：装备者击破特攻提高；施放终结技后我方全体增伤，且击破特攻达标时恢复 1 个战技点。
    for(const to of allies(b,u))buff(b,u,to,'镜中故我 · 增伤','dmgBoost',p[1],p[2],{id:'cone:23019:dmgBoost',tickOwner:u.id});
    if((combatPanel(u).breakEffect??0)+1e-9>=p[3])sp(b,u,1,'镜中故我');};
  const flow=(b,u)=>{const p=u.gear?.cone?.p;if(!p)return;
    // 夜色流光溢彩：移除【歌咏】并获得【华彩】。
    u.buffs=u.buffs.filter(e=>e.id!=='cone:23026:regen');
    buff(b,u,u,'华彩 · 攻击','atkPct',p[3],p[4],{id:'cone:23026:atk',tickOwner:u.id});
    for(const to of allies(b,u))buff(b,u,to,'华彩 · 增伤','dmgBoost',p[2],p[4],{id:'cone:23026:dmgBoost',tickOwner:u.id});
    record(b,'mechanic',u,{name:'夜色流光溢彩 · 华彩',duration:p[4]});};
  return {
    start(b){for(const u of b.units.filter(live)){const id=u.gear?.cone?.id,p=u.gear?.cone?.p;if(!p)continue;if(id===23003||id===21000)buff(b,u,u,u.gear.cone.name+' · 回能','energyRegen',p[0]);if(id===21000)buff(b,u,u,'一场术后对话 · 终结治疗','healingBoost',p[1],null,{abilityType:'Ultra'});if(id===23038){buff(b,u,u,'如果时间是一朵花 · 暴伤','critDmg',p[0]);energy(b,u,p[4]);oracle(b,u,p[5]);}if(id===23019)buff(b,u,u,'镜中故我 · 击破特攻','breakEffect',p[0]);}},
    // 每个波次开始时：镜中故我使我方全体立即恢复能量，同类技能无法重复生效。
    waveStart(b){const wearers=b.units.filter(u=>live(u)&&u.gear?.cone?.id===23019);if(!wearers.length)return;const p=wearers[0].gear.cone.p;for(const to of b.units.filter(t=>live(t)&&t.side===wearers[0].side))energy(b,to,p[4]);},
    before(b,actor,key,kind){if(kind!=='normal')return;for(const u of b.units.filter(u=>live(u)&&u.side===actor.side&&u!==actor&&u.resources?.['下位增伤待生效'])){const p=u.resources['下位增伤待生效'];resource(b,u,'下位增伤待生效',null);buff(b,u,actor,p.name,'dmgBoost',p.value,p.duration);}},
    after(b,u,key,kind,a,selected,hits){const id=u.gear?.cone?.id,p=u.gear?.cone?.p;
      // 夜色流光溢彩：我方角色每次攻击时装备者获得 1 层【歌咏】（攻击者不限定为装备者）。
      if(hits.length)for(const t of b.units.filter(t=>live(t)&&t.side===u.side&&t.gear?.cone?.id===23026)){const q=t.gear.cone.p,st=stacks(b,t,t,'歌咏','energyRegen',q[0],q[1],null,{id:'cone:23026:regen'});resource(b,t,'歌咏层数',st.stacks);}
      if(!p)return;
      if(id===23019&&key==='ultimate')mirror(b,u);
      if(id===23026&&key==='ultimate')flow(b,u);
      if(hits.length)cogs(b,u);
      if([23003,21025].includes(id)&&key==='skill')resource(b,u,'下位增伤待生效',{name:u.gear.cone.name,value:p[id===23003?1:0],duration:p[id===23003?2:1]});
      if(id===23003&&key==='ultimate'&&['ally','allies','self','lowestAlly'].includes(a.target)){const n=(u.resources['战斗还未结束终结次数']??0)+1;resource(b,u,'战斗还未结束终结次数',n);if(n%2===1)sp(b,u,1,'但战斗还未结束');}
      if(id===23034&&['skill','ultimate'].includes(key)&&a.target==='ally'){energy(b,u,p[0]);stacks(b,u,selected[0],'圣咏','dmgBoost',p[1],p[2],p[3]);const n=(u.resources['飞行单体技能次数']??0)+1;resource(b,u,'飞行单体技能次数',n);if(n%p[4]===0)sp(b,u,1,'回到大地的飞行');}
      if(id===23038&&(kind==='followup'||a.countAsFollowup)){energy(b,u,p[1]);oracle(b,u,p[2]);}
    },
    attacked(b,to){cogs(b,to);},
    turnStart(b,u){const p=u.gear?.cone?.p;if(u.gear?.cone?.id!==21021)return;const pool=allies(b,u).filter(t=>t!==u&&t.energyMax>0&&t.energy/t.energyMax<p[0]);if(pool.length)energy(b,pool[Math.floor(b.random()*pool.length)],p[1]);},
  };
}
