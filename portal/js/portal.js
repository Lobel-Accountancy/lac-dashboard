let isStaff = false;

document.addEventListener('DOMContentLoaded', () => {
  if (!requirePortalAuth()) return;
  const p = jwtPayload(getPortalJWT());
  isStaff = p?.role === 'staff';
  document.getElementById('welcome-name').textContent = isStaff ? 'Jeffrey' : (p?.client_name || '');
  loadPortal();
});

async function loadPortal(selectedClient) {
  try {
    const qs = selectedClient ? `?client=${encodeURIComponent(selectedClient)}` : '';
    const data = await portalFetch(`/portal/me${qs}`);
    if (!data) return;

    if (isStaff && data.all_clients) {
      renderClientSwitcher(data.all_clients, data.client_name);
    }

    renderActionBanner(data);
    renderMatters(data.matters || []);
    renderInvoices(data);
    document.getElementById('loading-screen').hidden = true;
    document.getElementById('portal-content').hidden = false;
  } catch (err) {
    document.getElementById('loading-screen').innerHTML =
      `<p style="color:#C0392B">Unable to load portal: ${err.message}</p>
       <p style="margin-top:12px;font-size:13px;">Please try refreshing or contact
       <a href="mailto:jlobel@lobelaccountancy.com">jlobel@lobelaccountancy.com</a>.</p>`;
  }
}

function renderClientSwitcher(clients, active) {
  const existing = document.getElementById('client-switcher');
  if (existing) existing.remove();

  const bar = document.createElement('div');
  bar.id = 'client-switcher';
  bar.style.cssText = 'background:#1B2A3F;padding:10px 24px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;';
  bar.innerHTML = `
    <span style="color:rgba(255,255,255,.6);font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;white-space:nowrap;">
      Viewing client:
    </span>
    <select onchange="loadPortal(this.value)"
      style="background:#2E3D52;color:white;border:1px solid rgba(255,255,255,.2);
             border-radius:6px;padding:5px 10px;font-size:13px;cursor:pointer;min-width:200px;">
      ${clients.map(c =>
        `<option value="${c}" ${c === active ? 'selected' : ''}>${c}</option>`
      ).join('')}
    </select>
    <span style="color:rgba(255,255,255,.4);font-size:12px;">Staff view — all clients visible</span>`;

  document.querySelector('nav.nav').insertAdjacentElement('afterend', bar);
}

// ---------------------------------------------------------------------------
// Action banner
// ---------------------------------------------------------------------------

function renderActionBanner(data) {
  const banner = document.getElementById('action-banner');
  if (!data.action_required) { banner.hidden = true; return; }
  banner.hidden = false;
  banner.innerHTML = `
    <div class="action-icon">!</div>
    <div>
      <strong>Action required</strong><br>
      We need information from you to continue your engagement. Please contact us at
      <a href="mailto:jlobel@lobelaccountancy.com" style="color:#7B3F00;">jlobel@lobelaccountancy.com</a>
      or call <a href="tel:9493451925" style="color:#7B3F00;">(949) 345-1925</a>.
    </div>`;
}

// ---------------------------------------------------------------------------
// Matters (engagements)
// ---------------------------------------------------------------------------

function renderMatters(matters) {
  const el = document.getElementById('matters-list');
  if (!matters.length) {
    el.innerHTML = '<p class="portal-empty">No active engagements at this time.</p>';
    return;
  }
  el.innerHTML = matters.map(m => {
    const icon  = matterIcon(m);
    const dueEl = m.due_date
      ? `<div class="matter-due">
           Expected: ${new Date(m.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
           ${m.days_until != null && m.days_until >= 0
             ? `<span class="due-badge">${m.days_until === 0 ? 'Today' : `${m.days_until}d`}</span>`
             : ''}
         </div>`
      : '';
    return `
      <div class="matter-card ${m.needs_action ? 'matter-card--action' : ''}">
        <div class="matter-icon">${icon}</div>
        <div class="matter-body">
          <div class="matter-type">${m.type}</div>
          <div class="matter-label">${m.stage_label}</div>
          ${dueEl}
        </div>
        ${m.needs_action
          ? '<div class="matter-action-tag">Action needed</div>'
          : `<div class="matter-status-tag matter-status-tag--${matterStatusClass(m.stage)}">${m.stage}</div>`}
      </div>`;
  }).join('');
}

function matterIcon(m) {
  const s = (m.stage || '').toLowerCase();
  if (m.needs_action)                                          return '●';
  if (s.includes('review') || s.includes('partner'))          return '◎';
  if (s.includes('filed') || s.includes('delivered'))         return '✓';
  return '⟳';
}

function matterStatusClass(stage) {
  const s = (stage || '').toLowerCase();
  if (s.includes('review'))  return 'review';
  if (s.includes('filed') || s.includes('delivered')) return 'done';
  return 'progress';
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

function renderInvoices(data) {
  const { invoices, total_outstanding, overdue_amount } = data;

  // Balance summary
  const balEl = document.getElementById('balance-summary');
  if (total_outstanding > 0) {
    balEl.innerHTML = `
      <div class="balance-amount ${overdue_amount > 0 ? 'balance-amount--overdue' : ''}">
        ${fmt$(total_outstanding)}
      </div>
      <div class="balance-label">
        Total balance due
        ${overdue_amount > 0
          ? `<span class="overdue-tag">${fmt$(overdue_amount)} overdue</span>`
          : ''}
      </div>
      <p class="balance-note">
        To make a payment, please contact us at
        <a href="mailto:billing@lobelaccountancy.com">billing@lobelaccountancy.com</a>
        or call <a href="tel:9493451925">(949) 345-1925</a>.
      </p>`;
  } else {
    balEl.innerHTML = `
      <div class="balance-paid">✓ No outstanding balance</div>
      <div class="balance-label">Your account is current. Thank you!</div>`;
  }

  // Invoice table
  const tableEl = document.getElementById('invoice-table');
  const open = invoices.filter(i => !i.paid);
  const paid = invoices.filter(i => i.paid);
  const toShow = [...open, ...paid];

  if (!toShow.length) {
    tableEl.innerHTML = '<p class="portal-empty">No invoice history.</p>';
    return;
  }

  const rows = toShow.map(i => {
    const dueFmt = i.due_date
      ? new Date(i.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : '—';
    let statusBadge;
    if (i.paid) {
      statusBadge = '<span class="inv-badge inv-badge--paid">Paid</span>';
    } else if (i.days_overdue > 0) {
      statusBadge = `<span class="inv-badge inv-badge--overdue">Overdue ${i.days_overdue}d</span>`;
    } else {
      statusBadge = '<span class="inv-badge inv-badge--open">Due</span>';
    }
    return `
      <tr class="${i.paid ? 'row-paid' : ''}">
        <td class="inv-num">${i.invoice}</td>
        <td>${dueFmt}</td>
        <td class="num">${fmt$(i.amount)}</td>
        <td class="num">${i.outstanding > 0 ? fmt$(i.outstanding) : '—'}</td>
        <td>${statusBadge}</td>
      </tr>`;
  }).join('');

  tableEl.innerHTML = `
    <table class="portal-table">
      <thead>
        <tr>
          <th>Invoice</th>
          <th>Due Date</th>
          <th class="num">Amount</th>
          <th class="num">Balance</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt$(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);
}
