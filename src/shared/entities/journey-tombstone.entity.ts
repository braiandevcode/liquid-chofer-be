import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('journey_tombstones')
export class JourneyTombstoneEntity {
  @PrimaryColumn({ name: 'verification_code', type: 'char', length: 16 })
  verificationCode!: string;

  @Column({ name: 'journey_date', type: 'date' })
  journeyDate!: string;

  @Column({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt!: Date;

  @Column({ name: 'deleted_at', type: 'timestamp' })
  deletedAt!: Date;

  @Column({ name: 'delete_reason', type: 'varchar', length: 10 })
  deleteReason!: string;
}