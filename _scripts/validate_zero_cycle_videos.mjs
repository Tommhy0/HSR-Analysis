import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {createContext} from '../core/ctx.mjs';
import {strictParty} from '../simulator/party.mjs';
import {createBattle,stepBattle,combatPanel} from '../simulator/engine.mjs';
import {buildBattleActor,newBattleBuild} from '../simulator/builds.mjs';
import {auditVideoCase} from '../simulator/video-validation.mjs';
const cases=JSON.parse(fs.readFileSync(new URL('../data/validation/zero-cycle-videos.json',import.meta.url)));
const ctx=createContext(JSON.parse(fs.readFileSync(new URL('../_data_cache/hsr_core.json',import.meta.url))));
export function sixShotCheckpoint(){
  const c=strictParty(ctx,{variant:'base'});c.maxAV=101;c.sp=9;
  for(const u of c.units){u.policy={...u.policy,autoUltimate:false,basicOnly:u.characterId!==1015};u.panel.speed=u.characterId===1015?100:1;u.energy=0;if(u.build)u.kit.technique=false;}
  const arAt=c.units.findIndex(u=>u.characterId===1015),old=c.units[arAt];
  const build={...newBattleBuild(),characterId:1015,eidolon:1,technique:false,relicAuto:false,panel:{...old.panel,energyRegen:1.194394},relicSets:[]};
  const ar=buildBattleActor(ctx,build);ar.id=old.id;ar.policy={autoUltimate:false,skillLimit:5};ar.energy=5*1.194394;c.units[arAt]=ar;
  c.units.at(-1).panel.hp=1e10;c.units.at(-1).panel.speed=1;c.units.at(-1).toughnessMax=0;
  const b=createBattle(c),cery=b.units.find(u=>u.characterId===1412),a=b.units[arAt];
  // Isolated, explicitly constructed precondition: peerage ready, full SP,
  // previous Ultimate's native 5 energy retained. This is NOT the video's build.
  cery.resources['军功目标']=a.id;cery.resources['充能']=6;cery.pendingPromotion=true;b.rules.after(b,cery,'idle','normal',{target:'self'},[cery],[]);
  stepBattle(b);
  const shots=b.log.filter(e=>e.type==='action'&&e.actor===a.id&&e.key==='skill').length;
  return {title:'作者公布的6箭循环：隔离资源检查',kind:'published_rotation_checkpoint',source:'https://www.bilibili.com/video/BV1f6sxz7EuA/',expected:{shots:6,ultimateReady:true},actual:{shots,ultimateReady:a.energy>=a.energyMax,energy:a.energy,energyRegen:combatPanel(a).energyRegen,sp:b.sp},ok:shots===6&&a.energy>=a.energyMax,note:'只核对明确构造的爵位、战技点与上次大招5能量前提，不是录像全流程、伤害或0T验证。'};
}
export function videoFollowupCheckpoint(){
  const source=cases.cases.find(c=>c.id==='kongshan-36-lygos'),observed=source.resourceCheckpoints[0];
  const c=strictParty(ctx,{variant:'base'});c.maxAV=1;c.sp=observed.before;
  for(const u of c.units){u.energy=0;u.panel.speed=1;u.policy={...u.policy,autoUltimate:false,basicOnly:true};if(u.kit)u.kit.technique=false;}
  // This fixture isolates the native follow-up refund. Tribbie and the unknown
  // Cerydra cone are deliberately not used as damage inputs.
  for(const [id,changes]of [[1015,{eidolon:6}],[1412,{lightconeId:null}]]){const at=c.units.findIndex(u=>u.characterId===id),old=c.units[at],a=buildBattleActor(ctx,{...old.build,...changes,technique:false});a.id=old.id;a.energy=id===1412?130:0;a.panel.speed=1;a.policy={...old.policy,autoUltimate:id===1412};c.units[at]=a;}
  c.units.at(-1).panel.hp=1e10;c.units.at(-1).toughnessMax=0;
  const b=createBattle(c);stepBattle(b);const archer=b.units.find(u=>u.characterId===1015),events=b.log.filter(e=>e.type==='sp'&&e.actor===archer.id),refund=events.reduce((n,e)=>n+e.amount,0),followups=b.log.filter(e=>e.type==='action'&&e.actor===archer.id&&e.kind==='followup').length;
  return {title:'公开视频 04:33 → 04:35：Archer 追击恢复 1 点战技点',kind:'observed_video_resource_checkpoint',source:source.url,timestamps:observed.timestamps,evidence:observed.evidence,expected:{before:observed.before,after:observed.after,refund:observed.after-observed.before},actual:{before:c.sp,after:b.sp,refund,followups},ok:followups===1&&refund===observed.after-observed.before&&b.sp===observed.after,note:'仅对照录像可读的 2→3 战技点变化。隔离夹具省略缇宝、刻律光锥与实际 Boss，不用于伤害、完整行动轴或整场 0T 判定。'};
}
export function videoHPCheckpoint(){
  const source=cases.cases.find(c=>c.id==='kongshan-36-lygos'),observed=source.hpCheckpoints[0],c=strictParty(ctx,{variant:'base'});c.maxAV=1;
  for(const [i,id]of source.characters.entries()){const old=c.units[i],hp=observed.teamHP[id],a=buildBattleActor(ctx,{...newBattleBuild(),characterId:id,eidolon:0,technique:false,relicAuto:false,panel:{...old.panel,hp,speed:1,energyRegen:1}});a.id=old.id;a.energy=id===1403?a.energyMax:0;a.policy={autoUltimate:id===1403,basicOnly:true};c.units[i]=a;}
  c.units.at(-1).toughnessMax=0;c.units.at(-1).panel.hp=1e10;const b=createBattle(c),u=b.units.find(u=>u.characterId===1403),before=combatPanel(u).hp;stepBattle(b);const hp=combatPanel(u).hp,display=Math.round(hp);
  return {title:'公开视频 04:22：缇宝结界生命上限4250→5643',kind:'observed_video_hp_checkpoint',source:source.url,evidence:observed.evidence,expected:{before:observed.before,display:observed.after},actual:{before,exact:hp,display},ok:before===observed.before&&display===observed.after,note:'使用录像已读全队生命值，只验证9%生命转换与显示取整；不验证伤害、Boss、完整行动轴或历史版本整场0T。'};
}
export function videoAuditReport(){const rows=cases.cases.map(c=>auditVideoCase(c));return {checkedAt:cases.checkedAt,fullVideoPasses:rows.filter(r=>r.verified).length,candidates:rows.length,rows,isolatedCheckpoints:[sixShotCheckpoint(),videoFollowupCheckpoint(),videoHPCheckpoint()],summary:'完整0T录像对拍尚未通过；公开视频局部资源对照与纸面循环检查分别报告，不将候选链接计为通过。'};}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const report=videoAuditReport();fs.mkdirSync('outputs',{recursive:true});fs.writeFileSync('outputs/0T视频对照报告.json',JSON.stringify(report,null,2));
  const md=['# 0T 视频核验报告','',`日期：${report.checkedAt}。完整录像通过：**${report.fullVideoPasses}**。候选场景：${report.candidates}。`,'','只有完整配装、原版角色数值、关卡机制和独立录像检查点齐备，才开始逐项判定。标题写着 0T 或纸面循环检查通过，不算完整录像通过。','',...report.rows.flatMap(r=>[`## ${r.title}`,'',`[原作者视频](${r.url}) · ${r.mode==='moc'?'混沌候选':'仲裁候选（不得冒充混沌）'} · **尚未完成对拍**`,'',...r.reasons.map(s=>'- '+s),'']),'## 已执行的局部检查','',...report.isolatedCheckpoints.flatMap(c=>[c.title+'：'+(c.ok?'通过':'失败')+'。',`预期：${JSON.stringify(c.expected)}；实测：${JSON.stringify(c.actual)}。`,c.note,'']),'## 本轮补齐','', '增加逐回合普攻/战技/目标和指定第几次动作后插入终结技的操作轴；资源不足、目标提前阵亡会报错，不自动改招换靶。缺少的队友、Boss、历史版本、特殊额外行动仍未完成。','', '运行：`npm run validate:videos`。JSON 包含原始状态和逐项原因；操作轴说明见 docs/0T录像对照与操作轴.md。'];
  fs.writeFileSync('outputs/0T视频对照报告.md',md.join('\n')+'\n');console.log(JSON.stringify(report,null,2));
}
