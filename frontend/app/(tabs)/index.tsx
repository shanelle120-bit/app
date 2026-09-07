import Ionicons from "@react-native-vector-icons/ionicons";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { PostCard } from "@/src/components/post-card";
import { StoriesRow } from "@/src/components/stories-row";
import { Button, EmptyState, Loader } from "@/src/components/ui";
import { postKeys } from "@/src/hooks/use-post-actions";
import { useVisiblePostsTracker } from "@/src/hooks/use-visible-posts";
import { makeStyles, useTheme } from "@/src/theme";
import type { Post } from "@/src/types";

type Page = { items: Post[]; next_cursor: string | null };

export default function Home() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const [scope, setScope] = useState<"all" | "following">("all");

  const query = useInfiniteQuery({
    queryKey: postKeys.feed(scope),
    queryFn: ({ pageParam }) => api<Page>(`/posts?scope=${scope}&limit=15${pageParam ? `&before=${encodeURIComponent(pageParam)}` : ""}`),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor,
  });

  const posts = query.data?.pages.flatMap((p) => p.items) ?? [];
  const { onViewableItemsChanged, viewabilityConfig, Provider: VisiblePosts } = useVisiblePostsTracker();

  const refresh = async () => {
    await Promise.all([query.refetch(), qc.invalidateQueries({ queryKey: ["stories"] })]);
  };

  return (
    <View style={styles.root} testID="home-screen">
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerRow}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={styles.logoMark}>
              <Ionicons name="trending-up" size={16} color={colors.onBrandPrimary} />
            </View>
            <View>
              <Text style={styles.brand}>Level Up</Text>
              <Text style={styles.tagline}>Beyond the charts</Text>
            </View>
          </View>
          <Pressable onPress={() => router.push("/search")} style={styles.searchBtn} testID="home-search-button">
            <Ionicons name="search" size={20} color={colors.onSurface} />
          </Pressable>
        </View>
        <View style={styles.segment}>
          {(["all", "following"] as const).map((s) => (
            <Pressable key={s} onPress={() => setScope(s)} style={[styles.segmentItem, scope === s && styles.segmentActive]} testID={`feed-scope-${s}`}>
              <Text style={[styles.segmentText, scope === s && styles.segmentTextActive]}>{s === "all" ? "For you" : "Following"}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <VisiblePosts>
      <FlatList
        data={posts}
        keyExtractor={(p) => p.post_id}
        renderItem={({ item }) => <PostCard post={item} />}
        ListHeaderComponent={<StoriesRow />}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={query.isRefetching && !query.isFetchingNextPage} onRefresh={refresh} tintColor={colors.brandSecondary} />}
        onEndReached={() => query.hasNextPage && !query.isFetchingNextPage && query.fetchNextPage()}
        onEndReachedThreshold={0.6}
        ListFooterComponent={query.isFetchingNextPage ? <Loader /> : null}
        ListEmptyComponent={
          query.isLoading ? (
            <Loader testID="feed-loading" />
          ) : query.isError ? (
            <EmptyState icon="cloud-offline-outline" title="Couldn't load the feed" subtitle={(query.error as Error).message} action={<Button title="Retry" small variant="secondary" onPress={() => query.refetch()} testID="feed-retry" />} />
          ) : (
            <EmptyState
              icon="people-outline"
              title={scope === "following" ? "Follow traders to see their updates" : "No posts yet"}
              subtitle={scope === "following" ? "Discover traders in your markets and build your feed." : "Be the first to share a setup."}
              action={<Button title={scope === "following" ? "Discover traders" : "Create a post"} small onPress={() => router.push(scope === "following" ? "/search" : "/(tabs)/create")} testID="feed-empty-cta" />}
            />
          )
        }
        testID="feed-list"
      />
      </VisiblePosts>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { backgroundColor: colors.glass, borderBottomWidth: 1, borderBottomColor: colors.border, paddingHorizontal: 16, paddingBottom: 10 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", height: 48 },
  logoMark: { width: 30, height: 30, borderRadius: 9, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  brand: { color: colors.onSurface, fontSize: 17, fontWeight: "500", letterSpacing: 0.2 },
  tagline: { color: colors.muted, fontSize: 11, letterSpacing: 0.4 },
  searchBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  segment: { flexDirection: "row", backgroundColor: colors.surfaceTertiary, borderRadius: 999, padding: 3, marginTop: 8, alignSelf: "flex-start" },
  segmentItem: { paddingHorizontal: 16, height: 32, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  segmentActive: { backgroundColor: colors.brandPrimary },
  segmentText: { color: colors.muted, fontSize: 13 },
  segmentTextActive: { color: colors.onBrandPrimary },
}));
