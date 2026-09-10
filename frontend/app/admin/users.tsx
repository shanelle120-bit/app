import Ionicons from "@react-native-vector-icons/ionicons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { Avatar, EmptyState, Input, Loader, ScreenHeader } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";
import type { AdminUserEntry } from "@/src/types";

function formatDate(value: string | null): string {
  if (!value) return "Unknown";
  const d = new Date(value.endsWith("Z") ? value : `${value}Z`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function AdminUsers() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = !!user?.is_admin;
  const [search, setSearch] = useState("");

  const query = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => api<{ items: AdminUserEntry[]; count: number }>("/admin/users"),
    enabled: isAdmin,
  });

  const back = () => (router.canGoBack() ? router.back() : router.replace("/(tabs)/profile"));
  const filtered = useMemo(() => {
    const items = query.data?.items ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (it) =>
        it.display_name?.toLowerCase().includes(q) ||
        it.username?.toLowerCase().includes(q) ||
        it.email?.toLowerCase().includes(q)
    );
  }, [query.data, search]);

  return (
    <View style={styles.root} testID="admin-users-screen">
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader title="All Users" onBack={back} />
      </View>

      {!isAdmin ? (
        <EmptyState icon="lock-closed-outline" title="Admin access required" subtitle="This screen is only visible to designated admin accounts." />
      ) : query.isLoading ? (
        <Loader />
      ) : (
        <>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryText}>
              <Text style={styles.summaryCount}>{query.data?.count ?? 0}</Text> {(query.data?.count ?? 0) === 1 ? "account" : "accounts"} total
            </Text>
          </View>
          <View style={styles.searchRow}>
            <Input icon="search-outline" placeholder="Search name, username, or email" value={search} onChangeText={setSearch} autoCapitalize="none" testID="admin-users-search-input" />
          </View>
          <FlatList
            data={filtered}
            keyExtractor={(it) => it.user_id}
            contentContainerStyle={{ paddingBottom: insets.bottom + 24, paddingHorizontal: 16 }}
            ListEmptyComponent={<EmptyState icon="people-outline" title="No users found" subtitle="Try a different search term." />}
            renderItem={({ item }) => (
              <Pressable style={styles.row} onPress={() => router.push(`/admin/user/${item.user_id}`)} testID="admin-users-row">
                <Avatar uri={item.avatar_url} name={item.display_name ?? "?"} size={40} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={styles.rowName} numberOfLines={1}>{item.display_name ?? "Unknown"}</Text>
                    {item.is_founding_member ? <Ionicons name="trophy" size={13} color={colors.warning} /> : null}
                    {item.is_admin ? <Ionicons name="shield-checkmark" size={13} color={colors.brandPrimary} /> : null}
                    {item.account_status !== "active" ? <Ionicons name="alert-circle" size={13} color={colors.error} /> : null}
                  </View>
                  <Text style={styles.rowMeta} numberOfLines={1}>
                    {item.username ? `@${item.username} · ` : ""}{item.email ?? "No email on file"}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <View style={[styles.tierPill, item.tier === "premium" && { backgroundColor: colors.brandSoft }, item.account_status !== "active" && { backgroundColor: colors.errorSoft }]}>
                    <Text style={[styles.tierPillText, item.tier === "premium" && { color: colors.brandPrimary }, item.account_status !== "active" && { color: colors.error }]}>
                      {item.account_status !== "active" ? item.account_status : item.is_complimentary ? "complimentary" : item.tier}
                    </Text>
                  </View>
                  <Text style={styles.rowDate}>{formatDate(item.created_at)}</Text>
                </View>
              </Pressable>
            )}
          />
        </>
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  summaryRow: { paddingHorizontal: 16, paddingTop: 16 },
  summaryText: { color: colors.muted, fontSize: 14 },
  summaryCount: { color: colors.onSurface, fontWeight: "600" },
  searchRow: { paddingHorizontal: 16, paddingTop: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowName: { color: colors.onSurface, fontSize: 15, fontWeight: "500" },
  rowMeta: { color: colors.muted, fontSize: 13, marginTop: 2 },
  rowDate: { color: colors.muted, fontSize: 12, marginTop: 4 },
  tierPill: { backgroundColor: colors.border, borderRadius: 999, paddingHorizontal: 8, height: 20, alignItems: "center", justifyContent: "center" },
  tierPillText: { color: colors.muted, fontSize: 10, fontWeight: "600", textTransform: "uppercase" },
}));
