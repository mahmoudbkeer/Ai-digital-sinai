export type BusinessOsModuleId =
  | "retail-products"
  | "retail-inventory"
  | "retail-sales"
  | "retail-customers"
  | "retail-suppliers";

type ApiRow = Record<string, unknown>;

export type BusinessOsData = {
  moduleId: BusinessOsModuleId;
  endpoint: string;
  rows: ApiRow[];
};

export type BusinessOsApiError = Error & { status?: number };
export type BusinessOsMutation = {
  label: string;
  fields: Array<{ name: string; label: string; type?: "text" | "number"; required?: boolean; placeholder?: string }>;
  endpoint: string;
  method: "POST" | "PATCH";
  buildBody: (values: Record<string, string>, context: { businessId?: string; branchId?: string }) => Record<string, unknown>;
};

const config: Record<BusinessOsModuleId, { endpoint: string; keys: string[]; mutation: BusinessOsMutation }> = {
  "retail-products": {
    endpoint: "/api/platform/products",
    keys: ["products"],
    mutation: {
      label: "إضافة منتج",
      fields: [
        { name: "sku", label: "SKU", required: true, placeholder: "SKU-001" },
        { name: "name", label: "اسم المنتج", required: true, placeholder: "منتج جديد" },
        { name: "priceCents", label: "السعر بالسنت", type: "number", required: true, placeholder: "1500" },
      ],
      endpoint: "/api/platform/products",
      method: "POST",
      buildBody: (values, context) => ({ businessId: context.businessId, sku: values.sku, name: values.name, priceCents: Number(values.priceCents) }),
    },
  },
  "retail-inventory": {
    endpoint: "/api/platform/inventory",
    keys: ["stock"],
    mutation: {
      label: "تسجيل حركة مخزون",
      fields: [
        { name: "productId", label: "معرّف المنتج", required: true, placeholder: "انسخ ID من سجل المنتج" },
        { name: "quantityDelta", label: "التغيير في الكمية", type: "number", required: true, placeholder: "5 أو -1" },
        { name: "reason", label: "سبب الحركة", required: true, placeholder: "استلام / تسوية" },
      ],
      endpoint: "/api/platform/inventory/movements",
      method: "POST",
      buildBody: (values, context) => ({ branchId: context.branchId, productId: values.productId, quantityDelta: Number(values.quantityDelta), reason: values.reason, idempotencyKey: `ui-inventory-${Date.now()}-${Math.random().toString(36).slice(2)}` }),
    },
  },
  "retail-sales": {
    endpoint: "/api/platform/orders",
    keys: ["orders"],
    mutation: {
      label: "تحديث حالة طلب",
      fields: [
        { name: "orderId", label: "معرّف الطلب", required: true, placeholder: "انسخ ID من سجل الطلب" },
        { name: "state", label: "الحالة الجديدة", required: true, placeholder: "CONFIRMED أو COMPLETED" },
      ],
      endpoint: "/api/platform/orders/:orderId/state",
      method: "PATCH",
      buildBody: (values) => ({ state: values.state }),
    },
  },
  "retail-customers": {
    endpoint: "/api/platform/customers",
    keys: ["customers"],
    mutation: {
      label: "إضافة عميل",
      fields: [
        { name: "name", label: "اسم العميل", required: true, placeholder: "اسم العميل" },
        { name: "phone", label: "الهاتف", placeholder: "010..." },
        { name: "email", label: "البريد الإلكتروني", placeholder: "customer@example.test" },
      ],
      endpoint: "/api/platform/customers",
      method: "POST",
      buildBody: (values) => ({ name: values.name, phone: values.phone, email: values.email }),
    },
  },
  "retail-suppliers": {
    endpoint: "/api/platform/suppliers",
    keys: ["suppliers"],
    mutation: {
      label: "إضافة مورد",
      fields: [
        { name: "name", label: "اسم المورد", required: true, placeholder: "مورد جديد" },
        { name: "phone", label: "الهاتف", placeholder: "010..." },
      ],
      endpoint: "/api/platform/suppliers",
      method: "POST",
      buildBody: (values, context) => ({ businessId: context.businessId, name: values.name, phone: values.phone }),
    },
  },
};

const responseRows = (payload: ApiRow, keys: string[]) => {
  for (const key of keys) if (Array.isArray(payload[key])) return payload[key] as ApiRow[];
  return [];
};

export async function loadBusinessOsModule(moduleId: BusinessOsModuleId, headers: Record<string, string>): Promise<BusinessOsData> {
  const { endpoint, keys } = config[moduleId];
  const response = await fetch(endpoint, { headers: { Accept: "application/json", ...headers } });
  const payload = await response.json().catch(() => ({})) as ApiRow;
  if (!response.ok) {
    const error = new Error(typeof payload.message === "string" ? payload.message : "تعذر تحميل بيانات الوحدة.") as BusinessOsApiError;
    error.status = response.status;
    throw error;
  }
  return { moduleId, endpoint, rows: responseRows(payload, keys) };
}

export async function mutateBusinessOsModule(moduleId: BusinessOsModuleId, values: Record<string, string>, headers: Record<string, string>, context: { businessId?: string; branchId?: string }) {
  const mutation = config[moduleId].mutation;
  const endpoint = mutation.endpoint.replace(":orderId", encodeURIComponent(values.orderId ?? ""));
  const response = await fetch(endpoint, { method: mutation.method, headers: { "Content-Type": "application/json", Accept: "application/json", ...headers }, body: JSON.stringify(mutation.buildBody(values, context)) });
  const payload = await response.json().catch(() => ({})) as ApiRow;
  if (!response.ok) {
    const error = new Error(typeof payload.message === "string" ? payload.message : "تعذر تنفيذ العملية.") as BusinessOsApiError;
    error.status = response.status;
    throw error;
  }
  return payload;
}

export function getBusinessOsMutation(moduleId: BusinessOsModuleId) { return config[moduleId].mutation; }
export function isBusinessOsModuleId(moduleId: string): moduleId is BusinessOsModuleId { return moduleId in config; }
export function displayBusinessOsValue(value: unknown) { if (value === null || value === undefined || value === "") return "—"; if (typeof value === "object") return JSON.stringify(value); return String(value); }
