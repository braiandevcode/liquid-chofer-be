import type { ValueTransformer } from 'typeorm';

// MySQL devuelve DECIMAL como string; lo convierto a number al leer.
export const decimalTransformer: ValueTransformer = {
  to: (value: number | null | undefined) => value,
  from: (value: string | null) => (value === null ? null : Number(value)),
};