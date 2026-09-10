import Ionicons from "@react-native-vector-icons/ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { ReasonPromptModal } from "@/src/components/reason-modal";
import { Avatar, Button, EmptyState, Loader, ScreenHeader } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";
import { useToast } from "@/src/toast";
import type { AdminUserDetail } from "@/src/types";

type ActionKind =
  | "suspend" | "ban" | "restore"
  | "grant-admin" | "revoke-admin"
  | "grant-complimentary" | "grant-founding" | "revoke-premium"
  | "delete-account";

const ACTION_COPY: Record<ActionKind, { title: string; confirmLabel: string; danger?: boolean; description?: string }> = {
  suspend: { title: "Suspend this account", confirmLabel: "Suspend", danger: true, description: "The member will be logged out immediately and cannot log back in until unsuspended." },
  ban: { title: "Ban this account", confirmLabel: "Ban", danger: true, description: "The member will be logged out immediately and permanently blocked from logging in." },
  restore: { title: "Restore this account", confirmLabel: "Restore to active", description: "The member will be able to log in again." },
  "grant-admin": { title: "Grant Admin access", confirmLabel: "Grant admin", description: "This member will be able to access all Admin tools." },
  "revoke-admin": { title: "Revoke Admin access", confirmLabel: "Revoke admin", danger: true },
  "grant-complimentary": { title: "Grant complimentary Premium", confirmLabel: "Grant Premium", description: "Unlocks Mingle, Accountability & Trading Only — no Stripe subscription is created." },
  "grant-founding": { title: "Grant Founding Premium", confirmLabel: "Grant Founding status", description: "Lifetime complimentary Premium + the Founding Member badge. No Stripe subscription is created." },
  "revoke-premium": { title: "Revoke complimentary Premium", confirmLabel: "Revoke Premium", danger: true, description: "Only works for complimentary grants — real Stripe subscriptions must be managed in Stripe." },
  "delete-account": { title: "Delete this account", confirmLabel: "Delete account", danger: true, description: "Per our Account & Data Deletion Policy. The account will be deactivated and the member logged out. This action should be confirmed before proceeding." },
};

