import Ionicons from "@react-native-vector-icons/ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { accKeys, money, plainMoney, useAccMe, yesNo, type AccProgress } from "@/src/accountability";
import { ScoreBadge } from "@/src/components/accountability-ui";
import { PremiumPaywall } from "@/src/components/premium-gate";
import { Avatar, Button, Loader, ScreenHeader } from "@/src/components/ui";
import { useMembership } from "@/src/hooks/use-membership";
import { makeStyles, useTheme } from "@/src/theme";
import { useToast } from "@/src/toast";

export default function Accountability() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const { isPremium, isLoading: membershipLoading } = useMembership();
  const me = useAccMe(isPremium);
  const progress = useQuery({ queryKey: accKeys.progress, queryFn: () => api<AccProgress>("/accountability/progress"), enabled: isPremium });
  const back = () => (router.canGoBack() ? router.back() : router.replace("/(tabs)/premium"));

  const answer = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: "accept" | "decline" }) => api(`/accountability/requests/${id}/${decision}`, { method: "POST" }),
    onSuccess: (_r, v) => {
      qc.invalidateQueries({ queryKey: ["accountability"] });
      toast.show(v.decision === "accept" ? "You're now accountability partners 🤝" : "Request declined", "success");
    },
    onError: (e: Error) => toast.show(e.message, "error"),
  });
  const message = useMutation({
    mutationFn: (userId: string) => api<{ conversation_id: string }>("/conversations", { method: "POST", body: { user_id: userId } }),
    onSuccess: (c) => router.push(`/chat/${c.conversation_id}`),
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  if (!isPremium) {
    if (membershipLoading) return <View style={styles.root}><Loader /></View>;
    return <PremiumPaywall featureKey="accountability" icon="people-circle" title="Accountability Partners" lead="Trade your plan. Track your discipline. Find your partner. A Premium space for disciplined traders." onBack={back} />;
  }

  const d = me.data;
  const p = progress.data;
  const latest = d?.partner?.latest_session;

  return (
    <View style={styles.root} testID="accountability-screen">
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader title="Accountability" onBack={back} />
      </View>
      {!d ? (
        <Loader />
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
          <Text style={styles.tagline}>Trade your plan. Track your discipline. Find your partner.</Text>

          {/* 1 — Partner */}
          {d.partner ? (
            <View style={styles.card} testID="acc-partner-card">
              <Text style={styles.cardLabel}>MY ACCOUNTABILITY PARTNER</Text>
              <Pressable onPress={() => router.push("/accountability/partner")} style={styles.partnerRow} testID="acc-partner-open">
                <Avatar uri={d.partner.user.avatar_url} name={d.partner.user.display_name} size={52} ring />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.name} numberOfLines={1}>{d.partner.user.display_name}</Text>
                  <Text style={styles.meta} numberOfLines={2}>
                    {[d.partner.profile?.markets.join("/"), d.partner.profile?.session, d.partner.profile?.frequency].filter(Boolean).join(" · ") || "@" + d.partner.user.username}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </Pressable>
              {latest ? (
                <View style={styles.shared} testID="acc-partner-latest">
                  <Text style={styles.sharedTitle}>Latest session · {latest.date}</Text>
                  <Text style={styles.sharedLine}>
                    {latest.pnl !== undefined ? `P&L: ${money(latest.pnl)}` : "P&L: private"}
                    {latest.discipline_score !== undefined ? `  ·  Discipline: ${latest.discipline_score}/100` : ""}
                  </Text>
                  {latest.plan_followed !== undefined ? <Text style={styles.sharedLine}>Plan Followed: {yesNo(latest.plan_followed)}{latest.max_loss_respected !== undefined ? ` · Max Loss Respected: ${yesNo(latest.max_loss_respected)}` : ""}</Text> : null}
                </View>
              ) : (
                <Text style={styles.meta}>No shared sessions yet.</Text>
              )}
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Button title="Message Partner" small icon="chatbubble-outline" onPress={() => message.mutate(d.partner!.user.user_id)} loading={message.isPending} style={{ flex: 1 }} testID="acc-message-partner" />
                <Button title="Sharing" small variant="secondary" icon="eye-outline" onPress={() => router.push("/accountability/sharing")} testID="acc-sharing-button" />
              </View>
            </View>
          ) : (
            <View style={styles.card} testID="acc-find-partner-card">
              <Text style={styles.cardLabel}>FIND YOUR PARTNER</Text>
              <Text style={styles.body}>Pair up with a trader on your schedule. Check in, stay honest, keep each other disciplined.</Text>
              {d.incoming_requests.map((r) => (
                <View key={r.request_id} style={styles.request} testID={`acc-request-${r.request_id}`}>
                  <Avatar uri={r.from_user?.avatar_url} name={r.from_user?.display_name} size={40} />
                  <Text style={[styles.body, { flex: 1 }]} numberOfLines={2}>
                    <Text style={styles.name}>{r.from_user?.display_name}</Text> wants to connect for accountability
                  </Text>
                  <Button title="Accept" small onPress={() => answer.mutate({ id: r.request_id, decision: "accept" })} disabled={answer.isPending} testID={`acc-accept-${r.request_id}`} />
                  <Button title="Decline" small variant="ghost" onPress={() => answer.mutate({ id: r.request_id, decision: "decline" })} disabled={answer.isPending} testID={`acc-decline-${r.request_id}`} />
                </View>
              ))}
              {d.outgoing_requests.length ? <Text style={styles.meta}>Request sent to {d.outgoing_requests.map((r) => r.to_user?.display_name).join(", ")} — waiting for a reply.</Text> : null}
              <Button title="Browse partners" icon="people-outline" onPress={() => router.push("/accountability/partners")} testID="acc-browse-partners" />
              <Button title={d.profile ? "Edit my accountability preferences" : "Set my accountability preferences"} variant="secondary" small onPress={() => router.push("/accountability/profile")} testID="acc-edit-preferences" />
            </View>
          )}

          {/* 2 — My Accountability */}
          <View style={styles.card} testID="acc-plan-card">
            <Text style={styles.cardLabel}>MY ACCOUNTABILITY</Text>
            {d.plan ? (
              <>
                <Text style={styles.name}>{d.plan.account_name} · {d.plan.account_type}</Text>
                <Text style={styles.meta}>Target {plainMoney(d.plan.daily_target)} · Max loss {plainMoney(d.plan.daily_max_loss)} · Max {d.plan.max_trades} trades · {d.plan.session}</Text>
                <Button title="How'd you do today? Log session" icon="checkmark-done-outline" onPress={() => router.push("/accountability/session")} testID="acc-log-session" />
                <Button title="Edit my Trading Plan" variant="secondary" small icon="create-outline" onPress={() => router.push("/accountability/plan")} testID="acc-edit-plan" />
              </>
            ) : (
              <>
                <Text style={styles.body}>Set your Trading Plan once — account, target, max loss, max trades, strategy. It stays active until you edit it.</Text>
                <Button title="Set up my Trading Plan" icon="document-text-outline" onPress={() => router.push("/accountability/plan")} testID="acc-setup-plan" />
              </>
            )}
          </View>

          {/* 3 — Progress */}
          <Pressable onPress={() => router.push("/accountability/progress")} style={styles.card} testID="acc-progress-card">
            <Text style={styles.cardLabel}>MY PROGRESS</Text>
            {p && p.sessions_logged ? (
              <View style={styles.progressRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.big}>{plainMoney(p.current_balance)}</Text>
                  <Text style={styles.meta}>Current balance · {p.days_logged} days logged · {p.accountability_streak}-day streak</Text>
                </View>
                <ScoreBadge score={p.avg_discipline} />
              </View>
            ) : (
              <Text style={styles.body}>Your balance, Target-Hit Rate, discipline and streaks will appear here after your first saved session.</Text>
            )}
            <View style={styles.linkRow}>
              <Text style={styles.link}>View progress & history</Text>
              <Ionicons name="arrow-forward" size={16} color={colors.brandSecondary} />
            </View>
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  content: { padding: 16, gap: 14 },
  tagline: { color: colors.silver, fontSize: 14, lineHeight: 20 },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 12 },
  cardLabel: { color: colors.brandSecondary, fontSize: 12, letterSpacing: 0.8 },
  body: { color: colors.onSurfaceSecondary, fontSize: 14, lineHeight: 20 },
  name: { color: colors.onSurface, fontSize: 16, fontWeight: "500" },
  meta: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  partnerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  shared: { backgroundColor: colors.brandSoft, borderRadius: 12, padding: 12, gap: 4 },
  sharedTitle: { color: colors.brandPrimary, fontSize: 12, letterSpacing: 0.4 },
  sharedLine: { color: colors.onSurface, fontSize: 14 },
  request: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap", backgroundColor: colors.cyanSoft, borderRadius: 12, padding: 10 },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  big: { color: colors.onSurface, fontSize: 24, fontWeight: "500" },
  linkRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  link: { color: colors.brandSecondary, fontSize: 14 },
}));
