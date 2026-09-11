# Deployment Environment Contract

This contract describes the environment variables required by the existing application for staging preparation. It contains names and classification only; it does not contain credentials, tokens, passwords, URLs, or placeholder values.

## Required for server start

| Variable | Classification | Purpose |
|---|---|---|
| `DATABASE_URL` | `REQUIRED_FOR_START` in `production`/`staging` | PostgreSQL connection string. SQLite is not a staging substitute. |
| `COMMAND_CONTEXT_SECRET` | `REQUIRED_FOR_START` in `production` | Signs and verifies sensitive command context. |
| `PAYMENT_WEBHOOK_SECRET` | `REQUIRED_FOR_START` in `production` | Verifies payment webhook signatures. |
| `CORS_ORIGINS` | `REQUIRED_FOR_START` in `production` | Explicit comma-separated browser origin allowlist. |
| `NODE_ENV` | `REQUIRED_FOR_START` by deployment contract | Must identify the intended runtime, normally `staging` or `production`. |

For staging, the application must use a real PostgreSQL `DATABASE_URL` and must not use `ALLOW_SQLITE_PRODUCTION_TEST`.

## Optional application configuration

| Variable family | Variables | Classification | Purpose |
|---|---|---|---|
| Runtime | `PORT`, `API_PORT`, `BASE_URL` | `OPTIONAL` | Traditional runtime port and externally supplied base URL. |
| PostgreSQL pool | `PG_SSL`, `PG_POOL_MIN`, `PG_POOL_MAX`, `PG_IDLE_TIMEOUT_MS`, `PG_CONNECTION_TIMEOUT_MS`, `PG_STATEMENT_TIMEOUT_MS` | `OPTIONAL` | PostgreSQL TLS and pool tuning. |
| Redis worker | `REDIS_URL`, `REDIS_TIMEOUT_MS`, `WORKER_QUEUE`, `WORKER_MAX_ATTEMPTS`, `WORKER_POLL_MS`, `WORKER_ONCE` | `EXTERNAL_SETUP_REQUIRED` | Redis-backed queue and separate worker runtime. |
| Google OAuth | `GOOGLE_OAUTH_CLIENT_ID` | `EXTERNAL_SETUP_REQUIRED` | Google identity configuration. |
| Payment provider | `PAYMENT_PROVIDER_API_URL`, `PAYMENT_PROVIDER_API_KEY`, `PAYMENT_PROVIDER_TIMEOUT_MS`, `KASHIER_API_URL`, `KASHIER_API_KEY`, `KASHIER_MID`, `KASHIER_MODE`, `KASHIER_PAYMENT_SESSIONS_PATH` | `EXTERNAL_SETUP_REQUIRED` | Provider API and payment-session configuration. |
| AI provider | `AI_PROVIDER_API_URL`, `AI_PROVIDER_API_KEY`, `AI_PROVIDER_NAME`, `AI_PROVIDER_TIMEOUT_MS`, `EMBEDDING_PROVIDER_API_URL`, `EMBEDDING_PROVIDER_API_KEY` | `EXTERNAL_SETUP_REQUIRED` | External AI and embedding runtime. |
| Notifications | `NOTIFICATION_PROVIDER_API_URL`, `NOTIFICATION_PROVIDER_API_KEY`, `NOTIFICATION_PROVIDER_TIMEOUT_MS`, `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`, `FCM_PROJECT_ID`, `FCM_SERVICE_ACCOUNT_JSON`, `EMAIL_PROVIDER_API_KEY` | `EXTERNAL_SETUP_REQUIRED` | Email and push delivery providers. |
| Object storage | `OBJECT_STORAGE_ENDPOINT`, `OBJECT_STORAGE_BUCKET`, `OBJECT_STORAGE_ACCESS_KEY`, `OBJECT_STORAGE_SECRET_KEY`, `OBJECT_STORAGE_MAX_BYTES` | `EXTERNAL_SETUP_REQUIRED` | Signed object upload/storage provider. |
| Secret management | `SECRETS_MANAGER_URL` | `EXTERNAL_SETUP_REQUIRED` | External secrets manager integration. |
| Backup/restore | `BACKUP_DIR`, `BACKUP_ENCRYPTION_KEY`, `BACKUP_RETENTION`, `ALLOW_LEGACY_BACKUP` | `EXTERNAL_SETUP_REQUIRED` for operations | Backup and restore operations; not needed for basic HTTP startup. |

## Explicitly prohibited deployment values

`ALLOW_SQLITE_PRODUCTION_TEST=1` is test-only and must not be used for staging. No credential or secret may be committed to Git. The presence of a variable name in this document does not mean that the corresponding external integration is connected or runtime verified.
