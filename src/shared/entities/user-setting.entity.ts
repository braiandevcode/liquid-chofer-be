import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserEntity } from './user.entity.js';
import { TCarOwner } from '../../module/journeys/type/TCarOwner.js';

// Ajustes del usuario: una fila por usuario (user_id es PK y FK).
@Entity('user_settings')
export class UserSettingsEntity {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @OneToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;

  @Column({ name: 'default_agency_percent', type: 'tinyint', unsigned: true, default: 70 })
  defaultAgencyPercent!: number;

  @Column({ name: 'default_car_owner', type: 'varchar', length: 10, nullable: true })
  defaultCarOwner!: TCarOwner | null;

  @Column({ name: 'default_driver_percent', type: 'tinyint', unsigned: true, default: 30 })
  defaultDriverPercent!: number;

  @Column({ name: 'default_car_rented', type: 'boolean', default: false })
  defaultCarRented!: boolean;

  // Solo tiene valor si el vehiculo esta alquilado; si no, NULL.
  @Column({ name: 'default_car_percent', type: 'tinyint', unsigned: true, nullable: true })
  defaultCarPercent!: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt!: Date;
}