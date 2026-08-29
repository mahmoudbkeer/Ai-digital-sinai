import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { AppHeader, BrandMark, SectionHeader, SoftButton, Surface } from "@/components/app-ui";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { spaces, type RoleKey } from "@/lib/demo-data";
import { useAppState } from "@/lib/app-store";
import { haptic } from "@/lib/haptics";
import { useColors } from "@/hooks/use-colors";

const roles: { id: RoleKey; label: string; copy: string; icon: "person.crop.circle.fill" | "building.2.fill" | "shield.fill" }[] = [
  { id: "consumer", label: "عميل", copy: "اكتشاف وطلبات قريبة", icon: "person.crop.circle.fill" },
  { id: "merchant", label: "تاجر", copy: "تشغيل نشاط وفريق", icon: "building.2.fill" },
  { id: "admin", label: "إدارة", copy: "رؤية المنصة وحوكمتها", icon: "shield.fill" },
];

export default function AccountScreen() {
  const colors = useColors();
  const router = useRouter();
  const { role, setRole, spaceId, notifications } = useAppState();
  const activeSpace = spaces.find((space) => space.id === spaceId) ?? spaces[0];
  const unreadCount = notifications.filter((item) => item.unread).length;
  return (
    <ScreenContainer className="px-5 pt-4" edges={["top", "left", "right"]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <AppHeader title="حسابي" subtitle="هويتك ومساراتك في مكان واحد" />
        <Surface style={styles.profileCard}><View style={styles.profileAvatar}><Text style={styles.profileInitial}>أ</Text></View><View style={styles.profileCopy}><Text style={[styles.profileName, { color: colors.foreground }]}>أحمد سيناء</Text><Text style={[styles.profileEmail, { color: colors.muted }]}>هوية متعددة الأدوار · العريش</Text><View style={styles.verified}><IconSymbol name="checkmark.seal.fill" size={13} color={colors.success} /><Text style={[styles.verifiedText, { color: colors.success }]}>جلسة آمنة</Text></View></View><BrandMark compact /></Surface>
        <SectionHeader title="الدور الحالي" />
        <View style={styles.roles}>{roles.map((item) => <Pressable key={item.id} onPress={() => { setRole(item.id); haptic.selection(); }} style={[styles.roleCard, { backgroundColor: item.id === role ? "#D7F4EF" : colors.surface, borderColor: item.id === role ? colors.primary : colors.border }]}><IconSymbol name={item.icon} size={21} color={item.id === role ? colors.primary : colors.muted} /><Text style={[styles.roleLabel, { color: item.id === role ? colors.primary : colors.foreground }]}>{item.label}</Text><Text style={[styles.roleCopy, { color: colors.muted }]}>{item.copy}</Text>{item.id === role ? <View style={[styles.selectedMark, { backgroundColor: colors.primary }]}><IconSymbol name="checkmark.circle.fill" size={14} color="#FFFFFF" /></View> : null}</Pressable>)}</View>
        <SectionHeader title="مساحة العمل" action="تغيير" onAction={() => router.push("/space" as never)} />
        <Pressable onPress={() => router.push("/space" as never)} style={({ pressed }) => [pressed && styles.pressed]}><Surface style={styles.spaceCard}><View style={[styles.spaceIcon, { backgroundColor: "#F4E6CF" }]}><IconSymbol name="building.2.fill" size={21} color={colors.warning} /></View><View style={styles.spaceCopy}><Text style={[styles.spaceName, { color: colors.foreground }]}>{activeSpace.name}</Text><Text style={[styles.spaceMeta, { color: colors.muted }]}>{activeSpace.meta}</Text></View><IconSymbol name="chevron.left" size={18} color={colors.muted} /></Surface></Pressable>
        <View style={styles.settingsSection}><SectionHeader title="الوصول والإعدادات" /><Pressable onPress={() => router.push("/notifications" as never)} style={[styles.settingRow, { borderBottomColor: colors.border }]}><View style={styles.settingIcon}><IconSymbol name="bell.fill" size={18} color={colors.primary} /></View><Text style={[styles.settingLabel, { color: colors.foreground }]}>مركز الإشعارات</Text><View style={styles.settingEnd}><Text style={[styles.settingValue, { color: colors.muted }]}>{unreadCount ? `${unreadCount} جديد` : "محدّث"}</Text><IconSymbol name="chevron.left" size={16} color={colors.muted} /></View></Pressable><View style={[styles.settingRow, { borderBottomColor: colors.border }]}><View style={styles.settingIcon}><IconSymbol name="shield.fill" size={18} color={colors.success} /></View><Text style={[styles.settingLabel, { color: colors.foreground }]}>الأمان والخصوصية</Text><View style={styles.settingEnd}><Text style={[styles.settingValue, { color: colors.success }]}>محمي</Text><IconSymbol name="chevron.left" size={16} color={colors.muted} /></View></View><View style={styles.settingRow}><View style={styles.settingIcon}><IconSymbol name="gearshape.fill" size={18} color={colors.muted} /></View><Text style={[styles.settingLabel, { color: colors.foreground }]}>تفضيلات التطبيق</Text><View style={styles.settingEnd}><Text style={[styles.settingValue, { color: colors.muted }]}>العربية · تلقائي</Text><IconSymbol name="chevron.left" size={16} color={colors.muted} /></View></View></View>
        {role === "admin" ? <><SectionHeader title="الحوكمة" /><SoftButton onPress={() => router.push("/admin" as never)} icon="shield.fill">فتح مركز الإدارة</SoftButton></> : null}
        <SectionHeader title="الجلسة" />
        <SoftButton onPress={() => router.push("/login" as never)} icon="rectangle.portrait.and.arrow.right">تسجيل الدخول أو تبديل الحساب</SoftButton>
        <Text style={[styles.version, { color: colors.muted }]}>AI DIGITAL SINAI · الإصدار 1.0</Text>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingBottom: 35 },
  profileCard: { flexDirection: "row-reverse", alignItems: "center", padding: 15, marginBottom: 24 },
  profileAvatar: { width: 52, height: 52, borderRadius: 18, backgroundColor: "#0B1F33", alignItems: "center", justifyContent: "center", marginLeft: 11 },
  profileInitial: { color: "#49C8BC", fontSize: 24, fontWeight: "800" },
  profileCopy: { flex: 1, alignItems: "flex-end" },
  profileName: { fontSize: 16, fontWeight: "800" },
  profileEmail: { fontSize: 11, marginTop: 4 },
  verified: { flexDirection: "row-reverse", gap: 4, alignItems: "center", marginTop: 7 },
  verifiedText: { fontSize: 10, fontWeight: "800" },
  roles: { flexDirection: "row-reverse", gap: 8, marginBottom: 25 },
  roleCard: { flex: 1, minHeight: 131, borderRadius: 18, borderWidth: 1, padding: 12, alignItems: "flex-end", position: "relative" },
  roleLabel: { fontSize: 14, fontWeight: "800", marginTop: 15 },
  roleCopy: { fontSize: 10, lineHeight: 15, textAlign: "right", marginTop: 4 },
  selectedMark: { width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", position: "absolute", left: 9, top: 9 },
  spaceCard: { flexDirection: "row-reverse", alignItems: "center", padding: 14, marginBottom: 24 },
  spaceIcon: { width: 43, height: 43, borderRadius: 14, alignItems: "center", justifyContent: "center", marginLeft: 11 },
  spaceCopy: { flex: 1, alignItems: "flex-end" },
  spaceName: { fontSize: 14, fontWeight: "800" },
  spaceMeta: { fontSize: 11, marginTop: 4 },
  settingsSection: { marginBottom: 25 },
  settingRow: { minHeight: 58, flexDirection: "row-reverse", alignItems: "center", borderBottomWidth: 1, gap: 10 },
  settingIcon: { width: 32, height: 32, borderRadius: 11, backgroundColor: "#EEF4F2", alignItems: "center", justifyContent: "center", marginLeft: 2 },
  settingLabel: { flex: 1, fontSize: 13, fontWeight: "700", textAlign: "right" },
  settingEnd: { flexDirection: "row-reverse", alignItems: "center", gap: 6 },
  settingValue: { fontSize: 10 },
  version: { textAlign: "center", fontSize: 10, marginTop: 7 },
  pressed: { opacity: 0.7 },
});
