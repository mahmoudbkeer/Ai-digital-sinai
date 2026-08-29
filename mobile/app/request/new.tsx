import { useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";

import { AppHeader, PrimaryButton, SoftButton, Surface } from "@/components/app-ui";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { getServiceById } from "@/lib/demo-data";
import { useAppState } from "@/lib/app-store";
import { haptic } from "@/lib/haptics";
import { useColors } from "@/hooks/use-colors";

export default function NewRequestScreen() {
  const colors = useColors();
  const router = useRouter();
  const { serviceId } = useLocalSearchParams<{ serviceId: string }>();
  const service = getServiceById(serviceId);
  const { addRequest, addNotification } = useAppState();
  const [note, setNote] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const submit = () => {
    if (note.trim().length < 8) {
      setError("اكتب ملاحظة قصيرة تساعد مقدم الخدمة على فهم طلبك.");
      haptic.medium();
      return;
    }
    const id = `REQ-${Math.floor(2000 + Math.random() * 7000)}`;
    addRequest({ id, serviceId: service.id, serviceName: service.name, business: service.business, status: "new", createdAt: "الآن", note: note.trim() });
    addNotification({ id: `ntf-${Date.now()}`, title: `تم إنشاء الطلب ${id}`, body: "يمكنك متابعة حالته من تبويب الطلبات.", time: "الآن", type: "request", unread: true });
    setSubmitted(true);
    haptic.success();
  };

  return (
    <ScreenContainer className="px-5 pt-4" edges={["top", "left", "right", "bottom"]}>
      <Stack.Screen options={{ animation: "slide_from_bottom" }} />
      <AppHeader title={submitted ? "تم إرسال الطلب" : "إنشاء طلب"} subtitle={submitted ? "الخطوة التالية واضحة" : "أخبر مقدم الخدمة بما تحتاجه"} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {submitted ? <View style={styles.successWrap}><View style={[styles.successIcon, { backgroundColor: "#D7F4EF" }]}><IconSymbol name="checkmark.circle.fill" size={38} color={colors.success} /></View><Text style={[styles.successTitle, { color: colors.foreground }]}>طلبك في المسار</Text><Text style={[styles.successCopy, { color: colors.muted }]}>تم إنشاء طلبك لدى {service.business}. ستصلك التحديثات داخل مركز الإشعارات وتبويب الطلبات.</Text><PrimaryButton onPress={() => router.replace("/(tabs)/requests" as never)} icon="arrow.left">متابعة الطلب</PrimaryButton><SoftButton onPress={() => router.replace("/(tabs)/discover" as never)}>العودة للسوق</SoftButton></View> : <>
          <Surface style={styles.serviceSummary}><View style={[styles.serviceDot, { backgroundColor: service.accent }]} /><View style={styles.serviceSummaryCopy}><Text style={[styles.serviceSummaryName, { color: colors.foreground }]}>{service.name}</Text><Text style={[styles.serviceSummaryBusiness, { color: colors.muted }]}>{service.business} · {service.area}</Text></View><IconSymbol name="checkmark.seal.fill" size={20} color={colors.success} /></Surface>
          <Text style={[styles.fieldLabel, { color: colors.foreground }]}>ما الذي تحتاجه؟</Text><TextInput value={note} onChangeText={(value) => { setNote(value); setError(""); }} placeholder="مثال: أحتاج زيارة ميدانية غداً لفحص الجهاز..." placeholderTextColor={colors.muted} textAlign="right" multiline numberOfLines={5} style={[styles.noteInput, { color: colors.foreground, backgroundColor: colors.surface, borderColor: error ? colors.error : colors.border }]} maxLength={500} />{error ? <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text> : <Text style={[styles.helperText, { color: colors.muted }]}>{note.length}/500 · لا تشارك معلومات حساسة في الملاحظة</Text>}
          <Text style={[styles.fieldLabel, { color: colors.foreground, marginTop: 23 }]}>ملخص الخطوة</Text><Surface style={styles.nextCard}><View style={styles.nextRow}><Text style={[styles.nextValue, { color: colors.foreground }]}>مراجعة مقدم الخدمة</Text><Text style={[styles.nextLabel, { color: colors.muted }]}>01</Text></View><View style={[styles.nextRow, { borderTopColor: colors.border, borderTopWidth: 1, paddingTop: 12, marginTop: 12 }]}><Text style={[styles.nextValue, { color: colors.foreground }]}>تحديث الحالة في الطلبات</Text><Text style={[styles.nextLabel, { color: colors.muted }]}>02</Text></View></Surface>
          <View style={styles.submitWrap}><PrimaryButton onPress={submit} icon="arrow.left">تأكيد الطلب</PrimaryButton></View><Text style={[styles.disclaimer, { color: colors.muted }]}>بالاستمرار، أنت تطلب التواصل مع مقدم الخدمة ولا يتم تحصيل أي مبلغ في هذه الخطوة.</Text>
        </>}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 32 },
  serviceSummary: { flexDirection: "row-reverse", alignItems: "center", padding: 15, marginBottom: 25 },
  serviceDot: { width: 11, height: 11, borderRadius: 6, marginLeft: 10 },
  serviceSummaryCopy: { flex: 1, alignItems: "flex-end" },
  serviceSummaryName: { fontSize: 14, fontWeight: "800" },
  serviceSummaryBusiness: { fontSize: 11, marginTop: 4 },
  fieldLabel: { fontSize: 14, fontWeight: "800", textAlign: "right", marginBottom: 9 },
  noteInput: { minHeight: 128, borderRadius: 17, borderWidth: 1, padding: 14, fontSize: 13, lineHeight: 21, textAlignVertical: "top" },
  helperText: { textAlign: "right", fontSize: 10, marginTop: 7 },
  errorText: { textAlign: "right", fontSize: 11, marginTop: 7 },
  nextCard: { padding: 15 },
  nextRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  nextValue: { fontSize: 12, fontWeight: "700" },
  nextLabel: { fontSize: 11, fontWeight: "800" },
  submitWrap: { marginTop: 23 },
  disclaimer: { textAlign: "center", fontSize: 10, lineHeight: 17, marginTop: 11, paddingHorizontal: 14 },
  successWrap: { alignItems: "stretch", paddingTop: 38 },
  successIcon: { width: 78, height: 78, borderRadius: 28, alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: 22 },
  successTitle: { textAlign: "center", fontSize: 24, fontWeight: "800" },
  successCopy: { textAlign: "center", fontSize: 13, lineHeight: 22, marginTop: 10, marginBottom: 25 },
});
