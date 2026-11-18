import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { UserEntity } from './user.entity.js';

// Registra el uso diario de IA por usuario para aplicar el limite gratuito.
// Una fila por (usuario + dia); se resetea al pasar a un nuevo dia.
@Entity('user_daily_usage')
@Index(['userId', 'usageDate'], { unique: true })
export class UserDailyUsageEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // FK real hacia el usuario; permite filtrar y persistir por id.
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  // MUCHOS USOS PERTENECEN A UN SOLO USUARIO
  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;

  @Column({ name: 'usage_date', type: 'date' })
  usageDate!: string;

  // Cantidad de mensajes de IA consumidos hoy por este usuario.
  @Column({ name: 'messages_used', type: 'int', default: 0 })
  messagesUsed!: number;
}
