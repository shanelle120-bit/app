import Ionicons from "@react-native-vector-icons/ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo, useRef, useState } from "react";
import { FlatList, Platform, Pressable, Text, TextInput, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, timeAgo } from "@/src/api";
import { GifPicker } from "@/src/components/gif-picker";
import { PostCard, RichText } from "@/src/components/post-card";
import { Avatar, Button, EmptyState, Loader, ScreenHeader } from "@/src/components/ui";
import { patchPostEverywhere, postKeys } from "@/src/hooks/use-post-actions";
import { makeStyles, useTheme } from "@/src/theme";
import { useToast } from "@/src/toast";
import type { Comment, Gif, Post } from "@/src/types";

type Row = Comment & { depth: number };

export default function PostDetail() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [text, setText] = useState("");
  const [gif, setGif] = useState<Gif | null>(null);
  const [gifOpen, setGifOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const inputRef = useRef<TextInput>(null);

  const postQuery = useQuery({ queryKey: postKeys.detail(id), queryFn: () => api<Post>(`/posts/${id}`), enabled: !!id });
  const commentsQuery = useQuery({ queryKey: ["comments", id], queryFn: () => api<Comment[]>(`/posts/${id}/comments`), enabled: !!id });

  const rows = useMemo<Row[]>(() => {
    const list = commentsQuery.data ?? [];
    const byParent = new Map<string | null, Comment[]>();
    list.forEach((c) => {
      const key = c.parent_id && list.some((x) => x.comment_id === c.parent_id) ? c.parent_id : null;
      byParent.set(key, [...(byParent.get(key) ?? []), c]);
    });
    const out: Row[] = [];
    const walk = (parent: string | null, depth: number) => {
      (byParent.get(parent) ?? []).forEach((c) => {
        out.push({ ...c, depth });
        walk(c.comment_id, Math.min(depth + 1, 1));
      });
    };
    walk(null, 0);
    return out;
  }, [commentsQuery.data]);

  const send = useMutation({
    mutationFn: () => api<Comment>(`/posts/${id}/comments`, { method: "POST", body: { text: text.trim(), gif_url: gif?.url ?? null, parent_id: replyTo?.comment_id ?? null } }),
    onSuccess: () => {
      setText("");
      setGif(null);
      setReplyTo(null);
      qc.invalidateQueries({ queryKey: ["comments", id] });
      if (postQuery.data) patchPostEverywhere(qc, id, { comments_count: postQuery.data.comments_count + 1 });
    },
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  const likeComment = useMutation({
    mutationFn: (c: Comment) => api<{ liked: boolean; likes_count: number }>(`/comments/${c.comment_id}/like`, { method: "POST" }),
    onMutate: (c) => {
      qc.setQueryData(["comments", id], (old: Comment[] | undefined) =>
        old?.map((x) => (x.comment_id === c.comment_id ? { ...x, liked: !c.liked, likes_count: c.likes_count + (c.liked ? -1 : 1) } : x)),
      );
    },
    onSuccess: (res, c) => {
      qc.setQueryData(["comments", id], (old: Comment[] | undefined) => old?.map((x) => (x.comment_id === c.comment_id ? { ...x, ...res } : x)));
    },
  });

  const canSend = (text.trim().length > 0 || !!gif) && !send.isPending;

  return (
    <View style={styles.root} testID="post-detail-screen">
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader title="Post" onBack={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)"))} />
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={0}>
        {postQuery.isLoading ? (
          <Loader />
        ) : postQuery.isError || !postQuery.data ? (
          <EmptyState icon="alert-circle-outline" title="Post not found" action={<Button title="Go back" small variant="secondary" onPress={() => router.back()} />} />
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(c) => c.comment_id}
            ListHeaderComponent={
              <View>
                <PostCard post={postQuery.data} detail />
                <Text style={styles.sectionTitle}>Comments · {postQuery.data.comments_count}</Text>
              </View>
            }
            renderItem={({ item }) => (
              <View style={[styles.comment, item.depth > 0 && styles.reply]} testID={`comment-${item.comment_id}`}>
                <Pressable onPress={() => router.push(`/user/${item.author.user_id}`)}>
                  <Avatar uri={item.author.avatar_url} name={item.author.display_name} size={item.depth > 0 ? 28 : 34} />
                </Pressable>
                <View style={{ flex: 1 }}>
                  <View style={styles.bubble}>
                    <View style={styles.commentHead}>
                      <Text style={styles.commentName}>{item.author.display_name}</Text>
                      <Text style={styles.commentMeta}>@{item.author.username} · {timeAgo(item.created_at)}</Text>
                    </View>
                    {item.text ? <RichText text={item.text} style={styles.commentText} /> : null}
                    {item.gif_url ? <Image source={{ uri: item.gif_url }} style={styles.commentGif} contentFit="cover" /> : null}
                  </View>
                  <View style={styles.commentActions}>
                    <Pressable onPress={() => likeComment.mutate(item)} style={styles.commentAction} testID={`comment-like-${item.comment_id}`}>
                      <Ionicons name={item.liked ? "heart" : "heart-outline"} size={16} color={item.liked ? colors.error : colors.muted} />
                      <Text style={[styles.commentActionText, item.liked && { color: colors.error }]}>{item.likes_count || "Like"}</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        setReplyTo(item);
                        inputRef.current?.focus();
                      }}
                      style={styles.commentAction}
                      testID={`comment-reply-${item.comment_id}`}
                    >
                      <Ionicons name="return-down-forward-outline" size={16} color={colors.muted} />
                      <Text style={styles.commentActionText}>Reply</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            )}
            ListEmptyComponent={commentsQuery.isLoading ? <Loader /> : <EmptyState icon="chatbubble-ellipses-outline" title="No comments yet" subtitle="Start the conversation, or drop a GIF." />}
            contentContainerStyle={{ paddingBottom: 16 }}
            keyboardShouldPersistTaps="handled"
          />
        )}

        <View style={[styles.composer, { paddingBottom: insets.bottom + 8 }]}>
          {replyTo ? (
            <View style={styles.replyBar}>
              <Text style={styles.replyText} numberOfLines={1}>
                Replying to <Text style={{ color: colors.brandSecondary }}>@{replyTo.author.username}</Text>
              </Text>
              <Pressable onPress={() => setReplyTo(null)} hitSlop={8} testID="comment-cancel-reply">
                <Ionicons name="close" size={16} color={colors.muted} />
              </Pressable>
            </View>
          ) : null}
          {gif ? (
            <View style={styles.gifPreview}>
              <Image source={{ uri: gif.preview_url }} style={{ width: 96, height: 72, borderRadius: 8 }} contentFit="cover" />
              <Pressable onPress={() => setGif(null)} style={styles.gifRemove} testID="comment-remove-gif">
                <Ionicons name="close" size={14} color={colors.onSurface} />
              </Pressable>
            </View>
          ) : null}
          <View style={styles.composerRow}>
            <Pressable onPress={() => setGifOpen(true)} style={styles.gifBtn} testID="comment-gif-button">
              <Text style={styles.gifBtnText}>GIF</Text>
            </Pressable>
            <TextInput
              ref={inputRef}
              value={text}
              onChangeText={setText}
              placeholder={replyTo ? "Write a reply…" : "Add a comment…"}
              placeholderTextColor={colors.muted}
              style={styles.input}
              multiline
              maxLength={1000}
              testID="comment-input"
            />
            <Pressable onPress={() => send.mutate()} disabled={!canSend} style={[styles.sendBtn, !canSend && { opacity: 0.4 }]} testID="comment-send-button">
              <Ionicons name="arrow-up" size={20} color={colors.onBrandPrimary} />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>

      <GifPicker
        visible={gifOpen}
        onClose={() => setGifOpen(false)}
        onSelect={(g) => {
          setGif(g);
          setGifOpen(false);
        }}
      />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  sectionTitle: { color: colors.muted, fontSize: 12, letterSpacing: 1, textTransform: "uppercase", paddingHorizontal: 16, marginBottom: 8 },
  comment: { flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingVertical: 6 },
  reply: { paddingLeft: 56 },
  bubble: { backgroundColor: colors.surfaceSecondary, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: colors.border },
  commentHead: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  commentName: { color: colors.onSurface, fontSize: 14, fontWeight: "500" },
  commentMeta: { color: colors.muted, fontSize: 12 },
  commentText: { color: colors.onSurfaceSecondary, fontSize: 14, lineHeight: 20, marginTop: 4 },
  commentGif: { width: 200, height: 150, borderRadius: 10, marginTop: 8, backgroundColor: colors.surfaceTertiary },
  commentActions: { flexDirection: "row", gap: 6, paddingLeft: 6 },
  commentAction: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 36, paddingHorizontal: 6 },
  commentActionText: { color: colors.muted, fontSize: 12 },
  composer: { borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surfaceSecondary, paddingHorizontal: 12, paddingTop: 8 },
  replyBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 8, paddingBottom: 6 },
  replyText: { color: colors.muted, fontSize: 12, flex: 1 },
  gifPreview: { alignSelf: "flex-start", marginBottom: 8, marginLeft: 4 },
  gifRemove: { position: "absolute", top: -6, right: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.borderStrong },
  composerRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  gifBtn: { height: 44, paddingHorizontal: 8, justifyContent: "center" },
  gifBtnText: { color: colors.brandSecondary, fontSize: 12, letterSpacing: 1, borderWidth: 1.5, borderColor: colors.brandSecondary, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 },
  input: { flex: 1, color: colors.onSurface, fontSize: 15, maxHeight: 120, minHeight: 44, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: colors.surfaceTertiary, borderRadius: 22 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
}));
