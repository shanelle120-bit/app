import Ionicons from "@react-native-vector-icons/ionicons";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { ProfileView } from "@/src/components/profile-view";
import { Button, EmptyState, Loader } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";
import type { User } from "@/src/types";

export default function UserProfile() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user: me } = useAuth();
  const isMe = me?.user_id === id;

  const query = useQuery({ queryKey: isMe ? ["me"] : ["user", id], queryFn: () => api<User>(`/users/${id}`), enabled: !!id });

  const back = () => (router.canGoBack() ? router.back() : router.replace("/(tabs)"));

  return (
    <View style={styles.root} testID="user-profile-screen">
      {query.isLoading ? (
        <View style={{ paddingTop: insets.top + 60 }}>
          <Loader />
        </View>
      ) : query.isError || !query.data ? (
        <View style={{ paddingTop: insets.top + 60 }}>
          <EmptyState icon="person-remove-outline" title="Trader not found" action={<Button title="Go back" small variant="secondary" onPress={back} />} />
        </View>
      ) : (
        <ProfileView
          user={{ ...query.data, is_me: isMe }}
          isMe={isMe}
          onRefreshUser={() => query.refetch()}
          headerTop={
            <View style={[styles.topBar, { top: insets.top + 8 }]}>
              <Pressable onPress={back} style={styles.iconBtn} testID="user-back-button">
                <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
              </Pressable>
              <Text style={styles.topTitle}>@{query.data.username}</Text>
              <View style={{ width: 40 }} />
            </View>
          }
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  topBar: { position: "absolute", left: 16, right: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  topTitle: { color: colors.onSurface, fontSize: 15, fontWeight: "500" },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.overlay, alignItems: "center", justifyContent: "center" },
}));
