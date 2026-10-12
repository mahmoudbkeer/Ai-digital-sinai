# AI DIGITAL SINAI — خطة الخدمات الخارجية والتكلفة

**تاريخ التحقق من الأسعار:** 2026-10-12

هذه الخطة لا تنشئ حسابات أو موارد ولا تنفذ أي شراء. الأسعار تقريبية مبنية على الصفحات الرسمية في قسم المراجع، وقد تتغير حسب المنطقة والضريبة وحجم الاستخدام واتفاقية العميل.

## الخلاصة التنفيذية

التوصية التشغيلية هي استخدام PostgreSQL مُدار عبر Neon، Redis مُدار عبر Upstash، Object Storage عبر Cloudflare R2، FCM للإشعارات الفورية، SendGrid للبريد، OpenAI أو مزود متوافق للـAI/Embeddings، Sentry للمراقبة، وCloudflare WAF للحماية الطرفية. يبقى Kashier وSMS واختبار الاختراق خاضعين لاتفاقية أو عرض سعر أو إعداد خارجي.

لا توجد تكلفة إجمالية دقيقة قبل معرفة حجم الطلبات، حجم التخزين، عدد رسائل SMS، استهلاك نماذج AI، وعدد أعضاء الفريق. لذلك تُعرض نطاقات لا تُعامل كعرض سعر.

## مصفوفة الخدمات

