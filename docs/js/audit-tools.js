// LAC Audit Tools

const API = 'https://auth.lobelaccountancy.com';

const MODE_DESC = {
  ask:     'Ask the AI a question about the uploaded documents. Uses Gemini by default — switch to Local for fully private processing.',
  extract: 'Extract all financial figures, dates, and key data points from the documents using AI.',
  crossref:'Find every occurrence of a specified value or term and flag any discrepancies across documents.',
  footing: 'Verify that column and row totals in numerical tables are arithmetically correct.',
  search:  'Fast keyword or value search across all documents — no AI, instant results.',
};

let _files    = [];    // { file: File, id: number }
let _fileId   = 0;
let _mode     = 'ask';
let _engine   = 'gemini';
let _running  = false;

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  if (!requireAuth()) return;
  const p = jwtPayload(getJWT());
  document.getElementById('nav-user').textContent = (p?.email || '').split('@')[0];

  setMode('ask');
  checkOllamaStatus();
  setupDropZone();

  document.getElementById('file-input').addEventListener('change', e => {
    [...e.target.files].forEach(addFile);
    e.target.value = '';
  });

  document.getElementById('prompt-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) runAnalysis();
  });
  document.getElementById('search-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') runAnalysis();
  });
});

// ---------------------------------------------------------------------------
// Ollama status
// ---------------------------------------------------------------------------

async function checkOllamaStatus() {
  const dot       = document.getElementById('ollama-dot');
  const label     = document.getElementById('ollama-label');
  const claudeTab = document.getElementById('engine-claude-tab');
  const geminiTab = document.getElementById('engine-gemini-tab');
  try {
    const data = await apiFetch('/audit-tools/ollama-status');
    if (data?.running) {
      dot.className   = 'ollama-dot online';
      label.textContent = `Local AI ready · ${data.active_model}`;
    } else {
      dot.className   = 'ollama-dot offline';
      label.textContent = 'Local AI offline — search & extract still work';
    }
    if (data?.gemini_available) {
      geminiTab.title = data.gemini_model || 'gemini-1.5-flash';
    } else {
      geminiTab.style.opacity = '0.45';
      geminiTab.title = 'Set GEMINI_API_KEY to enable Gemini';
    }
    if (data?.claude_available) {
      claudeTab.title = data.claude_model || '';
    } else {
      claudeTab.style.opacity = '0.45';
      claudeTab.title = 'Set ANTHROPIC_API_KEY to enable Claude';
    }
  } catch {
    dot.className   = 'ollama-dot offline';
    label.textContent = 'Local AI status unknown';
  }
}

function setEngine(engine) {
  _engine = engine;
  document.querySelectorAll('#engine-tabs .mode-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.engine === engine);
  });
}

// ---------------------------------------------------------------------------
// File management
// ---------------------------------------------------------------------------

function addFile(file) {
  const MAX_TOTAL = 50 * 1024 * 1024;
  const currentSize = _files.reduce((s, f) => s + f.file.size, 0);
  if (currentSize + file.size > MAX_TOTAL) {
    setStatus('Total file size exceeds 50 MB limit.', 'error');
    return;
  }
  _files.push({ file, id: ++_fileId });
  renderFileList();
}

function removeFile(id) {
  _files = _files.filter(f => f.id !== id);
  renderFileList();
}

function renderFileList() {
  const el = document.getElementById('file-list');
  if (!_files.length) { el.innerHTML = ''; return; }

  el.innerHTML = _files.map(f => {
    const icon = f.file.name.toLowerCase().endsWith('.pdf') ? '📄' :
                 f.file.name.toLowerCase().match(/\.xlsx?$/) ? '📊' : '📝';
    const size = f.file.size < 1024 ? `${f.file.size} B` :
                 f.file.size < 1048576 ? `${(f.file.size/1024).toFixed(1)} KB` :
                 `${(f.file.size/1048576).toFixed(1)} MB`;
    return `
      <div class="file-chip" data-id="${f.id}">
        <span class="file-icon">${icon}</span>
        <span class="file-chip-name" title="${escHtml(f.file.name)}">${escHtml(f.file.name)}</span>
        <span style="font-size:11px;color:#8BA7C4;flex-shrink:0;">${size}</span>
        <span class="file-chip-remove" onclick="removeFile(${f.id})" title="Remove">&#215;</span>
      </div>`;
  }).join('');
}

// ---------------------------------------------------------------------------
// Mode selector
// ---------------------------------------------------------------------------

