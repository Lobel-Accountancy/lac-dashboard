/**
 * card-resize.js — per-card expand/condense toggle saved to localStorage.
 *
 * Cards inside .content-grid:  default (1 col)  ↔  expanded (span 2 = full row)
 * Cards with .card--full:      default (full)   ↔  compact  (half width)
 *
 * State is keyed by page path + card header text and persisted to localStorage.
 */
(function () {
  const STORAGE_KEY = 'lac_card_sizes_v2';

  function allSizes() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
    catch { return {}; }
  }
  function saveSizes(obj) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  }

  function cardKey(card) {
    const h = card.querySelector('.card-header');
    const text = h ? h.textContent.trim().replace(/\s+/g, ' ').substring(0, 50) : '';
    return location.pathname + '|' + text;
  }

  function inContentGrid(card) {
    return card.parentElement && card.parentElement.classList.contains('content-grid');
  }
  function isFull(card) {
    return card.classList.contains('card--full');
  }

  function getSize(card) {
    if (inContentGrid(card)) {
      return card.classList.contains('card--expanded') ? 'expanded' : 'default';
    }
    if (isFull(card)) {
      return card.classList.contains('card--compact') ? 'compact' : 'default';
    }
    return null; // not resizable
  }

  function applySize(card, size) {
    card.classList.remove('card--expanded', 'card--compact');
    if (size === 'expanded') card.classList.add('card--expanded');
    if (size === 'compact')  card.classList.add('card--compact');
    const btn = card.querySelector('.card-resize-btn');
    if (btn) updateBtnLabel(btn, size);
  }

  function toggleSize(card) {
    const cur = getSize(card);
    if (cur === null) return;
    let next;
    if (inContentGrid(card)) next = cur === 'default' ? 'expanded' : 'default';
    else                       next = cur === 'default' ? 'compact'  : 'default';
    applySize(card, next);
    const sizes = allSizes();
    if (next === 'default') delete sizes[cardKey(card)];
    else                    sizes[cardKey(card)] = next;
    saveSizes(sizes);
  }

  function updateBtnLabel(btn, size) {
    if (size === 'expanded') { btn.textContent = '⊟'; btn.title = 'Condense'; }
    else if (size === 'compact') { btn.textContent = '⊞'; btn.title = 'Expand'; }
    else { btn.setAttribute('data-default', '1'); btn.textContent = '⤢'; btn.title = 'Resize'; }
  }

  function addResizeBtn(card) {
    if (getSize(card) === null) return; // not resizable
    const header = card.querySelector('.card-header');
    if (!header || header.querySelector('.card-resize-btn')) return;

    const btn = document.createElement('button');
    btn.className = 'card-resize-btn';
    btn.setAttribute('aria-label', 'Resize card');
    updateBtnLabel(btn, getSize(card));

    btn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      toggleSize(card);
    });

    // Insert before the last child or just append
    header.appendChild(btn);
  }

  function init() {
    const saved = allSizes();

    document.querySelectorAll('.card').forEach(card => {
      // Restore saved size
      const k = cardKey(card);
      if (saved[k]) applySize(card, saved[k]);

      // Attach button
      addResizeBtn(card);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Re-run after dynamic renders (e.g. dashboard JS rewrites kpi-grid)
  window.initCardResize = init;
})();
