import assert from 'node:assert/strict';
import {actor,dummy} from './codex_test_helpers.mjs';
import {createBattle,stepBattle} from '../simulator/engine.mjs';

const pearl=actor(1503),sparkle=actor(1501),yaoguang=actor(1502),mate=dummy('mate');
pearl.kit.eidolon=2;
const enemy=dummy('enemy','enemy');
const b=createBattle({strict:false,maxAV:800,sp:3,maxSP:9,seed:71,critMode:'noncrit',units:[pearl,sparkle,yaoguang,mate,enemy]});
const p=b.units.find(u=>u.characterId===1503),s=b.units.find(u=>u.characterId===1501),y=b.units.find(u=>u.characterId===1502);
b.queue=[];for(const u of b.units)u.distance=1e6;
p.energy=p.energyMax;
b.queue.push({actor:p.id,key:'ultimate',kind:'ultimate'});
stepBattle(b);
assert.equal(s.resources['美学底本'],1,'缺省目标也必须跳过真珠本人，选择首名合法队友');
assert.throws(()=>b.rules.prepare(b,p,'ultimate','ultimate',{...p.actions.ultimate,targetId:p.id}),/不能指定真珠自身/);

const advances=b.log.filter(x=>x.type==='advance'&&x.actor!==p.id);
for(const ally of [s,y]){
  const entries=advances.filter(x=>x.actor===ally.id);
  assert.equal(entries.length,1,ally.name+' 应只收到一次真珠终结技行动提前（E2包含非美学底本欢愉队友）');
}
assert.ok(!b.log.some(x=>x.type==='advance'&&x.actor===p.id),'E2不可把真珠本人列入额外行动提前');
assert.ok(s.buffs.some(x=>x.tag==='pearlArt'),'真珠施放终结技后应为当前欢愉美学底本重新挂载下一次终结技固定回能');

// 美学底本使用下一次终结技时，应该恰好恢复90点固定能量并消耗这个一次性标记。
p.energy=10;s.energy=s.energyMax;
b.rules.after(b,s,'ultimate','normal',s.actions.ultimate,[enemy],[]);
assert.equal(p.energy,100,'美学底本下一次终结技应使真珠固定恢复90点能量');
assert.ok(!s.buffs.some(x=>x.tag==='pearlArt'),'固定回能标记只能触发一次');
console.log('PASS Pearl E2 advances all other Elation allies once and re-arms the marked ally fixed-90-EP ultimate trigger');
