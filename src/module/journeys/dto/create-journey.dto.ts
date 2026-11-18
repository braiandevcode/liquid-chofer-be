import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { type TCarOwner } from '../type/TCarOwner.js';

// Vale de la jornada (mismos limites que voucherTripSchema del frontend).
export class JourneyVoucherDto {
  @IsIn(['factory', 'other'], { message: 'El tipo de vale debe ser factory u other.' })
  readonly type!: 'factory' | 'other';

  @IsString()
  @MinLength(1, { message: 'Ingresá un nombre para el vale.' })
  @MaxLength(40, { message: 'El nombre del vale es muy largo.' })
  readonly name!: string;

  @IsInt({ message: 'Los viajes deben ser un número entero.' })
  @Min(0)
  @Max(99, { message: 'Máximo 99 viajes.' })
  readonly trips!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999999, { message: 'Precio muy alto.' })
  readonly pricePerTrip!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999999, { message: 'Descuento muy alto.' })
  readonly fixedFeePerTrip!: number;
}

export class CreateJourneyDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha debe tener formato AAAA-MM-DD.' })
  readonly journeyDate!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0, { message: 'El total no puede ser negativo.' })
  @Max(999999999, { message: 'El total es demasiado alto.' })
  readonly total!: number;

  @IsInt() @Min(0) @Max(100)
  readonly agencyPercent!: number;

  @IsInt() @Min(0) @Max(100)
  readonly driverPercent!: number;

  @IsBoolean()
  readonly carRented!: boolean;

  @IsOptional()
  @ValidateIf((o: CreateJourneyDto) => o.carPercent !== null)
  @IsInt() @Min(0) @Max(100)
  readonly carPercent?: number | null;

  @IsIn(['agency', 'driver', null], { message: 'ErrorType: CarOwnerNotMissing. El propietario del auto debe ser agency, driver o nulo.' })
  readonly carOwner?: TCarOwner | null;

  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(999999999)
  readonly gas!: number;

  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(999999999)
  readonly petrol!: number;

  @IsArray()
  @ArrayMaxSize(50, { message: 'Máximo 50 vales por jornada.' })
  @ValidateNested({ each: true })
  @Type(() => JourneyVoucherDto)
  readonly vouchers!: JourneyVoucherDto[];

  @IsOptional()
  @IsBoolean()
  readonly replaceExisting?: boolean;
}