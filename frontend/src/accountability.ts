import { useQuery } from "@tanstack/react-query";

import { api } from "@/src/api";
import type { AuthorSummary } from "@/src/types";

export type AccMeta = { markets: string[]; sessions: string[]; plan_sessions: string[]; frequencies: string[]; looking_for: string[]; account_types: string[]; moods: string[] };
export type AccSharing = { plan: boolean; discipline: boolean; plan_followed: boolean; pnl: boolean; mood: boolean; notes: boolean; screenshots: boolean };
export type AccProfile = { user_id: string; user: AuthorSummary; markets: string[]; instruments: string; session: string; timezone: string; frequency: string; working_on: string; looking_for: string[] };
export type AccCandidate = AccProfile & { has_partner: boolean; request_sent: string | null; request_received: string | null };
export type AccPlan = { account_name: string; account_type: string; starting_balance: number; market: string; instruments: string; position_size: string; strategy: string; session: string; daily_target: number; daily_max_loss: number; max_trades: number; updated_at?: string };
export type AccSession = {
  session_id: string; date: string; pnl: number; trades: number; strategy_followed: boolean; max_loss_respected: boolean; stopped_when_done: boolean;
  revenge_or_chase: boolean; mood: string; notes: string; screenshot_url: string | null; target_hit: boolean; max_trades_respected: boolean; plan_followed: boolean;
  discipline_score: number; plan_snapshot: AccPlan; created_at: string;
};
export type AccSharedSession = Partial<AccSession> & { session_id: string; date: string };
export type AccPartner = { partnership_id: string; since: string; user: AuthorSummary; profile: AccProfile | null; shared_plan: AccPlan | null; latest_session: AccSharedSession | null };
export type AccRequest = { request_id: string; from_id: string; to_id: string; created_at: string; from_user?: AuthorSummary; to_user?: AuthorSummary };
export type AccMe = { profile: AccProfile | null; sharing: AccSharing; plan: AccPlan | null; partner: AccPartner | null; incoming_requests: AccRequest[]; outgoing_requests: AccRequest[] };
export type AccProgress = {
  has_plan: boolean; starting_balance: number; current_balance: number; total_pnl: number; days_logged: number; sessions_logged: number; target_hit_rate: number;
  avg_discipline: number; plan_followed_rate: number; max_loss_respected_rate: number; accountability_streak: number; no_revenge_streak: number; history: AccSession[];
};

export const accKeys = { me: ["accountability", "me"], meta: ["accountability", "meta"], partners: ["accountability", "partners"], progress: ["accountability", "progress"], partnerSessions: ["accountability", "partner-sessions"] };

export const useAccMe = (enabled = true) => useQuery({ queryKey: accKeys.me, queryFn: () => api<AccMe>("/accountability/me"), enabled });
export const useAccMeta = () => useQuery({ queryKey: accKeys.meta, queryFn: () => api<AccMeta>("/accountability/meta"), staleTime: Infinity });

export const money = (n: number) => `${n < 0 ? "-" : "+"}$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
export const plainMoney = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
export const yesNo = (v: boolean | undefined) => (v === undefined ? "—" : v ? "Yes" : "No");
