import { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";

import { AppHeader, PrimaryButton, SectionHeader, SoftButton, StatusBadge, Surface } from "@/components/app-ui";
import { ScreenContainer } from "@/components/screen-container";
import { useAppState } from "@/lib/app-store";
import { haptic } from "@/lib/haptics";
import { useColors } from "@/hooks/use-colors";

export default function RequestDetailsScreen() {
  const colors = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { requests, updateRequestStatus, addNotification } = useAppState();
  const request = useMemo(() => requests.find((item) => item.id === id) ?? requests[0], [id, requests]);
  if (!request) return null;
  const nextStatus = request.status === "new" ? "in_progress" : request.status === "in_progress" ? "completed" : null;
  const nextLabel = request.status === "new" ? "بدء التنفيذ" : request.status === "in_progress" ? "تأكيد الإنجاز" : null;
  return (
    <ScreenContainer className="px-5 pt-4" edges={["top", "left", "right", "bottom"]}>
      <Stack.Screen options={{ animation: "slide_from_left" }} />
      <AppHeader title="تفاصيل الطلب" subtitle="مسار واضح من البداية إلى الإنجاز" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <Surface style={styles.headerCard}><View style={styles.headerTop}><StatusBadge status={request.status} /><Text style={[styles.requestId, { color: colors.muted }]}>{request.id}</Text></View><Text style={[styles.serviceName, { color: colors.foreground }]}>{request.serviceName}</Text><Text style={[styles.business, { color: colors.muted }]}>{request.business}</Text></Surface>
        <SectionHeader title="تقدم الطلب" />
        <Surface style={styles.timeline}>{(["new", "in_progress", "completed"] as const).map((status, index) => { const active = ["new", "in_progress", "completed"].indexOf(request.status) >= index; return <View key={status} style={styles.timelineRow}><View style={styles.timelineCopy}><Text style={[styles.timelineTitle, { color: active ? colors.foreground : colors.muted }]}>{status === "new" ? "تم استلام الطلب" : status === "in_progress" ? "قيد التنفيذ" : "تم الإنجاز"}</Text><Text style={[styles.timelineText, { color: colors.muted }]}>{status === request.status ? "الحالة الحالية" : active ? "اكتملت هذه الخطوة" : "بانتظار التحديث"}</Text></View><View style={styles.timelineTrack}><View style={[styles.timelineDot, { backgroundColor: active ? colors.primary : colors.border }]}>{active ? <View style={styles.timelineDotInner} /> : null}</View>{index < 2 ? <View style={[styles.timelineLine, { backgroundColor: ["new", "in_progress", "completed"].indexOf(request.status) > index ? colors.primary : colors.border }]} /> : null}</View></View>})}</Surface>
        <SectionHeader title="ملاحظتك" />
        <Surface style={styles.noteCard}><Text style={[styles.note, { color: colors.foreground }]}>{request.note}</Text><Text style={[styles.date, { color: colors.muted }]}>أُنشئ {request.createdAt}</Text></Surface>
        {nextStatus && nextLabel ? <View style={styles.actionWrap}><PrimaryButton onPress={() => { updateRequestStatus(request.id, nextStatus); addNotification({ id: `ntf-${Date.now()}`, title: `تحديث ${request.id}`, body: `تم نقل الطلب إلى حالة ${nextLabel}.`, time: "الآن", type: "request", unread: true }); haptic.success(); }} icon="checkmark.circle.fill">{nextLabel}</PrimaryButton></View> : <View style={[styles.doneCard, { backgroundColor: "#D7F4EF" }]}><Text style={[styles.doneTitle, { color: colors.success }]}>اكتمل هذا المسار</Text><Text style={[styles.doneText, { color: colors.foreground }]}>يمكنك العودة إلى السوق لاكتشاف خدمة أخرى.</Text></View>}
        <SoftButton onPress={() => router.back()}>العودة إلى الطلبات</SoftButton>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 32 },
  headerCard: { padding: 17, marginBottom: 24 },
  headerTop: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  requestId: { fontSize: 11, fontWeight: "800", letterSpacing: 0.4 },
  serviceName: { fontSize: 20, fontWeight: "800", textAlign: "right", marginTop: 17 },
  business: { fontSize: 12, textAlign: "right", marginTop: 5 },
  timeline: { padding: 18, marginBottom: 24 },
  timelineRow: { minHeight: 63, flexDirection: "row-reverse" },
  timelineCopy: { flex: 1, alignItems: "flex-end", paddingRight: 13 },
  timelineTitle: { fontSize: 13, fontWeight: "800", textAlign: "right" },
  timelineText: { fontSize: 10, marginTop: 4, textAlign: "right" },
  timelineTrack: { width: 21, alignItems: "center" },
  timelineDot: { width: 19, height: 19, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  timelineDotInner: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#FFFFFF" },
  timelineLine: { width: 2, flex: 1, minHeight: 40 },
  noteCard: { padding: 16, marginBottom: 21 },
  note: { fontSize: 13, lineHeight: 22, textAlign: "right" },
  date: { fontSize: 10, textAlign: "right", marginTop: 10 },
  actionWrap: { marginBottom: 10 },
  doneCard: { borderRadius: 18, padding: 16, marginBottom: 10 },
  doneTitle: { fontSize: 14, fontWeight: "800", textAlign: "right" },
  doneText: { fontSize: 11, marginTop: 5, textAlign: "right" },
});
