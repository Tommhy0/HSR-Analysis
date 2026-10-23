import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createContext} from '../core/ctx.mjs';
import {inspectEndgameTarget} from '../simulator/endgame-scenes.mjs';
import {noontideGryphon,isEnemyMechanicRegistered,validateEnemyActor} from '../simulator/encounters.mjs';
import {combatPanel,createBattle,receiveDamage,stepBattle} from '../simulator/engine.mjs';
import {strictParty} from '../simulator/party.mjs';

const ctx=createContext(JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url))));
const scene=inspectEndgameTarget(ctx,{mode:'moc',seasonId:1036,floorId:'5512',side:2});
const source=scene.enemies.find(enemy=>enemy.childId===402301001);
assert.ok(source,'MoC 5512/S2 contains Noontide Gryphon (child 402301001)');

const gryphon=noontideGryphon(ctx,{sceneEnemy:source,id:'gryphon-1'});
assert.deepEqual(validateEnemyActor(gryphon),[]);
assert.equal(isEnemyMechanicRegistered(4023010),true);
assert.equal(isEnemyMechanicRegistered(402301001),true);
assert.equal(isEnemyMechanicRegistered(402301002),true);
assert.equal(gryphon.monsterId,402301001);
assert.equal(gryphon.element,'Fire');
assert.equal(gryphon.panel.hp,source.hp);
assert.equal(gryphon.panel.speed,source.speed);
assert.equal(gryphon.toughnessMax,source.toughness);
assert.deepEqual(gryphon.weaknesses,['Physical','Quantum','Imaginary']);
assert.deepEqual(gryphon.enemyKit.sourceHashes,{
  ai:'40607dc1dbf1a02ddcbb60d903b0dbbc327b3955',
  ability:'e0951a0b4af86e28cf291a9b1ff848c0e1e51acd',
  character:'360f2c1c733a68d262cb84309d44bbf4b40187da'});
assert.deepEqual(gryphon.actions.skill01.terms,[{scaling:'atk',multiplier:3}]);
assert.equal(gryphon.actions.skill01.hitEnergy,5);
assert.equal(gryphon.actions.skill02.target,'sweep');
assert.equal(gryphon.actions.skill02.sweepDirection,'left');
assert.deepEqual(gryphon.actions.skill02.terms,[{scaling:'atk',multiplier:2.6}]);
assert.equal(gryphon.actions.skill02.hitEnergy,10);
assert.equal(gryphon.actions.skill03.target,'self');
assert.deepEqual(gryphon.actions.skill03.terms,[]);
assert.equal(gryphon.actions.skill04.target,'blast');
assert.equal(gryphon.actions.skill04.repeatCount,3);
assert.deepEqual(gryphon.actions.skill04.terms,[{scaling:'atk',multiplier:4},{scaling:'atk',multiplier:3,target:'adjacent'}]);
assert.equal(gryphon.actions.skill04.hitEnergy,20);
assert.deepEqual(gryphon.enemyKit.passiveParams,[40,1.5,.25]);
assert.deepEqual(gryphon.enemyKit.mixedParams,[1.2,1,.4,1,1.5]);
assert.deepEqual(gryphon.enemyKit.summonDelayRatios,[.5,.8,1.1,1.5]);
assert.equal(gryphon.enemyMechanicNotes.length,5,'source gaps stay explicit');

const pfScene=inspectEndgameTarget(ctx,{mode:'pf',seasonId:2027,floorId:'20271',side:1});
const pfSource=pfScene.enemies.find(enemy=>enemy.childId===402301002);
assert.ok(pfSource,'PF 20271/S1 contains Noontide Gryphon (child 402301002)');
const pfGryphon=noontideGryphon(ctx,{sceneEnemy:pfSource,id:'gryphon-pf'});
assert.deepEqual(validateEnemyActor(pfGryphon),[]);
assert.equal(pfGryphon.panel.hp,pfSource.hp);

