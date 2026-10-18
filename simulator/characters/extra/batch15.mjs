// DeepSeek batch-15：6 名「欢愉 / Elation」命途角色（4.6 固定数据）。
//
// 数值索引逐条核对 `_data_cache/hsr_core.json` 的 desc `#n` 与 `params[等级].param_list`；
// 段数 / 时序 / 触发窗口取自 `_data_cache/strict_research/Avatar_<Name>_00_Ability.json`：
//   1501 火花          Avatar_Sparxie_00_Ability.json
//   1502 爻光          Avatar_YaoGuang_00_Ability.json
//   1503 真珠          Avatar_Pearl_00_Ability.json —— 固定提交不存在（blocked_source，见缺口 4）
//   1505 绯英          Avatar_Evanescia_00_Ability.json
//   1506 银狼LV.999    Avatar_SilverWolf999_00_Ability.json
//   1513 砂金•戏浪     Avatar_AventurineW_00_Ability.json
// 固定提交 312b4597691e0a29cf9828a15b592757dba86949（roster-evidence.json 记录同一 sha256）。
//
// 行迹索引：`u.kit.trace` 以 point id 的**末位数字**为键（point06→1、point07→2、point08→3），
// 与本批 6 名角色的 id 1501101/1501102/1501103 … 一致；下面一律用 trace(u,1/2/3)。
//
// ── 共享引擎已接入的欢愉伤害公式 ────────────────────────────────────────────
// ElationDamage 走 engine.mjs 的 elationBase：角色等级基础值 ×（1+欢愉度）×笑点系数，
// 再按通用暴击、防御、抗性和易伤结算；不吃攻击力、元素增伤或一般增伤。该合同由
//    角色技能段数/动作时序、阿哈共享行动条与好活当赏的独立到期事件仍须分别按来源验收。
// 1503 真珠：`Avatar_Pearl_00_Ability.json` 在固定提交不存在——`AvatarConfig.json` 只登记了
//    `Avatar_Pearl_00_Config.json` 这条路径，而 `_data_cache/strict_research/` 里连
//    `Avatar_Pearl_00_Config.json` 也没有缓存。技能数值读取公开 4.6 参数表；受击抵御池依描述文本建模，
//    但分段时序及内部 Ability 条件仍未获得原始脚本核验，严格模式继续披露来源缺口。
// 5) 1502 爻光的原始脚本自身没有任何 AttackData；普攻伤害节点在 `GlobalTemplates`
//    1502_Skill01_Attack / 1502_Skill01_Attack_End（各 1 主 + 1 相邻，HitSplitRatio 0.25），
//    Ability 里 include 4 次 → basic 取 [.25,.25,.25,.25]（脚本级证据；`ROSTER_DATA[1502].hits`
//    为空，因为编译脚本只遍历 Ability.OnStart）。
import {atk,def,basic,skill,ultimate,talentAction,elementOf} from '../actions.mjs';
import {ROSTER_DATA} from '../../roster-data.mjs';

export const IDS=[1501,1502,1503,1505,1506,1513];

// ───────────────────────────── 来源访问器 ─────────────────────────────
const plist=(d,id,level)=>{const s=d?.skills?.[id];if(!s||level==null)return null;return s.params?.[String(level)]?.param_list??null;};
const sname=(d,id)=>d?.skills?.[id]?.name??String(id);
const isElationPath=u=>u?.path==='欢愉'||u?.path==='Elation';
// 秘技削韧：优先取【秘技】技能自身 stance（1505=60、1513=60）；秘技为 Impair / Support（stance 0）时
// 使用同一角色【秘技攻击 MazeNormal】的 stance —— `_data_cache/hsr_core.json` 中
// 150106 / 150206 / 150306 / 150506 / 150606 / 151306（type='MazeNormal'）的 stance 均为 [30,0,0]。
// MazeNormal 没有被 `_scripts/build_roster_evidence.py` 编进 ROSTER_DATA（它只收
// Normal/BPSkill/Ultra/Talent/Maze），所以这里以一张已逐条核对来源的常量表落地；
// `_scripts/test_deepseek_batch15.mjs` 会直接回读 hsr_core 校验这张表。
const MAZE_NORMAL_STANCE={1501:30,1502:30,1503:30,1505:30,1506:30,1513:30};
const mazeStance=id=>{
  const maze=Object.values(ROSTER_DATA[id]?.skills??{}).find(x=>x.type==='Maze');
  const v=maze?.stance?.[0]??0;
  return v>0?v:(MAZE_NORMAL_STANCE[id]??0);
};

// ───────────────────────────── 欢愉技（ElationDamage）─────────────────────────────
// 技能 id / 倍率取自 `ROSTER_DATA[id].skills[...]`（= 4.6 AvatarSkillConfig 的 ParamList），
// 目标结构取自原始脚本 ElationSkill_* / Skill04_Phase02 节点；desc 的 #n 即 param_list[n-1]。
// 欢愉技等级：基础满级 10，E3 / E5 各 +1（desc「欢愉技等级+1，最多不超过15级」），上限 15。
// 欢愉伤害基式由共享 engine.mjs 的 elationBase 结算；本工厂只装配各角色倍率、段数与命中结构。
const elationLevel=(eidolon=0)=>Math.min(15,10+(eidolon>=3?1:0)+(eidolon>=5?1:0));
const elationRow=(d,sid,lv)=>d.skills?.[String(sid)]?.params?.[String(lv)]?.param_list??null;
const elationAction=(id,d,{eidolon=0}={})=>{
  // 1506 的伤害型欢愉技是 150621（150620 为 Enhance，只加【隐藏分】）。
  const sid=id===1506?150621:String(id)+'20';
  const E=elationRow(d,sid,elationLevel(eidolon))??[];
  const stance=d.skills?.[String(sid)]?.stance??[0,0,0];
  const base={name:sname(d,sid),type:'ElationDamage',punchlineSource:'laughter',element:elementOf(d.element),target:'all',terms:[],
    hitShares:[1],energyGain:0,spCost:0,spGain:0,toughness:0};
  if(id===1501)return {...base,terms:atk(E[1]),toughness:stance[1],bounceCount:E[2],bounceTerms:atk(E[0]),bounceToughness:stance[0]};
  if(id===1502)return {...base,terms:atk(E[1]),toughness:stance[1],bounceCount:E[4],bounceTerms:atk(E[5]),bounceToughness:0,
    effects:[{type:'buff',name:'凶星低语 · 受到的伤害提高',key:'vuln',value:E[2],duration:E[3],target:'enemies',debuff:true}]};
  if(id===1505)return {...base,terms:atk(E[1]),toughness:stance[1]};
  if(id===1506)return {...base,target:'single',bounceCount:E[1],bounceTerms:atk(E[0]),bounceToughness:stance[0],
    punchlineMultiplier:eidolon>=4?1+(d.ranks?.[4]?.[0]??5):1}; // Rank04 adds 5× current points to the base count (total 6×).
  if(id===1513)return {...base,terms:atk(E[0]),toughness:stance[1],bounceCount:E[1],bounceTerms:atk(E[2]),bounceToughness:0};
  return base;   // 1503：原始 Ability 脚本缺失，动作倍率仍无法从脚本核验。
};

// ───────────────────────────── 共享语义助手 ─────────────────────────────
// 一次构造、按 api 绑定（模块工厂调用 H(api)）。
function H(api){
  const {live,allies,record,buff,energy,combatPanel,damageTo}=api;
  // 笑点：`b.laughter[side]` 就是引擎里 `laughter` 动作效果的存储，这里只补 record。
  function gainLaughter(b,u,n,reason){
    if(!n)return 0;
    b.laughter[u.side]=(b.laughter[u.side]??0)+n;
    record(b,'resource',u,{name:'累计获得笑点',value:b.laughter[u.side],reason:reason??'笑点'});
    return b.laughter[u.side];
  }
  const laughterOf=(b,u)=>b.laughter?.[u.side]??0;
  const countedAhaLaughter=(b,u,kind)=>kind==='aha'&&b.ahaInstant
    ?(b.ahaInstant.natural?(b.laughter?.[u.side]??0):(b.ahaInstant.fixedPunchline??0))
    :(b.laughter?.[u.side]??0);
  const punchOf=to=>to?.resources?.['好活当赏']??0;
  const participantId=u=>u?.participantId??({1503:104,1502:116,8009:120,8010:120,1501:144,1505:146,1513:156,1506:999}[u?.kit?.characterId]);
  // 每次获得的【好活当赏】单独计时；系统持续 2 回合，个别角色会延长这批新获得的层数。
  function punchDurationFor(to,base){
    const cid=to.kit?.characterId;
    if(cid===1503)return null;
    if(base==null)return null;
    let bonus=0;
    if(cid===1502)bonus+=to.kit.trace?.['3']?.[1]??0;
    if(cid===1505&&(to.kit.eidolon??0)>=6)bonus+=1;
    if(cid===1513)bonus+=1;
    return Math.max(1,base+bonus);
  }
  function grantPunch(b,u,to,n,duration=2){
    if(!to||!live(to)||!(n>0))return 0;
    const addBatch=(recipient,amount,source=u)=>{
      if(!(amount>0))return;
      // 150304 天赋：真珠的【好活当赏】持有上限为 #3（4.6 = 50 点）；超出上限的部分不发放，
      // 也不能写成会被后续到期事件重复转化的批次。
      const cap=recipient.kit?.characterId===1503?(recipient.kit.params?.Talent?.[2]??Infinity):Infinity;
      const current=punchOf(recipient),next=Math.min(cap,current+amount),granted=next-current;
      if(!(granted>0))return;
      const seq=(recipient.resources['好活当赏批次序号']??0)+1;recipient.resources['好活当赏批次序号']=seq;
      recipient.resources['好活当赏']=next;
      record(b,'resource',source,{target:recipient.id,name:'好活当赏',value:next});
      buff(b,source,recipient,'好活当赏','marker',0,punchDurationFor(recipient,duration),{id:'punchline:'+recipient.id+':'+seq,tag:'punchline',stacks:granted});
    };
    // The source fires whenever a lower-index teammate gains Banger, not only after a natural Aha.
    const evanescia=b.units.find(t=>t.side===to.side&&t.kit?.characterId===1505&&live(t));
    const point06=evanescia?.kit?.trace?.['1']?.[4]??0;
    const fromIndex=participantId(to),evanesciaIndex=participantId(evanescia);
    if(evanescia&&to!==evanescia&&point06>0&&Number.isFinite(fromIndex)&&Number.isFinite(evanesciaIndex)&&fromIndex<evanesciaIndex){
      const e2=evanescia.kit.eidolon>=2?(evanescia.kit.ranks?.[2]?.[1]??0):0;
      // 先按接收者的持有上限（150304 #3）算出实际可发放量，再据此计算瞰众乐转化；
      // 被上限拦下的请求不能凭空变成绯英的好活当赏。
      const cap=to.kit?.characterId===1503?(to.kit.params?.Talent?.[2]??Infinity):Infinity;
      const accepted=Math.min(n,Math.max(0,cap-punchOf(to)));
      const converted=Math.min(accepted,accepted*point06*(1+e2));
      addBatch(to,accepted-converted);
      addBatch(evanescia,converted,evanescia);
      record(b,'mechanic',evanescia,{name:'瞰众乐 · 好活当赏发放时转化',from:to.id,amount:accepted,requested:n,converted,participantId:fromIndex});
      return punchOf(to);
    }
    addBatch(to,n);
    return to.resources['好活当赏'];
  }
  const hasPunch=u=>punchOf(u)>0;
  // 固定计入笑点的阿哈额外回合：不消费共享笑点，将所有欢愉角色按参演顺序排入同一瞬间。
  function ahaMoment(b,u,counted,label){
    const actors=allies(b,u).filter(to=>live(to)&&isElationPath(to)&&to.actions?.elation)
      .sort((a,c)=>(a.participantId??a.order)-(c.participantId??c.order));
    const id=(b.ahaInstantSequence??0)+1;b.ahaInstantSequence=id;
    b.ahaInstant={id,sourceId:u.id,fixedPunchline:counted,natural:false,ending:false,participants:actors.map(x=>x.id),completed:[],deferred:[]};
    b.ahaCount=(b.ahaCount??0)+1;b.ahaCounted=counted;
    for(const to of actors){
      to.buffs=to.buffs.filter(e=>!e.control);
      to.dots=to.dots.filter(e=>!e.control);
    }
    b.queue.unshift(...actors.map(to=>({actor:to.id,key:'elation',kind:'aha',ahaInstantId:id})));
    record(b,'mechanic',u,{name:'阿哈额外回合',counted,label:label??'',participants:actors.map(x=>x.id),consumesSharedPunchline:false});
  }
  function onAhaEnd(b,u,fn){
    if(b.ahaInstant&&!b.ahaInstant.ending)return false;
    const seen=u.resources['阿哈已结算']??0;
    if(!b.ahaCount||seen===b.ahaCount)return false;
    u.resources['阿哈已结算']=b.ahaCount;
    if(fn){if(b.ahaInstant?.ending)b.ahaInstant.deferred.push(()=>fn(b.ahaCounted??0));else fn(b.ahaCounted??0);}
    return true;
  }
  // 欢愉追加伤害使用共享 ElationDamage 公式。
  function hitElation(b,u,to,o){
    if(!to||!live(to))return;
    damageTo(b,u,to,{name:o.name,type:'ElationDamage',punchlineSource:'certifiedBanger',punchlineFloor:o.punchlineFloor,
      ...(o.punchlineFrom?{punchlineFrom:o.punchlineFrom.id}:{}),
      // 角色文案里的「本次造成的欢愉伤害固定计入 N 点好活当赏」不走持有量，直接覆盖计入值。
      ...(o.punchlineOverride!=null?{punchlineOverride:o.punchlineOverride}:{}),
      element:o.element??u.element,terms:atk(o.mult),toughness:0},1,o.role??'primary','elation');
  }
  const elationOf=u=>combatPanel(u).elation??0;
  function adjacentOf(b,u,to){
    const pool=b.units.filter(t=>t.side!==u.side),at=pool.findIndex(t=>t.id===to.id);
    return [pool[at-1],pool[at+1]].filter(t=>t&&live(t));
  }
  // 「我方队伍中」按编队角色计算；阵亡队友仍属于队伍，不能改变欢愉数量档位。
  const elationCount=(b,u)=>b.units.filter(to=>to.side===u.side&&isElationPath(to)).length;
  return {gainLaughter,laughterOf,countedAhaLaughter,punchOf,grantPunch,hasPunch,ahaMoment,onAhaEnd,hitElation,elationOf,adjacentOf,elationCount};
}

