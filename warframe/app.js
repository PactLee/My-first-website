'use strict';

// 워프레임 도우미 — data/index.json(검색용) + data/cat-*.json(상세, 필요할 때 로드)
const DATA = 'data/';
const CAT_ORDER = ['warframes', 'primary', 'secondary', 'melee', 'archwing', 'companions', 'mods', 'arcanes',
  'relics', 'resources', 'gear', 'railjack', 'fish', 'quests', 'misc', 'enemies'];
// 제작 계획에서 하위 레시피까지 펼쳐 계산하는 카테고리 (예: 아크브론코 프라임 → 브론코 프라임)
const EXPAND_CATS = new Set(['warframes', 'primary', 'secondary', 'melee', 'archwing', 'companions']);
const REFINES = ['Intact', 'Exceptional', 'Flawless', 'Radiant'];

const state = {
  index: null,      // {img, cats, items: [[id, n, e, cat, type, img, flags, aliases]]}
  byId: new Map(),  // id → index row
  relicIds: new Map(),  // 'Axi V8 Relic' → id
  nameIdx: new Map(),   // 정규화한 이름 → id
  aliasIdx: new Map(),  // 부품 이름 등 → 상위 아이템 id
  craftable: new Set(), // 제작 계획에서 직접 제작/파밍을 고를 수 있는 자원
  cats: {},         // cat → Promise<{id: record}>
  cat: 'all',
  q: '',
  selected: null,
};

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Number(n).toLocaleString('ko-KR');
const HANGUL = /^[가-힣ㄱ-ㅎ]/;
// 가나다(ㄱ~ㅎ) 순. 한글 이름을 먼저, 공식 번역이 없는 영어 이름은 그 뒤에 A~Z 순으로
function nameCompare(a, b) {
  const ka = HANGUL.test(a), kb = HANGUL.test(b);
  if (ka !== kb) return ka ? -1 : 1;
  return a.localeCompare(b, 'ko');
}
const norm = (s) => String(s || '').toLowerCase().replace(/[\s\-'’.]/g, '');

function store(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 저장 불가 환경 */ }
}

function duration(sec) {
  if (!sec) return '즉시';
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
  return [d && `${d}일`, h && `${h}시간`, m && `${m}분`].filter(Boolean).join(' ') || `${sec}초`;
}
function pct(c) {
  if (c == null) return '-';
  return (c >= 1 ? c.toFixed(2).replace(/\.?0+$/, '') : c.toPrecision(2)) + '%';
}
function img(name, cls = '') {
  if (!name) return `<span class="thumb ${cls}"></span>`;
  return `<img class="${cls}" loading="lazy" src="${esc(state.index.img + encodeURIComponent(name))}" data-img="${esc(name)}" alt="" onerror="imgFail(this)">`;
}

// 이미지 서버에 접속할 수 없으면(예: 미리보기 환경) data/img.json 의 대체 이미지를 쓴다
let imgPack = null;
function imgFail(el) {
  if (el.dataset.fb) { el.style.visibility = 'hidden'; return; }
  el.dataset.fb = '1';
  if (!imgPack) imgPack = fetch(DATA + 'img.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  imgPack.then((pack) => {
    const src = pack[el.dataset.img];
    if (src) el.src = src; else el.style.visibility = 'hidden';
  });
}
window.imgFail = imgFail;

function fandom(en) {
  return 'https://warframe.fandom.com/wiki/' + encodeURIComponent(String(en).replace(/ /g, '_'));
}
function itemLink(id, label) {
  const row = state.byId.get(id);
  return `<a href="#/item/${id}">${esc(label ?? (row ? row[1] : id))}</a>`;
}

// 이름(한국어·영어·부품 이름)으로 아이템을 찾는다. 같은 이름이 여러 개면 적이 아닌 쪽을 먼저.
function findId(...names) {
  for (const n of names) {
    if (!n) continue;
    const k = norm(n);
    const id = state.nameIdx.get(k) ?? state.aliasIdx.get(k);
    if (id != null) return id;
  }
  return null;
}
const placeOf = (text) => String(text).replace(/, 로테이션 [A-Z]$/, '');
function locLink(label) {
  return `<a href="#/loc/${encodeURIComponent(placeOf(label))}" title="이 장소에서 나오는 것 모두 보기">${esc(label)}</a>`;
}
// 어떤 이름이든 누를 수 있게: 아이템이면 상세로, 아니면 그 이름으로 검색
function nameLink(label, en, id) {
  const found = id ?? findId(label, en);
  if (found != null) return itemLink(found, label);
  return `<a href="#/search/${encodeURIComponent(label)}" title="이 이름으로 검색">${esc(label)}</a>`;
}

// ---------------------------------------------------------------- 데이터 로드
async function loadIndex() {
  const res = await fetch(DATA + 'index.json');
  if (!res.ok) throw new Error('index.json ' + res.status);
  state.index = await res.json();
  const rank = (row) => (row[3] === 'enemies' ? 1 : 0);
  const put = (map, key, row) => {
    const k = norm(key);
    if (!k) return;
    const prev = map.get(k);
    if (prev == null || rank(state.byId.get(prev)) > rank(row)) map.set(k, row[0]);
  };
  for (const row of state.index.items) {
    state.byId.set(row[0], row);
    if (row[3] === 'relics') state.relicIds.set(row[2], row[0]);
  }
  for (const row of state.index.items) {
    put(state.nameIdx, row[1], row);
    put(state.nameIdx, row[2], row);
    for (const a of row[7]) put(state.aliasIdx, a, row);
  }
  const ix = state.index;
  $('#data-version').textContent = [ix.version && `WFCD v${ix.version}`, ix.pep && `Public Export v${ix.pep}`, ix.built && `기준일 ${ix.built}`].filter(Boolean).join(' · ');
}
function loadCat(cat) {
  if (!state.cats[cat]) {
    state.cats[cat] = fetch(`${DATA}cat-${cat}.json`).then((r) => {
      if (!r.ok) throw new Error(cat + ' ' + r.status);
      return r.json();
    });
  }
  return state.cats[cat];
}
async function getRecord(id) {
  const row = state.byId.get(id);
  if (!row) return null;
  const recs = await loadCat(row[3]);
  return recs[id];
}

// ---------------------------------------------------------------- 검색
function renderCats() {
  const counts = {};
  for (const r of state.index.items) if (!(r[6] & 8)) counts[r[3]] = (counts[r[3]] || 0) + 1;
  const btn = (key, label) => `<button data-cat="${key}" class="${state.cat === key ? 'on' : ''}">${esc(label)}</button>`;
  $('#cats').innerHTML = btn('all', `전체 ${fmt(state.index.items.filter((r) => !(r[6] & 8)).length)}`) +
    CAT_ORDER.filter((c) => counts[c]).map((c) => btn(c, `${state.index.cats[c]} ${fmt(counts[c])}`)).join('');
}

function search() {
  const q = norm(state.q);
  const onlyPrime = $('#f-prime').checked, noVault = $('#f-avail').checked;
  const out = [];
  for (const row of state.index.items) {
    if (row[6] & 8) continue; // 게임 내부용 항목
    if (state.cat !== 'all' && row[3] !== state.cat) continue;
    if (onlyPrime && !(row[6] & 2)) continue;
    if (noVault && (row[6] & 1)) continue;
    let score = 0;
    if (q) {
      const n = norm(row[1]), e = norm(row[2]);
      if (n === q || e === q) score = 100;
      else if (n.startsWith(q) || e.startsWith(q)) score = 60;
      else if (n.includes(q) || e.includes(q)) score = 30;
      else if (row[7].some((a) => norm(a).includes(q))) score = 15;
      else continue;
    }
    out.push([score, row]);
  }
  out.sort((a, b) => (b[0] === 100) - (a[0] === 100) || nameCompare(a[1][1], b[1][1]));
  return out.map((x) => x[1]);
}

