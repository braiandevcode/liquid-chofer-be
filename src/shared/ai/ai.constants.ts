import { NotFoundException } from '@nestjs/common';

// Rol de la IA. Se mantiene 'assistant' para todas las conversaciones,
// garantizando que la IA responde como soporte a todo usuario autenticado.
export enum ERole {
  SYSTEM = 'system',
  USER = 'user',
  ASSISTANT = 'assistant',
}

// Nombre del prompt de sistema reutilizable en el chat de soporte.
export const CHOFER_SYSTEM_PROMPT_TAG = 'CHO_FER_SYSTEM_PROMPT';

// Permite referenciar IDs de rol sin repetir strings sueltos en el codigo.
export const idOf = (r: ERole): string => r.valueOf();

// Diccionario de errores claros para respuestas breves (AGENTS.md §9).
export const AI_ERROR_MESSAGES = {
  LIMIT_REACHED: 'Alcanzaste tu límite diario de mensajes gratuitos. Volvé mañana.',
  NOT_FOUND: 'La conversación no existe o ya expiró.',
} as const;

// Lanzador de error cuando la conversacion no existe o esta vencida.
export const throwConversationNotFound = (): never => {
  throw new NotFoundException(AI_ERROR_MESSAGES.NOT_FOUND);
};
