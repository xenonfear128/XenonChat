import { describe, expect, it } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { RateLimitService } from './rate-limit.service';

describe('RateLimitService', () => {
  it('uses a bounded local limiter when Redis is unavailable', async () => {
    const redis = {
      client: {
        incr: async () => {
          throw new Error('redis unavailable');
        },
      },
    };
    const service = new RateLimitService(
      redis as never,
      new ConfigService(),
    );

    expect((await service.consume('test', 2, 10_000)).allowed).toBe(true);
    expect((await service.consume('test', 2, 10_000)).allowed).toBe(true);
    const limited = await service.consume('test', 2, 10_000);
    expect(limited.allowed).toBe(false);
    expect(limited.retryAfterMs).toBeGreaterThan(0);
  });
});
