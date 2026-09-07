import Ionicons from "@react-native-vector-icons/ionicons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, IconButton } from "@/src/components/ui";
import { useMembership } from "@/src/hooks/use-membership";
import { makeStyles, useTheme } from "@/src/theme";
import { useToast } from "@/src/toast";
import type { PremiumPlan } from "@/src/types";

/** Plan picker shared by the Premium tab and feature paywalls. Pricing is intentionally TBD. */
export function PlanPicker({ plans, value, onChange }: { plans: PremiumPlan[]; value: PremiumPlan["id"]; onChange: (id: PremiumPlan["id"]) => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={{ gap: 10 }}>
      {plans.map((p) => {
        const selected = p.id === value;
        return (
          <Pressable key={p.id} onPress={() => onChange(p.id)} style={[styles.plan, selected && styles.planSelected]} testID={`plan-${p.id}`}>
            <View style={styles.planTop}>
              <View style={[styles.radio, selected && styles.radioSelected]}>{selected ? <View style={styles.radioDot} /> : null}</View>
              <Text style={styles.planName}>{p.name}</Text>
              {p.badge ? (
                <View style={styles.planBadge}>
                  <Text style={styles.planBadgeText}>{p.badge}</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.planPrice}>{p.price ?? p.price_note}</Text>
            <View style={{ gap: 4, marginTop: 8 }}>
              {p.perks.map((perk) => (
                <View key={perk} style={styles.perkRow}>
                  <Ionicons name="checkmark-circle" size={15} color={colors.brandSecondary} />
                  <Text style={styles.perk}>{perk}</Text>
                </View>
              ))}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Full-screen gate rendered in place of a Premium feature when the member is on the free tier. */
export function PremiumPaywall({ featureKey, title, lead, icon = "diamond", onBack }: { featureKey: string; title: string; lead: string; icon?: string; onBack: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { membership, activate } = useMembership();
  const [plan, setPlan] = useState<PremiumPlan["id"]>("yearly");
  const feature = membership?.features.find((f) => f.key === featureKey);

  return (
    <View style={styles.root} testID="premium-paywall">
      <LinearGradient colors={[colors.brandPrimary, colors.brandTertiary, colors.surface]} locations={[0, 0.4, 1]} style={styles.gradient} />
      <View style={{ paddingTop: insets.top, paddingHorizontal: 8 }}>
        <IconButton name="chevron-back" onPress={onBack} testID="paywall-back-button" />
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <Animated.View entering={FadeInDown.duration(450)}>
          <View style={styles.iconWrap}>
            <Ionicons name={icon as any} size={36} color={colors.onSurface} />
          </View>
          <View style={styles.pill}>
            <Ionicons name="lock-closed" size={11} color={colors.brandSecondary} />
            <Text style={styles.pillText}>PREMIUM FEATURE</Text>
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.lead}>{lead}</Text>
        </Animated.View>
        <Animated.View entering={FadeInUp.delay(150).duration(450)} style={{ marginTop: 28, gap: 14 }}>
          <Text style={styles.sectionLabel}>CHOOSE A PLAN</Text>
          <PlanPicker plans={membership?.plans ?? []} value={plan} onChange={setPlan} />
          <Button
            title={activate.isPending ? "Activating…" : "Activate Premium (free preview)"}
            icon="sparkles"
            loading={activate.isPending}
            onPress={() =>
              activate.mutate(plan, {
                onSuccess: () => toast.show(`Premium unlocked${feature ? ` · ${feature.name} is open` : ""} ✨`, "success"),
                onError: (e: Error) => toast.show(e.message, "error"),
              })
            }
            testID="paywall-activate-button"
          />
          <Button title="Not now" variant="ghost" onPress={onBack} testID="paywall-not-now-button" />
          <Text style={styles.footnote}>No payment is taken during the preview. Pricing and billing will be announced at launch — you can cancel any time from the Premium tab.</Text>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  gradient: { position: "absolute", top: 0, left: 0, right: 0, height: 420, opacity: 0.5 },
  content: { paddingHorizontal: 24, paddingTop: 16 },
  iconWrap: { width: 72, height: 72, borderRadius: 24, backgroundColor: colors.brandSoft, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  pill: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", backgroundColor: colors.cyanSoft, borderRadius: 999, paddingHorizontal: 10, height: 26 },
  pillText: { color: colors.brandSecondary, fontSize: 11, letterSpacing: 1 },
  title: { color: colors.onSurface, fontSize: 32, fontWeight: "500", letterSpacing: -0.5, marginTop: 12 },
  lead: { color: colors.silver, fontSize: 16, lineHeight: 24, marginTop: 10 },
  sectionLabel: { color: colors.muted, fontSize: 12, letterSpacing: 0.6 },
  footnote: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: "center" },

  plan: { backgroundColor: colors.surfaceSecondary, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 16 },
  planSelected: { borderColor: colors.brandPrimary, backgroundColor: colors.brandSoft },
  planTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
  radioSelected: { borderColor: colors.brandSecondary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.brandSecondary },
  planName: { color: colors.onSurface, fontSize: 17, fontWeight: "500", flex: 1 },
  planBadge: { backgroundColor: colors.cyanSoft, borderRadius: 999, paddingHorizontal: 8, height: 22, justifyContent: "center" },
  planBadgeText: { color: colors.brandSecondary, fontSize: 11, letterSpacing: 0.4 },
  planPrice: { color: colors.silver, fontSize: 13, marginTop: 6, marginLeft: 30 },
  perkRow: { flexDirection: "row", alignItems: "center", gap: 8, marginLeft: 30 },
  perk: { color: colors.onSurfaceSecondary, fontSize: 13 },
}));
