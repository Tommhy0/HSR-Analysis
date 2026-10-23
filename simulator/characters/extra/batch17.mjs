// DeepSeek batch-17：7 名角色（4.6 固定数据，提交 312b4597691e0a29cf9828a15b592757dba86949）。
//
//   8001 开拓者（物理 · 毁灭）  Avatar_PlayerBoy_00_Ability.json
//   8002 开拓者（物理 · 毁灭）  Avatar_PlayerGirl_00_Ability.json（同一套技能，见下）
//   8007 开拓者（冰 · 记忆）    Avatar_PlayerBoy_30_Ability.json（忆灵「迷迷」）
//   8008 开拓者（冰 · 记忆）    Avatar_PlayerGirl_30_Ability.json（同一套技能）
//   1404 万敌（虚数 · 毁灭）    Avatar_Mydeimos_00_Ability.json
//   1408 白厄（物理 · 毁灭）    Avatar_Phainon_00_Ability.json（能量上限 12 = 【火种】）
//   1509 吉尔伽美什（雷 · 毁灭） Avatar_Gilgamesh_00_Ability.json（联动 id，不在 AvatarConfig）
//
// 数值索引逐条核对 `_data_cache/hsr_core.json` 的 desc `#n` ↔ `params[等级].param_list`
// （普攻 6 级、其余 10 级、秘技 1 级）；段数 / 时序取自上面的原始 Ability 脚本：
//   · 8001/8002 Skill01_Phase02 = 单段；Skill02_Phase02 = 主目标 + 相邻各 1 段（同一倍率 1.25）；
//     Skill11_Phase02 = 终结【全胜•再见安打】单段 4.5；Skill21_Phase02 = 终结【全胜•安息全垒打】
//     主目标 2.7 + 相邻 1.62（两个 AttackData 节点）。
//   · 8007/8008 Skill01_Phase02 = 单段；Skill11_Phase02 =【明天，一同写下！】AllEnemy 单段；
//     忆灵技参数取自 `characters[8007].memosprite.skills`（1800701 = 4×0.504 弹射 + 1.26 全体，
//     1800707 = 声援 0.36/3 回合/行动提前 100%，1800705 = 被召唤 +50% 充能，
//     1800706 = 消失时开拓者行动提前 25%）。忆灵并非独立单位体系：复用 `memospriteOwner`
//     契约（engine.mjs validateBattle 第 31/32 行、batch11 的 spawnServant 同一口径）。
//   · 1404 Skill01_Phase02 = 单段；Skill02_Phase02/Skill03_Phase02 = 主 + 相邻；
//     Skill21_Ability（弑王成王）= 主 + 相邻；Skill22_Ability（弑神登神）= 2 轮，每轮
//     [AllEnemy(0.5), 主目标(0.5), 相邻(0.5)]，E1 时 AllEnemy 分支生效。
//   · 1408 Skill01_Phase02 = 单段；Skill02_Phase02 = 主 + 相邻；Skill11_Phase02（创生•血棘渡亡）
//     = 主 0.3 → 相邻 0.3 → 主 0.7 → 相邻 0.7（hitShares [.3,.7]）；Skill21_Insert_Phase02
//     （灾厄•弑魂焚诏 的反击）= 全体 + 随机单体；Skill22_Phase02 / Skill22_v2_Phase02（支柱•死星天裁）
//     = 随机单体 / 全体终结；Skill31_Phase2 = 最后一击（全体均分）。
//   · 1509 Skill01_Phase02 = 3 段 [.3,.3,.4]；Skill02_Phase02（王之财宝）= 5 段
//     [.1,.1,.2,.2,.4] 主目标 + 相邻同段；Skill03_Phase02（天地乖离•开辟之星）= 全体 1 段 +
//     `LoopExecuteTaskListWithInterval` 内的 10 次随机单体（desc #3=10）；Insert_Phase02
//     （连携追加攻击）= 4 段 [.2,.2,.2,.4] 全体；Insert_Phase02_Saber = Saber 的风属性部分。
//
// 忆灵技 / 忆灵天赋参数（hsr_core.json，忆灵技能 10 级）：
const MIMI={
  attack:{name:'坏人！麻烦！',p:[0.504,4,1.26],stance:[15,30,0]},   // 1800701
  talent:{name:'伙伴！一起！',p:[0.168,0.336]},                       // 1800703
  spawn:{name:'迷迷，加油！',p:[0.5]},                                // 1800705
  leave:{name:'遗憾…不留',p:[0.25]},                                  // 1800706
  support:{name:'我会！帮你！',p:[0.36,3,1]},                         // 1800707
};
// 忆灵节点（hsr_core.json 8007501「未完的尾声」type=5，不在 ROSTER_DATA.traces 的 type3 过滤里）：
const EPIC_CAP=2;                    // 「最多持有 2 层【史诗】」
import {atk,hp,basic,skill,ultimate,elementOf} from '../actions.mjs';
import {ROSTER_DATA} from '../../roster-data.mjs';

export const IDS=[8001,8002,8007,8008,1404,1408,1509];
const sk=(id,skillId,lv='10')=>ROSTER_DATA[id].skills[skillId].params[lv].param_list;
// 技能 id = 角色 id×100 + 序号（8001→800102、8002→800209、1404→140409、1509→150909）。
const sid=(id,n)=>String(id*100+n);
const list=(d,type)=>Object.values(d.skills).find(s=>s.type===type);
const mazeStance=id=>list(ROSTER_DATA[id],'Maze')?.stance?.[0]??0;
const tagOf=(u,tag)=>u.buffs.find(e=>e.tag===tag);
const atkT=m=>({scaling:'atk',multiplier:m});
const hpT=m=>({scaling:'hp',multiplier:m});
const physical=t=>!t||(t.weaknesses??[]).includes('Physical')||t.buffs.some(e=>e.weakness==='Physical');

// ═══════════════════════════════════════════════════════════════════════════
// 8001 / 8002 开拓者（物理 · 毁灭）—— 同一套技能，脚本按性别命名，工厂共享实现
// ═══════════════════════════════════════════════════════════════════════════
function physicalTrailblazer(id){
  const d=ROSTER_DATA[id];
  const skillName=d.skills[sid(id,2)].name,ultBlast=d.skills[sid(id,9)].name;
  return function(api){
    const {live,allies,enemies,rank,trace,buff,resource,energy,heal,combatPanel}=api;
    const P=u=>u.kit.params;
    const stackOf=u=>tagOf(u,'tbPhysTalent');
    // 天赋 800104「牵制盗垒」：每次击破弱点 → 攻击力 +Talent[0]，最多 Talent[1] 层；
    // 行迹 point07「坚韧」使每层同时 +trace[2][0] 防御力。
    function talent(b,u){
      const T=P(u).Talent,cur=stackOf(u)?.stacks??0;
      if(cur>=T[1])return;
      const n=cur+1;
      buff(b,u,u,'牵制盗垒','atkPct',T[0]*n,null,{id:u.id+':tb-talent',tag:'tbPhysTalent',stacks:n});
      if(trace(u,2))buff(b,u,u,'坚韧','defPct',trace(u,2)[0]*n,null,{id:u.id+':tb-talent-def',tag:'tbPhysTalentDef',stacks:n});
    }
    return {
      // 行迹 point06「蓄势」：战斗开始时立即恢复 15 点能量。
      start(b,u){resource(b,u,'E1已触发',-1);if(trace(u,1))energy(b,u,trace(u,1)[0]);},
      // 秘技 800107「不灭三振」：为我方全体回复各自生命上限 15% 的生命值。
      entry(b,u){for(const to of allies(b,u))heal(b,u,to,combatPanel(to).hp*P(u).Maze[0]);},
      // 终结技有两种模式：仅 1 名敌人时用【全胜•再见安打】(4.5)，否则【全胜•安息全垒打】(2.7/1.62)。
      prepare(b,u,key,kind,a){
        if(kind==='copy'||kind==='technique')return a;
        if(key==='ultimate'&&enemies(b,u).length<=1)return {...u.actions.ultimateSingle,targetId:a.targetId};
        return a;
      },
      // 天赋触发点 1：击破敌方目标弱点。
      afterDamage(b,u,from,to,kind){if(kind==='break'&&to.side!==u.side)talent(b,u);void from;},
      // E1：终结技消灭敌方目标时额外回 10 能（每次攻击 1 次）。E6：消灭目标时也触发天赋。
      death(b,u,from,to){
        if(to.side===u.side)return;
        if(from===u&&b.activeAction?.key==='ultimate'&&rank(u,1)&&u.resources['E1已触发']!==b.activeAction.sequence){
          resource(b,u,'E1已触发',b.activeAction.sequence);energy(b,u,rank(u,1,0));
        }
        if(from===u&&rank(u,6))talent(b,u);
      },
      // E2：施放攻击后，若击中的敌方目标弱点为物理，回复 5% 攻击力的生命值。
      after(b,u,actor,key,kind,a,selected,hitTargets){
        if(actor!==u||!hitTargets.length)return;
        if(rank(u,2)&&hitTargets.some(t=>t.side!==u.side&&physical(t)))heal(b,u,u,combatPanel(u).atk*rank(u,2,0));
        void key;void kind;void a;void selected;
      },
      modifiers(b,u,actor,to,a,kind){
        const out={};if(actor!==u||to.side===u.side)return out;
        // E4：击中处于弱点击破状态的敌方目标时暴击率 +25%。
        if(rank(u,4)&&to.broken)out.critRate=(out.critRate??0)+rank(u,4);
        // 行迹 point08「斗志」：战技 / 终结技【全胜•安息全垒打】对指定目标伤害 +25%。
        if(trace(u,3)&&(a?.name===skillName||a?.name===ultBlast)&&b.activeAction?.targets?.[0]===to.id)
          out.dmgBoost=(out.dmgBoost??0)+trace(u,3)[0];
        void kind;return out;
      },
      display(b,u){const t=stackOf(u);return t?[{type:'buff',id:u.id+':tb-talent',source:u.id,name:'牵制盗垒',key:'atkPct',value:t.value,remaining:null,stacks:t.stacks,derived:true,tickOwner:u.id}]:[];},
    };
  };
}

