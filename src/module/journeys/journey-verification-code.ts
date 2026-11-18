import { randomInt } from 'node:crypto';

// 32 simbolos sin I, L, O, U: 32^16 = 2^80 COMBINACIONES.
const ALPHABET: string = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_LENGTH: number = 16;
const CODE_PATTERN: RegExp = /^[0-9A-HJKMNP-TV-Z]{16}$/;

// USA EL GENERADOR CRIPTOGRAFICO DEL SISTEMA (SIN SESGO)
export const generateVerificationCode = (): string => Array.from({ length: CODE_LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');

export const normalizeVerificationCode = (raw: string): string | null => {
  if (raw.length > 40) return null;
  const clean: string = raw.toUpperCase().replace(/[\s-]/g, '');
  return CODE_PATTERN.test(clean) ? clean : null;
};

// XXXX-XXXX-XXXX-XXXX MOSTRAR.
export const formatVerificationCode = (code: string): string =>
  code.match(/.{4}/g)?.join('-') ?? code;