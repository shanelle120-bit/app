import Ionicons from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PlanPicker } from "@/src/components/premium-gate";
import { Button } from "@/src/components/ui";
import { useMembership } from "@/src/hooks/use-membership";
import { makeStyles, useTheme } from "@/src/theme";
import { useToast } from "@/src/toast";
import type { PremiumPlan } from "@/src/types";

const HERO = "https://images.unsplash.com/photo-1689443111130-6e9c7dfd8f9e?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200";

const SECTIONS = [
  {
    key: "single_mingle",
    icon: "heart-circle-outline",
    title: "Single & Mingle",
    body: "Meet traders who get the lifestyle. A social space for connection beyond the charts.",
    tone: "brand" as const,
  },
  {
    key: "accountability",
    icon: "people-circle-outline",
    title: "Accountability Partners",
    body: "Pair up with a trader on your schedule. Daily check-ins, shared journals, real discipline.",
    tone: "cyan" as const,
  },
  {
    key: "trading_only",
    icon: "bar-chart-outline",
    title: "Trading Only",
    body: "Zero noise. Setups, execution, risk. A focused room for serious market talk.",
    tone: "blue" as const,
  },
];

export default function Premium() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const router = useRouter();
  const { membership, isPremium, feature, startCheckout, openPortal } = useMembership();
  const [plan, setPlan] = useState<PremiumPlan["id"]>("monthly");

  const toneColor = { brand: colors.brandPrimary, cyan: colors.brandSecondary, blue: colors.brandTertiary };
  const planName = membership?.plans.find((p) => p.id === membership.plan)?.name;

  return (
    <View style={styles.root} testID="premium-screen">
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <View style={styles.hero}>
          <Image source={{ uri: HERO }} style={styles.heroImage} contentFit="cover" />
          <LinearGradient colors={["rgba(11,15,25,0.2)", colors.surface]} style={styles.heroScrim} />
          <View style={[styles.heroContent, { paddingTop: insets.top + 24 }]}>
            <View style={[styles.pill, isPremium && { backgroundColor: colors.brandSoft }]} testID="premium-status-pill">
              <Ionicons name="diamond" size={12} color={isPremium ? colors.brandPrimary : colors.brandSecondary} />
              <Text style={[styles.pillText, isPremium && { color: colors.brandPrimary }]}>{isPremium ? "PREMIUM · ACTIVE" : "14-DAY FREE TRIAL"}</Text>
            </View>
            <Text style={styles.title}>{isPremium ? "You're a Premium member" : "Level up your circle"}</Text>
            <Text style={styles.subtitle}>
              {isPremium
                ? `${planName ?? "Premium"} · members-only rooms are unlocked.`
                : "Members-only rooms built for how traders actually connect. Start your 14-day free trial to unlock what's open today."}
            </Text>
          </View>
        </View>

        <View style={styles.cards}>
          {SECTIONS.map((s, i) => {
            const f = feature(s.key);
            const available = f?.available ?? s.key === "single_mingle";
            const unlocked = available && (f ? f.unlocked : isPremium);
            return (
              <Animated.View key={s.key} entering={FadeInDown.delay(i * 90).duration(400)} style={[styles.card, { borderColor: toneColor[s.tone] }]} testID={`premium-card-${s.key}`}>
                <Pressable onPress={available ? () => router.push(s.key === "accountability" ? "/accountability" : s.key === "trading_only" ? "/trading" : "/mingle") : undefined} disabled={!available} testID={`premium-card-${s.key}-press`}>
                  <View style={styles.cardTop}>
                    <View style={[styles.cardIcon, { backgroundColor: colors.surfaceTertiary }]}>
                      <Ionicons name={s.icon as any} size={26} color={toneColor[s.tone]} />
                    </View>
                    {unlocked ? (
                      <View style={[styles.lock, { backgroundColor: colors.brandSoft }]}>
                        <Ionicons name="sparkles" size={12} color={colors.brandPrimary} />
                        <Text style={[styles.lockText, { color: colors.brandPrimary }]}>Unlocked</Text>
                      </View>
                    ) : available ? (
                      <View style={[styles.lock, { backgroundColor: colors.cyanSoft }]}>
                        <Ionicons name="lock-closed" size={12} color={colors.brandSecondary} />
                        <Text style={[styles.lockText, { color: colors.brandSecondary }]}>Premium</Text>
                      </View>
                    ) : (
                      <View style={styles.lock}>
                        <Ionicons name="time-outline" size={12} color={colors.muted} />
                        <Text style={styles.lockText}>Coming soon</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.cardTitle}>{s.title}</Text>
                  <Text style={styles.cardBody}>{s.body}</Text>
                  {available ? (
                    <View style={styles.enterRow}>
                      <Text style={styles.enterText}>{unlocked ? `Enter ${s.title}` : `Unlock ${s.title}`}</Text>
                      <Ionicons name="arrow-forward" size={16} color={colors.brandSecondary} />
                    </View>
                  ) : null}
                </Pressable>
              </Animated.View>
            );
          })}
        </View>

        <View style={styles.cta} testID="premium-membership-section">
          {isPremium ? (
            <>
              <View style={styles.statusCard}>
                <Ionicons name="checkmark-circle" size={22} color={colors.success} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.statusTitle}>Membership active</Text>
                  <Text style={styles.statusBody}>
                    {planName ?? "Premium"} · $9.99/mo
                    {membership?.cancel_at_period_end ? " · cancels at the end of this billing period" : membership?.subscription_status === "trialing" ? " · free trial in progress" : ""}
                  </Text>
                </View>
              </View>
              <Button
                title="Manage subscription"
                variant="ghost"
                icon="card-outline"
                loading={openPortal.isPending}
                onPress={() => openPortal.mutate(undefined, { onError: (e: Error) => toast.show(e.message, "error") })}
                testID="premium-manage-subscription-button"
              />
            </>
          ) : (
            <>
              <Text style={styles.sectionLabel}>PREMIUM PLAN</Text>
              <PlanPicker plans={membership?.plans ?? []} value={plan} onChange={setPlan} />
              <Button
                title="Start 14-day free trial"
                icon="sparkles"
                loading={startCheckout.isPending}
                onPress={() => startCheckout.mutate(plan, { onError: (e: Error) => toast.show(e.message, "error") })}
                testID="premium-activate-button"
              />
              <Text style={styles.footnote}>Card required to start. $9.99/month after your 14-day trial — cancel any time from Settings, including free during the trial.</Text>
              <Pressable onPress={() => router.push("/legal/premium-policy")} hitSlop={8} style={{ alignSelf: "center", minHeight: 32, justifyContent: "center" }} testID="premium-policy-link">
                <Text style={styles.policyLink}>Subscription, Cancellation & Refund Policy</Text>
              </Pressable>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  hero: { height: 320 },
  heroImage: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  heroScrim: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  heroContent: { flex: 1, justifyContent: "flex-end", padding: 24 },
  pill: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", backgroundColor: colors.cyanSoft, borderRadius: 999, paddingHorizontal: 10, height: 26 },
  pillText: { color: colors.brandSecondary, fontSize: 11, letterSpacing: 1 },
  title: { color: colors.onSurface, fontSize: 32, fontWeight: "500", marginTop: 12, letterSpacing: -0.5 },
  subtitle: { color: colors.silver, fontSize: 15, lineHeight: 22, marginTop: 8 },
  cards: { paddingHorizontal: 16, gap: 12, marginTop: 8 },
  card: { backgroundColor: colors.glass, borderRadius: 20, borderWidth: 1, padding: 18 },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardIcon: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  lock: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.surfaceTertiary, borderRadius: 999, paddingHorizontal: 10, height: 26 },
  lockText: { color: colors.muted, fontSize: 11, letterSpacing: 0.5 },
  cardTitle: { color: colors.onSurface, fontSize: 20, fontWeight: "500", marginTop: 14 },
  cardBody: { color: colors.silver, fontSize: 14, lineHeight: 21, marginTop: 6 },
  enterRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 14, minHeight: 32 },
  enterText: { color: colors.brandSecondary, fontSize: 14, fontWeight: "500" },
  cta: { paddingHorizontal: 16, marginTop: 24, gap: 12 },
  sectionLabel: { color: colors.muted, fontSize: 12, letterSpacing: 0.6 },
  statusCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.surfaceSecondary, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16 },
  statusTitle: { color: colors.onSurface, fontSize: 16, fontWeight: "500" },
  statusBody: { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: 2 },
  footnote: { color: colors.muted, fontSize: 12, textAlign: "center" },
  policyLink: { color: colors.brandSecondary, fontSize: 12, textAlign: "center", textDecorationLine: "underline" },
}));
