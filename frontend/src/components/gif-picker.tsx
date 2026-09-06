import Ionicons from "@react-native-vector-icons/ionicons";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import React, { useEffect, useState } from "react";
import { Dimensions, FlatList, Modal, Pressable, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { EmptyState, Loader } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";
import type { Gif } from "@/src/types";

type Props = { visible: boolean; onClose: () => void; onSelect: (gif: Gif) => void };

export function GifPicker({ visible, onClose, onSelect }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["gifs", debounced],
    queryFn: () =>
      api<{ items: Gif[] }>(debounced ? `/gifs/search?q=${encodeURIComponent(debounced.slice(0, 50))}&limit=30` : "/gifs/trending?limit=30"),
    enabled: visible,
    staleTime: 60_000,
  });

  const colWidth = (Dimensions.get("window").width - 16 * 2 - 8) / 2;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" transparent={false}>
      <View style={[styles.root, { paddingTop: insets.top + 8 }]} testID="gif-picker">
        <View style={styles.header}>
          <Text style={styles.title}>Choose a GIF</Text>
          <Pressable onPress={onClose} hitSlop={8} style={styles.close} testID="gif-picker-close">
            <Ionicons name="close" size={22} color={colors.onSurface} />
          </Pressable>
        </View>
        <View style={styles.searchRow}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search GIPHY"
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
            autoFocus
            returnKeyType="search"
            maxLength={50}
            testID="gif-search-input"
          />
          {query ? (
            <Pressable onPress={() => setQuery("")} hitSlop={8} testID="gif-search-clear">
              <Ionicons name="close-circle" size={18} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>
        <Text style={styles.sectionLabel}>{debounced ? `Results for "${debounced}"` : "Trending"}</Text>
        {isLoading ? (
          <Loader testID="gif-loading" />
        ) : isError ? (
          <EmptyState
            icon="cloud-offline-outline"
            title="GIFs unavailable"
            subtitle={(error as Error)?.message ?? "Try again"}
            action={
              <Pressable onPress={() => refetch()} style={styles.retry} testID="gif-retry">
                <Text style={styles.retryText}>Retry</Text>
              </Pressable>
            }
          />
        ) : (
          <FlatList
            data={data?.items ?? []}
            keyExtractor={(g) => g.id}
            numColumns={2}
            columnWrapperStyle={{ gap: 8 }}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: insets.bottom + 48 }}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<EmptyState icon="happy-outline" title="No GIFs found" subtitle="Try another search" />}
            renderItem={({ item, index }) => (
              <Pressable
                onPress={() => onSelect(item)}
                style={[styles.cell, { width: colWidth, height: Math.min(260, Math.max(110, (colWidth * item.height) / item.width)) }]}
                testID={`gif-item-${index}`}
              >
                <Image source={{ uri: item.preview_url }} style={{ width: "100%", height: "100%" }} contentFit="cover" transition={120} />
              </Pressable>
            )}
          />
        )}
        <View style={[styles.attribution, { paddingBottom: insets.bottom + 8 }]}>
          <Text style={styles.attributionText}>Powered by GIPHY</Text>
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, height: 48 },
  title: { color: colors.onSurface, fontSize: 20, fontWeight: "500" },
  close: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 48,
  },
  searchInput: { flex: 1, color: colors.onSurface, fontSize: 16 },
  sectionLabel: { color: colors.muted, fontSize: 12, letterSpacing: 1, textTransform: "uppercase", marginHorizontal: 16, marginVertical: 12 },
  cell: { borderRadius: 12, overflow: "hidden", backgroundColor: colors.surfaceTertiary },
  attribution: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center", paddingTop: 8, backgroundColor: colors.overlay },
  attributionText: { color: colors.muted, fontSize: 12, letterSpacing: 0.5 },
  retry: { paddingHorizontal: 20, height: 40, borderRadius: 999, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  retryText: { color: colors.onSurface, fontSize: 14 },
}));
