const REFRESH_INTERVAL = 5 * 60 * 1000;

let _pipelineChart   = null;
let _arDonutChart    = null;
let _sparkChart      = null;
let _briefingInterval = null;

document.addEventListener('DOMContentLoaded', () => {
  if (!requireAuth()) return;
  const payload = jwtPayload(getJWT());
  const name = (payload?.email || '').split('@')[0];
  document.getElementById('nav-user').textContent = name;
  document.getElementById('greeting').textContent = greeting();
  loadBriefing();
  if (_briefingInterval) clearInterval(_briefingInterval);
  _briefingInterval = setInterval(loadBriefing, REFRESH_INTERVAL);
});

function greeting() {
  const h = new Date().getHours();
  const part = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
  return `Good ${part}, Jeffrey`;
}

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
    renderPipelineChart(data.pipeline);
    renderARDonut(data.ar);
    renderRegulatory(reg);
    // Share overdue count so nav.js badge skips a redundant API call on other pages
    sessionStorage.setItem('lac_badge_overdue', data.ar?.overdue_count || 0);
    sessionStorage.setItem('lac_badge_overdue_ts', Date.now());
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
  const revMtd  = data.revenue_mtd;
  const trend   = data.revenue_trend || [];
  const month   = new Date().toLocaleString('en-US', { month: 'long' });
  const grid    = document.getElementById('kpi-grid');

  // Destroy existing sparkline before its canvas element is removed from DOM
  const oldCanvas = document.getElementById('revenue-sparkline');
  if (oldCanvas?._chart) { oldCanvas._chart.destroy(); oldCanvas._chart = null; }

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
    <div class="kpi-card" id="revenue-kpi-card">
      <div class="kpi-label">Revenue — ${month}</div>
      <div class="kpi-value">${revMtd != null ? fmt$(revMtd) : '—'}</div>
      <div class="kpi-sub" style="margin-bottom:6px;">Income Statement · Total Revenue</div>
      <canvas id="revenue-sparkline" height="36" style="width:100%;display:block;"></canvas>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Active Matters</div>
      <div class="kpi-value">${pipeline.total_active}</div>
      <div class="kpi-sub">${Object.keys(pipeline.by_stage).length} stage${Object.keys(pipeline.by_stage).length !== 1 ? 's' : ''}</div>
    </div>
  `;

  if (trend.length >= 2) {
    renderSparkline('revenue-sparkline', trend);
  }
}

function renderSparkline(canvasId, trend) {
  if (typeof Chart === 'undefined') return;
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  if (canvas._chart) { canvas._chart.destroy(); }

  const labels   = trend.map(d => d.month);
  const revenues = trend.map(d => d.revenue);
  const up = revenues[revenues.length - 1] >= revenues[0];

  canvas._chart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: revenues,
        borderColor: up ? '#1A7A4A' : '#C0392B',
        backgroundColor: up ? 'rgba(26,122,74,.08)' : 'rgba(192,57,43,.08)',
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.4,
        fill: true,
      }],
    },
    options: {
      responsive: false,
      animation: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: {
        x: { display: false },
        y: { display: false },
      },
    },
  });
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

  const rows = overdue.map(i => {
    const href = `clients.html?client=${encodeURIComponent(i.client)}`;
    return `
    <tr class="row--${urgencyClass(i.days_overdue > 0 ? -i.days_overdue : 0)} row-link" onclick="window.location.href='${href}'" style="cursor:pointer" title="Open in AR Aging">
      <td>${i.client}</td>
      <td class="mono">${i.invoice}</td>
      <td class="num">${fmt$(i.outstanding)}</td>
      <td><span class="badge badge--${i.days_overdue > 30 ? 'danger' : i.days_overdue > 14 ? 'warning' : 'muted'}">${i.days_overdue}d</span></td>
    </tr>`;
  }).join('');

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
    const esc  = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const slug = item.obligation.replace(/[^A-Za-z0-9]+/g, '_').slice(0, 30);
    return `
      <div class="deadline-item" id="comp-${slug}">
        <span class="deadline-badge ${badgeCls}">${badgeText}</span>
        <div class="deadline-info">
          <div class="deadline-client">${esc(item.obligation)}</div>
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
  const slug = obligation.replace(/[^A-Za-z0-9]+/g, '_').slice(0, 30);
  const el   = document.getElementById('comp-' + slug);
  if (el) { el.style.opacity = '0.4'; el.style.pointerEvents = 'none'; }
  const res = await apiFetch('/data/compliance-complete', {
    method: 'POST',
    body: JSON.stringify({ obligation }),
  });
  if (res?.success) {
    if (el) {
      el.style.transition = 'opacity 0.3s';
      el.style.opacity = '0';
      setTimeout(() => { if (el.parentNode) el.remove(); }, 300);
    }
  } else {
    if (el) { el.style.opacity = '1'; el.style.pointerEvents = ''; }
    showToast(res?.error || 'Could not mark as complete — try refreshing.', 'error');
  }
}

// ---------------------------------------------------------------------------
// Calendar Events
// ---------------------------------------------------------------------------

