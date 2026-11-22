// Wspólny kod funkcji Vercel (pliki z "_" nie są wystawiane jako endpointy).
// Odpowiednik backend/main.py, ale zamiast SQLite: Upstash Redis (REST).
//
// Zmienne środowiskowe (ustawia je integracja Upstash w Vercel albo wpisujesz ręcznie):
//   UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN   (albo KV_REST_API_URL + KV_REST_API_TOKEN)
//   ADMIN_PASS  - hasło obsługi wymagane do zerowania statystyk i zmiany ustawień (domyślnie KNML)
//
// Schemat kluczy:
//   kiosk:d:<dzień>        hash  n, sum, wins, n:<gra>, sum:<gra>      (TTL 400 dni)
//   kiosk:d:<dzień>:rec    zset  mind -> min acc, autopilot -> min seconds (rekordy dnia)
//   kiosk:all              int   liczba gier od początku
//   kiosk:ngram:c0/c1      hash  ctx -> licznik (wspólna pamięć n-gramów, gra 1)
//   kiosk:settings         hash  klucz -> JSON
import { Redis } from '@upstash/redis';

export const GAMES = new Set(['mind', 'illusion', 'autopilot']);
export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export const SEQ_RE = /^[01]{10,40}$/;
export const MAX_CTX = 4;
export const DAY_TTL = 400 * 24 * 3600;
export const SETTINGS_DEFAULT = { statsVisible: true };

const K = {
  day: (d) => `kiosk:d:${d}`,
  rec: (d) => `kiosk:d:${d}:rec`,
  all: 'kiosk:all',
  ng0: 'kiosk:ngram:c0',
  ng1: 'kiosk:ngram:c1',
  settings: 'kiosk:settings',
};
export { K };

let client;
export function redis() {
  if (!client) {
    const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
    if (!url || !token) throw new Error('Brak UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN');
    client = new Redis({ url, token, automaticDeserialization: false });
  }
  return client;
}

export const winPoint = (s) => (s > 0.5 + 1e-9 ? 1 : s < 0.5 - 1e-9 ? 0 : 0.5);
const r4 = (x) => Math.round(x * 1e4) / 1e4;

export async function readStats(day) {
  const p = redis().pipeline();
  p.hgetall(K.day(day));
  p.zscore(K.rec(day), 'mind');
  p.zscore(K.rec(day), 'autopilot');
  p.get(K.all);
  const [h, recMind, recAuto, all] = await p.exec();
  const hash = h || {};
  const num = (k) => Number(hash[k] || 0);
  const n = num('n');
  const byGame = {};
  for (const g of GAMES) {
    const gn = num(`n:${g}`);
    if (gn) byGame[g] = { games: gn, human: r4(num(`sum:${g}`) / gn) };
  }
  const recNum = (v) => (v === null || v === undefined ? null : Number(v));
  const records = { mind: recNum(recMind), autopilot: recNum(recAuto) };
  return {
    day,
    games: n,
    human: n ? r4(num('sum') / n) : null,
    win: n ? r4(num('wins') / n) : null,
    byGame,
    records,
    allTime: Number(all || 0),
  };
}

export function isAdmin(req) {
  const want = (process.env.ADMIN_PASS || 'KNML').trim().toUpperCase();
  const got = String(req.headers['x-admin-pass'] || '').trim().toUpperCase();
  return got === want;
}

export function send(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(body);
}

/** Owija handler: dozwolone metody + jednolita obsługa błędów. */
export function handler(methods, fn) {
  return async (req, res) => {
    if (!methods.includes(req.method)) {
      res.setHeader('Allow', methods.join(', '));
      return send(res, 405, { detail: 'method not allowed' });
    }
    try {
      return await fn(req, res);
    } catch (e) {
      console.error(e);
      return send(res, 500, { detail: 'server error' });
    }
  };
}

export function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch { return {}; }
}
