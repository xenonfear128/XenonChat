-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('normal', 'disabled', 'banned', 'deleted');

-- CreateEnum
CREATE TYPE "Theme" AS ENUM ('light', 'dark', 'system');

-- CreateEnum
CREATE TYPE "CornerStyle" AS ENUM ('square', 'soft', 'round');

-- CreateEnum
CREATE TYPE "Language" AS ENUM ('zh-CN', 'en-US');

-- CreateEnum
CREATE TYPE "FriendRequestStatus" AS ENUM ('pending', 'accepted', 'rejected', 'expired', 'cancelled');

-- CreateEnum
CREATE TYPE "ConversationType" AS ENUM ('direct', 'group');

-- CreateEnum
CREATE TYPE "GroupRole" AS ENUM ('owner', 'admin', 'member');

-- CreateEnum
CREATE TYPE "GroupStatus" AS ENUM ('normal', 'archived', 'dissolved', 'banned');

-- CreateEnum
CREATE TYPE "JoinPolicy" AS ENUM ('invite_only', 'public', 'approval_required');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('text', 'voice', 'image', 'video', 'file', 'system', 'announcement_ref', 'deleted');

-- CreateEnum
CREATE TYPE "FormatMode" AS ENUM ('plain', 'markdown', 'latex', 'markdown_latex');

-- CreateEnum
CREATE TYPE "QuoteType" AS ENUM ('full', 'partial');

