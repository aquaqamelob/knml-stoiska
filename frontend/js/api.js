// Komunikacja z backendem (FastAPI + SQLite). Gdy backend jest niedostępny,
// statystyki liczone są lokalnie w localStorage, a wyniki czekają w kolejce.

const LS_KEY = 'knml-kiosk-local-v2';

export function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function readLocal() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || { days: {}, queue: [] }; }
  catch { return { days: {}, queue: [] }; }
}
function writeLocal(v) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(v)); } catch { /* tryb prywatny */ }
}

// Hasło obsługi (ustawiane po zalogowaniu w panelu) - serwer na Vercelu wymaga go do zerowania
// statystyk i zmiany ustawień; backend w Dockerze ten nagłówek ignoruje.
let adminPass = '';
export function setAdminPass(p) { adminPass = String(p || ''); }

async function req(method, url, body) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 3500);
  try {
    const r = await fetch(url, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(adminPass && method !== 'GET' ? { 'X-Admin-Pass': adminPass } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

/** Punkt za grę dla ludzi: wynik > 50% = wygrana człowieka (1), < 50% = wygrana AI (0), równo 50% = remis (0,5). */
export const winPoint = (score) => (score > 0.5 + 1e-9 ? 1 : score < 0.5 - 1e-9 ? 0 : 0.5);

function localStats(day) {
  const d = readLocal().days[day];
  const n = d ? d.games : 0;
  return { day, games: n, human: n ? d.sum / n : null, win: n ? (d.wins ?? 0) / n : null, records: d?.records || {}, local: true };
}

const listeners = new Set();
let lastStats = null;
export function onStats(fn) { listeners.add(fn); if (lastStats) fn(lastStats); return () => listeners.delete(fn); }
export const currentStats = () => lastStats;
function emit(s) { lastStats = s; listeners.forEach((fn) => fn(s)); }

export async function fetchStats() {
  const day = today();
  try {
    await flushQueue();
    const s = await req('GET', `/api/stats?day=${day}`);
    emit(s);
    return s;
  } catch {
    const s = localStats(day);
    emit(s);
    return s;
  }
}

async function flushQueue() {
  const st = readLocal();
  if (!st.queue.length) return;
  const rest = [];
  for (const item of st.queue) {
    try { await req('POST', '/api/result', item); } catch { rest.push(item); }
  }
  st.queue = rest;
  writeLocal(st);
}

/** score: 0..1 - jak dobrze człowiek poradził sobie "przeciwko" AI w tej grze */
export async function reportResult(game, mode, score, meta) {
  const item = { game, mode, score: Math.max(0, Math.min(1, score)), day: today(), meta };
  const st = readLocal();
  const d = (st.days[item.day] ||= { games: 0, sum: 0, wins: 0, records: {} });
  d.games += 1; d.sum += item.score; d.wins = (d.wins ?? 0) + winPoint(item.score);
  try {
    const s = await req('POST', '/api/result', item);
    writeLocal(st);
    emit(s);
    return s;
  } catch {
    st.queue.push(item);
    writeLocal(st);
    const s = localStats(item.day);
    emit(s);
    return s;
  }
}

export async function resetToday() {
  const day = today();
  const st = readLocal(); delete st.days[day]; st.queue = []; writeLocal(st);
  try { emit(await req('DELETE', `/api/stats?day=${day}`)); } catch { emit(localStats(day)); }
}

// ---- gra 1: wspólna pamięć n-gramów odwiedzających
export async function postSequence(seq) {
  try { await req('POST', '/api/markov/sequence', { seq }); } catch { /* offline */ }
}
export async function getCrowdNgram() {
  try { return (await req('GET', '/api/markov/ngram')).counts || {}; } catch { return {}; }
}

// ---- ustawienia stoiska (np. czy pokazywać statystyki na stronie głównej); zapisywane na serwerze,
// a kopia w localStorage działa, gdy serwer chwilowo nie odpowiada
const SET_KEY = 'knml-kiosk-settings';
export async function getSettings() {
  try {
    const s = await req('GET', '/api/settings');
    try { localStorage.setItem(SET_KEY, JSON.stringify(s)); } catch { /* */ }
    return s;
  } catch {
    try { return { statsVisible: true, ...JSON.parse(localStorage.getItem(SET_KEY) || '{}') }; } catch { return { statsVisible: true }; }
  }
}
export async function saveSettings(patch) {
  try { localStorage.setItem(SET_KEY, JSON.stringify({ ...JSON.parse(localStorage.getItem(SET_KEY) || '{}'), ...patch })); } catch { /* */ }
  try { return await req('POST', '/api/settings', patch); } catch { return getSettings(); }
}
