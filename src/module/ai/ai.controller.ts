import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../core/common/decorators/current-user.decorator.js';
import type { IAuthUser } from '../../shared/types/auth.types.js';
import { AiService } from './ai.service.js';
import { ChatDto } from './dto/chat.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AiEndpoint, ApiBasePath } from '../../core/config/config.endpoints.js';

// Endpoints de mensajeria dinamica con la IA. Todos requieren sesion valida.
@Controller(ApiBasePath.AI)
@UseGuards(JwtAuthGuard, ThrottlerGuard)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  // Chat dinamico: respeta historial, TTL 24hs y limite diario gratuito.
  @Throttle({ default: { limit: 5, ttl: 60_000 } }) // 5 mensajes por minuto
  @Post(AiEndpoint.CHAT)
  @HttpCode(HttpStatus.OK)
  chat(@CurrentUser() user: IAuthUser, @Body() dto: ChatDto) {
    return this.aiService.chat(
      user,
      dto.message,
      dto.conversationId,
      dto.imagesData,
      dto.confirmCalculation,
    );
  }

  // Lista las conversaciones vigentes del usuario.
  @Get(AiEndpoint.CONVERSATIONS)
  listConversations(@CurrentUser() user: IAuthUser) {
    return this.aiService.listConversations(user);
  }

  // Historial de mensajes de una conversacion.
  @Get(AiEndpoint.CONVERSATION_MESSAGES)
  getMessages(
    @CurrentUser() user: IAuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.aiService.getMessages(user, id);
  }

  // Elimina una conversacion.
  @Delete(AiEndpoint.CONVERSATION)
  @HttpCode(HttpStatus.OK)
  removeConversation(
    @CurrentUser() user: IAuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.aiService.removeConversation(user, id);
  }

  // Cuota diaria restante del usuario.
  @Get(AiEndpoint.USAGE)
  getUsage(@CurrentUser() user: IAuthUser) {
    return this.aiService.getUsage(user);
  }
  
}
