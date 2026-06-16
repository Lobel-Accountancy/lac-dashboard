// LAC AR Aging Dashboard

let _allClients = [];
let _filtered   = [];
let _sortCol    = 'health';
let _sortDir    = 1; // 1 = asc, -1 = desc
let _filter     = 'all';

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  if (!requireAuth()) return;
  const p = jwtPayload(getJWT());
  document.getElementById('nav-user').textContent = (p?.email || '').split('@')[0];
  loadClients();
});

async function loadClients() {
  setStatus('Loading…');
  try {
    const data = await apiFetch('/data/clients');
    if (!data) return;
    _allClients = data.clients;
    renderSummary(data.summary);
    applyFilter();
    setStatus(`Updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${data.clients.length} clients`);

    const target = new URLSearchParams(window.location.search).get('client');
    if (target) {
      const idx = _filtered.findIndex(c => c.name === target);
      if (idx !== -1) showDetail(idx);
    }
  } catch (err) {
    setStatus(`Error: ${err.message}`);
    document.getElementById('error-banner').textContent = err.message;
    document.getElementById('error-banner').hidden = false;
  }
}

function setStatus(text) { document.getElementById('refresh-status').textContent = text; }

// ---------------------------------------------------------------------------
// Summary KPI row
// ---------------------------------------------------------------------------

function renderSummary(s) {
  document.getElementById('sum-total').textContent = s.total;
  document.getElementById('sum-attention').textContent = s.needs_attention;
  document.getElementById('sum-risk').textContent     = s.at_risk;
  document.getElementById('sum-healthy').textContent  = s.healthy;
}

// ---------------------------------------------------------------------------
// Filter + Sort
// ---------------------------------------------------------------------------

function setFilter(f) {
  _filter = f;
  document.querySelectorAll('.filter-btn').forEach(b =>
    b.classList.toggle('filter-btn--active', b.dataset.filter === f));
  applyFilter();
}

function applyFilter() {
  const q = (document.getElementById('search')?.value || '').toLowerCase();
  _filtered = _allClients.filter(c => {
    const matchesFilter = _filter === 'all' || c.health === _filter;
    const matchesSearch = !q || c.name.toLowerCase().includes(q);
    return matchesFilter && matchesSearch;
  });
  sortClients(_sortCol, false);
  renderTable();
}

