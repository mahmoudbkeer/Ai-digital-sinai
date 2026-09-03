# AI DIGITAL SINAI

**نظام تشغيل رقمي وسوق محلي لشمال سيناء** بواجهة عربية أولاً وتصميم RTL وتوجه «ساحل المستقبل». يجمع المشروع بين App Mode/PWA، كتالوج القطاعات، طبقة أوامر خادمية، حالات جاهزية صادقة، وضوابط أمنية تمنع ادعاء تنفيذ معاملات لم تُربط فعلياً بعد.

## الحالة الحالية

التطبيق يعمل كواجهة تشغيل محمولة على `/app`، ويعرض القطاعات والوحدات والعمليات من خلال قاموس تشغيل يضم أربعة عشر قطاعاً. توجد نواة خادمية فعلية تحت `/api/platform` تستخدم `AsyncDataPlane` موحداً: SQLite في التطوير والاختبارات، وPostgreSQL Pool عند ضبط `DATABASE_URL`، مع migrations مقفلة ومعاملات وparameter binding. تشمل النواة الهوية والجلسات المبنية على scrypt، سياق Tenant، RBAC/ABAC، كتالوج المنتجات والخدمات، المخزون بحركات idempotent، Cart/Checkout، الطلبات، الفواتير والضريبة القابلة للتهيئة، القيود المزدوجة، الاشتراكات والـentitlements، CRM، الموظفين، الموردين والمشتريات، المصروفات، POS، العروض والمراجعات والمفضلة، التقارير من قاعدة البيانات، advisor grounded، recommendations، forecast، التسليمات والإشعارات وAI provider contract وlexical tenant-scoped fallback. كل أمر قديم يمر عبر `POST /api/commands/prepare` للتحقق من القطاع والوحدة والعملية وسياق المصادقة. الدفع ينشئ Payment Intent صادقاً بحالة `REQUIRES_SETUP` أو `REQUIRES_ACTION` فقط، وWebhook يسجل الأحداث ويمنع replay؛ ولا تتم أي تسوية تلقائية قبل ربط مزود رسمي بعقده وبيانات اعتماده. أضيف Kashier داخل الحد نفسه عبر `KASHIER_MID` و`KASHIER_API_KEY` و`KASHIER_MODE`، مع `POST /api/platform/payment-requests` من شاشة POS لإنشاء Payment Session ورابط/QR payload، لكن غياب الاعتمادات يبقيه `REQUIRES_SETUP` ولا ينفذ معاملة حقيقية.

## التشغيل المحلي

يتطلب المشروع Node.js 22 وpnpm 10. بعد تثبيت الاعتماديات شغّل `pnpm install --frozen-lockfile`، ثم `pnpm dev` لتشغيل Express وVite معاً. للفحوص استخدم `pnpm check` و`pnpm test` و`pnpm build`، ويمكن تشغيل `pnpm test:e2e` و`pnpm test:smoke` و`pnpm test:load` لفحوص المتصفح والـAPI والحمل المتزامن. للتشغيل التشغيلي استخدم `pnpm backup` و`pnpm restore <backup-path>` بعد ضبط `SQLITE_PATH` أو `DATABASE_URL`.

## فحص Smoke والبيئة

يشغل `pnpm test:smoke` فحصاً سريعاً للصحة و`app-data` وواجهة HTML، بينما يشغل `pnpm test:load` طلبات متزامنة ويحسب معدل الخطأ وp50/p95. عند عدم تمرير `BASE_URL`، يبني السكربت خادم إنتاج مؤقتاً على منفذ محلي ويغلقه بعد الفحص. لا يحتاج الفحص إلى أسرار أو قاعدة بيانات أو تسجيل دخول؛ وإذا كان الخادم يعمل مسبقاً فاستخدم `BASE_URL=http://127.0.0.1:3000 pnpm test:smoke` لتوجيهه إلى ذلك الخادم. يستخدم Playwright قيمة `BASE_URL` عند تمريرها، وإلا يعتمد عنوان التطوير المحلي الافتراضي.

## الجودة والحوكمة

