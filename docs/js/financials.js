/* financials.js — P&L and Balance Sheet viewer */

let finData = null;
let activeMonth = null;

const FISCAL_YEAR = new Date().getFullYear();

document.addEventListener('DOMContentLoaded', () => {
  if (!requireAuth()) return;
  const payload = jwtPayload(getJWT());
  document.getElementById('nav-user').textContent = (payload?.email || '').split('@')[0];
  loadFinancials();
});

async function loadFinancials() {
  try {
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
  } catch (err) {
    document.getElementById('fin-body').innerHTML =
      `<div class="fin-empty">Unable to load financials: ${err.message}</div>`;
  }
}

function renderMonthBar(months) {
  const bar = document.getElementById('month-bar');
  bar.innerHTML = months.map(m =>
    `<button class="month-btn" id="mbtn-${m}" onclick="selectMonth('${m}')">${m} ${FISCAL_YEAR}</button>`
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

  const colgroup = `<colgroup><col class="col-label"><col class="col-month"><col class="col-ytd"></colgroup>`;

  let html = `<table class="stmt-table">${colgroup}<thead><tr>
    <th></th>
    <th class="col-month">${month}</th>
    ${showYTD ? `<th class="col-ytd">YTD</th>` : `<th style="width:22%"></th>`}
  </tr></thead><tbody>`;

  const monthNum = MONTH_ORDER.indexOf(month) + 1;
  let isFirstDataRow   = true;
  let isFirstInSection = false;

  rows.forEach(row => {
    if (row.label === 'Balance Check [should be $0]:') return;

    if (row.is_section) {
      isFirstInSection = true;
      html += `<tr class="row-section"><td colspan="3">${row.label}</td></tr>`;
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
    const ytdCell   = showYTD
      ? `<td class="col-ytd ${ytdNegCls}">${fmt(ytd)}</td>`
      : `<td style="width:22%;background:inherit;border-bottom:inherit;border-left:none;"></td>`;

    isFirstDataRow   = false;
    isFirstInSection = false;

    // GL account drill-down
    const acctMatch = row.label.match(/^(\d{4,5})\s/);
    const acct = acctMatch ? acctMatch[1] : null;
    const canDrill = acct && !row.is_total && !isNetIncome && v !== 0;
    const drillAttrs = canDrill
      ? ` data-acct="${acct}" data-monthnum="${monthNum}" data-monthname="${month}" data-label="${row.label.replace(/"/g, '&quot;')}" onclick="handleTxnClick(this)" onmouseenter="showGlTooltip(this)" onmouseleave="hideGlTooltip()" title="Click to view transactions"`
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
        <div class="stmt-title">Income Statement (P&amp;L) — ${month} ${FISCAL_YEAR}</div>
        ${plHtml}
      </div>
      <div class="stmt-card">
        <div class="stmt-title">Balance Sheet — ${month} ${FISCAL_YEAR}</div>
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
  document.getElementById('txn-title').textContent    = `GL ${acct} — ${monthName} ${FISCAL_YEAR}`;
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
// GL hover tooltip
// ---------------------------------------------------------------------------

let _glTipTimer = null;
const _glTooltipCache = new Map();

function showGlTooltip(el) {
  clearTimeout(_glTipTimer);
  _glTipTimer = setTimeout(() => _fetchGlTooltip(el), 250);
}

function hideGlTooltip() {
  clearTimeout(_glTipTimer);
  const tip = document.getElementById('gl-tooltip');
  if (tip) tip.style.display = 'none';
}

function _positionGlTooltip(tip, el) {
  const rect  = el.getBoundingClientRect();
  const viewW = window.innerWidth;
  const viewH = window.innerHeight;
  let left = rect.right + 6;
  if (left + 380 > viewW) left = rect.left - 386;
  if (left < 4) left = 4;
  let top = rect.top - 4;
  if (top + 240 > viewH) top = viewH - 244;
  if (top < 4) top = 4;
  tip.style.left = left + 'px';
  tip.style.top  = top  + 'px';
}

async function _fetchGlTooltip(el) {
  const acct      = el.dataset.acct;
  const monthNum  = el.dataset.monthnum;
  const label     = el.dataset.label;
  const monthName = el.dataset.monthname;
  const tip = document.getElementById('gl-tooltip');
  if (!tip) return;

  const cacheKey = `${acct}-${monthNum}`;
  const cached = _glTooltipCache.get(cacheKey);

  _positionGlTooltip(tip, el);
  tip.style.display = 'block';

  if (cached) {
    tip.innerHTML = cached;
    return;
  }

  tip.innerHTML = `<div style="padding:10px 12px;font-size:12px;color:var(--text-2);">Loading…</div>`;

  try {
    const data = await apiFetch(`/data/transactions?account=${acct}&month=${monthNum}`);
    if (!data) { tip.style.display = 'none'; return; }
    const txns = data.transactions || [];
    if (!txns.length) {
      tip.innerHTML = `<div style="padding:10px 12px;font-size:12px;color:var(--text-2);">No transactions in ${monthName}.</div>`;
      _positionGlTooltip(tip, el);
      return;
    }
    const n2 = n => n != null
      ? Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : '';
    const totalDebit  = txns.reduce((s, t) => s + (t.debit  || 0), 0);
    const totalCredit = txns.reduce((s, t) => s + (t.credit || 0), 0);
    const preview = txns.slice(0, 5).map(t => `
      <tr style="border-bottom:1px solid #F0F2F5;">
        <td style="padding:3px 8px;font-size:11px;color:var(--text-2);white-space:nowrap;">${t.date}</td>
        <td style="padding:3px 8px;font-size:11px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${t.desc}</td>
        <td style="padding:3px 8px;font-size:11px;text-align:right;white-space:nowrap;">${t.debit  != null ? n2(t.debit)  : ''}</td>
        <td style="padding:3px 8px;font-size:11px;text-align:right;white-space:nowrap;">${t.credit != null ? n2(t.credit) : ''}</td>
      </tr>`).join('');
    const more = txns.length > 5
      ? `<div style="padding:3px 8px 4px;font-size:10px;color:var(--text-3);">+${txns.length - 5} more transaction${txns.length - 5 !== 1 ? 's' : ''}</div>`
      : '';
    const html = `
      <div style="padding:8px 10px 6px;border-bottom:1px solid var(--border);font-size:12px;font-weight:700;color:var(--navy);">${label} — ${monthName} ${FISCAL_YEAR}</div>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#FAFBFC;">
            <th style="padding:3px 8px;font-size:10px;text-align:left;color:var(--text-2);font-weight:600;text-transform:uppercase;letter-spacing:.05em;">Date</th>
            <th style="padding:3px 8px;font-size:10px;text-align:left;color:var(--text-2);font-weight:600;text-transform:uppercase;letter-spacing:.05em;">Description</th>
            <th style="padding:3px 8px;font-size:10px;text-align:right;color:var(--text-2);font-weight:600;text-transform:uppercase;letter-spacing:.05em;">Debit</th>
            <th style="padding:3px 8px;font-size:10px;text-align:right;color:var(--text-2);font-weight:600;text-transform:uppercase;letter-spacing:.05em;">Credit</th>
          </tr>
        </thead>
        <tbody>${preview}</tbody>
        <tfoot>
          <tr style="background:#F7F9FC;border-top:2px solid var(--navy);">
            <td colspan="2" style="padding:4px 8px;font-size:11px;font-weight:700;color:var(--navy);">Total · ${txns.length} txn${txns.length !== 1 ? 's' : ''}</td>
            <td style="padding:4px 8px;font-size:11px;font-weight:700;text-align:right;">${totalDebit  > 0 ? n2(totalDebit)  : ''}</td>
            <td style="padding:4px 8px;font-size:11px;font-weight:700;text-align:right;">${totalCredit > 0 ? n2(totalCredit) : ''}</td>
          </tr>
        </tfoot>
      </table>
      ${more}
      <div style="padding:3px 8px 6px;font-size:10px;color:var(--text-3);">Click to open full detail</div>`;
    _glTooltipCache.set(cacheKey, html);
    tip.innerHTML = html;
    _positionGlTooltip(tip, el);
  } catch (_) {
    tip.style.display = 'none';
  }
}
