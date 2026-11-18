import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { dataSourceOptions } from './core/config/data-source.js';
import { AuthTokenModule } from './core/common/auth-token.module.js';
import { FirebaseModule } from './core/firebase/firebase.module.js';
import { AuthModule } from './module/auth/auth.module.js';
import { AiModule } from './module/ai/ai.module.js';
import { UsersModule } from './module/users/users.module.js';
import { ThrottlerModule } from '@nestjs/throttler'
import { UserSettingsModule } from './module/user-settings/settings.module.js';
import { JourneysModule } from './module/journeys/journeys.module.js';
import { JourneyDraftModule } from './module/journey-draft/journey-draft.module.js';
import { ScheduleModule } from '@nestjs/schedule';
import { HealthModule } from './core/health/health.module.js';
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      useFactory: () => dataSourceOptions,
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 60 }], // ejemplo: 60 por minuto y por ruta
      errorMessage: 'Demasiadas solicitudes. Esperá un momento e intentá de nuevo.',
      getTracker: (req: Record<string, any>): string => {
        // Usuario autenticado (lo agrega JwtAuthGuard): se limita por usuario.
        const userId = req.user?.id;
        if (typeof userId === 'string' && userId) return `user:${userId}`;

        // Sin sesion: se limita por IP resuelta por Express (trust proxy = 1).
        const ip = typeof req.ip === 'string' && req.ip ? req.ip : 'unknown';
        return `ip:${ip}`;
      },
    }),

    // Modulos globales: health, Firebase y firmado/verificacion de sesiones.
    HealthModule,
    FirebaseModule,
    AuthTokenModule,
    // Modulos de dominio.
    UserSettingsModule,
    JourneysModule,
    JourneyDraftModule,
    UsersModule,
    AuthModule,
    AiModule,
  ],
})
export class AppModule { }
