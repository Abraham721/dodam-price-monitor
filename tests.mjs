import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {run, sign, DESTINATION} from './monitor.mjs';
import {parseMarket, SOURCE_URL} from './parser.mjs';
import worker from './worker.mjs';
import {handoff, delayUntilNext} from './handoff.mjs';

const fixture = '<html>우천상품권 매입가 판매가<table>' + Array.from({length: 30}, (_, i) =>
  `<tr><td><a href="goods_detail.php?goodsIdx=${i + 1}">${i === 0 ? '롯데 상품권' : i === 1 ? '신세계 상품권' : '테스트 상품권 ' + i}(10만원권)</a></td><td>95,000원 (5%)</td><td>96,000원 (4%)</td></tr>`).join('') + '</table></html>';
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
assert.equal(result.products, 30);
assert.equal(result.publicVerified, true);
assert.equal(sent, 1);
for (const source of ['Please prove that you are human', '<html>Maintenance</html>', fixture.replace('95,000원 (5%)', '1원 (5%)')]) {
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
console.log('PASS: signed price verification, invalid-source rejection, timed server handoff, retry after service failure, no permission-error retry, repository restriction, stop-on-disable.');
