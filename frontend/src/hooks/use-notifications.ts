import { useQuery } from "@tanstack/react-query";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";

export const notificationKeys = { list: ["notifications"], unread: ["notifications", "unread-count"] };

export function useUnreadNotifications() {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: notificationKeys.unread,
    queryFn: () => api<{ count: number }>("/notifications/unread-count"),
    enabled: !!user,
    refetchInterval: 30_000,
  });
  return q.data?.count ?? 0;
}
