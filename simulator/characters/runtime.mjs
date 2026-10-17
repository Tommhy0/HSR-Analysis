import {bronya} from './bronya.mjs';
import {natasha} from './natasha.mjs';
import {tingyun} from './tingyun.mjs';
import {sunday} from './sunday.mjs';
import {tribbie} from './tribbie.mjs';
import {asta} from './asta.mjs';
import {pela} from './pela.mjs';
import {hanya} from './hanya.mjs';
import {gallagher} from './gallagher.mjs';
import {danheng} from './danheng.mjs';
import {serval} from './serval.mjs';
import {herta} from './herta.mjs';
import {ruanmei} from './ruanmei.mjs';
import {robin} from './robin.mjs';
import {luocha} from './luocha.mjs';
import {bailu} from './bailu.mjs';
import {gepard} from './gepard.mjs';
import {huohuo} from './huohuo.mjs';
import {lynx} from './lynx.mjs';
import {yukong} from './yukong.mjs';
import {march7} from './march7.mjs';
import {EXTRA_FACTORIES} from './extra/index.mjs';
const factories={1101:bronya,1105:natasha,1202:tingyun,1313:sunday,1403:tribbie,1009:asta,1106:pela,1215:hanya,1301:gallagher,1002:danheng,1103:serval,1013:herta,1303:ruanmei,1309:robin,1203:luocha,1211:bailu,1104:gepard,1217:huohuo,1110:lynx,1207:yukong,1001:march7,...EXTRA_FACTORIES};
export function rosterRuntime(api){const handlers=Object.fromEntries(Object.entries(factories).map(([id,f])=>[id,f(api)]));
  // 只有持有已编译角色模块（u.kit）的单位才允许触发 roster 钩子。计算器回退演员虽然可能带有
  // 同名 characterId，但没有 kit，不能把它的机制缺口当成已实现机制来派发。
  const active=u=>api.live(u)&&!!u?.kit;
  const run=(name,b,...args)=>{let owners=b.units.filter(u=>active(u)||name==='turnStart'&&u.characterId===1105&&!!u?.kit||name==='death'&&u===args[1]&&!!u?.kit);
    // Native packets precede reactors; the field must not depend on party order.
    if(name==='after')owners=owners.sort((a,c)=>(a.characterId===1403?2:a===args[0]?0:1)-(c.characterId===1403?2:c===args[0]?0:1));
    for(const u of owners)handlers[u.characterId]?.[name]?.(b,u,...args);};
  return {
    shouldUseSkill(b,u){return active(u)?handlers[u.characterId]?.shouldUseSkill?.(b,u):undefined;},
    actionEventStart:(b,u,e)=>active(u)?handlers[u.characterId]?.actionEventStart?.(b,u,e):undefined,
    actionEventEnd:(b,u,e,result)=>active(u)?handlers[u.characterId]?.actionEventEnd?.(b,u,e,result):undefined,
    summonTurn:(b,u,s)=>active(u)?handlers[u.characterId]?.summonTurn?.(b,u,s):undefined,
    // 拥有者模块是否自带 summonTurn：用于把非倒计时召唤物交给模块结算而不是走 1414 硬编码分支。
    hasSummonTurn:u=>active(u)&&typeof handlers[u.characterId]?.summonTurn==='function',
    // 战技点消耗广播（1506 银狼「头号补给盲盒」等按实际消耗数结算的机制）。
    unitCreated:(...a)=>run('unitCreated',...a),
    spSpent:(...a)=>run('spSpent',...a),
    // 状态到期回调：在效果被移除前派发给全部持有已登记模块的单位（effect 为即将到期的 buff/dot）。
    onEffectExpire(b,ownerUnit,effect){for(const u of b.units.filter(active))handlers[u.characterId]?.onEffectExpire?.(b,u,ownerUnit,effect);},
    // Generic removal callback complements natural-expiry notification for effects removed early.
    onEffectRemove(b,ownerUnit,effect,reason){for(const u of b.units.filter(active))handlers[u.characterId]?.onEffectRemove?.(b,u,ownerUnit,effect,reason);},
    prepare(b,u,key,kind,a){return active(u)?handlers[u.characterId]?.prepare?.(b,u,key,kind,a)??a:a;},
    start:b=>run('start',b),entry(b){for(const u of b.units.filter(u=>active(u)&&(u.kit?.technique||handlers[u.characterId]?.entryAlways)))handlers[u.characterId]?.entry?.(b,u);},
    // 逐波次事件（含第 1 波）：秘技每波次回能、镜中故我等光锥与角色效果。
    waveStart(b){for(const u of b.units.filter(active))handlers[u.characterId]?.waveStart?.(b,u);},
    // 敌方尝试从弱点击破恢复。返回 true 表示本次恢复被延长（残梅绽等）。
    beforeRecover(b,actor){let blocked=false;for(const u of b.units.filter(active))if(handlers[u.characterId]?.beforeRecover?.(b,u,actor))blocked=true;return blocked;},
    // A real toughness break has occurred; character modules may resolve source-specific break follow-ups.
    weaknessBreak(b,actor,target,action,element){for(const u of b.units.filter(active))handlers[u.characterId]?.weaknessBreak?.(b,u,actor,target,action,element);},
    // 致命伤害拦截。任一角色模块返回 true 即保留 1 点生命（免于无法战斗）。
    beforeLethal(b,from,to,amount){let saved=false;for(const u of b.units.filter(active))if(handlers[u.characterId]?.beforeLethal?.(b,u,from,to,amount))saved=true;return saved;},
    // 伤害改道（1208 穷观阵）：在护盾 / 生命结算之前收集各模块的转移份额。
    redirectDamage(b,from,to,amount,kind){const out=[];for(const u of b.units.filter(active)){const r=handlers[u.characterId]?.redirectDamage?.(b,u,from,to,amount,kind);if(r)out.push(...(Array.isArray(r)?r:[r]));}return out;},
    before:(...a)=>run('before',...a),repeatStart:(...a)=>run('repeatStart',...a),hit:(...a)=>run('hit',...a),afterHit:(...a)=>run('afterHit',...a),afterDamage:(...a)=>run('afterDamage',...a),hpChanged:(...a)=>run('hpChanged',...a),after:(...a)=>run('after',...a),turnStart:(...a)=>run('turnStart',...a),turnEnd:(...a)=>run('turnEnd',...a),attacked:(...a)=>run('attacked',...a),death:(...a)=>run('death',...a),panel:(...a)=>run('panel',...a),
    modifiers(b,...args){const out={};for(const u of b.units.filter(active))for(const [key,v]of Object.entries(handlers[u.characterId]?.modifiers?.(b,u,...args)??{}))out[key]=(out[key]??0)+v;return out;},
    display(b,target){return b.units.filter(active).flatMap(u=>handlers[u.characterId]?.display?.(b,u,target)??[]);},
  };
}
