import { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { AppHeader, EmptyState, SectionHeader, StatusBadge, Surface } from "@/components/app-ui";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useAppState } from "@/lib/app-store";
import { haptic } from "@/lib/haptics";
import { useColors } from "@/hooks/use-colors";

type Filter = "all" | "open" | "completed";

export default function RequestsScreen() {
  const colors = useColors();
  const router = useRouter();
  const { requests } = useAppState();
  const [filter, setFilter] = useState<Filter>("all");
  const visible = useMemo(() => requests.filter((request) => filter === "all" || filter === "open" ? filter === "all" ? true : request.status !== "completed" : request.status === "completed"), [filter, requests]);
  const unread = requests.filter((request) => request.status === "new").length;
  return (
    <ScreenContainer className="px-5 pt-4" edges={["top", "left", "right"]}>
      <AppHeader title="الطلبات" subtitle={`${requests.length} طلبات · ${unread} تحتاج انتباهك`} />
      <View style={[styles.summary, { backgroundColor: "#0B1F33" }]}><View style={styles.summaryLine}><Text style={styles.summaryValue}>{String(requests.filter((request) => request.status !== "completed").length).padStart(2, "0")}</Text><Text style={styles.summaryLabel}>مسارات مفتوحة الآن</Text></View><View style={styles.summaryDivider} /><View style={styles.summaryLine}><Text style={[styles.summaryValue, { color: "#E09F3E" }]}>{String(requests.filter((request) => request.status === "completed").length).padStart(2, "0")}</Text><Text style={styles.summaryLabel}>مكتملة هذا الشهر</Text></View></View>
      <SectionHeader title="سجل الطلبات" />
      <View style={styles.filterBar}>{(["all", "open", "completed"] as Filter[]).map((item) => <Pressable key={item} onPress={() => { setFilter(item); haptic.selection(); }} style={[styles.filterPill, { backgroundColor: filter === item ? colors.primary : colors.surface, borderColor: filter === item ? colors.primary : colors.border }]}><Text style={[styles.filterText, { color: filter === item ? "#FFFFFF" : colors.muted }]}>{item === "all" ? "الكل" : item === "open" ? "قيد المتابعة" : "مكتمل"}</Text></Pressable>)}</View>
      <FlatList data={visible} keyExtractor={(item) => item.id} showsVerticalScrollIndicator={false} contentContainerStyle={visible.length === 0 ? styles.emptyList : styles.list} renderItem={({ item }) => <Pressable onPress={() => { haptic.light(); router.push(`/request/${item.id}` as never); }} style={({ pressed }) => [pressed && styles.pressed]}><Surface style={styles.requestCard}><View style={styles.requestTop}><StatusBadge status={item.status} /><Text style={[styles.requestId, { color: colors.muted }]}>{item.id}</Text></View><Text style={[styles.requestTitle, { color: colors.foreground }]}>{item.serviceName}</Text><Text style={[styles.requestBusiness, { color: colors.muted }]}>{item.business}</Text><View style={styles.requestBottom}><View style={styles.dateRow}><IconSymbol name="arrow.clockwise.circle.fill" size={13} color={colors.muted} /><Text style={[styles.dateText, { color: colors.muted }]}>{item.createdAt}</Text></View><Text style={[styles.requestNote, { color: colors.foreground }]} numberOfLines={1}>{item.note}</Text></View></Surface></Pressable>} ListEmptyComponent={<EmptyState title={filter === "completed" ? "لا توجد طلبات مكتملة" : "لا توجد طلبات هنا"} copy="عندما تبدأ مساراً جديداً، ستظهر تفاصيله وتحديثاته في هذه الشاشة." action="اكتشف السوق" onAction={() => router.push("/discover" as never)} />} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  summary: { borderRadius: 22, padding: 18, flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-around", marginBottom: 24 },
  summaryLine: { alignItems: "flex-end", flex: 1 },
  summaryValue: { color: "#49C8BC", fontSize: 27, fontWeight: "800" },
  summaryLabel: { color: "#ADC1C3", fontSize: 11, marginTop: 4 },
  summaryDivider: { height: 45, width: 1, backgroundColor: "#35505A", marginHorizontal: 14 },
  filterBar: { flexDirection: "row-reverse", gap: 8, marginBottom: 13 },
  filterPill: { minHeight: 37, borderRadius: 100, borderWidth: 1, paddingHorizontal: 14, alignItems: "center", justifyContent: "center" },
  filterText: { fontSize: 11, fontWeight: "800" },
  list: { paddingBottom: 26 },
  emptyList: { flexGrow: 1 },
  requestCard: { padding: 15, marginBottom: 10 },
  requestTop: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  requestId: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  requestTitle: { textAlign: "right", fontSize: 15, fontWeight: "800", marginTop: 14 },
  requestBusiness: { textAlign: "right", fontSize: 12, marginTop: 4 },
  requestBottom: { marginTop: 14, paddingTop: 11, borderTopWidth: 1, borderTopColor: "#E7E5DF", flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", gap: 10 },
  dateRow: { flexDirection: "row-reverse", alignItems: "center", gap: 4 },
  dateText: { fontSize: 10 },
  requestNote: { flex: 1, fontSize: 11, textAlign: "right" },
  pressed: { opacity: 0.7 },
});
