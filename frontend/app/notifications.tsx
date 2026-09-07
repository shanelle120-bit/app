import Ionicons from "@react-native-vector-icons/ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useEffect, useRef } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, timeAgo } from "@/src/api";
import { Avatar, EmptyState, Loader, ScreenHeader } from "@/src/components/ui";
import { notificationKeys } from "@/src/hooks/use-notifications";
import { makeStyles, useTheme } from "@/src/theme";
import type { Notification, NotificationType } from "@/src/types";

const COPY: Record<NotificationType, { verb: string; icon: string; tone: "brand" | "cyan" | "warm" }> = {
  like: { verb: "liked your post", icon: "heart", tone: "warm" },
  comment: { verb: "commented on your post", icon: "chatbubble", tone: "cyan" },
  mention: { verb: "mentioned you", icon: "at", tone: "brand" },
  follow: { verb: "started following you", icon: "person-add", tone: "cyan" },
  mingle_hi: { verb: "said hi in Single & Mingle 👋", icon: "hand-left", tone: "cyan" },
  mingle_interested: { verb: "is interested in you 💜", icon: "heart-circle", tone: "brand" },
  mingle_match: { verb: "It's a Mingle! You're both interested 🎉", icon: "sparkles", tone: "brand" },
};

export default function Notifications() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const marked = useRef(false);

  const list = useQuery({ queryKey: notificationKeys.list, queryFn: () => api<Notification[]>("/notifications") });
  const readAll = useMutation({
    mutationFn: () => api("/notifications/read-all", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: notificationKeys.unread }),
  });

  // Mark everything read once the list is on screen; keep the unread dots for this visit.
  useEffect(() => {
    if (!marked.current && list.data?.some((n) => !n.read)) {
      marked.current = true;
      readAll.mutate();
    }
  }, [list.data, readAll]);

  const open = (n: Notification) => {
    if (n.type === "follow") return router.push(`/user/${n.actor_id}`);
    if (n.type === "mingle_match") return router.push("/mingle/connections");
    if (n.type === "mingle_hi" || n.type === "mingle_interested") return router.push("/mingle/inbox");
    if (n.post_id) return router.push(`/post/${n.post_id}`);
    router.push(`/user/${n.actor_id}`);
  };

  const toneColor = { brand: colors.brandPrimary, cyan: colors.brandSecondary, warm: colors.error };

  return (
    <View style={styles.root} testID="notifications-screen">
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader title="Activity" onBack={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)"))} />
      </View>
      <FlatList
        data={list.data ?? []}
        keyExtractor={(n) => n.notification_id}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => list.refetch()} tintColor={colors.brandSecondary} />}
        renderItem={({ item }) => {
          const base = COPY[item.type] ?? { verb: "interacted with you", icon: "notifications", tone: "cyan" as const };
          const c = item.type === "like" && item.reaction ? { ...base, verb: `reacted ${item.reaction} to your post` } : base;
          return (
            <Pressable onPress={() => open(item)} style={[styles.row, !item.read && styles.rowUnread]} testID={`notification-${item.notification_id}`}>
              <View>
                <Avatar uri={item.actor.avatar_url} name={item.actor.display_name} size={46} />
                <View style={[styles.typeBadge, { backgroundColor: toneColor[c.tone] }]}>
                  <Ionicons name={c.icon as any} size={11} color={colors.onBrandPrimary} />
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.line}>
                  <Text style={styles.name}>{item.actor.display_name}</Text> {c.verb}
                </Text>
                {item.text ? (
                  <Text style={styles.snippet} numberOfLines={2}>
                    {item.text}
                  </Text>
                ) : null}
                <Text style={styles.time}>{timeAgo(item.created_at)}</Text>
              </View>
              {!item.read ? <View style={styles.dot} testID="notification-unread-dot" /> : null}
            </Pressable>
          );
        }}
        ListEmptyComponent={
          list.isLoading ? (
            <Loader />
          ) : (
            <EmptyState icon="notifications-outline" title="You're all caught up" subtitle="Likes, comments, mentions, follows and Single & Mingle activity will show up here." />
          )
        }
        testID="notifications-list"
      />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.divider },
  rowUnread: { backgroundColor: colors.surfaceSecondary },
  typeBadge: { position: "absolute", right: -4, bottom: -2, width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.surface, alignItems: "center", justifyContent: "center" },
  line: { color: colors.onSurfaceSecondary, fontSize: 15, lineHeight: 21 },
  name: { color: colors.onSurface, fontWeight: "500" },
  snippet: { color: colors.muted, fontSize: 13, marginTop: 3, lineHeight: 18 },
  time: { color: colors.muted, fontSize: 12, marginTop: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brandSecondary },
}));