function renderResults() {
  const rows = search();
  const LIMIT = 300;
  $('#result-info').textContent = rows.length > LIMIT ? `${fmt(rows.length)}개 중 ${LIMIT}개 표시 — 검색어를 더 입력하세요` : `${fmt(rows.length)}개`;
  $('#results').innerHTML = rows.slice(0, LIMIT).map((r) => {
    const tags = [state.index.cats[r[3]], r[4] && r[4] !== state.index.cats[r[3]] ? r[4] : '', r[6] & 1 ? '볼트됨' : ''].filter(Boolean).join(' · ');
    const sub = r[1] !== r[2] ? `${r[2]} · ${tags}` : tags;
    return `<li><a href="#/item/${r[0]}" class="${state.selected === r[0] ? 'on' : ''}">${img(r[5])}<span><span class="r-name">${esc(r[1])}</span><span class="r-sub">${esc(sub)}</span></span></a></li>`;
  }).join('');
}

// ---------------------------------------------------------------- 상세
function dropsTable(drops, opts = {}) {
  if (!drops || !drops.length) return '<p class="muted">알려진 드랍 정보가 없습니다.</p>';
  const limit = opts.limit ?? 15;
  const uid = 'd' + Math.random().toString(36).slice(2, 8);
  const rows = drops.map((d, i) => {
    const relic = d[4];
    const relicId = relic && state.relicIds.get(d[3]);
    let name;
    if (relicId != null) name = itemLink(relicId, d[0]);
    else if (opts.items) name = nameLink(d[0], d[3]);
    else {
      const id = findId(d[0], d[3]);
      name = id != null ? itemLink(id, d[0]) : locLink(d[0]);
    }
    const vault = relic && relic.vt ? ' <span class="tag vault">볼트됨</span>' : '';
    const refine = relic ? `<div class="r-sub">${REFINES.map((r, j) => `${r} ${pct(relic.rc[j])}`).join(' · ')}</div>` : '';
    return `<tr${i >= limit ? ' hidden data-more' : ''} data-s="${esc(norm(d[0] + (d[3] || '')))}">
      <td>${name}${vault}${d[3] ? ` <span class="muted" title="영어 원문">· ${esc(d[3])}</span>` : ''}${refine}</td>
      <td class="num"><span class="bar"><i style="width:${Math.max(2, Math.min(100, d[1]))}%"></i></span>${pct(d[1])}</td><td class="rar-${esc(d[2])}">${esc(d[2])}</td></tr>`;
  }).join('');
  const more = drops.length > limit ? `<button class="btn small" data-more-btn="${uid}">전체 ${drops.length}곳 보기</button>` : '';
  const filter = drops.length > 8 ? `<input class="filter" data-filter="${uid}" placeholder="위치 필터 (예: 생존, 지구, Axi)">` : '';
  return `${filter}<table id="${uid}"><thead><tr><th>${opts.items ? '아이템' : '획득 위치'}</th><th class="num">확률</th><th>희귀도</th></tr></thead><tbody>${rows}</tbody></table>${drops.some((d) => d[4]) ? '<div class="r-sub">성유물 확률은 Intact(미정제) 기준입니다.</div>' : ''}${more}`;
}

function statsBlock(st, cat) {
  if (!st) return '';
  const L = {
    health: '체력', shield: '실드', armor: '방어력', power: '에너지',
    totalDamage: '총 피해', criticalChance: '치명타 확률', criticalMultiplier: '치명타 배율', procChance: '상태 이상 확률',
    fireRate: cat === 'melee' ? '공격 속도' : '발사 속도', magazineSize: '탄창', reloadTime: '재장전', disposition: '리벤 성향',
  };
  const v = (k, x) => (k === 'criticalChance' || k === 'procChance') ? (x * 100).toFixed(1) + '%'
    : k === 'criticalMultiplier' ? x + 'x' : k === 'reloadTime' ? x + '초' : typeof x === 'number' ? +x.toFixed(2) : x;
  return `<div class="stats">${Object.entries(st).map(([k, x]) => `<div class="stat"><b>${L[k] || k}</b>${esc(v(k, x))}</div>`).join('')}</div>`;
}

function gatherBlock(ga, rec) {
  const idList = (ids) => ids.map((i) => itemLink(i)).join(', ');
  const rows = [];
  if (ga.reg) rows.push(['지역', esc(ga.reg)]);
  if (ga.time) rows.push([ga.reg && ga.reg.startsWith('오브') ? '날씨' : '시간대', esc(ga.time)]);
  if (ga.rar) rows.push(['희귀도', `<span class="rar-${esc(ga.rar)}">${esc(ga.rar)}</span>`]);
  if (ga.sz) rows.push(['크기', `${ga.sz}종 (Small · Medium · Large) — 크기가 클수록 분해 시 부위를 더 많이 얻습니다`]);
  if (ga.loc) rows.push(['장소 (게임 내 설명)', ga.loc.map(esc).join('<br>')]);
  if (ga.tools && ga.tools.length) {
    const label = ga.m === '낚시' ? '추천 작살' : ga.m === '동물 보호' ? '에코-루어' : '채굴 도구';
    rows.push([label, idList(ga.tools)]);
  }
  if (ga.bait) rows.push(['미끼', ga.bait.map(([i, hint]) => `${itemLink(i)}${hint ? `<div class="r-sub">${esc(hint)}</div>` : ''}`).join('')]);
  if (ga.fish) rows.push(['이 부위가 나오는 물고기', idList(ga.fish)]);
  if (ga.parts) rows.push(['분해하면 나오는 부위', idList(ga.parts)]);
  if (!rows.length) return '';
  return `<h2>${esc(ga.m)} 정보</h2><table class="kv"><tbody>${rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</tbody></table>
    <p class="muted">게임 내 공식 설명(아이템·미끼·작살 설명문)에서 정리한 정보입니다. 핫스팟 위치 등 자세한 지도는 위키를 참고하세요.</p>`;
}

