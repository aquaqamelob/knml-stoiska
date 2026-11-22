import { handler, send, readStats, redis, body, winPoint, GAMES, DAY_RE, DAY_TTL, K } from './_lib.js';

export default handler(['POST'], async (req, res) => {
  const b = body(req);
  const { game, day } = b;
  const score = Number(b.score);
  if (!GAMES.has(game) || typeof day !== 'string' || !DAY_RE.test(day)) return send(res, 400, { detail: 'bad game/day' });
  if (!Number.isFinite(score) || score < 0 || score > 1) return send(res, 400, { detail: 'score must be 0..1' });

  const meta = b.meta && typeof b.meta === 'object' ? b.meta : {};
  const p = redis().pipeline();
  const dk = K.day(day);
  p.hincrby(dk, 'n', 1);
  p.hincrbyfloat(dk, 'sum', score);
  p.hincrbyfloat(dk, 'wins', winPoint(score));
  p.hincrby(dk, `n:${game}`, 1);
  p.hincrbyfloat(dk, `sum:${game}`, score);
  p.expire(dk, DAY_TTL);
  p.incr(K.all);

  // rekordy dnia: najniższa trafność AI w grze 1, najszybszy czas w grze 3
  const rec = game === 'mind' ? Number(meta.acc) : game === 'autopilot' ? Number(meta.seconds) : NaN;
  if (Number.isFinite(rec)) {
    p.zadd(K.rec(day), { lt: true }, { score: rec, member: game });
    p.expire(K.rec(day), DAY_TTL);
  }
  await p.exec();
  return send(res, 200, await readStats(day));
});
