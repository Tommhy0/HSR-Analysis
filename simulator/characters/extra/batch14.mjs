// DeepSeek 独立角色批次 14：1302 银枝 / 1314 翡翠 / 1401 大黑塔 / 1405 那刻夏 / 1510 姬子•启行 / 1508 远坂凛
//
// 数据依据（固定 4.6，提交 312b4597691e0a29cf9828a15b592757dba86949）：
//  · `_data_cache/hsr_core.json`（按 charId 过滤）：技能 desc 的 `#n` 顺序与 `params[等级].param_list`、
//    行迹（type=3）与星魂 1~6。
//  · `simulator/roster-data.mjs` 的 ROSTER_DATA：分等级 param_list / stance（削韧）/ spBase（回能）/
//    bpNeed（战技点）/ hits（原始脚本 AttackData 节点的命中分配）。
//  · `_data_cache/strict_research/` 原始脚本（真段数 / TargetAlias / HitSplitRatio / SPHitRatio）：
//      Avatar_Argenti_00_Ability.json   （Skill01/02/03 各 1 段；Skill31「驻我华庭」= AllEnemy 1 段
//                                        SPHitRatio 1 + 6 次 AllEnemy ByRandom 单体；SkillMazeInLevel）
//      Avatar_Jade_00_Ability.json      （Skill01 主 1 段 SPHit 1 + AbilityTargetAdjoinEntity 相邻 1 段；
//                                        Passive_Phase02_01 = AllEnemy 5 段 0.15/0.15/0.15/0.15/0.4；
//                                        Passive_Phase02_02 = 强化版 0.1/0.1/0.1/0.1/0.6）
//      Avatar_TheHerta_00_Ability.json  （Skill01 1 段；Skill21 = 3 次「目标+相邻」模板 + 最后 AllEnemy；
//                                        Skill03 1 段；SkillMazeInRougeLevel 真实伤害）
//      Avatar_Anaxa_00_Ability.json     （Skill01/02/03 各 1 段；Skill02 的 4 次弹射来自循环任务）
//      Avatar_HimekoNova_00_Ability.json（Skill01 1 段；Skill31 1 段；SupportSkill_Phase02 助战技 4 段：
//                                        AllEnemy + 随机单体 + 姬子专用 AllEnemy + 随机单体）
//      Avatar_TohsakaRin_00_Ability.json（Skill01/02 1 段；Skill21 = 2×AllEnemy 0.25 + ParamEntity；
//                                        Skill03 主 1 段 + 其他 1 段；Insert_Phase02 = 5 段 0.2）
//
// 关键参数索引（10 级口径，普攻 6 级）：
//   1302 银枝  普攻[1.4]；战技[1.5]；终结[1.92, 90]；天赋[3 回能, 0.0325 暴击, 10 上限]；
//              秘技[10 秒, 0.8 伤害, 15 回能]；强化终结 130214[3.36, 6 次, 1.14, 180 能量]
//              行迹1[1 层] 行迹2[2 回能] 行迹3[0.5, 0.15]；E1[0.04] E2[3,0.4,1] E4[2,2] E6[0.3]
//   1314 翡翠  普攻[1.26, 0.42 相邻]；战技[30 速度, 0.02 生命, 0.3 附加, 3 回合]；
//              终结[1 强化倍率, 2 次数, 3 伤害]；天赋[0.03 暴伤, 50 上限, 8 充能, 5 当品, 1.5 倍率]；
//              秘技[10 秒, 0.5 伤害, 15 当品]；行迹1[3,1] 行迹2[0.5] 行迹3[0.005]；
//              E1[0.32,1,2] E2[15,0.18] E4[0.12,3] E6[0.2]
//   1401 大黑塔 普攻[1.4]；战技[0.875, 1 层解读]；终结[2.5, 2, 1, 1.0 攻击, 3 回合, 4 灵感上限]；
//              天赋[0.1 主, 0.05 其他, 42 解读上限, 1 重置, 42 计数上限, 25 开场层]；
//              强化战技 140109[1.0, 1, 0.5 收尾]；秘技[0.6 攻击, 2 回合]；
//              行迹1[3,0.5] 行迹2[0.8,3,1,2] 行迹3[0.01,99]；
//              E1[0.5,15] E2[0.35] E4[0.12] E6[1.4,2.5,4,0.2]
//   1405 那刻夏 普攻[1.4]；战技[0.875, 4 次弹射, 0.2 每目标增伤]；终结[2]；
//              天赋[0.36 增伤, 3 回合, 5 弱点阈值]；秘技[10 秒, 3 回合弱点]；
//              行迹1[10,30] 行迹2[1.4,0.5] 行迹3[0.04]；E1[0.16,2,1] E2[0.2] E4[0.3,2,2] E6[1.3]
//   1510 姬子  普攻[1.4]；战技[0.25 增伤, 3 回合]；终结[0.4,1,0.25,1,0.375,3,1,3,9.525,3.15]；
//              天赋[1.0 暴伤, 0.25 抗穿, 4 回能]；助战技 151022[2,3,0.3,2.5,4,0.39,4,2]；
//              光束 151008[0.4,1,3]；脉冲 151009[0.25,1,0.375]；终击 151014[3,1]（stance 12）；秘技[30 秒]；
//              行迹1[5] 行迹2[0.5] 行迹3[3,3,0.3]；E1[1,3,1,1] E2[1.3] E4[0.1] E6[0.2,6,0.75,6,1.6]
//   1508 远坂凛 普攻[1.4]；战技[2.25]；终结[7.5,2.5,12,1 战技点,0.25 易伤,3 回合]；
//              天赋[20 开场能量,2 回合,0.875 暴伤,7 战技点阈值,15 能量阈值]；
//              自在远坂流 150805[3.75,4,3,3.75]；强化战技 150809[1.125,3,1.125,2,2,33]；
//              秘技[10 能量]；行迹1[2,1.5,0.15] 行迹2[0.2,3] 行迹3[12]；E1[30] E2[0.3,1.3] E4[2] E6[0.2,24]
//
// 「能量」以外的专属资源（升格 / 充能 / 当品 / 解读 / 谜底 / 灵感 / 源能 / 宝石能量 / 影子宝石 /
// 助战技次数 / 收债人）都以 `resource()` 记录，保证可在战斗日志与 frame.resources 中复核。
import {atk,basic,skill,ultimate,talentAction} from '../actions.mjs';
import {ROSTER_DATA} from '../../roster-data.mjs';

export const IDS=[1302,1314,1401,1405,1510,1508];

const ELEMENTS=['Physical','Fire','Ice','Thunder','Wind','Quantum','Imaginary'];
const list=(d,type)=>Object.values(d.skills).find(s=>s.type===type);
// 秘技（Maze）削韧取自固定 4.6 的 ROSTER_DATA 技能记录。
const mazeStance=id=>list(ROSTER_DATA[id],'Maze')?.stance?.[0]??0;
// 强化技能与基础技能共用等级轨道：用已编译的基础参数值反查等级行，再取目标技能表同等级的 param_list。
const rowFor=(id,refId,targetId,refValue)=>{
  const table=ROSTER_DATA[id].skills?.[String(refId)]?.params??{};
  const key=Object.keys(table).find(k=>Math.abs((table[k].param_list?.[0]??NaN)-refValue)<1e-9);
  return ROSTER_DATA[id].skills?.[String(targetId)]?.params?.[key??'10']?.param_list??[];
};
// 助战技是独立技能表（151022），未录入 ROSTER_DATA 的 5 类技能轨道，故按固定 4.6 满级 15 行取值：
// 151022 等级 15 = [2, 3, 0.3, 2.5, 4, 0.39, 4, 2]（desc #1 AoE 200% / #2 3 次 / #3 30%，
// 姬子本人使用时 #4 AoE 250% / #5 4 次 / #6 39%；#7=4、#8=2 为特殊效果次数）。
const HIMEKO_ASSIST=[2,3,0.3,2.5,4,0.39,4,2];
// 相邻目标：与引擎扩散结算同一口径（按 b.units 顺序取前后活着的敌人）。
const adjacentOf=(b,u,to)=>{
  const pool=b.units.filter(t=>t.side!==u.side),at=pool.findIndex(t=>t.id===to.id);
  return [pool[at-1],pool[at+1]].filter(t=>t&&t.active!==false&&t.hp>1e-8);
};
const isErudition=u=>u.path==='智识'||u.path==='Erudition';
const eruditionCount=(b,u)=>b.units.filter(t=>t.side===u.side&&t.active!==false&&t.hp>1e-8&&isErudition(t)).length;

