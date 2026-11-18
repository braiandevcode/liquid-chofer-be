import { IsJWT, IsString, MaxLength, MinLength } from 'class-validator';

// Entrada del login: el frontend ya autentico contra Firebase y envia el
// ID token generado por el SDK para que el backend lo verifique.
export class LoginDto {
  @IsString()
  @MinLength(20, {
    message: 'El ID token de Firebase parece inválido.',
  })
  @MaxLength(8192, {
    message: 'El ID token de Firebase es demasiado largo.',
  })
  @IsJWT({ message: 'El ID token de Firebase no tiene formato JWT.' })
  readonly idToken!: string;
}
