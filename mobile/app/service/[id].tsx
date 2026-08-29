import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";

import { AppHeader, PrimaryButton, SectionHeader, SoftButton, Surface } from "@/components/app-ui";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { getServiceById, getServiceIcon } from "@/lib/demo-data";
import { haptic } from "@/lib/haptics";
import { useColors } from "@/hooks/use-colors";

export default function ServiceDetailsScreen() {
  const colors = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const service = getServiceById(id);
  return (
    <ScreenContainer className="px-5 pt-4" edges={["top", "left", "right", "bottom"]}>
      <Stack.Screen options={{ animation: "slide_from_left" }} />
      <AppHeader title="تفاصيل الخدمة" subtitle="معلومات واضحة قبل اتخاذ القرار" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={[styles.cover, { backgroundColor: service.accent }]}><View style={styles.coverOrb} /><View style={styles.coverIcon}><IconSymbol name={getServiceIcon(service.icon) as never} size={36} color="#FFFFFF" /></View><View style={styles.coverMeta}><Text style={styles.coverEyebrow}>خدمة محلية · {service.category}</Text><Text style={styles.coverTitle}>{service.name}</Text><Text style={styles.coverBusiness}>{service.business}</Text></View></View>
        <View style={styles.statRow}><View style={styles.stat}><Text style={[styles.statValue, { color: colors.foreground }]}>{service.rating}</Text><Text style={[styles.statLabel, { color: colors.muted }]}>التقييم</Text></View><View style={[styles.statDivider, { backgroundColor: colors.border }]} /><View style={styles.stat}><Text style={[styles.statValue, { color: colors.foreground }]}>{service.eta}</Text><Text style={[styles.statLabel, { color: colors.muted }]}>التوفر</Text></View><View style={[styles.statDivider, { backgroundColor: colors.border }]} /><View style={styles.stat}><Text style={[styles.statValue, { color: colors.foreground }]}>{service.area}</Text><Text style={[styles.statLabel, { color: colors.muted }]}>المنطقة</Text></View></View>
        <SectionHeader title="عن الخدمة" />
        <Text style={[styles.description, { color: colors.foreground }]}>{service.description}</Text>
        <View style={styles.tags}>{service.tags.map((tag) => <View key={tag} style={[styles.tag, { backgroundColor: `${service.accent}18` }]}><IconSymbol name="checkmark.circle.fill" size={14} color={service.accent} /><Text style={[styles.tagText, { color: colors.foreground }]}>{tag}</Text></View>)}</View>
        <SectionHeader title="قبل الطلب" />
        <Surface style={styles.trustCard}><View style={[styles.trustIcon, { backgroundColor: "#D7F4EF" }]}><IconSymbol name="shield.fill" size={18} color={colors.primary} /></View><View style={styles.trustCopy}><Text style={[styles.trustTitle, { color: colors.foreground }]}>المسار محفوظ بوضوح</Text><Text style={[styles.trustText, { color: colors.muted }]}>ستظهر حالة الطلب وتحديثاته داخل تبويب الطلبات. لا يتم تأكيد أي خطوة مالية دون مراجعة صريحة.</Text></View></Surface>
        <View style={styles.actions}><View style={styles.priceBlock}><Text style={[styles.priceLabel, { color: colors.muted }]}>التكلفة المتوقعة</Text><Text style={[styles.price, { color: colors.foreground }]}>{service.price}</Text></View><View style={styles.actionButton}><PrimaryButton onPress={() => { haptic.success(); router.push(`/request/new?serviceId=${service.id}` as never); }} icon="arrow.left">ابدأ الطلب</PrimaryButton></View></View>
        <SoftButton onPress={() => router.back()}>العودة للسوق</SoftButton>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 32 },
  cover: { borderRadius: 25, minHeight: 205, padding: 19, overflow: "hidden", justifyContent: "flex-end", marginBottom: 15 },
  coverOrb: { position: "absolute", width: 190, height: 190, borderRadius: 95, backgroundColor: "#FFFFFF", opacity: 0.1, top: -72, left: -30 },
  coverIcon: { position: "absolute", top: 19, right: 19, width: 60, height: 60, borderRadius: 19, backgroundColor: "#FFFFFF22", alignItems: "center", justifyContent: "center" },
  coverMeta: { alignItems: "flex-end" },
  coverEyebrow: { color: "#D8F1EB", fontSize: 11, fontWeight: "700" },
  coverTitle: { color: "#FFFFFF", fontSize: 26, fontWeight: "800", marginTop: 8, textAlign: "right" },
  coverBusiness: { color: "#D8F1EB", fontSize: 13, marginTop: 5 },
  statRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-around", marginBottom: 25 },
  stat: { flex: 1, alignItems: "center" },
  statValue: { fontSize: 13, fontWeight: "800", textAlign: "center" },
  statLabel: { fontSize: 10, marginTop: 5 },
  statDivider: { width: 1, height: 31 },
  description: { textAlign: "right", fontSize: 14, lineHeight: 24, marginBottom: 14 },
  tags: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8, marginBottom: 23 },
  tag: { flexDirection: "row-reverse", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 100 },
  tagText: { fontSize: 11, fontWeight: "700" },
  trustCard: { flexDirection: "row-reverse", alignItems: "flex-start", padding: 14, marginBottom: 18 },
  trustIcon: { width: 37, height: 37, borderRadius: 12, alignItems: "center", justifyContent: "center", marginLeft: 10 },
  trustCopy: { flex: 1, alignItems: "flex-end" },
  trustTitle: { fontSize: 13, fontWeight: "800" },
  trustText: { textAlign: "right", fontSize: 11, lineHeight: 18, marginTop: 4 },
  actions: { flexDirection: "row-reverse", alignItems: "flex-end", gap: 12, marginBottom: 10 },
  priceBlock: { flex: 1, alignItems: "flex-end", paddingBottom: 5 },
  priceLabel: { fontSize: 10 },
  price: { fontSize: 14, fontWeight: "800", marginTop: 5, textAlign: "right" },
  actionButton: { flex: 1.25 },
});
