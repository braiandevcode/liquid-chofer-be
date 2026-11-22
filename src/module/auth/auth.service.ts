import { Injectable, UnauthorizedException, ForbiddenException, ConflictException, Logger, HttpException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository, UpdateResult } from 'typeorm';
import { randomBytes, createHash } from 'crypto';
import { FirebaseService } from '../../core/firebase/firebase.service.js';
import { JwtHelper } from '../../shared/auth/jwt.helper.js';
import { IAuthUser } from '../../shared/types/auth.types.js';
import { UsersService } from '../users/users.service.js';
import { UserRecord } from 'firebase-admin/auth';
import { RefreshTokenEntity } from '../../shared/entities/refresh-token.entity.js';
import { UserEntity } from '../../shared/entities/user.entity.js';
import { ICriterion } from './interfaces/ICriterion.js';
import { ApiBasePath } from '../../core/config/config.endpoints.js';
import { isProduction } from '../../core/config/environment.js';
enum DATA_USER_FIREBASE { _P = 'password' }
export const REFRESH_COOKIE_NAME = 'lqc_rt';



// La cookie viaja a /refresh y a /logout (ambos bajo este path); asi logout puede revocar el token.
const REFRESH_COOKIE_PATH = `/${ApiBasePath.AUTH}`;
// Margen para pedidos paralelos legitimos antes de considerar que hubo reutilizacion.
const REUSE_GRACE_MS = 10_000;
// UN USUARIO DE FIREBASE SIN FILA EN LA DB SOLO SE CONSIDERA DE ESTE INTENTO SI ES MÁS NUEVO QUE ESTO.
const STRAY_USER_MAX_AGE_MS: number = 5 * 60 * 1000;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name)
  constructor(
    private readonly firebaseService: FirebaseService,
    private readonly jwtHelper: JwtHelper,
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
    @InjectRepository(RefreshTokenEntity)
    private readonly refreshRepo: Repository<RefreshTokenEntity>,
  ) { }

  private getRefreshCookieOptions(): { httpOnly: boolean; sameSite: 'lax'; path: string; secure: boolean; maxAge: number } {
    const secure: boolean = isProduction();
    const maxAge: number = this.getMaxAge();
    return { httpOnly: true, sameSite: 'lax', path: REFRESH_COOKIE_PATH, secure, maxAge };
  }

  private getMaxAge(): number {
    const maxAge: number = Number(this.configService.getOrThrow<string>('MAX_AGE'));
    return maxAge;
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  // Recibe el ID token de Firebase, lo verifica, crea/actualiza el usuario y emite access + refresh.
  async login(idToken: string, response: Response) {
    let decoded;
    try {
      decoded = await this.firebaseService.auth.verifyIdToken(idToken);
    } catch {
      throw new UnauthorizedException('Token inválido o expirado.');
    }

    if (decoded.email_verified !== true) {
      throw new ForbiddenException('Debés verificar tu correo antes de ingresar.');
    }

    const user = await this.usersService.findOrCreateByFirebase({
      uid: decoded.uid,
      email: decoded.email,
      name: decoded.name,
      picture: decoded.picture,
    });

    const accessToken = this.jwtHelper.signAccess({
      sub: user.id,
      firebaseUid: user.firebaseUid,
      email: user.email,
    });

    await this.issueRefreshToken(user.id, response);
    const hasPassword = await this.hasPasswordProvider(user.firebaseUid);

    return {
      accessToken,
      user: { ...this.usersService.toProfile(user), hasPassword },
      message: 'Sesión iniciada correctamente.',
    };
  }

  // Para borrar la cookie: mismas opciones (path incluido) pero sin maxAge.
  private getRefreshClearOptions(): { httpOnly: boolean; sameSite: 'lax'; path: string; secure: boolean } {
    const { httpOnly, sameSite, path, secure } = this.getRefreshCookieOptions();
    return { httpOnly, sameSite, path, secure };
  }

  private async issueRefreshToken(userId: string, response: Response): Promise<void> {
    const raw = randomBytes(48).toString('hex');
    const tokenHash = this.hashToken(raw);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const entity = this.refreshRepo.create({ userId, tokenHash, expiresAt, revokedAt: null, replacedById: null });
    await this.refreshRepo.save(entity);
    response.cookie(REFRESH_COOKIE_NAME, raw, this.getRefreshCookieOptions());
  }

  // Consulto a Firebase si la cuenta tiene proveedor de contraseña.
  private async hasPasswordProvider(uid: string): Promise<boolean> {
    try {
      const firebaseUser = await this.firebaseService.auth.getUser(uid);
      return firebaseUser.providerData.some(
        (provider) => provider.providerId === DATA_USER_FIREBASE._P,
      );
    } catch {
      return false; // Si Firebase falla, lo más restrictivo: no mostrar la opción.
    }
  }

  // Borra de Firebase la cuenta creada por reautenticar con un Google equivocado.
  private async cleanupStrayFirebaseUser(uid: string): Promise<void> {
    try {
      const existsByFirebaseUid = await this.usersService.existsByFirebaseUid(uid);

      // SI EXISTE UNA FILA EN LA DB, NO BORRO EL USUARIO DE FIREBASE: ES LEGITIMO.
      if (existsByFirebaseUid) return;

      const firebaseUser: UserRecord = await this.firebaseService.auth.getUser(uid);
      const createdAt: number = Date.parse(firebaseUser.metadata.creationTime);

      // 1) Que la fecha de creacion sea valida (no NaN)
      const isNoNaN: boolean = Number.isFinite(createdAt);
      // 2) Que no haya pasado el tiempo maximo permitido para considerar al usuario como "reciente".
      const isRecent: boolean = Date.now() - createdAt <= STRAY_USER_MAX_AGE_MS;

      // SI LA FECHA DE CREACION ES INVALIDA O LA CUENTA ES VIEJA , NO HAGO NADA
      if (!isNoNaN || !isRecent) return;

      await this.firebaseService.auth.deleteUser(uid);

      this.logger.warn(`Se eliminó el usuario de Firebase ${uid}: lo creó una reautenticación con cuenta equivocada.`);
    } catch (error) {
      this.logger.error(
        `No se pudo limpiar el usuario de Firebase ${uid}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  // Elimina la cuenta: exige reautenticacion reciente y que el token sea del mismo usuario de la sesion.
  async deleteAccount(authenticated: IAuthUser, idToken: string, response: Response) {
    let decoded;
    try {
      decoded = await this.firebaseService.auth.verifyIdToken(idToken, true);
    } catch {
      throw new UnauthorizedException('Token inválido o expirado.');
    }

    if (decoded.uid !== authenticated.firebaseUid) {
      await this.cleanupStrayFirebaseUser(decoded.uid);
      throw new ForbiddenException('La reautenticación no corresponde a tu cuenta.');
    }

    const MAX_AUTH_AGE_SECONDS = 5 * 60;
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (nowSeconds - decoded.auth_time > MAX_AUTH_AGE_SECONDS) {
      throw new UnauthorizedException('Reautenticá nuevamente para eliminar tu cuenta.');
    }

    const user = await this.usersService.findById(authenticated.id);
    if (!user) throw new UnauthorizedException('Usuario no encontrado.');

    await this.usersService.softDeleteById(user.id);
    try {
      await this.firebaseService.auth.deleteUser(user.firebaseUid);
    } catch (error) {
      this.logger.error(
        `No se pudo borrar el usuario de Firebase ${user.firebaseUid}; la cuenta quedó eliminada en la DB.`,
        error instanceof Error ? error.stack : String(error),
      );
    }

    await this.revokeAllRefreshTokensForUser(user.id);
    response.clearCookie(REFRESH_COOKIE_NAME, this.getRefreshClearOptions());
    return { message: 'Cuenta eliminada correctamente.' };
  }

  private async revokeAllRefreshTokensForUser(userId: string): Promise<void> {
    await this.refreshRepo.update({ userId, revokedAt: IsNull() }, { revokedAt: new Date() });
  }

  // Edita el perfil del usuario de la sesion y devuelve el perfil actualizado.
  async updateProfile(authenticated: IAuthUser, displayName: string) {
    const user = await this.usersService.updateDisplayName(authenticated.id, displayName);
    const hasPassword: boolean = await this.hasPasswordProvider(user.firebaseUid);
    return { user: { ...this.usersService.toProfile(user), hasPassword } };
  }

  async refresh(refreshTokenRaw: string | undefined, response: Response): Promise<{ accessToken: string }> {
    if (!refreshTokenRaw) throw new UnauthorizedException('No hay sesión para renovar.');

    try {
      const existing = await this.refreshRepo.findOne({ where: { tokenHash: this.hashToken(refreshTokenRaw) } });
      if (!existing) throw new UnauthorizedException('Sesión inválida o expirada.');

      // SI TIENE FECHA DE REVOKE
      if (existing.revokedAt) {
        //UN TOKEN YA ROBADO QUE APARECE FUERA DEL MARGEN: POSIBLE ROBO, SE CIERRAN TODAS LAS SESSIONES
        const wasRotated: boolean = existing.replacedById !== null;
        if (wasRotated && Date.now() - existing.revokedAt.getTime() > REUSE_GRACE_MS) {
          await this.revokeAllRefreshTokensForUser(existing.userId);
          this.logger.warn(`Reutilización de refresh token: sesiones revocadas del usuario ${existing.userId}`);
        }
        throw new UnauthorizedException('Sesión inválida o expirada.');
      }

      // SI EL TIEMPO DE LA FECHA ES MENOR O IGUAL, SIGNIFICA QUE EXPIRÓ/INVALIDA
      if (existing.expiresAt.getTime() <= Date.now()) {
        throw new UnauthorizedException('Sesión inválida o expirada.');
      }

      const user: UserEntity | null = await this.usersService.findById(existing.userId);
      if (!user) throw new UnauthorizedException('Usuario no encontrado.');

      const criterion: ICriterion = { id: existing.id, revokedAt: IsNull() };
      // RECLAMO ATOMICO: SOLO UN PEDIDO PUEDE ROTAR ESTE TOKEN
      const claimed: UpdateResult = await this.refreshRepo.update(criterion,
        { revokedAt: new Date() },
      );

      // SI NO SURGIÓ EFECTO
      if (!claimed.affected) throw new UnauthorizedException('Sesión inválida o expirada.');

      const newRaw: string = randomBytes(48).toString('hex');

      // CREAR
      const create: RefreshTokenEntity = this.refreshRepo.create({
        userId: user.id,
        tokenHash: this.hashToken(newRaw),
        expiresAt: new Date(Date.now() + this.getMaxAge()),
        revokedAt: null,
        replacedById: null,
      })


      // GUARDAR NUEVO
      const savedNew: RefreshTokenEntity = await this.refreshRepo.save(create);

      await this.refreshRepo.update({ id: existing.id }, { replacedById: savedNew.id });
      response.cookie(REFRESH_COOKIE_NAME, newRaw, this.getRefreshCookieOptions());

      const accessToken: string = this.jwtHelper.signAccess({ sub: user.id, firebaseUid: user.firebaseUid, email: user.email });
      return { accessToken };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error('No se pudo renovar la sesión', error instanceof Error ? error.stack : String(error));
      throw new InternalServerErrorException('No se pudo renovar la sesión. Intentá nuevamente.');
    }
  }

  async me(authenticated: IAuthUser): Promise<{ user: IAuthUser & { createdAt: Date, hasPassword: boolean } }> {
    let user = await this.usersService.findById(authenticated.id);
    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado.');
    }

    // Consulto a Firebase (fuente de verdad) si la cuenta tiene proveedor de contraseña.
    let hasPassword = false;
    try {
      const firebaseUser = await this.firebaseService.auth.getUser(user.firebaseUid);
      hasPassword = firebaseUser.providerData.some(
        (provider) => provider.providerId === DATA_USER_FIREBASE._P,
      );

      // Sincronizo el email solo si Firebase lo tiene verificado y cambio.
      const firebaseEmail = firebaseUser.email?.trim().toLowerCase();
      if (firebaseUser.emailVerified && firebaseEmail && firebaseEmail !== user.email) {
        user = await this.usersService.syncEmailIfChanged(user, firebaseEmail);
      }
    } catch (error) {
      // Un 409 (correo en uso por otro usuario) debe verse; el resto no rompe la sesión.
      if (error instanceof ConflictException) throw error;
    }

    return { user: { ...this.usersService.toProfile(user), hasPassword } };
  }

  async logout(response: Response, refreshTokenRaw?: string): Promise<{ message: string }> {
    if (refreshTokenRaw) {
      const hash = this.hashToken(refreshTokenRaw);
      await this.refreshRepo.update({ tokenHash: hash, revokedAt: IsNull() }, { revokedAt: new Date() });
    }
    response.clearCookie(REFRESH_COOKIE_NAME, this.getRefreshClearOptions());
    return { message: 'Sesión cerrada correctamente.' };
  }
}
