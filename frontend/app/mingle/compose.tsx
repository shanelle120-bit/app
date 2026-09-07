import Ionicons from "@react-native-vector-icons/ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, mediaUrl, uploadFile } from "@/src/api";
import { Avatar, Button } from "@/src/components/ui";
import { useMediaPicker } from "@/src/hooks/use-media-picker";
import { postKeys } from "@/src/hooks/use-post-actions";
import type { MingleProfile } from "@/src/mingle-types";
import { makeStyles, useTheme } from "@/src/theme";
import { useToast } from "@/src/toast";
import type { MediaItem } from "@/src/types";

type Attachment = MediaItem & { local?: string; uploading?: boolean };

/** Composer for the members-only Mingle Feed. Posts here never reach the main hub feed or profile. */
export default function MingleCompose() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const { pick, blocked, openSettings } = useMediaPicker();
  const me = useQuery({ queryKey: ["mingle", "me"], queryFn: () => api<{ profile: MingleProfile | null }>("/mingle/me") });
  const profile = me.data?.profile;
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const uploading = attachments.some((a) => a.uploading);
  const canPost = (text.trim().length > 0 || attachments.length > 0) && !uploading;

  const addMedia = async (kind: "image" | "video") => {
    if (attachments.length >= 4) return toast.show("Up to 4 attachments per post", "info");
    const picked = await pick(kind);
    if (!picked) return;
    const temp: Attachment = { type: picked.kind, url: "", local: picked.uri, uploading: true, width: picked.width, height: picked.height };
    setAttachments((a) => [...a, temp]);
    try {
      const res = await uploadFile(picked.uri, picked.name, picked.mimeType);
      setAttachments((a) => a.map((x) => (x.local === picked.uri ? { ...x, url: res.url, type: res.type, uploading: false } : x)));
    } catch (e: any) {
      setAttachments((a) => a.filter((x) => x.local !== picked.uri));
      toast.show(e.message ?? "Upload failed", "error");
    }
  };

  const publish = useMutation({
    mutationFn: () =>
      api("/mingle/posts", {
        method: "POST",
        body: { text: text.trim(), media: attachments.map(({ type, url, width, height }) => ({ type, url, width, height })) },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: postKeys.mingleFeed });
      toast.show("Posted to the Mingle Feed 💜", "success");
      if (router.canGoBack()) router.back();
      else router.replace("/mingle/feed");
    },
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  return (
    <View style={styles.root} testID="mingle-compose-screen">
      <View style={[styles.header, { paddingTop: insets.top + 4 }]}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/mingle/feed"))} style={styles.cancel} testID="mingle-compose-cancel">
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
        <Text style={styles.title}>Mingle post</Text>
        <Button title="Post" small onPress={() => publish.mutate()} disabled={!canPost} loading={publish.isPending} testID="mingle-compose-submit" />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.authorRow}>
          <Avatar uri={profile?.photos?.[0] ?? profile?.photo_url} name={profile?.display_name} size={44} ring />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.name} numberOfLines={1}>
              {profile?.display_name}
              {profile?.age ? `, ${profile.age}` : ""}
            </Text>
            <View style={styles.scopePill}>
              <Ionicons name="lock-closed" size={10} color={colors.brandPrimary} />
              <Text style={styles.scopeText}>Mingle members only</Text>
            </View>
          </View>
        </View>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="What's on your mind beyond the charts? A plan, a hot take, a photo from your weekend…"
          placeholderTextColor={colors.muted}
          multiline
          autoFocus
          style={styles.input}
          maxLength={2000}
          testID="mingle-compose-input"
        />
        {attachments.length ? (
          <View style={styles.attachments}>
            {attachments.map((a, i) => (
              <View key={i} style={styles.attachment} testID={`mingle-compose-attachment-${i}`}>
                {a.type === "video" ? (
                  <View style={styles.videoPlaceholder}>
                    <Ionicons name={a.url ? "play-circle" : "videocam"} size={30} color={colors.brandSecondary} />
                    {a.url ? <Text style={styles.videoLabel}>Video ready</Text> : null}
                  </View>
                ) : (
                  <Image source={{ uri: a.local ?? mediaUrl(a.url) }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
                )}
                {a.uploading ? (
                  <View style={styles.uploadOverlay}>
                    <ActivityIndicator color={colors.onSurface} />
                  </View>
                ) : null}
                <Pressable onPress={() => setAttachments((list) => list.filter((_, j) => j !== i))} style={styles.remove} testID={`mingle-compose-remove-${i}`}>
                  <Ionicons name="close" size={16} color={colors.onSurface} />
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}
        {blocked ? (
          <View style={styles.blocked}>
            <Text style={styles.blockedText}>Photo access is turned off for this app.</Text>
            <Button title="Open Settings" small variant="secondary" onPress={openSettings} />
          </View>
        ) : null}
      </ScrollView>

      <KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
        <View style={[styles.toolbar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
          <Pressable style={styles.tool} onPress={() => addMedia("image")} testID="mingle-compose-add-photo">
            <Ionicons name="images-outline" size={22} color={colors.brandSecondary} />
            <Text style={styles.toolText}>Photo</Text>
          </Pressable>
          <Pressable style={styles.tool} onPress={() => addMedia("video")} testID="mingle-compose-add-video">
            <Ionicons name="videocam-outline" size={22} color={colors.brandSecondary} />
            <Text style={styles.toolText}>Short video</Text>
          </Pressable>
          <View style={{ flex: 1 }} />
          <Text style={styles.counter}>{2000 - text.length}</Text>
        </View>
      </KeyboardStickyView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  cancel: { minHeight: 40, justifyContent: "center", minWidth: 60 },
  cancelText: { color: colors.silver, fontSize: 15 },
  title: { color: colors.onSurface, fontSize: 17, fontWeight: "500" },
  content: { padding: 16, paddingBottom: 32 },
  authorRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  name: { color: colors.onSurface, fontSize: 15, fontWeight: "500" },
  scopePill: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", backgroundColor: colors.brandSoft, borderRadius: 999, paddingHorizontal: 8, height: 20, marginTop: 4 },
  scopeText: { color: colors.brandPrimary, fontSize: 11 },
  input: { color: colors.onSurface, fontSize: 18, lineHeight: 26, minHeight: 140, textAlignVertical: "top" },
  attachments: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  attachment: { width: "48%", aspectRatio: 1, borderRadius: 12, overflow: "hidden", backgroundColor: colors.surfaceTertiary },
  videoPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6 },
  videoLabel: { color: colors.silver, fontSize: 12 },
  uploadOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.overlay, alignItems: "center", justifyContent: "center" },
  remove: { position: "absolute", top: 6, right: 6, width: 28, height: 28, borderRadius: 14, backgroundColor: colors.overlay, alignItems: "center", justifyContent: "center" },
  blocked: { marginTop: 16, padding: 14, borderRadius: 12, backgroundColor: colors.errorSoft, gap: 10 },
  blockedText: { color: colors.onSurface, fontSize: 14 },
  toolbar: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surfaceSecondary },
  tool: { flexDirection: "row", alignItems: "center", gap: 6, height: 44, paddingHorizontal: 10, borderRadius: 999 },
  toolText: { color: colors.silver, fontSize: 13 },
  counter: { color: colors.muted, fontSize: 12, paddingRight: 8 },
}));
