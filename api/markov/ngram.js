import { handler, send, redis, K } from '../_lib.js';

export default handler(['GET'], async (_req, res) => {
  const p = redis().pipeline();
  p.hgetall(K.ng0);
  p.hgetall(K.ng1);
  const [a, b] = await p.exec();
  const c0 = a || {}, c1 = b || {};
  const counts = {};
  for (const ctx of new Set([...Object.keys(c0), ...Object.keys(c1)])) counts[ctx] = [Number(c0[ctx] || 0), Number(c1[ctx] || 0)];
  return send(res, 200, { counts });
});
