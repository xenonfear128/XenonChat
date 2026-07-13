import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorCodes } from '@xenonchat/shared';
import { RedisService } from '../../redis/redis.service';
import { AppError } from '../errors/app-error';

@Injectable()
export class RateLimitService {
  private readonly localWindows = new Map<
    string,
    { count: number; expiresAt: number }
  >();

  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  /** Fixed-window limiter backed by Redis with a per-process safety fallback. */
  async consume(
    key: string,
    limit: number,
    windowMs: number,
  ): Promise<{ allowed: boolean; retryAfterMs?: number; remaining: number }> {
    const redisKey = `rate:${key}`;
    try {
      const count = await this.redis.client.incr(redisKey);
      if (count === 1) {
        await this.redis.client.pexpire(redisKey, windowMs);
      }
      const ttl = await this.redis.client.pttl(redisKey);
      if (count > limit) {
        return { allowed: false, retryAfterMs: Math.max(ttl, 1), remaining: 0 };
      }
      return { allowed: true, remaining: Math.max(limit - count, 0) };
    } catch {
      // Keep authentication and local development usable during a Redis outage
      // without disabling protection completely. Distributed deployments still
      // report Redis as unhealthy via /ready.
      return this.consumeLocally(redisKey, limit, windowMs);
    }
  }

  private consumeLocally(
    key: string,
    limit: number,
    windowMs: number,
  ): { allowed: boolean; retryAfterMs?: number; remaining: number } {
    const now = Date.now();
    const current = this.localWindows.get(key);
    const window =
      !current || current.expiresAt <= now
        ? { count: 0, expiresAt: now + windowMs }
        : current;
    window.count += 1;
    this.localWindows.set(key, window);

    if (this.localWindows.size > 10_000) {
      for (const [entryKey, entry] of this.localWindows) {
        if (entry.expiresAt <= now) this.localWindows.delete(entryKey);
      }
    }

    if (window.count > limit) {
      return {
        allowed: false,
        retryAfterMs: Math.max(window.expiresAt - now, 1),
        remaining: 0,
      };
    }
    return { allowed: true, remaining: Math.max(limit - window.count, 0) };
  }

  async assertUserMessage(userId: string, conversationId: string) {
    const globalLimit = Number(this.config.get('USER_GLOBAL_MSG_RATE_PER_SEC', 2));
    const convLimit = Number(this.config.get('USER_CONVERSATION_MSG_RATE_PER_SEC', 1));

    const global = await this.consume(`user:${userId}:global`, globalLimit, 1000);
    if (!global.allowed) {
      throw new AppError(
        ErrorCodes.MESSAGE_TOO_FAST,
        'Sending too fast',
        429,
        undefined,
        global.retryAfterMs,
      );
    }

    const conv = await this.consume(
      `conversation:${conversationId}:user:${userId}`,
      convLimit,
      1000,
    );
    if (!conv.allowed) {
      throw new AppError(
        ErrorCodes.MESSAGE_TOO_FAST,
        'Sending too fast in this conversation',
        429,
        undefined,
        conv.retryAfterMs,
      );
    }
  }

  async assertGroupSlowMode(
    groupId: string,
    userId: string,
    slowModeSeconds: number,
    exempt: boolean,
  ) {
    if (exempt || slowModeSeconds <= 0) return;
    const result = await this.consume(
      `group:${groupId}:user:${userId}:slow`,
      1,
      slowModeSeconds * 1000,
    );
    if (!result.allowed) {
      throw new AppError(
        ErrorCodes.MESSAGE_TOO_FAST,
        'Slow mode active',
        429,
        undefined,
        result.retryAfterMs,
      );
    }
  }

  async assertGroupGlobalRate(groupId: string, ratePerSec: number) {
    const result = await this.consume(`group:${groupId}:global`, ratePerSec, 1000);
    if (!result.allowed) {
      throw new AppError(
        ErrorCodes.GROUP_RATE_LIMITED,
        'Group message rate exceeded',
        429,
        undefined,
        result.retryAfterMs,
      );
    }
  }

  async assertLogin(email: string) {
    const result = await this.consume(`login:${email.toLowerCase()}`, 10, 15 * 60 * 1000);
    if (!result.allowed) {
      throw new AppError(ErrorCodes.AUTH_RATE_LIMITED, 'Too many login attempts', 429, undefined, result.retryAfterMs);
    }
  }

  async assertPasswordReset(identifier: string) {
    const result = await this.consume(
      `password_reset:${identifier.toLowerCase()}`,
      5,
      60 * 60 * 1000,
    );
    if (!result.allowed) {
      throw new AppError(
        ErrorCodes.AUTH_RATE_LIMITED,
        'Too many password reset attempts',
        429,
        undefined,
        result.retryAfterMs,
      );
    }
  }

  async assertFriendRequest(userId: string) {
    const result = await this.consume(`friend_request:${userId}`, 20, 60 * 60 * 1000);
    if (!result.allowed) {
      throw new AppError(ErrorCodes.MESSAGE_TOO_FAST, 'Too many friend requests', 429, undefined, result.retryAfterMs);
    }
  }

  async assertUpload(userId: string) {
    const result = await this.consume(`upload:${userId}`, 30, 60 * 1000);
    if (!result.allowed) {
      throw new AppError(ErrorCodes.MESSAGE_TOO_FAST, 'Upload rate limited', 429, undefined, result.retryAfterMs);
    }
  }
}
