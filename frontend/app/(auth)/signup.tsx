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

export default function Signup() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { signup, loginWithGoogle, googleBusy } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim()) return toast.show("Enter your display name", "error");
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return toast.show("Enter a valid email", "error");
    if (password.length < 8) return toast.show("Password must be at least 8 characters", "error");
    setBusy(true);
    try {
      await signup(email.trim(), password, name.trim());
    } catch (e: any) {
      toast.show(e.message ?? "Sign up failed", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root} testID="signup-screen">
      <View style={{ paddingTop: insets.top, paddingHorizontal: 8 }}>
        <IconButton name="chevron-back" onPress={() => router.back()} testID="signup-back-button" />
      </View>
      <KeyboardAwareScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]} bottomOffset={24}>
        <Text style={styles.eyebrow}>JOIN THE HUB</Text>
        <Text style={styles.title}>Create your trader account</Text>
        <Text style={styles.subtitle}>Free to join. Premium areas coming soon.</Text>

        <View style={styles.form}>
          <Input label="Display name" icon="person-outline" placeholder="e.g. Marcus Reyes" value={name} onChangeText={setName} testID="signup-name-input" />
          <Input
            label="Email"
            icon="mail-outline"
            placeholder="you@example.com"
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            value={email}
            onChangeText={setEmail}
            testID="signup-email-input"
          />
          <Input
            label="Password"
            icon="lock-closed-outline"
            placeholder="At least 8 characters"
            secureTextEntry={!show}
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={submit}
            testID="signup-password-input"
            right={
              <Pressable onPress={() => setShow((s) => !s)} hitSlop={8} testID="signup-toggle-password">
                <Ionicons name={show ? "eye-off-outline" : "eye-outline"} size={20} color={colors.muted} />
              </Pressable>
            }
          />
          <Button title="Create account" onPress={submit} loading={busy} testID="signup-submit-button" style={{ marginTop: 8 }} />
        </View>

        <View style={styles.dividerRow}>
          <View style={styles.divider} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.divider} />
        </View>
        <Button title="Continue with Google" icon="logo-google" variant="secondary" onPress={loginWithGoogle} loading={googleBusy} testID="signup-google-button" />

        <Pressable onPress={() => router.replace("/(auth)/login")} style={styles.switch} testID="signup-switch-login">
          <Text style={styles.switchText}>
            Already a member? <Text style={{ color: colors.brandSecondary }}>Log in</Text>
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
  title: { color: colors.onSurface, fontSize: 32, fontWeight: "500", marginTop: 8, letterSpacing: -0.5, lineHeight: 38 },
  subtitle: { color: colors.muted, fontSize: 14, marginTop: 6 },
  form: { marginTop: 32, gap: 16 },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 24 },
  divider: { flex: 1, height: 1, backgroundColor: colors.divider },
  dividerText: { color: colors.muted, fontSize: 12 },
  switch: { minHeight: 44, alignItems: "center", justifyContent: "center", marginTop: 16 },
  switchText: { color: colors.muted, fontSize: 14 },
}));
