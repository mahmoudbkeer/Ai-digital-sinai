# خريطة التنفيذ الحالية — AI DIGITAL SINAI V5.1

**الـbaseline:** `7e3fbe9c559fd4f29324d52d1e4afdbe91b1ba57` على `main`
**آخر تحديث:** 31 أغسطس 2026

| المجال | الحالة الموثقة | الدليل |
|---|---|---|
| Identity/Tenant | PARTIALLY_IMPLEMENTED | `server/platform.ts`، auth tests، scoped queries |
| Async data plane/PostgreSQL | PARTIALLY_IMPLEMENTED | `server/dataPlane.ts`، `server/postgres.ts`، migrations |
| Business OS/CRM/Procurement | PARTIALLY_IMPLEMENTED | routes والجداول واختبارات `businessOs` |
| Commerce/POS/Inventory/Finance | PARTIALLY_IMPLEMENTED | order/payment/invoice/ledger/movement transactions |
| Subscription/Entitlements | IMPLEMENTED كـserver-side foundation | plans، lifecycle، entitlement gates |
| Marketplace/Logistics | PARTIALLY_IMPLEMENTED | products/services/offers/reviews/deliveries/proof |
| Payments | PARTIALLY_IMPLEMENTED | provider contract، HMAC webhook، replay protection؛ لا sandbox |
| AI Gateway/RAG | FOUNDATION | policy/usage وlexical tenant-scoped fallback؛ لا embeddings/vector provider |
| Advisor/Recommendations/Forecast | IMPLEMENTED كـdeterministic foundations | grounded advisor، ranking/event log، fallback/confidence |
| Agents/Advertising/Analytics | FOUNDATION/PARTIALLY_IMPLEMENTED | policy، lifecycle، KPI sources |
| Notifications | PARTIALLY_IMPLEMENTED | provider boundary، retry، status |
| Admin | PARTIALLY_IMPLEMENTED | users/tenants/audit/flags/AI usage APIs |
| Redis/Queues | REQUIRES_SETUP | configuration boundary فقط |
| Object Storage | REQUIRES_SETUP | storage reference boundary فقط |
| Security/Observability | PARTIALLY_IMPLEMENTED | headers، CORS/CSP، request ID، readiness، security smoke |
| Backup/DR | PARTIALLY_IMPLEMENTED | `scripts/backup.mjs` و`restore.mjs`؛ staging drill مطلوب |
| Android | REQUIRES_SETUP | لا native project/keystore |

## Verification commands

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
pnpm test:e2e
pnpm test:smoke
LOAD_CONCURRENCY=10 LOAD_REQUESTS=10 pnpm test:load
pnpm test:security
```

كل الأوامر أعلاه نجحت محليًا بعد الإصلاح. هذا لا يساوي PostgreSQL staging أو production readiness؛ تلك تتطلب موارد خارجية حقيقية.

## Rules

- `IMPLEMENTED` تعني أن wiring والاختبار المحلي موجودان، لا أنها شهادة تشغيل إنتاجي خارجي.
- `REQUIRES_SETUP` تعني أن الكود/العقد موجود لكن credentials أو service provisioning ناقص.
- `BLOCKED_EXTERNAL_DEPENDENCY` تعني أن الدليل لا يمكن تحصيله من هذه البيئة دون خدمة أو تنسيق خارجي.
- لا تُستخدم `COMPLETE` أو `PRODUCTION READY` دون evidence مستقل قابل لإعادة الإنتاج.

## References

[1]: https://github.com/mahmoudbkeer/Ai-digital-sinai "AI DIGITAL SINAI GitHub repository"

## V5.1.1 hardening update

| المجال | الحالة | الدليل الجديد |
|---|---|---|
| Redis abstraction | PARTIALLY_IMPLEMENTED | `server/integrations.ts` يدعم Redis RESP فعليًا مع TTL وAUTH/SELECT؛ لا يوجد managed Redis في البيئة |
| Backup integrity | IMPLEMENTED محليًا | `scripts/backup.mjs` ينشئ SHA-256 manifest و`scripts/restore.mjs` يتحقق منه قبل الاستعادة |
| Restore drill | PARTIALLY_IMPLEMENTED | SQLite checksum/restore PASS محليًا؛ PostgreSQL offsite drill ما زال REQUIRES_SETUP |

لا يغيّر هذا الحكم الخارجي: لا تزال PostgreSQL staging وRedis المدار ومزودات الدفع/الإشعارات/AI وAndroid وpentest متطلبات خارجية قبل اعتماد الإنتاج.

## V5.2 staging gate

| المجال | الحالة | الدليل |
|---|---|---|
| PostgreSQL staging verification | IMPLEMENTED كـgate قابل للتشغيل | `scripts/postgres-staging-smoke.mjs` و`.github/workflows/staging.yml` |
| PostgreSQL staging evidence | BLOCKED_EXTERNAL_DEPENDENCY | لا توجد `STAGING_DATABASE_URL` متاحة في البيئة الحالية |

عند توفير secret حقيقي، يفشل gate عند migration أو foreign key أو tenant composite constraint أو ledger imbalance أو rollback failure، ولا يقبل SQLite كبديل.

## V5.3 verified staging execution

| المجال | الحالة | الدليل |
|---|---|---|
| PostgreSQL local staging | PASS | PostgreSQL 16، migrations 1–3، 184 FKs، 52 composite constraints |
| Critical API paths on PostgreSQL | PASS | `scripts/postgres-critical-smoke.mjs` |
| Tenant isolation adversarial smoke | PASS | tampered tenant header 403، cross-tenant AI search empty |
| Financial integrity | PASS | all persisted journals balance، rollback probe PASS |
| PostgreSQL timestamp compatibility | IMPLEMENTED | epoch millisecond columns corrected to BIGINT |

Production/offsite PostgreSQL evidence remains separate from this local staging evidence.
