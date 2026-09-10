import Ionicons from "@react-native-vector-icons/ionicons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { ProfileView } from "@/src/components/profile-view";
import { Button, Loader } from "@/src/components/ui";
import { useMembership } from "@/src/hooks/use-membership";
import { LEGAL_DOCS } from "@/src/legal-content";
import { makeStyles, useTheme } from "@/src/theme";
import { useToast } from "@/src/toast";
import type { User } from "@/src/types";

export default function MyProfile() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { user: authUser, logout } = useAuth();
  const { isPremium, openPortal } = useMembership();
  const [menu, setMenu] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const query = useQuery({
    queryKey: ["me"],
    queryFn: () => api<User>(`/users/${authUser!.user_id}`),
    enabled: !!authUser,
  });

  const user = query.data ?? (authUser as User);
  if (!user) return <Loader />;

  const closeMenu = () => {
    setMenu(false);
    setConfirmDelete(false);
  };

  const openLegal = (slug: string) => {
    setMenu(false);
    router.push(`/legal/${slug}`);
  };

  const deleteAccount = async () => {
    setDeleting(true);
    try {
      await api("/auth/me", { method: "DELETE" });
      setMenu(false);
      setConfirmDelete(false);
      await logout();
    } catch (e: any) {
      toast.show(e.message ?? "Couldn't delete account", "error");
      setDeleting(false);
    }
  };

  return (
    <View style={styles.root} testID="profile-screen">
      <ProfileView
        user={{ ...user, is_me: true }}
        isMe
        onRefreshUser={() => query.refetch()}
        headerTop={
          <View style={[styles.topBar, { top: insets.top + 8 }]}>
            <Text style={styles.topTitle}>My profile</Text>
            <Pressable onPress={() => setMenu(true)} style={styles.iconBtn} testID="profile-menu-button">
              <Ionicons name="settings-outline" size={20} color={colors.onSurface} />
            </Pressable>
          </View>
        }
      />
      <Modal visible={menu} transparent animationType="fade" onRequestClose={closeMenu}>
        <View style={styles.backdrop}>
          <Pressable style={{ flex: 1 }} onPress={closeMenu} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16, maxHeight: "82%" }]}>
            {confirmDelete ? (
              <View style={{ padding: 4 }} testID="profile-delete-confirm">
                <Text style={styles.sheetTitle}>Delete your account?</Text>
                <Text style={styles.dangerBody}>
                  This will deactivate your profile, posts, messages, and Single & Mingle presence. This action can&apos;t be undone from the app.
                </Text>
                <Button title="Yes, delete my account" variant="danger" loading={deleting} onPress={deleteAccount} testID="profile-delete-confirm-button" style={{ marginTop: 16 }} />
                <Button title="Cancel" variant="ghost" onPress={() => setConfirmDelete(false)} testID="profile-delete-cancel-button" />
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.sheetTitle}>Account</Text>
                <Text style={styles.sheetMeta}>{user.email}</Text>
                <Pressable style={styles.sheetItem} onPress={() => { setMenu(false); logout(); }} testID="profile-logout-button">
                  <Ionicons name="log-out-outline" size={20} color={colors.error} />
                  <Text style={[styles.sheetText, { color: colors.error }]}>Log out</Text>
                </Pressable>

                <Text style={styles.sectionLabel}>PREMIUM</Text>
                {isPremium ? (
                  <Pressable
                    style={styles.sheetItem}
                    onPress={() => {
                      setMenu(false);
                      openPortal.mutate(undefined, { onError: (e: Error) => toast.show(e.message, "error") });
                    }}
                    disabled={openPortal.isPending}
                    testID="profile-manage-subscription-button"
                  >
                    <Ionicons name="card-outline" size={20} color={colors.muted} />
                    <Text style={styles.sheetText}>Manage Subscription</Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                  </Pressable>
                ) : (
                  <Pressable
                    style={styles.sheetItem}
                    onPress={() => {
                      setMenu(false);
                      router.push("/(tabs)/premium");
                    }}
                    testID="profile-go-premium-button"
                  >
                    <Ionicons name="diamond-outline" size={20} color={colors.muted} />
                    <Text style={styles.sheetText}>Go Premium</Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                  </Pressable>
                )}

                <Text style={styles.sectionLabel}>LEGAL</Text>
                {LEGAL_DOCS.map((doc) => (
                  <Pressable key={doc.slug} style={styles.sheetItem} onPress={() => openLegal(doc.slug)} testID={`profile-legal-${doc.slug}`}>
                    <Ionicons name={doc.icon as any} size={20} color={colors.muted} />
                    <Text style={styles.sheetText} numberOfLines={1}>
                      {doc.title}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                  </Pressable>
                ))}

                {authUser?.is_admin ? (
                  <>
                    <Text style={styles.sectionLabel}>ADMIN</Text>
                    <Pressable
                      style={styles.sheetItem}
                      onPress={() => {
                        setMenu(false);
                        router.push("/admin");
                      }}
                      testID="profile-admin-dashboard"
                    >
                      <Ionicons name="shield-checkmark-outline" size={20} color={colors.muted} />
                      <Text style={styles.sheetText}>Admin Dashboard</Text>
                      <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                    </Pressable>
                  </>
                ) : null}

                <Text style={[styles.sectionLabel, { color: colors.error }]}>DANGER ZONE</Text>
                <Pressable style={styles.sheetItem} onPress={() => openLegal("account-deletion")} testID="profile-deletion-policy-link">
                  <Ionicons name="document-text-outline" size={20} color={colors.muted} />
                  <Text style={styles.sheetText}>Account & Data Deletion Policy</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                </Pressable>
                <Pressable style={styles.sheetItem} onPress={() => setConfirmDelete(true)} testID="profile-delete-account-button">
                  <Ionicons name="trash-outline" size={20} color={colors.error} />
                  <Text style={[styles.sheetText, { color: colors.error }]}>Delete Account</Text>
                </Pressable>

                <Pressable style={[styles.sheetItem, { marginTop: 8 }]} onPress={closeMenu} testID="profile-menu-cancel">
                  <Ionicons name="close-outline" size={20} color={colors.onSurface} />
                  <Text style={styles.sheetText}>Cancel</Text>
                </Pressable>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  topBar: { position: "absolute", left: 16, right: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  topTitle: { color: colors.onSurface, fontSize: 16, fontWeight: "500" },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.overlay, alignItems: "center", justifyContent: "center" },
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.surfaceSecondary, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, gap: 4 },
  sheetTitle: { color: colors.onSurface, fontSize: 18, fontWeight: "500", paddingHorizontal: 12, paddingTop: 8 },
  sheetMeta: { color: colors.muted, fontSize: 13, paddingHorizontal: 12, marginBottom: 8 },
  sheetItem: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52, paddingHorizontal: 12, borderRadius: 12 },
  sheetText: { color: colors.onSurface, fontSize: 16, flex: 1 },
  sectionLabel: { color: colors.muted, fontSize: 12, letterSpacing: 0.6, marginTop: 16, marginBottom: 4, paddingHorizontal: 12 },
  dangerBody: { color: colors.silver, fontSize: 14, lineHeight: 20, marginTop: 10, paddingHorizontal: 12 },
}));
