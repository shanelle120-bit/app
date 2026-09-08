import Ionicons from "@react-native-vector-icons/ionicons";
import React, { useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { REACTIONS } from "@/src/hooks/use-post-actions";
import { makeStyles, useTheme } from "@/src/theme";
import type { Post } from "@/src/types";

type Props = { post: Post; onReact: (reaction: string | null) => void };

/**
 * Compact reaction control: shows the member's own reaction (or a heart outline), the top emojis and the total.
 * Tap or long-press opens a small picker with the 8 reactions; picking the current one removes it.
 */
export function ReactionControl({ post, onReact }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const mine = post.my_reaction ?? (post.liked ? "💜" : null);
  const top = Object.entries(post.reactions ?? {})
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([e]) => e);

  const choose = (emoji: string) => {
    setOpen(false);
    onReact(emoji === mine ? null : emoji);
  };

  return (
    <>
      <Pressable onPress={() => setOpen(true)} onLongPress={() => setOpen(true)} style={[styles.control, !!mine && styles.controlActive]} hitSlop={6} testID={`post-react-${post.post_id}`}>
        {mine ? (
          <Text style={styles.mine} testID={`post-my-reaction-${post.post_id}`}>{mine}</Text>
        ) : (
          <Ionicons name="heart-outline" size={21} color={colors.silver} />
        )}
        {top.length ? (
          <Text style={styles.summary} numberOfLines={1} testID={`post-reaction-summary-${post.post_id}`}>
            {top.filter((e) => e !== mine).join("")}
          </Text>
        ) : null}
        <Text style={[styles.count, !!mine && { color: colors.brandPrimary }]}>{post.likes_count || ""}</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} testID="reaction-picker-backdrop">
          <Animated.View entering={FadeInDown.duration(200)} style={[styles.picker, { marginBottom: insets.bottom + 24 }]} testID="reaction-picker">
            <View style={styles.row}>
              {REACTIONS.map((e) => (
                <Pressable key={e} onPress={() => choose(e)} style={[styles.emojiBtn, e === mine && styles.emojiSelected]} testID={`reaction-option-${e}`}>
                  <Text style={styles.emoji}>{e}</Text>
                </Pressable>
              ))}
            </View>
            {mine ? (
              <Pressable onPress={() => choose(mine)} style={styles.remove} testID="reaction-remove">
                <Ionicons name="close-circle-outline" size={16} color={colors.muted} />
                <Text style={styles.removeText}>Remove my reaction</Text>
              </Pressable>
            ) : (
              <Text style={styles.hint}>Pick one reaction</Text>
            )}
          </Animated.View>
        </Pressable>
      </Modal>
    </>
  );
}

const useStyles = makeStyles((colors) => ({
  control: { flexDirection: "row", alignItems: "center", gap: 5, minHeight: 44, minWidth: 44, paddingHorizontal: 8, borderRadius: 999, justifyContent: "center" },
  controlActive: { backgroundColor: colors.brandSoft },
  mine: { fontSize: 18, lineHeight: 22 },
  summary: { fontSize: 14, lineHeight: 18, maxWidth: 64 },
  count: { color: colors.silver, fontSize: 13 },
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end", alignItems: "center", paddingHorizontal: 12 },
  picker: { backgroundColor: colors.surfaceSecondary, borderRadius: 24, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 10, alignItems: "center", gap: 6, maxWidth: 420, width: "100%" },
  row: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 4 },
  emojiBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  emojiSelected: { backgroundColor: colors.brandSoft, borderWidth: 1, borderColor: colors.brandPrimary },
  emoji: { fontSize: 26, lineHeight: 32 },
  remove: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 36, paddingHorizontal: 12 },
  removeText: { color: colors.muted, fontSize: 13 },
  hint: { color: colors.muted, fontSize: 12, paddingBottom: 4 },
}));
