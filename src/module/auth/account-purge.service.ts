import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { UsersService } from '../users/users.service.js';
import { AiService } from '../ai/ai.service.js';
import { APP_TIME_ZONE } from '../../shared/time/app-time.js';
import { archiveUserJourneys } from '../journeys/journey-tombstones.js';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AccountPurgeService {
  private readonly logger = new Logger(AccountPurgeService.name);
  // Evita que dos corridas se pisen dentro de la misma instancia.
  private running = false;

  constructor(
    private readonly usersService: UsersService,
    private readonly dataSource: DataSource,
    private readonly aiService: AiService,
    private readonly configService: ConfigService
  ) { }

  // Corre todos los dias a las 3 AM (hora argentina).
  @Cron(CronExpression.EVERY_DAY_AT_3AM, { timeZone: APP_TIME_ZONE })

  async purgeExpiredAccounts(): Promise<void> {
    // Dias que se conserva una cuenta eliminada logicamente antes de la purga fisica.
    const RETENTION_DAYS: number = this.configService.getOrThrow('RETENTION_DAYS');
    // Tope de cuentas por corrida: evita corridas largas y limites de Cloudinary.
    const BATCH_SIZE: number = this.configService.getOrThrow('BATCH_SIZE');
    const DAY_MS: number = this.configService.getOrThrow('DAY_MS');
    
    if (this.running) return;
    this.running = true;

    try {
      const cutoff: Date = new Date(Date.now() - RETENTION_DAYS * DAY_MS);
      const users = await this.usersService.findPurgeable(cutoff, BATCH_SIZE);

      for (const user of users) {
        await this.purgeUser(user.id, cutoff);
      }
    } catch (error) {
      this.logger.error(
        'Falló la purga de cuentas eliminadas',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.running = false;
    }
  }

  // Una cuenta que falla no frena a las demas: queda para la corrida del dia siguiente.
  private async purgeUser(userId: string, cutoff: Date): Promise<void> {
    try {
      // Revalido: si el usuario volvio en el medio, no se toca.
      if (!(await this.usersService.isPurgeable(userId, cutoff))) return;

      // 1) Cloudinary + conversaciones; si falla, se corta y la fila queda para despues.
      await this.aiService.purgeAllUserData(userId);

      // Registro minimo de sus constancias: siguen verificables despues del borrado fisico.
      await archiveUserJourneys(this.dataSource, userId);

      // 2) Fila de users (borrado fisico; el CASCADE limpia el resto).
      await this.usersService.deleteById(userId);

      this.logger.log(`Cuenta purgada: ${userId}`);
    } catch (error) {
      this.logger.error(
        `No se pudo purgar la cuenta ${userId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}