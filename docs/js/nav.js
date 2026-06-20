/* LAC Sidebar Navigation */

const NAV_GROUPS = [
  { label: 'Operations', items: [
    { label: 'Briefing',      href: 'index.html',       icon: '◈', badgeId: 'badge-briefing' },
    { label: 'Emails',        href: 'emails.html',      icon: '✉' },
    { label: 'Activity',      href: 'activity.html',    icon: '⟳' },
    { label: 'Calendar',      href: 'calendar.html',    icon: '▦' },
    { label: 'News',          href: 'news.html',        icon: '◈' },
  ]},
  { label: 'Finance', items: [
    { label: 'AR Aging',      href: 'clients.html',     icon: '◎' },
    { label: 'Journal',       href: 'journal.html',     icon: '◫' },
    { label: 'Analytics',     href: 'bi.html',          icon: '▤' },
    { label: 'Forecast',      href: 'forecast.html',    icon: '◬' },
    { label: 'Budget',        href: 'budget.html',      icon: '◫' },
    { label: 'Financials',    href: 'financials.html',  icon: '▧' },
    { label: 'Rate Research', href: 'research.html',    icon: '◈' },
  ]},
  { label: 'Work', items: [
    { label: 'Pipeline',       href: 'engagement.html',    icon: '◧', badgeId: 'badge-pipeline' },
    { label: 'Client Status',  href: 'client-status.html', icon: '◉' },
    { label: 'Documents',      href: 'docs.html',          icon: '◪', badgeId: 'badge-docs' },
    { label: 'Drive',          href: 'drive.html',         icon: '◈' },
    { label: 'Time Tracking',  href: 'time.html',          icon: '◷' },
  ]},
  { label: 'Clients', items: [
    { label: 'Health Score',  href: 'health.html',      icon: '◉' },
    { label: 'Prospecting',   href: 'prospecting.html', icon: '◱' },
  ]},
  { label: 'Compliance', items: [
    { label: 'CPE',           href: 'cpe.html',         icon: '◎' },
  ]},
  { label: 'Tools', items: [
    { label: 'Audit Tools',   href: 'audit-tools.html', icon: '◈' },
    { label: 'AI',            href: 'ai.html',          icon: '◈' },
    { label: 'PDF Tools',     href: 'pdf.html',         icon: '◈' },
    { label: 'DocuSeal',      href: 'docuseal.html',    icon: '◈' },
    { label: 'Cron Monitor',  href: 'cron.html',        icon: '◈' },
    { label: 'Bookmarks',     href: 'bookmarks.html',   icon: '◈' },
    { label: 'Client Portal', href: 'https://clients.lobelaccountancy.com', icon: '↗', external: true },
  ]},
];

