import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  addBusinessOsCustomerInteraction,
  addBusinessOsCustomerTag,
  createBusinessOsCustomer,
  loadBusinessOsCustomerHistory,
  loadBusinessOsCustomers,
  type BusinessOsCustomer,
  type BusinessOsCustomerHistory,
} from "@/lib/businessOsApi";

type Props = { headers: Record<string, string> };
type LoadState = "loading" | "ready" | "auth" | "error";

const errorMessage = (error: unknown) => {
  const status = (error as { status?: number }).status;
  if (status === 401) return "سجّل الدخول لقراءة بيانات العملاء.";
  if (status === 403) return "لا تملك صلاحية قراءة أو إدارة العملاء.";
  return error instanceof Error ? error.message : "تعذر الوصول إلى بيانات العملاء.";
};

export function BusinessOsCustomersPanel({ headers }: Props) {
  const [customers, setCustomers] = useState<BusinessOsCustomer[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [createValues, setCreateValues] = useState({ name: "", phone: "", email: "" });
  const [selected, setSelected] = useState<BusinessOsCustomerHistory | null>(null);
  const [interaction, setInteraction] = useState({ interactionType: "NOTE", note: "" });
  const [tagName, setTagName] = useState("");
  const [mutation, setMutation] = useState<"idle" | "loading">("idle");

  const refresh = async () => {
    setState("loading");
    setMessage("");
    try {
      setCustomers(await loadBusinessOsCustomers(headers, query));
      setState("ready");
    } catch (error) {
      const status = (error as { status?: number }).status;
      setState(status === 401 || status === 403 ? "auth" : "error");
      setMessage(errorMessage(error));
    }
  };

  useEffect(() => { void refresh(); }, [headers.authorization, headers["x-tenant-id"]]);

  const visibleCustomers = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return customers;
    return customers.filter((customer) => `${customer.name} ${customer.phone ?? ""} ${customer.email ?? ""}`.toLocaleLowerCase().includes(normalized));
  }, [customers, query]);

  const openCustomer = async (customerId: string) => {
    setMessage("جارٍ تحميل ملف العميل وسجل العلاقة...");
    try {
      setSelected(await loadBusinessOsCustomerHistory(customerId, headers));
      setMessage("");
    } catch (error) {
      setMessage(errorMessage(error));
    }
  };

  const submitCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!createValues.name.trim()) { setMessage("اسم العميل مطلوب."); return; }
    setMutation("loading");
    setMessage("جارٍ إنشاء العميل عبر الخادم...");
    try {
      await createBusinessOsCustomer({ name: createValues.name.trim(), phone: createValues.phone.trim() || undefined, email: createValues.email.trim() || undefined }, headers);
      setCreateValues({ name: "", phone: "", email: "" });
      await refresh();
      setMessage("تم إنشاء العميل وتسجيل العملية في Audit.");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally { setMutation("idle"); }
  };

  const submitInteraction = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected || !interaction.note.trim()) { setMessage("نوع التفاعل والملاحظة مطلوبان."); return; }
    setMutation("loading");
    try {
      await addBusinessOsCustomerInteraction(selected.customer.id, { interactionType: interaction.interactionType, note: interaction.note.trim() }, headers);
      setInteraction({ interactionType: "NOTE", note: "" });
      setSelected(await loadBusinessOsCustomerHistory(selected.customer.id, headers));
      setMessage("تمت إضافة التفاعل وتسجيله في Audit.");
    } catch (error) { setMessage(errorMessage(error)); }
    finally { setMutation("idle"); }
  };

  const submitTag = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected || !tagName.trim()) { setMessage("اسم الوسم مطلوب."); return; }
    setMutation("loading");
    try {
      await addBusinessOsCustomerTag(selected.customer.id, tagName.trim(), headers);
      setTagName("");
      setSelected(await loadBusinessOsCustomerHistory(selected.customer.id, headers));
      setMessage("تمت إضافة الوسم وتسجيل العملية في Audit.");
    } catch (error) { setMessage(errorMessage(error)); }
    finally { setMutation("idle"); }
  };

  if (state === "loading") return <div className="mobile-command-note" role="status">جارٍ تحميل العملاء الحقيقيين من الخادم...</div>;
  if (state === "auth" || state === "error") return <div className="mobile-command-note" role="alert">{message}</div>;

  return <section className="mobile-plan-card" aria-label="إدارة العملاء الحقيقية">
    <small>Business OS · /api/platform/customers</small>
    <h2>إدارة العملاء</h2>
    <div className="mobile-command-note">
      <input aria-label="بحث العملاء" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="بحث بالاسم أو الهاتف أو البريد" />
      <button className="mobile-command-button" type="button" onClick={() => void refresh()}>تطبيق البحث</button>
      <b>عدد العملاء: {visibleCustomers.length}</b>
    </div>
    {!visibleCustomers.length && <div className="mobile-empty"><b>لا يوجد عملاء</b><span>لم يعثر الخادم على عملاء ضمن نطاق مساحة العمل والفلتر الحالي.</span></div>}
    {visibleCustomers.map((customer) => <article key={customer.id} className="mobile-data-row">
      <b>{customer.name}</b><span>{customer.phone ?? "بدون هاتف"} · {customer.email ?? "بدون بريد"} · {new Date(customer.created_at).toLocaleDateString("ar-EG")}</span>
      <button className="mobile-command-button" type="button" onClick={() => void openCustomer(customer.id)}>فتح ملف العميل</button>
    </article>)}
    <form className="mobile-command-note" onSubmit={submitCreate} aria-label="إنشاء عميل">
      <h3>إنشاء عميل</h3>
      <input aria-label="اسم العميل" required value={createValues.name} onChange={(event) => setCreateValues({ ...createValues, name: event.target.value })} placeholder="اسم العميل" />
      <input aria-label="هاتف العميل" value={createValues.phone} onChange={(event) => setCreateValues({ ...createValues, phone: event.target.value })} placeholder="الهاتف (اختياري)" />
      <input aria-label="بريد العميل" type="email" value={createValues.email} onChange={(event) => setCreateValues({ ...createValues, email: event.target.value })} placeholder="البريد (اختياري)" />
      <button className="mobile-command-button" type="submit" disabled={mutation === "loading"}>{mutation === "loading" ? "جارٍ الحفظ..." : "إنشاء وحفظ"}</button>
    </form>
    {selected && <section className="mobile-command-note" aria-label="تفاصيل العميل">
      <button className="mobile-back-button" type="button" onClick={() => setSelected(null)}>إغلاق الملف</button>
      <h3>{selected.customer.name}</h3>
      <p>{selected.customer.phone ?? "بدون هاتف"} · {selected.customer.email ?? "بدون بريد"} · {new Date(selected.customer.created_at).toLocaleDateString("ar-EG")}</p>
      <h4>سجل الطلبات ({selected.orders.length})</h4>
      {selected.orders.map((order) => <div className="mobile-data-row" key={order.id}><b>{order.id}</b><span>{order.state} · {order.total_cents} سنت · {new Date(order.created_at).toLocaleDateString("ar-EG")}</span></div>)}
      <h4>التفاعلات ({selected.interactions.length})</h4>
      {selected.interactions.map((item) => <div className="mobile-data-row" key={item.id}><b>{item.interaction_type}</b><span>{item.note} · {new Date(item.created_at).toLocaleDateString("ar-EG")}</span></div>)}
      <h4>الأوسمة</h4><div className="mobile-chip-row">{selected.tags.length ? selected.tags.map((tag) => <span key={tag.id}>{tag.name}</span>) : <span>لا توجد أوسمة</span>}</div>
      <form className="mobile-command-note" onSubmit={submitInteraction} aria-label="إضافة تفاعل CRM"><h4>إضافة تفاعل</h4><select aria-label="نوع التفاعل" value={interaction.interactionType} onChange={(event) => setInteraction({ ...interaction, interactionType: event.target.value })}><option value="NOTE">ملاحظة</option><option value="CALL">مكالمة</option><option value="VISIT">زيارة</option><option value="FOLLOW_UP">متابعة</option></select><textarea aria-label="ملاحظة التفاعل" required value={interaction.note} onChange={(event) => setInteraction({ ...interaction, note: event.target.value })} placeholder="اكتب ملاحظة موثقة" /><button className="mobile-command-button" type="submit" disabled={mutation === "loading"}>حفظ التفاعل</button></form>
      <form className="mobile-command-note" onSubmit={submitTag} aria-label="إضافة وسم للعميل"><h4>إضافة وسم</h4><input aria-label="اسم الوسم" required value={tagName} onChange={(event) => setTagName(event.target.value)} placeholder="عميل مهم" /><button className="mobile-command-button" type="submit" disabled={mutation === "loading"}>حفظ الوسم</button></form>
    </section>}
    {message && <div className="mobile-command-note" role="status">{message}</div>}
  </section>;
}

export default BusinessOsCustomersPanel;