const factories={
  // ───────────────────────── 1302 银枝（物理 · 智识） ─────────────────────────
  1302:function(api){
    const {live,enemies,rank,trace,buff,resource,energy,damageTo,combatPanel}=api;
    const MAX=u=>u.kit.params.Talent[2]+(rank(u,4)?rank(u,4,1):0);
    const stacksOf=u=>u.resources['升格']??0;
    const setStacks=(b,u,n)=>{
      const m=Math.max(0,Math.min(MAX(u),n));
      resource(b,u,'升格',m);
      buff(b,u,u,'升格','marker',0,null,{id:u.id+':asc',tag:'argentiAsc',stacks:m});
    };
    return {
      start(b,u){setStacks(b,u,rank(u,4)?rank(u,4,0):0);},
      // 秘技「纯粹高洁宣言」：对敌方全体造成 Maze[2]=0.8 倍物理伤害（削韧 60），并恢复 Maze[3]=15 能量。
      entry(b,u){
        const P=u.kit.params;
        for(const to of enemies(b,u))damageTo(b,u,to,{name:'纯粹高洁宣言',type:'Maze',element:'Physical',
          terms:atk(P.Maze[1]),toughness:mazeStance(1302)},1,'primary','technique');
        energy(b,u,P.Maze[2]);
      },
      // 行迹「慷慨」(point07)：敌方目标进入战斗时恢复 2 点能量（逐波次事件含第 1 波）。
      waveStart(b,u){if(trace(u,2))energy(b,u,trace(u,2)[0]);},
      // 行迹「虔诚」(point06)：回合开始时立即获得 1 层【升格】。
      turnStart(b,u,actor){if(actor===u&&trace(u,1))setStacks(b,u,stacksOf(u)+trace(u,1)[0]);},
      // 天赋「崇高的客体」：施放普攻 / 战技 / 终结技时每击中 1 名敌方目标恢复 Talent[0]=3 能量并叠 1 层【升格】。
      after(b,u,actor,key,kind,a,selected,hitTargets){
        if(actor!==u)return;
        const P=u.kit.params;
        if(['basic','skill','ultimate'].includes(key)){
          const n=hitTargets.filter(t=>t.side!==u.side&&live(t)).length;
          if(n){energy(b,u,n*P.Talent[0]);setStacks(b,u,stacksOf(u)+n);}
        }
        // E2：施放终结技时若敌方目标数 ≥3，攻击力提高 40%，持续 1 回合。
        if(key==='ultimate'&&rank(u,2)&&enemies(b,u).length>=rank(u,2,0))
          buff(b,u,u,'银枝 E2 · 攻击提高','atkPct',rank(u,2,1),rank(u,2,2),{id:u.id+':e2'});
      },
      // 强化终结【驻「我」华庭，授予至勋】：能量 ≥ 130214[3]=180 时替换为 3.36 倍 AoE + 6 次 1.14 单体。
      prepare(b,u,key,kind,a){
        if(key!=='ultimate'||kind==='technique'||kind==='copy')return a;
        const E=rowFor(1302,130203,130214,u.kit.params.Ultra[0]);
        return u.energy+1e-9>=E[3]?{...u.actions.enhancedUltimate}:a;
      },
      // 天赋：每层【升格】使暴击率 +Talent[1]=3.25%（E1 额外 +4% 暴伤）。
      panel(b,u,target,out,opts){
        if(u!==target||opts?.excludeConverted)return;
        const n=stacksOf(u);
        out.critRate=(out.critRate??0)+n*u.kit.params.Talent[1];
        if(rank(u,1))out.critDmg=(out.critDmg??0)+n*rank(u,1);
      },
      modifiers(b,u,actor,to,a,kind){
        const out={};
        if(actor!==u||to.side===u.side)return out;
        // 行迹「勇气」(point08)：对生命百分比 ≤50% 的敌方目标伤害提高 15%。
        if(trace(u,3)&&to.hp/combatPanel(to).hp<=trace(u,3)[0])out.dmgBoost=(out.dmgBoost??0)+trace(u,3)[1];
        // E6：施放终结技时无视 30% 防御力。
        if(rank(u,6)&&a.type==='Ultra')out.defIgnore=(out.defIgnore??0)+rank(u,6);
        return out;
      },
    };
  },

  // ───────────────────────── 1314 翡翠（量子 · 智识） ─────────────────────────
  1314:function(api){
    const {live,get,enemies,rank,trace,buff,resource,damageTo,combatPanel,advance}=api;
    const P=u=>u.kit.params;
    const enqueue=(b,u,key,kind,targetId)=>b.queue.push({actor:u.id,key,kind,targetId:targetId??null,persistWave:u.actions[key]?.persistWave===true});
    const chargeOf=u=>u.resources['充能']??0;
    const dangOf=u=>u.buffs.find(e=>e.tag==='jadeDang')?.stacks??0;
    const setDang=(b,u,n)=>{
      const v=Math.max(0,Math.min(P(u).Talent[1],n));
      buff(b,u,u,'当品','marker',0,null,{id:u.id+':dang',tag:'jadeDang',stacks:v});
      resource(b,u,'当品',v);
    };
    const debtorId=u=>u.resources['收债人'];
    const debtorOf=(b,u)=>{const t=get(b,debtorId(u));return t&&live(t)?t:null;};
    return {
      start(b,u){
        resource(b,u,'充能',0);setDang(b,u,0);
        // 行迹「折牙票」(point07)：战斗开始时行动提前 50%。
        if(trace(u,2))advance(b,u.id,trace(u,2)[0]);
      },
      // 秘技「猎手的视界」：对敌方全体造成 Maze[2]=0.5 倍量子伤害，并立即获得 Maze[3]=15 层【当品】。
      entry(b,u){
        const p=P(u);
        for(const to of enemies(b,u))damageTo(b,u,to,{name:'猎手的视界',type:'Maze',element:'Quantum',
          terms:atk(p.Maze[1]),toughness:mazeStance(1314)},1,'primary','technique');
        setDang(b,u,dangOf(u)+p.Maze[2]);
      },
      // 行迹「逆回购」(point06)：敌方目标进入战斗时翡翠获得 1 层【当品】。
      waveStart(b,u){
        if(!trace(u,1))return;
        if(enemies(b,u).length)setDang(b,u,dangOf(u)+trace(u,1)[1]);
      },
      // 翡翠每回合开始时【收债人】持续回合数 -1；行迹「逆回购」：收债人回合开始时额外 +3 层【当品】。
      turnStart(b,u,actor){
        if(actor===u){
          const t=debtorOf(b,u);
          if(t){
            const e=t.buffs.find(x=>x.tag==='jadeDebtor');
            if(e&&e.remaining!=null&&--e.remaining<=0){t.buffs=t.buffs.filter(x=>x!==e);resource(b,u,'收债人',null);}
          }
        }else if(actor&&debtorId(u)===actor.id&&trace(u,1))setDang(b,u,dangOf(u)+trace(u,1)[0]);
      },
      // 场上存在【收债人】时翡翠无法施放战技。
      shouldUseSkill(b,u){return !debtorOf(b,u);},
      after(b,u,actor,key,kind,a,selected,hitTargets){
        const p=P(u);
        // 战技：指定我方单体成为【收债人】，速度 +BPSkill[0]=30，持续 BPSkill[3]=3 回合。
        if(actor===u&&key==='skill'&&kind!=='copy'){
          const to=selected[0];
          if(to){
            resource(b,u,'收债人',to.id);
            buff(b,u,to,'收债人','speed',p.BPSkill[0],p.BPSkill[3],{id:u.id+':debtor',tag:'jadeDebtor'});
            if(rank(u,6)&&!u.buffs.some(x=>x.tag==='jadeDebtor'))buff(b,u,u,'收债人','marker',0,null,{id:u.id+':debtor-self',tag:'jadeDebtor'});
          }
        }
        // 终结技：使天赋追加攻击倍率提高 Ultra[0]=100%，可生效 Ultra[1]=2 次；E4 自身无视防御 12% 持续 3 回合。
        if(actor===u&&key==='ultimate'){
          resource(b,u,'强化次数',p.Ultra[1]);
          if(rank(u,4))buff(b,u,u,'翡翠 E4 · 无视防御','defIgnore',rank(u,4,0),rank(u,4,1),{id:u.id+':e4'});
        }
        // 天赋：翡翠或【收债人】施放攻击后，每击中 1 名敌方目标获得 1 点充能；满 Talent[2]=8 点消耗并发动追加攻击。
        if(hitTargets.length&&(actor===u||actor.id===debtorId(u))&&key!=='followup'){
          const n=hitTargets.filter(t=>t.side!==u.side&&live(t)).length;
          if(n){
            let gain=n;
            // E1：击中 2 名时额外 +1 点，击中 1 名时额外 +2 点充能。
            if(rank(u,1))gain+=n===2?rank(u,1,1):n===1?rank(u,1,2):0;
            resource(b,u,'充能',chargeOf(u)+gain);
            // 【收债人】攻击后消耗其生命上限 BPSkill[1]=2% 的生命值，并对每个击中的敌方目标造成
            // BPSkill[2]=30% 攻击力的量子属性附加伤害（翡翠本人为收债人时不消耗生命值）。
            if(actor.id===debtorId(u)&&actor!==u){
              const loss=Math.min(Math.max(0,actor.hp-1),combatPanel(actor).hp*p.BPSkill[1]);
              actor.hp-=loss;
              for(const to of hitTargets.filter(t=>t.side!==u.side&&live(t)))
                damageTo(b,u,to,{name:'收债人 · 附加伤害',type:'Additional',element:'Quantum',
                  terms:atk(p.BPSkill[2]),toughness:0},1,'primary','additional');
            }
            if(chargeOf(u)>=p.Talent[2]){
              resource(b,u,'充能',chargeOf(u)-p.Talent[2]);
              enqueue(b,u,'followup','followup',(hitTargets.find(t=>t.side!==u.side)??selected[0])?.id);
            }
          }
        }
        // 天赋追加攻击命中后获得 Talent[3]=5 层【当品】并消耗 1 次终结技强化。
        if(actor===u&&key==='followup'){
          setDang(b,u,dangOf(u)+p.Talent[3]);
          if((u.resources['强化次数']??0)>0)resource(b,u,'强化次数',u.resources['强化次数']-1);
        }
      },
      // 终结技强化期间天赋追加攻击倍率 ×(1+Ultra[0])。
      prepare(b,u,key,kind,a){
        if(key!=='followup'||kind!=='followup')return a;
        const uses=u.resources['强化次数']??0;
        if(uses<=0)return a;
        const scale=t=>({...t,multiplier:t.multiplier*(1+P(u).Ultra[0])});
        return {...a,terms:(a.terms??[]).map(scale),enhancedFollow:true};
      },
      // 行迹「绝当品」(point08)：每层【当品】额外使攻击力提高 0.5%；E2：当品 ≥15 层时暴击率 +18%。
      panel(b,u,target,out,opts){
        if(u!==target||opts?.excludeConverted)return;
        const p=P(u),n=dangOf(u);
        if(trace(u,3))out.atk=(out.atk??0)+(out.baseStats?.atk??0)*n*trace(u,3)[0];
        if(rank(u,2)&&n>=rank(u,2,0))out.critRate=(out.critRate??0)+rank(u,2,1);
      },
      modifiers(b,u,actor,to,a,kind){
        const out={};
        if(actor!==u||to.side===u.side)return out;
        // 天赋本身：每层【当品】使暴击伤害提高 Talent[0]=3%。
        out.critDmg=(out.critDmg??0)+dangOf(u)*P(u).Talent[0];
        // E1：天赋追加攻击伤害提高 32%。
        if(rank(u,1)&&kind==='followup')out.dmgBoost=(out.dmgBoost??0)+rank(u,1,0);
        // E6：场上有【收债人】时翡翠量子属性抗性穿透 +20%。
        if(rank(u,6)&&debtorOf(b,u))out.resPen=(out.resPen??0)+rank(u,6);
        return out;
      },
    };
  },

  // ───────────────────────── 1401 大黑塔（冰 · 智识） ─────────────────────────
  1401:function(api){
    const {live,enemies,allies,get,rank,trace,buff,resource,energy,damageTo,advance}=api;
    const P=u=>u.kit.params;
    const markOf=to=>to.buffs.find(e=>e.tag==='hertaMark')?.stacks??0;
    const setMark=(b,u,to,n)=>{
      const v=Math.max(0,Math.min(P(u).Talent[2],n));
      buff(b,u,to,'解读','marker',0,null,{id:u.id+':mark',tag:'hertaMark',debuff:true,stacks:v});
      return v;
    };
    const addMark=(b,u,to,n=1)=>{
      if(!live(to)||to.side===u.side||n<=0)return 0;
      const before=markOf(to),after=setMark(b,u,to,before+n);
      const gained=after-before;
      // 行迹「饥饿的地景」(point08)：敌方每被施加 1 层【解读】，大黑塔获得 1 层【谜底】（上限 99）。
      if(gained&&trace(u,3))resource(b,u,'谜底',Math.min(trace(u,3)[1],(u.resources['谜底']??0)+gained));
      return gained;
    };
    const gainInsp=(b,u,n)=>resource(b,u,'灵感',Math.min(P(u).Ultra[5],(u.resources['灵感']??0)+n));
    const inspOf=u=>u.resources['灵感']??0;
    return {
      start(b,u){
        resource(b,u,'谜底',0);resource(b,u,'灵感',0);
        // E2：进入战斗额外获得 1 层【灵感】。
        if(rank(u,2))gainInsp(b,u,1);
        // 行迹「视界外来信」(point07)：队伍中智识 ≥2 名时我方全体暴击伤害提高 80%。
        if(trace(u,2)&&eruditionCount(b,u)>=2)
          for(const to of allies(b,u))buff(b,u,to,'视界外来信 · 暴击伤害','critDmg',trace(u,2)[0],null,{id:u.id+':trace7',removeOnSourceDeath:true});
        // E4：队伍中智识命途角色速度提高 12%。
        if(rank(u,4))for(const to of allies(b,u))if(isErudition(to))buff(b,u,to,'大黑塔 E4 · 速度','speedPct',rank(u,4),null,{id:u.id+':e4'});
      },
      // 秘技「看看好看的」：战斗开始时攻击力提高 Maze[0]=60%，持续 2 回合。
      entry(b,u){
        if(!u.kit.technique)return;
        buff(b,u,u,'看看好看的 · 攻击提高','atkPct',P(u).Maze[0],P(u).Maze[1],{id:u.id+':maze',tickAt:'start'});
      },
      // 天赋：敌方目标进入战斗时施加 1 层【解读】；每波次开始对随机敌方目标（优先精英）施加 Talent[5]=25 层。
      waveStart(b,u){
        const pool=enemies(b,u);
        for(const to of pool)if(markOf(to)===0)addMark(b,u,to,1);
        if(pool.length){
          const elite=pool.filter(t=>t.rank==='elite'||t.rank==='boss');
          const src=elite.length?elite:pool;
          addMark(b,u,src[Math.floor(b.random()*src.length)],P(u).Talent[5]);
        }
      },
      // 强化战技：持有【灵感】时战技替换为【我有一个大胆的想法】；终结技按【谜底】与 E6 目标数提高倍率。
      prepare(b,u,key,kind,a){
        if(kind==='technique'||kind==='copy')return a;
        const p=P(u);
        if(key==='skill'&&inspOf(u)>0)return {...u.actions.enhancedSkill,enhanced:true};
        if(key==='ultimate'){
          const stacks=u.resources['谜底']??0;
          const mult=1+stacks*(trace(u,3)?trace(u,3)[0]:0);
          let bonus=0;const n=enemies(b,u).length;
          if(rank(u,6))bonus=n>=3?rank(u,6,0):n===2?rank(u,6,1):rank(u,6,2);
          const scale=t=>({...t,multiplier:t.multiplier*mult+bonus});
          return {...a,terms:(a.terms??[]).map(scale)};
        }
        return a;
      },
      // 终结技：重排【解读】层数（优先精英）；记录强化战技主目标供 modifiers 判定。
      before(b,u,actor,key,kind,a,selected){
        if(actor!==u||kind==='copy')return;
        const p=P(u);
        if(key==='skill'){u.hertaMain=selected[0]?.id??null;return;}
        if(key!=='ultimate')return;
        const pool=enemies(b,u),total=pool.reduce((n,t)=>n+markOf(t),0);
        if(total>0){
          for(const t of pool)setMark(b,u,t,0);
          const rankOf=t=>(t.rank==='elite'||t.rank==='boss')?1:0;
          const order=[...pool].sort((x,y)=>rankOf(y)-rankOf(x)||x.order-y.order);
          let left=total;
          for(const t of order){const v=Math.min(p.Talent[2],left);setMark(b,u,t,v);left-=v;if(left<=0)break;}
        }
      },
      after(b,u,actor,key,kind,a,selected,hitTargets){
        const p=P(u);
        // 行迹「冷漠的诚实」(point06)：我方目标攻击后每击中 1 个目标固定恢复 3 能量（最多 5 个；
        // point07 计算击中目标数时至少计算 3 个目标），并对击中的目标施加 1 层【解读】。
        if(hitTargets.length&&actor.side===u.side&&kind!=='technique'){
          const pool=hitTargets.filter(t=>t.side!==u.side&&live(t));
          if(pool.length){
            if(trace(u,1)){
              for(const to of pool)addMark(b,u,to,1);
              energy(b,u,Math.min(5,Math.max(pool.length,trace(u,2)?trace(u,2)[1]:0))*trace(u,1)[0],true);
            }
            // point07：攻击后对【解读】层数最高的被击中目标施加 1 层，攻击者为智识时额外 2 层。
            if(trace(u,2)){
              const top=pool.reduce((x,c)=>markOf(c)>markOf(x)?c:x);
              addMark(b,u,top,trace(u,2)[2]+(isErudition(actor)?trace(u,2)[3]:0));
            }
          }
        }
        if(actor!==u)return;
        // 强化战技的收尾：对敌方全体造成 140109[2]=0.5 倍伤害，主目标【解读】重置为 1（E1 为 15）。
        // 收尾削韧取自 Skill21_Phase02 收尾节点的 StanceValue=15（成功 / 失败分支一致）；
        // 15 不在 140109 的 ShowStanceList[60,0,30] 中，故不能按 stance 索引读取。
        if(key==='skill'&&a.enhanced){
          const aoe=a.aoe??0;
          for(const to of enemies(b,u))damageTo(b,u,to,{name:'我有一个大胆的想法 · 收尾',type:'BPSkill',element:'Ice',
            terms:atk(aoe),toughness:15},1,'primary','direct');
          const main=selected[0];
          if(main&&live(main))setMark(b,u,main,rank(u,1)?rank(u,1,1):p.Talent[3]);
          resource(b,u,'灵感',Math.max(0,inspOf(u)-1));
          // E2：施放强化战技后行动提前 35%。
          if(rank(u,2))advance(b,u.id,rank(u,2,0));
        }
        // 终结技：攻击力 +Ultra[3]=100% 持续 Ultra[4]=3 回合，立即行动并获得 1 层【灵感】。
        if(key==='ultimate'){
          buff(b,u,u,'早说了是魔法吧 · 攻击提高','atkPct',p.Ultra[3],p.Ultra[4],{id:u.id+':ult-atk'});
          advance(b,u.id,1);
          gainInsp(b,u,1);
        }
      },
      // 强化战技每层【解读】对主目标 +Talent[0]=10% / 其他目标 +Talent[1]=5%，队伍智识 ≥2 名时翻倍；
      // 主目标【解读】达到 42 层时伤害额外提高 50%（行迹「冷漠的诚实」）。
      modifiers(b,u,actor,to,a,kind){
        const out={};
        if(actor!==u||to.side===u.side)return out;
        const p=P(u);
        // E6：冰属性抗性穿透 +20%。
        if(rank(u,6)&&a.type==='Ultra')out.resPen=(out.resPen??0)+rank(u,6,3);
        if(a.enhanced){
          const main=get(b,u.hertaMain);
          let n=markOf(to);
          // E1：额外计算主目标及相邻目标中层数最高者当前层数的 50%。
          if(rank(u,1)&&main){
            const hi=Math.max(markOf(main),...adjacentOf(b,u,main).map(markOf));
            n=Math.min(p.Talent[2],n+hi*rank(u,1,0));
          }
          const rate=to.id===main?.id?p.Talent[0]:p.Talent[1];
          out.dmgBoost=(out.dmgBoost??0)+Math.min(p.Talent[2],n)*rate*(eruditionCount(b,u)>=2?2:1);
          if(main&&markOf(main)>=p.Talent[2]&&trace(u,1))out.dmgBoost=(out.dmgBoost??0)+trace(u,1)[1];
        }
        return out;
      },
    };
  },

  // ───────────────────────── 1405 那刻夏（风 · 智识） ─────────────────────────
  1405:function(api){
    const {live,enemies,rank,trace,buff,stacks,resource,energy,damageTo,allResDown}=api;
    const P=u=>u.kit.params;
    const enqueue=(b,u,key,kind,targetId)=>b.queue.push({actor:u.id,key,kind,targetId:targetId??null});
    const weaknessesOf=to=>{
      const s=new Set(to.weaknesses??[]);
      for(const e of to.buffs)if(e.weakness)s.add(e.weakness);
      return s;
    };
    const hasReveal=(u,to)=>weaknessesOf(to).size>=P(u).Talent[2];
    // 天赋：每次击中敌方目标后添加 1 个随机属性弱点（优先目标尚未拥有的），持续 Talent[1]=3 回合。
    const addWeak=(b,u,to)=>{
      if(!live(to)||to.side===u.side)return null;
      const have=weaknessesOf(to),pool=ELEMENTS.filter(e=>!have.has(e)),src=pool.length?pool:ELEMENTS;
      const el=src[Math.floor(b.random()*src.length)];
      buff(b,u,to,'那刻夏 · 植入弱点','marker',0,P(u).Talent[1],{id:u.id+':weak:'+el,weakness:el});
      return el;
    };
    return {
      // 秘技「瞳扉之彩」：为敌方每个单体目标添加 1 个攻击者属性（风）的弱点，持续 Maze[1]=3 回合。
      entry(b,u){
        if(!u.kit.technique)return;
        for(const to of enemies(b,u))
          buff(b,u,to,'瞳扉之彩 · 弱点','marker',0,P(u).Maze[1],{id:u.id+':maze-weak',weakness:u.element});
      },
      // E2：敌方目标入场时触发 1 次天赋的弱点添加效果，并使其全属性抗性降低 20%。
      waveStart(b,u){
        if(!rank(u,2))return;
        for(const to of enemies(b,u)){addWeak(b,u,to);allResDown(b,u,to,rank(u,2),null);}
      },
      // 行迹「流浪的能指」(point06)：回合开始时若场上不存在【质性揭露】目标，立即恢复 30 点能量。
      turnStart(b,u,actor){
        if(actor!==u||!trace(u,1))return;
        if(!enemies(b,u).some(t=>hasReveal(u,t)))energy(b,u,trace(u,1)[1]);
      },
      // 天赋：对处于【质性揭露】的目标施放普攻或战技后，额外施放 1 次战技（不消耗战技点、不再次触发）。
      prepare(b,u,key,kind,a){
        // 1141518 献予「理性」之诗：战技伤害次数 +3（一次性，持续 1 回合）。
        // 只读取、不在这里消费：prepare 会在选靶与执行阶段被调用多次，消费会导致第二次退回原段数。
        if(key==='skill'&&(u.resources['Cyrene理性诗篇次数']??0)>0){
          const n=u.resources['Cyrene理性诗篇次数'];
          return {...a,bounceCount:(a.bounceCount??0)+n};
        }
        if(key!=='skill'||kind!=='followup')return a;
        return {...a,spCost:0,spGain:0,extraSkill:true};
      },
      after(b,u,actor,key,kind,a,selected,hitTargets){
        if(actor!==u)return;
        const alive=hitTargets.filter(t=>t.side!==u.side&&live(t));
        // 天赋：每次击中敌方目标后添加 1 个随机弱点。
        for(const to of alive)addWeak(b,u,to);
        // 行迹「流浪的能指」：普攻额外恢复 10 点能量。
        if(key==='basic'&&trace(u,1))energy(b,u,trace(u,1)[0]);
        // E1：首次施放战技后恢复 1 个战技点；战技命中使目标防御力降低 16%，持续 2 回合。
        if(key==='skill'){
          // 理性诗篇的战技次数在动作真正结算后消费，避免 prepare 多次调用提前清空。
          if((u.resources['Cyrene理性诗篇次数']??0)>0)resource(b,u,'Cyrene理性诗篇次数',0);
          if(rank(u,1)){
            if(!(u.resources['E1 已恢复']??0)){resource(b,u,'E1 已恢复',1);api.sp(b,u,rank(u,1,2),'那刻夏 E1');}
            for(const to of alive)buff(b,u,to,'那刻夏 E1 · 防御降低','defShred',rank(u,1,0),rank(u,1,1),{id:u.id+':e1',debuff:true});
          }
          // E4：施放战技时攻击力提高 30%，持续 2 回合，最多叠加 2 层。
          if(rank(u,4))stacks(b,u,u,'那刻夏 E4 · 攻击提高','atkPct',rank(u,4,0),rank(u,4,2),rank(u,4,1),{id:u.id+':e4'});
        }
        // 天赋：普攻 / 战技命中【质性揭露】目标后额外施放 1 次战技（仅普通施放触发）。
        if(kind==='normal'&&['basic','skill'].includes(key)){
          const main=selected[0];
          const target=main&&live(main)&&hasReveal(u,main)?main:enemies(b,u).find(t=>hasReveal(u,t));
          if(target)enqueue(b,u,'skill','followup',target.id);
        }
      },
      panel(b,u,target,out,opts){
        if(u!==target||opts?.excludeConverted)return;
        const t=trace(u,2);
        // 行迹「必要的留白」(point07)：1 名智识时那刻夏暴击伤害 +140%（E6 两种效果同时生效）。
        if(t&&(eruditionCount(b,u)===1||rank(u,6)))out.critDmg=(out.critDmg??0)+t[0];
      },
      modifiers(b,u,actor,to,a,kind){
        const out={};
        if(to.side===u.side)return out;
        // 行迹「必要的留白」：≥2 名智识时我方全体造成的伤害提高 50%（E6 无条件生效）。
        if(actor.side===u.side&&trace(u,2)&&(eruditionCount(b,u)>=2||rank(u,6)))out.dmgBoost=(out.dmgBoost??0)+trace(u,2)[1];
        if(actor!==u)return out;
        // 战技：场上每有 1 个可攻击的敌方目标，本次战技造成的伤害提高 BPSkill[2]=20%。
        if(a.type==='BPSkill')out.dmgBoost=(out.dmgBoost??0)+P(u).BPSkill[2]*enemies(b,u).length;
        // 天赋：对处于【质性揭露】的目标伤害提高 Talent[0]=36%。
        if(hasReveal(u,to))out.dmgBoost=(out.dmgBoost??0)+P(u).Talent[0];
        // 行迹「质性的嬗变」(point08)：目标每有 1 个不同属性弱点无视 4% 防御，最多计入 7 个。
        if(trace(u,3))out.defIgnore=(out.defIgnore??0)+Math.min(7,weaknessesOf(to).size)*trace(u,3)[0];
        // E6：造成的伤害为原伤害的 130%。
        if(rank(u,6))out.dmgBoost=(out.dmgBoost??0)+rank(u,6)-1;
        return out;
      },
    };
  },

  // ───────────────────────── 1510 姬子•启行（火 · 智识） ─────────────────────────
  1510:function(api){
    const {live,enemies,allies,rank,trace,buff,resource,energy,damageTo,record}=api;
    const P=u=>u.kit.params;
    const enqueue=(b,u,key,kind,targetId,extra={})=>b.queue.push({actor:u.id,key,kind,targetId:targetId??null,...extra});
    const capUses=u=>rank(u,2)?2:1;
    const usesOf=t=>t.resources['助战技次数']??0;
    // 上限由姬子•启行的 E2 决定（而非使用者的星魂）。
    const setUses=(b,u,t,n)=>resource(b,t,'助战技次数',Math.max(0,Math.min(capUses(u),n)));
    const capEnergy=u=>rank(u,6)?rank(u,6,1):3;
    const sourceEnergy=u=>u.resources['源能']??0;
    // 同行协议参数（151025/151026 等级 15）：#8 增伤/暴伤、#9 触发次数、#10 终结/战技额外增伤。
    const PROTOCOL_SKILL={juecai:151025,jianpo:151026};
    const protoRow=which=>ROSTER_DATA[1510].skills[String(PROTOCOL_SKILL[which])]?.params?.['15']?.param_list
      ??[2,3,0.3,2.5,4,0.39,4,1.25,which==='juecai'?2:9,1.25];
    const protoCap=u=>2+(rank(u,1)?rank(u,1,3):0);
    function queueFreeAssist(b,u,reason){
      if((u.resources['协议额外助战已用']??0)>=protoCap(u))return false;
      resource(b,u,'协议额外助战已用',(u.resources['协议额外助战已用']??0)+1);
      const to=enemies(b,u)[0];
      enqueue(b,u,'assistFree','followup',to?.id,{persistWave:true});
      record(b,'mechanic',u,{name:'同行协议 · 额外助战技',reason,used:u.resources['协议额外助战已用'],cap:protoCap(u)});
      return true;
    }
    const enqueueFinalBlow=(b,u)=>{
      if(u.resources['拓星者终击已排程'])return;
      resource(b,u,'拓星者终击已排程',1);
      // 最后一击属于同一次「拓星者」接管；若光束 / 脉冲恰好清空当前波，下一波仍须执行终击
      //（原始脚本 OnWaveMonster → ReStartUltraSkill，AllDarkTeam 改指新一波）。
      enqueue(b,u,'finalBlow','extra',null,{persistWave:true});
    };
    // 原始脚本 Avatar_HimekoNova_00_Skill11/Skill21_TargetHPCanBeDamage：
    //   · ByCheckTargetHPCanBeDamage(AllDarkTeam.RemoveUnselectable) 为假（没有任何敌人还能掉血）→ Skill31 最后一击；
    //   · 否则只要存在 1 名不带 MCommon_LockHPThresholdReached_Mark 的敌人就继续光束 / 脉冲。
    // 引擎没有战斗脚本的动态标记，故用通用字段表达：hpLocked 或 tag='lockHpThreshold' 视为到达锁血阈值。
    const hpLocked=to=>to.hpLocked===true||to.buffs.some(e=>e.tag==='lockHpThreshold');
    const hpDamageable=to=>live(to)&&to.hpDamageable!==false&&to.cannotBeDamaged!==true;
    const pendingWave=(b,u)=>b.units.some(t=>t.side!==u.side&&(t.wave??1)>b.wave&&t.hp>1e-8);
    const sequenceCanContinue=(b,u)=>{
      const pool=enemies(b,u);
      if(pool.some(to=>hpDamageable(to)&&!hpLocked(to)))return true;
      // 换波后 AllDarkTeam 已是新一波敌人；当前波全灭且还有后续波次时序列继续（不是提前收尾）。
      return pool.length===0&&pendingWave(b,u);
    };
    // 提前收尾：取消本次终结技尚未执行的光束 / 脉冲指令，立刻插入最后一击。
    // 只有真正跳过了后续指令时才记录「提前收尾」；脉冲作为序列的正常终点不算提前。
    const earlyFinalBlow=(b,u,reason)=>{
      const dropped=b.queue.filter(q=>q.actor===u.id&&(q.key==='beam'||q.key==='pulse'));
      if(dropped.length){
        b.queue=b.queue.filter(q=>!(q.actor===u.id&&(q.key==='beam'||q.key==='pulse')));
        for(const q of dropped)if(q.planIndex!=null)b.planQueued=b.planQueued.filter(i=>i!==q.planIndex);
        record(b,'mechanic',u,{name:'拓星者 · 提前收尾',reason,skipped:dropped.length});
      }
      enqueueFinalBlow(b,u);
    };
    const gainSource=(b,u,n=1,reason='星魂6 · 助战技')=>{
      if(!rank(u,6)||n<=0)return;
      resource(b,u,'源能',Math.min(capEnergy(u),sourceEnergy(u)+n));
      record(b,'mechanic',u,{name:'姬子·启行 E6 · 获得源能',amount:n,reason});
    };
    const gainBeamSource=(b,u)=>{
      const amount=1+(rank(u,6)?1:0);
      resource(b,u,'源能',Math.min(capEnergy(u),sourceEnergy(u)+amount));
      record(b,'mechanic',u,{name:'超频粒子光束 · 获得源能',amount,reason:rank(u,6)?'光束基础源能 + E6 额外源能':'光束基础源能'});
    };
    return {
      start(b,u){
        resource(b,u,'源能',0);
        // 天赋「共赴灼热的远征」：姬子•启行在场时展开境界【拓星视界】，场上出现「拓星者」。
        // 二者都随姬子离场而关闭（death 钩子），资源值用于战斗日志 / frame.resources 复核。
        resource(b,u,'境界·拓星视界',1);
        resource(b,u,'实体·拓星者',1);
        // 并使我方全体获得 1 次助战技使用次数。
        for(const to of allies(b,u)){
          setUses(b,u,to,1);
          if(to!==u)to.actions.supportSkill={name:'开拓，与你同行',type:'Support',element:'Fire',target:'single',terms:[],hitShares:[1],energyGain:0,spCost:0,spGain:0,toughness:0};
        }
      },
      // 境界 / 「拓星者」实体生命周期：姬子•启行离场时关闭境界（原始 FieldExit_Insert 的
      // SetDieImmediately/ForceKill Partners + RemoveModifier）；其未执行的光束 / 脉冲 / 终击随后按阵亡单位跳过。
      death(b,u,from,to){
        void from;
        if(to!==u)return;
        resource(b,u,'境界·拓星视界',0);
        resource(b,u,'实体·拓星者',0);
        resource(b,u,'拓星者终结技进行中',0);
        resource(b,u,'拓星者终击已排程',0);
        record(b,'mechanic',u,{name:'境界【拓星视界】关闭',reason:'姬子•启行离场'});
      },
      // 秘技「拓星巡航」：进入战斗后每个波次开始时立即施放 1 次战技（获得【领航旗语】）。
      waveStart(b,u){
        if(!u.kit.technique)return;
        for(const to of allies(b,u)){
          buff(b,u,to,'领航旗语','dmgBoost',P(u).BPSkill[0],P(u).BPSkill[1],{id:u.id+':flag',removeOnSourceDeath:true});
          setUses(b,u,to,capUses(u));
        }
      },
      // 行迹「人类该向何处去」(point06)：回合开始若助战技次数已满，姬子额外恢复 5 点能量。
      turnStart(b,u,actor){
        if(actor!==u)return;
        if(trace(u,1)&&usesOf(u)>=capUses(u))energy(b,u,trace(u,1)[0]);
        // 【领航旗语】存在时每个回合开始立即恢复 1 次助战技使用次数；
        // E2「旗帜，永不降下的帆」：该恢复额外 +1 次（1510 技能文本 E2 明示）。
        if(u.buffs.some(e=>e.id===u.id+':flag')){
          const step=1+(rank(u,2)?1:0);
          for(const to of allies(b,u))setUses(b,u,to,usesOf(to)+step);
        }
      },
      // 行迹「银轨在旷古中静默」(point08)：施放终结技时立即获得 3 点【源能】；终结技期间 6 次光束各 +1。
      prepare(b,u,key,kind,a){
        if(key!=='ultimate'||kind==='technique'||kind==='copy')return a;
        // 终结技本身只执行拓星者接管；行迹源能在动作实际开始时结算。
        return {...a,terms:[],target:'self'};
      },
      before(b,u,actor,key,kind,a){
        if(actor!==u)return;
        if(key==='ultimate'){
          resource(b,u,'源能',Math.min(capEnergy(u),sourceEnergy(u)+(trace(u,3)?trace(u,3)[0]:0)));
          resource(b,u,'拓星者光束次数',0);
          resource(b,u,'拓星者终击已排程',0);
          resource(b,u,'拓星者终结技进行中',1);
        }
        if(key==='pulse'){
          if(sourceEnergy(u)<1)throw new Error('源能不足，无法发动轨道歼灭脉冲');
          const stored=sourceEnergy(u);
          a.sourceEnergyAtPulse=stored;
          a.bounceCount=Math.max(0,stored-1);
          // 行迹 point08「银轨在旷古中静默」：施放脉冲时源能 ≥#2（3）点，
          // 脉冲的随机单体额外伤害倍率提高 #3（30%）。
          const bounceBonus=trace(u,3)&&stored>=trace(u,3)[1]?trace(u,3)[2]:0;
          a.bounceTerms=atk(P(u).Ultra[4]*(1+bounceBonus));
          a.bounceToughness=0;
          // 脉冲先消耗1点；当前源能高于1时，每再消耗1点追加一次随机单体伤害。
          resource(b,u,'源能',0);
        }
      },
      after(b,u,actor,key,kind,a,selected,hitTargets){
        // 助战技是队友可主动选择的独立动作（原始 Skill51/52/53），普通攻击不能代替它。
        // 使用后消耗一次次数，该角色恢复 Talent[2] 能量，姬子立即发动助战追击。
        if(actor!==u&&actor.side===u.side&&key==='supportSkill'&&usesOf(actor)>0){
          setUses(b,u,actor,usesOf(actor)-1);
          energy(b,actor,P(u).Talent[2]);
          // E6：我方使用助战技时姬子获得 1 点源能；姬子随后的协同伤害是同一次助战技的伤害段，不能重复加点。
          gainSource(b,u,1,'队友使用助战技');
          // 已进入同行协议时，队友的助战技走对应协议变体。
          const proto=u.resources['同行协议'];
          const assistKey=proto==='juecai'?'assistJuecai':proto==='jianpo'?'assistJianpo':'assist';
          enqueue(b,u,assistKey,'followup',(selected.find(t=>t.side!==u.side)??hitTargets.find(t=>t.side!==u.side))?.id);
        }
        // 同行协议：151025/151026 施放后进入对应状态，并清空该协议的计数。
        if(actor===u&&(key==='assistJuecai'||key==='assistJianpo')){
          const proto=key==='assistJuecai'?'juecai':'jianpo';
          resource(b,u,'同行协议',proto);
          resource(b,u,'协议计数',0);
          record(b,'mechanic',u,{name:'进入同行协议',protocol:proto,params:protoRow(proto)});
        }
        // 裁决：队友主动施放终结技计数，达到 #9（E1 减 #1）后立即发动无消耗助战技。
        if(actor&&actor!==u&&actor.side===u.side&&key==='ultimate'&&u.resources['同行协议']==='juecai'){
          const need=Math.max(1,(protoRow('juecai')[8]??2)-(rank(u,1)?rank(u,1,0):0));
          const n=(u.resources['协议计数']??0)+1;
          if(n>=need){resource(b,u,'协议计数',0);queueFreeAssist(b,u,'裁决 · 队友终结技');}
          else resource(b,u,'协议计数',n);
        }
        // 姬子本人施放终结技后刷新额外助战技次数。
        if(actor===u&&key==='ultimate')resource(b,u,'协议额外助战已用',0);
        if(actor===u&&key==='beam'){
          resource(b,u,'拓星者光束次数',(u.resources['拓星者光束次数']??0)+1);
          gainBeamSource(b,u);
          const count=u.resources['拓星者光束次数']??0;
          // 六束耗尽 → Skill12_End_Enter 自动发动脉冲（脉冲后又接最后一击）。
          // 本次接管跨波保留：第 6 束若恰好清空当前波，自动脉冲必须在新一波继续结算。
          if(count>=6)enqueue(b,u,'pulse','extra',null,{persistWave:true});
          // 原始脚本 Skill11_TargetHPCanBeDamage：这一束之后若场上已无敌人可继续削减生命值
          // （全灭且无后续波次，或全部到达锁血阈值），立即取消剩余光束并发动最后一击。
          else if(!sequenceCanContinue(b,u))earlyFinalBlow(b,u,'超频粒子光束后敌方已无法继续削减生命值');
        }
        if(actor===u&&key==='pulse'){
          if(rank(u,6)&&a.sourceEnergyAtPulse>=rank(u,6,3))
            for(const to of enemies(b,u))damageTo(b,u,to,{name:'轨道歼灭脉冲 · E6额外火伤',type:'Ultra',element:'Fire',terms:atk(rank(u,6,4)),toughness:0},1,'primary','direct');
          // 脉冲结束超频选择，立刻接终击；同一终结技中未执行的光束指令取消（含操作轴占用清理）。
          earlyFinalBlow(b,u,'轨道歼灭脉冲结束');
        }
        if(actor===u&&key==='finalBlow')resource(b,u,'拓星者终结技进行中',0);
        if(actor!==u)return;
        // 战技：立即恢复所有助战技使用次数，并获得【领航旗语】：我方全体造成的伤害提高 BPSkill[0]=25%，持续 BPSkill[1]=3 回合。
        if(key==='skill'){
          for(const to of allies(b,u)){
            buff(b,u,to,'领航旗语','dmgBoost',P(u).BPSkill[0],P(u).BPSkill[1],{id:u.id+':flag',removeOnSourceDeath:true});
            setUses(b,u,to,capUses(u));
          }
        }
        // 使用助战技视为姬子施放了战技：获得 Talent[1]=25% 全属性抗性穿透与 Talent[0]=100% 暴击伤害。
        if(key==='assist'||key==='assistJuecai'||key==='assistJianpo'||key==='assistFree'){
          // E4：助战技抗穿改为全队效果；姬子本人额外提高 10 个百分点。
          // 境界关闭（姬子离场）时全队共享的抗穿随之移除；姬子本人的增益随其死亡自然失效。
          for(const to of rank(u,4)?allies(b,u):[u])
            buff(b,u,to,'共赴灼热的远征 · 抗性穿透','resPen',P(u).Talent[1]+(to===u&&rank(u,4)?rank(u,4,0):0),null,
              {id:to===u?u.id+':talent-pen':u.id+':talent-pen:'+to.id,removeOnSourceDeath:true});
          buff(b,u,u,'共赴灼热的远征 · 暴击伤害','critDmg',P(u).Talent[0],null,{id:u.id+':talent-cd',removeOnSourceDeath:true});
        }
      },
      // 歼破：我方每击中 1 名敌方目标获得 1 点充能；达到 #9（E1 减 #2）后立即发动无消耗助战技。
      // 无消耗助战技本身不获得充能（assistFree）。
      afterHit(b,u,actor,to,a,kind){
        void a;void kind;
        if(u.resources['同行协议']!=='jianpo')return;
        if(!actor||actor.side!==u.side||to.side===u.side)return;
        if(b.activeAction?.key==='assistFree')return;
        const need=Math.max(1,(protoRow('jianpo')[8]??9)-(rank(u,1)?rank(u,1,1):0));
        const n=(u.resources['协议计数']??0)+1;
        if(n>=need){resource(b,u,'协议计数',0);queueFreeAssist(b,u,'歼破 · 充能');}
        else resource(b,u,'协议计数',n);
      },
      modifiers(b,u,actor,to,a,kind){
        const out={};
        if(to.side===u.side)return out;
        const proto=u.resources['同行协议'];
        // 歼破：我方全体暴击伤害 + #8；战技暴击伤害额外 + #10。
        if(proto==='jianpo'&&actor.side===u.side){
          const row=protoRow('jianpo');
          out.critDmg=(out.critDmg??0)+(row[7]??0)+(a.type==='BPSkill'?(row[9]??0):0);
        }
        if(actor!==u)return out;
        // 裁决：姬子造成的伤害 + #8，终结技伤害额外 + #10。
        if(proto==='juecai'){
          const row=protoRow('juecai');
          out.dmgBoost=(out.dmgBoost??0)+(row[7]??0)+(a.type==='Ultra'?(row[9]??0):0);
        }
        // E6：姬子火属性抗性穿透 +20%；助战技造成的伤害提高 E6[2]=75%。
        if(rank(u,6))out.resPen=(out.resPen??0)+rank(u,6,0);
        if(rank(u,6)&&a.type==='Assist')out.dmgBoost=(out.dmgBoost??0)+rank(u,6,2);
        // E2：终结技与姬子本人发动的助战技伤害提升至原来的 #1=130%。
        if(rank(u,2)&&(a.type==='Ultra'||a.type==='Assist'))out.dmgBoost=(out.dmgBoost??0)+rank(u,2)-1;
        return out;
      },
    };
  },

  // ───────────────────────── 1508 远坂凛（量子 · 智识 · 联动） ─────────────────────────
  1508:function(api){
    const {live,enemies,allies,rank,trace,buff,stacks,resource,energy,damageTo,advance}=api;
    const P=u=>u.kit.params;
    const enqueue=(b,u,key,kind,targetId)=>b.queue.push({actor:u.id,key,kind,targetId:targetId??null});
    const gemOf=u=>u.resources['宝石能量']??0;
    const shadowOf=u=>u.resources['影子宝石']??0;
    const talentRows=u=>rowFor(1508,150804,150805,u.kit.params.Talent[2]);
    return {
      start(b,u){
        const p=P(u);
        resource(b,u,'宝石能量',p.Talent[0]);
        resource(b,u,'影子宝石',0);
        // 行迹「秉持优雅」(point06)：战技点上限 +2；攻击力 +150%、量子抗性穿透 +15%（Archer 在队时同样获得）。
        if(trace(u,1)){
          b.maxSP=(b.maxSP??5)+trace(u,1)[0];
          for(const to of allies(b,u))if(to===u||to.characterId===1015){
            buff(b,u,to,'秉持优雅 · 攻击提高','atkPct',trace(u,1)[1],null,{id:u.id+':trace6-atk',removeOnSourceDeath:true});
            buff(b,u,to,'秉持优雅 · 抗性穿透','resPen',trace(u,1)[2],null,{id:u.id+':trace6-pen',removeOnSourceDeath:true});
          }
        }
        // 行迹「淑女风范」(point07)：进入战斗时速度提高 20%，持续 3 回合。
        if(trace(u,2))buff(b,u,u,'淑女风范 · 速度','speedPct',trace(u,2)[0],trace(u,2)[1],{id:u.id+':trace7',tickAt:'start'});
        // E6：全属性抗性穿透 +20%。
        if(rank(u,6))buff(b,u,u,'这次没掉链子 · 抗性穿透','resPen',rank(u,6,0),null,{id:u.id+':e6'});
      },
      // 秘技「转换充能」：下一次战斗开始时获得 Maze[0]=10 点【宝石能量】。
      entry(b,u){
        if(!u.kit.technique)return;
        resource(b,u,'宝石能量',gemOf(u)+P(u).Maze[0]);
      },
      // 天赋「宝石魔术」：宝石能量 ≥ Talent[4]=15 或战技点 ≥ Talent[3]=7 时战技强化为【第二魔法实验】。
      prepare(b,u,key,kind,a){
        if(key!=='skill'||kind==='technique'||kind==='copy')return a;
        const p=P(u),shadow=shadowOf(u);
        const enhanced=shadow>0||gemOf(u)>=p.Talent[4]||b.sp>=p.Talent[3];
        if(!enhanced)return a;
        const E=rowFor(1508,150802,150809,p.BPSkill[0]);
        const per=E[1]||3;
        const n=Math.min(E[5],Math.floor((shadow>0?shadow:gemOf(u))/per));
        return {...u.actions.enhancedSkill,bounceCount:n,shadow:shadow>0,enhancedSkill:true,
          consumePer:per,drainTo:E[3],gemPerSp:E[4]};
      },
      before(b,u,actor,key,kind,a,selected){
        if(actor!==u||key!=='skill'||!a.enhancedSkill)return;
        const p=P(u);
        if(a.shadow){resource(b,u,'影子宝石',0);a.consumedGems=0;return;}
        const used=(a.bounceCount??0)*a.consumePer;
        resource(b,u,'宝石能量',Math.max(0,gemOf(u)-used));
        a.consumedGems=used;
        // 施放时若战技点 > 150809[3]=2，将战技点消耗至 2，每消耗 1 点立即获得 150809[4]=2 点【宝石能量】。
        if(b.sp>a.drainTo){
          const drain=b.sp-a.drainTo;
          api.sp(b,u,-drain,'第二魔法实验');
          resource(b,u,'宝石能量',gemOf(u)+drain*a.gemPerSp);
        }
        // E1：单次强化战技消耗 ≥30 点时获得等量【影子宝石】。
        if(rank(u,1)&&used>=rank(u,1,0)){
          resource(b,u,'影子宝石',used);
          buff(b,u,u,'影子宝石','marker',0,null,{id:u.id+':shadow',tag:'rinShadow',stacks:used});
        }
      },
      after(b,u,actor,key,kind,a,selected,hitTargets){
        const p0=P(u);
        // 天赋「宝石魔术」：我方目标消耗或恢复战技点时，使其暴击伤害提高 Talent[2] 持续 Talent[1] 回合，
        // 且每消耗或恢复 1 点战技点使远坂凛获得 1 点【宝石能量】（对任意我方角色生效，先于自身分支）。
        if(actor.side===u.side&&kind!=='technique'&&(a.spCost??0)>0){
          resource(b,u,'宝石能量',gemOf(u)+a.spCost);
          if(rank(u,4))stacks(b,u,actor,'宝石魔术 · 暴击伤害','critDmg',p0.Talent[2],rank(u,4),p0.Talent[1],{id:u.id+':gem-cd:'+actor.id});
          else buff(b,u,actor,'宝石魔术 · 暴击伤害','critDmg',p0.Talent[2],p0.Talent[1],{id:u.id+':gem-cd:'+actor.id});
        }
        if(actor.side===u.side&&kind!=='technique'&&(a.spGain??0)>0)resource(b,u,'宝石能量',gemOf(u)+a.spGain);
        // 天赋「自在远坂流」：Archer 施放战技后（战技点 ≤150805[2]=3 或本次【回路连接】已施放 5 次）发动连携追加攻击。
        if(actor!==u&&actor.characterId===1015&&key==='skill'&&kind==='normal'){
          const conn=actor.resources['连续战技次数']??0;
          const trig=talentRows(u);
          if(!(u.resources['自在远坂流已触发']??0)&&(b.sp<=trig[2]||conn>=5)){
            resource(b,u,'自在远坂流已触发',1);
            enqueue(b,u,'followup','followup',(enemies(b,u)[0]??selected[0])?.id);
          }
        }
        if(actor!==u)return;
        const p=P(u);
        // 强化战技：速度提高 20%，持续 3 回合（行迹「淑女风范」）。
        if(key==='skill'&&a.enhancedSkill&&trace(u,2))buff(b,u,u,'淑女风范 · 速度','speedPct',trace(u,2)[0],trace(u,2)[1],{id:u.id+':trace7'});
        // 终结技：为我方恢复 Ultra[3]=1 个战技点，使敌方全体受到伤害提高 25% 持续 3 回合；
        // 行迹「财源广进」+12、E6 +24 点【宝石能量】与额外回合。
        if(key==='ultimate'){
          api.sp(b,u,p.Ultra[3],'山脉震撼 · 明星之薪');
          for(const to of enemies(b,u))buff(b,u,to,'山脉震撼 · 易伤','vuln',p.Ultra[4],p.Ultra[5],{id:u.id+':ult',debuff:true});
          if(trace(u,3))resource(b,u,'宝石能量',gemOf(u)+trace(u,3)[0]);
          if(rank(u,6)){resource(b,u,'宝石能量',gemOf(u)+rank(u,6,1));advance(b,u.id,1);}
        }
        // 【自在远坂流】：远坂凛与 Archer 各自对敌方全体造成 150805[0]/[3]=375% 伤害，并恢复 150805[1]=4 个战技点。
        if(key==='followup'){
          const T=talentRows(u);
          const archer=allies(b,u).find(t=>t.characterId===1015);
          if(archer)for(const to of enemies(b,u))damageTo(b,archer,to,{name:'自在远坂流 · Archer',type:'Additional',
            element:'Quantum',terms:atk(T[3]),toughness:0},1,'primary','additional');
          api.sp(b,u,T[1],'自在远坂流');
        }
      },
      turnEnd(b,u,actor){if(actor===u)resource(b,u,'自在远坂流已触发',0);},
      modifiers(b,u,actor,to,a,kind){
        const out={};
        if(to.side===u.side)return out;
        // E2：远坂凛造成的战技伤害提高 30%；远坂凛在场时我方全体造成的战技伤害为原伤害的 130%。
        if(rank(u,2)&&a.type==='BPSkill'){
          if(actor===u)out.dmgBoost=(out.dmgBoost??0)+rank(u,2,0);
          out.dmgBoost=(out.dmgBoost??0)+(rank(u,2,1)-1);
        }
        return out;
      },
    };
  },
};

