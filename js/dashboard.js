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
    const data = await apiFetch('/data/morning-briefing');
    if (!data) return;
    renderKPIs(data);
    renderAR(data.ar);
    renderDeadlines(data.pipeline.upcoming);
    renderPipeline(data.pipeline);
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
