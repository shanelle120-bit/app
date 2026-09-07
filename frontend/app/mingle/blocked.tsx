import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { FlatList, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, timeAgo } from "@/src/api";
import { Avatar, Button, EmptyState, Loader, ScreenHeader } from "@/src/components/ui";
import type { MingleBlocked } from "@/src/mingle-types";
import { makeStyles } from "@/src/theme";
import { useToast } from "@/src/toast";

export default function MingleBlockedMembers() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();

  const list = useQuery({ queryKey: ["mingle", "blocks"], queryFn: () => api<MingleBlocked[]>("/mingle/blocks") });
  const unblock = useMutation({
    mutationFn: (m: MingleBlocked) => api(`/mingle/blocks/${m.user_id}`, { method: "DELETE" }),
    onSuccess: (_res, m) => {
      qc.invalidateQueries({ queryKey: ["mingle"] });
      qc.invalidateQueries({ queryKey: ["posts", "mingle"] });
      toast.show(`${m.display_name} unblocked`, "success");
    },
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  return (
    <View style={styles.root} testID="mingle-blocked-screen">
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader title="Blocked members" onBack={() => (router.canGoBack() ? router.back() : router.replace("/mingle/settings"))} />
      </View>
      <FlatList
        data={list.data ?? []}
        keyExtractor={(m) => m.user_id}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        ListHeaderComponent={list.data?.length ? <Text style={styles.intro}>Unblocking lets you both see and interact with each other again. Previous Mingles, Interested marks and conversations are not restored.</Text> : null}
        renderItem={({ item }) => (
          <View style={styles.row} testID={`mingle-blocked-${item.user_id}`}>
            <Avatar uri={item.photo_url} name={item.display_name} size={48} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.name} numberOfLines={1}>
                {item.display_name}
              </Text>
              <Text style={styles.meta}>Blocked {timeAgo(item.blocked_at)} ago</Text>
            </View>
            <Button title="Unblock" small variant="secondary" onPress={() => unblock.mutate(item)} disabled={unblock.isPending} testID={`mingle-unblock-${item.user_id}`} />
          </View>
        )}
        ListEmptyComponent={list.isLoading ? <Loader /> : <EmptyState icon="shield-checkmark-outline" title="No blocked members" subtitle="Members you block from Your Mingles or a profile will appear here." />}
      />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  intro: { color: colors.muted, fontSize: 13, lineHeight: 19, paddingHorizontal: 16, paddingVertical: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.divider },
  name: { color: colors.onSurface, fontSize: 16, fontWeight: "500" },
  meta: { color: colors.muted, fontSize: 12, marginTop: 2 },
}));
