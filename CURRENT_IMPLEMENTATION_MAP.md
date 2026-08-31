# خريطة التنفيذ الحالية — AI DIGITAL SINAI

**خط الأساس:** `38d8f52` على `main`
**نطاق هذه الدفعة:** نقل مسارات الأعمال إلى data plane غير متزامنة، وإضافة وحدات Business OS/CRM/Procurement/POS/Reports، مع اختبارات SQLite قابلة للتكرار.

## الحالة المثبتة

| المجال             | التنفيذ الفعلي                                                            | الدليل                                                              | الحالة                   |
| ------------------ | ------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------ |
| Identity وTenant   | جلسات scrypt، revoke، recovery، membership و`x-tenant-id`                 | `server/platform.ts`، اختبارات auth والعزل                          | منفذ                     |
| Data plane         | عقد Async موحد يدعم SQLite وPostgreSQL، parameter binding، معاملات، pool  | `server/dataPlane.ts`، `server/postgres.ts`                         | منفذ برمجياً             |
| PostgreSQL startup | migration lock، تطبيق migrations 1 و2، readiness قبل استقبال الطلبات      | `server/index.ts`، `server/postgres.ts`                             | منفذ، يحتاج staging فعلي |
| Core commerce      | products/services/cart/checkout/orders/invoices/payments                  | `server/platform.ts`، الاختبارات الحالية                            | منفذ جزئياً              |
| Ledger             | قيود sale/cancellation/purchase/expense/POS payment متوازنة tenant-scoped | `postBalancedJournal` ومسارات المال                                 | منفذ جزئياً              |
| Subscription       | خطط، entitlements، اشتراك trial، feature gate للتقارير والتحليلات         | `/subscriptions`، `/subscription/entitlements`، `assertEntitlement` | منفذ                     |
| Employees          | employee registry، ربط مستخدم/فرع، PIN hash وصلاحيات                      | `POST/GET /api/platform/employees`                                  | منفذ أساسي               |
| CRM                | العملاء، التاريخ، التفاعلات، الوسوم                                       | `customers` و`customer_interactions` و`customer_tags`               | منفذ أساسي               |
| Procurement        | suppliers، purchases، items، inventory receipt، AP journal، idempotency   | `POST/GET /api/platform/suppliers` و`purchases`                     | منفذ أساسي               |
| Expenses           | تسجيل المصروف وتكويد قيد 5000/1000                                        | `POST/GET /api/platform/expenses`                                   | منفذ أساسي               |
| POS                | وردية، حركة نقدية، ربط بيع بطلب، دفع، إغلاق                               | `/pos/sessions/*` و`pos_sales`                                      | منفذ أساسي               |
| Marketplace        | عروض، reviews مرتبطة بعميل، favorites                                     | `/offers` و`/marketplace/*`                                         | منفذ أساسي               |
| Reports            | تقرير مبيعات/مصروفات/مخزون/عملاء/موظفين/فروع مصدره قاعدة البيانات         | `/reports/summary` مع entitlement                                   | منفذ أساسي               |
| Audit              | سجل عمليات لكل المسارات الحساسة الجديدة                                   | `audit_logs` و`recordAudit`                                         | منفذ                     |
| Payment providers  | provider adapter لا يعلن نجاحاً بلا credential/contract                   | `server/payment.ts` وwebhook                                        | يحتاج إعداد خارجي        |
| AI/RAG/Agents      | lexical tenant-scoped fallback وpolicy؛ لا يوجد vector provider حقيقي     | `server/platform.ts`                                                | منفذ جزئياً              |
| Redis/queues       | غير مربوط                                                                 | لا يوجد connector داخل المستودع                                     | متبقٍ                    |
| Object storage/CDN | غير مربوط                                                                 | لا يوجد provider فعلي                                               | متبقٍ                    |
| Email/SMS/Push     | abstraction/REQUIRES_SETUP فقط                                            | `server/notifications.ts`                                           | يحتاج إعداد خارجي        |

## اختبارات هذه الدفعة

تم تشغيل الأوامر التالية بنجاح:

```text
pnpm check
pnpm test
```

النتيجة المثبتة: **7 ملفات اختبار، 29 اختباراً ناجحاً**. يختبر `server/businessOs.test.ts` دورة شراء وتحديث مخزون وCRM وطلب وPOS ومصروف ومراجعة ومفضلة وتقرير، إضافة إلى رفض التقرير قبل وجود entitlement.

## نقطة التحقق المطلوبة قبل الإنتاج

لم تُنفذ مطالبة PostgreSQL staging داخل هذه البيئة لعدم توفر `DATABASE_URL` قابل للوصول. لذلك يجب قبل الإنتاج تشغيل migration على قاعدة staging، ثم تشغيل contract/integration tests نفسها على PostgreSQL، والتحقق من `GET /api/readiness`، وbackup/restore، وtenant isolation، وfinancial balance. هذه ليست فجوة في wiring البرمجي؛ إنها خطوة تحقق تشغيلية خارجية.
