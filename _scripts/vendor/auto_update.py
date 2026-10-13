# -*- coding: utf-8 -*-
"""
HSR 数据自动更新程序（增量模式，每周运行一次）
=================================================
1) 版本发现：从 nanoka.cc 首页提取站点当前引用版本 + 探测候选版本目录
   - 正式服 = 最高存在的 X.Y 版本目录（如 4.5）
   - 测试服 = 最高存在的 X.Y.ZZ 版本目录（如 4.5.55）
2) 增量更新（核心设计）：
   - 以 _data_cache 中已有的本地数据为基线，**绝不重新全量下载**
   - 每个文件用 HTTP 条件请求（If-Modified-Since / If-None-Match）：
     服务器返回 304 → 文件未变，直接跳过；
     返回 200 → 文件有变化，写入暂存区（.staging）；
     本地没有的文件（新增角色/光锥/赛季）→ 直接下载进暂存区；
     返回 404 → 记录"远端已移除"，本地文件保留不删。
   - 首次运行没有清单时，用本地文件的修改时间做 If-Modified-Since
     （本地文件下载于数天前，若远端未改必返回 304），同样无需全量下载。
   - 每版本维护 .manifest.json（文件 → 服务器 Last-Modified/ETag/大小），
     后续运行全部走条件请求。
   - 测试服：先下载进暂存区 → 暂存区与正式目录对比生成改动摘要 →
     再把暂存文件原子落盘；
     正式服：下载进暂存区后直接落盘。
3) 对比上一次测试服数据，生成改动摘要，追加写入根目录《更新日志.md》。
4) 仅当本地完全没有某版本数据（如首次见到 4.5）时，才对该版本做一次全量下载。

用法：python auto_update.py [--force] [--no-diff] [--force-full] [--live-only]
  --force       忽略"距上次运行不足 1 天"的检查
  --no-diff     跳过测试服差异对比（仍增量更新数据）
  --force-full  放弃增量，两版本全部重新下载（数据疑似异常时用）
  --live-only   只更新正式服：不下载、不落盘、不对比测试服，
                也不写《更新日志.md》与 update_state.json（只动 _data_cache/{正式版本}/）
依赖：仅 Python 3.8+ 标准库
"""

import email.utils
import json
import os
import re
import shutil
import sys
import time
import urllib.request
import urllib.error
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime

# Windows 下强制 UTF-8
os.environ["PYTHONIOENCODING"] = "utf-8"
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

BASE = "https://static.nanoka.cc/hsr"
SITE_HOME = "https://hsr.nanoka.cc/"
LOCALE = "zh"
OUT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # 项目根目录
CACHE = os.path.join(OUT_DIR, "_data_cache")
STATE_FILE = os.path.join(CACHE, "update_state.json")
LOG_FILE = os.path.join(OUT_DIR, "更新日志.md")
TECH_LOG = os.path.join(CACHE, "update_tech.log")
MANIFEST_NAME = ".manifest.json"

# 核心文件（版本根目录）。
# maze_peak.json（异相仲裁的赛季名表）曾按约定剔除，2026-09-17 恢复：
# 该约定已作废，异相仲裁单独建库需要它。
CORE_FILES = [
    "character.json", "lightcone.json", "monster.json", "relicset.json",
    "monstervalue.json", "EliteGroup.json", "HardLevelGroup.json",
    "InfiniteEliteGroup.json", "maze.json", "maze_boss.json", "maze_extra.json",
    "maze_peak.json",
]
# 异相仲裁：和深渊三路不一样，赛季清单不在根目录，而在 {LOCALE}/peak/version.json，
# 各期详情在 {LOCALE}/peak/{期数}.json，所以单独处理，不塞进 ABYSS_MODES。
PEAK_SUBDIR = "peak"
# 深渊三路：模式 -> (列表文件, 详情子目录)   moc=混沌 maze   pf=虚构 story   as=末日 boss
ABYSS_MODES = {
    "moc": ("maze.json", "maze"),
    "pf": ("maze_extra.json", "story"),
    "as": ("maze_boss.json", "boss"),
}
MODE_NAMES = {"moc": "混沌回忆", "pf": "虚构叙事", "as": "末日幻影"}

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) HSR-AutoUpdate/2.0"}
WORKERS = 10
RETRIES = 3
TIMEOUT = 120
MIN_INTERVAL = 24 * 3600  # 两次运行最小间隔（秒）