// 위키 추천 파밍 장소: [행성, 노드, 미션, 레벨, 장소 키]
function wikiFarm(wf) {
  const rows = wf.r.length ? `<table><thead><tr><th>행성</th><th>노드</th><th>미션</th><th class="num">레벨</th></tr></thead><tbody>
    ${wf.r.map((r) => `<tr><td>${esc(r[0])}</td><td>${locLink(r[4]).replace(`>${esc(r[4])}<`, `>${esc(r[1])}<`)}</td><td>${esc(r[2])}</td><td class="num">${esc(r[3])}</td></tr>`).join('')}
    </tbody></table>` : '';
  const tips = wf.t.length ? `<ul class="wiki-tips">${wf.t.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : '';
  return `<h2>위키 추천 파밍 장소</h2>${rows}${tips}
    <p class="r-sub">위키 사용자들의 추천이며 정확한 확률은 아닙니다. 팁은 영어 원문입니다. 출처: <a href="${esc(wf.u)}" target="_blank" rel="noopener">WARFRAME Wiki</a> (CC BY-SA)</p>`;
}

function dropShort(d) {
  const vt = d[4] && d[4].vt ? ' <span class="tag vault">볼트됨</span>' : '';
  return `${esc(d[0])} <span class="muted">${pct(d[1])}</span>${vt}`;
}

// ---------------------------------------------------------------- 제작 트리 (상세 화면)
// 재료 종류: 색과 라벨로 구분해 한눈에 무엇을 해야 하는지 보이게 한다
const KIND = {
  craft: { label: '제작', hint: '주조소에서 만들기' },
  refine: { label: '정제·제작 자원', hint: '설계도로 만드는 자원' },
  farm: { label: '파밍 자원', hint: '미션·오픈월드에서 모으기' },
  drop: { label: '파밍 부품', hint: '드랍으로 얻기' },
  buy: { label: '구매·연구', hint: '시장·상점·클랜 도장에서 얻기' },
  unknown: { label: '획득처 정보 없음', hint: '공식 데이터에 획득처가 없음' },
};

// 드랍이 아닌 획득처: ["d", 복제 크레딧] 클랜 도장 연구, ["s", 신디케이트, 등급, 평판, 크레딧] 상점
function srcText(x) {
  if (x[0] === 'm') return `시장${x[1] ? ` · ${fmt(x[1])} 크레딧` : ''}${x[2] ? ` · ${fmt(x[2])} 플래티넘` : ''}`;
  if (x[0] === 'd') return `클랜 도장 연구${x[1] ? ` · 연구 후 설계도 ${fmt(x[1])} 크레딧` : ''}`;
  if (x[0] === 's') return `${esc(x[1])} 상점${x[2] ? ` · ${esc(x[2])} 등급` : ''}${x[3] ? ` · 평판 ${fmt(x[3])}` : ''}${x[4] ? ` · ${fmt(x[4])} 크레딧` : ''}`;
  return '';
}

function legend() {
  return `<div class="legend">${Object.entries(KIND).map(([k, v]) => `<span><i class="dot k-${k}"></i>${v.label}</span>`).join('')}</div>`;
}

function rowKind(row) {
  if (row.id != null) {
    if (row.b) {
      const r = state.byId.get(row.id);
      return r && (r[3] === 'resources' || r[3] === 'misc') ? 'refine' : 'craft';
    }
    const r = state.byId.get(row.id);
    return r && (r[6] & 4) && EXPAND_CATS.has(r[3]) ? 'unknown' : 'farm';
  }
  if (row.b) return 'craft';
  if (row.dr || row.d1) return 'drop';
  return row.src || row.how ? 'buy' : 'unknown';
}

function chips(list) {
  return list.filter(Boolean).map((c) => `<span class="chip">${c}</span>`).join('');
}

function unknownText(en) {
  return `공식 데이터에 획득처 없음 · <a href="${esc(fandom(String(en || '').replace(/ Blueprint$/, '')))}" target="_blank" rel="noopener">위키에서 확인</a>`;
}
// 설계도로 만드는 자원이라도 그 설계도를 얻을 곳이 알려져 있어야 "직접 제작"을 고를 수 있다
function bpKnown(b) {
  const bp = b.l.find((x) => x.id == null && /Blueprint$/.test(x.e || ''));
  return !bp || !!(bp.dr || bp.d1 || bp.src || bp.how);
}

function placeLink(d) {
  const relicId = d[4] && state.relicIds.get(d[3]);
  if (relicId != null) return itemLink(relicId, d[0]);
  const id = findId(d[0], d[3]);
  return id != null ? itemLink(id, d[0]) : locLink(d[0]);
}
function bestDrop(dr) {
  if (!dr || !dr.length) return '';
  const d = dr[0];
  return d[4] && d[4].vt ? '모두 볼트됨' : `${placeLink(d)} ${pct(d[1])}`;
}

function treeNode(row) {
  const kind = rowKind(row);
  const name = row.id != null ? itemLink(row.id) : `<b>${nameLink(row.n, row.e)}</b>`;
  const icon = img(row.id != null ? state.byId.get(row.id)?.[5] : row.img, 'node-img');
  const meta = [];
  if (row.b) meta.push(`${fmt(row.b.cr)} 크레딧`, duration(row.b.tm), row.b.q > 1 ? `${row.b.q}개 생산` : '');
  if (kind === 'drop') meta.push(`추천: ${bestDrop(row.dr || [row.d1])}`);
  if (kind === 'buy') {
    if (row.src) row.src.slice(0, 2).forEach((x) => meta.push(srcText(x)));
    if (row.how && !(row.src && /설계도를 구매/.test(row.how) && row.src.some((x) => x[0] === 's'))) meta.push(esc(row.how));
  }
  if (kind === 'unknown') meta.push(row.id != null ? '설계도 없음 · 직접 구해야 함' : unknownText(row.e));
  if (row.du) meta.push(`두캇 ${row.du}`);
  let extra = '';
  if (row.dr) extra += `<details class="node-drops"><summary>획득처 ${row.dr.length}곳 보기</summary>${dropsTable(row.dr, { limit: 8 })}</details>`;
  if (row.b && row.id == null && !row.dr && !row.d1) {
    if (row.src) meta.push(`설계도: ${srcText(row.src[0])}`);
    else if (!row.b.l.some((x) => x.id == null && /Blueprint$/.test(x.e || ''))) extra += '<div class="r-sub">이 부품의 설계도 획득처는 위키를 참고하세요.</div>';
  }
  const children = row.b ? `<ul>${row.b.l.map(treeNode).join('')}</ul>` : '';
  return `<li><div class="node k-${kind}"><i class="dot k-${kind}"></i>${icon}<div class="node-main">
      <div class="node-title">${name}<span class="qty">× ${fmt(row.q)}</span></div>
      <div class="node-meta">${chips(meta)}</div>${extra}</div></div>${children}</li>`;
}

function craftTree(rec) {
  const root = `<div class="node k-final"><i class="dot k-final"></i>${img(rec.img, 'node-img')}<div class="node-main"><div class="node-title"><b>${esc(rec.n)}</b>${rec.b.q > 1 ? `<span class="qty">× ${rec.b.q}</span>` : ''}</div>
    <div class="node-meta">${chips([`${fmt(rec.b.cr)} 크레딧`, duration(rec.b.tm), rec.b.k ? '설계도 재사용' : ''])}</div></div></div>`;
  return `${legend()}<ul class="tree"><li>${root}<ul>${rec.b.l.map(treeNode).join('')}</ul></li></ul>`;
}

async function renderDetail(id) {
  const el = $('#detail');
  state.selected = id;
  document.querySelectorAll('#results a.on').forEach((a) => a.classList.remove('on'));
  const link = document.querySelector(`#results a[href="#/item/${id}"]`);
  if (link) link.classList.add('on');
  el.innerHTML = '<p class="muted">불러오는 중…</p>';
  let rec;
  try { rec = await getRecord(id); } catch (e) { el.innerHTML = `<p>데이터를 불러오지 못했습니다: ${esc(e.message)}</p>`; return; }
  if (!rec) { el.innerHTML = '<p>항목을 찾을 수 없습니다.</p>'; return; }
  if (state.selected !== id) return;

  const catLabel = state.index.cats[rec.c];
  const tags = [
    `<span class="tag">${esc(catLabel)}</span>`,
    rec.t && rec.t !== catLabel ? `<span class="tag">${esc(rec.t)}</span>` : '',
    rec.p ? '<span class="tag prime">프라임</span>' : '',
    rec.v ? '<span class="tag vault">볼트됨 (현재 드랍 없음)</span>' : '',
    rec.tr ? '<span class="tag ok">거래 가능</span>' : '',
    rec.mr ? `<span class="tag">마스터리 ${rec.mr} 필요</span>` : '',
    rec.r ? `<span class="tag rar-${esc(rec.r)}">${esc(rec.r)}</span>` : '',
    rec.pol ? `<span class="tag">극성 ${esc(rec.pol)}</span>` : '',
  ].join('');

  let h = `<div class="d-head">${img(rec.img)}<div><h1>${esc(rec.n)}</h1>
    ${rec.n !== rec.e ? `<div class="d-en">${esc(rec.e)}</div>` : '<div class="d-en">공식 한국어 명칭 없음 — 영어 명칭 사용</div>'}
    <div class="tags">${tags}</div></div></div>`;
  if (rec.d) h += `<p class="desc">${esc(rec.d)}</p>`;
  if (rec.ls && rec.ls[0]) h += `<p><b>최대 랭크 효과:</b> ${esc(rec.ls[0])}</p>`;

  h += '<div class="btns">';
  if (rec.b || rec.dr || rec.c === 'relics') h += `<button class="btn primary" data-plan-add="${rec.id}">제작 계획에 추가</button>`;
  if (rec.w) h += `<a class="btn" href="${esc(rec.w)}" target="_blank" rel="noopener">공식 위키</a>`;
  h += `<a class="btn" href="${esc(fandom(rec.c === 'relics' ? rec.e.replace(/ Relic$/, '') : rec.e))}" target="_blank" rel="noopener">팬덤 위키</a></div>`;

  if (rec.st) h += `<h2>능력치</h2>${statsBlock(rec.st, rec.c)}`;
  if (rec.ab && rec.ab.length) {
    h += '<h2>어빌리티</h2>' + rec.ab.map((a) => `<div class="ability"><b>${esc(a[0])}</b> — <span class="muted">${esc(a[1])}</span></div>`).join('');
  }

  // 얻는 방법 요약
  const how = [];
  if (rec.mp) how.push(`시장에서 <b>${fmt(rec.mp)} 플래티넘</b>으로 완제품 구매`);
  if (rec.bp) how.push(`시장에서 설계도를 <b>${fmt(rec.bp)} 크레딧</b>에 구매 후 제작`);
  // 설계도를 구할 곳이 없는 아이템: 다른 획득 방법이 없을 때만 "일반 제작 불가"를 앞에 내세운다
  const otherWay = rec.dr || rec.pl || rec.src || rec.mp || rec.ga;
  if (rec.nb && !otherWay) how.unshift(`<b>일반 제작 불가</b>: ${esc(rec.note || '')}`);
  if (rec.b && !rec.nb && !rec.bp && rec.b.l.some((x) => x.dr || x.src)) how.push('설계도·부품을 아래 제작 트리에 나온 방법(드랍·상점·클랜 도장)으로 구한 뒤 주조소에서 제작');
  if (rec.dr) how.push('아래 획득처에서 직접 드랍');
  if (rec.src) rec.src.forEach((x) => how.push(srcText(x)));
  if (rec.wa && rec.wa.k.length) how.push(`<b>위키 기준</b>: ${rec.wa.k.map(esc).join(', ')}`);
  if (rec.pl) how.push(`<b>행성</b>: ${rec.pl.map(esc).join(', ')} 미션에서 드랍 (게임 내 설명)`);
  if (rec.c === 'relics') how.push(rec.dr ? '아래 미션 보상으로 획득 후 보이드 균열 미션에서 개봉' : '현재 볼트됨 — 거래 또는 프라임 리서전스(Varzia)로만 획득');
  const ga = rec.ga;
  if (ga) {
    const HOW = {
      '낚시': '오픈월드에서 낚시 작살로 직접 잡기',
      '물고기 분해': '잡은 물고기를 어부에게 가져가 분해해서 얻기',
      '채광': '오픈월드의 광맥에서 채굴 도구로 캐기',
      '정제': '원석을 모아 설계도로 정제(제작)하기',
      '채집': '오픈월드에서 식물을 채집하기',
      '오픈월드 수집': '오픈월드 현지에서 수집하기',
      '동물 보호': '오픈월드에서 동물을 추적·진정시켜 보호하기',
    };
    how.unshift(`<b>${esc(ga.m)}</b>: ${esc(HOW[ga.m] || '')}`);
  }
  if (how.length) h += `<h2>얻는 방법</h2><div class="how">${how.map((x) => `<div class="how-item">${x}</div>`).join('')}</div>`;
  if (rec.wa && rec.wa.t) {
    h += `<details class="wiki-note"><summary>위키 원문 보기 (영어)</summary><p>${esc(rec.wa.t)}</p>
      <p class="r-sub">출처: <a href="${esc(rec.wa.u)}" target="_blank" rel="noopener">WARFRAME Wiki</a> (CC BY-SA)</p></details>`;
  }
  if (rec.wf) h += wikiFarm(rec.wf);

  if (ga) h += gatherBlock(ga, rec);

  if (rec.b && rec.nb) {
    h += `<h2>제작 방법</h2><p>이 아이템은 설계도를 구할 곳이 확인되지 않아 제작 대상으로 보여주지 않습니다.${otherWay ? ' 위의 "얻는 방법"으로 구하세요.' : ''}</p>
      <details class="nb-recipe"><summary>참고: 게임 데이터에 남아 있는 제작법 보기</summary>${craftTree(rec)}</details>`;
  } else if (rec.b) {
    h += `<h2>제작 방법</h2><div class="craft-layout">
      <aside class="craft-side" id="craft-side"><p class="muted">필요 재료 합계를 계산하는 중…</p></aside>
      <div class="craft-tree">${craftTree(rec)}
      <p class="muted">아래에서 위로 만들어 올라갑니다. 색이 있는 점은 재료 종류이고, 이름을 누르면 그 재료의 상세 정보로 이동합니다.</p></div></div>`;
  }

  if (rec.rw) {
    h += `<h2>성유물 보상</h2><table><thead><tr><th>보상</th><th>희귀도</th>${REFINES.map((r) => `<th class="num">${r}</th>`).join('')}</tr></thead><tbody>
      ${rec.rw.map((x) => `<tr><td>${itemLink(x.id, x.n)}</td><td class="rar-${esc(x.r)}">${esc(x.r)}</td>${x.c.map((c) => `<td class="num">${pct(c)}</td>`).join('')}</tr>`).join('')}
      </tbody></table><p class="muted">정제 단계: Intact(기본) → Exceptional(25) → Flawless(50) → Radiant(100 보이드 트레이스)</p>`;
  }

  if (rec.c === 'enemies') {
    h += '<h2>이 적이 떨어뜨리는 아이템</h2>';
    h += rec.ed && rec.ed.length
      ? dropsTable(rec.ed.map((d) => [d[0], d[1], d[2], d[3] && d[3] !== 'Mod Locations' ? d[3] : 0]), { items: true })
      : '<p class="muted">드랍 정보가 없습니다.</p>';
  } else if (rec.dr || (rec.c !== 'relics' && !rec.ga && !rec.b)) {
    h += `<h2>획득처 (드랍 위치)</h2>${dropsTable(rec.dr)}`;
  }

  if (rec.u && rec.u.length) {
    h += `<h2>사용처 (이 재료가 필요한 제작품 ${rec.u.length}개)</h2><p>${rec.u.map((i) => itemLink(i)).join(', ')}</p>`;
  }
  el.innerHTML = h;
  if (rec.b && !rec.nb) renderCraftSide(rec);
}

