# AI Digital Sinai — Architecture

## 1. النطاق

المشروع هو نواة **Enterprise Multi-Tenant Digital Operating System** مبنية داخل المستودع الحالي. نقطة الدخول الخادمية هي `server/index.ts`، وتُركّب واجهات المنصة تحت `/api/platform`. واجهات React الموجودة في `client/` تعمل كواجهة تطبيق، بينما قواعد القرار والهوية والصلاحيات والمعاملات الحساسة تقع في الخادم.

## 2. طبقات النظام

| الطبقة | التنفيذ الفعلي | الحالة |
|---|---|---|
| HTTP | Express مع JSON limits وrequest IDs ومعالج أخطاء | IMPLEMENTED |
| Identity | Users، scrypt password hashing، sessions ذات token hash، revoke، recovery token | IMPLEMENTED |
| Tenant Context | `x-tenant-id` + membership lookup + tenant-aware queries | IMPLEMENTED على SQLite |
| RBAC/ABAC | Roles، permissions، `assertScope`، tool/policy checks للـAgents | IMPLEMENTED جزئياً |
| Data plane | SQLite عبر `node:sqlite`، schema bootstrap، foreign keys، transactions | IMPLEMENTED للتطوير والاختبارات |
| Production DB adapter | `pg` Pool، health check، advisory-lock migration runner، PostgreSQL schema | REQUIRES_SETUP؛ business router ما زال sync/SQLite |
| Business OS | Businesses، branches، customers، products، services، inventory، orders | IMPLEMENTED جزئياً |
| Commerce | Marketplace catalog، cart، checkout، invoice، refund request | IMPLEMENTED جزئياً؛ provider settlement خارجي |
| Finance | Balanced journals، sale/cancellation reversal، accounts per tenant | IMPLEMENTED جزئياً؛ لا توجد محاسبة شاملة لكل الحالات |
| AI | Isolated requests، lexical tenant-scoped RAG fallback، agent policy preparation، usage schema | IMPLEMENTED جزئياً |
| Logistics | Drivers، vehicles، deliveries، state machine، proof of delivery، events | IMPLEMENTED جزئياً |
| Operations | Ads، Geo nearby، notifications abstraction، admin APIs، feature flags | IMPLEMENTED جزئياً |

## 3. مبدأ العزل

كل كيان تشغيلي يحمل `tenant_id`. العلاقات الحساسة تستخدم مفاتيح فريدة مركبة مثل `(tenant_id, id)` قبل قبول foreign key المركب. طبقة المصادقة لا تكتفي بصحة الجلسة؛ بل تتحقق من عضوية المستخدم في المستأجر المطلوب، والمسارات تعيد تطبيق النطاق في الاستعلامات نفسها.

> لا يُعتبر وجود endpoint أو جدول دليلاً على اكتمال feature. الدليل المقبول هو مسار قرار خادمي، كتابة/قراءة بيانات، قيود scope، وحالة اختبار أو توثيق صريح للاعتماد الخارجي.

## 4. المعاملات المالية والتشغيلية

إنشاء الطلب يقرأ السعر والمخزون من الخادم، يخصم المخزون داخل transaction، ينشئ order items، ينشئ قيداً مزدوجاً متوازناً، ويصدر invoice tenant-aware. إلغاء الطلب يعكس المخزون والقيد ويحوّل الفاتورة إلى `VOID`. إنشاء Payment Intent أو Refund لا يعلن التحصيل أو الاسترداد عندما يكون المزود غير مهيأ؛ الحالة تكون `REQUIRES_SETUP` أو `REQUIRES_ACTION` حسب adapter.

## 5. AI وRAG وAgents

الـAI request يخزن tenant/user والغرض وhash للمدخل ونطاق البيانات المسموح. البحث المتاح فعلياً هو **lexical fallback** داخل مستندات المستأجر؛ embedding/vector provider غير موصول ويُعلن `REQUIRES_SETUP`. وكل Agent يملك policy وpermissions وtenant scope وtool allowlist. الأفعال الحساسة، مثل الدفع والاسترداد وتغيير الصلاحيات وحذف الحساب وتغيير الاشتراك، لا تُنفّذ عبر هذا المسار؛ تُحفظ كـ`BLOCKED_POLICY` إذا غاب authorization الصريح.

## 6. الاعتماديات الخارجية

PostgreSQL، مزود الدفع، مزودات البريد/SMS/Push، vector embeddings، Redis، object storage/CDN، monitoring وsecrets manager وAndroid signing كلها adapters أو متطلبات تشغيل. لا توجد fake success؛ عدم وجود credential يعيد `REQUIRES_SETUP` أو يجعل readiness `degraded`.

## 7. مسارات التوسع

المسار الآمن للإنتاج هو توحيد repository layer على async SQL، تطبيق PostgreSQL migration، إضافة Redis للـrate limits/queues، إضافة object storage للملفات، ثم تشغيل provider contract tests قبل تحويل readiness إلى `ready`. لا يكفي تبديل `DATABASE_URL` وحده، لأن business router الحالي يعتمد على SQLite synchronous API.
