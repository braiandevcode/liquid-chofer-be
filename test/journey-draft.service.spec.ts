import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InternalServerErrorException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { JourneyDraftService } from '../src/module/journey-draft/journey-draft.service.js';
import type { SaveDraftDto } from '../src/module/journey-draft/dto/save-draft.dto.js';
import type { JourneyDraftEntity } from '../src/shared/entities/journey-draft.entity.js';

type RepoMock = {
  findOne: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

describe('JourneyDraftService', () => {
  let repo: RepoMock;
  let service: JourneyDraftService;

  beforeEach(() => {
    repo = {
      findOne: vi.fn(),
      create: vi.fn((value: unknown) => value),
      save: vi.fn(async (value: unknown) => value),
      delete: vi.fn(async () => ({ affected: 1 })),
    };
    service = new JourneyDraftService(repo as unknown as Repository<JourneyDraftEntity>);
  });

  const draft = {
    total: 100000,
    agencyPercent: 70,
    driverPercent: 30,
    carPercent: 0,
    carRented: false,
    gas: 0,
    petrol: 0,
    showVouchers: false,
    vouchers: [],
  } as SaveDraftDto;

  it('happy path: GET devuelve el borrador guardado', async () => {
    repo.findOne.mockResolvedValue({ data: draft });

    await expect(service.get('user-1')).resolves.toEqual({ data: draft });
    expect(repo.findOne).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
  });

  it('qué pasa si: no existe borrador', async () => {
    repo.findOne.mockResolvedValue(null);

    await expect(service.get('user-1')).resolves.toEqual({ data: null });
  });

  it('happy path: PUT crea/reemplaza el borrador del usuario', async () => {
    await expect(service.save('user-1', draft)).resolves.toEqual({
      message: 'Borrador guardado.',
    });

    expect(repo.create).toHaveBeenCalledWith({
      userId: 'user-1',
      data: { ...draft },
    });
    expect(repo.save).toHaveBeenCalledOnce();
  });

  it('happy path: DELETE borra el borrador del usuario', async () => {
    await expect(service.remove('user-1')).resolves.toEqual({
      message: 'Borrador eliminado.',
    });

    expect(repo.delete).toHaveBeenCalledWith({ userId: 'user-1' });
  });

  it('qué pasa si: DELETE se llama dos veces', async () => {
    repo.delete.mockResolvedValue({ affected: 0 });

    await expect(service.remove('user-1')).resolves.toEqual({
      message: 'Borrador eliminado.',
    });
    await expect(service.remove('user-1')).resolves.toEqual({
      message: 'Borrador eliminado.',
    });
    expect(repo.delete).toHaveBeenCalledTimes(2);
  });

  it('qué pasa si: falla la lectura', async () => {
    repo.findOne.mockRejectedValue(new Error('DB down'));

    await expect(service.get('user-1')).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });

  it('qué pasa si: falla el guardado', async () => {
    repo.save.mockRejectedValue(new Error('DB down'));

    await expect(service.save('user-1', draft)).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });

  it('qué pasa si: falla el borrado', async () => {
    repo.delete.mockRejectedValue(new Error('DB down'));

    await expect(service.remove('user-1')).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });
});
