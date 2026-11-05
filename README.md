# Dodam public price monitor

## 2026-11-06 incident prevention

The 2026-11-03 incident began when the real source temporarily listed
`woo-168 / RCE-TEST-DO-NOT-BUY` (12:43:26 KST) and
`woo-169 / GIF-CONTROL-TEST` (12:53:54 KST), each priced at 100 won.
The ordinary server collector accepted 74 source products. After those temporary
products disappeared, the receiver compared every subsequent table against the
entire previously accepted list and rejected all updates with HTTP 422. The last
successful observation was 12:59:04 KST. The public 30-minute expiry protection
then hid prices as designed. This is evidence of temporary source rows; it does
not establish who created them or why.

`approved-products.mjs` now contains the reviewed 72-product baseline from before
the incident. Both collector and receiver validate every approved ID and its
denomination. Unknown products are quarantined before price parsing; they never
enter public prices or the required continuity baseline. Their appearance and
disappearance therefore cannot stop existing price updates. The receiver also
automatically removes legacy unapproved rows from an old payload and records
that correction in its existing audit history. Missing approved products,
invalid amounts, signature failures, source challenges, and expiry remain blocked.

The admin price page lists pending products for review. New legitimate products
require an explicit update to BOTH matching catalog files in the collector and
homepage server, source validation tests, and deployment. Do not copy a live
unreviewed source list into the approved catalog.

`health.mjs` runs after each collection, including failed collections, and the
separate `health.yml` also checks public prices every ten minutes. It detects a
12-minute freshness delay, invalid public catalogs/prices, and actionable source
or receiver validation failures. A repository issue is opened once, left quiet
while unchanged, and closed after recovery. A separate issue tracks quarantined
new products. No email, chat recipient, paid service, or personal token is added;
notification delivery follows the owner's existing GitHub notification settings.
Only health jobs receive repository-scoped `issues: write`; they never receive the
receiver signing key. Independent health checks do not clear pending catalog
reviews when no verified collector snapshot is available.

Receiver rejection codes and safe details now appear in collector logs. Public
verification compares the exact approved product count, IDs, names, denominations,
and prices. Regression tests replay temporary products appearing/disappearing,
legacy contamination, missing approved products, deduplicated health alerts, and
automatic recovery. Local recovery/deployment evidence is under
`work/recovery_20261106` and `work/prevention_20261106` (Git-ignored).

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
- Primary timing: each server run requests its successor five minutes after collection starts.
- Backup schedule: every five minutes, plus 00:17 Asia/Seoul. Schedule delivery can be delayed.
- Daily health record: the first verified run each Korean calendar day commits `status.json`.
- Receiver: `https://dodamticket.com/api/market-webhook`
- Secret: `DODAM_MONITOR_SECRET` in GitHub Actions secrets. Never commit its value.
- Public verification: `https://dodamticket.com/api/market-rates`

The collector job has read-only repository access. The separate handoff job receives
repository-scoped Actions write access through an automatically expiring job token.
It has no receiver key or personal access token. Only the separate status job receives
repository content write access, and the receiver key is never supplied to that job.
Chrome receives an environment without secret/token/password/key variables.
No customer orders, personal data, accounts, or credentials are stored in this repository.

The handoff runs even when collection fails, but stops on manual cancellation or when
the workflow is disabled. Workflow-level concurrency allows one running collector and
at most one pending successor. A repeated manual start therefore does not create extra
parallel collectors. Ordinary browser navigation is retried up to three times.

To stop collection, disable `prices.yml` and cancel its active run. To resume, enable it
and dispatch with `keep_running=true`. For a one-off check use `keep_running=false`.

GitHub schedules can be delayed. On 2026-10-21 no scheduled run arrived after cutover,
and the last manually verified prices expired. This incident is why schedule registration
alone is no longer treated as proof of unattended operation. The successor dispatch is
independent of cron delivery. GitHub runner/API outages can still interrupt collection.
The receiver's existing 30-minute expiry protection is
preserved. Failure notifications depend on the repository owner's GitHub notification
settings. A verified daily status commit supplies repository activity in addition to a
health record. No paid GitHub runner, browser service, or hosting plan is enabled.

Unattended recovery was verified on 2026-10-21 at 21:08:30 and 21:13:42 Asia/Seoul:
runs `39597139938` and `39597814553` were both started by `github-actions[bot]`.
Both collected and publicly verified all 72 products while the Windows task was disabled.
The mobile page also recovered from an initially expired response on its next polling
request without a page reload. These observations verify the handoff mechanism;
they do not imply that GitHub cron events have started arriving.

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
The old Windows scheduled task was disabled at 19:37 Asia/Seoul on 2026-10-21 after
the first verified delivery. A second server delivery passed at 19:38 with the PC task
disabled. Those two manual deliveries did not verify automatic timing. The task definition is retained locally for rollback. Migration verification
details are held in the local work folder.
