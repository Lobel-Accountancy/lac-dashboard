const REFRESH_INTERVAL = 2 * 60 * 1000;
let currentAlias = 'jlobel';
let emailData    = [];

const AVATAR_COLORS = [
  '#1B2A3F','#2563EB','#059669','#D97706','#7C3AED',
  '#DB2777','#0891B2','#65A30D','#EA580C','#6366F1',
];

const SIGNATURE = `\n\n--\nJeffrey Lobel, CPA\nLobel Accountancy Corporation\n(949) 345-1925\njlobel@lobelaccountancy.com`;

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

    const counts = data.counts || {};
    for (const [key, count] of Object.entries(counts)) {
      const badge = document.getElementById(`count-${key}`);
      if (badge) {
        badge.textContent = count;
        badge.dataset.count = count;
      }
    }

    const errBanner = document.getElementById('error-banner');
    if (data.error) {
      errBanner.textContent = `Could not fetch emails: ${data.error}`;
      errBanner.hidden = false;
    } else {
      errBanner.hidden = true;
    }

    emailData = data.emails || [];
    renderEmails(emailData);

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

    return `
      <div class="email-item" id="email-${i}" onclick="toggleEmail(${i})">
        <div class="email-avatar" style="background:${color}">${abbr}</div>
        <div class="email-body">
          <div class="email-top">
            <span class="email-from">${escHtml(e.from_name)}</span>
            <span class="email-date">${escHtml(e.date)}</span>
          </div>
          <div class="email-subject">${escHtml(e.subject)}</div>
          <div class="email-snippet collapsed" id="snippet-${i}">${escHtml(e.snippet)}</div>
          <div class="reply-row" id="reply-row-${i}" hidden>
            <button class="btn-reply" onclick="event.stopPropagation();openReply(${i})">↩ Reply</button>
            <button class="btn-ai-sm" id="summarize-btn-${i}" onclick="event.stopPropagation();summarizeEmail(${i})">✦ Summarize</button>
          </div>
          <div class="email-ai-summary" id="ai-summary-${i}" hidden></div>
        </div>
      </div>`;
  }).join('');
}

function toggleEmail(i) {
  const item    = document.getElementById(`email-${i}`);
  const snippet = document.getElementById(`snippet-${i}`);
  const replyRow = document.getElementById(`reply-row-${i}`);
  const expanded = item.classList.toggle('expanded');
  snippet.classList.toggle('collapsed', !expanded);
  replyRow.hidden = !expanded;
}

// ---------------------------------------------------------------------------
// Reply modal
// ---------------------------------------------------------------------------

let _replyEmailIndex = -1;

function openReply(i) {
  const e = emailData[i];
  if (!e) return;
  _replyEmailIndex = i;

  const toAddr  = e.reply_to || e.from_email;
  const subject = e.subject.toLowerCase().startsWith('re:') ? e.subject : `Re: ${e.subject}`;

  document.getElementById('reply-to').value      = toAddr;
  document.getElementById('reply-subject').value = subject;
  document.getElementById('reply-body').value    = SIGNATURE;
  document.getElementById('reply-message-id').value = e.message_id || '';
  document.getElementById('reply-error').textContent = '';
  document.getElementById('reply-send-btn').disabled = false;
  document.getElementById('reply-send-btn').textContent = 'Send';
  const draftBtn = document.getElementById('draft-btn');
  if (draftBtn) { draftBtn.disabled = false; draftBtn.textContent = '✦ Draft Reply'; }

  const ta = document.getElementById('reply-body');
  ta.focus();
  ta.setSelectionRange(0, 0);
  ta.scrollTop = 0;

  document.getElementById('reply-modal').hidden = false;
}

function closeReply() {
  document.getElementById('reply-modal').hidden = true;
}

async function sendReply() {
  const to         = document.getElementById('reply-to').value.trim();
  const subject    = document.getElementById('reply-subject').value.trim();
  const body       = document.getElementById('reply-body').value;
  const inReplyTo  = document.getElementById('reply-message-id').value.trim();
  const errEl      = document.getElementById('reply-error');
  const sendBtn    = document.getElementById('reply-send-btn');

  if (!body.trim()) {
    errEl.textContent = 'Message body is required.';
    return;
  }

  sendBtn.disabled = true;
  sendBtn.textContent = 'Sending…';
  errEl.textContent = '';

  try {
    await apiFetch('/data/email/reply', {
      method: 'POST',
      body: JSON.stringify({ to, subject, body, in_reply_to: inReplyTo, alias: currentAlias }),
    });
    closeReply();
  } catch (err) {
    errEl.textContent = err.message;
    sendBtn.disabled = false;
    sendBtn.textContent = 'Send';
  }
}

// Close modal on backdrop click
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('reply-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeReply();
  });
});

async function summarizeEmail(i) {
  const e = emailData[i];
  if (!e) return;
  const btn = document.getElementById(`summarize-btn-${i}`);
  const box = document.getElementById(`ai-summary-${i}`);
  btn.disabled = true;
  btn.textContent = '✦ …';
  box.hidden = false;
  box.className = 'email-ai-summary loading';
  box.textContent = 'Summarizing…';
  try {
    const data = await apiFetch('/email/summarize', {
      method: 'POST',
      body: JSON.stringify({ subject: e.subject, from_name: e.from_name, body: e.body || e.snippet }),
    });
    box.className = 'email-ai-summary';
    box.textContent = data.summary || 'No summary returned.';
    btn.textContent = '✦ Summarized';
  } catch (err) {
    box.className = 'email-ai-summary error';
    box.textContent = 'Summary failed: ' + (err.message || 'error');
    btn.disabled = false;
    btn.textContent = '✦ Summarize';
  }
}

async function draftReply(i) {
  const e = emailData[i];
  if (!e) return;
  const btn = document.getElementById('draft-btn');
  btn.disabled = true;
  btn.textContent = '✦ Drafting…';
  try {
    const data = await apiFetch('/email/draft', {
      method: 'POST',
      body: JSON.stringify({ subject: e.subject, from_name: e.from_name, body: e.body || e.snippet }),
    });
    const ta = document.getElementById('reply-body');
    const draft = (data.draft || '').trim();
    ta.value = draft + SIGNATURE;
    ta.focus();
    ta.setSelectionRange(0, 0);
    ta.scrollTop = 0;
  } catch (err) {
    document.getElementById('reply-error').textContent = 'Draft failed: ' + (err.message || 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '✦ Draft Reply';
  }
}

function escHtml(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
