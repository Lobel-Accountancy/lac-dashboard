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

  if (!data.months || data.months.length === 0) {
    document.getElementById('fin-body').innerHTML =
      `<div class="fin-empty">No financials published yet.</div>`;
    return;
  }

  renderMonthBar(data.months);
  selectMonth(data.months[data.months.length - 1]);
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
  document.querySelectorAll('.month-btn').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById(`mbtn-${month}`);
  if (btn) btn.classList.add('active');
  renderStatements(month);
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const MONTH_ORDER = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmt(v) {
  if (v === null || v === undefined) return '—';
  const n = parseFloat(v);
  if (isNaN(n) || n === 0) return '—';
  const abs = Math.abs(n);
  const f = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `(${f})` : f;
}

function fmtD(v) {
  if (v === null || v === undefined) return '$—';
  const n = parseFloat(v);
  if (isNaN(n) || n === 0) return '$—';
  const abs = Math.abs(n);
  const f = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `$(${f})` : `$${f}`;
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
    return n < 0 ? prefix + 'Accumulated Deficit' : prefix + 'Retained Earnings';
  }
  if (up === 'TOTAL EQUITY') {
    return n < 0 ? 'TOTAL EQUITY (DEFICIT)' : 'TOTAL EQUITY';
  }
  return label;
}

