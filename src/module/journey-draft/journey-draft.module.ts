import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JourneyDraftEntity } from '../../shared/entities/journey-draft.entity.js';
import { AuthModule } from '../auth/auth.module.js';
import { JourneyDraftController } from './journey-draft.controller.js';
import { JourneyDraftService } from './journey-draft.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([JourneyDraftEntity]), AuthModule],
  controllers: [JourneyDraftController],
  providers: [JourneyDraftService],
})
export class JourneyDraftModule {}