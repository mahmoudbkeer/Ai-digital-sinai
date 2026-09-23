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
export type BusinessOsProduct = {
  id: string; business_id: string; sku: string; name: string; description?: string | null;
  category?: string | null; price_cents: number; currency: string; status: "active" | "draft" | "archived";
  created_at: number; updated_at: number;
};
export type BusinessOsInventoryRow = {
  branch_id: string;
  product_id: string;
  quantity: number;
  sku: string;
  name: string;
  updated_at: number;
};
export type BusinessOsCustomer = { id: string; name: string; phone?: string | null; email?: string | null; created_at: number };
export type BusinessOsCustomerHistory = {
  customer: BusinessOsCustomer;
  orders: Array<{ id: string; state: string; total_cents: number; currency: string; created_at: number }>;
  interactions: Array<{ id: string; interaction_type: string; note: string; user_id: string; created_at: number }>;
  tags: Array<{ id: string; name: string }>;
};
export type SalesOrder = {
  id: string; business_id: string; branch_id: string; customer_id?: string | null;
  customer_name?: string | null; customer_phone?: string | null; state: string;
  subtotal_cents: number; discount_cents: number; tax_cents: number; total_cents: number;
  currency: string; created_at: number; updated_at: number;
};
export type SalesOrderDetail = {
  order: SalesOrder & { customer_email?: string | null; created_by: string };
  items: Array<{ id: string; product_id: string; product_name: string; sku?: string | null; quantity: number; unit_price_cents: number; line_total_cents: number }>;
  inventoryMovements: Array<{ id: string; product_id: string; quantity_delta: number; reason: string; idempotency_key: string; created_at: number }>;
  invoice: { id: string; invoice_number: string; status: string; subtotal_cents: number; tax_cents: number; total_cents: number; currency: string; issued_at: number } | null;
  ledger: Array<{ id: string; reference_type: string; reference_id: string; memo: string; created_at: number }>;
  payments: Array<{ id: string; provider: string; amount_cents: number; currency: string; status: string; provider_reference?: string | null; created_at: number; updated_at: number }>;
  audit: Array<{ id: string; action: string; actor_user_id?: string | null; request_id?: string | null; metadata_json: string; created_at: number }>;
  allowedTransitions: string[];
};
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

async function productRequest<T>(endpoint: string, init: RequestInit, headers: Record<string, string>): Promise<T> {
  const response = await fetch(endpoint, { ...init, headers: { Accept: "application/json", ...headers, ...(init.headers ?? {}) } });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const error = new Error(typeof payload.message === "string" ? payload.message : "تعذر تنفيذ عملية المنتج.") as BusinessOsApiError;
    error.status = response.status; throw error;
  }
  return payload as T;
}

export async function loadBusinessOsProducts(headers: Record<string, string>, filters: { query?: string; status?: string } = {}) {
  const params = new URLSearchParams();
  if (filters.query) params.set("query", filters.query);
  if (filters.status) params.set("status", filters.status);
  const payload = await productRequest<{ products?: BusinessOsProduct[] }>(`/api/platform/products${params.toString() ? `?${params}` : ""}`, {}, headers);
  return payload.products ?? [];
}

export async function loadBusinessOsInventory(headers: Record<string, string>) {
  const payload = await productRequest<{ stock?: BusinessOsInventoryRow[] }>('/api/platform/inventory', {}, headers);
  return payload.stock ?? [];
}

export async function loadBusinessOsCustomers(headers: Record<string, string>, query = "") {
  const params = query.trim() ? `?query=${encodeURIComponent(query.trim())}` : "";
  const payload = await productRequest<{ customers?: BusinessOsCustomer[] }>(`/api/platform/customers${params}`, {}, headers);
  return payload.customers ?? [];
}

export async function createBusinessOsCustomer(values: { name: string; phone?: string; email?: string }, headers: Record<string, string>) {
  return productRequest<{ customerId: string }>("/api/platform/customers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) }, headers);
}

export async function loadBusinessOsCustomerHistory(customerId: string, headers: Record<string, string>) {
  return productRequest<BusinessOsCustomerHistory>(`/api/platform/customers/${encodeURIComponent(customerId)}/history`, {}, headers);
}

export async function addBusinessOsCustomerInteraction(customerId: string, values: { interactionType: string; note: string }, headers: Record<string, string>) {
  return productRequest<{ interactionId: string }>(`/api/platform/customers/${encodeURIComponent(customerId)}/interactions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) }, headers);
}

export async function addBusinessOsCustomerTag(customerId: string, name: string, headers: Record<string, string>) {
  return productRequest<{ tagId: string }>(`/api/platform/customers/${encodeURIComponent(customerId)}/tags`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) }, headers);
}

export async function loadSalesOrders(headers: Record<string, string>, filters: { query?: string; status?: string } = {}) {
  const params = new URLSearchParams();
  if (filters.query) params.set("query", filters.query);
  if (filters.status) params.set("status", filters.status);
  const payload = await productRequest<{ orders?: SalesOrder[] }>(`/api/platform/orders${params.toString() ? `?${params}` : ""}`, {}, headers);
  return payload.orders ?? [];
}

export async function loadSalesOrder(orderId: string, headers: Record<string, string>) {
  return productRequest<SalesOrderDetail>(`/api/platform/orders/${encodeURIComponent(orderId)}`, {}, headers);
}

export async function updateSalesOrderState(orderId: string, state: string, headers: Record<string, string>) {
  return productRequest<{ orderId: string; state: string }>(`/api/platform/orders/${encodeURIComponent(orderId)}/state`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ state }) }, headers);
}

export async function createBusinessOsSalesReturn(values: { orderId: string; orderItemId: string; productId: string; quantity: number; unitRefundCents: number; reason: string }, headers: Record<string, string>) {
  return productRequest<{ returnId: string; totalCents: number; status: string; replay: boolean }>("/api/platform/returns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...values, items: [{ orderItemId: values.orderItemId, productId: values.productId, quantity: values.quantity, unitRefundCents: values.unitRefundCents }], idempotencyKey: `ui-sales-return-${Date.now()}-${window.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}` }) }, headers);
}

export async function createBusinessOsInventoryMovement(values: { branchId: string; productId: string; quantityDelta: number; reason: string }, headers: Record<string, string>) {
  const idempotencyKey = `ui-inventory-${Date.now()}-${window.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
  return productRequest<{ movementId: string; quantity: number; replay: boolean }>("/api/platform/inventory/movements", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...values, idempotencyKey }) }, headers);
}

