import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { Button, IconButton, Input } from "@/src/components/ui";
import { makeStyles } from "@/src/theme";
import { useToast } from "@/src/toast";

export default function ForgotPassword() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return toast.show("Enter a valid email", "error");
    setBusy(true);
    try {
      const res = await api<{ message: string; dev_code?: string }>("/auth/forgot-password", {
        method: "POST",
        body: { email: email.trim() },
        skipAuthHandler: true,
      });
      toast.show(res.message, "success");
      router.push({ pathname: "/(auth)/reset-password", params: { email: email.trim(), code: res.dev_code ?? "" } });
    } catch (e: any) {
      toast.show(e.message ?? "Something went wrong", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root} testID="forgot-password-screen">
      <View style={{ paddingTop: insets.top, paddingHorizontal: 8 }}>
        <IconButton name="chevron-back" onPress={() => router.back()} testID="forgot-back-button" />
      </View>
      <KeyboardAwareScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]} bottomOffset={24}>
        <Text style={styles.eyebrow}>ACCOUNT RECOVERY</Text>
        <Text style={styles.title}>Forgot your password?</Text>
        <Text style={styles.subtitle}>Enter your email and we&apos;ll send you a 6-digit reset code.</Text>
        <View style={styles.form}>
          <Input
            label="Email"
            icon="mail-outline"
            placeholder="you@example.com"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            onSubmitEditing={submit}
            testID="forgot-email-input"
          />
          <Button title="Send reset code" onPress={submit} loading={busy} testID="forgot-submit-button" />
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  content: { paddingHorizontal: 24, paddingTop: 16 },
  eyebrow: { color: colors.brandSecondary, fontSize: 12, letterSpacing: 1.5 },
  title: { color: colors.onSurface, fontSize: 32, fontWeight: "500", marginTop: 8, letterSpacing: -0.5, lineHeight: 38 },
  subtitle: { color: colors.muted, fontSize: 14, marginTop: 6, lineHeight: 20 },
  form: { marginTop: 32, gap: 16 },
}));