// ---------------------------------------------------------------- 장소별 보기
// 미션·의뢰 등 한 장소에서 나오는 모든 아이템과 부품을 로테이션별로 모은다
async function renderLoc(place) {
  const el = $('#detail');
  state.selected = 'loc:' + place;
  el.innerHTML = `<h1>${esc(place)}</h1><p class="muted">이 장소에서 나오는 아이템을 모으는 중… (처음 한 번은 전체 데이터를 불러와 조금 걸립니다)</p>`;
  const cats = await Promise.all(CAT_ORDER.map((c) => loadCat(c).catch(() => ({}))));
  if (state.selected !== 'loc:' + place) return;
  const hits = [];
  const scan = (dr, label, id, en) => {
    for (const d of dr || []) {
      if (placeOf(d[0]) !== place) continue;
      const m = d[0].match(/, 로테이션 ([A-Z])$/);
      hits.push({ label, id, en, rot: m ? m[1] : '', c: d[1], r: d[2] });
    }
  };
  for (const recs of cats) {
    for (const rec of Object.values(recs)) {
      scan(rec.dr, rec.n, rec.id);
      for (const row of rec.b ? rec.b.l : []) if (row.id == null && row.dr) scan(row.dr, row.n, rec.id);
    }
  }
  if (!hits.length) { el.innerHTML = `<h1>${esc(place)}</h1><p class="muted">이 장소에서 나오는 아이템을 찾지 못했습니다.</p>`; return; }
  const groups = new Map();
  for (const x of hits.sort((a, b) => b.c - a.c)) {
    const k = x.rot ? `로테이션 ${x.rot}` : '보상';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(x);
  }
  const keys = [...groups.keys()].sort();
  el.innerHTML = `<div class="d-head"><div><h1>${esc(place)}</h1><div class="d-en">이 장소에서 나오는 아이템 ${hits.length}개</div></div></div>
    ${keys.map((k) => `<h2>${esc(k)}</h2><table><thead><tr><th>아이템</th><th class="num">확률</th><th>희귀도</th></tr></thead><tbody>
      ${groups.get(k).map((x) => `<tr><td>${itemLink(x.id, x.label)}</td><td class="num"><span class="bar"><i style="width:${Math.max(2, Math.min(100, x.c))}%"></i></span>${pct(x.c)}</td><td class="rar-${esc(x.r)}">${esc(x.r)}</td></tr>`).join('')}
      </tbody></table>`).join('')}
    <p class="muted">로테이션 A·B·C는 무한 미션의 보상 주기입니다 (A, A, B, C 순서로 반복).</p>`;
}

