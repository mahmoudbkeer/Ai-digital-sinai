import { Tabs } from "expo-router";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";

export default function TabLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const bottomPadding = Platform.OS === "web" ? 10 : Math.max(insets.bottom, 10);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarButton: HapticTab,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600", marginBottom: 2 },
        tabBarStyle: {
          height: 64 + bottomPadding,
          paddingTop: 8,
          paddingBottom: bottomPadding,
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          elevation: 0,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "الرئيسية", tabBarIcon: ({ color }) => <IconSymbol name="house.fill" size={23} color={color} /> }} />
      <Tabs.Screen name="discover" options={{ title: "السوق", tabBarIcon: ({ color }) => <IconSymbol name="bag.fill" size={23} color={color} /> }} />
      <Tabs.Screen name="requests" options={{ title: "الطلبات", tabBarIcon: ({ color }) => <IconSymbol name="rectangle.grid.2x2.fill" size={23} color={color} /> }} />
      <Tabs.Screen name="assistant" options={{ title: "الذكاء", tabBarIcon: ({ color }) => <IconSymbol name="sparkles" size={23} color={color} /> }} />
      <Tabs.Screen name="account" options={{ title: "حسابي", tabBarIcon: ({ color }) => <IconSymbol name="person.crop.circle.fill" size={23} color={color} /> }} />
    </Tabs>
  );
}
