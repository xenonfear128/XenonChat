import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;
  readonly sub: Redis;
  readonly pub: Redis;

  constructor(config: ConfigService) {
    const url = config.get<string>('REDIS_URL', 'redis://localhost:6379');
    this.client = new Redis(url, { maxRetriesPerRequest: 3, enableReadyCheck: true });
    this.sub = new Redis(url, { maxRetriesPerRequest: null, enableReadyCheck: true });
    this.pub = new Redis(url, { maxRetriesPerRequest: 3, enableReadyCheck: true });
  }

  async connect() {
    // no-op when auto-connect; kept for readiness helpers
    if (this.client.status !== 'ready') {
      await new Promise<void>((resolve, reject) => {
        this.client.once('ready', () => resolve());
        this.client.once('error', reject);
      });
    }
  }

  async onModuleDestroy() {
    await Promise.allSettled([this.client.quit(), this.sub.quit(), this.pub.quit()]);
  }
}
