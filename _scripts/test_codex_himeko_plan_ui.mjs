import assert from 'node:assert/strict';
import {actor,dummy} from './codex_test_helpers.mjs';
import {validateBattle} from '../simulator/engine.mjs';
import {withHimekoBeamCount} from '../simulator/himeko-plan.mjs';

const h=actor(1510),mate=dummy('mate'),enemy=dummy('enemy','enemy');
const unrelated={actor:'mate',key:'basic',targetId:'enemy',after:{actor:'mate',key:'basic',kind:'normal',occurrence:1}};
const base={strict:false,maxAV:300,sp:3,maxSP:5,units:[h,mate,enemy],actionPlan:[unrelated]};
for(const n of [0,1,3,5,6]){
  const next=withHimekoBeamCount(base,h.id,n),plan=next.actionPlan.filter(c=>c.actor===h.id);
  assert.equal(plan.filter(c=>c.key==='beam').length,n,'保留所选光束次数');
  assert.equal(plan.filter(c=>c.key==='pulse').length,n<6?1:0,'不足六束时接脉冲，六束时由规则自动触发');
  assert.deepEqual(next.actionPlan[0],unrelated,'重设姬子动作不得覆盖其他角色录像指令');
  assert.deepEqual(validateBattle(next),[],`光束选择 ${n} 应符合行动轴合同`);
}
assert.throws(()=>withHimekoBeamCount(base,h.id,7),/0～6/,'界面范围外的光束次数必须拒绝');
const stored=withHimekoBeamCount(withHimekoBeamCount(base,h.id,2),h.id,4);
assert.equal(stored.actionPlan.filter(c=>c.actor===h.id&&c.key==='beam').length,4,'重复应用选择应替换旧姬子分支');
assert.equal(stored.actionPlan.filter(c=>c.actor===h.id&&c.key==='pulse').length,1);
console.log('PASS Himeko battle UI plan: 0–6 beams, pulse handoff, action-plan preservation, validation');
