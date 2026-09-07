import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import type { Membership, PremiumPlan, User } from "@/src/types";

export const membershipKey = ["membership"];

/**
 * Premium membership state. `user.tier` (from /auth/me) is the source of truth for
 * gating; `/membership` adds plans + the feature registry so features can be
 * designated Premium on the backend without app changes.
 */
export function useMembership() {
  const { user, setUser } = useAuth();
  const qc = useQueryClient();
  const query = useQuery({ queryKey: membershipKey, queryFn: () => api<Membership>("/membership"), enabled: !!user });

  const isPremium = (user?.tier ?? query.data?.tier) === "premium";
  const feature = (key: string) => query.data?.features.find((f) => f.key === key);
  const hasAccess = (key: string) => {
    const f = feature(key);
    if (!f) return isPremium;
    return !f.premium || isPremium;
  };

  const afterChange = (fresh: User) => {
    setUser(fresh);
    qc.invalidateQueries({ queryKey: membershipKey });
    qc.invalidateQueries({ queryKey: ["mingle"] });
  };
  const activate = useMutation({
    mutationFn: (plan: PremiumPlan["id"]) => api<User>("/membership/activate", { method: "POST", body: { plan } }),
    onSuccess: afterChange,
  });
  const cancel = useMutation({
    mutationFn: () => api<User>("/membership/cancel", { method: "POST" }),
    onSuccess: afterChange,
  });

  return { membership: query.data, isLoading: query.isLoading, isPremium, feature, hasAccess, activate, cancel };
}