function sortClients(col, toggle = true) {
  if (toggle) {
    _sortDir = col === _sortCol ? -_sortDir : 1;
    _sortCol = col;
  }
  const healthOrder = { needs_attention: 0, at_risk: 1, healthy: 2 };

  _filtered.sort((a, b) => {
    let av, bv;
    switch (col) {
      case 'health':      av = healthOrder[a.health];       bv = healthOrder[b.health]; break;
      case 'name':        av = a.name.toLowerCase();        bv = b.name.toLowerCase(); break;
      case 'outstanding': av = a.ar.total_outstanding;      bv = b.ar.total_outstanding; break;
      case 'overdue':     av = a.ar.max_overdue_days;       bv = b.ar.max_overdue_days; break;
      case 'matters':     av = a.pipeline.active_count;     bv = b.pipeline.active_count; break;
      case 'deadline': {
        av = a.pipeline.next_deadline?.days_until ?? 9999;
        bv = b.pipeline.next_deadline?.days_until ?? 9999;
        break;
      }
      default: return 0;
    }
    if (av < bv) return -_sortDir;
    if (av > bv) return  _sortDir;
    return 0;
  });

  document.querySelectorAll('th[data-col]').forEach(th => {
    th.classList.remove('sort-asc', 'sort-desc');
    if (th.dataset.col === _sortCol) {
      th.classList.add(_sortDir === 1 ? 'sort-asc' : 'sort-desc');
    }
  });
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

function renderTable() {
  const tbody = document.getElementById('client-tbody');

  if (_filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">No clients match this filter.</td></tr>';
    return;
  }

  tbody.innerHTML = _filtered.map((c, i) => `
    <tr class="client-row" onclick="showDetail(${i})" title="Click to view details">
      <td><span class="health-dot health-dot--${c.health}"></span>${healthLabel(c.health)}</td>
      <td class="client-name">${c.name}</td>
      <td class="num">${c.ar.total_outstanding > 0 ? fmt$(c.ar.total_outstanding) : '<span class="text-muted">—</span>'}</td>
      <td>${overdueCell(c.ar.max_overdue_days, c.ar.overdue_amount)}</td>
      <td class="num">${c.pipeline.active_count > 0 ? c.pipeline.active_count : '<span class="text-muted">—</span>'}</td>
      <td>${deadlineCell(c.pipeline.next_deadline)}</td>
    </tr>
  `).join('');
}

function healthLabel(h) {
  return { needs_attention: 'Needs Attention', at_risk: 'At Risk', healthy: 'Healthy' }[h] || h;
}

function overdueCell(days, amount) {
  if (days <= 0) return '<span class="badge badge--ok">Current</span>';
  const cls = days > 60 ? 'danger' : days > 30 ? 'warning' : 'muted';
  return `<span class="badge badge--${cls}">${days}d</span> <span class="text-muted">${fmt$(amount)}</span>`;
}

function deadlineCell(nd) {
  if (!nd) return '<span class="text-muted">—</span>';
  const d = nd.days_until;
  const lbl = nd.due_date
    ? new Date(nd.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : '—';
  const cls = d < 0 ? 'danger' : d <= 7 ? 'danger' : d <= 14 ? 'warning' : 'ok';
  const days = d < 0 ? `${Math.abs(d)}d overdue` : d === 0 ? 'today' : `${d}d`;
  return `${lbl} <span class="badge badge--${cls}">${days}</span>`;
}

// ---------------------------------------------------------------------------
// Detail panel
// ---------------------------------------------------------------------------

function showDetail(idx) {
  const c = _filtered[idx];
  document.getElementById('detail-name').textContent  = c.name;
  document.getElementById('detail-email').textContent = c.email || '';
  document.getElementById('detail-health').innerHTML  =
    `<span class="health-dot health-dot--${c.health}"></span>${healthLabel(c.health)}`;

  // Invoices
  const invoices = c.ar.invoices;
  let invHtml = '';
  if (invoices.length === 0) {
    invHtml = '<p class="empty-state">No invoice history.</p>';
  } else {
    const rows = invoices.map(i => {
      const isPaid = i.status === 'Paid' || i.outstanding === 0;
      const payBtn = isPaid ? '' :
        `<button class="btn-pay" onclick="openPayment('${escA(i.invoice)}',${i.outstanding})">
           Record Payment
         </button>`;
      const delBtn = `<button class="btn-delete" onclick="openDelModal('${escA(i.invoice)}')">Delete</button>`;
      return `
        <tr class="${isPaid ? 'row-paid' : ''}">
          <td class="mono">${i.invoice}</td>
          <td class="num">${fmt$(i.amount)}</td>
          <td class="num">${i.outstanding > 0 ? fmt$(i.outstanding) : '<span class="text-muted">—</span>'}</td>
          <td>${isPaid
            ? '<span class="badge badge--ok">Paid</span>'
            : i.days_overdue > 0
              ? `<span class="badge badge--${i.days_overdue > 30 ? 'danger' : 'warning'}">${i.days_overdue}d overdue</span>`
              : '<span class="badge badge--ok">Current</span>'}</td>
          <td>${i.status}${payBtn}${delBtn}</td>
        </tr>`;
    }).join('');
    invHtml = `
      <table class="data-table">
        <thead><tr><th>Invoice</th><th class="num">Amount</th><th class="num">Outstanding</th><th>Age</th><th>Status</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  // Matters
  const matters = c.pipeline.matters;
  let matterHtml = '';
  if (matters.length === 0) {
    matterHtml = '<p class="empty-state">No active matters.</p>';
  } else {
    matterHtml = matters.map(m => `
      <div class="matter-item">
        <div class="matter-info">
          <div class="matter-type">${m.type}</div>
          <div class="matter-stage">${m.stage}</div>
        </div>
        <div class="matter-due">${deadlineCell(m)}</div>
      </div>
    `).join('');
  }

  document.getElementById('detail-body').innerHTML = `
    <div class="detail-section">
      <div class="detail-section-title">AR Summary</div>
      <div class="detail-stats">
        <div class="detail-stat"><div class="detail-stat-val">${fmt$(c.ar.total_outstanding)}</div><div class="detail-stat-lbl">Outstanding</div></div>
        <div class="detail-stat"><div class="detail-stat-val">${fmt$(c.ar.overdue_amount)}</div><div class="detail-stat-lbl">Overdue</div></div>
        <div class="detail-stat"><div class="detail-stat-val">${fmt$(c.ytd_billed)}</div><div class="detail-stat-lbl">YTD Billed</div></div>
      </div>
    </div>
    <div class="detail-section">
      <div class="detail-section-title">Invoices</div>
      ${invHtml}
    </div>
    <div class="detail-section">
      <div class="detail-section-title">Active Matters</div>
      ${matterHtml}
    </div>
  `;

  document.getElementById('detail-overlay').classList.add('open');
  document.getElementById('detail-panel').classList.add('open');
}

function closeDetail() {
  document.getElementById('detail-overlay').classList.remove('open');
  document.getElementById('detail-panel').classList.remove('open');
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDetail(); });

// ---------------------------------------------------------------------------
// Payment modal
// ---------------------------------------------------------------------------

let _payInvoice = '';

function openPayment(invoice, outstanding) {
  _payInvoice = invoice;
  document.getElementById('pay-invoice-label').textContent = invoice;
  document.getElementById('pay-amount').value  = outstanding.toFixed(2);
  document.getElementById('pay-note').value    = '';
  document.getElementById('pay-error').textContent = '';
  document.getElementById('pay-modal').classList.add('open');
  document.getElementById('pay-amount').focus();
  document.getElementById('pay-amount').select();
}

function closePayModal() {
  document.getElementById('pay-modal').classList.remove('open');
}

async function submitPayment() {
  const amount = parseFloat(document.getElementById('pay-amount').value);
  const note   = document.getElementById('pay-note').value.trim();
  const errEl  = document.getElementById('pay-error');
  if (!amount || amount <= 0) { errEl.textContent = 'Enter a valid amount.'; return; }

  const btn = document.querySelector('#pay-modal .btn-primary');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  const res = await apiFetch('/ar/payment', {
    method: 'POST',
    body: JSON.stringify({ invoice: _payInvoice, paid_amount: amount, note }),
  });

  btn.disabled = false;
  btn.textContent = 'Record Payment';

  if (res?.success) {
    closePayModal();
    loadClients(); // refresh list
  } else {
    errEl.textContent = res?.error || 'Payment failed.';
  }
}

// ---------------------------------------------------------------------------
// Delete modal
// ---------------------------------------------------------------------------

let _delInvoice = '';

function openDelModal(invoice) {
  _delInvoice = invoice;
  document.getElementById('del-invoice-label').textContent = invoice;
  document.getElementById('del-error').textContent = '';
  const btn = document.getElementById('del-confirm-btn');
  btn.disabled = false;
  btn.textContent = 'Delete';
  document.getElementById('del-modal').classList.add('open');
}

function closeDelModal() {
  document.getElementById('del-modal').classList.remove('open');
}

async function submitDelete() {
  const btn = document.getElementById('del-confirm-btn');
  btn.disabled = true;
  btn.textContent = 'Deleting…';

  const res = await apiFetch('/ar/delete', {
    method: 'POST',
    body: JSON.stringify({ invoice: _delInvoice }),
  });

  btn.disabled = false;
  btn.textContent = 'Delete';

  if (res?.ok) {
    closeDelModal();
    closeDetail();
    loadClients();
  } else {
    document.getElementById('del-error').textContent = res?.error || 'Delete failed.';
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt$(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function escA(s) { return String(s || '').replace(/'/g, "\\'"); }
