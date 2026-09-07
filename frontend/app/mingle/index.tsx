import Ionicons from "@react-native-vector-icons/ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { MingleNav } from "@/src/components/mingle-nav";
import { MinglePhotos } from "@/src/components/mingle-photos";
import { PremiumPaywall } from "@/src/components/premium-gate";
import { Button, Chip, EmptyState, IconButton, Loader } from "@/src/components/ui";
import { useMembership } from "@/src/hooks/use-membership";
import { DEFAULT_FILTERS, type MingleActionResult, type MingleFilters, type MingleMeta, type MingleProfile } from "@/src/mingle-types";
import { makeStyles, useTheme } from "@/src/theme";
import { useToast } from "@/src/toast";

export default function Mingle() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isPremium, isLoading: membershipLoading } = useMembership();
  const me = useQuery({ queryKey: ["mingle", "me"], queryFn: () => api<{ profile: MingleProfile | null }>("/mingle/me") });
  const meta = useQuery({ queryKey: ["mingle", "meta"], queryFn: () => api<MingleMeta>("/mingle/meta"), staleTime: Infinity });
  const back = () => (router.canGoBack() ? router.back() : router.replace("/(tabs)/premium"));

  if (!isPremium) {
    if (membershipLoading) return <View style={[styles.root, { paddingTop: insets.top + 60 }]}><Loader /></View>;
    return (
      <PremiumPaywall
        featureKey="single_mingle"
        icon="heart-circle"
        title="Single & Mingle"
        lead="Meet traders who get the lifestyle. Single & Mingle is a Premium members-only space for connection beyond the charts."
        onBack={back}
      />
    );
  }

  if (me.isLoading) return <View style={[styles.root, { paddingTop: insets.top + 60 }]}><Loader /></View>;

  if (!me.data?.profile) {
    return (
      <View style={styles.root} testID="mingle-welcome-screen">
        <LinearGradient colors={[colors.brandTertiary, colors.brandPrimary, colors.surface]} locations={[0, 0.45, 1]} style={styles.welcomeGradient} />
        <View style={{ paddingTop: insets.top, paddingHorizontal: 8 }}>
          <IconButton name="chevron-back" onPress={back} testID="mingle-back-button" />
        </View>
        <ScrollView contentContainerStyle={[styles.welcomeContent, { paddingBottom: insets.bottom + 24 }]}>
          <Animated.View entering={FadeInDown.duration(500)}>
            <View style={styles.welcomeIcon}>
              <Ionicons name="heart-circle" size={40} color={colors.onSurface} />
            </View>
            <Text style={styles.welcomeTitle}>Single & Mingle</Text>
            <Text style={styles.welcomeLead}>Charts aren&apos;t the only place connections happen.</Text>
            <Text style={styles.welcomeBody}>
              Meet other single traders who understand the lifestyle, the wins, the losses, the late-night chart watching, and the obsession with
              &ldquo;just one more setup.&rdquo; 😂
            </Text>
          </Animated.View>
          <Animated.View entering={FadeInUp.delay(200).duration(500)} style={{ gap: 12, marginTop: 32 }}>
            <Button title="Join Single & Mingle" icon="sparkles" onPress={() => router.push("/mingle/edit")} testID="mingle-join-button" />
            <Button title="Not now" variant="ghost" onPress={back} testID="mingle-not-now-button" />
            <Text style={styles.notice}>For single adults 18+. {meta.data?.safety_notice}</Text>
          </Animated.View>
        </ScrollView>
      </View>
    );
  }

  return <Discover profile={me.data.profile} meta={meta.data} />;
}

