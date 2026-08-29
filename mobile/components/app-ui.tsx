import { PropsWithChildren } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { getServiceIcon, getStatusLabel, type RequestItem, type Service } from "@/lib/demo-data";
import { haptic } from "@/lib/haptics";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";

const navy = "#0B1F33";
const teal = "#0E7C7B";
const copper = "#E09F3E";

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <View style={[styles.brandMark, compact && styles.brandMarkCompact]}>
      <View style={styles.brandRoute} />
      <View style={styles.brandDot} />
    </View>
  );
}

export function AppHeader({ title, subtitle, notificationCount = 0 }: { title: string; subtitle?: string; notificationCount?: number }) {
  const colors = useColors();
  const router = useRouter();
  return (
    <View style={styles.header}>
      <View style={styles.headerCopy}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{title}</Text>
        {subtitle ? <Text style={[styles.headerSubtitle, { color: colors.muted }]}>{subtitle}</Text> : null}
      </View>
      <View style={styles.headerActions}>
        <Pressable accessibilityLabel="فتح الإشعارات" onPress={() => { haptic.light(); router.push("/notifications" as never); }} style={({ pressed }) => [styles.iconButton, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && styles.pressed]}>
          <IconSymbol name="bell.fill" size={21} color={colors.foreground} />
          {notificationCount > 0 ? <View style={styles.notificationDot}><Text style={styles.notificationCount}>{notificationCount > 9 ? "9+" : notificationCount}</Text></View> : null}
        </Pressable>
        <BrandMark compact />
      </View>
    </View>
  );
}

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const colors = useColors();
  return (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{title}</Text>
      {action && onAction ? <Pressable accessibilityRole="button" onPress={() => { haptic.light(); onAction(); }}><Text style={[styles.sectionAction, { color: colors.primary }]}>{action}</Text></Pressable> : null}
    </View>
  );
}

export function MetricCard({ label, value, trend, tone = "teal" }: { label: string; value: string; trend: string; tone?: "teal" | "copper" | "navy" }) {
  const colors = useColors();
  const accent = tone === "copper" ? copper : tone === "navy" ? navy : teal;
  return (
    <View style={[styles.metricCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.metricAccent, { backgroundColor: accent }]} />
      <Text style={[styles.metricLabel, { color: colors.muted }]}>{label}</Text>
      <Text style={[styles.metricValue, { color: colors.foreground }]}>{value}</Text>
      <Text style={[styles.metricTrend, { color: tone === "copper" ? colors.warning : colors.success }]}>{trend}</Text>
    </View>
  );
}

export function StatusBadge({ status }: { status: RequestItem["status"] }) {
  const colors = useColors();
  const stylesByStatus = {
    new: { backgroundColor: "#FFF2D8", color: colors.warning },
    in_progress: { backgroundColor: "#DFF4F0", color: colors.primary },
    completed: { backgroundColor: "#E3F4EC", color: colors.success },
  }[status];
  return <View style={[styles.statusBadge, { backgroundColor: stylesByStatus.backgroundColor }]}><View style={[styles.statusDot, { backgroundColor: stylesByStatus.color }]} /><Text style={[styles.statusText, { color: stylesByStatus.color }]}>{getStatusLabel(status)}</Text></View>;
}

export function ServiceCard({ service, onPress }: { service: Service; onPress?: () => void }) {
  const colors = useColors();
  const content = (
    <View style={[styles.serviceCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.serviceIcon, { backgroundColor: `${service.accent}18` }]}><IconSymbol name={getServiceIcon(service.icon) as never} size={24} color={service.accent} /></View>
      <View style={styles.serviceCopy}>
        <View style={styles.serviceTitleRow}><Text numberOfLines={1} style={[styles.serviceName, { color: colors.foreground }]}>{service.name}</Text><Text style={[styles.rating, { color: colors.warning }]}>{service.rating} ★</Text></View>
        <Text numberOfLines={1} style={[styles.serviceBusiness, { color: colors.muted }]}>{service.business}</Text>
        <View style={styles.serviceMeta}><View style={styles.metaItem}><IconSymbol name="location.fill" size={13} color={colors.muted} /><Text style={[styles.metaText, { color: colors.muted }]}>{service.area}</Text></View><Text style={[styles.servicePrice, { color: colors.foreground }]}>{service.price}</Text></View>
      </View>
    </View>
  );
  if (!onPress) return content;
  return <Pressable accessibilityRole="button" onPress={() => { haptic.light(); onPress(); }} style={({ pressed }) => pressed ? [styles.pressed] : undefined}>{content}</Pressable>;
}

export function Surface({ children, style }: PropsWithChildren<{ style?: object }>) {
  const colors = useColors();
  return <View style={[styles.surface, { backgroundColor: colors.surface, borderColor: colors.border }, style]}>{children}</View>;
}

export function EmptyState({ icon = "rectangle.grid.2x2.fill", title, copy, action, onAction }: { icon?: "rectangle.grid.2x2.fill" | "magnifyingglass" | "bell.fill" | "shield.fill"; title: string; copy: string; action?: string; onAction?: () => void }) {
  const colors = useColors();
  return <View style={styles.emptyState}><View style={[styles.emptyIcon, { backgroundColor: `${colors.primary}14` }]}><IconSymbol name={icon} size={26} color={colors.primary} /></View><Text style={[styles.emptyTitle, { color: colors.foreground }]}>{title}</Text><Text style={[styles.emptyCopy, { color: colors.muted }]}>{copy}</Text>{action && onAction ? <Pressable onPress={() => { haptic.light(); onAction(); }} style={[styles.outlineButton, { borderColor: colors.primary }]}><Text style={[styles.outlineButtonText, { color: colors.primary }]}>{action}</Text></Pressable> : null}</View>;
}

