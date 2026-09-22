import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createBusinessOsSupplier, loadBusinessOsSupplierHistory, loadBusinessOsSuppliers, type BusinessOsSupplier, type BusinessOsSupplierHistory } from "@/lib/businessOsApi";

type Props = { headers: Record<string, string>; businessId?: string };

const errorMessage = (error: unknown) => {
  const status = (error as { status?: number }).status;
  if (status === 401) return "سجّل الدخول لقراءة بيانات الموردين.";
  if (status === 403) return "لا تملك صلاحية قراءة أو إدارة الموردين.";
  return error instanceof Error && error.message ? error.message : "تعذر الوصول إلى بيانات الموردين.";
};

export default function BusinessOsSuppliersPanel({ headers, businessId }: Props) {
  const [suppliers, setSuppliers] = useState<BusinessOsSupplier[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [draft, setDraft] = useState({ name: "", phone: "", email: "" });
  const [mutation, setMutation] = useState(false);
  const [detail, setDetail] = useState<BusinessOsSupplierHistory | null>(null);
  const [detailState, setDetailState] = useState<"idle" | "loading" | "error">("idle");

  const refresh = async () => {
    setState("loading"); setMessage("");
    try { setSuppliers(await loadBusinessOsSuppliers(headers)); setState("ready"); }
    catch (error) { setState("error"); setMessage(errorMessage(error)); }
  };
  useEffect(() => { void refresh(); }, [headers.authorization, headers["x-tenant-id"]]);

  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return suppliers.filter((supplier) => {
      const matchesQuery = !normalized || `${supplier.name} ${supplier.phone ?? ""} ${supplier.email ?? ""}`.toLocaleLowerCase().includes(normalized);
      return matchesQuery && (statusFilter === "ALL" || supplier.status === statusFilter);
    });
  }, [suppliers, query, statusFilter]);

  const openDetail = async (supplierId: string) => {
    setDetail(null); setDetailState("loading"); setMessage("جارٍ تحميل ملف المورد وسياق المشتريات والاستلام...");
    try { setDetail(await loadBusinessOsSupplierHistory(supplierId, headers)); setDetailState("idle"); setMessage(""); }
    catch (error) { setDetailState("error"); setMessage(errorMessage(error)); }
  };

  const submitCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft.name.trim()) { setMessage("اسم المورد مطلوب."); return; }
    setMutation(true); setMessage("جارٍ إنشاء المورد عبر الخادم...");
    try {
      const created = await createBusinessOsSupplier({ businessId, name: draft.name.trim(), phone: draft.phone.trim() || undefined, email: draft.email.trim() || undefined }, headers);
      setDraft({ name: "", phone: "", email: "" });
      await refresh();
      await openDetail(created.supplierId);
      setMessage("تم إنشاء المورد وتسجيل العملية في Audit.");
    } catch (error) { setMessage(errorMessage(error)); }
    finally { setMutation(false); }
  };

  if (state === "loading") return <div className="mobile-command-note" role="status">جارٍ تحميل الموردين الحقيقيين من الخادم...</div>;
  if (state === "error") return <div className="mobile-command-note" role="alert"><b>{message}</b><button className="mobile-command-button" type="button" onClick={() => void refresh()}>إعادة المحاولة</button></div>;

  return <section className="mobile-plan-card" aria-label="إدارة الموردين الحقيقية">
    <small>Business OS · /api/platform/suppliers</small>
    <h2>إدارة الموردين</h2>
    <div className="mobile-command-note">
      <label htmlFor="supplier-search">بحث الموردين</label>
      <input id="supplier-search" aria-label="بحث الموردين" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="الاسم أو الهاتف أو البريد" />
      <select aria-label="تصفية حالة المورد" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="ALL">كل الحالات</option><option value="ACTIVE">نشط</option><option value="INACTIVE">غير نشط</option></select>
      <b>عدد الموردين: {visible.length}</b>
    </div>
    {!visible.length && <div className="mobile-empty"><b>{query.trim() || statusFilter !== "ALL" ? "لا توجد نتائج" : "لا يوجد موردون"}</b><span>أنشئ أول مورد لبدء دورة التوريد.</span></div>}
    {visible.map((supplier) => <article className="mobile-data-row" key={supplier.id}><b>{supplier.name}</b><span>{supplier.status} · {supplier.phone ?? "بدون هاتف"} · {supplier.email ?? "بدون بريد"}</span><button className="mobile-command-button" type="button" onClick={() => void openDetail(supplier.id)}>فتح ملف المورد</button></article>)}
    <form className="mobile-command-note" onSubmit={submitCreate} aria-label="إنشاء مورد">
      <h3>إنشاء مورد</h3>
      <input aria-label="اسم المورد" required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="اسم المورد" />
      <input aria-label="هاتف المورد" value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} placeholder="الهاتف (اختياري)" />
      <input aria-label="بريد المورد" type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} placeholder="البريد (اختياري)" />
      <button className="mobile-command-button" type="submit" disabled={mutation}>{mutation ? "جارٍ الحفظ..." : "إنشاء وحفظ"}</button>
    </form>
    {detailState === "loading" && <div className="mobile-command-note" role="status">جارٍ تحميل التفاصيل...</div>}
    {detailState === "error" && <div className="mobile-command-note" role="alert">تعذر تحميل تفاصيل المورد.</div>}
    {detail && <section className="mobile-command-note" aria-label="تفاصيل المورد"><button className="mobile-back-button" type="button" onClick={() => setDetail(null)}>إغلاق الملف</button><h3>{detail.supplier.name}</h3><p>{detail.supplier.phone ?? "بدون هاتف"} · {detail.supplier.email ?? "بدون بريد"} · الحالة: {detail.supplier.status}</p><h4>المشتريات والاستلام ({detail.purchases.length})</h4>{detail.purchases.length ? detail.purchases.map((purchase) => <div className="mobile-data-row" key={purchase.id}><b>{purchase.status}</b><span>{purchase.total_cents} cents · {purchase.id}</span></div>) : <span>لا توجد مشتريات أو عمليات استلام مرتبطة بهذا المورد.</span>}<h4>سجل التدقيق ({detail.audit.length})</h4>{detail.audit.length ? detail.audit.map((event) => <div className="mobile-data-row" key={event.id}><b>{event.action}</b><span>{event.resource_type} · {event.resource_id}</span></div>) : <span>لا توجد أحداث Audit متاحة.</span>}</section>}
    {message && <div className="mobile-command-note" role="status" aria-live="polite">{message}</div>}
  </section>;
}
