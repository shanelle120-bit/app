import Ionicons from "@react-native-vector-icons/ionicons";
import { useQuery } from "@tanstack/react-query";
import React from "react";
import { Text, View } from "react-native";

import { api } from "@/src/api";
import { makeStyles, useTheme } from "@/src/theme";
import type { Announcement } from "@/src/types";

/** Official pinned Level Up update, shown above the feed. Read-only for members —
 * does not touch normal post creation/rendering. Returns null when nothing is pinned. */
export function AnnouncementBanner() {
  const styles = useStyles();
  const { colors } = useTheme();
  const query = useQuery({
    queryKey: ["announcement", "active"],
    queryFn: () => api<Announcement | null>("/announcements/active"),
    staleTime: 60_000,
  });

  if (!query.data) return null;
  const a = query.data;

  return (
    <View style={styles.banner} testID="announcement-banner">
      <View style={styles.icon}>
        <Ionicons name="megaphone" size={16} color={colors.brandPrimary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{a.title}</Text>
        <Text style={styles.body} numberOfLines={3}>{a.body}</Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  banner: { flexDirection: "row", gap: 10, backgroundColor: colors.brandSoft, borderWidth: 1, borderColor: colors.brandPrimary, borderRadius: 14, padding: 12, marginHorizontal: 16, marginTop: 12 },
  icon: { width: 30, height: 30, borderRadius: 10, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  title: { color: colors.onSurface, fontSize: 13, fontWeight: "600" },
  body: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 2, lineHeight: 16 },
}));
