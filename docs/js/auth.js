const AUTH_URL = 'https://auth.lobelaccountancy.com';
const JWT_KEY  = 'lac_jwt';

// ---------------------------------------------------------------------------
// Local network auto-login
// Backend redirects here with auth.html#jwt=<token> when on the home LAN.
// Save the token and redirect cleanly before any auth checks run.
// ---------------------------------------------------------------------------

(function () {
  if (window.location.hash.startsWith('#jwt=')) {
    const token = window.location.hash.slice(5);
    if (token) {
      localStorage.setItem(JWT_KEY, token);
      // Redirect to dashboard home, stripping the fragment
      window.location.replace('index.html');
    }
  }
})();

// ---------------------------------------------------------------------------
// Test mode
// ---------------------------------------------------------------------------

(function () {
  const params = new URLSearchParams(window.location.search);
  if (params.get('testmode') === '1') {
    localStorage.setItem('lac_testmode', '1');
  } else if (params.get('testmode') === '0') {
    localStorage.removeItem('lac_testmode');
  }
})();

window.LAC_TEST_MODE = localStorage.getItem('lac_testmode') === '1';

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

function getJWT()        { return localStorage.getItem(JWT_KEY); }
function setJWT(token)   { localStorage.setItem(JWT_KEY, token); }
function clearJWT()      { localStorage.removeItem(JWT_KEY); }

function jwtPayload(token) {
  try { return JSON.parse(atob(token.split('.')[1])); } catch { return null; }
}

function isJWTValid(token) {
  if (!token) return false;
  const p = jwtPayload(token);
  return p && p.exp * 1000 > Date.now();
}

function requireAuth() {
  const token = getJWT();
  if (!isJWTValid(token)) {
    clearJWT();
    window.location.href = 'auth.html';
    return false;
  }
  return true;
}

function logout() {
  clearJWT();
  window.location.href = 'auth.html';
}

