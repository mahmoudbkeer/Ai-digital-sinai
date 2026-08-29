export type OperationStatus = "ready" | "requires-setup" | "deferred";

export type Operation = {
  id: string;
  label: string;
  description: string;
  status: OperationStatus;
};

export type SectorModule = {
  id: string;
  label: string;
  description: string;
  operations: Operation[];
};

export type Sector = {
  id: string;
  name: string;
  eyebrow: string;
  description: string;
  modules: SectorModule[];
};

const ready = "ready" as const;
const setup = "requires-setup" as const;
const deferred = "deferred" as const;

const common = (prefix: string): SectorModule[] => [
  { id: `${prefix}-catalog`, label: "الكتالوج والخدمات", description: "إدارة ما تقدمه ومتى يظهر للعميل.", operations: [{ id: `${prefix}-publish`, label: "إنشاء ونشر عرض", description: "أدخل تفاصيل العرض ثم راجعه قبل النشر.", status: setup }, { id: `${prefix}-visibility`, label: "قواعد الظهور", description: "حدد المنطقة والفئة وحالة النشر.", status: setup }] },
  { id: `${prefix}-orders`, label: "الطلبات والمتابعة", description: "مسار واضح من الطلب إلى الإغلاق.", operations: [{ id: `${prefix}-queue`, label: "قائمة الطلبات", description: "ستظهر الطلبات الحقيقية بعد ربط مساحة العمل.", status: setup }, { id: `${prefix}-status`, label: "تحديث الحالة", description: "تحديثات موثقة مع سجل زمني.", status: setup }] },
  { id: `${prefix}-insights`, label: "الرؤية والأداء", description: "مؤشرات تساعدك على اتخاذ قرار عملي.", operations: [{ id: `${prefix}-report`, label: "تقرير الأداء", description: "تقارير قابلة للتصدير بعد تفعيل مصدر البيانات.", status: deferred }, { id: `${prefix}-alerts`, label: "تنبيهات التشغيل", description: "تنبيهات للمهام المتأخرة أو المخاطر.", status: setup }] },
];

export const sectors: Sector[] = [
  { id: "retail", name: "التجارة والتجزئة", eyebrow: "01 · بيع وتوزيع", description: "من عرض المنتج إلى الطلب والمخزون والتسليم.", modules: common("retail") },
  { id: "food", name: "الأغذية والمشروبات", eyebrow: "02 · مطاعم وإنتاج", description: "القائمة، التوريد، الطلبات، وسلامة التشغيل.", modules: common("food") },
  { id: "home-services", name: "الخدمات المنزلية", eyebrow: "03 · خدمة عند الطلب", description: "توزيع الطلبات والمواعيد ومتابعة التنفيذ.", modules: common("home") },
  { id: "crafts", name: "الحرف والصناعات", eyebrow: "04 · إنتاج محلي", description: "المنتج المحلي، المواد، والطلب المخصص.", modules: common("crafts") },
  { id: "agriculture", name: "الزراعة والإنتاج", eyebrow: "05 · مورد طبيعي", description: "الموسم، المحصول، التوريد، والمبيعات.", modules: common("agri") },
  { id: "fishing", name: "الصيد والبحر", eyebrow: "06 · اقتصاد ساحلي", description: "المصادِر، المزاد، التوريد، وسلسلة التبريد.", modules: common("fishing") },
  { id: "transport", name: "النقل واللوجستيات", eyebrow: "07 · حركة وتسليم", description: "الإسناد، المسار، الحالة، وإثبات التسليم.", modules: common("transport") },
  { id: "tourism", name: "السياحة والضيافة", eyebrow: "08 · تجربة محلية", description: "الحجز، التجربة، الضيف، والتقييم الموثق.", modules: common("tourism") },
  { id: "education", name: "التعليم والتدريب", eyebrow: "09 · معرفة ومهارة", description: "البرامج، التسجيل، الحضور، والإنجاز.", modules: common("education") },
  { id: "health", name: "الصحة والعافية", eyebrow: "10 · رعاية", description: "المواعيد والخدمات مع مراعاة الخصوصية.", modules: common("health") },
  { id: "real-estate", name: "العقارات", eyebrow: "11 · مكان وأصل", description: "العرض، التحقق، المعاينة، والمتابعة.", modules: common("estate") },
  { id: "construction", name: "المقاولات والصيانة", eyebrow: "12 · تنفيذ ومشروع", description: "النطاق، المواد، المهام، والتسليم.", modules: common("construction") },
  { id: "jobs", name: "الوظائف والمهارات", eyebrow: "13 · فرصة وعمل", description: "الفرص، الملفات، المطابقة، والتواصل.", modules: common("jobs") },
  { id: "community", name: "المجتمع والجهات", eyebrow: "14 · أثر محلي", description: "المبادرات، الموارد، والشفافية التشغيلية.", modules: common("community") },
];

export const statusLabel: Record<OperationStatus, string> = { [ready]: "جاهز", [setup]: "يتطلب إعداداً", [deferred]: "مؤجل" };
