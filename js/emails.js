const REFRESH_INTERVAL = 2 * 60 * 1000;
let currentAlias = 'jlobel';

const AVATAR_COLORS = [
  '#1B2A3F','#2563EB','#059669','#D97706','#7C3AED',
  '#DB2777','#0891B2','#65A30D','#EA580C','#6366F1',
];

function avatarColor(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) & 0xffff;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function initials(name) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  if (!requireAuth()) return;

  const payload = jwtPayload(getJWT());
  const name = (payload?.email || '').split('@')[0];
  document.getElementById('nav-user').textContent = name;

  loadEmails();
  setInterval(loadEmails, REFRESH_INTERVAL);
});

// ---------------------------------------------------------------------------
// Tab switching
// ---------------------------------------------------------------------------

function switchAlias(key) {
  currentAlias = key;

  ['jlobel', 'info', 'billing'].forEach(k => {
    document.getElementById(`tab-${k}`).classList.toggle('active', k === key);
  });

  loadEmails();
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

async function loadEmails(force = false) {
  const statusEl = document.getElementById('refresh-status');
  statusEl.textContent = 'Loading…';

  try {
    const data = await apiFetch(`/data/emails?alias=${currentAlias}`);
    if (!data) return;

    // Update badge counts on all tabs
    const counts = data.counts || {};
    for (const [key, count] of Object.entries(counts)) {
      const badge = document.getElementById(`count-${key}`);
      if (badge) {
        badge.textContent = count;
        badge.dataset.count = count;
      }
    }

    // Clear any previous error
    const errBanner = document.getElementById('error-banner');
    if (data.error) {
      errBanner.textContent = `Could not fetch emails: ${data.error}`;
      errBanner.hidden = false;
    } else {
      errBanner.hidden = true;
    }

    renderEmails(data.emails || []);

    const now = new Date();
    statusEl.textContent = `Updated ${now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  } catch (err) {
    document.getElementById('error-banner').textContent = err.message;
    document.getElementById('error-banner').hidden = false;
    statusEl.textContent = 'Error';
  }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderEmails(emails) {
  const container = document.getElementById('email-list');

  if (!emails.length) {
    container.innerHTML = '<span class="empty-state">No unread emails</span>';
    return;
  }

  container.innerHTML = emails.map((e, i) => {
    const color = avatarColor(e.from_email || e.from_name || String(i));
    const abbr  = initials(e.from_name || e.from_email || '?');
    const safeSubject = escHtml(e.subject);
    const safeFrom    = escHtml(e.from_name);
    const safeSnippet = escHtml(e.snippet);

    return `
      <div class="email-item" id="email-${i}" onclick="toggleEmail(${i})">
        <div class="email-avatar" style="background:${color}">${abbr}</div>
        <div class="email-body">
          <div class="email-top">
            <span class="email-from">${safeFrom}</span>
            <span class="email-date">${escHtml(e.date)}</span>
          </div>
          <div class="email-subject">${safeSubject}</div>
          <div class="email-snippet collapsed" id="snippet-${i}">${safeSnippet}</div>
        </div>
      </div>`;
  }).join('');
}

function toggleEmail(i) {
  const item    = document.getElementById(`email-${i}`);
  const snippet = document.getElementById(`snippet-${i}`);
  const expanded = item.classList.toggle('expanded');
  snippet.classList.toggle('collapsed', !expanded);
}

function escHtml(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
