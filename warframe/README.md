# 워프레임 도우미 (한국어)

공개 데이터만 사용하는 개인용 워프레임 도우미입니다. 게임 클라이언트나 다른 프로그램을 분석하지 않습니다.

## 1단계: 프라임 세트 & 렐릭 검색
- 프라임 세트별 부품, 두캇, 해당 부품이 나오는 렐릭
- 렐릭별 보상과 정제 단계(Intact/Exceptional/Flawless/Radiant) 확률
- 한글/영어 검색, 렐릭 칩을 누르면 해당 렐릭으로 이동

`fetch`를 쓰기 때문에 파일을 더블클릭하지 말고 웹 서버로 여세요.
(GitHub Pages, 또는 저장소 폴더에서 `python3 -m http.server` 실행 후 http://localhost:8000/warframe/)

## 데이터 갱신
데이터 출처: [WFCD/warframe-items](https://github.com/WFCD/warframe-items) (MIT)

```bash
npm pack warframe-items && tar -xzf warframe-items-*.tgz
python3 warframe/tools/build_data.py package/data/json
```

부품 이름(설계도, 뉴롭틱 등)은 원본에 한국어가 없어 `build_data.py`에서 직접 번역했습니다.
볼트 여부는 원본 데이터 기준이라 실제 게임과 다를 수 있습니다.
