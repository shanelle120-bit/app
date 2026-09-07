export type AuthorSummary = {
  user_id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  trading_style?: string | null;
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
  email?: string;
  auth_providers?: string[];
  created_at?: string;
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
  likes_count: number;
  comments_count: number;
  shares_count: number;
  created_at: string;
  liked: boolean;
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
