import Ionicons from "@react-native-vector-icons/ionicons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import React, { useState } from "react";
import { Modal, Platform, Pressable, Text, TextInput, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { MentionSuggestions, useMentions } from "@/src/components/mention-suggestions";
import { Button } from "@/src/components/ui";
import { patchPostEverywhere } from "@/src/hooks/use-post-actions";
import { makeStyles, useTheme } from "@/src/theme";
import { useToast } from "@/src/toast";
import type { Post, User } from "@/src/types";

type Props = { post: Post; visible: boolean; onClose: () => void };

export function EditPostSheet({ post, visible, onClose }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const toast = useToast();
  const [text, setText] = useState(post.text);
  const [cursor, setCursor] = useState(post.text.length);
  const mentions = useMentions(text, cursor, post.mentioned_users);

  const insertMention = (u: User) => {
    const res = mentions.insert(u);
    if (!res) return;
    setText(res.text);
    setCursor(res.cursor);
  };

  const save = useMutation({
    mutationFn: () => api<Post>(`/posts/${post.post_id}`, { method: "PUT", body: { text: text.trim(), mentions: mentions.selectedIds(text) } }),
    onSuccess: (updated) => {
      patchPostEverywhere(qc, post.post_id, { text: updated.text, mentions: updated.mentions, mentioned_users: updated.mentioned_users, edited_at: updated.edited_at });
      qc.invalidateQueries({ queryKey: ["userPosts"] });
      toast.show("Post updated", "success");
      onClose();
    },
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  const canSave = (text.trim().length > 0 || post.media.length > 0) && text.trim() !== post.text && !save.isPending;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <Pressable style={{ flex: 1 }} onPress={onClose} testID="edit-post-backdrop" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]} testID="edit-post-sheet">
          <View style={styles.header}>
            <Text style={styles.title}>Edit post</Text>
            <Pressable onPress={onClose} hitSlop={8} style={styles.close} testID="edit-post-close">
              <Ionicons name="close" size={20} color={colors.onSurface} />
            </Pressable>
          </View>
          <TextInput
            value={text}
            onChangeText={(t) => {
              setCursor((c) => (c >= text.length ? t.length : c));
              setText(t);
            }}
            onSelectionChange={(e) => setCursor(e.nativeEvent.selection.end)}
            multiline
            autoFocus
            maxLength={2000}
            placeholder="Update your post… Type @ to mention a trader"
            placeholderTextColor={colors.muted}
            style={styles.input}
            testID="edit-post-input"
          />
          <MentionSuggestions query={mentions.query} suggestions={mentions.suggestions} onSelect={insertMention} testID="edit-mention-suggestions" />
          {post.media.length ? <Text style={styles.hint}>Attached media stays as it is.</Text> : null}
          <Button title="Save changes" onPress={() => save.mutate()} disabled={!canSave} loading={save.isPending} testID="edit-post-save" style={{ marginTop: 12 }} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const useStyles = makeStyles((colors) => ({
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.surfaceSecondary, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  title: { color: colors.onSurface, fontSize: 18, fontWeight: "500" },
  close: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  input: { color: colors.onSurface, fontSize: 16, lineHeight: 24, minHeight: 110, maxHeight: 240, textAlignVertical: "top", backgroundColor: colors.surfaceTertiary, borderRadius: 12, padding: 12 },
  hint: { color: colors.muted, fontSize: 12, marginTop: 8 },
}));
