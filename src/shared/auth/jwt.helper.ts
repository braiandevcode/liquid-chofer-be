import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// jsonwebtoken es CommonJS: bajo ESM (nodenext) uso el default export.
import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';

// Contrato del payload que firmamos y guardamos en la cookie HTTP-ONLY.
export interface IJwtPayload {
  sub: string;
  firebaseUid: string;
  email: string;
}

// Nombre de la cookie donde vivira el token de sesion (HTTP-ONLY).
export const AUTH_COOKIE_NAME:string = 'lqc_sid';

@Injectable()
export class JwtHelper {
  // Secreto firmador cargado una unica vez.
  private readonly secret: string;
  private readonly expiresIn: string;

  constructor(private readonly configService: ConfigService) {
    this.secret = this.configService.getOrThrow<string>('JWT_SECRET');
    this.expiresIn = this.configService.get<string>('JWT_EXPIRES_IN') ?? '7d';
  }

  // Firma un token de acceso con ttl corto (por defecto 15m).
  signAccess(payload: IJwtPayload): string {
    const accessExpiresIn = this.configService.get<string>('JWT_ACCESS_EXPIRES_IN') ?? '15m';
    const options: SignOptions = {
      algorithm: 'HS256',
      expiresIn: accessExpiresIn as SignOptions['expiresIn'],
    };
    return jwt.sign(payload, this.secret, options);
  }

  // Verifica y devuelve el payload; si es invalido lanza 401.
  verify(token: string): IJwtPayload {
    try {
      const payload: string | jwt.JwtPayload = jwt.verify(token, this.secret, {
        algorithms: ['HS256'],
      });
      if (
        typeof payload === 'string' ||
        typeof payload.sub !== 'string' ||
        typeof payload.firebaseUid !== 'string' ||
        typeof payload.email !== 'string'
      ) {
        throw new Error('Payload inválido');
      }

      return {
        sub: payload.sub,
        firebaseUid: payload.firebaseUid,
        email: payload.email,
      };
    } catch {
      throw new UnauthorizedException('Sesión inválida o expirada.');
    }
  }
}
