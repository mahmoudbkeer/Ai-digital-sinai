export type RoleKey = "consumer" | "merchant" | "admin";

export type Service = {
  id: string;
  name: string;
  business: string;
  category: string;
  area: string;
  price: string;
  eta: string;
  rating: string;
  accent: string;
  icon: "store" | "wrench" | "food" | "car";
  description: string;
  tags: string[];
};

export type RequestItem = {
  id: string;
  serviceId: string;
  serviceName: string;
  business: string;
  status: "new" | "in_progress" | "completed";
  createdAt: string;
  note: string;
};

export type AppNotification = {
  id: string;
  title: string;
  body: string;
  time: string;
  type: "request" | "growth" | "system";
  unread: boolean;
};

export const roleLabels: Record<RoleKey, string> = {
  consumer: "عميل",
  merchant: "تاجر",
  admin: "إدارة",
};

export const spaces = [
  { id: "space-1", name: "مؤسسة أفق سيناء", meta: "العريش · المقر الرئيسي", role: "مالك النشاط" },
  { id: "space-2", name: "سوق شمال سيناء", meta: "مساحة المنصة · 12 عضو", role: "مدير منصة" },
];

export const categories = ["الكل", "صيانة", "طعام", "نقل", "تصميم", "تجزئة"];

export const services: Service[] = [
  {
    id: "svc-1",
    name: "صيانة أجهزة التبريد",
    business: "ورشة النخيل الحديثة",
    category: "صيانة",
    area: "حي المساعيد",
    price: "يبدأ من 250 ج.م",
    eta: "متاح اليوم",
    rating: "4.9",
    accent: "#0E7C7B",
    icon: "wrench",
    description: "فحص وصيانة أجهزة التبريد المنزلية والتجارية مع زيارة ميدانية داخل العريش.",
    tags: ["زيارة ميدانية", "ضمان 30 يوماً"],
  },
  {
    id: "svc-2",
    name: "ضيافة محلية للمناسبات",
    business: "مطبخ رمال سيناء",
    category: "طعام",
    area: "وسط العريش",
    price: "من 85 ج.م للفرد",
    eta: "حجز مسبق",
    rating: "4.8",
    accent: "#E09F3E",
    icon: "food",
    description: "قوائم ضيافة مستوحاة من المطبخ السيناوي للمناسبات الصغيرة واجتماعات الفرق.",
    tags: ["قوائم مرنة", "توريد محلي"],
  },
  {
    id: "svc-3",
    name: "توصيل داخل المدينة",
    business: "خطوة قريبة للنقل",
    category: "نقل",
    area: "كل أحياء العريش",
    price: "حسب المسافة",
    eta: "خلال 45 دقيقة",
    rating: "4.7",
    accent: "#305A7A",
    icon: "car",
    description: "توصيل طلبات الأعمال والعملاء داخل المدينة مع تحديثات حالة واضحة.",
    tags: ["تتبع الحالة", "دفع عند الاستلام"],
  },
  {
    id: "svc-4",
    name: "هوية بصرية للنشاط",
    business: "استوديو موجة",
    category: "تصميم",
    area: "عن بُعد · شمال سيناء",
    price: "من 1,800 ج.م",
    eta: "موعد خلال 3 أيام",
    rating: "4.9",
    accent: "#7C5C8E",
    icon: "store",
    description: "هوية بصرية عملية للأنشطة المحلية تشمل الشعار، الألوان، وقوالب التواصل.",
    tags: ["ملف قابل للتعديل", "جلسة تعريف"],
  },
  {
    id: "svc-5",
    name: "توريد مستلزمات المقاهي",
    business: "بوابة الواحة للتوريد",
    category: "تجزئة",
    area: "العبور",
    price: "أسعار جملة",
    eta: "تسليم غداً",
    rating: "4.6",
    accent: "#A45D3A",
    icon: "store",
    description: "توريد أسبوعي للمواد الأساسية ومستلزمات التشغيل للمقاهي والمطاعم الصغيرة.",
    tags: ["فاتورة واضحة", "توصيل مجدول"],
  },
];

export const initialRequests: RequestItem[] = [
  { id: "REQ-2048", serviceId: "svc-1", serviceName: "صيانة أجهزة التبريد", business: "ورشة النخيل الحديثة", status: "in_progress", createdAt: "اليوم، 09:40", note: "فحص ثلاجة العرض في الفرع الرئيسي" },
  { id: "REQ-2042", serviceId: "svc-3", serviceName: "توصيل داخل المدينة", business: "خطوة قريبة للنقل", status: "new", createdAt: "أمس، 16:20", note: "استلام شحنة من حي المساعيد" },
  { id: "REQ-1987", serviceId: "svc-4", serviceName: "هوية بصرية للنشاط", business: "استوديو موجة", status: "completed", createdAt: "12 أغسطس", note: "اعتماد النسخة الأولى من الهوية" },
];

export const initialNotifications: AppNotification[] = [
  { id: "ntf-1", title: "الطلب REQ-2048 قيد التنفيذ", body: "أضافت ورشة النخيل تحديثاً جديداً على طلب الصيانة.", time: "منذ 12 دقيقة", type: "request", unread: true },
  { id: "ntf-2", title: "إشارة نمو جديدة", body: "ارتفع اكتشاف خدماتك المحلية هذا الأسبوع.", time: "منذ ساعتين", type: "growth", unread: true },
  { id: "ntf-3", title: "مراجعة إعدادات التنبيهات", body: "اختر نوع التحديثات التي تريد رؤيتها في مركز واحد.", time: "أمس", type: "system", unread: false },
];

export const merchantMetrics = [
  { label: "طلبات تحتاج إجراء", value: "08", trend: "+12%", tone: "teal" as const },
  { label: "اكتشافات هذا الأسبوع", value: "164", trend: "+24%", tone: "copper" as const },
  { label: "معدل الاستجابة", value: "92%", trend: "مستقر", tone: "navy" as const },
];

export const consumerCollections = [
  { title: "قريب منك", copy: "خدمات داخل العريش", icon: "location.fill" as const, color: "#D7F4EF" },
  { title: "موثوق محلياً", copy: "ملفات واضحة وتقييمات", icon: "checkmark.seal.fill" as const, color: "#F4E6CF" },
  { title: "تابع بسهولة", copy: "كل طلب في مسار واحد", icon: "arrow.triangle.2.circlepath" as const, color: "#E8E0F3" },
];

export function getServiceById(id?: string) {
  return services.find((service) => service.id === id) ?? services[0];
}

export function getStatusLabel(status: RequestItem["status"]) {
  return { new: "جديد", in_progress: "قيد التنفيذ", completed: "مكتمل" }[status];
}

export function getServiceIcon(icon: Service["icon"]) {
  return { store: "building.2.fill", wrench: "wrench.and.screwdriver.fill", food: "fork.knife", car: "car.fill" } as const satisfies Record<Service["icon"], string>;
}
