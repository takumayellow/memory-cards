// deck-screen.js — full-screen deck selection UI
(function () {
  'use strict';

  const BUILTIN = '__builtin__';

  // ── open / close ──────────────────────────────────────
  function openDeckScreen() {
    const screen = document.querySelector('#deck-screen');
    if (!screen) return;
    buildDeckGrid();
    screen.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeDeckScreen() {
    const screen = document.querySelector('#deck-screen');
    if (!screen) return;
    screen.classList.remove('open');
    document.body.style.overflow = '';
  }

  function selectDeck(id) {
    window.DatasetManager.setActiveDeck(id);
    document.dispatchEvent(new CustomEvent('dataset:change'));
    closeDeckScreen();
  }

  // ── build grid ────────────────────────────────────────
  function buildDeckGrid() {
    const grid = document.querySelector('#deck-screen-grid');
    if (!grid || !window.DatasetManager) return;
    const decks = window.DatasetManager.getDecks();
    const activeId = window.DatasetManager.getActiveDeckId();
    grid.innerHTML = '';
    for (const deck of decks) {
      grid.appendChild(buildDeckCard(deck, deck.id === activeId));
    }
  }

  // ── build one deck card ───────────────────────────────
  function buildDeckCard(deck, isActive) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ds-card' + (isActive ? ' ds-card--active' : '');
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');

    const mode = deck.id === BUILTIN
      ? 'image'
      : (window.DatasetManager.getDeckMode?.(deck.id) || 'image');

    // Get sample card data for preview
    let preview = null;
    if (deck.id !== BUILTIN) {
      const cards = window.DatasetManager.getDeckCards?.(deck.id);
      if (cards && cards.length > 0) preview = cards[0];
    }

    // ── Emoji / visual area ──
    const visual = document.createElement('div');
    visual.className = 'ds-card__visual';

    if (deck.id === BUILTIN) {
      visual.textContent = '🎭';
    } else if (mode === 'vocab' && preview?.imageUrl) {
      visual.textContent = preview.imageUrl;
    } else if (mode === 'image') {
      visual.textContent = '🗂️';
    } else {
      visual.textContent = '📖';
    }

    // ── Main word / name ──
    const word = document.createElement('div');
    word.className = 'ds-card__word';
    if (deck.id === BUILTIN) {
      word.textContent = '芸能人カード';
    } else if (mode === 'vocab' && preview?.yomi) {
      word.textContent = preview.yomi;
    } else {
      word.textContent = deck.label;
    }

    // ── Sub-text (meaning or description) ──
    const sub = document.createElement('div');
    sub.className = 'ds-card__sub';
    if (deck.id === BUILTIN) {
      sub.textContent = '日本の芸能人を覚える';
    } else if (mode === 'vocab' && preview?.name) {
      sub.textContent = preview.name;
    } else {
      sub.textContent = deck.cardCount + '枚のカード';
    }

    // ── Footer: deck name + count + mode badge ──
    const footer = document.createElement('div');
    footer.className = 'ds-card__footer';

    const label = document.createElement('span');
    label.className = 'ds-card__label';
    label.textContent = deck.label;

    const badges = document.createElement('span');
    badges.className = 'ds-card__badges';

    if (deck.id !== BUILTIN) {
      const cnt = document.createElement('span');
      cnt.className = 'ds-badge ds-badge--count';
      cnt.textContent = deck.cardCount + '語';
      badges.appendChild(cnt);
    }

    const modeBadge = document.createElement('span');
    modeBadge.className = 'ds-badge ds-badge--mode ds-badge--' + mode;
    modeBadge.textContent = mode === 'vocab' ? 'EN→JA' : '画像';
    badges.appendChild(modeBadge);

    footer.appendChild(label);
    footer.appendChild(badges);

    // ── Active badge ──
    if (isActive) {
      const active = document.createElement('div');
      active.className = 'ds-card__active';
      active.textContent = '学習中';
      btn.appendChild(active);
    }

    btn.appendChild(visual);
    btn.appendChild(word);
    btn.appendChild(sub);
    btn.appendChild(footer);

    btn.addEventListener('click', () => selectDeck(deck.id));
    return btn;
  }

  // ── init ──────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelector('#deck-screen-open-btn')
      ?.addEventListener('click', openDeckScreen);

    document.querySelector('#deck-screen-close-btn')
      ?.addEventListener('click', closeDeckScreen);

    const screen = document.querySelector('#deck-screen');
    if (screen) {
      // Tap backdrop to close
      screen.addEventListener('click', (e) => {
        if (e.target === screen) closeDeckScreen();
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' &&
          document.querySelector('#deck-screen')?.classList.contains('open')) {
        closeDeckScreen();
      }
    });

    document.addEventListener('dataset:change', () => {
      if (document.querySelector('#deck-screen')?.classList.contains('open')) {
        buildDeckGrid();
      }
    });
  });
})();
