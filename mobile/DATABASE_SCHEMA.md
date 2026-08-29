# AI DIGITAL SINAI — Database Reality

## Existing schema

المخطط الحالي يستخدم MySQL مع Drizzle ويحتوي على `users`, `user_profiles`, `tenants`, `tenant_members`, `businesses`, `provider_profiles`, `customers`, `service_categories`, `services`, `service_requests`, `subscription_plans`, `subscriptions`, `notifications`, `notification_preferences`, `device_tokens`, `audit_logs`, `workspaces`, `workspace_members`, و`workspace_tasks`.

## Integrity rules

الجداول النطاقية تحمل `tenantId` وفهارس tenant/status حيث يلزم. الخدمة مرتبطة بمنشأة وprovider اختياري، والطلب مرتبط بـ customer وservice. طبقة البيانات والراوتر يتحققان الآن من أن business/provider/customer/service/request/subscription يطابق tenant، وأن provider يطابق business قبل الإنشاء.

## Missing schema intentionally not faked

لا توجد بعد جداول `payments`, `transactions`, `invoices`, `refunds`, `payment_failures`, `webhooks`, `ledger_accounts`, `ledger_entries`, `drivers`, `deliveries`, `delivery_zones`, `campaigns`, `ad_impressions`, `favorites`, `cart`, `checkout`, `bookings`, `reviews`, أو analytics events. إضافة هذه الكيانات تتطلب migrations آمنة، مفاتيح وفهارس tenant، معاملات atomic، idempotency، واختبارات تكامل قبل استخدامها في الإنتاج.

## Migration policy

لم تُنفذ أي عملية destructive أو حذف بيانات. أي توسعة مستقبلية يجب أن تأتي عبر migration قابلة للمراجعة، وتُختبر على نسخة staging قبل الإنتاج.
