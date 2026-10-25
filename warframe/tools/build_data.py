#!/usr/bin/env python3
"""워프레임 도우미 데이터 빌드 스크립트.

WFCD warframe-items 패키지(@wfcd/items, npm)의 data/json 폴더를 읽어
웹 도우미가 사용하는 압축 JSON(warframe/data/*.json)을 생성한다.

이름 규칙: 공식 한국어 번역(i18n/ko.json)이 있으면 그것을 사용하고,
없으면 영어 원문 명칭을 그대로 사용한다.

사용법:
    npm pack @wfcd/items && tar xzf wfcd-items-*.tgz
    python3 warframe/tools/build_data.py package/data/json
"""
import json
import os
import re
import sys
from collections import defaultdict

SRC = sys.argv[1] if len(sys.argv) > 1 else "package/data/json"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")

IMG_BASE = "https://cdn.warframestat.us/img/"

# 파일 → (카테고리 키, 한국어 카테고리 라벨)
CATEGORIES = [
    ("Warframes.json", "warframes"),
    ("Primary.json", "primary"),
    ("Secondary.json", "secondary"),
    ("Melee.json", "melee"),
    ("Archwing.json", "archwing"),
    ("Arch-Gun.json", "archwing"),
    ("Arch-Melee.json", "archwing"),
    ("Sentinels.json", "companions"),
    ("Pets.json", "companions"),
    ("SentinelWeapons.json", "companions"),
    ("Mods.json", "mods"),
    ("Arcanes.json", "arcanes"),
    ("Resources.json", "resources"),
    ("Gear.json", "gear"),
    ("Railjack.json", "railjack"),
    ("Fish.json", "fish"),
    ("Quests.json", "quests"),
    ("Misc.json", "misc"),
    ("Enemy.json", "enemies"),
]
CATEGORY_LABELS = {
    "warframes": "워프레임",
    "primary": "주무기",
    "secondary": "보조무기",
    "melee": "근접무기",
    "archwing": "아크윙",
    "companions": "동료",
    "mods": "모드",
    "arcanes": "아케인",
    "relics": "성유물",
    "resources": "자원",
    "gear": "장비",
    "railjack": "레일잭",
    "fish": "낚시",
    "quests": "퀘스트",
    "misc": "기타",
    "enemies": "적",
}
# Misc.json 중 도우미에 의미가 없는 타입은 제외
MISC_SKIP_TYPES = {"Nightwave Challenge", "Captura"}

# 나이트웨이브 등 공식 한국어 문구에서 확인한 미션 타입 번역.
# 확인되지 않은 미션 타입은 규칙대로 영어 원문을 유지한다.
MISSION_KO = {
    "Survival": "생존",
    "Defense": "방어",
    "Capture": "생포",
    "Spy": "첩보활동",
    "Exterminate": "섬멸",
    "Mobile Defense": "이동 방어",
    "Disruption": "교란",
    "Sabotage": "파괴공작",
    "Rescue": "구출",
    "Assassination": "암살",
    "Mirror Defense": "거울상 방어",
    "Void Flood": "보이드 홍수",
    "Void Armageddon": "보이드 대격전",
    "Archon Hunt": "집정관 사냥",
    "Sortie": "출격",
}
PHRASE_KO = [
    ("Isolation Vault", "격리 금고"),
    ("Bounty", "의뢰"),
    ("Steel Path", "강철의 길"),
]

AFFIX_KO = {"Rotation": "로테이션", "Level": "레벨"}


def load(name):
    path = os.path.join(SRC, name)
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8") as f:
        return json.load(f)


ko = load(os.path.join("i18n", "ko.json")) or {}


def clean(name):
    # 일부 공식 번역에는 '<ARCHWING> ' 같은 내부 태그가 붙어 있다
    name = re.sub(r"<[^>]+>", " ", name or "")
    return re.sub(r"\s+", " ", name).strip()


def strip_tags(text):
    # 게임 내부 서식 태그(<DT_ELECTRICITY_COLOR> 등) 제거
    return re.sub(r"<[^>]+>", "", text or "").strip()


ko_by_en = {}  # 같은 영어 이름을 가진 다른 항목의 공식 번역 (StoreItem 중복 등)


def ko_name(item):
    t = ko.get(item.get("uniqueName"), {})
    en = clean(item.get("name"))
    return clean(t.get("name")) or ko_by_en.get(en) or en


