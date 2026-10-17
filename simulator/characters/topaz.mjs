// Accepted Topaz extraction from batch04; source revision 312b4597691e0a29cf9828a15b592757dba86949.
const clone=x=>JSON.parse(JSON.stringify(x));const ELEMENT={物理:'Physical',火:'Fire',冰:'Ice',雷:'Thunder',风:'Wind',量子:'Quantum',虚数:'Imaginary'};
export const elementOf=s=>ELEMENT[s]??s;
export const atk=m=>[{scaling:'atk',multiplier:m}];
export const hp=m=>[{scaling:'hp',multiplier:m}];
export const def=m=>[{scaling:'def',multiplier:m}];
const nameOf=(d,type)=>Object.values(d.skills??{}).find(s=>s.type===type)?.name??type;
// mk：统一的动作外壳，字段与既有 registeredActions 保持同一口径。
const mk=(element,type,name,o={})=>Object.assign({name,type,element,target:'single',terms:[],energyGain:20,spCost:0,spGain:0,toughness:0,hitShares:[1]},o);
export function basic(p,d,o={}){return mk(elementOf(d.element),'Normal',nameOf(d,'Normal'),Object.assign({terms:atk(p.Normal[0]),toughness:30,spGain:1,energyGain:20},o));}
export function skill(p,d,o={}){return mk(elementOf(d.element),'BPSkill',nameOf(d,'BPSkill'),Object.assign({energyGain:30,spCost:1},o));}
export function ultimate(p,d,o={}){return mk(elementOf(d.element),'Ultra',nameOf(d,'Ultra'),Object.assign({energyGain:5,energyCost:d.energyMax},o));}
export function talentAction(p,d,o={}){return mk(elementOf(d.element),'Talent',nameOf(d,'Talent'),Object.assign({energyGain:10},o));}


export const topazActions=(p,d)=>({
    basic:basic(p,d,{terms:[],toughness:0}),
    basicShot:basic(p,d,{name:'赤字… · 追击',terms:atk(p.Normal[0]),hitShares:[1],toughness:30,energyGain:0,spGain:0}),
    skill:skill(p,d,{terms:[],toughness:0}),
    numby:talentAction(p,d,{name:'账账 · 突击',terms:atk(p.Talent[1]),hitShares:Array(7).fill(1/7),toughness:60,energyGain:0,numby:true}),
    numbyUlt:talentAction(p,d,{name:'账账 · 涨幅惊人！',terms:atk(p.Talent[1]+p.Ultra[0]),hitShares:[...Array(7).fill(.1),.3],toughness:60,energyGain:0,numby:true}),
    ultimate:ultimate(p,d,{target:'self',terms:[],toughness:0}),
  });

