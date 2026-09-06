import Ionicons from "@react-native-vector-icons/ionicons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { api, parseDate } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { Avatar } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";
import type { Story } from "@/src/types";

export function StoriesRow() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const { data } = useQuery({ queryKey: ["stories"], queryFn: () => api<Story[]>("/stories"), staleTime: 30_000 });

  const isRecent = (s: Story) => !!s.latest_post_at && Date.now() - parseDate(s.latest_post_at).getTime() < 48 * 3600 * 1000;

  return (
    <View style={styles.wrap} testID="stories-row">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.content}>
        <Pressable style={styles.item} onPress={() => router.push("/(tabs)/create")} testID="story-create">
          <View style={styles.yourRing}>
            <Avatar uri={user?.avatar_url} name={user?.display_name} size={56} />
            <View style={styles.plus}>
              <Ionicons name="add" size={14} color={colors.onBrandPrimary} />
            </View>
          </View>
          <Text style={styles.label} numberOfLines={1}>
            You
          </Text>
        </Pressable>
        {(data ?? []).map((s) => (
          <Pressable
            key={s.user_id}
            style={styles.item}
            onPress={() => router.push(s.latest_post_id && isRecent(s) ? `/post/${s.latest_post_id}` : `/user/${s.user_id}`)}
            testID={`story-${s.username}`}
          >
            <Avatar uri={s.avatar_url} name={s.display_name} size={56} ring={isRecent(s)} />
            <Text style={styles.label} numberOfLines={1}>
              {s.display_name.split(" ")[0]}
            </Text>
          </Pressable>
        ))}
        <Pressable style={styles.item} onPress={() => router.push("/search")} testID="story-discover">
          <View style={styles.discover}>
            <Ionicons name="compass-outline" size={24} color={colors.brandSecondary} />
          </View>
          <Text style={styles.label} numberOfLines={1}>
            Discover
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  wrap: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: 12 },
  content: { paddingHorizontal: 12, gap: 14 },
  item: { alignItems: "center", width: 66, gap: 6 },
  label: { color: colors.silver, fontSize: 12 },
  yourRing: { width: 62, height: 62, alignItems: "center", justifyContent: "center" },
  plus: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.brandPrimary,
    borderWidth: 2,
    borderColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  discover: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
}));
