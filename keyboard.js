// keyboard.js — keyboard shortcut handler
(function() {
  'use strict';

  function handleKey(e) {
    // Don't fire when user is typing in a search/input field
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

    switch (e.key) {
      case 'ArrowRight':
      case 'l':
      case 'L':
        e.preventDefault();
        document.querySelector('#okBtn')?.click();
        break;

      case 'ArrowLeft':
      case 'h':
      case 'H':
        e.preventDefault();
        document.querySelector('#againBtn')?.click();
        break;

      case 'ArrowUp':
        e.preventDefault();
        document.querySelector('#prev')?.click();
        break;

      case 'ArrowDown':
        e.preventDefault();
        document.querySelector('#next')?.click();
        break;

      case ' ':
      case 'f':
      case 'F': {
        e.preventDefault();
        const card = document.querySelector('#card');
        if (card) {
          card.dataset.flipped = card.dataset.flipped === 'true' ? 'false' : 'true';
        }
        break;
      }

      case 's':
      case 'S':
        e.preventDefault();
        document.querySelector('#shuffle')?.click();
        break;
    }
  }

  document.addEventListener('keydown', handleKey);
})();
