#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""raw/ -> peak.db + peak.json，并把 nanoka 与 biligame 两边对拍。

两个来源各有长短，不强行并成一张表：
  nanoka   有怪物 ID / 波次配置 / 机制参数（结构化，但没起止时间、没逐波敌名）
  biligame 有起止时间 / 逐波敌名 / 绝境特性 / 裁决象限（人写的，但没有 ID）
所以各自建表，再用 xcheck 表记录逐项比对结果。

用法：python build_peak.py
"""

import html as htmlmod
import json
import os
import re
import sqlite3
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
RAW = os.path.join(ROOT, "raw")
DB = os.path.join(ROOT, "peak.db")
JSON_OUT = os.path.join(ROOT, "peak.json")

# nanoka 里属性是英文枚举，biligame 是中文 —— 对拍前先归一
ELEMENT = {"Fire": "火", "Ice": "冰", "Wind": "风", "Thunder": "雷",
           "Quantum": "量子", "Imaginary": "虚数", "Physical": "物理"}

SCHEMA = """
CREATE TABLE meta (k TEXT PRIMARY KEY, v TEXT);

-- ── nanoka ──────────────────────────────────────────────
CREATE TABLE season (                 -- 一期 = 一个赛季
  id INTEGER PRIMARY KEY,             -- 期数（与 biligame 的 001~009 对应）
  name_zh TEXT, name_en TEXT, name_ja TEXT, name_ko TEXT,
  version TEXT,                       -- 实装版本，来自 peak/version.json
  pre_level_count INTEGER,            -- 前置关数（正常 3）
  has_boss_config INTEGER
);

CREATE TABLE stage (                  -- 前置关 + 终 Boss 共用一个表
  season_id INTEGER NOT NULL,
  slot TEXT NOT NULL,                 -- 'pre' | 'boss'
  seq INTEGER NOT NULL,               -- pre: 0/1/2；boss: 0
  level_id INTEGER,                   -- nanoka 关卡 id（101、102…）
  name TEXT,
  battle_level INTEGER,               -- 敌人等级
  stage_id INTEGER,
  damage_type_json TEXT,              -- 弱点属性（英文枚举原样存）
  damage_type_zh TEXT,                -- 转成中文，空格分隔，用于对拍
  monster_list_json TEXT,
  wave_count INTEGER,
  PRIMARY KEY (season_id, slot, seq),
  FOREIGN KEY (season_id) REFERENCES season(id)
);

CREATE TABLE stage_tag (              -- 敌方机制（“机制拉踩”）
  season_id INTEGER, slot TEXT, seq INTEGER,
  tag_id INTEGER, name TEXT,
  desc_template TEXT,                 -- 原文，含 <unbreak>#1[i]</unbreak>
  param_json TEXT,
  desc_text TEXT,                     -- 占位符已还原
  FOREIGN KEY (season_id) REFERENCES season(id)
);

CREATE TABLE stage_wave (             -- infinite_list：一波的配置
  season_id INTEGER, slot TEXT, seq INTEGER,
  wave_id INTEGER,
  monster_group_json TEXT,
  max_monster_count INTEGER, max_teammate_count INTEGER,
  elite_group INTEGER, ability TEXT, param_list_json TEXT,
  -- 血量原料按波算：同一关不同波可以用不同 elite_group（36 关里有 5 关如此），
  -- 只留一个关卡级的就会算错。
  hp_base_sum REAL, eg_hp_ratio REAL, eg_source TEXT, hp_estimated REAL,
  FOREIGN KEY (season_id) REFERENCES season(id)
);

CREATE TABLE stage_monster (          -- 把波次展开成“哪一期哪一关有哪只怪”
  season_id INTEGER, slot TEXT, seq INTEGER,
  wave_id INTEGER, monster_id INTEGER,
  name_zh TEXT, name_en TEXT, rank TEXT,
  weak_json TEXT, weak_zh TEXT,
  FOREIGN KEY (season_id) REFERENCES season(id)
);

CREATE TABLE boss_config (            -- 终 Boss 的额外配置（buff / 事件）
  season_id INTEGER PRIMARY KEY,
  hard_name TEXT, buff_list_json TEXT, event_id_list_json TEXT,
  tag_list_json TEXT, infinite_list_json TEXT,
  FOREIGN KEY (season_id) REFERENCES season(id)
);