// ───────────────────────────── 动作表 ─────────────────────────────
// 段数（原始脚本 → hitShares 归一）：
//   1501 basic Skill01_Phase02 1 段；enhancedBasic Skill11_Phase02 4 段（两条 Normal 缺省 1，等分归一）；
//        ultimate Skill03_Phase02 1 段；秘技 SkillMazeInLevel 1 段。
//   1502 basic GlobalTemplates 1502_Skill01_Attack(_End)：主/相邻各 HitSplitRatio 0.25，include 4 次 → 4 段。
//   1503 各动作尚未从原始 Ability 脚本核对段数（strict gate 保留）。
//   1505 basic 1 段；skill Skill02_Phase02 主 4 段（0.2/0.2/0.2/0.4）+ 相邻 1 段；
//        ultimate Skill03_Phase02 AllEnemy 1 段 + 弹射（#2=5 次，行迹追加）；
//        followup Avatar_EvanesciaCombat_00_Insert_Phase02 AllEnemy 1 段（+ 1 段欢愉伤害）。
//   1506 basic Skill01_Phase02 1 段；skill Skill02_Phase02 AllEnemy 1 段；
//        enhancedBasic Skill11 共 #3=100 段弹射 + Skill11_End_Phase02 收尾。
//   1513 basic Skill01_Phase02 4 段（HitSplitRatio 0.25×4）；skill / ultimate 各 1 段。
const actions={
  // ── 1501 火花（火 · 欢愉 · 能量 160）────────────────────────────────────────
  1501:(p,d,{eidolon=0}={})=>{
    void eidolon;
    const e=plist(d,150108,6)??[1,.5];
    return {
      basic:basic(p,d,{terms:atk(p.Normal[0]),hitShares:[1]}),
      // 150102【尖叫！火花花连线中】tag=Enhance、无伤害；desc 明示「施放本技能不视为使用战技」。
      skill:skill(p,d,{target:'self',terms:[],energyGain:0}),
      // 150103：伤害倍率 = #3*欢愉度 + #2（由 prepare 注入欢愉度），1 段。
      ultimate:ultimate(p,d,{target:'all',terms:atk(p.Ultra[1]),toughness:60,hitShares:[1]}),
      // 150108【百花齐放，胜者独享！】：主 #1 + 相邻 #2，4 段。
      enhancedBasic:{name:sname(d,150108),type:'Normal',element:elementOf(d.element),target:'blast',
        terms:[...atk(e[0]),{...atk(e[1])[0],target:'adjacent'}],hitShares:[.25,.25,.25,.25],
        energyGain:d.skills[150108]?.spBase??0,spCost:0,spGain:1,toughness:30,adjacentToughness:15},
      elation:elationAction(1501,d,{eidolon}),
    };
  },

  // ── 1502 爻光（物理 · 欢愉 · 能量 180）─────────────────────────────────────
  1502:(p,d,{eidolon=0}={})=>{
    void eidolon;
    return {
      // 150201：扩散，主 #1=0.9 + 相邻 #2=0.3，4 段；spBase=30（desc「普攻恢复的能量提高至 30 点」）。
      basic:basic(p,d,{target:'blast',terms:[...atk(p.Normal[0]),{...atk(p.Normal[1])[0],target:'adjacent'}],
        hitShares:[.25,.25,.25,.25],toughness:30,adjacentToughness:15,energyGain:30}),
      // 150202：展开结界，无伤害。
      skill:skill(p,d,{target:'self',terms:[]}),
      // 150203：纯辅助（全体抗穿 + 阿哈额外回合），无伤害。
      ultimate:ultimate(p,d,{target:'allies',terms:[],toughness:0}),
      elation:elationAction(1502,d,{eidolon}),
    };
  },

  // ── 1503 真珠（冰 · 欢愉 · 能量 180）—— 动作段数未从原始脚本核验 ──
  1503:(p,d,{eidolon=0}={})=>{
    void eidolon;
    const e=plist(d,150308,6)??[1,.08,1,160,.15];
    return {
      // 150301：按防御力结算（desc #1=90% 防御力）。
      basic:basic(p,d,{terms:def(p.Normal[0]),hitShares:[1]}),
      skill:skill(p,d,{target:'allies',terms:[]}),
      ultimate:ultimate(p,d,{target:'ally',terms:[],toughness:0}),
      // 150308【行笔，幻造星月】：对敌方全体防御力倍率伤害（美学底本为欢愉命途时的强化普攻）。
      enhancedBasic:{name:sname(d,150308),type:'Normal',element:elementOf(d.element),target:'all',
        terms:def(e[0]),hitShares:[1],energyGain:d.skills[150308]?.spBase??0,spCost:0,spGain:1,toughness:90},
      elation:elationAction(1503,d,{eidolon}),
    };
  },

  // ── 1505 绯英（物理 · 欢愉 · 能量 480）─────────────────────────────────────
  1505:(p,d,{eidolon=0}={})=>{
    void eidolon;
    return {
      basic:basic(p,d,{terms:atk(p.Normal[0]),hitShares:[1]}),
      // 150502：扩散主 #2=3.0、相邻 #3=1.5，主目标 4 段（0.2/0.2/0.2/0.4）。
      skill:skill(p,d,{target:'blast',terms:[...atk(p.BPSkill[1]),{...atk(p.BPSkill[2])[0],target:'adjacent'}],
        hitShares:[.2,.2,.2,.4],toughness:60,adjacentToughness:30}),
      // 150503：全体 #1=1.6，随后 #2=5 次随机单体 #3=1.2（行迹「瞰众乐」追加弹射）。
      // 5 次随机单体段在 Avatar_Evanescia_00_Skill03_Phase02 里用 StanceValue 动态哈希 1659254037，
      // 与主段 1182064154 分列 show_stance_list 的 [0]/[1]；150503.stance=[15,60,0] → 每段弹射削韧 15。
      ultimate:ultimate(p,d,{target:'all',terms:atk(p.Ultra[0]),toughness:60,hitShares:[1],
        bounceCount:p.Ultra[1],bounceTerms:atk(p.Ultra[2]),bounceToughness:d.skills['150503'].stance?.[0]??0}),
      // 【狐狸老师】追加攻击：全体 #1=1.0 攻击力物理伤害（欢愉伤害在 after 里结算）。
      followup:talentAction(p,d,{target:'all',terms:atk(p.Talent[0]),toughness:30,energyGain:0,hitShares:[1]}),
      elation:elationAction(1505,d,{eidolon}),
    };
  },

  // ── 1506 银狼LV.999（虚数 · 欢愉 · 能量 60）───────────────────────────────
  1506:(p,d,{eidolon=0}={})=>{
    void eidolon;
    const e=plist(d,150608,6)??[2.4,0,100,1,3,60,2,.15];
    const seg=e[0]/Math.max(1,e[2]);
    return {
      // 150601：spBase=null → 不回能（能量即【隐藏分】，仅由笑点转化）。
      basic:basic(p,d,{terms:atk(p.Normal[0]),hitShares:[1],energyGain:0}),
      // 150602：全体 #1=1.6，获得 #2=5 个笑点。
      skill:skill(p,d,{terms:atk(p.BPSkill[0]),target:'all',toughness:30,energyGain:0,hitShares:[1]}),
      // 150603：Enhance，进入【无敌玩家】并行动提前 100%，无伤害。
      ultimate:ultimate(p,d,{target:'self',terms:[],toughness:0,energyGain:0}),
      // 150608【狼尊时刻】：#1=2.4 总倍率均分为 #3=100 段弹射。
      enhancedBasic:{name:sname(d,150608),type:'Normal',element:elementOf(d.element),target:'single',
        terms:atk(seg),hitShares:[1],bounceCount:Math.max(0,e[2]-1),bounceTerms:atk(seg),
        bounceToughness:30/e[2],energyGain:0,spCost:0,spGain:0,toughness:30/e[2]},
      elation:elationAction(1506,d,{eidolon}),
    };
  },

  // ── 1513 砂金•戏浪（量子 · 欢愉 · 能量 130）───────────────────────────────
  1513:(p,d,{eidolon=0}={})=>{
    void eidolon;
    return {
      // 151301：HitSplitRatio 0.25×4。
      basic:basic(p,d,{terms:atk(p.Normal[0]),hitShares:[.25,.25,.25,.25],toughness:30}),
      // 151302：全体 #1=2.4，获得 #2=4 笑点与 #3=4 热意。
      skill:skill(p,d,{terms:atk(p.BPSkill[0]),target:'all',toughness:30,hitShares:[1]}),
      // 151303：全体 #1=4.0，获得 #2=8 热意与 #3=6 笑点，自身速度 +#4 持续 #5 回合。
      ultimate:ultimate(p,d,{terms:atk(p.Ultra[0]),target:'all',toughness:60,hitShares:[1]}),
      elation:elationAction(1513,d,{eidolon}),
      // 热意阈值触发的【举杯】是角色自身插入动作（InsertElationSkillSave），
      // 不是全队阿哈额外回合；单独动作键便于固定计入 #5=20 笑点且不误用 All in。
      elationHeat:elationAction(1513,d,{eidolon}),
    };
  },
};

