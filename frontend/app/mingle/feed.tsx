import Ionicons from "@react-native-vector-icons/ionicons";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { MingleNav } from "@/src/components/mingle-nav";
import { PostCard } from "@/src/components/post-card";
import { Avatar, Button, EmptyState, Loader, ScreenHeader } from "@/src/components/ui";
import { postKeys } from "@/src/hooks/use-post-actions";
import { useVisiblePostsTracker, VisiblePostsProvider } from "@/src/hooks/use-visible-posts";
import type { MingleProfile } from "@/src/mingle-types";
import { makeStyles, useTheme } from "@/src/theme";
import type { Post } from "@/src/types";

type Page = { items: Post[]; next_cursor: string | null };

export default function MingleFeed() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const me = useQuery({ queryKey: ["mingle", "me"], queryFn: () => api<{ profile: MingleProfile | null }>("/mingle/me") });
  const query = useInfiniteQuery({
    queryKey: postKeys.mingleFeed,
    queryFn: ({ pageParam }) => api<Page>(`/mingle/posts?limit=15${pageParam ? `&before=${encodeURIComponent(pageParam)}` : ""}`),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor,
    enabled: !!me.data?.profile,
  });
  const posts = query.data?.pages.flatMap((p) => p.items) ?? [];
  const { onViewableItemsChanged, viewabilityConfig, visible } = useVisiblePostsTracker();
  const profile = me.data?.profile;

  return (
    <View style={styles.root} testID="mingle-feed-screen">
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader title="Mingle Feed" onBack={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/premium"))} />
      </View>
      {me.isLoading ? (
        <Loader />
      ) : !profile ? (
        <EmptyState icon="heart-circle-outline" title="Members only" subtitle="Join Single & Mingle to see and share what members are posting." action={<Button title="Go to Discover" small onPress={() => router.replace("/mingle")} testID="mingle-feed-join" />} />
      ) : (
        <VisiblePostsProvider value={visible}>
          <FlatList
            data={posts}
            keyExtractor={(p) => p.post_id}
            renderItem={({ item }) => <PostCard post={item} />}
            ListHeaderComponent={
              <Pressable onPress={() => router.push("/mingle/compose")} style={styles.composer} testID="mingle-compose-button">
                <Avatar uri={profile.photos?.[0] ?? profile.photo_url} name={profile.display_name} size={40} ring />
                <Text style={styles.composerText}>Share something with the Mingle crowd…</Text>
                <View style={styles.composerIcon}>
                  <Ionicons name="add" size={20} color={colors.onBrandPrimary} />
                </View>
              </Pressable>
            }
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            contentContainerStyle={{ paddingBottom: 24 }}
            refreshControl={<RefreshControl refreshing={query.isRefetching && !query.isFetchingNextPage} onRefresh={() => query.refetch()} tintColor={colors.brandSecondary} />}
            onEndReached={() => query.hasNextPage && !query.isFetchingNextPage && query.fetchNextPage()}
            onEndReachedThreshold={0.6}
            ListFooterComponent={query.isFetchingNextPage ? <Loader /> : null}
            ListEmptyComponent={
              query.isLoading ? (
                <Loader testID="mingle-feed-loading" />
              ) : query.isError ? (
                <EmptyState icon="cloud-offline-outline" title="Couldn't load the Mingle Feed" subtitle={(query.error as Error).message} action={<Button title="Retry" small variant="secondary" onPress={() => query.refetch()} />} />
              ) : (
                <EmptyState icon="cafe-outline" title="Quiet in here… for now" subtitle="This feed is just for Single & Mingle members. Say something real — a market-free weekend plan, a hot take, a photo." action={<Button title="Write the first post" small onPress={() => router.push("/mingle/compose")} testID="mingle-feed-empty-cta" />} />
              )
            }
            testID="mingle-feed-list"
          />
        </VisiblePostsProvider>
      )}
      <MingleNav current="feed" />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  composer: { flexDirection: "row", alignItems: "center", gap: 12, marginHorizontal: 12, marginBottom: 12, padding: 12, borderRadius: 16, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  composerText: { color: colors.muted, fontSize: 14, flex: 1 },
  composerIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
}));
