import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

// Representa un usuario registrado. firebaseUid es el vinculo con el
// usuario autenticado en Firebase, unico por persona.
@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', name: 'firebase_uid', unique: true, length: 128 })
  firebaseUid!: string;

  @Column({ type: 'varchar', unique: true, length: 191 })
  email!: string;

  @Column({
    name: 'display_name',
    type: 'varchar',
    length: 191,
    nullable: true,
  })
  displayName!: string | null;

  @Column({ name: 'photo_url', type: 'varchar', length: 512, nullable: true })
  photoUrl!: string | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;

  // Fecha de eliminacion logica; null = cuenta activa. Se conserva 1 mes y luego se purga.
  @DeleteDateColumn({ type: 'timestamp', name: 'deleted_at', nullable: true })
  deletedAt!: Date | null;
}
