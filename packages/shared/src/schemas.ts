import { z } from 'zod';
import {
  ALLOWED_CHAT_MESSAGE_TYPES,
  CORNER_STYLES,
  FORMAT_MODES,
  GROUP_PUBLIC_ID_MAX,
  GROUP_PUBLIC_ID_MIN,
  LANGUAGES,
  MESSAGE_BODY_MAX,
  MOMENT_VISIBILITY,
  NICKNAME_MAX,
  NICKNAME_MIN,
  RESERVED_GROUP_IDS,
  RESERVED_USERNAMES,
  THEMES,
  USERNAME_MAX,
  USERNAME_MIN,
} from './constants';

const usernameRegex = /^[a-zA-Z0-9_]+$/;

export const usernameSchema = z
  .string()
  .min(USERNAME_MIN)
  .max(USERNAME_MAX)
  .regex(usernameRegex, 'USERNAME_INVALID')
  .refine((v) => !RESERVED_USERNAMES.includes(v.toLowerCase() as (typeof RESERVED_USERNAMES)[number]), {
    message: 'USERNAME_RESERVED',
  });

export const groupPublicIdSchema = z
  .string()
  .min(GROUP_PUBLIC_ID_MIN)
  .max(GROUP_PUBLIC_ID_MAX)
  .regex(usernameRegex, 'GROUP_ID_INVALID')
  .refine((v) => !RESERVED_GROUP_IDS.includes(v.toLowerCase() as (typeof RESERVED_GROUP_IDS)[number]), {
    message: 'GROUP_ID_RESERVED',
  });

export const registerSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  username: usernameSchema,
  nickname: z.string().min(NICKNAME_MIN).max(NICKNAME_MAX),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(128),
  device_name: z.string().max(128).optional(),
});

export const updateProfileSchema = z.object({
  nickname: z.string().min(NICKNAME_MIN).max(NICKNAME_MAX).optional(),
  bio: z.string().max(300).optional(),
  username: usernameSchema.optional(),
  language: z.enum(LANGUAGES).optional(),
  theme: z.enum(THEMES).optional(),
  corner_style: z.enum(CORNER_STYLES).optional(),
});

export const privacySettingsSchema = z.object({
  searchable_by_username: z.boolean().optional(),
  friend_request_policy: z.enum(['everyone', 'mutual_groups', 'nobody']).optional(),
  show_online_status: z.boolean().optional(),
  show_moments: z.boolean().optional(),
  show_bio: z.boolean().optional(),
  allow_stranger_dm: z.boolean().optional(),
  hide_blocked_in_groups: z.boolean().optional(),
});

export const sendMessageSchema = z.object({
  conversation_id: z.string().uuid(),
  client_message_id: z.string().uuid(),
  message_type: z.enum(ALLOWED_CHAT_MESSAGE_TYPES),
  body: z.string().max(MESSAGE_BODY_MAX).optional(),
  format_mode: z.enum(FORMAT_MODES).default('plain'),
  attachment_ids: z.array(z.string().uuid()).max(10).optional(),
  quote: z
    .object({
      quoted_message_id: z.string().uuid(),
      quote_type: z.enum(['full', 'partial']),
      start_offset: z.number().int().min(0).optional(),
      end_offset: z.number().int().min(0).optional(),
      snapshot_text: z.string().max(2000).optional(),
    })
    .optional(),
  enable_link_preview: z.boolean().default(true),
});

export const createGroupSchema = z.object({
  public_id: groupPublicIdSchema,
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  member_ids: z.array(z.string().uuid()).max(100).optional(),
});

export const updateGroupSettingsSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  public_id: groupPublicIdSchema.optional(),
  max_members: z.number().int().min(2).max(2000).optional(),
  message_ttl_seconds: z.number().int().min(0).max(2592000).optional(),
  allowed_message_types: z.array(z.enum(ALLOWED_CHAT_MESSAGE_TYPES)).min(1).optional(),
  slow_mode_seconds: z.number().int().min(0).max(3600).optional(),
  rate_limit_per_sec: z.number().int().min(1).max(100).optional(),
});

export const announcementSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(10000),
  format_mode: z.enum(['plain', 'markdown']).default('plain'),
});

export const createMomentSchema = z.object({
  body: z.string().max(2000).optional(),
  visibility: z.enum(MOMENT_VISIBILITY).default('friends'),
  selected_user_ids: z.array(z.string().uuid()).optional(),
  media_ids: z.array(z.string().uuid()).max(9).optional(),
});

export const friendRequestSchema = z.object({
  to_user_id: z.string().uuid(),
  message: z.string().max(200).optional(),
});

export const directSettingsSchema = z.object({
  message_ttl_seconds: z.number().int().min(0).max(2592000).optional(),
  allowed_message_types: z.array(z.enum(ALLOWED_CHAT_MESSAGE_TYPES)).min(1).optional(),
});
