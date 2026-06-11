let navStack    = [{ id: 'root', name: 'My Drive' }];
let nextPageToken = null;

const MIME_META = {
  'application/vnd.google-apps.folder':       { label: 'Folder', color: '#92400E', bg: '#FEF3C7' },
  'application/vnd.google-apps.spreadsheet':  { label: 'Sheet',  color: '#166534', bg: '#DCFCE7' },
  'application/vnd.google-apps.document':     { label: 'Doc',    color: '#1E40AF', bg: '#DBEAFE' },
  'application/vnd.google-apps.presentation': { label: 'Slides', color: '#92400E', bg: '#FEF3C7' },
  'application/vnd.google-apps.form':         { label: 'Form',   color: '#5B21B6', bg: '#EDE9FE' },
  'application/vnd.google-apps.drawing':      { label: 'Drawing',color: '#065F46', bg: '#D1FAE5' },
  'application/pdf':                          { label: 'PDF',    color: '#991B1B', bg: '#FEE2E2' },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
                                              { label: 'XLSX',   color: '#166534', bg: '#DCFCE7' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
                                              { label: 'DOCX',   color: '#1E40AF', bg: '#DBEAFE' },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation':
                                              { label: 'PPTX',   color: '#92400E', bg: '#FEF3C7' },
  'image/jpeg':                               { label: 'Image',  color: '#5B21B6', bg: '#EDE9FE' },
  'image/png':                                { label: 'Image',  color: '#5B21B6', bg: '#EDE9FE' },
  'text/plain':                               { label: 'Text',   color: '#374151', bg: '#F3F4F6' },
  'text/csv':                                 { label: 'CSV',    color: '#166534', bg: '#DCFCE7' },
};
const MIME_DEFAULT = { label: 'File', color: '#374151', bg: '#F3F4F6' };

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  if (!requireAuth()) return;

  const payload = jwtPayload(getJWT());
  document.getElementById('nav-user').textContent = (payload?.email || '').split('@')[0];

  loadFolder('root');
});

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

function currentFolderId() {
  return navStack[navStack.length - 1].id;
}

function navigateTo(id, name) {
  navStack.push({ id, name });
  nextPageToken = null;
  loadFolder(id);
}

function navigateToIndex(index) {
  navStack = navStack.slice(0, index + 1);
  nextPageToken = null;
  loadFolder(navStack[navStack.length - 1].id);
}

function reloadFolder() {
  nextPageToken = null;
  loadFolder(currentFolderId(), false);
}

function renderBreadcrumb() {
  document.getElementById('breadcrumb').innerHTML = navStack.map((item, i) => {
    const isLast = i === navStack.length - 1;
    const sep    = i > 0 ? '<span class="breadcrumb-sep"> / </span>' : '';
    const cls    = isLast ? 'breadcrumb-item current' : 'breadcrumb-item';
    const click  = isLast ? '' : `onclick="navigateToIndex(${i})"`;
    return `${sep}<span class="${cls}" ${click}>${escHtml(item.name)}</span>`;
  }).join('');
}

// ---------------------------------------------------------------------------
// Loading files
// ---------------------------------------------------------------------------

async function loadFolder(folderId, replace = true) {
  setError(null);

  const url = `/data/drive?folder=${encodeURIComponent(folderId)}`;
  try {
    const data = await apiFetch(url);
    if (!data) return;

    nextPageToken = data.next_page_token || null;
    document.getElementById('load-more-wrap').hidden = !nextPageToken;

    renderBreadcrumb();

    const container = document.getElementById('file-list');
    if (!data.files.length) {
      container.innerHTML = '<span class="empty-state">This folder is empty.</span>';
      return;
    }

    const rows = data.files.map(f => fileRowHTML(f)).join('');
    if (replace) {
      container.innerHTML = rows;
    } else {
      container.insertAdjacentHTML('beforeend', rows);
    }
  } catch (err) {
    setError(err.message);
  }
}

async function loadMore() {
  if (!nextPageToken) return;
  const folderId = currentFolderId();
  const url = `/data/drive?folder=${encodeURIComponent(folderId)}&page_token=${encodeURIComponent(nextPageToken)}`;
  try {
    const data = await apiFetch(url);
    if (!data) return;
    nextPageToken = data.next_page_token || null;
    document.getElementById('load-more-wrap').hidden = !nextPageToken;
    document.getElementById('file-list').insertAdjacentHTML('beforeend',
      data.files.map(f => fileRowHTML(f)).join(''));
  } catch (err) {
    setError(err.message);
  }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function fileRowHTML(f) {
  const meta     = MIME_META[f.mime_type] || MIME_DEFAULT;
  const badge    = `<span class="file-type-badge" style="color:${meta.color};background:${meta.bg}">${meta.label}</span>`;
  const modified = formatDate(f.modified);
  const size     = f.is_folder ? '' : formatSize(f.size);

  if (f.is_folder) {
    return `
      <div class="file-row" onclick="navigateTo('${escAttr(f.id)}', '${escAttr(f.name)}')">
        ${badge}
        <span class="file-name">${escHtml(f.name)}</span>
        <span class="file-size">${size}</span>
        <span class="file-modified">${modified}</span>
      </div>`;
  }

  return `
    <a class="file-row" href="${escAttr(f.web_link)}" target="_blank" rel="noopener">
      ${badge}
      <span class="file-name">${escHtml(f.name)}</span>
      <span class="file-size">${size}</span>
      <span class="file-modified">${modified}</span>
    </a>`;
}

function formatDate(iso) {
  if (!iso) return '';
  const d     = new Date(iso);
  const today = new Date();
  const diff  = Math.floor((today - d) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: diff > 300 ? 'numeric' : undefined });
}

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1048576)     return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

async function handleUpload(files) {
  if (!files || !files.length) return;

  const statusEl = document.getElementById('upload-status');
  statusEl.hidden    = false;
  statusEl.className = 'upload-status';
  statusEl.textContent = `Uploading ${files.length} file${files.length > 1 ? 's' : ''}…`;

  const folderId = currentFolderId();
  const token    = getJWT();
  const results  = [];

  for (const file of files) {
    const form = new FormData();
    form.append('file', file);
    form.append('folder_id', folderId);

    try {
      const res = await fetch(`${AUTH_URL}/data/drive/upload`, {
        method:  'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body:    form,
      });
      if (res.status === 401) { clearJWT(); window.location.href = 'auth.html'; return; }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      results.push({ name: file.name, ok: true });
    } catch (err) {
      results.push({ name: file.name, ok: false, error: err.message });
    }
  }

  const failed = results.filter(r => !r.ok);
  if (!failed.length) {
    statusEl.className   = 'upload-status success';
    statusEl.textContent = `${results.length} file${results.length > 1 ? 's' : ''} uploaded successfully.`;
  } else {
    statusEl.className   = 'upload-status error';
    statusEl.textContent = `${failed.length} upload(s) failed: ${failed.map(r => r.name).join(', ')}`;
  }

  // Reset input so same file can be re-uploaded
  document.getElementById('upload-input').value = '';

  // Refresh file list
  reloadFolder();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setError(msg) {
  const el = document.getElementById('error-banner');
  el.hidden      = !msg;
  el.textContent = msg || '';
}

function escHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function escAttr(str) {
  return (str || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