function formatDate(value: string | null): string {
  if (!value) return "Unknown";
  const d = new Date(value.endsWith("Z") ? value : `${value}Z`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function AdminUserDetailScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const { user: me } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [action, setAction] = useState<ActionKind | null>(null);
  const [noteText, setNoteText] = useState("");

  const query = useQuery({
    queryKey: ["admin", "user", id],
    queryFn: () => api<AdminUserDetail>(`/admin/users/${id}`),
    enabled: !!id,
  });

  const back = () => (router.canGoBack() ? router.back() : router.replace("/admin/users"));
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin", "user", id] });
    qc.invalidateQueries({ queryKey: ["admin", "users"] });
    qc.invalidateQueries({ queryKey: ["admin", "dashboard"] });
  };

  const accountStatus = useMutation({
    mutationFn: (vars: { status: "active" | "suspended" | "banned"; reason: string }) =>
      api(`/admin/users/${id}/account-status`, { method: "POST", body: vars }),
    onSuccess: () => {
      toast.show("Account status updated", "success");
      invalidate();
      setAction(null);
    },
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  const adminRole = useMutation({
    mutationFn: (vars: { grant: boolean; reason: string }) => api(`/admin/users/${id}/admin-role`, { method: "POST", body: vars }),
    onSuccess: () => {
      toast.show("Admin role updated", "success");
      invalidate();
      setAction(null);
    },
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  const premiumGrant = useMutation({
    mutationFn: (vars: { plan: "complimentary" | "founding"; reason: string }) => api(`/admin/users/${id}/premium-grant`, { method: "POST", body: vars }),
    onSuccess: () => {
      toast.show("Premium granted", "success");
      invalidate();
      setAction(null);
    },
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  const premiumRevoke = useMutation({
    mutationFn: (vars: { reason: string }) => api(`/admin/users/${id}/premium-revoke`, { method: "POST", body: { ...vars, revoke_founding: false } }),
    onSuccess: () => {
      toast.show("Premium revoked", "success");
      invalidate();
      setAction(null);
    },
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  const deleteAccount = useMutation({
    mutationFn: (vars: { reason: string }) => api(`/admin/users/${id}/delete-account`, { method: "POST", body: vars }),
    onSuccess: () => {
      toast.show("Account deleted", "success");
      invalidate();
      setAction(null);
    },
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  const addNote = useMutation({
    mutationFn: () => api(`/admin/users/${id}/notes`, { method: "POST", body: { text: noteText.trim() } }),
    onSuccess: () => {
      setNoteText("");
      invalidate();
    },
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  const handleConfirm = (reason: string) => {
    if (!action) return;
    switch (action) {
      case "suspend": return accountStatus.mutate({ status: "suspended", reason });
      case "ban": return accountStatus.mutate({ status: "banned", reason });
      case "restore": return accountStatus.mutate({ status: "active", reason });
      case "grant-admin": return adminRole.mutate({ grant: true, reason });
      case "revoke-admin": return adminRole.mutate({ grant: false, reason });
      case "grant-complimentary": return premiumGrant.mutate({ plan: "complimentary", reason });
      case "grant-founding": return premiumGrant.mutate({ plan: "founding", reason });
      case "revoke-premium": return premiumRevoke.mutate({ reason });
      case "delete-account": return deleteAccount.mutate({ reason });
    }
  };

  const anyActionLoading = accountStatus.isPending || adminRole.isPending || premiumGrant.isPending || premiumRevoke.isPending || deleteAccount.isPending;
  const u = query.data;
  const isSelf = me?.user_id === id;

  return (
    <View style={styles.root} testID="admin-user-detail-screen">
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader title="Account" onBack={back} />
      </View>
      {query.isLoading ? (
        <Loader />
      ) : !u ? (
        <EmptyState icon="alert-circle-outline" title="User not found" />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}>
          {/* Profile summary */}
          <View style={styles.profileRow}>
            <Avatar uri={u.avatar_url} name={u.display_name ?? "?"} size={56} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={styles.name} numberOfLines={1}>{u.display_name ?? "Unknown"}</Text>
                {u.is_founding_member ? <Ionicons name="trophy" size={14} color={colors.warning} /> : null}
                {u.is_admin ? <Ionicons name="shield-checkmark" size={14} color={colors.brandPrimary} /> : null}
              </View>
              <Text style={styles.meta}>{u.username ? `@${u.username}` : ""}</Text>
              <Text style={styles.meta}>{u.email}</Text>
              <Text style={styles.metaSmall}>Joined {formatDate(u.created_at)}</Text>
            </View>
          </View>

          {/* Account status */}
          <Text style={styles.sectionTitle}>Account status</Text>
          <View style={styles.card}>
            <View style={styles.statusRow}>
              <View style={[styles.statusPill, u.account_status !== "active" && { backgroundColor: colors.errorSoft }]}>
                <Text style={[styles.statusPillText, u.account_status !== "active" && { color: colors.error }]}>{u.account_status}</Text>
              </View>
              {u.account_status_reason ? <Text style={styles.metaSmall} numberOfLines={2}>{u.account_status_reason}</Text> : null}
            </View>
            <View style={styles.btnRow}>
              {u.account_status === "active" ? (
                <>
                  <Button title="Suspend" small variant="secondary" onPress={() => setAction("suspend")} disabled={isSelf} testID="admin-action-suspend" />
                  <Button title="Ban" small variant="danger" onPress={() => setAction("ban")} disabled={isSelf} testID="admin-action-ban" />
                </>
              ) : (
                <Button title="Restore account" small variant="primary" onPress={() => setAction("restore")} testID="admin-action-restore" />
              )}
            </View>
            {isSelf ? <Text style={styles.metaSmall}>You cannot suspend, ban, or restore your own account.</Text> : null}
          </View>

          {/* Premium / Membership */}
          <Text style={styles.sectionTitle}>Premium & billing</Text>
          <View style={styles.card}>
            <View style={styles.kvRow}><Text style={styles.k}>Tier</Text><Text style={styles.v}>{u.membership.tier}</Text></View>
            <View style={styles.kvRow}><Text style={styles.k}>Plan</Text><Text style={styles.v}>{u.membership.plan ?? "—"}</Text></View>
            <View style={styles.kvRow}><Text style={styles.k}>Source</Text><Text style={styles.v}>{u.membership.source ?? "—"}</Text></View>
            <View style={styles.kvRow}><Text style={styles.k}>Subscription status</Text><Text style={styles.v}>{u.subscription_status ?? "—"}</Text></View>
            <View style={styles.kvRow}><Text style={styles.k}>Founding Member</Text><Text style={styles.v}>{u.is_founding_member ? "Yes" : "No"}</Text></View>
            <View style={styles.kvRow}><Text style={styles.k}>Complimentary</Text><Text style={styles.v}>{u.is_complimentary_premium ? "Yes" : "No"}</Text></View>
            <View style={styles.kvRow}><Text style={styles.k}>Stripe customer</Text><Text style={styles.v} numberOfLines={1}>{u.stripe_customer_id ?? "—"}</Text></View>

            {u.membership.tier === "premium" && u.membership.source === "stripe" ? (
              <Text style={styles.metaSmall}>This member has a real Stripe subscription — manage billing in Stripe, not here.</Text>
            ) : (
              <View style={styles.btnRow}>
                {u.membership.tier !== "premium" ? (
                  <>
                    <Button title="Grant Premium" small variant="secondary" onPress={() => setAction("grant-complimentary")} testID="admin-action-grant-complimentary" />
                    <Button title="Grant Founding" small variant="primary" onPress={() => setAction("grant-founding")} testID="admin-action-grant-founding" />
                  </>
                ) : (
                  <Button title="Revoke Premium" small variant="danger" onPress={() => setAction("revoke-premium")} testID="admin-action-revoke-premium" />
                )}
              </View>
            )}
          </View>

          {/* Admin role */}
          <Text style={styles.sectionTitle}>Admin role</Text>
          <View style={styles.card}>
            <View style={styles.kvRow}><Text style={styles.k}>Is admin</Text><Text style={styles.v}>{u.is_admin ? "Yes" : "No"}</Text></View>
            <View style={styles.btnRow}>
              {u.is_admin ? (
                <Button title="Revoke admin" small variant="danger" onPress={() => setAction("revoke-admin")} disabled={isSelf} testID="admin-action-revoke-admin" />
              ) : (
                <Button title="Grant admin" small variant="secondary" onPress={() => setAction("grant-admin")} testID="admin-action-grant-admin" />
              )}
            </View>
            {isSelf ? <Text style={styles.metaSmall}>You cannot revoke your own admin access.</Text> : null}
          </View>

          {/* Safety */}
          <Text style={styles.sectionTitle}>Safety overview</Text>
          <View style={styles.card}>
            <View style={styles.kvRow}><Text style={styles.k}>Reports filed by this member</Text><Text style={styles.v}>{u.safety.reports_filed}</Text></View>
            <View style={styles.kvRow}><Text style={styles.k}>Reports received</Text><Text style={styles.v}>{u.safety.reports_received}</Text></View>
            <View style={styles.kvRow}><Text style={styles.k}>Mingle blocks given</Text><Text style={styles.v}>{u.safety.mingle_blocks_given}</Text></View>
            <View style={styles.kvRow}><Text style={styles.k}>Mingle blocks received</Text><Text style={styles.v}>{u.safety.mingle_blocks_received}</Text></View>
          </View>

          {/* Admin notes */}
          <Text style={styles.sectionTitle}>Admin notes (private)</Text>
          <View style={styles.card}>
            <View style={styles.noteInputRow}>
              <TextInput
                value={noteText}
                onChangeText={setNoteText}
                placeholder="Add an internal note…"
                placeholderTextColor={colors.muted}
                style={styles.noteInput}
                multiline
                testID="admin-note-input"
              />
              <Button title="Add" small variant="secondary" onPress={() => addNote.mutate()} disabled={noteText.trim().length < 1} loading={addNote.isPending} testID="admin-note-submit" />
            </View>
            {u.notes.length === 0 ? (
              <Text style={styles.metaSmall}>No notes yet.</Text>
            ) : (
              u.notes.map((n) => (
                <View key={n.note_id} style={styles.noteItem}>
                  <Text style={styles.noteText}>{n.text}</Text>
                  <Text style={styles.metaSmall}>{n.author_name} · {formatDate(n.created_at)}</Text>
                </View>
              ))
            )}
          </View>

          {/* Moderation history / audit trail */}
          <Text style={styles.sectionTitle}>Moderation history</Text>
          <View style={styles.card}>
            {u.history.length === 0 ? (
              <Text style={styles.metaSmall}>No admin actions recorded for this account yet.</Text>
            ) : (
              u.history.map((h, i) => (
                <View key={i} style={styles.historyItem}>
                  <Text style={styles.historyAction}>{h.action.replace(/_/g, " ")}</Text>
                  {h.reason ? <Text style={styles.metaSmall}>{h.reason}</Text> : null}
                  <Text style={styles.metaSmall}>{h.admin_name} · {formatDate(h.created_at)}</Text>
                </View>
              ))
            )}
          </View>

          {/* Danger zone */}
          {!isSelf && !u.deleted ? (
            <>
              <Text style={[styles.sectionTitle, { color: colors.error }]}>Danger zone</Text>
              <View style={[styles.card, { borderColor: colors.error }]}>
                <Button title="Delete account" small variant="danger" onPress={() => setAction("delete-account")} testID="admin-action-delete-account" />
              </View>
            </>
          ) : u.deleted ? (
            <View style={styles.card}><Text style={styles.metaSmall}>This account has already been deleted.</Text></View>
          ) : null}
        </ScrollView>
      )}

      <ReasonPromptModal
        visible={!!action}
        title={action ? ACTION_COPY[action].title : ""}
        confirmLabel={action ? ACTION_COPY[action].confirmLabel : "Confirm"}
        danger={action ? ACTION_COPY[action].danger : false}
        description={action ? ACTION_COPY[action].description : undefined}
        loading={anyActionLoading}
        onCancel={() => setAction(null)}
        onConfirm={handleConfirm}
      />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  profileRow: { flexDirection: "row", gap: 14, marginBottom: 20 },
  name: { color: colors.onSurface, fontSize: 18, fontWeight: "600" },
  meta: { color: colors.muted, fontSize: 13, marginTop: 2 },
  metaSmall: { color: colors.muted, fontSize: 12, marginTop: 4, lineHeight: 16 },
  sectionTitle: { color: colors.muted, fontSize: 12, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8, marginTop: 4 },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 20, gap: 6 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" },
  statusPill: { backgroundColor: colors.brandSoft, borderRadius: 999, paddingHorizontal: 10, height: 24, alignItems: "center", justifyContent: "center" },
  statusPillText: { color: colors.brandPrimary, fontSize: 11, fontWeight: "600", textTransform: "uppercase" },
  btnRow: { flexDirection: "row", gap: 10, flexWrap: "wrap", marginTop: 4 },
  kvRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  k: { color: colors.muted, fontSize: 13 },
  v: { color: colors.onSurface, fontSize: 13, fontWeight: "500", flexShrink: 1, textAlign: "right" },
  noteInputRow: { flexDirection: "row", gap: 8, alignItems: "flex-end", marginBottom: 8 },
  noteInput: { flex: 1, color: colors.onSurface, fontSize: 14, backgroundColor: colors.surfaceTertiary, borderRadius: 10, padding: 10, minHeight: 44, maxHeight: 100 },
  noteItem: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, marginTop: 4 },
  noteText: { color: colors.onSurfaceSecondary, fontSize: 13, lineHeight: 18 },
  historyItem: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, marginTop: 4 },
  historyAction: { color: colors.onSurface, fontSize: 13, fontWeight: "500", textTransform: "capitalize" },
}));
