# Implementation Changelog

## 31 أغسطس 2026 — Enterprise Core Slice

### What changed

تم تنفيذ شريحة تشغيلية حقيقية فوق المشروع الحالي، مع الحفاظ على App Mode/PWA وExpress وVite وعقود الأوامر وWebhook الموجودة. أضيفت قاعدة SQLite محلية فعلية مع foreign keys وunique constraints وindexes وtransactions وmigration وrollback script. أضيفت هوية بتجزئة `scrypt`، جلسات قابلة للإبطال، قفل مؤقت بعد محاولات الدخول الفاشلة، واستعادة كلمة مرور ذات رموز مخزنة بالتجزئة. أضيف سياق Tenant إلزامي للمسارات الحساسة، ومصفوفة RBAC/ABAC قابلة للتوسعة للأدوار المحددة في المواصفة.

أضيفت وحدات المنتجات والخدمات والكتالوج والسلة وCheckout والطلبات وحالات الطلبات وحركات المخزون ومنع المخزون السالب وIdempotency. أضيف دفتر قيود مزدوج يمنع القيد غير المتوازن ويسجل مبيعات الطلبات داخل transaction. أضيفت الخطط والاشتراكات والتجربة المضبوطة من الخادم، إضافة إلى السائقين والمركبات والتسليمات وآلة حالات التسليم والإشعارات الداخلية ومؤشرات KPI مشتقة من قاعدة البيانات.

أضيف Payment Provider abstraction مع حالات `REQUIRES_SETUP` و`REQUIRES_ACTION` دون Fake Success. كما أصبح Webhook يسجل الحدث، يتحقق من المعرف والحمولة، يمنع replay والتعارض، ويبقي التسوية متوقفة حتى تهيئة مزود رسمي. أضيف AI request gateway أولي يسجل نطاق البيانات المسموح ويمنع نمطاً واضحاً من Prompt Injection، ولا يختلق نتيجة عند غياب مزود AI.

### Why

الهدف هو تنفيذ الأولويات P0 إلى P3 الممكنة داخل المستودع الحالي دون إنشاء Repository أو مشروع جديد أو هدم الواجهة الموجودة، مع إبقاء كل External Dependency غير المهيأة في حالة صادقة ومعلنة.

### Files

| النوع | الملفات |
| --- | --- |
| نواة البيانات | `server/database.ts`, `migrations/0001_core.sql`, `migrations/0001_core_rollback.sql` |
| API والأمن | `server/platform.ts`, `server/paymentProviders.ts`, `server/index.ts` |
| الاختبارات | `server/platform.test.ts`, `server/paymentEndpoint.test.ts` |
| الجودة | `vitest.config.ts`, `playwright.config.ts` |
| التوثيق | `README.md`, `IMPLEMENTATION_CHANGELOG.md`, `FINAL_COMPLETION_AUDIT.md` |

### Database impact

أضيفت جداول users وsessions وpassword reset وuser security وtenants وtenant members وbusinesses وbranches وcustomers وproducts وservices وcategories وcarts وcart items وinventory وorders وorder items وledger accounts وjournals وentries وpayment intents وpayment webhook events وplans وentitlements وsubscriptions وdrivers وvehicles وdeliveries وdelivery events وnotifications وnotification preferences وAI requests وaudit logs. كل الجداول الحساسة تحمل `tenant_id` أو ترتبط بكيان tenant-aware، وتُفرض العلاقات المركبة حيث يلزم منع cross-tenant references.

### API impact

أضيفت مسارات `/api/platform` للتسجيل والدخول والخروج واستعادة كلمة المرور و`/me` والخطط والاشتراكات والمنتجات والخدمات والكتالوج والسلة وCheckout والمخزون والطلبات والقيود والدفع والذكاء الاصطناعي والتسليمات والإشعارات والتحليلات والتدقيق والإدارة. بقيت المسارات القديمة `/api/commands/prepare` و`/api/payments/webhook` متوافقة مع عقودها، مع تقوية Webhook ضد replay.

### Security impact

أضيفت جلسات Bearer قابلة للإبطال، تجزئة كلمات المرور، قفل محاولات الدخول، rate limiting للدخول والاستعادة، tenant isolation في الاستعلامات، RBAC/ABAC، تحقق مدخلات، حدود للمبالغ والكميات، منع المخزون السالب، منع القيد المالي غير المتوازن، HMAC للـWebhook، event idempotency، سجلات تدقيق، وحماية أولية من Prompt Injection. لم تُضف أي أسرار أو مفاتيح إلى المستودع.

### Tests

اجتازت `pnpm check`، و`pnpm test` بعدد **6 ملفات و25 اختباراً ناجحاً**، و`pnpm build`، و`pnpm test:e2e`، و`pnpm test:smoke`. كما اجتاز `git diff --check` وفحص الأسرار النصي. أعاد `pnpm audit --prod` قائمة تحديثات مقترحة لاعتماديات غير مباشرة؛ لم تُحدّث تلقائياً لتجنب تغيير شجرة الاعتماديات دون مراجعة توافق.

### Known limitations

هذه ليست مطابقة كاملة للمواصفة الضخمة. ما زالت مزودات الدفع الفعلية والتسوية، AI/RAG/vector search، MFA/OTP الفعلي، SMS وPush وEmail، التخزين السحابي، قاعدة الإنتاج المدارة، الإعلانات الذكية، KPIs المتقدمة، Super Admin الكامل، النسخ الاحتياطي والاستعادة المجرّبة، وبعض كيانات المشتريات والضرائب والفواتير والمراجعات والوظائف والعقارات وAndroid/APK خارج التنفيذ الحالي. تم توثيقها في `FINAL_COMPLETION_AUDIT.md` كفجوات أو External Dependencies لا كميزات مكتملة.