_lock = threading.Lock()
_stats = {"unchanged": 0, "updated": 0, "new": 0, "missing": 0, "failed": 0,
          "errors": []}


def log(msg, console=True):
    line = f"[{datetime.now():%Y-%m-%d %H:%M:%S}] {msg}"
    with _lock:
        try:
            os.makedirs(CACHE, exist_ok=True)
            with open(TECH_LOG, "a", encoding="utf-8") as f:
                f.write(line + "\n")
        except OSError:
            pass
    if console:
        try:
            print(line)
        except Exception:
            pass


def get_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def atomic_write(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".part"
    with open(tmp, "wb") as f:
        f.write(data)
    os.replace(tmp, path)


def local_mtime_httpdate(path):
    try:
        return email.utils.formatdate(os.path.getmtime(path), usegmt=True)
    except OSError:
        return None


# ---------------- 路径工具 ----------------
def ver_dir(version):
    return os.path.join(CACHE, version)


def staging_dir(version):
    return os.path.join(CACHE, f"{version}.staging")


def ver_file(version, rel):
    return os.path.join(ver_dir(version), rel)


def staged_file(version, rel):
    return os.path.join(staging_dir(version), rel)


def load_manifest(version):
    p = os.path.join(ver_dir(version), MANIFEST_NAME)
    if os.path.exists(p):
        try:
            with open(p, encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def save_manifest(version, manifest):
    try:
        atomic_write(os.path.join(ver_dir(version), MANIFEST_NAME),
                     json.dumps(manifest, ensure_ascii=False, indent=1).encode("utf-8"))
    except Exception as e:
        log(f"[{version}] 清单保存失败: {e}")


def fetch_info_for(version, rel, manifest):
    """决定某文件的请求方式。返回 (info, is_new)"""
    if rel in manifest and manifest[rel]:
        return manifest[rel], False
    local = ver_file(version, rel)
    if os.path.exists(local) and os.path.getsize(local) > 0:
        return {"mtime": local_mtime_httpdate(local), "etag": None,
                "size": os.path.getsize(local)}, False
    return None, True  # 本地没有 → 全新文件


# ---------------- HTTP ----------------
def fetch_one(url, out_path, info=None, is_new=False):
    """下载单个文件（条件请求）。
    返回 (status, new_info)：status ∈ unchanged/updated/new/missing/failed
    out_path 为 None 时不写盘（纯校验）"""
    headers = dict(HEADERS)
    if info is not None:
        if info.get("etag"):
            headers["If-None-Match"] = info["etag"]
        elif info.get("mtime"):
            headers["If-Modified-Since"] = info["mtime"]
    for i in range(RETRIES):
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                data = r.read()
            parsed = json.loads(data)
            if not isinstance(parsed, (dict, list)):
                raise ValueError('Expected a JSON object/list; refused cache replacement')
            new_info = {"etag": r.headers.get("ETag"),
                        "mtime": r.headers.get("Last-Modified"),
                        "size": len(data)}
            if out_path:
                atomic_write(out_path, data)
            return ("new" if is_new else "updated"), new_info
        except urllib.error.HTTPError as e:
            if e.code == 304:
                new_info = dict(info or {})
                new_info["etag"] = e.headers.get("ETag") or new_info.get("etag")
                new_info["mtime"] = e.headers.get("Last-Modified") or new_info.get("mtime")
                return "unchanged", new_info
            if e.code == 404:
                return "missing", None
            err = e
        except Exception as e:
            err = e
        with _lock:
            _stats["errors"].append(f"retry{i + 1} {url}: {err}")
        time.sleep(1.5 * (i + 1))
    return "failed", info


def http_probe_exists(url):
    try:
        req = urllib.request.Request(url, headers=HEADERS, method="HEAD")
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status == 200
    except urllib.error.HTTPError as e:
        return e.code != 404
    except Exception:
        pass
    try:
        req = urllib.request.Request(url, headers={**HEADERS, "Range": "bytes=0-0"})
        with urllib.request.urlopen(req, timeout=30) as r:
            r.read(1)
            return True
    except urllib.error.HTTPError as e:
        return e.code != 404
    except Exception:
        return False


def fetch_many(tasks):
    """tasks: list of (rel, url, out_path, info, is_new)。
    返回 {rel: (status, new_info)}"""
    results = {}
    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        futs = {}
        for rel, url, out_path, info, is_new in tasks:
            fut = ex.submit(fetch_one, url, out_path, info, is_new)
            futs[fut] = rel
        for fut in as_completed(futs):
            rel = futs[fut]
            try:
                status, new_info = fut.result()
            except Exception as e:
                status, new_info = "failed", None
                with _lock:
                    _stats["errors"].append(f"thread {rel}: {e}")
            with _lock:
                _stats[status] = _stats.get(status, 0) + 1
            results[rel] = (status, new_info)
    return results


# ---------------- 深渊怪物收集 ----------------
def collect_monster_ids_from_season(season):
    ids = set()

    def add(mid):
        s = str(mid)
        if s.isdigit():
            ids.add(s[:7])

    def walk_events(ev_list):
        if not isinstance(ev_list, list):
            return
        for ev in ev_list:
            if not isinstance(ev, dict):
                continue
            for ml in ev.get("monster_list") or []:
                if isinstance(ml, dict):
                    for v in ml.values():
                        if isinstance(v, int):
                            add(v)

    def walk_level(lv):
        if isinstance(lv, list):
            for x in lv:
                walk_level(x)
        elif isinstance(lv, dict):
            for key in ("event_id_list", "event_id_list1", "event_id_list2",
                        "boss_event_id_list"):
                walk_events(lv.get(key))
            for il in ("infinite_list", "infinite_list1", "infinite_list2"):
                v = lv.get(il)
                if isinstance(v, dict):
                    for wave in v.values():
                        if isinstance(wave, dict):
                            for mid in wave.get("monster_group_id_list") or []:
                                add(mid)
            for key in ("boss_monster_id1", "boss_monster_id2"):
                v = lv.get(key)
                if isinstance(v, int):
                    add(v)
            for key in ("npc_monster_id_list1", "npc_monster_id_list2"):
                for mid in lv.get(key) or []:
                    add(mid)
            for key in ("pre_level", "boss_level", "boss_config", "level"):
                walk_level(lv.get(key))

    walk_level(season)
    return ids


def effective_path(version, rel):
    """暂存区优先，其次正式目录"""
    sp = staged_file(version, rel)
    if os.path.exists(sp):
        return sp
    return ver_file(version, rel)


def try_load_json(version, rel):
    for p in (staged_file(version, rel), ver_file(version, rel)):
        if os.path.exists(p):
            try:
                return get_json(p)
            except Exception:
                continue
    return None


def peak_season_ids(root):
    """异相仲裁的期数列表。version.json 的结构是 {版本: [期数,...]}（值恒为数组），
    所以要把所有值摊平去重，不能当成 {期数: 版本} 直接用。"""
    try:
        d = get_json(os.path.join(root, LOCALE, PEAK_SUBDIR, "version.json"))
    except Exception:
        return []
    if not isinstance(d, dict):
        return []
    return sorted({str(i) for ids in d.values() if isinstance(ids, list) for i in ids},
                  key=lambda s: int(s) if s.isdigit() else 0)


# ---------------- 版本发现 ----------------
def discover_versions():
    candidates = set()
    try:
        req = urllib.request.Request(SITE_HOME, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=30) as r:
            html = r.read(4096 * 256).decode("utf-8", errors="ignore")
        for m in re.finditer(r"static\.nanoka\.cc/hsr/([\d.]+)/", html):
            candidates.add(m.group(1))
        log(f"版本发现: 首页引用 {sorted(candidates)}")
    except Exception as e:
        log(f"版本发现: 首页解析失败 {e}")

    extra = set()
    for c in list(candidates):
        parts = c.split(".")
        if len(parts) >= 2:
            maj, mn = int(parts[0]), int(parts[1])
            extra.add(f"{maj}.{mn}")
            extra.add(f"{maj}.{mn + 1}")
            if mn > 0:
                extra.add(f"{maj}.{mn - 1}")
    candidates |= extra
    candidates |= {"4.4", "4.5", "4.6", "5.0"}

    existing = []
    for c in sorted(candidates, key=lambda s: [int(x) for x in s.split(".")]):
        if http_probe_exists(f"{BASE}/{c}/character.json"):
            existing.append(c)
            log(f"版本发现: {c} 存在")
    if not existing:
        raise RuntimeError("未发现任何可用数据版本，请检查网络")

    def parts(v):
        return [int(x) for x in v.split(".")]

    live = max([v for v in existing if len(parts(v)) == 2], key=parts, default=None)
    beta = max([v for v in existing if len(parts(v)) >= 3], key=parts, default=None)
    if not live:
        raise RuntimeError('未发现正式服版本，不能用测试服冒充正式服')
    log(f"版本发现: 正式服={live}  测试服={beta}")
    return live, beta, existing


# ---------------- 全量下载（仅新版本首次收录） ----------------
def download_version_full(version):
    failed_before = _stats['failed']
    tmp = os.path.join(CACHE, f"{version}.tmp")
    if os.path.exists(tmp):
        shutil.rmtree(tmp, ignore_errors=True)
    os.makedirs(tmp, exist_ok=True)
    vurl = f"{BASE}/{version}"

    def run(tasks):
        with ThreadPoolExecutor(max_workers=WORKERS) as ex:
            futs = {ex.submit(fetch_one, u, p, i, n): p for u, p, i, n in tasks}
            for fut in as_completed(futs):
                try:
                    status, _ = fut.result()
                except Exception:
                    status = "failed"
                with _lock:
                    _stats[status] = _stats.get(status, 0) + 1

    run([(f"{vurl}/{f}", os.path.join(tmp, f), None, True) for f in CORE_FILES])
    char_meta = get_json(os.path.join(tmp, "character.json"))
    run([(f"{vurl}/{LOCALE}/character/{cid}.json",
          os.path.join(tmp, LOCALE, "character", f"{cid}.json"), None, True)
         for cid in char_meta.keys()])
    lc_meta = get_json(os.path.join(tmp, "lightcone.json"))
    run([(f"{vurl}/{LOCALE}/lightcone/{lid}.json",
          os.path.join(tmp, LOCALE, "lightcone", f"{lid}.json"), None, True)
         for lid in lc_meta.keys()])
    for mode, (list_file, subdir) in ABYSS_MODES.items():
        try:
            season_list = get_json(os.path.join(tmp, list_file))
        except Exception as e:
            log(f"[{version}] 跳过 {list_file}: {e}")
            continue
        run([(f"{vurl}/{LOCALE}/{subdir}/{sid}.json",
              os.path.join(tmp, LOCALE, subdir, f"{sid}.json"), None, True)
             for sid in season_list.keys()])

    # 异相仲裁：先取赛季清单，再按期数取详情
    run([(f"{vurl}/{LOCALE}/{PEAK_SUBDIR}/version.json",
          os.path.join(tmp, LOCALE, PEAK_SUBDIR, "version.json"), None, True)])
    peak_ids = peak_season_ids(tmp)
    if peak_ids:
        run([(f"{vurl}/{LOCALE}/{PEAK_SUBDIR}/{sid}.json",
              os.path.join(tmp, LOCALE, PEAK_SUBDIR, f"{sid}.json"), None, True)
             for sid in peak_ids])

    monster_ids = set()
    for mode, (list_file, subdir) in ABYSS_MODES.items():
        try:
            season_list = get_json(os.path.join(tmp, list_file))
        except Exception:
            continue
        for sid in season_list.keys():
            sp = os.path.join(tmp, LOCALE, subdir, f"{sid}.json")
            if os.path.exists(sp):
                try:
                    monster_ids |= collect_monster_ids_from_season(get_json(sp))
                except Exception:
                    pass
    run([(f"{vurl}/{LOCALE}/monster/{mid}.json",
          os.path.join(tmp, LOCALE, "monster", f"{mid}.json"), None, True)
         for mid in sorted(monster_ids)])

    # A partial new snapshot must never replace the previous version.
    if _stats['failed'] > failed_before:
        raise RuntimeError(f'[{version}] 下载失败，保留原版本，暂存文件留待检查')
    # 原子替换
    dst = ver_dir(version)
    bak = os.path.join(CACHE, f"{version}.bak_old")
    if os.path.exists(bak):
        shutil.rmtree(bak, ignore_errors=True)
    if os.path.exists(dst):
        os.replace(dst, bak)
    os.replace(tmp, dst)
    shutil.rmtree(bak, ignore_errors=True)
    # 初始清单（本地 mtime 做验证器；服务器确认未变时 304 即可跳过）
    manifest = {}
    for root, _, files in os.walk(dst):
        for fn in files:
            if fn == MANIFEST_NAME or fn.endswith(".part"):
                continue
            fp = os.path.join(root, fn)
            rel = os.path.relpath(fp, dst).replace("\\", "/")
            manifest[rel] = {"mtime": local_mtime_httpdate(fp), "etag": None,
                             "size": os.path.getsize(fp)}
    save_manifest(version, manifest)
    log(f"[{version}] 全量下载完成（新版本首次收录），已生成初始清单")


# ---------------- 增量更新（分三步：下载 → diff → 落盘） ----------------
def download_incremental(version):
    """把有变化的文件下载到暂存区。返回 (changed_rels, manifest_updates, removed_rels)"""
    log(f"[{version}] 增量下载开始（基线: 本地已有数据）")
    manifest = load_manifest(version)
    staging = staging_dir(version)
    if os.path.exists(staging):
        shutil.rmtree(staging, ignore_errors=True)
    os.makedirs(staging, exist_ok=True)

    def add_task(rel, tasks):
        info, is_new = fetch_info_for(version, rel, manifest)
        if not is_new and info is None:
            return False
        url = f"{BASE}/{version}/{rel}"
        out = staged_file(version, rel) if (is_new or info) else None
        tasks.append((rel, url, out, info, is_new))
        return True

    # 阶段一：核心清单（外加异相仲裁的赛季清单 —— 阶段二要靠它枚举各期）
    tasks = []
    for rel in CORE_FILES:
        add_task(rel, tasks)
    add_task(f"{LOCALE}/{PEAK_SUBDIR}/version.json", tasks)
    results = fetch_many(tasks)
    manifest_updates = {}
    removed_rels = set()
    for rel, (status, info) in results.items():
        if status in ("updated", "new", "unchanged") and info:
            manifest_updates[rel] = info
        if status == "missing":
            removed_rels.add(rel)
            log(f"[{version}] 远端已移除: {rel}")
        if status == "failed":
            log(f"[{version}] 下载失败: {rel}")

    # 阶段二：详情文件（角色/光锥/赛季/怪物）
    char_meta = try_load_json(version, "character.json")
    lc_meta = try_load_json(version, "lightcone.json")
    tasks = []
    if char_meta:
        for cid in char_meta.keys():
            add_task(f"{LOCALE}/character/{cid}.json", tasks)
    if lc_meta:
        for lid in lc_meta.keys():
            add_task(f"{LOCALE}/lightcone/{lid}.json", tasks)

    season_maps = {}
    for mode, (list_file, subdir) in ABYSS_MODES.items():
        sl = try_load_json(version, list_file)
        season_maps[mode] = (sl or {}, subdir)
        for sid in (sl or {}).keys():
            add_task(f"{LOCALE}/{subdir}/{sid}.json", tasks)

    peak_ver = try_load_json(version, f"{LOCALE}/{PEAK_SUBDIR}/version.json")
    peak_ids = sorted({str(i) for ids in (peak_ver or {}).values()
                       if isinstance(ids, list) for i in ids}) if peak_ver else []
    for sid in peak_ids:
        add_task(f"{LOCALE}/{PEAK_SUBDIR}/{sid}.json", tasks)

    monster_ids = set()
    for mode, (sl, subdir) in season_maps.items():
        for sid in sl.keys():
            sp = effective_path(version, f"{LOCALE}/{subdir}/{sid}.json")
            if os.path.exists(sp):
                try:
                    monster_ids |= collect_monster_ids_from_season(get_json(sp))
                except Exception:
                    pass
    for mid in sorted(monster_ids):
        add_task(f"{LOCALE}/monster/{mid}.json", tasks)

    results2 = fetch_many(tasks)
    for rel, (status, info) in results2.items():
        if status in ("updated", "new", "unchanged") and info:
            manifest_updates[rel] = info
        if status == "missing":
            removed_rels.add(rel)
            log(f"[{version}] 远端已移除: {rel}")

    # 暂存区里实际存在的文件 = 变化文件集合
    changed_rels = set()
    for root, _, files in os.walk(staging):
        for fn in files:
            if fn.endswith(".part"):
                continue
            fp = os.path.join(root, fn)
            rel = os.path.relpath(fp, staging).replace("\\", "/")
            changed_rels.add(rel)

    log(f"[{version}] 增量下载完成: 变化 {len(changed_rels)} 个文件；"
        f"统计 未变={_stats.get('unchanged', 0)} 更新={_stats.get('updated', 0)} "
        f"新增={_stats.get('new', 0)} 移除={len(removed_rels)}")
    return changed_rels, manifest_updates, removed_rels


def apply_staging(version, changed_rels, manifest_updates, removed_rels):
    """暂存区原子落盘 + 更新清单。removed 的 rel 从清单删除但保留本地文件"""
    staging = staging_dir(version)
    for rel in sorted(changed_rels):
        sp = staged_file(version, rel)
        if not os.path.exists(sp):
            continue
        dst = ver_file(version, rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        os.replace(sp, dst)
    shutil.rmtree(staging, ignore_errors=True)

    manifest = load_manifest(version)
    for rel, info in manifest_updates.items():
        manifest[rel] = info
    for rel in removed_rels:
        manifest.pop(rel, None)
    save_manifest(version, manifest)
    log(f"[{version}] 落盘完成（{len(changed_rels)} 个文件）")


# ---------------- 差异对比（暂存区 vs 正式目录） ----------------
def _read_old_new(version, rel):
    old_p = ver_file(version, rel)
    new_p = staged_file(version, rel)
    old = get_json(old_p) if os.path.exists(old_p) else None
    new = get_json(new_p) if os.path.exists(new_p) else old
    return old, new


def _entry_diff_lines(old, new, kind, name_key="zh"):
    lines = []
    added = [k for k in new if k not in old]
    removed = [k for k in old if k not in new]
    for k in added:
        c = new[k]
        extra = ""
        if kind == "角色":
            r5 = "5★" if "5" in str(c.get("rank", "")) else "4★"
            extra = f" ({r5} · {c.get('baseType')} · {c.get('damageType')})"
        elif kind == "光锥":
            r5 = "5★" if "5" in str(c.get("rank", "")) else "4★"
            extra = f" ({r5} · {c.get('baseType')} · atk {c.get('atk')})"
        lines.append(f"- 新增{kind}: {c.get(name_key, k)}{extra}")
    for k in removed:
        lines.append(f"- 移除{kind}: {old[k].get(name_key, k)}")
    if not added and not removed:
        lines.append(f"- {kind}无变化")
    return lines


def diff_versions(version, changed_rels):
    """落盘前：正式目录(old) vs 暂存区(new)。返回人类可读行"""
    lines = []
    staged = set(changed_rels)

    o, n = _read_old_new(version, "character.json")
    if o is None:
        lines.append("- （角色对比失败：基线文件缺失）")
    else:
        lines += _entry_diff_lines(o, n, "角色")
        if "character.json" in staged:
            ch = [k for k in n if k in o and json.dumps(o[k], ensure_ascii=False, sort_keys=True)
                  != json.dumps(n[k], ensure_ascii=False, sort_keys=True)]
            if ch:
                lines.append(f"- 角色字段改动: {ch}")

    o, n = _read_old_new(version, "lightcone.json")
    if o is None:
        lines.append("- （光锥对比失败：基线文件缺失）")
    else:
        lines += _entry_diff_lines(o, n, "光锥")
        if "lightcone.json" in staged:
            ch = [k for k in n if k in o and json.dumps(o[k], ensure_ascii=False, sort_keys=True)
                  != json.dumps(n[k], ensure_ascii=False, sort_keys=True)]
            if ch:
                lines.append(f"- 光锥字段改动: {ch}")

    for mode, (list_file, subdir) in ABYSS_MODES.items():
        name = MODE_NAMES[mode]
        o, n = _read_old_new(version, list_file)
        if o is None:
            lines.append(f"- {name}无变化")
            continue
        added = [k for k in n if k not in o]
        removed = [k for k in o if k not in n]
        for sid in added:
            nm = n[sid].get("zh", sid) if isinstance(n[sid], dict) else sid
            lines.append(f"- {name}新增赛季: {sid} {nm}")
        for sid in removed:
            nm = o[sid].get("zh", sid) if isinstance(o[sid], dict) else sid
            lines.append(f"- {name}移除赛季: {sid} {nm}")
        detail_changed = []
        for sid in set(o) & set(n):
            rel = f"{LOCALE}/{subdir}/{sid}.json"
            if rel not in staged:
                continue
            op, np_ = ver_file(version, rel), staged_file(version, rel)
            if not (os.path.exists(op) and os.path.exists(np_)):
                continue
            try:
                oo, nn = get_json(op), get_json(np_)
            except Exception:
                continue
            o_levels = len(oo.get("level", [])) if isinstance(oo, dict) else len(oo)
            n_levels = len(nn.get("level", [])) if isinstance(nn, dict) else len(nn)
            nm = n[sid].get("zh", sid) if isinstance(n[sid], dict) else sid
            if o_levels != n_levels:
                detail_changed.append(f"{sid} {nm}(关卡数 {o_levels}→{n_levels})")
            elif json.dumps(oo, ensure_ascii=False, sort_keys=True) != \
                    json.dumps(nn, ensure_ascii=False, sort_keys=True):
                detail_changed.append(f"{sid} {nm}(内容调整)")
        if detail_changed:
            lines.append(f"- {name}赛季详情改动: {', '.join(detail_changed[:12])}")
        if not added and not removed and not detail_changed:
            lines.append(f"- {name}无变化")

    # 异相仲裁：赛季清单是 {版本: [期数]}，摊平后比期数；期名去 maze_peak.json 查
    peak_names = {"old": _read_old_new(version, "maze_peak.json")[0] or {},
                  "new": _read_old_new(version, "maze_peak.json")[1] or {}}
    o, n = _read_old_new(version, f"{LOCALE}/{PEAK_SUBDIR}/version.json")
    if o is not None and n is not None:
        flat = lambda d: {str(i) for ids in d.values() if isinstance(ids, list) for i in ids}
        po, pn = flat(o), flat(n)
        for sid in sorted(pn - po):
            lines.append(f"- 异相仲裁新增期数: {sid} "
                         f"{peak_names['new'].get(sid, {}).get('zh', '')}".rstrip())
        for sid in sorted(po - pn):
            lines.append(f"- 异相仲裁移除期数: {sid} "
                         f"{peak_names['old'].get(sid, {}).get('zh', '')}".rstrip())
        changed = [f"{sid} {peak_names['new'].get(sid, {}).get('zh', '')}".rstrip()
                   for sid in sorted(po & pn)
                   if f"{LOCALE}/{PEAK_SUBDIR}/{sid}.json" in staged]
        if changed:
            lines.append(f"- 异相仲裁期数内容改动: {', '.join(changed[:12])}")
        if not (pn - po) and not (po - pn) and not changed:
            lines.append("- 异相仲裁无变化")

    o, n = _read_old_new(version, "monster.json")
    if o is None:
        lines.append("- （怪物对比失败：基线文件缺失）")
    else:
        added = set(n) - set(o)
        removed = set(o) - set(n)
        if added:
            names = [n[k].get("zh", k) for k in sorted(added)[:15]]
            lines.append(f"- 新增怪物模板 {len(added)} 个: {', '.join(names)}")
        if removed:
            lines.append(f"- 移除怪物模板 {len(removed)} 个")
        if not added and not removed:
            lines.append("- 怪物模板无变化")
    return lines


# ---------------- 更新日志 ----------------
def append_changelog(run_time, live_old, live_new, beta_old, beta_new, diff_lines):
    header = f"## {run_time:%Y-%m-%d %H:%M}（自动更新）"
    parts = [header, ""]
    if live_old != live_new:
        parts.append(f"- **正式服版本切换: {live_old} → {live_new}**")
    else:
        parts.append(f"- 正式服: {live_new}")
    if beta_old != beta_new:
        parts.append(f"- **测试服版本切换: {beta_old} → {beta_new}**")
    else:
        parts.append(f"- 测试服: {beta_new}")
    parts.append("")
    parts.append("### 测试服改动")
    parts.append("")
    parts.extend(diff_lines if diff_lines else ["- （无差异或首次收录）"])
    parts.append("")
    text = "\n".join(parts) + "\n"

    if os.path.exists(LOG_FILE):
        with open(LOG_FILE, encoding="utf-8") as f:
            old_content = f.read()
    else:
        old_content = "# HSR 数据更新日志\n\n> 由 auto_update.py 每周自动维护；记录正式服/测试服数据更新与测试服改动摘要。\n\n"
    with open(LOG_FILE, "w", encoding="utf-8") as f:
        f.write(old_content + text)
    log(f"更新日志已写入: {LOG_FILE}")


# ---------------- 主流程 ----------------
def load_state():
    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE, encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def save_state(state):
    try:
        os.makedirs(CACHE, exist_ok=True)
        with open(STATE_FILE, "w", encoding="utf-8") as f:
            json.dump(state, f, ensure_ascii=False, indent=2)
    except Exception as e:
        log(f"保存状态失败: {e}")


def _update_one(version, do_diff):
    """对单版本执行增量更新（下载 → [diff] → 落盘）。
    do_diff 为 True 时返回 diff_lines，否则返回 None"""
    if os.path.exists(os.path.join(ver_dir(version), "character.json")):
        changed_rels, manifest_updates, removed_rels = download_incremental(version)
        diff_lines = None
        if do_diff and changed_rels:
            try:
                diff_lines = diff_versions(version, changed_rels)
                log(f"[{version}] 改动摘要生成完成（{len(diff_lines)} 行）")
            except Exception as e:
                log(f"[{version}] diff 失败: {e}")
                diff_lines = None
        apply_staging(version, changed_rels, manifest_updates, removed_rels)
        return diff_lines
    else:
        log(f"[{version}] 本地无基线数据，全量下载（新版本首次收录）")
        download_version_full(version)
        return None


def _rebuild_formal_database(version):
    """Build and validate a new SQLite file, then atomically activate it."""
    import importlib.util
    import sqlite3
    builder_path = os.path.join(OUT_DIR, '_scripts', 'build_db.py')
    if not os.path.isfile(builder_path):
        raise RuntimeError('数据库构建器不存在: ' + builder_path)
    spec = importlib.util.spec_from_file_location('hsr_database_builder', builder_path)
    builder = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(builder)
    builder.CACHE = CACHE
    staging = os.path.join(OUT_DIR, f'HSR_{version}.{time.time_ns()}.staging.db')
    builder.Builder(version, staging).build()
    conn = sqlite3.connect(staging)
    try:
        if conn.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise RuntimeError('新数据库完整性检查失败，旧数据库保留')
        expected = len(get_json(ver_file(version, 'character.json')))
        actual = conn.execute('SELECT COUNT(*) FROM characters').fetchone()[0]
        if actual != expected:
            raise RuntimeError(f'角色记录不完整: {actual}/{expected}，旧数据库保留')
    finally:
        conn.close()
    target = os.path.join(OUT_DIR, f'HSR_现有_{version}.db')
    if os.path.isfile(target):
        shutil.copy2(target, target + '.backup.' + str(time.time_ns()))
    os.replace(staging, target)
    log('数据库重建并验证完成: ' + target)


def main():
    force = "--force" in sys.argv
    do_diff = "--no-diff" not in sys.argv
    force_full = "--force-full" in sys.argv
    live_only = "--live-only" in sys.argv
    log("=" * 60)
    log("HSR 数据自动更新程序启动（增量模式）" + ("[仅正式服]" if live_only else ""))

    state = load_state()
    last_run = state.get("last_run", 0)
    now = time.time()
    if not force and (now - last_run) < MIN_INTERVAL:
        log(f"距上次运行不足 {MIN_INTERVAL // 3600} 小时，跳过（--force 可强制运行）")
        return

    live, beta, _ = discover_versions()
    live_old = state.get("live") or live
    beta_old = state.get("beta") or beta

    diff_lines = None
    if live_only:
        # 只碰 _data_cache/{正式版本}/：不下载/不落盘/不对比测试服，
        # 也不写《更新日志.md》与 update_state.json
        log(f"--live-only：只更新正式服 {live}")
        download_version_full(live) if force_full else _update_one(live, False)
    elif force_full:
        log("--force-full：强制全量下载两个版本")
        if beta:
            download_version_full(beta)
        download_version_full(live)
    else:
        # 先更新测试服（落盘前做 diff），再更新正式服
        diff_lines = _update_one(beta, do_diff and beta_old == beta) if beta else None
        _update_one(live, False)

    if _stats['failed']:
        raise RuntimeError('存在下载失败项，不写入成功状态，也不重建数据库')
    _rebuild_formal_database(live)
    if not live_only:
        state["live"], state["beta"], state["last_run"] = live, beta, now
        save_state(state)
        append_changelog(datetime.now(), live_old, live, beta_old, beta, diff_lines)

    log(f"全部完成: 正式服 {live}" + ("" if live_only else f" / 测试服 {beta}"))
    log(f"HTTP 统计: {_stats}")
    log("=" * 60)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        log(f"!!! 运行失败: {e}")
        raise
