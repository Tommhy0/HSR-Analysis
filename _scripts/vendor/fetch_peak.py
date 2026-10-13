#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""抓「异相仲裁」数据，落到 raw/。

两条线都抓：
  nanoka   结构化 JSON，每期含 3 个前置关 + 终 Boss 的怪物配置与机制
  biligame 「仲裁一览」页的 {{异相仲裁单期}} 模板，含起止时间、逐波敌方、绝境、裁决象限

两边字段有重叠也有互补，build_peak.py 负责对拍。

用法：python fetch_peak.py [--force]
  --force  忽略本地缓存，全部重新抓

依赖：仅 Python 3.8+ 标准库（网络走 curl，Windows 自带）。
"""

import json
import os
import subprocess
import sys
import time

CDN = "https://static.nanoka.cc/hsr"
MANIFEST = "https://static.nanoka.cc/manifest.json"
WIKI = "https://wiki.biligame.com/sr/api.php"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(os.path.dirname(HERE), "raw")

# nanoka 上语言无关的文件（版本根目录）—— 注意不在 zh/ 下
CDN_ROOT = ["maze_peak.json", "monster.json", "monstervalue.json",
            "EliteGroup.json", "HardLevelGroup.json", "InfiniteEliteGroup.json"]
# 语言相关（版本/语言目录下）
CDN_LOCALE = ["peak/version.json"]

# biligame：仲裁一览（9 期模板）、异相仲裁（机制总览）
WIKI_PAGES = {"wiki_arbitration": 24085, "wiki_peak": 23872}

STATS = {"get": 0, "cached": 0}


def curl(args, timeout=90):
    r = subprocess.run(["curl", "-s", "-m", str(timeout), "-A", UA,
                        "-H", "Referer: https://wiki.biligame.com/sr/"] + args,
                       capture_output=True)
    return r.stdout.decode("utf-8", "replace")


def get_json(url):
    STATS["get"] += 1
    out = curl([url])
    try:
        return json.loads(out)
    except Exception as e:
        raise SystemExit(f"{url} 返回的不是 JSON（{e}）：{out[:300]}")


def parse_page(pageid):
    """一次请求同时取回渲染 HTML 和 wikitext（分两次纯属浪费）。"""
    out = curl(["--get",
                "--data-urlencode", "action=parse",
                "--data-urlencode", f"pageid={pageid}",
                "--data-urlencode", "prop=text|wikitext",
                "--data-urlencode", "format=json", WIKI])
    STATS["get"] += 1
    d = json.loads(out)
    if "error" in d:
        raise SystemExit(f"页面 {pageid} 解析失败：{d['error']}")
    p = d["parse"]
    return {"title": p["title"], "wikitext": p["wikitext"]["*"]}


def cached(name, fn, force):
    path = os.path.join(RAW, name)
    if os.path.exists(path) and not force:
        STATS["cached"] += 1
        print(f"  [缓存] {name}")
        return json.load(open(path, encoding="utf-8"))
    data = fn()
    os.makedirs(RAW, exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    os.replace(tmp, path)
    print(f"  [抓取] {name}  ({os.path.getsize(path)}B)")
    time.sleep(0.4)          # 对站点客气一点
    return data


def season_versions(ver_map):
    """peak/version.json 是 {版本: [期数]}，反过来就是期数 -> 版本。
    版本为 "unknown" 的（站点还没归档）记 None。"""
    out = {}
    for v, ids in ver_map.items():
        for i in ids:
            out[int(i)] = None if v == "unknown" else v
    return out


def main():
    force = "--force" in sys.argv
    print("=" * 60)
    print("异相仲裁 数据抓取")
    print("=" * 60)

    ver = get_json(MANIFEST)["hsr"]["live"]
    index_path = os.path.join(RAW, '_index.json')
    if os.path.isfile(index_path):
        with open(index_path, encoding='utf-8') as file:
            old_version = json.load(file).get('live')
        if old_version != ver:
            force = True
            print('正式服版本变化，不能复用旧版本 CDN 缓存')
    print(f"nanoka 正式服版本: {ver}    （manifest.hsr.live，不是 latest）")
    time.sleep(0.4)

    index = {"live": ver, "nanoka": {}, "biligame": {}}

    # ---- nanoka 语言无关文件 ----
    print("[nanoka] 版本根目录")
    for f in CDN_ROOT:
        d = cached(f"cdn_{f}", lambda f=f: get_json(f"{CDN}/{ver}/{f}"), force)
        index["nanoka"][f] = len(d)

    # ---- nanoka 语言相关 ----
    print("[nanoka] zh/")
    ver_map = None
    for f in CDN_LOCALE:
        d = cached("cdn_" + f.replace("/", "_"),
                   lambda f=f: get_json(f"{CDN}/{ver}/zh/{f}"), force)
        index["nanoka"][f] = len(d)
        if f == "peak/version.json":
            ver_map = d

    # ---- nanoka 每期 ----
    print("[nanoka] peak/<期数>")
    season_ver = season_versions(ver_map)
    index["nanoka"]["peak_version.json"] = ver_map
    ids = sorted(int(i) for ids in ver_map.values() for i in ids)
    for i in ids:
        d = cached(f"cdn_peak_{i}.json",
                   lambda i=i: get_json(f"{CDN}/{ver}/zh/peak/{i}.json"), force)
        index["nanoka"][f"peak/{i}.json"] = {"id": d.get("id"), "name": d.get("name"),
                                             "version": season_ver.get(i),
                                             "pre_level": len(d.get("pre_level") or [])}

    # ---- biligame ----
    print("[biligame] 页面")
    for key, pid in WIKI_PAGES.items():
        d = cached(f"{key}.json", lambda pid=pid: parse_page(pid), force)
        index["biligame"][key] = {"pageid": pid, "title": d["title"],
                                  "wikitext": len(d["wikitext"])}

    with open(os.path.join(RAW, "_index.json"), "w", encoding="utf-8") as f:
        json.dump({"source": {"nanoka": CDN, "biligame": WIKI},
                   "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
                   "seasons": season_ver, **index},
                  f, ensure_ascii=False, indent=1)

    print("-" * 60)
    print(f"HTTP 请求={STATS['get']} 命中缓存={STATS['cached']}   期数={ids}")
    print("完成")


if __name__ == "__main__":
    main()
