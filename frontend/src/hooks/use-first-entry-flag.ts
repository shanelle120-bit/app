import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import type { User } from "@/src/types";

type FlagName = "has_seen_trading_disclaimer" | "has_seen_mingle_safety";

/**
 * Drives a one-time entry disclaimer/safety modal. `visible` is seeded from the flag
 * already present on the authenticated user (loaded at boot / after premium unlock),
 * so it naturally shows once per user and never again once acknowledged.
 */
export function useFirstEntryFlag(flag: FlagName) {
  const { user, setUser } = useAuth();
  const [visible, setVisible] = useState(() => !!user && !user[flag]);

  const mutation = useMutation({
    mutationFn: () => api<User>("/me", { method: "PUT", body: { [flag]: true } }),
    onSuccess: (fresh) => {
      setUser(fresh);
      setVisible(false);
    },
    onError: () => {
      // Even if persisting the flag fails, don't trap the user behind the modal.
      setVisible(false);
    },
  });

  return { visible, acknowledge: () => mutation.mutate(), acknowledging: mutation.isPending };
}
