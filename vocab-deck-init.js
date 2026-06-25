// vocab-deck-init.js — registers the built-in English vocab deck on first run
(function() {
  const VOCAB_LABEL = '英検1級 英単語';
  const HINT_KEY = 'vocabDeckHintDismissed_v1';

  // 英単語デッキの存在をユーザーに気づかせる一回限りのヒント。
  // 既定デッキ（芸能人）は一切変えず、デッキピッカーの場所を指すだけ。
  function showDiscoverabilityHint() {
    if (localStorage.getItem(HINT_KEY)) return;
    const deckBar = document.querySelector('.deck-bar');
    if (!deckBar || document.querySelector('#vocab-deck-hint')) return;

    const hint = document.createElement('div');
    hint.id = 'vocab-deck-hint';
    hint.className = 'vocab-deck-hint';
    hint.setAttribute('role', 'status');

    const text = document.createElement('span');
    text.className = 'vocab-deck-hint-text';
    text.textContent = '💡 新しく「英検1級 英単語」デッキを追加しました。上の「デッキ」から選ぶと英単語クイズ（英→日・絵カード付き）が始まります。';

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'vocab-deck-hint-close';
    close.setAttribute('aria-label', 'ヒントを閉じる');
    close.textContent = '×';
    close.addEventListener('click', () => {
      localStorage.setItem(HINT_KEY, '1');
      hint.remove();
    });

    hint.appendChild(text);
    hint.appendChild(close);
    deckBar.appendChild(hint);

    // ピッカー自体も一度だけ軽く強調して視線を誘導（既存の transition は復元）
    const picker = document.querySelector('#deck-picker');
    if (picker) {
      const prevTransition = picker.style.transition;
      picker.style.transition = 'box-shadow 0.4s ease';
      picker.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.45)';
      setTimeout(() => {
        picker.style.boxShadow = '';
        picker.style.transition = prevTransition;
      }, 2200);
    }
  }

  async function initVocabDeck() {
    if (!window.DatasetManager) return;

    // Skip registration if already present, but still surface the hint
    if (window.DatasetManager.getDecks().some(d => d.label === VOCAB_LABEL)) {
      showDiscoverabilityHint();
      return;
    }

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

      // 新デッキを追加できたので存在を知らせる
      showDiscoverabilityHint();
    } catch (e) {
      console.warn('[vocab-deck-init] 英単語デッキの読み込みをスキップ:', e.message);
    }
  }

  document.addEventListener('DOMContentLoaded', initVocabDeck);
})();
