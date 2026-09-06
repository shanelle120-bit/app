import Ionicons from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useRef, useState } from "react";
import { Dimensions, FlatList, Pressable, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";

const HERO =
  "https://images.unsplash.com/photo-1688413708888-8368d1d99a15?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200";

const SLIDES = [
  {
    icon: "pulse",
    title: "Where Traders Connect\nBeyond the Charts",
    body: "A premium social network built for futures, options, forex, stock and crypto traders.",
  },
  {
    icon: "images",
    title: "Share your setups",
    body: "Post chart screenshots, photos, short videos and GIFs. Get likes, comments and saves from real traders.",
  },
  {
    icon: "people",
    title: "Build your circle",
    body: "Follow traders in your markets, chat 1:1 and unlock premium communities coming soon.",
  },
];

export default function Welcome() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList>(null);
  const width = Dimensions.get("window").width;

  return (
    <View style={styles.root} testID="welcome-screen">
      <Image source={{ uri: HERO }} style={styles.hero} contentFit="cover" />
      <LinearGradient colors={["rgba(11,15,25,0.15)", colors.surface, colors.surface]} locations={[0, 0.55, 1]} style={styles.scrim} />
      <View style={[styles.brandRow, { top: insets.top + 16 }]}>
        <View style={styles.logoMark}>
          <Ionicons name="trending-up" size={18} color={colors.onBrandPrimary} />
        </View>
        <Text style={styles.brandName}>Level Up Trading Hub</Text>
      </View>

      <View style={{ flex: 1 }} />
      <FlatList
        ref={listRef}
        data={SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(s) => s.title}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        style={{ flexGrow: 0 }}
        renderItem={({ item }) => (
          <Animated.View entering={FadeInDown.duration(400)} style={[styles.slide, { width }]}>
            <View style={styles.slideIcon}>
              <Ionicons name={item.icon as any} size={22} color={colors.brandSecondary} />
            </View>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.body}>{item.body}</Text>
          </Animated.View>
        )}
      />
      <View style={styles.dots}>
        {SLIDES.map((_, i) => (
          <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
        ))}
      </View>
      <View style={[styles.actions, { paddingBottom: insets.bottom + 24 }]}>
        <Button title="Create account" onPress={() => router.push("/(auth)/signup")} testID="welcome-signup-button" />
        <Pressable onPress={() => router.push("/(auth)/login")} style={styles.loginLink} testID="welcome-login-button">
          <Text style={styles.loginText}>
            Already a member? <Text style={{ color: colors.brandSecondary }}>Log in</Text>
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  hero: { position: "absolute", top: 0, left: 0, right: 0, height: "60%" },
  scrim: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  brandRow: { position: "absolute", left: 24, flexDirection: "row", alignItems: "center", gap: 10 },
  logoMark: { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  brandName: { color: colors.onSurface, fontSize: 16, fontWeight: "500", letterSpacing: 0.4 },
  slide: { paddingHorizontal: 24 },
  slideIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.cyanSoft, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  title: { color: colors.onSurface, fontSize: 32, lineHeight: 38, fontWeight: "500", letterSpacing: -0.5 },
  body: { color: colors.silver, fontSize: 16, lineHeight: 24, marginTop: 12 },
  dots: { flexDirection: "row", gap: 6, paddingHorizontal: 24, marginTop: 24 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.borderStrong },
  dotActive: { width: 20, backgroundColor: colors.brandSecondary },
  actions: { paddingHorizontal: 24, paddingTop: 24, gap: 8 },
  loginLink: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  loginText: { color: colors.muted, fontSize: 14 },
}));
