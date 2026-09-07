import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import type { ViewToken } from "react-native";

/**
 * Tracks which posts are currently visible in a list so feed videos can
 * autoplay (muted) while on screen and pause when scrolled away.
 *
 * The provider component is a stable module-level component (never recreated),
 * so visibility updates re-render only the consumers, not the list itself.
 */
const VisiblePostsContext = createContext<Set<string> | null>(null);

export const viewabilityConfig = { itemVisiblePercentThreshold: 55, minimumViewTime: 150 };

export function VisiblePostsProvider({ value, children }: { value: Set<string>; children: React.ReactNode }) {
  return <VisiblePostsContext.Provider value={value}>{children}</VisiblePostsContext.Provider>;
}

export function useVisiblePostsTracker() {
  const [visible, setVisible] = useState<Set<string>>(() => new Set());
  const last = useRef("");
  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const ids = viewableItems.map((v) => v.item?.post_id).filter(Boolean) as string[];
    const key = ids.join("|");
    if (key === last.current) return;
    last.current = key;
    setVisible(new Set(ids));
  }, []);
  return { onViewableItemsChanged, viewabilityConfig, visible };
}

/** True when the post is on screen. Outside a tracked list (e.g. post detail) it is always true. */
export function usePostVisible(postId: string) {
  const visible = useContext(VisiblePostsContext);
  return visible ? visible.has(postId) : true;
}
