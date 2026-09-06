import Ionicons from "@react-native-vector-icons/ionicons";
import { useQuery } from "@tanstack/react-query";
import React, { useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { ProfileView } from "@/src/components/profile-view";
import { Loader } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";
import type { User } from "@/src/types";

export default function MyProfile() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user: authUser, logout } = useAuth();
  const [menu, setMenu] = useState(false);

  const query = useQuery({
    queryKey: ["me"],
    queryFn: () => api<User>(`/users/${authUser!.user_id}`),
    enabled: !!authUser,
  });

  const user = query.data ?? (authUser as User);
  if (!user) return <Loader />;

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
      <Modal visible={menu} transparent animationType="fade" onRequestClose={() => setMenu(false)}>
        <Pressable style={styles.backdrop} onPress={() => setMenu(false)}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <Text style={styles.sheetTitle}>Account</Text>
            <Text style={styles.sheetMeta}>{user.email}</Text>
            <Pressable
              style={styles.sheetItem}
              onPress={() => {
                setMenu(false);
                logout();
              }}
              testID="profile-logout-button"
            >
              <Ionicons name="log-out-outline" size={20} color={colors.error} />
              <Text style={[styles.sheetText, { color: colors.error }]}>Log out</Text>
            </Pressable>
            <Pressable style={styles.sheetItem} onPress={() => setMenu(false)} testID="profile-menu-cancel">
              <Ionicons name="close-outline" size={20} color={colors.onSurface} />
              <Text style={styles.sheetText}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
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
  sheetText: { color: colors.onSurface, fontSize: 16 },
}));
