# PostgreSQL CI Verification Gap Closure

## Scope

This artifact records the focused PostgreSQL CI gap closure for commit `test(ci): close PostgreSQL verification gap`. The change uses the existing PostgreSQL adapter, migration runner, API smoke test, schema, ledger, invoice, tenant, and authorization boundaries. It does not replace the existing architecture or modify unrelated verified domains.

## Executable evidence added

The Quality Gate now runs two explicit PostgreSQL stages against the service container `postgres:16`:

1. `pnpm test:staging` runs `scripts/postgres-staging-smoke.mjs` with a PostgreSQL-only `DATABASE_URL`, `DATABASE_ENGINE=postgresql`, and `POSTGRESQL_TEST_MODE=true`. It checks connectivity and reports the actual server version, runs the existing migration runner, reruns it to prove idempotency, requires the exact schema migration versions `1..12`, checks required tables, foreign keys, tenant composite constraints, existing ledger balance, and a same-connection transaction rollback probe.
2. `pnpm test:staging:api` runs `scripts/postgres-critical-smoke.mjs` with the same PostgreSQL-only markers. It checks two tenants, tenant-header tampering, cross-tenant AI search isolation, order creation, the existing payment-intent replay idempotency contract, invoice ownership, aggregate debit/credit balance, absence of unbalanced journals, and the honest `REQUIRES_SETUP` payment-provider boundary.

The workflow still retains all existing quality stages, including dependency audit, secret scan, type check, unit tests, contract tests, production build, E2E, smoke, load, security, and adversarial tests.

## Local verification before CI

- `pnpm check`: PASS.
- `pnpm test`: PASS — 15 files, 77 tests.
- `pnpm build`: PASS.
- Edited script syntax checks: PASS.
- `git diff --check`: PASS.
- Local PostgreSQL staging execution: BLOCKED because no PostgreSQL service is available in the Sandbox. This is not treated as a pass. The CI service container is the required runtime evidence.

## CI evidence to record after push

| Evidence | Result |
|---|---|
| Focused commit SHA | Recorded after commit creation |
| Quality Gate run | Recorded after push |
| PostgreSQL image/version | `postgres:16`; script also emits `SHOW server_version` |
| Database target | `DATABASE_ENGINE=postgresql`, `POSTGRESQL_TEST_MODE=true`, PostgreSQL URL; SQLite is rejected |
| Migration result | Exact versions `1..12`, fresh run plus idempotent rerun |
| Tenant isolation | Header tampering denied; cross-tenant AI search empty; invoice/ledger queries tenant-scoped |
| RBAC/ABAC representative result | Existing authorization boundary exercised through API; no V7 RBAC suite duplicated |
| Financial integrity | API-created order/invoice/ledger path; aggregate debit equals credit; zero unbalanced journals |
| Idempotency | Replayed payment intent with the same idempotency key returns the original payment-intent ID and `replay: true` |
| Rollback | Same-connection PostgreSQL transaction rollback probe passes |
| Production build | Existing Quality Gate build stage retained |
| Full Quality Gate | Must pass after push before final status is called VERIFIED |
| External blockers | Real payment gateway credentials are not required for internal financial verification; provider activation remains external setup |

## Status rule

This artifact is not evidence of a successful PostgreSQL runtime until the post-push Quality Gate emits the new stage results. The final status must be based on the actual CI run URL and logs, not this document alone.
