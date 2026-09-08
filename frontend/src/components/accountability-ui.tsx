import Ionicons from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import React from "react";
import { Pressable, Text, View } from "react-native";

import { mediaUrl } from "@/src/api";
import { money, plainMoney, yesNo, type AccPlan, type AccSession, type AccSharedSession } from "@/src/accountability";
import { Chip } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";

export function OptionChips({ label, options, value, onChange, multi, testID }: { label: string; options: string[]; value: string[] | string; onChange: (v: any) => void; multi?: boolean; testID: string }) {
  const styles = useStyles();
  const selected = (o: string) => (multi ? (value as string[]).includes(o) : value === o);
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.chips}>
        {options.map((o) => (
          <Chip key={o} label={o} selected={selected(o)} tone="cyan" onPress={() => onChange(multi ? (selected(o) ? (value as string[]).filter((x) => x !== o) : [...(value as string[]), o]) : o)} testID={`${testID}-${o}`} />
        ))}
      </View>
    </View>
  );
}

export function YesNo({ label, value, onChange, testID }: { label: string; value: boolean | null; onChange: (v: boolean) => void; testID: string }) {
  const styles = useStyles();
  return (
    <View style={styles.yesNoRow}>
      <Text style={[styles.body, { flex: 1 }]}>{label}</Text>
      <Chip label="Yes" selected={value === true} tone="cyan" onPress={() => onChange(true)} testID={`${testID}-yes`} />
      <Chip label="No" selected={value === false} tone="cyan" onPress={() => onChange(false)} testID={`${testID}-no`} />
    </View>
  );
}

export function StatTile({ label, value, tone, testID }: { label: string; value: string; tone?: "good" | "bad"; testID?: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.tile} testID={testID}>
      <Text style={[styles.tileValue, tone === "good" && { color: colors.success }, tone === "bad" && { color: colors.error }]}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

export function PlanSummary({ plan, title = "Today's Plan" }: { plan: AccPlan; title?: string }) {
  const styles = useStyles();
  const rows: [string, string][] = [
    ["Account", `${plan.account_name} · ${plan.account_type}`],
    ["Target", plainMoney(plan.daily_target)],
    ["Max Loss", plainMoney(plan.daily_max_loss)],
    ["Max Trades", String(plan.max_trades)],
    ["Strategy", plan.strategy || "—"],
    ["Instrument", plan.instruments || plan.market],
    ["Contracts / Size", plan.position_size || "—"],
    ["Session", plan.session],
  ];
  return (
    <View style={styles.planBox} testID="plan-summary">
      <Text style={styles.planTitle}>{title}</Text>
      {rows.map(([k, v]) => (
        <View key={k} style={styles.planRow}>
          <Text style={styles.planKey}>{k}</Text>
          <Text style={styles.planVal} numberOfLines={2}>{v}</Text>
        </View>
      ))}
    </View>
  );
}

export function ScoreBadge({ score }: { score: number }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const color = score >= 80 ? colors.success : score >= 60 ? colors.warning : colors.error;
  return (
    <View style={[styles.score, { borderColor: color }]} testID="discipline-score">
      <Text style={[styles.scoreText, { color }]}>{score}/100</Text>
    </View>
  );
}

export function SessionRow({ s, onPress }: { s: AccSession; onPress?: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} style={styles.row} testID={`session-row-${s.session_id}`}>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text style={styles.rowDate}>{s.date} · {s.mood}</Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          Target hit: {yesNo(s.target_hit)} · Plan followed: {yesNo(s.plan_followed)}
        </Text>
      </View>
      <Text style={[styles.pnl, { color: s.pnl >= 0 ? colors.success : colors.error }]}>{money(s.pnl)}</Text>
      <ScoreBadge score={s.discipline_score} />
    </Pressable>
  );
}

