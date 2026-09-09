import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth-context";
import { Button, IconButton, Input } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";
import { useToast } from "@/src/toast";

export default function Login() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { login, loginWithGoogle, googleBusy } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email.trim() || !password) return toast.show("Enter your email and password", "error");
    setBusy(true);
    try {
      await login(email.trim(), password);
    } catch (e: any) {
      toast.show(e.message ?? "Login failed", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root} testID="login-screen">
      <View style={{ paddingTop: insets.top, paddingHorizontal: 8 }}>
        <IconButton name="chevron-back" onPress={() => router.back()} testID="login-back-button" />
      </View>
      <KeyboardAwareScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]} bottomOffset={24}>
        <Text style={styles.eyebrow}>WELCOME BACK</Text>
        <Text style={styles.title}>Log in to the hub</Text>
        <Text style={styles.subtitle}>Where Traders Connect Beyond the Charts... No Advertising/Soliciting.</Text>

        <View style={styles.form}>
          <Input
            label="Email"
            icon="mail-outline"
            placeholder="you@example.com"
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            value={email}
            onChangeText={setEmail}
            testID="login-email-input"
          />
          <Input
            label="Password"
            icon="lock-closed-outline"
            placeholder="Your password"
            secureTextEntry={!show}
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={submit}
            testID="login-password-input"
            right={
              <Pressable onPress={() => setShow((s) => !s)} hitSlop={8} testID="login-toggle-password">
                <Ionicons name={show ? "eye-off-outline" : "eye-outline"} size={20} color={colors.muted} />
              </Pressable>
            }
          />
          <Pressable onPress={() => router.push("/(auth)/forgot-password")} style={styles.forgot} testID="login-forgot-link">
            <Text style={styles.forgotText}>Forgot password?</Text>
          </Pressable>
          <Button title="Log in" onPress={submit} loading={busy} testID="login-submit-button" />
        </View>

        <View style={styles.dividerRow}>
          <View style={styles.divider} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.divider} />
        </View>
        <Button title="Continue with Google" icon="logo-google" variant="secondary" onPress={loginWithGoogle} loading={googleBusy} testID="login-google-button" />

        <Pressable onPress={() => router.replace("/(auth)/signup")} style={styles.switch} testID="login-switch-signup">
          <Text style={styles.switchText}>
            New here? <Text style={{ color: colors.brandSecondary }}>Create an account</Text>
          </Text>
        </Pressable>
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  content: { paddingHorizontal: 24, paddingTop: 16 },
  eyebrow: { color: colors.brandSecondary, fontSize: 12, letterSpacing: 1.5 },
  title: { color: colors.onSurface, fontSize: 32, fontWeight: "500", marginTop: 8, letterSpacing: -0.5 },
  subtitle: { color: colors.muted, fontSize: 14, marginTop: 6 },
  form: { marginTop: 32, gap: 16 },
  forgot: { alignSelf: "flex-end", minHeight: 32, justifyContent: "center" },
  forgotText: { color: colors.silver, fontSize: 14 },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 24 },
  divider: { flex: 1, height: 1, backgroundColor: colors.divider },
  dividerText: { color: colors.muted, fontSize: 12 },
  switch: { minHeight: 44, alignItems: "center", justifyContent: "center", marginTop: 16 },
  switchText: { color: colors.muted, fontSize: 14 },
}));
