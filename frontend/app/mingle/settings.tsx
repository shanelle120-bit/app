import Ionicons from "@react-native-vector-icons/ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Modal, Pressable, ScrollView, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { Button, Loader, ScreenHeader } from "@/src/components/ui";
import type { MingleMeta, MingleProfile } from "@/src/mingle-types";
import { makeStyles, useTheme } from "@/src/theme";
import { useToast } from "@/src/toast";

export default function MingleSettings() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const [confirmLeave, setConfirmLeave] = useState(false);

  const me = useQuery({ queryKey: ["mingle", "me"], queryFn: () => api<{ profile: MingleProfile | null }>("/mingle/me") });
  const meta = useQuery({ queryKey: ["mingle", "meta"], queryFn: () => api<MingleMeta>("/mingle/meta"), staleTime: Infinity });
  const profile = me.data?.profile;

  const status = useMutation({
    mutationFn: (body: Partial<Pick<MingleProfile, "active" | "show_badge" | "allow_hi_from">>) => api<{ profile: MingleProfile }>("/mingle/me/status", { method: "POST", body }),
    onSuccess: (data) => {
      qc.setQueryData(["mingle", "me"], data);
      qc.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  const leave = useMutation({
    mutationFn: () => api("/mingle/me", { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mingle"] });
      qc.invalidateQueries({ queryKey: ["me"] });
      toast.show("You've left Single & Mingle. Your Level Up account is unchanged.", "success");
      router.replace("/(tabs)/premium");
    },
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  return (
    <View style={styles.root} testID="mingle-settings-screen">
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader title="Mingle settings" onBack={() => router.back()} />
      </View>
      {!profile ? (
        <Loader />
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
          <Pressable onPress={() => router.push("/mingle/edit")} style={styles.rowBtn} testID="mingle-settings-edit">
            <Ionicons name="create-outline" size={20} color={colors.brandSecondary} />
            <Text style={styles.rowBtnText}>Edit my Mingle profile</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>

          <Text style={styles.sectionLabel}>VISIBILITY</Text>
          <View style={styles.card}>
            <Row title="Show me in Discover" subtitle="Turn off to hide your profile without leaving" value={!!profile.active} onChange={(v) => status.mutate({ active: v })} testID="mingle-toggle-active" />
            <View style={styles.sep} />
            <Row title="Badge on my main profile" subtitle="Tasteful “Single & Mingle member” indicator" value={!!profile.show_badge} onChange={(v) => status.mutate({ show_badge: v })} testID="mingle-toggle-badge" />
          </View>

          <Text style={styles.sectionLabel}>WHO CAN SAY HI</Text>
          <View style={styles.card}>
            {(["everyone", "connections"] as const).map((opt, i) => (
              <React.Fragment key={opt}>
                {i > 0 ? <View style={styles.sep} /> : null}
                <Pressable onPress={() => status.mutate({ allow_hi_from: opt })} style={styles.radioRow} testID={`mingle-hi-${opt}`}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{opt === "everyone" ? "Any Mingle member" : "Only mutual Mingles"}</Text>
                    <Text style={styles.rowSub}>{opt === "everyone" ? "Anyone can send you a 👋 greeting" : "People must match with you first"}</Text>
                  </View>
                  <Ionicons name={profile.allow_hi_from === opt ? "radio-button-on" : "radio-button-off"} size={22} color={profile.allow_hi_from === opt ? colors.brandSecondary : colors.muted} />
                </Pressable>
              </React.Fragment>
            ))}
          </View>

          <Text style={styles.sectionLabel}>SAFETY & PRIVACY</Text>
          <Pressable onPress={() => router.push("/mingle/blocked")} style={styles.rowBtn} testID="mingle-settings-blocked">
            <Ionicons name="ban-outline" size={20} color={colors.brandSecondary} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.rowTitle}>Blocked members</Text>
              <Text style={styles.rowSub}>Review who you&apos;ve blocked and unblock if you change your mind</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
          <View style={[styles.notice, { marginTop: 10 }]}>
            <Ionicons name="shield-checkmark-outline" size={18} color={colors.brandSecondary} />
            <Text style={styles.noticeText}>{meta.data?.safety_notice} Block or report anyone from Your Mingles.</Text>
          </View>

          <Button title="Leave Single & Mingle" variant="danger" icon="exit-outline" onPress={() => setConfirmLeave(true)} style={{ marginTop: 32 }} testID="mingle-leave-button" />
          <Text style={styles.footnote}>Leaving removes your Mingle profile and connections. Your Level Up account, posts and chats stay exactly as they are.</Text>
        </ScrollView>
      )}

      <Modal visible={confirmLeave} transparent animationType="fade" onRequestClose={() => setConfirmLeave(false)}>
        <Pressable style={styles.backdrop} onPress={() => setConfirmLeave(false)}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]} testID="mingle-leave-confirm">
            <Text style={styles.sheetTitle}>Leave Single & Mingle?</Text>
            <Text style={styles.rowSub}>You can rejoin any time — your main profile isn&apos;t affected.</Text>
            <Button title="Yes, leave" variant="danger" onPress={() => leave.mutate()} loading={leave.isPending} style={{ marginTop: 16 }} testID="mingle-leave-confirm-button" />
            <Button title="Stay" variant="ghost" onPress={() => setConfirmLeave(false)} testID="mingle-leave-cancel" />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function Row({ title, subtitle, value, onChange, testID }: { title: string; subtitle: string; value: boolean; onChange: (v: boolean) => void; testID: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.radioRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSub}>{subtitle}</Text>
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.brandPrimary, false: colors.borderStrong }} thumbColor={colors.onSurface} testID={testID} />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  content: { padding: 16 },
  rowBtn: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingHorizontal: 16, borderRadius: 14, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  rowBtnText: { color: colors.onSurface, fontSize: 15, flex: 1 },
  sectionLabel: { color: colors.muted, fontSize: 12, letterSpacing: 0.6, marginTop: 24, marginBottom: 8 },
  card: { borderRadius: 14, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16 },
  radioRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 64, paddingVertical: 10 },
  rowTitle: { color: colors.onSurface, fontSize: 15 },
  rowSub: { color: colors.muted, fontSize: 12, marginTop: 2, lineHeight: 17 },
  sep: { height: 1, backgroundColor: colors.divider },
  notice: { flexDirection: "row", gap: 10, padding: 14, borderRadius: 14, backgroundColor: colors.cyanSoft },
  noticeText: { color: colors.onSurfaceSecondary, fontSize: 13, lineHeight: 19, flex: 1 },
  footnote: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: 10 },
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.surfaceSecondary, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  sheetTitle: { color: colors.onSurface, fontSize: 20, fontWeight: "500", marginBottom: 6 },
}));
