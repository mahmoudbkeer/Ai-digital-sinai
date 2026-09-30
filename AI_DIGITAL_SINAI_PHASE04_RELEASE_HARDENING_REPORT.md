# AI Digital Sinai — Phase 04 Release Hardening Report

**Code baseline:** `a149e9542b1f4480138b77bf0348d3edc7604904`
**Branch:** `main`  
**Assessment date:** 25 September 2026  
**Decision rule:** This report uses only `VERIFIED`, `OPERATIONAL`, `PARTIAL`, `BLOCKED`, `NOT_VERIFIED`, `EXTERNAL_SETUP_REQUIRED`, and `NOT_IMPLEMENTED`.

## Executive decision

Phase 04 is **BLOCKED at stage A — PostgreSQL Backup / Restore Drill**. The repository contains working backup, restore, and local encrypted SQLite drill scripts. The local drill passed and proved checksum verification plus encrypted restore. It does not prove production PostgreSQL recovery. No PostgreSQL client tools, `DATABASE_URL`, production backup, or separate PostgreSQL restore target were available in this execution context. The project must not be labelled Production Runtime or Closed Beta Ready until that external dependency is supplied and the drill is executed.

No closed module was redesigned. No SQLite fallback was introduced into production behavior. The only implementation commit since the previous baseline is the operational Profit and Reconciliation UI integration already verified by CI.

## A — Backup and Restore

| Check | Status | Evidence | Remaining gap |
|---|---|---|---|
| Backup script inspection | VERIFIED | `scripts/backup.mjs` creates PostgreSQL custom-format dumps or SQLite file backups, optional AES-256-GCM encryption, SHA-256 manifest, and retention cleanup. | None in the inspected script contract. |
| Restore script inspection | VERIFIED | `scripts/restore.mjs` verifies the manifest before decrypting; PostgreSQL uses `pg_restore`; SQLite creates a safety copy before replacement. | Runtime PostgreSQL proof is still required. |
| Supported environment variables | VERIFIED | The scripts read `DATABASE_URL` for PostgreSQL selection/connection, `BACKUP_DIR`, `BACKUP_RETENTION`, `BACKUP_ENCRYPTION_KEY`, `SQLITE_PATH`, and optional `ALLOW_LEGACY_BACKUP`; they do not read `SOURCE_DATABASE_URL` or `TARGET_DATABASE_URL`. | Source/target separation must be orchestrated externally and never by placing secrets in Git or chat. |
| Local encrypted Restore Drill | VERIFIED | `node scripts/backup-restore-drill.mjs` returned `PASS`; original and restored SHA-256 were both `383440773b46ae14c34a9bada6f930c9c95281256e0c531e8d426b7e3ba55787`. | This is SQLite, not a production PostgreSQL restore. |
| PostgreSQL backup creation | NOT_VERIFIED | No `pg_dump` executable and no `DATABASE_URL` were available. | Provide a real PostgreSQL source and backup destination. |
| PostgreSQL restore to separate database | NOT_VERIFIED | No `psql`, `pg_restore`, PostgreSQL server, production dump, or separate target was available. | Execute the real restore and verify schema, data, constraints, indexes, and financial totals. |
| Functional and financial post-restore comparison | NOT_VERIFIED | No PostgreSQL source/target pair was available. | Compare journals, entries, debit, credit, invoices, expenses, inventory, orders, returns, and audit counts. |

**Stage A result: BLOCKED / NOT_VERIFIED for PostgreSQL.** The SQLite result must not be promoted to PostgreSQL or Production evidence.

## B — PostgreSQL Production Readiness

| Area | Status | Evidence | Remaining gap |
|---|---|---|---|
| PostgreSQL migration ordering and lock | VERIFIED | PostgreSQL migration runner and advisory transaction lock are covered by the existing Quality Gate PostgreSQL verification. | Production runtime execution remains unverified. |
| Pool configuration and timeouts | VERIFIED | `server/postgres.ts` and the database configuration define pool and timeout controls; CI PostgreSQL checks passed. | Validate values against production workload and environment. |
| Production database engine guard | VERIFIED | Production code rejects silent SQLite fallback when a production `DATABASE_URL` is used; `server/dataPlane.ts` and readiness checks enforce the contract. | Confirm in a real deployed environment. |
| PostgreSQL staging/critical smoke | VERIFIED | Quality Gate run `35969553300` passed PostgreSQL migration, tenant, and financial integrity checks after rerun. | Production credentials and runtime evidence are absent. |
| Real production connection and concurrency profile | NOT_VERIFIED | No production `DATABASE_URL` or PostgreSQL runtime was supplied. | Run against a separate staging/production-equivalent PostgreSQL instance. |

**Stage B result: PARTIAL.** CI and code contracts are verified; Production Runtime is not verified.

## C — Observability

