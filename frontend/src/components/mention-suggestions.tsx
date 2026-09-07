import { useQuery } from "@tanstack/react-query";
import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { api } from "@/src/api";
import { Avatar } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";
import type { AuthorSummary, User } from "@/src/types";

const TOKEN_RX = /(^|\s)@([a-zA-Z0-9_]{1,24})$/;
const HANDLE_RX = /@([a-zA-Z0-9_]{3,24})/g;

/**
 * Shared @mention state for any composer (posts, comments, edit post).
 * Tracks which accounts were explicitly picked so only real users become mentions.
 */
export function useMentions(text: string, cursor: number, initial?: AuthorSummary[]) {
  const [mentioned, setMentioned] = useState<Record<string, string>>(() =>
    Object.fromEntries((initial ?? []).filter((u) => u.username).map((u) => [u.username.toLowerCase(), u.user_id])),
  );
  const match = useMemo(() => text.slice(0, cursor).match(TOKEN_RX), [text, cursor]);
  const query = match ? match[2] : null;

  const suggestions = useQuery({
    queryKey: ["users", query ?? ""],
    queryFn: () => api<User[]>(`/users?q=${encodeURIComponent(query ?? "")}&limit=6`),
    enabled: query !== null,
    staleTime: 30_000,
  });

  /** Replace the token under the caret with the chosen handle. Returns the new text + caret. */
  const insert = useCallback(
    (u: User): { text: string; cursor: number } | null => {
      if (!match || !u.username) return null;
      const start = cursor - match[0].length + match[1].length;
      const before = text.slice(0, start);
      const after = text.slice(cursor);
      const next = `${before}@${u.username} ${after.startsWith(" ") ? after.slice(1) : after}`;
      setMentioned((m) => ({ ...m, [u.username!.toLowerCase()]: u.user_id }));
      return { text: next, cursor: start + u.username.length + 2 };
    },
    [match, cursor, text],
  );

  /** user_ids of picked accounts whose @handle is still present in the text. */
  const selectedIds = useCallback(
    (currentText: string) => {
      const typed = new Set((currentText.match(HANDLE_RX) ?? []).map((t) => t.slice(1).toLowerCase()));
      return Object.entries(mentioned)
        .filter(([username]) => typed.has(username))
        .map(([, id]) => id);
    },
    [mentioned],
  );

  const reset = useCallback(() => setMentioned({}), []);

  return { query, suggestions, insert, selectedIds, reset };
}

type Props = { query: string | null; suggestions: ReturnType<typeof useMentions>["suggestions"]; onSelect: (u: User) => void; testID?: string };

export function MentionSuggestions({ query, suggestions, onSelect, testID = "mention-suggestions" }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  if (query === null) return null;
  const items = suggestions.data ?? [];
  return (
    <View style={styles.wrap} testID={testID}>
      {suggestions.isLoading ? (
        <ActivityIndicator color={colors.brandPrimary} style={{ padding: 12 }} />
      ) : items.length === 0 ? (
        <Text style={styles.empty}>No traders match “@{query}”</Text>
      ) : (
        items.map((u) => (
          <Pressable key={u.user_id} onPress={() => onSelect(u)} style={styles.row} testID={`mention-option-${u.username}`}>
            <Avatar uri={u.avatar_url} name={u.display_name} size={32} />
            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={1}>
                {u.display_name}
              </Text>
              <Text style={styles.handle} numberOfLines={1}>
                @{u.username}
              </Text>
            </View>
          </Pressable>
        ))
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  wrap: { backgroundColor: colors.surfaceSecondary, borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: 4, maxHeight: 240 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, minHeight: 48 },
  name: { color: colors.onSurface, fontSize: 14, fontWeight: "500" },
  handle: { color: colors.muted, fontSize: 12 },
  empty: { color: colors.muted, fontSize: 13, paddingHorizontal: 16, paddingVertical: 12 },
}));