const zeroDefPanel=atk=>({hp:1e9,atk,def:0,speed:1,critRate:0,critDmg:0,effectRes:0,energyRegen:1,elemDmg:{},baseStats:{hp:1e9,atk,def:0}});
function battleWith(enemy,seed=13){
  const party=structuredClone(strictParty(ctx).units.filter(unit=>unit.side==='ally'));
  for(const unit of party){
    delete unit.kit;delete unit.characterId;delete unit.gear;delete unit.memospriteOwner;
    unit.panel=zeroDefPanel(100);unit.hp=1e9;unit.energy=50;unit.energyMax=100;
    unit.buffs=[];unit.shields=[];unit.dots=[];unit.resources={};
    unit.actions={basic:{name:'probe',type:'Normal',element:'Physical',target:'single',terms:[{scaling:'atk',multiplier:1}]}};
    unit.policy={autoUltimate:false,basicOnly:true};unit.standardBreak=false;
  }
  const battle=createBattle({strict:false,maxAV:1000,sp:3,maxSP:9,seed,critMode:'noncrit',units:[...party,enemy]});
  for(const unit of battle.units)unit.distance=10000;
  return battle;
}
const battle=battleWith(noontideGryphon(ctx,{sceneEnemy:source,id:'gryphon-live'}));
const live=battle.units.find(unit=>unit.id==='gryphon-live');
const atk=combatPanel(live).atk;
const oneMore=()=>live.buffs.some(effect=>effect.tag==='noontideGryphonOneMorePerTurn');
const marksOf=unit=>unit.buffs.filter(effect=>effect.tag==='noontideGryphonAegleMark');
const takeTurn=()=>{const before=battle.log.length;live.distance=0;assert.equal(stepBattle(battle),true);return battle.log.slice(before);};
const skillsOf=events=>events.filter(event=>event.type==='action'&&event.actor===live.id).map(event=>event.key);
const slicesOf=events=>{
  const slices=[];
  for(const event of events){
    if(event.type==='action'&&event.actor===live.id)slices.push({key:event.key,hits:[]});
    else if(event.type==='damage'&&event.actor===live.id&&slices.length)slices.at(-1).hits.push(event);
  }
  return slices;
};
const hitsOf=(events,key)=>slicesOf(events).filter(slice=>slice.key===key).flatMap(slice=>slice.hits);

assert.equal(live.resources['正阳狮鹫AIFlag'],1);
assert.equal(oneMore(),true,'PassiveSkillInitiate grants OneMorePerTurn');

// 回合 1：旗标 1 → 穿透黑暗(2)，OneMore 追加 降示黎明(3) 并召唤 4 只流星铁鹰。
const turn1=takeTurn();
assert.deepEqual(skillsOf(turn1),['skill01','skill02']);
assert.equal(live.resources['正阳狮鹫AIFlag'],3);
const single=hitsOf(turn1,'skill01');
assert.equal(single.length,1);
assert.ok(Math.abs(single[0].damage-atk*3)<1e-6,`skill01 is 3.0x ATK, got ${single[0].damage}`);
assert.equal(single[0].hitEnergy,5);
const sweep=hitsOf(turn1,'skill02');
assert.deepEqual(sweep.map(hit=>hit.target),['slot-1','slot-2','slot-3'],'skill02 sweeps three allies from the left');
for(const hit of sweep){
  assert.equal(hit.hitEnergy,10);
  assert.ok(Math.abs(hit.damage-atk*2.6)<1e-6,`skill02 is 2.6x ATK, got ${hit.damage}`);
}
const summons=turn1.filter(event=>event.type==='summon'&&event.actor===live.id);
assert.deepEqual(summons.map(event=>event.delayRatio),[.5,.8,1.1,1.5]);
assert.ok(summons.every(event=>event.monsterId===4022010));
assert.equal(battle.units.filter(unit=>unit.summonerId===live.id&&unit.active!==false).length,4);
const markedAfterTurn1=battle.units.filter(unit=>unit.side==='ally'&&marksOf(unit).length===1);
assert.equal(markedAfterTurn1.length,3,'one 【艾格勒印记】 layer per hit ally');

// 回合 2：旗标 3 → 穿透黑暗(4)，OneMore 追加 点亮未来(5) 并移除 OneMorePerTurn。
const turn2=takeTurn();
assert.deepEqual(skillsOf(turn2),['skill01','skill03']);
assert.equal(live.resources['正阳狮鹫AIFlag'],5);
assert.equal(oneMore(),false,'点亮未来 removes OneMorePerTurn');
const locked=battle.units.find(unit=>unit.id===live.resources['正阳狮鹫锁定目标']);
assert.ok(locked&&locked.side==='ally');
assert.ok(locked.buffs.some(effect=>effect.tag==='noontideGryphonSignOnAvatar'),'SignOnAvatar locks the selected ally');
assert.ok(live.buffs.some(effect=>effect.tag==='noontideGryphonUltraReady'),'UltraReady is granted');
const markPriority=turn2.find(event=>event.type==='mechanic'&&event.name==='点亮未来 · 锁定目标');
assert.equal(markPriority.priority,'带有【艾格勒印记】');

