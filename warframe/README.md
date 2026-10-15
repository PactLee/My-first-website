# 워프레임 도우미 (한국어)

공개 데이터만 사용하는 개인용 워프레임 도우미입니다. 게임 클라이언트나 다른 프로그램을 분석하지 않습니다.

## 1단계: 프라임 세트 & 렐릭 검색
- 프라임 세트별 부품, 두캇, 해당 부품이 나오는 렐릭
- 렐릭별 보상과 정제 단계(Intact/Exceptional/Flawless/Radiant) 확률
- 한글/영어 검색, 렐릭 칩을 누르면 해당 렐릭으로 이동

## 2단계: 플래티넘 시세 (warframe.market)
- 카드의 **시세** 버튼을 누르면 부품/세트의 최저 판매가(접속 중 판매자)를 불러옵니다. 마우스를 올리면 최고 구매가.
- 검색 결과가 2개 이하면 자동으로 불러옵니다. 결과는 브라우저에 10분간 저장됩니다.
- 렐릭 카드는 정제 단계별 **기대값**(Σ 확률 × 최저 판매가)을 보여줍니다. 포르마 등 프라임 부품이 아닌 보상은 제외.

## 실행
`fetch`를 쓰기 때문에 파일을 더블클릭하지 말고 웹 서버로 여세요. 권장 방법:

```bash
python3 warframe/tools/server.py
# -> http://localhost:8000/warframe/
```

`server.py`는 페이지를 열어주면서 `/wfm/*` 요청을 warframe.market API로 대신 전달합니다.
GitHub Pages 등 다른 곳에서 열면 warframe.market을 직접 호출하는데, 브라우저 보안 정책(CORS) 때문에 막히면 시세가 ⚠로 표시됩니다.

## 데이터 갱신
데이터 출처: [WFCD/warframe-items](https://github.com/WFCD/warframe-items) (MIT)

```bash
npm pack warframe-items && tar -xzf warframe-items-*.tgz
python3 warframe/tools/build_data.py package/data/json
```

부품 이름(설계도, 뉴롭틱 등)은 원본에 한국어가 없어 `build_data.py`에서 직접 번역했습니다.
볼트 여부는 원본 데이터 기준이라 실제 게임과 다를 수 있습니다.
