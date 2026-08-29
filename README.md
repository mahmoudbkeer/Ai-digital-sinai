# AI DIGITAL SINAI

**نظام تشغيل رقمي وسوق محلي متعدد المستأجرين لشمال سيناء**، بواجهة عربية أولاً واتجاه RTL، وهوية بصرية Future Coast، وحالات جاهزية صادقة لا تعرض نجاحات أو بيانات مستخدمين وهمية.

## الحالة الحالية

يفتح المشروع على **App Mode/PWA** من `/` مع مسار `/app` المطابق، وتنقل سفلي مناسب للهاتف، كتالوج تشغيل يضم 14 قطاعاً، وتسلسل Sector → Module → Operation → Command Center. طبقة الخادم توفر health وapp-data وcommand preparation وHMAC webhook verification. عمليات الأعمال النهائية والدفع والتسوية ومزودو SMS/Push والإصدار Native ما زالت تتطلب إعدادات ومزودين حقيقيين، وتظهر في الواجهة كـ`requires-setup` أو `verified-pending` أو `deferred` حسب الحالة.

## التشغيل السريع

```bash
pnpm install
pnpm check
pnpm test
pnpm build
pnpm test:e2e
pnpm test:smoke
pnpm dev
```

أمر `dev` يشغل خادم Express للـAPI مع Vite للواجهة ويمرر مسارات `/api` عبر proxy تطويري. يستخدم الخادم `PORT` و`API_PORT` من البيئة عند الحاجة. في الإنتاج استخدم `pnpm build` ثم `pnpm start`.

## البنية

| المسار | المسؤولية |
|---|---|
| `client/src/pages/MobileApp.tsx` | shell الهاتف وApp Mode |
| `client/src/lib/operationsCatalog.ts` | قاموس القطاعات والوحدات والعمليات |
| `server/index.ts` | Express API وhealth وapp-data والأوامر والـwebhook |
| `server/commandPolicy.ts` | التحقق الخادمي من tuple القطاع/الوحدة/العملية |
| `drizzle/schema.ts` | مخطط multi-tenant وقواعد البيانات |
| `server/routers.ts` | عقود tRPC المحمية وtenant access |
| `server/*.test.ts` | اختبارات الأمان والسياسات والتوقيع |
| `e2e/` | اختبارات الهاتف والتنقل |

## الأمن والبيانات

العزل بين المستأجرين، المصادقة، الأدوار، سجلات التدقيق، والتحقق من HMAC جزء من التصميم الحالي. لا تضع أي سر في Git أو في الواجهة. أدخل القيم في مدير أسرار البيئة، وراجع [SECURITY_AUDIT.md](SECURITY_AUDIT.md) قبل تشغيل الإنتاج. يشرح [TRANSFER_GUIDE.md](TRANSFER_GUIDE.md) طريقة نقل المشروع وإكماله إلى بيئة أو برنامج آخر.

لا يعتبر webhook موثقاً معاملة مسوّاة؛ الحالة الحالية `verified-pending` مقصودة حتى يتم اعتماد adapter رسمي مع idempotency واختبارات إعادة الإرسال. لا تستخدم هذا المشروع مع بيانات إنتاجية قبل اختبار اختراق ومراجعة صلاحيات واستعادة نسخة احتياطية.

## قاعدة البيانات والتكملة

حدّث `drizzle/schema.ts` أولاً، ولّد migration، راجع SQL، ثم طبّقه في بيئة آمنة. عند إضافة عملية جديدة، أضف إجراء tRPC محمياً، tenant context، سجل تدقيق، تحقق مدخلات، اختبارات عزل وصلاحيات، وحالات واجهة loading/error/empty. لا تعرض قيمة أو مراجعة أو تقييم أو نجاحاً مالياً ما لم يأتِ من مصدر حقيقي.

## المسار Native

الإصدار الأصلي المستهدف هو مشروع Expo SDK 54 مستقل، مع نقل الأنواع وعقود tRPC وقاموس القطاعات، واستخدام `ScreenContainer` و`FlatList` وExpo Router، ثم إعداد deep links وOAuth والتوقيع وبناء APK/IPA. تغيير المسار أو تغليف PWA وحده لا يثبت جاهزية Native.

## الملفات المرجعية

اقرأ [APP_MODE.md](APP_MODE.md) لحالة PWA، و[OPERATIONS_MODEL.md](OPERATIONS_MODEL.md) للنموذج التشغيلي، و[SECURITY_AUDIT.md](SECURITY_AUDIT.md) للمخاطر والضوابط، و[TRANSFER_GUIDE.md](TRANSFER_GUIDE.md) للنقل والتكملة.
