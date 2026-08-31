import { useEffect, useState } from "react";
import { Bell, Home, LayoutDashboard, Search, UserRound } from "lucide-react";
import { getLoginUrl } from "@/const";
import { sectors, statusLabel, type Operation, type Sector, type SectorModule } from "@/lib/operationsCatalog";

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

export default function MobileApp() {
  const [tab, setTab] = useState<TabId>("home");
  const [apiState, setApiState] = useState<"loading" | "ready" | "error">("loading");
  const [dataMode, setDataMode] = useState<"not-connected" | "connected">("not-connected");
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [roadmap, setRoadmap] = useState<RoadmapItem[]>([]);
  const [activeSector, setActiveSector] = useState<Sector | null>(null);
  const [activeModule, setActiveModule] = useState<SectorModule | null>(null);
  const [selectedOperation, setSelectedOperation] = useState<Operation | null>(null);
  const [commandMessage, setCommandMessage] = useState("");
  const [serviceState, setServiceState] = useState<ServiceState>({ health: "loading", readiness: "loading", observability: "loading", uptimeSeconds: null });

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
    const handleInstall = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPromptEvent); };
    window.addEventListener("beforeinstallprompt", handleInstall);
    const cleanup = loadApi();
    return () => { cleanup?.(); window.removeEventListener("beforeinstallprompt", handleInstall); };
  }, []);

  const installApp = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };
  const login = () => { window.location.href = getLoginUrl(); };
  const go = (next: TabId) => setTab(next);
  const openSector = (sector: Sector) => { setActiveSector(sector); setActiveModule(null); setSelectedOperation(null); setCommandMessage(""); };
  const openModule = (module: SectorModule) => { setActiveModule(module); setSelectedOperation(null); setCommandMessage(""); };
  const backToSectors = () => { setActiveSector(null); setActiveModule(null); setSelectedOperation(null); setCommandMessage(""); };
  const backToModules = () => { setActiveModule(null); setSelectedOperation(null); setCommandMessage(""); };
  const runOperation = async (operation: Operation) => {
    setSelectedOperation(operation);
    if (!activeSector || !activeModule) return;
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

  return <main className="mobile-app-shell" dir="rtl">
    <header className="mobile-app-header"><div className="mobile-brand"><span className="brand-mark">◈</span><span>AI DIGITAL <b>SINAI</b></span></div><button className="mobile-icon-button" onClick={() => go("account")} aria-label="فتح الحساب والإشعارات"><Bell size={18} /></button></header>
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
      {tab === "market" && <><div className="mobile-page-title"><small>دليل السوق</small><h1>اكتشف ما حولك.</h1><p>كتالوج الخدمات والمنتجات المحلية سيظهر هنا بعد الربط بالبيانات.</p></div><div className="mobile-chip-row"><span>خدمات</span><span>منتجات</span><span>مطاعم</span><span>وظائف</span><span>عقارات</span></div><div className="mobile-empty"><Search size={22} /><b>السوق في انتظار أول نشر</b><span>لن نعرض بطاقات أو تقييمات تجريبية. سجّل الدخول لبدء النشر الحقيقي.</span><button onClick={login}>تسجيل الدخول ←</button></div></>}
      {tab === "work" && <><div className="mobile-page-title"><small>{activeSector ? activeSector.eyebrow : "Business OS"}</small><h1>{activeModule ? activeModule.label : activeSector ? activeSector.name : "مساحة التشغيل"}</h1><p>{activeModule ? activeModule.description : activeSector ? activeSector.description : "اختر قطاعك للوصول إلى وحداته وعملياته الداخلية."}</p></div>{activeModule ? <><button className="mobile-back-button" onClick={backToModules}>← العودة إلى وحدات {activeSector?.name}</button><div className="mobile-operation-list">{activeModule.operations.map((operation) => <article className="mobile-operation-card" key={operation.id}><div><span className={`mobile-status-pill status-${operation.status}`}>{statusLabel[operation.status]}</span><h3>{operation.label}</h3><p>{operation.description}</p></div><button className="mobile-command-button" onClick={() => runOperation(operation)}>فتح الأمر</button></article>)}</div>{selectedOperation && <div className="mobile-command-note" role="status">{commandMessage}{selectedOperation.status === "requires-setup" && <button onClick={login}>تسجيل الدخول ←</button>}</div>}</> : activeSector ? <><button className="mobile-back-button" onClick={backToSectors}>← العودة إلى القطاعات</button><div className="mobile-module-list">{activeSector.modules.map((module) => <button key={module.id} className="mobile-module-card" onClick={() => openModule(module)}><span><b>{module.label}</b><small>{module.description}</small></span><strong>←</strong></button>)}</div></> : <><section className="mobile-login-card"><h2>ابدأ مساحة عملك</h2><p>اختر القطاع لإدارة عملياته، ثم سجّل الدخول لتفعيل البيانات المعزولة.</p><button onClick={login}>تسجيل الدخول ←</button></section><div className="mobile-sector-grid">{sectors.map((sector) => <button key={sector.id} className="mobile-sector-card" onClick={() => openSector(sector)}><small>{sector.eyebrow}</small><b>{sector.name}</b><span>{sector.description}</span><strong>استكشف القطاع ←</strong></button>)}</div></>}</>}
      {tab === "account" && <><div className="mobile-page-title"><small>هوية آمنة</small><h1>حسابي</h1><p>إدارة الوصول والتنبيهات من مكان واحد.</p></div><section className="mobile-account-card"><div className="mobile-avatar">؟</div><div><b>زائر</b><span>لم تسجل الدخول بعد</span></div></section><div className="mobile-settings-list"><button onClick={() => go("work")}>مساحات العمل <b>←</b></button><button onClick={() => go("account")}>الإشعارات <b>—</b></button><button onClick={login}>تسجيل الدخول <b>←</b></button></div></>}
    </section>
    <nav className="mobile-tab-bar" aria-label="التنقل الرئيسي">{tabs.map(({ id, label, icon: Icon }) => <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)} aria-current={tab === id ? "page" : undefined}><Icon size={19} /><span>{label}</span></button>)}</nav>
  </main>;
}