-- 血量“原料”。公式未经对拍验证，见 README；这里只存可复算的中间量。
CREATE TABLE stage_hp (
  season_id INTEGER, slot TEXT, seq INTEGER,
  battle_level INTEGER, hard_level_group INTEGER,
  hp_base_sum REAL,                   -- Σ 怪物 HPBase × HPModifyRatio（全波合计）
  monster_count INTEGER,
  hlg_hp_ratio REAL,
  hp_estimated REAL,                  -- hlg_hp_ratio × Σ_waves stage_wave.hp_estimated
  PRIMARY KEY (season_id, slot, seq),
  FOREIGN KEY (season_id) REFERENCES season(id)
);

-- ── biligame ────────────────────────────────────────────
CREATE TABLE bg_season (              -- 起止时间只有 biligame 有
  period INTEGER PRIMARY KEY,         -- 9 .. 1（页面上是倒序）
  name TEXT, start_time TEXT, end_time TEXT
);

CREATE TABLE bg_knight (              -- 三个前置关（页面叫“骑士”）
  period INTEGER, knight INTEGER,     -- 1/2/3 = 骑士一/二/三
  damage_type TEXT,                   -- 建议属性，顿号分隔
  pollution TEXT,                     -- 只有骑士二有
  PRIMARY KEY (period, knight),
  FOREIGN KEY (period) REFERENCES bg_season(period)
);

CREATE TABLE bg_wave (
  period INTEGER, knight INTEGER, wave INTEGER, kind TEXT,   -- kind: elite|normal
  enemies_json TEXT,                  -- [{"name":..,"count":N}, ...]
  FOREIGN KEY (period) REFERENCES bg_season(period)
);

CREATE TABLE bg_tag (                 -- 特性；绝境是王棋的强化版，单列 subject
  period INTEGER, subject TEXT, seq INTEGER, name TEXT, desc TEXT,
  FOREIGN KEY (period) REFERENCES bg_season(period)
);

CREATE TABLE bg_quadrant (            -- 裁决象限（增益）
  period INTEGER, seq INTEGER, name TEXT, desc TEXT,
  PRIMARY KEY (period, seq),
  FOREIGN KEY (period) REFERENCES bg_season(period)
);

CREATE TABLE bg_boss (                -- 王棋本体
  period INTEGER PRIMARY KEY,
  boss_name TEXT, damage_type TEXT,
  elite_enemies_json TEXT, wave2_enemies_json TEXT,
  FOREIGN KEY (period) REFERENCES bg_season(period)
);

