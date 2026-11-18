import { Injectable } from '@nestjs/common';
import {
  EVoucherType,
  ICalculationInput,
  ICalculationResult,
  ICalculationVoucher,
  TCalculationCarOwner,
  TCalculationExtraction,
} from '../../shared/ai/calculation.types.js';

// Tolerancia para comparar la suma de porcentajes (evita falsos negativos por decimales).
const PERCENTAGE_TOLERANCE = 0.01;

// Servicio puro y determinista: valida datos y aplica las formulas del cierre.
// Nunca delega la aritmetica al modelo de IA.
@Injectable()
export class CalculationService {
  // Devuelve los campos obligatorios que faltan o son invalidos.
  getMissingFields(input: TCalculationExtraction): string[] {
    const missing: Set<string> = new Set<string>();

    // SI NO ES POSITIVO
    if (!this.isPositiveNumber(input.totalInvoiced)) {
      missing.add('totalInvoiced');
    }
    // SI NO ES UN NEGATIVO
    if (!this.isNonNegativeNumber(input.agencyPercentage)) {
      missing.add('agencyPercentage');
    }
    // SI NO ES UN NEGATIVO
    if (!this.isNonNegativeNumber(input.driverPercentage)) {
      missing.add('driverPercentage');
    }
    // SI ES UN BOOLEAN
    if (typeof input.vehicleRented !== 'boolean') {
      missing.add('vehicleRented');
    }
    // SI NO ES NEGATIVO
    if (!this.isNonNegativeNumber(input.gas)) {
      missing.add('gas');
    }
    if (!this.isNonNegativeNumber(input.fuel)) {
      missing.add('fuel');
    }

    // El porcentaje del vehiculo solo es obligatorio cuando esta alquilado.
    if (input.vehicleRented === true && !this.isNonNegativeNumber(input.vehiclePercentage)) {
      missing.add('vehiclePercentage');
    }

    // Sin vehiculo alquilado hay que saber de quien es el auto (define quien absorbe el combustible).
    if (input.vehicleRented === false && !this.isValidCarOwner(input.carOwner)) {
      missing.add('carOwner');
    }

    // Los vales son obligatorios: una lista vacia significa "no hubo vales".
    if (
      !Array.isArray(input.vouchers) ||
      input.vouchers.some((voucher) => this.getVoucherMissingFields(voucher).length > 0)
    ) {
      missing.add('vouchers');
    }

    const hasNegative = [
      input.agencyPercentage,
      input.driverPercentage,
      input.vehiclePercentage,
    ].some((value) => typeof value === 'number' && value < 0);

    // Lo ya informado nunca puede superar 100; si estan todos, deben sumar 100.
    const knownSum: number = this.getPercentageSum(input);
    const exceeds: boolean = knownSum > 100 + PERCENTAGE_TOLERANCE;

    // Solo se exige suma 100 cuando ya se sabe si hay vehiculo: sin vehiculo, o con su %.
    const allKnown =
      this.isNonNegativeNumber(input.agencyPercentage) &&
      this.isNonNegativeNumber(input.driverPercentage) &&
      (input.vehicleRented === false ||
        (input.vehicleRented === true && this.isNonNegativeNumber(input.vehiclePercentage)));

    if (exceeds || hasNegative || (allKnown && Math.abs(knownSum - 100) > PERCENTAGE_TOLERANCE)) {
      missing.add('percentages');
    }

    // Un porcentaje negativo es invalido, no faltante: ya lo cubre 'percentages'.
    if (hasNegative) {
      missing.delete('agencyPercentage');
      missing.delete('driverPercentage');
      missing.delete('vehiclePercentage');
    }

    // Si ya se paso de 100, pedir el % del vehiculo no tiene sentido.
    if (exceeds) missing.delete('vehiclePercentage');
    return [...missing];
  }

  private isValidCarOwner(value: unknown): value is TCalculationCarOwner {
    return value === 'agency' || value === 'driver';
  }

  withDerivedVehiclePercentage(input: TCalculationExtraction): TCalculationExtraction {
    const { vehicleRented, vehiclePercentage, agencyPercentage, driverPercentage } = input;

    if (
      vehicleRented !== true ||
      vehiclePercentage !== undefined ||
      !this.isNonNegativeNumber(agencyPercentage) ||
      !this.isNonNegativeNumber(driverPercentage)
    ) {
      return input;
    }

    const remainder: number = this.round(100 - agencyPercentage - driverPercentage);
    return remainder > 0 ? { ...input, vehiclePercentage: remainder } : input;
  }

