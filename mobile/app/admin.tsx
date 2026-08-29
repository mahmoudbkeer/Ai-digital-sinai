import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, useRouter } from "expo-router";

import { AppHeader, EmptyState, MetricCard, SectionHeader, SoftButton, Surface } from "@/components/app-ui";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useAppState } from "@/lib/app-store";
import { useColors } from "@/hooks/use-colors";

export default function AdminScreen() {
  const colors = useColors();
  const router = useRouter();
  const { role } = useAppState();
  if (role !== "admin") return <ScreenContainer className="px-5 pt-4" edges={["top", "left", "right", "bottom"]}><Stack.Screen options={{ animation: "slide_from_right" }} /><AppHeader title="مركز الإدارة" subtitle="صلاحية غير متاحة" /><EmptyState icon="shield.fill" title="الوصول غير متاح" copy="مركز الإدارة محمي بصلاحيات الخادم. غيّر الدور إلى إدارة لمسار المعاينة." action="العودة إلى الحساب" onAction={() => router.replace("/(tabs)/account" as never)} /></ScreenContainer>;
  return <ScreenContainer className="px-5 pt-4" edges={["top", "left", "right"]}><Stack.Screen options={{ animation: "slide_from_right" }} /><ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}><AppHeader title="مركز الإدارة" subtitle="رؤية موحدة · حوكمة قابلة للتدقيق" /><View style={[styles.governance, { backgroundColor: "#0B1F33" }]}><View style={styles.governanceTop}><Text style={styles.governanceLabel}>SYSTEM GOVERNANCE</Text><IconSymbol name="shield.fill" size={21} color="#49C8BC" /></View><Text style={styles.governanceTitle}>السوق تحت المراقبة الهادئة</Text><Text style={styles.governanceCopy}>تظهر الإجراءات الحساسة هنا بعد تحقق الخادم وتسجيلها في سجل التدقيق.</Text><View style={styles.health}><View style={styles.healthDot} /><Text style={styles.healthText}>كل الأنظمة تعمل</Text></View></View><SectionHeader title="لقطة المنصة" /><View style={styles.metricsRow}><MetricCard label="المستأجرون" value="24" trend="+8%" tone="teal" /><MetricCard label="الطلبات اليوم" value="86" trend="+14%" tone="copper" /><MetricCard label="معدل الصحة" value="99%" trend="مستقر" tone="navy" /></View><SectionHeader title="وحدات الإدارة" /><View style={styles.moduleGrid}><Surface style={styles.moduleCard}><View style={[styles.moduleIcon, { backgroundColor: "#D7F4EF" }]}><IconSymbol name="person.2.fill" size={20} color={colors.primary} /></View><Text style={[styles.moduleTitle, { color: colors.foreground }]}>المستخدمون</Text><Text style={[styles.moduleText, { color: colors.muted }]}>الحسابات والأدوار</Text></Surface><Surface style={styles.moduleCard}><View style={[styles.moduleIcon, { backgroundColor: "#F4E6CF" }]}><IconSymbol name="building.2.fill" size={20} color={colors.warning} /></View><Text style={[styles.moduleTitle, { color: colors.foreground }]}>المستأجرون</Text><Text style={[styles.moduleText, { color: colors.muted }]}>الأنشطة والمساحات</Text></Surface><Surface style={styles.moduleCard}><View style={[styles.moduleIcon, { backgroundColor: "#E8E0F3" }]}><IconSymbol name="shield.fill" size={20} color="#7C5C8E" /></View><Text style={[styles.moduleTitle, { color: colors.foreground }]}>التدقيق</Text><Text style={[styles.moduleText, { color: colors.muted }]}>أحداث أمنية مسجلة</Text></Surface><Surface style={styles.moduleCard}><View style={[styles.moduleIcon, { backgroundColor: "#E3F4EC" }]}><IconSymbol name="chart.bar.fill" size={20} color={colors.success} /></View><Text style={[styles.moduleTitle, { color: colors.foreground }]}>الاشتراكات</Text><Text style={[styles.moduleText, { color: colors.muted }]}>خطط وتجارب</Text></Surface></View><SectionHeader title="آخر إشارة تدقيق" /><Surface style={styles.auditCard}><View style={[styles.auditIcon, { backgroundColor: "#D7F4EF" }]}><IconSymbol name="checkmark.circle.fill" size={18} color={colors.success} /></View><View style={styles.auditCopy}><Text style={[styles.auditTitle, { color: colors.foreground }]}>تم تحديث صلاحية مساحة</Text><Text style={[styles.auditText, { color: colors.muted }]}>actor: platform-admin · tenant: سوق شمال سيناء</Text><Text style={[styles.auditTime, { color: colors.muted }]}>منذ 4 دقائق</Text></View></Surface><SoftButton onPress={() => router.replace("/(tabs)/account" as never)} icon="arrow.left">العودة إلى حسابي</SoftButton></ScrollView></ScreenContainer>;
}

const styles = StyleSheet.create({
  content: { paddingBottom: 32 },
  governance: { borderRadius: 23, padding: 18, marginBottom: 24 },
  governanceTop: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" },
  governanceLabel: { color: "#B5CFCD", fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  governanceTitle: { color: "#FFFFFF", textAlign: "right", fontSize: 23, fontWeight: "800", marginTop: 19 },
  governanceCopy: { color: "#B0C2C4", textAlign: "right", fontSize: 12, lineHeight: 20, marginTop: 7 },
  health: { flexDirection: "row-reverse", alignItems: "center", gap: 6, marginTop: 17 },
  healthDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#49C8BC" },
  healthText: { color: "#BFE7DF", fontSize: 11, fontWeight: "700" },
  metricsRow: { flexDirection: "row-reverse", gap: 8, marginBottom: 24 },
  moduleGrid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 9, marginBottom: 24 },
  moduleCard: { width: "48.5%", minHeight: 130, padding: 14 },
  moduleIcon: { width: 39, height: 39, borderRadius: 13, alignItems: "center", justifyContent: "center", alignSelf: "flex-end" },
  moduleTitle: { fontSize: 14, fontWeight: "800", textAlign: "right", marginTop: 14 },
  moduleText: { fontSize: 11, textAlign: "right", marginTop: 4 },
  auditCard: { flexDirection: "row-reverse", alignItems: "flex-start", padding: 15, marginBottom: 12 },
  auditIcon: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center", marginLeft: 11 },
  auditCopy: { flex: 1, alignItems: "flex-end" },
  auditTitle: { fontSize: 13, fontWeight: "800" },
  auditText: { fontSize: 10, marginTop: 5, textAlign: "right" },
  auditTime: { fontSize: 10, marginTop: 6 },
});