// 상세 화면 옆 요약: 이 아이템 1개를 끝까지 만드는 데 드는 총량
async function renderCraftSide(rec) {
  const acc = { credits: 0, time: 0, res: new Map(), parts: new Map(), direct: [], steps: [], craftable: new Set(), prefs: craftPrefs() };
  const node = await expandBuild({ name: rec.n, id: rec.id, kind: 'final' }, rec.b, rec.b.q || 1, acc, 0);
  const el = document.getElementById('craft-side');
  if (!el || state.selected !== rec.id) return;
  const res = [...acc.res.entries()].map(([id, q]) => [state.byId.get(id), q]).filter((x) => x[0])
    .sort((a, b) => b[1] - a[1]);
  const parts = [...acc.parts.values()];
  const stages = new Set(acc.steps.map((x) => x.depth)).size;
  el.innerHTML = `<div class="side-title">한눈에 보기</div>
    <div class="side-stats">
      <div><span class="tile-label">총 크레딧</span><b>${fmt(acc.credits)}</b></div>
      <div><span class="tile-label">최소 시간</span><b>${duration(node.time)}</b></div>
      <div><span class="tile-label">제작 단계</span><b>${stages}단계</b></div>
      <div><span class="tile-label">구할 부품</span><b>${parts.length}개</b></div>
    </div>
    ${res.length ? `<div class="side-sub">필요 자원 합계</div><ul class="side-res">${res.map(([r, q]) => `<li>${img(r[5], 'side-img')}${itemLink(r[0])}<span class="num">${fmt(q)}</span></li>`).join('')}</ul>` : ''}
    <button class="btn primary side-btn" data-plan-add="${rec.id}">제작 계획에 추가</button>
    <p class="r-sub">부품·정제 자원까지 모두 펼친 합계입니다.</p>`;
}

// 상세 영역의 위임 이벤트: 필터 / 더 보기 / 계획 추가
document.addEventListener('input', (e) => {
  const f = e.target.closest('[data-filter]');
  if (!f) return;
  const t = document.getElementById(f.dataset.filter);
  const q = norm(f.value);
  t.querySelectorAll('tbody tr').forEach((tr) => {
    tr.hidden = q ? !tr.dataset.s.includes(q) : tr.hasAttribute('data-more');
  });
});
document.addEventListener('click', (e) => {
  const more = e.target.closest('[data-more-btn]');
  if (more) {
    document.getElementById(more.dataset.moreBtn).querySelectorAll('tr[data-more]').forEach((tr) => { tr.hidden = false; tr.removeAttribute('data-more'); });
    more.remove();
    return;
  }
  const add = e.target.closest('[data-plan-add]');
  if (add) {
    planAdd(Number(add.dataset.planAdd));
    add.textContent = '추가됨 ✓';
  }
});

// ---------------------------------------------------------------- 제작 계획
function plan() { return store('wf-plan', []); }
function planAdd(id) {
  const p = plan();
  const ex = p.find((x) => x.id === id);
  if (ex) ex.q += 1; else p.push({ id, q: 1 });
  save('wf-plan', p);
  updatePlanBadge();
}
function updatePlanBadge() {
  const n = plan().length;
  const b = $('#plan-count');
  b.hidden = !n;
  b.textContent = n;
}

function craftPrefs() { return store('wf-craft', {}); }

// 이미 만들어 둔 중간 결과물(부품·정제 자원·재료 무기)을 먼저 쓰고, 모자란 만큼만 만든다.
// acc.pool 은 보유 수량에서 아직 쓰지 않은 개수. 같은 결과물이 여러 곳에 쓰이면 앞에서부터 나눠 쓴다.
function takeStock(acc, key, need) {
  acc.interNeed.set(key, (acc.interNeed.get(key) || 0) + need);
  const left = acc.pool ? Math.max(0, Number(acc.pool[key]) || 0) : 0;
  const use = Math.min(left, need);
  if (acc.pool) acc.pool[key] = left - use;
  return need - use;
}

// 제작 트리를 끝까지 펼쳐 크레딧·자원·파밍할 부품·제작 단계를 모은다.
// 돌려주는 node.time 은 그 단계까지 걸리는 최소 시간(하위 제작은 동시에 진행한다고 가정).
async function expandBuild(info, b, mult, acc, depth = 0) {
  acc.interNeed = acc.interNeed || new Map();
  const times = Math.ceil(mult / (b.q || 1));
  acc.credits += b.cr * times;
  const node = { ...info, q: info.q ?? mult, make: mult, b, times, children: [], depth };
  let longest = 0;
  const fulfilled = (base, need) => ({ ...base, q: need, make: 0, b: base.b, times: 0, children: [], depth: depth + 1, time: 0, ready: true });
  for (const row of b.l) {
    // 소모되지 않는 설계도는 제작 횟수와 상관없이 1장이면 된다
    const isBp = row.id == null && /Blueprint$/.test(row.e || '');
    const need = isBp && b.k ? row.q : row.q * times;
    if (row.id != null) {
      const sub = depth < 8 ? await getRecord(row.id) : null;
      const canCraft = sub && sub.b && !sub.nb && (EXPAND_CATS.has(sub.c) || ((sub.c === 'resources' || sub.c === 'misc') && bpKnown(sub.b)));
      if (sub && sub.nb && EXPAND_CATS.has(sub.c)) {
        const key = 'p' + sub.e;
        const ex = acc.parts.get(sub.e);
        if (ex) ex.q += need; else acc.parts.set(sub.e, { n: sub.n, e: sub.e, id: sub.id, img: sub.img, q: need, kind: 'unknown', note: sub.note });
        node.children.push({ name: sub.n, id: sub.id, kind: 'unknown', q: need, key, part: { e: sub.e, note: sub.note } });
        continue;
      }
      const pref = acc.prefs[row.id];
      const doCraft = canCraft && (pref !== undefined ? pref : (EXPAND_CATS.has(sub.c) || !!sub.mk));
      if (canCraft && !EXPAND_CATS.has(sub.c)) acc.craftable.add(row.id);
      if (doCraft) {
        const kind = EXPAND_CATS.has(sub.c) ? 'craft' : 'refine';
        const key = 'c' + sub.id;
        const rest = takeStock(acc, key, need);
        const base = { name: sub.n, id: sub.id, kind, key, b: sub.b };
        if (!rest) { node.children.push(fulfilled(base, need)); continue; }
        const child = await expandBuild({ ...base, q: need }, sub.b, rest, acc, depth + 1);
        node.children.push(child);
        longest = Math.max(longest, child.time);
      } else {
        acc.res.set(row.id, (acc.res.get(row.id) || 0) + need);
        node.children.push({ name: state.byId.get(row.id)?.[1], id: row.id, kind: 'farm', q: need, key: 'r' + row.id });
      }
    } else if (row.b) {
      // 부품(섀시 등): 완성된 부품이 있으면 그만큼 설계도·재료가 필요 없다
      const key = 'b' + row.e;
      const rest = takeStock(acc, key, need);
      const base = { name: row.n, kind: 'craft', key, part: row, b: row.b };
      if (!rest) { node.children.push(fulfilled(base, need)); continue; }
      const ex = acc.parts.get(row.e);
      if (ex) ex.q += rest; else acc.parts.set(row.e, { ...row, q: rest, kind: 'craft' });
      const child = await expandBuild({ ...base, q: need }, row.b, rest, acc, depth + 1);
      child.part = row;
      node.children.push(child);
      longest = Math.max(longest, child.time);
    } else {
      const key = 'p' + row.e;
      const kind = (row.dr || row.d1) ? 'drop' : (row.src || row.how) ? 'buy' : 'unknown';
      const ex = acc.parts.get(row.e);
      if (ex) ex.q += need; else acc.parts.set(row.e, { ...row, q: need, kind });
      node.children.push({ name: row.n, kind, q: need, key, part: row });
    }
  }
  acc.steps.push({ n: info.name, times: times * (b.q || 1), cr: b.cr * times, tm: b.tm, depth });
  node.time = b.tm + longest;
  return node;
}

