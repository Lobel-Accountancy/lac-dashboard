// LAC BI Dashboard — Chart.js powered analytics

const PALETTE = {
  navy:    '#1B2A3F',
  blue:    '#2E6DA4',
  sky:     '#3A9BBF',
  green:   '#1A7A4A',
  yellow:  '#C9920A',
  orange:  '#C05621',
  red:     '#B03030',
  darkRed: '#7B1818',
  muted:   '#8BA7C4',
  border:  '#E0E6ED',
  bg:      '#F0F2F5',
};

const AGING_COLORS = [PALETTE.green, PALETTE.yellow, PALETTE.orange, PALETTE.red, PALETTE.darkRed];
const BAR_ALPHA = 'CC'; // hex alpha for bar fills

Chart.defaults.font.family = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
Chart.defaults.font.size   = 12;
Chart.defaults.color       = '#5A6B7C';

const charts = {};

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  if (!requireAuth()) return;

  const p = jwtPayload(getJWT());
  document.getElementById('nav-user').textContent = (p?.email || '').split('@')[0];

  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  loadBI();
});

function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('tab-btn--active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-pane').forEach(p => p.hidden = p.dataset.tab !== tab);
  // Resize charts so they fill their newly-visible container
  Object.values(charts).forEach(c => c.resize());
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

