"""warframe-items 패키지에서 프라임 아이템/렐릭 한국어 데이터를 뽑아 data/primes.json 으로 저장한다.

사용법:
    npm pack warframe-items && tar -xzf warframe-items-*.tgz
    python3 build_data.py package/data/json
"""
import json
import os
import re
import sys

# 데이터에 부품 이름 한국어 번역이 없어서 직접 매핑한다.
PART_KO = {
    "Blueprint": "설계도", "Systems": "시스템", "Chassis": "섀시", "Neuroptics": "뉴롭틱",
    "Barrel": "총열", "Receiver": "리시버", "Stock": "개머리판", "Blade": "칼날",
    "Blades": "칼날", "Handle": "손잡이", "Link": "링크", "Carapace": "갑각",
    "Cerebrum": "대뇌", "String": "시위", "Gauntlet": "건틀릿", "Lower Limb": "하단 림",
    "Upper Limb": "상단 림", "Hilt": "자루", "Grip": "그립", "Pouch": "파우치",
    "Ornament": "장식", "Guard": "가드", "Head": "헤드", "Stars": "표창", "Disc": "원반",
    "Boot": "부츠", "Chain": "사슬", "Harness": "하네스", "Wings": "날개",
}
CATEGORY_KO = {
    "Warframes": "워프레임", "Primary": "주무기", "Secondary": "보조무기", "Melee": "근접무기",
    "Sentinels": "센티넬", "Pets": "동반자", "Archwing": "아크윙", "Arch-Gun": "아크건",
    "Arch-Melee": "아크 근접", "SentinelWeapons": "센티넬 무기",
}
REFINES = ["Intact", "Exceptional", "Flawless", "Radiant"]


def rarity(intact_chance):
    # 원본 데이터의 rarity 값이 부정확해서 Intact 확률(25.33/11/2)로 다시 계산한다.
    return "Common" if intact_chance >= 20 else "Uncommon" if intact_chance >= 10 else "Rare"
DROP_RE = re.compile(r"^(Lith|Meso|Neo|Axi|Requiem) (\S+) Relic(?: \((Exceptional|Flawless|Radiant)\))?$")


def set_slug(name):
    # warframe.market 세트 주소 규칙: "Cobra & Crane Prime" -> cobra_and_crane_prime_set
    name = re.sub(r"[^a-z0-9 ]", "", name.lower().replace("&", "and"))
    return "_".join(name.split()) + "_set"


def main(src):
    load = lambda f: json.load(open(os.path.join(src, f), encoding="utf-8"))
    i18n = load("i18n.json")
    ko = lambda u: ((i18n.get(u) or {}).get("ko") or {}).get("name")

    relics = {}
    market = {}
    for r in load("Relics.json"):
        m = re.match(r"^(\S+ \S+) Intact$", r["name"])
        if not m:
            continue
        relics[m.group(1)] = {
            "name": m.group(1), "ko": ko(r.get("uniqueName", "")) or m.group(1),
            "rewards": [],
        }
        for rw in r["rewards"]:
            wm = rw["item"].get("warframeMarket")
            if wm:
                market[rw["item"]["name"]] = wm["urlName"]

    sets = []
    for f in CATEGORY_KO:
        for it in load(f + ".json"):
            comps = [c for c in it.get("components") or [] if c.get("ducats")]
            if not it.get("isPrime") or not comps:
                continue
            parts = []
            for c in comps:
                part = {
                    "name": c["name"], "ko": PART_KO.get(c["name"], c["name"]),
                    "count": c.get("itemCount", 1), "ducats": c["ducats"], "market": None, "relics": [],
                }
                chances = {}
                for d in c.get("drops") or []:
                    m = DROP_RE.match(d["location"])
                    if not m:
                        continue
                    base = f"{m.group(1)} {m.group(2)}"
                    if part["market"] is None and d["type"] in market:
                        part["market"] = market[d["type"]]
                    e = chances.setdefault(base, {"chance": [0, 0, 0, 0]})
                    e["chance"][REFINES.index(m.group(3) or "Intact")] = round(d["chance"] * 100, 2)
                for base, e in sorted(chances.items()):
                    e["rarity"] = rarity(e["chance"][0])
                    part["relics"].append({"relic": base, "rarity": e["rarity"]})
                    if base in relics:
                        relics[base]["rewards"].append({
                            "set": it["name"], "part": c["name"], "rarity": e["rarity"], "chance": e["chance"],
                        })
                parts.append(part)
            sets.append({
                "name": it["name"], "ko": ko(it["uniqueName"]) or it["name"],
                "market": set_slug(it["name"]),
                "category": CATEGORY_KO[f], "vaulted": bool(it.get("vaulted")),
                "image": it.get("imageName"), "parts": parts,
            })

    for r in relics.values():
        r["rewards"].sort(key=lambda x: -x["chance"][0])
    out = {
        "sets": sorted(sets, key=lambda s: s["ko"]),
        "relics": sorted((r for r in relics.values() if r["rewards"]), key=lambda r: r["name"]),
    }
    dst = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "primes.json")
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    with open(dst, "w", encoding="utf-8") as fp:
        json.dump(out, fp, ensure_ascii=False, separators=(",", ":"))
    print(f"세트 {len(out['sets'])}개, 렐릭 {len(out['relics'])}개 -> {dst}")


if __name__ == "__main__":
    main(sys.argv[1])
