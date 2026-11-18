import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Put, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { CurrentUser } from '../../core/common/decorators/current-user.decorator.js';
import type { IAuthUser } from '../../shared/types/auth.types.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { SaveDraftDto } from './dto/save-draft.dto.js';
import { JourneyDraftService } from './journey-draft.service.js';
import { ApiBasePath } from '../../core/config/config.endpoints.js';

// Borrador de la calculadora del usuario autenticado.
@Controller(ApiBasePath.JOURNEY_DRAFT)
@UseGuards(JwtAuthGuard, ThrottlerGuard)
export class JourneyDraftController {
  constructor(private readonly draftService: JourneyDraftService) {}

  @Get()
  get(@CurrentUser() user: IAuthUser) {
    return this.draftService.get(user.id);
  }

  @Put()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  save(@CurrentUser() user: IAuthUser, @Body() dto: SaveDraftDto) {
    return this.draftService.save(user.id, dto);
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  remove(@CurrentUser() user: IAuthUser) {
    return this.draftService.remove(user.id);
  }
}