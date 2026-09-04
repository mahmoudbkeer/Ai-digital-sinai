# إعداد Google Sign-In — AI Digital Sinai

## الحالة الحالية

تكامل Google في نموذج Login على الويب موجود كواجهة وحالة تشغيلية صريحة، لكنه **غير مفعّل لتسجيل دخول حقيقي** لأن `GOOGLE_OAUTH_CLIENT_ID` غير موجود. عند الضغط على الزر تظهر الحالة `REQUIRES_SETUP`، ولا يتم إرسال بيانات اعتماد إلى Google ولا إصدار جلسة محلية.

في البناء الحالي تُقرأ قيمة الخادم `GOOGLE_OAUTH_CLIENT_ID` عبر إعداد Vite وتُمرَّر إلى الواجهة كقيمة عامة آمنة؛ غيابها يجعل الزر يبقى في حالة `REQUIRES_SETUP`. لا تضع Client Secret في الواجهة أو في المستودع.

## 1. إنشاء المشروع وشاشة الموافقة

في [Google Cloud Console](https://console.cloud.google.com/)، أنشئ مشروعًا جديدًا أو اختر مشروع AI Digital Sinai. افتح **Google Auth Platform**، ثم أكمل إعداد **Branding / OAuth consent screen** باسم التطبيق والبريد الداعم ونطاقات الاتصال المطلوبة. استخدم نطاق الموقع الفعلي فقط، ولا تضف نطاقات لا تملكها. إذا استُخدمت بيانات Google الحساسة أو نطاقات موسعة، راجع متطلبات التحقق والنشر قبل الإطلاق العام.

بعد ذلك افتح **Google Auth Platform → Clients** أو صفحة **APIs & Services → Credentials** واختر **Create OAuth client**.

## 2. Web — Google Identity Services وOne Tap

أنشئ عميل OAuth من النوع **Web application**. يجب وضع Client ID الناتج في سر/متغير بيئة خادم باسم:

```text
GOOGLE_OAUTH_CLIENT_ID=<web-client-id>.apps.googleusercontent.com
```

للتطوير المحلي، أضف إلى **Authorized JavaScript origins** كل أصل ستفتح منه الواجهة، مثل:

```text
http://localhost
http://localhost:3000
```

إذا كان منفذ المعاينة مختلفًا، أضف الأصل نفسه بذلك المنفذ، مثل `http://localhost:4173`. وللمعاينة المستضافة أضف الأصل الفعلي، مثل:

```text
https://<web-domain>
```

يجب أن يتضمن الأصل scheme وhostname، ولا تضع مسار `/login` في خانة JavaScript origins. Google One Tap يتطلب HTTPS على النطاقات المستضافة.

في النموذج الحالي يُقصد استخدام JavaScript callback، لذلك **لا توجد Authorized redirect URIs مطلوبة حاليًا**. لم يُنفَّذ بعد endpoint خادمي لتبادل authorization code أو للتحقق من Google ID token؛ لذلك لا تضف URI تخمينية وتعتبرها فعالة. عند تنفيذ التدفق الخادمي، يجب إضافة URI المطابقة حرفيًا لمسار callback الذي سيُنفَّذ، مثل:

```text
https://<web-domain>/api/auth/google/callback
http://localhost:3000/api/auth/google/callback
```

ولا يجوز استخدام URI المثالين أعلاه قبل تنفيذ المسار في الخادم. يجب أن يتحقق الخادم من ID token، بما في ذلك `iss` و`aud` و`exp` و`sub`، قبل إنشاء جلسة التطبيق.

## 3. Android — Credential Manager

أنشئ عميل OAuth مستقلًا من النوع **Android**. أدخل package name الفعلي من `android/app/build.gradle.kts`، ثم أدخل SHA-1 لشهادة التوقيع. شهادة debug وشهادة release لهما بصمتان مختلفتان؛ يجب إضافة بصمة debug للتجارب وبصمة release قبل النشر.

هذا العميل Android لا يستبدل Web client المستخدم للتحقق الخادمي. لتدفق native مع backend، احتفظ عادةً بعميل Web بوصفه **server client ID**، واستخدم عميل Android للتطبيق الأصلي. يجب إضافة Android client ID إلى إعداد Credential Manager عند تنفيذ native flow، ثم إرسال credential/token إلى الخادم للتحقق منه.

لا توجد Authorized redirect URIs عادةً لواجهة Credential Manager نفسها. إذا اختير Authorization Code flow مع callback خادمي، استخدم endpoint HTTPS الخادمي نفسه الذي ينفذه التطبيق، مثل:

```text
https://<web-domain>/api/auth/google/callback
```

ولا تسجل `http://localhost` كـredirect لتطبيق Android production.

## 4. iOS — Google Sign-In أو Sign in with Apple

أنشئ عميل OAuth مستقلًا من النوع **iOS**، وأدخل Bundle ID الفعلي من مشروع iOS. تكامل Google native يحتاج أيضًا إلى إضافة iOS Client ID في إعداد التطبيق وإضافة **reversed client ID** كـCustom URL Scheme في `Info.plist`. قيمة reversed client ID هي Client ID نفسه بعد عكس الأجزاء المفصولة بالنقاط، وتظهر أيضًا في Google Cloud ضمن إعداد iOS client.

لا توجد Authorized redirect URIs عادةً لعودة Google native عبر custom URL scheme. إذا استخدم التطبيق backend authorization code flow، فليكن callback الخادمي HTTPS ومطابقًا حرفيًا للمسار المنفذ، مثل:

```text
https://<web-domain>/api/auth/google/callback
```

على iOS يمكن تقديم **Sign in with Apple** كبديل مكافئ، لكنه يحتاج إعداد Apple Developer منفصلًا وService ID/redirect configuration خاصة به؛ لا يُعد ذلك تفعيلًا تلقائيًا لمجرد وجود Google Client ID.

## جدول ما يلزم قبل التفعيل

| المنصة | نوع OAuth client | ما يُسجّل في Google Cloud | Redirect URI في الحالة الحالية |
|---|---|---|---|
| Web | Web application | Authorized JavaScript origins للمحلي والإنتاج | لا شيء لتدفق JS callback الحالي |
| Android | Android | Package name + SHA-1 لكل توقيع | لا شيء لـCredential Manager نفسه |
| iOS | iOS | Bundle ID + iOS client/reversed client ID | لا شيء لـnative custom URL scheme |
| Backend المشترك عند إضافة code flow | Web application server client | URI callback HTTPS مطابقة حرفيًا | `/api/auth/google/callback` بعد تنفيذ endpoint فقط |

> لا تعتبر Google Sign-In جاهزًا للإنتاج حتى يُضاف Client ID الفعلي، ويُنفَّذ التحقق الخادمي من token/code، ويُختبر ربط هوية Google بحساب التطبيق وسياسات إنشاء الجلسة وإلغاءها.

## مراجع Google الرسمية

1. [Get your Google API client ID — Google Identity Services for Web](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid)
2. [About Sign in with Google — Android Developers](https://developer.android.com/identity/sign-in/credential-manager-siwg)
3. [Get started with Google Sign-In for iOS and macOS](https://developers.google.com/identity/sign-in/ios/start-integrating)
