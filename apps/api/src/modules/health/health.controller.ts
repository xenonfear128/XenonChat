import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

@Controller()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get('/health')
  health() {
    return { ok: true, data: { status: 'ok' } };
  }

  @Get('/ready')
  async ready() {
    const checks: Record<string, string> = {};
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = 'ok';
    } catch {
      checks.database = 'fail';
    }
    try {
      if (this.redis.client.status !== 'ready') {
        await this.redis.client.connect().catch(() => undefined);
      }
      const pong = await this.redis.client.ping();
      checks.redis = pong === 'PONG' ? 'ok' : 'fail';
    } catch {
      checks.redis = 'fail';
    }
    const ready = Object.values(checks).every((v) => v === 'ok');
    return { ok: ready, data: { checks } };
  }
}
