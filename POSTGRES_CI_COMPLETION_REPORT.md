# تقرير البند 6 — PostgreSQL داخل CI

## الحالة

**IMPLEMENTED — commit مستقل، والتحقق البعيد يبدأ بعد الدفع.** أضيفت خدمة PostgreSQL 16 فعلية داخل `quality.yml` باستخدام GitHub Actions service container، مع health check وانتظار جاهزية الحاوية.

## ما يغطيه الاختبار

يُشغّل Quality Gate الاختبار `pnpm test:staging:api` على `DATABASE_URL` حقيقي داخل PostgreSQL، ويغطي تسجيل هويتين، منع تبديل tenant، إنشاء المنتج والمخزون والطلب، عزل AI Search بين المستأجرين، وحدود الدفع، مع التحقق من سلامة القيود المالية.

## الدليل المحلي

- تم فحص workflow وصلاحيته بنيويًا.
- اختبار PostgreSQL الحرج موجود في `scripts/postgres-critical-smoke.mjs` ويشترط PostgreSQL صراحة.
- الدليل البعيد النهائي هو تشغيل Quality Gate بعد هذا commit؛ لا يُسجّل PASS قبل ظهور نتيجة GitHub Actions فعلية.

## الملفات

- `.github/workflows/quality.yml`
- `scripts/postgres-critical-smoke.mjs`
- `scripts/postgres-staging-smoke.mjs`

## Commit وCI

سيُدفع هذا التغيير كـcommit مستقل. سيُسجّل رابط تشغيل Quality Gate بعد اكتماله.