  // Aplica las formulas reales de LiquidChofer sobre datos ya completos.
  calculate(input: ICalculationInput): ICalculationResult {
    const vouchers = input.vouchers ?? [];
    const factoryVouchers = vouchers.filter(
      (voucher) => voucher.type === EVoucherType.FABRICA,
    );
    const otherVouchers = vouchers.filter(
      (voucher) => voucher.type === EVoucherType.OTRO,
    );

    // Subtotales: viajes x precio por viaje (igual que el frontend).
    const factoryVoucherInvoiced = this.sum(
      factoryVouchers.map((voucher) => (voucher.trips ?? 0) * (voucher.pricePerTrip ?? 0)),
    );
    const factoryVoucherFixed = this.sum(
      factoryVouchers.map((voucher) => (voucher.trips ?? 0) * (voucher.fixedFeePerTrip ?? 0)),
    );
    const otherVoucherTotal = this.sum(
      otherVouchers.map((voucher) => (voucher.trips ?? 0) * (voucher.pricePerTrip ?? 0)),
    );

    // 1. Ganancia = facturado - (facturado de fabrica - fijos de planilla).
    const profit = this.round(
      input.totalInvoiced - (factoryVoucherInvoiced - factoryVoucherFixed),
    );

    // Sin alquiler, el combustible lo absorbe el dueño del auto (por defecto la agencia, igual que la jornada guardada).
    const fuelExpenses: number = input.gas + input.fuel;
    const fuelFromAgency: number = !input.vehicleRented && input.carOwner !== 'driver' ? fuelExpenses : 0;
    const fuelFromDriver: number = !input.vehicleRented && input.carOwner === 'driver' ? fuelExpenses : 0;

    // 2. Agencia = ganancia * %agencia - (fijos de fabrica + total de otros) - combustible si el auto es de la agencia.
    const agency = this.round(
      profit * (input.agencyPercentage / 100) -
      (factoryVoucherFixed + otherVoucherTotal) -
      fuelFromAgency,
    );

    // 3. Conductor = ganancia * %conductor - combustible si el auto es del conductor.
    const driver = this.round(profit * (input.driverPercentage / 100) - fuelFromDriver);

    // 4. Vehiculo = max(0, ganancia * %vehiculo - gas - nafta) si esta alquilado.
    const vehicle = input.vehicleRented
      ? this.round(
        Math.max(
          0,
          profit * ((input.vehiclePercentage ?? 0) / 100) -
          input.gas -
          input.fuel,
        ),
      )
      : null;

    return {
      totalInvoiced: this.round(input.totalInvoiced),
      factoryVoucherInvoiced: this.round(factoryVoucherInvoiced),
      factoryVoucherFixed: this.round(factoryVoucherFixed),
      otherVoucherTotal: this.round(otherVoucherTotal),
      profit,
      agency,
      driver,
      vehicle,
      fuelFromAgency: this.round(fuelFromAgency),
      fuelFromDriver: this.round(fuelFromDriver),
    };
  }

  // Campos que le faltan (o son invalidos) a un vale. Lista vacia = vale completo.
  getVoucherMissingFields(voucher: unknown): string[] {
    if (!voucher || typeof voucher !== 'object') {
      return ['type', 'name', 'trips', 'pricePerTrip'];
    }

    const candidate = voucher as ICalculationVoucher;
    const isFactory = candidate.type === EVoucherType.FABRICA;
    const missing: string[] = [];

    if (!isFactory && candidate.type !== EVoucherType.OTRO) missing.push('type');
    if (typeof candidate.name !== 'string' || !candidate.name.trim()) missing.push('name');
    if (!this.isPositiveNumber(candidate.trips)) missing.push('trips');
    if (!this.isNonNegativeNumber(candidate.pricePerTrip)) missing.push('pricePerTrip');
    if (isFactory && !this.isNonNegativeNumber(candidate.fixedFeePerTrip)) {
      missing.push('fixedFeePerTrip');
    }

    return missing;
  }

  private isPositiveNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0;
  }

  // Suma los porcentajes ya informados (el del vehiculo solo si esta alquilado).
  getPercentageSum(input: TCalculationExtraction): number {
    const agency = this.isNonNegativeNumber(input.agencyPercentage) ? input.agencyPercentage : 0;
    const driver = this.isNonNegativeNumber(input.driverPercentage) ? input.driverPercentage : 0;
    const vehicle =
      input.vehicleRented === true && this.isNonNegativeNumber(input.vehiclePercentage)
        ? input.vehiclePercentage
        : 0;

    return this.round(agency + driver + vehicle);
  }

  private isNonNegativeNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0;
  }

  private sum(values: number[]): number {
    return values.reduce((total, value) => total + value, 0);
  }

  // Redondeo monetario a dos decimales en ARS.
  private round(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