| الخدمة | اعتماد الكود | الاتصال مثبت؟ | الحد الأدنى للإطلاق | التكلفة الشهرية التقديرية | الرسوم المتغيرة/الحدود | البديل | القرار المطلوب |
|---|---|---|---|---:|---|---|---|
| PostgreSQL Staging/Production — Neon Launch | `IMPLEMENTED_BUT_REQUIRES_SETUP` | لا؛ المثبت PostgreSQL محلي داخل CI | قاعدة Staging منفصلة، SSL، migrations، backup/restore | $0–$15 منخفض؛ $15–$100 نموذجي؛ أعلى حسب الاستخدام | Launch: $0.106/CU-hour و$0.35/GB-month؛ لا حد أدنى معلن للخطة المدفوعة | Supabase أو RDS؛ يحتاجان تسعيرًا وتكوينًا مستقلًا | اختيار المزود وإنشاء Staging بعد موافقة مالية |
| Redis/Queue — Upstash | `IMPLEMENTED_BUT_REQUIRES_SETUP` | لا | TLS/ACL، reconnect، queue durability، worker دائم | $0–$10 منخفض؛ $10–$100 نموذجي؛ أعلى حسب HA/الحجم | Pay-as-you-go: $0.20 لكل 100K command، أول 1GB تخزين مجاني، bandwidth إضافي حسب الاستخدام؛ Fixed يبدأ من $10 | Redis مُدار آخر أو Redis ذاتي؛ التشغيل الذاتي ينقل عبء HA | تحديد هل Prod Pack/HA مطلوب |
| Object Storage — Cloudflare R2 | `PARTIALLY_IMPLEMENTED` | لا؛ signed URL contract فقط | bucket خاص، upload/download فعلي، lifecycle وعزل المستأجرين | $0–$5 منخفض؛ $5–$50 نموذجي؛ أعلى مع العمليات | $0.015/GB-month؛ Class A $4.50/million؛ Class B $0.36/million؛ egress مجاني؛ حدود مجانية شهرية | AWS S3؛ أوسع منظومة لكن egress ورسوم مختلفة | اعتماد R2 أو بديل وتحديد retention |
| FCM Push | `IMPLEMENTED_BUT_REQUIRES_SETUP` | لا؛ HTTP/OAuth mocked | Firebase project، service account، device tokens، اختبار رسالة | $0 لخدمة FCM نفسها | قد تظهر تكلفة خدمات Firebase الأخرى؛ لا تكلفة لاستخدام Cloud Messaging حسب الصفحة الرسمية | APNs مباشرة لـiOS، لكن يزيد التعقيد | إبقاء FCM ضمن النطاق وتوفير مشروع اختبار |
| Transactional Email — SendGrid Essentials | `IMPLEMENTED_BUT_REQUIRES_SETUP` | لا؛ contract mocked | sender/domain verification، API key، sandbox delivery | $0 trial؛ من $19.95 مدفوعًا | Essentials 50K/100K plans، overage per email، taxes؛ free trial 100/day لمدة 60 يومًا | Amazon SES أو Postmark؛ يحتاجان تكاملًا/تحققًا | اختيار مزود البريد واعتماد sender domain |
| SMS — Twilio Egypt | `MISSING` | لا يوجد adapter فعلي | لا يدخل الإنتاج قبل تنفيذ adapter واختبارات delivery/idempotency | لا يوجد حد ثابت؛ رسوم الرسائل حسب الوجهة | مصر: $0.3959 لكل SMS للرقم الدولي/Alphanumeric Sender ID، لكل segment، وقد توجد carrier fees ورسوم رقم | مزود محلي مصري؛ قد يكون أنسب تشغيليًا لكن يتطلب عرض سعر | إما استبعاده رسميًا من الإصدار أو تمويل تنفيذ مزود واختباره |
| AI/Embeddings — OpenAI API أو متوافق | `IMPLEMENTED_BUT_REQUIRES_SETUP` | لا؛ mock/contract فقط | provider request حي في Staging، quotas، timeout، data policy، vector store | $0 في حال عدم التفعيل؛ تقريبًا $5–$50 لاستخدام منخفض؛ أعلى حسب tokens | التسعير لكل 1M tokens، ويختلف حسب النموذج/الإدخال/الإخراج؛ embeddings والبحث قد تضيف تخزينًا | مزود متوافق أو self-hosted؛ self-hosted يزيد التشغيل والامتثال | اعتماد سياسة البيانات وحدود الإنفاق والنموذج |
| Secret Manager — Doppler Team أو بديل | `MISSING` في الكود | لا | read path، RBAC، rotation، audit log، emergency revoke | Developer: $0 حتى 3 مستخدمين؛ Team: $21/user/month؛ Enterprise عرض سعر | المقاعد والاحتفاظ وسياق compliance؛ لا يعتبر `.env` مدير أسرار إنتاجيًا | AWS Secrets Manager/GCP Secret Manager/Azure Key Vault | اختيار manager وربط التطبيق أو منصة النشر |
| Monitoring — Sentry | `PARTIALLY_IMPLEMENTED` | لا منصة مراقبة مثبتة | error tracking، alerts، PII scrubbing، retention، on-call | Developer $0؛ Team $26/month؛ Business $80/month | quota ثم pay-as-you-go؛ Team يتضمن 50K errors/month في الصفحة | OpenTelemetry/Grafana أو منصة السحابة | اختيار مستوى المراقبة وقناة التنبيه |
| WAF — Cloudflare WAF | `NOT_VERIFIED` خارجيًا | لا | DNS/edge، managed rules، rate limiting، API protection | Cloudflare يعرض WAF بدءًا من $5/month على صفحة الخطط؛ خطط Pro/Business تعرض $20/$25 و$200 حسب الفوترة/المنتج | بعض قدرات WAF والـrules قد تتطلب خطة أعلى أو Enterprise؛ تحقق من checkout | AWS WAF أو WAF منصة الاستضافة | تأكيد نطاق الحماية والسعر النهائي |
| DAST/Pentest | `NOT_VERIFIED` | لا | DAST مصرح على Staging، pentest مستقل، معالجة P0/P1 | أدوات مفتوحة المصدر: $0 ترخيص؛ منصات تجارية مثل Invicti وBurp Enterprise: عرض سعر | تكلفة pentest تعتمد على النطاق وعدد الأهداف وعمق الاختبار | OWASP ZAP + جهة اختبار مستقلة | اعتماد ميزانية ونطاق الاختبار |
| Kashier | `IMPLEMENTED_BUT_REQUIRES_SETUP` | لا؛ contract/mock فقط | sandbox merchant، webhook، refund، reconciliation، permission evidence | يتطلب عرض سعر/اتفاقية تاجر؛ لم أجد جدولًا عامًا موثوقًا | رسوم المعاملات والـsettlement تعتمد على اتفاقية التاجر والبلد/طريقة الدفع | مزود دفع آخر يتطلب تعديلًا واختبارات جديدة | الحصول على شروط sandbox والرسوم رسميًا قبل التفعيل |

## تقدير الإجمالي

### سيناريو Internal/Staging منخفض التكلفة

