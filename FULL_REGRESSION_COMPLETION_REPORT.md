# تقرير البند 8 — Regression شامل نهائي

## الحالة

**IMPLEMENTED — workflow مستقل، والنتيجة النهائية تعتمد على GitHub Actions.** أضيفت بوابة `Full Regression Acceptance` بثلاثة jobs متوازية ثم job تجميعي لا ينجح إلا بنجاح Web وAndroid وiOS معًا.

## التغطية

- **Web:** build، Playwright browser setup، وسكربت `acceptance-web-full.mjs` الذي يغطي Identity وTenant context وMarketplace وOnboarding والطلب والمخزون والدفع boundary والتوصيل والإشعارات والاشتراك وAI وAnalytics.
- **Android:** unit tests وdebug APK assembly مع رفع APK كـartifact.
- **iOS:** XCTest وgeneric iOS Simulator package build.
- **Final gate:** يطبع `COMPLETED` فقط إذا كانت نتائج jobs الثلاثة `success`.

## حدود الدليل

هذا workflow يثبت اختبار CI القابل لإعادة التشغيل، لكنه لا يثبت جهازًا فعليًا أو تفعيل مزودي الدفع الخارجيين أو نشر المتاجر. تبقى هذه العناصر external setup وليست نجاحًا محليًا مزيفًا.

## الملف

`.github/workflows/full-regression.yml`
