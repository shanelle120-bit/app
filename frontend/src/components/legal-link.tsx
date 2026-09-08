import { useRouter } from "expo-router";
import React from "react";
import { Text } from "react-native";

import { useTheme } from "@/src/theme";

/** Inline tappable policy name — nest inside a <Text> to build a sentence like
 * "I agree to the <LegalLink .../> and <LegalLink .../>". */
export function LegalLink({ slug, label, testID }: { slug: string; label: string; testID?: string }) {
  const router = useRouter();
  const { colors } = useTheme();
  return (
    <Text onPress={() => router.push(`/legal/${slug}`)} style={{ color: colors.brandSecondary, fontWeight: "600" }} testID={testID}>
      {label}
    </Text>
  );
}
