# -*- coding: utf-8 -*-
"""将抓取的 nanoka.cc HSR 原始 JSON 构建为 SQLite 数据库"""
import json, os, re, sys, sqlite3

LOCALE = "zh"
# 项目根目录 = 本脚本的上一级。不要写死盘符/用户名，换机器会找不到 _data_cache
OUT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(OUT_DIR, "_data_cache")

PATH_MAP = {"knight": "存护", "mage": "智识", "priest": "丰饶", "rogue": "巡猎",
            "shaman": "同谐", "warlock": "虚无", "warrior": "毁灭", "memory": "记忆",
            "elation": "欢愉"}
ELEMENT_MAP = {"Fire": "火", "Ice": "冰", "Wind": "风", "Physical": "物理",
               "Quantum": "量子", "Thunder": "雷", "Imaginary": "虚数"}
SKILL_TYPE_MAP = {"Normal": "普攻", "BPSkill": "战技", "Ultra": "终结技", "QTE": "天赋",
                  "Maze": "秘技", "ElationDamage": "欢愉技", "Assist": "协战技",
                  "Servant": "忆灵技", "Talent": "忆灵天赋"}
CAMP_MAP = {1: "雅利洛-VI", 2: "仙舟「罗浮」", 3: "裂界造物", 4: "模拟宇宙", 5: "星核猎手",
            6: "反物质军团", 7: "银河", 8: "虫群", 9: "星际和平公司", 10: "惊梦剧团",
            11: "忆域迷因", 12: "泰坦眷属", 13: "晨昏奇兽", 14: "黑潮造物", 15: "渊下海妖",
            17: "幻造种", 18: "金血忆灵", 99: "其他"}
TRACE_TYPE_MAP = {1: "技能节点", 2: "战斗技能", 3: "固有技能", 4: "属性节点", 5: "忆灵节点"}

def get_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)

def jdump(v):
    return json.dumps(v, ensure_ascii=False) if v is not None else None

def parse_rarity(r):
    s = str(r or "")
    if "5" in s:
        return 5
    if "4" in s:
        return 4
    if "3" in s:
        return 3
    return None

def num(v, default=0):
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def pick(d, name, default=None):
    """按名字取值，忽略大小写和下划线。

    源文件里的命名风格不统一：monstervalue.json 顶层是驼峰
    （MaxMonsterPhase），PhaseList 内层却是蛇形（phase_max_hp_ratio）。
    照抄名字一旦抄错，取到的是 None，而调用方往往有默认值兜底，
    于是错误被吞掉、静默变成「默认值」——之前 phase_ratios 全库恒 [1]
    就是这么来的。这里把两边都归一成「只有小写字母数字」，抄错大小写
    或漏个下划线都还能命中。
    """
    if not isinstance(d, dict):
        return default
    want = re.sub(r"[^a-z0-9]", "", name.lower())
    for k, v in d.items():
        if re.sub(r"[^a-z0-9]", "", str(k).lower()) == want:
            return v
    return default


