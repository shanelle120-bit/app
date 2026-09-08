import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { FlatList, RefreshControl, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { accKeys, useAccMe, type AccCandidate } from "@/src/accountability";
import { Avatar, Button, Chip, EmptyState, Loader, ScreenHeader } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";
import { useToast } from "@/src/toast";

export default function FindPartner() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const me = useAccMe();
  const list = useQuery({ queryKey: accKeys.partners, queryFn: () => api<AccCandidate[]>("/accountability/partners") });

  const refresh = () => qc.invalidateQueries({ queryKey: ["accountability"] });
  const connect = useMutation({
    mutationFn: (userId: string) => api("/accountability/requests", { method: "POST", body: { to_user_id: userId } }),
    onSuccess: () => { refresh(); toast.show("Request sent — they'll need to accept first", "success"); },
    onError: (e: Error) => toast.show(e.message, "error"),
  });
  const accept = useMutation({
    mutationFn: (id: string) => api(`/accountability/requests/${id}/accept`, { method: "POST" }),
    onSuccess: () => { refresh(); toast.show("You're now accountability partners 🤝", "success"); router.replace("/accountability"); },
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  return (
    <View style={styles.root} testID="acc-partners-screen">
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader title="Find Your Partner" onBack={() => (router.canGoBack() ? router.back() : router.replace("/accountability"))} />
      </View>
      <FlatList
        data={list.data ?? []}
        keyExtractor={(c) => c.user_id}
        contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 24, gap: 12 }}
        refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => list.refetch()} tintColor={colors.brandSecondary} />}
        ListHeaderComponent={
          !me.data?.profile ? (
            <View style={styles.notice} testID="acc-no-profile-notice">
              <Text style={styles.noticeText}>Add your accountability preferences so partners can find you too. You can browse and connect right away.</Text>
              <Button title="Set my preferences" small variant="secondary" onPress={() => router.push("/accountability/profile")} testID="acc-partners-set-prefs" />
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={styles.card} testID={`acc-candidate-${item.user_id}`}>
            <View style={styles.top}>
              <Avatar uri={item.user.avatar_url} name={item.user.display_name} size={48} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.name} numberOfLines={1}>{item.user.display_name}</Text>
                <Text style={styles.meta} numberOfLines={1}>@{item.user.username}{item.user.trading_style ? ` · ${item.user.trading_style}` : ""}</Text>
              </View>
            </View>
            <Text style={styles.meta}>
              {[item.markets.join(" · "), item.instruments, item.session ? `${item.session} session` : "", item.timezone, item.frequency].filter(Boolean).join("  •  ")}
            </Text>
            {item.working_on ? <Text style={styles.body}><Text style={styles.key}>Working on: </Text>{item.working_on}</Text> : null}
            {item.looking_for.length ? (
              <View style={styles.chips}>
                {item.looking_for.map((l) => <Chip key={l} label={l} selected tone="cyan" />)}
              </View>
            ) : null}
            {item.has_partner ? (
              <Text style={styles.meta}>Already has an accountability partner</Text>
            ) : item.request_received ? (
              <Button title="Accept their request" small icon="checkmark" onPress={() => accept.mutate(item.request_received!)} disabled={accept.isPending} testID={`acc-accept-${item.user_id}`} />
            ) : item.request_sent ? (
              <Button title="Request sent" small variant="secondary" disabled onPress={() => {}} testID={`acc-sent-${item.user_id}`} />
            ) : (
              <Button title="Connect for Accountability" small icon="people-outline" onPress={() => connect.mutate(item.user_id)} disabled={connect.isPending || !!me.data?.partner} testID={`acc-connect-${item.user_id}`} />
            )}
          </View>
        )}
        ListEmptyComponent={list.isLoading ? <Loader /> : <EmptyState icon="people-outline" title="No partners available yet" subtitle="Members who set accountability preferences show up here. Set yours so others can find you." />}
      />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  notice: { backgroundColor: colors.cyanSoft, borderRadius: 14, padding: 14, gap: 10 },
  noticeText: { color: colors.onSurfaceSecondary, fontSize: 13, lineHeight: 19 },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 10 },
  top: { flexDirection: "row", alignItems: "center", gap: 12 },
  name: { color: colors.onSurface, fontSize: 16, fontWeight: "500" },
  meta: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  body: { color: colors.onSurfaceSecondary, fontSize: 14, lineHeight: 20 },
  key: { color: colors.brandSecondary },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
}));