async function apiFetch(path, opts = {}) {
  const token = getJWT();
  const extraHeaders = window.LAC_TEST_MODE ? { 'X-Env': 'test' } : {};
  const res = await fetch(`${AUTH_URL}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...extraHeaders,
      ...(opts.headers || {}),
    },
  });
  if (res.status === 401) {
    clearJWT();
    window.location.href = 'auth.html';
    return null;
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Test mode banner
// ---------------------------------------------------------------------------

function showTestBanner() {
  if (!window.LAC_TEST_MODE) return;
  const banner = document.createElement('div');
  banner.id = 'lac-test-banner';
  banner.style.cssText = [
    'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:9999',
    'background:#D97706', 'color:#ffffff', 'text-align:center',
    'padding:8px 16px', 'font-size:13px', 'font-weight:600',
    'display:flex', 'align-items:center', 'justify-content:center', 'gap:16px',
  ].join(';');
  banner.innerHTML =
    'TEST MODE — data changes do not affect production' +
    ' <a href="' + window.location.pathname + '?testmode=0"' +
    ' style="color:#fff;text-decoration:underline;font-weight:700;"' +
    ' onclick="localStorage.removeItem(\'lac_testmode\');window.LAC_TEST_MODE=false;">Exit test mode</a>';
  document.body.prepend(banner);
  // Push page content down so banner does not overlap nav
  document.body.style.paddingTop = '36px';
}

showTestBanner();

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

const _SETTINGS_KEY = 'lac_settings';

function _getSettings() {
  try { return JSON.parse(localStorage.getItem(_SETTINGS_KEY)) || {}; } catch { return {}; }
}
function _saveSetting(key, val) {
  const s = _getSettings(); s[key] = val;
  localStorage.setItem(_SETTINGS_KEY, JSON.stringify(s));
}

// Apply theme before paint to avoid flash
(function () {
  const t = _getSettings().theme || 'light';
  document.documentElement.setAttribute('data-theme', t);
})();

function _applySettings() {
  const s = _getSettings();
  document.documentElement.setAttribute('data-theme', s.theme || 'light');
  document.body.classList.toggle('text-lg', s.textSize === 'large');
}

function setTheme(t) {
  _saveSetting('theme', t);
  document.documentElement.setAttribute('data-theme', t);
  _refreshToggles();
}
function setTextSize(sz) {
  _saveSetting('textSize', sz);
  document.body.classList.toggle('text-lg', sz === 'large');
  _refreshToggles();
}
function setDensity(d) {
  _saveSetting('density', d);
  document.body.classList.toggle('density-compact', d === 'compact');
  _refreshToggles();
}

function _refreshToggles() {
  const s = _getSettings();
  const map = {
    'Light': s.theme !== 'dark', 'Dark': s.theme === 'dark',
    'Normal': s.textSize !== 'large', 'Large': s.textSize === 'large',
    'Default': s.density !== 'compact', 'Compact': s.density === 'compact',
  };
  document.querySelectorAll('.stoggle-btn').forEach(b => {
    const active = map[b.textContent.trim()];
    if (active !== undefined) b.classList.toggle('active', active);
  });
}

function _buildSettingsDropdown(username) {
  const s = _getSettings();
  const is = (key, val) => s[key] === val;
  const a = (cond) => cond ? ' active' : '';

  const el = document.createElement('div');
  el.className = 'settings-dropdown';
  el.id = 'settings-dropdown';
  el.innerHTML = `
    <div class="settings-user">${username}</div>
    <div class="settings-section">
      <div class="settings-section-title">Appearance</div>
      <div class="settings-row">
        <span>Theme</span>
        <div class="settings-toggle">
          <button class="stoggle-btn${a(!is('theme','dark'))}" onclick="setTheme('light')">Light</button>
          <button class="stoggle-btn${a(is('theme','dark'))}" onclick="setTheme('dark')">Dark</button>
        </div>
      </div>
      <div class="settings-row">
        <span>Text size</span>
        <div class="settings-toggle">
          <button class="stoggle-btn${a(!is('textSize','large'))}" onclick="setTextSize('normal')">Normal</button>
          <button class="stoggle-btn${a(is('textSize','large'))}" onclick="setTextSize('large')">Large</button>
        </div>
      </div>
      <div class="settings-row">
        <span>Density</span>
        <div class="settings-toggle">
          <button class="stoggle-btn${a(!is('density','compact'))}" onclick="setDensity('default')">Default</button>
          <button class="stoggle-btn${a(is('density','compact'))}" onclick="setDensity('compact')">Compact</button>
        </div>
      </div>
    </div>
    <div class="settings-divider"></div>
    <button class="settings-signout" onclick="logout()">Sign out</button>
  `;
  return el;
}

document.addEventListener('DOMContentLoaded', () => {
  _applySettings();

  const navRight = document.querySelector('.nav-right');
  const navUser  = document.getElementById('nav-user');
  if (!navRight || !navUser) return;

  // Hide original logout button — it moves into the dropdown
  const oldLogout = navRight.querySelector('.nav-logout');
  if (oldLogout) oldLogout.style.display = 'none';

  // Build trigger button (wraps around nav-user)
  const btn = document.createElement('button');
  btn.className = 'settings-btn';
  btn.id = 'settings-btn';
  btn.style.position = 'relative';

  // Mirror nav-user text into the button, including after it's set by the page
  const usernameSpan = document.createElement('span');
  new MutationObserver(() => { usernameSpan.textContent = navUser.textContent; })
    .observe(navUser, { childList: true, characterData: true, subtree: true });
  usernameSpan.textContent = navUser.textContent;
  navUser.style.display = 'none';

  const caret = document.createElement('span');
  caret.className = 'settings-caret';
  caret.textContent = '▾';
  btn.appendChild(usernameSpan);
  btn.appendChild(caret);

  const dropdown = _buildSettingsDropdown(navUser.textContent || 'Account');

  // Keep dropdown username in sync
  new MutationObserver(() => {
    const u = dropdown.querySelector('.settings-user');
    if (u) u.textContent = navUser.textContent;
  }).observe(navUser, { childList: true, characterData: true, subtree: true });

  btn.appendChild(dropdown);
  navRight.appendChild(btn);

  btn.addEventListener('click', e => { e.stopPropagation(); dropdown.classList.toggle('open'); });
  document.addEventListener('click', () => dropdown.classList.remove('open'));
  dropdown.addEventListener('click', e => e.stopPropagation());

  // Apply compact density if saved
  const s = _getSettings();
  if (s.density === 'compact') document.body.classList.add('density-compact');
});
