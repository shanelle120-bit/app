import Ionicons from "@react-native-vector-icons/ionicons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { FlatList, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { EmptyState, Loader, ScreenHeader } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";
import type { AdminAuditItem } from "@/src/types";

const ACTION_ICON: Record<string, string> = {
  suspend: "pause-circle-outline",
  ban: "ban-outline",
  restore: "checkmark-circle-outline",
  unsuspend: "checkmark-circle-outline",
  grant_admin: "shield-checkmark-outline",
  revoke_admin: "shield-outline",
  premium_grant_complimentary: "gift-outline",
  premium_grant_founding: "trophy-outline",
  premium_revoke: "close-circle-outline",
  add_note: "document-text-outline",
  warn_user: "warning-outline",
  delete_account: "trash-outline",
  remove_post: "eye-off-outline",
  restore_post: "eye-outline",
  remove_comment: "eye-off-outline",
  restore_comment: "eye-outline",
  create_announcement: "megaphone-outline",
  unpin_announcement: "pin-outline",
};

function formatDate(value: string): string {
  const d = new Date(value.endsWith("Z") ? value : `${value}Z`);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function AdminAuditLogScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const query = useQuery({
    queryKey: ["admin", "audit-log"],
    queryFn: () => api<{ items: (AdminAuditItem & { target_type: string; target_label: string | null })[] }>("/admin/audit-log"),
  });

  const back = () => (router.canGoBack() ? router.back() : router.replace("/admin"));

  return (
    <View style={styles.root} testID="admin-audit-log-screen">
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader title="Audit Log" onBack={back} />
      </View>
      {query.isLoading ? (
        <Loader />
      ) : (
        <FlatList
          data={query.data?.items ?? []}
          keyExtractor={(_, i) => String(i)}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
          ListEmptyComponent={<EmptyState icon="time-outline" title="No admin actions yet" />}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={styles.icon}>
                <Ionicons name={(ACTION_ICON[item.action] ?? "ellipse-outline") as any} size={16} color={colors.brandPrimary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.action}>{item.action.replace(/_/g, " ")}{item.target_label ? ` · ${item.target_label}` : ""}</Text>
                {item.reason ? <Text style={styles.reason} numberOfLines={2}>{item.reason}</Text> : null}
                <Text style={styles.meta}>{item.admin_name} · {formatDate(item.created_at)}</Text>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  row: { flexDirection: "row", gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  icon: { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.brandSoft, alignItems: "center", justifyContent: "center" },
  action: { color: colors.onSurface, fontSize: 13, fontWeight: "500", textTransform: "capitalize" },
  reason: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 2, lineHeight: 16 },
  meta: { color: colors.muted, fontSize: 11, marginTop: 3 },
}));
