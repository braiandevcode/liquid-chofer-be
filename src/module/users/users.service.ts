import {
  ConflictException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, QueryFailedError, Repository } from 'typeorm';
import { UserEntity } from '../../shared/entities/user.entity.js';
import { IAuthUser } from '../../shared/types/auth.types.js';

// Datos del perfil que leemos desde Firebase (DecodedIdToken).
export interface IFirebaseProfile {
  uid: string;
  email?: string;
  name?: string;
  picture?: string;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
  ) { }

  // Busca al usuario por firebase uid; si no existe, valida el email antes de crear.
  async findOrCreateByFirebase(profile: IFirebaseProfile): Promise<UserEntity> {
    const email = profile.email?.trim().toLowerCase();
    if (!email) {
      throw new UnprocessableEntityException(
        'La cuenta de Firebase no tiene un email asociado.',
      );
    }
    if (email.length > 191) {
      throw new UnprocessableEntityException(
        'El email de la cuenta supera el largo permitido.',
      );
    }

    try {
      // Primero busco por UID (incluyo eliminadas) para no tocar usuarios ya vinculados.
      const byUid = await this.userRepository.findOne({
        where: { firebaseUid: profile.uid },
        withDeleted: true,
      });
      if (byUid) {
        const active = await this.restoreIfDeleted(byUid);
        const synced = await this.syncEmailIfChanged(active, email);
        return await this.updateProfileIfMissing(synced, profile);
      }

      // Si el email ya existe con otro UID: si esta eliminada la reactivo; si no, pido vincular proveedores.
      const byEmail = await this.userRepository.findOne({
        where: { email },
        withDeleted: true,
      });
      if (byEmail) {
        if (byEmail.deletedAt) {
          const restored = await this.restoreIfDeleted(byEmail, profile.uid);
          return await this.updateProfileIfMissing(restored, profile);
        }
        throw new ConflictException({
          statusCode: HttpStatus.CONFLICT,
          code: 'ACCOUNT_ALREADY_EXISTS',
          message:
            'Ya existe una cuenta con este correo. Iniciá sesión con tu método original o vinculá Google.',
        });
      }

      // Nuevo usuario: guardo los datos basicos leidos de Firebase.
      const user = this.userRepository.create({
        firebaseUid: profile.uid,
        email,
        displayName: profile.name?.slice(0, 191) ?? null,
        photoUrl: profile.picture?.slice(0, 512) ?? null,
      });
      return await this.userRepository.save(user);
    } catch (error) {
      // Si la colision es por email, la propago sin intentar crear otro usuario.
      if (error instanceof ConflictException) throw error;

      // Si dos logins concurrentes crean el mismo usuario, recupero el existente.
      if (this.isDuplicateEntry(error)) {
        const existing = await this.userRepository.findOne({
          where: { firebaseUid: profile.uid },
        });
        if (existing) {
          return await this.updateProfileIfMissing(existing, profile);
        }
        throw new ConflictException(
          'Ya existe una cuenta asociada a esos datos.',
        );
      }

      this.logger.error(
        'Error al crear o recuperar el usuario',
        this.errorStack(error),
      );
      throw new InternalServerErrorException(
        'No se pudo iniciar sesión. Intentá nuevamente.',
      );
    }
  }

  // Completo los datos que faltan en el perfil cuando el token trae mas informacion.
  private async updateProfileIfMissing(
    user: UserEntity,
    profile: IFirebaseProfile,
  ): Promise<UserEntity> {
    let changed = false;
    if (!user.displayName && profile.name) {
      user.displayName = profile.name.slice(0, 191);
      changed = true;
    }
    if (!user.photoUrl && profile.picture) {
      user.photoUrl = profile.picture.slice(0, 512);
      changed = true;
    }
    return changed ? await this.userRepository.save(user) : user;
  }

  // Borrado FÍSICO: solo para la purga
  async deleteById(id: string): Promise<void> {
    try {
      await this.userRepository.delete(id);
    } catch (error) {
      this.logger.error('Error al eliminar el usuario', this.errorStack(error));
      throw new InternalServerErrorException(
        'No se pudo eliminar la cuenta. Intentá nuevamente.',
      );
    }
  }

  // Eliminacion logica: la fila y todo lo relacionado se conservan hasta la purga (1 mes).
  async softDeleteById(id: string): Promise<void> {
    try {
      await this.userRepository.softDelete(id);
    } catch (error) {
      this.logger.error('Error al eliminar el usuario', this.errorStack(error));
      throw new InternalServerErrorException(
        'No se pudo eliminar la cuenta. Intentá nuevamente.',
      );
    }
  }

  // Reactiva una cuenta eliminada logicamente (conserva sus datos y su cuota de uso).
  private async restoreIfDeleted(user: UserEntity, firebaseUid?: string): Promise<UserEntity> {
    if (!user.deletedAt) return user;

    await this.userRepository.restore(user.id);
    user.deletedAt = null;
    if (firebaseUid) user.firebaseUid = firebaseUid;
    this.logger.log(`Cuenta reactivada: ${user.id}`);
    return await this.userRepository.save(user);
  }

  // INDICA SI YA EXISTE UN USUARIO REGISTRADO EN LA DB CON ESE UID DE FIREBASE.
  async existsByFirebaseUid(firebaseUid: string): Promise<boolean> {
    const countUsers: number = await this.userRepository.count({ where: { firebaseUid }, withDeleted: true })
    return countUsers > 0;
  }


  // Cuentas eliminadas logicamente antes de la fecha limite (candidatas a purga fisica).
  async findPurgeable(cutoff: Date, limit: number): Promise<UserEntity[]> {
    return this.userRepository.find({
      where: { deletedAt: LessThan(cutoff) },
      withDeleted: true,
      order: { deletedAt: 'ASC' },
      take: limit,
    });
  }

  // Revalida justo antes de purgar: si el usuario volvio, ya no esta eliminado.
  async isPurgeable(id: string, cutoff: Date): Promise<boolean> {
    const count: number = await this.userRepository.count({
      where: { id, deletedAt: LessThan(cutoff) },
      withDeleted: true,
    });
    return count > 0;
  }

  // ACTUALIZA SOLO EL NOMBRE VISIBLE DEL USUARIO AUTENTICADO.
  async updateDisplayName(id: string, displayName: string): Promise<UserEntity> {
    try {
      const user = await this.userRepository.findOne({ where: { id } });
      if (!user) {
        throw new NotFoundException('Usuario no encontrado.');
      }
      user.displayName = displayName;
      return await this.userRepository.save(user);
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error('Error al actualizar el perfil', this.errorStack(error));
      throw new InternalServerErrorException(
        'No se pudo actualizar el perfil. Intentá nuevamente.',
      );
    }
  }

  // SI EL EMAIL VERIFICADO EN FIREBASE CAMBIO, LO ACTUALIZO EN LA DB.
  async syncEmailIfChanged(
    user: UserEntity,
    email: string,
  ): Promise<UserEntity> {
    if (user.email === email) return user;

    const taken = await this.userRepository.findOne({ where: { email }, withDeleted: true });
    if (taken && taken.id !== user.id) {
      throw new ConflictException({
        statusCode: HttpStatus.CONFLICT,
        code: 'EMAIL_ALREADY_IN_USE',
        message: 'Ya existe otra cuenta con ese correo.',
      });
    }

    user.email = email;
    return await this.userRepository.save(user);
  }

  // Carga el perfil completo de la DB a partir del usuario autenticado.
  async findById(id: string): Promise<UserEntity | null> {
    try {
      return await this.userRepository.findOne({ where: { id } });
    } catch (error) {
      this.logger.error('Error al cargar el usuario', this.errorStack(error));
      throw new InternalServerErrorException(
        'No se pudo cargar el perfil del usuario.',
      );
    }
  }

  // Mapea la entidad a la forma limpia que devolvemos al frontend.
  toProfile(user: UserEntity): IAuthUser & { createdAt: Date } {
    return {
      id: user.id,
      firebaseUid: user.firebaseUid,
      email: user.email,
      displayName: user.displayName,
      photoUrl: user.photoUrl,
      createdAt: user.createdAt,
    };
  }

  private isDuplicateEntry(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) return false;
    const driverError = error.driverError as { code?: string; errno?: number };
    return driverError.code === 'ER_DUP_ENTRY' || driverError.errno === 1062;
  }

  private errorStack(error: unknown): string {
    if (error instanceof Error) return error.stack ?? error.message;
    return 'Error desconocido';
  }
}
