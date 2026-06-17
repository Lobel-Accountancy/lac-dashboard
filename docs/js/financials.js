/* financials.js — P&L and Balance Sheet viewer */

let finData = null;
let activeMonth = null;

document.addEventListener('DOMContentLoaded', () => {
  if (!requireAuth()) return;
  const payload = jwtPayload(getJWT());
  document.getElementById('nav-user').textContent = (payload?.email || '').split('@')[0];
  loadFinancials();
});

async function loadFinancials() {
  const data = await apiFetch('/data/financials');
  if (!data) return;

  finData = data;
  console.log('[financials] months:', data.months, '| sample PL row:', data.pl?.[1]);

  if (!data.months || data.months.length === 0) {
    document.getElementById('fin-body').innerHTML =
      `<div class="fin-empty">No financials published yet.<br>
       <span style="font-size:12px;margin-top:6px;display:block;">
         Data is released 5 days after each month-end close.</span></div>`;
    return;
  }

  renderMonthBar(data.months);
  selectMonth(data.months[data.months.length - 1]); // default to most recent
  renderRevenueChart(data);
}

function renderMonthBar(months) {
  const bar = document.getElementById('month-bar');
  bar.innerHTML = months.map(m =>
    `<button class="month-btn" id="mbtn-${m}" onclick="selectMonth('${m}')">${m} 2026</button>`
  ).join('');
}

