// deck-difficulty.js — 英単語デッキを「ステージ番号 + 難易度帯」に解釈するヘルパ。
//
// 背景: 英検1級 英単語デッキは 100 語ずつ Vol.1〜25 に分割されている。
// デッキ選択画面で「最初の単語」を出していたため、何を基準に分かれているのか
// 分からなかった。各 Vol を「ステージ N」として扱い、5 段階の難易度帯
// （入門→達人）に割り当てて、アイコン・難易度メーターで一目で分かるようにする。
//
// 難易度帯は Vol 番号（= 進行順のステージ）を 5 つに区切ったもの。
// ラベルから "Vol.N" を取り出せないデッキ（ユーザー作成の任意 vocab 等）には
// null を返し、呼び出し側は従来表示にフォールバックする。
(function () {
  'use strict';

  // 5 段階。max = その帯に含まれる最大ステージ番号（昇順・境界は max 以下）。
  const TIERS = [
    { max: 5,   name: '入門', icon: '🌱', cls: 'beginner' },
    { max: 10,  name: '初級', icon: '🔰', cls: 'easy' },
    { max: 15,  name: '中級', icon: '⭐', cls: 'medium' },
    { max: 20,  name: '上級', icon: '🔥', cls: 'hard' },
    // 末尾の catch-all（max: Infinity）。常に配列の最後に置くこと。
    { max: Infinity, name: '達人', icon: '👑', cls: 'expert' },
  ];

  const TOTAL_LEVELS = TIERS.length; // 難易度メーターのドット総数

  // ラベル例: "英検1級 英単語 Vol.1" / "... Vol. 12" → ステージ番号
  function parseStage(label) {
    if (typeof label !== 'string') return null;
    const m = label.match(/Vol\.?\s*(\d+)/i);
    if (!m) return null;
    const stage = parseInt(m[1], 10);
    // 1..100 を妥当なステージ番号とする（"Vol.9999" 等の異常表示を防ぐ）。
    return Number.isFinite(stage) && stage > 0 && stage <= 100 ? stage : null;
  }

  // → { stage, tier, icon, cls, level, totalLevels, isC2 } または null
  function getStageInfo(label) {
    const stage = parseStage(label);
    if (stage === null) return null;

    // C2 シリーズ（"... C2単語 Vol.N"）は CEFR 最上位。C1 の進行(1〜25)とは別系列で、
    // 常に最難関ティア（💎）として表示する。Vol 番号は C2 系列内のステージ番号。
    if (/C2/i.test(label)) {
      return {
        stage,
        tier: 'C2',
        icon: '💎',
        cls: 'c2',
        level: TOTAL_LEVELS,   // メーター満点（最難関）
        totalLevels: TOTAL_LEVELS,
        isC2: true,
      };
    }

    const idx = TIERS.findIndex((t) => stage <= t.max);
    const tier = TIERS[idx];
    return {
      stage,
      tier: tier.name,
      icon: tier.icon,
      cls: tier.cls,
      level: idx + 1,          // 1..5（難易度メーターの点灯数）
      totalLevels: TOTAL_LEVELS,
      isC2: false,
    };
  }

  window.DeckDifficulty = { getStageInfo };
})();
