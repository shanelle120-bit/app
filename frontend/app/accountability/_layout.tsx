import { Stack } from "expo-router";

import { useTheme } from "@/src/theme";

export default function AccountabilityLayout() {
  const { colors } = useTheme();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface }, animation: "slide_from_right" }} />;
}
