// DeepSeek batch-05：4 名虚无 / 持续伤害角色（4.6 固定数据）。
//
// 数值索引逐条核对 `_data_cache/hsr_core.json` 的 desc `#n` 与
// `simulator/roster-data.mjs` 的 `ROSTER_DATA[id].skills[].params`；
// 段数 / 时序 / 概率取自 `_data_cache/strict_research/Avatar_<Name>_00_Ability.json`：
//   1108 桑博  Avatar_Sampo_00_Ability.json
//   1111 卢卡  Avatar_Luka_00_Ability.json
//   1210 桂乃芬 Avatar_Guinaifen_00_Ability.json
//   1218 椒丘  Avatar_Jiaoqiu_00_Ability.json
// DoT 一律走共享 dot()（基础概率、命中 / 抵抗、刷新层数、duration、tickOwner），
// 由引擎按 kind==='dot' 强制 noncrit。
import {atk,basic,skill,ultimate} from '../actions.mjs';

export const IDS=[1108,1111,1210,1218];

// ROSTER_DATA 帮助函数：按技能类型 / 技能 id 取原始行。
const list=(d,type)=>Object.values(d.skills).find(s=>s.type===type);
const pick=(d,id)=>d.skills[id];
// 卢卡强化普攻【直冲碎天拳】与普攻共用等级轨道（E5「普攻等级+1」同样生效）：
// 用 p.Normal[0] 反查普攻等级行，再取强化普攻表，避免依赖 compileRegisteredKit 未注入的 p.EnhancedNormal。
const enhancedRow=(p,d)=>{
  const base=list(d,'Normal');
  const key=Object.keys(base.params).find(k=>base.params[k].param_list[0]===p.Normal[0]);
  const row=pick(d,111108).params[key??'10'];
  return row.param_list;
};

