import { TCarOwner } from "./type/TCarOwner.js";

// Entrada del calculo: replica los campos que usa calculateResult del frontend.
export interface IJourneyVoucherInput {
  type: 'factory' | 'other';
  trips: number;
  pricePerTrip: number;
  fixedFeePerTrip: number;
}

export interface IJourneyCalcInput {
  total: number;
  agencyPercent: number;
  driverPercent: number;
  carRented: boolean;
  carPercent: number | null;
  gas: number;
  petrol: number;
  vouchers: IJourneyVoucherInput[];
  carOwner?: TCarOwner | null;
}

export interface IJourneyCalcResult {
  factoryTotal: number;
  fixedFeeTotal: number;
  otherTotal: number;
  adjustedTotal: number;
  agencyAmount: number;
  driverAmount: number;
  carAmount: number | null;
  finalAgency: number;
  fuelFromAgency: number;
  fuelFromDriver: number;
}

// Redondeo monetario a dos decimales.
const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

const sum = (values: number[]): number => values.reduce((acc, v) => acc + v, 0);

// FUNCION PURA: calculateResult, con redondeo al final.
export const calculateJourney = (input: IJourneyCalcInput): IJourneyCalcResult => {
  const ONE_HUNDRED: number = 100;
  const factory = input.vouchers.filter((v) => v.type === 'factory');
  const other = input.vouchers.filter((v) => v.type === 'other');

  const factoryTotal: number = sum(factory.map((v) => v.trips * v.pricePerTrip));
  const fixedFeeTotal: number = sum(factory.map((v) => v.trips * v.fixedFeePerTrip));
  const otherTotal: number = sum(other.map((v) => v.trips * v.pricePerTrip));

  const adjustedTotal: number = input.total - (factoryTotal - fixedFeeTotal);
  const agencyAmount: number = adjustedTotal * (input.agencyPercent / ONE_HUNDRED);

  let driverAmount: number = adjustedTotal * (input.driverPercent / ONE_HUNDRED)

  const carAmount: number | null = input.carRented
    ? Math.max(0, adjustedTotal * ((input.carPercent ?? 0) / ONE_HUNDRED) - (input.gas + input.petrol))
    : null;


  const deduction: number = fixedFeeTotal + otherTotal;

  const fuelExpenses: number = input.gas + input.petrol;
  const fuelFromAgency: number = !input.carRented && input.carOwner !== 'driver' ? fuelExpenses : 0;
  const fuelFromDriver: number = !input.carRented && input.carOwner === 'driver' ? fuelExpenses : 0;

  let finalAgency: number = agencyAmount - deduction - fuelFromAgency;

  driverAmount -= fuelFromDriver

  return {
    factoryTotal: round2(factoryTotal),
    fixedFeeTotal: round2(fixedFeeTotal),
    otherTotal: round2(otherTotal),
    adjustedTotal: round2(adjustedTotal),
    agencyAmount: round2(agencyAmount),
    driverAmount: round2(driverAmount),
    carAmount: carAmount === null ? null : round2(carAmount),
    fuelFromAgency: round2(fuelFromAgency),
    fuelFromDriver: round2(fuelFromDriver),
    finalAgency: round2(finalAgency),
  };
};