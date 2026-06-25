async function fetchText(url){ const r = await fetch(url,{cache:"no-store"}); if(!r.ok) throw new Error(url+" "+r.status); return await r.text(); }
function parseTSV(txt){
  const lines = txt.replace(/^\uFEFF/,'').split(/\r?\n/).filter(Boolean);
  const [h,...rows] = lines;
  const idx = Object.fromEntries(h.split("\t").map((k,i)=>[k.trim(),i]));
  return rows.map(line=>{
    const c=line.split("\t"); return ({
      id:c[idx.id], name:c[idx.name], yomi:c[idx.yomi]||"", category:c[idx.category]||""
    });
  });
}
function parseCSV(txt){
  const lines = txt.replace(/^\uFEFF/,'').split(/\r?\n/).filter(Boolean);
  const [h,...rows] = lines;
  const idx = Object.fromEntries(h.split(",").map((k,i)=>[k.trim(),i]));
  return rows.map(l=>{
    const c = l.split(/,(.*?),(.*?),(.*?),(.*?),(.*?)/).length>1 ? l.match(/(".*?"|[^,]+)/g).map(s=>s.replace(/^"|"$/g,'')) : l.split(",");
    return {
      id: c[idx.id], name:c[idx.name], source:c[idx.source], filename:c[idx.filename],
      license:c[idx.license], artist:c[idx.artist], credit:c[idx.credit]
    };
  });
}
async function loadData(){
  const [tsv, csv, attrJson] = await Promise.all([
    fetchText('data/cards.tsv'),
    fetch('data/attributions.csv',{cache:"no-store"}).then(r=>r.ok?r.text():"id,name,source,filename,license,artist,credit\n"),
    fetch('data/attr_map.json',{cache:"no-store"}).then(r=>r.ok?r.json():{}).catch(()=>({}))
  ]);
  const cards = parseTSV(tsv);
  const attrs = parseCSV(csv);
  const map = Object.assign({}, attrJson); const meta = {};
  for(const a of attrs){ if(a.id && a.filename){ map[a.id]=a.filename; meta[a.id]=a; } }
  return {cards, map, meta};
}

// ── Bad image list (localStorage) ──
const BAD_KEY = 'jpCelebsBadImages_v1';
function loadBadSet(){
  try { return new Set(JSON.parse(localStorage.getItem(BAD_KEY) || '[]')); }
  catch { return new Set(); }
}
function saveBadSet(set){ localStorage.setItem(BAD_KEY, JSON.stringify([...set])); }
function markBad(id){ const s = loadBadSet(); s.add(id); saveBadSet(s); }
function isBad(id){ return loadBadSet().has(id); }

