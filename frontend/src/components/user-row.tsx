import Ionicons from "@react-native-vector-icons/ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, Text, View } from "react-native";

import { api } from "@/src/api";
import { Avatar, Button } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";
import { useToast } from "@/src/toast";
import type { User } from "@/src/types";

type Props = { user: User; mode?: "follow" | "chat"; queryKey: unknown[] };

export function UserRow({ user, mode = "follow", queryKey }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();

  const follow = useMutation({
    mutationFn: () => api<{ following: boolean; followers_count: number }>(`/users/${user.user_id}/follow`, { method: "POST" }),
    onSuccess: (res) => {
      qc.setQueryData(queryKey, (old: User[] | undefined) => old?.map((u) => (u.user_id === user.user_id ? { ...u, is_following: res.following, followers_count: res.followers_count } : u)));
      qc.invalidateQueries({ queryKey: ["stories"] });
      qc.invalidateQueries({ queryKey: ["me"] });
      qc.invalidateQueries({ queryKey: ["posts", "following"] });
    },
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  const message = useMutation({
    mutationFn: () => api<{ conversation_id: string }>("/conversations", { method: "POST", body: { user_id: user.user_id } }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
      router.push(`/chat/${res.conversation_id}`);
    },
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  return (
    <Pressable onPress={() => router.push(`/user/${user.user_id}`)} style={styles.row} testID={`user-row-${user.username}`}>
      <Avatar uri={user.avatar_url} name={user.display_name} size={46} />
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Text style={styles.name} numberOfLines={1}>
            {user.display_name}
          </Text>
          {user.is_verified ? <Ionicons name="checkmark-circle" size={14} color={colors.brandSecondary} /> : null}
        </View>
        <Text style={styles.meta} numberOfLines={1}>
          @{user.username}
          {user.trading_style ? ` · ${user.trading_style}` : ""}
          {user.markets?.length ? ` · ${user.markets.slice(0, 2).join(", ")}` : ""}
        </Text>
      </View>
      {user.is_me ? null : mode === "chat" ? (
        <Button title="Message" small variant="secondary" onPress={() => message.mutate()} loading={message.isPending} testID={`user-message-${user.username}`} />
      ) : (
        <Button title={user.is_following ? "Following" : "Follow"} small variant={user.is_following ? "secondary" : "primary"} onPress={() => follow.mutate()} loading={follow.isPending} testID={`user-follow-${user.username}`} />
      )}
    </Pressable>
  );
}

export function useUserList(path: string, key: unknown[]) {
  return useQuery({ queryKey: key, queryFn: () => api<User[]>(path) });
}

const useStyles = makeStyles((colors) => ({
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 10, minHeight: 66 },
  name: { color: colors.onSurface, fontSize: 15, fontWeight: "500", flexShrink: 1 },
  meta: { color: colors.muted, fontSize: 12, marginTop: 2 },
}));
