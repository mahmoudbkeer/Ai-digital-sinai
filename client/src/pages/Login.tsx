import { FormEvent, useState } from "react";
import { ArrowLeft, Check, Eye, EyeOff, Globe2, LockKeyhole, Sparkles } from "lucide-react";

const googleClientId = import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID || "";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [language, setLanguage] = useState<"ar" | "en">("ar");
  const [status, setStatus] = useState<{ tone: "error" | "success" | "setup"; message: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const submitLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setStatus(null);
    try {
      const response = await fetch("/api/platform/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const result = await response.json() as { token?: string; tenants?: Array<{ tenant_id: string }>; message?: string };
      if (!response.ok || !result.token) {
        setStatus({ tone: "error", message: result.message ?? "تعذر تسجيل الدخول. Unable to sign you in." });
        return;
      }
      const tenantId = result.tenants?.[0]?.tenant_id;
      if (!tenantId) {
        setStatus({ tone: "error", message: "الحساب لا يملك مساحة عمل صالحة. This account has no valid workspace." });
        return;
      }
      localStorage.setItem("platform_token", result.token);
      localStorage.setItem("platform_tenant_id", tenantId);
      setStatus({ tone: "success", message: "تم تسجيل الدخول بأمان. Signed in securely." });
    } catch {
      setStatus({ tone: "error", message: "تعذر الوصول إلى الخادم التجريبي. The test backend is unavailable." });
    } finally {
      setLoading(false);
    }
  };

  const continueWithGoogle = () => {
    if (!googleClientId) {
      setStatus({ tone: "setup", message: "REQUIRES_SETUP · أضف GOOGLE_OAUTH_CLIENT_ID قبل تفعيل Google Sign-In. Add the client ID to enable Google Sign-In." });
      return;
    }
    setStatus({ tone: "setup", message: "REQUIRES_SETUP · تم إعداد Client ID، لكن تدفق الخادم والتحقق من JWT يحتاجان إلى ربط OAuth قبل الاستخدام الحقيقي." });
  };

  return (
    <main className="login-page" dir={language === "ar" ? "rtl" : "ltr"}>
      <div className="login-orbit login-orbit-violet" aria-hidden="true" />
      <div className="login-orbit login-orbit-teal" aria-hidden="true" />
      <div className="login-grid" aria-hidden="true" />
      <section className="login-visual" aria-label="AI Digital Sinai brand introduction">
        <button className="login-back" type="button" onClick={() => { window.location.href = "/landing"; }}>
          <ArrowLeft size={17} /> {language === "ar" ? "العودة للموقع" : "Back to site"}
        </button>
        <div className="login-brand-lockup">
          <span className="login-brand-symbol"><Sparkles size={21} /></span>
          <span><strong>AI DIGITAL</strong><b>SINAI</b></span>
        </div>
        <div className="login-visual-copy">
          <p className="login-eyebrow"><span /> {language === "ar" ? "هوية تشغيلية واحدة" : "One operating identity"}</p>
          <h1>{language === "ar" ? <>اتخذ الخطوة<br /><em>الأوضح.</em></> : <>Make the next<br /><em>clear move.</em></>}</h1>
          <p>{language === "ar" ? "مساحة آمنة تجمع إشارات عملك، سوقك، وقراراتك في إيقاع واحد." : "A secure space for your business signals, local market, and next decisions."}</p>
        </div>
        <div className="login-signal-card">
          <div className="signal-card-top"><span>NOCTURNE SIGNAL</span><span className="signal-live"><i /> LIVE</span></div>
          <div className="signal-graph"><span /><span /><span /><span /><span /><span /><span /><b /></div>
          <div className="signal-metrics"><span><b>08</b><small>modules</small></span><span><b>24/7</b><small>guardrails</small></span><span><b>01</b><small>workspace</small></span></div>
        </div>
      </section>

      <section className="login-panel" aria-label="Login form">
        <div className="login-panel-top">
          <div className="login-language"><Globe2 size={15} /><button className={language === "ar" ? "active" : ""} onClick={() => setLanguage("ar")} type="button">العربية</button><span>/</span><button className={language === "en" ? "active" : ""} onClick={() => setLanguage("en")} type="button">English</button></div>
          <span className="login-secure"><LockKeyhole size={14} /> Secure access</span>
        </div>
        <div className="login-form-wrap">
          <p className="login-kicker">{language === "ar" ? "مرحباً بعودتك" : "Welcome back"}</p>
          <h2>{language === "ar" ? "تسجيل الدخول" : "Sign in"}</h2>
          <p className="login-subtitle">{language === "ar" ? "أكمل إلى مساحة العمل الخاصة بك." : "Continue to your workspace."}</p>
          <button className="google-login-button" type="button" onClick={continueWithGoogle}>
            <span className="google-glyph">G</span>
            <span>{language === "ar" ? "المتابعة بحساب Google" : "Continue with Google"}</span>
            <small>{googleClientId ? "READY" : "REQUIRES_SETUP"}</small>
          </button>
          <div className="login-divider"><span>{language === "ar" ? "أو بالبريد الإلكتروني" : "or with email"}</span></div>
          <form onSubmit={submitLogin} className="login-form">
            <label htmlFor="login-email">{language === "ar" ? "البريد الإلكتروني" : "Email address"}<input id="login-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@workspace.com" required /></label>
            <label htmlFor="login-password">{language === "ar" ? "كلمة المرور" : "Password"}<span className="password-field"><input id="login-password" type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••••••" required /><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></span></label>
            <div className="login-form-meta"><label className="login-check"><input type="checkbox" /> <span>{language === "ar" ? "تذكرني" : "Remember me"}</span></label><button type="button" onClick={() => setStatus({ tone: "setup", message: "استعادة كلمة المرور ستُربط بتدفق البريد الآمن في خطوة لاحقة." })}>{language === "ar" ? "نسيت كلمة المرور؟" : "Forgot password?"}</button></div>
            <button className="login-submit" type="submit" disabled={loading}>{loading ? "..." : language === "ar" ? "الدخول إلى مساحة العمل" : "Enter workspace"}<ArrowLeft size={17} /></button>
          </form>
          {status && <div className={`login-status ${status.tone}`} role="status">{status.tone === "success" && <Check size={16} />}{status.message}</div>}
          <p className="login-terms">{language === "ar" ? "بالمتابعة، أنت توافق على شروط الاستخدام وسياسة الخصوصية." : "By continuing, you agree to our Terms and Privacy Policy."}</p>
        </div>
        <div className="login-footer"><span>© 2026 AI Digital Sinai</span><span>Prototype · Web Login</span></div>
      </section>
    </main>
  );
}
