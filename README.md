# Dodam public price monitor

The production workflow runs on GitHub-hosted Ubuntu with standard Google Chrome.
It opens Woo Ticket's public price page normally, waits for the page's own JavaScript
navigation, validates the complete table, sends an HMAC-signed update to Dodam Ticket,
and verifies the resulting public prices against the observed source.

The raw HTTP implementation received the site's JavaScript verification page from
remote servers. Ordinary Chrome navigation successfully reads all 72 products.
There is no CAPTCHA solver, stealth plugin, proxy rotation, manual verification-cookie
construction, or reuse of a person's browser profile.

## Production

- Workflow: `.github/workflows/prices.yml`
- Schedule: every five minutes (at minutes 3, 8, 13, ... 58).
- Daily health record: 00:17 Asia/Seoul, committed as `status.json` after successful verification.
- Receiver: `https://dodamticket.com/api/market-webhook`
- Secret: `DODAM_MONITOR_SECRET` in GitHub Actions secrets. Never commit its value.
- Public verification: `https://dodamticket.com/api/market-rates`

The collector job has read-only repository access. Only the separate status job receives
repository write access, and the receiver key is never supplied to that status job.
Chrome receives an environment without secret/token/password/key variables.
No customer orders, personal data, accounts, or credentials are stored in this repository.

GitHub schedules can be delayed. The receiver's existing 30-minute expiry protection is
preserved. Failure notifications depend on the repository owner's GitHub notification
settings. A verified daily status commit supplies repository activity in addition to a
health record. No paid GitHub runner, browser service, or hosting plan is enabled.

## Checks

Node.js 24 and the locked `playwright-core` package are used. The workflow uses the
standard Chrome installation already available on GitHub's Ubuntu runner.

```sh
npm ci --ignore-scripts
node tests.mjs
node browser-source.mjs --probe
node browser-run.mjs
```

`browser-run.mjs` requires the receiver key in `DODAM_MONITOR_SECRET`. It reads the
fixed source URL only; it does not accept caller-supplied price data.

`tests.mjs` checks compatible signing, signed delivery, public-price verification,
invalid-price and challenge rejection, and authentication of the retired Worker adapter.

## Retired migration attempts

`worker.mjs`, `cli.mjs`, and `wrangler.jsonc` preserve the raw HTTP adapter for reference.
The temporary Cloudflare Worker and diagnostic Pages projects have been removed.
GitHub's production workflow
collects directly with Chrome and does not call either diagnostic Cloudflare project.
The old Windows scheduled task is retained for rollback and must only be disabled after
server delivery has passed. Migration verification details are held in the local work folder.
