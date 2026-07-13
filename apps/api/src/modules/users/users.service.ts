import { Injectable } from '@nestjs/common';
import {
  ErrorCodes,
  USERNAME_CHANGE_COOLDOWN_DAYS,
  privacySettingsSchema,
  updateProfileSchema,
} from '@xenonchat/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AppError } from '../../common/errors/app-error';
import { StorageService } from '../../storage/storage.service';
import { detectMimeFromBuffer } from '../../common/files/magic';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  toPublic(
    user: {
      id: string;
      username: string;
      nickname: string;
      avatarUrl: string | null;
      bio: string | null;
      language: string;
      theme: string;
      cornerStyle: string;
      email?: string;
      lastSeenAt?: Date | null;
      createdAt: Date;
      privacy?: {
        searchableByUsername: boolean;
        friendRequestPolicy: string;
        showOnlineStatus: boolean;
        showMoments: boolean;
        showBio: boolean;
        allowStrangerDm: boolean;
        hideBlockedInGroups: boolean;
      } | null;
    },
    opts: {
      includeEmail?: boolean;
      includePrivacy?: boolean;
      hideBio?: boolean;
      hideLastSeen?: boolean;
    } = {},
  ) {
    return {
      id: user.id,
      user_id: user.username,
      nickname: user.nickname,
      avatar_url: user.avatarUrl,
      bio: opts.hideBio ? undefined : user.bio,
      language: user.language === 'zh_CN' ? 'zh-CN' : 'en-US',
      theme: user.theme,
      corner_style: user.cornerStyle,
      email: opts.includeEmail ? user.email : undefined,
      last_seen_at:
        opts.hideLastSeen || user.privacy?.showOnlineStatus === false
          ? undefined
          : user.lastSeenAt?.toISOString(),
      created_at: user.createdAt.toISOString(),
      privacy: opts.includePrivacy && user.privacy
        ? {
            searchable_by_username: user.privacy.searchableByUsername,
            friend_request_policy: user.privacy.friendRequestPolicy,
            show_online_status: user.privacy.showOnlineStatus,
            show_moments: user.privacy.showMoments,
            show_bio: user.privacy.showBio,
            allow_stranger_dm: user.privacy.allowStrangerDm,
            hide_blocked_in_groups: user.privacy.hideBlockedInGroups,
          }
        : undefined,
    };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { privacy: true },
    });
    return this.toPublic(user, { includeEmail: true, includePrivacy: true });
  }

  async updateMe(userId: string, body: unknown) {
    const data = updateProfileSchema.parse(body);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    if (data.username && data.username.toLowerCase() !== user.username) {
      if (user.usernameChangedAt) {
        const next = new Date(user.usernameChangedAt);
        next.setDate(next.getDate() + USERNAME_CHANGE_COOLDOWN_DAYS);
        if (next > new Date()) {
          throw new AppError(ErrorCodes.USER_ID_CHANGE_TOO_FREQUENT, 'Username change cooldown');
        }
      }
      const taken = await this.prisma.user.findUnique({
        where: { username: data.username.toLowerCase() },
      });
      if (taken) throw new AppError(ErrorCodes.USER_ID_ALREADY_EXISTS, 'Username taken');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        nickname: data.nickname,
        bio: data.bio,
        username: data.username ? data.username.toLowerCase() : undefined,
        usernameChangedAt: data.username ? new Date() : undefined,
        language: data.language === 'zh-CN' ? 'zh_CN' : data.language === 'en-US' ? 'en_US' : undefined,
        theme: data.theme,
        cornerStyle: data.corner_style,
      },
      include: { privacy: true },
    });
    return this.toPublic(updated, { includeEmail: true, includePrivacy: true });
  }

  async updatePrivacy(userId: string, body: unknown) {
    const data = privacySettingsSchema.parse(body);
    const privacy = await this.prisma.userPrivacy.upsert({
      where: { userId },
      create: {
        userId,
        searchableByUsername: data.searchable_by_username ?? true,
        friendRequestPolicy: data.friend_request_policy ?? 'everyone',
        showOnlineStatus: data.show_online_status ?? true,
        showMoments: data.show_moments ?? true,
        showBio: data.show_bio ?? true,
        allowStrangerDm: data.allow_stranger_dm ?? false,
        hideBlockedInGroups: data.hide_blocked_in_groups ?? false,
      },
      update: {
        searchableByUsername: data.searchable_by_username,
        friendRequestPolicy: data.friend_request_policy,
        showOnlineStatus: data.show_online_status,
        showMoments: data.show_moments,
        showBio: data.show_bio,
        allowStrangerDm: data.allow_stranger_dm,
        hideBlockedInGroups: data.hide_blocked_in_groups,
      },
    });
    return {
      searchable_by_username: privacy.searchableByUsername,
      friend_request_policy: privacy.friendRequestPolicy,
      show_online_status: privacy.showOnlineStatus,
      show_moments: privacy.showMoments,
      show_bio: privacy.showBio,
      allow_stranger_dm: privacy.allowStrangerDm,
      hide_blocked_in_groups: privacy.hideBlockedInGroups,
    };
  }

  async getById(viewerId: string, userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, status: 'normal', deletedAt: null },
      include: { privacy: true },
    });
    if (!user) throw new AppError(ErrorCodes.USER_NOT_FOUND, 'User not found', 404);
    const blocked = await this.prisma.blockedUser.findFirst({
      where: {
        OR: [
          { blockerUserId: viewerId, blockedUserId: userId },
          { blockerUserId: userId, blockedUserId: viewerId },
        ],
      },
    });
    return this.toPublic(user, {
      hideBio:
        Boolean(blocked) ||
        (user.privacy?.showBio === false && viewerId !== userId),
      hideLastSeen: Boolean(blocked),
    });
  }

  async search(viewerId: string, q: string) {
    const query = q.trim().toLowerCase();
    if (query.length < 2) return [];
    const users = await this.prisma.user.findMany({
      where: {
        status: 'normal',
        deletedAt: null,
        id: { not: viewerId },
        OR: [
          { username: { contains: query } },
          { nickname: { contains: q.trim(), mode: 'insensitive' } },
        ],
        privacy: { searchableByUsername: true },
      },
      take: 20,
      include: { privacy: true },
    });
    return users.map((u) => this.toPublic(u, { hideBio: !u.privacy?.showBio }));
  }

  async setAvatar(userId: string, buffer: Buffer, mimeType: string, originalName: string) {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    const detected = detectMimeFromBuffer(buffer);
    if (!detected || !allowed.includes(detected.mime)) {
      throw new AppError(ErrorCodes.FILE_TYPE_NOT_ALLOWED, 'Avatar must be jpg/png/webp');
    }
    if (buffer.length > 5 * 1024 * 1024) {
      throw new AppError(ErrorCodes.FILE_TOO_LARGE, 'Avatar too large');
    }
    const ext = detected.ext;
    const key = this.storage.buildKey('avatars', ext);
    await this.storage.putObject(key, buffer, detected.mime);
    const url = await this.storage.getSignedDownloadUrl(key, 60 * 60 * 24 * 7);
    const media = await this.prisma.mediaObject.create({
      data: {
        uploaderId: userId,
        storageKey: key,
        bucket: this.storage.getBucket(),
        mimeType: detected.mime,
        sizeBytes: buffer.length,
        originalName,
        status: 'ready',
      },
    });
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: url },
      include: { privacy: true },
    });
    return { user: this.toPublic(user, { includeEmail: true, includePrivacy: true }), media_id: media.id };
  }
}
