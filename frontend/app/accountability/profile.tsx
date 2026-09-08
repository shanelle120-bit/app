import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAccMe, useAccMeta } from "@/src/accountability";
import { OptionChips } from "@/src/components/accountability-ui";
import { Button, Input, Loader, ScreenHeader } from "@/src/components/ui";
import { makeStyles } from "@/src/theme";
import { useToast } from "@/src/toast";

export default function AccountabilityPreferences() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const me = useAccMe();
  const meta = useAccMeta();
  const p = me.data?.profile;
  const [form, setForm] = useState({
    markets: p?.markets ?? [], instruments: p?.instruments ?? "", session: p?.session ?? "Flexible/Other", timezone: p?.timezone ?? "",
    frequency: p?.frequency ?? "Few times a week", working_on: p?.working_on ?? "", looking_for: p?.looking_for ?? [],
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = useMutation({
    mutationFn: () => api("/accountability/profile", { method: "PUT", body: form }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["accountability"] }); toast.show("Preferences saved", "success"); router.back(); },
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  if (me.isLoading || !meta.data) return <View style={styles.root}><Loader /></View>;
  const m = meta.data;
  return (
    <View style={styles.root} testID="acc-profile-screen">
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader title="Accountability preferences" onBack={() => router.back()} />
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]} keyboardShouldPersistTaps="handled">
        <OptionChips label="Markets traded" options={m.markets} value={form.markets} onChange={(v) => set("markets", v)} multi testID="acc-market" />
        <Input label="Instruments (optional)" value={form.instruments} onChangeText={(v) => set("instruments", v)} placeholder="NQ, ES, SPY…" testID="acc-instruments" />
        <OptionChips label="Typical trading session" options={m.sessions} value={form.session} onChange={(v) => set("session", v)} testID="acc-session" />
        <Input label="Time zone" value={form.timezone} onChangeText={(v) => set("timezone", v)} placeholder="EST, GMT+1…" testID="acc-timezone" />
        <OptionChips label="Accountability style" options={m.frequencies} value={form.frequency} onChange={(v) => set("frequency", v)} testID="acc-frequency" />
        <Input label="I'm working on" value={form.working_on} onChangeText={(v) => set("working_on", v)} placeholder="Stopping after 3 trades. No revenge trading." maxLength={200} multiline testID="acc-working-on" />
        <OptionChips label="I'm looking for" options={m.looking_for} value={form.looking_for} onChange={(v) => set("looking_for", v)} multi testID="acc-looking" />
        <Button title="Save preferences" onPress={() => save.mutate()} loading={save.isPending} testID="acc-profile-save" />
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  content: { padding: 16, gap: 18 },
}));
