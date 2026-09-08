import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAccMe, useAccMeta } from "@/src/accountability";
import { OptionChips } from "@/src/components/accountability-ui";
import { Button, Input, Loader, ScreenHeader } from "@/src/components/ui";
import { makeStyles } from "@/src/theme";
import { useToast } from "@/src/toast";

const num = (v: string) => Number(String(v).replace(/[^0-9.\-]/g, "")) || 0;

export default function TradingPlan() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const me = useAccMe();
  const meta = useAccMeta();
  const plan = me.data?.plan;
  const [form, setForm] = useState({
    account_name: plan?.account_name ?? "", account_type: plan?.account_type ?? "Personal", starting_balance: plan ? String(plan.starting_balance) : "",
    market: plan?.market ?? "Futures", instruments: plan?.instruments ?? "", position_size: plan?.position_size ?? "", strategy: plan?.strategy ?? "",
    session: plan?.session ?? "NY Open", daily_target: plan ? String(plan.daily_target) : "", daily_max_loss: plan ? String(plan.daily_max_loss) : "", max_trades: plan ? String(plan.max_trades) : "",
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = useMutation({
    mutationFn: () =>
      api("/accountability/plan", {
        method: "PUT",
        body: { ...form, starting_balance: num(form.starting_balance), daily_target: num(form.daily_target), daily_max_loss: num(form.daily_max_loss), max_trades: Math.max(1, Math.round(num(form.max_trades))) },
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["accountability"] }); toast.show("Plan saved — it stays active until you edit it", "success"); router.back(); },
    onError: (e: Error) => toast.show(e.message, "error"),
  });
  const valid = form.account_name.trim() && form.starting_balance && form.daily_target && form.daily_max_loss && form.max_trades;

  if (me.isLoading || !meta.data) return <View style={styles.root}><Loader /></View>;
  const m = meta.data;
  return (
    <View style={styles.root} testID="acc-plan-screen">
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader title="My Trading Plan" onBack={() => router.back()} />
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]} keyboardShouldPersistTaps="handled">
        <Text style={styles.intro}>Set it once. It stays active until you edit it — changes only affect future sessions; past sessions keep the plan they were logged against.</Text>
        <Input label="Account name" value={form.account_name} onChangeText={(v) => set("account_name", v)} placeholder="Apex 50K, Personal Webull…" testID="plan-account-name" />
        <OptionChips label="Account type" options={m.account_types} value={form.account_type} onChange={(v) => set("account_type", v)} testID="plan-account-type" />
        <Input label="Starting balance ($)" value={form.starting_balance} onChangeText={(v) => set("starting_balance", v)} keyboardType="decimal-pad" placeholder="50000" testID="plan-starting-balance" />
        <OptionChips label="Market" options={m.markets} value={form.market} onChange={(v) => set("market", v)} testID="plan-market" />
        <Input label="Instrument(s)" value={form.instruments} onChangeText={(v) => set("instruments", v)} placeholder="NQ, MNQ…" testID="plan-instruments" />
        <Input label="Contracts / position size" value={form.position_size} onChangeText={(v) => set("position_size", v)} placeholder="2 contracts" testID="plan-position-size" />
        <Input label="Strategy / setup" value={form.strategy} onChangeText={(v) => set("strategy", v)} placeholder="Opening range breakout, VWAP reclaim…" multiline testID="plan-strategy" />
        <OptionChips label="Trading session" options={m.plan_sessions} value={form.session} onChange={(v) => set("session", v)} testID="plan-session" />
        <Input label="Daily target ($)" value={form.daily_target} onChangeText={(v) => set("daily_target", v)} keyboardType="decimal-pad" placeholder="250" testID="plan-daily-target" />
        <Input label="Daily max loss ($)" value={form.daily_max_loss} onChangeText={(v) => set("daily_max_loss", v)} keyboardType="decimal-pad" placeholder="500" testID="plan-daily-max-loss" />
        <Input label="Max trades per day" value={form.max_trades} onChangeText={(v) => set("max_trades", v)} keyboardType="number-pad" placeholder="3" testID="plan-max-trades" />
        <Button title="SAVE MY PLAN" onPress={() => save.mutate()} disabled={!valid} loading={save.isPending} testID="plan-save" />
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  content: { padding: 16, gap: 16 },
  intro: { color: colors.muted, fontSize: 13, lineHeight: 19 },
}));
