// Fallback for using MaterialIcons on Android and web.

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { SymbolWeight, SymbolViewProps } from "expo-symbols";
import { ComponentProps } from "react";
import { OpaqueColorValue, type StyleProp, type TextStyle } from "react-native";

type IconMapping = Record<SymbolViewProps["name"], ComponentProps<typeof MaterialIcons>["name"]>;
type IconSymbolName = keyof typeof MAPPING;

/**
 * Add your SF Symbols to Material Icons mappings here.
 * - see Material Icons in the [Icons Directory](https://icons.expo.fyi).
 * - see SF Symbols in the [SF Symbols](https://developer.apple.com/sf-symbols/) app.
 */
const MAPPING = {
  "house.fill": "home",
  "paperplane.fill": "send",
  "chevron.left.forwardslash.chevron.right": "code",
  "chevron.right": "chevron-right",
  "chart.bar.fill": "bar-chart",
  "bag.fill": "shopping-bag",
  "sparkles": "auto-awesome",
  "person.crop.circle.fill": "account-circle",
  "bell.fill": "notifications",
  "building.2.fill": "business",
  "rectangle.grid.2x2.fill": "dashboard",
  "arrow.clockwise.circle.fill": "autorenew",
  "magnifyingglass": "search",
  "chevron.left": "chevron-left",
  "checkmark.circle.fill": "check-circle",
  "plus": "add",
  "arrow.up.left": "north-west",
  "location.fill": "location-on",
  "wrench.and.screwdriver.fill": "build",
  "fork.knife": "restaurant",
  "car.fill": "directions-car",
  "checkmark.seal.fill": "verified",
  "arrow.triangle.2.circlepath": "sync",
  "line.3.horizontal.decrease.circle": "tune",
  "arrow.left": "arrow-back",
  "xmark": "close",
  "mic.fill": "mic",
  "waveform": "graphic-eq",
  "send.fill": "send",
  "shield.fill": "shield",
  "person.2.fill": "people",
  "gearshape.fill": "settings",
  "rectangle.portrait.and.arrow.right": "logout",
} as unknown as IconMapping;

/**
 * An icon component that uses native SF Symbols on iOS, and Material Icons on Android and web.
 * This ensures a consistent look across platforms, and optimal resource usage.
 * Icon `name`s are based on SF Symbols and require manual mapping to Material Icons.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  return <MaterialIcons color={color} size={size} name={MAPPING[name]} style={style} />;
}