(function () {
  const COLLAPSED_KEY = 'lac_sidebar_collapsed';

  function currentPage() {
    const p = window.location.pathname.split('/').pop() || 'index.html';
    return p;
  }

  function isActive(href) {
    if (href.startsWith('http')) return false;
    return currentPage() === href;
  }

  function buildSidebar() {
    const el = document.getElementById('lac-sidebar');
    if (!el) return;

    el.className = 'sidebar';
    if (localStorage.getItem(COLLAPSED_KEY) === '1') el.classList.add('collapsed');

    // Groups HTML
    const groupsHtml = NAV_GROUPS.map(g => {
      const items = g.items.map(item => {
        const active = isActive(item.href) ? ' active' : '';
        const target = item.external ? ' target="_blank" rel="noopener"' : '';
        const badge = item.badgeId ? `<span class="nav-item-badge" id="${item.badgeId}" hidden></span>` : '';
        return `<a class="nav-item${active}" href="${item.href}"${target} title="${item.label}"><span class="nav-icon">${item.icon}</span><span class="nav-label">&nbsp;${item.label}</span>${badge}</a>`;
      }).join('');
      return `<div class="nav-group"><div class="nav-group-label">${g.label}</div>${items}</div>`;
    }).join('');

    const isCollapsed = localStorage.getItem(COLLAPSED_KEY) === '1';
    el.innerHTML = `
      <div class="sidebar-header">
        <img class="sidebar-brand" src="favicon.jpg" alt="LAC" width="28" height="28">
        <span class="sidebar-title">Lobel Accountancy</span>
        <button class="sidebar-toggle" id="sidebar-toggle-btn" title="${isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}">${isCollapsed ? '&#8250;' : '&#8249;'}</button>
      </div>
      <div class="sidebar-search">
        <button class="palette-trigger" id="palette-trigger">
          <span class="palette-trigger-text">Search&hellip;</span>
          <kbd>⌘K</kbd>
        </button>
      </div>
      <nav class="sidebar-nav">${groupsHtml}</nav>
      <div class="sidebar-footer">
        <div id="nav-user" hidden></div>
        <button class="sidebar-user-btn" id="settings-btn">
          <div class="sidebar-user-avatar" id="user-avatar">?</div>
          <span class="sidebar-user-name" id="sidebar-username">Account</span>
          <span class="sidebar-user-caret">&#9662;</span>
        </button>
      </div>
    `;

    // Toggle collapse
    document.getElementById('sidebar-toggle-btn').addEventListener('click', () => {
      el.classList.toggle('collapsed');
      const nowCollapsed = el.classList.contains('collapsed');
      localStorage.setItem(COLLAPSED_KEY, nowCollapsed ? '1' : '0');
      const btn = document.getElementById('sidebar-toggle-btn');
      btn.innerHTML = nowCollapsed ? '&#8250;' : '&#8249;';
      btn.title = nowCollapsed ? 'Expand sidebar' : 'Collapse sidebar';
    });

    // Palette trigger
    document.getElementById('palette-trigger').addEventListener('click', () => {
      if (window.openPalette) window.openPalette();
    });
  }

  function addMobileSupport() {
    const btn = document.createElement('button');
    btn.className = 'mobile-menu-btn';
    btn.innerHTML = '&#9776;';
    btn.style.display = 'none';
    document.body.appendChild(btn);

    const overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    document.body.appendChild(overlay);

    const sidebar = document.getElementById('lac-sidebar');
    btn.addEventListener('click', () => {
      sidebar.classList.toggle('mobile-open');
      overlay.classList.toggle('visible');
    });
    overlay.addEventListener('click', () => {
      sidebar.classList.remove('mobile-open');
      overlay.classList.remove('visible');
    });
  }

  function syncUsername() {
    const navUser = document.getElementById('nav-user');
    const sidebarName = document.getElementById('sidebar-username');
    const avatar = document.getElementById('user-avatar');
    if (!navUser || !sidebarName) return;

    function update() {
      const name = navUser.textContent.trim();
      if (!name) return;
      sidebarName.textContent = name;
      avatar.textContent = name.charAt(0).toUpperCase();
    }
    update();
    new MutationObserver(update).observe(navUser, { childList: true, characterData: true, subtree: true });
  }

  // Wire up settings dropdown from auth.js to sidebar user button
  function patchSettingsDropdown() {
    const btn = document.getElementById('settings-btn');
    if (!btn) return;

    const observer = new MutationObserver(() => {
      const dropdown = document.getElementById('settings-dropdown');
      if (dropdown && dropdown.parentElement !== btn) {
        btn.appendChild(dropdown);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // Load notification badges — uses sessionStorage to avoid a redundant
  // morning-briefing fetch on pages that already pull this data (e.g. index.html).
  async function loadBadges() {
    try {
      const token = localStorage.getItem('lac_jwt');
      if (!token) return;

      const cached   = sessionStorage.getItem('lac_badge_overdue');
      const cachedAt = Number(sessionStorage.getItem('lac_badge_overdue_ts') || 0);
      const BADGE_TTL = 5 * 60 * 1000;

      let overdueCount;
      if (cached !== null && Date.now() - cachedAt < BADGE_TTL) {
        overdueCount = Number(cached);
      } else {
        const AUTH_URL = 'https://auth.lobelaccountancy.com';
        const res = await fetch(`${AUTH_URL}/data/morning-briefing`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) return;
        const data = await res.json();
        overdueCount = data.ar?.overdue_count || 0;
        sessionStorage.setItem('lac_badge_overdue', overdueCount);
        sessionStorage.setItem('lac_badge_overdue_ts', Date.now());
      }

      if (overdueCount > 0) {
        const b = document.getElementById('badge-briefing');
        if (b) { b.textContent = overdueCount; b.hidden = false; }
      }
    } catch { /* silent */ }
  }

  document.addEventListener('DOMContentLoaded', () => {
    buildSidebar();
    document.body.classList.add('has-sidebar');
    addMobileSupport();
    syncUsername();
    patchSettingsDropdown();
    loadBadges();
  });
})();
