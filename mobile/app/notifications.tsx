import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Stack, useRouter } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { AppHeader, EmptyState, Surface } from "@/components/app-ui";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useAppState } from "@/lib/app-store";
import { haptic } from "@/lib/haptics";
import { useColors } from "@/hooks/use-colors";

export default function NotificationsScreen() {
  const colors = useColors();
  const router = useRouter();
  const { notifications, markNotificationRead } = useAppState();
  return (
    <ScreenContainer className="p-5" edges={["top", "left", "right", "bottom"]}>
      <Stack.Screen options={{ animation: "slide_from_left" }} />
      <AppHeader title="الإشعارات" subtitle="كل ما يهمك، في مسار واحد" />
      <View style={styles.toolbar}><Text style={[styles.count, { color: colors.muted }]}>{notifications.filter((item) => item.unread).length} غير مقروءة</Text><Pressable onPress={() => { notifications.filter((item) => item.unread).forEach((item) => markNotificationRead(item.id)); haptic.light(); }}><Text style={[styles.markAll, { color: colors.primary }]}>تحديد الكل كمقروء</Text></Pressable></View>
      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={notifications.length === 0 ? styles.emptyList : styles.list}
        renderItem={({ item }) => <Pressable onPress={() => { markNotificationRead(item.id); haptic.light(); }} style={({ pressed }) => [pressed && styles.pressed]}><Surface style={[styles.notificationCard, item.unread && { borderColor: `${colors.primary}55` }]}><View style={[styles.notificationIcon, { backgroundColor: item.type === "request" ? "#D7F4EF" : item.type === "growth" ? "#F4E6CF" : "#E8E0F3" }]}><IconSymbol name={item.type === "request" ? "rectangle.grid.2x2.fill" : item.type === "growth" ? "chart.bar.fill" : "shield.fill"} size={20} color={item.type === "request" ? colors.primary : item.type === "growth" ? colors.warning : "#7C5C8E"} /></View><View style={styles.notificationCopy}><View style={styles.titleRow}><Text style={[styles.notificationTitle, { color: colors.foreground }]}>{item.title}</Text>{item.unread ? <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} /> : null}</View><Text style={[styles.notificationBody, { color: colors.muted }]}>{item.body}</Text><Text style={[styles.notificationTime, { color: colors.muted }]}>{item.time}</Text></View></Surface></Pressable>}
      />
      {notifications.length === 0 ? <EmptyState icon="bell.fill" title="لا توجد إشعارات" copy="ستظهر تحديثات الطلبات والاشتراكات هنا عند حدوثها." onAction={() => router.back()} action="العودة" /> : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  toolbar: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginBottom: 13 },
  count: { fontSize: 12 },
  markAll: { fontSize: 12, fontWeight: "800" },
  list: { paddingBottom: 24 },
  emptyList: { flexGrow: 1 },
  notificationCard: { flexDirection: "row-reverse", alignItems: "flex-start", marginBottom: 10, padding: 14 },
  notificationIcon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", marginLeft: 12 },
  notificationCopy: { flex: 1 },
  titleRow: { flexDirection: "row-reverse", alignItems: "center", gap: 7 },
  notificationTitle: { flex: 1, fontSize: 14, lineHeight: 21, fontWeight: "800", textAlign: "right" },
  notificationBody: { fontSize: 12, lineHeight: 19, textAlign: "right", marginTop: 4 },
  notificationTime: { fontSize: 10, textAlign: "right", marginTop: 7 },
  unreadDot: { width: 7, height: 7, borderRadius: 4 },
  pressed: { opacity: 0.72 },
});
