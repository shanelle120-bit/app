import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { ScrollView, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { accKeys, useAccMe, type AccMe, type AccSharing } from "@/src/accountability";
import { Loader, ScreenHeader } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";
import { useToast } from "@/src/toast";

const FIELDS: { key: keyof AccSharing; title: string; sub: string }[] = [
  { key: "plan", title: "Trading Plan", sub: "Account, target, max loss, max trades, strategy" },
  { key: "discipline", title: "Discipline Score", sub: "Score plus max loss / stopped / no-revenge answers" },
  { key: "plan_followed", title: "Plan-Followed Results", sub: "Whether you followed your planned strategy" },
  { key: "pnl", title: "Daily P&L", sub: "Actual P&L and target hit" },
  { key: "mood", title: "Mood", sub: "Sensitive — off by default" },
  { key: "notes", title: "Notes", sub: "Sensitive — off by default" },
  { key: "screenshots", title: "Screenshots", sub: "Sensitive — off by default" },
];

export default function Sharing() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const me = useAccMe();
  const update = useMutation({
    mutationFn: (body: Partial<AccSharing>) => api<AccMe>("/accountability/sharing", { method: "PUT", body }),
    onSuccess: (data) => qc.setQueryData(accKeys.me, data),
    onError: (e: Error) => toast.show(e.message, "error"),
  });
  const sharing = me.data?.sharing;

  return (
    <View style={styles.root} testID="acc-sharing-screen">
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader title="Partner sharing" onBack={() => router.back()} />
      </View>
      {!sharing ? (
        <Loader />
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
          <Text style={styles.intro}>Everything is private by default. Only what you switch on is visible to your accepted accountability partner — never on feeds, profiles or Activity.</Text>
          <View style={styles.card}>
            {FIELDS.map((f, i) => (
              <View key={f.key} style={[styles.row, i > 0 && styles.sep]}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.title}>{f.title}</Text>
                  <Text style={styles.sub}>{f.sub}</Text>
                </View>
                <Switch value={sharing[f.key]} onValueChange={(v) => update.mutate({ [f.key]: v })} trackColor={{ true: colors.brandPrimary, false: colors.borderStrong }} thumbColor={colors.onSurface} testID={`sharing-${f.key}`} />
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  content: { padding: 16, gap: 16 },
  intro: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  card: { borderRadius: 14, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 64, paddingVertical: 10 },
  sep: { borderTopWidth: 1, borderTopColor: colors.divider },
  title: { color: colors.onSurface, fontSize: 15 },
  sub: { color: colors.muted, fontSize: 12, marginTop: 2 },
}));
