import Ionicons from "@react-native-vector-icons/ionicons";
import { useEvent } from "expo";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { memo, useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { mediaUrl, timeAgo } from "@/src/api";
import { EditPostSheet } from "@/src/components/edit-post-sheet";
import { Avatar } from "@/src/components/ui";
import { usePostActions } from "@/src/hooks/use-post-actions";
import { usePostVisible } from "@/src/hooks/use-visible-posts";
import { makeStyles, useTheme } from "@/src/theme";
import type { MediaItem, Post } from "@/src/types";

function VideoBlock({ uri, postId }: { uri: string; postId?: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [engaged, setEngaged] = useState(false);
  // Only the video block subscribes to visibility, so scroll updates never re-render the card/list.
  const active = usePostVisible(postId ?? "");
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
  });
  const { isPlaying } = useEvent(player, "playingChange", { isPlaying: player.playing });
  const { status } = useEvent(player, "statusChange", { status: player.status });

  useEffect(() => {
    if (active) player.play();
    else {
      player.pause();
      if (engaged) {
        player.muted = true;
        setEngaged(false);
      }
    }
  }, [active, player]); // eslint-disable-line react-hooks/exhaustive-deps

  const engage = () => {
    setEngaged(true);
    player.muted = false;
    player.play();
  };

  return (
    <View style={styles.videoWrap} testID="post-video">
      <VideoView player={player} style={styles.video} contentFit="cover" nativeControls={engaged} />
      {!engaged ? (
        <Pressable onPress={engage} style={styles.videoOverlay} testID="post-video-tap">
          <View style={styles.videoBadge}>
            <Ionicons name="videocam" size={12} color={colors.onSurface} />
            <Text style={styles.videoBadgeText}>VIDEO</Text>
          </View>
          {status === "loading" ? (
            <ActivityIndicator color={colors.onSurface} />
          ) : !isPlaying ? (
            <View style={styles.playCircle}>
              <Ionicons name="play" size={28} color={colors.onSurface} style={{ marginLeft: 3 }} />
            </View>
          ) : null}
          <View style={styles.muteBadge}>
            <Ionicons name="volume-mute" size={14} color={colors.onSurface} />
            <Text style={styles.videoBadgeText}>Tap for sound</Text>
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}

type MentionUser = { user_id: string; username: string };

export function RichText({ text, style, mentions }: { text: string; style: any; mentions?: MentionUser[] }) {
  const { colors } = useTheme();
  const router = useRouter();
  const parts = text.split(/(@[a-zA-Z0-9_]{3,24}|#[a-zA-Z0-9_]+)/g);
  return (
    <Text style={style}>
      {parts.map((p, i) => {
        if (p.startsWith("@")) {
          const user = mentions?.find((m) => m.username?.toLowerCase() === p.slice(1).toLowerCase());
          if (!user) return p;
          return (
            <Text key={i} style={{ color: colors.brandSecondary }} onPress={() => router.push(`/user/${user.user_id}`)} testID={`mention-${user.username}`}>
              {p}
            </Text>
          );
        }
        if (p.startsWith("#")) {
          return (
            <Text key={i} style={{ color: colors.brandSecondary }}>
              {p}
            </Text>
          );
        }
        return p;
      })}
    </Text>
  );
}

export function PostMedia({ media, compact, postId }: { media: MediaItem[]; compact?: boolean; postId?: string }) {
  const styles = useStyles();
  const [preview, setPreview] = useState<string | null>(null);
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  if (!media?.length) return null;
  return (
    <View style={[styles.mediaWrap, compact && { marginTop: 8 }]}>
      {media.map((m, i) => {
        const uri = mediaUrl(m.url)!;
        if (m.type === "video") return <VideoBlock key={i} uri={uri} postId={postId} />;
        const ratio = m.width && m.height ? m.width / m.height : m.type === "gif" ? 1.3 : 1.5;
        return (
          <Pressable key={i} onPress={() => setPreview(uri)} testID={`post-media-${i}`}>
            <Image source={{ uri }} style={{ width: "100%", aspectRatio: Math.max(0.7, Math.min(1.9, ratio)) }} contentFit="cover" transition={150} />
            {m.type === "gif" ? (
              <View style={styles.gifBadge}>
                <Text style={styles.gifBadgeText}>GIF</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
      <Modal visible={!!preview} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
        <Pressable style={styles.previewBackdrop} onPress={() => setPreview(null)} testID="media-preview-close">
          {preview ? <Image source={{ uri: preview }} style={{ width: "100%", height: "80%" }} contentFit="contain" /> : null}
          <View style={[styles.previewClose, { top: insets.top + 12 }]}>
            <Ionicons name="close" size={24} color={colors.onSurface} />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

type Props = { post: Post; detail?: boolean };

export const PostCard = memo(function PostCard({ post, detail }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const { like, bookmark, share, remove } = usePostActions();
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);

  const isMingle = post.space === "mingle";

  const openDetail = () => {
    if (!detail) router.push(`/post/${post.post_id}`);
  };
  // Mingle posts open the author's Mingle profile, never their main Level Up profile.
  const openAuthor = () => router.push(isMingle ? `/mingle/member/${post.author.user_id}` : `/user/${post.author.user_id}`);

  return (
    <View style={styles.card} testID={`post-card-${post.post_id}`}>
      <View style={styles.headerRow}>
        <Pressable onPress={openAuthor} style={styles.authorRow} testID={`post-author-${post.post_id}`}>
          <Avatar uri={post.author.avatar_url} name={post.author.display_name} size={42} ring={isMingle} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={styles.name} numberOfLines={1}>
                {post.author.display_name}
                {isMingle && post.author.age ? `, ${post.author.age}` : ""}
              </Text>
              {isMingle ? (
                <View style={styles.mingleTag} testID={`post-mingle-tag-${post.post_id}`}>
                  <Ionicons name="heart" size={10} color={colors.brandPrimary} />
                  <Text style={styles.mingleTagText}>Mingle</Text>
                </View>
              ) : post.author.trading_style ? (
                <View style={styles.styleTag}>
                  <Text style={styles.styleTagText}>{post.author.trading_style}</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.meta} numberOfLines={1}>
              {isMingle ? (post.author.location ? `${post.author.location} · ` : "") : `@${post.author.username} · `}
              {timeAgo(post.created_at)}
              {post.edited_at ? " · edited" : ""}
            </Text>
          </View>
        </Pressable>
        {post.is_mine ? (
          <Pressable onPress={() => setMenu(true)} hitSlop={10} style={styles.more} testID={`post-menu-${post.post_id}`}>
            <Ionicons name="ellipsis-horizontal" size={20} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>

      <Pressable onPress={openDetail} disabled={detail} testID={`post-body-${post.post_id}`}>
        {post.text ? <RichText text={post.text} style={[styles.text, detail && styles.textLarge]} mentions={post.mentioned_users} /> : null}
      </Pressable>
      <PostMedia media={post.media} postId={post.post_id} />

      <View style={styles.actions}>
        <Pressable onPress={() => like.mutate(post)} style={styles.action} hitSlop={6} testID={`post-like-${post.post_id}`}>
          <Ionicons name={post.liked ? "heart" : "heart-outline"} size={22} color={post.liked ? colors.error : colors.silver} />
          <Text style={[styles.actionText, post.liked && { color: colors.error }]}>{post.likes_count}</Text>
        </Pressable>
        <Pressable onPress={openDetail} style={styles.action} hitSlop={6} testID={`post-comment-${post.post_id}`}>
          <Ionicons name="chatbubble-outline" size={21} color={colors.silver} />
          <Text style={styles.actionText}>{post.comments_count}</Text>
        </Pressable>
        {isMingle ? (
          <>
            <View style={{ flex: 1 }} />
            {!post.is_mine ? (
              <Pressable onPress={openAuthor} style={styles.action} hitSlop={6} testID={`post-mingle-profile-${post.post_id}`}>
                <Ionicons name="hand-left-outline" size={19} color={colors.brandSecondary} />
                <Text style={[styles.actionText, { color: colors.brandSecondary }]}>Say hi · Interested</Text>
              </Pressable>
            ) : null}
          </>
        ) : (
          <>
            <Pressable onPress={() => share.mutate(post)} style={styles.action} hitSlop={6} testID={`post-share-${post.post_id}`}>
              <Ionicons name="paper-plane-outline" size={21} color={colors.silver} />
              <Text style={styles.actionText}>{post.shares_count || ""}</Text>
            </Pressable>
            <View style={{ flex: 1 }} />
            <Pressable onPress={() => bookmark.mutate(post)} hitSlop={6} style={styles.action} testID={`post-save-${post.post_id}`}>
              <Ionicons name={post.saved ? "bookmark" : "bookmark-outline"} size={21} color={post.saved ? colors.brandSecondary : colors.silver} />
            </Pressable>
          </>
        )}
      </View>

      <Modal visible={menu} transparent animationType="fade" onRequestClose={() => setMenu(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setMenu(false)}>
          <View style={styles.sheet}>
            <Pressable
              style={styles.sheetItem}
              onPress={() => {
                setMenu(false);
                setEditing(true);
              }}
              testID="post-edit-button"
            >
              <Ionicons name="create-outline" size={20} color={colors.onSurface} />
              <Text style={styles.sheetText}>Edit post</Text>
            </Pressable>
            <Pressable
              style={styles.sheetItem}
              onPress={() => {
                setMenu(false);
                remove.mutate(post);
                if (detail) router.back();
              }}
              testID="post-delete-button"
            >
              <Ionicons name="trash-outline" size={20} color={colors.error} />
              <Text style={[styles.sheetText, { color: colors.error }]}>Delete post</Text>
            </Pressable>
            <Pressable style={styles.sheetItem} onPress={() => setMenu(false)} testID="post-menu-cancel">
              <Ionicons name="close-outline" size={20} color={colors.onSurface} />
              <Text style={styles.sheetText}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
      {editing ? <EditPostSheet post={post} visible onClose={() => setEditing(false)} /> : null}
    </View>
  );
});

const useStyles = makeStyles((colors) => ({
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginHorizontal: 12,
    marginBottom: 12,
    paddingTop: 14,
    overflow: "hidden",
  },
  headerRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, gap: 8 },
  authorRow: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  name: { color: colors.onSurface, fontSize: 15, fontWeight: "500", flexShrink: 1 },
  styleTag: { backgroundColor: colors.brandSoft, borderRadius: 999, paddingHorizontal: 8, height: 20, justifyContent: "center" },
  styleTagText: { color: colors.brandPrimary, fontSize: 11 },
  mingleTag: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: colors.brandSoft, borderRadius: 999, paddingHorizontal: 7, height: 20 },
  mingleTagText: { color: colors.brandPrimary, fontSize: 11 },
  meta: { color: colors.muted, fontSize: 12, marginTop: 2 },
  more: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  text: { color: colors.onSurfaceSecondary, fontSize: 15, lineHeight: 22, paddingHorizontal: 14, paddingTop: 12 },
  textLarge: { fontSize: 17, lineHeight: 26 },
  mediaWrap: { marginTop: 12, backgroundColor: colors.surfaceTertiary },
  videoWrap: { width: "100%", height: 280, backgroundColor: colors.surfaceTertiary },
  video: { width: "100%", height: "100%" },
  videoOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  playCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.overlay, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.borderStrong },
  videoBadge: { position: "absolute", top: 10, left: 10, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.overlay, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 },
  muteBadge: { position: "absolute", bottom: 10, right: 10, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.overlay, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  videoBadgeText: { color: colors.onSurface, fontSize: 11, letterSpacing: 0.6 },
  gifBadge: { position: "absolute", left: 10, bottom: 10, backgroundColor: colors.overlay, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  gifBadgeText: { color: colors.onSurface, fontSize: 11, letterSpacing: 1 },
  actions: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 6, gap: 4 },
  action: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, minWidth: 44, paddingHorizontal: 6, justifyContent: "center" },
  actionText: { color: colors.silver, fontSize: 13 },
  previewBackdrop: { flex: 1, backgroundColor: colors.overlay, alignItems: "center", justifyContent: "center" },
  previewClose: { position: "absolute", right: 16, width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  sheetBackdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.surfaceSecondary, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: 32, gap: 4 },
  sheetItem: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52, paddingHorizontal: 12, borderRadius: 12 },
  sheetText: { color: colors.onSurface, fontSize: 16 },
}));
