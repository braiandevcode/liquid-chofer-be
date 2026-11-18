import { Transform } from 'class-transformer';
import { IsString, Length, Matches } from 'class-validator';

// Entrada de edicion de perfil: solo el nombre visible.
export class UpdateProfileDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'El nombre debe ser texto.' })
  @Length(2, 50, { message: 'El nombre debe tener entre 2 y 50 caracteres.' })
  @Matches(/^[^<>]*$/, { message: 'El nombre contiene caracteres no permitidos.' })
  readonly displayName!: string;
}