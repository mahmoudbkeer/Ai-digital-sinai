# AI DIGITAL SINAI — API Documentation

## Transport and protection

يستخدم الخادم Express مع tRPC وZod. المسارات المحمية تعتمد على جلسة Manus، بينما المسارات العامة محدودة ببيانات السوق العامة والمساعد العام. يجب أن يُعامل كل input قادماً من العميل على أنه غير موثوق.

## Current procedures

| Router | Procedures | حماية البيانات |
|---|---|---|
| `auth` | `me`, `logout` | جلسة المستخدم وcookie |
| `profile` | قراءة وتحديث الملف | مستخدم الجلسة |
| `tenant` | الإنشاء والقائمة | عضوية المستخدم |
| `business` | CRUD | membership + tenant scope |
| `customer` | CRUD | membership + tenant scope |
| `provider` | CRUD | membership + business belongs to tenant |
| `marketplace` | `categories`, `discover`, `createService` | discover عام؛ الإنشاء محمي وعلاقاته مفحوصة |
| `subscription` | plans/list/startTrial/refresh/activate/cancel | membership؛ الخطة والمدة يحددها الخادم |
| `request` | list/create/updateStatus | membership + customer/service/request tenant checks |
| `workspaces` | list/tasks/create/invite/device tokens | membership + workspace scope |
| `admin` | dashboard/plans/categories/catalog | platform admin + audit log |
| `assistant` | chat/voiceTranscribe | knowledge عامة، quota، validation وحجم صوت محدود |

## Important input rules

`subscription.startTrial` يقبل `tenantId` و`planId` فقط. يقرأ الخادم `trialDays` من الخطة النشطة. `subscription.activate` يقبل `tenantId` و`subscriptionId` فقط ويستخدم دورة 30 يوماً خادمية. لا يجوز إعادة إضافة `trialDays` أو `periodDays` إلى client input.

إنشاء provider يتطلب business من نفس tenant. إنشاء service يتطلب business من نفس tenant، وprovider من نفس business عند إرساله. إنشاء request يتطلب customer وservice من نفس tenant، وتحديث status يتطلب request موجوداً داخل tenant.

## Not yet available

لا توجد حالياً procedures حقيقية للمدفوعات أو الفواتير أو refunds أو ledger أو webhooks أو delivery أو campaigns أو analytics. لا ينبغي للواجهة أو الخادم إرجاع نجاح وهمي لهذه الوحدات؛ تُضاف لاحقاً عبر schema/migrations واختبارات تكامل حقيقية.
