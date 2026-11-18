import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Repository } from 'typeorm';
import { UsersService } from '../src/module/users/users.service.js';
import type { UserEntity } from '../src/shared/entities/user.entity.js';

type RepoMock = {
  findOne: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  softDelete: ReturnType<typeof vi.fn>;
  restore: ReturnType<typeof vi.fn>;
  count: ReturnType<typeof vi.fn>;
  find: ReturnType<typeof vi.fn>;
};

describe('UsersService', () => {
  let repo: RepoMock;
  let service: UsersService;

  const user = (overrides: Record<string, unknown> = {}) =>
    ({
      id: 'user-1',
      firebaseUid: 'firebase-1',
      email: 'user@test.com',
      displayName: 'Usuario',
      photoUrl: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      deletedAt: null,
      ...overrides,
    }) as unknown as UserEntity;

  beforeEach(() => {
    repo = {
      findOne: vi.fn(),
      create: vi.fn((value: unknown) => value),
      save: vi.fn(async (value: unknown) => value),
      delete: vi.fn(async () => ({ affected: 1 })),
      softDelete: vi.fn(async () => ({ affected: 1 })),
      restore: vi.fn(async () => ({ affected: 1 })),
      count: vi.fn(),
      find: vi.fn(),
    };
    service = new UsersService(repo as unknown as Repository<UserEntity>);
  });

  describe('findOrCreateByFirebase', () => {
    it('happy path: crea un usuario nuevo con email normalizado', async () => {
      repo.findOne.mockResolvedValue(null);

      const result = await service.findOrCreateByFirebase({
        uid: 'firebase-1',
        email: '  USER@test.com ',
        name: 'Usuario',
        picture: 'https://example.com/photo.jpg',
      });

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          firebaseUid: 'firebase-1',
          email: 'user@test.com',
        }),
      );
      expect(result.email).toBe('user@test.com');
    });

    it('qué pasa si: Firebase no trae email', async () => {
      await expect(
        service.findOrCreateByFirebase({ uid: 'firebase-1' }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(repo.findOne).not.toHaveBeenCalled();
    });

    it('qué pasa si: el email ya pertenece a otra cuenta activa', async () => {
      repo.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(user({ id: 'otro-user' }));

      await expect(
        service.findOrCreateByFirebase({
          uid: 'firebase-2',
          email: 'user@test.com',
        }),
      ).rejects.toMatchObject({ response: { code: 'ACCOUNT_ALREADY_EXISTS' } });
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('happy path: reactiva una cuenta eliminada vinculada al mismo UID', async () => {
      repo.findOne.mockResolvedValueOnce(
        user({ deletedAt: new Date('2026-01-10T00:00:00Z') }),
      );

      const result = await service.findOrCreateByFirebase({
        uid: 'firebase-1',
        email: 'user@test.com',
      });

      expect(repo.restore).toHaveBeenCalledWith('user-1');
      expect(result.deletedAt).toBeNull();
    });

    it('happy path: completa nombre y foto que faltaban', async () => {
      const existing = user({ displayName: null, photoUrl: null });
      repo.findOne.mockResolvedValueOnce(existing);

      await service.findOrCreateByFirebase({
        uid: 'firebase-1',
        email: 'user@test.com',
        name: 'Nombre desde Firebase',
        picture: 'https://example.com/photo.jpg',
      });

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          displayName: 'Nombre desde Firebase',
          photoUrl: 'https://example.com/photo.jpg',
        }),
      );
    });
  });

  describe('perfil y purge', () => {
    it('happy path: actualiza el nombre visible', async () => {
      repo.findOne.mockResolvedValue(user());

      const result = await service.updateDisplayName('user-1', 'Nuevo nombre');

      expect(result.displayName).toBe('Nuevo nombre');
      expect(repo.save).toHaveBeenCalled();
    });

    it('qué pasa si: el usuario no existe al actualizar el perfil', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(
        service.updateDisplayName('user-1', 'Nuevo nombre'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('happy path: sincroniza el email verificado cambiado', async () => {
      const existing = user({ email: 'old@test.com' });
      repo.findOne.mockResolvedValue(null);

      const result = await service.syncEmailIfChanged(existing, 'new@test.com');

      expect(result.email).toBe('new@test.com');
      expect(repo.save).toHaveBeenCalled();
    });

    it('qué pasa si: el nuevo email ya está en uso', async () => {
      const existing = user({ email: 'old@test.com' });
      repo.findOne.mockResolvedValue(user({ id: 'otro-user' }));

      await expect(
        service.syncEmailIfChanged(existing, 'new@test.com'),
      ).rejects.toMatchObject({ response: { code: 'EMAIL_ALREADY_IN_USE' } });
    });

    it('qué pasa si: el mismo email no requiere escritura', async () => {
      const existing = user();

      const result = await service.syncEmailIfChanged(existing, 'user@test.com');

      expect(result).toBe(existing);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('happy path: borrado lógico y borrado físico', async () => {
      await expect(service.softDeleteById('user-1')).resolves.toBeUndefined();
      await expect(service.deleteById('user-1')).resolves.toBeUndefined();

      expect(repo.softDelete).toHaveBeenCalledWith('user-1');
      expect(repo.delete).toHaveBeenCalledWith('user-1');
    });

    it('happy path: findById y toProfile', async () => {
      repo.findOne.mockResolvedValue(user());

      const found = await service.findById('user-1');

      expect(service.toProfile(found!)).toMatchObject({
        id: 'user-1',
        firebaseUid: 'firebase-1',
        email: 'user@test.com',
      });
    });
  });
});
