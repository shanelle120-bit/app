import { useRouter } from "expo-router";
import React from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ProfileForm } from "@/src/components/profile-form";
import { ScreenHeader } from "@/src/components/ui";
import { makeStyles } from "@/src/theme";

export default function EditProfile() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const close = () => (router.canGoBack() ? router.back() : router.replace("/(tabs)/profile"));

  return (
    <View style={styles.root} testID="edit-profile-screen">
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader title="Edit profile" onBack={close} />
      </View>
      <View style={{ height: 16 }} />
      <ProfileForm mode="edit" onSaved={close} bottomPadding={insets.bottom} />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
}));
