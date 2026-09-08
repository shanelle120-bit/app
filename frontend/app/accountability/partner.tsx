import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { accKeys, useAccMe, type AccSharedSession } from "@/src/accountability";
import { PlanSummary, SessionDetail } from "@/src/components/accountability-ui";
import { Avatar, Button, Chip, Loader, ScreenHeader } from "@/src/components/ui";
import { makeStyles } from "@/src/theme";
import { useToast } from "@/src/toast";

export default function PartnerScreen() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const me = useAccMe();
  const partner = me.data?.partner;
  const sessions = useQuery({ queryKey: accKeys.partnerSessions, queryFn: () => api<AccSharedSession[]>("/accountability/partner/sessions"), enabled: !!partner });
  const [open, setOpen] = useState<AccSharedSession | null>(null);
  const [confirm, setConfirm] = useState(false);

  const message = useMutation({
    mutationFn: () => api<{ conversation_id: string }>("/conversations", { method: "POST", body: { user_id: partner!.user.user_id } }),
    onSuccess: (c) => router.push(`/chat/${c.conversation_id}`),
    onError: (e: Error) => toast.show(e.message, "error"),
  });
  const end = useMutation({
    mutationFn: () => api("/accountability/partnership", { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["accountability"] }); toast.show("Partnership ended", "info"); router.replace("/accountability"); },
    onError: (e: Error) => toast.show(e.message, "error"),
  });
  const report = useMutation({
    mutationFn: () => api("/mingle/report", { method: "POST", body: { user_id: partner!.user.user_id, reason: "Reported from Accountability partner" } }),
    onSuccess: () => toast.show("Thanks — our team will review this report.", "success"),
    onError: (e: Error) => toast.show(e.message, "error"),
  });
  const block = useMutation({
    mutationFn: async () => {
      await api("/mingle/block", { method: "POST", body: { user_id: partner!.user.user_id } });
      await api("/accountability/partnership", { method: "DELETE" });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["accountability"] }); toast.show("Member blocked", "success"); router.replace("/accountability"); },
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  return (
    <View style={styles.root} testID="acc-partner-screen">
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader title="My Accountability Partner" onBack={() => router.back()} />
      </View>
      {me.isLoading ? (
        <Loader />
      ) : !partner ? (
        <Text style={styles.meta}>No active partnership.</Text>
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
          <Pressable onPress={() => router.push(`/user/${partner.user.user_id}`)} style={styles.head} testID="acc-partner-profile">
            <Avatar uri={partner.user.avatar_url} name={partner.user.display_name} size={64} ring />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.name} numberOfLines={1}>{partner.user.display_name}</Text>
              <Text style={styles.meta}>@{partner.user.username} · partners since {new Date(partner.since).toLocaleDateString()}</Text>
            </View>
          </Pressable>
          {partner.profile ? (
            <View style={styles.card}>
              <Text style={styles.meta}>{[partner.profile.markets.join(" · "), partner.profile.instruments, partner.profile.session ? `${partner.profile.session} session` : "", partner.profile.timezone, partner.profile.frequency].filter(Boolean).join("  •  ")}</Text>
              {partner.profile.working_on ? <Text style={styles.body}><Text style={styles.key}>Working on: </Text>{partner.profile.working_on}</Text> : null}
              {partner.profile.looking_for.length ? <View style={styles.chips}>{partner.profile.looking_for.map((l) => <Chip key={l} label={l} selected tone="cyan" />)}</View> : null}
            </View>
          ) : null}
          <Button title="Message Partner" icon="chatbubble-outline" onPress={() => message.mutate()} loading={message.isPending} testID="acc-partner-message" />
          {partner.shared_plan ? <PlanSummary plan={partner.shared_plan} title={`${partner.user.display_name}'s plan (shared)`} /> : <Text style={styles.meta}>Their Trading Plan is private.</Text>}

          <Text style={styles.section}>SHARED SESSIONS</Text>
          {sessions.isLoading ? <Loader /> : !sessions.data?.length ? <Text style={styles.meta}>No sessions shared yet.</Text> : null}
          {sessions.data?.map((s) => (
            <Pressable key={s.session_id} onPress={() => setOpen(s)} style={styles.card} testID={`acc-shared-session-${s.session_id}`}>
              <Text style={styles.name}>{s.date}</Text>
              <Text style={styles.body}>
                {s.pnl !== undefined ? `P&L: ${s.pnl >= 0 ? "+" : "-"}$${Math.abs(s.pnl)}` : "P&L: private"}
                {s.discipline_score !== undefined ? `  ·  Discipline: ${s.discipline_score}/100` : ""}
                {s.plan_followed !== undefined ? `  ·  Plan Followed: ${s.plan_followed ? "Yes" : "No"}` : ""}
              </Text>
            </Pressable>
          ))}

          <View style={{ gap: 8, marginTop: 12 }}>
            <Button title="End partnership" variant="secondary" icon="people-outline" onPress={() => setConfirm(true)} testID="acc-end-partnership" />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Button title="Report" small variant="ghost" icon="flag-outline" onPress={() => report.mutate()} style={{ flex: 1 }} testID="acc-report-partner" />
              <Button title="Block" small variant="danger" icon="ban-outline" onPress={() => block.mutate()} style={{ flex: 1 }} testID="acc-block-partner" />
            </View>
          </View>
        </ScrollView>
      )}

      <Modal visible={!!open} transparent animationType="slide" onRequestClose={() => setOpen(null)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(null)}>
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]} testID="acc-shared-session-detail">
            <ScrollView contentContainerStyle={{ gap: 12 }}>
              <Text style={styles.name}>{partner?.user.display_name} · {open?.date}</Text>
              {open ? <SessionDetail s={open} /> : null}
              <Button title="Close" variant="ghost" onPress={() => setOpen(null)} />
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
      <Modal visible={confirm} transparent animationType="fade" onRequestClose={() => setConfirm(false)}>
        <Pressable style={styles.backdrop} onPress={() => setConfirm(false)}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]} testID="acc-end-confirm">
            <Text style={styles.name}>End this partnership?</Text>
            <Text style={styles.meta}>You can find a new partner any time. Your sessions and plan stay with you.</Text>
            <Button title="Yes, end partnership" variant="danger" onPress={() => end.mutate()} loading={end.isPending} style={{ marginTop: 12 }} testID="acc-end-confirm-button" />
            <Button title="Keep partner" variant="ghost" onPress={() => setConfirm(false)} />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  content: { padding: 16, gap: 14 },
  head: { flexDirection: "row", alignItems: "center", gap: 14 },
  name: { color: colors.onSurface, fontSize: 17, fontWeight: "500" },
  meta: { color: colors.muted, fontSize: 12, lineHeight: 17, padding: 0 },
  body: { color: colors.onSurfaceSecondary, fontSize: 14, lineHeight: 20 },
  key: { color: colors.brandSecondary },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  section: { color: colors.muted, fontSize: 12, letterSpacing: 0.8, marginTop: 8 },
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.surfaceSecondary, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: "85%", gap: 6 },
}));
