#!/usr/bin/env python3
"""WARFRAME 공식 위키(wiki.warframe.com)에서 보강 정보를 모은다.

- 획득 방법(Acquisition): 설계도를 구할 곳이 공식 데이터에 없는 아이템, 획득처를 모르는 부품의 상위 아이템
- 추천 파밍 장소(Farming Locations): 자원

결과는 warframe/tools/wiki_extract.json 에 저장되고, build_data.py 가 세 번째 인자로 읽는다.
위키 내용은 CC BY-SA 라이선스이며 화면에 출처 링크를 함께 표시한다.

사용법 (build_data.py 를 한 번 실행해 data/ 가 만들어진 뒤):
    python3 warframe/tools/fetch_wiki.py
"""
import glob
import html
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

API = "https://wiki.warframe.com/api.php"
UA = {"User-Agent": "warframe-helper/1.0 (personal fan tool; contact via GitHub PactLee/My-first-website)"}
HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data")
OUT = os.path.join(HERE, "wiki_extract.json")
DELAY = 0.3  # 위키 서버에 부담을 주지 않도록 요청 간격


def get(params):
    url = API + "?" + urllib.parse.urlencode({**params, "format": "json", "formatversion": 2})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                return json.load(r)
        except Exception:
            time.sleep(2 ** attempt)
    return {}


def cell_text(c):
    c = re.sub(r"<[^>]+>", " ", c)
    return re.sub(r"\s+", " ", html.unescape(c)).strip()


def text_of(src):
    s = re.sub(r"<(script|style)[^>]*>.*?</\1>", "", src, flags=re.S)
    s = re.sub(r'<span class="mw-editsection.*?</span>\s*</span>', "", s, flags=re.S)
    # 표는 한 행을 "칸 | 칸 | 칸" 한 줄로
    s = re.sub(r"<tr[^>]*>(.*?)</tr>",
               lambda m: "\n" + " | ".join(cell_text(c) for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", m.group(1), flags=re.S)) + "\n",
               s, flags=re.S)
    s = re.sub(r"<li[^>]*>", "\n• ", s)
    s = re.sub(r"<(br|/p|/div|/tr|/h\d|/ul)[^>]*>", "\n", s)
    s = re.sub(r"<t[dh][^>]*>", " | ", s)
    s = re.sub(r"<[^>]+>", "", s)
    s = html.unescape(s)
    s = re.sub(r"[ \t\xa0]+", " ", s)
    lines = [ln.strip(" |") for ln in s.split("\n")]
    out = []
    for ln in lines:
        if not ln or ln.lower() in ("acquisition", "farming locations", "market") or re.fullmatch(r"\[?\s*edit\s*(\|\s*edit\s*)?\]?", ln):
            continue
        if ln.startswith("This section is transcluded"):
            continue
        out.append(ln)
    return "\n".join(out)


def sections(page):
    time.sleep(DELAY)
    d = get({"action": "parse", "page": page, "prop": "sections", "redirects": 1})
    return d.get("parse", {}).get("sections"), d.get("parse", {}).get("title")


def section_text(page, index):
    time.sleep(DELAY)
    d = get({"action": "parse", "page": page, "prop": "text", "section": index, "redirects": 1, "disablelimitreport": 1})
    return text_of(d.get("parse", {}).get("text", ""))


def main():
    recs = {}
    for path in glob.glob(os.path.join(DATA, "cat-*.json")):
        with open(path, encoding="utf-8") as f:
            recs.update({int(k): v for k, v in json.load(f).items()})

    # 1) 획득 방법이 필요한 아이템
    need_acq = set()
    for r in recs.values():
        if r.get("nb"):
            need_acq.add(r["e"])

        def walk(b):
            for row in b["l"]:
                if "id" not in row and not (row.get("dr") or row.get("d1") or row.get("src") or row.get("how")):
                    need_acq.add(r["e"])
                if row.get("b"):
                    walk(row["b"])
        if r.get("b") and not r.get("nb"):
            walk(r["b"])
    # 2) 파밍 장소가 필요한 자원
    need_farm = {r["e"] for r in recs.values() if r["c"] == "resources" or r.get("t") in ("Resource", "Gem", "Plant", "Ore")}

    cache = {}
    if os.path.exists(OUT):
        with open(OUT, encoding="utf-8") as f:
            cache = json.load(f)
    pages = sorted(need_acq | need_farm)
    print(f"획득 방법 {len(need_acq)}개, 파밍 장소 {len(need_farm)}개, 총 {len(pages)}쪽", flush=True)
    for i, name in enumerate(pages, 1):
        if name in cache:
            continue
        secs, title = sections(name)
        entry = {"title": title or name}
        if secs:
            for sec in secs:
                line = sec["line"].strip().lower()
                if line == "acquisition" and name in need_acq and "acq" not in entry:
                    entry["acq"] = section_text(name, sec["index"])[:1500]
                if line in ("farming locations", "farming location", "recommended farming locations") and name in need_farm and "farm" not in entry:
                    entry["farm"] = section_text(name, sec["index"])[:1500]
        cache[name] = entry
        if i % 25 == 0:
            print(f"{i}/{len(pages)}", flush=True)
            with open(OUT, "w", encoding="utf-8") as f:
                json.dump(cache, f, ensure_ascii=False, indent=0)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=0)
    got_acq = sum(1 for v in cache.values() if v.get("acq"))
    got_farm = sum(1 for v in cache.values() if v.get("farm"))
    print(f"완료: 획득 방법 {got_acq}개, 파밍 장소 {got_farm}개 → {OUT}")


if __name__ == "__main__":
    sys.exit(main())
