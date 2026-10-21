import {setTimeout as sleep} from 'node:timers/promises';
import {pathToFileURL} from 'node:url';

export function delayUntilNext(attemptedAt, now = Date.now()) {
  const previous = Number(attemptedAt) * 1000;
  if (!Number.isFinite(previous) || previous <= 0) return 300_000;
  return Math.max(0, Math.min(300_000, previous + 300_000 - now));
}

export async function handoff({token, repository, attemptedAt, fetcher = fetch, wait = sleep, now = Date.now} = {}) {
  if (!token || repository !== 'Abraham721/dodam-price-monitor') throw new Error('Handoff configuration is missing or unexpected');
  const base = `https://api.github.com/repos/${repository}/actions/workflows/prices.yml`;
  const headers = {Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28'};
  async function activeWorkflow() {
    const response = await fetcher(base, {headers, signal: AbortSignal.timeout(20_000)});
    if (!response.ok) throw new Error(`Workflow state check failed: ${response.status}`);
    return (await response.json()).state === 'active';
  }
  if (!await activeWorkflow()) return {dispatched: false, reason: 'workflow_disabled'};
  const delay = delayUntilNext(attemptedAt, now());
  console.log(JSON.stringify({phase: 'server_wait', seconds: Math.ceil(delay / 1000)}));
  await wait(delay);
  if (!await activeWorkflow()) return {dispatched: false, reason: 'workflow_disabled'};
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetcher(`${base}/dispatches`, {
        method: 'POST', headers: {...headers, 'Content-Type': 'application/json'},
        body: JSON.stringify({ref: 'main', inputs: {keep_running: true, continuation: true}}),
        signal: AbortSignal.timeout(20_000)
      });
      if (response.ok) return {dispatched: true, requestedAt: new Date(now()).toISOString(), nextIntervalSeconds: 300};
      if (response.status < 500 && response.status !== 429) throw new Error(`Next run dispatch rejected: ${response.status}`);
    } catch (error) {
      if (/dispatch rejected/.test(error.message) || attempt === 2) throw error;
    }
    await wait(10_000 * (attempt + 1));
  }
  throw new Error('Next run dispatch failed after retries');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await handoff({token: process.env.GH_TOKEN, repository: process.env.REPOSITORY, attemptedAt: process.env.ATTEMPTED_AT});
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(JSON.stringify({ok: false, phase: 'server_handoff', error: error.message}));
    process.exitCode = 1;
  }
}