function physicalTrailblazerActions(id){
  const d=ROSTER_DATA[id],single=sk(id,sid(id,8)),blast=sk(id,sid(id,9));
  const singleName=d.skills[sid(id,8)].name,blastName=d.skills[sid(id,9)].name;
  return (p,dd,{eidolon=0}={})=>{
    void eidolon;void dd;
    return {
      basic:basic(p,d,{terms:atk(p.Normal[0]),hitShares:[1],toughness:30,spGain:1,energyGain:20}),
      // 战技 800102：主目标与相邻目标同为 BPSkill[0]=1.25（Skill02_Phase02 两个 AttackData 同倍率）。
      skill:skill(p,d,{target:'blast',terms:[...atk(p.BPSkill[0]),{...atk(p.BPSkill[0])[0],target:'adjacent'}],
        hitShares:[1],toughness:60,adjacentToughness:30,energyGain:30,spCost:1}),
      // 终结技默认【全胜•安息全垒打】：主目标 Ultra[0]=2.7、相邻 Ultra[1]=1.62，削韧 60/60。
      ultimate:ultimate(p,d,{name:blastName,target:'blast',terms:[...atk(blast[0]),{...atk(blast[1])[0],target:'adjacent'}],
        hitShares:[1],toughness:60,adjacentToughness:60,energyCost:d.energyMax,energyGain:5}),
      // 终结技另一模式【全胜•再见安打】：单体 Ultra=4.5，削韧 90，同一能量消耗。
      ultimateSingle:{name:singleName,type:'Ultra',element:elementOf(d.element),target:'single',terms:atk(single[0]),
        hitShares:[1],toughness:90,energyCost:d.energyMax,energyGain:5,spCost:0,spGain:0},
    };
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 8007 / 8008 开拓者（冰 · 记忆）—— 忆灵「迷迷」
// ═══════════════════════════════════════════════════════════════════════════
function remembranceTrailblazer(id){
  const d=ROSTER_DATA[id];
  return function(api){
    const {live,allies,enemies,rank,trace,buff,resource,energy,damageTo,combatPanel,record,advance,heal,useAction,trueDamage,get}=api;
    const P=u=>u.kit.params;
    const mimiOf=(b,u)=>b.units.find(t=>t.memospriteOwner===u.id&&t.hp>1e-8&&t.active!==false);
    const mimiAny=(b,u)=>b.units.find(t=>t.memospriteOwner===u.id);
    const chargeOf=s=>s.resources['充能']??0;
    // 忆灵单位（沿用 batch11 的 memospriteOwner 契约；生命上限 = 开拓者局内生命上限×80%+640，
    // 速度 = 天赋[0]=130）。
    function servantActions(){return {basic:{name:MIMI.attack.name,type:'Talent',element:'Ice',target:'all',
      terms:[atkT(MIMI.attack.p[2])],hitShares:[1],energyGain:0,spCost:0,spGain:0,
      toughness:MIMI.attack.stance[1],bounceCount:MIMI.attack.p[1],bounceTerms:[atkT(MIMI.attack.p[0])],bounceToughness:MIMI.attack.stance[0]}};}
    function supportAction(){return {name:MIMI.support.name,type:'Talent',element:'Ice',target:'ally',terms:[],hitShares:[1],
      energyGain:0,spCost:0,spGain:0,toughness:0};}
    function spawnMimi(b,u){
      const pid=u.id+':mimi',cur=b.units.find(t=>t.id===pid),base=combatPanel(u);
      const maxHp=Math.max(1,base.hp*P(u).Talent[1]+P(u).Talent[3]),speed=Math.max(1,P(u).Talent[0]);
      if(cur){
        cur.panel.hp=maxHp;cur.panel.atk=base.atk;cur.panel.def=base.def;cur.panel.speed=speed;cur.baseSpeed=speed;
        cur.panel.baseStats={hp:maxHp,atk:base.baseStats?.atk??base.atk,def:base.baseStats?.def??base.def};
        if(cur.active===false||cur.hp<=1e-8)cur.hp=maxHp;else cur.hp=Math.min(cur.hp,maxHp);
        cur.active=true;b.rules?.unitCreated?.(b,cur);
        return cur;
      }
      const s={id:pid,name:'迷迷',side:u.side,level:u.level,element:'Ice',memospriteOwner:u.id,
        panel:{...base,hp:maxHp,atk:base.atk,def:base.def,speed,baseStats:{hp:maxHp,atk:base.baseStats?.atk??base.atk,def:base.baseStats?.def??base.def},elemDmg:{...base.elemDmg}},
        baseSpeed:speed,energyMax:0,energy:0,actions:servantActions(),policy:{autoUltimate:false,basicOnly:true,allyTargetId:u.policy?.allyTargetId},
        aggro:100,toughnessMax:0,toughness:0,broken:false,res:{},
        order:b.units.reduce((n,t)=>Math.max(n,t.order??0),0)+1,
        active:true,distance:10000,advanceOrder:0,shields:[],buffs:[],dots:[],resources:{},turns:0,skipTurns:0,hp:maxHp};
      Object.defineProperty(s,'battle',{value:b});
      b.units.push(s);b.rules?.unitCreated?.(b,s);record(b,'summon',u,{name:'召唤忆灵：迷迷',target:s.id});
      return s;
    }
    function dismiss(b,u){
      const s=mimiAny(b,u);if(!s||s.active===false)return false;
      s.hp=0;s.active=false;
      // 忆灵天赋 1800706：迷迷消失时，使开拓者行动提前 25%。
      advance(b,u.id,MIMI.leave.p[0]);
      record(b,'mechanic',u,{name:'忆灵离场',target:s.id});
      return true;
    }
    // 充能（0~100%）：满 100% 时迷迷立即行动，下一次行动改为【我会！帮你！】。
    function addCharge(b,u,n){
      const s=mimiOf(b,u);if(!s||!(n>0))return;
      const v=Math.min(100,chargeOf(s)+n);resource(b,s,'充能',v);
      if(v>=100&&s.distance>0){s.distance=0;s.advanceOrder=(b.advanceSequence=(b.advanceSequence??0)+1);record(b,'advance',u,{name:'迷迷充能已满 · 立即行动',target:s.id,ratio:1});}
    }
    // 天赋 800704：我方全体每累计恢复 Talent[2]=10 点能量，迷迷获得 1% 充能。
    function scanEnergy(b,u){
      const from=u.resources['能量扫描']??0;if(b.log.length<=from)return;
      let add=0;
      for(const e of b.log.slice(from))if(e.type==='energy'&&e.amount>0){const t=b.units.find(x=>x.id===e.actor);if(t&&t.side===u.side)add+=e.amount;}
      resource(b,u,'能量扫描',b.log.length);
      if(add>0){const acc=(u.resources['能量累计']??0)+add,per=P(u).Talent[2];const gain=Math.floor(acc/per);resource(b,u,'能量累计',acc-gain*per);if(gain)addCharge(b,u,gain);}
    }
    function memiDamage(b,u,s,mult,name,toughness,extra={}){
      for(const to of enemies(b,u))damageTo(b,s,to,{name,type:'Talent',element:'Ice',terms:atk(mult),toughness,...extra},1,'primary','direct');
    }
    // 忆灵技 1800707【我会！帮你！】：使目标行动提前 100%，附上【迷迷的声援】3 回合。
    function grantSupport(b,u,to){
      if(!to)return;
      advance(b,to.id,MIMI.support.p[2]);
      buff(b,u,to,'迷迷的声援','marker',0,MIMI.support.p[1],{id:u.id+':mimi-support',tag:'mimiSupport'});
      // E1：声援持有者暴击率 +10%，且对其忆灵/忆师同样生效。
      if(rank(u,1))buff(b,u,to,'迷迷的声援 · 暴击','critRate',rank(u,1),MIMI.support.p[1],{id:u.id+':mimi-support-crit',tag:'mimiSupportCrit'});
      record(b,'mechanic',u,{name:'迷迷的声援',target:to.id});
    }
    // 声援真实伤害倍率：0.36 + 行迹 point08（能量上限 >100 每 10 点 +2%，上限 20%）+ E4（能量上限 0 时 +6%）。
    function supportRatio(b,u,holder){
      let m=MIMI.support.p[0];const t=trace(u,3);
      if(t&&(holder.energyMax??0)>t[0])m+=Math.min(t[3],Math.floor(((holder.energyMax)-t[0])/t[1])*t[2]);
      if(rank(u,4)&&((holder.energyMax??0)===0||holder.buffs.some(e=>e.tag==='mimiE4')))m+=rank(u,4,1);
      return m;
    }
    return {
      start(b,u){resource(b,u,'史诗',0);resource(b,u,'能量扫描',0);resource(b,u,'能量累计',0);resource(b,u,'E2触发回合',-1);},
      // 秘技 800707「记忆如往日重现」：敌方全体行动延后 50%，随后造成 100% 攻击力冰伤。
      entry(b,u){
        const p=P(u);
        for(const to of enemies(b,u))api.delay(b,to.id,p.Maze[1]);
        for(const to of enemies(b,u))damageTo(b,u,to,{name:'记忆如往日重现',type:'Maze',element:'Ice',terms:atk(p.Maze[2]),toughness:mazeStance(id)},1,'primary','technique');
      },
      // 行迹 point06「追念之权杖」：战斗开始时开拓者行动提前 30%，首次召唤迷迷时 +40% 充能。
      before(b,u,actor,key,kind,a,selected){
        if(actor!==u)return;
        const p=P(u);
        if(kind==='copy')return;
        if(key==='skill'){
          const s=mimiOf(b,u);
          if(s)heal(b,u,s,combatPanel(s).hp*p.BPSkill[0]),addCharge(b,u,p.BPSkill[1]*100);
          else summon(b,u,false);
        }
        if(key==='ultimate'){
          summon(b,u,true);
          const s=mimiOf(b,u);
          addCharge(b,u,p.Ultra[1]*100);
          // 忆灵技【坏人！麻烦！】的对象是忆灵自己：终结技的伤害由迷迷结算（E6 暴击率固定 100%）。
          if(s)memiDamage(b,u,s,p.Ultra[0],'一起上吧，迷迷！',list(d,'Ultra')?.stance?.[1]??60,
            rank(u,6)?{fixedCrit:{rate:1,critDmg:combatPanel(s).critDmg}}:{});
        }
        // 忆灵节点「未完的尾声」：持有【史诗】且迷迷在场时，普攻强化为【明天，一同写下！】。
        if(key==='basic'&&a?.name===u.actions.enhancedBasic?.name&&(u.resources['史诗']??0)>0)
          resource(b,u,'史诗',(u.resources['史诗']??0)-1);
        void selected;
      },
      prepare(b,u,key,kind,a){
        if(kind==='copy'||kind==='technique')return a;
        if(key==='basic'&&(u.resources['史诗']??0)>0&&mimiOf(b,u))return {...u.actions.enhancedBasic,targetId:a.targetId};
        return a;
      },
      after(b,u,actor,key,kind,a,selected,hitTargets){
        scanEnergy(b,u);
        // 忆灵自己的回合：施放忆灵技后按分支结算。
        if(actor&&actor.memospriteOwner===u.id&&key==='basic'){
          if(actor.resources['施放声援']){resource(b,actor,'施放声援',0);resource(b,actor,'充能',0);grantSupport(b,u,selected[0]??allies(b,u).find(t=>!t.memospriteOwner));}
          // 行迹 point07「袖珍的事诗」：施放【坏人！麻烦！】时立即获得 5% 充能。
          else if(trace(u,2))addCharge(b,u,trace(u,2)[0]*100);
          return;
        }
        // E2「过往的拾遗者」：除迷迷以外的我方忆灵行动时，开拓者恢复 8 点能量。
        // 原文明确「该效果每回合最多触发 #2=1 次，开拓者回合开始时重置可触发次数」→
        // 计数以开拓者自身回合为准（此前用全场回合 b.turns，会随队友回合提前重置）。
        if(actor!==u&&actor.memospriteOwner&&actor.memospriteOwner!==u.id&&rank(u,2)&&u.resources['E2触发回合']!==u.turns){
          resource(b,u,'E2触发回合',u.turns);energy(b,u,rank(u,2,0));
        }
        // E4：能量上限为 0 的我方目标主动施放技能时，迷迷 +3% 充能。
        if(actor!==u&&actor.side===u.side&&(actor.energyMax??0)===0&&rank(u,4)&&['basic','skill','ultimate'].includes(key)&&kind!=='technique'){
          addCharge(b,u,rank(u,4,0)*100);
          buff(b,u,actor,'缪斯的新舞伴','marker',0,3,{id:u.id+':e4-sup',tag:'mimiE4'});
        }
        if(actor!==u)return;
        // 终结技后获得 1 层【史诗】（上限 2）。
        if(key==='ultimate'&&kind!=='copy')resource(b,u,'史诗',Math.min(EPIC_CAP,(u.resources['史诗']??0)+1));
        // 【明天，一同写下！】：开拓者 1.2 + 迷迷 1.2 全体冰伤，随后迷迷 +10% 充能。
        if(a?.name===u.actions.enhancedBasic?.name&&kind!=='copy'){
          const s=mimiOf(b,u),enh=sk(id,sid(id,8),'6');
          if(s){memiDamage(b,u,s,enh[1],'明天，一同写下！',list(d,'Normal')?.stance?.[1]??30);addCharge(b,u,enh[2]*100);}
          void key;
        }
        void hitTargets;
      },
      // 迷迷回合：充能满 → 【我会！帮你！】，否则自动【坏人！麻烦！】。
      turnStart(b,u,actor){
        if(actor&&actor.memospriteOwner===u.id){
          if(chargeOf(actor)>=100){actor.actions.basic=supportAction();actor.resources['施放声援']=1;}
          else{actor.actions.basic=servantActions().basic;actor.resources['施放声援']=0;}
        }
        if(actor===u)scanEnergy(b,u);
      },
      // 【迷迷的声援】：持有者每造成 1 次伤害，额外造成 36% 真实伤害。
      afterDamage(b,u,from,to,kind){
        // scanEnergy 会写日志，必须先取好「上一条伤害事件」。
        const ev=b.log[b.log.length-1];
        scanEnergy(b,u);
        if(kind==='true'||!from||from.side!==u.side||to.side===u.side)return;
        const owner=from.memospriteOwner?get(b,from.memospriteOwner):from;
        if(!owner)return;
        const has=owner.buffs.some(e=>e.tag==='mimiSupport')||(from!==owner&&owner.buffs.some(e=>e.tag==='mimiSupport'));
        if(!has)return;
        if(!ev||ev.type!=='damage'||!(ev.damage>0))return;
        trueDamage(b,from,to,ev.damage*supportRatio(b,u,owner),'迷迷的声援 · 真实伤害');
      },
      // 忆灵天赋 1800703：我方全体暴击伤害提高（迷迷暴伤 ×16.8% + 33.6%）。
      panel(b,u,target,out,{excludeConverted=false}={}){
        if(excludeConverted)return;
        if(target.memospriteOwner)return;
        if(target.side!==u.side)return;
        const s=mimiOf(b,u);if(!s)return;
        out.critDmg=(out.critDmg??0)+combatPanel(s).critDmg*MIMI.talent.p[0]+MIMI.talent.p[1];
      },
      death(b,u,from,to){if(to===u||to.memospriteOwner===u.id)dismiss(b,u);void from;},
      display(b,u){
        const s=mimiOf(b,u),out=[{type:'buff',id:u.id+':epic',source:u.id,name:'史诗',key:'marker',value:u.resources['史诗']??0,remaining:null,derived:true,tickOwner:u.id}];
        if(s)out.push({type:'buff',id:s.id+':charge',source:s.id,name:'迷迷充能',key:'marker',value:chargeOf(s),remaining:null,derived:true,tickOwner:s.id});
        return out;
      },
    };
    // 召唤迷迷：+50% 充能（1800705）；行迹 point06 首次召唤额外 +40%。
    function summon(b,u,ultimate){
      const fresh=!mimiAny(b,u)||mimiAny(b,u).active===false||mimiAny(b,u).hp<=1e-8;
      const s=spawnMimi(b,u);
      if(fresh){addCharge(b,u,MIMI.spawn.p[0]*100);if(trace(u,1)&&!u.resources['首次召唤已充能']){resource(b,u,'首次召唤已充能',1);addCharge(b,u,trace(u,1)[1]*100);}}
      void ultimate;
      return s;
    }
  };
}

function remembranceTrailblazerActions(id){
  const d=ROSTER_DATA[id],enh=sk(id,sid(id,8),'6');
  return (p,dd,{eidolon=0}={})=>{
    void eidolon;void dd;
    return {
      basic:basic(p,d,{terms:atk(p.Normal[0]),hitShares:[1],toughness:30,spGain:1,energyGain:20}),
      // 战技 800702：召唤迷迷 / 若已在场回复其生命上限 60% 并 +10% 充能（无伤害）。
      skill:skill(p,d,{target:'self',terms:[],hitShares:[1],spCost:1,energyGain:30}),
      // 终结技 800703：召唤迷迷、+40% 充能，随后迷迷对敌方全体造成 240% 攻击力冰伤。
      ultimate:ultimate(p,d,{target:'self',terms:[],hitShares:[1],energyCost:d.energyMax,energyGain:5}),
      // 【明天，一同写下！】800708：开拓者 120% + 迷迷 120% 全体冰伤，随后迷迷 +10% 充能。
      enhancedBasic:{name:d.skills[sid(id,8)].name,type:'Normal',element:elementOf(d.element),target:'all',
        terms:atk(enh[0]),hitShares:[1],toughness:list(d,'Normal')?.stance?.[0]??30,spGain:1,energyGain:30,spCost:0},
    };
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1404 万敌（虚数 · 毁灭）
// ═══════════════════════════════════════════════════════════════════════════
function mydeimos(api){
  const {live,allies,enemies,rank,trace,buff,resource,energy,damageTo,combatPanel,record,heal,advance,useAction}=api;
  const P=u=>u.kit.params;
  const d=ROSTER_DATA[1404];
  const bb=u=>tagOf(u,'mydeimosBB');
  const chargeOf=u=>u.resources['充能']??0;
  const ascendCost=u=>rank(u,6)?rank(u,6,0):P(u).Talent[2];
  const setCharge=(b,u,n)=>resource(b,u,'充能',Math.max(0,Math.min(200,n)));
  function loseHp(b,u,to,ratio){
    const lost=Math.min(Math.max(0,to.hp-1),to.hp*ratio);
    if(!(lost>0))return 0;
    to.hp-=lost;b.rules?.relics?.healthConsumed?.(b,to);
    record(b,'hp_consume',u,{target:to.id,amount:lost,hp:to.hp});
    return lost;
  }
  // 天赋 800404：每损失 1% 生命值积攒 1 点充能（上限 200）。
  function gainFromLoss(b,u,lost,enemySource){
    if(!(lost>0)||u.resources['禁止充能'])return;
    const max=combatPanel(u).hp;if(!(max>0))return;
    let pts=lost/max*100;
    // 行迹 point08「血祥罩衫」：受到敌方伤害造成的充能比例 +2.5%。
    if(enemySource&&trace(u,3))pts*=1+trace(u,3)[3];
    addCharge(b,u,pts);
  }
  function addCharge(b,u,n){
    if(!(n>0)||u.resources['禁止充能'])return;
    setCharge(b,u,chargeOf(u)+n);
    if(!bb(u)&&chargeOf(u)>=100)enterBB(b,u);
    else if(bb(u)&&chargeOf(u)>=ascendCost(u))resource(b,u,'待发弑神登神',1);
  }
  // 进入【血仇】：消耗 100 充能，回复 25% 生命上限，行动提前 100%，生命上限 +50%，防御力归 0。
  function enterBB(b,u){
    setCharge(b,u,chargeOf(u)-100);
    buff(b,u,u,'血仇','marker',0,null,{tag:'mydeimosBB'});
    buff(b,u,u,'血仇 · 生命上限','hpPct',P(u).Talent[4],null,{id:u.id+':bb-hp',tag:'mydeimosBBHp'});
    heal(b,u,u,combatPanel(u).hp*P(u).Talent[0]);
    advance(b,u.id,1);
    record(b,'mechanic',u,{name:'进入【血仇】'});
  }
  function exitBB(b,u){
    u.buffs=u.buffs.filter(e=>e.tag!=='mydeimosBB'&&e.tag!=='mydeimosBBHp');
  }
  function fireAscend(b,u){
    if(!bb(u)||chargeOf(u)<ascendCost(u))return false;
    setCharge(b,u,chargeOf(u)-ascendCost(u));resource(b,u,'待发弑神登神',0);
    useAction(b,u,'ascend','extra');
    return true;
  }
  return {
    start(b,u){
      resource(b,u,'充能',0);resource(b,u,'待发弑神登神',0);resource(b,u,'水与泥土',0);resource(b,u,'禁止充能',0);
      // 行迹 point08「血祥罩衫」：生命上限高于 4000 时，每超过 100 点暴击率 +1.2%（最多计入 4000 点），
      // 受到治疗回复量 +0.75%。
      if(trace(u,3)){
        const over=Math.min(trace(u,3)[1],Math.max(0,combatPanel(u).hp-trace(u,3)[0]));
        const crit=Math.floor(over/100)*trace(u,3)[2];
        if(crit>0)buff(b,u,u,'血祥罩衫 · 暴击率','critRate',crit,null,{id:u.id+':hp-crit'});
        buff(b,u,u,'血祥罩衫 · 受治疗','incomingHeal',trace(u,3)[4],null,{id:u.id+':hp-heal'});
      }
      // E6：进入战斗时立刻进入【血仇】。
      if(rank(u,6)){setCharge(b,u,100);enterBB(b,u);}
    },
    // 秘技 800407「折戟臣服的监牢」：敌方全体 80% 生命上限虚数伤害 + 嘲讽 1 回合，自身 +50 充能。
    entry(b,u){
      for(const to of enemies(b,u)){
        damageTo(b,u,to,{name:'折戟臣服的监牢',type:'Maze',element:'Imaginary',terms:[hpT(P(u).Maze[1])],toughness:mazeStance(1404)},1,'primary','technique');
        buff(b,u,to,'嘲讽','marker',0,P(u).Maze[3],{id:u.id+':taunt',tag:'mydeimosTaunt',debuff:true,control:'taunt'});
      }
      setCharge(b,u,chargeOf(u)+P(u).Maze[4]);
      if(!bb(u)&&chargeOf(u)>=100)enterBB(b,u);
    },
    // 【血仇】下防御力保持为 0（面板实时口径）。
    panel(b,u,target,out){if(target!==u)return;if(bb(u))out.def=0;},
    // 【血仇】时自身回合开始自动施放【弑王成王】。
    shouldUseSkill(b,u){return bb(u)?true:undefined;},
    prepare(b,u,key,kind,a){
      if(kind==='copy'||kind==='technique')return a;
      if(bb(u)&&key==='skill')return {...u.actions.enhancedSkill,targetId:a.targetId};
      // E1：【弑神登神】主目标倍率 +30% 并变为对敌方全体造成主目标倍率的伤害。
      if(key==='ascend'&&rank(u,1))return {...a,target:'all',terms:[{...hpT(sk(1404,'140411')[0]*(1+rank(u,1,0))),target:'all'}]};
      return a;
    },
    before(b,u,actor,key,kind,a,selected){
      if(actor!==u||kind==='copy')return;
      const p=P(u);
      if(key==='skill'){
        // 万死无悔 / 弑王成王：#3 当前生命值消耗（140402=50%，140409=35%）。
        const isKing=a?.name===d.skills['140409'].name;
        const ratio=isKing?sk(1404,'140409')[2]:p.BPSkill[2];
        gainFromLoss(b,u,loseHp(b,u,u,ratio),false);
      }
      if(key==='ultimate'){
        heal(b,u,u,combatPanel(u).hp*p.Ultra[2]);
        addCharge(b,u,p.Ultra[4]);
        for(const to of selected)if(live(to))buff(b,u,to,'诛天焚骨的王座 · 嘲讽','marker',0,p.Ultra[3],{id:u.id+':taunt',tag:'mydeimosTaunt',debuff:true,control:'taunt'});
      }
      if(key==='ascend'){resource(b,u,'禁止充能',1);resource(b,u,'上次弑神目标',selected[0]?.id??null);}
      void selected;
    },
    after(b,u,actor,key,kind,a,selected,hitTargets){
      scanConvert(b,u);
      if(actor!==u)return;
      if(key==='ascend')resource(b,u,'禁止充能',0);
      if(kind!=='technique'&&['skill','enhancedSkill','basic','ultimate'].includes(key))fireAscend(b,u);
      void a;void selected;void hitTargets;
    },
    // 敌方伤害 → 充能；E4 受到攻击后回复 10% 生命上限；E2 治疗转充能。
    afterDamage(b,u,from,to,kind){
      if(to===u&&from&&from.side!==u.side){
        const ev=b.log[b.log.length-1],lost=ev&&ev.type==='damage'?Math.max(0,ev.hpDamage??0):0;
        gainFromLoss(b,u,lost,true);
        if(rank(u,4))heal(b,u,u,combatPanel(u).hp*rank(u,4,0));
      }
      void kind;
    },
    turnStart(b,u,actor){
      if(actor!==u)return;
      resource(b,u,'禁止充能',0);
      if(!bb(u)&&chargeOf(u)>=100)enterBB(b,u);
      fireAscend(b,u);
    },
    // E2：接受治疗后会将 40% 的治疗数值转化为充能（单次行动最多累计 40 点）。
    beforeLethal(b,u,from,to){
      if(to!==u||!bb(u))return false;
      heal(b,u,u,combatPanel(u).hp*P(u).Talent[3]);
      setCharge(b,u,0);
      // 行迹 point06「水与泥土」：单场最多 3 次，受到致命攻击时不退出【血仇】。
      if(trace(u,1)&&(u.resources['水与泥土']??0)<trace(u,1)[0]){resource(b,u,'水与泥土',(u.resources['水与泥土']??0)+1);}
      else exitBB(b,u);
      void from;record(b,'mechanic',u,{name:'以血还血 · 免于无法战斗'});
      return true;
    },
    modifiers(b,u,actor,to,a,kind){
      const out={};if(actor!==u||to.side===u.side)return out;
      // E2：【血仇】期间造成的伤害无视 15% 防御力。
      if(bb(u)&&rank(u,2))out.defIgnore=(out.defIgnore??0)+rank(u,2,0);
      // E4：【血仇】期间暴击伤害 +30%。
      if(bb(u)&&rank(u,4))out.critDmg=(out.critDmg??0)+rank(u,4,1);
      void a;void kind;return out;
    },
    display(b,u){return [{type:'buff',id:u.id+':charge',source:u.id,name:'充能',key:'marker',value:chargeOf(u),remaining:null,derived:true,tickOwner:u.id}];},
  };
  // E2：扫描本行动内新产生的治疗，按 40% 转充能（单次行动上限 40 点）。
  function scanConvert(b,u){
    if(!rank(u,2))return;
    const from=u.resources['治疗扫描']??0;if(b.log.length<=from)return;
    let total=0;
    for(const e of b.log.slice(from))if(e.type==='heal'&&e.target===u.id)total+=e.amount;
    resource(b,u,'治疗扫描',b.log.length);
    if(total>0)addCharge(b,u,Math.min(rank(u,2,2),total*rank(u,2,1)));
  }
}

function mydeimosActions(){
  const d=ROSTER_DATA[1404],king=sk(1404,'140409'),ascend=sk(1404,'140411');
  return (p,dd,{eidolon=0}={})=>{
    void eidolon;void dd;
    return {
      basic:basic(p,d,{terms:hp(p.Normal[0]),hitShares:[1],toughness:30,spGain:1,energyGain:20}),
      // 战技 140402 万死无悔：不消耗战技点，主/相邻 90%/50% 生命上限。
      skill:skill(p,d,{target:'blast',terms:[...hp(p.BPSkill[0]),{...hp(p.BPSkill[1])[0],target:'adjacent'}],
        hitShares:[1],toughness:60,adjacentToughness:30,energyGain:30,spCost:0}),
      // 终结技 140403：主/相邻 160%/100%，削韧 60/60。
      ultimate:ultimate(p,d,{target:'blast',terms:[...hp(p.Ultra[0]),{...hp(p.Ultra[1])[0],target:'adjacent'}],
        hitShares:[1],toughness:60,adjacentToughness:60,energyCost:d.energyMax,energyGain:5}),
      // 弑王成王 140409（【血仇】回合开始自动施放）：主/相邻 110%/66%，生命消耗 35%。
      enhancedSkill:{name:d.skills['140409'].name,type:'BPSkill',element:'Imaginary',target:'blast',
        terms:[...hp(king[0]),{...hp(king[1])[0],target:'adjacent'}],hitShares:[1],toughness:60,adjacentToughness:30,energyGain:30,spCost:0,spGain:0},
      // 弑神登神 140411：充能 150（E6 100），主/相邻 280%/168%，2 段各 0.5。
      ascend:{name:d.skills['140411'].name,type:'BPSkill',element:'Imaginary',target:'blast',
        terms:[...hp(ascend[0]),{...hp(ascend[1])[0],target:'adjacent'}],hitShares:[.5,.5],toughness:90,adjacentToughness:60,energyGain:10,spCost:0,spGain:0},
    };
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1408 白厄（物理 · 毁灭）—— 能量上限 12 即【火种】；终结技变身卡厄斯兰那
// ═══════════════════════════════════════════════════════════════════════════
function phainon(api){
  const {live,allies,enemies,rank,trace,buff,resource,energy,damageTo,combatPanel,record,heal,advance,trueDamage}=api;
  const {scheduleActionEvents,cancelActionEvents,updateActionEventSpeed}=api;
  const P=u=>u.kit.params;
  const d=ROSTER_DATA[1408];
  const kh=u=>tagOf(u,'phainonKhaos');
  const ruin=u=>u.resources['毁伤']??0;
  const kForm=sk(1408,'140805');   // [4,0.25,0.125,0.8,2.7,0.15,0.2]
  const counter=sk(1408,'140809'); // [0.4,0.75,4,0.3,0.2]
  const nuke=sk(1408,'140811');    // [4.5,0.45,4,4,11.7]
  const enhN=sk(1408,'140808','6');// [2.5,0.75,2]
  const eventGroup='phainon-khaos-countdown';
  const poem=ROSTER_DATA[1415]?.skills?.['1141521']?.params?.['10']?.param_list??[.224,.15,5,.14,12,.168,1.008,6,4];
  // 【火种】= 引擎能量（上限 12）。溢出部分单独记账（Talent[3]=3 上限，E6 取消上限）。
  function addKindling(b,u,n){
    if(!(n>0))return;
    const cap=u.energyMax??12,want=Math.min(n,cap-u.energy);
    energy(b,u,want,true);
    const over=n-want;
    if(over>0){const max=rank(u,6)?Infinity:P(u).Talent[2];resource(b,u,'火种溢出',Math.min(max,(u.resources['火种溢出']??0)+over));}
  }
  function gainRuin(b,u,n){if(n>0)resource(b,u,'毁伤',ruin(u)+n);}
  function eventSpeed(u){
    const ratio=rank(u,1)?Math.min(rank(u,1,3),rank(u,1,4)+(u.resources['消灭计数']??0)*rank(u,1,0)):P(u).Ultra[2];
    return (u.baseSpeed??u.panel.speed)*ratio;
  }
  function beginKhaosCountdown(b,u){
    const count=P(u).Ultra[3],speed=eventSpeed(u);
    const cycle=(u.resources['永续行动循环']??0)+1;resource(b,u,'永续行动循环',cycle);
    resource(b,u,'卡厄斯兰那回合',count);
    // 源码确证：8 个 BattleEvent（11408）由 LoopExecuteTaskList 创建，各自 SetActionDelay。
    // NormalizedValue 的三个动态哈希（608586940 / 696029444 / 1979030979）在本地缓存中
    // 全部 ReadInfo.Type=None；但社区实测与配速计算给出一致口径：
    //   8 个额外回合共享一次行动条，总行动值 = 10000 / (基础速度 × 0.6)；
    //   首动不占行动值，其余 7 等分。因此距离为 0, 10000/7, …, 10000。
    // 来源：NGA 白厄配速帖（tid=44710678 / 44574669 / 44855203）与米游社机制文。
    // 该公式不使用动态哈希，哈希仍未映射；实现按社区实测口径落地，并在缺口台账注明来源层级。
    // Ultra 的 OnListenBattleEventDie 在有 Phainon_UltraBE 阵亡时才安装
    // RedirectActionDelayChange（→ Phainon_UltraBE.SortByActionOrder.Select2），倒计时归零时
    // 以 IsCancel 取消；因此倒计时初始不开启重定向，由 actionEventEnd 在首个阵亡后打开。
    scheduleActionEvents(b,u.id,Array.from({length:count},(_,i)=>({
      id:u.id+':phainon-khaos:'+String(cycle)+':'+String(i+1),name:'卡厄斯兰那倒计时 '+(i+1)+'/'+count,
      key:'basic',speed,distance:count>1?10000*i/(count-1):0,
    })),{group:eventGroup,suspendNormalGauge:true,redirectAdvance:false,noWaveReset:true});
  }
  // 境界【时墟铁墓】：变身期间敌方全体始终拥有物理属性弱点。
  // 原始脚本把 MAvatar_Phainon_00_Ultra_Weakness 作为 Ultra 的 Halo 子修饰器挂在
  // AllEnemyWithUnSelectable 上（STAT_AttachWeakness → StackWeakness Physical），
  // Ultra 移除时由 OnDestroy 一并删除，因此这里用同名 tag 的 buff 复刻该光环。
  function attachKhaosWeakness(b,u){
    for(const to of enemies(b,u))if(!to.buffs.some(e=>e.tag==='phainonUltraWeakness'))
      buff(b,u,to,'时墟铁墓 · 物理弱点','marker',0,null,{id:u.id+':khaos-weak',tag:'phainonUltraWeakness',weakness:'Physical'});
  }
  function endTransform(b,u){
    u.buffs=u.buffs.filter(e=>!['phainonKhaos','phainonKhaosAtk','phainonKhaosHp','phainonKhaosSpd'].includes(e.tag));
    // Ultra 的 OnDestroy 同时移除 Ultra_Weakness 光环，以及 MAvatar_Phainon_00_Guard
    // （Guard 的层数即【弑魂之炽】，因此层数与减伤 buff 一并清除）。
    for(const to of b.units)to.buffs=to.buffs.filter(e=>e.tag!=='phainonUltraWeakness');
    u.buffs=u.buffs.filter(e=>e.tag!=='phainonSoulfire');
    resource(b,u,'弑魂之炽',0);resource(b,u,'敌行动未叠层',0);
    u.counterMarkIds=[];
    // 行迹 point06：变身结束时获得 3 点【火种】；Talent 的溢出点数一并返还。
    addKindling(b,u,(trace(u,1)?trace(u,1)[0]:0)+(u.resources['火种溢出']??0));
    resource(b,u,'火种溢出',0);
    // 行迹 point08：变身结束时攻击力 +50%（最多 2 层）。
    if(trace(u,3))stacksUp(b,u,'phainonAtk','入战 / 变身结束 · 攻击力','atkPct',trace(u,3)[0],trace(u,3)[1]);
    // 卡厄斯兰那天赋：变身结束时我方全体速度 +15%，持续 1 回合。
    for(const to of allies(b,u))buff(b,u,to,'命运•此躯即神 · 速度','speedPct',kForm[5],1,{id:u.id+':khaos-spd'});
    cancelActionEvents(b,u.id,eventGroup);
    resource(b,u,'卡厄斯兰那回合',0);
    record(b,'mechanic',u,{name:'变身结束'});
  }
  function stacksUp(b,u,tag,name,key,per,max){
    const cur=tagOf(u,tag)?.stacks??0;if(cur>=max)return;
    const n=cur+1;buff(b,u,u,name,key,per*n,null,{id:u.id+':'+tag,tag,stacks:n});
  }
  // 最后一击：960% 攻击力物理终结伤害，由敌方全体均分；
  // 「每剩余 1 个卡厄斯兰那的额外回合，最后一击的伤害倍率减少原倍率的 #3=12.5%」。
  // remaining = 触发时点仍在行动条上的倒计时事件数；正常在第 8 个额外回合触发时为 0（全额）。
  function finalBlow(b,u,remaining=0){
    const pool=enemies(b,u);if(!pool.length)return;
    const mult=P(u).Ultra[0]*(1-kForm[2]*Math.max(0,remaining))/pool.length;
    for(const to of pool)damageTo(b,u,to,{name:'永劫燔世，其将背负 · 最后一击',type:'Ultra',element:'Physical',
      terms:atk(mult),toughness:60},1,'primary','direct');
  }
  function activeCountdowns(b,u){return b.actionEvents.filter(e=>e.active&&e.owner===u.id&&e.group===eventGroup).length;}
  return {
    shouldUseSkill(b,u){return !kh(u)||ruin(u)>=4||enemies(b,u).length>=3;},
    start(b,u){
      resource(b,u,'毁伤',0);resource(b,u,'火种溢出',0);resource(b,u,'弑魂之炽',0);resource(b,u,'反击层数',0);
      energy(b,u,-u.energy,true);                                  // 【火种】从 0 开始
      // E6：战斗开始时获得 6 点【火种】；行迹 point06：战斗开始 +1 点。
      if(rank(u,6))addKindling(b,u,rank(u,6,1));
      if(trace(u,1))addKindling(b,u,trace(u,1)[1]);
      // 行迹 point08：进入战斗时攻击力 +50%（最多 2 层）。
      if(trace(u,3))stacksUp(b,u,'phainonAtk','入战 / 变身结束 · 攻击力','atkPct',trace(u,3)[0],trace(u,3)[1]);
    },
    // 秘技 140807「终结之始」：每个波次开始时对敌方全体造成 200% 攻击力物理伤害；
    // 入战恢复队友 25 点能量、获得 2 点【毁伤】与 1 点战技点（此处按波次事件结算伤害）。
    entry(b,u){
      const p=P(u);
      for(const to of enemies(b,u))damageTo(b,u,to,{name:'终结之始',type:'Maze',element:'Physical',terms:atk(p.Maze[0]),toughness:mazeStance(1408)},1,'primary','technique');
      for(const to of allies(b,u))if(to!==u)energy(b,to,sk(1408,'140807','1')[2]);
      gainRuin(b,u,sk(1408,'140807','1')[1]);
      api.sp(b,u,sk(1408,'140807','1')[3],'终结之始');
    },
    waveStart(b,u){
      if(u.kit.technique)for(const to of enemies(b,u))damageTo(b,u,to,{name:'终结之始 · 波次',type:'Maze',element:'Physical',terms:atk(P(u).Maze[0]),toughness:mazeStance(1408)},1,'primary','technique');
      // Ultra_Weakness 是光环：新入场的敌人同样获得物理弱点。
      if(kh(u))attachKhaosWeakness(b,u);
    },
    // 卡厄斯兰那：普攻 →【创生•血棘渡亡】；战技 →【支柱•死星天裁】。
    prepare(b,u,key,kind,a){
      if(key==='ultimate'&&kind!=='copy'&&!kh(u))resource(b,u,'本次变身火种来源',(u.energy??0)+(u.resources['火种溢出']??0));
      if(kind==='copy'||kind==='technique'||!kh(u))return a;
      if(key==='basic')return {...u.actions.enhancedBasic,targetId:a.targetId};
      if(key==='skill')return {...(ruin(u)>=4?u.actions.enhancedSkill2:u.actions.enhancedSkill),targetId:a.targetId};
      return a;
    },
    // 天赋 140804：白厄成为其他任意目标的技能目标时 +1【火种】；若施放者为队友，暴击伤害 +30%/3 回合。
    before(b,u,actor,key,kind,a,selected){
      if(actor===u||!selected.includes(u))return;
      addKindling(b,u,1);
      // 每次队友技能把白厄选作目标都刷新天赋暴伤；没有原文规定的“每全局回合一次”限制。
      if(actor.side===u.side)buff(b,u,u,'此身为炬 · 暴击伤害','critDmg',P(u).Talent[0],P(u).Talent[1],{id:u.id+':talent-cd'});
      void key;void kind;void a;
    },
    // 终结技 140803：变身卡厄斯兰那。
    after(b,u,actor,key,kind,a,selected,hitTargets){
      // 行迹 point07：受到队友提供的治疗 / 护盾时伤害 +45%/4 回合（单回合 1 次），
      // 受到队友提供的能量恢复时获得 1 点【火种】。
      scanAllySupport(b,u);
      // 「献予『负世』之诗」：卡厄斯兰那每次施放攻击后，附加5段随机火伤。
      if(actor===u&&kh(u)&&u.resources['永续的燃烧']&&kind!=='copy'&&kind!=='technique'&&hitTargets.length){
        const pool=enemies(b,u);
        record(b,'mechanic',u,{name:'永续的燃烧 · 追加攻击',hits:poem[2],targets:pool.length});
        for(let i=0;i<poem[2]&&pool.length;i++){
          const to=pool[Math.floor(b.random()*pool.length)];
          damageTo(b,u,to,{name:'永续的燃烧 · 追加伤害 '+(i+1),type:'Additional',element:'Fire',terms:atk(poem[3]),toughness:0},1,'primary','additional');
        }
      }
      if(actor!==u)return;
      // 战技 140802 获得 2 点【火种】。
      if(key==='skill'&&kind!=='copy'&&!kh(u))addKindling(b,u,P(u).BPSkill[2]);
      if(key==='ultimate'&&kind!=='copy'&&!kh(u)){
        buff(b,u,u,'卡厄斯兰那','marker',0,null,{tag:'phainonKhaos',noUltimate:true});
        buff(b,u,u,'卡厄斯兰那 · 攻击力','atkPct',kForm[3],null,{id:u.id+':khaos-atk',tag:'phainonKhaosAtk'});
        buff(b,u,u,'卡厄斯兰那 · 生命上限','hpPct',kForm[4],null,{id:u.id+':khaos-hp',tag:'phainonKhaosHp'});
        beginKhaosCountdown(b,u);
        attachKhaosWeakness(b,u);
        // Ultra 的 OnStack：ByTargetListIntersects(AllTeamMemberWithUnselectable, CurrentTurnOwnerEntity)
        // → Remodifier(CurrentTurnOwnerEntity, StatusTypeMask="Buff", LifeTime>0) → LifeTime +1。
        // StatusTypeMask 只含 Buff，负面效果（e.debuff）不延长；判定不排除自身回合。
        const turnOwner=b.turnActor?b.units.find(x=>x.id===b.turnActor):null;
        if(turnOwner&&turnOwner.side===u.side)
          for(const e of turnOwner.buffs)if(!e.debuff&&e.remaining!=null&&e.remaining>0)e.remaining+=1;
        gainRuin(b,u,kForm[0]);
        if(u.resources['永续的燃烧']){
          const surplus=Math.max(0,(u.resources['本次变身火种来源']??12)-poem[4]);
          buff(b,u,u,'永续的燃烧 · 暴击率','critRate',poem[0],null,{id:u.id+':poem-phainon-cr'});
          buff(b,u,u,'永续的燃烧 · 暴击伤害','critDmg',Math.min(poem[6],surplus*poem[5]),null,{id:u.id+':poem-phainon-cd'});
        }
        // E1：施放终结技时暴击伤害 +50%，持续 3 回合。
        if(rank(u,1))buff(b,u,u,'火与光 · 暴击伤害','critDmg',rank(u,1,1),rank(u,1,2),{id:u.id+':e1-cd'});
        record(b,'mechanic',u,{name:'变身卡厄斯兰那'});
      }
      // 行迹 point07：受到队友提供的治疗或护盾时伤害 +45%/4 回合（单回合 1 次）。
      void a;void selected;void hitTargets;
    },
    // 前七个11408事件插入强化额外行动，第八个事件触发最后一击并结束变身。
    actionEventStart(b,u,e){
      if(e.group!==eventGroup)return;
      const index=Number(e.id.split(':').at(-1)),count=P(u).Ultra[3];
      if(index>=count){
        if(u.resources['永续的燃烧']){gainRuin(b,u,poem[8]);beginKhaosCountdown(b,u);return false;}
        // 最后一个额外回合开始时发动最后一击；此时本次倒计时已消耗，剩余事件为 0 → 全额倍率。
        finalBlow(b,u,activeCountdowns(b,u));endTransform(b,u);return false;
      }
      if(u.resources['永续的燃烧']){
        const lost=Math.min(Math.max(0,u.hp-1),u.hp*poem[1]);
        if(lost>0){u.hp-=lost;b.rules.relics.healthConsumed(b,u);record(b,'hp_consume',u,{amount:lost,hp:u.hp,reason:'永续的燃烧 · 额外回合'});}
      }
      const rotation=u.policy?.rotation;
      let key=u.policy?.basicOnly?'basic':Array.isArray(rotation)&&rotation.length?rotation[(u.turns+index-1)%rotation.length]:(u.actions.skill&&b.sp>=(u.actions.skill.spCost??0)&&b.rules.shouldUseSkill(b,u)!==false?'skill':'basic');
      if(!['basic','skill'].includes(key))key='basic';
      let action=b.rules.prepare(b,u,key,'extra',u.actions[key]);
      if((action.energyCost??0)>u.energy||b.sp<(action.spCost??0)){key='basic';action=b.rules.prepare(b,u,key,'extra',u.actions.basic);}
      e.key=key;
      return true;
    },
    actionEventEnd(b,u,e,result){
      if(e.group!==eventGroup)return;
      // Ultra 的 OnListenBattleEventDie：任一 Phainon_UltraBE 阵亡后，为仍在行动条上的倒计时
      // 安装 RedirectActionDelayChange（行动提前 → 最早倒计时）；归零时由 cancelActionEvents 一并清理。
      for(const other of b.actionEvents)if(other.group===eventGroup&&other.active)other.redirectAdvance=true;
      const parts=e.id.split(':'),eventCycle=Number(parts.at(-2)),index=Number(parts.at(-1));
      if(eventCycle!==(u.resources['永续行动循环']??1))return;
      resource(b,u,'卡厄斯兰那回合',Math.max(0,P(u).Ultra[3]-index));
      if(!result.executed&&index<P(u).Ultra[3])record(b,'assumption',u,{message:'卡厄斯兰那倒计时额外行动未执行'});
    },
    // E1「火与光，善恶的化身」：原始 Rank01 的 OnListenCharacterDie 只要求
    // 「ParamEntity = TeamDark（阵亡者）且 ParamEntity2 != TeamDark（击杀者为我方）」，
    // 并不要求击杀者是白厄、也不要求处于卡厄斯兰那形态——单场战斗中每次敌方阵亡都累加。
    death(b,u,from,to){
      if(to.side===u.side)return;
      if(rank(u,1)&&from&&from.side===u.side){
        resource(b,u,'消灭计数',(u.resources['消灭计数']??0)+1);
        updateActionEventSpeed(b,u.id,eventSpeed(u),eventGroup);
      }
    },
    // 卡厄斯兰那受到致命攻击时不会陷入无法战斗状态，而是回复 #2=25% 生命上限并立即发动最后一击。
    // （Ultra 的 OnLimboWaitHeal → Skill31_SelectTarget_OnLimbo，优先级 AvatarReviveSelf。）
    beforeLethal(b,u,from,to){
      if(to!==u||!kh(u))return false;
      resource(b,u,'致命反击待结算',1);
      void from;
      return true;
    },
    afterDamage(b,u,from,to,kind){
      if(to!==u||!u.resources['致命反击待结算'])return;
      resource(b,u,'致命反击待结算',0);
      // 原始 Skill31_SelectTarget_OnLimbo 的首个任务是 SetHP（ADF_MaxHPValue × #2=25%）：
      // 把当前生命直接设为生命上限的 25%，不是在此之上追加治疗；随后插入 Skill31 结算最后一击。
      const maxHp=combatPanel(u).hp,previous=u.hp;
      u.hp=Math.max(1,maxHp*kForm[1]);
      if(u.hp>previous)record(b,'heal',u,{target:u.id,amount:u.hp-previous,hp:u.hp,name:'命运•此躯即神 · 生命回复'});
      const remaining=activeCountdowns(b,u);
      finalBlow(b,u,remaining);
      endTransform(b,u);
      record(b,'mechanic',u,{name:'命运•此躯即神 · 致命反击',remaining});
      void from;void kind;
    },
    // 卡厄斯兰那免疫控制类负面状态。
    attacked(b,u,to){if(to===u&&kh(u))u.buffs=u.buffs.filter(e=>e.control!=='freeze');},
    modifiers(b,u,actor,to,a,kind){
      const out={};if(to.side===u.side)return out;
      const fromSelf=actor===u;
      if(!fromSelf)return out;
      // E2：卡厄斯兰那的物理属性抗性穿透 +20%。
      if(kh(u)&&rank(u,2))out.resPen=(out.resPen??0)+rank(u,2,1);
      // 行迹 point07：受队友治疗 / 护盾后增伤 45%。
      const t7=tagOf(u,'phainonTrace7');if(t7)out.dmgBoost=(out.dmgBoost??0)+t7.value;
      void a;void kind;return out;
    },
    display(b,u){return [{type:'buff',id:u.id+':kindling',source:u.id,name:'火种',key:'marker',value:u.energy,remaining:null,derived:true,tickOwner:u.id},
      {type:'buff',id:u.id+':ruin',source:u.id,name:'毁伤',key:'marker',value:ruin(u),remaining:null,derived:true,tickOwner:u.id}];},
  };
  // 行迹 point07：扫描队友提供的治疗 / 护盾 / 能量恢复。
  function scanAllySupport(b,u){
    if(!trace(u,2))return;
    const from=u.resources['支援扫描']??0;
    if(b.log.length<=from)return;
    let support=false,energyGift=false;
    for(const e of b.log.slice(from)){
      const src=e.actor?b.units.find(x=>x.id===e.actor):null;
      if((e.type==='heal'||e.type==='shield')&&e.actor&&e.actor!==u.id&&e.target===u.id&&src?.side===u.side)support=true;
      if(e.type==='energy'&&e.actor===u.id&&b.activeAction?.actor&&b.activeAction.actor!==u.id)energyGift=true;
    }
    resource(b,u,'支援扫描',b.log.length);
    // 冷却按「白厄自身回合结束」移除：原始 CD M_Phainon_00_Tree02_CD 的
    // ReferenceModifierName 为 MReference_Mark_RemoveOnTurnEnd（挂在施法者自身），
    // 对照波提欧 E2 的 MAvatar_Boothill_00_Rank02_CD 使用 OnListenTurnEnd（任意单位回合结束）。
    // 因此该窗口必须记 u.turns；b.turns 会在任意单位行动时变化，导致自身回合已过却仍被抑制。
    if(support&&u.resources['支援扫描回合']!==u.turns){
      resource(b,u,'支援扫描回合',u.turns);
      buff(b,u,u,'身承炎炬万千','dmgBoost',trace(u,2)[0],trace(u,2)[1],{id:u.id+':phainonTrace7',tag:'phainonTrace7'});
    }
    if(energyGift&&u.resources['充能扫描']!==(b.activeAction?.sequence??b.turns)){
      resource(b,u,'充能扫描',b.activeAction?.sequence??b.turns);
      addKindling(b,u,trace(u,2)[2]);
    }
  }
}

// 卡厄斯兰那的强化战技 / 支柱•死星天裁 / 灾厄•弑魂焚诏 / 最后一击（伤害在钩子里逐段结算）。
function phainonExtra(api){
  const {allies,enemies,rank,trace,buff,resource,damageTo,combatPanel,record,advance,trueDamage,cleanseOne}=api;
  const P=u=>u.kit.params;
  const kh=u=>tagOf(u,'phainonKhaos');
  const ruin=u=>u.resources['毁伤']??0;
  const counter=sk(1408,'140809'),nuke=sk(1408,'140811');
  function randomEnemy(b,u){const pool=enemies(b,u);return pool.length?pool[Math.floor(b.random()*pool.length)]:null;}
  function setRuin(b,u,n){resource(b,u,'毁伤',Math.max(0,n));}
  // MAvatar_Phainon_00_Guard 的命中回溯（TAvatar_Phainon_00_HitBackCheck）：
  // Skill21_Phase02 的 OnStart 依次执行 SetActionDelay(AllEnemy, 0) 与
  // AddModifier(AllEnemy, M_Phainon_00_Skill21_Mark)，即把「施放时在场的全部敌人」记为待反击目标；
  // Guard 的 OnListenBeforeSkillUse 在敌人行动前移除它自己的标记，随后 OnListenAfterAction /
  // OnAfterBeingAttacked 执行 HitBackCheck：Retarget(AllEnemy, 带 M_Phainon_00_Skill21_Mark,
  // MaxNumber 1) 失败（所有被标记的敌人都已行动完）且仍有存活敌人时，执行
  // TurnInsertAbility(Avatar_Phainon_00_Skill21_Insert_Phase01)。这正是 4.6 文本的
  // 「上述敌方目标行动完毕后，立即发动反击」，因此反击由最后一个被标记敌人的行动结束触发，
  // 而不是等到下一个卡厄斯兰那额外回合。
  function markSoulfireTargets(b,u){u.counterMarkIds=enemies(b,u).map(t=>t.id);}
  function consumeSoulfireMark(b,u,actorId){
    if(!Array.isArray(u.counterMarkIds))return false;
    // 已阵亡 / 退场的被标记目标不再阻塞判定（AllEnemy 只统计存活敌人）。
    u.counterMarkIds=u.counterMarkIds.filter(id=>{
      const t=b.units.find(x=>x.id===id);return !!t&&t.active!==false&&t.hp>1e-8;
    });
    const at=u.counterMarkIds.indexOf(actorId);if(at>=0)u.counterMarkIds.splice(at,1);
    return u.counterMarkIds.length===0;
  }
  function resolveSoulfire(b,u,actor){
    const layers=u.resources['弑魂之炽']??0;if(!(layers>0))return;
    const scale=1+counter[4]*layers;
    for(const to of enemies(b,u))damageTo(b,u,to,{name:'灾厄•弑魂焚诏 · 反击',type:'BPSkill',element:'Physical',terms:atk(counter[0]*scale),toughness:30},1,'primary','direct');
    for(let i=0;i<counter[2];i++){const to=randomEnemy(b,u);if(to)damageTo(b,u,to,{name:'灾厄•弑魂焚诏 · 额外伤害',type:'BPSkill',element:'Physical',terms:atk(counter[3]*scale),toughness:0},1,'primary','direct');}
    u.buffs=u.buffs.filter(e=>e.tag!=='phainonSoulfire');resource(b,u,'弑魂之炽',0);
    u.counterMarkIds=[];
    record(b,'mechanic',u,{name:'灾厄•弑魂焚诏 · 反击',trigger:actor?.id??null,layers});
  }
  // 卡厄斯兰那在此形态下没有普通回合；受到行动提前/插入时按队伍策略选择强化普攻 / 强化战技。
  function chooseKhaosKey(b,u){
    const rotation=u.policy?.rotation;
    let key=u.policy?.basicOnly?'basic':Array.isArray(rotation)&&rotation.length?rotation[u.turns%rotation.length]:(u.actions.skill&&b.sp>=(u.actions.skill.spCost??0)&&b.rules.shouldUseSkill(b,u)!==false?'skill':'basic');
    if(!['basic','skill'].includes(key))key='basic';
    return key;
  }
  return {
    before(b,u,actor,key,kind,a,selected){
      // MAvatar_Phainon_00_Guard 的 OnListenBeforeSkillUse：敌方（TeamDark）开始行动时，
      // 记下「本次行动尚未通过受击获得层数」。
      if(actor?.side==='enemy')resource(b,u,'敌行动未叠层',1);
      if(actor!==u||kind==='copy')return;
      if(a?.name===ROSTER_DATA[1408].skills['140809'].name){
        // 灾厄•弑魂焚诏：获得等同于敌方全体数量的【毁伤】和 1 层【弑魂之炽】（E4 +1），
        // 使敌方全体立即行动。反击在敌方行动结算后触发，不能在施放时提前结算。
        const n=enemies(b,u).length;
        setRuin(b,u,ruin(u)+n);
        const layers=1+(rank(u,4)?rank(u,4,0):0);
        resource(b,u,'弑魂之炽',layers);
        buff(b,u,u,'弑魂之炽 · 减伤','dmgReduction',counter[1],null,{id:u.id+':soulfire',tag:'phainonSoulfire'});
        markSoulfireTargets(b,u);
        for(const to of enemies(b,u))advance(b,to.id,1);
        record(b,'mechanic',u,{name:'灾厄•弑魂焚诏 · 等待敌方行动',targets:n,layers});
      }
      if(a?.name===ROSTER_DATA[1408].skills['140811'].name){
        // 支柱•死星天裁：解除自身所有负面效果；每消耗 1 点【毁伤】造成 4 次 45% 随机单体伤害；
        // 消耗 4 点及以上时额外造成 450% 攻击力伤害由敌方全体均分。
        u.buffs=u.buffs.filter(e=>!e.debuff);u.dots=[];
        const n=ruin(u);setRuin(b,u,0);
        const start=b.log.length;
        for(let i=0;i<n;i++)for(let j=0;j<nuke[2];j++){const to=randomEnemy(b,u);if(to)damageTo(b,u,to,{name:'支柱•死星天裁',type:'BPSkill',element:'Physical',terms:atk(nuke[1]),toughness:10},1,'primary','direct');}
        if(n>=nuke[3]){const pool=enemies(b,u);const each=pool.length?nuke[0]/pool.length:0;
          for(const to of pool)damageTo(b,u,to,{name:'支柱•死星天裁 · 终结',type:'BPSkill',element:'Physical',terms:atk(each),toughness:60},1,'primary','direct');}
        // E2：单次消耗 #1=4 点及以上【毁伤】时获得 1 个额外回合。
        // 原始 Skill22_Phase02：ByRankActivated + ByCompareDynamicValue(_prev_energy) 通过后
        // 直接 TurnInsertAction（插入一个可用回合），不是行动提前；因此这里向插入动作队列
        // 追加一个真实的额外行动，而不是推进行动条。
        if(rank(u,2)&&n>=rank(u,2,0)){
          const extraKey=chooseKhaosKey(b,u);
          b.queue.push({actor:u.id,key:extraKey,kind:'extra',targetId:selected?.[0]?.id});
          record(b,'mechanic',u,{name:'天与地 · 额外回合',key:extraKey,ruin:n});
        }
        // E6：攻击后对生命值最高的敌方目标额外造成本次总伤害 36% 的真实伤害。
        if(rank(u,6)){
          const total=b.log.slice(start).filter(e=>e.type==='damage'&&e.actor===u.id).reduce((s,e)=>s+e.damage,0);
          const pool=enemies(b,u);if(pool.length&&total>0){const to=pool.reduce((x,c)=>c.hp>x.hp?c:x);trueDamage(b,u,to,total*rank(u,6,0),'亘古长升，蚀火残阳');}
        }
        record(b,'mechanic',u,{name:'支柱•死星天裁',target:n});
      }
      if(key==='finalBlow'){void selected;}
      void a;void selected;
    },
    after(b,u,actor,key,kind,a,selected,hitTargets){
      // MAvatar_Phainon_00_Guard 的 OnListenAfterAction：敌方单位行动结束、且本回合内没有
      // 因「受击」叠层（_haveNotGainCountFromEnemyAction >= 1）时增加 1 层【弑魂之炽】，
      // 随后执行 TAvatar_Phainon_00_HitBackCheck。
      if(actor?.side==='enemy'){
        if((u.resources['弑魂之炽']??0)>0){
          if((u.resources['敌行动未叠层']??0)>=1)resource(b,u,'弑魂之炽',(u.resources['弑魂之炽']??0)+1);
          resource(b,u,'敌行动未叠层',0);
        }
        // 最后一个被标记的敌人行动完毕 → 立即插入反击（若仍有存活敌人且 Guard 仍在）。
        if(consumeSoulfireMark(b,u,actor.id)&&(u.resources['弑魂之炽']??0)>0&&enemies(b,u).length)
          resolveSoulfire(b,u,null);
      }
      // 强化普攻 140808【创生•血棘渡亡】获得 2 点【毁伤】。
      if(actor===u&&a?.name===ROSTER_DATA[1408].skills['140808'].name&&kind!=='copy')resource(b,u,'毁伤',ruin(u)+sk(1408,'140808','6')[2]);
      // 卡厄斯兰那施放攻击后回复 20% 生命上限。
      if(actor===u&&hitTargets?.length&&kh(u))api.heal(b,u,u,combatPanel(u).hp*sk(1408,'140805')[6]);
      void key;void kind;void selected;void a;
    },
    // 兜底路径：主触发点已改为「最后一个被标记敌人行动结束」（见 after 的 HitBackCheck）。
    // 若被标记的敌人没有机会行动（被冻结 / 跳过），仍有层数时在下一个卡厄斯兰那倒计时
    // 开始时按 MAvatar_Phainon_00_Guard 的 OnListenTurnBegin 结算一次，避免反击永久悬挂。
    actionEventStart(b,u,e){
      if(e.owner!==u.id)return;
      resolveSoulfire(b,u,null);
    },
    attacked(b,u,to,from){
      // MAvatar_Phainon_00_Guard 的 OnAfterBeingAttacked：Guard 的持有者（卡厄斯兰那本人）
      // 被敌方攻击时 +1 层，并把「未叠层」标记清零。
      if(to===u&&from?.side==='enemy'&&(u.resources['弑魂之炽']??0)>0){
        resource(b,u,'弑魂之炽',(u.resources['弑魂之炽']??0)+1);
        resource(b,u,'敌行动未叠层',0);
      }
    },
  };
}

function phainonActions(){
  const d=ROSTER_DATA[1408];
  return (p,dd,{eidolon=0}={})=>{
    void eidolon;void dd;
    return {
      basic:basic(p,d,{terms:atk(p.Normal[0]),hitShares:[1],toughness:30,spGain:1,energyGain:0}),
      // 战技 140802：主 300% + 相邻 120%，获得 2 点【火种】。
      skill:skill(p,d,{target:'blast',terms:[...atk(p.BPSkill[0]),{...atk(p.BPSkill[1])[0],target:'adjacent'}],
        hitShares:[1],toughness:60,adjacentToughness:30,energyGain:0,spCost:1}),
      // 终结技 140803：变身（无伤害），能耗 12 点【火种】。
      ultimate:ultimate(p,d,{target:'self',terms:[],hitShares:[1],energyCost:d.energyMax,energyGain:0}),
      // 卡厄斯兰那强化普攻 140808：主 250% / 相邻 75%，[.3,.7] 两段，削韧 90/60。
      enhancedBasic:{name:d.skills['140808'].name,type:'Normal',element:'Physical',target:'blast',
        terms:[...atk(sk(1408,'140808','6')[0]),{...atk(sk(1408,'140808','6')[1])[0],target:'adjacent'}],hitShares:[.3,.7],
        toughness:90,adjacentToughness:60,energyGain:0,spCost:0,spGain:0},
      // 灾厄•弑魂焚诏 140809 / 支柱•死星天裁 140811：伤害在机制钩子里逐段结算。
      enhancedSkill:{name:d.skills['140809'].name,type:'BPSkill',element:'Physical',target:'self',terms:[],hitShares:[1],energyGain:0,spCost:0,spGain:0},
      enhancedSkill2:{name:d.skills['140811'].name,type:'BPSkill',element:'Physical',target:'self',terms:[],hitShares:[1],energyGain:0,spCost:0,spGain:0},
      finalBlow:{name:'永劫燔世，其将背负 · 最后一击',type:'Ultra',element:'Physical',target:'all',terms:[],hitShares:[1],toughness:60,energyGain:0,spCost:0,spGain:0},
    };
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1509 吉尔伽美什（雷 · 毁灭）—— 联动 id，无 AvatarConfig
// ═══════════════════════════════════════════════════════════════════════════
function gilgamesh(api){
  const {live,allies,enemies,rank,trace,buff,resource,energy,damageTo,combatPanel,record,advance,heal,sp,delay}=api;
  const P=u=>u.kit.params;
  const d=ROSTER_DATA[1509];
  const T=u=>P(u).Talent;
  const interest=u=>u.resources['兴致']??0;
  const lifeInterest=u=>u.resources['兴致累计']??0;
  const excited=u=>u.resources['来兴致了']==1;
  const attackCount=u=>u.resources['攻击计数']??0;
  function setInterest(b,u,n){
    resource(b,u,'兴致',Math.max(0,n));
    buff(b,u,u,'兴致 · 速度','speedPct',T(u)[3]*interest(u),null,{id:u.id+':gilg-speed',tag:'gilgSpeed'});
  }
  // 每获得 1 点【兴致】→ 行迹 point07 暴击伤害 +25%（最多 6 层）。
  function addInterest(b,u,n){
    if(!(n>0))return;
    resource(b,u,'兴致累计',lifeInterest(u)+n);
    setInterest(b,u,interest(u)+n);
    if(trace(u,2))buff(b,u,u,'英雄的孤傲','critDmg',trace(u,2)[0]*Math.min(trace(u,2)[1],lifeInterest(u)),null,{id:u.id+':gilg-cd',tag:'gilgCd'});
    // 首次达到 Talent[1]=10 点 → 【来兴致了！】，持续整场战斗且仅能施放战技。
    if(!excited(u)&&interest(u)>=T(u)[1]){resource(b,u,'来兴致了',1);record(b,'mechanic',u,{name:'进入【来兴致了！】'});}
  }
  // 王之财宝：获得【王来承认】，使自身（E1：我方全体）造成伤害无视 30% 防御力，持续 3 回合。
  function crown(b,u){
    const p=P(u),dur=p.BPSkill[5];
    buff(b,u,u,'王来承认','defIgnore',p.BPSkill[4],dur,{id:u.id+':crown',tag:'gilgCrown'});
    if(rank(u,1)){
      for(const to of allies(b,u))if(to!==u)buff(b,u,to,'王来承认','defIgnore',p.BPSkill[4],dur,{id:u.id+':crown-team',tag:'gilgCrownTeam',removeOnSourceDeath:true});
      buff(b,u,u,'王来承认 · 攻击力','atkPct',rank(u,1,0),dur,{id:u.id+':crown-atk',tag:'gilgCrownAtk'});
    }
  }
  // 连携追加攻击（150905）：吉尔伽美什 / Saber 攻击累计 1 点，达到 8 点时发动。
  function addAttackCount(b,u,n){
    const need=sk(1509,'150905')[4];
    const v=attackCount(u)+n;resource(b,u,'攻击计数',v);
    if(v>=need&&!b.queue.some(q=>q.actor===u.id&&q.key==='followup')){
      resource(b,u,'攻击计数',0);
      b.queue.push({actor:u.id,key:'followup',kind:'followup'});
    }
  }
  return {
    start(b,u){
      resource(b,u,'兴致',0);resource(b,u,'兴致累计',0);resource(b,u,'来兴致了',0);
      resource(b,u,'攻击计数',0);resource(b,u,'黄金律',0);resource(b,u,'黄金律消耗',0);
      // 初始自身回合开始时自动施放普攻（shouldUseSkill 在第 1 回合返回 false）。
      // E2：进入战斗时获得 5 点【兴致】。
      if(rank(u,2))addInterest(b,u,rank(u,2,0));
      // E4：能量恢复效率提高 20%。
      if(rank(u,4))buff(b,u,u,'人神诀别之剑','energyRegen',rank(u,4),null,{id:u.id+':e4-er',tag:'gilgE4'});
    },
    // 秘技 150907「天之锁」：对敌方全体造成 200% 攻击力雷伤，并获得 3 点【兴致】。
    entry(b,u){
      for(const to of enemies(b,u))damageTo(b,u,to,{name:'天之锁',type:'Maze',element:'Thunder',terms:atk(P(u).Maze[1]),toughness:mazeStance(1509)},1,'primary','technique');
      addInterest(b,u,P(u).Maze[2]);
    },
    // 【来兴致了！】仅能施放战技；第 1 个自身回合强制普攻。
    shouldUseSkill(b,u){if(excited(u))return true;if(u.turns<=1)return false;return undefined;},
    // E2：王之财宝对主目标倍率 +100%、相邻 +50%。
    prepare(b,u,key,kind,a){
      if(kind==='copy'||kind==='technique')return a;
      if(key==='skill'&&rank(u,2)){
        const terms=(a.terms??[]).map(t=>t.target==='adjacent'?{...t,multiplier:t.multiplier*(1+rank(u,2,3))}:{...t,multiplier:t.multiplier*(1+rank(u,2,2))});
        return {...a,terms};
      }
      return a;
    },
    before(b,u,actor,key,kind,a,selected){
      if(actor!==u||kind==='copy')return;
      if(key==='ultimate'){
        // E6：自身施放终结技时消耗全部【黄金律】。
        const g=u.resources['黄金律']??0;resource(b,u,'黄金律',0);resource(b,u,'黄金律消耗',g);
      }
      void selected;void a;
    },
    after(b,u,actor,key,kind,a,selected,hitTargets){
      if(actor===u&&['basic','skill','enhancedBasic','ultimate','followup'].includes(key)&&hitTargets?.length)addAttackCount(b,u,1);
      // Saber（1014）攻击也累计攻击计数。
      if(actor!==u&&actor.side===u.side&&actor.characterId===1014&&hitTargets?.length)addAttackCount(b,u,1);
      // 天赋 150904：我方其他目标行动时，吉尔伽美什获得 1 点【兴致】。
      if(actor!==u&&actor.side===u.side&&!['technique','copy'].includes(kind)&&['basic','skill','ultimate'].includes(key))addInterest(b,u,1);
      // 我方其他角色施放终结技 →【王来背负】终结技伤害 +40%/3 回合；行迹 point06 额外 +2 兴致并固定回能。
      if(actor!==u&&actor.side===u.side&&key==='ultimate'&&kind!=='copy'){
        buff(b,u,u,'王来背负','dmgBoost',T(u)[2],T(u)[0],{id:u.id+':carry',tag:'gilgCarry',abilityType:'Ultra'});
        if(trace(u,1)){
          addInterest(b,u,trace(u,1)[0]);
          const cost=a?.energyCost??actor.actions?.ultimate?.energyCost??0;
          energy(b,u,cost*trace(u,1)[1],true);
        }
        // E6：队友施放终结技时获得 1 点【黄金律】（最多 3 点）。
        if(rank(u,6))resource(b,u,'黄金律',Math.min(rank(u,6,2),(u.resources['黄金律']??0)+1));
      }
      if(actor!==u)return;
      if(key==='skill'&&kind!=='copy'){
        crown(b,u);
        // E1：施放战技时额外固定恢复 40 点能量。
        if(rank(u,1))energy(b,u,rank(u,1,1),true);
        // 【来兴致了！】下施放战技后清空自身【兴致】。
        if(excited(u))setInterest(b,u,0);
      }
      if(key==='ultimate'&&kind!=='copy'){
        // 行迹 point06：自身终结技 +2 点【兴致】；E2 额外 +5 点。
        addInterest(b,u,trace(u,1)?trace(u,1)[2]:0);
        if(rank(u,2))addInterest(b,u,rank(u,2,1));
        resource(b,u,'黄金律消耗',0);
      }
      // 连携追加攻击：吉尔伽美什 400% 雷伤全体（4 段 [.2,.2,.2,.4]）+（若有 Saber）Saber 600% 风伤全体。
      if(key==='followup'&&kind!=='copy'){
        const f=sk(1509,'150905');
        for(const share of [.2,.2,.2,.4])for(const to of enemies(b,u))
          damageTo(b,u,to,{name:'本王允许你进攻',type:'Talent',element:'Thunder',terms:atk(f[0]*share),toughness:60},1,'primary','followup');
        addInterest(b,u,f[2]);
        const saber=allies(b,u).find(t=>t.characterId===1014);
        if(saber){
          for(const to of enemies(b,u))damageTo(b,saber,to,{name:'本王允许你进攻 · Saber',type:'Talent',element:'Wind',terms:atk(f[1]),toughness:60},1,'primary','followup');
          energy(b,saber,f[3],true);
          buff(b,saber,saber,'誓约胜利之剑','marker',0,null,{id:u.id+':saber-next',tag:'gilgSaberNext'});
        }
      }
      void a;void selected;
    },
    modifiers(b,u,actor,to,a,kind){
      const out={};if(to.side===u.side)return out;
      if(actor!==u&&actor.side!==u.side)return out;
      // E6：吉尔伽美什在场时我方全体抗性穿透 +20%。
      if(rank(u,6))out.resPen=(out.resPen??0)+rank(u,6,1);
      // E6：自身终结技每消耗 1 点【黄金律】暴击伤害 +100%。
      if(actor===u&&a?.type==='Ultra'&&rank(u,6))out.critDmg=(out.critDmg??0)+(u.resources['黄金律消耗']??0)*rank(u,6,3);
      void kind;return out;
    },
    // 行迹 point08「王霸的竞逐」：我方全体攻击力 +20%、暴击伤害 +20%；能量上限 >140 的目标
    // 每超过 1 点额外 +1%（上限 +100%）。
    panel(b,u,target,out){
      if(target.side!==u.side)return;
      const t=trace(u,3);if(!t)return;
      const over=Math.max(0,(target.energyMax??0)-t[2]),extra=Math.min(t[4],over*t[3]);
      out.atk+=(out.baseStats?.atk??0)*(t[0]+extra);
      out.critDmg=(out.critDmg??0)+t[1]+extra;
    },
    death(b,u,from,to){void from;void to;},
    display(b,u){return [{type:'buff',id:u.id+':interest',source:u.id,name:'兴致',key:'marker',value:interest(u),remaining:null,derived:true,tickOwner:u.id},
      {type:'buff',id:u.id+':golden',source:u.id,name:'黄金律',key:'marker',value:u.resources['黄金律']??0,remaining:null,derived:true,tickOwner:u.id}];},
  };
}

function gilgameshActions(){
  const d=ROSTER_DATA[1509];
  return (p,dd,{eidolon=0}={})=>{
    const bounce=p.Ultra[1]*(eidolon>=6?1+dd.ranks[6][0]:1);
    void eidolon;
    return {
      basic:basic(p,d,{terms:atk(p.Normal[0]),hitShares:[.3,.3,.4],toughness:30,spGain:1,energyGain:20}),
      // 王之财宝 150902：主 280% + 相邻 140%，5 段 [.1,.1,.2,.2,.4]，不消耗战技点。
      skill:skill(p,d,{target:'blast',terms:[...atk(p.BPSkill[0]),{...atk(p.BPSkill[1])[0],target:'adjacent'}],
        hitShares:[.1,.1,.2,.2,.4],toughness:60,adjacentToughness:30,energyGain:30,spCost:0}),
      // 天地乖离•开辟之星 150903：全体 400% + 10 次随机单体 100%（E6 弹射倍率 +80%）。
      ultimate:ultimate(p,d,{target:'all',terms:atk(p.Ultra[0]),hitShares:[1],toughness:120,energyCost:d.energyMax,energyGain:5,
        bounceCount:p.Ultra[2],bounceTerms:atk(bounce),bounceToughness:6}),
      // 漫不经心 150909：强化普攻 140% 单体 3 段 [.3,.3,.4]。
      enhancedBasic:{name:d.skills['150909'].name,type:'Normal',element:'Thunder',target:'single',
        terms:atk(sk(1509,'150909')[0]),hitShares:[.3,.3,.4],toughness:30,spGain:1,energyGain:20,spCost:0},
      // 连携追加攻击 150905：全体 400% 雷伤 4 段 [.2,.2,.2,.4]（伤害在 after 钩子内逐段结算）。
      followup:{name:d.skills['150905'].name,type:'Talent',element:'Thunder',target:'all',
        terms:[],hitShares:[.2,.2,.2,.4],toughness:60,energyGain:10,spCost:0,spGain:0},
    };
  };
}

// ── 工厂表 ────────────────────────────────────────────────────────────────
const pTB=physicalTrailblazer(8001),pTB2=physicalTrailblazer(8002);
const rTB=remembranceTrailblazer(8007),rTB2=remembranceTrailblazer(8008);
const factories={
  8001:pTB,
  8002:pTB2,
  8007:rTB,
  8008:rTB2,
  1404:mydeimos,
  1408:function(api){const a=phainon(api),b=phainonExtra(api);
    return {...a,before(b2,u,actor,key,kind,act,selected){a.before?.(b2,u,actor,key,kind,act,selected);b.before?.(b2,u,actor,key,kind,act,selected);},
      after(b2,u,actor,key,kind,act,selected,hitTargets){a.after?.(b2,u,actor,key,kind,act,selected,hitTargets);b.after?.(b2,u,actor,key,kind,act,selected,hitTargets);},
      turnStart(b2,u,actor){a.turnStart?.(b2,u,actor);b.turnStart?.(b2,u,actor);},
      // 倒计时事件开始：先按 Guard 的 OnListenTurnBegin 结算反击（TurnInsertAbility），
      // 再走倒计时自身的「最后一击 / 永续的燃烧刷新 / 强化行动」判定。
      actionEventStart(b2,u,e){b.actionEventStart?.(b2,u,e);return a.actionEventStart?.(b2,u,e);},
      attacked(b2,u,to,from){a.attacked?.(b2,u,to,from);b.attacked?.(b2,u,to,from);}};},
  1509:gilgamesh,
};
const actions={
  8001:physicalTrailblazerActions(8001),
  8002:physicalTrailblazerActions(8002),
  8007:remembranceTrailblazerActions(8007),
  8008:remembranceTrailblazerActions(8008),
  1404:mydeimosActions(),
  1408:phainonActions(),
  1509:gilgameshActions(),
};

export {factories,actions};
