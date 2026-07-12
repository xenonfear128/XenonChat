export type ThemeMode = 'light' | 'dark' | 'system';
export type CornerStyle = 'square' | 'soft' | 'round';
export type FormatMode = 'plain' | 'markdown' | 'latex' | 'markdown_latex';
export type Locale = 'zh-CN' | 'en-US';

export type PublicUser = {
  id: string;
  user_id: string;
  nickname: string;
  avatar_url: string | null;
  bio?: string | null;
  language?: Locale | string;
  theme?: ThemeMode | string;
  corner_style?: CornerStyle | string;
  email?: string;
  created_at?: string;
  online?: boolean;
};

export type AuthTokens = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: PublicUser;
};

export type ConversationSummary = {
  id: string;
  type: 'direct' | 'group';
  updated_at: string;
  pinned: boolean;
  muted: boolean;
  unread_count: number;
  title: string;
  avatar_url?: string | null;
  peer?: PublicUser | null;
  group?: {
    id: string;
    public_id?: string;
    group_id?: string;
    name: string;
    avatar_url?: string | null;
    member_count?: number;
    description?: string | null;
  } | null;
  last_message?: {
    id: string;
    body: string | null;
    message_type: string;
    created_at: string;
    sender_user_id?: string | null;
  } | null;
};

export type LinkPreview = {
  id: string;
  url: string;
  domain?: string | null;
  title?: string | null;
  description?: string | null;
  image_url?: string | null;
  site_name?: string | null;
  favicon_url?: string | null;
  fetch_status?: string;
};

export type MessageAttachment = {
  id: string;
  mime_type: string;
  size_bytes: number;
  original_name?: string | null;
  width?: number | null;
  height?: number | null;
  duration_ms?: number | null;
  url?: string | null;
};

export type MessageQuote = {
  quoted_message_id: string;
  quoted_sender_user_id?: string | null;
  quoted_sender_display_name?: string | null;
  quote_type: 'full' | 'partial';
  snapshot_text?: string | null;
  snapshot_format?: string | null;
  start_offset?: number | null;
  end_offset?: number | null;
  quoted_message_type?: string | null;
  original_expired?: boolean;
};

export type ChatMessage = {
  id: string;
  conversation_id: string;
  sender_user_id: string | null;
  client_message_id?: string | null;
  message_type: string;
  body: string | null;
  format_mode: FormatMode | string;
  ttl_seconds?: number | null;
  expires_at?: string | null;
  edited_at?: string | null;
  revoked_at?: string | null;
  created_at: string;
  updated_at?: string;
  sender?: PublicUser | null;
  quote?: MessageQuote | null;
  attachments?: MessageAttachment[];
  link_previews?: LinkPreview[];
  pending?: boolean;
  failed?: boolean;
};

export type Contact = {
  user: PublicUser;
  remark?: string | null;
  created_at?: string;
};

export type FriendRequest = {
  id: string;
  status: string;
  message?: string | null;
  created_at: string;
  from_user: PublicUser;
  to_user: PublicUser;
  direction?: 'incoming' | 'outgoing';
};

export type BlockedUser = {
  user: PublicUser;
  reason?: string | null;
  created_at?: string;
};

export type MomentPost = {
  id: string;
  body: string | null;
  visibility: string;
  created_at: string;
  author: PublicUser;
  media?: MessageAttachment[];
  reaction_count?: number;
  reactions_count?: number;
  comment_count?: number;
  reacted?: boolean;
  comments?: Array<{
    id: string;
    body: string;
    created_at: string;
    author: PublicUser;
  }>;
};

export type Device = {
  id: string;
  name: string;
  ip?: string | null;
  user_agent?: string | null;
  created_at: string;
  last_seen_at?: string | null;
  current?: boolean;
};

export type PrivacySettings = {
  searchable_by_username: boolean;
  friend_request_policy: 'everyone' | 'mutual_groups' | 'nobody';
  show_online_status: boolean;
  show_moments: boolean;
  show_bio: boolean;
  allow_stranger_dm: boolean;
  hide_blocked_in_groups?: boolean;
};

export type ApiErrorBody = {
  code?: string;
  message?: string;
  details?: unknown;
};

export type ApiResponse<T> = {
  ok: boolean;
  data?: T;
  error?: ApiErrorBody;
};