function planNode(n, have) {
  const total = n.key ? have.need(n.key) : 0;
  const got = n.key ? have.get(n.key) : 0;
  const done = n.key && !n.b && total && got >= total;
  const name = n.id != null ? itemLink(n.id, n.name) : `<b>${nameLink(n.name, n.part && n.part.e)}</b>`;
  const meta = [];
  if (n.b && !n.ready) meta.push(`${fmt(n.b.cr * n.times)} 크레딧`, duration(n.b.tm));
  if (n.kind === 'drop' && n.part) meta.push(`추천: ${bestDrop(n.part.dr)}`);
  if (n.kind === 'buy') meta.push(n.part && n.part.src ? srcText(n.part.src[0]) : esc(n.part && n.part.how || ''));
  if (n.kind === 'unknown') meta.push(n.part && n.part.note ? esc(n.part.note) : unknownText(n.part && n.part.e));
  if (n.kind === 'refine' || (n.kind === 'farm' && n.id != null && state.craftable.has(n.id))) {
    meta.push(`<button class="link-btn" data-craft-toggle="${n.id}" data-to="${n.kind === 'refine' ? 0 : 1}">${n.kind === 'refine' ? '파밍으로 계산' : '직접 제작으로 계산'}</button>`);
  }
  const icon = img(n.id != null ? state.byId.get(n.id)?.[5] : n.part && n.part.img, 'node-img');
  if (n.key && !n.b && total) meta.unshift(`<b class="${done ? 'ok-text' : ''}">보유 ${fmt(Math.min(got, total))} / ${fmt(total)}</b>`);
  let box = n.key && !n.b ? fullBox(n.key, got, total) : '';
  let inter = '';
  if (n.key && n.b) {
    // 중간 결과물: 완성품을 몇 개 가지고 있는지 입력하면 아래 재료가 그만큼 줄어든다
    const tot = have.need(n.key);
    const own = have.get(n.key);
    box = fullBox(n.key, own, tot);
    inter = `<div class="inter">완성품 보유 ${ownedInput(n.key, own, tot, 'small')}
      <span class="r-sub">${n.ready ? '이미 준비됨 · 재료 필요 없음' : n.make < n.q ? `${fmt(n.q - n.make)}개는 보유분 사용 · ${fmt(n.make)}개 제작` : `${fmt(n.make)}개 제작`}</span></div>`;
  }
  const kids = n.children && n.children.length ? `<ul>${n.children.map((c) => planNode(c, have)).join('')}</ul>` : '';
  const ready = done || n.ready;
  return `<li><div class="node k-${n.kind}${ready ? ' done' : ''}" data-have-row>${box}<i class="dot k-${n.kind}"></i>${icon}<div class="node-main">
    <div class="node-title">${name}<span class="qty">× ${fmt(n.q)}</span></div><div class="node-meta">${chips(meta)}</div>${inter}</div></div>${kids}</li>`;
}

// 보유 수량: wf-owned = { 키: 개수 }. 예전 버전의 체크(wf-have)는 "다 모음"으로 취급한다
function ownedStore() { return store('wf-owned', {}); }
function ownedOf(key, need, owned = ownedStore(), legacy = store('wf-have', {})) {
  if (owned[key] != null) return Math.max(0, Number(owned[key]) || 0);
  return legacy[key] ? need : 0;
}
function ownedInput(key, have, need, cls = '') {
  return `<span class="owned ${cls}"><input type="number" min="0" inputmode="numeric" class="owned-input" data-owned="${esc(key)}" value="${have}" aria-label="보유 수량">
    <span class="owned-need">/ ${fmt(need)}</span></span>`;
}
function fullBox(key, have, need) {
  return `<input type="checkbox" class="have-box" data-have="${esc(key)}" data-need="${need}" ${have >= need ? 'checked' : ''} title="다 모음" aria-label="다 모음">`;
}
function miniBar(have, need) {
  const p = need ? Math.min(100, Math.round((have / need) * 100)) : 0;
  return `<div class="progress mini${p >= 100 ? ' full' : ''}"><i style="width:${p}%"></i></div>`;
}

function progress(done, total, avg) {
  const p = total ? Math.round((done / total) * 100) : 0;
  const bar = avg != null ? Math.round(avg * 100) : p;
  return `<div class="progress"><i style="width:${bar}%"></i></div><div class="r-sub">${done} / ${total} 완료${avg != null && total ? ` · 진행률 ${bar}%` : ''}</div>`;
}

