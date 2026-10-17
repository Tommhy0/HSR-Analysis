// Component tests for unfinished kits explicitly run approximate simulations.
// Validate the executable actor contracts before opting out of the accuracy gate;
// strict-mode rejection itself is tested against the unwrapped engine separately.
import {knownMechanicsGaps} from '../simulator/mechanics-status.mjs';
import {validateKitActor} from '../simulator/kits.mjs';
import assert from 'node:assert/strict';
const announced=new Set();
export function partialMechanicsFixture(config){
  const incomplete=(config.units??[]).filter(u=>knownMechanicsGaps(u).length);
  if(!config.strict||!incomplete.length)return config;
  for(const u of config.units??[])if(u.kit){const errors=validateKitActor(u);if(errors.length)throw Error(errors.join('；'));}
  for(const u of incomplete)if(!announced.has(u.characterId)){
    announced.add(u.characterId);console.log('FIXTURE_APPROXIMATE '+u.characterId+'：已知缺口组件测试，不代表严格验收');
  }
  return {...config,strict:false};
}
export function assertFixtureDisclosure(result,config){
  const incomplete=(config.units??[]).filter(u=>knownMechanicsGaps(u).length);
  if(!incomplete.length){assert.deepEqual(result.unsupported,[]);return;}
  assert.equal(result.accuracy,'approximate','unfinished-kit component fixture must be labeled approximate');
  for(const u of incomplete)assert.ok(result.unsupported.some(s=>s.includes(u.name+'：')),'missing gap disclosure for '+u.name);
}
