import {readBrowserSource} from './browser-source.mjs';
import {SOURCE_URL} from './parser.mjs';
import {run} from './monitor.mjs';
import {appendFileSync} from 'node:fs';

try {
  const source = await readBrowserSource();
  const result = await run({sync: true, secret: process.env.DODAM_MONITOR_SECRET,
    fetcher: (url, options) => url === SOURCE_URL ? Promise.resolve(new Response(source.html)) : fetch(url, options)});
  console.log(JSON.stringify({...result, collector: 'github-standard-chrome'}));
} catch (error) {
  const diagnostic={ok: false, code: error.code || 'browser_or_network', error: error.code ? error.message : 'Browser collection failed', receiverStatus:error.receiverStatus, receiverCode:error.receiverCode};
  console.error(JSON.stringify(diagnostic));
  if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,'failure='+JSON.stringify(diagnostic)+'\n');
  process.exitCode = 1;
} finally { delete process.env.DODAM_MONITOR_SECRET; }