يحتوي المستودع على GitHub Actions في `.github/workflows/quality.yml` لتشغيل TypeScript والاختبارات الوحدوية والبناء وE2E وSmoke وdependency audit وsecret scan عند كل push أو Pull Request إلى `main`. وتشمل الاختبارات الآن عقد Kashier وmock webhook دون أسرار حقيقية أو اتصال إنتاجي. إعدادات حماية الفرع المقترحة موثقة في `.github/BRANCH_PROTECTION.md`، ولا تُفرض تلقائياً على حساب GitHub. راجع `ARCHITECTURE.md` و`DEPLOYMENT.md` و`SECURITY.md` و`FINAL_COMPLETION_AUDIT.md` قبل أي نشر.

## الأمن

لا تضع أسراراً في Git أو في الواجهة. راجع `SECURITY.md` و`SECURITY_AUDIT.md` لمصفوفة المخاطر وضوابط HTTP وHMAC وحدود الطلبات وسياسة الأوامر، و`DEPLOYMENT.md` لإجراءات الهجرة والنسخ والاستعادة. يشرح `TRANSFER_GUIDE.md` طريقة نقل المشروع إلى بيئة أخرى دون نسخ الأسرار أو الاعتماديات أو مخرجات البناء.

## بنية الملفات

| المسار | المسؤولية |
| --- | --- |
| `client/src/pages/MobileApp.tsx` | غلاف App Mode والتنقل المحمول |
| `client/src/lib/operationsCatalog.ts` | القطاعات والوحدات والعمليات |
| `server/index.ts` | Express API وhealth وwebhook وcommand preparation |
| `server/commandPolicy.ts` | التحقق من tuple القطاع/الوحدة/العملية |
| `server/*.test.ts` | اختبارات السياسات والتوقيع والعزل والمعاملات |
| `server/postgres.ts` | PostgreSQL pool وhealth وmigration lock |
| `server/aiProviders.ts` / `server/integrations.ts` | عقود AI والتكاملات وحواجز البيئة |
| `scripts/load-smoke.mjs` | اختبار حمل متزامن مستقل |
| `scripts/backup.mjs` / `scripts/restore.mjs` | Backup وrestore صريحان |
| `ARCHITECTURE.md` / `DEPLOYMENT.md` / `SECURITY.md` | العمارة والتشغيل والأمن |
| `e2e/` | اختبارات الهاتف والتنقل |
| `.github/workflows/quality.yml` | بوابة CI |

## حدود الجاهزية

هذا الإصدار يضم نواة تشغيل حقيقية محلية وقابلة للاختبار، لكنه لا يزعم الجاهزية الإنتاجية الكاملة. يلزم في الإنتاج تشغيل قاعدة مُدارة بآلية backup/restore وتهيئة أسرار مزود الدفع وAI وSMS/Push/Email والتخزين، ومراجعة نشر مستقلة. ما زالت RAG/vector، التنفيذ الكامل للـAgents، التحليلات المتقدمة، مركز Super Admin الكامل، device verification/recovery، وبعض كيانات Commerce/Inventory/Logistics الموسعة خارج نطاق الجاهزية الإنتاجية. Android وiOS native clients مثبتان 8/8 عبر Git main وCI، بينما Service Booking مثبتة 12/12 assertions؛ وتبقى release signing/store submission متطلبات منفصلة.

## عقود الاعتمادية التشغيلية

يتطلب `POST /api/commands/prepare` مفتاح `Idempotency-Key` صالحاً بعد تحقق سياق المستخدم ومساحة العمل. يعيد الطلب المكرر النتيجة نفسها خلال نافذة قصيرة، ويرفض إعادة استخدام المفتاح مع سياق مختلف. حماية أوامر الواجهة داخل الذاكرة وليست بديلاً عن تخزين موزع عند الإنتاج، بينما Idempotency للمخزون والطلبات المالية محفوظة داخل data plane المختار. يميز `GET /api/health` بين liveness، بينما يعرض `GET /api/readiness` حالة السياق والدفع وقاعدة البيانات وbusiness data plane؛ وعند PostgreSQL لا يبدأ الخادم قبل نجاح migration والاتصال الأولي.

## نواة API المنفذة

