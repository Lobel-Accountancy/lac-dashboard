const AUTH_URL = 'https://auth.lobelaccountancy.com';
const JWT_KEY  = 'lac_jwt';

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
  const res = await fetch(`${AUTH_URL}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
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