def ko_desc(item):
    t = ko.get(item.get("uniqueName"), {})
    d = t.get("description") or item.get("description") or ""
    if isinstance(d, list):
        d = "\n".join(str(x) for x in d)
    return strip_tags(d)


def wiki_url(item):
    u = item.get("wikiaUrl")
    if u:
        return u
    return None


# ---------------------------------------------------------------------------
# 1) 모든 아이템 로드 + uniqueName 인덱스
# ---------------------------------------------------------------------------
fish_by_name = {}       # 물고기 영어 이름 → 대표 uniqueName
fish_sizes = defaultdict(list)
by_unique = {}          # uniqueName → raw item (아무 파일)
category_of = {}        # uniqueName → category key
order = []
for fname, cat in CATEGORIES:
    for it in load(fname):
        u = it.get("uniqueName")
        if not u or u in category_of:
            continue
        if cat == "misc" and it.get("type") in MISC_SKIP_TYPES:
            continue
        # 물고기는 크기(소/중/대)별로 같은 이름의 항목이 3개씩 있어 하나로 합친다
        if cat == "fish":
            first = fish_by_name.get(it.get("name"))
            if first:
                fish_sizes[first].append(u)
                continue
            fish_by_name[it.get("name")] = u
            fish_sizes[u] = [u]
        # Misc.json 안의 자원은 자원 카테고리로
        if cat == "misc" and it.get("type") == "Resource":
            cat2 = "resources"
        else:
            cat2 = cat
        by_unique[u] = it
        category_of[u] = cat2
        order.append(u)

for it in by_unique.values():
    k = ko.get(it["uniqueName"], {}).get("name")
    if k:
        ko_by_en.setdefault(clean(it.get("name")), clean(k))

components = {c["uniqueName"]: c for c in load("Components.json")}
relics_raw = load("Relics.json")
nodes = load("Node.json")

# 영어 이름 → 한국어 이름 (드랍 위치 문자열 번역용)
en2ko = {}
for src in (list(by_unique.values()) + relics_raw):
    n, k = src.get("name"), ko_name(src)
    if n and k and n not in en2ko:
        en2ko[n] = k
planet_ko = {}
for nd in nodes:
    sn = nd.get("systemName")
    k = ko.get(nd.get("uniqueName"), {}).get("systemName")
    if sn and k:
        planet_ko.setdefault(sn, k)
# 지역 이름 (오픈 월드) — 공식 번역이 확인된 것만
planet_ko.setdefault("Cetus", "세투스")


# ---------------------------------------------------------------------------
# 2) 성유물: 정제 단계별 4개 항목을 하나로 합침
# ---------------------------------------------------------------------------
REFINES = ["Intact", "Exceptional", "Flawless", "Radiant"]
relics = {}  # "Axi A21" → dict
for r in relics_raw:
    m = re.match(r"^(Lith|Meso|Neo|Axi|Requiem|Vanguard) (\S+) (Intact|Exceptional|Flawless|Radiant|Relic)$", r["name"])
    if not m:
        continue
    base = f"{m.group(1)} {m.group(2)}"
    rel = relics.setdefault(base, {"raw": r, "drops": {}, "names": set()})
    if m.group(3) == "Intact":
        rel["raw"] = r
    for d in r.get("drops") or []:
        key = d["location"]
        if key not in rel["drops"] or rel["drops"][key]["chance"] < (d.get("chance") or 0):
            rel["drops"][key] = d


def relic_ko(base):
    rel = relics.get(base)
    if rel:
        k = ko.get(rel["raw"]["uniqueName"], {}).get("name")
        if k:
            return k
    return f"{base} Relic"


RELIC_RE = re.compile(r"^((?:Lith|Meso|Neo|Axi|Requiem|Vanguard) \S+) Relic(?: \((Intact|Exceptional|Flawless|Radiant)\))?$")


def tr_mission_part(s):
    """괄호 안 문자열 (예: 'Survival', 'Level 15 - 25 Plague Star') 번역."""
    if s in MISSION_KO:
        return MISSION_KO[s]
    out = s
    for en, k in PHRASE_KO:
        out = out.replace(en, k)
    for en, k in MISSION_KO.items():
        out = re.sub(r"\b" + re.escape(en) + r"\b", k, out)
    out = re.sub(r"\bLevel\b", "레벨", out)
    return out


