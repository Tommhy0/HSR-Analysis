"""Build/check compact combat facts from cached release JSON. Does not access the network."""
import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPOSITORY = "DimbreathBot/TurnBasedGameData"
REVISION = "312b4597691e0a29cf9828a15b592757dba86949"
FILES = {
    **{f"Avatar_{name}_00_Ability.json": f"Config/ConfigAbility/Avatar/Avatar_{name}_00_Ability.json" for name in ["Sparkle", "Archer", "Cerydra", "DanHengPT"]},
    "Avatar_Advanced_Sparkle_00_Ability.json": "Config/ConfigAbility/Avatar/Advanced/Avatar_Advanced_Sparkle_00_Ability.json",
    "GlobalModifier_Common_Specific.json": "Config/ConfigGlobalModifier/GlobalModifier_Common_Specific.json",
    "GameCoreConstValue.json": "Config/GlobalConfig/GameCoreConstValue.json",
    **{f: "Config/ConfigAbility/Equip/" + f for f in ["EquipmemtAbility.json", "RelicAbility.json", *[f"Equip{n}.json" for n in [30,31,33,34,35,36,37,40,41,43,44]]]},
    **{f: "ExcelOutput/" + f for f in ["AvatarPromotionConfig.json", "AvatarPromotionConfigLD.json", "AvatarBreakDamage.json"]},
    "Monster_AML_Minion02_00_Ability.json": "Config/ConfigAbility/Monster/Monster_AML_Minion02_00_Ability.json",
    "Monster_AML_Minion02_00_Config.json": "Config/ConfigCharacter/Monster/Monster_AML_Minion02_00_Config.json",
    "Monster_AML_Minion02_00_AI.json": "Config/ConfigAI/Monster_AML_Minion02_00_AI.json",
    **{f: "ExcelOutput/" + f for f in ["MonsterSkillConfig.json", "MonsterConfig.json", "MonsterTemplateConfig.json"]},
}
CONES = [23021, 23051, 23046, 23048, 21018, 21004, 21011, 21003, 22005, 23003, 23034, 23038, 20012, 21000, 21021, 21025]
SETS = [*range(101,135), *range(301,329)]


