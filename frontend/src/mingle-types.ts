export type MingleProfile = {
  user_id: string;
  display_name: string;
  age: number;
  location: string;
  trader_type: string;
  trading_style: string | null;
  looking_for: string[];
  bio: string;
  favorite_instrument: string;
  interests: string;
  prompt_key: string | null;
  prompt_label?: string | null;
  prompt_answer: string;
  photo_url: string | null;
  photos: string[];
  created_at?: string;
  // own profile only
  active?: boolean;
  show_badge?: boolean;
  allow_hi_from?: "everyone" | "connections";
};

export type MingleMeta = {
  trader_types: string[];
  trading_styles: string[];
  looking_for: string[];
  prompts: Record<string, string>;
  safety_notice: string;
};

export type MingleConnection = {
  connection_id: string;
  created_at: string;
  other: MingleProfile;
  conversation_id: string | null;
};

export type MingleInboxItem = {
  action: "hi" | "interested";
  created_at: string;
  profile: MingleProfile;
  conversation_id: string | null;
};

export type MingleActionResult = {
  action: "interested" | "hi" | "pass";
  mingle: boolean;
  connection_id?: string;
  conversation_id?: string;
  other?: MingleProfile;
};

export type MingleFilters = {
  min_age: number;
  max_age: number;
  location: string;
  trader_type: string;
  trading_style: string;
  looking_for: string;
};

export const DEFAULT_FILTERS: MingleFilters = { min_age: 18, max_age: 99, location: "", trader_type: "", trading_style: "", looking_for: "" };
