import { Module } from '@nestjs/common';
import { SettingsService } from './settings.service.js';
import { SettingsController } from './settings.controller.js';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { UserSettingsEntity } from '../../shared/entities/user-setting.entity.js';

@Module({
  imports:[TypeOrmModule.forFeature([UserSettingsEntity]), AuthModule],
  controllers: [SettingsController],
  providers: [SettingsService],
})
export class UserSettingsModule {}
