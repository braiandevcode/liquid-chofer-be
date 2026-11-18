import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JourneyHistoryEntity } from '../../shared/entities/journey-history.entity.js';
import { JourneyHistoryVoucherEntity } from '../../shared/entities/journey-history-voucher.entity.js';
import { AuthModule } from '../auth/auth.module.js';
import { JourneysController } from './journeys.controller.js';
import { JourneysService } from './journeys.service.js';
import { JourneyTombstoneEntity } from '../../shared/entities/journey-tombstone.entity.js';
import { JourneyVerificationController } from './journey-verification.controller.js';
import { JourneysPurgeService } from './journeys-purge.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([JourneyHistoryEntity, JourneyHistoryVoucherEntity, JourneyTombstoneEntity]), AuthModule],
  controllers: [JourneysController, JourneyVerificationController],
  providers: [JourneysService, JourneysPurgeService],
})
export class JourneysModule {}