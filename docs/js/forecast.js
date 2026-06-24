// LAC Revenue Forecast & Capacity Planning

Chart.defaults.font.family = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
Chart.defaults.font.size   = 12;
Chart.defaults.color       = '#5A6B7C';

const NAVY   = '#1B2A3F';
const BLUE   = '#2E6DA4';
const GREEN  = '#1A7A4A';
const YELLOW = '#D4880A';
const RED    = '#C0392B';
const BORDER = '#E0E6ED';

const charts = {};

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  if (!requireAuth()) return;
  const p = jwtPayload(getJWT());
  document.getElementById('nav-user').textContent = (p?.email || '').split('@')[0];
  loadForecast();
  setInterval(loadForecast, 3 * 60 * 1000);
});

async function loadForecast() {
  setStatus('Loading…');
  try {
    const data = await apiFetch('/data/forecast');
    if (!data) return;
    renderKPIs(data);
    renderRevenueChart(data);
    renderWorkloadChart(data);
    renderPipelineStageChart(data.pipeline);
    renderStageTable(data.pipeline);
    setStatus(`Updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
  } catch (err) {
    setStatus(`Error: ${err.message}`);
    document.getElementById('error-banner').textContent = err.message;
    document.getElementById('error-banner').hidden = false;
  }
}

function setStatus(t) { document.getElementById('refresh-status').textContent = t; }

// ---------------------------------------------------------------------------
// KPI row
// ---------------------------------------------------------------------------

function renderKPIs(data) {
  const p = data.pipeline;
  document.getElementById('kpi-pipeline-value').textContent = fmt$(p.total_est_value);
  document.getElementById('kpi-weighted').textContent       = fmt$(p.total_weighted);
  document.getElementById('kpi-avg-fee').textContent        = fmt$(data.avg_fee);

  // 6-month forecast total
  const forecast6 = data.forecast.reduce((s, m) => s + m.projected, 0);
  document.getElementById('kpi-forecast6').textContent = fmt$(forecast6);

  // Methodology note
  const hasBudget = (data.actuals || []).some(m => m.budgeted > 0) ||
                    (data.forecast || []).some(m => m.budgeted > 0);
  document.getElementById('methodology-note').textContent =
    data.avg_fee > 0
      ? `Fee estimates use the historical average of ${fmt$(data.avg_fee)} per engagement from AR Aging. ` +
        `Stage probabilities: Proposal 25%, In Progress 75%, Review 90%. ` +
        `Capacity limit: ${p.capacity} engagements/month.` +
        (hasBudget ? ' Green line = budgeted revenue from Budget & Projections tab.' : '')
      : 'No historical AR data found — forecasts will be $0 until AR Aging data is available.';
}

// ---------------------------------------------------------------------------
// Combined actuals + forecast revenue chart
// ---------------------------------------------------------------------------

function renderRevenueChart(data) {
  destroy('chartRevenue');

  const actualLabels   = data.actuals.map(m => m.label);
  const forecastLabels = data.forecast.map(m => m.label);
  const allLabels = [...actualLabels, ...forecastLabels];

  const actualData   = [...data.actuals.map(m => m.billed),    ...new Array(6).fill(null)];
  const forecastData = [...new Array(6).fill(null), ...data.forecast.map(m => m.projected)];
  const budgetData   = [
    ...data.actuals.map(m => m.budgeted || null),
    ...data.forecast.map(m => m.budgeted || null),
  ];
  const hasBudget = budgetData.some(v => v && v > 0);

  const ctx = document.getElementById('chartRevenue').getContext('2d');
  charts['chartRevenue'] = new Chart(ctx, {
    data: {
      labels: allLabels,
      datasets: [
        {
          type: 'bar',
          label: 'Actual Billed',
          data: actualData,
          backgroundColor: NAVY + 'BB',
          borderColor:     NAVY,
          borderWidth: 1,
          borderRadius: 3,
          order: 2,
        },
        {
          type: 'bar',
          label: 'Projected',
          data: forecastData,
          backgroundColor: BLUE + '66',
          borderColor:     BLUE,
          borderWidth: 2,
          borderRadius: 3,
          order: 2,
        },
        ...(hasBudget ? [{
          type: 'line',
          label: 'Budget',
          data: budgetData,
          borderColor:     GREEN,
          backgroundColor: 'transparent',
          borderWidth: 2,
          borderDash: [5, 4],
          pointRadius: 3,
          pointBackgroundColor: GREEN,
          fill: false,
          tension: 0.1,
          order: 1,
        }] : []),
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index' },
      plugins: {
        legend: { position: 'top', labels: { boxWidth: 12 } },
        tooltip: {
          callbacks: {
            label: ctx => ctx.parsed.y != null ? ` ${ctx.dataset.label}: ${fmt$(ctx.parsed.y)}` : null,
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: BORDER },
          ticks: { callback: v => fmtK(v) },
        },
        x: { grid: { display: false } },
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Workload capacity chart
// ---------------------------------------------------------------------------

function renderWorkloadChart(data) {
  destroy('chartWorkload');

  const capacity = data.pipeline.capacity;
  const labels   = data.workload.map(w => w.label);
  const counts   = data.workload.map(w => w.count);
  const barColors = data.workload.map(w => {
    const pct = capacity > 0 ? w.count / capacity : 0;
    if (pct > 1)    return RED   + 'BB';
    if (pct > 0.75) return YELLOW + 'BB';
    return NAVY + 'BB';
  });
  const borderColors = data.workload.map(w => {
    const pct = capacity > 0 ? w.count / capacity : 0;
    if (pct > 1)    return RED;
    if (pct > 0.75) return YELLOW;
    return NAVY;
  });

  const ctx = document.getElementById('chartWorkload').getContext('2d');
  charts['chartWorkload'] = new Chart(ctx, {
    data: {
      labels,
      datasets: [
        {
          type: 'bar',
          label: 'Engagements Due',
          data: counts,
          backgroundColor: barColors,
          borderColor:     borderColors,
          borderWidth: 1,
          borderRadius: 3,
          order: 2,
        },
        {
          type: 'line',
          label: `Capacity (${capacity})`,
          data: new Array(labels.length).fill(capacity),
          borderColor: RED,
          borderWidth: 2,
          borderDash: [6, 4],
          pointRadius: 0,
          fill: false,
          tension: 0,
          order: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { boxWidth: 12 } },
        tooltip: {
          callbacks: {
            afterBody: (items) => {
              const idx = items[0]?.dataIndex;
              if (idx == null) return;
              const w = data.workload[idx];
              return [`Unique clients: ${w.unique_clients}`, w.over_capacity ? '⚠ Over capacity' : ''];
            },
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: BORDER },
          ticks: { precision: 0 },
        },
        x: { grid: { display: false } },
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Pipeline by stage (weighted value) — horizontal bar
// ---------------------------------------------------------------------------

function renderPipelineStageChart(pipeline) {
  destroy('chartPipelineStage');

  const stages   = pipeline.by_stage.map(s => s.stage);
  const weighted = pipeline.by_stage.map(s => s.weighted);
  const estTotal = pipeline.by_stage.map(s => s.est_value);

  const ctx = document.getElementById('chartPipelineStage').getContext('2d');
  charts['chartPipelineStage'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: stages,
      datasets: [
        {
          label: 'Weighted Value',
          data: weighted,
          backgroundColor: NAVY + 'BB',
          borderColor:     NAVY,
          borderWidth: 1,
          borderRadius: 3,
        },
        {
          label: 'Est. Total Value',
          data: estTotal,
          backgroundColor: BLUE + '33',
          borderColor:     BLUE,
          borderWidth: 1,
          borderRadius: 3,
        },
      ],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { boxWidth: 12 } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmt$(ctx.parsed.x)}` } },
      },
      scales: {
        x: {
          beginAtZero: true,
          grid: { color: BORDER },
          ticks: { callback: v => fmtK(v) },
        },
        y: { grid: { display: false } },
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Pipeline stage detail table
// ---------------------------------------------------------------------------

function renderStageTable(pipeline) {
  const el = document.getElementById('stage-table');
  if (!pipeline.by_stage.length) {
    el.innerHTML = '<p class="empty-state">No active pipeline data.</p>';
    return;
  }

  const totalW = pipeline.total_weighted || 1;
  const rows = pipeline.by_stage.map(s => `
    <tr>
      <td>${s.stage}</td>
      <td class="num">${s.count}</td>
      <td class="num">${Math.round(s.probability * 100)}%</td>
      <td class="num">${fmt$(s.est_value)}</td>
      <td class="num"><strong>${fmt$(s.weighted)}</strong></td>
      <td class="num">
        <div class="prob-bar">
          <div class="prob-fill" style="width:${Math.round(s.weighted / totalW * 100)}%"></div>
        </div>
      </td>
    </tr>
  `).join('');

  el.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Stage</th>
          <th class="num">Matters</th>
          <th class="num">Probability</th>
          <th class="num">Est. Value</th>
          <th class="num">Weighted</th>
          <th>Share</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr style="font-weight:600; border-top:2px solid var(--border)">
          <td>Total</td>
          <td class="num">${pipeline.by_stage.reduce((s,r) => s + r.count, 0)}</td>
          <td></td>
          <td class="num">${fmt$(pipeline.total_est_value)}</td>
          <td class="num">${fmt$(pipeline.total_weighted)}</td>
          <td></td>
        </tr>
      </tfoot>
    </table>`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt$(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);
}
function fmtK(n) {
  if (n >= 1000) return '$' + (n / 1000).toFixed(0) + 'k';
  return fmt$(n);
}
function destroy(id) {
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
}
