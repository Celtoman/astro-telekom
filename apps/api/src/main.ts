import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyRateLimit from '@fastify/rate-limit';
import IORedis from 'ioredis';
import { AppModule } from './module';
import { ADMIN_CORS_METHODS } from './cors-options';
import { createGlobalValidationPipe, rateLimitForPath, rateLimitWindow } from './security-options';

async function bootstrap() {
  const trustProxy = process.env.TRUST_PROXY === 'true';
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ bodyLimit: 35 * 1024 * 1024, trustProxy: trustProxy }),
  );

  await app.register(fastifyCookie);
  const rateLimitRedis = process.env.REDIS_URL
    ? new IORedis(process.env.REDIS_URL, { connectTimeout: 1_000, maxRetriesPerRequest: 1, enableOfflineQueue: false })
    : undefined;
  rateLimitRedis?.on('error', () => undefined);
  await app.register(fastifyRateLimit, {
    global: true,
    redis: rateLimitRedis,
    max: (request) => rateLimitForPath(request.url),
    timeWindow: rateLimitWindow(),
    skipOnError: false,
    enableDraftSpec: true,
  });
  if (rateLimitRedis) {
    app.getHttpAdapter().getInstance().addHook('onClose', async () => {
      await rateLimitRedis.quit();
    });
  }
  app.useGlobalPipes(createGlobalValidationPipe());
  app.enableShutdownHooks();
  app.setGlobalPrefix('api/v1');
  app.enableCors({
    origin: (process.env.CORS_ORIGINS || process.env.PUBLIC_SITE_URL || 'http://localhost:4321')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    methods: ADMIN_CORS_METHODS,
    credentials: true,
  });
  await app.listen(process.env.PORT ? Number(process.env.PORT) : 3000, '0.0.0.0');
}

void bootstrap();