// 回合 3：旗标 5 → 赞美艾格勒(1)，主目标 4.0x × 3 轮、相邻 3.0x × 3 轮。
const hadLayer=marksOf(locked).length;
assert.equal(hadLayer,1,'Skill04 is aimed at the marked ally, which starts with one layer');
const lockedEnergyBefore=locked.energy;
const turn3=takeTurn();
assert.deepEqual(skillsOf(turn3),['skill04']);
assert.equal(live.resources['正阳狮鹫AIFlag'],1);
const blast=hitsOf(turn3,'skill04').filter(hit=>hit.kind==='direct');
const mainHits=blast.filter(hit=>hit.target===locked.id),adjacentHits=blast.filter(hit=>hit.target!==locked.id);
assert.equal(mainHits.length,3);
assert.equal(adjacentHits.length,6);
for(const hit of mainHits)assert.ok(Math.abs(hit.damage-atk*4)<1e-6,`main target is 4.0x ATK, got ${hit.damage}`);
for(const hit of adjacentHits)assert.ok(Math.abs(hit.damage-atk*3)<1e-6,`adjacent is 3.0x ATK, got ${hit.damage}`);
assert.equal(mainHits[0].hitEnergy,20);
assert.equal(locked.buffs.some(effect=>effect.tag==='noontideGryphonSignOnAvatar'),false,'SignOnAvatar is removed after Skill04');

// 第二层爆发：-40 能量 + 1.5 倍攻击力火伤，并清除全部印记。
const detonate=turn3.find(event=>event.type==='mechanic'&&event.name==='【艾格勒印记】爆发');
assert.ok(detonate,'the second layer detonates');
assert.equal(detonate.target,locked.id);
const drain=turn3.find(event=>event.type==='energy'&&event.actor===locked.id&&event.amount===-40);
assert.ok(drain,'the detonation drains 40 energy');
assert.equal(locked.energy,Math.max(0,lockedEnergyBefore+20-40));
const burst=turn3.find(event=>event.type==='damage'&&event.actor===live.id&&event.kind==='additional');
assert.ok(burst);
assert.ok(Math.abs(burst.damage-atk*1.5)<1e-6,`the burst is 1.5x ATK, got ${burst.damage}`);
assert.equal(turn3.some(event=>event.type==='mechanic'&&event.name==='【艾格勒印记】清除'),true);
const detonations=turn3.filter(event=>event.type==='mechanic'&&event.name==='【艾格勒印记】爆发');
assert.deepEqual(detonations.map(event=>event.target).sort(),['slot-2','slot-3'],
  'only the two struck allies that reached two layers detonate');
assert.equal(marksOf(battle.units.find(unit=>unit.id==='slot-1')).length,1,
  'an ally that Skill04 does not hit keeps its mark');
assert.equal(battle.units.some(unit=>unit.side==='ally'&&marksOf(unit).some(effect=>effect.stacks>=2)),false,
  'no two-layer mark survives the detonation');

// 回合 4：OneMorePerTurn 已被消耗，旗标 1 只结算一次 穿透黑暗。
const turn4=takeTurn();
assert.deepEqual(skillsOf(turn4),['skill01']);
assert.equal(live.resources['正阳狮鹫AIFlag'],2);

