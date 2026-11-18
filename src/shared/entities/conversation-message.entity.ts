import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { ConversationEntity } from './conversation.entity.js';
import { ConversationMessageImageEntity } from './conversation-message-image.entity.js';

// Mensaje individual dentro de una conversacion. role distingue si lo
// escribio el usuario o la IA (system/assistant).
@Entity('conversation_messages')
@Index(['conversationId', 'createdAt'])
export class ConversationMessageEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // FK real hacia la conversacion; permite filtrar y persistir por id.
  @Column({ name: 'conversation_id', type: 'uuid' })
  conversationId!: string;

  // Relacion hacia la conversacion; reutiliza la columna fisica conversation_id.
  @ManyToOne(() => ConversationEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversation_id' })
  conversation!: ConversationEntity;

  @OneToMany(() => ConversationMessageImageEntity, (image) => image.message)
  images!: Relation<ConversationMessageImageEntity[]>;

  // 'user' | 'assistant' | 'system' (rol de la IA para todos).
  @Column({ type: 'varchar', length: 20 })
  role!: string;

  @Column({ type: 'longtext' })
  content!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;
}