// ── Toast notification ──
function showToast(msg, duration = 2500){
  let t = document.querySelector('#toast');
  if(!t){ t = document.createElement('div'); t.id='toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(()=>t.classList.remove('show'), duration);
}
window.showToast = showToast;

// ── Progress persistence (sessionStorage) ──
const SS_KEY = 'jpCelebsCardId';
function saveProgress(){
  const c = state.filtered[state.i];
  if(c) sessionStorage.setItem(SS_KEY, c.id);
}

// UI
const state = { all:[], filtered:[], i:0, map:{}, meta:{}, srsMode:false };

function imgUrlFor(id){
  const file = state.map[id];
  if (!file) return null;
  if (/^https?:\/\//.test(file)) return file;
  return 'images/' + encodeURIComponent(file);
}
function renderCounters(){
  const total = state.filtered.length;
  document.querySelector('#count-total').textContent = total;
  document.querySelector('#count-rest').textContent = (total - state.i);
}

// Render SRS status badge for the current card.
function renderSrsBadge(cardId) {
  const badge = document.querySelector('#srs-badge');
  if (!badge || !window.SRS) return;
  const entry = window.SRS.getEntry(window.SRS.loadSrs(), cardId);
  if (!entry.lastReview) {
    badge.textContent = '未学習';
    badge.className = 'srs-badge srs-new';
  } else {
    const today = new Date().toISOString().slice(0, 10);
    const overdue = entry.nextReview <= today;
    if (overdue) {
      badge.textContent = `復習期限: ${entry.nextReview}（間隔 ${entry.interval}日）`;
      badge.className = 'srs-badge srs-due';
    } else {
      badge.textContent = `次回: ${entry.nextReview}（間隔 ${entry.interval}日）`;
      badge.className = 'srs-badge srs-ok';
    }
  }
}

// Update the SRS statistics bar.
function renderSrsStats() {
  if (!window.SRS) return;
  const all = state.all;
  const dueCount = window.SRS.countDueToday(all);
  const reviewed = window.SRS.reviewedTodayCount(all);
  const mastery = window.SRS.masteryPercent(all);

  const statsEl = document.querySelector('#srs-stats');
  if (statsEl) {
    statsEl.innerHTML =
      `<span>今日の復習: <strong>${reviewed}</strong>件完了 / 残り <strong>${dueCount}</strong>件</span>` +
      `<span class="srs-mastery">習熟度: <strong>${mastery}%</strong></span>`;
  }

  const barEl = document.querySelector('#srs-progress-bar');
  if (barEl) {
    barEl.style.width = mastery + '%';
    barEl.setAttribute('aria-valuenow', mastery);
  }
}

// ── Bad image button state ──
function updateBadBtn(cardId){
  const btn = document.querySelector('#badImgBtn');
  if(!btn) return;
  const bad = isBad(cardId);
  btn.textContent = bad ? '✓ 報告済み' : '⚠ 画像が不適切';
  btn.disabled = bad;
  btn.classList.toggle('reported', bad);
}

// Image preload cache
const _SESSION_VER = Date.now().toString();
const imgCache = new Map();

function preloadImg(id) {
  if (imgCache.has(id)) return imgCache.get(id);
  const url = imgUrlFor(id);
  if (!url) return Promise.resolve(null);
  const promise = new Promise(resolve => {
    const img = new Image();
    let timer;
    const cleanup = (result) => {
      clearTimeout(timer);
      resolve(result);
    };
    img.onload = () => cleanup(img);
    img.onerror = () => {
      imgCache.delete(id); // 失敗時はキャッシュから削除して再試行可能に
      cleanup(null);
    };
    timer = setTimeout(() => {
      imgCache.delete(id); // タイムアウト時もキャッシュ削除
      cleanup(null);
    }, 20000);
    img.src = url;
  });
  imgCache.set(id, promise);
  return promise;
}

function renderCard(){
  const wrap = document.querySelector('#card'); wrap.innerHTML = '';
  wrap.dataset.flipped = 'false';
  if(state.i >= state.filtered.length){ wrap.textContent = '該当カードがありません'; return; }
  const c = state.filtered[state.i];

  // card-front
  const front = document.createElement('div'); front.className = 'card-front';

  // スケルトンローダー
  const skeleton = document.createElement('div');
  skeleton.className = 'img-skeleton';
  skeleton.innerHTML = '<div class="skeleton-inner"></div>';

  const ph = document.createElement('div'); ph.className='placeholder'; ph.textContent='画像なし'; ph.style.display='none';

  const flipHint = document.createElement('div'); flipHint.className = 'flip-hint'; flipHint.textContent = 'タップして答えを見る ▼';

  front.append(skeleton, ph, flipHint);

  // card-back
  const back = document.createElement('div'); back.className = 'card-back';

  const caption = document.createElement('div'); caption.className='caption';
  caption.innerHTML = `<div class="name">${c.name}</div><div class="yomi">${c.yomi||''}</div><div class="cat">${c.category||''}</div>`;

  const cr = document.createElement('div'); cr.className='credit';
  const a = state.meta[c.id];
  if(a){ cr.innerHTML = `Source: ${a.source} / License: ${a.license||'Unknown'} ${a.artist?(' / © '+a.artist):''}`; }

  back.append(caption, cr);

  wrap.append(front, back);
  renderCounters();
  renderSrsBadge(c.id);
  renderSrsStats();
  updateBadBtn(c.id);
  saveProgress();

  // 画像ロード（キャッシュ使用）
  const cardId = c.id;
  const url = imgUrlFor(cardId);
  if (!url) {
    // custom card with no image
    skeleton.remove();
    ph.style.display = 'block';
  } else {
    preloadImg(cardId).then(img => {
      if (!wrap.isConnected || state.filtered[state.i]?.id !== cardId) return;
      skeleton.remove();
      if (img && img.naturalWidth > 0) {
        img.alt = c.name;
        img.style.opacity = '0';
        img.style.transition = 'opacity 0.3s ease';
        front.insertBefore(img, ph);
        requestAnimationFrame(() => { img.style.opacity = '1'; });
      } else {
        ph.style.display = 'block';
      }
    });
  }

  // 次の2枚をバックグラウンドでプリロード
  for (let offset = 1; offset <= 2; offset++) {
    const next = state.filtered[state.i + offset];
    if (next) preloadImg(next.id);
  }
}

function applyFilter(){
  const q  = document.querySelector('#q').value.trim();
  const cat= document.querySelector('#cat').value;
  const srsOnly = document.querySelector('#srs-filter') && document.querySelector('#srs-filter').checked;
  const norm = s => (s||'').toLowerCase();

  let base = state.all;

  // Apply SRS "今日の復習" filter first.
  if (srsOnly && window.SRS) {
    base = window.SRS.filterDueToday(base);
  }

  state.filtered = base.filter(c=>{
    const okQ = !q || [c.name,c.yomi].some(x=>norm(x).includes(norm(q)));
    const okC = (cat==='__ALL__') || (c.category===cat);
    return okQ && okC;
  });
  state.i = 0;
  renderCard();
}
function populateCategories(cards){
  const sel = document.querySelector('#cat');
  const cats = Array.from(new Set(cards.map(c=>c.category).filter(Boolean))).sort();
  sel.innerHTML = '<option value="__ALL__">すべてのカテゴリ</option>' + cats.map(c=>`<option>${c}</option>`).join('');
}

// SRS answer handlers — called when user presses "わかった" or "あとで".
function srsAnswerOk(cardId) {
  if (!window.SRS) return;
  window.SRS.recordAnswer(cardId, 4); // correct
  renderSrsStats();
}
function srsAnswerAgain(cardId) {
  if (!window.SRS) return;
  window.SRS.recordAnswer(cardId, 1); // wrong
  renderSrsStats();
}

// Initialize
(async ()=>{
  // Determine active deck
  const activeDeckId = window.DatasetManager?.getActiveDeckId() ?? '__builtin__';

  let cards, map, meta;
  if (!window.DatasetManager || activeDeckId === '__builtin__') {
    ({ cards, map, meta } = await loadData());
  } else {
    const customCards = window.DatasetManager.getActiveDeckCards();
    cards = customCards;
    map = Object.fromEntries(customCards.filter(c => c.imageUrl).map(c => [c.id, c.imageUrl]));
    meta = {};
  }
  state.all = cards; state.map = map; state.meta = meta;
  populateCategories(state.all);
  state.filtered = [...cards];

  // ── リロード位置復元 ──
  const savedId = sessionStorage.getItem(SS_KEY);
  if(savedId){
    const idx = state.filtered.findIndex(c => c.id === savedId);
    if(idx >= 0) state.i = idx;
  }
  renderCard();

  // controls
  document.querySelector('#q').addEventListener('input', applyFilter);
  document.querySelector('#cat').addEventListener('change', applyFilter);

  const srsFilterEl = document.querySelector('#srs-filter');
  if (srsFilterEl) srsFilterEl.addEventListener('change', applyFilter);

  document.querySelector('#next').addEventListener('click', ()=>{ if(state.filtered.length > 0){ state.i = (state.i + 1) % state.filtered.length; renderCard(); } });
  document.querySelector('#prev').addEventListener('click', ()=>{ if(state.i>0){ state.i--; renderCard(); } });
  document.querySelector('#shuffle').addEventListener('click', ()=>{
    for(let i=state.filtered.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [state.filtered[i],state.filtered[j]]=[state.filtered[j],state.filtered[i]]; }
    state.i=0; renderCard();
  });
  document.querySelector('#reset').addEventListener('click', ()=>{
    document.querySelector('#q').value='';
    document.querySelector('#cat').value='__ALL__';
    const srsEl = document.querySelector('#srs-filter');
    if (srsEl) srsEl.checked = false;
    if (window.SRS) window.SRS.resetSrs();
    applyFilter();
  });

  // Patch "わかった" / "あとで" buttons in the main card UI (topbar section).
  const okBtn = document.querySelector('#okBtn');
  const againBtn = document.querySelector('#againBtn');
  if (okBtn) {
    okBtn.addEventListener('click', ()=>{
      const c = state.filtered[state.i];
      if (c) srsAnswerOk(c.id);
      if(state.filtered.length > 0){ state.i = (state.i + 1) % state.filtered.length; renderCard(); }
    });
  }
  if (againBtn) {
    againBtn.addEventListener('click', ()=>{
      const c = state.filtered[state.i];
      if (c) srsAnswerAgain(c.id);
      if(state.filtered.length > 0){ state.i = (state.i + 1) % state.filtered.length; renderCard(); }
    });
  }

  // ── 画像が不適切ボタン ──
  const badImgBtn = document.querySelector('#badImgBtn');
  if(badImgBtn){
    badImgBtn.addEventListener('click', ()=>{
      const c = state.filtered[state.i];
      if(!c) return;
      markBad(c.id);
      updateBadBtn(c.id);
      showToast('⚠ 不適切としてマークしました。再スクレイプ時に再取得されます。');
    });
  }

  // ── 不適切リスト書き出しボタン ──
  const exportBadBtn = document.querySelector('#exportBadBtn');
  if(exportBadBtn){
    exportBadBtn.addEventListener('click', ()=>{
      const bad = loadBadSet();
      if(bad.size === 0){ showToast('不適切リストは空です'); return; }
      const lines = ['id', ...[...bad]].join('\n');
      const blob = new Blob([lines], {type:'text/plain;charset=utf-8'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'bad_images.txt'; a.click();
      URL.revokeObjectURL(url);
      showToast(`📋 ${bad.size}件のリストをダウンロードしました`);
    });
  }

  renderSrsStats();

  // ── Card flip handler ──
  document.querySelector('#card').addEventListener('click', () => {
    const card = document.querySelector('#card');
    card.dataset.flipped = card.dataset.flipped === 'true' ? 'false' : 'true';
  });

  // ── Dataset change handler ──
  document.addEventListener('dataset:change', async () => {
    imgCache.clear();
    const deckId = window.DatasetManager?.getActiveDeckId() ?? '__builtin__';
    let cards, map, meta;
    if (deckId === '__builtin__') {
      ({ cards, map, meta } = await loadData());
    } else {
      const customCards = window.DatasetManager.getActiveDeckCards();
      cards = customCards;
      map = Object.fromEntries(customCards.filter(c => c.imageUrl).map(c => [c.id, c.imageUrl]));
      meta = {};
    }
    state.all = cards; state.map = map; state.meta = meta;
    populateCategories(state.all);
    state.filtered = [...state.all];
    state.i = 0;
    document.querySelector('#q').value = '';
    document.querySelector('#cat').value = '__ALL__';
    renderCard();
  });
})();
