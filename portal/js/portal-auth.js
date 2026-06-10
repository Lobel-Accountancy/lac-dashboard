const AUTH_URL      = 'https://auth.lobelaccountancy.com';
const PORTAL_JWT_KEY = 'lac_portal_jwt';

function getPortalJWT()       { return localStorage.getItem(PORTAL_JWT_KEY); }
function setPortalJWT(token)  { localStorage.setItem(PORTAL_JWT_KEY, token); }
function clearPortalJWT()     { localStorage.removeItem(PORTAL_JWT_KEY); }

function jwtPayload(token) {
  try { return JSON.parse(atob(token.split('.')[1])); } catch { return null; }
}

function isPortalJWTValid(token) {
  if (!token) return false;
  const p = jwtPayload(token);
  return p && p.role === 'client' && p.exp * 1000 > Date.now();
}

function requirePortalAuth() {
  const token = getPortalJWT();
  if (!isPortalJWTValid(token)) {
    clearPortalJWT();
    window.location.href = 'auth.html';
    return false;
  }
  return true;
}

function portalLogout() {
  clearPortalJWT();
  window.location.href = 'auth.html';
}

async function portalFetch(path, opts = {}) {
  const token = getPortalJWT();
  const res = await fetch(`${AUTH_URL}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...(opts.headers || {}),
    },
  });
  if (res.status === 401 || res.status === 403) {
    clearPortalJWT();
    window.location.href = 'auth.html';
    return null;
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}
