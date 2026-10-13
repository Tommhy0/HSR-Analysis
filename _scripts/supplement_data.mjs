// 构建期接入已有本地资料。只读外部库，补齐结果与出处写进计算器的数据包。
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { normalize, buffClauseParts } from '../core/clauses.mjs';
import { classifyClause } from '../core/attr.mjs';
import { renderText } from '../core/ctx.mjs';
import { catalogSources, entryId, classifyOptsFor } from './build_catalog.mjs';

const OUTPUT_KEYS = new Set(['atkPct', 'atkFlat', 'hpPct', 'hpFlat', 'defPct', 'defFlat',
  'critRate', 'critDmg', 'dmgBoost', 'elemDmg', 'abilityDmg', 'defShred', 'defIgnore', 'resPen', 'vuln', 'dmgReduction']);
const readJson = (v, fallback = []) => { try { return JSON.parse(v); } catch { return fallback; } };

export function supplementData(core, root) {
  core.scenarioEffects = {};
  const sources = [
    ...core.abyssSeasons.map((s) => ({ id: `abyss.${s.mode}.${s.seasonId}.season`, text: s.buffDesc, params: s.buffParams })),
    ...core.abyssBuffs.map((b) => ({ id: `abyss.${b.mode}.${b.seasonId}.${b.floorId}.buff${b.idx}`, text: b.desc, params: b.params })),
  ];
  for (const s of sources) {
    const parts = buffClauseParts(normalize(s.text));
    const effects = [], gaps = [];
    parts.forEach((part, i) => {
      const previous = parts[i - 1] ?? '';
      // 顿号切句会把“普攻、战技”拆开；用紧邻枚举前缀还原技能类型集合。
      const enumeration = previous.replace(/[、，,]\s*$/, '');
      const analysisText = /(?:普攻|战技|终结技)\s*$/.test(enumeration) ? enumeration + '、' + part : part;
      const cls = classifyClause(analysisText, { prev: parts.slice(0, i) });
      if (!cls) return;
      const h = cls.hit, value = s.params?.[h?.paramIndex - 1];
      // 简单数值有了，不代表随机攻击、每层、累计量和敌方攻击力能套进输出公式。
      const unsupported = /追加攻击|追击|反击|持续伤害|每层|每点|每有|每多|累计|增笑|欢愉|真实伤害/.test(part);
      const enemyNonDamage = h?.side === 'enemy' && ['atkPct','hpPct','critRate','critDmg','defIgnore'].includes(h?.key);
      if (cls.bucket === 'PICKABLE' && OUTPUT_KEYS.has(h?.key) && Number.isFinite(value)
        && !unsupported && !enemyNonDamage && !(h.key === 'dmgReduction' && h.side === 'ally')) {
        const inheritedReceived = !/我方|自身|队友|敌方/.test(part) && /敌方[^。]*受到/.test(previous) && !/[。；]\s*$/.test(previous);
        const received = (h.side === 'enemy' && /受到/.test(part)) || inheritedReceived;
        const key = received && ['dmgBoost','abilityDmg','elemDmg'].includes(h.key) ? 'vuln' : h.key;
        const scope = { ...(h.scope ?? {}) };
        if (key !== 'abilityDmg' && !scope.abilityTypes) {
          const types = [['普攻','Normal'],['战技','BPSkill'],['终结技','Ultra']].filter(([word]) => analysisText.includes(word)).map(([,type]) => type);
          if (types.length) scope.abilityTypes = types;
        }
        effects.push({ id: `${s.id}.b${i}`, key, value, side: inheritedReceived ? 'enemy' : h.side, target: inheritedReceived ? 'enemy' : h.target,
          scope, condition: h.condition ?? null, provenance: 'partial',
          text: part.trim(), sourceText: renderText(s.text, s.params), sourceId: s.id });
      } else if (unsupported || ['NO_ATTR', 'TARGET_UNKNOWN', 'SIDE_UNKNOWN', 'PANEL_ANCHORED'].includes(cls.bucket)) {
        gaps.push({ text: part.trim(), reason: cls.bucket });
      }
    });
    core.scenarioEffects[s.id] = { effects, gaps };
  }

  const localPeak=path.join(root,'data','databases',`peak_${core._meta.version}.db`);
  const peakPath = fs.existsSync(localPeak) ? localPeak : path.join(root, '..', '异相仲裁', 'peak.db');
  const peak = { seasons: [], stages: [], monsters: [], tags: [], quadrants: [] };
  if (fs.existsSync(peakPath)) {
    const db = new DatabaseSync(peakPath, { readOnly: true });
    const dates = new Map(db.prepare('SELECT * FROM bg_season').all().map((s) => [s.period, s]));
    peak.seasons = db.prepare('SELECT * FROM season').all().map((s) => ({ id: s.id, name: s.name_zh,
      version: s.version, begin: dates.get(s.id)?.start_time, end: dates.get(s.id)?.end_time }));
    peak.stages = db.prepare('SELECT * FROM stage').all().map((s) => ({ seasonId: s.season_id,
      id: `${s.slot}:${s.seq}`, slot: s.slot, seq: s.seq, name: s.name, level: s.battle_level,
      weakness: readJson(s.damage_type_json), waves: s.wave_count }));
    peak.monsters = db.prepare('SELECT * FROM stage_monster').all().map((m) => ({ seasonId: m.season_id,
      stageId: `${m.slot}:${m.seq}`, waveId: m.wave_id, childId: m.monster_id, name: m.name_zh,
      weakness: readJson(m.weak_json), rank: m.rank }));
    peak.tags = db.prepare('SELECT * FROM stage_tag').all().map((t) => ({ seasonId: t.season_id,
      stageId: `${t.slot}:${t.seq}`, name: t.name, text: t.desc_text }));
    peak.quadrants = db.prepare('SELECT * FROM bg_quadrant').all().map((q) => ({ seasonId: q.period,
      id: q.seq, name: q.name, text: q.desc }));
    // hp_estimated 未经对拍且第9期首领缺真实精英倍率，只保留资料，不写成已知血量。
    peak.hpNotes = db.prepare('SELECT season_id,slot,seq,hp_estimated FROM stage_hp').all()
      .map((h) => ({ seasonId: h.season_id, stageId: `${h.slot}:${h.seq}`, estimatedHp: h.hp_estimated,
        valid: !(h.season_id === 9 && h.slot === 'boss'), verified: false }));
    db.close();
  }
  const archive = path.join(root,'data','peak_archive.json');
  core.peak = peak.seasons.length ? peak : fs.existsSync(archive) ? JSON.parse(fs.readFileSync(archive,'utf8')) : peak;
  const rawPeakPath=path.join(root,'_data_cache','versions',core._meta.version,'zh','peak');
  if(fs.existsSync(rawPeakPath)) for(const file of fs.readdirSync(rawPeakPath).filter(f=>/^\d+\.json$/.test(f))) {
    const raw=JSON.parse(fs.readFileSync(path.join(rawPeakPath,file),'utf8'));
    if(core.peak.seasons.some(s=>s.id===raw.id))continue;
    core.peak.seasons.push({id:raw.id,name:raw.name,version:core._meta.version,begin:null,end:null});
    const monsterNames=new Map(core.monsters.map(m=>[m.id,m.name]));
    for(const [slot,seq,stage] of [...(raw.pre_level??[]).map((s,i)=>['pre',i+1,s]),['boss',1,raw.boss_level]]) {
      if(!stage)continue;const id=`${slot}:${seq}`,events=stage.event_id_list??[];
      core.peak.stages.push({seasonId:raw.id,id,slot,seq,name:stage.name,level:events[0]?.level??null,weakness:stage.damage_type,waves:events.reduce((n,e)=>n+(e.monster_list?.length??0),0)});
      for(const event of events)for(const [waveId,wave] of (event.monster_list??[]).entries())for(const childId of Object.values(wave))core.peak.monsters.push({seasonId:raw.id,stageId:id,waveId,childId,name:monsterNames.get(childId)??`敌人 ${childId}`,weakness:stage.damage_type,rank:null});
      for(const tag of stage.tag_list??[])core.peak.tags.push({seasonId:raw.id,stageId:id,name:tag.name,desc:tag.desc,params:tag.param});
    }
  }
}

