import { FlatList, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, useRouter } from "expo-router";

import { AppHeader, MetricCard, PrimaryButton, SectionHeader, StatusBadge, Surface } from "@/components/app-ui";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { merchantMetrics } from "@/lib/demo-data";
import { useAppState } from "@/lib/app-store";
import { useColors } from "@/hooks/use-colors";

export default function WorkspaceScreen() {
  const colors = useColors();
  const router = useRouter();
  const { requests, spaceId } = useAppState();
  const openRequests = requests.filter((item) => item.status !== "completed");
  return <ScreenContainer className="px-5 pt-4" edges={["top", "left", "right"]}><Stack.Screen options={{ animation: "slide_from_right" }} /><ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}><AppHeader title="لوحة التشغيل" subtitle={`مؤسسة أفق سيناء · ${spaceId === "space-2" ? "مدير منصة" : "مالك النشاط"}`} /><View style={[styles.signalBanner, { backgroundColor: "#0B1F33" }]}><View style={styles.signalTop}><Text style={styles.signalEyebrow}>إشارة اليوم · 08 / 2026</Text><IconSymbol name="chart.bar.fill" size={20} color="#49C8BC" /></View><Text style={styles.signalTitle}>ركّز على ما يتحرك الآن</Text><Text style={styles.signalText}>لديك طلبات مفتوحة وتفاعل متزايد مع الخدمات المحلية.</Text><View style={styles.signalTrack}><View style={styles.signalFill} /></View></View><SectionHeader title="مؤشرات اليوم" /><View style={styles.metricsRow}>{merchantMetrics.map((metric) => <MetricCard key={metric.label} {...metric} />)}</View><SectionHeader title="مسارات الإدارة" /><View style={styles.actionGrid}><Surface style={styles.actionCard}><View style={[styles.actionIcon, { backgroundColor: "#D7F4EF" }]}><IconSymbol name="building.2.fill" size={21} color={colors.primary} /></View><Text style={[styles.actionTitle, { color: colors.foreground }]}>منشأتي</Text><Text style={[styles.actionCopy, { color: colors.muted }]}>الملف، الخدمات، والظهور</Text></Surface><Surface style={styles.actionCard}><View style={[styles.actionIcon, { backgroundColor: "#F4E6CF" }]}><IconSymbol name="person.2.fill" size={21} color={colors.warning} /></View><Text style={[styles.actionTitle, { color: colors.foreground }]}>الفريق</Text><Text style={[styles.actionCopy, { color: colors.muted }]}>أدوار وصلاحيات واضحة</Text></Surface></View><SectionHeader title="تحتاج إجراء" action="كل الطلبات" onAction={() => router.push("/(tabs)/requests" as never)} /><FlatList scrollEnabled={false} data={openRequests} keyExtractor={(item) => item.id} renderItem={({ item }) => <Surface style={styles.requestCard}><View style={styles.requestTop}><StatusBadge status={item.status} /><Text style={[styles.requestId, { color: colors.muted }]}>{item.id}</Text></View><Text style={[styles.requestTitle, { color: colors.foreground }]}>{item.serviceName}</Text><Text style={[styles.requestNote, { color: colors.muted }]}>{item.note}</Text></Surface>} ListEmptyComponent={<Surface style={styles.noRequests}><IconSymbol name="checkmark.circle.fill" size={24} color={colors.success} /><Text style={[styles.noRequestsTitle, { color: colors.foreground }]}>لا توجد إجراءات معلقة</Text><Text style={[styles.noRequestsText, { color: colors.muted }]}>كل المسارات محدثة الآن.</Text></Surface>} /><View style={styles.bottomAction}><PrimaryButton onPress={() => router.push("/assistant" as never)} icon="sparkles">اسأل رفيق الإشارة</PrimaryButton></View></ScrollView></ScreenContainer>;
}

const styles = StyleSheet.create({
  content: { paddingBottom: 32 },
  signalBanner: { borderRadius: 23, padding: 18, marginBottom: 24 },
  signalTop: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" },
  signalEyebrow: { color: "#B5CFCD", fontSize: 10, fontWeight: "700" },
  signalTitle: { color: "#FFFFFF", fontSize: 22, fontWeight: "800", textAlign: "right", marginTop: 20 },
  signalText: { color: "#B0C2C4", fontSize: 12, lineHeight: 20, textAlign: "right", marginTop: 6 },
  signalTrack: { height: 4, backgroundColor: "#34515A", borderRadius: 4, marginTop: 17, overflow: "hidden" },
  signalFill: { width: "74%", height: 4, backgroundColor: "#E09F3E", borderRadius: 4 },
  metricsRow: { flexDirection: "row-reverse", gap: 8, marginBottom: 24 },
  actionGrid: { flexDirection: "row-reverse", gap: 9, marginBottom: 24 },
  actionCard: { flex: 1, padding: 14, minHeight: 126 },
  actionIcon: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center", alignSelf: "flex-end" },
  actionTitle: { fontSize: 14, fontWeight: "800", textAlign: "right", marginTop: 13 },
  actionCopy: { fontSize: 11, lineHeight: 17, textAlign: "right", marginTop: 4 },
  requestCard: { padding: 15, marginBottom: 9 },
  requestTop: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  requestId: { fontSize: 10, fontWeight: "800" },
  requestTitle: { textAlign: "right", fontSize: 14, fontWeight: "800", marginTop: 12 },
  requestNote: { textAlign: "right", fontSize: 11, marginTop: 4 },
  noRequests: { alignItems: "center", paddingVertical: 25, marginBottom: 10 },
  noRequestsTitle: { fontSize: 14, fontWeight: "800", marginTop: 10 },
  noRequestsText: { fontSize: 11, marginTop: 4 },
  bottomAction: { marginTop: 13 },
});
