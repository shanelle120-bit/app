export type AuthorSummary = {
  user_id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  trading_style?: string | null;
  is_founding_member?: boolean;
  // Present when the summary is a Single & Mingle identity (never the main profile)
  mingle?: boolean;
  age?: number | null;
  location?: string | null;
};

export type User = {
  user_id: string;
  display_name: string;
  username: string | null;
  bio: string;
  avatar_url: string | null;
  cover_url: string | null;
  markets: string[];
  instruments: string[];
  trading_style: string | null;
  trading_session: string | null;
  followers_count: number;
  following_count: number;
  posts_count: number;
  photos_count?: number;
  videos_count?: number;
  onboarding_complete: boolean;
  is_verified?: boolean;
  is_founding_member?: boolean;
  is_following?: boolean;
  is_me?: boolean;
  mingle_badge?: boolean;
  tier?: "free" | "premium";
  email?: string;
  auth_providers?: string[];
  created_at?: string;
  has_seen_trading_disclaimer?: boolean;
  has_seen_mingle_safety?: boolean;
  is_admin?: boolean;
};

export type NotificationType = "like" | "comment" | "mention" | "follow" | "mingle_hi" | "mingle_interested" | "mingle_match";

export type Notification = {
  notification_id: string;
  user_id: string;
  actor_id: string;
  actor: AuthorSummary;
  type: NotificationType;
  post_id: string | null;
  comment_id: string | null;
  text: string;
  reaction?: string | null;
  read: boolean;
  mingle?: boolean;
  created_at: string;
};

export type PremiumPlan = {
  id: "monthly" | "yearly";
  name: string;
  price: string | null;
  price_note: string;
  badge?: string;
  perks: string[];
};

export type PremiumFeature = {
  key: string;
  name: string;
  premium: boolean;
  available: boolean;
  unlocked: boolean;
};

export type Membership = {
  tier: "free" | "premium";
  plan: "monthly" | "yearly" | null;
  since: string | null;
  source: string | null;
  cancel_at_period_end: boolean;
  current_period_end: number | null;
  subscription_status: string | null;
  plans: PremiumPlan[];
  features: PremiumFeature[];
  notified_billing: boolean;
};

export type BillingWaitlistEntry = {
  user_id: string;
  email: string | null;
  display_name: string | null;
  plan: "monthly" | "yearly" | null;
  created_at: string;
  updated_at: string | null;
};

export type AdminUserEntry = {
  user_id: string;
  display_name: string | null;
  username: string | null;
  email: string | null;
  avatar_url: string | null;
  tier: "free" | "premium";
  is_complimentary: boolean;
  is_founding_member: boolean;
  is_admin: boolean;
  account_status: "active" | "suspended" | "banned";
  subscription_status: string | null;
  created_at: string | null;
  deleted: boolean;
};

export type AdminNote = { note_id: string; text: string; author_name: string | null; created_at: string };
export type AdminAuditItem = { action: string; admin_name: string | null; reason: string | null; changes: Record<string, unknown>; created_at: string };
export type AdminUserDetail = {
  user_id: string;
  display_name: string | null;
  username: string | null;
  email: string | null;
  avatar_url: string | null;
  bio: string | null;
  created_at: string | null;
  deleted: boolean;
  is_admin: boolean;
  account_status: "active" | "suspended" | "banned";
  account_status_reason: string | null;
  account_status_at: string | null;
  membership: { tier: string; plan: string | null; source: string | null; since: string | null; current_period_end: number | null; cancel_at_period_end: boolean };
  subscription_status: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  is_founding_member: boolean;
  is_complimentary_premium: boolean;
  notes: AdminNote[];
  history: AdminAuditItem[];
  safety: { reports_filed: number; reports_received: number; mingle_blocks_given: number; mingle_blocks_received: number };
};

export type AdminDashboard = {
  total_users: number;
  active_users: number;
  new_signups_7d: number;
  free_users: number;
  premium_users: number;
  trial_users: number;
  complimentary_premium_users: number;
  founding_members: number;
  suspended_users: number;
  banned_users: number;
  open_reports: number;
};

export type AdminReport = {
  report_id: string;
  target_type: "post" | "comment" | "profile" | "message" | "mingle_user";
  target_id: string;
  reason: string;
  details: string | null;
  status: "open" | "resolved";
  resolution: string | null;
  resolution_note: string | null;
  reporter: { user_id: string; display_name: string | null; username: string | null; avatar_url: string | null };
  content: { summary: string; author?: { user_id: string; display_name: string | null; username: string | null; avatar_url: string | null }; removed?: boolean };
  created_at: string;
  resolved_at: string | null;
};

export type Announcement = { announcement_id: string; title: string; body: string; pinned?: boolean; active?: boolean; created_by_name?: string; created_at: string };

export type MediaItem = {
  type: "image" | "video" | "gif";
  url: string;
  width?: number | null;
  height?: number | null;
};

export type Post = {
  post_id: string;
  author_id: string;
  author: AuthorSummary;
  text: string;
  media: MediaItem[];
  mentions: string[];
  mentioned_users?: AuthorSummary[];
  edited_at?: string | null;
  space?: "main" | "trading" | "mingle";
  likes_count: number;
  comments_count: number;
  shares_count: number;
  created_at: string;
  liked: boolean;
  my_reaction?: string | null;
  reactions?: Record<string, number>;
  saved: boolean;
  is_mine: boolean;
};

export type Comment = {
  comment_id: string;
  post_id: string;
  author_id: string;
  author: AuthorSummary;
  parent_id: string | null;
  text: string;
  gif_url: string | null;
  mentions?: string[];
  mentioned_users?: AuthorSummary[];
  likes_count: number;
  created_at: string;
  liked: boolean;
  is_mine: boolean;
};

export type Story = AuthorSummary & {
  latest_post_at: string | null;
  latest_post_id: string | null;
};

export type Conversation = {
  conversation_id: string;
  other_user: AuthorSummary;
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number;
};

export type Message = {
  message_id: string;
  conversation_id: string;
  sender_id: string;
  text: string;
  gif_url: string | null;
  image_url: string | null;
  audio_url?: string | null;
  audio_duration?: number | null;
  created_at: string;
  is_mine: boolean;
};

export type Gif = {
  id: string;
  title: string;
  preview_url: string;
  url: string;
  width: number;
  height: number;
};
