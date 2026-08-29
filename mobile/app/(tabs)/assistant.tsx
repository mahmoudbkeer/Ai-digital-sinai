import { useMemo, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { AppHeader, Surface } from "@/components/app-ui";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { haptic } from "@/lib/haptics";
import { useColors } from "@/hooks/use-colors";

type Message = { id: string; role: "assistant" | "user"; text: string };
const quickPrompts = ["ما الخدمات القريبة مني؟", "كيف أتابع طلبي؟", "اقترح خطوة لنمو نشاطي"];

export default function AssistantScreen() {
  const colors = useColors();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([{ id: "welcome", role: "assistant", text: "أهلاً بك. أنا رفيق الإشارة. أساعدك على فهم السوق والطلبات والخطوة التالية، بحسب المسار الذي تستخدمه الآن." }]);
  const [isListening, setIsListening] = useState(false);
  const suggestions = useMemo(() => messages.length > 1 ? ["لخّص لي الخطوة التالية", "ما البدائل المتاحة؟"] : quickPrompts, [messages.length]);

  const send = (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text) return;
    haptic.light();
    setMessages((current) => [...current, { id: `user-${Date.now()}`, role: "user", text }, { id: `assistant-${Date.now()}`, role: "assistant", text: text.includes("نمو") ? "ابدأ بإشارة واحدة قابلة للقياس: راقب أكثر خدمة يكتشفها العملاء، ثم أنشئ عرضاً بسيطاً مرتبطاً بها. يمكنك متابعة الأثر من لوحة التشغيل." : text.includes("طلب") ? "افتح تبويب الطلبات لرؤية الحالة الحالية. كل تحديث مرتبط بالطلب نفسه، ويمكنك الرجوع إلى النشاط من بطاقة التفاصيل." : "يمكنني توجيهك إلى السوق لاكتشاف الخدمات القريبة، أو مساعدتك في ترتيب الخطوة التالية داخل مساحة عملك." }]);
    setInput("");
  };

  return (
    <ScreenContainer className="px-5 pt-4" edges={["top", "left", "right"]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={Platform.OS === "ios" ? 4 : 0}>
        <AppHeader title="رفيق الإشارة" subtitle="ذكاء يفهم سياقك، لا يشتت يومك" />
        <Surface style={styles.contextCard}><View style={styles.contextIcon}><IconSymbol name="sparkles" size={18} color="#FFFFFF" /></View><View style={styles.contextCopy}><Text style={[styles.contextTitle, { color: colors.foreground }]}>السياق الحالي: تشغيل محلي</Text><Text style={[styles.contextText, { color: colors.muted }]}>الإجابات العامة لا تصل إلى بيانات مساحة أخرى، والإجراءات الحساسة تحتاج تأكيداً.</Text></View></Surface>
        <FlatList data={messages} keyExtractor={(item) => item.id} showsVerticalScrollIndicator={false} contentContainerStyle={styles.messages} renderItem={({ item }) => <View style={[styles.messageRow, item.role === "user" && styles.userRow]}><View style={[styles.bubble, item.role === "assistant" ? { backgroundColor: colors.surface, borderColor: colors.border } : styles.userBubble]}><Text style={[styles.messageText, { color: item.role === "assistant" ? colors.foreground : "#FFFFFF" }]}>{item.text}</Text></View></View>} ListFooterComponent={<FlatList horizontal inverted data={suggestions} keyExtractor={(item) => item} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suggestionList} renderItem={({ item }) => <Pressable onPress={() => send(item)} style={[styles.suggestion, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.suggestionText, { color: colors.primary }]}>{item}</Text></Pressable>} />} />
        <View style={[styles.composer, { backgroundColor: colors.surface, borderColor: colors.border }]}><Pressable accessibilityLabel="إملاء صوتي" onPress={() => { setIsListening((current) => !current); haptic.medium(); }} style={[styles.micButton, isListening && { backgroundColor: "#F4E6CF" }]}><IconSymbol name={isListening ? "waveform" : "mic.fill"} size={19} color={isListening ? colors.warning : colors.primary} /></Pressable><TextInput value={input} onChangeText={setInput} placeholder={isListening ? "استمع..." : "اكتب سؤالك هنا"} placeholderTextColor={colors.muted} textAlign="right" style={[styles.composerInput, { color: colors.foreground }]} multiline maxLength={1200} /><Pressable accessibilityLabel="إرسال" onPress={() => send()} style={[styles.sendButton, !input.trim() && { opacity: 0.4 }]}><IconSymbol name="paperplane.fill" size={17} color="#FFFFFF" /></Pressable></View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  contextCard: { flexDirection: "row-reverse", alignItems: "center", padding: 13, marginBottom: 16 },
  contextIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: "#0E7C7B", alignItems: "center", justifyContent: "center", marginLeft: 10 },
  contextCopy: { flex: 1 },
  contextTitle: { textAlign: "right", fontSize: 12, fontWeight: "800" },
  contextText: { textAlign: "right", fontSize: 10, lineHeight: 17, marginTop: 3 },
  messages: { paddingBottom: 13, flexGrow: 1 },
  messageRow: { flexDirection: "row-reverse", marginBottom: 11 },
  userRow: { flexDirection: "row", justifyContent: "flex-start" },
  bubble: { maxWidth: "88%", borderWidth: 1, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 18, borderTopRightRadius: 5 },
  userBubble: { backgroundColor: "#0B1F33", borderTopRightRadius: 18, borderTopLeftRadius: 5 },
  messageText: { textAlign: "right", fontSize: 13, lineHeight: 21 },
  suggestionList: { gap: 8, paddingTop: 8, paddingBottom: 5, flexDirection: "row" },
  suggestion: { borderWidth: 1, borderRadius: 100, paddingHorizontal: 13, paddingVertical: 9 },
  suggestionText: { fontSize: 11, fontWeight: "700" },
  composer: { minHeight: 56, borderRadius: 18, borderWidth: 1, flexDirection: "row-reverse", alignItems: "center", gap: 8, paddingHorizontal: 8, marginTop: 8, marginBottom: 3 },
  composerInput: { flex: 1, maxHeight: 80, fontSize: 13, paddingHorizontal: 4, paddingVertical: 8 },
  micButton: { width: 40, height: 40, borderRadius: 13, backgroundColor: "#D7F4EF", alignItems: "center", justifyContent: "center" },
  sendButton: { width: 40, height: 40, borderRadius: 13, backgroundColor: "#0E7C7B", alignItems: "center", justifyContent: "center" },
});
