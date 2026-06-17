/* LAC Command Palette (Cmd+K / Ctrl+K) */

(function () {
  const PAGES = [
    { label: 'Briefing',      href: 'index.html',       group: 'Operations' },
    { label: 'Emails',        href: 'emails.html',       group: 'Operations' },
    { label: 'Activity Log',  href: 'activity.html',     group: 'Operations' },
    { label: 'Calendar',      href: 'calendar.html',     group: 'Operations' },
    { label: 'AR Aging',      href: 'clients.html',      group: 'Finance' },
    { label: 'Analytics',     href: 'bi.html',           group: 'Finance' },
    { label: 'Forecast',      href: 'forecast.html',     group: 'Finance' },
    { label: 'Budget',        href: 'budget.html',       group: 'Finance' },
    { label: 'Financials',    href: 'financials.html',   group: 'Finance' },
    { label: 'Pipeline',      href: 'engagement.html',   group: 'Work' },
    { label: 'Documents',     href: 'docs.html',         group: 'Work' },
    { label: 'Time Tracking', href: 'time.html',         group: 'Work' },
    { label: 'Health Score',  href: 'health.html',       group: 'Clients' },
    { label: 'Prospecting',   href: 'prospecting.html',  group: 'Clients' },
    { label: 'Audit Tools',   href: 'audit-tools.html',  group: 'Tools' },
    { label: 'AI',            href: 'ai.html',           group: 'Tools' },
    { label: 'PDF Tools',     href: 'pdf.html',          group: 'Tools' },
    { label: 'DocuSeal',      href: 'docuseal.html',     group: 'Tools' },
    { label: 'Cron Monitor',  href: 'cron.html',         group: 'Tools' },
    { label: 'Bookmarks',     href: 'bookmarks.html',    group: 'Tools' },
  ];

  const RECENT_KEY = 'lac_palette_recent';
  function getRecent() {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; } catch { return []; }
  }
  function addRecent(href) {
    const r = getRecent().filter(h => h !== href);
    r.unshift(href);
    localStorage.setItem(RECENT_KEY, JSON.stringify(r.slice(0, 5)));
  }

  let overlay, input, results;
  let activeIdx = -1;
  let currentItems = [];

  function build() {
    overlay = document.createElement('div');
    overlay.className = 'palette-overlay';
    overlay.id = 'palette-overlay';
    overlay.innerHTML = `
      <div class="palette-modal">
        <div class="palette-input-wrap">
          <span class="palette-search-icon">&#9906;</span>
          <input class="palette-input" id="palette-input" placeholder="Go to page, search clients&hellip;" autocomplete="off" spellcheck="false">
          <span class="palette-esc">esc</span>
        </div>
        <div class="palette-results" id="palette-results"></div>
        <div class="palette-footer">
          <span class="palette-hint"><kbd>↑↓</kbd> navigate</span>
          <span class="palette-hint"><kbd>↵</kbd> open</span>
          <span class="palette-hint"><kbd>esc</kbd> close</span>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    input = document.getElementById('palette-input');
    results = document.getElementById('palette-results');

    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    input.addEventListener('input', () => render(input.value));
    input.addEventListener('keydown', onKey);
  }

  function open() {
    if (!overlay) build();
    overlay.classList.add('open');
    input.value = '';
    render('');
    input.focus();
  }

  function close() {
    if (overlay) overlay.classList.remove('open');
  }

  let searchTimer = null;

  function render(q) {
    const query = q.trim().toLowerCase();
    let items;

    if (!query) {
      const recent = getRecent();
      const recentPages = recent.map(h => PAGES.find(p => p.href === h)).filter(Boolean);
      items = recentPages.length ? recentPages : PAGES.slice(0, 8);
      currentItems = items;
      activeIdx = items.length > 0 ? 0 : -1;
      displayItems(items, !query && getRecent().length ? 'Recent' : 'All Pages');
      return;
    }

    // Local page matches
    items = PAGES.filter(p => p.label.toLowerCase().includes(query) || p.group.toLowerCase().includes(query));
    currentItems = items;
    activeIdx = items.length > 0 ? 0 : -1;
    displayItems(items, items.length ? 'Pages' : '');

    // Server search for clients/docs (debounced)
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => serverSearch(query, items), 300);
  }

  async function serverSearch(query, existingItems) {
    try {
      const token = localStorage.getItem('lac_jwt');
      if (!token) return;
      const AUTH_URL = 'https://auth.lobelaccountancy.com';
      const res = await fetch(`${AUTH_URL}/search/global?q=${encodeURIComponent(query)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) return;
      const data = await res.json();
      const serverItems = (data.results || []).map(r => ({
        label: r.label, href: r.href, group: r.sub || r.type,
      }));
      currentItems = [...existingItems, ...serverItems];
      if (currentItems.length) activeIdx = 0;
      const pagesHtml = existingItems.length
        ? '<div class="palette-section-header">Pages</div>' + renderItemsHtml(existingItems, 0)
        : '';
      const serverHtml = serverItems.length
        ? '<div class="palette-section-header">Records</div>' + renderItemsHtml(serverItems, existingItems.length)
        : '';
      results.innerHTML = (pagesHtml + serverHtml) ||
        '<div style="padding:20px 16px;color:var(--text-3);font-size:13px;text-align:center;">No results</div>';
      attachResultHandlers();
    } catch { /* silent */ }
  }

  function renderItemsHtml(items, offset) {
    return items.map((item, i) => `
      <div class="palette-result${(i + offset) === activeIdx ? ' active' : ''}" data-idx="${i + offset}">
        <div class="palette-result-icon">${item.label.charAt(0)}</div>
        <div>
          <div class="palette-result-label">${item.label}</div>
          <div class="palette-result-group">${item.group}</div>
        </div>
      </div>
    `).join('');
  }

  function displayItems(items, header) {
    if (!items.length && !header) {
      results.innerHTML = '<div style="padding:20px 16px;color:var(--text-3);font-size:13px;text-align:center;">No results</div>';
      return;
    }
    const headerHtml = header ? `<div class="palette-section-header">${header}</div>` : '';
    results.innerHTML = headerHtml + renderItemsHtml(items, 0);
    attachResultHandlers();
  }

  function attachResultHandlers() {
    results.querySelectorAll('.palette-result').forEach(el => {
      el.addEventListener('click', () => navigate(parseInt(el.dataset.idx)));
      el.addEventListener('mouseenter', () => {
        activeIdx = parseInt(el.dataset.idx);
        highlight();
      });
    });
  }

  function highlight() {
    results.querySelectorAll('.palette-result').forEach((el, i) => {
      el.classList.toggle('active', i === activeIdx);
    });
    const active = results.querySelector('.palette-result.active');
    if (active) active.scrollIntoView({ block: 'nearest' });
  }

  function navigate(idx) {
    const item = currentItems[idx];
    if (!item) return;
    addRecent(item.href);
    close();
    window.location.href = item.href;
  }

  function onKey(e) {
    if (e.key === 'Escape') { close(); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIdx = Math.min(activeIdx + 1, currentItems.length - 1);
      highlight();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIdx = Math.max(activeIdx - 1, 0);
      highlight();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIdx >= 0) navigate(activeIdx);
    }
  }

  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      overlay?.classList.contains('open') ? close() : open();
    }
  });

  window.openPalette = open;

  document.addEventListener('DOMContentLoaded', build);
})();
