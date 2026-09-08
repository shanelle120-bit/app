import { QueryClient, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Platform, Share } from "react-native";

import { api } from "@/src/api";
import { useToast } from "@/src/toast";
import type { Post } from "@/src/types";

export const postKeys = {
  feed: (scope: string) => ["posts", scope] as const,
  mingleFeed: ["posts", "mingle"] as const,
  detail: (id: string) => ["post", id] as const,
  userPosts: (userId: string, tab: string) => ["userPosts", userId, tab] as const,
  saved: ["saved"] as const,
};

function patchData(data: any, postId: string, patch: Partial<Post>): any {
  if (!data) return data;
  if (Array.isArray(data)) return data.map((p) => (p?.post_id === postId ? { ...p, ...patch } : p));
  if (data.pages) return { ...data, pages: data.pages.map((pg: any) => ({ ...pg, items: patchData(pg.items, postId, patch) })) };
  if (data.post_id === postId) return { ...data, ...patch };
  return data;
}

export function patchPostEverywhere(qc: QueryClient, postId: string, patch: Partial<Post>) {
  for (const key of [["posts"], ["post"], ["userPosts"], ["saved"]]) {
    qc.setQueriesData({ queryKey: key }, (old: any) => patchData(old, postId, patch));
  }
}

function haptic(kind: "light" | "medium" | "success") {
  if (Platform.OS === "web") return;
  if (kind === "success") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  else Haptics.impactAsync(kind === "light" ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium);
}

export const REACTIONS = ["😂", "💜", "🤑", "🥳", "🔥", "‼️", "🤗", "🤬"] as const;

/** Local recompute of the reaction summary when a member picks/changes/removes their reaction. */
export function applyReaction(post: Post, reaction: string | null): Partial<Post> {
  const reactions = { ...(post.reactions ?? {}) };
  const prev = post.my_reaction ?? (post.liked ? "💜" : null);
  if (prev) {
    reactions[prev] = Math.max(0, (reactions[prev] ?? 1) - 1);
    if (!reactions[prev]) delete reactions[prev];
  }
  if (reaction) reactions[reaction] = (reactions[reaction] ?? 0) + 1;
  const likes_count = Math.max(0, post.likes_count + (reaction ? 1 : 0) - (prev ? 1 : 0));
  return { my_reaction: reaction, liked: !!reaction, reactions, likes_count };
}

export function usePostActions() {
  const qc = useQueryClient();
  const toast = useToast();

  const react = useMutation({
    mutationFn: ({ post, reaction }: { post: Post; reaction: string | null }) =>
      api<{ liked: boolean; my_reaction: string | null; likes_count: number; reactions: Record<string, number> }>(`/posts/${post.post_id}/react`, { method: "POST", body: { reaction } }),
    onMutate: ({ post, reaction }) => {
      haptic("medium");
      patchPostEverywhere(qc, post.post_id, applyReaction(post, reaction));
    },
    onSuccess: (res, { post }) => patchPostEverywhere(qc, post.post_id, res),
    onError: (_e, { post }) => patchPostEverywhere(qc, post.post_id, { liked: post.liked, my_reaction: post.my_reaction, likes_count: post.likes_count, reactions: post.reactions }),
  });

  const like = useMutation({
    mutationFn: (post: Post) => api<{ liked: boolean; likes_count: number }>(`/posts/${post.post_id}/like`, { method: "POST" }),
    onMutate: (post) => {
      haptic("medium");
      patchPostEverywhere(qc, post.post_id, { liked: !post.liked, likes_count: post.likes_count + (post.liked ? -1 : 1) });
    },
    onSuccess: (res, post) => patchPostEverywhere(qc, post.post_id, { liked: res.liked, likes_count: res.likes_count }),
    onError: (_e, post) => patchPostEverywhere(qc, post.post_id, { liked: post.liked, likes_count: post.likes_count }),
  });

  const bookmark = useMutation({
    mutationFn: (post: Post) => api<{ saved: boolean }>(`/posts/${post.post_id}/bookmark`, { method: "POST" }),
    onMutate: (post) => {
      haptic("light");
      patchPostEverywhere(qc, post.post_id, { saved: !post.saved });
    },
    onSuccess: (res, post) => {
      patchPostEverywhere(qc, post.post_id, { saved: res.saved });
      qc.invalidateQueries({ queryKey: postKeys.saved });
      toast.show(res.saved ? "Saved to your collection" : "Removed from saved", "success");
    },
    onError: (_e, post) => patchPostEverywhere(qc, post.post_id, { saved: post.saved }),
  });

  const share = useMutation({
    mutationFn: async (post: Post) => {
      const message = `${post.author.display_name} on Level Up Trading Hub:\n"${post.text.slice(0, 140)}"`;
      try {
        if (Platform.OS === "web" && typeof navigator !== "undefined" && (navigator as any).share) {
          await (navigator as any).share({ title: "Level Up Trading Hub", text: message });
        } else if (Platform.OS !== "web") {
          const res = await Share.share({ message });
          if (res.action === Share.dismissedAction) return null;
        } else {
          toast.show("Sharing is available in the mobile app", "info");
        }
      } catch {
        return null;
      }
      return api<{ shares_count: number }>(`/posts/${post.post_id}/share`, { method: "POST" });
    },
    onSuccess: (res, post) => {
      if (res) patchPostEverywhere(qc, post.post_id, { shares_count: res.shares_count });
    },
  });

  const remove = useMutation({
    mutationFn: (post: Post) => api(`/posts/${post.post_id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["posts"] });
      qc.invalidateQueries({ queryKey: ["userPosts"] });
      qc.invalidateQueries({ queryKey: ["me"] });
      toast.show("Post deleted", "success");
    },
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  return { like, react, bookmark, share, remove };
}