function setMode(mode) {
  _mode = mode;
  document.querySelectorAll('.mode-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.mode === mode));
  document.getElementById('mode-desc').textContent = MODE_DESC[mode] || '';

  const isSearch = mode === 'search';
  document.getElementById('prompt-area').style.display = isSearch ? 'none' : '';
  document.getElementById('search-area').style.display = isSearch ? '' : 'none';
  document.getElementById('run-btn').textContent =
    mode === 'search' ? 'Search Documents' : 'Run Analysis';
  document.getElementById('extract-btn').style.display =
    mode === 'search' ? 'none' : '';
}

// ---------------------------------------------------------------------------
// Drop zone
// ---------------------------------------------------------------------------

function setupDropZone() {
  const zone = document.getElementById('drop-zone');
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', ()  => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    [...(e.dataTransfer.files || [])].forEach(addFile);
  });
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

async function extractOnly() {
  if (!_files.length) { setStatus('Please upload at least one file.', 'error'); return; }
  await _runRequest('extract-only');
}

async function runAnalysis() {
  if (!_files.length) { setStatus('Please upload at least one file.', 'error'); return; }
  await _runRequest(_mode);
}

async function _runRequest(mode) {
  if (_running) return;
  _running = true;
  setRunning(true);

  const fd = new FormData();
  _files.forEach(f => fd.append('files', f.file, f.file.name));

  try {
    let data;
    if (mode === 'extract-only') {
      setStatus('Extracting text from documents…', 'running');
      data = await apiFetchForm('/audit-tools/extract', fd);
      renderExtractResult(data);
    } else if (mode === 'search') {
      const term = document.getElementById('search-input').value.trim();
      if (!term) { setStatus('Enter a search term.', 'error'); return; }
      fd.append('term', term);
      setStatus(`Searching for "${term}"…`, 'running');
      data = await apiFetchForm('/audit-tools/search', fd);
      renderSearchResult(data);
    } else {
      const prompt = document.getElementById('prompt-input').value.trim();
      if (!prompt) { setStatus('Enter a prompt or question.', 'error'); return; }
      fd.append('prompt', prompt);
      fd.append('mode', mode);
      fd.append('engine', _engine);
      const engineLabel = _engine === 'claude' ? 'Claude' : _engine === 'gemini' ? 'Gemini' : 'local AI';
      setStatus(`Analyzing with ${engineLabel} — this may take 20–60 seconds…`, 'running');
      data = await apiFetchForm('/audit-tools/analyze', fd);
      renderAnalysisResult(data);
    }
    setStatus(`Done — ${new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}`, '');
  } catch (err) {
    setStatus(`Error: ${err.message}`, 'error');
  } finally {
    _running = false;
    setRunning(false);
  }
}

// ---------------------------------------------------------------------------
// Render results
// ---------------------------------------------------------------------------

