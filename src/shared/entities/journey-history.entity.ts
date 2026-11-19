import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { UserEntity } from './user.entity.js';
import { decimalTransformer } from './decimal.transformer.js';
import { JourneyHistoryVoucherEntity } from './journey-history-voucher.entity.js';
import { type TCarOwner } from '../../module/journeys/type/TCarOwner.js';

// Jornada guardada: conserva la entrada y el resultado del momento.
@Entity('journey_history')
@Index(['userId', 'journeyDate'])
@Index('UQ_journey_history_active_day', ['userId', 'journeyDate', 'activeSlot'], { unique: true })
@Index('UQ_journey_history_verification_code', ['verificationCode'], { unique: true })
export class JourneyHistoryEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;

  @Column({ name: 'car_owner', type: 'varchar', length: 10, nullable: true })
  carOwner!: TCarOwner | null;

  @Column({ name: 'journey_date', type: 'date' })
  journeyDate!: string;

  @Column({ type: 'decimal', precision: 14, scale: 2, transformer: decimalTransformer })
  total!: number;

  @Column({ name: 'agency_percent', type: 'tinyint', unsigned: true })
  agencyPercent!: number;

  @Column({ name: 'driver_percent', type: 'tinyint', unsigned: true })
  driverPercent!: number;

  @Column({ name: 'car_rented', type: 'boolean', default: false })
  carRented!: boolean;

  @Column({ name: 'car_percent', type: 'tinyint', unsigned: true, nullable: true })
  carPercent!: number | null;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0, transformer: decimalTransformer })
  gas!: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0, transformer: decimalTransformer })
  petrol!: number;

  @Column({ name: 'factory_total', type: 'decimal', precision: 14, scale: 2, default: 0, transformer: decimalTransformer })
  factoryTotal!: number;

  @Column({ name: 'fixed_fee_total', type: 'decimal', precision: 14, scale: 2, default: 0, transformer: decimalTransformer })
  fixedFeeTotal!: number;

  @Column({ name: 'other_total', type: 'decimal', precision: 14, scale: 2, default: 0, transformer: decimalTransformer })
  otherTotal!: number;

  @Column({ name: 'adjusted_total', type: 'decimal', precision: 14, scale: 2, transformer: decimalTransformer })
  adjustedTotal!: number;

  @Column({ name: 'agency_amount', type: 'decimal', precision: 14, scale: 2, transformer: decimalTransformer })
  agencyAmount!: number;

  @Column({ name: 'driver_amount', type: 'decimal', precision: 14, scale: 2, transformer: decimalTransformer })
  driverAmount!: number;

  @Column({ name: 'car_amount', type: 'decimal', precision: 14, scale: 2, nullable: true, transformer: decimalTransformer })
  carAmount!: number | null;

  @Column({ name: 'final_agency', type: 'decimal', precision: 14, scale: 2, transformer: decimalTransformer })
  finalAgency!: number;

  @OneToMany(() => JourneyHistoryVoucherEntity, (voucher) => voucher.journey)
  vouchers!: Relation<JourneyHistoryVoucherEntity[]>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;

  // Eliminacion logica (papelera). null = vigente. La purga fisica es una tarea posterior.
  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamp', nullable: true })
  deletedAt!: Date | null;

  // Por que esta en papelera: eliminada por el usuario o reemplazada por otra.
  @Column({ name: 'delete_reason', type: 'varchar', length: 10, nullable: true })
  deleteReason!: 'user' | 'replaced' | null;

  // Jornada que la reemplazo (solo trazabilidad; sin clave foranea para no atar la purga).
  @Column({ name: 'replaced_by_id', type: 'uuid', nullable: true })
  replacedById!: string | null;

  // Calculo de Chofia que origino la jornada (solo trazabilidad; sin FK).
  @Column({ name: 'source_calculation_id', type: 'uuid', nullable: true })
  sourceCalculationId!: string | null;

  // 1 = vigente, null = en papelera. Junto al indice unico garantiza una vigente por usuario y fecha.
  @Column({ name: 'active_slot', type: 'tinyint', unsigned: true, nullable: true, default: 1 })
  activeSlot!: number | null;

  // CODIGO PUBLICO PARA VERIFICAR LA CONSTANCIA (ALEATORIO, UNICO).
  @Column({ name: 'verification_code', type: 'char', length: 16 })
  verificationCode!: string;
}