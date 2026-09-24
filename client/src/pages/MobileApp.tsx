import { useEffect, useState, type FormEvent } from "react";
import { Bell, Home, LayoutDashboard, Search, ShoppingCart, UserRound } from "lucide-react";
import { getLoginUrl } from "@/const";
import BusinessOsCustomersPanel from "@/components/BusinessOsCustomersPanel";
import BusinessOsSuppliersPanel from "@/components/BusinessOsSuppliersPanel";
import BusinessOsProcurementPanel from "@/components/BusinessOsProcurementPanel";
import BusinessOsSalesReturnsPanel from "@/components/BusinessOsSalesReturnsPanel";
import BusinessOsInvoicesPanel from "@/components/BusinessOsInvoicesPanel";
import BusinessOsExpensesPanel from "@/components/BusinessOsExpensesPanel";
import BusinessOsProfitPanel from "@/components/BusinessOsProfitPanel";
import BusinessOsReconciliationPanel from "@/components/BusinessOsReconciliationPanel";
import { sectors, statusLabel, type Operation, type Sector, type SectorModule } from "@/lib/operationsCatalog";
import { createBusinessOsInventoryMovement, displayBusinessOsValue, getBusinessOsMutation, isBusinessOsModuleId, loadBusinessOsInventory, loadBusinessOsModule, loadBusinessOsProduct, loadBusinessOsProducts, loadSalesOrder, loadSalesOrders, mutateBusinessOsModule, setBusinessOsProductStatus, updateBusinessOsProduct, updateSalesOrderState, type BusinessOsData, type BusinessOsInventoryRow, type BusinessOsProduct, type SalesOrder, type SalesOrderDetail } from "@/lib/businessOsApi";
import { useLocale } from "@/i18n";

const tabs = [
  { id: "home", label: "الرئيسية", icon: Home },
  { id: "market", label: "السوق", icon: Search },
  { id: "work", label: "التشغيل", icon: LayoutDashboard },
  { id: "account", label: "حسابي", icon: UserRound },
] as const;
type TabId = (typeof tabs)[number]["id"];
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
type RoadmapItem = { id: string; phase: string; title: string; status: "ready" | "requires-setup" | "deferred"; detail: string };
type ServiceState = { health: "loading" | "ok" | "error"; readiness: "loading" | "ready" | "degraded"; observability: "loading" | "ok" | "error"; uptimeSeconds: number | null };
type Offering = { id: string; business_id: string; name: string; description?: string | null; category?: string | null; price_cents: number; offering_type: "PRODUCT" | "SERVICE"; duration_minutes?: number | null };
type CartItem = { product_id: string; name: string; quantity: number; unit_price_cents: number; line_total_cents: number };
type PlatformContext = { businessId?: string; branchId?: string; role?: string };
type AdminData = { users: Array<{ id: string; email: string; status: string }>; tenants: Array<{ id: string; name: string; status: string }>; audit: Array<{ action: string; resource_type: string; created_at: number }>; flags: Array<{ key: string; enabled: number }>; applications: Array<{ id: string; tenant_name: string; name: string; category: string; phone: string; publication_status: string }> };
type Availability = { id: string; provider_user_id: string; branch_id: string; starts_at: number; ends_at: number };

