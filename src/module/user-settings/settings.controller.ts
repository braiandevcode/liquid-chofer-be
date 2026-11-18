import { Body, Controller, Get, HttpCode, HttpStatus, Put, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { CurrentUser } from '../../core/common/decorators/current-user.decorator.js';
import type { IAuthUser } from '../../shared/types/auth.types.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { SettingsService } from './settings.service.js';
import { UpdateSettingsDto } from './dto/update-setting.dto.js';
import { ApiBasePath } from '../../core/config/config.endpoints.js';

// Ajustes del usuario autenticado. El id sale de la cookie firmada, nunca del cliente.
@Controller(ApiBasePath.SETTINGS)
@UseGuards(JwtAuthGuard, ThrottlerGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  get(@CurrentUser() user: IAuthUser) {
    return this.settingsService.get(user.id);
  }

  @Put()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  update(@CurrentUser() user: IAuthUser, @Body() dto: UpdateSettingsDto) {
    return this.settingsService.update(user.id, dto);
  }
}