// ───────────────────────── 动作表 ─────────────────────────
const actions={
  // 银枝：Skill01/02/03_Phase02 各 1 段；Skill31_Phase02 = AllEnemy 1 段 + 6 次随机单体（130214[1]=6）。
  1302:(p,d,{eidolon=0}={})=>{
    void eidolon;
    const E=rowFor(1302,130203,130214,p.Ultra[0]);
    return {
      basic:basic(p,d,{terms:atk(p.Normal[0])}),
      skill:skill(p,d,{target:'all',terms:atk(p.BPSkill[0]),toughness:30}),
      ultimate:ultimate(p,d,{target:'all',terms:atk(p.Ultra[0]),toughness:60,energyCost:p.Ultra[1]}),
      enhancedUltimate:{name:'驻「我」华庭，授予至勋',type:'Ultra',element:'Physical',target:'all',
        terms:atk(E[0]),hitShares:[1],toughness:60,energyCost:E[3],energyGain:5,spCost:0,spGain:0,
        bounceCount:E[1],bounceTerms:atk(E[2]),bounceToughness:15,bounceEnergy:0},
    };
  },
  // 翡翠：Skill01 主 1 段 + 相邻 1 段（0.42）；Skill03 1 段；天赋追加攻击 5 段（0.15×4+0.4）。
  1314:(p,d,{eidolon=0}={})=>{
    void eidolon;
    return {
      basic:basic(p,d,{target:'blast',terms:[...atk(p.Normal[0]),{...atk(p.Normal[1])[0],target:'adjacent'}],
        toughness:30,adjacentToughness:15}),
      skill:skill(p,d,{target:'ally',terms:[],toughness:0}),
      ultimate:ultimate(p,d,{target:'all',terms:atk(p.Ultra[2]),toughness:60}),
      followup:talentAction(p,d,{target:'all',terms:atk(p.Talent[4]),toughness:30,
        hitShares:ROSTER_DATA[1314].hits['Avatar_Jade_00_Passive_Phase02_01']}),
    };
  },
  // 大黑塔：Skill01 1 段；Skill02/21 = 3 次「目标+相邻」；Skill03 1 段；强化战技 140109 收尾 0.5。
  1401:(p,d,{eidolon=0}={})=>{
    void eidolon;
    const E=rowFor(1401,140102,140109,p.BPSkill[0]);
    return {
      basic:basic(p,d,{terms:atk(p.Normal[0])}),
      skill:skill(p,d,{target:'blast',terms:[...atk(p.BPSkill[0]),{...atk(p.BPSkill[0])[0],target:'adjacent'}],
        repeatCount:3,hitShares:[1],toughness:45,adjacentToughness:30}),
      ultimate:ultimate(p,d,{target:'all',terms:atk(p.Ultra[0]),toughness:60}),
      enhancedSkill:{name:'我有一个大胆的想法',type:'BPSkill',element:'Ice',target:'blast',
        terms:[...atk(E[0]),{...atk(E[0])[0],target:'adjacent'}],repeatCount:3,hitShares:[1],
        toughness:60,adjacentToughness:30,energyGain:30,spCost:1,spGain:0,aoe:E[2]},
    };
  },
  // 那刻夏：Skill01/03 各 1 段；Skill02 主 1 段 + 4 次弹射（140502[1]=4）。
  1405:(p,d,{eidolon=0}={})=>{
    void eidolon;
    return {
      basic:basic(p,d,{terms:atk(p.Normal[0])}),
      skill:skill(p,d,{terms:atk(p.BPSkill[0]),bounceCount:p.BPSkill[1],bounceTerms:atk(p.BPSkill[0]),
        bounceToughness:30,toughness:30}),
      ultimate:ultimate(p,d,{target:'all',terms:atk(p.Ultra[0]),toughness:60}),
    };
  },
  // 姬子•启行：Skill01 1 段；Skill31 1 段；助战技 151022 队友使用版 AoE 2.0 + 3 次 0.3（spBase 18）。
  1510:(p,d,{eidolon=0}={})=>{
    const A=HIMEKO_ASSIST;
    const beam=rowFor(1510,151003,151008,p.Ultra[0]);
    const pulse=rowFor(1510,151003,151009,p.Ultra[0]);
    // 最后一击对应内部技能 151014（simpleDesc 与 151003 #6/#7 一致：3 次随机单体），
    // 其倍率 / 段数 / 削韧一并从 151014 的同等级行与 stance 读取，避免与终结技主表脱钩。
    const fin=rowFor(1510,151003,151014,p.Ultra[0]);
    const finStance=ROSTER_DATA[1510].skills?.[151014]?.stance?.[0]??0;
    return {
      basic:basic(p,d,{terms:atk(p.Normal[0])}),
      skill:skill(p,d,{target:'self',terms:[],toughness:0}),
      // 终结技负责展开拓星者；实际伤害由六次可选光束/脉冲及自动终击分别结算。
      ultimate:ultimate(p,d,{target:'self',terms:[],toughness:0}),
      beam:{name:ROSTER_DATA[1510].skills[151008].name,type:'Ultra',element:'Fire',target:'all',terms:atk(beam[0]),hitShares:[1],toughness:6,energyGain:0,spCost:0,spGain:0,persistWave:true},
      pulse:{name:ROSTER_DATA[1510].skills[151009].name,type:'Ultra',element:'Fire',target:'all',terms:atk(pulse[0]),hitShares:[1],toughness:6,energyGain:0,spCost:0,spGain:0,persistWave:true},
      finalBlow:{name:'拓星者 · 最后一击',type:'Ultra',element:'Fire',target:'single',
        terms:atk(fin[1]??p.Ultra[6]),hitShares:[1],
        bounceCount:Math.max(0,(fin[0]??p.Ultra[5])-1),bounceTerms:atk(fin[1]??p.Ultra[6]),
        toughness:finStance,bounceToughness:finStance,energyGain:0,spCost:0,spGain:0,persistWave:true},
      assist:{name:'开拓，与你同行',type:'Assist',element:'Fire',target:'all',
        terms:atk(A[3]),hitShares:[1],toughness:15,energyGain:18,spCost:0,spGain:0,
        bounceCount:A[4]+(eidolon>=1?(d.ranks?.[1]?.[2]??1):0),bounceTerms:atk(A[5]),bounceToughness:0,bounceEnergy:0},
      // 同行协议：151025 / 151026 是助战技的协议变体（同一段数/倍率，附加协议状态）。
      assistJuecai:{name:'同行协议：裁决',type:'Assist',element:'Fire',target:'all',protocol:'juecai',
        terms:atk(A[3]),hitShares:[1],toughness:15,energyGain:0,spCost:0,spGain:0,
        bounceCount:A[4]+(eidolon>=1?(d.ranks?.[1]?.[2]??1):0),bounceTerms:atk(A[5]),bounceToughness:0,bounceEnergy:0},
      assistJianpo:{name:'同行协议：歼破',type:'Assist',element:'Fire',target:'all',protocol:'jianpo',
        terms:atk(A[3]),hitShares:[1],toughness:15,energyGain:0,spCost:0,spGain:0,
        bounceCount:A[4]+(eidolon>=1?(d.ranks?.[1]?.[2]??1):0),bounceTerms:atk(A[5]),bounceToughness:0,bounceEnergy:0},
      // 协议触发的无消耗助战技：不恢复能量，也不计入歼破充能。
      assistFree:{name:'同行协议 · 无消耗助战技',type:'Assist',element:'Fire',target:'all',freeAssist:true,
        terms:atk(A[3]),hitShares:[1],toughness:15,energyGain:0,spCost:0,spGain:0,
        bounceCount:A[4]+(eidolon>=1?(d.ranks?.[1]?.[2]??1):0),bounceTerms:atk(A[5]),bounceToughness:0,bounceEnergy:0},
    };
  },
  // 远坂凛：Skill01/02 各 1 段；Skill03 主 1 段 + 其他 1 段；强化战技 150809 AoE 2 段 + N 次弹射。
  1508:(p,d,{eidolon=0}={})=>{
    void eidolon;
    const E=rowFor(1508,150802,150809,p.BPSkill[0]);
    const T=rowFor(1508,150804,150805,p.Talent[2]);
    return {
      basic:basic(p,d,{terms:atk(p.Normal[0])}),
      skill:skill(p,d,{terms:atk(p.BPSkill[0]),toughness:60}),
      ultimate:ultimate(p,d,{target:'blast',terms:[...atk(p.Ultra[0]),{...atk(p.Ultra[1])[0],target:'adjacent'}],
        toughness:90,adjacentToughness:60}),
      enhancedSkill:{name:'第二魔法实验',type:'BPSkill',element:'Quantum',target:'all',
        terms:atk(E[0]),hitShares:[.5,.5],toughness:60,energyGain:30,spCost:0,spGain:0,
        bounceCount:0,bounceTerms:atk(E[2]),bounceToughness:6,bounceEnergy:0},
      // 自在远坂流：远坂凛 AoE 3.75（Insert_Phase02 5 段 0.2）。
      followup:talentAction(p,d,{target:'all',terms:atk(T[0]),toughness:60,
        hitShares:ROSTER_DATA[1508].hits['Avatar_TohsakaRin_00_Insert_Phase02']}),
    };
  },
};

export {factories,actions};
