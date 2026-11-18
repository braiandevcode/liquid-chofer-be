import { IsBoolean, IsEnum, IsIn, IsInt, IsOptional, Max, Min, ValidateIf } from 'class-validator';
import { TCarOwner } from '../../journeys/type/TCarOwner.js';

// Entrada de los porcentajes por defecto. La suma a 100 la valida el servicio.
export class UpdateSettingsDto {
  @IsInt({ message: 'El % de agencia debe ser un entero.' })
  @Min(0, { message: 'El % de agencia no puede ser negativo.' })
  @Max(100, { message: 'El % de agencia no puede superar 100.' })
  readonly defaultAgencyPercent!: number;

  @IsInt({ message: 'El % del conductor debe ser un entero.' })
  @Min(0, { message: 'El % del conductor no puede ser negativo.' })
  @Max(100, { message: 'El % del conductor no puede superar 100.' })
  readonly defaultDriverPercent!: number;

  @IsBoolean({ message: 'El campo de alquiler debe ser verdadero o falso.' })
  readonly defaultCarRented!: boolean;

  @IsOptional()
  @IsIn(['agency', 'driver'], { message: 'El propietario del auto debe ser agency, driver.' })
  readonly defaultCarOwner?: TCarOwner | null;

  // Solo se valida si viene un valor; si el auto no se alquila puede ser null u omitirse.
  @IsOptional()
  @ValidateIf((o: UpdateSettingsDto) => o.defaultCarPercent !== null)
  @IsInt({ message: 'El % del vehículo debe ser un entero.' })
  @Min(0, { message: 'El % del vehículo no puede ser negativo.' })
  @Max(100, { message: 'El % del vehículo no puede superar 100.' })
  readonly defaultCarPercent?: number | null;
}