export const RESERVED_USERNAMES = [
  'admin',
  'system',
  'root',
  'support',
  'official',
  'null',
  'undefined',
  'xenon',
  'xenonchat',
  'moderator',
  'bot',
  'api',
  'www',
  'help',
] as const;

export const RESERVED_GROUP_IDS = [
  'admin',
  'system',
  'root',
  'support',
  'official',
  'null',
  'undefined',
  'public',
  'everyone',
] as const;

export const MESSAGE_TYPES = ['text', 'voice', 'image', 'video', 'file', 'system', 'announcement_ref', 'deleted'] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];

export const ALLOWED_CHAT_MESSAGE_TYPES = ['text', 'voice', 'image', 'video', 'file'] as const;
export type AllowedChatMessageType = (typeof ALLOWED_CHAT_MESSAGE_TYPES)[number];

export const FORMAT_MODES = ['plain', 'markdown', 'latex', 'markdown_latex'] as const;
export type FormatMode = (typeof FORMAT_MODES)[number];

export const THEMES = ['light', 'dark', 'system'] as const;
export type Theme = (typeof THEMES)[number];

export const CORNER_STYLES = ['square', 'soft', 'round'] as const;
export type CornerStyle = (typeof CORNER_STYLES)[number];

export const LANGUAGES = ['zh-CN', 'en-US'] as const;
export type Language = (typeof LANGUAGES)[number];

export const GROUP_ROLES = ['owner', 'admin', 'member'] as const;
export type GroupRole = (typeof GROUP_ROLES)[number];

export const USER_STATUSES = ['normal', 'disabled', 'banned', 'deleted'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const FRIEND_REQUEST_STATUSES = ['pending', 'accepted', 'rejected', 'expired', 'cancelled'] as const;
export type FriendRequestStatus = (typeof FRIEND_REQUEST_STATUSES)[number];

export const MOMENT_VISIBILITY = ['public', 'friends', 'selected', 'private'] as const;
export type MomentVisibility = (typeof MOMENT_VISIBILITY)[number];

export const TTL_PRESETS_SECONDS = [0, 300, 3600, 86400, 604800, 2592000] as const;

export const USERNAME_MIN = 4;
export const USERNAME_MAX = 32;
export const NICKNAME_MIN = 1;
export const NICKNAME_MAX = 64;
export const BIO_MAX = 300;
export const GROUP_PUBLIC_ID_MIN = 4;
export const GROUP_PUBLIC_ID_MAX = 64;
export const GROUP_NAME_MAX = 100;
export const MESSAGE_BODY_MAX = 10000;
export const VOICE_MAX_SECONDS = 300;
export const USERNAME_CHANGE_COOLDOWN_DAYS = 30;

export const DEFAULT_ALLOWED_MESSAGE_TYPES: AllowedChatMessageType[] = [
  'text',
  'voice',
  'image',
  'video',
  'file',
];

export const SLOW_MODE_PRESETS_SECONDS = [0, 1, 5, 10, 30, 60] as const;
