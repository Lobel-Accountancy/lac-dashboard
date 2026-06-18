const REFRESH_INTERVAL = 2 * 60 * 1000;
const ALIASES          = ['jlobel', 'info', 'billing'];

let currentAlias       = 'jlobel';
let emailData          = [];
let _showAll           = true;
let _searchQuery       = '';
let _loading           = false;
let _composeEmailIndex = -1;
let _emailInterval     = null;

const SIGNATURE = `\n\n--\nJeffrey Lobel, CPA\nLobel Accountancy Corporation\n(949) 345-1925\njlobel@lobelaccountancy.com`;

// ---------------------------------------------------------------------------
// Local read-state tracking (so we can show unread indicators)
// ---------------------------------------------------------------------------

const _readSet = new Set(JSON.parse(localStorage.getItem('lac_read_emails') || '[]'));

function _saveReadSet() {
  localStorage.setItem('lac_read_emails', JSON.stringify([..._readSet].slice(-1000)));
}

function markReadLocally(msgId) {
  if (!msgId) return;
  if (_readSet.has(msgId)) return;
  _readSet.add(msgId);
  _saveReadSet();
}

function markUnreadLocally(msgId) {
  if (!msgId) return;
  _readSet.delete(msgId);
  _saveReadSet();
}

function isUnread(e) {
  if (!e.message_id) return !!e.unread;
  return !_readSet.has(e.message_id) && (e.unread !== false);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function escHtml(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function aliasAddress(alias) {
  return `${alias}@lobelaccountancy.com`;
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  if (!requireAuth()) return;

  const payload = jwtPayload(getJWT());
  document.getElementById('nav-user').textContent = (payload?.email || '').split('@')[0];

  loadEmails();
  if (_emailInterval) clearInterval(_emailInterval);
  _emailInterval = setInterval(loadEmails, REFRESH_INTERVAL);

  // Close compose modal on backdrop click
  document.getElementById('compose-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeCompose();
  });

  // Close on Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeCompose();
  });
});

// ---------------------------------------------------------------------------
// Tab switching
// ---------------------------------------------------------------------------

function switchAlias(key) {
  currentAlias = key;
  ALIASES.forEach(k =>
    document.getElementById(`tab-${k}`).classList.toggle('active', k === key));
  resetAndLoad();
}

// ---------------------------------------------------------------------------
// Show-all toggle
// ---------------------------------------------------------------------------