function renderExtractResult(data) {
  const panel = document.getElementById('results-panel');
  const docs  = data.docs || [];

  panel.innerHTML = `
    <div class="result-card">
      <div class="result-card-header">
        &#128196; Extracted Text — ${docs.length} document${docs.length !== 1 ? 's' : ''}
      </div>
      <div class="result-card-body">
        <div class="doc-summary-list">
          ${docs.map((d, i) => `
            <div class="doc-summary-item">
              <span>${fileIcon(d.name)}</span>
              <span class="doc-summary-name">${escHtml(d.name)}</span>
              <span class="doc-summary-chars">${(d.chars||0).toLocaleString()} chars</span>
              <span class="doc-summary-expand" onclick="toggleDocText(${i})">Show ▾</span>
            </div>
            <div class="doc-text-expanded" id="doc-text-${i}">
              <div class="doc-preview">${escHtml((d.text||'').slice(0,4000))}${(d.text||'').length > 4000 ? '\n\n… (truncated)' : ''}</div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>`;
}

function renderSearchResult(data) {
  const panel   = document.getElementById('results-panel');
  const results = data.results || [];
  const total   = results.reduce((s, r) => s + (r.total || 0), 0);

  panel.innerHTML = `
    <div class="result-card">
      <div class="result-card-header">
        &#128270; Search: &ldquo;${escHtml(data.term)}&rdquo; — ${total} hit${total !== 1 ? 's' : ''} across ${results.length} file${results.length !== 1 ? 's' : ''}
      </div>
      <div class="result-card-body">
        ${results.map(r => `
          <div style="margin-bottom:16px;">
            <div style="font-size:13px;font-weight:600;margin-bottom:8px;color:#1B2A4A;">
              ${fileIcon(r.name)} ${escHtml(r.name)}
              <span style="font-weight:400;color:#8BA7C4;font-size:12px;margin-left:6px;">${r.total} hit${r.total !== 1 ? 's' : ''}</span>
            </div>
            ${r.hits.length ? r.hits.slice(0,20).map(h => `
              <div class="search-hit">
                <div class="search-hit-line">Line ${h.line}</div>
                ${highlightTerm(escHtml(h.snippet), escHtml(data.term))}
              </div>`).join('') : '<div style="font-size:13px;color:#8BA7C4;">No matches in this file.</div>'}
            ${r.hits.length > 20 ? `<div style="font-size:12px;color:#8BA7C4;margin-top:6px;">… and ${r.hits.length - 20} more hits</div>` : ''}
          </div>
        `).join('')}
        ${total === 0 ? '<div style="color:#8BA7C4;font-size:14px;padding:20px 0;text-align:center;">No matches found.</div>' : ''}
      </div>
    </div>`;
}

function renderAnalysisResult(data) {
  const panel = document.getElementById('results-panel');
  const modeLabel = { ask:'AI Answer', extract:'Data Extraction', crossref:'Cross-Reference', footing:'Footing Check' };
  const modeIcon  = { ask:'&#129302;', extract:'&#128203;', crossref:'&#128279;', footing:'&#9989;' };

  const docsHtml = (data.docs || []).map((d, i) => `
    <div class="doc-summary-item">
      <span>${fileIcon(d.name)}</span>
      <span class="doc-summary-name">${escHtml(d.name)}</span>
      <span class="doc-summary-chars">${(d.chars||0).toLocaleString()} chars extracted</span>
    </div>`).join('');

  panel.innerHTML = `
    <div class="result-card">
      <div class="result-card-header" style="justify-content:space-between;">
        <span>${modeIcon[data.mode]||'&#128269;'} ${modeLabel[data.mode]||'Result'}</span>
        <span style="font-size:11px;opacity:0.75;font-weight:400;">${data.engine === 'claude' ? 'claude-sonnet-4-6 · cloud' : data.engine === 'gemini' ? 'gemini-1.5-flash · cloud' : 'llama3.2:3b · local'}</span>
      </div>
      <div class="result-card-body">
        <div style="font-size:11px;color:#8BA7C4;margin-bottom:10px;">Prompt: ${escHtml(data.prompt)}</div>
        <div class="ai-response">${escHtml(data.result)}</div>
      </div>
    </div>
    <div class="result-card">
      <div class="result-card-header">&#128196; Source Documents</div>
      <div class="result-card-body">
        <div class="doc-summary-list">${docsHtml}</div>
      </div>
    </div>`;
}

function toggleDocText(i) {
  const el  = document.getElementById(`doc-text-${i}`);
  const btn = el.previousElementSibling.querySelector('.doc-summary-expand');
  if (el.style.display === 'block') {
    el.style.display = 'none';
    btn.textContent = 'Show ▾';
  } else {
    el.style.display = 'block';
    btn.textContent = 'Hide ▴';
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setStatus(msg, cls = '') {
  const el = document.getElementById('at-status');
  el.textContent = msg;
  el.className = 'at-status' + (cls ? ` ${cls}` : '');
}

function setRunning(yes) {
  const btn = document.getElementById('run-btn');
  const ext = document.getElementById('extract-btn');
  btn.disabled = yes;
  if (ext) ext.disabled = yes;
  if (yes) {
    btn.innerHTML = '<span class="spinner"></span>Processing…';
  } else {
    btn.textContent = _mode === 'search' ? 'Search Documents' : 'Run Analysis';
  }
}

function fileIcon(name) {
  if (!name) return '📝';
  const n = name.toLowerCase();
  if (n.endsWith('.pdf'))  return '📄';
  if (n.match(/\.xlsx?$/)) return '📊';
  return '📝';
}

function escHtml(s) {
  return String(s||'')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

function highlightTerm(html, term) {
  const re = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), 'gi');
  return html.replace(re, m => `<mark style="background:#FFF176;border-radius:2px;">${m}</mark>`);
}

async function apiFetchForm(path, formData) {
  const token = getJWT();
  const resp = await fetch(API + path, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  if (!resp.ok) {
    let msg = `HTTP ${resp.status}`;
    try { const j = await resp.json(); msg = j.error || msg; } catch {}
    throw new Error(msg);
  }
  return resp.json();
}