-- CreateEnum
CREATE TYPE "MomentVisibility" AS ENUM ('public', 'friends', 'selected', 'private');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('friend_request', 'friend_accepted', 'group_invite', 'group_announcement', 'moment_comment', 'moment_reaction', 'system', 'message');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "username" VARCHAR(32) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "nickname" VARCHAR(64) NOT NULL,
    "avatar_url" TEXT,
    "bio" VARCHAR(300),
    "language" "Language" NOT NULL DEFAULT 'zh-CN',
    "theme" "Theme" NOT NULL DEFAULT 'system',
    "corner_style" "CornerStyle" NOT NULL DEFAULT 'soft',
    "status" "UserStatus" NOT NULL DEFAULT 'normal',
    "two_factor_enabled" BOOLEAN NOT NULL DEFAULT false,
    "username_changed_at" TIMESTAMP(3),
    "last_seen_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_privacy" (
    "user_id" UUID NOT NULL,
    "searchable_by_username" BOOLEAN NOT NULL DEFAULT true,
    "friend_request_policy" TEXT NOT NULL DEFAULT 'everyone',
    "show_online_status" BOOLEAN NOT NULL DEFAULT true,
    "show_moments" BOOLEAN NOT NULL DEFAULT true,
    "show_bio" BOOLEAN NOT NULL DEFAULT true,
    "allow_stranger_dm" BOOLEAN NOT NULL DEFAULT false,
    "hide_blocked_in_groups" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "user_privacy_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "device_id" UUID,
    "refresh_token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_devices" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "user_agent" TEXT,
    "ip" TEXT,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "user_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blocked_users" (
    "id" UUID NOT NULL,
    "blocker_user_id" UUID NOT NULL,
    "blocked_user_id" UUID NOT NULL,
    "reason" VARCHAR(200),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blocked_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_groups" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" UUID NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "contact_user_id" UUID NOT NULL,
    "contact_group_id" UUID,
    "remark" VARCHAR(64),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_notes" (
    "id" UUID NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "contact_user_id" UUID NOT NULL,
    "note" VARCHAR(500) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contact_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "friend_requests" (
    "id" UUID NOT NULL,
    "from_user_id" UUID NOT NULL,
    "to_user_id" UUID NOT NULL,
    "message" VARCHAR(200),
    "status" "FriendRequestStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "friend_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "type" "ConversationType" NOT NULL,
    "group_id" UUID,
    "direct_key" VARCHAR(80),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_members" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMP(3),

    CONSTRAINT "conversation_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "direct_conversation_settings" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "peer_user_id" UUID NOT NULL,
    "message_ttl_seconds" INTEGER NOT NULL DEFAULT 0,
    "allowed_message_types" TEXT[] DEFAULT ARRAY['text', 'voice', 'image', 'video', 'file']::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "direct_conversation_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_pins" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "pinned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_pins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_mutes" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "muted_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_mutes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_read_cursors" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "last_read_message_id" UUID,
    "last_read_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_read_cursors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "groups" (
    "id" UUID NOT NULL,
    "public_id" VARCHAR(64) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "avatar_url" TEXT,
    "description" VARCHAR(500),
    "owner_user_id" UUID NOT NULL,
    "max_members" INTEGER NOT NULL DEFAULT 500,
    "member_count" INTEGER NOT NULL DEFAULT 1,
    "message_ttl_seconds" INTEGER NOT NULL DEFAULT 0,
    "allowed_message_types" TEXT[] DEFAULT ARRAY['text', 'voice', 'image', 'video', 'file']::TEXT[],
    "slow_mode_seconds" INTEGER NOT NULL DEFAULT 0,
    "rate_limit_per_sec" INTEGER NOT NULL DEFAULT 10,
    "status" "GroupStatus" NOT NULL DEFAULT 'normal',
    "join_policy" "JoinPolicy" NOT NULL DEFAULT 'invite_only',
    "invite_link_enabled" BOOLEAN NOT NULL DEFAULT false,
    "public_id_changed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "dissolved_at" TIMESTAMP(3),

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_members" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "GroupRole" NOT NULL DEFAULT 'member',
    "muted_until" TIMESTAMP(3),
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMP(3),

    CONSTRAINT "group_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_announcements" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "author_user_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" TEXT NOT NULL,
    "format_mode" "FormatMode" NOT NULL DEFAULT 'plain',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "pinned_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "group_announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_invites" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "created_by" UUID NOT NULL,
    "expires_at" TIMESTAMP(3),
    "max_uses" INTEGER,
    "use_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "group_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_audit_logs" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "target_user_id" UUID,
    "action" TEXT NOT NULL,
    "before_value" JSONB,
    "after_value" JSONB,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "sender_user_id" UUID,
    "client_message_id" UUID,
    "message_type" "MessageType" NOT NULL,
    "body" TEXT,
    "format_mode" "FormatMode" NOT NULL DEFAULT 'plain',
    "metadata" JSONB,
    "ttl_seconds" INTEGER,
    "expires_at" TIMESTAMP(3),
    "edited_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_attachments" (
    "id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "media_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "message_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_quotes" (
    "id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "quoted_message_id" UUID NOT NULL,
    "quoted_sender_user_id" UUID,
    "quoted_sender_display_name_snapshot" TEXT,
    "quote_type" "QuoteType" NOT NULL,
    "snapshot_text" TEXT,
    "snapshot_format" "FormatMode",
    "start_offset" INTEGER,
    "end_offset" INTEGER,
    "quoted_message_type" "MessageType",
    "quoted_attachment_summary" TEXT,
    "quoted_created_at" TIMESTAMP(3),
    "original_expired" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "message_quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_link_previews" (
    "id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "link_preview_id" UUID NOT NULL,

    CONSTRAINT "message_link_previews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_reactions" (
    "id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "reaction" VARCHAR(32) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_reactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_edits" (
    "id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "edited_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_edits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_deletions" (
    "id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_deletions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_reports" (
    "id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "reporter_id" UUID NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "link_previews" (
    "id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "url_hash" TEXT NOT NULL,
    "canonical_url" TEXT,
    "domain" TEXT,
    "title" TEXT,
    "description" TEXT,
    "image_url" TEXT,
    "favicon_url" TEXT,
    "site_name" TEXT,
    "fetch_status" TEXT NOT NULL DEFAULT 'ok',
    "error_reason" TEXT,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "link_previews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_objects" (
    "id" UUID NOT NULL,
    "uploader_id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "original_name" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "duration_ms" INTEGER,
    "checksum" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ready',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "media_objects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_thumbnails" (
    "id" UUID NOT NULL,
    "media_id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "size_bytes" INTEGER NOT NULL,

    CONSTRAINT "media_thumbnails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moments_posts" (
    "id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "body" TEXT,
    "visibility" "MomentVisibility" NOT NULL DEFAULT 'friends',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "moments_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moments_post_media" (
    "id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "media_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "moments_post_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moments_comments" (
    "id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "body" VARCHAR(1000) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "moments_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moments_reactions" (
    "id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "reaction" VARCHAR(32) NOT NULL DEFAULT 'like',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moments_reactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moments_visibility" (
    "id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,

    CONSTRAINT "moments_visibility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moments_reports" (
    "id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "reporter_id" UUID NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moments_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" VARCHAR(500),
    "payload" JSONB,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID,
    "action" TEXT NOT NULL,
    "target_type" TEXT,
    "target_id" TEXT,
    "metadata" JSONB,
    "ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moderation_actions" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "target_type" TEXT NOT NULL,
    "target_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moderation_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE INDEX "users_last_seen_at_idx" ON "users"("last_seen_at");

-- CreateIndex
CREATE INDEX "user_sessions_user_id_idx" ON "user_sessions"("user_id");

-- CreateIndex
CREATE INDEX "user_sessions_refresh_token_hash_idx" ON "user_sessions"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "user_devices_user_id_idx" ON "user_devices"("user_id");

-- CreateIndex
CREATE INDEX "blocked_users_blocked_user_id_idx" ON "blocked_users"("blocked_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "blocked_users_blocker_user_id_blocked_user_id_key" ON "blocked_users"("blocker_user_id", "blocked_user_id");

-- CreateIndex
CREATE INDEX "contact_groups_owner_id_idx" ON "contact_groups"("owner_id");

-- CreateIndex
CREATE INDEX "contacts_contact_user_id_idx" ON "contacts"("contact_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_owner_user_id_contact_user_id_key" ON "contacts"("owner_user_id", "contact_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "contact_notes_owner_user_id_contact_user_id_key" ON "contact_notes"("owner_user_id", "contact_user_id");

-- CreateIndex
CREATE INDEX "friend_requests_to_user_id_status_idx" ON "friend_requests"("to_user_id", "status");

-- CreateIndex
CREATE INDEX "friend_requests_from_user_id_status_idx" ON "friend_requests"("from_user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_group_id_key" ON "conversations"("group_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_direct_key_key" ON "conversations"("direct_key");

-- CreateIndex
CREATE INDEX "conversations_type_updated_at_idx" ON "conversations"("type", "updated_at");

-- CreateIndex
CREATE INDEX "conversation_members_user_id_idx" ON "conversation_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_members_conversation_id_user_id_key" ON "conversation_members"("conversation_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "direct_conversation_settings_conversation_id_owner_user_id_key" ON "direct_conversation_settings"("conversation_id", "owner_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_pins_conversation_id_user_id_key" ON "conversation_pins"("conversation_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_mutes_conversation_id_user_id_key" ON "conversation_mutes"("conversation_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_read_cursors_conversation_id_user_id_key" ON "conversation_read_cursors"("conversation_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "groups_public_id_key" ON "groups"("public_id");

-- CreateIndex
CREATE INDEX "groups_owner_user_id_idx" ON "groups"("owner_user_id");

-- CreateIndex
CREATE INDEX "groups_status_idx" ON "groups"("status");

-- CreateIndex
CREATE INDEX "group_members_user_id_idx" ON "group_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "group_members_group_id_user_id_key" ON "group_members"("group_id", "user_id");

-- CreateIndex
CREATE INDEX "group_announcements_group_id_pinned_pinned_order_idx" ON "group_announcements"("group_id", "pinned", "pinned_order");

-- CreateIndex
CREATE UNIQUE INDEX "group_invites_code_key" ON "group_invites"("code");

-- CreateIndex
CREATE INDEX "group_audit_logs_group_id_created_at_idx" ON "group_audit_logs"("group_id", "created_at");

-- CreateIndex
CREATE INDEX "messages_conversation_id_created_at_idx" ON "messages"("conversation_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "messages_expires_at_idx" ON "messages"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "messages_sender_user_id_client_message_id_key" ON "messages"("sender_user_id", "client_message_id");

-- CreateIndex
CREATE INDEX "message_attachments_message_id_idx" ON "message_attachments"("message_id");

-- CreateIndex
CREATE UNIQUE INDEX "message_quotes_message_id_key" ON "message_quotes"("message_id");

-- CreateIndex
CREATE INDEX "message_quotes_quoted_message_id_idx" ON "message_quotes"("quoted_message_id");

-- CreateIndex
CREATE UNIQUE INDEX "message_link_previews_message_id_link_preview_id_key" ON "message_link_previews"("message_id", "link_preview_id");

-- CreateIndex
CREATE UNIQUE INDEX "message_reactions_message_id_user_id_reaction_key" ON "message_reactions"("message_id", "user_id", "reaction");

-- CreateIndex
CREATE INDEX "message_edits_message_id_idx" ON "message_edits"("message_id");

-- CreateIndex
CREATE UNIQUE INDEX "message_deletions_message_id_user_id_key" ON "message_deletions"("message_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "link_previews_url_hash_key" ON "link_previews"("url_hash");

-- CreateIndex
CREATE INDEX "link_previews_expires_at_idx" ON "link_previews"("expires_at");

-- CreateIndex
CREATE INDEX "media_objects_uploader_id_idx" ON "media_objects"("uploader_id");

-- CreateIndex
CREATE INDEX "moments_posts_author_id_created_at_idx" ON "moments_posts"("author_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "moments_comments_post_id_created_at_idx" ON "moments_comments"("post_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "moments_reactions_post_id_user_id_reaction_key" ON "moments_reactions"("post_id", "user_id", "reaction");

-- CreateIndex
CREATE UNIQUE INDEX "moments_visibility_post_id_user_id_key" ON "moments_visibility"("post_id", "user_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "moderation_actions_target_type_target_id_idx" ON "moderation_actions"("target_type", "target_id");

-- AddForeignKey
ALTER TABLE "user_privacy" ADD CONSTRAINT "user_privacy_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "user_devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_devices" ADD CONSTRAINT "user_devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocked_users" ADD CONSTRAINT "blocked_users_blocker_user_id_fkey" FOREIGN KEY ("blocker_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocked_users" ADD CONSTRAINT "blocked_users_blocked_user_id_fkey" FOREIGN KEY ("blocked_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_groups" ADD CONSTRAINT "contact_groups_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_contact_user_id_fkey" FOREIGN KEY ("contact_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_contact_group_id_fkey" FOREIGN KEY ("contact_group_id") REFERENCES "contact_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_notes" ADD CONSTRAINT "contact_notes_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friend_requests" ADD CONSTRAINT "friend_requests_from_user_id_fkey" FOREIGN KEY ("from_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friend_requests" ADD CONSTRAINT "friend_requests_to_user_id_fkey" FOREIGN KEY ("to_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_conversation_settings" ADD CONSTRAINT "direct_conversation_settings_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_conversation_settings" ADD CONSTRAINT "direct_conversation_settings_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_conversation_settings" ADD CONSTRAINT "direct_conversation_settings_peer_user_id_fkey" FOREIGN KEY ("peer_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_pins" ADD CONSTRAINT "conversation_pins_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_pins" ADD CONSTRAINT "conversation_pins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_mutes" ADD CONSTRAINT "conversation_mutes_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_mutes" ADD CONSTRAINT "conversation_mutes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_read_cursors" ADD CONSTRAINT "conversation_read_cursors_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_read_cursors" ADD CONSTRAINT "conversation_read_cursors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_announcements" ADD CONSTRAINT "group_announcements_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_announcements" ADD CONSTRAINT "group_announcements_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_invites" ADD CONSTRAINT "group_invites_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_audit_logs" ADD CONSTRAINT "group_audit_logs_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_audit_logs" ADD CONSTRAINT "group_audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media_objects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_quotes" ADD CONSTRAINT "message_quotes_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_link_previews" ADD CONSTRAINT "message_link_previews_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_link_previews" ADD CONSTRAINT "message_link_previews_link_preview_id_fkey" FOREIGN KEY ("link_preview_id") REFERENCES "link_previews"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_edits" ADD CONSTRAINT "message_edits_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_deletions" ADD CONSTRAINT "message_deletions_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_deletions" ADD CONSTRAINT "message_deletions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_reports" ADD CONSTRAINT "message_reports_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_reports" ADD CONSTRAINT "message_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_objects" ADD CONSTRAINT "media_objects_uploader_id_fkey" FOREIGN KEY ("uploader_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_thumbnails" ADD CONSTRAINT "media_thumbnails_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media_objects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moments_posts" ADD CONSTRAINT "moments_posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moments_post_media" ADD CONSTRAINT "moments_post_media_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "moments_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moments_post_media" ADD CONSTRAINT "moments_post_media_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media_objects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moments_comments" ADD CONSTRAINT "moments_comments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "moments_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moments_comments" ADD CONSTRAINT "moments_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moments_reactions" ADD CONSTRAINT "moments_reactions_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "moments_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moments_reactions" ADD CONSTRAINT "moments_reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moments_visibility" ADD CONSTRAINT "moments_visibility_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "moments_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moments_reports" ADD CONSTRAINT "moments_reports_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "moments_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
