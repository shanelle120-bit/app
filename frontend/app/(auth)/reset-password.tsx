import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { Button, IconButton, Input } from "@/src/components/ui";
import { makeStyles } from "@/src/theme";
import { useToast } from "@/src/toast";

export default function ResetPassword() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams<{ email?: string; code?: string }>();
  const [email, setEmail] = useState(params.email ?? "");
  const [code, setCode] = useState(params.code ?? "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (code.trim().length !== 6) return toast.show("Enter the 6-digit code", "error");
    if (password.length < 8) return toast.show("Password must be at least 8 characters", "error");
    setBusy(true);
    try {
      await api("/auth/reset-password", {
        method: "POST",
        body: { email: email.trim(), code: code.trim(), new_password: password },
        skipAuthHandler: true,
      });
      toast.show("Password updated. Log in with your new password.", "success");
      router.replace("/(auth)/login");
    } catch (e: any) {
      toast.show(e.message ?? "Reset failed", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root} testID="reset-password-screen">
      <View style={{ paddingTop: insets.top, paddingHorizontal: 8 }}>
        <IconButton name="chevron-back" onPress={() => router.back()} testID="reset-back-button" />
      </View>
      <KeyboardAwareScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]} bottomOffset={24}>
        <Text style={styles.eyebrow}>ACCOUNT RECOVERY</Text>
        <Text style={styles.title}>Set a new password</Text>
        <Text style={styles.subtitle}>
          Enter the 6-digit code and choose a new password.
          {params.code ? " Email delivery isn't connected yet, so we pre-filled your code." : ""}
        </Text>
        <View style={styles.form}>
          <Input label="Email" icon="mail-outline" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} testID="reset-email-input" />
          <Input label="Reset code" icon="key-outline" placeholder="123456" keyboardType="number-pad" maxLength={6} value={code} onChangeText={setCode} testID="reset-code-input" />
          <Input label="New password" icon="lock-closed-outline" placeholder="At least 8 characters" secureTextEntry value={password} onChangeText={setPassword} onSubmitEditing={submit} testID="reset-password-input" />
          <Button title="Update password" onPress={submit} loading={busy} testID="reset-submit-button" />
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
