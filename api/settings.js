import { handler, send, redis, body, isAdmin, SETTINGS_DEFAULT, K } from './_lib.js';

async function read() {
  const out = { ...SETTINGS_DEFAULT };
  const h = (await redis().hgetall(K.settings)) || {};
  for (const k of Object.keys(out)) if (k in h) { try { out[k] = JSON.parse(h[k]); } catch { /* */ } }
  return out;
}

export default handler(['GET', 'POST'], async (req, res) => {
  if (req.method === 'POST') {
    if (!isAdmin(req)) return send(res, 401, { detail: 'admin password required' });
    const b = body(req);
    const patch = {};
    if (typeof b.statsVisible === 'boolean') patch.statsVisible = JSON.stringify(b.statsVisible);
    if (Object.keys(patch).length) await redis().hset(K.settings, patch);
  }
  return send(res, 200, await read());
});