// 弱点击破：5 → 1，重新授予 OneMorePerTurn，清除 SignOnAvatar 与 UltraReady。
const breakBattle=battleWith(noontideGryphon(ctx,{sceneEnemy:source,id:'gryphon-break'}),17);
const breaking=breakBattle.units.find(unit=>unit.id==='gryphon-break');
const breaker=breakBattle.units.find(unit=>unit.side==='ally');
breaking.resources['正阳狮鹫AIFlag']=5;
breakBattle.rules.weaknessBreak(breakBattle,breaker,breaking,{name:'probe',element:'Physical'},'Physical');
assert.equal(breaking.resources['正阳狮鹫AIFlag'],1,'AIFlag 5 resets to 1 on break');
assert.equal(breaking.buffs.some(effect=>effect.tag==='noontideGryphonOneMorePerTurn'),true,'break restores OneMorePerTurn');
assert.equal(breaking.buffs.some(effect=>effect.tag==='noontideGryphonUltraReady'),false);
assert.ok(breakBattle.log.some(event=>event.type==='mechanic'&&event.name==='弱点击破 · 重置正阳狮鹫 AI'&&event.from===5&&event.to===1));

// 锁定目标阵亡时 SignOnAvatar 转移到另一名我方（OnBeforeDying）。
const signBattle=battleWith(noontideGryphon(ctx,{sceneEnemy:source,id:'gryphon-sign'}),13);
const signer=signBattle.units.find(unit=>unit.id==='gryphon-sign');
for(let i=0;i<2;i++){signer.distance=0;stepBattle(signBattle);}
const signed=signBattle.units.find(unit=>unit.buffs.some(effect=>effect.tag==='noontideGryphonSignOnAvatar'));
assert.ok(signed,'turn 2 signs the locked ally');
receiveDamage(signBattle,signer,signed,1e12,'direct',{name:'lethal probe'});
const moved=signBattle.units.filter(unit=>unit.active!==false&&unit.hp>0&&unit.buffs.some(effect=>effect.tag==='noontideGryphonSignOnAvatar'));
assert.equal(moved.length,1,'the sign moves to exactly one surviving ally');
assert.notEqual(moved[0].id,signed.id);
assert.equal(signer.resources['正阳狮鹫锁定目标'],moved[0].id);
assert.ok(signBattle.log.some(event=>event.type==='mechanic'&&event.name==='SignOnAvatar 转移'));

// 消灭敌方目标解除 1 层印记：优先致命伤害来源，其次随机 1 名持有印记的我方。
const killBattle=battleWith(noontideGryphon(ctx,{sceneEnemy:source,id:'gryphon-kill'}),23);
const killer=killBattle.units.find(unit=>unit.id==='gryphon-kill');
killer.distance=0;
stepBattle(killBattle);
const allies=killBattle.units.filter(unit=>unit.side==='ally');
const markedUnits=()=>allies.filter(unit=>marksOf(unit).length>0);
assert.equal(markedUnits().length,3,'turn 1 seeds three marks');
const [eagle1,eagle2]=killBattle.units.filter(unit=>unit.summonerId===killer.id&&unit.active!==false);
const slayer=markedUnits()[0],bystander=allies.find(unit=>marksOf(unit).length===0);
assert.ok(slayer&&bystander,'one marked ally and one unmarked ally exist');
receiveDamage(killBattle,slayer,eagle1,1e12,'direct',{name:'killing blow'});
assert.equal(marksOf(slayer).length,0,'the killer loses its 【艾格勒印记】 first');
assert.equal(markedUnits().length,2,'only one mark resolves per kill');
const resolveEvents=()=>killBattle.log.filter(event=>event.type==='mechanic'&&event.name==='【艾格勒印记】解除');
assert.equal(resolveEvents().length,1);
const [first]=resolveEvents();
assert.equal(first.target,slayer.id);
assert.equal(first.killer,slayer.id);
assert.equal(first.victim,eagle1.id);
const survivors=markedUnits().map(unit=>unit.id).sort();
receiveDamage(killBattle,bystander,eagle2,1e12,'direct',{name:'killing blow'});
assert.equal(markedUnits().length,1,'an unmarked killer resolves a random marked ally');
const second=resolveEvents()[1];
assert.equal(second.killer,null,'an unmarked killer is not preferred');
assert.ok(survivors.includes(second.target),'a previously marked ally loses the mark');
assert.equal(killer.resources['【艾格勒印记】解除次数'],2);

console.log('MoC 5512/S2 Noontide Gryphon checks: sourced 3.0x / 2.6x sweep / 4.0x+3.0x x3 blast, AIFlag + OneMorePerTurn rotation, four 4022010 summons with 0.5/0.8/1.1/1.5 delay ratios, per-target mark stacking to 1.5x + -40 energy, on-kill mark resolution, and break reset passed.');
