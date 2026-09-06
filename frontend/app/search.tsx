import Ionicons from "@react-native-vector-icons/ionicons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { FlatList, Pressable, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState, IconButton, Loader } from "@/src/components/ui";
import { UserRow, useUserList } from "@/src/components/user-row";
import { makeStyles, useTheme } from "@/src/theme";

export default function Search() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const key = ["users", debounced];
  const list = useUserList(`/users?q=${encodeURIComponent(debounced)}`, key);
  const isChat = mode === "chat";

  return (
    <View style={styles.root} testID="search-screen">
      <View style={[styles.header, { paddingTop: insets.top + 4 }]}>
        <IconButton name="chevron-back" onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)"))} testID="search-back-button" />
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={isChat ? "Find a trader to message" : "Search traders by name or @handle"}
            placeholderTextColor={colors.muted}
            style={styles.input}
            autoFocus
            autoCapitalize="none"
            testID="search-input"
          />
          {query ? (
            <Pressable onPress={() => setQuery("")} hitSlop={8} testID="search-clear">
              <Ionicons name="close-circle" size={18} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>
      </View>
      <Text style={styles.sectionLabel}>{debounced ? "Results" : "Suggested traders"}</Text>
      <FlatList
        data={list.data ?? []}
        keyExtractor={(u) => u.user_id}
        renderItem={({ item }) => <UserRow user={item} mode={isChat ? "chat" : "follow"} queryKey={key} />}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        ListEmptyComponent={list.isLoading ? <Loader /> : <EmptyState icon="search-outline" title="No traders found" subtitle="Try a different name or handle." />}
      />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  searchBox: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 14, height: 44, marginRight: 8 },
  input: { flex: 1, color: colors.onSurface, fontSize: 15 },
  sectionLabel: { color: colors.muted, fontSize: 12, letterSpacing: 1, textTransform: "uppercase", paddingHorizontal: 16, paddingVertical: 12 },
}));
