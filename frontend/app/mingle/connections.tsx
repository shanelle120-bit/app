import Ionicons from "@react-native-vector-icons/ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { FlatList, Modal, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, timeAgo } from "@/src/api";
import { MingleNav } from "@/src/components/mingle-nav";
import { Avatar, Button, EmptyState, Loader, ScreenHeader } from "@/src/components/ui";
import type { MingleConnection } from "@/src/mingle-types";
import { makeStyles, useTheme } from "@/src/theme";
import { useToast } from "@/src/toast";

export default function MingleConnections() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const [target, setTarget] = useState<MingleConnection | null>(null);

  const list = useQuery({ queryKey: ["mingle", "connections"], queryFn: () => api<MingleConnection[]>("/mingle/connections") });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["mingle"] });
    setTarget(null);
  };
  const unmatch = useMutation({
    mutationFn: (c: MingleConnection) => api(`/mingle/connections/${c.connection_id}`, { method: "DELETE" }),
    onSuccess: () => { refresh(); toast.show("Connection removed", "success"); },
    onError: (e: Error) => toast.show(e.message, "error"),
  });
  const block = useMutation({
    mutationFn: (c: MingleConnection) => api("/mingle/block", { method: "POST", body: { user_id: c.other.user_id } }),
    onSuccess: () => { refresh(); toast.show("Member blocked", "success"); },
    onError: (e: Error) => toast.show(e.message, "error"),
  });
  const report = useMutation({
    mutationFn: (c: MingleConnection) => api("/mingle/report", { method: "POST", body: { user_id: c.other.user_id, reason: "Reported from connections" } }),
    onSuccess: () => { setTarget(null); toast.show("Thanks — our team will review this report.", "success"); },
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  return (
    <View style={styles.root} testID="mingle-connections-screen">
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader title="Your Mingles" onBack={() => (router.canGoBack() ? router.back() : router.replace("/mingle"))} />
      </View>
      <FlatList
        data={list.data ?? []}
        keyExtractor={(c) => c.connection_id}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        renderItem={({ item }) => (
          <View style={styles.row} testID={`mingle-connection-${item.connection_id}`}>
            <Pressable onPress={() => router.push(`/mingle/member/${item.other.user_id}`)} style={styles.identity} testID={`mingle-connection-profile-${item.connection_id}`}>
              <Avatar uri={item.other.photos?.[0] ?? item.other.photo_url} name={item.other.display_name} size={52} ring />
              <View style={styles.identityText}>
                <Text style={styles.name} numberOfLines={1} ellipsizeMode="tail">
                  {item.other.display_name}, {item.other.age}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {item.other.location ? `${item.other.location} · ` : ""}Mingled {timeAgo(item.created_at)} ago
                </Text>
              </View>
            </Pressable>
            <Button title="Message" small icon="chatbubble-outline" onPress={() => item.conversation_id && router.push(`/chat/${item.conversation_id}`)} style={styles.messageBtn} testID={`mingle-message-${item.connection_id}`} />
            <Pressable onPress={() => setTarget(item)} hitSlop={8} style={styles.more} testID={`mingle-more-${item.connection_id}`}>
              <Ionicons name="ellipsis-vertical" size={20} color={colors.muted} />
            </Pressable>
          </View>
        )}
        ListEmptyComponent={list.isLoading ? <Loader /> : <EmptyState icon="heart-outline" title="No Mingles yet" subtitle="When you and another member are both interested, they'll show up here." />}
      />
      <MingleNav current="connections" />
      <Modal visible={!!target} transparent animationType="fade" onRequestClose={() => setTarget(null)}>
        <Pressable style={styles.backdrop} onPress={() => setTarget(null)}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]} testID="mingle-connection-menu">
            <Text style={styles.sheetTitle}>{target?.other.display_name}</Text>
            <Pressable style={styles.item} onPress={() => target && unmatch.mutate(target)} testID="mingle-unmatch-button">
              <Ionicons name="heart-dislike-outline" size={20} color={colors.onSurface} />
              <Text style={styles.itemText}>Remove connection</Text>
            </Pressable>
            <Pressable style={styles.item} onPress={() => target && report.mutate(target)} testID="mingle-report-button">
              <Ionicons name="flag-outline" size={20} color={colors.warning} />
              <Text style={[styles.itemText, { color: colors.warning }]}>Report member</Text>
            </Pressable>
            <Pressable style={styles.item} onPress={() => target && block.mutate(target)} testID="mingle-block-button">
              <Ionicons name="ban-outline" size={20} color={colors.error} />
              <Text style={[styles.itemText, { color: colors.error }]}>Block member</Text>
            </Pressable>
            <Pressable style={styles.item} onPress={() => setTarget(null)} testID="mingle-menu-cancel">
              <Ionicons name="close-outline" size={20} color={colors.onSurface} />
              <Text style={styles.itemText}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.divider },
  // flex:1 + minWidth:0 lets long names truncate instead of squeezing the row on web/narrow phones.
  identity: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 12 },
  identityText: { flex: 1, minWidth: 0 },
  name: { color: colors.onSurface, fontSize: 16, fontWeight: "500" },
  meta: { color: colors.muted, fontSize: 12, marginTop: 2 },
  messageBtn: { flexShrink: 0 },
  more: { width: 32, height: 44, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.surfaceSecondary, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, gap: 4 },
  sheetTitle: { color: colors.onSurface, fontSize: 18, fontWeight: "500", paddingHorizontal: 12, paddingVertical: 8 },
  item: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52, paddingHorizontal: 12, borderRadius: 12 },
  itemText: { color: colors.onSurface, fontSize: 16 },
}));