def tr_location(loc):
    """드랍 위치 문자열을 가능한 범위에서 공식 한국어로 변환."""
    if not loc:
        return loc
    if loc in en2ko:
        return en2ko[loc]
    m = RELIC_RE.match(loc)
    if m:
        name = relic_ko(m.group(1))
        return f"{name} ({m.group(2)})" if m.group(2) else name
    rot = ""
    m = re.match(r"^(.*), Rotation ([A-Z])$", loc)
    if m:
        loc, rot = m.group(1), f", 로테이션 {m.group(2)}"
    stage = ""
    m = re.match(r"^(.*), (Stage .*|Operative|Agent|Hand|Lawful|Neutral|Final Stage.*)$", loc)
    if m and not rot:
        loc, stage = m.group(1), ", " + m.group(2)
    if loc in en2ko:
        return en2ko[loc] + stage + rot
    m = re.match(r"^([^/]+)/([^(]+?)(?: \((.+)\))?$", loc)
    if m:
        planet, node, mission = m.group(1), m.group(2), m.group(3)
        out = f"{planet_ko.get(planet, planet)}/{planet_ko.get(node, en2ko.get(node, node))}"
        if mission:
            out += f" ({tr_mission_part(mission)})"
        return out + stage + rot
    return loc + stage + rot


def pack_drops(drops):
    """[[위치(한국어), 확률(%), 희귀도, 영어 원문 or 0, (성유물이면) {"rc": [정제별 확률], "vt": 볼트 여부}], ...]

    성유물 보상은 정제 단계별 4줄을 한 줄로 합치고(확률은 Intact 기준),
    현재 파밍 가능한 성유물 → 높은 확률 순으로 정렬한다.
    """
    seen = {}
    relic_rows = {}
    for d in drops or []:
        loc = d.get("location")
        if not loc:
            continue
        ch = d.get("chance") or 0
        m = RELIC_RE.match(loc)
        if m:
            base, refine = m.group(1), m.group(2) or "Intact"
            row = relic_rows.get(base)
            if not row:
                vaulted = base not in relics or not relics[base]["drops"]
                row = relic_rows[base] = [relic_ko(base), 0, d.get("rarity") or "", f"{base} Relic", {"rc": [None] * 4, "vt": 1 if vaulted else 0}]
            row[4]["rc"][REFINES.index(refine)] = round(ch, 4)
            if refine == "Intact":
                row[1], row[2] = round(ch, 4), d.get("rarity") or row[2]
            elif not row[1]:
                row[2] = d.get("rarity") or row[2]
            continue
        if loc in seen and seen[loc][1] >= ch:
            continue
        k = tr_location(loc)
        seen[loc] = [k, round(ch, 4), d.get("rarity") or "", loc if k != loc else 0]
    for row in relic_rows.values():
        if not row[1]:
            row[1] = next((c for c in row[4]["rc"] if c), 0)
        if not row[4]["vt"]:
            del row[4]["vt"]
    out = list(seen.values()) + list(relic_rows.values())
    return sorted(out, key=lambda x: (1 if len(x) > 4 and x[4].get("vt") else 0, -x[1]))


# ---------------------------------------------------------------------------
# 3) 성유물 보상 (부품의 드랍 정보로부터 역산)
# ---------------------------------------------------------------------------
relic_rewards = defaultdict(dict)  # base → {item display: {refine: chance, rarity}}


def add_relic_reward(owner_unique, comp_unique, drops):
    for d in drops or []:
        m = RELIC_RE.match(d.get("location") or "")
        if not m:
            continue
        base, refine = m.group(1), m.group(2) or "Intact"
        key = comp_unique or owner_unique
        ent = relic_rewards[base].setdefault(key, {"owner": owner_unique, "comp": comp_unique, "rarity": d.get("rarity"), "c": {}})
        ent["c"][refine] = d.get("chance")
        if refine == "Intact":
            ent["rarity"] = d.get("rarity")


# ---------------------------------------------------------------------------
# 4) 최종 아이템 레코드 생성
# ---------------------------------------------------------------------------
records = []
index_of = {}


def new_id(key):
    index_of[key] = len(records)
    records.append(None)
    return index_of[key]


for u in order:
    new_id(u)
for base in sorted(relics):
    new_id("relic:" + base)

used_in = defaultdict(set)  # 재료 uniqueName → 이 재료를 쓰는 아이템 id 집합


