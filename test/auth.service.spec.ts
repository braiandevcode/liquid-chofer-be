import 'reflect-metadata';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';
import type { ConfigService } from '@nestjs/config';
import type { Repository } from 'typeorm';
import type { UserRecord } from 'firebase-admin/auth';
import { AuthService, REFRESH_COOKIE_NAME } from '../src/module/auth/auth.service.js';
import type { FirebaseService } from '../src/core/firebase/firebase.service.js';
import type { JwtHelper } from '../src/shared/auth/jwt.helper.js';
import type { UsersService } from '../src/module/users/users.service.js';
import type { RefreshTokenEntity } from '../src/shared/entities/refresh-token.entity.js';
import type { UserEntity } from '../src/shared/entities/user.entity.js';
import type { IAuthUser } from '../src/shared/types/auth.types.js';

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

describe('AuthService', () => {
  let firebase: {
    auth: {
      verifyIdToken: ReturnType<typeof vi.fn>;
      getUser: ReturnType<typeof vi.fn>;
      deleteUser: ReturnType<typeof vi.fn>;
    };
  };
  let jwtHelper: { signAccess: ReturnType<typeof vi.fn>; verify: ReturnType<typeof vi.fn> };
  let users: {
    findOrCreateByFirebase: ReturnType<typeof vi.fn>;
    toProfile: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    softDeleteById: ReturnType<typeof vi.fn>;
    updateDisplayName: ReturnType<typeof vi.fn>;
    syncEmailIfChanged: ReturnType<typeof vi.fn>;
    existsByFirebaseUid: ReturnType<typeof vi.fn>;
  };
  let config: { getOrThrow: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn> };
  let refreshRepo: {
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  let response: { cookie: ReturnType<typeof vi.fn>; clearCookie: ReturnType<typeof vi.fn> };
  let service: AuthService;

  const userEntity = {
    id: 'user-1',
    firebaseUid: 'firebase-1',
    email: 'user@test.com',
    displayName: 'Usuario',
    photoUrl: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  } as UserEntity;

  const authUser: IAuthUser = {
    id: 'user-1',
    firebaseUid: 'firebase-1',
    email: 'user@test.com',
    displayName: 'Usuario',
    photoUrl: null,
  };

  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
    firebase = {
      auth: {
        verifyIdToken: vi.fn(),
        getUser: vi.fn(),
        deleteUser: vi.fn(),
      },
    };
    jwtHelper = {
      signAccess: vi.fn(() => 'access-token'),
      verify: vi.fn(),
    };
    users = {
      findOrCreateByFirebase: vi.fn(),
      toProfile: vi.fn((value: UserEntity) => ({
        id: value.id,
        firebaseUid: value.firebaseUid,
        email: value.email,
        displayName: value.displayName,
        photoUrl: value.photoUrl,
        createdAt: value.createdAt,
      })),
      findById: vi.fn(),
      softDeleteById: vi.fn(),
      updateDisplayName: vi.fn(),
      syncEmailIfChanged: vi.fn(),
      existsByFirebaseUid: vi.fn(),
    };
    config = {
      getOrThrow: vi.fn((key: string) =>
        key === 'NODE_ENV' ? 'production' : '604800000',
      ),
      get: vi.fn(),
    };
    refreshRepo = {
      create: vi.fn((value: unknown) => value),
      save: vi.fn(async (value: unknown) => value),
      findOne: vi.fn(),
      update: vi.fn(async () => ({ affected: 1 })),
    };
    response = { cookie: vi.fn(), clearCookie: vi.fn() };

    service = new AuthService(
      firebase as unknown as FirebaseService,
      jwtHelper as unknown as JwtHelper,
      users as unknown as UsersService,
      config as unknown as ConfigService,
      refreshRepo as unknown as Repository<RefreshTokenEntity>,
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('login', () => {
    it('happy path: emite access token y cookie refresh segura', async () => {
      firebase.auth.verifyIdToken.mockResolvedValue({
        uid: 'firebase-1',
        email: 'user@test.com',
        email_verified: true,
      });
      users.findOrCreateByFirebase.mockResolvedValue(userEntity);
      firebase.auth.getUser.mockResolvedValue({
        providerData: [{ providerId: 'password' }],
      });

      const result = await service.login('id-token', response as unknown as Response);

      expect(result).toMatchObject({
        accessToken: 'access-token',
        message: 'Sesión iniciada correctamente.',
        user: { hasPassword: true },
      });
      expect(response.cookie).toHaveBeenCalledWith(
        REFRESH_COOKIE_NAME,
        expect.any(String),
        expect.objectContaining({
          httpOnly: true,
          secure: true,
          sameSite: 'lax',
          path: '/api/v1/auth',
          maxAge: 604800000,
        }),
      );
    });

    it('qué pasa si: el idToken es inválido', async () => {
      firebase.auth.verifyIdToken.mockRejectedValue(new Error('bad token'));

      await expect(
        service.login('bad', response as unknown as Response),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(users.findOrCreateByFirebase).not.toHaveBeenCalled();
    });

    it('qué pasa si: el correo no está verificado', async () => {
      firebase.auth.verifyIdToken.mockResolvedValue({
        uid: 'firebase-1',
        email: 'user@test.com',
        email_verified: false,
      });

      await expect(
        service.login('id-token', response as unknown as Response),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('qué pasa si: Firebase no responde al consultar proveedores', async () => {
      firebase.auth.verifyIdToken.mockResolvedValue({
        uid: 'firebase-1',
        email: 'user@test.com',
        email_verified: true,
      });
      users.findOrCreateByFirebase.mockResolvedValue(userEntity);
      firebase.auth.getUser.mockRejectedValue(new Error('offline'));

      const result = await service.login('id-token', response as unknown as Response);

      expect(result.user.hasPassword).toBe(false);
    });
  });

  describe('refresh', () => {
    it('qué pasa si: no hay cookie de refresh', async () => {
      await expect(
        service.refresh(undefined, response as unknown as Response),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('happy path: rota el refresh token y devuelve un access token', async () => {
      const raw = 'raw-refresh-token';
      refreshRepo.findOne.mockResolvedValue({
        id: 'token-1',
        userId: 'user-1',
        tokenHash: hash(raw),
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        replacedById: null,
      });
      users.findById.mockResolvedValue(userEntity);
      refreshRepo.update
        .mockResolvedValueOnce({ affected: 1 })
        .mockResolvedValueOnce({ affected: 1 });
      refreshRepo.save.mockResolvedValue({ id: 'token-2' });

      const result = await service.refresh(raw, response as unknown as Response);

      expect(result).toEqual({ accessToken: 'access-token' });
      expect(refreshRepo.update).toHaveBeenCalledWith(
        { id: 'token-1' },
        { replacedById: 'token-2' },
      );
      expect(response.cookie).toHaveBeenCalledWith(
        REFRESH_COOKIE_NAME,
        expect.any(String),
        expect.objectContaining({ secure: true, httpOnly: true }),
      );
    });

    it('qué pasa si: el token ya fue rotado y se reutiliza fuera del margen', async () => {
      const raw = 'stolen-token';
      refreshRepo.findOne.mockResolvedValue({
        id: 'token-1',
        userId: 'user-1',
        tokenHash: hash(raw),
        revokedAt: new Date(Date.now() - 60_000),
        expiresAt: new Date(Date.now() + 60_000),
        replacedById: 'token-2',
      });

      await expect(
        service.refresh(raw, response as unknown as Response),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(refreshRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1' }),
        expect.objectContaining({ revokedAt: expect.any(Date) }),
      );
      expect(response.cookie).not.toHaveBeenCalled();
    });

    it('qué pasa si: el token está expirado', async () => {
      const raw = 'expired-token';
      refreshRepo.findOne.mockResolvedValue({
        id: 'token-1',
        userId: 'user-1',
        tokenHash: hash(raw),
        revokedAt: null,
        expiresAt: new Date(Date.now() - 1000),
        replacedById: null,
      });

      await expect(
        service.refresh(raw, response as unknown as Response),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('perfil y cuenta', () => {
    it('happy path: me sincroniza el email verificado de Firebase', async () => {
      users.findById.mockResolvedValue(userEntity);
      firebase.auth.getUser.mockResolvedValue({
        email: 'NEW@TEST.COM',
        emailVerified: true,
        providerData: [{ providerId: 'password' }],
      });
      users.syncEmailIfChanged.mockResolvedValue({
        ...userEntity,
        email: 'new@test.com',
      });

      const result = await service.me(authUser);

      expect(users.syncEmailIfChanged).toHaveBeenCalledWith(
        userEntity,
        'new@test.com',
      );
      expect(result.user.email).toBe('new@test.com');
      expect(result.user.hasPassword).toBe(true);
    });

    it('happy path: actualiza el nombre visible', async () => {
      users.updateDisplayName.mockResolvedValue({
        ...userEntity,
        displayName: 'Nuevo nombre',
      });
      firebase.auth.getUser.mockResolvedValue({ providerData: [] });

      const result = await service.updateProfile(authUser, 'Nuevo nombre');

      expect(result.user.displayName).toBe('Nuevo nombre');
      expect(result.user.hasPassword).toBe(false);
    });

    it('qué pasa si: la reautenticación corresponde a otra cuenta', async () => {
      firebase.auth.verifyIdToken.mockResolvedValue({
        uid: ' firebase-otro ',
        auth_time: Math.floor(Date.now() / 1000),
      });
      users.existsByFirebaseUid.mockResolvedValue(false);
      firebase.auth.getUser.mockResolvedValue({
        metadata: { creationTime: new Date().toISOString() },
      } as unknown as UserRecord);

      await expect(
        service.deleteAccount(
          authUser,
          'id-token',
          response as unknown as Response,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(firebase.auth.deleteUser).toHaveBeenCalledWith(' firebase-otro ');
      expect(users.softDeleteById).not.toHaveBeenCalled();
    });

    it('qué pasa si: la reautenticación es vieja', async () => {
      firebase.auth.verifyIdToken.mockResolvedValue({
        uid: 'firebase-1',
        auth_time: Math.floor(Date.now() / 1000) - 600,
      });

      await expect(
        service.deleteAccount(authUser, 'id-token', response as unknown as Response),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('happy path: logout revoca la cookie y el refresh token', async () => {
      const raw = 'raw-refresh';
      await expect(
        service.logout(response as unknown as Response, raw),
      ).resolves.toEqual({ message: 'Sesión cerrada correctamente.' });

      expect(refreshRepo.update).toHaveBeenCalledWith(
        { tokenHash: hash(raw), revokedAt: expect.anything() },
        { revokedAt: expect.any(Date) },
      );
      expect(response.clearCookie).toHaveBeenCalledWith(
        REFRESH_COOKIE_NAME,
        expect.objectContaining({ secure: true, path: '/api/v1/auth' }),
      );
    });
  });
});
