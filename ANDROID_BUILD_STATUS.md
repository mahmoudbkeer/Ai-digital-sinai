# حالة بناء Android

## نقطة المصدر

تم بناء هذه المرحلة فوق آخر نسخة موجودة في مستودع GitHub، وهي commit `c7b66187d452566cde1281faf8675c5342661064` وقت بدء الدمج. مشروع Android موجود في `android/`، ومشروع iOS موجود في `ios/`.

## قيم SDK الفعلية

| الإعداد | القيمة | المصدر |
|---|---:|---|
| `compileSdk` | `35` | `android/app/build.gradle.kts:9` |
| `targetSdk` | `35` | `android/app/build.gradle.kts:14` |
| `minSdk` | `26` | `android/app/build.gradle.kts:13` |
| Android Gradle Plugin | `8.7.3` | `android/build.gradle.kts` |
| Kotlin | `2.0.21` | `android/build.gradle.kts` |
| Java في CI | `21` | `.github/workflows/android.yml` |

لم يتم تغيير `minSdk`. لا يوجد في Workflow رقم SDK مفروض يدوياً؛ يستخدم CI أداة `android-actions/setup-android@v3`، بينما يتولى Gradle طلب platform/build-tools المطلوبة من إعداد المشروع.

## نتيجة البناء المحلي

تم تنفيذ:

```bash
./gradlew :app:testDebugUnitTest :app:assembleDebug --no-daemon
```

النتيجة: `BUILD SUCCESSFUL`.

الملف الناتج هو `android/app/build/outputs/apk/debug/app-debug.apk`، وحجمه التقريبي `9.9 MB`.

قيمة SHA-256:

```text
c1b527ccd9fb79819c4efc6352a676119ed20850eb439ba0f41e19137d17a163
```

هذا APK هو **debug APK** موقّع بمفتاح debug ثابت موجود في بيئة المصدر لأغراض الاختبار فقط؛ لا يمثل إصداراً إنتاجياً أو APK متجر. لا يتم رفع `android/local.properties` أو مخرجات `build/` أو APK إلى GitHub.

أظهر Gradle تحذيراً غير حاجب يفيد بتغليف مكتبات native دون strip كامل (`libandroidx.graphics.path.so` و`libdatastore_shared_counter.so`)؛ لم يفشل البناء بسبب ذلك، ويجب تقييمه لاحقاً قبل release إنتاجي.

## حالة Android CI

Workflow الفعلي هو `.github/workflows/android.yml`. بعد مزامنة هذا التقرير والتعديلات، يجب انتظار تشغيل Android CI واستخراج رابط التشغيل وartifact من GitHub Actions. نجاح البناء المحلي لا يساوي نجاح CI، ولا يتم اعتبار APK جاهزاً للتوزيع قبل نجاح المسار البعيد والتحقق من artifact.

## حدود التحقق

لم يتم الادعاء باختبار التثبيت على جهاز One UI 8.5، لأن بيئة التنفيذ الحالية لا تحتوي جهاز Android متصلاً. الخطوة الصحيحة بعد تنزيل artifact هي تثبيته على جهاز الاختبار، ثم التحقق من `versionCode`, `targetSdk=35`, ABI، ومساحة التخزين، وتسجيل نتيجة `adb install` الفعلية.