-- ── 对拍 ────────────────────────────────────────────────
CREATE TABLE xcheck (
  period INTEGER, item TEXT,
  nanoka_value TEXT, biligame_value TEXT,
  match INTEGER,                      -- 1 一致 / 0 不一致
  note TEXT
);
"""

# ─────────────────────── 占位符还原 ───────────────────────
# 规则与站点一致（同货币战争库，复刻自站点 chunks/hsr.*.js）：
#   <unbreak>#N[i]</unbreak>  取 param[N-1]；后面紧跟 % 则乘 100
#   <unbreak>#N[fK]</unbreak> 同上，保留 K 位小数
# 百分号可能写在外面（<unbreak>#1[i]</unbreak>%），也可能写在里面
# （<unbreak>#2[i]%</unbreak>）—— 后者是多数。所以 ] 和 </unbreak> 之间那段
# 原样捕获（组 4），再看里面有没有 %。只认外面那种的话，百分比会整片漏掉，
# 被下面的裸 #N 兜底接走，最后算成 round(0.2)=0。
RE_PARAM = re.compile(r'<unbreak>#(\d+)\[([if])(\d*)\]([^<]*)</unbreak>(\s*%)?')
RE_PARAM_BARE = re.compile(r'#(\d+)(\s*%)?')
RE_COLOR = re.compile(r'</?color[^>]*>')
RE_TAG = re.compile(r'<[^>]+>')


def restore(desc, param):
    """把占位符换成 param 里的真值。

    两个正则的组结构不同（裸 #N 没有 [i]/[fK]），所以各自一个替换器，
    共用下面的 fmt()。"""
    if not desc:
        return None
    p = param or []

    def fmt(n, kind, prec, pct):
        """n 是 1-based 的 param 下标；kind 为 'f' 时保留 prec 位小数。"""
        if n < 1 or n > len(p):
            return None                       # 越界 -> 调用方原样保留，不静默吞掉
        v = p[n - 1]
        if not isinstance(v, (int, float)):
            s = str(v)
        elif kind == "f":
            s = f"{v * 100 if pct else v:.{int(prec or 0)}f}"
        elif pct:
            s = f"{v * 100:g}"                # 原始数据里百分比是分数：0.15 -> 15
        else:
            s = f"{round(v):g}"
        return s + (pct or "")

    def rep_full(m):
        inner = (m.group(4) or "").strip()          # ] 和 </unbreak> 之间的东西
        pct = "%" if ("%" in inner or (m.group(5) or "").strip()) else ""
        r = fmt(int(m.group(1)), m.group(2), m.group(3), pct)
        return m.group(0) if r is None else r

    def rep_bare(m):
        pct = (m.group(2) or "").strip()
        r = fmt(int(m.group(1)), "", "", pct)
        return m.group(0) if r is None else r

    s = RE_PARAM.sub(rep_full, desc)
    s = RE_PARAM_BARE.sub(rep_bare, s)
    s = RE_COLOR.sub('', s)
    # 兜底：参数缺、格式没见过的占位符会原样留下，至少别把尖括号带进库里
    return RE_TAG.sub('', s).strip() or None


# ─────────────────────── wikitext 模板解析 ───────────────────────
def split_args(body):
    """把 {{模板|k=v|k2=v2}} 的 body 按顶层 | 切开，跳过 {{...}} / [[...]] 内部的 |。"""
    parts, buf, depth_curly, depth_sq = [], [], 0, 0
    i = 0
    while i < len(body):
        two = body[i:i + 2]
        if two == "{{":
            depth_curly += 1; buf.append(two); i += 2; continue
        if two == "}}":
            depth_curly -= 1; buf.append(two); i += 2; continue
        if two == "[[":
            depth_sq += 1; buf.append(two); i += 2; continue
        if two == "]]":
            depth_sq -= 1; buf.append(two); i += 2; continue
        c = body[i]
        if c == "|" and depth_curly == 0 and depth_sq == 0:
            parts.append("".join(buf)); buf = []
        else:
            buf.append(c)
        i += 1
    parts.append("".join(buf))
    return parts


def parse_templates(wikitext, name="异相仲裁单期"):
    """抽出所有 {{name ...}}，返回 [{参数名: 值}]。同名参数后者覆盖前者。"""
    out = []
    for m in re.finditer(r"\{\{" + name + r"\s*(.*?)\n\}\}", wikitext, re.S):
        kv = {}
        for chunk in split_args(m.group(1)):
            if "=" not in chunk:
                continue
            k, _, v = chunk.partition("=")
            kv[k.strip()] = v.strip()
        out.append(kv)
    return out




RE_COMMENT = re.compile(r'<!--.*?-->', re.S)
# {{污染等级|2|「贪饕」侵蚀}} 这种是“模板名|参数…”，显示的是最后一参。
# {{颜色|描述2|50%}} 同理。所以统一规则：带 | 就取最后一参。
RE_TPL = re.compile(r"\{\{([^{}]*)\}\}")


def _tpl_value(body):
    parts = [p.strip() for p in body.split("|")]
    return parts[-1] if len(parts) > 1 else ""


def wiki_text(s):
    """wikitext 值 -> 纯文本。"""
    if not s:
        return None
    s = RE_COMMENT.sub('', s)          # <!--无则留空--> 之类，先去，免得被当成内容
    s = RE_TPL.sub(lambda m: _tpl_value(m.group(1)), s)
    s = s.replace("<br>", "\n").replace("<br/>", "\n").replace("<br />", "\n")
    s = RE_TAG.sub('', s)
    s = htmlmod.unescape(s)
    return s.strip() or None


def parse_enemies(s):
    """「『灯塔』:1、蚕食者之影:1」-> [{'name':..,'count':1}, ...]

    空单元格在源页面里写的是 <!--无则留空-->，清理后是空串，必须丢掉 ——
    否则会凭空多出一只名叫「<!--无则留空-->」的敌人。"""
    s = wiki_text(s)
    if not s:
        return []
    out = []
    for part in re.split(r'[、,，]', s):
        part = part.strip()
        if not part:
            continue
        nm, _, cnt = part.rpartition(":")
        if nm and cnt.strip().isdigit():
            out.append({"name": nm.strip(), "count": int(cnt)})
        else:
            out.append({"name": part, "count": 1})
    return out


# ─────────────────────── 装载 raw ───────────────────────
def load(name):
    with open(os.path.join(RAW, name), encoding="utf-8") as f:
        return json.load(f)


def jd(o):
    return json.dumps(o, ensure_ascii=False) if o is not None else None


def lookup(d, mid):
    """monster/monstervalue 的键只有 7 位，但波次里常用 9 位子 id
    （7 位本体 + 2 位后缀）。前 7 位取本体，12/12 命中。"""
    s = str(mid)
    return d.get(s) or (d.get(s[:7]) if len(s) > 7 else None)


class Builder:
    def __init__(self):
        if os.path.exists(DB):
            os.remove(DB)
        self.db = sqlite3.connect(DB)
        self.db.executescript(SCHEMA)
        self.n = {}
        self.rows = {}          # 表名 -> 行列表，供 JSON 导出

    def exec(self, sql, rows, table=None):
        rows = list(rows)
        if rows:
            self.db.executemany(sql, rows)
        if table:
            self.rows.setdefault(table, []).extend(rows)
        return len(rows)

    # ---- nanoka ----
    def build(self):
        names = load("cdn_maze_peak.json")               # {id: {en,ko,zh,ja}}
        vermap = load("cdn_peak_version.json")           # {版本: [期数]}
        season_ver = {}
        for v, ids in vermap.items():
            for i in ids:
                season_ver[int(i)] = None if v == "unknown" else v

        monsters = load("cdn_monster.json")              # {id: {...zh,en,weak,rank}}
        mvalues = load("cdn_monstervalue.json")          # {id: {HPBase, child:[...]}}
        hlg = {(r["HardLevelGroup"], r["Level"]): r for r in load("cdn_HardLevelGroup.json")}
        # 异相仲裁的波次用的是 InfiniteEliteGroup；普通关卡的才是 EliteGroup。
        # 两张表 id 空间不重叠（实测 353 只在前者、343 只在后者），所以合并查，
        # 但记下取自哪张表以便回溯。
        eg = {r["EliteGroup"]: (r, "EliteGroup") for r in load("cdn_EliteGroup.json")}
        eg.update({r["EliteGroup"]: (r, "InfiniteEliteGroup")
                   for r in load("cdn_InfiniteEliteGroup.json")})

        seas, stgs, tags, waves, mons, bosses, hps = [], [], [], [], [], [], []

        for i in sorted(season_ver):
            raw = load(f"cdn_peak_{i}.json")
            nm = names.get(str(i), {})
            pre = raw.get("pre_level") or []
            bc = raw.get("boss_config") or {}
            # 韩文名里有 <unbreak>（站点原文如此，如「태양의 <unbreak>환상 영역</unbreak>」），
            # 其余语言没有；统一过一遍去标签。
            clean_nm = {k: wiki_text(nm.get(k)) for k in ("zh", "en", "ja", "ko")}
            seas.append((i, clean_nm["zh"] or raw.get("name"), clean_nm["en"],
                         clean_nm["ja"], clean_nm["ko"], season_ver.get(i),
                         len(pre), 1 if bc else 0))

            slots = [("pre", k, s) for k, s in enumerate(pre)]
            if raw.get("boss_level"):
                slots.append(("boss", 0, raw["boss_level"]))

            for slot, seq, s in slots:
                ev = (s.get("event_id_list") or [{}])[0]
                dt = s.get("damage_type") or []
                stgs.append((i, slot, seq, s.get("id"), s.get("name"),
                             ev.get("level"), ev.get("stage_id"), jd(dt),
                             "、".join(ELEMENT.get(x, x) for x in dt) or None,
                             jd(ev.get("monster_list") or []),
                             len(ev.get("monster_list") or [])))

                for t in s.get("tag_list") or []:
                    tags.append((i, slot, seq, t.get("id"), t.get("name"),
                                 t.get("desc"), jd(t.get("param")),
                                 restore(t.get("desc"), t.get("param"))))

                hlg_id = ev.get("hard_level_group")
                lvl = ev.get("level")
                hg = hlg.get((hlg_id, lvl)) if hlg_id and lvl else None
                hlg_ratio = hg["HPRatio"] if hg else None

                base_sum, cnt = 0.0, 0
                for w in (s.get("infinite_list") or {}).values():
                    wid = w.get("infinite_wave_id")
                    eg_id = w.get("elite_group")
                    er, esrc = eg.get(eg_id, (None, None)) if eg_id else (None, None)
                    eg_ratio = er["HPRatio"] if er else None

                    w_base = 0.0
                    for mid in w.get("monster_group_id_list") or []:
                        mi = lookup(monsters, mid) or {}
                        mons.append((i, slot, seq, wid, mid,
                                     mi.get("zh"), mi.get("en"), mi.get("rank"),
                                     jd(mi.get("weak")),
                                     "、".join(ELEMENT.get(x, x) for x in (mi.get("weak") or [])) or None))
                        cnt += 1
                        w_base += monster_hp_base(mvalues, mid)
                    base_sum += w_base

                    w_est = (w_base * eg_ratio) if eg_ratio is not None else None
                    waves.append((i, slot, seq, wid, jd(w.get("monster_group_id_list")),
                                  w.get("max_monster_count"), w.get("max_teammate_count"),
                                  eg_id, w.get("ability"), jd(w.get("param_list")),
                                  round(w_base, 4), eg_ratio, esrc,
                                  round(w_est, 2) if w_est is not None else None))

                # 逐波算完再乘关卡级的等级系数；任一环节缺值就整体不算
                if hlg_ratio is not None and all(
                        r[13] is not None for r in waves if r[0] == i
                        and r[1] == slot and r[2] == seq):
                    est = hlg_ratio * sum(r[13] for r in waves
                                          if r[0] == i and r[1] == slot and r[2] == seq)
                else:
                    est = None
                hps.append((i, slot, seq, lvl, hlg_id, round(base_sum, 4), cnt,
                            hlg_ratio, round(est, 2) if est is not None else None))

            if bc:
                bosses.append((i, bc.get("hard_name"), jd(bc.get("buff_list")),
                               jd(bc.get("event_id_list")), jd(bc.get("tag_list")),
                               jd(bc.get("infinite_list"))))

        self.n["season"] = self.exec("INSERT INTO season VALUES (?,?,?,?,?,?,?,?)", seas, "season")
        self.n["stage"] = self.exec("INSERT INTO stage VALUES (?,?,?,?,?,?,?,?,?,?,?)", stgs, "stage")
        self.n["stage_tag"] = self.exec("INSERT INTO stage_tag VALUES (?,?,?,?,?,?,?,?)", tags, "stage_tag")
        self.n["stage_wave"] = self.exec(
            "INSERT INTO stage_wave VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)", waves, "stage_wave")
        self.n["stage_monster"] = self.exec("INSERT INTO stage_monster VALUES (?,?,?,?,?,?,?,?,?,?)", mons, "stage_monster")
        self.n["boss_config"] = self.exec("INSERT INTO boss_config VALUES (?,?,?,?,?,?)", bosses, "boss_config")
        self.n["stage_hp"] = self.exec(
            "INSERT INTO stage_hp VALUES (?,?,?,?,?,?,?,?,?)", hps, "stage_hp")

    # ---- biligame ----
    def build_wiki(self):
        wt = load("wiki_arbitration.json")["wikitext"]
        tpls = parse_templates(wt)
        srows, krows, wrows, trows, qrows, brows = [], [], [], [], [], []

        for kv in tpls:
            period = int(kv.get("期数", "0").lstrip("0") or 0)
            if not period:
                continue
            srows.append((period, kv.get("名称"), kv.get("开始时间"), kv.get("结束时间")))

            for kn, cn in ((1, "骑士一"), (2, "骑士二"), (3, "骑士三")):
                krows.append((period, kn, wiki_text(kv.get(f"{cn}建议属性")),
                              wiki_text(kv.get(f"{cn}污染"))))
                for wave in (1, 2):
                    for kind, key in (("elite", "精英敌方"), ("normal", "普通敌方")):
                        wrows.append((period, kn, wave, kind,
                                      jd(parse_enemies(kv.get(f"{cn}{wave}波{key}")))))
                for t in (1, 2):
                    nm, ds = kv.get(f"{cn}特性{t}名称"), kv.get(f"{cn}特性{t}描述")
                    if nm or ds:
                        trows.append((period, cn, t, wiki_text(nm), wiki_text(ds)))

            for t in range(1, 5):
                nm, ds = kv.get(f"王棋特性{t}名称"), kv.get(f"王棋特性{t}描述")
                if nm or ds:
                    trows.append((period, "王棋", t, wiki_text(nm), wiki_text(ds)))
                nm, ds = kv.get(f"绝境特性{t}名称"), kv.get(f"绝境特性{t}描述")
                if nm or ds:
                    trows.append((period, "绝境", t, wiki_text(nm), wiki_text(ds)))

            for q in (1, 2, 3):
                nm = kv.get(f"裁决象限{q}名称")
                ds = kv.get(f"裁决象限{q}")
                if nm or ds:
                    qrows.append((period, q, wiki_text(nm), wiki_text(ds)))

            brows.append((period, kv.get("王棋首领") and wiki_text(kv["王棋首领"]),
                          wiki_text(kv.get("王棋建议属性")),
                          jd(parse_enemies(kv.get("王棋精英敌人"))),
                          jd(parse_enemies(kv.get("王棋2波敌人")))))

        self.n["bg_season"] = self.exec("INSERT INTO bg_season VALUES (?,?,?,?)", srows, "bg_season")
        self.n["bg_knight"] = self.exec("INSERT INTO bg_knight VALUES (?,?,?,?)", krows, "bg_knight")
        self.n["bg_wave"] = self.exec("INSERT INTO bg_wave VALUES (?,?,?,?,?)", wrows, "bg_wave")
        self.n["bg_tag"] = self.exec("INSERT INTO bg_tag VALUES (?,?,?,?,?)", trows, "bg_tag")
        self.n["bg_quadrant"] = self.exec("INSERT INTO bg_quadrant VALUES (?,?,?,?)", qrows, "bg_quadrant")
        self.n["bg_boss"] = self.exec("INSERT INTO bg_boss VALUES (?,?,?,?,?)", brows, "bg_boss")

    # ---- 对拍 ----
    def cross_check(self):
        cur = self.db.cursor()
        rows, mism = [], 0

        def _elems(v):
            """把「物理、风、雷」拆成集合 —— 属性列是无序的，源站两边
            给的顺序不同，直接比字符串会凭空多出十几条假不一致。"""
            return frozenset(x.strip() for x in (v or "").split("、") if x.strip())

        def add(period, item, a, b, note=""):
            nonlocal mism
            ok = 1 if (a or None) and _elems(a) == _elems(b) else 0
            if not ok:
                mism += 1
            rows.append((period, item, a, b, ok, note or None))

        for period, name, sname, ver in cur.execute(
                "SELECT s.id, s.name_zh, b.name, s.version FROM season s "
                "JOIN bg_season b ON b.period = s.id ORDER BY s.id"):
            add(period, "期数名称", name, sname)

        # ⚠️ 内层查询必须用**另一个** cursor。sqlite3 的 cursor 是游标：
        # 在外层 for 正迭代到一半时拿同一个 cursor 再 execute，外层迭代会
        # 被截断成只剩已取出的那几行。下面三个循环原来就是这么写的，
        # 于是只覆盖了期 1 —— 而 xcheck 里照样写着「一致」，看不出异常。
        inner = self.db.cursor()

        # 前置关属性：nanoka 是 3 个 pre stage，biligame 是 骑士一/二/三
        for period, slot, seq, dt in cur.execute(
                "SELECT season_id, slot, seq, damage_type_zh FROM stage "
                "WHERE slot='pre' ORDER BY season_id, seq"):
            r = inner.execute("SELECT damage_type FROM bg_knight WHERE period=? AND knight=?",
                              (period, seq + 1)).fetchone()
            if r:
                add(period, f"骑士{'一二三'[seq]}建议属性", dt, r[0])

        # 王棋建议属性
        for period, dt in cur.execute("SELECT id, damage_type_zh FROM season s "
                                      "JOIN stage t ON t.season_id=s.id AND t.slot='boss' "
                                      "ORDER BY s.id"):
            r = inner.execute("SELECT damage_type FROM bg_boss WHERE period=?", (period,)).fetchone()
            if r:
                add(period, "王棋建议属性", dt, r[0])

        # 终 Boss 名：nanoka 的 stage.name 是**关卡名**（如「将杀王棋」），
        # 不是 Boss 本体名 —— 拿它去比 biligame 的「王棋首领」是错的（一开始就这么错的）。
        # Boss 本体在怪物表里，靠 rank 认。
        for period, in cur.execute("SELECT DISTINCT season_id FROM stage WHERE slot='boss'"):
            ms = [r[0] for r in inner.execute(
                "SELECT name_zh FROM stage_monster WHERE season_id=? AND slot='boss' "
                "AND rank IN ('Boss','BigBoss','LittleBoss')", (period,)) if r[0]]
            r = inner.execute("SELECT boss_name FROM bg_boss WHERE period=?", (period,)).fetchone()
            if not r:
                continue
            # 有的赛季终关带多个 boss 级怪物，全部列出再比
            add(period, "王棋首领", "、".join(dict.fromkeys(ms)), r[0])

        # 机制（特性）名称集合，逐关比
        for period in [r[0] for r in cur.execute('SELECT id FROM season ORDER BY id')]:
            for seq, cn in ((0, "骑士一"), (1, "骑士二"), (2, "骑士三")):
                a = {r[0] for r in cur.execute(
                    "SELECT name FROM stage_tag WHERE season_id=? AND slot='pre' AND seq=?",
                    (period, seq)) if r[0]}
                b = {r[0] for r in cur.execute(
                    "SELECT name FROM bg_tag WHERE period=? AND subject=?", (period, cn)) if r[0]}
                add(period, f"{cn}特性名", "、".join(sorted(a)), "、".join(sorted(b)),
                    "" if a == b else "集合差：" + str(sorted(a ^ b)))

        self.n["xcheck"] = self.exec("INSERT INTO xcheck VALUES (?,?,?,?,?,?)", rows, "xcheck")
        self.n["_xcheck_mismatch"] = mism

    def finish(self, ver):
        self.db.executemany("INSERT INTO meta VALUES (?,?)", [
            ("version", ver),
            ("source", "nanoka.cc（static.nanoka.cc CDN）+ biligame 星铁 Wiki"),
            ("seasons", str(self.n.get('season', 0))),
            ("note", "stage_hp 为推算原料，公式未经对拍验证，见 README"),
            ("built_at", time.strftime("%Y-%m-%dT%H:%M:%S")),
        ])
        self.db.commit()
        # 不落 -wal / -shm
        self.db.execute("PRAGMA journal_mode = DELETE")
        self.db.commit()


def monster_hp_base(mvalues, mid):
    """HPBase × 该 id 自身那条 child 的 HPModifyRatio。找不到返回 0。"""
    v = lookup(mvalues, mid)
    if not v:
        return 0.0
    ratio = 1.0
    for ch in v.get("child") or []:
        if ch.get("Id") == mid:
            ratio = ch.get("HPModifyRatio") or 1.0
            break
    return float(v.get("HPBase") or 0) * float(ratio)


def dump_json(b):
    out = {"_meta": dict(b.db.execute("SELECT k, v FROM meta"))}
    for t in b.rows:
        cols = [d[1] for d in b.db.execute(f"PRAGMA table_info({t})")]
        out[t] = [dict(zip(cols, r)) for r in b.rows[t]]
    if "xcheck" in out:
        out["_xcheck_summary"] = {
            "total": len(out["xcheck"]),
            "match": sum(1 for r in out["xcheck"] if r["match"]),
            "mismatch": [{"period": r["period"], "item": r["item"],
                          "nanoka": r["nanoka_value"], "biligame": r["biligame_value"],
                          "note": r["note"]}
                         for r in out["xcheck"] if not r["match"]],
        }
    with open(JSON_OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    return out


def main():
    print("=" * 60)
    print("异相仲裁 建库")
    print("=" * 60)
    b = Builder()
    b.build()
    b.build_wiki()
    b.cross_check()
    idx = load("_index.json")
    b.finish(idx.get("live", "unknown"))

    for k in sorted(b.n):
        print(f"  {k:24s} {b.n[k]}")

    out = dump_json(b)
    print("-" * 60)
    print(f"  {os.path.basename(DB):24s} {os.path.getsize(DB)}B")
    print(f"  {os.path.basename(JSON_OUT):24s} {os.path.getsize(JSON_OUT)}B")
    xs = out["_xcheck_summary"]
    print(f"  对拍 {xs['match']}/{xs['total']} 一致，{xs['total'] - xs['match']} 处不一致")
    for m in xs["mismatch"][:15]:
        print(f"    期{m['period']} {m['item']}: nanoka={m['nanoka']} | biligame={m['biligame']}")


if __name__ == "__main__":
    main()
