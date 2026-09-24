import { useState } from "react";
import { createBusinessOsReconciliation, type BusinessOsReconciliation } from "@/lib/businessOsApi";

type Props = { headers: Record<string, string> };
const money = (cents: number) => `${(Number(cents) / 100).toFixed(2)} ج.م`;
const today = Date.now();
const day = 24 * 60 * 60 * 1000;

export default function BusinessOsReconciliationPanel({ headers }: Props) {
  const [draft, setDraft] = useState({ accountCode: "4000", expectedCents: "", from: String(today - 29 * day), to: String(today), note: "" });
  const [result, setResult] = useState<BusinessOsReconciliation | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const expectedCents = Number(draft.expectedCents);
    const from = Number(draft.from); const to = Number(draft.to);
    if (!/^\d{3,20}$/.test(draft.accountCode) || !Number.isSafeInteger(expectedCents) || expectedCents < 0 || !Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 0 || to < from) { setState("error"); setMessage("رمز الحساب والمبلغ والفترة غير صالحة."); return; }
    setState("loading"); setMessage("");
    try { const value = await createBusinessOsReconciliation({ accountCode: draft.accountCode, expectedCents, from, to, note: draft.note.trim() || undefined }, headers); setResult(value); setState("success"); setMessage("تم تنفيذ التسوية من الخادم وتسجيل Audit."); }
    catch (error) { setState("error"); setMessage(error instanceof Error ? error.message : "تعذر تنفيذ التسوية."); }
  };
  return <section className="mobile-plan-card" aria-label="التسوية المالية الحقيقية">
    <small>Business OS · POST /api/platform/reconciliations</small><h2>التسوية المالية</h2>
    <p>قارن الرصيد المتوقع برصيد Ledger الفعلي لحساب محدد داخل الفترة. لا يتم تعديل القيود، وتنتج العملية سجل تسوية وAudit.</p>
    <form className="mobile-command-note" onSubmit={submit}>
      <label htmlFor="reconciliation-account">رمز الحساب</label><input id="reconciliation-account" aria-label="رمز الحساب" required inputMode="numeric" value={draft.accountCode} onChange={(event) => setDraft({ ...draft, accountCode: event.target.value })} />
      <label htmlFor="reconciliation-expected">الرصيد المتوقع بالسنت</label><input id="reconciliation-expected" aria-label="الرصيد المتوقع بالسنت" required type="number" min="0" value={draft.expectedCents} onChange={(event) => setDraft({ ...draft, expectedCents: event.target.value })} placeholder="مثال: 125000" />
      <label htmlFor="reconciliation-from">بداية الفترة Unix ms</label><input id="reconciliation-from" aria-label="بداية الفترة" required type="number" min="0" value={draft.from} onChange={(event) => setDraft({ ...draft, from: event.target.value })} />
      <label htmlFor="reconciliation-to">نهاية الفترة Unix ms</label><input id="reconciliation-to" aria-label="نهاية الفترة" required type="number" min="0" value={draft.to} onChange={(event) => setDraft({ ...draft, to: event.target.value })} />
      <textarea aria-label="ملاحظة التسوية" value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} placeholder="سبب أو مرجع التسوية (اختياري)" />
      <button className="mobile-command-button" type="submit" disabled={state === "loading"}>{state === "loading" ? "جارٍ الفحص..." : "تنفيذ التسوية"}</button>
    </form>
    {result && <div className="mobile-command-note" role="status"><b>{result.status === "MATCHED" ? "متطابق" : "يوجد فرق"}</b><div className="mobile-data-row"><span>المتوقع: {money(result.expectedCents)} · الفعلي: {money(result.actualCents)} · الفرق: {money(result.varianceCents)}</span><small>المعرف: {result.reconciliationId}</small></div></div>}
    {message && <div className="mobile-command-note" role={state === "error" ? "alert" : "status"}>{message}</div>}
  </section>;
}
