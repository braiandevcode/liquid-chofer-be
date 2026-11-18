import { Controller, Get } from '@nestjs/common';
import { ApiBasePath } from '../config/config.endpoints.js';

// Endpoint mínimo para healthchecks del proveedor de hosting.
@Controller(ApiBasePath.HEALTH)
export class HealthController {
  @Get()
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
