import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf
} from 'class-validator';

// Entrada del chat dinamico con la IA. conversationId es opcional: si llega,
// se reutiliza; si no, se crea una conversacion nueva de 24 horas.
// imagesData es opcional: data URL base64 de imagenes adjuntas (ej: comprobante).
export class ChatDto {
  @ValidateIf(
    (o: ChatDto) =>
      !o.confirmCalculation && (!o.imagesData?.length || !!o.message),
  )
  @IsString()
  @MinLength(1, { message: 'El mensaje no puede estar vacío.' })
  @MaxLength(2000, { message: 'El mensaje es demasiado largo.' })
  @Matches(/\S/, { message: 'El mensaje no puede contener solo espacios.' })
  readonly message?: string;

  @IsOptional()
  @IsString()
  @IsUUID('4', { message: 'conversationId debe ser un UUID válido.' })
  readonly conversationId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3, { message: 'Puedes adjuntar hasta 3 imágenes.' })
  @Matches(/^data:image\/jpeg;base64,/, {
    each: true,
    message: 'Cada imagen debe ser un JPEG en base64.',
  })

  @MaxLength(10_000_000, {
    each: true,
    message: 'Una de las imágenes es demasiado grande.',
  })
  readonly imagesData?: string[];

  // El frontend lo envia cuando el usuario acepta calcular el cierre.
  @IsOptional()
  @IsBoolean()
  readonly confirmCalculation?: boolean;
}
