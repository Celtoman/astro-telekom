import IORedis from 'ioredis';

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  console.error('[worker-healthcheck] REDIS_URL is not configured');
  process.exit(1);
}

const redis = new IORedis(redisUrl, {
  lazyConnect: true,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
  connectTimeout: 3_000,
  retryStrategy: () => null,
});

try {
  await redis.connect();
  const response = await redis.ping();
  if (response !== 'PONG') throw new Error('Unexpected Redis PING response');
} catch {
  process.exitCode = 1;
} finally {
  redis.disconnect();
}
