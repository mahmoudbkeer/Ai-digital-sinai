# P0-3 — External Services Readiness

This document records the current implementation boundary. A configured environment variable is not evidence that a provider is reachable or approved for production.

## Service classification

| Service | Classification | Evidence and boundary |
|---|---|---|
| PostgreSQL | IMPLEMENTED_AND_TESTED | PostgreSQL data plane, migrations, tenant checks, and financial checks passed in the official Quality Gate. Production still requires a managed database URL and TLS policy. |
| Redis | IMPLEMENTED_BUT_REQUIRES_SETUP | RESP client, ping, rate-limit primitives, queue worker, retry, and DLQ are implemented. No production Redis connection was exercised in this task. Missing or unreachable Redis remains `REQUIRES_SETUP` in production. |
| Object Storage | PARTIALLY_IMPLEMENTED | Tenant-scoped key validation and signed URL generation exist. The repository does not upload/download objects or verify provider responses; configure and verify the chosen S3-compatible service externally. |
| FCM Push | IMPLEMENTED_BUT_REQUIRES_SETUP | FCM OAuth JWT and HTTP v1 send path exist. Tests use mocked HTTP responses only. Configure `FCM_PROJECT_ID` and `FCM_SERVICE_ACCOUNT_JSON` securely. |
| Email / SendGrid | IMPLEMENTED_BUT_REQUIRES_SETUP | SendGrid v3 send contract and HTTP 202 handling are implemented. Tests are mocked; configure `SENDGRID_API_KEY` and `SENDGRID_FROM_EMAIL`. |
| SMS | MISSING | The channel is accepted by the domain model, but no SMS provider adapter is wired. It correctly remains `REQUIRES_SETUP`; no provider is invented here. |
| AI completion | IMPLEMENTED_BUT_REQUIRES_SETUP | Generic JSON completion adapter validates endpoint, response status, output, and limits. Tests are mocked; configure `AI_PROVIDER_API_URL`, `AI_PROVIDER_API_KEY`, and provider contract. |
| Embeddings | IMPLEMENTED_BUT_REQUIRES_SETUP | The adapter now calls the configured endpoint and only returns `READY` when it receives one valid reference per text. No live provider was contacted. |
| Secrets Manager | MISSING | No client or read path is wired. A URL alone no longer reports this integration as configured. Keep secrets in the deployment platform until a manager client is implemented. |
| Payment provider | IMPLEMENTED_BUT_REQUIRES_SETUP | Paymob/generic adapter boundaries and Kashier create, webhook, refund, idempotency, and ledger paths exist. Tests are mocked; no live payment or refund was executed. |

## Secure external setup required

- `DATABASE_URL`, `PG_SSL=require`, pool limits, and managed PostgreSQL network policy.
- `REDIS_URL` using `rediss://` where supported, plus worker deployment for `scripts/queue-worker.mjs`.
- Object storage endpoint, bucket, access key, secret key, lifecycle/retention, and private bucket policy.
- FCM project/service account, SendGrid sender verification/API key, and an SMS provider decision before enabling SMS.
- AI completion and embedding endpoint contracts, API keys, tenant-data policy, quotas, and timeout limits.
- `COMMAND_CONTEXT_SECRET`, `PAYMENT_WEBHOOK_SECRET`, and provider secrets through the deployment secret store.
- Kashier test/live mode, MID, API key, secret key, webhook configuration, and provider-side refund permission.

No secret values belong in this repository or in chat. No live provider transaction was performed during P0-3.