const factories={
  // ───────────────────────── 1108 桑博（风 · 虚无） ─────────────────────────
  // desc 索引：普攻 #1=1.4；战技 #1=4 次额外伤害 / #2=0.56；终结 #1=1.6 / #2=0.3 持续伤害提高
  // / #3=2 回合 / #4=1 基础概率；天赋 #1=0.65 基础概率 / #2=0.52 每层倍率 / #3=3 回合 / #4=5 层上限。
  // 行迹 圈套[1] 延长风化 1 回合；后手[10] 终结额外回能；加料[0.15] 风化目标对桑博伤害降低。
  // 星魂 E1[1] 战技额外 1 次弹射；E2[1,1] 风化目标死亡→全体叠 1 层；E4[5,0.08] ≥5 层时引爆 8%；
  // E6[0.15] 风化倍率提高。
  1108:function(api){
    const {live,enemies,rank,trace,buff,energy,delay,dot,damageTo,combatPanel}=api;
    const WIND='桑博 · 风化';
    const perLayer=u=>u.kit.params.Talent[1]+(rank(u,6)?rank(u,6):0);
    const layerMax=u=>u.kit.params.Talent[3];
    const windDur=u=>u.kit.params.Talent[2]+(trace(u,1)?trace(u,1)[0]:0);
    // 每次命中按天赋基础概率叠 1 层风化；dot() 内部结算效果命中 / 效果抵抗并刷新 duration。
    function applyWind(b,u,to,layers,base){
      const ex=to.dots.find(d=>d.windShear&&d.source===u.id);
      const n=Math.min(layerMax(u),(ex?.stacks??0)+layers);
      return dot(b,u,to,{name:WIND,element:'Wind',terms:[{scaling:'atk',multiplier:perLayer(u)*n}],chance:base,duration:windDur(u),stacks:n,extra:{windShear:true}});
    }
    // E4：战技击中已有 ≥5 层风化的目标，使其立即产生原伤害 8% 的伤害（kind='dot' 不暴击）。
    function burst(b,u,to){
      const ratio=rank(u,4,1);if(!ratio)return;
      const d=to.dots.find(x=>x.windShear&&x.source===u.id);
      if(!d||(d.stacks??0)<rank(u,4,0))return;
      damageTo(b,u,to,{name:'桑博 E4 · 风化引爆',type:'Additional',element:'Wind',terms:[{scaling:'atk',multiplier:(d.terms?.[0]?.multiplier??0)*ratio}],toughness:0},1,'primary','dot');
    }
    return {
      // 秘技：目盲 + 主动攻击后使敌方每个单体行动延后 25%。
      entry(b,u){for(const to of enemies(b,u))delay(b,to.id,u.kit.params.Maze[2]);},
      before(b,u,actor,key,kind,a,selected){
        if(actor!==u||key!=='ultimate')return;
        const P=u.kit.params;
        if(trace(u,2))energy(b,u,trace(u,2)[0]);   // 行迹「后手」
        for(const to of selected){
          const c=P.Ultra[3]*(1+(combatPanel(u).effectHit??0))*(1-(combatPanel(to).effectRes??0));
          if(c>=1||b.random()<c)buff(b,u,to,'惊喜礼盒 · 持续伤害提高','marker',0,P.Ultra[2],{tag:'sampoDotVuln',debuff:true});
        }
      },
      // 普攻 3 段 / 战技主段 + 4 次弹射 / 终结都逐次触发天赋，且 E4 在本次风化叠加之前判定。
      hit(b,u,actor,to,a,kind){
        // 行迹「加料」：风化状态的敌人对桑博造成的伤害降低 15%。
        // 减伤按「本次伤害的攻击者是否带风化」判定，因此在伤害结算前临时挂到桑博身上、结算后移除。
        if(to===u){
          if(actor&&actor.side!==u.side&&trace(u,3)&&actor.dots.some(d=>d.windShear&&d.source===u.id))
            buff(b,u,u,'加料','dmgReduction',trace(u,3)[0],1,{id:'sampo:trace3'});
          return;
        }
        if(actor!==u||kind==='dot'||to.side===u.side||!live(to))return;
        if(a.type==='BPSkill')burst(b,u,to);
        applyWind(b,u,to,1,u.kit.params.Talent[0]);
      },
      afterHit(b,u,actor,to,a,kind){
        void actor;void a;void kind;
        if(to===u)u.buffs=u.buffs.filter(e=>e.id!=='sampo:trace3');
      },
      death(b,u,from,to){
        if(to.side===u.side)return;   // E2：任何来源消灭风化目标都触发
        if(!to.dots.some(d=>d.windShear&&d.source===u.id))return;
        const ch=rank(u,2,0),lay=rank(u,2,1);
        if(!ch)return;
        for(const e of enemies(b,u))if(e!==to)applyWind(b,u,e,lay,ch);
      },
      // 终结技「被攻击目标受到的持续伤害提高」：只对 kind='dot' 增加易伤。
      modifiers(b,u,actor,to,a,kind){
        if(kind==='dot'&&to.side!==u.side&&to.buffs.some(e=>e.tag==='sampoDotVuln'))return {vuln:u.kit.params.Ultra[1]};
        return {};
      },
    };
  },

  // ───────────────────────── 1111 卢卡（物理 · 虚无） ─────────────────────────
  // desc 索引：普攻 #1=1.4；战技 #1=1.2 / #2=1 基础概率 / #3=0.24 目标生命上限 / #4=3.38 攻击力上限
  // / #5=3 回合；终结 #1=3.3 / #2=1 基础概率 / #3=0.2 易伤 / #4=3 回合 / #5=2 层斗志；
  // 天赋 #1=1 层斗志 / #2=0.85 引爆比例；强化普攻 #1=0.28×3 / #2=1.12；秘技 #1=0.5 / #2=1。
  // 行迹 动能过载[1] 驱散 1 个增益；循环制动[3] 每层斗志回能；粉碎斗志[0.5] 每段 50% 追加一段。
  // 星魂 E1[0.15,2] 行动时裂伤目标则增伤；E2[1] 物理弱点战技 +1 层；E4[0.05,4] 每层斗志加攻；
  // E6[0.08] 碎天拳按直冲拳段数引爆裂伤。
  1111:function(api){
    const {live,enemies,get,rank,trace,buff,resource,energy,dot,damageTo,combatPanel}=api;
    const BLEED='卢卡 · 裂伤';
    // 获得斗志：天赋最多 4 层，行迹「循环制动」每层额外回能。
    function gain(b,u,n){
      if(!n)return;
      const cur=u.resources['斗志']??0,add=Math.min(4,cur+n)-cur;
      if(add<=0)return;
      resource(b,u,'斗志',cur+add);
      if(trace(u,2))energy(b,u,trace(u,2)[0]*add);
    }
    // 裂伤：每回合开始造成目标生命上限 24% 的物理持续伤害，不超过卢卡攻击力 338%。
    // 引擎 dot 以施法者面板 × terms 结算，因此把「min(目标上限%, 攻击力上限)」换算成攻击力倍率快照。
    function applyBleed(b,u,to,base){
      const P=u.kit.params,atkNow=combatPanel(u).atk;
      if(atkNow<=0)return null;
      const value=Math.min(combatPanel(to).hp*P.BPSkill[2],atkNow*P.BPSkill[3]);
      return dot(b,u,to,{name:BLEED,element:'Physical',terms:[{scaling:'atk',multiplier:value/atkNow}],chance:base,duration:P.BPSkill[4],extra:{bleed:true,snapshotAtk:true}});
    }
    // 「原伤害的 X%」：裂伤 dot 当前快照倍率 × 比例。
    function burstBleed(b,u,to,ratio){
      const d=to.dots.find(x=>x.bleed&&x.source===u.id);
      if(!d||!ratio)return;
      damageTo(b,u,to,{name:'卢卡 · 裂伤引爆',type:'Additional',element:'Physical',terms:[{scaling:'atk',multiplier:(d.terms?.[0]?.multiplier??0)*ratio}],toughness:0},1,'primary','dot');
    }
    // 行迹「粉碎斗志」额外段的倍率 = 强化普攻第 1 段（直冲拳）倍率，从已编译动作表反推。
    function enhancedPunch(u){
      const act=u.actions.enhancedBasic;
      return (act.terms[0]?.multiplier??0)*(act.hitShares?.[0]??0);
    }
    return {
      start(b,u){resource(b,u,'斗志',1);},   // 天赋：战斗开始时持有 1 层
      // 战技强化为普攻：斗志 ≥2 层时替换为【直冲碎天拳】（消耗在 before 结算，避免 prepare 被调用两次重复扣层）。
      prepare(b,u,key,kind,a){
        if(key!=='basic'||kind==='copy')return a;
        if((u.resources['斗志']??0)>=2)return {...u.actions.enhancedBasic,targetId:a.targetId};
        return a;
      },
      before(b,u,actor,key,kind,a,selected){
        if(actor!==u)return;
        const P=u.kit.params;
        // 强化普攻在动作开始时消耗 2 层斗志（prepare 每次施放会被调用两次，故不在此扣层）。
        if(key==='basic'&&a.name===u.actions.enhancedBasic.name)resource(b,u,'斗志',Math.max(0,(u.resources['斗志']??0)-2));
        if(key==='ultimate'){
          gain(b,u,P.Ultra[4]);   // 获得 2 层斗志
          for(const to of selected){
            const c=P.Ultra[1]*(1+(combatPanel(u).effectHit??0))*(1-(combatPanel(to).effectRes??0));
            if(c>=1||b.random()<c)buff(b,u,to,'制胜一击 · 易伤','vuln',P.Ultra[2],P.Ultra[3],{debuff:true});
          }
        }
      },
      after(b,u,actor,key,kind,a,selected,hits){
        if(actor!==u||!hits.length)return;
        const P=u.kit.params;
        if(key==='skill'){
          // 行迹「动能过载」：立即解除目标 1 个增益。只取可驱散的正面效果。
          if(trace(u,1)){const to=selected[0];const positive=to.buffs.filter(e=>!e.debuff&&!e.control&&e.dispellable!==false).slice(0,trace(u,1)[0]);for(const e of positive)to.buffs=to.buffs.filter(x=>x!==e);}
          for(const to of hits.filter(live))applyBleed(b,u,to,P.BPSkill[1]);
          if(rank(u,2)&&selected[0]&&(selected[0].weaknesses??[]).includes('Physical'))gain(b,u,rank(u,2));
        }
        if(key==='basic'){
          if(a.name===u.actions.enhancedBasic.name){
            const to=selected[0];
            // 行迹「粉碎斗志」：直冲拳每 1 段 50% 固定概率额外施放 1 段（不作用于额外段）。
            if(trace(u,3)&&to)for(let i=0;i<3;i++)if(b.random()<trace(u,3)[0])
              damageTo(b,u,to,{name:'直冲拳 · 粉碎斗志',type:'Normal',element:'Physical',terms:[{scaling:'atk',multiplier:enhancedPunch(u)}],toughness:0},1,'primary','direct');
            // E6：碎天拳击中裂伤目标 → 直冲拳每 1 段引爆一次裂伤（3 段 × 8%）。
            if(rank(u,6)&&to)for(let i=0;i<3;i++)burstBleed(b,u,to,rank(u,6));
          } else gain(b,u,1);   // 普攻 / 战技后获得 1 层斗志
        }
        if(key==='ultimate')gain(b,u,P.Ultra[4]);
      },
      turnStart(b,u,actor){
        if(actor!==u)return;
        if(!rank(u,1))return;
        const to=get(b,u.policy?.targetId)??enemies(b,u)[0];
        if(to&&to.dots.some(d=>d.bleed&&d.source===u.id))
          buff(b,u,u,'卢卡 E1 · 增伤','dmgBoost',rank(u,1,0),rank(u,1,1));
      },
      panel(b,u,to,out){
        if(to!==u||!rank(u,4))return;
        const stacks=u.resources['斗志']??0;
        out.atk+=(u.panel.baseStats?.atk??0)*rank(u,4,0)*stacks;
      },
    };
  },

  // ───────────────────────── 1210 桂乃芬（火 · 虚无） ─────────────────────────
  // desc 索引：普攻 #1=1.4；战技 #1=1.2 主 / #2=0.4 相邻 / #3=1 基础概率 / #4=2.18208 灼烧倍率
  // / #5=2 回合；终结 #1=1.2 全体 / #2=0.92 引爆比例；天赋 #1=1 基础概率 / #4=0.07 每层易伤
  // / #5=3 回合 / #6=3 层上限；秘技 #1=0.5 / #2=4 次 / #3=1 基础概率。
  // 行迹 缘竿[0.8] 普攻施加灼烧；投狭[0.25] 开场提前；逾锋[0.2] 对灼烧目标增伤。
  // 星魂 E1[1,0.1,2] 战技降效果抵抗；E2[0.4] 灼烧倍率提升；E4[2] 灼烧触发回能；E6[1] 吞火层数上限+1。
  1210:function(api){
    const {live,enemies,rank,trace,buff,stacks,record,energy,advance,dot,damageTo,combatPanel}=api;
    const BURN='桂乃芬 · 灼烧';
    const kissMax=u=>u.kit.params.Talent[5]+rank(u,6);   // E6：吞火层数上限 +1
    // 灼烧：base 为基础概率；E2 在施加时目标已处于灼烧状态则倍率 +40%。
    function applyBurn(b,u,to,base){
      const P=u.kit.params;
      const burning=to.dots.some(d=>d.element==='Fire');
      const mult=P.BPSkill[3]*(1+(burning&&rank(u,2)?rank(u,2):0));
      return dot(b,u,to,{name:BURN,element:'Fire',terms:[{scaling:'atk',multiplier:mult}],chance:base,duration:P.BPSkill[4],extra:{burn:true}});
    }
    // 吞火：灼烧触发伤害后按基础概率叠 1 层易伤，最多 3 层（E6 4 层）。
    function firekiss(b,u,to,base){
      const P=u.kit.params;
      const c=base*(1+(combatPanel(u).effectHit??0))*(1-(combatPanel(to).effectRes??0));
      if(c<1&&b.random()>=c){record(b,'resist',to,{name:'吞火被抵抗'});return;}
      stacks(b,u,to,'吞火','vuln',P.Talent[3],kissMax(u),P.Talent[4],{tag:'firekiss',debuff:true});
    }
    return {
      start(b,u){if(trace(u,2))advance(b,u.id,trace(u,2)[0]);},   // 行迹「投狭」
      entry(b,u){
        const P=u.kit.params,pool=enemies(b,u);
        for(let i=0;i<P.Maze[1];i++){
          const to=pool[Math.floor(b.random()*pool.length)];if(!to)break;
          damageTo(b,u,to,{name:'耍耍把式卖卖艺',type:'Maze',element:'Fire',terms:atk(P.Maze[0]),toughness:15},1,'primary','technique');
          firekiss(b,u,to,P.Maze[2]);
        }
      },
      after(b,u,actor,key,kind,a,selected,hits){
        if(actor!==u||!hits.length)return;
        const P=u.kit.params;
        if(key==='basic'&&trace(u,1))for(const to of hits.filter(live))applyBurn(b,u,to,trace(u,1)[0]);
        if(key==='skill')for(const to of hits.filter(live)){
          applyBurn(b,u,to,P.BPSkill[2]);
          if(rank(u,1))buff(b,u,to,'迎面开门红 · 效果抵抗降低','effectRes',-rank(u,1,1),rank(u,1,2),{debuff:true});
        }
        if(key==='ultimate')for(const to of hits.filter(live)){
          const d=to.dots.find(x=>x.burn&&x.source===u.id);
          if(d)damageTo(b,u,to,{name:'给您来段看家戏 · 灼烧引爆',type:'Additional',element:'Fire',terms:[{scaling:'atk',multiplier:(d.terms?.[0]?.multiplier??0)*P.Ultra[1]}],toughness:0},1,'primary','dot');
        }
      },
      // 天赋：敌方灼烧触发伤害后按基础概率陷入吞火；E4 使桂乃芬自己的灼烧每次触发回 2 点能量。
      afterDamage(b,u,from,to,kind){
        // 吞火由「灼烧状态触发伤害后」触发；击破 · 灼烧（kind='break_dot'）同样是灼烧状态。
        if(!['dot','break_dot'].includes(kind)||!from||to.side===u.side)return;
        const d=to.dots.find(x=>x.element==='Fire'&&x.source===from.id);
        if(!d)return;
        if(from===u&&rank(u,4))energy(b,u,rank(u,4));
        firekiss(b,u,to,u.kit.params.Talent[0]);
      },
      modifiers(b,u,actor,to,a,kind){
        if(actor===u&&trace(u,3)&&to.dots.some(d=>d.element==='Fire'))return {dmgBoost:trace(u,3)[0]};
        return {};
      },
    };
  },

  // ───────────────────────── 1218 椒丘（火 · 虚无） ─────────────────────────
  // desc 索引：普攻 #1=1.4；战技 #1=1.5 主 / #2=0.9 相邻 / #3=1 基础概率；终结 #1=1 全体
  // / #2=0.6 结界基础概率 / #3=0.15 终结技易伤 / #4=3 结界回合 / #5=6 触发上限；
  // 天赋 #1=1 基础概率 / #2=0.15 1 层易伤 / #3=0.05 每额外层 / #4=5 层上限 / #5=2 回合
  // / #6=1.8 灼烧倍率；秘技 #1=1 / #2=15 / #3=1。
  // 行迹 爟火[15] 开场回能；举炊[0.8,0.15,0.6,2.4] 效果命中转攻击；炙香[1] 结界中新敌人获得烬煨。
  // 星魂 E1[0.4,1] 我方对烬煨目标增伤且叠层+1；E2[3] 灼烧倍率+3；E4[0.15] 结界中敌方攻击降低；
  // E6[1,9,0.03] 死亡转移烬煨 / 上限 9 / 每层全属性抗性降低。
  1218:function(api){
    const {live,enemies,rank,trace,tag,buff,resource,dot,allResDown,damageTo,combatPanel,energy}=api;
    const emberMax=u=>rank(u,6)?rank(u,6,1):u.kit.params.Talent[3];   // E6：层数上限提升至 9
    // 烬煨：既是易伤（1 层 15%，每层 +5%），又被视为灼烧（每回合 180% 攻击力火 DoT，E2 +3）。
    function applyEmber(b,u,to,add){
      const P=u.kit.params;
      const cur=to.buffs.find(e=>e.tag==='jiaoqiuEmber')?.stacks??0;
      const n=Math.min(emberMax(u),cur+add);
      const dur=P.Talent[4];
      buff(b,u,to,'烬煨','vuln',P.Talent[1]+P.Talent[2]*(n-1),dur,{id:u.id+':ember',tag:'jiaoqiuEmber',debuff:true,stacks:n});
      dot(b,u,to,{name:'烬煨 · 灼烧',element:'Fire',terms:[{scaling:'atk',multiplier:P.Talent[5]+(rank(u,2)?rank(u,2):0)}],chance:1,duration:dur,stacks:n,extra:{ember:true,burn:true}});
      if(rank(u,6))allResDown(b,u,to,rank(u,6,2)*n,dur);   // E6：每层全属性抗性降低 3%
      resource(b,u,'烬煨最高层',Math.max(u.resources['烬煨最高层']??0,n));
    }
    return {
      start(b,u){if(trace(u,1))energy(b,u,trace(u,1)[0]);},   // 行迹「爟火」
      entry(b,u){
        const P=u.kit.params;
        for(const to of enemies(b,u))damageTo(b,u,to,{name:'旺火却乱',type:'Maze',element:'Fire',terms:atk(P.Maze[0]),toughness:60},1,'primary','technique');
        for(const to of enemies(b,u))applyEmber(b,u,to,1+rank(u,1,1));
      },
      before(b,u,actor,key,kind,a,selected){
        if(actor!==u||key!=='ultimate')return;
        const P=u.kit.params,pool=enemies(b,u);
        // 统一烬煨层数为场上最高值。
        let mx=0;for(const e of pool)mx=Math.max(mx,e.buffs.find(x=>x.tag==='jiaoqiuEmber')?.stacks??0);
        for(const e of pool){const cur=e.buffs.find(x=>x.tag==='jiaoqiuEmber')?.stacks??0;if(mx>cur)applyEmber(b,u,e,mx-cur);}
        buff(b,u,u,'烬煨结界','marker',0,P.Ultra[3],{tag:'jiaoqiuDomain',tickAt:'start'});
        resource(b,u,'烬煨结界触发',0);
        if(rank(u,4))for(const e of pool)buff(b,u,e,'结界 · 攻击降低','atkPct',-rank(u,4),P.Ultra[3],{debuff:true,removeOnSourceDeath:true,id:u.id+':domain-atkdown'});
      },
      // 天赋：普攻 / 战技 / 终结命中后按基础概率施加 1 层烬煨（E1 额外 +1 层）。
      // 在伤害结算之后施加，避免本次命中吃到自己刚叠上的易伤。
      afterHit(b,u,actor,to,a,kind){
        if(actor!==u||kind==='dot'||!live(to)||to.side===u.side)return;
        if(!['Normal','BPSkill','Ultra','Maze'].includes(a.type))return;
        const c=u.kit.params.Talent[0]*(1+(combatPanel(u).effectHit??0))*(1-(combatPanel(to).effectRes??0));
        if(c<1&&b.random()>=c)return;
        applyEmber(b,u,to,1+rank(u,1,1));
      },
      // 结界：敌方行动时按基础概率叠 1 层，结界期间最多触发 6 次（每个目标每回合一次，即其自身回合开始）。
      turnStart(b,u,actor){
        if(actor===u||actor.side===u.side)return;
        if(!tag(u,'jiaoqiuDomain'))return;
        const P=u.kit.params,used=u.resources['烬煨结界触发']??0;
        if(used>=P.Ultra[4])return;
        const c=P.Ultra[1]*(1+(combatPanel(u).effectHit??0))*(1-(combatPanel(actor).effectRes??0));
        if(c<1&&b.random()>=c)return;
        applyEmber(b,u,actor,1+rank(u,1,1));
        resource(b,u,'烬煨结界触发',used+1);
      },
      // 行迹「炙香」：结界存在时新入场敌人获得与场上最高层数相同的烬煨（最低 1 层）。
      waveStart(b,u){
        if(!tag(u,'jiaoqiuDomain'))return;
        const min=Math.max(1,u.resources['烬煨最高层']??0);
        for(const e of enemies(b,u)){
          const cur=e.buffs.find(x=>x.tag==='jiaoqiuEmber')?.stacks??0;
          if(cur===0)applyEmber(b,u,e,min);
        }
      },
      // E6：敌人被消灭时把烬煨转移给场上层数最低的存活敌人。
      death(b,u,from,to){
        if(to.side===u.side)return;
        const e=to.buffs.find(x=>x.tag==='jiaoqiuEmber');if(!e)return;
        const pool=enemies(b,u).filter(x=>x!==to);if(!pool.length)return;
        const stacksOf=x=>x.buffs.find(y=>y.tag==='jiaoqiuEmber')?.stacks??0;
        const lowest=pool.reduce((a,c)=>stacksOf(c)<stacksOf(a)?c:a);
        applyEmber(b,u,lowest,e.stacks);
      },
      // 行迹「举炊」：效果命中 >80% 后每超过 15% 提高 60% 攻击力，上限 240%。
      panel(b,u,to,out){
        if(to!==u)return;
        const t=trace(u,2);if(!t)return;
        const steps=Math.max(0,Math.floor(((out.effectHit??0)-t[0])/t[1]+1e-9));
        const bonus=Math.min(t[3],steps*t[2]);
        if(bonus>0)out.atk+=(u.panel.baseStats?.atk??0)*bonus;
      },
      modifiers(b,u,actor,to,a,kind){
        const out={};
        if(actor.side===u.side&&to.side!==u.side){
          if(rank(u,1)&&to.buffs.some(e=>e.tag==='jiaoqiuEmber'))out.vuln=(out.vuln??0)+rank(u,1);
          if(tag(u,'jiaoqiuDomain')&&a.type==='Ultra')out.vuln=(out.vuln??0)+u.kit.params.Ultra[2];
        }
        return out;
      },
    };
  },
};

