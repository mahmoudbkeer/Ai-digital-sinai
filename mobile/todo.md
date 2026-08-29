# Project TODO

- [x] تهيئة مشروع Expo جوال باسم AI DIGITAL SINAI
- [x] فك ضغط المشروع المرفق داخل مجلد تدقيق منفصل دون الكتابة فوق هيكل Expo
- [x] إعداد خطة تصميم الجوال RTL والمتوافقة مع نمط iOS في `design.md`
- [x] تدقيق بنية المشروع المرفق ومقارنة الكود الفعلي بالتوثيق
- [x] إنشاء `CURRENT_SYSTEM_MAP.md` محدث يعكس الواقع الفعلي للكود
- [x] عزل مجلد المصدر المرفق عن فحص TypeScript الخاص بتطبيق Expo
- [x] تحديد الوحدات القابلة لإعادة الاستخدام من المشروع المرفق دون تكرار المكونات أو الجداول أو الواجهات
- [x] تحديث الهوية البصرية والألوان العربية الخاصة بـ AI DIGITAL SINAI
- [x] إنشاء شعار/أيقونة تطبيق فريدة وتحديث إعدادات Expo ومراجع الأصول
- [x] تنفيذ شاشة الترحيب وتدفق تسجيل الدخول أو الدخول كزائر حسب النظام الحالي
- [x] تنفيذ اختيار الدور ومساحة العمل متعددة الأدوار
- [x] تنفيذ الرئيسية الديناميكية للمستهلك وصاحب النشاط
- [x] تنفيذ السوق والبحث والمرشحات وقائمة المنتجات والخدمات
- [x] تنفيذ تفاصيل المنتج/الخدمة وتدفق السلة أو طلب الخدمة
- [x] تنفيذ قائمة الطلبات وتفاصيل حالة الطلب
- [x] تنفيذ لوحة تشغيل الأعمال والكتالوج والخدمات
- [x] تنفيذ المساعد الذكي مع نطاق بيانات واضح وحالات انتظار وفشل
- [x] تنفيذ الإشعارات والحساب وإدارة الجلسات والإعدادات
- [x] تنفيذ مركز الإدارة المحمي بصلاحيات الخادم إن كان مدعوماً في الكود الحالي
- [x] مراجعة عزل المستأجرين والتحقق من العلاقات والصلاحيات server-side
- [x] مراجعة تسجيل Audit Log للإجراءات الحساسة
- [x] إضافة اختبارات وحدات للمسارات الأساسية والصلاحيات والتحقق من المدخلات
- [x] تشغيل فحوص TypeScript وlint وvitest وإصلاح الأخطاء
- [ ] التحقق من المعاينة على الويب ومن توافق تخطيط الهاتف الطولي
- [x] حفظ checkpoint نهائي بعد اكتمال المتطلبات

## TXT master execution requirements — audit pass

- [x] مطابقة خريطة النظام مع الواقع الفعلي للمشروع المرفق وتحديد implemented/partial/missing/broken/dangerous/duplicate/outdated
- [x] تقوية سلامة العلاقات بين tenant وbusiness وprovider وservice وcustomer وrequest وsubscription server-side
- [x] بناء Permission Matrix قابلة للفرض في API/service layer دون الاعتماد على إخفاء عناصر الواجهة
- [x] جعل الاشتراكات server-controlled وعدم الثقة في trialDays/periodDays/price/permissions القادمة من العميل
- [x] تحديد فجوة billing/payment/ledger/webhook وعدم تقديم نجاح مالي وهمي
- [x] تقييم Business OS: الفروع والموظفون والمنتجات والمخزون والموردون والمبيعات والمصروفات والتقارير وCRM والتسويق
- [x] تقييم توسعة Marketplace إلى المنتجات والعروض والحجوزات والتقييمات والمفضلة والسلة وcheckout دون تكرار السوق الحالي
- [x] تثبيت تصنيفات السوق وربطها بنموذج بيانات لا بأزرار واجهة فقط
- [x] بناء أساس Search قابل للتوسع للبحث المنظم والجغرافي والمرشحات والنية
- [x] تقييم AI tenant-aware وpermission-aware مع منع الاختلاق والأدوات غير المصرح بها وprompt injection
- [x] مراجعة lifecycle للصوت: upload/validate/transcribe/process/delete temporary audio
- [x] تقييم geo/local discovery واللوجستيات وحالة التوصيل وقابلية التوسع
- [x] تقييم الإشعارات متعددة القنوات وتفضيلات الإشعار والقوالب والأحداث
- [x] تقييم advertising وanalytics/KPIs مع منع إطلاق الحملات المدفوعة دون تفويض
- [x] مراجعة RTL/accessibility/performance/database indexes/transactions/error handling/secrets
- [x] إضافة أو تحديث توثيق DATABASE_SCHEMA وSECURITY وAPI_DOCUMENTATION وDEPLOYMENT وENVIRONMENT وTESTING
- [x] توسيع الاختبارات لتشمل tenant isolation وauthorization وsubscriptions وAI safety وmarketplace وAPI
- [x] تشغيل quality gates كاملة، وتوثيق حالة Android/APK دون البناء قبل اكتمال المتطلبات
- [x] إنشاء تقرير مطابقة نهائي يوضح ما كان موجوداً وما تم إصلاحه وما أضيف وما بقي محجوباً

## TXT second audit cycle

- [x] إعادة قراءة ملف TXT والتحقق من عدم وجود تحديثات أو بنود لم تُطابق
- [x] فحص حالة المشروع بعد checkpoint السابق وتسجيل أي regression
- [x] إعادة اختبار tenant isolation وresource ownership في كل mutation الحساسة
- [x] مراجعة جميع مدخلات الاشتراك والأسعار والصلاحيات للتأكد من server control
- [x] مراجعة AI والـ voice lifecycle ومنع أي private-data leakage أو prompt injection
- [x] ربط المسارات القابلة للربط في الجوال بـ tRPC دون إظهار fallback كبيانات إنتاجية
- [x] تدقيق وجود أي hardcoded secrets أو fake success أو temporary bypass
- [x] استكمال أو تحديث وثائق المطابقة الثانية والفجوات والاعتماديات الخارجية
- [x] تشغيل typecheck وlint وunit/API tests وbuild بعد التعديلات
- [x] حفظ checkpoint جديد فقط بعد مراجعة todo.md وتثبيت نتائج الدورة الثانية

## GitHub integration audit

- [ ] استلام رابط مستودع GitHub واسم الفرع المستهدف وطريقة الوصول
- [ ] فحص حالة اتصال GitHub الحالية دون كشف أسرار أو رموز وصول
- [ ] جرد بنية المستودع الهدف ونسخ Node/Expo/React Native ومدير الحزم
- [ ] مقارنة ملفات البناء وCI وenvironment وdatabase/migrations مع AI DIGITAL SINAI
- [ ] إنشاء فرع دمج مستقل وعدم تعديل الفرع الرئيسي مباشرة
- [ ] وضع خطة merge آمنة تمنع فقد البيانات أو حذف migrations أو كسر build
- [ ] تنفيذ الدمج الانتقائي ومعالجة التعارضات مع الحفاظ على existing architecture
- [ ] تشغيل typecheck وlint وtests وbuild وmigration checks على فرع الدمج
- [ ] توثيق الملفات المدمجة والتعارضات والفجوات وخطة الرجوع
