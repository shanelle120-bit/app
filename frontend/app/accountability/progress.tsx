import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { FlatList, RefreshControl, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { accKeys, money, plainMoney, type AccProgress } from "@/src/accountability";
import { SessionRow, StatTile } from "@/src/components/accountability-ui";
import { Button, EmptyState, Loader, ScreenHeader } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";

export default function Progress() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const q = useQuery({ queryKey: accKeys.progress, queryFn: () => api<AccProgress>("/accountability/progress") });
  const p = q.data;

  return (
    <View style={styles.root} testID="acc-progress-screen">
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader title="My Progress" onBack={() => (router.canGoBack() ? router.back() : router.replace("/accountability"))} />
      </View>
      <FlatList
        data={p?.history ?? []}
        keyExtractor={(s) => s.session_id}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={colors.brandSecondary} />}
        ListHeaderComponent={
          p ? (
            <View style={styles.header}>
              <View style={styles.tiles}>
                <StatTile label="Current Balance" value={plainMoney(p.current_balance)} testID="stat-current-balance" />
                <StatTile label="Total P&L" value={money(p.total_pnl)} tone={p.total_pnl >= 0 ? "good" : "bad"} testID="stat-total-pnl" />
                <StatTile label="Days Logged" value={String(p.days_logged)} testID="stat-days-logged" />
                <StatTile label="Target-Hit Rate" value={`${p.target_hit_rate}%`} testID="stat-target-hit-rate" />
                <StatTile label="Avg Discipline Score" value={`${p.avg_discipline}/100`} testID="stat-avg-discipline" />
                <StatTile label="Plan-Followed Rate" value={`${p.plan_followed_rate}%`} testID="stat-plan-followed" />
                <StatTile label="Max-Loss-Respected Rate" value={`${p.max_loss_respected_rate}%`} testID="stat-max-loss" />
                <StatTile label="Accountability Streak" value={`${p.accountability_streak} day${p.accountability_streak === 1 ? "" : "s"}`} testID="stat-acc-streak" />
                <StatTile label="No-Revenge Streak" value={`${p.no_revenge_streak} session${p.no_revenge_streak === 1 ? "" : "s"}`} testID="stat-no-revenge-streak" />
              </View>
              <Text style={styles.section}>SESSION HISTORY</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => <SessionRow s={item} onPress={() => router.push(`/accountability/session/${item.session_id}`)} />}
        ListEmptyComponent={q.isLoading ? <Loader /> : <EmptyState icon="bar-chart-outline" title="No sessions yet" subtitle="Log your first after-trading session to start tracking discipline." action={<Button title="Log a session" small onPress={() => router.push("/accountability/session")} />} />}
        testID="acc-history-list"
      />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { padding: 16, gap: 16 },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  section: { color: colors.muted, fontSize: 12, letterSpacing: 0.8 },
}));
