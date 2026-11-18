import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { ConversationMessageEntity } from './conversation-message.entity.js';

// Imagen adjunta a un mensaje. El archivo vive en Cloudinary (tipo authenticated);
// aca solo guardo su identificador para poder firmar la URL y borrarlo despues.
@Entity('conversation_message_images')
@Index(['messageId'])
export class ConversationMessageImageEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'message_id', type: 'uuid' })
  messageId!: string;

  @ManyToOne(() => ConversationMessageEntity, (message) => message.images, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'message_id' })
  message!: Relation<ConversationMessageEntity>;

  // Identificador del archivo en Cloudinary.
  @Column({ name: 'public_id', type: 'varchar', length: 255 })
  publicId!: string;

  // Orden de la imagen dentro del mensaje (0, 1, 2).
  @Column({ type: 'int', default: 0 })
  position!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;
}