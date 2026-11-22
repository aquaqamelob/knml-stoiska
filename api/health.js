import { handler, send } from './_lib.js';

export default handler(['GET'], async (_req, res) => send(res, 200, { ok: true, time: Date.now() / 1000 }));
