const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  if (!requireAuth()) return;

  const payload = jwtPayload(getJWT());
  const name = (payload?.email || '').split('@')[0];
  document.getElementById('nav-user').textContent = name;
  document.getElementById('greeting').textContent = greeting();

  loadBriefing();
  setInterval(loadBriefing, REFRESH_INTERVAL);
});

function greeting() {
  const h = new Date().getHours();
  const part = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
  return `Good ${part}, Jeffrey`;
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

async function loadBriefing() {
  setRefreshStatus('Refreshing…');
  try {
    const [data, reg, compliance, cal] = await Promise.all([
      apiFetch('/data/morning-briefing'),
      apiFetch('/data/regulatory').catch(() => null),
      apiFetch('/data/compliance-dates').catch(() => null),
      apiFetch('/data/calendar').catch(() => null),
    ]);
    if (!data) return;
    renderKPIs(data);
    renderAR(data.ar);
    renderDeadlines(data.pipeline.upcoming);
    renderCompliance(compliance);
    renderCalendar(cal);
    renderPipeline(data.pipeline);
    renderRegulatory(reg);
    setRefreshStatus(`Updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
  } catch (err) {
    setRefreshStatus(`Error: ${err.message}`);
    document.getElementById('error-banner').textContent = err.message;
    document.getElementById('error-banner').hidden = false;
  }
}

function setRefreshStatus(text) {
  document.getElementById('refresh-status').textContent = text;
}

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

function fmt$(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function urgencyClass(days) {
  if (days < 0)  return 'overdue';
  if (days <= 7)  return 'urgent';
  if (days <= 14) return 'warning';
  return 'ok';
}

function urgencyLabel(days) {
  if (days < 0)  return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'Due today';
  return `${days}d`;
}

// ---------------------------------------------------------------------------
// KPI cards
// ---------------------------------------------------------------------------

function renderKPIs(data) {
  const { ar, pipeline } = data;
  const grid = document.getElementById('kpi-grid');
  grid.innerHTML = `
    <div class="kpi-card">
      <div class="kpi-label">Total AR Outstanding</div>
      <div class="kpi-value">${fmt$(ar.total_outstanding)}</div>
      <div class="kpi-sub">${ar.items.length} open invoice${ar.items.length !== 1 ? 's' : ''}</div>
    </div>
    <div class="kpi-card ${ar.overdue_amount > 0 ? 'kpi-card--danger' : ''}">
      <div class="kpi-label">Overdue</div>
      <div class="kpi-value">${fmt$(ar.overdue_amount)}</div>
      <div class="kpi-sub">${ar.overdue_count} invoice${ar.overdue_count !== 1 ? 's' : ''} past due</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Active Matters</div>
      <div class="kpi-value">${pipeline.total_active}</div>
      <div class="kpi-sub">${Object.keys(pipeline.by_stage).length} stage${Object.keys(pipeline.by_stage).length !== 1 ? 's' : ''}</div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// AR Aging table
// ---------------------------------------------------------------------------

function renderAR(ar) {
  const body = document.getElementById('ar-body');
  const overdue = ar.items.filter(i => i.days_overdue > 0);

  if (overdue.length === 0) {
    body.innerHTML = '<p class="empty-state">No overdue invoices.</p>';
    return;
  }

  const rows = overdue.map(i => `
    <tr class="row--${urgencyClass(i.days_overdue > 0 ? -i.days_overdue : 0)}">
      <td>${i.client}</td>
      <td class="mono">${i.invoice}</td>
      <td class="num">${fmt$(i.outstanding)}</td>
      <td><span class="badge badge--${i.days_overdue > 30 ? 'danger' : i.days_overdue > 14 ? 'warning' : 'muted'}">${i.days_overdue}d</span></td>
    </tr>
  `).join('');

  body.innerHTML = `
    <table class="data-table">
      <thead><tr><th>Client</th><th>Invoice</th><th class="num">Outstanding</th><th>Overdue</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

// ---------------------------------------------------------------------------
// Upcoming deadlines
// ---------------------------------------------------------------------------

function renderDeadlines(upcoming) {
  const body = document.getElementById('deadlines-body');

  if (!upcoming || upcoming.length === 0) {
    body.innerHTML = '<p class="empty-state">No deadlines in the next 30 days.</p>';
    return;
  }

  const items = upcoming.map(d => `
    <div class="deadline-item">
      <span class="deadline-badge badge--${urgencyClass(d.days_until)}">${urgencyLabel(d.days_until)}</span>
      <div class="deadline-info">
        <div class="deadline-client">${d.client}</div>
        <div class="deadline-meta">${d.type} · ${d.stage}</div>
      </div>
      <div class="deadline-date">${d.due_date ? new Date(d.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}</div>
    </div>
  `).join('');

  body.innerHTML = `<div class="deadline-list">${items}</div>`;
}

// ---------------------------------------------------------------------------
// Key Compliance Dates
// ---------------------------------------------------------------------------

function renderCompliance(data) {
  const body = document.getElementById('compliance-body');
  if (!data || !data.items || data.items.length === 0) {
    body.innerHTML = '<p class="empty-state">No upcoming compliance dates.</p>';
    return;
  }

  const items = data.items.map(item => {
    const d = item.days_until;
    let badgeCls, badgeText;
    if (d < 0)       { badgeCls = 'badge--danger';  badgeText = `${Math.abs(d)}d overdue`; }
    else if (d <= 7)  { badgeCls = 'badge--danger';  badgeText = `${d}d`; }
    else if (d <= 30) { badgeCls = 'badge--warning'; badgeText = `${d}d`; }
    else              { badgeCls = 'badge--muted';   badgeText = `${d}d`; }

    const due = new Date(item.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const esc = s => String(s||'').replace(/'/g, "\\'").replace(/"/g, '&quot;');
    return `
      <div class="deadline-item" id="comp-${esc(item.obligation).replace(/\s+/g,'_').slice(0,30)}">
        <span class="deadline-badge ${badgeCls}">${badgeText}</span>
        <div class="deadline-info">
          <div class="deadline-client">${item.obligation}</div>
          <div class="deadline-meta">${item.category} · ${item.frequency}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
          <div class="deadline-date">${due}</div>
          <button onclick="markComplianceDone('${esc(item.obligation)}')"
            style="font-size:11px;padding:3px 8px;background:#1A7A4A;color:white;border:none;
                   border-radius:4px;cursor:pointer;white-space:nowrap;">Done</button>
        </div>
      </div>`;
  }).join('');

  body.innerHTML = `<div class="deadline-list">${items}</div>`;
}

async function markComplianceDone(obligation) {
  const res = await apiFetch('/data/compliance-complete', {
    method: 'POST',
    body: JSON.stringify({ obligation }),
  });
  if (res && res.success) {
    // Remove the item from the list
    const id = 'comp-' + obligation.replace(/'/g, '').replace(/\s+/g, '_').slice(0, 30);
    const el = document.getElementById(id);
    if (el) {
      el.style.opacity = '0.4';
      el.style.textDecoration = 'line-through';
      setTimeout(() => el.remove(), 800);
    }
  }
}

// ---------------------------------------------------------------------------
// Calendar Events
// ---------------------------------------------------------------------------

function renderCalendar(data) {
  const body = document.getElementById('calendar-body');
  if (!data) {
    body.innerHTML = '<p class="empty-state">Calendar unavailable.</p>';
    return;
  }
  if (data.error && !data.events.length) {
    body.innerHTML = `<p class="empty-state">Calendar not shared yet.</p>`;
    return;
  }
  if (!data.events || data.events.length === 0) {
    body.innerHTML = '<p class="empty-state">No events in the next 14 days.</p>';
    return;
  }

  const items = data.events.map(ev => {
    let label, dateStr;
    if (ev.all_day) {
      const d = new Date(ev.start + 'T00:00:00');
      dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      label   = 'All day';
    } else {
      const d = new Date(ev.start);
      dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      label   = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    }
    const today = new Date(); today.setHours(0,0,0,0);
    const evDay = new Date(ev.all_day ? ev.start + 'T00:00:00' : ev.start);
    evDay.setHours(0,0,0,0);
    const daysUntil = Math.round((evDay - today) / 86400000);
    const badgeCls  = daysUntil === 0 ? 'badge--danger' : daysUntil <= 2 ? 'badge--warning' : 'badge--muted';

    return `
      <div class="deadline-item">
        <span class="deadline-badge ${badgeCls}">${daysUntil === 0 ? 'Today' : daysUntil + 'd'}</span>
        <div class="deadline-info">
          <div class="deadline-client">${ev.title}</div>
          <div class="deadline-meta">${dateStr} · ${label}${ev.location ? ' · ' + ev.location : ''}</div>
        </div>
      </div>`;
  }).join('');

  body.innerHTML = `<div class="deadline-list">${items}</div>`;
}

// ---------------------------------------------------------------------------
// Pipeline stage chips
// ---------------------------------------------------------------------------

function renderPipeline(pipeline) {
  const body = document.getElementById('pipeline-body');
  const stages = Object.entries(pipeline.by_stage);

  if (stages.length === 0) {
    body.innerHTML = '<p class="empty-state">No active matters.</p>';
    return;
  }

  const chips = stages.map(([stage, count]) => `
    <div class="stage-chip">
      <div class="stage-count">${count}</div>
      <div class="stage-name">${stage}</div>
    </div>
  `).join('');

  body.innerHTML = `<div class="stage-grid">${chips}</div>`;
}

// ---------------------------------------------------------------------------
// Regulatory updates
// ---------------------------------------------------------------------------

function renderRegulatory(data) {
  const body  = document.getElementById('reg-body');
  const label = document.getElementById('reg-digest-label');

  if (!data || !data.items) {
    body.innerHTML = '<span class="empty-state">No data available.</span>';
    return;
  }

  if (data.last_digest) {
    label.textContent = `Last digest: ${data.last_digest}`;
  }

  if (!data.items.length) {
    body.innerHTML = '<span class="empty-state">No new items since last digest.</span>';
    return;
  }

  const SOURCE_COLORS = {
    'PCAOB':       '#7C3AED',
    'AICPA Tax':   '#1D4ED8',
    'AICPA Audit': '#1A7A4A',
  };

  const rows = data.items.map(item => {
    const color  = SOURCE_COLORS[item.source] || '#5A6B7C';
    const urgent = item.urgent
      ? `<span style="display:inline-block;padding:1px 6px;border-radius:8px;
           background:#FEF3C7;color:#92400E;font-size:10px;font-weight:700;
           margin-left:6px;vertical-align:middle;">PRIORITY</span>`
      : '';
    return `
      <div style="display:flex;align-items:baseline;gap:10px;padding:9px 0;
           border-bottom:1px solid var(--border);">
        <span style="display:inline-block;min-width:82px;padding:2px 7px;
          border-radius:10px;font-size:10px;font-weight:700;text-align:center;
          background:${color}18;color:${color};flex-shrink:0;">
          ${item.source}
        </span>
        <span style="flex:1;font-size:13px;line-height:1.4;">
          <a href="${item.url}" target="_blank" rel="noopener"
             style="color:var(--text);text-decoration:none;">
            ${item.title}
          </a>${urgent}
        </span>
        <span style="font-size:11px;color:var(--text2);white-space:nowrap;flex-shrink:0;">
          ${item.found}
        </span>
      </div>`;
  }).join('');

  body.innerHTML = `<div style="padding:0 4px;">${rows}</div>`;
}
