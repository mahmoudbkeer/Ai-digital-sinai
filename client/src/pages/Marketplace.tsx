import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowUpLeft, Bot, BriefcaseBusiness, Car, Check, ChevronLeft, Clock3, GraduationCap, HeartPulse, LayoutGrid, MapPin, Megaphone, Mic, Monitor, Phone, Search, ShieldCheck, Shirt, Sparkles, Star, Tag, Truck, Utensils, UserPlus, Wrench, X } from "lucide-react";
import { toast } from "sonner";

const CONTACT = "201014732300";
const MARK_IMAGE = "/manus-storage/sinai-mark_87e71bcd.png";
const DEFAULT_MARKET_IMAGE = "/manus-storage/sinai-market_86fb201f.jpg";
const categories = ["الكل", "الصحة والطب", "المقاولات والحرف", "التعليم والتدريب", "المطاعم والأغذية", "السيارات", "الخدمات الرقمية", "الأزياء والجمال", "النقل والمواصلات", "خدمات أخرى"];
type Business = { id: string; name: string; category: string | null; subcategory: string; district: string; tag: string; description: string; phone: string | null; whatsapp: string | null; hours_json: string | null; reviews: number; rating: number | null; image_url: string | null; offering_name: string; created_at: number; sponsored?: number | boolean; featured_source?: "advertising" | "created_at" };
type DirectoryResponse = { businesses?: Business[] };
type Hours = Record<string, unknown>;
type SpeechRecognitionLike = { lang: string; interimResults: boolean; continuous: boolean; start: () => void; stop: () => void; onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function Logo() {
  return <div className="market-logo"><img src={MARK_IMAGE} alt="شعار AI Digital Sinai" /><div><strong>AI DIGITAL SINAI</strong><small>بوابتك، منصتك الرقمية الذكية لخدماتك وإدارة نشاطك</small></div></div>;
}

function CategoryIcon({ category }: { category: string }) {
  const Icon = category === "الكل" ? LayoutGrid : category === "الصحة والطب" ? HeartPulse : category === "التعليم والتدريب" ? GraduationCap : category === "المطاعم والأغذية" ? Utensils : category === "السيارات" ? Car : category === "الخدمات الرقمية" ? Monitor : category === "الأزياء والجمال" ? Shirt : category === "النقل والمواصلات" ? Truck : category === "المقاولات والحرف" ? Wrench : BriefcaseBusiness;
  return <Icon size={17} strokeWidth={1.8} />;
}

function parseHours(value: string | null): Hours {
  try { return value ? JSON.parse(value) as Hours : {}; } catch { return {}; }
}

function isBusinessOpen(business: Business) {
  const hours = parseHours(business.hours_json);
  const now = new Date();
  const day = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][now.getDay()];
  const entry = hours[day] ?? hours[String(now.getDay())] ?? hours["daily"];
  if (entry === "24h" || entry === "24 ساعة" || entry === true) return true;
  const range = typeof entry === "string" ? entry : entry && typeof entry === "object" ? (entry as { open?: string; close?: string }).open && (entry as { open?: string; close?: string }).close ? `${(entry as { open: string }).open}-${(entry as { close: string }).close}` : "" : "";
  const match = range.match(/(\d{1,2}:?\d{0,2})\s*[-–]\s*(\d{1,2}:?\d{0,2})/);
  if (!match) return false;
  const toMinutes = (time: string) => { const [hour, minute = "0"] = time.split(":"); return Number(hour) * 60 + Number(minute); };
  const current = now.getHours() * 60 + now.getMinutes();
  const open = toMinutes(match[1]); const close = toMinutes(match[2]);
  return close < open ? current >= open || current <= close : current >= open && current <= close;
}

