import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {run, sign, DESTINATION} from './monitor.mjs';
import {parseMarket, SOURCE_URL} from './parser.mjs';
import worker from './worker.mjs';
import {handoff, delayUntilNext} from './handoff.mjs';
import {APPROVED_PRODUCTS} from './approved-products.mjs';

const fixture = '<html>우천상품권 매입가 판매가<table>' + APPROVED_PRODUCTS.map(p =>
  `<tr><td><a href="goods_detail.php?goodsIdx=${p.id.slice(4)}">${p.name}</a></td><td>${(p.face?p.face*0.95:100).toLocaleString('en-US')}원 (5%)</td><td>${(p.face?p.face*0.96:100).toLocaleString('en-US')}원 (4%)</td></tr>`).join('') + '</table></html>';
const secret = 'test-receiver-key-'.repeat(3), stamp = '1792579000000', body = '{"source":"test"}';
assert.equal(await sign(secret, stamp, body), createHmac('sha256', secret).update(stamp + '\n' + body).digest('hex'));
let sent = 0, observed;
const fetcher = async (url, options) => {
  if (url === SOURCE_URL) return new Response(fixture);
  if (url === DESTINATION) {
    sent++;
    observed = JSON.parse(options.body);
    assert.equal(options.headers['X-Dodam-Signature'], createHmac('sha256', secret).update(options.headers['X-Dodam-Timestamp'] + '\n' + options.body).digest('hex'));
    return Response.json({ok: true, revision: 1, changed: true});
  }
  return Response.json({status: 'fresh', integrationStatus: 'connected', pricesExpired: false, fetchedAt: observed.observedAt, rows: parseMarket(observed.html)});
};
const result = await run({sync: true, secret, fetcher});
assert.equal(result.products, 72);
assert.equal(result.publicVerified, true);
assert.equal(sent, 1);
for (const source of ['Please prove that you are human', '<html>Maintenance</html>', fixture.replace('475,000원 (5%)', '1원 (5%)')]) {
  let posts = 0;
  await assert.rejects(() => run({sync: true, secret, fetcher: async url => { if (url === DESTINATION) posts++; return new Response(source); }}));
  assert.equal(posts, 0);
}
await assert.rejects(() => run({sync: true, secret: ''}), {code: 'configuration'});
assert.equal((await worker.fetch(new Request('https://example.test/run', {method: 'POST'}), {DODAM_TRIGGER_TOKEN: 't'.repeat(48)})).status, 401);
assert.equal((await worker.fetch(new Request('https://example.test/run', {method: 'POST', headers: {Authorization: 'Bearer ' + 't'.repeat(48)}, body: 'untrusted'}), {DODAM_TRIGGER_TOKEN: 't'.repeat(48)})).status, 400);
await assert.rejects(() => run({sync: true, secret, fetcher: async (url, options) => {
  const response = await fetcher(url, options);
  if (url.endsWith('/api/market-rates')) { const data = await response.json(); data.rows[0].buy.price = 1; return Response.json(data); }
  return response;
}}), {code: 'verification_prices'});
assert.equal(delayUntilNext('1000', 1_060_000), 240_000);
assert.equal(delayUntilNext('1000', 1_400_000), 0);
assert.equal(delayUntilNext('', 1_060_000), 300_000);
let dispatched = 0, stateChecks = 0;
const waits = [];
const next = await handoff({token: 'test-only', repository: 'Abraham721/dodam-price-monitor', attemptedAt: '1000', now: () => 1_060_000, wait: async ms => waits.push(ms), fetcher: async (url, options) => {
  if (url.endsWith('/dispatches')) {
    dispatched++;
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), {ref: 'main', inputs: {keep_running: true, continuation: true}});
    return new Response(null, {status: 204});
  }
  stateChecks++;
  return Response.json({state: 'active'});
}});
assert.equal(next.dispatched, true);
assert.equal(dispatched, 1);
assert.equal(stateChecks, 2);
assert.deepEqual(waits, [240_000]);
let checks = 0;
const stopped = await handoff({token: 'test-only', repository: 'Abraham721/dodam-price-monitor', attemptedAt: '1000', wait: async () => {}, fetcher: async url => {
  assert.ok(!url.endsWith('/dispatches'));
  return Response.json({state: ++checks === 1 ? 'active' : 'disabled_manually'});
}});
assert.equal(stopped.dispatched, false);
let dispatchAttempts = 0;
const retryWaits = [];
const recovered = await handoff({token: 'test-only', repository: 'Abraham721/dodam-price-monitor', attemptedAt: '1000', now: () => 1_400_000, wait: async ms => retryWaits.push(ms), fetcher: async url => {
  if (!url.endsWith('/dispatches')) return Response.json({state: 'active'});
  return new Response(null, {status: ++dispatchAttempts === 1 ? 503 : 204});
}});
assert.equal(recovered.dispatched, true);
assert.equal(dispatchAttempts, 2);
assert.deepEqual(retryWaits, [0, 10_000]);
let rejectedDispatches = 0;
await assert.rejects(() => handoff({token: 'test-only', repository: 'Abraham721/dodam-price-monitor', attemptedAt: '1000', now: () => 1_400_000, wait: async () => {}, fetcher: async url => {
  if (!url.endsWith('/dispatches')) return Response.json({state: 'active'});
  rejectedDispatches++;
  return new Response(null, {status: 403});
}}), /dispatch rejected: 403/);
assert.equal(rejectedDispatches, 1);
await assert.rejects(() => handoff({token: 'test-only', repository: 'other/repository'}));
const temporary='<tr><td><a href="goods_detail.php?goodsIdx=168">RCE-TEST-DO-NOT-BUY</a></td><td>100원 (0%)</td><td>100원 (0%)</td></tr><tr><td><a href="goods_detail.php?goodsIdx=169">GIF-CONTROL-TEST</a></td><td>not a price</td><td>not a price</td></tr>';
const pending=[];
assert.equal(parseMarket(fixture.replace('</table>',temporary+'</table>'),{onQuarantined:p=>pending.push(p)}).length,72);
assert.deepEqual(pending.map(p=>p.id),['woo-168','woo-169']);
assert.throws(()=>parseMarket(fixture.replace('goodsIdx=104','missing=104')),{code:'source_incomplete'});
assert.throws(()=>parseMarket(fixture.replace('롯데 상품권 (50만원권)','롯데 상품권 (10만원권)')),{code:'source_denomination'});
await assert.rejects(()=>run({sync:true,secret,fetcher:async(url,options)=>url===DESTINATION?Response.json({error:'Approved products missing: woo-104',code:'source_incomplete'},{status:422}):fetcher(url,options)}),error=>error.code==='receiver_rejected'&&error.receiverCode==='source_incomplete'&&error.message.includes('woo-104'));
console.log('PASS: temporary unknown products are quarantined, malformed unknown prices do not block approved products, missing/changed approved denominations remain blocked, receiver rejection details retained.');
console.log('PASS: signed price verification, invalid-source rejection, timed server handoff, retry after service failure, no permission-error retry, repository restriction, stop-on-disable.');
