import { NestFactory } from '@nestjs/core';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { json } from 'express';
import { AiEndpoint, ApiBasePath } from './core/config/config.endpoints.js';
import { isProduction } from './core/config/environment.js';

async function bootstrap() {
  // CREO LA APP DE NEST
  const app:INestApplication<any> = await NestFactory.create(AppModule);

  // UN SOLO SALTO DE PROXY (EXPRESS DERIVA req.ip DEL ENCABEZADO REENVIADO)
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  app.use(helmet());
  app.use(cookieParser());

  // LIMITE AMPLIO SOLO PARA EL CHAT
  app.use(`/${ApiBasePath.AI}/${AiEndpoint.CHAT}`, json({ limit: '5mb' }));
  
  //RESTO D ELA API, LIMITE BAJO
  app.use(json({ limit: '100kb' }));

  // CORS PARA CONSUMIR LA API DESDE EL FRONTEND
  const configuredOrigins: string[] = (process.env.CORS_ORIGIN ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  // PREGUNTO SI ESTA EN PRODUCCION Y ADEMAS (PREGUNTAR SI LA LISTA DE ORIGENES ES IGUAL A CERO O INCLUYE '*')
  if (isProduction() && (configuredOrigins.length === 0 || configuredOrigins.includes('*'))) {
    throw new Error('CORS_ORIGIN debe contener orígenes explícitos en produccion.');
  }

  // SI ESTA EN DEV O PRODUCCION
  // ESTABLECEMOS EL ORIGEN SEGUN CONDICION 
  const ORIGINS:string[] = configuredOrigins.length > 0 ? configuredOrigins : ['http://localhost:5173', 'http://127.0.0.1:5173'];

  // HABILITAR CORS
  app.enableCors({
    origin: ORIGINS,
    credentials: true,
  });

  // VALIDACION GLOBAL DE DATA OBJECT TRANSFER (DTO) => ESTADO 400
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
