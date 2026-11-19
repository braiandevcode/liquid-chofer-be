import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { APP_TIME_ZONE } from '../../shared/time/app-time.js';
import { archiveExpiredTrash, deleteArchivedExpiredTrash } from './journey-tombstones.js';

@Injectable()
export class JourneysPurgeService {
  private readonly logger = new Logger(JourneysPurgeService.name);
  private running = false;

  constructor(private readonly dataSource: DataSource) {}

  // Todos los dias a las 3:30 (media hora despues de la purga de cuentas).
  @Cron('0 30 3 * * *', { timeZone: APP_TIME_ZONE })
  async purgeExpiredJourneys(): Promise<void> {
    if (this.running) return;
    this.running = true;

    try {
      // 1) Registro minimo permanente. 2) Borrado fisico solo de lo ya archivado.
      await archiveExpiredTrash(this.dataSource);
      const deleted: number = await deleteArchivedExpiredTrash(this.dataSource);
      if (deleted > 0) this.logger.log(`Jornadas purgadas: ${deleted}`);
    } catch (error) {
      this.logger.error(
        'Falló la purga de jornadas en papelera',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.running = false;
    }
  }
}