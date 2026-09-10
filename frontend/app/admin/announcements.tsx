import Ionicons from "@react-native-vector-icons/ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { FlatList, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { Button, EmptyState, IconButton, Loader, ScreenHeader } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";
import { useToast } from "@/src/toast";
import type { Announcement } from "@/src/types";

function formatDate(value: string): string {
  const d = new Date(value.endsWith("Z") ? value : `${value}Z`);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function AdminAnnouncementsScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [composing, setComposing] = useState(false);

  const query = useQuery({
    queryKey: ["admin", "announcements"],
    queryFn: () => api<{ items: Announcement[] }>("/admin/announcements"),
  });

  const create = useMutation({
    mutationFn: () => api("/admin/announcements", { method: "POST", body: { title: title.trim(), body: body.trim() } }),
    onSuccess: () => {
      toast.show("Announcement pinned", "success");
      setTitle("");
      setBody("");
      setComposing(false);
      qc.invalidateQueries({ queryKey: ["admin", "announcements"] });
    },
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  const unpin = useMutation({
    mutationFn: (id: string) => api(`/admin/announcements/${id}/unpin`, { method: "POST" }),
    onSuccess: () => {
      toast.show("Announcement unpinned", "success");
      qc.invalidateQueries({ queryKey: ["admin", "announcements"] });
    },
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  const back = () => (router.canGoBack() ? router.back() : router.replace("/admin"));
  const items = query.data?.items ?? [];

  return (
    <View style={styles.root} testID="admin-announcements-screen">
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader
          title="Announcements"
          onBack={back}
          right={<IconButton name={composing ? "close" : "add"} onPress={() => setComposing((v) => !v)} testID="announcement-compose-toggle" />}
        />
      </View>

      {composing ? (
        <View style={styles.composer}>
          <TextInput value={title} onChangeText={setTitle} placeholder="Announcement title" placeholderTextColor={colors.muted} style={styles.titleInput} maxLength={120} testID="announcement-title-input" />
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder="What's the update?"
            placeholderTextColor={colors.muted}
            style={styles.bodyInput}
            multiline
            maxLength={2000}
            testID="announcement-body-input"
          />
          <Button
            title="Post & pin to the community"
            onPress={() => create.mutate()}
            disabled={title.trim().length < 1 || body.trim().length < 1}
            loading={create.isPending}
            testID="announcement-submit"
          />
          <Text style={styles.hint}>Only one announcement can be pinned at a time — posting a new one replaces it. Normal member posting is unaffected.</Text>
        </View>
      ) : null}

      {query.isLoading ? (
        <Loader />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(a) => a.announcement_id}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
          ListEmptyComponent={<EmptyState icon="megaphone-outline" title="No announcements yet" subtitle="Tap + to post your first official Level Up update." />}
          renderItem={({ item }) => (
            <View style={styles.card} testID={`announcement-${item.announcement_id}`}>
              <View style={styles.cardHead}>
                <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
                {item.active ? (
                  <View style={styles.pinnedBadge}>
                    <Ionicons name="pin" size={11} color={colors.brandPrimary} />
                    <Text style={styles.pinnedText}>Pinned</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.cardBody}>{item.body}</Text>
              <Text style={styles.cardMeta}>{item.created_by_name} · {formatDate(item.created_at)}</Text>
              {item.active ? (
                <Button title="Unpin" small variant="secondary" onPress={() => unpin.mutate(item.announcement_id)} loading={unpin.isPending} testID={`announcement-unpin-${item.announcement_id}`} />
              ) : null}
            </View>
          )}
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  composer: { padding: 16, gap: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  titleInput: { color: colors.onSurface, fontSize: 15, fontWeight: "500", backgroundColor: colors.surfaceTertiary, borderRadius: 10, padding: 12 },
  bodyInput: { color: colors.onSurface, fontSize: 14, backgroundColor: colors.surfaceTertiary, borderRadius: 10, padding: 12, minHeight: 90, textAlignVertical: "top" },
  hint: { color: colors.muted, fontSize: 11, lineHeight: 15 },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 12, gap: 6 },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 },
  cardTitle: { color: colors.onSurface, fontSize: 15, fontWeight: "600", flex: 1 },
  pinnedBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.brandSoft, borderRadius: 999, paddingHorizontal: 8, height: 22 },
  pinnedText: { color: colors.brandPrimary, fontSize: 11, fontWeight: "600" },
  cardBody: { color: colors.onSurfaceSecondary, fontSize: 13, lineHeight: 18 },
  cardMeta: { color: colors.muted, fontSize: 11 },
}));
