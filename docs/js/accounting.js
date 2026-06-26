/* accounting.js — Bank Reconciliation, Assets, Reimbursements, Equity Rollforward */

let acctData = null;
let activeTab = 'bank';

document.addEventListener('DOMContentLoaded', () => {
  if (!requireAuth()) return;
  const payload = jwtPayload(getJWT());
  document.getElementById('nav-user').textContent = (payload?.email || '').split('@')[0];
  loadAccounting();
});

async function loadAccounting() {
  try {
    const data = await apiFetch('/data/accounting');
    acctData = data;
    renderActiveTab();
  } catch (err) {
    document.getElementById('error-banner').textContent = 'Unable to load accounting data: ' + err.message;
    document.getElementById('error-banner').hidden = false;
  }
}

function switchTab(btn, tabId) {
  document.querySelectorAll('.acct-tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.acct-section').forEach(s => s.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('tab-' + tabId).classList.add('active');
  activeTab = tabId;
  renderActiveTab();
}

function renderActiveTab() {
  if (!acctData) return;
  if (activeTab === 'bank')    renderBankRecon();
  if (activeTab === 'fixed')   renderAssets('fixed',   acctData.fixed_assets,     'Fixed Asset Schedule');
  if (activeTab === 'prepaid') renderAssets('prepaid', acctData.prepaid_expenses, 'Prepaid Expense Schedule');
  if (activeTab === 'reimb')   renderReimb();
  if (activeTab === 'equity')  renderEquity();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtD(v) {
  if (v === null || v === undefined) return '—';
  const n = parseFloat(v);
  if (isNaN(n)) return '—';
  if (n === 0)  return '$—';
  const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `$(${abs})` : `$${abs}`;
}

function fmtN(v) {
  if (v === null || v === undefined) return '—';
  const n = parseFloat(v);
  if (isNaN(n)) return '—';
  if (n === 0)  return '—';
  const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `(${abs})` : abs;
}

function valCls(v) {
  const n = parseFloat(v);
  if (!v || isNaN(n) || n === 0) return 'val-zero';
  return n < 0 ? 'val-neg' : '';
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ---------------------------------------------------------------------------
// Bank Reconciliation
// ---------------------------------------------------------------------------

function renderBankRecon() {
  const el   = document.getElementById('bank-body');
  const data = acctData?.bank_reconciliation;
  if (!data) { el.innerHTML = '<div class="acct-empty">Bank Reconciliation data not available.</div>'; return; }

  const bankBal = data.current_balance;
  const glBal   = data.gl_1000_balance;
  const diff    = (bankBal != null && glBal != null)
    ? Math.round((bankBal - glBal) * 100) / 100 : null;
  const reconciled = diff !== null && Math.abs(diff) < 0.005;

  const badge = diff !== null
    ? (reconciled
        ? `<span class="bank-badge ok">&#10003;&nbsp;Reconciled</span>`
        : `<span class="bank-badge err">&#9888;&nbsp;Out of Balance</span>`)
    : '';

  let reconRows = '';
  if (bankBal != null) {
    reconRows += `<tr><td>Bank Balance (Plaid)</td><td>${fmtD(bankBal)}</td></tr>`;
  }
  if (glBal != null) {
    reconRows += `<tr><td>GL Balance (Acct 1000 – Cash)</td><td>${fmtD(glBal)}</td></tr>`;
  }
  if (diff !== null) {
    reconRows += `<tr class="hr"><td>Difference</td><td class="${reconciled ? 'val-zero' : 'val-neg'}">${diff === 0 ? '$—' : fmtD(diff)}</td></tr>`;
  }

  let html = `
    <div class="bank-period">
      <div class="bank-period-title">
        ${esc(data.account || 'Chase Business Checking')}
        ${badge}
      </div>
      <div class="bank-meta">Last synced: ${esc(data.last_synced || '—')}</div>
      <table class="bank-recon-table"><tbody>${reconRows}</tbody></table>
    </div>`;

  // Monthly bank activity as supporting detail
  if (data.periods && data.periods.length) {
    data.periods.forEach(p => {
      let rows = '';
      if (p.deposits && p.deposits.length) {
        rows += `<tr class="section-lbl"><td>Deposits</td><td></td></tr>`;
        p.deposits.forEach(d => {
          rows += `<tr class="cat-row"><td>${esc(d.category)}</td><td class="${valCls(d.amount)}">${fmtD(d.amount)}</td></tr>`;
        });
      }
      if (p.total_deposits !== null) {
        rows += `<tr class="hr"><td>Total Deposits</td><td class="val-pos">${fmtD(p.total_deposits)}</td></tr>`;
      }
      if (p.withdrawals && p.withdrawals.length) {
        rows += `<tr class="section-lbl"><td>Withdrawals</td><td></td></tr>`;
        p.withdrawals.forEach(w => {
          rows += `<tr class="cat-row"><td>${esc(w.category)}</td><td class="${valCls(-w.amount)}">${fmtD(w.amount)}</td></tr>`;
        });
      }
      if (p.total_withdrawals !== null) {
        rows += `<tr class="hr"><td>Total Withdrawals</td><td class="val-neg">(${fmtN(p.total_withdrawals)})</td></tr>`;
      }
      if (!rows) return;
      html += `
        <div class="bank-period" style="padding-top:12px;">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--text-2);margin-bottom:10px;">${esc(p.month)} Activity</div>
          <table class="bank-recon-table"><tbody>${rows}</tbody></table>
        </div>`;
    });
  }

  el.innerHTML = `<div class="acct-card">${html}</div>`;
}

// ---------------------------------------------------------------------------
// Fixed Assets / Prepaid Expenses
// ---------------------------------------------------------------------------

function renderAssets(tabId, assets, title) {
  const el = document.getElementById(tabId + '-body');
  if (!assets || !assets.length) {
    el.innerHTML = `<div class="acct-empty">No entries in the ${title} yet.</div>`;
    return;
  }

  // Collect all year columns that have any data
  const yearSet = new Set();
  assets.forEach(a => Object.keys(a.year_totals || {}).forEach(y => yearSet.add(y)));
  const years = [...yearSet].sort();

  const yearHeaders = years.map(y => `<th class="num">${y}</th>`).join('');

  const rows = assets.map(a => {
    const yearCells = years.map(y => {
      const v = a.year_totals?.[y];
      return `<td class="num ${valCls(v)}">${fmtD(v)}</td>`;
    }).join('');

    return `<tr>
      <td style="font-variant-numeric:tabular-nums;font-family:monospace;">${a.number}</td>
      <td>${esc(a.je || '—')}</td>
      <td>${esc(a.description || '—')}</td>
      <td>${esc(a.asset_type || '—')}</td>
      <td class="num">${a.useful_life != null ? a.useful_life + ' yr' : '—'}</td>
      <td>${a.start_date || '—'}</td>
      <td>${a.end_date || '—'}</td>
      <td class="num ${valCls(a.cost)}">${fmtD(a.cost)}</td>
      <td class="num ${valCls(a.monthly_amortization)}">${fmtD(a.monthly_amortization)}</td>
      ${yearCells}
    </tr>`;
  }).join('');

  el.innerHTML = `
    <div class="acct-card">
      <div class="acct-card-title">${esc(title)}</div>
      <div class="acct-card-body">
        <table class="acct-table">
          <thead>
            <tr>
              <th>#</th>
              <th>JE</th>
              <th>Description</th>
              <th>Type</th>
              <th class="num">Life</th>
              <th>Start</th>
              <th>End</th>
              <th class="num">Cost</th>
              <th class="num">Mo. Amort.</th>
              ${yearHeaders}
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

// ---------------------------------------------------------------------------
// Shareholder Reimbursements
// ---------------------------------------------------------------------------

function renderReimb() {
  const el   = document.getElementById('reimb-body');
  const data = acctData?.shareholder_reimbursements;
  if (!data) { el.innerHTML = '<div class="acct-empty">No data.</div>'; return; }

  // Home Office Deductions table
  let hoHtml = '';
  if (data.home_office && data.home_office.length) {
    const rows = data.home_office.map(r => `<tr>
      <td>${esc(r.expense_type)}</td>
      <td>${r.gl_num || '—'}</td>
      <td>${esc(r.vendor || '—')}</td>
      <td class="num ${valCls(r.cost)}">${fmtD(r.cost)}</td>
      <td>${esc(r.period || '—')}</td>
      <td class="num">${r.pct_allocated != null ? (r.pct_allocated * 100).toFixed(1) + '%' : '—'}</td>
      <td class="num ${valCls(r.amt_allocated)}">${fmtD(r.amt_allocated)}</td>
    </tr>`).join('');

    const totalAmt = data.home_office.reduce((s, r) => s + (r.amt_allocated || 0), 0);
    const totalCost = data.home_office.reduce((s, r) => s + (r.cost || 0), 0);

    hoHtml = `
      <div class="acct-card" style="margin-bottom:20px;">
        <div class="acct-card-title">Home Office Deductions</div>
        <div class="acct-card-body">
          <table class="acct-table">
            <thead>
              <tr>
                <th>Expense Type</th>
                <th>GL #</th>
                <th>Vendor</th>
                <th class="num">Cost</th>
                <th>Period</th>
                <th class="num">% Alloc.</th>
                <th class="num">$ Alloc.</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
            <tfoot>
              <tr class="row-total">
                <td colspan="3">Total</td>
                <td class="num">${fmtD(totalCost || null)}</td>
                <td></td>
                <td></td>
                <td class="num">${fmtD(totalAmt || null)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>`;
  }

  // Transaction Ledger table
  let txnHtml = '';
  const txns = (data.transactions || []).filter(t =>
    t.je || t.amount_paid || t.amount_reimbursed || t.balance_owed
  );

  if (txns.length) {
    const totalPaid  = Math.round(txns.reduce((s, t) => s + (t.amount_paid || 0), 0) * 100) / 100;
    const totalReimb = Math.round(txns.reduce((s, t) => s + (t.amount_reimbursed || 0), 0) * 100) / 100;
    // balance_owed is a running balance; the final row holds the total outstanding
    const lastTxn  = txns[txns.length - 1];
    const totalOwed = lastTxn?.balance_owed ?? Math.round((totalPaid - totalReimb) * 100) / 100;

    const rows = txns.map(t => {
      const owed = t.balance_owed ?? ((t.amount_paid || 0) - (t.amount_reimbursed || 0));
      return `<tr>
        <td>${t.date || '—'}</td>
        <td style="font-family:monospace;font-weight:600;color:var(--navy);">${esc(t.je)}</td>
        <td>${esc(t.description || '—')}</td>
        <td>${t.gl_account || '—'}</td>
        <td class="num ${valCls(t.amount_paid)}">${fmtD(t.amount_paid)}</td>
        <td>${t.date_reimbursed || '—'}</td>
        <td class="num ${valCls(t.amount_reimbursed)}">${fmtD(t.amount_reimbursed)}</td>
        <td class="num ${owed > 0 ? 'val-neg' : ''}">${fmtD(owed || null)}</td>
      </tr>`;
    }).join('');

    txnHtml = `
      <div class="acct-card">
        <div class="acct-card-title">Transaction Ledger
          <span style="font-weight:400;text-transform:none;font-size:11px;color:var(--text-3);">Balance Owed: <strong style="color:${totalOwed > 0 ? 'var(--danger)' : 'var(--ok)'}">${fmtD(totalOwed || null)}</strong></span>
        </div>
        <div class="acct-card-body">
          <table class="acct-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>JE #</th>
                <th>Description</th>
                <th>GL Acct</th>
                <th class="num">Amt Paid</th>
                <th>Date Reimb.</th>
                <th class="num">Amt Reimb.</th>
                <th class="num">Balance Owed</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
            <tfoot>
              <tr class="row-total">
                <td colspan="4">Total</td>
                <td class="num">${fmtD(totalPaid || null)}</td>
                <td></td>
                <td class="num">${fmtD(totalReimb || null)}</td>
                <td class="num ${totalOwed > 0 ? 'val-neg' : ''}">${fmtD(totalOwed || null)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>`;
  }

  el.innerHTML = hoHtml + txnHtml || '<div class="acct-empty">No shareholder reimbursement data yet.</div>';
}

// ---------------------------------------------------------------------------
// Equity Rollforward
// ---------------------------------------------------------------------------

function renderEquity() {
  const el  = document.getElementById('equity-body');
  const eq  = acctData?.equity_rollforward;
  if (!eq) { el.innerHTML = '<div class="acct-empty">No equity data.</div>'; return; }

  const beg   = eq.beginning     || 0;
  const cont  = eq.contributions || 0;
  const dist  = eq.distributions || 0;   // negative if distributions > 0 (contra equity)
  const retn  = eq.retained      || 0;
  const ni    = eq.net_income    || 0;
  const end   = eq.ending        || 0;
  const rev   = eq.revenue_total || 0;
  const exp   = eq.expense_total || 0;

  // Net income row label
  const niLabel = ni >= 0 ? 'Net Income' : 'Net Loss';
  const niCls   = ni >= 0 ? 'val-pos' : 'val-neg';

  // Distribution display (distributions is negative credit balance, so subtract abs)
  const distDisplay = dist !== 0
    ? `<tr class="eq-indent">
        <td>Shareholder Distributions</td>
        <td class="num val-neg">${fmtD(dist)}</td>
       </tr>` : '';

  const retainedDisplay = retn !== 0
    ? `<tr class="eq-indent">
        <td>Retained Earnings (Prior)</td>
        <td class="num">${fmtD(retn)}</td>
       </tr>` : '';

  // Reconciliation note
  const endCls   = end >= 0 ? '' : 'val-neg';

  let monthRows = '';
  if (eq.monthly && eq.monthly.length) {
    monthRows = eq.monthly.map(m => {
      const cls = m.net_income >= 0 ? '' : 'val-neg';
      return `<tr>
        <td>${esc(m.month)}</td>
        <td class="num ${cls}">${fmtD(m.net_income)}</td>
      </tr>`;
    }).join('');
  }

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start;">

      <!-- Statement -->
      <div class="acct-card">
        <div class="acct-card-title">Equity Rollforward — FY2026</div>
        <div class="equity-stmt">
          <table class="equity-table">
            <tbody>

              <tr class="eq-section"><td colspan="2">Beginning of Period</td></tr>
              <tr class="eq-indent">
                <td>Beginning Equity</td>
                <td class="num val-zero">$—</td>
              </tr>

              <tr class="eq-section"><td colspan="2">Capital Activity</td></tr>
              <tr class="eq-indent">
                <td>Contributions (Common Shares)</td>
                <td class="num ${valCls(cont)}">${fmtD(cont)}</td>
              </tr>
              ${distDisplay}
              ${retainedDisplay}

              <tr class="eq-section"><td colspan="2">Operations</td></tr>
              <tr class="eq-indent">
                <td>Total Revenue</td>
                <td class="num ${valCls(rev)}">${fmtD(rev)}</td>
              </tr>
              <tr class="eq-indent">
                <td>Total Expenses</td>
                <td class="num val-neg">(${fmtN(exp)})</td>
              </tr>
              <tr class="eq-total eq-indent">
                <td>${niLabel}</td>
                <td class="num ${niCls}">${fmtD(ni)}</td>
              </tr>

              <tr><td colspan="2" style="padding:6px 0;"></td></tr>
              <tr class="eq-ending">
                <td>Ending Equity</td>
                <td class="num ${endCls}">${fmtD(end)}</td>
              </tr>

            </tbody>
          </table>
          <p style="margin-top:14px;font-size:11px;color:var(--text-3);">
            Reconciles to Total Equity on Balance Sheet.
          </p>
        </div>
      </div>

      <!-- Monthly breakdown -->
      <div class="acct-card">
        <div class="acct-card-title">Net Income by Month</div>
        <div class="acct-card-body">
          ${eq.monthly && eq.monthly.length ? `
            <table class="acct-table">
              <thead>
                <tr><th>Month</th><th class="num">Net Income / (Loss)</th></tr>
              </thead>
              <tbody>${monthRows}</tbody>
              <tfoot>
                <tr class="row-total">
                  <td>YTD Total</td>
                  <td class="num ${valCls(ni)}">${fmtD(ni)}</td>
                </tr>
              </tfoot>
            </table>` : '<div class="acct-empty">No monthly data.</div>'}
        </div>
      </div>

    </div>`;
}
