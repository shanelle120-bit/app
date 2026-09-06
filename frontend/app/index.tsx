import { Redirect } from "expo-router";

import { useAuth } from "@/src/auth-context";

export default function Index() {
  const { user } = useAuth();
  if (!user) return <Redirect href="/(auth)/welcome" />;
  if (!user.onboarding_complete) return <Redirect href="/onboarding" />;
  return <Redirect href="/(tabs)" />;
}
