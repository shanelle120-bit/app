import Ionicons from "@react-native-vector-icons/ionicons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, uploadFile } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { GifPicker } from "@/src/components/gif-picker";
import { MentionSuggestions, useMentions } from "@/src/components/mention-suggestions";
import { Avatar, Button } from "@/src/components/ui";
import { useMediaPicker } from "@/src/hooks/use-media-picker";
import { makeStyles, useTheme } from "@/src/theme";
import { useToast } from "@/src/toast";
import type { Gif, MediaItem, User } from "@/src/types";

type Attachment = MediaItem & { local?: string; uploading?: boolean };

export default function CreatePost() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  // Trading Only reuses this composer; posts stay in that space.
  const { space } = useLocalSearchParams<{ space?: string }>();
  const isTrading = space === "trading";
  const done = () => {
    const target = isTrading ? "/trading" : "/(tabs)";
    if (isTrading) router.setParams({ space: "" }); // the tab keeps its params, so clear the Trading Only scope
    router.replace(target);
  };
  const toast = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { pick, blocked, openSettings } = useMediaPicker();
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [gifOpen, setGifOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const mentions = useMentions(text, cursor);

  const insertMention = (u: User) => {
    const res = mentions.insert(u);
    if (!res) return;
    setText(res.text);
    setCursor(res.cursor);
  };

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
      setAttachments((a) => a.map((x) => (x.local === picked.uri ? { ...x, url: res.url, type: res.type === "audio" ? x.type : res.type, uploading: false } : x)));
    } catch (e: any) {
      setAttachments((a) => a.filter((x) => x.local !== picked.uri));
      toast.show(e.message ?? "Upload failed", "error");
    }
  };

  const addGif = (gif: Gif) => {
    setGifOpen(false);
    if (attachments.length >= 4) return toast.show("Up to 4 attachments per post", "info");
    setAttachments((a) => [...a, { type: "gif", url: gif.url, width: gif.width, height: gif.height }]);
  };

  const publish = useMutation({
    mutationFn: () =>
      api("/posts", {
        method: "POST",
        body: {
          text: text.trim(),
          media: attachments.map(({ type, url, width, height }) => ({ type, url, width, height })),
          mentions: mentions.selectedIds(text),
          space: isTrading ? "trading" : "main",
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["posts"] });
      qc.invalidateQueries({ queryKey: ["userPosts"] });
      qc.invalidateQueries({ queryKey: ["me"] });
      qc.invalidateQueries({ queryKey: ["stories"] });
      setText("");
      setAttachments([]);
      mentions.reset();
      toast.show(isTrading ? "Posted to Trading Only" : "Posted to the hub", "success");
      done();
    },
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  const reset = () => {
    setText("");
    setAttachments([]);
    mentions.reset();
    done();
  };

  return (
    <View style={styles.root} testID="create-post-screen">
      <View style={[styles.header, { paddingTop: insets.top + 4 }]}>
        <Pressable onPress={reset} style={styles.cancel} testID="create-cancel-button">
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
        <Text style={styles.title}>{isTrading ? "New Trading Only post" : "New post"}</Text>
        <Button title="Post" small onPress={() => publish.mutate()} disabled={!canPost} loading={publish.isPending} testID="create-submit-button" />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.authorRow}>
          <Avatar uri={user?.avatar_url} name={user?.display_name} size={44} />
          <View>
            <Text style={styles.name}>{user?.display_name}</Text>
            <Text style={styles.handle}>@{user?.username}</Text>
          </View>
        </View>
        <TextInput
          value={text}
          onChangeText={(t) => {
            // Keep the caret in sync even when no selection event fires (typing at the end).
            setCursor((c) => (c >= text.length ? t.length : c));
            setText(t);
          }}
          onSelectionChange={(e) => setCursor(e.nativeEvent.selection.end)}
          placeholder="Share a setup, a lesson, or a win… Type @ to mention a trader"
          placeholderTextColor={colors.muted}
          multiline
          autoFocus
          style={styles.input}
          maxLength={2000}
          testID="create-text-input"
        />
        {attachments.length ? (
          <View style={styles.attachments}>
            {attachments.map((a, i) => (
              <View key={i} style={styles.attachment} testID={`create-attachment-${i}`}>
                {a.type === "video" && !a.url ? (
                  <View style={styles.videoPlaceholder}>
                    <Ionicons name="videocam" size={28} color={colors.brandSecondary} />
                  </View>
                ) : a.type === "video" ? (
                  <View style={styles.videoPlaceholder}>
                    <Ionicons name="play-circle" size={32} color={colors.brandSecondary} />
                    <Text style={styles.videoLabel}>Video ready</Text>
                  </View>
                ) : (
                  <Image source={{ uri: a.local ?? a.url }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
                )}
                {a.uploading ? (
                  <View style={styles.uploadOverlay}>
                    <ActivityIndicator color={colors.onSurface} />
                  </View>
                ) : null}
                {a.type === "gif" ? (
                  <View style={styles.gifBadge}>
                    <Text style={styles.gifBadgeText}>GIF</Text>
                  </View>
                ) : null}
                <Pressable onPress={() => setAttachments((list) => list.filter((_, j) => j !== i))} style={styles.remove} testID={`create-remove-attachment-${i}`}>
                  <Ionicons name="close" size={16} color={colors.onSurface} />
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}
        {blocked ? (
          <View style={styles.blocked}>
            <Text style={styles.blockedText}>Photo access is turned off for this app.</Text>
            <Button title="Open Settings" small variant="secondary" onPress={openSettings} testID="create-open-settings" />
          </View>
        ) : null}
      </ScrollView>

      <KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
        <MentionSuggestions query={mentions.query} suggestions={mentions.suggestions} onSelect={insertMention} />
        <View style={styles.toolbar}>
          <Pressable style={styles.tool} onPress={() => addMedia("image")} testID="create-add-photo">
            <Ionicons name="images-outline" size={22} color={colors.brandSecondary} />
            <Text style={styles.toolText}>Photo</Text>
          </Pressable>
          <Pressable style={styles.tool} onPress={() => addMedia("video")} testID="create-add-video">
            <Ionicons name="videocam-outline" size={22} color={colors.brandSecondary} />
            <Text style={styles.toolText}>Video</Text>
          </Pressable>
          <Pressable style={styles.tool} onPress={() => setGifOpen(true)} testID="create-add-gif">
            <View style={styles.gifIcon}>
              <Text style={styles.gifIconText}>GIF</Text>
            </View>
            <Text style={styles.toolText}>GIF</Text>
          </Pressable>
          <View style={{ flex: 1 }} />
          <Text style={styles.counter}>{2000 - text.length}</Text>
        </View>
      </KeyboardStickyView>

      <GifPicker visible={gifOpen} onClose={() => setGifOpen(false)} onSelect={addGif} />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  cancel: { minHeight: 40, justifyContent: "center", minWidth: 60 },
  cancelText: { color: colors.silver, fontSize: 15 },
  title: { color: colors.onSurface, fontSize: 17, fontWeight: "500" },
  content: { padding: 16, paddingBottom: 32 },
  authorRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  name: { color: colors.onSurface, fontSize: 15, fontWeight: "500" },
  handle: { color: colors.muted, fontSize: 12 },
  input: { color: colors.onSurface, fontSize: 18, lineHeight: 26, minHeight: 140, textAlignVertical: "top" },
  attachments: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  attachment: { width: "48%", aspectRatio: 1, borderRadius: 12, overflow: "hidden", backgroundColor: colors.surfaceTertiary },
  videoPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6 },
  videoLabel: { color: colors.silver, fontSize: 12 },
  uploadOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.overlay, alignItems: "center", justifyContent: "center" },
  remove: { position: "absolute", top: 6, right: 6, width: 28, height: 28, borderRadius: 14, backgroundColor: colors.overlay, alignItems: "center", justifyContent: "center" },
  gifBadge: { position: "absolute", left: 8, bottom: 8, backgroundColor: colors.overlay, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  gifBadgeText: { color: colors.onSurface, fontSize: 11, letterSpacing: 1 },
  blocked: { marginTop: 16, padding: 14, borderRadius: 12, backgroundColor: colors.errorSoft, gap: 10 },
  blockedText: { color: colors.onSurface, fontSize: 14 },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  suggestions: { backgroundColor: colors.surfaceSecondary },
  tool: { flexDirection: "row", alignItems: "center", gap: 6, height: 44, paddingHorizontal: 10, borderRadius: 999 },
  toolText: { color: colors.silver, fontSize: 13 },
  gifIcon: { borderWidth: 1.5, borderColor: colors.brandSecondary, borderRadius: 6, paddingHorizontal: 4, height: 20, justifyContent: "center" },
  gifIconText: { color: colors.brandSecondary, fontSize: 10, letterSpacing: 1 },
  counter: { color: colors.muted, fontSize: 12, paddingRight: 8 },
}));
