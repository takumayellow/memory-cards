// vocab-deck-init.js — registers / syncs the built-in English vocab sets.
//
// マニフェスト(eiken1_vocab_sets.json)に列挙された各セットを、ラベルをキーに
// 取り込む。各セットは任意で content 版数 `rev` を持つ:
//   - 保存済みデッキが無い            → 取り込む（新規）
//   - 保存済みの rev とマニフェストの rev が違う → 再取得して **同じ id のまま**
//     cards を差し替える（絵文字追加など組み込みデータの更新を反映）
//   - rev が一致                       → 取得もせずスキップ
// これにより「ラベル未登録のみ取り込み」だった旧実装では届かなかった
// 組み込みデッキのデータ更新が、SRS 進捗・選択状態を壊さずに伝播する。
(function () {
  'use strict';

  const MANIFEST = 'data/eiken1_vocab_sets.json';

  async function initVocabDecks() {
    if (!window.DatasetManager) return;

    const v = window.APP_VERSION || '1';

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

    // 保存済みデッキを label → {rev} で引けるようにする。
    const stored = new Map(
      (window.DatasetManager.listRawDecks?.() || []).map(d => [d.label, d])
    );

    let newCount = 0;
    let updatedCount = 0;

    // localStorage の競合を避けるため逐次処理。
    for (const s of sets) {
      const rev = Number.isFinite(s.rev) ? s.rev : 1;
      const existing = stored.get(s.label);
      // rev 一致なら取得不要（最頻ケース）。
      if (existing && (existing.rev ?? 0) === rev) continue;

      try {
        const r = await fetch(s.file + '?v=' + v, { cache: 'no-store' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const data = await r.json();

        if (!Array.isArray(data) || data.length === 0) throw new Error('empty');
        if (data.length > 200) throw new Error('too large: ' + data.length);

        const cards = data.map((w, i) => ({
          // id は SRS 進捗のキー。欠落時に共有 sentinel を使うと別カードが
          // 衝突するため、ラベル+位置で一意なフォールバックを与える。
          id: typeof w.id === 'string' && w.id ? w.id : 'ev_' + s.label + '_' + i,
          name: typeof w.name === 'string' ? w.name : '',
          yomi: typeof w.yomi === 'string' ? w.yomi : '',
          category: typeof w.category === 'string' ? w.category : 'C1',
          imageUrl: typeof w.imageUrl === 'string' ? w.imageUrl : '',
          example: typeof w.example === 'string' ? w.example : '',
        }));

        const { created } = window.DatasetManager.upsertBuiltinDeck(s.label, cards, 'vocab', rev);
        if (created) newCount++; else updatedCount++;
      } catch (e) {
        console.warn('[vocab-init] スキップ:', s.label, e.message);
      }
    }

    if (newCount === 0 && updatedCount === 0) return;

    window.DatasetManager.refreshDeckPicker?.();

    // 新規追加があったときだけ発見性ヒント（更新だけの再訪では出さない）。
    if (newCount > 0) {
      const bar = document.querySelector('.deck-bar');
      if (bar) {
        bar.classList.add('deck-bar--highlight');
        setTimeout(() => bar.classList.remove('deck-bar--highlight'), 4000);
      }
      const totalWords = newCount * 100;
      setTimeout(() => {
        window.showToast?.(
          `✨ 英単語デッキ ${newCount}セット（約${totalWords}語）を追加しました！「デッキ」セレクタから選べます`,
          6000
        );
      }, 800);
    } else if (updatedCount > 0) {
      setTimeout(() => {
        window.showToast?.(`🔄 英単語デッキ ${updatedCount}セットを最新版に更新しました`, 4000);
      }, 800);
    }
  }

  document.addEventListener('DOMContentLoaded', initVocabDecks);
})();