class Builder:
    def __init__(self, version, db_path):
        self.version = version
        self.ver_dir = os.path.join(CACHE, version)
        self.loc_dir = os.path.join(self.ver_dir, LOCALE)
        self.db_path = db_path
        if os.path.exists(db_path):
            os.remove(db_path)
        self.conn = sqlite3.connect(db_path)
        self.cur = self.conn.cursor()
        self._create_schema()

    # ---------------- schema ----------------
    def _create_schema(self):
        c = self.cur
        c.execute("PRAGMA foreign_keys=ON")
        c.executescript("""
        CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);

        CREATE TABLE characters (
          id INTEGER PRIMARY KEY, name TEXT, name_en TEXT, name_ja TEXT, name_ko TEXT,
          rarity INTEGER, path TEXT, path_en TEXT, element TEXT, element_en TEXT,
          sp_need INTEGER, release INTEGER, camp TEXT, desc TEXT, icon TEXT,
          enhanced_json TEXT, memosprite_json TEXT, unique_json TEXT
        );
        CREATE TABLE character_skills (
          character_id INTEGER, skill_id INTEGER,
          name TEXT, type TEXT, type_name TEXT, tag TEXT, desc TEXT, simple_desc TEXT,
          sp_base INTEGER, bp_need INTEGER, bp_add INTEGER,
          show_stance_list_json TEXT, params_json TEXT, extra_json TEXT
        );
        CREATE TABLE character_ranks (
          character_id INTEGER, rank_id INTEGER, name TEXT, desc TEXT,
          param_list_json TEXT, icon TEXT
        );
        CREATE TABLE character_traces (
          character_id INTEGER, point_key TEXT, point_id INTEGER, anchor TEXT,
          point_type INTEGER, point_type_name TEXT, point_name TEXT, point_desc TEXT,
          max_level INTEGER, default_unlock INTEGER, avatar_promotion_limit INTEGER,
          level_up_skill_id_json TEXT, status_add_list_json TEXT,
          param_list_json TEXT, pre_point_json TEXT, material_list_json TEXT,
          levels_json TEXT, icon TEXT
        );
        CREATE TABLE character_stats (
          character_id INTEGER, promotion INTEGER,
          hp_base REAL, hp_add REAL, attack_base REAL, attack_add REAL,
          defence_base REAL, defence_add REAL, speed_base REAL,
          critical_chance REAL, critical_damage REAL, base_aggro REAL
        );
        CREATE TABLE character_relics (
          character_id INTEGER PRIMARY KEY,
          set4_ids_json TEXT, set2_ids_json TEXT, property_list3_json TEXT, property_list4_json TEXT
        );
        CREATE TABLE character_lightcones (
          character_id INTEGER, lightcone_id INTEGER, weight INTEGER
        );

        CREATE TABLE lightcones (
          id INTEGER PRIMARY KEY, name TEXT, name_en TEXT, name_ja TEXT, name_ko TEXT,
          rarity INTEGER, path TEXT, path_en TEXT,
          skill_name TEXT, skill_desc TEXT, skill_params_json TEXT, desc TEXT
        );
        CREATE TABLE lightcone_stats (
          lightcone_id INTEGER, promotion INTEGER, max_level INTEGER,
          base_hp REAL, base_attack REAL, base_defence REAL,
          base_hp_add REAL, base_attack_add REAL, base_defence_add REAL,
          player_level_require INTEGER, world_level_require INTEGER
        );

        CREATE TABLE relicsets (
          id INTEGER PRIMARY KEY, name TEXT, name_en TEXT,
          set2_desc TEXT, set2_params_json TEXT,
          set4_desc TEXT, set4_params_json TEXT
        );

        CREATE TABLE monsters (
          id INTEGER PRIMARY KEY, name TEXT, name_en TEXT, name_ja TEXT, name_ko TEXT,
          rank TEXT, camp INTEGER, camp_name TEXT,
          weak_json TEXT, desc TEXT, icon TEXT
        );
        CREATE TABLE monster_stats (
          monster_id INTEGER PRIMARY KEY,
          attack_base REAL, defence_base REAL, hp_base REAL,
          speed_base REAL, stance_base REAL, status_resistance_base REAL,
          critical_damage_base REAL, initial_delay_ratio REAL,
          minimum_fatigue_ratio REAL, stance_count INTEGER
        );
        CREATE TABLE monster_childs (
          monster_id INTEGER, child_id INTEGER,
          elite_group INTEGER, hard_level_group INTEGER,
          hp_modify_ratio REAL, attack_modify_ratio REAL, defence_modify_ratio REAL,
          speed_modify_ratio REAL, speed_modify_value REAL,
          stance_modify_ratio REAL, stance_modify_value REAL,
          stance_weak_json TEXT, damage_type_resistance_json TEXT
        );
        CREATE TABLE monster_skills (
          monster_id INTEGER, child_id INTEGER, skill_id INTEGER,
          skill_name TEXT, skill_desc TEXT, damage_type TEXT,
          sp_hit_base REAL, extra_json TEXT
        );
        CREATE TABLE monster_values (
          monster_id INTEGER PRIMARY KEY,
          hp_base REAL, attack_base REAL, defence_base REAL,
          speed_base REAL, stance_base REAL, status_resistance_base REAL, rank TEXT
        );
        CREATE TABLE elite_groups (
          elite_group INTEGER PRIMARY KEY,
          hp_ratio REAL, attack_ratio REAL, defence_ratio REAL,
          speed_ratio REAL, stance_ratio REAL
        );
        CREATE TABLE hard_level_groups (
          hard_level_group INTEGER, level INTEGER, hp_ratio REAL, attack_ratio REAL,
          defence_ratio REAL, speed_ratio REAL, stance_ratio REAL,
          PRIMARY KEY (hard_level_group, level)
        );
        CREATE TABLE infinite_elite_groups (
          elite_group INTEGER PRIMARY KEY,
          hp_ratio REAL, attack_ratio REAL, defence_ratio REAL,
          speed_ratio REAL, stance_ratio REAL
        );

        CREATE TABLE abyss_seasons (
          mode TEXT, season_id INTEGER, name TEXT,
          buff_name TEXT, buff_desc TEXT, buff_params_json TEXT,
          begin_time TEXT, end_time TEXT, version TEXT,
          -- pf 的赛季级选项。option 本来就存了（但按 floor 复制进 abyss_buffs，
          -- 15 行/期），sub_option 原先整个漏掉。这里各存一份赛季级的原件，
          -- 想查原始数据不必再去 abyss_buffs 里 dedup。
          option_json TEXT, sub_option_json TEXT,
          PRIMARY KEY (mode, season_id)
        );
        CREATE TABLE abyss_floors (
          mode TEXT, season_id INTEGER, floor_id TEXT,
          floor_name TEXT, is_boss INTEGER, hard_name TEXT,
          challenge_json TEXT, damage_types_json TEXT,
          maze_group_id INTEGER, boss_monster_id INTEGER, npc_monster_ids_json TEXT,
          tags_json TEXT, buffs_json TEXT, phase_json TEXT,
          -- 源里 maze_group_id1/2 是一对，原先只存了 id1
          maze_group_id2 INTEGER,
          -- 末日幻影的 Boss 技能表，源里 80/80 个 floor 都有，原先没读
          boss_skill_json TEXT,
          PRIMARY KEY (mode, season_id, floor_id)
        );
        -- ---- 以下两张表来自 biligame Wiki，补 nanoka 的洞 ----
        -- 起止时间：nanoka 的 begin_time/end_time 在源文件里就是空串
        CREATE TABLE abyss_wiki_season (
          mode TEXT, season_id INTEGER, period TEXT, name TEXT,
          begin_time TEXT, end_time TEXT,
          matched_by TEXT,      -- "offset+name"=偏移算出且名字相符 / "name"=靠名字 / NULL=没配上
          wiki_name TEXT,       -- Wiki 侧的期名，跟 nanoka 对不上时便于回溯
          PRIMARY KEY (mode, season_id)
        );
        CREATE TABLE abyss_wiki_wave (
          mode TEXT, season_id INTEGER, period TEXT,
          group_label TEXT,     -- 其一/其二…/星启
          team TEXT,            -- 1队/2队/星启
          wave INTEGER,         -- 0 = 整队属性行（弱点/上限）
          enemies TEXT, special_enemies TEXT, weakness TEXT,
          enemy_cap TEXT, atk_bonus TEXT, hp_bonus TEXT,
          PRIMARY KEY (mode, season_id, group_label, team, wave)
        );
        CREATE TABLE abyss_tags (
          mode TEXT, season_id INTEGER, floor_id TEXT, tag_index INTEGER,
          name TEXT, desc TEXT, params_json TEXT, child_json TEXT,
          PRIMARY KEY (mode, season_id, floor_id, tag_index)
        );
        CREATE TABLE abyss_buffs (
          mode TEXT, season_id INTEGER, floor_id TEXT, buff_index INTEGER,
          name TEXT, desc TEXT, params_json TEXT,
          PRIMARY KEY (mode, season_id, floor_id, buff_index)
        );
        CREATE TABLE abyss_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          mode TEXT, season_id INTEGER, floor_id TEXT,
          side INTEGER, event_index INTEGER, stage_id INTEGER,
          level INTEGER, hard_level_group INTEGER, elite_group INTEGER,
          waves_json TEXT
        );
        CREATE TABLE abyss_wave_monsters (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          mode TEXT, season_id INTEGER, floor_id TEXT, side INTEGER,
          event_index INTEGER, wave_index INTEGER, slot TEXT,
          monster_id INTEGER, base_monster_id INTEGER, monster_name TEXT,
          level INTEGER, hp REAL, speed REAL, stance REAL, status_res REAL,
          toughness REAL,
          weaknesses_json TEXT, spawn_count INTEGER,
          hp_count INTEGER, phase_ratios_json TEXT,
          is_infinite INTEGER, infinite_wave_id TEXT, hp_formula_json TEXT
        );
        CREATE INDEX idx_wave_mode ON abyss_wave_monsters(mode, season_id, floor_id);
        CREATE INDEX idx_wave_monster ON abyss_wave_monsters(base_monster_id);
        """)

    # ---------------- helpers ----------------
    def _exec(self, sql, params):
        self.cur.execute(sql, params)

    # ---------------- characters ----------------
    def build_characters(self):
        meta = get_json(os.path.join(self.ver_dir, "character.json"))
        for cid, cm in meta.items():
            detail_path = os.path.join(self.loc_dir, "character", f"{cid}.json")
            detail = get_json(detail_path) if os.path.exists(detail_path) else {}
            rarity = parse_rarity(detail.get("rarity") or cm.get("rank"))
            path_en = (detail.get("base_type") or cm.get("baseType") or "").lower()
            path_cn = PATH_MAP.get(path_en, path_en)
            elem_en = detail.get("damage_type") or cm.get("damageType")
            camp = None
            chara = detail.get("chara_info") or {}
            if isinstance(chara, dict):
                camp = chara.get("camp")
            self._exec(
                "INSERT INTO characters (id,name,name_en,name_ja,name_ko,rarity,path,path_en,"
                "element,element_en,sp_need,release,camp,desc,icon,enhanced_json,memosprite_json,unique_json) "
                "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (cid, detail.get("name") or cm.get("zh"), cm.get("en"), cm.get("ja"), cm.get("ko"),
                 rarity, path_cn, path_en, ELEMENT_MAP.get(elem_en, elem_en), elem_en,
                 detail.get("sp_need"), cm.get("release"), camp,
                 detail.get("desc") or cm.get("desc"), cm.get("icon"),
                 jdump(detail.get("enhanced")) if detail.get("enhanced") else None,
                 jdump(detail.get("memosprite")) if detail.get("memosprite") else None,
                 jdump(detail.get("unique")) if detail.get("unique") else None))
            self._build_character_skills(cid, detail.get("skills"))
            self._build_character_ranks(cid, detail.get("ranks"))
            self._build_character_traces(cid, detail.get("skill_trees"))
            self._build_character_stats(cid, detail.get("stats"))
            self._build_character_relics(cid, detail.get("relics"))
            self._build_character_lightcones(cid, detail.get("lightcones"))

    def _build_character_skills(self, cid, skills):
        if not isinstance(skills, dict):
            return
        for sid, sk in skills.items():
            if not isinstance(sk, dict):
                continue
            self._exec(
                "INSERT INTO character_skills (character_id,skill_id,name,type,type_name,tag,desc,"
                "simple_desc,sp_base,bp_need,bp_add,show_stance_list_json,params_json,extra_json) "
                "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (cid, sid, sk.get("name"), sk.get("type"), SKILL_TYPE_MAP.get(sk.get("type"), sk.get("type_name")),
                 sk.get("tag"), sk.get("desc"), sk.get("simple_desc"),
                 sk.get("sp_base"), sk.get("bp_need"), sk.get("bp_add"),
                 jdump(sk.get("show_stance_list")), jdump(sk.get("level")), jdump(sk.get("extra"))))

    def _build_character_ranks(self, cid, ranks):
        if not isinstance(ranks, dict):
            return
        for rid, rk in ranks.items():
            if not isinstance(rk, dict):
                continue
            self._exec("INSERT INTO character_ranks (character_id,rank_id,name,desc,param_list_json,icon) "
                       "VALUES (?,?,?,?,?,?)",
                       (cid, rid, rk.get("name"), rk.get("desc"), jdump(rk.get("param_list")), rk.get("icon")))

    def _build_character_traces(self, cid, trees):
        """skill_trees 是 {point01: {等级: 记录}} —— 两层字典，原来漏了下钻，
        导致除 point_key 外所有列恒为 NULL。现按站点惯例（同 character_skills 的
        params_json）：一行一个节点，标量列取 1 级记录，逐级数据整体存进 levels_json。

        已核实：等级 "1" 恒存在；point_id / max_level 在同一节点内跨等级恒定；
        point_name/point_desc 不会只在高级出现（0 例），故取 1 级即可。"""
        if not isinstance(trees, dict):
            return
        for pid, levels in trees.items():
            if not isinstance(levels, dict) or not levels:
                continue
            keys = sorted(levels, key=lambda k: int(k))
            base = levels.get("1") or levels[keys[0]]
            if not isinstance(base, dict):
                continue
            self._exec(
                "INSERT INTO character_traces (character_id,point_key,point_id,anchor,point_type,"
                "point_type_name,point_name,point_desc,max_level,default_unlock,avatar_promotion_limit,"
                "level_up_skill_id_json,status_add_list_json,param_list_json,pre_point_json,"
                "material_list_json,levels_json,icon) "
                "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (cid, pid, base.get("point_id"), base.get("anchor"), base.get("point_type"),
                 TRACE_TYPE_MAP.get(base.get("point_type")), base.get("point_name"),
                 base.get("point_desc"), base.get("max_level"), 1 if base.get("default_unlock") else 0,
                 base.get("avatar_promotion_limit"),
                 jdump(base.get("level_up_skill_id")), jdump(base.get("status_add_list")),
                 jdump(base.get("param_list")), jdump(base.get("pre_point")),
                 jdump(base.get("material_list")), jdump(levels), base.get("icon")))

    def _build_character_stats(self, cid, stats):
        if not isinstance(stats, dict):
            return
        for prom, s in stats.items():
            if not isinstance(s, dict):
                continue
            self._exec("INSERT INTO character_stats (character_id,promotion,hp_base,hp_add,attack_base,"
                       "attack_add,defence_base,defence_add,speed_base,critical_chance,critical_damage,base_aggro) "
                       "VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                       (cid, prom, s.get("hp_base"), s.get("hp_add"), s.get("attack_base"),
                        s.get("attack_add"), s.get("defence_base"), s.get("defence_add"),
                        s.get("speed_base"), s.get("critical_chance"), s.get("critical_damage"), s.get("base_aggro")))

    def _build_character_relics(self, cid, relics):
        if not isinstance(relics, dict):
            return
        self._exec("INSERT INTO character_relics (character_id,set4_ids_json,set2_ids_json,"
                   "property_list3_json,property_list4_json) VALUES (?,?,?,?,?)",
                   (cid, jdump(relics.get("set4_id_list")), jdump(relics.get("set2_id_list")),
                    jdump(relics.get("property_list3")), jdump(relics.get("property_list4"))))

    def _build_character_lightcones(self, cid, lcs):
        if not isinstance(lcs, list):
            return
        for i, lid in enumerate(lcs):
            self._exec("INSERT INTO character_lightcones (character_id,lightcone_id,weight) VALUES (?,?,?)",
                       (cid, lid, i))

    # ---------------- light cones ----------------
    def build_lightcones(self):
        meta = get_json(os.path.join(self.ver_dir, "lightcone.json"))
        for lid, lm in meta.items():
            detail_path = os.path.join(self.loc_dir, "lightcone", f"{lid}.json")
            detail = get_json(detail_path) if os.path.exists(detail_path) else {}
            rarity = parse_rarity(detail.get("rarity") or lm.get("rank"))
            path_en = (detail.get("base_type") or lm.get("baseType") or "").lower()
            path_cn = PATH_MAP.get(path_en, path_en)
            ref = detail.get("refinements") or {}
            stats = detail.get("stats") or []
            base = stats[0] if stats else {}
            self._exec("INSERT INTO lightcones (id,name,name_en,name_ja,name_ko,rarity,path,path_en,"
                       "skill_name,skill_desc,skill_params_json,desc) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                       (lid, detail.get("name") or lm.get("zh"), lm.get("en"), lm.get("ja"), lm.get("ko"),
                        rarity, path_cn, path_en,
                        ref.get("name"), ref.get("desc"), jdump(ref.get("level")),
                        detail.get("desc") or lm.get("desc")))
            for i, s in enumerate(stats):
                if not isinstance(s, dict):
                    continue
                self._exec("INSERT INTO lightcone_stats (lightcone_id,promotion,max_level,base_hp,base_attack,"
                           "base_defence,base_hp_add,base_attack_add,base_defence_add,player_level_require,"
                           "world_level_require) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                           (lid, i, s.get("max_level"), s.get("base_hp"), s.get("base_attack"),
                            s.get("base_defence"), s.get("base_hp_add"), s.get("base_attack_add"),
                            s.get("base_defence_add"), s.get("player_level_require"), s.get("world_level_require")))

    # ---------------- 遗器 ----------------
    def build_relicsets(self):
        path = os.path.join(self.ver_dir, "relicset.json")
        if not os.path.exists(path):
            return
        data = get_json(path)
        for rid, rs in data.items():
            if not isinstance(rs, dict):
                continue
            s2 = rs.get("set", {}).get("2") or {}
            s4 = rs.get("set", {}).get("4") or {}
            self._exec("INSERT INTO relicsets (id,name,name_en,set2_desc,set2_params_json,set4_desc,"
                       "set4_params_json) VALUES (?,?,?,?,?,?,?)",
                       (rid, rs.get("zh"), rs.get("en"),
                        s2.get("zh"), jdump(s2.get("ParamList")),
                        s4.get("zh"), jdump(s4.get("ParamList"))))

    # ---------------- monsters ----------------
    def build_monsters(self):
        meta = get_json(os.path.join(self.ver_dir, "monster.json"))
        values = get_json(os.path.join(self.ver_dir, "monstervalue.json"))
        # monster 详情（含技能/机制）
        detail_dir = os.path.join(self.loc_dir, "monster")
        for mid, mm in meta.items():
            camp = mm.get("camp")
            detail = {}
            dp = os.path.join(detail_dir, f"{mid}.json")
            if os.path.exists(dp):
                detail = get_json(dp)
            self._exec("INSERT INTO monsters (id,name,name_en,name_ja,name_ko,rank,camp,camp_name,"
                       "weak_json,desc,icon) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                       (mid, detail.get("name") or mm.get("zh"), mm.get("en"), mm.get("ja"), mm.get("ko"),
                        mm.get("rank"), camp, CAMP_MAP.get(camp), jdump(mm.get("weak")),
                        detail.get("desc") or mm.get("desc"), mm.get("icon")))
            # 基础数值（优先详情，回退 monstervalue）
            base = detail if detail.get("hp_base") is not None else (values.get(mid) or {})
            self._exec("INSERT INTO monster_stats (monster_id,attack_base,defence_base,hp_base,speed_base,"
                       "stance_base,status_resistance_base,critical_damage_base,initial_delay_ratio,"
                       "minimum_fatigue_ratio,stance_count) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                       (mid,
                        base.get("attack_base", base.get("AttackBase")),
                        base.get("defence_base", base.get("DefenceBase")),
                        base.get("hp_base", base.get("HPBase")),
                        base.get("speed_base", base.get("SpeedBase")),
                        base.get("stance_base", base.get("StanceBase")),
                        base.get("status_resistance_base", base.get("StatusResistanceBase")),
                        base.get("critical_damage_base"),
                        base.get("initial_delay_ratio"),
                        base.get("minimum_fatigue_ratio"),
                        base.get("stance_count")))
            # child 配置
            children = detail.get("child") or values.get(mid, {}).get("child") or []
            for ch in children:
                if not isinstance(ch, dict):
                    continue
                self._exec("INSERT INTO monster_childs (monster_id,child_id,elite_group,hard_level_group,"
                           "hp_modify_ratio,attack_modify_ratio,defence_modify_ratio,speed_modify_ratio,"
                           "speed_modify_value,stance_modify_ratio,stance_modify_value,stance_weak_json,"
                           "damage_type_resistance_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                           (mid, ch.get("id", ch.get("Id")),
                            ch.get("elite_group", ch.get("EliteGroup")),
                            ch.get("hard_level_group", ch.get("HardLevelGroup")),
                            ch.get("hp_modify_ratio", ch.get("HPModifyRatio")),
                            ch.get("attack_modify_ratio", ch.get("AttackModifyRatio")),
                            ch.get("defence_modify_ratio", ch.get("DefenceModifyRatio")),
                            ch.get("speed_modify_ratio", ch.get("SpeedModifyRatio")),
                            ch.get("speed_modify_value", ch.get("SpeedModifyValue")),
                            ch.get("stance_modify_ratio", ch.get("StanceModifyRatio")),
                            ch.get("stance_modify_value"),
                            jdump(ch.get("stance_weak_list", ch.get("StanceWeakList"))),
                            jdump(ch.get("damage_type_resistance"))))
                # 技能（怪物机制）
                for sk in ch.get("skill_list") or []:
                    if not isinstance(sk, dict):
                        continue
                    self._exec("INSERT INTO monster_skills (monster_id,child_id,skill_id,skill_name,"
                               "skill_desc,damage_type,sp_hit_base,extra_json) VALUES (?,?,?,?,?,?,?,?)",
                               (mid, ch.get("id", ch.get("Id")), sk.get("id"), sk.get("skill_name"),
                                sk.get("skill_desc"), sk.get("damage_type"), sk.get("sp_hit_base"),
                                jdump(sk.get("extra"))))
        # monstervalue 全量（HP 计算用）
        for mid, mv in values.items():
            if not isinstance(mv, dict):
                continue
            self._exec("INSERT INTO monster_values (monster_id,hp_base,attack_base,defence_base,speed_base,"
                       "stance_base,status_resistance_base,rank) VALUES (?,?,?,?,?,?,?,?)",
                       (mid, mv.get("HPBase"), mv.get("AttackBase"), mv.get("DefenceBase"),
                        mv.get("SpeedBase"), mv.get("StanceBase"), mv.get("StatusResistanceBase"), mv.get("Rank")))

    # ---------------- 战斗数值表 ----------------
    def build_groups(self):
        eg = get_json(os.path.join(self.ver_dir, "EliteGroup.json"))
        if isinstance(eg, list):
            for e in eg:
                if not isinstance(e, dict):
                    continue
                self._exec("INSERT OR REPLACE INTO elite_groups (elite_group,hp_ratio,attack_ratio,"
                           "defence_ratio,speed_ratio,stance_ratio) VALUES (?,?,?,?,?,?)",
                           (e.get("EliteGroup"), e.get("HPRatio"), e.get("AttackRatio"),
                            e.get("DefenceRatio"), e.get("SpeedRatio"), e.get("StanceRatio")))
        hl = get_json(os.path.join(self.ver_dir, "HardLevelGroup.json"))
        if isinstance(hl, list):
            for e in hl:
                if not isinstance(e, dict):
                    continue
                self._exec("INSERT OR REPLACE INTO hard_level_groups (hard_level_group,level,hp_ratio,"
                           "attack_ratio,defence_ratio,speed_ratio,stance_ratio) VALUES (?,?,?,?,?,?,?)",
                           (e.get("HardLevelGroup"), e.get("Level"), e.get("HPRatio"), e.get("AttackRatio"),
                            e.get("DefenceRatio"), e.get("SpeedRatio"), e.get("StanceRatio")))
        ie = get_json(os.path.join(self.ver_dir, "InfiniteEliteGroup.json"))
        if isinstance(ie, list):
            for e in ie:
                if not isinstance(e, dict):
                    continue
                self._exec("INSERT OR REPLACE INTO infinite_elite_groups (elite_group,hp_ratio,attack_ratio,"
                           "defence_ratio,speed_ratio,stance_ratio) VALUES (?,?,?,?,?,?)",
                           (e.get("EliteGroup"), e.get("HPRatio"), e.get("AttackRatio"),
                            e.get("DefenceRatio"), e.get("SpeedRatio"), e.get("StanceRatio")))

    # ---------------- 深渊 ----------------
    def _load_maps(self):
        self.monster_map = get_json(os.path.join(self.ver_dir, "monster.json"))
        self.monster_value_map = get_json(os.path.join(self.ver_dir, "monstervalue.json"))
        self.elite_group_map = {}
        eg = get_json(os.path.join(self.ver_dir, "EliteGroup.json"))
        for e in eg:
            self.elite_group_map[e["EliteGroup"]] = e
        self.infinite_elite_group_map = {}
        ie = get_json(os.path.join(self.ver_dir, "InfiniteEliteGroup.json"))
        for e in ie:
            self.infinite_elite_group_map[e["EliteGroup"]] = e
        self.hard_level_map = {}
        hl = get_json(os.path.join(self.ver_dir, "HardLevelGroup.json"))
        for e in hl:
            self.hard_level_map[f"{e['HardLevelGroup']}:{e['Level']}"] = e

    def _base_id(self, mid):
        s = str(mid)
        if not s.isdigit():
            return str(mid)
        return s[:7]

    def _find_child(self, d, monster_id, base_id):
        children = d.get("child") or []
        if not isinstance(children, list) or not children:
            return {}
        for ch in children:
            if ch.get("Id") == monster_id:
                return ch
        for ch in children:
            if str(ch.get("Id")) == str(base_id):
                return ch
        return children[0]

    def _compute_enemy(self, monster_id, event, infinite_wave=None):
        """复刻站点 se() 逻辑。event 提供 Level/HardLevelGroup；infinite_wave 提供 EliteGroup/ParamList(无限模式)。"""
        base_id = self._base_id(monster_id)
        G = self.monster_map.get(base_id) or {}
        d = self.monster_value_map.get(base_id) or {}
        M = self._find_child(d, monster_id, base_id)
        if not G or not d or not M:
            return None
        # 精英组：优先用关卡/波次指定的，取不到才退回怪物自带的默认组。
        # 记下 id 和取自哪张表，否则事后没法判断这个血量是怎么算出来的。
        if infinite_wave is not None:
            eg = infinite_wave.get("elite_group")
        else:
            eg = event.get("elite_group") if event else None
        Q, eg_src = self._pick_elite_group(eg)
        if not Q:
            eg = M.get("EliteGroup")
            Q, eg_src = self._pick_elite_group(eg)
            eg_src = (eg_src or "") + "(怪物默认)"
        hlg = event.get("hard_level_group") if event else None
        lv = event.get("level") if event else None
        U = self.hard_level_map.get(f"{hlg}:{lv}") or {}
        def num(v, d=1.0):
            try:
                return float(v) if v is not None else d
            except (TypeError, ValueError):
                return d
        inf_param = None
        if infinite_wave is not None:
            pl = infinite_wave.get("param_list") or []
            if len(pl) > 1:
                inf_param = num(pl[1])
        hp = num(d.get("HPBase"), 0) * num(M.get("HPModifyRatio")) * num(Q.get("HPRatio")) * num(U.get("HPRatio"))
        if inf_param is not None:
            hp *= 1 + inf_param
        # 算血的每个因子都留底。原来只存一句公式字符串，血量对不上时完全没法查。
        hp_ops = {
            "hp_base": num(d.get("HPBase"), 0),
            "hp_modify_ratio": num(M.get("HPModifyRatio")),
            "elite_group": eg, "eg_hp_ratio": num(Q.get("HPRatio")), "eg_source": eg_src,
            # 干净的表名（不带「(怪物默认)」后缀），拼公式串用
            "eg_table": (eg_src or "").replace("(怪物默认)", "") or None,
            "hard_level_group": hlg, "level": lv, "hlg_hp_ratio": num(U.get("HPRatio")),
            "infinite_param": inf_param,
        }
        speed = (num(d.get("SpeedBase"), 0) * num(M.get("SpeedModifyRatio")) * num(Q.get("SpeedRatio")) *
                 num(U.get("SpeedRatio")) + num(M.get("SpeedModifyValue"), 0))
        stance = (num(d.get("StanceBase"), 0) * num(M.get("StanceModifyRatio")) * num(Q.get("StanceRatio")) *
                  num(U.get("StanceRatio")) + num(M.get("StanceModifyValue") or M.get("stance_modify_value"), 0))
        lv_n = int(lv or 1)
        bonus = min(max(lv_n - 50, 0) * 0.4, 10) if lv_n >= 51 else 0
        status_res = num(d.get("StatusResistanceBase"), 0) * 100 + bonus
        weak = M.get("StanceWeakList") or G.get("weak") or []
        hp_count = 1
        phase_ratios = [1]
        mphase = pick(d, "MaxMonsterPhase")
        if isinstance(mphase, (int, float)) and not isinstance(mphase, bool) and mphase >= 1:
            hp_count = int(mphase)
        # 键名是 phase_max_hp_ratio（蛇形），原先写成 PhaseMaxHPRatio 取不到，
        # 而下面的 default=1 又把空值兜成了 [1]，于是全库 7806 行恒 [1]。
        # 用 pick 归一化名字，再对「段数对不上」这种情况显式记录，别再静默兜底。
        plist = pick(d, "PhaseList") or []
        if isinstance(plist, list):
            ratios = [num(pick(p, "phase_max_hp_ratio"), 1) for p in plist if isinstance(p, dict)]
            if ratios:
                phase_ratios = ratios
        if hp_count > 1 and len(phase_ratios) != hp_count:
            hp_ops["phase_mismatch"] = {"hp_count": hp_count, "got": len(phase_ratios)}
        return {
            "monster_id": monster_id, "base_monster_id": int(base_id),
            "monster_name": G.get("zh") or G.get("en") or str(monster_id),
            "level": lv_n, "hp": round(hp, 1), "speed": round(speed, 1), "stance": round(stance, 1),
            "toughness": round(stance / 3, 2), "status_res": round(status_res, 1),
            "weaknesses": weak,
            "hp_count": hp_count, "phase_ratios": phase_ratios,
            "hp_ops": hp_ops,
        }

    def _hp_formula(self, en, infinite=False):
        """按这个怪实际用的精英组表拼公式串。

        以前两句公式串是写死的，无限波那句恒写 InfiniteEliteGroup，而三深渊的
        无限波其实全走 EliteGroup（InfiniteEliteGroup 是异相仲裁在用的），
        看串会对不上 operands.eg_source。这里直接跟 eg_source 保持一致。
        """
        tbl = en["hp_ops"].get("eg_table") or "EliteGroup"
        f = f"HPBase*HPModifyRatio*{tbl}.HPRatio*HardLevelGroup.HPRatio"
        return f + "*(1+ParamList[1])" if infinite else f

    def _pick_elite_group(self, eg):
        """精英组要两张表一起查。

        三深渊只用 EliteGroup（7806 条波次全查过，InfiniteEliteGroup 命中 0），
        用 InfiniteEliteGroup 的是异相仲裁。两张表的 id 空间完全不重叠
        （EliteGroup 1~46509 / InfiniteEliteGroup 345~42600104），所以合并查
        不会撞车；返回取自哪张表以便回溯。
        """
        if eg is None:
            return {}, None
        r = self.elite_group_map.get(eg)
        if r:
            return r, "EliteGroup"
        r = self.infinite_elite_group_map.get(eg)
        if r:
            return r, "InfiniteEliteGroup"
        return {}, None

    def build_abyss(self, mode, list_file, subdir):
        season_list = get_json(os.path.join(self.ver_dir, list_file))
        for sid in season_list.keys():
            detail_path = os.path.join(self.loc_dir, subdir, f"{sid}.json")
            if not os.path.exists(detail_path):
                continue
            season = get_json(detail_path)
            meta = season_list[sid] if isinstance(season_list, dict) else None
            meta_name = meta.get("zh") if isinstance(meta, dict) else None
            self._insert_season(mode, sid, season, meta_name)

    # ---------------- biligame Wiki 补料 ----------------
    def _wiki_offset(self, wiki_rows, nanoka_names):
        """用多数票定「期数 -> season_id」的偏移。

        Wiki 的期数是 001 起的流水号，nanoka 的 season_id 带模式前缀
        （as=3000+期数、pf=2000+期数），但 moc 历史上有过重编号，
        不是简单相加。所以先用同名配对投票：每个同名赛期都能算出一个
        (season_id - 期数)，取出现次数最多的那个。名字相同的期越多，
        这个偏移越可信；再用名字逐条复核。
        """
        votes = {}
        byname = {}
        for sid, nm in nanoka_names.items():
            byname.setdefault(nm, []).append(sid)
        for w in wiki_rows:
            p, nm = w.get("period"), w.get("name")
            if not p or not nm:
                continue
            try:
                p = int(p)
            except (TypeError, ValueError):
                continue
            for sid in byname.get(nm, []):
                votes[sid - p] = votes.get(sid - p, 0) + 1
        if not votes:
            return None, 0
        off = max(votes, key=votes.get)
        return off, votes[off]

    def build_wiki(self):
        """把 Wiki 的起止时间与逐波敌名灌进来。

        nanoka 缺这两样：begin_time/end_time 源里就是空串，
        逐波只有 monster ID 没有人话名字。
        """
        path = os.path.join(CACHE, "wiki", "abyss_wiki.json")
        if not os.path.exists(path):
            print("  [wiki] 找不到 abyss_wiki.json，跳过（先跑 fetch_wiki_abyss.py）")
            return
        data = get_json(path)
        for mode, rows in (data.get("seasons") or {}).items():
            nanoka = {sid: nm for sid, nm in self.cur.execute(
                "SELECT season_id, name FROM abyss_seasons WHERE mode=?", (mode,))}
            if not nanoka:
                continue
            off, agree = self._wiki_offset(rows, nanoka)
            # 偏移映射表：期数 -> season_id。逐波记录也用它，所以要留下来。
            pmap = {}
            n_ok = n_doubt = n_skip = 0
            for w in rows:
                p, wname = w.get("period"), w.get("name")
                if not p:
                    continue
                try:
                    p = int(p)
                except (TypeError, ValueError):
                    continue
                sid = p + off if off is not None else None
                if sid is None or sid not in nanoka:
                    n_skip += 1
                    continue
                # 偏移算出来的位置，名字要能对上才算数
                matched = "offset+name" if nanoka[sid] == wname else "offset-only"
                if matched == "offset+name":
                    n_ok += 1
                else:
                    n_doubt += 1
                if matched == "offset+name":
                    # 逐波记录同样只认名字对上的期，否则饮月之乱的波次会挂到 1008
                    pmap[p] = sid
                self._exec("INSERT OR REPLACE INTO abyss_wiki_season "
                           "(mode,season_id,period,name,begin_time,end_time,matched_by,wiki_name) "
                           "VALUES (?,?,?,?,?,?,?,?)",
                           (mode, sid, w.get("period"), wname, w.get("begin"), w.get("end"),
                            matched, wname))
                # 只有名字也对上的才敢回填时间。偏移算出来的位置名字对不上，
                # 说明这一期在两边编不上号（如 moc 017 饮月之乱 nanoka 根本没有），
                # 时间很可能张冠李戴；审核行照留，但别写进 abyss_seasons。
                # 回填只补空值，不覆盖 nanoka 自己给的时间。
                if matched == "offset+name":
                    self._exec("UPDATE abyss_seasons SET begin_time=?, end_time=? "
                               "WHERE mode=? AND season_id=? AND coalesce(begin_time,'')=''",
                               (w.get("begin"), w.get("end"), mode, sid))
            print(f"  [wiki] {mode}: 赛期 {len(rows)}  名字相符 {n_ok}  "
                  f"存疑 {n_doubt}  无对应 {n_skip}  偏移={off}({agree}票)")

            nw = 0
            for r in (data.get("waves") or {}).get(mode, []):
                try:
                    p = int(r.get("period"))
                except (TypeError, ValueError):
                    continue
                sid = pmap.get(p)
                if sid is None:
                    continue
                self._exec("INSERT OR REPLACE INTO abyss_wiki_wave "
                           "(mode,season_id,period,group_label,team,wave,enemies,special_enemies,"
                           "weakness,enemy_cap,atk_bonus,hp_bonus) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                           (mode, sid, r.get("period"), r.get("group"), r.get("team"),
                            r.get("wave", 0), r.get("enemies"), r.get("special"),
                            r.get("weakness"), r.get("enemy_cap"), r.get("atk_bonus"), r.get("hp_bonus")))
                nw += 1
            if nw:
                print(f"         逐波 {nw} 条")

    def _insert_season(self, mode, sid, season, meta_name=None):
        sid = int(sid)
        if isinstance(season, list):
            # 混沌回忆(maze)详情是 list of floors
            f0 = season[0] if season else {}
            name = meta_name or (f0.get("group_name") if isinstance(f0, dict) else None)
            buff = {"name": f0.get("group_name") if isinstance(f0, dict) else None,
                    "desc": f0.get("desc") if isinstance(f0, dict) else None,
                    "param": f0.get("param") if isinstance(f0, dict) else None}
            # moc 源里 begin_time/end_time 就是空串（518 个 floor 全查过），
            # 但仍从 f0 取一份，免得哪天站点填了这边反而漏掉。
            begin = (f0.get("begin_time") or "") if isinstance(f0, dict) else ""
            end = (f0.get("end_time") or "") if isinstance(f0, dict) else ""
            option = sub_option = None
        else:
            name = season.get("name")
            buff = season.get("buff") or {}
            if not isinstance(buff, dict):
                buff = {}
            begin, end = season.get("begin_time"), season.get("end_time")
            option, sub_option = season.get("option"), season.get("sub_option")
        self._exec("INSERT INTO abyss_seasons (mode,season_id,name,buff_name,buff_desc,buff_params_json,"
                   "begin_time,end_time,version,option_json,sub_option_json) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                   (mode, sid, name, buff.get("name"), buff.get("desc"),
                    jdump(buff.get("param")), begin, end, self.version,
                    jdump(option), jdump(sub_option)))
        if mode == "moc":
            self._build_moc(sid, season)
        elif mode == "pf":
            self._build_pf(sid, season)
        elif mode == "as":
            self._build_boss(sid, season)

    # --- 楼层机制（tag/buff/phase）解析 ---
    def _insert_mechanics(self, mode, sid, fid, tags, buffs, phase=None):
        for i, t in enumerate(tags or []):
            if not isinstance(t, dict):
                continue
            self._exec("INSERT OR REPLACE INTO abyss_tags (mode,season_id,floor_id,tag_index,name,desc,"
                       "params_json,child_json) VALUES (?,?,?,?,?,?,?,?)",
                       (mode, sid, fid, i, t.get("name"), t.get("desc"),
                        jdump(t.get("param")), jdump(t.get("child"))))
        for i, b in enumerate(buffs or []):
            if not isinstance(b, dict):
                continue
            self._exec("INSERT OR REPLACE INTO abyss_buffs (mode,season_id,floor_id,buff_index,name,desc,"
                       "params_json) VALUES (?,?,?,?,?,?,?)",
                       (mode, sid, fid, i, b.get("name"), b.get("desc"), jdump(b.get("param"))))

    # --- MOC 混沌回忆（maze 详情为 list of floors，上下半普通波次）---
    def _build_moc(self, sid, season):
        for floor in season or []:
            if not isinstance(floor, dict):
                continue
            fid = str(floor.get("id"))
            buffs = []
            if floor.get("desc"):
                buffs.append({"name": floor.get("group_name"), "desc": floor.get("desc"),
                              "param": floor.get("param")})
            self._exec("INSERT INTO abyss_floors (mode,season_id,floor_id,floor_name,is_boss,hard_name,"
                       "challenge_json,damage_types_json,maze_group_id,boss_monster_id,npc_monster_ids_json,"
                       "tags_json,buffs_json,phase_json,maze_group_id2,boss_skill_json) "
                       "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                       ("moc", sid, fid, floor.get("name"), 0, None,
                        jdump(floor.get("challenge")), jdump([floor.get("damage_type1"), floor.get("damage_type2")]),
                        floor.get("maze_group_id1"), None,
                        jdump([floor.get("npc_monster_id_list1"), floor.get("npc_monster_id_list2")]),
                        None, jdump(buffs), jdump({"countdown": floor.get("countdown")}),
                        floor.get("maze_group_id2"), None))
            self._insert_mechanics("moc", sid, fid, None, buffs)
            for side, key in ((1, "event_id_list1"), (2, "event_id_list2")):
                events = floor.get(key) or []
                for ei, ev in enumerate(events):
                    if isinstance(ev, dict):
                        self._store_event_and_waves("moc", sid, fid, side, ei, ev, infinite=False)

    # --- AS 末日幻影（boss 详情：level 列表，上下半普通波次 + 首领机制）---
    def _build_boss(self, sid, season):
        for lv in season.get("level") or []:
            if not isinstance(lv, dict):
                continue
            fid = str(lv.get("id"))
            tags = []
            buffs = []
            phase = []
            for bc in (lv.get("boss_monster_config1"), lv.get("boss_monster_config2")):
                if isinstance(bc, dict):
                    for t in bc.get("tag_list") or []:
                        if isinstance(t, dict):
                            tags.append(t)
                    phase.append({"boss_monster_config": bc})
            for blist in (season.get("buff_list1"), season.get("buff_list2"), season.get("buff_list3")):
                if isinstance(blist, list):
                    buffs.extend(blist)
            self._exec("INSERT INTO abyss_floors (mode,season_id,floor_id,floor_name,is_boss,hard_name,"
                       "challenge_json,damage_types_json,maze_group_id,boss_monster_id,npc_monster_ids_json,"
                       "tags_json,buffs_json,phase_json,maze_group_id2,boss_skill_json) "
                       "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                       ("as", sid, fid, lv.get("name"), 0, None,
                        jdump(lv.get("challenge")), jdump([lv.get("damage_type1"), lv.get("damage_type2")]),
                        lv.get("maze_group_id1"), lv.get("boss_monster_id1"), None,
                        jdump(tags), jdump(buffs), jdump(phase),
                        lv.get("maze_group_id2"),
                        # 上下半两个 Boss 各一张技能表，按 [半1, 半2] 存
                        jdump([lv.get("boss_monster_id1_skill_list"),
                               lv.get("boss_monster_id2_skill_list")])))
            self._insert_mechanics("as", sid, fid, tags, buffs)
            for side, key in ((1, "event_id_list1"), (2, "event_id_list2")):
                events = lv.get(key) or []
                for ei, ev in enumerate(events):
                    if not isinstance(ev, dict):
                        continue
                    self._store_event_and_waves("as", sid, fid, side, ei, ev, infinite=False)

    # --- PF 虚构叙事 ---
    def _build_pf(self, sid, season):
        for lv in season.get("level") or []:
            if not isinstance(lv, dict):
                continue
            fid = str(lv.get("id"))
            self._exec("INSERT INTO abyss_floors (mode,season_id,floor_id,floor_name,is_boss,hard_name,"
                       "challenge_json,damage_types_json,maze_group_id,boss_monster_id,npc_monster_ids_json,"
                       "tags_json,buffs_json,phase_json,maze_group_id2,boss_skill_json) "
                       "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                       ("pf", sid, fid, lv.get("name"), 0, None,
                        jdump(lv.get("challenge")), jdump([lv.get("damage_type1"), lv.get("damage_type2")]),
                        lv.get("maze_group_id1"), None,
                        jdump([lv.get("npc_monster_id_list1"), lv.get("npc_monster_id_list2")]),
                        None, jdump(season.get("option")), None,
                        lv.get("maze_group_id2"), None))
            self._insert_mechanics("pf", sid, fid, None, season.get("option"))
            for side, (evkey, infkey) in ((1, ("event_id_list1", "infinite_list1")),
                                          (2, ("event_id_list2", "infinite_list2"))):
                events = lv.get(evkey) or []
                inf = lv.get(infkey) or {}
                if inf and isinstance(inf, dict):
                    self._store_infinite_waves("pf", sid, fid, side, events, inf)
                else:
                    for ei, ev in enumerate(events):
                        if isinstance(ev, dict):
                            self._store_event_and_waves("pf", sid, fid, side, ei, ev, infinite=False)

    def _store_event_and_waves(self, mode, sid, fid, side, ei, ev, infinite=False):
        waves = ev.get("monster_list") or []
        self._exec("INSERT INTO abyss_events (mode,season_id,floor_id,side,event_index,stage_id,level,"
                   "hard_level_group,elite_group,waves_json) VALUES (?,?,?,?,?,?,?,?,?,?)",
                   (mode, sid, fid, side, ei, ev.get("stage_id"), ev.get("level"),
                    ev.get("hard_level_group"), ev.get("elite_group"), jdump(waves)))
        event_id = self.cur.lastrowid
        for wi, wave in enumerate(waves):
            if not isinstance(wave, dict):
                continue
            for slot in sorted(wave.keys()):
                mid = wave[slot]
                if not isinstance(mid, int):
                    continue
                en = self._compute_enemy(mid, ev, None)
                if en is None:
                    continue
                self._exec("INSERT INTO abyss_wave_monsters (mode,season_id,floor_id,side,event_index,"
                           "wave_index,slot,monster_id,base_monster_id,monster_name,level,hp,speed,stance,"
                           "status_res,toughness,weaknesses_json,spawn_count,hp_count,phase_ratios_json,"
                           "is_infinite,infinite_wave_id,hp_formula_json) "
                           "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                           (mode, sid, fid, side, ei, wi, slot, mid, en["base_monster_id"],
                            en["monster_name"], en["level"], en["hp"], en["speed"], en["stance"],
                            en["status_res"], en["toughness"], jdump(en["weaknesses"]), 1, en["hp_count"],
                            jdump(en["phase_ratios"]), 0, None,
                            jdump({"hp_formula": self._hp_formula(en), "operands": en["hp_ops"]})))

    def _store_infinite_waves(self, mode, sid, fid, side, events, inf):
        first_event = events[0] if isinstance(events, list) and events else {}
        # elite_group 取自波次本身（源里 624/624 个无限波都有值），
        # 原先写死 None，导致 pf 的 event 全部查不到用了哪个精英组。
        first_wave = next((w for w in inf.values() if isinstance(w, dict)), {})
        self._exec("INSERT INTO abyss_events (mode,season_id,floor_id,side,event_index,stage_id,level,"
                   "hard_level_group,elite_group,waves_json) VALUES (?,?,?,?,?,?,?,?,?,?)",
                   (mode, sid, fid, side, 0, None, first_event.get("level"),
                    first_event.get("hard_level_group"), first_wave.get("elite_group"), jdump(inf)))
        event_id = self.cur.lastrowid
        for iwid, iw in inf.items():
            if not isinstance(iw, dict):
                continue
            groups = iw.get("monster_group_id_list") or []
            counts = {}
            for g in groups:
                counts[g] = counts.get(g, 0) + 1
            for gi, (mid, count) in enumerate(counts.items()):
                en = self._compute_enemy(mid, first_event, iw)
                if en is None:
                    continue
                self._exec("INSERT INTO abyss_wave_monsters (mode,season_id,floor_id,side,event_index,"
                           "wave_index,slot,monster_id,base_monster_id,monster_name,level,hp,speed,stance,"
                           "status_res,toughness,weaknesses_json,spawn_count,hp_count,phase_ratios_json,"
                           "is_infinite,infinite_wave_id,hp_formula_json) "
                           "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                           (mode, sid, fid, side, 0, gi, f"group{gi}", mid, en["base_monster_id"],
                            en["monster_name"], en["level"], en["hp"], en["speed"], en["stance"],
                            en["status_res"], en["toughness"], jdump(en["weaknesses"]), count, en["hp_count"],
                            jdump(en["phase_ratios"]), 1, str(iwid),
                            jdump({"hp_formula": self._hp_formula(en, infinite=True),
                                   "operands": en["hp_ops"]})))

    # ---------------- 主流程 ----------------
    def build(self):
        self._exec("INSERT INTO meta VALUES ('version', ?)", (self.version,))
        self._exec("INSERT INTO meta VALUES ('locale', ?)", (LOCALE,))
        self._exec("INSERT INTO meta VALUES ('source', 'nanoka.cc (static.nanoka.cc/hsr)')", ())
        self._exec("INSERT INTO meta VALUES ('hp_formula', "
                   "'HP = HPBase x HPModifyRatio x <精英组表>.HPRatio x HardLevelGroup.HPRatio; "
                   "无限波次再乘 (1+ParamList[1])。三深渊的精英组全部取自 EliteGroup，"
                   "逐条实际使用哪张表见 abyss_wave_monsters.hp_formula_json 的 operands.eg_source' )", ())
        self._exec("INSERT INTO meta VALUES ('modes', "
                   "'moc=混沌回忆(maze.json/zh/maze), pf=虚构叙事(maze_extra.json/zh/story), "
                   "as=末日幻影(maze_boss.json/zh/boss)' )", ())
        self._exec("INSERT INTO meta VALUES ('wiki_source', "
                   "'abyss_wiki_season / abyss_wiki_wave 来自 wiki.biligame.com/sr "
                   "(SMW action=ask 取起止时间，赛期模板取逐波敌名)。"
                   "abyss_seasons.begin_time 由它回填，因为 nanoka 源里是空串。' )", ())
        print(f"[{self.version}] 构建角色...")
        self.build_characters()
        print(f"[{self.version}] 构建光锥...")
        self.build_lightcones()
        print(f"[{self.version}] 构建遗器...")
        self.build_relicsets()
        print(f"[{self.version}] 构建怪物...")
        self.build_monsters()
        print(f"[{self.version}] 构建数值表...")
        self.build_groups()
        print(f"[{self.version}] 构建深渊...")
        self._load_maps()
        self.build_abyss("moc", "maze.json", "maze")
        self.build_abyss("pf", "maze_extra.json", "story")
        self.build_abyss("as", "maze_boss.json", "boss")
        print(f"[{self.version}] 补 biligame Wiki（起止时间 / 逐波敌名）...")
        self.build_wiki()
        self.conn.commit()
        self.conn.close()
        print(f"[{self.version}] 完成 -> {self.db_path}")


