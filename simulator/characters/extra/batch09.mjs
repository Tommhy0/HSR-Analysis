// DeepSeek batch-09：4 名虚无核心角色（4.6 固定数据）。
//
// 数值索引逐条核对 `_data_cache/hsr_core.json` 的 desc `#n` 与 `params[等级].param_list`，
// 段数 / 时序 / 概率 / 触发窗口取自 `_data_cache/strict_research/Avatar_<Name>_00_Ability.json`：
//   1005 卡芙卡   Avatar_Kafka_00_Ability.json
//   1307 黑天鹅   Avatar_BlackSwan_00_Ability.json
//   1308 黄泉     Avatar_Acheron_00_Ability.json
//   1006 银狼     Avatar_Silwolf_00_Ability.json（roster-evidence：sha256 8fb623da…）
// 固定提交 312b4597691e0a29cf9828a15b592757dba86949。
//
// 持续伤害一律走共享 `dot()`（基础概率 / 效果命中 / 效果抵抗 / 按 id 刷新 / duration / tickOwner），
// 引擎在 tickOwner 回合开始结算并强制 `critMode='noncrit'`；引爆 = 用 `damageTo(..., kind='dot')`
// 按原 DoT 快照倍率的比例立即结算（同样不暴击）。
//
// 关键参数索引（10 级口径，普攻 6 级）：
//   卡芙卡  战技[1.6 主, 0.75 引爆比例, 0.6 相邻]；终结[0.8 伤害, 1 基础概率, 2 回合, 2.9 触电倍率, 1 引爆比例]
//           天赋[1.4 伤害, 1 基础概率, 2 回合]；秘技[1 概率, 2 回合, 0.5 伤害]；行迹1=终结引爆全部持续伤害
//           行迹2=触电目标阵亡回 5 能；行迹3=终结/秘技/天赋触电基础概率 +0.3；E1[1,0.3,2]；E2[0.25]
//           E4[2 回能]；E6[1.56 倍率, 1 回合]
//   黑天鹅  普攻[0.6 伤害, 0.65 叠层, 0.65 每状态额外叠层]；战技[0.9 伤害, 1 叠层, 1 降防概率, 0.208 降防, 3 回合]
//           终结[1.2 伤害, 2 揭露回合, 0.25 自身回合易伤, 1 次不重置上限]；天赋[2.4 基础倍率, 0.65 叠层概率,
//           0.12 每层提高, 3 层相邻阈值, 1.8 相邻倍率, 7 层无视防御阈值, 0.2 无视防御, 50 层上限]
//           秘技[1.5 概率, 0.5 成功率衰减]；行迹1[0.65] 行迹2[0.65,3] 行迹3[0.6,0.72]；E1[0.25] E2[1,6]
//           E4[0.1,8] E6[0.5 固定概率, 0.65 基础概率, 1 额外层]
//   黄泉    普攻[1]；战技[1.6 主, 0.6 相邻, 1 残梦/集真赤]；终结[0.24 啼泽雨斩单体, 0.15 每层消去倍率,
//           1.2 黄泉返渡, 9 残梦上限, 0.6 消去倍率上限, 3.72 单体最高, 3.6 其他最高]
//           天赋[9 残梦上限, 0.2 终结期间全属性抗性降低]；秘技[2 伤害, 1 四相断我]
//           行迹1[5 开场残梦, 3 四相断我上限] 行迹2[1.15,1.6] 行迹3[0.3 增伤, 3 层上限, 3 回合, 6 次额外伤害, 0.25 每次倍率]
//           E1[0.18 暴击率] E2（奈落需求 -1，回合开始 +1 残梦/集真赤）E4[0.08 终结易伤] E6[0.2 终结抗穿]
//   银狼    普攻[1]；战技[1.96 伤害, 0.85 弱点概率, 2 弱点回合, 0.2 对应抗性, 1 全抗概率, 0.1 全抗, 2 回合]
//           终结[3.8 伤害, 1 减防概率, 0.45 减防, 3 回合]；天赋[0.1 攻降, 0.08 防降, 0.06 速降, 0.72 概率, 3 回合]
//           秘技[0.8 伤害]；行迹1[1 缺陷回合, 0.65 击破植入] 行迹2[1 弱点回合] 行迹3[3 负面阈值, 0.03 全抗]
//           E1[7 回能, 5 次上限] E2[0.2 效果抵抗] E4[0.2 附加伤害, 5 次上限] E6[0.2 每负面增伤, 1 增伤上限]
import {atk,basic,skill,ultimate,talentAction} from '../actions.mjs';
import {ROSTER_DATA} from '../../roster-data.mjs';

export const IDS=[1005,1307,1308,1006];
// 秘技（Maze）削韧取自固定 4.6 的 ROSTER_DATA 技能记录。
const list=(d,type)=>Object.values(d.skills).find(s=>s.type===type);
const mazeStance=id=>list(ROSTER_DATA[id],'Maze')?.stance?.[0]??60;

