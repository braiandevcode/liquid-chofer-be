import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import jwt from 'jsonwebtoken';
import { JwtHelper } from '../src/shared/auth/jwt.helper.js';

const SECRET = 'test-only-secret-not-a-real-credential';

const makeHelper = () => {
  const config = {
    getOrThrow: vi.fn((key: string) =>
      key === 'JWT_SECRET' ? SECRET : '604800000',
    ),
    get: vi.fn((key: string) =>
      key === 'JWT_ACCESS_EXPIRES_IN' ? '15m' : '7d',
    ),
  } as unknown as ConfigService;
  return new JwtHelper(config);
};

describe('JwtHelper', () => {
  it('happy path: firma y verifica un payload completo', () => {
    const helper = makeHelper();
    const payload = {
      sub: 'user-1',
      firebaseUid: 'firebase-1',
      email: 'user@test.com',
    };

    const token = helper.signAccess(payload);

    expect(helper.verify(token)).toEqual(payload);
    expect(jwt.decode(token)).toMatchObject(payload);
  });

  it('qué pasa si: el token está modificado', () => {
    const helper = makeHelper();
    const token = `${helper.signAccess({
      sub: 'user-1',
      firebaseUid: 'firebase-1',
      email: 'user@test.com',
    })}x`;

    expect(() => helper.verify(token)).toThrow(UnauthorizedException);
  });

  it('qué pasa si: el token fue firmado con otro secreto', () => {
    const helper = makeHelper();
    const token = jwt.sign(
      { sub: 'user-1', firebaseUid: 'firebase-1', email: 'user@test.com' },
      'otro-secreto',
    );

    expect(() => helper.verify(token)).toThrow(UnauthorizedException);
  });

  it('qué pasa si: el payload no tiene los campos obligatorios', () => {
    const helper = makeHelper();
    const token = jwt.sign({ sub: 'user-1', email: 'user@test.com' }, SECRET);

    expect(() => helper.verify(token)).toThrow(UnauthorizedException);
  });

  it('qué pasa si: el token usa otro algoritmo (HS512)', () => {
    const helper = makeHelper();
    const token = jwt.sign(
      { sub: 'user-1', firebaseUid: 'firebase-1', email: 'user@test.com' },
      SECRET,
      { algorithm: 'HS512' },
    );

    expect(() => helper.verify(token)).toThrow(UnauthorizedException);
  });
});
