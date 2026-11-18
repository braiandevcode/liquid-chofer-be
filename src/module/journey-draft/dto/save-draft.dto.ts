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
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { type TCarOwner } from '../../journeys/type/TCarOwner.js';

// Vale del borrador (mismos campos que IVoucherTrip del frontend).
export class DraftVoucherDto {
  @IsString() @MaxLength(80)
  readonly id!: string;

  @IsIn(['factory', 'other'])
  readonly type!: 'factory' | 'other';

  @IsString() @MaxLength(40)
  readonly name!: string;

  @IsInt() @Min(0) @Max(99)
  readonly trips!: number;

  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(999999)
  readonly pricePerTrip!: number;

  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(999999)
  readonly fixedFeePerTrip!: number;

  @IsOptional() @IsBoolean()
  readonly saved?: boolean;

  @IsOptional() @IsBoolean()
  readonly editing?: boolean;
}

// Borrador completo de la calculadora (ICalculatorState del frontend).
export class SaveDraftDto {
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(999999999)
  readonly total!: number;

  @IsInt() @Min(0) @Max(100)
  readonly agencyPercent!: number;

  @IsInt() @Min(0) @Max(100)
  readonly driverPercent!: number;

  @IsInt() @Min(0) @Max(100)
  readonly carPercent!: number;

  @IsBoolean()
  readonly carRented!: boolean;

  @IsOptional()
  @IsIn(['agency', 'driver'],{ message: 'El propietario del auto debe ser agency, driver.' })
  readonly carOwner?: TCarOwner;

  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(999999999)
  readonly gas!: number;

  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(999999999)
  readonly petrol!: number;

  @IsBoolean()
  readonly showVouchers!: boolean;

  @IsOptional() @IsBoolean()
  readonly calculated?: boolean;

  @IsArray()
  @ArrayMaxSize(50, { message: 'Máximo 50 vales.' })
  @ValidateNested({ each: true })
  @Type(() => DraftVoucherDto)
  readonly vouchers!: DraftVoucherDto[];
}