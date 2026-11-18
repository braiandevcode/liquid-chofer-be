// Contratos del calculo de cierre de jornada.
// La IA solo extrae estos datos; el backend valida y calcula de forma determinista.

// Tipo de vale: los de fabrica tienen precio de planilla y facturado propio.
export enum EVoucherType {
  FABRICA = 'fabrica',
  OTRO = 'otro',
}

// Dueño del auto cuando NO es alquilado: define quien absorbe el combustible.
export type TCalculationCarOwner = 'agency' | 'driver';

// Un vale del dia. Los precios son POR VIAJE; el backend calcula los subtotales.
// Todo es opcional porque la IA puede extraer un vale incompleto:
// getMissingFields exige que este completo antes de calcular.
export interface ICalculationVoucher {
  type?: EVoucherType;
  name?: string;
  trips?: number;
  pricePerTrip?: number;
  fixedFeePerTrip?: number;
}

// Datos necesarios para calcular el reparto de la jornada.
export interface ICalculationInput {
  totalInvoiced: number;
  vouchers: ICalculationVoucher[];
  agencyPercentage: number;
  driverPercentage: number;
  vehicleRented: boolean;
  vehiclePercentage?: number;
  carOwner?: TCalculationCarOwner;
  gas: number;
  fuel: number;
}

// Resultado que el frontend usa para la vista previa, descarga o compartir.
export interface ICalculationResult {
  totalInvoiced: number;
  factoryVoucherInvoiced: number;
  factoryVoucherFixed: number;
  otherVoucherTotal: number;
  profit: number;
  agency: number;
  driver: number;
  vehicle: number | null;
  fuelFromAgency: number;
  fuelFromDriver: number;
}

// Estado del calculo dentro de la conversacion.
export type TCalculationStatus = 'needs_data' | 'offer' | 'completed';

// Claves canonicas de datos del cierre; se usan para faltantes y datos confusos.
export type TCalculationFieldKey =
  | 'totalInvoiced'
  | 'vouchers'
  | 'agencyPercentage'
  | 'driverPercentage'
  | 'vehicleRented'
  | 'vehiclePercentage'
  | 'gas'
  | 'fuel'
  | 'percentages'
  | 'carOwner'

// Lista de claves validas para filtrar lo que devuelve el modelo.
export const CALCULATION_FIELD_KEYS: readonly TCalculationFieldKey[] = [
  'totalInvoiced',
  'vouchers',
  'agencyPercentage',
  'driverPercentage',
  'vehicleRented',
  'vehiclePercentage',
  'gas',
  'fuel',
  'percentages',
  'carOwner'
];

// Extraccion parcial que devuelve el tool de la IA (todos los campos opcionales).
export type TCalculationExtraction = Partial<ICalculationInput>;

// Contrato que se expone al frontend junto a cada mensaje del asistente.
export interface ICalculationState {
  id: string;
  status: TCalculationStatus;
  missingFields: string[];
  input: Partial<ICalculationInput>;
  result?: ICalculationResult;
  updatedAt: Date;
}
