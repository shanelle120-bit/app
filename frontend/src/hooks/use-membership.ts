import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import type { Membership, PremiumPlan } from "@/src/types";

export const membershipKey = ["membership"];

async function openBillingUrl(url: string) {
  if (Platform.OS === "web") {
    window.open(url, "_blank");
    return;
  }
  await WebBrowser.openBrowserAsync(url);
}

/**
 * Premium membership state. `user.tier` (from /auth/me) is the source of truth for
 * gating; `/membership` adds plans + the feature registry so features can be
 * designated Premium on the backend without app changes.
 *
 * Real billing is handled by Stripe (hosted Payment Link + webhooks + Customer
 * Portal) — this hook never flips `tier` itself, it only opens the right Stripe URL
 * and re-syncs `/auth/me` + `/membership` once the user returns, so the webhook's
 * update (which lands independently, on Stripe's own schedule) gets picked up.
 */
export function useMembership() {
  const { user, refreshUser } = useAuth();
  const qc = useQueryClient();
  const query = useQuery({ queryKey: membershipKey, queryFn: () => api<Membership>("/membership"), enabled: !!user });

  const isPremium = (user?.tier ?? query.data?.tier) === "premium";
  const feature = (key: string) => query.data?.features.find((f) => f.key === key);
  const hasAccess = (key: string) => {
    const f = feature(key);
    if (!f) return isPremium;
    return !f.premium || isPremium;
  };

  const resync = () => {
    refreshUser().catch(() => {});
    qc.invalidateQueries({ queryKey: membershipKey });
  };

  // Web: Stripe opens in a new tab, so catch the moment the user comes back to this one.
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const onFocus = () => resync();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startCheckout = useMutation({
    mutationFn: (_plan?: PremiumPlan["id"]) => api<{ url: string }>("/billing/checkout-link", { method: "POST" }),
    onSuccess: async ({ url }) => {
      await openBillingUrl(url); // native: resolves once the in-app browser is dismissed
      resync();
    },
  });

  const openPortal = useMutation({
    mutationFn: () => api<{ url: string }>("/billing/portal", { method: "POST" }),
    onSuccess: async ({ url }) => {
      await openBillingUrl(url);
      resync();
    },
  });

  const notifyBilling = useMutation({
    mutationFn: (plan?: PremiumPlan["id"]) => api<{ ok: boolean; message: string }>("/membership/notify-billing", { method: "POST", body: { plan: plan ?? null } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: membershipKey }),
  });

  return {
    membership: query.data,
    isLoading: query.isLoading,
    isPremium,
    feature,
    hasAccess,
    startCheckout,
    openPortal,
    notifyBilling,
    notifiedBilling: !!query.data?.notified_billing,
    refetch: resync,
  };
}