توجد المسارات الأساسية التالية تحت `/api/platform`: التسجيل وتسجيل الدخول والخروج، `/me`، الخطط والاشتراكات وcancel/renew و`/subscription/entitlements`، المنتجات والخدمات وكتالوج Marketplace، الموظفون والعملاء وتاريخ CRM والتفاعلات والوسوم، الموردون والمشتريات والاستلام، المصروفات والتقارير، السلة وCheckout، حركات المخزون، الطلبات وانتقالات حالاتها، جلسات POS والحركات النقدية والمبيعات والإغلاق، الفواتير وطلبات الاسترداد، دفتر القيود، Payment Intent و`/payment-requests` لإنشاء رابط دفع Kashier من الطلب، العروض والمراجعات والمفضلة، AI request وAgent prepare وAI usage مع نطاق بيانات محمي، السائقون والمركبات والتسليمات وProof-of-Delivery، الإشعارات والتفضيلات وإعادة المحاولة عبر provider، Geo nearby، `/configuration` للضريبة والعملة والفاتورة، `/ai/advisor/insights` و`/ai/advisor/forecast` و`/recommendations`، AI request execute، creative approval وmarketing campaign actions، مؤشرات KPI من قاعدة البيانات، وسجل التدقيق ومركز الإدارة للمستخدمين والمستأجرين والـfeature flags. كل مسار حساس يحتاج Bearer session token و`x-tenant-id`، وتتحقق الاستعلامات من ملكية المستأجر قبل القراءة أو الكتابة.

يستخدم التشغيل المحلي `SQLITE_PATH` اختيارياً، وإلا تُحفظ القاعدة في `.data/ai-digital-sinai.sqlite` غير المتعقبة. ملفات `migrations/0001_core.sql` إلى `migrations/0004_mfa.sql` هي مصدر SQLite، ونسخ `migrations/postgres/` مصدر PostgreSQL. في الإنتاج يتطلب startup `DATABASE_URL` PostgreSQL و`COMMAND_CONTEXT_SECRET`؛ لا يسمح بـSQLite إلا عبر `ALLOW_SQLITE_PRODUCTION_TEST=1` في الاختبارات المحلية. لا ينبغي تشغيل rollback على إنتاج دون نسخة احتياطية واختبار استعادة. الحالة الحالية **Business Core Implemented / Production Verification Pending**؛ ما تبقى من Redis/queues وObject Storage/CDN ومزودات الدفع والإشعارات وvector provider يعتمد على إعدادات خارجية موثقة صراحة في `DEPLOYMENT.md` و`CURRENT_IMPLEMENTATION_MAP.md`.

## متغيرات البيئة المطلوبة لكل مزوّد

| المزوّد | المتغيرات المطلوبة | السلوك عند الغياب |
|---|---|---|
| Firebase Cloud Messaging | `FCM_PROJECT_ID` و`FCM_SERVICE_ACCOUNT_JSON`، مع `deviceToken` لكل Push | حالة `REQUIRES_SETUP`؛ لا يتم إرسال Push ولا تُسجّل تسوية وهمية |
| SendGrid | `SENDGRID_API_KEY` و`SENDGRID_FROM_EMAIL` | حالة `REQUIRES_SETUP`؛ لا يتم ادعاء إرسال Email |
| PostgreSQL المُدار | `DATABASE_URL=postgresql://...` أو `postgres://...`، و`COMMAND_CONTEXT_SECRET` و`PAYMENT_WEBHOOK_SECRET` في الإنتاج | يبقى SQLite للتطوير/الاختبار فقط، ويرفض startup الإنتاجي SQLite إلا عبر bypass اختبار صريح |
| Redis المُدار | `REDIS_URL=redis://...` أو `rediss://...`، مع كلمة المرور وقاعدة المسار عند الحاجة | لا يستخدم النظام memory fallback عند وجود URL أو في production؛ يعيد `REQUIRES_SETUP` عند فشل الاتصال |

بعد إدخال القيم الحقيقية لا يحتاج الكود إلى تعديل: أعد تشغيل الخادم، طبّق migrations، ثم افحص `/api/readiness` وشغّل اختبارات smoke/staging المناسبة. يجب حفظ JSON الخاص بـFirebase كسر في مدير أسرار، لا في Git أو الواجهة.

## SQLite مقابل PostgreSQL وRedis المحلي مقابل Redis المُدار

