import {parseMarket, SOURCE_URL} from './parser.mjs';
import {pathToFileURL} from 'node:url';

export const DESTINATION = 'https://dodamticket.com/api/market-webhook';
const fail = (code, message) => { throw Object.assign(new Error(message), {code}); };

export async function readSource(fetcher = fetch) {
  const response = await fetcher(SOURCE_URL, {
    redirect: 'manual', signal: AbortSignal.timeout(20000),
    headers: {'User-Agent': 'DodamTicketPriceMonitor/1.0 (+https://dodamticket.com)', Accept: 'text/html'},
  });
  if (!response.ok) fail('source_http', `Source HTTP ${response.status}`);
  if (!response.body) fail('source_empty', 'Source body is empty');
  const reader = response.body.getReader(), chunks = [];
  let size = 0;
  while (true) {
    const {done, value} = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 512000) { await reader.cancel(); fail('source_size', 'Source exceeds size limit'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const utf8 = new TextDecoder().decode(bytes);
  const html = utf8.includes('우천상품권') ? utf8 : new TextDecoder('euc-kr').decode(bytes);
  if (/Please prove that you are human|자동등록방지|captcha|slowAES\.decrypt/i.test(html)) {
    fail('source_challenge', 'Source returned a verification page; prices were not changed');
  }
  let rows;
  try { rows = parseMarket(html); } catch { fail('source_format', 'Source price table failed validation'); }
  return {html, rows, observedAt: new Date().toISOString()};
}

export async function sign(secret, stamp, raw) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  const bytes = await crypto.subtle.sign('HMAC', key, enc.encode(stamp + '\n' + raw));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}

export async function run({sync = false, secret, fetcher = fetch} = {}) {
  if (sync && (!secret || secret.length < 32)) fail('configuration', 'Receiver key is missing');
  const {html, rows, observedAt} = await readSource(fetcher);
  if (!sync) return {ok: true, mode: 'probe', observedAt, products: rows.length};
  const raw = JSON.stringify({sourceUrl: SOURCE_URL, observedAt, html}), stamp = String(Date.now());
  const headers = {'Content-Type': 'application/json', 'X-Dodam-Timestamp': stamp,
    'X-Dodam-Signature': await sign(secret, stamp, raw)};
  let response;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      response = await fetcher(DESTINATION, {method: 'POST', headers, body: raw,
        redirect: 'manual', signal: AbortSignal.timeout(20000)});
      if (response.status < 500 || attempt === 1) break;
    } catch {
      if (attempt === 1) fail('receiver_network', 'Receiver connection failed');
    }
  }
  let result;
  try { result = await response.json(); } catch { fail('receiver_response', 'Receiver returned an invalid response'); }
  if (!response.ok || result.ok !== true) fail('receiver_rejected', `Receiver rejected update (HTTP ${response.status})`);
  const liveResponse = await fetcher('https://dodamticket.com/api/market-rates', {signal: AbortSignal.timeout(20000), cache: 'no-store'});
  if (!liveResponse.ok) fail('verification_http', 'Public price verification failed');
  const live = await liveResponse.json();
  if (live.status !== 'fresh' || live.integrationStatus !== 'connected' || live.pricesExpired || !Array.isArray(live.rows)) {
    fail('verification_status', 'Public prices are not fresh and connected');
  }
  if (Date.parse(live.fetchedAt) < Date.parse(observedAt)) fail('verification_time', 'Public update time did not advance');
  const differences = rows.filter(row => {
    const other = live.rows.find(x => x.id === row.id);
    return !other || JSON.stringify([row.buy, row.sell]) !== JSON.stringify([other.buy, other.sell]);
  });
  if (differences.length) fail('verification_prices', 'Public prices differ from the observed source');
  return {ok: true, mode: 'sync', observedAt, products: rows.length, revision: result.revision,
    changed: !!result.changed, publicVerified: true, publicFetchedAt: live.fetchedAt};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(JSON.stringify(await run({sync: process.argv.includes('--sync'), secret: process.env.DODAM_MONITOR_SECRET})));
  } catch (error) {
    console.error(JSON.stringify({ok: false, code: error.code || 'network_or_runtime', error: error.code ? error.message : 'Monitor failed'}));
    process.exitCode = 1;
  } finally { delete process.env.DODAM_MONITOR_SECRET; }
}
