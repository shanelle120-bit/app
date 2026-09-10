import Ionicons from "@react-native-vector-icons/ionicons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { RefreshControl, ScrollView, Text, View, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { EmptyState, Loader, ScreenHeader } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";
import type { AdminDashboard } from "@/src/types";

function StatCard({ label, value, icon, tone }: { label: string; value: number; icon: string; tone?: "warn" | "danger" }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const color = tone === "danger" ? colors.error : tone === "warn" ? colors.warning : colors.brandSecondary;
  return (
    <View style={styles.statCard} testID={`admin-stat-${label.replace(/\s+/g, "-").toLowerCase()}`}>
      <View style={[styles.statIcon, { backgroundColor: tone === "danger" ? colors.errorSoft : tone === "warn" ? "rgba(255,195,0,0.14)" : colors.cyanSoft }]}>
        <Ionicons name={icon as any} size={18} color={color} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function NavRow({ icon, title, subtitle, badge, onPress, testID }: { icon: string; title: string; subtitle: string; badge?: number; onPress: () => void; testID: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable style={styles.navRow} testID={testID} onPress={onPress}>
      <View style={styles.navIcon}>
        <Ionicons name={icon as any} size={20} color={colors.brandPrimary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.navTitle}>{title}</Text>
        <Text style={styles.navSubtitle}>{subtitle}</Text>
      </View>
      {badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : null}
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
}

export default function AdminDashboardScreen() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = !!user?.is_admin;

  const query = useQuery({
    queryKey: ["admin", "dashboard"],
    queryFn: () => api<AdminDashboard>("/admin/dashboard"),
    enabled: isAdmin,
  });

  const back = () => (router.canGoBack() ? router.back() : router.replace("/(tabs)/profile"));
  const d = query.data;

  return (
    <View style={styles.root} testID="admin-dashboard-screen">
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader title="Admin" onBack={back} />
      </View>
      {!isAdmin ? (
        <EmptyState icon="lock-closed-outline" title="Admin access required" subtitle="This screen is only visible to designated admin accounts." />
      ) : query.isLoading ? (
        <Loader />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
          refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => query.refetch()} />}
        >
          <Text style={styles.sectionTitle}>Overview</Text>
          <View style={styles.grid}>
            <StatCard label="Total users" value={d?.total_users ?? 0} icon="people-outline" />
            <StatCard label="Active" value={d?.active_users ?? 0} icon="pulse-outline" />
            <StatCard label="New (7d)" value={d?.new_signups_7d ?? 0} icon="person-add-outline" />
            <StatCard label="Free" value={d?.free_users ?? 0} icon="person-outline" />
            <StatCard label="Premium" value={d?.premium_users ?? 0} icon="diamond-outline" />
            <StatCard label="Trialing" value={d?.trial_users ?? 0} icon="hourglass-outline" />
            <StatCard label="Complimentary" value={d?.complimentary_premium_users ?? 0} icon="gift-outline" />
            <StatCard label="Founding" value={d?.founding_members ?? 0} icon="trophy-outline" tone="warn" />
            <StatCard label="Suspended" value={d?.suspended_users ?? 0} icon="pause-circle-outline" tone="danger" />
            <StatCard label="Banned" value={d?.banned_users ?? 0} icon="ban-outline" tone="danger" />
          </View>

          <Text style={styles.sectionTitle}>Tools</Text>
          <View style={styles.navList}>
            <NavRow icon="people-outline" title="All Users" subtitle="Search, view, and manage accounts" onPress={() => router.push("/admin/users")} testID="admin-nav-users" />
            <NavRow icon="flag-outline" title="Reports & Moderation" subtitle="Review flagged posts, comments, profiles & Mingle" badge={d?.open_reports} onPress={() => router.push("/admin/reports")} testID="admin-nav-reports" />
            <NavRow icon="megaphone-outline" title="Announcements" subtitle="Post or pin an official Level Up update" onPress={() => router.push("/admin/announcements")} testID="admin-nav-announcements" />
            <NavRow icon="time-outline" title="Audit Log" subtitle="Every admin action, who, what, and why" onPress={() => router.push("/admin/audit-log")} testID="admin-nav-audit" />
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  sectionTitle: { color: colors.muted, fontSize: 12, letterSpacing: 1, textTransform: "uppercase", marginBottom: 10, marginTop: 4 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 24 },
  statCard: { width: "31%", backgroundColor: colors.surfaceSecondary, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 6 },
  statIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  statValue: { color: colors.onSurface, fontSize: 20, fontWeight: "600" },
  statLabel: { color: colors.muted, fontSize: 11 },
  navList: { gap: 8 },
  navRow: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.surfaceSecondary, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14, minHeight: 60 },
  navIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.brandSoft, alignItems: "center", justifyContent: "center" },
  navTitle: { color: colors.onSurface, fontSize: 15, fontWeight: "500" },
  navSubtitle: { color: colors.muted, fontSize: 12, marginTop: 2 },
  badge: { backgroundColor: colors.error, borderRadius: 999, minWidth: 22, height: 22, paddingHorizontal: 6, alignItems: "center", justifyContent: "center" },
  badgeText: { color: colors.onError, fontSize: 12, fontWeight: "600" },
}));
