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
  const [tsv, csv] = await Promise.all([
    fetchText('data/cards.tsv'),
    fetch('data/attributions.csv',{cache:"no-store"}).then(r=>r.ok?r.text():"id,name,source,filename,license,artist,credit\n")
  ]);
  const cards = parseTSV(tsv);
  const attrs = parseCSV(csv);
  const map = {}; const meta = {};
  for(const a of attrs){ if(a.id && a.filename){ map[a.id]=a.filename; meta[a.id]=a; } }
  return {cards, map, meta};
}

// UI
const state = { all:[], filtered:[], i:0, map:{}, meta:{}, srsMode:false };

function imgUrlFor(id){
  const file = state.map[id] || (id + '.jpg');
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

// Image preload cache
const imgCache = new Map();

function preloadImg(id) {
  if (imgCache.has(id)) return imgCache.get(id);
  const promise = new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    setTimeout(() => resolve(img), 20000); // 20s fallback
    img.src = imgUrlFor(id);
  });
  imgCache.set(id, promise);
  return promise;
}

function renderCard(){
  const wrap = document.querySelector('#card'); wrap.innerHTML = '';
  if(state.i >= state.filtered.length){ wrap.textContent = '該当カードがありません'; return; }
  const c = state.filtered[state.i];

  // スケルトンローダー
  const skeleton = document.createElement('div');
  skeleton.className = 'img-skeleton';
  skeleton.innerHTML = '<div class="skeleton-inner"></div>';

  const ph = document.createElement('div'); ph.className='placeholder'; ph.textContent='画像なし'; ph.style.display='none';

  const caption = document.createElement('div'); caption.className='caption';
  caption.innerHTML = `<div class="name">${c.name}</div><div class="yomi">${c.yomi||''}</div><div class="cat">${c.category||''}</div>`;

  const cr = document.createElement('div'); cr.className='credit';
  const a = state.meta[c.id];
  if(a){ cr.innerHTML = `Source: ${a.source} / License: ${a.license||'Unknown'} ${a.artist?(' / © '+a.artist):''}`; }

  wrap.append(skeleton, ph, caption, cr);
  renderCounters();
  renderSrsBadge(c.id);
  renderSrsStats();

  // 画像ロード（キャッシュ使用）
  const cardId = c.id;
  preloadImg(cardId).then(img => {
    if (!wrap.isConnected || state.filtered[state.i]?.id !== cardId) return;
    skeleton.remove();
    if (img && img.naturalWidth > 0) {
      img.alt = c.name;
      img.style.opacity = '0';
      img.style.transition = 'opacity 0.3s ease';
      wrap.insertBefore(img, ph);
      requestAnimationFrame(() => { img.style.opacity = '1'; });
    } else {
      ph.style.display = 'block';
    }
  });

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
  const {cards, map, meta} = await loadData();
  state.all = cards; state.map = map; state.meta = meta;
  populateCategories(cards);
  state.filtered = [...cards];
  renderCard();

  // controls
  document.querySelector('#q').addEventListener('input', applyFilter);
  document.querySelector('#cat').addEventListener('change', applyFilter);

  const srsFilterEl = document.querySelector('#srs-filter');
  if (srsFilterEl) srsFilterEl.addEventListener('change', applyFilter);

  document.querySelector('#next').addEventListener('click', ()=>{ if(state.i<state.filtered.length-1){ state.i++; renderCard(); } });
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
      if (state.i < state.filtered.length - 1) { state.i++; renderCard(); }
    });
  }
  if (againBtn) {
    againBtn.addEventListener('click', ()=>{
      const c = state.filtered[state.i];
      if (c) srsAnswerAgain(c.id);
      if (state.i < state.filtered.length - 1) { state.i++; renderCard(); }
    });
  }

  renderSrsStats();
})();

// === images-patch: auto url fix + cache bust ===
(function(){
  function absBase(){ // GitHub Pages配下でも正しく基底を作る
    const p = location.pathname.endsWith('/') ? location.pathname : location.pathname.replace(/\/[^/]*$/, '/');
    return location.origin + p;
  }
  function bust(u){ return u + (u.includes('?') ? '&' : '?') + 'v=' + Date.now(); }

  function fixImg(img){
    const s = img.getAttribute('src');
    if(!s) return;
    if(!/^https?:\/\//.test(s)){
      const abs = new URL(s, absBase()).href;
      img.src = bust(abs);
    }else if(!/[\?&]v=/.test(s)){
      img.src = bust(s);
    }
  }
  function scan(){ document.querySelectorAll('img').forEach(fixImg); }

  const mo = new MutationObserver(muts=>{
    for(const m of muts){
      if(m.type==='childList'){
        m.addedNodes.forEach(n=>{
          if(n.nodeType===1){
            if(n.tagName==='IMG') fixImg(n);
            n.querySelectorAll && n.querySelectorAll('img').forEach(fixImg);
          }
        });
      }else if(m.type==='attributes' && m.target.tagName==='IMG' && m.attributeName==='src'){
        fixImg(m.target);
      }
    }
  });

  window.addEventListener('DOMContentLoaded', scan);
  mo.observe(document.documentElement, {childList:true,subtree:true,attributes:true,attributeFilter:['src']});
})();


