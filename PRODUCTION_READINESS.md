# AI DIGITAL SINAI — Production Readiness

## الحكم الحالي

> **الحالة: Business Core Implemented / Production Verification Pending.**

تم تنفيذ التحويل البرمجي إلى data plane غير متزامنة مشتركة، وأصبحت مسارات الأعمال قادرة على استخدام PostgreSQL عند ضبط `DATABASE_URL`. لكن لا يجوز اعتبار النظام production-ready بالكامل قبل اختبار قاعدة staging الفعلية، وتثبيت الاعتماديات الخارجية، وتنفيذ backup/restore drill ومراجعة أمنية مستقلة.

## ما تم إنجازه في المستودع

| المحور                           | الحالة       | الدليل                                                                                   |
| -------------------------------- | ------------ | ---------------------------------------------------------------------------------------- |
| PostgreSQL business data plane   | منفذ برمجياً | `server/dataPlane.ts` و`server/postgres.ts`                                              |
| Startup migration gate           | منفذ         | `ensureDataPlaneReady()` في `server/index.ts`                                            |
| Versioned migrations             | منفذ         | `0001_core` و`0002_business_os` في SQLite وPostgreSQL                                    |
| Pooling and parameter binding    | منفذ         | `AsyncDataPlane` و`pg.Pool`                                                              |
| Tenant isolation/RBAC            | منفذ جزئياً  | `authenticate` و`assertScope` والقيود المركبة                                            |
| Subscription entitlements        | منفذ         | `assertEntitlement` و`/subscription/entitlements`                                        |
| Business OS core                 | منفذ أساسي   | employees، CRM، suppliers، purchases، expenses، POS، offers، reviews، favorites، reports |
| Financial idempotency            | منفذ أساسي   | purchase idempotency وjournals sale/purchase/expense/POS                                 |
| Automated unit/integration tests | ناجح محلياً  | `pnpm check` و`pnpm test`: 29 اختباراً                                                   |

## ما يجب تنفيذه قبل الإنتاج

### 1. PostgreSQL staging

اضبط `DATABASE_URL` إلى قاعدة staging مع `PG_SSL=require`، ثم شغّل الخادم أو migration command، وتحقق من إنشاء `schema_migrations` وتطبيق الإصدارين 1 و2 وزرع plans/entitlements. شغّل بعدها اختبارات العزل، ومعاملات الطلب/الشراء/POS، وتوازن دفتر الأستاذ على PostgreSQL نفسه، لا على SQLite فقط.

### 2. النسخ والاستعادة

نفّذ `pg_dump` إلى storage منفصل ومشفّر، ثم استعد النسخة إلى قاعدة منفصلة عبر `pg_restore`. يجب التحقق من عدد الجداول، عدد المستأجرين، توازن القيود، وصحة readiness بعد الاستعادة. لا تستخدم rollback migration على إنتاج بدلاً من backup معتمد.

### 3. مزودات خارجية

يجب ربط مزود دفع حقيقي بعقد capture/refund وWebhook signing، ثم تنفيذ contract tests تمنع إعلان النجاح الكاذب. يجب كذلك إعداد قنوات البريد وSMS وPush، وObject Storage للملفات، وRedis/queue للتحكم الموزع في المعدل والمهام الخلفية، وvector/embedding provider إذا كان RAG الدلالي مطلوباً.

### 4. الضبط الأمني والتشغيلي

يجب تدوير الأسرار عبر secrets manager، تفعيل TLS، تحديد حدود pool، إضافة rate limit موزع، مراقبة errors/latency، إعداد تنبيهات readiness، تفعيل backup retention، واختبار tenant isolation ضد مستخدمين من مستأجرين مختلفين. يجب إجراء مراجعة مستقلة لـMFA/OTP، إدارة الأجهزة، سياسات الاسترداد، وRBAC قبل فتح التسجيل العام.

## بوابة القبول المقترحة

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
DATABASE_URL='postgresql://...' PG_SSL=require NODE_ENV=production pnpm start
curl -fsS http://127.0.0.1:3000/api/health
curl -i http://127.0.0.1:3000/api/readiness
```

لا تُرفع حالة الإصدار إلى **Ready** إلا إذا نجحت الأوامر السابقة، وتأكد اتصال PostgreSQL، واكتملت اختبارات staging وrestore drill ومراجعة provider contracts. غياب credential أو قاعدة staging يجب أن يظل **REQUIRES_SETUP**، وليس نجاحاً وهمياً.

## V5.1 verification addendum

الـbaseline المعتمد لهذا التدقيق هو `235d17c69be44f4b85d2fe0f406885397fc3cf35`، وليس `38d8f52`. في هذه الجولة أصبح `pnpm test:load` self-contained؛ يبدأ خادمًا محليًا مع test-only SQLite bypass عند غياب `BASE_URL`، ويسجل p50/p95/p99. كما أضيف `pnpm test:security` إلى Quality Gate لفحص الأسرار المتتبعة، `.env.example`، security headers، request ID، وhealth/readiness contract.

النتيجة المحلية المثبتة: `pnpm check` و`pnpm test` (37 اختبارًا) و`pnpm build` و`pnpm test:e2e` و`pnpm test:smoke` و`pnpm test:load` و`pnpm test:security` كلها **PASS**. نتيجة load هي 100 طلبًا، concurrency 10، failures 0، p50 5ms، p95 16ms، p99 22ms. هذه نتيجة local verification وليست staging load test.

تظل PostgreSQL staging وRedis وObject Storage ومزودات الدفع/الإشعارات/AI وMFA الكامل وWAF/pentest وencrypted restore drill وAndroid signing حالات `REQUIRES_SETUP` أو `BLOCKED_EXTERNAL_DEPENDENCY` حتى تتوفر الأدلة الخارجية. لذلك يبقى الحكم **Production Verification Pending**.

## References

[1]: https://github.com/mahmoudbkeer/Ai-digital-sinai "AI DIGITAL SINAI GitHub repository"

## Staging gate implementation

أصبح فحص PostgreSQL staging قابلاً للتشغيل رسميًا عبر `pnpm test:staging`. يفحص gate الاتصال الحقيقي، migrations 1–3، الجداول الأساسية، foreign keys، tenant composite constraints، financial journal balance، وtransaction rollback. تم توفير `.github/workflows/staging.yml` لتشغيله يدويًا أو على فرع `staging` باستخدام `STAGING_DATABASE_URL` و`STAGING_COMMAND_CONTEXT_SECRET` من GitHub Secrets. في البيئة الحالية، غياب PostgreSQL حقيقي يصنف النتيجة `BLOCKED_EXTERNAL_DEPENDENCY` بدلًا من تمرير SQLite.

## V5.3 PostgreSQL execution result

تم تشغيل PostgreSQL 16 محليًا كـstaging حقيقي، وليس SQLite، مع قاعدة `sinai_staging`. فشل التشغيل الأول بسبب overflow في حقول epoch milliseconds المعرفة كـ`INTEGER`؛ تم إصلاح PostgreSQL migrations 1–3 إلى `BIGINT` ثم نجح الفحص.

نجحت migrations 1–3، ووجود 10 جداول أساسية، و184 foreign keys، و52 tenant composite constraints، وfinancial balance، وrollback probe. كما نجح `pnpm test:staging:api` في identity، tenant tampering، inventory، order، cross-tenant AI search، وpayment setup boundary.

أضيف critical-path workflow إلى `.github/workflows/staging.yml`. تبقى قاعدة production/offsite وTLS وencrypted restore وmanaged Redis وexternal providers متطلبات مستقلة.
