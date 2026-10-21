import {run} from './monitor.mjs';

async function equalSecret(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || b.length < 32 || a.length > 256) return false;
  const enc = new TextEncoder();
  const [left, right] = await Promise.all([a, b].map(x => crypto.subtle.digest('SHA-256', enc.encode(x))));
  const x = new Uint8Array(left), y = new Uint8Array(right);
  let difference = 0;
  for (let i = 0; i < x.length; i++) difference |= x[i] ^ y[i];
  return difference === 0;
}

export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil((async () => {
      try {
        const result = await run({sync: true, secret: env.DODAM_MONITOR_SECRET});
        console.log(JSON.stringify({...result, trigger: 'cloudflare-cron', scheduledTime: controller.scheduledTime}));
      } catch (error) {
        console.error(JSON.stringify({ok: false, trigger: 'cloudflare-cron', code: error.code || 'network_or_runtime'}));
        throw new Error('Scheduled price collection failed');
      }
    })());
  },
  async fetch(request, env) {
    const json = (value, status = 200) => Response.json(value, {status, headers: {'Cache-Control': 'no-store'}});
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/run') return json({service: 'Dodam price collector'}, 404);
    const credential = request.headers.get('Authorization') || '';
    if (!credential.startsWith('Bearer ') || !await equalSecret(credential.slice(7), env.DODAM_TRIGGER_TOKEN)) return json({ok: false, code: 'unauthorized'}, 401);
    if (Number(request.headers.get('Content-Length') || 0) > 0 || await request.text()) return json({ok: false, code: 'body_not_allowed'}, 400);
    try {
      const result = await run({sync: true, secret: env.DODAM_MONITOR_SECRET});
      console.log(JSON.stringify(result));
      return json(result);
    } catch (error) {
      const result = {ok: false, code: error.code || 'network_or_runtime', error: error.code ? error.message : 'Monitor failed'};
      console.error(JSON.stringify(result));
      return json(result, 502);
    }
  },
};