يستخدم الحد البرمجي نفسه `DATABASE_URL` للتبديل إلى PostgreSQL القياسي، وتستخدم طبقة البيانات placeholders موحدة وتنفذ migrations PostgreSQL مستقلة. مع ذلك، توجد فروق يجب الانتباه لها في الانتقال الفعلي: PostgreSQL أشد صرامة في أنواع البيانات والقيود وforeign keys، والتزامن يعتمد على transactions وrow-level locking بدل SQLite file locking؛ كما أن ترتيب/حساسية النصوص والفهارس قد تختلف، ولذلك يجب اختبار pagination وunique constraints وNULL/collation على staging. اختبارات tenant isolation على PostgreSQL staging مطلوبة قبل الإنتاج، ولا يكفي نجاح SQLite وحده. يجب أيضًا تنفيذ migration lock والـrestore drill على قاعدة مُدارة.

يستخدم Redis المُدار نفس RESP القياسي؛ يدعم الكود `redis://` و`rediss://`، وAUTH من بيانات URL، واختيار database من path، وعمليات `GET/SET/DEL/PING/LPUSH/RPOP/EXPIRE`. الفرق التشغيلي الأساسي أن Redis المُدار شبكة خارجية ذات TLS وtimeouts وموارد مشتركة، لذلك لا يُسمح بالاعتماد على memory fallback عند وجود `REDIS_URL` أو في production، ويجب اختبار latency وreconnect وqueue durability وACL/TLS لدى المزوّد.

أثبتت اختبارات العقد المحلية قبول PostgreSQL URLs وRedis URLs القياسية، ورفض fallback عند عنوان Redis غير قابل للوصول، دون الحاجة إلى حساب مُدار حقيقي.

## Kashier configuration

يستخدم adapter Kashier متغيرات `KASHIER_MID` و`KASHIER_API_KEY` و`KASHIER_MODE=test|live`. ويمكن تخصيص `KASHIER_API_URL` و`KASHIER_PAYMENT_SESSIONS_PATH` للاختبار أو لمطابقة حساب Kashier المفعّل. لا تُحفظ المفاتيح في Git ولا تُمرر إلى العميل. توقيع callback يُتحقق منه بخوارزمية HMAC-SHA256 على ترتيب حقول Kashier الموثق، ثم يمر الحدث عبر نفس مسار `Payment Status → Order → Invoice → Ledger` وidempotency الموجود. عندما لا تكون الاعتمادات موجودة، يعيد إنشاء الـintent أو الـrequest حالة `REQUIRES_SETUP` ولا يستدعي Kashier.

شاشة POS في واجهة الويب تنشئ الطلب أولاً، ثم تستدعي `/api/platform/payment-requests` بمزود `kashier` وتعرض رابط الجلسة للعميل. تطبيقات Android وiOS الحالية تطبيقات Marketplace للمستهلك وليست شاشات كاشير؛ لذلك لم تُضف شاشة POS native غير موجودة في نطاقهما، بينما يظل العقد الخادمي قابلًا للاستهلاك منهما عند إضافة دور الكاشير.

## V6 status

يتضمن الإصدار الحالي MFA/TOTP server-enforced، PostgreSQL staging migrations 1–4 وcritical-path verification، وObject Storage signed tenant-scoped URL contract. الاختبارات المحلية وPostgreSQL staging تمر، بينما `pnpm audit --audit-level high` مصنف `FAILED` بسبب 56 vulnerability ويمنع إعلان الجاهزية الإنتاجية حتى معالجة الاعتماديات. راجع `FINAL_COMPLETION_AUDIT.md` و`PRODUCTION_READINESS.md` للحالة الموثقة.

## V7 status

أُغلقت فجوة MFA brute-force وأضيف `pnpm test:security:adversarial` إلى بوابة الجودة. الاختبار يثبت رفض IDOR وSQL injection وXSS input وrate-limit bypass وwebhook replay. `pnpm audit --prod --audit-level=high` يمر بلا vulnerabilities معروفة. النتيجة الوزنية الحالية **67.14%** والتصنيف `RELEASE CANDIDATE`؛ راجع `FINAL_COMPLETION_MATRIX_V7.md` للفجوات الدقيقة.

## End-to-end acceptance

السلسلة الفعلية متاحة عبر `pnpm acceptance:chain`. الاختبار لا يستخدم fake payment: يثبت identity وtenant وproduct وinventory وorder/invoice/ledger، ثم يتوقف بصدق عند provider activation إذا غابت credentials. لا يصنف المشروع `PRODUCTION READY` قبل نجاح Payment ثم بقية السلسلة على الاعتماديات الفعلية.
