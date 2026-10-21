import {run} from './monitor.mjs';
try {
  console.log(JSON.stringify(await run({sync: process.argv.includes('--sync'), secret: process.env.DODAM_MONITOR_SECRET})));
} catch (error) {
  console.error(JSON.stringify({ok: false, code: error.code || 'network_or_runtime', error: error.code ? error.message : 'Monitor failed'}));
  process.exitCode = 1;
} finally { delete process.env.DODAM_MONITOR_SECRET; }
