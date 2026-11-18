import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  InternalServerErrorException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Repository } from 'typeorm';
import { SettingsService } from '../src/module/user-settings/settings.service.js';
import type { UpdateSettingsDto } from '../src/module/user-settings/dto/update-setting.dto.js';
import type { UserSettingsEntity } from '../src/shared/entities/user-setting.entity.js';

type RepoMock = {
  findOne: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
};

describe('SettingsService', () => {
  let repo: RepoMock;
  let service: SettingsService;

  beforeEach(() => {
    repo = {
      findOne: vi.fn(),
      create: vi.fn((value: unknown) => value),
      save: vi.fn(async (value: unknown) => value),
    };
    service = new SettingsService(repo as unknown as Repository<UserSettingsEntity>);
  });

  it('happy path: devuelve defaults cuando el usuario aún no guardó ajustes', async () => {
    repo.findOne.mockResolvedValue(null);

    await expect(service.get('user-1')).resolves.toEqual({
      defaultAgencyPercent: 70,
      defaultDriverPercent: 30,
      defaultCarRented: false,
      defaultCarPercent: null,
      defaultCarOwner: 'agency',
    });
  });

  it('happy path: devuelve los ajustes guardados', async () => {
    repo.findOne.mockResolvedValue({
      defaultAgencyPercent: 60,
      defaultDriverPercent: 40,
      defaultCarRented: false,
      defaultCarPercent: null,
      defaultCarOwner: 'driver',
    });

    const result = await service.get('user-1');

    expect(result.defaultCarOwner).toBe('driver');
    expect(repo.findOne).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
  });

  it('happy path: guarda porcentajes que suman 100', async () => {
    const dto = {
      defaultAgencyPercent: 70,
      defaultDriverPercent: 30,
      defaultCarRented: false,
      defaultCarPercent: null,
      defaultCarOwner: 'agency',
    } as UpdateSettingsDto;

    const result = await service.update('user-1', dto);

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        defaultAgencyPercent: 70,
        defaultDriverPercent: 30,
        defaultCarPercent: null,
        defaultCarOwner: 'agency',
      }),
    );
    expect(result.defaultAgencyPercent).toBe(70);
  });

  it('qué pasa si: el auto se alquila pero falta el porcentaje del vehículo', async () => {
    const dto = {
      defaultAgencyPercent: 70,
      defaultDriverPercent: 30,
      defaultCarRented: true,
      defaultCarPercent: null,
    } as UpdateSettingsDto;

    await expect(service.update('user-1', dto)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('qué pasa si: los porcentajes no suman 100', async () => {
    const dto = {
      defaultAgencyPercent: 70,
      defaultDriverPercent: 31,
      defaultCarRented: false,
      defaultCarPercent: null,
    } as UpdateSettingsDto;

    await expect(service.update('user-1', dto)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('qué pasa si: el repositorio falla al cargar', async () => {
    repo.findOne.mockRejectedValue(new Error('DB down'));

    await expect(service.get('user-1')).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });

  it('qué pasa si: el repositorio falla al guardar', async () => {
    repo.save.mockRejectedValue(new Error('DB down'));
    const dto = {
      defaultAgencyPercent: 70,
      defaultDriverPercent: 30,
      defaultCarRented: false,
      defaultCarPercent: null,
    } as UpdateSettingsDto;

    await expect(service.update('user-1', dto)).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });
});
