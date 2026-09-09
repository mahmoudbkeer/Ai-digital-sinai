# تقرير البند 3 — عمق Business OS

## الحالة

**COMPLETED — implementation and focused regression verified.** تم استكمال الوظائف الناقصة فقط فوق الوحدات القائمة، مع الحفاظ على عزل المستأجر وربط العمليات المالية بالـLedger.

| المجال | ما أُنجز | دليل الاختبار |
|---|---|---|
| Returns | `POST /api/platform/returns`، تحقق من order item والكمية المرتجعة، إعادة المخزون، وتسجيل `SALES_RETURN` بقيود متوازنة، وتحديث الطلب إلى `REFUNDED` عند الرد الكامل | regression داخل `server/businessOs.test.ts` |
| Reconciliation | `POST /api/platform/reconciliations` يحسب الرصيد الفعلي من قيود الحساب للفترة ويخزن `MATCHED` أو `VARIANCE` مع قيمة الانحراف | regression داخل `server/businessOs.test.ts` |
| Procurement | `receiveImmediately:false` ينشئ شراءً مسودة؛ `POST /api/platform/purchases/:purchaseId/receipts` يدعم الاستلام الجزئي ويمنع تجاوز الكمية | regression يثبت `PARTIALLY_RECEIVED` والاستلام الفعلي |
| Supplier returns | `POST /api/platform/supplier-returns` يرد الكمية إلى المورد، يخصم المخزون مع منع الرصيد السالب، ويسجل `SUPPLIER_RETURN` في الـLedger | regression داخل `server/businessOs.test.ts` |
| CRM segmentation | `POST/GET /api/platform/customer-segments` يبني شرائح من بيانات العملاء والطلبات الفعلية ويعيد الأعضاء المطابقين | regression داخل `server/businessOs.test.ts` |
| Detailed reports | `/reports/profit` و`/reports/inventory` و`/reports/customers` تقرأ من orders/ledger/expenses/inventory/customers الحقيقية | regression يثبت HTTP 200 بعد entitlement |

## البيانات والترحيل

أضيفت migration `0011_business_os_depth` لنوعي SQLite وPostgreSQL، مع rollback، والجداول الجديدة ذات مفاتيح tenant وقيود foreign key وفهارس نطاقية. مسارات الكتابة محمية بصلاحيات `order.refund` أو `purchase.manage` أو `ledger.manage` أو `crm.manage`، ومسارات القراءة بصلاحيات التقرير/CRM.

## التحقق الفعلي

- `pnpm check`: **PASS**.
- `pnpm exec vitest run server/businessOs.test.ts`: **PASS — 5/5 tests**.
- Regression الجديد غطى supplier return، partial receipt، sales return، reconciliation، segment membership، والتقارير التفصيلية.
- تم إصلاح فشل حقيقي أثناء التحقق: خصم مرتجع المورد كان يكتب delta سالبًا مباشرة في جدول مخزون يمنع القيم السالبة؛ أصبح الآن decrement محميًا بعد التحقق من الرصيد المتاح.
