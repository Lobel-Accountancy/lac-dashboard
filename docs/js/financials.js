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
      `<div class="fin-empty">No financials published yet.<br>
       <span style="font-size:12px;margin-top:6px;display:block;">
         Data is released 5 days after each month-end close.</span></div>`;
    return;
  }

  renderMonthBar(data.months);
  selectMonth(data.months[data.months.length - 1]); // default to most recent
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

function buildTable(rows, month, ytdMonths, isBS = false) {
  if (!rows || rows.length === 0) return '<div class="fin-empty">No data</div>';

  const showYTD = ytdMonths.length > 0;

  let html = `<table class="stmt-table"><thead><tr>
    <th></th>
    <th class="col-month">${month}</th>
    ${showYTD ? `<th class="col-ytd">YTD</th>` : ''}
  </tr></thead><tbody>`;

  rows.forEach(row => {
    if (row.label === 'Balance Check [should be $0]:') return;

    const v   = row.months[month] ?? 0;
    // P&L: sum all months up to selected. BS: balance is already cumulative.
    const ytd = isBS ? v : ytdMonths.reduce((sum, m) => sum + (row.months[m] ?? 0), 0);
    const isNetIncome = row.label.toUpperCase().includes('NET INCOME');
    const ytdCell = showYTD ? `<td class="col-ytd ${valClass(ytd)}">${fmt(ytd)}</td>` : '';

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
  const selIdx   = MONTH_ORDER.indexOf(month);
  const ytdMonths = finData.months.filter(m => MONTH_ORDER.indexOf(m) <= selIdx);

  const plHtml = buildTable(finData.pl, month, ytdMonths, false);
  const bsHtml = buildTable(finData.bs, month, [], true);

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
