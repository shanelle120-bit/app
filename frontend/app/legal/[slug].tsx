import Ionicons from "@react-native-vector-icons/ionicons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IconButton } from "@/src/components/ui";
import { getLegalDoc } from "@/src/legal-content";
import { makeStyles, useTheme } from "@/src/theme";

// Source documents mark section headings as short, fully upper-case lines
// (e.g. "ELIGIBILITY", "DATA RETENTION"). Detect them so we can render a
// distinct, more scannable heading style instead of a plain paragraph.
function isSectionHeading(text: string): boolean {
  const letters = text.replace(/[^A-Za-z]/g, "");
  if (!letters || letters.length < 2) return false;
  const wordCount = text.trim().split(/\s+/).length;
  return letters === letters.toUpperCase() && wordCount <= 12;
}

export default function LegalDocScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const doc = getLegalDoc(slug);
  const back = () => (router.canGoBack() ? router.back() : router.replace("/(tabs)/profile"));

  return (
    <View style={styles.root} testID="legal-doc-screen">
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <IconButton name="chevron-back" onPress={back} testID="legal-back-button" />
        <Text style={styles.headerTitle} numberOfLines={1}>
          {doc?.title ?? "Not found"}
        </Text>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
        {doc ? (
          <>
            <View style={styles.body}>
              <View style={styles.iconWrap}>
                <Ionicons name={doc.icon as any} size={28} color={colors.brandSecondary} />
              </View>
              <Text style={styles.title}>{doc.title}</Text>
              {doc.body.map((p, i) =>
                isSectionHeading(p) ? (
                  <Text key={i} style={styles.heading}>
                    {p}
                  </Text>
                ) : (
                  <Text key={i} style={styles.paragraph}>
                    {p}
                  </Text>
                )
              )}
            </View>
          </>
        ) : (
          <Text style={styles.paragraph}>This policy page could not be found.</Text>
        )}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: { flex: 1, color: colors.onSurface, fontSize: 16, fontWeight: "500", textAlign: "center" },
  content: { paddingHorizontal: 24, paddingTop: 24, alignItems: "center" },
  body: { width: "100%", maxWidth: 700 },
  iconWrap: { width: 56, height: 56, borderRadius: 18, backgroundColor: colors.cyanSoft, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  title: { color: colors.onSurface, fontSize: 26, fontWeight: "500", letterSpacing: -0.4, marginBottom: 16 },
  heading: { color: colors.onSurface, fontSize: 15, fontWeight: "700", letterSpacing: 0.2, marginTop: 10, marginBottom: 8 },
  paragraph: { color: colors.silver, fontSize: 15, lineHeight: 23, marginBottom: 14 },
}));
