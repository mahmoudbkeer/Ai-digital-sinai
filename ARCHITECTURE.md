# AI Digital Sinai — Architecture

## 1. النطاق

المشروع هو نواة **Enterprise Multi-Tenant Digital Operating System** مبنية داخل المستودع الحالي. نقطة الدخول الخادمية هي `server/index.ts`، وتُركّب واجهات المنصة تحت `/api/platform`. واجهات React الموجودة في `client/` تعمل كواجهة تطبيق، بينما قواعد القرار والهوية والصلاحيات والمعاملات الحساسة تقع في الخادم.

## 2. طبقات النظام

| الطبقة | التنفيذ الفعلي | الحالة |
|---|---|---|
| HTTP | Express مع JSON limits وrequest IDs ومعالج أخطاء | IMPLEMENTED |
| Identity | Users، scrypt password hashing، sessions ذات token hash، revoke، recovery token | IMPLEMENTED |
| Tenant Context | `x-tenant-id` + membership lookup + tenant-aware queries | IMPLEMENTED على SQLite وPostgreSQL عبر AsyncDataPlane |
| RBAC/ABAC | Roles، permissions، `assertScope`، subscription entitlements، tool/policy checks للـAgents | IMPLEMENTED جزئياً |
| Data plane | `AsyncDataPlane` فوق SQLite و`pg`، parameter binding، foreign keys، transactions، pooling | IMPLEMENTED |
| Production DB adapter | `pg` Pool، health check، advisory-lock migration runner، PostgreSQL schema versions 1–4 | IMPLEMENTED برمجياً؛ يحتاج staging verification |
| Business OS | Businesses، branches، customers، employees، CRM، suppliers، purchases، expenses، products، inventory، orders، POS، reports | IMPLEMENTED جزئياً |
| Commerce | Marketplace catalog، cart، checkout، invoice، refund request، offers، reviews، favorites | IMPLEMENTED جزئياً؛ provider settlement خارجي |
| Finance | Balanced journals، sale/cancellation/purchase/expense/POS payment، accounts per tenant | IMPLEMENTED جزئياً؛ لا توجد محاسبة شاملة لكل الحالات |
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

## 7. حالة data plane والإنتاج

مسارات المنصة وwebhook تستخدم الآن `server/dataPlane.ts`، وتختار PostgreSQL تلقائياً عندما يكون `DATABASE_URL` رابطاً صالحاً، مع انتظار migration قبل استقبال الطلبات. لا يُعد تبديل المتغير وحده دليلاً على الجاهزية: يجب تطبيق migrations على staging وتشغيل اختبارات العقد والتحقق من العزل والتوازن المالي. ما زالت Redis/queues وobject storage/CDN ومزودات الدفع والإشعارات وخدمات vector/embedding متطلبات خارجية قبل تصنيف الخدمة production-ready بالكامل.

## V6 implementation note

أضيفت هوية MFA/TOTP server-enforced عبر migration 4، وObjectStorageProvider يدعم tenant-scoped signed upload/download URLs مع منع traversal والتحقق من النوع والحجم. PostgreSQL staging يطبق migrations 1–4 داخل transaction مع critical-path API smoke. لا تعتبر هذه العقود بديلًا عن provider credentials أو production verification.