async function loadBI() {
  setStatus('Loading…');
  try {
    const data = await apiFetch('/data/bi');
    if (!data) return;
    renderRevenue(data.revenue, data.revenue_mtd, data.net_income_mtd);
    renderAR(data.ar_buckets);
    renderPipeline(data.pipeline);
    setStatus(`Updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
  } catch (err) {
    setStatus(`Error: ${err.message}`);
    document.getElementById('error-banner').textContent = err.message;
    document.getElementById('error-banner').hidden = false;
  }
}

function setStatus(text) { document.getElementById('refresh-status').textContent = text; }

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function fmt$(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function fmtK(n) {
  if (n >= 1000) return '$' + (n / 1000).toFixed(0) + 'k';
  return fmt$(n);
}

// ---------------------------------------------------------------------------
// Revenue tab
// ---------------------------------------------------------------------------

function renderRevenue(rev, revMtd, niMtd) {
  // KPI row
  const totalBilled = rev.by_month.reduce((s, m) => s + m.billed, 0);
  document.getElementById('rev-mtd').textContent     = revMtd != null ? fmt$(revMtd) : '—';
  document.getElementById('rev-ytd').textContent     = fmt$(rev.ytd_billed);
  document.getElementById('rev-total12').textContent = fmt$(totalBilled);

  if (niMtd) {
    const isLoss = niMtd.value < 0;
    document.getElementById('ni-label').textContent = (isLoss ? 'Net Loss' : 'Net Income') + ' — Current Month';
    document.getElementById('ni-mtd').textContent   = fmt$(Math.abs(niMtd.value));
    document.getElementById('ni-mtd').style.color   = isLoss ? 'var(--danger)' : 'var(--ok)';
  }

  // Monthly bar chart
  destroyChart('chartRevMonthly');
  const ctx1 = document.getElementById('chartRevMonthly').getContext('2d');
  charts['chartRevMonthly'] = new Chart(ctx1, {
    type: 'bar',
    data: {
      labels: rev.by_month.map(m => m.label),
      datasets: [{
        label: 'Billed',
        data: rev.by_month.map(m => m.billed),
        backgroundColor: PALETTE.navy + BAR_ALPHA,
        borderColor:     PALETTE.navy,
        borderWidth: 1,
        borderRadius: 3,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: ctx => fmt$(ctx.parsed.y) },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: PALETTE.border },
          ticks: { callback: v => fmtK(v) },
        },
        x: { grid: { display: false } },
      },
    },
  });

  // Top clients — horizontal bar
  destroyChart('chartClients');
  const ctx2 = document.getElementById('chartClients').getContext('2d');
  charts['chartClients'] = new Chart(ctx2, {
    type: 'bar',
    data: {
      labels: rev.top_clients.map(c => c.client),
      datasets: [{
        label: 'Billed',
        data: rev.top_clients.map(c => c.billed),
        backgroundColor: PALETTE.blue + BAR_ALPHA,
        borderColor:     PALETTE.blue,
        borderWidth: 1,
        borderRadius: 3,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => fmt$(ctx.parsed.x) } },
      },
      scales: {
        x: {
          beginAtZero: true,
          grid: { color: PALETTE.border },
          ticks: { callback: v => fmtK(v) },
        },
        y: { grid: { display: false } },
      },
    },
  });

  // By type — horizontal bar
  destroyChart('chartTypes');
  const ctx3 = document.getElementById('chartTypes').getContext('2d');
  charts['chartTypes'] = new Chart(ctx3, {
    type: 'bar',
    data: {
      labels: rev.by_type.map(t => t.type),
      datasets: [{
        label: 'Billed',
        data: rev.by_type.map(t => t.billed),
        backgroundColor: PALETTE.sky + BAR_ALPHA,
        borderColor:     PALETTE.sky,
        borderWidth: 1,
        borderRadius: 3,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => fmt$(ctx.parsed.x) } },
      },
      scales: {
        x: {
          beginAtZero: true,
          grid: { color: PALETTE.border },
          ticks: { callback: v => fmtK(v) },
        },
        y: { grid: { display: false } },
      },
    },
  });

  if (rev.by_type.length === 0) {
    document.getElementById('chartTypes').closest('.chart-wrap').innerHTML =
      '<p class="empty-state" style="padding:16px">Engagement type data not available in workbook.</p>';
  }
}

// ---------------------------------------------------------------------------
// AR Aging tab
// ---------------------------------------------------------------------------

function renderAR(buckets) {
  const labels  = ['Current', '1–30 days', '31–60 days', '61–90 days', '90+ days'];
  const keys    = ['current', 'd0_30', 'd31_60', 'd61_90', 'd90plus'];
  const amounts = keys.map(k => buckets[k]?.amount || 0);
  const counts  = keys.map(k => buckets[k]?.count  || 0);
  const total   = amounts.reduce((s, a) => s + a, 0);
  const overdue = amounts.slice(1).reduce((s, a) => s + a, 0);

  // KPI
  document.getElementById('ar-total').textContent   = fmt$(total);
  document.getElementById('ar-overdue2').textContent = fmt$(overdue);
  const rate = total > 0 ? Math.round(((total - overdue) / total) * 100) : 100;
  document.getElementById('ar-current-pct').textContent = rate + '%';

  // Donut
  destroyChart('chartAgingDonut');
  const ctx = document.getElementById('chartAgingDonut').getContext('2d');
  charts['chartAgingDonut'] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: amounts,
        backgroundColor: AGING_COLORS,
        borderColor: '#fff',
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '60%',
      plugins: {
        legend: {
          position: 'right',
          labels: { boxWidth: 12, padding: 12 },
        },
        tooltip: {
          callbacks: {
            label: ctx => ` ${fmt$(ctx.parsed)}  (${counts[ctx.dataIndex]} inv.)`,
          },
        },
      },
    },
  });

  // Bucket table
  const rows = labels.map((lbl, i) => `
    <tr>
      <td><span class="dot" style="background:${AGING_COLORS[i]}"></span>${lbl}</td>
      <td class="num">${counts[i]}</td>
      <td class="num">${fmt$(amounts[i])}</td>
      <td class="num">${total > 0 ? Math.round((amounts[i] / total) * 100) : 0}%</td>
    </tr>
  `).join('');

  document.getElementById('ar-bucket-table').innerHTML = `
    <table class="data-table">
      <thead><tr><th>Bucket</th><th class="num">Invoices</th><th class="num">Amount</th><th class="num">% of AR</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

// ---------------------------------------------------------------------------
// Pipeline tab
// ---------------------------------------------------------------------------

function renderPipeline(pipeline) {
  const stages  = Object.keys(pipeline.by_stage);
  const stageCts = Object.values(pipeline.by_stage);
  const total   = stageCts.reduce((s, n) => s + n, 0);

  document.getElementById('pl-active').textContent = total;
  document.getElementById('pl-types').textContent  = Object.keys(pipeline.by_type).length;

  // Stage funnel — horizontal bar
  destroyChart('chartStages');
  const ctx1 = document.getElementById('chartStages').getContext('2d');
  charts['chartStages'] = new Chart(ctx1, {
    type: 'bar',
    data: {
      labels: stages,
      datasets: [{
        label: 'Matters',
        data: stageCts,
        backgroundColor: PALETTE.navy + BAR_ALPHA,
        borderColor:     PALETTE.navy,
        borderWidth: 1,
        borderRadius: 3,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.x} matter${ctx.parsed.x !== 1 ? 's' : ''}` } },
      },
      scales: {
        x: { beginAtZero: true, grid: { color: PALETTE.border }, ticks: { precision: 0 } },
        y: { grid: { display: false } },
      },
    },
  });

  // By type — horizontal bar
  const types  = Object.keys(pipeline.by_type);
  const typeCts = Object.values(pipeline.by_type);

  destroyChart('chartEngTypes');
  const ctx2 = document.getElementById('chartEngTypes').getContext('2d');
  charts['chartEngTypes'] = new Chart(ctx2, {
    type: 'bar',
    data: {
      labels: types,
      datasets: [{
        label: 'Matters',
        data: typeCts,
        backgroundColor: PALETTE.blue + BAR_ALPHA,
        borderColor:     PALETTE.blue,
        borderWidth: 1,
        borderRadius: 3,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.x} matter${ctx.parsed.x !== 1 ? 's' : ''}` } },
      },
      scales: {
        x: { beginAtZero: true, grid: { color: PALETTE.border }, ticks: { precision: 0 } },
        y: { grid: { display: false } },
      },
    },
  });

  // Due-by-month bar chart
  destroyChart('chartDueMonth');
  const ctx3 = document.getElementById('chartDueMonth').getContext('2d');
  charts['chartDueMonth'] = new Chart(ctx3, {
    type: 'bar',
    data: {
      labels: pipeline.due_by_month.map(m => m.label),
      datasets: [{
        label: 'Due',
        data: pipeline.due_by_month.map(m => m.count),
        backgroundColor: PALETTE.sky + BAR_ALPHA,
        borderColor:     PALETTE.sky,
        borderWidth: 1,
        borderRadius: 3,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.y} matter${ctx.parsed.y !== 1 ? 's' : ''} due` } },
      },
      scales: {
        y: { beginAtZero: true, grid: { color: PALETTE.border }, ticks: { precision: 0 } },
        x: { grid: { display: false } },
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function destroyChart(id) {
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
}