def discover_versions():
    """扫描 _data_cache 得出 (正式服, 测试服) 版本号，取代原来写死的列表。
    正式服 = 形如 X.Y 的最大版本；测试服 = 形如 X.Y.ZZ 的最大版本。
    只认目录里确实有 character.json 的版本。"""
    def parts(v):
        return [int(x) for x in v.split(".")]

    live = beta = None
    if not os.path.isdir(CACHE):
        return None, None
    for d in os.listdir(CACHE):
        segs = d.split(".")
        if not all(s.isdigit() for s in segs):
            continue
        if not os.path.exists(os.path.join(CACHE, d, "character.json")):
            continue
        if len(segs) == 2:
            if live is None or parts(d) > parts(live):
                live = d
        elif len(segs) >= 3:
            if beta is None or parts(d) > parts(beta):
                beta = d
    return live, beta


def db_name_for(ver):
    """正式服 -> HSR_现有_X.Y ；测试服 -> HSR_测试服_X.Y.ZZ"""
    return f"HSR_测试服_{ver}" if len(ver.split(".")) >= 3 else f"HSR_现有_{ver}"


def main():
    # 用法：
    #   python build_db.py            只建正式服（自动取最高 X.Y）
    #   python build_db.py --all      正式服 + 测试服
    #   python build_db.py 4.5        指定版本
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    flags = {a for a in sys.argv[1:] if a.startswith("--")}

    if args:
        vers = args
    else:
        live, beta = discover_versions()
        if not live:
            print(f"在 {CACHE} 里找不到正式服版本目录（需含 character.json）")
            sys.exit(1)
        print(f"自动识别版本: 正式服={live}  测试服={beta}")
        vers = [live]
        if "--all" in flags and beta:
            vers.append(beta)

    for ver in vers:
        src = os.path.join(CACHE, ver, "character.json")
        if not os.path.exists(src):
            print(f"跳过 {ver}：缺少 {src}")
            continue
        name = db_name_for(ver)
        db_path = os.path.join(OUT_DIR, f"{name}.db")
        print(f"[{ver}] -> {name}.db")
        Builder(ver, db_path).build()


if __name__ == "__main__":
    main()
