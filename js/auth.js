const AUTH_URL = 'https://auth.lobelaccountancy.com';
const JWT_KEY  = 'lac_jwt';

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