// ───────────────────────────── 角色模块 ─────────────────────────────
const factories={

  // ═══════════ 1501 火花（Avatar_Sparxie_00_Ability.json）═══════════
  //   desc 索引：普攻[1]；战技 150102[1=互动陷阱上限 20]；终结 150103[1=2笑点,2=0.5,3=0.6]；
  //   天赋 150104[1=0.2,2=0.48,3=0.4,4=0.2]；秘技 150107[1=2战技点,2=0.5,3=10秒]；
  //   强化普攻 150108[1=1.0,2=0.5]；互动陷阱 150109[1=2战技点,2=1笑点,3=2笑点,4=0.2,5=0.1]
  //   行迹 1=point06[2000,100,0.05,0.8] 2=point07[2,4,8,1,1,4] 3=point08[0.08,0.8]
  //   星魂 E1[5,0.015,0.15] E2[2,0.1,2,4] E4[5,0.36,3] E6[1,40,0.2]
  1501:function(api){
      const {live,enemies,rank,trace,buff,resource,damageTo,record,sp}=api;
    const h=H(api);
    const d=ROSTER_DATA[1501];
    // E2 的额外回合是 TurnInsertAction，没有动作类型限制；允许策略选择普攻/战技。
    const extraTurnKey=u=>['basic','skill'].includes(u.policy?.extraTurnKey)?u.policy.extraTurnKey:'basic';
    const enhOf=u=>plist(d,150108,u.kit.skillLevels?.Normal)??plist(d,150108,6)??[1,.5];
    const trapOf=u=>plist(d,150109,u.kit.skillLevels?.BPSkill)??plist(d,150109,10)??[2,1,2,.2,.1];
    const connected=u=>(u.resources['直播连线']??0)>0;
    const traps=u=>u.resources['互动陷阱']??0;
    // 互动陷阱的随机礼物（150109 #1=2 战技点 + #3=2 笑点 / #2=1 笑点）。
    function gift(b,u,T){
      // 150109 礼包状态机：小奖后若大奖概率仍 >0，下一次强制大奖；
      // 大奖/小奖各消耗一次对应概率，二者耗尽后重置。基础概率的原始动态哈希未解析，暂按 50/50。
      const minor=u.resources['互动陷阱小奖数']??0,grandChance=u.resources['大奖概率']??1,smallChance=u.resources['小奖概率']??1;
      const grand=minor>=1&&grandChance>0?true:b.random()<.5;
      let nextGrand=grandChance,nextSmall=smallChance,nextMinor=minor;
      if(grand){h.gainLaughter(b,u,T[2],'互动陷阱 · 红红火火');sp(b,u,T[0],'互动陷阱 · 红红火火');nextMinor=0;nextGrand=Math.max(0,grandChance-1);}
      else{h.gainLaughter(b,u,T[1],'互动陷阱 · 恍恍惚惚');nextMinor=minor+1;nextSmall=Math.max(0,smallChance-1);}
      if(nextGrand<=0&&nextSmall<=0){nextGrand=1;nextSmall=1;}
      resource(b,u,'互动陷阱小奖数',nextMinor);resource(b,u,'大奖概率',nextGrand);resource(b,u,'小奖概率',nextSmall);
      record(b,'mechanic',u,{name:'互动陷阱 · 礼物',grand,nextGrand,nextSmall,nextMinor});
    }
    return {
      start(b,u){resource(b,u,'直播连线',0);resource(b,u,'互动陷阱',0);resource(b,u,'爆点',0);resource(b,u,'互动陷阱小奖数',0);resource(b,u,'大奖概率',1);resource(b,u,'小奖概率',1);},
      waveStart(b,u){
        const pending=u.resources['火花 E2待插入回合']??0;
        if(pending>0&&enemies(b,u).some(live)){
          resource(b,u,'火花 E2待插入回合',0);
          b.queue.unshift(...Array.from({length:pending},()=>({actor:u.id,key:extraTurnKey(u),kind:'extra'})));
          record(b,'mechanic',u,{name:'火花 E2 · 新波次恢复暂存额外回合',count:pending});
        }
      },
      // 终结技倍率 = #3*欢愉度 + #2（desc「等同于火花（#3*欢愉度+#2）攻击力」）。
      // 直播连线期间普攻替换为 150108，并按互动陷阱次数提高主/相邻倍率（150109 #4/#5）。
      prepare(b,u,key,kind,a){
        if(kind==='technique'||kind==='copy')return a;
        // E6 每计入 1 个笑点额外增加 1 次欢愉技伤害，最多 40 次；固定阿哈回合只按固定计入值计算。
        if(key==='elation'&&rank(u,6)){
          const per=rank(u,6,0),cap=rank(u,6,1),counted=h.countedAhaLaughter(b,u,kind);
          const extra=per>0?Math.min(cap,Math.floor(counted/per)):0;
          return {...a,bounceCount:(a.bounceCount??0)+extra};
        }
        if(key==='ultimate'){
          const e=h.elationOf(u);
          return {...a,terms:atk(u.kit.params.Ultra[1]+u.kit.params.Ultra[2]*e)};
        }
        if(key==='basic'&&connected(u)){
          const E=enhOf(u),T=trapOf(u),n=traps(u);
          return {...a,name:sname(d,150108),type:'Normal',target:'blast',hitShares:[.25,.25,.25,.25],
            toughness:30,adjacentToughness:15,energyGain:d.skills[150108]?.spBase??0,spGain:1,
            terms:[...atk(E[0]+T[3]*n),{...atk(E[1]+T[4]*n)[0],target:'adjacent'}]};
        }
        return a;
      },
      // 秘技 150107：进入战斗后对敌方全体造成 #2=50% 攻击力火伤，并恢复 #1=2 个战技点。
      entry(b,u){
        const P=u.kit.params;
        for(const to of enemies(b,u))damageTo(b,u,to,{name:'流量变现',type:'Maze',element:'Fire',
          terms:atk(P.Maze[1]),toughness:mazeStance(1501)},1,'primary','technique');
        sp(b,u,P.Maze[0],'流量变现');
      },
      // 爆点抵扣战技点消耗（150120「消耗【爆点】视为消耗战技点」）→ E2 每消耗 1 点叠 1 层暴伤。
      before(b,u,actor,key,kind,a,selected){
        void selected;
        if(actor!==u||kind==='copy'||kind==='technique')return;
        // 引擎已按「SP + 爆点」拆分并扣除了爆点；这里只结算 E2 的暴伤叠层。
        const n=a.spSubstituteUsed??0;
        if(!n)return;
        if(rank(u,2))for(let i=0;i<n;i++)
          api.stacks(b,u,u,'火花 E2 · 暴击伤害','critDmg',rank(u,2,1),rank(u,2,3),rank(u,2,2),{id:u.id+':e2-crit'});
      },
      after(b,u,actor,key,kind,a,selected,hitTargets){
        void a;
        const P=u.kit.params,T=u.kit.trace;
        // 「阿哈时刻结束时」的 E1 / E2（缺口 3）。
        h.onAhaEnd(b,u,()=>{
          if(rank(u,1))h.gainLaughter(b,u,rank(u,1,0),'火花 E1 · 阿哈时刻结束');
          if(rank(u,2)){
            resource(b,u,'爆点',(u.resources['爆点']??0)+rank(u,2,0));
            const to=selected.find(live)??hitTargets.find(live)??enemies(b,u).find(live);
            if(enemies(b,u).some(live)){
              b.queue.push({actor:u.id,key:extraTurnKey(u),kind:'extra',targetId:to?.id,persistWave:true});
              record(b,'mechanic',u,{name:'火花 E2 · 阿哈时刻结束获得额外回合'});
            }else{
              resource(b,u,'火花 E2待插入回合',(u.resources['火花 E2待插入回合']??0)+1);
              record(b,'mechanic',u,{name:'火花 E2 · 敌方全灭，额外回合暂存至下波',count:u.resources['火花 E2待插入回合']});
            }
          }
        });
        if(actor!==u||kind==='technique')return;
        if(key==='elation'){
          // 150120 desc：欢愉技除了造成伤害，还使火花获得 #4 个【爆点】（可抵扣战技点消耗）。
          const row=elationRow(d,150120,elationLevel(u.kit.eidolon??0));
          const n=row?.[3]??0;
          if(n>0)resource(b,u,'爆点',(u.resources['爆点']??0)+n);
          return;
        }
        if(key==='skill'){
          // 150102：开启直播连线，本次技能内发动 1 次互动陷阱（上限 #1=20），并拾取一次礼物。
          resource(b,u,'直播连线',1);
          resource(b,u,'互动陷阱',Math.min(P.BPSkill[0],traps(u)+1));
          gift(b,u,trapOf(u));
          record(b,'mechanic',u,{name:'直播连线开启',traps:traps(u)});
          return;
        }
        if(key==='basic'){
          if(!connected(u))return;
          // 强化普攻（Skill11_Phase02）重置礼包的两项概率。
          resource(b,u,'大奖概率',1);resource(b,u,'小奖概率',1);
          // 「结算直播连线结果」：连线关闭，按已累计的互动陷阱结算天赋欢愉伤害。
          const n=traps(u);
          resource(b,u,'直播连线',0);resource(b,u,'互动陷阱',0);
          const to=selected[0];
          if(!to||!live(to))return;
          // 天赋整段以「火花持有【好活当赏】」为前提（含每发动 1 次互动陷阱的额外欢愉伤害）。
          if(h.hasPunch(u)){
            h.hitElation(b,u,to,{name:'幕后花手 · 单体',mult:P.Talent[2]});
            for(const adj of h.adjacentOf(b,u,to))h.hitElation(b,u,adj,{name:'幕后花手 · 相邻',mult:P.Talent[3]});
            const pool=hitTargets.filter(live);
            for(let i=0;i<n&&pool.length;i++)
              h.hitElation(b,u,pool[Math.floor(b.random()*pool.length)],{name:'幕后花手 · 互动陷阱',mult:P.Talent[0]});
          }
          return;
        }
        if(key==='ultimate'){
          h.gainLaughter(b,u,P.Ultra[0],'终结技');
          // 行迹 2=point07：按队伍欢愉命途数量追加笑点与爆点。
          if(T[2]){
            const n=Math.max(1,h.elationCount(b,u));
            const tier=Math.min(3,n)-1;
            h.gainLaughter(b,u,T[2][tier],'行迹 · 炫目！人设万花筒');
            resource(b,u,'爆点',(u.resources['爆点']??0)+T[2][3+tier]);
          }
          if(h.hasPunch(u))for(const to of hitTargets.filter(live))h.hitElation(b,u,to,{name:'幕后花手 · 终结技',mult:P.Talent[1]});
          if(rank(u,4)){
            h.gainLaughter(b,u,rank(u,4,0),'火花 E4');
            buff(b,u,u,'火花 E4 · 欢愉度','elation',rank(u,4,1),rank(u,4,2),{id:u.id+':e4-elation'});
          }
          return;
        }
      },
      // 行迹 1=point06：攻击力高于 #1=2000 后，每超过 #2=100 点攻击力使自身欢愉度提高 #3=0.05，
      // 最多提高 #4=0.8（本行迹没有“达标即给基础值”的部分）。
      panel(b,u,to,out){
        if(to!==u)return;
        const T=trace(u,1);
        if(T)out.elation=(out.elation??0)+Math.min(T[3],Math.max(0,(out.atk??0)-T[0])/T[1]*T[2]);
      },
      modifiers(b,u,actor,to,a,kind){
        void a;void kind;
        const out={},T=trace(u,3);
        if(to.side===u.side)return out;
        // 行迹 3=point08：每 1 个笑点使我方全体暴击伤害 +8%，最多 80%。
        if(T&&actor.side===u.side)out.critDmg=(out.critDmg??0)+Math.min(T[1],h.laughterOf(b,u)*T[0]);
        // E1：每 1 个笑点使我方全体抗穿 +1.5%，最多 15%；E6：全属性抗穿 +20%。
        if(actor.side===u.side){
          if(rank(u,1))out.resPen=(out.resPen??0)+Math.min(rank(u,1,2),h.laughterOf(b,u)*rank(u,1,1));
          if(rank(u,6)&&actor===u)out.resPen=(out.resPen??0)+rank(u,6,2);
        }
        return out;
      },
    };
  },

  // ═══════════ 1502 爻光（Avatar_YaoGuang_00_Ability.json）═══════════
  //   desc 索引：普攻 150201[1=0.9,2=0.3]；战技 150202[1=3回合,2=0.2,3=3笑点]；
  //   终结 150203[1=5笑点,2=0.2,3=3回合,4=20固定计入笑点]；天赋 150204[1=0.2]；秘技 150207[1=8]
  //   行迹 1=point06[120,0.3,1,0.01,200] 2=point07[1,0.25,0.4,0.6] 3=point08[20,1]
  //   星魂 E1[0.2,40] E2[0.16,0.12] E4[1.5] E6[0.25,1]
  1502:function(api){
    const {live,allies,rank,trace,buff,resource,damageTo,record,combatPanel,sp}=api;
    const h=H(api);
    const FIELD='结界 · 十方光映';
    const field=u=>u.buffs.find(e=>e.tag==='ygField');
    const fired=(b,u)=>u.resources['大吉大利动作']===(b.activeAction?.sequence??-1);    // 【大吉大利】：不视为 1 次攻击 → 在 afterHit 内直接结算，不再触发 afterHit。
    function grigri(b,u,actor,to,a,times){
      const P=u.kit.params;
      const source=(combatPanel(actor).elation??0)>=(combatPanel(u).elation??0)?actor:u;
      // Passive_ToMember 的 OnListenBeforeHitAll：DamageTag_HongBao 的笑点基数
      // 固定读取 Caster（爻光）的 ElationEchoPoint，与攻击者是谁无关；欢愉度则取两者较高值。
      for(let i=0;i<times&&live(to);i++)h.hitElation(b,source,to,{name:'大吉大利',element:a?.element??actor.element??u.element,mult:P.Talent[0],punchlineFrom:u});
      record(b,'mechanic',u,{name:'大吉大利',target:to.id,times});
    }
    return {
      start(b,u){
        resource(b,u,'大吉大利动作',-2);
        // 秘技 150207：下一次战斗开始时自动触发 1 次战技，不消耗战技点（kind='technique' → spCost 归零）。
        if(u.kit.technique)b.queue.push({actor:u.id,key:'skill',kind:'technique',targetId:u.id});
      },
      prepare(b,u,key,kind,a){
        void b;void kind;
        if(key!=='elation'||u.characterId!==1502)return a;
        // E6：爻光自身欢愉技倍率提高原倍率 100%。
        const multiplier=rank(u,6)?1+rank(u,6,1):1;
        return multiplier===1?a:{...a,elationMultiplier:multiplier};
      },
      // 行迹 1=point06（速度→欢愉度）与 E2（结界期间速度 / 欢愉度）；结界给我方全体
      // 欢愉度 = **爻光欢愉度** × #2（动态换算；爻光自己用当前 out.elation，队友用爻光的
      // skipAuras 面板，`skipAuras` 分支避免嵌套时重复叠加光环）。
      panel(b,u,to,out,opts){
        const T=trace(u,1);
        if(to===u&&T)out.elation=(out.elation??0)+T[1]+Math.min(T[4],Math.max(0,(out.speed??0)-T[0])/T[2])*T[3];
        if(to.side!==u.side||!field(u)||opts?.skipAuras)return;
        const src=to===u?(out.elation??0):(combatPanel(u,{skipAuras:true}).elation??0);
        out.elation=(out.elation??0)+src*u.kit.params.BPSkill[1];
        if(rank(u,2)){
          out.speed+=(to.baseSpeed??to.panel.speed)*rank(u,2,1);
          out.elation=(out.elation??0)+rank(u,2,0);
        }
      },
      modifiers(b,u,actor,to,a,kind){
        void a;
        const out={},T=trace(u,2);
        if(to.side===u.side)return out;
        // 行迹 2=point07：自身暴击伤害 +60%。
        if(actor===u&&T)out.critDmg=(out.critDmg??0)+T[3];
        // E1：我方全体造成欢愉伤害时无视目标 20% 防御。
        if(kind==='elation'&&rank(u,1)&&actor.side===u.side)out.defIgnore=(out.defIgnore??0)+rank(u,1,0);
        // E6：我方全体欢愉伤害「增笑」25%。
        if(kind==='elation'&&rank(u,6)&&actor.side===u.side)out.elationBoost=(out.elationBoost??0)+rank(u,6,0);
        return out;
      },
      before(b,u,actor,key,kind,a,selected){
        void a;void selected;
        if(actor!==u||key!=='ultimate'||kind==='copy')return;
        const P=u.kit.params;
        for(const to of allies(b,u))buff(b,u,to,'霓裳铁羽 · 抗穿','resPen',P.Ultra[1],P.Ultra[2],{id:u.id+':yg-pen:'+to.id});
      },
      after(b,u,actor,key,kind,a,selected,hitTargets){
        void selected;
        h.onAhaEnd(b,u);
        // 在完整动作后从实际命中目标中随机选取，避免多段攻击固定触发首段目标。
        // Passive_ToMember 的 OnAfterAttack 只要求爻光持有 ElationEchoPoint，未排除欢愉伤害；
        // DoT / 间接附加伤害不是一次攻击，仍排除。
        if(h.hasPunch(u)&&actor.side===u.side&&!['dot','additional'].includes(kind)&&hitTargets?.length&&!fired(b,u)){
          u.resources['大吉大利动作']=b.activeAction?.sequence??-1;
          const pool=[...new Set(hitTargets)].filter(live);
          if(pool.length){const to=pool[Math.floor(b.random()*pool.length)];
            grigri(b,u,actor,to,a,(a?.spCost??0)>0?2:1);}
        }
        if(actor!==u||(kind==='technique'&&key!=='skill'))return;
        const P=u.kit.params;
        if(key==='elation'&&trace(u,2))sp(b,u,trace(u,2)[0],'爻光行迹 · 施放欢愉技');
        if(key==='skill'){
          if(kind==='copy')return;
          const had=!!field(u);                       // 结界已存在时，这次战技同样触发「施放战技后获得笑点」
          buff(b,u,u,FIELD,'marker',0,P.BPSkill[0],{id:u.id+':ygField',tag:'ygField',tickAt:'start'});
          record(b,'mechanic',u,{name:'展开结界',duration:P.BPSkill[0]});
          if(had)h.gainLaughter(b,u,P.BPSkill[2],'结界 · 施放战技');
          return;
        }
        if(key==='ultimate'&&kind!=='technique'){
          h.gainLaughter(b,u,P.Ultra[0],'终结技');
          // 阿哈立即获得 1 个固定计入 #4=20 笑点的额外回合（E1 提高至 #2=40）。
          h.ahaMoment(b,u,rank(u,1)?rank(u,1,1):P.Ultra[3],'爻光终结技');
          if(rank(u,4)&&b.ahaInstant)b.ahaInstant.elationMultiplier=rank(u,4,0);
          return;
        }
        // 结界持续期间，爻光施放普攻后获得 #3=3 个笑点。
        if(field(u)&&key==='basic')h.gainLaughter(b,u,P.BPSkill[2],'结界 · 施放普攻');
      },
      // 「阿哈时刻结束时」的星魂检查点。
      turnStart(b,u,actor){
        void actor;
        h.onAhaEnd(b,u);
      },
    };
  },

  // ═══════════ 1503 真珠（原始脚本缺失，段数与部分条件尚待来源核验）═══════════
  //   desc 索引：普攻 150301[1=0.9 防御力]；战技 150302[1=15好活当赏,2=0.12,3=240]；
  //   终结 150303[1=3充能,2=0.6,3=20好活当赏,4/5/6=0.1/0.15/0.3 行动提前,7=60笑点,8=30好活当赏]；
  //   天赋 150304[1=0.5,2=0.6,3=50,4=0.3,5=200]；秘技 150307[1=2充能,2=20好活当赏]；
  //   强化普攻 150308[1=1.0,2=0.08,4=160,5=0.15] / 150310[1=1.0,2=0.08,4=160]
  //   行迹 1=point06[2400,0.32,100,0.03,3600,0.2] 2=point07[5,50,0.5,1] 3=point08[90]
  //   星魂 E1[0.1,0.2,0.6,0.5,2] E2[0.15,1] E4[1] E6[0.2,2.4]
  1503:function(api){
    const {live,allies,enemies,rank,trace,buff,resource,energy,damageTo,combatPanel,record,advance,heal,cleanseOne}=api;
    const h=H(api);
    const d=ROSTER_DATA[1503];
    const base=target=>target.resources?.['美学底本'];
    const mark=b=>b.units.find(t=>base(t)&&live(t));
    const charges=u=>u.resources['深度学习充能']??0;
    const studying=u=>charges(u)>0;
    // 强化普攻编号：美学底本为「欢愉」命途 → 150308【行笔，幻造星月】，否则 150310【行笔，绘制末浪】。
    const enhId=(u,b)=>(mark(b)&&isElationPath(mark(b)))?150308:150310;
    const enhOf=(u,b)=>{const id=enhId(u,b);return plist(d,id,u.kit.skillLevels?.Normal)??plist(d,id,6)??[1,.08,1,160];};
    function healTeam(b,u,mult,flat,extra){
      for(const to of allies(b,u))heal(b,u,to,combatPanel(u).def*mult+flat);
      if(extra){
        const pool=allies(b,u).slice().sort((x,c)=>x.hp/combatPanel(x).hp-c.hp/combatPanel(c).hp);
        if(pool[0])heal(b,u,pool[0],combatPanel(u).def*mult+flat);
      }
    }
    function spendPunch(b,u,amount){
      let remaining=Math.min(Math.max(0,amount),h.punchOf(u));
      if(remaining<=1e-9)return;
      const remove=new Set();
      const markers=u.buffs.filter(e=>e.tag==='punchline').sort((a,c)=>{
        const ai=Number(a.id?.split(':').at(-1))||0,ci=Number(c.id?.split(':').at(-1))||0;
        return ai-ci;
      });
      // 每次获得的好活当赏都有独立持续时间；消费也按获得顺序逐批扣除，
      // 不得把总余额写回第一批，否则会改写后续批次到期时应转化的数值。
      for(const marker of markers){
        if(remaining<=1e-9)break;
        const available=Math.max(0,marker.stacks??0),spent=Math.min(available,remaining);
        remaining-=spent;
        const left=available-spent;
        if(left<=1e-9){remove.add(marker);b.rules?.onEffectRemove?.(b,u,marker,'consumed');}
        else marker.stacks=left;
      }
      u.buffs=u.buffs.filter(e=>!remove.has(e));
      resource(b,u,'好活当赏',Math.max(0,h.punchOf(u)-Math.min(Math.max(0,amount),h.punchOf(u))));
    }
    function addTemporaryExtraTurnResources(b,u,to,bonus){
      const punch=u.kit.params.Ultra[7]*bonus;
      const seq=(to.resources['好活当赏批次序号']??0)+1;
      h.grantPunch(b,u,to,punch,null);
      const laughter=u.kit.params.Ultra[6]*bonus;
      h.gainLaughter(b,u,laughter,'真珠终结技 · 额外回合临时笑点');
      to.resources['真珠额外回合临时资源']={source:u.id,punchlineId:'punchline:'+to.id+':'+seq,punch,laughter};
    }
    function clearTemporaryExtraTurnResources(b,u,actor){
      const temp=actor.resources['真珠额外回合临时资源'];
      if(!temp||temp.source!==u.id)return;
      const marker=actor.buffs.find(e=>e.id===temp.punchlineId);
      if(marker)b.rules?.onEffectRemove?.(b,actor,marker,'temporary-extra-turn');
      actor.buffs=actor.buffs.filter(e=>e.id!==temp.punchlineId);
      const remainingPunch=actor.buffs.filter(e=>e.tag==='punchline').reduce((n,e)=>n+(e.stacks??0),0);
      actor.resources['好活当赏']=remainingPunch;
      b.laughter[actor.side]=Math.max(0,(b.laughter[actor.side]??0)-temp.laughter);
      record(b,'resource',actor,{name:'真珠额外回合临时资源结束',removedPunchline:temp.punch,removedLaughter:temp.laughter});
      delete actor.resources['真珠额外回合临时资源'];
    }
    // 天赋：抵御值在受击时抵消 60% 伤害；生命百分比 ≤ #1 时额外减伤 #4。
    function refreshGuard(b,u){
      const P=u.kit.params;
      for(const to of allies(b,u)){
        const id=u.id+':pearl-guard:'+to.id;
        to.buffs=to.buffs.filter(e=>e.id!==id);
        if(to.hp/combatPanel(to).hp>P.Talent[0])continue;
        buff(b,u,to,'珍珠 · 低血减伤','dmgReduction',P.Talent[3],null,{id,tag:'pearlGuard'});
      }
    }
    return {
      start(b,u){
        resource(b,u,'深度学习充能',0);
        // 秘技 150307：战斗开始时获得 #2=20 点好活当赏，并以 #1=2 点充能进入【深度学习】。
        // desc 同时规定「获得【美学底本】……深度学习持有【美学底本】的角色，真珠只能深度学习
        // 除自身以外的角色」。秘技在战斗外使用，持有者是玩家当时操作的角色；模拟器无权读取
        // 战斗外状态，因此按与终结技默认选靶一致的口径取第一名除真珠外的我方角色作为持有者。
        // 具体持有者选择属于战斗外操作，若与录像不符需由配置显式指定（source-blocked 的交界）。
        if(u.kit.technique){
          const P=u.kit.params;
          h.grantPunch(b,u,u,P.Maze[1],null);
          const holder=allies(b,u).find(to=>to!==u);
          if(holder){
            resource(b,holder,'美学底本',1);
            record(b,'mechanic',u,{name:'秘技 · 美学底本',target:holder.id});
          }
          resource(b,u,'深度学习充能',P.Maze[0]);
          record(b,'mechanic',u,{name:'秘技 · 深度学习'});
        }
      },
      prepare(b,u,key,kind,a){
        if(key==='ultimate'&&kind!=='copy'){
          if(a.targetId===u.id)throw new Error('真珠终结技的美学底本不能指定真珠自身');
          if(!a.targetId){
            const target=allies(b,u).find(to=>to!==u);
            if(target)return {...a,targetId:target.id};
          }
        }
        if(kind==='technique'||kind==='copy')return a;
        if(key==='basic'&&studying(u)){
          const E=enhOf(u,b),id=enhId(u,b);
          return {...a,name:sname(d,id),target:'all',hitShares:[1],toughness:90,
            energyGain:d.skills[id]?.spBase??0,spGain:1,terms:def(E[0])};
        }
        return a;
      },
      // 行迹 1=point06：防御力达标 → 欢愉度（超出部分最多计入 #5-#1），欢愉度 × #6 → 治疗量加成；
      // 行迹 2=point07：持有好活当赏时我方全体效果抵抗 +50%；E1：欢愉角色数 2/3/4+ → 我方全体欢愉度 +10/20/60%；
      // E6：【深度学习】时我方全体抗穿 +20%。
      panel(b,u,to,out){
        const T=trace(u,1);
        if(to===u&&T){
          // 1503101 desc：「之后每超过 #3=100 点防御力使自身欢愉度提高 #4=3%，最多计入 #5=3600 点**超出的**防御力」。
          // #5 是超出部分的上限（与 1506101 / 1513101 的「最多计入 #5 点超出的速度」同构），
          // 不是「防御力总量上限」；写成 T[4]-T[0] 会把上限误砍到 1200 点超出。
          const e=T[1]+Math.min(T[4],Math.max(0,(out.def??0)-T[0]))/T[2]*T[3];
          out.elation=(out.elation??0)+e;
          out.healingBoost=(out.healingBoost??0)+e*T[5];
        }
        if(to.side!==u.side)return;
        const T2=trace(u,2);
        if(T2&&h.hasPunch(u))out.effectRes=(out.effectRes??0)+T2[2];
        if(rank(u,1)){
          const n=h.elationCount(b,u);
          if(n>=4)out.elation=(out.elation??0)+rank(u,1,2);
          else if(n===3)out.elation=(out.elation??0)+rank(u,1,1);
          else if(n===2)out.elation=(out.elation??0)+rank(u,1,0);
        }
      },
      modifiers(b,u,actor,to,a,kind){
        void to;void a;
        const out={};
        // E6：深度学习期间我方全体全属性抗性穿透 +20%。必须写在 modifiers（damageTo 读取 mod.resPen），
        // 不能写进 panel.out.resPen —— 伤害路径从不读取该字段。
        if(rank(u,6)&&studying(u)&&actor.side===u.side)out.resPen=(out.resPen??0)+rank(u,6,0);
        // E2：我方全体欢愉伤害「增笑」15%。
        if(kind==='elation'&&rank(u,2)&&actor.side===u.side)out.elationBoost=(out.elationBoost??0)+rank(u,2,0);
        return out;
      },
      // 天赋低血减伤是随当前生命比例动态生效的被动；受击/治疗后立即更新可视化状态，
      // 使同一敌方行动中的后续段数也读到正确的 50% 阈值。
      hpChanged(b,u,reason,amount,source){
        void reason;void amount;void source;
        if(u.side==='ally')refreshGuard(b,u);
      },
      before(b,u,actor,key,kind,a,selected){
        void a;
        if(actor!==u||kind==='copy')return;
        const P=u.kit.params;
        if(key!=='ultimate')return;
        const tgt=selected[0];
        for(const to of b.units){delete to.resources['美学底本'];to.buffs=to.buffs.filter(e=>e.tag!=='pearlArt');}
        if(tgt){resource(b,tgt,'美学底本',1);record(b,'mechanic',u,{name:'美学底本',target:tgt.id});}
        const n=h.elationCount(b,u);
        const ratio=n>=3?P.Ultra[5]:n===2?P.Ultra[4]:P.Ultra[3];
        if(tgt)advance(b,tgt.id,ratio);
        // E2: 额外对除真珠与美学底本外的其他欢愉队友施放同档行动提前。
        if(rank(u,2))for(const ally of allies(b,u))
          if(ally!==u&&ally!==tgt&&isElationPath(ally))advance(b,ally.id,ratio);
        // 欢愉角色 4 名以上：美学底本获得 1 个额外回合；临时资源只在该行动中有效，结束即移除。
        if(tgt&&n>=4){
          const bonus=rank(u,2)?1+rank(u,2,1):1;
          addTemporaryExtraTurnResources(b,u,tgt,bonus);
          b.queue.push({actor:tgt.id,key:'basic',kind:'extra',targetId:tgt.id,persistWave:true});
          record(b,'mechanic',u,{name:'美学底本额外回合',target:tgt.id});
        }
      },
      after(b,u,actor,key,kind,a,selected,hitTargets){
        void a;void selected;void hitTargets;
        if(kind==='extra'&&actor!==u)clearTemporaryExtraTurnResources(b,u,actor);
        // 真珠欢愉技：每名我方角色的下一次实际攻击后，对其命中的每个敌人追加一次对应属性的欢愉伤害。
        // Gachabase 4.6 的 150320 参数为 1/2/3/4+ 名欢愉角色各 10/15/20/40%；E4 把原倍率提高 100%。
        // 欢愉技动作本身是辅助动作，不能消费上一轮留下的攻击票；空目标/未命中的动作也不能消费。
        // 欢愉技可能来自自然阿哈（kind='aha'）或 8009/8010 终结技的插入施放（kind='extra'）；
        // 两者都是真珠实际施放欢愉技，都应发放下一次攻击票。
        if(actor?.side===u.side&&key==='elation'&&actor===u){
          const n=h.elationCount(b,u),level=Math.min(15,10+((u.kit.eidolon??0)>=3?1:0)+((u.kit.eidolon??0)>=5?1:0));
          const P=plist(d,150320,level)??plist(d,150320,10)??[.1,.15,.2,.4];
          const ratio=n>=4?P[3]:n===3?P[2]:n===2?P[1]:P[0];
          const multiplier=ratio*(1+(rank(u,4)?rank(u,4,0):0));
          for(const to of allies(b,u))to.resources['真珠欢愉技待触发']={source:u.id,multiplier,element:to.element};
          record(b,'mechanic',u,{name:'真珠欢愉技 · 下一次攻击追加',targets:allies(b,u).map(to=>to.id),multiplier});
          return;
        }
        const ticket=actor?.resources?.['真珠欢愉技待触发'];
        if(ticket?.source===u.id&&actor.side===u.side&&key!=='elation'&&kind!=='technique'&&hitTargets?.length){
          delete actor.resources['真珠欢愉技待触发'];
          const targets=[...new Map(hitTargets.filter(to=>to?.side!==actor.side&&live(to)).map(to=>[to.id,to])).values()];
          for(const to of targets)h.hitElation(b,actor,to,{name:'真珠欢愉技 · 下一次攻击追加',element:ticket.element??actor.element,mult:ticket.multiplier});
          record(b,'mechanic',actor,{name:'真珠欢愉技 · 攻击票结算',source:u.id,targets:targets.map(to=>to.id),multiplier:ticket.multiplier});
        }
        // 艺术壁垒按「施放终结技」触发，支持型无伤终结技也必须消耗标记并固定回能。
        if(key==='ultimate'&&actor===mark(b)){
          const e=actor.buffs.find(x=>x.tag==='pearlArt');
          if(e){actor.buffs=actor.buffs.filter(x=>x!==e);energy(b,u,trace(u,3)?.[0]??90,true);record(b,'mechanic',u,{name:'艺术壁垒 · 固定回能'});}
        }
        if(actor!==u||kind==='technique')return;
        const P=u.kit.params,T2=trace(u,2);
        if(key==='skill'){
          h.grantPunch(b,u,u,P.BPSkill[0],null);
          healTeam(b,u,P.BPSkill[1],P.BPSkill[2],true);
          if(T2)for(const to of allies(b,u))for(let i=0;i<T2[3];i++)cleanseOne(b,u,to);
          refreshGuard(b,u);
          return;
        }
        if(key==='ultimate'){
          h.grantPunch(b,u,u,P.Ultra[2],null);
          resource(b,u,'深度学习充能',P.Ultra[0]);
          refreshGuard(b,u);
          // 行迹 point08 在每次真珠终结技后重新给当前欢愉美学底本挂一次性固定回能。
          const tgt=mark(b),T3=trace(u,3);
          if(tgt&&isElationPath(tgt)&&T3)buff(b,u,tgt,'艺术壁垒','marker',0,null,{id:u.id+':pearl-art',tag:'pearlArt'});
          return;
        }
        if(key==='basic'){
          if(!studying(u))return;
          const E=enhOf(u,b);
          healTeam(b,u,E[1],E[3],true);
          if(T2)for(const to of allies(b,u))cleanseOne(b,u,to);
          resource(b,u,'深度学习充能',Math.max(0,charges(u)-1));
          // 持有好活当赏时额外 #5=15% 冰属性欢愉伤害（150308【行笔，幻造星月】）；
          // 使用【美学底本】的属性值计算（这里以美学底本为伤害来源）。
          const src=mark(b)??u;
          if(h.hasPunch(u)&&E[4]!=null)for(const to of enemies(b,u))
            h.hitElation(b,src,to,{name:'行笔，幻造星月',element:'Ice',mult:E[4]});
          // 终结技给欢愉美学底本的额外 60% 冰欢愉伤害，不以真珠自己持有好活当赏为前提。
          if(mark(b)&&isElationPath(mark(b)))for(const to of enemies(b,u))
            h.hitElation(b,mark(b),to,{name:'深度学习 · 美学底本欢愉伤害',element:'Ice',mult:P.Ultra[1]});
          // E6：真珠的强化普攻额外造成 #2=240% 冰属性欢愉伤害（同样使用美学底本的属性值）。
          if(rank(u,6))for(const to of enemies(b,u))
            h.hitElation(b,src,to,{name:'真珠 E6 · 强化普攻',element:'Ice',mult:rank(u,6,1)});
          if(charges(u)<=0&&mark(b))delete mark(b).resources['美学底本'];
          refreshGuard(b,u);
          return;
        }
      },
      // 天赋：我方目标回合开始时真珠获得 #1=5 点好活当赏（上限 #2=50，真珠回合开始时重置）；
      // 抵御值 = 好活当赏 × #5=200（上限 #3=50 点好活当赏）。
      turnStart(b,u,actor){
        const T2=trace(u,2);
        if(actor===u)resource(b,u,'本回合已获好活当赏',0);
        else if(T2){
          // 1503102 desc：「我方目标回合开始时，真珠获得 #1=5 点好活当赏，最多获得 #2=50 点」。
          // 上限按本轮累计发放量计算（真珠自己的回合开始只重置计数，不占额度）。
          const got=u.resources['本回合已获好活当赏']??0,cap=T2[1];
          const add=Math.min(T2[0],Math.max(0,cap-got));
          if(add>0){
            // 「最多获得」按实际到账量累计：被 150304 #3=50 持有上限拦下的份额不消耗本轮额度。
            const before=h.punchOf(u);
            h.grantPunch(b,u,u,add,null);
            const gained=h.punchOf(u)-before;
            if(gained>0)resource(b,u,'本回合已获好活当赏',got+gained);
          }
        }
        resource(b,u,'抵御值',Math.min(u.kit.params.Talent[2],h.punchOf(u))*u.kit.params.Talent[4]);
        refreshGuard(b,u);
        h.onAhaEnd(b,u);
      },
      // 天赋：抵御值=好活当赏×200（最多按50点计算）；受击时抵消本次伤害的60%，
      // 消耗等量抵御值，低血30%减伤由 refreshGuard 独立结算。
      redirectDamage(b,u,from,to,amount){
        if(to.side!=='ally'||amount<=0)return null;
        const P=u.kit.params.Talent,perPunch=P[4];
        // 好活当赏可以在友方回合中途获得；抵御池应按受击当下的持有量即时折算，
        // 不应等到下一次回合开始才刷新。
        const stored=Math.min(P[2],h.punchOf(u))*perPunch;
        resource(b,u,'抵御值',stored);
        const absorbed=Math.min(amount*P[1],stored);
        if(absorbed<=0)return null;
        resource(b,u,'抵御值',stored-absorbed);
        const spent=perPunch>0?absorbed/perPunch:0;
        if(spent>0)spendPunch(b,u,spent);
        resource(b,u,'抵御值',Math.min(P[2],h.punchOf(u))*perPunch);
        refreshGuard(b,u);
        return {absorb:true,amount:absorbed,reason:'真珠 · 抵御值'};
      },
      // E1：致命伤害保护（单场 #5=2 次），保留 1 血并回复 50% 生命上限。
      beforeLethal(b,u,from,to,amount){
        void from;void amount;
        if(!rank(u,1)||to.side!==u.side)return false;
        const used=u.resources['E1 保护已用']??0,cap=rank(u,1,4);
        if(used>=cap)return false;
        resource(b,u,'E1 保护已用',used+1);
        heal(b,u,to,combatPanel(to).hp*rank(u,1,3));
        record(b,'mechanic',u,{name:'真珠 E1 · 免于无法战斗',target:to.id});
        return true;
      },
      // 行迹 3=point08：进入战斗 / 施放终结技后，美学底本为欢愉角色时其下一次终结技为真珠固定回 #1=90 能量。
      waveStart(b,u){
        const tgt=mark(b),T3=trace(u,3);
        if(tgt&&isElationPath(tgt)&&T3)buff(b,u,tgt,'艺术壁垒','marker',0,null,{id:u.id+':pearl-art',tag:'pearlArt'});
      },
    };
  },

  // ═══════════ 1505 绯英（Avatar_Evanescia_00_Ability.json）═══════════
  //   desc 索引：普攻 150501[1=1.0]；战技 150502[2=3.0主,3=1.5相邻,4=10笑点]；
  //   终结 150503[1=1.6,2=5次,3=1.2弹射]；
  //   天赋 150504[1=1.0,2=0.25,3=240,4=10,5=0.2,6=0.24,7=0.16,8=0.28]；秘技 150507[1=1.0,2=20]
  //   行迹 1=point06[0.3,1,2,4,0.5] 2=point07[0.12,3] 3=point08[0.5]
  //   星魂 E1[0.2,10] E2[0.36,0.5,1] E4[0.15] E6[0.15,1,0.02,120,4]
  1505:function(api){
    const {live,allies,enemies,rank,trace,buff,resource,energy,damageTo,record}=api;
    const h=H(api);
    const d=ROSTER_DATA[1505];
    // 天赋：获得能量 ⇄ 获得等值好活当赏（单次不超过 100）；累计获得 #3=240 点能量后消耗该累计值，
    // 由【狐狸老师】发动追加攻击并恢复 #4=10 点能量（单次获得能量最多计入 #3 点）。
    function syncEP(b,u){
      if(u.epLock)return;u.epLock=true;
      try{
        const P=u.kit.params;
        const en=u.energy,pu=h.punchOf(u);
        const dE=en-(u.resources['能量快照']??en),dP=pu-(u.resources['好活当赏快照']??pu);
        if(dE>1e-9){
          h.grantPunch(b,u,u,Math.min(100,dE),2);
          const threshold=P.Talent[2];
          let acc=(u.resources['狐狸累计']??0)+Math.min(threshold,dE);
          // 150504 desc：狐狸老师为绯英恢复 #4=10 点能量也是「获得能量」，应计入下一次 #3=240 累计。
          // 旧实现把回能并进能量快照，导致这 10 点永远不参与累计；回能同样应触发等值好活当赏。
          let refunded=0;
          for(let guard=0;guard<20&&acc>=threshold;guard++){
            acc-=threshold;
            const to=b.units.find(t=>t.side!==u.side&&live(t));
            b.queue.push({actor:u.id,key:'followup',kind:'followup',targetId:to?.id,persistWave:true});
            const refund=Math.min(threshold,P.Talent[3]);
            energy(b,u,refund);
            refunded+=refund;
            acc+=refund;
            record(b,'mechanic',u,{name:'狐狸老师 · 累计能量触发',refund,carry:acc});
          }
          // 回能也是「获得能量」：按天赋等值转好活当赏（单次上限 100）。
          if(refunded>0)h.grantPunch(b,u,u,Math.min(100,refunded),2);
          resource(b,u,'狐狸累计',acc);
        }
        if(dP>1e-9)energy(b,u,Math.min(100,dP));
        u.resources['能量快照']=u.energy;u.resources['好活当赏快照']=h.punchOf(u);
      }finally{u.epLock=false;}
    }
    return {
      start(b,u){resource(b,u,'狐狸累计',0);u.resources['能量快照']=u.energy;u.resources['好活当赏快照']=h.punchOf(u);},
      // 天赋：获得等同于暴击伤害 #5=20% 的欢愉度。
      // 行迹 1=point06：暴击率 +#1=30%（本行迹其余参数用于终结技弹射次数，见 prepare）。
      // E2 #1=0.36：绯英的暴击伤害提高 36%（先于天赋换算，使该暴伤同样计入欢愉度）。
      panel(b,u,to,out){
        if(to!==u)return;
        if(rank(u,2))out.critDmg=(out.critDmg??0)+rank(u,2,0);
        out.elation=(out.elation??0)+(out.critDmg??0)*u.kit.params.Talent[4];
        const T=trace(u,1);
        if(T)out.critRate=(out.critRate??0)+T[0];
      },
      prepare(b,u,key,kind,a){
        if(kind==='technique'||kind==='copy')return a;
        if(key==='ultimate'){
          // 行迹 1=point06：当场上敌方数量 ≥3 / =2 / =1 时，终结技弹射次数增加 #2/#3/#4 次。
          const T=trace(u,1);
          const n=b.units.filter(t=>t.side!==u.side&&live(t)).length;
          const extra=!T?0:n>=3?T[1]:n===2?T[2]:T[3];
          return {...a,bounceCount:(a.bounceCount??0)+extra};
        }
        return a;
      },
      // 秘技 150507：进入战斗对敌方全体造成 #1=100% 攻击力物理伤害并获得 #2=20 点好活当赏。
      entry(b,u){
        const P=u.kit.params;
        for(const to of enemies(b,u))damageTo(b,u,to,{name:'落英•散者皆忆',type:'Maze',element:'Physical',
          terms:atk(P.Maze[0]),toughness:mazeStance(1505)},1,'primary','technique');
        h.grantPunch(b,u,u,P.Maze[1],2);
      },
      modifiers(b,u,actor,to,a,kind){
        void a;
        const out={};
        if(actor!==u||to.side===u.side)return out;
        // E1 抗穿 +20%；E4 无视 15% 防御。
        if(rank(u,1))out.resPen=(out.resPen??0)+rank(u,1,0);
        if(rank(u,4))out.defIgnore=(out.defIgnore??0)+rank(u,4);
        // E6：欢愉伤害「增笑」15%，每持有 100 点好活当赏额外 +2%（最高计入 1000 点）。
        if(kind==='elation'&&rank(u,6))
          out.elationBoost=(out.elationBoost??0)+rank(u,6,0)+Math.floor(Math.min(1000,h.punchOf(u))/100)*rank(u,6,2);
        return out;
      },
      before(b,u,actor,key,kind,a,selected){
        void a;void selected;
        if(actor!==u||kind==='copy')return;
        if(key==='ultimate'&&rank(u,6))resource(b,u,'E6 终结技已用',(u.resources['E6 终结技已用']??0)+1);
      },
      after(b,u,actor,key,kind,a,selected,hitTargets,bounceTargets=[]){
        void a;void selected;
        syncEP(b,u);
        if(actor!==u||kind==='technique')return;
        const P=u.kit.params;
        if(key==='skill'){
          h.gainLaughter(b,u,P.BPSkill[3],'战技');
          if(h.hasPunch(u))for(const to of hitTargets.filter(live))h.hitElation(b,u,to,{name:'青春•韶华无限 · 战技',mult:P.Talent[6]});
          return;
        }
        if(key==='ultimate'){
          if(h.hasPunch(u)){
            for(const to of hitTargets.filter(live))h.hitElation(b,u,to,{name:'青春•韶华无限 · 终结技',mult:P.Talent[5],punchlineFloor:u.energyMax??0});
            const pool=bounceTargets.filter(live),to=pool.length?pool[Math.floor(b.random()*pool.length)]:null;
            if(to){h.hitElation(b,u,to,{name:'青春•韶华无限 · 终结技随机',mult:P.Talent[7],punchlineFloor:u.energyMax??0});record(b,'mechanic',u,{name:'绯英终结技随机欢愉目标',target:to.id,candidates:pool.map(t=>t.id)});}
          }
          // E6：进入战斗首次施放终结技后固定恢复 #4=120 点能量，每再施放 #5=4 次可触发 1 次。
          if(rank(u,6)){
            const used=u.resources['E6 终结技已用']??0;
            if(used===1||used%rank(u,6,4)===1){energy(b,u,rank(u,6,3),true);record(b,'mechanic',u,{name:'绯英 E6 · 终结技回能'});}
          }
          return;
        }
        if(key==='followup'){
          // 【狐狸老师】追加攻击：全体 #1 攻击力物理伤害（动作表）+ #2=25% 欢愉伤害；行迹 2=point07 施加易伤。
          // 150504 desc / Avatar_EvanesciaCombat_00_Insert_Phase02：欢愉伤害只在绯英持有【好活当赏】时结算
          //（`ByContainBehaviorFlag Caster ElationEchoPoint`）；易伤属于行迹 2，不受该条件限制。
          const T=trace(u,2),elation=h.hasPunch(u);
          for(const to of hitTargets.filter(live)){
            if(elation)h.hitElation(b,u,to,{name:'狐狸老师 · 欢愉伤害',mult:P.Talent[1]});
            if(T)buff(b,u,to,'狐狸老师 · 易伤','vuln',T[0],T[1],{id:u.id+':fox-vuln',debuff:true});
          }
          // E1：行迹 1505101「【狐狸老师】施放攻击后会额外触发一次欢愉技」→ 排队 1 次欢愉技（去重）。
          if(rank(u,1)&&!b.queue.some(q=>q.actor===u.id&&q.key==='elation'))
            b.queue.push({actor:u.id,key:'elation',kind:'followup',persistWave:true});
          return;
        }
        if(key==='elation'){
          // 150520 desc：#1=5 点【好活当赏】（欢愉技基础获取）。
          const row=plist(d,150520,elationLevel(u.kit.eidolon??0));
          if(row?.[0]>0)h.grantPunch(b,u,u,row[0],2);
          // E1 #2=10：欢愉技使绯英额外获得 10 点【好活当赏】
          //（E2 的 50%/100% 只加在行迹【瞰众乐】/【开不败】的获取上，不适用于本次）。
          if(rank(u,1))h.grantPunch(b,u,u,rank(u,1,1),2);
          return;
        }
      },
      afterDamage(b,u,from,to,kind){void from;void to;void kind;syncEP(b,u);},
      afterHit(b,u,actor,to,a,kind){void actor;void to;void a;void kind;syncEP(b,u);},
      turnStart(b,u,actor){void actor;syncEP(b,u);},
      waveStart(b,u){syncEP(b,u);},
      // 行迹 3=point08【开不败】（1505103，params [0.5]）：队友持有的【好活当赏】结束时，
      // 绯英将其中的 #1=50% 转化为自身的【好活当赏】。
      // 引擎 onEffectExpire 在到期效果被移除前触发（engine.mjs:206-208 expiredTick）；punchline buff
      // 的到期点数取 effect.stacks（grantPunch 每次都把该持有者的当前总点数写回 stacks）。
      // 目前按每个 punchline 批次独立到期结算。strict_research 中已缓存
      // Avatar_Evanescia_00_Ability.json 的 Passive 回调与 EchoPoint 生命周期绑定，但回调里的
      // participant-index 动态表达式尚未还原；不要把它误认为已实现的【瞰众乐】转换分支。
      onEffectRemove(b,u,ownerUnit,effect,reason){
        if(!effect||effect.tag!=='punchline')return;
        if(!ownerUnit||ownerUnit===u||ownerUnit.side!==u.side)return;   // 只处理队友，排除绯英自己
        const T=trace(u,3),amount=effect.stacks??0;
        if(!T||!(amount>0))return;
        // E2 #3=1：触发行迹【开不败】获得好活当赏时，额外获得等同于本次获得的 100% 的好活当赏。
        const gain=amount*T[0]*(1+(rank(u,2)?rank(u,2,2):0));
        h.grantPunch(b,u,u,gain,2);
        record(b,'mechanic',u,{name:'开不败 · 好活当赏转化',from:ownerUnit.id,removed:amount,converted:gain,reason});
      },
    };
  },

  // ═══════════ 1506 银狼LV.999（Avatar_SilverWolf999_00_Ability.json）═══════════
  //   desc 索引：普攻 150601[1=1.0]；战技 150602[1=1.6,2=5笑点]；终结 150603[3=0.9,4=0.2,5=0.2,6=3,7=2]；
  //   天赋 150604[1=60,2=240,3=0.4,4=0.004,5=3,6=0.008]；秘技 150607[1=99]；
  //   强化普攻 150608[1=2.4,3=100,4=1.0,5=3,6=60,7=2,8=0.15]
  //   行迹 1=point06[160,0.5,1,0.02,100] 2=point07[20,40,20,20] 3=point08[20]
  //   星魂 E1[0.2,0.2] E2[120] E4[5] E6[0.2,0.5]
  1506:function(api){
    const {live,allies,enemies,rank,trace,buff,resource,energy,damageTo,combatPanel,record,advance,sp,trueDamage}=api;
    const h=H(api);
    const d=ROSTER_DATA[1506];
    const inUlt=u=>u.buffs.some(e=>e.tag==='sw999Ult');
    const hidden=u=>u.resources['隐藏分']??0;
    const maxHidden=u=>u.kit.params.Talent[0]+u.kit.params.Talent[1];
    const allElements=['Physical','Fire','Ice','Thunder','Wind','Quantum','Imaginary'];
    function applyE6Weakness(b,u,to){
      if(!rank(u,6)||!live(to)||to.side===u.side)return;
      const reduction=rank(u,6,0);
      buff(b,u,to,'禁限弱点','marker',0,null,{id:u.id+':sw999-weak',tag:'sw999WeakSource'});
      for(const el of allElements){
        const baseResistance=to.res?.[el]??0;
        // Nonzero innate resistance is set to zero; only an innate zero gets the explicit 20% cut.
        const lowered=baseResistance>0?baseResistance:reduction;
        buff(b,u,to,'禁限弱点 · '+el,'resPen',lowered,null,{id:u.id+':sw999-res:'+el,tag:'sw999Weak',debuff:true,element:el,resReduction:true,weakness:el});
      }
    }
    function triggerE2(b,u){
      if(!rank(u,2)||!inUlt(u))return;
      const need=rank(u,2),score=u.resources['E2 累计']??0,n=Math.floor(score/need);
      if(n<=0)return;
      resource(b,u,'E2 累计',score-n*need);
      // Rank02 restores one enhanced-basic use per threshold; it does not refill the whole stock.
      resource(b,u,'强化普攻剩余',(u.resources['强化普攻剩余']??0)+n);
      for(let i=0;i<n;i++){
        b.queue.push({actor:u.id,key:'basic',kind:'extra',targetId:b.units.find(t=>t.side!==u.side&&live(t))?.id,persistWave:true});
        record(b,'mechanic',u,{name:'银狼LV.999 E2 · 额外回合'});
      }
    }
    // 【隐藏分】= 能量。引擎 u.energy 被 energyMax=60 夹住，溢出部分（上限 #2=240）存 resources。
    function setHidden(b,u,total){
      const t=Math.max(0,Math.min(maxHidden(u),total)),delta=t-hidden(u);
      resource(b,u,'隐藏分',t);
      const want=Math.min(u.energyMax,t);
      if(Math.abs(u.energy-want)>1e-9)energy(b,u,want-u.energy,true);
      // E2：每使隐藏分提高 #1=120 点获得 1 个额外回合并恢复 1 次强化普攻可施放次数。
      if(delta>0&&rank(u,2)&&inUlt(u)){
        resource(b,u,'E2 累计',(u.resources['E2 累计']??0)+delta);
        triggerE2(b,u);
      }
    }
    // 获得笑点 → 同步获得等量隐藏分。
    function syncHidden(b,u){
      const seen=u.resources['笑点快照']??0,cur=h.laughterOf(b,u);
      if(cur!==seen){u.resources['笑点快照']=cur;if(cur>seen)setHidden(b,u,hidden(u)+(cur-seen));}
    }
    // 【头号补给盲盒】本体：150621 / 强化普攻的固定触发也复用这一份结算。
    // opts.punchline：文案里的「本次造成的欢愉伤害固定计入 N 点好活当赏」（秘技 150607 #1=99）。
    function supplyBox(b,u,ramp=1,opts={}){
      const P=u.kit.params;
      const hit={name:'头号补给盲盒',element:'Imaginary',mult:P.Ultra[2]/Math.max(1,enemies(b,u).length)*ramp,
        ...(opts.punchline!=null?{punchlineOverride:opts.punchline}:{})};
      const pool=enemies(b,u),mark=b.log.length;
      if(pool.length)for(const to of pool)h.hitElation(b,u,to,hit);
      const r=b.random();
      if(r<1/3){
        const top=enemies(b,u).slice().sort((x,c)=>c.hp-x.hp)[0];
        // 150603 desc：【超超超大剑】「对生命值最高的敌方目标额外造成等同于本次总伤害值 #5% 的真实伤害」。
        // 必须以本盲盒实际造成的欢愉伤害为基数（欢愉伤害不吃攻击力，不能用 atk 近似）。
        const total=b.log.slice(mark).filter(e=>e.type==='damage'&&e.actor===u.id).reduce((n,e)=>n+(e.damage??0),0);
        if(top&&total>0)trueDamage(b,u,top,total*P.Ultra[4],'超超超大剑');
      }else if(r<2/3)sp(b,u,P.Ultra[6],'爆爆爆炸蛋');
      else h.gainLaughter(b,u,P.Ultra[5],'怪怪怪味豆');
      record(b,'mechanic',u,{name:'头号补给盲盒'});
    }
    // 150603 desc：初始固定概率 100%，**成功触发后**下一次降低至当前概率的 #4=20%；
    // 判定失败不改变固定概率。150621 会把概率重置为初始值。
    function mysteryBox(b,u,spent){
      const P=u.kit.params;
      if(!h.hasPunch(u)||!spent)return;
      for(let i=0;i<spent;i++){
        const p=u.resources['盲盒概率']??1;
        if(b.random()>=p)continue;
        resource(b,u,'盲盒概率',p*P.Ultra[3]);
        supplyBox(b,u);
      }
    }
    return {
      start(b,u){
        setHidden(b,u,0);
        resource(b,u,'盲盒概率',1);
        resource(b,u,'强化普攻剩余',u.kit.params.Talent[4]);
        resource(b,u,'E2 累计',0);
        u.resources['笑点快照']=h.laughterOf(b,u);
      },
      // 天赋：每点隐藏分 +0.4% 暴击率；暴击率（含其他来源）达 100% 后，其余每点改为 +0.8% 暴击伤害。
      // 行迹 1=point06：速度达标 → 欢愉度（超出部分最多计入 #5）。
      panel(b,u,to,out){
        if(to!==u)return;
        // 150604 desc：【无敌玩家】状态下免疫控制类负面状态。
        if(inUlt(u))out.controlRes=1;
        const P=u.kit.params,T=trace(u,1);
        const hs=hidden(u),base=out.critRate??0,need=Math.max(0,1-base),pts=need/P.Talent[3];
        if(hs<=pts)out.critRate=base+hs*P.Talent[3];
        else{out.critRate=base+need;out.critDmg=(out.critDmg??0)+(hs-pts)*P.Talent[5];}
        if(T)out.elation=(out.elation??0)+T[1]+Math.min(T[4],Math.max(0,(out.speed??0)-T[0]))*T[3];
      },
      // 【无敌玩家】期间普攻替换为 150608（#1=2.4 总倍率均分为 #3=100 段弹射，收尾在 after 结算）。
      prepare(b,u,key,kind,a){
        if(kind==='technique'||kind==='copy')return a;
        // 150620「殿堂级操作回放」是常态欢愉技（Enhance，只获得 #1=15 隐藏分，不造成伤害）；
        // 150621「崩坏级伤害演示」是【无敌玩家】状态下的强化欢愉技（原始脚本 Skill04 / Skill41）。
        if(key==='elation'){
          if(inUlt(u))return a;
          return {...a,name:sname(d,150620),terms:[],bounceCount:0,bounceTerms:[],bounceToughness:0,
            punchlineMultiplier:1,baseElation:true};
        }
        if(key==='basic'&&inUlt(u)){
          const e=plist(d,150608,u.kit.skillLevels?.Normal)??plist(d,150608,6)??[2.4,0,100,1,3,60,2,.15];
          const seg=e[0]/Math.max(1,e[2]);
          // 150608 desc：每拥有 #6=60 点隐藏分，强化普攻期间伤害提高 #8=15%，最多 #7=2 层。
          const stacks=Math.min(Math.max(0,e[6]??0),Math.floor(hidden(u)/Math.max(1,e[5]??1)));
          const ramp=1+stacks*(e[7]??0);
          // 150604 desc：持有【好活当赏】时，强化普攻的技能伤害改为相同倍率的欢愉伤害。
          const elation=h.hasPunch(u);
          // 150608 desc：「若对场上所有敌方造成了致命伤害则结束本次技能，当存在可攻击的敌方
          // 目标后获得1个额外回合并基于剩余弹射段数和【头号补给盲盒】次数再次施放。」
          // 续放由 waveStart 以 kind='extra' 入队；只有该动作消费挂起的剩余段数/盲盒次数，
          // 普通回合的强化普攻仍从完整的 #3=100 段开始。
          const pending=kind==='extra'?u.resources['强化普攻续放']:null;
          const segments=pending?.segments??e[2];
          const boxes=pending?.boxes??(e[4]??0);
          return {...a,name:sname(d,150608),target:'single',hitShares:[1],toughness:30/e[2],
            ...(elation?{type:'ElationDamage',punchlineSource:'certifiedBanger'}:{}),
            continuation:!!pending,continuationSegments:segments,continuationBoxes:boxes,
            energyGain:0,spGain:0,terms:atk(seg*ramp),bounceCount:Math.max(0,segments-1),bounceTerms:atk(seg*ramp),bounceToughness:30/e[2]};
        }
        return a;
      },
      // 秘技 150607：召唤【怪怪怪味豆】→ 每个波次开始时触发 1 次【头号补给盲盒】（固定计入 #1=99 好活当赏）。
      entry(b,u){resource(b,u,'怪怪怪味豆',1);record(b,'mechanic',u,{name:'召唤怪怪怪味豆'});},
      waveStart(b,u){
        // 自然阿哈在角色模块 start 后才加入首个笑点；开局立即同步，避免首帧隐藏分/面板落后一整次行动。
        syncHidden(b,u);
        // 150608 desc：全灭中断后，「当存在可攻击的敌方目标后获得1个额外回合并基于
        // 剩余弹射段数和【头号补给盲盒】次数再次施放」。新波次入场时把续放动作排到队首。
        const pending=u.resources['强化普攻续放'];
        if(pending&&inUlt(u)){
          // 原始脚本从可攻击敌人中随机重选目标（不是固定第一个）。
          const pool=enemies(b,u).filter(live);
          const target=pool.length?pool[Math.floor(b.random()*pool.length)]:null;
          if(target){
            b.queue.unshift({actor:u.id,key:'basic',kind:'extra',targetId:target.id,persistWave:true});
            record(b,'mechanic',u,{name:'狼尊时刻 · 全灭后续放',segments:pending.segments,boxes:pending.boxes});
          }
        }
        // E6：敌方目标进入战斗时植入【禁限弱点】（全属性弱点；基础抗性 0 则改为对应属性抗性降低 20%）。
        // 必须先于本波次的【头号补给盲盒】结算，否则波次盲盒的欢愉伤害吃不到抗性降低。
        for(const to of enemies(b,u))applyE6Weakness(b,u,to);
        // 150607 desc：【怪怪怪味豆】在场时，每个波次开始时触发 1 次【头号补给盲盒】，
        // 本次造成的欢愉伤害**固定计入** #1=99 点好活当赏（不是直接获得 99 点好活当赏）。
        if(u.resources['怪怪怪味豆']&&enemies(b,u).some(live)){
          supplyBox(b,u,1,{punchline:u.kit.params.Maze[0]});
          record(b,'mechanic',u,{name:'怪怪怪味豆 · 波次头号补给盲盒',fixedPunchline:u.kit.params.Maze[0]});
        }
      },
      unitCreated(b,u,to){
        applyE6Weakness(b,u,to);
        // 全灭中断后新敌人在同一波次入场：同样恢复续放动作。
        const pending=u.resources['强化普攻续放'];
        if(pending&&inUlt(u)&&to.side!==u.side&&live(to)&&!b.queue.some(q=>q.actor===u.id&&q.key==='basic')){
          b.queue.unshift({actor:u.id,key:'basic',kind:'extra',targetId:to.id,persistWave:true});
          record(b,'mechanic',u,{name:'狼尊时刻 · 新敌人入场续放',segments:pending.segments,boxes:pending.boxes});
        }
      },
      before(b,u,actor,key,kind,a,selected){
        void selected;
        if(actor!==u||kind==='copy')return;
        // 续放动作真正执行时才消费挂起的剩余段数；prepare 的普通回合预览不得清掉它。
        if(a?.continuation)delete u.resources['强化普攻续放'];
        if(key!=='ultimate')return;
        const P=u.kit.params;
        // 终结技消耗 #1=60 点隐藏分（引擎已扣能量），并重置盲盒概率。
        resource(b,u,'隐藏分',Math.max(0,hidden(u)-P.Talent[0]));
        resource(b,u,'盲盒概率',1);
        resource(b,u,'强化普攻剩余',P.Talent[4]);
        advance(b,u.id,1);                                   // 行动提前 100%
        buff(b,u,u,'无敌玩家','marker',0,P.Talent[4],{id:u.id+':sw999-ult',tag:'sw999Ult',noUltimate:true});
        if(rank(u,2))resource(b,u,'E2 累计',hidden(u));       // Rank02 SumScore starts from current EP when Ultra aura is created.
        const T=trace(u,3);
        if(T)setHidden(b,u,hidden(u)+T[0]);                  // 行迹 3=point08：进入状态 +20 隐藏分
        triggerE2(b,u);                                       // 初始隐藏分（含入口后点数）也参与阈值检查。
        // Rank02 desc：「进入【无敌玩家】状态后，使**自身**所有增益效果延长 1 回合」——只延长银狼自己的
        // 增益，不能把队友的增益一起延长。
        if(rank(u,2))for(const e of u.buffs)if(e.remaining!=null&&!e.debuff)e.remaining+=1;
        record(b,'mechanic',u,{name:'进入无敌玩家'});
      },
      // 150603 desc：结界内**我方目标**每消耗 1 个战技点，有概率触发 1 次【头号补给盲盒】。
      // 引擎 kit-runtime.spend() 现在广播实际消耗（kit-runtime.mjs:47-51），因此改用 spSpent
      // 统计真实消耗（含队友），不再读 `after` 里声明的 a.spCost。
      spSpent(b,u,spender,amount){
        if(!inUlt(u)||!spender||spender.side!==u.side)return;
        mysteryBox(b,u,amount);
      },
      after(b,u,actor,key,kind,a,selected,hitTargets,bounceTargets=[]){
        void selected;
        syncHidden(b,u);
        if(actor!==u||kind==='technique')return;
        const P=u.kit.params;
        if(key==='elation'){
          if(a.baseElation){
            // 150620 #1=15：常态欢愉技只获得隐藏分，不产生伤害事件。
            // Skill04_Phase02 的 PointB2 档位同样生效：计入笑点 ≥20/≥40 各再 +20 隐藏分。
            const row=plist(d,150620,elationLevel(u.kit.eidolon??0))??[15];
            const T=trace(u,2),counted=h.countedAhaLaughter(b,u,kind);
            const bonus=T?(counted>=T[0]?T[2]:0)+(counted>=T[1]?T[3]:0):0;
            setHidden(b,u,hidden(u)+(row[0]??15)+bonus);
            return;
          }
          // 150621 desc：施放后把【头号补给盲盒】固定概率重置为初始值。
          resource(b,u,'盲盒概率',1);
          // 行迹 point07：按本次欢愉技实际计入的笑点，达到20/40分别增加20隐藏分。
          // 固定阿哈回合必须读 instant 的固定笑点，自然阿哈则读当前共享笑点。
          const T=trace(u,2),counted=h.countedAhaLaughter(b,u,kind);
          if(T){
            const bonus=(counted>=T[0]?T[2]:0)+(counted>=T[1]?T[3]:0);
            if(bonus>0)setHidden(b,u,hidden(u)+bonus);
          }
          return;
        }
        if(key==='skill'){
          // 150604 desc：持有【好活当赏】时，施放普攻**或战技**都要对受到攻击的敌方目标造成 #3 虚数欢愉伤害。
          // Avatar_SilverWolf999_00_Skill02_Phase02 与 Skill01_Phase02 同构，都带
          // ByContainBehaviorFlag Caster ElationEchoPoint → FormulaType=ByElationDamage 的附加段。
          if(h.hasPunch(u))for(const to of hitTargets.filter(live))h.hitElation(b,u,to,{name:'顺风局 · 欢愉伤害',element:'Imaginary',mult:P.Talent[2]});
          h.gainLaughter(b,u,P.BPSkill[1],'战技');return;
        }
        if(key==='basic'){
          // 天赋 #3=40%：持有好活当赏时，普攻 / 战技对受到攻击的目标造成 40% 虚数欢愉伤害。
          if(h.hasPunch(u))for(const to of hitTargets.filter(live))h.hitElation(b,u,to,{name:'顺风局 · 欢愉伤害',element:'Imaginary',mult:P.Talent[2]});
          if(!inUlt(u))return;
          // 强化普攻收尾：#4=1.0 攻击力伤害由敌方全体均分。
          // 原始 Avatar_SilverWolf999_00_Skill11_End_Phase02 的 4 个 AttackData
          // （ElationDamage/Normal × AllDarkTeam.GetAliveOnly/AllEnemy，均 EqualSplitInTargets）
          // 全部带 StanceValue 动态哈希 1182064154；该哈希在别处（如 1204 终结技 [0,60,0] 的
          // Skill03_Phase02）随技能的 show_stance_list[1] 变化，即「全体目标削韧」。
          // 本技能 150608.stance=[30,30,0]（30=弹射单体段，30=收尾全体段，0=相邻），
          // 故收尾对每个目标削韧 stance[1]=30，而不是 0，也不是把 30 均分给全体。
          const e=plist(d,150608,u.kit.skillLevels?.Normal)??[2.4,0,100,1,3,60,2,.15];
          const st=d.skills['150608'].stance?.[1]??0;
          const stacks=Math.min(Math.max(0,e[6]??0),Math.floor(hidden(u)/Math.max(1,e[5]??1)));
          const ramp=1+stacks*(e[7]??0);
          // 150608 desc：「若对场上所有敌方造成了致命伤害则结束本次技能……基于剩余弹射段数和
          // 【头号补给盲盒】次数再次施放。」已结算段数 = 主段 1 + 实际弹射段数（全灭时引擎提前 break）。
          const totalSegments=a.continuation?a.continuationSegments:(e[2]??0);
          const totalBoxes=a.continuation?a.continuationBoxes:(e[4]??0);
          const delivered=1+(bounceTargets?.length??0);
          const remainingSegments=Math.max(0,totalSegments-delivered);
          const cleared=!enemies(b,u).some(live);
          // 150608 desc：弹射途中暂停并触发【头号补给盲盒】，总计 #5=3 次。动态段位哈希尚未映射，
          // 因此按技能描述的三次触发在动作内连续结算，不臆造具体段号。全灭后不再空放盲盒。
          let boxesTriggered=0;
          if(!cleared&&h.hasPunch(u))for(let i=0;i<Math.max(0,totalBoxes);i++){
            // 每结算一个盲盒都可能击杀最后一个敌人；剩余次数必须留到续放，不能空放后丢失。
            if(!enemies(b,u).some(live))break;
            supplyBox(b,u,ramp);boxesTriggered++;
          }
          // 即使致命一击发生在最后一段（remainingSegments=0），也要进入续放/增益延长流程。
          if(!enemies(b,u).some(live)){
            // 150608 desc：「每回合首次触发该效果时，使自身所有增益效果延长1回合。」
            if((u.resources['续放增益延长回合']??-1)!==u.turns){
              u.resources['续放增益延长回合']=u.turns;
              for(const e2 of u.buffs)if(e2.remaining!=null&&!e2.debuff)e2.remaining+=1;
              record(b,'mechanic',u,{name:'狼尊时刻 · 首次全灭续放增益延长'});
            }
            // 本次施放没有完成的剩余段数与尚未结算的盲盒次数挂起，等新波次入场后续放。
            const remainingBoxes=Math.max(0,totalBoxes-boxesTriggered);
            u.resources['强化普攻续放']={segments:remainingSegments,boxes:remainingBoxes};
            record(b,'mechanic',u,{name:'狼尊时刻 · 全灭中断',remainingSegments,remainingBoxes});
            return;              // 中断不算完整施放：不扣强化普攻次数、不退出无敌玩家
          }
          const pool=enemies(b,u);
          if(pool.length){const m=e[3]/pool.length*ramp;
            // 持有好活当赏时，强化普攻的技能伤害改为欢愉伤害（150604 desc）。
            const finalType=h.hasPunch(u)?'ElationDamage':'Normal';
            for(const to of pool)damageTo(b,u,to,{name:'狼尊时刻 · 收尾',type:finalType,punchlineSource:'certifiedBanger',element:'Imaginary',terms:atk(m),toughness:st},1,'primary','direct');}
          const left=(u.resources['强化普攻剩余']??P.Talent[4])-1;
          resource(b,u,'强化普攻剩余',left);
          if(left<=0){
            u.buffs=u.buffs.filter(x=>x.tag!=='sw999Ult');
            setHidden(b,u,rank(u,1)?hidden(u)*rank(u,1,0):0);   // E1：退出时保留 20% 隐藏分
            record(b,'mechanic',u,{name:'退出无敌玩家'});
          }
          return;
        }
      },
      afterHit(b,u,actor,to,a,kind){void actor;void to;void a;void kind;syncHidden(b,u);},
      afterDamage(b,u,from,to,kind){void from;void to;void kind;syncHidden(b,u);},
      turnStart(b,u,actor){void actor;syncHidden(b,u);},
      death(b,u,from,to){
        void from;
        if(to!==u)return;
        // Rank06's source modifier is removed with Silver Wolf; clear only its enemy marks.
        for(const target of b.units.filter(t=>t.side!==u.side))
          target.buffs=target.buffs.filter(e=>!(e.source===u.id&&(e.tag==='sw999Weak'||e.tag==='sw999WeakSource')));
      },
      modifiers(b,u,actor,to,a,kind){
        void a;
        const out={};
        if(to.side===u.side)return out;
        // E1：「结界中的敌方目标受到的伤害提高 20%」是全队易伤，不限于银狼本人出手。
        if(rank(u,1)&&inUlt(u))out.vuln=(out.vuln??0)+rank(u,1,1);
        if(actor!==u)return out;
        // E6：仅强化普攻期间造成的欢愉伤害「增笑」50%（不含强化欢愉技本身）。
        if(kind==='elation'&&rank(u,6)&&inUlt(u)&&b.activeAction?.key==='basic')out.elationBoost=(out.elationBoost??0)+rank(u,6,1);
        return out;
      },
    };
  },

  // ═══════════ 1513 砂金•戏浪（Avatar_AventurineW_00_Ability.json）═══════════
  //   desc 索引：普攻 151301[1=1.0]；战技 151302[1=2.4,2=4笑点,3=4热意]；
  //   终结 151303[1=4.0,2=8热意,3=6笑点,4=0.3,5=4回合]；
  //   天赋 151304[1=10,2=0.4,3=0.72,4=30,5=20,6=1,7=1]；秘技 151307[1=1.0,2=2热意,3=20好活当赏]
  //   行迹 1=point06[140,0.3,1,0.01,200] 2=point07[0.8,2,25,1,0.2] 3=point08[0.48,0.48,3,2,6]
  //   星魂 E1[0.24] E2[50,4] E4[0.18,3] E6[2,0.25]
  1513:function(api){
    const {live,allies,enemies,rank,trace,buff,resource,damageTo,record}=api;
    const h=H(api);
    const d=ROSTER_DATA[1513];
    const cap=u=>(rank(u,2)?rank(u,2,0):u.kit.params.Talent[3]);
    const heat=u=>u.resources['热意']??0;
    const thresholds=u=>{
      const t=[u.kit.params.Talent[0]];
      if(rank(u,1))t.push(10,20,30);
      if(rank(u,2))t.push(40,rank(u,2,0));
      return [...new Set(t)].sort((a,c)=>a-c);
    };
    // 【热意】累计达到新阈值 → 立即施放 1 次固定计入 #5=20 笑点的【举杯！敬炽烈一夏】（151320），
    // 阈值触发不消耗热意；只有 All in（151321）明示施放时消耗所有热意。触发并强化下一次阿哈欢愉技。
    // 两个欢愉技的倍率取自 ROSTER_DATA（elationAction 的 151320，prepare 切换 151321）；
    // 共享 ElationDamage 公式已接入；这里结算角色专属触发频率、段数与形态。
    function addHeat(b,u,n){
      const before=heat(u);
      resource(b,u,'热意',Math.min(cap(u),before+n));
      for(const t of thresholds(u))if(before<t&&heat(u)>=t){
        // 151304 desc / InsertElationSkillSave：达到阈值时砂金**自身**插入施放 1 次
        // 固定计入 #5=20 笑点的【举杯】，不是全队阿哈额外回合。
        b.queue.push({actor:u.id,key:'elationHeat',kind:'extra',persistWave:true});
        // AllIn 标记在插入动作真正结算后由 after 添加（UpGradeElationSkill_OnceMark 在 OnInsertActionFinish 生效）。
        resource(b,u,'欢愉技次数',(u.resources['欢愉技次数']??0)+1);
        record(b,'mechanic',u,{name:'举杯！敬炽烈一夏',threshold:t,fixedPunchline:u.kit.params.Talent[4]});
      }
    }
    // 队友行动后的天赋/行迹结算：同一动作只结算一次；PointB2 只在单欢愉队伍生效。
    function teammateAction(b,u,actor,key,kind){
      if(!actor||actor.side!==u.side||actor===u)return;
      if(kind==='dot')return;
      if((b.activeAction?.sequence??-1)===u.resources['热意触发动作'])return;
      u.resources['热意触发动作']=b.activeAction?.sequence??-1;
      const P=u.kit.params,T=trace(u,2),T8=trace(u,3);
      h.gainLaughter(b,u,P.Talent[5],'队友行动');
      addHeat(b,u,P.Talent[6]);
      if(T&&(u.resources['soloElationFollowup']??0)>0){
        if(T[3])h.gainLaughter(b,u,T[3],'纵享惊涛 · 队友攻击');
        h.grantPunch(b,u,u,T[1],2);
        // 原始 PointB2 modifier 是 Stacking=Replace，目标为阿哈，且在 ElationTimeEnd 移除。
        b.ahaSpeedBonus=T[2];
        record(b,'resource',u,{name:'阿哈速度加成',value:b.ahaSpeedBonus,reason:'同行攻击，持续至阿哈时刻结束'});
      }
      if(T8&&['basic','skill','followup','ultimate'].includes(key)){
        const used=u.resources['旧梦淘金已用']??0;
        if(used<T8[4]){
          resource(b,u,'旧梦淘金已用',used+1);
          addHeat(b,u,T8[3]);
          for(const t of allies(b,u))buff(b,u,t,'旧梦淘金 · 暴伤','critDmg',T8[1],T8[2],{id:u.id+':aw-e8b:'+t.id});
        }
      }
    }
    return {
      start(b,u){
        resource(b,u,'热意',0);resource(b,u,'AllIn',0);resource(b,u,'欢愉技次数',0);resource(b,u,'欢愉技施放次数',0);
        // 行迹 2=point07：战斗开始时若队伍中存在其他欢愉命途角色 → 我方全体欢愉度 +20%，
        // 砂金•戏浪额外 +80%；若只有自己 1 名欢愉角色 → 欢愉技视为追加攻击（欢愉技见缺口 2）。
        const T=trace(u,2);
        // 行迹 2=point07：若开场只有砂金•戏浪一名欢愉角色，其欢愉技伤害视为追加攻击。
        resource(b,u,'soloElationFollowup',T&&allies(b,u).filter(isElationPath).length===1?1:0);
        if(T&&allies(b,u).some(t=>t!==u&&isElationPath(t))){
          for(const to of allies(b,u))buff(b,u,to,'纵享惊涛 · 欢愉度','elation',T[4],null,{id:u.id+':aw-e7:'+to.id,removeOnSourceDeath:true});
          buff(b,u,u,'纵享惊涛 · 额外欢愉度','elation',T[0],null,{id:u.id+':aw-e7self',removeOnSourceDeath:true});
        }
        // 行迹 3=point08：暴击伤害 #1=48%。
        const T8=trace(u,3);
        if(T8)buff(b,u,u,'旧梦淘金 · 暴击伤害','critDmg',T8[0],null,{id:u.id+':aw-e8'});
      },
      // 行迹 1=point06：速度达标 → 欢愉度（超出部分最多计入 #5）。
      panel(b,u,to,out){
        if(to!==u)return;
        const T=trace(u,1);
        if(T)out.elation=(out.elation??0)+T[1]+Math.min(T[4],Math.max(0,(out.speed??0)-T[0]))*T[3];
      },
      // 欢愉技形态选择：
      //   elationHeat（热意阈值插入）→ 151320【举杯】，固定计入 #5=20 笑点；
      //   elation（真正的阿哈时刻欢愉技）且 AllIn=1 → 151321【All in！】；
      //   E6 施放 2 次后，后续欢愉技强制 All in。
      // All in 的 #1 全体、#3 次固定弹射 #4、每点热意 #2；`before` 仅在 All in 时清空热意。
      prepare(b,u,key,kind,a){
        if(kind==='technique'||kind==='copy')return a;
        if(key!=='elation'&&key!=='elationHeat')return a;
        const countAsFollowup=(u.resources['soloElationFollowup']??0)>0;
        const heatInsert=key==='elationHeat';
        const forcedE6=!!rank(u,6)&&(u.resources['欢愉技施放次数']??0)>=rank(u,6,0);
        // 阈值插入不是阿哈时刻，不得消耗 AllIn 标记；该标记只强化下一次阿哈欢愉技。
        const allIn=forcedE6||(!heatInsert&&kind==='aha'&&(u.resources['AllIn']??0)>0);
        if(!allIn){
          return {...a,name:sname(d,151320),countAsFollowup:countAsFollowup||a.countAsFollowup,
            ...(heatInsert?{punchlineOverride:u.kit.params.Talent[4],heatInsert:true}:{})};
        }
        const E=elationRow(d,151321,elationLevel(u.kit.eidolon??0))??[0.6,0.21,10,0.18];
        return {...a,name:sname(d,151321),allIn:true,countAsFollowup:countAsFollowup||a.countAsFollowup,terms:atk(E[0]),bounceGroups:[
          {count:E[2],terms:atk(E[3]),toughness:0},
          {count:heat(u),terms:atk(E[1]),toughness:0},
        ],...(heatInsert?{punchlineOverride:u.kit.params.Talent[4]}:{}),
        preserveHeatOutsideAha:forcedE6&&kind!=='aha'};
      },
      // 秘技 151307：进入战斗对敌方全体造成 #1=100% 攻击力量子伤害，自身获得 #2=2 热意与 #3=20 好活当赏。
      entry(b,u){
        const P=u.kit.params;
        for(const to of enemies(b,u))damageTo(b,u,to,{name:'于静水掀起风浪',type:'Maze',element:'Quantum',
          terms:atk(P.Maze[0]),toughness:mazeStance(1513)},1,'primary','technique');
        h.grantPunch(b,u,u,P.Maze[2],2);
        addHeat(b,u,P.Maze[1]);
      },
      modifiers(b,u,actor,to,a,kind){
        void a;
        const out={};
        if(actor!==u||to.side===u.side)return out;
        // E1：全属性抗穿 +24%。
        if(rank(u,1))out.resPen=(out.resPen??0)+rank(u,1);
        // E6：砂金•戏浪造成的欢愉伤害「增笑」25%。
        if(kind==='elation'&&rank(u,6))out.elationBoost=(out.elationBoost??0)+rank(u,6,1);
        return out;
      },
      before(b,u,actor,key,kind,a,selected){
        void a;void selected;
        if(actor!==u||kind==='copy')return;
        // 只有【All in！】施放时消耗所有【热意】；基础【举杯】不消耗。
        // All in 强化标记在**阿哈时刻**的欢愉技施放后消耗（UpGradeElationSkill_OnceMark）。
        if(key==='elation'||key==='elationHeat'){
          if(a.allIn&&heat(u)>0&&!a.preserveHeatOutsideAha)resource(b,u,'热意',0);
          if(key==='elation'&&kind==='aha'&&(u.resources['AllIn']??0)>0)resource(b,u,'AllIn',0);
          return;
        }
        // E4：施放战技时使我方全体造成的伤害无视 18% 防御，持续 3 回合。
        if(key==='skill'&&rank(u,4))
          for(const to of allies(b,u))buff(b,u,to,'砂金•戏浪 E4 · 无视防御','defIgnore',rank(u,4,0),rank(u,4,1),{id:u.id+':aw-e4:'+to.id});
      },
      after(b,u,actor,key,kind,a,selected,hitTargets){
        void a;void selected;
        h.onAhaEnd(b,u);
        // 队友的普攻/战技/终结/欢愉技/追击即使没有伤害也应触发天赋与行迹；
        // 同一动作由 teammateAction 去重，afterHit 命中路径不会重复结算。
        if(actor!==u&&actor?.side===u.side&&['basic','skill','ultimate','elation','followup'].includes(key))
          teammateAction(b,u,actor,key,kind);
        if(actor!==u||kind==='technique')return;
        const P=u.kit.params;
        if(key==='elation'||key==='elationHeat'){
          resource(b,u,'欢愉技施放次数',(u.resources['欢愉技施放次数']??0)+1);
          // 阈值插入真正结算后，才把下一次阿哈欢愉技标记为 All in。
          if(key==='elationHeat')resource(b,u,'AllIn',1);
          // E2：每次施放欢愉技后获得 #2=4 点热意。
          if(rank(u,2))addHeat(b,u,rank(u,2,1));
          return;
        }
        if(key==='skill'){
          h.gainLaughter(b,u,P.BPSkill[1],'战技');
          addHeat(b,u,P.BPSkill[2]);
          // 旧梦淘金可触发次数在施放战技时重置。
          resource(b,u,'旧梦淘金已用',0);
          // 持有好活当赏：战技额外对敌方全体造成 #2=40% 量子欢愉伤害。
          if(h.hasPunch(u))for(const to of hitTargets.filter(live))h.hitElation(b,u,to,{name:'绝杀，热砂沸腾 · 欢愉伤害',element:'Quantum',mult:P.Talent[1]});
          return;
        }
        if(key==='ultimate'){
          // 在阿哈时刻内施放终结技会移除 All-in 强化标记（AVE:2541-2556）。
          if(b.ahaInstant)resource(b,u,'AllIn',0);
          h.gainLaughter(b,u,P.Ultra[2],'终结技');
          addHeat(b,u,P.Ultra[1]);
          buff(b,u,u,'胜局 · 速度','speedPct',P.Ultra[3],P.Ultra[4],{id:u.id+':aw-ult-speed'});
          // 持有好活当赏：终结技额外对敌方全体造成 #3=72% 量子欢愉伤害。
          if(h.hasPunch(u))for(const to of hitTargets.filter(live))h.hitElation(b,u,to,{name:'胜局，凌越飓浪之上 · 欢愉伤害',element:'Quantum',mult:P.Talent[2]});
          return;
        }
      },
      // 天赋 + 行迹 2=point07 + 行迹 3=point08：队友施放攻击后，砂金•戏浪获得 #7=1 热意与 #6=1 笑点
      //（行迹再 +2 好活当赏、阿哈速度 +25）；行迹 3 另使我方全体暴击伤害 +48% 持续 3 回合，
      // 自身额外 +2 热意，最多触发 #5=6 次，施放战技时重置。
      afterHit(b,u,actor,to,a,kind){
        void a;
        if(!actor||actor.side!==u.side||actor===u||!to||to.side===u.side)return;
        teammateAction(b,u,actor,b.activeAction?.key??'basic',kind);
      },
    };
  },
};

export {factories,actions};