export default function MobileApp() {
  const { locale, setLocale, t } = useLocale();
  const [tab, setTab] = useState<TabId>("home");
  const [apiState, setApiState] = useState<"loading" | "ready" | "error">("loading");
  const [dataMode, setDataMode] = useState<"not-connected" | "connected">("not-connected");
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [roadmap, setRoadmap] = useState<RoadmapItem[]>([]);
  const [activeSector, setActiveSector] = useState<Sector | null>(null);
  const [activeModule, setActiveModule] = useState<SectorModule | null>(null);
  const [selectedOperation, setSelectedOperation] = useState<Operation | null>(null);
  const [commandMessage, setCommandMessage] = useState("");
  const [moduleData, setModuleData] = useState<BusinessOsData | null>(null);
  const [moduleDataState, setModuleDataState] = useState<"idle" | "loading" | "ready" | "auth" | "error">("idle");
  const [moduleDataMessage, setModuleDataMessage] = useState("");
  const [mutationValues, setMutationValues] = useState<Record<string, string>>({});
  const [mutationState, setMutationState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [productQuery, setProductQuery] = useState("");
  const [productStatus, setProductStatus] = useState("active");
  const [productDetail, setProductDetail] = useState<BusinessOsProduct | null>(null);
  const [productEdit, setProductEdit] = useState<Record<string, string>>({});
  const [productMessage, setProductMessage] = useState("");
  const [inventoryRows, setInventoryRows] = useState<BusinessOsInventoryRow[]>([]);
  const [inventoryQuery, setInventoryQuery] = useState("");
  const [inventoryMovement, setInventoryMovement] = useState({ productId: "", quantityDelta: "", reason: "" });
  const [inventoryMessage, setInventoryMessage] = useState("");
  const [salesOrders, setSalesOrders] = useState<SalesOrder[]>([]);
  const [salesOrderQuery, setSalesOrderQuery] = useState("");
  const [salesOrderStatus, setSalesOrderStatus] = useState("");
  const [salesOrderDetail, setSalesOrderDetail] = useState<SalesOrderDetail | null>(null);
  const [salesOrderState, setSalesOrderState] = useState<"idle" | "loading" | "ready" | "auth" | "error">("idle");
  const [salesOrderMessage, setSalesOrderMessage] = useState("");
  const [salesOrderMutation, setSalesOrderMutation] = useState("idle");
  const [serviceState, setServiceState] = useState<ServiceState>({ health: "loading", readiness: "loading", observability: "loading", uptimeSeconds: null });
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [cartTotal, setCartTotal] = useState(0);
  const [platformContext, setPlatformContext] = useState<PlatformContext>({});
  const [marketState, setMarketState] = useState<"idle" | "loading" | "ready" | "auth" | "error">("idle");
  const [marketMessage, setMarketMessage] = useState("");
  const [checkoutState, setCheckoutState] = useState<"idle" | "loading" | "created" | "error">("idle");
  const [lastOrderId, setLastOrderId] = useState<string | null>(null);
  const [lastOrderTotal, setLastOrderTotal] = useState(0);
  const [paymentRequestState, setPaymentRequestState] = useState<"idle" | "loading" | "ready" | "requires_setup" | "error">("idle");
  const [paymentRequestUrl, setPaymentRequestUrl] = useState<string | null>(null);
  const [adminData, setAdminData] = useState<AdminData | null>(null);
  const [adminState, setAdminState] = useState<"idle" | "loading" | "ready" | "denied" | "error">("idle");
  const [serviceSlots, setServiceSlots] = useState<Availability[]>([]);
  const [selectedService, setSelectedService] = useState<Offering | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [session, setSession] = useState<{ token: string; tenantId: string } | null>(null);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [onboarding, setOnboarding] = useState({ name: "", category: "", district: "", phone: "" });
  const [onboardingMessage, setOnboardingMessage] = useState("");
  const authHeaders = (): Record<string, string> => session ? { authorization: `Bearer ${session.token}`, "x-tenant-id": session.tenantId } : {};
  const money = (cents: number) => `${(cents / 100).toFixed(2)} ج.م`;
  const loadMarketplace = async () => {
    setMarketState("loading"); setMarketMessage("");
    try {
      const [meResponse, productsResponse, servicesResponse, cartResponse] = await Promise.all([
        fetch("/api/platform/me", { headers: authHeaders() }), fetch("/api/platform/products", { headers: authHeaders() }), fetch("/api/platform/services", { headers: authHeaders() }), fetch("/api/platform/cart", { headers: authHeaders() }),
      ]);
      if ([meResponse, productsResponse, servicesResponse, cartResponse].some((response) => response.status === 401)) { setMarketState("auth"); setMarketMessage("سجّل الدخول لعرض السوق المعزول وإتمام الطلب."); return; }
      if (!productsResponse.ok || !servicesResponse.ok || !cartResponse.ok) throw new Error("marketplace request failed");
      const me = await meResponse.json() as { context?: PlatformContext };
      const products = await productsResponse.json() as { products?: Array<Omit<Offering, "offering_type">> };
      const services = await servicesResponse.json() as { services?: Array<Omit<Offering, "offering_type">> };
      const cart = await cartResponse.json() as { items?: CartItem[]; totalCents?: number };
      setPlatformContext(me.context ?? {});
      setOfferings([...(products.products ?? []).map((item) => ({ ...item, offering_type: "PRODUCT" as const })), ...(services.services ?? []).map((item) => ({ ...item, offering_type: "SERVICE" as const }))]);
      setCartItems(cart.items ?? []); setCartTotal(cart.totalCents ?? 0); setMarketState("ready");
    } catch { setMarketState("error"); setMarketMessage("تعذر تحميل بيانات السوق الحقيقية. أعد المحاولة."); }
  };
  const addToCart = async (product: Offering) => {
    if (product.offering_type !== "PRODUCT") { setMarketMessage("جارٍ تحميل المواعيد المتاحة للخدمة..."); const response = await fetch(`/api/platform/services/${product.id}/availability`, { headers: authHeaders() }); const payload = await response.json() as { availability?: Availability[] }; setSelectedService(product); setServiceSlots(response.ok ? payload.availability ?? [] : []); return; }
    if (!platformContext.branchId) { setMarketMessage("لا يوجد فرع مصادق عليه في سياق المستخدم لإتمام الطلب."); return; }
    setMarketMessage("جارٍ إضافة المنتج إلى السلة الحقيقية...");
    const response = await fetch("/api/platform/cart/items", { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ productId: product.id, quantity: 1, branchId: platformContext.branchId }) });
    if (!response.ok) { setMarketMessage("رفض الخادم إضافة المنتج؛ لم يتم إنشاء سلة وهمية."); return; }
    await loadMarketplace(); setMarketMessage("تمت الإضافة إلى السلة المعزولة لهذا المستخدم.");
  };
  const bookService = async (slot: Availability) => {
    if (!selectedService) return;
    setMarketMessage("جارٍ إنشاء حجز الخدمة وربطه بطلب وفاتورة دفتر الأستاذ...");
    const response = await fetch("/api/platform/service-bookings", { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ serviceId: selectedService.id, availabilityId: slot.id, branchId: slot.branch_id, idempotencyKey: `booking-${selectedService.id}-${slot.id}` }) });
    const result = await response.json() as { bookingId?: string; orderId?: string; status?: string; message?: string };
    setMarketMessage(response.ok && result.bookingId ? `تم إنشاء الحجز ${result.bookingId} وربطه بالطلب ${result.orderId} بالحالة ${result.status}.` : result.message ?? "تعذر إنشاء الحجز من الخادم.");
    if (response.ok) setServiceSlots([]);
  };
  const checkout = async () => {
    if (!platformContext.branchId || !cartItems.length) return;
    setCheckoutState("loading");
    const response = await fetch("/api/platform/cart/checkout", { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ branchId: platformContext.branchId }) });
    const result = await response.json() as { orderId?: string; state?: string; message?: string };
    if (!response.ok || !result.orderId) { setCheckoutState("error"); setMarketMessage(result.message ?? "تعذر إنشاء الطلب من السلة."); return; }
    setCheckoutState("created"); setLastOrderId(result.orderId); setLastOrderTotal(cartTotal); setPaymentRequestState("idle"); setPaymentRequestUrl(null); setCartItems([]); setCartTotal(0); setMarketMessage(`تم إنشاء الطلب الحقيقي ${result.orderId} بالحالة ${result.state ?? "PENDING"}.`);
  };
  const createPaymentRequest = async () => {
    if (!lastOrderId) return;
    setPaymentRequestState("loading");
    const idempotencyKey = `pos-kashier-${lastOrderId}`;
    try {
      const response = await fetch("/api/platform/payment-requests", { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ orderId: lastOrderId, provider: "kashier", paymentRequest: true, amountCents: lastOrderTotal, idempotencyKey }) });
      const result = await response.json() as { status?: string; paymentUrl?: string; message?: string };
      if (result.paymentUrl) { setPaymentRequestUrl(result.paymentUrl); setPaymentRequestState("ready"); setMarketMessage("تم إنشاء رابط دفع Kashier للعميل؛ لا تتم أي تسوية قبل الدفع والتحقق من webhook."); return; }
      if (result.status === "REQUIRES_SETUP") { setPaymentRequestState("requires_setup"); setMarketMessage("Kashier غير مهيأ بعد: أضف KASHIER_MID وKASHIER_API_KEY قبل إنشاء رابط حقيقي."); return; }
      setPaymentRequestState("error"); setMarketMessage(result.message ?? "تعذر إنشاء طلب الدفع.");
    } catch { setPaymentRequestState("error"); setMarketMessage("تعذر الوصول إلى خدمة الدفع."); }
  };
  const loadAdmin = async () => {
    setAdminState("loading");
    try {
      const responses = await Promise.all(["users?limit=20", "tenants?limit=20", "audit?limit=20", "feature-flags"].map((path) => fetch(`/api/platform/admin/${path}`, { headers: authHeaders() })));
      const applicationsResponse = await fetch("/api/platform/admin/business-onboarding", { headers: authHeaders() });
      if (responses.some((response) => response.status === 401 || response.status === 403)) { setAdminState("denied"); return; }
      if (responses.some((response) => !response.ok)) throw new Error("admin request failed");
      const [users, tenants, audit, flags, applications] = await Promise.all([...responses, applicationsResponse].map((response) => response.json()));
      setAdminData({ users: users.users ?? [], tenants: tenants.tenants ?? [], audit: audit.audit ?? [], flags: flags.flags ?? [], applications: applications.applications ?? [] });
      setAdminState("ready");
    } catch { setAdminState("error"); }
  };

  const submitOnboarding = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setOnboardingMessage("جارٍ إرسال الطلب للمراجعة...");
    if (!session) { setOnboardingMessage("سجّل الدخول أولًا لإرسال نشاطك بأمان."); setLoginOpen(true); return; }
    const response = await fetch("/api/platform/marketplace/onboarding", { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify(onboarding) });
    const result = await response.json() as { message?: string; publicationStatus?: string };
    setOnboardingMessage(response.ok ? `${result.message ?? "تم الإرسال"} الحالة: ${result.publicationStatus}.` : result.message ?? "تعذر إرسال الطلب.");
    if (response.ok) setOnboarding({ name: "", category: "", district: "", phone: "" });
  };

  const reviewBusiness = async (businessId: string, publicationStatus: "APPROVED" | "REJECTED") => {
    const response = await fetch(`/api/platform/admin/business-onboarding/${businessId}`, { method: "PATCH", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ publicationStatus }) });
    if (response.ok) await loadAdmin();
  };

  const loadApi = () => {
    setApiState("loading");
    const controller = new AbortController();
    Promise.all([
      fetch("/api/health", { signal: controller.signal }),
      fetch("/api/app-data", { signal: controller.signal }),
      fetch("/api/readiness", { signal: controller.signal }),
      fetch("/api/observability", { signal: controller.signal }),
    ]).then(async ([health, appData, readiness, observability]) => {
      if (!health.ok || !appData.ok) throw new Error("api check failed");
      const payload = await appData.json() as { businessData?: string; roadmap?: RoadmapItem[] };
      const readinessPayload = await readiness.json() as { status?: "ready" | "degraded" };
      const observabilityPayload = await observability.json() as { uptimeSeconds?: number };
      setDataMode(payload.businessData === "connected" ? "connected" : "not-connected");
      setRoadmap(payload.roadmap ?? []);
      setServiceState({ health: "ok", readiness: readinessPayload.status ?? (readiness.ok ? "ready" : "degraded"), observability: observability.ok ? "ok" : "error", uptimeSeconds: observabilityPayload.uptimeSeconds ?? null });
      setApiState("ready");
    }).catch((error: unknown) => {
      if ((error as { name?: string }).name !== "AbortError") {
        setApiState("error");
        setServiceState((current) => ({ ...current, health: "error", observability: "error" }));
      }
    });
    return () => controller.abort();
  };

  useEffect(() => {
    const requestedTab = new URLSearchParams(window.location.search).get("tab");
    if (requestedTab === "market" || requestedTab === "work" || requestedTab === "account") setTab(requestedTab);
  }, []);

  useEffect(() => {
    const handleInstall = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPromptEvent); };
    window.addEventListener("beforeinstallprompt", handleInstall);
    const storedToken = localStorage.getItem("platform_token");
    const storedTenantId = localStorage.getItem("platform_tenant_id");
    if (storedToken && storedTenantId) setSession({ token: storedToken, tenantId: storedTenantId });
    const cleanup = loadApi();
    return () => { cleanup?.(); window.removeEventListener("beforeinstallprompt", handleInstall); };
  }, []);

  useEffect(() => {
    if (!session) return;
    fetch("/api/platform/me", { headers: authHeaders() }).then(async (response) => {
      if (response.ok) {
        const payload = await response.json() as { context?: PlatformContext };
        setPlatformContext(payload.context ?? {});
      }
    }).catch(() => undefined);
  }, [session]);

  const installApp = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };
  const login = () => {
    const portal = import.meta.env.VITE_OAUTH_PORTAL_URL;
    if (portal) { window.location.href = getLoginUrl(); return; }
    setLoginError(""); setLoginOpen(true); setTab("account");
  };
  const submitLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setLoginError("");
    const response = await fetch("/api/platform/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: loginEmail, password: loginPassword }) });
    const result = await response.json() as { token?: string; tenants?: Array<{ tenant_id: string }>; message?: string };
    if (!response.ok || !result.token) { setLoginError(result.message ?? "تعذر تسجيل الدخول من الخادم."); return; }
    const tenantId = result.tenants?.[0]?.tenant_id;
    if (!tenantId) { setLoginError("الحساب لا يملك عضوية مستأجر صالحة."); return; }
    const nextSession = { token: result.token, tenantId }; localStorage.setItem("platform_token", result.token); localStorage.setItem("platform_tenant_id", tenantId); setSession(nextSession); setLoginOpen(false); setLoginPassword(""); setMarketState("idle"); setMarketMessage("تم تسجيل الدخول؛ حمّل السوق لقراءة بيانات المستأجر.");
  };
  const go = (next: TabId) => setTab(next);
  const loadModuleData = async (module: SectorModule) => {
    setModuleData(null); setModuleDataMessage("");
    if (!isBusinessOsModuleId(module.id)) { setModuleDataState("idle"); return; }
    setModuleDataState("loading");
    try {
      if (module.id === "retail-inventory") {
        setInventoryRows(await loadBusinessOsInventory(authHeaders()));
        setModuleData({ moduleId: module.id, endpoint: "/api/platform/inventory", rows: [] });
      } else {
        const data = module.id === "retail-products"
          ? { moduleId: module.id, endpoint: "/api/platform/products", rows: await loadBusinessOsProducts(authHeaders(), { query: productQuery, status: productStatus }) }
          : await loadBusinessOsModule(module.id, authHeaders());
        setModuleData(data);
      }
      setModuleDataState("ready");
    } catch (error) {
      const status = (error as { status?: number }).status;
      setModuleDataState(status === 401 || status === 403 ? "auth" : "error");
      setModuleDataMessage(status === 401 ? "سجّل الدخول لقراءة بيانات مساحة العمل." : status === 403 ? "لا تملك الصلاحية المطلوبة لهذا النطاق." : (error as Error).message);
    }
  };
  const refreshProducts = async () => { if (activeModule?.id === "retail-products") await loadModuleData(activeModule); };
  const refreshInventory = async () => { if (activeModule?.id === "retail-inventory") await loadModuleData(activeModule); };
  const refreshSalesOrders = async () => {
    setSalesOrderState("loading"); setSalesOrderMessage("");
    try { setSalesOrders(await loadSalesOrders(authHeaders(), { query: salesOrderQuery.trim(), status: salesOrderStatus })); setSalesOrderState("ready"); }
    catch (error) { const status = (error as { status?: number }).status; setSalesOrderState(status === 401 || status === 403 ? "auth" : "error"); setSalesOrderMessage(status === 403 ? "لا تملك صلاحية قراءة الطلبات." : status === 401 ? "سجّل الدخول لقراءة الطلبات." : (error as Error).message); }
  };
  const openSalesOrder = async (orderId: string) => { setSalesOrderMessage("جارٍ تحميل تفاصيل الطلب من الخادم..."); try { setSalesOrderDetail(await loadSalesOrder(orderId, authHeaders())); setSalesOrderMessage(""); } catch (error) { setSalesOrderMessage((error as Error).message); } };
  const transitionSalesOrder = async (state: string) => {
    if (!salesOrderDetail) return;
    setSalesOrderMutation(state);
    try { await updateSalesOrderState(salesOrderDetail.order.id, state, authHeaders()); setSalesOrderDetail(await loadSalesOrder(salesOrderDetail.order.id, authHeaders())); await refreshSalesOrders(); setSalesOrderMessage(`تم تحديث الطلب إلى ${state} من الخادم وتسجيل العملية.`); }
    catch (error) { setSalesOrderMessage((error as Error).message); }
    finally { setSalesOrderMutation("idle"); }
  };
  const submitInventoryMovement = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setInventoryMessage("جارٍ تسجيل حركة المخزون...");
    try {
      let effectiveContext = platformContext;
      if (!effectiveContext.branchId) {
        const branchesResponse = await fetch("/api/platform/branches", { cache: "no-store", headers: authHeaders() });
        const branchesPayload = await branchesResponse.json() as { branches?: Array<{ id: string }> };
        const branchId = branchesPayload.branches?.[0]?.id;
        if (!branchesResponse.ok || !branchId) throw new Error("لا يوجد فرع مصادق عليه في سياق المستخدم الحالي.");
        effectiveContext = { ...effectiveContext, branchId };
        setPlatformContext(effectiveContext);
      }
      const branchId = effectiveContext.branchId;
      if (!branchId) throw new Error("لا يوجد فرع مصادق عليه في سياق المستخدم الحالي.");
      const result = await createBusinessOsInventoryMovement({ branchId, productId: inventoryMovement.productId, quantityDelta: Number(inventoryMovement.quantityDelta), reason: inventoryMovement.reason }, authHeaders());
      setInventoryMessage(result.replay ? "تمت إعادة نتيجة حركة سابقة بسبب Idempotency." : `تم تسجيل الحركة. الرصيد الجديد: ${result.quantity}.`);
      setInventoryMovement({ productId: "", quantityDelta: "", reason: "" });
      await refreshInventory();
    } catch (error) {
      const status = (error as { status?: number }).status;
      setInventoryMessage(status === 401 ? "سجّل الدخول لتنفيذ العملية." : status === 403 ? "لا تملك صلاحية إدارة المخزون." : (error as Error).message);
    }
  };
  const openProductDetail = async (productId: string) => { try { setProductMessage("جارٍ تحميل تفاصيل المنتج..."); setProductDetail(await loadBusinessOsProduct(productId, authHeaders())); setProductEdit({}); setProductMessage(""); } catch (error) { setProductMessage((error as Error).message); } };
  const submitProductEdit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (!productDetail) return; setProductMessage("جارٍ حفظ التعديل..."); try { await updateBusinessOsProduct(productDetail.id, { name: productEdit.name, description: productEdit.description, category: productEdit.category, price_cents: Number(productEdit.price_cents ?? productDetail.price_cents) }, authHeaders()); setProductMessage("تم تعديل المنتج وتسجيل العملية في Audit."); setProductDetail(null); await refreshProducts(); } catch (error) { setProductMessage((error as Error).message); } };
  const archiveProduct = async (productId: string) => { setProductMessage("جارٍ أرشفة المنتج..."); try { await setBusinessOsProductStatus(productId, "archived", authHeaders()); setProductMessage("تمت أرشفة المنتج دون حذف تاريخه."); setProductDetail(null); await refreshProducts(); } catch (error) { setProductMessage((error as Error).message); } };
  const openSector = (sector: Sector) => { setActiveSector(sector); setActiveModule(null); setSelectedOperation(null); setCommandMessage(""); setModuleData(null); setModuleDataState("idle"); setMutationState("idle"); setProductDetail(null); };
  const openModule = (module: SectorModule) => { setActiveModule(module); setSelectedOperation(null); setCommandMessage(""); setMutationValues({}); setMutationState("idle"); setSalesOrderDetail(null); if (module.id === "retail-sales") { setSalesOrderState("idle"); void refreshSalesOrders(); } else void loadModuleData(module); };
  const backToSectors = () => { setActiveSector(null); setActiveModule(null); setSelectedOperation(null); setCommandMessage(""); setModuleData(null); setModuleDataState("idle"); setMutationState("idle"); };
  const backToModules = () => { setActiveModule(null); setSelectedOperation(null); setCommandMessage(""); setModuleData(null); setModuleDataState("idle"); setMutationState("idle"); };
  const runOperation = async (operation: Operation) => {
    setSelectedOperation(operation);
    if (!activeSector || !activeModule) return;
    if (isBusinessOsModuleId(activeModule.id)) {
      setMutationValues({});
      setMutationState("idle");
      setCommandMessage("أدخل البيانات المطلوبة لتنفيذ العملية داخل نطاق المستأجر الحالي.");
      return;
    }
    setCommandMessage("جارٍ تجهيز الأمر والتحقق من مدخلاته...");
    try {
      const idempotencyKey = `cmd-${Date.now()}-${window.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
      const response = await fetch("/api/commands/prepare", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey }, body: JSON.stringify({ sectorId: activeSector.id, moduleId: activeModule.id, operationId: operation.id }) });
      const result = await response.json() as { message?: string; status?: string; requestId?: string };
      if (response.status === 401) setCommandMessage("يتطلب هذا الأمر تسجيل الدخول وسياق مساحة عمل مصادقاً عليه.");
      else if (response.status === 428) setCommandMessage("تم رفض الأمر: يلزم مفتاح حماية فريد، وقد أرسله التطبيق تلقائياً عند المحاولة.");
      else if (response.status === 403) setCommandMessage("تم رفض سياق الأمر أمنياً؛ لم يتم تنفيذ أي تغيير.");
      else if (response.status === 409) setCommandMessage("تم منع التكرار: مفتاح الأمر مرتبط بسياق مختلف.");
      else if (response.status === 503) setCommandMessage("الخدمة غير مهيأة بعد؛ لم يتم تنفيذ أي معاملة.");
      else setCommandMessage(result.message ?? `حالة الخادم: ${result.status ?? response.status}.`);
    } catch {
      setCommandMessage("تعذر الوصول إلى مركز الأوامر. أعد المحاولة بعد عودة الاتصال.");
    }
  };

  const submitModuleMutation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeModule || !isBusinessOsModuleId(activeModule.id)) return;
    setMutationState("loading"); setModuleDataMessage("");
    try {
      let effectiveContext = platformContext;
      if (activeModule.id === "retail-products" && !effectiveContext.businessId) {
        const contextResponse = await fetch("/api/platform/me", { cache: "no-store", headers: authHeaders() });
        const contextPayload = await contextResponse.json() as { context?: PlatformContext };
        if (!contextResponse.ok || !contextPayload.context?.businessId) throw new Error("لم يكتمل سياق النشاط المصادق عليه بعد.");
        effectiveContext = contextPayload.context;
        setPlatformContext(effectiveContext);
      }
      await mutateBusinessOsModule(activeModule.id, mutationValues, authHeaders(), effectiveContext);
      setMutationState("success"); setCommandMessage("تم تنفيذ العملية من الخادم داخل نطاق المستأجر، وتم تحديث البيانات.");
      await loadModuleData(activeModule);
    } catch (error) {
      const status = (error as { status?: number }).status;
      setMutationState("error");
      setCommandMessage(status === 401 ? "سجّل الدخول لتنفيذ العملية." : status === 403 ? "لا تملك صلاحية RBAC المطلوبة لهذه العملية." : (error as Error).message);
    }
  };

  const productManagementPanel = moduleDataState === "loading"
    ? <div className="mobile-command-note" role="status">جارٍ تحميل منتجات النشاط من الخادم...</div>
    : moduleDataState === "auth" || moduleDataState === "error"
      ? <div className="mobile-command-note" role="alert">{moduleDataMessage}</div>
      : moduleDataState === "ready" && moduleData
        ? <section className="mobile-plan-card" aria-label="إدارة المنتجات الحقيقية"><small>Business OS · /api/platform/products</small><h2>إدارة المنتجات</h2><h3>البيانات الحقيقية</h3><div className="mobile-command-note"><input aria-label="بحث المنتجات" value={productQuery} onChange={(event) => setProductQuery(event.target.value)} placeholder="بحث بالاسم أو SKU" /><select aria-label="حالة المنتج" value={productStatus} onChange={(event) => setProductStatus(event.target.value)}><option value="active">نشطة</option><option value="draft">مسودة</option><option value="archived">مؤرشفة</option></select><button className="mobile-command-button" type="button" onClick={refreshProducts}>تطبيق الفلتر</button></div>{moduleData.rows.length ? moduleData.rows.map((row) => <article key={String(row.id)} className="mobile-data-row"><b>{displayBusinessOsValue(row.name)}</b><span>{displayBusinessOsValue(row.sku)} · {displayBusinessOsValue(row.status)} · {displayBusinessOsValue(row.price_cents)} سنت</span><button className="mobile-command-button" type="button" onClick={() => openProductDetail(String(row.id))}>فتح التفاصيل</button></article>) : <span>لا توجد منتجات ضمن الفلتر الحالي.</span>}{productDetail && <form className="mobile-command-note" onSubmit={submitProductEdit} aria-label="تفاصيل وتعديل المنتج"><b>{productDetail.name} · {productDetail.status}</b><input aria-label="اسم المنتج" required value={productEdit.name ?? productDetail.name} onChange={(event) => setProductEdit({ ...productEdit, name: event.target.value })} /><input aria-label="الوصف" value={productEdit.description ?? productDetail.description ?? ""} onChange={(event) => setProductEdit({ ...productEdit, description: event.target.value })} /><input aria-label="التصنيف" value={productEdit.category ?? productDetail.category ?? ""} onChange={(event) => setProductEdit({ ...productEdit, category: event.target.value })} /><input aria-label="السعر بالسنت" type="number" required value={productEdit.price_cents ?? String(productDetail.price_cents)} onChange={(event) => setProductEdit({ ...productEdit, price_cents: event.target.value })} /><button className="mobile-command-button" type="submit">حفظ التعديل</button><button className="mobile-command-button" type="button" onClick={() => archiveProduct(productDetail.id)}>أرشفة المنتج</button></form>}{productMessage && <div className="mobile-command-note" role="status">{productMessage}</div>}{selectedOperation && <form className="mobile-command-note" onSubmit={submitModuleMutation} aria-label="إضافة منتج"><b>إضافة منتج</b>{getBusinessOsMutation("retail-products").fields.map((field) => <input key={field.name} aria-label={field.label} required={field.required} type={field.type ?? "text"} placeholder={field.placeholder} value={mutationValues[field.name] ?? ""} onChange={(event) => setMutationValues((current) => ({ ...current, [field.name]: event.target.value }))} />)}<button className="mobile-command-button" type="button" onClick={() => void submitModuleMutation({ preventDefault: () => undefined } as FormEvent<HTMLFormElement>)}>إضافة وحفظ</button></form>}</section>
        : null;
  const inventoryPanel = moduleDataState === "loading"
    ? <div className="mobile-command-note" role="status">جارٍ تحميل المخزون الحقيقي من الخادم...</div>
    : moduleDataState === "auth" || moduleDataState === "error"
      ? <div className="mobile-command-note" role="alert">{moduleDataMessage}</div>
      : moduleDataState === "ready"
        ? <section className="mobile-plan-card" aria-label="إدارة المخزون الحقيقية"><small>Business OS · /api/platform/inventory</small><h2>إدارة المخزون</h2><div className="mobile-command-note"><input aria-label="بحث المخزون" value={inventoryQuery} onChange={(event) => setInventoryQuery(event.target.value)} placeholder="بحث بالاسم أو SKU" /><button className="mobile-command-button" type="button" onClick={refreshInventory}>تحديث البيانات</button></div>{inventoryRows.filter((row) => `${row.name} ${row.sku}`.toLowerCase().includes(inventoryQuery.toLowerCase())).length ? inventoryRows.filter((row) => `${row.name} ${row.sku}`.toLowerCase().includes(inventoryQuery.toLowerCase())).map((row) => <article key={`${row.branch_id}-${row.product_id}`} className="mobile-data-row"><b>{displayBusinessOsValue(row.name)}</b><span>{displayBusinessOsValue(row.sku)} · الكمية: {displayBusinessOsValue(row.quantity)} · الفرع: {displayBusinessOsValue(row.branch_id)}</span><button className="mobile-command-button" type="button" onClick={() => setInventoryMovement((current) => ({ ...current, productId: row.product_id }))}>استخدام المنتج</button></article>) : <span>لا توجد سجلات مخزون حقيقية ضمن نطاق مساحة العمل الحالي.</span>}<form className="mobile-command-note" onSubmit={submitInventoryMovement} aria-label="تسجيل حركة مخزون"><b>تسجيل حركة مخزون</b><input aria-label="معرّف المنتج" required value={inventoryMovement.productId} onChange={(event) => setInventoryMovement({ ...inventoryMovement, productId: event.target.value })} placeholder="معرّف المنتج" /><input aria-label="التغيير في الكمية" required type="number" value={inventoryMovement.quantityDelta} onChange={(event) => setInventoryMovement({ ...inventoryMovement, quantityDelta: event.target.value })} placeholder="5 أو -1" /><input aria-label="سبب الحركة" required value={inventoryMovement.reason} onChange={(event) => setInventoryMovement({ ...inventoryMovement, reason: event.target.value })} placeholder="استلام / تسوية" /><button className="mobile-command-button" type="submit">تسجيل الحركة</button>{inventoryMessage && <div role="status">{inventoryMessage}</div>}</form></section>
        : null;
  const salesOrdersPanel = salesOrderState === "loading"
    ? <div className="mobile-command-note" role="status">جارٍ تحميل الطلبات الحقيقية من الخادم...</div>
    : salesOrderState === "auth" || salesOrderState === "error"
      ? <div className="mobile-command-note" role="alert">{salesOrderMessage}</div>
      : salesOrderState === "ready"
        ? <section className="mobile-plan-card" aria-label="إدارة المبيعات والطلبات الحقيقية"><small>Business OS · /api/platform/orders</small><h2>المبيعات والطلبات</h2><div className="mobile-command-note"><input aria-label="بحث الطلبات" value={salesOrderQuery} onChange={(event) => setSalesOrderQuery(event.target.value)} placeholder="بحث برقم الطلب أو اسم العميل" /><select aria-label="حالة الطلب" value={salesOrderStatus} onChange={(event) => setSalesOrderStatus(event.target.value)}><option value="">كل الحالات</option><option value="PENDING">قيد الانتظار</option><option value="CONFIRMED">مؤكد</option><option value="PROCESSING">قيد التجهيز</option><option value="READY">جاهز</option><option value="OUT_FOR_DELIVERY">خرج للتسليم</option><option value="COMPLETED">مكتمل</option><option value="CANCELLED">ملغي</option><option value="REFUNDED">مسترد</option></select><button className="mobile-command-button" type="button" onClick={refreshSalesOrders}>تطبيق الفلتر</button></div>{salesOrders.length ? salesOrders.map((order) => <article key={order.id} className="mobile-data-row"><b>{order.id}</b><span>{order.customer_name ?? "عميل غير مسجل"} · {new Date(order.created_at).toLocaleString("ar-EG")} · {money(order.total_cents)} · {order.state}</span><button className="mobile-command-button" type="button" onClick={() => void openSalesOrder(order.id)}>فتح التفاصيل</button></article>) : <div className="mobile-empty"><b>لا توجد طلبات</b><span>لم يعثر الخادم على طلبات ضمن الفلتر الحالي.</span></div>}{salesOrderDetail && <section className="mobile-command-note" aria-label="تفاصيل الطلب"><button className="mobile-back-button" type="button" onClick={() => setSalesOrderDetail(null)}>إغلاق التفاصيل</button><h3>الطلب {salesOrderDetail.order.id}</h3><p>الحالة: <b>{salesOrderDetail.order.state}</b> · {new Date(salesOrderDetail.order.created_at).toLocaleString("ar-EG")}</p><p>العميل: {salesOrderDetail.order.customer_name ?? "غير مسجل"} {salesOrderDetail.order.customer_phone ? `· ${salesOrderDetail.order.customer_phone}` : ""}</p>{salesOrderDetail.items.map((item) => <div className="mobile-data-row" key={item.id}><b>{item.product_name}</b><span>{item.sku ?? "بدون SKU"} · {item.quantity} × {money(item.unit_price_cents)} = {money(item.line_total_cents)}</span></div>)}<p>الإجمالي الفرعي: {money(salesOrderDetail.order.subtotal_cents)} · الخصم: {money(salesOrderDetail.order.discount_cents)} · الضريبة: {money(salesOrderDetail.order.tax_cents)} · الإجمالي: <b>{money(salesOrderDetail.order.total_cents)}</b></p><p>الفاتورة: {salesOrderDetail.invoice ? `${salesOrderDetail.invoice.invoice_number} · ${salesOrderDetail.invoice.status}` : "لا توجد فاتورة مرتبطة"} · القيود: {salesOrderDetail.ledger.length} · حركات المخزون: {salesOrderDetail.inventoryMovements.length}</p><div className="mobile-chip-row">{salesOrderDetail.allowedTransitions.map((state) => <button className="mobile-command-button" key={state} type="button" disabled={salesOrderMutation !== "idle"} onClick={() => void transitionSalesOrder(state)}>{salesOrderMutation === state ? "جارٍ التحديث..." : `نقل إلى ${state}`}</button>)}</div>{salesOrderMessage && <div role="status">{salesOrderMessage}</div>}</section>}</section>
        : null;
  const moduleDataPanel = moduleDataState === "loading"
    ? <div className="mobile-command-note" role="status">جارٍ تحميل بيانات الوحدة من الخادم داخل نطاق مساحة العمل...</div>
    : moduleDataState === "auth" || moduleDataState === "error"
      ? <div className="mobile-command-note" role="alert">{moduleDataMessage}</div>
      : moduleDataState === "ready" && moduleData
        ? <section className="mobile-plan-card" aria-label={`بيانات ${activeModule?.label ?? "الوحدة"}`}>
            <small>Business OS · {moduleData.endpoint}</small>
            <h2>البيانات الحقيقية</h2>
            {moduleData.rows.length ? moduleData.rows.slice(0, 20).map((row, index) => <article key={String(row.id ?? index)} className="mobile-data-row"><b>{displayBusinessOsValue(row.name ?? row.sku ?? row.id ?? `سجل ${index + 1}`)}</b><span>{Object.entries(row).filter(([key]) => !["id", "name"].includes(key)).slice(0, 4).map(([key, value]) => `${key}: ${displayBusinessOsValue(value)}`).join(" · ")}</span></article>) : <span>لا توجد سجلات حقيقية داخل نطاق مساحة العمل الحالي.</span>}
            {activeModule && isBusinessOsModuleId(activeModule.id) && selectedOperation && <form className="mobile-command-note" onSubmit={submitModuleMutation} aria-label={getBusinessOsMutation(activeModule.id).label}><b>{getBusinessOsMutation(activeModule.id).label}</b>{getBusinessOsMutation(activeModule.id).fields.map((field) => <input key={field.name} aria-label={field.label} required={field.required} type={field.type ?? "text"} placeholder={field.placeholder} value={mutationValues[field.name] ?? ""} onChange={(event) => setMutationValues((current) => ({ ...current, [field.name]: event.target.value }))} />)}<button className="mobile-command-button" type="submit" disabled={mutationState === "loading"}>{mutationState === "loading" ? "جارٍ التنفيذ..." : "تنفيذ وحفظ"}</button></form>}
          </section>
        : null;

  return <main className="mobile-app-shell" dir={locale === "ar" ? "rtl" : "ltr"}>
    <header className="mobile-app-header"><div className="mobile-brand"><img className="brand-mark mobile-brand-mark" src="/manus-storage/sinai-mark_87e71bcd.png" alt="شعار AI Digital Sinai" /><span>AI DIGITAL <b>SINAI</b></span></div><button className="mobile-icon-button" onClick={() => setLocale(locale === "ar" ? "en" : "ar")} aria-label={t("language")}>{t("language")}</button><button className="mobile-icon-button" onClick={() => go("account")} aria-label="فتح الحساب والإشعارات"><Bell size={18} /></button></header>
    {loginOpen && <section className="mobile-command-note" aria-label="نموذج تسجيل الدخول"><button className="mobile-back-button" type="button" onClick={() => setLoginOpen(false)}>← العودة</button><h2>تسجيل الدخول</h2><p>أدخل بيانات الحساب ليتم التحقق منها عبر الخادم الحقيقي.</p><form onSubmit={submitLogin}><input aria-label="البريد الإلكتروني" type="email" required value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} placeholder="البريد الإلكتروني" /><input aria-label="كلمة المرور" type="password" required value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} placeholder="كلمة المرور" /><button className="mobile-command-button" type="submit">دخول</button></form>{loginError && <p role="alert">{loginError}</p>}</section>}
    <section className="mobile-app-content">
      {tab === "home" && <>
        <div className="mobile-greeting"><span>مساء الخير، يا شريك</span><small>من العريش إلى كل مكان</small></div>
        {installPrompt && <button className="mobile-install-button" onClick={installApp}>ثبّت التطبيق على جهازك ↓</button>}
        <section className="mobile-hero-card"><p>منصة التشغيل المحلي</p><h1>إدارة أذكى.<br /><em>سوق أقرب.</em></h1><span>من أول طلب إلى قرار أوضح، في مساحة عمل واحدة.</span><button onClick={() => go("work")}>افتح مساحة التشغيل ←</button></section>
        <div className="mobile-section-heading"><div><small>نقطة البداية</small><h2>ماذا تريد أن تنجز؟</h2></div><button onClick={() => go("market")}>عرض الكل</button></div>
        <div className="mobile-action-grid"><button onClick={() => go("market")} aria-label="اكتشف السوق، خدمات ومنتجات محلية"><Search size={19} /><b>اكتشف السوق</b><small>خدمات ومنتجات محلية</small></button><button onClick={() => go("work")} aria-label="أدر عملك، طلبات ومساحة تشغيل"><LayoutDashboard size={19} /><b>أدر عملك</b><small>طلبات ومساحة تشغيل</small></button></div>
        <div className={`mobile-trust-note api-${apiState}`}>{apiState === "loading" ? "جارٍ التحقق من اتصال التطبيق بالخادم..." : apiState === "ready" ? (dataMode === "connected" ? "التطبيق متصل بالخادم وبيانات مساحة العمل متاحة." : "التطبيق متصل بالخادم، وبيانات مساحة العمل بانتظار الربط الإنتاجي.") : <><span>تعذر الاتصال بالخادم حالياً.</span><button onClick={loadApi}>إعادة المحاولة</button></>}</div>
        <section className="mobile-readiness-card" aria-label="حالة الخدمات"><div><small>لوحة الثقة التشغيلية</small><h2>حالة المنصة الآن</h2></div><div className="mobile-readiness-grid"><span><b>الخدمة</b><strong className={`readiness-${serviceState.health}`}>{serviceState.health === "ok" ? "تعمل" : serviceState.health === "loading" ? "فحص" : "خطأ"}</strong></span><span><b>الجاهزية</b><strong className={`readiness-${serviceState.readiness}`}>{serviceState.readiness === "ready" ? "جاهزة" : serviceState.readiness === "loading" ? "فحص" : "تحتاج إعداداً"}</strong></span><span><b>التتبع</b><strong className={`readiness-${serviceState.observability}`}>{serviceState.observability === "ok" ? "نشط" : serviceState.observability === "loading" ? "فحص" : "متوقف"}</strong></span></div><p>{serviceState.readiness === "ready" ? "الاعتماديات الأساسية مهيأة." : "المنصة حية، لكن بعض الاعتماديات لم تُربط بعد؛ لا توجد تسوية تلقائية."}{serviceState.uptimeSeconds !== null ? ` · مدة التشغيل ${serviceState.uptimeSeconds} ث` : ""}</p></section>
        <section className="mobile-plan-card"><small>خارطة التنفيذ الاحترافية</small><h2>من الفكرة إلى الإصدار</h2>{roadmap.length ? roadmap.map((item) => <div key={item.id}><b>{item.phase}</b><span><strong>{item.title}</strong><small>{item.status === "ready" ? "جاهز" : item.status === "requires-setup" ? "يتطلب إعداداً" : "مؤجل"} · {item.detail}</small></span></div>) : <div><b>—</b><span>جارٍ تحميل خارطة التنفيذ...</span></div>}</section>
      </>}
      {tab === "market" && <><div className="mobile-page-title"><small>دليل السوق · بيانات حقيقية</small><h1>اكتشف ما حولك.</h1><p>المنتجات والخدمات المنشورة من المستأجر الحالي فقط.</p></div><div className="mobile-chip-row"><span>الكل</span><span>خدمات</span><span>منتجات</span><span><ShoppingCart size={14} /> {cartItems.length} · {money(cartTotal)}</span></div>{marketState === "idle" && <button className="mobile-command-button" onClick={loadMarketplace}>تحميل السوق من الخادم</button>}{marketState === "loading" && <div className="mobile-empty"><span>جارٍ تحميل المنتجات والخدمات...</span></div>}{(marketState === "auth" || marketState === "error") && <div className="mobile-empty"><Search size={22} /><b>{marketMessage}</b><button onClick={marketState === "auth" ? login : loadMarketplace}>{marketState === "auth" ? "تسجيل الدخول ←" : "إعادة المحاولة"}</button></div>}{marketState === "ready" && <><div className="mobile-operation-list">{offerings.map((offering) => <article className="mobile-operation-card" key={`${offering.offering_type}-${offering.id}`}><div><span className="mobile-status-pill status-ready">{offering.offering_type === "PRODUCT" ? "منتج" : "خدمة"}</span><h3>{offering.name}</h3><p>{offering.description || offering.category || "منشور من نشاط داخل مساحة العمل الحالية."}</p><b>{money(offering.price_cents)}</b></div><button className="mobile-command-button" onClick={() => addToCart(offering)}>{offering.offering_type === "PRODUCT" ? "أضف للسلة" : "اختيار موعد"}</button></article>)}</div>{selectedService && <section className="mobile-command-note"><b>المواعيد المتاحة لـ{selectedService.name}</b>{serviceSlots.length ? serviceSlots.map((slot) => <button className="mobile-command-button" key={slot.id} onClick={() => bookService(slot)}>{new Date(slot.starts_at).toLocaleString("ar-EG")} · احجز</button>) : <span>لا توجد مواعيد متاحة من الخادم.</span>}</section>}{!offerings.length && <div className="mobile-empty"><b>لا توجد عروض منشورة</b><span>تمت القراءة من الخادم دون عرض بيانات تجريبية.</span></div>}{cartItems.length > 0 && <section className="mobile-command-note" role="status"><b>السلة الحالية: {cartItems.map((item) => `${item.name} × ${item.quantity}`).join("، ")}</b><span> الإجمالي {money(cartTotal)}</span><button className="mobile-command-button" disabled={checkoutState === "loading"} onClick={checkout}>{checkoutState === "loading" ? "جارٍ إنشاء الطلب..." : "إتمام checkout"}</button></section>}{lastOrderId && <section className="mobile-command-note" aria-label="POS Kashier payment request"><b>POS · طلب دفع للعميل</b><span>الطلب {lastOrderId} جاهز لإنشاء رابط دفع من Kashier.</span><button className="mobile-command-button" disabled={paymentRequestState === "loading"} onClick={createPaymentRequest}>{paymentRequestState === "loading" ? "جارٍ إنشاء الرابط..." : "إنشاء رابط / QR Kashier"}</button>{paymentRequestUrl && <a className="mobile-command-button" href={paymentRequestUrl} target="_blank" rel="noreferrer">فتح رابط الدفع للعميل</a>}{paymentRequestState === "requires_setup" && <small>REQUIRES_SETUP · لم يتم استدعاء Kashier ولم تُنشأ معاملة.</small>}</section>}{marketMessage && <div className="mobile-command-note" role="status">{marketMessage}</div>}</>}</>}
      {tab === "work" && <><div className="mobile-page-title"><small>{activeSector ? activeSector.eyebrow : "Business OS"}</small><h1>{activeModule ? activeModule.label : activeSector ? activeSector.name : "مساحة التشغيل"}</h1><p>{activeModule ? activeModule.description : activeSector ? activeSector.description : "اختر قطاعك للوصول إلى وحداته وعملياته الداخلية."}</p></div>{activeModule ? <><button className="mobile-back-button" onClick={backToModules}>← العودة إلى وحدات {activeSector?.name}</button><div className="mobile-operation-list">{activeModule.operations.map((operation) => <article className="mobile-operation-card" key={operation.id}><div><span className={`mobile-status-pill status-${operation.status}`}>{statusLabel[operation.status]}</span><h3>{operation.label}</h3><p>{operation.description}</p></div><button className="mobile-command-button" onClick={() => runOperation(operation)}>فتح الأمر</button></article>)}</div>{activeModule.id === "retail-products" ? productManagementPanel : activeModule.id === "retail-inventory" ? inventoryPanel : activeModule.id === "retail-sales" ? <>{salesOrdersPanel}<BusinessOsSalesReturnsPanel headers={authHeaders()} /></> : activeModule.id === "retail-customers" ? <BusinessOsCustomersPanel headers={authHeaders()} /> : activeModule.id === "retail-suppliers" ? <><BusinessOsSuppliersPanel headers={authHeaders()} businessId={platformContext.businessId} /><BusinessOsProcurementPanel headers={authHeaders()} businessId={platformContext.businessId} branchId={platformContext.branchId} /></> : activeModule.id === "retail-invoices" ? <BusinessOsInvoicesPanel headers={authHeaders()} /> : activeModule.id === "retail-expenses" ? <BusinessOsExpensesPanel headers={authHeaders()} businessId={platformContext.businessId} branchId={platformContext.branchId} /> : activeModule.id === "retail-profit" ? <BusinessOsProfitPanel headers={authHeaders()} /> : activeModule.id === "retail-reconciliation" ? <BusinessOsReconciliationPanel headers={authHeaders()} /> : moduleDataPanel}{selectedOperation && !["retail-products", "retail-sales", "retail-customers", "retail-suppliers", "retail-invoices", "retail-expenses", "retail-profit", "retail-reconciliation"].includes(activeModule.id) && <div className="mobile-command-note" role="status">{commandMessage}{selectedOperation.status === "requires-setup" && <button onClick={login}>{t("login")}</button>}</div>}</> : activeSector ? <><button className="mobile-back-button" onClick={backToSectors}>← العودة إلى القطاعات</button><div className="mobile-module-list">{activeSector.modules.map((module) => <button key={module.id} className="mobile-module-card" onClick={() => openModule(module)}><span><b>{module.label}</b><small>{module.description}</small></span><strong>←</strong></button>)}</div></> : <><section className="mobile-login-card"><h2>أضف نشاطك مجانًا</h2><p>كل نشاط يمر بمراجعة قبل الظهور في Marketplace.</p><button onClick={() => setOnboardingOpen((current) => !current)}>{onboardingOpen ? "إغلاق النموذج" : "ابدأ تسجيل النشاط"}</button>{onboardingOpen && <form onSubmit={submitOnboarding} className="mobile-command-note"><input aria-label="اسم النشاط" required value={onboarding.name} onChange={(event) => setOnboarding({ ...onboarding, name: event.target.value })} placeholder="اسم النشاط" /><input aria-label="التصنيف" required value={onboarding.category} onChange={(event) => setOnboarding({ ...onboarding, category: event.target.value })} placeholder="التصنيف" /><input aria-label="الحي" value={onboarding.district} onChange={(event) => setOnboarding({ ...onboarding, district: event.target.value })} placeholder="الحي" /><input aria-label="رقم التواصل" required value={onboarding.phone} onChange={(event) => setOnboarding({ ...onboarding, phone: event.target.value })} placeholder="رقم التواصل" /><button className="mobile-command-button" type="submit">إرسال للمراجعة</button>{onboardingMessage && <p role="status">{onboardingMessage}</p>}</form>}</section><section className="mobile-login-card"><h2>{t("loginTitle")}</h2><p>{t("loginDescription")}</p><button onClick={login}>{t("login")}</button></section><div className="mobile-sector-grid">{sectors.map((sector) => <button key={sector.id} className="mobile-sector-card" onClick={() => openSector(sector)}><small>{sector.eyebrow}</small><b>{sector.name}</b><span>{sector.description}</span><strong>{t("exploreSector")}</strong></button>)}</div></>}</>}
      {tab === "account" && <><div className="mobile-page-title"><small>هوية آمنة</small><h1>حسابي</h1><p>إدارة الوصول والتنبيهات من مكان واحد.</p></div><section className="mobile-account-card"><div className="mobile-avatar">؟</div><div><b>{platformContext.role ?? "زائر"}</b><span>{platformContext.role ? "سياق مصادق عليه" : "لم تسجل الدخول بعد"}</span></div></section><div className="mobile-settings-list"><button onClick={() => go("work")}>مساحات العمل <b>←</b></button><button onClick={() => go("account")}>الإشعارات <b>—</b></button>{platformContext.role && <button onClick={loadAdmin}>مركز الإدارة الحقيقي <b>←</b></button>}<button onClick={login}>تسجيل الدخول <b>←</b></button></div>{adminState === "loading" && <div className="mobile-command-note">جارٍ تحميل users/tenants/audit/feature-flags من الخادم...</div>}{adminState === "denied" && <div className="mobile-command-note">تم رفض مركز الإدارة بـ403؛ هذه صلاحية Super Admin وليست صفحة ثابتة.</div>}{adminState === "error" && <div className="mobile-command-note">تعذر تحميل مركز الإدارة من الخادم.</div>}{adminState === "ready" && adminData && <section className="mobile-plan-card"><small>Super Admin Center · database-backed</small><h2>مركز الإدارة</h2><div><b>Users</b><span>{adminData.users.length} ضمن النطاق</span></div><div><b>Tenants</b><span>{adminData.tenants.length} ضمن النطاق</span></div><div><b>Audit</b><span>{adminData.audit.length} أحدث سجل</span></div><div><b>Flags</b><span>{adminData.flags.length} أعلام مهيأة</span></div><h3>طلبات الأنشطة بانتظار المراجعة</h3>{adminData.applications.length ? adminData.applications.map((application) => <article key={application.id}><b>{application.name}</b><span>{application.category} · {application.tenant_name} · {application.phone}</span><button onClick={() => reviewBusiness(application.id, "APPROVED")}>موافقة</button><button onClick={() => reviewBusiness(application.id, "REJECTED")}>رفض</button></article>) : <span>لا توجد طلبات معلقة.</span>}</section>}</>}
    </section>
    <nav className="mobile-tab-bar" aria-label="التنقل الرئيسي">{tabs.map(({ id, label, icon: Icon }) => <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)} aria-current={tab === id ? "page" : undefined}><Icon size={19} /><span>{label}</span></button>)}</nav>
  </main>;
}