function selectMonth(month) {
  activeMonth = month;
  // Update tab active state
  document.querySelectorAll('.month-btn').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById(`mbtn-${month}`);
  if (btn) btn.classList.add('active');
  renderStatements(month);
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function fmt(v) {
  if (v === null || v === undefined) return '—';
  const n = parseFloat(v);
  if (isNaN(n)) return '—';
  const abs = Math.abs(n);
  const formatted = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `(${formatted})` : formatted;
}

function valClass(v) {
  const n = parseFloat(v);
  if (isNaN(n) || n === 0) return 'val-zero';
  if (n < 0) return 'val-neg';
  return '';
}

function dynamicLabel(label, v) {
  const up = label.toUpperCase();
  const n = parseFloat(v);
  if (up.includes('NET INCOME') || up.includes('/ (LOSS)')) {
    const isLoss = n < 0;
    if (up.includes('YTD'))  return isLoss ? 'Net Loss YTD'    : 'Net Income YTD';
    if (up.includes('GAAP')) return isLoss ? 'Net Loss — GAAP' : 'Net Income — GAAP';
    return isLoss ? 'Net Loss' : 'Net Income';
  }
  if (up.includes('RETAINED EARNINGS') || up.includes('/DEFICIT')) {
    const prefix = label.match(/^\d+\s+/)?.[0] ?? '';
    return n < 0
      ? prefix + 'Accumulated Deficit'
      : prefix + 'Retained Earnings';
  }
  if (up === 'TOTAL EQUITY') {
    return n < 0 ? 'TOTAL EQUITY (DEFICIT)' : 'TOTAL EQUITY';
  }
  return label;
}

const MONTH_ORDER = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function buildTable(rows, month, showYTD = false) {
  if (!rows || rows.length === 0) return '<div class="fin-empty">No data</div>';

  const colgroup = showYTD
    ? `<colgroup><col class="col-label"><col class="col-month"><col class="col-ytd"></colgroup>`
    : `<colgroup><col class="col-label"><col class="col-month"></colgroup>`;

  let html = `<table class="stmt-table">${colgroup}<thead><tr>
    <th></th>
    <th class="col-month">${month}</th>
    ${showYTD ? `<th class="col-ytd">YTD</th>` : ''}
  </tr></thead><tbody>`;

  rows.forEach(row => {
    if (row.label === 'Balance Check [should be $0]:') return;

    const v   = row.months?.[month] ?? 0;
    const ytd = row.ytd?.[month]   ?? 0;
    const isNetIncome = row.label.toUpperCase().includes('NET INCOME');
    const ytdNegCls = ytd < 0 ? 'val-neg' : '';
    const ytdCell = showYTD ? `<td class="col-ytd ${ytdNegCls}">${fmt(ytd)}</td>` : '';

    if (row.is_section) {
      const span = showYTD ? 3 : 2;
      html += `<tr class="row-section"><td colspan="${span}">${row.label}</td></tr>`;
    } else if (isNetIncome) {
      const cls = v >= 0 ? 'row-net-pos' : 'row-net-neg';
      html += `<tr class="${cls}">
        <td>${dynamicLabel(row.label, v)}</td>
        <td>${fmt(v)}</td>
        ${ytdCell}
      </tr>`;
    } else if (row.is_total) {
      html += `<tr class="row-total">
        <td>${dynamicLabel(row.label, v)}</td>
        <td>${fmt(v)}</td>
        ${ytdCell}
      </tr>`;
    } else {
      const vc = valClass(v);
      html += `<tr>
        <td style="padding-left:28px">${dynamicLabel(row.label, v)}</td>
        <td class="${vc}">${fmt(v)}</td>
        ${ytdCell}
      </tr>`;
    }
  });
  html += '</tbody></table>';
  return html;
}

function renderStatements(month) {
  const plHtml = buildTable(finData.pl, month, true);
  const bsHtml = buildTable(finData.bs, month, false);

  document.getElementById('fin-body').innerHTML = `
    <div class="stmt-grid">
      <div class="stmt-card">
        <div class="stmt-title">Income Statement (P&amp;L) — ${month} 2026</div>
        ${plHtml}
      </div>
      <div class="stmt-card">
        <div class="stmt-title">Balance Sheet — ${month} 2026</div>
        ${bsHtml}
      </div>
    </div>`;
}

// ---------------------------------------------------------------------------
// Revenue vs Expenses chart
// ---------------------------------------------------------------------------

let _revenueChart = null;

function renderRevenueChart(data) {
  if (typeof Chart === 'undefined') return;
  const canvas = document.getElementById('revenue-chart');
  if (!canvas) return;
  if (_revenueChart) { _revenueChart.destroy(); _revenueChart = null; }

  const months = data.months || [];
  if (months.length === 0) return;

  function rowVal(rows, labelFragment) {
    const row = (rows || []).find(r => r.label && r.label.toLowerCase().includes(labelFragment.toLowerCase()) && r.is_total);
    return months.map(m => row ? (row.months?.[m] ?? 0) : 0);
  }

  const revenues  = rowVal(data.pl, 'Total Revenue');
  const expenses  = rowVal(data.pl, 'Total Expenses');
  const net       = months.map((_, i) => (revenues[i] || 0) - (expenses[i] || 0));

  const fmt$ = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

  _revenueChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: months,
      datasets: [
        {
          label: 'Revenue',
          data: revenues,
          backgroundColor: 'rgba(26,122,74,.75)',
          borderColor: '#1A7A4A',
          borderWidth: 1,
          borderRadius: 4,
          order: 2,
        },
        {
          label: 'Expenses',
          data: expenses,
          backgroundColor: 'rgba(192,57,43,.65)',
          borderColor: '#C0392B',
          borderWidth: 1,
          borderRadius: 4,
          order: 3,
        },
        {
          label: 'Net Income',
          data: net,
          type: 'line',
          borderColor: '#2563EB',
          backgroundColor: 'rgba(37,99,235,.08)',
          borderWidth: 2,
          pointRadius: 4,
          pointBackgroundColor: '#2563EB',
          tension: 0.3,
          fill: false,
          order: 1,
        },
      ],
    },
    options: {
      responsive: true,
      animation: { duration: 400 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: { font: { size: 12 }, boxWidth: 12, padding: 16 },
        },
        tooltip: {
          callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmt$(ctx.parsed.y)}` },
        },
      },
      scales: {
        x: {
          ticks: { font: { size: 12 }, color: '#5A6B7C' },
          grid: { color: 'rgba(0,0,0,.05)' },
        },
        y: {
          beginAtZero: true,
          ticks: {
            callback: v => '$' + (Math.abs(v) >= 1000 ? (v/1000).toFixed(0) + 'k' : v),
            font: { size: 11 }, color: '#8BA7C4',
          },
          grid: { color: 'rgba(0,0,0,.06)' },
        },
      },
    },
  });
}
