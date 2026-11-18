import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { UsersModule } from '../users/users.module.js';
import { AiModule } from '../ai/ai.module.js';
import { AccountPurgeService } from './account-purge.service.js';
import { RefreshTokenEntity } from '../../shared/entities/refresh-token.entity.js';
import { RefreshTokenPurgeService } from './refresh-token-purge.service.js';

@Module({
  imports: [UsersModule, AiModule, TypeOrmModule.forFeature([RefreshTokenEntity])],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, AccountPurgeService, RefreshTokenPurgeService],
  exports: [JwtAuthGuard],
})
export class AuthModule {}