def comp_display(cu, parent):
    """부품 이름: '볼트 프라임 섀시' 처럼 상위 아이템 이름을 붙인다."""
    c = components.get(cu)
    if not c:
        return None
    nk = ko_name(c)
    pk = ko_name(parent)
    if c["name"] == "Blueprint" and nk == c["name"]:
        nk = "설계도"
    if pk in nk:
        return nk
    return f"{pk} {nk}"


aliases = defaultdict(list)  # id → 추가 검색어 (부품 이름 등)

for u in order:
    it = by_unique[u]
    cat = category_of[u]
    rid = index_of[u]
    rec = {
        "id": rid,
        "n": ko_name(it),
        "e": clean(it.get("name")),
        "c": cat,
        "t": it.get("type") or "",
        "d": ko_desc(it),
    }
    if it.get("imageName"):
        rec["img"] = it["imageName"]
    w = wiki_url(it)
    if w:
        rec["w"] = w
    if it.get("masteryReq"):
        rec["mr"] = it["masteryReq"]
    if it.get("vaulted"):
        rec["v"] = 1
    if it.get("tradable"):
        rec["tr"] = 1
    if it.get("isPrime"):
        rec["p"] = 1
    if it.get("rarity"):
        rec["r"] = it["rarity"]
    if cat == "mods":
        if it.get("polarity"):
            rec["pol"] = it["polarity"]
        ls = ko.get(u, {}).get("levelStats") or it.get("levelStats")
        if ls:
            rec["ls"] = [strip_tags(", ".join(s.get("stats", []))) for s in ls][-1:]  # 최대 랭크 효과
    if cat == "arcanes":
        ls = ko.get(u, {}).get("levelStats") or it.get("levelStats")
        if ls:
            rec["ls"] = [strip_tags(" ".join(s.get("stats", []))) for s in ls][-1:]
    if cat == "warframes":
        abil = ko.get(u, {}).get("abilities") or it.get("abilities") or []
        rec["ab"] = [[a.get("abilityName") or a.get("name"), strip_tags(a.get("description"))] for a in abil]
        for k in ("health", "shield", "armor", "power"):
            if k in it:
                rec.setdefault("st", {})[k] = it[k]
    if cat in ("primary", "secondary", "melee", "archwing", "companions") and "totalDamage" in it:
        rec["st"] = {
            k: it[k] for k in ("totalDamage", "criticalChance", "criticalMultiplier", "procChance", "fireRate", "magazineSize", "reloadTime", "disposition")
            if it.get(k) is not None
        }
    # 시장 가격
    if it.get("marketCost"):
        rec["mp"] = it["marketCost"]
    if it.get("bpCost"):
        rec["bp"] = it["bpCost"]

    # 제작 정보
    comps = it.get("components") or []
    if comps:
        b = {
            "cr": it.get("buildPrice") or 0,
            "tm": it.get("buildTime") or 0,
            "q": it.get("buildQuantity") or 1,
            "l": [],
        }
        for c in comps:
            cu, cnt = c.get("uniqueName"), c.get("itemCount", 1)
            row = {"q": cnt}
            if cu in index_of:
                row["id"] = index_of[cu]
                used_in[cu].add(rid)
            elif cu in components:
                comp = components[cu]
                row["n"] = comp_display(cu, it)
                row["e"] = f"{it.get('name')} {comp['name']}"
                if comp.get("imageName"):
                    row["img"] = comp["imageName"]
                dr = pack_drops(comp.get("drops"))
                if dr:
                    row["dr"] = dr
                if comp.get("primeSellingPrice"):
                    row["du"] = comp["primeSellingPrice"]  # 두캇
                if comp.get("tradable"):
                    row["tr"] = 1
                aliases[rid].append(row["n"])
                aliases[rid].append(row["e"])
                add_relic_reward(u, cu, comp.get("drops"))
            else:
                row["n"] = row["e"] = cu.rsplit("/", 1)[-1]
            b["l"].append(row)
        rec["b"] = b

    # 획득처
    if cat == "enemies":
        # Enemy.json 의 drops 는 "이 적이 떨어뜨리는 아이템" 목록
        rec["ed"] = [[en2ko.get(d.get("location"), d.get("location")), round(d.get("chance") or 0, 4), d.get("rarity") or "", d.get("type") or ""]
                     for d in sorted(it.get("drops") or [], key=lambda d: -(d.get("chance") or 0))]
    else:
        drops = it.get("drops")
        if cat == "fish":
            drops = [d for d in drops or [] if d.get("type") == it.get("name")]
        dr = pack_drops(drops)
        if dr:
            rec["dr"] = dr
        add_relic_reward(u, None, it.get("drops"))
    records[rid] = rec

