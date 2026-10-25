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
  cats: {},         // cat → Promise<{id: record}>
  cat: 'all',
  q: '',
  selected: null,
};

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Number(n).toLocaleString('ko-KR');
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
  return `<img class="${cls}" loading="lazy" src="${esc(state.index.img + encodeURIComponent(name))}" alt="" onerror="this.style.visibility='hidden'">`;
}
function fandom(en) {
  return 'https://warframe.fandom.com/wiki/' + encodeURIComponent(String(en).replace(/ /g, '_'));
}
function itemLink(id, label) {
  const row = state.byId.get(id);
  return `<a href="#/item/${id}">${esc(label ?? (row ? row[1] : id))}</a>`;
}

// ---------------------------------------------------------------- 데이터 로드
async function loadIndex() {
  const res = await fetch(DATA + 'index.json');
  if (!res.ok) throw new Error('index.json ' + res.status);
  state.index = await res.json();
  for (const row of state.index.items) {
    state.byId.set(row[0], row);
    if (row[3] === 'relics') state.relicIds.set(row[2], row[0]);
  }
  $('#data-version').textContent = state.index.version ? `v${state.index.version}` : '';
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
  for (const r of state.index.items) counts[r[3]] = (counts[r[3]] || 0) + 1;
  const btn = (key, label) => `<button data-cat="${key}" class="${state.cat === key ? 'on' : ''}">${esc(label)}</button>`;
  $('#cats').innerHTML = btn('all', `전체 ${fmt(state.index.items.length)}`) +
    CAT_ORDER.filter((c) => counts[c]).map((c) => btn(c, `${state.index.cats[c]} ${fmt(counts[c])}`)).join('');
}

function search() {
  const q = norm(state.q);
  const onlyPrime = $('#f-prime').checked, noVault = $('#f-avail').checked;
  const out = [];
  for (const row of state.index.items) {
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
      if (row[3] === 'enemies') score -= 5;
    }
    out.push([score, row]);
  }
  out.sort((a, b) => b[0] - a[0] || a[1][1].length - b[1][1].length || a[1][1].localeCompare(b[1][1], 'ko'));
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
    const name = relicId != null ? itemLink(relicId, d[0]) : esc(d[0]);
    const vault = relic && relic.vt ? ' <span class="tag vault">볼트됨</span>' : '';
    const refine = relic ? `<div class="r-sub">${REFINES.map((r, j) => `${r} ${pct(relic.rc[j])}`).join(' · ')}</div>` : '';
    return `<tr${i >= limit ? ' hidden data-more' : ''} data-s="${esc(norm(d[0] + (d[3] || '')))}">
      <td>${name}${vault}${d[3] ? ` <span class="muted" title="영어 원문">· ${esc(d[3])}</span>` : ''}${refine}</td>
      <td class="num">${pct(d[1])}</td><td class="rar-${esc(d[2])}">${esc(d[2])}</td></tr>`;
  }).join('');
  const more = drops.length > limit ? `<button class="btn small" data-more-btn="${uid}">전체 ${drops.length}곳 보기</button>` : '';
  const filter = drops.length > 8 ? `<input class="filter" data-filter="${uid}" placeholder="위치 필터 (예: 생존, 지구, Axi)">` : '';
  return `${filter}<table id="${uid}"><thead><tr><th>획득 위치</th><th class="num">확률</th><th>희귀도</th></tr></thead><tbody>${rows}</tbody></table>${drops.some((d) => d[4]) ? '<div class="r-sub">성유물 확률은 Intact(미정제) 기준입니다.</div>' : ''}${more}`;
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

function dropShort(d) {
  const vt = d[4] && d[4].vt ? ' <span class="tag vault">볼트됨</span>' : '';
  return `${esc(d[0])} <span class="muted">${pct(d[1])}</span>${vt}`;
}

