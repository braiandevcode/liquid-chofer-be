import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ConversationEntity } from './conversation.entity.js';
import { ConversationMessageEntity } from './conversation-message.entity.js';
import type {
  ICalculationInput,
  ICalculationResult,
  TCalculationStatus,
} from '../ai/calculation.types.js';

// Borrador o resultado de un calculo de cierre asociado a una conversacion.
// Guarda el input parcial para poder confirmar aunque la imagen haya sido previa.
@Entity('conversation_calculations')
@Index(['conversationId', 'status'])
export class ConversationCalculationEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'conversation_id', type: 'uuid' })
  conversationId!: string;

  @ManyToOne(() => ConversationEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversation_id' })
  conversation!: ConversationEntity;

  // Mensaje del asistente que ofrecio o completo el calculo.
  @Column({ name: 'message_id', type: 'uuid', nullable: true })
  messageId!: string | null;

  @ManyToOne(() => ConversationMessageEntity, {
    onDelete: 'CASCADE',
    nullable: true,
  })
  @JoinColumn({ name: 'message_id' })
  message!: ConversationMessageEntity | null;

  @Column({ type: 'varchar', length: 20 })
  status!: TCalculationStatus;

  // Datos parciales o completos extraidos de los mensajes/imagenes.
  @Column({ name: 'input_json', type: 'json', nullable: true })
  input!: Partial<ICalculationInput> | null;

  // Resultado determinista; solo existe cuando el calculo fue confirmado.
  @Column({ name: 'result_json', type: 'json', nullable: true })
  result!: ICalculationResult | null;

  // Campos que faltan para poder calcular.
  @Column({ name: 'missing_fields_json', type: 'json', nullable: true })
  missingFields!: string[] | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt!: Date;
}
