# Implementation Changelog — V5.1 Verification Hardening

## 31 أغسطس 2026 — فوق baseline `c24e43d`

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

## V5.4 — Server-enforced MFA/TOTP

أضيفت وحدة `server/mfa.ts` بدون اعتماد خارجي لتوليد secrets وTOTP/otpauth URI والتحقق بزمن سماح محدود. أضيف migration 0004 لمساري SQLite وPostgreSQL، وتم فرض OTP قبل إنشاء session عند تفعيل MFA، مع audit events للتمكين والتعطيل. أضيف اختبار adversarial يثبت أن login بلا OTP مرفوض وأن OTP الصحيح مقبول.

## V6 — Object Storage and security gate hardening

تم تنفيذ signed Object Storage access مع tenant prefix، منع traversal، signed upload/download URLs، وتغطية اختبارية. أضيف HSTS verification إلى security smoke. تم تشغيل dependency audit فعليًا؛ النتيجة FAILED بسبب 56 vulnerability، منها 27 high و2 critical، وتم رفض auto-fix لأنه ولّد overrides غير مدعومة في إعداد pnpm الحالي. لا يتم إخفاء النتيجة.

**Current verified commit:** `0e41219faad07ec7518d3102176422857ce1f335`

## V7 — Security gap closure

بعد إعادة تدقيق V6، تم اكتشاف وإصلاح MFA brute-force regression: يتم الآن احتساب OTP failures وقفل المستخدم بعد خمس محاولات قبل السماح بإعادة ضبط العداد. أضيف adversarial security smoke حقيقي إلى package scripts وGitHub Quality Gate، ويغطي IDOR، SQL injection bypass، XSS input، rate-limit bypass، webhook signature، وreplay. شُدد production startup بمتطلبات webhook secret وCORS allowlist. النتيجة: 42 اختبارًا محليًا، adversarial smoke PASS، PostgreSQL staging PASS، و`pnpm audit --prod --audit-level=high` PASS.

## Focused gap-closure round — Redis, Backup/DR, RAG

تمت إضافة Redis queue primitives (`LPUSH`/`RPOP`) مع TTL، وworker architecture عبر `scripts/queue-worker.mjs` تدعم retry وDLQ ولا تستخدم process-memory في production. تم تنفيذ AES-256-GCM backup encryption عبر `BACKUP_ENCRYPTION_KEY` مع magic header وauth tag وmanifest checksum، وإضافة decrypt والتحقق الإجباري في restore. تم إنشاء RAG contract في `server/rag.ts` لتقسيم المستندات، permission filtering، وEmbedding provider truthful `REQUIRES_SETUP`، وربطه بمرحلة ingestion متعددة الـchunks. تم اختبار queue وRAG وbackup/restore المشفر فعليًا.

## End-to-end chain and real payment adapter

أضيف `scripts/acceptance-chain.mjs` لتشغيل سلسلة HTTP حقيقية من identity إلى product/inventory/order/invoice/ledger/payment. الاختبار يمر بالمراحل المحلية ثم يتوقف بوضوح عند Payment credentials المفقودة مع `BLOCKED_EXTERNAL_DEPENDENCY`. تم استبدال payment provider no-op بــHTTP adapter فعلي للـintent/refund مع timeout، authorization، response validation، وfailure handling؛ لا توجد fake payment success.

## Post-payment acceptance flow

أضيف `scripts/acceptance-post-payment.mjs` لتشغيل واختبار delivery lifecycle، proof، in-app notifications، subscription trial، AI advisor، analytics KPIs، وadmin authorization boundary عبر HTTP فعلي. مرّت كل المراحل حتى Admin؛ Owner يحصل على 403 المتوقع، ولا يتم تجاوز الصلاحيات باختبار مصطنع.

## Payment webhook settlement

أُكمل مسار webhook المحلي: event verification، replay idempotency، provider-reference lookup، atomic payment status، order confirmation، invoice paid، وaudit. التشغيل الخارجي يبقى `REQUIRES_SETUP` حتى توفر provider credentials واستجابة حقيقية.

## RBAC/ABAC adversarial matrix

أضيف `scripts/rbac-adversarial-matrix.mjs` إلى `pnpm test:security:adversarial`. ينشئ الاختبار Tenant A وTenant B ومستخدمين فعليين للأدوار Consumer وOwner وManager وEmployee وService Provider وDriver وAdmin وSuper Admin، ثم يختبر 64 حالة Role × Operation server-side، إضافة إلى IDOR حقيقي على product/order/invoice/payment_intent/customer. النتيجة المحلية: PASS؛ كل محاولات cross-tenant أعادت 403.
