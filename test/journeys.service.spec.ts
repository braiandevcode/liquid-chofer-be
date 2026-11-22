import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { DataSource, Repository } from 'typeorm';
import { JourneysService } from '../src/module/journeys/journeys.service.js';
import type { CreateJourneyDto } from '../src/module/journeys/dto/create-journey.dto.js';
import type { JourneyHistoryEntity } from '../src/shared/entities/journey-history.entity.js';
import type { JourneyTombstoneEntity } from '../src/shared/entities/journey-tombstone.entity.js';

type ManagerMock = {
  findOne: ReturnType<typeof vi.fn>;
  count: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  restore: ReturnType<typeof vi.fn>;
};

describe('JourneysService', () => {
  let journeyRepo: {
    findAndCount: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  let tombstoneRepo: { findOne: ReturnType<typeof vi.fn> };
  let manager: ManagerMock;
  let service: JourneysService;

  const baseDto = (): CreateJourneyDto =>
    ({
      journeyDate: '2026-01-15',
      total: 100000,
      agencyPercent: 70,
      driverPercent: 30,
      carRented: false,
      carPercent: null,
      carOwner: 'agency',
      gas: 0,
      petrol: 0,
      vouchers: [],
      replaceExisting: false,
    }) as CreateJourneyDto;

  const activeJourney = (overrides: Record<string, unknown> = {}) =>
    ({
      id: 'journey-1',
      userId: 'user-1',
      journeyDate: '2026-01-15',
      total: 100000,
      adjustedTotal: 100000,
      agencyPercent: 70,
      agencyAmount: 70000,
      finalAgency: 70000,
      driverPercent: 30,
      driverAmount: 30000,
      carPercent: null,
      carAmount: null,
      createdAt: new Date('2026-01-15T10:00:00Z'),
      deletedAt: null,
      deleteReason: null,
      replacedById: null,
      verificationCode: 'ABCDEFGHJKMNPQRS',
      ...overrides,
    }) as unknown as JourneyHistoryEntity;

  beforeEach(() => {
    journeyRepo = {
      findAndCount: vi.fn(),
      findOne: vi.fn(),
      update: vi.fn(),
    };
    tombstoneRepo = { findOne: vi.fn() };
    manager = {
      findOne: vi.fn(),
      count: vi.fn(),
      create: vi.fn((_entity: unknown, data: Record<string, unknown>) => ({
        ...data,
        id: data.id ?? 'journey-1',
        createdAt: data.createdAt ?? new Date(),
      })),
      save: vi.fn(async (value: unknown) => value),
      update: vi.fn(async () => ({ affected: 1 })),
      restore: vi.fn(async () => ({ affected: 1 })),
    };
    const dataSource = {
      transaction: vi.fn(async (callback: (tx: ManagerMock) => unknown) =>
        callback(manager),
      ),
    } as unknown as DataSource;

    service = new JourneysService(
      journeyRepo as unknown as Repository<JourneyHistoryEntity>,
      tombstoneRepo as unknown as Repository<JourneyTombstoneEntity>,
      dataSource,
    );
  });

  describe('create', () => {
    it('happy path: calcula y guarda la jornada con código de verificación', async () => {
      manager.findOne.mockResolvedValue(null);
      manager.count.mockResolvedValue(0);

      const result = await service.create('user-1', baseDto());

      expect(result).toMatchObject({
        id: 'journey-1',
        userId: 'user-1',
        activeSlot: 1,
      });
      expect((result as { verificationCode: string }).verificationCode).toMatch(
        /^[0-9A-HJKMNP-TV-Z]{16}$/,
      );
      expect(manager.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ userId: 'user-1', activeSlot: 1 }),
      );
    });

    it('qué pasa si: ya existe una jornada vigente en esa fecha', async () => {
      manager.findOne.mockResolvedValue(activeJourney());

      await expect(service.create('user-1', baseDto())).rejects.toMatchObject({
        status: 409,
        response: { code: 'JOURNEY_DATE_EXISTS' },
      });
      expect(manager.update).not.toHaveBeenCalled();
    });

    it('qué pasa si: el usuario confirma reemplazar la jornada de esa fecha', async () => {
      manager.findOne.mockResolvedValue(activeJourney());
      manager.count.mockResolvedValue(0);

      await service.create('user-1', {
        ...baseDto(),
        replaceExisting: true,
      });

      expect(manager.update).toHaveBeenCalledWith(
        expect.anything(),
        { id: 'journey-1' },
        expect.objectContaining({ deleteReason: 'replaced', activeSlot: null }),
      );
      expect(manager.update).toHaveBeenCalledWith(
        expect.anything(),
        { id: 'journey-1' },
        { replacedById: 'journey-1' },
      );
    });

    it('qué pasa si: la fecha es inexistente', async () => {
      await expect(
        service.create('user-1', { ...baseDto(), journeyDate: '2026-02-31' }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(manager.findOne).not.toHaveBeenCalled();
    });

    it('qué pasa si: la fecha es futura', async () => {
      await expect(
        service.create('user-1', { ...baseDto(), journeyDate: '2099-01-01' }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('qué pasa si: alquila el vehículo sin indicar el porcentaje', async () => {
      await expect(
        service.create('user-1', {
          ...baseDto(),
          carRented: true,
          carPercent: null,
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('qué pasa si: los porcentajes no suman 100', async () => {
      await expect(
        service.create('user-1', { ...baseDto(), agencyPercent: 70, driverPercent: 20 }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('qué pasa si: alcanzó el máximo de jornadas guardadas para esa fecha', async () => {
      manager.findOne.mockResolvedValue(null);
      manager.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(3);

      await expect(service.create('user-1', baseDto())).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(manager.count).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({
          where: { userId: 'user-1', journeyDate: '2026-01-15' },
          withDeleted: true,
        }),
      );
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('happy path: hay 3 jornadas en otra fecha y la fecha nueva está libre', async () => {
      manager.findOne.mockResolvedValue(null);
      // Simulo 3 guardadas en 2026-01-15 y 0 en la fecha que quiero crear.
      manager.count.mockImplementation(
        (
          _entity: unknown,
          options: { where: { journeyDate: string }; withDeleted?: boolean },
        ) => {
          if (!options.withDeleted) return Promise.resolve(1);
          return Promise.resolve(
            options.where.journeyDate === '2026-01-15' ? 3 : 0,
          );
        },
      );

      await expect(
        service.create('user-1', { ...baseDto(), journeyDate: '2026-01-16' }),
      ).resolves.toMatchObject({ journeyDate: '2026-01-16', activeSlot: 1 });
      expect(manager.count).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({
          where: { userId: 'user-1', journeyDate: '2026-01-16' },
          withDeleted: true,
        }),
      );
      expect(manager.save).toHaveBeenCalled();
    });

    it('qué pasa si: alcanzó el tope de esa fecha y confirma reemplazo', async () => {
      manager.findOne.mockResolvedValue(activeJourney());
      manager.count.mockResolvedValue(3);

      await expect(
        service.create('user-1', { ...baseDto(), replaceExisting: true }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(manager.update).toHaveBeenCalledWith(
        expect.anything(),
        { id: 'journey-1' },
        expect.objectContaining({ deleteReason: 'replaced', activeSlot: null }),
      );
      expect(manager.save).not.toHaveBeenCalled();
    });
  });

  describe('list / getOne', () => {
    it('happy path: lista solo las jornadas del usuario autenticado', async () => {
      journeyRepo.findAndCount.mockResolvedValue([[activeJourney()], 1]);

      const result = await service.list('user-1', 10, 0);

      expect(result).toMatchObject({ total: 1, limit: 10, offset: 0 });
      expect(journeyRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1' }, take: 10, skip: 0 }),
      );
    });

    it('happy path: devuelve una jornada propia con sus vales', async () => {
      journeyRepo.findOne.mockResolvedValue(activeJourney({ vouchers: [] }));

      const result = await service.getOne('user-1', 'journey-1');

      expect(result.id).toBe('journey-1');
      expect(journeyRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'journey-1', userId: 'user-1' } }),
      );
    });

    it('qué pasa si: la jornada es ajena o no existe', async () => {
      journeyRepo.findOne.mockResolvedValue(null);

      await expect(service.getOne('user-1', 'journey-2')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('happy path: lista la papelera con fecha de purga', async () => {
      const deletedAt = new Date('2026-01-20T10:00:00Z');
      journeyRepo.findAndCount.mockResolvedValue([
        [activeJourney({ deletedAt, deleteReason: 'user' })],
        1,
      ]);

      const result = await service.listTrash('user-1');

      expect(result.items[0]).toMatchObject({
        deleteReason: 'user',
        verificationCode: 'ABCD-EFGH-JKMN-PQRS',
        purgeAt: new Date(deletedAt.getTime() + 30 * 24 * 60 * 60 * 1000),
      });
    });
  });

  describe('remove / restore', () => {
    it('happy path: elimina lógicamente y libera el día', async () => {
      journeyRepo.update.mockResolvedValue({ affected: 1 });

      await expect(service.remove('user-1', 'journey-1')).resolves.toEqual({
        message: 'Jornada eliminada.',
      });
      expect(journeyRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'journey-1', userId: 'user-1' }),
        expect.objectContaining({ deleteReason: 'user', activeSlot: null }),
      );
    });

    it('qué pasa si: intenta eliminar dos veces la misma jornada', async () => {
      journeyRepo.update.mockResolvedValue({ affected: 0 });

      await expect(service.remove('user-1', 'journey-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('happy path: restaura una jornada de la papelera', async () => {
      manager.findOne
        .mockResolvedValueOnce(
          activeJourney({ deletedAt: new Date(Date.now() - 60_000) }),
        )
        .mockResolvedValueOnce(null);
      manager.count.mockResolvedValue(0);

      await expect(
        service.restore('user-1', 'journey-1', false),
      ).resolves.toEqual({ message: 'Jornada restaurada.', id: 'journey-1' });
      expect(manager.restore).toHaveBeenCalled();
    });

    it('qué pasa si: restaura y ya existe una vigente sin confirmar reemplazo', async () => {
      manager.findOne
        .mockResolvedValueOnce(
          activeJourney({ deletedAt: new Date(Date.now() - 60_000) }),
        )
        .mockResolvedValueOnce(activeJourney({ id: 'journey-2' }));

      await expect(
        service.restore('user-1', 'journey-1', false),
      ).rejects.toMatchObject({ response: { code: 'JOURNEY_DATE_EXISTS' } });
      expect(manager.restore).not.toHaveBeenCalled();
    });

    it('qué pasa si: la jornada de la papelera ya venció', async () => {
      manager.findOne.mockResolvedValueOnce(
        activeJourney({ deletedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) }),
      );

      await expect(
        service.restore('user-1', 'journey-1', false),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('share / verify', () => {
    it('happy path: una jornada vigente es compartible', async () => {
      journeyRepo.findOne.mockResolvedValue(activeJourney());

      const result = await service.getShareStatus('user-1', 'journey-1');

      expect(result).toMatchObject({
        shareable: true,
        status: 'active',
        verificationCode: 'ABCD-EFGH-JKMN-PQRS',
      });
    });

    it('qué pasa si: la jornada está en papelera', async () => {
      journeyRepo.findOne.mockResolvedValue(
        activeJourney({ deletedAt: new Date() }),
      );

      await expect(
        service.getShareStatus('user-1', 'journey-1'),
      ).resolves.toEqual({ shareable: false, status: 'deleted' });
    });

    it('happy path: verificación pública de una jornada vigente', async () => {
      journeyRepo.findOne.mockResolvedValue(activeJourney());

      const result = await service.verify('abcd-efgh-jkmn-pqrs');

      expect(result).toMatchObject({
        status: 'active',
        journeyDate: '2026-01-15',
        amounts: { total: 100000 },
      });
    });

    it('qué pasa si: el código es malformado', async () => {
      await expect(service.verify('demasiado-largo-para-un-codigo-valido')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(journeyRepo.findOne).not.toHaveBeenCalled();
    });

    it('qué pasa si: la jornada ya se purgó pero queda el tombstone', async () => {
      journeyRepo.findOne.mockResolvedValue(null);
      tombstoneRepo.findOne.mockResolvedValue({
        verificationCode: 'ABCDEFGHJKMNPQRS',
        deleteReason: 'replaced',
        journeyDate: '2026-01-15',
        createdAt: new Date('2026-01-15T10:00:00Z'),
        deletedAt: new Date('2026-01-20T10:00:00Z'),
      });

      const result = await service.verify('ABCDEFGHJKMNPQRS');

      expect(result).toMatchObject({ status: 'replaced', amounts: null });
    });
  });
});
