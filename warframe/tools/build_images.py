#!/usr/bin/env python3
"""워프레임 도우미 대체 이미지 묶음 생성.

이미지 서버(cdn.warframestat.us)에 접속할 수 없는 환경(예: Artifact 미리보기)에서도
아이콘이 보이도록, 이미지를 함께 배포하던 마지막 npm 패키지(warframe-items 1.26.0, 2018년)의
이미지를 작은 WebP로 줄여 data/img.json 하나에 data URI로 담는다.
2018년 이후에 나온 아이템은 이미지가 없으므로 원래 이미지 서버에서만 보인다.

키는 현재 데이터의 imageName(예: "ComponentCell.png")이라 앱은 이미지 서버 주소가
실패했을 때 같은 이름으로 이 묶음을 찾아본다.

사용법:
    mkdir old && (cd old && npm pack warframe-items@1.26.0 && tar xzf *.tgz)
    python3 warframe/tools/build_images.py old/package/data package/data/json
"""
import base64
import glob
import io
import json
import os
import re
import sys

from PIL import Image

OLD = sys.argv[1] if len(sys.argv) > 1 else "old/package/data"
CUR = sys.argv[2] if len(sys.argv) > 2 else "package/data/json"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "img.json")
SIZE = 64

img_dir = os.path.join(OLD, "img")
files = os.listdir(img_dir)
fileset = set(files)


def norm(x):
    return re.sub(r"[^a-z0-9]", "", x.lower().rsplit(".", 1)[0])


def slug(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower().replace("'", "")).strip("-")


by_norm, by_stem = {}, {}
for f in files:
    by_norm.setdefault(norm(f), f)
    by_stem.setdefault(f.rsplit(".", 1)[0].lower(), f)

# 2018년 데이터의 uniqueName → 이미지 파일
by_unique = {}
for path in glob.glob(os.path.join(OLD, "json", "*.json")):
    if path.endswith("All.json"):
        continue
    with open(path, encoding="utf-8") as f:
        for it in json.load(f):
            if isinstance(it, dict) and it.get("imageName") in fileset and it.get("uniqueName"):
                by_unique[it["uniqueName"]] = it["imageName"]
                for c in it.get("components") or []:
                    if isinstance(c, dict) and c.get("imageName") in fileset and c.get("uniqueName"):
                        by_unique.setdefault(c["uniqueName"], c["imageName"])

# 성유물: 시대별 대표 이미지 하나
relic_era = {}
for f in files:
    m = re.match(r"^(lith|meso|neo|axi|requiem)-.*-intact\.", f)
    if m:
        relic_era.setdefault(m.group(1), f)


def find(it):
    u, img, name = it.get("uniqueName"), it.get("imageName"), it.get("name") or ""
    if u in by_unique:
        return by_unique[u]
    m = re.match(r"^Relic(Lith|Meso|Neo|Axi|Requiem)", img or "")
    if m and m.group(1).lower() in relic_era:
        return relic_era[m.group(1).lower()]
    if img and norm(img) in by_norm:
        return by_norm[norm(img)]
    if name and slug(name) in by_stem:
        return by_stem[slug(name)]
    return None


wanted = {}  # 현재 imageName → 2018 파일
for path in glob.glob(os.path.join(CUR, "*.json")):
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        continue
    for it in data:
        if not isinstance(it, dict) or not it.get("imageName"):
            continue
        if it["imageName"] in wanted:
            continue
        src = find(it)
        if src:
            wanted[it["imageName"]] = src

out = {}
cache = {}
for key, src in sorted(wanted.items()):
    if src not in cache:
        try:
            im = Image.open(os.path.join(img_dir, src)).convert("RGBA")
        except Exception:
            continue
        im.thumbnail((SIZE, SIZE))
        buf = io.BytesIO()
        im.save(buf, "WEBP", quality=70, method=6)
        cache[src] = "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()
    out[key] = cache[src]

with open(OUT, "w", encoding="utf-8") as f:
    json.dump(out, f, separators=(",", ":"))
print(f"이미지 {len(out)}개 (원본 {len(cache)}개) → {os.path.abspath(OUT)} ({os.path.getsize(OUT) / 1e6:.1f}MB)")
