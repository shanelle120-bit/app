import Ionicons from "@react-native-vector-icons/ionicons";
import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter } from "expo-router";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import type { MingleInboxItem } from "@/src/mingle-types";
import { makeStyles, useTheme } from "@/src/theme";

const ITEMS = [
  { key: "discover", label: "Discover", icon: "sparkles-outline", active: "sparkles", route: "/mingle", testID: "mingle-nav-discover" },
  { key: "feed", label: "Mingle Feed", icon: "chatbubbles-outline", active: "chatbubbles", route: "/mingle/feed", testID: "mingle-nav-feed" },
  { key: "connections", label: "Your Mingles", icon: "heart-outline", active: "heart", route: "/mingle/connections", testID: "mingle-connections-button" },
  { key: "inbox", label: "Inbox", icon: "mail-outline", active: "mail", route: "/mingle/inbox", testID: "mingle-inbox-button" },
] as const;

/** Section switcher shown at the bottom of every Single & Mingle screen. */
export function MingleNav({ current }: { current: (typeof ITEMS)[number]["key"] }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const inbox = useQuery({ queryKey: ["mingle", "inbox"], queryFn: () => api<MingleInboxItem[]>("/mingle/inbox"), staleTime: 15_000 });
  const inboxCount = inbox.data?.length ?? 0;

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]} testID="mingle-nav">
      {ITEMS.map((it) => {
        const active = it.key === current;
        return (
          <Pressable
            key={it.key}
            onPress={() => {
              if (pathname !== it.route) router.replace(it.route);
            }}
            style={styles.item}
            testID={it.testID}
          >
            <View>
              <Ionicons name={(active ? it.active : it.icon) as any} size={22} color={active ? colors.brandSecondary : colors.muted} />
              {it.key === "inbox" && inboxCount ? (
                <View style={[styles.badge, { pointerEvents: "none" }]} testID="mingle-inbox-badge">
                  <Text style={styles.badgeText}>{inboxCount > 9 ? "9+" : inboxCount}</Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
              {it.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  bar: { flexDirection: "row", borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surfaceSecondary, paddingTop: 6 },
  item: { flex: 1, alignItems: "center", justifyContent: "center", gap: 3, minHeight: 50 },
  label: { color: colors.muted, fontSize: 11 },
  labelActive: { color: colors.brandSecondary },
  badge: { position: "absolute", top: -6, right: -10, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: colors.brandPrimary, borderWidth: 2, borderColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  badgeText: { color: colors.onBrandPrimary, fontSize: 10, fontWeight: "500" },
}));
