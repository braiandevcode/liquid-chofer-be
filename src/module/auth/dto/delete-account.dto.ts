import { IsJWT, IsString, MaxLength, MinLength } from 'class-validator';

// Entrada de eliminar cuenta: ID token recien emitido tras reautenticar.
export class DeleteAccountDto {
  @IsString()
  @MinLength(20)
  @MaxLength(8192)
  @IsJWT()
  readonly idToken!: string;
}