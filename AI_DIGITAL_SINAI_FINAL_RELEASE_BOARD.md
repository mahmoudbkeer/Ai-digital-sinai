

## 2026-09-29 Addendum — Authentication Hardening and Latest Artifacts

### Google registration

| Control | Status | Evidence | Remaining gap |
|---|---|---|---|
| Google token validation | VERIFIED | `server/googleAuth.ts` checks configured audience, accepted Google issuer, verified email, subject, finite expiry, and future expiry; tests cover malformed, expired, and wrong-issuer claims. | Real provider flow requires configured Client IDs and a real Android/server token. |
| Provider identity binding | VERIFIED | Migration `0014_google_identity.sql` and PostgreSQL equivalent add unique nullable `users.google_subject`. Mismatched subject/email links return `409`. | Run migration 0014 in the real deployment. |
| Duplicate/concurrent registration | VERIFIED | `platform.test.ts` sends two concurrent registration requests and verifies one user, one Google subject, one owner workspace, and replay response. | PostgreSQL concurrency still needs a real PostgreSQL runtime drill. |
| Transaction/session ordering | VERIFIED | Existing user lookup/linking, provisioning, session creation, and audit are now inside one data-plane transaction; a session is created only after provisioning succeeds. | Runtime proof against PostgreSQL remains external. |
| Google activation | EXTERNAL_SETUP_REQUIRED | No Google Client IDs or real token were present in this environment; no OAuth activation is claimed. | Configure `GOOGLE_OAUTH_CLIENT_ID` and Android `GOOGLE_SERVER_CLIENT_ID`. |

### Latest CI on `6b1ecdc1d9fbd043f0944bc0cfd7fe4fe639a084`

All four associated runs were independently verified as completed with `success`:

- Quality Gate: [36557202821](https://github.com/mahmoudbkeer/Ai-digital-sinai/actions/runs/36557202821)
- Android CI: [36557202892](https://github.com/mahmoudbkeer/Ai-digital-sinai/actions/runs/36557202892)
- Full Regression Acceptance: [36557202859](https://github.com/mahmoudbkeer/Ai-digital-sinai/actions/runs/36557202859)
- iOS CI: [36557202820](https://github.com/mahmoudbkeer/Ai-digital-sinai/actions/runs/36557202820)

### Latest Android artifact

- `applicationId`: `com.aidigitalsinai`
- `versionName`: `0.1.0`
- `versionCode`: `1`
- `targetSdk`: `35`
- Debug APK SHA-256: `1b7f0e22ffbdd3e940e2385de29e2ac961429d69885247d593e72a6c7e04c208`
- Debug signature: `apksigner` verified, v2 signature, fixed debug key only
- Release APK: unsigned; SHA-256 `f496ab7370f3cc219e76514fa38df7b6f5b93e11e6548985bb6db2ae117502d5`
- ADB/runtime: **NOT_VERIFIED**; no device connected and `/dev/kvm` unavailable
- Transport: local default `http://10.0.2.2:4173` is permitted only in Debug; Release has no cleartext allowance and production must use HTTPS

Overall decision remains **BLOCKED / NOT_VERIFIED** for Production Runtime and Closed Beta because PostgreSQL restore, approved release signing, real device runtime, external provider configuration, monitoring, deployment, and rollback evidence remain unavailable.
