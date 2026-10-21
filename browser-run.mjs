import {readBrowserSource} from './browser-source.mjs';
import {SOURCE_URL} from './parser.mjs';
import {run} from './monitor.mjs';

try {
  const source = await readBrowserSource();
  const result = await run({sync: true, secret: process.env.DODAM_MONITOR_SECRET,
    fetcher: (url, options) => url === SOURCE_URL ? Promise.resolve(new Response(source.html)) : fetch(url, options)});
  console.log(JSON.stringify({...result, collector: 'github-standard-chrome'}));
} catch (error) {
  console.error(JSON.stringify({ok: false, code: error.code || 'browser_or_network', error: error.code ? error.message : 'Browser collection failed'}));
  process.exitCode = 1;
} finally { delete process.env.DODAM_MONITOR_SECRET; }