/* === images patch: auto url fix + cache bust + fallback === */
(async function(){
  const bust = Date.now().toString(36);
  const BASE = location.pathname.replace(/\/[^\/]*$/, "/");   // 例: /jp-celebs-cards/
  const IMG_PREFIX = BASE + "images/";
  let map = {};
  try {
    map = await fetch(BASE + "data/attr_map.json?" + bust).then(r => r.json());
  } catch(e){ map = {}; }

  function fileFor(id){
    const key = String(id);
    return map[key] || (key + ".jpg");
  }
  function setImg(id){
    const img  = document.getElementById("face");
    const noim = document.getElementById("noimg");
    if(!img) return;

    const main = fileFor(id);
    let triedPng = false;

    function onerr(){
      if(!triedPng && /\.jpg$/i.test(main)){
        triedPng = true;
        img.src = IMG_PREFIX + String(id) + ".png?" + bust;
      }else{
        noim && noim.classList.add("show");
      }
    }

    img.onload  = () => noim && noim.classList.remove("show");
    img.onerror = onerr;
    img.decoding = "async";
    img.loading  = "lazy";
    img.src = IMG_PREFIX + main + "?" + bust;
  }

  // 外から使えるようにフックを置く
  window.images = { setImg, fileFor, map };

  // 既存データから id を拾って一発表示（なければ何もしない）
  const id = (window.current?.id ?? window.row?.id ?? window.deck?.[0]?.id);
  if(id != null) setImg(id);
})();


/* === images patch v2: rows-aware === */
(function(){
  const bust = Date.now().toString(36);
  const BASE = location.pathname.replace(/\/[^\/]*$/, "/");   // 例: /jp-celebs-cards/
  const IMG_PREFIX = BASE + "images/";
  const img  = document.getElementById("face");
  const noim = document.getElementById("noimg");

  async function loadMap(){
    try { return await fetch(BASE + "data/attr_map.json?" + bust).then(r=>r.json()); }
    catch(e){ return {}; }
  }
  function pickId(){
    return (window.rows?.[0]?.id ?? window.current?.id ?? window.row?.id ?? window.deck?.[0]?.id ?? null);
  }
  function setImgById(id,map){
    if(!img || id==null) return;
    const key = String(id);
    const main = (map[key] || (key + ".jpg"));
    let triedPng = false;
    function onerr(){
      if(!triedPng && /\.jpg$/i.test(main)){
        triedPng = true;
        img.src = IMG_PREFIX + (key + ".png") + "?" + bust;
      }else{
        noim && noim.classList.add("show");
      }
    }
    img.onerror = onerr;
    img.onload  = ()=> noim && noim.classList.remove("show");
    img.decoding = "async";
    img.loading  = "lazy";
    img.src = IMG_PREFIX + main + "?" + bust;
  }

  window.bootImages = async function(){
    const map = await loadMap();
    const id  = pickId();
    console.log("[boot-images] rows=", window.rows?.length ?? 0, "id=", id);
    setImgById(id, map);
  };

  window.addEventListener("DOMContentLoaded", ()=> bootImages());
})();


/* === images patch: url fix + cache bust === */
(function(){
  const version = (new URL(location.href)).searchParams.get("v") || Date.now().toString();
  let __map = null;

  function pickId(el){
    return (el.dataset && (el.dataset.id || el.dataset.srcId)) ||
           el.getAttribute('data-id') || el.getAttribute('data-src-id') ||
           el.getAttribute('alt') || '';
  }

  function urlFor(id){
    const fn = (__map && __map[id]) ? __map[id] : (id + '.jpg');
    return `images/${fn}?v=${version}`;
  }

  function fixImg(el){
    const id = String(pickId(el) || '').trim();
    if(!id) return;
    el.src = urlFor(id);
    el.onerror = ()=>{
      const cur = el.src;
      if(/\.(jpg)(\?|$)/i.test(cur)){ el.onerror=null; el.src = cur.replace(/\.jpg/i,'.png'); return; }
      if(/\.(png)(\?|$)/i.test(cur)){ el.onerror=null; el.src = cur.replace(/\.png/i,'.jpg'); return; }
      el.onerror=null;
    };
  }

  function scan(root=document){
    if(!root.querySelectorAll) return;
    root.querySelectorAll('img').forEach(fixImg);
  }

  function boot(){
    scan(document);
    const mo = new MutationObserver(muts=>{
      muts.forEach(m=>{
        m.addedNodes.forEach(n=>{
          if(n.nodeType!==1) return;
          if(n.tagName==='IMG') fixImg(n);
          n.querySelectorAll && n.querySelectorAll('img').forEach(fixImg);
        });
        if(m.type==='attributes' && m.target?.tagName==='IMG' && m.attributeName==='src'){ fixImg(m.target); }
      });
    });
    mo.observe(document.documentElement, {childList:true,subtree:true,attributes:true,attributeFilter:['src']});
  }

  fetch(`data/attr_map.json?v=${version}`).then(r=>r.ok?r.json():{}).then(j=>{
    __map = j || {};
    if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded', boot); }
    else{ boot(); }
  }).catch(()=>{ boot(); });
})();