const factories={
  // ───────────────────────── 1005 卡芙卡（雷 · 虚无） ─────────────────────────
  1005:function(api){
    const {live,enemies,rank,trace,buff,resource,energy,dot,damageTo,combatPanel,record}=api;
    const SHOCK='卡芙卡 · 触电';
    // 触电快照：倍率 Ultra[3]=2.9（E6 ×(1+1.56)），duration Ultra[2]=2（E6 +1）。
    const shockMult=u=>u.kit.params.Ultra[3]*(rank(u,6)?1+rank(u,6,0):1);
    const shockDur=u=>u.kit.params.Ultra[2]+(rank(u,6)?rank(u,6,1):0);
    // 基础概率：行迹「荆棘」(point08) 使终结/秘技/天赋追加攻击的触电基础概率 +0.3。
    const base=u=>trace(u,3)?trace(u,3)[0]:0;
    function applyShock(b,u,to,chance){
      return dot(b,u,to,{name:SHOCK,element:'Thunder',terms:[{scaling:'atk',multiplier:shockMult(u)}],chance,duration:shockDur(u),extra:{shock:true}});
    }
    // 引爆：把目标当前承受的持续伤害按比例立即结算（kind='dot' 不暴击）。
    // 行迹「折磨」(point06) 让终结技从「只引爆触电」变为「引爆全部持续伤害」。
    function detonate(b,u,to,ratio,onlyShock){
      if(!live(to)||!ratio)return 0;
      let n=0;
      for(const d of [...to.dots]){
        if(onlyShock&&!d.shock)continue;
        // 引爆归属：伤害必须按该持续伤害施加者的面板 / 光锥 / 遗器结算，而不是引爆者卡芙卡；
        // 目标身上的卡芙卡 E1 易伤仍由卡芙卡自己的 modifiers 对 kind='dot' 生效。
        const src=b.units.find(x=>x.id===d.source)??u;
        let terms=null;
        if(d.terms?.length)terms=d.terms.map(t=>({...t,multiplier:(t.multiplier??0)*ratio,flatAdd:(t.flatAdd??0)*ratio}));
        else if((d.value??0)>0){
          // 击破持续伤害等固定值：breaks.tick 对非物理属性按 dot.stacks 结算（风化/纠缠可叠层），
          // 引爆必须沿用同一语义，否则「原伤害的 75%」会漏掉层数而偏小。
          const st=d.element==='Physical'?1:(d.stacks??1);
          terms=[{scaling:'atk',multiplier:0,flatAdd:(d.value??0)*st*ratio}];
        }
        if(!terms)continue;
        b.kafkaDetonate=(b.kafkaDetonate??0)+1;
        damageTo(b,src,to,{name:(d.name??'持续伤害')+' · 引爆',type:'Additional',element:d.element,
          terms,toughness:0},1,'primary','dot');
        b.kafkaDetonate--;
        n++;
      }
      return n;
    }
    return {
      // 秘技「宽恕无关慈悲」：对敌方全体造成 Maze[2]=0.5 倍雷伤（削韧 60），
      // 并按 Maze[0]=1（+行迹 +0.3）基础概率施加与终结技相同的触电（Maze[1]=2 回合）。
      entry(b,u){
        const P=u.kit.params;
        for(const to of enemies(b,u))damageTo(b,u,to,{name:'宽恕无关慈悲',type:'Maze',element:'Thunder',
          terms:atk(P.Maze[2]),toughness:mazeStance(u.characterId)},1,'primary','technique');
        for(const to of enemies(b,u).filter(live))applyShock(b,u,to,P.Maze[0]+base(u));
      },
      after(b,u,actor,key,kind,a,selected,hitTargets){
        const P=u.kit.params;
        // 天赋「温柔亦同残酷」：队友施放普攻后卡芙卡立即发动追加攻击（每回合 1 次）。
        // 「该效果每回合只能触发 1 次」的计时者是卡芙卡自身回合：卡芙卡未再次行动时，
        // 多名队友连续普攻也只触发一次（不能用全场回合编号 b.turns 近似）。
        if(actor!==u){
          if(actor.side===u.side&&key==='basic'&&kind==='normal'&&a.type==='Normal'&&hitTargets.length&&live(hitTargets[0])&&u.resources['天赋触发回合']!==u.turns){
            resource(b,u,'天赋触发回合',u.turns);
            b.queue.push({actor:u.id,key:'followup',kind:'followup',targetId:hitTargets[0].id});
          }
          return;
        }
        // 战技：指定敌方单体若处于持续伤害状态，其当前承受的所有持续伤害立即产生 BPSkill[1]=75% 的伤害。
        if(key==='skill'){
          const to=selected[0];
          if(to&&live(to))detonate(b,u,to,P.BPSkill[1],false);
        }
        // 终结技：先按 Ultra[2]/[3] 施加触电，再按 Ultra[4]=100% 引爆；
        // 行迹「折磨」存在时引爆目标身上全部持续伤害，否则只引爆触电。
        if(key==='ultimate'){
          const targets=hitTargets.filter(live),chance=P.Ultra[1]+base(u);
          for(const to of targets)applyShock(b,u,to,chance);
          const onlyShock=!trace(u,1);
          for(const to of targets)detonate(b,u,to,P.Ultra[4],onlyShock);
        }
        // 天赋追加攻击：造成 Talent[0] 伤害后按 Talent[1]（+行迹 +0.3）施加触电；
        // E1：100% 基础概率使目标受到的持续伤害提高 30%，持续 2 回合。
        if(key==='followup'){
          const to=hitTargets[0];
          if(!to||!live(to))return;
          applyShock(b,u,to,P.Talent[1]+base(u));
          if(rank(u,1)){
            const c=rank(u,1,0)*(1+(combatPanel(u).effectHit??0))*(1-(combatPanel(to).effectRes??0));
            if(c<1&&b.random()>=c)record(b,'resist',to,{name:'卡芙卡 E1 被抵抗'});
            else buff(b,u,to,'卡芙卡 E1 · 持续伤害提高','marker',0,rank(u,1,2),{id:u.id+':kafka-e1',tag:'kafkaE1',debuff:true,removeOnSourceDeath:true});
          }
        }
      },
      // E4：由卡芙卡造成的触电每次产生伤害时额外恢复 2 点能量（引爆结算不算「触电产生伤害」）。
      afterDamage(b,u,from,to,kind){
        if(kind!=='dot'||!from||from.side!==u.side||to.side===u.side)return;
        if(b.kafkaDetonate)return;
        if(from===u&&rank(u,4)&&to.dots.some(d=>d.shock&&d.source===u.id))energy(b,u,rank(u,4));
      },
      // 行迹「掠夺」(point07)：触电状态下的敌方目标被消灭时，卡芙卡额外恢复 5 点能量。
      death(b,u,from,to){
        if(to.side===u.side)return;
        if(trace(u,2)&&to.dots.some(d=>d.shock&&d.source===u.id))energy(b,u,trace(u,2)[0]);
      },
      modifiers(b,u,actor,to,a,kind){
        const out={};
        if(to.side===u.side)return out;
        // E2：卡芙卡在场时我方全体造成的持续伤害提高 25%。
        if(kind==='dot'&&rank(u,2)&&actor.side===u.side)out.dmgBoost=(out.dmgBoost??0)+rank(u,2);
        // E1：目标受到的持续伤害提高 30%（只作用于持续伤害，不含直伤）。
        if(kind==='dot'&&rank(u,1)&&to.buffs.some(e=>e.tag==='kafkaE1'))out.vuln=(out.vuln??0)+rank(u,1,1);
        return out;
      },
    };
  },

  // ───────────────────────── 1307 黑天鹅（风 · 虚无） ─────────────────────────
  1307:function(api){
    const {live,allies,enemies,rank,trace,buff,resource,energy,dot,damageTo,combatPanel,record}=api;
    const ARCANA='黑天鹅 · 奥迹';
    const FOUR=['Wind','Physical','Fire','Thunder'];
    const arcana=to=>to.buffs.find(e=>e.tag==='blackSwanArcana');
    const arcanaStacks=to=>arcana(to)?.stacks??0;
    const arcanaDot=to=>to.dots.find(d=>d.arcana);
    // 天赋 #1 基础倍率 + #3 每层提高：按 4.6 说明「每层使此伤害倍率提高 #3%」取加算（倍率 + 每层百分点），
    // 1 层即说明里的「等同于 #1% 攻击力的风属性持续伤害」。
    const arcanaMult=(u,n)=>u.kit.params.Talent[0]+u.kit.params.Talent[2]*Math.max(0,n-1);
    // 奥迹既是永久 DoT（原始脚本 MAvatar_BlackSwan_00_DOT 无 LifeTime），层数记录在同 id 的 buff 上。
    function syncArcana(b,u,to){
      const n=arcanaStacks(to),d=arcanaDot(to);
      if(!n||!d)return;
      d.name=ARCANA;d.stacks=n;d.terms=[{scaling:'atk',multiplier:arcanaMult(u,n)}];
    }
    // 施加 / 叠加奥迹：走共享 dot() 结算基础概率 × 效果命中 / 效果抵抗；成功后按上限 50 叠层。
    // 返回 null 表示本次被抵抗，否则返回新的层数。
    function addArcana(b,u,to,layers,chance){
      if(!live(to)||to.side===u.side)return null;
      const cur=arcanaStacks(to);
      const d=dot(b,u,to,{name:ARCANA,element:'Wind',terms:[{scaling:'atk',multiplier:arcanaMult(u,Math.max(1,cur))}],
        chance,duration:null,stacks:Math.max(1,cur),extra:{arcana:true,snapshotAtk:true}});
      if(!d)return null;
      let add=layers;
      // E6：每当黑天鹅使敌方目标陷入【奥迹】时，50% 固定概率额外 +1 层。
      if(rank(u,6)&&b.random()<rank(u,6,0))add+=rank(u,6,2);
      const n=Math.min(u.kit.params.Talent[7],cur+add);
      buff(b,u,to,ARCANA,'marker',0,null,{id:u.id+':arcana',tag:'blackSwanArcana',debuff:true,stacks:n});
      syncArcana(b,u,to);
      return n;
    }
    const setStacks=(b,u,to,n)=>buff(b,u,to,ARCANA,'marker',0,null,{id:u.id+':arcana',tag:'blackSwanArcana',debuff:true,stacks:n});
    // 持续伤害状态（风化 / 裂伤 / 灼烧 / 触电）→ 元素；【揭露】下的奥迹视为同时具有这四种状态。
    // 原始脚本用 STAT_DOT_Poison/Bleed/Burn/Electric 四个行为标记判定，奥迹本身只是 STAT_DOT，
    // 因此这里必须把带 arcana 标记的奥迹排除（它的元素也是 Wind，但不是风化）。
    const dotStates=to=>{
      const s=new Set();
      for(const d of to.dots){
        if(d.arcana)continue;
        if(d.element==='Wind')s.add('Wind');else if(d.element==='Physical')s.add('Physical');
        else if(d.element==='Fire')s.add('Fire');else if(d.element==='Thunder')s.add('Thunder');
      }
      if(to.buffs.some(e=>e.tag==='blackSwanReveal')&&arcanaStacks(to)>0)for(const el of FOUR)s.add(el);
      return s;
    };
    // 相邻目标：与引擎扩散结算同一口径（按 b.units 顺序取前后活着的敌人）。
    const adjacentOf=(b,u,to)=>{
      const pool=b.units.filter(t=>t.side!==u.side),at=pool.findIndex(t=>t.id===to.id);
      return [pool[at-1],pool[at+1]].filter(t=>t&&live(t));
    };
    return {
      shouldUseSkill(b,u){const main=enemies(b,u).find(t=>t.id===u.actions.skill?.targetId)??enemies(b,u)[0];
        return !!main&&[main,...adjacentOf(b,u,main)].some(t=>!t.buffs.some(e=>
          e.source===u.id&&e.name==='失坠 · 防御降低'&&(e.remaining??Infinity)>1));},
      // 秘技「取此真相，弃舍表征」：对每个敌人以 Maze[0]=1.5（必定成功）开始连锁叠层，
      // 每次成功后基础概率变为上一次的 Maze[1]=50%，直到失败。
      entry(b,u){
        const P=u.kit.params;
        for(const to of enemies(b,u)){
          let chance=P.Maze[0];
          while(chance>0){
            if(addArcana(b,u,to,1,chance)===null)break;
            chance*=P.Maze[1];
          }
        }
      },
      // 行迹「杯底端倪」(point07)：敌方进入战斗时 65% 基础概率陷入 1 层【奥迹】。
      waveStart(b,u){
        if(!trace(u,2))return;
        for(const to of enemies(b,u))if(arcanaStacks(to)===0)addArcana(b,u,to,1,trace(u,2)[0]);
      },
      // 终结技：使敌方全体陷入【揭露】(Ultra[1]=2 回合)；E4 使其效果抵抗降低 10%，
      // 并刷新「每回合回能 8 点」与「奥迹不重置」的触发次数（Ultra[3]=1）。
      before(b,u,actor,key,kind,a,selected){
        if(actor!==u||key!=='ultimate')return;
        const P=u.kit.params;
        for(const to of selected){
          if(!live(to))continue;
          buff(b,u,to,'揭露','marker',0,P.Ultra[1],{id:u.id+':reveal',tag:'blackSwanReveal',debuff:true});
          if(rank(u,4))buff(b,u,to,'黑天鹅 E4 · 效果抵抗降低','effectRes',-rank(u,4,0),P.Ultra[1],{id:u.id+':reveal-ehr',tag:'blackSwanE4',debuff:true});
        }
        resource(b,u,'揭露回能已触发',0);
        resource(b,u,'揭露不重置已用',0);
      },
      after(b,u,actor,key,kind,a,selected,hitTargets){
        if(actor!==u||!hitTargets.length)return;
        const P=u.kit.params,alive=hitTargets.filter(live);
        // 普攻：0.65 基础概率叠 1 层；目标每处于 1 种持续伤害状态，再各 0.65 基础概率叠 1 层。
        if(key==='basic')for(const to of alive){
          addArcana(b,u,to,1,P.Normal[1]);
          const st=dotStates(to);
          for(const el of FOUR)if(st.has(el))addArcana(b,u,to,1,P.Normal[2]);
        }
        if(key==='skill'){
          for(const to of alive){
            addArcana(b,u,to,1,P.BPSkill[1]);
            const c=P.BPSkill[2]*(1+(combatPanel(u).effectHit??0))*(1-(combatPanel(to).effectRes??0));
            if(c<1&&b.random()>=c)record(b,'resist',to,{name:'失坠 · 防御降低被抵抗'});
            else buff(b,u,to,'失坠 · 防御降低','defShred',P.BPSkill[3],P.BPSkill[4],{debuff:true});
          }
          // 行迹「脏中躁动」(point06)：战技攻击处于 4 种持续伤害状态的指定敌方单体后，各 65% 再叠 1 层。
          const main=selected[0];
          if(trace(u,1)&&main&&live(main)){
            const st=dotStates(main);
            for(const el of FOUR)if(st.has(el))addArcana(b,u,main,1,trace(u,1)[0]);
          }
        }
      },
      // 队友攻击敌方目标时（E6）：65% 基础概率使目标陷入 1 层【奥迹】。
      afterHit(b,u,actor,to,a,kind){
        if(!rank(u,6)||actor===u||actor.side!==u.side||to.side===u.side||!live(to))return;
        if(kind==='dot')return;
        addArcana(b,u,to,1,rank(u,6,1));
      },
      // 行迹「杯底端倪」第二段：我方单次攻击内每受到 1 次持续伤害，65% 基础概率叠 1 层，单次攻击最多 3 层。
      afterDamage(b,u,from,to,kind){
        // 行迹「杯底端倪」第二段：我方单次攻击内每受到 1 次持续伤害，65% 基础概率叠 1 层，单次攻击最多 3 层。
        // 击破持续伤害（kind='break_dot'）同样计入「受到1次持续伤害」。
        if(!['dot','break_dot'].includes(kind)||to.side===u.side||!trace(u,2)||!b.activeAction)return;
        const seq=b.activeAction.sequence;
        if(u.resources['行迹触发攻击']!==seq){resource(b,u,'行迹触发攻击',seq);resource(b,u,'行迹触发次数',0);}
        const used=u.resources['行迹触发次数']??0;
        if(used>=trace(u,2)[1])return;
        resource(b,u,'行迹触发次数',used+1);
        addArcana(b,u,to,1,trace(u,2)[0]);
      },
      // 敌方目标回合开始的奥迹结算：
      //   引擎已按同步后的快照结算了主目标奥迹 DoT（含 ≥7 层的无视防御，见 modifiers）；
      //   这里补：≥3 层的相邻 180% 风 DoT 与相邻叠层、随后重置为 1 层（【揭露】期间最多 1 次不重置）。
      //   注意：行迹「杯底端倪」的「每受到 1 次持续伤害」限定在「我方单次攻击内」，由 afterDamage
      //   结算；敌方自己回合开始的 DoT tick 不属于该窗口，不能在这里补叠层。
      turnStart(b,u,actor){
        if(actor.side===u.side)return;
        const P=u.kit.params,to=actor;
        if(rank(u,4)&&to.buffs.some(e=>e.tag==='blackSwanReveal')&&!(u.resources['揭露回能已触发']??0)){
          resource(b,u,'揭露回能已触发',1);energy(b,u,rank(u,4,1));
        }
        const atTick=arcanaStacks(to);
        if(atTick>=P.Talent[3]){
          const ign=atTick>=P.Talent[5];
          for(const adj of adjacentOf(b,u,to)){
            damageTo(b,u,adj,{name:ARCANA+' · 相邻持续伤害',type:'Additional',element:'Wind',
              terms:[{scaling:'atk',multiplier:P.Talent[4]}],toughness:0,bsIgnoreDef:ign},1,'primary','dot');
            addArcana(b,u,adj,1,P.Talent[1]);
          }
        }
        const rev=to.buffs.some(e=>e.tag==='blackSwanReveal'),used=u.resources['揭露不重置已用']??0;
        const keep=rev&&atTick>0&&used<P.Ultra[3];
        if(keep)resource(b,u,'揭露不重置已用',used+1);
        else if(arcanaStacks(to)>0)setStacks(b,u,to,1);
        syncArcana(b,u,to);
      },
      // E2：奥迹状态下的敌方目标被消灭时，100% 基础概率使相邻目标陷入 6 层【奥迹】；
      // E4：被消灭时使黑天鹅恢复 8 点能量（每个【揭露】期间最多 1 次）。
      death(b,u,from,to){
        if(to.side===u.side)return;
        if(rank(u,4)&&to.buffs.some(e=>e.tag==='blackSwanReveal')&&!(u.resources['揭露回能已触发']??0)){
          resource(b,u,'揭露回能已触发',1);energy(b,u,rank(u,4,1));
        }
        if(!rank(u,2)||arcanaStacks(to)<=0)return;
        for(const adj of adjacentOf(b,u,to))addArcana(b,u,adj,rank(u,2,1),rank(u,2,0));
      },
      modifiers(b,u,actor,to,a,kind){
        const out={};
        // 行迹「烛影朕兆」(point08)：自身造成的伤害提高 = 效果命中 × 60%，上限 72%。
        if(actor===u&&trace(u,3))out.dmgBoost=(out.dmgBoost??0)+Math.min(trace(u,3)[1],(combatPanel(u).effectHit??0)*trace(u,3)[0]);
        if(to.side===u.side||actor.side!==u.side)return out;
        // E1：处于风化 / 裂伤 / 灼烧 / 触电的目标对应风 / 物理 / 火 / 雷抗性降低 25%。
        if(rank(u,1)&&dotStates(to).has(a.element))out.resPen=(out.resPen??0)+rank(u,1);
        // 【揭露】：敌方目标自身回合内受到的伤害提高 25%。
        if(b.turnActor===to.id&&to.buffs.some(e=>e.tag==='blackSwanReveal'))out.vuln=(out.vuln??0)+u.kit.params.Ultra[2];
        // 天赋：≥7 层时本次奥迹持续伤害及其相邻伤害无视 20% 防御。
        if(kind==='dot'&&((a.arcana&&arcanaStacks(to)>=u.kit.params.Talent[5])||a.bsIgnoreDef))
          out.defIgnore=(out.defIgnore??0)+u.kit.params.Talent[6];
        return out;
      },
    };
  },

  // ───────────────────────── 1308 黄泉（雷 · 虚无） ─────────────────────────
  1308:function(api){
    const {live,allies,enemies,rank,trace,buff,stacks,resource,energy,allResDown,damageTo,combatPanel,record}=api;
    // 引擎把 u.energy 作为【残梦】（4.6 数据 energyMax=9=Talent[0] 的激活上限），
    // 因此所有残梦增减都用 energy(..., fixed=true)（残梦不吃回能效率）。
    const jzc=to=>to.buffs.find(e=>e.tag==='acheronJzc')?.stacks??0;
    // Avatar_Acheron_00_Skill02_Phase02 用 `Skill02_FlowerTotalCount < 9` 才附加【集真赤】
    // （同一动态值 1483210409 也用作残梦上限比较，即 Talent[0]=9），故【集真赤】每目标上限 9 层。
    const JZC_MAX=9;
    const setJzc=(b,u,to,n)=>{
      if(n<=0){to.buffs=to.buffs.filter(e=>e.tag!=='acheronJzc');return;}
      buff(b,u,to,'集真赤','marker',0,null,{id:u.id+':jzc',tag:'acheronJzc',debuff:true,stacks:Math.min(JZC_MAX,n)});
    };
    function addJzc(b,u,to,n){
      if(!live(to)||to.side===u.side||n<=0)return 0;
      const cur=jzc(to),add=Math.min(n,Math.max(0,JZC_MAX-cur));
      if(!add)return 0;
      setJzc(b,u,to,cur+add);return add;
    }
    // 获得残梦；达到上限时的溢出点转化为【四相断我】（行迹「赤鬼」上限 3 层）。
    function charge(b,u,n){
      if(!n)return;
      if(n>0&&trace(u,1)){
        const over=Math.max(0,u.energy+n-u.energyMax),cap=trace(u,1)[1],cur=u.resources['四相断我']??0;
        if(over>0&&cur<cap)resource(b,u,'四相断我',Math.min(cap,cur+over));
      }
      energy(b,u,n,true);
    }
    // 行迹「奈落」(point07)：队伍中除黄泉外的虚无命途角色 1/2 名时伤害为原伤害的 115%/160%；
    // E2 使最高档需求角色数 -1（E2 的参数为空数组，只能按星魂等级判断）。
    function nihilityRatio(b,u){
      const t=trace(u,2);
      if(!t)return 1;
      const n=allies(b,u).filter(x=>x!==u&&(x.path==='虚无'||x.path==='Nihility')).length;
      const need2=2-(u.kit.eidolon>=2?1:0),need1=1-(u.kit.eidolon>=2?1:0);
      if(n>=need2)return t[1];
      if(n>=need1)return t[0];
      return 1;
    }
    // 天赋「任意单位施放技能期间使敌方目标陷入负面效果」用「负面效果集合差」监听：
    // after 的调用顺序把行动者排在最前，因此轮到黄泉的 after 时，行动者模块已挂好负面效果。
    // 计数用 id + 层数（原始脚本是 OnModifierOnStack：刷新同 id 负面效果同样算「陷入」一次）。
    const seen=(b,u)=>u.acheronSeen??(u.acheronSeen=new Map());
    const sig=t=>{
      const m=new Map();
      for(const e of [...t.buffs.filter(x=>x.debuff),...t.dots])m.set(e.id,(m.get(e.id)??0)+(e.stacks??1));
      return m;
    };
    function refreshSeen(b,u){
      const m=seen(b,u);m.clear();
      for(const t of b.units)if(t.side!==u.side)m.set(t.id,sig(t));
    }
    function newDebuffed(b,u){
      const m=seen(b,u),fresh=[];
      for(const t of b.units){
        if(t.side===u.side)continue;
        const now=sig(t),old=m.get(t.id)??new Map();
        for(const [id,v]of now)if((old.get(id)??0)<v){fresh.push(t);break;}
        m.set(t.id,now);
      }
      return fresh;
    }
    return {
      start(b,u){
        const P=u.kit.params;
        energy(b,u,-u.energy,true);            // 残梦从 0 开始（引擎默认 energyMax/2 不是残梦）
        resource(b,u,'四相断我',0);
        // 行迹「赤鬼」：战斗开始时立即获得 5 点残梦，并为随机 1 名敌方附上 5 层【集真赤】。
        if(trace(u,1)){
          charge(b,u,trace(u,1)[0]);
          const pool=enemies(b,u),to=pool[Math.floor(b.random()*pool.length)];
          if(to)addJzc(b,u,to,trace(u,1)[0]);
        }
        refreshSeen(b,u);
      },
      // 秘技「四相断我」：立即攻击敌方全体（Maze[0]=200% 雷伤、削韧 60、无视弱点），
      // 每个波次开始时获得 1 层【四相断我】。
      entry(b,u){
        const P=u.kit.params;
        for(const to of enemies(b,u)){
          buff(b,u,to,'四相断我 · 无视弱点','marker',0,1,{id:u.id+':maze-weakness',weakness:'Thunder'});
          damageTo(b,u,to,{name:'四相断我',type:'Maze',element:'Thunder',terms:atk(P.Maze[0]),toughness:mazeStance(u.characterId)},1,'primary','technique');
          to.buffs=to.buffs.filter(e=>e.id!==u.id+':maze-weakness');
        }
      },
      waveStart(b,u){
        if(u.kit.technique&&trace(u,1))resource(b,u,'四相断我',Math.min(trace(u,1)[1],(u.resources['四相断我']??0)+1));
        // E4：敌方目标进入战斗时陷入终结技伤害易伤（永久）。
        if(rank(u,4))for(const to of enemies(b,u))if(!to.buffs.some(e=>e.id===u.id+':e4'))
          buff(b,u,to,'黄泉 E4 · 终结技易伤','marker',0,null,{id:u.id+':e4',tag:'acheronE4',debuff:true});
        refreshSeen(b,u);
      },
      // E2：自身回合开始时获得 1 点残梦，并为【集真赤】最多的敌方附上 1 层【集真赤】
      // （E2 参数为空数组，按星魂等级判断）。
      turnStart(b,u,actor){
        if(actor!==u)return;
        if(u.kit.eidolon>=2){
          charge(b,u,1);
          const pool=enemies(b,u);
          if(pool.length)addJzc(b,u,pool.reduce((a,c)=>jzc(c)>jzc(a)?c:a),1);
        }
        refreshSeen(b,u);
      },
      prepare(b,u,key,kind,a){
        if(kind==='copy'||kind==='technique')return a;
        const ratio=nihilityRatio(b,u);
        let out=a;
        if(ratio!==1&&['basic','skill','ultimate'].includes(key)){
          const scale=terms=>(terms??[]).map(t=>({...t,multiplier:t.multiplier*ratio}));
          out={...out,terms:scale(out.terms)};
          if(out.bounceTerms)out.bounceTerms=scale(out.bounceTerms);
        }
        // E6：普攻 / 战技造成的伤害同时视为终结技伤害（引擎只支持单一 type，取终结技口径）。
        if(rank(u,6)&&['basic','skill'].includes(key))out={...out,type:'Ultra',regardAsUltra:true};
        return out;
      },
      before(b,u,actor,key,kind,a,selected){
        if(actor!==u)return;
        const P=u.kit.params;
        // E6：普攻 / 战技无视弱点属性削减敌方韧性。
        if(rank(u,6)&&['basic','skill'].includes(key)&&kind!=='copy')for(const to of selected)if(live(to))
          buff(b,u,to,'黄泉 E6 · 无视弱点','marker',0,null,{id:u.id+':e6-weakness',weakness:'Thunder'});
        if(key!=='ultimate')return;
        b.acheronUlt=true;
        const ratio=nihilityRatio(b,u);
        // 天赋：终结技期间敌方全体全属性抗性降低 Talent[1]=20%，并无视弱点属性削减韧性，持续至终结技结束。
        for(const to of enemies(b,u)){
          allResDown(b,u,to,P.Talent[1],null);
          buff(b,u,to,'残梦尽染 · 无视弱点','marker',0,null,{id:u.id+':ult-weakness',weakness:'Thunder'});
        }
        // 依次发动 3 次【啼泽雨斩】：单体 Ultra[0]=0.24；消去目标最多 3 层【集真赤】，
        // 消去时立即对敌方全体造成 Ultra[1]×(1+消去层数) 的雷伤（上限 Ultra[4]=0.6）；
        // 行迹「雷心」：击中持有【集真赤】的目标时自身增伤 +30%（最多 3 层，3 回合）。
        const main=selected[0];
        for(let i=0;i<3;i++){
          if(!main||!live(main))break;
          const before=jzc(main);
          damageTo(b,u,main,{name:'啼泽雨斩 · 单体',type:'Ultra',element:'Thunder',
            terms:atk(P.Ultra[0]*ratio),toughness:15},1,'primary','direct');
          if(trace(u,3)&&before>0&&live(main))
            stacks(b,u,u,'雷心','dmgBoost',trace(u,3)[0],trace(u,3)[1],trace(u,3)[2],{id:u.id+':leixin'});
          const n=Math.min(3,before);
          if(n>0&&live(main)){
            setJzc(b,u,main,before-n);
            const m=Math.min(P.Ultra[4],P.Ultra[1]*(1+n))*ratio;
            for(const to of enemies(b,u))damageTo(b,u,to,{name:'啼泽雨斩 · 全体',type:'Ultra',element:'Thunder',
              terms:atk(m),toughness:15},1,'primary','direct');
          }
        }
      },
      after(b,u,actor,key,kind,a,selected,hitTargets){
        const P=u.kit.params;
        // 战技：获得 BPSkill[2]=1 点残梦并为指定敌方单体附上 1 层【集真赤】（先于天赋监听结算，
        // 因此这次集真赤同样会触发天赋的 +1 点残梦 / +1 层集真赤，与原始脚本 OnListenDeBuffAdd 一致）。
        if(actor===u&&key==='skill'&&kind!=='copy'){
          charge(b,u,P.BPSkill[2]);
          const to=selected[0];if(to&&live(to))addJzc(b,u,to,1);
        }
        // 天赋：任意单位施放技能期间使敌方目标陷入负面效果 → 黄泉 +1 残梦，并为其中【集真赤】最多的敌方 +1 层
        //（每次施放技能最多触发 1 次；终结技期间无法为敌方附上【集真赤】）。
        if(kind!=='technique'){
          const fresh=newDebuffed(b,u);
          if(fresh.length&&!b.acheronUlt){
            const to=fresh.length>1?fresh.reduce((x,c)=>jzc(c)>jzc(x)?c:x):fresh[0];
            charge(b,u,1);addJzc(b,u,to,1);
          }
        }
        if(actor!==u)return;
        if(rank(u,6)&&['basic','skill'].includes(key))
          for(const to of b.units)to.buffs=to.buffs.filter(e=>e.id!==u.id+':e6-weakness');
        if(key!=='ultimate')return;
        b.acheronUlt=false;
        // 终结技结束：移除「全属性抗性降低」与「无视弱点」标记。
        for(const to of b.units)to.buffs=to.buffs.filter(e=>!e.id.startsWith(u.id+':resdown:')&&e.id!==u.id+':ult-weakness');
        // 【黄泉返渡】移除所有【集真赤】。
        for(const to of b.units)if(to.side!==u.side)to.buffs=to.buffs.filter(e=>e.tag!=='acheronJzc');
        // 行迹「雷心」：发动【黄泉返渡】时额外造成 6 次伤害，每次对随机敌方单体造成 25% 攻击力的雷伤（视为终结技伤害）。
        if(trace(u,3)){
          const ratio=nihilityRatio(b,u),pool=enemies(b,u);
          for(let i=0;i<trace(u,3)[3];i++){
            if(!pool.length)break;
            const to=pool[Math.floor(b.random()*pool.length)];
            damageTo(b,u,to,{name:'雷心 · 额外伤害',type:'Ultra',element:'Thunder',
              terms:atk(trace(u,3)[4]*ratio),toughness:0},1,'primary','additional');
          }
        }
        // 【四相断我】：施放终结技后每层使黄泉获得 1 点残梦并为随机敌方单体附上 1 层【集真赤】。
        const n=u.resources['四相断我']??0;
        for(let i=0;i<n;i++){
          charge(b,u,1);
          const pool=enemies(b,u);
          if(pool.length)addJzc(b,u,pool[Math.floor(b.random()*pool.length)],1);
        }
        resource(b,u,'四相断我',0);
      },
      modifiers(b,u,actor,to,a,kind){
        const out={};
        if(actor!==u||to.side===u.side)return out;
        // E1：对处于负面效果的敌方目标造成伤害时暴击率提高 18%。
        if(rank(u,1)&&(to.dots.length>0||to.buffs.some(e=>e.debuff)))out.critRate=(out.critRate??0)+rank(u,1);
        // E4：敌方目标进入战斗时陷入终结技伤害易伤 +8%。
        if(rank(u,4)&&a.type==='Ultra'&&to.buffs.some(e=>e.tag==='acheronE4'))out.vuln=(out.vuln??0)+rank(u,4,0);
        // E6：黄泉造成的终结技伤害全属性抗性穿透 +20%（普攻 / 战技经 prepare 视为终结技伤害）。
        if(rank(u,6)&&a.type==='Ultra')out.resPen=(out.resPen??0)+rank(u,6);
        return out;
      },
    };
  },

  // ───────────────────────── 1006 银狼（量子 · 虚无） ─────────────────────────
  1006:function(api){
    const {live,allies,enemies,rank,trace,buff,resource,energy,allResDown,damageTo,combatPanel,record}=api;
    const chanceOf=(u,to,base)=>base*(1+(combatPanel(u).effectHit??0))*(1-(combatPanel(to).effectRes??0));
    const roll=(b,u,to,base,name)=>{
      const c=chanceOf(u,to,base);
      if(c<1&&b.random()>=c){record(b,'resist',to,{name});return false;}
      return true;
    };
    const debuffCount=to=>to.buffs.filter(e=>e.debuff).length+to.dots.length;
    // 天赋【缺陷】：攻降 Talent[0]、防降 Talent[1]、速降 Talent[2]，持续 Talent[3] 回合（行迹 +1）。
    // 原始脚本 Avatar_Silwolf_00_PassiveSkill_RandomBug 优先在「目标尚未持有的缺陷」中随机，
    // 三种齐全时再在三种中随机。
    function defectPool(u,to,T){
      const bugs=[
        {i:1,key:'atkPct',value:-T[0],name:'缺陷 · 攻击力降低'},
        {i:2,key:'defShred',value:T[1],name:'缺陷 · 防御力降低'},
        {i:3,key:'speedPct',value:-T[2],name:'缺陷 · 速度降低'},
      ];
      const absent=bugs.filter(x=>!to.buffs.some(e=>e.id===u.id+':bug'+x.i));
      return absent.length?absent:bugs;
    }
    function implantDefect(b,u,to){
      const T=u.kit.params.Talent,dur=T[4]+(trace(u,1)?trace(u,1)[0]:0);
      const pool=defectPool(u,to,T),pick=pool[Math.floor(b.random()*pool.length)];
      buff(b,u,to,pick.name,pick.key,pick.value,dur,{id:u.id+':bug'+pick.i,tag:'silverwolfBug'+pick.i,debuff:true});
      return pick;
    }
    // 战技植入弱点：从「场上我方目标持有属性」随机 1 个；单个敌方目标只保留银狼最新植入的弱点。
    // 若该元素是敌方原有弱点则不降低对应抗性（BPSkill[3]=20%，持续 BPSkill[2]=2 回合 + 行迹「注入」+1）。
    function implantWeakness(b,u,to){
      const P=u.kit.params;
      if(!roll(b,u,to,P.BPSkill[1],'弱点添加被抵抗'))return null;
      const pool=[...new Set(allies(b,u).map(a=>a.element))];
      const element=pool[Math.floor(b.random()*pool.length)]??u.element;
      to.buffs=to.buffs.filter(e=>e.tag!=='silverwolfWeakness'&&e.tag!=='silverwolfWeakRes');
      const dur=P.BPSkill[2]+(trace(u,2)?trace(u,2)[0]:0),innate=(to.weaknesses??[]).includes(element);
      buff(b,u,to,'银狼 · 植入弱点','marker',0,dur,{id:u.id+':sw-weak',tag:'silverwolfWeakness',weakness:element,element});
      if(!innate)buff(b,u,to,'银狼 · 弱点抗性降低','resPen',P.BPSkill[3],dur,{id:u.id+':sw-weakres',tag:'silverwolfWeakRes',debuff:true,element,resReduction:true});
      record(b,'mechanic',u,{name:'植入弱点',target:to.id,element,innate});
      return element;
    }
    return {
      shouldUseSkill(b,u){const to=enemies(b,u).find(t=>t.id===u.actions.skill?.targetId)??enemies(b,u)[0];
        return !!to&&!to.buffs.some(e=>e.source===u.id&&e.tag==='silverwolfWeakness'&&(e.remaining??Infinity)>1);},
      // 秘技「强制结束进程」：对敌方全体造成 Maze[0]=0.8 倍量子伤害（削韧 60）并无视弱点削韧。
      entry(b,u){
        const P=u.kit.params;
        for(const to of enemies(b,u)){
          buff(b,u,to,'强制结束进程 · 无视弱点','marker',0,1,{id:u.id+':maze-weakness',weakness:'Quantum'});
          damageTo(b,u,to,{name:'强制结束进程',type:'Maze',element:'Quantum',terms:atk(P.Maze[0]),toughness:mazeStance(u.characterId)},1,'primary','technique');
          to.buffs=to.buffs.filter(e=>e.id!==u.id+':maze-weakness');
        }
      },
      // E2：敌方目标进入战斗时效果抵抗降低 20%。
      waveStart(b,u){
        if(!rank(u,2))return;
        for(const to of enemies(b,u))if(!to.buffs.some(e=>e.id===u.id+':sw-e2'))
          buff(b,u,to,'银狼 E2 · 效果抵抗降低','effectRes',-rank(u,2),null,{id:u.id+':sw-e2',debuff:true});
      },
      before(b,u,actor,key,kind,a,selected){
        if(actor!==u)return;
        const P=u.kit.params;
        if(key==='skill'){
          const to=selected[0];if(!to||!live(to))return;
          // 行迹「旁注」(point08)：使用战技时目标负面效果 ≥3 个 → 全属性抗性降低额外 +3%。
          const extra=(trace(u,3)&&debuffCount(to)>=trace(u,3)[0])?trace(u,3)[1]:0;
          if(roll(b,u,to,P.BPSkill[4],'全属性抗性降低被抵抗'))allResDown(b,u,to,P.BPSkill[5]+extra,P.BPSkill[6]);
          implantWeakness(b,u,to);
        }
        if(key==='ultimate'){
          for(const to of selected)if(live(to)&&roll(b,u,to,P.Ultra[1],'减防被抵抗'))
            buff(b,u,to,'账号已封禁 · 防御降低','defShred',P.Ultra[2],P.Ultra[3],{debuff:true});
        }
      },
      after(b,u,actor,key,kind,a,selected,hitTargets){
        if(actor!==u||!hitTargets.length||!['basic','skill','ultimate'].includes(key))return;
        const P=u.kit.params;
        // 天赋：每次施放攻击后 72% 基础概率给受到攻击的敌方目标植入 1 个随机【缺陷】。
        for(const to of hitTargets.filter(live))if(roll(b,u,to,P.Talent[3],'缺陷被抵抗'))implantDefect(b,u,to);
        const to=hitTargets[0];
        if(key==='ultimate'&&live(to)){
          const n=debuffCount(to);
          // E1：目标每有 1 个负面效果银狼恢复 7 点能量，每次终结技最多生效 5 次。
          if(rank(u,1))energy(b,u,rank(u,1,0)*Math.min(rank(u,1,1),n));
          // E4：目标每有 1 个负面效果额外造成 20% 攻击力量子附加伤害，最多触发 5 次。
          if(rank(u,4))for(let i=0;i<Math.min(rank(u,4,1),n);i++)
            damageTo(b,u,to,{name:'银狼 E4 · 附加伤害',type:'Additional',element:'Quantum',terms:atk(rank(u,4,0)),toughness:0},1,'primary','additional');
        }
      },
      // 行迹「生成」(point06)：敌方目标弱点被击破时 65% 基础概率植入 1 个随机【缺陷】。
      afterDamage(b,u,from,to,kind){
        if(kind!=='break'||to.side===u.side||!trace(u,1))return;
        if(roll(b,u,to,trace(u,1)[1],'缺陷被抵抗'))implantDefect(b,u,to);
      },
      modifiers(b,u,actor,to,a,kind){
        const out={};
        if(actor!==u||to.side===u.side)return out;
        // E6：敌方目标每有 1 个负面效果，银狼对其造成的伤害提高 20%，最多提高 100%。
        if(rank(u,6))out.dmgBoost=(out.dmgBoost??0)+Math.min(rank(u,6,1),rank(u,6,0)*debuffCount(to));
        return out;
      },
    };
  },
};

