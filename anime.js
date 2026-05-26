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
    rows = text.trim().split('\n').slice(1).map((line) => {
      const [id, en, jp, cat] = line.split('\t');
      return { id, en: en || '', jp: jp || en || '', cat: cat || '未分類' };
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
    const aniwatch = `https://aniwatchtv.to/search?keyword=${encodeURIComponent(r.en || r.jp)}`;
    const anilist = `https://anilist.co/search/anime?search=${encodeURIComponent(r.en || r.jp)}`;
    modalBody.innerHTML = `
      <h2>${escapeHtml(r.jp || r.en)}</h2>
      <div class="en">${escapeHtml(r.en)}</div>
      <div class="cat"><span class="badge">${escapeHtml(r.cat)}</span></div>
      <div class="actions">
        <a href="${aniwatch}" target="_blank" rel="noopener noreferrer">aniwatch で開く</a>
        <a class="alt" href="${anilist}" target="_blank" rel="noopener noreferrer">AniList で検索</a>
      </div>`;
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
