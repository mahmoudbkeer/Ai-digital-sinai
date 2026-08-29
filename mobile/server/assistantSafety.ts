const WINDOW_MS = 60_000;
const MAX_MESSAGES_PER_WINDOW = 12;

type Counter = { startedAt: number; count: number };
const counters = new Map<string, Counter>();

export const publicAssistantKnowledge = [
  "AI DIGITAL SINAI منصة متعددة المسارات للعميل والتاجر ومقدم الخدمة والإدارة.",
  "المنصة تستخدم مساحة عمل tenant لعزل بيانات كل جهة، وتدعم سوق خدمات واكتشافاً وطلبات واشتراكات.",
  "المساعد لا يطلب كلمات مرور أو بيانات دفع أو معلومات حساسة، ولا يخترع أسعاراً أو شهادات عملاء أو أرقام نجاح.",
  "للوصول إلى الوحدات الداخلية يلزم تسجيل الدخول، وتظهر أدوات الإدارة للمستخدم الإداري فقط.",
].join(" ");

export function consumeAssistantQuota(sessionKey: string, now = Date.now()): { allowed: boolean; remaining: number } {
  const current = counters.get(sessionKey);
  if (!current || now - current.startedAt >= WINDOW_MS) {
    counters.set(sessionKey, { startedAt: now, count: 1 });
    return { allowed: true, remaining: MAX_MESSAGES_PER_WINDOW - 1 };
  }
  if (current.count >= MAX_MESSAGES_PER_WINDOW) return { allowed: false, remaining: 0 };
  current.count += 1;
  return { allowed: true, remaining: MAX_MESSAGES_PER_WINDOW - current.count };
}

export function resetAssistantQuotaForTests() {
  counters.clear();
}

export const assistantQuota = { windowMs: WINDOW_MS, maxMessages: MAX_MESSAGES_PER_WINDOW };
