import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { UpdateSettingsDto } from '../src/module/user-settings/dto/update-setting.dto.js';
import { SaveDraftDto } from '../src/module/journey-draft/dto/save-draft.dto.js';
import { CreateJourneyDto } from '../src/module/journeys/dto/create-journey.dto.js';
import { ChatDto } from '../src/module/ai/dto/chat.dto.js';

const errorsFor = async <T extends object>(
  cls: new () => T,
  payload: object,
) => validate(plainToInstance(cls, payload as T));

describe('validación de DTOs del panel', () => {
  it('settings happy path', async () => {
    const errors = await errorsFor(UpdateSettingsDto, {
      defaultAgencyPercent: 70,
      defaultDriverPercent: 30,
      defaultCarRented: false,
      defaultCarPercent: null,
      defaultCarOwner: 'agency',
    });

    expect(errors).toHaveLength(0);
  });

  it('qué pasa si: settings envía un dueño de auto inválido', async () => {
    const errors = await errorsFor(UpdateSettingsDto, {
      defaultAgencyPercent: 70,
      defaultDriverPercent: 30,
      defaultCarRented: false,
      defaultCarOwner: 'other',
    });

    expect(errors.some((error) => error.property === 'defaultCarOwner')).toBe(true);
  });

  it('qué pasa si: settings envía un porcentaje decimal', async () => {
    const errors = await errorsFor(UpdateSettingsDto, {
      defaultAgencyPercent: 70.5,
      defaultDriverPercent: 29.5,
      defaultCarRented: false,
    });

    expect(errors.some((error) => error.property === 'defaultAgencyPercent')).toBe(
      true,
    );
  });

  it('draft happy path con un vale', async () => {
    const errors = await errorsFor(SaveDraftDto, {
      total: 100000,
      agencyPercent: 70,
      driverPercent: 30,
      carPercent: 0,
      carRented: false,
      gas: 0,
      petrol: 0,
      showVouchers: true,
      vouchers: [
        {
          id: 'v1',
          type: 'factory',
          name: 'Fábrica',
          trips: 2,
          pricePerTrip: 1000,
          fixedFeePerTrip: 800,
        },
      ],
    });

    expect(errors).toHaveLength(0);
  });

  it('qué pasa si: el draft supera 50 vales', async () => {
    const errors = await errorsFor(SaveDraftDto, {
      total: 1,
      agencyPercent: 70,
      driverPercent: 30,
      carPercent: 0,
      carRented: false,
      gas: 0,
      petrol: 0,
      showVouchers: false,
      vouchers: Array.from({ length: 51 }, (_, index) => ({
        id: `v${index}`,
        type: 'other',
        name: 'Cliente',
        trips: 1,
        pricePerTrip: 1,
        fixedFeePerTrip: 0,
      })),
    });

    expect(errors.some((error) => error.property === 'vouchers')).toBe(true);
  });

  it('qué pasa si: el vale del draft tiene un tipo inválido', async () => {
    const errors = await errorsFor(SaveDraftDto, {
      total: 1,
      agencyPercent: 70,
      driverPercent: 30,
      carPercent: 0,
      carRented: false,
      gas: 0,
      petrol: 0,
      showVouchers: false,
      vouchers: [
        {
          id: 'v1',
          type: 'unknown',
          name: 'Cliente',
          trips: 1,
          pricePerTrip: 1,
          fixedFeePerTrip: 0,
        },
      ],
    });

    expect(errors.some((error) => error.property === 'vouchers')).toBe(true);
  });

  it('journey happy path', async () => {
    const errors = await errorsFor(CreateJourneyDto, {
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
    });

    expect(errors).toHaveLength(0);
  });

  it('qué pasa si: la fecha de la jornada tiene formato inválido', async () => {
    const errors = await errorsFor(CreateJourneyDto, {
      journeyDate: '15-01-2026',
      total: 1,
      agencyPercent: 70,
      driverPercent: 30,
      carRented: false,
      carPercent: null,
      carOwner: 'agency',
      gas: 0,
      petrol: 0,
      vouchers: [],
    });

    expect(errors.some((error) => error.property === 'journeyDate')).toBe(true);
  });

  it('qué pasa si: la jornada supera 50 vales', async () => {
    const errors = await errorsFor(CreateJourneyDto, {
      journeyDate: '2026-01-15',
      total: 1,
      agencyPercent: 70,
      driverPercent: 30,
      carRented: false,
      carPercent: null,
      carOwner: 'agency',
      gas: 0,
      petrol: 0,
      vouchers: Array.from({ length: 51 }, () => ({
        type: 'other',
        name: 'Cliente',
        trips: 1,
        pricePerTrip: 1,
        fixedFeePerTrip: 0,
      })),
    });

    expect(errors.some((error) => error.property === 'vouchers')).toBe(true);
  });

  it('chat happy path con confirmación sin mensaje', async () => {
    const errors = await errorsFor(ChatDto, { confirmCalculation: true });

    expect(errors).toHaveLength(0);
  });

  it('qué pasa si: el chat recibe un mensaje vacío', async () => {
    const errors = await errorsFor(ChatDto, { message: '   ' });

    expect(errors.some((error) => error.property === 'message')).toBe(true);
  });

  it('qué pasa si: el chat recibe un conversationId inválido', async () => {
    const errors = await errorsFor(ChatDto, {
      message: 'hola',
      conversationId: 'no-uuid',
    });

    expect(errors.some((error) => error.property === 'conversationId')).toBe(true);
  });

  it('qué pasa si: el chat recibe 4 imágenes', async () => {
    const errors = await errorsFor(ChatDto, {
      message: 'hola',
      imagesData: [
        'data:image/jpeg;base64,AAAA',
        'data:image/jpeg;base64,BBBB',
        'data:image/jpeg;base64,CCCC',
        'data:image/jpeg;base64,DDDD',
      ],
    });

    expect(errors.some((error) => error.property === 'imagesData')).toBe(true);
  });
});
