# V6_STATUS — Re-audit before V7

| Area | Status at V7 start | Regression? | V7 action |
|---|---|---|---|
| PostgreSQL | VERIFIED | No | Regression suite passed on PostgreSQL staging |
| Identity/MFA | VERIFIED | Yes, MFA failure counter reset before OTP validation | Fixed and regression-tested |
| Tenant isolation | VERIFIED | No | Adversarial IDOR smoke passed |
| Finance/Ledger | VERIFIED | No | PostgreSQL balance and rollback passed |
| Webhook | VERIFIED | No | Adversarial signature/replay smoke passed |
| Security | FAILED due audit result | Improved | Production audit, secret scan, adversarial gate added |
| Object Storage | REQUIRES_SETUP | No | Existing signed URL contract retained |
| External providers | REQUIRES_SETUP | No | Not falsely activated |

Verified domains were not rebuilt; only the proven MFA regression was modified.
