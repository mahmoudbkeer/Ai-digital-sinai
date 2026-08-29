# TXT Master Execution — Current Audit Matrix

## منهج المطابقة

تمت قراءة ملف `pasted_content.txt` كاملاً حتى السطر 1696، ثم تمت مطابقة التعليمات مع كود مشروع Expo الحالي والطبقة النطاقية المنقولة من المصدر المرفق. المرجع هو الكود الفعلي، وليس قائمة المهام أو الوثائق القديمة.

| المجال | الواقع الحالي | التصنيف | أولوية الإصلاح |
|---|---|---|---|
| Architecture / mobile shell | Expo SDK 54 وReact Native وExpo Router وNativeWind موجودة، مع خادم Express/tRPC وقاعدة MySQL/Drizzle من المصدر | Implemented / Partial | عالية |
| Identity / roles | المستخدم يدعم `user/admin`، وعضوية tenant تدعم owner/admin/manager/staff/viewer؛ واجهة الجوال تعرض أدواراً أوسع بصرياً من النموذج الخادمي | Partial / Dangerous mismatch | عالية |
| Tenant isolation | أغلب الإجراءات تتحقق من عضوية tenant، لكن بعض عمليات الإنشاء تعتمد على IDs واردة من العميل ولا تتحقق من العلاقات الداخلية | Partial / Dangerous | حرجة |
| Relational integrity | `services` و`providers` و`requests` مرتبطة بـ tenant في schema، لكن create/update paths لا تتحقق دائماً من business/provider/customer/service belonging to the same tenant/business | Partial / Dangerous | حرجة |
| Permission engine | توجد دالتا read/write بسيطتان؛ لا توجد Permission Matrix موسعة كما يطلب TXT | Partial | عالية |
| Authentication | Manus OAuth وsession cookie موجودان، مع شاشة دخول اختيارية في الجوال | Implemented / Partial | متوسطة |
| Subscription security | `startTrial` يثق في `trialDays` القادم من client، و`activate` يثق في `periodDays`؛ هذا يخالف تحكم الخادم | Dangerous | حرجة |
| Billing / payments / ledger | لا توجد جداول أو APIs أو abstraction فعلية للمدفوعات والفواتير والاسترداد والدفتر المالي والـ webhooks | Missing | عالية، مع عدم اختلاق نجاح مالي |
| Business OS | توجد businesses/customers/providers/workspaces ومؤشرات تشغيل أولية، ولا توجد منتجات ومخزون وموردون ومبيعات ومصروفات وCRM متكاملة | Partial / Missing | عالية |
| Marketplace | Service marketplace موجود مع categories/discover/create request، ولا توجد product/cart/checkout/booking/review/favorite layers | Partial | عالية |
| Search / geo | بحث وتصفية محلية في واجهة الجوال، وحقول city/district/latitude/longitude في schema؛ لا توجد بنية بحث جغرافي/دلالي فعلية | Partial | متوسطة |
| AI | مساعد وvoice transcription وquota موجودة، لكن chat public وtenant/permission context غير كافٍ، وتنظيف الصوت المؤقت غير موجود | Partial / Dangerous | حرجة |
| Notifications | In-app notifications وdevice tokens موجودة، بينما Push/SMS/Email/templates/event bus غير مكتملة | Partial | متوسطة |
| Logistics | لا توجد جداول أو APIs للسائقين والتوصيل والتخصيص والتتبع | Missing | عالية |
| Ads / analytics | لا توجد طبقة حملات أو قياس KPIs فعلي | Missing | متوسطة |
| Database quality | توجد مفاتيح وفهارس tenant أساسية، لكن لا توجد نماذج مالية/لوجستية/إعلانية وتحقيق integrity عابر للعلاقات | Partial | عالية |
| Audit logging | `audit_logs` ومكالمات كثيرة موجودة، لكن تسجيل login/logout/AI/financial/webhook غير مكتمل | Partial | عالية |
| API quality | zod validation وprotected procedures موجودة، لكن rate limiting وidempotency وownership checks غير شاملة | Partial / Dangerous | حرجة |
| Error handling | توجد أخطاء TRPC منظمة في بعض المسارات، ويجب منع تسريب تفاصيل DB/stack في المسارات الجديدة | Partial | متوسطة |
| Secrets / environment | configuration موجودة، ولا يوجد سبب لإضافة secrets جديدة حالياً؛ يلزم فحص hardcoded values قبل الإنتاج | Partial | متوسطة |
| Testing | اختبارات وحدات للسوق والصلاحيات وحصة المساعد فقط؛ لا توجد تغطية متكاملة للعلاقات والاشتراكات والـ API | Partial | عالية |
| Documentation | `CURRENT_SYSTEM_MAP.md` و`design.md` و`todo.md` موجودة، وتحتاج وثائق أمن/API/schema/deployment/testing مطابقة نهائية | Partial | متوسطة |
| Android / APK | مشروع Expo قابل للمعاينة، ولم يتم بناء APK؛ هذا صحيح وفق قاعدة أن APK آخر مرحلة | Not started by design | لاحقة |

## قرارات التنفيذ

سيتم أولاً إصلاح المخاطر القابلة للإثبات في الخادم: التحقق من العلاقات داخل tenant، والتحكم الخادمي في مدد الاشتراك، وتوسيع Permission Matrix، وتشديد سياق المساعد. لن يتم إنشاء مدفوعات أو مخزون أو لوجستيات وهمية لمجرد وضع علامة اكتمال؛ ستوثق هذه الوحدات كفجوات وتُبنى فقط مع migrations وواجهات حقيقية قابلة للاختبار. ستظل بيانات المعاينة المحلية محصورة في preview، ولن تُقدّم على أنها مصدر إنتاجي.