async function renderPlan() {
  const el = $('#view-plan');
  const p = plan();
  if (!p.length) {
    el.innerHTML = `<div class="card"><h2>제작 계획</h2><p>아직 추가된 항목이 없습니다. 검색에서 아이템을 선택하고 <b>제작 계획에 추가</b>를 누르면,
      부품과 정제 자원까지 펼친 제작 트리, 단계별 제작 순서, 필요한 자원 합계를 보여드립니다.</p><a class="btn" href="#/">검색으로 가기</a></div>`;
    return;
  }
  el.innerHTML = '<p class="muted">계산 중…</p>';
  const acc = { credits: 0, time: 0, res: new Map(), parts: new Map(), direct: [], steps: [], craftable: new Set(), prefs: craftPrefs(), pool: { ...ownedStore() }, interNeed: new Map() };
  const trees = [];
  for (const x of p) {
    const rec = await getRecord(x.id);
    if (!rec) continue;
    if (!rec.b || rec.nb) { acc.direct.push({ rec, q: x.q }); continue; }
    const node = await expandBuild({ name: rec.n, id: rec.id, kind: 'final' }, rec.b, x.q, acc, 0);
    acc.time = Math.max(acc.time, node.time);
    trees.push([rec, x.q, node]);
  }
  state.craftable = acc.craftable;
  const resRows = [...acc.res.entries()].map(([id, q]) => [state.byId.get(id), q]).filter((x) => x[0])
    .sort((a, b) => nameCompare(a[0][1], b[0][1]));
  const farmParts = [...acc.parts.values()].filter((x) => x.q > 0);
  const ownedMap = ownedStore(), legacy = store('wf-have', {});
  const needMap = new Map();
  for (const [r, q] of resRows) needMap.set('r' + r[0], q);
  for (const x of farmParts) needMap.set('p' + x.e, x.q);
  for (const [k, q] of acc.interNeed) needMap.set(k, q);
  const have = {
    need: (k) => needMap.get(k) || 0,
    get: (k) => ownedOf(k, needMap.get(k) || 0, ownedMap, legacy),
  };
  const isDone = (k) => have.get(k) >= have.need(k);
  const ratio = (keys) => (keys.length ? keys.reduce((s, k) => s + Math.min(1, have.get(k) / (have.need(k) || 1)), 0) / keys.length : 0);
  const resKeys = resRows.map(([r]) => 'r' + r[0]);
  const partKeys = farmParts.map((x) => 'p' + x.e);
  const resDone = resKeys.filter(isDone).length;
  const partDone = partKeys.filter(isDone).length;

  // 요약
  let h = `<div class="summary">
    <div class="tile"><span class="tile-label">총 크레딧</span><span class="tile-value">${fmt(acc.credits)}</span><span class="r-sub">부품·정제 포함</span></div>
    <div class="tile"><span class="tile-label">최소 소요 시간</span><span class="tile-value">${acc.time ? duration(acc.time) : '-'}</span><span class="r-sub">동시 제작 기준</span></div>
    <div class="tile"><span class="tile-label">모을 자원</span><span class="tile-value">${resRows.length}종</span>${progress(resDone, resRows.length, ratio(resKeys))}</div>
    <div class="tile"><span class="tile-label">파밍·구매할 부품</span><span class="tile-value">${farmParts.length}개</span>${progress(partDone, farmParts.length, ratio(partKeys))}</div>
  </div>`;

  // 목표 아이템
  h += `<div class="card"><h2>목표 아이템</h2>${trees.map(([r, q]) => r).concat(acc.direct.map((d) => d.rec)).map((r) => {
    const q = p.find((x) => x.id === r.id).q;
    return `<div class="plan-row">${img(r.img, 'thumb')}<span class="grow">${itemLink(r.id, r.n)}<span class="r-sub">${esc(r.e)}</span></span>
      <label class="r-sub" for="pq-${r.id}">개수</label><input id="pq-${r.id}" type="number" min="1" value="${q}" data-plan-q="${r.id}"><button class="btn small" data-plan-del="${r.id}">삭제</button></div>`;
  }).join('')}<div class="btns"><button class="btn small" data-plan-clear>계획 비우기</button></div></div>`;

  // 지금 갈 곳: 아직 없는 재료를 같은 장소에서 함께 얻을 수 있게 묶는다
  const spots = new Map();
  const addSpot = (key, label, item, chance, link, wikiPick) => {
    let sp = spots.get(key);
    if (!sp) spots.set(key, sp = { label, link, items: new Map(), wiki: 0 });
    if (wikiPick) sp.wiki += 1;
    const prev = sp.items.get(item);
    if (prev === undefined || (chance ?? 0) > (prev ?? 0)) sp.items.set(item, chance);
  };
  const addDrops = (name, dr) => {
    for (const d of (dr || []).slice(0, 12)) {
      if ((d[4] && d[4].vt) || /콘클레이브|Conclave/.test(d[0])) continue;
      const place = d[0].replace(/, 로테이션 [A-Z]$/, '');
      addSpot('d' + place, place, name, d[1], d[4] ? placeLink(d) : null);
    }
  };
  for (const x of farmParts) if (!isDone('p' + x.e)) addDrops(x.n, x.dr);
  for (const { rec } of acc.direct) addDrops(rec.n, rec.dr);
  for (const [r] of resRows) {
    if (isDone('r' + r[0])) continue;
    const rec = await getRecord(r[0]);
    if (!rec) continue;
    addDrops(rec.n, rec.dr);
    for (const w of (rec.wf && rec.wf.r || []).slice(0, 4)) addSpot('d' + w[4], w[4], rec.n, null, null, true);
    for (const pl of rec.pl || []) addSpot('p' + pl, `${pl} (행성 미션 어디서나)`, rec.n, null);
  }
  const spotList = [...spots.values()].filter((x) => x.items.size)
    .sort((a, b) => b.items.size - a.items.size || b.wiki - a.wiki || Math.max(...b.items.values()) - Math.max(...a.items.values())).slice(0, 6);
  if (spotList.length) {
    h += `<div class="card"><h2>지금 갈 곳</h2><p class="muted">아직 다 모으지 못한 재료를 한 번에 많이 얻을 수 있는 장소 순서입니다. "위키 추천"은 WARFRAME 위키 사용자들이 추천한 파밍 노드입니다.</p><div class="farm-list">
      ${spotList.map((sp) => `<div class="farm-item spot"><div class="farm-head"><b>${sp.link || (sp.label.includes('행성 미션') ? esc(sp.label) : locLink(sp.label))}</b><span class="chip">${sp.items.size}종</span>${sp.wiki ? '<span class="chip wiki-chip">위키 추천</span>' : ''}</div>
        ${[...sp.items.entries()].map(([n, c]) => `<div class="farm-src"><span>${nameLink(n)}</span>${c != null ? `<span class="bar"><i style="width:${Math.max(2, Math.min(100, c))}%"></i></span><span class="num">${pct(c)}</span>` : '<span></span><span></span>'}</div>`).join('')}
      </div>`).join('')}</div></div>`;
  }

  // 제작 순서 로드맵
  if (acc.steps.length) {
    const maxDepth = Math.max(...acc.steps.map((x) => x.depth));
    const stages = [];
    for (const st of acc.steps) {
      if (!st.times) continue;
      const i = maxDepth - st.depth;
      (stages[i] = stages[i] || []).push(st);
    }
    h += `<div class="card"><h2>제작 순서</h2><div class="roadmap">${stages.map((list, i) => {
      const longest = Math.max(...list.map((x) => x.tm));
      return `<div class="stage"><div class="stage-head"><span class="stage-no">${i + 1}단계</span><span class="r-sub">최대 ${duration(longest)}</span></div>
        ${list.map((x) => `<div class="step"><b>${nameLink(x.n)}</b>${x.times > 1 ? `<span class="qty">× ${fmt(x.times)}</span>` : ''}<div class="node-meta">${chips([`${fmt(x.cr)} 크레딧`, duration(x.tm)])}</div></div>`).join('')}
      </div>`;
    }).join('<div class="stage-arrow" aria-hidden="true"></div>')}</div>
    <p class="muted">같은 단계에 있는 것은 주조소에서 동시에 만들 수 있습니다. 앞 단계가 끝나야 다음 단계를 시작할 수 있습니다.</p></div>`;
  }

  // 필요 자원
  if (resRows.length) {
    h += `<div class="card"><h2>모아야 할 자원</h2><div class="res-grid">${resRows.map(([r, q]) => {
      const key = 'r' + r[0];
      const got = have.get(key);
      const done = got >= q;
      const canCraft = acc.craftable.has(r[0]);
      return `<div class="res-tile${done ? ' done' : ''}" data-have-row>${fullBox(key, got, q)}
        ${img(r[5], 'res-img')}<div class="res-body">${itemLink(r[0])}
        ${ownedInput(key, got, q)}
        ${miniBar(got, q)}<div class="r-sub">${done ? '다 모음' : `${fmt(q - got)}개 남음`}</div>
        ${canCraft ? `<div><button class="link-btn" data-craft-toggle="${r[0]}" data-to="1">직접 제작으로 계산</button></div>` : ''}</div></div>`;
    }).join('')}</div><p class="muted">모은 개수를 입력하면 남은 개수와 진행률이 바뀝니다. 체크박스는 "다 모음"입니다. 이미 만들어 둔 부품·정제 자원·재료 무기는 아래 <b>전체 제작 트리</b>의 "완성품 보유"에 입력하면 그만큼 필요한 재료가 함께 줄어듭니다.</p></div>`;
  }

  // 파밍할 부품
  if (farmParts.length) {
    h += `<div class="card"><h2>파밍·구매할 부품과 설계도</h2><div class="farm-list">${farmParts.map((x) => {
      const key = 'p' + x.e;
      const got = have.get(key);
      const done = got >= x.q;
      const best = x.dr ? x.dr.slice(0, 3).map((d) => `<div class="farm-src"><span>${placeLink(d)}${d[4] && d[4].vt ? ' <span class="tag vault">볼트됨</span>' : ''}</span><span class="bar"><i style="width:${Math.max(2, Math.min(100, d[1]))}%"></i></span><span class="num">${pct(d[1])}</span></div>`).join('')
        : `<div class="r-sub">${x.src ? x.src.slice(0, 2).map(srcText).join('<br>') : x.how ? esc(x.how) : x.note ? esc(x.note) : unknownText(x.e)}</div>`;
      return `<div class="farm-item k-${x.kind}${done ? ' done' : ''}" data-have-row><div class="farm-head">${fullBox(key, got, x.q)}
        <i class="dot k-${x.kind}"></i>${img(x.img, 'side-img')}<b>${nameLink(x.n, x.e)}${x.b ? ' 설계도' : ''}</b>${x.q > 1 ? ownedInput(key, got, x.q, 'small') : ''}</div>${best}</div>`;
    }).join('')}</div></div>`;
  }

  // 전체 제작 트리
  if (trees.length) {
    h += `<div class="card"><h2>전체 제작 트리</h2>${legend()}${trees.map(([, , node]) => `<ul class="tree">${planNode(node, have)}</ul>`).join('')}</div>`;
  }

  if (acc.direct.length) {
    h += `<div class="card"><h2>직접 획득해야 하는 항목</h2><div class="farm-list">
      ${acc.direct.map(({ rec, q }) => `<div class="farm-item k-drop"><div class="farm-head"><i class="dot k-drop"></i>${itemLink(rec.id, rec.n)}<span class="qty">× ${q}</span></div>
        ${rec.note ? `<div class="r-sub">${esc(rec.note)}</div>` : ''}
        ${rec.dr ? rec.dr.slice(0, 3).map((d) => `<div class="farm-src"><span>${placeLink(d)}</span><span class="bar"><i style="width:${Math.max(2, Math.min(100, d[1]))}%"></i></span><span class="num">${pct(d[1])}</span></div>`).join('') : rec.note ? '' : `<div class="r-sub">${unknownText(rec.e)}</div>`}</div>`).join('')}
      </div></div>`;
  }
  el.innerHTML = h;
}

