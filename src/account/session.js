// GO / NO-GO account session + API client.
//
// SAFETY RULE: this is a boating safety tool. Nothing here may lock someone out because the
// network failed. A saved session is trusted immediately and refreshed in the background; the
// session is only ever cleared when the SERVER actually answers 401 to an authenticated call.

export const API_BASE = "https://api.gonogoboatapp.com";
export const SITE = "https://gonogoboatapp.com";

const SESSION_KEY = "gonogo_session_v1";
const BOAT_KEY = "gonogo_boat_settings_v2";       // written by v1.2 / v1.3
export const LEGACY_KEY = "gonogo_legacy_member_v1";
const GATE_SEEN_KEY = "gonogo_gate_seen_v1";
const REF_KEY = "gng_ref";                          // set by the website / a pasted code

function lsGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
function lsSet(key, value) { try { localStorage.setItem(key, value); } catch { /* private mode / quota */ } }
function lsRemove(key) { try { localStorage.removeItem(key); } catch { /* ignore */ } }

/* ---------- session ---------- */
const listeners = new Set();
const notify = () => listeners.forEach((fn) => { try { fn(getSession()); } catch { /* a listener must never break the others */ } });
export const onSessionChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export function getSession() {
  try {
    const s = JSON.parse(lsGet(SESSION_KEY) || "null");
    return s && typeof s.token === "string" && s.user ? s : null;
  } catch { return null; }
}
export function saveSession({ token, user }) {
  lsSet(SESSION_KEY, JSON.stringify({ token, user, savedAt: Date.now() }));
  notify();
}
export function updateSessionUser(user) {
  const s = getSession();
  if (s) saveSession({ token: s.token, user });
}
export function clearSession() { lsRemove(SESSION_KEY); notify(); }

/** Wipe everything the app stored on this device (used when an account is deleted). */
export function clearAllLocalData() {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
    keys.filter((k) => k && (k.startsWith("gonogo_") || k === REF_KEY)).forEach((k) => localStorage.removeItem(k));
  } catch { /* ignore */ }
  try { sessionStorage.clear(); } catch { /* ignore */ }
  notify();
}

/* ---------- founding / legacy detection ----------
 * People who used v1.2 / v1.3 (before accounts existed) keep their Premium features. Their
 * old data is still on the phone, so the FIRST time v1.4's gate ever runs we look for it.
 * This must run before the app itself mounts (the app writes its own defaults on mount),
 * which is guaranteed because AccountGate only renders its children once the session is ready.
 * "First time only" matters: later launches of a brand-new install would otherwise see the
 * data the app wrote and wrongly mark it as an old install. */
export function detectLegacy() {
  try {
    if (!lsGet(GATE_SEEN_KEY)) {
      if (lsGet(BOAT_KEY) && !lsGet(LEGACY_KEY)) lsSet(LEGACY_KEY, JSON.stringify({ since: new Date().toISOString() }));
      lsSet(GATE_SEEN_KEY, new Date().toISOString());
    }
  } catch { /* ignore */ }
}
export const isLegacyMember = () => !!lsGet(LEGACY_KEY);
export const storedReferral = () => lsGet(REF_KEY) || "";
export const clearStoredReferral = () => lsRemove(REF_KEY);

/* ---------- API ---------- */
/**
 * One call to the API. Resolves to parsed JSON. Rejects with an Error carrying the server's own
 * (human-written) `message`, plus `.status` and `.data`. `.status === 0` means the network failed.
 * A 401 on an authenticated call clears the session, but only because the server said so.
 */
export async function api(path, { method = "GET", body, auth = true, timeoutMs = 8000 } = {}) {
  const session = auth ? getSession() : null;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(API_BASE + path, {
      method,
      signal: ctl.signal,
      headers: { "Content-Type": "application/json", ...(session ? { Authorization: "Bearer " + session.token } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    clearTimeout(timer);
    const e = new Error("Couldn't reach the server. Check your connection and try again.");
    e.status = 0; throw e;
  }
  clearTimeout(timer);
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text }; }
  if (!res.ok) {
    if (res.status === 401 && session) clearSession();
    const e = new Error(data.message || `Something went wrong (${res.status})`);
    e.status = res.status; e.data = data; throw e;
  }
  return data;
}
