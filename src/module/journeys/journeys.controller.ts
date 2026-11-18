import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus,
  Param, ParseUUIDPipe, Post, Query, UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { CurrentUser } from '../../core/common/decorators/current-user.decorator.js';
import type { IAuthUser } from '../../shared/types/auth.types.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CreateJourneyDto } from './dto/create-journey.dto.js';
import { ListJourneysQueryDto } from './dto/list-journeys.dto.js';
import { JourneysService } from './journeys.service.js';
import { RestoreJourneyDto } from './dto/restore-journey.dto.js';
import { ApiBasePath, JourneysEndpoint } from '../../core/config/config.endpoints.js';

// Historial de jornadas del usuario autenticado. El id sale de la cookie firmada.
@Controller(ApiBasePath.JOURNEYS)
@UseGuards(JwtAuthGuard, ThrottlerGuard)
export class JourneysController {
  constructor(private readonly journeysService: JourneysService) { }

  @Post()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  create(@CurrentUser() user: IAuthUser, @Body() dto: CreateJourneyDto) {
    return this.journeysService.create(user.id, dto);
  }
  //VER ESTADO DE HABILITAR DESCARGA/COMPARTIR (SOLO LECTURA)
  @Get(JourneysEndpoint.SHARE_STATUS)
  shareStatus(
    @CurrentUser() user: IAuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.journeysService.getShareStatus(user.id, id);
  }

  // VER LAS JORNADAS DE UN USUARIO
  @Get()
  list(@CurrentUser() user: IAuthUser, @Query() query: ListJourneysQueryDto) {
    return this.journeysService.list(user.id, query.limit, query.offset);
  }

  // VER PAPELERA
  @Get(JourneysEndpoint.TRASH)
  listTrash(@CurrentUser() user: IAuthUser, @Query() query:ListJourneysQueryDto ){
    return this.journeysService.listTrash(user.id, query.limit, query.offset);
  }

  // RESTAURAR UNA JORNADA DE LA PAPELERA (DENTRO DE LOS 30 DIAS)
  @Post(JourneysEndpoint.RESTORE)
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  restore(@CurrentUser() user: IAuthUser, @Param('id', new ParseUUIDPipe({ version: '4'})) id: string, @Body() dto: RestoreJourneyDto){
     return this.journeysService.restore(user.id, id, dto.replaceExisting === true)
  }
  

  // VER JORNADA DEL USUARIO
  @Get(JourneysEndpoint.BY_ID)
  getOne(
    @CurrentUser() user: IAuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.journeysService.getOne(user.id, id);
  }

  @Delete(JourneysEndpoint.BY_ID)
  @HttpCode(HttpStatus.OK)
  remove(
    @CurrentUser() user: IAuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.journeysService.remove(user.id, id);
  }
}