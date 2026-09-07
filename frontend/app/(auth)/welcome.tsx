import Ionicons from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth-context";
import { makeStyles, useTheme } from "@/src/theme";
import { useToast } from "@/src/toast";

// Supplied landing artwork (logo, tagline, community imagery and feature icons baked in).
const HERO = require("../../assets/images/landing-hero.jpg");

export default function Welcome() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { loginWithGoogle, googleBusy } = useAuth();

  return (
    <View style={styles.root} testID="welcome-screen">
      <View style={[styles.heroWrap, { paddingTop: insets.top }]}>
        <Image source={HERO} style={styles.hero} contentFit="cover" contentPosition="top" transition={200} />
        <LinearGradient colors={["rgba(11,15,25,0)", colors.surface]} style={styles.heroFade} />
      </View>

      <View style={[styles.actions, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable onPress={() => router.push("/(auth)/signup")} style={({ pressed }) => [pressed && { opacity: 0.9 }]} testID="welcome-signup-button">
          <LinearGradient colors={[colors.brandPrimary, colors.brandTertiary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.primary}>
            <Text style={styles.primaryText}>Create account</Text>
            <Ionicons name="arrow-forward" size={20} color={colors.onBrandPrimary} style={styles.primaryArrow} />
          </LinearGradient>
        </Pressable>
        <Pressable onPress={() => router.push("/(auth)/login")} style={({ pressed }) => [styles.secondary, pressed && { opacity: 0.85 }]} testID="welcome-login-button">
          <Text style={styles.secondaryText}>Log in</Text>
          <Ionicons name="arrow-forward" size={18} color={colors.onSurface} />
        </Pressable>

        <View style={styles.dividerRow}>
          <View style={styles.divider} />
          <Text style={styles.dividerText}>OR CONTINUE WITH</Text>
          <View style={styles.divider} />
        </View>
        <View style={styles.providers}>
          <Pressable onPress={() => toast.show("Apple sign-in is coming soon", "info")} style={styles.provider} testID="welcome-apple-button">
            <Ionicons name="logo-apple" size={20} color={colors.onSurface} />
            <Text style={styles.providerText}>Apple</Text>
          </Pressable>
          <Pressable onPress={loginWithGoogle} disabled={googleBusy} style={styles.provider} testID="welcome-google-button">
            {googleBusy ? <ActivityIndicator size="small" color={colors.onSurface} /> : <Ionicons name="logo-google" size={20} color={colors.onSurface} />}
            <Text style={styles.providerText}>Google</Text>
          </Pressable>
          <Pressable onPress={() => router.push("/(auth)/signup")} style={styles.provider} testID="welcome-email-button">
            <Ionicons name="mail" size={20} color={colors.onSurface} />
            <Text style={styles.providerText}>Email</Text>
          </Pressable>
        </View>

        <Text style={styles.footerAccent}>
          CONNECT <Text style={styles.footerSep}>|</Text> GROW <Text style={styles.footerSep}>|</Text> BELONG
        </Text>
        <Text style={styles.footerMuted}>ANY MARKET. ANY STYLE. EVERY JOURNEY.</Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  heroWrap: { flex: 1, backgroundColor: colors.surface },
  hero: { flex: 1, width: "100%" },
  heroFade: { position: "absolute", left: 0, right: 0, bottom: 0, height: 24 },
  actions: { paddingHorizontal: 24, paddingTop: 8, gap: 12 },
  primary: { height: 56, borderRadius: 999, alignItems: "center", justifyContent: "center", flexDirection: "row" },
  primaryText: { color: colors.onBrandPrimary, fontSize: 18, fontWeight: "500" },
  primaryArrow: { position: "absolute", right: 24 },
  secondary: { height: 56, borderRadius: 999, borderWidth: 1.5, borderColor: colors.brandPrimary, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  secondaryText: { color: colors.onSurface, fontSize: 18, fontWeight: "500" },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 4 },
  divider: { flex: 1, height: 1, backgroundColor: colors.borderStrong },
  dividerText: { color: colors.silver, fontSize: 11, letterSpacing: 2 },
  providers: { flexDirection: "row", gap: 10 },
  provider: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceSecondary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  providerText: { color: colors.onSurface, fontSize: 15 },
  footerAccent: { color: colors.brandPrimary, fontSize: 13, letterSpacing: 3, textAlign: "center", marginTop: 8 },
  footerSep: { color: colors.muted },
  footerMuted: { color: colors.silver, fontSize: 11, letterSpacing: 2.5, textAlign: "center" },
}));
