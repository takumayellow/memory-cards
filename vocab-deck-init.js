// vocab-deck-init.js — registers all built-in English vocab sets on first run
(function () {
  'use strict';

  const MANIFEST = 'data/eiken1_vocab_sets.json';

  async function initVocabDecks() {
    if (!window.DatasetManager) return;

    const v = window.APP_VERSION || '1';

    // Fetch manifest listing all sets
    let sets;
    try {
      const r = await fetch(MANIFEST + '?v=' + v, { cache: 'no-store' });
      if (!r.ok) throw new Error('manifest HTTP ' + r.status);
      sets = await r.json();
      if (!Array.isArray(sets) || sets.length === 0) throw new Error('empty manifest');
    } catch (e) {
      console.warn('[vocab-init] マニフェスト読み込み失敗:', e.message);
      return;
    }

    // Only fetch sets that are not yet registered
    const existingLabels = new Set(window.DatasetManager.getDecks().map(d => d.label));
    const newSets = sets.filter(s => !existingLabels.has(s.label));
    if (newSets.length === 0) return;

    let registeredCount = 0;

    // Register sequentially to avoid localStorage race conditions
    for (const s of newSets) {
      try {
        const r = await fetch(s.file + '?v=' + v, { cache: 'no-store' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const data = await r.json();

        if (!Array.isArray(data) || data.length === 0) throw new Error('empty');
        if (data.length > 200) throw new Error('too large: ' + data.length);

        const cards = data.map(w => ({
          id: typeof w.id === 'string' ? w.id : 'ev_unknown',
          name: typeof w.name === 'string' ? w.name : '',
          yomi: typeof w.yomi === 'string' ? w.yomi : '',
          category: typeof w.category === 'string' ? w.category : 'C1',
          imageUrl: typeof w.imageUrl === 'string' ? w.imageUrl : '',
          example: typeof w.example === 'string' ? w.example : '',
        }));

        window.DatasetManager.saveCustomDeck(s.label, cards, 'vocab', { activate: false });
        registeredCount++;
      } catch (e) {
        console.warn('[vocab-init] スキップ:', s.label, e.message);
      }
    }

    if (registeredCount === 0) return;

    window.DatasetManager.refreshDeckPicker?.();

    // Discoverability hint (deck bar pulse + toast)
    const bar = document.querySelector('.deck-bar');
    if (bar) {
      bar.classList.add('deck-bar--highlight');
      setTimeout(() => bar.classList.remove('deck-bar--highlight'), 4000);
    }
    const totalWords = registeredCount * 100;
    setTimeout(() => {
      window.showToast?.(
        `✨ 英検1級 英単語 ${registeredCount}セット（約${totalWords}語）を追加しました！「デッキ」セレクタから選べます`,
        6000
      );
    }, 800);
  }

  document.addEventListener('DOMContentLoaded', initVocabDecks);
})();
