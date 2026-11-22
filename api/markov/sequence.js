import { handler, send, redis, body, SEQ_RE, MAX_CTX, K } from '../_lib.js';

export default handler(['POST'], async (req, res) => {
  const seq = body(req).seq;
  if (typeof seq !== 'string' || !SEQ_RE.test(seq)) return send(res, 400, { detail: 'sequence must be 10-40 chars of 0/1' });

  // zliczamy lokalnie, potem jedno HINCRBY na kontekst (max 30 kontekstów)
  const inc = { c0: new Map(), c1: new Map() };
  for (let i = 1; i < seq.length; i++) {
    const m = seq[i] === '1' ? inc.c1 : inc.c0;
    for (let k = 1; k <= MAX_CTX && i - k >= 0; k++) {
      const ctx = seq.slice(i - k, i);
      m.set(ctx, (m.get(ctx) || 0) + 1);
    }
  }
  const p = redis().pipeline();
  for (const [ctx, n] of inc.c0) p.hincrby(K.ng0, ctx, n);
  for (const [ctx, n] of inc.c1) p.hincrby(K.ng1, ctx, n);
  await p.exec();
  return send(res, 200, { ok: true });
});
