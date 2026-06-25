// deck-screen.js — full-screen deck selection UI
(function () {
  'use strict';

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

  function buildDeckCard(deck, isActive) {
    const BUILTIN = '__builtin__';
    const card = document.createElement('div');
    card.className = 'deck-card' + (isActive ? ' deck-card--active' : '');

    // Title
    const title = document.createElement('div');
    title.className = 'deck-card__title';
    title.textContent = deck.label;

    // Meta row: count + mode badge
    const meta = document.createElement('div');
    meta.className = 'deck-card__meta';

    const count = document.createElement('span');
    count.className = 'deck-card__count';

    const mode = deck.id === BUILTIN ? 'image' : (window.DatasetManager.getDeckMode?.(deck.id) || 'image');

    if (deck.id === BUILTIN) {
      count.textContent = '組み込み';
    } else {
      count.textContent = deck.cardCount + '語';
    }

    const modeBadge = document.createElement('span');
    modeBadge.className = 'deck-card__mode deck-card__mode--' + mode;
    modeBadge.textContent = mode === 'vocab' ? 'EN→JA' : '画像';

    meta.appendChild(count);
    meta.appendChild(modeBadge);

    card.appendChild(title);
    card.appendChild(meta);

    // Sample words preview (vocab decks only)
    if (deck.id !== BUILTIN && mode === 'vocab') {
      const cards = window.DatasetManager.getDeckCards?.(deck.id);
      if (cards && cards.length > 0) {
        const preview = document.createElement('div');
        preview.className = 'deck-card__preview';
        const samples = cards.slice(0, 3);
        for (const c of samples) {
          const tag = document.createElement('span');
          tag.className = 'deck-card__word';
          tag.textContent = c.yomi || c.name || '';
          preview.appendChild(tag);
        }
        card.appendChild(preview);
      }
    }

    // "学習中" badge
    if (isActive) {
      const badge = document.createElement('div');
      badge.className = 'deck-card__active-badge';
      badge.textContent = '学習中';
      card.appendChild(badge);
    }

    card.addEventListener('click', () => selectDeck(deck.id));
    return card;
  }

  document.addEventListener('DOMContentLoaded', () => {
    const openBtn = document.querySelector('#deck-screen-open-btn');
    if (openBtn) openBtn.addEventListener('click', openDeckScreen);

    const closeBtn = document.querySelector('#deck-screen-close-btn');
    if (closeBtn) closeBtn.addEventListener('click', closeDeckScreen);

    // Click backdrop to close
    const screen = document.querySelector('#deck-screen');
    if (screen) {
      screen.addEventListener('click', (e) => {
        if (e.target === screen) closeDeckScreen();
      });
    }

    // Esc to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && document.querySelector('#deck-screen')?.classList.contains('open')) {
        closeDeckScreen();
      }
    });

    // Refresh grid when decks change (e.g., new deck imported)
    document.addEventListener('dataset:change', () => {
      const screen = document.querySelector('#deck-screen');
      if (screen?.classList.contains('open')) buildDeckGrid();
    });
  });
})();