| Area | Status | Evidence | Remaining gap |
|---|---|---|---|
| Health and readiness routes | VERIFIED | Existing `/api/health` and `/api/readiness` contracts are covered by application and CI checks. | Public deployed endpoint evidence is absent. |
| Request IDs and structured errors | VERIFIED | Existing server logging and request ID paths are covered by tests and code inspection. | Confirm deployed log aggregation and retention. |
| Audit events | VERIFIED | Phase 02 adversarial suite and Quality Gate passed sensitive mutation/audit checks. | Production audit retention policy is not supplied. |
| External uptime, error monitoring, alerting | NOT_VERIFIED | No external monitoring integration or runtime dashboard evidence exists in the repository. | Configure and prove the selected monitoring services. |

**Stage C result: PARTIAL.** Internal observability is verified; external monitoring is not verified.

## D — Android Final Acceptance

| Check | Status | Evidence | Remaining gap |
|---|---|---|---|
| Native source and Gradle project | VERIFIED | Existing `android/` Kotlin/Compose project; no Capacitor, React Native, Expo, or Flutter introduced. | None for source scope. |
| Unit tests and Debug/Release builds | VERIFIED | Local `./gradlew :app:testDebugUnitTest :app:assembleDebug :app:assembleRelease --no-daemon` passed after installing Android SDK 35 and full JDK 21. | None for local build scope. |
| Debug APK artifact | VERIFIED | `app-debug.apk`, 12,640,669 bytes, SHA-256 `fec4f4e5b36d1317cb6fe22ab76bd682edf7e5b5b300915d0550fa05c89ef0a8`; `apksigner verify` passed with APK v2 signature. | Debug signing is not a distribution/release key. |
| Release signing mechanism | VERIFIED | `android/app/build.gradle.kts` now supports an optional `releaseEnv` signing config using `ANDROID_RELEASE_KEYSTORE_PATH`, `ANDROID_RELEASE_STORE_PASSWORD`, `ANDROID_RELEASE_KEY_ALIAS`, and `ANDROID_RELEASE_KEY_PASSWORD`; no values are logged or committed. | An approved production keystore and secret injection are still required. |
| Release APK artifact | PARTIAL | `app-release-unsigned.apk`, 9,058,148 bytes, SHA-256 `6cc24a9da0a2d2dc48e8685eb5669cecea521651ea7e10776dfe25b6f7b76ba0`; build passed with signing variables absent and `apksigner` correctly rejected it. | No approved release signing key; APK is not installable as a signed release. |
| Physical/emulator install and launch | NOT_VERIFIED | AVD `sinai-api35` was created, but launch failed because `/dev/kvm` is unavailable; no device was connected. | Run install/launch on a device or emulator with hardware acceleration. |

**Stage D result: PARTIAL.** Native source, local tests, and build artifacts are verified; release signing and device runtime are not verified.

## E — iOS Final Acceptance

| Check | Status | Evidence | Remaining gap |
|---|---|---|---|
| Native Swift/SwiftUI source | VERIFIED | Existing `ios/` Swift Package; no WebView, Capacitor, React Native, Expo, or Flutter introduced. | None for source scope. |
| XCTest and package build | VERIFIED | iOS CI run `35964524113` passed XCTest and package build. | None for CI scope. |
| Local Swift package test | NOT_VERIFIED | `swift` is unavailable in the current Linux sandbox. | Execute on macOS/Xcode or a Swift-enabled runner. |
| Device/simulator API runtime | NOT_VERIFIED | No Xcode, simulator, or Apple device is available in this environment. | Execute simulator/device installation and critical-flow acceptance on macOS/Xcode. |

**Stage E result: PARTIAL.** CI is verified; device runtime remains unverified.

## F — Tablet Acceptance

| Surface | Status | Evidence | Remaining gap |
|---|---|---|---|
| Web tablet responsive behavior | VERIFIED | Local Playwright run passed 29 tests, including 768x1024, 800x1280, 1024x1366, 1280x800, and 1024x768 landscape coverage. | Add captured visual evidence if release board requires screenshots. |
| Android tablet | NOT_VERIFIED | AVD creation succeeded but runtime could not start without `/dev/kvm`; no tablet runtime was available. | Run tablet emulator/device acceptance with hardware acceleration. |
| iPad | NOT_VERIFIED | iOS CI verifies package/XCTest, not iPad runtime/layout. | Run iPad simulator/device acceptance. |

**Stage F result: PARTIAL.** Web tablet behavior is verified; native tablet runtime is not verified.

## G — Railway Deployment

**Status: EXTERNAL_SETUP_REQUIRED / NOT_VERIFIED.** No Railway project URL, deployment credentials, production `DATABASE_URL`, Redis URL, worker configuration, payment credentials, storage, FCM, SendGrid, or AI provider configuration was available. A URL alone would not be sufficient evidence; startup, migration, health, readiness, database, Redis, worker, and logs must be tested after credentials are supplied.

## H — Production Runtime Acceptance

**Status: NOT_VERIFIED.** It cannot begin before Stage G is verified. No external production runtime was available for identity, tenant isolation, Business OS, checkout, security, financial, or error acceptance.

## I — Rollback Drill

**Status: NOT_VERIFIED.** No deployed current/previous runtime pair and no production-equivalent rollback target were available. Existing scripts or Git history do not constitute a rollback drill.

## J — Closed Beta Readiness

