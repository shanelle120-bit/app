import Ionicons from "@react-native-vector-icons/ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { MinglePhotos } from "@/src/components/mingle-photos";
import { Button, Chip, EmptyState, Loader, ScreenHeader } from "@/src/components/ui";
import type { MingleActionResult, MingleMember } from "@/src/mingle-types";
import { makeStyles, useTheme } from "@/src/theme";
import { useToast } from "@/src/toast";

/** A member as seen inside Single & Mingle — their Mingle profile only, never the main Level Up profile. */
export default function MingleMemberScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();

  const member = useQuery({ queryKey: ["mingle", "member", id], queryFn: () => api<MingleMember>(`/mingle/members/${id}`), enabled: !!id });

  const act = useMutation({
    mutationFn: (action: "hi" | "interested") => api<MingleActionResult>("/mingle/actions", { method: "POST", body: { to_user_id: id, action } }),
    onSuccess: (res, action) => {
      qc.invalidateQueries({ queryKey: ["mingle"] });
      if (res.mingle) {
        qc.invalidateQueries({ queryKey: ["conversations"] });
        toast.show(`It's a Mingle with ${res.other?.display_name ?? "them"}! 🎉`, "success");
        if (res.conversation_id) router.push(`/chat/${res.conversation_id}`);
      } else if (action === "hi") {
        toast.show("👋 Hi sent", "success");
        if (res.conversation_id) router.push(`/chat/${res.conversation_id}`);
      } else {
        toast.show("Interest sent 💜", "success");
      }
    },
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  const back = () => (router.canGoBack() ? router.back() : router.replace("/mingle"));
  const data = member.data;
  const p = data?.profile;

  return (
    <View style={styles.root} testID="mingle-member-screen">
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader title="Mingle profile" onBack={back} />
      </View>
      {member.isLoading ? (
        <Loader />
      ) : !data || !p ? (
        <EmptyState icon="person-remove-outline" title="Member not available" subtitle="They may have left Single & Mingle or aren't visible to you." action={<Button title="Back" small variant="secondary" onPress={back} />} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
          <View style={styles.photoWrap}>
            <MinglePhotos photos={p.photos?.length ? p.photos : p.photo_url ? [p.photo_url] : []} testID="mingle-member-photos" />
            <LinearGradient colors={["rgba(11,15,25,0)", "rgba(11,15,25,0.92)"]} style={[styles.scrim, { pointerEvents: "none" }]} />
            <View style={[styles.photoText, { pointerEvents: "none" }]}>
              <Text style={styles.name} numberOfLines={2}>
                {p.display_name}, {p.age}
              </Text>
              <Text style={styles.meta} numberOfLines={1}>
                {p.location ? `${p.location} · ` : ""}{p.trader_type} trader{p.trading_style ? ` · ${p.trading_style}` : ""}
              </Text>
            </View>
          </View>

          <View style={styles.body}>
            {p.looking_for.length ? (
              <View style={styles.chips}>
                {p.looking_for.map((l) => (
                  <Chip key={l} label={l} selected tone="cyan" />
                ))}
              </View>
            ) : null}
            {p.bio ? <Text style={styles.bio}>{p.bio}</Text> : null}
            {p.prompt_label && p.prompt_answer ? (
              <View style={styles.promptBox}>
                <Text style={styles.promptLabel}>{p.prompt_label}</Text>
                <Text style={styles.promptAnswer}>{p.prompt_answer}</Text>
              </View>
            ) : null}
            {p.favorite_instrument ? (
              <Text style={styles.detail}>
                Favorite: <Text style={styles.detailValue}>{p.favorite_instrument}</Text>
              </Text>
            ) : null}
            {p.interests ? (
              <Text style={styles.detail}>
                Off the charts: <Text style={styles.detailValue}>{p.interests}</Text>
              </Text>
            ) : null}
          </View>

          <View style={styles.actions} testID="mingle-member-actions">
            {data.is_me ? (
              <Button title="Edit my Mingle profile" icon="create-outline" variant="secondary" onPress={() => router.push("/mingle/edit")} testID="mingle-member-edit" />
            ) : data.connection_id ? (
              <>
                <View style={styles.statusRow}>
                  <Ionicons name="heart" size={16} color={colors.brandPrimary} />
                  <Text style={styles.statusText}>You&apos;re Mingled 🎉</Text>
                </View>
                <Button title="Message" icon="chatbubble-outline" onPress={() => data.conversation_id && router.push(`/chat/${data.conversation_id}`)} testID="mingle-member-message" />
              </>
            ) : (
              <>
                {data.my_action === "interested" ? (
                  <View style={styles.statusRow}>
                    <Ionicons name="heart" size={16} color={colors.brandPrimary} />
                    <Text style={styles.statusText}>You marked them Interested — waiting on their reply</Text>
                  </View>
                ) : null}
                {data.their_action === "interested" ? (
                  <View style={styles.statusRow}>
                    <Ionicons name="sparkles" size={16} color={colors.brandSecondary} />
                    <Text style={styles.statusText}>They&apos;re interested in you 💜</Text>
                  </View>
                ) : null}
                <View style={styles.actionRow}>
                  {data.conversation_id ? (
                    <Button title="Open chat" variant="secondary" icon="chatbubble-outline" onPress={() => router.push(`/chat/${data.conversation_id}`)} style={{ flex: 1 }} testID="mingle-member-chat" />
                  ) : (
                    <Button title="Say Hi 👋" variant="secondary" onPress={() => act.mutate("hi")} disabled={act.isPending} style={{ flex: 1 }} testID="mingle-member-hi" />
                  )}
                  {data.my_action !== "interested" ? (
                    <Button title={data.their_action === "interested" ? "Interested back 💜" : "Interested 💜"} onPress={() => act.mutate("interested")} disabled={act.isPending} style={{ flex: 1 }} testID="mingle-member-interested" />
                  ) : null}
                </View>
              </>
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  photoWrap: { height: 420, backgroundColor: colors.surfaceTertiary },
  scrim: { position: "absolute", left: 0, right: 0, bottom: 0, height: 180 },
  photoText: { position: "absolute", left: 20, right: 20, bottom: 18 },
  name: { color: colors.onSurface, fontSize: 28, fontWeight: "500", letterSpacing: -0.3 },
  meta: { color: colors.silver, fontSize: 14, marginTop: 4 },
  body: { padding: 20, gap: 14 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  bio: { color: colors.onSurfaceSecondary, fontSize: 15, lineHeight: 23 },
  promptBox: { backgroundColor: colors.brandSoft, borderRadius: 14, padding: 14 },
  promptLabel: { color: colors.brandPrimary, fontSize: 12, letterSpacing: 0.4 },
  promptAnswer: { color: colors.onSurface, fontSize: 16, lineHeight: 23, marginTop: 4 },
  detail: { color: colors.muted, fontSize: 13 },
  detailValue: { color: colors.onSurfaceSecondary },
  actions: { paddingHorizontal: 20, gap: 12 },
  actionRow: { flexDirection: "row", gap: 10 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.surfaceSecondary, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.border },
  statusText: { color: colors.onSurfaceSecondary, fontSize: 14, flex: 1 },
}));