document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.have !== undefined || t.dataset.owned !== undefined) {
    const owned = ownedStore();
    const legacy = store('wf-have', {});
    const key = t.dataset.have ?? t.dataset.owned;
    owned[key] = t.dataset.have !== undefined
      ? (t.checked ? Number(t.dataset.need) || 1 : 0)
      : Math.max(0, parseInt(String(t.value).replace(/[^0-9]/g, ''), 10) || 0);
    delete legacy[key];
    save('wf-owned', owned);
    save('wf-have', legacy);
    renderPlan();
  } else if (t.dataset.planQ !== undefined) {
    const p = plan();
    const x = p.find((y) => y.id === Number(t.dataset.planQ));
    if (x) x.q = Math.max(1, parseInt(t.value, 10) || 1);
    save('wf-plan', p);
    renderPlan();
  }
});
document.addEventListener('click', (e) => {
  const tog = e.target.closest('[data-craft-toggle]');
  if (tog) {
    const prefs = craftPrefs();
    prefs[tog.dataset.craftToggle] = tog.dataset.to === '1';
    save('wf-craft', prefs);
    renderPlan();
    return;
  }
  const del = e.target.closest('[data-plan-del]');
  if (del) {
    save('wf-plan', plan().filter((x) => x.id !== Number(del.dataset.planDel)));
    updatePlanBadge();
    renderPlan();
  } else if (e.target.closest('[data-plan-clear]')) {
    // 확인 대화상자를 쓸 수 없는 환경도 있어 버튼을 두 번 누르게 한다
    const btn = e.target.closest('[data-plan-clear]');
    if (btn.dataset.armed) {
      save('wf-plan', []);
      save('wf-have', {});
      save('wf-owned', {});
      updatePlanBadge();
      renderPlan();
    } else {
      btn.dataset.armed = '1';
      btn.textContent = '한 번 더 누르면 모두 지워집니다';
    }
  }
});

// ---------------------------------------------------------------- 가이드
function renderGuide() {
  $('#view-guide').innerHTML = `<div class="card guide">
  <h2>이 도우미 사용법</h2>
  <ol>
    <li><b>검색</b> 탭에서 아이템 이름을 한국어 또는 영어로 입력합니다. 부품 이름(예: "볼트 프라임 섀시")으로도 찾을 수 있습니다.</li>
    <li>상세 화면의 <b>제작 방법</b>에서 필요한 크레딧, 제작 시간, 부품과 자원을 확인합니다. 부품마다 획득처(성유물, 미션 로테이션, 적 드랍)와 확률이 나옵니다.</li>
    <li>자원(예: 오로킨 셀)을 클릭하면 그 자원의 <b>획득처</b>와 <b>사용처</b>를 볼 수 있습니다.</li>
    <li><b>제작 계획에 추가</b>를 누르면 여러 아이템의 필요 재료를 합산하고, 이미 가진 재료를 체크해 둘 수 있습니다(브라우저에 저장).</li>
  </ol>
  <h2>파밍 기본 상식</h2>
  <ul>
    <li><b>로테이션 A/B/C</b>: 생존·방어·발굴 등 무한 미션은 보상 주기마다 A, A, B, C 순서로 보상표가 바뀝니다. C 로테이션 보상이 가장 희귀합니다.
      (생존 5분마다, 방어 5웨이브마다)</li>
    <li><b>성유물</b>: 프라임 부품은 성유물(리스/메소/네오/액시)을 보이드 균열 미션에서 열어 얻습니다.
      보이드 트레이스로 정제하면 희귀 보상 확률이 올라갑니다(Radiant 기준 희귀 10%).</li>
    <li><b>볼트됨</b>: 볼트된 프라임 아이템의 성유물은 더 이상 미션에서 나오지 않습니다. 거래나 프라임 리서전스로 구해야 합니다.</li>
    <li><b>거래 가능</b> 표시가 있는 프라임 부품·모드는 플레이어 간 거래로 구할 수 있습니다. 쓰지 않는 프라임 부품은 릴레이의 두캇 키오스크에서 두캇으로 바꿔 Baro Ki'Teer 상점에서 쓸 수 있습니다.</li>
    <li>보스 부품(대부분 일반 워프레임)은 해당 행성 암살 미션 보스가 드랍합니다. 획득처에 보스 노드가 표시됩니다.</li>
    <li>자원 드랍량 증가: 자원 부스터, 자원 드랍 확률 부스터, 네크로스의 데시크레이트, 스미타 카밧의 Charm 등을 활용하세요.</li>
  </ul>
  <h2>채광 · 낚시 · 채집</h2>
  <ul>
    <li>검색창에 <b>채광</b>, <b>낚시</b>, <b>물고기 분해</b>, <b>채집</b>, <b>정제</b>, <b>동물 보호</b>를 입력하면 해당 방식으로 얻는 자원만 모아 볼 수 있습니다.</li>
    <li>광석·보석 상세 화면에는 광맥 색과 지역, 필요한 채굴 도구가, 물고기에는 지역·시간대(날씨)·추천 작살·미끼·분해 부위가 표시됩니다.</li>
    <li>얼로이·가공 보석은 원석을 모아 설계도로 <b>정제</b>합니다. 설계도 판매처는 상세 화면 설명에 나옵니다.</li>
  </ul>
  <h2>제작 계획 활용</h2>
  <ul>
    <li><b>보유 수량</b>: 자원은 "모아야 할 자원"에, 이미 만든 부품(섀시 등)·정제 자원·재료 무기는 "전체 제작 트리"의 "완성품 보유"에 입력하세요. 완성품이 있으면 그 아래 설계도와 재료 필요량이 자동으로 줄어듭니다.</li>
    <li><b>지금 갈 곳</b>: 아직 체크하지 않은 재료를 한 장소에서 가장 많이 얻을 수 있는 곳부터 보여줍니다. 행성 단위 자원은 "행성 미션 어디서나"로 표시됩니다.</li>
    <li>드랍되지 않는 설계도는 <b>신디케이트 상점</b>(필요 등급·평판)이나 <b>클랜 도장 연구</b>(연구 후 복제 크레딧)로 표시됩니다.</li>
  </ul>
  <h2>명칭과 데이터</h2>
  <ul>
    <li>명칭은 게임 내 공식 한국어 번역을 사용하며, 공식 번역이 없는 항목(일부 적, 노드 이름, 일부 미션 타입 등)은 영어 원문을 사용합니다.</li>
    <li>드랍 확률은 공식 드랍 테이블 기반 WFCD 데이터입니다. 최신 패치와 차이가 있을 수 있으니 중요한 정보는 공식/팬덤 위키에서 한 번 더 확인하세요.</li>
  </ul></div>`;
}

// ---------------------------------------------------------------- 라우팅
function show(tab) {
  for (const v of ['search', 'plan', 'guide']) $('#view-' + v).hidden = v !== tab;
  document.querySelectorAll('.tabs a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
}
function route() {
  const h = location.hash.replace(/^#\/?/, '');
  if (h === 'plan') { show('plan'); renderPlan(); return; }
  if (h === 'guide') { show('guide'); renderGuide(); return; }
  show('search');
  const loc = h.match(/^loc\/(.+)$/);
  if (loc) {
    renderLoc(decodeURIComponent(loc[1]));
    if (window.innerWidth <= 860) $('#detail').scrollIntoView({ behavior: 'smooth' });
    return;
  }
  const sq = h.match(/^search\/(.+)$/);
  if (sq) {
    const q = decodeURIComponent(sq[1]);
    $('#q').value = q;
    state.q = q;
    state.cat = 'all';
    renderCats();
    renderResults();
    $('#detail').innerHTML = `<p class="muted">"${esc(q)}"(으)로 검색한 결과입니다. 왼쪽 목록에서 항목을 고르세요.</p>`;
    return;
  }
  const m = h.match(/^item\/(\d+)/);
  if (m) {
    renderDetail(Number(m[1]));
    if (window.innerWidth <= 860) $('#detail').scrollIntoView({ behavior: 'smooth' });
  }
}

async function main() {
  try {
    await loadIndex();
  } catch (e) {
    $('#detail').innerHTML = `<p>데이터를 불러오지 못했습니다 (${esc(e.message)}).</p>
      <p class="muted">index.html 파일을 직접 열면 브라우저 보안 정책 때문에 데이터를 읽을 수 없습니다.
      GitHub Pages에 올리거나, 이 폴더에서 <code>python3 -m http.server</code> 실행 후 http://localhost:8000 으로 접속하세요.</p>`;
    return;
  }
  renderCats();
  renderResults();
  updatePlanBadge();
  let timer;
  $('#q').addEventListener('input', (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => { state.q = e.target.value; renderResults(); }, 120);
  });
  $('#f-prime').addEventListener('change', renderResults);
  $('#f-avail').addEventListener('change', renderResults);
  $('#cats').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-cat]');
    if (!b) return;
    state.cat = b.dataset.cat;
    renderCats();
    renderResults();
  });
  window.addEventListener('hashchange', route);
  route();
}

main();
