import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { json } from 'express';
import { AiEndpoint, ApiBasePath } from './core/config/config.endpoints.js';
import { isProduction } from './core/config/environment.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Un solo salto de proxy: Express deriva req.ip del encabezado reenviado.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  app.use(helmet());
  app.use(cookieParser());

  // Limite amplio SOLO para el chat: las imagenes viajan en base64 dentro del JSON.
  app.use(`/${ApiBasePath.AI}/${AiEndpoint.CHAT}`, json({ limit: '5mb' }));
  // Resto de la API: limite bajo.
  app.use(json({ limit: '100kb' }));

  // CORS para consumir la API desde el frontend (React/Vite).
  const configuredOrigins: string[] = (process.env.CORS_ORIGIN ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (isProduction() && (configuredOrigins.length === 0 || configuredOrigins.includes('*'))) {
    // Sin un origin explícito, cors refleja cualquier origen y con credentials
    // eso permite pedidos autenticados desde cualquier sitio.
    throw new Error('CORS_ORIGIN debe contener orígenes explícitos (sin "*") en producción.');
  }

  app.enableCors({
    origin: configuredOrigins.length > 0
      ? configuredOrigins
      : ['http://localhost:5173', 'http://127.0.0.1:5173'],
    credentials: true,
  });

  // Validacion global de DTOs: rechaza campos invalidos con 400.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableShutdownHooks();

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
