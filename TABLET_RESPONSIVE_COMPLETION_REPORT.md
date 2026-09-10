# تقرير البند 9 — Tablets

## الحالة

**IMPLEMENTED — commit مستقل.** تم تحسين الشاشات الأصلية الموجودة فقط، دون إنشاء تطبيق جديد.

## Android

- جعل `MainActivity` قابلة لإعادة التحجيم عبر `android:resizeableActivity="true"`.
- وضع حد عرض مركزي قدره 960dp للمحتوى مع الحفاظ على نفس مسار Marketplace وLogin على الهاتف واللوحي.
- الإجراء لا يغيّر منطق المصادقة أو واجهات API.

## iOS

- استخدام `horizontalSizeClass` في `MarketplaceView`.
- على الشاشات ذات الحجم regular، يثبت المحتوى عند حد 960pt ويتمركز؛ وعلى الهاتف يبقى بعرض الشاشة.
- الحفاظ على نفس NavigationStack والواجهات الحالية.

## التحقق

تم فحص التعديلات مع `git diff --check`. التحقق التنفيذي النهائي يعتمد على Android CI وiOS CI، إذ لا تتوفر Android SDK أو Swift محليًا في Sandbox.