function renderCalendar(data) {
  const body = document.getElementById('calendar-body');
  if (!data) { body.innerHTML = '<p class="empty-state">Calendar unavailable.</p>'; return; }
  if (data.error && !data.events.length) { body.innerHTML = `<p class="empty-state">Calendar not shared yet.</p>`; return; }
  if (!data.events || data.events.length === 0) { body.innerHTML = '<p class="empty-state">No events in the next 14 days.</p>'; return; }
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
    const evDay = new Date(ev.all_day ? ev.start + 'T00:00:00' : ev.start); evDay.setHours(0,0,0,0);
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
// Pipeline Chart (horizontal bar)
// ---------------------------------------------------------------------------

function renderPipelineChart(pipeline) {
  if (typeof Chart === 'undefined') return;
  const canvas = document.getElementById('pipeline-chart');
  if (!canvas) return;
  if (_pipelineChart) { _pipelineChart.destroy(); _pipelineChart = null; }

  const stages = Object.entries(pipeline.by_stage);
  if (!stages.length) {
    canvas.parentElement.innerHTML = '<p class="empty-state">No active matters.</p>';
    return;
  }

  const COLORS = [
    '#1B2A3F','#2563EB','#1A7A4A','#065F46','#7C3AED','#D4880A','#C0392B',
  ];

  const labels  = stages.map(([s]) => s);
  const counts  = stages.map(([, c]) => c);

  _pipelineChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: counts,
        backgroundColor: labels.map((_, i) => COLORS[i % COLORS.length] + 'CC'),
        borderColor:     labels.map((_, i) => COLORS[i % COLORS.length]),
        borderWidth: 1,
        borderRadius: 4,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      animation: { duration: 400 },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.parsed.x} matter${ctx.parsed.x !== 1 ? 's' : ''}`,
          },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: { stepSize: 1, font: { size: 11 }, color: '#8BA7C4' },
          grid: { color: 'rgba(0,0,0,.06)' },
        },
        y: {
          ticks: { font: { size: 12 }, color: '#2C3E50' },
          grid: { display: false },
        },
      },
    },
  });
}

// ---------------------------------------------------------------------------
// AR Aging Donut
// ---------------------------------------------------------------------------

function renderARDonut(ar) {
  if (typeof Chart === 'undefined') return;
  const canvas = document.getElementById('ar-donut-chart');
  if (!canvas) return;
  if (_arDonutChart) { _arDonutChart.destroy(); _arDonutChart = null; }

  const buckets = { 'Current': 0, '1–30 days': 0, '31–60 days': 0, '60+ days': 0 };
  (ar.items || []).forEach(inv => {
    const d = inv.days_overdue || 0;
    const amt = inv.outstanding || 0;
    if (d <= 0)       buckets['Current']         += amt;
    else if (d <= 30) buckets['1–30 days']  += amt;
    else if (d <= 60) buckets['31–60 days'] += amt;
    else              buckets['60+ days']         += amt;
  });

  const labels = Object.keys(buckets).filter(k => buckets[k] > 0);
  const values = labels.map(k => buckets[k]);

  if (!values.length) {
    document.getElementById('ar-donut-body').innerHTML = '<p class="empty-state">No open AR.</p>';
    return;
  }

  const COLORS = ['#1A7A4A', '#D4880A', '#E67E22', '#C0392B'];

  const fmt$ = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

  const legend = document.getElementById('ar-donut-legend');
  if (legend) {
    legend.innerHTML = labels.map((l, i) =>
      `<div><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${COLORS[i]};margin-right:6px;vertical-align:middle;"></span>${l}: <strong>${fmt$(values[i])}</strong></div>`
    ).join('');
  }

  _arDonutChart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: COLORS.slice(0, labels.length),
        borderWidth: 2,
        borderColor: '#fff',
        hoverOffset: 6,
      }],
    },
    options: {
      responsive: false,
      animation: { duration: 400 },
      cutout: '68%',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.label}: ${fmt$(ctx.parsed)}`,
          },
        },
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Regulatory updates
// ---------------------------------------------------------------------------

function renderRegulatory(data) {
  const body  = document.getElementById('reg-body');
  const label = document.getElementById('reg-digest-label');
  if (!data || !data.items) { body.innerHTML = '<span class="empty-state">No data available.</span>'; return; }
  if (data.last_digest) label.textContent = `Last digest: ${data.last_digest}`;
  if (!data.items.length) { body.innerHTML = '<span class="empty-state">No new items since last digest.</span>'; return; }
  const SOURCE_COLORS = { 'PCAOB': '#7C3AED', 'AICPA Tax': '#1D4ED8', 'AICPA Audit': '#1A7A4A' };
  const rows = data.items.map(item => {
    const color  = SOURCE_COLORS[item.source] || '#5A6B7C';
    const urgent = item.urgent
      ? `<span style="display:inline-block;padding:1px 6px;border-radius:8px;background:#FEF3C7;color:#92400E;font-size:10px;font-weight:700;margin-left:6px;vertical-align:middle;">PRIORITY</span>`
      : '';
    return `
      <div style="display:flex;align-items:baseline;gap:10px;padding:9px 0;border-bottom:1px solid var(--border);">
        <span style="display:inline-block;min-width:82px;padding:2px 7px;border-radius:10px;font-size:10px;font-weight:700;text-align:center;background:${color}18;color:${color};flex-shrink:0;">${item.source}</span>
        <span style="flex:1;font-size:13px;line-height:1.4;"><a href="${item.url}" target="_blank" rel="noopener" style="color:var(--text);text-decoration:none;">${item.title}</a>${urgent}</span>
        <span style="font-size:11px;color:var(--text-2);white-space:nowrap;flex-shrink:0;">${item.found}</span>
      </div>`;
  }).join('');
  body.innerHTML = `<div style="padding:0 4px;">${rows}</div>`;
}
