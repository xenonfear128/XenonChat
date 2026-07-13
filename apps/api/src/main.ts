import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { WsAdapter } from '@nestjs/platform-ws';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const maxUploadSize = Number(process.env.MAX_UPLOAD_SIZE ?? 52428800);
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: true, bodyLimit: maxUploadSize + 1024 * 1024 }),
  );

  const allowedOrigins = (
    process.env.CORS_ORIGINS ??
    process.env.APP_BASE_URL ??
    'http://localhost:3000'
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  await app.register(cors as never, {
    origin: allowedOrigins,
    credentials: false,
  });
  await app.register(cookie as never);
  await app.register(multipart as never, {
    limits: { fileSize: maxUploadSize },
  });

  app.useWebSocketAdapter(new WsAdapter(app));
  app.useGlobalFilters(new AllExceptionsFilter());
  app.setGlobalPrefix('api');

  const port = Number(process.env.API_PORT ?? 4000);
  const host = process.env.API_HOST ?? '0.0.0.0';
  await app.listen(port, host);
  // eslint-disable-next-line no-console
  console.log(`XenonChat API listening on http://${host}:${port}`);
}

bootstrap();
