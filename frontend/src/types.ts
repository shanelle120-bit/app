export type AuthorSummary = {
  user_id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  trading_style?: string | null;
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