export async function loadBusinessOsProduct(productId: string, headers: Record<string, string>, includeArchived = false) {
  const payload = await productRequest<{ product: BusinessOsProduct }>(`/api/platform/products/${encodeURIComponent(productId)}${includeArchived ? "?includeArchived=true" : ""}`, {}, headers);
  return payload.product;
}

export async function updateBusinessOsProduct(productId: string, values: Partial<Pick<BusinessOsProduct, "sku" | "name" | "description" | "category" | "price_cents">>, headers: Record<string, string>) {
  const body = { ...values, description: values.description?.trim() || null, category: values.category?.trim() || null, priceCents: values.price_cents };
  return productRequest<{ productId: string; status: string }>(`/api/platform/products/${encodeURIComponent(productId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, headers);
}

export async function setBusinessOsProductStatus(productId: string, status: "active" | "draft" | "archived", headers: Record<string, string>) {
  return productRequest<{ productId: string; status: string }>(`/api/platform/products/${encodeURIComponent(productId)}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) }, headers);
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

export type BusinessOsSupplier = { id: string; business_id?: string | null; name: string; phone?: string | null; email?: string | null; status: string; created_at: number; updated_at: number };
export type BusinessOsSupplierHistory = {
  supplier: BusinessOsSupplier;
  purchases: Array<{ id: string; status: string; subtotal_cents: number; tax_cents: number; total_cents: number; created_at: number; updated_at: number }>;
  audit: Array<{ id: string; action: string; resource_type: string; resource_id: string; created_at: number }>;
};

export async function loadBusinessOsSuppliers(headers: Record<string, string>) {
  const payload = await productRequest<{ suppliers?: BusinessOsSupplier[] }>("/api/platform/suppliers", {}, headers);
  return payload.suppliers ?? [];
}

export async function createBusinessOsSupplier(values: { businessId?: string; name: string; phone?: string; email?: string }, headers: Record<string, string>) {
  return productRequest<{ supplierId: string }>("/api/platform/suppliers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) }, headers);
}

export async function loadBusinessOsSupplierHistory(supplierId: string, headers: Record<string, string>) {
  return productRequest<BusinessOsSupplierHistory>(`/api/platform/suppliers/${encodeURIComponent(supplierId)}/history`, {}, headers);
}

export type BusinessOsPurchase = { id: string; business_id: string; branch_id: string; supplier_id: string; supplier_name: string; status: string; subtotal_cents: number; tax_cents: number; total_cents: number; created_at: number; updated_at: number };
export type BusinessOsPurchaseDetail = {
  purchase: BusinessOsPurchase;
  items: Array<{ id: string; product_id: string; product_name: string; sku: string; quantity: number; unit_cost_cents: number; line_total_cents: number; received_quantity: number; remaining_quantity: number }>;
  audit: Array<{ id: string; action: string; resource_type: string; resource_id: string; metadata_json: string; created_at: number }>;
};
export async function loadBusinessOsPurchases(headers: Record<string, string>) {
  const payload = await productRequest<{ purchases?: BusinessOsPurchase[] }>("/api/platform/purchases", {}, headers);
  return payload.purchases ?? [];
}
export async function createBusinessOsPurchase(values: { businessId: string; branchId: string; supplierId: string; productId: string; quantity: number; unitCostCents: number; receiveImmediately?: boolean }, headers: Record<string, string>) {
  return productRequest<{ purchaseId: string; status: string }>("/api/platform/purchases", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...values, items: [{ productId: values.productId, quantity: values.quantity, unitCostCents: values.unitCostCents }], idempotencyKey: `ui-purchase-${Date.now()}-${window.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}` }) }, headers);
}
export async function loadBusinessOsPurchase(purchaseId: string, headers: Record<string, string>) {
  return productRequest<BusinessOsPurchaseDetail>(`/api/platform/purchases/${encodeURIComponent(purchaseId)}`, {}, headers);
}
export async function receiveBusinessOsPurchase(purchaseId: string, purchaseItemId: string, quantity: number, headers: Record<string, string>) {
  return productRequest<{ purchaseId: string; receivedQuantity: number; receiptStatus: string; replay: boolean }>(`/api/platform/purchases/${encodeURIComponent(purchaseId)}/receipts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: [{ purchaseItemId, quantity }], idempotencyKey: `ui-receipt-${Date.now()}-${window.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}` }) }, headers);
}
export async function createBusinessOsSupplierReturn(values: { purchaseId: string; purchaseItemId: string; quantity: number; reason: string }, headers: Record<string, string>) {
  return productRequest<{ supplierReturnId: string; totalCents: number; replay: boolean }>("/api/platform/supplier-returns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...values, items: [{ purchaseItemId: values.purchaseItemId, quantity: values.quantity }], idempotencyKey: `ui-supplier-return-${Date.now()}-${window.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}` }) }, headers);
}