def build(cache):
    def read(name):
        return json.loads((cache / name).read_text(encoding="utf-8"))

    facts = dict(version="4.6", repository=REPOSITORY, revision=REVISION, files={}, hits={}, aggro={})
    for filename, path in FILES.items():
        raw = (cache / filename).read_bytes()
        json.loads(raw)
        facts["files"][filename] = dict(sha256=hashlib.sha256(raw).hexdigest(), url=f"https://github.com/{REPOSITORY}/blob/{REVISION}/{path}")

    def attacks(node, out):
        if isinstance(node, dict):
            if node.get("$type") == "RPG.GameCore.AttackData" and "DamagePercentage" in node and node.get("AttackType") != "Pursued":
                out.append(node.get("HitSplitRatio", {}).get("FixedValue", {}).get("Value", 1))
            for value in node.values():
                attacks(value, out)
        elif isinstance(node, list):
            for value in node:
                attacks(value, out)

    for name in ["Sparkle", "Archer", "Cerydra", "DanHengPT", "Advanced_Sparkle"]:
        for ability in read(f"Avatar_{name}_00_Ability.json")["AbilityList"]:
            values = []
            attacks(ability.get("OnStart", []), values)
            if values:
                facts["hits"][ability["Name"]] = values
    for filename in ["AvatarPromotionConfig.json", "AvatarPromotionConfigLD.json"]:
        for row in read(filename):
            if row.get("AvatarID") in [1306, 1015, 1412, 1414] and row.get("Promotion", 0) == 0:
                facts["aggro"][row["AvatarID"]] = row["BaseAggro"]["Value"]
    facts["breakBase"] = {r["Level"]: r["BreakBaseDamage"]["Value"] for r in read("AvatarBreakDamage.json")}
    facts["enemies"] = {"8012010": dict(template=next(r for r in read("MonsterTemplateConfig.json") if r.get("MonsterTemplateID") == 8012010), skills=[r for r in read("MonsterSkillConfig.json") if r.get("SkillID") in [801201001,801201002,801201003]], ai=read("Monster_AML_Minion02_00_AI.json"))}
    data = json.loads((ROOT / "_data_cache/hsr_core.json").read_text(encoding="utf-8"))
    astral_express = next(g["IDList"] for g in read("GameCoreConstValue.json")["CharacterIDGroups"] if g["Group"] == "AstralExpress")
    facts["astralExpress"] = astral_express
    facts["relics"] = {s["id"]: dict(name=s["name"], p2=s["set2Params"], p4=s["set4Params"], description2=s["set2Desc"], description4=s["set4Desc"], timingSource="database description" if s["id"] in [133,134] else "release ability JSON") for s in data["relicsets"] if s["id"] in SETS}
    if data["_meta"]["version"] != "4.6":
        raise ValueError("Re-audit combat rules before changing the versioned parameter contract")
    tables, metadata = {}, {}
    for cid in [1306, 1414, 1015, 1412]:
        base = {}
        for skill in data["skills"]:
            if skill["charId"] == cid and skill["type"] in ["Normal", "BPSkill", "Ultra", "Talent", "Maze"]:
                base.setdefault(skill["type"], skill["params"])  # Archer's End is a second BPSkill, never overwrite the attack.
        tables[cid] = {"base": base}
        metadata[cid] = {"base": dict(ranks={r["rank"]: r["params"] for r in data["ranks"] if r["charId"] == cid}, traces=[t for t in data["traces"] if t["charId"] == cid and t["type"] == 3])}
        if cid == 1306:
            e = next(c for c in data["characters"] if c["id"] == cid)["enhanced"]["1"]
            tables[cid]["enhanced"] = {s["type"] or "Talent": s["level"] for s in e["skills"].values() if s["type"] in ["Normal", "BPSkill", "Ultra", "Maze", None]}
            metadata[cid]["enhanced"] = dict(ranks={r: v["param_list"] for r, v in e["ranks"].items()}, traces=[dict(id=v["point_id"], promotionLimit=v["avatar_promotion_limit"], params=v["param_list"]) for tree in e["skill_trees"].values() if (v := tree["1"])["point_type"] == 3])
    cones = {l["id"]: dict(path=l["path"], params=l["skillParams"]) for l in data["lightcones"] if l["id"] in CONES}
    sets = {s["id"]: dict(p2=s["set2Params"], p4=s["set4Params"]) for s in data["relicsets"] if s["id"] in SETS}
    compact = lambda value: json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    module = "// Numeric release data; provenance: data/combat/source_evidence.json.\n" + "".join(f"export const {key}={compact(value)};\n" for key, value in [("KIT_TABLES", tables), ("BREAK_BASE", facts["breakBase"]), ("KIT_METADATA", metadata), ("CONE_TABLES", cones), ("SET_TABLES", sets), ("ASTRAL_EXPRESS", astral_express)])
    hit_ids = {101501:"Avatar_Archer_00_Skill01_Phase02",101502:"Avatar_Archer_00_Skill02_Phase02",101503:"Avatar_Archer_00_Skill03_Phase02",101504:"Avatar_Archer_00_Insert_Phase02",130601:"Avatar_Sparkle_00_Skill01_Phase02",141201:"Avatar_Cerydra_00_Skill01_Phase02",141203:"Avatar_Cerydra_00_Skill03_Phase02",141401:"Avatar_DanHengPT_00_Skill01_Phase02",141403:"Avatar_DanHengPT_00_Skill03_Phase02"}
    hit_module = "// Animation hit weights from pinned release scripts; see data/combat/source_evidence.json.\nexport const HIT_SHARES=" + compact({k:facts["hits"][v] for k,v in hit_ids.items()}) + ";\n"
    return {ROOT / "data/combat/source_evidence.json": json.dumps(facts, ensure_ascii=False, indent=2) + "\n", ROOT / "simulator/game-data.mjs": module, ROOT / "core/hit-splits.mjs": hit_module}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache", type=Path, default=ROOT / "_data_cache/strict_research")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    for path, expected in build(args.cache).items():
        if args.check:
            if path.read_text(encoding="utf-8") != expected:
                raise SystemExit(f"Facts have drifted: {path}")
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(expected, encoding="utf-8", newline="\n")
    print("Pinned combat facts verified" if args.check else "Pinned combat facts built")
