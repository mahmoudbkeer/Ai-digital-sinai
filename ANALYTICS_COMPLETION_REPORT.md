# تقرير البند 4 — Analytics العمق

## الحالة

**Implementation complete locally; commit and CI handoff pending.** أضيفت مقاييس Cohorts وRetention وCAC وLTV من بيانات قاعدة البيانات الفعلية، دون توليد بيانات وهمية أو fallback رقمي.

| المقياس | المسار | المصدر والمنهجية |
|---|---|---|
| Cohorts | `GET /api/platform/analytics/cohorts` | أول طلب مكتمل أو حجز مكتمل لكل subject، ثم النشاط المكتمل حسب شهر UTC، مع فصل مصدر `orders` عن `bookings` |
| Retention | `GET /api/platform/analytics/retention` | حجم cohort من العملاء ذوي الطلب المكتمل، وعدد العملاء النشطين في كل شهر لاحق، مع `retention_rate` محسوبة من البيانات الفعلية |
| CAC | `GET /api/platform/analytics/cac` | `ad_campaigns.spent_cents` الفعلي مقسومًا على العملاء الجدد ذوي أول طلب مكتمل؛ يعيد CAC الشهري وblended CAC ويصرّح بعدم استخدام spend مُنمذج |
| LTV | `GET /api/platform/analytics/ltv` | إيرادات الطلبات المكتملة مجمعة لكل عميل؛ historical LTV، ومتوسط قيمة الطلب، ومتوسط الطلبات/عميل، وprojected LTV = AOV × observed orders/customer |

جميع المسارات محمية بـ`report.read` و`analytics.read` وتطبق `tenant_id` في كل استعلام. استُخدمت Orders وBookings وad_campaigns الفعلية، مع الحفاظ على ناتج فارغ/صفر عندما لا توجد بيانات، بدل اختلاق قيمة تقديرية.

## التحقق الفعلي

- `pnpm check`: **PASS**.
- `pnpm exec vitest run server/businessOs.test.ts -t "analytics"`: **PASS — 2/2 tests**.
- Regression يثبت إنشاء طلب مكتمل فعليًا، وقراءة المقاييس الأربعة، وقيم LTV الحقيقية، وعزل tenant ثانٍ بنتيجة صفر.
- أول فشل كان توافق TypeScript مع target ES5 عند استخدام Map iterators؛ استُبدل ذلك بـ`Array.from` و`Map.forEach` ثم نجح الفحص.
- فشل fixture أولي بسبب عدم تفعيل entitlement للـtenant الثاني؛ أضيف الاشتراك في الاختبار بدل تخفيف حماية المسار.
