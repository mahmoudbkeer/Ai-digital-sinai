# AI DIGITAL SINAI — Security Notes

## Security boundary

الواجهة لا تُعد حدوداً أمنية. كل tenant-scoped mutation يمر عبر جلسة محمية، عضوية tenant نشطة، والتحقق من الموارد المرتبطة قبل الكتابة. لا يعتمد النظام على إخفاء زر الإدارة لإثبات المنع.

## Tenant and resource isolation

تتحقق المسارات الحساسة من أن business وprovider وservice وcustomer وservice request وsubscription تنتمي إلى tenant المرسل، وتتحقق الخدمة من ارتباط provider بالـ business نفسه. توجد فحوص مقابلة داخل طبقة `server/db.ts` كدفاع ثانٍ عند استدعاء helpers مباشرة.

## Permission model

يحتوي `server/tenantAccess.ts` على Permission Matrix للأدوار الحالية owner/admin/manager/staff/viewer، مع صلاحيات قراءة وإدارة الأعمال والعملاء والخدمات والطلبات والاشتراكات والمساعد ومساحات العمل. يمكن توسيع المصفوفة لإضافة أدوار أعمال أكثر تفصيلاً دون إنشاء نظام ثانٍ.

## Subscription safety

لا يقبل `subscription.startTrial` مدة تجربة من العميل؛ يقرأ الخادم `trialDays` من الخطة النشطة. ولا يقبل `subscription.activate` `periodDays` من العميل؛ يستخدم الخادم دورة فوترة ثابتة 30 يوماً حالياً. الأسعار والصلاحيات والـ entitlements المالية لم تُختلق، إذ لا توجد بعد بوابة دفع أو webhook موثقة في المخطط الحالي.

## AI and voice

المساعد العام محصور في المعرفة العامة ولا يملك أدوات مالية أو إدارية. توجد حصة جلسة وحدود لحجم الرسائل والصوت. ما زال ربط AI ببيانات tenant الخاصة، وإضافة حذف ملف الصوت المؤقت بعد المعالجة، يحتاجان storage delete lifecycle وبيئة تكامل فعلية قبل اعتبارهما مكتملين إنتاجياً.

## Audit and incident handling

تُسجّل إجراءات كثيرة في `audit_logs`، خصوصاً تغييرات الخدمات والطلبات والخطط والتصنيفات ومساحات العمل. لا ينبغي تخزين كلمات المرور أو مفاتيح API أو بيانات دفع في السجل. تسجيل أحداث الدفع وwebhook وعمليات AI التنفيذية يبقى محجوباً حتى إضافة تلك الوحدات الحقيقية.

## Known blockers

لا توجد في schema الحالية جداول payment/transaction/invoice/refund/ledger/webhook أو delivery/driver أو campaign/analytics. لذلك لا يعرض التطبيق نجاحاً مالياً وهمياً ولا يعلن اكتمال هذه الوحدات؛ يجب تنفيذها لاحقاً عبر migrations آمنة واختبارات تكامل وتوقيع webhook وidempotency.