# ---------------------------------------------------------------------------
# 4-1) 채광·낚시·채집 정보 — 게임 내 공식 한국어 설명(아이템·미끼·작살·도구)에서 추출
# ---------------------------------------------------------------------------
FISH_REGION = {
    "Eidolon": "아이돌론의 평원 (지구)",
    "Solaris": "오브 협곡 (금성)",
    "Deimos": "캠비온 퇴적지 (데이모스)",
    "Duviri": planet_ko.get("Duviri", "Duviri"),
}
FISH_TIME = {
    ("Eidolon", "Day"): "낮",
    ("Eidolon", "Night"): "밤",
    ("Eidolon", "Both"): "낮과 밤",
    ("Solaris", "Warm"): "따뜻한 날씨",
    ("Solaris", "Cool"): "서늘한 날씨",
    ("Solaris", "Both"): "따뜻한 날씨와 서늘한 날씨",
}
LOC_HINTS = ("획득 가능 장소", "획득할 수 있습니다", "찾을 수 있습니다", "발견됩니다", "설계도를 구매", "분해하여", "채굴할 수", "채집할 수")
MINING_TOOLS = ["Nosam Cutter", "Focused Nosam Cutter", "Advanced Nosam Cutter", "Sunpoint Plasma Drill"]


def sentences(text):
    out = []
    for line in (text or "").split("\n"):
        for sent in re.split(r"(?<=[.!?])\s+", line.strip()):
            if sent:
                out.append(sent.strip())
    return out


def loc_sentences(text):
    res = []
    for sent in sentences(text):
        if any(h in sent for h in LOC_HINTS):
            res.append(re.sub(r"^획득 가능 장소\s*:\s*", "", sent))
    return res


def id_by_en(name, cat=None):
    for u in order:
        it = by_unique[u]
        if clean(it.get("name")) == name and (cat is None or category_of[u] == cat):
            return index_of[u]
    return None


gear_recs = [records[index_of[u]] for u in order if category_of[u] == "gear"]
spears = [r for r in gear_recs if r["e"].endswith("Spear")]
baits = [r for r in gear_recs if r["e"].endswith("Bait")]
lures = [r for r in gear_recs if r["e"].endswith("Echo-Lure")]
mining_tool_ids = [i for i in (id_by_en(n, "gear") for n in MINING_TOOLS) if i is not None]
fish_recs = [records[index_of[u]] for u in order if category_of[u] == "fish"]


def mentions(text, name):
    # 다른 단어 중간에 걸리지 않도록 이름 앞이 한글이 아닌 경우만 인정 (뒤에는 조사가 붙을 수 있음)
    return re.search(r"(?<![가-힣])" + re.escape(name), text or "") is not None


for u in order:
    rec = records[index_of[u]]
    it = by_unique[u]
    t, cat, desc = rec.get("t"), rec["c"], rec.get("d", "")
    ga = {}
    if cat == "fish":
        m = re.match(r"^/Lotus/Types/Items/Fish/([^/]+)/(?:Corpus|Orokin|Solaris|Infested|Hybrid)?(Day|Night|Both|Warm|Cool)?(Common|Uncommon|Rare|Legendary)?", u)
        region = m.group(1) if m else ""
        ga["m"] = "낚시"
        if region in FISH_REGION:
            ga["reg"] = FISH_REGION[region]
        if m and (region, m.group(2)) in FISH_TIME:
            ga["time"] = FISH_TIME[(region, m.group(2))]
        if m and m.group(3):
            ga["rar"] = m.group(3)
        if len(fish_sizes.get(u, [])) > 1:
            ga["sz"] = len(fish_sizes[u])
        sp = [r["id"] for r in spears if mentions(r["d"], rec["n"])]
        if not sp and region in FISH_REGION:
            key = FISH_REGION[region].split(" (")[0]
            sp = [r["id"] for r in spears if key in r["d"]]
        if sp:
            ga["tools"] = sp
        bt = []
        for r in baits:
            if mentions(r["d"], rec["n"]):
                hint = next((x for x in sentences(r["d"]) if mentions(x, rec["n"])), "")
                bt.append([r["id"], hint])
        if bt:
            ga["bait"] = bt
    elif t == "Fish Part":
        ga["m"] = "물고기 분해"
        src = [f["id"] for f in fish_recs if mentions(desc, f["n"])]
        if src:
            ga["fish"] = src
    elif t == "Conservation Tag":
        ga["m"] = "동물 보호"
        animal = re.sub(r"\s*(태그|Tag)$", "", rec["n"])
        lr = [r["id"] for r in lures if animal and r["n"].startswith(animal.split()[0])]
        if lr:
            ga["tools"] = lr
    elif rec.get("b") and "설계도를 구매" in desc:
        ga["m"] = "정제"
    elif t == "Gem" or re.search(r"광맥|채광|채굴|병변", desc):
        ga["m"] = "채광"
        ga["tools"] = mining_tool_ids
    elif t == "Plant" or re.search(r"채집", desc):
        ga["m"] = "채집"
    elif cat == "resources" and any(re.search(r"아이돌론의 평원|오브 협곡|캠비온 퇴적지", x) for x in loc_sentences(desc)):
        ga["m"] = "오픈월드 수집"
    if not ga:
        continue
    locs = loc_sentences(desc)
    if locs:
        ga["loc"] = locs
    rec["ga"] = ga
    aliases[rec["id"]].append(ga["m"])