// === images patch: url fix + cache-bust ===
(() => {
  const repo = '/jp-celebs-cards';
  const version = new URLSearchParams(location.search).get('v') || Date.now().toString();
  const bust = (u) => u + (u.includes('?') ? '&' : '?') + 'v=' + version;

  function fixUrl(u) {
    if (!u) return u;
    // すでに http(s) or リポジトリパスならそのまま
    if (/^https?:\/\//i.test(u) || u.startsWith(repo + '/')) return bust(u);
    // 先頭にリポジトリパスを付与
    if (u.startsWith('/')) return bust(repo + u);
    return bust(repo + '/' + u);
  }

  function fixImg(img) {
    const src = img.getAttribute('src') || img.dataset?.src;
    if (src) img.src = fixUrl(src);
  }

  function scan() {
    document.querySelectorAll('img').forEach(fixImg);
  }

  // 既存・追加・src 変更を監視
  new MutationObserver((mut) => {
    for (const m of mut) {
      if (m.type === 'attributes' && m.target.tagName === 'IMG' && m.attributeName === 'src') fixImg(m.target);
      for (const n of m.addedNodes || []) {
        if (n.tagName === 'IMG') fixImg(n);
        n.querySelectorAll?.('img').forEach(fixImg);
      }
    }
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });

  window.addEventListener('DOMContentLoaded', scan);
  scan();
})();


/* === images patch: id->filename + cache-bust === */
(function(){
  const ver = (new URL(location.href)).searchParams.get('v') || Date.now().toString(36);
  let MAP = {};

  function fixImg(img){
    try{
      const url  = new URL(img.src || '', location.href);
      const base = (url.pathname.split('/').pop() || '').replace(/\?.*$/,''); // 現在のファイル名(拡張子なし想定)
      // id とみなして、マップか、なければ .jpg を仮定して差し替え
      if(!/\.(png|jpe?g)$/i.test(base)){
        const id   = base || (img.dataset && img.dataset.id) || '';
        if(!id) return;
        const file = MAP[id] || (id + '.jpg');
        img.src = `images/${file}?v=${ver}`;
      }else{
        // 既に拡張子付きなら cache-bust だけ付与
        if(!/[?&]v=/.test(url.search)) img.src = url.pathname + `?v=${ver}`;
      }
    }catch(e){}
  }

  function boot(){
    document.querySelectorAll('img').forEach(fixImg);
    const mo = new MutationObserver(ms => {
      ms.forEach(m => {
        m.addedNodes.forEach(n => {
          if(n.nodeType===1 && n.tagName==='IMG') fixImg(n);
          if(n.nodeType===1 && n.querySelectorAll) n.querySelectorAll('img').forEach(fixImg);
        });
        if(m.type==='attributes' && m.target.tagName==='IMG' && m.attributeName==='src') fixImg(m.target);
      });
    });
    mo.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['src']});
  }

  fetch('data/attr_map.json?v='+ver).then(r => r.ok ? r.json() : ({})).then(j => {
    MAP = j || {};
    if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded', boot); } else { boot(); }
  }).catch(()=>boot());
})();


// <images-patch v1>
// id->filename を解決（attr_map.json の値を優先、なければ id.jpg）
window.fileNameById = (id) => {
  try {
    const m = (window.__map||{});
    const fn = m[id] || (id + '.jpg');
    return 'images/' + fn;
  } catch(e){ return 'images/' + id + '.jpg'; }
};
// 画像要素に拡張子フォールバック（.jpg が 404なら .png を試す）
window.applyImgFallback = (img) => {
  if(!img || img.dataset.fallbackDone) return;
  img.addEventListener('error', () => {
    if(img.src.endsWith('.jpg')){
      img.src = img.src.replace(/\.jpg(\?.*)?$/, '.png');
    }
    img.dataset.fallbackDone = '1';
  }, { once:true });
};
// DOM 監視：src が id だけの <img data-id="0001"> を変換
new MutationObserver(muts=>{
  muts.forEach(m=>{
    m.target.querySelectorAll?.('img[data-id]').forEach(img=>{
      const id = img.getAttribute('data-id');
      if(id && !img.dataset.mapped){
        const u = window.fileNameById(id) + '?v=' + (window.__ver||Date.now());
        img.src = u; img.dataset.mapped='1'; window.applyImgFallback(img);
      }
    });
  });
}).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['src']});
document.addEventListener('DOMContentLoaded', ()=>{
  document.querySelectorAll('img[data-id]').forEach(img=>{
    const id = img.getAttribute('data-id');
    if(id){ img.src = window.fileNameById(id) + '?v=' + (window.__ver||Date.now()); window.applyImgFallback(img); }
  });
});

