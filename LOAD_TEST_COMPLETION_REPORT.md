# تقرير البند 7 — اختبار الحمل الواقعي

## الحالة

**IMPLEMENTED — commit مستقل، والقياس البعيد يُحسم عبر Quality Gate.** تم توسيع `scripts/load-smoke.mjs` من ثلاثة مسارات صحة عامة إلى مزيج متزامن يشمل Checkout وBooking وAI Search، إضافة إلى health/observability/app-data.

## منهجية القياس

يقبل الاختبار `LOAD_CONCURRENCY` و`LOAD_REQUESTS`، ويصدر إجمالي الطلبات والتزامن ومعدل الأخطاء وp50/p95/p99، إضافة إلى إحصاءات منفصلة لكل مسار. تُعامل استجابات HTTP الأقل من 500 كاستجابة خادم سليمة، بينما تُعد أخطاء الشبكة و5xx فشلًا. ويمكن تمرير `LOAD_AUTHORIZATION` و`LOAD_TENANT_ID` لتشغيل المسارات المحمية بهوية اختبار حقيقية.

## إعداد CI

يشغّل Quality Gate الآن:

```text
LOAD_CONCURRENCY=25 LOAD_REQUESTS=30 pnpm test:load
```

أي 750 طلبًا متزامنًا موزعة على المسارات الحرجة. لا يُثبت التقرير أرقام p50/p95 نهائية قبل اكتمال تشغيل GitHub Actions لهذا commit؛ ستظهر القيم الفعلية في سجل الخطوة وartifact إن أُضيف لاحقًا.
