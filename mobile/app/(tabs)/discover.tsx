import { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";

import { AppHeader, EmptyState, SectionHeader, ServiceCard, SoftButton } from "@/components/app-ui";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { categories, services } from "@/lib/demo-data";
import { haptic } from "@/lib/haptics";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

export default function DiscoverScreen() {
  const colors = useColors();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("الكل");
  const [nearbyOnly, setNearbyOnly] = useState(false);
  const remoteServices = trpc.marketplace.discover.useQuery(undefined, { retry: false, refetchOnWindowFocus: false });
  const remoteCategories = trpc.marketplace.categories.useQuery(undefined, { retry: false, refetchOnWindowFocus: false });
  const availableCategories = useMemo(() => ["الكل", ...new Set([...categories.slice(1), ...(remoteCategories.data ?? []).map((item) => item.name)])], [remoteCategories.data]);
  const marketServices = useMemo(() => {
    if (!remoteServices.data?.length) return services;
    const categoryNames = new Map((remoteCategories.data ?? []).map((item) => [item.id, item.name]));
    return remoteServices.data.map(({ service, business }) => ({
      id: String(service.id),
      name: service.name,
      business: business.name,
      category: categoryNames.get(service.categoryId ?? 0) ?? "خدمات",
      area: [business.district, business.city].filter(Boolean).join(" · ") || "شمال سيناء",
      price: "تواصل للتسعير",
      eta: "متاح حسب الموعد",
      rating: "جديد",
      accent: "#0E7C7B",
      icon: "store" as const,
      description: service.description ?? "خدمة منشورة من نشاط موثوق داخل السوق المحلي.",
      tags: ["خدمة منشورة", "منشأة محلية"],
    }));
  }, [remoteCategories.data, remoteServices.data]);
  const filtered = useMemo(() => marketServices.filter((service) => {
    const matchesQuery = !query.trim() || `${service.name} ${service.business} ${service.area}`.toLowerCase().includes(query.trim().toLowerCase());
    const matchesCategory = category === "الكل" || service.category === category;
    const matchesNearby = !nearbyOnly || service.area.includes("العريش");
    return matchesQuery && matchesCategory && matchesNearby;
  }), [category, marketServices, nearbyOnly, query]);

  return (
    <ScreenContainer className="px-5 pt-4" edges={["top", "left", "right"]}>
      <AppHeader title="السوق" subtitle="خدمات ومنتجات أقرب إلى يومك" />
      <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}><IconSymbol name="magnifyingglass" size={20} color={colors.muted} /><TextInput value={query} onChangeText={setQuery} placeholder="ابحث عن خدمة أو نشاط" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.foreground }]} textAlign="right" returnKeyType="search" /></View>
      <View style={styles.filterRow}><SoftButton onPress={() => { setNearbyOnly((current) => !current); haptic.selection(); }} icon="location.fill">{nearbyOnly ? "بالقرب مني" : "كل المناطق"}</SoftButton><SoftButton onPress={() => { setCategory("الكل"); setQuery(""); }} icon="line.3.horizontal.decrease.circle">تصفية</SoftButton></View>
      <SectionHeader title="التصنيفات" />
      <FlatList horizontal inverted data={availableCategories} keyExtractor={(item) => item} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryList} renderItem={({ item }) => <Pressable onPress={() => { setCategory(item); haptic.selection(); }} style={[styles.categoryPill, { backgroundColor: category === item ? colors.primary : colors.surface, borderColor: category === item ? colors.primary : colors.border }]}><Text style={[styles.categoryText, { color: category === item ? "#FFFFFF" : colors.muted }]}>{item}</Text></Pressable>} />
      <View style={styles.resultsHeader}><Text style={[styles.resultCount, { color: colors.muted }]}>{filtered.length} نتائج</Text><View style={styles.liveStatus}><View style={[styles.liveDot, { backgroundColor: colors.success }]} /><Text style={[styles.liveText, { color: colors.success }]}>محدث الآن</Text></View></View>
      <FlatList data={filtered} keyExtractor={(item) => item.id} showsVerticalScrollIndicator={false} contentContainerStyle={filtered.length === 0 ? styles.emptyList : styles.resultsList} renderItem={({ item }) => <ServiceCard service={item} onPress={() => router.push(`/service/${item.id}` as never)} />} ListEmptyComponent={<EmptyState icon="magnifyingglass" title="لم نجد نتيجة مطابقة" copy="جرّب كلمة بحث أوسع أو غيّر الفئة والمنطقة." action="إظهار كل الخدمات" onAction={() => { setQuery(""); setCategory("الكل"); setNearbyOnly(false); }} />} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  searchBox: { minHeight: 54, borderRadius: 17, borderWidth: 1, paddingHorizontal: 14, flexDirection: "row-reverse", alignItems: "center", gap: 9, marginBottom: 10 },
  input: { flex: 1, fontSize: 14, paddingVertical: 4 },
  filterRow: { flexDirection: "row-reverse", gap: 8, marginBottom: 22 },
  categoryList: { gap: 8, paddingBottom: 4 },
  categoryPill: { borderRadius: 100, borderWidth: 1, minHeight: 38, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" },
  categoryText: { fontSize: 12, fontWeight: "800" },
  resultsHeader: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginTop: 23, marginBottom: 12 },
  resultCount: { fontSize: 12 },
  liveStatus: { flexDirection: "row-reverse", alignItems: "center", gap: 5 },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  liveText: { fontSize: 11, fontWeight: "700" },
  resultsList: { paddingBottom: 24 },
  emptyList: { flexGrow: 1 },
});