function toggleShowAll() {
  _showAll = !_showAll;
  const btn = document.getElementById('btn-show-all');
  btn.classList.toggle('active', _showAll);
  btn.textContent = _showAll ? 'Unread only' : 'Show all';
  renderFiltered();
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

function onSearch(val) {
  _searchQuery = val.trim().toLowerCase();
  renderFiltered();
}

function resetAndLoad() {
  _loading  = false;
  emailData = [];
  loadEmails();
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

async function loadEmails() {
  if (_loading) return;
  _loading = true;

  const statusEl = document.getElementById('refresh-status');
  statusEl.textContent = 'Loading…';

  try {
    const data = await apiFetch(`/data/emails?alias=${currentAlias}`);
    if (!data) return;

    const counts = data.counts || {};
    ALIASES.forEach(k => {
      const badge = document.getElementById(`count-${k}`);
      if (badge) {
        const n = counts[k] ?? 0;
        badge.textContent = n;
        badge.dataset.count = n;
      }
    });

    const errBanner = document.getElementById('error-banner');
    if (data.error) {
      errBanner.textContent = `Could not fetch emails: ${data.error}`;
      errBanner.hidden = false;
    } else {
      errBanner.hidden = true;
    }

    emailData = data.emails || [];
    renderFiltered();

    const now = new Date();
    statusEl.textContent = `Updated ${now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  } catch (err) {
    document.getElementById('error-banner').textContent = err.message;
    document.getElementById('error-banner').hidden = false;
    statusEl.textContent = 'Error';
  } finally {
    _loading = false;
  }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderFiltered() {
  let filtered = _showAll ? emailData : emailData.filter(isUnread);
  const q = _searchQuery;
  if (q) filtered = filtered.filter(e =>
    (e.from_name  || '').toLowerCase().includes(q) ||
    (e.from_email || '').toLowerCase().includes(q) ||
    (e.subject    || '').toLowerCase().includes(q) ||
    (e.snippet    || '').toLowerCase().includes(q) ||
    (e.body       || '').toLowerCase().includes(q));
  renderEmails(filtered);
}

function renderEmails(emails) {
  const container = document.getElementById('email-list');

  if (!emails.length) {
    const msg = _searchQuery
      ? `No emails match "${escHtml(_searchQuery)}"`
      : _showAll ? 'No emails.' : 'No unread emails.';
    container.innerHTML = `<span class="empty-state">${msg}</span>`;
    return;
  }

  container.innerHTML = emails.map((e, i) => {
    const color   = avatarColor(e.from_email || e.from_name || String(i));
    const abbr    = initials(e.from_name || e.from_email);
    const unread  = isUnread(e);
    const bodyText = (e.body || e.snippet || '').trim();
    const hasBody = bodyText.length > (e.snippet || '').length;

    return `
      <div class="email-item${unread ? ' unread' : ''}" id="email-${i}" onclick="toggleEmail(${i})">
        <div class="email-avatar" style="background:${color}">${abbr}</div>
        <div class="email-body">
          <div class="email-top">
            <span class="email-from">${escHtml(e.from_name || e.from_email)}</span>
            <span class="email-date">${escHtml(e.date)}</span>
          </div>
          <div class="email-subject">${escHtml(e.subject)}</div>
          <div class="email-preview collapsed" id="preview-${i}">${escHtml(e.snippet)}</div>
          <div class="email-full-body" id="fullbody-${i}">${escHtml(bodyText || e.snippet)}</div>
          <div class="action-row" id="action-row-${i}">
            <button class="btn-reply" onclick="event.stopPropagation();openReply(${i})">↩ Reply</button>
            <button class="btn-forward" onclick="event.stopPropagation();openForward(${i})">→ Forward</button>
            <button class="btn-ai-sm" id="summarize-btn-${i}" onclick="event.stopPropagation();summarizeEmail(${i})">✦ Summarize</button>
            <button class="btn-mark-unread" onclick="event.stopPropagation();toggleReadState(${i})" id="read-btn-${i}">
              ${unread ? 'Mark read' : 'Mark unread'}
            </button>
          </div>
          <div class="email-ai-summary" id="ai-summary-${i}" hidden></div>
        </div>
      </div>`;
  }).join('');
}

function toggleEmail(i) {
  const item = document.getElementById(`email-${i}`);
  if (!item) return;
  const expanded = item.classList.toggle('expanded');
  if (expanded) {
    // Mark as read on open
    const e = emailData[i];
    if (e && isUnread(e)) {
      markReadLocally(e.message_id);
      item.classList.remove('unread');
      const readBtn = document.getElementById(`read-btn-${i}`);
      if (readBtn) readBtn.textContent = 'Mark unread';
    }
  }
}

function toggleReadState(i) {
  const e = emailData[i];
  if (!e) return;
  const item = document.getElementById(`email-${i}`);
  const readBtn = document.getElementById(`read-btn-${i}`);
  if (isUnread(e)) {
    markReadLocally(e.message_id);
    item && item.classList.remove('unread');
    if (readBtn) readBtn.textContent = 'Mark unread';
  } else {
    markUnreadLocally(e.message_id);
    item && item.classList.add('unread');
    if (readBtn) readBtn.textContent = 'Mark read';
  }
}

// ---------------------------------------------------------------------------
// Compose / Reply / Forward modal (unified)
// ---------------------------------------------------------------------------

function _openComposeModal({ title, from, to = '', cc = '', subject = '', body = '', inReplyTo = '', showDraft = false, emailIndex = -1 }) {
  _composeEmailIndex = emailIndex;
  document.getElementById('compose-title').textContent   = title;
  document.getElementById('compose-from').value          = from;
  document.getElementById('compose-to').value            = to;
  document.getElementById('compose-cc').value            = cc;
  document.getElementById('compose-subject').value       = subject;
  document.getElementById('compose-body').value          = body;
  document.getElementById('compose-in-reply-to').value   = inReplyTo;
  document.getElementById('compose-error').textContent   = '';
  document.getElementById('compose-send-btn').disabled   = false;
  document.getElementById('compose-send-btn').textContent = 'Send';

  const draftBtn = document.getElementById('compose-draft-btn');
  draftBtn.hidden   = !showDraft;
  draftBtn.disabled = false;
  draftBtn.textContent = '✦ Draft Reply';

  const modal = document.getElementById('compose-modal');
  modal.hidden = false;

  // Focus: to if empty, else body
  const toInput = document.getElementById('compose-to');
  if (!to) {
    toInput.focus();
  } else {
    const ta = document.getElementById('compose-body');
    ta.focus();
    ta.setSelectionRange(0, 0);
    ta.scrollTop = 0;
  }
}

function openCompose() {
  _openComposeModal({
    title:      'New Message',
    from:       aliasAddress(currentAlias),
    body:       SIGNATURE,
    showDraft:  false,
  });
}

function openReply(i) {
  const e = emailData[i];
  if (!e) return;
  const to      = e.reply_to || e.from_email;
  const subject = e.subject?.toLowerCase().startsWith('re:') ? e.subject : `Re: ${e.subject}`;
  const quoted  = e.body || e.snippet
    ? `\n\n--- Original message from ${e.from_name || e.from_email} ---\n${(e.body || e.snippet || '').trim()}`
    : '';

  _openComposeModal({
    title:      'Reply',
    from:       aliasAddress(currentAlias),
    to,
    subject,
    body:       SIGNATURE + quoted,
    inReplyTo:  e.message_id || '',
    showDraft:  true,
    emailIndex: i,
  });
}

function openForward(i) {
  const e = emailData[i];
  if (!e) return;
  const subject = e.subject?.toLowerCase().startsWith('fwd:') ? e.subject : `Fwd: ${e.subject}`;
  const header  = `\n\n--- Forwarded message ---\nFrom: ${e.from_name || e.from_email}\nDate: ${e.date}\nSubject: ${e.subject}\n\n${(e.body || e.snippet || '').trim()}`;

  _openComposeModal({
    title:      'Forward',
    from:       aliasAddress(currentAlias),
    subject,
    body:       SIGNATURE + header,
    showDraft:  false,
    emailIndex: i,
  });
}

function closeCompose() {
  document.getElementById('compose-modal').hidden = true;
  _composeEmailIndex = -1;
}

async function sendCompose() {
  const to       = document.getElementById('compose-to').value.trim();
  const cc       = document.getElementById('compose-cc').value.trim();
  const subject  = document.getElementById('compose-subject').value.trim();
  const body     = document.getElementById('compose-body').value;
  const inReplyTo = document.getElementById('compose-in-reply-to').value.trim();
  const errEl    = document.getElementById('compose-error');
  const sendBtn  = document.getElementById('compose-send-btn');

  if (!to)   { errEl.textContent = 'To address is required.'; return; }
  if (!body.trim()) { errEl.textContent = 'Message body is required.'; return; }

  sendBtn.disabled    = true;
  sendBtn.textContent = 'Sending…';
  errEl.textContent   = '';

  try {
    await apiFetch('/data/email/reply', {
      method: 'POST',
      body: JSON.stringify({ to, cc, subject, body, in_reply_to: inReplyTo, alias: currentAlias }),
    });
    closeCompose();
    showToast('Email sent.', 'success', 3000);
  } catch (err) {
    errEl.textContent   = err.message || 'Send failed.';
    sendBtn.disabled    = false;
    sendBtn.textContent = 'Send';
  }
}

// ---------------------------------------------------------------------------
// AI: Summarize
// ---------------------------------------------------------------------------

async function summarizeEmail(i) {
  const e = emailData[i];
  if (!e) return;
  const btn = document.getElementById(`summarize-btn-${i}`);
  const box = document.getElementById(`ai-summary-${i}`);
  btn.disabled    = true;
  btn.textContent = '✦ …';
  box.hidden      = false;
  box.className   = 'email-ai-summary loading';
  box.textContent = 'Summarizing…';
  try {
    const data = await apiFetch('/email/summarize', {
      method: 'POST',
      body: JSON.stringify({ subject: e.subject, from_name: e.from_name, body: e.body || e.snippet }),
    });
    box.className   = 'email-ai-summary';
    box.textContent = data.summary || 'No summary returned.';
    btn.textContent = '✦ Summarized';
  } catch (err) {
    box.className   = 'email-ai-summary error';
    box.textContent = 'Summary failed: ' + (err.message || 'error');
    btn.disabled    = false;
    btn.textContent = '✦ Summarize';
  }
}

// ---------------------------------------------------------------------------
// AI: Draft reply (fills compose body)
// ---------------------------------------------------------------------------

async function draftReply() {
  const i   = _composeEmailIndex;
  const e   = i >= 0 ? emailData[i] : null;
  if (!e) return;

  const btn = document.getElementById('compose-draft-btn');
  btn.disabled    = true;
  btn.textContent = '✦ Drafting…';

  try {
    const data = await apiFetch('/email/draft', {
      method: 'POST',
      body: JSON.stringify({ subject: e.subject, from_name: e.from_name, body: e.body || e.snippet }),
    });
    const ta   = document.getElementById('compose-body');
    const quoted = (e.body || e.snippet)
      ? `\n\n--- Original message ---\n${(e.body || e.snippet || '').trim()}`
      : '';
    ta.value = ((data.draft || '').trim()) + SIGNATURE + quoted;
    ta.focus();
    ta.setSelectionRange(0, 0);
    ta.scrollTop = 0;
  } catch (err) {
    document.getElementById('compose-error').textContent = 'Draft failed: ' + (err.message || 'error');
  } finally {
    btn.disabled    = false;
    btn.textContent = '✦ Draft Reply';
  }
}
