// Design philosophy: ساحل المستقبل — Arabic-first, editorial coastal modernism, ivory/sand/navy with Sinai Tide #0E7C7B, asymmetric layouts, explicit product truth.
import { useState } from "react";
import { ArrowLeft, ArrowUpLeft, BarChart3, Bell, Check, ChevronDown, CircleDot, Compass, Database, Layers3, LockKeyhole, MapPin, Menu, MessageCircle, Search, ShieldCheck, Sparkles, Store, Users, X } from "lucide-react";
import { toast } from "sonner";

const heroImage = "/manus-storage/sinai-hero_2935973a.jpg";
const marketImage = "/manus-storage/sinai-market_86fb201f.jpg";
const operationsImage = "/manus-storage/sinai-operations_e17e296a.jpg";
const markImage = "/manus-storage/sinai-mark_87e71bcd.png";

const navItems = [
  { label: "المنصة", href: "#platform" },
  { label: "السوق المحلي", href: "#market" },
  { label: "الذكاء الآمن", href: "#intelligence" },
  { label: "خريطة المنصة", href: "#scope" },
  { label: "عن النظام", href: "#status" },
];

function ProductMark({ small = false }: { small?: boolean }) {
  return <div className="brand-mark"><img src={markImage} alt="" className={small ? "h-9 w-9" : "h-11 w-11"} /><span><strong>AI DIGITAL</strong><b>SINAI</b></span></div>;
}

function SectionKicker({ children }: { children: React.ReactNode }) {
  return <div className="section-kicker"><CircleDot size={13} strokeWidth={2.5} />{children}</div>;
}

