import Ionicons from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { ScrollView, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";
import { useToast } from "@/src/toast";

const HERO = "https://images.unsplash.com/photo-1689443111130-6e9c7dfd8f9e?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200";

const SECTIONS = [
  {
    key: "single-mingle",
    icon: "heart-circle-outline",
    title: "Single & Mingle",
    body: "Meet traders who get the lifestyle. A social space for connection beyond the charts.",
    tone: "brand" as const,
  },
  {
    key: "accountability",
    icon: "people-circle-outline",
    title: "Accountability Partners",
    body: "Pair up with a trader on your schedule. Daily check-ins, shared journals, real discipline.",
    tone: "cyan" as const,
  },
  {
    key: "trading-only",
    icon: "bar-chart-outline",
    title: "Trading Only",
    body: "Zero noise. Setups, execution, risk. A focused room for serious market talk.",
    tone: "blue" as const,
  },
];

export default function Premium() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();

  const toneColor = { brand: colors.brandPrimary, cyan: colors.brandSecondary, blue: colors.brandTertiary };

  return (
    <View style={styles.root} testID="premium-screen">
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <View style={styles.hero}>
          <Image source={{ uri: HERO }} style={styles.heroImage} contentFit="cover" />
          <LinearGradient colors={["rgba(11,15,25,0.2)", colors.surface]} style={styles.heroScrim} />
          <View style={[styles.heroContent, { paddingTop: insets.top + 24 }]}>
            <View style={styles.pill}>
              <Ionicons name="diamond" size={12} color={colors.brandSecondary} />
              <Text style={styles.pillText}>PREMIUM · COMING SOON</Text>
            </View>
            <Text style={styles.title}>Level up your circle</Text>
            <Text style={styles.subtitle}>Three exclusive areas are on the way. Members-only rooms built for how traders actually connect.</Text>
          </View>
        </View>

        <View style={styles.cards}>
          {SECTIONS.map((s, i) => (
            <Animated.View key={s.key} entering={FadeInDown.delay(i * 90).duration(400)} style={[styles.card, { borderColor: toneColor[s.tone] }]} testID={`premium-card-${s.key}`}>
              <View style={styles.cardTop}>
                <View style={[styles.cardIcon, { backgroundColor: colors.surfaceTertiary }]}>
                  <Ionicons name={s.icon as any} size={26} color={toneColor[s.tone]} />
                </View>
                <View style={styles.lock}>
                  <Ionicons name="lock-closed" size={12} color={colors.muted} />
                  <Text style={styles.lockText}>Locked</Text>
                </View>
              </View>
              <Text style={styles.cardTitle}>{s.title}</Text>
              <Text style={styles.cardBody}>{s.body}</Text>
            </Animated.View>
          ))}
        </View>

        <View style={styles.cta}>
          <Button title="Notify me when Premium launches" icon="notifications-outline" onPress={() => toast.show("You're on the list. We'll let you know.", "success")} testID="premium-notify-button" />
          <Text style={styles.footnote}>No payments yet. Premium access will be added in a future release.</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  hero: { height: 320 },
  heroImage: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  heroScrim: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  heroContent: { flex: 1, justifyContent: "flex-end", padding: 24 },
  pill: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", backgroundColor: colors.cyanSoft, borderRadius: 999, paddingHorizontal: 10, height: 26 },
  pillText: { color: colors.brandSecondary, fontSize: 11, letterSpacing: 1 },
  title: { color: colors.onSurface, fontSize: 32, fontWeight: "500", marginTop: 12, letterSpacing: -0.5 },
  subtitle: { color: colors.silver, fontSize: 15, lineHeight: 22, marginTop: 8 },
  cards: { paddingHorizontal: 16, gap: 12, marginTop: 8 },
  card: { backgroundColor: colors.glass, borderRadius: 20, borderWidth: 1, padding: 18 },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardIcon: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  lock: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.surfaceTertiary, borderRadius: 999, paddingHorizontal: 10, height: 26 },
  lockText: { color: colors.muted, fontSize: 11, letterSpacing: 0.5 },
  cardTitle: { color: colors.onSurface, fontSize: 20, fontWeight: "500", marginTop: 14 },
  cardBody: { color: colors.silver, fontSize: 14, lineHeight: 21, marginTop: 6 },
  cta: { paddingHorizontal: 16, marginTop: 24, gap: 10 },
  footnote: { color: colors.muted, fontSize: 12, textAlign: "center" },
}));