function Discover({ profile, meta }: { profile: MingleProfile; meta?: MingleMeta }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const [filters, setFilters] = useState<MingleFilters>(DEFAULT_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [celebrate, setCelebrate] = useState<MingleActionResult | null>(null);

  const qs = Object.entries(filters)
    .filter(([, v]) => v !== "" && v !== undefined)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");
  const discover = useQuery({ queryKey: ["mingle", "discover", qs], queryFn: () => api<MingleProfile[]>(`/mingle/discover?${qs}`) });
  const members = discover.data ?? [];
  const current = members[index];

  const act = useMutation({
    mutationFn: (body: { to_user_id: string; action: "interested" | "hi" | "pass" }) => api<MingleActionResult>("/mingle/actions", { method: "POST", body }),
    onSuccess: (res, vars) => {
      if (res.mingle) {
        setCelebrate(res);
        qc.invalidateQueries({ queryKey: ["mingle", "connections"] });
        qc.invalidateQueries({ queryKey: ["conversations"] });
      } else if (vars.action === "hi" && res.conversation_id) {
        qc.invalidateQueries({ queryKey: ["conversations"] });
        toast.show("Hi sent! Check your messages.", "success");
      } else if (vars.action === "interested") {
        toast.show("Interest sent 💜", "success");
      }
      setIndex((i) => i + 1);
    },
    onError: (e: Error) => toast.show(e.message, "error"),
  });

  const back = () => (router.canGoBack() ? router.back() : router.replace("/(tabs)/premium"));

  return (
    <View style={styles.root} testID="mingle-discover-screen">
      <View style={[styles.header, { paddingTop: insets.top + 4 }]}>
        <IconButton name="chevron-back" onPress={back} testID="mingle-back-button" />
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Single & Mingle</Text>
          <Text style={styles.headerSub}>Hi {profile.display_name} · {profile.active ? "visible" : "hidden"}</Text>
        </View>
        <IconButton name="options-outline" onPress={() => setFiltersOpen(true)} testID="mingle-filters-button" />
        <IconButton name="settings-outline" onPress={() => router.push("/mingle/settings")} testID="mingle-settings-button" />
      </View>

      {!profile.active ? (
        <Pressable onPress={() => router.push("/mingle/settings")} style={styles.hiddenBanner} testID="mingle-hidden-banner">
          <Ionicons name="eye-off-outline" size={16} color={colors.warning} />
          <Text style={styles.hiddenText}>Your profile is hidden. Others can&apos;t see you until you turn it back on.</Text>
        </Pressable>
      ) : null}

      {discover.isLoading ? (
        <Loader />
      ) : !current ? (
        <EmptyState
          icon="sparkles-outline"
          title={members.length ? "You've seen everyone for now" : "No members match yet"}
          subtitle="Adjust your filters or check back soon — new traders join every day."
          action={
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Button title="Filters" small variant="secondary" onPress={() => setFiltersOpen(true)} testID="mingle-empty-filters" />
              <Button title="Refresh" small onPress={() => { setIndex(0); discover.refetch(); }} testID="mingle-empty-refresh" />
            </View>
          }
        />
      ) : (
        <ScrollView contentContainerStyle={[styles.cardScroll, { paddingBottom: 24 }]} key={current.user_id}>
          <Animated.View entering={FadeInUp.duration(350)} style={styles.card} testID={`mingle-card-${current.user_id}`}>
            <View style={styles.photoWrap}>
              <MinglePhotos photos={current.photos?.length ? current.photos : current.photo_url ? [current.photo_url] : []} testID="mingle-card-photos" />
              <LinearGradient colors={["rgba(11,15,25,0)", "rgba(11,15,25,0.92)"]} style={[styles.photoScrim, { pointerEvents: "none" }]} />
              <View style={[styles.photoText, { pointerEvents: "none" }]}>
                <Text style={styles.cardName} testID="mingle-card-name">
                  {current.display_name}, {current.age}
                </Text>
                <View style={styles.metaRow}>
                  {current.location ? (
                    <Text style={styles.cardMeta}>
                      <Ionicons name="location-outline" size={12} color={colors.silver} /> {current.location}
                    </Text>
                  ) : null}
                  <Text style={styles.cardMeta}>· {current.trader_type} trader</Text>
                  {current.trading_style ? <Text style={styles.cardMeta}>· {current.trading_style}</Text> : null}
                </View>
              </View>
            </View>
            <View style={styles.cardBody}>
              {current.looking_for.length ? (
                <View style={styles.chipsRow}>
                  {current.looking_for.map((l) => (
                    <Chip key={l} label={l} selected tone="cyan" />
                  ))}
                </View>
              ) : null}
              {current.bio ? <Text style={styles.bio}>{current.bio}</Text> : null}
              {current.prompt_label && current.prompt_answer ? (
                <View style={styles.promptBox}>
                  <Text style={styles.promptLabel}>{current.prompt_label}</Text>
                  <Text style={styles.promptAnswer}>{current.prompt_answer}</Text>
                </View>
              ) : null}
              <View style={styles.factRow}>
                {current.favorite_instrument ? (
                  <Text style={styles.fact}>
                    <Text style={styles.factLabel}>Favorite: </Text>
                    {current.favorite_instrument}
                  </Text>
                ) : null}
                {current.interests ? (
                  <Text style={styles.fact}>
                    <Text style={styles.factLabel}>Off the charts: </Text>
                    {current.interests}
                  </Text>
                ) : null}
              </View>
            </View>
          </Animated.View>

          <View style={styles.actions}>
            <Pressable onPress={() => act.mutate({ to_user_id: current.user_id, action: "pass" })} disabled={act.isPending} style={[styles.actionBtn, styles.passBtn]} testID="mingle-pass-button">
              <Ionicons name="close" size={26} color={colors.silver} />
              <Text style={styles.actionLabel}>Pass</Text>
            </Pressable>
            <Pressable onPress={() => act.mutate({ to_user_id: current.user_id, action: "hi" })} disabled={act.isPending} style={[styles.actionBtn, styles.hiBtn]} testID="mingle-hi-button">
              <Text style={{ fontSize: 24 }}>👋</Text>
              <Text style={styles.actionLabel}>Say Hi</Text>
            </Pressable>
            <Pressable onPress={() => act.mutate({ to_user_id: current.user_id, action: "interested" })} disabled={act.isPending} style={[styles.actionBtn, styles.likeBtn]} testID="mingle-interested-button">
              <Ionicons name="heart" size={26} color={colors.onBrandPrimary} />
              <Text style={[styles.actionLabel, { color: colors.onBrandPrimary }]}>Interested</Text>
            </Pressable>
          </View>
          <Text style={styles.counter}>
            {index + 1} of {members.length}
          </Text>
        </ScrollView>
      )}

      <MingleNav current="discover" />

      <FiltersSheet visible={filtersOpen} filters={filters} meta={meta} onClose={() => setFiltersOpen(false)} onApply={(f) => { setFilters(f); setIndex(0); setFiltersOpen(false); }} />

      <Modal visible={!!celebrate} transparent animationType="fade" onRequestClose={() => setCelebrate(null)}>
        <View style={styles.celebrateBackdrop} testID="mingle-celebration">
          <Animated.View entering={FadeInUp.duration(400)} style={styles.celebrateCard}>
            <LinearGradient colors={[colors.brandPrimary, colors.brandTertiary]} style={styles.celebrateGradient}>
              <Text style={styles.celebrateEmoji}>🎉</Text>
              <Text style={styles.celebrateTitle}>It&apos;s a Mingle!</Text>
              <Text style={styles.celebrateBody}>Looks like you two found some liquidity. 😂</Text>
              {celebrate?.other ? <Text style={styles.celebrateName}>You and {celebrate.other.display_name} are both interested.</Text> : null}
            </LinearGradient>
            <View style={{ padding: 16, gap: 10 }}>
              <Button
                title="Send Message"
                icon="chatbubble-outline"
                onPress={() => {
                  const id = celebrate?.conversation_id;
                  setCelebrate(null);
                  if (id) router.push(`/chat/${id}`);
                }}
                testID="mingle-celebration-message"
              />
              <Button title="Keep Mingling" variant="secondary" onPress={() => setCelebrate(null)} testID="mingle-celebration-continue" />
            </View>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

function FiltersSheet({ visible, filters, meta, onClose, onApply }: { visible: boolean; filters: MingleFilters; meta?: MingleMeta; onClose: () => void; onApply: (f: MingleFilters) => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState(filters);
  React.useEffect(() => {
    if (visible) setDraft(filters);
  }, [visible, filters]);
  const toggle = (key: keyof MingleFilters, value: string) => setDraft((d) => ({ ...d, [key]: d[key] === value ? "" : value }));
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetBackdrop}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16, maxHeight: "85%" }]} testID="mingle-filters-sheet">
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Filters</Text>
            <Pressable onPress={() => setDraft(DEFAULT_FILTERS)} hitSlop={8} testID="mingle-filters-reset">
              <Text style={{ color: colors.brandSecondary, fontSize: 14 }}>Reset</Text>
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.filterLabel}>AGE RANGE</Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TextInput value={String(draft.min_age)} onChangeText={(v) => setDraft((d) => ({ ...d, min_age: Math.max(18, Number(v.replace(/\D/g, "")) || 18) }))} keyboardType="number-pad" style={styles.ageInput} placeholderTextColor={colors.muted} testID="mingle-filter-min-age" />
              <Text style={{ color: colors.muted, alignSelf: "center" }}>to</Text>
              <TextInput value={String(draft.max_age)} onChangeText={(v) => setDraft((d) => ({ ...d, max_age: Math.min(99, Number(v.replace(/\D/g, "")) || 99) }))} keyboardType="number-pad" style={styles.ageInput} placeholderTextColor={colors.muted} testID="mingle-filter-max-age" />
            </View>
            <Text style={styles.filterLabel}>LOCATION</Text>
            <TextInput value={draft.location} onChangeText={(v) => setDraft((d) => ({ ...d, location: v }))} placeholder="City or state" placeholderTextColor={colors.muted} style={styles.textInput} testID="mingle-filter-location" />
            <Text style={styles.filterLabel}>TRADER TYPE</Text>
            <View style={styles.chipsRow}>{(meta?.trader_types ?? []).map((t) => <Chip key={t} label={t} selected={draft.trader_type === t} onPress={() => toggle("trader_type", t)} tone="neutral" testID={`mingle-filter-type-${t.toLowerCase()}`} />)}</View>
            <Text style={styles.filterLabel}>TRADING STYLE</Text>
            <View style={styles.chipsRow}>{(meta?.trading_styles ?? []).map((t) => <Chip key={t} label={t} selected={draft.trading_style === t} onPress={() => toggle("trading_style", t)} tone="brand" />)}</View>
            <Text style={styles.filterLabel}>LOOKING FOR</Text>
            <View style={styles.chipsRow}>{(meta?.looking_for ?? []).map((t) => <Chip key={t} label={t} selected={draft.looking_for === t} onPress={() => toggle("looking_for", t)} tone="cyan" testID={`mingle-filter-looking-${t.toLowerCase().replace(/\s/g, "-")}`} />)}</View>
          </ScrollView>
          <Button title="Apply filters" onPress={() => onApply(draft)} style={{ marginTop: 16 }} testID="mingle-filters-apply" />
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  welcomeGradient: { position: "absolute", top: 0, left: 0, right: 0, height: 420, opacity: 0.55 },
  welcomeContent: { paddingHorizontal: 24, paddingTop: 24, flexGrow: 1, justifyContent: "center" },
  welcomeIcon: { width: 72, height: 72, borderRadius: 24, backgroundColor: colors.brandSoft, alignItems: "center", justifyContent: "center", marginBottom: 20 },
  welcomeTitle: { color: colors.onSurface, fontSize: 34, fontWeight: "500", letterSpacing: -0.5 },
  welcomeLead: { color: colors.brandSecondary, fontSize: 18, marginTop: 10, lineHeight: 26 },
  welcomeBody: { color: colors.silver, fontSize: 16, lineHeight: 25, marginTop: 14 },
  notice: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: 8 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerTitle: { color: colors.onSurface, fontSize: 17, fontWeight: "500" },
  headerSub: { color: colors.muted, fontSize: 12 },
  hiddenBanner: { flexDirection: "row", alignItems: "center", gap: 8, margin: 12, padding: 12, borderRadius: 12, backgroundColor: colors.surfaceTertiary },
  hiddenText: { color: colors.silver, fontSize: 13, flex: 1 },
  cardScroll: { padding: 16 },
  card: { borderRadius: 24, overflow: "hidden", backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  photoWrap: { height: 380, backgroundColor: colors.surfaceTertiary },
  photoScrim: { position: "absolute", left: 0, right: 0, bottom: 0, height: 180 },
  photoText: { position: "absolute", left: 16, right: 16, bottom: 14 },
  cardName: { color: colors.onSurface, fontSize: 28, fontWeight: "500", letterSpacing: -0.4 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  cardMeta: { color: colors.silver, fontSize: 13 },
  cardBody: { padding: 16, gap: 12 },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  bio: { color: colors.onSurfaceSecondary, fontSize: 15, lineHeight: 23 },
  promptBox: { backgroundColor: colors.brandSoft, borderRadius: 14, padding: 14 },
  promptLabel: { color: colors.brandPrimary, fontSize: 12, letterSpacing: 0.4 },
  promptAnswer: { color: colors.onSurface, fontSize: 16, lineHeight: 23, marginTop: 4 },
  factRow: { gap: 4 },
  fact: { color: colors.silver, fontSize: 13 },
  factLabel: { color: colors.muted },
  actions: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 14, marginTop: 20 },
  actionBtn: { width: 96, height: 76, borderRadius: 20, alignItems: "center", justifyContent: "center", gap: 4 },
  passBtn: { backgroundColor: colors.surfaceTertiary, borderWidth: 1, borderColor: colors.borderStrong },
  hiBtn: { backgroundColor: colors.cyanSoft, borderWidth: 1, borderColor: colors.brandSecondary },
  likeBtn: { backgroundColor: colors.brandPrimary },
  actionLabel: { color: colors.silver, fontSize: 12 },
  counter: { color: colors.muted, fontSize: 12, textAlign: "center", marginTop: 14 },
  celebrateBackdrop: { flex: 1, backgroundColor: colors.overlay, alignItems: "center", justifyContent: "center", padding: 24 },
  celebrateCard: { width: "100%", borderRadius: 24, overflow: "hidden", backgroundColor: colors.surfaceSecondary },
  celebrateGradient: { padding: 28, alignItems: "center" },
  celebrateEmoji: { fontSize: 48 },
  celebrateTitle: { color: colors.onBrandPrimary, fontSize: 32, fontWeight: "500", marginTop: 8 },
  celebrateBody: { color: colors.onBrandPrimary, fontSize: 16, marginTop: 8, textAlign: "center" },
  celebrateName: { color: colors.onBrandPrimary, fontSize: 13, marginTop: 12, opacity: 0.85, textAlign: "center" },
  sheetBackdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.surfaceSecondary, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16 },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  sheetTitle: { color: colors.onSurface, fontSize: 18, fontWeight: "500" },
  filterLabel: { color: colors.muted, fontSize: 12, letterSpacing: 0.6, marginTop: 16, marginBottom: 8 },
  ageInput: { flex: 1, height: 44, borderRadius: 12, backgroundColor: colors.surfaceTertiary, color: colors.onSurface, paddingHorizontal: 14, fontSize: 16 },
  textInput: { height: 44, borderRadius: 12, backgroundColor: colors.surfaceTertiary, color: colors.onSurface, paddingHorizontal: 14, fontSize: 15 },
}));
