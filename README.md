# Dodam public price monitor

Small server-side collector for the publicly available Woo Ticket price table.
It validates the complete table and sends signed updates to Dodam Ticket's existing receiver.
No customer information, accounts, or credentials are part of this repository.

The receiver key belongs in the GitHub Actions secret `DODAM_MONITOR_SECRET` only.
The workflow currently runs source-only checks on manual dispatch during migration.
Verification pages, incomplete tables and invalid prices are rejected without publishing.

Node.js 24 is required. No third-party runtime packages are needed.

```sh
node monitor.mjs
node monitor.mjs --sync
```

Scheduled GitHub jobs can be delayed. Failed runs are visible in Actions; keep failure
notifications enabled. Public prices retain the receiver's existing expiry protection.
