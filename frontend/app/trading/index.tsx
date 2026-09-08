import Ionicons from "@react-native-vector-icons/ionicons";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { PostCard } from "@/src/components/post-card";
import { PremiumPaywall } from "@/src/components/premium-gate";
import { Button, EmptyState, Loader } from "@/src/components/ui";
import { useMembership } from "@/src/hooks/use-membership";
import { postKeys } from "@/src/hooks/use-post-actions";
import { useVisiblePostsTracker, VisiblePostsProvider } from "@/src/hooks/use-visible-posts";
import { makeStyles, useTheme } from "@/src/theme";
import type { Post } from "@/src/types";

type Page = { items: Post[]; next_cursor: string | null };

/** Trading Only — the main community feed, scoped to the Premium `trading` space. Same posts, comments, reactions, identity. */
export default function TradingOnly() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isPremium, isLoading: membershipLoading } = useMembership();
  const back = () => (router.canGoBack() ? router.back() : router.replace("/(tabs)/premium"));
  const query = useInfiniteQuery({
    queryKey: postKeys.feed("trading"),
    queryFn: ({ pageParam }) => api<Page>(`/posts?space=trading&limit=15${pageParam ? `&before=${encodeURIComponent(pageParam)}` : ""}`),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor,
    enabled: isPremium,
  });
  const posts = query.data?.pages.flatMap((p) => p.items) ?? [];
  const { onViewableItemsChanged, viewabilityConfig, visible } = useVisiblePostsTracker();

  if (!isPremium) {
    if (membershipLoading) return <View style={styles.root}><Loader /></View>;
    return <PremiumPaywall featureKey="trading_only" icon="bar-chart" title="Trading Only" lead="The conversation behind the charts. A members-only space for real conversations about strategies, prop firms, platforms, tools, trading psychology, resources, lessons learned and everything trading." onBack={back} />;
  }

  return (
    <View style={styles.root} testID="trading-only-screen">
      {/* Same header structure as the Main Community Feed: brand block left, round actions right. */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerRow}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
            <Pressable onPress={back} style={styles.backBtn} hitSlop={8} testID="trading-back-button">
              <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
            </Pressable>
            <View style={styles.logoMark}>
              <Ionicons name="bar-chart" size={16} color={colors.onBrandPrimary} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.brand}>TRADING{"\n"}ONLY</Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Pressable onPress={() => router.push("/(tabs)/create?space=trading")} style={styles.roundBtn} testID="trading-compose-button">
              <Ionicons name="add" size={22} color={colors.onSurface} />
            </Pressable>
            <Pressable onPress={() => router.push("/search")} style={styles.roundBtn} testID="trading-search-button">
              <Ionicons name="search" size={20} color={colors.onSurface} />
            </Pressable>
          </View>
        </View>
        <Text style={styles.description}>A members-only space for real conversations about strategies, prop firms, platforms, tools, trading psychology, resources, lessons learned and everything trading.</Text>
      </View>

      <VisiblePostsProvider value={visible}>
        <FlatList
          data={posts}
          keyExtractor={(p) => p.post_id}
          renderItem={({ item }) => <PostCard post={item} />}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          contentContainerStyle={{ paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={query.isRefetching && !query.isFetchingNextPage} onRefresh={() => query.refetch()} tintColor={colors.brandSecondary} />}
          onEndReached={() => query.hasNextPage && !query.isFetchingNextPage && query.fetchNextPage()}
          onEndReachedThreshold={0.6}
          ListFooterComponent={query.isFetchingNextPage ? <Loader /> : null}
          ListEmptyComponent={
            query.isLoading ? (
              <Loader testID="trading-feed-loading" />
            ) : query.isError ? (
              <EmptyState icon="cloud-offline-outline" title="Couldn't load Trading Only" subtitle={(query.error as Error).message} action={<Button title="Retry" small variant="secondary" onPress={() => query.refetch()} />} />
            ) : (
              <EmptyState icon="bar-chart-outline" title="Start the conversation." subtitle="Ask a trading question, share something you learned, post a chart, talk prop firms, or tell us what the market did to you today." action={<Button title="Create a post" small onPress={() => router.push("/(tabs)/create?space=trading")} testID="trading-empty-cta" />} />
            )
          }
          testID="trading-feed-list"
        />
      </VisiblePostsProvider>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { backgroundColor: colors.glass, borderBottomWidth: 1, borderBottomColor: colors.border, paddingHorizontal: 16, paddingBottom: 10 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", height: 48 },
  backBtn: { width: 32, height: 40, alignItems: "center", justifyContent: "center", marginLeft: -8 },
  logoMark: { width: 30, height: 30, borderRadius: 9, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  brand: { color: colors.onSurface, fontSize: 15, lineHeight: 19, fontWeight: "500", letterSpacing: 1.2 },
  roundBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  description: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 8 },
}));
