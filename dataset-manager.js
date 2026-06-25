// dataset-manager.js — Custom dataset import and deck switching
// Exposes window.DatasetManager

(function () {
  const DECKS_KEY = 'jpCelebsCustomDecks_v1';
  const ACTIVE_KEY = 'jpCelebsActiveDeck_v1';
  const BUILTIN_ID = '__builtin__';

  // ── Storage helpers ──
  function loadDecks() {
    try { return JSON.parse(localStorage.getItem(DECKS_KEY) || '[]'); }
    catch { return []; }
  }
  function saveDecks(decks) {
    localStorage.setItem(DECKS_KEY, JSON.stringify(decks));
  }

  // ── Parsing helpers ──

  function parseTSVCustom(txt) {
    const lines = txt.replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) throw new Error('TSVにデータ行がありません');
    const [headerLine, ...rows] = lines;
    const headers = headerLine.split('\t').map(h => h.trim());
    const idx = Object.fromEntries(headers.map((h, i) => [h, i]));
    if (idx.name === undefined) throw new Error('TSVにnameカラムがありません');

    const cards = rows
      .map((line, i) => {
        const cols = line.split('\t');
        const name = (cols[idx.name] || '').trim();
        if (!name) return null;
        return {
          id: 'custom_' + Date.now() + '_' + i,
          name,
          yomi: (idx.yomi !== undefined ? cols[idx.yomi] : '') || '',
          category: (idx.category !== undefined ? cols[idx.category] : '') || '',
          imageUrl: (idx.imageUrl !== undefined ? cols[idx.imageUrl] : (idx.image !== undefined ? cols[idx.image] : '')) || '',
        };
      })
      .filter(Boolean);

    if (cards.length === 0) throw new Error('有効なカードが0件です（nameが空の行は除外されます）');
    return cards;
  }

  function parseCSVCustom(txt) {
    const lines = txt.replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) throw new Error('CSVにデータ行がありません');

    function splitCSVLine(line) {
      const result = [];
      let cur = '';
      let inQuote = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuote) {
          if (ch === '"') {
            if (line[i + 1] === '"') { cur += '"'; i++; }
            else { inQuote = false; }
          } else {
            cur += ch;
          }
        } else {
          if (ch === '"') { inQuote = true; }
          else if (ch === ',') { result.push(cur); cur = ''; }
          else { cur += ch; }
        }
      }
      result.push(cur);
      return result;
    }

    const headers = splitCSVLine(lines[0]).map(h => h.trim());
    const idx = Object.fromEntries(headers.map((h, i) => [h, i]));
    if (idx.name === undefined) throw new Error('CSVにnameカラムがありません');

    const rows = lines.slice(1);
    const cards = rows
      .map((line, i) => {
        const cols = splitCSVLine(line);
        const name = (cols[idx.name] || '').trim();
        if (!name) return null;
        return {
          id: 'custom_' + Date.now() + '_' + i,
          name,
          yomi: (idx.yomi !== undefined ? cols[idx.yomi] : '') || '',
          category: (idx.category !== undefined ? cols[idx.category] : '') || '',
          imageUrl: (idx.imageUrl !== undefined ? cols[idx.imageUrl] : (idx.image !== undefined ? cols[idx.image] : '')) || '',
        };
      })
      .filter(Boolean);

    if (cards.length === 0) throw new Error('有効なカードが0件です（nameが空の行は除外されます）');
    return cards;
  }

  function parseJSONCustom(txt) {
    let data;
    try { data = JSON.parse(txt); }
    catch (e) { throw new Error('JSONのパースに失敗しました: ' + e.message); }
    if (!Array.isArray(data)) throw new Error('JSONはオブジェクトの配列である必要があります');

    const cards = data
      .map((obj, i) => {
        if (!obj || typeof obj !== 'object') return null;
        const name = (obj.name || '').trim();
        if (!name) return null;
        return {
          id: 'custom_' + Date.now() + '_' + i,
          name,
          yomi: obj.yomi || '',
          category: obj.category || '',
          imageUrl: obj.imageUrl || obj.image || '',
        };
      })
      .filter(Boolean);

    if (cards.length === 0) throw new Error('有効なカードが0件です（nameが空のオブジェクトは除外されます）');
    return cards;
  }

  // ── DatasetManager ──
  window.DatasetManager = {
    getDecks() {
      const customs = loadDecks();
      const builtin = { id: BUILTIN_ID, label: '組み込みデッキ（芸能人）', cardCount: '—' };
      const customEntries = customs.map(d => ({
        id: d.id,
        label: d.label,
        cardCount: d.cards.length,
      }));
      return [builtin, ...customEntries];
    },

    getActiveDeckId() {
      return localStorage.getItem(ACTIVE_KEY) || BUILTIN_ID;
    },

    setActiveDeck(id) {
      localStorage.setItem(ACTIVE_KEY, id);
    },

    getActiveDeckCards() {
      const id = this.getActiveDeckId();
      if (id === BUILTIN_ID) throw new Error('getActiveDeckCards() は組み込みデッキでは使用できません');
      const decks = loadDecks();
      const deck = decks.find(d => d.id === id);
      if (!deck) throw new Error('デッキが見つかりません: ' + id);
      return deck.cards;
    },

    importFromFile(file) {
      return new Promise((resolve, reject) => {
        const ext = file.name.split('.').pop().toLowerCase();
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const txt = e.target.result;
            let cards;
            if (ext === 'tsv') {
              cards = parseTSVCustom(txt);
            } else if (ext === 'csv') {
              cards = parseCSVCustom(txt);
            } else if (ext === 'json') {
              cards = parseJSONCustom(txt);
            } else {
              throw new Error('未対応のファイル形式です（.tsv / .csv / .json）');
            }
            // Use filename (without extension) as label
            const label = file.name.replace(/\.[^.]+$/, '');
            resolve({ label, cards });
          } catch (err) {
            reject(err);
          }
        };
        reader.onerror = () => reject(new Error('ファイルの読み込みに失敗しました'));
        reader.readAsText(file, 'utf-8');
      });
    },

    saveCustomDeck(label, cards) {
      if (!label) throw new Error('ラベルが必要です');
      if (!Array.isArray(cards) || cards.length === 0) throw new Error('カードが空です');
      const decks = loadDecks();
      const id = 'deck_' + Date.now();
      const newDeck = { id, label, cards, createdAt: new Date().toISOString() };
      const updated = [...decks, newDeck];
      saveDecks(updated);
      this.setActiveDeck(id);
      document.dispatchEvent(new CustomEvent('dataset:change'));
      return id;
    },

    deleteCustomDeck(id) {
      if (id === BUILTIN_ID) throw new Error('組み込みデッキは削除できません');
      const decks = loadDecks();
      const updated = decks.filter(d => d.id !== id);
      saveDecks(updated);
    },
  };

  // ── UI wiring ──
  function refreshDeckPicker() {
    const picker = document.querySelector('#deck-picker');
    const deleteBtn = document.querySelector('#deck-delete-btn');
    if (!picker) return;

    const decks = window.DatasetManager.getDecks();
    const activeId = window.DatasetManager.getActiveDeckId();

    picker.innerHTML = decks
      .map(d => `<option value="${d.id}"${d.id === activeId ? ' selected' : ''}>${d.label}${d.id !== BUILTIN_ID ? ' (' + d.cardCount + '枚)' : ''}</option>`)
      .join('');

    if (deleteBtn) {
      deleteBtn.disabled = (activeId === BUILTIN_ID);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    refreshDeckPicker();

    // deck-picker: on change → setActiveDeck + dispatch dataset:change
    const picker = document.querySelector('#deck-picker');
    if (picker) {
      picker.addEventListener('change', () => {
        window.DatasetManager.setActiveDeck(picker.value);
        document.dispatchEvent(new CustomEvent('dataset:change'));
      });
    }

    // deck-import-btn: trigger hidden file input
    const importBtn = document.querySelector('#deck-import-btn');
    const fileInput = document.querySelector('#deck-file-input');
    if (importBtn && fileInput) {
      importBtn.addEventListener('click', () => fileInput.click());
    }

    // deck-file-input: parse file → saveCustomDeck
    if (fileInput) {
      fileInput.addEventListener('change', async () => {
        const file = fileInput.files[0];
        if (!file) return;
        // Reset so the same file can be re-imported
        fileInput.value = '';
        try {
          const { label, cards } = await window.DatasetManager.importFromFile(file);
          window.DatasetManager.saveCustomDeck(label, cards);
          // showToast is defined in app.js (loaded after this file)
          window.showToast?.(`✅ "${label}" を読み込みました（${cards.length}枚）`);
        } catch (err) {
          window.showToast?.('❌ インポート失敗: ' + err.message);
          console.error('Dataset import error:', err);
        }
      });
    }

    // deck-delete-btn: confirm + deleteCustomDeck + switch to builtin
    const deleteBtn = document.querySelector('#deck-delete-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        const activeId = window.DatasetManager.getActiveDeckId();
        if (activeId === BUILTIN_ID) return;
        const decks = window.DatasetManager.getDecks();
        const deck = decks.find(d => d.id === activeId);
        const label = deck ? deck.label : activeId;
        if (!confirm(`「${label}」を削除しますか？`)) return;
        window.DatasetManager.deleteCustomDeck(activeId);
        window.DatasetManager.setActiveDeck(BUILTIN_ID);
        document.dispatchEvent(new CustomEvent('dataset:change'));
        window.showToast?.(`🗑 "${label}" を削除しました`);
      });
    }

    // template-dl-tsv: set href to object URL of TSV template
    const templateLink = document.querySelector('#template-dl-tsv');
    if (templateLink) {
      const tsvContent = 'name\tyomi\tcategory\timageUrl\n山田太郎\tやまだたろう\t俳優\thttps://example.com/image.jpg\n';
      const blob = new Blob([tsvContent], { type: 'text/tab-separated-values;charset=utf-8' });
      templateLink.href = URL.createObjectURL(blob);
    }

    // Refresh picker on dataset:change
    document.addEventListener('dataset:change', refreshDeckPicker);
  });
})();