export function buildDataReport(core) {
  const listed = new Set(core.buffCatalog.map((e) => e.id));
  const gaps = [];
  for (const s of catalogSources(core)) {
    const parts = buffClauseParts(s.text);
    parts.forEach((part, i) => {
      const c = classifyClause(part, classifyOptsFor(s, core, null, parts.slice(0, i)));
      if (!c || !['NO_ATTR', 'TARGET_UNKNOWN', 'SIDE_UNKNOWN'].includes(c.bucket) || listed.has(entryId(s.source, i))) return;
      let category = 'needs_rule';
      if (/造成#\d+\[i\](?:次|段)|概率|充能|上限提高至|所需|次数减少|记录|气氛值上限/.test(part)) category = 'mechanics';
      else if (/弱点击破效率|削韧|受到.*伤害降低|抵抗控制|效果抵抗/.test(part)) category = 'survival_or_break';
      else if (/真实伤害|欢愉|增笑|原伤害|当前气氛值|每层对主目标/.test(part)) category = 'special_formula';
      gaps.push({ id: entryId(s.source, i), owner: s.owner, label: s.label, text: part.trim(),
        category, reason: c.bucket, source: s.source });
    });
  }
  const missingSkills = core.skills.filter((s) => !s.desc && ['SingleAttack','AoEAttack','Blast','Bounce'].includes(s.tag))
    .map((s) => ({ id: s.id, charId: s.charId, name: s.name, text: normalize(s.simpleDesc),
      hasParameters: Object.values(s.params).some((p) => p.param_list?.length) }));
  return {
    sources: [
      { name: `${core._meta.version} 正式基础库`, file: core._meta.source, status: '已接入', note: '角色、光锥、遗器、敌人、三深渊；4.6 已通过原始 JSON 与 SQLite 完整性检查' },
      { name: '根目录 4.5 副本', file: 'HSR_现有_4.5.db', status: '内容重复', note: '角色、技能、深渊记录与正式基础库一致' },
      { name: '4.4 正式 / 4.4.55 测试库', file: '核心数据库/基本数据/', status: '已比对', note: '缺完整描述的15条伤害技能在两库也同样缺失；不混用测试数值' },
      { name: '异相仲裁', file: 'data/peak_archive.json 与 4.6 原始 peak JSON', status: '已接入资料', note: `${core.peak.seasons.length}期、${core.peak.stages.length}关、${core.peak.monsters.length}条敌人记录；血量估计未经实测` },
      { name: '差分宇宙 / 货币战争', file: '核心数据库/', status: '范围外', note: '属于独立规则环境，不用于常规伤害计算' },
    ],
    missingSkills, gaps,
    scenarioEffects: Object.values(core.scenarioEffects).reduce((n, s) => n + s.effects.length, 0),
    scenarioSources: Object.values(core.scenarioEffects).filter((s) => s.effects.length).length,
    reviewedAdditions: core.annotations.buffs.filter((b) => b.note?.startsWith('2026-10-13数据库补齐')).length,
    unavailable: [
      { name: '动画逐段权重与完整战斗交互', reason: '数据库没有逐击权重、完整被动触发与敌人行为脚本；模拟器严格模式拒绝未实现的角色机制' },
      { name: '最新赛期的起止时间', reason: '4.6 新增赛期的原始 JSON 未提供日期；沿用有来源的历史日期，新期保持待补录' },
      { name: '缺描述的15条伤害技能', reason: '参数数组在库中，但多个参数的语义未提供；不能只凭位置猜倍率' },
      { name: '忆灵自身攻击力', reason: '已有库仅提供生命和速度继承，缺攻击力继承规则' },
      { name: '欢愉度及完整特殊公式', reason: '没有足够结构化基础字段，现有参数不足以完成这一套伤害模型' },
      { name: '游戏实测伤害锚点', reason: '各库没有实际战斗伤害日志，anchors.json仍为空' },
      { name: '异相仲裁第9期首领血量', reason: '原库精英倍率回退到默认值，不能作为真实血量使用' },
    ],
  };
}
