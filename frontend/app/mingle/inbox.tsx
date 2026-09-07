import Ionicons from "@react-native-vector-icons/ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, timeAgo } from "@/src/api";
import { Avatar, Button, Chip, EmptyState, Loader, ScreenHeader } from "@/src/components/ui";
import type { MingleActionResult, MingleInboxItem } from "@/src/mingle-types";
import { makeStyles, useTheme } from "@/src/theme";
import { useToast } from "@/src/toast";

export default function MingleInbox() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const [expanded, setExpanded] = useState<string | null>(null);

  const inbox = useQuery({ queryKey: ["mingle", "inbox"], queryFn: () => api<MingleInboxItem[]>("/mingle/inbox") });

  const act = useMutation({
    mutationFn: (body: { to_user_id: string; action: "interested" | "pass" }) => api<MingleActionResult>("/mingle/actions", { method: "POST", body }),
    onSuccess: (res, vars) => {
      qc.invalidateQueries({ queryKey: ["mingle"] });
      if (res.mingle) {
        qc.invalidateQueries({ queryKey: ["conversations"] });
        toast.show(`It's a Mingle with ${res.other?.display_name ?? "them"}! 🎉`, "success");
        if (res.conversation_id) router.push(`/chat/${res.conversation_id}`);
      } else if (vars.action === "interested") {
        toast.show("Interest sent 💜", "success");
      }
    },
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  return (
    <View style={styles.root} testID="mingle-inbox-screen">
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader title="Mingle inbox" onBack={() => (router.canGoBack() ? router.back() : router.replace("/mingle"))} />
      </View>
      <FlatList
        data={inbox.data ?? []}
        keyExtractor={(i) => `${i.profile.user_id}-${i.action}`}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={inbox.isRefetching} onRefresh={() => inbox.refetch()} tintColor={colors.brandSecondary} />}
        ListHeaderComponent={inbox.data?.length ? <Text style={styles.intro}>Members who said hi or marked you Interested. Respond to mingle, or pass quietly — they won&apos;t be told.</Text> : null}
        renderItem={({ item }) => {
          const p = item.profile;
          const isHi = item.action === "hi";
          const open = expanded === p.user_id;
          return (
            <Pressable onPress={() => setExpanded(open ? null : p.user_id)} style={styles.card} testID={`mingle-inbox-${p.user_id}`}>
              <View style={styles.rowTop}>
                <Avatar uri={p.photos?.[0] ?? p.photo_url} name={p.display_name} size={56} ring />
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>
                    {p.display_name}, {p.age}
                  </Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {p.location ? `${p.location} · ` : ""}{p.trader_type} trader
                  </Text>
                  <View style={[styles.tag, isHi ? styles.tagHi : styles.tagInterested]}>
                    <Text style={[styles.tagText, { color: isHi ? colors.brandSecondary : colors.brandPrimary }]}>
                      {isHi ? "👋 Said hi" : "💜 Interested in you"} · {timeAgo(item.created_at)}
                    </Text>
                  </View>
                </View>
                <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={colors.muted} />
              </View>

              {open ? (
                <View style={styles.details} testID={`mingle-inbox-details-${p.user_id}`}>
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
                </View>
              ) : null}

              <View style={styles.actions}>
                {isHi && item.conversation_id ? (
                  <Button title="Open chat" small variant="secondary" icon="chatbubble-outline" onPress={() => router.push(`/chat/${item.conversation_id}`)} style={{ flex: 1 }} testID={`mingle-inbox-chat-${p.user_id}`} />
                ) : (
                  <Button title="Pass" small variant="secondary" icon="close" onPress={() => act.mutate({ to_user_id: p.user_id, action: "pass" })} disabled={act.isPending} style={{ flex: 1 }} testID={`mingle-inbox-pass-${p.user_id}`} />
                )}
                <Button title={isHi ? "Interested" : "Interested back"} small icon="heart" onPress={() => act.mutate({ to_user_id: p.user_id, action: "interested" })} disabled={act.isPending} style={{ flex: 1 }} testID={`mingle-inbox-interested-${p.user_id}`} />
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          inbox.isLoading ? (
            <Loader />
          ) : (
            <EmptyState icon="mail-open-outline" title="Nothing new yet" subtitle="When someone says hi or marks you Interested, they'll land here." action={<Button title="Back to Discover" small onPress={() => router.replace("/mingle")} testID="mingle-inbox-empty-discover" />} />
          )
        }
      />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  intro: { color: colors.muted, fontSize: 13, lineHeight: 19, paddingHorizontal: 16, paddingTop: 12 },
  card: { margin: 12, marginBottom: 0, padding: 14, borderRadius: 18, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, gap: 12 },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  name: { color: colors.onSurface, fontSize: 17, fontWeight: "500" },
  meta: { color: colors.muted, fontSize: 12, marginTop: 2 },
  tag: { alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 10, height: 24, justifyContent: "center", marginTop: 6 },
  tagHi: { backgroundColor: colors.cyanSoft },
  tagInterested: { backgroundColor: colors.brandSoft },
  tagText: { fontSize: 12 },
  details: { gap: 10, paddingTop: 4 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  bio: { color: colors.onSurfaceSecondary, fontSize: 14, lineHeight: 21 },
  promptBox: { backgroundColor: colors.brandSoft, borderRadius: 12, padding: 12 },
  promptLabel: { color: colors.brandPrimary, fontSize: 12, letterSpacing: 0.4 },
  promptAnswer: { color: colors.onSurface, fontSize: 15, lineHeight: 22, marginTop: 4 },
  actions: { flexDirection: "row", gap: 8 },
}));
