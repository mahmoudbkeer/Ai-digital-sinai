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

const responseRows = (payload: ApiRow, keys: string[]) => {
  for (const key of keys) {
    if (Array.isArray(payload[key])) return payload[key] as ApiRow[];
  }
  return [];
};

export async function loadBusinessOsModule(
  moduleId: BusinessOsModuleId,
  headers: Record<string, string>,
): Promise<BusinessOsData> {
  const config: Record<BusinessOsModuleId, { endpoint: string; keys: string[] }> = {
    "retail-products": { endpoint: "/api/platform/products", keys: ["products"] },
    "retail-inventory": { endpoint: "/api/platform/inventory", keys: ["stock"] },
    "retail-sales": { endpoint: "/api/platform/orders", keys: ["orders"] },
    "retail-customers": { endpoint: "/api/platform/customers", keys: ["customers"] },
    "retail-suppliers": { endpoint: "/api/platform/suppliers", keys: ["suppliers"] },
  };
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

export function isBusinessOsModuleId(moduleId: string): moduleId is BusinessOsModuleId {
  return ["retail-products", "retail-inventory", "retail-sales", "retail-customers", "retail-suppliers"].includes(moduleId);
}

export function displayBusinessOsValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
