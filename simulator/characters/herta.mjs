export function herta(api){const {allies,live,rank,trace,buff,stacks,resource,combatPanel,damageTo}=api;
  return {
    entry(b,u){buff(b,u,u,'可以优化一下','atkPct',u.kit.params.Maze[0],u.kit.params.Maze[1]);},
    before(b,u,actor,key,kind,a){if(actor===u&&kind==='followup'){a.repeatCount=u.resources['待结算转圈']??1;a.energyGain=5*a.repeatCount;resource(b,u,'待结算转圈',0);u.hertaSpinAction=a;}},
    repeatStart(b,u,actor,key,kind){if(actor===u&&kind==='followup'&&rank(u,2))stacks(b,u,u,'黑塔 E2 · 暴击','critRate',rank(u,2),u.kit.ranks[2][1],null);},
    afterDamage(b,u,actor,to,kind){if(actor?.side!==u.side||to.side===u.side||['dot','break_dot'].includes(kind))return;
      // 控制类负面状态（冻结 / 禁锢 / 纠缠 / 支配等）期间不发动追击，也不占用该敌人的触发标记。
      if([...u.buffs,...u.dots].some(e=>e.control))return;
      const used=u.resources['已触发半血追击的敌人']??[];if(to.hp/combatPanel(to).hp>u.kit.params.Talent[0]){if(used.includes(to.id))resource(b,u,'已触发半血追击的敌人',used.filter(id=>id!==to.id));return;}if(used.includes(to.id))return;resource(b,u,'已触发半血追击的敌人',[...used,to.id]);
      if(u.hertaSpinAction&&b.activeAction?.actor===u.id&&b.activeAction.kind==='followup'){u.hertaSpinAction.repeatCount++;u.hertaSpinAction.energyGain+=5;}
      else {resource(b,u,'待结算转圈',(u.resources['待结算转圈']??0)+1);if(!b.queue.some(q=>q.actor===u.id&&q.key==='followup'))b.queue.push({actor:u.id,key:'followup',kind:'followup'});}
    },
    // E1「落井下石」的判定发生在造成伤害之前（原始脚本 Skill01_CheckHp 为 OnBeforeHit）。
    hit(b,u,actor,to,a,kind){if(actor!==u||!rank(u,1)||a.type!=='Normal'||to.side===u.side||kind!=='direct')return;
      if(to.hp/combatPanel(to).hp<=u.kit.ranks[1][0]){const list=u.resources['E1目标']??[];if(!list.includes(to.id))resource(b,u,'E1目标',[...list,to.id]);}},
    after(b,u,actor,key,kind,a,selected,hits){if(actor===u){if(key==='basic'&&rank(u,1)&&(u.resources['E1目标']??[]).length)
        for(const id of u.resources['E1目标']){const to=b.units.find(t=>t.id===id);if(to&&live(to))damageTo(b,u,to,{name:'黑塔 E1 · 落井下石',type:'Normal',element:'Ice',terms:[{scaling:'atk',multiplier:u.kit.ranks[1][1]}],toughness:0},1,'primary','additional');}
      if(actor===u)resource(b,u,'E1目标',[]);
      if(key==='ultimate'&&rank(u,6))buff(b,u,u,'黑塔 E6 · 攻击','atkPct',rank(u,6),u.kit.ranks[6][1]);}
      if(actor===u&&kind==='followup')delete u.hertaSpinAction;
    },
    panel(b,u,to,out){if(to===u&&trace(u,2))out.controlRes=1-(1-(to.controlRes??0))*(1-trace(u,2)[0]);},
    modifiers(b,u,actor,to,a,kind){if(actor!==u)return {};let dmgBoost=0;if(a.type==='BPSkill'&&to.hp/combatPanel(to).hp>=u.kit.params.BPSkill[1])dmgBoost+=u.kit.params.BPSkill[2]+(trace(u,1)?.[0]??0);if(a.type==='Ultra'&&[...to.buffs,...to.dots].some(e=>e.control==='freeze')&&trace(u,3))dmgBoost+=trace(u,3)[0];if(kind==='followup'&&rank(u,4))dmgBoost+=rank(u,4);return {dmgBoost};},
  };
}