/** Full detail for the owner (all fields) or a partner (only the shared subset is present). */
export function SessionDetail({ s }: { s: AccSharedSession }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const has = (k: keyof AccSharedSession) => s[k] !== undefined && s[k] !== null;
  return (
    <View style={{ gap: 14 }}>
      <View style={styles.headline}>
        {has("pnl") ? <Text style={[styles.bigPnl, { color: (s.pnl ?? 0) >= 0 ? colors.success : colors.error }]}>{money(s.pnl!)}</Text> : null}
        {has("discipline_score") ? <ScoreBadge score={s.discipline_score!} /> : null}
      </View>
      <View style={styles.planBox}>
        {has("target_hit") ? <Line k="Target Hit" v={yesNo(s.target_hit)} /> : null}
        {has("plan_followed") ? <Line k="Plan Followed" v={yesNo(s.plan_followed)} /> : null}
        {has("max_trades_respected") ? <Line k="Max Trades Respected" v={yesNo(s.max_trades_respected)} /> : null}
        {has("max_loss_respected") ? <Line k="Max Loss Respected" v={yesNo(s.max_loss_respected)} /> : null}
        {has("stopped_when_done") ? <Line k="Stopped When Done" v={yesNo(s.stopped_when_done)} /> : null}
        {has("revenge_or_chase") ? <Line k="No Revenge / Chasing" v={yesNo(!s.revenge_or_chase)} /> : null}
        {has("trades") ? <Line k="Trades Taken" v={String(s.trades)} /> : null}
        {has("mood") ? <Line k="Mood" v={s.mood!} /> : null}
      </View>
      {s.notes ? (
        <View style={styles.planBox}>
          <Text style={styles.planTitle}>Notes</Text>
          <Text style={styles.body}>{s.notes}</Text>
        </View>
      ) : null}
      {s.screenshot_url ? <Image source={{ uri: mediaUrl(s.screenshot_url) }} style={styles.shot} contentFit="cover" /> : null}
      {s.plan_snapshot ? <PlanSummary plan={s.plan_snapshot} title="Plan on this day (snapshot)" /> : null}
    </View>
  );
}

function Line({ k, v }: { k: string; v: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const good = v === "Yes";
  const bad = v === "No";
  return (
    <View style={styles.planRow}>
      <Text style={styles.planKey}>{k}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        {good || bad ? <Ionicons name={good ? "checkmark-circle" : "close-circle"} size={16} color={good ? colors.success : colors.error} /> : null}
        <Text style={styles.planVal}>{v}</Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  label: { color: colors.muted, fontSize: 12, letterSpacing: 0.6, textTransform: "uppercase" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  body: { color: colors.onSurfaceSecondary, fontSize: 14, lineHeight: 20 },
  yesNoRow: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 48 },
  tile: { flexBasis: "47%", flexGrow: 1, backgroundColor: colors.surfaceSecondary, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 4 },
  tileValue: { color: colors.onSurface, fontSize: 22, fontWeight: "500" },
  tileLabel: { color: colors.muted, fontSize: 12 },
  planBox: { backgroundColor: colors.surfaceSecondary, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 8 },
  planTitle: { color: colors.brandSecondary, fontSize: 12, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 2 },
  planRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  planKey: { color: colors.muted, fontSize: 13 },
  planVal: { color: colors.onSurface, fontSize: 13, flexShrink: 1, textAlign: "right" },
  score: { borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 10, height: 28, justifyContent: "center" },
  scoreText: { fontSize: 13, fontWeight: "500" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.divider },
  rowDate: { color: colors.onSurface, fontSize: 14, fontWeight: "500" },
  rowMeta: { color: colors.muted, fontSize: 12 },
  pnl: { fontSize: 15, fontWeight: "500" },
  headline: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  bigPnl: { fontSize: 32, fontWeight: "500" },
  shot: { width: "100%", aspectRatio: 1.5, borderRadius: 14, backgroundColor: colors.surfaceTertiary },
}));
