import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import type { AccSession } from "@/src/accountability";
import { SessionDetail } from "@/src/components/accountability-ui";
import { EmptyState, Loader, ScreenHeader } from "@/src/components/ui";
import { makeStyles } from "@/src/theme";

export default function SessionDetailScreen() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({ queryKey: ["accountability", "session", id], queryFn: () => api<AccSession>(`/accountability/sessions/${id}`), enabled: !!id });

  return (
    <View style={styles.root} testID="acc-session-detail-screen">
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader title={q.data ? `Session · ${q.data.date}` : "Session"} onBack={() => (router.canGoBack() ? router.back() : router.replace("/accountability/progress"))} />
      </View>
      {q.isLoading ? (
        <Loader />
      ) : !q.data ? (
        <EmptyState icon="alert-circle-outline" title="Session not found" />
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
          <SessionDetail s={q.data} />
          <Text style={styles.footnote}>Saved {new Date(q.data.created_at).toLocaleString()}. This record and its plan snapshot never change when you edit your plan.</Text>
        </ScrollView>
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  content: { padding: 16, gap: 14 },
  footnote: { color: colors.muted, fontSize: 12, lineHeight: 17, textAlign: "center" },
}));
