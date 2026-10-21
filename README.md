# Dodam public price monitor

Small server-side collector for the publicly available Woo Ticket price table.
Migration is incomplete. The existing Windows collector remains enabled.
A Cloudflare Pages collector can read and validate the table when invoked from the
current Korean connection, then send signed updates to Dodam Ticket's receiver.
However, both direct collection on GitHub-hosted runners and a GitHub invocation of
the Cloudflare collector receive the source's verification page. GitHub scheduling
has therefore been removed. Manual runs remain available for diagnostics only.
No verification page is bypassed and no rejected prices are published.

`wrangler.jsonc` prepares a native Cloudflare Worker with a five-minute Cron Trigger.
This configuration is not deployed. The dashboard-created `dodam-price-monitor`
Worker still contains Hello World and has no secrets or scheduled trigger.
Native scheduled source access must pass before disabling the Windows task.
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

Public prices retain the receiver's existing 30-minute expiry protection.
Successful manual diagnostics record a verified snapshot in `status.json`.
The collector job has read-only repository access; only the status job receives
temporary access to update this repository.

The deployed collector is `https://dodam-price-collector.pages.dev/run` in the same
Cloudflare account as the existing Dodam Ticket production website. Static clients
cannot access runtime secrets. No third-party runtime packages are required.
