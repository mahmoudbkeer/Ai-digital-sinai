# AI DIGITAL SINAI — دليل النشر

## النطاق

هذا الدليل يصف نشر Web/API على بيئة معتمدة. لا يُنفَّذ على الإنتاج قبل موافقة النشر المستقلة، ولا يتضمن أي قيمة سرية.

## شروط ما قبل النشر

- اعتماد نطاق الإصدار: Web/API وAndroid وiOS، أو توثيق أي استبعاد.
- تحديد commit المرشح ووجود `HEAD == origin/main` وشجرة نظيفة.
- نجاح Quality Gate وFull Regression وAndroid CI وiOS CI على **نفس SHA**.
- توفر PostgreSQL الإنتاجية المنفصلة عن Staging مع SSL، و`DATABASE_URL` عبر Secret Manager فقط.
- توفر `COMMAND_CONTEXT_SECRET` و`JWT_SECRET` و`PAYMENT_WEBHOOK_SECRET` عبر مخزن الأسرار.
- توفر `CORS_ORIGINS` بقائمة صريحة للنطاقات المسموحة.
- نجاح `pnpm test:staging` و`pnpm test:staging:api` على قاعدة Staging حقيقية.
- وجود Backup حديث مشفر، manifest/checksum صالح، وRestore drill ناجح إلى Target منفصل.
- موافقة مالك المنتج والتشغيل والمالية على مزود الدفع، النطاق، RPO/RTO، ومخاطر الإطلاق.

## بناء artifact

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
```

سجّل SHA، نسخة Node.js، نسخة pnpm، وhash أو digest للـartifact أو صورة الحاوية. لا تطبع متغيرات البيئة السرية.

## النشر

1. فعّل نافذة التغيير وسجّل المسؤول عن التنفيذ والمراجع.
2. تحقّق من artifact المبني من SHA المعتمد.
3. طبّق النشر عبر المسار المعتمد فقط.
4. شغّل الخدمة بإعداد Production حقيقي؛ يمنع `ALLOW_SQLITE_PRODUCTION_TEST=1`.
5. انتظر `GET /api/health` لقياس liveness.
6. تحقق من `GET /api/readiness`؛ يجب أن تكون الحالة `ready` وأن تكون قاعدة البيانات PostgreSQL.
7. تحقّق من عدم وجود أخطاء startup أو migration غير مكتملة.
8. نفّذ smoke محدودًا على مسارات غير مالية أولًا.
9. نفّذ اختبارًا ماليًا مصرحًا في sandbox فقط؛ لا تنفذ معاملة حقيقية أثناء التحقق الأولي.
10. راقب الأخطاء، latency، database pool، Redis، queue، webhooks، وعمليات الدفع.

## فترة المراقبة الأولية

- لا تفتح كامل traffic مباشرة.
- استخدم canary أو مجموعة داخلية إن كان المسار يدعم ذلك.
- راقب 30–60 دقيقة على الأقل أو حسب SLO المعتمد.
- أوقف التوسع إذا تجاوز error rate أو latency الحدود المعتمدة.
- وثّق كل قرار وتوقيته واسم المصرح به.

## بوابة النجاح

لا يعتبر النشر ناجحًا إلا إذا نجحت health/readiness، smoke، المراقبة، وعدم وجود تسرب أسرار أو فشل في التكاملات الحرجة. عند أي فشل حرج، أوقف التوسع واتبع `ROLLBACK_RUNBOOK.md`.
