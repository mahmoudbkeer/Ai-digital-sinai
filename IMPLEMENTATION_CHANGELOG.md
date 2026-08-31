# Implementation Changelog — V3 Professional Hardening

## النطاق

تم تنفيذ هذه الجولة على المستودع `mahmoudbkeer/Ai-digital-sinai` فوق baseline `38d8f52` على `main`. الهدف كان إغلاق فجوة PostgreSQL business data plane وإضافة الوحدات القابلة للتنفيذ من Business OS دون إعادة بناء Enterprise Core أو ادعاء اكتمال مزودات خارجية.

## التنفيذ التراكمي

تم الحفاظ على App Mode/PWA وExpress وVite وعقود الأوامر وWebhook الموجودة، مع إضافة قاعدة SQLite فعلية وforeign keys وunique constraints وindexes وtransactions وmigration وrollback. أضيفت هوية بتجزئة `scrypt`، جلسات قابلة للإبطال، قفل مؤقت لمحاولات الدخول الفاشلة، واستعادة كلمة مرور ذات رموز مخزنة بالتجزئة. أضيف سياق Tenant إلزامي ومصفوفة RBAC/ABAC قابلة للتوسعة.

أضيفت المنتجات والخدمات والكتالوج والسلة وCheckout والطلبات وحالات الطلبات وحركات المخزون ومنع المخزون السالب وIdempotency. أضيف دفتر قيود مزدوج يمنع القيد غير المتوازن ويسجل مبيعات الطلبات داخل transaction. أضيفت الخطط والاشتراكات والتجربة المضبوطة من الخادم، السائقون والمركبات والتسليمات وآلة الحالات والإشعارات الداخلية ومؤشرات KPI.

## الجولة الحالية

| المجال | التنفيذ |
|---|---|
| Async data plane | `server/dataPlane.ts` يوحد SQLite وPostgreSQL، ويحوّل الاستعلامات إلى async مع parameter binding وtransactions وaffected-row semantics صحيحة |
| PostgreSQL startup | `ensureDataPlaneReady()` يطبق migrations 1 و2 تحت advisory lock قبل إنشاء Express، وwebhook يستخدم نفس data plane |
| Business OS migration | migration version 2 لجداول employees، suppliers، purchases، purchase_items، expenses، CRM interactions/tags، POS sessions/cash/sales، offers |
| Employees/CRM | employee registry مع PIN hash، customers/history، interactions، tags |
| Procurement/Finance | supplier CRUD، purchase receiving يحدّث inventory ويقيد AP، expenses تقيد cash/expense، idempotency للمشتريات |
| POS | session open/list/close، cash movements، POS sale يربط order/payment/invoice/ledger |
| Marketplace | offers، reviews مرتبطة بعميل، favorites |
| Reports/Entitlements | report summary مصدره DB، plans/entitlements seeded، gate server-side للتقارير، endpoint لعرض features |
| Verification | `server/businessOs.test.ts` يختبر الدورة التشغيلية ورفض feature غير مصرح بها |

| المجال | التنفيذ |
|---|---|
| Subscription lifecycle | الخطط المدفوعة تبدأ `PENDING_PAYMENT` عند غياب provider، وإضافة cancel-at-period-end وrenew مع server-controlled dates |
| Logistics | حالة `CREATED`، جدول `delivery_proofs`، مسار إثبات التسليم، ومنع `DELIVERED` بلا proof |
| Admin | إدارة المستخدمين والمستأجرين، تعليق/تنشيط، audit feed، AI usage، feature flags، مع scope platform/tenant |
| AI | `ai_agent_runs`، policy/permission/tenant scope/tool allowlist، `BLOCKED_POLICY` للأفعال الحساسة، وجدول `ai_usage` للتكلفة والزمن والنموذج |
| Notifications | تفضيلات القنوات، retry بحد أقصى 5، وحالات `QUEUED`/`REQUIRES_SETUP` عبر provider abstraction |
| Security middleware | headers قبل Webhook، CORS allowlist، OPTIONS policy، Permissions-Policy، وCSP/HSTS production |
| Express | ترقية Express إلى 5.2.1 وإصلاح catch-all إلى `/{*splat}` |
| Dependencies | إزالة axios غير المستخدم، ترقية nanoid إلى 5.1.16، Recharts إلى 3.10.1، streamdown إلى 2.6.0، ومواءمة chart typings |
| Operations | `scripts/backup.mjs` و`scripts/restore.mjs` مع SQLite safety copy وPostgreSQL pg_dump/pg_restore |
| CI | Quality Gate لـcheck/test/build/E2E/smoke/audit/secret scan، بدون `continue-on-error` للـaudit |
| Documentation | `ARCHITECTURE.md`، `DEPLOYMENT.md`، `SECURITY.md` وتحديث migrations |

## الملفات الرئيسية

- `server/platform.ts`: lifecycle وAdmin وAI وLogistics وNotifications.
- `server/database.ts`: schema SQLite، composite constraints، AI usage/agents، delivery proofs.
- `server/index.ts`: Express 5، headers، CORS، Webhook، readiness.
- `server/postgres.ts`: pool/health/migration-lock/multi-version migration runner.
- `server/dataPlane.ts`: async repository/data-plane seam لـSQLite وPostgreSQL.
- `server/businessOs.test.ts`: اختبارات Business OS وentitlements.
- `migrations/0002_business_os.sql` و`migrations/postgres/0002_business_os.sql`: توسعة domain schema.
- `migrations/postgres/0001_core.sql`: مخطط PostgreSQL الموثق.
- `.github/workflows/quality.yml`: بوابة الجودة.
- `scripts/backup.mjs` و`scripts/restore.mjs`: إجراءات التعافي.

## قرارات الصدق التشغيلي

لا يعلن النظام Payment settlement أو Refund أو Email/SMS/Push أو AI provider result عند غياب الاعتماد. PostgreSQL أصبح مسار business data فعلياً عبر `AsyncDataPlane`، لكن لا تزال مطالبة staging الحقيقية واختبارات provider/restore الخارجية مطلوبة قبل تصنيف الخدمة Production Ready.

## نتيجة الجودة

| الفحص | النتيجة |
|---|---|
| `pnpm check` | PASS |
| `pnpm test` | PASS — 7 files / 29 tests |
| `pnpm build` | PASS |
| `pnpm test:e2e` | PASS — 1 browser test |
| `pnpm test:smoke` | PASS — 3 checks |
| `pnpm audit --prod --audit-level=high` | PASS بعد الترقيات |
| `git diff --check` | PASS |
| `node scripts/backup.mjs` | PASS على SQLite persistent test file |

## الحدود المتبقية

ما زالت مزودات الدفع الفعلية والتسوية، MFA/OTP الفعلي، قنوات البريد وSMS وPush، vector embeddings/RAG provider، Redis للـqueues/rate limits، object storage/CDN، اختبارات PostgreSQL staging/restore، وبعض وحدات الضرائب والموارد البشرية المتقدمة والعقارات وتطبيق Android/APK تحتاج adapters واختبارات وتهيئة تشغيلية. تم إبقاء هذه الحالات معلنة كـ`REQUIRES_SETUP` أو `BLOCKED_EXTERNAL_DEPENDENCY` أو فجوات، لا كميزات مكتملة.
