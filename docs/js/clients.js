// LAC AR Aging Dashboard

let _allClients = [];
let _filtered   = [];
let _sortCol    = 'health';
let _sortDir    = 1; // 1 = asc, -1 = desc
let _filter     = 'all';
let _detailClientName = null;

// Recompute AR totals on a client object after a local invoice change
function recalcClientAR(c) {
  const invs = c.ar.invoices;
  c.ar.total_outstanding = invs.reduce((s, i) => s + (i.outstanding || 0), 0);
  c.ar.overdue_amount    = invs.filter(i => i.days_overdue > 0).reduce((s, i) => s + (i.outstanding || 0), 0);
  c.ar.overdue_count     = invs.filter(i => i.days_overdue > 0).length;
  c.ar.max_overdue_days  = invs.reduce((m, i) => Math.max(m, i.days_overdue || 0), 0);
  if (c.ar.overdue_amount === 0) c.health = 'healthy';
  else if (c.ar.max_overdue_days > 60) c.health = 'needs_attention';
  else c.health = 'at_risk';
}

// Re-render the detail panel if it's currently open
function _refreshOpenDetail() {
  if (!_detailClientName) return;
  const idx = _filtered.findIndex(c => c.name === _detailClientName);
  if (idx !== -1) showDetail(idx);
}

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
    renderAgingChart(_allClients);
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
  _detailClientName = c.name;
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
      const editData = encodeURIComponent(JSON.stringify({
        invoice: i.invoice, service: i.service || '', amount: i.amount,
        inv_date: i.inv_date || '', due_date: i.due_date || '',
      }));
      const editBtn = `<button class="btn-edit" onclick="openEditModal(decodeAndParse('${escA(editData)}'))">Edit</button>`;
      const delBtn  = `<button class="btn-delete" onclick="openDelModal('${escA(i.invoice)}')">Delete</button>`;
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
          <td>${i.status}${payBtn}${editBtn}${delBtn}</td>
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
  _detailClientName = null;
  document.getElementById('detail-overlay').classList.remove('open');
  document.getElementById('detail-panel').classList.remove('open');
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeDetail();
    closeAddModal();
    closeEditModal();
    closeDelModal();
    closePayModal();
  }
});

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

  const invoice = _payInvoice;
  const clientIdx = _allClients.findIndex(c => c.ar.invoices.some(i => i.invoice === invoice));
  const client = _allClients[clientIdx];
  const inv = client?.ar.invoices.find(i => i.invoice === invoice);
  const snap = inv ? { ...inv } : null;
  const arSnap = client ? JSON.parse(JSON.stringify(client.ar)) : null;

  // Optimistic: update invoice and totals immediately
  if (inv) {
    inv.outstanding = Math.max(0, inv.outstanding - amount);
    if (inv.outstanding === 0) { inv.status = 'Paid'; inv.days_overdue = 0; }
    recalcClientAR(client);
  }

  closePayModal();
  applyFilter();
  _refreshOpenDetail();

  try {
    const res = await apiFetch('/ar/payment', {
      method: 'POST',
      body: JSON.stringify({ invoice, paid_amount: amount, note }),
    });
    if (!res?.success) throw new Error(res?.error || 'Payment failed.');
  } catch (err) {
    if (inv && snap) { Object.assign(inv, snap); client.ar = arSnap; }
    applyFilter();
    _refreshOpenDetail();
    showToast(err.message || 'Payment failed.', 'error');
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
  const invoice = _delInvoice;
  const clientIdx = _allClients.findIndex(c => c.ar.invoices.some(i => i.invoice === invoice));
  const client = _allClients[clientIdx];
  const invIdx = client ? client.ar.invoices.findIndex(i => i.invoice === invoice) : -1;
  const snap = invIdx !== -1 ? { invoice: client.ar.invoices[invIdx], ar: JSON.parse(JSON.stringify(client.ar)) } : null;

  // Optimistic: remove invoice and close immediately
  if (snap) {
    client.ar.invoices.splice(invIdx, 1);
    recalcClientAR(client);
  }
  closeDelModal();
  closeDetail();
  applyFilter();

  try {
    const res = await apiFetch('/ar/delete', {
      method: 'POST',
      body: JSON.stringify({ invoice }),
    });
    if (!res?.ok) throw new Error(res?.error || 'Delete failed.');
    loadClients();
  } catch (err) {
    if (snap) { client.ar.invoices.splice(invIdx, 0, snap.invoice); client.ar = snap.ar; }
    applyFilter();
    showToast(err.message || 'Delete failed.', 'error');
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Add Receivable modal
// ---------------------------------------------------------------------------

function openAddModal() {
  // Populate client datalist from loaded data
  const dl = document.getElementById('add-client-list');
  dl.innerHTML = _allClients.map(c => `<option value="${escA(c.name)}">`).join('');

  // Default dates: today and +30 days
  const today = fmtDateInput(new Date());
  const due30 = fmtDateInput(new Date(Date.now() + 30 * 86400000));
  document.getElementById('add-client').value   = '';
  document.getElementById('add-invoice').value  = '';
  document.getElementById('add-amount').value   = '';
  document.getElementById('add-service').value  = 'Professional Services';
  document.getElementById('add-inv-date').value = today;
  document.getElementById('add-due-date').value = due30;
  document.getElementById('add-error').textContent = '';
  const btn = document.getElementById('add-submit-btn');
  btn.disabled = false;
  btn.textContent = 'Add Receivable';
  document.getElementById('add-modal').classList.add('open');
  document.getElementById('add-client').focus();
}

function closeAddModal() {
  document.getElementById('add-modal').classList.remove('open');
}

async function submitAdd() {
  const clientName = document.getElementById('add-client').value.trim();
  const invoice    = document.getElementById('add-invoice').value.trim();
  const amount     = parseFloat(document.getElementById('add-amount').value);
  const service    = document.getElementById('add-service').value.trim() || 'Professional Services';
  const invDate    = document.getElementById('add-inv-date').value;
  const dueDate    = document.getElementById('add-due-date').value;
  const errEl      = document.getElementById('add-error');

  if (!clientName)        { errEl.textContent = 'Client is required.'; return; }
  if (!invoice)           { errEl.textContent = 'Invoice # is required.'; return; }
  if (!amount || amount <= 0) { errEl.textContent = 'Enter a valid amount.'; return; }

  closeAddModal();
  setStatus('Saving…');

  const res = await apiFetch('/wb/ar/add', {
    method: 'POST',
    body: JSON.stringify({ client: clientName, invoice, amount, service, inv_date: invDate, due_date: dueDate }),
  });

  if (res?.ok) {
    const existingClient = _allClients.find(c => c.name === clientName);
    if (existingClient) {
      const daysOverdue = dueDate
        ? Math.max(0, Math.floor((Date.now() - new Date(dueDate + 'T00:00:00').getTime()) / 86400000))
        : 0;
      existingClient.ar.invoices.push({
        invoice, amount, outstanding: amount, service,
        inv_date: invDate, due_date: dueDate, status: 'Unpaid', days_overdue: daysOverdue,
      });
      recalcClientAR(existingClient);
      applyFilter();
      renderAgingChart(_allClients);
      _refreshOpenDetail();
      setStatus(`Updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${_allClients.length} clients`);
    } else {
      loadClients();
    }
  } else {
    setStatus('');
    showToast(res?.error || 'Failed to add receivable.', 'error');
  }
}

// ---------------------------------------------------------------------------
// Edit Invoice modal
// ---------------------------------------------------------------------------

let _editInvoice = '';

function decodeAndParse(s) {
  try { return JSON.parse(decodeURIComponent(s)); } catch { return {}; }
}

function openEditModal(inv) {
  _editInvoice = inv.invoice;
  document.getElementById('edit-invoice-label').textContent = inv.invoice;
  document.getElementById('edit-service').value  = inv.service || '';
  document.getElementById('edit-amount').value   = inv.amount || '';
  document.getElementById('edit-inv-date').value = inv.inv_date ? inv.inv_date : '';
  document.getElementById('edit-due-date').value = inv.due_date ? inv.due_date : '';
  document.getElementById('edit-error').textContent = '';
  const btn = document.getElementById('edit-submit-btn');
  btn.disabled = false;
  btn.textContent = 'Save Changes';
  document.getElementById('edit-modal').classList.add('open');
}

function closeEditModal() {
  document.getElementById('edit-modal').classList.remove('open');
}

async function submitEdit() {
  const service = document.getElementById('edit-service').value.trim();
  const amount  = parseFloat(document.getElementById('edit-amount').value);
  const invDate = document.getElementById('edit-inv-date').value;
  const dueDate = document.getElementById('edit-due-date').value;
  const errEl   = document.getElementById('edit-error');

  if (!amount || amount <= 0) { errEl.textContent = 'Enter a valid amount.'; return; }

  const updates = {};
  if (service) updates.service  = service;
  if (amount)  updates.amount   = amount;
  if (invDate) updates.inv_date = invDate;
  if (dueDate) updates.due_date = dueDate;

  const clientIdx = _allClients.findIndex(c => c.ar.invoices.some(i => i.invoice === _editInvoice));
  const client    = _allClients[clientIdx];
  const inv       = client?.ar.invoices.find(i => i.invoice === _editInvoice);
  const snap      = inv ? { ...inv } : null;
  const arSnap    = client ? JSON.parse(JSON.stringify(client.ar)) : null;

  if (inv) {
    if (service) inv.service = service;
    if (amount) {
      const oldPaid = inv.amount - inv.outstanding;
      inv.amount      = amount;
      inv.outstanding = Math.max(0, amount - oldPaid);
    }
    if (invDate) inv.inv_date = invDate;
    if (dueDate) {
      inv.due_date    = dueDate;
      inv.days_overdue = Math.max(0, Math.floor((Date.now() - new Date(dueDate + 'T00:00:00').getTime()) / 86400000));
    }
    recalcClientAR(client);
  }

  closeEditModal();
  applyFilter();
  _refreshOpenDetail();
  setStatus('Saving…');

  const res = await apiFetch('/wb/ar/update', {
    method: 'POST',
    body: JSON.stringify({ invoice: _editInvoice, updates }),
  });

  if (res?.ok) {
    setStatus(`Updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${_allClients.length} clients`);
  } else {
    if (inv && snap) { Object.assign(inv, snap); if (client) client.ar = arSnap; }
    applyFilter();
    _refreshOpenDetail();
    showToast(res?.error || 'Failed to save changes.', 'error');
    setStatus('');
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt$(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function escA(s) { return String(s || '').replace(/'/g, "\\'"); }

function fmtDateInput(d) {
  const y  = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const dy = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${dy}`;
}

// ---------------------------------------------------------------------------
// AR Aging bucket chart
// ---------------------------------------------------------------------------

let _agingChart = null;

function renderAgingChart(clients) {
  if (typeof Chart === 'undefined') return;
  const canvas = document.getElementById('aging-chart');
  if (!canvas) return;
  if (_agingChart) { _agingChart.destroy(); _agingChart = null; }

  const buckets = { 'Current': 0, '1–30 days': 0, '31–60 days': 0, '61–90 days': 0, '90+ days': 0 };
  clients.forEach(c => {
    (c.ar?.invoices || []).forEach(inv => {
      const status = (inv.status || '').toLowerCase();
      if (status === 'paid') return;
      const outstanding = parseFloat(inv.outstanding) || 0;
      if (outstanding <= 0) return;
      const days = inv.days_overdue ?? 0;
      if (days <= 0)       buckets['Current']     += outstanding;
      else if (days <= 30) buckets['1–30 days']   += outstanding;
      else if (days <= 60) buckets['31–60 days']  += outstanding;
      else if (days <= 90) buckets['61–90 days']  += outstanding;
      else                 buckets['90+ days']    += outstanding;
    });
  });

  const labels = Object.keys(buckets);
  const values = labels.map(k => buckets[k]);
  const COLORS = ['#1A7A4A', '#2563EB', '#D4880A', '#E67E22', '#C0392B'];
  const fmt$ = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

  _agingChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: COLORS.map(c => c + 'CC'),
        borderColor: COLORS,
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
          callbacks: { label: ctx => ` ${fmt$(ctx.parsed.x)}` },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: {
            callback: v => '$' + (v >= 1000 ? (v/1000).toFixed(0) + 'k' : v),
            font: { size: 11 }, color: '#8BA7C4',
          },
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
