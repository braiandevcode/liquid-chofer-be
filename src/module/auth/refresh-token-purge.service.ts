import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { RefreshTokenEntity } from '../../shared/entities/refresh-token.entity.js';
import { APP_TIME_ZONE } from '../../shared/time/app-time.js';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RefreshTokenPurgeService {
    private readonly logger = new Logger(RefreshTokenPurgeService.name);
    // Evita que dos corridas se pisen dentro de la misma instancia.
    private running = false;

    constructor(
        @InjectRepository(RefreshTokenEntity)
        private readonly refreshRepo: Repository<RefreshTokenEntity>,
        private readonly configService: ConfigService,
    ) { }

    // Todos los dias a las 4:00 (despues de las purgas de cuentas y jornadas).
    @Cron('0 0 4 * * *', { timeZone: APP_TIME_ZONE })
    async purgeExpiredTokens(): Promise<void> {
        // Margen despues del vencimiento antes de borrar el token.
        const EXPIRED_GRACE_MS: number = this.configService.getOrThrow('TIME_PURGE_RF_TOKEN');

        // this.logger.log(EXPIRED_GRACE_MS)

        if (this.running) return;
        this.running = true;

        try {
            const cutoff: Date = new Date(Date.now() - EXPIRED_GRACE_MS);
            // Borra solo lo vencido hace mas de un dia, este o no revocado.
            const result = await this.refreshRepo.delete({ expiresAt: LessThan(cutoff) });
            if (result.affected) this.logger.log(`Refresh tokens vencidos purgados: ${result.affected}`);
        } catch (error) {
            this.logger.error(
                'Falló la purga de refresh tokens vencidos',
                error instanceof Error ? error.stack : String(error),
            );
        } finally {
            this.running = false;
        }
    }
}