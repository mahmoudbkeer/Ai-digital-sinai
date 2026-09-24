import { useEffect, useState } from "react";
import { loadBusinessOsProfit, type BusinessOsProfit } from "@/lib/businessOsApi";

type Props = { headers: Record<string, string> };
const money = (cents: number) => `${(Number(cents) / 100).toFixed(2)} ج.م`;
const dateInput = (value: number) => new Date(value).toISOString().slice(0, 10);
const startOfDay = (value: string) => new Date(`${value}T00:00:00`).getTime();
const endOfDay = (value: string) => new Date(`${value}T23:59:59.999`).getTime();

export default function BusinessOsProfitPanel({ headers }: Props) {
  const today = new Date();
  const initialTo = today.getTime();
  const initialFrom = initialTo - 29 * 24 * 60 * 60 * 1000;
  const [from, setFrom] = useState(dateInput(initialFrom));
  const [to, setTo] = useState(dateInput(initialTo));
  const [report, setReport] = useState<BusinessOsProfit | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [message, setMessage] = useState("");

  const refresh = async () => {
    const fromMs = startOfDay(from);
    const toMs = endOfDay(to);
    if (!Number.isSafeInteger(fromMs) || !Number.isSafeInteger(toMs) || fromMs > toMs) { setMessage("يجب أن يكون تاريخ البداية قبل تاريخ النهاية."); return; }
    setState("loading"); setMessage("");
    try { setReport(await loadBusinessOsProfit(headers, { from: fromMs, to: toMs })); setState("ready"); }
    catch (error) { setState("error"); setMessage(error instanceof Error ? error.message : "تعذر تحميل تقرير الربحية."); }
  };
  useEffect(() => { void refresh(); }, [headers.authorization, headers["x-tenant-id"]]);

  if (state === "loading" && !report) return <div className="mobile-command-note" role="status">جارٍ تحميل تقرير الربحية الحقيقي...</div>;
  if (state === "error" && !report) return <div className="mobile-command-note" role="alert"><b>{message}</b><button className="mobile-command-button" type="button" onClick={() => void refresh()}>إعادة المحاولة</button></div>;
  return <section className="mobile-plan-card" aria-label="تقرير الربحية التشغيلي">
    <small>Business OS · GET /api/platform/reports/profit</small><h2>الربحية التشغيلية</h2>
    <div className="mobile-command-note"><label htmlFor="profit-from">من</label><input id="profit-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /><label htmlFor="profit-to">إلى</label><input id="profit-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} /><button className="mobile-command-button" type="button" onClick={() => void refresh()} disabled={state === "loading"}>{state === "loading" ? "جارٍ التحديث..." : "تحديث التقرير"}</button></div>
    {report && <><div className="mobile-kpi-grid"><div><small>الإيراد</small><b>{money(report.report.revenue_cents)}</b></div><div><small>تكلفة المخزون</small><b>{money(report.report.inventory_cost_cents)}</b></div><div><small>المصروفات التشغيلية</small><b>{money(report.report.operating_expense_cents)}</b></div><div><small>صافي المؤشر</small><b>{money(report.report.net_profit_cents)}</b></div></div><div className="mobile-command-note"><b>المصدر: {report.source}</b><p>هذا مؤشر تشغيلي محسوب من الطلبات المكتملة وتكلفة مشتريات Ledger والمصروفات المرحّلة. لا يُعرض كقائمة دخل محاسبية نهائية.</p><span>الفترة: {new Date(report.period.from).toLocaleDateString("ar-EG")} — {new Date(report.period.to).toLocaleDateString("ar-EG")}</span></div></>}
    {message && <div className="mobile-command-note" role="status">{message}</div>}
  </section>;
}
