import Ionicons from "@react-native-vector-icons/ionicons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, timeAgo } from "@/src/api";
import { Avatar, Button, EmptyState, Loader } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";
import type { Conversation } from "@/src/types";

export default function ChatList() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const query = useQuery({ queryKey: ["conversations"], queryFn: () => api<Conversation[]>("/conversations"), refetchInterval: 8000 });

  return (
    <View style={styles.root} testID="chat-screen">
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.title}>Messages</Text>
        <Pressable onPress={() => router.push("/search?mode=chat")} style={styles.newBtn} testID="chat-new-button">
          <Ionicons name="create-outline" size={20} color={colors.onSurface} />
        </Pressable>
      </View>
      <FlatList
        data={query.data ?? []}
        keyExtractor={(c) => c.conversation_id}
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => query.refetch()} tintColor={colors.brandSecondary} />}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push(`/chat/${item.conversation_id}`)} style={styles.row} testID={`conversation-${item.conversation_id}`}>
            <Avatar uri={item.other_user.avatar_url} name={item.other_user.display_name} size={50} />
            <View style={{ flex: 1 }}>
              <View style={styles.rowTop}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.other_user.display_name}
                </Text>
                <Text style={styles.time}>{item.last_message_at ? timeAgo(item.last_message_at) : ""}</Text>
              </View>
              <View style={styles.rowTop}>
                <Text style={[styles.preview, item.unread_count > 0 && styles.previewUnread]} numberOfLines={1}>
                  {item.last_message ?? "Say hello"}
                </Text>
                {item.unread_count > 0 ? (
                  <View style={styles.badge} testID={`unread-${item.conversation_id}`}>
                    <Text style={styles.badgeText}>{item.unread_count}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          query.isLoading ? (
            <Loader />
          ) : (
            <EmptyState
              icon="chatbubbles-outline"
              title="No messages yet"
              subtitle="Start a conversation with a trader you follow."
              action={<Button title="Start a conversation" small onPress={() => router.push("/search?mode=chat")} testID="chat-empty-cta" />}
            />
          )
        }
      />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { color: colors.onSurface, fontSize: 24, fontWeight: "500" },
  newBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, minHeight: 72 },
  rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  name: { color: colors.onSurface, fontSize: 16, fontWeight: "500", flex: 1 },
  time: { color: colors.muted, fontSize: 12 },
  preview: { color: colors.muted, fontSize: 14, flex: 1, marginTop: 2 },
  previewUnread: { color: colors.onSurface },
  badge: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  badgeText: { color: colors.onBrandPrimary, fontSize: 11 },
  sep: { height: 1, backgroundColor: colors.divider, marginLeft: 78 },
}));
