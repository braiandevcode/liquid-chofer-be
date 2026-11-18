import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { UserEntity } from './user.entity.js';

// Conversacion de un usuario con la IA. Tiene un TTL de 24 horas;
// expiresAt marca cuando dejar de mostrarla / limpiarla.
@Entity('conversations')
@Index(['userId', 'expiresAt'])
export class ConversationEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // FK real hacia el usuario dueno; permite filtrar y persistir por id.
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  // Relacion hacia el usuario dueno; reutiliza la columna fisica user_id.
  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;

  // Identificador opcional de sesion/thread para agrupar mensajes.
  @Column({ name: 'thread_id', type: 'varchar', length: 128, nullable: true })
  threadId!: string | null;

  @Column({ type: 'varchar', length: 191, nullable: true })
  title!: string | null;

  // Momento exacto cuando expira (createdAt + 24h). Vencida => no valida.
  @Column({ name: 'expires_at', type: 'datetime' })
  expiresAt!: Date;

  @CreateDateColumn({ name: 'created_at', type:'timestamp' })
  createdAt!: Date;
}
