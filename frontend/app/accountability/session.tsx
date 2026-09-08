import Ionicons from "@react-native-vector-icons/ionicons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, uploadFile } from "@/src/api";
import { useAccMe, useAccMeta, type AccSession } from "@/src/accountability";
import { OptionChips, PlanSummary, YesNo } from "@/src/components/accountability-ui";
import { Button, EmptyState, Input, Loader, ScreenHeader } from "@/src/components/ui";
import { useMediaPicker } from "@/src/hooks/use-media-picker";
import { makeStyles, useTheme } from "@/src/theme";
import { useToast } from "@/src/toast";

export default function SessionCheckIn() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const { pick, blocked, openSettings } = useMediaPicker();
  const me = useAccMe();
  const meta = useAccMeta();
  const plan = me.data?.plan;
  const [pnl, setPnl] = useState("");
  const [trades, setTrades] = useState("");
  const [strategy, setStrategy] = useState<"followed" | "different" | null>(null);
  const [maxLoss, setMaxLoss] = useState<boolean | null>(null);
  const [stopped, setStopped] = useState<boolean | null>(null);
  const [revenge, setRevenge] = useState<boolean | null>(null);
  const [mood, setMood] = useState("");
  const [notes, setNotes] = useState("");
  const [shot, setShot] = useState<{ local: string; url?: string } | null>(null);
  const [uploading, setUploading] = useState(false);

  const addShot = async () => {
    const picked = await pick("image");
    if (!picked) return;
    setShot({ local: picked.uri });
    setUploading(true);
    try {
      const res = await uploadFile(picked.uri, picked.name, picked.mimeType);
      setShot({ local: picked.uri, url: res.url });
    } catch (e: any) {
      setShot(null);
      toast.show(e.message ?? "Upload failed", "error");
    } finally {
      setUploading(false);
    }
  };

  const save = useMutation({
    mutationFn: () =>
      api<AccSession>("/accountability/sessions", {
        method: "POST",
        body: {
          pnl: Number(pnl.replace(/[^0-9.\-]/g, "")) || 0, trades: Math.max(0, Math.round(Number(trades) || 0)), strategy_followed: strategy === "followed",
          max_loss_respected: !!maxLoss, stopped_when_done: !!stopped, revenge_or_chase: !!revenge, mood, notes: notes.trim(), screenshot_url: shot?.url ?? null,
        },
      }),
    onSuccess: (s) => {
      qc.invalidateQueries({ queryKey: ["accountability"] });
      toast.show(`Session saved · Discipline ${s.discipline_score}/100`, "success");
      router.replace(`/accountability/session/${s.session_id}`);
    },
    onError: (e: Error) => toast.show(e.message, "error"),
  });
  const valid = pnl.trim() !== "" && trades.trim() !== "" && strategy && maxLoss !== null && stopped !== null && revenge !== null && mood && !uploading;

  return (
    <View style={styles.root} testID="acc-session-screen">
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader title="How'd you do today?" onBack={() => router.back()} />
      </View>
      {me.isLoading || !meta.data ? (
        <Loader />
      ) : !plan ? (
        <EmptyState icon="document-text-outline" title="Set your Trading Plan first" subtitle="Your session is compared against your plan automatically." action={<Button title="Set up my plan" small onPress={() => router.replace("/accountability/plan")} />} />
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]} keyboardShouldPersistTaps="handled">
          <PlanSummary plan={plan} />
          <Input label="Actual P&L ($)" value={pnl} onChangeText={setPnl} keyboardType="numbers-and-punctuation" placeholder="+312 or -75" testID="session-pnl" />
          <Input label="Trades taken" value={trades} onChangeText={setTrades} keyboardType="number-pad" placeholder="3" testID="session-trades" />
          <OptionChips label="Strategy" options={["Followed Planned Strategy", "Traded Something Different"]} value={strategy === "followed" ? "Followed Planned Strategy" : strategy === "different" ? "Traded Something Different" : ""} onChange={(v) => setStrategy(v === "Followed Planned Strategy" ? "followed" : "different")} testID="session-strategy" />
          <YesNo label="Did you respect your max loss?" value={maxLoss} onChange={setMaxLoss} testID="session-max-loss" />
          <YesNo label="Did you stop when you were done?" value={stopped} onChange={setStopped} testID="session-stopped" />
          <YesNo label="Did you revenge trade or chase?" value={revenge} onChange={setRevenge} testID="session-revenge" />
          <OptionChips label="Mood" options={meta.data.moods} value={mood} onChange={setMood} testID="session-mood" />
          <Input label="Notes (optional)" value={notes} onChangeText={setNotes} placeholder="What went well? What would you change?" multiline maxLength={1000} testID="session-notes" />
          <View style={{ gap: 8 }}>
            <Text style={styles.label}>SCREENSHOT (OPTIONAL)</Text>
            {shot ? (
              <View style={styles.shotWrap}>
                <Image source={{ uri: shot.local }} style={styles.shot} contentFit="cover" />
                {uploading ? <View style={styles.overlay}><ActivityIndicator color={colors.onSurface} /></View> : null}
                <Pressable onPress={() => setShot(null)} style={styles.remove} testID="session-remove-screenshot"><Ionicons name="close" size={16} color={colors.onSurface} /></Pressable>
              </View>
            ) : (
              <Button title="Add screenshot" small variant="secondary" icon="image-outline" onPress={addShot} testID="session-add-screenshot" />
            )}
            {blocked ? <Button title="Open Settings" small variant="ghost" onPress={openSettings} /> : null}
          </View>
          <Button title="SAVE SESSION" onPress={() => save.mutate()} disabled={!valid} loading={save.isPending} testID="session-save" />
        </ScrollView>
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  content: { padding: 16, gap: 16 },
  label: { color: colors.muted, fontSize: 12, letterSpacing: 0.6 },
  shotWrap: { borderRadius: 12, overflow: "hidden", backgroundColor: colors.surfaceTertiary },
  shot: { width: "100%", aspectRatio: 1.5 },
  overlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.overlay, alignItems: "center", justifyContent: "center" },
  remove: { position: "absolute", top: 8, right: 8, width: 28, height: 28, borderRadius: 14, backgroundColor: colors.overlay, alignItems: "center", justifyContent: "center" },
}));