function StatusPill({ children, tone = "teal" }: { children: React.ReactNode; tone?: "teal" | "sand" }) {
  return <span className={`status-pill ${tone}`}>{children}</span>;
}

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [searchStatus, setSearchStatus] = useState("");
  const [activeTab, setActiveTab] = useState("نظرة عامة");

  const notifyComingSoon = (label: string) => toast(`${label} قيد التجهيز`, { description: "نعلن عن كل ميزة عندما تصبح جاهزة للاستخدام الفعلي." });
  const searchMarketplace = async () => {
    const query = search.trim();
    if (!query) { setSearchStatus("اكتب كلمة بحث أولاً."); return; }
    setSearchStatus("جارٍ البحث في السوق...");
    try {
      const response = await fetch(`/api/platform/marketplace/catalog?query=${encodeURIComponent(query)}`, { headers: { Accept: "application/json" } });
      if (response.status === 401 || response.status === 403) { setSearchStatus("سجّل الدخول لعرض نتائج السوق داخل نطاقك."); return; }
      if (!response.ok) throw new Error("marketplace search failed");
      const body = await response.json() as { offerings?: unknown[] };
      setSearchStatus(`تم العثور على ${body.offerings?.length ?? 0} نتيجة فعلية.`);
    } catch { setSearchStatus("تعذر الاتصال بالسوق الآن."); }
  };

  return (
    <main dir="rtl" className="site-shell">
      <header className="site-header">
        <div className="header-inner">
          <a href="#top" aria-label="AI Digital Sinai"><ProductMark small /></a>
          <nav className={`main-nav ${menuOpen ? "is-open" : ""}`} aria-label="التنقل الرئيسي">
            {navItems.map((item) => <a key={item.href} href={item.href} onClick={() => setMenuOpen(false)}>{item.label}</a>)}
            <button className="nav-mobile-cta" onClick={() => notifyComingSoon("الانضمام للمنصة")}>ابدأ مع نظامك <ArrowLeft size={15} /></button>
          </nav>
          <div className="header-actions">
            <button className="text-link" onClick={() => notifyComingSoon("تسجيل الدخول")}>تسجيل الدخول</button>
            <button className="button button-dark button-sm" onClick={() => notifyComingSoon("إنشاء مساحة عمل")}>ابدأ الآن <ArrowLeft size={16} /></button>
            <button className="menu-toggle" aria-label={menuOpen ? "إغلاق القائمة" : "فتح القائمة"} onClick={() => setMenuOpen((open) => !open)}>{menuOpen ? <X /> : <Menu />}</button>
          </div>
        </div>
      </header>

      <section id="top" className="hero-section">
        <div className="contour contour-hero" aria-hidden="true" />
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-dot" /> من العريش إلى كل مكان</div>
          <h1>إدارة أذكى.<br /><em>سوق أقرب.</em><br />نمو أسرع.</h1>
          <p className="hero-lede">نظام تشغيل رقمي يبني جسراً عملياً بين أصحاب الأعمال والعملاء في شمال سيناء — من أول طلب، إلى قرار أوضح.</p>
          <div className="hero-actions"><button className="button button-primary" onClick={() => notifyComingSoon("إنشاء مساحة عمل")}>اكتشف النظام <ArrowLeft size={17} /></button><a className="button button-quiet" href="#platform">كيف يعمل؟ <ArrowUpLeft size={17} /></a></div>
          <div className="hero-proof"><div className="proof-avatars"><span>ع</span><span>س</span><span>م</span><span>+</span></div><p><strong>منصة واحدة</strong><br />لإدارة حضورك الرقمي محلياً</p></div>
        </div>
        <div className="hero-visual">
          <div className="hero-image-wrap"><img src={heroImage} alt="ساحل العريش عند الصباح" /><div className="image-shade" /><div className="location-label"><MapPin size={15} fill="currentColor" /> العريش، شمال سيناء</div><div className="image-note"><span>01</span><span>الساحل يبدأ من هنا</span></div></div>
          <div className="floating-data-card"><div className="floating-top"><span>نبض يومك</span><span className="live-dot">حي</span></div><div className="floating-number">24<span>%</span></div><p>مساحة أوضح لاتخاذ القرار</p><div className="mini-bars"><i /><i /><i /><i /><i /><i /><i /></div></div>
        </div>
      </section>

      <section className="trust-strip"><div className="container-wide trust-inner"><div className="trust-label"><ShieldCheck size={18} /> مبني على الثقة</div><div className="trust-items"><span><LockKeyhole size={16} /> عزل صارم للبيانات</span><span><Database size={16} /> مصدر واحد للحقيقة</span><span><Compass size={16} /> يبدأ من شمال سيناء</span></div></div></section>

      <section id="platform" className="platform-section section-space"><div className="container-wide">
        <div className="section-intro split-intro"><div><SectionKicker>النظام في صورة واحدة</SectionKicker><h2>أدوات يومك،<br /><span>في إيقاع واحد.</span></h2></div><p>لم نبنِ تطبيقاً آخر لتضيفه إلى يومك. صممنا طبقة تشغيل تساعدك على رؤية العمل، والسوق، والفرص من مكان واحد.</p></div>
        <div className="platform-layout"><div className="vertical-rail" aria-label="مراحل المنصة"><div className="rail-stage active"><span>01</span><b>هوية</b></div><i /><div className="rail-stage"><span>02</span><b>سوق</b></div><i /><div className="rail-stage"><span>03</span><b>ذكاء</b></div><i /><div className="rail-stage"><span>04</span><b>تشغيل</b></div></div><div className="feature-grid">
          <article className="feature-card feature-main"><div className="feature-card-top"><span className="feature-index">01</span><Store size={23} /></div><h3>شغّل أعمالك<br />بصورة أوضح</h3><p>من المنشأة والعملاء إلى الخدمات والطلبات ومساحات العمل — كل ما تحتاجه لتفهم يومك دون ضوضاء.</p><button className="inline-link" onClick={() => notifyComingSoon("نظام تشغيل الأعمال")}>استكشف Business OS <ArrowLeft size={15} /></button><div className="feature-lines" aria-hidden="true"><span /><span /><span /></div></article>
          <article className="feature-card feature-dark"><div className="feature-card-top"><span className="feature-index">02</span><Search size={23} /></div><h3>اكتشف الأقرب<br />إليك</h3><p>سوق محلي يبدأ من احتياج حقيقي، ويصل بك إلى الخدمات والأعمال حولك.</p><div className="map-chip"><MapPin size={14} /> العريش <span>•</span> قريب منك</div></article>
          <article className="feature-card feature-sand"><div className="feature-card-top"><span className="feature-index">03</span><Sparkles size={23} /></div><h3>فكّر مع<br />مساعدك</h3><p>ذكاء اصطناعي سياقي يساعدك على رؤية الخطوة التالية، دون اختلاق بيانات أو تجاوز صلاحيات.</p><button className="round-arrow" onClick={() => notifyComingSoon("المساعد الذكي")}><ArrowLeft size={18} /></button></article>
          <article className="feature-card feature-outline"><div className="feature-card-top"><span className="feature-index">04</span><BarChart3 size={23} /></div><h3>نمو يمكن<br />قياسه</h3><p>قرارات مبنية على ما يحدث فعلاً داخل مساحتك، لا على تخمينات جميلة.</p><div className="sparkline"><span /><span /><span /><span /><span /><span /><span /></div></article>
        </div></div>
      </div></section>

      <section id="scope" className="scope-section section-space"><div className="container-wide"><div className="section-intro split-intro"><div><SectionKicker>ليس حساباً واحداً فقط</SectionKicker><h2>هوية واحدة،<br /><span>أدوار متعددة.</span></h2></div><p>من المستهلك إلى مالك النشاط والمدير والموظف ومقدم الخدمة والسائق ومدير المنصة؛ كل مستخدم يتحرك داخل صلاحياته ونطاقه، دون حسابات منفصلة لكل نشاط.</p></div><div className="role-path"><div className="role-node primary"><Users size={20} /><strong>هوية المستخدم</strong><span>حساب واحد</span></div><ArrowLeft className="role-arrow" size={22} /><div className="role-node"><Store size={20} /><strong>مساحة العمل</strong><span>Tenant / Business</span></div><ArrowLeft className="role-arrow" size={22} /><div className="role-node"><LockKeyhole size={20} /><strong>الصلاحية</strong><span>RBAC + ABAC</span></div><ArrowLeft className="role-arrow" size={22} /><div className="role-node"><Database size={20} /><strong>المورد</strong><span>Tenant-aware</span></div></div><div className="module-map"><div className="module-map-heading"><span>خريطة المنصة</span><StatusPill>بنية قابلة للتوسع</StatusPill></div><div className="module-columns"><div><span className="module-label">Business OS</span><strong>تشغيل الأعمال</strong><p>الفروع · الموظفون · العملاء · المنتجات · المخزون · المبيعات · المصروفات · التقارير · CRM والتسويق</p></div><div><span className="module-label">Marketplace</span><strong>السوق متعدد الأنواع</strong><p>المنتجات · الخدمات · المطاعم · العروض · الوظائف · العقارات · الحجوزات · السلة والطلبات</p></div><div><span className="module-label">Commerce + Finance</span><strong>تجارة ودفاتر قابلة للتدقيق</strong><p>Payment · Invoice · Refund · Ledger · Debit/Credit · Webhook idempotency</p></div><div><span className="module-label">Logistics + Signals</span><strong>لوجستيات وإشعارات</strong><p>السائقون · مناطق التوصيل · الإسناد · التتبع · In-App · Push · SMS · Email</p></div></div></div></div></section>\n\n      <section id="market" className="market-section section-space"><div className="container-wide market-layout"><div className="market-visual"><img src={marketImage} alt="مشهد سوق محلي في شمال سيناء" /><div className="market-caption"><span>السوق المحلي</span><strong>من يعرف المكان،<br />يعرف قيمته.</strong></div><div className="market-location"><MapPin size={15} /> حي المساعيد · العريش</div></div><div className="market-copy"><SectionKicker>السوق الذي يشبهك</SectionKicker><h2>الفرصة<br /><span>أقرب مما تظن.</span></h2><p>مساحة تلتقي فيها الخدمات والأعمال والاحتياجات المحلية. بحث أوضح، سياق أفضل، وخطوة أقرب إلى الناس.</p><div className="search-demo"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث عن خدمة أو نشاط" aria-label="البحث عن خدمة أو نشاط" /><button onClick={searchMarketplace}>بحث</button><span role="status">{searchStatus}</span></div><div className="market-tags"><button onClick={() => setSearch("صيانة منزلية")}>صيانة منزلية</button><button onClick={() => setSearch("مطاعم قريبة")}>مطاعم قريبة</button><button onClick={() => setSearch("تعليم وتدريب")}>تعليم وتدريب</button><button onClick={() => setSearch("حرفيون في المساعيد")}>حرفيون في المساعيد</button></div><a className="inline-link" href="#status">كيف نحمي هذه المساحة؟ <ArrowLeft size={15} /></a></div></div></section>

      <section className="taxonomy-section section-space"><div className="container-wide"><div className="section-intro split-intro"><div><SectionKicker>السوق ليس أزراراً</SectionKicker><h2>من التصنيف،<br /><span>إلى نية الشراء.</span></h2></div><p>يبدأ الاكتشاف من Category ثم Subcategory ثم Offering Type، قبل أن يصل إلى النشاط والمنتج أو الخدمة. البحث يجمع الكلمات والموقع والتوافر والعروض والنية دون استدعاء الذكاء الاصطناعي لكل كلمة.</p></div><div className="taxonomy-grid"><div className="category-panel"><div className="panel-heading"><strong>التصنيفات الأساسية</strong><span>14 مساراً</span></div><div className="category-chips"><span>الصحة والطب</span><span>المقاولات والحرف</span><span>المحاماة</span><span>التعليم والتدريب</span><span>المطاعم والأغذية</span><span>الأزياء والجمال</span><span>الهدايا والألعاب</span><span>الأثاث والديكور</span><span>الإلكترونيات</span><span>السيارات</span><span>الرياضة واللياقة</span><span>الخدمات الرقمية</span><span>النقل والمواصلات</span><span>خدمات أخرى</span></div></div><div className="architecture-panel"><div className="panel-heading"><strong>طبقة البحث</strong><span className="live-dot">قابلة للتوسع</span></div><div className="search-layers"><div><b>01</b><span>Structured Search</span></div><div><b>02</b><span>Semantic Search</span></div><div><b>03</b><span>AI Intent Understanding</span></div><div><b>04</b><span>Geo + Availability + Offers</span></div></div><div className="admin-note"><ShieldCheck size={16} /><span>مركز الإدارة والـ Audit Log يتحكمان في الصلاحيات والإجراءات الحساسة.</span></div></div></div></div></section>\n\n      <section className="readiness-section section-space"><div className="container-wide readiness-layout"><div><SectionKicker>لا بيانات بلا مصدر</SectionKicker><h2>جاهزية حقيقية،<br /><span>لا وعود مصطنعة.</span></h2><p>هذه الواجهة لا تختلق تحليلات أو مدفوعات أو تقييمات. عند الاتصال بالخادم، تظهر النتائج من صلاحيات المستخدم والمستأجر الحالي فقط، وتُسجّل الإجراءات الحساسة في Audit Log.</p></div><div className="readiness-list"><div className="readiness-item"><div className="readiness-icon"><ShieldCheck size={18} /></div><div><strong>عزل المستأجر</strong><span>Current User + Tenant + Role + Permission</span></div><StatusPill>مبدأ أساسي</StatusPill></div><div className="readiness-item"><div className="readiness-icon"><Sparkles size={18} /></div><div><strong>AI Platform</strong><span>Advisor · Search · Marketing · Forecasting · Agents</span></div><StatusPill tone="sand">يتطلب Backend</StatusPill></div><div className="readiness-item"><div className="readiness-icon"><Bell size={18} /></div><div><strong>Admin Center</strong><span>Users · Tenants · Billing · AI Safety · Audit</span></div><StatusPill tone="sand">يتطلب Backend</StatusPill></div><div className="readiness-item"><div className="readiness-icon"><BarChart3 size={18} /></div><div><strong>KPIs + Ads</strong><span>Activation · Retention · MRR · GMV · Campaigns</span></div><StatusPill tone="sand">يتطلب Backend</StatusPill></div></div></div></section>\n\n      <section id="intelligence" className="intelligence-section section-space"><div className="container-wide intelligence-layout"><div className="intelligence-copy"><SectionKicker>الذكاء، بحدود واضحة</SectionKicker><h2>مساعد يرى<br /><span>الصورة كاملة.</span></h2><p>الذكاء المفيد ليس الذي يتكلم أكثر، بل الذي يعرف ما يحق له أن يراه. مساعدك يعمل داخل سياقك، ويحترم بياناتك، ويقول «لا توجد بيانات كافية» عندما لا توجد.</p><div className="guardrail-list"><div><Check size={16} /><span>بياناتك تبقى داخل نطاقك</span></div><div><Check size={16} /><span>لا إجراءات حساسة بلا تفويض</span></div><div><Check size={16} /><span>وضوح قبل أي توصية</span></div></div><button className="button button-dark" onClick={() => notifyComingSoon("المساعد الذكي")}>تعرف على طبقة الذكاء <ArrowLeft size={17} /></button></div><div className="operations-visual"><img src={operationsImage} alt="لوحة تشغيل رقمية على مكتب دافئ" /><div className="assistant-panel"><div className="assistant-head"><span className="assistant-avatar"><Sparkles size={14} /></span><span>مساعدك الذكي</span><span className="panel-online">متصل</span></div><div className="assistant-message">أرى أن لديك 3 طلبات تحتاج متابعة اليوم في العريش. هل تريد ترتيبها حسب الأولوية؟</div><div className="assistant-actions"><button onClick={() => notifyComingSoon("ترتيب الأولويات")}>رتّبها لي</button><button onClick={() => notifyComingSoon("عرض الطلبات")}>عرض الطلبات</button></div></div></div></div></section>

      <section id="status" className="status-section section-space"><div className="container-wide"><div className="section-intro split-intro"><div><SectionKicker>الحقيقة جزء من المنتج</SectionKicker><h2>نبني بهدوء،<br /><span>ونعلن بوضوح.</span></h2></div><p>النسخة الحالية هي أساس متين: سوق خدمات، مساحات عمل، حسابات آمنة، ومساعد عام. أما الدفع والمخزون واللوجستيات فمسارات قادمة نطوّرها عندما تكتمل شروطها.</p></div><div className="status-board"><div className="status-tabs">{["نظرة عامة", "متاح الآن", "قيد التطوير"].map((tab) => <button key={tab} className={activeTab === tab ? "active" : ""} onClick={() => setActiveTab(tab)}>{tab}</button>)}</div><div className="status-content"><div className="status-summary"><span className="status-big">{activeTab === "قيد التطوير" ? "06" : "04"}</span><span>مسارات واضحة<br />في هذه المرحلة</span></div><div className="status-columns"><div><StatusPill>متاح</StatusPill><strong>الهوية ومساحات العمل</strong><p>حساب واحد متعدد الأدوار، مع نطاقات عمل واضحة.</p></div><div><StatusPill>متاح</StatusPill><strong>السوق والطلبات</strong><p>اكتشاف الخدمات، الفئات، وإنشاء طلب جديد.</p></div><div><StatusPill tone="sand">قادم</StatusPill><strong>الدفع والدفاتر</strong><p>نضيفها بعد اكتمال البنية المالية والتحقق.</p></div></div></div></div></div></section>

      <section className="cta-section"><div className="contour contour-cta" aria-hidden="true" /><div className="container-wide cta-inner"><ProductMark /><div className="cta-copy"><SectionKicker>خطوتك التالية</SectionKicker><h2>خلّ يومك<br />يمشي أخف.</h2><p>ابدأ من المكان الذي تعرفه، وابنِ فوقه ما تحتاجه فعلاً.</p></div><button className="button button-light" onClick={() => notifyComingSoon("إنشاء مساحة عمل")}>أنشئ مساحتك <ArrowLeft size={17} /></button></div></section>

      <footer className="site-footer"><div className="container-wide footer-inner"><ProductMark small /><p>إدارة أذكى.. سوق أقرب.. نمو أسرع.</p><div className="footer-links"><a href="#platform">المنصة</a><a href="#market">السوق</a><a href="#status">الحالة الحالية</a><button onClick={() => notifyComingSoon("التواصل")}>تواصل معنا</button></div><span className="footer-copy">© 2026 AI DIGITAL SINAI</span></div></footer>
      <div className="mobile-bottom-nav"><button onClick={() => document.getElementById("platform")?.scrollIntoView({ behavior: "smooth" })}><Layers3 size={18} />المنصة</button><button onClick={() => document.getElementById("market")?.scrollIntoView({ behavior: "smooth" })}><Compass size={18} />السوق</button><button onClick={() => notifyComingSoon("المساعد الذكي")}><MessageCircle size={18} />المساعد</button><button onClick={() => notifyComingSoon("الحساب")}><Users size={18} />حسابي</button></div>
    </main>
  );
}
