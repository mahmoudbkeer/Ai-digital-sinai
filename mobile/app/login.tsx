import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Stack, useRouter } from "expo-router";

import { BrandMark, PrimaryButton, SoftButton } from "@/components/app-ui";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { startOAuthLogin } from "@/constants/oauth";
import { haptic } from "@/lib/haptics";
import { useColors } from "@/hooks/use-colors";

export default function LoginScreen() {
  const colors = useColors();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const signIn = async () => {
    setLoading(true);
    haptic.light();
    try {
      await startOAuthLogin();
    } finally {
      setLoading(false);
    }
  };
  return <ScreenContainer className="px-6" edges={["top", "bottom", "left", "right"]}><Stack.Screen options={{ animation: "fade" }} /><View style={styles.container}><View style={styles.brand}><BrandMark /><Text style={[styles.brandName, { color: colors.foreground }]}>AI DIGITAL SINAI</Text><Text style={[styles.brandTag, { color: colors.muted }]}>منصة تربط الإشارة بالخطوة</Text></View><View style={[styles.hero, { backgroundColor: "#0B1F33" }]}><IconSymbol name="shield.fill" size={22} color="#49C8BC" /><Text style={styles.heroTitle}>دخول آمن،{"\n"}وسياق واضح.</Text><Text style={styles.heroCopy}>سجّل دخولك للوصول إلى مساحات العمل والطلبات والأدوات التي تخصك فقط.</Text><View style={styles.rule}><View style={styles.ruleDot} /><Text style={styles.ruleText}>الهوية والصلاحيات تُتحقق من الخادم</Text></View><View style={styles.rule}><View style={styles.ruleDot} /><Text style={styles.ruleText}>يمكنك الاستكشاف كزائر في هذه المعاينة</Text></View></View><View style={styles.actions}>{loading ? <View style={styles.loading}><ActivityIndicator color={colors.primary} /><Text style={[styles.loadingText, { color: colors.muted }]}>جارٍ فتح بوابة الدخول...</Text></View> : <PrimaryButton onPress={signIn} icon="arrow.left">المتابعة بتسجيل الدخول</PrimaryButton>}<SoftButton onPress={() => { haptic.light(); router.replace("/(tabs)" as never); }}>الاستكشاف كزائر</SoftButton></View><Text style={[styles.footer, { color: colors.muted }]}>بالدخول، توافق على استخدام المنصة ضمن مساحة العمل التي تختارها.</Text></View></ScreenContainer>;
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "space-between", paddingVertical: 36 },
  brand: { alignItems: "flex-end" },
  brandName: { fontSize: 14, fontWeight: "800", letterSpacing: 1, marginTop: 12 },
  brandTag: { fontSize: 11, marginTop: 4 },
  hero: { borderRadius: 26, padding: 21 },
  heroTitle: { color: "#FFFFFF", fontSize: 30, lineHeight: 38, fontWeight: "800", textAlign: "right", marginTop: 22 },
  heroCopy: { color: "#B0C2C4", fontSize: 13, lineHeight: 22, textAlign: "right", marginTop: 11 },
  rule: { flexDirection: "row-reverse", alignItems: "center", gap: 8, marginTop: 16 },
  ruleDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#E09F3E" },
  ruleText: { color: "#B5CFCD", fontSize: 11 },
  actions: { gap: 10 },
  loading: { minHeight: 50, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 9 },
  loadingText: { fontSize: 12 },
  footer: { textAlign: "center", fontSize: 10, lineHeight: 17 },
});