**Status: BLOCKED.** Closed Beta readiness depends on the unresolved PostgreSQL restore, production runtime, external monitoring, native device/tablet runtime, and rollback evidence.

## K — Final Release Board

The release board is provided in `AI_DIGITAL_SINAI_FINAL_RELEASE_BOARD.md`. Its overall decision is **NOT_VERIFIED / BLOCKED**, not Production Ready.

## Git and CI evidence

| Item | Result |
|---|---|
| `HEAD` | Documentation commits after code baseline; exact final SHA is recorded in the delivery verification. |
| `origin/main` | Same SHA as HEAD |
| Branch | `main` |
| Working tree | No code changes; two pre-existing local artifacts remain outside the commit: `artifacts/marketplace-assistant-search.png` and `artifacts/business-onboarding-pending.png`. |
| `git diff --check` | Passed |
| Local typecheck/build | Passed |
| Local Vitest | 20 files / 88 tests passed |
| Local Playwright | 29 tests passed |
| Quality Gate | Run `35969553300`, success after safe rerun of transient Chromium `session closed` failure: [GitHub Actions][1] |
| Full Regression Acceptance | Run `35969556323`, success: [GitHub Actions][2] |

## Required external inputs to continue

The next execution requires a real PostgreSQL source and separate restore target or staging-equivalent instance, a production-equivalent `DATABASE_URL`, permission to create a backup and restore database, and—before Stage G—Railway project access plus production secrets and provider configuration. These are external setup requirements, not reasons to fabricate a pass or alter closed modules.

## References

[1]: https://github.com/mahmoudbkeer/Ai-digital-sinai/actions/runs/35969553300 "AI Digital Sinai Quality Gate"
[2]: https://github.com/mahmoudbkeer/Ai-digital-sinai/actions/runs/35969556323 "AI Digital Sinai Full Regression Acceptance"


## 2026-09-29 Addendum — Google Registration and Latest Android Evidence

| Check | Status | Evidence | Remaining gap |
|---|---|---|---|
| CI on commit `6b1ecdc1d9fbd043f0944bc0cfd7fe4fe639a084` | VERIFIED | Quality Gate run `36557202821`, Android CI `36557202892`, Full Regression Acceptance `36557202859`, and iOS CI `36557202820` all completed with `success`. | A new commit containing the security migration will require a new CI run. |
| Google token claims | VERIFIED | `server/googleAuth.ts` checks configured audience, Google issuer, verified email, subject, finite expiry, and expiry in the future; tokeninfo performs Google's server-side token/signature validation. Tests cover malformed, expired, and wrong-issuer claims. | Real provider flow remains external-setup dependent until Client IDs are configured and exercised on Android and server. |
| Google identity binding | VERIFIED | New migration `0014_google_identity.sql` / PostgreSQL equivalent adds a unique nullable `users.google_subject`; registration binds and rejects subject/email mismatches. | Existing production data must run migration 0014 before deployment. |
| Google registration atomicity | VERIFIED | Endpoint now performs lookup, subject linking, tenant/business/branch/ledger provisioning, session creation, and audit within `withDataPlaneTransaction`; concurrent integration test produced one `201` and one `200` and one user. | PostgreSQL concurrency still requires a real PostgreSQL runtime drill. |
| Google setup state | EXTERNAL_SETUP_REQUIRED | No Client IDs were present in this environment; no real Google token or external provider flow was claimed. | Configure `GOOGLE_OAUTH_CLIENT_ID` and Android `GOOGLE_SERVER_CLIENT_ID` through secret/build configuration. |
| Android latest build | VERIFIED | `testDebugUnitTest`, `assembleDebug`, and `assembleRelease` passed with JDK 21 / SDK 35. `applicationId=com.aidigitalsinai`, `versionName=0.1.0`, `versionCode=1`, `targetSdk=35`. | Release signing key absent. |
| Android Debug APK | VERIFIED | 12,782,962 bytes; SHA-256 `1b7f0e22ffbdd3e940e2385de29e2ac961429d69885247d593e72a6c7e04c208`; `apksigner verify` passed with v2; debug key only. | Physical/emulator install and runtime not verified; no ADB device and `/dev/kvm` unavailable. |
| Android Release APK | PARTIAL | 9,058,148 bytes; SHA-256 `f496ab7370f3cc219e76514fa38df7b6f5b93e11e6548985bb6db2ae117502d5`; unsigned artifact only. | Approved release keystore and secret injection required. |
| Android API transport | VERIFIED | Default local emulator URL is `http://10.0.2.2:4173`; `ANDROID_API_BASE_URL` overrides it. Cleartext is allowed only through `src/debug/AndroidManifest.xml`; merged Release manifest contains no cleartext allowance. | Production must provide an HTTPS URL. |
| Android install/launch | NOT_VERIFIED | `adb devices` returned no connected devices. | Test on a physical device or hardware-accelerated emulator. |

The overall Phase 04 and Production/Closed Beta decisions remain unchanged: **BLOCKED / NOT_VERIFIED** for PostgreSQL restore, external production runtime, device runtime, monitoring, and rollback.