يفترض استخدام خطط مجانية أو usage-based، وعدم تفعيل SMS أو Kashier production أو AI عالي الاستهلاك، واستخدام أدوات DAST مفتوحة المصدر. التكلفة الثابتة قد تكون تقريبًا **$0–$30 شهريًا** قبل الضرائب والرسوم المتغيرة، مع بقاء Kashier وSMS وpentest الخارجي خارج الرقم لأنها تتطلب عرض سعر أو تعتمد على الاستخدام.

### سيناريو Production صغير

يفترض Neon Launch، Upstash Fixed منخفض أو Pay-as-you-go مع حدود إنفاق، R2، SendGrid Essentials، Sentry Team، Cloudflare WAF، Secret Manager Team لفريق صغير، واستخدام AI منخفض. التقدير التخطيطي هو **نحو $100–$250 شهريًا قبل الرسوم المتغيرة**. يضاف إليه SMS حسب عدد segments، ورسوم Kashier حسب الاتفاقية، وأي pentest أو دعم مؤسسي.

### سيناريو نمو/امتثال

قد يتجاوز **$500 شهريًا** بسهولة عند زيادة PostgreSQL/Redis، رفع الاحتفاظ والمراقبة، إضافة HA، زيادة AI، أو تفعيل دعم مؤسسي وpentest تجاري. Kashier وSMS وعقود الأمن قد ترفع التكلفة أكثر، ولا يصح اختزالها في رقم دون عروض أسعار.

هذه المجاميع ليست موافقة إنفاق وليست ضمانًا للفواتير. يجب وضع budgets/alerts وقيود usage قبل التفعيل.

## التصنيف النهائي للإصدار الموحد

- **إلزامية للإنتاج Web/API:** PostgreSQL، Secret Manager أو آلية مكافئة معتمدة، monitoring/alerts، backup/restore، WAF أو حماية مكافئة، وDAST/pentest حسب اعتماد المخاطر.
- **إلزامية إذا كانت الوظيفة معلنة:** Kashier للدفع، Redis إذا كانت queue/notifications تعتمد عليه، Object Storage إذا كانت الملفات ضمن النطاق، FCM للبوش، SendGrid للبريد، AI/Embeddings لوظائف RAG.
- **مشروطة أو قابلة للاستبعاد:** SMS؛ لا يوجد adapter فعلي الآن، ويجب توثيق استبعاده وآثاره بدل اعتباره جاهزًا.
- **إلزامية للنطاق Native:** release signing، device verification، push/deep links، privacy/store requirements لكل من Android وiOS.

## نقطة التوقف المالية

لا تنشئ حسابًا مدفوعًا أو موردًا أو اشتراكًا أو خطة أعلى. القرار المطلوب من مالك المشروع هو:

1. اعتماد مزودي Neon/Redis/R2 والبريد والمراقبة والأسرار، أو اختيار البدائل.
2. تحديد سقف شهري ابتدائي وميزانية متغيرة لـSMS وAI والدفع.
3. تحديد ما إذا كانت SMS ضمن الإصدار أو `Excluded from Release`.
4. اعتماد ميزانية DAST/pentest خارجي.
5. بعد الموافقة فقط تُنفذ إجراءات إنشاء Staging والربط عبر القنوات الآمنة.

## مراجع رسمية

[1]: https://neon.com/pricing "Neon pricing"
[2]: https://upstash.com/pricing/redis "Upstash Redis pricing"
[3]: https://developers.cloudflare.com/r2/pricing/ "Cloudflare R2 pricing"
[4]: https://www.twilio.com/en-us/products/email-api/pricing "Twilio SendGrid Email API pricing"
[5]: https://firebase.google.com/products/cloud-messaging "Firebase Cloud Messaging"
[6]: https://developers.openai.com/api/docs/pricing "OpenAI API pricing"
[7]: https://www.twilio.com/en-us/sms/pricing/eg "Twilio Egypt SMS pricing"
[8]: https://sentry.io/pricing/ "Sentry pricing"
[9]: https://www.cloudflare.com/products/waf/ "Cloudflare WAF"
[10]: https://www.cloudflare.com/plans/ "Cloudflare plans"
[11]: https://www.doppler.com/pricing "Doppler pricing"
[12]: https://www.kashier.io/ "Kashier official site"
[13]: https://www.kashier.io/faqs "Kashier FAQs"
[14]: https://www.invicti.com/pricing/ "Invicti pricing"
[15]: https://portswigger.net/burp/enterprise/pricing "Burp Suite Enterprise pricing"
[16]: https://neon.com/docs/introduction/branching "Neon branching and restore"
