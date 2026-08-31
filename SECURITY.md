# AI Digital Sinai — Security Controls

## الهدف

هذه الوثيقة تصف الضوابط الموجودة فعلياً في commit الحالي، ولا تستبدل مراجعة أمنية مستقلة أو إعدادات البنية التحتية. كل حالة أدناه مرتبطة بكود أو اختبار؛ وجود middleware أو endpoint وحده لا يساوي ضماناً أمنياً.

## مصفوفة الضوابط

| المجال | الضابط الفعلي | الدليل | الحالة |
|---|---|---|---|
| Authentication | scrypt salted password hashes، جلسات تحفظ token hash، expiry وrevoke | `server/platform.ts`، اختبارات auth | IMPLEMENTED |
| Password recovery | token hash، expiry، one-time use، revoke للجلسات | `server/platform.ts`، `database.ts` | IMPLEMENTED جزئياً؛ إرسال البريد adapter |
| Authorization | role permissions + `assertScope` + tenant membership | `server/platform.ts` | IMPLEMENTED جزئياً |
| Tenant isolation | tenant predicates، composite foreign keys، اختبارات تغيير tenant header، AsyncDataPlane provider selection | `server/platform.test.ts` و`server/businessOs.test.ts` | IMPLEMENTED محلياً؛ PostgreSQL staging مطلوب |
| Session security | bearer/session token غير مخزن خاماً، انتهاء الجلسة، حالة user | `server/platform.ts` | IMPLEMENTED |
| Input validation | حدود طول، أرقام صحيحة، money/coordinate، enum/state checks | `server/platform.ts` | IMPLEMENTED جزئياً |
| SQL injection | prepared statements وparameter binding | مسارات المنصة | IMPLEMENTED جزئياً؛ يجب استمرار المراجعة |
| XSS/output | JSON API وReact escaping | API/UI | IMPLEMENTED جزئياً؛ لا يوجد CSP شامل |
| CSRF | Bearer-style API يقلل cookie CSRF، لكن deployment policy مطلوبة | API contract | REQUIRES_SETUP |
| SSRF | لا يوجد fetch proxy عام في النواة | current routes | NOT_APPLICABLE حالياً |
| File upload | لا توجد واجهة رفع عامة؛ Proof يستخدم storage ref فقط | current routes | REQUIRES_SETUP |
| Webhook replay | signature verification، event id وpayload hash وعدم إعادة المعالجة | `server/index.ts`، `paymentEndpoint.test.ts` | IMPLEMENTED |
| Idempotency | payment، inventory، cart/order، refund، purchase، journal، POS sale، ad event | schema + routes + `businessOs.test.ts` | IMPLEMENTED جزئياً |
| Prompt injection | رفض patterns واضحة وتسجيل input hash ونطاق البيانات | `server/platform.ts` | IMPLEMENTED جزئياً؛ يلزم classifier/policy evaluation أعمق |
| AI data leakage | tenant-scoped RAG، allowed scope، منع إعادة permission scope | AI routes | IMPLEMENTED جزئياً؛ vector/RAG provider غير موصول |
| Agent safety | policy، permissions، tenant scope، tool allowlist، BLOCKED_POLICY للأفعال الحساسة | `/ai/agents/prepare` | IMPLEMENTED كـprepare-only |
| Secrets | لا تُحفظ الأسرار، workflow secret scan | `.github/workflows/quality.yml` | IMPLEMENTED جزئياً |
| Rate limiting | command burst وlogin throttling موجودان في النواة | `server/index.ts`، `platform.ts` | IMPLEMENTED جزئياً؛ Redis غير موصول للتوزيع |

## قواعد الأفعال الحساسة

لا يجوز للـAI Agent تنفيذ Payment أو Refund أو Permission Change أو Account Deletion أو Subscription Change مباشرة. يلزم permission مطابق وauthorization/policy صريح، وحتى عند تحقق ذلك فإن المسار الحالي يجهز run ولا ينفذ external side effect. مزودو الدفع والإشعارات والـAI لا يعيدون نجاحاً وهمياً عند غياب credentials.

## الاختبارات الأمنية المطلوبة قبل الإنتاج

يجب تشغيل tenant isolation وRBAC/ABAC وpassword recovery وsession expiry وledger balance وpayment signature/replay وidempotency وprompt injection وAI leakage وadmin scope وdependency audit وsecret scan وE2E على بيئة staging. يجب أيضاً تفعيل TLS، secure headers، CSP، CORS allowlist، WAF، centralized logging، alerting، secrets manager وbackup encryption في البنية التحتية.

## المخاطر المتبقية

لم يعد business router مربوطاً بـSQLite synchronous فقط؛ بل يمر عبر `AsyncDataPlane` ويختار PostgreSQL عند ضبط `DATABASE_URL`. الخطر المتبقي هو عدم تشغيل PostgreSQL staging فعلي داخل هذه البيئة، إضافة إلى Redis للتحكم الموزع والqueues، object storage/file scanning، MFA، providers الخارجية، WAF، واختبار اختراق مستقل. لذلك حالة النظام **ليست Production Ready** حتى تُنفذ هذه الاعتماديات والاختبارات التشغيلية.

## V6 security evidence

تم التحقق من HSTS في production smoke، وCORS allowlist، CSP، security headers، request ID، secret scan، وMFA/TOTP server enforcement. Object Storage يرفض traversal ويصدر مفاتيح tenant-scoped فقط مع signed access عند تهيئة المزود. `pnpm audit --audit-level high` ما زال `FAILED` بسبب 56 vulnerability؛ لا يعتبر المشروع أمنيًا مكتملًا قبل تحديث lockfile/dependencies ومراجعة أثر التحديثات.
