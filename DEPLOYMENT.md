# AI Digital Sinai — Deployment Runbook

## قبل النشر

يجب توفير Node.js 22، تثبيت الاعتماديات من `pnpm-lock.yaml`، وإبقاء الأسرار خارج المستودع. للتطوير والاختبارات يمكن استخدام `SQLITE_PATH=:memory:` أو ملف SQLite مستمر. عند ضبط `DATABASE_URL` إلى رابط PostgreSQL صالح يختار الخادم AsyncDataPlane وPool PostgreSQL تلقائياً، ويوقف بدء استقبال HTTP حتى تنجح migrations والتحقق الأولي من الاتصال.

## متغيرات البيئة

| المتغير | الغرض | عند الغياب |
|---|---|---|
| `PORT` | منفذ الخادم | `3000` |
| `SQLITE_PATH` | ملف SQLite للتطوير | `.data/ai-digital-sinai.sqlite` |
| `DATABASE_URL` | رابط PostgreSQL للإنتاج | لا يُستخدم كبديل صامت لـSQLite |
| `PG_POOL_MAX` / `PG_POOL_MIN` | حدود pool | `20` / `2` |
| `PG_CONNECTION_TIMEOUT_MS` | مهلة الاتصال | `5000` |
| `PG_STATEMENT_TIMEOUT_MS` | مهلة الاستعلام | `15000` |
| `PG_SSL` | اجعلها `require` في بيئة الإنتاج | TLS غير مفعل تلقائياً |
| `COMMAND_CONTEXT_SECRET` أو `JWT_SECRET` | توقيع سياق الأوامر | readiness degraded |
| `PAYMENT_WEBHOOK_SECRET` | تحقق Webhook | readiness degraded |
| `PAYMENT_PROVIDER_API_KEY` و`PAYMENT_PROVIDER_API_URL` | مزود الدفع | `REQUIRES_SETUP` |
| `AI_PROVIDER_API_KEY` | مزود AI | lexical/queued fallback |
| `EMAIL_PROVIDER_API_KEY` / `SMS_PROVIDER_API_KEY` / `PUSH_PROVIDER_API_KEY` | قنوات الإشعار | `REQUIRES_SETUP` |

## بناء وتشغيل

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
NODE_ENV=production pnpm start
```

يتحقق `/api/health` من حياة العملية فقط. أما `/api/readiness` فيفحص سياق الأوامر وWebhook وقاعدة البيانات وbusiness data plane. عند اختيار PostgreSQL، يمر business data plane عبر `server/dataPlane.ts` بعد نجاح `ensureDataPlaneReady()`؛ وإذا فشلت migration أو قاعدة البيانات يفشل startup بدلاً من تشغيل API على مخزن مختلف بصمت.

## الهجرة

نسخ SQLite الموثقة هي `migrations/0001_core.sql` إلى `migrations/0004_mfa.sql`، ونسخ PostgreSQL المقابلة هي `migrations/postgres/0001_core.sql` إلى `migrations/postgres/0004_mfa.sql`. يقوم `server/postgres.ts` باستخدام advisory transaction lock ويطبق كل إصدار غير موجود في `schema_migrations` داخل transaction، ثم يزرع خطط الاشتراك والـentitlements بشكل idempotent. في بيئة production يجب أخذ backup، تطبيق migration في staging، تشغيل اختبارات العزل والدفتر، ثم الترقية التدريجية. لا تُعدّل migration مطبقة؛ أضف migration جديدة. ملفات rollback موجودة للإجراءات المنضبطة فقط ولا تُشغّل على إنتاج دون backup واختبار استعادة.

## Backup وRestore

```bash
BACKUP_DIR=/secure/backups BACKUP_RETENTION=14 pnpm backup
SQLITE_PATH=/var/lib/ai-digital-sinai/app.sqlite pnpm backup
SQLITE_PATH=/var/lib/ai-digital-sinai/app.sqlite pnpm restore /secure/backups/ai-digital-sinai-<timestamp>.sqlite
DATABASE_URL=postgresql://... pnpm restore /secure/backups/ai-digital-sinai-<timestamp>.dump
```

يستخدم PostgreSQL `pg_dump` و`pg_restore` إن كانا مثبتين، ويعيد SQLite إنشاء نسخة safety قبل الاستبدال. يجب حفظ النسخ في storage منفصل عن الخادم، وتطبيق retention ونسخ مشفرة واختبار restore دوري. إذا غابت أداة PostgreSQL فالناتج `REQUIRES_SETUP` أو `BLOCKED` وليس نجاحاً وهمياً.

## Rollback وDisaster Recovery

يُعاد نشر آخر image أو commit سليم، ثم يُستعاد backup إلى قاعدة منفصلة ويُشغّل smoke وtenant-isolation وfinancial audit قبل تحويل traffic. لا يُنفذ rollback عشوائي لقاعدة البيانات بعد migration غير عكوسة؛ استخدم migration forward أو نسخة backup معتمدة. Redis وObject Storage وCDN وSecrets Manager وMonitoring ليست مربوطة بعد في هذا المستودع، ولذلك يجب إعدادها في منصة التشغيل قبل تصنيف الخدمة production-ready.

## Checklist تشغيلي

| البند | الحالة الحالية |
|---|---|
| Build/check/unit | منفذ |
| E2E/smoke | منفذ محلياً |
| PostgreSQL business data plane | منفذ برمجياً؛ staging verification مطلوب |
| Redis queue/rate-limit | REQUIRES_SETUP |
| Object storage/CDN | REQUIRES_SETUP |
| External payment settlement | REQUIRES_SETUP |
| Email/SMS/Push | REQUIRES_SETUP |
| Automated backup scheduler | يحتاج scheduler خارج العملية |
| Restore drill | سكربت منفذ، اختبار production يتطلب backup فعلي |

## V6 release evidence

Migration 4 يضيف MFA/TOTP، و`pnpm test:staging` يثبت PostgreSQL migrations 1–4 والقيود والتوازن والrollback على staging حقيقي. استخدم `pnpm test:staging:api` بعد `pnpm build` لاختبار identity والعزل والمخزون والطلبات وpayment boundary. Object Storage يحتاج endpoint/bucket/access/secret، وعند توفرها تنتج المنصة signed tenant-scoped URLs؛ بدونها الحالة `REQUIRES_SETUP`. نتيجة `pnpm audit --audit-level high` الحالية `FAILED` وتمنع release security gate حتى معالجة 56 vulnerability.

## V7 deployment gate

قبل نشر production يجب توفير `DATABASE_URL` PostgreSQL، `COMMAND_CONTEXT_SECRET`، `PAYMENT_WEBHOOK_SECRET`، و`CORS_ORIGINS` allowlist. يمر الكود محليًا عبر adversarial security smoke الذي يثبت رفض IDOR وSQL injection وrate-limit bypass وwebhook replay. `pnpm audit --prod --audit-level=high` هو audit المعتمد لبوابة runtime، ويجب أن يبقى ناجحًا. WAF وDAST وpentest وmanaged services تظل أدلة خارجية مطلوبة.