const actions={
  // 段数取自原始脚本：普攻 Skill01_Phase02 = 3 段；战技 1 次主段 + FireBullet_Ability 弹射（数量=#1，E1+1）；
  // 终结 Skill03_Phase02 = 1 段。削韧 30 / 主 30+弹射 15 / 60。
  1108:(p,d,{eidolon=0}={})=>{
    const sp=list(d,'BPSkill').spBase;
    return {
      basic:basic(p,d,{terms:atk(p.Normal[0]),hitShares:[.3,.3,.4]}),
      skill:skill(p,d,{terms:atk(p.BPSkill[1]),toughness:30,energyGain:sp,bounceCount:p.BPSkill[0]+(eidolon>=1?d.ranks[1][0]:0),bounceTerms:atk(p.BPSkill[1]),bounceToughness:15,bounceEnergy:sp}),
      ultimate:ultimate(p,d,{target:'all',terms:atk(p.Ultra[0]),toughness:60}),
    };
  },
  // 强化普攻【直冲碎天拳】：desc「直冲拳 3 段 #1 + 碎天拳 1 段 #2」，总倍率 3*#1+#2，按真实伤害段分配 hitShares。
  // （原始脚本 Skill11_Phase02 另有 1 个行迹「粉碎斗志」条件段节点，属额外攻击，由模块 handler 结算。）
  1111:(p,d,{eidolon=0}={})=>{
    const enh=enhancedRow(p,d),total=3*enh[0]+enh[1];
    return {
      basic:basic(p,d,{terms:atk(p.Normal[0])}),
      enhancedBasic:basic(p,d,{name:pick(d,111108).name,terms:atk(total),hitShares:[enh[0]/total,enh[0]/total,enh[0]/total,enh[1]/total],toughness:60}),
      skill:skill(p,d,{terms:atk(p.BPSkill[0]),toughness:60}),
      ultimate:ultimate(p,d,{terms:atk(p.Ultra[0]),toughness:90}),
    };
  },
  // 战技为扩散：主目标 #1、相邻 #2；段数 Skill02_Phase02 = 2 段（主 / 相邻）。
  1210:(p,d,{eidolon=0}={})=>{
    const adj={...atk(p.BPSkill[1])[0],target:'adjacent'};
    return {
      basic:basic(p,d,{terms:atk(p.Normal[0])}),
      skill:skill(p,d,{target:'blast',terms:[...atk(p.BPSkill[0]),adj],toughness:60,adjacentToughness:30}),
      ultimate:ultimate(p,d,{target:'all',terms:atk(p.Ultra[0]),toughness:60}),
    };
  },
  1218:(p,d,{eidolon=0}={})=>{
    const adj={...atk(p.BPSkill[1])[0],target:'adjacent'};
    return {
      basic:basic(p,d,{terms:atk(p.Normal[0])}),
      skill:skill(p,d,{target:'blast',terms:[...atk(p.BPSkill[0]),adj],toughness:60,adjacentToughness:30}),
      ultimate:ultimate(p,d,{target:'all',terms:atk(p.Ultra[0]),toughness:60}),
    };
  },
};

export {factories,actions};
