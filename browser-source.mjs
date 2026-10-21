import {chromium} from 'playwright-core';
import {SOURCE_URL, parseMarket} from './parser.mjs';

export async function readBrowserSource() {
  const browserEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/TOKEN|SECRET|PASSWORD|KEY/i.test(key)));
  const browser = await chromium.launch({channel: 'chrome', headless: true, env: browserEnv});
  try {
    const page = await browser.newPage();
    const failures = [];
    page.on('requestfailed', request => failures.push({url: request.url().split('?')[0], reason: request.failure()?.errorText}));
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await page.goto(SOURCE_URL, {waitUntil: 'domcontentloaded', timeout: 30000});
        try { await page.locator('a[href*="goods_detail.php?goodsIdx="]').first().waitFor({state: 'attached', timeout: 25000}); } catch {}
        const html = await page.content();
        if (/Please prove that you are human|자동등록방지|captcha|slowAES\.decrypt/i.test(html)) {
          throw Object.assign(new Error('Ordinary browser navigation still received a verification page'), {code: 'source_challenge'});
        }
        const rows = parseMarket(html);
        return {html, products: rows.length, observedAt: new Date().toISOString(), browserVersion: browser.version()};
      } catch (error) {
        lastError = error;
        console.error(JSON.stringify({phase: 'source_retry', attempt, code: error.code || 'navigation', failedRequests: failures.slice(-5)}));
        if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
    throw lastError;
  } finally { await browser.close(); }
}

if (process.argv.includes('--probe')) {
  try {
    const {html, ...result} = await readBrowserSource();
    console.log(JSON.stringify({ok: true, mode: 'ordinary-browser-probe', ...result}));
  } catch (error) {
    console.error(JSON.stringify({ok: false, code: error.code || 'browser_navigation', error: error.code ? error.message : 'Browser navigation failed'}));
    process.exitCode = 1;
  }
}
