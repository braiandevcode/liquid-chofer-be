import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

// Paginacion de la lista (por defecto 50 por pagina).
export class ListJourneysQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  readonly limit?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  readonly offset?: number;
}