// ---------------------------------------------------------------------------
// Table builder
// ---------------------------------------------------------------------------

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

  const monthNum = MONTH_ORDER.indexOf(month) + 1;
  let isFirstDataRow   = true;
  let isFirstInSection = false;

  rows.forEach(row => {
    if (row.label === 'Balance Check [should be $0]:') return;

    if (row.is_section) {
      isFirstInSection = true;
      const span = showYTD ? 3 : 2;
      html += `<tr class="row-section"><td colspan="${span}">${row.label}</td></tr>`;
      return;
    }

    const v   = row.months?.[month] ?? 0;
    const ytd = row.ytd?.[month]   ?? 0;
    const isNetIncome = row.label.toUpperCase().includes('NET INCOME');

    // $ on first IS row + net income row; $ on first BS row per section + all totals
    const showDollar = showYTD
      ? (isFirstDataRow || isNetIncome)
      : (isFirstInSection || row.is_total);

    const fv        = showDollar ? fmtD(v) : fmt(v);
    const ytdNegCls = ytd < 0 ? 'val-neg' : '';
    const ytdCell   = showYTD ? `<td class="col-ytd ${ytdNegCls}">${fmt(ytd)}</td>` : '';

    isFirstDataRow   = false;
    isFirstInSection = false;

    // GL account drill-down
    const acctMatch = row.label.match(/^(\d{4,5})\s/);
    const acct = acctMatch ? acctMatch[1] : null;
    const canDrill = acct && !row.is_total && !isNetIncome && v !== 0;
    const drillAttrs = canDrill
      ? ` data-acct="${acct}" data-monthnum="${monthNum}" data-monthname="${month}" data-label="${row.label.replace(/"/g, '&quot;')}" onclick="handleTxnClick(this)" title="Click to view transactions"`
      : '';

    if (isNetIncome) {
      const cls = v >= 0 ? 'row-net-pos' : 'row-net-neg';
      html += `<tr class="${cls}">
        <td>${dynamicLabel(row.label, v)}</td>
        <td class="col-month">${fv}</td>
        ${ytdCell}
      </tr>`;
    } else if (row.is_total) {
      html += `<tr class="row-total">
        <td>${dynamicLabel(row.label, v)}</td>
        <td class="col-month">${fv}</td>
        ${ytdCell}
      </tr>`;
    } else {
      const vc = valClass(v);
      const drillCls = canDrill ? ' val-drillable' : '';
      html += `<tr>
        <td style="padding-left:28px">${dynamicLabel(row.label, v)}</td>
        <td class="col-month ${vc}${drillCls}"${drillAttrs}>${fv}</td>
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
// Transaction drill-down modal
// ---------------------------------------------------------------------------

function handleTxnClick(el) {
  openTxnModal(el.dataset.acct, el.dataset.monthnum, el.dataset.label, el.dataset.monthname);
}

async function openTxnModal(acct, monthNum, label, monthName) {
  const overlay = document.getElementById('txn-overlay');
  document.getElementById('txn-title').textContent    = `GL ${acct} — ${monthName} 2026`;
  document.getElementById('txn-subtitle').textContent = label;
  document.getElementById('txn-body').innerHTML = '<div style="padding:24px;color:var(--text-2);">Loading…</div>';
  overlay.style.display = 'flex';

  try {
    const data = await apiFetch(`/data/transactions?account=${acct}&month=${monthNum}`);
    if (!data) { document.getElementById('txn-body').innerHTML = '<div style="padding:24px;">No data.</div>'; return; }

    const txns = data.transactions || [];
    if (!txns.length) {
      document.getElementById('txn-body').innerHTML =
        '<div style="padding:24px;color:var(--text-2);">No transactions found for this period.</div>';
      return;
    }

    const n2 = n => n != null
      ? Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : '';
    const totalDebit  = txns.reduce((s, t) => s + (t.debit  || 0), 0);
    const totalCredit = txns.reduce((s, t) => s + (t.credit || 0), 0);

    const bodyRows = txns.map(t => `
      <tr style="border-bottom:1px solid var(--border);">
        <td style="padding:8px 12px;white-space:nowrap;font-size:12px;color:var(--text-2);">${t.date}</td>
        <td style="padding:8px 12px;font-family:monospace;font-size:12px;color:var(--navy);">${t.je}</td>
        <td style="padding:8px 12px;font-size:13px;">${t.desc}</td>
        <td style="padding:8px 12px;text-align:right;font-size:13px;">${t.debit  != null ? n2(t.debit)  : ''}</td>
        <td style="padding:8px 12px;text-align:right;font-size:13px;">${t.credit != null ? n2(t.credit) : ''}</td>
        <td style="padding:8px 12px;font-size:11px;color:var(--text-3);">${t.notes || ''}</td>
      </tr>`).join('');

    document.getElementById('txn-body').innerHTML = `
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#FAFBFC;border-bottom:2px solid var(--border);">
            <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-2);">Date</th>
            <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-2);">JE #</th>
            <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-2);">Description</th>
            <th style="padding:8px 12px;text-align:right;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-2);">Debit</th>
            <th style="padding:8px 12px;text-align:right;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-2);">Credit</th>
            <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-2);">Notes</th>
          </tr>
        </thead>
        <tbody>${bodyRows}</tbody>
        <tfoot>
          <tr style="background:#F7F9FC;border-top:2px solid var(--navy);">
            <td colspan="3" style="padding:8px 12px;font-size:12px;font-weight:700;color:var(--navy);">Total</td>
            <td style="padding:8px 12px;text-align:right;font-size:13px;font-weight:700;color:var(--navy);">${totalDebit  > 0 ? n2(totalDebit)  : ''}</td>
            <td style="padding:8px 12px;text-align:right;font-size:13px;font-weight:700;color:var(--navy);">${totalCredit > 0 ? n2(totalCredit) : ''}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>`;
  } catch (err) {
    document.getElementById('txn-body').innerHTML =
      `<div style="padding:24px;color:var(--danger);">Error: ${err.message}</div>`;
  }
}

function closeTxnModal() {
  document.getElementById('txn-overlay').style.display = 'none';
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

  const revenues = rowVal(data.pl, 'Total Revenue');
  const expenses = rowVal(data.pl, 'Total Expenses');
  const net      = months.map((_, i) => (revenues[i] || 0) - (expenses[i] || 0));
  const fmt$     = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

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
            callback: v => '$' + (Math.abs(v) >= 1000 ? (v / 1000).toFixed(0) + 'k' : v),
            font: { size: 11 }, color: '#8BA7C4',
          },
          grid: { color: 'rgba(0,0,0,.06)' },
        },
      },
    },
  });
}