function formatHours(value: string | null) {
  const hours = parseHours(value);
  const today = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][new Date().getDay()];
  const entry = hours[today] ?? hours[String(new Date().getDay())] ?? hours["daily"];
  if (entry === "24h" || entry === "24 ساعة" || entry === true) return "24 ساعة";
  if (typeof entry === "string") return entry;
  if (entry && typeof entry === "object") { const item = entry as { open?: string; close?: string }; if (item.open && item.close) return `${item.open} – ${item.close}`; }
  return "الساعات غير مسجلة";
}

export default function Marketplace() {
  const [category, setCategory] = useState("الكل");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [subscribed, setSubscribed] = useState(false);
  const [query, setQuery] = useState("");
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [directoryState, setDirectoryState] = useState<"loading" | "ready" | "error">("loading");
  const [directoryError, setDirectoryError] = useState("");
  const [activeOffer, setActiveOffer] = useState(0);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantQuery, setAssistantQuery] = useState("");
  const [assistantFeedback, setAssistantFeedback] = useState("");
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setDirectoryState("loading");
    fetch(`/api/platform/marketplace/directory?query=${encodeURIComponent(query)}&category=${encodeURIComponent(category === "الكل" ? "" : category)}`, { signal: controller.signal, headers: { Accept: "application/json" } }).then(async (response) => {
      if (!response.ok) throw new Error("directory request failed");
      const payload = await response.json() as DirectoryResponse;
      setBusinesses(payload.businesses ?? []);
      setDirectoryState("ready");
    }).catch((error: unknown) => {
      if ((error as { name?: string }).name !== "AbortError") { setDirectoryState("error"); setDirectoryError("تعذر تحميل بيانات السوق من قاعدة البيانات."); }
    });
    return () => controller.abort();
  }, [category, query]);

  const filtered = useMemo(() => businesses, [businesses]);
  const featuredOffers = useMemo(() => {
    const sponsored = businesses.filter((business) => Boolean(business.sponsored));
    const source = sponsored.length ? sponsored : [...businesses].sort((left, right) => right.created_at - left.created_at);
    return source.length ? source.slice(0, 6).map((business) => ({ id: business.id, title: business.name, subtitle: business.offering_name || business.subcategory, description: business.description || "نشاط معتمد داخل Marketplace.", meta: `${business.featured_source === "advertising" ? "إعلان ممول من Advertising" : "الأحدث إضافة"} · ${business.district} · ${business.tag}`, image: business.image_url || DEFAULT_MARKET_IMAGE })) : [{ id: "waiting", title: "مساحة العروض الحصرية", subtitle: "تظهر هنا الأنشطة والعروض الجديدة", description: "كلما تم اعتماد نشاط أو إضافة عرض، سيظهر تلقائيًا في هذه المساحة.", meta: "تحديث مستمر من Marketplace", image: DEFAULT_MARKET_IMAGE }];
  }, [businesses]);

  useEffect(() => {
    setActiveOffer((current) => current >= featuredOffers.length ? 0 : current);
  }, [featuredOffers.length]);

  useEffect(() => {
    if (featuredOffers.length < 2) return;
    const timer = window.setInterval(() => setActiveOffer((current) => (current + 1) % featuredOffers.length), 5200);
    return () => window.clearInterval(timer);
  }, [featuredOffers.length]);

  useEffect(() => () => recognitionRef.current?.stop(), []);

  const subscribe = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !phone.trim()) { toast.error("أدخل الاسم ورقم الموبايل أولًا"); return; }
    setSubscribed(true);
    toast.success("تم تسجيل طلبك لتلقي العروض");
  };

  const share = async (business: Business) => {
    if (navigator.share) await navigator.share({ title: business.name, text: business.description, url: window.location.href });
    else { await navigator.clipboard?.writeText(window.location.href); toast.success("تم نسخ رابط السوق"); }
  };

  const selectCategory = (nextCategory: string) => {
    setCategory(nextCategory);
    window.requestAnimationFrame(() => document.getElementById("marketplace-listings")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const openProgram = (target: "market" | "work" | "account") => {
    window.location.assign(`/app?tab=${target}`);
  };

  const routeAssistantRequest = (request: string) => {
    const normalized = request.trim().toLowerCase();
    if (!normalized) { setAssistantFeedback("اكتب أو انطق ما تريد الوصول إليه داخل منصتك."); return; }
    if (/سوق|خدمات|منتجات|نشاط|عرض|market|service|product/.test(normalized)) { toast.success("سأفتح لك سوق الخدمات والمنتجات داخل المنصة"); openProgram("market"); return; }
    if (/إدارة|ادارة|تشغيل|طلب|طلبات|نشاطي|business|work|operation/.test(normalized)) { toast.success("سأفتح لك مساحة تشغيل نشاطك"); openProgram("work"); return; }
    if (/حساب|إشعار|اشعار|دخول|account|profile/.test(normalized)) { toast.success("سأفتح لك حسابك وإعدادات الوصول"); openProgram("account"); return; }
    setAssistantFeedback("أستطيع فتح السوق، مساحة تشغيل نشاطك، أو الحساب. جرّب: أريد خدمات أو أريد إدارة نشاطي.");
  };

  const startVoiceAssistant = () => {
    const speechWindow = window as Window & { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor };
    const SpeechRecognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!SpeechRecognition) { setAssistantFeedback("المتصفح الحالي لا يدعم الإدخال الصوتي؛ استخدم الكتابة أو افتح الصفحة من Chrome."); return; }
    const recognition = new SpeechRecognition();
    recognition.lang = "ar-EG";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => { const transcript = event.results[0]?.[0]?.transcript ?? ""; setAssistantQuery(transcript); setListening(false); routeAssistantRequest(transcript); };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => { setListening(false); setAssistantFeedback("لم أتمكن من التقاط الصوت. حاول مرة أخرى بهدوء."); };
    recognitionRef.current = recognition;
    setAssistantFeedback("تحدث الآن، مثل: افتح الخدمات أو أريد إدارة نشاطي.");
    setListening(true);
    recognition.start();
  };

  const activeFeaturedOffer = featuredOffers[activeOffer];

  return <main dir="rtl" className="marketplace-page">
    <header className="marketplace-header"><div className="market-container market-header-inner"><a href="#top" aria-label="AI Digital Sinai"><Logo /></a><div className="market-location"><MapPin size={15} /> العريش <span>⌄</span></div><a className="add-business" href="/app?tab=work"><UserPlus size={17} /> أضف نشاطك <b>مجانًا</b></a></div></header>

    <section id="top" className="market-container contact-section"><div className="contact-card"><div className="service-badge">خدمة 24 ساعة</div><button className="assistant-trigger" type="button" onClick={() => { setAssistantOpen(true); setAssistantFeedback(""); }} aria-label="فتح خدمة المساعد الذكي"><Bot size={21} /><span>المساعد الذكي</span></button><div className="contact-copy"><h1>تواصل مع فريق AI Digital Sinai</h1><p>لديك استفسار عن الانضمام كصاحب نشاط، أو اقتراح لتطوير المنصة؟ تواصل معنا مباشرة:</p><div className="contact-actions"><a href={`tel:+${CONTACT}`} className="market-button primary"><Phone size={18} /> اتصال</a><a href={`https://wa.me/${CONTACT}`} className="market-button whatsapp"><span>◉</span> واتساب</a></div></div><div className="megaphone"><Megaphone size={42} /></div></div></section>

    {assistantOpen && <div className="assistant-overlay" role="presentation" onClick={() => setAssistantOpen(false)}><section className="assistant-dialog" role="dialog" aria-modal="true" aria-labelledby="assistant-title" onClick={(event) => event.stopPropagation()}><div className="assistant-dialog-head"><div><span className="assistant-kicker"><Sparkles size={14} /> خدمة AI للنشاط</span><h2 id="assistant-title">ماذا تريد أن تنجز؟</h2></div><button type="button" onClick={() => setAssistantOpen(false)} aria-label="إغلاق المساعد"><X size={19} /></button></div><p>اكتب طلبك أو استخدم صوتك، وسأفتح لك المكان المناسب داخل البرنامج بدون الدخول إلى إدارة المنصة.</p><form className="assistant-command" onSubmit={(event) => { event.preventDefault(); routeAssistantRequest(assistantQuery); }}><input value={assistantQuery} onChange={(event) => setAssistantQuery(event.target.value)} placeholder="مثال: أريد خدمات ومنتجات" aria-label="طلب المساعد الذكي" /><button type="button" className={listening ? "listening" : ""} onClick={startVoiceAssistant} aria-label="التحدث مع المساعد"><Mic size={18} /></button><button type="submit" aria-label="تنفيذ الطلب"><ArrowUpLeft size={18} /></button></form>{assistantFeedback && <div className="assistant-feedback" role="status">{assistantFeedback}</div>}<div className="assistant-quick-actions"><button type="button" onClick={() => openProgram("market")}><span><Search size={17} /><b>السوق والخدمات</b></span><ChevronLeft size={16} /></button><button type="button" onClick={() => openProgram("work")}><span><BriefcaseBusiness size={17} /><b>مساحة تشغيل نشاطك</b></span><ChevronLeft size={16} /></button><button type="button" onClick={() => openProgram("account")}><span><UserPlus size={17} /><b>حسابك والوصول</b></span><ChevronLeft size={16} /></button></div></section></div>}

    <section className="market-container offers-section"><div className="featured-offer" style={{ backgroundImage: `linear-gradient(90deg, rgba(16,42,67,.96) 0%, rgba(16,42,67,.84) 48%, rgba(16,42,67,.28) 100%), url(${activeFeaturedOffer.image})` }}><div className="featured-offer-copy"><span className="section-label"><Sparkles size={15} /> عرض ونشاط مميز</span><small>{activeFeaturedOffer.meta}</small><h2>{activeFeaturedOffer.title}</h2><h3>{activeFeaturedOffer.subtitle}</h3><p>{activeFeaturedOffer.description}</p><a className="offer-link" href="#marketplace-listings">استعرض التفاصيل <ArrowUpLeft size={15} /></a></div><div className="offer-controls"><span>{String(activeOffer + 1).padStart(2, "0")} / {String(featuredOffers.length).padStart(2, "0")}</span><div><button type="button" onClick={() => setActiveOffer((current) => (current - 1 + featuredOffers.length) % featuredOffers.length)} aria-label="العرض السابق">→</button><button type="button" onClick={() => setActiveOffer((current) => (current + 1) % featuredOffers.length)} aria-label="العرض التالي">←</button></div></div></div><div className="subscribe-panel"><div><span className="section-label"><Tag size={16} /> عروض حصرية</span><h2>وصّل لك الجديد أولًا <small>(اختياري)</small></h2><p>سجّل الاسم ورقم التواصل، وسنخبرك بالعروض والأنشطة الجديدة عند اعتمادها.</p></div>{subscribed ? <div className="subscribed-message"><Check size={22} /> تم تفعيل استقبال العروض</div> : <form onSubmit={subscribe} className="subscribe-form"><input aria-label="الاسم بالكامل" value={name} onChange={(event) => setName(event.target.value)} placeholder="الاسم بالكامل" /><input aria-label="رقم الموبايل" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="رقم التواصل" inputMode="tel" /><button className="market-button dark">تفعيل التنبيهات <ArrowUpLeft size={15} /></button></form>}</div></section>

    <section className="market-container directory-section"><div className="directory-heading"><div><span className="section-label">مركز الخدمات والأنشطة</span><h2>استكشف خدماتك بذكاء</h2><p>تصنيفات تقنية واضحة للوصول إلى الأنشطة والخدمات المعتمدة بسرعة.</p></div><div className="result-count">الخدمات الظاهرة <strong>{directoryState === "loading" ? "…" : filtered.length}</strong></div></div><div className="market-search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث عن نشاط أو خدمة أو حي" aria-label="البحث في Marketplace" /></div><div className="category-grid">{categories.map((item) => <button key={item} type="button" className={category === item ? "selected" : ""} onClick={() => selectCategory(item)}><span className="category-icon"><CategoryIcon category={item} /></span><span><b>{item}</b><small>{item === "الكل" ? "كل الأنشطة" : "استعرض الخدمات"}</small></span><ChevronLeft size={15} /></button>)}</div></section>

    <section id="marketplace-listings" className="market-container listing-section"><div className="listing-heading"><div><span className="section-label">نتائج Marketplace</span><h2>منشآت وخدمات حولك</h2></div><span className="approved-note"><ShieldCheck size={16} /> منشورة بعد مراجعة</span></div>{directoryState === "loading" && <div className="empty-directory">جارٍ تحميل الأنشطة المعتمدة من قاعدة البيانات…</div>}{directoryState === "error" && <div className="empty-directory">{directoryError}</div>}{directoryState === "ready" && <><div className="business-grid">{filtered.map((business) => { const open = isBusinessOpen(business); return <article className="business-card" key={business.id}><div className="business-image"><img src={business.image_url || DEFAULT_MARKET_IMAGE} alt="" /><span className={`open-status ${open ? "open" : "closed"}`}>{open && <i />} {open ? "مفتوح ومتاح الآن" : "مغلق حاليًا"}</span><span className="business-subcategory">{business.subcategory}</span><div className="business-title"><h3>{business.name}</h3><span>{business.district}</span></div></div><div className="business-body"><div className="rating-row"><span><b>{business.reviews}</b> تقييم</span><span className="stars">{business.rating ?? "—"} {business.rating !== null && <Star size={14} fill="currentColor" />} <button type="button" onClick={() => toast("سيتم فتح نموذج التقييم بعد تسجيل الدخول")}>قيّم الآن</button></span></div><div className="business-meta"><span><Clock3 size={15} /> {formatHours(business.hours_json)}</span><span className="service-tag">{business.tag}</span></div><p>{business.description || business.offering_name}</p><div className="business-actions"><button className="share-button" type="button" onClick={() => share(business)} aria-label={`مشاركة ${business.name}`}>↗</button>{business.whatsapp ? <a className="market-button whatsapp" href={`https://wa.me/${business.whatsapp}`}><span>◉</span> واتساب</a> : <span className="market-button whatsapp" aria-disabled="true"><span>◉</span> واتساب</span>}{business.phone ? <a className="market-button primary" href={`tel:+${business.phone}`}><Phone size={15} /> اتصال</a> : <span className="market-button primary" aria-disabled="true"><Phone size={15} /> اتصال</span>}</div></div></article>; })}</div>{filtered.length === 0 && <div className="empty-directory">لا توجد منشآت أو خدمات معتمدة في قاعدة البيانات لهذا البحث.</div>}</>}</section>

    <footer className="marketplace-footer"><div className="market-container footer-grid"><div><Logo /><p className="footer-tagline">ليك وعلشانك</p><p>منصة تشغيل رقمية ذكية تجمع الخدمات والأنشطة والمنتجات في مساحة عملية واحدة.</p></div><div><span className="footer-heading">روابط موثوقة</span><a href="/app?tab=work">مساحة تشغيل نشاطك</a><a href="#marketplace-listings">الخدمات والأنشطة</a><a href="/سياسة-الخصوصية-AI-Digital-Sinai.md">سياسة الخصوصية</a></div></div><div className="market-container trust-line"><ShieldCheck size={15} /> كل نشاط في هذا السوق يمر بمراجعة قبل الظهور</div></footer>
  </main>;
}
