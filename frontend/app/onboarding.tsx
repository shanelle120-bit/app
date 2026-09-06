import { useRouter } from "expo-router";
import React from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ProfileForm } from "@/src/components/profile-form";
import { makeStyles } from "@/src/theme";

export default function Onboarding() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={styles.root} testID="onboarding-screen">
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Text style={styles.eyebrow}>STEP 1 OF 1</Text>
        <Text style={styles.title}>Set up your trader profile</Text>
        <Text style={styles.subtitle}>Tell the hub what you trade so the right traders find you.</Text>
      </View>
      <ProfileForm mode="onboarding" onSaved={() => router.replace("/(tabs)")} bottomPadding={insets.bottom} />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: 16, paddingBottom: 16 },
  eyebrow: { color: colors.brandSecondary, fontSize: 12, letterSpacing: 1.5 },
  title: { color: colors.onSurface, fontSize: 28, fontWeight: "500", marginTop: 8, letterSpacing: -0.5 },
  subtitle: { color: colors.muted, fontSize: 14, marginTop: 6, lineHeight: 20 },
}));
