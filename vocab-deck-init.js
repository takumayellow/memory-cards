// vocab-deck-init.js — registers the built-in English vocab deck on first run
(function() {
  const VOCAB_LABEL = '英検1級 英単語';

  async function initVocabDeck() {
    if (!window.DatasetManager) return;

    // Skip if already registered
    if (window.DatasetManager.getDecks().some(d => d.label === VOCAB_LABEL)) return;

    try {
      const resp = await fetch('data/eiken1_vocab.json', { cache: 'no-store' });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();

      if (!Array.isArray(data) || data.length === 0) throw new Error('empty data');

      const cards = data.map(w => ({
        id: 'ev_' + (w.word || '').toLowerCase().replace(/[^a-z0-9]/g, '_'),
        name: typeof w.meaning_ja === 'string' ? w.meaning_ja : '',
        yomi: typeof w.word === 'string' ? w.word : '',
        category: typeof w.cefr === 'string' ? w.cefr : 'C1',
        imageUrl: typeof w.emoji === 'string' ? w.emoji : '',
        example: typeof w.example_en === 'string' ? w.example_en : '',
      }));

      if (data.length > 500) throw new Error(`エントリ数が多すぎます: ${data.length}`);

      // Register without activating (activate: false) so active deck doesn't change
      window.DatasetManager.saveCustomDeck(VOCAB_LABEL, cards, 'vocab', { activate: false });

      // Refresh the picker via the shared DatasetManager helper
      window.DatasetManager.refreshDeckPicker?.();
    } catch (e) {
      console.warn('[vocab-deck-init] 英単語デッキの読み込みをスキップ:', e.message);
    }
  }

  document.addEventListener('DOMContentLoaded', initVocabDeck);
})();
