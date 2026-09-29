# AI Digital Sinai — Social Sign-In Setup

## Google

Android and Web now support a real Google identity flow when the provider is configured:

- Android uses Google Credential Manager and sends a verified ID token to `/api/platform/auth/google` or `/api/platform/auth/google/register`.
- Web uses Google Identity Services and `/api/platform/auth/google`.
- The backend verifies issuer, audience, email verification, subject, and expiry through Google's tokeninfo endpoint.
- `/api/platform/auth/google/register` provisions a tenant, owner membership, business, branch, ledger accounts, session, and audit event on first verified registration. Existing users receive a session without duplicate provisioning.

Required server configuration:

```text
GOOGLE_OAUTH_CLIENT_ID=<web/server client id>
```

Required Android build value:

```text
GOOGLE_SERVER_CLIENT_ID=<server/web client id>
```

For local Android development, the default API URL is `http://10.0.2.2:4173`. Override it without changing source code:

```text
ANDROID_API_BASE_URL=https://your-authorized-api.example
```

Debug permits cleartext only for the local emulator URL. Release does not inherit that debug allowance and must use HTTPS.

## Facebook

Facebook one-tap is **not enabled yet**. The Android button deliberately reports setup-required rather than pretending that a Facebook identity was verified. Enabling it requires:

1. A Meta application and approved Facebook Login configuration.
2. Android package/signing SHA-256 registration in Meta Developer Console.
3. A native Facebook SDK dependency and app configuration.
4. A backend `/auth/facebook` endpoint that verifies the provider token server-side and provisions or links an account using the same tenant/audit rules as Google.
5. Secret configuration through the deployment secret manager only.

Do not place Meta secrets, client secrets, or signing keys in Git, APK resources, or chat messages.
