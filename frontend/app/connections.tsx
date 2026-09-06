import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState, Loader, ScreenHeader } from "@/src/components/ui";
import { UserRow, useUserList } from "@/src/components/user-row";
import { makeStyles } from "@/src/theme";

type Kind = "followers" | "following";

export default function Connections() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; type?: Kind }>();
  const [kind, setKind] = useState<Kind>(params.type === "following" ? "following" : "followers");
  const key = ["connections", params.id, kind];
  const list = useUserList(`/users/${params.id}/${kind}`, key);

  return (
    <View style={styles.root} testID="connections-screen">
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader title="Connections" onBack={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/profile"))} />
      </View>
      <View style={styles.segment}>
        {(["followers", "following"] as Kind[]).map((k) => (
          <Pressable key={k} onPress={() => setKind(k)} style={[styles.segmentItem, kind === k && styles.segmentActive]} testID={`connections-tab-${k}`}>
            <Text style={[styles.segmentText, kind === k && styles.segmentTextActive]}>{k[0].toUpperCase() + k.slice(1)}</Text>
          </Pressable>
        ))}
      </View>
      <FlatList
        data={list.data ?? []}
        keyExtractor={(u) => u.user_id}
        renderItem={({ item }) => <UserRow user={item} queryKey={key} />}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        ListEmptyComponent={list.isLoading ? <Loader /> : <EmptyState icon="people-outline" title={`No ${kind} yet`} />}
      />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  segment: { flexDirection: "row", backgroundColor: colors.surfaceTertiary, borderRadius: 999, padding: 3, margin: 16, alignSelf: "flex-start" },
  segmentItem: { paddingHorizontal: 18, height: 34, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  segmentActive: { backgroundColor: colors.brandPrimary },
  segmentText: { color: colors.muted, fontSize: 13 },
  segmentTextActive: { color: colors.onBrandPrimary },
}));
