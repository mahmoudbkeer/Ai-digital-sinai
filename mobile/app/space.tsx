import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, useRouter } from "expo-router";

import { AppHeader, PrimaryButton, SoftButton, Surface } from "@/components/app-ui";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { spaces } from "@/lib/demo-data";
import { useAppState } from "@/lib/app-store";
import { haptic } from "@/lib/haptics";
import { useColors } from "@/hooks/use-colors";



export default function SpaceScreen() {
  const colors = useColors();
  const router = useRouter();
  const { spaceId, setSpaceId } = useAppState();
  return <ScreenContainer className="px-5 pt-4" edges={["top", "left", "right", "bottom"]}><Stack.Screen options={{ animation: "slide_from_left" }} /><AppHeader title="مساحة العمل" subtitle="اختر السياق الذي تريد تشغيله" /><ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}><View style={[styles.info, { backgroundColor: "#0B1F33" }]}><IconSymbol name="shield.fill" size={22} color="#49C8BC" /><Text style={styles.infoTitle}>هوية واحدة، سياقات واضحة</Text><Text style={styles.infoCopy}>تغيير المساحة يغيّر نطاق البيانات والإجراءات المتاحة. كل مساحة معزولة عن الأخرى.</Text></View><Text style={[styles.label, { color: colors.muted }]}>المساحات المتاحة</Text>{spaces.map((space) => { const active = space.id === spaceId; return <Pressable key={space.id} onPress={() => { setSpaceId(space.id); haptic.selection(); }} style={({ pressed }) => [pressed && { opacity: 0.72 }]}><Surface style={[styles.spaceCard, active && { borderColor: colors.primary, backgroundColor: "#F4FBF8" }]}><View style={[styles.spaceIcon, { backgroundColor: active ? "#D7F4EF" : "#F4E6CF" }]}><IconSymbol name={active ? "checkmark.circle.fill" : "building.2.fill"} size={22} color={active ? colors.primary : colors.warning} /></View><View style={styles.spaceCopy}><Text style={[styles.spaceName, { color: colors.foreground }]}>{space.name}</Text><Text style={[styles.spaceMeta, { color: colors.muted }]}>{space.meta}</Text><Text style={[styles.spaceRole, { color: active ? colors.primary : colors.muted }]}>{active ? "نشطة الآن · " : ""}{space.role}</Text></View></Surface></Pressable>; })}<View style={styles.action}><PrimaryButton onPress={() => { haptic.success(); router.back(); }} icon="checkmark.circle.fill">متابعة بهذه المساحة</PrimaryButton></View><SoftButton onPress={() => router.back()}>إلغاء</SoftButton></ScrollView></ScreenContainer>;
}

const styles = StyleSheet.create({
  content: { paddingBottom: 32 },
  info: { borderRadius: 21, padding: 18, marginBottom: 25 },
  infoTitle: { color: "#FFFFFF", fontSize: 16, fontWeight: "800", textAlign: "right", marginTop: 13 },
  infoCopy: { color: "#B0C2C4", fontSize: 12, lineHeight: 20, textAlign: "right", marginTop: 6 },
  label: { textAlign: "right", fontSize: 12, fontWeight: "700", marginBottom: 10 },
  spaceCard: { flexDirection: "row-reverse", alignItems: "center", padding: 15, marginBottom: 10 },
  spaceIcon: { width: 46, height: 46, borderRadius: 15, alignItems: "center", justifyContent: "center", marginLeft: 11 },
  spaceCopy: { flex: 1, alignItems: "flex-end" },
  spaceName: { fontSize: 14, fontWeight: "800" },
  spaceMeta: { fontSize: 11, marginTop: 4 },
  spaceRole: { fontSize: 10, fontWeight: "700", marginTop: 7 },
  action: { marginTop: 17, marginBottom: 10 },
});
