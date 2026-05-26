// Anime gallery — loads data/anime.tsv and renders a filterable grid.
(async function () {
  const TSV_URL = 'data/anime.tsv';
  const IMG_DIR = 'images/anime/';

  const $ = (s) => document.querySelector(s);
  const grid = $('#grid');
  const chipsBox = $('#chips');
  const qInput = $('#q');
  const countEl = $('#count');
  const modal = $('#modal');
  const modalBody = $('#modalBody');
  const modalClose = $('#modalClose');

  // --- load TSV ---
  let rows = [];
  try {
    const text = await (await fetch(TSV_URL, { cache: 'no-store' })).text();
    const lines = text.trim().split('\n');
    const head = lines[0].split('\t');
    const idx = (n) => head.indexOf(n);
    const I = { id: idx('id'), en: idx('title_en'), jp: idx('title_jp'),
                cat: idx('category'), aw: idx('aniwatch_url'),
                mal: idx('mal_url'), w: idx('watch_url'),
                wp: idx('watch_provider') };
    const get = (c, i) => (i >= 0 ? (c[i] || '') : '');
    rows = lines.slice(1).map((line) => {
      const c = line.split('\t');
      return {
        id: c[I.id],
        en: get(c, I.en),
        jp: get(c, I.jp) || get(c, I.en),
        cat: get(c, I.cat) || '未分類',
        aniwatch: get(c, I.aw),
        mal: get(c, I.mal),
        watch: get(c, I.w),
        watchProvider: get(c, I.wp),
      };
    });
  } catch (e) {
    grid.innerHTML = `<div style="padding:30px;color:#c33">データ読み込みに失敗: ${e}</div>`;
    return;
  }

  // --- categories ---
  const cats = [...new Set(rows.map((r) => r.cat))];
  let activeCat = '';
  let query = '';

  const renderChips = () => {
    chipsBox.innerHTML = '';
    const mkChip = (label, value) => {
      const el = document.createElement('button');
      el.className = 'chip' + (activeCat === value ? ' active' : '');
      el.textContent = label;
      el.onclick = () => { activeCat = value; render(); };
      return el;
    };
    chipsBox.appendChild(mkChip(`すべて (${rows.length})`, ''));
    for (const c of cats) {
      const n = rows.filter((r) => r.cat === c).length;
      chipsBox.appendChild(mkChip(`${c} (${n})`, c));
    }
  };

  const escapeHtml = (s) =>
    s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const initial = (s) => {
    const ch = (s || '').trim().charAt(0).toUpperCase();
    return /[A-Z0-9]/.test(ch) ? ch : '✦';
  };

  const card = (r) => {
    const el = document.createElement('article');
    el.className = 'card';
    el.innerHTML = `
      <div class="thumb" data-id="${r.id}">
        <img loading="lazy" alt="" src="${IMG_DIR}${r.id}.jpg"
             onerror="this.style.display='none';this.parentNode.dataset.fallback='1';">
        <span class="fallback" style="display:none">${escapeHtml(initial(r.en))}</span>
      </div>
      <div class="meta">
        <div class="title-jp">${escapeHtml(r.jp || r.en)}</div>
        <div class="title-en">${escapeHtml(r.en)}</div>
        <span class="badge">${escapeHtml(r.cat)}</span>
      </div>`;
    // image fallback
    const img = el.querySelector('img');
    const fb = el.querySelector('.fallback');
    img.addEventListener('error', () => { img.remove(); fb.style.display = 'block'; });
    el.onclick = () => openModal(r);
    return el;
  };

  const openModal = (r) => {
    const q = encodeURIComponent(r.en || r.jp);
    const malFallback = `https://myanimelist.net/anime.php?q=${q}&cat=anime`;
    const malPage = r.mal || malFallback;
    const links = [];
    if (r.watch && r.watchProvider) {
      links.push(`<a href="${r.watch}" target="_blank" rel="noopener noreferrer">${escapeHtml(r.watchProvider)} で見る</a>`);
    }
    if (r.aniwatch) {
      links.push(`<a class="alt" href="${r.aniwatch}" target="_blank" rel="noopener noreferrer">aniwatch</a>`);
    }
    links.push(`<a class="alt" href="${malPage}" target="_blank" rel="noopener noreferrer">MAL 情報</a>`);
    modalBody.innerHTML = `
      <h2>${escapeHtml(r.jp || r.en)}</h2>
      <div class="en">${escapeHtml(r.en)}</div>
      <div class="cat"><span class="badge">${escapeHtml(r.cat)}</span></div>
      <div class="actions">${links.join('\n        ')}</div>`;
    modal.hidden = false;
  };
  modalClose.onclick = () => { modal.hidden = true; };
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.hidden = true; });

  const render = () => {
    renderChips();
    const q = query.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (activeCat && r.cat !== activeCat) return false;
      if (!q) return true;
      return (r.en + ' ' + r.jp).toLowerCase().includes(q);
    });
    grid.innerHTML = '';
    for (const r of filtered) grid.appendChild(card(r));
    countEl.textContent = `${filtered.length} / ${rows.length} 件`;
  };

  qInput.addEventListener('input', (e) => { query = e.target.value; render(); });
  render();
})();
