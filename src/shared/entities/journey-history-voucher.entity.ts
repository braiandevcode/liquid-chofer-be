import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { JourneyHistoryEntity } from './journey-history.entity.js';
import { decimalTransformer } from './decimal.transformer.js';

// Vale de una jornada guardada (fabrica u otro).
@Entity('journey_history_vouchers')
@Index(['journeyId'])
export class JourneyHistoryVoucherEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'journey_id', type: 'uuid' })
  journeyId!: string;

  @ManyToOne(() => JourneyHistoryEntity, (journey) => journey.vouchers, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'journey_id' })
  journey!: Relation<JourneyHistoryEntity>;

  // 'factory' | 'other'
  @Column({ type: 'varchar', length: 10 })
  type!: string;

  @Column({ type: 'varchar', length: 40 })
  name!: string;

  @Column({ type: 'smallint', unsigned: true })
  trips!: number;

  @Column({ name: 'price_per_trip', type: 'decimal', precision: 12, scale: 2, transformer: decimalTransformer })
  pricePerTrip!: number;

  @Column({ name: 'fixed_fee_per_trip', type: 'decimal', precision: 12, scale: 2, default: 0, transformer: decimalTransformer })
  fixedFeePerTrip!: number;

  @Column({ type: 'int', default: 0 })
  position!: number;
}