import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConversationEntity } from '../../shared/entities/conversation.entity.js';
import { ConversationMessageEntity } from '../../shared/entities/conversation-message.entity.js';
import { UserDailyUsageEntity } from '../../shared/entities/user-daily-usage.entity.js';
import { AiController } from './ai.controller.js';
import { AiService } from './ai.service.js';
import { OpenAIProvider } from './ia.provider.js';
import { CloudinaryService } from './cloudinary.services.js';
import { ConversationMessageImageEntity } from '../../shared/entities/conversation-message-image.entity.js';
import { ConversationCalculationEntity } from '../../shared/entities/conversation-calculation.entity.js';
import { CalculationService } from './calculation.service.js';

// Modulo de IA: chat dinamico con HuggingFace, persistencia 24hs y limites.
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ConversationEntity,
      ConversationMessageEntity,
      ConversationMessageImageEntity,
      ConversationCalculationEntity,
      UserDailyUsageEntity,
    ]),
  ],
  controllers: [AiController],
  providers: [AiService, OpenAIProvider, CloudinaryService, CalculationService],
  exports: [AiService]
})
export class AiModule {}
