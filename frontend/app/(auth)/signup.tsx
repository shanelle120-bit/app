import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth-context";
import { Button, Checkbox, IconButton, Input } from "@/src/components/ui";
import { LegalLink } from "@/src/components/legal-link";
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
  const [consentOpen, setConsentOpen] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [agreedTerms, setAgreedTerms] = useState(false);

  const validate = () => {
    if (!name.trim()) {
      toast.show("Enter your display name", "error");
      return false;
    }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      toast.show("Enter a valid email", "error");
      return false;
    }
    if (password.length < 8) {
      toast.show("Password must be at least 8 characters", "error");
      return false;
    }
    return true;
  };

  // Tapping "Create account" opens the required age/terms consent step first;
  // the account is only actually created once both boxes are checked below.
  const openConsent = () => {
    if (!validate()) return;
    setConsentOpen(true);
  };

  const confirmSignup = async () => {
    if (!ageConfirmed || !agreedTerms) return;
    setBusy(true);
    try {
      await signup(email.trim(), password, name.trim(), ageConfirmed, agreedTerms);
      setConsentOpen(false);
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
            onSubmitEditing={openConsent}
            testID="signup-password-input"
            right={
              <Pressable onPress={() => setShow((s) => !s)} hitSlop={8} testID="signup-toggle-password">
                <Ionicons name={show ? "eye-off-outline" : "eye-outline"} size={20} color={colors.muted} />
              </Pressable>
            }
          />
          <Button title="Create account" onPress={openConsent} testID="signup-submit-button" style={{ marginTop: 8 }} />
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

      <Modal visible={consentOpen} transparent animationType="slide" onRequestClose={() => setConsentOpen(false)}>
        <View style={styles.consentBackdrop}>
          <Pressable style={{ flex: 1 }} onPress={() => setConsentOpen(false)} />
          <View style={[styles.consentSheet, { paddingBottom: insets.bottom + 20 }]} testID="signup-consent-sheet">
            <View style={styles.consentHandle} />
            <Text style={styles.consentTitle}>Before you join</Text>
            <Text style={styles.consentSubtitle}>You must be 18 or older to use Level Up Trading Hub.</Text>

            <Pressable style={styles.consentRow} onPress={() => setAgeConfirmed((v) => !v)} testID="signup-age-checkbox">
              <Checkbox checked={ageConfirmed} onPress={() => setAgeConfirmed((v) => !v)} testID="signup-age-checkbox-box" />
              <Text style={styles.consentText}>I confirm I am 18 or older.</Text>
            </Pressable>

            <Pressable style={styles.consentRow} onPress={() => setAgreedTerms((v) => !v)} testID="signup-terms-checkbox">
              <Checkbox checked={agreedTerms} onPress={() => setAgreedTerms((v) => !v)} testID="signup-terms-checkbox-box" />
              <Text style={styles.consentText}>
                I agree to the <LegalLink slug="terms" label="Terms of Service" testID="signup-terms-link" /> and{" "}
                <LegalLink slug="privacy" label="Privacy Policy" testID="signup-privacy-link" />.
              </Text>
            </Pressable>

            <Button
              title="Create account"
              onPress={confirmSignup}
              loading={busy}
              disabled={!ageConfirmed || !agreedTerms}
              testID="signup-consent-confirm-button"
              style={{ marginTop: 20 }}
            />
            <Button title="Cancel" variant="ghost" onPress={() => setConsentOpen(false)} testID="signup-consent-cancel-button" />
          </View>
        </View>
      </Modal>
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

  consentBackdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" },
  consentSheet: { backgroundColor: colors.surfaceSecondary, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  consentHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, alignSelf: "center", marginBottom: 16 },
  consentTitle: { color: colors.onSurface, fontSize: 22, fontWeight: "500", letterSpacing: -0.3 },
  consentSubtitle: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 6 },
  consentRow: { flexDirection: "row", alignItems: "flex-start", gap: 4, marginTop: 18 },
  consentText: { flex: 1, color: colors.onSurfaceSecondary, fontSize: 14, lineHeight: 20, paddingTop: 11 },
}));

