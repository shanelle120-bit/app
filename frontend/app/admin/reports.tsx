import Ionicons from "@react-native-vector-icons/ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { FlatList, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { Avatar, Button, Chip, EmptyState, Loader, ScreenHeader } from "@/src/components/ui";
import { ReasonPromptModal } from "@/src/components/reason-modal";
import { makeStyles, useTheme } from "@/src/theme";
import { useToast } from "@/src/toast";
import type { AdminReport } from "@/src/types";

const TYPE_ICON: Record<string, string> = {
  post: "document-text-outline",
  comment: "chatbubble-outline",
  profile: "person-outline",
  message: "mail-outline",
  mingle_user: "heart-outline",
};

function formatDate(value: string): string {
  const d = new Date(value.endsWith("Z") ? value : `${value}Z`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

type ResolveAction = "dismiss" | "remove_content" | "warn_user";
const RESOLVE_COPY: Record<ResolveAction, { title: string; confirmLabel: string; danger?: boolean; placeholder: string }> = {
  dismiss: { title: "Dismiss this report", confirmLabel: "Dismiss", placeholder: "Why is this being dismissed?" },
  remove_content: { title: "Remove reported content", confirmLabel: "Remove content", danger: true, placeholder: "Moderation note (visible in the audit log)" },
  warn_user: { title: "Warn this member", confirmLabel: "Send warning", placeholder: "Warning message shown to the member" },
};

export default function AdminReportsScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState<"open" | "resolved">("open");
  const [resolving, setResolving] = useState<{ report: AdminReport; action: ResolveAction } | null>(null);

  const query = useQuery({
    queryKey: ["admin", "reports", status],
    queryFn: () => api<{ items: AdminReport[]; count: number }>(`/admin/reports?status=${status}`),
  });

  const resolve = useMutation({
    mutationFn: (vars: { report_id: string; action: ResolveAction; note: string }) =>
      api(`/admin/reports/${vars.report_id}/resolve`, {
        method: "POST",
        body: vars.action === "warn_user" ? { action: vars.action, warn_message: vars.note } : { action: vars.action, note: vars.note },
      }),
    onSuccess: () => {
      toast.show("Report resolved", "success");
      qc.invalidateQueries({ queryKey: ["admin", "reports"] });
      qc.invalidateQueries({ queryKey: ["admin", "dashboard"] });
      setResolving(null);
    },
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  const back = () => (router.canGoBack() ? router.back() : router.replace("/admin"));

  return (
    <View style={styles.root} testID="admin-reports-screen">
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader title="Reports & Moderation" onBack={back} />
      </View>
      <View style={styles.filterRow}>
        <Chip label="Open" selected={status === "open"} onPress={() => setStatus("open")} testID="reports-filter-open" />
        <Chip label="Resolved" selected={status === "resolved"} onPress={() => setStatus("resolved")} testID="reports-filter-resolved" />
      </View>

      {query.isLoading ? (
        <Loader />
      ) : (
        <FlatList
          data={query.data?.items ?? []}
          keyExtractor={(r) => r.report_id}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
          ListEmptyComponent={<EmptyState icon="shield-checkmark-outline" title={status === "open" ? "No open reports" : "No resolved reports yet"} subtitle="The moderation queue is all clear." />}
          renderItem={({ item }) => (
            <View style={styles.card} testID={`report-card-${item.report_id}`}>
              <View style={styles.headRow}>
                <View style={styles.typeBadge}>
                  <Ionicons name={(TYPE_ICON[item.target_type] ?? "flag-outline") as any} size={13} color={colors.brandPrimary} />
                  <Text style={styles.typeBadgeText}>{item.target_type.replace("_", " ")}</Text>
                </View>
                <Text style={styles.date}>{formatDate(item.created_at)}</Text>
              </View>

              <View style={styles.reporterRow}>
                <Avatar uri={item.reporter.avatar_url} name={item.reporter.display_name} size={26} />
                <Text style={styles.reporterText}>
                  <Text style={{ color: colors.onSurface }}>{item.reporter.display_name}</Text> reported this for <Text style={{ color: colors.error }}>{item.reason}</Text>
                </Text>
              </View>
              {item.details ? <Text style={styles.details}>&quot;{item.details}&quot;</Text> : null}

              <View style={styles.contentBox}>
                {item.content.author ? (
                  <Text style={styles.contentAuthor}>
                    {item.content.author.display_name} {item.content.author.username ? `· @${item.content.author.username}` : ""}
                  </Text>
                ) : null}
                <Text style={styles.contentSummary} numberOfLines={4}>{item.content.summary || "(no preview available)"}</Text>
                {item.content.removed ? <Text style={styles.removedTag}>Already removed</Text> : null}
              </View>

              {item.status === "resolved" ? (
                <View style={styles.resolvedRow}>
                  <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                  <Text style={styles.resolvedText}>Resolved · {item.resolution?.replace(/_/g, " ")}{item.resolution_note ? ` — ${item.resolution_note}` : ""}</Text>
                </View>
              ) : (
                <View style={styles.btnRow}>
                  <Button title="Dismiss" small variant="secondary" onPress={() => setResolving({ report: item, action: "dismiss" })} testID={`report-dismiss-${item.report_id}`} />
                  <Button title="Warn user" small variant="secondary" onPress={() => setResolving({ report: item, action: "warn_user" })} testID={`report-warn-${item.report_id}`} />
                  {(item.target_type === "post" || item.target_type === "comment" || item.target_type === "message") ? (
                    <Button title="Remove content" small variant="danger" onPress={() => setResolving({ report: item, action: "remove_content" })} testID={`report-remove-${item.report_id}`} />
                  ) : null}
                </View>
              )}
            </View>
          )}
        />
      )}

      <ReasonPromptModal
        visible={!!resolving}
        title={resolving ? RESOLVE_COPY[resolving.action].title : ""}
        confirmLabel={resolving ? RESOLVE_COPY[resolving.action].confirmLabel : "Confirm"}
        danger={resolving ? RESOLVE_COPY[resolving.action].danger : false}
        placeholder={resolving ? RESOLVE_COPY[resolving.action].placeholder : undefined}
        loading={resolve.isPending}
        onCancel={() => setResolving(null)}
        onConfirm={(note) => resolving && resolve.mutate({ report_id: resolving.report.report_id, action: resolving.action, note })}
      />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  filterRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 14, gap: 8 },
  headRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  typeBadge: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.brandSoft, borderRadius: 999, paddingHorizontal: 9, height: 22 },
  typeBadgeText: { color: colors.brandPrimary, fontSize: 11, fontWeight: "600", textTransform: "uppercase" },
  date: { color: colors.muted, fontSize: 12 },
  reporterRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  reporterText: { color: colors.muted, fontSize: 13, flex: 1, flexShrink: 1 },
  details: { color: colors.onSurfaceSecondary, fontSize: 13, fontStyle: "italic" },
  contentBox: { backgroundColor: colors.surfaceTertiary, borderRadius: 10, padding: 10, gap: 4 },
  contentAuthor: { color: colors.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 },
  contentSummary: { color: colors.onSurfaceSecondary, fontSize: 13, lineHeight: 18 },
  removedTag: { color: colors.warning, fontSize: 11, fontWeight: "600" },
  resolvedRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  resolvedText: { color: colors.success, fontSize: 12, flex: 1 },
  btnRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
}));
