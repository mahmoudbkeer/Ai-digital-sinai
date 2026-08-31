# Implementation Changelog — V5.1 Verification Hardening

## 31 أغسطس 2026 — فوق baseline `7e3fbe9`

تم تنفيذ دفعة صغيرة عالية العائد دون إعادة بناء المشروع أو تكرار الميزات الموجودة. أُصلح `scripts/load-smoke.mjs` ليبدأ خادم production المحلي تلقائيًا عندما لا يمرر المستخدم `BASE_URL`، مع test-only SQLite bypass صريح، health wait، قياس p50/p95/p99، وإغلاق آمن للخادم. بذلك أصبح `pnpm test:load` أمرًا مستقلًا قابلًا للتشغيل في CI أو محليًا.

أضيف `scripts/security-smoke.mjs` كاختبار أمني داخلي قابل للتكرار. يفحص عدم تتبع ملفات الأسرار، وجود `.env.example`، security headers، request ID، وصيغة health/readiness. أضيف الأمر `pnpm test:security` إلى `package.json` وإلى `.github/workflows/quality.yml` بعد تشغيل الخادم.

أضيف `.env.example` بلا قيم سرية، مع استثناء واضح في `.gitignore`، لتوثيق فصل البيئات ومنع الالتباس بين إعدادات الاختبار والإنتاج.

## Evidence

| الفحص | النتيجة |
|---|---|
| TypeScript | PASS |
| Vitest | PASS — 8 files / 37 tests |
| Production build | PASS |
| Playwright E2E | PASS — 1 test |
| App smoke | PASS — 3 checks |
| Load smoke | PASS — 100 requests، concurrency 10، failures 0، p50 5ms، p95 16ms، p99 22ms |
| Security smoke | PASS |
| PostgreSQL staging | BLOCKED_EXTERNAL_DEPENDENCY |
| External providers/Redis/Object Storage | REQUIRES_SETUP |
| Android signing | REQUIRES_SETUP |

## Integrity policy

لا يُعلن هذا المستودع `PRODUCTION READY` بناءً على build أو local smoke فقط. يظل اعتماد PostgreSQL staging، restore، provider sandboxes، WAF/pentest، load staging، وAndroid signing مطلوبًا قبل إعلان الجاهزية.

## References

[1]: https://github.com/mahmoudbkeer/Ai-digital-sinai "AI DIGITAL SINAI GitHub repository"

## 31 أغسطس 2026 — Redis وBackup integrity hardening

تم إغلاق fallback غير الآمن في Redis: عند ضبط `REDIS_URL` يستخدم provider اتصال Redis فعليًا عبر RESP مع دعم `redis://` و`rediss://` وAUTH/SELECT وTTL، وعند فشل الاتصال يعيد `REQUIRES_SETUP` بدل الكتابة إلى process memory. يظل memory fallback متاحًا للتطوير فقط عندما لا يكون Redis configured، وممنوعًا في production/staging configured paths.

أضيف SHA-256 manifest لكل نسخة SQLite أو PostgreSQL. يرفض `restore` النسخ التي لا تملك manifest إلا مع `ALLOW_LEGACY_BACKUP=1` صراحة، ويرفض checksum mismatch قبل الاستعادة. تم تنفيذ backup/restore محليًا بنجاح مع manifest وتحقق checksum.

## V5.2 — PostgreSQL staging verification gate

أضيف `scripts/postgres-staging-smoke.mjs` وأمر `pnpm test:staging` لتنفيذ فحص حقيقي على PostgreSQL عند توفر `DATABASE_URL`. يشمل الفحص الاتصال، تطبيق migrations 1–3، وجود الجداول الأساسية، foreign keys، tenant composite constraints، اتزان كل قيود ledger، وrollback transaction probe. أضيف workflow يدوي `.github/workflows/staging.yml` يستخدم GitHub Secrets ولا يمرر SQLite كبديل. في البيئة الحالية أعاد الأمر `BLOCKED_EXTERNAL_DEPENDENCY` مع exit code 78 بسبب غياب PostgreSQL staging، وهو السلوك المقصود.

## V5.3 — Real PostgreSQL staging execution

تم تشغيل PostgreSQL 16 وRedis 7 محليًا، وإنشاء قاعدة staging مستقلة. كشف `pnpm test:staging` overflow حقيقيًا في epoch milliseconds؛ تم إصلاح كل حقول الوقت في PostgreSQL migrations 1–3 من `INTEGER` إلى `BIGINT`. بعد الإصلاح نجحت migration consistency، foreign keys، tenant composite constraints، ledger balance، وtransaction rollback.

أضيف `scripts/postgres-critical-smoke.mjs` و`pnpm test:staging:api` لاختبار identity، tenant ID tampering، inventory، order totals، cross-tenant AI search، ورفض payment false success على PostgreSQL الحقيقي. تم إدراج الفحص في GitHub staging workflow.
