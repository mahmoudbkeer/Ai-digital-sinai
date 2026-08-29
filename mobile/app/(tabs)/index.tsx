import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { AppHeader, BrandMark, MetricCard, PrimaryButton, SectionHeader, ServiceCard, Surface, appColors } from "@/components/app-ui";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { consumerCollections, merchantMetrics, roleLabels, services, spaces } from "@/lib/demo-data";
import { useAppState } from "@/lib/app-store";
import { haptic } from "@/lib/haptics";
import { useColors } from "@/hooks/use-colors";

export default function HomeScreen() {
  const colors = useColors();
  const router = useRouter();
  const { role, spaceId, notifications, requests } = useAppState();
  const currentSpace = spaces.find((space) => space.id === spaceId) ?? spaces[0];
  const isMerchant = role === "merchant";
  const greeting = role === "consumer" ? "اكتشف ما حولك" : role === "merchant" ? "صباح التشغيل" : "نظرة على المنصة";
  const unreadCount = notifications.filter((item) => item.unread).length;

  return (
    <ScreenContainer className="px-5 pt-4" edges={["top", "left", "right"]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <AppHeader title={greeting} subtitle={`${currentSpace.name} · ${roleLabels[role]}`} notificationCount={unreadCount} />

        <View style={[styles.hero, { backgroundColor: appColors.navy }]}>
          <View style={styles.heroGlow} />
          <View style={styles.heroTop}><View style={styles.heroLabel}><View style={styles.liveDot} /><Text style={styles.heroLabelText}>المسار النشط</Text></View><BrandMark compact /></View>
          <Text style={styles.heroTitle}>{role === "consumer" ? "قرار أقرب،\nوخدمة أوضح." : role === "merchant" ? "كل إشارة\nلها خطوة." : "رؤية موحدة\nللسوق."}</Text>
          <Text style={styles.heroCopy}>{role === "consumer" ? "اكتشف منشآت وخدمات محلية موثوقة داخل العريش." : role === "merchant" ? "تابع ما يحتاج انتباهك قبل أن يتحول إلى مشكلة." : "راقب الثقة والنمو من مكان واحد، دون ضوضاء."}</Text>
          <Pressable accessibilityRole="button" onPress={() => { haptic.light(); router.push("/space" as never); }} style={({ pressed }) => [styles.spaceSwitch, pressed && styles.buttonPressed]}><Text style={styles.spaceSwitchText}>تغيير المساحة</Text><IconSymbol name="arrow.left" size={15} color="#BFE7DF" /></Pressable>
          <View style={styles.heroRoute}><Text style={styles.routeText}>01</Text><View style={styles.routeLine}><View style={styles.routeProgress} /></View><Text style={styles.routeText}>03</Text><Text style={styles.routeHint}>مسارات متصلة</Text></View>
        </View>

        {isMerchant ? <>
          <SectionHeader title="إيقاع اليوم" action="لوحة التشغيل" onAction={() => router.push("/workspace" as never)} />
          <View style={styles.metricsRow}>{merchantMetrics.map((metric) => <MetricCard key={metric.label} {...metric} />)}</View>
        </> : <>
          <SectionHeader title="ابدأ من الإشارة" />
          <FlatList horizontal inverted data={consumerCollections} keyExtractor={(item) => item.title} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.collectionsList} renderItem={({ item }) => <View style={[styles.collectionCard, { backgroundColor: item.color }]}><IconSymbol name={item.icon} size={22} color={appColors.navy} /><Text style={styles.collectionTitle}>{item.title}</Text><Text style={styles.collectionCopy}>{item.copy}</Text></View>} />
        </>}

        <View style={styles.quickHeader}><SectionHeader title="إجراءات سريعة" /></View>
        <View style={styles.quickGrid}>
          <Pressable onPress={() => router.push("/discover" as never)} style={({ pressed }) => [styles.quickCard, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && styles.pressed]}><View style={[styles.quickIcon, { backgroundColor: "#D7F4EF" }]}><IconSymbol name="magnifyingglass" size={21} color={colors.primary} /></View><Text style={[styles.quickTitle, { color: colors.foreground }]}>استكشف السوق</Text><Text style={[styles.quickCopy, { color: colors.muted }]}>خدمات قريبة منك</Text></Pressable>
          <Pressable onPress={() => router.push("/assistant" as never)} style={({ pressed }) => [styles.quickCard, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && styles.pressed]}><View style={[styles.quickIcon, { backgroundColor: "#E8E0F3" }]}><IconSymbol name="sparkles" size={21} color="#7C5C8E" /></View><Text style={[styles.quickTitle, { color: colors.foreground }]}>اسأل رفيق الإشارة</Text><Text style={[styles.quickCopy, { color: colors.muted }]}>مساعدة تفهم سياقك</Text></Pressable>
        </View>

        <SectionHeader title={role === "consumer" ? "مختارات قريبة" : "آخر ما يحتاج انتباهك"} action="عرض الكل" onAction={() => router.push(role === "consumer" ? "/discover" as never : "/requests" as never)} />
        {role === "consumer" ? <FlatList scrollEnabled={false} data={services.slice(0, 3)} keyExtractor={(item) => item.id} renderItem={({ item }) => <ServiceCard service={item} onPress={() => router.push(`/service/${item.id}` as never)} />} /> : <Surface style={styles.requestSummary}><View style={styles.summaryTop}><View style={[styles.summaryBadge, { backgroundColor: "#D7F4EF" }]}><Text style={[styles.summaryBadgeText, { color: colors.primary }]}>{requests.filter((item) => item.status !== "completed").length} مفتوحة</Text></View><Text style={[styles.summaryTitle, { color: colors.foreground }]}>طلباتك في مسار واضح</Text></View><Text style={[styles.summaryCopy, { color: colors.muted }]}>هناك تحديثات تنتظر المراجعة. افتح الطلبات لمتابعة الحالة أو اتخاذ الإجراء التالي.</Text><PrimaryButton onPress={() => router.push("/requests" as never)} icon="arrow.left">فتح الطلبات</PrimaryButton></Surface>}

        <View style={[styles.footerNote, { borderTopColor: colors.border }]}><IconSymbol name="shield.fill" size={16} color={colors.primary} /><Text style={[styles.footerText, { color: colors.muted }]}>بيانات كل مساحة معزولة ومحمية بصلاحياتها.</Text></View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingBottom: 34 },
  hero: { borderRadius: 26, padding: 19, overflow: "hidden", marginBottom: 23, minHeight: 265 },
  heroGlow: { position: "absolute", width: 210, height: 210, borderRadius: 105, backgroundColor: "#1A5960", opacity: 0.4, top: -105, left: -50 },
  heroTop: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  heroLabel: { flexDirection: "row-reverse", alignItems: "center", gap: 7 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#49C8BC" },
  heroLabelText: { color: "#BFE7DF", fontSize: 11, fontWeight: "700" },
  heroTitle: { color: "#FFFFFF", fontSize: 31, lineHeight: 38, fontWeight: "800", textAlign: "right", marginTop: 24, letterSpacing: -0.4 },
  heroCopy: { color: "#B0C2C4", fontSize: 13, lineHeight: 21, textAlign: "right", marginTop: 11, maxWidth: 245, alignSelf: "flex-end" },
  spaceSwitch: { flexDirection: "row-reverse", alignItems: "center", gap: 7, alignSelf: "flex-end", marginTop: 14, paddingVertical: 5 },
  spaceSwitchText: { color: "#BFE7DF", fontSize: 12, fontWeight: "800" },
  heroRoute: { flexDirection: "row-reverse", alignItems: "center", marginTop: 25, gap: 8 },
  routeText: { color: "#FFFFFF", fontSize: 10, fontWeight: "800" },
  routeLine: { height: 2, flex: 1, backgroundColor: "#375158", overflow: "hidden" },
  routeProgress: { width: "65%", height: 2, backgroundColor: "#E09F3E" },
  routeHint: { color: "#8CA5A8", fontSize: 10, marginRight: 2 },
  metricsRow: { flexDirection: "row-reverse", gap: 8, marginBottom: 21 },
  collectionsList: { paddingBottom: 7, gap: 10, flexDirection: "row" },
  collectionCard: { width: 145, minHeight: 136, borderRadius: 20, padding: 15, alignItems: "flex-end" },
  collectionTitle: { color: appColors.navy, fontSize: 15, fontWeight: "800", textAlign: "right", marginTop: 17 },
  collectionCopy: { color: "#4B6671", fontSize: 11, lineHeight: 17, textAlign: "right", marginTop: 4 },
  quickHeader: { marginTop: 14 },
  quickGrid: { flexDirection: "row-reverse", gap: 10, marginBottom: 23 },
  quickCard: { flex: 1, minHeight: 123, borderRadius: 19, borderWidth: 1, padding: 14, alignItems: "flex-end" },
  quickIcon: { width: 41, height: 41, borderRadius: 14, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  quickTitle: { fontSize: 13, fontWeight: "800", textAlign: "right" },
  quickCopy: { fontSize: 11, marginTop: 4, textAlign: "right" },
  requestSummary: { padding: 17, marginBottom: 10 },
  summaryTop: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  summaryTitle: { fontSize: 15, fontWeight: "800", textAlign: "right" },
  summaryBadge: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 9 },
  summaryBadgeText: { fontSize: 10, fontWeight: "800" },
  summaryCopy: { fontSize: 12, lineHeight: 20, textAlign: "right", marginTop: 12, marginBottom: 15 },
  footerNote: { borderTopWidth: 1, flexDirection: "row-reverse", alignItems: "center", gap: 8, paddingTop: 17, marginTop: 15 },
  footerText: { flex: 1, textAlign: "right", fontSize: 11, lineHeight: 18 },
  pressed: { opacity: 0.68 },
  buttonPressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
});