function componentBlock(row) {
  if (row.id != null) {
    const r = state.byId.get(row.id);
    return `<div class="comp"><div class="comp-head">${img(r && r[5], 'thumb')}<div>${itemLink(row.id)}
      ${r && r[1] !== r[2] ? `<div class="r-sub">${esc(r[2])}</div>` : ''}</div><span class="qty">× ${fmt(row.q)}</span></div>
      <div class="r-sub">클릭하면 이 재료의 획득처를 볼 수 있습니다.</div></div>`;
  }
  const extra = [row.tr ? '거래 가능' : '', row.du ? `두캇 ${row.du}` : ''].filter(Boolean).join(' · ');
  return `<div class="comp"><div class="comp-head">${img(row.img, 'thumb')}<div><b>${esc(row.n)}</b>
      <div class="r-sub">${esc(row.e)}${extra ? ' · ' + esc(extra) : ''}</div></div><span class="qty">× ${fmt(row.q)}</span></div>
      ${row.dr ? `<details${row.dr.length <= 6 ? ' open' : ''}><summary>획득처 ${row.dr.length}곳 (${row.dr[0][4] && row.dr[0][4].vt ? '모두 볼트됨' : `추천: ${esc(row.dr[0][0])} ${pct(row.dr[0][1])}`})</summary>${dropsTable(row.dr, { limit: 8 })}</details>`
      : '<div class="r-sub">드랍 정보 없음 — 보통 시장(크레딧 구매), 퀘스트 보상 또는 상인/신디케이트에서 얻습니다. 위키를 참고하세요.</div>'}</div>`;
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
  if (rec.b && !rec.bp && rec.b.l.some((x) => x.dr)) how.push('부품·설계도를 아래 획득처에서 파밍한 뒤 주조소에서 제작');
  if (rec.dr) how.push('아래 획득처에서 직접 드랍');
  if (rec.c === 'relics') how.push(rec.dr ? '아래 미션 보상으로 획득 후 보이드 균열 미션에서 개봉' : '현재 볼트됨 — 거래 또는 프라임 리서전스(Varzia)로만 획득');
  if (how.length) h += `<h2>얻는 방법</h2><ul>${how.map((x) => `<li>${x}</li>`).join('')}</ul>`;

  if (rec.b) {
    h += `<h2>제작 방법 (주조소)</h2>
      <p>크레딧 <b>${fmt(rec.b.cr)}</b> · 제작 시간 <b>${duration(rec.b.tm)}</b>${rec.b.q > 1 ? ` · 1회 제작 시 <b>${rec.b.q}개</b>` : ''}</p>
      ${rec.b.l.map(componentBlock).join('')}
      ${rec.b.l.some((x) => x.id == null && !/Blueprint$/.test(x.e)) ? `<p class="muted">부품(섀시·시스템 등)을 만드는 데 필요한 세부 자원은 이 데이터에 포함되어 있지 않습니다. 위키 링크에서 확인하세요.</p>` : ''}`;
  }

  if (rec.rw) {
    h += `<h2>성유물 보상</h2><table><thead><tr><th>보상</th><th>희귀도</th>${REFINES.map((r) => `<th class="num">${r}</th>`).join('')}</tr></thead><tbody>
      ${rec.rw.map((x) => `<tr><td>${itemLink(x.id, x.n)}</td><td class="rar-${esc(x.r)}">${esc(x.r)}</td>${x.c.map((c) => `<td class="num">${pct(c)}</td>`).join('')}</tr>`).join('')}
      </tbody></table><p class="muted">정제 단계: Intact(기본) → Exceptional(25) → Flawless(50) → Radiant(100 보이드 트레이스)</p>`;
  }

  if (rec.c === 'enemies') {
    h += '<h2>이 적이 떨어뜨리는 아이템</h2>';
    h += rec.ed && rec.ed.length
      ? dropsTable(rec.ed.map((d) => [d[0], d[1], d[2], d[3] && d[3] !== 'Mod Locations' ? d[3] : 0]))
      : '<p class="muted">드랍 정보가 없습니다.</p>';
  } else if (rec.dr || rec.c !== 'relics') {
    h += `<h2>획득처 (드랍 위치)</h2>${dropsTable(rec.dr)}`;
  }

  if (rec.u && rec.u.length) {
    h += `<h2>사용처 (이 재료가 필요한 제작품 ${rec.u.length}개)</h2><p>${rec.u.map((i) => itemLink(i)).join(', ')}</p>`;
  }
  el.innerHTML = h;
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

async function expand(rec, mult, acc, depth = 0) {
  if (!rec.b || depth > 5) {
    acc.direct.push({ rec, q: mult });
    return;
  }
  const times = Math.ceil(mult / (rec.b.q || 1));
  acc.credits += rec.b.cr * times;
  acc.time = Math.max(acc.time, rec.b.tm);
  for (const row of rec.b.l) {
    const need = row.q * times;
    if (row.id != null) {
      const sub = await getRecord(row.id);
      if (sub && EXPAND_CATS.has(sub.c) && sub.b) {
        await expand(sub, need, acc, depth + 1);
      } else {
        acc.res.set(row.id, (acc.res.get(row.id) || 0) + need);
      }
    } else {
      const key = row.e;
      const ex = acc.parts.get(key);
      if (ex) ex.q += need; else acc.parts.set(key, { ...row, q: need });
    }
  }
}

async function renderPlan() {
  const el = $('#view-plan');
  const p = plan();
  if (!p.length) {
    el.innerHTML = `<div class="card"><h2>제작 계획</h2><p>아직 추가된 항목이 없습니다. 검색에서 아이템을 선택하고 <b>제작 계획에 추가</b>를 누르면,
      필요한 크레딧·자원·부품과 각 부품의 파밍 위치를 한눈에 모아 보여드립니다.</p><a class="btn" href="#/">검색으로 가기</a></div>`;
    return;
  }
  el.innerHTML = '<p class="muted">계산 중…</p>';
  const acc = { credits: 0, time: 0, res: new Map(), parts: new Map(), direct: [] };
  const recs = [];
  for (const x of p) {
    const rec = await getRecord(x.id);
    if (!rec) continue;
    recs.push([rec, x.q]);
    await expand(rec, x.q, acc);
  }
  const have = store('wf-have', {});
  const resRows = [...acc.res.entries()].map(([id, q]) => [state.byId.get(id), q]).filter((x) => x[0])
    .sort((a, b) => a[0][1].localeCompare(b[0][1], 'ko'));
  const chk = (key) => `<input type="checkbox" data-have="${esc(key)}" ${have[key] ? 'checked' : ''} title="보유함">`;

  let h = `<div class="plan-grid"><div class="card"><h2>목표 아이템</h2>
    ${recs.map(([r, q]) => `<div class="plan-row">${img(r.img, 'thumb')}<span class="grow">${itemLink(r.id, r.n)}<span class="r-sub">${esc(r.e)}</span></span>
      <input type="number" min="1" value="${q}" data-plan-q="${r.id}"><button class="btn small" data-plan-del="${r.id}">삭제</button></div>`).join('')}
    <p>총 제작 크레딧 <b>${fmt(acc.credits)}</b>${acc.time ? ` · 가장 긴 제작 시간 <b>${duration(acc.time)}</b>` : ''}</p>
    <button class="btn small" data-plan-clear>계획 비우기</button></div>
    <div class="card"><h2>필요 자원 합계</h2>
    ${resRows.length ? `<table><thead><tr><th></th><th>자원</th><th class="num">수량</th></tr></thead><tbody>
      ${resRows.map(([r, q]) => `<tr class="${have['r' + r[0]] ? 'have' : ''}"><td>${chk('r' + r[0])}</td><td>${itemLink(r[0])}</td><td class="num">${fmt(q)}</td></tr>`).join('')}
      </tbody></table><p class="muted">자원을 클릭하면 파밍 위치를 볼 수 있습니다. 체크하면 보유 처리됩니다.</p>` : '<p class="muted">필요 자원 없음</p>'}
    </div></div>`;

  if (acc.parts.size) {
    h += `<div class="card" style="margin-top:16px"><h2>파밍해야 할 부품·설계도</h2>
      <table><thead><tr><th></th><th>부품</th><th class="num">수량</th><th>최고 확률 획득처</th></tr></thead><tbody>
      ${[...acc.parts.values()].map((x) => `<tr class="${have['p' + x.e] ? 'have' : ''}"><td>${chk('p' + x.e)}</td><td>${esc(x.n)}<div class="r-sub">${esc(x.e)}</div></td>
        <td class="num">${fmt(x.q)}</td><td>${x.dr ? x.dr.slice(0, 3).map(dropShort).join('<br>') : '<span class="muted">드랍 정보 없음 (시장/퀘스트 등)</span>'}</td></tr>`).join('')}
      </tbody></table></div>`;
  }
  if (acc.direct.length) {
    h += `<div class="card" style="margin-top:16px"><h2>직접 획득해야 하는 항목</h2>
      <table><thead><tr><th>항목</th><th class="num">수량</th><th>최고 확률 획득처</th></tr></thead><tbody>
      ${acc.direct.map(({ rec, q }) => `<tr><td>${itemLink(rec.id, rec.n)}</td><td class="num">${q}</td>
        <td>${rec.dr ? rec.dr.slice(0, 3).map(dropShort).join('<br>') : '<span class="muted">드랍 정보 없음</span>'}</td></tr>`).join('')}
      </tbody></table></div>`;
  }
  el.innerHTML = h;
}

document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.have !== undefined) {
    const have = store('wf-have', {});
    if (t.checked) have[t.dataset.have] = 1; else delete have[t.dataset.have];
    save('wf-have', have);
    t.closest('tr').classList.toggle('have', t.checked);
  } else if (t.dataset.planQ !== undefined) {
    const p = plan();
    const x = p.find((y) => y.id === Number(t.dataset.planQ));
    if (x) x.q = Math.max(1, parseInt(t.value, 10) || 1);
    save('wf-plan', p);
    renderPlan();
  }
});
document.addEventListener('click', (e) => {
  const del = e.target.closest('[data-plan-del]');
  if (del) {
    save('wf-plan', plan().filter((x) => x.id !== Number(del.dataset.planDel)));
    updatePlanBadge();
    renderPlan();
  } else if (e.target.closest('[data-plan-clear]')) {
    if (confirm('제작 계획을 모두 비울까요?')) {
      save('wf-plan', []);
      save('wf-have', {});
      updatePlanBadge();
      renderPlan();
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
