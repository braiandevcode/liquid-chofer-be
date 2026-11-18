import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { CalculationService } from '../src/module/ai/calculation.service.js';
import { EVoucherType } from '../src/shared/ai/calculation.types.js';
import { calculateJourney } from '../src/module/journeys/journey-calculator.js';
import {
  formatVerificationCode,
  generateVerificationCode,
  normalizeVerificationCode,
} from '../src/module/journeys/journey-verification-code.js';

describe('CalculationService', () => {
  const service = new CalculationService();

  const completeInput = {
    totalInvoiced: 100000,
    agencyPercentage: 70,
    driverPercentage: 30,
    vehicleRented: false as const,
    carOwner: 'agency' as const,
    gas: 2000,
    fuel: 3000,
    vouchers: [
      {
        type: EVoucherType.FABRICA,
        name: 'Fábrica A',
        trips: 10,
        pricePerTrip: 1000,
        fixedFeePerTrip: 800,
      },
      {
        type: EVoucherType.OTRO,
        name: 'Cliente B',
        trips: 5,
        pricePerTrip: 500,
      },
    ],
  };

  it('happy path: no faltan datos', () => {
    expect(service.getMissingFields(completeInput)).toEqual([]);
  });

  it('qué pasa si: faltan datos obligatorios', () => {
    const missing = service.getMissingFields({ vouchers: [] });

    expect(missing).toContain('totalInvoiced');
    expect(missing).toContain('vehicleRented');
    expect(missing).toContain('gas');
    expect(missing).toContain('fuel');
  });

  it('qué pasa si: hay porcentajes negativos', () => {
    const missing = service.getMissingFields({
      ...completeInput,
      agencyPercentage: -1,
    });

    expect(missing).toContain('percentages');
    expect(missing).not.toContain('agencyPercentage');
  });

  it('qué pasa si: alquila vehículo y falta el porcentaje del vehículo', () => {
    expect(
      service.getMissingFields({ ...completeInput, vehicleRented: true }),
    ).toContain('vehiclePercentage');
  });

  it('deriva el porcentaje del vehículo cuando alquila y faltan 10 puntos', () => {
    const result = service.withDerivedVehiclePercentage({
      ...completeInput,
      vehicleRented: true,
      agencyPercentage: 60,
      driverPercentage: 30,
      vehiclePercentage: undefined,
    });

    expect(result.vehiclePercentage).toBe(10);
  });

  it('calcula el cierre con combustible a cargo de la agencia', () => {
    const result = service.calculate(completeInput);

    expect(result).toMatchObject({
      factoryVoucherInvoiced: 10000,
      factoryVoucherFixed: 8000,
      otherVoucherTotal: 2500,
      profit: 98000,
      agency: 53100,
      driver: 29400,
      vehicle: null,
      fuelFromAgency: 5000,
      fuelFromDriver: 0,
    });
  });

  it('calcula el cierre con combustible a cargo del conductor', () => {
    const result = service.calculate({
      ...completeInput,
      carOwner: 'driver',
    });

    expect(result.fuelFromAgency).toBe(0);
    expect(result.fuelFromDriver).toBe(5000);
    expect(result.driver).toBe(24400);
  });
});

describe('calculateJourney', () => {
  it('happy path: aplica la misma lógica que el cierre guardado', () => {
    const result = calculateJourney({
      total: 100000,
      agencyPercent: 70,
      driverPercent: 30,
      carRented: false,
      carPercent: null,
      carOwner: 'agency',
      gas: 2000,
      petrol: 3000,
      vouchers: [
        { type: 'factory', trips: 10, pricePerTrip: 1000, fixedFeePerTrip: 800 },
        { type: 'other', trips: 5, pricePerTrip: 500, fixedFeePerTrip: 0 },
      ],
    });

    expect(result).toMatchObject({
      factoryTotal: 10000,
      fixedFeeTotal: 8000,
      otherTotal: 2500,
      adjustedTotal: 98000,
      agencyAmount: 68600,
      driverAmount: 29400,
      carAmount: null,
      fuelFromAgency: 5000,
      fuelFromDriver: 0,
      finalAgency: 53100,
    });
  });

  it('qué pasa si: el vehículo se alquila y el combustible supera el porcentaje', () => {
    const result = calculateJourney({
      total: 100000,
      agencyPercent: 70,
      driverPercent: 20,
      carRented: true,
      carPercent: 10,
      carOwner: null,
      gas: 20000,
      petrol: 0,
      vouchers: [],
    });

    expect(result.carAmount).toBe(0);
    expect(result.fuelFromAgency).toBe(0);
    expect(result.fuelFromDriver).toBe(0);
  });
});

describe('journey verification code', () => {
  it('genera un código de 16 caracteres del alfabeto seguro', () => {
    const code = generateVerificationCode();

    expect(code).toHaveLength(16);
    expect(normalizeVerificationCode(code)).toBe(code);
  });

  it('normaliza minúsculas, espacios y guiones', () => {
    expect(normalizeVerificationCode(' abcd-efgh jkmn-pqrs ')).toBe(
      'ABCDEFGHJKMNPQRS',
    );
  });

  it('qué pasa si: el código es demasiado largo o tiene caracteres inválidos', () => {
    expect(normalizeVerificationCode('A'.repeat(41))).toBeNull();
    expect(normalizeVerificationCode('AAAAAAAAAAAAAAAAI')).toBeNull();
    expect(normalizeVerificationCode('short')).toBeNull();
  });

  it('formatea en grupos de cuatro', () => {
    expect(formatVerificationCode('ABCDEFGHJKMNPQRS')).toBe(
      'ABCD-EFGH-JKMN-PQRS',
    );
  });
});
