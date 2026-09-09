import { Injectable } from '@nestjs/common';
import IORedis from 'ioredis';
import { PrismaService } from './prisma.service';

type DependencyState = 'up' | 'down';

export interface ReadinessResult {
  status: 'ok' | 'error';
  service: 'api';
  checks: {
    database: DependencyState;
    redis: DependencyState;
  };
}

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async readiness(): Promise<ReadinessResult> {
    const [database, redis] = await Promise.all([
      this.probe(() => this.pingDatabase()),
      this.probe(() => this.pingRedis()),
    ]);
    return {
      status: database === 'up' && redis === 'up' ? 'ok' : 'error',
      service: 'api',
      checks: { database, redis },
    };
  }

  private async probe(check: () => Promise<unknown>): Promise<DependencyState> {
    try {
      await check();
      return 'up';
    } catch {
      return 'down';
    }
  }

  private async pingDatabase() {
    await this.prisma.$queryRaw`SELECT 1`;
  }

  async pingRedis() {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) throw new Error('REDIS_URL is not configured');

    const redis = new IORedis(redisUrl, {
      lazyConnect: true,
      connectTimeout: 1_000,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: () => null,
    });
    redis.on('error', () => undefined);
    try {
      await redis.connect();
      if (await redis.ping() !== 'PONG') throw new Error('Unexpected Redis response');
    } finally {
      redis.disconnect();
    }
  }
}