export function PrimaryButton({ children, onPress, icon }: PropsWithChildren<{ onPress: () => void; icon?: "arrow.left" | "plus" | "sparkles" | "checkmark.circle.fill" }>) {
  return <Pressable accessibilityRole="button" onPress={() => { haptic.light(); onPress(); }} style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}>{icon ? <IconSymbol name={icon} size={18} color="#FFFFFF" /> : null}<Text style={styles.primaryButtonText}>{children}</Text></Pressable>;
}

export function SoftButton({ children, onPress, icon }: PropsWithChildren<{ onPress: () => void; icon?: "arrow.left" | "plus" | "magnifyingglass" | "location.fill" | "line.3.horizontal.decrease.circle" | "shield.fill" | "rectangle.portrait.and.arrow.right" }>) {
  const colors = useColors();
  return <Pressable accessibilityRole="button" onPress={() => { haptic.light(); onPress(); }} style={({ pressed }) => [styles.softButton, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && styles.buttonPressed]}>{icon ? <IconSymbol name={icon} size={17} color={colors.primary} /> : null}<Text style={[styles.softButtonText, { color: colors.foreground }]}>{children}</Text></Pressable>;
}

export const appColors = { navy, teal, copper };

const styles = StyleSheet.create({
  brandMark: { width: 42, height: 42, borderRadius: 14, backgroundColor: navy, position: "relative", overflow: "hidden" },
  brandMarkCompact: { width: 38, height: 38, borderRadius: 12 },
  brandRoute: { position: "absolute", width: 37, height: 12, borderTopWidth: 3, borderBottomWidth: 3, borderColor: "#49C8BC", transform: [{ rotate: "-28deg" }], top: 13, left: 1, borderRadius: 8 },
  brandDot: { position: "absolute", width: 8, height: 8, backgroundColor: copper, borderRadius: 4, top: 8, right: 9 },
  header: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: 22 },
  headerCopy: { alignItems: "flex-end", flex: 1 },
  headerTitle: { fontSize: 26, fontWeight: "800", letterSpacing: -0.5, lineHeight: 34 },
  headerSubtitle: { marginTop: 3, fontSize: 13, lineHeight: 20 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 10, marginLeft: 12 },
  iconButton: { width: 42, height: 42, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center", position: "relative" },
  notificationDot: { position: "absolute", minWidth: 17, height: 17, borderRadius: 9, backgroundColor: copper, top: -5, right: -5, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 },
  notificationCount: { color: "#FFFFFF", fontSize: 9, fontWeight: "800" },
  pressed: { opacity: 0.68 },
  buttonPressed: { opacity: 0.86, transform: [{ scale: 0.98 }] },
  sectionHeader: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: "800" },
  sectionAction: { fontSize: 13, fontWeight: "700" },
  metricCard: { flex: 1, minHeight: 126, borderRadius: 18, borderWidth: 1, padding: 14, overflow: "hidden" },
  metricAccent: { height: 4, width: 26, borderRadius: 4, alignSelf: "flex-end", marginBottom: 14 },
  metricLabel: { textAlign: "right", fontSize: 11, lineHeight: 17 },
  metricValue: { textAlign: "right", fontSize: 26, fontWeight: "800", marginTop: 5 },
  metricTrend: { textAlign: "right", fontSize: 11, fontWeight: "700", marginTop: 3 },
  statusBadge: { flexDirection: "row-reverse", alignItems: "center", gap: 5, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 100 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: "800" },
  serviceCard: { borderWidth: 1, borderRadius: 20, padding: 14, flexDirection: "row-reverse", alignItems: "center", marginBottom: 10 },
  serviceIcon: { width: 52, height: 52, borderRadius: 17, alignItems: "center", justifyContent: "center", marginLeft: 12 },
  serviceCopy: { flex: 1 },
  serviceTitleRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", gap: 8 },
  serviceName: { flex: 1, fontSize: 15, fontWeight: "800", textAlign: "right" },
  rating: { fontSize: 11, fontWeight: "800" },
  serviceBusiness: { fontSize: 12, textAlign: "right", marginTop: 4 },
  serviceMeta: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginTop: 11 },
  metaItem: { flexDirection: "row-reverse", alignItems: "center", gap: 3 },
  metaText: { fontSize: 11 },
  servicePrice: { fontSize: 11, fontWeight: "800" },
  surface: { borderWidth: 1, borderRadius: 20, padding: 16 },
  emptyState: { alignItems: "center", paddingVertical: 44, paddingHorizontal: 26 },
  emptyIcon: { width: 58, height: 58, borderRadius: 21, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  emptyTitle: { fontSize: 17, fontWeight: "800", textAlign: "center" },
  emptyCopy: { fontSize: 13, lineHeight: 21, textAlign: "center", marginTop: 7 },
  outlineButton: { borderWidth: 1, borderRadius: 13, paddingHorizontal: 16, paddingVertical: 10, marginTop: 18 },
  outlineButtonText: { fontSize: 13, fontWeight: "800" },
  primaryButton: { minHeight: 50, borderRadius: 16, backgroundColor: teal, paddingHorizontal: 18, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8 },
  primaryButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  softButton: { minHeight: 48, borderRadius: 15, borderWidth: 1, paddingHorizontal: 16, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 7 },
  softButtonText: { fontSize: 13, fontWeight: "700" },
});
