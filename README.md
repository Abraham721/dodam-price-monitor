# Dodam public price monitor

Small server-side collector for the publicly available Woo Ticket price table.
GitHub Actions calls a Cloudflare Pages collector every five minutes. Cloudflare reads
and validates the complete table and sends signed updates to Dodam Ticket's existing receiver.
Direct collection on GitHub-hosted runners is blocked by the source verification page;
the Cloudflare collector has been tested successfully without bypassing that page.
No customer information, accounts, or credentials are part of this repository.

The receiver key belongs in the Cloudflare secret `DODAM_MONITOR_SECRET` only.
GitHub stores a separate trigger-only secret `DODAM_TRIGGER_TOKEN`; its value also
belongs in the Cloudflare secret of the same name. The repository variable `COLLECTOR_URL`
points to the deployed collector's `/run` endpoint. No source URL or price payload
can be supplied by the caller. Unauthenticated calls and nonempty payloads are rejected.
Verification pages, incomplete tables and invalid prices are rejected without publishing.

Node.js 24 is required. No third-party runtime packages are needed.

```sh
node tests.mjs
node cli.mjs
node cli.mjs --sync
```

Scheduled GitHub jobs can be delayed. Failed runs are visible in Actions; enable failure
notifications in your account settings. Public prices retain the receiver's existing
30-minute expiry protection. At 00:17 Asia/Seoul each day, a verified status snapshot
is committed to `status.json`, providing a daily health record and repository activity.
Manual dispatch also records status. The collector job has read-only repository access;
only the daily status job receives temporary access to update this repository.

The deployed collector is `https://dodam-price-collector.pages.dev/run` in the same
Cloudflare account as the existing Dodam Ticket production website. Static clients
cannot access runtime secrets. No third-party runtime packages are required.
