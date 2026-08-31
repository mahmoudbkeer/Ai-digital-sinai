# Security Audit

**تاريخ المراجعة:** 31 أغسطس 2026

## نطاق المراجعة

تم فحص Express routes، طبقة SQLite والمخطط والترحيل، مصادقة الجلسات، Tenant isolation، RBAC/ABAC، المخزون والطلبات والدفتر والمدفوعات وWebhook وAI request، App Mode/PWA، الاختبارات، وملفات CI. لا يستبدل هذا التدقيق اختبار اختراق خارجي أو اعتماداً إنتاجياً.

## الضوابط المطبقة

| المجال | الضابط | الحالة والدليل |
| --- | --- | --- |
| كلمات المرور | `scrypt` مع salt عشوائي وتحقق timing-safe | مطبق في `server/platform.ts` |
| الجلسات | token hash، انتهاء 30 يوماً، revocation عند logout/reset | مطبق في `sessions` |
| Brute force | failed login counter وقفل 15 دقيقة بعد 5 محاولات، وrate limit داخل العملية | مطبق؛ يحتاج store موزعاً للإنتاج |
| Tenant isolation | membership lookup وtenant predicates وcomposite foreign keys | مطبق في النواة واختبار Tenant A/B |
| RBAC/ABAC | role matrix مع resource/action وtenant/business/branch context | مطبق في مسارات النواة؛ التغطية ليست شاملة لكل موارد TXT |
| Input validation | حدود للنصوص والمبالغ والكميات والحالات والمعرفات | مطبق في API الأساسية |
| المخزون | movements فقط، idempotency، transaction، ومنع negative stock | مطبق واختبر |
| المال | debit/credit exclusivity وتساوي الإجماليات وقيد مبيعات متوازن | مطبق واختبر للقيد والطلب |
| Payment Webhook | HMAC، event ID، payload hash، منع replay conflict | مطبق واختبر تكاملياً |
| Payment truthfulness | `REQUIRES_SETUP` دون capture أو settlement وهمي | مطبق |
| AI isolation | tenant/user/allowedDataScope وتسجيل hash ورفض نمط prompt injection واضح | مطبق كحد أولي؛ لا توجد RAG كاملة |
| Auditability | audit log للأفعال الحساسة والعمليات المالية والـAI | مطبق في النواة |
| HTTP | `nosniff` و`DENY` وReferrer Policy وCSP/HSTS في production | مطبق في `server/index.ts` |
| Error safety | response لا يكشف stack أو أسراراً، وrequest ID في السجل | مطبق واختبر |
| Secrets | لا توجد أسرار معروفة في scan ولا ملفات env متعقبة | اجتاز الفحص النصي |

## نتائج الاختبارات الأمنية

اجتازت اختبارات غياب المصادقة، تغيير tenant مع session نفسها، idempotency conflict، negative stock، unbalanced journal، prompt injection pattern، توقيع Webhook الخاطئ، replay، وتعارض الحمولة. اجتازت كذلك `pnpm check` و`pnpm test` و`pnpm test:e2e` و`pnpm test:smoke`.

## المخاطر المتبقية

محددات المعدل الحالية داخل ذاكرة العملية، ولذلك لا تكفي لعدة نسخ أو هجمات موزعة؛ يلزم Redis أو WAF أو gateway موزع. SQLite مناسب لمسار محلي واحد، وليس بديلاً عن قاعدة إنتاج مُدارة مع نسخ احتياطي واستعادة وتشفير ومراقبة. استعادة كلمة المرور لا ترسل بريداً دون provider مهيأ، وMFA/OTP/device verification ما زالت architecture-ready فقط.

لا توجد حماية شاملة من كل أشكال Prompt Injection أو retrieved malicious instructions لأن RAG غير منفذة. Payment adapters غير موصولة بعقود Paymob/Fawry/Vodafone Cash، ولا توجد تسوية أو refunds فعلية. قنوات SMS/Push/Email والتخزين الخارجي غير مهيأة. يجب إجراء اختبار اختراق، مراجعة CSRF عند إدخال cookie-based auth، واختبار صلاحيات كامل لكل دور وموارد قبل الإنتاج.

## Dependency Audit

أعاد `pnpm audit --prod` حالة غير ناجحة مع تحديثات مقترحة لاعتماديات غير مباشرة، من بينها مسارات `streamdown` و`mermaid` و`lodash-es` و`follow-redirects` و`uuid`. لم يتم تغيير lockfile تلقائياً؛ يجب إجراء تحديث مقيد ومراجعة release notes ثم إعادة تشغيل كل بوابات الجودة.

## الحكم

**Security Core: IMPLEMENTED WITH LIMITATIONS. Production security: NOT READY.** لا تفعّل بيانات حقيقية أو دفعاً أو AI خارجياً قبل إغلاق المحددات، مراجعة الأسرار في بيئة النشر، اختبار backup/restore، اختبار اختراق مستقل، وتثبيت rate limiting موزع ومزودات خارجية موثقة.
