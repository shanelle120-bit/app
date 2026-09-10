import Ionicons from "@react-native-vector-icons/ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { Dimensions, Pressable, RefreshControl, SectionList, Text, View } from "react-native";

import { api, mediaUrl } from "@/src/api";
import { PostCard } from "@/src/components/post-card";
import { Avatar, Button, Chip, EmptyState, Loader } from "@/src/components/ui";
import { FEATURES_V1 } from "@/src/feature-flags";
import { postKeys } from "@/src/hooks/use-post-actions";
import { useVisiblePostsTracker, VisiblePostsProvider } from "@/src/hooks/use-visible-posts";
import { makeStyles, useTheme } from "@/src/theme";
import { useToast } from "@/src/toast";
import type { Post, User } from "@/src/types";

type Tab = "posts" | "photos" | "videos" | "mentions" | "saved";

type Props = {
  user: User;
  isMe: boolean;
  headerTop: React.ReactNode;
  onRefreshUser: () => Promise<unknown>;
};

export function ProfileView({ user, isMe, headerTop, onRefreshUser }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("posts");
  const { onViewableItemsChanged, viewabilityConfig, visible } = useVisiblePostsTracker();

  const tabs: Tab[] = isMe ? ["posts", "photos", "videos", "mentions", "saved"] : ["posts", "photos", "videos", "mentions"];

  const postsQuery = useQuery({
    queryKey: tab === "saved" ? postKeys.saved : postKeys.userPosts(user.user_id, tab),
    queryFn: () => api<Post[]>(tab === "saved" ? "/me/saved" : `/users/${user.user_id}/posts?tab=${tab}`),
  });

  const follow = useMutation({
    mutationFn: () => api<{ following: boolean; followers_count: number }>(`/users/${user.user_id}/follow`, { method: "POST" }),
    onSuccess: (res) => {
      qc.setQueryData(["user", user.user_id], (old: User | undefined) => (old ? { ...old, is_following: res.following, followers_count: res.followers_count } : old));
      qc.invalidateQueries({ queryKey: ["stories"] });
      qc.invalidateQueries({ queryKey: ["posts", "following"] });
      qc.invalidateQueries({ queryKey: ["me"] });
      toast.show(res.following ? `Following ${user.display_name}` : `Unfollowed ${user.display_name}`, "success");
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

  const onMessagePress = () => {
    if (!FEATURES_V1.chat) {
      toast.show("Chat is launching soon — stay tuned!", "info");
      return;
    }
    message.mutate();
  };

  const isGrid = tab === "photos" || tab === "videos";
  const gridRows = useMemo(() => {
    if (!isGrid) return [];
    const tiles = (postsQuery.data ?? []).flatMap((p) => p.media.filter((m) => (tab === "videos" ? m.type === "video" : m.type !== "video")).map((m) => ({ post: p, media: m })));
    const rows: (typeof tiles)[] = [];
    for (let i = 0; i < tiles.length; i += 3) rows.push(tiles.slice(i, i + 3));
    return rows;
  }, [postsQuery.data, isGrid, tab]);

  const tileSize = (Dimensions.get("window").width - 12 * 2 - 4 * 2) / 3;

  const header = (
    <View>
      <View style={styles.cover}>
        {user.cover_url ? <Image source={{ uri: mediaUrl(user.cover_url) }} style={styles.coverImage} contentFit="cover" /> : <LinearGradient colors={[colors.brandTertiary, colors.brandPrimary, colors.surface]} style={styles.coverImage} />}
        <LinearGradient colors={["rgba(11,15,25,0)", colors.surface]} style={styles.coverScrim} />
        {headerTop}
      </View>
      <View style={styles.infoWrap}>
        <View style={styles.avatarRow}>
          <View style={styles.avatarRing}>
            <Avatar uri={user.avatar_url} name={user.display_name} size={84} testID="profile-avatar" />
          </View>
          <View style={styles.actionRow}>
            {isMe ? (
              <Button title="Edit profile" small variant="secondary" icon="create-outline" onPress={() => router.push("/edit-profile")} testID="profile-edit-button" />
            ) : (
              <>
                <Button title="Message" small variant="secondary" icon="chatbubble-outline" onPress={onMessagePress} loading={FEATURES_V1.chat && message.isPending} testID="profile-message-button" />
                <Button title={user.is_following ? "Following" : "Follow"} small variant={user.is_following ? "secondary" : "primary"} onPress={() => follow.mutate()} loading={follow.isPending} testID="profile-follow-button" />
              </>
            )}
          </View>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12 }}>
          <Text style={styles.name} testID="profile-display-name">
            {user.display_name}
          </Text>
          {user.is_verified ? <Ionicons name="checkmark-circle" size={18} color={colors.brandSecondary} /> : null}
        </View>
        <Text style={styles.handle} testID="profile-username">
          @{user.username}
        </Text>
        {user.bio ? (
          <Text style={styles.bio} testID="profile-bio">
            {user.bio}
          </Text>
        ) : null}

        {FEATURES_V1.mingle && user.mingle_badge ? (
          <Pressable onPress={() => router.push("/mingle")} style={styles.mingleBadge} testID="profile-mingle-badge">
            <Ionicons name="heart-circle" size={16} color={colors.brandPrimary} />
            <Text style={styles.mingleBadgeText}>Single & Mingle member</Text>
          </Pressable>
        ) : null}

        <View style={styles.statsRow}>
          <View style={styles.stat} testID="profile-posts-count">
            <Text style={styles.statValue}>{user.posts_count}</Text>
            <Text style={styles.statLabel}>Posts</Text>
          </View>
          <Pressable style={styles.stat} onPress={() => router.push(`/connections?id=${user.user_id}&type=followers`)} testID="profile-followers-count">
            <Text style={styles.statValue}>{user.followers_count}</Text>
            <Text style={styles.statLabel}>Followers</Text>
          </Pressable>
          <Pressable style={styles.stat} onPress={() => router.push(`/connections?id=${user.user_id}&type=following`)} testID="profile-following-count">
            <Text style={styles.statValue}>{user.following_count}</Text>
            <Text style={styles.statLabel}>Following</Text>
          </Pressable>
        </View>

        {user.markets.length || user.trading_style || user.trading_session ? (
          <View style={styles.chipsWrap}>
            {user.trading_style ? <Chip label={user.trading_style} selected tone="brand" /> : null}
            {user.trading_session ? <Chip label={`${user.trading_session} session`} selected tone="cyan" /> : null}
            {user.markets.map((m) => (
              <Chip key={m} label={m} selected tone="neutral" />
            ))}
          </View>
        ) : null}
        {user.instruments.length ? (
          <View style={styles.instrumentsRow}>
            <Ionicons name="star-outline" size={14} color={colors.muted} />
            <Text style={styles.instruments} testID="profile-instruments">
              {user.instruments.join(" · ")}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );

  const tabBar = (
    <View style={styles.tabBar}>
      {tabs.map((t) => (
        <Pressable key={t} onPress={() => setTab(t)} style={styles.tabItem} testID={`profile-tab-${t}`}>
          <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t[0].toUpperCase() + t.slice(1)}</Text>
          {tab === t ? <View style={styles.tabIndicator} /> : null}
        </Pressable>
      ))}
    </View>
  );

  const emptyCopy: Record<Tab, string> = {
    posts: isMe ? "Share your first setup from the Create tab." : "No posts yet.",
    photos: "No photos or charts yet.",
    videos: "No videos yet.",
    mentions: "No mentions yet. Traders can tag with @username.",
    saved: "Bookmark posts to find them here.",
  };

  const data: any[] = isGrid ? gridRows : (postsQuery.data ?? []);

  return (
    <VisiblePostsProvider value={visible}>
    <SectionList
      sections={[{ key: tab, data }]}
      keyExtractor={(item, index) => (isGrid ? `row-${index}` : item.post_id)}
      onViewableItemsChanged={onViewableItemsChanged}
      viewabilityConfig={viewabilityConfig}
      ListHeaderComponent={header}
      renderSectionHeader={() => tabBar}
      stickySectionHeadersEnabled
      renderItem={({ item }) =>
        isGrid ? (
          <View style={styles.gridRow}>
            {(item as { post: Post; media: Post["media"][0] }[]).map((tile, i) => (
              <Pressable key={i} onPress={() => router.push(`/post/${tile.post.post_id}`)} style={{ width: tileSize, height: tileSize }} testID={`profile-grid-tile-${i}`}>
                {tile.media.type === "video" ? (
                  <View style={styles.videoTile}>
                    <Ionicons name="play" size={26} color={colors.brandSecondary} />
                  </View>
                ) : (
                  <Image source={{ uri: mediaUrl(tile.media.url) }} style={styles.tileImage} contentFit="cover" />
                )}
              </Pressable>
            ))}
          </View>
        ) : (
          <PostCard post={item as Post} />
        )
      }
      ListEmptyComponent={postsQuery.isLoading ? <Loader /> : <EmptyState icon={tab === "saved" ? "bookmark-outline" : "document-text-outline"} title={`No ${tab}`} subtitle={emptyCopy[tab]} />}
      contentContainerStyle={{ paddingBottom: 24 }}
      refreshControl={<RefreshControl refreshing={postsQuery.isRefetching} onRefresh={() => Promise.all([postsQuery.refetch(), onRefreshUser()])} tintColor={colors.brandSecondary} />}
      testID="profile-list"
    />
    </VisiblePostsProvider>
  );
}

const useStyles = makeStyles((colors) => ({
  cover: { height: 180, backgroundColor: colors.surfaceSecondary },
  coverImage: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  coverScrim: { position: "absolute", left: 0, right: 0, bottom: 0, height: 120 },
  infoWrap: { paddingHorizontal: 16, marginTop: -44 },
  avatarRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" },
  avatarRing: { padding: 3, borderRadius: 48, backgroundColor: colors.surface },
  actionRow: { flexDirection: "row", gap: 8, paddingBottom: 6 },
  name: { color: colors.onSurface, fontSize: 22, fontWeight: "500", letterSpacing: -0.3 },
  handle: { color: colors.muted, fontSize: 14, marginTop: 2 },
  bio: { color: colors.onSurfaceSecondary, fontSize: 15, lineHeight: 22, marginTop: 10 },
  statsRow: { flexDirection: "row", gap: 24, marginTop: 16 },
  mingleBadge: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", backgroundColor: colors.brandSoft, borderRadius: 999, paddingHorizontal: 10, height: 28, marginTop: 10 },
  mingleBadgeText: { color: colors.brandPrimary, fontSize: 12, fontWeight: "500" },
  stat: { minHeight: 44, justifyContent: "center" },
  statValue: { color: colors.onSurface, fontSize: 18, fontWeight: "500" },
  statLabel: { color: colors.muted, fontSize: 12 },
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  instrumentsRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12 },
  instruments: { color: colors.silver, fontSize: 13, letterSpacing: 0.3 },
  tabBar: { flexDirection: "row", backgroundColor: colors.glass, borderBottomWidth: 1, borderBottomColor: colors.border, marginTop: 16, marginBottom: 12, paddingHorizontal: 8 },
  tabItem: { flex: 1, height: 46, alignItems: "center", justifyContent: "center" },
  tabText: { color: colors.muted, fontSize: 13 },
  tabTextActive: { color: colors.onSurface },
  tabIndicator: { position: "absolute", bottom: 0, height: 2, width: 28, borderRadius: 1, backgroundColor: colors.brandSecondary },
  gridRow: { flexDirection: "row", gap: 4, paddingHorizontal: 12, marginBottom: 4 },
  tileImage: { width: "100%", height: "100%", borderRadius: 6, backgroundColor: colors.surfaceTertiary },
  videoTile: { flex: 1, borderRadius: 6, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
}));