# 물고기 → 분해해서 나오는 부위
for u in order:
    rec = records[index_of[u]]
    for fid in rec.get("ga", {}).get("fish", []):
        records[fid]["ga"].setdefault("parts", []).append(rec["id"])

# 사용처
for cu, ids in used_in.items():
    rid = index_of[cu]
    records[rid]["u"] = sorted(ids, key=lambda i: records[i]["n"])

# 성유물 레코드
for base in sorted(relics):
    rel = relics[base]
    rid = index_of["relic:" + base]
    rec = {
        "id": rid,
        "n": relic_ko(base),
        "e": f"{base} Relic",
        "c": "relics",
        "t": base.split()[0],
        "d": ko_desc(rel["raw"]),
        "img": rel["raw"].get("imageName"),
        "w": "https://wiki.warframe.com/w/" + base.replace(" ", "_"),
    }
    dr = pack_drops(list(rel["drops"].values()))
    if dr:
        rec["dr"] = dr
    else:
        rec["v"] = 1  # 드랍처 없음 = 볼트됨
    rw = []
    rar_order = {"Common": 0, "Uncommon": 1, "Rare": 2}
    for key, ent in relic_rewards.get(base, {}).items():
        owner = by_unique[ent["owner"]]
        if ent["comp"]:
            name = comp_display(ent["comp"], owner)
        else:
            name = ko_name(owner)
        rw.append({
            "n": name,
            "id": index_of[ent["owner"]],
            "r": ent["rarity"] or "",
            "c": [ent["c"].get(x) for x in REFINES],
        })
    rw.sort(key=lambda x: (rar_order.get(x["r"], 3), x["n"]))
    if rw:
        rec["rw"] = rw
    records[rid] = rec
    aliases[rid].append(base)

# ---------------------------------------------------------------------------
# 5) 출력: 검색 인덱스(가벼움) + 카테고리별 상세 파일
# ---------------------------------------------------------------------------
os.makedirs(OUT, exist_ok=True)
index = []
by_cat = defaultdict(dict)
for rec in records:
    entry = [rec["id"], rec["n"], rec["e"], rec["c"], rec.get("t", ""), rec.get("img", "")]
    flags = (1 if rec.get("v") else 0) | (2 if rec.get("p") else 0)
    entry.append(flags)
    al = sorted(set(a for a in aliases.get(rec["id"], []) if a and a not in (rec["n"], rec["e"])))
    entry.append(al)
    index.append(entry)
    by_cat[rec["c"]][rec["id"]] = rec


def dump(name, obj):
    with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))


pkg_version = None
pkg_json = os.path.join(SRC, "..", "..", "package.json")
if os.path.exists(pkg_json):
    with open(pkg_json, encoding="utf-8") as f:
        pkg_version = json.load(f).get("version")

dump("index.json", {
    "version": pkg_version,
    "img": IMG_BASE,
    "cats": CATEGORY_LABELS,
    "items": index,
})
for cat, recs in by_cat.items():
    dump(f"cat-{cat}.json", recs)

print(f"아이템 {len(records)}개, 카테고리 {len(by_cat)}개 → {os.path.abspath(OUT)}")
