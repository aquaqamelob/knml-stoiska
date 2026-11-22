import { handler, send, readStats, redis, isAdmin, DAY_RE, K } from './_lib.js';

export default handler(['GET', 'DELETE'], async (req, res) => {
  const day = String(req.query.day || '');
  if (!DAY_RE.test(day)) return send(res, 400, { detail: 'day must be YYYY-MM-DD' });

  if (req.method === 'DELETE') {
    if (!isAdmin(req)) return send(res, 401, { detail: 'admin password required' });
    const n = Number((await redis().hget(K.day(day), 'n')) || 0);
    const p = redis().pipeline();
    p.del(K.day(day), K.rec(day));
    if (n) p.decrby(K.all, n);
    await p.exec();
  }
  return send(res, 200, await readStats(day));
});
