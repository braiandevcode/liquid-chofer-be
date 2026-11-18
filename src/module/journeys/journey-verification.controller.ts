import { Controller, Get, Header, Param, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JourneysService } from './journeys.service.js';
import { ApiBasePath, VerifyEndpoint } from '../../core/config/config.endpoints.js';

// Verificacion PUBLICA (sin sesion): quien recibe una constancia comprueba su codigo.
@Controller(ApiBasePath.VERIFY)
@UseGuards(ThrottlerGuard)
export class JourneyVerificationController {
  constructor(private readonly journeysService: JourneysService) {}

  @Get(VerifyEndpoint.BY_CODE)
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  verify(@Param('code') code: string) {
    return this.journeysService.verify(code);
  }
}