export function topaz(api){const {allies,enemies,live,rank,trace,buff,stacks,resource,energy,advance,combatPanel,damageTo,record}=api;
  const mark=(u,to)=>to.buffs.find(e=>e.source===u.id&&e.tag==='topazDebt');
  const marked=(b,u)=>enemies(b,u).find(t=>mark(u,t));
  const numby=(b,u)=>b.summons.find(s=>s.owner===u.id&&s.kind==='countdown');
  const applyMark=(b,u,to)=>{for(const t of b.units)t.buffs=t.buffs.filter(e=>!(e.source===u.id&&(e.tag==='topazDebt'||e.tag==='topazExecuted')));
    buff(b,u,to,'负债证明','marker',0,null,{tag:'topazDebt',debuff:true,removeOnSourceDeath:true});};
  const advanceNumby=(b,u,ratio)=>{const s=numby(b,u);if(!s)return;s.distance=Math.max(0,s.distance-10000*ratio);record(b,'advance',u,{name:'账账行动提前',target:s.id,ratio,distance:s.distance});};
  const numbyAttack=(b,u,to)=>{const s=numby(b,u),enhanced=!!(s&&s.enhanced>0),a=enhanced?u.actions.numbyUlt:u.actions.numby;
    for(const share of a.hitShares)damageTo(b,u,to,a,share,'primary','followup');
    if(s&&enhanced){s.enhanced--;resource(b,u,'涨幅惊人',s.enhanced);
      if(trace(u,3))energy(b,u,trace(u,3)[0]);record(b,'mechanic',u,{name:'账账涨幅攻击',remaining:s.enhanced});}
    if(u.resources['明补待触发']){resource(b,u,'明补待触发',0);energy(b,u,u.kit.params.Maze[0],true);}};
  return {
    start(b,u){resource(b,u,'涨幅惊人',0);
      b.summons.push({id:u.id+':numby',name:'账账',owner:u.id,kind:'countdown',speed:u.kit.params.Talent[0],distance:10000,enhanced:0,active:true,order:b.units.length+b.summons.length});
      record(b,'summon',u,{name:'召唤账账',speed:u.kit.params.Talent[0]});},
    // 秘技「明补」：账账首次攻击后托帕恢复 60 点能量（不吃回能效率）。
    entry(b,u){resource(b,u,'明补待触发',1);},
    // 我方目标回合开始时若无【负债证明】，随机敌方目标重新陷入。
    turnStart(b,u,actor){if(actor.side!==u.side||marked(b,u))return;const pool=enemies(b,u);if(!pool.length)return;
      applyMark(b,u,pool[Math.floor(b.random()*pool.length)]);},
    // 终结：账账进入【涨幅惊人！】。
    before(b,u,actor,key,kind,a,selected){if(actor!==u||key!=='ultimate')return;const s=numby(b,u);if(!s)return;
      s.enhanced=u.kit.params.Ultra[3]+(rank(u,6)?u.kit.ranks[6][0]:0);s.active=true;resource(b,u,'涨幅惊人',s.enhanced);
      record(b,'resource',u,{name:'涨幅惊人',value:s.enhanced});},
    after(b,u,actor,key,kind,a,selected,hits){const p=u.kit.params;
      const enhancedBeforeAttack=!!(numby(b,u)?.enhanced>0);
      let ownFollowupTarget=null;
      if(actor===u){
        if(key==='basic'){const to=selected[0];if(to&&live(to)){
          const isFollowup=!!trace(u,1);
          damageTo(b,u,to,u.actions.basicShot,1,'primary',isFollowup?'followup':'direct');
          if(isFollowup)ownFollowupTarget=to;
        }}
        if(key==='skill'){const to=selected[0];if(to)applyMark(b,u,to);if(to&&live(to)){
          numbyAttack(b,u,to);ownFollowupTarget=to;
        }}
      }
      // 涨幅期间：标记目标被我方普攻 / 战技 / 终结命中时，账账行动提前（不限于托帕自己的动作）。
      // 天赋 111204：我方目标对【负债证明】目标发动追加攻击时，账账行动提前 Talent[2]=50%；
      // 「在账账自身回合内，无法触发行动提前效果」，故排除账账自己的行动。
      const s=numby(b,u);
      // 自身伤害在此after内才结算，传入hits是此前的快照；不能靠外层normal kind识别内部追击。
      const hitDebt=hits.some(t=>mark(u,t))||(ownFollowupTarget&&mark(u,ownFollowupTarget));
      if(s&&b.turnActor!==s.id&&actor?.side===u.side&&hitDebt){
        if(kind==='followup'||ownFollowupTarget)advanceNumby(b,u,p.Talent[2]);
        // 普攻/战技本身可以视为追击，两条独立条件均满足时分别生效；使用攻击前状态覆盖最后一次涨幅攻击。
        if(enhancedBeforeAttack&&['Normal','BPSkill','Ultra'].includes(a.type))advanceNumby(b,u,p.Ultra[2]);
      }},
    // E1【被执行】：标记目标受到追击时叠暴伤（单次攻击最多 1 次，标记移除时一并移除）。
    afterHit(b,u,actor,to,a,kind,info){void info;if(!rank(u,1)||kind!=='followup'||!actor||actor.side!==u.side||!mark(u,to))return;
      const seq=b.activeAction?.sequence;
      if(seq!=null&&u.resources['被执行标记']===seq)return;
      if(seq!=null)resource(b,u,'被执行标记',seq);
      stacks(b,u,to,'被执行','marker',0,u.kit.ranks[1][1],null,{id:u.id+':topazExecuted',debuff:true,tag:'topazExecuted'});},
    // 账账自身回合：E4 提前托帕，攻击标记目标，E2 回能。
    summonTurn(b,u,s){if(s.kind!=='countdown'||s.owner!==u.id)return;
      if(!live(u)){s.active=false;return;}
      if(rank(u,4))advance(b,u.id,u.kit.ranks[4][0]);
      const to=marked(b,u)??enemies(b,u).slice().sort((a,c)=>a.hp-c.hp)[0];
      if(!to){record(b,'mechanic',u,{name:'账账无目标'});return;}
      numbyAttack(b,u,to);
      if(rank(u,2))energy(b,u,u.kit.ranks[2][0]);},
    modifiers(b,u,actor,to,a,kind){const out={};
      // 【负债证明】是「受到的追加攻击伤害提高 BPSkill[1]=50%」，属易伤乘区（vuln），不是增伤（dmgBoost）。
      if(kind==='followup'&&actor&&actor.side===u.side&&mark(u,to))out.vuln=(out.vuln??0)+u.kit.params.BPSkill[1];
      if(actor===u&&trace(u,2)&&a.element==='Fire'&&((to.weaknesses??[]).includes('Fire')||to.buffs.some(e=>e.weakness==='Fire')))out.dmgBoost=(out.dmgBoost??0)+trace(u,2)[0];
      if(a.numby){const s=numby(b,u);
        if(s&&s.enhanced>0){out.critDmg=(out.critDmg??0)+u.kit.params.Ultra[1];if(rank(u,6))out.resPen=(out.resPen??0)+u.kit.ranks[6][1];}}
      const e=to.buffs.find(x=>x.source===u.id&&x.tag==='topazExecuted');
      if(e&&kind==='followup'&&rank(u,1))out.critDmg=(out.critDmg??0)+(e.stacks??0)*u.kit.ranks[1][0];
      void actor;return out;},
    display(b,u,to){const s=numby(b,u);if(!s)return [];const out=[];
      out.push({type:'buff',id:s.id+':timer',source:u.id,name:'账账行动条',key:'speed',value:s.speed,remaining:s.speed>0?Math.round(s.distance/s.speed*100)/100:null,derived:true,note:'剩余行动值'});
      if(s.enhanced>0)out.push({type:'buff',id:s.id+':enhance',source:u.id,name:'涨幅惊人！剩余攻击次数',key:'marker',value:s.enhanced,derived:true});
      if(to&&to.side!==u.side&&mark(u,to))out.push({type:'debuff',id:u.id+':topazDebt',source:u.id,name:'负债证明 · 受追击额外伤害',key:'vuln',value:u.kit.params.BPSkill[1],derived:true});
      return out;},
  };
}
