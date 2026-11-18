import { Global, Module } from '@nestjs/common';
import { JwtHelper } from '../../shared/auth/jwt.helper.js';

// Modulo global que expone JwtHelper para firmar/verificar sesiones.
@Global()
@Module({
  providers: [JwtHelper],
  exports: [JwtHelper],
})
export class AuthTokenModule {}
