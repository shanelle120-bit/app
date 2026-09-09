import Ionicons from "@react-native-vector-icons/ionicons";
import * as Clipboard from "expo-clipboard";
import * as FileSystem from "expo-file-system/legacy";
import { useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import { useQuery } from "@tanstack/react-query";
import React from "react";
import { FlatList, Platform, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { Button, EmptyState, Loader, ScreenHeader } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";
import { useToast } from "@/src/toast";
import type { BillingWaitlistEntry } from "@/src/types";

function formatDate(value: string): string {
  const d = new Date(value.endsWith("Z") ? value : `${value}Z`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function toCsv(items: BillingWaitlistEntry[]): string {
  const rows = [["Name", "Email", "Plan interest", "Joined"]];
  for (const it of items) {
    rows.push([it.display_name ?? "", it.email ?? "", it.plan ?? "Not specified", formatDate(it.created_at)]);
  }
  return rows.map((r) => r.map((c) => `"${(c || "").replace(/"/g, '""')}"`).join(",")).join("\n");
}

function toPlainText(items: BillingWaitlistEntry[]): string {
  return items
    .map((it) => `${it.display_name ?? "Unknown"} <${it.email ?? "no email"}> — ${it.plan ?? "no plan noted"} — joined ${formatDate(it.created_at)}`)
    .join("\n");
}

export default function BillingWaitlist() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const isAdmin = !!user?.is_admin;

  const query = useQuery({
    queryKey: ["admin", "billing-waitlist"],
    queryFn: () => api<{ items: BillingWaitlistEntry[]; count: number }>("/admin/billing-waitlist"),
    enabled: isAdmin,
  });

  const back = () => (router.canGoBack() ? router.back() : router.replace("/(tabs)/profile"));
  const items = query.data?.items ?? [];

  const copyList = async () => {
    await Clipboard.setStringAsync(toPlainText(items));
    toast.show("Waitlist copied to clipboard", "success");
  };

  const exportCsv = async () => {
    try {
      // expo-file-system's writeAsStringAsync/cacheDirectory are not implemented on web,
      // so export there as a clipboard copy of the CSV text instead of a shared file.
      if (Platform.OS === "web") {
        await Clipboard.setStringAsync(toCsv(items));
        toast.show("CSV copied to clipboard — paste into a spreadsheet", "success");
        return;
      }
      const path = `${FileSystem.cacheDirectory}billing-waitlist.csv`;
      await FileSystem.writeAsStringAsync(path, toCsv(items), { encoding: "utf8" });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(path, { mimeType: "text/csv", dialogTitle: "Export billing waitlist" });
      } else {
        await Clipboard.setStringAsync(toCsv(items));
        toast.show("Sharing unavailable — CSV copied to clipboard instead", "info");
      }
    } catch (e: any) {
      toast.show(e.message ?? "Couldn't export the list", "error");
    }
  };

  return (
    <View style={styles.root} testID="admin-billing-waitlist-screen">
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader title="Billing Waitlist" onBack={back} />
      </View>

      {!isAdmin ? (
        <EmptyState icon="lock-closed-outline" title="Admin access required" subtitle="This screen is only visible to designated admin accounts." />
      ) : query.isLoading ? (
        <Loader />
      ) : (
        <>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryText}>
              <Text style={styles.summaryCount}>{query.data?.count ?? 0}</Text> {(query.data?.count ?? 0) === 1 ? "trader" : "traders"} waiting for billing
            </Text>
          </View>
          <View style={styles.actionsRow}>
            <Button title="Copy list" variant="secondary" icon="copy-outline" small onPress={copyList} disabled={!items.length} testID="admin-waitlist-copy-button" style={{ flex: 1 }} />
            <Button title="Export CSV" variant="secondary" icon="share-outline" small onPress={exportCsv} disabled={!items.length} testID="admin-waitlist-export-button" style={{ flex: 1 }} />
          </View>
          <FlatList
            data={items}
            keyExtractor={(it) => it.user_id}
            contentContainerStyle={{ paddingBottom: insets.bottom + 24, paddingHorizontal: 16 }}
            ListEmptyComponent={<EmptyState icon="notifications-outline" title="No one has joined yet" subtitle="Taps on “Notify me when billing launches” will show up here." />}
            renderItem={({ item }) => (
              <View style={styles.row} testID="admin-waitlist-row">
                <View style={styles.rowIcon}>
                  <Ionicons name="person-outline" size={18} color={colors.brandSecondary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName} numberOfLines={1}>{item.display_name ?? "Unknown trader"}</Text>
                  <Text style={styles.rowMeta} numberOfLines={1}>{item.email ?? "No email on file"}</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  {item.plan ? (
                    <View style={styles.planPill}>
                      <Text style={styles.planPillText}>{item.plan}</Text>
                    </View>
                  ) : null}
                  <Text style={styles.rowDate}>{formatDate(item.created_at)}</Text>
                </View>
              </View>
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
  actionsRow: { flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingVertical: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.cyanSoft, alignItems: "center", justifyContent: "center" },
  rowName: { color: colors.onSurface, fontSize: 15, fontWeight: "500" },
  rowMeta: { color: colors.muted, fontSize: 13, marginTop: 2 },
  rowDate: { color: colors.muted, fontSize: 12, marginTop: 4 },
  planPill: { backgroundColor: colors.brandSoft, borderRadius: 999, paddingHorizontal: 8, height: 20, alignItems: "center", justifyContent: "center" },
  planPillText: { color: colors.brandPrimary, fontSize: 10, fontWeight: "600", textTransform: "uppercase" },
}));