// ROSTER_DATA 已在上方按角色 id 注入；handlers 里只用到秘技削韧。
const actions={
  // 段数取自原始脚本：Skill01_Phase02 = 2 段（各 0.5，SPHitRatio 0.5）；Skill02_Phase02 = 3 段主段
  //（0.2/0.3/0.5）+ 1 段相邻（0.6）；Skill03_Phase02 = 1 段；PassiveAtk_Ability = 6 段（0.15×5 + 0.25）。
  1005:(p,d,{eidolon=0}={})=>{
    void eidolon;
    return {
      basic:basic(p,d,{terms:atk(p.Normal[0]),hitShares:[.5,.5]}),
      skill:skill(p,d,{target:'blast',hitShares:[.2,.3,.5],toughness:60,adjacentToughness:30,
        terms:[...atk(p.BPSkill[0]),{...atk(p.BPSkill[2])[0],target:'adjacent'}]}),
      ultimate:ultimate(p,d,{target:'all',terms:atk(p.Ultra[0]),toughness:60}),
      followup:talentAction(p,d,{terms:atk(p.Talent[0]),hitShares:[.15,.15,.15,.15,.15,.25],toughness:30,energyGain:list(d,'Talent').spBase}),
    };
  },
  // Skill01_Phase02 = 1 段；Skill02_Phase02 = 主目标 + 相邻各 1 段（同一倍率 BPSkill[0]）；Skill03_Phase02 = 1 段。
  1307:(p,d,{eidolon=0}={})=>{
    void eidolon;
    return {
      basic:basic(p,d,{terms:atk(p.Normal[0])}),
      skill:skill(p,d,{target:'blast',terms:[...atk(p.BPSkill[0]),{...atk(p.BPSkill[0])[0],target:'adjacent'}],toughness:60,adjacentToughness:30}),
      ultimate:ultimate(p,d,{target:'all',terms:atk(p.Ultra[0]),toughness:60}),
    };
  },
  // 黄泉的「能量」即残梦（energyMax=9=Talent[0] 激活上限），三个动作均不回能；
  // Skill02_Phase02 真段数 = 4（主目标 0.1/0.1/0.1/0.7，相邻节点同比例）；
  // Skill34_Phase02【黄泉返渡】= 2 段（0.1/0.9）。
  1308:(p,d,{eidolon=0}={})=>{
    void eidolon;
    return {
      basic:basic(p,d,{terms:atk(p.Normal[0]),energyGain:0}),
      skill:skill(p,d,{target:'blast',hitShares:[.1,.1,.1,.7],toughness:60,adjacentToughness:30,energyGain:0,
        terms:[...atk(p.BPSkill[0]),{...atk(p.BPSkill[1])[0],target:'adjacent'}]}),
      ultimate:ultimate(p,d,{target:'all',terms:atk(p.Ultra[2]),hitShares:[.1,.9],toughness:15,energyGain:0}),
    };
  },
  // Skill01_Phase02 = 3 段（0.25/0.25/0.5）；Skill02_Phase02 / Skill03_Phase02 = 1 段。
  1006:(p,d,{eidolon=0}={})=>{
    void eidolon;
    return {
      basic:basic(p,d,{terms:atk(p.Normal[0]),hitShares:[.25,.25,.5]}),
      skill:skill(p,d,{terms:atk(p.BPSkill[0]),toughness:60}),
      ultimate:ultimate(p,d,{terms:atk(p.Ultra[0]),toughness:90}),
    };
  },
};

export {factories,actions};
